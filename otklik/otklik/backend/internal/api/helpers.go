package api

import "database/sql"

func validPriority(p string) bool {
	return p == "urgent" || p == "standard" || p == "low"
}

var groupRU = map[string]string{
	"psychologist":    "Психологи",
	"conflictologist": "Конфликтологи",
	"lawyer":          "Юристы",
	"social_teacher":  "Социальные педагоги",
}

func nsToPtr(ns sql.NullString) *string {
	if ns.Valid {
		v := ns.String
		return &v
	}
	return nil
}

func niToPtr(ni sql.NullInt64) *int64 {
	if ni.Valid {
		v := ni.Int64
		return &v
	}
	return nil
}

func (s *Server) categoryTitle(id int64) *string {
	var t string
	if err := s.DB.QueryRow(`SELECT title FROM categories WHERE id=$1`, id).Scan(&t); err != nil {
		return nil
	}
	return &t
}

type expertLoad struct {
	ID          int64  `json:"id"`
	Name        string `json:"name"`
	Group       string `json:"group"`
	GroupRU     string `json:"group_ru"`
	Voice       string `json:"voice_label"`
	ActiveLimit int    `json:"active_limit"`
	Load        int    `json:"load"`
	Overloaded  bool   `json:"overloaded"`
}

// expertsWithLoad возвращает экспертов (опционально из группы) с текущей нагрузкой.
func (s *Server) expertsWithLoad(group string) []expertLoad {
	q := `
		SELECT st.id, st.display_name, COALESCE(st.specialist_group,''), COALESCE(st.voice_label,''), st.active_limit,
		       (SELECT count(*) FROM tickets t WHERE t.assigned_expert_id=st.id
		          AND t.status IN ('distributed','in_progress','need_clarification','answer_ready')) AS load
		FROM staff st
		WHERE st.role='expert' AND st.active`
	args := []interface{}{}
	if group != "" {
		q += ` AND st.specialist_group=$1`
		args = append(args, group)
	}
	q += ` ORDER BY load ASC, st.display_name`
	rows, err := s.DB.Query(q, args...)
	out := []expertLoad{}
	if err != nil {
		return out
	}
	defer rows.Close()
	for rows.Next() {
		var e expertLoad
		rows.Scan(&e.ID, &e.Name, &e.Group, &e.Voice, &e.ActiveLimit, &e.Load)
		e.GroupRU = groupRU[e.Group]
		e.Overloaded = e.Load >= e.ActiveLimit
		out = append(out, e)
	}
	return out
}

// routingSuggestion — подсказка системы оператору по правилам маршрутизации.
func (s *Server) routingSuggestion(suggestedCategoryID, categoryID *int64) map[string]interface{} {
	catID := categoryID
	if catID == nil {
		catID = suggestedCategoryID
	}
	res := map[string]interface{}{
		"group": nil, "group_ru": nil, "candidates": []expertLoad{},
		"suggested_expert": nil, "none_found": false, "all_overloaded": false,
		"message": "Правило маршрутизации не задано — назначьте исполнителя вручную.",
	}
	if catID == nil {
		return res
	}
	var group string
	var limit int
	err := s.DB.QueryRow(`SELECT specialist_group, load_limit FROM routing_rules WHERE category_id=$1`, *catID).Scan(&group, &limit)
	if err != nil {
		return res
	}
	experts := s.expertsWithLoad(group)
	res["group"] = group
	res["group_ru"] = groupRU[group]
	res["candidates"] = experts

	if len(experts) == 0 {
		res["none_found"] = true
		res["message"] = "Подходящий исполнитель не найден. Обращение осталось в очереди, администратор оповещён."
		return res
	}
	// первый свободный (не перегруженный)
	var best *expertLoad
	allOver := true
	for i := range experts {
		if !experts[i].Overloaded {
			allOver = false
			if best == nil || experts[i].Load < best.Load {
				best = &experts[i]
			}
		}
	}
	if allOver {
		res["all_overloaded"] = true
		res["suggested_expert"] = experts[0] // наименее загруженный
		res["message"] = "Все исполнители группы «" + groupRU[group] + "» перегружены. Предлагаем наименее загруженного."
	} else {
		res["suggested_expert"] = *best
		res["message"] = "По правилу это группа «" + groupRU[group] + "», свободен: " + best.Name
	}
	return res
}
