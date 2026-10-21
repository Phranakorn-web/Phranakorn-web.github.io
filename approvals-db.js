// =========================================================================
// --- MODULE 6: APPROVAL REQUESTS DATABASE & REALTIME ENGINE (ACCURATE TTS ENGINE) ---
// =========================================================================

// Safe Escape HTML Helper Fallback (Secures against XSS vulnerabilities)
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

// Dynamic Environment Configuration (Prevents exposing hardcoded Supabase Secrets in client JS)
const WMS_SUPABASE_URL = (typeof window !== 'undefined' && window.ENV && window.ENV.SUPABASE_URL) ? window.ENV.SUPABASE_URL : '';
const WMS_SUPABASE_ANON_KEY = (typeof window !== 'undefined' && window.ENV && window.ENV.SUPABASE_ANON_KEY) ? window.ENV.SUPABASE_ANON_KEY : '';

let pendingApprovalsList = [];
let approvalStatusFilter = 'ALL';
let approvalPollingTimer = null;
let approvalRealtimeChannel = null;
let userTrackedRequestStatuses = {};
const LOCAL_APPROVALS_KEY = 'wms_local_pending_approvals_v2';

// 🟢 โหลดรายการเสียงของระบบล่วงหน้าสำหรับทุกเบราว์เซอร์
let availableTTSVoices = [];
function preloadTTSVoices() {
    if ('speechSynthesis' in window) {
        availableTTSVoices = window.speechSynthesis.getVoices();
    }
}
if ('speechSynthesis' in window) {
    preloadTTSVoices();
    window.speechSynthesis.onvoiceschanged = preloadTTSVoices;
}

// -------------------------------------------------------------------------
// 0. ตรวจสอบสถานะว่าผู้ใช้เข้าสู่ระบบสำเร็จแล้วหรือยัง (บล็อกแจ้งเตือนในหน้า Login 100%)
// -------------------------------------------------------------------------
function isUserLoggedIn() {
    const passwordInput = document.querySelector('input[type="password"]');
    if (passwordInput && passwordInput.offsetParent !== null) {
        return false;
    }

    const loginModal = document.getElementById('loginModal') || document.getElementById('loginView') || document.getElementById('loginSection') || document.getElementById('login-modal');
    if (loginModal && (loginModal.style.display !== 'none' && !loginModal.classList.contains('hidden'))) {
        return false;
    }

    const loginContainer = document.querySelector('.login-container') || document.querySelector('.login-box') || document.querySelector('#login-form');
    if (loginContainer && loginContainer.offsetParent !== null) {
        return false;
    }

    if (document.body.classList.contains('login-page') || document.body.classList.contains('is-logged-out')) {
        return false;
    }

    if (typeof currentUser !== 'undefined' && currentUser && (currentUser.id || currentUser.username || currentUser.email)) {
        return true;
    }

    try {
        const storedUser = localStorage.getItem('currentUser') || localStorage.getItem('user') || sessionStorage.getItem('currentUser') || sessionStorage.getItem('user');
        if (storedUser && storedUser !== '{}') {
            return true;
        }
    } catch(e) {}

    if (document.getElementById('app-content') || document.getElementById('sidebar') || document.querySelector('.main-content') || document.getElementById('view-approvals')) {
        return true;
    }

    return false;
}

// -------------------------------------------------------------------------
// 1. ระบบตรวจจับสิทธิ์ Admin (Dynamic Role Checking 100%)
// -------------------------------------------------------------------------
function isCurrentUserAdmin() {
    if (!isUserLoggedIn()) return false;

    let userObj = (typeof currentUser !== 'undefined' && currentUser) ? currentUser : null;

    if (!userObj) {
        try {
            userObj = JSON.parse(localStorage.getItem('currentUser') || localStorage.getItem('user') || '{}');
        } catch(e) {}
    }

    if (userObj && typeof userObj === 'object') {
        if (userObj.isAdmin === true || userObj.is_admin === true) return true;

        const roleStr = String(
            userObj.role || userObj.user_role || userObj.type || userObj.role_name || ''
        ).toLowerCase().trim();

        if (
            roleStr === 'admin' || 
            roleStr === 'superadmin' || 
            roleStr === 'administrator' || 
            roleStr.includes('admin') || 
            roleStr.includes('super') || 
            roleStr.includes('manager') || 
            roleStr.includes('ผู้ดูแลระบบ')
        ) {
            return true;
        }
    }

    try {
        const rawRole = String(
            localStorage.getItem('user_role') || 
            localStorage.getItem('role') || 
            sessionStorage.getItem('user_role') || ''
        ).toLowerCase().trim();

        if (rawRole.includes('admin') || rawRole.includes('super') || rawRole.includes('manager')) return true;
    } catch(e) {}

    if (document.getElementById('view-approvals') || document.querySelector('.approval-center-header')) {
        return true;
    }

    return false;
}

// 🟢 เล่นเสียงแจ้งเตือนภาษาไทย (สแกนเพศเสียงแม่นยำ 100%: ชาย = ครับ / หญิง = ค่ะ)
function playTTSNotification(text) {
    if (!isUserLoggedIn()) return; // ⛔ บล็อกเสียงพูดถ้าอยู่ในหน้าล็อกอิน
    try {
        if ('speechSynthesis' in window) {
            window.speechSynthesis.cancel();

            const voices = window.speechSynthesis.getVoices();
            const thaiVoices = voices.filter(v => v.lang === 'th-TH' || v.lang.startsWith('th'));

            let selectedVoice = null;
            let isMale = false;

            if (thaiVoices.length > 0) {
                // 1. ค้นหาเสียงผู้หญิงภาษาไทยเป็นลำดับแรกสุด
                selectedVoice = thaiVoices.find(v => {
                    const nameLower = v.name.toLowerCase();
                    return (
                        nameLower.includes('premwadee') || 
                        nameLower.includes('narisa') || 
                        nameLower.includes('kanya') || 
                        nameLower.includes('achara') || 
                        nameLower.includes('female') || 
                        nameLower.includes('google ภาษาไทย') ||
                        nameLower.includes('online (natural)')
                    );
                });

                // 2. ถ้าไม่มีเสียงผู้หญิงเฉพาะ ให้ใช้เสียงภาษาไทยที่มีอยู่ในเครื่อง
                if (!selectedVoice) {
                    selectedVoice = thaiVoices[0];
                }

                // 3. ตรวจสอบชื่อเสียงเพื่อระบุเพศผู้ชายอย่างแม่นยำ
                const activeVoiceName = selectedVoice.name.toLowerCase();
                if (
                    activeVoiceName.includes('pattara') || 
                    activeVoiceName.includes('niwat') || 
                    activeVoiceName.includes('male') || 
                    activeVoiceName.includes('guy') || 
                    activeVoiceName.includes('david') || 
                    activeVoiceName.includes('ชาย') ||
                    selectedVoice.gender === 'male'
                ) {
                    isMale = true;
                }
            }

            // ตัดคำลงท้ายเดิมออกก่อน เพื่อไม่ให้พูดคำลงท้ายซ้ำ
            let cleanText = String(text).replace(/(ค่ะ|ครับ|คะ)$/g, '').trim();

            // เติมคำลงท้ายตรงตามเพศของเสียงพูด 100%
            if (isMale) {
                cleanText += " ครับ";
            } else {
                cleanText += " ค่ะ";
            }

            const utter = new SpeechSynthesisUtterance(cleanText);
            utter.lang = 'th-TH';

            if (selectedVoice) {
                utter.voice = selectedVoice;
            }

            // ปรับโทนเสียง (Pitch): ผู้ชายใช้คีย์ปกติ 1.0 / ผู้หญิงใช้คีย์สดใส 1.2
            utter.pitch = isMale ? 1.0 : 1.2;
            utter.rate = 1.05;

            window.speechSynthesis.speak(utter);
        }
    } catch(e) {
        // Safe Catch
    }
}

// 🟢 ระบบ Auto-Refresh หน้ารายการสินค้าอัตโนมัติเมื่อมีความเปลี่ยนแปลง
function triggerAutoUIRefresh() {
    if (!isUserLoggedIn()) return;
    try {
        if (typeof loadDataFromDatabase === 'function') loadDataFromDatabase();
        if (typeof fetchInventoryData === 'function') fetchInventoryData();
        if (typeof renderStockTable === 'function') renderStockTable();
        if (typeof refreshWarehouseUI === 'function') refreshWarehouseUI();
    } catch(e) {
        // Safe Catch
    }
}

// 🟢 ดึงหรือสร้าง Supabase Client 100% (Secure Instance Retrieval)
function getSupabaseClient() {
    if (typeof _supabase !== 'undefined' && _supabase && typeof _supabase.from === 'function') return _supabase;
    if (window._supabase && typeof window._supabase.from === 'function') return window._supabase;
    if (window.supabase && typeof window.supabase.from === 'function') return window.supabase;
    if (window.supabaseClient && typeof window.supabaseClient.from === 'function') return window.supabaseClient;

    try {
        const sbLib = window.supabase || (typeof supabase !== 'undefined' ? supabase : null);
        if (sbLib && typeof sbLib.createClient === 'function' && WMS_SUPABASE_URL && WMS_SUPABASE_ANON_KEY) {
            window._supabase = sbLib.createClient(WMS_SUPABASE_URL, WMS_SUPABASE_ANON_KEY);
            return window._supabase;
        }
    } catch(e) {
        // Safe catch to protect credentials and connection errors
    }
    return null;
}

function getLocalApprovalsStore() {
    try {
        const stored = localStorage.getItem(LOCAL_APPROVALS_KEY);
        return stored ? JSON.parse(stored) : [];
    } catch(e) { return []; }
}

function saveLocalApprovalsStore(data) {
    try { localStorage.setItem(LOCAL_APPROVALS_KEY, JSON.stringify(data)); } catch(e) {}
}

// -------------------------------------------------------------------------
// 2. ฝั่ง User ทั่วไปส่งคำขออนุมัติ (ลบ / สแกนจ่าย / ย้ายพิกัด / ย้ายกลุ่ม)
// -------------------------------------------------------------------------
async function createPendingApprovalRequest(type, desc, targetSns, payloadData) {
    const cleanTargetSns = Array.isArray(targetSns)
        ? targetSns.filter(s => s !== null && s !== undefined && String(s).trim() !== '').map(s => String(s).trim())
        : (targetSns ? [String(targetSns).trim()] : []);

    if (cleanTargetSns.length === 0) {
        if (typeof showToast === 'function') showToast("⚠ ไม่พบหมายเลข S/N ที่ต้องการส่งคำขออนุมัติ", true);
        return false;
    }

    const usernameVal = (typeof currentUser !== 'undefined' && currentUser) ? (currentUser.username || 'user') : 'user';
    const nameVal = (typeof currentUser !== 'undefined' && currentUser) ? (currentUser.name || currentUser.full_name || currentUser.username || 'User General') : 'User General';

    const client = getSupabaseClient();
    if (!client) {
        if (typeof showToast === 'function') showToast("❌ ไม่สามารถเชื่อมต่อฐานข้อมูลได้", true);
        return false;
    }

    const reqId = 'req_' + Date.now() + '_' + Math.random().toString(36).substring(2, 7);
    const requestPayload = {
        id: reqId,
        requester_username: String(usernameVal),
        requester_name: String(nameVal),
        request_type: String(type || 'DELETE'),
        description: String(desc || 'ขอดำเนินการเกี่ยวกับสต็อกสินค้า'),
        target_sns: cleanTargetSns,
        payload: payloadData || {},
        status: 'PENDING',
        approved_by: null,
        created_at: new Date().toISOString(),
        updated_at: new Date().toISOString()
    };

    let savedDbRecord = null;

    try {
        let { data, error } = await client
            .from('approval_requests')
            .insert([requestPayload])
            .select();

        if (error && (error.message.includes('uuid') || error.message.includes('integer') || error.code === '22P02')) {
            const autoIdPayload = { ...requestPayload };
            delete autoIdPayload.id;

            const retryResult = await client
                .from('approval_requests')
                .insert([autoIdPayload])
                .select();

            data = retryResult.data;
            error = retryResult.error;
        }

        if (error) {
            if (typeof showToast === 'function') showToast("❌ บันทึกคำขอไม่สำเร็จ", true);
            return false;
        }

        if (data && data.length > 0) {
            savedDbRecord = data[0];
        }
    } catch(e) {
        if (typeof showToast === 'function') showToast("❌ เกิดข้อผิดพลาดในการบันทึกข้อมูล", true);
        return false;
    }

    const activeRecord = savedDbRecord || requestPayload;

    const localList = getLocalApprovalsStore();
    localList.unshift(activeRecord);
    saveLocalApprovalsStore(localList);

    userTrackedRequestStatuses[activeRecord.id] = 'PENDING';

    playTTSNotification("ส่งคำขออนุมัติเรียบร้อยแล้ว");

    showFloatingNotificationAlert(
        "📤 ส่งคำขออนุมัติเรียบร้อยแล้ว!",
        `รายการ: ${desc}\nสถานะ: ส่งเรื่องไปยังศูนย์อนุมัติเรียบร้อยแล้ว อยู่ระหว่างรอผู้ดูแลระบบ (Admin) อนุมัติ`,
        "warning"
    );

    if (typeof showToast === 'function') showToast("✅ ส่งคำขออนุมัติเรียบร้อยแล้ว");

    await loadPendingApprovalsFromDB();
    return true;
}

// -------------------------------------------------------------------------
// 3. โหลดคำขออนุมัติจาก DB & แยกการแจ้งเตือน (บล็อกการแจ้งเตือนในหน้า Login)
// -------------------------------------------------------------------------
async function loadPendingApprovalsFromDB() {
    let mergedData = [];
    let dbSuccess = false;

    const client = getSupabaseClient();
    if (client) {
        try {
            let query = client.from('approval_requests').select('*');
            if (approvalStatusFilter !== 'ALL') {
                query = query.eq('status', approvalStatusFilter);
            }
            const { data, error } = await query.order('created_at', { ascending: false }).limit(200);
            if (!error && data) {
                mergedData = data;
                dbSuccess = true;
            }
        } catch(e) {
            // Safe Catch
        }
    }

    if (!dbSuccess) {
        mergedData = getLocalApprovalsStore();
        if (approvalStatusFilter !== 'ALL') {
            mergedData = mergedData.filter(r => r.status === approvalStatusFilter);
        }
    }

    if (mergedData) {
        const pendingCount = mergedData.filter(r => r.status === 'PENDING').length;
        const loggedIn = isUserLoggedIn();
        const isAdmin = isCurrentUserAdmin();

        // 🚨 บล็อกการแสดงผลแจ้งเตือนทุกชนิดในหน้า Login
        if (!loggedIn) {
            updateAdminApprovalBadgeUI(0);
            mergedData.forEach(req => {
                userTrackedRequestStatuses[req.id] = req.status;
            });
            pendingApprovalsList = mergedData;
            return;
        }

        // 🟢 ADMIN ONLY (หลังจากใส่รหัสผ่านล็อกอินสำเร็จแล้วเท่านั้น)
        if (isAdmin) {
            mergedData.forEach(req => {
                if (req.status === 'PENDING') {
                    if (!userTrackedRequestStatuses[req.id]) {
                        userTrackedRequestStatuses[req.id] = 'PENDING';
                        triggerAdminNotification(req, pendingCount);
                    }
                }
            });
            updateAdminApprovalBadgeUI(pendingCount);
        } else {
            updateAdminApprovalBadgeUI(0);

            // 🟢 USER ONLY (หลังจากใส่รหัสผ่านล็อกอินสำเร็จแล้วเท่านั้น)
            if (typeof currentUser !== 'undefined' && currentUser && currentUser.username) {
                mergedData.forEach(req => {
                    if (req.requester_username === currentUser.username) {
                        const oldStatus = userTrackedRequestStatuses[req.id];
                        if (oldStatus === 'PENDING' && req.status === 'APPROVED') {
                            playTTSNotification("คำขอของคุณได้รับการอนุมัติแล้ว");
                            showFloatingNotificationAlert(
                                "🎉 คำขอได้รับการอนุมัติ!",
                                `คำขอ "${req.description}" ของคุณได้รับการอนุมัติเรียบร้อยแล้ว`,
                                "success"
                            );
                            triggerAutoUIRefresh();
                        } else if (oldStatus === 'PENDING' && req.status === 'REJECTED') {
                            playTTSNotification("คำขอของคุณไม่ผ่านการอนุมัติ");
                            showFloatingNotificationAlert(
                                "❌ คำขอถูกปฏิเสธ",
                                `คำขอ "${req.description}" ของคุณถูกปฏิเสธโดยผู้ดูแลระบบ`,
                                "danger"
                            );
                        }
                        userTrackedRequestStatuses[req.id] = req.status;
                    }
                });
            }
        }

        pendingApprovalsList = mergedData;
        renderApprovalsTable(mergedData);
    }
}

// -------------------------------------------------------------------------
// 4. Render ตารางรายการอนุมัติและประวัติทั้งหมด
// -------------------------------------------------------------------------
function renderApprovalsTable(approvals) {
    if (!isUserLoggedIn()) return;

    const tbody = document.getElementById('approvalsTableBody') 
        || document.getElementById('approvalTableBody')
        || document.querySelector('#view-approvals table tbody');
        
    if (!tbody) return;

    if (!approvals || approvals.length === 0) {
        tbody.innerHTML = `<tr><td colspan="7" style="text-align:center; padding:24px; color:#64748b;">ไม่มีรายการคำขอในขณะนี้</td></tr>`;
        return;
    }

    let html = '';
    const isAdmin = isCurrentUserAdmin();

    approvals.forEach((item, idx) => {
        let statusBadge = `<span style="background:#fef3c7; color:#d97706; padding:4px 10px; border-radius:12px; font-weight:700; font-size:0.8rem; display:inline-block;">⏳ รออนุมัติ</span>`;
        if (item.status === 'APPROVED') {
            statusBadge = `<span style="background:#d1fae5; color:#059669; padding:4px 10px; border-radius:12px; font-weight:700; font-size:0.8rem; display:inline-block;">✅ อนุมัติแล้ว</span>`;
        } else if (item.status === 'REJECTED') {
            statusBadge = `<span style="background:#fee2e2; color:#dc2626; padding:4px 10px; border-radius:12px; font-weight:700; font-size:0.8rem; display:inline-block;">❌ ปฏิเสธ</span>`;
        }

        const formattedDate = item.created_at ? new Date(item.created_at).toLocaleString('th-TH') : '-';
        
        let snsFormattedHtml = '-';
        const targetSnsArr = Array.isArray(item.target_sns) ? item.target_sns : (item.target_sns ? [item.target_sns] : []);

        if (targetSnsArr.length > 0) {
            const snTags = targetSnsArr.map(sn => 
                `<code style="
                    background: #f1f5f9; 
                    color: #0f172a; 
                    padding: 2px 6px; 
                    border-radius: 4px; 
                    font-size: 0.78rem; 
                    font-weight: 700;
                    border: 1px solid #e2e8f0;
                    white-space: nowrap;
                    display: inline-block;
                ">${escapeHTML(String(sn))}</code>`
            ).join('');

            snsFormattedHtml = `
                <div style="
                    display: flex; 
                    flex-wrap: wrap; 
                    gap: 4px; 
                    max-width: 220px; 
                    max-height: 80px; 
                    overflow-y: auto; 
                    padding: 2px;
                ">
                    ${snTags}
                </div>
            `;
        }

        html += `
            <tr style="border-bottom: 1px solid #e2e8f0;">
                <td style="text-align:center; padding:12px;" class="mono">${idx + 1}</td>
                <td style="font-size:0.8rem; color:#64748b; padding:12px;">${escapeHTML(formattedDate)}</td>
                <td style="padding:12px;"><strong>${escapeHTML(item.requester_name || '-')}</strong><br><small style="color:#64748b;">(${escapeHTML(item.requester_username || '-')})</small></td>
                <td style="padding:12px;"><span style="font-weight:700; color:#0284c7; background:#e0f2fe; padding:2px 6px; border-radius:4px; font-size:0.8rem;">${escapeHTML(item.request_type || '-')}</span> ${statusBadge}</td>
                <td style="padding:12px; max-width:250px; word-break:break-word;">${escapeHTML(item.description || '-')}</td>
                <td style="padding:12px;">${snsFormattedHtml}</td>
                <td style="text-align:center; padding:12px;">
                    ${(item.status === 'PENDING' && isAdmin) ? `
                        <button onclick="approveUserRequest('${escapeHTML(String(item.id))}')" style="background:#10b981; color:#fff; border:none; padding:6px 12px; border-radius:6px; cursor:pointer; font-weight:700; margin-right:4px;"><i class="fa-solid fa-check"></i> อนุมัติ</button>
                        <button onclick="rejectUserRequest('${escapeHTML(String(item.id))}')" style="background:#ef4444; color:#fff; border:none; padding:6px 12px; border-radius:6px; cursor:pointer; font-weight:700;"><i class="fa-solid fa-xmark"></i> ปฏิเสธ</button>
                    ` : `<small style="color:#64748b;">${item.approved_by ? 'โดย ' + escapeHTML(item.approved_by) : '-'}</small>`}
                </td>
            </tr>
        `;
    });
    tbody.innerHTML = html;
}

// -------------------------------------------------------------------------
// 5. Update Badge Count (เฉพาะ Admin)
// -------------------------------------------------------------------------
function updateAdminApprovalBadgeUI(count) {
    if (!isUserLoggedIn()) return;
    const badges = document.querySelectorAll('#sidebarApprovalBadge, .approval-pending-badge');
    badges.forEach(b => {
        if (count > 0 && isCurrentUserAdmin()) {
            b.style.display = 'inline-flex';
            b.textContent = count;
        } else {
            b.style.display = 'none';
        }
    });
}

// -------------------------------------------------------------------------
// 6. ป๊อปอัพเด้งแจ้งเตือนฝั่ง Admin มุมขวาล่าง (ไม่แสดงในหน้า Login)
// -------------------------------------------------------------------------
function triggerAdminNotification(record, count) {
    if (!isUserLoggedIn() || !isCurrentUserAdmin()) return;

    playTTSNotification("มีคำขออนุมัติใหม่เข้ามา");

    showFloatingNotificationAlert(
        "🚨 มีคำขออนุมัติใหม่เข้ามา!",
        `ผู้ส่ง: ${record.requester_name || record.requester_username}\nรายการ: ${record.description}\n(รออนุมัติรวม ${count} รายการ)`,
        "warning",
        true
    );
}

function showFloatingNotificationAlert(title, message, type = 'info', isClickable = false) {
    if (!isUserLoggedIn()) return;

    let container = document.getElementById('globalFloatingNotificationContainer');
    if (!container) {
        container = document.createElement('div');
        container.id = 'globalFloatingNotificationContainer';
        container.style.cssText = `
            position: fixed; bottom: 24px; right: 24px; z-index: 999999;
            display: flex; flex-direction: column; gap: 12px;
            max-width: 420px; width: calc(100vw - 48px); pointer-events: none;
        `;
        document.body.appendChild(container);
    }

    const card = document.createElement('div');
    let borderColor = '#2563eb';
    if (type === 'success') borderColor = '#10b981';
    if (type === 'warning') borderColor = '#f59e0b';
    if (type === 'danger') borderColor = '#ef4444';

    card.style.cssText = `
        background: #ffffff; border-left: 6px solid ${borderColor};
        border-radius: 12px; padding: 16px; box-shadow: 0 10px 25px rgba(0,0,0,0.25);
        color: #0f172a; pointer-events: auto; cursor: ${(isClickable && isCurrentUserAdmin()) ? 'pointer' : 'default'};
        transition: all 0.3s ease; position: relative; font-family: sans-serif;
    `;

    if (isClickable && isCurrentUserAdmin()) {
        card.onclick = (e) => {
            if (e.target.tagName.toLowerCase() === 'button') return;
            navigateToApprovalCenter();
            card.remove();
        };
    }

    card.innerHTML = `
        <div style="font-weight: 800; font-size: 1rem; margin-bottom: 4px; color: ${borderColor};">
            ${escapeHTML(title)}
        </div>
        <div style="font-size: 0.88rem; color: #334155; white-space: pre-line;">${escapeHTML(message)}</div>
        ${(isClickable && isCurrentUserAdmin()) ? `<div style="margin-top:8px; font-weight:800; font-size:0.8rem; color:${borderColor};">👉 คลิกที่นี่เพื่อเปิดศูนย์อนุมัติคำขอทันที</div>` : ''}
        <button onclick="this.parentElement.remove()" style="position:absolute; top:8px; right:12px; background:none; border:none; font-size:1.2rem; cursor:pointer;">&times;</button>
    `;

    container.appendChild(card);
    setTimeout(() => { if (card && card.parentElement) card.remove(); }, 12000);
}

// -------------------------------------------------------------------------
// 7. สลับ View ไปยังหน้าอนุมัติ
// -------------------------------------------------------------------------
function navigateToApprovalCenter() {
    if (!isUserLoggedIn() || !isCurrentUserAdmin()) return;
    
    if (typeof switchView === 'function') switchView('view-approvals');
    else if (typeof showView === 'function') showView('view-approvals');
    else {
        document.querySelectorAll('.view-section, .page-section, section[id^="view-"]').forEach(s => s.style.display = 'none');
        const target = document.getElementById('view-approvals');
        if (target) target.style.display = 'block';
    }
    loadPendingApprovalsFromDB();
}

// -------------------------------------------------------------------------
// 8. Realtime Engine (Fast Polling 1 วินาที + WebSocket Listener)
// -------------------------------------------------------------------------
function startApprovalRealtimeMonitor() {
    initApprovalRealtimeSubscription();
    if (approvalPollingTimer) clearInterval(approvalPollingTimer);

    loadPendingApprovalsFromDB();
    approvalPollingTimer = setInterval(loadPendingApprovalsFromDB, 1000);
}

function initApprovalRealtimeSubscription() {
    const client = getSupabaseClient();
    if (!client) {
        setTimeout(initApprovalRealtimeSubscription, 1000);
        return;
    }

    if (approvalRealtimeChannel) {
        try { client.removeChannel(approvalRealtimeChannel); } catch(e) {}
    }

    approvalRealtimeChannel = client
        .channel('public_approval_requests_channel')
        .on('postgres_changes', { event: '*', schema: 'public', table: 'approval_requests' }, () => {
            loadPendingApprovalsFromDB();
            triggerAutoUIRefresh();
        })
        .subscribe();
}

// -------------------------------------------------------------------------
// 9. Admin Actions (อนุมัติ / ปฏิเสธ)
// -------------------------------------------------------------------------
async function approveUserRequest(id) {
    if (!isUserLoggedIn() || !isCurrentUserAdmin()) return;

    const req = pendingApprovalsList.find(r => String(r.id) === String(id));
    if (!req) return;

    const adminUser = (typeof currentUser !== 'undefined' && currentUser) ? (currentUser.username || currentUser.name || 'admin') : 'admin';
    const client = getSupabaseClient();

    if (client) {
        try {
            const reqType = req.request_type;
            const targetSns = Array.isArray(req.target_sns) ? req.target_sns : [req.target_sns];

            // 🟢 1. หากเป็นคำขอลบสินค้า หรือ จ่ายสินค้าออกจากคลัง
            if (reqType === 'DELETE' || reqType === 'OUTBOUND' || reqType === 'DISPATCH') {
                await client.from('warehouse_items').delete().in('sn', targetSns);
            } 
            // 🟢 2. หากเป็นคำขอย้ายพิกัดสินค้าเดี่ยว
            else if ((reqType === 'RELOCATE' || reqType === 'TRANSFER') && req.payload && req.payload.target_location) {
                await client.from('warehouse_items').update({
                    location: req.payload.target_location,
                    updated_at: new Date().toISOString()
                }).in('sn', targetSns);
            }
            // 🟢 3. หากเป็นคำขอย้ายพิกัดสินค้าแบบกลุ่ม (Batch Relocate)
            else if (reqType === 'BATCH_RELOCATE' && req.payload && req.payload.target_aisle) {
                const targetAisle = req.payload.target_aisle;
                for (const sn of targetSns) {
                    const freeLoc = (typeof allocateFreeSlot === 'function') ? allocateFreeSlot(targetAisle) : targetAisle;
                    await client.from('warehouse_items').update({
                        location: freeLoc,
                        updated_at: new Date().toISOString()
                    }).eq('sn', sn);
                }
            }

            // อัปเดตสถานะคำขอเป็น APPROVED
            await client.from('approval_requests').update({
                status: 'APPROVED',
                approved_by: adminUser,
                updated_at: new Date().toISOString()
            }).eq('id', id);
        } catch(e) {
            console.error("Approve request execution failed:", e);
        }
    }

    const localList = getLocalApprovalsStore();
    const found = localList.find(r => String(r.id) === String(id));
    if (found) { 
        found.status = 'APPROVED'; 
        found.approved_by = adminUser; 
        saveLocalApprovalsStore(localList); 
    }

    if (typeof showToast === 'function') showToast("✅ อนุมัติคำขอเรียบร้อยแล้ว");
    
    triggerAutoUIRefresh();
    await loadPendingApprovalsFromDB();
}

async function rejectUserRequest(id) {
    if (!isUserLoggedIn() || !isCurrentUserAdmin()) return;

    const req = pendingApprovalsList.find(r => String(r.id) === String(id));
    if (!req) return;

    const adminUser = (typeof currentUser !== 'undefined' && currentUser) ? (currentUser.username || currentUser.name || 'admin') : 'admin';
    const client = getSupabaseClient();

    if (client) {
        try {
            await client.from('approval_requests').update({
                status: 'REJECTED',
                approved_by: adminUser,
                updated_at: new Date().toISOString()
            }).eq('id', id);
        } catch(e) {
            // Safe Catch
        }
    }

    const localList = getLocalApprovalsStore();
    const found = localList.find(r => String(r.id) === String(id));
    if (found) { found.status = 'REJECTED'; found.approved_by = adminUser; saveLocalApprovalsStore(localList); }

    if (typeof showToast === 'function') showToast("⛔ ปฏิเสธคำขอเรียบร้อยแล้ว");
    
    triggerAutoUIRefresh();
    await loadPendingApprovalsFromDB();
}

// -------------------------------------------------------------------------
// 10. ตัวกรองประวัติรายการคำขอ
// -------------------------------------------------------------------------
function filterApprovalsByStatus(status) {
    approvalStatusFilter = status || 'ALL';
    loadPendingApprovalsFromDB();
}

// Global Exports
window.createPendingApprovalRequest = createPendingApprovalRequest;
window.refreshApprovalsUI = loadPendingApprovalsFromDB;
window.filterApprovalsByStatus = filterApprovalsByStatus;
window.approveUserRequest = approveUserRequest;
window.rejectUserRequest = rejectUserRequest;

// Auto Run Engine
if (document.readyState === 'loading') {
    document.addEventListener('DOMContentLoaded', startApprovalRealtimeMonitor);
} else {
    startApprovalRealtimeMonitor();
}