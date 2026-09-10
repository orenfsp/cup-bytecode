// Package secretbox — симметричное шифрование чувствительных полей (способ связи) at-rest.
package secretbox

import (
	"crypto/aes"
	"crypto/cipher"
	"crypto/rand"
	"crypto/sha256"
	"encoding/base64"
	"errors"
	"io"
	"strings"
)

type Box struct {
	gcm cipher.AEAD
}

// New строит шифратор из парольной фразы (ключ = SHA-256(passphrase)).
func New(passphrase string) (*Box, error) {
	key := sha256.Sum256([]byte("otklik-contact:" + passphrase))
	block, err := aes.NewCipher(key[:])
	if err != nil {
		return nil, err
	}
	gcm, err := cipher.NewGCM(block)
	if err != nil {
		return nil, err
	}
	return &Box{gcm: gcm}, nil
}

const prefix = "enc:v1:"

// Encrypt шифрует строку и возвращает "enc:v1:<base64(nonce|ciphertext)>".
func (b *Box) Encrypt(plain string) (string, error) {
	if plain == "" {
		return "", nil
	}
	nonce := make([]byte, b.gcm.NonceSize())
	if _, err := io.ReadFull(rand.Reader, nonce); err != nil {
		return "", err
	}
	ct := b.gcm.Seal(nonce, nonce, []byte(plain), nil)
	return prefix + base64.StdEncoding.EncodeToString(ct), nil
}

// Decrypt расшифровывает значение. Если значение не зашифровано (старый формат) — вернёт как есть.
func (b *Box) Decrypt(stored string) (string, error) {
	if stored == "" {
		return "", nil
	}
	if !strings.HasPrefix(stored, prefix) {
		return stored, nil // обратная совместимость / незашифрованное
	}
	raw, err := base64.StdEncoding.DecodeString(strings.TrimPrefix(stored, prefix))
	if err != nil {
		return "", err
	}
	ns := b.gcm.NonceSize()
	if len(raw) < ns {
		return "", errors.New("bad ciphertext")
	}
	nonce, ct := raw[:ns], raw[ns:]
	plain, err := b.gcm.Open(nil, nonce, ct, nil)
	if err != nil {
		return "", err
	}
	return string(plain), nil
}
