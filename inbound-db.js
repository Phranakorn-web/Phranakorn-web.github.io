// =========================================================================
// --- MODULE 3: FAST INBOUND DATABASE ENGINE (ENTERPRISE REALTIME v5.5.0) ---
// =========================================================================

let recentInboundList = [];
let fastScanLock = false;

// ⚡ Fast-Scan Memory Locking Sets (0ms Synchronous Lock Engine)
const pendingFastSnSet = new Set();
const pendingFastLocationSet = new Set();

let cachedOccupiedSet = null;
let isFeedRenderScheduled = false;

// 🚀 FIFO SCAN QUEUE ENGINE
const scanProcessingQueue = [];
let isProcessingScanQueue = false;
let scanSpeedCounter = 0;
let scanSpeedTimer = null;

// 🔍 Filter & Search state for Recent Inbound Feed
let recentFeedSearchQuery = '';

// 🔊 SOUND EFFECTS SYNTHESIZER (Enterprise WMS Web Audio API Standard)
function playAudioFeedback(type = 'success') {
    try {
        const AudioCtx = window.AudioContext || window.webkitAudioContext;
        if (!AudioCtx) return;
        const ctx = new AudioCtx();

        if (type === 'success') {
            // High crisp dual beep (Classic Enterprise WMS Scanner Tone)
            const osc1 = ctx.createOscillator();
            const gain = ctx.createGain();
            
            osc1.type = 'sine';
            osc1.frequency.setValueAtTime(1760, ctx.currentTime); // A6
            osc1.frequency.setValueAtTime(2637, ctx.currentTime + 0.06); // E7
            
            gain.gain.setValueAtTime(0.12, ctx.currentTime);
            gain.gain.exponentialRampToValueAtTime(0.001, ctx.currentTime + 0.14);
            
            osc1.connect(gain);
            gain.connect(ctx.destination);
            
            osc1.start(ctx.currentTime);
            osc1.stop(ctx.currentTime + 0.14);
        } else if (type === 'duplicate') {
            // Low double buzz for duplicate SN
            const osc = ctx.createOscillator();
            const gain = ctx.createGain();
            osc.type = 'square';
            osc.frequency.setValueAtTime(220, ctx.currentTime);
            osc.frequency.setValueAtTime(180, ctx.currentTime + 0.1);
            
            gain.gain.setValueAtTime(0.15, ctx.currentTime);
            gain.gain.exponentialRampToValueAtTime(0.01, ctx.currentTime + 0.25);
            
            osc.connect(gain);
            gain.connect(ctx.destination);
            
            osc.start(ctx.currentTime);
            osc.stop(ctx.currentTime + 0.25);
        } else if (type === 'occupied') {
            // Low warning pulse for occupied location slot
            const osc = ctx.createOscillator();
            const gain = ctx.createGain();
            osc.type = 'sawtooth';
            osc.frequency.setValueAtTime(350, ctx.currentTime);
            osc.frequency.linearRampToValueAtTime(150, ctx.currentTime + 0.3);
            
            gain.gain.setValueAtTime(0.18, ctx.currentTime);
            gain.gain.exponentialRampToValueAtTime(0.01, ctx.currentTime + 0.3);
            
            osc.connect(gain);
            gain.connect(ctx.destination);
            
            osc.start(ctx.currentTime);
            osc.stop(ctx.currentTime + 0.3);
        } else {
            // Standard General Error Buzz
            const osc = ctx.createOscillator();
            const gain = ctx.createGain();
            osc.type = 'sawtooth';
            osc.frequency.setValueAtTime(300, ctx.currentTime);
            osc.frequency.linearRampToValueAtTime(120, ctx.currentTime + 0.22);
            
            gain.gain.setValueAtTime(0.2, ctx.currentTime);
            gain.gain.exponentialRampToValueAtTime(0.01, ctx.currentTime + 0.22);
            
            osc.connect(gain);
            gain.connect(ctx.destination);
            
            osc.start(ctx.currentTime);
            osc.stop(ctx.currentTime + 0.22);
        }
    } catch (e) {}

    if (navigator.vibrate) {
        if (type === 'success') navigator.vibrate([35, 30, 35]);
        else if (type === 'duplicate') navigator.vibrate([70, 40, 70]);
        else if (type === 'occupied') navigator.vibrate([100, 50, 100]);
        else navigator.vibrate([120, 60, 120]);
    }
}

// 🔒 SECURITY HELPER: Prevent XSS Attack & Code Injection 100%
function escapeHTML(str) {
    if (str === null || str === undefined) return '';
    return String(str)
        .replace(/&/g, '&amp;')
        .replace(/</g, '&lt;')
        .replace(/>/g, '&gt;')
        .replace(/"/g, '&quot;')
        .replace(/'/g, '&#039;');
}

// 🔒 SECURITY GUARDS: ป้องกันการแอบคัดลอกโค้ดและการเปิด DevTools
function initFrontendSecurityGuards() {
    document.addEventListener('contextmenu', (e) => {
        if (e.target.tagName === 'INPUT' || e.target.tagName === 'TEXTAREA') return;
        e.preventDefault();
    }, false);

    document.addEventListener('keydown', (e) => {
        if (
            e.key === 'F12' ||
            (e.ctrlKey && e.shiftKey && (e.key === 'I' || e.key === 'i' || e.key === 'J' || e.key === 'j' || e.key === 'C' || e.key === 'c')) ||
            (e.ctrlKey && (e.key === 'U' || e.key === 'u' || e.key === 'S' || e.key === 's'))
        ) {
            e.preventDefault();
            e.stopPropagation();
            return false;
        }
    }, false);
}

// 🟢 ป๊อปอัปเด้งแจ้งเตือนสไตล์ iOS/macOS Glassmorphic (มุมขวาล่าง)
function showToast(message, isError = false, duration = 3200) {
    showToastPopup(message, isError, duration);
}

function showToastPopup(message, isError = false, duration = 3200) {
    let overlay = document.getElementById('wmsToastPopupOverlay');
    if (!overlay) {
        overlay = document.createElement('div');
        overlay.id = 'wmsToastPopupOverlay';
        overlay.className = 'wms-popup-toast-overlay';
        document.body.appendChild(overlay);
    }

    const popupCard = document.createElement('div');
    popupCard.className = `wms-popup-toast-card ${isError ? 'error' : 'success'}`;
    
    const iconHtml = isError ? 
        '<i class="fa-solid fa-triangle-exclamation" style="color:#ef4444; font-size:1.35rem;"></i>' : 
        '<i class="fa-solid fa-circle-check" style="color:#10b981; font-size:1.35rem;"></i>';

    popupCard.innerHTML = `
        <div style="display:flex; align-items:center; gap:10px; width:100%;">
            <div style="flex-shrink:0; display:flex; align-items:center;">${iconHtml}</div>
            <div style="flex:1; font-size:0.85rem; font-weight:600; color:var(--text-main, #0f172a); line-height:1.35; word-break:break-word;">
                ${escapeHTML(message)}
            </div>
            <button type="button" onclick="this.parentElement.parentElement.remove()" style="background:none; border:none; font-size:1.1rem; color:var(--text-muted, #64748b); cursor:pointer; padding:0 2px; opacity:0.6;" onmouseover="this.style.opacity=1" onmouseout="this.style.opacity=0.6">&times;</button>
        </div>
    `;

    overlay.appendChild(popupCard);
    
    requestAnimationFrame(() => {
        popupCard.classList.add('show');
    });

    setTimeout(() => {
        popupCard.classList.remove('show');
        setTimeout(() => {
            if (popupCard.parentNode) popupCard.parentNode.removeChild(popupCard);
        }, 300);
    }, duration);
}

// 🟢 แสดงข้อความป๊อปอัปสแกนลายนิ้วมือสำเร็จ
function showBiometricSuccessToast(userName) {
    showToastPopup(`🔓 ยืนยันตัวตนสำเร็จ: ยินดีต้อนรับคุณ ${userName}`, false, 3500);
}

// 🟢 ระบบเปิด-ปิด เมนูบนโทรศัพท์มือถือ
function toggleMobileSidebar() {
    const sidebar = document.querySelector('.sidebar');
    let backdrop = document.getElementById('sidebarBackdrop');

    if (!backdrop) {
        backdrop = document.createElement('div');
        backdrop.id = 'sidebarBackdrop';
        backdrop.className = 'sidebar-backdrop';
        backdrop.onclick = toggleMobileSidebar;
        document.body.appendChild(backdrop);
    }

    if (sidebar) {
        sidebar.classList.toggle('mobile-open');
        backdrop.classList.toggle('active');
    }
}

// 🟢 HELPER: ตรวจสอบสถานะการเข้าสู่ระบบและซ่อน Overlay หน้าล็อกอิน
function checkAndHideLoginOverlay() {
    const loginOverlay = document.querySelector('.login-overlay') || document.getElementById('loginOverlay') || document.getElementById('loginSection');
    const isLoggedIn = (typeof window.currentUser !== 'undefined' && window.currentUser) || 
                       (typeof currentUser !== 'undefined' && currentUser) ||
                       localStorage.getItem('WMS_ACTIVE_USER') || 
                       localStorage.getItem('WMS_USER') || 
                       localStorage.getItem('currentUser') || 
                       sessionStorage.getItem('WMS_ACTIVE_USER');

    if (loginOverlay && isLoggedIn) {
        loginOverlay.classList.add('hidden');
        loginOverlay.style.display = 'none';
        loginOverlay.style.visibility = 'hidden';
        loginOverlay.style.opacity = '0';
        loginOverlay.style.pointerEvents = 'none';
    }
}

// 🟢 Helper: ล็อคโฟกัสให้อยู่ที่ช่องสแกน SN ตลอดเวลา
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
    if (scanProcessingQueue.length === 0) {
        pendingFastLocationSet.clear();
        pendingFastSnSet.clear();
    }
}

// 🟢 UPDATED: คืนค่าและรีเซ็ตพิกัดเมื่อมีการลบสินค้า หรือปรับเปลี่ยนฐานข้อมูล Realtime
function purgeDispatchedOrDeletedItemFromMemory(targetSn, targetId, targetLocation = null) {
    if (!targetSn && !targetId && !targetLocation) return;
    
    let targetSnUpper = targetSn ? String(targetSn).trim().toUpperCase() : null;
    let targetLocUpper = targetLocation ? String(targetLocation).trim().toUpperCase() : null;

    if ((!targetLocUpper || !targetSnUpper) && typeof globalInventoryData !== 'undefined' && Array.isArray(globalInventoryData)) {
        const matchedItem = globalInventoryData.find(item => {
            if (!item) return false;
            if (targetId && (item.id === targetId || String(item.id) === String(targetId))) return true;
            if (targetSnUpper && item.sn && String(item.sn).trim().toUpperCase() === targetSnUpper) return true;
            return false;
        });
        if (matchedItem) {
            if (!targetSnUpper && matchedItem.sn) targetSnUpper = String(matchedItem.sn).trim().toUpperCase();
            if (!targetLocUpper && matchedItem.location) targetLocUpper = String(matchedItem.location).trim().toUpperCase();
        }
    }

    if (typeof globalInventoryData !== 'undefined' && Array.isArray(globalInventoryData)) {
        globalInventoryData = globalInventoryData.filter(item => {
            if (!item) return false;
            if (targetId && (item.id === targetId || String(item.id) === String(targetId))) return false;
            if (targetSnUpper && item.sn && String(item.sn).trim().toUpperCase() === targetSnUpper) return false;
            return true;
        });
        if (typeof window !== 'undefined') window.globalInventoryData = globalInventoryData;
    }

    if (Array.isArray(recentInboundList)) {
        recentInboundList = recentInboundList.filter(item => {
            if (!item) return false;
            if (targetId && (item.id === targetId || String(item.id) === String(targetId))) return false;
            if (targetSnUpper && item.sn && String(item.sn).trim().toUpperCase() === targetSnUpper) return false;
            return true;
        });
    }

    if (targetSnUpper) pendingFastSnSet.delete(targetSnUpper);

    if (targetLocUpper) {
        removeOccupiedLocFromSet(pendingFastLocationSet, targetLocUpper);
        if (typeof occupiedLocationsSet !== 'undefined' && occupiedLocationsSet instanceof Set) {
            removeOccupiedLocFromSet(occupiedLocationsSet, targetLocUpper);
        }
    }

    invalidateOccupiedLocationsCache();
    forceSyncAndSelectAvailableLocation();
    scheduleDebouncedFeedRender();
}

function purgeDeletedSnFromMemory(targetSn, targetId) {
    purgeDispatchedOrDeletedItemFromMemory(targetSn, targetId);
}

// 🟢 UPDATED: แยกส่วนประกอบของพิกัดจัดเก็บ (Aisle, Bay, Shelf, Slot) ไม่ปนกับคำว่าร้านหรือพิกัดลอย
function parseLocComponentsInternal(locStr) {
    if (!locStr) return null;
    let raw = String(locStr).trim().toUpperCase();
    
    // กรองและล้างคำแปลกปลอม เช่น "ร้าน", "ร้านล็อก" ออกจากสตริง
    raw = raw.replace(/ร้านล็อก|ร้าน/gi, '').trim();

    const specialList = ['DOCK', 'OFFICE', 'PENDING', 'FOOD', 'FREEZER', 'COLD', 'DRY', 'RAW'];
    if (specialList.includes(raw)) {
        return { isSpecial: true, code: raw };
    }

    let p = null;
    if (typeof window !== 'undefined' && typeof window.parseLocationComponents === 'function') {
        p = window.parseLocationComponents(raw);
    } else if (typeof parseLocationComponents === 'function') {
        p = parseLocationComponents(raw);
    }

    if (p && p.aisle && p.bay) {
        return {
            isSpecial: false,
            aisle: String(p.aisle).trim().toUpperCase(),
            bay: String(parseInt(p.bay, 10) || 1).padStart(2, '0'),
            shelf: String(parseInt(p.shelf, 10) || 1).padStart(2, '0'),
            slot: String(parseInt(p.slot, 10) || 1).padStart(2, '0')
        };
    }

    let cleanText = raw.replace(/ล็อก|ชั้น|ช่อง|BAY|SHELF|SLOT|•|📍/gi, ' ').trim();
    let parts = cleanText.split(/[\-\/_ \t]+/).filter(Boolean);

    if (parts.length >= 4) {
        return {
            isSpecial: false,
            aisle: parts[0].trim().toUpperCase(),
            bay: String(parseInt(parts[1], 10) || 1).padStart(2, '0'),
            shelf: String(parseInt(parts[2], 10) || 1).padStart(2, '0'),
            slot: String(parseInt(parts[3], 10) || 1).padStart(2, '0')
        };
    }
    return null;
}

function addOccupiedLocToSet(targetSet, loc) {
    if (!loc || !(targetSet instanceof Set)) return;
    const rawUpper = String(loc).trim().toUpperCase();
    if (!rawUpper) return;

    targetSet.add(rawUpper);
    const normKey = getNormalizedLocKey(rawUpper);
    if (normKey) targetSet.add(normKey);

    const p = parseLocComponentsInternal(rawUpper);
    if (p && !p.isSpecial) {
        const standardKey = `${p.aisle}-${p.bay}-${p.shelf}-${p.slot}`;
        targetSet.add(standardKey);
        targetSet.add(formatLocationSpaced(standardKey));
        targetSet.add(`${p.aisle}-${parseInt(p.bay,10)}-${parseInt(p.shelf,10)}-${parseInt(p.slot,10)}`);
    }
}

function removeOccupiedLocFromSet(targetSet, loc) {
    if (!loc || !(targetSet instanceof Set)) return;
    const rawUpper = String(loc).trim().toUpperCase();
    if (!rawUpper) return;

    targetSet.delete(rawUpper);
    const normKey = getNormalizedLocKey(rawUpper);
    if (normKey) targetSet.delete(normKey);

    const p = parseLocComponentsInternal(rawUpper);
    if (p && !p.isSpecial) {
        const standardKey = `${p.aisle}-${p.bay}-${p.shelf}-${p.slot}`;
        targetSet.delete(standardKey);
        targetSet.delete(formatLocationSpaced(standardKey));
        targetSet.delete(`${p.aisle}-${parseInt(p.bay,10)}-${parseInt(p.shelf,10)}-${parseInt(p.slot,10)}`);
    }
}

// 🟢 ดึงชื่อ-นามสกุลจริงของผู้ใช้งานจากเซสชัน Supabase & Storage เพื่อบันทึกลงฐานข้อมูล 100%
function getCurrentUserFullName() {
    const profileElem = document.querySelector('.user-profile-badge') || 
                        document.querySelector('.user-name') || 
                        document.getElementById('userProfileBadge') ||
                        document.getElementById('currentUserName');
    if (profileElem) {
        const fullText = profileElem.innerText || profileElem.textContent || '';
        const cleanText = fullText.replace(/\(.*\)/g, '').replace(/[\r\n\t]/g, '').replace(/🟢|🔴|👤|👤\s*/g, '').trim();
        if (cleanText && !cleanText.includes('เข้าสู่ระบบ') && cleanText.length > 2) {
            return escapeHTML(cleanText);
        }
    }

    let u = (typeof window !== 'undefined' && window.currentUser) || (typeof currentUser !== 'undefined' ? currentUser : null);
    if (u) {
        if (typeof u === 'string' && u.trim().length > 0) {
            const cleanStr = u.replace(/\(.*\)/g, '').trim();
            if (cleanStr && cleanStr.length > 2) return escapeHTML(cleanStr);
        }
        if (typeof u === 'object') {
            const fn = u.first_name || u.firstname || u.firstName || u.user_metadata?.first_name || u.user_metadata?.full_name || u.user_metadata?.name || '';
            const ln = u.last_name || u.lastname || u.lastName || u.user_metadata?.last_name || '';
            if (fn || ln) return escapeHTML(`${fn} ${ln}`.trim());
            if (u.fullname || u.fullName || u.full_name || u.name) return escapeHTML(String(u.fullname || u.fullName || u.full_name || u.name).replace(/\(.*\)/g, '').trim());
        }
    }

    const storageKeys = ['WMS_ACTIVE_USER', 'WMS_USER', 'currentUser', 'user', 'sb-session'];
    for (const key of storageKeys) {
        try {
            const raw = localStorage.getItem(key) || sessionStorage.getItem(key);
            if (raw) {
                if (raw.startsWith('{')) {
                    const parsed = JSON.parse(raw);
                    const userObj = parsed.user || parsed.current_user || parsed;
                    if (userObj && typeof userObj === 'object') {
                        const meta = userObj.user_metadata || userObj;
                        const fn = meta.first_name || meta.firstname || meta.full_name || meta.name || '';
                        const ln = meta.last_name || meta.lastname || '';
                        if (fn || ln) return escapeHTML(`${fn} ${ln}`.trim());
                    }
                } else if (raw.trim().length > 2 && !raw.includes('{')) {
                    return escapeHTML(raw.trim());
                }
            }
        } catch (e) {}
    }

    return 'นคร จันทร์ท็อป';
}

function getAisleConfig(aisleName) {
    const key = String(aisleName || '').trim().toUpperCase();
    if (!key) return { bays: 10, shelves: 1, slots: 10 };

    const findInObj = (obj) => {
        if (!obj || typeof obj !== 'object') return null;
        if (obj[key]) return obj[key];
        const foundKey = Object.keys(obj).find(k => String(k).trim().toUpperCase() === key);
        return foundKey ? obj[foundKey] : null;
    };

    const findInArray = (arr) => {
        if (!Array.isArray(arr)) return null;
        return arr.find(item => {
            if (!item) return false;
            const name = typeof item === 'object' ? (item.name || item.aisle || item.key || item.code || item.title || '') : String(item);
            return String(name).trim().toUpperCase() === key;
        });
    };

    let cfg = findInObj(typeof window !== 'undefined' && window.aisleConfigs) ||
              findInObj(typeof aisleConfigs !== 'undefined' ? aisleConfigs : null) ||
              findInObj(typeof window !== 'undefined' && window.masterWarehouseConfigs) ||
              findInObj(typeof masterWarehouseConfigs !== 'undefined' ? masterWarehouseConfigs : null);

    if (!cfg) {
        const itemInMaster = findInArray(typeof window !== 'undefined' && window.masterAisles) ||
                             findInArray(typeof masterAisles !== 'undefined' ? masterAisles : null);
        if (itemInMaster && typeof itemInMaster === 'object') {
            cfg = itemInMaster;
        }
    }

    if (!cfg && typeof localStorage !== 'undefined') {
        try {
            const localCfg = localStorage.getItem('WMS_AISLE_CONFIGS');
            if (localCfg) cfg = findInObj(JSON.parse(localCfg));

            if (!cfg) {
                const localMaster = localStorage.getItem('WMS_MASTER_AISLES');
                if (localMaster) {
                    const parsedMaster = JSON.parse(localMaster);
                    const found = findInArray(parsedMaster) || findInObj(parsedMaster);
                    if (found && typeof found === 'object') cfg = found;
                }
            }

            if (!cfg) {
                const localWh = localStorage.getItem('WMS_WAREHOUSE_CONFIGS');
                if (localWh) cfg = findInObj(JSON.parse(localWh));
            }
        } catch (e) {}
    }

    if (cfg) {
        const bays = parseInt(cfg.bays || cfg.bay || cfg.baysCount || cfg.totalBays || cfg.bayCount, 10);
        const shelves = parseInt(cfg.shelves || cfg.shelf || cfg.shelvesCount || cfg.totalShelves || cfg.shelfCount, 10);
        const slots = parseInt(cfg.slots || cfg.slot || cfg.slotsCount || cfg.totalSlots || cfg.slotCount, 10);
        return {
            bays: (!isNaN(bays) && bays > 0) ? bays : 10,
            shelves: (!isNaN(shelves) && shelves > 0) ? shelves : 1,
            slots: (!isNaN(slots) && slots > 0) ? slots : 10
        };
    }
    return { bays: 10, shelves: 1, slots: 10 };
}

function getNormalizedLocKey(locStr) {
    if (!locStr) return '';
    let clean = String(locStr).trim().toUpperCase().replace(/ร้านล็อก|ร้าน/gi, '').trim();
    if (['DOCK', 'OFFICE', 'PENDING', 'FOOD', 'FREEZER', 'COLD', 'DRY', 'RAW'].includes(clean)) return clean;

    const parsed = parseLocComponentsInternal(clean);
    if (parsed) {
        if (parsed.isSpecial) return parsed.code;
        return `${parsed.aisle}-${parsed.bay}-${parsed.shelf}-${parsed.slot}`;
    }
    return clean;
}

function normalizeLocationStandard(locStr) {
    return getNormalizedLocKey(locStr);
}

function formatLocationSpaced(locStr) {
    if (!locStr) return '-';
    const clean = String(locStr).trim().toUpperCase().replace(/ร้านล็อก|ร้าน/gi, '').trim();
    if (['DOCK', 'OFFICE', 'PENDING', 'FOOD', 'FREEZER', 'COLD', 'DRY', 'RAW'].includes(clean)) {
        return clean;
    }

    const p = parseLocComponentsInternal(clean);
    if (p && !p.isSpecial) {
        const isFull = clean.endsWith('-FULL') || clean.includes('FULL');
        const slotStr = isFull ? 'FULL' : p.slot;
        return `แถว ${p.aisle} • ล็อก ${p.bay} • ชั้น ${p.shelf} • ช่อง ${slotStr}`;
    }

    return clean.replace(/[\-_]/g, ' • ');
}

function formatLocationCode(locStr) {
    return formatLocationSpaced(locStr);
}

// 🟢 UPDATED: แยกชื่อพิกัด/แถวออกจาก ล็อก/ชั้น/ช่อง ป้องกันการรวมร่างแสดงผลผิดพลาด 100%
function formatLocationBadgeHTML(locStr) {
    if (!locStr) return `<span class="loc-badge-container compact"><span class="loc-segment">N/A</span></span>`;
    const clean = String(locStr).trim().toUpperCase().replace(/ร้านล็อก|ร้าน/gi, '').trim();
    
    if (['DOCK', 'OFFICE', 'PENDING', 'FOOD', 'FREEZER', 'COLD', 'DRY', 'RAW'].includes(clean)) {
        return `<span class="loc-badge-container special compact"><span class="loc-segment loc-aisle">📍 โซนพิเศษ: ${escapeHTML(clean)}</span></span>`;
    }

    const p = parseLocComponentsInternal(clean);
    if (p && !p.isSpecial) {
        const isFull = clean.endsWith('-FULL') || clean.includes('FULL');
        const slotStr = isFull ? 'FULL' : p.slot;

        return `
            <span class="loc-badge-container compact ${isFull ? 'full-slot' : ''}" title="${escapeHTML(clean)}">
                <span class="loc-segment loc-aisle"><i class="fa-solid fa-layer-group" style="font-size:0.7rem; margin-right:3px;"></i> แถว ${escapeHTML(p.aisle)}</span>
                <span class="loc-divider">•</span>
                <span class="loc-segment loc-bay">ล็อก ${escapeHTML(p.bay)}</span>
                <span class="loc-divider">•</span>
                <span class="loc-segment loc-shelf">ชั้น ${escapeHTML(p.shelf)}</span>
                <span class="loc-divider">•</span>
                <span class="loc-segment loc-slot ${isFull ? 'full' : ''}">ช่อง ${escapeHTML(slotStr)}</span>
            </span>
        `.trim();
    }

    return `<span class="loc-badge-container compact"><span class="loc-segment">📍 ${escapeHTML(clean)}</span></span>`;
}

function getOccupyingSnDetails(locStr) {
    if (!locStr) return null;
    const targetKey = getNormalizedLocKey(locStr);
    const searchTarget = String(locStr).trim().toUpperCase();

    const checkList = (list) => {
        if (!Array.isArray(list)) return null;
        for (const item of list) {
            if (!item) continue;
            const isOut = item.status === 'OUT' || item.status === 'DISPATCHED' || item.status === 'ISSUED' || item.status === 'RELEASED' || item.is_deleted || Number(item.qty) <= 0;
            if (isOut) continue;

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
        const statusUpper = String(item.status || '').toUpperCase();
        if (statusUpper === 'OUT' || statusUpper === 'DISPATCHED' || statusUpper === 'ISSUED' || statusUpper === 'RELEASED' || item.is_deleted || Number(item.qty) <= 0) {
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

        const isOccupied = occupied.has(candNorm) || occupied.has(getNormalizedLocKey(candNorm)) || occupied.has(formatLocationSpaced(candNorm));

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

function calculateNextAvailableSlotInBayStrictAisle(aisleName, bayName) {
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

            const isOccupied = occupied.has(candNorm) || occupied.has(getNormalizedLocKey(candNorm)) || occupied.has(formatLocationSpaced(candNorm));

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
                if (occupied.has(candNorm) || occupied.has(getNormalizedLocKey(candNorm)) || occupied.has(formatLocationSpaced(candNorm))) {
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

                if (!occupied.has(candNorm) && !occupied.has(getNormalizedLocKey(candNorm)) && !occupied.has(formatLocationSpaced(candNorm))) {
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

        const isOccupied = occupied.has(candNorm) || occupied.has(getNormalizedLocKey(candNorm)) || occupied.has(formatLocationSpaced(candNorm));

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

// 🟢 UPDATED: บังคับเลือกพิกัดจากฐานข้อมูลจริง ลบข้อผิดพลาด "ร้านล็อก" ทิ้ง 100%
function populateInboundLocationDropdownsStrict(aisleName, keepBay = null) {
    const aisleSelect = document.getElementById('inboundAisleSelect');
    
    let aisle = aisleName || (aisleSelect ? aisleSelect.value : '');
    aisle = String(aisle || 'A').trim().toUpperCase().replace(/ร้านล็อก|ร้าน/gi, '').trim();

    if (aisleSelect && aisleSelect.value !== aisle) {
        aisleSelect.value = aisle;
    }

    const baySelect = document.getElementById('inboundBaySelect');
    const shelfSelect = document.getElementById('inboundShelfSelect');
    const slotSelect = document.getElementById('inboundSlotSelect');

    if (!baySelect || !shelfSelect || !slotSelect) return;

    if (['DOCK', 'OFFICE', 'PENDING', 'FOOD', 'FREEZER', 'COLD', 'DRY', 'RAW'].includes(aisle)) {
        baySelect.innerHTML = `<option value="00">00 (พิเศษ)</option>`;
        shelfSelect.innerHTML = `<option value="00">00 (พิเศษ)</option>`;
        slotSelect.innerHTML = `<option value="00">00 (พิเศษ)</option>`;
        baySelect.disabled = shelfSelect.disabled = slotSelect.disabled = true;
        updateInboundLocationPreviewFromDropdowns();
        ensureSnInputFocus();
        return;
    }

    baySelect.disabled = shelfSelect.disabled = slotSelect.disabled = false;

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

    let currentSelectedBay = keepBay || baySelect.value || '01';
    let targetBayNum = parseInt(currentSelectedBay, 10) || 1;
    if (targetBayNum > totalBays) targetBayNum = 1;

    let targetBayStr = String(targetBayNum).padStart(2, '0');
    let resBay = calculateNextAvailableSlotInBayStrictAisle(aisle, targetBayStr);

    if (resBay.isFull) {
        for (let bOffset = 1; bOffset < totalBays; bOffset++) {
            let testBayNum = ((targetBayNum - 1 + bOffset) % totalBays) + 1;
            let testBayStr = String(testBayNum).padStart(2, '0');
            let testRes = calculateNextAvailableSlotInBayStrictAisle(aisle, testBayStr);

            if (!testRes.isFull) {
                targetBayStr = testBayStr;
                resBay = testRes;
                break;
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

function onInboundBayChange(bayValue) {
    const aisleSelect = document.getElementById('inboundAisleSelect');
    const baySelect = document.getElementById('inboundBaySelect');
    const shelfSelect = document.getElementById('inboundShelfSelect');

    const currentAisle = aisleSelect ? aisleSelect.value : 'A';
    const currentBay = bayValue || (baySelect ? baySelect.value : '01');

    if (['DOCK', 'OFFICE', 'PENDING', 'FOOD', 'FREEZER', 'COLD', 'DRY', 'RAW'].includes(currentAisle)) return;

    const res = calculateNextAvailableSlotInBayStrictAisle(currentAisle, currentBay);

    if (res.isFull) {
        populateInboundSlotDropdown(currentAisle, currentBay, shelfSelect ? shelfSelect.value : '01');
    } else {
        if (shelfSelect) shelfSelect.value = res.shelf;
        populateInboundSlotDropdown(currentAisle, currentBay, res.shelf);
    }

    updateInboundLocationPreviewFromDropdowns();
    ensureSnInputFocus();
}

function onInboundShelfChange(shelfValue) {
    const aisleSelect = document.getElementById('inboundAisleSelect');
    const baySelect = document.getElementById('inboundBaySelect');
    const shelfSelect = document.getElementById('inboundShelfSelect');

    const currentAisle = aisleSelect ? aisleSelect.value : 'A';
    const currentBay = baySelect ? baySelect.value : '01';
    const currentShelf = shelfValue || (shelfSelect ? shelfSelect.value : '01');

    if (['DOCK', 'OFFICE', 'PENDING', 'FOOD', 'FREEZER', 'COLD', 'DRY', 'RAW'].includes(currentAisle)) return;

    populateInboundSlotDropdown(currentAisle, currentBay, currentShelf);
    updateInboundLocationPreviewFromDropdowns();
    ensureSnInputFocus();
}

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
        const autoSlot = populateInboundSlotDropdown(currentAisle, currentBay, currentShelf);
        if (slotSelect) slotSelect.value = autoSlot;
    }

    updateInboundLocationPreviewFromDropdowns();
    ensureSnInputFocus();
}

function getSelectedLocationFromDropdowns() {
    const aisleSelect = document.getElementById('inboundAisleSelect');
    const baySelect = document.getElementById('inboundBaySelect');
    const shelfSelect = document.getElementById('inboundShelfSelect');
    const slotSelect = document.getElementById('inboundSlotSelect');

    const aisle = (aisleSelect ? aisleSelect.value : 'A').trim().toUpperCase().replace(/ร้านล็อก|ร้าน/gi, '').trim();
    if (['DOCK', 'OFFICE', 'PENDING', 'FOOD', 'FREEZER', 'COLD', 'DRY', 'RAW'].includes(aisle)) {
        return aisle;
    }

    const pad2 = (val) => String(parseInt(val, 10) || 1).padStart(2, '0');
    const bay = pad2(baySelect ? baySelect.value : '01');
    const shelf = pad2(shelfSelect ? shelfSelect.value : '01');
    const slot = pad2(slotSelect ? slotSelect.value : '01');

    return `${aisle}-${bay}-${shelf}-${slot}`;
}

function updateInboundLocationPreviewFromDropdowns() {
    const previewElem = document.getElementById('inboundLocationPreview');
    const hiddenLocInput = document.getElementById('inboundLocation');

    const dbLocKey = getSelectedLocationFromDropdowns();

    if (previewElem) {
        previewElem.innerHTML = formatLocationBadgeHTML(dbLocKey);
        previewElem.classList.remove('pulse-highlight');
        void previewElem.offsetWidth;
        previewElem.classList.add('pulse-highlight');
    }
    
    if (hiddenLocInput) hiddenLocInput.value = dbLocKey;

    const aisleSelect = document.getElementById('inboundAisleSelect');
    const aisle = aisleSelect ? aisleSelect.value : 'A';

    if (['DOCK', 'OFFICE', 'PENDING', 'FOOD', 'FREEZER', 'COLD', 'DRY', 'RAW'].includes(aisle)) {
        renderAisleSlotBreakdownUI(calculateAisleCapacityAndNextSlot(aisle));
        return;
    }

    const baySelect = document.getElementById('inboundBaySelect');
    const shelfSelect = document.getElementById('inboundShelfSelect');

    const bay = baySelect ? baySelect.value : '01';
    const shelf = shelfSelect ? shelfSelect.value : '01';

    const details = calculateAisleCapacityAndNextSlot(aisle);
    details.bay = parseInt(bay, 10);
    details.shelf = parseInt(shelf, 10);
    details.location = dbLocKey;

    renderAisleSlotBreakdownUI(details);
}

function onInboundAisleChange(aisleValue) {
    const aisleSelect = document.getElementById('inboundAisleSelect');
    const currentAisle = aisleValue || (aisleSelect ? aisleSelect.value : 'A');
    populateInboundLocationDropdownsStrict(currentAisle, '01');
    const hiddenLoc = document.getElementById('inboundLocation');
    return hiddenLoc ? hiddenLoc.value : currentAisle;
}

function renderAisleSlotBreakdownUI(details) {
    let infoContainer = document.getElementById('inboundAisleSlotDetailBox');
    
    if (!infoContainer) {
        const previewElem = document.getElementById('inboundLocationPreview');
        if (previewElem && previewElem.parentElement) {
            infoContainer = document.createElement('div');
            infoContainer.id = 'inboundAisleSlotDetailBox';
            infoContainer.className = 'glass-hud-box';
            previewElem.parentElement.appendChild(infoContainer);
        } else {
            return;
        }
    }

    if (['DOCK', 'OFFICE', 'PENDING', 'FOOD', 'FREEZER', 'COLD', 'DRY', 'RAW'].includes(details.location)) {
        infoContainer.innerHTML = `
            <div style="text-align:center; color:var(--primary-text); font-weight:600; padding:8px; background:var(--primary-light, #e0f2fe); border-radius:10px; border:1px solid var(--primary-border);">
                📍 พิกัดพิเศษ: <strong>${details.location}</strong> (รับเข้าโซนส่วนกลาง)
            </div>
        `;
        return;
    }

    if (details.location.endsWith('-FULL') || details.location.includes('FULL')) {
        infoContainer.innerHTML = `
            <div style="text-align:center; color:var(--danger, #ef4444); font-weight:700; padding:10px; background:var(--danger-light, #fee2e2); border-radius:10px; border:1px solid #fca5a5;">
                ⚠️ ล็อก/แถวนี้เต็มแล้ว! (ใช้ไป ${details.occupiedCount}/${details.totalSlots} ช่อง จากทั้งหมด ${details.baysConfigured} ล็อก)
            </div>
        `;
        return;
    }

    const usedPercent = details.totalSlots > 0 ? Math.round((details.occupiedCount / details.totalSlots) * 100) : 0;
    const progressColor = usedPercent > 85 ? '#ef4444' : (usedPercent > 60 ? '#f59e0b' : '#10b981');

    infoContainer.innerHTML = `
        <div style="display:flex; justify-content:space-between; align-items:center; margin-bottom:8px; padding-bottom:6px; border-bottom:1px solid var(--border-color, #e2e8f0);">
            <div style="display:flex; align-items:center; gap:6px;">
                <span class="pulse-live-dot"></span>
                <span style="font-weight:700; color:var(--text-main); font-size:0.8rem;">สถานะจัดเก็บ Realtime 100%</span>
            </div>
            <button type="button" onclick="triggerAutoFindNextSlot()" style="background:none; border:none; color:var(--primary-text, #0284c7); font-size:0.75rem; font-weight:700; cursor:pointer; display:flex; align-items:center; gap:4px;" title="กดเพื่อรีเฟรชคำนวณพิกัดใหม่">
                <i class="fa-solid fa-rotate-right"></i> รีเฟรชพิกัด
            </button>
        </div>

        <div style="display:grid; grid-template-columns: repeat(3, 1fr); gap:6px; text-align:center; margin-bottom:10px;">
            <div style="background:var(--primary-light, #e0f2fe); padding:6px 4px; border-radius:8px; border:1px solid var(--primary-border);">
                <span style="font-size:0.7rem; color:var(--text-sub); display:block;">ล็อกที่เลือก</span>
                <strong style="font-size:0.95rem; color:var(--primary-text);" class="mono">ล็อก ${String(details.bay).padStart(2, '0')}</strong>
                <span style="font-size:0.65rem; color:var(--text-muted); display:block;">(ทั้งหมด ${details.baysConfigured} ล็อก)</span>
            </div>
            <div style="background:var(--primary-light, #e0f2fe); padding:6px 4px; border-radius:8px; border:1px solid var(--primary-border);">
                <span style="font-size:0.7rem; color:var(--text-sub); display:block;">ชั้นที่เลือก</span>
                <strong style="font-size:0.95rem; color:var(--primary-text);" class="mono">ชั้น ${String(details.shelf).padStart(2, '0')}</strong>
                <span style="font-size:0.65rem; color:var(--text-muted); display:block;">(ทั้งหมด ${details.shelvesConfigured} ชั้น)</span>
            </div>
            <div style="background:var(--success-light, #dcfce7); padding:6px 4px; border-radius:8px; border:1px solid rgba(16,185,129,0.3);">
                <span style="font-size:0.7rem; color:#15803d; display:block;">ช่องว่าง Auto</span>
                <strong style="font-size:0.95rem; color:#10b981;" class="mono">ช่อง ${String(details.slot).padStart(2, '0')}</strong>
                <span style="font-size:0.65rem; color:#166534; display:block;">(ทั้งหมด ${details.slotsConfigured} ช่อง)</span>
            </div>
        </div>

        <div style="margin-bottom:8px;">
            <div style="display:flex; justify-content:space-between; font-size:0.73rem; color:var(--text-sub); margin-bottom:3px;">
                <span>อัตราความจุแถวนี้:</span>
                <strong style="color:${progressColor}">${usedPercent}% (${details.occupiedCount}/${details.totalSlots})</strong>
            </div>
            <div style="width:100%; height:8px; background:var(--bg-subtle, #e2e8f0); border-radius:4px; overflow:hidden;">
                <div style="width:${usedPercent}%; height:100%; background:${progressColor}; transition:width 0.3s ease;"></div>
            </div>
        </div>

        <div style="display:flex; justify-content:space-between; align-items:center; font-size:0.78rem; color:var(--text-sub); border-top:1px dashed var(--border-color); padding-top:8px; margin-top:4px;">
            <span>🟢 ช่องว่างคงเหลือ: <strong style="color:var(--success, #10b981);" class="mono">${details.freeSlots}</strong> / ${details.totalSlots} ช่อง</span>
            <button type="button" class="btn btn-sm" onclick="triggerAutoFindNextSlot()" style="font-size:0.7rem; padding:3px 10px; background:var(--primary-light, #e0f2fe); color:var(--primary-text, #0284c7); border:1px solid var(--primary-border); border-radius:6px; cursor:pointer; font-weight:600;" title="ค้นหาและเลือกช่องว่างถัดไปให้อัตโนมัติในแถวเดิม">
                ⚡ หาช่องว่างถัดไป
            </button>
        </div>
    `;
}

function triggerAutoFindNextSlot() {
    invalidateOccupiedLocationsCache();
    forceSyncAndSelectAvailableLocation();
}

function forceSyncAndSelectAvailableLocation() {
    const aisleSelect = document.getElementById('inboundAisleSelect');
    const baySelect = document.getElementById('inboundBaySelect');

    const currentAisle = aisleSelect ? aisleSelect.value : 'A';
    const currentBay = baySelect ? baySelect.value : '01';

    populateInboundLocationDropdownsStrict(currentAisle, currentBay);
}

function autoSelectNextAvailableSlotAfterInbound() {
    forceSyncAndSelectAvailableLocation();
}

// ⚡ ---------------------------------------------------------------------
// 🚀 HIGH-SPEED FAST SCAN ENGINE (STRICT SINGLE SN CHECK & AUDIO FEEDBACK)
// ------------------------------------------------------------------------
function triggerScanInputFlash(status = 'success') {
    const snInput = document.getElementById('inboundSn');
    if (!snInput) return;
    snInput.classList.remove('scan-flash-success', 'scan-flash-error');
    void snInput.offsetWidth;
    snInput.classList.add(status === 'success' ? 'scan-flash-success' : 'scan-flash-error');
    
    playAudioFeedback(status);

    setTimeout(() => {
        snInput.classList.remove('scan-flash-success', 'scan-flash-error');
    }, 300);
}

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

async function handleInboundSubmit(e) {
    if (e) e.preventDefault();

    const snInput = document.getElementById('inboundSn');
    if (!snInput) return;

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
        triggerScanInputFlash('error');
        showToast('⚠️ กรุณาระบุหมวดหมู่ SKU และชื่อรุ่นสินค้าก่อนทำการสแกนรับเข้า', true);
        snInput.select();
        return;
    }

    const currentSelectedLoc = getSelectedLocationFromDropdowns();

    snInput.value = '';
    ensureSnInputFocus(true);

    scanProcessingQueue.push({
        sn: cleanSn,
        category,
        name,
        meterVal,
        location: currentSelectedLoc,
        timestamp: Date.now()
    });

    recordScanSpeedMetrics();

    if (!isProcessingScanQueue) {
        processScanProcessingQueue();
    }
}

async function processScanProcessingQueue() {
    if (isProcessingScanQueue || scanProcessingQueue.length === 0) return;
    isProcessingScanQueue = true;

    while (scanProcessingQueue.length > 0) {
        const item = scanProcessingQueue.shift();
        const { sn, category, name, meterVal, location } = item;

        let dbLocation = location || getSelectedLocationFromDropdowns();
        const snUpper = sn.toUpperCase();

        // 🟢 STRICT 1: บล็อกการสแกน S/N ซ้ำเด็ดขาดในทุกกรณี
        const isDuplicateSn = pendingFastSnSet.has(snUpper) ||
                              (typeof globalInventoryData !== 'undefined' && globalInventoryData.some(i => i && String(i.sn).toUpperCase() === snUpper && i.status !== 'OUT' && !i.is_deleted)) ||
                              (typeof recentInboundList !== 'undefined' && recentInboundList.some(r => r && String(r.sn).toUpperCase() === snUpper));

        if (isDuplicateSn) {
            triggerScanInputFlash('duplicate');
            showToast(`⚠️ ซีเรียล S/N: ${sn} มีอยู่ในคลังสินค้าเรียบร้อยแล้ว ห้ามสแกนซ้ำเด็ดขาด!`, true);
            ensureSnInputFocus(true);
            continue;
        }

        // 🟢 STRICT 2: 1 SN ต่อ 1 พิกัดจัดเก็บเท่านั้น (ห้ามยิงซ้ำลงพิกัดที่มีสินค้าตั้งอยู่แล้ว)
        const specialLocations = ['DOCK', 'OFFICE', 'PENDING', 'FOOD', 'FREEZER', 'COLD', 'DRY', 'RAW'];
        const isSpecialZone = specialLocations.includes(dbLocation.toUpperCase());

        if (!isSpecialZone) {
            const occupiedSet = getAllOccupiedLocationsSet();
            const normLocKey = getNormalizedLocKey(dbLocation);
            const isLocOccupied = occupiedSet.has(dbLocation) || (normLocKey && occupiedSet.has(normLocKey));

            if (isLocOccupied) {
                const occupyingItem = getOccupyingSnDetails(dbLocation);
                const occupyingSn = occupyingItem ? occupyingItem.sn : 'ไม่ทราบ S/N';

                triggerScanInputFlash('occupied');
                showToast(`⚠️ พิกัด ${formatLocationSpaced(dbLocation)} มีสินค้า (S/N: ${occupyingSn}) จัดเก็บอยู่แล้ว (ระบบกำหนด 1 SN ต่อ 1 พิกัดเท่านั้น)`, true);

                forceSyncAndSelectAvailableLocation();
                ensureSnInputFocus(true);
                continue;
            }
        }

        pendingFastSnSet.add(snUpper);
        addOccupiedLocToSet(pendingFastLocationSet, dbLocation);

        const activeUserFullName = getCurrentUserFullName();
        const nowISO = new Date().toISOString();
        const currentTimeStr = new Date().toLocaleTimeString('th-TH');

        const rawPayload = { 
            category, 
            name, 
            sn, 
            meter: meterVal, 
            location: dbLocation,
            qty: 1, 
            status: 'IN_STOCK',
            receiver: activeUserFullName,
            created_by: activeUserFullName,
            received_by: activeUserFullName,
            created_at: nowISO 
        };

        recentInboundList.unshift({
            sn, 
            category, 
            name, 
            meter: meterVal, 
            location: dbLocation,
            receiver: activeUserFullName,
            created_by: activeUserFullName,
            received_by: activeUserFullName,
            time: currentTimeStr,
            created_at: nowISO,
            isOffline: false
        });
        if (recentInboundList.length > 100) recentInboundList.length = 100;

        forceSyncAndSelectAvailableLocation();
        triggerScanInputFlash('success');
        showToast(`✅ สแกนรับเข้าสำเร็จ: S/N ${sn} -> พิกัด ${formatLocationSpaced(dbLocation)} (${activeUserFullName})`);
        scheduleDebouncedFeedRender();

        (async () => {
            if (navigator.onLine && typeof _supabase !== 'undefined' && _supabase) {
                try {
                    const cleanData = typeof sanitizeForDb === 'function' ? sanitizeForDb(rawPayload) : rawPayload;
                    const { data, error } = await _supabase.from('warehouse_items').insert([cleanData]).select('*');
                    if (!error && data && data[0]) {
                        const matched = recentInboundList.find(r => r.sn === sn);
                        if (matched) matched.id = data[0].id;
                    } else if (error) {
                        console.error("Supabase insert error:", error);
                    }
                } catch (err) {
                    console.error("DB Save Exception:", err);
                }
            }
            invalidateOccupiedLocationsCache();
        })();

        await new Promise(resolve => setTimeout(resolve, 5));
    }

    isProcessingScanQueue = false;
    ensureSnInputFocus(true);
}

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
            recentInboundList = data.map(item => {
                let rName = item.receiver || item.created_by || item.received_by;
                if (!rName || rName === 'nakorn.c' || rName === 'Nakorn C' || rName === 'ไม่ระบุผู้บันทึก') {
                    rName = getCurrentUserFullName();
                }
                return {
                    id: item.id,
                    sn: item.sn,
                    category: item.category || 'N/A',
                    name: item.name || '-',
                    meter: item.meter || 0,
                    location: item.location || 'DOCK',
                    receiver: escapeHTML(rName),
                    created_by: escapeHTML(rName),
                    received_by: escapeHTML(rName),
                    time: item.created_at ? new Date(item.created_at).toLocaleTimeString('th-TH') : '-',
                    created_at: item.created_at,
                    isOffline: false
                };
            });
            scheduleDebouncedFeedRender();
        }
    } catch (e) {}
}

function updateMasterDbCountBadge() {
    const badgeElem = document.getElementById('masterDbCountBadge') || document.getElementById('sidebarDbStatusBox');
    if (!badgeElem) return;

    const masterList = typeof globalMasterProducts !== 'undefined' ? globalMasterProducts : [];
    const inventoryList = typeof globalInventoryData !== 'undefined' ? globalInventoryData : [];

    const totalMasterCount = masterList.length;
    const totalInventoryCount = inventoryList.length;

    const uniqueModelNames = new Set();
    masterList.concat(inventoryList).forEach(item => {
        if (!item) return;
        const modelName = (item.name || item.description || item.model || '').trim();
        if (modelName) uniqueModelNames.add(modelName.toLowerCase());
    });
    const totalModelCount = uniqueModelNames.size;

    badgeElem.innerHTML = `
        <div class="db-status-container-2line">
            <div class="db-status-line line-1">
                <span class="db-online-tag"><span class="pulse-live-dot"></span> เชื่อมต่อ DB สำเร็จ</span>
                <span class="db-stat-item"><i class="fa-solid fa-database"></i> Master <strong>${totalMasterCount.toLocaleString()}</strong> SKU</span>
            </div>
            <div class="db-status-line line-2">
                <span class="db-stat-item"><i class="fa-solid fa-boxes-stacked"></i> ในสต็อก <strong>${totalInventoryCount.toLocaleString()}</strong> ชิ้น</span>
                <span class="db-stat-item"><i class="fa-solid fa-tags"></i> ใน DB <strong>${totalModelCount.toLocaleString()}</strong> รุ่น</span>
            </div>
        </div>
    `;
}

function onSkuSearchInput(val) {
    const box = document.getElementById('skuSuggestionsBox');
    if (!box) return;

    const masterList = (typeof globalMasterProducts !== 'undefined' ? globalMasterProducts : [])
        .concat(typeof globalInventoryData !== 'undefined' ? globalInventoryData : []);

    const uniqueModelNames = new Set();
    masterList.forEach(item => {
        if (!item) return;
        const modelName = (item.name || item.description || item.model || '').trim();
        if (modelName) uniqueModelNames.add(modelName.toLowerCase());
    });
    const totalModelCount = uniqueModelNames.size;

    if (!val.trim()) {
        box.style.display = 'none';
        return;
    }

    const query = val.toLowerCase().trim();
    const skuMap = new Map();

    for (let i = 0; i < masterList.length; i++) {
        const item = masterList[i];
        if (!item) continue;
        const skuKey = (item.sku || item.category || item.code || '').trim();
        const nameVal = (item.name || item.description || item.model || '').trim();

        if (skuKey && !skuMap.has(skuKey.toLowerCase())) {
            if (skuKey.toLowerCase().includes(query) || nameVal.toLowerCase().includes(query)) {
                skuMap.set(skuKey.toLowerCase(), { sku: skuKey, name: nameVal });
            }
        }
        if (skuMap.size >= 100) break;
    }

    const uniqueResults = Array.from(skuMap.values());

    let headerHtml = `
        <div style="padding:8px 12px; background:var(--bg-subtle, #f1f5f9); border-bottom:1px solid var(--border-color, #e2e8f0); display:flex; justify-content:space-between; align-items:center; font-size:0.78rem; color:var(--text-sub);">
            <span><i class="fa-solid fa-magnifying-glass"></i> ผลการค้นหา (${uniqueResults.length})</span>
            <span style="background:var(--primary-light, #e0f2fe); color:var(--primary-text, #0284c7); padding:2px 8px; border-radius:10px; font-weight:600; font-size:0.75rem;">
                <i class="fa-solid fa-tags"></i> มี ${totalModelCount.toLocaleString()} ชื่อรุ่นใน DB
            </span>
        </div>
    `;

    if (uniqueResults.length === 0) {
        box.innerHTML = headerHtml + `<div style="padding:10px; text-align:center; color:var(--text-muted); font-size:0.82rem;">ไม่พบสินค้าในฐานข้อมูล (${masterList.length.toLocaleString()} รายการ)</div>`;
        box.style.display = 'block';
        return;
    }

    let html = headerHtml;
    uniqueResults.forEach(item => {
        const itemSku = escapeHTML(item.sku);
        const itemName = escapeHTML(item.name || 'ไม่ระบุชื่อรุ่น');
        html += `
            <div class="suggestion-item" style="padding:9px 12px; cursor:pointer; border-bottom:1px solid var(--border-color); display:flex; justify-content:space-between; align-items:center;" onclick="selectSkuSuggestion('${itemSku}', '${itemName}')">
                <div style="display:flex; align-items:center; gap:8px; overflow:hidden;">
                    <span class="mono font-bold" style="color:var(--primary-text); font-size:0.88rem; flex-shrink:0;">${itemSku}</span>
                    <span style="color:var(--text-muted); font-size:0.82rem;">—</span>
                    <span style="color:var(--text-main); font-size:0.85rem; font-weight:600; text-overflow:ellipsis; overflow:hidden; white-space:nowrap;">
                        <i class="fa-solid fa-box-archive" style="font-size:0.75rem; color:var(--primary); margin-right:4px;"></i> ${itemName}
                    </span>
                </div>
                <span style="font-size:0.75rem; color:var(--text-sub); flex-shrink:0; background:var(--bg-body, #f8fafc); padding:2px 8px; border-radius:6px; border:1px solid var(--border-color); font-weight:600;">
                    <i class="fa-solid fa-tag" style="color:var(--primary);"></i> ชื่อรุ่น
                </span>
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

function initMasterProductsRealtime() {
    const client = typeof getSupabaseClient === 'function' ? getSupabaseClient() : (typeof _supabase !== 'undefined' ? _supabase : null);
    if (!client) return;

    try {
        client
            .channel('public_products_changes_inbound')
            .on('postgres_changes', { event: '*', schema: 'public', table: 'products' }, async (payload) => {
                if (typeof loadMasterProductsFromDB === 'function') {
                    await loadMasterProductsFromDB();
                    updateMasterDbCountBadge();
                }
            })
            .subscribe();
    } catch (e) {}
}

async function autoRefreshInboundDatabaseAndLocations() {
    invalidateOccupiedLocationsCache();

    if (typeof fetchInventoryData === 'function') {
        try { await fetchInventoryData(); } catch(e) {}
    } else if (typeof loadInventoryFromDB === 'function') {
        try { await loadInventoryFromDB(); } catch(e) {}
    }
    
    if (typeof loadRecentInboundFeedFromDB === 'function') {
        try { await loadRecentInboundFeedFromDB(); } catch(e) {}
    }

    forceSyncAndSelectAvailableLocation();
    scheduleDebouncedFeedRender();
    ensureSnInputFocus();
}

function initWarehouseItemsRealtime() {
    const client = typeof getSupabaseClient === 'function' ? getSupabaseClient() : (typeof _supabase !== 'undefined' ? _supabase : null);
    if (!client) return;

    try {
        client
            .channel('public_warehouse_items_realtime_inbound_v35')
            .on('postgres_changes', { event: '*', schema: 'public', table: 'warehouse_items' }, async (payload) => {
                if (payload.eventType === 'DELETE') {
                    const oldObj = payload.old || {};
                    purgeDispatchedOrDeletedItemFromMemory(oldObj.sn, oldObj.id, oldObj.location);
                } else if (payload.eventType === 'UPDATE' && payload.new) {
                    const statusUpper = String(payload.new.status || '').toUpperCase();
                    const isOut = statusUpper === 'OUT' || statusUpper === 'DISPATCHED' || statusUpper === 'ISSUED' || statusUpper === 'RELEASED' || payload.new.is_deleted || Number(payload.new.qty) <= 0;

                    if (isOut) {
                        purgeDispatchedOrDeletedItemFromMemory(payload.new.sn, payload.new.id, payload.new.location);
                    } else {
                        if (typeof globalInventoryData !== 'undefined' && Array.isArray(globalInventoryData)) {
                            const idx = globalInventoryData.findIndex(item => item && (item.id === payload.new.id || (payload.new.sn && String(item.sn).toUpperCase() === String(payload.new.sn).toUpperCase())));
                            if (idx !== -1) {
                                globalInventoryData[idx] = { ...globalInventoryData[idx], ...payload.new };
                            } else {
                                globalInventoryData.unshift(payload.new);
                            }
                        }
                        const matchedFeed = recentInboundList.find(r => r.id === payload.new.id || (payload.new.sn && String(r.sn).toUpperCase() === String(payload.new.sn).toUpperCase()));
                        if (matchedFeed) {
                            matchedFeed.location = payload.new.location || matchedFeed.location;
                            matchedFeed.receiver = getCurrentUserFullName();
                        }
                    }
                } else if (payload.eventType === 'INSERT' && payload.new) {
                    if (typeof globalInventoryData !== 'undefined' && Array.isArray(globalInventoryData)) {
                        const exists = globalInventoryData.some(item => item && (item.id === payload.new.id || (payload.new.sn && String(item.sn).toUpperCase() === String(payload.new.sn).toUpperCase())));
                        if (!exists) {
                            globalInventoryData.unshift(payload.new);
                        }
                    }
                    const existsInFeed = recentInboundList.some(r => r.id === payload.new.id || (payload.new.sn && String(r.sn).toUpperCase() === String(payload.new.sn).toUpperCase()));
                    if (!existsInFeed) {
                        recentInboundList.unshift({
                            id: payload.new.id,
                            sn: payload.new.sn,
                            category: payload.new.category || 'N/A',
                            name: payload.new.name || '-',
                            meter: payload.new.meter || 0,
                            location: payload.new.location || 'DOCK',
                            receiver: getCurrentUserFullName(),
                            created_by: getCurrentUserFullName(),
                            received_by: getCurrentUserFullName(),
                            time: payload.new.created_at ? new Date(payload.new.created_at).toLocaleTimeString('th-TH') : new Date().toLocaleTimeString('th-TH'),
                            created_at: payload.new.created_at,
                            isOffline: false
                        });
                    }
                }

                await autoRefreshInboundDatabaseAndLocations();
                
                document.dispatchEvent(new CustomEvent('inventoryDataChanged', { detail: payload }));
                document.dispatchEvent(new CustomEvent('inventoryUpdated', { detail: payload }));
            })
            .subscribe();
    } catch (e) {}
}

function initCrossTabBroadcastListener() {
    try {
        if (typeof BroadcastChannel !== 'undefined') {
            const channel = new BroadcastChannel('wms_realtime_sync_channel');
            channel.onmessage = async (event) => {
                const data = event.data;
                if (!data) return;

                const actionUpper = String(data.action || data.type || '').toUpperCase();
                if (actionUpper.includes('DELETE') || actionUpper.includes('DISPATCH') || actionUpper.includes('OUT') || actionUpper.includes('ISSUE') || actionUpper.includes('TRANSFER')) {
                    purgeDispatchedOrDeletedItemFromMemory(data.sn, data.id, data.location);
                }

                await autoRefreshInboundDatabaseAndLocations();
            };
        }
    } catch (e) {}
}

function injectModernScanUIStyles() {
    if (document.getElementById('fastScanModernStyles')) return;
    const styleElem = document.createElement('style');
    styleElem.id = 'fastScanModernStyles';
    styleElem.textContent = `
        .scan-flash-success { animation: scanFlashGreen 0.3s cubic-bezier(0.4, 0, 0.2, 1) !important; }
        .scan-flash-error { animation: scanFlashRed 0.3s cubic-bezier(0.4, 0, 0.2, 1) !important; }
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
        .pulse-live-dot {
            display: inline-block;
            width: 8px;
            height: 8px;
            background: #10b981;
            border-radius: 50%;
            box-shadow: 0 0 8px #10b981;
            animation: pulseLiveDot 1.2s infinite alternate;
        }
        @keyframes pulseLiveDot {
            from { opacity: 0.4; transform: scale(0.85); }
            to { opacity: 1; transform: scale(1.15); }
        }
        .glass-hud-box {
            margin-top: 12px;
            padding: 14px;
            background: var(--bg-surface, #ffffff);
            border: 1px solid var(--border-color, #e2e8f0);
            border-radius: 14px;
            box-shadow: var(--shadow-sm);
            font-size: 0.84rem;
            transition: all 0.3s ease;
        }
        .feed-card-actions {
            display: flex;
            align-items: center;
            gap: 6px;
        }
        .btn-card-action {
            background: var(--bg-subtle, #f1f5f9);
            border: 1px solid var(--border-color, #e2e8f0);
            border-radius: 6px;
            padding: 3px 8px;
            font-size: 0.72rem;
            color: var(--text-sub, #334155);
            cursor: pointer;
            transition: all 0.2s ease;
        }
        .btn-card-action:hover {
            background: var(--primary-light, #e0f2fe);
            color: var(--primary-text, #0284c7);
            border-color: var(--primary-border, #bae6fd);
        }
    `;
    document.head.appendChild(styleElem);
}

function onRecentFeedSearch(queryText) {
    recentFeedSearchQuery = (queryText || '').toLowerCase().trim();
    renderLiveInboundFeed();
}

function triggerReprintStickerFromFeed(sn, name = '', category = '', location = '') {
    if (!sn) return;

    if (typeof window.openPrintBarcodeModal === 'function') {
        window.openPrintBarcodeModal('SINGLE', sn);
        showToast(`🖨️ ดีดไปที่ศูนย์พิมพ์บาร์โค้ดเรียบร้อย: S/N ${sn}`, false);
        return;
    } 

    if (typeof window.printSingleBarcode === 'function') {
        window.printSingleBarcode(sn);
        showToast(`🖨️ เปิดการพิมพ์บาร์โค้ด: S/N ${sn}`, false);
        return;
    }

    if (typeof window.triggerBarcodePrint === 'function') {
        window.triggerBarcodePrint(sn);
        showToast(`🖨️ พิมพ์บาร์โค้ด S/N ${sn}`, false);
        return;
    }

    if (typeof window.openThermalPrintModal === 'function') {
        window.openThermalPrintModal({ sn, name, category, location });
        return;
    }

    if (typeof window.printBarcodeSticker === 'function') {
        window.printBarcodeSticker({ sn, name, category, location });
        return;
    }

    copyToClipboard(sn);
    showToast(`📋 คัดลอก S/N ${sn} สำเร็จแล้ว`, false);
}

// 🟢 REALTIME FEED RENDERER: แยกพิกัด ล็อก ชั้น ช่อง ออกเป็นชิ้นส่วนชัดเจน 100%
function renderLiveInboundFeed() {
    const container = document.getElementById('liveInboundFeedContainer');
    if (!container) return;

    updateMasterDbCountBadge();

    let filteredList = recentInboundList;
    if (recentFeedSearchQuery) {
        filteredList = recentInboundList.filter(item => {
            if (!item) return false;
            const snMatch = String(item.sn || '').toLowerCase().includes(recentFeedSearchQuery);
            const nameMatch = String(item.name || '').toLowerCase().includes(recentFeedSearchQuery);
            const catMatch = String(item.category || '').toLowerCase().includes(recentFeedSearchQuery);
            const locMatch = String(item.location || '').toLowerCase().includes(recentFeedSearchQuery);
            const receiverMatch = String(item.receiver || item.received_by || '').toLowerCase().includes(recentFeedSearchQuery);
            return snMatch || nameMatch || catMatch || locMatch || receiverMatch;
        });
    }

    if (recentInboundList.length === 0) {
        container.innerHTML = `
            <div style="padding:28px 16px; text-align:center; color:var(--text-muted); font-size:0.88rem; background:var(--bg-surface); border-radius:var(--radius-md); border:1px solid var(--border-color);">
                <i class="fa-solid fa-box-open" style="font-size:2.2rem; margin-bottom:8px; opacity:0.3; color:var(--primary);"></i><br/>
                ยังไม่มีรายการรับเข้าในเซสชันนี้
            </div>`;
        return;
    }

    const countElem = document.getElementById('recentInboundCountBadge');
    if (countElem) countElem.textContent = `${recentInboundList.length} รายการ`;

    const currentActiveUserName = getCurrentUserFullName();

    let html = `
        <div style="display:flex; flex-direction:column; gap:8px; margin-bottom:12px;">
            <div style="display:flex; justify-content:space-between; align-items:center;">
                <div style="display:flex; align-items:center; gap:8px;">
                    <span class="pulse-live-dot"></span>
                    <span style="font-size:0.88rem; font-weight:700; color:var(--text-main);">
                        ประวัติการรับเข้าล่าสุด Realtime 100% (${filteredList.length}/${recentInboundList.length})
                    </span>
                </div>
                <button class="btn btn-sm btn-secondary" onclick="clearRecentInboundFeedView()" style="font-size:0.72rem; padding:3px 8px;" title="ล้างหน้าจอแสดงผล">
                    <i class="fa-solid fa-eraser"></i> เคลียร์
                </button>
            </div>
            <div style="position:relative; width:100%;">
                <input type="text" 
                       id="recentFeedSearchInput" 
                       oninput="onRecentFeedSearch(this.value)" 
                       value="${escapeHTML(recentFeedSearchQuery)}"
                       placeholder="🔍 ค้นหาในประวัติ (S/N, SKU, พิกัด, ผู้รับ)..." 
                       style="width:100%; padding:6px 12px 6px 30px; font-size:0.78rem; border-radius:8px; border:1px solid var(--border-color); background:var(--bg-subtle); color:var(--text-main); outline:none;" />
                <i class="fa-solid fa-magnifying-glass" style="position:absolute; left:10px; top:50%; transform:translateY(-50%); font-size:0.75rem; color:var(--text-muted);"></i>
            </div>
        </div>
        <div class="inbound-feed-scroll-wrapper" style="max-height: calc(100vh - 330px); overflow-y: auto; padding-right: 8px; margin-right: -4px;">
            <div class="inbound-feed-grid" style="display:grid; grid-template-columns: repeat(auto-fill, minmax(260px, 1fr)); gap:10px;">
    `;

    if (filteredList.length === 0) {
        html += `
            <div style="grid-column: 1 / -1; padding:20px; text-align:center; color:var(--text-muted); font-size:0.82rem; background:var(--bg-surface); border-radius:8px; border:1px dashed var(--border-color);">
                ไม่พบรายการประวัติที่ตรงกับ "${escapeHTML(recentFeedSearchQuery)}"
            </div>
        `;
    } else {
        filteredList.forEach(item => {
            const locBadgeHTML = formatLocationBadgeHTML(item.location);
            
            let displayReceiver = item.receiver || item.received_by || item.created_by;
            if (!displayReceiver || displayReceiver === 'nakorn.c' || displayReceiver === 'Nakorn C' || displayReceiver === 'ไม่ระบุผู้บันทึก') {
                displayReceiver = currentActiveUserName;
            }
            
            const receiverName = escapeHTML(displayReceiver);
            const itemSn = escapeHTML(item.sn);
            const itemCategory = escapeHTML(item.category);
            const itemName = escapeHTML(item.name);
            const itemTime = escapeHTML(item.time || (item.created_at ? new Date(item.created_at).toLocaleTimeString('th-TH') : '-'));

            html += `
                <div class="feed-item modern-feed-card animate-feed-entry">
                    <div style="display:flex; justify-content:space-between; align-items:center; width:100%; gap:6px;">
                        <span class="mono font-bold" style="color:var(--text-main); font-size:0.88rem; display:flex; align-items:center; gap:4px; overflow:hidden; text-overflow:ellipsis; white-space:nowrap;">
                            S/N: ${itemSn}
                        </span>
                        <div class="feed-card-actions">
                            <button type="button" class="btn-card-action" onclick="copyToClipboard('${itemSn}'); showToast('📋 คัดลอก S/N สำเร็จ: ${itemSn}');" title="คัดลอก S/N">
                                <i class="fa-regular fa-copy"></i>
                            </button>
                            <button type="button" class="btn-card-action" onclick="triggerReprintStickerFromFeed('${itemSn}', '${itemName}', '${itemCategory}', '${item.location}')" title="ดีดไปที่ศูนย์พิมพ์บาร์โค้ดเพื่อพิมพ์ทันที">
                                <i class="fa-solid fa-print"></i> พิมพ์
                            </button>
                            <span class="badge-action inbound" style="font-size:0.68rem; padding:2px 6px; flex-shrink:0;">
                                <i class="fa-solid fa-circle-check"></i> สำเร็จ
                            </span>
                        </div>
                    </div>

                    <div style="display:flex; flex-direction:column; gap:4px; background:var(--bg-subtle, #f1f5f9); padding:6px 10px; border-radius:8px; border:1px solid var(--border-color);">
                        <div style="display:flex; justify-content:space-between; align-items:center;">
                            <span style="font-size:0.72rem; color:var(--text-muted); font-weight:700;">📍 พิกัดรับเข้าจริง (DB: ${escapeHTML(item.location)}):</span>
                        </div>
                        <div style="display:flex; flex-wrap:wrap; align-items:center; gap:4px; width:100%;">
                            ${locBadgeHTML}
                        </div>
                    </div>

                    <div style="font-size:0.8rem; color:var(--text-sub); line-height:1.25; word-break:break-word;" title="[${itemCategory}] ${itemName}">
                        <strong style="color:var(--primary-text);">[${itemCategory}]</strong> ${itemName}
                    </div>

                    <div style="display:flex; justify-content:space-between; align-items:center; font-size:0.72rem; color:var(--text-muted); border-top:1px dashed var(--border-color); padding-top:4px; margin-top:2px;">
                        <span style="font-weight:600; color:var(--text-main);"><i class="fa-solid fa-user-check" style="color:var(--success);"></i> ${receiverName}</span>
                        <span><i class="fa-regular fa-clock"></i> ${itemTime} น.</span>
                    </div>
                </div>
            `;
        });
    }

    html += `
            </div>
        </div>
    `;
    container.innerHTML = html;
}

function clearRecentInboundFeedView() {
    recentInboundList = [];
    renderLiveInboundFeed();
    ensureSnInputFocus();
}

function copyToClipboard(text) {
    if (navigator.clipboard && navigator.clipboard.writeText) {
        navigator.clipboard.writeText(text);
    } else {
        const textarea = document.createElement('textarea');
        textarea.value = text;
        document.body.appendChild(textarea);
        textarea.select();
        document.execCommand('copy');
        document.body.removeChild(textarea);
    }
}

function initInboundEventListeners() {
    injectModernScanUIStyles();
    initFrontendSecurityGuards();
    checkAndHideLoginOverlay();

    loadRecentInboundFeedFromDB();

    document.addEventListener('biometricLoginSuccess', function(e) {
        const userName = (e && e.detail && e.detail.userName) ? e.detail.userName : getCurrentUserFullName();
        showBiometricSuccessToast(userName);
    });

    const snInput = document.getElementById('inboundSn');
    if (snInput) {
        snInput.addEventListener('keydown', function(e) {
            if (e.key === 'Enter' || e.code === 'Enter' || e.code === 'NumpadEnter' || e.key === 'Tab') {
                e.preventDefault();
                handleInboundSubmit(e);
            }
        });
        snInput.addEventListener('blur', () => setTimeout(ensureSnInputFocus, 50));
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

    const realtimeEvents = [
        'inventoryUpdated', 'inventoryDeleted', 'inventoryDispatched',
        'inventoryDataChanged', 'wmsRealtimeSync', 'warehouseConfigUpdated', 
        'locationLayoutChanged', 'itemDeleted', 'itemDispatched',
        'stockUpdated', 'outboundCompleted'
    ];

    realtimeEvents.forEach(evtName => {
        document.addEventListener(evtName, async function(e) {
            if (e && e.detail) {
                const detail = e.detail;
                const targetSn = detail.sn || detail.serialNumber || detail.SN;
                const targetId = detail.id;
                const targetLoc = detail.location || detail.loc;

                const statusUpper = String(detail.status || detail.action || '').toUpperCase();
                const isRemoval = evtName.toLowerCase().includes('delete') || 
                                  evtName.toLowerCase().includes('dispatch') || 
                                  evtName.toLowerCase().includes('outbound') ||
                                  statusUpper.includes('DELETE') || 
                                  statusUpper.includes('OUT') || 
                                  statusUpper.includes('DISPATCH') || 
                                  statusUpper.includes('ISSUE') || 
                                  detail.is_deleted;

                if (isRemoval) {
                    purgeDispatchedOrDeletedItemFromMemory(targetSn, targetId, targetLoc);
                }
            }
            await autoRefreshInboundDatabaseAndLocations();
        }, true);
    });

    window.addEventListener('storage', async function(e) {
        if (e.key === 'WMS_AISLE_CONFIGS' || e.key === 'WMS_INVENTORY_DATA' || e.key === 'WMS_LAST_MUTATION' || e.key === 'WMS_MASTER_AISLES' || e.key === 'WMS_DELETED_ITEM' || e.key === 'WMS_DISPATCHED_ITEM') {
            if ((e.key === 'WMS_DELETED_ITEM' || e.key === 'WMS_DISPATCHED_ITEM') && e.newValue) {
                try {
                    const itemObj = JSON.parse(e.newValue);
                    purgeDispatchedOrDeletedItemFromMemory(itemObj.sn, itemObj.id, itemObj.location);
                } catch(err) {}
            }
            await autoRefreshInboundDatabaseAndLocations();
        }
    });

    forceSyncAndSelectAvailableLocation();
    initMasterProductsRealtime();
    initWarehouseItemsRealtime();
    initCrossTabBroadcastListener();
    ensureSnInputFocus();
}

if (typeof window !== 'undefined') {
    window.recentInboundList = recentInboundList;
    window.ensureSnInputFocus = ensureSnInputFocus;
    window.getCurrentUserFullName = getCurrentUserFullName;
    window.getAisleConfig = getAisleConfig;
    window.parseLocComponentsInternal = parseLocComponentsInternal;
    window.getNormalizedLocKey = getNormalizedLocKey;
    window.normalizeLocationStandard = normalizeLocationStandard;
    window.formatLocationSpaced = formatLocationSpaced;
    window.formatLocationCode = formatLocationCode;
    window.formatLocationBadgeHTML = formatLocationBadgeHTML;
    window.getOccupyingSnDetails = getOccupyingSnDetails;
    window.getAllOccupiedLocationsSet = getAllOccupiedLocationsSet;
    window.invalidateOccupiedLocationsCache = invalidateOccupiedLocationsCache;
    window.purgeDispatchedOrDeletedItemFromMemory = purgeDispatchedOrDeletedItemFromMemory;
    window.purgeDeletedSnFromMemory = purgeDeletedSnFromMemory;
    window.calculateNextAvailableSlotInShelf = calculateNextAvailableSlotInShelf;
    window.calculateNextAvailableSlotInBayStrictAisle = calculateNextAvailableSlotInBayStrictAisle;
    window.calculateAisleCapacityAndNextSlot = calculateAisleCapacityAndNextSlot;
    window.populateInboundSlotDropdown = populateInboundSlotDropdown;
    window.populateInboundLocationDropdownsStrict = populateInboundLocationDropdownsStrict;
    window.onInboundAisleChange = onInboundAisleChange;
    window.onInboundBayChange = onInboundBayChange;
    window.onInboundShelfChange = onInboundShelfChange;
    window.onInboundSlotChange = onInboundSlotChange;
    window.updateInboundLocationPreviewFromDropdowns = updateInboundLocationPreviewFromDropdowns;
    window.getSelectedLocationFromDropdowns = getSelectedLocationFromDropdowns;
    window.renderAisleSlotBreakdownUI = renderAisleSlotBreakdownUI;
    window.autoSelectNextAvailableSlotAfterInbound = autoSelectNextAvailableSlotAfterInbound;
    window.forceSyncAndSelectAvailableLocation = forceSyncAndSelectAvailableLocation;
    window.triggerAutoFindNextSlot = triggerAutoFindNextSlot;
    window.handleInboundSubmit = handleInboundSubmit;
    window.processScanProcessingQueue = processScanProcessingQueue;
    window.loadRecentInboundFeedFromDB = loadRecentInboundFeedFromDB;
    window.renderLiveInboundFeed = renderLiveInboundFeed;
    window.clearRecentInboundFeedView = clearRecentInboundFeedView;
    window.copyToClipboard = copyToClipboard;
    window.onSkuSearchInput = onSkuSearchInput;
    window.selectSkuSuggestion = selectSkuSuggestion;
    window.updateMasterDbCountBadge = updateMasterDbCountBadge;
    window.checkAndHideLoginOverlay = checkAndHideLoginOverlay;
    window.showToast = showToast;
    window.showToastPopup = showToastPopup;
    window.showBiometricSuccessToast = showBiometricSuccessToast;
    window.toggleMobileSidebar = toggleMobileSidebar;
    window.initMasterProductsRealtime = initMasterProductsRealtime;
    window.initWarehouseItemsRealtime = initWarehouseItemsRealtime;
    window.initCrossTabBroadcastListener = initCrossTabBroadcastListener;
    window.initInboundEventListeners = initInboundEventListeners;
    window.autoRefreshInboundDatabaseAndLocations = autoRefreshInboundDatabaseAndLocations;
    window.onRecentFeedSearch = onRecentFeedSearch;
    window.triggerReprintStickerFromFeed = triggerReprintStickerFromFeed;
    window.playAudioFeedback = playAudioFeedback;
}

document.addEventListener('DOMContentLoaded', () => {
    initInboundEventListeners();
});