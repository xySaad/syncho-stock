package handlers

import (
	"encoding/json"
	"net/http"
	"strconv"
	"time"

	"inventory-app/db"
	"inventory-app/models"

	"github.com/gin-gonic/gin"
)

func GetCommands(c *gin.Context) {
	rows, err := db.DB.Query(
		`SELECT id, name, quantity, price, date, status, created_at FROM commands ORDER BY created_at DESC LIMIT 100`,
	)
	if err != nil {
		c.JSON(http.StatusInternalServerError, gin.H{"error": err.Error()})
		return
	}
	defer rows.Close()

	commands := []models.Command{}
	for rows.Next() {
		var cmd models.Command
		if err := rows.Scan(&cmd.ID, &cmd.Name, &cmd.Quantity, &cmd.Price, &cmd.Date, &cmd.Status, &cmd.CreatedAt); err != nil {
			continue
		}
		commands = append(commands, cmd)
	}

	c.JSON(http.StatusOK, commands)
}

func CreateCommand(c *gin.Context) {
	var req models.CreateCommandRequest
	if err := c.ShouldBindJSON(&req); err != nil {
		c.JSON(http.StatusBadRequest, gin.H{"error": err.Error()})
		return
	}

	var id int
	err := db.DB.QueryRow(
		`INSERT INTO commands (name, quantity, price, date, status) VALUES ($1, $2, $3, $4, 'pending') RETURNING id`,
		req.Name, req.Quantity, req.Price, time.Now(),
	).Scan(&id)
	if err != nil {
		c.JSON(http.StatusInternalServerError, gin.H{"error": err.Error()})
		return
	}

	cmd := models.Command{
		ID:       id,
		Name:     req.Name,
		Quantity: req.Quantity,
		Price:    req.Price,
		Date:     time.Now(),
		Status:   "pending",
	}

	// Notify workers via WebSocket
	msg, _ := json.Marshal(gin.H{"event": "new_command", "data": cmd})
	GlobalHub.BroadcastToRole(msg, "worker")

	c.JSON(http.StatusCreated, cmd)
}

func ValidateCommand(c *gin.Context) {
	idStr := c.Param("id")
	id, err := strconv.Atoi(idStr)
	if err != nil {
		c.JSON(http.StatusBadRequest, gin.H{"error": "invalid id"})
		return
	}

	var req struct {
		Status string `json:"status" binding:"required"` // validated or rejected
	}
	if err := c.ShouldBindJSON(&req); err != nil {
		c.JSON(http.StatusBadRequest, gin.H{"error": err.Error()})
		return
	}

	if req.Status != "validated" && req.Status != "rejected" {
		c.JSON(http.StatusBadRequest, gin.H{"error": "status must be 'validated' or 'rejected'"})
		return
	}

	_, err = db.DB.Exec(
		`UPDATE commands SET status = $1 WHERE id = $2`,
		req.Status, id,
	)
	if err != nil {
		c.JSON(http.StatusInternalServerError, gin.H{"error": err.Error()})
		return
	}

	// If validated, reduce stock
	if req.Status == "validated" {
		var name string
		var quantity float64
		_ = db.DB.QueryRow(`SELECT name, quantity FROM commands WHERE id = $1`, id).Scan(&name, &quantity)
		if name != "" {
			_, _ = db.DB.Exec(
				`UPDATE stock SET quantity = GREATEST(0, quantity - $1), last_updated = NOW() WHERE name = $2`,
				quantity, name,
			)
		}
	}

	// Notify supervisors
	msg, _ := json.Marshal(gin.H{"event": "command_updated", "data": gin.H{"id": id, "status": req.Status}})
	GlobalHub.BroadcastToRole(msg, "supervisor")

	c.JSON(http.StatusOK, gin.H{"id": id, "status": req.Status})
}
