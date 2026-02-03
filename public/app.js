const state = {
    data: null,
    selectedDay: null,
    isEditing: false
};

const dom = {
    daySelector: document.getElementById('day-selector'),
    workoutContainer: document.getElementById('workout-container'),
    loading: document.getElementById('loading')
};

async function init() {
    try {
        const res = await fetch('/api/training');
        state.data = await res.json();

        // precise day selection
        const days = ['Sunday', 'Monday', 'Tuesday', 'Wednesday', 'Thursday', 'Friday', 'Saturday'];
        state.selectedDay = days[new Date().getDay()];

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
                            <input type="text" value="${ex}" data-index="${idx}" class="exercise-input" aria-label="Exercise ${idx + 1}">
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
                ${dayData.exercises.map(ex => `<li>${ex}</li>`).join('')}
            </ul>
            <button class="btn-edit" onclick="startEditing()">Edit</button>
        `;
    }

    dom.workoutContainer.innerHTML = content;
}

// Global handlers exposed for inline onclicks
window.startEditing = () => {
    state.isEditing = true;
    renderWorkout();
};

window.removeExercise = (index) => {
    // Read current values first to avoid losing unsaved edits
    updateStateFromInputs();
    state.data[state.selectedDay].exercises.splice(index, 1);
    renderWorkout();
};

window.addExercise = () => {
    updateStateFromInputs();
    state.data[state.selectedDay].exercises.push('');
    renderWorkout();
};

window.saveChanges = async () => {
    updateStateFromInputs();

    // Optimistic UI update
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
    // Sync current input values to state
    if (!state.isEditing) return;

    const titleInput = document.getElementById('day-title-input');
    if (titleInput) {
        state.data[state.selectedDay].title = titleInput.value;
    }

    const inputs = document.querySelectorAll('.exercise-input');
    inputs.forEach(input => {
        const idx = input.dataset.index;
        state.data[state.selectedDay].exercises[idx] = input.value;
    });
}

init();
