// State management
const state = {
    metricTypes: [],
    entries: {},
    visibleMetrics: new Set(),
    timeRange: 30,
    modal: {
        isOpen: false,
        type: null,
        data: null
    },
    editingMetricTypeId: null,
    deletingMetricTypeId: null
};

// Color palette for auto-assigning colors to new metrics
const METRIC_COLORS = [
    '#00E5FF', '#FF9800', '#00C853', '#9C27B0',
    '#2196F3', '#E91E63', '#FFC107', '#4CAF50'
];

// DOM elements
const dom = {
    loading: document.getElementById('loading'),
    metricsGrid: document.getElementById('metrics-grid'),
    metricsEmptyState: document.getElementById('metrics-empty-state'),
    graphsContainer: document.getElementById('graphs-container'),
    graphEmptyState: document.getElementById('graph-empty-state'),
    addEntryFab: document.getElementById('add-entry-fab'),
    manageMetricsBtn: document.getElementById('manage-metrics-btn'),

    // Entry modal
    entryModal: document.getElementById('entry-modal'),
    entryModalTitle: document.getElementById('entry-modal-title'),
    entryForm: document.getElementById('entry-form'),
    entryMetricType: document.getElementById('entry-metric-type'),
    entryValue: document.getElementById('entry-value'),
    entryDate: document.getElementById('entry-date'),
    entryNotes: document.getElementById('entry-notes'),
    entryUnitHint: document.getElementById('entry-unit-hint'),
    entryModalClose: document.getElementById('entry-modal-close'),
    entryCancelBtn: document.getElementById('entry-cancel-btn'),
    entrySaveBtn: document.getElementById('entry-save-btn'),

    // Manage metrics modal
    manageMetricsModal: document.getElementById('manage-metrics-modal'),
    manageMetricsClose: document.getElementById('manage-metrics-close'),
    metricsList: document.getElementById('metrics-list'),
    addMetricTypeBtn: document.getElementById('add-metric-type-btn'),

    // Metric type modal
    metricTypeModal: document.getElementById('metric-type-modal'),
    metricTypeModalTitle: document.getElementById('metric-type-modal-title'),
    metricTypeForm: document.getElementById('metric-type-form'),
    metricName: document.getElementById('metric-name'),
    metricUnit: document.getElementById('metric-unit'),
    metricColor: document.getElementById('metric-color'),
    colorPreview: document.getElementById('color-preview'),
    metricTypeModalClose: document.getElementById('metric-type-modal-close'),
    metricTypeCancelBtn: document.getElementById('metric-type-cancel-btn'),
    metricTypeSaveBtn: document.getElementById('metric-type-save-btn'),

    // Delete modal
    deleteModal: document.getElementById('delete-modal'),
    deleteMessage: document.getElementById('delete-message'),
    deleteModalClose: document.getElementById('delete-modal-close'),
    deleteCancelBtn: document.getElementById('delete-cancel-btn'),
    deleteConfirmBtn: document.getElementById('delete-confirm-btn')
};

// Initialize
async function init() {
    try {
        await loadMetricTypes();
        await loadDashboardData(state.timeRange);

        setupEventListeners();
        renderMetricsGrid();
        renderMetricsGraphs();
        dom.loading.style.display = 'none';
    } catch (err) {
        console.error('Failed to initialize:', err);
        alert('Failed to load metrics. Please refresh the page.');
    }
}

// Setup event listeners
function setupEventListeners() {
    // Time range selector
    document.querySelectorAll('.time-btn').forEach(btn => {
        btn.addEventListener('click', async (e) => {
            document.querySelectorAll('.time-btn').forEach(b => b.classList.remove('active'));
            e.target.classList.add('active');
            state.timeRange = parseInt(e.target.dataset.days);
            await loadDashboardData(state.timeRange);
            renderMetricsGraphs();
        });
    });

    // FAB
    dom.addEntryFab.addEventListener('click', openAddEntryModal);

    // Manage metrics button
    dom.manageMetricsBtn.addEventListener('click', openManageMetricsModal);

    // Entry modal
    dom.entryModalClose.addEventListener('click', closeEntryModal);
    dom.entryCancelBtn.addEventListener('click', closeEntryModal);
    dom.entryForm.addEventListener('submit', handleEntrySubmit);
    dom.entryModal.addEventListener('click', (e) => {
        if (e.target === dom.entryModal) closeEntryModal();
    });

    // Update unit hint when metric type changes
    dom.entryMetricType.addEventListener('change', (e) => {
        const metricType = state.metricTypes.find(mt => mt.id === parseInt(e.target.value));
        if (metricType) {
            dom.entryUnitHint.textContent = `Unit: ${metricType.unit}`;
        }
    });

    // Manage metrics modal
    dom.manageMetricsClose.addEventListener('click', closeManageMetricsModal);
    dom.addMetricTypeBtn.addEventListener('click', openAddMetricTypeModal);
    dom.manageMetricsModal.addEventListener('click', (e) => {
        if (e.target === dom.manageMetricsModal) closeManageMetricsModal();
    });

    // Metric type modal
    dom.metricTypeModalClose.addEventListener('click', closeMetricTypeModal);
    dom.metricTypeCancelBtn.addEventListener('click', closeMetricTypeModal);
    dom.metricTypeForm.addEventListener('submit', handleMetricTypeSubmit);
    dom.metricTypeModal.addEventListener('click', (e) => {
        if (e.target === dom.metricTypeModal) closeMetricTypeModal();
    });

    // Color picker preview
    dom.metricColor.addEventListener('input', (e) => {
        dom.colorPreview.style.backgroundColor = e.target.value;
    });

    // Delete modal
    dom.deleteModalClose.addEventListener('click', closeDeleteModal);
    dom.deleteCancelBtn.addEventListener('click', closeDeleteModal);
    dom.deleteConfirmBtn.addEventListener('click', handleDelete);
    dom.deleteModal.addEventListener('click', (e) => {
        if (e.target === dom.deleteModal) closeDeleteModal();
    });
}

// API calls

async function loadMetricTypes() {
    const response = await fetch('/api/metrics');
    if (!response.ok) throw new Error('Failed to load metric types');
    const data = await response.json();
    state.metricTypes = data.metric_types || [];
}

async function loadDashboardData(days) {
    const response = await fetch(`/api/metrics/dashboard?days=${days}`);
    if (!response.ok) throw new Error('Failed to load dashboard data');
    const data = await response.json();

    // Convert to entries map
    state.entries = {};
    (data.metrics || []).forEach(metric => {
        state.entries[metric.id] = metric.entries || [];
    });
}

// Rendering functions

function renderMetricsGrid() {
    if (state.metricTypes.length === 0) {
        dom.metricsEmptyState.style.display = 'block';
        dom.metricsGrid.style.display = 'none';
        return;
    }

    dom.metricsEmptyState.style.display = 'none';
    dom.metricsGrid.style.display = 'grid';

    dom.metricsGrid.innerHTML = state.metricTypes.map(mt => {
        const latestEntry = mt.latest_entry;
        const entries = state.entries[mt.id] || [];

        let valueDisplay = '-';
        let trendDisplay = '';

        if (latestEntry) {
            valueDisplay = `${latestEntry.value} ${mt.unit}`;

            // Calculate trend
            if (entries.length >= 2) {
                const current = entries[0].value;
                const previous = entries[1].value;
                const diff = current - previous;

                if (Math.abs(diff) > 0.01) {
                    const symbol = diff > 0 ? '↑' : '↓';
                    const color = diff > 0 ? '#00C853' : '#E91E63';
                    trendDisplay = `<span class="trend-indicator" style="color: ${color}">${symbol} ${Math.abs(diff).toFixed(1)} ${mt.unit}</span>`;
                }
            }
        }

        return `
            <div class="metric-card" style="border-left: 4px solid ${mt.color}">
                <div class="metric-card-header">
                    <h3>${mt.name}</h3>
                </div>
                <div class="metric-card-body">
                    <div class="metric-value-large">${valueDisplay}</div>
                    ${trendDisplay}
                </div>
            </div>
        `;
    }).join('');
}

function renderMetricsGraphs() {
    // Filter metrics that have data
    const metricsWithData = state.metricTypes
        .map(m => ({
            ...m,
            entries: (state.entries[m.id] || []).slice().reverse() // Oldest to newest
        }))
        .filter(m => m.entries.length > 0);

    if (metricsWithData.length === 0) {
        dom.graphEmptyState.style.display = 'block';
        dom.graphsContainer.style.display = 'none';
        return;
    }

    dom.graphEmptyState.style.display = 'none';
    dom.graphsContainer.style.display = 'block';

    // Render individual graph for each metric
    dom.graphsContainer.innerHTML = metricsWithData.map(metric => {
        return `
            <div class="metric-graph-card">
                <h3 class="metric-graph-title" style="color: ${metric.color}">${metric.name}</h3>
                <canvas class="metric-graph-canvas" data-metric-id="${metric.id}" width="400" height="250"></canvas>
            </div>
        `;
    }).join('');

    // Render each graph
    metricsWithData.forEach(metric => {
        const canvas = dom.graphsContainer.querySelector(`canvas[data-metric-id="${metric.id}"]`);
        renderSingleGraph(canvas, metric);
    });
}

function renderSingleGraph(canvas, metric) {
    const ctx = canvas.getContext('2d');
    const entries = metric.entries;

    if (entries.length === 0) return;

    // Graph dimensions
    const padding = 50;
    const graphWidth = canvas.width - padding * 2;
    const graphHeight = canvas.height - padding * 2;

    // Find Y range
    const values = entries.map(e => e.value);
    const yMin = Math.min(...values) * 0.95;
    const yMax = Math.max(...values) * 1.05;
    const yRange = yMax - yMin || 1;

    // Helper functions
    const getX = (index) => padding + (index / (entries.length - 1 || 1)) * graphWidth;
    const getY = (value) => padding + graphHeight - ((value - yMin) / yRange * graphHeight);

    // Clear canvas
    ctx.clearRect(0, 0, canvas.width, canvas.height);

    // Draw axes
    ctx.strokeStyle = '#444';
    ctx.lineWidth = 1;
    ctx.beginPath();
    ctx.moveTo(padding, padding);
    ctx.lineTo(padding, canvas.height - padding);
    ctx.lineTo(canvas.width - padding, canvas.height - padding);
    ctx.stroke();

    // Draw grid
    ctx.strokeStyle = '#333';
    ctx.lineWidth = 0.5;
    for (let i = 0; i <= 5; i++) {
        const y = padding + (i / 5) * graphHeight;
        ctx.beginPath();
        ctx.moveTo(padding, y);
        ctx.lineTo(canvas.width - padding, y);
        ctx.stroke();
    }

    // Draw Y-axis labels
    ctx.fillStyle = '#aaa';
    ctx.font = '11px sans-serif';
    ctx.textAlign = 'right';
    for (let i = 0; i <= 5; i++) {
        const value = yMax - (i / 5) * yRange;
        const y = padding + (i / 5) * graphHeight;
        ctx.fillText(value.toFixed(1), padding - 8, y + 4);
    }

    // Draw unit label
    ctx.save();
    ctx.translate(12, canvas.height / 2);
    ctx.rotate(-Math.PI / 2);
    ctx.textAlign = 'center';
    ctx.fillStyle = '#aaa';
    ctx.font = '12px sans-serif';
    ctx.fillText(metric.unit, 0, 0);
    ctx.restore();

    // Plot line
    ctx.strokeStyle = metric.color;
    ctx.lineWidth = 2;
    ctx.setLineDash([]);

    ctx.beginPath();
    entries.forEach((entry, idx) => {
        const x = getX(idx);
        const y = getY(entry.value);

        if (idx === 0) {
            ctx.moveTo(x, y);
        } else {
            ctx.lineTo(x, y);
        }
    });
    ctx.stroke();

    // Draw points
    ctx.fillStyle = metric.color;
    entries.forEach((entry, idx) => {
        const x = getX(idx);
        const y = getY(entry.value);

        ctx.beginPath();
        ctx.arc(x, y, 4, 0, Math.PI * 2);
        ctx.fill();
    });

    // Draw X-axis labels (dates)
    ctx.fillStyle = '#aaa';
    ctx.font = '10px sans-serif';
    ctx.textAlign = 'center';

    const labelInterval = Math.max(1, Math.floor(entries.length / 5));
    entries.forEach((entry, idx) => {
        if (idx % labelInterval === 0 || idx === entries.length - 1) {
            const x = getX(idx);
            const shortDate = new Date(entry.date).toLocaleDateString('en', { month: 'short', day: 'numeric' });
            ctx.fillText(shortDate, x, canvas.height - padding + 20);
        }
    });
}

// Modal functions

function openAddEntryModal() {
    state.modal = { isOpen: true, type: 'entry', data: null };
    dom.entryModalTitle.textContent = 'Add Measurement';
    dom.entryMetricType.disabled = false;

    // Populate metric type dropdown
    dom.entryMetricType.innerHTML = '<option value="">Select metric...</option>' +
        state.metricTypes.map(mt => `<option value="${mt.id}">${mt.name}</option>`).join('');

    // Set today's date
    dom.entryDate.value = getTodayDateString();
    dom.entryValue.value = '';
    dom.entryNotes.value = '';
    dom.entryUnitHint.textContent = '';

    dom.entryModal.style.display = 'flex';
}

function closeEntryModal() {
    state.modal = { isOpen: false, type: null, data: null };
    dom.entryModal.style.display = 'none';
    dom.entryForm.reset();
}

async function handleEntrySubmit(e) {
    e.preventDefault();

    const metricTypeId = parseInt(dom.entryMetricType.value);
    const value = parseFloat(dom.entryValue.value);
    const entryDate = dom.entryDate.value;
    const notes = dom.entryNotes.value.trim() || null;

    try {
        const response = await fetch('/api/metric-entries', {
            method: 'POST',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify({
                metric_type_id: metricTypeId,
                entry_date: entryDate,
                value: value,
                notes: notes
            })
        });

        if (!response.ok) throw new Error('Failed to create entry');

        closeEntryModal();
        await loadMetricTypes();
        await loadDashboardData(state.timeRange);
        renderMetricsGrid();
        renderMetricsGraphs();
    } catch (err) {
        console.error('Failed to create entry:', err);
        alert('Failed to save measurement. Please try again.');
    }
}

function openManageMetricsModal() {
    renderMetricsList();
    dom.manageMetricsModal.style.display = 'flex';
}

function closeManageMetricsModal() {
    dom.manageMetricsModal.style.display = 'none';
}

function renderMetricsList() {
    if (state.metricTypes.length === 0) {
        dom.metricsList.innerHTML = '<p class="empty-message">No metrics yet. Click "Add Metric" to create one.</p>';
        return;
    }

    dom.metricsList.innerHTML = state.metricTypes.map(mt => `
        <div class="metric-manage-item">
            <div class="metric-manage-info">
                <span class="metric-color-dot" style="background-color: ${mt.color}"></span>
                <span class="metric-manage-name">${mt.name}</span>
                <span class="metric-manage-unit">(${mt.unit})</span>
                ${mt.is_default ? '<span class="badge">Default</span>' : ''}
            </div>
            <div class="metric-manage-actions">
                ${!mt.is_default ? `<button class="btn-icon" onclick="deleteMetricType(${mt.id})" title="Delete">🗑️</button>` : ''}
            </div>
        </div>
    `).join('');
}

function openAddMetricTypeModal() {
    state.editingMetricTypeId = null;
    dom.metricTypeModalTitle.textContent = 'Add Metric';

    // Auto-select next available color
    const usedColors = state.metricTypes.map(mt => mt.color);
    const availableColor = METRIC_COLORS.find(c => !usedColors.includes(c)) || METRIC_COLORS[0];

    dom.metricName.value = '';
    dom.metricUnit.value = '';
    dom.metricColor.value = availableColor;
    dom.colorPreview.style.backgroundColor = availableColor;

    dom.metricTypeModal.style.display = 'flex';
}

function closeMetricTypeModal() {
    state.editingMetricTypeId = null;
    dom.metricTypeModal.style.display = 'none';
    dom.metricTypeForm.reset();
}

async function handleMetricTypeSubmit(e) {
    e.preventDefault();

    const name = dom.metricName.value.trim();
    const unit = dom.metricUnit.value.trim();
    const color = dom.metricColor.value;

    try {
        const response = await fetch('/api/metrics', {
            method: 'POST',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify({
                name: name,
                unit: unit,
                color: color,
                order_index: state.metricTypes.length
            })
        });

        if (!response.ok) {
            const error = await response.text();
            throw new Error(error);
        }

        closeMetricTypeModal();
        await loadMetricTypes();
        renderMetricsList();
        renderMetricsGrid();
        renderMetricsGraphs();
    } catch (err) {
        console.error('Failed to create metric type:', err);
        alert('Failed to create metric. Please try again.');
    }
}

function deleteMetricType(id) {
    const metricType = state.metricTypes.find(mt => mt.id === id);
    if (!metricType) return;

    state.deletingMetricTypeId = id;
    dom.deleteMessage.textContent = `Are you sure you want to delete "${metricType.name}"?`;
    dom.deleteModal.style.display = 'flex';
}

function closeDeleteModal() {
    state.deletingMetricTypeId = null;
    dom.deleteModal.style.display = 'none';
}

async function handleDelete() {
    if (!state.deletingMetricTypeId) return;

    try {
        const response = await fetch(`/api/metrics/${state.deletingMetricTypeId}`, {
            method: 'DELETE'
        });

        if (!response.ok) throw new Error('Failed to delete metric type');

        closeDeleteModal();
        await loadMetricTypes();
        await loadDashboardData(state.timeRange);

        renderMetricsList();
        renderMetricsGrid();
        renderMetricsGraphs();
    } catch (err) {
        console.error('Failed to delete metric type:', err);
        alert('Failed to delete metric. Please try again.');
    }
}

// Utility functions

function getTodayDateString() {
    const today = new Date();
    const year = today.getFullYear();
    const month = String(today.getMonth() + 1).padStart(2, '0');
    const day = String(today.getDate()).padStart(2, '0');
    return `${year}-${month}-${day}`;
}

// Initialize on load
document.addEventListener('DOMContentLoaded', init);
