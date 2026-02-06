package main

import (
	"encoding/json"
	"io"
	"log"
	"net/http"
	"os"
	"sync"

	"train/db"
	"train/handlers"
)

const (
	port          = ":3001" // Keeping same port as old server for ease
	trainFilePath = "train.json"
)

type Server struct {
	mu sync.Mutex
	db *db.DB
}

func main() {
	// Check if migration is needed
	if db.ShouldMigrate() {
		log.Println("Database not found. Starting migration from train.json...")
		if err := db.Migrate(); err != nil {
			log.Fatalf("Migration failed: %v", err)
		}
		log.Println("Migration completed successfully!")
	}

	// Open database connection
	database, err := db.Open()
	if err != nil {
		log.Fatalf("Failed to open database: %v", err)
	}
	defer database.Close()

	server := &Server{db: database}

	// Register handlers
	http.Handle("/", http.FileServer(http.Dir("./public")))
	http.HandleFunc("/api/training", server.handleTraining)

	// New API endpoints
	http.Handle("/api/exercises", &handlers.ExercisesHandler{DB: database})
	http.Handle("/api/exercises/", &handlers.ExercisesHandler{DB: database})
	http.Handle("/api/routines", &handlers.RoutinesHandler{DB: database})
	http.Handle("/api/routines/", &handlers.RoutinesHandler{DB: database})
	http.Handle("/api/history", &handlers.HistoryHandler{DB: database})
	http.Handle("/api/history/", &handlers.HistoryHandler{DB: database})
	http.Handle("/api/days/", &handlers.DaysHandler{DB: database})

	log.Printf("Server listening on http://localhost%s", port)
	err = http.ListenAndServe(port, nil)
	if err != nil {
		log.Fatal(err)
	}
}

func (s *Server) handleTraining(w http.ResponseWriter, r *http.Request) {
	s.mu.Lock()
	defer s.mu.Unlock()

	switch r.Method {
	case http.MethodGet:
		data, err := os.ReadFile(trainFilePath)
		if err != nil {
			if os.IsNotExist(err) {
				http.Error(w, "Training data not found", http.StatusNotFound)
				return
			}
			http.Error(w, "Error reading training data", http.StatusInternalServerError)
			log.Printf("Error reading file: %v", err)
			return
		}
		w.Header().Set("Content-Type", "application/json")
		w.Write(data)

	case http.MethodPost:
		body, err := io.ReadAll(r.Body)
		if err != nil {
			http.Error(w, "Error reading request body", http.StatusBadRequest)
			return
		}
		defer r.Body.Close()

		// Validate JSON
		var js map[string]interface{}
		if json.Unmarshal(body, &js) != nil {
			http.Error(w, "Invalid JSON", http.StatusBadRequest)
			return
		}

		err = os.WriteFile(trainFilePath, body, 0644)
		if err != nil {
			http.Error(w, "Error saving training data", http.StatusInternalServerError)
			log.Printf("Error writing file: %v", err)
			return
		}
		w.WriteHeader(http.StatusOK)
		w.Write([]byte("Training data updated successfully"))

	default:
		http.Error(w, "Method not allowed", http.StatusMethodNotAllowed)
	}
}
