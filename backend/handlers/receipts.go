package handlers

import (
	"encoding/base64"
	"encoding/json"
	"fmt"
	"inventory-app/ai"
	"inventory-app/db"
	"inventory-app/models"
	"io"
	"log"
	"net/http"
	"strings"
	"time"

	"github.com/gin-gonic/gin"
)

func UploadReceipt(c *gin.Context) {
	file, header, err := c.Request.FormFile("image")
	if err != nil {
		c.JSON(http.StatusBadRequest, gin.H{"error": "image is required"})
		return
	}
	defer file.Close()

	data, err := io.ReadAll(file)
	if err != nil {
		c.JSON(http.StatusInternalServerError, gin.H{"error": "failed to read image"})
		return
	}
	log.Printf("[UploadReceipt] received file: name=%q size=%d contentType=%q",
		header.Filename, len(data), header.Header.Get("Content-Type"))

	b64 := base64.StdEncoding.EncodeToString(data)
	mediaType := header.Header.Get("Content-Type")
	if mediaType == "" {
		mediaType = "image/jpeg"
	}

	extracted, extractErr := ai.ExtractReceiptData(b64, mediaType)
	if extractErr != nil {
		log.Printf("[UploadReceipt] AI extraction FAILED: %v", extractErr)
		c.JSON(http.StatusUnprocessableEntity, gin.H{
			"error":  "AI extraction failed — check server logs for details",
			"detail": extractErr.Error(),
		})
		return
	}

	log.Printf("[UploadReceipt] extracted: %+v", extracted)
	log.Printf("[UploadReceipt] extracted type: %T", extracted)
	log.Printf("[UploadReceipt] extracted[items] type: %T", extracted["items"])

	rawItems, ok := extracted["items"].([]interface{})
	if !ok {
		log.Printf("[UploadReceipt] type assertion failed for items")
		c.JSON(http.StatusUnprocessableEntity, gin.H{"error": "could not extract any receipt items from image"})
		return
	}
	if len(rawItems) == 0 {
		log.Printf("[UploadReceipt] items array is empty")
		c.JSON(http.StatusUnprocessableEntity, gin.H{"error": "could not extract any receipt items from image"})
		return
	}

	tx, err := db.DB.Begin()
	if err != nil {
		c.JSON(http.StatusInternalServerError, gin.H{"error": fmt.Sprintf("db error: %v", err)})
		return
	}
	defer tx.Rollback()

	receipts := make([]models.Receipt, 0, len(rawItems))
	for _, rawItem := range rawItems {
		item, ok := rawItem.(map[string]interface{})
		if !ok {
			continue
		}

		name, _ := item["name"].(string)
		quantity, _ := toFloat(item["quantity"])
		price, _ := toFloat(item["price"])
		supplier, _ := item["supplier"].(string)
		dateStr, _ := item["date"].(string)

		if name == "" || quantity <= 0 {
			continue
		}

		date := time.Now()
		if dateStr != "" {
			if d, parseErr := time.Parse("2006-01-02", dateStr); parseErr == nil {
				date = d
			}
		}

		var id int
		err = tx.QueryRow(
			`INSERT INTO receipts (name, quantity, price, supplier, date) VALUES ($1, $2, $3, $4, $5) RETURNING id`,
			name, quantity, price, supplier, date,
		).Scan(&id)
		if err != nil {
			c.JSON(http.StatusInternalServerError, gin.H{"error": fmt.Sprintf("db error: %v", err)})
			return
		}

		if _, err = tx.Exec(
			`INSERT INTO stock (name, quantity, last_updated) VALUES ($1, $2, NOW())
			 ON CONFLICT (name) DO UPDATE SET quantity = stock.quantity + $2, last_updated = NOW()`,
			name, quantity,
		); err != nil {
			c.JSON(http.StatusInternalServerError, gin.H{"error": fmt.Sprintf("db error: %v", err)})
			return
		}

		receipt := models.Receipt{ID: id, Name: name, Quantity: quantity, Price: price, Supplier: supplier, Date: date}
		receipts = append(receipts, receipt)
	}

	if len(receipts) == 0 {
		c.JSON(http.StatusUnprocessableEntity, gin.H{"error": "could not extract valid receipt items from image"})
		return
	}

	if err = tx.Commit(); err != nil {
		c.JSON(http.StatusInternalServerError, gin.H{"error": fmt.Sprintf("db error: %v", err)})
		return
	}

	for _, receipt := range receipts {
		msg, _ := json.Marshal(gin.H{"event": "new_receipt", "data": receipt})
		GlobalHub.Broadcast(msg)
	}

	if len(receipts) == 1 {
		c.JSON(http.StatusCreated, receipts[0])
		return
	}

	log.Printf("[UploadReceipt] returning %d receipts: %+v", len(receipts), receipts)

	c.JSON(http.StatusCreated, gin.H{
		"count": len(receipts),
		"items": receipts,
	})
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
