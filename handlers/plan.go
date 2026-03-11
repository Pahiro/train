package handlers

import (
	"database/sql"
	"encoding/json"
	"fmt"
	"net/http"
	"regexp"
	"strconv"
	"strings"

	"train/db"
)

// PlanHandler handles bulk plan import/export
type PlanHandler struct {
	DB *db.DB
}

var weekDays = []string{"Monday", "Tuesday", "Wednesday", "Thursday", "Friday", "Saturday", "Sunday"}

func (h *PlanHandler) ServeHTTP(w http.ResponseWriter, r *http.Request) {
	switch r.Method {
	case http.MethodGet:
		h.exportPlan(w, r)
	case http.MethodPost:
		h.importPlan(w, r)
	default:
		http.Error(w, "Method not allowed", http.StatusMethodNotAllowed)
	}
}

// exportPlan renders the current workout plan as plain text
func (h *PlanHandler) exportPlan(w http.ResponseWriter, r *http.Request) {
	var sb strings.Builder

	sb.WriteString("# Types: weight | bodyweight | cardio | assisted\n")
	sb.WriteString("# Categories: Legs-Push | Legs-Pull | Arms-Push | Arms-Pull | Core-Push | Core-Pull\n\n")

	for _, day := range weekDays {
		var title string
		h.DB.QueryRow("SELECT title FROM day_titles WHERE day_of_week = ?", day).Scan(&title)

		if title != "" {
			sb.WriteString(fmt.Sprintf("# %s: %s\n", day, title))
		} else {
			sb.WriteString(fmt.Sprintf("# %s\n", day))
		}

		rows, err := h.DB.Query(`
			SELECT e.name, e.type, COALESCE(e.category, ''),
			       e.target_sets, e.target_reps, e.target_weight
			FROM routines r
			JOIN exercises e ON r.exercise_id = e.id
			WHERE r.day_of_week = ?
			ORDER BY r.order_index
		`, day)
		if err != nil {
			http.Error(w, fmt.Sprintf("Database error: %v", err), http.StatusInternalServerError)
			return
		}

		i := 1
		for rows.Next() {
			var name, exType, category string
			var targetSets, targetReps sql.NullInt64
			var targetWeight sql.NullFloat64

			if err := rows.Scan(&name, &exType, &category, &targetSets, &targetReps, &targetWeight); err != nil {
				rows.Close()
				http.Error(w, fmt.Sprintf("Scan error: %v", err), http.StatusInternalServerError)
				return
			}

			sets, reps := 0, 0
			if targetSets.Valid {
				sets = int(targetSets.Int64)
			}
			if targetReps.Valid {
				reps = int(targetReps.Int64)
			}
			setsReps := fmt.Sprintf("%dx%d", sets, reps)

			if !targetWeight.Valid || targetWeight.Float64 == 0 {
				sb.WriteString(fmt.Sprintf("%d. %s | %s | %s | %s\n", i, name, exType, category, setsReps))
			} else {
				weightStr := strconv.FormatFloat(targetWeight.Float64, 'f', -1, 64)
				sb.WriteString(fmt.Sprintf("%d. %s | %s | %s | %s | %skg\n", i, name, exType, category, setsReps, weightStr))
			}
			i++
		}
		rows.Close()
		sb.WriteString("\n")
	}

	w.Header().Set("Content-Type", "text/plain; charset=utf-8")
	w.Write([]byte(strings.TrimRight(sb.String(), "\n")))
}

// --- Plan parsing ---

type planExercise struct {
	Name         string
	Type         string
	Category     string
	TargetSets   *int
	TargetReps   *int
	TargetWeight *float64
}

type planDay struct {
	Title     string
	Exercises []planExercise
}

var (
	dayHeaderRe = regexp.MustCompile(`(?i)^#\s*(monday|tuesday|wednesday|thursday|friday|saturday|sunday)\s*(?::\s*(.*))?$`)
	leadingRe   = regexp.MustCompile(`^(?:\d+\.\s*|-\s*)`)
	setsRepsRe  = regexp.MustCompile(`^(\d+)[xX](\d+)$`)

	validExerciseTypes = map[string]bool{
		"weight": true, "bodyweight": true, "assisted": true, "cardio": true,
	}
	validExerciseCategories = map[string]bool{
		"Legs-Push": true, "Legs-Pull": true,
		"Arms-Push": true, "Arms-Pull": true,
		"Core-Push": true, "Core-Pull": true,
	}
)

func capitalizeFirst(s string) string {
	if len(s) == 0 {
		return s
	}
	return strings.ToUpper(s[:1]) + s[1:]
}

func parsePlan(text string) map[string]planDay {
	result := make(map[string]planDay)
	var currentDay string

	for _, raw := range strings.Split(text, "\n") {
		line := strings.TrimSpace(raw)
		if line == "" {
			continue
		}

		if strings.HasPrefix(line, "#") {
			if m := dayHeaderRe.FindStringSubmatch(line); m != nil {
				currentDay = capitalizeFirst(strings.ToLower(m[1]))
				result[currentDay] = planDay{
					Title:     strings.TrimSpace(m[2]),
					Exercises: []planExercise{},
				}
			}
			continue
		}

		if currentDay == "" || !strings.Contains(line, "|") {
			continue
		}

		line = leadingRe.ReplaceAllString(line, "")
		parts := strings.Split(line, "|")
		if len(parts) < 4 {
			continue
		}

		name := strings.TrimSpace(parts[0])
		exType := strings.ToLower(strings.TrimSpace(parts[1]))
		category := strings.TrimSpace(parts[2])
		setsRepsStr := strings.TrimSpace(parts[3])

		if name == "" || !validExerciseTypes[exType] {
			continue
		}
		if !validExerciseCategories[category] {
			category = ""
		}

		var targetSets, targetReps *int
		if m := setsRepsRe.FindStringSubmatch(setsRepsStr); m != nil {
			sets, _ := strconv.Atoi(m[1])
			reps, _ := strconv.Atoi(m[2])
			if sets > 0 {
				targetSets = &sets
			}
			if reps > 0 {
				targetReps = &reps
			}
		}

		var targetWeight *float64
		if len(parts) >= 5 {
			weightStr := strings.TrimSpace(parts[4])
			weightStr = strings.TrimSuffix(strings.TrimSpace(weightStr), "kg")
			if w, err := strconv.ParseFloat(strings.TrimSpace(weightStr), 64); err == nil && w > 0 {
				targetWeight = &w
			}
		}

		day := result[currentDay]
		day.Exercises = append(day.Exercises, planExercise{
			Name:         name,
			Type:         exType,
			Category:     category,
			TargetSets:   targetSets,
			TargetReps:   targetReps,
			TargetWeight: targetWeight,
		})
		result[currentDay] = day
	}

	return result
}

// importPlan parses the pasted plan text and applies it to the database
func (h *PlanHandler) importPlan(w http.ResponseWriter, r *http.Request) {
	var req struct {
		Plan string `json:"plan"`
	}
	if err := json.NewDecoder(r.Body).Decode(&req); err != nil {
		http.Error(w, "Invalid request body", http.StatusBadRequest)
		return
	}

	days := parsePlan(req.Plan)
	if len(days) == 0 {
		http.Error(w, "No valid days found in plan text", http.StatusBadRequest)
		return
	}

	tx, err := h.DB.Begin()
	if err != nil {
		http.Error(w, "Failed to begin transaction", http.StatusInternalServerError)
		return
	}
	defer tx.Rollback()

	for dayName, dayData := range days {
		if dayData.Title != "" {
			_, err = tx.Exec(`
				INSERT INTO day_titles (day_of_week, title) VALUES (?, ?)
				ON CONFLICT(day_of_week) DO UPDATE SET title = excluded.title
			`, dayName, dayData.Title)
			if err != nil {
				http.Error(w, fmt.Sprintf("Failed to update title for %s: %v", dayName, err), http.StatusInternalServerError)
				return
			}
		}

		if _, err = tx.Exec("DELETE FROM routines WHERE day_of_week = ?", dayName); err != nil {
			http.Error(w, fmt.Sprintf("Failed to clear routines for %s: %v", dayName, err), http.StatusInternalServerError)
			return
		}

		for i, ex := range dayData.Exercises {
			var exerciseID int64
			err = tx.QueryRow("SELECT id FROM exercises WHERE name = ?", ex.Name).Scan(&exerciseID)

			if err == sql.ErrNoRows {
				result, err := tx.Exec(
					`INSERT INTO exercises (name, type, category, target_sets, target_reps, target_weight) VALUES (?, ?, ?, ?, ?, ?)`,
					ex.Name, ex.Type, ex.Category, ex.TargetSets, ex.TargetReps, ex.TargetWeight,
				)
				if err != nil {
					http.Error(w, fmt.Sprintf("Failed to create exercise '%s': %v", ex.Name, err), http.StatusInternalServerError)
					return
				}
				exerciseID, _ = result.LastInsertId()
			} else if err != nil {
				http.Error(w, fmt.Sprintf("Failed to look up exercise '%s': %v", ex.Name, err), http.StatusInternalServerError)
				return
			} else {
				_, err = tx.Exec(`
					UPDATE exercises
					SET type = ?, category = ?, target_sets = ?, target_reps = ?, target_weight = ?, updated_at = CURRENT_TIMESTAMP
					WHERE id = ?
				`, ex.Type, ex.Category, ex.TargetSets, ex.TargetReps, ex.TargetWeight, exerciseID)
				if err != nil {
					http.Error(w, fmt.Sprintf("Failed to update exercise '%s': %v", ex.Name, err), http.StatusInternalServerError)
					return
				}
			}

			if _, err = tx.Exec(
				`INSERT INTO routines (exercise_id, day_of_week, order_index) VALUES (?, ?, ?)`,
				exerciseID, dayName, i,
			); err != nil {
				http.Error(w, fmt.Sprintf("Failed to add '%s' to %s: %v", ex.Name, dayName, err), http.StatusInternalServerError)
				return
			}
		}
	}

	if err := tx.Commit(); err != nil {
		http.Error(w, "Failed to commit transaction", http.StatusInternalServerError)
		return
	}

	w.Header().Set("Content-Type", "application/json")
	json.NewEncoder(w).Encode(map[string]interface{}{
		"message":      "Plan applied successfully",
		"days_updated": len(days),
	})
}
