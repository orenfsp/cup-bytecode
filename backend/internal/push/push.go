// Package push — Web Push уведомления (VAPID), без привязки к личности.
package push

import (
	"log"
	"os"

	webpush "github.com/SherClockHolmes/webpush-go"
)

type Sender struct {
	pub, priv string
	subject   string
	enabled   bool
}

// New создаёт отправителя. Ключи VAPID берутся из env или генерируются при старте.
func New() *Sender {
	pub := os.Getenv("VAPID_PUBLIC_KEY")
	priv := os.Getenv("VAPID_PRIVATE_KEY")
	if pub == "" || priv == "" {
		p, pk, err := webpush.GenerateVAPIDKeys()
		if err != nil {
			log.Printf("push: не удалось сгенерировать VAPID-ключи: %v", err)
			return &Sender{enabled: false}
		}
		priv, pub = p, pk
		log.Printf("push: сгенерированы временные VAPID-ключи (public=%s...)", trunc(pub))
	}
	subject := os.Getenv("VAPID_SUBJECT")
	if subject == "" {
		subject = "mailto:support@otklik.local"
	}
	return &Sender{pub: pub, priv: priv, subject: subject, enabled: true}
}

func (s *Sender) Enabled() bool  { return s.enabled }
func (s *Sender) PublicKey() string { return s.pub }

// Subscription — данные подписки браузера.
type Subscription struct {
	Endpoint string
	P256dh   string
	Auth     string
}

// Send отправляет уведомление. Возвращает true, если подписку стоит удалить (410/404).
func (s *Sender) Send(sub Subscription, payload string) (gone bool) {
	if !s.enabled {
		return false
	}
	resp, err := webpush.SendNotification([]byte(payload), &webpush.Subscription{
		Endpoint: sub.Endpoint,
		Keys:     webpush.Keys{P256dh: sub.P256dh, Auth: sub.Auth},
	}, &webpush.Options{
		Subscriber:      s.subject,
		VAPIDPublicKey:  s.pub,
		VAPIDPrivateKey: s.priv,
		TTL:             60,
	})
	if err != nil {
		return false
	}
	defer resp.Body.Close()
	return resp.StatusCode == 404 || resp.StatusCode == 410
}

func trunc(s string) string {
	if len(s) > 12 {
		return s[:12]
	}
	return s
}
