package api

import (
	"database/sql"
	"net/http"
	"strconv"
	"strings"
	"time"

	"otklik/internal/auth"
)

func (s *Server) expertCanAccess(staffID, ticketID int64) bool {
	var n int
	s.DB.QueryRow(`SELECT count(*) FROM tickets t
		LEFT JOIN ticket_participants p ON p.ticket_id=t.id AND p.staff_id=$1
		WHERE t.id=$2 AND (t.assigned_expert_id=$1 OR p.staff_id=$1)`, staffID, ticketID).Scan(&n)
	return n > 0
}

func (s *Server) staffVoice(staffID int64) string {
	var v sql.NullString
	s.DB.QueryRow(`SELECT voice_label FROM staff WHERE id=$1`, staffID).Scan(&v)
	if v.Valid && v.String != "" {
		return v.String
	}
	return "Специалист"
}

// GET /api/expert/tickets?status=&priority=&category_id=
func (s *Server) handleExpertTickets(w http.ResponseWriter, r *http.Request) {
	c, _ := auth.FromContext(r.Context())
	q := `
		SELECT t.id, t.applicant_type, t.status, t.priority, t.is_crisis, t.updated_at, t.created_at, cat.title,
		       (t.assigned_expert_id=$1) AS responsible
		FROM tickets t
		LEFT JOIN categories cat ON cat.id=t.category_id
		WHERE (t.assigned_expert_id=$1
		       OR EXISTS (SELECT 1 FROM ticket_participants p WHERE p.ticket_id=t.id AND p.staff_id=$1))`
	args := []interface{}{c.StaffID}
	if v := r.URL.Query().Get("status"); v != "" {
		args = append(args, v)
		q += " AND t.status=$2"
	}
	if v := r.URL.Query().Get("priority"); v != "" {
		args = append(args, v)
		q += " AND t.priority=$" + itoa(len(args))
	}
	if v := r.URL.Query().Get("category_id"); v != "" {
		args = append(args, v)
		q += " AND t.category_id=$" + itoa(len(args))
	}
	q += ` ORDER BY t.is_crisis DESC,
	        CASE t.priority WHEN 'urgent' THEN 0 WHEN 'standard' THEN 1 ELSE 2 END,
	        t.updated_at DESC`
	rows, err := s.DB.Query(q, args...)
	if err != nil {
		writeErr(w, 500, "ошибка загрузки")
		return
	}
	defer rows.Close()
	list := []map[string]interface{}{}
	for rows.Next() {
		var id int64
		var atype, status, priority string
		var crisis, resp bool
		var upd, cr time.Time
		var cat sql.NullString
		rows.Scan(&id, &atype, &status, &priority, &crisis, &upd, &cr, &cat, &resp)
		list = append(list, map[string]interface{}{
			"id": id, "applicant_type": atype, "status": status, "status_ru": StatusRU[status],
			"priority": priority, "is_crisis": crisis, "category": nsToPtr(cat),
			"responsible": resp, "updated_at": upd, "created_at": cr,
		})
	}
	writeJSON(w, 200, list)
}

// GET /api/expert/tickets/{id}
func (s *Server) handleExpertTicket(w http.ResponseWriter, r *http.Request) {
	c, _ := auth.FromContext(r.Context())
	id, _ := pathID(r, "id")
	if !s.expertCanAccess(c.StaffID, id) {
		writeErr(w, 403, "обращение вам не назначено")
		return
	}
	t, ok := s.ticketByID(id)
	if !ok {
		writeErr(w, 404, "не найдено")
		return
	}

	// обновляем присутствие
	s.DB.Exec(`INSERT INTO ticket_presence (ticket_id, staff_id, seen_at) VALUES ($1,$2,now())
		ON CONFLICT (ticket_id, staff_id) DO UPDATE SET seen_at=now()`, id, c.StaffID)

	var responsible bool
	s.DB.QueryRow(`SELECT assigned_expert_id=$1 FROM tickets WHERE id=$2`, c.StaffID, id).Scan(&responsible)

	view := map[string]interface{}{
		"id": t.ID, "applicant_type": t.ApplicantType, "status": t.Status, "status_ru": StatusRU[t.Status],
		"priority": t.Priority, "is_crisis": t.IsCrisis, "return_count": t.ReturnCount,
		"free_text": t.FreeText, "clarifying_answers": clarifyingJSON(t.ClarifyingAnswers),
		"category": ptrTitle(s, t.CategoryID),
		"attachments": s.attachmentsOf(t.ID),
		"messages": s.chatOf(t.ID),
		"notes": s.notesOf(t.ID),
		"participants": s.participantsOf(t.ID),
		"presence": s.presenceOf(t.ID, c.StaffID),
		"responsible": responsible,
		"created_at": t.CreatedAt,
		"rating": t.Rating,
	}
	writeJSON(w, 200, view)
}

// POST /api/expert/tickets/{id}/take
func (s *Server) handleExpertTake(w http.ResponseWriter, r *http.Request) {
	c, _ := auth.FromContext(r.Context())
	id, _ := pathID(r, "id")
	if !s.expertCanAccess(c.StaffID, id) {
		writeErr(w, 403, "нет доступа")
		return
	}
	s.DB.Exec(`UPDATE tickets SET status='in_progress', updated_at=now() WHERE id=$1 AND status IN ('distributed','returned')`, id)
	s.audit(id, &c.StaffID, "expert", "take", "эксперт взял в работу")
	writeJSON(w, 200, map[string]string{"status": "in_progress"})
}

// POST /api/expert/tickets/{id}/message {body, action: reply|ask|answer}
func (s *Server) handleExpertMessage(w http.ResponseWriter, r *http.Request) {
	c, _ := auth.FromContext(r.Context())
	id, _ := pathID(r, "id")
	if !s.expertCanAccess(c.StaffID, id) {
		writeErr(w, 403, "нет доступа")
		return
	}
	var b struct {
		Body   string `json:"body"`
		Action string `json:"action"`
	}
	if err := readJSON(r, &b); err != nil || strings.TrimSpace(b.Body) == "" {
		writeErr(w, 400, "напишите сообщение")
		return
	}
	voice := s.staffVoice(c.StaffID)
	s.DB.Exec(`INSERT INTO messages (ticket_id, author_kind, author_staff_id, voice_label, body) VALUES ($1,'specialist',$2,$3,$4)`,
		id, c.StaffID, voice, strings.TrimSpace(b.Body))
	s.DB.Exec(`UPDATE tickets SET first_response_at=COALESCE(first_response_at, now()), updated_at=now() WHERE id=$1`, id)
	var note string
	switch b.Action {
	case "ask":
		s.setStatus(id, "need_clarification", &c.StaffID, "expert", "задан уточняющий вопрос")
		note = "Специалист задал вопрос — посмотрите, пожалуйста"
	case "answer":
		s.setStatus(id, "answer_ready", &c.StaffID, "expert", "подготовлены рекомендации")
		note = "Готовы рекомендации по вашему обращению"
	default:
		// обычное сообщение: если было ожидание — в работу
		s.DB.Exec(`UPDATE tickets SET status='in_progress' WHERE id=$1 AND status IN ('distributed','need_clarification','returned')`, id)
		note = "Специалист ответил в вашем обращении"
	}
	s.notify(id, "update")
	go s.pushToTicket(id, pushJSON(note))
	writeJSON(w, 200, map[string]string{"ok": "1"})
}

// POST /api/expert/tickets/{id}/note {body}
func (s *Server) handleExpertNote(w http.ResponseWriter, r *http.Request) {
	c, _ := auth.FromContext(r.Context())
	id, _ := pathID(r, "id")
	if !s.expertCanAccess(c.StaffID, id) {
		writeErr(w, 403, "нет доступа")
		return
	}
	var b struct {
		Body string `json:"body"`
	}
	if err := readJSON(r, &b); err != nil || strings.TrimSpace(b.Body) == "" {
		writeErr(w, 400, "пустая заметка")
		return
	}
	s.DB.Exec(`INSERT INTO internal_notes (ticket_id, author_staff_id, author_name, body) VALUES ($1,$2,$3,$4)`,
		id, c.StaffID, c.Name, strings.TrimSpace(b.Body))
	writeJSON(w, 200, map[string]string{"ok": "1"})
}

// POST /api/expert/tickets/{id}/transfer {reason}
func (s *Server) handleExpertTransfer(w http.ResponseWriter, r *http.Request) {
	c, _ := auth.FromContext(r.Context())
	id, _ := pathID(r, "id")
	if !s.expertCanAccess(c.StaffID, id) {
		writeErr(w, 403, "нет доступа")
		return
	}
	var b struct {
		Reason string `json:"reason"`
	}
	if err := readJSON(r, &b); err != nil || strings.TrimSpace(b.Reason) == "" {
		writeErr(w, 400, "укажите причину передачи")
		return
	}
	s.DB.Exec(`INSERT INTO transfers (ticket_id, requested_by, reason, from_expert_id) VALUES ($1,$2,$3,$2)`,
		id, c.StaffID, strings.TrimSpace(b.Reason))
	s.audit(id, &c.StaffID, "expert", "transfer_request", b.Reason)
	writeJSON(w, 200, map[string]string{"ok": "1"})
}

// POST /api/expert/tickets/{id}/collaborator {staff_id}
func (s *Server) handleExpertCollaborator(w http.ResponseWriter, r *http.Request) {
	c, _ := auth.FromContext(r.Context())
	id, _ := pathID(r, "id")
	if !s.expertCanAccess(c.StaffID, id) {
		writeErr(w, 403, "нет доступа")
		return
	}
	var b struct {
		StaffID int64 `json:"staff_id"`
	}
	if err := readJSON(r, &b); err != nil {
		writeErr(w, 400, "некорректный запрос")
		return
	}
	s.DB.Exec(`INSERT INTO ticket_participants (ticket_id, staff_id, role_in_ticket) VALUES ($1,$2,'collaborator')
		ON CONFLICT (ticket_id, staff_id) DO NOTHING`, id, b.StaffID)
	s.audit(id, &c.StaffID, "expert", "add_collaborator", "подключён соисполнитель")
	writeJSON(w, 200, map[string]string{"ok": "1"})
}

// POST /api/expert/tickets/{id}/presence — heartbeat присутствия
func (s *Server) handleExpertPresence(w http.ResponseWriter, r *http.Request) {
	c, _ := auth.FromContext(r.Context())
	id, _ := pathID(r, "id")
	if !s.expertCanAccess(c.StaffID, id) {
		writeErr(w, 403, "нет доступа")
		return
	}
	s.DB.Exec(`INSERT INTO ticket_presence (ticket_id, staff_id, seen_at) VALUES ($1,$2,now())
		ON CONFLICT (ticket_id, staff_id) DO UPDATE SET seen_at=now()`, id, c.StaffID)
	writeJSON(w, 200, map[string]interface{}{"presence": s.presenceOf(id, c.StaffID)})
}

// GET /api/expert/colleagues
func (s *Server) handleExpertColleagues(w http.ResponseWriter, r *http.Request) {
	writeJSON(w, 200, s.expertsWithLoad(""))
}

// --- сборка частей карточки ---

func (s *Server) chatOf(ticketID int64) []map[string]interface{} {
	out := []map[string]interface{}{}
	rows, _ := s.DB.Query(`SELECT author_kind, COALESCE(voice_label,''), body, created_at FROM messages WHERE ticket_id=$1 ORDER BY created_at`, ticketID)
	if rows == nil {
		return out
	}
	defer rows.Close()
	for rows.Next() {
		var kind, voice, body string
		var at time.Time
		rows.Scan(&kind, &voice, &body, &at)
		out = append(out, map[string]interface{}{"kind": kind, "voice": voice, "body": body, "at": at})
	}
	return out
}

func (s *Server) notesOf(ticketID int64) []map[string]interface{} {
	out := []map[string]interface{}{}
	rows, _ := s.DB.Query(`SELECT COALESCE(author_name,''), body, created_at FROM internal_notes WHERE ticket_id=$1 ORDER BY created_at`, ticketID)
	if rows == nil {
		return out
	}
	defer rows.Close()
	for rows.Next() {
		var name, body string
		var at time.Time
		rows.Scan(&name, &body, &at)
		out = append(out, map[string]interface{}{"author": name, "body": body, "at": at})
	}
	return out
}

func (s *Server) participantsOf(ticketID int64) []map[string]interface{} {
	out := []map[string]interface{}{}
	rows, _ := s.DB.Query(`SELECT st.display_name, COALESCE(st.voice_label,''), p.role_in_ticket
		FROM ticket_participants p JOIN staff st ON st.id=p.staff_id WHERE p.ticket_id=$1 ORDER BY p.role_in_ticket DESC`, ticketID)
	if rows == nil {
		return out
	}
	defer rows.Close()
	for rows.Next() {
		var name, voice, role string
		rows.Scan(&name, &voice, &role)
		out = append(out, map[string]interface{}{"name": name, "voice": voice, "role": role})
	}
	return out
}

// presenceOf — кто из специалистов был активен в последние 60 секунд (кроме себя).
func (s *Server) presenceOf(ticketID, selfID int64) []map[string]interface{} {
	out := []map[string]interface{}{}
	rows, _ := s.DB.Query(`SELECT st.display_name FROM ticket_presence pr JOIN staff st ON st.id=pr.staff_id
		WHERE pr.ticket_id=$1 AND pr.staff_id<>$2 AND pr.seen_at > now() - interval '60 seconds'`, ticketID, selfID)
	if rows == nil {
		return out
	}
	defer rows.Close()
	for rows.Next() {
		var name string
		rows.Scan(&name)
		out = append(out, map[string]interface{}{"name": name})
	}
	return out
}

func ptrTitle(s *Server, id *int64) *string {
	if id == nil {
		return nil
	}
	return s.categoryTitle(*id)
}

func itoa(n int) string {
	return strconv.Itoa(n)
}
