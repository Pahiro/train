# Train – Workout Tracker

A self-hosted progressive-overload workout tracker and body-metrics logger. Runs as a single Go binary serving a PWA on **port 3001**. Data is stored in a local SQLite file (`train.db`).

## Architecture

### Backend (Go)
- **Language**: Go 1.25, `net/http` (no framework), no CGO
- **Database**: SQLite via `modernc.org/sqlite` (pure Go)
- **API**: RESTful handlers, one file per resource in `handlers/`
- **Server**: HTTP server on port 3001

### Frontend (Vanilla JS)
- **Pages**:
  - `index.html` – Daily workout view
  - `exercises.html` – Exercise library management
  - `metrics.html` – Body metrics tracking
- **PWA**: Service worker with cache-first offline / network-first online strategy
- **UI**: Dark theme, mobile-first, no build step

## Database Schema

### Tables

**exercises** – Master exercise library
- `id`, `name`, `type` (`weight` | `bodyweight` | `cardio` | `assisted`), `category`, `target_sets`, `target_reps`, `target_weight`, timestamps

**routines** – Exercises scheduled by day
- `id`, `exercise_id` (FK), `day_of_week`, `order_index`, `notes`

**history** – Workout sessions
- `id`, `exercise_id` (FK), `session_date`, `weight`, `sets_completed` (JSON array), `completed`, `volume`, `is_pr`, `notes`

**day_titles** – Custom label per day of week
- `day_of_week` (PK), `title`

**metric_types** – User-defined body metrics (e.g. weight, body fat %)
- `id`, `name`, `unit`, `color`, `order_index`, `is_default`, timestamps

**metric_entries** – Individual metric measurements
- `id`, `metric_type_id` (FK), `entry_date`, `value`, `notes`

## Features

### Exercise Library (`exercises.html`)
- Search and filter by type and category
- CRUD with validation; duplicate name returns 409
- Types: `weight`, `bodyweight`, `cardio`, `assisted`
- Categories: `Legs-Push`, `Legs-Pull`, `Arms-Push`, `Arms-Pull`, `Core-Push`, `Core-Pull`
- Targets (sets, reps, weight) are defined per exercise and shared across all days

### Routine Builder (`index.html` – edit mode)
- Day-based scheduling; add exercises from the library via search
- Drag-and-drop reordering
- Cardio exercises show a notes field; other types use the exercise's targets

### Workout Tracking (`index.html`)
- **`weight`**: Full set-tracking modal with weight control and per-set rep entry
- **`bodyweight`**: Same modal but no weight field
- **`assisted`**: Same modal; weight represents assistance (lower = better)
- **`cardio`**: Simple tap-to-complete checkbox
- Progression: 3 consecutive successful sessions triggers a "Ready to progress" alert (computed at query time, not stored)

### History & PRs
- Per-exercise history fetched from API on modal open
- Weight progression graph with PR marker
- PR logic: `weight` type — highest weight; `assisted` type — lowest weight (less assistance = better)
- PR badges on historical sessions; deleting a session recalculates the PR

### Body Metrics (`metrics.html`)
- User-defined metric types with custom name, unit, and colour
- Time-series entry logging
- Dashboard view showing recent entries for all metrics
- Drag-and-drop reordering of metric types

## Development

### Run locally (Windows, no GCC needed)
```powershell
go build
.\train.exe
```

### Build for Linux deployment
```powershell
$env:GOOS="linux"; $env:GOARCH="amd64"; go build -o train .
# or: make build && make deploy
```

Server runs on http://localhost:3001

### Run tests
```powershell
go test ./handlers/...
```

Tests use an in-memory SQLite database — no server or file system needed.

### Database migration
On first run, if `train.db` does not exist but `train.json` does, data is automatically migrated from the legacy JSON format.
