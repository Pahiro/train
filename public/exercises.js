// State management
const state = {
    exercises: [],
    filteredExercises: [],
    searchQuery: '',
    typeFilter: '',
    categoryFilter: '',
    editingExerciseId: null,
    deletingExerciseId: null,
    searchDebounceTimer: null,
    historyModal: {
        isOpen: false,
        exerciseId: null,
        exerciseName: null,
        history: [],
        pr: null,
        currentPage: 0,
        pageSize: 10
    }
};

// DOM elements
const dom = {
    loading: document.getElementById('loading'),
    exercisesList: document.getElementById('exercises-list'),
    emptyState: document.getElementById('empty-state'),
    searchInput: document.getElementById('search-input'),
    typeFilter: document.getElementById('type-filter'),
    categoryFilter: document.getElementById('category-filter'),
    addExerciseBtn: document.getElementById('add-exercise-btn'),
    exerciseModal: document.getElementById('exercise-modal'),
    modalTitle: document.getElementById('modal-title'),
    exerciseForm: document.getElementById('exercise-form'),
    exerciseName: document.getElementById('exercise-name'),
    exerciseType: document.getElementById('exercise-type'),
    exerciseCategory: document.getElementById('exercise-category'),
    exerciseTargetSets: document.getElementById('exercise-target-sets'),
    exerciseTargetReps: document.getElementById('exercise-target-reps'),
    exerciseTargetWeight: document.getElementById('exercise-target-weight'),
    targetsGroup: document.getElementById('targets-group'),
    modalClose: document.getElementById('modal-close'),
    cancelBtn: document.getElementById('cancel-btn'),
    saveBtn: document.getElementById('save-btn'),
    deleteModal: document.getElementById('delete-modal'),
    deleteMessage: document.getElementById('delete-message'),
    deleteModalClose: document.getElementById('delete-modal-close'),
    deleteCancelBtn: document.getElementById('delete-cancel-btn'),
    deleteConfirmBtn: document.getElementById('delete-confirm-btn')
};

// Initialize
async function init() {
    try {
        await loadExercises();
        setupEventListeners();
        dom.loading.style.display = 'none';
    } catch (err) {
        console.error('Failed to initialize:', err);
        alert('Failed to load exercises. Please refresh the page.');
    }
}

// Setup event listeners
function setupEventListeners() {
    // Search with debouncing
    dom.searchInput.addEventListener('input', (e) => {
        clearTimeout(state.searchDebounceTimer);
        state.searchQuery = e.target.value.toLowerCase();

        state.searchDebounceTimer = setTimeout(() => {
            filterExercises();
        }, 300); // 300ms debounce
    });

    // Filters
    dom.typeFilter.addEventListener('change', (e) => {
        state.typeFilter = e.target.value;
        filterExercises();
    });

    dom.categoryFilter.addEventListener('change', (e) => {
        state.categoryFilter = e.target.value;
        filterExercises();
    });

    // Add exercise button
    dom.addExerciseBtn.addEventListener('click', () => {
        openAddModal();
    });

    // Modal close buttons
    dom.modalClose.addEventListener('click', closeModal);
    dom.cancelBtn.addEventListener('click', closeModal);
    dom.deleteModalClose.addEventListener('click', closeDeleteModal);
    dom.deleteCancelBtn.addEventListener('click', closeDeleteModal);

    // Form submit
    dom.exerciseForm.addEventListener('submit', handleSubmit);

    // Delete confirm
    dom.deleteConfirmBtn.addEventListener('click', handleDelete);

    // Close modal on outside click
    dom.exerciseModal.addEventListener('click', (e) => {
        if (e.target === dom.exerciseModal) {
            closeModal();
        }
    });

    dom.deleteModal.addEventListener('click', (e) => {
        if (e.target === dom.deleteModal) {
            closeDeleteModal();
        }
    });

    // Disable category for cardio exercises, show/hide targets
    dom.exerciseType.addEventListener('change', (e) => {
        if (e.target.value === 'cardio') {
            dom.exerciseCategory.value = '';
            dom.exerciseCategory.disabled = true;
            dom.targetsGroup.style.display = 'none';
        } else {
            dom.exerciseCategory.disabled = false;
            dom.targetsGroup.style.display = 'block';
            // Show/hide weight field based on type
            dom.exerciseTargetWeight.closest('.form-group').style.display =
                e.target.value === 'bodyweight' ? 'none' : 'block';
        }
    });
}

// Load exercises from API
async function loadExercises() {
    const response = await fetch('/api/exercises');
    if (!response.ok) {
        throw new Error('Failed to load exercises');
    }
    const data = await response.json();
    state.exercises = data.exercises || [];
    filterExercises();
}

// Filter exercises based on search and filters
function filterExercises() {
    let filtered = [...state.exercises];

    // Apply search
    if (state.searchQuery) {
        filtered = filtered.filter(ex =>
            ex.name.toLowerCase().includes(state.searchQuery)
        );
    }

    // Apply type filter
    if (state.typeFilter) {
        filtered = filtered.filter(ex => ex.type === state.typeFilter);
    }

    // Apply category filter
    if (state.categoryFilter) {
        filtered = filtered.filter(ex => ex.category === state.categoryFilter);
    }

    state.filteredExercises = filtered;
    renderExercises();
}

// Render exercises list
function renderExercises() {
    if (state.filteredExercises.length === 0) {
        dom.exercisesList.style.display = 'none';
        dom.emptyState.style.display = 'block';
        return;
    }

    dom.exercisesList.style.display = 'grid';
    dom.emptyState.style.display = 'none';

    dom.exercisesList.innerHTML = state.filteredExercises
        .map(exercise => createExerciseCard(exercise))
        .join('');

    // Add event listeners to action buttons
    document.querySelectorAll('.edit-exercise').forEach(btn => {
        btn.addEventListener('click', (e) => {
            e.stopPropagation(); // Prevent card click
            const id = parseInt(e.currentTarget.dataset.id);
            openEditModal(id);
        });
    });

    document.querySelectorAll('.delete-exercise').forEach(btn => {
        btn.addEventListener('click', (e) => {
            e.stopPropagation(); // Prevent card click
            const id = parseInt(e.currentTarget.dataset.id);
            const name = e.currentTarget.dataset.name;
            openDeleteModal(id, name);
        });
    });

    // Add event listeners to view history
    document.querySelectorAll('.exercise-card').forEach(card => {
        card.addEventListener('click', (e) => {
            // Only if not clicking on action buttons
            if (!e.target.closest('.exercise-actions')) {
                const id = parseInt(card.dataset.id);
                const name = card.dataset.name;
                openHistoryModal(id, name);
            }
        });
    });
}

// Create exercise card HTML
function createExerciseCard(exercise) {
    const typeColors = {
        weight: '#00E5FF',
        bodyweight: '#00C853',
        assisted: '#B388FF',
        cardio: '#FF9800'
    };

    const typeColor = typeColors[exercise.type] || '#888';
    const categoryText = exercise.category || 'No category';

    return `
        <div class="exercise-card clickable" data-id="${exercise.id}" data-name="${escapeHtml(exercise.name)}" title="Click to view history">
            <div class="exercise-card-header">
                <h3 class="exercise-name">${escapeHtml(exercise.name)}</h3>
                <div class="exercise-actions">
                    <button class="icon-btn edit-exercise" data-id="${exercise.id}" title="Edit">
                        ✏️
                    </button>
                    <button class="icon-btn delete-exercise" data-id="${exercise.id}" data-name="${escapeHtml(exercise.name)}" title="Delete">
                        🗑️
                    </button>
                </div>
            </div>
            <div class="exercise-card-body">
                <span class="exercise-badge" style="background: ${typeColor}22; color: ${typeColor}; border: 1px solid ${typeColor}">
                    ${exercise.type}
                </span>
                ${exercise.category ? `
                    <span class="exercise-category">${categoryText}</span>
                ` : ''}
                ${exercise.type !== 'cardio' && (exercise.target_sets || exercise.target_reps) ? `
                    <span class="exercise-targets">${exercise.target_sets || '?'}×${exercise.target_reps || '?'}${exercise.target_weight ? ` @ ${exercise.target_weight}kg` : ''}</span>
                ` : ''}
            </div>
        </div>
    `;
}

// Modal functions
function openAddModal() {
    state.editingExerciseId = null;
    dom.modalTitle.textContent = 'Add Exercise';
    dom.saveBtn.textContent = 'Save Exercise';
    dom.exerciseForm.reset();
    dom.exerciseCategory.disabled = false;
    dom.targetsGroup.style.display = 'block';
    dom.exerciseTargetWeight.closest('.form-group').style.display = 'block';
    dom.exerciseModal.style.display = 'flex';
}

function openEditModal(exerciseId) {
    const exercise = state.exercises.find(ex => ex.id === exerciseId);
    if (!exercise) return;

    state.editingExerciseId = exerciseId;
    dom.modalTitle.textContent = 'Edit Exercise';
    dom.saveBtn.textContent = 'Update Exercise';
    dom.exerciseName.value = exercise.name;
    dom.exerciseType.value = exercise.type;
    dom.exerciseCategory.value = exercise.category || '';
    dom.exerciseCategory.disabled = exercise.type === 'cardio';

    // Populate target fields
    dom.exerciseTargetSets.value = exercise.target_sets || '';
    dom.exerciseTargetReps.value = exercise.target_reps || '';
    dom.exerciseTargetWeight.value = exercise.target_weight || '';

    // Show/hide targets based on type
    if (exercise.type === 'cardio') {
        dom.targetsGroup.style.display = 'none';
    } else {
        dom.targetsGroup.style.display = 'block';
        dom.exerciseTargetWeight.closest('.form-group').style.display =
            exercise.type === 'bodyweight' ? 'none' : 'block';
    }

    dom.exerciseModal.style.display = 'flex';
}

function closeModal() {
    dom.exerciseModal.style.display = 'none';
    dom.exerciseForm.reset();
    state.editingExerciseId = null;
}

function openDeleteModal(exerciseId, exerciseName) {
    state.deletingExerciseId = exerciseId;
    dom.deleteMessage.textContent = `Are you sure you want to delete "${exerciseName}"?`;
    dom.deleteModal.style.display = 'flex';
}

function closeDeleteModal() {
    dom.deleteModal.style.display = 'none';
    state.deletingExerciseId = null;
}

// Handle form submit (create or update)
async function handleSubmit(e) {
    e.preventDefault();

    const name = dom.exerciseName.value.trim();
    const type = dom.exerciseType.value;
    const category = type === 'cardio' ? null : (dom.exerciseCategory.value || null);

    // Gather targets
    const targetSets = type !== 'cardio' && dom.exerciseTargetSets.value ? parseInt(dom.exerciseTargetSets.value) : null;
    const targetReps = type !== 'cardio' && dom.exerciseTargetReps.value ? parseInt(dom.exerciseTargetReps.value) : null;
    const targetWeight = (type === 'weight' || type === 'assisted') && dom.exerciseTargetWeight.value ? parseFloat(dom.exerciseTargetWeight.value) : null;

    if (!name || !type) {
        alert('Please fill in all required fields');
        return;
    }

    dom.saveBtn.disabled = true;
    dom.saveBtn.textContent = 'Saving...';

    try {
        if (state.editingExerciseId) {
            // Update existing exercise
            await updateExercise(state.editingExerciseId, name, type, category, targetSets, targetReps, targetWeight);
        } else {
            // Create new exercise
            await createExercise(name, type, category, targetSets, targetReps, targetWeight);
        }

        closeModal();
        await loadExercises();
    } catch (err) {
        console.error('Failed to save exercise:', err);
        alert(err.message || 'Failed to save exercise. Please try again.');
    } finally {
        dom.saveBtn.disabled = false;
        dom.saveBtn.textContent = state.editingExerciseId ? 'Update Exercise' : 'Save Exercise';
    }
}

// Create exercise via API
async function createExercise(name, type, category, targetSets, targetReps, targetWeight) {
    const body = { name, type, category };
    if (targetSets !== null) body.target_sets = targetSets;
    if (targetReps !== null) body.target_reps = targetReps;
    if (targetWeight !== null) body.target_weight = targetWeight;

    const response = await fetch('/api/exercises', {
        method: 'POST',
        headers: {
            'Content-Type': 'application/json'
        },
        body: JSON.stringify(body)
    });

    if (!response.ok) {
        const error = await response.text();
        throw new Error(error);
    }

    return await response.json();
}

// Update exercise via API
async function updateExercise(id, name, type, category, targetSets, targetReps, targetWeight) {
    const body = { name, type, category };
    if (targetSets !== null) body.target_sets = targetSets;
    if (targetReps !== null) body.target_reps = targetReps;
    if (targetWeight !== null) body.target_weight = targetWeight;

    const response = await fetch(`/api/exercises/${id}`, {
        method: 'PUT',
        headers: {
            'Content-Type': 'application/json'
        },
        body: JSON.stringify(body)
    });

    if (!response.ok) {
        const error = await response.text();
        throw new Error(error);
    }

    return await response.json();
}

// Handle delete
async function handleDelete() {
    if (!state.deletingExerciseId) return;

    dom.deleteConfirmBtn.disabled = true;
    dom.deleteConfirmBtn.textContent = 'Deleting...';

    try {
        const response = await fetch(`/api/exercises/${state.deletingExerciseId}`, {
            method: 'DELETE'
        });

        if (!response.ok) {
            const error = await response.text();
            throw new Error(error);
        }

        closeDeleteModal();
        await loadExercises();
    } catch (err) {
        console.error('Failed to delete exercise:', err);
        alert(err.message || 'Failed to delete exercise. Please try again.');
    } finally {
        dom.deleteConfirmBtn.disabled = false;
        dom.deleteConfirmBtn.textContent = 'Delete';
    }
}

// Utility function to escape HTML
function escapeHtml(text) {
    const div = document.createElement('div');
    div.textContent = text;
    return div.innerHTML;
}

// ============================================
// History Modal Functions
// ============================================

async function openHistoryModal(exerciseId, exerciseName) {
    state.historyModal.exerciseId = exerciseId;
    state.historyModal.exerciseName = exerciseName;
    state.historyModal.isOpen = true;
    state.historyModal.currentPage = 0;

    // Fetch history and PR data
    try {
        const [historyRes, prRes] = await Promise.all([
            fetch(`/api/history/${exerciseId}`),
            fetch(`/api/history/${exerciseId}/pr`)
        ]);

        const historyData = await historyRes.json();
        const prData = await prRes.json();

        state.historyModal.history = historyData.history || [];
        state.historyModal.pr = prData.pr || null;

        renderHistoryModal();
    } catch (err) {
        console.error('Failed to load history:', err);
        alert('Failed to load exercise history. Please try again.');
        state.historyModal.isOpen = false;
    }
}

function renderHistoryModal() {
    const { exerciseName, history, pr, currentPage, pageSize } = state.historyModal;
    const exercise = state.exercises.find(ex => ex.id === state.historyModal.exerciseId);

    // Pagination
    const totalPages = Math.ceil(history.length / pageSize);
    const startIdx = currentPage * pageSize;
    const endIdx = startIdx + pageSize;
    const currentPageHistory = history.slice(startIdx, endIdx);

    // Graph data (last 20 sessions)
    const graphHistory = history.slice(-20);

    const modalHTML = `
        <div class="modal" id="history-modal" style="display: flex;">
            <div class="modal-content history-modal-content">
                <div class="modal-header">
                    <h2>${escapeHtml(exerciseName)}</h2>
                    <button class="modal-close" onclick="closeHistoryModal()">&times;</button>
                </div>

                <div class="modal-body">
                    ${exercise && exercise.type === 'weight' && pr ? `
                        <div class="pr-section">
                            <div class="pr-badge-large">
                                <span class="pr-icon">🏆</span>
                                <div class="pr-details">
                                    <div class="pr-label">Personal Record</div>
                                    <div class="pr-value">${pr.weight} kg</div>
                                    <div class="pr-date">${pr.date}</div>
                                </div>
                            </div>
                        </div>
                    ` : ''}

                    ${exercise && exercise.type === 'weight' && graphHistory.length > 0 ? `
                        <div class="graph-section">
                            <h3>Weight Progression</h3>
                            <div class="graph-container">
                                <canvas id="history-weight-graph" width="400" height="200"></canvas>
                            </div>
                        </div>
                    ` : ''}

                    ${history.length > 0 ? `
                        <div class="history-table-section">
                            <h3>Session History (${history.length} total)</h3>
                            <div class="history-table-container">
                                <table class="history-table">
                                    <thead>
                                        <tr>
                                            <th>Date</th>
                                            ${exercise && exercise.type === 'weight' ? '<th>Weight</th>' : ''}
                                            ${exercise && exercise.type === 'weight' ? '<th>Sets × Reps</th>' : ''}
                                            ${exercise && exercise.type === 'weight' ? '<th>Volume</th>' : ''}
                                            <th>Status</th>
                                        </tr>
                                    </thead>
                                    <tbody>
                                        ${currentPageHistory.map(session => `
                                            <tr class="${session.completed ? 'session-complete' : 'session-incomplete'}">
                                                <td>${session.session_date}</td>
                                                ${exercise && exercise.type === 'weight' ? `<td>${session.weight} kg ${session.is_pr ? '🏆' : ''}</td>` : ''}
                                                ${exercise && exercise.type === 'weight' ? `<td>${session.sets_completed.join(', ')}</td>` : ''}
                                                ${exercise && exercise.type === 'weight' ? `<td>${session.volume} kg</td>` : ''}
                                                <td><span class="status-badge ${session.completed ? 'complete' : 'incomplete'}">${session.completed ? '✓' : '✗'}</span></td>
                                            </tr>
                                        `).join('')}
                                    </tbody>
                                </table>
                            </div>

                            ${totalPages > 1 ? `
                                <div class="pagination">
                                    <button class="btn-pagination" onclick="changePage(-1)" ${currentPage === 0 ? 'disabled' : ''}>
                                        ← Previous
                                    </button>
                                    <span class="pagination-info">Page ${currentPage + 1} of ${totalPages}</span>
                                    <button class="btn-pagination" onclick="changePage(1)" ${currentPage >= totalPages - 1 ? 'disabled' : ''}>
                                        Next →
                                    </button>
                                </div>
                            ` : ''}
                        </div>
                    ` : `
                        <div class="no-history-message">
                            <p>No workout sessions recorded yet.</p>
                            <p>Add this exercise to a routine and complete a session to see history here!</p>
                        </div>
                    `}
                </div>
            </div>
        </div>
    `;

    // Remove existing history modal if any
    const existingModal = document.getElementById('history-modal');
    if (existingModal) {
        existingModal.remove();
    }

    // Insert modal into DOM
    document.body.insertAdjacentHTML('beforeend', modalHTML);

    // Close on outside click
    document.getElementById('history-modal').addEventListener('click', (e) => {
        if (e.target.id === 'history-modal') {
            closeHistoryModal();
        }
    });

    // Render graph if there's history
    if (exercise && exercise.type === 'weight' && graphHistory.length > 0) {
        setTimeout(() => renderWeightGraph(graphHistory, pr), 50);
    }
}

function closeHistoryModal() {
    const modal = document.getElementById('history-modal');
    if (modal) {
        modal.remove();
    }
    state.historyModal.isOpen = false;
    state.historyModal.exerciseId = null;
    state.historyModal.exerciseName = null;
    state.historyModal.history = [];
    state.historyModal.pr = null;
    state.historyModal.currentPage = 0;
}

window.closeHistoryModal = closeHistoryModal;

window.changePage = (direction) => {
    const { history, pageSize, currentPage } = state.historyModal;
    const totalPages = Math.ceil(history.length / pageSize);

    const newPage = currentPage + direction;
    if (newPage >= 0 && newPage < totalPages) {
        state.historyModal.currentPage = newPage;
        renderHistoryModal();
    }
};

// Render weight progression graph (reused from app.js)
function renderWeightGraph(history, pr) {
    const canvas = document.getElementById('history-weight-graph');
    if (!canvas) return;

    const ctx = canvas.getContext('2d');
    const width = canvas.width;
    const height = canvas.height;
    const padding = 40;

    // Clear canvas
    ctx.clearRect(0, 0, width, height);

    const weights = history.map(s => s.weight);
    if (weights.length === 0) return;

    // Determine Y-axis range
    let minWeight = Math.min(...weights);
    let maxWeight = Math.max(...weights);

    // Include PR in range if it exists
    if (pr && pr.weight) {
        minWeight = Math.min(minWeight, pr.weight);
        maxWeight = Math.max(maxWeight, pr.weight);
    }

    // Add padding to range
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
    history.forEach((session, idx) => {
        // For single data point, center it. Otherwise, space evenly.
        const x = history.length === 1
            ? padding + graphWidth / 2
            : padding + (graphWidth * idx) / (history.length - 1);
        const y = padding + graphHeight * (1 - (session.weight - minWeight) / (maxWeight - minWeight));

        if (idx === 0) {
            ctx.moveTo(x, y);
        } else {
            ctx.lineTo(x, y);
        }
    });
    ctx.stroke();

    // Draw data points
    history.forEach((session, idx) => {
        // For single data point, center it. Otherwise, space evenly.
        const x = history.length === 1
            ? padding + graphWidth / 2
            : padding + (graphWidth * idx) / (history.length - 1);
        const y = padding + graphHeight * (1 - (session.weight - minWeight) / (maxWeight - minWeight));

        ctx.beginPath();
        ctx.arc(x, y, 6, 0, 2 * Math.PI);
        ctx.fill();

        // Weight label above point (only show every nth point if too many)
        const showLabel = history.length <= 10 || idx % Math.ceil(history.length / 10) === 0;
        if (showLabel) {
            ctx.fillStyle = '#00E5FF';
            ctx.font = '12px sans-serif';
            ctx.textAlign = 'center';
            ctx.fillText(session.weight, x, y - 12);
        }
    });
}

// Start the app
init();
