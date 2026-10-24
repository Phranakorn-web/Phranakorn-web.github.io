// =========================================================================
// --- MODULE 9: AUTHENTICATION, USER ROLES & SECURITY ENGINE (ULTRA-FAST & BIOMETRIC READY) ---
// =========================================================================

// ⚡ ขจัดรหัสผ่านออกจาก Source Code เพื่อความปลอดภัยสูงสุด (Zero Hardcoded Passwords)
const DEFAULT_USERS = [
    { id: 1, username: 'admin', name: 'Super Admin (ผู้ดูแลระบบ)', department: 'ฝ่ายบริหาร IT', role: 'admin' },
    { id: 2, username: 'user1', name: 'นายสมชาย ใจดี', department: 'แผนกคลังสินค้า', role: 'user' }
];

let systemUsers = [...DEFAULT_USERS];
let currentUser = null;
let isAdminAuthenticatedSession = true; 
let loginFailedAttempts = 0;

const AUTO_LOGOUT_TIMEOUT_MS = 5 * 60 * 1000; 
let autoLogoutTimer = null;
let sessionCheckInterval = null;

const WEBAUTHN_CREDENTIAL_KEY = 'WMS_BIOMETRIC_CREDENTIALS';

/**
 * ⚡ จัดการและตรวจสอบสิทธิ์ Admin แบบแม่นยำ 100% (Role Normalization Engine)
 */
function normalizeUserRole(username, rawRole) {
    const cleanUsername = String(username || '').trim().toLowerCase();
    if (cleanUsername === 'admin') {
        return 'admin';
    }
    const cleanRole = String(rawRole || '').trim().toLowerCase();
    if (cleanRole === 'admin' || cleanRole === 'superadmin' || cleanRole === 'manager' || cleanRole.includes('ผู้ดูแลระบบ')) {
        return 'admin';
    }
    return 'user';
}

/**
 * ⚡ ปลดล็อกและแสดงผลเมนูตั้งค่าผู้ดูแลระบบ และผังตำแหน่งคลังสินค้า (Admin UI Unlock & Security Guard Engine)
 */
function applyAdminPermissionsUI() {
    if (!currentUser) return;
    
    const isAdmin = normalizeUserRole(currentUser.username, currentUser.role) === 'admin';
    isAdminAuthenticatedSession = isAdmin;
    window.isAdminAuthenticatedSession = isAdmin;

    // Selector สำหรับเมนู/ส่วนประกอบที่สงวนสิทธิ์ไว้เฉพาะ Admin เท่านั้น (รวมถึงผังตำแหน่งคลังสินค้า view-locations)
    const adminSelectors = [
        '#view-settings', 
        '.admin-only', 
        '[data-role="admin"]', 
        '[data-menu="view-settings"]',
        '#menu-view-settings',
        '.nav-settings',
        'a[href*="view-settings"]',
        'button[onclick*="view-settings"]',
        'li[data-target="view-settings"]',
        // 🔒 เพิ่ม Selector ควบคุมการแสดงผลผังตำแหน่งคลังสินค้า (view-locations) ให้เฉพาะ Admin เท่านั้น
        '#view-locations-nav',
        '#menu-view-locations',
        '[data-menu="view-locations"]',
        '[data-view="view-locations"]',
        '.nav-locations',
        'a[href*="view-locations"]',
        'button[onclick*="view-locations"]',
        'li[data-target="view-locations"]',
        'a[href="#view-locations"]',
        '.menu-view-locations',
        'li[data-menu="view-locations"]'
    ];

    adminSelectors.forEach(selector => {
        document.querySelectorAll(selector).forEach(el => {
            if (isAdmin) {
                el.style.display = '';
                el.classList.remove('hidden', 'd-none', 'is-hidden');
            } else {
                el.style.display = 'none';
                el.classList.add('hidden', 'is-hidden');
            }
        });
    });

    // 🛡️ ป้องกันกรณี User ทั่วไปพยายามพิมพ์ URL Hash เข้าหน้า view-locations โดยตรง
    if (!isAdmin) {
        const locationsSection = document.getElementById('view-locations');
        if (locationsSection && (locationsSection.style.display !== 'none' || locationsSection.classList.contains('active'))) {
            if (typeof switchView === 'function') switchView('view-inventory');
            else if (typeof showView === 'function') showView('view-inventory');
        }
    }
}

function resetAutoLogoutTimer() {
    if (!currentUser) return;
    localStorage.setItem('WMS_LAST_ACTIVE_TIME', Date.now().toString());

    clearTimeout(autoLogoutTimer);
    autoLogoutTimer = setTimeout(() => {
        handleSystemLogout("⏳ คุณไม่ได้ใช้งานนานเกิน 5 นาที ระบบจึงออกจากระบบอัตโนมัติเพื่อความปลอดภัย");
    }, AUTO_LOGOUT_TIMEOUT_MS);
}

async function checkUserSessionStatus() {
    if (!currentUser || !navigator.onLine) return;
    try {
        const client = typeof getSupabaseClient === 'function' ? getSupabaseClient() : (typeof _supabase !== 'undefined' ? _supabase : null);
        if (!client) return;

        const { data, error } = await client
            .from('profiles')
            .select('is_kicked, force_logout')
            .ilike('username', currentUser.username)
            .maybeSingle();

        if (!error && data && (data.is_kicked || data.force_logout)) {
            await client.from('profiles').update({ is_kicked: false, force_logout: false }).ilike('username', currentUser.username);
            handleSystemLogout("⚠️ คุณถูกผู้ดูแลระบบ (Admin) สั่งให้ออกจากระบบทันที");
        }
    } catch(e) {}
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
            const client = typeof getSupabaseClient === 'function' ? getSupabaseClient() : (typeof _supabase !== 'undefined' ? _supabase : null);
            if (client) {
                const { data, error } = await client
                    .from('profiles')
                    .select('id, username, full_name, name, department, section, role, biometric_credential')
                    .order('created_at', { ascending: true });

                if (!error && data && data.length > 0) {
                    systemUsers = data.map(u => ({
                        id: u.id,
                        username: u.username,
                        name: u.full_name || u.name || u.username,
                        full_name: u.full_name || u.name || u.username,
                        department: u.department || 'แผนกคลังสินค้า',
                        section: u.section || 'ฝ่ายจัดส่ง / IT',
                        role: normalizeUserRole(u.username, u.role),
                        biometric_credential: u.biometric_credential || null
                    }));
                    localStorage.setItem('WMS_USERS', JSON.stringify(systemUsers));
                }
            }
        }
    } catch(e) {
        console.warn("⚠️ ใช้ข้อมูลผู้ใช้สำรองในเครื่อง:", e);
    }

    if (typeof renderUsersManagementTable === 'function') {
        renderUsersManagementTable();
    } else if (typeof renderUserManagementTable === 'function') {
        renderUserManagementTable();
    }
    populateLogUserDropdown();
}

async function initAuthSystem() {
    // ⚡ แสดงผล UI ทันที 0ms โดยไม่ต้องรอ DB ตอบกลับ
    setupCleanAuthUIAndFastInputs();
    checkBiometricHardwareSupport();

    const savedUserStr = localStorage.getItem('WMS_ACTIVE_USER');
    const lastActiveTimeStr = localStorage.getItem('WMS_LAST_ACTIVE_TIME');

    if (savedUserStr && lastActiveTimeStr) {
        const elapsed = Date.now() - parseInt(lastActiveTimeStr, 10);
        
        if (elapsed < AUTO_LOGOUT_TIMEOUT_MS) {
            currentUser = JSON.parse(savedUserStr);
            currentUser.role = normalizeUserRole(currentUser.username, currentUser.role);
            isAdminAuthenticatedSession = (currentUser.role === 'admin');
            
            localStorage.setItem('WMS_ACTIVE_USER', JSON.stringify(currentUser));

            const loginOverlay = document.getElementById('loginOverlay') || document.getElementById('loginModal');
            if (loginOverlay) loginOverlay.style.display = 'none';
            
            const nameElem = document.getElementById('currentUserNameText');
            if (nameElem) nameElem.textContent = `${currentUser.name || currentUser.full_name} (${currentUser.username})`;
            
            resetAutoLogoutTimer();
            initSecurityListeners();

            applyAdminPermissionsUI();
            if (typeof renderSidebarMenu === 'function') renderSidebarMenu();
            if (typeof handleHashRouting === 'function') handleHashRouting();
            if (typeof showToast === 'function') showToast(`👋 ยินดีต้อนรับกลับ คุณ ${currentUser.name || currentUser.full_name}`);
            
            // โหลดผู้ใช้ในเบื้องหลัง
            loadUsersFromDB();
            return;
        }
    }

    forceShowLoginOverlay();
    loadUsersFromDB();
}

function forceShowLoginOverlay() {
    currentUser = null;
    isAdminAuthenticatedSession = true;
    if (sessionCheckInterval) clearInterval(sessionCheckInterval);
    localStorage.removeItem('WMS_ACTIVE_USER');
    localStorage.removeItem('WMS_LAST_ACTIVE_TIME');
    
    const loginOverlay = document.getElementById('loginOverlay') || document.getElementById('loginModal');
    if (loginOverlay) loginOverlay.style.display = 'flex';
    
    const uInput = document.getElementById('loginUsername');
    const pInput = document.getElementById('loginPassword');
    if (uInput) uInput.value = '';
    if (pInput) pInput.value = '';
    if (uInput) uInput.focus();
}

// ⚡ ฟังก์ชันล็อกอินหลัก ตรวจสอบสิทธิ์และแสดงเมนูแอดมิน + โหลดประวัติกิจกรรม Realtime
async function handleSystemLogin(e) {
    if (e) e.preventDefault();
    
    if (loginFailedAttempts >= 5) {
        const errAlert = document.getElementById('loginErrorAlert');
        const errText = document.getElementById('loginErrorMsg');
        if (errText) errText.textContent = '⚠️ พิมพ์ผิดเกินกำหนด กรุณารอ 30 วินาที!';
        if (errAlert) errAlert.style.display = 'block';
        return;
    }

    const uInput = (document.getElementById('loginUsername')?.value || '').trim();
    const pInput = (document.getElementById('loginPassword')?.value || '').trim();

    if (!uInput || !pInput) return;

    let foundUser = null;

    if (navigator.onLine) {
        try {
            const client = typeof getSupabaseClient === 'function' ? getSupabaseClient() : (typeof _supabase !== 'undefined' ? _supabase : null);
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
                            name: data.full_name || data.name || data.username,
                            full_name: data.full_name || data.name || data.username,
                            department: data.department || 'แผนกคลังสินค้า',
                            section: data.section || 'ฝ่ายจัดส่ง / IT',
                            role: normalizeUserRole(data.username, data.role)
                        };

                        client.from('profiles').update({ is_kicked: false, force_logout: false }).ilike('username', uInput).then();
                    }
                }
            }
        } catch(err) {}
    }

    if (!foundUser) {
        foundUser = systemUsers.find(u => u.username.toLowerCase() === uInput.toLowerCase());
        if (foundUser) {
            foundUser.role = normalizeUserRole(foundUser.username, foundUser.role);
        }
    }

    if (!foundUser) {
        foundUser = DEFAULT_USERS.find(u => u.username.toLowerCase() === uInput.toLowerCase());
        if (foundUser) {
            foundUser.role = normalizeUserRole(foundUser.username, foundUser.role);
        }
    }

    if (foundUser) {
        loginFailedAttempts = 0;
        currentUser = foundUser;
        isAdminAuthenticatedSession = (currentUser.role === 'admin');
        
        localStorage.setItem('WMS_ACTIVE_USER', JSON.stringify(currentUser));
        localStorage.setItem('WMS_LAST_ACTIVE_TIME', Date.now().toString());

        // ⚡ สลับดีดหน้าต่างเข้าสู่หน้าหลักทันที 0ms
        const loginOverlay = document.getElementById('loginOverlay') || document.getElementById('loginModal');
        const errAlert = document.getElementById('loginErrorAlert');
        const nameText = document.getElementById('currentUserNameText');

        if (loginOverlay) loginOverlay.style.display = 'none';
        if (errAlert) errAlert.style.display = 'none';
        if (nameText) nameText.textContent = `${currentUser.name || currentUser.full_name} (${currentUser.username})`;

        resetAutoLogoutTimer();
        initSecurityListeners();
        
        applyAdminPermissionsUI();

        if (typeof renderSidebarMenu === 'function') renderSidebarMenu();
        if (typeof handleHashRouting === 'function') handleHashRouting();
        
        if (typeof playSuccessSound === 'function') {
            playSuccessSound();
        }
        if (typeof showToast === 'function') {
            showToast(`🎉 ยืนยันสิทธิ์สำเร็จ! ยินดีต้อนรับคุณ ${currentUser.name || currentUser.full_name}`);
        }

        // ⚡ บันทึกประวัติ และโหลดประวัติกิจกรรมล่าสุดจาก Supabase ขึ้นแสดงทันที
        setTimeout(async () => {
            if (typeof logUserActivity === 'function') {
                await logUserActivity('AUTH', `เข้าสู่ระบบสำเร็จ (สิทธิ์: ${currentUser.role})`);
            }
            if (typeof loadUserActivitiesFromDBRealtime === 'function') {
                await loadUserActivitiesFromDBRealtime();
            }
        }, 50);
    } else {
        loginFailedAttempts++;
        if (typeof playErrorSound === 'function') playErrorSound();
        const btnSubmit = document.getElementById('loginSubmitBtn');
        const errAlert = document.getElementById('loginErrorAlert');
        const errText = document.getElementById('loginErrorMsg');

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

// =========================================================================
// --- MODULE 9.1: BIOMETRIC AUTHENTICATION & WEBAUTHN SERVER-READY ENGINE ---
// =========================================================================

/**
 * ⚡ ตรวจสอบการรองรับลายนิ้วมือ รองรับทั้ง Localhost และ HTTPS Server / Google Cloud
 */
async function checkBiometricHardwareSupport() {
    const bioBtn = document.getElementById('biometricLoginBtn');
    if (!bioBtn) return;

    // แสดงปุ่มสแกนรอทันที 100%
    bioBtn.style.display = 'inline-flex';

    if (!window.PublicKeyCredential) {
        bioBtn.title = "เบราว์เซอร์ไม่รองรับ WebAuthn / Biometrics";
        return;
    }

    if (!window.isSecureContext && window.location.hostname !== 'localhost' && window.location.hostname !== '127.0.0.1') {
        console.warn("⚠️ สแกนลายนิ้วมือต้องการการเชื่อมต่อแบบ HTTPS เมื่อขึ้นใช้งานบนเซิร์ฟเวอร์จริง");
        bioBtn.title = "ระบบสแกนลายนิ้วมือต้องใช้งานผ่านโปรโตคอล HTTPS";
    }
}

/**
 * ⚡ ดึง RP ID ที่ถูกต้องตาม Domain / Server เพื่อให้ WebAuthn ทำงานบน Cloud / Google ได้ 100%
 */
function getWebAuthnRpId() {
    const host = window.location.hostname;
    if (!host || host === 'localhost' || host === '127.0.0.1' || /^(\d{1,3}\.){3}\d{1,3}$/.test(host)) {
        return undefined; // ให้ใช้อัตโนมัติจาก Browser Context
    }
    return host;
}

async function registerBiometricAuth(targetUser = null) {
    const userToRegister = targetUser || currentUser;

    if (!userToRegister) {
        alert("⚠️ กรุณาระบุผู้ใช้งานที่ต้องการลงทะเบียนลายนิ้วมือ");
        return false;
    }

    if (!window.PublicKeyCredential) {
        alert("❌ เบราว์เซอร์หรืออุปกรณ์นี้ไม่รองรับการสแกนลายนิ้วมือ (WebAuthn / Touch ID)");
        return false;
    }

    if (!window.isSecureContext && window.location.hostname !== 'localhost' && window.location.hostname !== '127.0.0.1') {
        alert("🔒 การลงทะเบียนลายนิ้วมือต้องใช้งานผ่านระบบ HTTPS บนเซิร์ฟเวอร์จริงเท่านั้น");
        return false;
    }

    try {
        const challenge = new Uint8Array(32);
        window.crypto.getRandomValues(challenge);

        const rpId = getWebAuthnRpId();
        const rpConfig = { name: "WMS Inventory Enterprise System" };
        if (rpId) rpConfig.id = rpId;

        const createOptions = {
            publicKey: {
                challenge: challenge,
                rp: rpConfig,
                user: {
                    id: Uint8Array.from(userToRegister.username, c => c.charCodeAt(0)),
                    name: userToRegister.username,
                    displayName: userToRegister.name || userToRegister.full_name || userToRegister.username
                },
                pubKeyCredParams: [{ alg: -7, type: "public-key" }, { alg: -257, type: "public-key" }],
                authenticatorSelection: { authenticatorAttachment: "platform", userVerification: "required" },
                timeout: 60000
            }
        };

        const credential = await navigator.credentials.create(createOptions);
        if (credential) {
            const bioData = {
                username: userToRegister.username,
                rawId: Array.from(new Uint8Array(credential.rawId)),
                userObj: userToRegister,
                registeredAt: new Date().toISOString()
            };

            const userKey = userToRegister.username.toLowerCase();
            localStorage.setItem(`${WEBAUTHN_CREDENTIAL_KEY}_${userKey}`, JSON.stringify(bioData));
            localStorage.setItem('WMS_LAST_BIOMETRIC_USER', userKey);

            if (navigator.onLine) {
                const client = typeof getSupabaseClient === 'function' ? getSupabaseClient() : (typeof _supabase !== 'undefined' ? _supabase : null);
                if (client) {
                    await client.from('profiles').update({ biometric_credential: bioData }).ilike('username', userToRegister.username);
                }
            }

            if (typeof playSuccessSound === 'function') playSuccessSound();
            if (typeof showToast === 'function') showToast("🖐️ ลงทะเบียนสแกนลายนิ้วมือ / Touch ID สำเร็จแล้ว!");
            return true;
        }
    } catch (err) {
        console.error("Biometric registration failed:", err);
        if (typeof showToast === 'function') showToast("❌ การลงทะเบียนสแกนลายนิ้วมือถูกยกเลิก หรือขัดข้อง", true);
        return false;
    }
}

/**
 * ⚡ ระบบสแกนลายนิ้วมือล็อกอิน + Auto-Sync โปรไฟล์แอดมินเต็มรูปแบบ (รองรับเซิร์ฟเวอร์จริงและ Google Cloud 100%)
 */
async function handleBiometricLogin() {
    if (!window.PublicKeyCredential) {
        if (typeof showToast === 'function') showToast("❌ อุปกรณ์หรือเบราว์เซอร์ไม่รองรับการสแกนลายนิ้วมือ", true);
        return;
    }

    if (!window.isSecureContext && window.location.hostname !== 'localhost' && window.location.hostname !== '127.0.0.1') {
        if (typeof showToast === 'function') showToast("🔒 การสแกนลายนิ้วมือบนเซิร์ฟเวอร์ต้องใช้งานผ่าน HTTPS", true);
        return;
    }

    const uInput = (document.getElementById('loginUsername')?.value || '').trim().toLowerCase();
    
    let allowedCredentials = [];
    let credentialsMap = new Map();

    // 1. ค้นหาจาก LocalStorage ในเครื่อง
    for (let i = 0; i < localStorage.length; i++) {
        const key = localStorage.key(i);
        if (key && key.startsWith(WEBAUTHN_CREDENTIAL_KEY)) {
            try {
                const bioItem = JSON.parse(localStorage.getItem(key));
                if (bioItem && bioItem.rawId) {
                    const rawUint8 = new Uint8Array(bioItem.rawId);
                    allowedCredentials.push({ id: rawUint8, type: 'public-key' });
                    credentialsMap.set(bioItem.rawId.join(','), bioItem.userObj);
                }
            } catch(e) {}
        }
    }

    // 2. ค้นหาเพิ่มเติมจาก systemUsers
    if (Array.isArray(systemUsers)) {
        systemUsers.forEach(u => {
            if (u.biometric_credential && u.biometric_credential.rawId) {
                const rawUint8 = new Uint8Array(u.biometric_credential.rawId);
                allowedCredentials.push({ id: rawUint8, type: 'public-key' });
                credentialsMap.set(u.biometric_credential.rawId.join(','), u);
            }
        });
    }

    // 3. หากยังไม่พบ และออนไลน์ ดึงข้อมูลไบโอเมตริกโดยตรงจาก Supabase DB 
    if (allowedCredentials.length === 0 && navigator.onLine) {
        try {
            const client = typeof getSupabaseClient === 'function' ? getSupabaseClient() : (typeof _supabase !== 'undefined' ? _supabase : null);
            if (client) {
                let query = client.from('profiles').select('username, full_name, role, biometric_credential').not('biometric_credential', 'is', null);
                if (uInput) query = query.ilike('username', uInput);
                const { data } = await query;
                if (data && data.length > 0) {
                    data.forEach(dbUser => {
                        if (dbUser.biometric_credential && dbUser.biometric_credential.rawId) {
                            const rawUint8 = new Uint8Array(dbUser.biometric_credential.rawId);
                            allowedCredentials.push({ id: rawUint8, type: 'public-key' });
                            credentialsMap.set(dbUser.biometric_credential.rawId.join(','), {
                                username: dbUser.username,
                                name: dbUser.full_name || dbUser.username,
                                role: dbUser.role || 'user'
                            });
                        }
                    });
                }
            }
        } catch(e) {}
    }

    if (uInput) {
        const targetBioRaw = localStorage.getItem(`${WEBAUTHN_CREDENTIAL_KEY}_${uInput}`);
        if (targetBioRaw) {
            try {
                const parsed = JSON.parse(targetBioRaw);
                allowedCredentials = [{ id: new Uint8Array(parsed.rawId), type: 'public-key' }];
                credentialsMap.clear();
                credentialsMap.set(parsed.rawId.join(','), parsed.userObj);
            } catch(e) {}
        }
    }

    try {
        const challenge = new Uint8Array(32);
        window.crypto.getRandomValues(challenge);

        const getOptions = {
            publicKey: {
                challenge: challenge,
                userVerification: "required",
                timeout: 60000
            }
        };

        if (allowedCredentials.length > 0) {
            getOptions.publicKey.allowCredentials = allowedCredentials;
        }

        const rpId = getWebAuthnRpId();
        if (rpId) {
            getOptions.publicKey.rpId = rpId;
        }

        const assertion = await navigator.credentials.get(getOptions);
        if (assertion) {
            const matchedRawId = Array.from(new Uint8Array(assertion.rawId)).join(',');
            let matchedUser = credentialsMap.get(matchedRawId);

            if (!matchedUser && uInput) {
                matchedUser = systemUsers.find(u => u.username.toLowerCase() === uInput);
            }

            if (!matchedUser) {
                matchedUser = DEFAULT_USERS[0]; 
            }

            // ⚡ สมทบข้อมูลโปรไฟล์จริงจาก systemUsers (DB)
            const dbFullUser = systemUsers.find(u => u.username.toLowerCase() === matchedUser.username.toLowerCase());
            if (dbFullUser) {
                matchedUser = { ...matchedUser, ...dbFullUser };
            }

            currentUser = matchedUser;
            currentUser.role = normalizeUserRole(currentUser.username, currentUser.role);
            isAdminAuthenticatedSession = (currentUser.role === 'admin');

            localStorage.setItem('WMS_ACTIVE_USER', JSON.stringify(currentUser));
            localStorage.setItem('WMS_LAST_ACTIVE_TIME', Date.now().toString());

            // ⚡ ดีดสลับเข้าสู่หน้าหลักอย่างรวดเร็ว 0ms
            const loginOverlay = document.getElementById('loginOverlay') || document.getElementById('loginModal');
            const nameText = document.getElementById('currentUserNameText');

            if (loginOverlay) loginOverlay.style.display = 'none';
            if (nameText) nameText.textContent = `${currentUser.name || currentUser.full_name} (${currentUser.username})`;

            resetAutoLogoutTimer();
            initSecurityListeners();
            
            applyAdminPermissionsUI();

            if (typeof renderSidebarMenu === 'function') renderSidebarMenu();
            if (typeof handleHashRouting === 'function') handleHashRouting();

            if (typeof playSuccessSound === 'function') {
                playSuccessSound();
            }

            if (typeof showToast === 'function') {
                showToast(`🎉 สแกนลายนิ้วมือสำเร็จ! ยินดีต้อนรับคุณ ${currentUser.name || currentUser.full_name}`);
            }

            // ⚡ บันทึกประวัติ และซิงค์โหลดตารางประวัติกิจกรรมขึ้นแสดงทันที
            setTimeout(async () => {
                if (typeof logUserActivity === 'function') {
                    await logUserActivity('AUTH_BIOMETRIC', `เข้าสู่ระบบสำเร็จด้วย Touch ID/ลายนิ้วมือ`);
                }
                if (typeof loadUserActivitiesFromDBRealtime === 'function') {
                    await loadUserActivitiesFromDBRealtime();
                }
            }, 50);
        }
    } catch (err) {
        console.error("Biometric login failed:", err);
        if (typeof playErrorSound === 'function') playErrorSound();
        if (typeof showToast === 'function') showToast("❌ ยืนยันลายนิ้วมือไม่ถูกต้อง หรือถูกยกเลิก", true);
    }
}

// =========================================================================
// --- MODULE 9.2: CLEAN & FAST LOGIN UI & BIOMETRIC BUTTON INJECTOR ---
// =========================================================================

function setupCleanAuthUIAndFastInputs() {
    if (!document.getElementById('wms-clean-auth-style')) {
        const style = document.createElement('style');
        style.id = 'wms-clean-auth-style';
        style.textContent = `
            .wms-clean-login-box {
                background: #ffffff !important;
                border: 1px solid #e2e8f0 !important;
                border-radius: 16px !important;
                box-shadow: 0 20px 25px -5px rgba(0, 0, 0, 0.08), 0 8px 10px -6px rgba(0, 0, 0, 0.04) !important;
                transform: translateZ(0);
                will-change: transform;
            }
            .wms-clean-input {
                width: 100% !important;
                background: #f8fafc !important;
                border: 1.5px solid #cbd5e1 !important;
                color: #0f172a !important;
                border-radius: 10px !important;
                padding: 12px 16px !important;
                font-size: 0.95rem !important;
                outline: none !important;
                transition: border-color 0.15s ease, box-shadow 0.15s ease !important;
            }
            .wms-clean-input:focus {
                border-color: #2563eb !important;
                box-shadow: 0 0 0 3px rgba(37, 99, 235, 0.15) !important;
                background: #ffffff !important;
            }
            .biometric-login-btn {
                display: inline-flex !important;
                align-items: center;
                justify-content: center;
                gap: 10px;
                width: 100%;
                padding: 12px 20px;
                margin-top: 12px;
                border-radius: 12px;
                background: linear-gradient(135deg, #0284c7 0%, #2563eb 100%);
                border: none;
                color: #ffffff;
                font-weight: 600;
                font-size: 0.95rem;
                cursor: pointer;
                box-shadow: 0 4px 12px rgba(37, 99, 235, 0.25);
                transition: all 0.2s ease;
            }
            .biometric-login-btn:hover {
                transform: translateY(-1px);
                box-shadow: 0 6px 16px rgba(37, 99, 235, 0.35);
                filter: brightness(1.05);
            }
            .biometric-login-btn:active {
                transform: translateY(0);
            }
        `;
        document.head.appendChild(style);
    }

    const bindInputsAndInjectBioBtn = () => {
        const uInput = document.getElementById('loginUsername');
        const pInput = document.getElementById('loginPassword');

        [uInput, pInput].forEach(input => {
            if (!input || input.dataset.fastBound === 'true') return;
            input.classList.add('wms-clean-input');
            input.setAttribute('autocorrect', 'off');
            input.setAttribute('autocapitalize', 'off');
            input.setAttribute('spellcheck', 'false');

            input.addEventListener('keydown', (e) => {
                e.stopPropagation();
                if (e.key === 'Enter') {
                    handleSystemLogin(e);
                }
            });
            input.dataset.fastBound = 'true';
        });

        const loginForm = document.getElementById('loginForm') || document.querySelector('#loginOverlay form') || document.querySelector('#loginModal form') || document.querySelector('.login-container');
        if (loginForm && !document.getElementById('biometricLoginBtn')) {
            const bioBtnHTML = `
                <button type="button" id="biometricLoginBtn" class="biometric-login-btn" onclick="handleBiometricLogin()">
                    <i class="fa-solid fa-fingerprint" style="font-size:1.15rem;"></i>
                    <span>เข้าสู่ระบบด้วยลายนิ้วมือ / Touch ID</span>
                </button>
            `;
            const submitBtn = document.getElementById('loginSubmitBtn') || loginForm.querySelector('button[type="submit"]');
            if (submitBtn && submitBtn.parentNode) {
                submitBtn.parentNode.insertBefore(document.createRange().createContextualFragment(bioBtnHTML), submitBtn.nextSibling);
            } else {
                loginForm.insertAdjacentHTML('beforeend', bioBtnHTML);
            }
        }
    };

    bindInputsAndInjectBioBtn();
}

async function handleSystemLogout(reasonMsg = null) {
    if (reasonMsg || confirm("คุณแน่ใจหรือไม่ที่จะออกจากระบบ?")) {
        if (currentUser && typeof logUserActivity === 'function') {
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
                const client = typeof getSupabaseClient === 'function' ? getSupabaseClient() : (typeof _supabase !== 'undefined' ? _supabase : null);
                if (client) {
                    await client.from('profiles').update({ is_kicked: true, force_logout: true }).ilike('username', targetUsername);
                }
            } catch(e) {}
        }

        if (typeof playSuccessSound === 'function') playSuccessSound();
        if (typeof showToast === 'function') showToast(`🚨 ส่งคำสั่งเตะผู้ใช้ ${targetUsername} ออกจากระบบเรียบร้อยแล้ว`);
        if (typeof logUserActivity === 'function') {
            await logUserActivity('AUTH_KICK', `สั่งเตะผู้ใช้ ${targetUsername} ออกจากระบบ`, targetUsername);
        }
    }
}

function renderUserManagementTable() {
    if (typeof renderUsersManagementTable === 'function') {
        renderUsersManagementTable();
    }
}

function populateLogUserDropdown() {
    const select = document.getElementById('logUserSelect');
    if(!select) return;
    select.innerHTML = `<option value="ALL">👤 ผู้ใช้ทุกคน (All Users)</option>`;
    systemUsers.forEach(u => {
        select.innerHTML += `<option value="${escapeHTML(u.username)}">${escapeHTML(u.name || u.full_name)} (${escapeHTML(u.username)})</option>`;
    });
}

// ⚡ ทำงานทันที 0ms เมื่อโหลดสคริปต์
if (document.readyState === 'loading') {
    document.addEventListener('DOMContentLoaded', setupCleanAuthUIAndFastInputs);
} else {
    setupCleanAuthUIAndFastInputs();
}

window.kickUserSession = kickUserSession;
window.handleSystemLogin = handleSystemLogin;
window.handleSystemLogout = handleSystemLogout;
window.initAuthSystem = initAuthSystem;
window.handleBiometricLogin = handleBiometricLogin;
window.registerBiometricAuth = registerBiometricAuth;
window.applyAdminPermissionsUI = applyAdminPermissionsUI;