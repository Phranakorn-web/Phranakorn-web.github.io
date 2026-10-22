// =========================================================================
// --- MODULE 2: INVENTORY CHECK & MASTER PRODUCTS DATABASE ENGINE ---
// =========================================================================

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

// -------------------------------------------------------------------------
// 🛠️ ระบบแปลงและจัดรูปแบบพิกัดให้เป็นมาตรฐานเดียวกัน 100% (Location Normalizer)
// -------------------------------------------------------------------------
function normalizeLoc(locStr) {
    if (!locStr) return '';
    const clean = String(locStr).trim().toUpperCase();
    if (['DOCK', 'OFFICE', 'PENDING', 'FOOD', 'FREEZER', 'COLD', 'DRY', 'RAW'].includes(clean)) {
        return clean;
    }
    if (typeof normalizeLocationCode === 'function') {
        const norm = normalizeLocationCode(clean);
        if (norm) return norm;
    }
    const parts = clean.split(/[\-\/_]+/);
    if (parts.length >= 4) {
        const aisle = parts[0];
        const bay = String(parseInt(parts[1], 10) || 1).padStart(2, '0');
        const shelf = String(parseInt(parts[2], 10) || 1);
        const slot = String(parseInt(parts[3], 10) || 1).padStart(2, '0');
        return `${aisle}-${bay}-${shelf}-${slot}`;
    }
    return clean;
}

// -------------------------------------------------------------------------
// 🔊 ระบบการแจ้งเตือนเสียงและระบบสั่นตอบรับ (Audio & Haptic Feedback)
// -------------------------------------------------------------------------
function playActionFeedbackSound(type = 'success') {
    try {
        if (navigator.vibrate) {
            if (type === 'delete') navigator.vibrate([40, 60, 40]);
            else if (type === 'success') navigator.vibrate(30);
        }
        const ctx = new (window.AudioContext || window.webkitAudioContext)();
        if (!ctx) return;
        const osc = ctx.createOscillator();
        const gain = ctx.createGain();
        osc.connect(gain);
        gain.connect(ctx.destination);

        if (type === 'delete') {
            osc.frequency.setValueAtTime(220, ctx.currentTime);
            osc.frequency.exponentialRampToValueAtTime(110, ctx.currentTime + 0.15);
            gain.gain.setValueAtTime(0.15, ctx.currentTime);
            gain.gain.linearRampToValueAtTime(0.01, ctx.currentTime + 0.15);
            osc.start();
            osc.stop(ctx.currentTime + 0.15);
        } else {
            osc.frequency.setValueAtTime(587.33, ctx.currentTime);
            osc.frequency.exponentialRampToValueAtTime(880, ctx.currentTime + 0.12);
            gain.gain.setValueAtTime(0.1, ctx.currentTime);
            gain.gain.linearRampToValueAtTime(0.01, ctx.currentTime + 0.12);
            osc.start();
            osc.stop(ctx.currentTime + 0.12);
        }
    } catch (e) {}
}

// -------------------------------------------------------------------------
// 🛡️ ระบบบันทึกประวัติความปลอดภัย (Audit Trail Log System)
// -------------------------------------------------------------------------
function logAuditAction(actionType, details) {
    const auditData = {
        action: actionType,
        user: getCurrentReceiverName(),
        role: getCurrentUserRole(),
        details: details,
        timestamp: new Date().toISOString()
    };

    try {
        const existingLogs = JSON.parse(localStorage.getItem('WMS_AUDIT_LOGS') || '[]');
        existingLogs.unshift(auditData);
        if (existingLogs.length > 200) existingLogs.pop();
        localStorage.setItem('WMS_AUDIT_LOGS', JSON.stringify(existingLogs));
    } catch(e) {}

    const client = getSupabaseClient();
    if (client) {
        client.from('audit_logs').insert([{
            action_type: actionType,
            performed_by: auditData.user,
            user_role: auditData.role,
            details: JSON.stringify(details),
            created_at: auditData.timestamp
        }]).then(() => {}).catch(() => {});
    }
}

function exportAuditLogsToCSV() {
    try {
        const logs = JSON.parse(localStorage.getItem('WMS_AUDIT_LOGS') || '[]');
        if (logs.length === 0) {
            if (typeof showToast === 'function') showToast('⚠️ ไม่พบประวัติการทำรายการในระบบ', true);
            return;
        }
        let csv = '\uFEFFวันที่-เวลา,การกระทำ,ผู้ทำรายการ,สิทธิ์,รายละเอียด\n';
        logs.forEach(l => {
            const dt = l.timestamp ? new Date(l.timestamp).toLocaleString('th-TH') : '-';
            const detailStr = JSON.stringify(l.details || {}).replace(/"/g, '""');
            csv += `"${dt}","${l.action || ''}","${l.user || ''}","${l.role || ''}","${detailStr}"\n`;
        });
        const blob = new Blob([csv], { type: 'text/csv;charset=utf-8;' });
        const url = URL.createObjectURL(blob);
        const a = document.createElement('a');
        a.href = url;
        a.download = `WMS_Audit_Logs_${new Date().toISOString().slice(0, 10)}.csv`;
        a.click();
        URL.revokeObjectURL(url);
    } catch (e) {
        console.error("Export Audit Logs Error:", e);
    }
}

// -------------------------------------------------------------------------
// 🔔 ระบบแจ้งเตือนสถานะออฟไลน์แบบ Floating Notice
// -------------------------------------------------------------------------
function updateDBConnectionStatus(isOnline, detailText = '') {
    const yellowPanels = document.querySelectorAll('#offlineYellowPanel, .offline-panel-left, .offline-banner-left, [class*="offline-yellow"]');
    yellowPanels.forEach(el => el.remove());

    let alertBox = document.getElementById('wmsOfflineFloatingAlert');
    if (!isOnline) {
        if (!alertBox) {
            alertBox = document.createElement('div');
            alertBox.id = 'wmsOfflineFloatingAlert';
            alertBox.style.cssText = `
                position: fixed;
                top: 20px;
                right: 20px;
                z-index: 999999;
                background: #ffffff;
                border: 1px solid #f59e0b;
                color: #78350f;
                padding: 12px 16px;
                border-radius: 8px;
                box-shadow: 0 4px 12px rgba(0, 0, 0, 0.08);
                display: flex;
                align-items: center;
                gap: 12px;
                max-width: 420px;
                font-family: system-ui, -apple-system, sans-serif;
                animation: fadeInModal 0.15s ease-out;
            `;
            document.body.appendChild(alertBox);
        }

        const pendingCount = (typeof offlineInboundQueue !== 'undefined' && Array.isArray(offlineInboundQueue)) ? offlineInboundQueue.length : 0;

        alertBox.innerHTML = `
            <div style="background:#fef3c7; width:32px; height:32px; border-radius:6px; display:flex; align-items:center; justify-content:center; flex-shrink:0; border:1px solid #fde68a;">
                <i class="fa-solid fa-wifi-slash" style="font-size:1rem; color:#d97706;"></i>
            </div>
            <div style="flex:1;">
                <div style="font-weight:700; font-size:0.85rem; color:#92400e;">โหมดออฟไลน์ (Offline Mode)</div>
                <div style="font-size:0.78rem; color:#78350f; margin-top:2px; line-height:1.3;">
                    เช็ค/รับสต็อกต่อได้ปกติ ${escapeHTML(detailText)} <br>
                    <span style="font-weight:700; color:#b45309;">(รอบันทึกเข้า DB: ${pendingCount} รายการ)</span>
                </div>
            </div>
            <button type="button" onclick="document.getElementById('wmsOfflineFloatingAlert').style.display='none'" style="background:transparent; border:none; color:#a16207; font-size:1.1rem; cursor:pointer; padding:0 4px; opacity:0.7;" onmouseover="this.style.opacity='1'" onmouseout="this.style.opacity='0.7'">&times;</button>
        `;
        alertBox.style.display = 'flex';
    } else {
        if (alertBox) {
            alertBox.style.display = 'none';
        }
    }
}

function extractAisleBayKey(locStr) {
    if (!locStr) return 'DOCK';
    const clean = normalizeLoc(locStr);
    const upper = String(clean || locStr).toUpperCase().trim();
    const parts = upper.split('-');
    return parts.length >= 2 ? `${parts[0]}-${parts[1]}` : upper;
}

function extractAisleKey(locStr) {
    if (!locStr) return 'DOCK';
    const clean = normalizeLoc(locStr);
    const upper = String(clean || locStr).toUpperCase().trim();
    const parts = upper.split('-');
    return parts[0] || upper;
}

function extractBayKey(locStr) {
    if (!locStr) return 'ALL';
    const clean = normalizeLoc(locStr);
    const upper = String(clean || locStr).toUpperCase().trim();
    const parts = upper.split('-');
    return parts.length >= 2 ? parts[1] : 'ALL';
}

function formatAisleBayLabel(abKey) {
    if (!abKey) return 'DOCK';
    const parts = abKey.split('-');
    if (parts.length === 2) return `แถว ${parts[0]} / ล็อก ${parts[1]}`;
    if (abKey === 'DOCK') return 'ลาน DOCK';
    if (abKey === 'OFFICE') return 'ออฟฟิศ (OFFICE)';
    if (abKey === 'PENDING') return 'รอรับเข้า (PENDING)';
    if (abKey === 'FOOD') return 'โซนอาหาร (FOOD)';
    if (abKey === 'FREEZER') return 'ห้องแช่แข็ง (FREEZER)';
    if (abKey === 'COLD') return 'ห้องเย็น (COLD)';
    if (abKey === 'DRY') return 'คลังสินค้าแห้ง (DRY)';
    if (abKey === 'RAW') return 'วัตถุดิบ (RAW)';
    return `แถว ${abKey}`;
}

// 🌐 ระบบสแกนหาแถวทั้งหมดตามโครงสร้าง Config ของผู้ใช้เป็นหลัก 100%
function discoverAllDatabaseAisles() {
    const aisleOrderedList = [];
    const aisleSet = new Set();

    const masterAisles = Array.isArray(window.masterAisles) && window.masterAisles.length > 0 
        ? window.masterAisles 
        : ['A', 'B', 'C', 'D', 'E', 'F', 'G', 'DOCK', 'OFFICE', 'PENDING'];

    masterAisles.forEach(a => {
        if (a) {
            const cleanKey = String(a).toUpperCase().trim();
            if (!aisleSet.has(cleanKey)) {
                aisleSet.add(cleanKey);
                aisleOrderedList.push(cleanKey);
            }
        }
    });

    const configs = window.aisleConfigs || {};
    Object.keys(configs).forEach(k => {
        if (k) {
            const cleanKey = String(k).toUpperCase().trim();
            if (!aisleSet.has(cleanKey)) {
                aisleSet.add(cleanKey);
                aisleOrderedList.push(cleanKey);
            }
        }
    });

    globalInventoryData.forEach(item => {
        if (item && item.location) {
            const aisleKey = extractAisleKey(item.location);
            if (aisleKey && !aisleSet.has(aisleKey)) {
                aisleSet.add(aisleKey);
                aisleOrderedList.push(aisleKey);
            }
        }
    });

    return aisleOrderedList;
}

function formatReceiverFullName(item) {
    if (!item) return 'ไม่ระบุ';
    return item.received_by_fullname || item.full_name || item.receiver_fullname || item.received_by || item.username || item.created_by || item.user_id || 'ไม่ระบุ';
}

function getCurrentReceiverName() {
    if (typeof currentUser !== 'undefined' && currentUser) {
        return currentUser.full_name || currentUser.name || currentUser.username || currentUser.user_id || 'ผู้ดูแลระบบ';
    }
    try {
        const savedUserStr = localStorage.getItem('WMS_ACTIVE_USER');
        if (savedUserStr) {
            const parsed = JSON.parse(savedUserStr);
            return parsed.full_name || parsed.name || parsed.username || parsed.user_id || 'ผู้ดูแลระบบ';
        }
    } catch (e) {}
    return 'ผู้ดูแลระบบ';
}

function getCurrentUserRole() {
    if (typeof currentUser !== 'undefined' && currentUser && currentUser.role) {
        return String(currentUser.role).toLowerCase();
    }
    try {
        const savedUserStr = localStorage.getItem('WMS_ACTIVE_USER');
        if (savedUserStr) {
            const parsed = JSON.parse(savedUserStr);
            return String(parsed.role || parsed.user_type || 'user').toLowerCase();
        }
    } catch (e) {}
    return 'user';
}

function copyTextToClipboard(text, label = 'ข้อความ') {
    if (!text) return;
    if (navigator.clipboard && window.isSecureContext) {
        navigator.clipboard.writeText(text).then(() => {
            playActionFeedbackSound('success');
            if (typeof showToast === 'function') showToast(`📋 คัดลอก ${label} (${text}) เรียบร้อยแล้ว`);
        }).catch(() => {});
    } else {
        const textArea = document.createElement("textarea");
        textArea.value = text;
        document.body.appendChild(textArea);
        textArea.select();
        try {
            document.execCommand('copy');
            playActionFeedbackSound('success');
            if (typeof showToast === 'function') showToast(`📋 คัดลอก ${label} (${text}) เรียบร้อยแล้ว`);
        } catch (err) {}
        document.body.removeChild(textArea);
    }
}

function copyAllSerialsInCurrentGroup() {
    if (!currentDetailModalGroupKey) return;
    const grp = currentInventoryGroups.find(g => g.groupKey === currentDetailModalGroupKey);
    if (!grp || !grp.items || grp.items.length === 0) return;
    const serialListText = grp.items.map(i => i.sn).join('\n');
    copyTextToClipboard(serialListText, `S/N ทั้งหมด ${grp.items.length} รายการ`);
}

function autoFitExcelColumns(worksheet, rows) {
    if (!rows || rows.length === 0) return;
    const keys = Object.keys(rows[0]);
    const colWidths = keys.map(key => {
        let maxLen = String(key).split('').reduce((acc, ch) => acc + (ch.charCodeAt(0) > 255 ? 1.8 : 1), 0);
        rows.forEach(row => {
            const val = row[key] !== null && row[key] !== undefined ? String(row[key]) : '';
            const cellLen = val.split('').reduce((acc, ch) => acc + (ch.charCodeAt(0) > 255 ? 1.8 : 1), 0);
            if (cellLen > maxLen) maxLen = cellLen;
        });
        return { wch: Math.ceil(Math.max(maxLen + 4, 12)) };
    });
    worksheet['!cols'] = colWidths;
}

function calculateAisleCapacityInfo(targetAisle) {
    const aisleKey = (targetAisle || '').toUpperCase().trim();
    if (!aisleKey || ['DOCK', 'OFFICE', 'PENDING', 'FOOD', 'FREEZER', 'COLD', 'DRY', 'RAW'].includes(aisleKey)) {
        return { totalSlots: 9999, occupied: 0, available: 9999, isUnlimited: true };
    }

    const configs = window.aisleConfigs || {};
    const cfg = configs[aisleKey] || (typeof getAisleConfig === 'function' ? getAisleConfig(aisleKey) : { bays: 10, shelves: 1, slots: 10 });
    const totalSlots = (parseInt(cfg.bays || cfg.bay) || 10) * (parseInt(cfg.shelves || cfg.shelf) || 1) * (parseInt(cfg.slots || cfg.slot) || 10);

    const occupied = globalInventoryData.filter(item => extractAisleKey(item.location) === aisleKey).length;
    const available = Math.max(0, totalSlots - occupied);
    return { totalSlots, occupied, available, isUnlimited: false };
}

function findFirstAvailableSlotInAisleBay(aisleKey, bayKey) {
    const aisle = (aisleKey || 'A').toUpperCase().trim();
    if (['DOCK', 'OFFICE', 'PENDING', 'FOOD', 'FREEZER', 'COLD', 'DRY', 'RAW'].includes(aisle)) {
        return { aisle, bay: '01', shelf: '1', slot: '01', fullLocation: aisle };
    }

    const bay = String(bayKey || '01').padStart(2, '0');
    const configs = window.aisleConfigs || {};
    const cfg = configs[aisle] || (typeof getAisleConfig === 'function' ? getAisleConfig(aisle) : { shelves: 5, slots: 10 });
    const maxShelves = parseInt(cfg.shelves || cfg.shelf) || 5;
    const maxSlots = parseInt(cfg.slots || cfg.slot) || 10;

    for (let sh = 1; sh <= maxShelves; sh++) {
        for (let sl = 1; sl <= maxSlots; sl++) {
            const slotStr = String(sl).padStart(2, '0');
            const candidateLoc = `${aisle}-${bay}-${sh}-${slotStr}`;
            const normCandidate = normalizeLoc(candidateLoc);

            if (!occupiedLocationsSet.has(candidateLoc) && !occupiedLocationsSet.has(normCandidate)) {
                return {
                    aisle,
                    bay,
                    shelf: String(sh),
                    slot: slotStr,
                    fullLocation: candidateLoc
                };
            }
        }
    }

    return {
        aisle,
        bay,
        shelf: '1',
        slot: '01',
        fullLocation: `${aisle}-${bay}-1-01`
    };
}

function calculateBatchRelocateTargetCoordinates(targetAisle, requiredCount) {
    const aisleKey = (targetAisle || '').toUpperCase().trim();
    if (!aisleKey || ['DOCK', 'OFFICE', 'PENDING', 'FOOD', 'FREEZER', 'COLD', 'DRY', 'RAW'].includes(aisleKey)) {
        return Array(requiredCount).fill(aisleKey);
    }

    const configs = window.aisleConfigs || {};
    const cfg = configs[aisleKey] || (typeof getAisleConfig === 'function' ? getAisleConfig(aisleKey) : { bays: 10, shelves: 5, slots: 10 });
    const maxBays = parseInt(cfg.bays || cfg.bay) || 10;
    const maxShelves = parseInt(cfg.shelves || cfg.shelf) || 5;
    const maxSlots = parseInt(cfg.slots || cfg.slot) || 10;

    const assignedLocations = [];
    for (let b = 1; b <= maxBays; b++) {
        const bayStr = String(b).padStart(2, '0');
        for (let sh = 1; sh <= maxShelves; sh++) {
            for (let sl = 1; sl <= maxSlots; sl++) {
                const slotStr = String(sl).padStart(2, '0');
                const locCandidate = `${aisleKey}-${bayStr}-${sh}-${slotStr}`;
                const normCandidate = normalizeLoc(locCandidate);

                if (!occupiedLocationsSet.has(locCandidate) && !occupiedLocationsSet.has(normCandidate)) {
                    assignedLocations.push(locCandidate);
                    if (assignedLocations.length >= requiredCount) return assignedLocations;
                }
            }
        }
    }
    while (assignedLocations.length < requiredCount) {
        assignedLocations.push(`${aisleKey}-OVERFLOW`);
    }
    return assignedLocations;
}

function getSupabaseClient() {
    if (typeof _supabase !== 'undefined' && _supabase) return _supabase;
    if (typeof supabaseClient !== 'undefined' && supabaseClient) return supabaseClient;
    if (typeof supabase !== 'undefined' && supabase && typeof supabase.from === 'function') return supabase;
    if (typeof window !== 'undefined') {
        if (window._supabase) return window._supabase;
        if (window.supabaseClient) return window.supabaseClient;
        if (window.supabase && typeof window.supabase.from === 'function') return window.supabase;
        if (window.ENV && window.ENV.SUPABASE_CLIENT) return window.ENV.SUPABASE_CLIENT;
    }
    return null;
}

function fetchWithTimeout(promise, ms = 12000) {
    return Promise.race([
        promise,
        new Promise((_, reject) => setTimeout(() => reject(new Error('Database Request Timeout')), ms))
    ]);
}

function showTableLoadingState() {
    const tbody = document.getElementById('inventoryTableBody');
    if (tbody) {
        tbody.innerHTML = `
            <tr>
                <td colspan="14" style="text-align:center; padding:40px 20px; background:#ffffff;">
                    <div style="display:flex; flex-direction:column; align-items:center; justify-content:center; gap:10px;">
                        <i class="fa-solid fa-spinner fa-spin" style="font-size:2rem; color:#2563eb;"></i>
                        <div style="font-size:0.95rem; font-weight:700; color:#0f172a;">กำลังดึงข้อมูลจากฐานข้อมูล...</div>
                        <div style="font-size:0.8rem; color:#64748b;">ระบบกำลังประมวลผลรายการสต็อกทั้งหมดจาก DB</div>
                    </div>
                </td>
            </tr>
        `;
    }
    const totalBadge = document.getElementById('totalCountBadge');
    if (totalBadge) {
        totalBadge.innerHTML = `<i class="fa-solid fa-spinner fa-spin"></i> เชื่อมต่อ DB...`;
    }
}

let globalInventoryData = [];
let globalMasterProducts = [];
let occupiedLocationsSet = new Set();
let selectedItemSnSet = new Set();
let currentFilteredItems = [];
let currentInventoryGroups = [];
let inventoryViewMode = 'grouped';
let currentDetailModalGroupKey = null;
let pendingBarcodePrintTarget = [];

async function fetchAllWarehouseItems() {
    if (!navigator.onLine) {
        const cached = localStorage.getItem('WMS_LOCAL_INVENTORY_CACHE');
        updateDBConnectionStatus(false, "(โหมด Offline Cache)");
        return cached ? JSON.parse(cached) : [];
    }

    let allData = [];
    let from = 0;
    const step = 1000;
    let hasMore = true;

    const client = getSupabaseClient();
    if (!client) {
        const cached = localStorage.getItem('WMS_LOCAL_INVENTORY_CACHE');
        updateDBConnectionStatus(false, "(โหมด Offline Cache)");
        return cached ? JSON.parse(cached) : [];
    }

    try {
        while (hasMore) {
            const queryPromise = client
                .from('warehouse_items')
                .select('*')
                .order('created_at', { ascending: false })
                .range(from, from + step - 1);

            const { data, error } = await fetchWithTimeout(queryPromise, 15000);
            if (error) throw error;

            if (data && data.length > 0) {
                allData = allData.concat(data);
                from += step;
                if (data.length < step) {
                    hasMore = false;
                }
            } else {
                hasMore = false;
            }
        }

        try { localStorage.setItem('WMS_LOCAL_INVENTORY_CACHE', JSON.stringify(allData)); } catch (e) {}
        updateDBConnectionStatus(true, `(สต็อกในคลัง: ${allData.length.toLocaleString()} รายการ)`);
        return allData;
    } catch (e) {
        console.warn('Warehouse fetch warning/fallback:', e.message);
        const cached = localStorage.getItem('WMS_LOCAL_INVENTORY_CACHE');
        updateDBConnectionStatus(false, "(โหมด Offline Cache)");
        return cached ? JSON.parse(cached) : [];
    }
}

async function loadMasterProductsFromDB() {
    try {
        if (!navigator.onLine) {
            const cachedMaster = localStorage.getItem('WMS_MASTER_PRODUCTS_CACHE');
            if (cachedMaster) {
                try { globalMasterProducts = JSON.parse(cachedMaster); } catch(err) {}
            }
            updateMasterProductsStatUI();
            return;
        }

        const client = getSupabaseClient();
        if (!client) {
            updateMasterProductsStatUI();
            return;
        }

        let allProducts = [];
        let from = 0;
        const step = 1000;
        let hasMore = true;

        while (hasMore) {
            let reqPromise = client
                .from('products')
                .select('*')
                .order('id', { ascending: true })
                .range(from, from + step - 1);

            let response;
            try {
                response = await fetchWithTimeout(reqPromise, 12000);
            } catch (err) {
                reqPromise = client
                    .from('products')
                    .select('*')
                    .order('sku', { ascending: true })
                    .range(from, from + step - 1);
                response = await fetchWithTimeout(reqPromise, 12000);
            }

            if (response.error) {
                console.warn("Supabase fetch products page error:", response.error.message);
                break;
            }

            const data = response.data;
            if (data && data.length > 0) {
                allProducts = allProducts.concat(data);
                from += step;
                if (data.length < step) {
                    hasMore = false;
                }
            } else {
                hasMore = false;
            }
        }

        if (allProducts.length > 0) {
            globalMasterProducts = allProducts;
            try { localStorage.setItem('WMS_MASTER_PRODUCTS_CACHE', JSON.stringify(allProducts)); } catch (quotaErr) {}
        } else {
            const cachedMaster = localStorage.getItem('WMS_MASTER_PRODUCTS_CACHE');
            if (cachedMaster) {
                try { globalMasterProducts = JSON.parse(cachedMaster); } catch(err) {}
            }
        }

        updateMasterProductsStatUI();
    } catch(e) {
        console.warn("loadMasterProductsFromDB Exception:", e);
        const cachedMaster = localStorage.getItem('WMS_MASTER_PRODUCTS_CACHE');
        if (cachedMaster) {
            try { globalMasterProducts = JSON.parse(cachedMaster); } catch(err) {}
        }
        updateMasterProductsStatUI();
    }
}

function updateMasterProductsStatUI() {
    const statElem = document.getElementById('inboundMasterProductsStatText');
    if (statElem) {
        const count = globalMasterProducts.length;
        if (count > 0) {
            statElem.innerHTML = `<i class="fa-solid fa-circle-check" style="color:#10b981;"></i> เชื่อมต่อ DB สมบูรณ์ · สินค้า Master <strong class="mono" style="color:#0f172a; font-size:1rem; background:#fff; padding:2px 6px; border-radius:4px; border:1px solid #cbd5e1;">${count.toLocaleString()}</strong> รายการ`;
        } else {
            statElem.innerHTML = `<i class="fa-solid fa-triangle-exclamation" style="color:#f59e0b;"></i> ไม่พบข้อมูลสินค้า Master`;
        }
    }
    updateKPIs();
}

async function loadDataFromDatabase() {
    showTableLoadingState();
    try {
        const fetchedData = await fetchAllWarehouseItems();
        globalInventoryData = Array.isArray(fetchedData) ? fetchedData : [];
        
        globalInventoryData.forEach(item => {
            if (item.meter === undefined || item.meter === null || item.meter === '') item.meter = 0;
            if (!item.received_by) item.received_by = item.received_by_fullname || item.full_name || item.username || item.created_by || item.user_id || 'ไม่ระบุ';
        });

        mergePendingIntoInventory();
        await loadMasterProductsFromDB();
        if (typeof loadWarehouseConfigsFromDB === 'function') await loadWarehouseConfigsFromDB();

        rebuildOccupiedSet();
        populateStockFilterDropdowns();
        filterInventoryData();
        updateKPIs();
        if (typeof refreshLocationVisualizerIfActive === 'function') refreshLocationVisualizerIfActive();
        if (typeof loadRecentInboundFeedFromDB === 'function') await loadRecentInboundFeedFromDB(); 

    } catch (err) {
        console.error("loadDataFromDatabase error:", err);
        updateDBConnectionStatus(false, "(Sync Failed)");
        if (!Array.isArray(globalInventoryData)) globalInventoryData = [];
        filterInventoryData();
    }
}

function mergePendingIntoInventory() {
    const have = new Set(globalInventoryData.map(i => String(i.sn).toLowerCase()));
    const activeReceiver = getCurrentReceiverName();

    if (typeof offlineInboundQueue !== 'undefined' && Array.isArray(offlineInboundQueue)) {
        offlineInboundQueue.forEach(p => {
            if (!have.has(String(p.sn).toLowerCase())) {
                globalInventoryData.unshift({
                    ...p,
                    received_by: p.received_by_fullname || p.received_by || p.username || activeReceiver,
                    _pending: true
                });
            }
        });
    }
}

function rebuildOccupiedSet() {
    occupiedLocationsSet.clear();
    globalInventoryData.forEach(i => {
        if (i && i.location) {
            const locUpper = String(i.location).toUpperCase().trim();
            if (!['DOCK', 'OFFICE', 'PENDING', 'FOOD', 'FREEZER', 'COLD', 'DRY', 'RAW'].includes(locUpper)) {
                occupiedLocationsSet.add(locUpper);
                const norm = normalizeLoc(locUpper);
                if (norm) occupiedLocationsSet.add(norm);
            }
        }
    });
}

function resolveProductMetaData(cat, name, sampleItem) {
    const catStr = String(cat || '').trim();
    const nameStr = String(name || '').trim();

    const master = globalMasterProducts.find(m => 
        (m.sku && String(m.sku).trim().toLowerCase() === catStr.toLowerCase()) ||
        (m.code && String(m.code).trim().toLowerCase() === catStr.toLowerCase()) ||
        (m.name && String(m.name).trim().toLowerCase() === nameStr.toLowerCase()) ||
        (m.model && String(m.model).trim().toLowerCase() === nameStr.toLowerCase())
    );

    let brand = (sampleItem && sampleItem.brand) || (master && master.brand) || '';
    let model = (sampleItem && sampleItem.model) || (master && master.model) || '';
    let itemType = (sampleItem && (sampleItem.item_type || sampleItem.type || sampleItem.category_type)) || (master && (master.item_type || master.type || master.category)) || '';
    let image = (sampleItem && (sampleItem.image || sampleItem.image_url)) || (master && (master.image || master.image_url)) || null;

    if (!brand) {
        const fullStr = `${catStr} ${nameStr}`.toUpperCase();
        if (fullStr.includes('KYOCERA') || fullStr.includes('TASKALFA') || fullStr.includes('ECOSYS')) brand = 'Kyocera';
        else if (fullStr.includes('FLASHFORGE')) brand = 'Flashforge';
        else if (fullStr.includes('HP')) brand = 'HP';
        else if (fullStr.includes('EPSON')) brand = 'Epson';
        else if (fullStr.includes('CANON')) brand = 'Canon';
        else if (fullStr.includes('CREALITY')) brand = 'Creality';
        else if (fullStr.includes('BAMBU')) brand = 'Bambu Lab';
        else if (fullStr.includes('RICOH')) brand = 'Ricoh';
        else if (fullStr.includes('XEROX')) brand = 'Fuji Xerox';
        else brand = 'ไม่ระบุยี่ห้อ';
    }

    if (!model) {
        model = nameStr || catStr || 'ไม่ระบุรุ่น';
    }

    if (!itemType) {
        const fullStr = `${catStr} ${nameStr}`.toLowerCase();
        if (fullStr.includes('ink') || fullStr.includes('cartridge') || fullStr.includes('pla') || fullStr.includes('filament') || fullStr.includes('วัสดุ') || fullStr.includes('toner')) {
            itemType = 'วัสดุสิ้นเปลือง';
        } else if (fullStr.includes('gear') || fullStr.includes('nozzle') || fullStr.includes('assembly') || fullStr.includes('อะไหล่') || fullStr.includes('part') || fullStr.includes('roller')) {
            itemType = 'อะไหล่';
        } else {
            itemType = 'สินค้า';
        }
    }

    return { brand, model, itemType, image };
}

function populateStockFilterDropdowns() {
    const skuSelect = document.getElementById('filterCategorySelect') || document.getElementById('filterSkuSelect');
    const typeSelect = document.getElementById('filterItemTypeSelect') || document.getElementById('filterTypeSelect');
    const modelSelect = document.getElementById('filterModelSelect') || document.getElementById('filterNameSelect');

    const aisleSelect = document.getElementById('filterAisleSelect');
    const baySelect = document.getElementById('filterBaySelect');
    const locSelect = document.getElementById('filterLocationSelect');

    const skuSet = new Set();
    const modelSet = new Set();
    const locSet = new Set();

    globalInventoryData.forEach(item => {
        if (item.category) skuSet.add(item.category.trim());
        if (item.name) modelSet.add(item.name.trim());
        if (item.location) locSet.add(item.location.trim().toUpperCase());
    });

    if (typeSelect) {
        const curVal = typeSelect.value || 'ALL';
        typeSelect.innerHTML = `
            <option value="ALL">🏷️ กรองตามประเภท (ทั้งหมด)</option>
            <option value="สินค้า">📦 สินค้าทั่วไป</option>
            <option value="วัสดุสิ้นเปลือง">🧪 วัสดุสิ้นเปลือง / หมึก / ฟิลาเมนต์</option>
            <option value="อะไหล่">⚙️ อะไหล่ / ชิ้นส่วนอุปกรณ์</option>
        `;
        typeSelect.value = curVal;
        typeSelect.onchange = filterInventoryData;
    }

    if (skuSelect) {
        const curVal = skuSelect.value || 'ALL';
        const sortedSkus = Array.from(skuSet).sort();
        let options = `<option value="ALL">📦 กรองตามรหัสสินค้า (SKU ทั้งหมด)</option>`;
        sortedSkus.forEach(s => {
            options += `<option value="${escapeHTML(s)}">${escapeHTML(s)}</option>`;
        });
        skuSelect.innerHTML = options;
        skuSelect.value = curVal;
        skuSelect.onchange = filterInventoryData;
    }

    if (modelSelect) {
        const curVal = modelSelect.value || 'ALL';
        const sortedModels = Array.from(modelSet).sort();
        let options = `<option value="ALL">🖥️ กรองตามชื่อรุ่น (ทั้งหมด)</option>`;
        sortedModels.forEach(m => {
            options += `<option value="${escapeHTML(m)}">${escapeHTML(m)}</option>`;
        });
        modelSelect.innerHTML = options;
        modelSelect.value = curVal;
        modelSelect.onchange = filterInventoryData;
    }

    if (aisleSelect) {
        const curVal = aisleSelect.value || 'ALL';
        const discoveredAisles = discoverAllDatabaseAisles();
        let options = `<option value="ALL">📍 กรองตามแถว/โซน (ทั้งหมด)</option>`;
        discoveredAisles.forEach(a => {
            const count = globalInventoryData.filter(i => extractAisleKey(i.location) === a).length;
            const label = formatAisleBayLabel(a);
            options += `<option value="${escapeHTML(a)}">${escapeHTML(label)} (${count} รายการ)</option>`;
        });
        aisleSelect.innerHTML = options;
        if (Array.from(aisleSelect.options).some(o => o.value === curVal)) {
            aisleSelect.value = curVal;
        } else {
            aisleSelect.value = 'ALL';
        }
        aisleSelect.onchange = onAisleFilterChange;
    }

    if (baySelect) {
        const curVal = baySelect.value || 'ALL';
        const selectedAisle = aisleSelect ? aisleSelect.value : 'ALL';
        const baySet = new Set();
        globalInventoryData.forEach(item => {
            if (selectedAisle === 'ALL' || extractAisleKey(item.location) === selectedAisle) {
                const bKey = extractBayKey(item.location);
                if (bKey && bKey !== 'ALL') baySet.add(bKey);
            }
        });
        const sortedBays = Array.from(baySet).sort();
        let options = `<option value="ALL">🔒 กรองตามล็อก/บล็อก (ทั้งหมด)</option>`;
        sortedBays.forEach(b => {
            options += `<option value="${escapeHTML(b)}">ล็อก ${escapeHTML(b)}</option>`;
        });
        baySelect.innerHTML = options;
        if (Array.from(baySelect.options).some(o => o.value === curVal)) {
            baySelect.value = curVal;
        } else {
            baySelect.value = 'ALL';
        }
        baySelect.onchange = filterInventoryData;
    }

    if (locSelect) {
        const curVal = locSelect.value || 'ALL';
        const sortedLocs = Array.from(locSet).sort();
        let options = `<option value="ALL">🎯 กรองตามพิกัดจัดเก็บระบุตรง (ทั้งหมด)</option>`;
        sortedLocs.forEach(l => {
            const formatted = typeof formatLocationCode === 'function' ? formatLocationCode(l) : l;
            options += `<option value="${escapeHTML(l)}">${escapeHTML(formatted)}</option>`;
        });
        locSelect.innerHTML = options;
        if (Array.from(locSelect.options).some(o => o.value === curVal)) {
            locSelect.value = curVal;
        } else {
            locSelect.value = 'ALL';
        }
        locSelect.onchange = filterInventoryData;
    }
}

// 🔄 ฟังก์ชันสลับการคัดกรองแถวแบบไดนามิก รองรับการอัปเดตตัวเลือกล็อกและพิกัดย่อยทันที
function onAisleFilterChange() {
    const aisleSelect = document.getElementById('filterAisleSelect');
    const baySelect = document.getElementById('filterBaySelect');
    const locSelect = document.getElementById('filterLocationSelect');

    const selectedAisle = aisleSelect ? aisleSelect.value.trim().toUpperCase() : 'ALL';

    if (baySelect) {
        const curBay = baySelect.value || 'ALL';
        const baySet = new Set();
        globalInventoryData.forEach(item => {
            if (selectedAisle === 'ALL' || extractAisleKey(item.location) === selectedAisle) {
                const bKey = extractBayKey(item.location);
                if (bKey && bKey !== 'ALL') baySet.add(bKey);
            }
        });
        const sortedBays = Array.from(baySet).sort();
        let bayOptions = `<option value="ALL">🔒 กรองตามล็อก/บล็อก (ทั้งหมด)</option>`;
        sortedBays.forEach(b => {
            bayOptions += `<option value="${escapeHTML(b)}">ล็อก ${escapeHTML(b)}</option>`;
        });
        baySelect.innerHTML = bayOptions;
        if (Array.from(baySelect.options).some(o => o.value === curBay)) {
            baySelect.value = curBay;
        } else {
            baySelect.value = 'ALL';
        }
    }

    if (locSelect) {
        const curLoc = locSelect.value || 'ALL';
        const locSet = new Set();
        globalInventoryData.forEach(item => {
            if (selectedAisle === 'ALL' || extractAisleKey(item.location) === selectedAisle) {
                if (item.location) locSet.add(item.location.trim().toUpperCase());
            }
        });
        const sortedLocs = Array.from(locSet).sort();
        let locOptions = `<option value="ALL">🎯 กรองตามพิกัดจัดเก็บระบุตรง (ทั้งหมด)</option>`;
        sortedLocs.forEach(l => {
            const formatted = typeof formatLocationCode === 'function' ? formatLocationCode(l) : l;
            locOptions += `<option value="${escapeHTML(l)}">${escapeHTML(formatted)}</option>`;
        });
        locSelect.innerHTML = locOptions;
        if (Array.from(locSelect.options).some(o => o.value === curLoc)) {
            locSelect.value = curLoc;
        } else {
            locSelect.value = 'ALL';
        }
    }

    filterInventoryData();
}

function filterInventoryData() {
    const searchInput = document.getElementById('searchInput');
    const skuSelect = document.getElementById('filterCategorySelect') || document.getElementById('filterSkuSelect');
    const typeSelect = document.getElementById('filterItemTypeSelect') || document.getElementById('filterTypeSelect');
    const modelSelect = document.getElementById('filterModelSelect') || document.getElementById('filterNameSelect');

    const aisleSelect = document.getElementById('filterAisleSelect');
    const baySelect = document.getElementById('filterBaySelect');
    const locSelect = document.getElementById('filterLocationSelect');

    const query = searchInput ? searchInput.value.trim().toLowerCase() : '';
    const skuFilter = skuSelect ? skuSelect.value.trim().toUpperCase() : 'ALL';
    const typeFilter = typeSelect ? typeSelect.value.trim().toLowerCase() : 'ALL';
    const modelFilter = modelSelect ? modelSelect.value.trim().toLowerCase() : 'ALL';

    const aisleFilter = aisleSelect ? aisleSelect.value.trim().toUpperCase() : 'ALL';
    const bayFilter = baySelect ? baySelect.value.trim().toUpperCase() : 'ALL';
    const locSelectVal = locSelect ? locSelect.value.trim().toUpperCase() : 'ALL';

    currentFilteredItems = globalInventoryData.filter(item => {
        const itemCat = (item.category || '').toUpperCase().trim();
        const itemName = (item.name || '').toLowerCase().trim();
        const itemLoc = (item.location || '').toUpperCase().trim();
        const itemAisle = extractAisleKey(itemLoc).toUpperCase().trim();
        const itemBay = extractBayKey(itemLoc).toUpperCase().trim();
        const receiverName = formatReceiverFullName(item).toLowerCase();

        const meta = resolveProductMetaData(item.category, item.name, item);
        const itemType = (meta.itemType || '').toLowerCase();

        const matchText = !query || 
            (item.sn && item.sn.toLowerCase().includes(query)) ||
            (item.category && item.category.toLowerCase().includes(query)) ||
            (item.name && item.name.toLowerCase().includes(query)) ||
            (item.location && item.location.toLowerCase().includes(query)) ||
            (meta.brand && meta.brand.toLowerCase().includes(query)) ||
            (meta.model && meta.model.toLowerCase().includes(query)) ||
            receiverName.includes(query);

        let matchSku = true;
        if (skuFilter !== 'ALL') {
            matchSku = (itemCat === skuFilter);
        }

        let matchType = true;
        if (typeFilter !== 'ALL') {
            if (typeFilter.includes('วัสดุ')) matchType = itemType.includes('วัสดุ') || itemType.includes('consumable') || itemType.includes('ink');
            else if (typeFilter.includes('อะไหล่')) matchType = itemType.includes('อะไหล่') || itemType.includes('spare') || itemType.includes('gear');
            else matchType = !itemType.includes('วัสดุ') && !itemType.includes('อะไหล่');
        }

        let matchModel = true;
        if (modelFilter !== 'ALL') {
            matchModel = itemName.includes(modelFilter) || (meta.model && meta.model.toLowerCase().includes(modelFilter));
        }

        let matchAisle = true;
        if (aisleFilter !== 'ALL') {
            if (aisleFilter === 'DOCK') matchAisle = (itemLoc === 'DOCK');
            else if (aisleFilter === 'OFFICE') matchAisle = (itemLoc === 'OFFICE');
            else {
                matchAisle = (itemAisle === aisleFilter) || (itemLoc === aisleFilter) || itemLoc.startsWith(`${aisleFilter}-`);
            }
        }

        let matchBay = true;
        if (bayFilter !== 'ALL') {
            const cleanBay = String(parseInt(bayFilter, 10) || bayFilter).padStart(2, '0');
            matchBay = (itemBay === bayFilter) || (itemBay === cleanBay) || itemLoc.includes(`-${bayFilter}-`) || itemLoc.includes(`-${cleanBay}-`);
        }

        let matchLoc = true;
        if (locSelectVal !== 'ALL') {
            const normSelectLoc = normalizeLoc(locSelectVal);
            const normItemLoc = normalizeLoc(itemLoc);
            matchLoc = (itemLoc === locSelectVal) || (normItemLoc === normSelectLoc);
        }

        return matchText && matchSku && matchType && matchModel && matchAisle && matchBay && matchLoc;
    });

    renderInventoryTable(currentFilteredItems);
    updateKPIs();
    refreshStockDetailModalIfActive();
}

function buildInventoryGroups(items) {
    const map = new Map();
    items.forEach(item => {
        const cat = (item.category || 'N/A').trim();
        const name = (item.name || '-').trim();
        const key = `${cat}||${name}`;

        if (!map.has(key)) {
            const meta = resolveProductMetaData(cat, name, item);
            map.set(key, {
                groupKey: key,
                category: cat,
                name: name,
                image: meta.image,
                brand: meta.brand,
                model: meta.model,
                itemType: meta.itemType,
                unit: item.unit || 'เครื่อง',
                items: [],
                totalQty: 0,
                locationSet: new Set(),
                baySet: new Set(),
                aisleSet: new Set(),
                pendingCount: 0
            });
        }
        const grp = map.get(key);
        grp.items.push(item);
        grp.totalQty += (parseInt(item.qty) || 1);
        if (item.location) {
            const locUpper = item.location.toUpperCase().trim();
            grp.locationSet.add(locUpper);
            const abKey = extractAisleBayKey(locUpper);
            const aKey = extractAisleKey(locUpper);
            if (abKey) grp.baySet.add(abKey);
            if (aKey) grp.aisleSet.add(aKey);
        }
        if (item._pending) grp.pendingCount++;
    });

    const groups = [];
    map.forEach(grp => {
        groups.push({
            groupKey: grp.groupKey,
            category: grp.category,
            name: grp.name,
            image: grp.image,
            brand: grp.brand,
            model: grp.model,
            itemType: grp.itemType,
            unit: grp.unit,
            items: grp.items,
            totalQty: grp.totalQty,
            locations: Array.from(grp.locationSet).sort(),
            bays: Array.from(grp.baySet).sort(),
            aisles: Array.from(grp.aisleSet).sort(),
            pendingCount: grp.pendingCount
        });
    });
    return groups;
}

function updateStockViewModeButtonUI() {
    let btn = document.getElementById('btnToggleInventoryViewMode');
    if (!btn) {
        const totalBadge = document.getElementById('totalCountBadge');
        if (totalBadge && totalBadge.parentElement) {
            btn = document.createElement('button');
            btn.id = 'btnToggleInventoryViewMode';
            btn.className = 'btn btn-sm btn-secondary';
            btn.style.cssText = 'margin-left: 10px; font-weight: 600; cursor: pointer; transition: all 0.15s ease; border-radius: 6px;';
            btn.onclick = toggleStockViewMode;
            totalBadge.parentElement.appendChild(btn);
        }
    }
    if (btn) {
        if (inventoryViewMode === 'grouped') {
            btn.innerHTML = `<i class="fa-solid fa-layer-group" style="color:#2563eb;"></i> โหมดจัดกลุ่มตามรุ่น`;
            btn.title = "คลิกเพื่อสลับเป็นโหมดแสดงรายการซีเรียลทั้งหมด";
        } else {
            btn.innerHTML = `<i class="fa-solid fa-list-check" style="color:#d97706;"></i> โหมดแสดงทุกซีเรียล`;
            btn.title = "คลิกเพื่อสลับเป็นโหมดจัดกลุ่มตามรุ่น";
        }
    }
}

function toggleStockViewMode() {
    inventoryViewMode = (inventoryViewMode === 'grouped') ? 'detailed' : 'grouped';
    updateStockViewModeButtonUI();
    renderInventoryTable(currentFilteredItems);
}

function updateInventoryTableHeader() {
    const tbody = document.getElementById('inventoryTableBody');
    if (!tbody) return;
    const table = tbody.closest('table');
    if (!table) return;

    let thead = table.querySelector('thead');
    if (!thead) {
        thead = document.createElement('thead');
        table.insertBefore(thead, tbody);
    }

    if (inventoryViewMode === 'grouped') {
        const allGroupsChecked = currentInventoryGroups.length > 0 && currentInventoryGroups.every(grp => 
            grp.items.every(i => selectedItemSnSet.has(i.sn))
        );

        thead.innerHTML = `
            <tr style="background: #f8fafc; border-bottom: 2px solid #e2e8f0; color: #475569; font-size: 0.8rem; font-weight: 700; text-transform: uppercase; letter-spacing: 0.3px;">
                <th style="padding: 12px 10px; width: 42px; text-align: center;">
                    <input type="checkbox" id="selectAllGroupedCheckbox" ${allGroupsChecked ? 'checked' : ''} onchange="toggleSelectAllGroups(this.checked)" title="เลือกทั้งหมด">
                </th>
                <th style="padding: 12px 12px; width: 70px; text-align: center;">รูปสินค้า</th>
                <th style="padding: 12px 14px; min-width: 260px; text-align: left;">ประเภท / รหัสสินค้า / ชื่อรุ่น</th>
                <th style="padding: 12px 14px; min-width: 220px; text-align: left;">รายละเอียด (ยี่ห้อ / รุ่น)</th>
                <th style="padding: 12px 14px; text-align: right; min-width: 110px;">คงเหลือรวม</th>
                <th style="padding: 12px 14px; text-align: center; min-width: 160px;">พิกัดและล็อกจัดเก็บจริง</th>
                <th style="padding: 12px 14px; text-align: center; width: 50px;"></th>
            </tr>
        `;
    } else {
        const allChecked = currentFilteredItems.length > 0 && currentFilteredItems.every(i => selectedItemSnSet.has(i.sn));
        thead.innerHTML = `
            <tr style="background: #f8fafc; border-bottom: 2px solid #cbd5e1; color: #334155; font-size: 0.8rem; font-weight: 700; text-transform: uppercase; letter-spacing: 0.3px;">
                <th style="width:42px; text-align:center; padding:12px 8px;"><input type="checkbox" id="selectAllCheckbox" ${allChecked ? 'checked' : ''} onchange="toggleSelectAllVisibleItems(this.checked)" title="เลือกทั้งหมด"></th>
                <th style="width:50px; text-align:center; padding:12px 8px;">ลำดับ</th>
                <th style="min-width:120px; text-align:center; padding:12px 10px;">รหัสสินค้า (SKU)</th>
                <th style="min-width:240px; text-align:left; padding:12px 10px;">ชื่อรุ่น / รายละเอียดสินค้า</th>
                <th style="min-width:110px; text-align:center; padding:12px 10px;">เลขมิเตอร์</th>
                <th style="min-width:160px; text-align:center; padding:12px 10px;">หมายเลขซีเรียล (S/N)</th>
                <th style="min-width:140px; text-align:center; padding:12px 10px;">พิกัดจัดเก็บ</th>
                <th style="min-width:70px; text-align:center; padding:12px 8px;">จำนวน</th>
                <th style="min-width:150px; text-align:center; padding:12px 10px;">ผู้รับสินค้าเข้า (User)</th>
                <th style="min-width:140px; text-align:center; padding:12px 10px;">วันที่รับเข้า</th>
                <th style="width:60px; text-align:center; padding:12px 4px;">พิมพ์</th>
                <th style="width:60px; text-align:center; padding:12px 4px;">แก้ไข</th>
                <th style="width:60px; text-align:center; padding:12px 4px;">ย้าย</th>
                <th style="width:60px; text-align:center; padding:12px 4px;">ลบ</th>
            </tr>
        `;
    }
}

function getTypeBadgeStyle(itemType) {
    const text = (itemType || '').toLowerCase();
    if (text.includes('วัสดุ') || text.includes('consumable') || text.includes('ink')) {
        return { label: 'วัสดุสิ้นเปลือง', bg: '#0284c7', color: '#ffffff' };
    }
    if (text.includes('อะไหล่') || text.includes('spare') || text.includes('gear')) {
        return { label: 'อะไหล่', bg: '#ea580c', color: '#ffffff' };
    }
    return { label: 'สินค้า', bg: '#16a34a', color: '#ffffff' };
}

function updateSelectedCountUI() {
    const count = selectedItemSnSet.size;

    const oldFloatingBar = document.getElementById('wmsBatchSelectionBar');
    if (oldFloatingBar) oldFloatingBar.remove();
    const oldTopBar = document.getElementById('wmsTopBatchActionToolbar');
    if (oldTopBar) oldTopBar.remove();

    const totalBadge = document.getElementById('totalCountBadge');
    if (!totalBadge) return;

    let rightContainer = document.getElementById('wmsHeaderRightActionGroup');
    if (!rightContainer) {
        rightContainer = document.createElement('div');
        rightContainer.id = 'wmsHeaderRightActionGroup';
        rightContainer.style.cssText = `
            display: inline-flex;
            align-items: center;
            gap: 6px;
            margin-left: 12px;
            flex-wrap: wrap;
            vertical-align: middle;
        `;
        if (totalBadge.parentElement) {
            totalBadge.parentElement.appendChild(rightContainer);
        }
    }

    if (count > 0) {
        rightContainer.innerHTML = `
            <div style="font-weight:700; font-size:0.8rem; color:#2563eb; background:#eff6ff; padding:4px 8px; border-radius:6px; border:1px solid #bfdbfe; display:inline-flex; align-items:center; gap:4px;">
                <i class="fa-solid fa-square-check"></i> เลือก <strong>${count.toLocaleString()}</strong> รายการ
            </div>
            <button class="btn btn-sm btn-primary" onclick="openPrintBarcodeModal('MULTI')" style="padding:4px 9px; font-size:0.78rem; border-radius:6px; font-weight:700;" title="พิมพ์บาร์โค้ดที่เลือก">
                <i class="fa-solid fa-barcode"></i> พิมพ์บาร์โค้ด
            </button>
            <button class="btn btn-sm btn-secondary" onclick="requestBatchRelocateModal()" style="padding:4px 9px; font-size:0.78rem; border-radius:6px; font-weight:700;" title="ย้ายพิกัดกลุ่ม">
                <i class="fa-solid fa-right-left"></i> ย้ายพิกัดกลุ่ม
            </button>
            <button class="btn btn-sm btn-danger" onclick="requestDeleteModal('BATCH')" style="padding:4px 9px; font-size:0.78rem; border-radius:6px; font-weight:700; background:#dc2626; border-color:#dc2626;" title="ลบรายการที่เลือก">
                <i class="fa-solid fa-trash"></i> ลบที่เลือก
            </button>
            <button class="btn btn-sm btn-success" onclick="openExcelExportModal()" style="padding:4px 9px; font-size:0.78rem; border-radius:6px; font-weight:700;" title="ส่งออก Excel">
                <i class="fa-solid fa-file-excel"></i> ส่งออก Excel
            </button>
            <button class="btn btn-sm btn-outline-danger" onclick="clearAllSelections()" style="padding:4px 9px; font-size:0.78rem; border-radius:6px; background:#fff; border:1px solid #dc2626; color:#dc2626; font-weight:700;" title="ล้างตัวเลือกทั้งหมด">
                <i class="fa-solid fa-xmark"></i> ล้าง
            </button>
        `;
        rightContainer.style.display = 'inline-flex';
    } else {
        rightContainer.style.display = 'none';
        rightContainer.innerHTML = '';
    }

    const footerBadge = document.getElementById('stockDetailModalFooterBadge');
    if (footerBadge && currentDetailModalGroupKey) {
        const grp = currentInventoryGroups.find(g => g.groupKey === currentDetailModalGroupKey);
        const totalInGroup = grp ? grp.items.length : 0;
        footerBadge.textContent = `แสดงผล ${totalInGroup} ซีเรียล | เลือกแล้ว ${count} รายการ`;
    }
}

function clearAllSelections() {
    selectedItemSnSet.clear();
    renderInventoryTable(currentFilteredItems);
    updateSelectedCountUI();
    if (typeof showToast === 'function') showToast("🧹 ล้างตัวเลือกที่เลือกไว้ออกทั้งหมดเรียบร้อยแล้ว");
}

function renderInventoryTable(items) {
    const tbody = document.getElementById('inventoryTableBody');
    if (!tbody) return;

    const tableWrapper = tbody.closest('.table-responsive');
    if (tableWrapper) {
        tableWrapper.style.overflowX = 'auto';
        tableWrapper.style.webkitOverflowScrolling = 'touch';
    }

    tbody.innerHTML = '';
    updateStockViewModeButtonUI();

    if (inventoryViewMode === 'grouped') {
        currentInventoryGroups = buildInventoryGroups(items);
        updateInventoryTableHeader();

        const totalBadge = document.getElementById('totalCountBadge');
        if (totalBadge) {
            totalBadge.textContent = `ทั้งหมด ${items.length.toLocaleString()} รายการ (${currentInventoryGroups.length.toLocaleString()} รุ่น)`;
        }

        if (currentInventoryGroups.length === 0) {
            tbody.innerHTML = `<tr><td colspan="7" style="text-align:center; padding:35px; color:#94a3b8; font-size:0.9rem;">ไม่พบข้อมูลสินค้าตรงตามเงื่อนไขค้นหา</td></tr>`;
            updateSelectedCountUI();
            return;
        }

        const frag = document.createDocumentFragment();

        currentInventoryGroups.forEach((grp) => {
            const typeBadge = getTypeBadgeStyle(grp.itemType);
            const bayCount = grp.bays ? grp.bays.length : 0;
            const locationCount = grp.locations ? grp.locations.length : 0;
            const isGroupFullyChecked = grp.items.length > 0 && grp.items.every(i => selectedItemSnSet.has(i.sn));

            const tr = document.createElement('tr');
            tr.style.cssText = "border-bottom: 1px solid #e2e8f0; transition: background 0.1s ease; cursor: pointer;";
            tr.onclick = () => openStockDetailModal(grp.groupKey);
            tr.onmouseover = function() { this.style.background = '#f8fafc'; };
            tr.onmouseout = function() { this.style.background = 'transparent'; };

            tr.innerHTML = `
                <td style="padding: 10px 12px; text-align: center; vertical-align: middle;" onclick="event.stopPropagation();">
                    <input type="checkbox" class="group-checkbox" data-groupkey="${escapeHTML(grp.groupKey)}" ${isGroupFullyChecked ? 'checked' : ''} onchange="toggleGroupSelection('${escapeHTML(grp.groupKey)}', this.checked, event)">
                </td>

                <td style="padding: 10px 12px; text-align: center; vertical-align: middle;">
                    <div style="width: 44px; height: 44px; border-radius: 6px; background: #f8fafc; border: 1px solid #cbd5e1; display: flex; align-items: center; justify-content: center; overflow: hidden; margin: 0 auto;">
                        ${grp.image ? 
                            `<img src="${escapeHTML(grp.image)}" style="width: 100%; height: 100%; object-fit: cover;" alt="product">` : 
                            `<i class="fa-solid fa-box-archive" style="font-size: 1.1rem; color: #475569;"></i>`
                        }
                    </div>
                </td>

                <td style="padding: 10px 14px; vertical-align: middle; text-align: left;">
                    <div style="display: flex; align-items: center; gap: 6px; margin-bottom: 3px; flex-wrap: wrap;">
                        <span style="background: ${typeBadge.bg}; color: ${typeBadge.color}; font-size: 0.68rem; font-weight: 700; padding: 2px 8px; border-radius: 4px; white-space: nowrap; display: inline-block;">
                            ${escapeHTML(typeBadge.label)}
                        </span>
                        <span style="font-weight: 800; color: #0f172a; font-size: 0.85rem; font-family: monospace;">${escapeHTML(grp.category)}</span>
                    </div>
                    <div style="font-size: 0.82rem; color: #334155; font-weight: 600; display: -webkit-box; -webkit-line-clamp: 2; -webkit-box-orient: vertical; overflow: hidden; word-break: break-word; line-height: 1.35;" title="${escapeHTML(grp.name)}">
                        ${escapeHTML(grp.name)}
                    </div>
                </td>

                <td style="padding: 10px 14px; vertical-align: middle; text-align: left; font-size: 0.8rem; color: #475569; line-height: 1.4;">
                    <div><span style="color: #64748b;">ยี่ห้อ:</span> <strong style="color:#0f172a;">${escapeHTML(grp.brand || 'ไม่ระบุ')}</strong></div>
                    <div><span style="color: #64748b;">รุ่น:</span> <strong style="color:#2563eb;">${escapeHTML(grp.model || grp.name)}</strong></div>
                </td>

                <td style="padding: 10px 14px; text-align: right; vertical-align: middle;">
                    <span style="font-weight: 800; color: #0f172a; font-size: 0.95rem;">${grp.totalQty.toLocaleString()}</span>
                    <span style="font-size: 0.78rem; color: #64748b; margin-left: 2px; font-weight: 500;">${escapeHTML(grp.unit)}</span>
                </td>

                <td style="padding: 10px 14px; text-align: center; vertical-align: middle; font-weight: 700; color: #0284c7; font-size: 0.88rem;">
                    <span style="background: #f0f9ff; padding: 4px 10px; border-radius: 6px; border: 1px solid #bae6fd; display:inline-block;" title="คำนวณจากการคัดกรองรายการจริงในหน้านี้: รับเข้าจัดเก็บอยู่ใน ${bayCount} ล็อก (${locationCount} พิกัดย่อย)">
                        📍 ${bayCount} ล็อก (${locationCount} พิกัด)
                    </span>
                </td>

                <td style="padding: 10px 14px; text-align: center; vertical-align: middle; color: #64748b;">
                    <i class="fa-solid fa-chevron-right" style="font-size: 0.82rem;"></i>
                </td>
            `;
            frag.appendChild(tr);
        });

        tbody.appendChild(frag);
    } else {
        updateInventoryTableHeader();

        const totalBadge = document.getElementById('totalCountBadge');
        if (totalBadge) {
            totalBadge.textContent = `แสดงผล ${items.length.toLocaleString()} / ${globalInventoryData.length.toLocaleString()} รายการ`;
        }

        if(items.length === 0) {
            tbody.innerHTML = `<tr><td colspan="14" style="text-align:center; padding:28px; color:#94a3b8; font-size:0.9rem;">ไม่พบข้อมูลสินค้าตรงตามเงื่อนไขค้นหา</td></tr>`;
            updateSelectedCountUI();
            return;
        }

        const frag = document.createDocumentFragment();
        let allVisibleChecked = items.length > 0;

        items.forEach((item, index) => {
            const isChecked = selectedItemSnSet.has(item.sn);
            if(!isChecked) allVisibleChecked = false;

            const formatLoc = typeof formatLocationCode === 'function' ? formatLocationCode(item.location) : item.location;
            const meterValue = item.meter !== undefined && item.meter !== null ? item.meter : 0;
            const receiverFullName = formatReceiverFullName(item);

            const safeId = String(item.id || '').replace(/'/g, "\\'");
            const safeSn = String(item.sn || '').replace(/'/g, "\\'");

            const tr = document.createElement('tr');
            tr.style.cssText = "border-bottom: 1px solid #e2e8f0; transition: background 0.1s ease;";
            tr.innerHTML = `
                <td style="text-align:center; vertical-align:middle; padding:8px 6px;"><input type="checkbox" class="item-checkbox" data-sn="${escapeHTML(item.sn)}" ${isChecked ? 'checked' : ''} onchange="toggleItemSelection('${escapeHTML(item.sn)}', this.checked)"></td>
                <td style="text-align:center; font-weight:700; vertical-align:middle; padding:8px 6px;" class="mono">${index + 1}</td>
                <td style="text-align:center; vertical-align:middle; padding:8px 10px;"><code class="mono font-bold" style="color:#0f172a; font-size:0.82rem; background:#f1f5f9; padding:2px 6px; border-radius:4px; border:1px solid #cbd5e1;">${escapeHTML(item.category || 'N/A')}</code></td>
                <td style="text-align:left; vertical-align:middle; padding:8px 10px;"><div style="font-weight:600; color:#1e293b; font-size:0.82rem; display:-webkit-box; -webkit-line-clamp:2; -webkit-box-orient:vertical; overflow:hidden; word-break:break-word; line-height:1.35;" title="${escapeHTML(item.name || '-')}">${escapeHTML(item.name || '-')}</div></td>
                <td style="text-align:center; vertical-align:middle; padding:8px 10px;"><span class="mono font-bold" style="color:#d97706; font-size:0.85rem; display:inline-flex; align-items:center; justify-content:center; gap:4px; background:#fef3c7; padding:2px 8px; border-radius:4px; border:1px solid #fde68a;"><i class="fa-solid fa-gauge" style="font-size:0.75rem;"></i> ${Number(meterValue).toLocaleString()}</span></td>
                <td style="text-align:center; vertical-align:middle; padding:8px 10px;">
                    <div style="display:flex; align-items:center; justify-content:center; gap:4px;">
                        <code class="mono font-bold" style="font-size:0.85rem; background:#f8fafc; padding:2px 6px; border-radius:4px; border:1px solid #cbd5e1; color:#0f172a;">${escapeHTML(item.sn)}</code>
                        <button class="btn btn-sm btn-secondary" style="padding:2px 5px; font-size:0.68rem; border-radius:4px;" onclick="copyTextToClipboard('${escapeHTML(item.sn)}', 'S/N')" title="คัดลอก S/N"><i class="fa-solid fa-copy"></i></button>
                    </div>
                    ${item._pending ? '<div style="text-align:center; margin-top:2px;"><span class="badge-action delete" style="font-size:0.65rem; display:inline-block;"><i class="fa-solid fa-clock"></i> รอบันทึก DB</span></div>' : ''}
                </td>
                <td style="text-align:center; vertical-align:middle; padding:8px 10px;">
                    <div style="display:flex; align-items:center; justify-content:center;">
                        <span class="badge-location mono" style="display:inline-flex; align-items:center; justify-content:center; gap:4px; padding:3px 8px; border-radius:4px; font-size:0.78rem; background:#f1f5f9; border:1px solid #cbd5e1; color:#0f172a; font-weight:700;">
                            <i class="fa-solid fa-location-dot" style="color:#2563eb; font-size:0.7rem;"></i> ${escapeHTML(formatLoc)}
                        </span>
                    </div>
                </td>
                <td style="text-align:center; font-weight:700; vertical-align:middle; padding:8px 6px;" class="mono">${item.qty ?? 1}</td>
                <td style="text-align:center; vertical-align:middle; padding:8px 10px;">
                    <div style="display:flex; align-items:center; justify-content:center;">
                        <span style="font-size:0.78rem; font-weight:600; color:#0f172a; display:inline-flex; align-items:center; justify-content:center; gap:4px; background:#f8fafc; padding:3px 8px; border-radius:4px; border:1px solid #cbd5e1; white-space:nowrap;" title="ชื่อผู้รับเข้า: ${escapeHTML(receiverFullName)}">
                            <i class="fa-solid fa-user-check" style="color:#10b981; font-size:0.7rem;"></i> ${escapeHTML(receiverFullName)}
                        </span>
                    </div>
                </td>
                <td style="text-align:center; font-size:0.75rem; color:#64748b; vertical-align:middle; padding:8px 10px;">${item.created_at ? new Date(item.created_at).toLocaleString('th-TH') : '-'}</td>
                <td style="text-align:center; vertical-align:middle; padding:8px 4px;">
                    <button class="btn btn-sm btn-primary" onclick="openPrintBarcodeModal('SINGLE', '${escapeHTML(item.sn)}')" style="padding:3px 8px; font-size:0.75rem;" title="พิมพ์บาร์โค้ด"><i class="fa-solid fa-barcode"></i> พิมพ์</button>
                </td>
                <td style="text-align:center; vertical-align:middle; padding:8px 4px;">
                    <button class="btn btn-sm btn-secondary" onclick="openEditItemModal('${safeId}', '${safeSn}')" style="padding:3px 8px; font-size:0.75rem;" title="แก้ไขข้อมูล"><i class="fa-solid fa-pen-to-square" style="color:#2563eb;"></i> แก้ไข</button>
                </td>
                <td style="text-align:center; vertical-align:middle; padding:8px 4px;">
                    <button class="btn btn-sm btn-secondary" onclick="requestRelocateModal('${safeId}', '${safeSn}', '${escapeHTML(item.name)}', '${escapeHTML(item.location)}')" style="padding:3px 8px; font-size:0.75rem;" title="ย้ายพิกัด"><i class="fa-solid fa-right-left"></i> ย้าย</button>
                </td>
                <td style="text-align:center; vertical-align:middle; padding:8px 4px;">
                    <button class="btn btn-sm btn-danger" onclick="requestDeleteModal('SINGLE', '${safeSn}', '${safeId}', event)" style="padding:3px 8px; font-size:0.75rem; background:#dc2626; border-color:#dc2626;" title="ลบรายการนี้"><i class="fa-solid fa-trash"></i> ลบ</button>
                </td>
            `;
            frag.appendChild(tr);
        });

        tbody.appendChild(frag);
        const selectAllCb = document.getElementById('selectAllCheckbox');
        if (selectAllCb) selectAllCb.checked = allVisibleChecked;
    }

    updateSelectedCountUI();
}

function toggleGroupSelection(groupKey, checked, event) {
    if (event && typeof event.stopPropagation === 'function') {
        event.stopPropagation();
    }
    const group = currentInventoryGroups.find(g => g.groupKey === groupKey);
    if (!group) return;

    group.items.forEach(item => {
        if (checked) selectedItemSnSet.add(item.sn);
        else selectedItemSnSet.delete(item.sn);
    });

    document.querySelectorAll('.item-checkbox-modal').forEach(cb => {
        const sn = cb.getAttribute('data-sn');
        if (group.items.some(i => i.sn === sn)) cb.checked = checked;
    });

    updateSelectedCountUI();
}

function toggleSelectAllGroups(checked) {
    currentInventoryGroups.forEach(grp => {
        grp.items.forEach(item => {
            if (checked) selectedItemSnSet.add(item.sn);
            else selectedItemSnSet.delete(item.sn);
        });
    });

    document.querySelectorAll('.group-checkbox').forEach(cb => cb.checked = checked);
    updateSelectedCountUI();
}

// -------------------------------------------------------------------------
// 📦 STOCK DETAIL MODAL
// -------------------------------------------------------------------------
function ensureStockDetailModalExists() {
    let modal = document.getElementById('stockDetailModal');
    if (!modal) {
        modal = document.createElement('div');
        modal.id = 'stockDetailModal';
        modal.className = 'modal-overlay';
        modal.style.cssText = `
            display: none;
            position: fixed;
            top: 0; left: 0; width: 100%; height: 100%;
            background: rgba(15, 23, 42, 0.7);
            z-index: 99999;
            align-items: center;
            justify-content: center;
            backdrop-filter: blur(4px);
            padding: 14px;
            box-sizing: border-box;
            animation: fadeInModal 0.15s ease-out;
        `;
        modal.innerHTML = `
            <div class="modal-content" style="
                background: #ffffff;
                border-radius: 12px;
                max-width: 1380px;
                width: 98%;
                max-height: 92vh;
                display: flex;
                flex-direction: column;
                box-shadow: 0 20px 25px -5px rgba(0, 0, 0, 0.2);
                border: 1px solid #cbd5e1;
                overflow: hidden;
            ">
                <div class="modal-header" style="
                    padding: 14px 20px;
                    border-bottom: 1px solid #e2e8f0;
                    display: flex;
                    justify-content: space-between;
                    align-items: center;
                    background: #f8fafc;
                ">
                    <div>
                        <h3 id="stockDetailModalTitle" style="margin:0; font-size:1.1rem; color:#0f172a; font-weight:800; display:flex; align-items:center; gap:8px;">
                            <i class="fa-solid fa-boxes-stacked" style="color:#2563eb;"></i> รายละเอียดซีเรียลสินค้า
                        </h3>
                        <div id="stockDetailModalSubtitle" style="font-size:0.82rem; color:#64748b; margin-top:3px;"></div>
                    </div>
                    <button type="button" onclick="closeStockDetailModal()" style="
                        background: #f1f5f9; border: none; font-size: 1.2rem; width:32px; height:32px; border-radius:6px; cursor: pointer; color: #475569; display:flex; align-items:center; justify-content:center;
                    " onmouseover="this.style.background='#fee2e2'; this.style.color='#dc2626';" onmouseout="this.style.background='#f1f5f9'; this.style.color='#475569';">&times;</button>
                </div>
                
                <div style="padding: 10px 20px; background: #ffffff; border-bottom: 1px solid #e2e8f0; display: flex; flex-wrap: wrap; gap: 8px; align-items: center; justify-content: space-between;">
                    <div style="display:flex; gap:8px; align-items:center; flex:1; min-width:280px; flex-wrap:wrap;">
                        <div style="display:flex; align-items:center; gap:6px; flex:1; min-width:180px;">
                            <i class="fa-solid fa-magnifying-glass" style="color:#64748b; font-size:0.85rem;"></i>
                            <input type="text" id="stockDetailModalSearch" class="form-control" placeholder="ค้นหา S/N, ผู้รับ หรือพิกัด..." oninput="filterStockDetailModalItems()" style="padding:6px 10px; font-size:0.82rem; width:100%; border-radius:6px; border:1px solid #cbd5e1;">
                        </div>
                        <div style="display:flex; align-items:center; gap:6px;">
                            <i class="fa-solid fa-layer-group" style="color:#2563eb; font-size:0.85rem;"></i>
                            <select id="stockDetailModalLocationFilter" class="form-control" onchange="filterStockDetailModalItems()" style="padding:6px 10px; font-size:0.82rem; border-radius:6px; border:1px solid #cbd5e1; background:#fff; cursor:pointer; font-weight:600; color:#0f172a;">
                                <option value="ALL">📍 แสดงทุกพิกัดจัดเก็บจริง</option>
                            </select>
                        </div>
                        <span id="stockDetailFilterCountBadge" class="badge-action nav" style="font-size:0.75rem; display:none; padding:3px 8px; border-radius:4px;"></span>
                    </div>
                    <div style="display:flex; gap:6px; align-items:center; flex-wrap:wrap;">
                        <button class="btn btn-sm btn-secondary" onclick="copyAllSerialsInCurrentGroup()" style="border-radius:6px; font-weight:600; padding:5px 10px; font-size:0.78rem;" title="คัดลอก S/N ทั้งหมดลง Clipboard"><i class="fa-solid fa-copy" style="color:#2563eb;"></i> คัดลอก S/N ทั้งหมด</button>
                        <button class="btn btn-sm btn-primary" onclick="printSelectedBarcodesFromModal()" style="border-radius:6px; font-weight:600; padding:5px 10px; font-size:0.78rem;"><i class="fa-solid fa-barcode"></i> พิมพ์บาร์โค้ดที่เลือก</button>
                        <button class="btn btn-sm btn-secondary" onclick="relocateSelectedFromModal()" style="border-radius:6px; font-weight:600; padding:5px 10px; font-size:0.78rem;"><i class="fa-solid fa-right-left"></i> ย้ายพิกัดที่เลือก</button>
                        <button class="btn btn-sm btn-danger" onclick="deleteSelectedFromModal()" style="border-radius:6px; font-weight:600; padding:5px 10px; font-size:0.78rem; background:#dc2626; border-color:#dc2626;"><i class="fa-solid fa-trash"></i> ลบที่เลือก</button>
                        <button class="btn btn-sm btn-success" onclick="exportExcelFromModal()" style="border-radius:6px; font-weight:600; padding:5px 10px; font-size:0.78rem;"><i class="fa-solid fa-file-excel"></i> ส่งออก Excel</button>
                    </div>
                </div>

                <div class="modal-body" style="padding: 12px 20px; overflow-y: auto; flex: 1;">
                    <div class="table-responsive" style="border-radius:8px; border:1px solid #cbd5e1; overflow-x:auto;">
                        <table class="table" style="width:100%; min-width:1100px; border-collapse:collapse; font-size:0.8rem;">
                            <thead>
                                <tr style="background:#f1f5f9; border-bottom:2px solid #cbd5e1; color:#475569; font-weight:700; text-transform:uppercase;">
                                    <th style="width:36px; text-align:center; padding:10px 6px;"><input type="checkbox" id="modalSelectAllCb" onchange="toggleModalSelectAllItems(this.checked)"></th>
                                    <th style="width:44px; text-align:center; padding:10px 6px;">ลำดับ</th>
                                    <th style="min-width:120px; text-align:center; padding:10px 8px;">รหัสสินค้า (SKU)</th>
                                    <th style="min-width:240px; text-align:left; padding:10px 8px;">ชื่อรุ่น / รายละเอียดสินค้า</th>
                                    <th style="min-width:100px; text-align:center; padding:10px 8px;">เลขมิเตอร์</th>
                                    <th style="min-width:160px; text-align:center; padding:10px 8px;">หมายเลขซีเรียล (S/N)</th>
                                    <th style="min-width:130px; text-align:center; padding:10px 8px;">พิกัดจัดเก็บ</th>
                                    <th style="min-width:60px; text-align:center; padding:10px 6px;">จำนวน</th>
                                    <th style="min-width:140px; text-align:center; padding:10px 8px;">ผู้รับสินค้าเข้า (User)</th>
                                    <th style="min-width:130px; text-align:center; padding:10px 8px;">วันที่รับเข้า</th>
                                    <th style="width:55px; text-align:center; padding:10px 4px;">พิมพ์</th>
                                    <th style="width:55px; text-align:center; padding:10px 4px;">แก้ไข</th>
                                    <th style="width:55px; text-align:center; padding:10px 4px;">ย้าย</th>
                                    <th style="width:55px; text-align:center; padding:10px 4px;">ลบ</th>
                                </tr>
                            </thead>
                            <tbody id="stockDetailModalTbody">
                            </tbody>
                        </table>
                    </div>
                </div>
                
                <div class="modal-footer" style="
                    padding: 10px 20px;
                    border-top: 1px solid #e2e8f0;
                    display: flex;
                    justify-content: space-between;
                    align-items: center;
                    background: #f8fafc;
                ">
                    <span id="stockDetailModalFooterBadge" class="mono font-bold" style="font-size:0.8rem; color:#0f172a;"></span>
                    <button type="button" class="btn btn-secondary" onclick="closeStockDetailModal()" style="border-radius:6px; font-weight:600; padding:5px 14px; font-size:0.8rem;">ปิดหน้าต่าง</button>
                </div>
            </div>
        `;
        document.body.appendChild(modal);
    }
}

function openStockDetailModal(groupKey) {
    currentDetailModalGroupKey = groupKey;
    ensureStockDetailModalExists();

    const grp = currentInventoryGroups.find(g => g.groupKey === groupKey);
    if (!grp) {
        if (typeof showToast === 'function') showToast('⚠️ ไม่พบข้อมูลสินค้ากลุ่มนี้', true);
        return;
    }

    const titleElem = document.getElementById('stockDetailModalTitle');
    const subtitleElem = document.getElementById('stockDetailModalSubtitle');
    const searchInput = document.getElementById('stockDetailModalSearch');
    const locSelect = document.getElementById('stockDetailModalLocationFilter');

    if (titleElem) {
        titleElem.innerHTML = `<i class="fa-solid fa-boxes-stacked" style="color:#2563eb;"></i> รหัสสินค้า: <span class="mono" style="color:#0f172a; background:#e2e8f0; padding:1px 6px; border-radius:4px;">${escapeHTML(grp.category)}</span> | รุ่น: ${escapeHTML(grp.name)}`;
    }
    
    if (subtitleElem) {
        subtitleElem.innerHTML = `ยอดคงเหลือรวม: <strong style="color:#10b981; font-size:0.92rem; background:#ecfdf5; padding:2px 8px; border-radius:4px; border:1px solid #a7f3d0; display:inline-block; margin-left:4px;"><i class="fa-solid fa-cubes"></i> ${grp.totalQty.toLocaleString()} ${escapeHTML(grp.unit)}</strong> | รับเข้าจัดเก็บอยู่ใน ${grp.bays ? grp.bays.length : 0} ล็อก (${grp.locations.length} พิกัดย่อย)`;
    }
    
    if (locSelect) {
        const aisleBayMap = new Map();
        grp.items.forEach(item => {
            const abKey = extractAisleBayKey(item.location);
            aisleBayMap.set(abKey, (aisleBayMap.get(abKey) || 0) + 1);
        });

        const sortedAisleBayKeys = Array.from(aisleBayMap.keys()).sort();
        let locOptions = `<option value="ALL">📍 แสดงทุกพิกัดจัดเก็บ (${sortedAisleBayKeys.length} ล็อก/พิกัด)</option>`;
        
        sortedAisleBayKeys.forEach(abKey => {
            const count = aisleBayMap.get(abKey);
            const labelText = formatAisleBayLabel(abKey);
            locOptions += `<option value="${escapeHTML(abKey)}">📍 ${escapeHTML(labelText)} (${count} เครื่อง)</option>`;
        });

        locSelect.innerHTML = locOptions;
        locSelect.value = 'ALL';
    }

    if (searchInput) searchInput.value = '';
    renderStockDetailModalBody(grp.items);

    const modal = document.getElementById('stockDetailModal');
    if (modal) modal.style.display = 'flex';
}

function renderStockDetailModalBody(items) {
    const tbody = document.getElementById('stockDetailModalTbody');
    if (!tbody) return;
    tbody.innerHTML = '';

    if (!items || items.length === 0) {
        tbody.innerHTML = `<tr><td colspan="14" style="text-align:center; padding:20px; color:#94a3b8; font-size:0.82rem;">ไม่พบรายการซีเรียลสินค้าตรงตามเงื่อนไข</td></tr>`;
        return;
    }

    let allChecked = items.length > 0;
    const frag = document.createDocumentFragment();

    items.forEach((item, index) => {
        const isChecked = selectedItemSnSet.has(item.sn);
        if (!isChecked) allChecked = false;

        const formatLoc = typeof formatLocationCode === 'function' ? formatLocationCode(item.location) : item.location;
        const meterValue = item.meter !== undefined && item.meter !== null ? item.meter : 0;
        const receiverFullName = formatReceiverFullName(item);

        const safeId = String(item.id || '').replace(/'/g, "\\'");
        const safeSn = String(item.sn || '').replace(/'/g, "\\'");

        const tr = document.createElement('tr');
        tr.style.cssText = "border-bottom: 1px solid #e2e8f0; transition: background 0.1s ease;";
        tr.innerHTML = `
            <td style="text-align:center; vertical-align:middle; padding:8px 4px;"><input type="checkbox" class="item-checkbox-modal" data-sn="${escapeHTML(item.sn)}" ${isChecked ? 'checked' : ''} onchange="toggleItemSelection('${escapeHTML(item.sn)}', this.checked)"></td>
            <td style="text-align:center; font-weight:700; vertical-align:middle; padding:8px 4px;" class="mono">${index + 1}</td>
            <td style="text-align:center; vertical-align:middle; padding:8px 8px;"><code class="mono font-bold" style="color:#0f172a; font-size:0.8rem; background:#f1f5f9; padding:2px 6px; border-radius:4px; border:1px solid #cbd5e1;">${escapeHTML(item.category || 'N/A')}</code></td>
            <td style="text-align:left; vertical-align:middle; padding:8px 8px;">
                <div style="font-weight:600; color:#1e293b; font-size:0.8rem; display:-webkit-box; -webkit-line-clamp:2; -webkit-box-orient:vertical; overflow:hidden; word-break:break-word; line-height:1.35;" title="${escapeHTML(item.name || '-')}">${escapeHTML(item.name || '-')}</div>
            </td>
            <td style="text-align:center; vertical-align:middle; padding:8px 8px;"><span class="mono font-bold" style="color:#d97706; font-size:0.82rem; display:inline-flex; align-items:center; justify-content:center; gap:4px; background:#fef3c7; padding:2px 8px; border-radius:4px; border:1px solid #fde68a;"><i class="fa-solid fa-gauge" style="font-size:0.7rem;"></i> ${Number(meterValue).toLocaleString()}</span></td>
            <td style="text-align:center; vertical-align:middle; padding:8px 8px;">
                <div style="display:flex; align-items:center; justify-content:center; gap:4px;">
                    <code class="mono font-bold" style="font-size:0.82rem; background:#f8fafc; padding:2px 6px; border-radius:4px; border:1px solid #cbd5e1; color:#0f172a;">${escapeHTML(item.sn)}</code>
                    <button class="btn btn-sm btn-secondary" style="padding:1px 4px; font-size:0.65rem; border-radius:3px;" onclick="copyTextToClipboard('${escapeHTML(item.sn)}', 'S/N')" title="คัดลอก S/N"><i class="fa-solid fa-copy"></i></button>
                </div>
                ${item._pending ? '<div style="text-align:center; margin-top:2px;"><span class="badge-action delete" style="font-size:0.62rem; display:inline-block;"><i class="fa-solid fa-clock"></i> รอบันทึก DB</span></div>' : ''}
            </td>
            <td style="text-align:center; vertical-align:middle; padding:8px 8px;">
                <div style="display:flex; align-items:center; justify-content:center;">
                    <span class="badge-location mono" style="display:inline-flex; align-items:center; justify-content:center; gap:4px; padding:2px 6px; border-radius:4px; font-size:0.75rem; font-weight:700; background:#f1f5f9; border:1px solid #cbd5e1; color:#0f172a;">
                        <i class="fa-solid fa-location-dot" style="color:#2563eb; font-size:0.68rem;"></i> ${escapeHTML(formatLoc)}
                    </span>
                </div>
            </td>
            <td style="text-align:center; font-weight:700; vertical-align:middle; padding:8px 4px;" class="mono">${item.qty ?? 1}</td>
            <td style="text-align:center; vertical-align:middle; padding:8px 8px;">
                <div style="display:flex; align-items:center; justify-content:center;">
                    <span style="font-size:0.75rem; font-weight:600; color:#0f172a; display:inline-flex; align-items:center; justify-content:center; gap:4px; background:#f8fafc; padding:2px 6px; border-radius:4px; border:1px solid #e2e8f0; white-space:nowrap;" title="ชื่อผู้รับเข้า: ${escapeHTML(receiverFullName)}">
                        <i class="fa-solid fa-user-check" style="color:#10b981; font-size:0.68rem;"></i> ${escapeHTML(receiverFullName)}
                    </span>
                </div>
            </td>
            <td style="text-align:center; font-size:0.72rem; color:#64748b; vertical-align:middle; padding:8px 8px;">${item.created_at ? new Date(item.created_at).toLocaleString('th-TH') : '-'}</td>
            <td style="text-align:center; vertical-align:middle; padding:8px 2px;">
                <button class="btn btn-sm btn-primary" onclick="openPrintBarcodeModal('SINGLE', '${escapeHTML(item.sn)}')" style="padding:2px 6px; font-size:0.72rem;"><i class="fa-solid fa-barcode"></i> พิมพ์</button>
            </td>
            <td style="text-align:center; vertical-align:middle; padding:8px 2px;">
                <button class="btn btn-sm btn-secondary" onclick="openEditItemModal('${safeId}', '${safeSn}')" style="padding:2px 6px; font-size:0.72rem;"><i class="fa-solid fa-pen-to-square" style="color:#2563eb;"></i> แก้ไข</button>
            </td>
            <td style="text-align:center; vertical-align:middle; padding:8px 2px;">
                <button class="btn btn-sm btn-secondary" onclick="requestRelocateModal('${safeId}', '${safeSn}', '${escapeHTML(item.name)}', '${escapeHTML(item.location)}')" style="padding:2px 6px; font-size:0.72rem;"><i class="fa-solid fa-right-left"></i> ย้าย</button>
            </td>
            <td style="text-align:center; vertical-align:middle; padding:8px 2px;">
                <button class="btn btn-sm btn-danger" onclick="requestDeleteModal('SINGLE', '${safeSn}', '${safeId}', event)" style="padding:2px 6px; font-size:0.72rem; background:#dc2626; border-color:#dc2626;"><i class="fa-solid fa-trash"></i> ลบ</button>
            </td>
        `;
        frag.appendChild(tr);
    });

    tbody.appendChild(frag);

    const selectAllCb = document.getElementById('modalSelectAllCb');
    if (selectAllCb) selectAllCb.checked = allChecked;

    const footerBadge = document.getElementById('stockDetailModalFooterBadge');
    if (footerBadge) {
        footerBadge.textContent = `แสดงผล ${items.length} ซีเรียล | เลือกแล้ว ${selectedItemSnSet.size} รายการ`;
    }
}

function filterStockDetailModalItems() {
    if (!currentDetailModalGroupKey) return;
    const grp = currentInventoryGroups.find(g => g.groupKey === currentDetailModalGroupKey);
    if (!grp) return;

    const query = (document.getElementById('stockDetailModalSearch')?.value || '').trim().toLowerCase();
    const selectedAisleBay = (document.getElementById('stockDetailModalLocationFilter')?.value || 'ALL').toUpperCase();
    const badge = document.getElementById('stockDetailFilterCountBadge');

    const filtered = grp.items.filter(item => {
        const receiverName = formatReceiverFullName(item).toLowerCase();
        const matchText = !query || 
            (item.sn && item.sn.toLowerCase().includes(query)) ||
            (item.location && item.location.toLowerCase().includes(query)) ||
            receiverName.includes(query) ||
            (item.meter && String(item.meter).toLowerCase().includes(query));

        let matchAisleBay = true;
        if (selectedAisleBay !== 'ALL') {
            const itemAisleBay = extractAisleBayKey(item.location);
            matchAisleBay = (itemAisleBay === selectedAisleBay);
        }

        return matchText && matchAisleBay;
    });

    if (badge) {
        if (query || selectedAisleBay !== 'ALL') {
            badge.textContent = `พบ ${filtered.length} / ${grp.items.length} รายการ`;
            badge.style.display = 'inline-block';
        } else {
            badge.style.display = 'none';
        }
    }

    renderStockDetailModalBody(filtered);
}

function closeStockDetailModal() {
    const modal = document.getElementById('stockDetailModal');
    if (modal) modal.style.display = 'none';
    currentDetailModalGroupKey = null;
    renderInventoryTable(currentFilteredItems);
}

function toggleModalSelectAllItems(checked) {
    if (!currentDetailModalGroupKey) return;
    const grp = currentInventoryGroups.find(g => g.groupKey === currentDetailModalGroupKey);
    if (!grp) return;

    grp.items.forEach(item => {
        if (checked) selectedItemSnSet.add(item.sn);
        else selectedItemSnSet.delete(item.sn);
    });

    renderStockDetailModalBody(grp.items);
    updateSelectedCountUI();
}

// =========================================================================
// 🟢 EDIT MODAL ENGINE & REAL-TIME AUTO UPDATE
// =========================================================================

function buildFreshEditModalDOM() {
    const existingModal = document.getElementById('editItemModal');
    if (existingModal) existingModal.remove();

    const modal = document.createElement('div');
    modal.id = 'editItemModal';
    modal.className = 'modal-overlay';
    modal.style.setProperty('display', 'none', 'important');
    modal.style.setProperty('position', 'fixed', 'important');
    modal.style.setProperty('top', '0', 'important');
    modal.style.setProperty('left', '0', 'important');
    modal.style.setProperty('width', '100vw', 'important');
    modal.style.setProperty('height', '100vh', 'important');
    modal.style.setProperty('background', 'rgba(15, 23, 42, 0.75)', 'important');
    modal.style.setProperty('z-index', '99999999', 'important');
    modal.style.setProperty('align-items', 'center', 'important');
    modal.style.setProperty('justify-content', 'center', 'important');
    modal.style.setProperty('backdrop-filter', 'blur(4px)', 'important');
    modal.style.setProperty('padding', '16px', 'important');
    modal.style.setProperty('box-sizing', 'border-box', 'important');

    modal.innerHTML = `
        <div class="modal-content" style="
            background: #ffffff !important;
            border-radius: 12px !important;
            max-width: 520px !important;
            width: 95% !important;
            display: flex !important;
            flex-direction: column !important;
            box-shadow: 0 20px 25px -5px rgba(0, 0, 0, 0.2) !important;
            border: 1px solid #cbd5e1 !important;
            overflow: hidden !important;
            font-family: system-ui, -apple-system, sans-serif !important;
            animation: fadeInModal 0.15s ease-out !important;
        ">
            <div style="
                padding: 16px 20px !important;
                border-bottom: 1px solid #e2e8f0 !important;
                display: flex !important;
                justify-content: space-between !important;
                align-items: center !important;
                background: #f8fafc !important;
            ">
                <h3 style="margin:0 !important; font-size:1.1rem !important; color:#0f172a !important; font-weight:800 !important; display:flex !important; align-items:center !important; gap:8px !important;">
                    <i class="fa-solid fa-pen-to-square" style="color:#2563eb !important;"></i> แก้ไขรายละเอียดสินค้า
                </h3>
                <button type="button" onclick="closeEditItemModal()" style="
                    background: transparent !important;
                    border: none !important;
                    font-size: 1.3rem !important;
                    cursor: pointer !important;
                    color: #64748b !important;
                    line-height: 1 !important;
                ">&times;</button>
            </div>

            <div style="padding:20px !important; display:flex !important; flex-direction:column !important; gap:14px !important; background:#ffffff !important;">
                <input type="hidden" id="editModalItemId">

                <div>
                    <div style="display:flex !important; justify-content:space-between !important; align-items:center !important; margin-bottom:4px !important;">
                        <label style="font-weight:700 !important; font-size:0.82rem !important; color:#334155 !important;">หมายเลขซีเรียล (S/N):</label>
                        <span style="font-size:0.7rem !important; color:#64748b !important; font-weight:600 !important;"><i class="fa-solid fa-lock"></i> ดูได้อย่างเดียว</span>
                    </div>
                    <input type="text" id="editModalSn" readonly style="width:100% !important; padding:8px 10px !important; font-size:0.88rem !important; font-family:monospace !important; font-weight:700 !important; background:#f1f5f9 !important; color:#475569 !important; border:1px solid #cbd5e1 !important; border-radius:6px !important; box-sizing:border-box !important; cursor:not-allowed !important;">
                </div>

                <div>
                    <label style="font-weight:700 !important; font-size:0.82rem !important; color:#334155 !important; margin-bottom:4px !important; display:block !important;">รหัสสินค้า (SKU / Category):</label>
                    <input type="text" id="editModalCategory" style="width:100% !important; padding:8px 10px !important; font-size:0.88rem !important; font-weight:600 !important; border:1px solid #cbd5e1 !important; border-radius:6px !important; box-sizing:border-box !important; background:#ffffff !important; color:#0f172a !important;">
                </div>

                <div>
                    <label style="font-weight:700 !important; font-size:0.82rem !important; color:#334155 !important; margin-bottom:4px !important; display:block !important;">ชื่อรุ่น / รายละเอียดสินค้า:</label>
                    <textarea id="editModalName" rows="3" style="width:100% !important; padding:8px 10px !important; font-size:0.88rem !important; font-weight:500 !important; border:1px solid #cbd5e1 !important; border-radius:6px !important; box-sizing:border-box !important; resize:vertical !important; line-height:1.4 !important; background:#ffffff !important; color:#0f172a !important;"></textarea>
                </div>

                <div>
                    <label style="font-weight:700 !important; font-size:0.82rem !important; color:#334155 !important; margin-bottom:4px !important; display:block !important;">เลขมิเตอร์:</label>
                    <input type="number" id="editModalMeter" style="width:100% !important; padding:8px 10px !important; font-size:0.88rem !important; font-weight:700 !important; border:1px solid #cbd5e1 !important; border-radius:6px !important; box-sizing:border-box !important; background:#ffffff !important; color:#0f172a !important;">
                </div>

                <div>
                    <div style="display:flex !important; justify-content:space-between !important; align-items:center !important; margin-bottom:4px !important;">
                        <label style="font-weight:700 !important; font-size:0.82rem !important; color:#334155 !important;">พิกัดจัดเก็บปัจจุบัน:</label>
                        <span style="font-size:0.7rem !important; color:#64748b !important; font-weight:600 !important;"><i class="fa-solid fa-lock"></i> ดูได้อย่างเดียว</span>
                    </div>
                    <input type="text" id="editModalLocation" readonly style="width:100% !important; padding:8px 10px !important; font-size:0.88rem !important; font-family:monospace !important; text-transform:uppercase !important; font-weight:700 !important; background:#f1f5f9 !important; color:#475569 !important; border:1px solid #cbd5e1 !important; border-radius:6px !important; box-sizing:border-box !important; cursor:not-allowed !important;">
                </div>
            </div>

            <div style="
                padding: 14px 20px !important;
                border-top: 1px solid #e2e8f0 !important;
                display: flex !important;
                justify-content: flex-end !important;
                gap: 8px !important;
                background: #f8fafc !important;
            ">
                <button type="button" onclick="closeEditItemModal()" style="border-radius:6px !important; font-weight:600 !important; padding:7px 16px !important; font-size:0.82rem !important; background:#e2e8f0 !important; color:#334155 !important; border:none !important; cursor:pointer !important;">ยกเลิก</button>
                <button type="button" onclick="saveEditedItemData()" style="border-radius:6px !important; font-weight:700 !important; padding:7px 20px !important; font-size:0.82rem !important; background:#2563eb !important; color:#ffffff !important; border:none !important; cursor:pointer !important;"><i class="fa-solid fa-floppy-disk"></i> บันทึกแก้ไข</button>
            </div>
        </div>
    `;

    document.body.appendChild(modal);
}

function openEditItemModal(rawId, rawSn) {
    buildFreshEditModalDOM();

    const targetId = (rawId !== undefined && rawId !== null && String(rawId) !== 'undefined' && String(rawId) !== 'null') ? String(rawId).trim() : '';
    const targetSn = (rawSn !== undefined && rawSn !== null && String(rawSn) !== 'undefined' && String(rawSn) !== 'null') ? String(rawSn).trim().toLowerCase() : '';

    let targetItem = globalInventoryData.find(i => {
        if (targetSn && i.sn) return String(i.sn).trim().toLowerCase() === targetSn;
        if (targetId && i.id) return String(i.id).trim() === targetId;
        return false;
    });

    if (!targetItem && currentDetailModalGroupKey) {
        const grp = currentInventoryGroups.find(g => g.groupKey === currentDetailModalGroupKey);
        if (grp && grp.items) {
            targetItem = grp.items.find(i => {
                if (targetSn && i.sn) return String(i.sn).trim().toLowerCase() === targetSn;
                if (targetId && i.id) return String(i.id).trim() === targetId;
                return false;
            });
        }
    }

    if (!targetItem) {
        alert('⚠️ ไม่พบข้อมูลรายการสินค้าที่จะแก้ไข');
        return;
    }

    window.currentEditingItemId = targetItem.id;
    window.currentEditingItemSn = targetItem.sn;

    const formattedLoc = typeof formatLocationCode === 'function' ? formatLocationCode(targetItem.location) : (targetItem.location || '-');

    const setVal = (id, val) => {
        const el = document.getElementById(id);
        if (el) el.value = (val !== undefined && val !== null) ? val : '';
    };

    setVal('editModalItemId', targetItem.id ?? '');
    setVal('editModalSn', targetItem.sn ?? '-');
    setVal('editModalCategory', targetItem.category ?? '');
    setVal('editModalName', targetItem.name ?? '');
    setVal('editModalMeter', targetItem.meter ?? 0);
    setVal('editModalLocation', formattedLoc);

    const modal = document.getElementById('editItemModal');
    if (modal) modal.style.setProperty('display', 'flex', 'important');
}

function closeEditItemModal() {
    const modal = document.getElementById('editItemModal');
    if (modal) modal.style.setProperty('display', 'none', 'important');
}

async function saveEditedItemData() {
    const id = document.getElementById('editModalItemId')?.value;
    const currentSn = window.currentEditingItemSn;

    const newCat = (document.getElementById('editModalCategory')?.value || '').trim();
    const newName = (document.getElementById('editModalName')?.value || '').trim();
    const newMeter = parseFloat(document.getElementById('editModalMeter')?.value) || 0;

    const item = globalInventoryData.find(i => 
        (id && String(i.id) === String(id)) || 
        (currentSn && String(i.sn).toLowerCase() === String(currentSn).toLowerCase())
    );

    if (!item) {
        alert('❌ ไม่พบรายการสินค้าที่ต้องการบันทึกในระบบ');
        return;
    }

    item.category = newCat || item.category;
    item.name = newName || item.name;
    item.meter = newMeter;

    const client = getSupabaseClient();
    if (client && item.id && !item._pending) {
        try {
            await client.from('warehouse_items').update({
                category: item.category,
                name: item.name,
                meter: item.meter
            }).eq('id', item.id);
        } catch (e) {
            console.error('Supabase update error:', e);
        }
    }

    rebuildOccupiedSet();
    populateStockFilterDropdowns();
    filterInventoryData();
    updateKPIs();
    refreshStockDetailModalIfActive();
    closeEditItemModal();

    if (typeof showToast === 'function') {
        showToast(`✅ อัปเดตข้อมูลสินค้า S/N: ${item.sn} เรียบร้อยแล้ว`);
    } else {
        alert(`✅ อัปเดตข้อมูลสินค้า S/N: ${item.sn} เรียบร้อยแล้ว`);
    }
}

// =========================================================================
// 🚚 BATCH RELOCATE SYSTEM
// =========================================================================

function buildFreshBatchRelocateModalDOM() {
    const existing = document.getElementById('batchRelocateModal');
    if (existing) existing.remove();

    const modal = document.createElement('div');
    modal.id = 'batchRelocateModal';
    modal.className = 'modal-overlay';
    modal.style.setProperty('display', 'none', 'important');
    modal.style.setProperty('position', 'fixed', 'important');
    modal.style.setProperty('top', '0', 'important');
    modal.style.setProperty('left', '0', 'important');
    modal.style.setProperty('width', '100vw', 'important');
    modal.style.setProperty('height', '100vh', 'important');
    modal.style.setProperty('background', 'rgba(15, 23, 42, 0.75)', 'important');
    modal.style.setProperty('z-index', '99999999', 'important');
    modal.style.setProperty('align-items', 'center', 'important');
    modal.style.setProperty('justify-content', 'center', 'important');
    modal.style.setProperty('backdrop-filter', 'blur(4px)', 'important');
    modal.style.setProperty('padding', '16px', 'important');
    modal.style.setProperty('box-sizing', 'border-box', 'important');

    const discoveredAisles = discoverAllDatabaseAisles();
    let aisleOptionsHtml = '';
    discoveredAisles.forEach(a => {
        const label = formatAisleBayLabel(a);
        aisleOptionsHtml += `<option value="${escapeHTML(a)}">${escapeHTML(label)}</option>`;
    });

    modal.innerHTML = `
        <div class="modal-content" style="
            background: #ffffff !important;
            border-radius: 12px !important;
            max-width: 540px !important;
            width: 95% !important;
            display: flex !important;
            flex-direction: column !important;
            box-shadow: 0 20px 25px -5px rgba(0, 0, 0, 0.2) !important;
            border: 1px solid #cbd5e1 !important;
            overflow: hidden !important;
            font-family: system-ui, -apple-system, sans-serif !important;
            animation: fadeInModal 0.15s ease-out !important;
        ">
            <div style="
                padding: 16px 20px !important;
                border-bottom: 1px solid #e2e8f0 !important;
                display: flex !important;
                justify-content: space-between !important;
                align-items: center !important;
                background: #f8fafc !important;
            ">
                <h3 style="margin:0 !important; font-size:1.1rem !important; color:#0f172a !important; font-weight:800 !important; display:flex !important; align-items:center !important; gap:8px !important;">
                    <i class="fa-solid fa-right-left" style="color:#2563eb !important;"></i> ย้ายพิกัดจัดเก็บสินค้าแบบกลุ่ม
                </h3>
                <button type="button" onclick="closeBatchRelocateModal()" style="
                    background: transparent !important;
                    border: none !important;
                    font-size: 1.3rem !important;
                    cursor: pointer !important;
                    color: #64748b !important;
                    line-height: 1 !important;
                ">&times;</button>
            </div>

            <div style="padding:20px !important; display:flex !important; flex-direction:column !important; gap:14px !important; background:#ffffff !important;">
                <div style="background:#f8fafc !important; padding:12px !important; border-radius:8px !important; border:1px solid #cbd5e1 !important;">
                    <div style="font-size:0.85rem !important; color:#334155 !important; font-weight:700 !important; display:flex !important; justify-content:space-between !important; align-items:center !important;">
                        <span>📦 จำนวนสินค้าที่เลือกย้าย:</span>
                        <strong id="batchRelocateTotalCount" style="color:#2563eb !important; font-size:1.05rem !important; background:#eff6ff !important; padding:2px 8px !important; border-radius:4px !important; font-family:monospace !important; border:1px solid #bfdbfe !important;">0</strong>
                    </div>
                    <div id="batchRelocateCapacityBadge" style="margin-top:6px !important; font-size:0.75rem !important; color:#64748b !important;"></div>
                </div>

                <div style="font-weight:700 !important; font-size:0.85rem !important; color:#0f172a !important;">📍 เลือกแถว/โซนเป้าหมายสำหรับกระจายลงล็อกว่างอัตโนมัติ:</div>
                <div style="display:grid !important; grid-template-columns:1fr 1fr !important; gap:8px !important;">
                    <div>
                        <label style="font-size:0.78rem !important; font-weight:600 !important; color:#334155 !important; margin-bottom:4px !important; display:block !important;">เลือกแถว/โซน (DB Aisles):</label>
                        <select id="batchRelocateSelectAisle" onchange="updateBatchRelocateCapacityPreview()" style="width:100% !important; padding:8px 10px !important; font-size:0.85rem !important; border-radius:6px !important; border:1px solid #cbd5e1 !important; background:#fff !important; font-weight:600 !important; color:#0f172a !important; cursor:pointer !important;">
                            ${aisleOptionsHtml}
                        </select>
                    </div>
                    <div>
                        <label style="font-size:0.78rem !important; font-weight:600 !important; color:#334155 !important; margin-bottom:4px !important; display:block !important;">โหมดจัดสรรพิกัด:</label>
                        <input type="text" value="จัดสรรช่องว่างอัตโนมัติ" readonly style="width:100% !important; padding:8px 10px !important; font-size:0.8rem !important; border-radius:6px !important; border:1px solid #cbd5e1 !important; background:#f1f5f9 !important; color:#475569 !important; font-weight:600 !important; cursor:not-allowed !important;">
                    </div>
                </div>

                <div>
                    <label style="font-weight:700 !important; font-size:0.82rem !important; color:#334155 !important; margin-bottom:4px !important; display:block !important;">หรือระบุพิกัดเป้าหมายเดี่ยวสำหรับใช้ร่วมกันทุกรายการ:</label>
                    <input type="text" id="batchRelocateCustomLocInput" style="width:100% !important; padding:8px 10px !important; font-size:0.88rem !important; font-family:monospace !important; text-transform:uppercase !important; font-weight:700 !important; border:1px solid #cbd5e1 !important; border-radius:6px !important; box-sizing:border-box !important;" placeholder="เช่น A-01-1-01 (เว้นว่างไว้เพื่อใช้อัตโนมัติ)">
                </div>
            </div>

            <div style="
                padding: 14px 20px !important;
                border-top: 1px solid #e2e8f0 !important;
                display: flex !important;
                justify-content: flex-end !important;
                gap: 8px !important;
                background: #f8fafc !important;
            ">
                <button type="button" onclick="closeBatchRelocateModal()" style="border-radius:6px !important; font-weight:600 !important; padding:7px 16px !important; font-size:0.82rem !important; background:#e2e8f0 !important; color:#334155 !important; border:none !important; cursor:pointer !important;">ยกเลิก</button>
                <button type="button" onclick="executeBatchRelocateFromModal()" style="border-radius:6px !important; font-weight:700 !important; padding:7px 20px !important; font-size:0.82rem !important; background:#2563eb !important; color:#ffffff !important; border:none !important; cursor:pointer !important;"><i class="fa-solid fa-check"></i> ยืนยันย้ายพิกัดกลุ่ม</button>
            </div>
        </div>
    `;

    document.body.appendChild(modal);
}

function requestBatchRelocateModal() {
    if (selectedItemSnSet.size === 0) {
        if (typeof showToast === 'function') showToast("⚠️ กรุณาเลือกรายการสินค้าอย่างน้อย 1 รายการเพื่อย้ายพิกัด", true);
        else alert("⚠️ กรุณาเลือกรายการสินค้าอย่างน้อย 1 รายการเพื่อย้ายพิกัด");
        return;
    }

    buildFreshBatchRelocateModalDOM();

    const countElem = document.getElementById('batchRelocateTotalCount');
    if (countElem) countElem.textContent = selectedItemSnSet.size.toLocaleString();

    updateBatchRelocateCapacityPreview();

    const modal = document.getElementById('batchRelocateModal');
    if (modal) modal.style.setProperty('display', 'flex', 'important');
}

function closeBatchRelocateModal() {
    const modal = document.getElementById('batchRelocateModal');
    if (modal) modal.style.setProperty('display', 'none', 'important');
}

function updateBatchRelocateCapacityPreview() {
    const aisleSel = document.getElementById('batchRelocateSelectAisle');
    const badge = document.getElementById('batchRelocateCapacityBadge');
    if (!aisleSel || !badge) return;

    const targetAisle = aisleSel.value;
    const capInfo = calculateAisleCapacityInfo(targetAisle);

    if (capInfo.isUnlimited) {
        badge.innerHTML = `<i class="fa-solid fa-info-circle" style="color:#2563eb;"></i> พื้นที่ไม่จำกัดความจุ (${targetAisle})`;
    } else {
        const req = selectedItemSnSet.size;
        if (capInfo.available >= req) {
            badge.innerHTML = `<i class="fa-solid fa-circle-check" style="color:#10b981;"></i> แถว ${targetAisle} เหลือพื้นที่ว่าง <strong style="color:#10b981;">${capInfo.available}</strong> ช่อง (เพียงพอสำหรับ ${req} เครื่อง)`;
        } else {
            badge.innerHTML = `<i class="fa-solid fa-triangle-exclamation" style="color:#dc2626;"></i> คำเตือน: แถว ${targetAisle} เหลือพื้นที่ว่างเพียง <strong style="color:#dc2626;">${capInfo.available}</strong> ช่อง (ไม่พอสำหรับ ${req} เครื่อง)`;
        }
    }
}

async function executeBatchRelocateFromModal() {
    if (selectedItemSnSet.size === 0) return;

    const aisleSel = document.getElementById('batchRelocateSelectAisle');
    const customInp = document.getElementById('batchRelocateCustomLocInput');

    const targetAisle = aisleSel ? aisleSel.value : 'A';
    const customLoc = customInp ? customInp.value.trim().toUpperCase() : '';

    if (customLoc) {
        const targetCoords = Array(selectedItemSnSet.size).fill(customLoc);
        await executeBatchRelocate(customLoc, targetCoords);
    } else {
        await executeBatchRelocate(targetAisle);
    }

    closeBatchRelocateModal();
}

async function executeBatchRelocate(targetAisle, targetCoords = null) {
    if (selectedItemSnSet.size === 0) return;

    const selectSns = Array.from(selectedItemSnSet);
    const coords = targetCoords || calculateBatchRelocateTargetCoordinates(targetAisle, selectSns.length);

    const client = getSupabaseClient();

    for (let i = 0; i < selectSns.length; i++) {
        const sn = selectSns[i];
        const newLoc = coords[i] || targetAisle;

        const liveItem = globalInventoryData.find(item => String(item.sn).toLowerCase() === String(sn).toLowerCase());
        if (liveItem) {
            liveItem.location = newLoc;
            if (client && liveItem.id && !liveItem._pending) {
                try {
                    await client.from('warehouse_items').update({ location: newLoc }).eq('id', liveItem.id);
                } catch (e) {}
            }
        }
    }

    selectedItemSnSet.clear();
    rebuildOccupiedSet();
    populateStockFilterDropdowns();
    filterInventoryData();
    updateKPIs();
    refreshStockDetailModalIfActive();

    if (typeof showToast === 'function') {
        showToast(`🚚 ย้ายพิกัดสินค้าจำนวน ${selectSns.length} รายการ ไปยัง [${targetAisle}] สำเร็จเรียบร้อยแล้ว`);
    }
}

function relocateSelectedFromModal() {
    closeStockDetailModal();
    setTimeout(() => {
        requestBatchRelocateModal();
    }, 100);
}

// -------------------------------------------------------------------------
// 🔄 SINGLE RELOCATE MODAL & DYNAMIC AISLE DISCOVERY ENGINE
// -------------------------------------------------------------------------
function populateRelocateAisleDropdown() {
    const aisleSel = document.getElementById('relocateSelectAisle');
    if (!aisleSel) return;

    const discoveredAisles = discoverAllDatabaseAisles();
    let optionsHtml = '';

    discoveredAisles.forEach(a => {
        const label = formatAisleBayLabel(a);
        optionsHtml += `<option value="${escapeHTML(a)}">${escapeHTML(label)}</option>`;
    });

    aisleSel.innerHTML = optionsHtml;
}

function ensureRelocateModalExists() {
    let modal = document.getElementById('relocateItemModal');
    if (!modal) {
        modal = document.createElement('div');
        modal.id = 'relocateItemModal';
        modal.className = 'modal-overlay';
        modal.style.cssText = `
            display: none;
            position: fixed;
            top: 0; left: 0; width: 100%; height: 100%;
            background: rgba(15, 23, 42, 0.75);
            z-index: 100005;
            align-items: center;
            justify-content: center;
            backdrop-filter: blur(4px);
            padding: 16px;
            box-sizing: border-box;
        `;
        modal.innerHTML = `
            <div class="modal-content" style="
                background: #ffffff;
                border-radius: 12px;
                max-width: 520px;
                width: 95%;
                display: flex;
                flex-direction: column;
                box-shadow: 0 20px 25px -5px rgba(0, 0, 0, 0.2);
                border: 1px solid #cbd5e1;
                overflow: hidden;
            ">
                <div class="modal-header" style="
                    padding: 14px 20px;
                    border-bottom: 1px solid #e2e8f0;
                    display: flex;
                    justify-content: space-between;
                    align-items: center;
                    background: #f8fafc;
                ">
                    <h3 style="margin:0; font-size:1.1rem; color:#0f172a; font-weight:800; display:flex; align-items:center; gap:8px;">
                        <i class="fa-solid fa-right-left" style="color:#2563eb;"></i> ย้ายพิกัดจัดเก็บสินค้า
                    </h3>
                    <button type="button" onclick="closeRelocateModal()" style="background:transparent; border:none; font-size:1.2rem; cursor:pointer; color:#64748b;">&times;</button>
                </div>
                <div class="modal-body" style="padding:18px; display:flex; flex-direction:column; gap:12px;">
                    <div style="background:#f8fafc; padding:10px 12px; border-radius:8px; border:1px solid #cbd5e1; font-size:0.82rem;">
                        <div>S/N: <strong id="relocateModalSn" class="mono" style="color:#2563eb;"></strong></div>
                        <div style="margin-top:3px;">ชื่อรุ่น: <strong id="relocateModalName"></strong></div>
                        <div style="margin-top:3px;">พิกัดปัจจุบัน: <span id="relocateModalCurrentLoc" class="badge-location mono"></span></div>
                    </div>

                    <div style="font-weight:700; font-size:0.82rem; color:#0f172a;">📍 เลือกย้ายพิกัดตามแถวที่มีในฐานข้อมูล / ล็อก / ชั้น / ช่อง:</div>
                    <div style="display:grid; grid-template-columns:1fr 1fr; gap:8px;">
                        <div class="form-group">
                            <label style="font-size:0.78rem; font-weight:600; margin-bottom:2px; display:block;">แถว (Aisle ใน Config/DB):</label>
                            <select id="relocateSelectAisle" class="form-control" onchange="updateRelocateLocPreviewFromSelects()" style="padding:7px; font-size:0.82rem; border-radius:6px; border:1px solid #cbd5e1; font-weight:600;">
                            </select>
                        </div>
                        <div class="form-group">
                            <label style="font-size:0.78rem; font-weight:600; margin-bottom:2px; display:block;">ล็อก (Bay):</label>
                            <select id="relocateSelectBay" class="form-control" onchange="updateRelocateLocPreviewFromSelects()" style="padding:7px; font-size:0.82rem; border-radius:6px; border:1px solid #cbd5e1;">
                            </select>
                        </div>
                        <div class="form-group">
                            <label style="font-size:0.78rem; font-weight:600; margin-bottom:2px; display:block;">ชั้น (Shelf):</label>
                            <select id="relocateSelectShelf" class="form-control" onchange="updateRelocateSlotOptionsWithStatus()" style="padding:7px; font-size:0.82rem; border-radius:6px; border:1px solid #cbd5e1;">
                            </select>
                        </div>
                        <div class="form-group">
                            <label style="font-size:0.78rem; font-weight:600; margin-bottom:2px; display:block;">ช่อง (Slot):</label>
                            <select id="relocateSelectSlot" class="form-control" onchange="updateRelocateCustomLocOnly()" style="padding:7px; font-size:0.82rem; border-radius:6px; border:1px solid #cbd5e1;">
                            </select>
                        </div>
                    </div>

                    <div class="form-group">
                        <label style="font-weight:700; font-size:0.82rem; margin-bottom:3px; display:block;">หรือระบุพิกัดตรง / ปรับแต่งเอง (Custom Location):</label>
                        <input type="text" id="relocateTargetLocInput" class="form-control" style="padding:8px 10px; font-size:0.88rem; font-family:monospace; text-transform:uppercase; font-weight:700; border-radius:6px; border:1px solid #cbd5e1;" placeholder="เช่น A-01-1-01">
                    </div>
                </div>
                <div class="modal-footer" style="padding:12px 20px; border-top:1px solid #e2e8f0; display:flex; justify-content:flex-end; gap:8px; background:#f8fafc;">
                    <button type="button" class="btn btn-secondary" onclick="closeRelocateModal()" style="border-radius:6px; font-weight:600; padding:6px 14px; font-size:0.8rem;">ยกเลิก</button>
                    <button type="button" class="btn btn-primary" onclick="executeSingleRelocate()" style="border-radius:6px; font-weight:700; padding:6px 18px; font-size:0.8rem;"><i class="fa-solid fa-check"></i> ยืนยันย้ายพิกัด</button>
                </div>
            </div>
        `;
        document.body.appendChild(modal);
    }
}

function updateRelocateSlotOptionsWithStatus() {
    const aisle = document.getElementById('relocateSelectAisle')?.value || 'A';
    const bay = document.getElementById('relocateSelectBay')?.value || '01';
    const shelf = document.getElementById('relocateSelectShelf')?.value || '1';
    const slotSel = document.getElementById('relocateSelectSlot');
    if (!slotSel) return;

    const configs = window.aisleConfigs || {};
    const cfg = configs[aisle] || (typeof getAisleConfig === 'function' ? getAisleConfig(aisle) : { slots: 10 });
    const maxSlots = parseInt(cfg.slots || cfg.slot) || 10;

    let optionsHtml = '';
    let firstAvailableSlot = null;

    for (let sl = 1; sl <= maxSlots; sl++) {
        const slotStr = String(sl).padStart(2, '0');
        const locCode = `${aisle}-${bay}-${shelf}-${slotStr}`;
        const normCode = normalizeLoc(locCode);

        const occupyingItem = globalInventoryData.find(i => {
            if (!i || !i.location) return false;
            const itemNorm = normalizeLoc(i.location);
            return itemNorm === normCode || i.location.toUpperCase() === locCode;
        });

        if (occupyingItem) {
            optionsHtml += `<option value="${slotStr}" style="color:#dc2626; font-weight:700;">ช่อง S${slotStr} (❌ มี S/N: ${escapeHTML(occupyingItem.sn)})</option>`;
        } else {
            if (!firstAvailableSlot) firstAvailableSlot = slotStr;
            optionsHtml += `<option value="${slotStr}" style="color:#10b981; font-weight:700;">ช่อง S${slotStr} (✨ ว่าง)</option>`;
        }
    }

    slotSel.innerHTML = optionsHtml;
    if (firstAvailableSlot) {
        slotSel.value = firstAvailableSlot;
    }
    updateRelocateCustomLocOnly();
}

function updateRelocateLocPreviewFromSelects() {
    const aisle = document.getElementById('relocateSelectAisle')?.value || 'A';
    const baySel = document.getElementById('relocateSelectBay');
    const shelfSel = document.getElementById('relocateSelectShelf');

    const configs = window.aisleConfigs || {};
    const cfg = configs[aisle] || (typeof getAisleConfig === 'function' ? getAisleConfig(aisle) : { bays: 10, shelves: 1, slots: 10 });

    const maxBays = parseInt(cfg.bays || cfg.bay) || 10;
    const maxShelves = parseInt(cfg.shelves || cfg.shelf) || 1;

    if (baySel) {
        const currentBayVal = baySel.value;
        let opts = '';
        for (let i = 1; i <= maxBays; i++) {
            const val = String(i).padStart(2, '0');
            opts += `<option value="${val}">ล็อก ${val}</option>`;
        }
        baySel.innerHTML = opts;
        if (currentBayVal && parseInt(currentBayVal, 10) <= maxBays) {
            baySel.value = String(parseInt(currentBayVal, 10)).padStart(2, '0');
        }
    }

    if (shelfSel) {
        const currentShelfVal = shelfSel.value;
        let opts = '';
        for (let s = 1; s <= maxShelves; s++) {
            opts += `<option value="${s}">ชั้น ${s}</option>`;
        }
        shelfSel.innerHTML = opts;
        if (currentShelfVal && parseInt(currentShelfVal, 10) <= maxShelves) {
            shelfSel.value = currentShelfVal;
        }
    }

    const bay = baySel?.value || '01';
    const freeSlot = findFirstAvailableSlotInAisleBay(aisle, bay);

    if (shelfSel && freeSlot && freeSlot.shelf) {
        if (parseInt(freeSlot.shelf, 10) <= maxShelves) {
            shelfSel.value = freeSlot.shelf;
        }
    }

    updateRelocateSlotOptionsWithStatus();
}

function updateRelocateCustomLocOnly() {
    const aisle = document.getElementById('relocateSelectAisle')?.value || 'A';
    const bay = document.getElementById('relocateSelectBay')?.value || '01';
    const shelf = document.getElementById('relocateSelectShelf')?.value || '1';
    const slot = document.getElementById('relocateSelectSlot')?.value || '01';

    const input = document.getElementById('relocateTargetLocInput');
    if (input) {
        if (['DOCK', 'OFFICE', 'PENDING', 'FOOD', 'FREEZER', 'COLD', 'DRY', 'RAW'].includes(aisle)) {
            input.value = aisle;
        } else {
            input.value = `${aisle}-${bay}-${shelf}-${slot}`;
        }
    }
}

function requestRelocateModal(id, sn, name, location) {
    const targetIdClean = (id !== undefined && id !== null && String(id) !== 'undefined' && String(id) !== 'null') ? String(id).trim() : '';
    const targetSnClean = (sn !== undefined && sn !== null && String(sn) !== 'undefined' && String(sn) !== 'null') ? String(sn).trim().toLowerCase() : '';

    const item = globalInventoryData.find(i => 
        (targetIdClean && String(i.id).trim() === targetIdClean) || 
        (targetSnClean && String(i.sn).trim().toLowerCase() === targetSnClean)
    ) || { id: targetIdClean, sn: rawSnOriginal(sn), name, location };

    window.pendingRelocateItem = item;

    ensureRelocateModalExists();
    populateRelocateAisleDropdown();

    const snElem = document.getElementById('relocateModalSn');
    const nameElem = document.getElementById('relocateModalName');
    const curLocElem = document.getElementById('relocateModalCurrentLoc');

    if (snElem) snElem.textContent = item.sn || '-';
    if (nameElem) nameElem.textContent = item.name || '-';
    if (curLocElem) curLocElem.textContent = typeof formatLocationCode === 'function' ? formatLocationCode(item.location) : (item.location || '-');

    const currentAisle = extractAisleKey(item.location);
    const aisleSel = document.getElementById('relocateSelectAisle');
    if (aisleSel && currentAisle) {
        const optionExists = Array.from(aisleSel.options).some(o => o.value === currentAisle);
        if (optionExists) aisleSel.value = currentAisle;
    }

    updateRelocateLocPreviewFromSelects();

    const modal = document.getElementById('relocateItemModal');
    if (modal) {
        modal.style.zIndex = '100005';
        modal.style.display = 'flex';
    }
}

function rawSnOriginal(snVal) {
    return (snVal !== undefined && snVal !== null && String(snVal) !== 'undefined' && String(snVal) !== 'null') ? String(snVal) : '';
}

function closeRelocateModal() {
    const modal = document.getElementById('relocateItemModal');
    if (modal) modal.style.display = 'none';
}

async function executeSingleRelocate() {
    const item = window.pendingRelocateItem;
    const newLoc = (document.getElementById('relocateTargetLocInput')?.value || '').trim().toUpperCase();

    if (!item || !newLoc) {
        if (typeof showToast === 'function') showToast('⚠️ กรุณาระบุพิกัดเป้าหมายใหม่', true);
        else alert('⚠️ กรุณาระบุพิกัดเป้าหมายใหม่');
        return;
    }

    const liveItem = globalInventoryData.find(i => String(i.id) === String(item.id) || String(i.sn).toLowerCase() === String(item.sn).toLowerCase());
    if (liveItem) {
        liveItem.location = newLoc;
    }

    const client = getSupabaseClient();
    if (client && item.id && !item._pending) {
        try {
            await client.from('warehouse_items').update({ location: newLoc }).eq('id', item.id);
        } catch (e) {}
    }

    rebuildOccupiedSet();
    populateStockFilterDropdowns();
    filterInventoryData();
    updateKPIs();
    refreshStockDetailModalIfActive();
    closeRelocateModal();

    if (typeof showToast === 'function') {
        showToast(`🚚 ย้ายพิกัด S/N: ${item.sn} ไปยัง [${newLoc}] เรียบร้อยแล้ว`);
    }
}

// =========================================================================
// 🗑️ REAL-TIME ULTRA-FAST DELETE SYSTEM (100% RELIABLE DB & CACHE DELETE)
// =========================================================================

function ensureDeleteConfirmModalExists() {
    let modal = document.getElementById('deleteConfirmModal');
    if (modal) modal.remove();

    modal = document.createElement('div');
    modal.id = 'deleteConfirmModal';
    modal.className = 'modal-overlay';
    modal.style.cssText = `
        display: none;
        position: fixed;
        top: 0; left: 0; width: 100vw; height: 100vh;
        background: rgba(15, 23, 42, 0.82);
        z-index: 9999999;
        align-items: center;
        justify-content: center;
        backdrop-filter: blur(5px);
        padding: 16px;
        box-sizing: border-box;
    `;
    modal.innerHTML = `
        <div class="modal-content" style="
            background: #ffffff;
            border-radius: 12px;
            max-width: 520px;
            width: 95%;
            display: flex;
            flex-direction: column;
            box-shadow: 0 25px 50px -12px rgba(0, 0, 0, 0.35);
            border: 1px solid #fca5a5;
            overflow: hidden;
            animation: fadeInModal 0.15s ease-out;
            font-family: system-ui, -apple-system, sans-serif;
        ">
            <div class="modal-header" style="
                padding: 14px 18px;
                border-bottom: 1px solid #fecdd3;
                display: flex;
                justify-content: space-between;
                align-items: center;
                background: #fff1f2;
            ">
                <h3 id="deleteModalHeaderTitle" style="margin:0; font-size:1.05rem; color:#dc2626; font-weight:800; display:flex; align-items:center; gap:8px;">
                    <i class="fa-solid fa-triangle-exclamation"></i> ยืนยันการลบสินค้าออกจากคลัง
                </h3>
                <button type="button" onclick="window.closeDeleteConfirmModal ? window.closeDeleteConfirmModal() : closeDeleteConfirmModal()" style="background:transparent; border:none; font-size:1.3rem; cursor:pointer; color:#64748b; line-height:1;">&times;</button>
            </div>
            <div class="modal-body" style="padding:20px; text-align:center; background:#fff;">
                <i id="deleteModalIcon" class="fa-solid fa-trash-can-arrow-up" style="font-size:2.8rem; color:#dc2626; margin-bottom:12px;"></i>
                <div id="deleteConfirmModalDetails" style="font-size:0.92rem; color:#0f172a; line-height:1.4;"></div>
                <div style="margin-top:14px; font-size:0.78rem; color:#64748b; background:#f8fafc; padding:8px 12px; border-radius:6px; border:1px solid #cbd5e1;">
                    ผู้ทำรายการ: <strong id="deleteModalUserSpan" style="color:#0f172a;">${escapeHTML(getCurrentReceiverName())}</strong>
                    <span id="deleteModalUserRoleBadge" style="margin-left:6px; font-size:0.7rem; padding:2px 6px; border-radius:4px; background:#e2e8f0; color:#334155; font-weight:700;"></span>
                </div>
            </div>
            <div class="modal-footer" style="padding:12px 18px; border-top:1px solid #e2e8f0; display:flex; justify-content:flex-end; align-items:center; gap:8px; flex-wrap:wrap; background:#f8fafc;">
                <button type="button" class="btn btn-secondary" onclick="window.closeDeleteConfirmModal ? window.closeDeleteConfirmModal() : closeDeleteConfirmModal()" style="border-radius:6px; font-weight:600; padding:8px 16px; font-size:0.82rem; cursor:pointer;">ยกเลิก</button>
                <button type="button" id="btnConfirmDeleteExecute" class="btn btn-danger" onclick="window.executeDeleteAction ? window.executeDeleteAction(true) : executeDeleteAction(true)" style="border-radius:6px; font-weight:700; padding:8px 18px; font-size:0.82rem; background:#dc2626; border-color:#dc2626; color:#ffffff; cursor:pointer;"><i class="fa-solid fa-trash"></i> ยืนยันลบออกจาก DB ทันที</button>
            </div>
        </div>
    `;
    document.body.appendChild(modal);
}

function requestDeleteModal(mode, sn = null, id = null, event = null) {
    if (event && typeof event.stopPropagation === 'function') {
        event.stopPropagation();
    }

    if (mode === 'BATCH' && selectedItemSnSet.size === 0) {
        if (typeof showToast === 'function') showToast("⚠️ กรุณาเลือกรายการสินค้าอย่างน้อย 1 รายการเพื่อลบ", true);
        else alert("⚠️ กรุณาเลือกรายการสินค้าอย่างน้อย 1 รายการเพื่อลบ");
        return;
    }

    const cleanSn = (sn !== null && sn !== undefined && String(sn) !== 'null' && String(sn) !== 'undefined' && String(sn).trim() !== '') ? String(sn).trim() : null;
    const cleanId = (id !== null && id !== undefined && String(id) !== 'null' && String(id) !== 'undefined' && String(id).trim() !== '') ? String(id).trim() : null;

    window.pendingDeleteMode = mode || 'SINGLE';
    window.pendingDeleteSn = cleanSn;
    window.pendingDeleteId = cleanId;

    ensureDeleteConfirmModalExists();

    const modal = document.getElementById('deleteConfirmModal');
    const details = document.getElementById('deleteConfirmModalDetails');
    const userSpan = document.getElementById('deleteModalUserSpan');
    const userRoleSpan = document.getElementById('deleteModalUserRoleBadge');

    const role = getCurrentUserRole();
    const isAdmin = (role === 'admin' || role === 'administrator' || role === 'ผู้ดูแลระบบ');

    if (userSpan) userSpan.textContent = getCurrentReceiverName();

    if (userRoleSpan) {
        userRoleSpan.textContent = isAdmin ? 'ADMIN' : 'USER';
        userRoleSpan.style.background = isAdmin ? '#dcfce7' : '#ffedd5';
        userRoleSpan.style.color = isAdmin ? '#15803d' : '#c2410c';
    }

    if (details) {
        if (mode === 'SINGLE') {
            const cleanSnLower = cleanSn ? cleanSn.toLowerCase() : '';
            const item = globalInventoryData.find(i => {
                const iId = (i && i.id !== undefined && i.id !== null) ? String(i.id).trim() : '';
                const iSn = (i && i.sn !== undefined && i.sn !== null) ? String(i.sn).trim().toLowerCase() : '';
                return (cleanId && iId === cleanId) || (cleanSnLower && iSn === cleanSnLower);
            });

            const itemCat = item ? (item.category || '-') : '-';
            const itemName = item ? (item.name || '-') : '-';
            const itemLoc = item ? (typeof formatLocationCode === 'function' ? formatLocationCode(item.location) : item.location) : '-';

            details.innerHTML = `
                <div style="text-align:left; background:#f8fafc; padding:12px 14px; border-radius:8px; border:1px solid #cbd5e1; margin-top:8px;">
                    <div style="font-weight:700; font-size:0.85rem; color:#0f172a; margin-bottom:6px; display:flex; align-items:center; gap:6px;">
                        <i class="fa-solid fa-box" style="color:#dc2626;"></i> ข้อมูลสินค้าที่จะลบออกจากคลัง:
                    </div>
                    <div style="font-size:0.82rem; color:#334155; line-height:1.5;">
                        <div>หมายเลข S/N: <strong class="mono" style="color:#dc2626; font-size:0.95rem; background:#fee2e2; padding:1px 6px; border-radius:4px; border:1px solid #fca5a5;">${escapeHTML(cleanSn || (item ? item.sn : 'ไม่ระบุ'))}</strong></div>
                        <div>รหัสสินค้า (SKU): <strong class="mono" style="color:#0f172a;">${escapeHTML(itemCat)}</strong></div>
                        <div>ชื่อรุ่น/สินค้า: <strong>${escapeHTML(itemName)}</strong></div>
                        <div>พิกัดจัดเก็บ: <span class="badge-location mono" style="font-size:0.75rem;">📍 ${escapeHTML(itemLoc)}</span></div>
                    </div>
                </div>
            `;
        } else {
            const deleteSns = Array.from(selectedItemSnSet);
            let snBadgeListHtml = deleteSns.slice(0, 100).map(s => `<span class="mono" style="background:#fee2e2; color:#991b1b; padding:2px 6px; border-radius:4px; font-size:0.75rem; border:1px solid #fca5a5; font-weight:700; display:inline-block;">${escapeHTML(s)}</span>`).join(' ');
            if (deleteSns.length > 100) {
                snBadgeListHtml += ` <span style="font-size:0.75rem; color:#64748b;">...และอีก ${deleteSns.length - 100} รายการ</span>`;
            }

            details.innerHTML = `
                <div style="margin-bottom:8px;">คุณกำลังจะลบสินค้าจำนวนรวม <strong class="mono font-bold" style="color:#dc2626; font-size:1.1rem; background:#fee2e2; padding:2px 8px; border-radius:4px;">${selectedItemSnSet.size}</strong> รายการ ออกจากฐานข้อมูลคลังสินค้า</div>
                <div style="text-align:left; background:#f8fafc; padding:10px 12px; border-radius:8px; border:1px solid #cbd5e1; max-height:140px; overflow-y:auto; display:flex; flex-wrap:wrap; gap:4px;">
                    ${snBadgeListHtml}
                </div>
            `;
        }
    }

    const btnConfirm = document.getElementById('btnConfirmDeleteExecute');
    if (btnConfirm) {
        btnConfirm.onclick = function(e) {
            if (e) { e.preventDefault(); e.stopPropagation(); }
            executeDeleteAction(true);
        };
    }

    if (modal) {
        modal.style.zIndex = '9999999';
        modal.style.display = 'flex';
    }
}

function closeDeleteConfirmModal() {
    const modal = document.getElementById('deleteConfirmModal');
    if (modal) modal.style.display = 'none';
}

function executeDeleteActionWithMode(actionType) {
    executeDeleteAction(true);
}

// ⚡ ฟังก์ชันลบสินค้าเรียลไทม์ออกจาก DB และ UI 100% (Ultra-Fast Non-Blocking)
async function executeDeleteAction(forceDirect = true) {
    const mode = window.pendingDeleteMode || 'SINGLE';
    const rawSn = window.pendingDeleteSn;
    const rawId = window.pendingDeleteId;

    const btnConfirm = document.getElementById('btnConfirmDeleteExecute');
    if (btnConfirm) {
        btnConfirm.disabled = true;
        btnConfirm.innerHTML = `<i class="fa-solid fa-spinner fa-spin"></i> กำลังลบข้อมูล...`;
    }

    try {
        playActionFeedbackSound('delete');
    } catch (e) {}

    const client = getSupabaseClient();

    let deleteSns = [];
    let deleteIds = [];

    // 1. รวบรวมเป้าหมายที่ต้องการลบอย่างครบถ้วน
    if (mode === 'SINGLE') {
        const targetSnClean = (rawSn !== null && rawSn !== undefined && String(rawSn) !== 'null' && String(rawSn) !== 'undefined') ? String(rawSn).trim() : '';
        const targetIdClean = (rawId !== null && rawId !== undefined && String(rawId) !== 'null' && String(rawId) !== 'undefined') ? String(rawId).trim() : '';
        const targetSnLower = targetSnClean.toLowerCase();

        const matches = globalInventoryData.filter(i => {
            if (!i) return false;
            const iId = (i.id !== undefined && i.id !== null) ? String(i.id).trim() : '';
            const iSn = (i.sn !== undefined && i.sn !== null) ? String(i.sn).trim().toLowerCase() : '';
            return (targetIdClean && iId === targetIdClean) || (targetSnLower && iSn === targetSnLower);
        });

        if (matches.length > 0) {
            matches.forEach(item => {
                if (item.id !== undefined && item.id !== null && String(item.id).trim() !== '') deleteIds.push(String(item.id).trim());
                if (item.sn && String(item.sn).trim() !== '') deleteSns.push(String(item.sn).trim());
            });
        }

        if (targetIdClean && !deleteIds.some(d => String(d) === targetIdClean)) deleteIds.push(targetIdClean);
        if (targetSnClean && !deleteSns.some(s => s.toLowerCase() === targetSnLower)) deleteSns.push(targetSnClean);

    } else if (mode === 'BATCH') {
        deleteSns = Array.from(selectedItemSnSet).map(s => String(s).trim()).filter(Boolean);
        const deleteSnLowerSet = new Set(deleteSns.map(s => s.toLowerCase()));

        deleteIds = globalInventoryData
            .filter(i => i && i.sn && deleteSnLowerSet.has(String(i.sn).trim().toLowerCase()))
            .map(i => i.id)
            .filter(v => v !== undefined && v !== null && String(v).trim() !== '')
            .map(v => String(v).trim());
    }

    const deleteSnLowerSet = new Set(deleteSns.filter(Boolean).map(s => String(s).trim().toLowerCase()));
    const deleteIdSet = new Set(deleteIds.filter(Boolean).map(v => String(v).trim()));

    // 2. ลบออกจาก Local Memory ทันทีเรียลไทม์ (0ms Instant Wipe)
    globalInventoryData = globalInventoryData.filter(i => {
        if (!i) return false;
        const iId = (i.id !== undefined && i.id !== null) ? String(i.id).trim() : '';
        const iSn = (i.sn !== undefined && i.sn !== null) ? String(i.sn).trim().toLowerCase() : '';
        
        const matchId = iId !== '' && deleteIdSet.has(iId);
        const matchSn = iSn !== '' && deleteSnLowerSet.has(iSn);
        return !matchId && !matchSn;
    });

    deleteSnLowerSet.forEach(snVal => {
        selectedItemSnSet.delete(snVal);
        for (let s of Array.from(selectedItemSnSet)) {
            if (String(s).trim().toLowerCase() === snVal) {
                selectedItemSnSet.delete(s);
            }
        }
    });

    if (mode === 'BATCH') selectedItemSnSet.clear();

    try {
        localStorage.setItem('WMS_LOCAL_INVENTORY_CACHE', JSON.stringify(globalInventoryData));
    } catch (e) {}

    // 3. อัปเดต UI หน้าจอทันทีโดยไม่ต้องรอผลจากเน็ตเวิร์ก
    rebuildOccupiedSet();
    populateStockFilterDropdowns();
    filterInventoryData();
    updateKPIs();
    updateSelectedCountUI();
    refreshStockDetailModalIfActive();
    if (typeof refreshLocationVisualizerIfActive === 'function') refreshLocationVisualizerIfActive();
    closeDeleteConfirmModal();

    const totalDeletedCount = Math.max(deleteSns.length, deleteIds.length, 1);
    const labelStr = deleteSns.length > 0 ? deleteSns[0] : (deleteIds[0] ? `ID: ${deleteIds[0]}` : `จำนวน ${totalDeletedCount} รายการ`);

    if (typeof showToast === 'function') {
        showToast(`🗑️ ลบสินค้า [${labelStr}] ออกจากคลังสำเร็จเรียบร้อยแล้ว`);
    } else {
        alert(`🗑️ ลบสินค้า [${labelStr}] ออกจากคลังสำเร็จเรียบร้อยแล้ว`);
    }

    logAuditAction('DELETE_ITEM', {
        mode: mode,
        sns: deleteSns,
        ids: deleteIds,
        count: totalDeletedCount,
        user: getCurrentReceiverName(),
        role: getCurrentUserRole(),
        timestamp: new Date().toISOString()
    });

    // 4. ส่งคำสั่งลบไปยัง Supabase DB ในเบื้องหลังครอบคลุมทั้ง ID และ SN ป้องกัน Type Error
    if (client) {
        (async () => {
            try {
                if (deleteIds.length > 0) {
                    const validIds = deleteIds.filter(v => v !== null && v !== undefined && String(v).trim() !== '');
                    const numIds = validIds.map(v => Number(v)).filter(n => !isNaN(n) && n > 0);
                    const strIds = validIds.map(v => String(v).trim()).filter(s => isNaN(Number(s)) && s !== '');

                    if (numIds.length > 0) {
                        await client.from('warehouse_items').delete().in('id', numIds);
                    }
                    if (strIds.length > 0) {
                        await client.from('warehouse_items').delete().in('id', strIds);
                    }
                }

                if (deleteSns.length > 0) {
                    const validSns = deleteSns.filter(s => s && String(s).trim() !== '');
                    const allSnVariants = Array.from(new Set([
                        ...validSns,
                        ...validSns.map(s => String(s).trim().toLowerCase()),
                        ...validSns.map(s => String(s).trim().toUpperCase())
                    ]));
                    const chunkSize = 50;
                    for (let i = 0; i < allSnVariants.length; i += chunkSize) {
                        const chunk = allSnVariants.slice(i, i + chunkSize);
                        await client.from('warehouse_items').delete().in('sn', chunk);
                    }
                }
            } catch (dbErr) {
                console.error("Supabase Background Async Deletion Error:", dbErr);
            }
        })();
    }

    if (btnConfirm) {
        btnConfirm.disabled = false;
        btnConfirm.innerHTML = `<i class="fa-solid fa-trash"></i> ยืนยันลบออกจาก DB ทันที`;
    }
}

async function approveDeleteRequest(requestId, targetSn, targetItemId) {
    const client = getSupabaseClient();
    try {
        if (targetItemId) {
            globalInventoryData = globalInventoryData.filter(i => String(i.id) !== String(targetItemId));
            if (client) await client.from('warehouse_items').delete().eq('id', targetItemId);
        } else if (targetSn) {
            globalInventoryData = globalInventoryData.filter(i => String(i.sn).toLowerCase() !== String(targetSn).toLowerCase());
            if (client) await client.from('warehouse_items').delete().eq('sn', targetSn);
        }

        if (client && requestId) {
            await client.from('delete_requests').update({ status: 'APPROVED', approved_by: getCurrentReceiverName() }).eq('id', requestId);
        }

        rebuildOccupiedSet();
        populateStockFilterDropdowns();
        filterInventoryData();
        updateKPIs();
        if (typeof refreshLocationVisualizerIfActive === 'function') refreshLocationVisualizerIfActive();
        if (typeof showToast === 'function') showToast(`✅ อนุมัติการลบสินค้า S/N: ${targetSn} เรียบร้อยแล้ว`);
    } catch (e) {
        console.error("Approve Delete Request Error:", e);
    }
}

async function rejectDeleteRequest(requestId) {
    const client = getSupabaseClient();
    try {
        if (client && requestId) {
            await client.from('delete_requests').update({ status: 'REJECTED', approved_by: getCurrentReceiverName() }).eq('id', requestId);
        }
        if (typeof showToast === 'function') showToast(`❌ ปฏิเสธคำขอลบรายการเรียบร้อยแล้ว`);
    } catch (e) {
        console.error("Reject Delete Request Error:", e);
    }
}

function deleteSelectedFromModal() {
    requestDeleteModal('BATCH');
}

// Print Barcode Config Modal
function ensurePrintConfigModalExists() {
    let modal = document.getElementById('printConfigSelectionModal');
    if (!modal) {
        modal = document.createElement('div');
        modal.id = 'printConfigSelectionModal';
        modal.className = 'modal-overlay';
        modal.style.cssText = `
            display: none;
            position: fixed;
            top: 0; left: 0; width: 100%; height: 100%;
            background: rgba(15, 23, 42, 0.75);
            z-index: 999999;
            align-items: center;
            justify-content: center;
            backdrop-filter: blur(4px);
            padding: 16px;
            box-sizing: border-box;
        `;
        modal.innerHTML = `
            <div class="modal-content" style="
                background: #ffffff;
                border-radius: 12px;
                max-width: 520px;
                width: 95%;
                display: flex;
                flex-direction: column;
                box-shadow: 0 20px 25px -5px rgba(0, 0, 0, 0.2);
                border: 1px solid #cbd5e1;
                overflow: hidden;
            ">
                <div class="modal-header" style="
                    padding: 16px 20px;
                    border-bottom: 1px solid #e2e8f0;
                    display: flex;
                    justify-content: space-between;
                    align-items: center;
                    background: #f8fafc;
                ">
                    <h3 style="margin:0; font-size:1.1rem; color:#0f172a; font-weight:800; display:flex; align-items:center; gap:8px;">
                        <i class="fa-solid fa-print" style="color:#2563eb;"></i> ตัวเลือกและขนาดการพิมพ์บาร์โค้ด
                    </h3>
                    <button type="button" onclick="closePrintConfigModal()" style="
                        background: transparent; border: none; font-size: 1.25rem; cursor: pointer; color: #64748b;
                    ">&times;</button>
                </div>
                
                <div class="modal-body" style="padding: 20px; display:flex; flex-direction:column; gap:16px;">
                    <div style="font-size:0.88rem; color:#475569; font-weight:600;">
                        รายการบาร์โค้ดที่เตรียมพิมพ์: <strong id="printTargetCountText" class="mono font-bold" style="color:#0f172a; font-size:1.05rem; background:#eff6ff; padding:2px 8px; border-radius:6px; border:1px solid #bfdbfe;">0</strong> รายการ
                    </div>

                    <div class="form-group">
                        <label style="font-weight:700; font-size:0.82rem; margin-bottom:6px; display:block;">🏷️ เลือกขนาดกระดาษ / สติ๊กเกอร์ความร้อน (Thermal Label Size):</label>
                        <select id="barcodeThermalSizeSelect" class="form-control" style="padding:8px 12px; font-size:0.88rem; border-radius:6px; font-weight:600; border:1px solid #cbd5e1;">
                            <option value="50x30">🏷️ ขนาด 50 x 30 mm (ขนาดมาตรฐานทั่วไป)</option>
                            <option value="40x30">🏷️ ขนาด 40 x 30 mm (ขนาดเล็กกะทัดรัด)</option>
                            <option value="80x50">🏷️ ขนาด 80 x 50 mm (ขนาดป้ายติดกล่องสินค้า)</option>
                            <option value="100x75">🏷️ ขนาด 100 x 75 mm (ขนาดป้ายขนส่งใหญ่)</option>
                            <option value="100x150">🏷️ ขนาด 100 x 150 mm (ขนาดป้ายพาเลทพัสดุ)</option>
                        </select>
                    </div>

                    <div style="display:grid; grid-template-columns:1fr 1fr; gap:12px;">
                        <div onclick="executeBarcodePrintProcess('THERMAL')" style="
                            border: 1.5px solid #2563eb; background: #eff6ff;
                            border-radius: 8px; padding: 16px 12px; cursor: pointer; text-align: center; transition: all 0.15s ease;
                        " onmouseover="this.style.background='#dbeafe';" onmouseout="this.style.background='#eff6ff';">
                            <i class="fa-solid fa-note-sticky" style="font-size: 2rem; color: #2563eb; margin-bottom: 6px;"></i>
                            <div style="font-weight: 800; font-size: 0.9rem; color: #0f172a;">ปริ้นสติ๊กเกอร์ความร้อน</div>
                            <div style="font-size: 0.72rem; color: #64748b; margin-top: 2px;">1 บาร์โค้ด ต่อ 1 แผ่น รันต่อเนื่องตามขนาดที่เลือก</div>
                        </div>

                        <div onclick="executeBarcodePrintProcess('A4')" style="
                            border: 1.5px solid #cbd5e1; background: #f8fafc;
                            border-radius: 8px; padding: 16px 12px; cursor: pointer; text-align: center; transition: all 0.15s ease;
                        " onmouseover="this.style.background='#f1f5f9'; this.style.borderColor='#94a3b8';" onmouseout="this.style.background='#f8fafc'; this.style.borderColor='#cbd5e1';">
                            <i class="fa-solid fa-file-lines" style="font-size: 2rem; color: #475569; margin-bottom: 6px;"></i>
                            <div style="font-weight: 800; font-size: 0.9rem; color: #0f172a;">กระดาษ A4 ภาพรวม</div>
                            <div style="font-size: 0.72rem; color: #64748b; margin-top: 2px;">จัดเรียงบาร์โค้ดเป็นตารางหลายป้ายต่อหน้า A4</div>
                        </div>
                    </div>
                </div>

                <div class="modal-footer" style="
                    padding: 12px 20px;
                    border-top: 1px solid #e2e8f0;
                    display: flex; justify-content: flex-end; background: #f8fafc;
                ">
                    <button type="button" class="btn btn-secondary" onclick="closePrintConfigModal()" style="border-radius:6px; font-weight:600; padding:6px 16px; font-size:0.82rem;">ปิดหน้าต่าง</button>
                </div>
            </div>
        `;
        document.body.appendChild(modal);
    }
}

function closePrintConfigModal() {
    const modal = document.getElementById('printConfigSelectionModal');
    if (modal) modal.style.display = 'none';
}

function openPrintBarcodeModal(mode, targetSn = null) {
    let snList = [];
    if (mode === 'SINGLE' && targetSn) {
        snList = [targetSn];
    } else {
        snList = Array.from(selectedItemSnSet);
    }

    if (snList.length === 0) {
        if (typeof showToast === 'function') showToast("⚠️ กรุณาเลือกรายการสินค้าอย่างน้อย 1 รายการเพื่อพิมพ์บาร์โค้ด", true);
        else alert("⚠️ กรุณาเลือกรายการสินค้าอย่างน้อย 1 รายการเพื่อพิมพ์บาร์โค้ด");
        return;
    }

    pendingBarcodePrintTarget = snList;
    ensurePrintConfigModalExists();

    const countElem = document.getElementById('printTargetCountText');
    if (countElem) countElem.textContent = snList.length.toLocaleString();

    const modal = document.getElementById('printConfigSelectionModal');
    if (modal) modal.style.display = 'flex';
}

function executeBarcodePrintProcess(paperType) {
    const sizeSelect = document.getElementById('barcodeThermalSizeSelect');
    const labelSizeKey = sizeSelect ? sizeSelect.value : '50x30';

    closePrintConfigModal();
    const snList = pendingBarcodePrintTarget || [];
    if (snList.length === 0) return;

    const sizeMap = {
        '40x30': { width: '40mm', height: '30mm', svgH: '13mm', fontSn: '8.5pt', fontTitle: '6pt', fontLoc: '6.5pt', barW: 1.4 },
        '50x30': { width: '50mm', height: '30mm', svgH: '14mm', fontSn: '9pt', fontTitle: '6.5pt', fontLoc: '7pt', barW: 1.5 },
        '80x50': { width: '80mm', height: '50mm', svgH: '26mm', fontSn: '12pt', fontTitle: '8.5pt', fontLoc: '9pt', barW: 2.0 },
        '100x75': { width: '100mm', height: '75mm', svgH: '42mm', fontSn: '14pt', fontTitle: '10pt', fontLoc: '11pt', barW: 2.2 },
        '100x150': { width: '100mm', height: '150mm', svgH: '85mm', fontSn: '16pt', fontTitle: '12pt', fontLoc: '13pt', barW: 2.5 }
    };

    const sCfg = sizeMap[labelSizeKey] || sizeMap['50x30'];

    try {
        const printWin = window.open('', '_blank', 'width=980,height=780');
        if (!printWin) {
            if (typeof showToast === 'function') showToast("⚠️ เบราว์เซอร์บล็อก Pop-up กรุณาอนุญาตให้เปิดหน้าต่างใหม่เพื่อพิมพ์บาร์โค้ด", true);
            else alert("⚠️ เบราว์เซอร์บล็อก Pop-up กรุณาอนุญาตให้เปิดหน้าต่างใหม่เพื่อพิมพ์บาร์โค้ด");
            return;
        }

        let labelHtml = '';
        snList.forEach(sn => {
            const item = globalInventoryData.find(i => String(i.sn).toLowerCase() === String(sn).toLowerCase()) || { sn, category: '-', name: '-', location: '-' };
            const locStr = typeof formatLocationCode === 'function' ? formatLocationCode(item.location) : (item.location || 'DOCK');
            labelHtml += `
                <div class="barcode-card">
                    <div class="barcode-sn">${escapeHTML(item.sn)}</div>
                    <div class="barcode-title">[${escapeHTML(item.category || '-')}] ${escapeHTML(item.name || '-')}</div>
                    <svg id="barcode_${escapeHTML(item.sn)}"></svg>
                    <div class="barcode-loc">📍 ${escapeHTML(locStr)}</div>
                </div>
            `;
        });

        const isThermal = (paperType === 'THERMAL');
        const customStyle = isThermal ? `
            @page { size: ${sCfg.width} ${sCfg.height}; margin: 0; }
            html, body { width: ${sCfg.width}; margin: 0; padding: 0; background: #fff; font-family: system-ui, -apple-system, sans-serif; }
            .barcode-card {
                width: ${sCfg.width};
                height: ${sCfg.height};
                padding: 1.8mm;
                box-sizing: border-box;
                display: flex;
                flex-direction: column;
                align-items: center;
                justify-content: space-between;
                text-align: center;
                page-break-after: always;
                page-break-inside: avoid;
                border: none;
                overflow: hidden;
            }
            .barcode-sn { font-weight: 800; font-size: ${sCfg.fontSn}; font-family: monospace; letter-spacing: 0.5px; line-height: 1.1; }
            .barcode-title { font-size: ${sCfg.fontTitle}; color: #1e293b; max-width: 100%; white-space: nowrap; overflow: hidden; text-overflow: ellipsis; font-weight:600; }
            .barcode-loc { font-size: ${sCfg.fontLoc}; font-weight: 800; color: #0284c7; }
            svg { max-width: 100%; height: ${sCfg.svgH}; }
        ` : `
            @page { size: A4 portrait; margin: 8mm; }
            body { font-family: system-ui, -apple-system, sans-serif; margin: 0; padding: 10px; display: flex; flex-wrap: wrap; gap: 8px; background: #fff; }
            .barcode-card {
                width: 60mm;
                height: 36mm;
                border: 1px dashed #cbd5e1;
                padding: 6px;
                box-sizing: border-box;
                display: flex;
                flex-direction: column;
                align-items: center;
                justify-content: space-between;
                text-align: center;
                page-break-inside: avoid;
                border-radius: 6px;
            }
            .barcode-sn { font-weight: bold; font-size: 10.5pt; font-family: monospace; }
            .barcode-title { font-size: 7.5pt; color: #333; max-width: 100%; white-space: nowrap; overflow: hidden; text-overflow: ellipsis; }
            .barcode-loc { font-size: 8pt; font-weight: bold; color: #0284c7; }
            svg { max-width: 100%; height: 16mm; }
        `;

        printWin.document.write(`
            <!DOCTYPE html>
            <html>
            <head>
                <title>Print Barcodes (${snList.length} ใบ)</title>
                <script src="https://cdn.jsdelivr.net/npm/jsbarcode@3.11.5/dist/JsBarcode.all.min.js"></script>
                <style>${customStyle}</style>
            </head>
            <body>
                ${labelHtml}
                <script>
                    window.onload = function() {
                        const sns = ${JSON.stringify(snList)};
                        sns.forEach(sn => {
                            try {
                                JsBarcode("#barcode_" + sn, sn, {
                                    format: "CODE128",
                                    width: ${isThermal ? sCfg.barW : 1.8},
                                    height: ${isThermal ? 32 : 40},
                                    displayValue: false,
                                    margin: 0
                                });
                            } catch(e) { console.error("Barcode generation error for " + sn, e); }
                        });
                        setTimeout(function() {
                            window.print();
                        }, 400);
                    };
                </script>
            </body>
            </html>
        `);
        printWin.document.close();
    } catch (err) {
        console.error("Print barcode error:", err);
        if (typeof showToast === 'function') showToast("❌ เกิดข้อผิดพลาดในการพิมพ์บาร์โค้ด: " + err.message, true);
    }
}

function printSelectedBarcodesFromModal() {
    openPrintBarcodeModal('MULTI');
}

// Excel Export Modal
function ensureExcelExportModalExists() {
    let modal = document.getElementById('excelExportModal');
    if (!modal) {
        modal = document.createElement('div');
        modal.id = 'excelExportModal';
        modal.className = 'modal-overlay';
        modal.style.cssText = `
            display: none;
            position: fixed;
            top: 0; left: 0; width: 100%; height: 100%;
            background: rgba(15, 23, 42, 0.75);
            z-index: 99999;
            align-items: center;
            justify-content: center;
            backdrop-filter: blur(4px);
            padding: 16px;
            box-sizing: border-box;
        `;
        modal.innerHTML = `
            <div class="modal-content" style="
                background: #ffffff;
                border-radius: 12px;
                max-width: 500px;
                width: 95%;
                display: flex;
                flex-direction: column;
                box-shadow: 0 20px 25px -5px rgba(0, 0, 0, 0.2);
                border: 1px solid #cbd5e1;
                overflow: hidden;
            ">
                <div class="modal-header" style="
                    padding: 16px 20px;
                    border-bottom: 1px solid #e2e8f0;
                    display: flex;
                    justify-content: space-between;
                    align-items: center;
                    background: #f8fafc;
                ">
                    <h3 style="margin:0; font-size:1.1rem; color:#0f172a; font-weight:800; display:flex; align-items:center; gap:8px;">
                        <i class="fa-solid fa-file-excel" style="color:#10b981;"></i> คัดกรองการส่งออก Excel สต็อก
                    </h3>
                    <button type="button" onclick="closeExcelExportModal()" style="
                        background: transparent; border: none; font-size: 1.25rem; cursor: pointer; color: #64748b;
                    ">&times;</button>
                </div>
                
                <div class="modal-body" style="padding: 20px; display:flex; flex-direction:column; gap:14px;">
                    <div class="form-group">
                        <label style="font-weight:700; font-size:0.82rem; margin-bottom:4px; display:block;">📦 รูปแบบและขอบเขตข้อมูลที่จะส่งออก:</label>
                        <select id="exportScopeSelect" class="form-control" onchange="onExportScopeChange(this.value)" style="padding:8px 10px; font-size:0.88rem; border-radius:6px; border:1px solid #cbd5e1;">
                            <option value="ALL">🌐 ส่งออกทั้งหมดในคลังสินค้า (All Master Stock)</option>
                            <option value="FILTERED">🔍 ส่งออกเฉพาะรายการที่ค้นหา/กรองอยู่ในตารางปัจจุบัน</option>
                            <option value="SELECTED">☑️ ส่งออกเฉพาะรายการที่ติ๊กเลือก Checkbox ไว้</option>
                            <option value="AISLE_BAY">📍 คัดกรองเจาะจงเฉพาะแถวจัดเก็บและล็อก (Aisle & Bay/Slot)</option>
                        </select>
                    </div>

                    <div id="exportCustomLocationGroup" style="display:none; background:#f8fafc; padding:14px; border-radius:8px; border:1px solid #cbd5e1; flex-direction:column; gap:12px;">
                        <div class="form-group">
                            <label style="font-weight:700; font-size:0.8rem; margin-bottom:3px; display:block;">📍 เลือกแถวจัดเก็บ (Aisle):</label>
                            <select id="exportAisleSelect" class="form-control" onchange="onExportAisleChange(this.value)" style="padding:7px 10px; font-size:0.85rem; border-radius:6px; border:1px solid #cbd5e1;">
                                <option value="ALL">ทุกล็อกแถวจัดเก็บ</option>
                            </select>
                        </div>
                        <div class="form-group">
                            <label style="font-weight:700; font-size:0.8rem; margin-bottom:3px; display:block;">🔒 เลือกเจาะจงล็อกจัดเก็บ (Bay/Slot):</label>
                            <select id="exportBaySelect" class="form-control" style="padding:7px 10px; font-size:0.85rem; border-radius:6px; border:1px solid #cbd5e1;">
                                <option value="ALL">ทุกล็อกในแถวนี้</option>
                            </select>
                        </div>
                    </div>
                </div>
                
                <div class="modal-footer" style="
                    padding: 14px 20px;
                    border-top: 1px solid #e2e8f0;
                    display: flex;
                    justify-content: flex-end;
                    gap: 8px;
                    background: #f8fafc;
                ">
                    <button type="button" class="btn btn-secondary" onclick="closeExcelExportModal()" style="border-radius:6px; font-weight:600; padding:6px 16px; font-size:0.82rem;">ยกเลิก</button>
                    <button type="button" class="btn btn-success" onclick="executeExcelExport()" style="border-radius:6px; font-weight:700; padding:6px 20px; font-size:0.82rem; background:#10b981; border-color:#10b981;"><i class="fa-solid fa-download"></i> ดาวน์โหลด Excel</button>
                </div>
            </div>
        `;
        document.body.appendChild(modal);
    }
}

function openExcelExportModal() {
    ensureExcelExportModalExists();
    populateExcelAisleOptions();

    const scopeSelect = document.getElementById('exportScopeSelect');
    if (scopeSelect) {
        scopeSelect.value = selectedItemSnSet.size > 0 ? 'SELECTED' : 'ALL';
        onExportScopeChange(scopeSelect.value);
    }

    const modal = document.getElementById('excelExportModal');
    if (modal) modal.style.display = 'flex';
}

function closeExcelExportModal() {
    const modal = document.getElementById('excelExportModal');
    if (modal) modal.style.display = 'none';
}

function populateExcelAisleOptions() {
    const aisleSelect = document.getElementById('exportAisleSelect');
    if (!aisleSelect) return;

    const discoveredAisles = discoverAllDatabaseAisles();
    let options = `<option value="ALL">🌐 ทุกล็อกแถวจัดเก็บ (${globalInventoryData.length} รายการ)</option>`;
    
    discoveredAisles.forEach(a => {
        const count = globalInventoryData.filter(i => extractAisleKey(i.location) === a).length;
        const label = formatAisleBayLabel(a);
        options += `<option value="${escapeHTML(a)}">📍 ${escapeHTML(label)} (${count} เครื่อง)</option>`;
    });

    aisleSelect.innerHTML = options;
    onExportAisleChange('ALL');
}

function onExportScopeChange(scopeVal) {
    const customGroup = document.getElementById('exportCustomLocationGroup');
    if (customGroup) customGroup.style.display = (scopeVal === 'AISLE_BAY') ? 'flex' : 'none';
}

function onExportAisleChange(aisleVal) {
    const baySelect = document.getElementById('exportBaySelect');
    if (!baySelect) return;

    if (aisleVal === 'ALL') {
        baySelect.innerHTML = `<option value="ALL">ทุกล็อกในทุกแถว</option>`;
        return;
    }

    const baySet = new Set();
    globalInventoryData.forEach(item => {
        if (extractAisleKey(item.location) === aisleVal) {
            const bayKey = extractBayKey(item.location);
            if (bayKey) baySet.add(bayKey);
        }
    });

    const sortedBays = Array.from(baySet).sort();
    let options = `<option value="ALL">📍 ทุกล็อกในแถว ${escapeHTML(aisleVal)} (${sortedBays.length} ล็อก)</option>`;
    sortedBays.forEach(b => {
        const count = globalInventoryData.filter(i => extractAisleKey(i.location) === aisleVal && extractBayKey(i.location) === b).length;
        options += `<option value="${escapeHTML(b)}">🔒 ล็อก ${escapeHTML(b)} (${count} เครื่อง)</option>`;
    });

    baySelect.innerHTML = options;
}

function executeExcelExport() {
    const scopeSelect = document.getElementById('exportScopeSelect');
    const aisleSelect = document.getElementById('exportAisleSelect');
    const baySelect = document.getElementById('exportBaySelect');

    const scope = scopeSelect ? scopeSelect.value : 'ALL';
    const selectedAisle = aisleSelect ? aisleSelect.value : 'ALL';
    const selectedBay = baySelect ? baySelect.value : 'ALL';

    let exportItems = [];

    if (scope === 'FILTERED') {
        exportItems = [...currentFilteredItems];
    } else if (scope === 'SELECTED') {
        exportItems = globalInventoryData.filter(i => selectedItemSnSet.has(i.sn));
    } else if (scope === 'AISLE_BAY') {
        exportItems = globalInventoryData.filter(item => {
            const matchAisle = (selectedAisle === 'ALL') || (extractAisleKey(item.location) === selectedAisle);
            const matchBay = (selectedBay === 'ALL') || (extractBayKey(item.location) === selectedBay);
            return matchAisle && matchBay;
        });
    } else {
        exportItems = [...globalInventoryData];
    }

    if (exportItems.length === 0) {
        if (typeof showToast === 'function') showToast("⚠️ ไม่พบข้อมูลตรงตามเงื่อนไขส่งออก Excel", true);
        else alert("⚠️ ไม่พบข้อมูลตรงตามเงื่อนไขส่งออก Excel");
        return;
    }

    if (typeof XLSX === 'undefined') {
        alert("⚠️ ไลบรารี XLSX ยังไม่พร้อมใช้งาน กรุณารอระบบดึงสคริปต์สักครู่");
        return;
    }

    const rows = exportItems.map((item, idx) => ({
        "ลำดับ": idx + 1,
        "รหัสสินค้า (SKU)": item.category || 'N/A',
        "ชื่อรุ่น / สินค้า": item.name || '-',
        "หมายเลขซีเรียล (S/N)": item.sn || '-',
        "เลขมิเตอร์": item.meter || 0,
        "พิกัดจัดเก็บ": typeof formatLocationCode === 'function' ? formatLocationCode(item.location) : item.location,
        "จำนวน": item.qty || 1,
        "ผู้รับสินค้าเข้า (User)": formatReceiverFullName(item),
        "วันที่รับเข้า": item.created_at ? new Date(item.created_at).toLocaleString('th-TH') : '-'
    }));

    const worksheet = XLSX.utils.json_to_sheet(rows);
    autoFitExcelColumns(worksheet, rows);

    const workbook = XLSX.utils.book_new();
    XLSX.utils.book_append_sheet(workbook, worksheet, "Stock_Inventory");

    let tag = scope;
    if (scope === 'AISLE_BAY') tag = `Aisle_${selectedAisle}_Bay_${selectedBay}`;

    const filename = `WMS_Stock_Report_${tag}_${new Date().toISOString().slice(0, 10)}.xlsx`;
    XLSX.writeFile(workbook, filename);

    closeExcelExportModal();

    if (typeof showToast === 'function') {
        showToast(`📊 ดาวน์โหลด Excel สำเร็จเรียบร้อย (${rows.length.toLocaleString()} รายการ)`);
    }
}

function exportExcelFromModal() {
    if (!currentDetailModalGroupKey) return;
    const grp = currentInventoryGroups.find(g => g.groupKey === currentDetailModalGroupKey);
    if (!grp) return;

    const selectedAisleBay = (document.getElementById('stockDetailModalLocationFilter')?.value || 'ALL').toUpperCase();
    let exportItems = [...grp.items];

    if (selectedAisleBay !== 'ALL') {
        exportItems = exportItems.filter(item => extractAisleBayKey(item.location) === selectedAisleBay);
    }

    if (selectedItemSnSet.size > 0) {
        const checkedModalItems = exportItems.filter(i => selectedItemSnSet.has(i.sn));
        if (checkedModalItems.length > 0) exportItems = checkedModalItems;
    }

    if (exportItems.length === 0) {
        alert("⚠️ ไม่พบข้อมูลสำหรับส่งออก Excel");
        return;
    }

    if (typeof XLSX === 'undefined') {
        alert("⚠️ ไลบรารี XLSX ยังไม่พร้อมใช้งาน");
        return;
    }

    const rows = exportItems.map((item, idx) => ({
        "ลำดับ": idx + 1,
        "รหัสสินค้า (SKU)": item.category || 'N/A',
        "ชื่อรุ่น / สินค้า": item.name || '-',
        "หมายเลขซีเรียล (S/N)": item.sn || '-',
        "เลขมิเตอร์": item.meter || 0,
        "พิกัดจัดเก็บ": typeof formatLocationCode === 'function' ? formatLocationCode(item.location) : item.location,
        "จำนวน": item.qty || 1,
        "ผู้รับสินค้าเข้า (User)": formatReceiverFullName(item),
        "วันที่รับเข้า": item.created_at ? new Date(item.created_at).toLocaleString('th-TH') : '-'
    }));

    const worksheet = XLSX.utils.json_to_sheet(rows);
    autoFitExcelColumns(worksheet, rows);

    const workbook = XLSX.utils.book_new();
    XLSX.utils.book_append_sheet(workbook, worksheet, "Stock_Serials");

    const locTag = selectedAisleBay === 'ALL' ? 'All_Locations' : `Location_${selectedAisleBay}`;
    const filename = `WMS_Stock_${grp.category}_${locTag}_${new Date().toISOString().slice(0, 10)}.xlsx`;

    XLSX.writeFile(workbook, filename);
    if (typeof showToast === 'function') {
        showToast(`📊 ส่งออก Excel สำเร็จจำนวน ${rows.length.toLocaleString()} รายการ`);
    }
}

function refreshStockDetailModalIfActive() {
    if (!currentDetailModalGroupKey) return;
    const modal = document.getElementById('stockDetailModal');
    if (!modal || modal.style.display === 'none') return;

    currentInventoryGroups = buildInventoryGroups(currentFilteredItems);
    const grp = currentInventoryGroups.find(g => g.groupKey === currentDetailModalGroupKey);
    if (grp) {
        renderStockDetailModalBody(grp.items);
        filterStockDetailModalItems();
    } else {
        closeStockDetailModal();
    }
}

function updateKPIs() {
    const totalCount = globalInventoryData.length;

    const kpiTotal = document.getElementById('kpiTotalItems');
    if (kpiTotal) kpiTotal.textContent = totalCount.toLocaleString();

    const uniqueInventorySkus = new Set(globalInventoryData.map(i => (i.category || i.sku || '').trim()).filter(Boolean)).size;
    const totalMasterSkus = globalMasterProducts.length;

    const displaySkuText = totalMasterSkus > 0 ? `${uniqueInventorySkus.toLocaleString()} / ${totalMasterSkus.toLocaleString()}` : uniqueInventorySkus.toLocaleString();

    const targetElemIds = ['kpiTotalModels', 'masterSkuStat', 'totalSkuBadge', 'inboundMasterProductsStatBadge'];
    targetElemIds.forEach(id => {
        const el = document.getElementById(id);
        if (el) el.textContent = displaySkuText;
    });

    const dockItems = globalInventoryData.filter(i => (i.location || '').toUpperCase() === 'DOCK').length;
    const kpiDock = document.getElementById('kpiDockItems');
    if (kpiDock) kpiDock.textContent = dockItems.toLocaleString();

    let consumableCount = 0;
    let spareCount = 0;
    let generalCount = 0;

    globalInventoryData.forEach(item => {
        const meta = resolveProductMetaData(item.category, item.name, item);
        const typeStr = (meta.itemType || '').toLowerCase();
        if (typeStr.includes('วัสดุ') || typeStr.includes('consumable')) consumableCount++;
        else if (typeStr.includes('อะไหล่') || typeStr.includes('spare')) spareCount++;
        else generalCount++;
    });

    const elConsumables = document.getElementById('kpiTotalConsumables');
    if (elConsumables) elConsumables.textContent = consumableCount.toLocaleString();

    const elSpares = document.getElementById('kpiTotalSpareParts');
    if (elSpares) elSpares.textContent = spareCount.toLocaleString();

    const elGeneral = document.getElementById('kpiTotalGeneralProducts');
    if (elGeneral) elGeneral.textContent = generalCount.toLocaleString();
}

function toggleSelectAllVisibleItems(checked) {
    if (inventoryViewMode === 'grouped') {
        toggleSelectAllGroups(checked);
    } else {
        currentFilteredItems.forEach(item => {
            if (checked) selectedItemSnSet.add(item.sn);
            else selectedItemSnSet.delete(item.sn);
        });
        document.querySelectorAll('.item-checkbox').forEach(cb => cb.checked = checked);
    }

    updateSelectedCountUI();
}

function toggleItemSelection(sn, checked) {
    if(checked) selectedItemSnSet.add(sn);
    else selectedItemSnSet.delete(sn);

    document.querySelectorAll(`.item-checkbox-modal[data-sn="${escapeHTML(sn)}"]`).forEach(cb => cb.checked = checked);
    document.querySelectorAll(`.item-checkbox[data-sn="${escapeHTML(sn)}"]`).forEach(cb => cb.checked = checked);

    updateSelectedCountUI();
}

// Global Window Exports
window.normalizeLoc = normalizeLoc;
window.logAuditAction = logAuditAction;
window.exportAuditLogsToCSV = exportAuditLogsToCSV;
window.playActionFeedbackSound = playActionFeedbackSound;
window.discoverAllDatabaseAisles = discoverAllDatabaseAisles;
window.updateDBConnectionStatus = updateDBConnectionStatus;
window.copyTextToClipboard = copyTextToClipboard;
window.copyAllSerialsInCurrentGroup = copyAllSerialsInCurrentGroup;
window.formatReceiverFullName = formatReceiverFullName;
window.getCurrentReceiverName = getCurrentReceiverName;
window.getCurrentUserRole = getCurrentUserRole;
window.toggleStockViewMode = toggleStockViewMode;
window.toggleGroupSelection = toggleGroupSelection;
window.toggleSelectAllGroups = toggleSelectAllGroups;
window.clearAllSelections = clearAllSelections;
window.populateStockFilterDropdowns = populateStockFilterDropdowns;
window.onAisleFilterChange = onAisleFilterChange;
window.openStockDetailModal = openStockDetailModal;
window.closeStockDetailModal = closeStockDetailModal;
window.filterStockDetailModalItems = filterStockDetailModalItems;
window.toggleModalSelectAllItems = toggleModalSelectAllItems;
window.openEditItemModal = openEditItemModal;
window.closeEditItemModal = closeEditItemModal;
window.saveEditedItemData = saveEditedItemData;
window.requestRelocateModal = requestRelocateModal;
window.closeRelocateModal = closeRelocateModal;
window.populateRelocateAisleDropdown = populateRelocateAisleDropdown;
window.updateRelocateLocPreviewFromSelects = updateRelocateLocPreviewFromSelects;
window.updateRelocateSlotOptionsWithStatus = updateRelocateSlotOptionsWithStatus;
window.updateRelocateCustomLocOnly = updateRelocateCustomLocOnly;
window.findFirstAvailableSlotInAisleBay = findFirstAvailableSlotInAisleBay;
window.executeSingleRelocate = executeSingleRelocate;
window.requestBatchRelocateModal = requestBatchRelocateModal;
window.closeBatchRelocateModal = closeBatchRelocateModal;
window.updateBatchRelocateCapacityPreview = updateBatchRelocateCapacityPreview;
window.executeBatchRelocateFromModal = executeBatchRelocateFromModal;
window.executeBatchRelocate = executeBatchRelocate;
window.relocateSelectedFromModal = relocateSelectedFromModal;
window.ensureDeleteConfirmModalExists = ensureDeleteConfirmModalExists;
window.requestDeleteModal = requestDeleteModal;
window.closeDeleteConfirmModal = closeDeleteConfirmModal;
window.executeDeleteActionWithMode = executeDeleteActionWithMode;
window.executeDeleteAction = executeDeleteAction;
window.approveDeleteRequest = approveDeleteRequest;
window.rejectDeleteRequest = rejectDeleteRequest;
window.deleteSelectedFromModal = deleteSelectedFromModal;
window.openPrintBarcodeModal = openPrintBarcodeModal;
window.executeBarcodePrintProcess = executeBarcodePrintProcess;
window.closePrintConfigModal = closePrintConfigModal;
window.printSelectedBarcodesFromModal = printSelectedBarcodesFromModal;
window.openExcelExportModal = openExcelExportModal;
window.closeExcelExportModal = closeExcelExportModal;
window.onExportScopeChange = onExportScopeChange;
window.onExportAisleChange = onExportAisleChange;
window.executeExcelExport = executeExcelExport;
window.exportExcelFromModal = exportExcelFromModal;
window.loadDataFromDatabase = loadDataFromDatabase;
window.renderInventoryTable = renderInventoryTable;
window.filterInventoryData = filterInventoryData;
window.updateKPIs = updateKPIs;
window.updateSelectedCountUI = updateSelectedCountUI;
window.toggleSelectAllVisibleItems = toggleSelectAllVisibleItems;
window.toggleItemSelection = toggleItemSelection;
window.calculateBatchRelocateTargetCoordinates = calculateBatchRelocateTargetCoordinates;
window.showTableLoadingState = showTableLoadingState;

// AUTO-INITIALIZATION ENGINE
if (typeof document !== 'undefined') {
    const initInventoryEngine = () => {
        if (document.getElementById('inventoryTableBody')) {
            loadDataFromDatabase();
        }
    };
    if (document.readyState === 'loading') {
        document.addEventListener('DOMContentLoaded', initInventoryEngine);
    } else {
        setTimeout(initInventoryEngine, 100);
    }
}