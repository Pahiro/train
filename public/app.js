const state = {
    dayData: null, // Current day's data from API
    dayTitle: '',
    exercises: [], // Current day's exercises
    selectedDay: null,
    isEditing: false,
    timer: {
        active: false,
        time: 0,
        interval: null
    },
    dragState: {
        draggedIndex: null,
        draggedOverIndex: null
    },
    modal: {
        isOpen: false,
        exerciseIndex: null,
        exerciseId: null,
        currentSession: {
            sets: [],
            weight: null
        },
        history: [],
        pr: null
    },
    searchModal: {
        isOpen: false,
        exercises: [],
        filteredExercises: [],
        searchQuery: ''
    }
};

// Helper: Get local date string YYYY-MM-DD
function getTodayDateString() {
    const d = new Date();
    const year = d.getFullYear();
    const month = String(d.getMonth() + 1).padStart(2, '0');
    const day = String(d.getDate()).padStart(2, '0');
    return `${year}-${month}-${day}`;
}

// Helper: Get current day of week name
function getCurrentDayOfWeek() {
    const days = ['Sunday', 'Monday', 'Tuesday', 'Wednesday', 'Thursday', 'Friday', 'Saturday'];
    return days[new Date().getDay()];
}

// Helper: Parse exercise text to extract details
// Example: "Leg Press: 3x15@60" -> { name: "Leg Press", sets: 3, reps: 15, weight: 60 }
function parseExerciseText(text) {
    // Pattern: "Name: SxR@W" where S=sets, R=reps, W=weight
    const weightPattern = /^(.+?):\s*(\d+)x(\d+)@(\d+(?:\.\d+)?)\s*$/i;
    const match = text.match(weightPattern);

    if (match) {
        return {
            type: 'weight',
            name: match[1].trim(),
            sets: parseInt(match[2]),
            reps: parseInt(match[3]),
            weight: parseFloat(match[4])
        };
    }

    // If no match, it's a cardio/text exercise
    return {
        type: 'cardio',
        name: text
    };
}


const dom = {
    daySelector: document.getElementById('day-selector'),
    workoutContainer: document.getElementById('workout-container'),
    loading: document.getElementById('loading'),
    timerFab: document.getElementById('timer-fab')
};

async function init() {
    try {
        // Set initial day
        const days = ['Sunday', 'Monday', 'Tuesday', 'Wednesday', 'Thursday', 'Friday', 'Saturday'];
        state.selectedDay = days[new Date().getDay()];

        // Load data for selected day
        await loadDayData(state.selectedDay);

        renderDaySelector();
        renderWorkout();
        dom.loading.style.display = 'none';

        dom.daySelector.addEventListener('change', async (e) => {
            state.selectedDay = e.target.value;
            state.isEditing = false;
            await loadDayData(state.selectedDay);
            renderWorkout();
        });

    } catch (err) {
        console.error('Failed to init:', err);
        dom.workoutContainer.innerHTML = '<p>Error loading data. Please reload.</p>';
    }
}

// Load data for a specific day from new API
async function loadDayData(day) {
    const res = await fetch(`/api/routines/${day}`);
    if (!res.ok) {
        throw new Error('Failed to load day data');
    }
    const data = await res.json();
    state.dayData = data;
    state.dayTitle = data.title || '';
    state.exercises = data.exercises || [];
}

// Deprecated: migrateData() function removed - now using SQLite backend

// Helper: Save data to backend
async function saveData() {
    try {
        await fetch('/api/training', {
            method: 'POST',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify(state.data)
        });
    } catch (err) {
        console.error('Failed to save data:', err);
    }
}


function renderDaySelector() {
    const days = ['Monday', 'Tuesday', 'Wednesday', 'Thursday', 'Friday', 'Saturday', 'Sunday'];
    dom.daySelector.innerHTML = days.map(day =>
        `<option value="${day}" ${day === state.selectedDay ? 'selected' : ''}>${day}</option>`
    ).join('');
}

function renderWorkout() {
    if (!state.exercises || !state.selectedDay) return;

    const exercises = state.exercises;
    const today = getTodayDateString();

    let content = '';

    if (state.isEditing) {
        content += `<input type="text" id="day-title-input" value="${state.dayTitle}" class="title-input" aria-label="Day Title">`;
        content += `
            <div class="edit-mode">
                <ul id="exercise-list">
                    ${exercises.map((ex, idx) => {
            const isWeight = ex.type === 'weight';
            return `
                        <li draggable="true" data-index="${idx}" class="draggable-item edit-item">
                            <div class="edit-item-header">
                                <span class="drag-handle" aria-label="Drag to reorder">::</span>
                                <span class="exercise-type-label">${isWeight ? 'Weight Training' : 'Cardio'}</span>
                                <button class="btn-remove" onclick="removeExercise(${idx})" aria-label="Remove exercise">×</button>
                            </div>

                            <div class="edit-item-body">
                                ${isWeight ? `
                                    <div class="edit-field exercise-name-display">
                                        <strong>${ex.name}</strong>
                                        <small style="color: var(--text-secondary); font-size: 12px;">To change the exercise name, edit it in the Exercise Library</small>
                                    </div>
                                    <div class="edit-weight-grid">
                                        <div class="edit-field">
                                            <label>Sets</label>
                                            <input type="number" class="edit-input ex-sets" value="${ex.target_sets || 3}" placeholder="3" data-index="${idx}">
                                        </div>
                                        <div class="edit-field">
                                            <label>Reps</label>
                                            <input type="number" class="edit-input ex-reps" value="${ex.target_reps || 10}" placeholder="10" data-index="${idx}">
                                        </div>
                                        <div class="edit-field">
                                            <label>Weight (kg)</label>
                                            <input type="number" class="edit-input ex-weight" value="${ex.current_weight || ex.target_weight || 0}" step="0.5" placeholder="0" data-index="${idx}">
                                        </div>
                                    </div>
                                ` : `
                                    <div class="edit-field exercise-name-display">
                                        <strong>${ex.name}</strong>
                                        <small style="color: var(--text-secondary); font-size: 12px;">To change the exercise name, edit it in the Exercise Library</small>
                                    </div>
                                    <div class="edit-field">
                                        <label>Notes</label>
                                        <input type="text" value="${ex.notes || ex.text || ''}" data-index="${idx}" class="exercise-input" aria-label="Exercise Notes" placeholder="e.g. 30 mins @ 5 km/h">
                                    </div>
                                `}
                            </div>
                        </li>
                    `}).join('')}
                </ul>
                <div class="edit-actions">
                    <button class="btn-add" onclick="openAddExerciseModal()">+ Add from Library</button>
                    <!-- Save button moved to FAB -->
                </div>
                
                <!-- Save FAB (Bottom Left) -->
                <div class="fab edit-fab editing" onclick="saveChanges()" aria-label="Save Changes">
                    <svg viewBox="0 0 24 24" width="24" height="24" stroke="currentColor" stroke-width="2" fill="none" stroke-linecap="round" stroke-linejoin="round">
                        <polyline points="20 6 9 17 4 12"></polyline>
                    </svg>
                </div>
            </div>
        `;
    } else {
        content += `<h2>${state.dayTitle}</h2>`;
        content += `
            <ul>
                ${exercises.map((ex, idx) => {
            // Extract date part from ISO datetime (e.g., "2026-02-06T00:00:00Z" -> "2026-02-06")
            const lastDoneDate = ex.last_done ? ex.last_done.split('T')[0] : null;
            // Only show as done if completed today AND we're viewing today's workout
            const isDone = lastDoneDate === today && state.selectedDay === getCurrentDayOfWeek();

            // Weight training exercise - clickable for detail view
            if (ex.type === 'weight') {
                return `
                    <li>
                        <div class="exercise-item weight-exercise" onclick="openExerciseDetail(${idx})">
                            <input type="checkbox" class="exercise-checkbox" 
                                ${isDone ? 'checked' : ''} 
                                onclick="event.stopPropagation(); toggleExercise(${idx})"
                            >
                            <div class="exercise-content">
                                <span class="exercise-text ${isDone ? 'done' : ''}">
                                    ${ex.name}
                                </span>
                                <span class="exercise-meta">
                                    ${ex.target_sets}×${ex.target_reps} @ ${ex.current_weight || ex.target_weight || 0}kg
                                    ${ex.ready_to_progress ? '<span class="progress-badge">📈 Ready!</span>' : ''}
                                </span>
                            </div>
                            <svg class="chevron-icon" viewBox="0 0 24 24" width="20" height="20" stroke="currentColor" stroke-width="2" fill="none">
                                <polyline points="9 18 15 12 9 6"></polyline>
                            </svg>
                        </div>
                    </li>
                `;
            }
            // Cardio exercise - simple checkbox
            else {
                return `
                    <li>
                        <div class="exercise-item">
                            <input type="checkbox" class="exercise-checkbox" 
                                ${isDone ? 'checked' : ''} 
                                onchange="toggleExercise(${idx})"
                            >
                            <span class="exercise-text ${isDone ? 'done' : ''}" onclick="toggleExercise(${idx})">
                                ${ex.notes || ex.text || ex.name}
                            </span>
                        </div>
                    </li>
                `;
            }
        }).join('')}
            </ul>
        `;


        // Edit FAB (Left)
        content += `
            <div class="fab edit-fab" onclick="startEditing()" aria-label="Edit Workout">
                <svg viewBox="0 0 24 24" width="24" height="24" stroke="currentColor" stroke-width="2" fill="none" stroke-linecap="round" stroke-linejoin="round">
                    <path d="M11 4H4a2 2 0 0 0-2 2v14a2 2 0 0 0 2 2h14a2 2 0 0 0 2-2v-7"></path>
                    <path d="M18.5 2.5a2.121 2.121 0 0 1 3 3L12 15l-4 1 1-4 9.5-9.5z"></path>
                </svg>
            </div>
        `;
    }

    dom.workoutContainer.innerHTML = content;

    // Attach drag-and-drop event listeners if in edit mode
    if (state.isEditing) {
        attachDragListeners();
    }

    // Render modal if open
    if (state.modal.isOpen) {
        renderExerciseModal();
    }
}

// Render Exercise Detail Modal
function renderExerciseModal() {
    const exerciseIndex = state.modal.exerciseIndex;
    const exercise = state.exercises[exerciseIndex];
    const today = getTodayDateString();

    // Initialize current session if not set
    if (state.modal.currentSession.sets.length === 0) {
        state.modal.currentSession.sets = new Array(exercise.target_sets).fill('');
        state.modal.currentSession.weight = exercise.current_weight;
    }

    // Calculate if session is complete
    const allSetsComplete = state.modal.currentSession.sets.every((reps, idx) => {
        const repsNum = parseInt(reps);
        return !isNaN(repsNum) && repsNum >= exercise.target_reps;
    });

    // Calculate current volume
    const currentVolume = state.modal.currentSession.sets.reduce((sum, reps) => {
        const repsNum = parseInt(reps) || 0;
        return sum + (repsNum * state.modal.currentSession.weight);
    }, 0);

    // Get last 10 history entries for graph
    const historyForGraph = exercise.history_data.slice(-10);

    const modalHTML = `
        <div class="modal-overlay" onclick="closeExerciseDetail()">
            <div class="modal-content" onclick="event.stopPropagation()">
                <div class="modal-header">
                    <h2>${exercise.name}</h2>
                    <button class="modal-close" onclick="closeExerciseDetail()" aria-label="Close">×</button>
                </div>
                
                <div class="modal-body">
                    <!-- Weight Control -->
                    <div class="weight-section">
                        <label>Current Weight</label>
                        <div class="weight-control">
                            <button class="weight-btn" onclick="adjustWeight(-0.5)">-</button>
                            <span class="weight-display">${state.modal.currentSession.weight} kg</span>
                            <button class="weight-btn" onclick="adjustWeight(0.5)">+</button>
                        </div>
                        <div class="target-display">Target: ${exercise.target_sets}×${exercise.target_reps}</div>
                    </div>
                    
                    <!-- Progression Status -->
                    ${exercise.readyToProgress ? `
                        <div class="progression-alert">
                            <span class="progress-icon">🎯</span>
                            <div>
                                <strong>Ready to increase weight!</strong>
                                <p>${exercise.consecutiveSuccesses} consecutive successful sessions</p>
                            </div>
                        </div>
                    ` : exercise.consecutiveSuccesses > 0 ? `
                        <div class="progression-info">
                            <span>${exercise.consecutiveSuccesses}/${3} successful sessions</span>
                        </div>
                    ` : ''}
                    
                    <!-- Set Tracker -->
                    <div class="set-tracker-section">
                        <label>Today's Sets</label>
                        <div class="set-tracker">
                            ${state.modal.currentSession.sets.map((_, idx) => `
                                <div class="set-input-group">
                                    <label>Set ${idx + 1}</label>
                                    <div class="set-input-controls">
                                        <button class="set-adjust-btn" onclick="adjustSetReps(${idx}, -1)">-</button>
                                        <input
                                            type="number"
                                            class="set-input"
                                            placeholder="${exercise.target_reps}"
                                            value="${state.modal.currentSession.sets[idx]}"
                                            oninput="updateSetReps(${idx}, this.value)"
                                            onfocus="autoFillTargetReps(${idx}, ${exercise.target_reps})"
                                            min="0"
                                            max="99"
                                        >
                                        <button class="set-adjust-btn" onclick="adjustSetReps(${idx}, 1)">+</button>
                                    </div>
                                    <span class="reps-label">reps</span>
                                </div>
                            `).join('')}
                        </div>
                        
                        <div class="session-stats">
                            <div class="stat">
                                <span class="stat-label">Volume</span>
                                <span class="stat-value">${currentVolume} kg</span>
                            </div>
                            <div class="stat">
                                <span class="stat-label">Status</span>
                                <span class="stat-value ${allSetsComplete ? 'success' : 'incomplete'}">
                                    ${allSetsComplete ? '✓ Complete' : 'Incomplete'}
                                </span>
                            </div>
                        </div>
                        
                        <button class="btn-primary btn-complete" onclick="completeExerciseSession()">
                            Complete Session
                        </button>
                    </div>
                    
                    <!-- History Section -->
                    ${exercise.history_data.length > 0 ? `
                        <div class="history-section">
                            <h3>History</h3>
                            
                            <!-- Weight Progression Graph -->
                            <div class="graph-container">
                                <canvas id="weight-graph" width="400" height="200"></canvas>
                            </div>
                            
                            <!-- Recent Sessions -->
                            <div class="history-list">
                                ${exercise.history_data.slice(-5).reverse().map(session => `
                                    <div class="history-card ${session.completed ? 'completed' : 'incomplete'}">
                                        <div class="history-header">
                                            <span class="history-date">${session.date}</span>
                                            <span class="history-status">${session.completed ? '✓' : '✗'}</span>
                                        </div>
                                        <div class="history-details">
                                            <span>${session.weight}kg</span>
                                            <span class="history-sets">${session.sets.join(', ')} reps</span>
                                            <span class="history-volume">${session.volume}kg total</span>
                                        </div>
                                    </div>
                                `).join('')}
                            </div>
                        </div>
                    ` : '<div class="no-history">No history yet. Complete your first session!</div>'}
                </div>
            </div>
        </div>
    `;

    // Insert modal into DOM
    let modalContainer = document.getElementById('exercise-modal');
    if (!modalContainer) {
        modalContainer = document.createElement('div');
        modalContainer.id = 'exercise-modal';
        document.body.appendChild(modalContainer);
    }
    modalContainer.innerHTML = modalHTML;

    // Render graph if there's history
    if (historyForGraph.length > 0) {
        setTimeout(() => renderWeightGraph(historyForGraph), 50);
    }
}

// Render weight progression graph
// Old renderWeightGraph removed - using updated version below with PR support and single-point fix

// Timer Custom Logic - Count UP instead of down
window.toggleTimer = () => {
    const icon = document.getElementById('timer-icon');
    const text = document.getElementById('timer-text');
    const fab = document.getElementById('timer-fab');

    if (state.timer.active) {
        // Stop timer
        clearInterval(state.timer.interval);
        state.timer.active = false;
        state.timer.time = 0;

        // Reset UI
        text.style.display = 'none';
        icon.style.display = 'block';
        fab.classList.remove('active');

        navigator.vibrate?.(50);
    } else {
        // Start timer
        state.timer.active = true;
        state.timer.time = 0;
        fab.classList.add('active');

        // Show text, hide icon
        icon.style.display = 'none';
        text.style.display = 'block';
        text.textContent = formatTime(state.timer.time);

        navigator.vibrate?.(50);

        state.timer.interval = setInterval(() => {
            state.timer.time++;
            text.textContent = formatTime(state.timer.time);
        }, 1000);
    }
};

// Format seconds as MM:SS
function formatTime(seconds) {
    const mins = Math.floor(seconds / 60);
    const secs = seconds % 60;
    return `${mins}:${secs.toString().padStart(2, '0')}`;
}

// Old modal control functions removed - see Phase 5 implementations below


// Global handlers
window.toggleExercise = async (index) => {
    const ex = state.exercises[index];
    const today = getTodayDateString();

    // Toggle logic: If done today, clear it. Else, set to today.
    const newLastDone = (ex.last_done === today) ? null : today;

    // Update via API
    try {
        await fetch(`/api/routines/${ex.routine_id}`, {
            method: 'PUT',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify({ last_done: newLastDone })
        });

        // Update local state
        ex.last_done = newLastDone;
        renderWorkout();
    } catch (err) {
        console.error('Failed to toggle exercise:', err);
    }
};

window.startEditing = () => {
    state.isEditing = true;
    renderWorkout();
};

window.removeExercise = async (index) => {
    const ex = state.exercises[index];

    try {
        await fetch(`/api/routines/${ex.routine_id}`, {
            method: 'DELETE'
        });

        // Reload day data
        await loadDayData(state.selectedDay);
        renderWorkout();
    } catch (err) {
        console.error('Failed to remove exercise:', err);
        alert('Failed to remove exercise. Please try again.');
    }
};

// Removed: addExercise - now using openAddExerciseModal() instead

window.saveChanges = async () => {
    state.isEditing = false;

    try {
        // Update day title
        const titleInput = document.getElementById('day-title-input');
        if (titleInput && titleInput.value !== state.dayTitle) {
            await fetch(`/api/days/${state.selectedDay}`, {
                method: 'PUT',
                headers: { 'Content-Type': 'application/json' },
                body: JSON.stringify({ title: titleInput.value })
            });
        }

        // Update each exercise's targets from form inputs
        const exercises = state.exercises;
        for (let i = 0; i < exercises.length; i++) {
            const ex = exercises[i];

            if (ex.type === 'weight' || ex.type === 'bodyweight') {
                const setsInput = document.querySelector(`.ex-sets[data-index="${i}"]`);
                const repsInput = document.querySelector(`.ex-reps[data-index="${i}"]`);
                const weightInput = document.querySelector(`.ex-weight[data-index="${i}"]`);

                const updates = {};
                if (setsInput) updates.target_sets = parseInt(setsInput.value) || 3;
                if (repsInput) updates.target_reps = parseInt(repsInput.value) || 10;
                if (weightInput && ex.type === 'weight') {
                    updates.target_weight = parseFloat(weightInput.value) || 0;
                }

                if (Object.keys(updates).length > 0) {
                    await fetch(`/api/routines/${ex.routine_id}`, {
                        method: 'PUT',
                        headers: { 'Content-Type': 'application/json' },
                        body: JSON.stringify(updates)
                    });
                }
            } else if (ex.type === 'cardio') {
                const textInput = document.querySelector(`.exercise-input[data-index="${i}"]`);
                if (textInput) {
                    await fetch(`/api/routines/${ex.routine_id}`, {
                        method: 'PUT',
                        headers: { 'Content-Type': 'application/json' },
                        body: JSON.stringify({ notes: textInput.value })
                    });
                }
            }
        }

        // Reload data and render
        await loadDayData(state.selectedDay);
        renderWorkout();

    } catch (err) {
        alert('Failed to save changes!');
        console.error(err);
    }
};

// toggleExerciseType removed - exercise types are now defined in the library and cannot be changed

// Deprecated: updateStateFromInputs() function removed - now using API-based updates

// Drag and Drop Functions
function attachDragListeners() {
    const items = document.querySelectorAll('.draggable-item');

    items.forEach(item => {
        item.addEventListener('dragstart', handleDragStart);
        item.addEventListener('dragover', handleDragOver);
        item.addEventListener('drop', handleDrop);
        item.addEventListener('dragend', handleDragEnd);
        item.addEventListener('dragenter', handleDragEnter);
        item.addEventListener('dragleave', handleDragLeave);
    });
}

function handleDragStart(e) {
    state.dragState.draggedIndex = parseInt(e.target.dataset.index);
    e.target.classList.add('dragging');
    e.dataTransfer.effectAllowed = 'move';
}

function handleDragOver(e) {
    e.preventDefault();
    e.dataTransfer.dropEffect = 'move';
    return false;
}

function handleDragEnter(e) {
    const target = e.target.closest('.draggable-item');
    if (target) {
        target.classList.add('drag-over');
    }
}

function handleDragLeave(e) {
    const target = e.target.closest('.draggable-item');
    if (target && !target.contains(e.relatedTarget)) {
        target.classList.remove('drag-over');
    }
}

async function handleDrop(e) {
    e.preventDefault();
    e.stopPropagation();

    const target = e.target.closest('.draggable-item');
    if (!target) return;

    const dropIndex = parseInt(target.dataset.index);
    const dragIndex = state.dragState.draggedIndex;

    if (dragIndex !== null && dragIndex !== dropIndex) {
        // Reorder the exercises array locally
        const exercises = [...state.exercises];
        const [draggedItem] = exercises.splice(dragIndex, 1);
        exercises.splice(dropIndex, 0, draggedItem);

        // Update state
        state.exercises = exercises;

        // Call reorder API
        const routineIds = exercises.map(ex => ex.routine_id);
        try {
            await fetch('/api/routines/reorder', {
                method: 'POST',
                headers: { 'Content-Type': 'application/json' },
                body: JSON.stringify({
                    day_of_week: state.selectedDay,
                    routine_ids: routineIds
                })
            });

            // Re-render
            renderWorkout();
        } catch (err) {
            console.error('Failed to reorder:', err);
            // Reload on error
            await loadDayData(state.selectedDay);
            renderWorkout();
        }
    }

    return false;
}

function handleDragEnd(e) {
    e.target.classList.remove('dragging');

    // Remove all drag-over classes
    document.querySelectorAll('.drag-over').forEach(item => {
        item.classList.remove('drag-over');
    });

    state.dragState.draggedIndex = null;
}

init();

// ============================================
// NEW: Exercise Library Integration
// ============================================

// Open modal to add exercise from library
async function openAddExerciseModal() {
    // Load all exercises
    const res = await fetch('/api/exercises');
    const data = await res.json();
    state.searchModal.exercises = data.exercises || [];
    state.searchModal.filteredExercises = data.exercises || [];
    state.searchModal.isOpen = true;

    renderExerciseSearchModal();
}

// Render exercise search modal
function renderExerciseSearchModal() {
    const modal = document.createElement('div');
    modal.id = 'exercise-search-modal';
    modal.className = 'modal';
    modal.style.display = 'flex';

    const exercises = state.searchModal.filteredExercises.map(ex => {
        const typeBadgeColor = getTypeBadgeColor(ex.type);
        return `
            <div class="exercise-search-item" onclick="addExerciseFromLibrary(${ex.id}, '${escapeHtml(ex.name)}', '${ex.type}')">
                <span class="exercise-name">${escapeHtml(ex.name)}</span>
                <span class="exercise-badge" style="background: ${typeBadgeColor}22; color: ${typeBadgeColor}; border: 1px solid ${typeBadgeColor}">${ex.type}</span>
            </div>
        `;
    }).join('');

    modal.innerHTML = `
        <div class="modal-content">
            <div class="modal-header">
                <h2>Add Exercise from Library</h2>
                <button class="modal-close" onclick="closeExerciseSearchModal()">&times;</button>
            </div>
            <div class="modal-body">
                <div class="search-box">
                    <input type="text" id="exercise-search-input" placeholder="Search exercises..." autocomplete="off">
                    <span class="search-icon">🔍</span>
                </div>
                <div id="exercise-search-results" class="exercise-search-results">
                    ${exercises}
                </div>
            </div>
        </div>
    `;

    document.body.appendChild(modal);

    // Add search listener
    document.getElementById('exercise-search-input').addEventListener('input', (e) => {
        const query = e.target.value.toLowerCase();
        state.searchModal.filteredExercises = state.searchModal.exercises.filter(ex =>
            ex.name.toLowerCase().includes(query)
        );
        updateSearchResults();
    });

    // Close on outside click
    modal.addEventListener('click', (e) => {
        if (e.target === modal) {
            closeExerciseSearchModal();
        }
    });
}

function updateSearchResults() {
    const resultsDiv = document.getElementById('exercise-search-results');
    if (!resultsDiv) return;

    const exercises = state.searchModal.filteredExercises.map(ex => {
        const typeBadgeColor = getTypeBadgeColor(ex.type);
        return `
            <div class="exercise-search-item" onclick="addExerciseFromLibrary(${ex.id}, '${escapeHtml(ex.name)}', '${ex.type}')">
                <span class="exercise-name">${escapeHtml(ex.name)}</span>
                <span class="exercise-badge" style="background: ${typeBadgeColor}22; color: ${typeBadgeColor}; border: 1px solid ${typeBadgeColor}">${ex.type}</span>
            </div>
        `;
    }).join('');

    resultsDiv.innerHTML = exercises;
}

function closeExerciseSearchModal() {
    const modal = document.getElementById('exercise-search-modal');
    if (modal) {
        modal.remove();
    }
    state.searchModal.isOpen = false;
}

// Add selected exercise to current day
async function addExerciseFromLibrary(exerciseId, exerciseName, exerciseType) {
    try {
        // Create routine entry
        const orderIndex = state.exercises.length;
        const payload = {
            exercise_id: exerciseId,
            day_of_week: state.selectedDay,
            order_index: orderIndex,
            target_sets: exerciseType !== 'cardio' ? 3 : null,
            target_reps: exerciseType !== 'cardio' ? 10 : null,
            target_weight: exerciseType === 'weight' ? 0 : null,
            notes: exerciseType === 'cardio' ? '' : null
        };

        const res = await fetch('/api/routines', {
            method: 'POST',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify(payload)
        });

        if (!res.ok) {
            throw new Error('Failed to add exercise');
        }

        // Reload day data
        await loadDayData(state.selectedDay);
        renderWorkout();
        closeExerciseSearchModal();

    } catch (err) {
        console.error('Failed to add exercise:', err);
        alert('Failed to add exercise. Please try again.');
    }
}

function getTypeBadgeColor(type) {
    const colors = {
        weight: '#00E5FF',
        bodyweight: '#00C853',
        cardio: '#FF9800'
    };
    return colors[type] || '#888';
}

function escapeHtml(text) {
    const div = document.createElement('div');
    div.textContent = text;
    return div.innerHTML.replace(/'/g, '&#39;');
}
// Updated exercise modal functions for new API

window.openExerciseDetail = (index) => {
    state.modal.isOpen = true;
    state.modal.exerciseIndex = index;
    const exercise = state.exercises[index];
    state.modal.exerciseId = exercise.exercise_id;

    // Initialize current session
    state.modal.currentSession.sets = new Array(exercise.target_sets || 3).fill('');
    state.modal.currentSession.weight = exercise.current_weight || exercise.target_weight || 0;

    renderExerciseModal();
};

window.closeExerciseDetail = () => {
    state.modal.isOpen = false;
    state.modal.exerciseIndex = null;
    state.modal.exerciseId = null;
    state.modal.currentSession = { sets: [], weight: null };
    renderWorkout();
};

window.adjustWeight = (delta) => {
    state.modal.currentSession.weight = Math.max(0, state.modal.currentSession.weight + delta);
    renderExerciseModal();
};

window.updateSetReps = (setIndex, value) => {
    state.modal.currentSession.sets[setIndex] = value;
    updateModalStats();
};

window.adjustSetReps = (setIndex, delta) => {
    const input = document.querySelectorAll('.set-input')[setIndex];
    const exercise = state.exercises[state.modal.exerciseIndex];

    let currentValue;
    if (!input.value || input.value === '') {
        currentValue = exercise.target_reps;
    } else {
        currentValue = parseInt(input.value);
    }

    const newValue = Math.max(0, Math.min(99, currentValue + delta));
    input.value = newValue;
    updateSetReps(setIndex, newValue.toString());
};

window.autoFillTargetReps = (setIndex, targetReps) => {
    const input = document.querySelectorAll('.set-input')[setIndex];
    if (input && (!input.value || input.value === '')) {
        input.value = targetReps;
        state.modal.currentSession.sets[setIndex] = targetReps.toString();
        updateSetReps(setIndex, targetReps.toString());
    }
};

function updateModalStats() {
    const currentVolume = state.modal.currentSession.sets.reduce((sum, reps) => {
        const repsNum = parseInt(reps) || 0;
        return sum + (repsNum * state.modal.currentSession.weight);
    }, 0);

    const volumeElement = document.querySelector('.stat-value');
    if (volumeElement) {
        volumeElement.textContent = `${currentVolume} kg`;
    }
}

window.completeExerciseSession = async () => {
    const exerciseIndex = state.modal.exerciseIndex;
    const exercise = state.exercises[exerciseIndex];
    const today = getTodayDateString();

    // Validate that all sets have values
    const allSetsEntered = state.modal.currentSession.sets.every(reps => {
        const repsNum = parseInt(reps);
        return !isNaN(repsNum) && repsNum >= 0;
    });

    if (!allSetsEntered) {
        alert('Please enter reps for all sets before completing the session.');
        return;
    }

    // Convert sets to numbers
    const setsCompleted = state.modal.currentSession.sets.map(r => parseInt(r));

    // Check if session was successful (all sets met target)
    const isSuccessful = setsCompleted.every(reps => reps >= exercise.target_reps);

    // Calculate volume
    const volume = setsCompleted.reduce((sum, reps) => sum + reps, 0) * state.modal.currentSession.weight;

    try {
        // Create history entry via API
        const response = await fetch('/api/history', {
            method: 'POST',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify({
                exercise_id: exercise.exercise_id,
                session_date: today,
                weight: state.modal.currentSession.weight,
                sets_completed: setsCompleted,
                completed: isSuccessful,
                volume: volume
            })
        });

        if (!response.ok) {
            throw new Error('Failed to save session');
        }

        // Close modal and reload data
        closeExerciseDetail();
        await loadDayData(state.selectedDay);
        renderWorkout();

    } catch (err) {
        console.error('Failed to complete session:', err);
        alert('Failed to save workout session. Please try again.');
    }
};
// Phase 5: Global History & PR Tracking

// Updated to fetch history from API
window.openExerciseDetail = async (index) => {
    state.modal.isOpen = true;
    state.modal.exerciseIndex = index;
    const exercise = state.exercises[index];
    state.modal.exerciseId = exercise.exercise_id;

    // Initialize current session
    state.modal.currentSession.sets = new Array(exercise.target_sets || 3).fill('');
    state.modal.currentSession.weight = exercise.current_weight || exercise.target_weight || 0;

    // Fetch history and PR data from API
    try {
        const [historyRes, prRes] = await Promise.all([
            fetch(`/api/history/${exercise.exercise_id}`),
            fetch(`/api/history/${exercise.exercise_id}/pr`)
        ]);

        const historyData = await historyRes.json();
        const prData = await prRes.json();

        // Store in modal state
        state.modal.history = historyData.history || [];
        state.modal.pr = prData.pr || null;

        renderExerciseModal();
    } catch (err) {
        console.error('Failed to load history:', err);
        state.modal.history = [];
        state.modal.pr = null;
        renderExerciseModal();
    }
};

async function renderExerciseModal() {
    const exerciseIndex = state.modal.exerciseIndex;
    const exercise = state.exercises[exerciseIndex];
    const today = getTodayDateString();
    const history = state.modal.history || [];
    const pr = state.modal.pr;

    // Initialize current session if not set
    if (state.modal.currentSession.sets.length === 0) {
        state.modal.currentSession.sets = new Array(exercise.target_sets).fill('');
        state.modal.currentSession.weight = exercise.current_weight || exercise.target_weight || 0;
    }

    // Calculate if session is complete
    const allSetsComplete = state.modal.currentSession.sets.every((reps) => {
        const repsNum = parseInt(reps);
        return !isNaN(repsNum) && repsNum >= exercise.target_reps;
    });

    // Calculate current volume
    const currentVolume = state.modal.currentSession.sets.reduce((sum, reps) => {
        const repsNum = parseInt(reps) || 0;
        return sum + (repsNum * state.modal.currentSession.weight);
    }, 0);

    // Check if current session would be a PR
    const wouldBePR = pr && state.modal.currentSession.weight > pr.weight;

    const modalHTML = `
        <div class="modal-overlay" onclick="closeExerciseDetail()">
            <div class="modal-content" onclick="event.stopPropagation()">
                <div class="modal-header">
                    <h2>${exercise.name}</h2>
                    <button class="modal-close" onclick="closeExerciseDetail()" aria-label="Close">×</button>
                </div>

                <div class="modal-body">
                    <!-- Weight Control -->
                    <div class="weight-section">
                        <label>Current Weight</label>
                        <div class="weight-control">
                            <button class="weight-btn" onclick="adjustWeight(-0.5)">-</button>
                            <span class="weight-display">${state.modal.currentSession.weight} kg</span>
                            <button class="weight-btn" onclick="adjustWeight(0.5)">+</button>
                        </div>
                        <div class="target-display">Target: ${exercise.target_sets}×${exercise.target_reps}</div>
                        ${pr ? `<div class="pr-display">PR: ${pr.weight}kg (${pr.date})</div>` : ''}
                        ${wouldBePR ? `<div class="pr-badge-current">🏆 New PR!</div>` : ''}
                    </div>

                    <!-- Progression Status -->
                    ${exercise.ready_to_progress ? `
                        <div class="progression-alert">
                            <span class="progress-icon">🎯</span>
                            <div>
                                <strong>Ready to increase weight!</strong>
                                <p>${exercise.consecutive_successes} consecutive successful sessions</p>
                            </div>
                        </div>
                    ` : exercise.consecutive_successes > 0 ? `
                        <div class="progression-info">
                            <span>${exercise.consecutive_successes}/3 successful sessions</span>
                        </div>
                    ` : ''}

                    <!-- Set Tracker -->
                    <div class="set-tracker-section">
                        <label>Today's Sets</label>
                        <div class="set-tracker">
                            ${state.modal.currentSession.sets.map((_, idx) => `
                                <div class="set-input-group">
                                    <label>Set ${idx + 1}</label>
                                    <div class="set-input-controls">
                                        <button class="set-adjust-btn" onclick="adjustSetReps(${idx}, -1)">-</button>
                                        <input
                                            type="number"
                                            class="set-input"
                                            placeholder="${exercise.target_reps}"
                                            value="${state.modal.currentSession.sets[idx]}"
                                            oninput="updateSetReps(${idx}, this.value)"
                                            onfocus="autoFillTargetReps(${idx}, ${exercise.target_reps})"
                                            min="0"
                                            max="99"
                                        >
                                        <button class="set-adjust-btn" onclick="adjustSetReps(${idx}, 1)">+</button>
                                    </div>
                                    <span class="reps-label">reps</span>
                                </div>
                            `).join('')}
                        </div>

                        <div class="session-stats">
                            <div class="stat">
                                <span class="stat-label">Volume</span>
                                <span class="stat-value">${currentVolume} kg</span>
                            </div>
                            <div class="stat">
                                <span class="stat-label">Status</span>
                                <span class="stat-value ${allSetsComplete ? 'success' : 'incomplete'}">
                                    ${allSetsComplete ? '✓ Complete' : 'Incomplete'}
                                </span>
                            </div>
                        </div>

                        <button class="btn-primary btn-complete" onclick="completeExerciseSession()">
                            Complete Session
                        </button>
                    </div>

                    <!-- History Section -->
                    ${history.length > 0 ? `
                        <div class="history-section">
                            <h3>History (${history.length} sessions)</h3>

                            <!-- Weight Progression Graph -->
                            <div class="graph-container">
                                <canvas id="weight-graph" width="400" height="200"></canvas>
                            </div>

                            <!-- Recent Sessions -->
                            <div class="history-list">
                                ${history.slice(0, 5).map(session => `
                                    <div class="history-card ${session.completed ? 'completed' : 'incomplete'}">
                                        <div class="history-header">
                                            <span class="history-date">${session.session_date}</span>
                                            <span class="history-status">${session.completed ? '✓' : '✗'}</span>
                                            ${session.is_pr ? '<span class="pr-badge">🏆 PR</span>' : ''}
                                        </div>
                                        <div class="history-details">
                                            <span>${session.weight}kg</span>
                                            <span class="history-sets">${session.sets_completed.join(', ')} reps</span>
                                            <span class="history-volume">${session.volume}kg total</span>
                                        </div>
                                    </div>
                                `).join('')}
                            </div>
                        </div>
                    ` : '<div class="no-history">No history yet. Complete your first session!</div>'}
                </div>
            </div>
        </div>
    `;

    dom.workoutContainer.insertAdjacentHTML('beforeend', modalHTML);

    // Render graph if there's history
    if (history.length > 0) {
        setTimeout(() => renderWeightGraph(history, pr), 0);
    }
}

// Updated graph rendering with PR line
function renderWeightGraph(history, pr) {
    const canvas = document.getElementById('weight-graph');
    if (!canvas) return;

    const ctx = canvas.getContext('2d');
    const width = canvas.width;
    const height = canvas.height;
    const padding = 40;

    // Clear canvas
    ctx.clearRect(0, 0, width, height);

    // Use last 20 sessions for graph (or all if less)
    const graphHistory = history.slice(-20);
    const weights = graphHistory.map(s => s.weight);

    if (weights.length === 0) return;

    // Determine Y-axis range
    let minWeight = Math.min(...weights);
    let maxWeight = Math.max(...weights);

    // Include PR in range if it exists
    if (pr && pr.weight) {
        minWeight = Math.min(minWeight, pr.weight);
        maxWeight = Math.max(maxWeight, pr.weight);
    }

    // Add padding to range (use minimum range of 10 for single data points)
    const range = maxWeight - minWeight || 10;
    minWeight = Math.max(0, minWeight - range * 0.1);
    maxWeight = maxWeight + range * 0.1;

    const graphWidth = width - 2 * padding;
    const graphHeight = height - 2 * padding;

    // Draw axes
    ctx.strokeStyle = '#333';
    ctx.lineWidth = 1;
    ctx.beginPath();
    ctx.moveTo(padding, padding);
    ctx.lineTo(padding, height - padding);
    ctx.lineTo(width - padding, height - padding);
    ctx.stroke();

    // Draw grid lines
    ctx.strokeStyle = '#222';
    ctx.lineWidth = 0.5;
    for (let i = 0; i <= 4; i++) {
        const y = padding + (graphHeight * i) / 4;
        ctx.beginPath();
        ctx.moveTo(padding, y);
        ctx.lineTo(width - padding, y);
        ctx.stroke();

        // Y-axis labels
        const weightValue = maxWeight - (maxWeight - minWeight) * (i / 4);
        ctx.fillStyle = '#888';
        ctx.font = '12px sans-serif';
        ctx.textAlign = 'right';
        ctx.fillText(weightValue.toFixed(1), padding - 5, y + 4);
    }

    // Draw PR line (horizontal dashed line)
    if (pr && pr.weight) {
        const prY = padding + graphHeight * (1 - (pr.weight - minWeight) / (maxWeight - minWeight));

        ctx.strokeStyle = '#FF5252';
        ctx.lineWidth = 2;
        ctx.setLineDash([5, 5]);
        ctx.beginPath();
        ctx.moveTo(padding, prY);
        ctx.lineTo(width - padding, prY);
        ctx.stroke();
        ctx.setLineDash([]);

        // PR label
        ctx.fillStyle = '#FF5252';
        ctx.font = 'bold 12px sans-serif';
        ctx.textAlign = 'left';
        ctx.fillText(`PR: ${pr.weight}kg`, padding + 5, prY - 5);
    }

    // Plot data points and line
    ctx.strokeStyle = '#00E5FF';
    ctx.fillStyle = '#00E5FF';
    ctx.lineWidth = 3;

    ctx.beginPath();
    graphHistory.forEach((session, idx) => {
        // For single data point, center it. Otherwise, space evenly.
        const x = graphHistory.length === 1
            ? padding + graphWidth / 2
            : padding + (graphWidth * idx) / (graphHistory.length - 1);
        const y = padding + graphHeight * (1 - (session.weight - minWeight) / (maxWeight - minWeight));

        if (idx === 0) {
            ctx.moveTo(x, y);
        } else {
            ctx.lineTo(x, y);
        }
    });
    ctx.stroke();

    // Draw data points
    graphHistory.forEach((session, idx) => {
        // For single data point, center it. Otherwise, space evenly.
        const x = graphHistory.length === 1
            ? padding + graphWidth / 2
            : padding + (graphWidth * idx) / (graphHistory.length - 1);
        const y = padding + graphHeight * (1 - (session.weight - minWeight) / (maxWeight - minWeight));

        ctx.beginPath();
        ctx.arc(x, y, 5, 0, 2 * Math.PI);
        ctx.fill();

        // Weight label above point
        ctx.fillStyle = '#00E5FF';
        ctx.font = '11px sans-serif';
        ctx.textAlign = 'center';
        ctx.fillText(session.weight, x, y - 10);
    });
}

// ============================================
// Phase 6: Polish & UX Improvements
// ============================================

// Show loading overlay
function showLoading() {
    const existing = document.getElementById('loading-overlay');
    if (existing) return;

    const overlay = document.createElement('div');
    overlay.id = 'loading-overlay';
    overlay.className = 'loading-overlay';
    overlay.innerHTML = '<div class="loading-spinner"></div>';
    document.body.appendChild(overlay);
}

// Hide loading overlay
function hideLoading() {
    const overlay = document.getElementById('loading-overlay');
    if (overlay) {
        overlay.remove();
    }
}

// Show toast notification
function showToast(message, type = 'success') {
    const toast = document.createElement('div');
    toast.className = `toast ${type}`;
    toast.textContent = message;
    document.body.appendChild(toast);

    setTimeout(() => {
        toast.style.animation = 'slideDown 0.3s ease-out';
        toast.style.opacity = '0';
        setTimeout(() => toast.remove(), 300);
    }, 3000);
}

// Enhanced error handling
function handleError(error, userMessage = 'An error occurred') {
    console.error(error);
    showToast(userMessage, 'error');
    hideLoading();
}

// Wrap API calls with loading states
async function apiCall(url, options = {}, showLoadingIndicator = false) {
    if (showLoadingIndicator) showLoading();

    try {
        const response = await fetch(url, options);
        if (!response.ok) {
            throw new Error(`HTTP ${response.status}: ${response.statusText}`);
        }
        return response;
    } catch (error) {
        throw error;
    } finally {
        if (showLoadingIndicator) hideLoading();
    }
}
