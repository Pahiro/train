package handlers

import (
	"bytes"
	"encoding/json"
	"net/http"
	"net/http/httptest"
	"testing"

	"train/db"
)

// newTestHandler creates a HistoryHandler backed by a fresh in-memory DB and
// seeds it with one exercise of the given type, returning the handler and the
// exercise ID.
func newTestHandler(t *testing.T, exerciseType string) (*HistoryHandler, int) {
	t.Helper()
	database, err := db.OpenForTesting()
	if err != nil {
		t.Fatalf("OpenForTesting: %v", err)
	}
	t.Cleanup(func() { database.Close() })

	sets, reps := 3, 10
	weight := 50.0
	id, err := database.CreateExercise("Test Exercise", exerciseType, "", &sets, &reps, &weight)
	if err != nil {
		t.Fatalf("CreateExercise: %v", err)
	}
	return &HistoryHandler{DB: database}, int(id)
}

func postHistory(t *testing.T, h *HistoryHandler, exerciseID int, weight float64, date string) map[string]interface{} {
	t.Helper()
	body, _ := json.Marshal(map[string]interface{}{
		"exercise_id":    exerciseID,
		"session_date":   date,
		"weight":         weight,
		"sets_completed": []int{10, 10, 10},
		"completed":      true,
		"volume":         weight * 30,
	})
	req := httptest.NewRequest(http.MethodPost, "/api/history", bytes.NewReader(body))
	req.Header.Set("Content-Type", "application/json")
	w := httptest.NewRecorder()
	h.ServeHTTP(w, req)

	if w.Code != http.StatusCreated {
		t.Fatalf("expected 201, got %d: %s", w.Code, w.Body.String())
	}
	var resp map[string]interface{}
	json.NewDecoder(w.Body).Decode(&resp)
	return resp
}

// --- PR logic tests ---

func TestWeightExercise_HigherWeightIsPR(t *testing.T) {
	h, id := newTestHandler(t, "weight")

	// First session - always a PR (no prior history)
	r1 := postHistory(t, h, id, 50.0, "2026-01-01")
	if r1["is_pr"] != true {
		t.Errorf("first session should be a PR, got is_pr=%v", r1["is_pr"])
	}

	// Same weight - not a PR
	r2 := postHistory(t, h, id, 50.0, "2026-01-08")
	if r2["is_pr"] != false {
		t.Errorf("same weight should not be a PR, got is_pr=%v", r2["is_pr"])
	}

	// Higher weight - new PR
	r3 := postHistory(t, h, id, 60.0, "2026-01-15")
	if r3["is_pr"] != true {
		t.Errorf("higher weight should be a PR, got is_pr=%v", r3["is_pr"])
	}

	// Lower weight - not a PR
	r4 := postHistory(t, h, id, 55.0, "2026-01-22")
	if r4["is_pr"] != false {
		t.Errorf("lower weight should not be a PR for weight exercise, got is_pr=%v", r4["is_pr"])
	}
}

func TestAssistedExercise_LowerWeightIsPR(t *testing.T) {
	h, id := newTestHandler(t, "assisted")

	// First session - always a PR (no prior history)
	r1 := postHistory(t, h, id, 50.0, "2026-01-01")
	if r1["is_pr"] != true {
		t.Errorf("first assisted session should be a PR, got is_pr=%v", r1["is_pr"])
	}

	// Same weight - not a PR
	r2 := postHistory(t, h, id, 50.0, "2026-01-08")
	if r2["is_pr"] != false {
		t.Errorf("same weight should not be a PR, got is_pr=%v", r2["is_pr"])
	}

	// Higher weight (more assistance) - not a PR
	r3 := postHistory(t, h, id, 60.0, "2026-01-15")
	if r3["is_pr"] != false {
		t.Errorf("higher weight should NOT be a PR for assisted exercise, got is_pr=%v", r3["is_pr"])
	}

	// Lower weight (less assistance) - new PR
	r4 := postHistory(t, h, id, 40.0, "2026-01-22")
	if r4["is_pr"] != true {
		t.Errorf("lower weight should be a PR for assisted exercise, got is_pr=%v", r4["is_pr"])
	}
}

func TestWeightAndAssistedPR_AreIndependent(t *testing.T) {
	database, err := db.OpenForTesting()
	if err != nil {
		t.Fatalf("OpenForTesting: %v", err)
	}
	defer database.Close()

	sets, reps := 3, 10
	w := 50.0

	weightID, _ := database.CreateExercise("Bench Press", "weight", "", &sets, &reps, &w)
	assistedID, _ := database.CreateExercise("Assisted Pull-Up", "assisted", "", &sets, &reps, &w)

	h := &HistoryHandler{DB: database}

	postHistory(t, h, int(weightID), 50.0, "2026-01-01")
	postHistory(t, h, int(assistedID), 50.0, "2026-01-01")

	// Weight exercise: higher = PR
	rW := postHistory(t, h, int(weightID), 60.0, "2026-01-08")
	if rW["is_pr"] != true {
		t.Errorf("weight exercise: 60 > 50 should be PR")
	}

	// Assisted exercise: higher = NOT PR
	rA := postHistory(t, h, int(assistedID), 60.0, "2026-01-08")
	if rA["is_pr"] != false {
		t.Errorf("assisted exercise: 60 > 50 should NOT be PR")
	}
}
