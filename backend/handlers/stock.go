package handlers

import (
	"encoding/json"
	"net/http"

	"inventory-app/ai"
	"inventory-app/db"
	"inventory-app/models"

	"github.com/gin-gonic/gin"
)

func GetStock(c *gin.Context) {
	rows, err := db.DB.Query(
		`SELECT id, name, quantity, last_updated FROM stock ORDER BY name`,
	)
	if err != nil {
		c.JSON(http.StatusInternalServerError, gin.H{"error": err.Error()})
		return
	}
	defer rows.Close()

	stock := []models.Stock{}
	for rows.Next() {
		var s models.Stock
		if err := rows.Scan(&s.ID, &s.Name, &s.Quantity, &s.LastUpdated); err != nil {
			continue
		}
		stock = append(stock, s)
	}

	c.JSON(http.StatusOK, stock)
}

func GetRecommendation(c *gin.Context) {
	// Fetch stock
	stockRows, err := db.DB.Query(`SELECT name, quantity, last_updated FROM stock ORDER BY name`)
	if err != nil {
		c.JSON(http.StatusInternalServerError, gin.H{"error": "failed to fetch stock data"})
		return
	}
	defer stockRows.Close()
	var stocks []models.Stock
	for stockRows.Next() {
		var s models.Stock
		if err := stockRows.Scan(&s.Name, &s.Quantity, &s.LastUpdated); err == nil {
			stocks = append(stocks, s)
		}
	}

	// Fetch recent receipts
	receiptRows, err := db.DB.Query(`SELECT name, quantity, price, supplier, date FROM receipts ORDER BY date DESC LIMIT 50`)
	if err != nil {
		c.JSON(http.StatusInternalServerError, gin.H{"error": "failed to fetch receipts data"})
		return
	}
	defer receiptRows.Close()
	var receipts []models.Receipt
	for receiptRows.Next() {
		var r models.Receipt
		if err := receiptRows.Scan(&r.Name, &r.Quantity, &r.Price, &r.Supplier, &r.Date); err == nil {
			receipts = append(receipts, r)
		}
	}

	stockJSON, _ := json.Marshal(stocks)
	receiptsJSON, _ := json.Marshal(receipts)

	recommendation, err := ai.GenerateRecommendation(string(stockJSON), string(receiptsJSON))
	if err != nil {
		c.JSON(http.StatusInternalServerError, gin.H{"error": err.Error()})
		return
	}

	c.JSON(http.StatusOK, gin.H{"recommendation": recommendation})
}

func GetAnalysis(c *gin.Context) {
	// Fetch stock
	stockRows, err := db.DB.Query(`SELECT name, quantity, last_updated FROM stock`)
	if err != nil {
		c.JSON(http.StatusInternalServerError, gin.H{"error": "failed to fetch stock data"})
		return
	}
	defer stockRows.Close()
	var stocks []models.Stock
	for stockRows.Next() {
		var s models.Stock
		if err := stockRows.Scan(&s.Name, &s.Quantity, &s.LastUpdated); err == nil {
			stocks = append(stocks, s)
		}
	}

	if len(stocks) == 0 {
		c.JSON(http.StatusOK, gin.H{"analysis": "No stock data available for analysis"})
		return
	}

	stockJSON, _ := json.Marshal(stocks)
	analysis, err := ai.AnalyzeStock(string(stockJSON))
	if err != nil {
		c.JSON(http.StatusInternalServerError, gin.H{"error": err.Error()})
		return
	}

	c.JSON(http.StatusOK, gin.H{"analysis": analysis})
}

func GenerateAccountantReport(c *gin.Context) {
	receiptRows, err := db.DB.Query(`SELECT name, quantity, price, supplier, date FROM receipts ORDER BY date DESC LIMIT 100`)
	if err != nil {
		c.JSON(http.StatusInternalServerError, gin.H{"error": "failed to fetch receipts data"})
		return
	}
	defer receiptRows.Close()
	var receipts []models.Receipt
	for receiptRows.Next() {
		var r models.Receipt
		if err := receiptRows.Scan(&r.Name, &r.Quantity, &r.Price, &r.Supplier, &r.Date); err == nil {
			receipts = append(receipts, r)
		}
	}

	cmdRows, err := db.DB.Query(`SELECT name, quantity, price, date, status FROM commands ORDER BY date DESC LIMIT 100`)
	if err != nil {
		c.JSON(http.StatusInternalServerError, gin.H{"error": "failed to fetch commands data"})
		return
	}
	defer cmdRows.Close()
	var commands []models.Command
	for cmdRows.Next() {
		var cmd models.Command
		if err := cmdRows.Scan(&cmd.Name, &cmd.Quantity, &cmd.Price, &cmd.Date, &cmd.Status); err == nil {
			commands = append(commands, cmd)
		}
	}

	if len(receipts) == 0 && len(commands) == 0 {
		c.JSON(http.StatusOK, gin.H{"report": "No transaction data available for report generation"})
		return
	}

	receiptsJSON, _ := json.Marshal(receipts)
	commandsJSON, _ := json.Marshal(commands)

	report, err := ai.GenerateReport(string(receiptsJSON), string(commandsJSON))
	if err != nil {
		c.JSON(http.StatusInternalServerError, gin.H{"error": err.Error()})
		return
	}

	c.JSON(http.StatusOK, gin.H{"report": report})
}
