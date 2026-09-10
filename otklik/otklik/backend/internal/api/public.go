package api

import (
	"database/sql"
	"encoding/json"
	"net/http"
	"strconv"
	"strings"
	"time"

	"otklik/internal/crisis"
	"otklik/internal/tracknum"
	"otklik/internal/upload"
)

// GET /api/categories
func (s *Server) handleCategories(w http.ResponseWriter, r *http.Request) {
	rows, err := s.DB.Query(`SELECT id, slug, title, is_free_text FROM categories WHERE active ORDER BY sort_order, id`)
	if err != nil {
		writeErr(w, 500, "не удалось загрузить категории")
		return
	}
	defer rows.Close()
	type cat struct {
		ID         int64  `json:"id"`
		Slug       string `json:"slug"`
		Title      string `json:"title"`
		IsFreeText bool   `json:"is_free_text"`
	}
	out := []cat{}
	for rows.Next() {
		var c cat
		rows.Scan(&c.ID, &c.Slug, &c.Title, &c.IsFreeText)
		out = append(out, c)
	}
	writeJSON(w, 200, out)
}

// GET /api/crisis-contacts
func (s *Server) handleCrisisContacts(w http.ResponseWriter, r *http.Request) {
	writeJSON(w, 200, crisis.Contacts())
}

// POST /api/tickets  (multipart/form-data)
func (s *Server) handleCreateTicket(w http.ResponseWriter, r *http.Request) {
	if err := r.ParseMultipartForm(64 << 20); err != nil {
		writeErr(w, 400, "не удалось прочитать форму")
		return
	}
	applicantType := r.FormValue("applicant_type")
	if applicantType != "student" && applicantType != "parent" && applicantType != "teacher" {
		writeErr(w, 400, "выбери, от чьего лица обращение")
		return
	}
	freeText := strings.TrimSpace(r.FormValue("free_text"))
	answersRaw := r.FormValue("clarifying_answers")
	if answersRaw == "" {
		answersRaw = "{}"
	}
	contact := strings.TrimSpace(r.FormValue("contact_info"))

	var categoryID *int64
	if v := r.FormValue("category_id"); v != "" {
		if id, err := strconv.ParseInt(v, 10, 64); err == nil {
			categoryID = &id
		}
	}

	if freeText == "" && categoryID == nil {
		writeErr(w, 400, "Расскажи о том, что происходит, своими словами — или выбери ситуацию из списка")
		return
	}

	// Кризисная детекция по тексту + ответам на уточняющие вопросы.
	keywords := s.loadCrisisKeywords()
	scan := freeText + " " + answersRaw
	isCrisis, _ := crisis.Detect(scan, keywords)

	// Подсказка системы по категории (авто-классификация свободного текста).
	suggested := s.suggestCategory(freeText, categoryID)

	track, err := tracknum.Generate()
	if err != nil {
		writeErr(w, 500, "внутренняя ошибка")
		return
	}
	hash := tracknum.Hash(s.Cfg.TrackPepper, track)

	var contactVal interface{}
	if contact != "" {
		if enc, err := s.Box.Encrypt(contact); err == nil {
			contactVal = enc
		}
	}

	var ticketID int64
	err = s.DB.QueryRow(`
		INSERT INTO tickets (track_hash, applicant_type, category_id, suggested_category_id, free_text, clarifying_answers, is_crisis, contact_info, priority)
		VALUES ($1,$2,$3,$4,$5,$6::jsonb,$7,$8,'standard')
		RETURNING id`,
		hash, applicantType, categoryID, suggested, nullIfEmpty(freeText, "(без описания, выбрана категория)"), answersRaw, isCrisis, contactVal,
	).Scan(&ticketID)
	if err != nil {
		writeErr(w, 500, "не удалось сохранить обращение")
		return
	}

	// Вложения (до 5 изображений, до 10 МБ, EXIF вырезается).
	if s.MultipartFiles(r) != nil {
		files := s.MultipartFiles(r)
		if len(files) > upload.MaxFiles {
			files = files[:upload.MaxFiles]
		}
		for _, fh := range files {
			f, err := fh.Open()
			if err != nil {
				continue
			}
			saved, err := upload.SaveStripped(s.Cfg.UploadDir, f, fh.Header.Get("Content-Type"))
			f.Close()
			if err != nil {
				continue
			}
			s.DB.Exec(`INSERT INTO attachments (ticket_id, filename, stored_name, content_type, size_bytes) VALUES ($1,$2,$3,$4,$5)`,
				ticketID, fh.Filename, saved.StoredName, saved.ContentType, saved.Size)
		}
	}

	s.audit(ticketID, nil, "applicant", "create", "обращение создано")

	resp := map[string]interface{}{
		"track_number": track, // показывается ОДИН раз, восстановить нельзя
		"status":       "new",
		"status_ru":    StatusRU["new"],
		"is_crisis":    isCrisis,
		"message":      supportiveThanks(applicantType),
	}
	if isCrisis {
		resp["crisis_contacts"] = crisis.Contacts()
	}
	writeJSON(w, 201, resp)
}

func supportiveThanks(t string) string {
	if t == "student" {
		return "Спасибо, что поделился. Мы получили твоё обращение и скоро передадим его специалисту."
	}
	return "Спасибо, что поделились. Мы получили ваше обращение и скоро передадим его специалисту."
}

// POST /api/applicant/lookup {track}
func (s *Server) handleLookup(w http.ResponseWriter, r *http.Request) {
	// Ограничение попыток подбора трек-номера.
	if !s.Limiter.Allow(clientIP(r)) {
		writeErr(w, 429, "Слишком много попыток. Подожди немного и попробуй снова.")
		return
	}
	var body struct {
		Track string `json:"track"`
	}
	if err := readJSON(r, &body); err != nil || strings.TrimSpace(body.Track) == "" {
		writeErr(w, 400, "введите трек-номер")
		return
	}
	t, ok := s.ticketByTrack(body.Track)
	if !ok {
		writeErr(w, 404, "Не нашли обращение по этому номеру. Проверь, пожалуйста, символы.")
		return
	}
	writeJSON(w, 200, s.applicantView(t))
}

// POST /api/applicant/messages {track, body}
func (s *Server) handleApplicantMessage(w http.ResponseWriter, r *http.Request) {
	var b struct{ Track, Body string }
	if err := readJSON(r, &b); err != nil || strings.TrimSpace(b.Body) == "" {
		writeErr(w, 400, "напиши сообщение")
		return
	}
	t, ok := s.ticketByTrack(b.Track)
	if !ok {
		writeErr(w, 404, "обращение не найдено")
		return
	}
	s.DB.Exec(`INSERT INTO messages (ticket_id, author_kind, body) VALUES ($1,'applicant',$2)`, t.ID, strings.TrimSpace(b.Body))
	// Если ждали уточнение — возвращаем в работу.
	if t.Status == "need_clarification" {
		s.setStatus(t.ID, "in_progress", nil, "applicant", "заявитель ответил на уточнение")
	}
	s.touch(t.ID)
	s.notify(t.ID, "update")
	writeJSON(w, 200, map[string]string{"ok": "1"})
}

// POST /api/applicant/resolve {track, action: helped|not_helped, comment}
func (s *Server) handleApplicantResolve(w http.ResponseWriter, r *http.Request) {
	var b struct{ Track, Action, Comment string }
	if err := readJSON(r, &b); err != nil {
		writeErr(w, 400, "некорректный запрос")
		return
	}
	t, ok := s.ticketByTrack(b.Track)
	if !ok {
		writeErr(w, 404, "обращение не найдено")
		return
	}
	if t.Status != "answer_ready" {
		writeErr(w, 409, "действие сейчас недоступно")
		return
	}
	if b.Action == "helped" {
		s.DB.Exec(`UPDATE tickets SET status='done', closed_at=now(), updated_at=now() WHERE id=$1`, t.ID)
		s.audit(t.ID, nil, "applicant", "confirm_close", "заявитель подтвердил закрытие")
		writeJSON(w, 200, map[string]string{"status": "done"})
		return
	}
	// not_helped -> возврат оператору (не сразу эксперту)
	if b.Action == "not_helped" {
		if t.ReturnCount >= 2 {
			writeErr(w, 409, "Достигнут лимит возвратов. Оператор свяжется по этой ситуации отдельно.")
			return
		}
		s.DB.Exec(`UPDATE tickets SET status='returned', return_count=return_count+1, assigned_expert_id=NULL, updated_at=now() WHERE id=$1`, t.ID)
		if c := strings.TrimSpace(b.Comment); c != "" {
			s.DB.Exec(`INSERT INTO messages (ticket_id, author_kind, body) VALUES ($1,'applicant',$2)`, t.ID, "Чего не хватило: "+c)
		}
		s.audit(t.ID, nil, "applicant", "return", "заявитель вернул обращение: "+b.Comment)
		writeJSON(w, 200, map[string]string{"status": "returned"})
		return
	}
	writeErr(w, 400, "неизвестное действие")
}

// POST /api/applicant/rate {track, rating, comment}
func (s *Server) handleApplicantRate(w http.ResponseWriter, r *http.Request) {
	var b struct {
		Track   string `json:"track"`
		Rating  int    `json:"rating"`
		Comment string `json:"comment"`
	}
	if err := readJSON(r, &b); err != nil || b.Rating < 1 || b.Rating > 5 {
		writeErr(w, 400, "поставь оценку от 1 до 5")
		return
	}
	t, ok := s.ticketByTrack(b.Track)
	if !ok {
		writeErr(w, 404, "обращение не найдено")
		return
	}
	s.DB.Exec(`UPDATE tickets SET rating=$1, rating_comment=$2, updated_at=now() WHERE id=$3`, b.Rating, b.Comment, t.ID)
	writeJSON(w, 200, map[string]string{"ok": "1"})
}

// POST /api/applicant/complaint {track, body} — жалоба уходит оператору, эксперт её не видит
func (s *Server) handleApplicantComplaint(w http.ResponseWriter, r *http.Request) {
	var b struct{ Track, Body string }
	if err := readJSON(r, &b); err != nil || strings.TrimSpace(b.Body) == "" {
		writeErr(w, 400, "опиши, что случилось")
		return
	}
	t, ok := s.ticketByTrack(b.Track)
	if !ok {
		writeErr(w, 404, "обращение не найдено")
		return
	}
	s.DB.Exec(`INSERT INTO complaints (ticket_id, body) VALUES ($1,$2)`, t.ID, strings.TrimSpace(b.Body))
	writeJSON(w, 200, map[string]string{"ok": "1"})
}

// POST /api/applicant/contact {track, contact} — способ связи хранится отдельно
func (s *Server) handleApplicantContact(w http.ResponseWriter, r *http.Request) {
	var b struct{ Track, Contact string }
	if err := readJSON(r, &b); err != nil {
		writeErr(w, 400, "некорректный запрос")
		return
	}
	t, ok := s.ticketByTrack(b.Track)
	if !ok {
		writeErr(w, 404, "обращение не найдено")
		return
	}
	enc, _ := s.Box.Encrypt(strings.TrimSpace(b.Contact))
	s.DB.Exec(`UPDATE tickets SET contact_info=$1, updated_at=now() WHERE id=$2`, enc, t.ID)
	s.audit(t.ID, nil, "applicant", "contact_added", "заявитель оставил способ связи")
	writeJSON(w, 200, map[string]string{"ok": "1"})
}

// --- вспомогательное ---

func (s *Server) loadCrisisKeywords() []string {
	rows, err := s.DB.Query(`SELECT keyword FROM crisis_keywords`)
	if err != nil {
		return nil
	}
	defer rows.Close()
	var out []string
	for rows.Next() {
		var k string
		rows.Scan(&k)
		out = append(out, k)
	}
	return out
}

// suggestCategory — простая эвристическая классификация по ключевым словам.
func (s *Server) suggestCategory(text string, chosen *int64) *int64 {
	if chosen != nil {
		// Если выбрана конкретная (не «не знаю»), подсказка не нужна.
		var isFree bool
		s.DB.QueryRow(`SELECT is_free_text FROM categories WHERE id=$1`, *chosen).Scan(&isFree)
		if !isFree {
			return nil
		}
	}
	if strings.TrimSpace(text) == "" {
		return nil
	}

	// 1) ML: наивный байесовский классификатор.
	best := ""
	if slug, conf := s.Classifier.Classify(text); conf >= 0.30 {
		best = slug
	}

	// 2) Фолбэк: словарная эвристика, если модель не уверена.
	if best == "" {
		low := strings.ToLower(text)
		rules := map[string][]string{
			"cyberbullying": {"переписк", "телефон", "в интернете", "соцсет", "чат", "скрин", "онлайн"},
			"bullying":      {"травят", "травля", "издева", "обзыва", "унижа", "смеются"},
			"classmates":    {"одноклассник", "класс", "друзья", "ребята"},
			"teacher":       {"учитель", "учительница", "педагог", "преподаватель", "оценк"},
			"parents":       {"родител", "мама", "папа", "дома", "семья"},
			"legal":         {"закон", "прав", "полиц", "юрист", "документ"},
			"pressure":      {"угроз", "давлен", "заставля", "шантаж"},
		}
		bestScore := 0
		for slug, kws := range rules {
			score := 0
			for _, k := range kws {
				if strings.Contains(low, k) {
					score++
				}
			}
			if score > bestScore {
				bestScore = score
				best = slug
			}
		}
	}

	if best == "" {
		return nil
	}
	var id int64
	if err := s.DB.QueryRow(`SELECT id FROM categories WHERE slug=$1`, best).Scan(&id); err != nil {
		return nil
	}
	return &id
}

func nullIfEmpty(s, def string) string {
	if strings.TrimSpace(s) == "" {
		return def
	}
	return s
}

// applicantView собирает то, что видит заявитель.
func (s *Server) applicantView(t ticket) map[string]interface{} {
	msgs := []map[string]interface{}{}
	rows, _ := s.DB.Query(`SELECT author_kind, COALESCE(voice_label,''), body, created_at FROM messages WHERE ticket_id=$1 ORDER BY created_at`, t.ID)
	if rows != nil {
		for rows.Next() {
			var kind, voice, body string
			var at time.Time
			rows.Scan(&kind, &voice, &body, &at)
			from := "Ты"
			if kind == "specialist" {
				from = "Специалист"
				if voice != "" {
					from = voice
				}
			}
			msgs = append(msgs, map[string]interface{}{"kind": kind, "from": from, "body": body, "at": at})
		}
		rows.Close()
	}

	atts := s.attachmentsOf(t.ID)

	var catTitle *string
	if t.CategoryID != nil {
		var ct string
		if err := s.DB.QueryRow(`SELECT title FROM categories WHERE id=$1`, *t.CategoryID).Scan(&ct); err == nil {
			catTitle = &ct
		}
	}

	view := map[string]interface{}{
		"status":       t.Status,
		"status_ru":    StatusRU[t.Status],
		"status_hint":  statusHint(t.Status, t.ApplicantType),
		"priority":     t.Priority,
		"is_crisis":    t.IsCrisis,
		"applicant_type": t.ApplicantType,
		"category":     catTitle,
		"free_text":    t.FreeText,
		"created_at":   t.CreatedAt,
		"messages":     msgs,
		"attachments":  atts,
		"has_contact":  t.ContactInfo != nil,
		"rating":       t.Rating,
	}
	if t.Status == "rejected" && t.RejectReason != nil {
		view["reject_reason"] = *t.RejectReason
		view["reject_contacts"] = crisis.Contacts()
	}
	if t.IsCrisis {
		view["crisis_contacts"] = crisis.Contacts()
	}
	return view
}

func (s *Server) attachmentsOf(ticketID int64) []map[string]interface{} {
	atts := []map[string]interface{}{}
	rows, _ := s.DB.Query(`SELECT stored_name, content_type, size_bytes FROM attachments WHERE ticket_id=$1 ORDER BY id`, ticketID)
	if rows == nil {
		return atts
	}
	defer rows.Close()
	for rows.Next() {
		var name, ct string
		var size int64
		rows.Scan(&name, &ct, &size)
		atts = append(atts, map[string]interface{}{"url": "/uploads/" + name, "content_type": ct, "size": size})
	}
	return atts
}

// clarifyingJSON парсит JSONB ответов на уточняющие вопросы.
func clarifyingJSON(raw string) map[string]interface{} {
	m := map[string]interface{}{}
	_ = json.Unmarshal([]byte(raw), &m)
	return m
}

var _ = sql.ErrNoRows
