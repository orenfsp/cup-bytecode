package api

import (
	"database/sql"
	"net/http"
	"strings"
	"time"

	"otklik/internal/auth"

	"golang.org/x/crypto/bcrypt"
)

// GET /api/admin/categories
func (s *Server) handleAdminCategories(w http.ResponseWriter, r *http.Request) {
	rows, _ := s.DB.Query(`SELECT id, slug, title, is_free_text, sort_order, active FROM categories ORDER BY sort_order, id`)
	list := []map[string]interface{}{}
	if rows != nil {
		defer rows.Close()
		for rows.Next() {
			var id int64
			var slug, title string
			var free, active bool
			var sort int
			rows.Scan(&id, &slug, &title, &free, &sort, &active)
			list = append(list, map[string]interface{}{"id": id, "slug": slug, "title": title, "is_free_text": free, "sort_order": sort, "active": active})
		}
	}
	writeJSON(w, 200, list)
}

// POST /api/admin/categories
func (s *Server) handleAdminCreateCategory(w http.ResponseWriter, r *http.Request) {
	var b struct {
		Slug       string `json:"slug"`
		Title      string `json:"title"`
		IsFreeText bool   `json:"is_free_text"`
		SortOrder  int    `json:"sort_order"`
	}
	if err := readJSON(r, &b); err != nil || strings.TrimSpace(b.Title) == "" || strings.TrimSpace(b.Slug) == "" {
		writeErr(w, 400, "нужны slug и название")
		return
	}
	var id int64
	err := s.DB.QueryRow(`INSERT INTO categories (slug, title, is_free_text, sort_order) VALUES ($1,$2,$3,$4) RETURNING id`,
		b.Slug, b.Title, b.IsFreeText, b.SortOrder).Scan(&id)
	if err != nil {
		writeErr(w, 400, "категория с таким slug уже есть")
		return
	}
	writeJSON(w, 201, map[string]interface{}{"id": id})
}

// PUT /api/admin/categories/{id}
func (s *Server) handleAdminUpdateCategory(w http.ResponseWriter, r *http.Request) {
	id, _ := pathID(r, "id")
	var b struct {
		Title      string `json:"title"`
		IsFreeText bool   `json:"is_free_text"`
		SortOrder  int    `json:"sort_order"`
		Active     bool   `json:"active"`
	}
	if err := readJSON(r, &b); err != nil {
		writeErr(w, 400, "некорректный запрос")
		return
	}
	s.DB.Exec(`UPDATE categories SET title=$1, is_free_text=$2, sort_order=$3, active=$4 WHERE id=$5`,
		b.Title, b.IsFreeText, b.SortOrder, b.Active, id)
	writeJSON(w, 200, map[string]string{"ok": "1"})
}

// GET /api/admin/routing
func (s *Server) handleAdminRouting(w http.ResponseWriter, r *http.Request) {
	rows, _ := s.DB.Query(`
		SELECT c.id, c.title, COALESCE(rr.specialist_group,''), COALESCE(rr.load_limit,0)
		FROM categories c LEFT JOIN routing_rules rr ON rr.category_id=c.id
		WHERE c.active ORDER BY c.sort_order, c.id`)
	list := []map[string]interface{}{}
	if rows != nil {
		defer rows.Close()
		for rows.Next() {
			var id int64
			var title, group string
			var limit int
			rows.Scan(&id, &title, &group, &limit)
			list = append(list, map[string]interface{}{
				"category_id": id, "category": title, "specialist_group": group,
				"group_ru": groupRU[group], "load_limit": limit,
			})
		}
	}
	writeJSON(w, 200, map[string]interface{}{"rules": list, "groups": groupRU})
}

// PUT /api/admin/routing/{categoryId}
func (s *Server) handleAdminSetRouting(w http.ResponseWriter, r *http.Request) {
	catID, _ := pathID(r, "categoryId")
	var b struct {
		SpecialistGroup string `json:"specialist_group"`
		LoadLimit       int    `json:"load_limit"`
	}
	if err := readJSON(r, &b); err != nil || b.SpecialistGroup == "" {
		writeErr(w, 400, "укажите группу специалистов")
		return
	}
	if b.LoadLimit <= 0 {
		b.LoadLimit = 10
	}
	s.DB.Exec(`INSERT INTO routing_rules (category_id, specialist_group, load_limit) VALUES ($1,$2,$3)
		ON CONFLICT (category_id) DO UPDATE SET specialist_group=$2, load_limit=$3`, catID, b.SpecialistGroup, b.LoadLimit)
	writeJSON(w, 200, map[string]string{"ok": "1"})
}

// GET /api/admin/staff
func (s *Server) handleAdminStaff(w http.ResponseWriter, r *http.Request) {
	rows, _ := s.DB.Query(`SELECT id, login, display_name, role, COALESCE(specialist_group,''), COALESCE(voice_label,''), active_limit, active FROM staff ORDER BY role, id`)
	list := []map[string]interface{}{}
	if rows != nil {
		defer rows.Close()
		for rows.Next() {
			var id int64
			var login, name, role, group, voice string
			var limit int
			var active bool
			rows.Scan(&id, &login, &name, &role, &group, &voice, &limit, &active)
			list = append(list, map[string]interface{}{
				"id": id, "login": login, "name": name, "role": role,
				"specialist_group": group, "voice_label": voice, "active_limit": limit, "active": active,
			})
		}
	}
	writeJSON(w, 200, list)
}

// POST /api/admin/staff
func (s *Server) handleAdminCreateStaff(w http.ResponseWriter, r *http.Request) {
	var b struct {
		Login           string `json:"login"`
		Password        string `json:"password"`
		DisplayName     string `json:"display_name"`
		Role            string `json:"role"`
		SpecialistGroup string `json:"specialist_group"`
		VoiceLabel      string `json:"voice_label"`
		ActiveLimit     int    `json:"active_limit"`
	}
	if err := readJSON(r, &b); err != nil || b.Login == "" || b.Password == "" || b.DisplayName == "" {
		writeErr(w, 400, "нужны логин, пароль и имя")
		return
	}
	if b.Role != "operator" && b.Role != "expert" && b.Role != "admin" {
		writeErr(w, 400, "недопустимая роль")
		return
	}
	if b.ActiveLimit <= 0 {
		b.ActiveLimit = 10
	}
	hash, _ := bcrypt.GenerateFromPassword([]byte(b.Password), bcrypt.DefaultCost)
	var grp, voice interface{}
	if b.SpecialistGroup != "" {
		grp = b.SpecialistGroup
	}
	if b.VoiceLabel != "" {
		voice = b.VoiceLabel
	}
	var id int64
	err := s.DB.QueryRow(`INSERT INTO staff (login, password_hash, display_name, role, specialist_group, voice_label, active_limit)
		VALUES ($1,$2,$3,$4,$5,$6,$7) RETURNING id`,
		b.Login, string(hash), b.DisplayName, b.Role, grp, voice, b.ActiveLimit).Scan(&id)
	if err != nil {
		writeErr(w, 400, "логин уже занят")
		return
	}
	writeJSON(w, 201, map[string]interface{}{"id": id})
}

// PUT /api/admin/staff/{id}
func (s *Server) handleAdminUpdateStaff(w http.ResponseWriter, r *http.Request) {
	id, _ := pathID(r, "id")
	var b struct {
		DisplayName     string `json:"display_name"`
		Role            string `json:"role"`
		SpecialistGroup string `json:"specialist_group"`
		VoiceLabel      string `json:"voice_label"`
		ActiveLimit     int    `json:"active_limit"`
		Active          bool   `json:"active"`
		Password        string `json:"password"`
	}
	if err := readJSON(r, &b); err != nil {
		writeErr(w, 400, "некорректный запрос")
		return
	}
	var grp, voice interface{}
	if b.SpecialistGroup != "" {
		grp = b.SpecialistGroup
	}
	if b.VoiceLabel != "" {
		voice = b.VoiceLabel
	}
	if b.ActiveLimit <= 0 {
		b.ActiveLimit = 10
	}
	s.DB.Exec(`UPDATE staff SET display_name=$1, role=$2, specialist_group=$3, voice_label=$4, active_limit=$5, active=$6 WHERE id=$7`,
		b.DisplayName, b.Role, grp, voice, b.ActiveLimit, b.Active, id)
	if strings.TrimSpace(b.Password) != "" {
		hash, _ := bcrypt.GenerateFromPassword([]byte(b.Password), bcrypt.DefaultCost)
		s.DB.Exec(`UPDATE staff SET password_hash=$1 WHERE id=$2`, string(hash), id)
	}
	writeJSON(w, 200, map[string]string{"ok": "1"})
}

// GET /api/admin/tickets
func (s *Server) handleAdminTickets(w http.ResponseWriter, r *http.Request) {
	rows, _ := s.DB.Query(`
		SELECT t.id, t.applicant_type, t.status, t.priority, t.is_crisis, t.escalated, t.created_at, t.updated_at,
		       c.title, st.display_name
		FROM tickets t
		LEFT JOIN categories c ON c.id=t.category_id
		LEFT JOIN staff st ON st.id=t.assigned_expert_id
		ORDER BY t.created_at DESC`)
	list := []map[string]interface{}{}
	if rows != nil {
		defer rows.Close()
		for rows.Next() {
			var id int64
			var atype, status, priority string
			var crisis, escalated bool
			var cr, upd time.Time
			var cat, expert sql.NullString
			rows.Scan(&id, &atype, &status, &priority, &crisis, &escalated, &cr, &upd, &cat, &expert)
			stalled := (status == "distributed" || status == "in_progress" || status == "need_clarification") && time.Since(upd) > 12*time.Hour
			list = append(list, map[string]interface{}{
				"id": id, "applicant_type": atype, "status": status, "status_ru": StatusRU[status],
				"priority": priority, "is_crisis": crisis, "escalated": escalated, "category": nsToPtr(cat), "expert": nsToPtr(expert),
				"created_at": cr, "updated_at": upd, "stalled": stalled,
			})
		}
	}
	writeJSON(w, 200, list)
}

// POST /api/admin/tickets/{id}/override {status?, priority?, expert_id?, reason}
func (s *Server) handleAdminOverride(w http.ResponseWriter, r *http.Request) {
	id, _ := pathID(r, "id")
	c, _ := auth.FromContext(r.Context())
	var b struct {
		Status   string `json:"status"`
		Priority string `json:"priority"`
		ExpertID *int64 `json:"expert_id"`
		Reason   string `json:"reason"`
	}
	if err := readJSON(r, &b); err != nil || strings.TrimSpace(b.Reason) == "" {
		writeErr(w, 400, "администратор обязан указать причину")
		return
	}
	changes := []string{}
	if b.Status != "" {
		s.DB.Exec(`UPDATE tickets SET status=$1, updated_at=now() WHERE id=$2`, b.Status, id)
		changes = append(changes, "статус="+b.Status)
	}
	if b.Priority != "" && validPriority(b.Priority) {
		s.DB.Exec(`UPDATE tickets SET priority=$1, updated_at=now() WHERE id=$2`, b.Priority, id)
		changes = append(changes, "приоритет="+b.Priority)
	}
	if b.ExpertID != nil {
		s.DB.Exec(`UPDATE tickets SET assigned_expert_id=$1, updated_at=now() WHERE id=$2`, *b.ExpertID, id)
		s.DB.Exec(`INSERT INTO ticket_participants (ticket_id, staff_id, role_in_ticket) VALUES ($1,$2,'responsible')
			ON CONFLICT (ticket_id, staff_id) DO UPDATE SET role_in_ticket='responsible'`, id, *b.ExpertID)
		changes = append(changes, "исполнитель изменён")
	}
	s.audit(id, &c.StaffID, "admin", "override", "Причина: "+b.Reason+"; "+strings.Join(changes, ", "))
	writeJSON(w, 200, map[string]string{"ok": "1"})
}

// GET /api/admin/audit?ticket_id=
func (s *Server) handleAdminAudit(w http.ResponseWriter, r *http.Request) {
	q := `SELECT a.id, a.ticket_id, a.actor_kind, COALESCE(st.display_name,''), a.action, COALESCE(a.details,''), a.created_at
		FROM audit_log a LEFT JOIN staff st ON st.id=a.actor_staff_id`
	args := []interface{}{}
	if v := r.URL.Query().Get("ticket_id"); v != "" {
		q += ` WHERE a.ticket_id=$1`
		args = append(args, v)
	}
	q += ` ORDER BY a.created_at DESC LIMIT 500`
	rows, _ := s.DB.Query(q, args...)
	list := []map[string]interface{}{}
	if rows != nil {
		defer rows.Close()
		for rows.Next() {
			var id int64
			var tid sql.NullInt64
			var kind, actor, action, details string
			var at time.Time
			rows.Scan(&id, &tid, &kind, &actor, &action, &details, &at)
			list = append(list, map[string]interface{}{
				"id": id, "ticket_id": niToPtr(tid), "actor_kind": kind, "actor": actor,
				"action": action, "details": details, "created_at": at,
			})
		}
	}
	writeJSON(w, 200, list)
}

// GET /api/admin/alerts — незамаршрутизированные обращения и перегруженные группы
func (s *Server) handleAdminAlerts(w http.ResponseWriter, r *http.Request) {
	// Обращения в очереди без подходящего исполнителя
	rows, _ := s.DB.Query(`
		SELECT t.id, COALESCE(c.title,'—'), t.created_at, COALESCE(rr.specialist_group,'')
		FROM tickets t
		LEFT JOIN categories c ON c.id=COALESCE(t.category_id, t.suggested_category_id)
		LEFT JOIN routing_rules rr ON rr.category_id=COALESCE(t.category_id, t.suggested_category_id)
		WHERE t.status='new'`)
	unrouted := []map[string]interface{}{}
	if rows != nil {
		for rows.Next() {
			var id int64
			var cat, group string
			var at time.Time
			rows.Scan(&id, &cat, &at, &group)
			// нет экспертов в группе?
			var cnt int
			if group != "" {
				s.DB.QueryRow(`SELECT count(*) FROM staff WHERE role='expert' AND active AND specialist_group=$1`, group).Scan(&cnt)
			}
			if group == "" || cnt == 0 {
				unrouted = append(unrouted, map[string]interface{}{"ticket_id": id, "category": cat, "group_ru": groupRU[group], "created_at": at})
			}
		}
		rows.Close()
	}

	// Перегруженные группы
	overloaded := []map[string]interface{}{}
	for g, ru := range groupRU {
		experts := s.expertsWithLoad(g)
		if len(experts) == 0 {
			continue
		}
		all := true
		for _, e := range experts {
			if !e.Overloaded {
				all = false
				break
			}
		}
		if all {
			overloaded = append(overloaded, map[string]interface{}{"group": g, "group_ru": ru, "experts": len(experts)})
		}
	}

	writeJSON(w, 200, map[string]interface{}{"unrouted": unrouted, "overloaded_groups": overloaded})
}
