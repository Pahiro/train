package db

import (
	"encoding/json"
	"fmt"
	"log"
	"os"
	"regexp"
	"sort"
)

const (
	trainJSONPath   = "train.json"
	trainBackupPath = "train.json.backup"
)

// TrainJSON represents the structure of train.json
type TrainJSON map[string]DayData

type DayData struct {
	Title     string         `json:"title"`
	Exercises []ExerciseData `json:"exercises"`
}

type ExerciseData struct {
	Text                 string        `json:"text"`
	Type                 string        `json:"type"`
	Name                 string        `json:"name,omitempty"`
	Target               *Target       `json:"target,omitempty"`
	CurrentWeight        float64       `json:"currentWeight,omitempty"`
	LastDone             *string       `json:"lastDone"`
	History              []HistoryData `json:"history,omitempty"`
	ConsecutiveSuccesses int           `json:"consecutiveSuccesses,omitempty"`
	ReadyToProgress      bool          `json:"readyToProgress,omitempty"`
}

type Target struct {
	Sets int `json:"sets"`
	Reps int `json:"reps"`
}

type HistoryData struct {
	Date      string  `json:"date"`
	Weight    float64 `json:"weight"`
	Sets      []int   `json:"sets"`
	Completed bool    `json:"completed"`
	Volume    float64 `json:"volume"`
}

// ShouldMigrate checks if migration is needed
func ShouldMigrate() bool {
	// Check if database exists
	if _, err := os.Stat(dbPath); err == nil {
		return false // Database exists, no migration needed
	}

	// Check if train.json exists
	if _, err := os.Stat(trainJSONPath); os.IsNotExist(err) {
		return false // No source file to migrate from
	}

	return true
}

// Migrate performs the migration from train.json to SQLite
func Migrate() error {
	log.Println("Starting migration from train.json to SQLite...")

	// Read train.json
	data, err := os.ReadFile(trainJSONPath)
	if err != nil {
		return fmt.Errorf("failed to read train.json: %w", err)
	}

	var trainData TrainJSON
	if err := json.Unmarshal(data, &trainData); err != nil {
		return fmt.Errorf("failed to parse train.json: %w", err)
	}

	// Open database
	database, err := Open()
	if err != nil {
		return fmt.Errorf("failed to open database: %w", err)
	}
	defer database.Close()

	log.Println("Database opened, beginning migration...")

	// Migrate data
	if err := migrateData(database, trainData); err != nil {
		return fmt.Errorf("migration failed: %w", err)
	}

	log.Println("Data migration completed, backing up original file...")

	// Backup original file
	if err := os.Rename(trainJSONPath, trainBackupPath); err != nil {
		log.Printf("Warning: failed to backup train.json: %v", err)
	} else {
		log.Printf("Backed up train.json to %s", trainBackupPath)
	}

	log.Println("Migration completed successfully!")
	return nil
}

func migrateData(db *DB, trainData TrainJSON) error {
	// Step 1: Extract unique exercises and create exercise map
	exerciseMap := make(map[string]int) // name -> exercise_id

	// Collect all exercises across all days
	type ExerciseInfo struct {
		Name     string
		Type     string
		Category string
	}
	uniqueExercises := make(map[string]ExerciseInfo)

	for _, dayData := range trainData {
		for _, ex := range dayData.Exercises {
			name := ex.Name
			if name == "" {
				// For cardio exercises, use text as name
				name = ex.Text
			}

			if _, exists := uniqueExercises[name]; !exists {
				// Determine category based on exercise name
				category := inferCategory(name)
				uniqueExercises[name] = ExerciseInfo{
					Name:     name,
					Type:     ex.Type,
					Category: category,
				}
			}
		}
	}

	// Insert unique exercises
	log.Printf("Migrating %d unique exercises...", len(uniqueExercises))
	for _, info := range uniqueExercises {
		id, err := db.CreateExercise(info.Name, info.Type, info.Category, nil, nil, nil)
		if err != nil {
			return fmt.Errorf("failed to create exercise %s: %w", info.Name, err)
		}
		exerciseMap[info.Name] = int(id)
	}

	// Step 2: Merge history globally and determine PRs
	type HistoryEntry struct {
		ExerciseID  int
		SessionDate string
		Weight      float64
		Sets        []int
		Completed   bool
		Volume      float64
	}

	globalHistory := make(map[int][]HistoryEntry) // exercise_id -> []history

	for _, dayData := range trainData {
		for _, ex := range dayData.Exercises {
			name := ex.Name
			if name == "" {
				name = ex.Text
			}

			exerciseID := exerciseMap[name]

			// Merge history for this exercise
			for _, hist := range ex.History {
				globalHistory[exerciseID] = append(globalHistory[exerciseID], HistoryEntry{
					ExerciseID:  exerciseID,
					SessionDate: hist.Date,
					Weight:      hist.Weight,
					Sets:        hist.Sets,
					Completed:   hist.Completed,
					Volume:      hist.Volume,
				})
			}
		}
	}

	// Deduplicate history by date and insert
	log.Printf("Migrating history entries...")
	for exID, entries := range globalHistory {
		// Sort by date
		sort.Slice(entries, func(i, j int) bool {
			return entries[i].SessionDate < entries[j].SessionDate
		})

		// Find PR (highest weight)
		maxWeight := 0.0
		prIndex := -1
		for i, entry := range entries {
			if entry.Weight > maxWeight {
				maxWeight = entry.Weight
				prIndex = i
			}
		}

		// Insert history entries
		for i, entry := range entries {
			isPR := (i == prIndex && entry.Weight > 0)
			weight := nullFloat(entry.Weight)
			volume := nullFloat(entry.Volume)

			_, err := db.CreateHistory(
				exID,
				entry.SessionDate,
				weight,
				entry.Sets,
				entry.Completed,
				volume,
				isPR,
				nil,
			)
			if err != nil {
				return fmt.Errorf("failed to create history: %w", err)
			}
		}
	}

	// Step 3: Create routines
	log.Printf("Migrating routines...")

	for day, dayData := range trainData {
		// Insert day title
		if err := db.CreateDayTitle(day, dayData.Title); err != nil {
			return fmt.Errorf("failed to create day title: %w", err)
		}

		// Insert exercises for this day
		for orderIndex, ex := range dayData.Exercises {
			name := ex.Name
			if name == "" {
				name = ex.Text
			}

			exerciseID := exerciseMap[name]

			// Prepare routine data
			var targetSets, targetReps *int
			var targetWeight *float64
			var notes *string

			if ex.Type == "weight" || ex.Type == "bodyweight" {
				if ex.Target != nil {
					targetSets = &ex.Target.Sets
					targetReps = &ex.Target.Reps
				}
				if ex.Type == "weight" && ex.CurrentWeight > 0 {
					targetWeight = nullFloat(ex.CurrentWeight)
				}
				// Store targets on the exercise itself
				if targetSets != nil || targetReps != nil || targetWeight != nil {
					updateQuery := "UPDATE exercises SET"
					updateArgs := []interface{}{}
					first := true
					if targetSets != nil {
						updateQuery += " target_sets = ?"
						updateArgs = append(updateArgs, *targetSets)
						first = false
					}
					if targetReps != nil {
						if !first {
							updateQuery += ","
						}
						updateQuery += " target_reps = ?"
						updateArgs = append(updateArgs, *targetReps)
						first = false
					}
					if targetWeight != nil {
						if !first {
							updateQuery += ","
						}
						updateQuery += " target_weight = ?"
						updateArgs = append(updateArgs, *targetWeight)
					}
					updateQuery += " WHERE id = ? AND target_sets IS NULL"
					updateArgs = append(updateArgs, exerciseID)
					db.Exec(updateQuery, updateArgs...)
				}
			} else {
				// Cardio exercise - store text in notes
				notes = &ex.Text
			}

			// Create routine entry (no targets - they're on the exercise now)
			_, err := db.CreateRoutine(
				exerciseID,
				day,
				orderIndex,
				notes,
			)
			if err != nil {
				return fmt.Errorf("failed to create routine: %w", err)
			}
		}
	}

	return nil
}

// inferCategory attempts to determine exercise category from name
func inferCategory(name string) string {
	name = regexp.MustCompile(`[^a-zA-Z\s]`).ReplaceAllString(name, "")
	name = regexp.MustCompile(`\s+`).ReplaceAllString(name, " ")

	// Legs - Push
	legsPush := []string{"leg press", "squat", "lunge", "leg extension", "hack squat"}
	for _, pattern := range legsPush {
		if matchPattern(name, pattern) {
			return "Legs-Push"
		}
	}

	// Legs - Pull
	legsPull := []string{"leg curl", "deadlift", "romanian deadlift", "hamstring"}
	for _, pattern := range legsPull {
		if matchPattern(name, pattern) {
			return "Legs-Pull"
		}
	}

	// Arms - Push
	armsPush := []string{"chest press", "bench press", "shoulder press", "tricep", "overhead press", "dip"}
	for _, pattern := range armsPush {
		if matchPattern(name, pattern) {
			return "Arms-Push"
		}
	}

	// Arms - Pull
	armsPull := []string{"lat pulldown", "pull up", "chin up", "row", "bicep", "curl"}
	for _, pattern := range armsPull {
		if matchPattern(name, pattern) {
			return "Arms-Pull"
		}
	}

	// Core - Push
	corePush := []string{"ab machine", "crunch", "sit up", "ab wheel"}
	for _, pattern := range corePush {
		if matchPattern(name, pattern) {
			return "Core-Push"
		}
	}

	// Core - Pull
	corePull := []string{"hanging knee raise", "leg raise", "plank", "back extension"}
	for _, pattern := range corePull {
		if matchPattern(name, pattern) {
			return "Core-Pull"
		}
	}

	// Default to empty (will be set by user later)
	return ""
}

func matchPattern(name, pattern string) bool {
	re := regexp.MustCompile(`(?i)\b` + pattern + `\b`)
	return re.MatchString(name)
}
