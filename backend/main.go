package main

import (
	"log"
	"net/http"
	"os"

	"github.com/actbuddy/ambient-presence-widget/pkg/presence"
)

func main() {
	port := os.Getenv("PORT")
	if port == "" {
		port = "8080"
	}

	hub := presence.NewHub()
	go hub.Run()

	mux := http.NewServeMux()

	// Public WebSocket stream
	mux.HandleFunc("/v1/presence/stream", presence.StreamHandler(hub))

	// Polling fallback
	mux.HandleFunc("/v1/presence/status", presence.StatusHandler(hub))

	// Internal event ingestion
	mux.HandleFunc("/internal/v1/presence/event", presence.EventHandler(hub))

	log.Printf("Presence server listening on :%s", port)
	if err := http.ListenAndServe(":"+port, mux); err != nil {
		log.Fatal(err)
	}
}
