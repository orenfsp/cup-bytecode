package auth

import (
	"context"
	"crypto/hmac"
	"crypto/sha256"
	"encoding/base64"
	"encoding/json"
	"errors"
	"net/http"
	"strings"
	"time"
)

type ctxKey string

const claimsKey ctxKey = "staff_claims"

// Claims — полезная нагрузка токена.
type Claims struct {
	StaffID int64  `json:"sid"`
	Login   string `json:"login"`
	Role    string `json:"role"`
	Name    string `json:"name"`
	Exp     int64  `json:"exp"`
}

// Sign создаёт компактный JWT-подобный токен (HMAC-SHA256), без сторонних библиотек.
func Sign(secret string, c Claims) (string, error) {
	header := b64(`{"alg":"HS256","typ":"JWT"}`)
	payload, err := json.Marshal(c)
	if err != nil {
		return "", err
	}
	body := header + "." + b64(string(payload))
	sig := sign(secret, body)
	return body + "." + sig, nil
}

// Verify проверяет токен и возвращает Claims.
func Verify(secret, token string) (Claims, error) {
	var c Claims
	parts := strings.Split(token, ".")
	if len(parts) != 3 {
		return c, errors.New("bad token")
	}
	body := parts[0] + "." + parts[1]
	if !hmac.Equal([]byte(sign(secret, body)), []byte(parts[2])) {
		return c, errors.New("bad signature")
	}
	raw, err := base64.RawURLEncoding.DecodeString(parts[1])
	if err != nil {
		return c, err
	}
	if err := json.Unmarshal(raw, &c); err != nil {
		return c, err
	}
	if time.Now().Unix() > c.Exp {
		return c, errors.New("token expired")
	}
	return c, nil
}

func b64(s string) string { return base64.RawURLEncoding.EncodeToString([]byte(s)) }

func sign(secret, body string) string {
	m := hmac.New(sha256.New, []byte(secret))
	m.Write([]byte(body))
	return base64.RawURLEncoding.EncodeToString(m.Sum(nil))
}

// Middleware проверяет токен и, при необходимости, роль.
func Middleware(secret string, roles ...string) func(http.Handler) http.Handler {
	allowed := map[string]bool{}
	for _, r := range roles {
		allowed[r] = true
	}
	return func(next http.Handler) http.Handler {
		return http.HandlerFunc(func(w http.ResponseWriter, r *http.Request) {
			h := r.Header.Get("Authorization")
			if !strings.HasPrefix(h, "Bearer ") {
				http.Error(w, "требуется авторизация", http.StatusUnauthorized)
				return
			}
			c, err := Verify(secret, strings.TrimPrefix(h, "Bearer "))
			if err != nil {
				http.Error(w, "недействительный токен", http.StatusUnauthorized)
				return
			}
			if len(allowed) > 0 && !allowed[c.Role] {
				http.Error(w, "нет доступа", http.StatusForbidden)
				return
			}
			ctx := context.WithValue(r.Context(), claimsKey, c)
			next.ServeHTTP(w, r.WithContext(ctx))
		})
	}
}

// FromContext достаёт Claims из контекста запроса.
func FromContext(ctx context.Context) (Claims, bool) {
	c, ok := ctx.Value(claimsKey).(Claims)
	return c, ok
}
