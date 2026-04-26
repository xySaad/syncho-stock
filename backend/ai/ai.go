package ai

import (
	"bytes"
	"encoding/base64"
	"encoding/json"
	"fmt"
	"image"
	_ "image/gif"
	_ "image/jpeg"
	"image/png"
	"io"
	"log"
	"net/http"
	"os"
	"os/exec"
	"strconv"
	"strings"
	"time"

	_ "golang.org/x/image/webp"
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

// decodeBase64Image strips optional data-URL prefix and decodes base64 to raw bytes.
func decodeBase64Image(b64 string) ([]byte, error) {
	if idx := strings.Index(b64, ","); idx != -1 {
		b64 = b64[idx+1:]
	}
	b64 = strings.TrimSpace(b64)

	imgBytes, err := base64.StdEncoding.DecodeString(b64)
	if err != nil {
		// try RawStdEncoding (no padding)
		imgBytes, err = base64.RawStdEncoding.DecodeString(b64)
		if err != nil {
			return nil, fmt.Errorf("base64 decode failed: %w", err)
		}
	}
	return imgBytes, nil
}

func resolveTessdataPrefix() string {
	if prefix := strings.TrimSpace(os.Getenv("TESSDATA_PREFIX")); prefix != "" {
		return prefix
	}
	return "/usr/share/tessdata"
}

func normalizeImageForOCR(imgBytes []byte) ([]byte, string, error) {
	img, format, err := image.Decode(bytes.NewReader(imgBytes))
	if err != nil {
		return nil, "", fmt.Errorf("decode image: %w", err)
	}

	var buf bytes.Buffer
	if err := png.Encode(&buf, img); err != nil {
		return nil, "", fmt.Errorf("re-encode image as png: %w", err)
	}

	return buf.Bytes(), format, nil
}

func runOCRWithLanguages(imgBytes []byte, languages []string) (string, error) {
	tempFile, err := os.CreateTemp("", "receipt-ocr-*"+".png")
	if err != nil {
		return "", fmt.Errorf("create temp image: %w", err)
	}
	tempPath := tempFile.Name()
	if _, err := tempFile.Write(imgBytes); err != nil {
		tempFile.Close()
		os.Remove(tempPath)
		return "", fmt.Errorf("write temp image: %w", err)
	}
	if err := tempFile.Close(); err != nil {
		os.Remove(tempPath)
		return "", fmt.Errorf("close temp image: %w", err)
	}
	defer os.Remove(tempPath)

	var lastErr error
	for _, lang := range languages {
		args := []string{tempPath, "stdout", "--tessdata-dir", resolveTessdataPrefix(), "-l", lang, "--psm", "3"}
		cmd := exec.Command("tesseract", args...)
		out, err := cmd.CombinedOutput()
		if err != nil {
			lastErr = fmt.Errorf("tesseract %s: %w: %s", strings.Join(args, " "), err, strings.TrimSpace(string(out)))
			continue
		}

		text := strings.TrimSpace(string(out))
		if text == "" {
			lastErr = fmt.Errorf("OCR returned empty text")
			continue
		}
		return text, nil
	}

	if lastErr == nil {
		lastErr = fmt.Errorf("OCR failed with all language fallbacks")
	}
	return "", lastErr
}

// runOCR runs Tesseract OCR on raw image bytes and returns extracted text.
func runOCR(imgBytes []byte) (string, error) {
	// Validate image format first.
	cfg, format, err := image.DecodeConfig(bytes.NewReader(imgBytes))
	if err != nil {
		return "", fmt.Errorf("not a valid image: %w", err)
	}
	log.Printf("[OCR] image format=%s  dimensions=%dx%d  bytes=%d", format, cfg.Width, cfg.Height, len(imgBytes))

	normalizedBytes, normalizedFormat, err := normalizeImageForOCR(imgBytes)
	if err != nil {
		return "", err
	}
	log.Printf("[OCR] normalized input format=%s -> png bytes=%d", normalizedFormat, len(normalizedBytes))

	text, err := runOCRWithLanguages(normalizedBytes, []string{"eng+fra", "eng"})
	if err != nil {
		return "", fmt.Errorf("tesseract OCR: %w", err)
	}
	log.Printf("[OCR] extracted text (%d chars):\n%s", len(text), text)

	return text, nil
}

// cleanJSON strips markdown fences that models emit despite instructions.
func cleanJSON(raw string) string {
	raw = strings.TrimSpace(raw)
	for _, fence := range []string{"```json", "```JSON", "```"} {
		raw = strings.TrimPrefix(raw, fence)
	}
	raw = strings.TrimSuffix(raw, "```")

	startObj := strings.Index(raw, "{")
	startArr := strings.Index(raw, "[")

	start := -1
	if startObj == -1 {
		start = startArr
	} else if startArr == -1 {
		start = startObj
	} else if startObj < startArr {
		start = startObj
	} else {
		start = startArr
	}

	if start != -1 {
		var end int
		if raw[start] == '[' {
			end = strings.LastIndex(raw, "]")
		} else {
			end = strings.LastIndex(raw, "}")
		}
		if end != -1 && end > start {
			raw = raw[start : end+1]
		}
	}
	return strings.TrimSpace(raw)
}

func toStringValue(v interface{}) string {
	switch value := v.(type) {
	case string:
		return strings.TrimSpace(value)
	default:
		return ""
	}
}

func normalizeItemDates(dateValue string) string {
	if strings.TrimSpace(dateValue) == "" {
		return time.Now().Format("2006-01-02")
	}
	if d, err := time.Parse("2006-01-02", dateValue); err == nil {
		return d.Format("2006-01-02")
	}
	return time.Now().Format("2006-01-02")
}

func sanitizeExtractedReceiptItems(items []map[string]interface{}, ocrText string) []map[string]interface{} {
	sanitized := make([]map[string]interface{}, 0, len(items))

	for _, item := range items {
		if item == nil {
			continue
		}

		name := toStringValue(item["name"])
		if name == "" {
			continue
		}

		quantity, okQty := toFloatValue(item["quantity"])
		if !okQty || quantity <= 0 {
			quantity = 1
		}

		// The AI has already validated and corrected unit_price if needed.
		// Trust unit_price from AI first, fall back to line_total if needed.
		var price float64

		unitPrice, okUnitPrice := toFloatValue(item["unit_price"])
		lineTotal, okLineTotal := toFloatValue(item["line_total"])

		// Prefer unit_price (which AI has already corrected if it didn't match line_total)
		if okUnitPrice {
			price = unitPrice
		} else if okLineTotal && quantity > 0 {
			// Fallback: derive from line_total if unit_price missing
			price = lineTotal / quantity
		} else {
			// Try old "price" field for backward compat
			p, okPrice := toFloatValue(item["price"])
			if okPrice && p >= 0 {
				price = p
			}
		}

		if price < 0 {
			price = 0
		}

		supplier := toStringValue(item["supplier"])
		if supplier == "" {
			supplier = "Unknown"
		}

		normalized := map[string]interface{}{
			"name":     name,
			"quantity": quantity,
			"price":    price,
			"supplier": supplier,
			"date":     normalizeItemDates(toStringValue(item["date"])),
		}

		sanitized = append(sanitized, normalized)
	}

	return sanitized
}

func parseReceiptItemsFromLLM(raw, ocrText string) ([]map[string]interface{}, error) {
	clean := cleanJSON(raw)
	log.Printf("[ExtractReceiptData] cleaned JSON: %s", clean)

	var objectResult map[string]interface{}
	if err := json.Unmarshal([]byte(clean), &objectResult); err == nil {
		if rawItems, exists := objectResult["items"]; exists {
			switch itemList := rawItems.(type) {
			case []interface{}:
				items := make([]map[string]interface{}, 0, len(itemList))
				for _, rawItem := range itemList {
					if itemMap, ok := rawItem.(map[string]interface{}); ok {
						items = append(items, itemMap)
					}
				}
				sanitized := sanitizeExtractedReceiptItems(items, ocrText)
				if len(sanitized) > 0 {
					return sanitized, nil
				}
			}
		}

		if _, hasName := objectResult["name"]; hasName {
			sanitized := sanitizeExtractedReceiptItems([]map[string]interface{}{objectResult}, ocrText)
			if len(sanitized) > 0 {
				return sanitized, nil
			}
		}
	}

	var arrayResult []map[string]interface{}
	if err := json.Unmarshal([]byte(clean), &arrayResult); err == nil {
		sanitized := sanitizeExtractedReceiptItems(arrayResult, ocrText)
		if len(sanitized) > 0 {
			return sanitized, nil
		}
	}

	return nil, fmt.Errorf("could not parse valid receipt items from model output: %s", raw)
}

func toFloatValue(v interface{}) (float64, bool) {
	switch value := v.(type) {
	case float64:
		return value, true
	case float32:
		return float64(value), true
	case int:
		return float64(value), true
	case int64:
		return float64(value), true
	case json.Number:
		f, err := value.Float64()
		if err != nil {
			return 0, false
		}
		return f, true
	case string:
		s := strings.TrimSpace(value)
		if s == "" {
			return 0, false
		}
		f, err := strconv.ParseFloat(s, 64)
		if err != nil {
			return 0, false
		}
		return f, true
	default:
		return 0, false
	}
}

func parseLooseNumber(raw string) (float64, error) {
	s := strings.TrimSpace(raw)
	s = strings.ReplaceAll(s, " ", "")
	s = strings.ReplaceAll(s, "\u00a0", "")

	commaCount := strings.Count(s, ",")
	dotCount := strings.Count(s, ".")

	if commaCount > 0 && dotCount > 0 {
		if strings.LastIndex(s, ",") > strings.LastIndex(s, ".") {
			s = strings.ReplaceAll(s, ".", "")
			s = strings.ReplaceAll(s, ",", ".")
		} else {
			s = strings.ReplaceAll(s, ",", "")
		}
	} else if commaCount > 0 {
		if commaCount == 1 {
			idx := strings.LastIndex(s, ",")
			decimals := len(s) - idx - 1
			if decimals == 3 {
				s = strings.ReplaceAll(s, ",", "")
			} else {
				s = strings.ReplaceAll(s, ",", ".")
			}
		} else {
			s = strings.ReplaceAll(s, ",", "")
		}
	} else if dotCount > 1 {
		s = strings.ReplaceAll(s, ".", "")
	}

	return strconv.ParseFloat(s, 64)
}

// ExtractReceiptData extracts structured data from a receipt image (base64).
//
// Pipeline:
//  1. Decode base64 → raw image bytes
//  2. Run Tesseract OCR → plain text
//  3. Send OCR text to Groq/Llama → JSON (with AI-side line_total validation)
func ExtractReceiptData(base64Image, mediaType string) (map[string]interface{}, error) {
	log.Printf("[ExtractReceiptData] START  mediaType=%q  b64Len=%d", mediaType, len(base64Image))

	// ── Stage 1: decode ────────────────────────────────────────────────────
	imgBytes, err := decodeBase64Image(base64Image)
	if err != nil {
		log.Printf("[ExtractReceiptData] DECODE ERROR: %v", err)
		return nil, err
	}
	log.Printf("[ExtractReceiptData] decoded %d bytes", len(imgBytes))

	// ── Stage 2: OCR ───────────────────────────────────────────────────────
	ocrText, err := runOCR(imgBytes)
	if err != nil {
		log.Printf("[ExtractReceiptData] OCR ERROR: %v", err)
		return nil, fmt.Errorf("OCR stage: %w", err)
	}

	// ── Stage 3: LLM extraction ────────────────────────────────────────────
	systemPrompt := `You are the SynchroStock AI receipt parser for a warehouse inventory management system.
Your job is to extract structured product/purchase data from receipt text or OCR output.

RESPOND ONLY WITH VALID JSON — no markdown, no code fences, no preamble, no explanation.

Required JSON schema:
{
	"items": [
		{
			"name": "string (product name, capitalize first letter of each word)",
			"quantity": number (must be > 0, default to 1 if unclear),
			"unit_price": number (unit price as shown on receipt, same currency as receipt, must be >= 0, strip currency symbols),
			"line_total": number (quantity × unit_price, or the amount column if visible),
			"supplier": "string (vendor/store name, use 'Unknown' if not found)",
			"date": "YYYY-MM-DD (use today's date if not found)"
		}
	]
}

CRITICAL VALIDATION RULES:
1. Extract quantity, unit_price (unit price column), and line_total (amount/total column) from each line.
2. ALWAYS validate: unit_price × quantity should equal line_total (within 5% due to rounding).
3. If unit_price × quantity ≠ line_total:
   - The unit_price shown on receipt is likely OCR-corrupted (e.g., missing decimal: "1800" should be "18.00")
   - Calculate the CORRECT unit_price as: line_total ÷ quantity
   - Return the calculated unit_price in the JSON (the corrected one, not the corrupted OCR value)
4. Clean up product names: remove SKU codes, normalize casing.
5. Never convert currency and never rescale by 100 or 1000 (e.g. 20 must stay 20, not 0.02).
6. Be error-tolerant: extract what you can, use sensible defaults for missing fields.
7. If nothing is readable, return {"items": []}.`

	userPrompt := fmt.Sprintf("Parse the following receipt text (extracted via OCR) and return a single JSON object.\n\nReceipt text:\n%s", ocrText)

	raw, err := callWithTemp(systemPrompt, userPrompt, 500, 0.2)
	if err != nil {
		log.Printf("[ExtractReceiptData] LLM ERROR: %v", err)
		return nil, fmt.Errorf("LLM call: %w", err)
	}
	log.Printf("[ExtractReceiptData] raw LLM response: %s", raw)

	items, err := parseReceiptItemsFromLLM(raw, ocrText)
	if err != nil {
		log.Printf("[ExtractReceiptData] JSON PARSE ERROR: %v", err)
		return nil, fmt.Errorf("JSON parse failed (%w) — raw model output: %s", err, raw)
	}
	if len(items) == 0 {
		return nil, fmt.Errorf("no valid receipt items extracted")
	}

	// Convert []map[string]interface{} to []interface{} for storage in result map
	itemsInterface := make([]interface{}, len(items))
	for i, item := range items {
		itemsInterface[i] = item
	}

	result := map[string]interface{}{
		"items": itemsInterface,
	}

	log.Printf("[ExtractReceiptData] SUCCESS: %+v", result)
	return result, nil
}

// GenerateRecommendation generates restocking recommendations based on stock data.
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

	userPrompt := fmt.Sprintf("Warehouse data:\n\nStock:\n%s\n\nRecent purchases:\n%s\n\nGive your restocking report.", stockJSON, receiptsJSON)
	return callWithTemp(systemPrompt, userPrompt, 1500, 0.5)
}

// GenerateReport generates a buys/sells analysis report.
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

	userPrompt := fmt.Sprintf("Financial data:\n\nReceipts (last 100):\n%s\n\nCommands (last 100):\n%s\n\nGenerate the financial report.", receiptsJSON, commandsJSON)
	return callWithTemp(systemPrompt, userPrompt, 2000, 0.3)
}

// AnalyzeStock provides a comprehensive stock analysis.
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

	userPrompt := fmt.Sprintf("Stock data:\n\n%s\n\nGive your inventory health analysis.", stockJSON)
	return callWithTemp(systemPrompt, userPrompt, 1500, 0.3)
}
