// =========================================================================
// 📌 [ส่วนที่ 2] WMS DATABASE ENGINE, CACHE & CAPACITY CALCULATOR (FULL VERSION)
// =========================================================================

// Safety Safeguards Fallback
if (typeof window.escapeHTML !== 'function') {
    window.escapeHTML = function(str) {
        if (str === null || str === undefined) return '';
        return String(str)
            .replace(/&/g, '&amp;')
            .replace(/</g, '&lt;')
            .replace(/>/g, '&gt;')
            .replace(/"/g, '&quot;')
            .replace(/'/g, '&#039;');
    };
}

if (typeof window.normalizeLoc !== 'function') {
    window.normalizeLoc = function(loc) {
        if (!loc) return '';
        return String(loc).toUpperCase().replace(/[^A-Z0-9]/g, '');
    };
}

if (typeof window.formatLocationCode !== 'function') {
    window.formatLocationCode = function(loc) {
        if (!loc) return 'DOCK';
        return String(loc).toUpperCase().trim();
    };
}

// Global State Variables
window.globalInventoryData = window.globalInventoryData || [];
window.globalMasterProducts = window.globalMasterProducts || [];
window.occupiedLocationsSet = window.occupiedLocationsSet || new Set();
window.selectedItemSnSet = window.selectedItemSnSet || new Set();
window.currentFilteredItems = window.currentFilteredItems || [];
window.currentInventoryGroups = window.currentInventoryGroups || [];
window.inventoryViewMode = window.inventoryViewMode || 'grouped';
window.currentDetailModalGroupKey = window.currentDetailModalGroupKey || null;
window.pendingBarcodePrintTarget = window.pendingBarcodePrintTarget || [];

let realtimeSubChannel = null;
let realtimeDebounceTimer = null;

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

function fetchWithTimeout(promise, ms = 6000) {
    return Promise.race([
        promise,
        new Promise((_, reject) => setTimeout(() => reject(new Error('Database Request Timeout')), ms))
    ]);
}

function setupRealtimeSubscription() {
    const client = getSupabaseClient();
    if (client && typeof client.channel === 'function' && !realtimeSubChannel) {
        try {
            realtimeSubChannel = client
                .channel('wms_warehouse_items_realtime')
                .on('postgres_changes', { event: '*', schema: 'public', table: 'warehouse_items' }, (payload) => {
                    handleRealtimeDataChange('SUPABASE_REALTIME', payload);
                })
                .subscribe((status) => {
                    if (status === 'SUBSCRIBED') {
                        console.log('⚡ WMS Realtime Engine: Listening for stock changes...');
                    }
                });
        } catch (err) {
            console.warn('Realtime subscription setup warning:', err);
        }
    }

    if (typeof window !== 'undefined') {
        window.removeEventListener('wms:data-updated', handleLocalDataChangeEvent);
        window.addEventListener('wms:data-updated', handleLocalDataChangeEvent);

        if (typeof BroadcastChannel !== 'undefined') {
            try {
                const bc = new BroadcastChannel('wms_realtime_sync_channel');
                bc.onmessage = (ev) => {
                    handleRealtimeDataChange('BROADCAST_CHANNEL', ev.data);
                };
            } catch (e) {}
        }
    }
}

function handleLocalDataChangeEvent(event) {
    handleRealtimeDataChange('LOCAL_EVENT', event ? event.detail : null);
}

function handleRealtimeDataChange(source, data) {
    clearTimeout(realtimeDebounceTimer);
    realtimeDebounceTimer = setTimeout(() => {
        refreshInventoryDataSilently();
    }, 300);
}

async function refreshInventoryDataSilently() {
    try {
        const fetchedData = await fetchAllWarehouseItems();
        if (Array.isArray(fetchedData)) {
            window.globalInventoryData = fetchedData;
            window.globalInventoryData.forEach(item => {
                if (item.meter === undefined || item.meter === null || item.meter === '') item.meter = 0;
            });

            mergePendingIntoInventory();
            rebuildOccupiedSet();
            if (typeof window.populateStockFilterDropdowns === 'function') window.populateStockFilterDropdowns();
            if (typeof window.filterInventoryData === 'function') window.filterInventoryData();
            if (typeof window.updateKPIs === 'function') window.updateKPIs();
            if (typeof window.refreshStockDetailModalIfActive === 'function') window.refreshStockDetailModalIfActive();
            if (typeof window.refreshLocationVisualizerIfActive === 'function') window.refreshLocationVisualizerIfActive();
        }
    } catch (e) {
        console.warn('Silent refresh error:', e);
    }
}

function updateDBConnectionStatus(isOnline, detailText = '') {
    const yellowPanels = document.querySelectorAll('#offlineYellowPanel, .offline-panel-left, .offline-banner-left, [class*="offline-yellow"]');
    yellowPanels.forEach(el => el.remove());

    let alertBox = document.getElementById('wmsOfflineFloatingAlert');
    if (!isOnline) {
        if (!alertBox) {
            alertBox = document.createElement('div');
            alertBox.id = 'wmsOfflineFloatingAlert';
            alertBox.style.cssText = `
                position: fixed; top: 20px; right: 20px; z-index: 999999;
                background: #ffffff; border: 1px solid #f59e0b; color: #78350f;
                padding: 12px 16px; border-radius: 10px;
                box-shadow: 0 10px 25px -5px rgba(245, 158, 11, 0.2);
                display: flex; align-items: center; gap: 12px; max-width: 420px;
                font-family: system-ui, -apple-system, sans-serif;
            `;
            document.body.appendChild(alertBox);
        }

        const pendingCount = (typeof offlineInboundQueue !== 'undefined' && Array.isArray(offlineInboundQueue)) ? offlineInboundQueue.length : 0;

        alertBox.innerHTML = `
            <div style="background:#fef3c7; width:34px; height:34px; border-radius:8px; display:flex; align-items:center; justify-content:center; flex-shrink:0; border:1px solid #fde68a;">
                <i class="fa-solid fa-wifi-slash" style="font-size:1.05rem; color:#d97706;"></i>
            </div>
            <div style="flex:1;">
                <div style="font-weight:700; font-size:0.85rem; color:#92400e;">โหมดออฟไลน์ (Offline Mode)</div>
                <div style="font-size:0.78rem; color:#78350f; margin-top:2px; line-height:1.35;">
                    ระบบทำงานผ่าน Local Cache ${window.escapeHTML(detailText)} <br>
                    <span style="font-weight:700; color:#b45309;">(รอบันทึกเข้า DB: ${pendingCount} รายการ)</span>
                </div>
            </div>
            <button type="button" onclick="document.getElementById('wmsOfflineFloatingAlert').style.display='none'" style="background:transparent; border:none; color:#a16207; font-size:1.1rem; cursor:pointer; padding:0 4px; opacity:0.7;">&times;</button>
        `;
        alertBox.style.display = 'flex';
    } else {
        if (alertBox) alertBox.style.display = 'none';
    }
}

function extractAisleBayKey(locStr) {
    if (!locStr) return 'DOCK';
    const clean = window.normalizeLoc(locStr);
    const upper = String(clean || locStr).toUpperCase().trim();
    const parts = upper.split('-');
    return parts.length >= 2 ? `${parts[0]}-${parts[1]}` : upper;
}

function extractAisleKey(locStr) {
    if (!locStr) return 'DOCK';
    const clean = window.normalizeLoc(locStr);
    const upper = String(clean || locStr).toUpperCase().trim();
    const parts = upper.split('-');
    return parts[0] || upper;
}

function extractBayKey(locStr) {
    if (!locStr) return 'ALL';
    const clean = window.normalizeLoc(locStr);
    const upper = String(clean || locStr).toUpperCase().trim();
    if (['DOCK', 'OFFICE', 'PENDING', 'FOOD', 'FREEZER', 'COLD', 'DRY', 'RAW'].includes(upper)) {
        return 'ALL';
    }
    const parts = upper.split(/[\-\/_]+/);
    if (parts.length >= 2) {
        const rawBay = parts[1].replace(/^(BAY|B)/i, '').trim();
        if (/^\d{1,3}$/.test(rawBay)) {
            const bayNum = parseInt(rawBay, 10);
            if (bayNum >= 1 && bayNum <= 999) {
                return String(bayNum).padStart(2, '0');
            }
        }
    }
    return 'ALL';
}

function formatAisleBayLabel(abKey) {
    if (!abKey) return 'DOCK';
    const parts = abKey.split('-');
    if (parts.length === 2) return `แถว ${parts[0]}   ล็อก ${parts[1]}`;
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

    (window.globalInventoryData || []).forEach(item => {
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
    return item.received_by_fullname || 
           item.receiver_fullname || 
           item.full_name || 
           item.receiver || 
           item.received_by || 
           item.username || 
           item.created_by || 
           item.user_id || 
           'ไม่ระบุ';
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

function calculateAisleCapacityInfo(targetAisle) {
    const aisleKey = (targetAisle || '').toUpperCase().trim();
    if (!aisleKey || ['DOCK', 'OFFICE', 'PENDING', 'FOOD', 'FREEZER', 'COLD', 'DRY', 'RAW'].includes(aisleKey)) {
        return { totalSlots: 9999, occupied: 0, available: 9999, isUnlimited: true };
    }

    const configs = window.aisleConfigs || {};
    const cfg = configs[aisleKey] || (typeof getAisleConfig === 'function' ? getAisleConfig(aisleKey) : { bays: 10, shelves: 1, slots: 10 });
    const totalSlots = (parseInt(cfg.bays || cfg.bay) || 10) * (parseInt(cfg.shelves || cfg.shelf) || 1) * (parseInt(cfg.slots || cfg.slot) || 10);

    const occupied = (window.globalInventoryData || []).filter(item => extractAisleKey(item.location) === aisleKey).length;
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
            const normCandidate = window.normalizeLoc(candidateLoc);

            if (!window.occupiedLocationsSet.has(candidateLoc) && !window.occupiedLocationsSet.has(normCandidate)) {
                return { aisle, bay, shelf: String(sh), slot: slotStr, fullLocation: candidateLoc };
            }
        }
    }

    return { aisle, bay, shelf: '1', slot: '01', fullLocation: `${aisle}-${bay}-1-01` };
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
                const normCandidate = window.normalizeLoc(locCandidate);

                if (!window.occupiedLocationsSet.has(locCandidate) && !window.occupiedLocationsSet.has(normCandidate)) {
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

function showTableLoadingState() {
    const tbody = document.getElementById('inventoryTableBody');
    if (tbody) {
        tbody.innerHTML = `
            <tr>
                <td colspan="14" style="text-align:center; padding:50px 20px; background:#ffffff;">
                    <div style="display:flex; flex-direction:column; align-items:center; justify-content:center; gap:12px;">
                        <i class="fa-solid fa-circle-notch fa-spin" style="font-size:2.2rem; color:#2563eb;"></i>
                        <div style="font-size:1rem; font-weight:800; color:#0f172a;">กำลังโหลดข้อมูลสต็อกเรียลไทม์...</div>
                        <div style="font-size:0.8rem; color:#64748b;">กำลังซิงค์รายการและประมวลผลตำแหน่งพิกัดจากฐานข้อมูล</div>
                    </div>
                </td>
            </tr>
        `;
    }
    const totalBadge = document.getElementById('totalCountBadge');
    if (totalBadge) {
        totalBadge.innerHTML = `<i class="fa-solid fa-spinner fa-spin"></i> ซิงค์ DB...`;
    }
}

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

            const { data, error } = await fetchWithTimeout(queryPromise, 6000);
            if (error) throw error;

            if (data && data.length > 0) {
                allData = allData.concat(data);
                from += step;
                if (data.length < step) hasMore = false;
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
                try { window.globalMasterProducts = JSON.parse(cachedMaster); } catch(err) {}
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
                response = await fetchWithTimeout(reqPromise, 6000);
            } catch (err) {
                reqPromise = client
                    .from('products')
                    .select('*')
                    .order('sku', { ascending: true })
                    .range(from, from + step - 1);
                response = await fetchWithTimeout(reqPromise, 6000);
            }

            if (response.error) break;

            const data = response.data;
            if (data && data.length > 0) {
                allProducts = allProducts.concat(data);
                from += step;
                if (data.length < step) hasMore = false;
            } else {
                hasMore = false;
            }
        }

        if (allProducts.length > 0) {
            window.globalMasterProducts = allProducts;
            try { localStorage.setItem('WMS_MASTER_PRODUCTS_CACHE', JSON.stringify(allProducts)); } catch (quotaErr) {}
        } else {
            const cachedMaster = localStorage.getItem('WMS_MASTER_PRODUCTS_CACHE');
            if (cachedMaster) {
                try { window.globalMasterProducts = JSON.parse(cachedMaster); } catch(err) {}
            }
        }

        updateMasterProductsStatUI();
    } catch(e) {
        const cachedMaster = localStorage.getItem('WMS_MASTER_PRODUCTS_CACHE');
        if (cachedMaster) {
            try { window.globalMasterProducts = JSON.parse(cachedMaster); } catch(err) {}
        }
        updateMasterProductsStatUI();
    }
}

function updateMasterProductsStatUI() {
    const statElem = document.getElementById('inboundMasterProductsStatText');
    if (statElem) {
        const count = window.globalMasterProducts.length;
        if (count > 0) {
            statElem.innerHTML = `<i class="fa-solid fa-circle-check" style="color:#10b981;"></i> เชื่อมต่อ DB สมบูรณ์ · สินค้า Master <strong class="mono" style="color:#0f172a; font-size:0.95rem; background:#f1f5f9; padding:2px 6px; border-radius:4px; border:1px solid #cbd5e1;">${count.toLocaleString()}</strong> รายการ`;
        } else {
            statElem.innerHTML = `<i class="fa-solid fa-triangle-exclamation" style="color:#f59e0b;"></i> ไม่พบข้อมูลสินค้า Master`;
        }
    }
    if (typeof window.updateKPIs === 'function') window.updateKPIs();
}

async function loadDataFromDatabase() {
    setupRealtimeSubscription();

    let hasLocalCache = false;
    try {
        const cachedStr = localStorage.getItem('WMS_LOCAL_INVENTORY_CACHE');
        if (cachedStr) {
            const cachedArr = JSON.parse(cachedStr);
            if (Array.isArray(cachedArr) && cachedArr.length > 0) {
                window.globalInventoryData = cachedArr;
                hasLocalCache = true;
                mergePendingIntoInventory();
                rebuildOccupiedSet();
                if (typeof window.populateStockFilterDropdowns === 'function') window.populateStockFilterDropdowns();
                if (typeof window.filterInventoryData === 'function') window.filterInventoryData();
                if (typeof window.updateKPIs === 'function') window.updateKPIs();
            }
        }
    } catch (cErr) {
        console.warn("Local cache paint notice:", cErr);
    }

    if (!hasLocalCache) {
        showTableLoadingState();
    }

    try {
        const fetchedData = await fetchAllWarehouseItems();
        if (Array.isArray(fetchedData) && fetchedData.length > 0) {
            window.globalInventoryData = fetchedData;
        }

        window.globalInventoryData.forEach(item => {
            if (item.meter === undefined || item.meter === null || item.meter === '') item.meter = 0;
        });

        mergePendingIntoInventory();
        await loadMasterProductsFromDB();
        if (typeof loadWarehouseConfigsFromDB === 'function') await loadWarehouseConfigsFromDB();

        rebuildOccupiedSet();
        if (typeof window.populateStockFilterDropdowns === 'function') window.populateStockFilterDropdowns();
        if (typeof window.filterInventoryData === 'function') window.filterInventoryData();
        if (typeof window.updateKPIs === 'function') window.updateKPIs();
        if (typeof window.refreshLocationVisualizerIfActive === 'function') window.refreshLocationVisualizerIfActive();

    } catch (err) {
        console.error("loadDataFromDatabase background error:", err);
        updateDBConnectionStatus(false, "(Sync Failed)");
        if (!Array.isArray(window.globalInventoryData)) window.globalInventoryData = [];
        if (typeof window.filterInventoryData === 'function') window.filterInventoryData();
    }
}

function mergePendingIntoInventory() {
    const have = new Set((window.globalInventoryData || []).map(i => String(i.sn).toLowerCase()));
    const activeReceiver = getCurrentReceiverName();

    if (typeof offlineInboundQueue !== 'undefined' && Array.isArray(offlineInboundQueue)) {
        offlineInboundQueue.forEach(p => {
            if (!have.has(String(p.sn).toLowerCase())) {
                window.globalInventoryData.unshift({
                    ...p,
                    received_by_fullname: p.received_by_fullname || p.receiver_fullname || p.received_by || activeReceiver,
                    _pending: true
                });
            }
        });
    }
}

function rebuildOccupiedSet() {
    window.occupiedLocationsSet.clear();
    (window.globalInventoryData || []).forEach(i => {
        if (i && i.location) {
            const locUpper = String(i.location).toUpperCase().trim();
            if (!['DOCK', 'OFFICE', 'PENDING', 'FOOD', 'FREEZER', 'COLD', 'DRY', 'RAW'].includes(locUpper)) {
                window.occupiedLocationsSet.add(locUpper);
                const norm = window.normalizeLoc(locUpper);
                if (norm) window.occupiedLocationsSet.add(norm);
            }
        }
    });
}

function resolveProductMetaData(cat, name, sampleItem) {
    const catStr = String(cat || '').trim();
    const nameStr = String(name || '').trim();

    const master = (window.globalMasterProducts || []).find(m => 
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

    if (!model) model = nameStr || catStr || 'ไม่ระบุรุ่น';

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

// Bind Global Window Methods safely
window.getSupabaseClient = getSupabaseClient;
window.setupRealtimeSubscription = setupRealtimeSubscription;
window.extractAisleBayKey = extractAisleBayKey;
window.extractAisleKey = extractAisleKey;
window.extractBayKey = extractBayKey;
window.formatAisleBayLabel = formatAisleBayLabel;
window.discoverAllDatabaseAisles = discoverAllDatabaseAisles;
window.formatReceiverFullName = formatReceiverFullName;
window.getCurrentReceiverName = getCurrentReceiverName;
window.getCurrentUserRole = getCurrentUserRole;
window.calculateAisleCapacityInfo = calculateAisleCapacityInfo;
window.findFirstAvailableSlotInAisleBay = findFirstAvailableSlotInAisleBay;
window.calculateBatchRelocateTargetCoordinates = calculateBatchRelocateTargetCoordinates;
window.showTableLoadingState = showTableLoadingState;
window.fetchAllWarehouseItems = fetchAllWarehouseItems;
window.loadMasterProductsFromDB = loadMasterProductsFromDB;
window.loadDataFromDatabase = loadDataFromDatabase;
window.resolveProductMetaData = resolveProductMetaData;
window.rebuildOccupiedSet = rebuildOccupiedSet;
window.updateDBConnectionStatus = updateDBConnectionStatus;