package presence

import (
	"encoding/json"
	"log"
	"sync"
	"time"

	"github.com/gorilla/websocket"
)

const (
	PingInterval = 20 * time.Second
	PongTimeout  = 30 * time.Second
	writeWait    = 10 * time.Second
)

// Client represents a connected WebSocket subscriber
type Client struct {
	conn         *websocket.Conn
	buddyID      string // the buddy they are watching
	privacyLevel int
	send         chan []byte
	hub          *Hub
}

// Hub manages all connected clients and presence state
type Hub struct {
	mu         sync.RWMutex
	clients    map[*Client]struct{}
	presence   map[string]*PresenceStatus // buddyID -> status
	broadcast  chan PresenceEvent
	register   chan *Client
	unregister chan *Client
}

func NewHub() *Hub {
	return &Hub{
		clients:    make(map[*Client]struct{}),
		presence:   make(map[string]*PresenceStatus),
		broadcast:  make(chan PresenceEvent, 256),
		register:   make(chan *Client, 64),
		unregister: make(chan *Client, 64),
	}
}

func (h *Hub) Run() {
	ticker := time.NewTicker(PingInterval)
	defer ticker.Stop()

	for {
		select {
		case client := <-h.register:
			h.mu.Lock()
			h.clients[client] = struct{}{}
			h.mu.Unlock()

		case client := <-h.unregister:
			h.mu.Lock()
			if _, ok := h.clients[client]; ok {
				delete(h.clients, client)
				close(client.send)
			}
			h.mu.Unlock()

		case event := <-h.broadcast:
			// Update presence state
			h.mu.Lock()
			h.presence[event.BuddyID] = &PresenceStatus{
				BuddyID:      event.BuddyID,
				LastEvent:    event.Event,
				LastSeen:     event.Ts,
				PrivacyLevel: event.PrivacyLevel,
				Intensity:    event.Intensity,
				CategoryHue:  event.CategoryHue,
			}
			clients := make([]*Client, 0, len(h.clients))
			for c := range h.clients {
				clients = append(clients, c)
			}
			h.mu.Unlock()

			// Send filtered event to all clients watching this buddy
			for _, c := range clients {
				if c.buddyID != event.BuddyID {
					continue
				}
				filtered := FilterPayload(event, c.privacyLevel)
				data, err := json.Marshal(filtered)
				if err != nil {
					log.Printf("marshal error: %v", err)
					continue
				}
				select {
				case c.send <- data:
				default:
					// buffer full, drop
				}
			}

		case <-ticker.C:
			// Ping all clients
			h.mu.RLock()
			clients := make([]*Client, 0, len(h.clients))
			for c := range h.clients {
				clients = append(clients, c)
			}
			h.mu.RUnlock()

			for _, c := range clients {
				select {
				case c.send <- nil: // nil = ping signal
				default:
				}
			}
		}
	}
}

// Broadcast sends a presence event to all relevant clients
func (h *Hub) Broadcast(event PresenceEvent) {
	h.broadcast <- event
}

// writePump handles writes to the WebSocket connection
func (c *Client) writePump() {
	defer c.conn.Close()
	for {
		msg, ok := <-c.send
		if !ok {
			c.conn.WriteMessage(websocket.CloseMessage, []byte{})
			return
		}
		c.conn.SetWriteDeadline(time.Now().Add(writeWait))
		if msg == nil {
			// ping
			if err := c.conn.WriteMessage(websocket.PingMessage, nil); err != nil {
				return
			}
			continue
		}
		if err := c.conn.WriteMessage(websocket.TextMessage, msg); err != nil {
			return
		}
	}
}

// readPump handles pong responses and connection lifecycle
func (c *Client) readPump() {
	defer func() {
		c.hub.unregister <- c
		c.conn.Close()
	}()

	c.conn.SetReadDeadline(time.Now().Add(PongTimeout))
	c.conn.SetPongHandler(func(string) error {
		c.conn.SetReadDeadline(time.Now().Add(PongTimeout))
		return nil
	})

	for {
		_, _, err := c.conn.ReadMessage()
		if err != nil {
			if websocket.IsUnexpectedCloseError(err, websocket.CloseGoingAway, websocket.CloseAbnormalClosure) {
				log.Printf("ws error: %v", err)
			}
			break
		}
	}
}
