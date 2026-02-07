package handlers

import (
	"database/sql"
	"encoding/json"
	"fmt"
	"net/http"
	"strconv"
	"strings"

	"train/db"
)

// RoutinesHandler handles routine-related operations
type RoutinesHandler struct {
	DB *db.DB
}

// ServeHTTP handles routine-related requests
func (h *RoutinesHandler) ServeHTTP(w http.ResponseWriter, r *http.Request) {
	path := strings.TrimPrefix(r.URL.Path, "/api/routines")
	path = strings.TrimPrefix(path, "/")

	// Handle reorder endpoint
	if r.Method == http.MethodPost && path == "reorder" {
		h.reorderRoutines(w, r)
		return
	}

	switch r.Method {
	case http.MethodGet:
		// GET /api/routines/:day
		h.getRoutinesByDay(w, r, path)
	case http.MethodPost:
		h.createRoutine(w, r)
	case http.MethodPut:
		h.updateRoutine(w, r, path)
	case http.MethodDelete:
		h.deleteRoutine(w, r, path)
	default:
		http.Error(w, "Method not allowed", http.StatusMethodNotAllowed)
	}
}

// getRoutinesByDay returns all exercises for a specific day
func (h *RoutinesHandler) getRoutinesByDay(w http.ResponseWriter, r *http.Request, day string) {
	if day == "" {
		http.Error(w, "Day of week is required", http.StatusBadRequest)
		return
	}

	// Validate day
	validDays := []string{"Monday", "Tuesday", "Wednesday", "Thursday", "Friday", "Saturday", "Sunday"}
	valid := false
	for _, d := range validDays {
		if day == d {
			valid = true
			break
		}
	}
	if !valid {
		http.Error(w, "Invalid day of week", http.StatusBadRequest)
		return
	}

	// Get day title
	var title string
	err := h.DB.QueryRow("SELECT title FROM day_titles WHERE day_of_week = ?", day).Scan(&title)
	if err != nil && err != sql.ErrNoRows {
		http.Error(w, fmt.Sprintf("Database error: %v", err), http.StatusInternalServerError)
		return
	}

	// Query routines with exercise details and progression info
	query := `
		SELECT
			r.id,
			r.exercise_id,
			r.order_index,
			r.target_sets,
			r.target_reps,
			r.target_weight,
			r.notes,
			e.name,
			e.type,
			e.category,
			p.current_weight,
			p.consecutive_successes,
			p.ready_to_progress,
			p.last_done
		FROM routines r
		JOIN exercises e ON r.exercise_id = e.id
		LEFT JOIN exercise_progression p ON e.id = p.exercise_id
		WHERE r.day_of_week = ?
		ORDER BY r.order_index
	`

	rows, err := h.DB.Query(query, day)
	if err != nil {
		http.Error(w, fmt.Sprintf("Database error: %v", err), http.StatusInternalServerError)
		return
	}
	defer rows.Close()

	exercises := []map[string]interface{}{}
	for rows.Next() {
		var routineID, exerciseID, orderIndex int
		var targetSets, targetReps, consecutiveSuccesses *int
		var targetWeight, currentWeight *float64
		var notes, lastDone *string
		var name, exerciseType string
		var category *string
		var readyToProgress *bool

		err := rows.Scan(
			&routineID, &exerciseID, &orderIndex,
			&targetSets, &targetReps, &targetWeight, &notes,
			&name, &exerciseType, &category,
			&currentWeight, &consecutiveSuccesses, &readyToProgress, &lastDone,
		)
		if err != nil {
			http.Error(w, fmt.Sprintf("Scan error: %v", err), http.StatusInternalServerError)
			return
		}

		exercise := map[string]interface{}{
			"routine_id":   routineID,
			"exercise_id":  exerciseID,
			"order_index":  orderIndex,
			"name":         name,
			"type":         exerciseType,
		}

		if category != nil {
			exercise["category"] = *category
		}
		if targetSets != nil {
			exercise["target_sets"] = *targetSets
		}
		if targetReps != nil {
			exercise["target_reps"] = *targetReps
		}
		if targetWeight != nil {
			exercise["target_weight"] = *targetWeight
		}
		if notes != nil {
			exercise["notes"] = *notes
		}
		if currentWeight != nil {
			exercise["current_weight"] = *currentWeight
		}
		if consecutiveSuccesses != nil {
			exercise["consecutive_successes"] = *consecutiveSuccesses
		}
		if readyToProgress != nil {
			exercise["ready_to_progress"] = *readyToProgress
		}
		if lastDone != nil {
			exercise["last_done"] = *lastDone
		}

		exercises = append(exercises, exercise)
	}

	response := map[string]interface{}{
		"day":       day,
		"title":     title,
		"exercises": exercises,
	}

	w.Header().Set("Content-Type", "application/json")
	json.NewEncoder(w).Encode(response)
}

// createRoutine adds an exercise to a day
func (h *RoutinesHandler) createRoutine(w http.ResponseWriter, r *http.Request) {
	var req struct {
		ExerciseID   int      `json:"exercise_id"`
		DayOfWeek    string   `json:"day_of_week"`
		OrderIndex   int      `json:"order_index"`
		TargetSets   *int     `json:"target_sets"`
		TargetReps   *int     `json:"target_reps"`
		TargetWeight *float64 `json:"target_weight"`
		Notes        *string  `json:"notes"`
	}

	if err := json.NewDecoder(r.Body).Decode(&req); err != nil {
		http.Error(w, "Invalid request body", http.StatusBadRequest)
		return
	}

	// Validate required fields
	if req.ExerciseID == 0 || req.DayOfWeek == "" {
		http.Error(w, "exercise_id and day_of_week are required", http.StatusBadRequest)
		return
	}

	// Auto-calculate order_index to avoid conflicts
	// Get the max order_index for this day and add 1
	var maxOrder int
	err := h.DB.QueryRow("SELECT COALESCE(MAX(order_index), -1) FROM routines WHERE day_of_week = ?", req.DayOfWeek).Scan(&maxOrder)
	if err != nil {
		http.Error(w, fmt.Sprintf("Failed to get max order_index: %v", err), http.StatusInternalServerError)
		return
	}
	orderIndex := maxOrder + 1

	id, err := h.DB.CreateRoutine(
		req.ExerciseID,
		req.DayOfWeek,
		orderIndex,
		req.TargetSets,
		req.TargetReps,
		req.TargetWeight,
		req.Notes,
	)
	if err != nil {
		http.Error(w, fmt.Sprintf("Failed to create routine: %v", err), http.StatusInternalServerError)
		return
	}

	response := map[string]interface{}{
		"id":      id,
		"message": "Routine created successfully",
	}

	w.Header().Set("Content-Type", "application/json")
	w.WriteHeader(http.StatusCreated)
	json.NewEncoder(w).Encode(response)
}

// updateRoutine updates a routine entry
func (h *RoutinesHandler) updateRoutine(w http.ResponseWriter, r *http.Request, idStr string) {
	id, err := strconv.Atoi(idStr)
	if err != nil {
		http.Error(w, "Invalid routine ID", http.StatusBadRequest)
		return
	}

	var req struct {
		OrderIndex   *int     `json:"order_index"`
		TargetSets   *int     `json:"target_sets"`
		TargetReps   *int     `json:"target_reps"`
		TargetWeight *float64 `json:"target_weight"`
		Notes        *string  `json:"notes"`
		LastDone     *string  `json:"last_done"`
	}

	if err := json.NewDecoder(r.Body).Decode(&req); err != nil {
		http.Error(w, "Invalid request body", http.StatusBadRequest)
		return
	}

	// Handle last_done separately - it updates exercise_progression, not routines
	if req.LastDone != nil {
		// First, get the exercise_id for this routine
		var exerciseID int
		err := h.DB.QueryRow("SELECT exercise_id FROM routines WHERE id = ?", id).Scan(&exerciseID)
		if err != nil {
			http.Error(w, "Routine not found", http.StatusNotFound)
			return
		}

		// Update exercise_progression.last_done
		_, err = h.DB.Exec(`
			INSERT INTO exercise_progression (exercise_id, last_done)
			VALUES (?, ?)
			ON CONFLICT(exercise_id) DO UPDATE SET last_done = ?
		`, exerciseID, *req.LastDone, *req.LastDone)
		if err != nil {
			http.Error(w, fmt.Sprintf("Failed to update last_done: %v", err), http.StatusInternalServerError)
			return
		}
	}

	// Build update query dynamically for routine fields
	updates := []string{}
	args := []interface{}{}

	if req.OrderIndex != nil {
		updates = append(updates, "order_index = ?")
		args = append(args, *req.OrderIndex)
	}
	if req.TargetSets != nil {
		updates = append(updates, "target_sets = ?")
		args = append(args, *req.TargetSets)
	}
	if req.TargetReps != nil {
		updates = append(updates, "target_reps = ?")
		args = append(args, *req.TargetReps)
	}
	if req.TargetWeight != nil {
		updates = append(updates, "target_weight = ?")
		args = append(args, *req.TargetWeight)
	}
	if req.Notes != nil {
		updates = append(updates, "notes = ?")
		args = append(args, *req.Notes)
	}

	// Only update routines table if there are fields to update
	if len(updates) > 0 {
		args = append(args, id)
		query := "UPDATE routines SET " + strings.Join(updates, ", ") + " WHERE id = ?"

		result, err := h.DB.Exec(query, args...)
		if err != nil {
			http.Error(w, fmt.Sprintf("Failed to update routine: %v", err), http.StatusInternalServerError)
			return
		}

		rowsAffected, _ := result.RowsAffected()
		if rowsAffected == 0 {
			http.Error(w, "Routine not found", http.StatusNotFound)
			return
		}
	}

	response := map[string]interface{}{
		"message": "Routine updated successfully",
	}

	w.Header().Set("Content-Type", "application/json")
	json.NewEncoder(w).Encode(response)
}

// deleteRoutine removes an exercise from a day
func (h *RoutinesHandler) deleteRoutine(w http.ResponseWriter, r *http.Request, idStr string) {
	id, err := strconv.Atoi(idStr)
	if err != nil {
		http.Error(w, "Invalid routine ID", http.StatusBadRequest)
		return
	}

	result, err := h.DB.Exec("DELETE FROM routines WHERE id = ?", id)
	if err != nil {
		http.Error(w, fmt.Sprintf("Failed to delete routine: %v", err), http.StatusInternalServerError)
		return
	}

	rowsAffected, _ := result.RowsAffected()
	if rowsAffected == 0 {
		http.Error(w, "Routine not found", http.StatusNotFound)
		return
	}

	response := map[string]interface{}{
		"message": "Routine deleted successfully",
	}

	w.Header().Set("Content-Type", "application/json")
	json.NewEncoder(w).Encode(response)
}

// reorderRoutines updates the order of exercises for a day
func (h *RoutinesHandler) reorderRoutines(w http.ResponseWriter, r *http.Request) {
	var req struct {
		DayOfWeek  string `json:"day_of_week"`
		RoutineIDs []int  `json:"routine_ids"`
	}

	if err := json.NewDecoder(r.Body).Decode(&req); err != nil {
		http.Error(w, "Invalid request body", http.StatusBadRequest)
		return
	}

	if req.DayOfWeek == "" || len(req.RoutineIDs) == 0 {
		http.Error(w, "day_of_week and routine_ids are required", http.StatusBadRequest)
		return
	}

	// Begin transaction
	tx, err := h.DB.Begin()
	if err != nil {
		http.Error(w, "Failed to begin transaction", http.StatusInternalServerError)
		return
	}
	defer tx.Rollback()

	// Update order_index for each routine
	for i, routineID := range req.RoutineIDs {
		_, err := tx.Exec("UPDATE routines SET order_index = ? WHERE id = ? AND day_of_week = ?",
			i, routineID, req.DayOfWeek)
		if err != nil {
			http.Error(w, fmt.Sprintf("Failed to reorder routines: %v", err), http.StatusInternalServerError)
			return
		}
	}

	// Commit transaction
	if err := tx.Commit(); err != nil {
		http.Error(w, "Failed to commit transaction", http.StatusInternalServerError)
		return
	}

	response := map[string]interface{}{
		"message": "Routines reordered successfully",
	}

	w.Header().Set("Content-Type", "application/json")
	json.NewEncoder(w).Encode(response)
}
