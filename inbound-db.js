// =========================================================================
// --- MODULE 3: FAST INBOUND DATABASE ENGINE (HIGH-SPEED SCANNING 100%) ---
// =========================================================================

let recentInboundList = [];
let fastScanLock = false; // ป้องกัน Hardware Key Bounce ในระดับมิลลิวินาที

// ⚡ Fast-Scan Memory Locking Sets: ป้องกัน S/N เบิ้ล และ พิกัดซ้ำกันแบบ 100% Synchronous
const pendingFastSnSet = new Set();
const pendingFastLocationSet = new Set();

// ⚡ Cached High-Speed Occupied Set สำหรับเร่งสปีดการคำนวณพิกัดให้เป็น 0ms
let cachedOccupiedSet = null;

// ⚡ UI Render Batching Throttle flag สำหรับรองรับการยิงสแกนรัวระดับความเร็วสูง
let isFeedRenderScheduled = false;

// ⚡ ---------------------------------------------------------------------
// 🚀 NEW FEATURE 3.0: FIFO SCAN QUEUE ENGINE (รับประกันไม่หลุด 100% ทุก SN)
// ------------------------------------------------------------------------
const scanProcessingQueue = [];
let isProcessingScanQueue = false;
let scanSpeedCounter = 0;
let scanSpeedTimer = null;

// 🟢 Helper: ล็อคโฟกัสให้อยู่ที่ช่องสแกน SN ตลอดเวลา ป้องกันการค้างหลังสแกน 3-4 SN
function ensureSnInputFocus(force = false) {
    const snInput = document.getElementById('inboundSn');
    if (!snInput) return;
    const active = document.activeElement;
    const isOtherInputActive = active && active !== document.body && active !== snInput &&
        (active.tagName === 'INPUT' || active.tagName === 'SELECT' || active.tagName === 'TEXTAREA') &&
        active.id !== 'inboundSn';

    if (!isOtherInputActive || force) {
        snInput.focus();
    }
}

function invalidateOccupiedLocationsCache() {
    cachedOccupiedSet = null;
}

// 🟢 Helper: เพิ่มพิกัดและทุก Variant ของพิกัดเข้า Set เพื่อป้องกันการเบิ้ลพิกัด 100%
function addOccupiedLocToSet(targetSet, loc) {
    if (!loc || !(targetSet instanceof Set)) return;
    const rawUpper = String(loc).trim().toUpperCase();
    if (!rawUpper) return;

    targetSet.add(rawUpper);

    const normKey = getNormalizedLocKey(rawUpper);
    if (normKey) targetSet.add(normKey);

    let p = (typeof window.parseLocationComponents === 'function') ? window.parseLocationComponents(rawUpper) : null;
    if (!p && typeof parseLocationComponents === 'function') p = parseLocationComponents(rawUpper);

    if (p && p.aisle && p.bay) {
        const aisle = String(p.aisle).toUpperCase();
        const bNum = parseInt(p.bay, 10) || 1;
        const bStr = String(bNum).padStart(2, '0');
        const sNum = parseInt(p.shelf, 10) || 1;
        const sStr = String(sNum).padStart(2, '0');
        const slNum = parseInt(p.slot, 10) || 1;
        const slStr = String(slNum).padStart(2, '0');

        targetSet.add(`${aisle}-${bStr}-${sStr}-${slStr}`);
        targetSet.add(`${aisle}-${bStr}-${sNum}-${slStr}`);
        targetSet.add(`${aisle}-${bNum}-${sNum}-${slNum}`);
        targetSet.add(`${aisle}-${bStr}-${sStr}-${slNum}`);
        targetSet.add(`${aisle}-${bStr}-${sNum}-${slNum}`);
    }
}

// 🟢 Helper: ดึงชื่อ-นามสกุลของผู้ใช้งานที่เข้าสู่ระบบ ณ ตอนนั้นแบบ Real-time 100%
function getCurrentUserFullName() {
    let u = null;
    if (typeof window.currentUser !== 'undefined' && window.currentUser) {
        u = window.currentUser;
    } else if (typeof currentUser !== 'undefined' && currentUser) {
        u = currentUser;
    }

    if (u) {
        if (typeof u === 'string') return u;
        const firstName = u.first_name || u.firstname || u.firstName || u.user_metadata?.first_name || '';
        const lastName = u.last_name || u.lastname || u.lastName || u.user_metadata?.last_name || '';
        if (firstName || lastName) return `${firstName} ${lastName}`.trim();
        if (u.fullname || u.fullName || u.full_name) return u.fullname || u.fullName || u.full_name;
        if (u.display_name || u.displayName) return u.display_name || u.displayName;
        if (u.name) return u.name;
        if (u.username) return u.username;
        if (u.email) return u.email;
    }

    // กรณีอ่านจาก Storage ของระบบ WMS
    const storageKeys = ['WMS_ACTIVE_USER', 'WMS_USER', 'currentUser', 'loggedInUser', 'user', 'sb-user-session'];
    for (const key of storageKeys) {
        try {
            const raw = localStorage.getItem(key) || sessionStorage.getItem(key);
            if (raw) {
                const parsed = JSON.parse(raw);
                const userObj = parsed.user || parsed;
                if (userObj) {
                    const fn = userObj.first_name || userObj.firstname || userObj.firstName || userObj.user_metadata?.first_name || userObj.user_metadata?.full_name || '';
                    const ln = userObj.last_name || userObj.lastname || userObj.lastName || userObj.user_metadata?.last_name || '';
                    if (fn || ln) return `${fn} ${ln}`.trim();
                    if (userObj.fullname || userObj.fullName || userObj.full_name) return userObj.fullname || userObj.fullName || userObj.full_name;
                    if (userObj.name) return userObj.name;
                    if (userObj.display_name || userObj.displayName) return userObj.display_name || userObj.displayName;
                    if (userObj.username) return userObj.username;
                    if (userObj.email) return userObj.email;
                }
            }
        } catch (e) {}
    }

    return 'ไม่ระบุผู้บันทึก';
}

// 🟢 Helper: ดึงการตั้งค่าพิกัดแถวแบบ Real-time โดยเชื่อมโยงกับ locations-db.js / global configs
function getAisleConfig(aisleName) {
    const key = String(aisleName || '').trim().toUpperCase();
    if (typeof window.getAisleConfig === 'function') {
        return window.getAisleConfig(key);
    }
    if (typeof window.aisleConfigs !== 'undefined' && window.aisleConfigs && window.aisleConfigs[key]) {
        return window.aisleConfigs[key];
    }
    if (typeof aisleConfigs !== 'undefined' && aisleConfigs && aisleConfigs[key]) {
        return aisleConfigs[key];
    }
    if (typeof window.masterWarehouseConfigs !== 'undefined' && window.masterWarehouseConfigs && window.masterWarehouseConfigs[key]) {
        return window.masterWarehouseConfigs[key];
    }
    try {
        const localCfg = localStorage.getItem('WMS_AISLE_CONFIGS');
        if (localCfg) {
            const parsed = JSON.parse(localCfg);
            if (parsed && parsed[key]) return parsed[key];
        }
    } catch (e) {}

    return { bays: 10, shelves: 1, slots: 10 };
}

// 🟢 Helper: แปลงพิกัดให้อยู่ในคีย์มาตรฐานระดับสากล (รองรับการเชื่อมโยงกับ locations-db.js 100%)
function getNormalizedLocKey(locStr) {
    if (!locStr) return '';
    const clean = String(locStr).trim().toUpperCase();
    if (['DOCK', 'OFFICE', 'PENDING', 'FOOD', 'FREEZER', 'COLD', 'DRY', 'RAW'].includes(clean)) return clean;

    let parsed = null;
    if (typeof window.parseLocationComponents === 'function') {
        parsed = window.parseLocationComponents(clean);
    } else if (typeof parseLocationComponents === 'function') {
        parsed = parseLocationComponents(clean);
    } else {
        // Fallback Parser สอดคล้องกับ locations-db.js
        let parts = clean.split(/[\-\/_]+/).filter(Boolean);
        if (parts.length >= 4) {
            const aisle = parts[0];
            const bay = String(parseInt(parts[1], 10) || 1).padStart(2, '0');
            const shelf = String(parseInt(parts[2], 10) || 1);
            const slot = String(parseInt(parts[3], 10) || 1).padStart(2, '0');
            parsed = { aisle, bay, shelf, slot };
        }
    }

    if (parsed && parsed.aisle && parsed.bay) {
        const aisle = String(parsed.aisle).toUpperCase();
        const bay = String(parseInt(parsed.bay, 10) || 1).padStart(2, '0');
        const shelf = String(parseInt(parsed.shelf, 10) || 1).padStart(2, '0');
        const slot = String(parseInt(parsed.slot, 10) || 1).padStart(2, '0');
        return `${aisle}-${bay}-${shelf}-${slot}`;
    }
    return clean;
}

// Helper: แปลงพิกัดให้เป็นฟอร์แมตมาตรฐาน (รองรับทั้งแบบ Pad และ Unpad Shelf)
function normalizeLocationStandard(locStr) {
    return getNormalizedLocKey(locStr);
}

// 🟢 Helper: ดึงข้อมูล S/N ที่จัดเก็บอยู่ในพิกัดนั้นๆ แบบเรียลไทม์ 100%
function getOccupyingSnDetails(locStr) {
    if (!locStr) return null;
    const targetKey = getNormalizedLocKey(locStr);
    const searchTarget = String(locStr).trim().toUpperCase();

    const checkList = (list) => {
        if (!Array.isArray(list)) return null;
        for (const item of list) {
            if (!item || item.status === 'OUT' || item.status === 'DISPATCHED' || item.status === 'ISSUED' || item.is_deleted || item.qty === 0) continue;
            if (item.location) {
                const itemRaw = String(item.location).trim().toUpperCase();
                const itemKey = getNormalizedLocKey(item.location);
                if (itemRaw === searchTarget || (itemKey && targetKey && itemKey === targetKey)) {
                    return item;
                }
            }
        }
        return null;
    };

    let found = checkList(typeof globalInventoryData !== 'undefined' ? globalInventoryData : null);
    if (!found) found = checkList(typeof offlineInboundQueue !== 'undefined' ? offlineInboundQueue : null);
    if (!found) found = checkList(typeof recentInboundList !== 'undefined' ? recentInboundList : null);

    return found;
}

// 🟢 Helper: ดึงพิกัดที่ถูกใช้งานอยู่ทั้งหมดในระบบคลังสินค้าแบบเรียลไทม์ (ใช้ High-Speed Cache ป้องกันความหน่วง 0ms)
function getAllOccupiedLocationsSet() {
    if (cachedOccupiedSet) {
        pendingFastLocationSet.forEach(loc => addOccupiedLocToSet(cachedOccupiedSet, loc));
        if (typeof occupiedLocationsSet !== 'undefined' && occupiedLocationsSet instanceof Set) {
            occupiedLocationsSet.forEach(loc => addOccupiedLocToSet(cachedOccupiedSet, loc));
        }
        return cachedOccupiedSet;
    }

    const occupied = new Set();
    const isItemOccupying = (item) => {
        if (!item) return false;
        if (item.status === 'OUT' || item.status === 'DISPATCHED' || item.status === 'ISSUED' || item.is_deleted || item.qty === 0) {
            return false;
        }
        return true;
    };

    if (typeof globalInventoryData !== 'undefined' && Array.isArray(globalInventoryData)) {
        for (let i = 0; i < globalInventoryData.length; i++) {
            const item = globalInventoryData[i];
            if (isItemOccupying(item) && item.location) addOccupiedLocToSet(occupied, item.location);
        }
    }
    if (typeof offlineInboundQueue !== 'undefined' && Array.isArray(offlineInboundQueue)) {
        for (let i = 0; i < offlineInboundQueue.length; i++) {
            const item = offlineInboundQueue[i];
            if (isItemOccupying(item) && item.location) addOccupiedLocToSet(occupied, item.location);
        }
    }
    if (typeof recentInboundList !== 'undefined' && Array.isArray(recentInboundList)) {
        for (let i = 0; i < recentInboundList.length; i++) {
            const item = recentInboundList[i];
            if (isItemOccupying(item) && item.location) addOccupiedLocToSet(occupied, item.location);
        }
    }
    if (typeof occupiedLocationsSet !== 'undefined' && occupiedLocationsSet instanceof Set) {
        occupiedLocationsSet.forEach(loc => addOccupiedLocToSet(occupied, loc));
    }

    pendingFastLocationSet.forEach(loc => addOccupiedLocToSet(occupied, loc));

    cachedOccupiedSet = occupied;
    return cachedOccupiedSet;
}

// 🟢 ฟังก์ชันคำนวณหาช่องย่อยที่ว่างอัตโนมัติ เจาะจงตาม [แถว - ล็อก - ชั้น] ที่เลือก
function calculateNextAvailableSlotInShelf(aisleName, bayName, shelfName) {
    const aisle = (aisleName || '').trim().toUpperCase();
    const bayNum = parseInt(bayName, 10) || 1;
    const shelfNum = parseInt(shelfName, 10) || 1;
    const pad2 = (num) => String(num).padStart(2, '0');
    const bayStr = pad2(bayNum);
    const shelfStr = pad2(shelfNum);

    if (!aisle || ['DOCK', 'OFFICE', 'PENDING', 'FOOD', 'FREEZER', 'COLD', 'DRY', 'RAW'].includes(aisle)) {
        return { isFull: false, location: aisle, bay: '00', shelf: '00', slot: '00', freeSlots: 0, occupiedCount: 0, shelfCapacity: 0 };
    }

    const cfg = getAisleConfig(aisle);
    const totalSlotsPerShelf = parseInt(cfg.slots || cfg.slot, 10) || 10;
    const occupied = getAllOccupiedLocationsSet();

    let shelfOccupiedCount = 0;
    let targetSlot = 0;
    let foundAvailable = false;

    for (let sl = 1; sl <= totalSlotsPerShelf; sl++) {
        const slStr = pad2(sl);
        const candNorm = `${aisle}-${bayStr}-${shelfStr}-${slStr}`;
        const candStandard = `${aisle}-${bayStr}-${shelfNum}-${slStr}`;
        const candRaw = `${aisle}-${bayNum}-${shelfNum}-${sl}`;

        const isOccupied = occupied.has(candNorm) || occupied.has(candStandard) || occupied.has(candRaw) || occupied.has(getNormalizedLocKey(candNorm));

        if (isOccupied) {
            shelfOccupiedCount++;
        } else if (!foundAvailable) {
            targetSlot = sl;
            foundAvailable = true;
        }
    }

    const freeSlots = Math.max(0, totalSlotsPerShelf - shelfOccupiedCount);

    if (!foundAvailable || freeSlots === 0) {
        return {
            isFull: true,
            location: `${aisle}-${bayStr}-${shelfStr}-FULL`,
            bay: bayStr,
            shelf: shelfStr,
            slot: '00',
            shelfCapacity: totalSlotsPerShelf,
            occupiedCount: shelfOccupiedCount,
            freeSlots: 0
        };
    }

    return {
        isFull: false,
        location: `${aisle}-${bayStr}-${shelfStr}-${pad2(targetSlot)}`,
        bay: bayStr,
        shelf: shelfStr,
        slot: pad2(targetSlot),
        shelfCapacity: totalSlotsPerShelf,
        occupiedCount: shelfOccupiedCount,
        freeSlots: freeSlots
    };
}

// 🟢 ฟังก์ชันคำนวณหาชั้นและช่องว่างถัดไปใน [แถว - ล็อก] ที่เลือก
function calculateNextAvailableSlotInBay(aisleName, bayName) {
    const aisle = (aisleName || '').trim().toUpperCase();
    const bayNum = parseInt(bayName, 10) || 1;
    const pad2 = (num) => String(num).padStart(2, '0');
    const bayStr = pad2(bayNum);

    if (!aisle || ['DOCK', 'OFFICE', 'PENDING', 'FOOD', 'FREEZER', 'COLD', 'DRY', 'RAW'].includes(aisle)) {
        return { isFull: false, location: aisle, bay: '00', shelf: '00', slot: '00', bayCapacity: 0, freeSlots: 0, occupiedCount: 0 };
    }

    const cfg = getAisleConfig(aisle);
    const totalShelves = parseInt(cfg.shelves || cfg.shelf, 10) || 1;
    const totalSlotsPerShelf = parseInt(cfg.slots || cfg.slot, 10) || 10;
    const bayCapacity = totalShelves * totalSlotsPerShelf;
    const occupied = getAllOccupiedLocationsSet();

    let bayOccupiedCount = 0;
    let targetShelf = 0;
    let targetSlot = 0;
    let foundAvailable = false;

    for (let s = 1; s <= totalShelves; s++) {
        for (let sl = 1; sl <= totalSlotsPerShelf; sl++) {
            const slStr = pad2(sl);
            const sStr = pad2(s);
            const candNorm = `${aisle}-${bayStr}-${sStr}-${slStr}`;
            const candStandard = `${aisle}-${bayStr}-${s}-${slStr}`;
            const candRaw = `${aisle}-${bayNum}-${s}-${sl}`;

            const isOccupied = occupied.has(candNorm) || occupied.has(candStandard) || occupied.has(candRaw) || occupied.has(getNormalizedLocKey(candNorm));

            if (isOccupied) {
                bayOccupiedCount++;
            } else if (!foundAvailable) {
                targetShelf = s;
                targetSlot = sl;
                foundAvailable = true;
            }
        }
    }

    const freeSlots = Math.max(0, bayCapacity - bayOccupiedCount);

    if (!foundAvailable || freeSlots === 0) {
        return {
            isFull: true,
            location: `${aisle}-${bayStr}-FULL`,
            bay: bayStr,
            shelf: '00',
            slot: '00',
            bayCapacity: bayCapacity,
            occupiedCount: bayOccupiedCount,
            freeSlots: 0
        };
    }

    return {
        isFull: false,
        location: `${aisle}-${bayStr}-${pad2(targetShelf)}-${pad2(targetSlot)}`,
        bay: bayStr,
        shelf: pad2(targetShelf),
        slot: pad2(targetSlot),
        bayCapacity: bayCapacity,
        occupiedCount: bayOccupiedCount,
        freeSlots: freeSlots
    };
}

// 🟢 ฟังก์ชันคำนวณภาพรวมความจุทั้งแถว
function calculateAisleCapacityAndNextSlot(aisleName) {
    const aisle = (aisleName || '').trim().toUpperCase();
    if (!aisle) {
        return { location: 'DOCK', bay: 0, shelf: 0, slot: 0, totalSlots: 0, occupiedCount: 0, freeSlots: 0 };
    }

    const specialLocations = ['DOCK', 'OFFICE', 'PENDING', 'FOOD', 'FREEZER', 'COLD', 'DRY', 'RAW'];
    if (specialLocations.includes(aisle)) {
        return { location: aisle, bay: 0, shelf: 0, slot: 0, totalSlots: 0, occupiedCount: 0, freeSlots: 0 };
    }

    const cfg = getAisleConfig(aisle);

    const totalBays = parseInt(cfg.bays || cfg.bay, 10) || 10;
    const totalShelves = parseInt(cfg.shelves || cfg.shelf, 10) || 1;
    const totalSlotsPerShelf = parseInt(cfg.slots || cfg.slot, 10) || 10;
    const totalCapacity = totalBays * totalShelves * totalSlotsPerShelf;

    const occupied = getAllOccupiedLocationsSet();

    let aisleOccupiedCount = 0;
    for (let b = 1; b <= totalBays; b++) {
        for (let s = 1; s <= totalShelves; s++) {
            for (let sl = 1; sl <= totalSlotsPerShelf; sl++) {
                const bStr = String(b).padStart(2, '0');
                const sStr = String(s).padStart(2, '0');
                const slStr = String(sl).padStart(2, '0');
                const candNorm = `${aisle}-${bStr}-${sStr}-${slStr}`;
                if (occupied.has(candNorm) || occupied.has(getNormalizedLocKey(candNorm))) {
                    aisleOccupiedCount++;
                }
            }
        }
    }

    const freeSlots = Math.max(0, totalCapacity - aisleOccupiedCount);
    const pad2 = (num) => String(num).padStart(2, '0');

    let nextLocation = `${aisle}-FULL`;
    let targetBay = 0, targetShelf = 0, targetSlot = 0;
    let found = false;

    for (let b = 1; b <= totalBays; b++) {
        for (let s = 1; s <= totalShelves; s++) {
            for (let sl = 1; sl <= totalSlotsPerShelf; sl++) {
                const bStr = pad2(b);
                const sStr = pad2(s);
                const slStr = pad2(sl);
                const candNorm = `${aisle}-${bStr}-${sStr}-${slStr}`;
                const candStandard = `${aisle}-${bStr}-${s}-${slStr}`;

                if (!occupied.has(candNorm) && !occupied.has(candStandard) && !occupied.has(getNormalizedLocKey(candNorm))) {
                    nextLocation = candNorm;
                    targetBay = b;
                    targetShelf = s;
                    targetSlot = sl;
                    found = true;
                    break;
                }
            }
            if (found) break;
        }
        if (found) break;
    }

    return {
        location: nextLocation,
        bay: targetBay,
        shelf: targetShelf,
        slot: targetSlot,
        totalSlots: totalCapacity,
        occupiedCount: aisleOccupiedCount,
        freeSlots: freeSlots,
        baysConfigured: totalBays,
        shelvesConfigured: totalShelves,
        slotsConfigured: totalSlotsPerShelf
    };
}

// 🟢 ฟังก์ชันสร้างตัวเลือกใน Dropdown ช่องย่อย ตรวจจับซีเรียลในคลังจริงและเลือกช่องว่างถัดไปให้อัตโนมัติ
function populateInboundSlotDropdown(aisle, bay, shelf) {
    const slotSelect = document.getElementById('inboundSlotSelect');
    if (!slotSelect) return '01';

    const cfg = getAisleConfig(aisle);
    const totalSlots = parseInt(cfg.slots || cfg.slot, 10) || 10;
    const occupied = getAllOccupiedLocationsSet();
    const pad2 = (n) => String(n).padStart(2, '0');

    let slotHtml = '';
    let autoSelectedSlot = '';

    const bayStr = pad2(bay);
    const shelfNum = parseInt(shelf, 10) || 1;
    const shelfStr = pad2(shelfNum);

    for (let sl = 1; sl <= totalSlots; sl++) {
        const slStr = pad2(sl);
        const candNorm = `${aisle}-${bayStr}-${shelfStr}-${slStr}`;
        const candStandard = `${aisle}-${bayStr}-${shelfNum}-${slStr}`;
        const candRaw = `${aisle}-${parseInt(bay, 10)}-${shelfNum}-${sl}`;

        const isOccupied = occupied.has(candNorm) || occupied.has(candStandard) || occupied.has(candRaw) || occupied.has(getNormalizedLocKey(candNorm));

        if (isOccupied) {
            const item = getOccupyingSnDetails(candNorm);
            const snLabel = item && item.sn ? ` - SN: ${item.sn}` : '';
            slotHtml += `<option value="${slStr}" disabled style="color:#ef4444; background:#fef2f2;">🔴 ช่อง ${slStr} (ไม่ว่าง${snLabel})</option>`;
        } else {
            if (!autoSelectedSlot) {
                autoSelectedSlot = slStr;
            }
            slotHtml += `<option value="${slStr}">🟢 ช่อง ${slStr} (ว่าง)</option>`;
        }
    }

    slotSelect.innerHTML = slotHtml;

    if (autoSelectedSlot) {
        slotSelect.value = autoSelectedSlot;
    } else if (slotSelect.options.length > 0) {
        slotSelect.value = slotSelect.options[0].value;
    }

    return autoSelectedSlot;
}

// 🟢 เติมตัวเลือก Dropdown และรักษาสถานะล็อกที่เลือกไว้ หากล็อกเต็มจะตัดไปเลือกล็อกถัดไปให้อัตโนมัติ
function populateInboundLocationDropdowns(aisleName, keepBay = null) {
    const aisle = (aisleName || 'A').trim().toUpperCase();
    const baySelect = document.getElementById('inboundBaySelect');
    const shelfSelect = document.getElementById('inboundShelfSelect');
    const slotSelect = document.getElementById('inboundSlotSelect');

    if (!baySelect || !shelfSelect || !slotSelect) return;

    let currentSelectedBay = '01';
    if (typeof keepBay === 'string' && keepBay && keepBay !== '00') {
        currentSelectedBay = keepBay;
    } else if (baySelect.value && baySelect.value !== '00') {
        currentSelectedBay = baySelect.value;
    }

    if (['DOCK', 'OFFICE', 'PENDING', 'FOOD', 'FREEZER', 'COLD', 'DRY', 'RAW'].includes(aisle)) {
        baySelect.innerHTML = `<option value="00">00 (พิเศษ)</option>`;
        shelfSelect.innerHTML = `<option value="00">00 (พิเศษ)</option>`;
        slotSelect.innerHTML = `<option value="00">00 (พิเศษ)</option>`;
        baySelect.disabled = true;
        shelfSelect.disabled = true;
        slotSelect.disabled = true;
        updateInboundLocationPreviewFromDropdowns();
        ensureSnInputFocus();
        return;
    }

    baySelect.disabled = false;
    shelfSelect.disabled = false;
    slotSelect.disabled = false;

    const cfg = getAisleConfig(aisle);
    const totalBays = parseInt(cfg.bays || cfg.bay, 10) || 10;
    const totalShelves = parseInt(cfg.shelves || cfg.shelf, 10) || 1;

    let bayHtml = '';
    for (let b = 1; b <= totalBays; b++) {
        const bStr = String(b).padStart(2, '0');
        bayHtml += `<option value="${bStr}">ล็อก ${bStr}</option>`;
    }
    baySelect.innerHTML = bayHtml;

    let shelfHtml = '';
    for (let s = 1; s <= totalShelves; s++) {
        const sStr = String(s).padStart(2, '0');
        shelfHtml += `<option value="${sStr}">ชั้น ${sStr}</option>`;
    }
    shelfSelect.innerHTML = shelfHtml;

    // 🟢 ตรวจสอบความจุช่องว่างในล็อกที่เลือก
    let targetBayStr = String(currentSelectedBay).padStart(2, '0');
    let resBay = calculateNextAvailableSlotInBay(aisle, targetBayStr);

    // 🟢 หากล็อกที่เลือกอยู่เต็มทุกช่องแล้ว ให้ค้นหาและตัดไปเลือกล็อกถัดไปให้อัตโนมัติ
    if (resBay.isFull) {
        let foundNewBay = false;
        const startBayNum = parseInt(targetBayStr, 10) || 1;

        for (let bOffset = 1; bOffset < totalBays; bOffset++) {
            let testBayNum = ((startBayNum - 1 + bOffset) % totalBays) + 1;
            let testBayStr = String(testBayNum).padStart(2, '0');
            let testRes = calculateNextAvailableSlotInBay(aisle, testBayStr);

            if (!testRes.isFull) {
                targetBayStr = testBayStr;
                resBay = testRes;
                foundNewBay = true;
                if (typeof showToast === 'function') {
                    showToast(`🚨 ล็อก ${currentSelectedBay} เต็มแล้ว! ระบบตัดไปที่ล็อก ${targetBayStr} ให้อัตโนมัติ`, true);
                }
                break;
            }
        }

        if (!foundNewBay) {
            if (typeof playErrorSound === 'function') playErrorSound();
            if (typeof showToast === 'function') {
                showToast(`🚨 แถว ${aisle} เต็มทุกล็อกแล้ว! กรุณาเลือกแถวจัดเก็บอื่น`, true);
            }
        }
    }

    baySelect.value = targetBayStr;

    if (!resBay.isFull) {
        shelfSelect.value = resBay.shelf;
        populateInboundSlotDropdown(aisle, targetBayStr, resBay.shelf);
    } else {
        populateInboundSlotDropdown(aisle, targetBayStr, shelfSelect.value || '01');
    }

    updateInboundLocationPreviewFromDropdowns();
    ensureSnInputFocus();
}

// 🟢 เมื่อผู้ใช้เลือกล็อก (Bay) เอง -> คำนวณหาชั้นและช่องย่อยที่ว่างในล็อกนั้นให้อัตโนมัติ
function onInboundBayChange(bayValue) {
    const aisleSelect = document.getElementById('inboundAisleSelect');
    const baySelect = document.getElementById('inboundBaySelect');
    const shelfSelect = document.getElementById('inboundShelfSelect');

    const currentAisle = aisleSelect ? aisleSelect.value : 'A';
    const currentBay = bayValue || (baySelect ? baySelect.value : '01');

    if (['DOCK', 'OFFICE', 'PENDING', 'FOOD', 'FREEZER', 'COLD', 'DRY', 'RAW'].includes(currentAisle)) return;

    const res = calculateNextAvailableSlotInBay(currentAisle, currentBay);

    if (res.isFull) {
        if (typeof playErrorSound === 'function') playErrorSound();
        if (typeof showToast === 'function') {
            showToast(`🚨 ล็อก ${res.bay} ในแถว ${currentAisle} เต็มทุกช่องแล้ว!`, true);
        }
        populateInboundSlotDropdown(currentAisle, currentBay, shelfSelect ? shelfSelect.value : '01');
    } else {
        if (shelfSelect) shelfSelect.value = res.shelf;
        const selectedSlot = populateInboundSlotDropdown(currentAisle, currentBay, res.shelf);

        if (typeof showToast === 'function') {
            showToast(`📍 แถว ${currentAisle} ล็อก ${res.bay}: คำนวณเลือกช่องว่าง [ชั้น ${res.shelf} ช่อง ${selectedSlot}] ให้อัตโนมัติ`);
        }
    }

    updateInboundLocationPreviewFromDropdowns();
    ensureSnInputFocus();
}

// 🟢 เมื่อผู้ใช้เลือกชั้น (Shelf) -> คำนวณหาช่องย่อยที่ว่างในชั้นนั้นให้อัตโนมัติ 100%
function onInboundShelfChange(shelfValue) {
    const aisleSelect = document.getElementById('inboundAisleSelect');
    const baySelect = document.getElementById('inboundBaySelect');
    const shelfSelect = document.getElementById('inboundShelfSelect');

    const currentAisle = aisleSelect ? aisleSelect.value : 'A';
    const currentBay = baySelect ? baySelect.value : '01';
    const currentShelf = shelfValue || (shelfSelect ? shelfSelect.value : '01');

    if (['DOCK', 'OFFICE', 'PENDING', 'FOOD', 'FREEZER', 'COLD', 'DRY', 'RAW'].includes(currentAisle)) return;

    const res = calculateNextAvailableSlotInShelf(currentAisle, currentBay, currentShelf);
    const selectedSlot = populateInboundSlotDropdown(currentAisle, currentBay, currentShelf);

    if (res.isFull) {
        if (typeof playErrorSound === 'function') playErrorSound();
        if (typeof showToast === 'function') {
            showToast(`🚨 แถว ${currentAisle} ล็อก ${currentBay} ชั้น ${currentShelf} เต็มทุกช่องแล้ว!`, true);
        }
    } else {
        if (typeof showToast === 'function') {
            showToast(`📍 แถว ${currentAisle} ล็อก ${currentBay} ชั้น ${currentShelf}: คำนวณช่องว่างเป็น [ช่อง ${selectedSlot}] ให้อัตโนมัติ`);
        }
    }

    updateInboundLocationPreviewFromDropdowns();
    ensureSnInputFocus();
}

// 🟢 เมื่อผู้ใช้เลือกช่องย่อย (Slot) ด้วยตัวเอง -> ตรวจสอบว่าพิกัดนั้นมี S/N สินค้าเดิมอยู่แล้วหรือไม่
function onInboundSlotChange(slotValue) {
    const aisleSelect = document.getElementById('inboundAisleSelect');
    const baySelect = document.getElementById('inboundBaySelect');
    const shelfSelect = document.getElementById('inboundShelfSelect');
    const slotSelect = document.getElementById('inboundSlotSelect');

    const currentAisle = aisleSelect ? aisleSelect.value : 'A';
    const currentBay = baySelect ? baySelect.value : '01';
    const currentShelf = shelfSelect ? shelfSelect.value : '01';
    const currentSlot = slotValue || (slotSelect ? slotSelect.value : '01');

    if (['DOCK', 'OFFICE', 'PENDING', 'FOOD', 'FREEZER', 'COLD', 'DRY', 'RAW'].includes(currentAisle)) return;

    const formattedLoc = `${currentAisle}-${currentBay}-${currentShelf}-${currentSlot}`;
    const occupied = getAllOccupiedLocationsSet();

    if (occupied.has(formattedLoc) || occupied.has(getNormalizedLocKey(formattedLoc))) {
        if (typeof playErrorSound === 'function') playErrorSound();
        
        const occupyingItem = getOccupyingSnDetails(formattedLoc);
        const occupyingSn = occupyingItem ? occupyingItem.sn : '';
        const snText = occupyingSn ? ` (มี S/N: ${occupyingSn})` : '';

        if (typeof showToast === 'function') {
            showToast(`🚨 พิกัด ${formattedLoc} ไม่ว่าง!${snText} ระบบจะปรับไปช่องว่างให้อัตโนมัติ`, true);
        }

        const autoSlot = populateInboundSlotDropdown(currentAisle, currentBay, currentShelf);
        if (slotSelect) slotSelect.value = autoSlot;
    }

    updateInboundLocationPreviewFromDropdowns();
    ensureSnInputFocus();
}

// 🟢 อัปเดต Preview พิกัดจัดเก็บสินค้า และกล่องรายละเอียด UI
function updateInboundLocationPreviewFromDropdowns() {
    const aisleSelect = document.getElementById('inboundAisleSelect');
    const baySelect = document.getElementById('inboundBaySelect');
    const shelfSelect = document.getElementById('inboundShelfSelect');
    const slotSelect = document.getElementById('inboundSlotSelect');

    const aisle = aisleSelect ? aisleSelect.value : 'A';
    const previewElem = document.getElementById('inboundLocationPreview');
    const hiddenLocInput = document.getElementById('inboundLocation');

    if (['DOCK', 'OFFICE', 'PENDING', 'FOOD', 'FREEZER', 'COLD', 'DRY', 'RAW'].includes(aisle)) {
        if (previewElem) previewElem.textContent = aisle;
        if (hiddenLocInput) hiddenLocInput.value = aisle;
        renderAisleSlotBreakdownUI(calculateAisleCapacityAndNextSlot(aisle));
        return;
    }

    const bay = baySelect ? baySelect.value : '01';
    const shelf = shelfSelect ? shelfSelect.value : '01';
    const slot = slotSelect ? slotSelect.value : '01';

    const formattedLoc = `${aisle}-${bay}-${shelf}-${slot}`;

    if (previewElem) {
        previewElem.textContent = formattedLoc;
        previewElem.classList.remove('pulse-highlight');
        void previewElem.offsetWidth;
        previewElem.classList.add('pulse-highlight');
    }
    if (hiddenLocInput) hiddenLocInput.value = formattedLoc;

    const details = calculateAisleCapacityAndNextSlot(aisle);
    details.bay = parseInt(bay, 10);
    details.shelf = parseInt(shelf, 10);
    details.slot = parseInt(slot, 10);
    details.location = formattedLoc;

    renderAisleSlotBreakdownUI(details);
}

// 🟢 เมื่อเปลี่ยนการเลือกแถว -> คำนวณพิกัดพร้อมสร้างตัวเลือก Dropdown ย่อยทันที
function onInboundAisleChange(aisleValue) {
    const aisleSelect = document.getElementById('inboundAisleSelect');
    const currentAisle = aisleValue || (aisleSelect ? aisleSelect.value : '');
    populateInboundLocationDropdowns(currentAisle, '01');
    const hiddenLoc = document.getElementById('inboundLocation');
    return hiddenLoc ? hiddenLoc.value : currentAisle;
}

// 🟢 ฟังก์ชันเรนเดอร์กล่องรายละเอียด ล็อก/ชั้น/ช่อง พร้อม Visual Progress Bar และ Neon HUD Glow
function renderAisleSlotBreakdownUI(details) {
    let infoContainer = document.getElementById('inboundAisleSlotDetailBox');
    
    if (!infoContainer) {
        const previewElem = document.getElementById('inboundLocationPreview');
        if (previewElem && previewElem.parentElement) {
            infoContainer = document.createElement('div');
            infoContainer.id = 'inboundAisleSlotDetailBox';
            infoContainer.className = 'glass-hud-box';
            infoContainer.style.cssText = `
                margin-top: 10px;
                padding: 12px;
                background: var(--bg-card, #ffffff);
                border: 1px solid var(--border-color, #e2e8f0);
                border-radius: 12px;
                box-shadow: 0 4px 15px rgba(0,0,0,0.05);
                font-size: 0.83rem;
                transition: all 0.3s cubic-bezier(0.4, 0, 0.2, 1);
            `;
            previewElem.parentElement.appendChild(infoContainer);
        } else {
            return;
        }
    }

    if (['DOCK', 'OFFICE', 'PENDING', 'FOOD', 'FREEZER', 'COLD', 'DRY', 'RAW'].includes(details.location)) {
        infoContainer.innerHTML = `
            <div style="text-align:center; color:var(--primary-text); font-weight:600; padding:4px;">
                📍 พิกัดพิเศษ: <strong>${details.location}</strong> (ไม่ต้องเลือกแถว/ชั้น/ช่อง)
            </div>
        `;
        return;
    }

    if (details.location.endsWith('-FULL')) {
        infoContainer.innerHTML = `
            <div style="text-align:center; color:var(--danger, #ef4444); font-weight:700; padding:6px; background:#fef2f2; border-radius:8px;">
                ⚠️ ล็อก/แถวนี้เต็มแล้ว! (ใช้ไป ${details.occupiedCount}/${details.totalSlots} ช่อง) กรุณาเลือกล็อกหรือแถวอื่น
            </div>
        `;
        return;
    }

    const usedPercent = details.totalSlots > 0 ? Math.round((details.occupiedCount / details.totalSlots) * 100) : 0;
    const progressColor = usedPercent > 85 ? '#ef4444' : (usedPercent > 60 ? '#f59e0b' : '#10b981');

    infoContainer.innerHTML = `
        <div style="display:grid; grid-template-columns: repeat(3, 1fr); gap:6px; text-align:center; margin-bottom:10px;">
            <div style="background:var(--primary-light, #e0f2fe); padding:6px 4px; border-radius:8px; border:1px solid rgba(2,132,199,0.15);">
                <span style="font-size:0.7rem; color:var(--text-sub); display:block;">ล็อกที่เลือก</span>
                <strong style="font-size:0.95rem; color:var(--primary-text);" class="mono">ล็อก ${String(details.bay).padStart(2, '0')}</strong>
                <span style="font-size:0.65rem; color:var(--text-muted); display:block;">(จาก ${details.baysConfigured})</span>
            </div>
            <div style="background:var(--primary-light, #e0f2fe); padding:6px 4px; border-radius:8px; border:1px solid rgba(2,132,199,0.15);">
                <span style="font-size:0.7rem; color:var(--text-sub); display:block;">ชั้นที่เลือก</span>
                <strong style="font-size:0.95rem; color:var(--primary-text);" class="mono">ชั้น ${String(details.shelf).padStart(2, '0')}</strong>
                <span style="font-size:0.65rem; color:var(--text-muted); display:block;">(จาก ${details.shelvesConfigured})</span>
            </div>
            <div style="background:#dcfce7; padding:6px 4px; border-radius:8px; border:1px solid rgba(16,185,129,0.3);">
                <span style="font-size:0.7rem; color:#15803d; display:block;">ช่องว่าง Auto</span>
                <strong style="font-size:0.95rem; color:#10b981;" class="mono">ช่อง ${String(details.slot).padStart(2, '0')}</strong>
                <span style="font-size:0.65rem; color:#166534; display:block;">(จาก ${details.slotsConfigured})</span>
            </div>
        </div>

        <div style="margin-bottom:8px;">
            <div style="display:flex; justify-content:space-between; font-size:0.73rem; color:var(--text-sub); margin-bottom:3px;">
                <span>อัตราการจัดเก็บของแถวนี้:</span>
                <strong style="color:${progressColor}">${usedPercent}% (${details.occupiedCount}/${details.totalSlots})</strong>
            </div>
            <div style="width:100%; height:8px; background:#e2e8f0; border-radius:4px; overflow:hidden; box-shadow:inset 0 1px 2px rgba(0,0,0,0.1);">
                <div style="width:${usedPercent}%; height:100%; background:${progressColor}; transition:width 0.3s ease, background 0.3s ease;"></div>
            </div>
        </div>

        <div style="display:flex; justify-content:space-between; align-items:center; font-size:0.78rem; color:var(--text-sub); border-top:1px dashed var(--border-color); padding-top:8px; margin-top:4px;">
            <span>🟢 ช่องว่างคงเหลือ: <strong style="color:var(--success, #10b981);" class="mono">${details.freeSlots}</strong> / ${details.totalSlots} ช่อง</span>
            <button type="button" class="btn btn-sm" onclick="triggerAutoFindNextSlot()" style="font-size:0.7rem; padding:3px 10px; background:var(--primary-light, #e0f2fe); color:var(--primary-text, #0284c7); border:1px solid rgba(2, 132, 199, 0.3); border-radius:6px; cursor:pointer; font-weight:600;" title="ค้นหาและสุ่มช่องว่างถัดไปให้อัตโนมัติ">
                ⚡ หาช่องว่างถัดไป
            </button>
        </div>
    `;
}

// 🟢 ฟังก์ชันปุ่มกดเลือกพิกัดว่างถัดไปให้อัตโนมัติ
function triggerAutoFindNextSlot() {
    autoSelectNextAvailableSlotAfterInbound();
    if (typeof showToast === 'function') {
        showToast('⚡ คำนวณและเลือกพิกัดว่างถัดไปให้อัตโนมัติเรียบร้อย');
    }
}

// 🟢 ปรับเลือกพิกัดว่างถัดไปในล็อกเดิมคงไว้ก่อน หากล็อกเดิมเต็มจึงตัดไปล็อกถัดไปให้อัตโนมัติ
function autoSelectNextAvailableSlotAfterInbound() {
    const aisleSelect = document.getElementById('inboundAisleSelect');
    const baySelect = document.getElementById('inboundBaySelect');

    const currentAisle = aisleSelect ? aisleSelect.value : 'A';
    const currentBay = baySelect ? baySelect.value : '01';

    // ส่ง currentBay เข้าไปเพื่อคงล็อกเดิมของผู้ใช้ไว้
    populateInboundLocationDropdowns(currentAisle, currentBay);
}

// ⚡ ---------------------------------------------------------------------
// 🚀 NEW FEATURE 3.0: HIGH-SPEED FAST SCAN ENGINE WITH FIFO QUEUE WORKER
// ------------------------------------------------------------------------

// Visual Flash Feedback ปืนสแกน
function triggerScanInputFlash(status = 'success') {
    const snInput = document.getElementById('inboundSn');
    if (!snInput) return;
    snInput.classList.remove('scan-flash-success', 'scan-flash-error');
    void snInput.offsetWidth; // Force Reflow
    snInput.classList.add(status === 'success' ? 'scan-flash-success' : 'scan-flash-error');
    setTimeout(() => {
        snInput.classList.remove('scan-flash-success', 'scan-flash-error');
    }, 300);
}

// อัปเดตความเร็วปืนสแกนใน HUD Badge
function recordScanSpeedMetrics() {
    scanSpeedCounter++;
    if (!scanSpeedTimer) {
        scanSpeedTimer = setTimeout(() => {
            const badge = document.getElementById('fastScanSpeedMeterBadge');
            if (badge) {
                badge.textContent = `⚡ ${scanSpeedCounter} ชิ้น/วินาที`;
                badge.style.display = 'inline-block';
            }
            scanSpeedCounter = 0;
            scanSpeedTimer = null;
        }, 1000);
    }
}

// ⚡ ฟังก์ชันรับ Event สแกน แล้วยัดลง Queue ทันที 0ms (ไม่มีทางโดนดร็อป)
async function handleInboundSubmit(e) {
    if (e) e.preventDefault();

    const snInput = document.getElementById('inboundSn');
    if (!snInput) return;

    // ⚡ ดึงรหัส S/N พร้อมคลีนตัวอักษรควบคุมล่องหนจากปืนสแกนทุกประเภท 100%
    const rawSn = snInput.value || '';
    const cleanSn = rawSn.replace(/[\r\n\t\u200B-\u200D\uFEFF]/g, '').trim();

    if (!cleanSn) {
        ensureSnInputFocus(true);
        return;
    }

    const category = (document.getElementById('inboundCategory')?.value || '').trim();
    const name = (document.getElementById('inboundName')?.value || '').trim();
    const meterVal = parseInt(document.getElementById('inboundMeter')?.value) || 0;

    if (!category || !name) {
        if (typeof playErrorSound === 'function') playErrorSound();
        if (typeof showToast === 'function') showToast('⚠️ กรุณาเลือก/กรอก SKU และชื่อรุ่นก่อนสแกน S/N', true);
        triggerScanInputFlash('error');
        snInput.select();
        return;
    }

    // ⚡ เคลียร์ช่อง Input ทันทีในมิลลิวินาทีแรก และคืน Focus ทันทีเพื่อรับ S/N ถัดไปรวดเร็ว 100%
    snInput.value = '';
    ensureSnInputFocus(true);
    requestAnimationFrame(() => ensureSnInputFocus(true));
    setTimeout(() => ensureSnInputFocus(true), 20);

    // ⚡ นำ S/N เข้าคิว FIFO Queue Processing
    scanProcessingQueue.push({
        sn: cleanSn,
        category,
        name,
        meterVal,
        timestamp: Date.now()
    });

    recordScanSpeedMetrics();

    // เรียก Queue Worker ถ้ายังไม่ได้ทำงานอยู่
    if (!isProcessingScanQueue) {
        processScanProcessingQueue();
    }
}

// ⚡ FIFO Queue Worker: ประมวลผลทีละรายการด้วยความเร็วสูงสุด Zero-Latency (Optimistic Storage + Non-blocking Cloud Sync)
async function processScanProcessingQueue() {
    if (isProcessingScanQueue || scanProcessingQueue.length === 0) return;
    isProcessingScanQueue = true;

    while (scanProcessingQueue.length > 0) {
        const item = scanProcessingQueue.shift();
        const { sn, category, name, meterVal } = item;

        let locationElem = document.getElementById('inboundLocationPreview');
        let location = locationElem ? locationElem.textContent.trim() : 'DOCK';

        const snUpper = sn.toUpperCase();
        const isDuplicateSn = pendingFastSnSet.has(snUpper) ||
                              (typeof globalInventoryData !== 'undefined' && globalInventoryData.some(i => String(i.sn).toUpperCase() === snUpper)) ||
                              (typeof isPendingSn === 'function' && isPendingSn(sn));

        if (isDuplicateSn) {
            if (typeof playErrorSound === 'function') playErrorSound();
            if (typeof showToast === 'function') showToast(`🚨 S/N "${escapeHTML(sn)}" มีอยู่ในระบบ/ถูกยิงสแกนไปแล้ว!`, true);
            triggerScanInputFlash('error');
            ensureSnInputFocus(true);
            continue;
        }

        // ⚡ Synchronous 1:1 Strict Location Isolation Check
        const isSpecialLoc = ['DOCK', 'OFFICE', 'PENDING', 'FOOD', 'FREEZER', 'COLD', 'DRY', 'RAW'].includes(location.toUpperCase());
        const normLocation = getNormalizedLocKey(location);
        const occupied = getAllOccupiedLocationsSet();

        const isLocOccupied = !isSpecialLoc && (
            occupied.has(location.toUpperCase()) || 
            occupied.has(normLocation) || 
            pendingFastLocationSet.has(location.toUpperCase()) || 
            pendingFastLocationSet.has(normLocation) ||
            location.endsWith('-FULL')
        );

        if (isLocOccupied) {
            autoSelectNextAvailableSlotAfterInbound();
            let newLocationElem = document.getElementById('inboundLocationPreview');
            location = newLocationElem ? newLocationElem.textContent.trim() : 'DOCK';

            if (location.endsWith('-FULL')) {
                if (typeof playErrorSound === 'function') playErrorSound();
                if (typeof showToast === 'function') showToast(`⚠️ แถวนี้เต็มแล้ว! กรุณาเลือกแถวจัดเก็บอื่น`, true);
                triggerScanInputFlash('error');
                ensureSnInputFocus(true);
                continue;
            }
        }

        // ⚡ Lock Memory Immediately (จอง S/N และพิกัดทันทีแบบ Synchronous 0ms)
        pendingFastSnSet.add(snUpper);
        if (!isSpecialLoc) {
            addOccupiedLocToSet(pendingFastLocationSet, location);
            if (normLocation) addOccupiedLocToSet(pendingFastLocationSet, normLocation);
            if (cachedOccupiedSet) {
                addOccupiedLocToSet(cachedOccupiedSet, location);
                if (normLocation) addOccupiedLocToSet(cachedOccupiedSet, normLocation);
            }
        }

        const activeUserFullName = getCurrentUserFullName();
        const rawPayload = { 
            category, 
            name, 
            sn, 
            meter: meterVal, 
            location, 
            qty: 1, 
            receiver: activeUserFullName,
            created_by: activeUserFullName,
            received_by: activeUserFullName,
            created_at: new Date().toISOString() 
        };

        if (typeof occupiedLocationsSet !== 'undefined') {
            addOccupiedLocToSet(occupiedLocationsSet, location);
        }

        // ⚡ คำนวณเตรียมพิกัดว่างถัดไปสำหรับสแกนลูกถัดไปล่วงหน้าทันที 1 Slot : 1 SN
        autoSelectNextAvailableSlotAfterInbound();

        // แสดงประวัติใน Memory Feed
        recentInboundList.unshift({
            sn, category, name, meter: meterVal, location,
            receiver: activeUserFullName,
            created_by: activeUserFullName,
            time: new Date().toLocaleTimeString('th-TH'),
            isOffline: false
        });
        if (recentInboundList.length > 100) recentInboundList.length = 100;

        triggerScanInputFlash('success');
        scheduleDebouncedFeedRender();

        // กระจาย Event Realtime ข้ามหน้า Asynchronously
        setTimeout(() => {
            document.dispatchEvent(new CustomEvent('inventoryUpdated', { detail: rawPayload }));
            document.dispatchEvent(new CustomEvent('inventoryDataChanged', { detail: rawPayload }));
            document.dispatchEvent(new CustomEvent('wmsRealtimeSync', { detail: rawPayload }));

            if (typeof updateKPIs === 'function') updateKPIs();
            if (typeof filterInventoryData === 'function') filterInventoryData();
            if (typeof refreshLocationVisualizerIfActive === 'function') refreshLocationVisualizerIfActive();
        }, 0);

        // เสียงและสั่นแบบ Non-blocking
        setTimeout(() => {
            if (typeof playSuccessSound === 'function') playSuccessSound();
            if (window.voiceSettings && voiceSettings.inboundVoice && typeof speakThaiText === 'function') {
                speakThaiText(`รับซีเรียล ${sn} เข้า ${location}`);
            }
            if (navigator.vibrate) {
                try { navigator.vibrate(40); } catch(err) {}
            }
        }, 0);

        // ⚡ คืน Focus เข้าช่องสแกนทันที 100%
        ensureSnInputFocus(true);

        // ⚡ Non-blocking Background Async DB Persist Worker (ทำงานร่วมกับ Cloud Server ความเร็วสูง ไม่ดักรอ UI)
        (async () => {
            if (navigator.onLine && typeof _supabase !== 'undefined' && _supabase) {
                try {
                    const cleanData = typeof sanitizeForDb === 'function' ? sanitizeForDb(rawPayload) : rawPayload;
                    cleanData.receiver = activeUserFullName;
                    cleanData.created_by = activeUserFullName;
                    cleanData.received_by = activeUserFullName;

                    // ⚡ มี Timeout Protection ป้องกันเซิร์ฟเวอร์ Cloud ช้าจนดึง UI หน่วง
                    const insertPromise = _supabase.from('warehouse_items').insert([cleanData]).select();
                    const timeoutPromise = new Promise((_, reject) => setTimeout(() => reject(new Error('Cloud Timeout')), 2500));
                    
                    const { data, error } = await Promise.race([insertPromise, timeoutPromise]).catch(() => ({ data: null, error: { message: 'Timeout' } }));

                    if (error) {
                        if (error.code === '23505') {
                            if (typeof showToast === 'function') showToast(`🚨 S/N "${escapeHTML(sn)}" ถูกบันทึกไปก่อนหน้าแล้ว`, true);
                        } else {
                            rawPayload._pending = true;
                            if (typeof globalInventoryData !== 'undefined') globalInventoryData.unshift(rawPayload);
                            if (typeof offlineInboundQueue !== 'undefined') offlineInboundQueue.push(rawPayload);
                            if (typeof persistQueue === 'function') persistQueue();

                            const feedItem = recentInboundList.find(i => i.sn === sn);
                            if (feedItem) feedItem.isOffline = true;
                            scheduleDebouncedFeedRender();
                        }
                    } else {
                        const insertedItem = (data && data[0]) ? data[0] : cleanData;
                        if (typeof globalInventoryData !== 'undefined') globalInventoryData.unshift(insertedItem);
                        if (typeof showToast === 'function') showToast(`✅ [Fast Scan] S/N: ${escapeHTML(sn)} [${location}] โดย ${activeUserFullName} บันทึกสำเร็จ`);
                    }
                } catch (err) {
                    rawPayload._pending = true;
                    if (typeof globalInventoryData !== 'undefined') globalInventoryData.unshift(rawPayload);
                    if (typeof offlineInboundQueue !== 'undefined') offlineInboundQueue.push(rawPayload);
                    if (typeof persistQueue === 'function') persistQueue();

                    const feedItem = recentInboundList.find(i => i.sn === sn);
                    if (feedItem) feedItem.isOffline = true;
                    scheduleDebouncedFeedRender();
                }
            } else {
                rawPayload._pending = true;
                if (typeof globalInventoryData !== 'undefined') globalInventoryData.unshift(rawPayload);
                if (typeof offlineInboundQueue !== 'undefined') offlineInboundQueue.push(rawPayload);
                if (typeof persistQueue === 'function') persistQueue();

                const feedItem = recentInboundList.find(i => i.sn === sn);
                if (feedItem) feedItem.isOffline = true;
                scheduleDebouncedFeedRender();
            }

            if (typeof logUserActivity === 'function') {
                logUserActivity('INBOUND', `ผู้บันทึก [${activeUserFullName}] รับเข้าสินค้า [SKU: ${category}] ${name} เข้าพิกัด ${location}`, sn);
            }
        })();

        // หน่วงเวลาเล็กน้อยระดับมิลลิวินาทีเพื่อให้ Queue ทำงานลื่นไหล
        await new Promise(resolve => setTimeout(resolve, 5));
    }

    isProcessingScanQueue = false;
    ensureSnInputFocus(true);
}

// 🟢 จัดคิวเรนเดอร์ Live Feed แบบ Batched Render ป้องกันหน้าจอกระตุกขณะสแกนรัว
function scheduleDebouncedFeedRender() {
    if (isFeedRenderScheduled) return;
    isFeedRenderScheduled = true;
    requestAnimationFrame(() => {
        renderLiveInboundFeed();
        isFeedRenderScheduled = false;
        ensureSnInputFocus();
    });
}

async function loadRecentInboundFeedFromDB() {
    if (!navigator.onLine || typeof _supabase === 'undefined' || !_supabase) return;
    try {
        const { data, error } = await _supabase
            .from('warehouse_items')
            .select('*')
            .order('created_at', { ascending: false })
            .limit(50);

        if (!error && data) {
            recentInboundList = data.map(item => ({
                sn: item.sn,
                category: item.category || 'N/A',
                name: item.name || '-',
                meter: item.meter || 0,
                location: item.location || 'DOCK',
                receiver: item.receiver || item.created_by || item.received_by || 'ไม่ระบุผู้บันทึก',
                created_by: item.created_by || item.receiver || 'ไม่ระบุผู้บันทึก',
                time: item.created_at ? new Date(item.created_at).toLocaleTimeString('th-TH') : '-',
                isOffline: false
            }));
            scheduleDebouncedFeedRender();
        }
    } catch (e) {}
}

// 🟢 ปรับปรุง UI ประวัติรายการรับเข้าล่าสุด: แสดงชื่อ-นามสกุล User ผู้บันทึกรับเข้าแบบเรียลไทม์ 100% พร้อม Modern Feed Cards
function renderLiveInboundFeed() {
    const container = document.getElementById('liveInboundFeedContainer');
    if (!container) return;

    if (recentInboundList.length === 0) {
        container.innerHTML = `
            <div style="padding:32px 16px; text-align:center; color:var(--text-muted); font-size:0.9rem;">
                <i class="fa-solid fa-box-open" style="font-size:2.4rem; margin-bottom:8px; opacity:0.4;"></i><br/>
                ยังไม่มีรายการรับเข้าสินค้าในเซสชันนี้
            </div>`;
        return;
    }

    const countElem = document.getElementById('recentInboundCountBadge');
    if (countElem) countElem.textContent = `${recentInboundList.length} รายการ`;

    let html = `
        <div class="inbound-feed-header" style="display:flex; justify-content:space-between; align-items:center; margin-bottom:12px; padding:0 2px;">
            <div style="display:flex; align-items:center; gap:8px;">
                <span style="font-size:0.92rem; font-weight:700; color:var(--text-main);">ประวัติการรับเข้าล่าสุด (${recentInboundList.length})</span>
                <span id="fastScanSpeedMeterBadge" class="neon-speed-badge" style="display:none; font-size:0.72rem; padding:2px 8px; background:#10b981; color:#fff; border-radius:12px; font-weight:700;">⚡ 0 ชิ้น/วินาที</span>
            </div>
            <button class="btn btn-sm btn-secondary" onclick="clearRecentInboundFeedView()" style="font-size:0.75rem; padding:3px 10px; border-radius:6px;" title="ล้างหน้าจอแสดงผล">
                <i class="fa-solid fa-eraser"></i> เคลียร์หน้าจอ
            </button>
        </div>
        <div class="inbound-feed-grid" style="display:grid; grid-template-columns: repeat(auto-fill, minmax(280px, 1fr)); gap:12px;">
    `;

    recentInboundList.forEach(item => {
        const formatLoc = typeof formatLocationCode === 'function' ? formatLocationCode(item.location) : item.location;
        const receiverName = typeof escapeHTML === 'function' ? escapeHTML(item.receiver || item.created_by || item.received_by || 'ไม่ระบุผู้บันทึก') : (item.receiver || item.created_by || item.received_by || 'ไม่ระบุผู้บันทึก');
        const itemSn = typeof escapeHTML === 'function' ? escapeHTML(item.sn) : item.sn;
        const itemCategory = typeof escapeHTML === 'function' ? escapeHTML(item.category) : item.category;
        const itemName = typeof escapeHTML === 'function' ? escapeHTML(item.name) : item.name;
        const itemTime = typeof escapeHTML === 'function' ? escapeHTML(item.time) : item.time;

        const syncBadge = item.isOffline 
            ? `<span class="badge-action delete" style="font-size:0.7rem; padding:3px 8px; white-space:nowrap;"><i class="fa-solid fa-wifi-slash"></i> รอ Sync DB</span>`
            : `<span class="badge-action inbound" style="font-size:0.7rem; padding:3px 8px; white-space:nowrap;"><i class="fa-solid fa-circle-check"></i> บันทึก DB แล้ว</span>`;

        const cancelBtn = item.isOffline 
            ? `<button class="btn btn-sm btn-danger" style="padding:3px 8px; font-size:0.7rem; flex-shrink:0;" onclick="removePendingItemBySn('${itemSn}')" title="ยกเลิกการรออนุมัติ"><i class="fa-solid fa-xmark"></i></button>` 
            : '';

        const feedClass = item.isOffline ? 'db-pending-warn' : 'db-synced-success';

        html += `
            <div class="feed-item ${feedClass} modern-feed-card" style="border-radius:12px; padding:12px; background:var(--bg-card, #ffffff); border:1px solid var(--border-color, #e2e8f0); box-shadow:0 3px 10px rgba(0,0,0,0.03); display:flex; flex-direction:column; gap:8px; transition:transform 0.2s ease;">
                <div style="display:flex; justify-content:space-between; align-items:center; gap:8px; width:100%;">
                    <span class="mono font-bold" style="color:var(--text-main); font-size:0.95rem; display:flex; align-items:center; gap:6px;">
                        S/N: ${itemSn}
                        <i class="fa-regular fa-copy" style="cursor:pointer; font-size:0.78rem; color:var(--text-muted);" onclick="copyToClipboard('${itemSn}')" title="คัดลอก S/N"></i>
                    </span>
                    <div style="display:flex; gap:4px; align-items:center; flex-shrink:0;">
                        ${syncBadge}
                        ${cancelBtn}
                    </div>
                </div>

                <div style="display:flex; justify-content:space-between; align-items:flex-start; background:var(--bg-body, #f8fafc); padding:6px 10px; border-radius:8px; border:1px solid var(--border-color, #e2e8f0); gap:6px;">
                    <span style="font-size:0.78rem; color:var(--text-sub); font-weight:600; white-space:nowrap; margin-top:2px;">📍 พิกัด:</span>
                    <span class="badge-location mono" style="font-size:0.83rem; font-weight:800; background:var(--primary-light, #e0f2fe); color:var(--primary-text, #0284c7); padding:4px 10px; border-radius:6px; white-space:normal; word-break:break-word; line-height:1.35; border:1px solid rgba(2, 132, 199, 0.2); text-align:right;">
                        📍 ${typeof escapeHTML === 'function' ? escapeHTML(formatLoc) : formatLoc}
                    </span>
                </div>

                <div style="font-size:0.83rem; color:var(--text-sub); font-weight:500; line-height:1.3; word-break:break-word;" title="[${itemCategory}] ${itemName}">
                    <strong style="color:var(--primary-text);">[${itemCategory}]</strong> ${itemName}
                </div>

                <div style="font-size:0.76rem; color:var(--text-sub); font-weight:600; display:flex; align-items:center; gap:4px;">
                    <i class="fa-solid fa-user-check" style="color:var(--primary-text);"></i> ผู้บันทึก: <span style="color:var(--text-main); font-weight:700;">${receiverName}</span>
                </div>

                <div style="display:flex; justify-content:space-between; align-items:center; font-size:0.76rem; color:var(--warning, #d97706); font-weight:700; border-top:1px dashed var(--border-color); padding-top:6px;">
                    <span><i class="fa-solid fa-gauge"></i> มิเตอร์: ${Number(item.meter || 0).toLocaleString()}</span>
                    <span style="color:var(--text-muted); font-weight:400;"><i class="fa-regular fa-clock"></i> ${itemTime} น.</span>
                </div>
            </div>
        `;
    });

    html += `</div>`;
    container.innerHTML = html;
}

function clearRecentInboundFeedView() {
    recentInboundList = [];
    renderLiveInboundFeed();
    ensureSnInputFocus();
}

function copyToClipboard(text) {
    if (navigator.clipboard && navigator.clipboard.writeText) {
        navigator.clipboard.writeText(text).then(() => {
            if (typeof showToast === 'function') showToast(`📋 คัดลอก "${text}" เรียบร้อยแล้ว`);
        });
    }
}

// 🟢 ค้นหาด่วนรหัสสินค้า SKU จาก Master Products
function onSkuSearchInput(val) {
    const box = document.getElementById('skuSuggestionsBox');
    if (!box) return;

    if (!val.trim()) {
        box.style.display = 'none';
        return;
    }

    const query = val.toLowerCase().trim();
    const skuMap = new Map();

    const masterList = (typeof globalMasterProducts !== 'undefined' ? globalMasterProducts : [])
        .concat(typeof globalInventoryData !== 'undefined' ? globalInventoryData : []);

    masterList.forEach(item => {
        const skuKey = (item.sku || item.category || item.code || '').trim();
        const nameVal = (item.name || item.description || item.model || item.title || '').trim();

        if (skuKey && !skuMap.has(skuKey.toLowerCase())) {
            if (skuKey.toLowerCase().includes(query) || nameVal.toLowerCase().includes(query)) {
                skuMap.set(skuKey.toLowerCase(), { sku: skuKey, name: nameVal });
            }
        }
    });

    const uniqueResults = Array.from(skuMap.values()).slice(0, 100);

    if (uniqueResults.length === 0) {
        const queryText = typeof escapeHTML === 'function' ? escapeHTML(val) : val;
        box.innerHTML = `<div style="padding:12px; text-align:center; color:var(--text-muted); font-size:0.85rem;">ไม่พบข้อมูล SKU / ชื่อรุ่น "${queryText}" ในฐานข้อมูล Master (${globalMasterProducts.length.toLocaleString()} รายการ)</div>`;
        box.style.display = 'block';
        return;
    }

    let html = '';
    uniqueResults.forEach(item => {
        const itemSku = typeof escapeHTML === 'function' ? escapeHTML(item.sku) : item.sku;
        const itemName = typeof escapeHTML === 'function' ? escapeHTML(item.name) : item.name;
        html += `
            <div class="suggestion-item" style="padding:8px 12px; cursor:pointer; border-bottom:1px solid var(--border-color);" onclick="selectSkuSuggestion('${itemSku}', '${itemName}')">
                <span class="mono font-bold" style="color:var(--primary-text);">${itemSku}</span>
                <span style="color:var(--text-main); font-size:0.82rem; margin-left:10px; text-overflow:ellipsis; overflow:hidden; white-space:nowrap;">${itemName}</span>
            </div>
        `;
    });
    box.innerHTML = html;
    box.style.display = 'block';
}

function selectSkuSuggestion(sku, name) {
    const categoryElem = document.getElementById('inboundCategory');
    const nameElem = document.getElementById('inboundName');
    const searchElem = document.getElementById('skuSearchInput');
    const box = document.getElementById('skuSuggestionsBox');

    if (categoryElem) categoryElem.value = sku;
    if (nameElem) nameElem.value = name;
    if (searchElem) searchElem.value = `${sku} - ${name}`;
    if (box) box.style.display = 'none';

    ensureSnInputFocus(true);
}

// 🟢 เชื่อมต่อ Supabase Realtime รับข้อมูลสินค้า Master เมื่อมีการอัปเดต/เพิ่มใหม่ใน DB
function initMasterProductsRealtime() {
    const client = typeof getSupabaseClient === 'function' ? getSupabaseClient() : (typeof _supabase !== 'undefined' ? _supabase : null);
    if (!client) return;

    try {
        client
            .channel('public_products_changes_inbound')
            .on('postgres_changes', { event: '*', schema: 'public', table: 'products' }, async (payload) => {
                if (typeof loadMasterProductsFromDB === 'function') {
                    await loadMasterProductsFromDB();
                    if (typeof showToast === 'function' && payload.eventType === 'INSERT') {
                        showToast(`⚡ อัปเดตสินค้าใหม่จาก DB เรียบร้อยแล้ว (รวม ${globalMasterProducts.length.toLocaleString()} รายการ)`);
                    }
                }
            })
            .subscribe();
    } catch (e) {}
}

// 🟢 แทรก CSS Visual Flash และ Modern HUD Styles เพื่อความสวยงามทันสมัยระดับสากล 100%
function injectModernScanUIStyles() {
    if (document.getElementById('fastScanModernStyles')) return;
    const styleElem = document.createElement('style');
    styleElem.id = 'fastScanModernStyles';
    styleElem.textContent = `
        .scan-flash-success {
            animation: scanFlashGreen 0.3s cubic-bezier(0.4, 0, 0.2, 1) !important;
        }
        .scan-flash-error {
            animation: scanFlashRed 0.3s cubic-bezier(0.4, 0, 0.2, 1) !important;
        }
        @keyframes scanFlashGreen {
            0% { box-shadow: 0 0 0 0 rgba(16, 185, 129, 0.8); border-color: #10b981 !important; background: #ecfdf5 !important; }
            50% { box-shadow: 0 0 18px 4px rgba(16, 185, 129, 0.5); border-color: #10b981 !important; background: #d1fae5 !important; }
            100% { box-shadow: 0 0 0 0 rgba(16, 185, 129, 0); }
        }
        @keyframes scanFlashRed {
            0% { box-shadow: 0 0 0 0 rgba(239, 68, 68, 0.8); border-color: #ef4444 !important; background: #fef2f2 !important; }
            50% { box-shadow: 0 0 18px 4px rgba(239, 68, 68, 0.5); border-color: #ef4444 !important; background: #fee2e2 !important; }
            100% { box-shadow: 0 0 0 0 rgba(239, 68, 68, 0); }
        }
        .modern-feed-card:hover {
            transform: translateY(-2px);
            box-shadow: 0 6px 16px rgba(0,0,0,0.06) !important;
        }
        .neon-speed-badge {
            box-shadow: 0 0 8px rgba(16, 185, 129, 0.4);
            animation: pulseBadge 1.5s infinite alternate;
        }
        @keyframes pulseBadge {
            from { transform: scale(1); }
            to { transform: scale(1.04); }
        }
    `;
    document.head.appendChild(styleElem);
}

// 🟢 ผูก Event Listeners ครบทั้ง แถว -> ล็อก -> ชั้น -> ช่องย่อย พร้อม Realtime Sync เชื่อมโยงกับ locations-db.js
function initInboundEventListeners() {
    injectModernScanUIStyles();

    const snInput = document.getElementById('inboundSn');
    if (snInput) {
        // ⚡ รองรับสัญญาณปืนสแกนทุกประเภท (Enter, NumpadEnter, Tab) โดยเก็บอักขระครบ 100%
        snInput.addEventListener('keydown', function(e) {
            if (e.key === 'Enter' || e.code === 'Enter' || e.code === 'NumpadEnter' || e.key === 'Tab') {
                e.preventDefault();
                handleInboundSubmit(e);
            }
        });

        // 🟢 ป้องกันเคอร์เซอร์หลุดออกจากช่องสแกน (Auto Focus Restore)
        snInput.addEventListener('blur', function() {
            setTimeout(() => {
                ensureSnInputFocus();
            }, 50);
        });
    }

    const aisleSelect = document.getElementById('inboundAisleSelect');
    if (aisleSelect) {
        aisleSelect.addEventListener('change', function(e) {
            onInboundAisleChange(e.target.value);
        });
    }

    const baySelect = document.getElementById('inboundBaySelect');
    if (baySelect) {
        baySelect.addEventListener('change', function(e) {
            onInboundBayChange(e.target.value);
        });
    }

    const shelfSelect = document.getElementById('inboundShelfSelect');
    if (shelfSelect) {
        shelfSelect.addEventListener('change', function(e) {
            onInboundShelfChange(e.target.value);
        });
    }

    const slotSelect = document.getElementById('inboundSlotSelect');
    if (slotSelect) {
        slotSelect.addEventListener('change', function(e) {
            onInboundSlotChange(e.target.value);
        });
    }

    // 🟢 ซิงค์ Real-time ร่วมกับ locations-db.js และเคลียร์ Cache เมื่อมีการอัปเดตสต็อกหรือคอนฟิกคลัง
    ['inventoryUpdated', 'inventoryDataChanged', 'wmsRealtimeSync', 'warehouseConfigUpdated'].forEach(evtName => {
        document.addEventListener(evtName, function() {
            invalidateOccupiedLocationsCache();
            autoSelectNextAvailableSlotAfterInbound();
        }, true);
    });

    window.addEventListener('storage', function(e) {
        if (e.key === 'WMS_AISLE_CONFIGS' || e.key === 'WMS_INVENTORY_DATA') {
            invalidateOccupiedLocationsCache();
            autoSelectNextAvailableSlotAfterInbound();
        }
    });

    autoSelectNextAvailableSlotAfterInbound();
    initMasterProductsRealtime();
    ensureSnInputFocus();
}

// 🟢 บายพาสลง window Object เพื่อให้ส่วนอื่นๆ และหน้าอื่นๆ ในระบบ WMS นำไปเรียกใช้คำนวณพิกัดว่างได้ 100%
if (typeof window !== 'undefined') {
    window.ensureSnInputFocus = ensureSnInputFocus;
    window.getCurrentUserFullName = getCurrentUserFullName;
    window.getAisleConfig = getAisleConfig;
    window.getNormalizedLocKey = getNormalizedLocKey;
    window.normalizeLocationStandard = normalizeLocationStandard;
    window.getOccupyingSnDetails = getOccupyingSnDetails;
    window.getAllOccupiedLocationsSet = getAllOccupiedLocationsSet;
    window.invalidateOccupiedLocationsCache = invalidateOccupiedLocationsCache;
    window.calculateNextAvailableSlotInShelf = calculateNextAvailableSlotInShelf;
    window.calculateNextAvailableSlotInBay = calculateNextAvailableSlotInBay;
    window.calculateAisleCapacityAndNextSlot = calculateAisleCapacityAndNextSlot;
    window.populateInboundSlotDropdown = populateInboundSlotDropdown;
    window.populateInboundLocationDropdowns = populateInboundLocationDropdowns;
    window.onInboundAisleChange = onInboundAisleChange;
    window.onInboundBayChange = onInboundBayChange;
    window.onInboundShelfChange = onInboundShelfChange;
    window.onInboundSlotChange = onInboundSlotChange;
    window.updateInboundLocationPreviewFromDropdowns = updateInboundLocationPreviewFromDropdowns;
    window.renderAisleSlotBreakdownUI = renderAisleSlotBreakdownUI;
    window.autoSelectNextAvailableSlotAfterInbound = autoSelectNextAvailableSlotAfterInbound;
    window.triggerAutoFindNextSlot = triggerAutoFindNextSlot;
    window.handleInboundSubmit = handleInboundSubmit;
    window.processScanProcessingQueue = processScanProcessingQueue;
    window.loadRecentInboundFeedFromDB = loadRecentInboundFeedFromDB;
    window.renderLiveInboundFeed = renderLiveInboundFeed;
    window.clearRecentInboundFeedView = clearRecentInboundFeedView;
    window.copyToClipboard = copyToClipboard;
    window.onSkuSearchInput = onSkuSearchInput;
    window.selectSkuSuggestion = selectSkuSuggestion;
    window.initMasterProductsRealtime = initMasterProductsRealtime;
    window.initInboundEventListeners = initInboundEventListeners;
}

document.addEventListener('DOMContentLoaded', () => {
    initInboundEventListeners();
});