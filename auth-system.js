// =========================================================================
// --- MODULE 9: AUTHENTICATION, USER ROLES & SECURITY ENGINE ---
// =========================================================================

const DEFAULT_USERS = [
    { id: 1, username: 'admin', password: '123456', name: 'Super Admin (ผู้ดูแลระบบ)', department: 'ฝ่ายบริหาร IT', role: 'admin' },
    { id: 2, username: 'user1', password: '123456', name: 'นายสมชาย ใจดี', department: 'แผนกคลังสินค้า', role: 'user' }
];

let systemUsers = [...DEFAULT_USERS];
let currentUser = null;
let isAdminAuthenticatedSession = true; 
let loginFailedAttempts = 0;

const AUTO_LOGOUT_TIMEOUT_MS = 5 * 60 * 1000; 
let autoLogoutTimer = null;
let sessionCheckInterval = null;

function resetAutoLogoutTimer() {
    if (!currentUser) return;
    localStorage.setItem('WMS_LAST_ACTIVE_TIME', Date.now().toString());

    clearTimeout(autoLogoutTimer);
    autoLogoutTimer = setTimeout(() => {
        handleSystemLogout("⏳ คุณไม่ได้ใช้งานนานเกิน 5 นาที ระบบจึงออกจากระบบอัตโนมัติเพื่อความปลอดภัย");
    }, AUTO_LOGOUT_TIMEOUT_MS);
}

// 🟢 ระบบตรวจสอบสถานะ Realtime ว่าบัญชีปัจจุบันถูก Admin เตะออกจากระบบหรือไม่
async function checkUserSessionStatus() {
    if (!currentUser || !navigator.onLine) return;
    try {
        const client = typeof getSupabaseClient === 'function' ? getSupabaseClient() : _supabase;
        if (!client) return;

        const { data, error } = await client
            .from('profiles')
            .select('is_kicked, force_logout')
            .ilike('username', currentUser.username)
            .maybeSingle();

        if (!error && data && (data.is_kicked || data.force_logout)) {
            // ล้างสถานะคำสั่งเตะออกในฐานข้อมูลเพื่อให้เข้าใหม่ได้ในภายหลัง
            await client.from('profiles').update({ is_kicked: false, force_logout: false }).ilike('username', currentUser.username);
            handleSystemLogout("⚠️ คุณถูกผู้ดูแลระบบ (Admin) สั่งให้ออกจากระบบทันที");
        }
    } catch(e) {
        // Safe Catch
    }
}

function initSecurityListeners() {
    ['mousedown', 'mousemove', 'keypress', 'scroll', 'touchstart', 'click'].forEach(evt => {
        document.addEventListener(evt, resetAutoLogoutTimer, false);
    });

    if (sessionCheckInterval) clearInterval(sessionCheckInterval);
    sessionCheckInterval = setInterval(checkUserSessionStatus, 3000);
}

async function loadUsersFromDB() {
    try {
        const savedUsers = localStorage.getItem('WMS_USERS');
        if (savedUsers) {
            systemUsers = JSON.parse(savedUsers);
        }

        if (navigator.onLine) {
            const { data, error } = await _supabase
                .from('profiles')
                .select('*')
                .order('created_at', { ascending: true });

            if (!error && data && data.length > 0) {
                systemUsers = data.map(u => ({
                    id: u.id,
                    username: u.username,
                    password: u.password || '123456',
                    name: u.full_name || u.name || u.username,
                    department: u.department || 'แผนกคลังสินค้า',
                    role: u.role || 'user'
                }));
                localStorage.setItem('WMS_USERS', JSON.stringify(systemUsers));
            }
        }
    } catch(e) {
        console.warn("⚠️ ใช้ข้อมูลผู้ใช้สำรองในเครื่อง:", e);
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
            document.getElementById('loginOverlay').style.display = 'none';
            document.getElementById('currentUserNameText').textContent = `${currentUser.name} (${currentUser.username})`;
            
            resetAutoLogoutTimer();
            initSecurityListeners();
            renderSidebarMenu();
            showToast(`👋 ยินดีต้อนรับกลับ คุณ ${currentUser.name}`);
            return;
        }
    }

    forceShowLoginOverlay();
}

function forceShowLoginOverlay() {
    currentUser = null;
    isAdminAuthenticatedSession = true;
    if (sessionCheckInterval) clearInterval(sessionCheckInterval);
    localStorage.removeItem('WMS_ACTIVE_USER');
    localStorage.removeItem('WMS_LAST_ACTIVE_TIME');
    document.getElementById('loginOverlay').style.display = 'flex';
    document.getElementById('loginUsername').value = '';
    document.getElementById('loginPassword').value = '';
    document.getElementById('loginUsername').focus();
}

async function handleSystemLogin(e) {
    if (e) e.preventDefault();
    
    if (loginFailedAttempts >= 5) {
        document.getElementById('loginErrorMsg').textContent = '⚠️ พิมพ์ผิดเกินกำหนด กรุณารอ 30 วินาที!';
        document.getElementById('loginErrorAlert').style.display = 'block';
        return;
    }

    const uInput = document.getElementById('loginUsername').value.trim();
    const pInput = document.getElementById('loginPassword').value.trim();

    if (!uInput || !pInput) return;

    showToast("⏳ กำลังตรวจสอบสิทธิ์...");

    let foundUser = null;

    if (navigator.onLine) {
        try {
            const { data, error } = await _supabase
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

                    // รีเซ็ตสถานะเตะออกเมื่อล็อกอินสำเร็จ
                    await _supabase.from('profiles').update({ is_kicked: false, force_logout: false }).ilike('username', uInput);
                }
            }
        } catch(err) {}
    }

    if (!foundUser) {
        foundUser = systemUsers.find(u => u.username.toLowerCase() === uInput.toLowerCase() && u.password === pInput);
    }

    if (!foundUser) {
        foundUser = DEFAULT_USERS.find(u => u.username.toLowerCase() === uInput.toLowerCase() && u.password === pInput);
    }

    if (foundUser) {
        loginFailedAttempts = 0;
        currentUser = foundUser;
        isAdminAuthenticatedSession = true;
        
        localStorage.setItem('WMS_ACTIVE_USER', JSON.stringify(currentUser));
        localStorage.setItem('WMS_LAST_ACTIVE_TIME', Date.now().toString());

        document.getElementById('loginOverlay').style.display = 'none';
        document.getElementById('loginErrorAlert').style.display = 'none';
        document.getElementById('currentUserNameText').textContent = `${currentUser.name} (${currentUser.username})`;

        resetAutoLogoutTimer();
        initSecurityListeners();
        renderSidebarMenu();
        playSuccessSound();
        
        speakThaiText(`ยินดีต้อนรับ คุณ ${currentUser.name}`);
        showToast(`🎉 ยืนยันสิทธิ์สำเร็จ! ยินดีต้อนรับคุณ ${currentUser.name}`);

        await logUserActivity('AUTH', `เข้าสู่ระบบสำเร็จ`);
    } else {
        loginFailedAttempts++;
        playErrorSound();
        if (loginFailedAttempts >= 5) {
            document.getElementById('loginSubmitBtn').disabled = true;
            document.getElementById('loginErrorMsg').textContent = '🚨 กรอกรหัสผิด 5 ครั้ง! ระงับชั่วคราว 30 วินาที';
            document.getElementById('loginErrorAlert').style.display = 'block';
            setTimeout(() => {
                loginFailedAttempts = 0;
                document.getElementById('loginSubmitBtn').disabled = false;
                document.getElementById('loginErrorAlert').style.display = 'none';
            }, 30000);
        } else {
            document.getElementById('loginErrorMsg').textContent = `Username หรือ Password ไม่ถูกต้อง! (เหลืออีก ${5 - loginFailedAttempts} ครั้ง)`;
            document.getElementById('loginErrorAlert').style.display = 'block';
        }
    }
}

async function handleSystemLogout(reasonMsg = null) {
    if (reasonMsg || confirm("คุณแน่ใจหรือไม่ที่จะออกจากระบบ?")) {
        if (currentUser) {
            await logUserActivity('AUTH', `ออกจากระบบ ${reasonMsg ? '(Auto Timeout/Kicked)' : ''}`);
        }
        if (sessionCheckInterval) clearInterval(sessionCheckInterval);
        localStorage.removeItem('WMS_ACTIVE_USER');
        localStorage.removeItem('WMS_LAST_ACTIVE_TIME');
        currentUser = null;
        isAdminAuthenticatedSession = true;
        clearTimeout(autoLogoutTimer);
        if (reasonMsg) alert(reasonMsg);
        location.reload();
    }
}

// 🟢 ฟังก์ชันสำหรับ Admin เพื่อเตะผู้ใช้รายนั้นออกจากระบบแบบ Realtime
async function kickUserSession(targetUsername) {
    if (!currentUser || currentUser.role !== 'admin') {
        alert("⚠️ เฉพาะผู้ดูแลระบบ (Admin) เท่านั้นที่สามารถใช้คำสั่งนี้ได้");
        return;
    }

    if (currentUser.username.toLowerCase() === targetUsername.toLowerCase()) {
        alert("⚠️ คุณไม่สามารถสั่งเตะบัญชีของตัวเองออกจากระบบได้");
        return;
    }

    if (confirm(`🚨 คุณแน่ใจหรือไม่ที่จะสั่งเตะผู้ใช้ "${targetUsername}" ออกจากระบบทันที?`)) {
        if (navigator.onLine) {
            try {
                const client = typeof getSupabaseClient === 'function' ? getSupabaseClient() : _supabase;
                if (client) {
                    await client.from('profiles').update({ is_kicked: true, force_logout: true }).ilike('username', targetUsername);
                }
            } catch(e) {
                // Safe Catch
            }
        }

        if (typeof playSuccessSound === 'function') playSuccessSound();
        if (typeof showToast === 'function') showToast(`🚨 ส่งคำสั่งเตะผู้ใช้ ${targetUsername} ออกจากระบบเรียบร้อยแล้ว`);
        await logUserActivity('AUTH_KICK', `สั่งเตะผู้ใช้ ${targetUsername} ออกจากระบบ`, targetUsername);
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
                <button class="btn btn-sm btn-secondary" onclick="openEditUserModal('${u.id}')" title="แก้ไขข้อมูล">
                    <i class="fa-solid fa-pen-to-square" style="color:var(--primary);"></i> แก้ไข
                </button>
            </td>
            <td style="text-align:center;">
                ${(!isAdminMain && !isSelf) ? `
                    <div style="display:flex; gap:4px; justify-content:center;">
                        <button class="btn btn-sm btn-warning" onclick="kickUserSession('${escapeHTML(u.username)}')" title="เตะผู้ใช้คนนี้ออกจากระบบทันที" style="background:#f59e0b; color:#fff; border:none;">
                            <i class="fa-solid fa-right-from-bracket"></i> เตะออก
                        </button>
                        <button class="btn btn-sm btn-danger" onclick="deleteUserAccount('${u.id}')" title="ลบบัญชี">
                            <i class="fa-solid fa-trash"></i> ลบ
                        </button>
                    </div>
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

// Global Exports
window.kickUserSession = kickUserSession;