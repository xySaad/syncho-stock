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

		// RECEIPTS (incoming stock)
		`INSERT INTO receipts (name, quantity, price, supplier, date, image_url) VALUES
	('Steel Bolts M8', 500, 0.12, 'Atlas Fasteners', '2026-03-01', 'img1.jpg'),
	('Steel Bolts M8', 300, 0.11, 'Atlas Fasteners', '2026-03-15', 'img2.jpg'),
	('Aluminum Sheets 2mm', 100, 25.50, 'MetalWorks Ltd', '2026-03-05', 'img3.jpg'),
	('Copper Wire 10m', 200, 8.75, 'ElectroSupply', '2026-03-10', 'img4.jpg'),
	('Industrial Glue', 150, 3.20, 'ChemSolutions', '2026-03-12', 'img5.jpg'),
	('Packaging Boxes Large', 400, 1.10, 'PackIt', '2026-03-18', 'img6.jpg'),
	('Safety Gloves', 250, 2.50, 'SafeGear', '2026-03-20', 'img7.jpg'),
	('Steel Bolts M8', 600, 0.13, 'Atlas Fasteners', '2026-04-01', 'img8.jpg'),
	('Copper Wire 10m', 180, 9.00, 'ElectroSupply', '2026-04-03', 'img9.jpg'),
	('Industrial Glue', 200, 3.10, 'ChemSolutions', '2026-04-05', 'img10.jpg');`,

		// STOCK (intentionally imperfect to simulate real-world mismatch)
		`INSERT INTO stock (name, quantity) VALUES
	('Steel Bolts M8', 900),
	('Aluminum Sheets 2mm', 95),
	('Copper Wire 10m', 320),
	('Industrial Glue', 310),
	('Packaging Boxes Large', 380),
	('Safety Gloves', 200);`,

		// COMMANDS (outgoing orders)
		`INSERT INTO commands (name, quantity, price, date, status) VALUES
	('Steel Bolts M8', 200, 0.25, '2026-03-08', 'validated'),
	('Steel Bolts M8', 150, 0.26, '2026-03-22', 'validated'),
	('Aluminum Sheets 2mm', 20, 40.00, '2026-03-25', 'validated'),
	('Copper Wire 10m', 100, 12.00, '2026-03-28', 'validated'),
	('Industrial Glue', 80, 5.50, '2026-03-30', 'validated'),
	('Packaging Boxes Large', 120, 2.00, '2026-04-02', 'validated'),
	('Safety Gloves', 50, 4.00, '2026-04-04', 'validated'),
	('Steel Bolts M8', 300, 0.27, '2026-04-10', 'pending'),
	('Copper Wire 10m', 120, 12.50, '2026-04-11', 'pending'),
	('Industrial Glue', 150, 5.60, '2026-04-12', 'pending');`,

		// OPTIONAL: simulate stock loss / mismatch
		`UPDATE stock SET quantity = quantity - 20 WHERE name = 'Steel Bolts M8';`,
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
