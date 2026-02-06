package handlers

import (
	"encoding/json"
	"fmt"
	"net/http"
	"strconv"
	"strings"

	"train/db"
)

// ExercisesHandler handles CRUD operations for exercises
type ExercisesHandler struct {
	DB *db.DB
}

// ServeHTTP handles exercise-related requests
func (h *ExercisesHandler) ServeHTTP(w http.ResponseWriter, r *http.Request) {
	// Parse path to extract ID if present
	path := strings.TrimPrefix(r.URL.Path, "/api/exercises")
	path = strings.TrimPrefix(path, "/")

	switch r.Method {
	case http.MethodGet:
		if path == "" {
			h.listExercises(w, r)
		} else {
			h.getExercise(w, r, path)
		}
	case http.MethodPost:
		h.createExercise(w, r)
	case http.MethodPut:
		h.updateExercise(w, r, path)
	case http.MethodDelete:
		h.deleteExercise(w, r, path)
	default:
		http.Error(w, "Method not allowed", http.StatusMethodNotAllowed)
	}
}

// listExercises returns all exercises with optional filtering
func (h *ExercisesHandler) listExercises(w http.ResponseWriter, r *http.Request) {
	search := r.URL.Query().Get("search")
	exerciseType := r.URL.Query().Get("type")
	category := r.URL.Query().Get("category")

	// Build query
	query := "SELECT id, name, type, category, created_at FROM exercises WHERE 1=1"
	args := []interface{}{}

	if search != "" {
		query += " AND name LIKE ?"
		args = append(args, "%"+search+"%")
	}
	if exerciseType != "" {
		query += " AND type = ?"
		args = append(args, exerciseType)
	}
	if category != "" {
		query += " AND category = ?"
		args = append(args, category)
	}

	query += " ORDER BY name LIMIT 50"

	rows, err := h.DB.Query(query, args...)
	if err != nil {
		http.Error(w, fmt.Sprintf("Database error: %v", err), http.StatusInternalServerError)
		return
	}
	defer rows.Close()

	exercises := []map[string]interface{}{}
	for rows.Next() {
		var id int
		var name, exerciseType, createdAt string
		var category *string

		if err := rows.Scan(&id, &name, &exerciseType, &category, &createdAt); err != nil {
			http.Error(w, fmt.Sprintf("Scan error: %v", err), http.StatusInternalServerError)
			return
		}

		exercise := map[string]interface{}{
			"id":         id,
			"name":       name,
			"type":       exerciseType,
			"created_at": createdAt,
		}
		if category != nil {
			exercise["category"] = *category
		}

		exercises = append(exercises, exercise)
	}

	response := map[string]interface{}{
		"exercises": exercises,
	}

	w.Header().Set("Content-Type", "application/json")
	json.NewEncoder(w).Encode(response)
}

// getExercise returns a single exercise by ID
func (h *ExercisesHandler) getExercise(w http.ResponseWriter, r *http.Request, idStr string) {
	id, err := strconv.Atoi(idStr)
	if err != nil {
		http.Error(w, "Invalid exercise ID", http.StatusBadRequest)
		return
	}

	exercise, err := h.DB.GetExerciseByID(id)
	if err != nil {
		http.Error(w, fmt.Sprintf("Database error: %v", err), http.StatusInternalServerError)
		return
	}
	if exercise == nil {
		http.Error(w, "Exercise not found", http.StatusNotFound)
		return
	}

	w.Header().Set("Content-Type", "application/json")
	json.NewEncoder(w).Encode(exercise)
}

// createExercise creates a new exercise
func (h *ExercisesHandler) createExercise(w http.ResponseWriter, r *http.Request) {
	var req struct {
		Name     string  `json:"name"`
		Type     string  `json:"type"`
		Category *string `json:"category"`
	}

	if err := json.NewDecoder(r.Body).Decode(&req); err != nil {
		http.Error(w, "Invalid request body", http.StatusBadRequest)
		return
	}

	// Validate required fields
	if req.Name == "" || req.Type == "" {
		http.Error(w, "Name and type are required", http.StatusBadRequest)
		return
	}

	// Validate type
	if req.Type != "cardio" && req.Type != "weight" && req.Type != "bodyweight" {
		http.Error(w, "Invalid type. Must be cardio, weight, or bodyweight", http.StatusBadRequest)
		return
	}

	// Validate category if provided
	validCategories := []string{"Legs-Push", "Legs-Pull", "Arms-Push", "Arms-Pull", "Core-Push", "Core-Pull"}
	if req.Category != nil && *req.Category != "" {
		valid := false
		for _, cat := range validCategories {
			if *req.Category == cat {
				valid = true
				break
			}
		}
		if !valid {
			http.Error(w, "Invalid category", http.StatusBadRequest)
			return
		}
	}

	category := ""
	if req.Category != nil {
		category = *req.Category
	}

	id, err := h.DB.CreateExercise(req.Name, req.Type, category)
	if err != nil {
		if strings.Contains(err.Error(), "UNIQUE constraint failed") {
			http.Error(w, "Exercise with this name already exists", http.StatusConflict)
			return
		}
		http.Error(w, fmt.Sprintf("Failed to create exercise: %v", err), http.StatusInternalServerError)
		return
	}

	response := map[string]interface{}{
		"id":      id,
		"message": "Exercise created successfully",
	}

	w.Header().Set("Content-Type", "application/json")
	w.WriteHeader(http.StatusCreated)
	json.NewEncoder(w).Encode(response)
}

// updateExercise updates an existing exercise
func (h *ExercisesHandler) updateExercise(w http.ResponseWriter, r *http.Request, idStr string) {
	id, err := strconv.Atoi(idStr)
	if err != nil {
		http.Error(w, "Invalid exercise ID", http.StatusBadRequest)
		return
	}

	var req struct {
		Name     *string `json:"name"`
		Type     *string `json:"type"`
		Category *string `json:"category"`
	}

	if err := json.NewDecoder(r.Body).Decode(&req); err != nil {
		http.Error(w, "Invalid request body", http.StatusBadRequest)
		return
	}

	// Build update query dynamically
	updates := []string{}
	args := []interface{}{}

	if req.Name != nil {
		updates = append(updates, "name = ?")
		args = append(args, *req.Name)
	}
	if req.Type != nil {
		updates = append(updates, "type = ?")
		args = append(args, *req.Type)
	}
	if req.Category != nil {
		updates = append(updates, "category = ?")
		args = append(args, *req.Category)
	}

	if len(updates) == 0 {
		http.Error(w, "No fields to update", http.StatusBadRequest)
		return
	}

	updates = append(updates, "updated_at = CURRENT_TIMESTAMP")
	args = append(args, id)

	query := "UPDATE exercises SET " + strings.Join(updates, ", ") + " WHERE id = ?"
	result, err := h.DB.Exec(query, args...)
	if err != nil {
		http.Error(w, fmt.Sprintf("Failed to update exercise: %v", err), http.StatusInternalServerError)
		return
	}

	rowsAffected, _ := result.RowsAffected()
	if rowsAffected == 0 {
		http.Error(w, "Exercise not found", http.StatusNotFound)
		return
	}

	response := map[string]interface{}{
		"message": "Exercise updated successfully",
	}

	w.Header().Set("Content-Type", "application/json")
	json.NewEncoder(w).Encode(response)
}

// deleteExercise deletes an exercise
func (h *ExercisesHandler) deleteExercise(w http.ResponseWriter, r *http.Request, idStr string) {
	id, err := strconv.Atoi(idStr)
	if err != nil {
		http.Error(w, "Invalid exercise ID", http.StatusBadRequest)
		return
	}

	result, err := h.DB.Exec("DELETE FROM exercises WHERE id = ?", id)
	if err != nil {
		http.Error(w, fmt.Sprintf("Failed to delete exercise: %v", err), http.StatusInternalServerError)
		return
	}

	rowsAffected, _ := result.RowsAffected()
	if rowsAffected == 0 {
		http.Error(w, "Exercise not found", http.StatusNotFound)
		return
	}

	response := map[string]interface{}{
		"message": "Exercise deleted successfully",
	}

	w.Header().Set("Content-Type", "application/json")
	json.NewEncoder(w).Encode(response)
}
