package handlers

import (
	"encoding/base64"
	"encoding/json"
	"fmt"
	"io"
	"net/http"
	"strings"
	"time"

	"inventory-app/ai"
	"inventory-app/db"
	"inventory-app/models"

	"github.com/gin-gonic/gin"
)

func UploadReceipt(c *gin.Context) {
	file, header, err := c.Request.FormFile("image")
	if err != nil {
		c.JSON(http.StatusBadRequest, gin.H{"error": "image is required"})
		return
	}
	defer file.Close()

	// Read and base64 encode
	data, err := io.ReadAll(file)
	if err != nil {
		c.JSON(http.StatusInternalServerError, gin.H{"error": "failed to read image"})
		return
	}

	b64 := base64.StdEncoding.EncodeToString(data)
	mediaType := header.Header.Get("Content-Type")
	if mediaType == "" {
		mediaType = "image/jpeg"
	}

	// Extract using Claude vision
	extracted, err := ai.ExtractReceiptData(b64, mediaType)
	if err != nil {
		// Fallback: use form values if AI fails
		extracted = map[string]interface{}{
			"name":     c.PostForm("name"),
			"quantity": 1.0,
			"price":    0.0,
			"supplier": c.PostForm("supplier"),
			"date":     time.Now().Format("2006-01-02"),
		}
	}

	name, _ := extracted["name"].(string)
	quantity, _ := toFloat(extracted["quantity"])
	price, _ := toFloat(extracted["price"])
	supplier, _ := extracted["supplier"].(string)
	dateStr, _ := extracted["date"].(string)

	date := time.Now()
	if dateStr != "" {
		if d, err := time.Parse("2006-01-02", dateStr); err == nil {
			date = d
		}
	}

	var id int
	err = db.DB.QueryRow(
		`INSERT INTO receipts (name, quantity, price, supplier, date) VALUES ($1, $2, $3, $4, $5) RETURNING id`,
		name, quantity, price, supplier, date,
	).Scan(&id)
	if err != nil {
		c.JSON(http.StatusInternalServerError, gin.H{"error": fmt.Sprintf("db error: %v", err)})
		return
	}

	// Update stock
	_, _ = db.DB.Exec(
		`INSERT INTO stock (name, quantity, last_updated) VALUES ($1, $2, NOW())
		 ON CONFLICT (name) DO UPDATE SET quantity = stock.quantity + $2, last_updated = NOW()`,
		name, quantity,
	)

	receipt := models.Receipt{ID: id, Name: name, Quantity: quantity, Price: price, Supplier: supplier, Date: date}

	// Notify via WebSocket
	msg, _ := json.Marshal(gin.H{"event": "new_receipt", "data": receipt})
	GlobalHub.Broadcast(msg)

	c.JSON(http.StatusCreated, receipt)
}

func GetReceipts(c *gin.Context) {
	rows, err := db.DB.Query(
		`SELECT id, name, quantity, price, supplier, date, created_at FROM receipts ORDER BY created_at DESC LIMIT 100`,
	)
	if err != nil {
		c.JSON(http.StatusInternalServerError, gin.H{"error": err.Error()})
		return
	}
	defer rows.Close()

	receipts := []models.Receipt{}
	for rows.Next() {
		var r models.Receipt
		if err := rows.Scan(&r.ID, &r.Name, &r.Quantity, &r.Price, &r.Supplier, &r.Date, &r.CreatedAt); err != nil {
			continue
		}
		receipts = append(receipts, r)
	}

	c.JSON(http.StatusOK, receipts)
}

func toFloat(v interface{}) (float64, error) {
	switch val := v.(type) {
	case float64:
		return val, nil
	case float32:
		return float64(val), nil
	case int:
		return float64(val), nil
	case string:
		var f float64
		_, err := fmt.Sscanf(strings.TrimSpace(val), "%f", &f)
		return f, err
	}
	return 0, fmt.Errorf("cannot convert %T to float64", v)
}
