package ai

import (
	"bytes"
	"encoding/json"
	"fmt"
	"io"
	"net/http"
	"os"
	"strings"
)

const groqURL = "https://api.groq.com/openai/v1/chat/completions"

const textModel = "llama-3.3-70b-versatile"
const visionModel = "meta-llama/llama-4-scout-17b-16e-instruct"

type ChatMessage struct {
	Role    string      `json:"role"`
	Content interface{} `json:"content"`
}

type ResponseFormat struct {
	Type string `json:"type"`
}

type GroqRequest struct {
	Model               string         `json:"model"`
	Messages            []ChatMessage  `json:"messages"`
	MaxCompletionTokens int            `json:"max_completion_tokens"`
	Temperature         float64        `json:"temperature"`
	ResponseFormat      ResponseFormat `json:"response_format,omitempty"`
}

type GroqResponse struct {
	Choices []struct {
		Message struct {
			Content string `json:"content"`
		} `json:"message"`
	} `json:"choices"`
}

func call(model string, messages []ChatMessage, maxTokens int, temperature float64, jsonMode bool) (string, error) {
	apiKey := os.Getenv("GROQ_API_KEY")
	if apiKey == "" {
		return "", fmt.Errorf("GROQ_API_KEY not set")
	}

	req := GroqRequest{
		Model:               model,
		Messages:            messages,
		MaxCompletionTokens: maxTokens,
		Temperature:         temperature,
	}

	if jsonMode {
		req.ResponseFormat = ResponseFormat{Type: "json_object"}
	}

	body, err := json.Marshal(req)
	if err != nil {
		return "", err
	}

	httpReq, err := http.NewRequest("POST", groqURL, bytes.NewReader(body))
	if err != nil {
		return "", err
	}

	httpReq.Header.Set("Content-Type", "application/json")
	httpReq.Header.Set("Authorization", "Bearer "+apiKey)

	resp, err := http.DefaultClient.Do(httpReq)
	if err != nil {
		return "", err
	}
	defer resp.Body.Close()

	data, _ := io.ReadAll(resp.Body)

	if resp.StatusCode != http.StatusOK {
		return "", fmt.Errorf("groq API error %d: %s", resp.StatusCode, string(data))
	}

	var r GroqResponse
	if err := json.Unmarshal(data, &r); err != nil {
		return "", err
	}

	if len(r.Choices) == 0 {
		return "", fmt.Errorf("empty response from Groq")
	}

	return strings.TrimSpace(r.Choices[0].Message.Content), nil
}

func textMessages(systemPrompt, userPrompt string) []ChatMessage {
	return []ChatMessage{
		{Role: "system", Content: systemPrompt},
		{Role: "user", Content: userPrompt},
	}
}

func imageMessages(systemPrompt, userText, base64Image, mediaType string) []ChatMessage {
	imageURL := fmt.Sprintf("data:%s;base64,%s", mediaType, base64Image)

	return []ChatMessage{
		{
			Role:    "system",
			Content: systemPrompt,
		},
		{
			Role: "user",
			Content: []map[string]interface{}{
				{
					"type": "text",
					"text": userText,
				},
				{
					"type": "image_url",
					"image_url": map[string]string{
						"url": imageURL,
					},
				},
			},
		},
	}
}

// ExtractReceiptData extracts structured invoice/receipt data from an image.
func ExtractReceiptData(base64Image, mediaType string) (map[string]interface{}, error) {
	systemPrompt := `
You are an AI invoice and receipt extraction engine for a warehouse stock system.

Your job:
1. Decide if the image is a valid purchase invoice, receipt, delivery note, or stock entry document.
2. Extract only information visible in the image.
3. Never invent missing values.
4. Return ONLY valid JSON.
5. No markdown.
6. No explanations outside JSON.

Rules:
- If the document is not related to stock, purchasing, receipt, invoice, or delivery, set "is_valid_invoice": false.
- If a value is missing, unclear, or unreadable, use null.
- Extract all line items if multiple products exist.
- Quantities must be numbers.
- Prices must be numbers.
- Dates must use YYYY-MM-DD if possible.
- Confidence values must be between 0 and 1.
- Add warnings for unclear fields, missing totals, unreadable product names, or suspicious data.
- Do not calculate values unless the calculation is obvious from visible fields.

Return this exact JSON shape:
{
  "is_valid_invoice": true,
  "document_type": "invoice | receipt | delivery_note | stock_entry | unknown",
  "invoice_number": null,
  "supplier": null,
  "date": null,
  "currency": null,
  "items": [
    {
      "name": null,
      "quantity": null,
      "unit": null,
      "unit_price": null,
      "total_price": null,
      "confidence": 0.0
    }
  ],
  "subtotal": null,
  "tax": null,
  "total": null,
  "warnings": [],
  "overall_confidence": 0.0
}
`

	userPrompt := `
Analyze this warehouse invoice/receipt image.

Extract structured stock information.

Return JSON only.
`

	messages := imageMessages(systemPrompt, userPrompt, base64Image, mediaType)

	text, err := call(visionModel, messages, 1200, 0.1, true)
	if err != nil {
		return nil, err
	}

	var result map[string]interface{}
	if err := json.Unmarshal([]byte(text), &result); err != nil {
		return nil, fmt.Errorf("failed to parse JSON: %v, raw: %s", err, text)
	}

	return result, nil
}

// GenerateRecommendation generates restocking recommendations.
func GenerateRecommendation(stockJSON, receiptsJSON string) (string, error) {
	systemPrompt := `
You are an inventory optimization assistant for an AI warehouse stock MVP.

Your job:
Analyze current stock and recent receipt history, then create practical restocking recommendations.

Rules:
- Use only the provided data.
- Do not invent missing thresholds.
- If thresholds are missing, estimate risk based on current quantity and recent movement.
- Clearly separate urgent, medium, and low priority items.
- Give specific order quantity suggestions when possible.
- Explain the reason behind each recommendation.
- Keep the report clear for a supervisor.
`

	userPrompt := fmt.Sprintf(`
Current stock data:
%s

Recent receipts / purchases:
%s

Create a recommendation report with:

1. Executive summary
2. Critical low-stock items
3. Items that should be monitored
4. Overstocked or slow-moving items
5. Suggested order quantities
6. Cost optimization suggestions
7. Data quality warnings
`, stockJSON, receiptsJSON)

	return call(textModel, textMessages(systemPrompt, userPrompt), 1800, 0.4, false)
}

// GenerateReport generates accountant purchase/sales report.
func GenerateReport(receiptsJSON, commandsJSON string) (string, error) {
	systemPrompt := `
You are a warehouse accountant assistant.

Your job:
Generate a clear financial stock movement report based on purchases and outgoing orders.

Rules:
- Use only the provided data.
- Do not invent missing prices, revenue, profit, or costs.
- If selling prices are missing, say profitability cannot be calculated accurately.
- Highlight anomalies such as missing prices, negative stock, unusual quantities, duplicated items, or mismatched totals.
- Structure the report for a non-technical accountant.
`

	userPrompt := fmt.Sprintf(`
Receipts / purchases / stock inflows:
%s

Commands / orders / stock outflows:
%s

Generate a report with:

1. Purchase summary
2. Outgoing order summary
3. Item-by-item breakdown
4. Total purchase value if possible
5. Total order value if possible
6. Stock movement analysis
7. Profitability insights if enough data exists
8. Anomalies and warnings
9. Final accountant notes
`, receiptsJSON, commandsJSON)

	return call(textModel, textMessages(systemPrompt, userPrompt), 2200, 0.4, false)
}

// AnalyzeStock provides stock analysis for supervisor dashboard.
func AnalyzeStock(stockJSON string) (string, error) {
	systemPrompt := `
You are a warehouse stock control analyst.

Your job:
Analyze current stock data and produce operational insights.

Rules:
- Focus on stock risk, low stock, overstock, dead stock, and movement problems.
- Use simple business language.
- Give an inventory health score from 1 to 10.
- Explain the score.
- Use only the provided data.
- Do not invent missing values.
`

	userPrompt := fmt.Sprintf(`
Stock data:
%s

Provide:

1. Inventory health score from 1 to 10
2. Score explanation
3. Critical low-stock alerts
4. Overstocked items
5. Dead stock or slow-moving items
6. Storage optimization suggestions
7. Short-term recommendations
8. Long-term recommendations
9. Data quality warnings
`, stockJSON)

	return call(textModel, textMessages(systemPrompt, userPrompt), 1800, 0.4, false)
}