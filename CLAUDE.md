# CLAUDE.md

This file provides guidance to Claude Code (claude.ai/code) when working with code in this repository.

## Commands

```bash
# Run locally
go build && ./train

# Build for Linux deployment
make build  # GOOS=linux GOARCH=amd64 go build -o train .
make deploy  # SSH + systemctl restart (target in gitignored deploy.local.mk)

# Run tests
go test ./handlers/...

# Run a specific test
go test ./handlers/... -run TestAssistedExercise_LowerWeightIsPR
```

No CGO needed — uses `modernc.org/sqlite` (pure Go). Server runs on port 3001.

## Architecture

Single Go binary serving a vanilla JS PWA. No frontend build step.

- `main.go` — DB migration check, schema init, HTTP handler registration
- `db/db.go` — All CRUD methods; `db.OpenForTesting()` returns in-memory SQLite with full schema
- `db/schema.sql` — Canonical table definitions applied at startup
- `handlers/` — One file per REST resource, each implements `http.Handler` via `ServeHTTP(*db.DB)`
- `public/` — Static files served as-is (HTML, JS, CSS, service worker, PWA manifest)

### Key business logic

**Exercise types** (`weight` | `bodyweight` | `cardio` | `assisted`):
- `cardio`: simple checkbox only, no sets/weight tracking
- `bodyweight`: set-tracking modal, no weight field
- `weight`: set-tracking modal with weight
- `assisted`: set-tracking modal; weight = assistance kg (lower = better/PR)

**Progression** (`handlers/routines.go` `getRoutinesByDay`): `consecutive_successes` and `ready_to_progress` are computed at query time via SQL subquery — not stored in DB. Triggers at 3 consecutive successful sessions.

**PR logic** (`handlers/history.go` `createHistory`):
- `assisted` type: PR when `new weight < MIN(history.weight)`
- All other weighted types: PR when `new weight > MAX(history.weight)`
- On new PR: clears all previous `is_pr` flags for that exercise

**Service worker**: Cache name is versioned in `public/sw.js` (e.g. `workout-planner-v11`). Increment on every frontend change to bust cache for users.

### Known legacy code

`app.js` has two stacked implementations of `openExerciseDetail` / `renderExerciseModal`. The old dead copies are around lines ~308 and ~871; the active ones are ~1132 and ~1166. Do not edit the old copies.

### Runtime migrations

On startup, `initSchema` runs two idempotent migrations:
1. `migrateTargetsToExercises` — moves `target_*` columns from old `routines` table to `exercises`
2. `migrateExerciseTypeConstraint` — rebuilds `exercises` table if CHECK constraint is missing `'assisted'`
