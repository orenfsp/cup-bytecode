package api

import (
	"database/sql"
	"net/http"
	"time"

	"otklik/internal/auth"
)

// активные статусы для расчёта нагрузки
const activeStatuses = `('distributed','in_progress','need_clarification','answer_ready')`

// GET /api/operator/queue — новые и возвращённые, кризис/срочные сверху, старые выше.
func (s *Server) handleOperatorQueue(w http.ResponseWriter, r *http.Request) {
	rows, err := s.DB.Query(`
		SELECT t.id, t.applicant_type, t.status, t.priority, t.is_crisis, t.return_count, t.created_at,
		       c.title, sc.title, sc.id
		FROM tickets t
		LEFT JOIN categories c  ON c.id = t.category_id
		LEFT JOIN categories sc ON sc.id = t.suggested_category_id
		WHERE t.status IN ('new','returned')
		ORDER BY t.is_crisis DESC,
		         CASE t.priority WHEN 'urgent' THEN 0 WHEN 'standard' THEN 1 ELSE 2 END,
		         t.created_at ASC`)
	if err != nil {
		writeErr(w, 500, "ошибка загрузки очереди")
		return
	}
	defer rows.Close()

	list := []map[string]interface{}{}
	overdue := 0
	for rows.Next() {
		var id int64
		var at time.Time
		var atype, status, priority string
		var crisis bool
		var rc int
		var cat, scat sql.NullString
		var scatID sql.NullInt64
		rows.Scan(&id, &atype, &status, &priority, &crisis, &rc, &at, &cat, &scat, &scatID)
		wait := int(time.Since(at).Minutes())
		if wait > 120 { // просрочка > N часов (N=2)
			overdue++
		}
		list = append(list, map[string]interface{}{
			"id": id, "applicant_type": atype, "status": status, "status_ru": StatusRU[status],
			"priority": priority, "is_crisis": crisis, "return_count": rc,
			"created_at": at, "waiting_minutes": wait,
			"category": nsToPtr(cat), "suggested_category": nsToPtr(scat), "suggested_category_id": niToPtr(scatID),
		})
	}
	writeJSON(w, 200, map[string]interface{}{"tickets": list, "overdue": overdue})
}

// GET /api/operator/distributed — распределённые обращения со статусами и отметкой «зависшие» (без текста переписки).
func (s *Server) handleOperatorDistributed(w http.ResponseWriter, r *http.Request) {
	rows, err := s.DB.Query(`
		SELECT t.id, t.applicant_type, t.status, t.priority, t.is_crisis, t.updated_at, t.created_at,
		       c.title, st.display_name
		FROM tickets t
		LEFT JOIN categories c ON c.id=t.category_id
		LEFT JOIN staff st ON st.id=t.assigned_expert_id
		WHERE t.status IN ('distributed','in_progress','need_clarification','answer_ready')
		ORDER BY t.updated_at ASC`)
	if err != nil {
		writeErr(w, 500, "ошибка загрузки")
		return
	}
	defer rows.Close()
	list := []map[string]interface{}{}
	for rows.Next() {
		var id int64
		var upd, cr time.Time
		var atype, status, priority string
		var crisis bool
		var cat, expert sql.NullString
		rows.Scan(&id, &atype, &status, &priority, &crisis, &upd, &cr, &cat, &expert)
		stalled := time.Since(upd) > 12*time.Hour
		list = append(list, map[string]interface{}{
			"id": id, "applicant_type": atype, "status": status, "status_ru": StatusRU[status],
			"priority": priority, "is_crisis": crisis, "category": nsToPtr(cat),
			"expert": nsToPtr(expert), "stalled": stalled, "updated_at": upd, "created_at": cr,
		})
	}
	writeJSON(w, 200, list)
}

// GET /api/operator/tickets/{id} — карточка для оператора (текст, ответы, вложения, подсказка). Без переписки.
func (s *Server) handleOperatorTicket(w http.ResponseWriter, r *http.Request) {
	id, err := pathID(r, "id")
	if err != nil {
		writeErr(w, 400, "bad id")
		return
	}
	t, ok := s.ticketByID(id)
	if !ok {
		writeErr(w, 404, "обращение не найдено")
		return
	}
	sug := s.routingSuggestion(t.SuggestedCategoryID, t.CategoryID)

	var cat, scat *string
	if t.CategoryID != nil {
		cat = s.categoryTitle(*t.CategoryID)
	}
	if t.SuggestedCategoryID != nil {
		scat = s.categoryTitle(*t.SuggestedCategoryID)
	}

	view := map[string]interface{}{
		"id": t.ID, "applicant_type": t.ApplicantType, "status": t.Status, "status_ru": StatusRU[t.Status],
		"priority": t.Priority, "is_crisis": t.IsCrisis, "return_count": t.ReturnCount,
		"free_text": t.FreeText, "clarifying_answers": clarifyingJSON(t.ClarifyingAnswers),
		"category": cat, "category_id": t.CategoryID,
		"suggested_category": scat, "suggested_category_id": t.SuggestedCategoryID,
		"attachments": s.attachmentsOf(t.ID),
		"routing_hint": sug,
		"created_at": t.CreatedAt,
		"reject_reason": t.RejectReason,
	}
	// Контакт доступен оператору только по кризисным обращениям (расшифровывается).
	if t.IsCrisis && t.ContactInfo != nil {
		if dec, err := s.Box.Decrypt(*t.ContactInfo); err == nil {
			view["contact_info"] = dec
		}
	}
	writeJSON(w, 200, view)
}

// POST /api/operator/tickets/{id}/category {category_id}
func (s *Server) handleOperatorSetCategory(w http.ResponseWriter, r *http.Request) {
	id, _ := pathID(r, "id")
	c, _ := auth.FromContext(r.Context())
	var b struct {
		CategoryID int64 `json:"category_id"`
	}
	if err := readJSON(r, &b); err != nil {
		writeErr(w, 400, "некорректный запрос")
		return
	}
	s.DB.Exec(`UPDATE tickets SET category_id=$1, updated_at=now() WHERE id=$2`, b.CategoryID, id)
	s.audit(id, &c.StaffID, "operator", "set_category", "категория уточнена")
	writeJSON(w, 200, map[string]string{"ok": "1"})
}

// POST /api/operator/tickets/{id}/priority {priority}
func (s *Server) handleOperatorSetPriority(w http.ResponseWriter, r *http.Request) {
	id, _ := pathID(r, "id")
	c, _ := auth.FromContext(r.Context())
	var b struct {
		Priority string `json:"priority"`
	}
	if err := readJSON(r, &b); err != nil || !validPriority(b.Priority) {
		writeErr(w, 400, "недопустимый приоритет")
		return
	}
	s.DB.Exec(`UPDATE tickets SET priority=$1, updated_at=now() WHERE id=$2`, b.Priority, id)
	s.audit(id, &c.StaffID, "operator", "set_priority", "приоритет: "+b.Priority)
	writeJSON(w, 200, map[string]string{"ok": "1"})
}

// POST /api/operator/tickets/{id}/assign {expert_id}
func (s *Server) handleOperatorAssign(w http.ResponseWriter, r *http.Request) {
	id, _ := pathID(r, "id")
	c, _ := auth.FromContext(r.Context())
	var b struct {
		ExpertID int64 `json:"expert_id"`
	}
	if err := readJSON(r, &b); err != nil {
		writeErr(w, 400, "некорректный запрос")
		return
	}
	var role string
	if err := s.DB.QueryRow(`SELECT role FROM staff WHERE id=$1`, b.ExpertID).Scan(&role); err != nil || role != "expert" {
		writeErr(w, 400, "выбран не эксперт")
		return
	}
	_, err := s.DB.Exec(`UPDATE tickets SET assigned_expert_id=$1, operator_id=$2, status='distributed',
		accepted_at=COALESCE(accepted_at, now()), updated_at=now() WHERE id=$3`, b.ExpertID, c.StaffID, id)
	if err != nil {
		writeErr(w, 500, "не удалось назначить")
		return
	}
	// ответственный участник
	s.DB.Exec(`INSERT INTO ticket_participants (ticket_id, staff_id, role_in_ticket) VALUES ($1,$2,'responsible')
		ON CONFLICT (ticket_id, staff_id) DO UPDATE SET role_in_ticket='responsible'`, id, b.ExpertID)
	s.audit(id, &c.StaffID, "operator", "assign", "назначен исполнитель")
	s.notify(id, "update")
	go s.pushToTicket(id, pushJSON("Мы передали обращение специалисту"))
	writeJSON(w, 200, map[string]string{"status": "distributed"})
}

// POST /api/operator/tickets/{id}/reply-close {message} — оператор отвечает и закрывает сам.
func (s *Server) handleOperatorReplyClose(w http.ResponseWriter, r *http.Request) {
	id, _ := pathID(r, "id")
	c, _ := auth.FromContext(r.Context())
	var b struct {
		Message string `json:"message"`
	}
	if err := readJSON(r, &b); err != nil || b.Message == "" {
		writeErr(w, 400, "напишите ответ")
		return
	}
	s.DB.Exec(`INSERT INTO messages (ticket_id, author_kind, author_staff_id, voice_label, body) VALUES ($1,'specialist',$2,'Специалист',$3)`, id, c.StaffID, b.Message)
	s.DB.Exec(`UPDATE tickets SET status='answer_ready', first_response_at=COALESCE(first_response_at, now()), updated_at=now() WHERE id=$1`, id)
	s.audit(id, &c.StaffID, "operator", "reply_close", "оператор ответил и подготовил закрытие")
	s.notify(id, "update")
	go s.pushToTicket(id, pushJSON("Готов ответ по вашему обращению"))
	writeJSON(w, 200, map[string]string{"status": "answer_ready"})
}

// POST /api/operator/tickets/{id}/reject {reason, kind}
func (s *Server) handleOperatorReject(w http.ResponseWriter, r *http.Request) {
	id, _ := pathID(r, "id")
	c, _ := auth.FromContext(r.Context())
	var b struct {
		Reason string `json:"reason"`
		Kind   string `json:"kind"`
	}
	if err := readJSON(r, &b); err != nil || b.Reason == "" {
		writeErr(w, 400, "укажите причину")
		return
	}
	s.DB.Exec(`UPDATE tickets SET status='rejected', reject_reason=$1, closed_at=now(), updated_at=now() WHERE id=$2`, b.Reason, id)
	s.audit(id, &c.StaffID, "operator", "reject:"+b.Kind, b.Reason)
	writeJSON(w, 200, map[string]string{"status": "rejected"})
}

// POST /api/operator/tickets/{id}/return-resolve {action: reassign|close, expert_id?, reason?}
func (s *Server) handleOperatorReturnResolve(w http.ResponseWriter, r *http.Request) {
	id, _ := pathID(r, "id")
	c, _ := auth.FromContext(r.Context())
	var b struct {
		Action   string `json:"action"`
		ExpertID int64  `json:"expert_id"`
		Reason   string `json:"reason"`
	}
	if err := readJSON(r, &b); err != nil {
		writeErr(w, 400, "некорректный запрос")
		return
	}
	switch b.Action {
	case "reassign":
		s.DB.Exec(`UPDATE tickets SET assigned_expert_id=$1, status='distributed', updated_at=now() WHERE id=$2`, b.ExpertID, id)
		s.DB.Exec(`INSERT INTO ticket_participants (ticket_id, staff_id, role_in_ticket) VALUES ($1,$2,'responsible')
			ON CONFLICT (ticket_id, staff_id) DO UPDATE SET role_in_ticket='responsible'`, id, b.ExpertID)
		s.audit(id, &c.StaffID, "operator", "return_reassign", "возврат переназначен")
		writeJSON(w, 200, map[string]string{"status": "distributed"})
	case "close":
		s.DB.Exec(`UPDATE tickets SET status='rejected', reject_reason=$1, closed_at=now(), updated_at=now() WHERE id=$2`, b.Reason, id)
		s.audit(id, &c.StaffID, "operator", "return_close", b.Reason)
		writeJSON(w, 200, map[string]string{"status": "rejected"})
	default:
		writeErr(w, 400, "неизвестное действие")
	}
}

// GET /api/operator/transfers — запросы на передачу
func (s *Server) handleOperatorTransfers(w http.ResponseWriter, r *http.Request) {
	rows, _ := s.DB.Query(`
		SELECT tr.id, tr.ticket_id, tr.reason, st.display_name, tr.created_at
		FROM transfers tr LEFT JOIN staff st ON st.id=tr.from_expert_id
		WHERE tr.status='pending' ORDER BY tr.created_at`)
	list := []map[string]interface{}{}
	if rows != nil {
		defer rows.Close()
		for rows.Next() {
			var trid, tid int64
			var reason string
			var from sql.NullString
			var at time.Time
			rows.Scan(&trid, &tid, &reason, &from, &at)
			list = append(list, map[string]interface{}{"id": trid, "ticket_id": tid, "reason": reason, "from": nsToPtr(from), "created_at": at})
		}
	}
	writeJSON(w, 200, list)
}

// POST /api/operator/transfers/{id}/resolve {approve, to_expert_id, reason}
func (s *Server) handleOperatorResolveTransfer(w http.ResponseWriter, r *http.Request) {
	id, _ := pathID(r, "id")
	c, _ := auth.FromContext(r.Context())
	var b struct {
		Approve    bool  `json:"approve"`
		ToExpertID int64 `json:"to_expert_id"`
	}
	if err := readJSON(r, &b); err != nil {
		writeErr(w, 400, "некорректный запрос")
		return
	}
	var ticketID int64
	if err := s.DB.QueryRow(`SELECT ticket_id FROM transfers WHERE id=$1`, id).Scan(&ticketID); err != nil {
		writeErr(w, 404, "запрос не найден")
		return
	}
	if b.Approve {
		s.DB.Exec(`UPDATE transfers SET status='approved', to_expert_id=$1, resolved_at=now() WHERE id=$2`, b.ToExpertID, id)
		s.DB.Exec(`UPDATE tickets SET assigned_expert_id=$1, status='in_progress', updated_at=now() WHERE id=$2`, b.ToExpertID, ticketID)
		s.DB.Exec(`INSERT INTO ticket_participants (ticket_id, staff_id, role_in_ticket) VALUES ($1,$2,'responsible')
			ON CONFLICT (ticket_id, staff_id) DO UPDATE SET role_in_ticket='responsible'`, ticketID, b.ToExpertID)
		s.audit(ticketID, &c.StaffID, "operator", "transfer_approved", "передача подтверждена")
	} else {
		s.DB.Exec(`UPDATE transfers SET status='rejected', resolved_at=now() WHERE id=$1`, id)
		s.audit(ticketID, &c.StaffID, "operator", "transfer_rejected", "передача отклонена")
	}
	writeJSON(w, 200, map[string]string{"ok": "1"})
}

// GET /api/operator/complaints
func (s *Server) handleOperatorComplaints(w http.ResponseWriter, r *http.Request) {
	rows, _ := s.DB.Query(`SELECT id, ticket_id, body, handled, created_at FROM complaints ORDER BY created_at DESC`)
	list := []map[string]interface{}{}
	if rows != nil {
		defer rows.Close()
		for rows.Next() {
			var id, tid int64
			var body string
			var handled bool
			var at time.Time
			rows.Scan(&id, &tid, &body, &handled, &at)
			list = append(list, map[string]interface{}{"id": id, "ticket_id": tid, "body": body, "handled": handled, "created_at": at})
		}
	}
	writeJSON(w, 200, list)
}

// GET /api/operator/experts — список экспертов с текущей нагрузкой
func (s *Server) handleOperatorExperts(w http.ResponseWriter, r *http.Request) {
	writeJSON(w, 200, s.expertsWithLoad(""))
}
