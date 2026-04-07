package presence

import "time"

type EventType string

const (
	EventSessionStart EventType = "session_start"
	EventTaskComplete EventType = "task_complete"
	EventAway         EventType = "away"
	EventBack         EventType = "back"
	EventLogout       EventType = "logout"
)

// PresenceEvent is the JSON payload sent/received
type PresenceEvent struct {
	Event        EventType `json:"event"`
	BuddyID      string    `json:"buddy_id"`
	PrivacyLevel int       `json:"privacy_level"`
	Intensity    float64   `json:"intensity"`
	CategoryHue  int       `json:"category_hue"`
	Ts           time.Time `json:"ts"`
}

// PresenceStatus tracks the current status for a buddy
type PresenceStatus struct {
	BuddyID      string
	LastEvent    EventType
	LastSeen     time.Time
	PrivacyLevel int
	Intensity    float64
	CategoryHue  int
}
