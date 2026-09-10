package main

import (
	"log"
	"net/http"
	"time"

	"otklik/internal/api"
	"otklik/internal/config"
	"otklik/internal/db"
)

func main() {
	cfg := config.Load()

	database, err := db.Open(cfg.DatabaseURL)
	if err != nil {
		log.Fatalf("не удалось подключиться к БД: %v", err)
	}
	defer database.Close()

	if err := db.Migrate(database, "migrations"); err != nil {
		log.Fatalf("миграции: %v", err)
	}
	if err := db.SeedStaff(database); err != nil {
		log.Fatalf("сид сотрудников: %v", err)
	}

	srv := api.New(database, cfg)
	handler := srv.Routes()

	httpSrv := &http.Server{
		Addr:         ":" + cfg.Port,
		Handler:      handler,
		ReadTimeout:  30 * time.Second,
		WriteTimeout: 60 * time.Second,
	}

	log.Printf("«Отклик» backend слушает на :%s", cfg.Port)
	if err := httpSrv.ListenAndServe(); err != nil {
		log.Fatal(err)
	}
}
