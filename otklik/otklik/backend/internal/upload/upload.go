package upload

import (
	"bytes"
	"crypto/rand"
	"encoding/hex"
	"errors"
	"fmt"
	"image"
	"image/gif"
	"image/jpeg"
	"image/png"
	"io"
	"os"
	"path/filepath"
)

const (
	MaxFileBytes = 10 << 20 // 10 МБ
	MaxFiles     = 5
)

// Saved описывает сохранённое вложение.
type Saved struct {
	StoredName  string
	ContentType string
	Size        int64
}

// SaveStripped принимает картинку, перекодирует её (тем самым удаляя EXIF/геометки)
// и сохраняет в каталог. Возвращает данные для записи в БД.
func SaveStripped(dir string, r io.Reader, declaredType string) (Saved, error) {
	if err := os.MkdirAll(dir, 0o755); err != nil {
		return Saved{}, err
	}

	// Читаем в память с ограничением по размеру.
	data, err := io.ReadAll(io.LimitReader(r, MaxFileBytes+1))
	if err != nil {
		return Saved{}, err
	}
	if len(data) > MaxFileBytes {
		return Saved{}, errors.New("файл больше 10 МБ")
	}

	img, format, err := decode(data)
	if err != nil {
		return Saved{}, fmt.Errorf("поддерживаются только изображения (jpg, png, gif): %w", err)
	}

	name, err := randName()
	if err != nil {
		return Saved{}, err
	}

	var ext, ct string
	switch format {
	case "jpeg":
		ext, ct = ".jpg", "image/jpeg"
	case "png":
		ext, ct = ".png", "image/png"
	case "gif":
		ext, ct = ".gif", "image/gif"
	default:
		return Saved{}, errors.New("неподдерживаемый формат")
	}
	stored := name + ext

	f, err := os.Create(filepath.Join(dir, stored))
	if err != nil {
		return Saved{}, err
	}
	defer f.Close()

	// Перекодирование убирает все метаданные (EXIF, геолокацию).
	switch format {
	case "jpeg":
		err = jpeg.Encode(f, img, &jpeg.Options{Quality: 90})
	case "png":
		err = png.Encode(f, img)
	case "gif":
		err = gif.Encode(f, img, nil)
	}
	if err != nil {
		return Saved{}, err
	}

	fi, err := f.Stat()
	if err != nil {
		return Saved{}, err
	}
	return Saved{StoredName: stored, ContentType: ct, Size: fi.Size()}, nil
}

func decode(data []byte) (image.Image, string, error) {
	img, format, err := image.Decode(bytes.NewReader(data))
	return img, format, err
}

func randName() (string, error) {
	b := make([]byte, 16)
	if _, err := rand.Read(b); err != nil {
		return "", err
	}
	return hex.EncodeToString(b), nil
}
