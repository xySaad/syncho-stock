package ai

import (
	"bytes"
	"encoding/json"
	"fmt"
	"io"
	"net/http"
	"os"
)

const groqURL = "https://api.groq.com/openai/v1/chat/completions"

type ChatMessage struct {
	Role    string `json:"role"`
	Content string `json:"content"`
}

type GroqRequest struct {
	Model       string        `json:"model"`
	Messages    []ChatMessage `json:"messages"`
	MaxTokens   int           `json:"max_tokens"`
	Temperature float64       `json:"temperature"`
}

type GroqResponse struct {
	Choices []struct {
		Message struct {
			Content string `json:"content"`
		} `json:"message"`
	} `json:"choices"`
}

func call(systemPrompt, userPrompt string, maxTokens int) (string, error) {
	return callWithTemp(systemPrompt, userPrompt, maxTokens, 0.7)
}

func callWithTemp(systemPrompt, userPrompt string, maxTokens int, temperature float64) (string, error) {
	apiKey := os.Getenv("GROQ_API_KEY")
	if apiKey == "" {
		return "", fmt.Errorf("GROQ_API_KEY not set")
	}

	req := GroqRequest{
		Model:       "llama-3.3-70b-versatile",
		MaxTokens:   maxTokens,
		Temperature: temperature,
		Messages: []ChatMessage{
			{Role: "user", Content: userPrompt},
		},
	}

	if systemPrompt != "" {
		req.Messages = append([]ChatMessage{{Role: "system", Content: systemPrompt}}, req.Messages...)
	}

	body, _ := json.Marshal(req)
	httpReq, err := http.NewRequest("POST", groqURL, bytes.NewReader(body))
	if err != nil {
		return "", err
	}
	httpReq.Header.Set("Content-Type", "application/json")
	httpReq.Header.Set("Authorization", fmt.Sprintf("Bearer %s", apiKey))

	resp, err := http.DefaultClient.Do(httpReq)
	if err != nil {
		return "", err
	}
	defer resp.Body.Close()

	data, _ := io.ReadAll(resp.Body)
	if resp.StatusCode != 200 {
		return "", fmt.Errorf("API error %d: %s", resp.StatusCode, string(data))
	}

	var r GroqResponse
	if err := json.Unmarshal(data, &r); err != nil {
		return "", err
	}
	if len(r.Choices) == 0 {
		return "", fmt.Errorf("empty response")
	}
	return r.Choices[0].Message.Content, nil
}

// ExtractReceiptData extracts structured data from a receipt image (base64)
func ExtractReceiptData(base64Image, mediaType string) (map[string]interface{}, error) {
	systemPrompt := `You are the SynchroStock AI receipt parser for a warehouse inventory management system.
Your job is to extract structured product/purchase data from receipt text or OCR output.

RESPOND ONLY WITH VALID JSON — no markdown, no code fences, no preamble, no explanation.

Required JSON schema:
{
  "name": "string (product name, capitalize first letter of each word)",
  "quantity": number (must be > 0, default to 1 if unclear),
  "price": number (unit price in USD, must be >= 0, strip currency symbols),
  "supplier": "string (vendor/store name, use 'Unknown' if not found)",
  "date": "YYYY-MM-DD (use today's date if not found)"
}

Rules:
- If multiple items are on the receipt, extract only the FIRST/primary item.
- Clean up product names: remove SKU codes, normalize casing.
- Prices should be per-unit, not totals. If only total is given, divide by quantity.
- Be error-tolerant: extract what you can, use sensible defaults for missing fields.`

	userPrompt := fmt.Sprintf(`Parse the following receipt data and return a single JSON object.

Receipt content:
%s`, base64Image)

	text, err := callWithTemp(systemPrompt, userPrompt, 500, 0.2)
	if err != nil {
		return nil, err
	}

	var result map[string]interface{}
	if err := json.Unmarshal([]byte(text), &result); err != nil {
		return nil, fmt.Errorf("failed to parse JSON: %v, raw: %s", err, text)
	}
	return result, nil
}

// GenerateRecommendation generates restocking recommendations based on stock data
func GenerateRecommendation(stockJSON, receiptsJSON string) (string, error) {
	systemPrompt := `You are SynchroStock AI, the restocking advisor for a warehouse inventory platform.

Your audience is a **Supervisor** who needs quick, actionable restocking decisions.

Data context:
- Stock items: name, quantity (current units), last_updated
- Receipts (inbound purchases): name, quantity, price (USD), supplier, date

Thresholds:
- quantity < 10 → CRITICAL
- quantity 10-25 → LOW
- quantity > 100 → OVERSTOCKED

FORMATTING RULES:
- DO NOT use markdown tables. Use bullet lists only.
- Keep each bullet point to ONE short line.
- Bold item names and key numbers.
- Be concise — no filler sentences.

Use these exact sections:

## 🚨 Critical — Restock Now
List each critical item as: **Item Name** — current qty: X → order Y units from Supplier at $Z/unit

## ⚠️ Low Stock — Monitor
Same format, one bullet per item.

## 📊 Trends
- Which items are being purchased most frequently?
- Any items slowing down?

## 💡 Cost Tips
- Best-price suppliers per item
- Bulk or timing suggestions

## 📋 Purchase Order Summary
Bulleted list of what to order, how much, from whom, estimated cost.`

	userPrompt := fmt.Sprintf(`Warehouse data:

Stock:
%s

Recent purchases:
%s

Give your restocking report.`, stockJSON, receiptsJSON)

	return callWithTemp(systemPrompt, userPrompt, 1500, 0.5)
}

// GenerateReport generates a buys/sells analysis report
func GenerateReport(receiptsJSON, commandsJSON string) (string, error) {
	systemPrompt := `You are SynchroStock AI, the financial analyst for a warehouse inventory platform.

Your audience is an **Inventory Accountant** who needs a clear financial summary.

Terminology:
- Receipts = INBOUND purchases (goods entering warehouse)
- Commands = OUTBOUND orders (goods leaving warehouse)
  - Only "validated" commands count as real outflows
  - "pending" = awaiting confirmation, "rejected" = cancelled

FORMATTING RULES:
- DO NOT use markdown tables. Use bullet lists only.
- Bold product names and dollar amounts.
- Keep bullets short — one line each.
- No filler text or long paragraphs.

Use these exact sections:

## 📥 Purchases (Inflows)
List each product as: **Product** — qty: X, unit price: **$Y**, total: **$Z**, supplier: Name
End with: **Total inflow: $X**

## 📤 Orders (Outflows)
List validated orders same format (no supplier).
Note: X pending, Y rejected orders excluded.
End with: **Total outflow: $X**

## 📊 Net Position
- Inflow: **$X** — Outflow: **$Y** = Net: **$Z**

## 🔄 Turnover
- Fastest moving items
- Slowest moving items

## ⚠️ Flags
- Any price anomalies, unusual volumes, or supplier risks`

	userPrompt := fmt.Sprintf(`Financial data:

Receipts (last 100):
%s

Commands (last 100):
%s

Generate the financial report.`, receiptsJSON, commandsJSON)

	return callWithTemp(systemPrompt, userPrompt, 2000, 0.3)
}

// AnalyzeStock provides a comprehensive stock analysis
func AnalyzeStock(stockJSON string) (string, error) {
	systemPrompt := `You are SynchroStock AI, the inventory health analyst for a warehouse platform.

Your audience is a **Supervisor** who needs a quick inventory health snapshot.

Data: each stock item has name, quantity (current units), last_updated (timestamp).

Thresholds:
- 0 = OUT OF STOCK
- < 10 = CRITICALLY LOW
- 10-25 = LOW
- 25-75 = HEALTHY
- 75-150 = HIGH
- > 150 = OVERSTOCKED

Health Score (1-10): Start at 10. Deduct -2 per out-of-stock, -1 per critical, -0.5 per overstocked. Min 1.

FORMATTING RULES:
- DO NOT use markdown tables. Use bullet lists only.
- Bold item names and quantities.
- One bullet point per item — keep it short.
- No filler sentences or long paragraphs.

Use these exact sections:

## 🏥 Health Score: X/10
One sentence explaining why.

## 🚨 Alerts
List items needing attention:
- 🔴 **Item** — qty: **X** (out of stock / critically low)
- 🟡 **Item** — qty: **X** (low)
If none, say "✅ No critical items."

## 📦 Distribution
- Out of stock: X items
- Critical: X items
- Low: X items
- Healthy: X items
- High: X items
- Overstocked: X items (list names)

## 📈 Freshness
Are any items stale (not updated recently)? One bullet per finding.

## 📋 Actions
**This week:**
- bullet per action
**This month:**
- bullet per action`

	userPrompt := fmt.Sprintf(`Stock data:

%s

Give your inventory health analysis.`, stockJSON)

	return callWithTemp(systemPrompt, userPrompt, 1500, 0.3)
}
