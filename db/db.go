package db

import (
	"database/sql"
	"encoding/json"
	"fmt"
	"os"

	_ "github.com/mattn/go-sqlite3"
)

const dbPath = "train.db"

// DB wraps the sql.DB connection
type DB struct {
	*sql.DB
}

// Open opens the database connection and initializes the schema
func Open() (*DB, error) {
	db, err := sql.Open("sqlite3", dbPath)
	if err != nil {
		return nil, fmt.Errorf("failed to open database: %w", err)
	}

	// Enable foreign keys
	if _, err := db.Exec("PRAGMA foreign_keys = ON"); err != nil {
		db.Close()
		return nil, fmt.Errorf("failed to enable foreign keys: %w", err)
	}

	// Initialize schema
	if err := initSchema(db); err != nil {
		db.Close()
		return nil, fmt.Errorf("failed to initialize schema: %w", err)
	}

	return &DB{db}, nil
}

// initSchema creates all tables and indexes
func initSchema(db *sql.DB) error {
	schema, err := os.ReadFile("db/schema.sql")
	if err != nil {
		return fmt.Errorf("failed to read schema file: %w", err)
	}

	_, err = db.Exec(string(schema))
	if err != nil {
		return fmt.Errorf("failed to execute schema: %w", err)
	}

	return nil
}

// Exercise represents an exercise definition
type Exercise struct {
	ID        int    `json:"id"`
	Name      string `json:"name"`
	Type      string `json:"type"`
	Category  string `json:"category,omitempty"`
	CreatedAt string `json:"created_at"`
}

// Routine represents an exercise scheduled on a day
type Routine struct {
	ID           int     `json:"id"`
	ExerciseID   int     `json:"exercise_id"`
	DayOfWeek    string  `json:"day_of_week"`
	OrderIndex   int     `json:"order_index"`
	TargetSets   *int    `json:"target_sets,omitempty"`
	TargetReps   *int    `json:"target_reps,omitempty"`
	TargetWeight *float64 `json:"target_weight,omitempty"`
	Notes        *string `json:"notes,omitempty"`
}

// History represents a workout session
type History struct {
	ID            int      `json:"id"`
	ExerciseID    int      `json:"exercise_id"`
	SessionDate   string   `json:"session_date"`
	Weight        *float64 `json:"weight,omitempty"`
	SetsCompleted []int    `json:"sets_completed"`
	Completed     bool     `json:"completed"`
	Volume        *float64 `json:"volume,omitempty"`
	IsPR          bool     `json:"is_pr"`
	Notes         *string  `json:"notes,omitempty"`
}

// Progression tracks current weight and progression status
type Progression struct {
	ExerciseID           int      `json:"exercise_id"`
	CurrentWeight        *float64 `json:"current_weight,omitempty"`
	ConsecutiveSuccesses int      `json:"consecutive_successes"`
	ReadyToProgress      bool     `json:"ready_to_progress"`
	LastDone             *string  `json:"last_done,omitempty"`
}

// DayTitle represents a day's title
type DayTitle struct {
	DayOfWeek string `json:"day_of_week"`
	Title     string `json:"title"`
}

// CreateExercise inserts a new exercise
func (db *DB) CreateExercise(name, exerciseType, category string) (int64, error) {
	result, err := db.Exec(
		"INSERT INTO exercises (name, type, category) VALUES (?, ?, ?)",
		name, exerciseType, nullString(category),
	)
	if err != nil {
		return 0, fmt.Errorf("failed to create exercise: %w", err)
	}
	return result.LastInsertId()
}

// GetExerciseByName retrieves an exercise by name
func (db *DB) GetExerciseByName(name string) (*Exercise, error) {
	var ex Exercise
	var category sql.NullString
	err := db.QueryRow(
		"SELECT id, name, type, category, created_at FROM exercises WHERE name = ?",
		name,
	).Scan(&ex.ID, &ex.Name, &ex.Type, &category, &ex.CreatedAt)

	if err == sql.ErrNoRows {
		return nil, nil
	}
	if err != nil {
		return nil, fmt.Errorf("failed to get exercise: %w", err)
	}

	if category.Valid {
		ex.Category = category.String
	}

	return &ex, nil
}

// GetExerciseByID retrieves an exercise by ID
func (db *DB) GetExerciseByID(id int) (*Exercise, error) {
	var ex Exercise
	var category sql.NullString
	err := db.QueryRow(
		"SELECT id, name, type, category, created_at FROM exercises WHERE id = ?",
		id,
	).Scan(&ex.ID, &ex.Name, &ex.Type, &category, &ex.CreatedAt)

	if err == sql.ErrNoRows {
		return nil, nil
	}
	if err != nil {
		return nil, fmt.Errorf("failed to get exercise: %w", err)
	}

	if category.Valid {
		ex.Category = category.String
	}

	return &ex, nil
}

// CreateRoutine inserts a new routine entry
func (db *DB) CreateRoutine(exerciseID int, dayOfWeek string, orderIndex int, targetSets, targetReps *int, targetWeight *float64, notes *string) (int64, error) {
	result, err := db.Exec(
		"INSERT INTO routines (exercise_id, day_of_week, order_index, target_sets, target_reps, target_weight, notes) VALUES (?, ?, ?, ?, ?, ?, ?)",
		exerciseID, dayOfWeek, orderIndex, targetSets, targetReps, targetWeight, notes,
	)
	if err != nil {
		return 0, fmt.Errorf("failed to create routine: %w", err)
	}
	return result.LastInsertId()
}

// CreateHistory inserts a new history entry
func (db *DB) CreateHistory(exerciseID int, sessionDate string, weight *float64, setsCompleted []int, completed bool, volume *float64, isPR bool, notes *string) (int64, error) {
	setsJSON, err := json.Marshal(setsCompleted)
	if err != nil {
		return 0, fmt.Errorf("failed to marshal sets: %w", err)
	}

	result, err := db.Exec(
		"INSERT INTO history (exercise_id, session_date, weight, sets_completed, completed, volume, is_pr, notes) VALUES (?, ?, ?, ?, ?, ?, ?, ?)",
		exerciseID, sessionDate, weight, string(setsJSON), completed, volume, isPR, notes,
	)
	if err != nil {
		return 0, fmt.Errorf("failed to create history: %w", err)
	}
	return result.LastInsertId()
}

// CreateProgression inserts a new progression entry
func (db *DB) CreateProgression(exerciseID int, currentWeight *float64, consecutiveSuccesses int, readyToProgress bool, lastDone *string) error {
	_, err := db.Exec(
		"INSERT OR REPLACE INTO exercise_progression (exercise_id, current_weight, consecutive_successes, ready_to_progress, last_done) VALUES (?, ?, ?, ?, ?)",
		exerciseID, currentWeight, consecutiveSuccesses, readyToProgress, lastDone,
	)
	if err != nil {
		return fmt.Errorf("failed to create progression: %w", err)
	}
	return nil
}

// CreateDayTitle inserts or updates a day title
func (db *DB) CreateDayTitle(dayOfWeek, title string) error {
	_, err := db.Exec(
		"INSERT OR REPLACE INTO day_titles (day_of_week, title) VALUES (?, ?)",
		dayOfWeek, title,
	)
	if err != nil {
		return fmt.Errorf("failed to create day title: %w", err)
	}
	return nil
}

// Helper functions

func nullString(s string) *string {
	if s == "" {
		return nil
	}
	return &s
}

func nullInt(i int) *int {
	if i == 0 {
		return nil
	}
	return &i
}

func nullFloat(f float64) *float64 {
	if f == 0 {
		return nil
	}
	return &f
}
