package db

import (
	"database/sql"
	"fmt"
	"log"
	"os"

	_ "github.com/lib/pq"
	"golang.org/x/crypto/bcrypt"
)

var DB *sql.DB

func Connect() {
	dsn := os.Getenv("DATABASE_URL")
	if dsn == "" {
		dsn = fmt.Sprintf(
			"host=%s port=%s user=%s password=%s dbname=%s sslmode=disable",
			getEnv("DB_HOST", "localhost"),
			getEnv("DB_PORT", "5432"),
			getEnv("DB_USER", "postgres"),
			getEnv("DB_PASSWORD", "postgres"),
			getEnv("DB_NAME", "inventory"),
		)
	}

	var err error
	DB, err = sql.Open("postgres", dsn)
	if err != nil {
		log.Fatalf("Failed to open DB: %v", err)
	}
	if err = DB.Ping(); err != nil {
		log.Fatalf("Failed to connect to DB: %v", err)
	}
	log.Println("Database connected")
	Migrate()
}

func Migrate() {
	queries := []string{
		`CREATE TABLE IF NOT EXISTS users (
			id SERIAL PRIMARY KEY,
			login VARCHAR(100) UNIQUE NOT NULL,
			password_hash TEXT NOT NULL,
			role VARCHAR(50) NOT NULL DEFAULT 'worker',
			created_at TIMESTAMPTZ DEFAULT NOW()
		)`,
		`CREATE TABLE IF NOT EXISTS receipts (
			id SERIAL PRIMARY KEY,
			name VARCHAR(255) NOT NULL,
			quantity NUMERIC(10,2) NOT NULL DEFAULT 0,
			price NUMERIC(10,2) NOT NULL DEFAULT 0,
			supplier VARCHAR(255),
			date DATE NOT NULL,
			image_url TEXT,
			created_at TIMESTAMPTZ DEFAULT NOW()
		)`,
		`CREATE TABLE IF NOT EXISTS stock (
			id SERIAL PRIMARY KEY,
			name VARCHAR(255) UNIQUE NOT NULL,
			quantity NUMERIC(10,2) NOT NULL DEFAULT 0,
			last_updated TIMESTAMPTZ DEFAULT NOW()
		)`,
		`CREATE TABLE IF NOT EXISTS commands (
			id SERIAL PRIMARY KEY,
			name VARCHAR(255) NOT NULL,
			quantity NUMERIC(10,2) NOT NULL DEFAULT 0,
			price NUMERIC(10,2) NOT NULL DEFAULT 0,
			date DATE NOT NULL,
			status VARCHAR(50) DEFAULT 'pending',
			created_at TIMESTAMPTZ DEFAULT NOW()
		)`,
	}

	for _, q := range queries {
		if _, err := DB.Exec(q); err != nil {
			log.Printf("Migration warning: %v", err)
		}
	}

	seedPassword := getEnv("SEED_USER_PASSWORD", "admin123")
	seedHash, err := bcrypt.GenerateFromPassword([]byte(seedPassword), bcrypt.DefaultCost)
	if err != nil {
		log.Printf("Migration warning: failed to hash seed user password: %v", err)
		return
	}

	if _, err := DB.Exec(
		`INSERT INTO users (login, password_hash, role) VALUES
			($1, $2, $3),
			($4, $5, $6),
			($7, $8, $9)
		ON CONFLICT (login) DO UPDATE
		SET password_hash = EXCLUDED.password_hash,
			role = EXCLUDED.role`,
		"admin", string(seedHash), "supervisor",
		"worker1", string(seedHash), "worker",
		"accountant1", string(seedHash), "inventory_accountant",
	); err != nil {
		log.Printf("Migration warning: %v", err)
	}

	log.Println("Migrations applied")
}

func getEnv(key, fallback string) string {
	if v := os.Getenv(key); v != "" {
		return v
	}
	return fallback
}
