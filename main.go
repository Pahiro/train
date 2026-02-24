package main

import (
	"log"
	"net/http"

	"train/db"
	"train/handlers"
)

const port = ":3001" // Keeping same port as old server for ease

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

	// Register handlers
	http.Handle("/", http.FileServer(http.Dir("./public")))

	// API endpoints
	http.Handle("/api/exercises", &handlers.ExercisesHandler{DB: database})
	http.Handle("/api/exercises/", &handlers.ExercisesHandler{DB: database})
	http.Handle("/api/routines", &handlers.RoutinesHandler{DB: database})
	http.Handle("/api/routines/", &handlers.RoutinesHandler{DB: database})
	http.Handle("/api/history", &handlers.HistoryHandler{DB: database})
	http.Handle("/api/history/", &handlers.HistoryHandler{DB: database})
	http.Handle("/api/days/", &handlers.DaysHandler{DB: database})
	http.Handle("/api/metrics", &handlers.MetricsHandler{DB: database})
	http.Handle("/api/metrics/", &handlers.MetricsHandler{DB: database})
	http.Handle("/api/metric-entries", &handlers.MetricEntriesHandler{DB: database})
	http.Handle("/api/metric-entries/", &handlers.MetricEntriesHandler{DB: database})

	log.Printf("Server listening on http://localhost%s", port)
	err = http.ListenAndServe(port, nil)
	if err != nil {
		log.Fatal(err)
	}
}
