// =========================================================================
// --- MODULE 1: SUPABASE CONFIGURATION & REALTIME CONNECTION ENGINE ---
// =========================================================================

const SUPABASE_CONFIG = {
    url: window.WMS_ENV?.SUPABASE_URL || 'https://eusuehaqgwkcgowsgyco.supabase.co',
    key: window.WMS_ENV?.SUPABASE_KEY || 'sb_publishable_ww-mPdyom_i6S4XhfAFj9Q_vFBpTuaE'
};

const _supabase = window.supabase.createClient(SUPABASE_CONFIG.url, SUPABASE_CONFIG.key, {
    auth: { persistSession: false },
    global: { headers: { 'x-client-info': 'wms-master-app' } }
});

const QUEUE_KEY = 'WMS_OFFLINE_INBOUND_QUEUE';
const ACT_QUEUE_KEY = 'WMS_OFFLINE_ACTIVITY_QUEUE';

const readJSON = (k) => { try { return JSON.parse(localStorage.getItem(k) || '[]'); } catch (e) { return []; } };
let offlineInboundQueue = readJSON(QUEUE_KEY);
let offlineActivityQueue = readJSON(ACT_QUEUE_KEY);
let isOfflineMode = !navigator.onLine;
let isSyncing = false;
let lastSyncError = '';
let syncFailNotified = false;
let reloadTimer = null;

function persistQueue() {
    try {
        localStorage.setItem(QUEUE_KEY, JSON.stringify(offlineInboundQueue));
        localStorage.setItem(ACT_QUEUE_KEY, JSON.stringify(offlineActivityQueue));
        return true;
    } catch (e) { return false; }
}

function clearOfflineInboundQueue() {
    if (offlineInboundQueue.length === 0) {
        showToast("ℹ️ ไม่พบรายการค้างบันทึกในคิว");
        return;
    }

    if (confirm(`คุณต้องการลบ/ยกเลิกรายการรอบันทึกทั้งหมดจำนวน ${offlineInboundQueue.length} รายการออกใช่หรือไม่?`)) {
        const pendingSns = new Set(offlineInboundQueue.map(i => String(i.sn).toLowerCase()));
        
        offlineInboundQueue = [];
        persistQueue();

        globalInventoryData = globalInventoryData.filter(i => !i._pending && !pendingSns.has(String(i.sn).toLowerCase()));
        recentInboundList = recentInboundList.filter(i => !i.isOffline);

        rebuildOccupiedSet();
        filterInventoryData();
        updateKPIs();
        renderLiveInboundFeed();
        updateOnlineOfflineUI(navigator.onLine);

        playSuccessSound();
        showToast("🗑️ ลบรายการรอบันทึกค้างทั้งหมดเรียบร้อยแล้ว");
    }
}

function removePendingItemBySn(sn) {
    const targetSn = String(sn).trim().toLowerCase();
    
    offlineInboundQueue = offlineInboundQueue.filter(i => String(i.sn).trim().toLowerCase() !== targetSn);
    persistQueue();

    globalInventoryData = globalInventoryData.filter(i => String(i.sn).trim().toLowerCase() !== targetSn || !i._pending);
    recentInboundList = recentInboundList.filter(i => String(i.sn).trim().toLowerCase() !== targetSn || !i.isOffline);

    rebuildOccupiedSet();
    filterInventoryData();
    updateKPIs();
    renderLiveInboundFeed();
    updateOnlineOfflineUI(navigator.onLine);

    playSuccessSound();
    showToast(`🗑️ ยกเลิก S/N: ${sn} จากคิวรอบันทึกเรียบร้อยแล้ว`);
}

function isPendingSn(sn) {
    const k = String(sn || '').toLowerCase();
    return offlineInboundQueue.some(p => String(p.sn).toLowerCase() === k);
}

function guardPendingSn(sn) {
    if (isPendingSn(sn)) { 
        playErrorSound(); 
        showToast(`⏳ S/N ${escapeHTML(sn)} ยังรอบันทึกเข้า DB กรุณารอซิงค์เสร็จก่อน`, true); 
        return true; 
    }
    return false;
}

function requireOnline(msg) {
    if (!navigator.onLine) { 
        playErrorSound(); 
        showToast(`📴 ${msg || 'ทำรายการนี้ต้องเชื่อมต่ออินเทอร์เน็ต'}`, true); 
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

function initOfflineSyncEngine() {
    updateOnlineOfflineUI(navigator.onLine);
    window.addEventListener('online', () => {
        updateOnlineOfflineUI(true);
        showToast('🌐 อินเทอร์เน็ตกลับมาแล้ว กำลังบันทึกข้อมูลเข้า DB...');
        syncOfflineQueueToDatabase();
    });
    window.addEventListener('offline', () => {
        updateOnlineOfflineUI(false);
        showToast('📴 ออฟไลน์: ข้อมูลจะถูกเก็บไว้ในเครื่องและซิงค์เมื่อเชื่อมเน็ต', true);
    });
    window.addEventListener('beforeunload', (e) => {
        if (offlineInboundQueue.length) { e.preventDefault(); e.returnValue = ''; }
    });
    
    setInterval(() => {
        if (offlineInboundQueue.length || offlineActivityQueue.length) syncOfflineQueueToDatabase();
    }, 8000);
}

function updateOnlineOfflineUI(isOnline) {
    isOfflineMode = !isOnline;
    const n = offlineInboundQueue.length;
    const banner = document.getElementById('offlineNoticeBanner');
    const badge = document.getElementById('offlineQueueBadge');
    const msg = document.getElementById('offlineBannerMsg');
    const dbStatusText = document.getElementById('dbStatusText');
    const hdr = document.getElementById('liveInboundHeaderBadge');

    if (badge) badge.textContent = n.toLocaleString();
    if (banner) {
        banner.style.display = (!isOnline || n > 0) ? 'flex' : 'none';
        banner.className = 'offline-banner ' + (!isOnline ? 'is-offline' : 'is-syncing');
        if (msg) {
            msg.textContent = !isOnline
                ? `โหมดออฟไลน์ — ยังรับสินค้าต่อได้ปกติ (รอบันทึกเข้า DB ${n} รายการ)`
                : isSyncing ? `กำลังบันทึก ${n} รายการเข้าฐานข้อมูล...`
                : `มี ${n} รายการรอบันทึกเข้า DB${lastSyncError ? ' — เชื่อมต่อไม่สำเร็จ จะลองใหม่อัตโนมัติ' : ''}`;
        }
    }
    if (hdr) {
        if (!isOnline) { hdr.className = 'status-badge warning'; hdr.innerHTML = `<i class="fa-solid fa-wifi"></i> ออฟไลน์ · รอซิงค์ ${n}`; }
        else if (n > 0) { hdr.className = 'status-badge warning'; hdr.innerHTML = `<i class="fa-solid fa-rotate ${isSyncing ? 'fa-spin' : ''}"></i> รอบันทึก ${n}`; }
        else { hdr.className = 'status-badge'; hdr.innerHTML = `<span class="pulse-dot"></span> บันทึก DB ครบแล้ว`; }
    }
    if (dbStatusText && (!isOnline || n > 0)) {
        dbStatusText.textContent = !isOnline ? `🟠 ออฟไลน์ (รอซิงค์ ${n})` : `🟡 รอบันทึก ${n} รายการ`;
        dbStatusText.style.color = 'var(--warning, #f59e0b)';
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
        for (const rawItem of batch) {
            const snKey = String(rawItem.sn).trim().toLowerCase();

            const { data: existing } = await _supabase
                .from('warehouse_items')
                .select('sn')
                .eq('sn', rawItem.sn)
                .maybeSingle();

            if (existing) {
                dup++;
                doneInboundSns.add(snKey);
                continue;
            }

            const cleanPayload = sanitizeForDb(rawItem);
            const { error } = await _supabase.from('warehouse_items').insert([cleanPayload]);

            if (!error) {
                saved++;
                doneInboundSns.add(snKey);
            } else if (error.code === '23505') {
                dup++;
                doneInboundSns.add(snKey);
            } else {
                console.error(`Failed to sync SN ${rawItem.sn}:`, error);
                lastSyncError = error.message;
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

    globalInventoryData.forEach(item => {
        if (doneInboundSns.has(String(item.sn).trim().toLowerCase())) {
            delete item._pending;
        }
    });

    isSyncing = false;
    renderLiveInboundFeed();
    updateOnlineOfflineUI(navigator.onLine);

    if (saved + dup > 0) {
        syncFailNotified = false;
        playSuccessSound();
        showToast(`✅ บันทึกเข้าฐานข้อมูลสำเร็จ ${saved} รายการ${dup ? ` (ข้าม S/N ที่มีใน DB แล้ว ${dup})` : ''}`);
        logUserActivity('OFFLINE_SYNC', `ซิงค์รายการรับเข้า ${saved} รายการเข้า DB`);
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
            statusElem.textContent = `📴 ออฟไลน์ (Offline Mode)`;
            statusElem.style.color = 'var(--warning, #f59e0b)';
        }
        if (badgeElem) badgeElem.className = 'status-badge warning';
        return;
    }

    const statusMessage = isConnected 
        ? `🟢 Supabase Connected - ${nowStr} ${message}`
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
        const { data, error } = await _supabase.from('warehouse_items').select('id').limit(1);
        const endTime = performance.now();
        const latency = Math.round(endTime - startTime);

        if (!error) {
            if (typeof playSuccessSound === 'function') playSuccessSound();
            if (typeof showToast === 'function') showToast(`⚡ เชื่อมต่อ Supabase สำเร็จ! (Latency: ${latency} ms)`);
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