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
        sessionDrafts: {},
        history: [],
        historyPage: 0,
        pr: null
    },
    searchModal: {
        isOpen: false,
        exercises: [],
        filteredExercises: [],
        searchQuery: ''
    }
};

const SESSION_DRAFTS_STORAGE_KEY = 'train-session-drafts-v1';

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

const dom = {
    daySelector: document.getElementById('day-selector'),
    workoutContainer: document.getElementById('workout-container'),
    loading: document.getElementById('loading'),
    timerFab: document.getElementById('timer-fab')
};

async function init() {
    try {
        loadSessionDraftsFromStorage();

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
            const isWeight = ex.type === 'weight' || ex.type === 'assisted';
            return `
                        <li data-index="${idx}" class="draggable-item edit-item">
                            <div class="edit-item-header">
                                <span class="drag-handle" aria-label="Drag to reorder">::</span>
                                <span class="exercise-type-label">${isWeight ? 'Weight Training' : 'Cardio'}</span>
                                <button class="btn-remove" onclick="removeExercise(${idx})" aria-label="Remove exercise">×</button>
                            </div>

                            <div class="edit-item-body">
                                ${isWeight ? `
                                    <div class="edit-field exercise-name-display">
                                        <strong>${ex.name}</strong>
                                        <small style="color: var(--text-secondary); font-size: 12px;">
                                            ${ex.target_sets || 3}×${ex.target_reps || 10} @ ${ex.target_weight || 0}kg
                                            — Edit targets in the Exercise Library
                                        </small>
                                    </div>
                                ` : `
                                    <div class="edit-field exercise-name-display">
                                        <strong>${ex.name}</strong>
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
            if (ex.type === 'weight' || ex.type === 'assisted') {
                const categoryIcon = getCategoryIndicator(ex.category);
                return `
                    <li>
                        <div class="exercise-item weight-exercise" onclick="openExerciseDetail(${idx})">
                            <input type="checkbox" class="exercise-checkbox" 
                                ${isDone ? 'checked' : ''} 
                                onclick="event.stopPropagation(); event.preventDefault();"
                            >
                            <div class="exercise-content">
                                <div class="exercise-name-row">
                                    <span class="exercise-text ${isDone ? 'done' : ''}">
                                        ${ex.name}
                                    </span>
                                    ${categoryIcon ? `<span class="exercise-category-indicator" title="${ex.category}" aria-label="${ex.category}">${categoryIcon}</span>` : ''}
                                </div>
                                <span class="exercise-meta">
                                    ${ex.target_sets}×${ex.target_reps} @ ${ex.target_weight || 0}kg
                                    ${ex.ready_to_progress ? `<span class="progress-badge">${ex.type === 'assisted' ? '📉 Ready!' : '📈 Ready!'}</span>` : ''}
                                </span>
                            </div>
                            <svg class="chevron-icon" viewBox="0 0 24 24" width="20" height="20" stroke="currentColor" stroke-width="2" fill="none">
                                <polyline points="9 18 15 12 9 6"></polyline>
                            </svg>
                        </div>
                    </li>
                `;
            }
            // Bodyweight exercise - clickable for detail view (reps tracking)
            else if (ex.type === 'bodyweight') {
                const categoryIcon = getCategoryIndicator(ex.category);
                return `
                    <li>
                        <div class="exercise-item weight-exercise" onclick="openExerciseDetail(${idx})">
                            <input type="checkbox" class="exercise-checkbox" 
                                ${isDone ? 'checked' : ''} 
                                onclick="event.stopPropagation(); event.preventDefault();"
                            >
                            <div class="exercise-content">
                                <div class="exercise-name-row">
                                    <span class="exercise-text ${isDone ? 'done' : ''}">
                                        ${ex.name}
                                    </span>
                                    ${categoryIcon ? `<span class="exercise-category-indicator" title="${ex.category}" aria-label="${ex.category}">${categoryIcon}</span>` : ''}
                                </div>
                                <span class="exercise-meta">
                                    ${ex.target_sets}×${ex.target_reps} reps
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

    // Extract date part from ISO datetime
    const lastDoneDate = ex.last_done ? ex.last_done.split('T')[0] : null;

    // Toggle logic: If done today, delete today's history entry. Else, create one.
    if (lastDoneDate === today) {
        // Find and delete today's history entry
        try {
            // We need to find the history ID for today's entry
            const historyRes = await fetch(`/api/history/${ex.exercise_id}`);
            const historyData = await historyRes.json();
            const todayEntry = historyData.history.find(h => h.session_date === today || h.session_date.startsWith(today));
            
            if (todayEntry) {
                await fetch(`/api/history/${todayEntry.id}`, {
                    method: 'DELETE'
                });
            }

            // Reload data
            await loadDayData(state.selectedDay);
            renderWorkout();
        } catch (err) {
            console.error('Failed to toggle exercise:', err);
        }
    } else {
        // Create new history entry for today
        try {
            await fetch('/api/history', {
                method: 'POST',
                headers: { 'Content-Type': 'application/json' },
                body: JSON.stringify({
                    exercise_id: ex.exercise_id,
                    session_date: today,
                    weight: 0,
                    sets_completed: [1],  // Simple completion marker for cardio
                    completed: true,
                    volume: 0
                })
            });

            // Reload data
            await loadDayData(state.selectedDay);
            renderWorkout();
        } catch (err) {
            console.error('Failed to toggle exercise:', err);
        }
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

        // Update each exercise's notes from form inputs (targets are now on the exercise, not the routine)
        const exercises = state.exercises;
        for (let i = 0; i < exercises.length; i++) {
            const ex = exercises[i];

            if (ex.type === 'cardio') {
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

// Drag and Drop Functions (pointer-based for touch + mouse support)
function attachDragListeners() {
    const list = document.getElementById('exercise-list');
    if (!list) return;

    list.querySelectorAll('.drag-handle').forEach(handle => {
        handle.addEventListener('pointerdown', onDragPointerDown);
    });
}

function onDragPointerDown(e) {
    if (e.button !== 0) return; // primary pointer only
    e.preventDefault();

    const handle = e.currentTarget;
    const dragEl = handle.closest('.draggable-item');
    const list = document.getElementById('exercise-list');
    if (!dragEl || !list) return;

    // Capture pointer so we get events even outside the element
    handle.setPointerCapture(e.pointerId);

    const items = [...list.children];
    if (items.length < 2) return; // nothing to reorder

    const fromIndex = items.indexOf(dragEl);
    const itemRects = items.map(el => el.getBoundingClientRect());
    const startY = e.clientY;

    // Calculate item slot height from actual positions
    const itemHeight = items.length > 1
        ? itemRects[1].top - itemRects[0].top
        : itemRects[0].height + 12;

    let toIndex = fromIndex;

    dragEl.classList.add('dragging');

    function onMove(ev) {
        const dy = ev.clientY - startY;

        // Move dragged element with pointer
        dragEl.style.transform = `translateY(${dy}px)`;

        // Calculate target index from displacement
        let newTo = fromIndex + Math.round(dy / itemHeight);
        newTo = Math.max(0, Math.min(items.length - 1, newTo));

        if (newTo !== toIndex) {
            toIndex = newTo;

            // Shift other items to create a visual gap
            items.forEach((item, i) => {
                if (i === fromIndex) return;
                let shift = 0;
                if (fromIndex < toIndex && i > fromIndex && i <= toIndex) {
                    shift = -itemHeight; // shift up
                } else if (fromIndex > toIndex && i >= toIndex && i < fromIndex) {
                    shift = itemHeight;  // shift down
                }
                item.style.transform = shift ? `translateY(${shift}px)` : '';
            });
        }
    }

    async function onEnd() {
        handle.removeEventListener('pointermove', onMove);
        handle.removeEventListener('pointerup', onEnd);
        handle.removeEventListener('pointercancel', onEnd);

        // Clear all transforms and classes
        items.forEach(item => {
            item.style.transform = '';
            item.classList.remove('dragging');
        });

        if (fromIndex !== toIndex) {
            // Reorder local state
            const exercises = [...state.exercises];
            const [moved] = exercises.splice(fromIndex, 1);
            exercises.splice(toIndex, 0, moved);
            state.exercises = exercises;

            // Re-render immediately so the list shows the new order
            renderWorkout();

            // Persist to API
            const routineIds = exercises.map(ex => ex.routine_id);
            try {
                const res = await fetch('/api/routines/reorder', {
                    method: 'POST',
                    headers: { 'Content-Type': 'application/json' },
                    body: JSON.stringify({
                        day_of_week: state.selectedDay,
                        routine_ids: routineIds
                    })
                });
                if (!res.ok) {
                    console.error('Reorder API error:', res.status);
                    await loadDayData(state.selectedDay);
                    renderWorkout();
                }
            } catch (err) {
                console.error('Failed to reorder:', err);
                await loadDayData(state.selectedDay);
                renderWorkout();
            }
        }
    }

    handle.addEventListener('pointermove', onMove);
    handle.addEventListener('pointerup', onEnd);
    handle.addEventListener('pointercancel', onEnd);
}

init();

window.addEventListener('beforeunload', () => {
    if (state.modal.isOpen) {
        saveCurrentSessionDraft();
    } else {
        persistSessionDraftsToStorage();
    }
});

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
        // Create routine entry (targets are on the exercise, not the routine)
        const orderIndex = state.exercises.length;
        const payload = {
            exercise_id: exerciseId,
            day_of_week: state.selectedDay,
            order_index: orderIndex,
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
        assisted: '#B388FF',
        cardio: '#FF9800'
    };
    return colors[type] || '#888';
}

function getCategoryIndicator(category) {
    const categoryIndicators = {
        'Legs-Push': '🦵➡️',
        'Legs-Pull': '🦵⬅️',
        'Arms-Push': '💪➡️',
        'Arms-Pull': '💪⬅️',
        'Core-Push': '🎯➡️',
        'Core-Pull': '🎯⬅️'
    };
    return categoryIndicators[category] || '';
}

function getCategoryDisplayLabel(category) {
    if (!category) return '';
    const indicator = getCategoryIndicator(category);
    return indicator ? `${indicator} ${category}` : category;
}

function buildSessionDraftKey(dayOfWeek, exerciseId) {
    return `${dayOfWeek}::${exerciseId}`;
}

function persistSessionDraftsToStorage() {
    try {
        localStorage.setItem(SESSION_DRAFTS_STORAGE_KEY, JSON.stringify(state.modal.sessionDrafts));
    } catch (err) {
        console.warn('Failed to persist session drafts:', err);
    }
}

function loadSessionDraftsFromStorage() {
    try {
        const raw = localStorage.getItem(SESSION_DRAFTS_STORAGE_KEY);
        if (!raw) return;

        const parsed = JSON.parse(raw);
        if (!parsed || typeof parsed !== 'object' || Array.isArray(parsed)) return;

        const today = getTodayDateString();
        const cleanedDrafts = {};

        Object.entries(parsed).forEach(([key, value]) => {
            if (!value || typeof value !== 'object' || Array.isArray(value)) return;
            if (!Array.isArray(value.sets)) return;
            if (value.draftDate && value.draftDate !== today) return;

            cleanedDrafts[key] = {
                sets: value.sets.map((reps) => reps === null || reps === undefined ? '' : reps.toString()),
                weight: typeof value.weight === 'number' ? value.weight : 0,
                draftDate: value.draftDate || today
            };
        });

        state.modal.sessionDrafts = cleanedDrafts;
        persistSessionDraftsToStorage();
    } catch (err) {
        console.warn('Failed to load session drafts:', err);
    }
}

function saveCurrentSessionDraft() {
    const exerciseIndex = state.modal.exerciseIndex;
    const exercise = exerciseIndex !== null ? state.exercises[exerciseIndex] : null;
    const exerciseId = state.modal.exerciseId;
    const dayOfWeek = state.selectedDay;
    if (!exercise || !exerciseId || !dayOfWeek) return;

    const draftKey = buildSessionDraftKey(dayOfWeek, exerciseId);

    const currentSets = Array.isArray(state.modal.currentSession.sets)
        ? state.modal.currentSession.sets
        : [];
    const hasAnySetInput = currentSets.some((reps) => `${reps ?? ''}`.trim() !== '');
    const currentWeight = state.modal.currentSession.weight;
    const hasChangedWeight = (exercise.type === 'weight' || exercise.type === 'assisted')
        && currentWeight !== (exercise.target_weight || 0);

    if (!hasAnySetInput && !hasChangedWeight) {
        delete state.modal.sessionDrafts[draftKey];
        persistSessionDraftsToStorage();
        return;
    }

    state.modal.sessionDrafts[draftKey] = {
        sets: currentSets.map((reps) => reps === null || reps === undefined ? '' : reps.toString()),
        weight: currentWeight,
        draftDate: getTodayDateString()
    };
    persistSessionDraftsToStorage();
}

function escapeHtml(text) {
    const div = document.createElement('div');
    div.textContent = text;
    return div.innerHTML.replace(/'/g, '&#39;');
}
window.closeExerciseDetail = (saveDraft = true) => {
    if (saveDraft) {
        saveCurrentSessionDraft();
    }
    state.modal.isOpen = false;
    state.modal.exerciseIndex = null;
    state.modal.exerciseId = null;
    state.modal.currentSession = { sets: [], weight: null };
    renderWorkout();
};

window.deleteHistoryEntry = async (historyId) => {
    if (!confirm('Delete this history entry?')) return;
    try {
        const res = await fetch(`/api/history/${historyId}`, { method: 'DELETE' });
        if (!res.ok) throw new Error('Failed to delete');

        // Remove from state
        state.modal.history = state.modal.history.filter(s => s.id !== historyId);

        // Remove the card from DOM
        const card = document.querySelector(`[data-history-id="${historyId}"]`);
        if (card) card.remove();

        // Update the session count header
        const historyHeader = document.querySelector('.history-section h3');
        if (historyHeader) {
            historyHeader.textContent = `History (${state.modal.history.length} sessions)`;
        }

        // Re-fetch PR (may have changed) and re-render graph
        const prRes = await fetch(`/api/history/${state.modal.exerciseId}/pr`);
        const prData = await prRes.json();
        state.modal.pr = prData.pr || null;
        if (state.modal.history.length > 0) {
            const exercise = state.exercises[state.modal.exerciseIndex];
            renderWeightGraph(state.modal.history, state.modal.pr, exercise && exercise.type === 'bodyweight');
        }
    } catch (err) {
        console.error('Failed to delete history entry:', err);
        alert('Failed to delete entry');
    }
};

function renderHistoryPage(history) {
    const exercise = state.exercises[state.modal.exerciseIndex];
    const isBodyweight = exercise && exercise.type === 'bodyweight';
    const page = state.modal.historyPage;
    const start = page * 5;
    const pageItems = history.slice(start, start + 5);
    return pageItems.map(session => `
        <div class="history-card ${session.completed ? 'completed' : 'incomplete'}" data-history-id="${session.id}">
            <div class="history-header">
                <span class="history-date">${session.session_date}</span>
                <span class="history-status">${session.completed ? '✓' : '✗'}</span>
                ${session.is_pr ? '<span class="pr-badge">🏆 PR</span>' : ''}
                <button class="history-delete-btn" onclick="event.stopPropagation(); deleteHistoryEntry(${session.id})" title="Delete entry">✕</button>
            </div>
            <div class="history-details">
                ${isBodyweight ? '' : `<span>${session.weight}kg</span>`}
                <span class="history-sets">${session.sets_completed.join(', ')} reps</span>
                ${isBodyweight
                    ? `<span class="history-volume">${session.sets_completed.reduce((a,b) => a+b, 0)} total reps</span>`
                    : `<span class="history-volume">${session.volume}kg total</span>`
                }
            </div>
        </div>
    `).join('');
}

window.changeHistoryPage = (delta) => {
    const history = state.modal.history;
    const maxPage = Math.ceil(history.length / 5) - 1;
    state.modal.historyPage = Math.max(0, Math.min(maxPage, state.modal.historyPage + delta));

    // Update list directly
    const list = document.getElementById('history-list');
    if (list) list.innerHTML = renderHistoryPage(history);

    // Update pagination controls
    const pagination = document.querySelector('.history-pagination');
    if (pagination) {
        const btns = pagination.querySelectorAll('.pagination-btn');
        btns[0].disabled = state.modal.historyPage === 0;
        btns[1].disabled = state.modal.historyPage >= maxPage;
        pagination.querySelector('.pagination-info').textContent =
            `${state.modal.historyPage + 1} / ${maxPage + 1}`;
    }
};

window.adjustWeight = (delta) => {
    state.modal.currentSession.weight = Math.max(0, state.modal.currentSession.weight + delta);
    const weightDisplay = document.querySelector('.weight-display');
    if (weightDisplay) {
        weightDisplay.textContent = `${state.modal.currentSession.weight} kg`;
    }
    updateModalStats();
};

window.updateSetReps = (setIndex, value) => {
    state.modal.currentSession.sets[setIndex] = value;
    updateModalStats();
};

window.adjustSetReps = (setIndex, delta) => {
    const exercise = state.exercises[state.modal.exerciseIndex];
    const current = state.modal.currentSession.sets[setIndex];

    let currentValue;
    if (current === '' || current === undefined) {
        currentValue = exercise.target_reps;
    } else {
        currentValue = parseInt(current);
    }

    const newValue = Math.max(0, Math.min(99, currentValue + delta));
    state.modal.currentSession.sets[setIndex] = newValue.toString();
    // Update DOM directly instead of re-rendering
    const span = document.querySelectorAll('.set-input')[setIndex];
    if (span) {
        span.textContent = newValue;
        span.classList.remove('set-input-empty');
    }
    updateModalStats();
};

window.autoFillTargetReps = (setIndex, targetReps) => {
    const input = document.querySelectorAll('.set-input')[setIndex];
    if (input && (!input.value || input.value === '')) {
        input.value = targetReps;
        state.modal.currentSession.sets[setIndex] = targetReps.toString();
        updateSetReps(setIndex, targetReps.toString());
    }
};

window.fillTargetReps = (setIndex, targetReps) => {
    if (state.modal.currentSession.sets[setIndex] === '') {
        state.modal.currentSession.sets[setIndex] = targetReps.toString();
        const span = document.querySelectorAll('.set-input')[setIndex];
        if (span) {
            span.textContent = targetReps;
            span.classList.remove('set-input-empty');
        }
        updateModalStats();
    }
};

function updateModalStats() {
    const exercise = state.exercises[state.modal.exerciseIndex];
    const isBodyweight = exercise.type === 'bodyweight';
    const totalReps = state.modal.currentSession.sets.reduce((sum, reps) => sum + (parseInt(reps) || 0), 0);
    const currentVolume = isBodyweight ? totalReps : totalReps * state.modal.currentSession.weight;

    const volumeElement = document.querySelector('.stat-value');
    if (volumeElement) {
        volumeElement.textContent = isBodyweight ? `${currentVolume} reps` : `${currentVolume} kg`;
    }

    const allSetsComplete = state.modal.currentSession.sets.every(reps => {
        const repsNum = parseInt(reps);
        return !isNaN(repsNum) && repsNum >= exercise.target_reps;
    });
    const statusElement = document.querySelector('.stat-value.success, .stat-value.incomplete');
    if (statusElement) {
        statusElement.textContent = allSetsComplete ? '✓ Complete' : 'Incomplete';
        statusElement.className = `stat-value ${allSetsComplete ? 'success' : 'incomplete'}`;
    }
}

window.completeExerciseSession = async () => {
    const exerciseIndex = state.modal.exerciseIndex;
    const exercise = state.exercises[exerciseIndex];
    const today = getTodayDateString();
    const isBodyweight = exercise.type === 'bodyweight';

    // Auto-fill any empty sets with target reps
    state.modal.currentSession.sets = state.modal.currentSession.sets.map(reps => {
        if (reps === '' || reps === undefined) {
            return exercise.target_reps.toString();
        }
        return reps;
    });

    // Convert sets to numbers
    const setsCompleted = state.modal.currentSession.sets.map(r => parseInt(r));

    // Check if session was successful (all sets met target)
    const isSuccessful = setsCompleted.every(reps => reps >= exercise.target_reps);

    // Calculate volume
    const totalReps = setsCompleted.reduce((sum, reps) => sum + reps, 0);
    const volume = isBodyweight ? totalReps : totalReps * state.modal.currentSession.weight;

    try {
        // Create history entry via API
        const response = await fetch('/api/history', {
            method: 'POST',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify({
                exercise_id: exercise.exercise_id,
                session_date: today,
                weight: isBodyweight ? 0 : state.modal.currentSession.weight,
                sets_completed: setsCompleted,
                completed: isSuccessful,
                volume: volume
            })
        });

        if (!response.ok) {
            throw new Error('Failed to save session');
        }

        if (isBodyweight) {
            // For bodyweight: increase target_reps after 3 consecutive successful sessions
            // consecutive_successes is computed from history, so after saving we need to check
            // The current session counts as +1 if successful
            const newConsecutive = isSuccessful ? (exercise.consecutive_successes || 0) + 1 : 0;
            if (newConsecutive >= 3) {
                const newTargetReps = (exercise.target_reps || 0) + 1;
                await fetch(`/api/exercises/${exercise.exercise_id}`, {
                    method: 'PUT',
                    headers: { 'Content-Type': 'application/json' },
                    body: JSON.stringify({ target_reps: newTargetReps })
                });
                showToast(`Rep target increased to ${newTargetReps}! 🎯`);
            }
        } else {
            // Update exercise's target_weight if it changed
            const originalWeight = exercise.target_weight || 0;
            if (state.modal.currentSession.weight !== originalWeight) {
                await fetch(`/api/exercises/${exercise.exercise_id}`, {
                    method: 'PUT',
                    headers: { 'Content-Type': 'application/json' },
                    body: JSON.stringify({ target_weight: state.modal.currentSession.weight })
                });
            }
        }

        // Close modal and reload data
        const completedDraftKey = buildSessionDraftKey(state.selectedDay, exercise.exercise_id);
        delete state.modal.sessionDrafts[completedDraftKey];
        persistSessionDraftsToStorage();
        closeExerciseDetail(false);
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
    state.modal.historyPage = 0;

    // Initialize current session from draft (if any)
    const targetSets = exercise.target_sets || 3;
    const draftKey = buildSessionDraftKey(state.selectedDay, exercise.exercise_id);
    const existingDraft = state.modal.sessionDrafts[draftKey];
    if (existingDraft) {
        const draftSets = Array.isArray(existingDraft.sets) ? existingDraft.sets.slice(0, targetSets) : [];
        while (draftSets.length < targetSets) {
            draftSets.push('');
        }
        state.modal.currentSession.sets = draftSets.map((reps) => reps === null || reps === undefined ? '' : reps.toString());
        state.modal.currentSession.weight = typeof existingDraft.weight === 'number'
            ? existingDraft.weight
            : (exercise.target_weight || 0);
    } else {
        state.modal.currentSession.sets = new Array(targetSets).fill('');
        state.modal.currentSession.weight = exercise.target_weight || 0;
    }

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
    const isBodyweight = exercise.type === 'bodyweight';
    const isAssisted = exercise.type === 'assisted';

    // Initialize current session if not set
    if (state.modal.currentSession.sets.length === 0) {
        state.modal.currentSession.sets = new Array(exercise.target_sets).fill('');
        state.modal.currentSession.weight = exercise.target_weight || 0;
    }

    // Calculate if session is complete
    const allSetsComplete = state.modal.currentSession.sets.every((reps) => {
        const repsNum = parseInt(reps);
        return !isNaN(repsNum) && repsNum >= exercise.target_reps;
    });

    // Calculate current volume (total reps for bodyweight, kg for weight)
    const totalReps = state.modal.currentSession.sets.reduce((sum, reps) => sum + (parseInt(reps) || 0), 0);
    const currentVolume = isBodyweight ? totalReps : totalReps * state.modal.currentSession.weight;

    // Check if current session would be a PR.
    // For assisted: PR = lower weight (less assistance). For weight: PR = higher weight.
    const wouldBePR = !isBodyweight && pr && (isAssisted
        ? state.modal.currentSession.weight < pr.weight
        : state.modal.currentSession.weight > pr.weight);

    const modalHTML = `
        <div class="modal-overlay" onclick="closeExerciseDetail()">
            <div class="modal-content" onclick="event.stopPropagation()">
                <div class="modal-header">
                    <h2>${exercise.name}</h2>
                    <button class="modal-close" onclick="closeExerciseDetail()" aria-label="Close">×</button>
                </div>

                <div class="modal-body">
                    <!-- Weight Control (weight exercises only) -->
                    ${!isBodyweight ? `
                    <div class="weight-section">
                        <label>Current Weight</label>
                        <div class="weight-control">
                            <button class="weight-btn" onclick="adjustWeight(-1)">-</button>
                            <span class="weight-display">${state.modal.currentSession.weight} kg</span>
                            <button class="weight-btn" onclick="adjustWeight(1)">+</button>
                        </div>
                        <div class="target-display">Target: ${exercise.target_sets}×${exercise.target_reps}</div>
                        ${pr ? `<div class="pr-display">PR: ${pr.weight}kg (${pr.date})</div>` : ''}
                        ${wouldBePR ? `<div class="pr-badge-current">🏆 New PR!</div>` : ''}
                    </div>
                    ` : `
                    <div class="weight-section">
                        <div class="target-display">Target: ${exercise.target_sets}×${exercise.target_reps} reps</div>
                    </div>
                    `}

                    <!-- Progression Status -->
                    ${exercise.ready_to_progress ? `
                        <div class="progression-alert">
                            <span class="progress-icon">🎯</span>
                            <div>
                                <strong>${isBodyweight ? 'Ready to increase reps!' : isAssisted ? 'Ready to decrease weight! 💪' : 'Ready to increase weight!'}</strong>
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
                                        <span
                                            class="set-input ${state.modal.currentSession.sets[idx] === '' ? 'set-input-empty' : ''}"
                                            onclick="fillTargetReps(${idx}, ${exercise.target_reps})"
                                        >${state.modal.currentSession.sets[idx] === '' ? '-' : state.modal.currentSession.sets[idx]}</span>
                                        <button class="set-adjust-btn" onclick="adjustSetReps(${idx}, 1)">+</button>
                                    </div>
                                    <span class="reps-label">reps</span>
                                </div>
                            `).join('')}
                        </div>

                        <div class="session-stats">
                            <div class="stat">
                                <span class="stat-label">${isBodyweight ? 'Total Reps' : 'Volume'}</span>
                                <span class="stat-value">${isBodyweight ? currentVolume + ' reps' : currentVolume + ' kg'}</span>
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

                            <!-- Progression Graph -->
                            <div class="graph-container">
                                <canvas id="weight-graph" width="400" height="200"></canvas>
                            </div>

                            <!-- Recent Sessions -->
                            <div class="history-list" id="history-list">
                                ${renderHistoryPage(history)}
                            </div>
                            ${history.length > 5 ? `
                                <div class="history-pagination">
                                    <button class="pagination-btn" onclick="changeHistoryPage(-1)" ${state.modal.historyPage === 0 ? 'disabled' : ''}>&laquo; Newer</button>
                                    <span class="pagination-info">${state.modal.historyPage + 1} / ${Math.ceil(history.length / 5)}</span>
                                    <button class="pagination-btn" onclick="changeHistoryPage(1)" ${(state.modal.historyPage + 1) * 5 >= history.length ? 'disabled' : ''}>Older &raquo;</button>
                                </div>
                            ` : ''}
                        </div>
                    ` : '<div class="no-history">No history yet. Complete your first session!</div>'}
                </div>
            </div>
        </div>
    `;

    dom.workoutContainer.insertAdjacentHTML('beforeend', modalHTML);

    // Render graph if there's history
    if (history.length > 0) {
        setTimeout(() => renderWeightGraph(history, pr, isBodyweight), 0);
    }
}

// Updated graph rendering with PR line
function renderWeightGraph(history, pr, isBodyweight = false) {
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

    // For bodyweight: plot total reps per session; for weight: plot weight
    const values = graphHistory.map(s =>
        isBodyweight ? (s.sets_completed || []).reduce((a, b) => a + b, 0) : s.weight
    );
    const label = isBodyweight ? 'reps' : 'kg';

    if (values.length === 0) return;

    // Determine Y-axis range
    let minVal = Math.min(...values);
    let maxVal = Math.max(...values);

    // Include PR in range if it exists (weight exercises only)
    if (!isBodyweight && pr && pr.weight) {
        minVal = Math.min(minVal, pr.weight);
        maxVal = Math.max(maxVal, pr.weight);
    }

    // Add padding to range (use minimum range of 10 for single data points)
    const range = maxVal - minVal || 10;
    minVal = Math.max(0, minVal - range * 0.1);
    maxVal = maxVal + range * 0.1;

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
        const axisValue = maxVal - (maxVal - minVal) * (i / 4);
        ctx.fillStyle = '#888';
        ctx.font = '12px sans-serif';
        ctx.textAlign = 'right';
        ctx.fillText(isBodyweight ? Math.round(axisValue) : axisValue.toFixed(1), padding - 5, y + 4);
    }

    // Draw PR line (horizontal dashed line) - weight exercises only
    if (!isBodyweight && pr && pr.weight) {
        const prY = padding + graphHeight * (1 - (pr.weight - minVal) / (maxVal - minVal));

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
        const val = values[idx];
        const x = graphHistory.length === 1
            ? padding + graphWidth / 2
            : padding + (graphWidth * idx) / (graphHistory.length - 1);
        const y = padding + graphHeight * (1 - (val - minVal) / (maxVal - minVal));

        if (idx === 0) {
            ctx.moveTo(x, y);
        } else {
            ctx.lineTo(x, y);
        }
    });
    ctx.stroke();

    // Draw data points
    graphHistory.forEach((session, idx) => {
        const val = values[idx];
        const x = graphHistory.length === 1
            ? padding + graphWidth / 2
            : padding + (graphWidth * idx) / (graphHistory.length - 1);
        const y = padding + graphHeight * (1 - (val - minVal) / (maxVal - minVal));

        ctx.beginPath();
        ctx.arc(x, y, 5, 0, 2 * Math.PI);
        ctx.fill();

        // Value label above point
        ctx.fillStyle = '#00E5FF';
        ctx.font = '11px sans-serif';
        ctx.textAlign = 'center';
        ctx.fillText(isBodyweight ? Math.round(val) : val, x, y - 10);
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
