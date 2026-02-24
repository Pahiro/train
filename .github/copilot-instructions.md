# Train – Workout Tracker: Copilot Instructions

## What this app is
A self-hosted progressive-overload workout tracker and body-metrics logger. It runs as a single Go binary serving a PWA (Progressive Web App) on **port 3001**. Data is stored in a local SQLite file (`train.db`).

## Running locally (Windows, no GCC)
```powershell
cd c:\Projects\train
go build        # CGO not needed – uses modernc.org/sqlite (pure Go)
.\train.exe
```
Then open http://localhost:3001 in a browser.

## Building for deployment (Linux server)
```powershell
$env:GOOS="linux"; $env:GOARCH="amd64"; go build -o train .
# or: make build
# then: make deploy  (SSH + systemctl restart, target configured in deploy.local.mk)
```

## Running tests
```powershell
go test ./handlers/...
```
Tests use an **in-memory SQLite database** via `db.OpenForTesting()` – no file I/O, no service needed.

## Tech stack
| Layer | Technology |
|---|---|
| Server | Go 1.25, `net/http` (no framework) |
| Database | SQLite via `modernc.org/sqlite` (pure Go, no CGO) |
| Frontend | Vanilla JS PWA (no build step, no framework) |
| CSS | Custom properties, mobile-first |
| Offline | Service worker (`public/sw.js`, cache name bumped on each deploy) |

## Project layout
```
main.go              – Entry point: migration check, DB open, HTTP handler registration
go.mod / go.sum      – Module: "train"
Makefile             – build / deploy targets
deploy.local.mk      – (gitignored) server address overrides
train.db             – SQLite database (gitignored, created at runtime)
train.json.backup    – Original JSON data file (kept for reference after migration)

db/
  schema.sql         – Canonical table definitions (read at startup via initSchema)
  db.go              – DB struct, Open(), OpenForTesting(), all CRUD methods,
                       runtime migrations (migrateTargetsToExercises,
                       migrateExerciseTypeConstraint)
  migration.go       – One-time migration from legacy train.json → SQLite

handlers/            – One file per resource (see handlers/ section below)

public/              – Static files served as-is
  index.html         – Main workout day view
  app.js             – Main workout day logic (~1500 lines)
  exercises.html     – Exercise library page
  exercises.js       – Exercise library logic
  metrics.html       – Body metrics page
  metrics.js         – Body metrics logic
  style.css          – Shared styles
  sw.js              – Service worker (cache-first offline, network-first online)
  manifest.json      – PWA manifest
  icons/             – PWA icons
```

## Database schema (key tables)

### `exercises`
Master library of all exercises. Each exercise is defined once and can be assigned to multiple days via `routines`.

| Column | Notes |
|---|---|
| `type` | `'weight'` \| `'bodyweight'` \| `'cardio'` \| `'assisted'` |
| `category` | `'Legs-Push'` \| `'Legs-Pull'` \| `'Arms-Push'` \| `'Arms-Pull'` \| `'Core-Push'` \| `'Core-Pull'` \| NULL |
| `target_weight` | Starting/current working weight in kg |

### `routines`
Join table: which exercise appears on which day, and in what order.
`(day_of_week, order_index)` is unique.

### `history`
One row per completed session. `sets_completed` is stored as a JSON array of integers (reps per set).
`is_pr` is set to 1 when the session sets a personal record (see PR logic below).

### `day_titles`
Free-text label per day of week (e.g. "Full Body + Sprints").

### `metric_types` / `metric_entries`
User-configurable body metrics (weight, body fat %, waist, etc.) with time-series entries.

## Exercise types and their behaviour

| Type | Weight field? | Modal | Progression trigger | PR definition |
|---|---|---|---|---|
| `weight` | Yes | Full set-tracking modal | 3× consecutive sessions at target weight | Highest `weight` in history |
| `bodyweight` | No | Full set-tracking modal (reps only) | 3× consecutive successful sessions | N/A (no weight) |
| `assisted` | Yes (assistance kg) | Full set-tracking modal | 3× consecutive sessions at target weight | **Lowest** `weight` in history (less assistance = better) |
| `cardio` | No | Simple checkbox only | N/A | N/A |

## Progression logic
`consecutive_successes` and `ready_to_progress` are **computed at query time** in `handlers/routines.go` (`getRoutinesByDay`) via a SQL subquery – they are not stored in the DB.

- `weight` / `assisted`: counts sessions where `completed = 1 AND weight = target_weight` with no failure in between.
- `bodyweight`: counts sessions where `completed = 1` with no failure in between.
- `ready_to_progress = true` when `consecutive_successes >= 3`.

For `assisted`, the progression alert says "Ready to decrease weight!" (less assistance = progress).

## PR logic
Implemented in `handlers/history.go` `createHistory()`:
- Looks up `exercises.type` for the submitted `exercise_id`.
- `assisted`: PR when new `weight < MIN(history.weight)` for that exercise.
- All other weighted types: PR when new `weight > MAX(history.weight)`.
- On a new PR, all previous `is_pr` flags for that exercise are cleared, and the new entry is flagged.

## Runtime migrations
Every startup, `initSchema` runs two idempotent migrations after applying `schema.sql`:
1. `migrateTargetsToExercises` – moves `target_*` columns from the old `routines` table to `exercises` (no-op on current schema).
2. `migrateExerciseTypeConstraint` – if the live `exercises` table's CHECK constraint doesn't include `'assisted'`, it rebuilds the table in-place to add it. Safe on existing data.

## Service worker cache busting
The cache name is a version string in `public/sw.js` (e.g. `workout-planner-v11`). **Increment this version** whenever frontend files change and you want users to get the update. After a version bump, users must either wait for SW update detection or: DevTools → Application → Service Workers → Unregister, then refresh.

## Known legacy code
`app.js` contains two stacked implementations of `openExerciseDetail` / `renderExerciseModal` (lines ~308 and ~871 are the old ones; lines ~1132 and ~1166 are the current ones that override them). The old ones are dead code. Do not edit the old copies.

---

## handlers/ package

Each file maps to one REST resource. All handlers implement `http.Handler` via `ServeHTTP` and receive a `*db.DB` dependency.

### File map

| File | Handler struct(s) | Routes |
|---|---|---|
| `exercises.go` | `ExercisesHandler` | `GET/POST /api/exercises`, `GET/PUT/DELETE /api/exercises/:id` |
| `routines.go` | `RoutinesHandler` | `GET /api/routines/:day`, `POST /api/routines`, `PUT /api/routines/:id`, `DELETE /api/routines/:id`, `POST /api/routines/reorder` |
| `history.go` | `HistoryHandler` | `GET /api/history/:exercise_id`, `GET /api/history/:exercise_id/pr`, `POST /api/history`, `PUT /api/history/:id`, `DELETE /api/history/:id` |
| `days.go` | `DaysHandler` | `GET /api/days/:day`, `PUT /api/days/:day` |
| `metrics.go` | `MetricsHandler` | `GET/POST /api/metrics`, `PUT/DELETE /api/metrics/:id`, `GET /api/metrics/dashboard`, `POST /api/metrics/reorder`, `GET /api/metrics/:id/entries` |
| `metrics.go` | `MetricEntriesHandler` | `GET/POST /api/metric-entries`, `PUT/DELETE /api/metric-entries/:id` |

### exercises.go
- Validates `type` against the allowlist: `cardio`, `weight`, `bodyweight`, `assisted`.
- `target_weight` is relevant for `weight` and `assisted` types; `null` for `bodyweight` and `cardio`.
- Duplicate name returns **409 Conflict**.

### routines.go – `getRoutinesByDay`
This is the main data-fetch for the workout day view. It returns exercises joined with their routines **plus** two computed fields derived from history:

```sql
consecutive_successes  -- int: streak of successful sessions at target
ready_to_progress      -- bool: consecutive_successes >= 3
```

The SQL uses different completion criteria by type:
- `bodyweight`: counts `completed = 1` sessions.
- `weight` / `assisted`: counts `completed = 1 AND weight = target_weight` sessions.

These fields are **not stored** – they are computed fresh on every request.

### history.go – PR logic
`createHistory` determines whether a new session is a PR:
1. Fetches `exercises.type` for the given `exercise_id`.
2. **`assisted`**: PR when `new weight < MIN(existing weights)` (less assistance = better).
3. **All other weighted types**: PR when `new weight > MAX(existing weights)`.
4. On a new PR: clears all previous `is_pr = 1` rows for the exercise, sets `is_pr = 1` on the new row.
5. The `is_pr` boolean is returned in the POST response so the frontend can react immediately.

`getPR` returns the single history row with `is_pr = 1` (most recent if somehow multiple exist).

### days.go
Simple get/set for the free-text title on each day of the week. Uses `INSERT OR REPLACE`.

### metrics.go
- `MetricsHandler`: manages `metric_types` (user-defined body metrics like weight, body fat).
- `MetricEntriesHandler`: manages individual time-series data points.
- `/api/metrics/dashboard` returns entries for all metric types within the last N days.
- `/api/metrics/reorder` accepts an ordered list of IDs and updates `order_index`.

### Testing
Test files use `db.OpenForTesting()` which returns a `*db.DB` backed by an **in-memory SQLite database** with the full schema pre-applied. No server process or file system needed.

```powershell
# Run all handler tests
go test ./handlers/...

# Run a specific test
go test ./handlers/... -run TestAssistedExercise_LowerWeightIsPR
```

#### Existing tests
| File | Test | What it covers |
|---|---|---|
| `history_test.go` | `TestWeightExercise_HigherWeightIsPR` | Normal PR: higher weight = PR for `weight` type |
| `history_test.go` | `TestAssistedExercise_LowerWeightIsPR` | Inverted PR: lower weight = PR for `assisted` type |
| `history_test.go` | `TestWeightAndAssistedPR_AreIndependent` | Two exercises don't interfere with each other's PR flags |
| `exercises_test.go` | `TestExerciseType_ValidTypes` | All four types (`weight`, `bodyweight`, `cardio`, `assisted`) are accepted |
| `exercises_test.go` | `TestExerciseType_InvalidTypeRejected` | Unknown type returns 400 |
| `exercises_test.go` | `TestExerciseType_EmptyTypeRejected` | Empty type returns 400 |
| `exercises_test.go` | `TestExercise_DuplicateNameRejected` | Duplicate name returns 409 |
