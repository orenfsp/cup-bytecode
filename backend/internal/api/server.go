package api

import (
	"database/sql"
	"encoding/json"
	"net"
	"net/http"
	"strconv"
	"strings"
	"time"

	"otklik/internal/auth"
	"otklik/internal/classifier"
	"otklik/internal/config"
	"otklik/internal/push"
	"otklik/internal/realtime"
	"otklik/internal/secretbox"
	"otklik/internal/tracknum"
)

type Server struct {
	DB         *sql.DB
	Cfg        config.Config
	Limiter    *tracknum.Limiter
	Box        *secretbox.Box
	Hub        *realtime.Hub
	Push       *push.Sender
	Classifier *classifier.NaiveBayes
}

func New(db *sql.DB, cfg config.Config) *Server {
	box, err := secretbox.New(cfg.JWTSecret)
	if err != nil {
		panic(err)
	}
	return &Server{
		DB:         db,
		Cfg:        cfg,
		Limiter:    tracknum.NewLimiter(5, time.Minute),
		Box:        box,
		Hub:        realtime.NewHub(),
		Push:       push.New(),
		Classifier: classifier.Train(classifier.DefaultTrainingSet()),
	}
}

// Человеческие названия статусов и пояснения для заявителя.
var StatusRU = map[string]string{
	"new":              "Новое",
	"distributed":      "Распределено",
	"in_progress":      "В работе",
	"need_clarification": "Нужно уточнение",
	"answer_ready":     "Ответ готов",
	"returned":         "Возвращено",
	"done":             "Завершено",
	"rejected":         "Отклонено",
	"closed_no_answer": "Закрыто без ответа",
}

func statusHint(status, applicantType string) string {
	ty := applicantType == "student"
	you := func(s, v string) string {
		if ty {
			return s
		}
		return v
	}
	switch status {
	case "new":
		return you("Мы получили твоё обращение", "Мы получили ваше обращение")
	case "distributed":
		return you("Мы передали обращение специалисту", "Мы передали обращение специалисту")
	case "in_progress":
		return "Специалист разбирается в ситуации"
	case "need_clarification":
		return you("Специалист задал вопрос — посмотри, пожалуйста", "Специалист задал вопрос — посмотрите, пожалуйста")
	case "answer_ready":
		return "Мы подготовили рекомендации"
	case "returned":
		return you("Мы вернулись к твоей ситуации", "Мы вернулись к вашей ситуации")
	case "done":
		return "Рады, что смогли помочь"
	case "rejected":
		return "Помочь с этим не сможем — ниже подсказка, куда ещё можно обратиться"
	case "closed_no_answer":
		return you("Обращение закрыто, но можно написать снова", "Обращение закрыто, но можно написать снова")
	}
	return ""
}

// Routes собирает маршруты.
func (s *Server) Routes() http.Handler {
	mux := http.NewServeMux()
	sec := s.Cfg.JWTSecret

	// --- Публичное ---
	mux.HandleFunc("GET /api/health", func(w http.ResponseWriter, r *http.Request) { writeJSON(w, 200, map[string]string{"status": "ok"}) })
	mux.HandleFunc("GET /api/categories", s.handleCategories)
	mux.HandleFunc("GET /api/crisis-contacts", s.handleCrisisContacts)
	mux.HandleFunc("POST /api/tickets", s.handleCreateTicket)

	// Push (без привязки к личности) и realtime
	mux.HandleFunc("GET /api/push/vapid-public", s.handleVapidPublic)
	mux.HandleFunc("POST /api/push/subscribe", s.handlePushSubscribe)
	mux.HandleFunc("GET /api/ws/track", s.handleWSApplicant)
	mux.HandleFunc("GET /api/ws/ticket/{id}", s.handleWSStaff)

	// Заявитель (доступ по трек-номеру в теле запроса)
	mux.HandleFunc("POST /api/applicant/lookup", s.handleLookup)
	mux.HandleFunc("POST /api/applicant/messages", s.handleApplicantMessage)
	mux.HandleFunc("POST /api/applicant/resolve", s.handleApplicantResolve)
	mux.HandleFunc("POST /api/applicant/rate", s.handleApplicantRate)
	mux.HandleFunc("POST /api/applicant/complaint", s.handleApplicantComplaint)
	mux.HandleFunc("POST /api/applicant/contact", s.handleApplicantContact)

	// Авторизация сотрудников
	mux.HandleFunc("POST /api/auth/login", s.handleLogin)
	mux.Handle("GET /api/auth/me", auth.Middleware(sec)(http.HandlerFunc(s.handleMe)))

	// --- Оператор ---
	op := auth.Middleware(sec, "operator", "admin")
	mux.Handle("GET /api/operator/queue", op(http.HandlerFunc(s.handleOperatorQueue)))
	mux.Handle("GET /api/operator/distributed", op(http.HandlerFunc(s.handleOperatorDistributed)))
	mux.Handle("GET /api/operator/tickets/{id}", op(http.HandlerFunc(s.handleOperatorTicket)))
	mux.Handle("POST /api/operator/tickets/{id}/category", op(http.HandlerFunc(s.handleOperatorSetCategory)))
	mux.Handle("POST /api/operator/tickets/{id}/priority", op(http.HandlerFunc(s.handleOperatorSetPriority)))
	mux.Handle("POST /api/operator/tickets/{id}/assign", op(http.HandlerFunc(s.handleOperatorAssign)))
	mux.Handle("POST /api/operator/tickets/{id}/reply-close", op(http.HandlerFunc(s.handleOperatorReplyClose)))
	mux.Handle("POST /api/operator/tickets/{id}/reject", op(http.HandlerFunc(s.handleOperatorReject)))
	mux.Handle("POST /api/operator/tickets/{id}/return-resolve", op(http.HandlerFunc(s.handleOperatorReturnResolve)))
	mux.Handle("GET /api/operator/transfers", op(http.HandlerFunc(s.handleOperatorTransfers)))
	mux.Handle("POST /api/operator/transfers/{id}/resolve", op(http.HandlerFunc(s.handleOperatorResolveTransfer)))
	mux.Handle("GET /api/operator/complaints", op(http.HandlerFunc(s.handleOperatorComplaints)))
	mux.Handle("GET /api/operator/experts", op(http.HandlerFunc(s.handleOperatorExperts)))
	mux.Handle("POST /api/operator/tickets/{id}/escalate", op(http.HandlerFunc(s.handleEscalate)))

	// --- Эксперт ---
	ex := auth.Middleware(sec, "expert")
	mux.Handle("GET /api/expert/tickets", ex(http.HandlerFunc(s.handleExpertTickets)))
	mux.Handle("GET /api/expert/tickets/{id}", ex(http.HandlerFunc(s.handleExpertTicket)))
	mux.Handle("POST /api/expert/tickets/{id}/take", ex(http.HandlerFunc(s.handleExpertTake)))
	mux.Handle("POST /api/expert/tickets/{id}/message", ex(http.HandlerFunc(s.handleExpertMessage)))
	mux.Handle("POST /api/expert/tickets/{id}/note", ex(http.HandlerFunc(s.handleExpertNote)))
	mux.Handle("POST /api/expert/tickets/{id}/transfer", ex(http.HandlerFunc(s.handleExpertTransfer)))
	mux.Handle("POST /api/expert/tickets/{id}/collaborator", ex(http.HandlerFunc(s.handleExpertCollaborator)))
	mux.Handle("POST /api/expert/tickets/{id}/presence", ex(http.HandlerFunc(s.handleExpertPresence)))
	mux.Handle("POST /api/expert/tickets/{id}/lock", ex(http.HandlerFunc(s.handleAcquireLock)))
	mux.Handle("POST /api/expert/tickets/{id}/unlock", ex(http.HandlerFunc(s.handleReleaseLock)))
	mux.Handle("GET /api/expert/colleagues", ex(http.HandlerFunc(s.handleExpertColleagues)))

	// --- Администратор ---
	ad := auth.Middleware(sec, "admin")
	mux.Handle("GET /api/admin/categories", ad(http.HandlerFunc(s.handleAdminCategories)))
	mux.Handle("POST /api/admin/categories", ad(http.HandlerFunc(s.handleAdminCreateCategory)))
	mux.Handle("PUT /api/admin/categories/{id}", ad(http.HandlerFunc(s.handleAdminUpdateCategory)))
	mux.Handle("GET /api/admin/routing", ad(http.HandlerFunc(s.handleAdminRouting)))
	mux.Handle("PUT /api/admin/routing/{categoryId}", ad(http.HandlerFunc(s.handleAdminSetRouting)))
	mux.Handle("GET /api/admin/staff", ad(http.HandlerFunc(s.handleAdminStaff)))
	mux.Handle("POST /api/admin/staff", ad(http.HandlerFunc(s.handleAdminCreateStaff)))
	mux.Handle("PUT /api/admin/staff/{id}", ad(http.HandlerFunc(s.handleAdminUpdateStaff)))
	mux.Handle("GET /api/admin/tickets", ad(http.HandlerFunc(s.handleAdminTickets)))
	mux.Handle("POST /api/admin/tickets/{id}/override", ad(http.HandlerFunc(s.handleAdminOverride)))
	mux.Handle("GET /api/admin/audit", ad(http.HandlerFunc(s.handleAdminAudit)))
	mux.Handle("GET /api/admin/alerts", ad(http.HandlerFunc(s.handleAdminAlerts)))
	mux.Handle("GET /api/admin/escalations", ad(http.HandlerFunc(s.handleAdminEscalations)))

	// --- Аналитика ---
	an := auth.Middleware(sec, "operator", "expert", "admin")
	mux.Handle("GET /api/analytics/dashboard", an(http.HandlerFunc(s.handleAnalyticsDashboard)))
	mux.Handle("GET /api/analytics/export", an(http.HandlerFunc(s.handleAnalyticsExport)))

	// Раздача обезличенных вложений по неугадываемому имени (capability URL).
	mux.Handle("GET /uploads/", http.StripPrefix("/uploads/", http.FileServer(http.Dir(s.Cfg.UploadDir))))

	return withCORS(mux)
}

// --- Хелперы ---

func writeJSON(w http.ResponseWriter, code int, v interface{}) {
	w.Header().Set("Content-Type", "application/json; charset=utf-8")
	w.WriteHeader(code)
	_ = json.NewEncoder(w).Encode(v)
}

func writeErr(w http.ResponseWriter, code int, msg string) {
	writeJSON(w, code, map[string]string{"error": msg})
}

func readJSON(r *http.Request, v interface{}) error {
	defer r.Body.Close()
	return json.NewDecoder(r.Body).Decode(v)
}

func pathID(r *http.Request, key string) (int64, error) {
	return strconv.ParseInt(r.PathValue(key), 10, 64)
}

func clientIP(r *http.Request) string {
	if xf := r.Header.Get("X-Real-IP"); xf != "" {
		return xf
	}
	if xf := r.Header.Get("X-Forwarded-For"); xf != "" {
		return strings.Split(xf, ",")[0]
	}
	host, _, err := net.SplitHostPort(r.RemoteAddr)
	if err != nil {
		return r.RemoteAddr
	}
	return host
}

func withCORS(next http.Handler) http.Handler {
	return http.HandlerFunc(func(w http.ResponseWriter, r *http.Request) {
		w.Header().Set("Access-Control-Allow-Origin", "*")
		w.Header().Set("Access-Control-Allow-Methods", "GET,POST,PUT,DELETE,OPTIONS")
		w.Header().Set("Access-Control-Allow-Headers", "Authorization,Content-Type")
		if r.Method == http.MethodOptions {
			w.WriteHeader(http.StatusNoContent)
			return
		}
		next.ServeHTTP(w, r)
	})
}
