const textarea = document.getElementById('plan-textarea');
const statusEl = document.getElementById('plan-status');
const loadingEl = document.getElementById('loading');

function showStatus(msg, type) {
    statusEl.textContent = msg;
    statusEl.className = 'plan-status plan-status--' + type;
    if (type === 'success') {
        setTimeout(() => { statusEl.textContent = ''; statusEl.className = 'plan-status'; }, 3000);
    }
}

async function loadPlan() {
    try {
        const res = await fetch('/api/plan');
        if (!res.ok) throw new Error(await res.text());
        textarea.value = await res.text();
    } catch (err) {
        showStatus('Failed to load plan: ' + err.message, 'error');
    } finally {
        loadingEl.style.display = 'none';
    }
}

async function applyPlan() {
    const plan = textarea.value.trim();
    if (!plan) {
        showStatus('Nothing to apply.', 'error');
        return;
    }

    const btn = document.getElementById('apply-btn');
    btn.disabled = true;
    btn.textContent = 'Applying...';
    showStatus('', '');

    try {
        const res = await fetch('/api/plan', {
            method: 'POST',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify({ plan }),
        });
        const data = await res.json();
        if (!res.ok) throw new Error(data || res.statusText);
        showStatus(`Applied — ${data.days_updated} day(s) updated.`, 'success');
    } catch (err) {
        showStatus('Error: ' + err.message, 'error');
    } finally {
        btn.disabled = false;
        btn.textContent = 'Apply Plan';
    }
}

function copyPlan() {
    if (!textarea.value) return;
    navigator.clipboard.writeText(textarea.value).then(() => {
        showStatus('Copied to clipboard.', 'success');
    }).catch(() => {
        textarea.select();
        document.execCommand('copy');
        showStatus('Copied to clipboard.', 'success');
    });
}

document.getElementById('refresh-btn').addEventListener('click', loadPlan);
document.getElementById('apply-btn').addEventListener('click', applyPlan);
document.getElementById('copy-btn').addEventListener('click', copyPlan);

loadPlan();
