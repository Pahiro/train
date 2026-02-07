package handlers

import (
	"encoding/json"
	"fmt"
	"net/http"
	"strconv"
	"strings"

	"train/db"
)

// MetricsHandler handles CRUD operations for metrics
type MetricsHandler struct {
	DB *db.DB
}

// ServeHTTP handles metric-related requests
func (h *MetricsHandler) ServeHTTP(w http.ResponseWriter, r *http.Request) {
	// Parse path to extract ID and route
	path := strings.TrimPrefix(r.URL.Path, "/api/metrics")
	path = strings.TrimPrefix(path, "/")

	// Route to appropriate handler
	if path == "" {
		// /api/metrics - metric types CRUD
		h.handleMetricTypes(w, r)
	} else if path == "dashboard" {
		// /api/metrics/dashboard - dashboard data
		h.getDashboardData(w, r)
	} else if path == "reorder" {
		// /api/metrics/reorder - reorder metric types
		h.reorderMetricTypes(w, r)
	} else if strings.HasSuffix(path, "/entries") {
		// /api/metrics/:id/entries - entries for a metric type
		idStr := strings.TrimSuffix(path, "/entries")
		h.getEntriesByType(w, r, idStr)
	} else {
		// /api/metrics/:id - single metric type CRUD
		h.handleSingleMetricType(w, r, path)
	}
}

// handleMetricTypes handles listing and creating metric types
func (h *MetricsHandler) handleMetricTypes(w http.ResponseWriter, r *http.Request) {
	switch r.Method {
	case http.MethodGet:
		h.listMetricTypes(w, r)
	case http.MethodPost:
		h.createMetricType(w, r)
	default:
		http.Error(w, "Method not allowed", http.StatusMethodNotAllowed)
	}
}

// handleSingleMetricType handles operations on a single metric type
func (h *MetricsHandler) handleSingleMetricType(w http.ResponseWriter, r *http.Request, idStr string) {
	switch r.Method {
	case http.MethodPut:
		h.updateMetricType(w, r, idStr)
	case http.MethodDelete:
		h.deleteMetricType(w, r, idStr)
	default:
		http.Error(w, "Method not allowed", http.StatusMethodNotAllowed)
	}
}

// listMetricTypes returns all metric types with their latest entry
func (h *MetricsHandler) listMetricTypes(w http.ResponseWriter, r *http.Request) {
	metricTypes, err := h.DB.GetMetricTypes()
	if err != nil {
		http.Error(w, fmt.Sprintf("Database error: %v", err), http.StatusInternalServerError)
		return
	}

	// Enrich with latest entry for each metric type
	result := []map[string]interface{}{}
	for _, mt := range metricTypes {
		metricData := map[string]interface{}{
			"id":          mt.ID,
			"name":        mt.Name,
			"unit":        mt.Unit,
			"color":       mt.Color,
			"order_index": mt.OrderIndex,
			"is_default":  mt.IsDefault,
		}

		// Get latest entry
		latestEntry, err := h.DB.GetLatestEntry(mt.ID)
		if err == nil && latestEntry != nil {
			metricData["latest_entry"] = map[string]interface{}{
				"date":  latestEntry.EntryDate,
				"value": latestEntry.Value,
			}
		}

		result = append(result, metricData)
	}

	response := map[string]interface{}{
		"metric_types": result,
	}

	w.Header().Set("Content-Type", "application/json")
	json.NewEncoder(w).Encode(response)
}

// createMetricType creates a new metric type
func (h *MetricsHandler) createMetricType(w http.ResponseWriter, r *http.Request) {
	var req struct {
		Name       string `json:"name"`
		Unit       string `json:"unit"`
		Color      string `json:"color"`
		OrderIndex int    `json:"order_index"`
	}

	if err := json.NewDecoder(r.Body).Decode(&req); err != nil {
		http.Error(w, "Invalid request body", http.StatusBadRequest)
		return
	}

	// Validate required fields
	if req.Name == "" || req.Unit == "" || req.Color == "" {
		http.Error(w, "Name, unit, and color are required", http.StatusBadRequest)
		return
	}

	id, err := h.DB.CreateMetricType(req.Name, req.Unit, req.Color, req.OrderIndex, false)
	if err != nil {
		if strings.Contains(err.Error(), "UNIQUE constraint failed") {
			http.Error(w, "Metric type with this name already exists", http.StatusConflict)
			return
		}
		http.Error(w, fmt.Sprintf("Failed to create metric type: %v", err), http.StatusInternalServerError)
		return
	}

	response := map[string]interface{}{
		"id":      id,
		"message": "Metric type created successfully",
	}

	w.Header().Set("Content-Type", "application/json")
	w.WriteHeader(http.StatusCreated)
	json.NewEncoder(w).Encode(response)
}

// updateMetricType updates an existing metric type
func (h *MetricsHandler) updateMetricType(w http.ResponseWriter, r *http.Request, idStr string) {
	id, err := strconv.Atoi(idStr)
	if err != nil {
		http.Error(w, "Invalid metric type ID", http.StatusBadRequest)
		return
	}

	var req struct {
		Name       *string `json:"name"`
		Unit       *string `json:"unit"`
		Color      *string `json:"color"`
		OrderIndex *int    `json:"order_index"`
	}

	if err := json.NewDecoder(r.Body).Decode(&req); err != nil {
		http.Error(w, "Invalid request body", http.StatusBadRequest)
		return
	}

	if err := h.DB.UpdateMetricType(id, req.Name, req.Unit, req.Color, req.OrderIndex); err != nil {
		http.Error(w, fmt.Sprintf("Failed to update metric type: %v", err), http.StatusInternalServerError)
		return
	}

	response := map[string]interface{}{
		"message": "Metric type updated successfully",
	}

	w.Header().Set("Content-Type", "application/json")
	json.NewEncoder(w).Encode(response)
}

// deleteMetricType deletes a metric type
func (h *MetricsHandler) deleteMetricType(w http.ResponseWriter, r *http.Request, idStr string) {
	id, err := strconv.Atoi(idStr)
	if err != nil {
		http.Error(w, "Invalid metric type ID", http.StatusBadRequest)
		return
	}

	if err := h.DB.DeleteMetricType(id); err != nil {
		http.Error(w, fmt.Sprintf("Failed to delete metric type: %v", err), http.StatusInternalServerError)
		return
	}

	response := map[string]interface{}{
		"message": "Metric type deleted successfully",
	}

	w.Header().Set("Content-Type", "application/json")
	json.NewEncoder(w).Encode(response)
}

// reorderMetricTypes updates the order_index for multiple metric types
func (h *MetricsHandler) reorderMetricTypes(w http.ResponseWriter, r *http.Request) {
	if r.Method != http.MethodPost {
		http.Error(w, "Method not allowed", http.StatusMethodNotAllowed)
		return
	}

	var req struct {
		MetricTypes []struct {
			ID         int `json:"id"`
			OrderIndex int `json:"order_index"`
		} `json:"metric_types"`
	}

	if err := json.NewDecoder(r.Body).Decode(&req); err != nil {
		http.Error(w, "Invalid request body", http.StatusBadRequest)
		return
	}

	// Update each metric type's order_index
	for _, mt := range req.MetricTypes {
		if err := h.DB.UpdateMetricType(mt.ID, nil, nil, nil, &mt.OrderIndex); err != nil {
			http.Error(w, fmt.Sprintf("Failed to update metric type order: %v", err), http.StatusInternalServerError)
			return
		}
	}

	response := map[string]interface{}{
		"message": "Metric types reordered successfully",
	}

	w.Header().Set("Content-Type", "application/json")
	json.NewEncoder(w).Encode(response)
}

// getEntriesByType returns entries for a specific metric type
func (h *MetricsHandler) getEntriesByType(w http.ResponseWriter, r *http.Request, idStr string) {
	if r.Method != http.MethodGet {
		http.Error(w, "Method not allowed", http.StatusMethodNotAllowed)
		return
	}

	id, err := strconv.Atoi(idStr)
	if err != nil {
		http.Error(w, "Invalid metric type ID", http.StatusBadRequest)
		return
	}

	// Parse limit parameter
	limitStr := r.URL.Query().Get("limit")
	limit := 30 // default
	if limitStr != "" {
		if parsedLimit, err := strconv.Atoi(limitStr); err == nil {
			limit = parsedLimit
		}
	}

	entries, err := h.DB.GetEntriesByType(id, limit)
	if err != nil {
		http.Error(w, fmt.Sprintf("Database error: %v", err), http.StatusInternalServerError)
		return
	}

	response := map[string]interface{}{
		"entries": entries,
	}

	w.Header().Set("Content-Type", "application/json")
	json.NewEncoder(w).Encode(response)
}

// getDashboardData returns entries for all metrics within the specified time range
func (h *MetricsHandler) getDashboardData(w http.ResponseWriter, r *http.Request) {
	if r.Method != http.MethodGet {
		http.Error(w, "Method not allowed", http.StatusMethodNotAllowed)
		return
	}

	// Parse days parameter
	daysStr := r.URL.Query().Get("days")
	days := 30 // default
	if daysStr != "" {
		if parsedDays, err := strconv.Atoi(daysStr); err == nil {
			days = parsedDays
		}
	}

	// Get all metric types
	metricTypes, err := h.DB.GetMetricTypes()
	if err != nil {
		http.Error(w, fmt.Sprintf("Database error: %v", err), http.StatusInternalServerError)
		return
	}

	// Get dashboard data
	entriesMap, err := h.DB.GetDashboardData(days)
	if err != nil {
		http.Error(w, fmt.Sprintf("Database error: %v", err), http.StatusInternalServerError)
		return
	}

	// Build response with metric types and their entries
	metrics := []map[string]interface{}{}
	for _, mt := range metricTypes {
		metricData := map[string]interface{}{
			"id":    mt.ID,
			"name":  mt.Name,
			"unit":  mt.Unit,
			"color": mt.Color,
		}

		// Add entries if they exist
		if entries, ok := entriesMap[mt.ID]; ok {
			// Convert to simple format for graph
			simpleEntries := []map[string]interface{}{}
			for _, e := range entries {
				simpleEntries = append(simpleEntries, map[string]interface{}{
					"date":  e.EntryDate,
					"value": e.Value,
				})
			}
			metricData["entries"] = simpleEntries
		} else {
			metricData["entries"] = []map[string]interface{}{}
		}

		metrics = append(metrics, metricData)
	}

	response := map[string]interface{}{
		"metrics": metrics,
	}

	w.Header().Set("Content-Type", "application/json")
	json.NewEncoder(w).Encode(response)
}

// Metric Entry Handlers

// MetricEntriesHandler handles CRUD operations for metric entries
type MetricEntriesHandler struct {
	DB *db.DB
}

// ServeHTTP handles metric entry requests
func (h *MetricEntriesHandler) ServeHTTP(w http.ResponseWriter, r *http.Request) {
	// Parse path to extract ID if present
	path := strings.TrimPrefix(r.URL.Path, "/api/metric-entries")
	path = strings.TrimPrefix(path, "/")

	switch r.Method {
	case http.MethodPost:
		if path == "" {
			h.createEntry(w, r)
		} else {
			http.Error(w, "Method not allowed", http.StatusMethodNotAllowed)
		}
	case http.MethodPut:
		if path != "" {
			h.updateEntry(w, r, path)
		} else {
			http.Error(w, "Entry ID required", http.StatusBadRequest)
		}
	case http.MethodDelete:
		if path != "" {
			h.deleteEntry(w, r, path)
		} else {
			http.Error(w, "Entry ID required", http.StatusBadRequest)
		}
	default:
		http.Error(w, "Method not allowed", http.StatusMethodNotAllowed)
	}
}

// createEntry creates a new metric entry
func (h *MetricEntriesHandler) createEntry(w http.ResponseWriter, r *http.Request) {
	var req struct {
		MetricTypeID int     `json:"metric_type_id"`
		EntryDate    string  `json:"entry_date"`
		Value        float64 `json:"value"`
		Notes        *string `json:"notes"`
	}

	if err := json.NewDecoder(r.Body).Decode(&req); err != nil {
		http.Error(w, "Invalid request body", http.StatusBadRequest)
		return
	}

	// Validate required fields
	if req.MetricTypeID == 0 || req.EntryDate == "" {
		http.Error(w, "Metric type ID and entry date are required", http.StatusBadRequest)
		return
	}

	id, err := h.DB.CreateMetricEntry(req.MetricTypeID, req.EntryDate, req.Value, req.Notes)
	if err != nil {
		http.Error(w, fmt.Sprintf("Failed to create metric entry: %v", err), http.StatusInternalServerError)
		return
	}

	response := map[string]interface{}{
		"id":      id,
		"message": "Metric entry created successfully",
	}

	w.Header().Set("Content-Type", "application/json")
	w.WriteHeader(http.StatusCreated)
	json.NewEncoder(w).Encode(response)
}

// updateEntry updates an existing metric entry
func (h *MetricEntriesHandler) updateEntry(w http.ResponseWriter, r *http.Request, idStr string) {
	id, err := strconv.Atoi(idStr)
	if err != nil {
		http.Error(w, "Invalid entry ID", http.StatusBadRequest)
		return
	}

	var req struct {
		Value     *float64 `json:"value"`
		EntryDate *string  `json:"entry_date"`
		Notes     *string  `json:"notes"`
	}

	if err := json.NewDecoder(r.Body).Decode(&req); err != nil {
		http.Error(w, "Invalid request body", http.StatusBadRequest)
		return
	}

	if err := h.DB.UpdateMetricEntry(id, req.Value, req.EntryDate, req.Notes); err != nil {
		http.Error(w, fmt.Sprintf("Failed to update metric entry: %v", err), http.StatusInternalServerError)
		return
	}

	response := map[string]interface{}{
		"message": "Metric entry updated successfully",
	}

	w.Header().Set("Content-Type", "application/json")
	json.NewEncoder(w).Encode(response)
}

// deleteEntry deletes a metric entry
func (h *MetricEntriesHandler) deleteEntry(w http.ResponseWriter, r *http.Request, idStr string) {
	id, err := strconv.Atoi(idStr)
	if err != nil {
		http.Error(w, "Invalid entry ID", http.StatusBadRequest)
		return
	}

	if err := h.DB.DeleteMetricEntry(id); err != nil {
		http.Error(w, fmt.Sprintf("Failed to delete metric entry: %v", err), http.StatusInternalServerError)
		return
	}

	response := map[string]interface{}{
		"message": "Metric entry deleted successfully",
	}

	w.Header().Set("Content-Type", "application/json")
	json.NewEncoder(w).Encode(response)
}
