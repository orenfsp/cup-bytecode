package crisis

import "strings"

// Detect ищет кризисные маркеры из словаря в тексте (регистронезависимо).
// Возвращает признак кризиса и список найденных маркеров.
func Detect(text string, keywords []string) (bool, []string) {
	low := strings.ToLower(text)
	var found []string
	for _, kw := range keywords {
		k := strings.ToLower(strings.TrimSpace(kw))
		if k == "" {
			continue
		}
		if strings.Contains(low, k) {
			found = append(found, kw)
		}
	}
	return len(found) > 0, found
}

// Contacts — контакты экстренной и кризисной помощи (согласуются с организаторами).
type Contact struct {
	Title string `json:"title"`
	Phone string `json:"phone"`
	Note  string `json:"note"`
}

func Contacts() []Contact {
	return []Contact{
		{Title: "Единый номер экстренных служб", Phone: "112", Note: "Круглосуточно, если есть угроза жизни или здоровью"},
		{Title: "Детский телефон доверия", Phone: "8-800-2000-122", Note: "Бесплатно, анонимно, круглосуточно"},
		{Title: "Экстренная психологическая помощь МЧС", Phone: "8-495-989-50-50", Note: "Психологи, круглосуточно"},
	}
}
