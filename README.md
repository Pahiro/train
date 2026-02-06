# Workout Planner - SQLite Edition

A progressive web app for tracking workouts with exercise library management, global history tracking, and PR/PB visualization.

## Architecture

### Backend (Go)
- **Database**: SQLite with 5 tables
- **API**: RESTful endpoints for CRUD operations
- **Server**: Simple HTTP server on port 3001

### Frontend (Vanilla JS)
- **Pages**:
  - `index.html` - Daily workout view
  - `exercises.html` - Exercise library management
- **PWA**: Service worker with network-first caching
- **UI**: Dark theme, mobile-responsive

## Database Schema

### Tables

**exercises** - Master exercise library
- id, name, type (cardio/weight/bodyweight), category, timestamps

**routines** - Exercises scheduled by day
- id, exercise_id (FK), day_of_week, order_index, targets (sets/reps/weight), notes

**history** - Global workout sessions
- id, exercise_id (FK), session_date, weight, sets_completed (JSON), completed, volume, is_pr, notes

**exercise_progression** - Current weight and progression tracking
- exercise_id (PK), current_weight, consecutive_successes, ready_to_progress, last_done

**day_titles** - Custom day names
- day_of_week (PK), title

## Features

### Exercise Library
- Search and filter exercises by type and category
- CRUD operations with validation
- Categories: Legs-Push, Legs-Pull, Arms-Push, Arms-Pull, Core-Push, Core-Pull

### Routine Builder
- Day-based workout scheduling
- Add exercises from library with search
- Drag-and-drop reordering
- Edit targets (sets, reps, weight, notes)

### Workout Tracking
- Toggle done/undone status
- Weight exercise detail modal
- Set-by-set rep tracking
- Progression tracking (3 consecutive successes = ready to progress)

### History & PRs
- Global history across all days
- Weight progression graphs (last 20 sessions)
- PR/PB line on graphs (red dashed)
- PR badges on historical sessions

## Development

### Build & Run
```bash
go build -o train
./train
```

Server runs on http://localhost:3001

### Database Migration
On first run, automatically migrates from train.json to train.db
