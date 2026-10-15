// =========================================================================
// --- MODULE 7: USER ACTIVITIES LOGS DATABASE ENGINE ---
// =========================================================================

// Safe Escape HTML Helper Fallback (Secures against XSS vulnerabilities)
if (typeof escapeHTML !== 'function') {
    function escapeHTML(str) {
        if (str === null || str === undefined) return '';
        return String(str)
            .replace(/&/g, '&amp;')
            .replace(/</g, '&lt;')
            .replace(/>/g, '&gt;')
            .replace(/"/g, '&quot;')
            .replace(/'/g, '&#039;');
    }
}

// Secure Dynamic Supabase Instance Getter
// Prevents exposing sensitive hardcoded API keys or Database URLs in source files
function getSupabaseClient() {
    if (typeof _supabase !== 'undefined' && _supabase) {
        return _supabase;
    }
    // Secure fallback via global environment configuration if window._supabase is not directly initialized
    if (typeof window !== 'undefined' && window.ENV && window.ENV.SUPABASE_CLIENT) {
        return window.ENV.SUPABASE_CLIENT;
    }
    return null;
}

let globalActivityLogs = [];
let currentInspectedUserLogs = [];
let currentInspectedUser = null;

async function logUserActivity(actionType, description, targetSn = null) {
    if (typeof currentUser === 'undefined' || !currentUser) return;
    
    const payload = {
        username: currentUser.username,
        full_name: currentUser.name || currentUser.username,
        role: currentUser.role || 'user',
        action_type: actionType,
        description: description,
        target_sn: targetSn,
        created_at: new Date().toISOString()
    };
    
    if (navigator.onLine) {
        try {
            const client = getSupabaseClient();
            if (client) {
                await client.from('user_activities').insert([payload]);
                return;
            }
        } catch (e) {
            // Silently swallow error details to prevent internal system or DB structure exposure
        }
    }
    
    if (typeof offlineActivityQueue !== 'undefined' && Array.isArray(offlineActivityQueue)) {
        offlineActivityQueue.push(payload);
    }
    
    if (typeof persistQueue === 'function') {
        persistQueue();
    }
}

async function loadUserActivityLogsFromDB() {
    const tbody = document.getElementById('activityLogsTableBody');
    if (!tbody) return;

    if (!navigator.onLine) return;

    try {
        const client = getSupabaseClient();
        if (!client) return;

        const { data, error } = await client
            .from('user_activities')
            .select('*')
            .order('created_at', { ascending: false })
            .limit(300);

        if (!error && data) {
            globalActivityLogs = data;
            filterActivityLogs();
        }
    } catch (e) {
        // Safe error catch without revealing database internal exception logs
    }
}

function filterActivityLogs() {
    const searchInput = document.getElementById('logSearchInput');
    const userSelect = document.getElementById('logUserSelect');
    const typeSelect = document.getElementById('logTypeSelect');

    const search = searchInput ? searchInput.value.trim().toLowerCase() : '';
    const user = userSelect ? userSelect.value : 'ALL';
    const type = typeSelect ? typeSelect.value : 'ALL';

    const filtered = globalActivityLogs.filter(log => {
        const matchSearch = !search || 
            (log.username && log.username.toLowerCase().includes(search)) ||
            (log.full_name && log.full_name.toLowerCase().includes(search)) ||
            (log.description && log.description.toLowerCase().includes(search)) ||
            (log.target_sn && log.target_sn.toLowerCase().includes(search));

        const matchUser = (user === 'ALL') || (log.username === user);
        const matchType = (type === 'ALL') || (log.action_type === type);

        return matchSearch && matchUser && matchType;
    });

    renderActivityLogsTable(filtered);
}

function renderActivityLogsTable(logs) {
    const tbody = document.getElementById('activityLogsTableBody');
    if (!tbody) return;

    const totalBadge = document.getElementById('logTotalBadge');
    if (totalBadge) {
        totalBadge.textContent = `${logs.length} ประวัติ`;
    }

    if (!logs || logs.length === 0) {
        tbody.innerHTML = `<tr><td colspan="6" style="text-align:center; padding:20px; color:var(--text-muted);">ไม่พบประวัติการใช้งานตรงตามเงื่อนไข</td></tr>`;
        return;
    }

    let html = '';
    logs.forEach((log, idx) => {
        let badgeClass = 'nav';
        if (log.action_type === 'INBOUND') badgeClass = 'inbound';
        else if (log.action_type === 'OUTBOUND') badgeClass = 'outbound';
        else if (log.action_type === 'DELETE') badgeClass = 'delete';
        else if (log.action_type === 'RELOCATE') badgeClass = 'relocate';
        else if (log.action_type === 'UPDATE') badgeClass = 'update';
        else if (log.action_type === 'AUTH') badgeClass = 'auth';

        const safeFormattedDate = log.created_at ? new Date(log.created_at).toLocaleString('th-TH') : '-';

        html += `
            <tr>
                <td style="text-align:center;" class="mono">${idx + 1}</td>
                <td style="font-size:0.78rem; color:var(--text-muted);">${escapeHTML(safeFormattedDate)}</td>
                <td><strong class="mono" style="color:var(--primary-text);">${escapeHTML(log.full_name || log.username)}</strong> <span style="font-size:0.75rem; color:var(--text-muted);">(${escapeHTML(log.username)})</span></td>
                <td><span class="badge-action ${escapeHTML(badgeClass)}">${escapeHTML(log.action_type)}</span></td>
                <td>${escapeHTML(log.description || '-')}</td>
                <td><code class="mono font-bold">${escapeHTML(log.target_sn || '-')}</code></td>
            </tr>
        `;
    });
    tbody.innerHTML = html;
}