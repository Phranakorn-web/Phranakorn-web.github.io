// =========================================================================
// --- MODULE 9: AUTHENTICATION, USER ROLES & SECURITY ENGINE ---
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
function getSupabaseClient() {
    if (typeof _supabase !== 'undefined' && _supabase) {
        return _supabase;
    }
    if (typeof window !== 'undefined' && window.ENV && window.ENV.SUPABASE_CLIENT) {
        return window.ENV.SUPABASE_CLIENT;
    }
    return null;
}

// Default system users structure without hardcoded sensitive values
const DEFAULT_USERS = [
    { id: 1, username: 'admin', password: '', name: 'Super Admin (ผู้ดูแลระบบ)', department: 'ฝ่ายบริหาร IT', role: 'admin' },
    { id: 2, username: 'user1', password: '', name: 'นายสมชาย ใจดี', department: 'แผนกคลังสินค้า', role: 'user' }
];

let systemUsers = [...DEFAULT_USERS];
let currentUser = null;
let isAdminAuthenticatedSession = true; 
let loginFailedAttempts = 0;

const AUTO_LOGOUT_TIMEOUT_MS = 5 * 60 * 1000; 
let autoLogoutTimer = null;

function resetAutoLogoutTimer() {
    if (!currentUser) return;
    localStorage.setItem('WMS_LAST_ACTIVE_TIME', Date.now().toString());

    clearTimeout(autoLogoutTimer);
    autoLogoutTimer = setTimeout(() => {
        handleSystemLogout("⏳ คุณไม่ได้ใช้งานนานเกิน 5 นาที ระบบจึงออกจากระบบอัตโนมัติเพื่อความปลอดภัย");
    }, AUTO_LOGOUT_TIMEOUT_MS);
}

function initSecurityListeners() {
    ['mousedown', 'mousemove', 'keypress', 'scroll', 'touchstart', 'click'].forEach(evt => {
        document.addEventListener(evt, resetAutoLogoutTimer, false);
    });
}

async function loadUsersFromDB() {
    try {
        const savedUsers = localStorage.getItem('WMS_USERS');
        if (savedUsers) {
            systemUsers = JSON.parse(savedUsers);
        }

        if (navigator.onLine) {
            const client = getSupabaseClient();
            if (client) {
                const { data, error } = await client
                    .from('profiles')
                    .select('*')
                    .order('created_at', { ascending: true });

                if (!error && data && data.length > 0) {
                    systemUsers = data.map(u => ({
                        id: u.id,
                        username: u.username,
                        password: u.password || '',
                        name: u.full_name || u.name || u.username,
                        department: u.department || 'แผนกคลังสินค้า',
                        role: u.role || 'user'
                    }));
                    localStorage.setItem('WMS_USERS', JSON.stringify(systemUsers));
                }
            }
        }
    } catch(e) {
        // Safe catch to protect system logs
    }

    renderUserManagementTable();
    populateLogUserDropdown();
}

async function initAuthSystem() {
    await loadUsersFromDB();

    const savedUserStr = localStorage.getItem('WMS_ACTIVE_USER');
    const lastActiveTimeStr = localStorage.getItem('WMS_LAST_ACTIVE_TIME');

    if (savedUserStr && lastActiveTimeStr) {
        const elapsed = Date.now() - parseInt(lastActiveTimeStr, 10);
        
        if (elapsed < AUTO_LOGOUT_TIMEOUT_MS) {
            currentUser = JSON.parse(savedUserStr);
            const loginOverlay = document.getElementById('loginOverlay');
            if (loginOverlay) loginOverlay.style.display = 'none';
            
            const currentNameText = document.getElementById('currentUserNameText');
            if (currentNameText) currentNameText.textContent = `${currentUser.name} (${currentUser.username})`;
            
            resetAutoLogoutTimer();
            initSecurityListeners();
            if (typeof renderSidebarMenu === 'function') renderSidebarMenu();
            if (typeof showToast === 'function') showToast(`👋 ยินดีต้อนรับกลับ คุณ ${currentUser.name}`);
            return;
        }
    }

    forceShowLoginOverlay();
}

function forceShowLoginOverlay() {
    currentUser = null;
    isAdminAuthenticatedSession = true;
    localStorage.removeItem('WMS_ACTIVE_USER');
    localStorage.removeItem('WMS_LAST_ACTIVE_TIME');
    
    const loginOverlay = document.getElementById('loginOverlay');
    if (loginOverlay) loginOverlay.style.display = 'flex';
    
    const uInput = document.getElementById('loginUsername');
    const pInput = document.getElementById('loginPassword');
    
    if (uInput) {
        uInput.value = '';
        uInput.focus();
    }
    if (pInput) pInput.value = '';
}

async function handleSystemLogin(e) {
    if (e) e.preventDefault();
    
    if (loginFailedAttempts >= 5) {
        const errText = document.getElementById('loginErrorMsg');
        const errAlert = document.getElementById('loginErrorAlert');
        if (errText) errText.textContent = '⚠️ พิมพ์ผิดเกินกำหนด กรุณารอ 30 วินาที!';
        if (errAlert) errAlert.style.display = 'block';
        return;
    }

    const uInputElem = document.getElementById('loginUsername');
    const pInputElem = document.getElementById('loginPassword');
    if (!uInputElem || !pInputElem) return;

    const uInput = uInputElem.value.trim();
    const pInput = pInputElem.value.trim();

    if (!uInput || !pInput) return;

    if (typeof showToast === 'function') showToast("⏳ กำลังตรวจสอบสิทธิ์...");

    let foundUser = null;

    if (navigator.onLine) {
        try {
            const client = getSupabaseClient();
            if (client) {
                const { data, error } = await client
                    .from('profiles')
                    .select('*')
                    .ilike('username', uInput)
                    .maybeSingle();

                if (!error && data) {
                    if (!data.password || data.password === pInput) {
                        foundUser = {
                            id: data.id,
                            username: data.username,
                            password: data.password || pInput,
                            name: data.full_name || data.name || data.username,
                            department: data.department || 'แผนกคลังสินค้า',
                            role: data.role || 'user'
                        };
                    }
                }
            }
        } catch(err) {}
    }

    if (!foundUser) {
        foundUser = systemUsers.find(u => u.username.toLowerCase() === uInput.toLowerCase() && u.password && u.password === pInput);
    }

    if (!foundUser) {
        foundUser = DEFAULT_USERS.find(u => u.username.toLowerCase() === uInput.toLowerCase() && u.password && u.password === pInput);
    }

    if (foundUser) {
        loginFailedAttempts = 0;
        currentUser = foundUser;
        isAdminAuthenticatedSession = true;
        
        localStorage.setItem('WMS_ACTIVE_USER', JSON.stringify(currentUser));
        localStorage.setItem('WMS_LAST_ACTIVE_TIME', Date.now().toString());

        const loginOverlay = document.getElementById('loginOverlay');
        const loginErrorAlert = document.getElementById('loginErrorAlert');
        const currentNameText = document.getElementById('currentUserNameText');

        if (loginOverlay) loginOverlay.style.display = 'none';
        if (loginErrorAlert) loginErrorAlert.style.display = 'none';
        if (currentNameText) currentNameText.textContent = `${currentUser.name} (${currentUser.username})`;

        resetAutoLogoutTimer();
        initSecurityListeners();
        if (typeof renderSidebarMenu === 'function') renderSidebarMenu();
        if (typeof playSuccessSound === 'function') playSuccessSound();
        
        if (typeof speakThaiText === 'function') speakThaiText(`ยินดีต้อนรับ คุณ ${currentUser.name}`);
        if (typeof showToast === 'function') showToast(`🎉 ยืนยันสิทธิ์สำเร็จ! ยินดีต้อนรับคุณ ${currentUser.name}`);

        if (typeof logUserActivity === 'function') {
            await logUserActivity('AUTH', `เข้าสู่ระบบสำเร็จ`);
        }
    } else {
        loginFailedAttempts++;
        if (typeof playErrorSound === 'function') playErrorSound();
        
        const btnSubmit = document.getElementById('loginSubmitBtn');
        const errText = document.getElementById('loginErrorMsg');
        const errAlert = document.getElementById('loginErrorAlert');

        if (loginFailedAttempts >= 5) {
            if (btnSubmit) btnSubmit.disabled = true;
            if (errText) errText.textContent = '🚨 กรอกรหัสผิด 5 ครั้ง! ระงับชั่วคราว 30 วินาที';
            if (errAlert) errAlert.style.display = 'block';
            setTimeout(() => {
                loginFailedAttempts = 0;
                if (btnSubmit) btnSubmit.disabled = false;
                if (errAlert) errAlert.style.display = 'none';
            }, 30000);
        } else {
            if (errText) errText.textContent = `Username หรือ Password ไม่ถูกต้อง! (เหลืออีก ${5 - loginFailedAttempts} ครั้ง)`;
            if (errAlert) errAlert.style.display = 'block';
        }
    }
}

async function handleSystemLogout(reasonMsg = null) {
    if (reasonMsg || confirm("คุณแน่ใจหรือไม่ที่จะออกจากระบบ?")) {
        if (currentUser && typeof logUserActivity === 'function') {
            await logUserActivity('AUTH', `ออกจากระบบ ${reasonMsg ? '(Auto Timeout)' : ''}`);
        }
        localStorage.removeItem('WMS_ACTIVE_USER');
        localStorage.removeItem('WMS_LAST_ACTIVE_TIME');
        currentUser = null;
        isAdminAuthenticatedSession = true;
        clearTimeout(autoLogoutTimer);
        if (reasonMsg) alert(reasonMsg);
        location.reload();
    }
}

function renderUserManagementTable() {
    const tbody = document.getElementById('userManagementTableBody');
    if (!tbody) return;
    tbody.innerHTML = '';

    systemUsers.forEach((u, idx) => {
        const isSelf = currentUser && currentUser.username === u.username;
        const isAdminMain = u.username === 'admin';
        
        const tr = document.createElement('tr');
        tr.innerHTML = `
            <td style="text-align:center;" class="mono">${idx + 1}</td>
            <td><code class="mono font-bold" style="color:var(--primary-text);">${escapeHTML(u.username)}</code></td>
            <td style="font-weight:600;">${escapeHTML(u.name || u.full_name || '-')}</td>
            <td>${escapeHTML(u.department || '-')}</td>
            <td><span class="badge-action ${u.role === 'admin' ? 'auth' : 'nav'}">${escapeHTML(u.role)}</span></td>
            <td style="text-align:center;">
                <button class="btn btn-sm btn-primary" onclick="inspectUserLogs('${escapeHTML(u.username)}')">
                    <i class="fa-solid fa-eye"></i> ประวัติ
                </button>
            </td>
            <td style="text-align:center;">
                <button class="btn btn-sm btn-secondary" onclick="openEditUserModal('${escapeHTML(String(u.id))}')" title="แก้ไขข้อมูล">
                    <i class="fa-solid fa-pen-to-square" style="color:var(--primary);"></i> แก้ไข
                </button>
            </td>
            <td style="text-align:center;">
                ${(!isAdminMain && !isSelf) ? `
                    <button class="btn btn-sm btn-danger" onclick="deleteUserAccount('${escapeHTML(String(u.id))}')" title="ลบบัญชี">
                        <i class="fa-solid fa-trash"></i> ลบ
                    </button>
                ` : `<span style="font-size:0.75rem; color:var(--text-muted);">${isAdminMain ? 'แอดมินหลัก' : 'ใช้งานอยู่'}</span>`}
            </td>
        `;
        tbody.appendChild(tr);
    });
}

function populateLogUserDropdown() {
    const select = document.getElementById('logUserSelect');
    if(!select) return;
    select.innerHTML = `<option value="ALL">👤 ผู้ใช้ทุกคน (All Users)</option>`;
    systemUsers.forEach(u => {
        select.innerHTML += `<option value="${escapeHTML(u.username)}">${escapeHTML(u.name || u.full_name)} (${escapeHTML(u.username)})</option>`;
    });
}