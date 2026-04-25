package handlers

import (
	"log"
	"net/http"
	"sync"

	"github.com/gin-gonic/gin"
	"github.com/gorilla/websocket"
)

var upgrader = websocket.Upgrader{
	CheckOrigin: func(r *http.Request) bool { return true },
}

type Hub struct {
	mu      sync.RWMutex
	clients map[*websocket.Conn]string // conn -> role
}

var GlobalHub = &Hub{
	clients: make(map[*websocket.Conn]string),
}

func (h *Hub) Register(conn *websocket.Conn, role string) {
	h.mu.Lock()
	defer h.mu.Unlock()
	h.clients[conn] = role
}

func (h *Hub) Unregister(conn *websocket.Conn) {
	h.mu.Lock()
	defer h.mu.Unlock()
	delete(h.clients, conn)
}

func (h *Hub) Broadcast(msg []byte) {
	h.mu.RLock()
	defer h.mu.RUnlock()
	for conn := range h.clients {
		if err := conn.WriteMessage(websocket.TextMessage, msg); err != nil {
			log.Printf("ws write error: %v", err)
		}
	}
}

func (h *Hub) BroadcastToRole(msg []byte, role string) {
	h.mu.RLock()
	defer h.mu.RUnlock()
	for conn, r := range h.clients {
		if r == role {
			if err := conn.WriteMessage(websocket.TextMessage, msg); err != nil {
				log.Printf("ws write error: %v", err)
			}
		}
	}
}

func HandleWebSocket(c *gin.Context) {
	role := c.GetString("role")
	conn, err := upgrader.Upgrade(c.Writer, c.Request, nil)
	if err != nil {
		log.Printf("ws upgrade error: %v", err)
		return
	}
	defer func() {
		GlobalHub.Unregister(conn)
		conn.Close()
	}()

	GlobalHub.Register(conn, role)
	log.Printf("WS client connected: role=%s", role)

	for {
		_, _, err := conn.ReadMessage()
		if err != nil {
			break
		}
	}
}
