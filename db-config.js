// =========================================================================
// --- MODULE 1: SUPABASE CONFIGURATION & REALTIME CONNECTION ENGINE ---
// =========================================================================

const SUPABASE_CONFIG = {
    url: window.WMS_ENV?.SUPABASE_URL || 'https://eusuehaqgwkcgowsgyco.supabase.co',
    key: window.WMS_ENV?.SUPABASE_KEY || 'sb_publishable_ww-mPdyom_i6S4XhfAFj9Q_vFBpTuaE'
};

const _supabase = window.supabase.createClient(SUPABASE_CONFIG.url, SUPABASE_CONFIG.key, {
    auth: { persistSession: true, autoRefreshToken: true, detectSessionInUrl: true },
    global: { headers: { 'x-client-info': 'wms-master-app-fast' } },
    db: { schema: 'public' }
});

const QUEUE_KEY = 'WMS_OFFLINE_INBOUND_QUEUE';
const ACT_QUEUE_KEY = 'WMS_OFFLINE_ACTIVITY_QUEUE';
const USER_SESSION_KEY = 'WMS_CURRENT_USER_SESSION';
const INVENTORY_CACHE_KEY = 'WMS_INVENTORY_LOCAL_CACHE';

const readJSON = (k) => { try { return JSON.parse(localStorage.getItem(k) || '[]'); } catch (e) { return []; } };
let offlineInboundQueue = readJSON(QUEUE_KEY);
let offlineActivityQueue = readJSON(ACT_QUEUE_KEY);
let isOfflineMode = !navigator.onLine;
let isSyncing = false;
let lastSyncError = '';
let syncFailNotified = false;
let reloadTimer = null;
let totalDbRecordCount = 0;

function persistQueue() {
    try {
        localStorage.setItem(QUEUE_KEY, JSON.stringify(offlineInboundQueue));
        localStorage.setItem(ACT_QUEUE_KEY, JSON.stringify(offlineActivityQueue));
        return true;
    } catch (e) { return false; }
}

function clearOfflineInboundQueue() {
    if (offlineInboundQueue.length === 0) {
        if (typeof showToast === 'function') showToast("ℹ️ ไม่พบรายการค้างบันทึกในคิว");
        return;
    }

    if (confirm(`คุณต้องการลบ/ยกเลิกรายการรอบันทึกทั้งหมดจำนวน ${offlineInboundQueue.length} รายการออกใช่หรือไม่?`)) {
        const pendingSns = new Set(offlineInboundQueue.map(i => String(i.sn).toLowerCase()));
        
        offlineInboundQueue = [];
        persistQueue();

        if (typeof globalInventoryData !== 'undefined') {
            globalInventoryData = globalInventoryData.filter(i => !i._pending && !pendingSns.has(String(i.sn).toLowerCase()));
        }
        if (typeof recentInboundList !== 'undefined') {
            recentInboundList = recentInboundList.filter(i => !i.isOffline);
        }

        if (typeof rebuildOccupiedSet === 'function') rebuildOccupiedSet();
        if (typeof filterInventoryData === 'function') filterInventoryData();
        if (typeof updateKPIs === 'function') updateKPIs();
        if (typeof renderLiveInboundFeed === 'function') renderLiveInboundFeed();
        updateOnlineOfflineUI(navigator.onLine);

        if (typeof playSuccessSound === 'function') playSuccessSound();
        if (typeof showToast === 'function') showToast("🗑️ ลบรายการรอบันทึกค้างทั้งหมดเรียบร้อยแล้ว");
    }
}

function removePendingItemBySn(sn) {
    const targetSn = String(sn).trim().toLowerCase();
    
    offlineInboundQueue = offlineInboundQueue.filter(i => String(i.sn).trim().toLowerCase() !== targetSn);
    persistQueue();

    if (typeof globalInventoryData !== 'undefined') {
        globalInventoryData = globalInventoryData.filter(i => String(i.sn).trim().toLowerCase() !== targetSn || !i._pending);
    }
    if (typeof recentInboundList !== 'undefined') {
        recentInboundList = recentInboundList.filter(i => String(i.sn).trim().toLowerCase() !== targetSn || !i.isOffline);
    }

    if (typeof rebuildOccupiedSet === 'function') rebuildOccupiedSet();
    if (typeof filterInventoryData === 'function') filterInventoryData();
    if (typeof updateKPIs === 'function') updateKPIs();
    if (typeof renderLiveInboundFeed === 'function') renderLiveInboundFeed();
    updateOnlineOfflineUI(navigator.onLine);

    if (typeof playSuccessSound === 'function') playSuccessSound();
    if (typeof showToast === 'function') showToast(`🗑️ ยกเลิก S/N: ${sn} จากคิวรอบันทึกเรียบร้อยแล้ว`);
}

function isPendingSn(sn) {
    const k = String(sn || '').toLowerCase();
    return offlineInboundQueue.some(p => String(p.sn).toLowerCase() === k);
}

function guardPendingSn(sn) {
    if (isPendingSn(sn)) { 
        if (typeof playErrorSound === 'function') playErrorSound(); 
        const safeSn = typeof escapeHTML === 'function' ? escapeHTML(sn) : sn;
        if (typeof showToast === 'function') showToast(`⏳ S/N ${safeSn} ยังรอบันทึกเข้า DB กรุณารอซิงค์เสร็จก่อน`, true); 
        return true; 
    }
    return false;
}

function requireOnline(msg) {
    if (!navigator.onLine) { 
        if (typeof playErrorSound === 'function') playErrorSound(); 
        if (typeof showToast === 'function') showToast(`📴 ${msg || 'ทำรายการนี้ต้องเชื่อมต่ออินเทอร์เน็ต'}`, true); 
        return false; 
    }
    return true;
}

function sanitizeForDb(item) {
    return {
        category: String(item.category || 'N/A').trim(),
        name: String(item.name || '-').trim(),
        sn: String(item.sn).trim(),
        meter: parseInt(item.meter) || 0,
        location: String(item.location || 'DOCK').trim(),
        qty: parseInt(item.qty) || 1,
        created_at: item.created_at || new Date().toISOString()
    };
}

async function loadDataFromDatabase() {
    const cachedData = readJSON(INVENTORY_CACHE_KEY);
    if (cachedData && cachedData.length > 0) {
        if (typeof globalInventoryData !== 'undefined') globalInventoryData = cachedData;
        totalDbRecordCount = cachedData.length;
        if (typeof rebuildOccupiedSet === 'function') rebuildOccupiedSet();
        if (typeof filterInventoryData === 'function') filterInventoryData();
        if (typeof updateKPIs === 'function') updateKPIs();
        updateOnlineOfflineUI(navigator.onLine);
    }

    if (!navigator.onLine) return cachedData || [];

    try {
        const startTime = performance.now();
        let allData = [];
        let from = 0;
        const step = 1000;
        let hasMore = true;

        while (hasMore) {
            const { data, error } = await _supabase
                .from('warehouse_items')
                .select('id, category, name, sn, meter, location, qty, created_at')
                .order('created_at', { ascending: false })
                .range(from, from + step - 1);

            if (error) throw error;

            if (data && data.length > 0) {
                allData = allData.concat(data);
                from += data.length;
                if (data.length < step) hasMore = false;
            } else {
                hasMore = false;
            }
        }

        const duration = Math.round(performance.now() - startTime);
        
        if (allData.length > 0) {
            try { localStorage.setItem(INVENTORY_CACHE_KEY, JSON.stringify(allData)); } catch(e) {}
            if (typeof globalInventoryData !== 'undefined') globalInventoryData = allData;
            totalDbRecordCount = allData.length;

            if (typeof rebuildOccupiedSet === 'function') rebuildOccupiedSet();
            if (typeof filterInventoryData === 'function') filterInventoryData();
            if (typeof updateKPIs === 'function') updateKPIs();
            updateOnlineOfflineUI(true);
            console.log(`⚡ [Instant DB Engine] โหลดข้อมูลครบถ้วน: ${totalDbRecordCount} รายการ (${duration} ms)`);
        }

        if (typeof fetchTotalMasterProductsCount === 'function') {
            fetchTotalMasterProductsCount();
        }

        if (typeof loadMasterProductsFromDB === 'function') {
            loadMasterProductsFromDB();
        }

        return allData;
    } catch (err) {
        console.error('❌ ดึงข้อมูลจาก DB ขัดข้อง:', err);
        return cachedData || [];
    }
}

async function fetchTotalDatabaseCount() {
    if (!navigator.onLine) return totalDbRecordCount;
    try {
        const { count, error } = await _supabase
            .from('warehouse_items')
            .select('*', { count: 'exact', head: true });
        if (!error && count !== null) {
            totalDbRecordCount = count;
        }
    } catch (e) {
        console.warn('Fast DB count query warning:', e);
    }
    return totalDbRecordCount;
}

function initOfflineSyncEngine() {
    updateOnlineOfflineUI(navigator.onLine);
    
    loadDataFromDatabase();

    window.addEventListener('online', () => {
        updateOnlineOfflineUI(true);
        if (typeof showToast === 'function') showToast('🌐 อินเทอร์เน็ตกลับมาแล้ว กำลังบันทึกข้อมูลเข้า DB...');
        syncOfflineQueueToDatabase();
    });

    window.addEventListener('offline', () => {
        updateOnlineOfflineUI(false);
        if (typeof showToast === 'function') showToast('📴 สัญญาณอินเทอร์เน็ตขาดหายไป: ระบบเปลี่ยนเป็นโหมดออฟไลน์', true);
    });

    window.addEventListener('beforeunload', (e) => {
        if (offlineInboundQueue.length) { e.preventDefault(); e.returnValue = ''; }
    });
    
    setInterval(() => {
        if (offlineInboundQueue.length || offlineActivityQueue.length) {
            syncOfflineQueueToDatabase();
        } else if (navigator.onLine) {
            fetchTotalDatabaseCount().then(() => {
                updateOnlineOfflineUI(true);
                if (typeof fetchTotalMasterProductsCount === 'function') fetchTotalMasterProductsCount();
                if (typeof refreshInventoryDataSilently === 'function') refreshInventoryDataSilently();
            });
        }
    }, 4000);
}

function updateOnlineOfflineUI(isOnline) {
    isOfflineMode = !isOnline;
    const n = offlineInboundQueue.length;
    const banner = document.getElementById('offlineNoticeBanner');
    const badge = document.getElementById('offlineQueueBadge');
    const dbStatusText = document.getElementById('dbStatusText');
    const hdr = document.getElementById('liveInboundHeaderBadge');

    if (badge) badge.textContent = n.toLocaleString();

    if (banner) {
        banner.style.display = 'none';
    }

    if (hdr) {
        if (!isOnline) { 
            hdr.className = 'status-badge warning'; 
            hdr.innerHTML = `<i class="fa-solid fa-wifi"></i> ออฟไลน์ · รอซิงค์ ${n} (DB: ${totalDbRecordCount.toLocaleString()} รายการ)`; 
        } else if (n > 0) { 
            hdr.className = 'status-badge warning'; 
            hdr.innerHTML = `<i class="fa-solid fa-rotate ${isSyncing ? 'fa-spin' : ''}"></i> รอบันทึก ${n} (DB: ${totalDbRecordCount.toLocaleString()} รายการ)`; 
        } else { 
            hdr.className = 'status-badge'; 
            hdr.innerHTML = `<span class="pulse-dot"></span> เชื่อมต่อ DB แล้ว (${totalDbRecordCount.toLocaleString()} รายการ)`; 
        }
    }

    if (dbStatusText) {
        if (!isOnline) {
            dbStatusText.textContent = `📴 ออฟไลน์ (Offline Mode) | ข้อมูลใน DB: ${totalDbRecordCount.toLocaleString()} รายการ`;
            dbStatusText.style.color = 'var(--warning, #f59e0b)';
        } else if (n > 0) {
            dbStatusText.textContent = `🟡 รอบันทึก ${n} รายการ | ข้อมูลใน DB: ${totalDbRecordCount.toLocaleString()} รายการ`;
            dbStatusText.style.color = 'var(--warning, #f59e0b)';
        } else {
            dbStatusText.textContent = `🟢 เชื่อมต่อ DB สมบูรณ์ | ข้อมูลใน DB: ${totalDbRecordCount.toLocaleString()} รายการ`;
            dbStatusText.style.color = 'var(--success, #10b981)';
        }
    }
}

async function syncOfflineQueueToDatabase() {
    if (isSyncing || !navigator.onLine) return;
    if (!offlineInboundQueue.length && !offlineActivityQueue.length) return;

    isSyncing = true; lastSyncError = '';
    updateOnlineOfflineUI(true);

    const doneInboundSns = new Set();
    let saved = 0, dup = 0;
    const batch = [...offlineInboundQueue];

    try {
        if (batch.length > 0) {
            const batchSns = batch.map(i => String(i.sn).trim());
            
            const { data: existingList } = await _supabase
                .from('warehouse_items')
                .select('sn')
                .in('sn', batchSns);

            const existingSet = new Set((existingList || []).map(e => String(e.sn).trim().toLowerCase()));

            const itemsToInsert = [];
            for (const rawItem of batch) {
                const snKey = String(rawItem.sn).trim().toLowerCase();
                if (existingSet.has(snKey)) {
                    dup++;
                    doneInboundSns.add(snKey);
                } else {
                    itemsToInsert.push({ cleanPayload: sanitizeForDb(rawItem), snKey });
                }
            }

            if (itemsToInsert.length > 0) {
                const payloads = itemsToInsert.map(x => x.cleanPayload);
                const { error } = await _supabase.from('warehouse_items').insert(payloads);

                if (!error) {
                    itemsToInsert.forEach(x => {
                        saved++;
                        doneInboundSns.add(x.snKey);
                    });
                } else if (error.code === '23505') {
                    for (const item of itemsToInsert) {
                        const { error: singleErr } = await _supabase.from('warehouse_items').insert([item.cleanPayload]);
                        if (!singleErr || singleErr.code === '23505') {
                            if (!singleErr) saved++; else dup++;
                            doneInboundSns.add(item.snKey);
                        } else {
                            lastSyncError = singleErr.message;
                        }
                    }
                } else {
                    lastSyncError = error.message;
                }
            }
        }

        if (offlineActivityQueue.length) {
            const acts = [...offlineActivityQueue];
            const { error } = await _supabase.from('user_activities').insert(acts);
            if (!error) offlineActivityQueue = offlineActivityQueue.filter(a => !acts.includes(a));
        }
    } catch (e) {
        lastSyncError = (e && e.message) || 'sync error';
    }

    offlineInboundQueue = offlineInboundQueue.filter(p => !doneInboundSns.has(String(p.sn).trim().toLowerCase()));
    persistQueue();

    if (typeof globalInventoryData !== 'undefined') {
        globalInventoryData.forEach(item => {
            if (doneInboundSns.has(String(item.sn).trim().toLowerCase())) {
                delete item._pending;
            }
        });
    }

    isSyncing = false;
    await fetchTotalDatabaseCount();
    if (typeof renderLiveInboundFeed === 'function') renderLiveInboundFeed();
    updateOnlineOfflineUI(navigator.onLine);

    if (saved + dup > 0) {
        syncFailNotified = false;
        if (typeof playSuccessSound === 'function') playSuccessSound();
        if (typeof showToast === 'function') showToast(`✅ บันทึกเข้าฐานข้อมูลสำเร็จ ${saved} รายการ${dup ? ` (ข้าม S/N ที่มีใน DB แล้ว ${dup})` : ''}`);
        if (typeof logUserActivity === 'function') logUserActivity('OFFLINE_SYNC', `ซิงค์รายการรับเข้า ${saved} รายการเข้า DB`);
        if (offlineInboundQueue.length === 0) {
            updateDBConnectionStatus(true, '(ซิงค์ครบ 100%)');
            await loadDataFromDatabase();
        }
    }
}

function updateDBConnectionStatus(isConnected, message = "") {
    const statusElem = document.getElementById('dbStatusText');
    const badgeElem = document.getElementById('dbStatusBadge');
    const nowStr = new Date().toLocaleTimeString('th-TH');

    if (!navigator.onLine) {
        if (statusElem) {
            statusElem.textContent = `📴 ออฟไลน์ (Offline Mode) | ข้อมูลใน DB: ${totalDbRecordCount.toLocaleString()} รายการ`;
            statusElem.style.color = 'var(--warning, #f59e0b)';
        }
        if (badgeElem) badgeElem.className = 'status-badge warning';
        return;
    }

    const statusMessage = isConnected 
        ? `🟢 Supabase Connected - ${nowStr} ${message} (จำนวนข้อมูล DB: ${totalDbRecordCount.toLocaleString()} รายการ)`
        : `🔴 DB Disconnected - ${nowStr} ${message}`;

    if (statusElem) {
        statusElem.textContent = statusMessage;
        statusElem.style.color = isConnected ? 'var(--success, #10b981)' : 'var(--danger, #ef4444)';
    }

    if (badgeElem) {
        badgeElem.className = isConnected ? 'status-badge' : 'status-badge warning';
    }
}

async function testDatabaseConnectionRealtime() {
    const btn = document.getElementById('testDbConnBtn');
    if (btn) btn.innerHTML = `<i class="fa-solid fa-spinner fa-spin"></i> กำลังทดสอบ...`;

    const startTime = performance.now();
    try {
        const { count, error } = await _supabase
            .from('warehouse_items')
            .select('*', { count: 'exact', head: true });

        const endTime = performance.now();
        const latency = Math.round(endTime - startTime);

        if (!error) {
            if (count !== null) totalDbRecordCount = count;
            if (typeof playSuccessSound === 'function') playSuccessSound();
            if (typeof showToast === 'function') showToast(`⚡ เชื่อมต่อ Supabase สำเร็จ! (Ping: ${latency} ms | จำนวน DB: ${totalDbRecordCount.toLocaleString()} รายการ)`);
            updateDBConnectionStatus(true, `(Ping: ${latency}ms)`);
            if (btn) btn.innerHTML = `<i class="fa-solid fa-plug-circle-check"></i> ทดสอบการเชื่อมต่อ Realtime 100%`;
            return true;
        } else {
            throw error;
        }
    } catch (err) {
        if (typeof playErrorSound === 'function') playErrorSound();
        if (typeof showToast === 'function') showToast(`❌ การเชื่อมต่อขัดข้อง: ${err.message}`, true);
        updateDBConnectionStatus(false, `(${err.message})`);
        if (btn) btn.innerHTML = `<i class="fa-solid fa-plug-circle-xmark"></i> ทดสอบเชื่อมต่ออีกครั้ง`;
        return false;
    }
}

const LOGIN_RATE_LIMIT = {
    attempts: 0,
    lockoutUntil: 0,
    maxAttempts: 5,
    lockoutDurationMs: 60 * 1000
};

async function loginUser(usernameInput, passwordInput) {
    const now = Date.now();
    
    if (LOGIN_RATE_LIMIT.lockoutUntil > now) {
        const remainingSec = Math.ceil((LOGIN_RATE_LIMIT.lockoutUntil - now) / 1000);
        const warnMsg = `🔒 ระบบล็อกชั่วคราว ป้องกันการสุ่มรหัสผ่าน กรุณารออีก ${remainingSec} วินาที`;
        if (typeof playErrorSound === 'function') playErrorSound();
        if (typeof showToast === 'function') showToast(warnMsg, true);
        return { success: false, message: warnMsg };
    }

    const cleanUser = String(usernameInput || '').trim();
    const cleanPass = String(passwordInput || '').trim();

    if (!cleanUser || !cleanPass) {
        if (typeof playErrorSound === 'function') playErrorSound();
        if (typeof showToast === 'function') showToast('⚠️ กรุณากรอกชื่อผู้ใช้และรหัสผ่านให้ครบถ้วน', true);
        return { success: false, message: 'กรุณากรอกข้อมูลให้ครบถ้วน' };
    }

    setLoginLoadingState(true);

    try {
        let userMatch = null;

        const { data: dbUsers, error: tableErr } = await _supabase
            .from('users')
            .select('id, username, email, password, name, role')
            .or(`username.eq.${cleanUser},email.eq.${cleanUser}`);

        if (!tableErr && dbUsers && dbUsers.length > 0) {
            userMatch = dbUsers.find(u => 
                (String(u.username || '').trim() === cleanUser || String(u.email || '').trim() === cleanUser) &&
                String(u.password || '').trim() === cleanPass
            );
        }

        if (!userMatch) {
            const { data: authData, error: authErr } = await _supabase.auth.signInWithPassword({
                email: cleanUser.includes('@') ? cleanUser : `${cleanUser}@domain.com`,
                password: cleanPass
            });

            if (!authErr && authData?.user) {
                userMatch = {
                    id: authData.user.id,
                    username: cleanUser,
                    name: authData.user.user_metadata?.full_name || cleanUser,
                    role: authData.user.user_metadata?.role || 'admin'
                };
            }
        }

        if (userMatch) {
            LOGIN_RATE_LIMIT.attempts = 0;
            
            const sessionData = {
                id: userMatch.id || Date.now(),
                username: userMatch.username || cleanUser,
                name: userMatch.name || userMatch.full_name || cleanUser,
                role: userMatch.role || 'user',
                loginTime: new Date().toISOString()
            };

            localStorage.setItem(USER_SESSION_KEY, JSON.stringify(sessionData));
            
            if (typeof playSuccessSound === 'function') playSuccessSound();
            if (typeof showToast === 'function') showToast(`🔓 เข้าสู่ระบบสำเร็จ! ยินดีต้อนรับ ${sessionData.name}`);
            
            const loginModal = document.getElementById('loginModal') || document.getElementById('loginSection');
            if (loginModal) loginModal.style.display = 'none';

            const mainContent = document.getElementById('mainAppContent');
            if (mainContent) mainContent.style.display = 'block';

            if (typeof updateUIAfterLogin === 'function') updateUIAfterLogin(sessionData);

            return { success: true, user: sessionData };
        } else {
            LOGIN_RATE_LIMIT.attempts += 1;
            if (LOGIN_RATE_LIMIT.attempts >= LOGIN_RATE_LIMIT.maxAttempts) {
                LOGIN_RATE_LIMIT.lockoutUntil = Date.now() + LOGIN_RATE_LIMIT.lockoutDurationMs;
            }

            if (typeof playErrorSound === 'function') playErrorSound();
            if (typeof showToast === 'color') showToast('❌ ชื่อผู้ใช้หรือรหัสผ่านไม่ถูกต้อง กรุณาลองใหม่อีกครั้ง', true);
            return { success: false, message: 'ชื่อผู้ใช้หรือรหัสผ่านไม่ถูกต้อง' };
        }

    } catch (err) {
        console.error('Login engine exception:', err);
        if (typeof playErrorSound === 'function') playErrorSound();
        if (typeof showToast === 'function') showToast(`❌ การเชื่อมต่อล็อกอินขัดข้อง: ${err.message}`, true);
        return { success: false, message: err.message };
    } finally {
        setLoginLoadingState(false);
    }
}

function setLoginLoadingState(isLoading) {
    const btn = document.getElementById('loginSubmitBtn') || document.querySelector('#loginForm button[type="submit"]');
    if (!btn) return;

    if (isLoading) {
        btn.disabled = true;
        btn.dataset.originHtml = btn.innerHTML;
        btn.innerHTML = `<i class="fa-solid fa-circle-notch fa-spin"></i> กำลังตรวจสอบระบบ...`;
    } else {
        btn.disabled = false;
        if (btn.dataset.originHtml) {
            btn.innerHTML = btn.dataset.originHtml;
        } else {
            btn.innerHTML = `<i class="fa-solid fa-right-to-bracket"></i> เข้าสู่ระบบ`;
        }
    }
}

function getCurrentUserSession() {
    try {
        const raw = localStorage.getItem(USER_SESSION_KEY);
        return raw ? JSON.parse(raw) : null;
    } catch (e) {
        return null;
    }
}

function logoutUser() {
    localStorage.removeItem(USER_SESSION_KEY);
    _supabase.auth.signOut();
    if (typeof showToast === 'function') showToast('🔒 ออกจากระบบเรียบร้อยแล้ว');
    setTimeout(() => window.location.reload(), 500);
}

function setupInstantLoginUIEngine() {
    if (!document.getElementById('wms-login-ultra-style')) {
        const style = document.createElement('style');
        style.id = 'wms-login-ultra-style';
        style.textContent = `
            .wms-login-overlay { background: rgba(15, 23, 42, 0.92) !important; }
            .wms-login-card {
                background: #1e293b !important;
                border: 1px solid rgba(255, 255, 255, 0.12) !important;
                border-radius: 20px !important;
                box-shadow: 0 10px 30px rgba(0, 0, 0, 0.4) !important;
                transform: translateZ(0);
                backface-visibility: hidden;
            }
            .wms-login-input {
                width: 100%; background: rgba(15, 23, 42, 0.7) !important;
                border: 1.5px solid rgba(255, 255, 255, 0.15) !important;
                color: #f8fafc !important; border-radius: 12px !important;
                padding: 12px 16px !important; font-size: 0.95rem !important;
                outline: none !important; text-rendering: optimizeSpeed !important;
                transform: translateZ(0); will-change: auto; touch-action: manipulation;
                transition: border-color 0.1s ease !important;
            }
            .wms-login-input:focus {
                border-color: #3b82f6 !important; background: rgba(15, 23, 42, 0.9) !important;
            }
        `;
        document.head.appendChild(style);
    }
}

setupInstantLoginUIEngine();