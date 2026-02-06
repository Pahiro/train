package handlers

import (
	"encoding/json"
	"fmt"
	"net/http"
	"strings"

	"train/db"
)

// DaysHandler handles day title operations
type DaysHandler struct {
	DB *db.DB
}

// ServeHTTP handles day-related requests
func (h *DaysHandler) ServeHTTP(w http.ResponseWriter, r *http.Request) {
	path := strings.TrimPrefix(r.URL.Path, "/api/days")
	path = strings.TrimPrefix(path, "/")

	if path == "" {
		http.Error(w, "Day of week is required", http.StatusBadRequest)
		return
	}

	switch r.Method {
	case http.MethodGet:
		h.getDayTitle(w, r, path)
	case http.MethodPut:
		h.updateDayTitle(w, r, path)
	default:
		http.Error(w, "Method not allowed", http.StatusMethodNotAllowed)
	}
}

// getDayTitle returns the title for a specific day
func (h *DaysHandler) getDayTitle(w http.ResponseWriter, r *http.Request, day string) {
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

	var title string
	err := h.DB.QueryRow("SELECT title FROM day_titles WHERE day_of_week = ?", day).Scan(&title)
	if err != nil {
		http.Error(w, fmt.Sprintf("Database error: %v", err), http.StatusInternalServerError)
		return
	}

	response := map[string]interface{}{
		"day_of_week": day,
		"title":       title,
	}

	w.Header().Set("Content-Type", "application/json")
	json.NewEncoder(w).Encode(response)
}

// updateDayTitle updates the title for a specific day
func (h *DaysHandler) updateDayTitle(w http.ResponseWriter, r *http.Request, day string) {
	var req struct {
		Title string `json:"title"`
	}

	if err := json.NewDecoder(r.Body).Decode(&req); err != nil {
		http.Error(w, "Invalid request body", http.StatusBadRequest)
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

	// Update day title
	err := h.DB.CreateDayTitle(day, req.Title)
	if err != nil {
		http.Error(w, fmt.Sprintf("Failed to update day title: %v", err), http.StatusInternalServerError)
		return
	}

	response := map[string]interface{}{
		"message": "Day title updated successfully",
	}

	w.Header().Set("Content-Type", "application/json")
	json.NewEncoder(w).Encode(response)
}
