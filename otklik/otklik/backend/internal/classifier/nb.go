// Package classifier — многоклассовый наивный байесовский классификатор
// свободного текста по категориям. Обучается на небольшом сид-наборе при старте.
package classifier

import (
	"math"
	"strings"
	"unicode"
)

type NaiveBayes struct {
	classes   []string
	priors    map[string]float64
	wordCount map[string]map[string]float64 // class -> word -> count
	classTot  map[string]float64            // class -> total words
	vocab     map[string]bool
}

// TrainingExample — пример: текст и метка-категория (slug).
type TrainingExample struct {
	Text  string
	Label string
}

func tokenize(text string) []string {
	fields := strings.FieldsFunc(strings.ToLower(text), func(r rune) bool {
		return !unicode.IsLetter(r) && !unicode.IsDigit(r)
	})
	out := fields[:0]
	for _, f := range fields {
		r := []rune(f)
		if len(r) < 3 {
			continue // отбрасываем короткие/шумовые токены
		}
		// стемминг «на бедного»: обрезаем длинные окончания
		if len(r) > 6 {
			f = string(r[:len(r)-2])
		}
		out = append(out, f)
	}
	return out
}

// Train строит модель по примерам.
func Train(examples []TrainingExample) *NaiveBayes {
	nb := &NaiveBayes{
		priors:    map[string]float64{},
		wordCount: map[string]map[string]float64{},
		classTot:  map[string]float64{},
		vocab:     map[string]bool{},
	}
	classDocs := map[string]int{}
	for _, ex := range examples {
		classDocs[ex.Label]++
		if nb.wordCount[ex.Label] == nil {
			nb.wordCount[ex.Label] = map[string]float64{}
		}
		for _, tok := range tokenize(ex.Text) {
			nb.wordCount[ex.Label][tok]++
			nb.classTot[ex.Label]++
			nb.vocab[tok] = true
		}
	}
	total := float64(len(examples))
	for c, n := range classDocs {
		nb.classes = append(nb.classes, c)
		nb.priors[c] = math.Log(float64(n) / total)
	}
	return nb
}

// Classify возвращает наиболее вероятную метку и уверенность (0..1).
func (nb *NaiveBayes) Classify(text string) (string, float64) {
	tokens := tokenize(text)
	if len(tokens) == 0 || len(nb.classes) == 0 {
		return "", 0
	}
	vocabSize := float64(len(nb.vocab))
	scores := map[string]float64{}
	for _, c := range nb.classes {
		score := nb.priors[c]
		denom := nb.classTot[c] + vocabSize
		for _, tok := range tokens {
			count := nb.wordCount[c][tok]
			score += math.Log((count + 1) / denom) // сглаживание Лапласа
		}
		scores[c] = score
	}
	// argmax + softmax-уверенность
	best := nb.classes[0]
	for _, c := range nb.classes {
		if scores[c] > scores[best] {
			best = c
		}
	}
	var sum, maxScore float64
	maxScore = scores[best]
	for _, c := range nb.classes {
		sum += math.Exp(scores[c] - maxScore)
	}
	confidence := 1.0 / sum
	return best, confidence
}

// DefaultTrainingSet — стартовый обучающий набор (RU), по категориям справочника.
func DefaultTrainingSet() []TrainingExample {
	return []TrainingExample{
		// bullying — травля и оскорбления
		{"меня постоянно обзывают и унижают в школе", "bullying"},
		{"надо мной смеются одноклассники, обзывают дразнят", "bullying"},
		{"меня травят, оскорбляют, издеваются каждый день", "bullying"},
		{"унижают перед всем классом, обидные прозвища", "bullying"},
		// classmates — конфликт с одноклассниками
		{"поругался с одноклассниками, не общаемся", "classmates"},
		{"конфликт с ребятами в классе, разосрались", "classmates"},
		{"друзья отвернулись, ссора с одноклассниками", "classmates"},
		{"не могу найти общий язык с классом", "classmates"},
		// cyberbullying — кибербуллинг
		{"мне пишут гадости в переписке и в соцсетях", "cyberbullying"},
		{"выложили мои фото в интернете, травят в чате", "cyberbullying"},
		{"угрожают в мессенджере, скидывают скриншоты", "cyberbullying"},
		{"создали фейковую страницу и оскорбляют онлайн", "cyberbullying"},
		// pressure — давление и угрозы
		{"мне угрожают и заставляют что-то делать", "pressure"},
		{"на меня давят, шантажируют, требуют деньги", "pressure"},
		{"старшие угрожают расправой, запугивают", "pressure"},
		{"заставляют силой, давление и угрозы", "pressure"},
		// teacher — конфликт с учителем
		{"учитель придирается и занижает оценки", "teacher"},
		{"конфликт с преподавателем, несправедливо относится", "teacher"},
		{"учительница кричит на меня перед классом", "teacher"},
		{"проблемы с педагогом, предвзятое отношение", "teacher"},
		// parents — конфликт с родителями
		{"постоянные ссоры с родителями дома", "parents"},
		{"мама и папа не понимают, скандалы дома", "parents"},
		{"конфликт с родителями, ругаемся из-за учёбы", "parents"},
		{"дома напряжённая обстановка, ссоры в семье", "parents"},
		// legal — вопрос юридического характера
		{"хочу узнать свои права, юридический вопрос", "legal"},
		{"нужна консультация юриста по закону", "legal"},
		{"как правильно оформить документы по закону", "legal"},
		{"вопрос о правах несовершеннолетних и законе", "legal"},
	}
}
