// =========================================================================
// --- MODULE 6: APPROVAL REQUESTS DATABASE & REALTIME ENGINE (OPTIMIZED & INSTANT UI) ---
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

// ⚡ Optimistic UI Action Tracker (ป้องกันการโดนข้อมูลเก่าจาก DB ทับสถานะขณะกำลังซิงค์เบื้องหลัง)
const optimisticActionsMap = new Map();

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
    if (!isUserLoggedIn()) return;
    try {
        if ('speechSynthesis' in window) {
            window.speechSynthesis.cancel();

            const voices = window.speechSynthesis.getVoices();
            const thaiVoices = voices.filter(v => v.lang === 'th-TH' || v.lang.startsWith('th'));

            let selectedVoice = null;
            let isMale = false;

            if (thaiVoices.length > 0) {
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

                if (!selectedVoice) {
                    selectedVoice = thaiVoices[0];
                }

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

            let cleanText = String(text).replace(/(ค่ะ|ครับ|คะ)$/g, '').trim();

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

            utter.pitch = isMale ? 1.0 : 1.2;
            utter.rate = 1.05;

            window.speechSynthesis.speak(utter);
        }
    } catch(e) {
        // Safe Catch
    }
}

// 🟢 ระบบ Auto-Refresh หน้ารายการสินค้าแบบเฉพาะกิจ (ทำงานเฉพาะเมื่อผู้ใช้อนุมัติ/ปฏิเสธเท่านั้น ไม่รีเฟรชเองพร่ำเพรื่อ)
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

// 🟢 ดึงหรือสร้าง Supabase Client 100%
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
        // Safe Catch
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
// 3. โหลดคำขออนุมัติจาก DB & แยกการแจ้งเตือน (ผนวก Optimistic UI Protection)
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
        // 🛡️ ป้องกันไม่ให้ DB Override สถานะที่เราเพิ่งกด อนุมัติ/ปฏิเสธ ทันที (Optimistic Lock)
        const now = Date.now();
        mergedData = mergedData.map(item => {
            const key = String(item.id);
            if (optimisticActionsMap.has(key)) {
                const opt = optimisticActionsMap.get(key);
                // หากทำรายการยังไม่เกิน 15 วินาที ให้ใช้สถานะ Optimistic
                if (now - opt.timestamp < 15000) {
                    return {
                        ...item,
                        status: opt.status,
                        approved_by: opt.approved_by || item.approved_by,
                        updated_at: opt.updated_at || item.updated_at
                    };
                } else {
                    optimisticActionsMap.delete(key);
                }
            }
            return item;
        });

        const pendingCount = mergedData.filter(r => r.status === 'PENDING').length;
        const loggedIn = isUserLoggedIn();
        const isAdmin = isCurrentUserAdmin();

        if (!loggedIn) {
            updateAdminApprovalBadgeUI(0);
            mergedData.forEach(req => {
                userTrackedRequestStatuses[req.id] = req.status;
            });
            pendingApprovalsList = mergedData;
            return;
        }

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
// 4. Render ตารางรายการอนุมัติ (Modern UX/UI Design & Micro-animations)
// -------------------------------------------------------------------------
function renderApprovalsTable(approvals) {
    if (!isUserLoggedIn()) return;

    const tbody = document.getElementById('approvalsTableBody') 
        || document.getElementById('approvalTableBody')
        || document.querySelector('#view-approvals table tbody');
        
    if (!tbody) return;

    if (!approvals || approvals.length === 0) {
        tbody.innerHTML = `
            <tr>
                <td colspan="7" style="text-align:center; padding:48px 20px; color:#94a3b8; background:#ffffff; border-radius:12px;">
                    <div style="display:flex; flex-direction:column; align-items:center; gap:10px;">
                        <div style="width:56px; height:56px; background:#f1f5f9; border-radius:50%; display:flex; align-items:center; justify-content:center; margin-bottom:4px;">
                            <i class="fa-solid fa-inbox" style="font-size:1.8rem; color:#94a3b8;"></i>
                        </div>
                        <span style="font-size:0.95rem; font-weight:700; color:#475569;">ไม่มีรายการคำขอในขณะนี้</span>
                        <span style="font-size:0.8rem; color:#94a3b8;">คำขอใหม่จะปรากฏที่นี่เมื่อมีการส่งเรื่องเข้ามา</span>
                    </div>
                </td>
            </tr>
        `;
        return;
    }

    let html = '';
    const isAdmin = isCurrentUserAdmin();

    approvals.forEach((item, idx) => {
        let statusBadge = `<span style="background:linear-gradient(135deg, #fffbeb, #fef3c7); color:#b45309; border:1px solid #fde68a; padding:5px 12px; border-radius:20px; font-weight:700; font-size:0.78rem; display:inline-flex; align-items:center; gap:5px; box-shadow:0 1px 2px rgba(0,0,0,0.04);"><i class="fa-solid fa-hourglass-half fa-spin-pulse" style="font-size:0.75rem;"></i> รออนุมัติ</span>`;
        if (item.status === 'APPROVED') {
            statusBadge = `<span style="background:linear-gradient(135deg, #ecfdf5, #d1fae5); color:#047857; border:1px solid #a7f3d0; padding:5px 12px; border-radius:20px; font-weight:700; font-size:0.78rem; display:inline-flex; align-items:center; gap:5px; box-shadow:0 1px 2px rgba(0,0,0,0.04);"><i class="fa-solid fa-circle-check" style="font-size:0.8rem;"></i> อนุมัติแล้ว</span>`;
        } else if (item.status === 'REJECTED') {
            statusBadge = `<span style="background:linear-gradient(135deg, #fef2f2, #fee2e2); color:#b91c1c; border:1px solid #fca5a5; padding:5px 12px; border-radius:20px; font-weight:700; font-size:0.78rem; display:inline-flex; align-items:center; gap:5px; box-shadow:0 1px 2px rgba(0,0,0,0.04);"><i class="fa-solid fa-circle-xmark" style="font-size:0.8rem;"></i> ปฏิเสธแล้ว</span>`;
        }

        const formattedDate = item.created_at ? new Date(item.created_at).toLocaleString('th-TH', { dateStyle: 'short', timeStyle: 'short' }) : '-';
        
        let snsFormattedHtml = '-';
        const targetSnsArr = Array.isArray(item.target_sns) ? item.target_sns : (item.target_sns ? [item.target_sns] : []);

        if (targetSnsArr.length > 0) {
            const snTags = targetSnsArr.map(sn => 
                `<code style="
                    background: #f8fafc; 
                    color: #0f172a; 
                    padding: 3px 8px; 
                    border-radius: 6px; 
                    font-size: 0.78rem; 
                    font-weight: 700;
                    border: 1px solid #cbd5e1;
                    white-space: nowrap;
                    display: inline-block;
                    font-family: 'JetBrains Mono', Consolas, monospace;
                ">${escapeHTML(String(sn))}</code>`
            ).join('');

            snsFormattedHtml = `
                <div style="
                    display: flex; 
                    flex-wrap: wrap; 
                    gap: 5px; 
                    max-width: 260px; 
                    max-height: 90px; 
                    overflow-y: auto; 
                    padding: 2px;
                ">
                    ${snTags}
                </div>
            `;
        }

        const actionCellId = `action_cell_${escapeHTML(String(item.id))}`;

        html += `
            <tr style="border-bottom: 1px solid #f1f5f9; transition: background 0.15s ease;" onmouseover="this.style.background='#f8fafc'" onmouseout="this.style.background='transparent'">
                <td style="text-align:center; padding:14px 10px; font-weight:700; color:#64748b;" class="mono">${idx + 1}</td>
                <td style="font-size:0.78rem; color:#64748b; padding:14px 10px; font-weight:500;">${escapeHTML(formattedDate)}</td>
                <td style="padding:14px 10px;">
                    <div style="font-weight:700; color:#0f172a; font-size:0.88rem;">${escapeHTML(item.requester_name || '-')}</div>
                    <div style="font-size:0.75rem; color:#64748b; margin-top:2px;">@${escapeHTML(item.requester_username || '-')}</div>
                </td>
                <td style="padding:14px 10px; vertical-align:middle;">
                    <div style="display:inline-flex; flex-direction:column; gap:5px;">
                        <span style="font-weight:800; color:#0369a1; background:#e0f2fe; border:1px solid #bae6fd; padding:3px 9px; border-radius:6px; font-size:0.75rem; display:inline-block; width:fit-content;">${escapeHTML(item.request_type || '-')}</span>
                        ${statusBadge}
                    </div>
                </td>
                <td style="padding:14px 10px; max-width:260px; word-break:break-word; font-size:0.85rem; color:#334155; line-height:1.45; font-weight:500;">${escapeHTML(item.description || '-')}</td>
                <td style="padding:14px 10px;">${snsFormattedHtml}</td>
                <td id="${actionCellId}" style="text-align:center; padding:14px 10px; vertical-align:middle;">
                    ${(item.status === 'PENDING' && isAdmin) ? `
                        <div style="display:inline-flex; gap:6px;">
                            <button id="btn_approve_${escapeHTML(String(item.id))}" onclick="approveUserRequest('${escapeHTML(String(item.id))}')" style="background:linear-gradient(135deg, #10b981, #059669); color:#ffffff; border:none; padding:8px 16px; border-radius:8px; cursor:pointer; font-weight:700; font-size:0.82rem; display:inline-flex; align-items:center; gap:6px; box-shadow:0 2px 5px rgba(16,185,129,0.25); transition:all 0.15s ease;" onmouseover="this.style.transform='translateY(-1px)'" onmouseout="this.style.transform='translateY(0)'">
                                <i class="fa-solid fa-check"></i> อนุมัติ
                            </button>
                            <button id="btn_reject_${escapeHTML(String(item.id))}" onclick="rejectUserRequest('${escapeHTML(String(item.id))}')" style="background:linear-gradient(135deg, #ef4444, #dc2626); color:#ffffff; border:none; padding:8px 16px; border-radius:8px; cursor:pointer; font-weight:700; font-size:0.82rem; display:inline-flex; align-items:center; gap:6px; box-shadow:0 2px 5px rgba(239,68,68,0.25); transition:all 0.15s ease;" onmouseover="this.style.transform='translateY(-1px)'" onmouseout="this.style.transform='translateY(0)'">
                                <i class="fa-solid fa-xmark"></i> ปฏิเสธ
                            </button>
                        </div>
                    ` : `<span style="font-size:0.78rem; font-weight:600; color:#64748b; background:#f1f5f9; padding:5px 12px; border-radius:6px; border:1px solid #e2e8f0;">${item.approved_by ? 'โดย ' + escapeHTML(item.approved_by) : '-'}</span>`}
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
        border-radius: 12px; padding: 16px; box-shadow: 0 10px 25px rgba(0,0,0,0.15);
        color: #0f172a; pointer-events: auto; cursor: ${(isClickable && isCurrentUserAdmin()) ? 'pointer' : 'default'};
        transition: all 0.3s ease; position: relative; font-family: system-ui, -apple-system, sans-serif;
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
        <button onclick="this.parentElement.remove()" style="position:absolute; top:8px; right:12px; background:none; border:none; font-size:1.2rem; cursor:pointer; color:#94a3b8;">&times;</button>
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
// 8. Realtime Engine (Event-Driven Passive Monitor ไม่รีเฟรชรบกวนผู้ใช้)
// -------------------------------------------------------------------------
function startApprovalRealtimeMonitor() {
    initApprovalRealtimeSubscription();
    if (approvalPollingTimer) clearInterval(approvalPollingTimer);

    // Initial load
    loadPendingApprovalsFromDB();

    // 🟢 ปรับเปลี่ยนเป็นแบบ Passive Refresh ทุกๆ 60 วินาที เพื่อดึงป้ายเตือนเบื้องหลัง โดยไม่รีเฟรชหน้าเว็บทั้งหน้า
    approvalPollingTimer = setInterval(() => {
        if (isUserLoggedIn()) {
            loadPendingApprovalsFromDB();
        }
    }, 60000);
}

function initApprovalRealtimeSubscription() {
    const client = getSupabaseClient();
    if (!client) {
        setTimeout(initApprovalRealtimeSubscription, 2000);
        return;
    }

    if (approvalRealtimeChannel) {
        try { client.removeChannel(approvalRealtimeChannel); } catch(e) {}
    }

    approvalRealtimeChannel = client
        .channel('public_approval_requests_channel')
        .on('postgres_changes', { event: '*', schema: 'public', table: 'approval_requests' }, () => {
            loadPendingApprovalsFromDB();
        })
        .subscribe();
}

// -------------------------------------------------------------------------
// 9. Admin Actions (ตอบสนองทันที 0ms Instant Optimistic Execution + Background Sync)
// -------------------------------------------------------------------------
async function approveUserRequest(id) {
    if (!isUserLoggedIn() || !isCurrentUserAdmin()) return;

    const idStr = String(id);
    const req = pendingApprovalsList.find(r => String(r.id) === idStr);
    if (!req) return;

    const adminUser = (typeof currentUser !== 'undefined' && currentUser) ? (currentUser.username || currentUser.name || 'admin') : 'admin';
    const nowIso = new Date().toISOString();

    // ⚡⚡ 1. INSTANT DOM MUTATION (เปลี่ยนปุ่มปุ๊บปั๊บทันที 0ms บนหน้าจอ)
    const actionCell = document.getElementById(`action_cell_${idStr}`);
    if (actionCell) {
        actionCell.innerHTML = `<span style="font-size:0.78rem; font-weight:600; color:#64748b; background:#f1f5f9; padding:5px 12px; border-radius:6px; border:1px solid #e2e8f0;">โดย ${escapeHTML(adminUser)}</span>`;
    }

    // ⚡⚡ 2. OPTIMISTIC STATE UPDATE & LOCK (อัปเดตความทรงจำระบบทันที)
    req.status = 'APPROVED';
    req.approved_by = adminUser;
    req.updated_at = nowIso;

    optimisticActionsMap.set(idStr, {
        status: 'APPROVED',
        approved_by: adminUser,
        updated_at: nowIso,
        timestamp: Date.now()
    });

    userTrackedRequestStatuses[idStr] = 'APPROVED';

    // อัปเดตข้อมูลใน LocalStorage ทันที
    const localList = getLocalApprovalsStore();
    const foundLocal = localList.find(r => String(r.id) === idStr);
    if (foundLocal) { 
        foundLocal.status = 'APPROVED'; 
        foundLocal.approved_by = adminUser; 
        foundLocal.updated_at = nowIso;
        saveLocalApprovalsStore(localList); 
    }

    // เรนเดอร์ UI ภาพรวมและอัปเดตป้ายแจ้งเตือนทันที
    renderApprovalsTable(pendingApprovalsList);
    const pendingCount = pendingApprovalsList.filter(r => r.status === 'PENDING').length;
    updateAdminApprovalBadgeUI(pendingCount);

    // แจ้งเตือนเสียงและ Toast
    if (typeof showToast === 'function') showToast("✅ อนุมัติคำขอเรียบร้อยแล้ว");
    playTTSNotification("ทำรายการอนุมัติเรียบร้อยแล้ว");

    // 🟢 บังคับสั่งซิงค์ UI สต็อกสินค้าหลักทันทีเมื่อกดอนุมัติสำเร็จ
    triggerAutoUIRefresh();

    // ⚡⚡ 3. BACKGROUND ASYNC DB SYNCHRONIZATION (ส่งข้อมูลเข้า Supabase DB ในเบื้องหลัง)
    (async () => {
        const client = getSupabaseClient();
        if (!client) return;

        try {
            const reqType = req.request_type;
            const targetSns = Array.isArray(req.target_sns) ? req.target_sns : [req.target_sns];

            if (reqType === 'DELETE' || reqType === 'OUTBOUND' || reqType === 'DISPATCH') {
                await client.from('warehouse_items').delete().in('sn', targetSns);
            } 
            else if ((reqType === 'RELOCATE' || reqType === 'TRANSFER') && req.payload && req.payload.target_location) {
                await client.from('warehouse_items').update({
                    location: req.payload.target_location,
                    updated_at: new Date().toISOString()
                }).in('sn', targetSns);
            }
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

            await client.from('approval_requests').update({
                status: 'APPROVED',
                approved_by: adminUser,
                updated_at: new Date().toISOString()
            }).eq('id', id);

        } catch(e) {
            console.error("Background Approve execution error:", e);
        }
    })();
}

async function rejectUserRequest(id) {
    if (!isUserLoggedIn() || !isCurrentUserAdmin()) return;

    const idStr = String(id);
    const req = pendingApprovalsList.find(r => String(r.id) === idStr);
    if (!req) return;

    const adminUser = (typeof currentUser !== 'undefined' && currentUser) ? (currentUser.username || currentUser.name || 'admin') : 'admin';
    const nowIso = new Date().toISOString();

    // ⚡⚡ 1. INSTANT DOM MUTATION (เปลี่ยนปุ่มปุ๊บปั๊บทันที 0ms บนหน้าจอ)
    const actionCell = document.getElementById(`action_cell_${idStr}`);
    if (actionCell) {
        actionCell.innerHTML = `<span style="font-size:0.78rem; font-weight:600; color:#64748b; background:#f1f5f9; padding:5px 12px; border-radius:6px; border:1px solid #e2e8f0;">โดย ${escapeHTML(adminUser)}</span>`;
    }

    // ⚡⚡ 2. OPTIMISTIC STATE UPDATE & LOCK (อัปเดตความทรงจำระบบทันที)
    req.status = 'REJECTED';
    req.approved_by = adminUser;
    req.updated_at = nowIso;

    optimisticActionsMap.set(idStr, {
        status: 'REJECTED',
        approved_by: adminUser,
        updated_at: nowIso,
        timestamp: Date.now()
    });

    userTrackedRequestStatuses[idStr] = 'REJECTED';

    const localList = getLocalApprovalsStore();
    const foundLocal = localList.find(r => String(r.id) === idStr);
    if (foundLocal) { 
        foundLocal.status = 'REJECTED'; 
        foundLocal.approved_by = adminUser; 
        foundLocal.updated_at = nowIso;
        saveLocalApprovalsStore(localList); 
    }

    renderApprovalsTable(pendingApprovalsList);
    const pendingCount = pendingApprovalsList.filter(r => r.status === 'PENDING').length;
    updateAdminApprovalBadgeUI(pendingCount);

    if (typeof showToast === 'function') showToast("⛔ ปฏิเสธคำขอเรียบร้อยแล้ว");
    playTTSNotification("ปฏิเสธคำขอเรียบร้อยแล้ว");

    // 🟢 บังคับสั่งซิงค์ UI สต็อกสินค้าหลักทันทีเมื่อกดปฏิเสธสำเร็จ
    triggerAutoUIRefresh();

    // ⚡⚡ 3. BACKGROUND ASYNC DB SYNCHRONIZATION (ส่งข้อมูลเข้า Supabase DB ในเบื้องหลัง)
    (async () => {
        const client = getSupabaseClient();
        if (!client) return;

        try {
            await client.from('approval_requests').update({
                status: 'REJECTED',
                approved_by: adminUser,
                updated_at: new Date().toISOString()
            }).eq('id', id);
        } catch(e) {
            console.error("Background Reject execution error:", e);
        }
    })();
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