package main

import (
	"log"
	"os"

	"inventory-app/db"
	"inventory-app/handlers"
	"inventory-app/middleware"

	"github.com/gin-contrib/cors"
	"github.com/gin-gonic/gin"
)

func main() {
	db.Connect()

	r := gin.Default()

	// CORS
	r.Use(cors.New(cors.Config{
		AllowOrigins:     []string{"http://localhost:3000", "http://localhost:3001"},
		AllowMethods:     []string{"GET", "POST", "PUT", "PATCH", "DELETE", "OPTIONS"},
		AllowHeaders:     []string{"Origin", "Content-Type", "Authorization"},
		ExposeHeaders:    []string{"Content-Length"},
		AllowCredentials: true,
	}))

	// Public routes
	r.POST("/api/auth/login", handlers.Login)
	r.POST("/api/auth/register", handlers.Register)

	// Protected routes
	auth := r.Group("/api", middleware.AuthMiddleware())
	{
		auth.GET("/me", handlers.GetMe)

		// WebSocket
		auth.GET("/ws", handlers.HandleWebSocket)

		// Worker + all roles
		auth.POST("/receipts", middleware.RequireRole("worker", "supervisor"), handlers.UploadReceipt)
		auth.GET("/receipts", handlers.GetReceipts)

		// Commands
		auth.GET("/commands", handlers.GetCommands)
		auth.POST("/command", middleware.RequireRole("supervisor"), handlers.CreateCommand)
		auth.POST("/commands/:id/validate", middleware.RequireRole("worker"), handlers.ValidateCommand)

		// Stock
		auth.GET("/stock", handlers.GetStock)

		// AI
		auth.GET("/recommendation", middleware.RequireRole("supervisor"), handlers.GetRecommendation)
		auth.GET("/analysis", middleware.RequireRole("supervisor"), handlers.GetAnalysis)
		auth.GET("/report", middleware.RequireRole("inventory_accountant", "supervisor"), handlers.GenerateAccountantReport)
	}

	port := os.Getenv("PORT")
	if port == "" {
		port = "8080"
	}

	log.Printf("Server starting on :%s", port)
	if err := r.Run(":" + port); err != nil {
		log.Fatal(err)
	}
}
