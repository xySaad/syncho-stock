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
	"math"
	"net/http"
	"os"
	"os/exec"
	"regexp"
	"strconv"
	"strings"

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
	// Find the first '{' and last '}' to be safe.
	start := strings.Index(raw, "{")
	end := strings.LastIndex(raw, "}")
	if start != -1 && end != -1 && end > start {
		raw = raw[start : end+1]
	}
	return strings.TrimSpace(raw)
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

func inferReceiptTotal(ocrText string) (float64, bool) {
	patterns := []string{
		`(?im)total\s*ht\s*[:=-]?\s*([0-9][0-9\s,\.]+)`,
		`(?im)total\s*ttc\s*[:=-]?\s*([0-9][0-9\s,\.]+)`,
		`(?im)total\s*[:=-]?\s*([0-9][0-9\s,\.]+)`,
	}

	for _, pattern := range patterns {
		re := regexp.MustCompile(pattern)
		matches := re.FindStringSubmatch(ocrText)
		if len(matches) < 2 {
			continue
		}
		v, err := parseLooseNumber(matches[1])
		if err != nil || v <= 0 {
			continue
		}
		return v, true
	}

	return 0, false
}

func normalizeExtractedReceiptValues(result map[string]interface{}, ocrText string) {
	quantity, okQty := toFloatValue(result["quantity"])
	price, okPrice := toFloatValue(result["price"])
	if !okQty || !okPrice || quantity <= 0 || price <= 0 {
		return
	}

	if price >= 1 {
		return
	}

	total, okTotal := inferReceiptTotal(ocrText)
	if !okTotal {
		return
	}

	inferredUnit := total / quantity
	if inferredUnit < 1 {
		return
	}

	diffRatio := math.Abs(price-inferredUnit) / inferredUnit
	if diffRatio < 0.5 {
		return
	}

	corrected := math.Round(inferredUnit*100) / 100
	log.Printf("[ExtractReceiptData] corrected suspicious price from %.6f to %.2f using total %.2f / qty %.2f", price, corrected, total, quantity)
	result["price"] = corrected
}

// ExtractReceiptData extracts structured data from a receipt image (base64).
//
// Pipeline:
//  1. Decode base64 → raw image bytes
//  2. Run Tesseract OCR → plain text
//  3. Send OCR text to Groq/Llama → JSON
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
  "name": "string (product name, capitalize first letter of each word)",
  "quantity": number (must be > 0, default to 1 if unclear),
	"price": number (unit price as shown on receipt, same currency as receipt, must be >= 0, strip currency symbols),
  "supplier": "string (vendor/store name, use 'Unknown' if not found)",
  "date": "YYYY-MM-DD (use today's date if not found)"
}

Rules:
- If multiple items are on the receipt, extract only the FIRST/primary item.
- Clean up product names: remove SKU codes, normalize casing.
- Prices should be per-unit, not totals. If only total is given, divide by quantity.
- Never convert currency and never rescale by 100 or 1000 (e.g. 20 must stay 20, not 0.02).
- Be error-tolerant: extract what you can, use sensible defaults for missing fields.`

	userPrompt := fmt.Sprintf("Parse the following receipt text (extracted via OCR) and return a single JSON object.\n\nReceipt text:\n%s", ocrText)

	raw, err := callWithTemp(systemPrompt, userPrompt, 500, 0.2)
	if err != nil {
		log.Printf("[ExtractReceiptData] LLM ERROR: %v", err)
		return nil, fmt.Errorf("LLM call: %w", err)
	}
	log.Printf("[ExtractReceiptData] raw LLM response: %s", raw)

	clean := cleanJSON(raw)
	log.Printf("[ExtractReceiptData] cleaned JSON: %s", clean)

	var result map[string]interface{}
	if err := json.Unmarshal([]byte(clean), &result); err != nil {
		log.Printf("[ExtractReceiptData] JSON PARSE ERROR: %v", err)
		return nil, fmt.Errorf("JSON parse failed (%w) — raw model output: %s", err, raw)
	}

	normalizeExtractedReceiptValues(result, ocrText)

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
