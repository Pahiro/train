const state = {
    data: null,
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
        currentSession: {
            sets: [],
            weight: null
        }
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
        const res = await fetch('/api/training');
        state.data = await res.json();

        // precise day selection
        const days = ['Sunday', 'Monday', 'Tuesday', 'Wednesday', 'Thursday', 'Friday', 'Saturday'];
        state.selectedDay = days[new Date().getDay()];

        // MIGRATION: Convert old data formats to new schema
        migrateData();

        renderDaySelector();
        renderWorkout();
        dom.loading.style.display = 'none';

        dom.daySelector.addEventListener('change', (e) => {
            state.selectedDay = e.target.value;
            state.isEditing = false;
            renderWorkout();
        });

    } catch (err) {
        console.error('Failed to init:', err);
        dom.workoutContainer.innerHTML = '<p>Error loading data. Please reload.</p>';
    }
}

function migrateData() {
    // Enhanced Schema Migration:
    // 1. String -> Object { text, lastDone: null }
    // 2. Boolean done -> lastDone: "YYYY-MM-DD"
    // 3. Detect exercise type (weight vs cardio)
    // 4. Initialize weight tracking schema for weight exercises

    const today = getTodayDateString();

    for (const day in state.data) {
        state.data[day].exercises = state.data[day].exercises.map(ex => {
            let baseEx;

            // Case 1: Simple string
            if (typeof ex === 'string') {
                baseEx = { text: ex, lastDone: null };
            }
            // Case 2: Old boolean 'done' style
            else if (ex.hasOwnProperty('done')) {
                baseEx = {
                    text: ex.text,
                    lastDone: ex.done ? today : null
                };
            }
            // Case 3: Already has lastDone
            else {
                baseEx = ex;
            }

            // If already migrated to new schema, return as-is
            if (baseEx.type && baseEx.history !== undefined) {
                return baseEx;
            }

            // Parse exercise text to determine type
            const parsed = parseExerciseText(baseEx.text);

            if (parsed.type === 'weight') {
                // Initialize weight tracking schema
                return {
                    text: baseEx.text,
                    type: 'weight',
                    name: parsed.name,
                    target: {
                        sets: parsed.sets,
                        reps: parsed.reps
                    },
                    currentWeight: parsed.weight,
                    lastDone: baseEx.lastDone,
                    history: baseEx.history || [],
                    consecutiveSuccesses: baseEx.consecutiveSuccesses || 0,
                    readyToProgress: baseEx.readyToProgress || false
                };
            } else {
                // Cardio exercise - keep simple
                return {
                    text: baseEx.text,
                    type: 'cardio',
                    lastDone: baseEx.lastDone
                };
            }
        });
    }

    // Save migrated data
    saveData();
}

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
    const days = Object.keys(state.data);
    dom.daySelector.innerHTML = days.map(day =>
        `<option value="${day}" ${day === state.selectedDay ? 'selected' : ''}>${day}</option>`
    ).join('');
}

function renderWorkout() {
    if (!state.data || !state.selectedDay) return;

    const dayData = state.data[state.selectedDay];
    const today = getTodayDateString();

    let content = '';

    if (state.isEditing) {
        content += `<input type="text" id="day-title-input" value="${dayData.title}" class="title-input" aria-label="Day Title">`;
        content += `
            <div class="edit-mode">
                <ul id="exercise-list">
                    ${dayData.exercises.map((ex, idx) => {
            const isWeight = ex.type === 'weight';
            return `
                        <li draggable="true" data-index="${idx}" class="draggable-item edit-item">
                            <div class="edit-item-header">
                                <span class="drag-handle" aria-label="Drag to reorder">::</span>
                                <select class="type-selector" onchange="toggleExerciseType(${idx}, this.value)">
                                    <option value="cardio" ${!isWeight ? 'selected' : ''}>Cardio (Text)</option>
                                    <option value="weight" ${isWeight ? 'selected' : ''}>Weight Training</option>
                                </select>
                                <button class="btn-remove" onclick="removeExercise(${idx})" aria-label="Remove exercise">×</button>
                            </div>

                            <div class="edit-item-body">
                                ${isWeight ? `
                                    <div class="edit-field">
                                        <label>Exercise Name</label>
                                        <input type="text" class="edit-input ex-name" value="${ex.name || ''}" placeholder="e.g. Leg Press" data-index="${idx}">
                                    </div>
                                    <div class="edit-weight-grid">
                                        <div class="edit-field">
                                            <label>Sets</label>
                                            <input type="number" class="edit-input ex-sets" value="${ex.target?.sets || 3}" placeholder="3" data-index="${idx}">
                                        </div>
                                        <div class="edit-field">
                                            <label>Reps</label>
                                            <input type="number" class="edit-input ex-reps" value="${ex.target?.reps || 10}" placeholder="10" data-index="${idx}">
                                        </div>
                                        <div class="edit-field">
                                            <label>Weight (kg)</label>
                                            <input type="number" class="edit-input ex-weight" value="${ex.currentWeight || 0}" step="0.5" placeholder="0" data-index="${idx}">
                                        </div>
                                    </div>
                                ` : `
                                    <input type="text" value="${ex.text}" data-index="${idx}" class="exercise-input" aria-label="Exercise Text" placeholder="e.g. 30 mins treadmill">
                                `}
                            </div>
                        </li>
                    `}).join('')}
                </ul>
                <div class="edit-actions">
                    <button class="btn-add" onclick="addExercise()">+ Add Exercise</button>
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
        content += `<h2>${dayData.title}</h2>`;
        content += `
            <ul>
                ${dayData.exercises.map((ex, idx) => {
            const isDone = ex.lastDone === today;

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
                                    ${ex.target.sets}×${ex.target.reps} @ ${ex.currentWeight}kg
                                    ${ex.readyToProgress ? '<span class="progress-badge">📈 Ready!</span>' : ''}
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
                                ${ex.text}
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
    const exercise = state.data[state.selectedDay].exercises[exerciseIndex];
    const today = getTodayDateString();

    // Initialize current session if not set
    if (state.modal.currentSession.sets.length === 0) {
        state.modal.currentSession.sets = new Array(exercise.target.sets).fill('');
        state.modal.currentSession.weight = exercise.currentWeight;
    }

    // Calculate if session is complete
    const allSetsComplete = state.modal.currentSession.sets.every((reps, idx) => {
        const repsNum = parseInt(reps);
        return !isNaN(repsNum) && repsNum >= exercise.target.reps;
    });

    // Calculate current volume
    const currentVolume = state.modal.currentSession.sets.reduce((sum, reps) => {
        const repsNum = parseInt(reps) || 0;
        return sum + (repsNum * state.modal.currentSession.weight);
    }, 0);

    // Get last 10 history entries for graph
    const historyForGraph = exercise.history.slice(-10);

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
                        <div class="target-display">Target: ${exercise.target.sets}×${exercise.target.reps}</div>
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
                                            placeholder="${exercise.target.reps}"
                                            value="${state.modal.currentSession.sets[idx]}"
                                            oninput="updateSetReps(${idx}, this.value)"
                                            onfocus="autoFillTargetReps(${idx}, ${exercise.target.reps})"
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
                    ${exercise.history.length > 0 ? `
                        <div class="history-section">
                            <h3>History</h3>
                            
                            <!-- Weight Progression Graph -->
                            <div class="graph-container">
                                <canvas id="weight-graph" width="400" height="200"></canvas>
                            </div>
                            
                            <!-- Recent Sessions -->
                            <div class="history-list">
                                ${exercise.history.slice(-5).reverse().map(session => `
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
function renderWeightGraph(history) {
    const canvas = document.getElementById('weight-graph');
    if (!canvas) return;

    const ctx = canvas.getContext('2d');
    const width = canvas.width;
    const height = canvas.height;
    const padding = 40;

    // Clear canvas
    ctx.clearRect(0, 0, width, height);

    // Get data points
    const weights = history.map(h => h.weight);
    const dates = history.map(h => h.date);
    const minWeight = Math.min(...weights) - 5;
    const maxWeight = Math.max(...weights) + 5;

    // Draw axes
    ctx.strokeStyle = '#333';
    ctx.lineWidth = 2;
    ctx.beginPath();
    ctx.moveTo(padding, padding);
    ctx.lineTo(padding, height - padding);
    ctx.lineTo(width - padding, height - padding);
    ctx.stroke();

    // Draw grid lines
    ctx.strokeStyle = '#222';
    ctx.lineWidth = 1;
    for (let i = 0; i <= 4; i++) {
        const y = padding + (height - 2 * padding) * i / 4;
        ctx.beginPath();
        ctx.moveTo(padding, y);
        ctx.lineTo(width - padding, y);
        ctx.stroke();
    }

    // Draw data line
    ctx.strokeStyle = '#00E5FF';
    ctx.lineWidth = 3;
    ctx.beginPath();

    history.forEach((h, idx) => {
        const x = padding + (width - 2 * padding) * idx / (history.length - 1 || 1);
        const y = height - padding - ((h.weight - minWeight) / (maxWeight - minWeight)) * (height - 2 * padding);

        if (idx === 0) {
            ctx.moveTo(x, y);
        } else {
            ctx.lineTo(x, y);
        }
    });
    ctx.stroke();

    // Draw data points
    ctx.fillStyle = '#00E5FF';
    history.forEach((h, idx) => {
        const x = padding + (width - 2 * padding) * idx / (history.length - 1 || 1);
        const y = height - padding - ((h.weight - minWeight) / (maxWeight - minWeight)) * (height - 2 * padding);

        ctx.beginPath();
        ctx.arc(x, y, 5, 0, 2 * Math.PI);
        ctx.fill();

        // Draw weight label
        ctx.fillStyle = '#FFF';
        ctx.font = '12px sans-serif';
        ctx.textAlign = 'center';
        ctx.fillText(`${h.weight}`, x, y - 10);
        ctx.fillStyle = '#00E5FF';
    });

    // Draw y-axis labels
    ctx.fillStyle = '#AAA';
    ctx.font = '12px sans-serif';
    ctx.textAlign = 'right';
    for (let i = 0; i <= 4; i++) {
        const weight = minWeight + (maxWeight - minWeight) * (4 - i) / 4;
        const y = padding + (height - 2 * padding) * i / 4;
        ctx.fillText(weight.toFixed(0), padding - 10, y + 5);
    }
}


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

// Modal Control Functions
window.openExerciseDetail = (index) => {
    state.modal.isOpen = true;
    state.modal.exerciseIndex = index;
    state.modal.currentSession.sets = [];
    state.modal.currentSession.weight = null;
    renderWorkout();
};

window.closeExerciseDetail = () => {
    state.modal.isOpen = false;
    state.modal.exerciseIndex = null;
    state.modal.currentSession.sets = [];
    state.modal.currentSession.weight = null;

    // Remove modal from DOM
    const modalContainer = document.getElementById('exercise-modal');
    if (modalContainer) {
        modalContainer.remove();
    }
};

window.adjustWeight = (delta) => {
    state.modal.currentSession.weight = Math.max(0, state.modal.currentSession.weight + delta);

    // Update the weight display without full re-render
    const weightDisplay = document.querySelector('.weight-display');
    if (weightDisplay) {
        weightDisplay.textContent = `${state.modal.currentSession.weight} kg`;
    }

    // Recalculate and update volume
    const exerciseIndex = state.modal.exerciseIndex;
    const exercise = state.data[state.selectedDay].exercises[exerciseIndex];

    const currentVolume = state.modal.currentSession.sets.reduce((sum, reps) => {
        const repsNum = parseInt(reps) || 0;
        return sum + (repsNum * state.modal.currentSession.weight);
    }, 0);

    const volumeElement = document.querySelector('.stat-value');
    if (volumeElement) {
        volumeElement.textContent = `${currentVolume} kg`;
    }

    // Update the exercise's current weight for persistence
    const exerciseObj = state.data[state.selectedDay].exercises[exerciseIndex];
    exerciseObj.currentWeight = state.modal.currentSession.weight;
    exerciseObj.text = `${exerciseObj.name}: ${exerciseObj.target.sets}x${exerciseObj.target.reps}@${exerciseObj.currentWeight}`;
    saveData();
};

window.updateSetReps = (setIndex, value) => {
    state.modal.currentSession.sets[setIndex] = value;

    // Update stats without full re-render to preserve input focus
    const exerciseIndex = state.modal.exerciseIndex;
    const exercise = state.data[state.selectedDay].exercises[exerciseIndex];

    // Calculate if session is complete
    const allSetsComplete = state.modal.currentSession.sets.every((reps) => {
        const repsNum = parseInt(reps);
        return !isNaN(repsNum) && repsNum >= exercise.target.reps;
    });

    // Calculate current volume
    const currentVolume = state.modal.currentSession.sets.reduce((sum, reps) => {
        const repsNum = parseInt(reps) || 0;
        return sum + (repsNum * state.modal.currentSession.weight);
    }, 0);

    // Update volume display
    const volumeElement = document.querySelector('.stat-value');
    if (volumeElement) {
        volumeElement.textContent = `${currentVolume} kg`;
    }

    // Update status display
    const statusElement = document.querySelectorAll('.stat-value')[1];
    if (statusElement) {
        statusElement.textContent = allSetsComplete ? '✓ Complete' : 'Incomplete';
        statusElement.className = 'stat-value ' + (allSetsComplete ? 'success' : 'incomplete');
    }
};

window.autoFillTargetReps = (setIndex, targetReps) => {
    const input = document.querySelectorAll('.set-input')[setIndex];
    if (input && (!input.value || input.value === '')) {
        input.value = targetReps;
        state.modal.currentSession.sets[setIndex] = targetReps.toString();
        updateSetReps(setIndex, targetReps.toString());
    }
};

window.adjustSetReps = (setIndex, delta) => {
    const input = document.querySelectorAll('.set-input')[setIndex];
    const exerciseIndex = state.modal.exerciseIndex;
    const exercise = state.data[state.selectedDay].exercises[exerciseIndex];

    // If field is empty, start from target value
    let currentValue;
    if (!input.value || input.value === '') {
        currentValue = exercise.target.reps;
    } else {
        currentValue = parseInt(input.value);
    }

    const newValue = Math.max(0, Math.min(99, currentValue + delta));
    input.value = newValue;
    updateSetReps(setIndex, newValue.toString());
};

window.completeExerciseSession = () => {
    const exerciseIndex = state.modal.exerciseIndex;
    const exercise = state.data[state.selectedDay].exercises[exerciseIndex];
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
    const isSuccessful = setsCompleted.every(reps => reps >= exercise.target.reps);

    // Calculate volume
    const volume = setsCompleted.reduce((sum, reps) => sum + reps, 0) * state.modal.currentSession.weight;

    // Create history entry
    const historyEntry = {
        date: today,
        weight: state.modal.currentSession.weight,
        sets: setsCompleted,
        completed: isSuccessful,
        volume: volume
    };

    // Add to history
    exercise.history.push(historyEntry);

    // Update current weight if changed
    exercise.currentWeight = state.modal.currentSession.weight;

    // Update text to reflect new weight
    exercise.text = `${exercise.name}: ${exercise.target.sets}x${exercise.target.reps}@${exercise.currentWeight}`;

    // Update lastDone
    exercise.lastDone = today;

    // Update consecutive successes and progression status
    if (isSuccessful) {
        exercise.consecutiveSuccesses++;

        // Check if ready to progress (3+ consecutive successes)
        if (exercise.consecutiveSuccesses >= 3) {
            exercise.readyToProgress = true;
        }
    } else {
        exercise.consecutiveSuccesses = 0;
        exercise.readyToProgress = false;
    }

    // If weight was increased, reset progression tracking
    const lastHistoryWeight = exercise.history.length > 1 ? exercise.history[exercise.history.length - 2].weight : 0;
    if (state.modal.currentSession.weight > lastHistoryWeight) {
        exercise.consecutiveSuccesses = isSuccessful ? 1 : 0;
        exercise.readyToProgress = false;
    }

    // Save data
    saveData();

    // Close modal and refresh
    closeExerciseDetail();
    renderWorkout();

    // Vibrate feedback
    navigator.vibrate?.([50, 100, 50]);
};


// Global handlers
window.toggleExercise = (index) => {
    const dayData = state.data[state.selectedDay];
    const ex = dayData.exercises[index];
    const today = getTodayDateString();

    // Toggle logic: If done today, clear it. Else, set to today.
    if (ex.lastDone === today) {
        ex.lastDone = null;
    } else {
        ex.lastDone = today;
    }

    fetch('/api/training', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(state.data)
    });

    renderWorkout();
};

window.startEditing = () => {
    state.isEditing = true;
    renderWorkout();
};

window.removeExercise = (index) => {
    updateStateFromInputs();
    state.data[state.selectedDay].exercises.splice(index, 1);
    renderWorkout();
};

window.addExercise = () => {
    updateStateFromInputs();
    state.data[state.selectedDay].exercises.push({ text: '', lastDone: null });
    renderWorkout();
};

window.saveChanges = async () => {
    updateStateFromInputs();
    state.isEditing = false;
    renderWorkout();

    try {
        await fetch('/api/training', {
            method: 'POST',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify(state.data)
        });
    } catch (err) {
        alert('Failed to save changes!');
        console.error(err);
    }
};

window.toggleExerciseType = (index, newType) => {
    updateStateFromInputs();

    const ex = state.data[state.selectedDay].exercises[index];
    ex.type = newType;

    if (newType === 'weight') {
        // Initialize defaults if missing
        if (!ex.target) ex.target = { sets: 3, reps: 10 };
        if (!ex.currentWeight) ex.currentWeight = 0;
        if (!ex.name) ex.name = ex.text;
        if (!ex.history) ex.history = [];
    } else {
        // Switching back to cardio/text
        // Ensure text field is populated (name usually holds the text for weight exercises)
        if (ex.name && !ex.text) ex.text = ex.name;
    }

    renderWorkout();
};

function updateStateFromInputs() {
    if (!state.isEditing) return;

    const titleInput = document.getElementById('day-title-input');
    if (titleInput) {
        state.data[state.selectedDay].title = titleInput.value;
    }

    // We need to iterate over the current exercises to find their corresponding inputs
    const exercises = state.data[state.selectedDay].exercises;

    exercises.forEach((ex, idx) => {
        // Check if we have weight inputs for this index
        const nameInput = document.querySelector(`.ex-name[data-index="${idx}"]`);

        if (nameInput) {
            // It's in weight mode
            const setsInput = document.querySelector(`.ex-sets[data-index="${idx}"]`);
            const repsInput = document.querySelector(`.ex-reps[data-index="${idx}"]`);
            const weightInput = document.querySelector(`.ex-weight[data-index="${idx}"]`);

            ex.name = nameInput.value;
            ex.target = {
                sets: parseInt(setsInput.value) || 0,
                reps: parseInt(repsInput.value) || 0
            };
            ex.currentWeight = parseFloat(weightInput.value) || 0;
            ex.type = 'weight';

            // Sync text field for compatibility
            ex.text = `${ex.name}: ${ex.target.sets}x${ex.target.reps}@${ex.currentWeight}`;
        } else {
            // It's in cardio/text mode
            const textInput = document.querySelector(`.exercise-input[data-index="${idx}"]`);
            if (textInput) {
                ex.text = textInput.value;
                ex.type = 'cardio';
            }
        }
    });
}

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

function handleDrop(e) {
    e.preventDefault();
    e.stopPropagation();

    const target = e.target.closest('.draggable-item');
    if (!target) return;

    const dropIndex = parseInt(target.dataset.index);
    const dragIndex = state.dragState.draggedIndex;

    if (dragIndex !== null && dragIndex !== dropIndex) {
        // Update state from inputs before reordering
        updateStateFromInputs();

        // Reorder the exercises array
        const exercises = state.data[state.selectedDay].exercises;
        const [draggedItem] = exercises.splice(dragIndex, 1);
        exercises.splice(dropIndex, 0, draggedItem);

        // Re-render
        renderWorkout();
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
