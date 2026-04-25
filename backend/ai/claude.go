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
	apiKey := os.Getenv("GROQ_API_KEY")
	if apiKey == "" {
		return "", fmt.Errorf("GROQ_API_KEY not set")
	}

	req := GroqRequest{
		Model:       "llama-3.3-70b-versatile",
		MaxTokens:   maxTokens,
		Temperature: 0.7,
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
	systemPrompt := `You are a receipt OCR system. Extract data and respond ONLY with valid JSON, no markdown, no preamble. Schema: {"name":"string","quantity":number,"price":number,"supplier":"string","date":"YYYY-MM-DD"}`
	userPrompt := fmt.Sprintf(`Extract receipt data from this image and return JSON only. Image (base64): %s`, base64Image)

	text, err := call(systemPrompt, userPrompt, 500)
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
	systemPrompt := `You are an inventory management AI. Analyze the current stock levels and recent receipt history, then provide actionable restocking recommendations.`
	userPrompt := fmt.Sprintf(`Current Stock:
%s

Recent Receipts/Purchases:
%s

Provide a clear, concise recommendation report with:
1. Items that need immediate restocking (quantity < threshold)
2. Items with high turnover that should be monitored
3. Cost optimization suggestions
4. Specific order quantities for each item needing restock`, stockJSON, receiptsJSON)

	return call(systemPrompt, userPrompt, 1500)
}

// GenerateReport generates a buys/sells analysis report
func GenerateReport(receiptsJSON, commandsJSON string) (string, error) {
	systemPrompt := `You are a financial inventory analyst. Generate a comprehensive buys/sells report based on the provided data.`
	userPrompt := fmt.Sprintf(`Receipts (purchases/inflows):
%s

Commands (orders/outflows):
%s

Provide:
1. Total purchase value and item breakdown
2. Total order value and item breakdown  
3. Inventory turnover analysis
4. Profitability insights
5. Trends and anomalies detected`, receiptsJSON, commandsJSON)

	return call(systemPrompt, userPrompt, 2000)
}

// AnalyzeStock provides a comprehensive stock analysis
func AnalyzeStock(stockJSON string) (string, error) {
	systemPrompt := `You are an inventory AI analyst. Analyze the stock data and provide insights.`
	userPrompt := fmt.Sprintf(`Stock Data:
%s

Provide:
1. Overall inventory health score (1-10)
2. Critical low-stock alerts
3. Overstocked items
4. Storage optimization suggestions
5. Short-term and long-term recommendations`, stockJSON)

	return call(systemPrompt, userPrompt, 1500)
}
