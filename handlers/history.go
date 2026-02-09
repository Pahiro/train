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

// HistoryHandler handles workout history operations
type HistoryHandler struct {
	DB *db.DB
}

// ServeHTTP handles history-related requests
func (h *HistoryHandler) ServeHTTP(w http.ResponseWriter, r *http.Request) {
	path := strings.TrimPrefix(r.URL.Path, "/api/history")
	path = strings.TrimPrefix(path, "/")

	// Split path to handle /api/history/:exercise_id/pr
	parts := strings.Split(path, "/")

	if len(parts) >= 2 && parts[1] == "pr" {
		// GET /api/history/:exercise_id/pr
		h.getPR(w, r, parts[0])
		return
	}

	switch r.Method {
	case http.MethodGet:
		// GET /api/history/:exercise_id
		h.getHistory(w, r, parts[0])
	case http.MethodPost:
		h.createHistory(w, r)
	case http.MethodPut:
		h.updateHistory(w, r, parts[0])
	case http.MethodDelete:
		h.deleteHistory(w, r, parts[0])
	default:
		http.Error(w, "Method not allowed", http.StatusMethodNotAllowed)
	}
}

// getHistory returns all workout sessions for an exercise
func (h *HistoryHandler) getHistory(w http.ResponseWriter, r *http.Request, exerciseIDStr string) {
	exerciseID, err := strconv.Atoi(exerciseIDStr)
	if err != nil {
		http.Error(w, "Invalid exercise ID", http.StatusBadRequest)
		return
	}

	// Get exercise name
	exercise, err := h.DB.GetExerciseByID(exerciseID)
	if err != nil {
		http.Error(w, fmt.Sprintf("Database error: %v", err), http.StatusInternalServerError)
		return
	}
	if exercise == nil {
		http.Error(w, "Exercise not found", http.StatusNotFound)
		return
	}

	// Get history
	query := `
		SELECT id, session_date, weight, sets_completed, completed, volume, is_pr, notes
		FROM history
		WHERE exercise_id = ?
		ORDER BY session_date DESC
		LIMIT 200
	`

	rows, err := h.DB.Query(query, exerciseID)
	if err != nil {
		http.Error(w, fmt.Sprintf("Database error: %v", err), http.StatusInternalServerError)
		return
	}
	defer rows.Close()

	history := []map[string]interface{}{}
	for rows.Next() {
		var id int
		var sessionDate string
		var weight, volume *float64
		var setsCompletedJSON string
		var completed, isPR bool
		var notes *string

		err := rows.Scan(&id, &sessionDate, &weight, &setsCompletedJSON, &completed, &volume, &isPR, &notes)
		if err != nil {
			http.Error(w, fmt.Sprintf("Scan error: %v", err), http.StatusInternalServerError)
			return
		}

		// Parse sets_completed JSON
		var setsCompleted []int
		if err := json.Unmarshal([]byte(setsCompletedJSON), &setsCompleted); err != nil {
			http.Error(w, fmt.Sprintf("JSON parse error: %v", err), http.StatusInternalServerError)
			return
		}

		entry := map[string]interface{}{
			"id":             id,
			"session_date":   sessionDate,
			"sets_completed": setsCompleted,
			"completed":      completed,
			"is_pr":          isPR,
		}

		if weight != nil {
			entry["weight"] = *weight
		}
		if volume != nil {
			entry["volume"] = *volume
		}
		if notes != nil {
			entry["notes"] = *notes
		}

		history = append(history, entry)
	}

	response := map[string]interface{}{
		"exercise_id":   exerciseID,
		"exercise_name": exercise.Name,
		"history":       history,
	}

	w.Header().Set("Content-Type", "application/json")
	json.NewEncoder(w).Encode(response)
}

// getPR returns the personal record for an exercise
func (h *HistoryHandler) getPR(w http.ResponseWriter, r *http.Request, exerciseIDStr string) {
	exerciseID, err := strconv.Atoi(exerciseIDStr)
	if err != nil {
		http.Error(w, "Invalid exercise ID", http.StatusBadRequest)
		return
	}

	// Query for PR entry
	var sessionDate string
	var weight, volume float64

	err = h.DB.QueryRow(`
		SELECT session_date, weight, volume
		FROM history
		WHERE exercise_id = ? AND is_pr = 1
		ORDER BY session_date DESC
		LIMIT 1
	`, exerciseID).Scan(&sessionDate, &weight, &volume)

	if err == sql.ErrNoRows {
		// No PR found
		response := map[string]interface{}{
			"pr": nil,
		}
		w.Header().Set("Content-Type", "application/json")
		json.NewEncoder(w).Encode(response)
		return
	}

	if err != nil {
		http.Error(w, fmt.Sprintf("Database error: %v", err), http.StatusInternalServerError)
		return
	}

	response := map[string]interface{}{
		"pr": map[string]interface{}{
			"weight": weight,
			"date":   sessionDate,
			"volume": volume,
		},
	}

	w.Header().Set("Content-Type", "application/json")
	json.NewEncoder(w).Encode(response)
}

// createHistory records a new workout session
func (h *HistoryHandler) createHistory(w http.ResponseWriter, r *http.Request) {
	var req struct {
		ExerciseID    int      `json:"exercise_id"`
		SessionDate   string   `json:"session_date"`
		Weight        *float64 `json:"weight"`
		SetsCompleted []int    `json:"sets_completed"`
		Completed     bool     `json:"completed"`
		Volume        *float64 `json:"volume"`
		Notes         *string  `json:"notes"`
	}

	if err := json.NewDecoder(r.Body).Decode(&req); err != nil {
		http.Error(w, "Invalid request body", http.StatusBadRequest)
		return
	}

	// Validate required fields
	if req.ExerciseID == 0 || req.SessionDate == "" || len(req.SetsCompleted) == 0 {
		http.Error(w, "exercise_id, session_date, and sets_completed are required", http.StatusBadRequest)
		return
	}

	// Check if this is a new PR
	isPR := false
	if req.Weight != nil && *req.Weight > 0 {
		var maxWeight sql.NullFloat64
		err := h.DB.QueryRow(`
			SELECT MAX(weight) FROM history WHERE exercise_id = ?
		`, req.ExerciseID).Scan(&maxWeight)

		if err == nil && (!maxWeight.Valid || *req.Weight > maxWeight.Float64) {
			isPR = true

			// Clear old PR flags for this exercise
			_, err = h.DB.Exec("UPDATE history SET is_pr = 0 WHERE exercise_id = ?", req.ExerciseID)
			if err != nil {
				http.Error(w, fmt.Sprintf("Failed to update PR flags: %v", err), http.StatusInternalServerError)
				return
			}
		}
	}

	// Insert history entry
	id, err := h.DB.CreateHistory(
		req.ExerciseID,
		req.SessionDate,
		req.Weight,
		req.SetsCompleted,
		req.Completed,
		req.Volume,
		isPR,
		req.Notes,
	)
	if err != nil {
		http.Error(w, fmt.Sprintf("Failed to create history: %v", err), http.StatusInternalServerError)
		return
	}

	response := map[string]interface{}{
		"id":      id,
		"is_pr":   isPR,
		"message": "History entry created successfully",
	}

	w.Header().Set("Content-Type", "application/json")
	w.WriteHeader(http.StatusCreated)
	json.NewEncoder(w).Encode(response)
}

// updateHistory updates a history entry
func (h *HistoryHandler) updateHistory(w http.ResponseWriter, r *http.Request, idStr string) {
	id, err := strconv.Atoi(idStr)
	if err != nil {
		http.Error(w, "Invalid history ID", http.StatusBadRequest)
		return
	}

	var req struct {
		Weight        *float64 `json:"weight"`
		SetsCompleted *[]int   `json:"sets_completed"`
		Completed     *bool    `json:"completed"`
		Volume        *float64 `json:"volume"`
		Notes         *string  `json:"notes"`
	}

	if err := json.NewDecoder(r.Body).Decode(&req); err != nil {
		http.Error(w, "Invalid request body", http.StatusBadRequest)
		return
	}

	// Build update query
	updates := []string{}
	args := []interface{}{}

	if req.Weight != nil {
		updates = append(updates, "weight = ?")
		args = append(args, *req.Weight)
	}
	if req.SetsCompleted != nil {
		setsJSON, _ := json.Marshal(*req.SetsCompleted)
		updates = append(updates, "sets_completed = ?")
		args = append(args, string(setsJSON))
	}
	if req.Completed != nil {
		updates = append(updates, "completed = ?")
		args = append(args, *req.Completed)
	}
	if req.Volume != nil {
		updates = append(updates, "volume = ?")
		args = append(args, *req.Volume)
	}
	if req.Notes != nil {
		updates = append(updates, "notes = ?")
		args = append(args, *req.Notes)
	}

	if len(updates) == 0 {
		http.Error(w, "No fields to update", http.StatusBadRequest)
		return
	}

	args = append(args, id)
	query := "UPDATE history SET " + strings.Join(updates, ", ") + " WHERE id = ?"

	result, err := h.DB.Exec(query, args...)
	if err != nil {
		http.Error(w, fmt.Sprintf("Failed to update history: %v", err), http.StatusInternalServerError)
		return
	}

	rowsAffected, _ := result.RowsAffected()
	if rowsAffected == 0 {
		http.Error(w, "History entry not found", http.StatusNotFound)
		return
	}

	response := map[string]interface{}{
		"message": "History entry updated successfully",
	}

	w.Header().Set("Content-Type", "application/json")
	json.NewEncoder(w).Encode(response)
}

// deleteHistory deletes a history entry
func (h *HistoryHandler) deleteHistory(w http.ResponseWriter, r *http.Request, idStr string) {
	id, err := strconv.Atoi(idStr)
	if err != nil {
		http.Error(w, "Invalid history ID", http.StatusBadRequest)
		return
	}

	result, err := h.DB.Exec("DELETE FROM history WHERE id = ?", id)
	if err != nil {
		http.Error(w, fmt.Sprintf("Failed to delete history: %v", err), http.StatusInternalServerError)
		return
	}

	rowsAffected, _ := result.RowsAffected()
	if rowsAffected == 0 {
		http.Error(w, "History entry not found", http.StatusNotFound)
		return
	}

	response := map[string]interface{}{
		"message": "History entry deleted successfully",
	}

	w.Header().Set("Content-Type", "application/json")
	json.NewEncoder(w).Encode(response)
}
