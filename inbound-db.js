// =========================================================================
// --- MODULE 3: FAST INBOUND DATABASE ENGINE (ENTERPRISE REALTIME v6.5.0) ---
// --- Mobile/All Devices Auto Camera Scanner & Single Receiver Column Standard ---
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

// 🔍 Filter & Search State for Recent Inbound Feed
let recentFeedSearchQuery = '';

// 📹 CAMERA SCANNER STREAM STATE & ENGINE
let activeCameraStream = null;
let isCameraScannerActive = false;
let cameraScanInterval = null;
let html5QrCodeScanner = null;
let currentCameraFacingMode = 'environment'; // 🟢 'environment' = กล้องหลัง, 'user' = กล้องหน้า
let isTorchOn = false; // 🟢 สถานะไฟฉาย

// 🔊 SOUND EFFECTS SYNTHESIZER (Enterprise WMS Web Audio API Standard)
function playAudioFeedback(type = 'success') {
    try {
        const AudioCtx = window.AudioContext || window.webkitAudioContext;
        if (!AudioCtx) return;
        const ctx = new AudioCtx();

        if (type === 'success') {
            const osc1 = ctx.createOscillator();
            const gain = ctx.createGain();
            osc1.type = 'sine';
            osc1.frequency.setValueAtTime(1760, ctx.currentTime);
            osc1.frequency.setValueAtTime(2637, ctx.currentTime + 0.06);
            gain.gain.setValueAtTime(0.12, ctx.currentTime);
            gain.gain.exponentialRampToValueAtTime(0.001, ctx.currentTime + 0.14);
            osc1.connect(gain);
            gain.connect(ctx.destination);
            osc1.start(ctx.currentTime);
            osc1.stop(ctx.currentTime + 0.14);
        } else if (type === 'duplicate') {
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

// 🔒 SECURITY HELPER: Prevent XSS Attack 100%
function escapeHTML(str) {
    if (str === null || str === undefined) return '';
    return String(str)
        .replace(/&/g, '&amp;')
        .replace(/</g, '&lt;')
        .replace(/>/g, '&gt;')
        .replace(/"/g, '&quot;')
        .replace(/'/g, '&#039;');
}

// 🔒 SECURITY GUARDS: ป้องกันการคัดลอกโค้ด & DevTools
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

// 🟢 Toast Notification Glassmorphism
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
            <button type="button" onclick="this.parentElement.parentElement.remove()" style="background:none; border:none; font-size:1.1rem; color:var(--text-muted, #64748b); cursor:pointer; padding:0 2px; opacity:0.6;">&times;</button>
        </div>
    `;

    overlay.appendChild(popupCard);
    requestAnimationFrame(() => popupCard.classList.add('show'));

    setTimeout(() => {
        popupCard.classList.remove('show');
        setTimeout(() => { if (popupCard.parentNode) popupCard.parentNode.removeChild(popupCard); }, 300);
    }, duration);
}

function showBiometricSuccessToast(userName) {
    showToastPopup(`🔓 ยืนยันตัวตนสำเร็จ: ยินดีต้อนรับคุณ ${userName}`, false, 3500);
}

// 🟢 ระบบเปิด-ปิด Sidebar Responsive มือถือ
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

// 🟢 คืนค่าและรีเซ็ตพิกัดจากความจำ พร้อมอัปเดตช่องว่างลำดับแรกอัตโนมัติ 100%
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
        saveRecentInboundFeedToCache();
    }

    if (targetSnUpper) pendingFastSnSet.delete(targetSnUpper);

    if (targetLocUpper) {
        removeOccupiedLocFromSet(pendingFastLocationSet, targetLocUpper);
        if (typeof occupiedLocationsSet !== 'undefined' && occupiedLocationsSet instanceof Set) {
            removeOccupiedLocFromSet(occupiedLocationsSet, targetLocUpper);
        }
    }

    invalidateOccupiedLocationsCache();
    // ⚡ อัปเดตหาพิกัดและช่องที่ว่างลำดับแรกให้อัตโนมัติในเบื้องหลัง 100%
    forceSyncAndSelectAvailableLocation(true);
    scheduleDebouncedFeedRender();
}

function purgeDeletedSnFromMemory(targetSn, targetId) {
    purgeDispatchedOrDeletedItemFromMemory(targetSn, targetId);
}

// 🗑️ ระบบลบรายการสินค้าในหน้า Feed แบบ Realtime 100%
async function deleteInboundItem(sn, id = '', location = '') {
    if (!sn && !id) return;

    if (!confirm(`⚠️ คุณแน่ใจหรือไม่ว่าต้องการลบรายการ S/N: ${sn} ออกจากฐานข้อมูลคลังสินค้า?`)) {
        return;
    }

    // 1. ลบออกจากหน่วยความจำ Local และ Cache ทันที (0ms Synchronous UI Update)
    purgeDispatchedOrDeletedItemFromMemory(sn, id, location);

    // 2. ลบออกจาก Supabase Database ในเบื้องหลัง 100%
    if (navigator.onLine && typeof _supabase !== 'undefined' && _supabase) {
        try {
            let query = _supabase.from('warehouse_items').delete();
            if (id) {
                query = query.eq('id', id);
            } else if (sn) {
                query = query.eq('sn', sn);
            }
            const { error } = await query;
            if (error) {
                console.error("Supabase delete error:", error);
                showToast(`⚠️ เกิดข้อผิดพลาดในการลบข้อมูลจากเซิร์ฟเวอร์: ${error.message}`, true);
            } else {
                showToast(`🗑️ ลบรายการ S/N: ${sn} ออกจากฐานข้อมูลเรียบร้อยแล้ว`, false);
            }
        } catch (err) {
            console.error("DB Delete Exception:", err);
        }
    }

    // 3. กระจายคำสั่งลบไปยัง Tab อื่นๆ แบบ Cross-Tab Realtime
    try {
        if (typeof BroadcastChannel !== 'undefined') {
            const channel = new BroadcastChannel('wms_realtime_sync_channel');
            channel.postMessage({ action: 'DELETE', sn, id, location });
        }
    } catch(e) {}

    // 4. คำนวณหาล็อกและช่องว่างลำดับแรกให้อัตโนมัติโดยผู้ใช้ไม่ต้องกดรีเฟรช
    forceSyncAndSelectAvailableLocation(true);
}

// 🟢 ดึงและแยกองค์ประกอบพิกัดจัดเก็บอย่างถูกต้องแม่นยำ 100% ไม่คำนวณชั้นผิดพลาด
function parseLocComponentsInternal(locStr) {
    if (!locStr) return null;
    let raw = String(locStr).trim().toUpperCase();
    raw = raw.replace(/^ร้านล็อก|^ร้าน/gi, '').trim();

    const specialList = ['DOCK', 'OFFICE', 'PENDING', 'FOOD', 'FREEZER', 'COLD', 'DRY', 'RAW'];
    if (specialList.includes(raw)) {
        return { isSpecial: true, code: raw };
    }

    let codeOnly = raw.replace(/แถว|ล็อก|ชั้น|ช่อง|BAY|SHELF|SLOT|•|📍/gi, ' ').trim();
    let parts = codeOnly.split(/[\-\/_ \t]+/).filter(Boolean);

    if (parts.length >= 4) {
        const aisleName = parts[0].trim().toUpperCase();
        const bayNum = parseInt(parts[1], 10);
        const shelfNum = parseInt(parts[2], 10);
        const slotRaw = parts[3].trim().toUpperCase();

        if (aisleName && !isNaN(bayNum) && !isNaN(shelfNum)) {
            const cfg = getAisleConfig(aisleName);
            const maxShelves = cfg ? (cfg.shelves || 10) : 10;
            const validShelf = (shelfNum > maxShelves && maxShelves > 0) ? Math.min(shelfNum, maxShelves) : shelfNum;
            const slotVal = slotRaw === 'FULL' ? 'FULL' : String(parseInt(slotRaw, 10) || 1).padStart(2, '0');

            return {
                isSpecial: false,
                aisle: aisleName,
                bay: String(bayNum).padStart(2, '0'),
                shelf: String(validShelf).padStart(2, '0'),
                slot: slotVal
            };
        }
    }

    const thaiMatch = raw.match(/แถว\s*([A-Z0-9]+)\s*ล็อก\s*(\d+)\s*ชั้น\s*(\d+)\s*ช่อง\s*(\d+|FULL)/i) ||
                      raw.match(/แถว\s*([A-Z0-9]+)(?:.*?ล็อก\s*(\d+))(?:.*?ชั้น\s*(\d+))(?:.*?ช่อง\s*(\d+|FULL))/i);
    if (thaiMatch && thaiMatch[1]) {
        const aisleName = thaiMatch[1].trim().toUpperCase();
        const bayNum = parseInt(thaiMatch[2], 10) || 1;
        const shelfNum = parseInt(thaiMatch[3], 10) || 1;
        const cfg = getAisleConfig(aisleName);
        const maxShelves = cfg ? (cfg.shelves || 10) : 10;
        const validShelf = (shelfNum > maxShelves && maxShelves > 0) ? Math.min(shelfNum, maxShelves) : shelfNum;
        const slotVal = thaiMatch[4] === 'FULL' ? 'FULL' : String(parseInt(thaiMatch[4], 10) || 1).padStart(2, '0');

        return {
            isSpecial: false,
            aisle: aisleName,
            bay: String(bayNum).padStart(2, '0'),
            shelf: String(validShelf).padStart(2, '0'),
            slot: slotVal
        };
    }

    if (parts.length === 3) {
        const aisleName = parts[0].trim().toUpperCase();
        const bayNum = parseInt(parts[1], 10) || 1;
        const shelfNum = parseInt(parts[2], 10) || 1;
        return {
            isSpecial: false,
            aisle: aisleName,
            bay: String(bayNum).padStart(2, '0'),
            shelf: String(shelfNum).padStart(2, '0'),
            slot: '01'
        };
    }

    let p = null;
    if (typeof window !== 'undefined' && typeof window.parseLocationComponents === 'function') {
        p = window.parseLocationComponents(raw);
    } else if (typeof parseLocationComponents === 'function') {
        p = parseLocationComponents(raw);
    }

    if (p && p.aisle && p.bay) {
        const aisleName = String(p.aisle).trim().toUpperCase();
        const cfg = getAisleConfig(aisleName);
        const maxShelves = cfg ? (cfg.shelves || 10) : 10;
        const rawShelf = parseInt(p.shelf, 10) || 1;
        const validShelf = (rawShelf > maxShelves && maxShelves > 0) ? Math.min(rawShelf, maxShelves) : rawShelf;

        return {
            isSpecial: false,
            aisle: aisleName,
            bay: String(parseInt(p.bay, 10) || 1).padStart(2, '0'),
            shelf: String(validShelf).padStart(2, '0'),
            slot: String(parseInt(p.slot, 10) || 1).padStart(2, '0')
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

// 🟢 👤 ดึงชื่อผู้ใช้ ชื่อ-นามสกุล ของคนที่ล็อกอินอยู่เข้าใช้งาน 100% บันทึกลง DB แม่นยำ (Single Column Standard: received_by)
function getCurrentUserFullName() {
    let userName = '';

    // 1. ตรวจสอบจาก DOM Element Badge ชื่อบนหน้าจอเว็บ
    const profileElem = document.querySelector('.user-profile-badge') || 
                        document.querySelector('.user-name') || 
                        document.getElementById('userProfileBadge') ||
                        document.getElementById('currentUserNameText') ||
                        document.getElementById('userNameDisplay') ||
                        document.querySelector('.username') ||
                        document.querySelector('[data-user-name]');
    if (profileElem) {
        const fullText = profileElem.innerText || profileElem.textContent || '';
        const cleanText = fullText.replace(/\(.*\)/g, '')
                                  .replace(/[\r\n\t]/g, '')
                                  .replace(/🟢|🔴|👤|👤\s*/g, '')
                                  .replace(/เข้าสู่ระบบ|Log\s*in|Sign\s*in/gi, '')
                                  .trim();
        if (cleanText && cleanText.length > 1 && cleanText !== 'ผู้ใช้งาน') {
            userName = cleanText;
        }
    }

    // 2. ตรวจสอบจาก Global Object ของระบบ
    if (!userName) {
        const globalUserObjs = [
            typeof window !== 'undefined' ? window.currentUser : null, 
            typeof currentUser !== 'undefined' ? currentUser : null,
            typeof window !== 'undefined' ? window.loggedInUser : null,
            typeof window !== 'undefined' ? window.userProfile : null,
            typeof window !== 'undefined' ? window.WMS_USER : null,
            typeof window !== 'undefined' ? window.activeUser : null
        ];

        for (const u of globalUserObjs) {
            if (!u) continue;
            if (typeof u === 'string' && u.trim().length > 1) {
                const cleanStr = u.replace(/\(.*\)/g, '').trim();
                if (cleanStr && cleanStr.length > 1 && !cleanStr.includes('{')) {
                    userName = cleanStr;
                    break;
                }
            }
            if (typeof u === 'object') {
                const meta = u.user_metadata || u.profile || u;
                const fn = meta.first_name || meta.firstname || meta.firstName || meta.full_name || meta.fullname || meta.name || meta.display_name || u.first_name || u.firstname || u.name || '';
                const ln = meta.last_name || meta.lastname || meta.lastName || u.last_name || u.lastname || '';
                if (fn || ln) {
                    const combined = `${fn} ${ln}`.trim();
                    if (combined && combined.length > 1) {
                        userName = combined;
                        break;
                    }
                }
                if (u.email) {
                    userName = u.email.split('@')[0];
                    break;
                }
            }
        }
    }

    // 3. ตรวจสอบจาก LocalStorage & SessionStorage ครอบคลุมทุกระบบ Login
    if (!userName) {
        const storageKeys = [
            'WMS_ACTIVE_USER', 'WMS_USER', 'currentUser', 'user', 'sb-session', 
            'WMS_LOGGED_USER', 'wms_user_name', 'user_fullname', 'display_name',
            'profile', 'session', 'auth_user', 'WMS_USER_PROFILE'
        ];

        for (const key of storageKeys) {
            try {
                const raw = localStorage.getItem(key) || sessionStorage.getItem(key);
                if (raw) {
                    if (raw.startsWith('{') || raw.startsWith('[')) {
                        const parsed = JSON.parse(raw);
                        const userObj = parsed.user || parsed.current_user || parsed.data?.user || parsed;
                        if (userObj && typeof userObj === 'object') {
                            const meta = userObj.user_metadata || userObj.profile || userObj;
                            const fn = meta.first_name || meta.firstname || meta.full_name || meta.fullname || meta.name || meta.display_name || '';
                            const ln = meta.last_name || meta.lastname || '';
                            if (fn || ln) {
                                const combined = `${fn} ${ln}`.trim();
                                if (combined && combined.length > 1) {
                                    userName = combined;
                                    break;
                                }
                            }
                            if (userObj.email) {
                                userName = userObj.email.split('@')[0];
                                break;
                            }
                        }
                    } else if (raw.trim().length > 1 && !raw.includes('{')) {
                        const cleanStr = raw.replace(/\(.*\)/g, '').trim();
                        if (cleanStr && cleanStr.length > 1) {
                            userName = cleanStr;
                            break;
                        }
                    }
                }
            } catch (e) {}
        }
    }

    // 4. สแกนตรวจสอบ Token Supabase Auth LocalStorage Key
    if (!userName) {
        try {
            for (let i = 0; i < localStorage.length; i++) {
                const k = localStorage.key(i);
                if (k && (k.includes('auth-token') || k.includes('sb-') || k.includes('supabase'))) {
                    const raw = localStorage.getItem(k);
                    if (raw && raw.startsWith('{')) {
                        const parsed = JSON.parse(raw);
                        const u = parsed.user || parsed.current_user;
                        if (u) {
                            const meta = u.user_metadata || u;
                            const fn = meta.first_name || meta.full_name || meta.name || meta.display_name || '';
                            const ln = meta.last_name || '';
                            if (fn || ln) {
                                userName = `${fn} ${ln}`.trim();
                                break;
                            }
                            if (u.email) {
                                userName = u.email.split('@')[0];
                                break;
                            }
                        }
                    }
                }
            }
        } catch(e) {}
    }

    if (!userName || userName.trim().length === 0) {
        userName = 'เจ้าหน้าที่คลังสินค้า';
    }

    return userName.trim();
}

function getAisleConfig(aisleName) {
    const key = String(aisleName || '').trim().toUpperCase();
    if (!key || key === 'SELECT' || key === 'NONE' || key.includes('โปรดเลือก')) {
        return { bays: 0, shelves: 0, slots: 0 };
    }

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
        if (itemInMaster && typeof itemInMaster === 'object') cfg = itemInMaster;
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
        } catch (e) {}
    }

    if (cfg) {
        const bays = parseInt(cfg.bays || cfg.bay || cfg.baysCount || cfg.totalBays || cfg.bayCount, 10);
        const shelves = parseInt(cfg.shelves || cfg.shelf || cfg.shelvesCount || cfg.totalShelves || cfg.shelfCount, 10);
        const slots = parseInt(cfg.slots || cfg.slot || cfg.slotsCount || cfg.totalSlots || cfg.slotCount, 10);
        return {
            bays: (!isNaN(bays) && bays >= 0) ? bays : 10,
            shelves: (!isNaN(shelves) && shelves >= 0) ? shelves : 3,
            slots: (!isNaN(slots) && slots >= 0) ? slots : 10
        };
    }
    return { bays: 10, shelves: 3, slots: 10 };
}

function getNormalizedLocKey(locStr) {
    if (!locStr) return '';
    let clean = String(locStr).trim().toUpperCase().replace(/^ร้านล็อก|^ร้าน/gi, '').trim();
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
    if (!locStr || locStr.includes('โปรดเลือก')) return '-';
    const clean = String(locStr).trim().toUpperCase().replace(/^ร้านล็อก|^ร้าน/gi, '').trim();
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

function formatLocationBadgeHTML(locStr) {
    if (!locStr || locStr === 'SELECT' || locStr === '' || locStr.includes('โปรดเลือก')) {
        return `<span class="loc-badge-container compact unselected"><span class="loc-segment">⚠️ ยังไม่ได้เลือกพิกัด</span></span>`;
    }
    
    const clean = String(locStr).trim().toUpperCase().replace(/^ร้านล็อก|^ร้าน/gi, '').trim();
    
    if (['DOCK', 'OFFICE', 'PENDING', 'FOOD', 'FREEZER', 'COLD', 'DRY', 'RAW'].includes(clean)) {
        return `<span class="loc-badge-container compact special"><span class="loc-segment loc-aisle">📍 โซนพิเศษ: ${escapeHTML(clean)}</span></span>`;
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

    if (!aisle || aisle === 'SELECT' || aisle.includes('โปรดเลือก') || ['DOCK', 'OFFICE', 'PENDING', 'FOOD', 'FREEZER', 'COLD', 'DRY', 'RAW'].includes(aisle)) {
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

    if (!aisle || aisle === 'SELECT' || aisle.includes('โปรดเลือก') || ['DOCK', 'OFFICE', 'PENDING', 'FOOD', 'FREEZER', 'COLD', 'DRY', 'RAW'].includes(aisle)) {
        return { isFull: false, location: aisle, bay: '00', shelf: '00', slot: '00', bayCapacity: 0, freeSlots: 0, occupiedCount: 0 };
    }

    const cfg = getAisleConfig(aisle);
    const totalShelves = parseInt(cfg.shelves || cfg.shelf, 10) || 3;
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
    if (!aisle || aisle === 'SELECT' || aisle.includes('โปรดเลือก')) {
        return { location: 'โปรดเลือกแถวจัดเก็บ', bay: 0, shelf: 0, slot: 0, totalSlots: 0, occupiedCount: 0, freeSlots: 0, isFull: true };
    }

    const specialLocations = ['DOCK', 'OFFICE', 'PENDING', 'FOOD', 'FREEZER', 'COLD', 'DRY', 'RAW'];
    if (specialLocations.includes(aisle)) {
        return { location: aisle, bay: 0, shelf: 0, slot: 0, totalSlots: 0, occupiedCount: 0, freeSlots: 0, isFull: false };
    }

    const cfg = getAisleConfig(aisle);

    const totalBays = parseInt(cfg.bays || cfg.bay, 10) || 10;
    const totalShelves = parseInt(cfg.shelves || cfg.shelf, 10) || 3;
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

    // 🟢 วนลูปหา ล็อกแรก ชั้นแรก ช่องแรก ที่ว่างแบบ Strict FIFO
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
        slotsConfigured: totalSlotsPerShelf,
        isFull: !found
    };
}

function populateInboundSlotDropdown(aisle, bay, shelf) {
    const slotSelect = document.getElementById('inboundSlotSelect');
    if (!slotSelect) return '01';

    if (!aisle || aisle === 'SELECT' || aisle.includes('โปรดเลือก')) {
        slotSelect.innerHTML = `<option value="00" disabled selected>00 (ช่องเป็น 0)</option>`;
        slotSelect.disabled = true;
        return '';
    }

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

// 🟢 🎯 บังคับค่าเริ่มต้นของ แถวจัดเก็บ ให้ตรงกัน 100% ทั้งก่อนและหลังดึงฐานข้อมูลสำเร็จ
function populateInboundAisleDropdown() {
    const aisleSelect = document.getElementById('inboundAisleSelect');
    if (!aisleSelect) return;

    const currentVal = aisleSelect.value;

    let aislesList = [];
    if (typeof window !== 'undefined' && Array.isArray(window.masterAisles) && window.masterAisles.length > 0) {
        aislesList = window.masterAisles.map(a => typeof a === 'object' ? (a.name || a.aisle || a.key || a.code || a) : a);
    } else if (typeof localStorage !== 'undefined') {
        try {
            const saved = localStorage.getItem('WMS_MASTER_AISLES');
            if (saved) {
                const parsed = JSON.parse(saved);
                if (Array.isArray(parsed)) aislesList = parsed.map(a => typeof a === 'object' ? (a.name || a.aisle || a.key || a.code || a) : a);
            }
        } catch(e) {}
    }

    if (aislesList.length === 0) {
        aislesList = ['A', 'B', 'C', 'D', 'E', 'F', 'G', 'H'];
    }

    const cleanAisles = aislesList.filter(a => {
        const str = String(a || '').trim().toUpperCase();
        return str && str !== 'DOCK' && str !== 'SELECT' && str !== 'NONE' && !str.includes('โปรดเลือก');
    });

    let html = `<option value="" selected>-- โปรดเลือกแถวจัดเก็บ --</option>`;
    html += `<option value="DOCK">📍 โซนลาน DOCK (รับฝากชั่วคราว)</option>`;

    cleanAisles.forEach(a => {
        const cleanA = String(a).trim().toUpperCase();
        html += `<option value="${cleanA}">แถว ${cleanA}</option>`;
    });

    aisleSelect.innerHTML = html;

    if (currentVal && Array.from(aisleSelect.options).some(opt => opt.value === currentVal)) {
        aisleSelect.value = currentVal;
    } else {
        aisleSelect.value = "";
    }
}

// 🟢 🎯 คำนวณอัปเดต ล็อกที่ว่างลำดับแรก + ช่องที่ว่างลำดับแรก ให้อัตโนมัติ 100%
function populateInboundLocationDropdownsStrict(aisleName, keepBay = null, autoSelectFirstAvailable = false) {
    const aisleSelect = document.getElementById('inboundAisleSelect');
    if (!aisleSelect) return;

    if (aisleSelect.options.length <= 1 || aisleSelect.options[0].text.indexOf('โปรดเลือก') === -1) {
        populateInboundAisleDropdown();
    }

    let aisle = aisleName !== undefined && aisleName !== null && aisleName !== "" ? aisleName : aisleSelect.value;
    aisle = String(aisle || '').trim().toUpperCase().replace(/^ร้านล็อก|^ร้าน/gi, '').trim();

    const baySelect = document.getElementById('inboundBaySelect');
    const shelfSelect = document.getElementById('inboundShelfSelect');
    const slotSelect = document.getElementById('inboundSlotSelect');

    if (!baySelect || !shelfSelect || !slotSelect) return;

    if (!aisle || aisle === 'SELECT' || aisle === '' || aisle.includes('โปรดเลือก')) {
        aisleSelect.value = "";
        baySelect.innerHTML = `<option value="00" disabled selected>00 (ล็อกเป็น 0)</option>`;
        shelfSelect.innerHTML = `<option value="00" disabled selected>00 (ชั้นเป็น 0)</option>`;
        slotSelect.innerHTML = `<option value="00" disabled selected>00 (ช่องเป็น 0)</option>`;
        baySelect.disabled = shelfSelect.disabled = slotSelect.disabled = true;
        updateInboundLocationPreviewFromDropdowns();
        return;
    }

    aisleSelect.value = aisle;

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
    const totalShelves = parseInt(cfg.shelves || cfg.shelf, 10) || 3;

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

    // ⚡ คำนวณหา ล็อกที่ว่างลำดับแรก และ ชั้น/ช่อง ที่ว่างลำดับแรกใน แถว นี้
    const aisleDetails = calculateAisleCapacityAndNextSlot(aisle);

    let targetBayStr = '01';

    if ((autoSelectFirstAvailable || keepBay === null || keepBay === undefined || keepBay === '') && !aisleDetails.isFull && aisleDetails.bay > 0) {
        targetBayStr = String(aisleDetails.bay).padStart(2, '0');
    } else {
        targetBayStr = keepBay || baySelect.value || '01';
    }

    let targetBayNum = parseInt(targetBayStr, 10) || 1;
    if (targetBayNum > totalBays) targetBayNum = 1;

    targetBayStr = String(targetBayNum).padStart(2, '0');
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

    const currentAisle = aisleSelect ? aisleSelect.value : '';
    if (!currentAisle || currentAisle.includes('โปรดเลือก')) return;

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

    const currentAisle = aisleSelect ? aisleSelect.value : '';
    if (!currentAisle || currentAisle.includes('โปรดเลือก')) return;

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

    const currentAisle = aisleSelect ? aisleSelect.value : '';
    if (!currentAisle || currentAisle.includes('โปรดเลือก')) return;

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

    const aisle = (aisleSelect ? aisleSelect.value : '').trim().toUpperCase().replace(/^ร้านล็อก|^ร้าน/gi, '').trim();
    
    if (!aisle || aisle.includes('โปรดเลือก')) return '';

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
    const aisle = aisleSelect ? aisleSelect.value : '';

    if (!aisle || aisle.includes('โปรดเลือก')) {
        renderAisleSlotBreakdownUI({ location: 'โปรดเลือกแถวจัดเก็บ', bay: 0, shelf: 0, slot: 0, totalSlots: 0, occupiedCount: 0, freeSlots: 0 });
        return;
    }

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
    const currentAisle = aisleValue !== undefined ? aisleValue : (aisleSelect ? aisleSelect.value : '');
    
    if (!currentAisle || currentAisle.includes('โปรดเลือก')) {
        populateInboundLocationDropdownsStrict("");
        updateInboundLocationPreviewFromDropdowns();
        return '';
    }

    populateInboundLocationDropdownsStrict(currentAisle, null, true);
    const hiddenLoc = document.getElementById('inboundLocation');
    return hiddenLoc ? hiddenLoc.value : currentAisle;
}

// 🟢 📹 ระบบกล้องสแกน SN ผ่านโทรศัพท์มือถือและอุปกรณ์ทุกชนิด (Ultra-Responsive Mobile Barcode Engine v6.3)
function initMobileCameraScannerModal() {
    let modal = document.getElementById('cameraScannerModal');
    if (!modal) {
        modal = document.createElement('div');
        modal.id = 'cameraScannerModal';
        modal.className = 'modal-overlay';
        modal.style.display = 'none';
        modal.innerHTML = `
            <div class="card camera-scanner-card" style="max-width: 480px; width: 94%; text-align: center; padding: 18px; border-radius: 20px; background: var(--bg-surface); border: 1px solid var(--border-color); box-shadow: var(--shadow-lg); overflow: hidden;">
                <div style="display: flex; justify-content: space-between; align-items: center; margin-bottom: 12px;">
                    <h3 style="font-size: 1.05rem; font-weight: 700; color: var(--text-main); display: flex; align-items: center; gap: 8px; margin: 0;">
                        <i class="fa-solid fa-camera" style="color: var(--primary);"></i> สแกนบาร์โค้ด / QR Realtime High-Speed
                    </h3>
                    <div style="display: flex; align-items: center; gap: 6px;">
                        <button type="button" onclick="toggleCameraTorch()" title="เปิด/ปิด ไฟฉาย" id="btnCameraTorchToggle" style="background: var(--bg-subtle); border: 1px solid var(--border-strong); border-radius: 50%; width: 34px; height: 34px; color: var(--text-main); cursor: pointer; display: flex; align-items: center; justify-content: center; font-size: 0.9rem;">
                            <i class="fa-solid fa-bolt"></i>
                        </button>
                        <button type="button" onclick="switchCameraFacingMode()" title="สลับกล้องหน้า/หลัง" style="background: var(--primary-light); border: 1px solid var(--primary-border); border-radius: 50%; width: 34px; height: 34px; color: var(--primary-text); cursor: pointer; display: flex; align-items: center; justify-content: center; font-size: 0.9rem;">
                            <i class="fa-solid fa-camera-rotate"></i>
                        </button>
                        <button type="button" onclick="closeCameraScanner()" style="background: none; border: none; font-size: 1.4rem; color: var(--text-muted); cursor: pointer; padding: 0 4px; line-height: 1;">&times;</button>
                    </div>
                </div>
                <div style="position: relative; width: 100%; height: 290px; background: #000; border-radius: 14px; overflow: hidden; display: flex; align-items: center; justify-content: center;">
                    <div id="html5QrCodeReader" style="width: 100%; height: 100%;"></div>
                    <video id="cameraScannerVideo" autoplay playsinline muted style="width: 100%; height: 100%; object-fit: cover; display: none;"></video>
                    
                    <!-- กรอบสแกนบาร์โค้ด High Dynamic Laser Frame -->
                    <div class="camera-scanner-frame" style="pointer-events:none;">
                        <div class="camera-scanner-laser"></div>
                    </div>
                    <div style="position: absolute; bottom: 10px; background: rgba(0,0,0,0.78); color: #fff; padding: 6px 14px; border-radius: 20px; font-size: 0.76rem; backdrop-filter: blur(8px); pointer-events: none; border: 1px solid rgba(255,255,255,0.18); display: flex; align-items: center; gap: 6px; max-width: 90%; white-space: nowrap; overflow: hidden; text-overflow: ellipsis;">
                        <i class="fa-solid fa-expand" style="color: #38bdf8;"></i> <span id="cameraScannerStatusText">เล็งบาร์โค้ดให้อยู่ในกรอบ ระบบจะอ่านให้อัตโนมัติ</span>
                    </div>
                </div>

                <!-- แผงปุ่มควบคุม Flex-wrap ที่ปรับยืดหยุ่นไม่ตกขอบทุกอุปกรณ์ -->
                <div class="camera-controls-grid" style="display: flex; flex-wrap: wrap; gap: 8px; margin-top: 14px; width: 100%;">
                    <button type="button" class="btn btn-secondary" style="flex: 1 1 calc(33.333% - 6px); min-width: 100px; padding: 8px 10px; font-size: 0.82rem;" onclick="closeCameraScanner()">
                        <i class="fa-solid fa-xmark"></i> ปิดกล้อง
                    </button>
                    <button type="button" class="btn btn-secondary" style="flex: 1 1 calc(33.333% - 6px); min-width: 110px; padding: 8px 10px; font-size: 0.82rem;" onclick="switchCameraFacingMode()">
                        <i class="fa-solid fa-camera-rotate"></i> กล้อง (<span id="cameraFacingLabel">หลัง</span>)
                    </button>
                    <button type="button" class="btn btn-primary" style="flex: 1 1 calc(33.333% - 6px); min-width: 110px; padding: 8px 10px; font-size: 0.82rem;" onclick="simulateCameraScanSuccess()">
                        <i class="fa-solid fa-bolt"></i> สแกนจำลอง
                    </button>
                </div>
            </div>
        `;
        document.body.appendChild(modal);
    }
}

function triggerMobileCameraScan() {
    openCameraScanner();
}

function openCameraScanner() {
    initMobileCameraScannerModal();
    const modal = document.getElementById('cameraScannerModal');
    if (!modal) return;

    modal.style.display = 'flex';
    isCameraScannerActive = true;

    startCameraWithCurrentFacingMode();
}

function startCameraWithCurrentFacingMode() {
    const facingLabel = document.getElementById('cameraFacingLabel');
    if (facingLabel) {
        facingLabel.textContent = currentCameraFacingMode === 'user' ? 'หน้า' : 'หลัง';
    }

    if (typeof Html5Qrcode !== 'undefined') {
        const qrCodeContainer = document.getElementById('html5QrCodeReader');
        if (qrCodeContainer) {
            qrCodeContainer.style.display = 'block';
            const videoElem = document.getElementById('cameraScannerVideo');
            if (videoElem) videoElem.style.display = 'none';

            if (html5QrCodeScanner) {
                try { html5QrCodeScanner.stop(); } catch(e){}
            }

            html5QrCodeScanner = new Html5Qrcode("html5QrCodeReader");
            
            // 🟢 ปรับเพิ่ม Resolution และ FPS เพื่อความแม่นยำสูงสุด
            const config = { 
                fps: 30, 
                qrbox: { width: 270, height: 180 }, 
                aspectRatio: 1.0,
                videoConstraints: {
                    facingMode: currentCameraFacingMode,
                    width: { min: 640, ideal: 1920, max: 3840 },
                    height: { min: 480, ideal: 1080, max: 2160 },
                    frameRate: { ideal: 30 }
                },
                experimentalFeatures: {
                    useBarCodeDetectorIfSupported: true
                }
            };

            html5QrCodeScanner.start(
                { facingMode: currentCameraFacingMode },
                config,
                (decodedText) => {
                    if (decodedText && decodedText.trim()) {
                        onCameraBarcodeDetected(decodedText.trim());
                    }
                },
                (errorMessage) => {}
            ).then(() => {
                const modeName = currentCameraFacingMode === 'user' ? 'กล้องหน้า' : 'กล้องหลัง';
                showToast(`🟢 เปิด${modeName}ความละเอียดสูงสำเร็จ เล็งบาร์โค้ดเพื่อสแกน`, false);
            }).catch(err => {
                console.warn("Html5Qrcode camera error, fallbacking to getUserMedia:", err);
                startFallbackMediaScanner();
            });
            return;
        }
    }

    startFallbackMediaScanner();
}

async function switchCameraFacingMode() {
    currentCameraFacingMode = (currentCameraFacingMode === 'environment') ? 'user' : 'environment';
    const modeName = currentCameraFacingMode === 'user' ? 'กล้องหน้า' : 'กล้องหลัง';
    showToast(`🔄 กำลังสลับไปใช้ ${modeName}...`, false);

    if (html5QrCodeScanner) {
        try {
            await html5QrCodeScanner.stop();
        } catch(e) {}
    }
    if (activeCameraStream) {
        activeCameraStream.getTracks().forEach(track => track.stop());
        activeCameraStream = null;
    }
    if (cameraScanInterval) {
        clearInterval(cameraScanInterval);
        cameraScanInterval = null;
    }

    if (isCameraScannerActive) {
        startCameraWithCurrentFacingMode();
    }
}

async function toggleCameraTorch() {
    isTorchOn = !isTorchOn;
    const btn = document.getElementById('btnCameraTorchToggle');

    if (html5QrCodeScanner && isCameraScannerActive) {
        try {
            await html5QrCodeScanner.applyVideoConstraints({
                advanced: [{ torch: isTorchOn }]
            });
            showToast(isTorchOn ? "💡 เปิดไฟฉายกล้องแล้ว" : "🔦 ปิดไฟฉายกล้องแล้ว", false);
            if (btn) btn.style.background = isTorchOn ? "#f59e0b" : "var(--bg-subtle)";
            return;
        } catch(e) {}
    }

    if (activeCameraStream) {
        const track = activeCameraStream.getVideoTracks()[0];
        if (track && typeof track.applyConstraints === 'function') {
            try {
                await track.applyConstraints({ advanced: [{ torch: isTorchOn }] });
                showToast(isTorchOn ? "💡 เปิดไฟฉายกล้องแล้ว" : "🔦 ปิดไฟฉายกล้องแล้ว", false);
                if (btn) btn.style.background = isTorchOn ? "#f59e0b" : "var(--bg-subtle)";
                return;
            } catch(e) {}
        }
    }
    showToast("⚠️ ฮาร์ดแวร์หรือเบราว์เซอร์ไม่รองรับการเปิดไฟฉาย", true);
}

function startFallbackMediaScanner() {
    const video = document.getElementById('cameraScannerVideo');
    const qrContainer = document.getElementById('html5QrCodeReader');
    if (qrContainer) qrContainer.style.display = 'none';
    if (!video) return;

    video.style.display = 'block';

    const constraints = {
        video: {
            facingMode: { ideal: currentCameraFacingMode },
            width: { min: 640, ideal: 1920 },
            height: { min: 480, ideal: 1080 },
            frameRate: { ideal: 30 }
        }
    };

    if (activeCameraStream) {
        activeCameraStream.getTracks().forEach(track => track.stop());
        activeCameraStream = null;
    }

    navigator.mediaDevices.getUserMedia(constraints)
        .then(stream => {
            activeCameraStream = stream;
            video.srcObject = stream;
            video.setAttribute('playsinline', true);
            video.play();
            const modeName = currentCameraFacingMode === 'user' ? 'กล้องหน้า' : 'กล้องหลัง';
            showToast(`🟢 เปิด${modeName}สแกนสำเร็จแล้ว เล็งบาร์โค้ดเพื่อสแกนอัตโนมัติ`, false);
            startContinuousBarcodeDetection(video);
        })
        .catch(err => {
            console.error("Camera access error:", err);
            showToast('⚠️ ไม่สามารถเข้าถึงกล้องได้ กรุณาตรวจสอบสิทธิ์การอนุญาตกล้องของเบราว์เซอร์', true);
            closeCameraScanner();
            ensureSnInputFocus(true);
        });
}

function startContinuousBarcodeDetection(videoElement) {
    if (cameraScanInterval) clearInterval(cameraScanInterval);

    let barcodeDetector = null;
    if ('BarcodeDetector' in window) {
        try {
            barcodeDetector = new window.BarcodeDetector({
                formats: ['code_128', 'code_39', 'code_93', 'ean_13', 'ean_8', 'qr_code', 'data_matrix', 'upc_a', 'upc_e', 'codabar', 'itf']
            });
        } catch (e) {
            try { barcodeDetector = new window.BarcodeDetector(); } catch(err){}
        }
    }

    cameraScanInterval = setInterval(async () => {
        if (!isCameraScannerActive || !videoElement || videoElement.readyState !== videoElement.HAVE_ENOUGH_DATA) return;

        try {
            if (barcodeDetector) {
                const barcodes = await barcodeDetector.detect(videoElement);
                if (barcodes && barcodes.length > 0) {
                    const detectedVal = barcodes[0].rawValue || barcodes[0].rawValueText;
                    if (detectedVal && detectedVal.trim()) {
                        onCameraBarcodeDetected(detectedVal.trim());
                    }
                }
            }
        } catch (e) {}
    }, 150); // 🟢 ปรับความถี่ในการสแกนให้ไวขึ้นเป็นทุกๆ 150ms
}

function onCameraBarcodeDetected(scannedCode) {
    if (!isCameraScannerActive) return;
    const cleanCode = scannedCode.replace(/[\r\n\t]/g, '').trim();
    if (!cleanCode) return;

    playAudioFeedback('success');
    showToast(`⚡ ตรวจจับบาร์โค้ดสำเร็จ: ${cleanCode}`, false);

    const snInput = document.getElementById('inboundSn');
    if (snInput) {
        snInput.value = cleanCode;
    }

    closeCameraScanner();
    
    setTimeout(() => {
        handleInboundSubmit();
    }, 150);
}

function closeCameraScanner() {
    isCameraScannerActive = false;
    isTorchOn = false;
    if (cameraScanInterval) {
        clearInterval(cameraScanInterval);
        cameraScanInterval = null;
    }

    if (html5QrCodeScanner) {
        try {
            html5QrCodeScanner.stop().then(() => {
                html5QrCodeScanner.clear();
            }).catch(e => console.log(e));
        } catch (e) {}
    }

    if (activeCameraStream) {
        activeCameraStream.getTracks().forEach(track => track.stop());
        activeCameraStream = null;
    }
    const video = document.getElementById('cameraScannerVideo');
    if (video) video.srcObject = null;

    const modal = document.getElementById('cameraScannerModal');
    if (modal) modal.style.display = 'none';
    ensureSnInputFocus(true);
}

function simulateCameraScanSuccess() {
    const sampleSn = 'SN-' + Math.floor(100000 + Math.random() * 900000);
    onCameraBarcodeDetected(sampleSn);
}

function generateAutoSN() {
    const snInput = document.getElementById('inboundSn');
    if (!snInput) return;
    const prefix = 'SN-' + new Date().getFullYear();
    const rand = Math.floor(100000 + Math.random() * 900000);
    snInput.value = `${prefix}-${rand}`;
    triggerScanInputFlash('success');
    showToast(`🪄 สุ่ม S/N สำเร็จ: ${snInput.value}`, false);
    ensureSnInputFocus(true);
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

    if (!details.location || details.location.includes('โปรดเลือก')) {
        infoContainer.innerHTML = `
            <div style="text-align:center; color:var(--warning, #d97706); font-weight:600; padding:10px; background:var(--warning-light, #fef3c7); border-radius:10px; border:1px solid #fde68a;">
                ⚠️ โปรดเลือกแถวจัดเก็บจากรายการด้านบนก่อนทำการสแกน
            </div>
        `;
        return;
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
            <button type="button" onclick="triggerAutoFindNextSlot()" style="background:none; border:none; color:var(--primary-text, #0284c7); font-size:0.75rem; font-weight:700; cursor:pointer; display:flex; align-items:center; gap:4px;">
                <i class="fa-solid fa-rotate-right"></i> รีเฟรชพิกัด
            </button>
        </div>

        <div style="display:grid; grid-template-columns: repeat(3, 1fr); gap:6px; text-align:center; margin-bottom:10px;">
            <div style="background:var(--primary-light, #e0f2fe); padding:6px 4px; border-radius:8px; border:1px solid var(--primary-border);">
                <span style="font-size:0.7rem; color:var(--text-sub); display:block;">ล็อกที่เลือก</span>
                <strong style="font-size:0.95rem; color:var(--primary-text);" class="mono">ล็อก ${String(details.bay).padStart(2, '0')}</strong>
            </div>
            <div style="background:var(--primary-light, #e0f2fe); padding:6px 4px; border-radius:8px; border:1px solid var(--primary-border);">
                <span style="font-size:0.7rem; color:var(--text-sub); display:block;">ชั้นที่เลือก</span>
                <strong style="font-size:0.95rem; color:var(--primary-text);" class="mono">ชั้น ${String(details.shelf).padStart(2, '0')}</strong>
            </div>
            <div style="background:var(--success-light, #dcfce7); padding:6px 4px; border-radius:8px; border:1px solid rgba(16,185,129,0.3);">
                <span style="font-size:0.7rem; color:#15803d; display:block;">ช่องว่าง Auto</span>
                <strong style="font-size:0.95rem; color:#10b981;" class="mono">ช่อง ${String(details.slot).padStart(2, '0')}</strong>
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
            <button type="button" class="btn btn-sm" onclick="triggerAutoFindNextSlot()" style="font-size:0.7rem; padding:3px 10px; background:var(--primary-light, #e0f2fe); color:var(--primary-text, #0284c7); border:1px solid var(--primary-border); border-radius:6px; cursor:pointer; font-weight:600;">
                ⚡ หาช่องว่างถัดไป
            </button>
        </div>
    `;
}

function triggerAutoFindNextSlot() {
    invalidateOccupiedLocationsCache();
    forceSyncAndSelectAvailableLocation(true);
}

function forceSyncAndSelectAvailableLocation(autoSelectFirstAvailable = true) {
    const aisleSelect = document.getElementById('inboundAisleSelect');
    const baySelect = document.getElementById('inboundBaySelect');

    const currentAisle = aisleSelect ? aisleSelect.value : '';
    if (!currentAisle || currentAisle.includes('โปรดเลือก')) {
        populateInboundLocationDropdownsStrict("", null, autoSelectFirstAvailable);
        return;
    }

    const currentBay = baySelect ? baySelect.value : '01';
    populateInboundLocationDropdownsStrict(currentAisle, autoSelectFirstAvailable ? null : currentBay, autoSelectFirstAvailable);
}

function autoSelectNextAvailableSlotAfterInbound() {
    forceSyncAndSelectAvailableLocation(true);
}

// ⚡ HIGH-SPEED SCAN ENGINE
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

    if (!currentSelectedLoc || currentSelectedLoc.includes('โปรดเลือก') || currentSelectedLoc === '') {
        triggerScanInputFlash('error');
        showToast('⚠️ กรุณาเลือกแถวจัดเก็บคลังสินค้าก่อนทำการสแกนรับเข้า!', true);
        const aisleSelect = document.getElementById('inboundAisleSelect');
        if (aisleSelect) aisleSelect.focus();
        return;
    }

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

        const isDuplicateSn = pendingFastSnSet.has(snUpper) ||
                              (typeof globalInventoryData !== 'undefined' && globalInventoryData.some(i => i && String(i.sn).toUpperCase() === snUpper && i.status !== 'OUT' && !i.is_deleted)) ||
                              (typeof recentInboundList !== 'undefined' && recentInboundList.some(r => r && String(r.sn).toUpperCase() === snUpper));

        if (isDuplicateSn) {
            triggerScanInputFlash('duplicate');
            showToast(`⚠️ ซีเรียล S/N: ${sn} มีอยู่ในคลังสินค้าเรียบร้อยแล้ว ห้ามสแกนซ้ำเด็ดขาด!`, true);
            ensureSnInputFocus(true);
            continue;
        }

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
                showToast(`⚠️ พิกัด ${formatLocationSpaced(dbLocation)} มีสินค้า (S/N: ${occupyingSn}) จัดเก็บอยู่แล้ว`, true);

                forceSyncAndSelectAvailableLocation(true);
                ensureSnInputFocus(true);
                continue;
            }
        }

        pendingFastSnSet.add(snUpper);
        addOccupiedLocToSet(pendingFastLocationSet, dbLocation);

        // 🟢 ดึงชื่อผู้ใช้งาน ชื่อ-นามสกุล ที่ล็อกอินเข้าใช้งานระบบเพื่อบันทึกลง Database (ใช้คอลัมน์ received_by คอลัมน์เดียวตามมาตรฐาน)
        const activeUserFullName = getCurrentUserFullName() || 'เจ้าหน้าที่คลังสินค้า';
        const nowISO = new Date().toISOString();
        const currentTimeStr = new Date().toLocaleTimeString('th-TH');

        // 🎯 Single Receiver Field Standard for Supabase Insert
        const rawPayload = { 
            category, 
            name, 
            sn, 
            meter: meterVal, 
            location: dbLocation,
            qty: 1, 
            status: 'IN_STOCK',
            received_by: activeUserFullName,
            created_at: nowISO 
        };

        recentInboundList.unshift({
            sn, 
            category, 
            name, 
            meter: meterVal, 
            location: dbLocation,
            received_by: activeUserFullName,
            time: currentTimeStr,
            created_at: nowISO,
            isOffline: false
        });
        if (recentInboundList.length > 100) recentInboundList.length = 100;

        saveRecentInboundFeedToCache();
        forceSyncAndSelectAvailableLocation(true);
        triggerScanInputFlash('success');
        showToast(`✅ สแกนรับเข้าสำเร็จ: S/N ${sn} -> พิกัด ${formatLocationSpaced(dbLocation)} (ผู้รับ: ${activeUserFullName})`);
        scheduleDebouncedFeedRender();

        // 🟢 บันทึกเข้า Supabase ในเบื้องหลังเรียลไทม์ 100%
        (async () => {
            if (navigator.onLine && typeof _supabase !== 'undefined' && _supabase) {
                try {
                    let cleanData = typeof sanitizeForDb === 'function' ? sanitizeForDb(rawPayload) : rawPayload;
                    
                    // ป้องกันการถูก Sanitize ตัดฟิลด์ received_by ออก
                    if (!cleanData.received_by) {
                        cleanData.received_by = activeUserFullName;
                    }

                    const { data, error } = await _supabase.from('warehouse_items').insert([cleanData]).select('*');
                    
                    if (!error && data && data[0]) {
                        const matched = recentInboundList.find(r => r.sn === sn);
                        if (matched) matched.id = data[0].id;
                        saveRecentInboundFeedToCache();
                    } else if (error) {
                        console.error("Supabase Insert Failed:", error);
                        showToast(`⚠️ เกิดข้อผิดพลาด Supabase: ${error.message}`, true, 4500);
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

function loadRecentInboundFeedFromCache() {
    try {
        const cached = localStorage.getItem('WMS_RECENT_INBOUND_CACHE');
        if (cached) {
            const parsed = JSON.parse(cached);
            if (Array.isArray(parsed) && parsed.length > 0) {
                recentInboundList = parsed;
                renderLiveInboundFeed();
            }
        }
    } catch(e) {}
}

function saveRecentInboundFeedToCache() {
    try {
        localStorage.setItem('WMS_RECENT_INBOUND_CACHE', JSON.stringify(recentInboundList.slice(0, 100)));
    } catch(e) {}
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
                let rName = item.received_by || item.receiver || item.created_by;
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
                    received_by: escapeHTML(rName),
                    time: item.created_at ? new Date(item.created_at).toLocaleTimeString('th-TH') : '-',
                    created_at: item.created_at,
                    isOffline: false
                };
            });
            saveRecentInboundFeedToCache();
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
            .on('postgres_changes', { event: '*', schema: 'public', table: 'products' }, async () => {
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

    const aisleSelect = document.getElementById('inboundAisleSelect');
    if (aisleSelect && aisleSelect.value && !aisleSelect.value.includes('โปรดเลือก')) {
        populateInboundLocationDropdownsStrict(aisleSelect.value, null, true);
    } else {
        populateInboundLocationDropdownsStrict("", null, true);
    }
    
    scheduleDebouncedFeedRender();
    ensureSnInputFocus();
}

function initWarehouseItemsRealtime() {
    const client = typeof getSupabaseClient === 'function' ? getSupabaseClient() : (typeof _supabase !== 'undefined' ? _supabase : null);
    if (!client) return;

    try {
        client
            .channel('public_warehouse_items_realtime_inbound_v65')
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
                            matchedFeed.received_by = payload.new.received_by || matchedFeed.received_by || getCurrentUserFullName();
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
                            received_by: payload.new.received_by || getCurrentUserFullName(),
                            time: payload.new.created_at ? new Date(payload.new.created_at).toLocaleTimeString('th-TH') : new Date().toLocaleTimeString('th-TH'),
                            created_at: payload.new.created_at,
                            isOffline: false
                        });
                    }
                }

                saveRecentInboundFeedToCache();
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
        .full-sn-text {
            word-break: break-all !important;
            white-space: normal !important;
            overflow: visible !important;
            text-overflow: clip !important;
            font-family: var(--font-mono, 'JetBrains Mono', monospace);
            font-weight: 700;
            color: var(--text-main, #0f172a);
        }

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
        .btn-card-action.btn-card-delete:hover {
            background: #fee2e2 !important;
            color: #ef4444 !important;
            border-color: #fca5a5 !important;
        }
        .camera-scanner-frame {
            position: absolute;
            width: 82%;
            height: 58%;
            border: 2px solid rgba(56, 189, 248, 0.9);
            border-radius: 14px;
            box-shadow: 0 0 0 9999px rgba(0, 0, 0, 0.52);
            pointer-events: none;
            overflow: hidden;
        }
        .camera-scanner-laser {
            width: 100%;
            height: 3px;
            background: linear-gradient(90deg, transparent, #ef4444, #38bdf8, #ef4444, transparent);
            box-shadow: 0 0 14px #38bdf8;
            position: absolute;
            top: 0;
            animation: cameraLaserScan 1.8s infinite ease-in-out;
        }
        @keyframes cameraLaserScan {
            0% { top: 5%; }
            50% { top: 92%; }
            100% { top: 5%; }
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
            const receiverMatch = String(item.received_by || item.receiver || '').toLowerCase().includes(recentFeedSearchQuery);
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
            
            let displayReceiver = item.received_by || item.receiver || item.created_by;
            if (!displayReceiver || displayReceiver === 'nakorn.c' || displayReceiver === 'Nakorn C' || displayReceiver === 'ไม่ระบุผู้บันทึก') {
                displayReceiver = currentActiveUserName;
            }
            
            const receiverName = escapeHTML(displayReceiver);
            const itemSn = escapeHTML(item.sn);
            const itemId = escapeHTML(item.id || '');
            const itemCategory = escapeHTML(item.category);
            const itemName = escapeHTML(item.name);
            const itemTime = escapeHTML(item.time || (item.created_at ? new Date(item.created_at).toLocaleTimeString('th-TH') : '-'));

            html += `
                <div class="feed-item modern-feed-card animate-feed-entry">
                    <div style="display:flex; justify-content:space-between; align-items:flex-start; width:100%; gap:6px;">
                        <div style="display:flex; flex-direction:column; width:100%;">
                            <span style="font-size:0.68rem; color:var(--text-muted); font-weight:700;">หมายเลขซีเรียล (S/N):</span>
                            <span class="full-sn-text" style="font-size:0.9rem;">
                                ${itemSn}
                            </span>
                        </div>
                        <div class="feed-card-actions" style="flex-shrink:0;">
                            <button type="button" class="btn-card-action" onclick="copyToClipboard('${itemSn}'); showToast('📋 คัดลอก S/N สำเร็จ: ${itemSn}');" title="คัดลอก S/N">
                                <i class="fa-regular fa-copy"></i>
                            </button>
                            <button type="button" class="btn-card-action" onclick="triggerReprintStickerFromFeed('${itemSn}', '${itemName}', '${itemCategory}', '${item.location}')" title="ดีดไปที่ศูนย์พิมพ์บาร์โค้ด">
                                <i class="fa-solid fa-print"></i> พิมพ์
                            </button>
                            <button type="button" class="btn-card-action btn-card-delete" onclick="deleteInboundItem('${itemSn}', '${itemId}', '${item.location}')" title="ลบรายการนี้" style="color:#ef4444; border-color:#fca5a5; background:#fef2f2;">
                                <i class="fa-solid fa-trash-can"></i> ลบ
                            </button>
                        </div>
                    </div>

                    <div style="display:flex; flex-direction:column; gap:3px; background:var(--bg-subtle, #f1f5f9); padding:6px 10px; border-radius:8px; border:1px solid var(--border-color);">
                        <span style="font-size:0.68rem; color:var(--text-muted); font-weight:700;">📍 พิกัดจัดเก็บ (1 คอลัมน์):</span>
                        <div style="width:100%;">
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
    saveRecentInboundFeedToCache();
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

    loadRecentInboundFeedFromCache();

    populateInboundAisleDropdown();
    populateInboundLocationDropdownsStrict("");

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

    const cameraTriggerBtn = document.getElementById('btnOpenCameraController') || document.getElementById('cameraScanBtn');
    if (cameraTriggerBtn) {
        cameraTriggerBtn.addEventListener('click', (e) => {
            e.preventDefault();
            openCameraScanner();
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
    window.deleteInboundItem = deleteInboundItem;
    window.calculateNextAvailableSlotInShelf = calculateNextAvailableSlotInShelf;
    window.calculateNextAvailableSlotInBayStrictAisle = calculateNextAvailableSlotInBayStrictAisle;
    window.calculateAisleCapacityAndNextSlot = calculateAisleCapacityAndNextSlot;
    window.populateInboundSlotDropdown = populateInboundSlotDropdown;
    window.populateInboundAisleDropdown = populateInboundAisleDropdown;
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
    window.loadRecentInboundFeedFromCache = loadRecentInboundFeedFromCache;
    window.saveRecentInboundFeedToCache = saveRecentInboundFeedToCache;
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
    window.openCameraScanner = openCameraScanner;
    window.closeCameraScanner = closeCameraScanner;
    window.triggerMobileCameraScan = triggerMobileCameraScan;
    window.generateAutoSN = generateAutoSN;
    window.startCameraWithCurrentFacingMode = startCameraWithCurrentFacingMode;
    window.switchCameraFacingMode = switchCameraFacingMode;
    window.toggleCameraTorch = toggleCameraTorch;
    window.currentCameraFacingMode = currentCameraFacingMode;
}

document.addEventListener('DOMContentLoaded', () => {
    initInboundEventListeners();
});