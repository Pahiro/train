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

	// Run migration to move targets from routines to exercises
	if err := migrateTargetsToExercises(db); err != nil {
		return fmt.Errorf("failed to migrate targets: %w", err)
	}

	return nil
}

// migrateTargetsToExercises moves target_sets/reps/weight from routines to exercises (one-time)
func migrateTargetsToExercises(db *sql.DB) error {
	// Check if routines table still has target_sets column
	var colCount int
	err := db.QueryRow(`SELECT COUNT(*) FROM pragma_table_info('routines') WHERE name = 'target_sets'`).Scan(&colCount)
	if err != nil || colCount == 0 {
		return nil // Already migrated or fresh DB
	}

	// Check if exercises table already has target_sets column
	err = db.QueryRow(`SELECT COUNT(*) FROM pragma_table_info('exercises') WHERE name = 'target_sets'`).Scan(&colCount)
	if err != nil {
		return err
	}
	if colCount == 0 {
		// Add columns to exercises table
		for _, col := range []string{
			"ALTER TABLE exercises ADD COLUMN target_sets INTEGER",
			"ALTER TABLE exercises ADD COLUMN target_reps INTEGER",
			"ALTER TABLE exercises ADD COLUMN target_weight REAL",
		} {
			if _, err := db.Exec(col); err != nil {
				return fmt.Errorf("failed to add column: %w", err)
			}
		}
	}

	// Check if exercise_progression table exists (old schema had it for storing live weight)
	var epExists int
	db.QueryRow(`SELECT COUNT(*) FROM sqlite_master WHERE type='table' AND name='exercise_progression'`).Scan(&epExists)

	// Copy target values from routines to exercises.
	// For target_weight, prefer exercise_progression.current_weight (the actual working weight)
	// over the routine's initial value, since progression tracking may have advanced it.
	// Use ORDER BY id to get a consistent row when different days have different values.
	var copyErr error
	if epExists > 0 {
		_, copyErr = db.Exec(`
			UPDATE exercises SET
				target_sets = COALESCE(target_sets, (SELECT r.target_sets FROM routines r WHERE r.exercise_id = exercises.id AND r.target_sets IS NOT NULL ORDER BY r.id LIMIT 1)),
				target_reps = COALESCE(target_reps, (SELECT r.target_reps FROM routines r WHERE r.exercise_id = exercises.id AND r.target_reps IS NOT NULL ORDER BY r.id LIMIT 1)),
				target_weight = COALESCE(target_weight,
					(SELECT ep.current_weight FROM exercise_progression ep WHERE ep.exercise_id = exercises.id AND ep.current_weight IS NOT NULL),
					(SELECT r.target_weight FROM routines r WHERE r.exercise_id = exercises.id AND r.target_weight IS NOT NULL ORDER BY r.id LIMIT 1))
		`)
	} else {
		_, copyErr = db.Exec(`
			UPDATE exercises SET
				target_sets = COALESCE(target_sets, (SELECT r.target_sets FROM routines r WHERE r.exercise_id = exercises.id AND r.target_sets IS NOT NULL ORDER BY r.id LIMIT 1)),
				target_reps = COALESCE(target_reps, (SELECT r.target_reps FROM routines r WHERE r.exercise_id = exercises.id AND r.target_reps IS NOT NULL ORDER BY r.id LIMIT 1)),
				target_weight = COALESCE(target_weight, (SELECT r.target_weight FROM routines r WHERE r.exercise_id = exercises.id AND r.target_weight IS NOT NULL ORDER BY r.id LIMIT 1))
		`)
	}
	if copyErr != nil {
		return fmt.Errorf("failed to copy targets: %w", copyErr)
	}

	// Clean up orphaned routines (exercise was deleted but routine still references it).
	// These would violate the FK constraint on the new table.
	if _, err := db.Exec(`DELETE FROM routines WHERE exercise_id NOT IN (SELECT id FROM exercises)`); err != nil {
		return fmt.Errorf("failed to clean orphaned routines: %w", err)
	}

	// Recreate routines table without target columns.
	// database/sql does not support multi-statement queries, so each statement is a separate Exec call.
	if _, err := db.Exec(`DROP TABLE IF EXISTS routines_new`); err != nil {
		return fmt.Errorf("failed to drop routines_new: %w", err)
	}
	if _, err := db.Exec(`
		CREATE TABLE routines_new (
			id INTEGER PRIMARY KEY AUTOINCREMENT,
			exercise_id INTEGER NOT NULL,
			day_of_week TEXT NOT NULL CHECK(day_of_week IN ('Monday', 'Tuesday', 'Wednesday', 'Thursday', 'Friday', 'Saturday', 'Sunday')),
			order_index INTEGER NOT NULL,
			notes TEXT,
			created_at DATETIME DEFAULT CURRENT_TIMESTAMP,
			FOREIGN KEY (exercise_id) REFERENCES exercises(id) ON DELETE CASCADE
		)
	`); err != nil {
		return fmt.Errorf("failed to create routines_new: %w", err)
	}
	if _, err := db.Exec(`
		INSERT INTO routines_new (id, exercise_id, day_of_week, order_index, notes, created_at)
			SELECT id, exercise_id, day_of_week, order_index, notes, created_at FROM routines
	`); err != nil {
		return fmt.Errorf("failed to copy routines data: %w", err)
	}
	if _, err := db.Exec(`DROP TABLE routines`); err != nil {
		return fmt.Errorf("failed to drop old routines: %w", err)
	}
	if _, err := db.Exec(`ALTER TABLE routines_new RENAME TO routines`); err != nil {
		return fmt.Errorf("failed to rename routines_new: %w", err)
	}

	// Recreate indexes
	for _, idx := range []string{
		"CREATE INDEX IF NOT EXISTS idx_routines_day ON routines(day_of_week, order_index)",
		"CREATE INDEX IF NOT EXISTS idx_routines_exercise ON routines(exercise_id)",
		"CREATE UNIQUE INDEX IF NOT EXISTS idx_routines_day_order ON routines(day_of_week, order_index)",
	} {
		if _, err := db.Exec(idx); err != nil {
			return fmt.Errorf("failed to recreate index: %w", err)
		}
	}

	return nil
}

// Exercise represents an exercise definition
type Exercise struct {
	ID           int      `json:"id"`
	Name         string   `json:"name"`
	Type         string   `json:"type"`
	Category     string   `json:"category,omitempty"`
	TargetSets   *int     `json:"target_sets,omitempty"`
	TargetReps   *int     `json:"target_reps,omitempty"`
	TargetWeight *float64 `json:"target_weight,omitempty"`
	CreatedAt    string   `json:"created_at"`
}

// Routine represents an exercise scheduled on a day
type Routine struct {
	ID         int     `json:"id"`
	ExerciseID int     `json:"exercise_id"`
	DayOfWeek  string  `json:"day_of_week"`
	OrderIndex int     `json:"order_index"`
	Notes      *string `json:"notes,omitempty"`
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

// DayTitle represents a day's title
type DayTitle struct {
	DayOfWeek string `json:"day_of_week"`
	Title     string `json:"title"`
}

// MetricType represents a user-defined body metric type
type MetricType struct {
	ID         int    `json:"id"`
	Name       string `json:"name"`
	Unit       string `json:"unit"`
	Color      string `json:"color"`
	OrderIndex int    `json:"order_index"`
	IsDefault  bool   `json:"is_default"`
	CreatedAt  string `json:"created_at"`
}

// MetricEntry represents a single measurement of a metric
type MetricEntry struct {
	ID           int     `json:"id"`
	MetricTypeID int     `json:"metric_type_id"`
	EntryDate    string  `json:"entry_date"`
	Value        float64 `json:"value"`
	Notes        *string `json:"notes,omitempty"`
	CreatedAt    string  `json:"created_at"`
}

// CreateExercise inserts a new exercise
func (db *DB) CreateExercise(name, exerciseType, category string, targetSets, targetReps *int, targetWeight *float64) (int64, error) {
	result, err := db.Exec(
		"INSERT INTO exercises (name, type, category, target_sets, target_reps, target_weight) VALUES (?, ?, ?, ?, ?, ?)",
		name, exerciseType, nullString(category), targetSets, targetReps, targetWeight,
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
		"SELECT id, name, type, category, target_sets, target_reps, target_weight, created_at FROM exercises WHERE name = ?",
		name,
	).Scan(&ex.ID, &ex.Name, &ex.Type, &category, &ex.TargetSets, &ex.TargetReps, &ex.TargetWeight, &ex.CreatedAt)

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
		"SELECT id, name, type, category, target_sets, target_reps, target_weight, created_at FROM exercises WHERE id = ?",
		id,
	).Scan(&ex.ID, &ex.Name, &ex.Type, &category, &ex.TargetSets, &ex.TargetReps, &ex.TargetWeight, &ex.CreatedAt)

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
func (db *DB) CreateRoutine(exerciseID int, dayOfWeek string, orderIndex int, notes *string) (int64, error) {
	result, err := db.Exec(
		"INSERT INTO routines (exercise_id, day_of_week, order_index, notes) VALUES (?, ?, ?, ?)",
		exerciseID, dayOfWeek, orderIndex, notes,
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

// Metric Type CRUD

// CreateMetricType inserts a new metric type
func (db *DB) CreateMetricType(name, unit, color string, orderIndex int, isDefault bool) (int64, error) {
	result, err := db.Exec(
		"INSERT INTO metric_types (name, unit, color, order_index, is_default) VALUES (?, ?, ?, ?, ?)",
		name, unit, color, orderIndex, isDefault,
	)
	if err != nil {
		return 0, fmt.Errorf("failed to create metric type: %w", err)
	}
	return result.LastInsertId()
}

// GetMetricTypes retrieves all metric types ordered by order_index
func (db *DB) GetMetricTypes() ([]MetricType, error) {
	rows, err := db.Query(
		"SELECT id, name, unit, color, order_index, is_default, created_at FROM metric_types ORDER BY order_index",
	)
	if err != nil {
		return nil, fmt.Errorf("failed to query metric types: %w", err)
	}
	defer rows.Close()

	var metrics []MetricType
	for rows.Next() {
		var m MetricType
		if err := rows.Scan(&m.ID, &m.Name, &m.Unit, &m.Color, &m.OrderIndex, &m.IsDefault, &m.CreatedAt); err != nil {
			return nil, fmt.Errorf("failed to scan metric type: %w", err)
		}
		metrics = append(metrics, m)
	}

	return metrics, nil
}

// UpdateMetricType updates a metric type's fields
func (db *DB) UpdateMetricType(id int, name, unit, color *string, orderIndex *int) error {
	query := "UPDATE metric_types SET updated_at = CURRENT_TIMESTAMP"
	args := []interface{}{}

	if name != nil {
		query += ", name = ?"
		args = append(args, *name)
	}
	if unit != nil {
		query += ", unit = ?"
		args = append(args, *unit)
	}
	if color != nil {
		query += ", color = ?"
		args = append(args, *color)
	}
	if orderIndex != nil {
		query += ", order_index = ?"
		args = append(args, *orderIndex)
	}

	query += " WHERE id = ?"
	args = append(args, id)

	_, err := db.Exec(query, args...)
	if err != nil {
		return fmt.Errorf("failed to update metric type: %w", err)
	}
	return nil
}

// DeleteMetricType deletes a metric type (cascades to entries)
func (db *DB) DeleteMetricType(id int) error {
	_, err := db.Exec("DELETE FROM metric_types WHERE id = ?", id)
	if err != nil {
		return fmt.Errorf("failed to delete metric type: %w", err)
	}
	return nil
}

// Metric Entry CRUD

// CreateMetricEntry inserts a new metric entry
func (db *DB) CreateMetricEntry(metricTypeID int, entryDate string, value float64, notes *string) (int64, error) {
	result, err := db.Exec(
		"INSERT INTO metric_entries (metric_type_id, entry_date, value, notes) VALUES (?, ?, ?, ?)",
		metricTypeID, entryDate, value, notes,
	)
	if err != nil {
		return 0, fmt.Errorf("failed to create metric entry: %w", err)
	}
	return result.LastInsertId()
}

// GetEntriesByType retrieves entries for a specific metric type, limited by count
func (db *DB) GetEntriesByType(metricTypeID int, limit int) ([]MetricEntry, error) {
	query := "SELECT id, metric_type_id, entry_date, value, notes, created_at FROM metric_entries WHERE metric_type_id = ? ORDER BY entry_date DESC"
	if limit > 0 {
		query += fmt.Sprintf(" LIMIT %d", limit)
	}

	rows, err := db.Query(query, metricTypeID)
	if err != nil {
		return nil, fmt.Errorf("failed to query metric entries: %w", err)
	}
	defer rows.Close()

	var entries []MetricEntry
	for rows.Next() {
		var e MetricEntry
		var notes sql.NullString
		if err := rows.Scan(&e.ID, &e.MetricTypeID, &e.EntryDate, &e.Value, &notes, &e.CreatedAt); err != nil {
			return nil, fmt.Errorf("failed to scan metric entry: %w", err)
		}
		if notes.Valid {
			e.Notes = &notes.String
		}
		entries = append(entries, e)
	}

	return entries, nil
}

// GetDashboardData retrieves entries for all metrics within the last N days
func (db *DB) GetDashboardData(days int) (map[int][]MetricEntry, error) {
	query := `
		SELECT id, metric_type_id, entry_date, value, notes, created_at
		FROM metric_entries
		WHERE entry_date >= date('now', '-' || ? || ' days')
		ORDER BY entry_date DESC
	`

	rows, err := db.Query(query, days)
	if err != nil {
		return nil, fmt.Errorf("failed to query dashboard data: %w", err)
	}
	defer rows.Close()

	data := make(map[int][]MetricEntry)
	for rows.Next() {
		var e MetricEntry
		var notes sql.NullString
		if err := rows.Scan(&e.ID, &e.MetricTypeID, &e.EntryDate, &e.Value, &notes, &e.CreatedAt); err != nil {
			return nil, fmt.Errorf("failed to scan metric entry: %w", err)
		}
		if notes.Valid {
			e.Notes = &notes.String
		}
		data[e.MetricTypeID] = append(data[e.MetricTypeID], e)
	}

	return data, nil
}

// GetLatestEntry retrieves the most recent entry for a metric type
func (db *DB) GetLatestEntry(metricTypeID int) (*MetricEntry, error) {
	var e MetricEntry
	var notes sql.NullString
	err := db.QueryRow(
		"SELECT id, metric_type_id, entry_date, value, notes, created_at FROM metric_entries WHERE metric_type_id = ? ORDER BY entry_date DESC LIMIT 1",
		metricTypeID,
	).Scan(&e.ID, &e.MetricTypeID, &e.EntryDate, &e.Value, &notes, &e.CreatedAt)

	if err == sql.ErrNoRows {
		return nil, nil
	}
	if err != nil {
		return nil, fmt.Errorf("failed to get latest entry: %w", err)
	}

	if notes.Valid {
		e.Notes = &notes.String
	}

	return &e, nil
}

// UpdateMetricEntry updates a metric entry's fields
func (db *DB) UpdateMetricEntry(id int, value *float64, entryDate, notes *string) error {
	query := "UPDATE metric_entries SET "
	args := []interface{}{}
	updates := []string{}

	if value != nil {
		updates = append(updates, "value = ?")
		args = append(args, *value)
	}
	if entryDate != nil {
		updates = append(updates, "entry_date = ?")
		args = append(args, *entryDate)
	}
	if notes != nil {
		updates = append(updates, "notes = ?")
		args = append(args, *notes)
	}

	if len(updates) == 0 {
		return nil
	}

	query += updates[0]
	for i := 1; i < len(updates); i++ {
		query += ", " + updates[i]
	}
	query += " WHERE id = ?"
	args = append(args, id)

	_, err := db.Exec(query, args...)
	if err != nil {
		return fmt.Errorf("failed to update metric entry: %w", err)
	}
	return nil
}

// DeleteMetricEntry deletes a metric entry
func (db *DB) DeleteMetricEntry(id int) error {
	_, err := db.Exec("DELETE FROM metric_entries WHERE id = ?", id)
	if err != nil {
		return fmt.Errorf("failed to delete metric entry: %w", err)
	}
	return nil
}
