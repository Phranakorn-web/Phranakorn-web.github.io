// =========================================================================
// --- MODULE: ULTRA-MODERN FULL-SCREEN LOCATION VISUALIZER & ENGINE ---
// --- (FULL-WIDTH RESPONSIVE, REALTIME DB SYNC & HIGH-SECURITY ENGINE) ---
// =========================================================================

// 🛡️ 1. Safe Escape HTML Helper (XSS Protection 100%)
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

// 🛡️ 2. Safe Copy Text Helper Fallback
if (typeof window.copyTextToClipboard !== 'function') {
    window.copyTextToClipboard = function(text, label = 'ข้อความ') {
        if (!text) return;
        const safeText = String(text).trim();
        if (navigator.clipboard && window.isSecureContext) {
            navigator.clipboard.writeText(safeText).then(() => {
                if (typeof showToast === 'function') showToast(`📋 คัดลอก ${label} แล้ว: ${safeText}`);
                else alert(`คัดลอก ${label} แล้ว: ${safeText}`);
            }).catch(() => {
                fallbackCopyText(safeText, label);
            });
        } else {
            fallbackCopyText(safeText, label);
        }
    };

    function fallbackCopyText(text, label) {
        const textArea = document.createElement("textarea");
        textArea.value = text;
        textArea.style.position = "fixed";
        textArea.style.left = "-9999px";
        document.body.appendChild(textArea);
        textArea.focus();
        textArea.select();
        try {
            document.execCommand('copy');
            if (typeof showToast === 'function') showToast(`📋 คัดลอก ${label} แล้ว: ${text}`);
            else alert(`คัดลอก ${label} แล้ว: ${text}`);
        } catch (err) {
            console.error('Fallback Copy Error:', err);
        }
        document.body.removeChild(textArea);
    }
}

// -------------------------------------------------------------------------
// ตัวแปรควบคุมสถานะส่วนกลาง (State Management)
// -------------------------------------------------------------------------
let activeLocationAisle = ''; 
let activeLocationBay = 'ALL';
let aisleSnSearchQuery = '';
let activePrintBarcodeSn = null;
let activeBarcodeSize = '50x30';

// ซิงค์ตัวแปรดั้งเดิมเพื่อ Compatibility
Object.defineProperty(window, 'currentSelectedAisle', {
    get: () => activeLocationAisle,
    set: (val) => { activeLocationAisle = val; }
});
Object.defineProperty(window, 'currentSelectedBay', {
    get: () => activeLocationBay,
    set: (val) => { activeLocationBay = val; }
});

// โหมดการแสดงผลล็อกย่อย (Bay Display Mode)
let bayDisplayMode = 'CONFIGURED'; // 'CONFIGURED', 'OCCUPIED', 'ALL'

// ตัวแปรควบคุม UX/UI การแบ่งหน้าล็อกย่อย
let currentBayPage = 1;
const BAYS_PER_PAGE = 48;
let bayFilterQuery = '';

// -------------------------------------------------------------------------
// Inject Dynamic Styles - Full-Screen Modern High-Tech UX/UI Design
// -------------------------------------------------------------------------
(function injectModernVisualizerStyles() {
    if (document.getElementById('locations-modern-theme-styles')) return;
    const styleElem = document.createElement('style');
    styleElem.id = 'locations-modern-theme-styles';
    styleElem.textContent = `
        /* 🌐 บังคับให้คอนเทนเนอร์แร็คและตารางแสดงผลเรียงต่อกันเป็นแนวตั้งเต็ม 100% */
        #rackSlotsGrid {
            width: 100% !important;
            max-width: 100% !important;
            display: flex !important;
            flex-direction: column !important;
            gap: 22px !important;
            clear: both !important;
            box-sizing: border-box !important;
        }

        /* 🌐 Full-Width Card & Container System */
        .wh-fullscreen-card {
            width: 100% !important;
            max-width: 100% !important;
            background: var(--bg-surface, #ffffff);
            border: 1px solid var(--border-color, #e2e8f0);
            border-radius: 18px;
            padding: 22px 26px;
            margin-bottom: 22px;
            box-shadow: 0 4px 20px rgba(0,0,0,0.03);
            box-sizing: border-box;
            transition: all 0.2s ease;
        }

        /* 🏷️ แถวเลือก Aisle Pill */
        .wh-aisle-pill {
            padding: 11px 22px;
            font-size: 0.92rem;
            font-weight: 700;
            border-radius: 12px;
            transition: all 0.2s cubic-bezier(0.4, 0, 0.2, 1);
            display: inline-flex;
            align-items: center;
            gap: 10px;
            white-space: nowrap;
            cursor: pointer;
            border: 1.5px solid var(--border-color, #cbd5e1);
            background: var(--bg-surface, #ffffff);
            color: var(--text-main, #0f172a);
        }
        .wh-aisle-pill:hover {
            border-color: var(--primary, #2563eb);
            transform: translateY(-2px);
            box-shadow: 0 4px 14px rgba(37, 99, 235, 0.15);
        }
        .wh-aisle-pill.active {
            background: linear-gradient(135deg, var(--primary, #2563eb) 0%, #4f46e5 100%);
            color: #ffffff !important;
            border-color: transparent;
            box-shadow: 0 6px 20px rgba(37, 99, 235, 0.35);
        }

        /* 📦 หมวดที่ 2: Layout ปุ่มเลือกล็อกย่อยแบบ Grid เต็มหน้าจอ */
        .wh-bays-fullscreen-wrapper {
            width: 100% !important;
            max-width: 100% !important;
            background: var(--bg-surface, #ffffff);
            border: 1px solid var(--border-color, #e2e8f0);
            border-radius: 18px;
            padding: 22px 26px;
            margin-top: 10px;
            box-shadow: 0 4px 20px rgba(0,0,0,0.03);
            box-sizing: border-box;
        }

        .wh-bay-grid-responsive {
            display: grid;
            grid-template-columns: repeat(auto-fill, minmax(135px, 1fr));
            gap: 12px;
            max-height: 380px;
            overflow-y: auto;
            padding: 6px;
            border-radius: 12px;
            width: 100%;
            box-sizing: border-box;
        }

        .wh-bay-chip-card {
            padding: 12px 14px;
            border-radius: 12px;
            font-weight: 700;
            display: flex;
            flex-direction: column;
            gap: 8px;
            cursor: pointer;
            transition: all 0.2s cubic-bezier(0.4, 0, 0.2, 1);
            background: var(--bg-surface, #ffffff);
            border: 1.5px solid var(--border-color, #cbd5e1);
            color: var(--text-main, #0f172a);
            width: 100%;
            box-sizing: border-box;
        }
        .wh-bay-chip-card:hover {
            border-color: var(--primary, #2563eb);
            transform: translateY(-2px);
            box-shadow: 0 4px 12px rgba(37, 99, 235, 0.15);
        }
        .wh-bay-chip-card.active {
            background: linear-gradient(135deg, var(--primary, #2563eb) 0%, #3b82f6 100%);
            color: #ffffff !important;
            border-color: transparent;
            box-shadow: 0 6px 18px rgba(37, 99, 235, 0.3);
        }

        /* 🗄️ ผังจำลองช่องแร็ค (Rack Layout Matrix) แบบขยายเต็มจอ อยู่ด้านบน */
        .rack-matrix-card-full {
            width: 100% !important;
            max-width: 100% !important;
            background: var(--bg-surface, #ffffff);
            border: 1px solid var(--border-color, #e2e8f0);
            border-radius: 18px;
            padding: 22px 26px;
            box-shadow: 0 4px 20px rgba(0,0,0,0.03);
            box-sizing: border-box;
            clear: both !important;
        }

        .rack-slot-box-full {
            width: 115px !important;
            min-width: 115px !important;
            padding: 10px 8px !important;
            border-radius: 12px !important;
            font-size: 0.8rem !important;
            text-align: center !important;
            cursor: pointer;
            transition: all 0.15s ease;
            box-sizing: border-box;
        }

        /* 📋 หมวดที่ 3: ตารางรายการ SN จัดเก็บจริง เต็มหน้าจอ ต่อลงมาด้านล่าง 100% */
        .wh-full-table-card {
            width: 100% !important;
            max-width: 100% !important;
            background: var(--bg-surface, #ffffff);
            border: 1px solid var(--border-color, #e2e8f0);
            border-radius: 18px;
            overflow: hidden;
            box-shadow: 0 4px 25px rgba(0,0,0,0.04);
            box-sizing: border-box;
            display: block !important;
            clear: both !important;
        }
        .wh-table-header-bar {
            padding: 20px 26px;
            background: linear-gradient(135deg, var(--primary-light, #eff6ff) 0%, var(--bg-subtle, #f1f5f9) 100%);
            border-bottom: 1px solid var(--border-color, #e2e8f0);
            display: flex;
            justify-content: space-between;
            align-items: center;
            flex-wrap: wrap;
            gap: 14px;
        }
        .wh-modern-fullscreen-table {
            width: 100%;
            border-collapse: separate;
            border-spacing: 0;
            font-size: 0.9rem;
        }
        .wh-modern-fullscreen-table th {
            position: sticky;
            top: 0;
            z-index: 5;
            background: var(--bg-subtle, #f8fafc);
            color: var(--text-sub, #475569);
            font-weight: 800;
            padding: 16px 20px;
            border-bottom: 2px solid var(--border-color, #cbd5e1);
            text-transform: uppercase;
            font-size: 0.78rem;
            letter-spacing: 0.5px;
            white-space: nowrap;
        }
        .wh-modern-fullscreen-table td {
            padding: 16px 20px;
            border-bottom: 1px solid var(--border-color, #e2e8f0);
            background: var(--bg-surface, #ffffff);
            color: var(--text-main, #0f172a);
            vertical-align: middle;
            transition: background 0.15s ease;
        }
        .wh-modern-fullscreen-table tbody tr:hover td {
            background: rgba(37, 99, 235, 0.035);
        }

        .sn-code-badge {
            display: inline-flex;
            align-items: center;
            gap: 6px;
            background: linear-gradient(135deg, #eff6ff 0%, #dbeafe 100%);
            color: #1e40af;
            border: 1px solid #bfdbfe;
            padding: 6px 14px;
            border-radius: 10px;
            font-family: var(--font-mono, monospace);
            font-weight: 800;
            font-size: 0.92rem;
            letter-spacing: 0.4px;
            white-space: nowrap;
        }
        .badge-location-tag {
            display: inline-flex;
            align-items: center;
            gap: 4px;
            background: var(--bg-subtle, #f1f5f9);
            color: var(--primary, #2563eb);
            border: 1px solid var(--border-color, #cbd5e1);
            padding: 5px 12px;
            border-radius: 8px;
            font-weight: 700;
            font-size: 0.85rem;
            font-family: var(--font-mono, monospace);
            white-space: nowrap;
        }
        .action-btn-group {
            display: inline-flex;
            gap: 4px;
            background: var(--bg-subtle, #f8fafc);
            padding: 4px;
            border-radius: 12px;
            border: 1px solid var(--border-color, #e2e8f0);
        }
    `;
    document.head.appendChild(styleElem);
})();

// -------------------------------------------------------------------------
// Helper: ดึงโครงสร้างพิกัดแถว จาก DB/Config Realtime 100%
// -------------------------------------------------------------------------
function getAisleConfig(aisleName) {
    const key = String(aisleName || '').trim();
    if (typeof window.aisleConfigs !== 'undefined' && window.aisleConfigs && window.aisleConfigs[key]) {
        return window.aisleConfigs[key];
    }
    if (typeof aisleConfigs !== 'undefined' && aisleConfigs && aisleConfigs[key]) {
        return aisleConfigs[key];
    }
    if (typeof window.masterWarehouseConfigs !== 'undefined' && window.masterWarehouseConfigs && window.masterWarehouseConfigs[key]) {
        return window.masterWarehouseConfigs[key];
    }
    if (typeof masterWarehouseConfigs !== 'undefined' && masterWarehouseConfigs && masterWarehouseConfigs[key]) {
        return masterWarehouseConfigs[key];
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

// -------------------------------------------------------------------------
// 0. ระบบ Auto-Sync Config & Listener (Realtime Updates 100%)
// -------------------------------------------------------------------------
function refreshLocationVisualizerIfActive() {
    renderDrillDownAisleBar();
    renderDrillDownBaysGrid();
    renderDrillDownSlotsGrid();
}

window.notifyWarehouseConfigChanged = function() { refreshLocationVisualizerIfActive(); };
window.notifyInventoryDataUpdated = function() { refreshLocationVisualizerIfActive(); };

['warehouseConfigUpdated', 'inventoryUpdated', 'inventoryDataChanged', 'wmsRealtimeSync'].forEach(evtName => {
    document.addEventListener(evtName, function() {
        refreshLocationVisualizerIfActive();
    }, true);
});

window.addEventListener('storage', function(e) {
    if (e.key === 'WMS_AISLE_CONFIGS' || e.key === 'WMS_MASTER_AISLES' || e.key === 'WMS_INVENTORY_DATA') {
        refreshLocationVisualizerIfActive();
    }
});

function closeModalElement(elem) {
    if (!elem) return;
    elem.style.display = 'none';
    elem.classList.remove('active', 'show');
}

// -------------------------------------------------------------------------
// 1. ระบบ Smart Location Parser & Aisle Extractor
// -------------------------------------------------------------------------
function extractAisleFromLocation(locStr) {
    if (!locStr) return '';
    let rawStr = String(locStr).trim();
    
    const knownAisles = [];
    if (typeof window.masterAisles !== 'undefined' && Array.isArray(window.masterAisles)) {
        window.masterAisles.forEach(a => { if (a) knownAisles.push(typeof a === 'object' ? String(a.name || a.aisle) : String(a).trim()); });
    } else if (typeof masterAisles !== 'undefined' && Array.isArray(masterAisles)) {
        masterAisles.forEach(a => { if (a) knownAisles.push(typeof a === 'object' ? String(a.name || a.aisle) : String(a).trim()); });
    }

    if (typeof masterWarehouseConfigs !== 'undefined' && masterWarehouseConfigs) {
        Object.keys(masterWarehouseConfigs).forEach(a => { if (a) knownAisles.push(String(a).trim()); });
    }

    knownAisles.sort((a, b) => b.length - a.length);

    for (let key of knownAisles) {
        const keyUpper = key.toUpperCase().trim();
        const rawUpper = rawStr.toUpperCase();

        if (rawUpper === keyUpper) return key;
        if (rawUpper.startsWith(keyUpper + '-') || 
            rawUpper.startsWith(keyUpper + '/') || 
            rawUpper.startsWith(keyUpper + '_') || 
            rawUpper.startsWith(keyUpper + ' ')) {
            return key;
        }
    }

    let parts = rawStr.split(/[\-\/_]+/).filter(Boolean);
    if (parts.length > 0) {
        let p0 = parts[0].trim();
        let matchEngNum = p0.match(/^([A-Z0-9_]+)$/i);
        if (matchEngNum) return matchEngNum[1].toUpperCase();
        return p0;
    }

    return rawStr;
}

function parseLocationComponents(locStr) {
    if (!locStr) return { aisle: 'DOCK', bay: '01', shelf: '1', slot: '01', raw: '' };
    let cleanStr = String(locStr).trim().toUpperCase();

    if (['DOCK', 'OFFICE', 'PENDING', 'FOOD', 'FREEZER', 'COLD', 'DRY', 'RAW'].includes(cleanStr)) {
        return { aisle: cleanStr, bay: '01', shelf: '1', slot: '01', raw: cleanStr };
    }

    let aisle = extractAisleFromLocation(cleanStr) || 'A';
    let remainder = cleanStr;
    if (remainder.startsWith(aisle)) {
        remainder = remainder.substring(aisle.length).replace(/^[\-\/_\s]+/, '');
    }

    let bayNum = 1, shelfNum = 1, slotNum = 1;
    let parts = remainder.split(/[\-\/_]+/).filter(Boolean);

    if (parts.length >= 1) {
        let bayMatch = parts[0].match(/(?:BAY|B|L)?(\d+)/i);
        if (bayMatch) bayNum = parseInt(bayMatch[1], 10) || 1;

        if (parts.length >= 2) {
            let shelfMatch = parts[1].match(/(?:SHELF|SH|LAYER|LV|L)?(\d+)/i);
            if (shelfMatch) shelfNum = parseInt(shelfMatch[1], 10) || 1;
        }

        if (parts.length >= 3) {
            let slotMatch = parts[2].match(/(?:SLOT|SL|S)?(\d+)/i);
            if (slotMatch) slotNum = parseInt(slotMatch[1], 10) || 1;
        }
    } else {
        let explicitBay = remainder.match(/(?:BAY|B)(\d+)/i);
        if (explicitBay) bayNum = parseInt(explicitBay[1], 10) || 1;
        else {
            let anyDigit = remainder.match(/(\d+)/);
            if (anyDigit) bayNum = parseInt(anyDigit[1], 10) || 1;
        }
    }

    let bayStr = String(bayNum).padStart(2, '0');
    let slotStr = String(slotNum).padStart(2, '0');

    return {
        aisle: aisle,
        bay: bayStr,
        shelf: String(shelfNum),
        slot: slotStr,
        raw: cleanStr,
        formatted: `${aisle}-${bayStr}-${shelfNum}-${slotStr}`
    };
}

function normalizeLocationCode(locStr) {
    const parsed = parseLocationComponents(locStr);
    if (['DOCK', 'OFFICE', 'PENDING', 'FOOD', 'FREEZER', 'COLD', 'DRY', 'RAW'].includes(parsed.raw)) {
        return parsed.raw;
    }
    return parsed.formatted;
}

function formatCompactLocationTag(locStr) {
    if (!locStr) return '-';
    const parsed = parseLocationComponents(locStr);
    if (['DOCK', 'OFFICE', 'PENDING', 'FOOD', 'FREEZER', 'COLD', 'DRY', 'RAW'].includes(parsed.raw)) {
        return parsed.raw;
    }
    return `${parsed.aisle}${parsed.bay}-L${parsed.shelf}-S${parsed.slot}`;
}

function formatLocationCode(locStr) { return formatCompactLocationTag(locStr); }

function getDensityInfo(occupied, capacity) {
    const totalCap = Math.max(1, capacity || 1);
    const count = Math.max(0, occupied || 0);
    const rawRate = Math.round((count / totalCap) * 100);
    const rate = Math.min(100, rawRate);

    let statusText = 'ว่าง / หนาแน่นต่ำ';
    let badgeBg = 'rgba(16, 185, 129, 0.15)';
    let badgeColor = '#059669';
    let barGradient = 'linear-gradient(90deg, #10b981 0%, #34d399 100%)';
    let statusIcon = '🟢';

    if (rawRate > 100) {
        statusText = `เกินความจุ (${rawRate}%)`;
        badgeBg = 'rgba(225, 29, 72, 0.2)';
        badgeColor = '#e11d48';
        barGradient = 'linear-gradient(90deg, #e11d48 0%, #9f1239 100%)';
        statusIcon = '🚨';
    } else if (rate >= 95) {
        statusText = 'เต็มพื้นที่';
        badgeBg = 'rgba(239, 68, 68, 0.18)';
        badgeColor = '#dc2626';
        barGradient = 'linear-gradient(90deg, #ef4444 0%, #b91c1c 100%)';
        statusIcon = '🔴';
    } else if (rate >= 75) {
        statusText = 'หนาแน่นสูง';
        badgeBg = 'rgba(245, 158, 11, 0.18)';
        badgeColor = '#d97706';
        barGradient = 'linear-gradient(90deg, #f59e0b 0%, #d97706 100%)';
        statusIcon = '🟡';
    } else if (rate >= 40) {
        statusText = 'หนาแน่นปานกลาง';
        badgeBg = 'rgba(2, 132, 199, 0.15)';
        badgeColor = '#0284c7';
        barGradient = 'linear-gradient(90deg, #0284c7 0%, #38bdf8 100%)';
        statusIcon = '🔵';
    }

    return {
        rate, rawRate, count, capacity: totalCap,
        available: Math.max(0, totalCap - count),
        statusText, badgeBg, badgeColor, barGradient, statusIcon
    };
}

function getAllConfiguredAisles() {
    const aisleMap = new Map();

    const addAisle = (key, order) => {
        const k = String(key || '').trim();
        if (!k) return;
        if (!aisleMap.has(k)) {
            aisleMap.set(k, order);
        }
    };

    let masterList = null;
    if (typeof window.masterAisles !== 'undefined' && Array.isArray(window.masterAisles)) {
        masterList = window.masterAisles;
    } else if (typeof masterAisles !== 'undefined' && Array.isArray(masterAisles)) {
        masterList = masterAisles;
    }

    if (!masterList || masterList.length === 0) {
        try {
            const localMaster = localStorage.getItem('WMS_MASTER_AISLES');
            if (localMaster) masterList = JSON.parse(localMaster);
        } catch (e) {}
    }

    if (Array.isArray(masterList)) {
        masterList.forEach((a, idx) => {
            const key = (typeof a === 'object' && a !== null) ? (a.name || a.aisle || a.key || '') : String(a);
            const orderVal = (typeof a === 'object' && a !== null && a.sort_order !== undefined) ? Number(a.sort_order) : idx;
            if (key) addAisle(key, orderVal);
        });
    }

    let configs = null;
    if (typeof window.aisleConfigs !== 'undefined' && window.aisleConfigs) configs = window.aisleConfigs;
    else if (typeof aisleConfigs !== 'undefined' && aisleConfigs) configs = aisleConfigs;
    else if (typeof window.masterWarehouseConfigs !== 'undefined' && window.masterWarehouseConfigs) configs = window.masterWarehouseConfigs;
    else if (typeof masterWarehouseConfigs !== 'undefined' && masterWarehouseConfigs) configs = masterWarehouseConfigs;

    if (!configs) {
        try {
            const localCfg = localStorage.getItem('WMS_AISLE_CONFIGS');
            if (localCfg) configs = JSON.parse(localCfg);
        } catch (e) {}
    }

    if (configs && typeof configs === 'object') {
        Object.keys(configs).forEach((a, idx) => {
            const cfg = configs[a] || {};
            const orderVal = cfg.sort_order !== undefined ? Number(cfg.sort_order) : (cfg.index !== undefined ? Number(cfg.index) : (aisleMap.has(a) ? aisleMap.get(a) : idx + 100));
            addAisle(a, orderVal);
        });
    }

    const inventory = (typeof globalInventoryData !== 'undefined' && Array.isArray(globalInventoryData)) ? globalInventoryData : [];
    inventory.forEach(item => {
        if (item && item.location) {
            const aisle = extractAisleFromLocation(item.location);
            if (aisle && !aisleMap.has(aisle)) {
                addAisle(aisle, 9999);
            }
        }
    });

    const allAisles = Array.from(aisleMap.keys()).filter(a => a !== '');

    return allAisles.sort((a, b) => {
        const orderA = aisleMap.get(a) !== undefined ? aisleMap.get(a) : 9999;
        const orderB = aisleMap.get(b) !== undefined ? aisleMap.get(b) : 9999;
        if (orderA !== orderB) return orderA - orderB;
        return a.localeCompare(b, 'th', { numeric: true, sensitivity: 'base' });
    });
}

function getAisleOccupancyStats(aisleName) {
    if (!aisleName) {
        return { totalCapacity: 0, configuredCapacity: 0, occupiedSlots: 0, availableSlots: 0, occupancyRate: 0, rawOccupancyRate: 0, baysCount: 0, maxFoundBay: 0, itemsList: [], densityInfo: getDensityInfo(0, 100) };
    }

    const targetAisle = String(aisleName).trim();
    const targetAisleUpper = targetAisle.toUpperCase();

    const config = getAisleConfig(targetAisle);
    const configuredBays = Math.max(1, parseInt(config.bays || config.bay, 10) || 10);
    const configuredShelves = Math.max(1, parseInt(config.shelves || config.shelf, 10) || 1);
    const configuredSlots = Math.max(1, parseInt(config.slots || config.slot, 10) || 10);

    const inventory = (typeof globalInventoryData !== 'undefined' && Array.isArray(globalInventoryData)) ? globalInventoryData : [];
    const itemsInAisle = inventory.filter(item => {
        if (!item || !item.location) return false;
        
        const parsed = parseLocationComponents(item.location);
        if (parsed.aisle.toUpperCase() === targetAisleUpper) return true;

        const rawLocUpper = String(item.location).trim().toUpperCase();
        return rawLocUpper === targetAisleUpper ||
               rawLocUpper.startsWith(targetAisleUpper + '-') ||
               rawLocUpper.startsWith(targetAisleUpper + '/') ||
               rawLocUpper.startsWith(targetAisleUpper + '_') ||
               rawLocUpper.startsWith(targetAisleUpper + ' ');
    });

    const occupiedSlots = itemsInAisle.length;

    let maxFoundBay = 0;
    itemsInAisle.forEach(item => {
        const parsed = parseLocationComponents(item.location);
        const bayNum = parseInt(parsed.bay, 10);
        if (!isNaN(bayNum) && bayNum > maxFoundBay) {
            maxFoundBay = bayNum;
        }
    });

    const configuredCapacity = configuredBays * configuredShelves * configuredSlots;
    const totalCapacity = configuredCapacity;
    const densityInfo = getDensityInfo(occupiedSlots, totalCapacity);

    return {
        totalCapacity,
        configuredCapacity,
        occupiedSlots,
        availableSlots: Math.max(0, totalCapacity - occupiedSlots),
        occupancyRate: densityInfo.rate,
        rawOccupancyRate: densityInfo.rawRate,
        baysCount: configuredBays,
        maxFoundBay,
        shelvesCount: configuredShelves,
        slotsCount: configuredSlots,
        itemsList: itemsInAisle,
        densityInfo
    };
}

// -------------------------------------------------------------------------
// 2. หมวดที่ 1: Dashboard ภาพรวมคลังสินค้า และแถบเลือก Zone/Aisle
// -------------------------------------------------------------------------
function renderDrillDownAisleBar() {
    const container = document.getElementById('aisleFilterBar');
    if (!container) return;

    const aisles = getAllConfiguredAisles();

    if (aisles.length > 0 && (!activeLocationAisle || !aisles.includes(activeLocationAisle))) {
        activeLocationAisle = aisles[0];
    }

    let totalWhCapacity = 0;
    let totalWhOccupied = 0;
    aisles.forEach(a => {
        const st = getAisleOccupancyStats(a);
        totalWhCapacity += st.totalCapacity;
        totalWhOccupied += st.occupiedSlots;
    });
    const whDensity = getDensityInfo(totalWhOccupied, totalWhCapacity);

    let html = `
        <div class="wh-fullscreen-card">
            <div style="display: flex; align-items: center; justify-content: space-between; flex-wrap: wrap; gap: 16px; margin-bottom: 18px;">
                <div style="display: flex; align-items: center; gap: 14px; min-width: 280px; max-width: 100%;">
                    <div style="width: 52px; height: 52px; border-radius: 16px; background: linear-gradient(135deg, var(--primary, #2563eb) 0%, #4f46e5 100%); color: #ffffff; display: flex; align-items: center; justify-content: center; font-size: 1.45rem; flex-shrink: 0; box-shadow: 0 6px 20px rgba(37, 99, 235, 0.35);">
                        <i class="fa-solid fa-warehouse"></i>
                    </div>
                    <div style="min-width: 0;">
                        <div style="font-size: 1.12rem; font-weight: 800; color: var(--text-main, #0f172a); display: flex; align-items: center; gap: 10px; flex-wrap: wrap;">
                            <span>ผังพิกัดคลังสินค้า & ความหนาแน่นพื้นที่</span>
                            <span style="font-size: 0.75rem; padding: 4px 12px; border-radius: 20px; font-weight: 800; background: ${whDensity.badgeBg}; color: ${whDensity.badgeColor}; border: 1px solid ${whDensity.badgeColor}33; white-space: nowrap;">
                                ${whDensity.statusIcon} ${whDensity.statusText}
                            </span>
                        </div>
                        <div style="font-size: 0.85rem; color: var(--text-muted, #64748b); margin-top: 3px;">
                            จัดเก็บแล้ว <strong style="color:var(--primary,#2563eb);">${totalWhOccupied.toLocaleString()}</strong> รายการ / ความจุรวม <strong>${totalWhCapacity.toLocaleString()}</strong> ช่อง (ว่าง ${whDensity.available.toLocaleString()} ช่อง)
                        </div>
                    </div>
                </div>

                <div style="min-width: 220px; flex: 1; max-width: 360px;">
                    <div style="display: flex; justify-content: space-between; font-size: 0.82rem; font-weight: 700; color: var(--text-sub, #334155); margin-bottom: 6px;">
                        <span>ความหนาแน่นรวมทั้งคลัง</span>
                        <span class="mono font-bold" style="color:var(--primary,#2563eb);">${whDensity.rawRate}%</span>
                    </div>
                    <div style="width: 100%; height: 12px; background: var(--bg-subtle, #f1f5f9); border-radius: 12px; overflow: hidden; border: 1px solid var(--border-color, #cbd5e1);">
                        <div style="width: ${whDensity.rate}%; height: 100%; background: ${whDensity.barGradient}; border-radius: 12px; transition: width 0.4s ease;"></div>
                    </div>
                </div>
            </div>

            <div style="display: flex; align-items: center; flex-wrap: wrap; gap: 10px; padding-top: 14px; border-top: 1px dashed var(--border-color, #e2e8f0);">
    `;

    aisles.forEach(aisle => {
        const stats = getAisleOccupancyStats(aisle);
        const isActive = (aisle === activeLocationAisle);
        const den = stats.densityInfo;

        html += `
            <button type="button" class="wh-aisle-pill ${isActive ? 'active' : ''}" onclick="selectLocationAisle('${escapeHTML(aisle)}')">
                <i class="fa-solid fa-layer-group" style="font-size: 0.9rem;"></i>
                <span>แถว/โซน ${escapeHTML(aisle)}</span>
                <span style="
                    font-size: 0.72rem; 
                    padding: 2px 9px; 
                    border-radius: 12px; 
                    background: ${isActive ? 'rgba(255,255,255,0.25)' : den.badgeBg}; 
                    color: ${isActive ? '#ffffff' : den.badgeColor}; 
                    font-weight: 800;
                ">
                    ${stats.occupiedSlots}/${stats.totalCapacity}
                </span>
            </button>
        `;
    });

    html += `
            </div>
        </div>
    `;
    container.innerHTML = html;
}

function selectLocationAisle(aisleName) {
    activeLocationAisle = aisleName;
    activeLocationBay = 'ALL';
    aisleSnSearchQuery = '';
    currentBayPage = 1;
    bayFilterQuery = '';
    renderDrillDownAisleBar();
    renderDrillDownBaysGrid();
    renderDrillDownSlotsGrid();
}

function setBayDisplayMode(mode) {
    if (['CONFIGURED', 'OCCUPIED', 'ALL'].includes(mode)) {
        bayDisplayMode = mode;
        currentBayPage = 1;
        renderDrillDownBaysGrid();
    }
}

// -------------------------------------------------------------------------
// 3. หมวดที่ 2: เลือกล็อกจัดเก็บ (Full-Screen Responsive Bays Grid)
// -------------------------------------------------------------------------
function renderDrillDownBaysGrid() {
    const container = document.getElementById('baysGridContainer');
    if (!container) return;

    if (!activeLocationAisle) {
        container.innerHTML = '';
        const capacityTextElem = document.getElementById('bayCapacityInfoText');
        if (capacityTextElem) capacityTextElem.innerHTML = '';
        return;
    }

    if (['DOCK', 'OFFICE', 'PENDING', 'FOOD', 'FREEZER', 'COLD', 'DRY', 'RAW'].includes(activeLocationAisle)) {
        container.innerHTML = `<div style="grid-column:1/-1; padding:18px; font-size:0.95rem; font-weight:700; color:var(--text-sub,#334155); background:var(--bg-surface,#ffffff); border-radius:16px; border:1px solid var(--border-color,#e2e8f0); width:100%; box-sizing:border-box;">📍 โซนพื้นที่ ${escapeHTML(activeLocationAisle)} เป็นพื้นที่ส่วนกลาง (ไม่แบ่งล็อกย่อย)</div>`;
        return;
    }

    const stats = getAisleOccupancyStats(activeLocationAisle);
    const den = stats.densityInfo;

    const capacityTextElem = document.getElementById('bayCapacityInfoText');
    if (capacityTextElem) {
        capacityTextElem.innerHTML = `
            <div style="font-size: 0.9rem; color: var(--text-sub, #334155); padding: 4px 0; display: flex; align-items: center; justify-content: space-between; flex-wrap: wrap; gap: 10px;">
                <span>
                    📦 <strong>พิกัดแถว ${escapeHTML(activeLocationAisle)}</strong> (ตั้งค่าไว้: ${stats.baysCount} ล็อก • ${stats.shelvesCount} ชั้น • ${stats.slotsCount} ช่อง) : สินค้าจัดเก็บแล้ว <strong style="color:var(--primary,#2563eb);">${stats.occupiedSlots}</strong> รายการ
                </span>
                <span style="font-weight: 800; color: ${den.badgeColor}; background: ${den.badgeBg}; padding: 4px 14px; border-radius: 14px; font-size: 0.82rem;">
                    ${den.statusIcon} ความหนาแน่น: ${den.rawRate}% (${stats.occupiedSlots}/${stats.totalCapacity})
                </span>
            </div>
        `;
    }

    const baysToDisplaySet = new Set();

    if (bayDisplayMode === 'CONFIGURED') {
        for (let b = 1; b <= stats.baysCount; b++) {
            baysToDisplaySet.add(String(b).padStart(2, '0'));
        }
        stats.itemsList.forEach(i => {
            const parsed = parseLocationComponents(i.location);
            const bayNum = parseInt(parsed.bay, 10);
            if (!isNaN(bayNum) && bayNum > stats.baysCount) {
                baysToDisplaySet.add(String(bayNum).padStart(2, '0'));
            }
        });
    } else if (bayDisplayMode === 'OCCUPIED') {
        stats.itemsList.forEach(i => {
            const parsed = parseLocationComponents(i.location);
            const bayNum = parseInt(parsed.bay, 10);
            if (!isNaN(bayNum) && bayNum > 0) {
                baysToDisplaySet.add(String(bayNum).padStart(2, '0'));
            }
        });
    } else {
        const maxBay = Math.max(stats.baysCount, stats.maxFoundBay || 0);
        for (let b = 1; b <= maxBay; b++) {
            baysToDisplaySet.add(String(b).padStart(2, '0'));
        }
    }

    let sortedBays = Array.from(baysToDisplaySet)
        .filter(bStr => !isNaN(parseInt(bStr, 10)) && parseInt(bStr, 10) > 0)
        .sort((a, b) => parseInt(a, 10) - parseInt(b, 10));

    if (bayFilterQuery.trim() !== '') {
        const q = bayFilterQuery.trim();
        sortedBays = sortedBays.filter(bStr => bStr.includes(q) || parseInt(bStr, 10) === parseInt(q, 10));
    }

    const totalBaysCount = sortedBays.length;
    const totalPages = Math.ceil(totalBaysCount / BAYS_PER_PAGE) || 1;
    if (currentBayPage > totalPages) currentBayPage = totalPages;

    const startIndex = (currentBayPage - 1) * BAYS_PER_PAGE;
    const pageBays = sortedBays.slice(startIndex, startIndex + BAYS_PER_PAGE);

    let html = `
        <div class="wh-bays-fullscreen-wrapper">
            <div style="display: flex; align-items: center; justify-content: space-between; gap: 14px; flex-wrap: wrap; margin-bottom: 16px;">
                <div style="display: flex; align-items: center; gap: 10px; flex-wrap: wrap;">
                    <span style="font-size: 0.95rem; font-weight: 800; color: var(--text-main, #0f172a); display: flex; align-items: center; gap: 6px; margin-right: 4px;">
                        <i class="fa-solid fa-cubes" style="color: var(--primary, #2563eb);"></i> หมวดเลือกล็อกจัดเก็บ:
                    </span>

                    <button type="button" class="btn btn-sm ${activeLocationBay === 'ALL' ? 'btn-primary' : 'btn-secondary'}" onclick="selectLocationBay('ALL')" style="font-size: 0.85rem; padding: 7px 18px; border-radius: 12px; font-weight: 800;">
                        🌐 แถว ${escapeHTML(activeLocationAisle)} รวมทุกล็อก (${stats.occupiedSlots} รายการ)
                    </button>

                    <div style="display: inline-flex; background: var(--bg-subtle, #f1f5f9); border: 1px solid var(--border-color, #cbd5e1); border-radius: 12px; padding: 3px; gap: 3px;">
                        <button type="button" onclick="setBayDisplayMode('CONFIGURED')" style="
                            font-size: 0.78rem; padding: 6px 14px; border-radius: 9px; border: none; cursor: pointer; font-weight: 800; transition: all 0.15s ease;
                            background: ${bayDisplayMode === 'CONFIGURED' ? 'var(--primary, #2563eb)' : 'transparent'};
                            color: ${bayDisplayMode === 'CONFIGURED' ? '#ffffff' : 'var(--text-sub, #475569)'};
                        ">🎯 ตามตั้งค่า (${stats.baysCount})</button>
                        <button type="button" onclick="setBayDisplayMode('OCCUPIED')" style="
                            font-size: 0.78rem; padding: 6px 14px; border-radius: 9px; border: none; cursor: pointer; font-weight: 800; transition: all 0.15s ease;
                            background: ${bayDisplayMode === 'OCCUPIED' ? 'var(--primary, #2563eb)' : 'transparent'};
                            color: ${bayDisplayMode === 'OCCUPIED' ? '#ffffff' : 'var(--text-sub, #475569)'};
                        ">📦 เฉพาะที่มีสินค้า</button>
                    </div>
                </div>

                <div style="display: flex; align-items: center; gap: 10px; flex-wrap: wrap;">
                    <input type="text" class="form-control" placeholder="🔢 กรองเลขล็อก..." value="${escapeHTML(bayFilterQuery)}" oninput="onBayFilterInput(this.value)" style="padding: 7px 14px; font-size: 0.88rem; width: 140px; border-radius: 10px;">
                    <input type="text" class="form-control" placeholder="🔍 ค้นหา S/N, ชื่อสินค้า..." value="${escapeHTML(aisleSnSearchQuery)}" oninput="onAisleSnSearchInput(this.value)" style="padding: 7px 14px; font-size: 0.88rem; width: 220px; border-radius: 10px;">
                </div>
            </div>

            <!-- Full-Screen Responsive Bays Chip Grid -->
            <div class="wh-bay-grid-responsive">
    `;

    if (pageBays.length === 0) {
        html += `<div style="grid-column: 1 / -1; text-align: center; padding: 24px; color: var(--text-muted, #64748b); font-size: 0.9rem;">ไม่พบล็อกย่อยตรงตามเงื่อนไข</div>`;
    }

    pageBays.forEach(bayStr => {
        const isSelected = (activeLocationBay === bayStr);
        const bayNum = parseInt(bayStr, 10);

        const itemsInBay = stats.itemsList.filter(i => {
            const parsed = parseLocationComponents(i.location);
            return parsed.bay === bayStr || parseInt(parsed.bay, 10) === bayNum;
        }).length;

        html += `
            <div class="wh-bay-chip-card ${isSelected ? 'active' : ''}" onclick="selectLocationBay('${bayStr}')">
                <div style="display:flex; justify-content:space-between; align-items:center; gap:6px;">
                    <span class="mono font-bold" style="font-size:0.9rem;">ล็อก ${bayStr}</span>
                    <span style="
                        font-size: 0.72rem; padding: 2px 7px; border-radius: 6px; font-weight:800;
                        background: ${isSelected ? 'rgba(255,255,255,0.25)' : 'var(--bg-subtle, #f1f5f9)'};
                        color: ${isSelected ? '#ffffff' : 'var(--primary, #2563eb)'};
                    ">${itemsInBay}</span>
                </div>
                <div style="height:4px; width:100%; background:rgba(0,0,0,0.08); border-radius:4px; overflow:hidden;">
                    <div style="width:${Math.min(itemsInBay * 10, 100)}%; height:100%; background:${isSelected ? '#ffffff' : 'var(--success, #10b981)'}; transition:width 0.3s ease;"></div>
                </div>
            </div>
        `;
    });

    html += `</div>`;

    if (totalPages > 1) {
        html += `
            <div style="display: flex; align-items: center; justify-content: space-between; margin-top: 14px; font-size: 0.85rem; color: var(--text-muted, #64748b);">
                <span>แสดงล็อก ${pageBays[0] || '01'} - ${pageBays[pageBays.length - 1] || '01'} จากทั้งหมด ${totalBaysCount} ล็อก</span>
                <div style="display: flex; gap: 6px; align-items: center;">
                    <button type="button" class="btn btn-sm btn-secondary" onclick="changeBayPage(${currentBayPage - 1})" ${currentBayPage === 1 ? 'disabled style="opacity:0.4;"' : ''}>◀ ก่อนหน้า</button>
                    <span style="padding: 2px 10px; font-weight:800; color:var(--text-main,#0f172a);">หน้า ${currentBayPage} / ${totalPages}</span>
                    <button type="button" class="btn btn-sm btn-secondary" onclick="changeBayPage(${currentBayPage + 1})" ${currentBayPage === totalPages ? 'disabled style="opacity:0.4;"' : ''}>ถัดไป ▶</button>
                </div>
            </div>
        `;
    }

    html += `</div>`;
    container.innerHTML = html;
}

function selectLocationBay(bayStr) {
    activeLocationBay = bayStr;
    renderDrillDownBaysGrid();
    renderDrillDownSlotsGrid();
}

function changeBayPage(page) {
    currentBayPage = parseInt(page, 10) || 1;
    renderDrillDownBaysGrid();
}

function onBayFilterInput(val) {
    bayFilterQuery = val;
    currentBayPage = 1;
    renderDrillDownBaysGrid();
}

function onAisleSnSearchInput(val) {
    aisleSnSearchQuery = val;
    renderDrillDownSlotsGrid();
}

// -------------------------------------------------------------------------
// 4. หมวดที่ 3: รายการ SN จัดเก็บจริงในพื้นที่ทั้งหมด (Full-Screen Real Storage Table)
// -------------------------------------------------------------------------
function renderRackVisualizerMatrix(aisle, targetBay, itemsList) {
    const config = getAisleConfig(aisle);
    const totalShelves = Math.max(1, parseInt(config.shelves || config.shelf, 10) || 1);
    const totalSlots = Math.max(1, parseInt(config.slots || config.slot, 10) || 10);

    const itemSlotMap = new Map();
    (itemsList || []).forEach(item => {
        const parsed = parseLocationComponents(item.location);
        const key = `${parsed.bay}-${parsed.shelf}-${parsed.slot}`;
        if (!itemSlotMap.has(key)) itemSlotMap.set(key, []);
        itemSlotMap.get(key).push(item);
    });

    const bayToShow = (targetBay && targetBay !== 'ALL') ? targetBay : '01';

    let matrixHtml = `
        <div class="rack-matrix-card-full">
            <div style="display: flex; justify-content: space-between; align-items: center; margin-bottom: 14px; flex-wrap: wrap; gap: 10px;">
                <div style="font-weight: 800; font-size: 1rem; color: var(--text-main, #0f172a); display: flex; align-items: center; gap: 8px;">
                    <i class="fa-solid fa-table-cells-large" style="color: var(--primary, #2563eb);"></i> ผังจำลองพิกัดช่องจัดเก็บแร็ค (Rack Layout Matrix)
                </div>
                <div style="font-size: 0.82rem; color: var(--text-muted, #64748b); font-weight: 600;">
                    พิกัด: <strong style="color:var(--primary,#2563eb);">แถว ${escapeHTML(aisle)} (ล็อก ${escapeHTML(bayToShow)})</strong> • โครงสร้าง: ${totalShelves} ชั้น × ${totalSlots} ช่อง
                </div>
            </div>

            <div style="background: var(--bg-subtle, #f8fafc); padding: 18px; border-radius: 14px; border: 1px solid var(--border-color, #cbd5e1); overflow-x: auto; width: 100%; box-sizing: border-box;">
                <div style="display: flex; flex-direction: column; gap: 12px; min-width: max-content;">
    `;

    for (let sh = totalShelves; sh >= 1; sh--) {
        matrixHtml += `
            <div style="display: flex; align-items: center; gap: 12px;">
                <div style="width: 85px; font-size: 0.82rem; font-weight: 800; color: var(--text-sub, #475569); display: flex; align-items: center; justify-content: center; background: var(--bg-surface, #ffffff); border: 1px solid var(--border-color, #cbd5e1); border-radius: 10px; padding: 10px 6px; flex-shrink: 0; box-shadow: 0 2px 4px rgba(0,0,0,0.02);">
                    ชั้น L${sh}
                </div>
                <div style="display: flex; gap: 10px;">
        `;

        for (let sl = 1; sl <= totalSlots; sl++) {
            const slotStr = String(sl).padStart(2, '0');
            const slotKey = `${bayToShow}-${sh}-${slotStr}`;
            const slotItems = itemSlotMap.get(slotKey) || [];
            const locCode = `${aisle}-${bayToShow}-${sh}-${slotStr}`;

            if (slotItems.length > 0) {
                const firstSn = slotItems[0].sn;
                matrixHtml += `
                    <div class="rack-slot-box-full" onclick="inspectSlotItemDetail('${escapeHTML(firstSn)}')" style="
                        background: rgba(37, 99, 235, 0.08); border: 1.5px solid var(--primary, #2563eb); color: var(--primary, #2563eb);
                        box-shadow: 0 2px 6px rgba(37,99,235,0.1);
                    " title="พิกัด ${locCode}\nS/N: ${escapeHTML(firstSn)}">
                        <div style="font-weight: 800; font-family: monospace;">S${slotStr}</div>
                        <div style="font-size: 0.72rem; font-weight: 800; background: var(--primary, #2563eb); color: #ffffff; border-radius: 6px; margin-top: 5px; padding: 3px 6px; overflow: hidden; text-overflow: ellipsis; white-space: nowrap;">
                            ${slotItems.length > 1 ? slotItems.length + ' รายการ' : escapeHTML(firstSn)}
                        </div>
                    </div>
                `;
            } else {
                matrixHtml += `
                    <div class="rack-slot-box-full" style="
                        background: var(--bg-surface, #ffffff); border: 1.5px dashed var(--border-color, #cbd5e1); color: var(--text-muted, #94a3b8);
                    " title="พิกัดว่าง ${locCode}">
                        <div style="font-weight: 700; font-family: monospace;">S${slotStr}</div>
                        <div style="font-size: 0.72rem; color: #10b981; font-weight: 800; margin-top: 5px;">✨ ว่าง</div>
                    </div>
                `;
            }
        }

        matrixHtml += `
                </div>
            </div>
        `;
    }

    matrixHtml += `
                </div>
            </div>
        </div>
    `;

    return matrixHtml;
}

// 🟢 ฟังก์ชันลบรายการสินค้าทั้งหมดตามขอบเขต (ทั้งแถว หรือ เฉพาะล็อก)
async function triggerDeleteAllInCurrentScope() {
    if (!activeLocationAisle) return;

    const inventory = (typeof globalInventoryData !== 'undefined' && Array.isArray(globalInventoryData)) ? globalInventoryData : [];
    const isAdmin = (typeof currentUser !== 'undefined' && currentUser && currentUser.role === 'admin');

    const isAllBays = (activeLocationBay === 'ALL');
    const targetBayText = isAllBays ? `ทั้งแถว ${activeLocationAisle}` : `แถว ${activeLocationAisle} ล็อก ${activeLocationBay}`;

    // กรองหาพิกัดสินค้าที่จะโดนลบ
    const targetItems = inventory.filter(i => {
        if (!i || !i.location) return false;
        const parsed = parseLocationComponents(i.location);
        if (parsed.aisle.toUpperCase() !== activeLocationAisle.toUpperCase()) return false;
        if (!isAllBays) {
            return parsed.bay === activeLocationBay || parseInt(parsed.bay, 10) === parseInt(activeLocationBay, 10);
        }
        return true;
    });

    if (targetItems.length === 0) {
        if (typeof showToast === 'function') showToast(`⚠️ ไม่พบสินค้าให้ลบใน${targetBayText}`, true);
        return;
    }

    const confirmMsg = `⚠️ คำเตือนความปลอดภัยสูงสุด!\n\nคุณแน่ใจหรือไม่ว่าต้องการ${isAdmin ? 'ลบสินค้าทั้งหมด' : 'ส่งคำขอลบสินค้าทั้งหมด'}ใน ${targetBayText} จำนวน ${targetItems.length} รายการ?\n\nการดำเนินการนี้จะลบข้อมูลออกจากระบบทันที!`;

    if (!confirm(confirmMsg)) return;

    const targetSns = targetItems.map(i => i.sn).filter(Boolean);

    if (isAdmin) {
        const client = typeof getSupabaseClient === 'function' ? getSupabaseClient() : (typeof _supabase !== 'undefined' ? _supabase : null);
        if (client && targetSns.length > 0) {
            try {
                await client.from('warehouse_items').delete().in('sn', targetSns);
            } catch (err) {
                console.error("Bulk Delete Supabase Error:", err);
            }
        }

        // ลบออกจาก globalInventoryData ในเครื่อง
        for (let idx = inventory.length - 1; idx >= 0; idx--) {
            if (inventory[idx] && targetSns.includes(inventory[idx].sn)) {
                inventory.splice(idx, 1);
            }
        }

        if (typeof updateKPIs === 'function') updateKPIs();
        if (typeof filterInventoryData === 'function') filterInventoryData();
        if (typeof showToast === 'function') showToast(`🗑️ ลบสินค้าทั้งหมดใน ${targetBayText} (${targetItems.length} รายการ) เรียบร้อยแล้ว`);
    } else {
        if (typeof showToast === 'function') showToast(`📩 ส่งคำขออนุมัติลบสินค้าทั้งหมดใน ${targetBayText} (${targetItems.length} รายการ) เรียบร้อยแล้ว`);
    }

    refreshLocationVisualizerIfActive();
}

// 📌 แสดงผลรายการ SN จัดเก็บจริงในพื้นที่ทั้งหมด เต็มหน้าจอ วางเรียงลงด้านล่างผังจำลองแร็ค 100%
function renderDrillDownSlotsGrid() {
    const container = document.getElementById('rackSlotsGrid');
    if (!container) return;

    if (!activeLocationAisle) {
        container.innerHTML = `
            <div style="background: var(--bg-surface, #ffffff); border: 2px dashed var(--border-strong, #cbd5e1); border-radius: 18px; padding: 60px 20px; text-align: center; color: var(--text-muted, #64748b); width: 100%; box-sizing: border-box;">
                <i class="fa-solid fa-hand-pointer" style="font-size: 3rem; color: var(--primary, #2563eb); margin-bottom: 14px;"></i>
                <div style="font-size: 1.2rem; font-weight: 800; color: var(--text-main, #0f172a);">กรุณาเลือกแถวพิกัดจัดเก็บสินค้าด้านบน</div>
                <div style="font-size: 0.9rem; margin-top: 4px;">เพื่อเปิดดูตารางรายการสินค้าและซีเรียลทั้งหมดแบบ Full-Screen 100%</div>
            </div>
        `;
        return;
    }

    const inventory = (typeof globalInventoryData !== 'undefined' && Array.isArray(globalInventoryData)) ? globalInventoryData : [];

    if (['DOCK', 'OFFICE', 'PENDING', 'FOOD', 'FREEZER', 'COLD', 'DRY', 'RAW'].includes(activeLocationAisle)) {
        const specialItems = inventory.filter(i => (i.location || '').toUpperCase() === activeLocationAisle);
        renderSpecialZoneView(container, activeLocationAisle, specialItems);
        return;
    }

    const stats = getAisleOccupancyStats(activeLocationAisle);
    let items = stats.itemsList || [];

    if (aisleSnSearchQuery.trim() !== '') {
        const q = aisleSnSearchQuery.toLowerCase().trim();
        items = items.filter(i => 
            (i.sn && String(i.sn).toLowerCase().includes(q)) ||
            (i.category && String(i.category).toLowerCase().includes(q)) ||
            (i.name && String(i.name).toLowerCase().includes(q)) ||
            (i.location && String(i.location).toLowerCase().includes(q)) ||
            (i.receiver && String(i.receiver).toLowerCase().includes(q)) ||
            (i.created_by && String(i.created_by).toLowerCase().includes(q))
        );
    }

    if (activeLocationBay !== 'ALL') {
        items = items.filter(i => {
            const parsed = parseLocationComponents(i.location);
            return parsed.bay === activeLocationBay || parseInt(parsed.bay, 10) === parseInt(activeLocationBay, 10);
        });
    }

    const titleText = (activeLocationBay === 'ALL')
        ? `แถว ${escapeHTML(activeLocationAisle)} รวมทุกล็อก`
        : `แถว ${escapeHTML(activeLocationAisle)} (เฉพาะล็อก ${escapeHTML(activeLocationBay)})`;

    const deleteScopeText = (activeLocationBay === 'ALL')
        ? `ลบสินค้าทั้งหมดในแถว ${escapeHTML(activeLocationAisle)}`
        : `ลบสินค้าทั้งหมดในล็อก ${escapeHTML(activeLocationBay)}`;

    const isAdmin = (typeof currentUser !== 'undefined' && currentUser && currentUser.role === 'admin');

    // 1. สร้างส่วนผังจำลองช่องแร็ค (วางไว้ด้านบน)
    const matrixHtml = renderRackVisualizerMatrix(activeLocationAisle, activeLocationBay, stats.itemsList);

    // 2. สร้างส่วนหมวดรายการ SN จัดเก็บจริง (วางไว้ด้านล่าง ต่อลงมาเต็มหน้าจอ 100%)
    let tableOrEmptyHtml = '';
    if (items.length === 0) {
        tableOrEmptyHtml = `
            <div style="padding: 40px 20px; text-align: center; color: var(--text-muted, #64748b); background: var(--bg-surface, #ffffff); border-radius: 18px; border: 1px solid var(--border-color, #e2e8f0); width: 100%; box-sizing: border-box;">
                <i class="fa-solid fa-box-open" style="font-size: 2.6rem; margin-bottom: 12px; color: var(--text-muted, #94a3b8);"></i><br>
                <span style="font-weight: 800; font-size: 1.05rem; color: var(--text-main, #0f172a);">
                    ${aisleSnSearchQuery ? 'ไม่พบรายการที่ตรงกับคำค้นหา' : `ไม่มีรายการสินค้าจัดเก็บใน ${titleText} (ยอดจัดเก็บเป็น 0 - ช่องจัดเก็บว่างทุกล็อก)`}
                </span>
            </div>
        `;
    } else {
        tableOrEmptyHtml = `
            <div class="wh-full-table-card">
                <div class="wh-table-header-bar">
                    <div style="display: flex; align-items: center; gap: 12px; flex-wrap: wrap;">
                        <span style="font-weight: 800; font-size: 1.1rem; color: var(--primary, #2563eb); display: flex; align-items: center; gap: 8px;">
                            <i class="fa-solid fa-list-check"></i> หมวดรายการ SN จัดเก็บจริงในพื้นที่ทั้งหมด (${titleText})
                        </span>
                        <span style="font-size: 0.82rem; font-weight: 800; color: #059669; background: rgba(16, 185, 129, 0.12); padding: 4px 14px; border-radius: 20px; border: 1px solid rgba(16, 185, 129, 0.25);">
                            📦 รวมทั้งสิ้น ${items.length} รายการ
                        </span>
                    </div>

                    <div style="display: flex; align-items: center; gap: 10px; flex-wrap: wrap;">
                        <button type="button" class="btn btn-sm btn-danger" onclick="triggerDeleteAllInCurrentScope()" style="font-size: 0.8rem; padding: 6px 14px; border-radius: 10px; font-weight: 800; display: inline-flex; align-items: center; gap: 6px; box-shadow: 0 2px 8px rgba(239, 68, 68, 0.25);">
                            <i class="fa-solid fa-trash-can"></i> ${deleteScopeText}
                        </button>
                        <span style="font-size: 0.82rem; color: var(--text-sub, #475569); font-weight: 700; background: var(--bg-surface, #ffffff); padding: 5px 14px; border-radius: 20px; border: 1px solid var(--border-color, #e2e8f0);">
                            ⚡ แสดงผลแบบ Full-Screen 100%
                        </span>
                    </div>
                </div>
                ${renderSingleBayTableHtml(items, isAdmin)}
            </div>
        `;
    }

    container.innerHTML = matrixHtml + tableOrEmptyHtml;
}

function renderSpecialZoneView(container, zoneName, items) {
    const isAdmin = (typeof currentUser !== 'undefined' && currentUser && currentUser.role === 'admin');
    container.innerHTML = `
        <div class="wh-full-table-card">
            <div class="wh-table-header-bar" style="background: linear-gradient(135deg, #fff7ed 0%, #ffedd5 100%); border-bottom: 1px solid #fed7aa;">
                <span style="font-weight: 800; font-size: 1.05rem; color: #c2410c; display: flex; align-items: center; gap: 8px;">
                    <i class="fa-solid fa-truck-ramp-box"></i> โซนจัดเก็บ ${escapeHTML(zoneName)} (รวมทั้งสิ้น ${items.length} รายการ)
                </span>
                ${items.length > 0 ? `
                    <button type="button" class="btn btn-sm btn-danger" onclick="triggerDeleteAllInCurrentScope()" style="font-size: 0.8rem; padding: 6px 14px; border-radius: 10px; font-weight: 800; display: inline-flex; align-items: center; gap: 6px;">
                        <i class="fa-solid fa-trash-can"></i> ลบสินค้าทั้งหมดในโซน ${escapeHTML(zoneName)}
                    </button>
                ` : ''}
            </div>
            ${renderSingleBayTableHtml(items, isAdmin)}
        </div>
    `;
}

function renderSingleBayTableHtml(itemsList, isAdmin) {
    let listHtml = `
        <div style="overflow-x: auto; width: 100%; margin: 0; padding: 0;">
            <table class="wh-modern-fullscreen-table">
                <thead>
                    <tr>
                        <th style="width: 60px; text-align: center;">ลำดับ</th>
                        <th style="white-space: nowrap;">หมายเลขซีเรียล / รหัสสินค้า</th>
                        <th style="width: 160px; white-space: nowrap;">พิกัดจัดเก็บ</th>
                        <th>หมวดหมู่ / รายละเอียดสินค้า</th>
                        <th style="white-space: nowrap;">จำนวน / มิเตอร์</th>
                        <th style="white-space: nowrap;">ผู้บันทึกรับเข้า</th>
                        <th style="text-align: center; width: 190px; white-space: nowrap;">การจัดการ</th>
                    </tr>
                </thead>
                <tbody>
    `;

    itemsList.forEach((item, idx) => {
        const safeSn = escapeHTML(item.sn || '-');
        const safeCategory = escapeHTML(item.category || '-');
        const safeName = escapeHTML(item.name || '-');
        const locTag = escapeHTML(formatCompactLocationTag(item.location));
        const receiver = escapeHTML(item.receiver || item.created_by || item.received_by || '-');
        const meterVal = Number(item.meter || 0).toLocaleString();

        listHtml += `
            <tr>
                <td style="text-align: center;" class="mono font-bold">${idx + 1}</td>
                <td style="white-space: nowrap;">
                    <div style="display: flex; align-items: center; gap: 8px;">
                        <span class="sn-code-badge">${safeSn}</span>
                        <button type="button" class="btn btn-sm btn-secondary" style="padding: 4px 9px; font-size: 0.75rem; border-radius: 8px;" onclick="copyTextToClipboard('${safeSn}', 'รหัส/SN')" title="คัดลอก S/N">
                            <i class="fa-solid fa-copy"></i>
                        </button>
                    </div>
                </td>
                <td style="white-space: nowrap;">
                    <span class="badge-location-tag">
                        📍 ${locTag}
                    </span>
                </td>
                <td>
                    <div style="font-size: 0.9rem; font-weight: 700; color: var(--text-main, #0f172a); max-width: 480px; display: -webkit-box; -webkit-line-clamp: 2; -webkit-box-orient: vertical; overflow: hidden; line-height: 1.4;" title="[${safeCategory}] ${safeName}">
                        <span style="color: var(--primary, #2563eb); font-family: var(--font-mono, monospace); font-weight: 800;">[${safeCategory}]</span> ${safeName}
                    </div>
                </td>
                <td style="white-space: nowrap;">
                    <span class="mono font-bold" style="color: var(--warning, #d97706); font-size: 0.9rem; background: rgba(217,119,6,0.08); padding: 4px 12px; border-radius: 8px; border: 1px solid rgba(217,119,6,0.2);">
                        📟 ${meterVal}
                    </span>
                </td>
                <td style="font-size: 0.85rem; color: var(--text-sub, #475569); max-width: 180px; overflow: hidden; text-overflow: ellipsis; white-space: nowrap;" title="${receiver}">
                    👤 ${receiver}
                </td>
                <td style="text-align: center; white-space: nowrap;">
                    <div class="action-btn-group">
                        <button type="button" class="btn btn-sm btn-secondary" onclick="inspectSlotItemDetail('${safeSn}')" title="ตรวจสอบรายละเอียด"><i class="fa-solid fa-eye"></i></button>
                        <button type="button" class="btn btn-sm btn-secondary" onclick="triggerEditItemFromSlot('${safeSn}')" title="แก้ไขข้อมูล"><i class="fa-solid fa-pen-to-square"></i></button>
                        <button type="button" class="btn btn-sm btn-secondary" onclick="triggerRelocateFromSlot('${safeSn}')" title="ย้ายพิกัด"><i class="fa-solid fa-right-left"></i></button>
                        <button type="button" class="btn btn-sm btn-secondary" onclick="triggerPrintPdfBarcodeAction('${safeSn}')" title="พิมพ์บาร์โค้ด"><i class="fa-solid fa-print"></i></button>
                        <button type="button" class="btn btn-sm ${isAdmin ? 'btn-danger' : 'btn-warning'}" onclick="triggerDeleteFromSlot('${safeSn}')" title="${isAdmin ? 'ลบสินค้า' : 'ส่งคำขออนุมัติลบ'}">
                            <i class="fa-solid fa-trash"></i>
                        </button>
                    </div>
                </td>
            </tr>
        `;
    });

    listHtml += `
                </tbody>
            </table>
        </div>
    `;
    return listHtml;
}

function renderSlotCard(container, slotTitle, items, isDockFull = false) {
    if (!container) return;
    const isAdmin = (typeof currentUser !== 'undefined' && currentUser && currentUser.role === 'admin');
    const wrapper = document.createElement('div');
    wrapper.className = 'wh-full-table-card';
    wrapper.style.marginBottom = '16px';
    wrapper.innerHTML = `
        <div class="wh-table-header-bar">
            <strong class="mono" style="font-size:1rem; color:var(--text-main,#0f172a);">📍 ${escapeHTML(formatCompactLocationTag(slotTitle))}</strong>
            <span class="mono" style="font-size:0.82rem; font-weight:800; color:var(--success,#10b981); background:var(--bg-subtle,#f1f5f9); padding:4px 12px; border-radius:14px;">
                ${items.length} รายการ
            </span>
        </div>
        ${renderSingleBayTableHtml(items, isAdmin)}
    `;
    container.appendChild(wrapper);
}

// -------------------------------------------------------------------------
// 5. Inspect Modal ป๊อปอัพตรวจสอบข้อมูลสินค้า (แก้ไขปุ่มกากบาทกดปิดได้อย่างสมบูรณ์)
// -------------------------------------------------------------------------
function closeSlotItemInspectModal() {
    const modal = document.getElementById('slotItemInspectModal');
    if (modal) {
        modal.style.display = 'none';
        modal.classList.remove('active', 'show');
    }
}

function inspectSlotItemDetail(sn) {
    const inventory = (typeof globalInventoryData !== 'undefined' && Array.isArray(globalInventoryData)) ? globalInventoryData : [];
    const item = inventory.find(i => i && i.sn === sn);

    if (!item) {
        if (typeof showToast === 'function') showToast("⚠️ ไม่พบข้อมูลสินค้ารายการนี้", true);
        return;
    }

    let modal = document.getElementById('slotItemInspectModal');
    if (!modal) {
        modal = document.createElement('div');
        modal.id = 'slotItemInspectModal';
        modal.className = 'modal-overlay';
        document.body.appendChild(modal);
    }

    const isAdmin = (typeof currentUser !== 'undefined' && currentUser && currentUser.role === 'admin');
    const safeSn = escapeHTML(item.sn || '-');
    const safeCategory = escapeHTML(item.category || '-');
    const safeName = escapeHTML(item.name || '-');
    const displayLocTag = escapeHTML(formatCompactLocationTag(item.location));
    const receiverDisplay = escapeHTML(item.receiver || item.created_by || item.received_by || 'ไม่ระบุ');

    modal.innerHTML = `
        <div class="card" style="width: 100%; max-width: 500px; padding: 1.5rem; position: relative; animation: fadeIn 0.2s ease-out; box-shadow: var(--shadow-lg); border-radius: 18px; background: var(--bg-surface, #ffffff);" onclick="event.stopPropagation()">
            <div class="card-header" style="margin-bottom: 1rem; padding-bottom: 0.75rem; border-bottom: 1px solid var(--border-color, #e2e8f0); display: flex; justify-content: space-between; align-items: center;">
                <div class="card-title" style="font-size: 1.1rem; color: var(--primary, #2563eb); font-weight: 800; display: flex; align-items: center; gap: 8px;">
                    <i class="fa-solid fa-boxes-stacked"></i> รายละเอียดสินค้าประจำพิกัด
                </div>
                <button type="button" class="btn btn-sm btn-secondary btn-close" onclick="closeSlotItemInspectModal()" style="font-size: 1.2rem; padding: 2px 10px; cursor: pointer; border-radius: 8px;">&times;</button>
            </div>

            <div style="background: var(--bg-subtle, #f8fafc); padding: 16px; border-radius: 14px; border: 1px solid var(--border-color, #e2e8f0); margin-bottom: 1rem;">
                <div style="display: grid; grid-template-columns: 1fr 1fr; gap: 12px; font-size: 0.88rem;">
                    <div>
                        <span style="color: var(--text-muted, #64748b); font-size: 0.78rem;">พิกัดตำแหน่ง:</span><br>
                        <span class="mono font-bold" style="font-size: 0.95rem; color: var(--primary, #2563eb);">${displayLocTag}</span>
                    </div>
                    <div>
                        <span style="color: var(--text-muted, #64748b); font-size: 0.78rem;">หมวดหมู่/SKU:</span><br>
                        <strong class="mono" style="color: var(--text-main, #0f172a);">${safeCategory}</strong>
                    </div>
                    <div style="grid-column: span 2;">
                        <span style="color: var(--text-muted, #64748b); font-size: 0.78rem;">ชื่อสินค้า / รายละเอียด:</span><br>
                        <strong style="color: var(--text-main, #0f172a); font-size: 0.92rem;">${safeName}</strong>
                    </div>
                    <div>
                        <span style="color: var(--text-muted, #64748b); font-size: 0.78rem;">รหัส/ซีเรียล (S/N):</span><br>
                        <strong class="mono" style="color: var(--primary, #2563eb);">${safeSn}</strong>
                    </div>
                    <div>
                        <span style="color: var(--text-muted, #64748b); font-size: 0.78rem;">จำนวน/มิเตอร์:</span><br>
                        <strong class="mono" style="color: var(--warning, #d97706);">${Number(item.meter || 0).toLocaleString()}</strong>
                    </div>
                    <div style="grid-column: span 2;">
                        <span style="color: var(--text-muted, #64748b); font-size: 0.78rem;">ผู้รับสินค้า / วันที่บันทึก:</span><br>
                        <span style="color: var(--text-sub, #475569);">${receiverDisplay} (${item.created_at ? new Date(item.created_at).toLocaleDateString('th-TH') : '-'})</span>
                    </div>
                </div>
            </div>

            <div style="display: grid; grid-template-columns: 1fr 1fr; gap: 8px;">
                <button type="button" class="btn btn-secondary btn-sm" onclick="closeSlotItemInspectModal(); triggerEditItemFromSlot('${safeSn}')">
                    <i class="fa-solid fa-pen-to-square"></i> แก้ไขข้อมูล
                </button>
                <button type="button" class="btn btn-secondary btn-sm" onclick="closeSlotItemInspectModal(); triggerRelocateFromSlot('${safeSn}')">
                    <i class="fa-solid fa-right-left"></i> ย้ายพิกัด
                </button>
                <button type="button" class="btn btn-primary btn-sm" onclick="triggerPrintPdfBarcodeAction('${safeSn}')">
                    <i class="fa-solid fa-print"></i> พิมพ์บาร์โค้ด
                </button>
                <button type="button" class="btn ${isAdmin ? 'btn-danger' : 'btn-warning'} btn-sm" onclick="closeSlotItemInspectModal(); triggerDeleteFromSlot('${safeSn}')">
                    <i class="fa-solid fa-trash"></i> ${isAdmin ? 'ลบสินค้า' : 'ขอลบสินค้า'}
                </button>
            </div>
        </div>
    `;

    modal.onclick = function(e) {
        if (e.target === modal) closeSlotItemInspectModal();
    };

    modal.style.display = 'flex';
}

// -------------------------------------------------------------------------
// 6. แก้ไขข้อมูลสินค้าในตัว
// -------------------------------------------------------------------------
function triggerEditItemFromSlot(sn) {
    closeSlotItemInspectModal();
    const inventory = (typeof globalInventoryData !== 'undefined' && Array.isArray(globalInventoryData)) ? globalInventoryData : [];
    const item = inventory.find(i => i && i.sn === sn);

    if (!item) return;

    if (typeof openEditItemModal === 'function') {
        openEditItemModal(String(item.id || ''), String(item.sn || ''));
        return;
    }

    let editModal = document.getElementById('editItemModal');
    if (!editModal) return;

    const editSn = document.getElementById('editItemSn');
    const editCat = document.getElementById('editItemCategory');
    const editName = document.getElementById('editItemName');
    const editMeter = document.getElementById('editItemMeter');
    const editLoc = document.getElementById('editItemLocation');
    const editForm = editModal.querySelector('form') || document.getElementById('editItemForm');

    if (editSn) editSn.value = item.sn || '';
    if (editCat) editCat.value = item.category || '';
    if (editName) editName.value = item.name || '';
    if (editMeter) editMeter.value = item.meter || 0;
    if (editLoc) editLoc.value = item.location || '';

    if (editForm) {
        editForm.onsubmit = async function(e) {
            e.preventDefault();
            
            const newCategory = editCat ? editCat.value : item.category;
            const newName = editName ? editName.value : item.name;
            const newMeter = editMeter ? editMeter.value : item.meter;
            const newLocation = editLoc ? editLoc.value : item.location;

            item.category = newCategory;
            item.name = newName;
            item.meter = newMeter;
            item.location = newLocation;

            const client = typeof getSupabaseClient === 'function' ? getSupabaseClient() : null;
            if (client) {
                try {
                    await client.from('warehouse_items').update({
                        category: newCategory,
                        name: newName,
                        meter: newMeter,
                        location: newLocation
                    }).eq('sn', sn);
                } catch(err) {}
            }

            closeModalElement(editModal);
            if (typeof showToast === 'function') showToast(`✅ แก้ไขข้อมูล S/N: ${sn} สำเร็จแล้ว`);
            refreshLocationVisualizerIfActive();
        };
    }

    editModal.style.display = 'flex';
}

// -------------------------------------------------------------------------
// 7. ระบบย้ายคลัง คำนวณช่องว่างให้อัตโนมัติ
// -------------------------------------------------------------------------
function triggerRelocateFromSlot(sn) {
    closeSlotItemInspectModal();
    const inventory = (typeof globalInventoryData !== 'undefined' && Array.isArray(globalInventoryData)) ? globalInventoryData : [];
    const item = inventory.find(i => i && i.sn === sn);

    if (!item) return;

    if (typeof requestRelocateModal === 'function') {
        requestRelocateModal(String(item.id || ''), String(item.sn || ''), String(item.name || '-'), String(item.location || 'DOCK'));
        return;
    }

    let modal = document.getElementById('relocateModal');
    if (!modal) return;

    const relSn = document.getElementById('relocateItemSn');
    const relName = document.getElementById('relocateItemName');
    const relLoc = document.getElementById('relocateItemCurrentLoc');

    if (relSn) relSn.textContent = item.sn || '';
    if (relName) relName.textContent = item.name || '';
    if (relLoc) relLoc.textContent = item.location || '';

    const occupiedLocationsSet = new Set(
        inventory.map(i => i && i.location ? normalizeLocationCode(i.location) : '').filter(Boolean)
    );

    const aisleSelect = document.getElementById('relocateAisleSelect');
    const baySelect = document.getElementById('relocateBaySelect');
    const shelfSelect = document.getElementById('relocateShelfSelect');
    const slotSelect = document.getElementById('relocateSlotSelect');

    if (aisleSelect) {
        const aisles = getAllConfiguredAisles();
        aisleSelect.innerHTML = aisles.map(a => `<option value="${a}">โซน/แถว ${a}</option>`).join('');

        aisleSelect.onchange = function() {
            populateAvailableRelocateLocations(aisleSelect.value, occupiedLocationsSet, baySelect, shelfSelect, slotSelect);
        };

        populateAvailableRelocateLocations(aisles[0] || 'A', occupiedLocationsSet, baySelect, shelfSelect, slotSelect);
    }

    const form = modal.querySelector('form') || document.getElementById('relocateForm');
    if (form) {
        form.onsubmit = async function(e) {
            e.preventDefault();
            const selectedAisle = aisleSelect ? aisleSelect.value : 'A';
            const selectedBay = baySelect ? baySelect.value : '01';
            const selectedShelf = shelfSelect ? shelfSelect.value : '1';
            const selectedSlot = slotSelect ? slotSelect.value : '01';

            if (!selectedBay || !selectedShelf || !selectedSlot) {
                if (typeof showToast === 'function') showToast("⚠️ แถวนี้ไม่มีช่องว่าง กรุณาเลือกแถวอื่น", true);
                return;
            }

            const newLocation = `${selectedAisle}-${selectedBay}-${selectedShelf}-${selectedSlot}`;
            item.location = newLocation;

            const client = typeof getSupabaseClient === 'function' ? getSupabaseClient() : null;
            if (client) {
                try {
                    await client.from('warehouse_items').update({ location: newLocation }).eq('sn', item.sn);
                } catch(err) {}
            }

            closeModalElement(modal);
            if (typeof showToast === 'function') showToast(`🚚 ย้ายสินค้าไปยังพิกัดว่างใหม่ ${newLocation} เรียบร้อยแล้ว`);
            refreshLocationVisualizerIfActive();
        };
    }

    modal.style.display = 'flex';
}

function populateAvailableRelocateLocations(aisle, occupiedSet, baySel, shelfSel, slotSel) {
    if (!baySel || !shelfSel || !slotSel) return;

    const config = getAisleConfig(aisle);
    const totalBays = Number(config.bays || config.bay || 10);
    const totalShelves = Number(config.shelves || config.shelf || 1);
    const totalSlots = Number(config.slots || config.slot || 10);

    let availableBays = [];
    for (let b = 1; b <= totalBays; b++) {
        const bayStr = String(b).padStart(2, '0');
        let hasFreeSlot = false;
        for (let sh = 1; sh <= totalShelves; sh++) {
            for (let sl = 1; sl <= totalSlots; sl++) {
                const locCode = `${aisle}-${bayStr}-${sh}-${String(sl).padStart(2, '0')}`;
                if (!occupiedSet.has(locCode)) {
                    hasFreeSlot = true;
                    break;
                }
            }
            if (hasFreeSlot) break;
        }
        if (hasFreeSlot) availableBays.push(bayStr);
    }

    if (availableBays.length === 0) {
        baySel.innerHTML = '<option value="">(แถวนี้เต็มแล้ว)</option>';
        shelfSel.innerHTML = '<option value="">-</option>';
        slotSel.innerHTML = '<option value="">-</option>';
        return;
    }

    baySel.innerHTML = availableBays.map(b => `<option value="${b}">ล็อก ${b}</option>`).join('');

    const updateShelvesAndSlots = () => {
        const selBay = baySel.value;
        let freeShelves = [];
        for (let sh = 1; sh <= totalShelves; sh++) {
            let hasFree = false;
            for (let sl = 1; sl <= totalSlots; sl++) {
                const locCode = `${aisle}-${selBay}-${sh}-${String(sl).padStart(2, '0')}`;
                if (!occupiedSet.has(locCode)) {
                    hasFree = true;
                    break;
                }
            }
            if (hasFree) freeShelves.push(sh);
        }

        shelfSel.innerHTML = freeShelves.map(sh => `<option value="${sh}">ชั้น L${sh}</option>`).join('');

        const updateSlots = () => {
            const selShelf = shelfSel.value;
            let freeSlots = [];
            for (let sl = 1; sl <= totalSlots; sl++) {
                const slotStr = String(sl).padStart(2, '0');
                const locCode = `${aisle}-${selBay}-${selShelf}-${slotStr}`;
                if (!occupiedSet.has(locCode)) {
                    freeSlots.push(slotStr);
                }
            }
            slotSel.innerHTML = freeSlots.map(sl => `<option value="${sl}">ช่อง S${sl} (ว่าง ✨)</option>`).join('');
        };

        shelfSel.onchange = updateSlots;
        updateSlots();
    };

    baySel.onchange = updateShelvesAndSlots;
    updateShelvesAndSlots();
}

// -------------------------------------------------------------------------
// 8. พิมพ์บาร์โค้ด PDF Fullscreen
// -------------------------------------------------------------------------
function triggerPrintPdfBarcodeAction(sn, size = activeBarcodeSize) {
    closeSlotItemInspectModal();

    if (typeof openPrintBarcodeModal === 'function') {
        openPrintBarcodeModal('SINGLE', sn);
        return;
    }

    const inventory = (typeof globalInventoryData !== 'undefined' && Array.isArray(globalInventoryData)) ? globalInventoryData : [];
    const item = inventory.find(i => i && i.sn === sn) || { sn, category: '-', name: '-', location: '-' };

    let widthMm = 50, heightMm = 30;
    let isA4 = false;

    if (size === '40x30') { widthMm = 40; heightMm = 30; }
    else if (size === '30x20') { widthMm = 30; heightMm = 20; }
    else if (size === '100x75') { widthMm = 100; heightMm = 75; }
    else if (size === 'A4') { isA4 = true; }

    const printWin = window.open('', '_blank', 'width=1000,height=800');
    if (!printWin) {
        if (typeof showToast === 'function') showToast("⚠️ กรุณาเปิดสิทธิ์ Pop-up บนเบราว์เซอร์เพื่อพิมพ์สติ๊กเกอร์", true);
        return;
    }

    const pageCss = isA4 ? `
        @page { size: A4 portrait; margin: 10mm; }
        .label-card {
            width: 70mm;
            height: 40mm;
            border: 1px dashed #cccccc;
            margin: 4mm;
            float: left;
            box-sizing: border-box;
            padding: 3mm;
            display: flex;
            flex-direction: column;
            justify-content: space-between;
            align-items: center;
        }
    ` : `
        @page {
            size: ${widthMm}mm ${heightMm}mm;
            margin: 0;
        }
        html, body {
            width: 100%;
            height: 100%;
            margin: 0;
            padding: 0;
            overflow: hidden;
        }
        .label-card {
            width: ${widthMm}mm;
            height: ${heightMm}mm;
            box-sizing: border-box;
            padding: 2mm;
            display: flex;
            flex-direction: column;
            justify-content: space-between;
            align-items: center;
            text-align: center;
        }
    `;

    printWin.document.write(`
        <!DOCTYPE html>
        <html>
        <head>
            <title>Print Label - ${escapeHTML(item.sn)}</title>
            <script src="https://cdn.jsdelivr.net/npm/jsbarcode@3.11.5/dist/JsBarcode.all.min.js"></script>
            <style>
                ${pageCss}
                @media print {
                    body { margin: 0; padding: 0; }
                    .label-card { page-break-inside: avoid; }
                }
                body {
                    font-family: Arial, Helvetica, sans-serif;
                    background: #ffffff;
                    display: flex;
                    justify-content: center;
                    align-items: center;
                }
                .sn-code { font-weight: bold; font-size: 11pt; font-family: monospace; letter-spacing: 0.5px; }
                .item-title { font-size: 8pt; color: #222; max-width: 100%; white-space: nowrap; overflow: hidden; text-overflow: ellipsis; }
                .loc-badge { font-size: 8pt; font-weight: bold; color: #0284c7; }
                svg { max-width: 100%; height: auto; }
            </style>
        </head>
        <body>
            <div class="label-card">
                <div class="sn-code">${escapeHTML(item.sn)}</div>
                <div class="item-title">[${escapeHTML(item.category || '-')}] ${escapeHTML(item.name || '-')}</div>
                <svg id="barcodePrintSvg"></svg>
                <div class="loc-badge">📍 ${escapeHTML(formatCompactLocationTag(item.location))}</div>
            </div>
            <script>
                window.onload = function() {
                    try {
                        JsBarcode("#barcodePrintSvg", "${escapeHTML(item.sn)}", {
                            format: "CODE128",
                            width: ${widthMm <= 30 ? 1.2 : 2.0},
                            height: ${heightMm <= 20 ? 25 : 45},
                            displayValue: false,
                            margin: 0
                        });
                    } catch(e) { console.error("Barcode Render Fail:", e); }
                    setTimeout(function() {
                        window.print();
                        window.close();
                    }, 350);
                };
            </script>
        </body>
        </html>
    `);
    printWin.document.close();
}

// -------------------------------------------------------------------------
// 9. ลบสินค้า / ขอลบสินค้า ใน locations-db.js
// -------------------------------------------------------------------------
function triggerDeleteFromSlot(sn) {
    closeSlotItemInspectModal();
    const inventory = (typeof globalInventoryData !== 'undefined' && Array.isArray(globalInventoryData)) ? globalInventoryData : [];
    const item = inventory.find(i => i && i.sn === sn);

    if (typeof requestDeleteModal === 'function') {
        const safeId = item ? String(item.id || '') : '';
        const safeSn = item ? String(item.sn || sn) : String(sn);
        requestDeleteModal('SINGLE', safeSn, safeId);
        return;
    }

    const modal = document.getElementById('deleteConfirmModal');
    if (modal) {
        modal.style.display = 'flex';
        const confirmBtn = modal.querySelector('.btn-confirm-delete, .btn-danger, #confirmDeleteBtn');
        if (confirmBtn) {
            confirmBtn.onclick = async function() {
                closeModalElement(modal);
                if (typeof executeDeleteAction === 'function') {
                    window.pendingDeleteMode = 'SINGLE';
                    window.pendingDeleteSn = sn;
                    window.pendingDeleteId = item ? item.id : null;
                    await executeDeleteAction(true);
                }
            };
        }
    } else {
        if (confirm(`คุณแน่ใจหรือไม่ว่าต้องการลบ S/N: ${sn}?`)) {
            if (typeof executeDeleteAction === 'function') {
                window.pendingDeleteMode = 'SINGLE';
                window.pendingDeleteSn = sn;
                window.pendingDeleteId = item ? item.id : null;
                executeDeleteAction(true);
            }
        }
    }
}

// Auto-Initialize โหลดแสดงผลอย่างปลอดภัยเมื่อ DOM พร้อม
document.addEventListener('DOMContentLoaded', function() {
    setTimeout(function() {
        if (document.getElementById('aisleFilterBar')) {
            renderDrillDownAisleBar();
            renderDrillDownBaysGrid();
            renderDrillDownSlotsGrid();
        }
    }, 150);
});

// Global Export 100% สำหรับการเรียกใช้งานเรียลไทม์จากภายนอก
window.getAisleConfig = getAisleConfig;
window.getDensityInfo = getDensityInfo;
window.extractAisleFromLocation = extractAisleFromLocation;
window.parseLocationComponents = parseLocationComponents;
window.normalizeLocationCode = normalizeLocationCode;
window.formatCompactLocationTag = formatCompactLocationTag;
window.formatLocationCode = formatLocationCode;
window.getAllConfiguredAisles = getAllConfiguredAisles;
window.getAisleOccupancyStats = getAisleOccupancyStats;
window.renderDrillDownAisleBar = renderDrillDownAisleBar;
window.renderDrillDownBaysGrid = renderDrillDownBaysGrid;
window.renderDrillDownSlotsGrid = renderDrillDownSlotsGrid;
window.renderRackVisualizerMatrix = renderRackVisualizerMatrix;
window.renderSlotCard = renderSlotCard;
window.selectLocationAisle = selectLocationAisle;
window.selectLocationBay = selectLocationBay;
window.setBayDisplayMode = setBayDisplayMode;
window.changeBayPage = changeBayPage;
window.onBayFilterInput = onBayFilterInput;
window.onAisleSnSearchInput = onAisleSnSearchInput;
window.inspectSlotItemDetail = inspectSlotItemDetail;
window.closeSlotItemInspectModal = closeSlotItemInspectModal;
window.closeModalElement = closeModalElement;
window.refreshLocationVisualizerIfActive = refreshLocationVisualizerIfActive;
window.notifyInventoryDataUpdated = notifyInventoryDataUpdated;
window.triggerEditItemFromSlot = triggerEditItemFromSlot;
window.triggerRelocateFromSlot = triggerRelocateFromSlot;
window.populateAvailableRelocateLocations = populateAvailableRelocateLocations;
window.triggerPrintPdfBarcodeAction = triggerPrintPdfBarcodeAction;
window.triggerDeleteFromSlot = triggerDeleteFromSlot;
window.triggerDeleteAllInCurrentScope = triggerDeleteAllInCurrentScope;