package tracknum

import (
	"crypto/rand"
	"crypto/sha256"
	"encoding/hex"
	"math/big"
	"strings"
	"sync"
	"time"
)

// Алфавит без визуально спорных символов: нет 0/O, 1/I/L.
const alphabet = "ABCDEFGHJKMNPQRSTUVWXYZ23456789"

// Generate возвращает трек-номер вида ОТК-XXXX-XXXX,
// используя криптостойкий источник случайности.
func Generate() (string, error) {
	var sb strings.Builder
	sb.WriteString("ОТК-")
	for i := 0; i < 8; i++ {
		n, err := rand.Int(rand.Reader, big.NewInt(int64(len(alphabet))))
		if err != nil {
			return "", err
		}
		sb.WriteByte(alphabet[n.Int64()])
		if i == 3 {
			sb.WriteByte('-')
		}
	}
	return sb.String(), nil
}

// Normalize приводит введённый пользователем номер к каноническому виду.
func Normalize(s string) string {
	return strings.ToUpper(strings.TrimSpace(s))
}

// Hash считает необратимый хеш трек-номера с pepper.
func Hash(pepper, track string) string {
	sum := sha256.Sum256([]byte(pepper + ":" + Normalize(track)))
	return hex.EncodeToString(sum[:])
}

// --- Ограничение попыток проверки статуса (не более N в минуту с адреса) ---

type Limiter struct {
	mu       sync.Mutex
	hits     map[string][]time.Time
	max      int
	window   time.Duration
}

func NewLimiter(max int, window time.Duration) *Limiter {
	return &Limiter{hits: map[string][]time.Time{}, max: max, window: window}
}

// Allow возвращает false, если лимит для ключа (IP) превышен.
func (l *Limiter) Allow(key string) bool {
	l.mu.Lock()
	defer l.mu.Unlock()
	now := time.Now()
	cutoff := now.Add(-l.window)
	fresh := l.hits[key][:0]
	for _, t := range l.hits[key] {
		if t.After(cutoff) {
			fresh = append(fresh, t)
		}
	}
	if len(fresh) >= l.max {
		l.hits[key] = fresh
		return false
	}
	l.hits[key] = append(fresh, now)
	return true
}
