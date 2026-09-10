package api

import (
	"crypto/rand"
	"encoding/hex"
	"net/http"
	"strconv"
	"strings"
	"time"

	"otklik/internal/auth"
	"otklik/internal/push"
	"otklik/internal/realtime"

	"github.com/gorilla/websocket"
)

var upgrader = websocket.Upgrader{
	CheckOrigin: func(r *http.Request) bool { return true },
}

// notify рассылает событие в комнату обращения (для realtime-обновлений).
func (s *Server) notify(ticketID int64, evType string) {
	s.Hub.Broadcast(strconv.FormatInt(ticketID, 10), realtime.Event{Type: evType})
}

// --- WebSocket ---

// GET /api/ws/ticket/{id}?token=...  — для сотрудников
func (s *Server) handleWSStaff(w http.ResponseWriter, r *http.Request) {
	id, err := pathID(r, "id")
	if err != nil {
		writeErr(w, 400, "bad id")
		return
	}
	claims, err := auth.Verify(s.Cfg.JWTSecret, r.URL.Query().Get("token"))
	if err != nil {
		writeErr(w, 401, "нет доступа")
		return
	}
	// эксперт — только к своим обращениям
	if claims.Role == "expert" && !s.expertCanAccess(claims.StaffID, id) {
		writeErr(w, 403, "нет доступа")
		return
	}
	conn, err := upgrader.Upgrade(w, r, nil)
	if err != nil {
		return
	}
	s.Hub.Serve(conn, strconv.FormatInt(id, 10))
}

// GET /api/ws/track?track=... — для заявителя
func (s *Server) handleWSApplicant(w http.ResponseWriter, r *http.Request) {
	track := r.URL.Query().Get("track")
	t, ok := s.ticketByTrack(track)
	if !ok {
		writeErr(w, 404, "не найдено")
		return
	}
	conn, err := upgrader.Upgrade(w, r, nil)
	if err != nil {
		return
	}
	s.Hub.Serve(conn, strconv.FormatInt(t.ID, 10))
}

// --- Push ---

// GET /api/push/vapid-public
func (s *Server) handleVapidPublic(w http.ResponseWriter, r *http.Request) {
	writeJSON(w, 200, map[string]interface{}{"key": s.Push.PublicKey(), "enabled": s.Push.Enabled()})
}

// POST /api/push/subscribe {track, endpoint, p256dh, auth}
func (s *Server) handlePushSubscribe(w http.ResponseWriter, r *http.Request) {
	var b struct {
		Track    string `json:"track"`
		Endpoint string `json:"endpoint"`
		P256dh   string `json:"p256dh"`
		Auth     string `json:"auth"`
	}
	if err := readJSON(r, &b); err != nil || b.Endpoint == "" {
		writeErr(w, 400, "некорректная подписка")
		return
	}
	t, ok := s.ticketByTrack(b.Track)
	if !ok {
		writeErr(w, 404, "обращение не найдено")
		return
	}
	s.DB.Exec(`INSERT INTO push_subscriptions (ticket_id, endpoint, p256dh, auth) VALUES ($1,$2,$3,$4)
		ON CONFLICT (ticket_id, endpoint) DO UPDATE SET p256dh=$3, auth=$4`, t.ID, b.Endpoint, b.P256dh, b.Auth)
	writeJSON(w, 200, map[string]string{"ok": "1"})
}

// pushToTicket отправляет push всем подпискам обращения (уведомление заявителя без личности).
func (s *Server) pushToTicket(ticketID int64, payload string) {
	rows, err := s.DB.Query(`SELECT endpoint, p256dh, auth FROM push_subscriptions WHERE ticket_id=$1`, ticketID)
	if err != nil {
		return
	}
	type sub struct{ ep, p, a string }
	var subs []sub
	for rows.Next() {
		var x sub
		rows.Scan(&x.ep, &x.p, &x.a)
		subs = append(subs, x)
	}
	rows.Close()
	for _, x := range subs {
		gone := s.Push.Send(push.Subscription{Endpoint: x.ep, P256dh: x.p, Auth: x.a}, payload)
		if gone {
			s.DB.Exec(`DELETE FROM push_subscriptions WHERE ticket_id=$1 AND endpoint=$2`, ticketID, x.ep)
		}
	}
}

// --- Блокировка ввода (жёсткая, эксклюзивная) ---

// POST /api/expert/tickets/{id}/lock
func (s *Server) handleAcquireLock(w http.ResponseWriter, r *http.Request) {
	c, _ := auth.FromContext(r.Context())
	id, _ := pathID(r, "id")
	if !s.expertCanAccess(c.StaffID, id) {
		writeErr(w, 403, "нет доступа")
		return
	}
	// снимаем устаревшую блокировку (>30 c без обновления)
	s.DB.Exec(`DELETE FROM ticket_edit_lock WHERE ticket_id=$1 AND locked_at < now() - interval '30 seconds'`, id)
	// пытаемся занять/продлить, если свободно или уже наша
	s.DB.Exec(`INSERT INTO ticket_edit_lock (ticket_id, staff_id, locked_at) VALUES ($1,$2,now())
		ON CONFLICT (ticket_id) DO UPDATE SET locked_at=now()
		WHERE ticket_edit_lock.staff_id=$2`, id, c.StaffID)

	var holderID int64
	var holderName string
	err := s.DB.QueryRow(`SELECT l.staff_id, st.display_name FROM ticket_edit_lock l JOIN staff st ON st.id=l.staff_id WHERE l.ticket_id=$1`, id).Scan(&holderID, &holderName)
	if err != nil {
		writeJSON(w, 200, map[string]interface{}{"locked_by_me": true, "holder": nil})
		return
	}
	writeJSON(w, 200, map[string]interface{}{"locked_by_me": holderID == c.StaffID, "holder": holderName})
}

// POST /api/expert/tickets/{id}/unlock
func (s *Server) handleReleaseLock(w http.ResponseWriter, r *http.Request) {
	c, _ := auth.FromContext(r.Context())
	id, _ := pathID(r, "id")
	s.DB.Exec(`DELETE FROM ticket_edit_lock WHERE ticket_id=$1 AND staff_id=$2`, id, c.StaffID)
	writeJSON(w, 200, map[string]string{"ok": "1"})
}

// --- Эскалация во внешнее реагирование ---

// POST /api/operator/tickets/{id}/escalate {reason}
func (s *Server) handleEscalate(w http.ResponseWriter, r *http.Request) {
	c, _ := auth.FromContext(r.Context())
	id, _ := pathID(r, "id")
	var b struct {
		Reason string `json:"reason"`
	}
	if err := readJSON(r, &b); err != nil || strings.TrimSpace(b.Reason) == "" {
		writeErr(w, 400, "укажите причину эскалации")
		return
	}
	tok := randToken()
	s.DB.Exec(`INSERT INTO escalations (ticket_id, created_by, reason, channel_token) VALUES ($1,$2,$3,$4)`,
		id, c.StaffID, strings.TrimSpace(b.Reason), tok)
	s.DB.Exec(`UPDATE tickets SET escalated=true, updated_at=now() WHERE id=$1`, id)
	s.audit(id, &c.StaffID, "operator", "escalate", "эскалация во внешнее реагирование: "+b.Reason)
	writeJSON(w, 200, map[string]interface{}{"ok": "1", "channel_token": tok})
}

// GET /api/admin/escalations
func (s *Server) handleAdminEscalations(w http.ResponseWriter, r *http.Request) {
	rows, _ := s.DB.Query(`
		SELECT e.id, e.ticket_id, e.reason, e.status, e.created_at, COALESCE(st.display_name,''), t.is_crisis,
		       (t.contact_info IS NOT NULL) AS has_contact
		FROM escalations e JOIN tickets t ON t.id=e.ticket_id
		LEFT JOIN staff st ON st.id=e.created_by
		ORDER BY e.created_at DESC`)
	list := []map[string]interface{}{}
	if rows != nil {
		defer rows.Close()
		for rows.Next() {
			var id, tid int64
			var reason, status, by string
			var at time.Time
			var crisis, hasContact bool
			rows.Scan(&id, &tid, &reason, &status, &at, &by, &crisis, &hasContact)
			list = append(list, map[string]interface{}{
				"id": id, "ticket_id": tid, "reason": reason, "status": status,
				"created_at": at, "by": by, "is_crisis": crisis, "has_contact": hasContact,
			})
		}
	}
	writeJSON(w, 200, list)
}

// pushJSON строит полезную нагрузку уведомления.
func pushJSON(body string) string {
	return `{"title":"Отклик","body":"` + strings.ReplaceAll(body, `"`, "'") + `"}`
}

func randToken() string {
	b := make([]byte, 12)
	rand.Read(b)
	return hex.EncodeToString(b)
}
