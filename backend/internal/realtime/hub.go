// Package realtime — простой WebSocket-хаб с комнатами по обращению.
package realtime

import (
	"encoding/json"
	"sync"

	"github.com/gorilla/websocket"
)

type client struct {
	conn *websocket.Conn
	send chan []byte
}

type Hub struct {
	mu    sync.RWMutex
	rooms map[string]map[*client]bool
}

func NewHub() *Hub {
	return &Hub{rooms: map[string]map[*client]bool{}}
}

// Event — сообщение, рассылаемое участникам комнаты.
type Event struct {
	Type string      `json:"type"`
	Data interface{} `json:"data,omitempty"`
}

// Broadcast рассылает событие всем клиентам комнаты.
func (h *Hub) Broadcast(room string, ev Event) {
	msg, err := json.Marshal(ev)
	if err != nil {
		return
	}
	h.mu.RLock()
	defer h.mu.RUnlock()
	for c := range h.rooms[room] {
		select {
		case c.send <- msg:
		default:
		}
	}
}

func (h *Hub) add(room string, c *client) {
	h.mu.Lock()
	defer h.mu.Unlock()
	if h.rooms[room] == nil {
		h.rooms[room] = map[*client]bool{}
	}
	h.rooms[room][c] = true
}

func (h *Hub) remove(room string, c *client) {
	h.mu.Lock()
	defer h.mu.Unlock()
	if h.rooms[room] != nil {
		delete(h.rooms[room], c)
		if len(h.rooms[room]) == 0 {
			delete(h.rooms, room)
		}
	}
}

// Serve обслуживает одно WS-соединение в указанной комнате.
func (h *Hub) Serve(conn *websocket.Conn, room string) {
	c := &client{conn: conn, send: make(chan []byte, 16)}
	h.add(room, c)
	defer func() {
		h.remove(room, c)
		conn.Close()
	}()

	// писатель
	go func() {
		for msg := range c.send {
			if err := conn.WriteMessage(websocket.TextMessage, msg); err != nil {
				return
			}
		}
	}()

	// читатель (нужен, чтобы обрабатывать ping/close); входящие игнорируем
	for {
		if _, _, err := conn.ReadMessage(); err != nil {
			close(c.send)
			return
		}
	}
}
