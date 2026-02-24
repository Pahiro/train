package handlers

import (
	"bytes"
	"encoding/json"
	"net/http"
	"net/http/httptest"
	"testing"

	"train/db"
)

func newExercisesHandler(t *testing.T) *ExercisesHandler {
	t.Helper()
	database, err := db.OpenForTesting()
	if err != nil {
		t.Fatalf("OpenForTesting: %v", err)
	}
	t.Cleanup(func() { database.Close() })
	return &ExercisesHandler{DB: database}
}

func createExerciseRequest(t *testing.T, h *ExercisesHandler, name, exType string) (int, map[string]interface{}) {
	t.Helper()
	body, _ := json.Marshal(map[string]interface{}{
		"name": name,
		"type": exType,
	})
	req := httptest.NewRequest(http.MethodPost, "/api/exercises", bytes.NewReader(body))
	req.Header.Set("Content-Type", "application/json")
	w := httptest.NewRecorder()
	h.ServeHTTP(w, req)

	var resp map[string]interface{}
	json.NewDecoder(w.Body).Decode(&resp)
	return w.Code, resp
}

// --- Type validation tests ---

func TestExerciseType_ValidTypes(t *testing.T) {
	validTypes := []string{"weight", "bodyweight", "cardio", "assisted"}
	for _, exType := range validTypes {
		t.Run(exType, func(t *testing.T) {
			h := newExercisesHandler(t)
			code, resp := createExerciseRequest(t, h, "Test "+exType, exType)
			if code != http.StatusCreated {
				t.Errorf("type %q should be accepted, got %d: %v", exType, code, resp)
			}
		})
	}
}

func TestExerciseType_InvalidTypeRejected(t *testing.T) {
	h := newExercisesHandler(t)
	code, _ := createExerciseRequest(t, h, "Bad Exercise", "machine")
	if code != http.StatusBadRequest {
		t.Errorf("invalid type 'machine' should be rejected with 400, got %d", code)
	}
}

func TestExerciseType_EmptyTypeRejected(t *testing.T) {
	h := newExercisesHandler(t)
	code, _ := createExerciseRequest(t, h, "No Type Exercise", "")
	if code != http.StatusBadRequest {
		t.Errorf("empty type should be rejected with 400, got %d", code)
	}
}

func TestExercise_DuplicateNameRejected(t *testing.T) {
	h := newExercisesHandler(t)
	createExerciseRequest(t, h, "Leg Press", "weight")
	code, _ := createExerciseRequest(t, h, "Leg Press", "weight")
	if code != http.StatusConflict {
		t.Errorf("duplicate exercise name should return 409, got %d", code)
	}
}
