package config

import "os"

type Config struct {
	DatabaseURL string
	JWTSecret   string
	Port        string
	UploadDir   string
	// Pepper для хеширования трек-номеров (в проде вынести в секрет)
	TrackPepper string
}

func Load() Config {
	return Config{
		DatabaseURL: env("DATABASE_URL", "postgres://otklik:otklik@localhost:5432/otklik?sslmode=disable"),
		JWTSecret:   env("JWT_SECRET", "dev-secret-change-me"),
		Port:        env("PORT", "8080"),
		UploadDir:   env("UPLOAD_DIR", "./uploads"),
		TrackPepper: env("TRACK_PEPPER", "otklik-track-pepper"),
	}
}

func env(key, def string) string {
	if v := os.Getenv(key); v != "" {
		return v
	}
	return def
}
