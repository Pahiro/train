-- Database schema for workout tracker

-- Exercise definitions (master library)
CREATE TABLE IF NOT EXISTS exercises (
    id INTEGER PRIMARY KEY AUTOINCREMENT,
    name TEXT NOT NULL UNIQUE,
    type TEXT NOT NULL CHECK(type IN ('cardio', 'weight', 'bodyweight', 'assisted')),
    category TEXT CHECK(category IN ('Legs-Push', 'Legs-Pull', 'Arms-Push', 'Arms-Pull', 'Core-Push', 'Core-Pull')),
    target_sets INTEGER,
    target_reps INTEGER,
    target_weight REAL,
    created_at DATETIME DEFAULT CURRENT_TIMESTAMP,
    updated_at DATETIME DEFAULT CURRENT_TIMESTAMP
);

CREATE INDEX IF NOT EXISTS idx_exercises_name ON exercises(name);
CREATE INDEX IF NOT EXISTS idx_exercises_type ON exercises(type);
CREATE INDEX IF NOT EXISTS idx_exercises_category ON exercises(category);

-- Routines (exercises mapped to days of week)
CREATE TABLE IF NOT EXISTS routines (
    id INTEGER PRIMARY KEY AUTOINCREMENT,
    exercise_id INTEGER NOT NULL,
    day_of_week TEXT NOT NULL CHECK(day_of_week IN ('Monday', 'Tuesday', 'Wednesday', 'Thursday', 'Friday', 'Saturday', 'Sunday')),
    order_index INTEGER NOT NULL,
    notes TEXT,
    created_at DATETIME DEFAULT CURRENT_TIMESTAMP,
    FOREIGN KEY (exercise_id) REFERENCES exercises(id) ON DELETE CASCADE
);

CREATE INDEX IF NOT EXISTS idx_routines_day ON routines(day_of_week, order_index);
CREATE INDEX IF NOT EXISTS idx_routines_exercise ON routines(exercise_id);
CREATE UNIQUE INDEX IF NOT EXISTS idx_routines_day_order ON routines(day_of_week, order_index);

-- Exercise history (global tracking across all days)
CREATE TABLE IF NOT EXISTS history (
    id INTEGER PRIMARY KEY AUTOINCREMENT,
    exercise_id INTEGER NOT NULL,
    session_date DATE NOT NULL,
    weight REAL,
    sets_completed TEXT NOT NULL,
    completed BOOLEAN NOT NULL DEFAULT 0,
    volume REAL,
    is_pr BOOLEAN DEFAULT 0,
    notes TEXT,
    created_at DATETIME DEFAULT CURRENT_TIMESTAMP,
    FOREIGN KEY (exercise_id) REFERENCES exercises(id) ON DELETE CASCADE
);

CREATE INDEX IF NOT EXISTS idx_history_exercise ON history(exercise_id, session_date DESC);
CREATE INDEX IF NOT EXISTS idx_history_date ON history(session_date);
CREATE INDEX IF NOT EXISTS idx_history_pr ON history(exercise_id, is_pr) WHERE is_pr = 1;

-- Day titles
CREATE TABLE IF NOT EXISTS day_titles (
    day_of_week TEXT PRIMARY KEY CHECK(day_of_week IN ('Monday', 'Tuesday', 'Wednesday', 'Thursday', 'Friday', 'Saturday', 'Sunday')),
    title TEXT NOT NULL DEFAULT ''
);

-- Metric types (user-customizable metrics for body tracking)
CREATE TABLE IF NOT EXISTS metric_types (
    id INTEGER PRIMARY KEY AUTOINCREMENT,
    name TEXT NOT NULL UNIQUE,
    unit TEXT NOT NULL,
    color TEXT NOT NULL,
    order_index INTEGER NOT NULL DEFAULT 0,
    is_default BOOLEAN DEFAULT 0,
    created_at DATETIME DEFAULT CURRENT_TIMESTAMP,
    updated_at DATETIME DEFAULT CURRENT_TIMESTAMP
);

CREATE INDEX IF NOT EXISTS idx_metric_types_name ON metric_types(name);
CREATE INDEX IF NOT EXISTS idx_metric_types_order ON metric_types(order_index);

-- Metric entries (individual measurements)
CREATE TABLE IF NOT EXISTS metric_entries (
    id INTEGER PRIMARY KEY AUTOINCREMENT,
    metric_type_id INTEGER NOT NULL,
    entry_date DATE NOT NULL,
    value REAL NOT NULL,
    notes TEXT,
    created_at DATETIME DEFAULT CURRENT_TIMESTAMP,
    FOREIGN KEY (metric_type_id) REFERENCES metric_types(id) ON DELETE CASCADE
);

CREATE INDEX IF NOT EXISTS idx_metric_entries_type_date ON metric_entries(metric_type_id, entry_date DESC);
CREATE INDEX IF NOT EXISTS idx_metric_entries_date ON metric_entries(entry_date DESC);

-- Default metric seeds
INSERT OR IGNORE INTO metric_types (name, unit, color, order_index, is_default) VALUES
    ('Weight', 'kg', '#00E5FF', 0, 1),
    ('Body Fat %', '%', '#FF9800', 1, 1),
    ('Waist', 'cm', '#00C853', 2, 1);
