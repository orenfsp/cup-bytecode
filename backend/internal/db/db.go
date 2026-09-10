package db

import (
	"database/sql"
	"fmt"
	"log"
	"os"
	"path/filepath"
	"sort"
	"time"

	_ "github.com/lib/pq"
	"golang.org/x/crypto/bcrypt"
)

// Open открывает пул соединений и ждёт готовности БД.
func Open(dsn string) (*sql.DB, error) {
	d, err := sql.Open("postgres", dsn)
	if err != nil {
		return nil, err
	}
	d.SetMaxOpenConns(10)
	d.SetConnMaxLifetime(time.Hour)

	// Ждём, пока БД поднимется (docker-compose healthcheck это уже гарантирует,
	// но подстрахуемся при локальном запуске).
	var lastErr error
	for i := 0; i < 30; i++ {
		if lastErr = d.Ping(); lastErr == nil {
			return d, nil
		}
		log.Printf("ожидаю БД... (%d) %v", i+1, lastErr)
		time.Sleep(2 * time.Second)
	}
	return nil, fmt.Errorf("БД недоступна: %w", lastErr)
}

// Migrate выполняет все *.sql из папки migrations по порядку.
// lib/pq выполняет запрос без параметров в simple-протоколе,
// что позволяет прогонять файлы с несколькими стейтментами.
func Migrate(d *sql.DB, dir string) error {
	entries, err := os.ReadDir(dir)
	if err != nil {
		return fmt.Errorf("чтение папки миграций: %w", err)
	}
	var files []string
	for _, e := range entries {
		if !e.IsDir() && filepath.Ext(e.Name()) == ".sql" {
			files = append(files, e.Name())
		}
	}
	sort.Strings(files)
	for _, f := range files {
		content, err := os.ReadFile(filepath.Join(dir, f))
		if err != nil {
			return err
		}
		if _, err := d.Exec(string(content)); err != nil {
			return fmt.Errorf("миграция %s: %w", f, err)
		}
		log.Printf("миграция выполнена: %s", f)
	}
	return nil
}

// SeedStaff создаёт тестовые учётные записи, если их ещё нет.
func SeedStaff(d *sql.DB) error {
	type acc struct {
		login, pass, name, role, group, voice string
	}
	accounts := []acc{
		{"operator", "operator123", "Оператор первой линии", "operator", "", ""},
		{"admin", "admin123", "Администратор", "admin", "", ""},
		{"psycholog", "expert123", "Специалист-психолог", "expert", "psychologist", "Психолог"},
		{"jurist", "expert123", "Специалист-юрист", "expert", "lawyer", "Юрист"},
		{"conflictolog", "expert123", "Специалист-конфликтолог", "expert", "conflictologist", "Конфликтолог"},
		{"socpedagog", "expert123", "Социальный педагог", "expert", "social_teacher", "Социальный педагог"},
	}
	for _, a := range accounts {
		var exists bool
		if err := d.QueryRow(`SELECT EXISTS(SELECT 1 FROM staff WHERE login=$1)`, a.login).Scan(&exists); err != nil {
			return err
		}
		if exists {
			continue
		}
		hash, err := bcrypt.GenerateFromPassword([]byte(a.pass), bcrypt.DefaultCost)
		if err != nil {
			return err
		}
		var grp, voice interface{}
		if a.group != "" {
			grp = a.group
		}
		if a.voice != "" {
			voice = a.voice
		}
		_, err = d.Exec(`INSERT INTO staff (login, password_hash, display_name, role, specialist_group, voice_label, active_limit)
			VALUES ($1,$2,$3,$4,$5,$6,10)`,
			a.login, string(hash), a.name, a.role, grp, voice)
		if err != nil {
			return err
		}
		log.Printf("создан тестовый аккаунт: %s / %s (%s)", a.login, a.pass, a.role)
	}
	return nil
}
