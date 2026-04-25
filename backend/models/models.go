package models

import "time"

type User struct {
	ID           int       `json:"id"`
	Login        string    `json:"login"`
	PasswordHash string    `json:"-"`
	Role         string    `json:"role"` // worker, inventory_accountant, supervisor
	CreatedAt    time.Time `json:"created_at"`
}

type Receipt struct {
	ID        int       `json:"id"`
	Name      string    `json:"name"`
	Quantity  float64   `json:"quantity"`
	Price     float64   `json:"price"`
	Supplier  string    `json:"supplier"`
	Date      time.Time `json:"date"`
	ImageURL  string    `json:"image_url,omitempty"`
	CreatedAt time.Time `json:"created_at"`
}

type Stock struct {
	ID          int       `json:"id"`
	Name        string    `json:"name"`
	Quantity    float64   `json:"quantity"`
	LastUpdated time.Time `json:"last_updated"`
}

type Command struct {
	ID        int       `json:"id"`
	Name      string    `json:"name"`
	Quantity  float64   `json:"quantity"`
	Price     float64   `json:"price"`
	Date      time.Time `json:"date"`
	Status    string    `json:"status"` // pending, validated, rejected
	CreatedAt time.Time `json:"created_at"`
}

type LoginRequest struct {
	Login    string `json:"login" binding:"required"`
	Password string `json:"password" binding:"required"`
}

type CreateCommandRequest struct {
	Name     string  `json:"name" binding:"required"`
	Quantity float64 `json:"quantity" binding:"required"`
	Price    float64 `json:"price" binding:"required"`
}
