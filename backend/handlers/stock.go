package handlers

import (
	"database/sql"
	"encoding/json"
	"net/http"
	"sort"
	"time"

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

type receiptSummary struct {
	Name          string  `json:"name"`
	Entries       int     `json:"entries"`
	TotalQuantity float64 `json:"total_quantity"`
	TotalValue    float64 `json:"total_value"`
	AvgUnitPrice  float64 `json:"avg_unit_price"`
	Supplier      string  `json:"supplier"`
	LastDate      string  `json:"last_date"`
}

type commandSummary struct {
	Name             string  `json:"name"`
	ValidatedQty     float64 `json:"validated_qty"`
	ValidatedValue   float64 `json:"validated_value"`
	PendingQty       float64 `json:"pending_qty"`
	RejectedQty      float64 `json:"rejected_qty"`
	ValidatedEntries int     `json:"validated_entries"`
	PendingEntries   int     `json:"pending_entries"`
	RejectedEntries  int     `json:"rejected_entries"`
	LastDate         string  `json:"last_date"`
}

func summarizeReceipts(rows *sql.Rows) ([]receiptSummary, error) {
	type agg struct {
		Entries       int
		TotalQuantity float64
		TotalValue    float64
		Supplier      string
		LastDate      time.Time
		HasDate       bool
	}

	byName := map[string]*agg{}
	for rows.Next() {
		var r models.Receipt
		if err := rows.Scan(&r.Name, &r.Quantity, &r.Price, &r.Supplier, &r.Date); err != nil {
			continue
		}
		item := byName[r.Name]
		if item == nil {
			item = &agg{}
			byName[r.Name] = item
		}
		item.Entries++
		item.TotalQuantity += r.Quantity
		item.TotalValue += r.Quantity * r.Price
		if !item.HasDate || r.Date.After(item.LastDate) {
			item.LastDate = r.Date
			item.HasDate = true
			if r.Supplier != "" {
				item.Supplier = r.Supplier
			}
		}
		if item.Supplier == "" && r.Supplier != "" {
			item.Supplier = r.Supplier
		}
	}

	result := make([]receiptSummary, 0, len(byName))
	for name, item := range byName {
		avg := 0.0
		if item.TotalQuantity > 0 {
			avg = item.TotalValue / item.TotalQuantity
		}
		lastDate := ""
		if item.HasDate {
			lastDate = item.LastDate.Format("2006-01-02")
		}
		result = append(result, receiptSummary{
			Name:          name,
			Entries:       item.Entries,
			TotalQuantity: item.TotalQuantity,
			TotalValue:    item.TotalValue,
			AvgUnitPrice:  avg,
			Supplier:      item.Supplier,
			LastDate:      lastDate,
		})
	}

	sort.Slice(result, func(i, j int) bool {
		if result[i].TotalValue == result[j].TotalValue {
			return result[i].Name < result[j].Name
		}
		return result[i].TotalValue > result[j].TotalValue
	})

	return result, nil
}

func summarizeCommands(rows *sql.Rows) ([]commandSummary, error) {
	type agg struct {
		ValidatedQty     float64
		ValidatedValue   float64
		PendingQty       float64
		RejectedQty      float64
		ValidatedEntries int
		PendingEntries   int
		RejectedEntries  int
		LastDate         time.Time
		HasDate          bool
	}

	byName := map[string]*agg{}
	for rows.Next() {
		var cmd models.Command
		if err := rows.Scan(&cmd.Name, &cmd.Quantity, &cmd.Price, &cmd.Date, &cmd.Status); err != nil {
			continue
		}
		item := byName[cmd.Name]
		if item == nil {
			item = &agg{}
			byName[cmd.Name] = item
		}
		if !item.HasDate || cmd.Date.After(item.LastDate) {
			item.LastDate = cmd.Date
			item.HasDate = true
		}
		switch cmd.Status {
		case "validated":
			item.ValidatedQty += cmd.Quantity
			item.ValidatedValue += cmd.Quantity * cmd.Price
			item.ValidatedEntries++
		case "rejected":
			item.RejectedQty += cmd.Quantity
			item.RejectedEntries++
		default:
			item.PendingQty += cmd.Quantity
			item.PendingEntries++
		}
	}

	result := make([]commandSummary, 0, len(byName))
	for name, item := range byName {
		lastDate := ""
		if item.HasDate {
			lastDate = item.LastDate.Format("2006-01-02")
		}
		result = append(result, commandSummary{
			Name:             name,
			ValidatedQty:     item.ValidatedQty,
			ValidatedValue:   item.ValidatedValue,
			PendingQty:       item.PendingQty,
			RejectedQty:      item.RejectedQty,
			ValidatedEntries: item.ValidatedEntries,
			PendingEntries:   item.PendingEntries,
			RejectedEntries:  item.RejectedEntries,
			LastDate:         lastDate,
		})
	}

	sort.Slice(result, func(i, j int) bool {
		if result[i].ValidatedValue == result[j].ValidatedValue {
			return result[i].Name < result[j].Name
		}
		return result[i].ValidatedValue > result[j].ValidatedValue
	})

	return result, nil
}

func GenerateAccountantReport(c *gin.Context) {
	receiptRows, err := db.DB.Query(`SELECT name, quantity, price, supplier, date FROM receipts ORDER BY date DESC LIMIT 250`)
	if err != nil {
		c.JSON(http.StatusInternalServerError, gin.H{"error": "failed to fetch receipts data"})
		return
	}
	defer receiptRows.Close()
	receipts, err := summarizeReceipts(receiptRows)
	if err != nil {
		c.JSON(http.StatusInternalServerError, gin.H{"error": "failed to summarize receipts data"})
		return
	}

	cmdRows, err := db.DB.Query(`SELECT name, quantity, price, date, status FROM commands ORDER BY date DESC LIMIT 250`)
	if err != nil {
		c.JSON(http.StatusInternalServerError, gin.H{"error": "failed to fetch commands data"})
		return
	}
	defer cmdRows.Close()
	commands, err := summarizeCommands(cmdRows)
	if err != nil {
		c.JSON(http.StatusInternalServerError, gin.H{"error": "failed to summarize commands data"})
		return
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
