# Workout Planner 🏋️‍♂️

A simple, lightweight progressive web app (PWA) to plan your weekly workouts. Built with Go and Vanilla JS.

## Features

- **Weekly Schedule**: View and manage workouts for each day of the week.
- **Edit Mode**: Customize titles and exercises for any day.
- **PWA Ready**: Installable on mobile and desktop, works offline.
- **Dark Mode**: Sleek, battery-saving dark interface.
- **Data Persistence**: Autosaves changes to `train.json`.

## Quick Start

### Prerequisites
- [Go](https://go.dev/dl/) installed (1.16+).

### Running Locally

1.  Clone the repository:
    ```bash
    git clone https://github.com/Pahiro/avs.git
    cd avs
    ```

2.  Run the server:
    ```bash
    go run main.go
    ```

3.  Open your browser to:
    ```
    http://localhost:3001
    ```

## Deploying

This app is a single binary. To deploy, simply build the binary and run it on your server, ensuring `public/` and `train.json` are in the working directory.

```bash
go build -o workout-planner
./workout-planner
```

## Structure

- `main.go`: Simple HTTP server (API + Static file serving).
- `public/`: Frontend assets (HTML, CSS, JS, Manifest).
- `train.json`: Database file (JSON format).

## Tech Stack

- **Backend**: Go (Standard Library)
- **Frontend**: HTML5, CSS3, Vanilla JavaScript
