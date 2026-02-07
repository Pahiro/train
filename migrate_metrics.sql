-- Migration script to add metrics tables to existing database
-- Run this with: sqlite3 train.db < migrate_metrics.sql

-- Create metric types table
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

-- Create metric entries table
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

-- Insert default metrics
INSERT OR IGNORE INTO metric_types (name, unit, color, order_index, is_default) VALUES
    ('Weight', 'kg', '#00E5FF', 0, 1),
    ('Body Fat %', '%', '#FF9800', 1, 1),
    ('Waist', 'cm', '#00C853', 2, 1);
