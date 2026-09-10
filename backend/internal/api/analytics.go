package api

import (
	"encoding/csv"
	"fmt"
	"net/http"
	"time"

	"otklik/internal/auth"
	"otklik/internal/xlsxwriter"
)

// scopeClause возвращает доп. условие под роль (по себе / всё). Колонки с префиксом t.
func (s *Server) scopeClause(c auth.Claims, startArg int) (string, []interface{}) {
	switch c.Role {
	case "operator":
		return fmt.Sprintf(" AND t.operator_id=$%d", startArg), []interface{}{c.StaffID}
	case "expert":
		return fmt.Sprintf(" AND t.assigned_expert_id=$%d", startArg), []interface{}{c.StaffID}
	default:
		return "", nil
	}
}

// GET /api/analytics/dashboard?from=&to=
func (s *Server) handleAnalyticsDashboard(w http.ResponseWriter, r *http.Request) {
	c, _ := auth.FromContext(r.Context())
	from, to := periodFrom(r)

	where := " WHERE t.created_at >= $1 AND t.created_at < $2"
	args := []interface{}{from, to}
	scope, scopeArgs := s.scopeClause(c, 3)
	where += scope
	args = append(args, scopeArgs...)

	count := func(extra string) int {
		var n int
		s.DB.QueryRow(`SELECT count(*) FROM tickets t`+where+extra, args...).Scan(&n)
		return n
	}
	total := count("")

	groupCount := func(col string) map[string]int {
		res := map[string]int{}
		rows, _ := s.DB.Query(`SELECT COALESCE(`+col+`::text,'—'), count(*) FROM tickets t`+where+` GROUP BY 1`, args...)
		if rows != nil {
			defer rows.Close()
			for rows.Next() {
				var k string
				var n int
				rows.Scan(&k, &n)
				res[k] = n
			}
		}
		return res
	}

	byCategory := map[string]int{}
	{
		rows, _ := s.DB.Query(`SELECT COALESCE(c.title,'Без категории'), count(*)
			FROM tickets t LEFT JOIN categories c ON c.id=t.category_id`+where+` GROUP BY 1`, args...)
		if rows != nil {
			for rows.Next() {
				var k string
				var n int
				rows.Scan(&k, &n)
				byCategory[k] = n
			}
			rows.Close()
		}
	}

	avgMinutes := func(expr string) *float64 {
		var v *float64
		s.DB.QueryRow(`SELECT AVG(EXTRACT(EPOCH FROM (`+expr+`))/60.0) FROM tickets t`+where+` AND `+expr+` IS NOT NULL`, args...).Scan(&v)
		return v
	}

	urgent := count(" AND t.priority='urgent'")
	returns := count(" AND t.return_count>0")
	crisis := count(" AND t.is_crisis=true")

	loadOperators := map[string]int{}
	loadExperts := map[string]int{}
	if c.Role == "admin" {
		lo, _ := s.DB.Query(`SELECT st.display_name, count(*) FROM tickets t JOIN staff st ON st.id=t.operator_id`+where+` GROUP BY st.display_name`, args...)
		if lo != nil {
			for lo.Next() {
				var k string
				var n int
				lo.Scan(&k, &n)
				loadOperators[k] = n
			}
			lo.Close()
		}
		le, _ := s.DB.Query(`SELECT st.display_name, count(*) FROM tickets t JOIN staff st ON st.id=t.assigned_expert_id`+where+` GROUP BY st.display_name`, args...)
		if le != nil {
			for le.Next() {
				var k string
				var n int
				le.Scan(&k, &n)
				loadExperts[k] = n
			}
			le.Close()
		}
	}

	share := func(n int) float64 {
		if total == 0 {
			return 0
		}
		return float64(n) / float64(total) * 100
	}

	writeJSON(w, 200, map[string]interface{}{
		"period":                        map[string]interface{}{"from": from, "to": to},
		"total":                         total,
		"by_category":                   byCategory,
		"by_applicant_type":             groupCount("t.applicant_type"),
		"by_status":                     groupCount("t.status"),
		"avg_minutes_to_accept":         avgMinutes("t.accepted_at - t.created_at"),
		"avg_minutes_to_first_response": avgMinutes("t.first_response_at - t.created_at"),
		"avg_minutes_to_close":          avgMinutes("t.closed_at - t.created_at"),
		"urgent_share":                  share(urgent),
		"returns_share":                 share(returns),
		"crisis_share":                  share(crisis),
		"load_operators":                loadOperators,
		"load_experts":                  loadExperts,
	})
}

// GET /api/analytics/export?format=csv — только обезличенные метаданные (без текстов и переписки).
func (s *Server) handleAnalyticsExport(w http.ResponseWriter, r *http.Request) {
	c, _ := auth.FromContext(r.Context())
	from, to := periodFrom(r)
	where := " WHERE t.created_at >= $1 AND t.created_at < $2"
	args := []interface{}{from, to}
	scope, scopeArgs := s.scopeClause(c, 3)
	where += scope
	args = append(args, scopeArgs...)

	rows, err := s.DB.Query(`
		SELECT t.id, t.applicant_type, COALESCE(c.title,''), t.status, t.priority, t.is_crisis,
		       t.return_count, COALESCE(t.rating,0), t.created_at, t.accepted_at, t.first_response_at, t.closed_at
		FROM tickets t LEFT JOIN categories c ON c.id=t.category_id`+where+` ORDER BY t.id`, args...)
	if err != nil {
		writeErr(w, 500, "ошибка выгрузки")
		return
	}
	defer rows.Close()

	// Собираем только обезличенные метаданные (без текстов и переписки).
	table := [][]string{{"id", "тип_заявителя", "категория", "статус", "приоритет", "кризис", "возвраты", "оценка", "создано", "принято", "первый_ответ", "закрыто"}}
	for rows.Next() {
		var id int64
		var atype, cat, status, priority string
		var crisis bool
		var rc, rating int
		var created time.Time
		var accepted, first, closed *time.Time
		rows.Scan(&id, &atype, &cat, &status, &priority, &crisis, &rc, &rating, &created, &accepted, &first, &closed)
		table = append(table, []string{
			fmt.Sprint(id), atype, cat, StatusRU[status], priority, boolRU(crisis),
			fmt.Sprint(rc), fmt.Sprint(rating), ts(&created), ts(accepted), ts(first), ts(closed),
		})
	}

	if r.URL.Query().Get("format") == "xlsx" {
		w.Header().Set("Content-Type", "application/vnd.openxmlformats-officedocument.spreadsheetml.sheet")
		w.Header().Set("Content-Disposition", "attachment; filename=otklik_export.xlsx")
		if err := xlsxwriter.Write(w, "Отклик", table); err != nil {
			writeErr(w, 500, "ошибка формирования xlsx")
		}
		return
	}

	w.Header().Set("Content-Type", "text/csv; charset=utf-8")
	w.Header().Set("Content-Disposition", "attachment; filename=otklik_export.csv")
	w.Write([]byte{0xEF, 0xBB, 0xBF}) // BOM для кириллицы в Excel
	cw := csv.NewWriter(w)
	cw.Comma = ';'
	for _, row := range table {
		cw.Write(row)
	}
	cw.Flush()
}

func periodFrom(r *http.Request) (time.Time, time.Time) {
	to := time.Now().Add(time.Minute)
	from := to.AddDate(-1, 0, 0)
	if v := r.URL.Query().Get("from"); v != "" {
		if t, err := time.Parse("2006-01-02", v); err == nil {
			from = t
		}
	}
	if v := r.URL.Query().Get("to"); v != "" {
		if t, err := time.Parse("2006-01-02", v); err == nil {
			to = t.AddDate(0, 0, 1)
		}
	}
	return from, to
}

func ts(t *time.Time) string {
	if t == nil {
		return ""
	}
	return t.Format("2006-01-02 15:04")
}

func boolRU(b bool) string {
	if b {
		return "да"
	}
	return "нет"
}
