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

        // MIGRATION: Convert string exercises to objects
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
    // Ensure all exercises are objects { text, done }
    for (const day in state.data) {
        state.data[day].exercises = state.data[day].exercises.map(ex => {
            if (typeof ex === 'string') {
                return { text: ex, done: false };
            }
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
                    <button class="btn-primary" onclick="saveChanges()">Save Changes</button>
                </div>
            </div>
        `;
    } else {
        content += `<h2>${dayData.title}</h2>`;
        content += `
            <ul>
                ${dayData.exercises.map((ex, idx) => `
                    <li>
                        <div class="exercise-item">
                            <input type="checkbox" class="exercise-checkbox" 
                                ${ex.done ? 'checked' : ''} 
                                onchange="toggleExercise(${idx})"
                            >
                            <span class="exercise-text ${ex.done ? 'done' : ''}" onclick="toggleExercise(${idx})">
                                ${ex.text}
                            </span>
                        </div>
                    </li>
                `).join('')}
            </ul>
            <div class="reset-day-container">
                <button class="btn-reset" onclick="resetDay()">Reset Day's Progress</button>
            </div>
            <button class="btn-edit" onclick="startEditing()">Edit</button>
        `;
    }

    dom.workoutContainer.innerHTML = content;
}

// Timer Logic
window.toggleTimer = () => {
    if (state.timer.active) {
        // Stop timer
        clearInterval(state.timer.interval);
        state.timer.active = false;
        state.timer.time = state.timer.defaultTime;
        dom.timerFab.textContent = state.timer.defaultTime;
        dom.timerFab.classList.remove('active');
    } else {
        // Start timer
        state.timer.active = true;
        dom.timerFab.classList.add('active');
        state.timer.interval = setInterval(() => {
            state.timer.time--;
            dom.timerFab.textContent = state.timer.time;

            if (state.timer.time <= 0) {
                navigator.vibrate?.(200); // Haptic feedback
                clearInterval(state.timer.interval);
                state.timer.active = false;
                state.timer.time = state.timer.defaultTime;
                dom.timerFab.textContent = state.timer.defaultTime;
                dom.timerFab.classList.remove('active');
                alert('Rest Finished!');
            }
        }, 1000);
    }
};

// Global handlers
window.toggleExercise = (index) => {
    // If called from span click, we need to toggle the checkbox manually? 
    // Actually simpler: just invert the state and re-render or update DOM.
    // For simplicity with this lightweight structure, let's update state and save silently.

    const dayData = state.data[state.selectedDay];
    dayData.exercises[index].done = !dayData.exercises[index].done;

    // Save immediately (fire and forget)
    fetch('/api/training', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(state.data)
    });

    renderWorkout();
};

window.resetDay = () => {
    // Removed confirm for smoother UX
    // if (!confirm('Uncheck all exercises for today?')) return;

    const dayData = state.data[state.selectedDay];
    dayData.exercises.forEach(ex => ex.done = false);

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
    state.data[state.selectedDay].exercises.push({ text: '', done: false });
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
        // Preserve done state, only update text
        state.data[state.selectedDay].exercises[idx].text = input.value;
    });
}

init();
