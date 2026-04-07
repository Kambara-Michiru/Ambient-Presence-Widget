package presence

import (
	"encoding/json"
	"log"
	"net/http"
	"strconv"

	"github.com/gorilla/websocket"
)

var upgrader = websocket.Upgrader{
	ReadBufferSize:  1024,
	WriteBufferSize: 1024,
	CheckOrigin: func(r *http.Request) bool {
		return true // Dev: allow all origins
	},
}

// StreamHandler handles GET /v1/presence/stream (WebSocket)
// Query params: buddy_id, privacy_level
func StreamHandler(hub *Hub) http.HandlerFunc {
	return func(w http.ResponseWriter, r *http.Request) {
		buddyID := r.URL.Query().Get("buddy_id")
		if buddyID == "" {
			http.Error(w, "buddy_id required", http.StatusBadRequest)
			return
		}
		privacyLevel := 2 // default
		if pl := r.URL.Query().Get("privacy_level"); pl != "" {
			if v, err := strconv.Atoi(pl); err == nil && v >= 1 && v <= 4 {
				privacyLevel = v
			}
		}

		conn, err := upgrader.Upgrade(w, r, nil)
		if err != nil {
			log.Printf("upgrade error: %v", err)
			return
		}

		client := &Client{
			conn:         conn,
			buddyID:      buddyID,
			privacyLevel: privacyLevel,
			send:         make(chan []byte, 256),
			hub:          hub,
		}

		hub.register <- client

		go client.writePump()
		client.readPump()
	}
}

// EventHandler handles POST /internal/v1/presence/event
func EventHandler(hub *Hub) http.HandlerFunc {
	return func(w http.ResponseWriter, r *http.Request) {
		if r.Method != http.MethodPost {
			http.Error(w, "method not allowed", http.StatusMethodNotAllowed)
			return
		}
		var event PresenceEvent
		if err := json.NewDecoder(r.Body).Decode(&event); err != nil {
			http.Error(w, "invalid JSON", http.StatusBadRequest)
			return
		}
		if event.BuddyID == "" {
			http.Error(w, "buddy_id required", http.StatusBadRequest)
			return
		}
		hub.Broadcast(event)
		w.WriteHeader(http.StatusAccepted)
	}
}

// StatusHandler handles GET /v1/presence/status (polling fallback)
func StatusHandler(hub *Hub) http.HandlerFunc {
	return func(w http.ResponseWriter, r *http.Request) {
		buddyID := r.URL.Query().Get("buddy_id")
		if buddyID == "" {
			http.Error(w, "buddy_id required", http.StatusBadRequest)
			return
		}

		hub.mu.RLock()
		status, ok := hub.presence[buddyID]
		hub.mu.RUnlock()

		if !ok {
			w.Header().Set("Content-Type", "application/json")
			json.NewEncoder(w).Encode(map[string]string{"status": "OFFLINE"})
			return
		}

		w.Header().Set("Content-Type", "application/json")
		json.NewEncoder(w).Encode(status)
	}
}
