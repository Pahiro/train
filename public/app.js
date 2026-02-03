const state = {
    data: null,
    selectedDay: null,
    isEditing: false,
    timer: {
        active: false,
        time: 60,
        defaultTime: 60,
        interval: null
    }
};

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
    // Schema Migration:
    // 1. String -> Object { text, done: false }
    // 2. Boolean done -> lastDone: "YYYY-MM-DD"

    const today = new Date().toISOString().split('T')[0];

    for (const day in state.data) {
        state.data[day].exercises = state.data[day].exercises.map(ex => {
            // Case 1: Simple string
            if (typeof ex === 'string') {
                return { text: ex, lastDone: null };
            }

            // Case 2: Old boolean 'done' style
            if (ex.hasOwnProperty('done')) {
                const newEx = {
                    text: ex.text,
                    lastDone: ex.done ? today : null // If it was done, assume done today for migration
                };
                return newEx;
            }

            // Case 3: Already has lastDone (or neither)
            return ex;
        });
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
    const today = new Date().toISOString().split('T')[0];

    let content = '';

    if (state.isEditing) {
        content += `<input type="text" id="day-title-input" value="${dayData.title}" class="title-input" aria-label="Day Title">`;
        content += `
            <div class="edit-mode">
                <ul id="exercise-list">
                    ${dayData.exercises.map((ex, idx) => `
                        <li>
                            <input type="text" value="${ex.text}" data-index="${idx}" class="exercise-input" aria-label="Exercise ${idx + 1}">
                            <button class="btn-remove" onclick="removeExercise(${idx})" aria-label="Remove exercise">×</button>
                        </li>
                    `).join('')}
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
                `}).join('')}
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
}

// Timer Custom Logic
window.toggleTimer = () => {
    const icon = document.getElementById('timer-icon');
    const text = document.getElementById('timer-text');
    const fab = document.getElementById('timer-fab');

    if (state.timer.active) {
        // Stop timer
        clearInterval(state.timer.interval);
        state.timer.active = false;
        state.timer.time = state.timer.defaultTime;

        // Reset UI
        text.textContent = state.timer.defaultTime;
        text.style.display = 'none';
        icon.style.display = 'block';
        fab.classList.remove('active');

        navigator.vibrate?.(50);
    } else {
        // Start timer
        state.timer.active = true;
        fab.classList.add('active');

        // Show text, hide icon
        icon.style.display = 'none';
        text.style.display = 'block';
        text.textContent = state.timer.time;

        navigator.vibrate?.(50);

        state.timer.interval = setInterval(() => {
            state.timer.time--;
            text.textContent = state.timer.time;

            if (state.timer.time <= 0) {
                navigator.vibrate?.([200, 100, 200]); // Stronger feedback
                clearInterval(state.timer.interval);
                state.timer.active = false;
                state.timer.time = state.timer.defaultTime;

                // Reset UI
                text.textContent = state.timer.defaultTime;
                text.style.display = 'none';
                icon.style.display = 'block';
                fab.classList.remove('active');

                alert('Rest Finished!');
            }
        }, 1000);
    }
};

// Global handlers
window.toggleExercise = (index) => {
    const dayData = state.data[state.selectedDay];
    const ex = dayData.exercises[index];
    const today = new Date().toISOString().split('T')[0];

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

function updateStateFromInputs() {
    if (!state.isEditing) return;

    const titleInput = document.getElementById('day-title-input');
    if (titleInput) {
        state.data[state.selectedDay].title = titleInput.value;
    }

    const inputs = document.querySelectorAll('.exercise-input');
    inputs.forEach(input => {
        const idx = input.dataset.index;
        state.data[state.selectedDay].exercises[idx].text = input.value;
    });
}

init();
