package api

import (
	"database/sql"
	"net/http"
	"time"

	"otklik/internal/auth"

	"golang.org/x/crypto/bcrypt"
)

// POST /api/auth/login {login, password}
func (s *Server) handleLogin(w http.ResponseWriter, r *http.Request) {
	var b struct {
		Login    string `json:"login"`
		Password string `json:"password"`
	}
	if err := readJSON(r, &b); err != nil {
		writeErr(w, 400, "некорректный запрос")
		return
	}
	var (
		id    int64
		hash  string
		name  string
		role  string
		group sql.NullString
		voice sql.NullString
		active bool
	)
	err := s.DB.QueryRow(`SELECT id, password_hash, display_name, role, specialist_group, voice_label, active FROM staff WHERE login=$1`, b.Login).
		Scan(&id, &hash, &name, &role, &group, &voice, &active)
	if err != nil || !active {
		writeErr(w, 401, "неверный логин или пароль")
		return
	}
	if bcrypt.CompareHashAndPassword([]byte(hash), []byte(b.Password)) != nil {
		writeErr(w, 401, "неверный логин или пароль")
		return
	}
	token, err := auth.Sign(s.Cfg.JWTSecret, auth.Claims{
		StaffID: id, Login: b.Login, Role: role, Name: name,
		Exp: time.Now().Add(12 * time.Hour).Unix(),
	})
	if err != nil {
		writeErr(w, 500, "ошибка выдачи токена")
		return
	}
	writeJSON(w, 200, map[string]interface{}{
		"token": token,
		"staff": map[string]interface{}{
			"id": id, "login": b.Login, "role": role, "name": name,
			"specialist_group": group.String, "voice_label": voice.String,
		},
	})
}

// GET /api/auth/me
func (s *Server) handleMe(w http.ResponseWriter, r *http.Request) {
	c, _ := auth.FromContext(r.Context())
	var group, voice sql.NullString
	s.DB.QueryRow(`SELECT specialist_group, voice_label FROM staff WHERE id=$1`, c.StaffID).Scan(&group, &voice)
	writeJSON(w, 200, map[string]interface{}{
		"id": c.StaffID, "login": c.Login, "role": c.Role, "name": c.Name,
		"specialist_group": group.String, "voice_label": voice.String,
	})
}
