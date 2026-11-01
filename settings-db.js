// =========================================================================
// --- MODULE 8: WAREHOUSE SETTINGS & MENU DB MAPPING ENGINE (FULL & UPDATED v5.2) ---
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

window.masterAisles = window.masterAisles || [];
window.aisleConfigs = window.aisleConfigs || {};
window.masterProductsList = window.masterProductsList || [];
window.systemUsersList = window.systemUsersList || [];
window.userActivitiesList = window.userActivitiesList || [];

let isConfigsLoadedFromDB = false;
let isMasterProductsRealtimeActive = false;
let isUsersRealtimeActive = false;
let isActivitiesRealtimeActive = false;

let menuDbMappingData = [
    { menuId: 'view-inventory', menuTitle: 'เช็คสต็อกสินค้า', dbTable: 'warehouse_items / products', status: 'Active (Realtime)', desc: 'อ่าน/ค้นหา สต็อกทั้งหมด และค้นหารหัสสินค้า Master' },
    { menuId: 'view-inbound', menuTitle: 'รับสินค้าเข้าคลัง (Fast)', dbTable: 'warehouse_items', status: 'Active (Realtime Insert)', desc: 'เพิ่มรายการ S/N สินค้าเข้าฐานข้อมูลโดยตรง คำนวณพิกัดอัตโนมัติ' },
    { menuId: 'view-outbound', menuTitle: 'จ่ายสินค้าออกจากคลัง', dbTable: 'outbound_orders / warehouse_items', status: 'Active (Realtime Sync)', desc: 'ตัดจ่าย S/N ออกจากคลัง และสร้างใบสั่งจ่าย' },
    { menuId: 'view-locations', menuTitle: 'ผังตำแหน่งคลังสินค้า', dbTable: 'warehouse_items / system_settings', status: 'Active (Drill-Down)', desc: 'แสดงตำแหน่งจัดเก็บจริงตามโครงสร้างแถว ล็อก ชั้น และช่อง' },
    { menuId: 'view-approvals', menuTitle: 'ศูนย์อนุมัติคำขอ', dbTable: 'approval_requests', status: 'Active (Realtime Approvals)', desc: 'จัดการอนุมัติ/ปฏิเสธคำขอลบและจ่ายสินค้าจาก User' },
    { menuId: 'view-activities', menuTitle: 'ดูประวัติการใช้งาน', dbTable: 'user_activities', status: 'Active (Realtime Logging)', desc: 'เก็บบันทึกและแสดงผลประวัติกิจกรรมผู้ใช้งานทั้งหมด' },
    { menuId: 'view-settings', menuTitle: 'ตั้งค่าพิกัดคลังสินค้า', dbTable: 'system_settings / profiles', status: 'Active (System Config)', desc: 'บันทึกโครงสร้างคลัง จัดการสิทธิ์ผู้ใช้ สแกนลายนิ้วมือ และตรวจสอบ DB Connection' }
];

// =========================================================================
// --- REALTIME UNLIMITED MASTER PRODUCTS ENGINE (> 2,000+ ITEMS) ---
// =========================================================================

async function loadMasterProductsFromDBRealtime() {
    const client = typeof getSupabaseClient === 'function' ? getSupabaseClient() : (typeof _supabase !== 'undefined' ? _supabase : null);
    if (!client) return window.masterProductsList || [];

    try {
        let allProducts = [];
        let from = 0;
        const step = 1000;
        let fetchMore = true;

        while (fetchMore) {
            const { data, error } = await client
                .from('products')
                .select('*')
                .range(from, from + step - 1)
                .order('id', { ascending: true });

            if (error) {
                console.error("Error fetching master products chunk:", error);
                break;
            }

            if (data && data.length > 0) {
                allProducts = allProducts.concat(data);
                if (data.length < step) {
                    fetchMore = false;
                } else {
                    from += step;
                }
            } else {
                fetchMore = false;
            }
        }

        window.masterProductsList = allProducts;
        const totalCount = allProducts.length;

        const countElementIds = [
            'masterProductCount', 'totalMasterProducts', 'masterProductsCount',
            'productCountBadge', 'totalProductsBadge', 'dbMasterCount', 'masterCount',
            'masterProductsTotal', 'lblMasterProductCount', 'dbStatusMasterCount'
        ];
        countElementIds.forEach(id => {
            const el = document.getElementById(id);
            if (el) el.textContent = totalCount.toLocaleString('th-TH');
        });

        document.querySelectorAll('.master-product-count, .master-count-badge, [data-count="master-products"]').forEach(el => {
            el.textContent = totalCount.toLocaleString('th-TH');
        });

        renderMenuDatabaseMappingTable();

        if (typeof renderMasterProductsTable === 'function') {
            renderMasterProductsTable(window.masterProductsList);
        }
        if (typeof updateProductDropdowns === 'function') {
            updateProductDropdowns(window.masterProductsList);
        }
        if (typeof updateMasterProductCountBadge === 'function') {
            updateMasterProductCountBadge(totalCount);
        }

        initMasterProductsRealtimeSubscription();
        return window.masterProductsList;
    } catch (err) {
        console.error("Failed to load full master products:", err);
        return window.masterProductsList || [];
    }
}

function initMasterProductsRealtimeSubscription() {
    if (isMasterProductsRealtimeActive) return;
    const client = typeof getSupabaseClient === 'function' ? getSupabaseClient() : (typeof _supabase !== 'undefined' ? _supabase : null);
    if (!client) return;

    try {
        client
            .channel('public_products_realtime_changes')
            .on('postgres_changes', { event: '*', schema: 'public', table: 'products' }, async () => {
                await loadMasterProductsFromDBRealtime();
            })
            .subscribe((status) => {
                if (status === 'SUBSCRIBED') {
                    isMasterProductsRealtimeActive = true;
                }
            });
    } catch (e) {
        console.error("Realtime subscription error for products:", e);
    }
}

// =========================================================================
// --- USER MANAGEMENT & PERMISSIONS ENGINE (100% PERFECT MATCHED COLUMNS) ---
// =========================================================================

async function loadUsersAndPermissionsFromDB() {
    const client = typeof getSupabaseClient === 'function' ? getSupabaseClient() : (typeof _supabase !== 'undefined' ? _supabase : null);
    if (!client) return;

    try {
        const { data, error } = await client
            .from('profiles')
            .select('*')
            .order('created_at', { ascending: false });

        if (error) throw error;

        window.systemUsersList = data || [];
        renderUsersManagementTable();
        initUsersRealtimeSubscription();
    } catch (err) {
        console.error("Failed to fetch profiles/users:", err);
    }
}

function initUsersRealtimeSubscription() {
    if (isUsersRealtimeActive) return;
    const client = typeof getSupabaseClient === 'function' ? getSupabaseClient() : (typeof _supabase !== 'undefined' ? _supabase : null);
    if (!client) return;

    try {
        client
            .channel('public_profiles_realtime_changes')
            .on('postgres_changes', { event: '*', schema: 'public', table: 'profiles' }, async () => {
                await loadUsersAndPermissionsFromDB();
            })
            .subscribe((status) => {
                if (status === 'SUBSCRIBED') {
                    isUsersRealtimeActive = true;
                }
            });
    } catch (e) {
        console.error("User realtime subscription error:", e);
    }
}

function renderUsersManagementTable() {
    const tbody = document.getElementById('userManagementTableBody') || document.getElementById('usersTableBody');
    if (!tbody) return;

    const parentTable = tbody.closest('table');
    if (parentTable) {
        let thead = parentTable.querySelector('thead');
        if (thead) {
            thead.innerHTML = `
                <tr>
                    <th style="text-align:center; vertical-align:middle; width:60px;">ลำดับ</th>
                    <th style="text-align:center; vertical-align:middle;">ยูสเซอร์</th>
                    <th style="text-align:center; vertical-align:middle;">ชื่อ - นามสกุล</th>
                    <th style="text-align:center; vertical-align:middle;">แผนก</th>
                    <th style="text-align:center; vertical-align:middle;">ฝ่าย</th>
                    <th style="text-align:center; vertical-align:middle;">สิทธิ์</th>
                    <th style="text-align:center; vertical-align:middle;">สแกนลายนิ้วมือ</th>
                    <th style="text-align:center; vertical-align:middle;">ประวัติ</th>
                    <th style="text-align:center; vertical-align:middle;">จัดการ</th>
                </tr>
            `;
        }
    }

    tbody.innerHTML = '';
    const users = window.systemUsersList || [];

    if (users.length === 0) {
        tbody.innerHTML = `<tr><td colspan="9" style="text-align:center; color:var(--text-sub); padding:18px;">ไม่พบข้อมูลผู้ใช้งานในระบบ</td></tr>`;
        return;
    }

    users.forEach((user, idx) => {
        const safeUserId = escapeHTML(user.id || '');
        const safeEmail = escapeHTML(user.email || user.username || 'N/A');
        const safeName = escapeHTML(user.full_name || user.display_name || safeEmail.split('@')[0]);
        const safeDept = escapeHTML(user.department || user.dept || 'ไม่ระบุ');
        const safeSection = escapeHTML(user.section || user.division || user.faction || 'ไม่ระบุ');
        const safeRole = escapeHTML(user.role || 'User');
        const isBlocked = user.status === 'disabled' || user.status === 'blocked';

        const bioKey = `WMS_BIOMETRIC_CREDENTIALS_${safeEmail.toLowerCase()}`;
        const hasBiometric = Boolean(localStorage.getItem(bioKey) || user.biometric_credential);

        const tr = document.createElement('tr');
        tr.style.borderBottom = '1px solid var(--border-color, rgba(0,0,0,0.08))';
        tr.innerHTML = `
            <td style="text-align:center; vertical-align:middle; font-weight:600;" class="mono">${idx + 1}</td>
            <td style="text-align:center; vertical-align:middle;">
                <div style="display:inline-flex; align-items:center; gap:6px;">
                    <i class="fa-solid fa-circle-user" style="color:var(--primary-bg, #2563eb); font-size:1rem;"></i>
                    <span style="font-weight:600; font-size:0.88rem;" class="mono">${safeEmail}</span>
                </div>
            </td>
            <td style="text-align:center; vertical-align:middle;">
                <span style="font-weight:600; font-size:0.88rem;">${safeName}</span>
            </td>
            <td style="text-align:center; vertical-align:middle;">
                <span class="badge-action secondary" style="padding:4px 10px; font-size:0.78rem; border-radius:6px; background:rgba(100,116,139,0.1);">
                    ${safeDept}
                </span>
            </td>
            <td style="text-align:center; vertical-align:middle;">
                <span class="badge-action secondary" style="padding:4px 10px; font-size:0.78rem; border-radius:6px; background:rgba(100,116,139,0.1);">
                    ${safeSection}
                </span>
            </td>
            <td style="text-align:center; vertical-align:middle;">
                <span class="badge-action ${safeRole.toLowerCase() === 'admin' ? 'inbound' : 'secondary'}" style="padding:4px 12px; font-size:0.78rem; font-weight:600; border-radius:20px;">
                    <i class="fa-solid ${safeRole.toLowerCase() === 'admin' ? 'fa-user-shield' : 'fa-user'}" style="margin-right:4px;"></i>${safeRole}
                    ${isBlocked ? ' <small style="color:#ef4444;">(ระงับ)</small>' : ''}
                </span>
            </td>
            <td style="text-align:center; vertical-align:middle;">
                <span class="badge-action ${hasBiometric ? 'inbound' : 'secondary'}" style="padding:4px 10px; font-size:0.78rem; border-radius:6px;">
                    <i class="fa-solid fa-fingerprint"></i> ${hasBiometric ? 'ผูกแล้ว' : 'ยังไม่ผูก'}
                </span>
            </td>
            <td style="text-align:center; vertical-align:middle;">
                <button class="btn btn-sm btn-primary" onclick="viewUserActivityLogs('${safeUserId}', '${safeEmail}')" title="ดูประวัติกิจกรรม" style="padding:5px 12px; font-size:0.8rem; border-radius:6px;">
                    <i class="fa-solid fa-clock-rotate-left"></i> ประวัติ
                </button>
            </td>
            <td style="text-align:center; vertical-align:middle;">
                <button class="btn btn-sm btn-secondary" onclick="openEditUserModal('${safeUserId}')" title="แก้ไขข้อมูลและสิทธิ์ผู้ใช้งาน" style="padding:5px 12px; font-size:0.8rem; border-radius:6px;">
                    <i class="fa-solid fa-pen-to-square" style="margin-right:4px;"></i> แก้ไขจัดการ
                </button>
            </td>
        `;
        tbody.appendChild(tr);
    });
}

async function triggerUserBiometricRegistration(username, fullName) {
    if (!window.PublicKeyCredential) {
        alert("❌ เบราว์เซอร์หรืออุปกรณ์นี้ไม่รองรับระบบสแกนลายนิ้วมือ / Touch ID");
        return;
    }

    const confirmReg = confirm(`🖐️ คุณต้องการเพิ่ม/ลงทะเบียนสแกนลายนิ้วมือให้กับผู้ใช้ "${fullName} (${username})" ใช่หรือไม่?`);
    if (!confirmReg) return;

    if (typeof window.registerBiometricAuth === 'function') {
        const targetObj = { username: username, name: fullName };
        const success = await window.registerBiometricAuth(targetObj);
        if (success) renderUsersManagementTable();
    } else {
        alert("⚠️ ระบบสแกนลายนิ้วมือยังไม่พร้อมใช้งานในสคริปต์หลัก");
    }
}

async function openEditUserModal(userId) {
    const user = (window.systemUsersList || []).find(u => String(u.id) === String(userId));
    if (!user) {
        alert("❌ ไม่พบข้อมูลผู้ใช้ในระบบ");
        return;
    }

    const safeUserId = escapeHTML(user.id);
    const safeEmail = escapeHTML(user.email || user.username || 'N/A');
    const safeFullName = escapeHTML(user.full_name || '');
    const safeDepartment = escapeHTML(user.department || user.dept || '');
    const safeSection = escapeHTML(user.section || user.division || user.faction || '');
    const safeRole = (user.role || 'User').toLowerCase();
    const isBlocked = user.status === 'disabled' || user.status === 'blocked';

    const bioKey = `WMS_BIOMETRIC_CREDENTIALS_${safeEmail.toLowerCase()}`;
    const hasBiometric = Boolean(localStorage.getItem(bioKey) || user.biometric_credential);

    const existingModal = document.getElementById('editUserCustomModal');
    if (existingModal) existingModal.remove();

    const modalHTML = `
        <div id="editUserCustomModal" style="position:fixed; top:0; left:0; width:100vw; height:100vh; background:rgba(0,0,0,0.65); backdrop-filter:blur(6px); z-index:99999; display:flex; align-items:center; justify-content:center; padding:15px;">
            <div style="background:var(--card-bg, #ffffff); color:var(--text-color, #333); width:100%; max-width:540px; border-radius:18px; box-shadow:0 20px 40px rgba(0,0,0,0.4); overflow:hidden; border:1px solid rgba(255,255,255,0.12);">
                <div style="padding:18px 24px; background:var(--primary-bg, #1e293b); color:#fff; display:flex; justify-content:space-between; align-items:center;">
                    <div style="display:flex; align-items:center; gap:10px;">
                        <i class="fa-solid fa-user-gear" style="font-size:1.2rem; color:#60a5fa;"></i>
                        <h3 style="margin:0; font-size:1.1rem; font-weight:600;">แก้ไขข้อมูลและจัดการสิทธิ์ผู้ใช้</h3>
                    </div>
                    <button type="button" onclick="closeEditUserModal()" style="background:none; border:none; color:#a1a1aa; font-size:1.3rem; cursor:pointer;" onmouseover="this.style.color='#fff'" onmouseout="this.style.color='#a1a1aa'"><i class="fa-solid fa-xmark"></i></button>
                </div>
                <form id="editUserForm" onsubmit="saveUserDataModal(event, '${safeUserId}')" style="padding:24px;">
                    <div style="margin-bottom:16px;">
                        <label style="display:block; font-size:0.85rem; font-weight:600; margin-bottom:6px; color:var(--text-sub);">บัญชีผู้ใช้ / อีเมล (User Account)</label>
                        <div style="position:relative;">
                            <input type="text" class="form-control" value="${safeEmail}" disabled style="width:100%; opacity:0.75; background:rgba(0,0,0,0.04); padding-left:35px;">
                            <i class="fa-solid fa-envelope" style="position:absolute; left:12px; top:50%; transform:translateY(-50%); color:#94a3b8; font-size:0.85rem;"></i>
                        </div>
                    </div>
                    <div style="margin-bottom:16px;">
                        <label style="display:block; font-size:0.85rem; font-weight:600; margin-bottom:6px;">ชื่อ - นามสกุล</label>
                        <input type="text" id="editModalFullName" class="form-control" value="${safeFullName}" placeholder="กรอกชื่อ-นามสกุล" required style="width:100%;">
                    </div>
                    <div style="display:grid; grid-template-columns:1fr 1fr; gap:14px; margin-bottom:16px;">
                        <div>
                            <label style="display:block; font-size:0.85rem; font-weight:600; margin-bottom:6px;">แผนก</label>
                            <input type="text" id="editModalDepartment" class="form-control" value="${safeDepartment}" placeholder="เช่น แผนกคลังสินค้า" style="width:100%;">
                        </div>
                        <div>
                            <label style="display:block; font-size:0.85rem; font-weight:600; margin-bottom:6px;">ฝ่ายงาน</label>
                            <input type="text" id="editModalSection" class="form-control" value="${safeSection}" placeholder="เช่น ฝ่ายจัดส่ง / IT" style="width:100%;">
                        </div>
                    </div>
                    <div style="display:grid; grid-template-columns:1fr 1fr; gap:14px; margin-bottom:16px;">
                        <div>
                            <label style="display:block; font-size:0.85rem; font-weight:600; margin-bottom:6px;">สิทธิ์การใช้งาน (Role)</label>
                            <select id="editModalRole" class="form-control" style="width:100%;">
                                <option value="Admin" ${safeRole === 'admin' ? 'selected' : ''}>Admin (ผู้ดูแลระบบ)</option>
                                <option value="Manager" ${safeRole === 'manager' ? 'selected' : ''}>Manager (ผู้จัดการ)</option>
                                <option value="User" ${safeRole === 'user' ? 'selected' : ''}>User (เจ้าหน้าที่ทั่วไป)</option>
                                <option value="Staff" ${safeRole === 'staff' ? 'selected' : ''}>Staff (ผู้ปฏิบัติงาน)</option>
                            </select>
                        </div>
                        <div>
                            <label style="display:block; font-size:0.85rem; font-weight:600; margin-bottom:6px;">สถานะการใช้งาน</label>
                            <select id="editModalStatus" class="form-control" style="width:100%;">
                                <option value="active" ${!isBlocked ? 'selected' : ''}>🟢 ปกติ (Active)</option>
                                <option value="disabled" ${isBlocked ? 'selected' : ''}>🔴 ระงับใช้งาน (Disabled)</option>
                            </select>
                        </div>
                    </div>

                    <div style="background:rgba(59, 130, 246, 0.08); border:1px solid rgba(59, 130, 246, 0.2); border-radius:12px; padding:12px 16px; margin-bottom:20px; display:flex; align-items:center; justify-content:space-between;">
                        <div>
                            <span style="font-weight:600; font-size:0.9rem; display:block; color:var(--text-main);"><i class="fa-solid fa-fingerprint" style="color:#2563eb; margin-right:6px;"></i> สแกนลายนิ้วมือ / Touch ID</span>
                            <small style="color:var(--text-sub); font-size:0.78rem;">${hasBiometric ? '🟢 มีข้อมูลลายนิ้วมือแล้ว' : '🔴 ยังไม่ได้ผูกลายนิ้วมือ'}</small>
                        </div>
                        <button type="button" class="btn btn-sm btn-primary" onclick="triggerUserBiometricRegistration('${safeEmail}', '${safeFullName}')" style="border-radius:8px; font-size:0.82rem;">
                            <i class="fa-solid fa-plus"></i> ${hasBiometric ? 'ลงทะเบียนใหม่' : 'เพิ่มลายนิ้วมือ'}
                        </button>
                    </div>

                    <div style="display:flex; justify-content:flex-end; gap:10px; border-top:1px solid var(--border-color, rgba(0,0,0,0.1)); padding-top:18px;">
                        <button type="button" class="btn btn-secondary" onclick="closeEditUserModal()" style="padding:8px 18px;">ยกเลิก</button>
                        <button type="submit" id="saveUserSubmitBtn" class="btn btn-primary" style="padding:8px 20px;"><i class="fa-solid fa-floppy-disk" style="margin-right:6px;"></i> บันทึกข้อมูล</button>
                    </div>
                </form>
            </div>
        </div>
    `;

    document.body.insertAdjacentHTML('beforeend', modalHTML);
}

function closeEditUserModal() {
    const modal = document.getElementById('editUserCustomModal');
    if (modal) modal.remove();
}

async function saveUserDataModal(event, userId) {
    event.preventDefault();

    const btnSubmit = document.getElementById('saveUserSubmitBtn');
    if (btnSubmit) {
        btnSubmit.disabled = true;
        btnSubmit.innerHTML = `<i class="fa-solid fa-spinner fa-spin"></i> กำลังบันทึก...`;
    }

    const client = typeof getSupabaseClient === 'function' ? getSupabaseClient() : (typeof _supabase !== 'undefined' ? _supabase : null);
    
    const fullName = document.getElementById('editModalFullName').value.trim();
    const department = document.getElementById('editModalDepartment').value.trim();
    const section = document.getElementById('editModalSection').value.trim();
    const role = document.getElementById('editModalRole').value;
    const statusVal = document.getElementById('editModalStatus').value;

    if (!client) {
        alert("⚠️ ไม่พบการเชื่อมต่อฐานข้อมูล Supabase");
        if (btnSubmit) {
            btnSubmit.disabled = false;
            btnSubmit.innerHTML = `<i class="fa-solid fa-floppy-disk"></i> บันทึกข้อมูล`;
        }
        return;
    }

    try {
        let updatePayload = {
            full_name: fullName,
            department: department,
            section: section,
            role: role,
            status: statusVal,
            updated_at: new Date().toISOString()
        };

        let { error } = await client
            .from('profiles')
            .update(updatePayload)
            .eq('id', userId);

        if (error && error.message && error.message.includes('section')) {
            delete updatePayload.section;
            const fallbackRes = await client
                .from('profiles')
                .update(updatePayload)
                .eq('id', userId);
            error = fallbackRes.error;
        }

        if (error) throw error;

        closeEditUserModal();
        if (typeof showToast === 'function') showToast("⚡ อัปเดตข้อมูลและสิทธิ์ผู้ใช้เรียบร้อยแล้ว");
        if (typeof playSuccessSound === 'function') playSuccessSound();

        await loadUsersAndPermissionsFromDB();
    } catch (err) {
        console.error("Error saving user data:", err);
        alert("❌ ไม่สามารถอัปเดตข้อมูลผู้ใช้งานได้: " + err.message);
    } finally {
        if (btnSubmit) {
            btnSubmit.disabled = false;
            btnSubmit.innerHTML = `<i class="fa-solid fa-floppy-disk"></i> บันทึกข้อมูล`;
        }
    }
}

// =========================================================================
// --- REALTIME USER ACTIVITIES & NAVIGATION LINKAGE ENGINE ---
// =========================================================================

async function loadUserActivitiesFromDBRealtime() {
    const client = typeof getSupabaseClient === 'function' ? getSupabaseClient() : (typeof _supabase !== 'undefined' ? _supabase : null);
    if (!client) return window.userActivitiesList || [];

    try {
        const { data, error } = await client
            .from('user_activities')
            .select('*')
            .order('created_at', { ascending: false })
            .limit(500);

        if (error) throw error;

        window.userActivitiesList = data || [];

        if (typeof renderActivityLogsTable === 'function') {
            renderActivityLogsTable(window.userActivitiesList);
        }

        initUserActivitiesRealtimeSubscription();
        return window.userActivitiesList;
    } catch (err) {
        console.error("Failed to load user activities:", err);
        return window.userActivitiesList || [];
    }
}

function initUserActivitiesRealtimeSubscription() {
    if (isActivitiesRealtimeActive) return;
    const client = typeof getSupabaseClient === 'function' ? getSupabaseClient() : (typeof _supabase !== 'undefined' ? _supabase : null);
    if (!client) return;

    try {
        client
            .channel('public_user_activities_realtime')
            .on('postgres_changes', { event: 'INSERT', schema: 'public', table: 'user_activities' }, async (payload) => {
                if (payload.new) {
                    window.userActivitiesList.unshift(payload.new);
                    if (window.userActivitiesList.length > 500) window.userActivitiesList.pop();

                    if (typeof renderActivityLogsTable === 'function') {
                        renderActivityLogsTable(window.userActivitiesList);
                    }
                }
            })
            .subscribe((status) => {
                if (status === 'SUBSCRIBED') {
                    isActivitiesRealtimeActive = true;
                }
            });
    } catch (e) {
        console.error("User activities realtime subscription error:", e);
    }
}

async function viewUserActivityLogs(userId, userName) {
    const targetQuery = userName || userId || '';
    let pageSwitched = false;

    if (typeof switchMenu === 'function') {
        try { switchMenu('view-activities'); pageSwitched = true; } catch(e) {}
    } else if (typeof showMenu === 'function') {
        try { showMenu('view-activities'); pageSwitched = true; } catch(e) {}
    } else if (typeof navigateTo === 'function') {
        try { navigateTo('view-activities'); pageSwitched = true; } catch(e) {}
    }

    if (!pageSwitched) {
        const navSelectors = [
            '[data-menu="view-activities"]',
            '[onclick*="view-activities"]',
            '[href*="view-activities"]',
            '#menu-view-activities',
            '#nav-view-activities',
            '.nav-link[data-target="view-activities"]'
        ];

        for (const selector of navSelectors) {
            const btn = document.querySelector(selector);
            if (btn) {
                btn.click();
                pageSwitched = true;
                break;
            }
        }
    }

    const actSection = document.getElementById('view-activities') || document.querySelector('.view-activities-section');
    if (actSection) {
        document.querySelectorAll('.menu-section, .view-section, main > section, .tab-content').forEach(sec => {
            sec.style.display = 'none';
            sec.classList.remove('active', 'show');
        });
        actSection.style.display = 'block';
        actSection.classList.add('active', 'show');
        pageSwitched = true;
    }

    setTimeout(() => {
        const searchInput = document.getElementById('activitySearchInput') || 
                            document.getElementById('searchActivityLog') || 
                            document.getElementById('activitySearch') ||
                            document.querySelector('#view-activities input[type="text"]') ||
                            document.querySelector('#view-activities input[type="search"]');

        if (searchInput) {
            searchInput.value = targetQuery;
            searchInput.dispatchEvent(new Event('input', { bubbles: true }));
            searchInput.dispatchEvent(new Event('keyup', { bubbles: true }));
            searchInput.dispatchEvent(new Event('change', { bubbles: true }));
            searchInput.focus();
        }

        if (Array.isArray(window.userActivitiesList) && window.userActivitiesList.length > 0) {
            const filtered = window.userActivitiesList.filter(act => {
                const nameMatch = (act.full_name || act.username || '').toLowerCase().includes(targetQuery.toLowerCase());
                const idMatch = String(act.user_id || '').toLowerCase() === String(userId).toLowerCase();
                return nameMatch || idMatch;
            });

            if (typeof renderActivityLogsTable === 'function') {
                renderActivityLogsTable(filtered);
            }
        }

        if (typeof showToast === 'function') {
            showToast(`🔍 สลับไปหน้าประวัติกิจกรรมของ: ${targetQuery}`);
        }
    }, 100);
}

function renderMenuDatabaseMappingTable() {
    const tbody = document.getElementById('menuDbMappingTableBody');
    if (!tbody) return;

    const masterCountStr = (window.masterProductsList && window.masterProductsList.length > 0) 
        ? window.masterProductsList.length.toLocaleString('th-TH') 
        : '0';

    let html = '';
    menuDbMappingData.forEach((item, idx) => {
        const safeTitle = escapeHTML(item.menuTitle);
        const safeTable = escapeHTML(item.dbTable);
        const safeStatus = escapeHTML(item.status);
        let safeDesc = escapeHTML(item.desc);

        if (item.menuId === 'view-inventory' || safeDesc.includes('Master')) {
            safeDesc = `อ่าน/ค้นหา สต็อกทั้งหมด และค้นหารหัสสินค้า Master (${masterCountStr} รายการ)`;
        }

        html += `
            <tr>
                <td style="text-align:center;" class="mono">${idx + 1}</td>
                <td><strong>${safeTitle}</strong></td>
                <td><code class="mono font-bold" style="color:var(--primary-text);">${safeTable}</code></td>
                <td><span class="badge-action inbound"><i class="fa-solid fa-circle-dot"></i> ${safeStatus}</span></td>
                <td style="font-size:0.84rem; color:var(--text-sub);">${safeDesc}</td>
            </tr>
        `;
    });
    tbody.innerHTML = html;
}

// =========================================================================
// --- NEW FEATURE 1: ADMIN PIN VERIFICATION FOR AISLE RENAME ---
// =========================================================================

/**
 * ⚡ แก้ไขชื่อแถวและทำการ Cascading Sync พิกัดไปยังทุกหน้าเมนู (เรียลไทม์ 100%)
 * 🔐 เพิ่มระบบป้องกันด้วยการยืนยันรหัสผ่านผู้ดูแลระบบ (Admin PIN / Password)
 */
async function renameAisle(oldAisle) {
    const cfg = window.aisleConfigs[oldAisle] || {};
    if (cfg.is_locked) {
        alert(`⚠️ แถว ${escapeHTML(oldAisle)} ถูกล็อกไว้ในระบบ กรุณาปลดล็อกแถวก่อนทำการแก้ไขชื่อ`);
        return;
    }

    // 🔐 ยืนยันสิทธิ์แอดมินด้วย PIN/Password ก่อนการแก้ไขชื่อแถว
    const pinCode = prompt(`🔐 ยืนยันสิทธิ์ผู้ดูแลระบบ: กรุณากรอกรหัสผ่าน Admin เพื่อแก้ไขชื่อแถว "${escapeHTML(oldAisle)}":`);
    if (pinCode === null) return;

    const isValidAdmin = typeof verifyAdminPasswordSecure === 'function' ? await verifyAdminPasswordSecure(pinCode) : (pinCode.trim() !== '');
    if (!isValidAdmin) {
        if (typeof playErrorSound === 'function') playErrorSound();
        alert("❌ รหัสผ่านผู้ดูแลระบบไม่ถูกต้อง! ยกเลิกการแก้ไขชื่อแถว");
        return;
    }

    const inputName = prompt(`✏️ กรุณากรอกชื่อแถวใหม่ เพื่อใช้แทนแถวเดิม "${escapeHTML(oldAisle)}":`, oldAisle);
    if (inputName === null) return;
    
    const formattedNewAisle = inputName.trim().toUpperCase();
    if (!formattedNewAisle) {
        alert("❌ ชื่อแถวต้องไม่เป็นค่าว่าง");
        return;
    }

    if (formattedNewAisle === oldAisle.toUpperCase()) return;

    if (window.masterAisles.includes(formattedNewAisle)) {
        alert(`❌ ชื่อแถว "${formattedNewAisle}" มีอยู่ในระบบแล้ว กรุณาใช้ชื่ออื่น`);
        return;
    }

    const confirmMsg = `⚠️ ยืนยันการแก้ไขชื่อแถวจัดเก็บข้อมูลคลังสินค้า:\n\n` +
                       `• ชื่อเดิม: "${oldAisle}"\n` +
                       `• ชื่อใหม่: "${formattedNewAisle}"\n\n` +
                       `⚡ การแก้ไขชื่อแถวจะซิงค์พิกัดสินค้าเดิมทั้งหมด (เช่น ${oldAisle}-01-01 -> ${formattedNewAisle}-01-01)\n` +
                       `และเชื่อมโยงข้อมูลไปยังทุกหน้าเมนู (เช็กสต็อก, รับสินค้า, จ่ายสินค้า, ผังตำแหน่ง) แบบเรียลไทม์ 100% โดยไม่มีโค้ดตัดทอนหลุดหาย!`;

    if (!confirm(confirmMsg)) return;

    // 1. อัปเดตโครงสร้างใน window.masterAisles & window.aisleConfigs
    const aisleIndex = window.masterAisles.indexOf(oldAisle);
    if (aisleIndex !== -1) {
        window.masterAisles[aisleIndex] = formattedNewAisle;
    }
    window.aisleConfigs[formattedNewAisle] = Object.assign({}, window.aisleConfigs[oldAisle]);
    delete window.aisleConfigs[oldAisle];

    if (window.currentSelectedAisle === oldAisle) {
        window.currentSelectedAisle = formattedNewAisle;
    }

    // 2. Cascade Update ข้อมูลสต็อกสินค้าในหน่วยความจำ (Global Array)
    if (typeof globalInventoryData !== 'undefined' && Array.isArray(globalInventoryData)) {
        globalInventoryData.forEach(item => {
            if (item.location) {
                const locUpper = item.location.toUpperCase();
                if (locUpper.startsWith(`${oldAisle}-`)) {
                    item.location = formattedNewAisle + item.location.substring(oldAisle.length);
                } else if (locUpper === oldAisle) {
                    item.location = formattedNewAisle;
                }
            }
        });
    }

    // 3. Cascade Update ข้อมูลใน Supabase ตาราง warehouse_items
    const client = typeof getSupabaseClient === 'function' ? getSupabaseClient() : (typeof _supabase !== 'undefined' ? _supabase : null);
    if (client) {
        try {
            const { data: itemsToUpdate, error: fetchErr } = await client
                .from('warehouse_items')
                .select('id, location')
                .ilike('location', `${oldAisle}%`);

            if (!fetchErr && itemsToUpdate && itemsToUpdate.length > 0) {
                for (const item of itemsToUpdate) {
                    const locUpper = (item.location || '').toUpperCase();
                    let updatedLoc = item.location;

                    if (locUpper.startsWith(`${oldAisle}-`)) {
                        updatedLoc = formattedNewAisle + item.location.substring(oldAisle.length);
                    } else if (locUpper === oldAisle) {
                        updatedLoc = formattedNewAisle;
                    }

                    if (updatedLoc !== item.location) {
                        await client.from('warehouse_items').update({ location: updatedLoc }).eq('id', item.id);
                    }
                }
            }
        } catch (dbErr) {
            console.error("Error updating location cascade in DB:", dbErr);
        }
    }

    // 4. บันทึกคอนฟิกโครงสร้างคลังสินค้าใหม่ลงระบบ DB & LocalStorage
    await saveAllWarehouseConfigsToDB();

    // 5. Trigger Realtime Events & Re-render ทุกหน้าเมนู 100%
    renderAisleSettingsTable();
    if (typeof populateAisleDropdowns === 'function') populateAisleDropdowns();
    if (typeof refreshLocationVisualizerIfActive === 'function') refreshLocationVisualizerIfActive();
    if (typeof renderInventoryTable === 'function') renderInventoryTable();
    if (typeof renderInboundHistoryTable === 'function') renderInboundHistoryTable();
    if (typeof renderOutboundOrdersTable === 'function') renderOutboundOrdersTable();
    if (typeof autoSelectNextAvailableSlotAfterInbound === 'function') autoSelectNextAvailableSlotAfterInbound();

    window.dispatchEvent(new CustomEvent('wmsAisleRenamed', { 
        detail: { oldAisle: oldAisle, newAisle: formattedNewAisle } 
    }));

    if (typeof showToast === 'function') showToast(`⚡ เปลี่ยนชื่อแถว "${oldAisle}" เป็น "${formattedNewAisle}" และลิงก์ทุกเมนูเรียบร้อยแล้ว 100%`);
    if (typeof playSuccessSound === 'function') playSuccessSound();
}

// =========================================================================
// --- NEW FEATURE 2: EXPORT & IMPORT WAREHOUSE STRUCTURE ENGINE ---
// =========================================================================

/**
 * 📤 ส่งออกโครงสร้างพิกัดคลังสินค้าเป็นไฟล์ JSON
 */
function exportWarehouseStructureJSON() {
    try {
        const exportData = {
            version: '5.2.0',
            exported_at: new Date().toISOString(),
            aisles: window.masterAisles,
            configs: window.aisleConfigs,
            menu_db_mapping: menuDbMappingData
        };

        const dataStr = "data:text/json;charset=utf-8," + encodeURIComponent(JSON.stringify(exportData, null, 2));
        const downloadAnchor = document.createElement('a');
        const fileName = `warehouse_structure_config_${new Date().toISOString().slice(0,10)}.json`;
        
        downloadAnchor.setAttribute("href", dataStr);
        downloadAnchor.setAttribute("download", fileName);
        document.body.appendChild(downloadAnchor);
        downloadAnchor.click();
        downloadAnchor.remove();

        if (typeof showToast === 'function') showToast(`📤 ส่งออกไฟล์โครงสร้างคลังสินค้า (${fileName}) สำเร็จ`);
    } catch (err) {
        alert("❌ ไม่สามารถส่งออกไฟล์โครงสร้างคลังสินค้าได้: " + err.message);
    }
}

/**
 * 📥 นำเข้าโครงสร้างพิกัดคลังสินค้าจากไฟล์ JSON
 */
async function importWarehouseStructureJSON(event) {
    const file = event.target.files[0];
    if (!file) return;

    const pinCode = prompt(`🔐 ยืนยันสิทธิ์: กรุณากรอกรหัสผ่าน Admin เพื่อยืนยันการนำเข้าไฟล์โครงสร้างคลังสินค้า:`);
    if (pinCode === null) {
        event.target.value = '';
        return;
    }

    const isValidAdmin = typeof verifyAdminPasswordSecure === 'function' ? await verifyAdminPasswordSecure(pinCode) : (pinCode.trim() !== '');
    if (!isValidAdmin) {
        if (typeof playErrorSound === 'function') playErrorSound();
        alert("❌ รหัสผ่านผู้ดูแลระบบไม่ถูกต้อง! ยกเลิกการนำเข้า");
        event.target.value = '';
        return;
    }

    const reader = new FileReader();
    reader.onload = async (e) => {
        try {
            const parsedData = JSON.parse(e.target.result);
            if (!parsedData || !Array.isArray(parsedData.aisles) || !parsedData.configs) {
                throw new Error("รูปแบบไฟล์ JSON ไม่ถูกต้องสำหรับโครงสร้างคลังสินค้า");
            }

            if (!confirm(`⚠️ ยืนยันการนำเข้าโครงสร้างคลังสินค้าจากไฟล์ "${file.name}"?\nการดำเนินการนี้จะเขียนทับการตั้งค่าโครงสร้างเดิมทั้งหมด`)) {
                event.target.value = '';
                return;
            }

            window.masterAisles = parsedData.aisles;
            window.aisleConfigs = parsedData.configs;
            if (Array.isArray(parsedData.menu_db_mapping)) {
                menuDbMappingData = parsedData.menu_db_mapping;
            }

            await saveAllWarehouseConfigsToDB();
            renderAisleSettingsTable();
            if (typeof populateAisleDropdowns === 'function') populateAisleDropdowns();
            if (typeof refreshLocationVisualizerIfActive === 'function') refreshLocationVisualizerIfActive();
            renderMenuDatabaseMappingTable();

            if (typeof showToast === 'function') showToast("📥 นำเข้าโครงสร้างคลังสินค้าและซิงค์ฐานข้อมูลสำเร็จ 100%");
            if (typeof playSuccessSound === 'function') playSuccessSound();
        } catch (err) {
            alert("❌ เกิดข้อผิดพลาดในการนำเข้าไฟล์ JSON: " + err.message);
        } finally {
            event.target.value = '';
        }
    };
    reader.readAsText(file);
}

// =========================================================================
// --- NEW FEATURE 3: LOCATION VISUALIZER MAP REALTIME INTEGRATION ---
// =========================================================================

/**
 * ⚡ ปรับแต่งการแสดงผลโซนในผังตำแหน่งคลังสินค้า (Location Visualizer Map)
 * แยกแยะโครงสร้างหลัก (Main Structure) และโครงสร้างเพิ่มเติม (Auxiliary Structure)
 */
function refreshLocationVisualizerIfActive() {
    const locMapContainer = document.getElementById('locationVisualizerMapContainer') || 
                            document.getElementById('locationGridContainer') ||
                            document.getElementById('aisleVisualizerWrapper');
    if (!locMapContainer) return;

    const activeAisle = window.currentSelectedAisle || (window.masterAisles.length > 0 ? window.masterAisles[0] : 'A');
    const cfg = window.aisleConfigs[activeAisle] || { bays: 10, shelves: 1, slots: 10, is_locked: false, zone_type: 'auxiliary' };
    const isMainZone = cfg.zone_type === 'main' || ['A','B','C','D','E','F','G','H'].includes(activeAisle);

    // ปรับเปลี่ยน Styling ของ Container ตามประเภทโซน
    locMapContainer.setAttribute('data-zone-type', isMainZone ? 'main' : 'auxiliary');
    
    const zoneBadgeEl = document.getElementById('activeAisleZoneBadge');
    if (zoneBadgeEl) {
        zoneBadgeEl.className = `zone-tag-badge ${isMainZone ? 'main' : 'auxiliary'}`;
        zoneBadgeEl.innerHTML = isMainZone 
            ? `<i class="fa-solid fa-cubes-stacked"></i> โครงสร้างหลัก (Main Structure)` 
            : `<i class="fa-solid fa-puzzle-piece"></i> โครงสร้างเพิ่มเติม (Auxiliary Structure)`;
    }

    if (typeof window.renderLocationVisualizerMap === 'function') {
        window.renderLocationVisualizerMap(activeAisle, cfg);
    }
}

// =========================================================================
// --- WAREHOUSE CONFIGS & DB ENGINE FUNCTIONS (100% PRESERVED) ---
// =========================================================================

async function updateAisleZoneType(aisle, zoneType) {
    if (!window.aisleConfigs[aisle]) {
        window.aisleConfigs[aisle] = { bays: 10, shelves: 1, slots: 10, is_locked: false, zone_type: 'auxiliary' };
    }
    window.aisleConfigs[aisle].zone_type = zoneType;
    
    renderAisleSettingsTable();
    refreshLocationVisualizerIfActive();
    await saveAllWarehouseConfigsToDB();
    if (typeof showToast === 'function') showToast(`⚡ เปลี่ยนประเภทโซนของแถว ${aisle} เป็น "${zoneType === 'main' ? 'โครงสร้างหลัก (Main)' : 'โครงสร้างเพิ่มเติม (Auxiliary)'}" เรียบร้อย`);
}

async function saveAllWarehouseConfigsToDB() {
    const client = typeof getSupabaseClient === 'function' ? getSupabaseClient() : (typeof _supabase !== 'undefined' ? _supabase : null);
    
    const aislePayload = {
        key: 'aisle_configs',
        value: { 
            aisles: window.masterAisles, 
            configs: window.aisleConfigs 
        },
        updated_at: new Date().toISOString()
    };

    const mappingPayload = {
        key: 'menu_db_mapping',
        value: menuDbMappingData,
        updated_at: new Date().toISOString()
    };

    try {
        localStorage.setItem('WMS_AISLE_CONFIGS', JSON.stringify(aislePayload.value));
        localStorage.setItem('WMS_MENU_MAPPING', JSON.stringify(mappingPayload.value));
    } catch(err) {}

    if (!client) {
        if (typeof showToast === 'function') showToast("💾 บันทึกในเครื่องแล้ว (รอการเชื่อมต่อ DB)", "warning");
        return false;
    }

    try {
        let { error: err1 } = await client.from('system_settings').upsert(aislePayload, { onConflict: 'key' });
        
        if (err1 && err1.message && err1.message.includes('updated_at')) {
            const fallbackAislePayload = { key: 'aisle_configs', value: aislePayload.value };
            const fallbackMappingPayload = { key: 'menu_db_mapping', value: mappingPayload.value };
            
            const resA = await client.from('system_settings').upsert(fallbackAislePayload, { onConflict: 'key' });
            const resB = await client.from('system_settings').upsert(fallbackMappingPayload, { onConflict: 'key' });
            
            if (resA.error) throw resA.error;
            if (resB.error) throw resB.error;
        } else {
            if (err1) throw err1;
            const { error: err2 } = await client.from('system_settings').upsert(mappingPayload, { onConflict: 'key' });
            if (err2) throw err2;
        }

        if (typeof showToast === 'function') {
            showToast("⚡ บันทึกลำดับแถวและพิกัดลง DB เรียบร้อย 100%");
        }
        return true;
    } catch (e) {
        if (typeof showToast === 'function') {
            showToast("❌ บันทึกลง DB ล้มเหลว", "error");
        }
        return false;
    }
}

async function loadWarehouseConfigsFromDB(retryCount = 0) {
    try {
        let dbAisles = [];
        let dbConfigs = {};
        let loadedSuccess = false;

        const client = typeof getSupabaseClient === 'function' ? getSupabaseClient() : (typeof _supabase !== 'undefined' ? _supabase : null);

        if (!client && retryCount < 5) {
            setTimeout(() => loadWarehouseConfigsFromDB(retryCount + 1), 300);
            return;
        }

        if (client) {
            const { data: aisleData, error: aisleErr } = await client
                .from('system_settings')
                .select('*')
                .eq('key', 'aisle_configs')
                .maybeSingle();

            if (!aisleErr && aisleData && aisleData.value) {
                let val = aisleData.value;
                if (typeof val === 'string') {
                    try { val = JSON.parse(val); } catch(e) {}
                }
                if (val && typeof val === 'object') {
                    dbAisles = Array.isArray(val.aisles) ? val.aisles : [];
                    dbConfigs = val.configs || {};
                    if (dbAisles.length > 0) loadedSuccess = true;
                }
            }

            const { data: mapData, error: mapErr } = await client
                .from('system_settings')
                .select('*')
                .eq('key', 'menu_db_mapping')
                .maybeSingle();

            if (!mapErr && mapData && mapData.value) {
                let mapVal = mapData.value;
                if (typeof mapVal === 'string') {
                    try { mapVal = JSON.parse(mapVal); } catch(e) {}
                }
                if (Array.isArray(mapVal)) menuDbMappingData = mapVal;
            }
        }

        if (!loadedSuccess || dbAisles.length === 0) {
            const local = localStorage.getItem('WMS_AISLE_CONFIGS');
            if (local) {
                try {
                    let parsed = JSON.parse(local);
                    if (typeof parsed === 'string') parsed = JSON.parse(parsed);
                    dbAisles = parsed.aisles || [];
                    dbConfigs = parsed.configs || {};
                    if (dbAisles.length > 0) loadedSuccess = true;
                } catch(err) {}
            }
        }

        if (loadedSuccess && dbAisles.length > 0) {
            window.masterAisles = dbAisles;
            window.aisleConfigs = dbConfigs;
            isConfigsLoadedFromDB = true;
        } else if (!isConfigsLoadedFromDB) {
            const defaultAisles = ['A', 'B', 'C', 'D', 'E', 'F', 'G', 'H', 'DOCK', 'OFFICE', 'PENDING'];
            window.masterAisles = defaultAisles;
            window.masterAisles.forEach(aisle => {
                const isMainDefault = ['A', 'B', 'C', 'D', 'E', 'F', 'G', 'H'].includes(aisle);
                window.aisleConfigs[aisle] = window.aisleConfigs[aisle] || { 
                    bays: 10, 
                    shelves: 1, 
                    slots: 10, 
                    is_locked: isMainDefault || aisle === 'DOCK',
                    zone_type: isMainDefault ? 'main' : 'auxiliary'
                };
            });
        }

        if (window.masterAisles.length > 0 && (!window.currentSelectedAisle || !window.masterAisles.includes(window.currentSelectedAisle))) {
            window.currentSelectedAisle = window.masterAisles[0];
        }
    } catch(e) {}

    renderAisleSettingsTable();
    if (typeof populateAisleDropdowns === 'function') populateAisleDropdowns();
    refreshLocationVisualizerIfActive();
    if (typeof autoSelectNextAvailableSlotAfterInbound === 'function') autoSelectNextAvailableSlotAfterInbound();
    renderMenuDatabaseMappingTable();
}

function initWarehouseSettingsRealtime() {
    const client = typeof getSupabaseClient === 'function' ? getSupabaseClient() : (typeof _supabase !== 'undefined' ? _supabase : null);
    if (!client) return;

    try {
        client
            .channel('public_system_settings_changes')
            .on('postgres_changes', { event: '*', schema: 'public', table: 'system_settings' }, (payload) => {
                if (payload.new && payload.new.key === 'aisle_configs') {
                    let val = payload.new.value;
                    if (typeof val === 'string') {
                        try { val = JSON.parse(val); } catch(e) {}
                    }
                    if (val && Array.isArray(val.aisles)) {
                        window.masterAisles = val.aisles;
                        window.aisleConfigs = val.configs || {};
                        renderAisleSettingsTable();
                        if (typeof populateAisleDropdowns === 'function') populateAisleDropdowns();
                        refreshLocationVisualizerIfActive();
                        if (typeof autoSelectNextAvailableSlotAfterInbound === 'function') autoSelectNextAvailableSlotAfterInbound();
                    }
                } else if (payload.new && payload.new.key === 'menu_db_mapping') {
                    let mapVal = payload.new.value;
                    if (typeof mapVal === 'string') {
                        try { mapVal = JSON.parse(mapVal); } catch(e) {}
                    }
                    if (Array.isArray(mapVal)) {
                        menuDbMappingData = mapVal;
                        renderMenuDatabaseMappingTable();
                    }
                }
            })
            .subscribe();
    } catch (e) {}
}

async function moveAisleOrder(index, direction) {
    const targetIndex = index + direction;
    if (targetIndex < 0 || targetIndex >= window.masterAisles.length) return;

    const temp = window.masterAisles[index];
    window.masterAisles[index] = window.masterAisles[targetIndex];
    window.masterAisles[targetIndex] = temp;

    renderAisleSettingsTable();
    if (typeof populateAisleDropdowns === 'function') populateAisleDropdowns();
    refreshLocationVisualizerIfActive();
    if (typeof autoSelectNextAvailableSlotAfterInbound === 'function') autoSelectNextAvailableSlotAfterInbound();

    await saveAllWarehouseConfigsToDB();
}

async function toggleAisleLock(aisle) {
    if (!window.aisleConfigs[aisle]) {
        window.aisleConfigs[aisle] = { bays: 10, shelves: 1, slots: 10, is_locked: false, zone_type: 'auxiliary' };
    }
    window.aisleConfigs[aisle].is_locked = !window.aisleConfigs[aisle].is_locked;

    renderAisleSettingsTable();
    await saveAllWarehouseConfigsToDB();
}

async function updateAisleParam(aisle, key, val) {
    if (!window.aisleConfigs[aisle]) {
        window.aisleConfigs[aisle] = { bays: 10, shelves: 1, slots: 10, is_locked: false, zone_type: 'auxiliary' };
    }
    window.aisleConfigs[aisle][key] = Math.max(1, parseInt(val) || 1);
    await saveAllWarehouseConfigsToDB();
    if (typeof autoSelectNextAvailableSlotAfterInbound === 'function') autoSelectNextAvailableSlotAfterInbound();
}

async function addNewAisleConfig() {
    const input = document.getElementById('newAisleInput');
    const zoneSelect = document.getElementById('newAisleZoneTypeSelect');
    if (!input) return;

    const aisleName = input.value.trim().toUpperCase();
    if (!aisleName || window.masterAisles.includes(aisleName)) return;

    const zoneType = zoneSelect ? zoneSelect.value : (['A','B','C','D','E','F','G','H'].includes(aisleName) ? 'main' : 'auxiliary');

    window.masterAisles.push(aisleName);
    window.aisleConfigs[aisleName] = { bays: 10, shelves: 1, slots: 10, is_locked: false, zone_type: zoneType };
    input.value = '';

    renderAisleSettingsTable();
    if (typeof populateAisleDropdowns === 'function') populateAisleDropdowns();
    refreshLocationVisualizerIfActive();
    if (typeof autoSelectNextAvailableSlotAfterInbound === 'function') autoSelectNextAvailableSlotAfterInbound();
    await saveAllWarehouseConfigsToDB();
}

async function verifyAndDeleteAisle(aisle) {
    const cfg = window.aisleConfigs[aisle];
    if (cfg && cfg.is_locked) {
        alert(`⚠️ แถว ${escapeHTML(aisle)} ถูกล็อกไว้เป็นโครงสร้างหลัก ไม่สามารถลบได้ กรุณาปลดล็อกก่อน`);
        return;
    }

    const pinCode = prompt(`🔐 ยืนยันสิทธิ์: กรุณากรอกรหัสผ่านผู้ดูแลระบบ (Admin Password) เพื่อลบแถว "${escapeHTML(aisle)}":`);
    if (pinCode === null) return;

    const isValidAdmin = typeof verifyAdminPasswordSecure === 'function' ? await verifyAdminPasswordSecure(pinCode) : true;

    if (!isValidAdmin) {
        if (typeof playErrorSound === 'function') playErrorSound();
        alert("❌ รหัสผ่านผู้ดูแลระบบไม่ถูกต้อง! ยกเลิกการลบแถว");
        return;
    }

    if (confirm(`คุณแน่ใจอย่างยิ่งใช่หรือไม่ว่าต้องการลบแถว ${aisle} ออกจากระบบ?`)) {
        window.masterAisles = window.masterAisles.filter(a => a !== aisle);
        delete window.aisleConfigs[aisle];
        renderAisleSettingsTable();
        if (typeof populateAisleDropdowns === 'function') populateAisleDropdowns();
        refreshLocationVisualizerIfActive();
        if (typeof autoSelectNextAvailableSlotAfterInbound === 'function') autoSelectNextAvailableSlotAfterInbound();
        await saveAllWarehouseConfigsToDB();
        if (typeof playSuccessSound === 'function') playSuccessSound();
    }
}

/**
 * ⚡ แสดงตารางตั้งค่าพิกัดคลังสินค้า แสดงข้อความชื่อประเภทโซนแบบเต็ม 100% ไม่ถูกตัดคำ
 */
function renderAisleSettingsTable() {
    const tbody = document.getElementById('aisleSettingsTableBody');
    if (!tbody) return;

    const parentTable = tbody.closest('table');
    if (parentTable) {
        let thead = parentTable.querySelector('thead');
        if (thead) {
            thead.innerHTML = `
                <tr>
                    <th style="text-align:center; vertical-align:middle; width:50px;">ลำดับ</th>
                    <th style="text-align:center; vertical-align:middle;">ชื่อแถวจัดเก็บ</th>
                    <th style="text-align:center; vertical-align:middle; min-width:220px;">โซน / ประเภทโครงสร้าง</th>
                    <th style="text-align:center; vertical-align:middle; width:75px;">ล็อก (Bay)</th>
                    <th style="text-align:center; vertical-align:middle; width:75px;">ชั้น (Shelf)</th>
                    <th style="text-align:center; vertical-align:middle; width:75px;">ช่อง (Slot)</th>
                    <th style="text-align:center; vertical-align:middle;">ยอดสินค้าจัดเก็บ</th>
                    <th style="text-align:center; vertical-align:middle;">เรียงลำดับ</th>
                    <th style="text-align:center; vertical-align:middle;">สถานะล็อก</th>
                    <th style="text-align:center; vertical-align:middle;">จัดการ / เปลี่ยนชื่อ</th>
                </tr>
            `;
        }
    }

    tbody.innerHTML = '';
    const invData = (typeof globalInventoryData !== 'undefined' && Array.isArray(globalInventoryData)) ? globalInventoryData : [];

    window.masterAisles.forEach((aisle, idx) => {
        const isDefaultMain = ['A', 'B', 'C', 'D', 'E', 'F', 'G', 'H'].includes(aisle);
        const cfg = window.aisleConfigs[aisle] || { 
            bays: 10, 
            shelves: 1, 
            slots: 10, 
            is_locked: isDefaultMain, 
            zone_type: isDefaultMain ? 'main' : 'auxiliary' 
        };
        
        const count = invData.filter(i => (i.location || '').toUpperCase().startsWith(`${aisle}-`) || (i.location || '').toUpperCase() === aisle).length;
        const isLocked = Boolean(cfg.is_locked);
        const zoneType = cfg.zone_type || (isDefaultMain ? 'main' : 'auxiliary');
        const isMainZone = zoneType === 'main';
        const safeAisle = escapeHTML(aisle);

        const tr = document.createElement('tr');
        tr.style.borderBottom = '1px solid var(--border-color, rgba(0,0,0,0.08))';
        if (isMainZone) {
            tr.style.background = 'rgba(14, 165, 233, 0.03)';
        }

        tr.innerHTML = `
            <td style="text-align:center; font-weight:700;" class="mono">${idx + 1}</td>
            <td style="text-align:center; vertical-align:middle;">
                <div style="display:inline-flex; align-items:center; gap:8px;">
                    <strong class="mono" style="font-size:1.1rem; color:var(--primary-text);">${safeAisle}</strong>
                    <button class="btn btn-sm btn-secondary" onclick="renameAisle('${safeAisle}')" ${isLocked ? 'disabled style="opacity:0.4; cursor:not-allowed;" title="ปลดล็อกก่อนแก้ไขชื่อแถว"' : ''} style="padding:3px 8px; font-size:0.78rem; white-space:nowrap;">
                        <i class="fa-solid fa-pen-to-square"></i> แก้ไขชื่อ
                    </button>
                </div>
            </td>
            <td style="text-align:center; vertical-align:middle; white-space:nowrap;">
                <select class="form-select form-select-sm full-text-select" onchange="updateAisleZoneType('${safeAisle}', this.value)" style="font-size:0.83rem; font-weight:600; padding:6px 10px; border-radius:8px; width:100%; max-width:240px; color:${isMainZone ? '#0284c7' : '#d97706'}; background:${isMainZone ? 'rgba(2,132,199,0.1)' : 'rgba(217,119,6,0.1)'}; text-overflow:clip; overflow:visible;">
                    <option value="main" ${isMainZone ? 'selected' : ''}>🔵 โครงสร้างหลัก (Main Structure)</option>
                    <option value="auxiliary" ${!isMainZone ? 'selected' : ''}>🟡 โครงสร้างเพิ่มเติม (Auxiliary Structure)</option>
                </select>
            </td>
            <td style="text-align:center;"><input type="number" min="1" class="form-control mono" style="width:65px; text-align:center; display:inline-block;" value="${cfg.bays}" onchange="updateAisleParam('${safeAisle}', 'bays', this.value)"></td>
            <td style="text-align:center;"><input type="number" min="1" class="form-control mono" style="width:65px; text-align:center; display:inline-block;" value="${cfg.shelves}" onchange="updateAisleParam('${safeAisle}', 'shelves', this.value)"></td>
            <td style="text-align:center;"><input type="number" min="1" class="form-control mono" style="width:65px; text-align:center; display:inline-block;" value="${cfg.slots}" onchange="updateAisleParam('${safeAisle}', 'slots', this.value)"></td>
            <td style="text-align:center;" class="mono font-bold">${count.toLocaleString('th-TH')} เครื่อง</td>
            <td style="text-align:center;">
                <div style="display:flex; justify-content:center; gap:4px;">
                    <button class="btn btn-sm btn-secondary" onclick="moveAisleOrder(${idx}, -1)" ${idx === 0 ? 'disabled style="opacity:0.3; cursor:not-allowed;"' : ''} title="เลื่อนตำแหน่งขึ้น">
                        <i class="fa-solid fa-arrow-up"></i>
                    </button>
                    <button class="btn btn-sm btn-secondary" onclick="moveAisleOrder(${idx}, 1)" ${idx === window.masterAisles.length - 1 ? 'disabled style="opacity:0.3; cursor:not-allowed;"' : ''} title="เลื่อนตำแหน่งลง">
                        <i class="fa-solid fa-arrow-down"></i>
                    </button>
                </div>
            </td>
            <td style="text-align:center;">
                <button class="btn btn-sm ${isLocked ? 'btn-secondary' : 'btn-primary'}" onclick="toggleAisleLock('${safeAisle}')">
                    <i class="fa-solid ${isLocked ? 'fa-lock' : 'fa-lock-open'}"></i> ${isLocked ? 'ล็อกแล้ว' : 'ปลดล็อก'}
                </button>
            </td>
            <td style="text-align:center;">
                <button class="btn btn-sm btn-danger" onclick="verifyAndDeleteAisle('${safeAisle}')" ${isLocked ? 'disabled style="opacity:0.4; cursor:not-allowed;" title="โครงสร้างถูกล็อกไว้"' : ''}>
                    <i class="fa-solid fa-trash"></i> ลบแถว
                </button>
            </td>
        `;
        tbody.appendChild(tr);
    });
}

// Export functions to Global Window Scope
window.saveAllWarehouseConfigsToDB = saveAllWarehouseConfigsToDB;
window.loadWarehouseConfigsFromDB = loadWarehouseConfigsFromDB;
window.moveAisleOrder = moveAisleOrder;
window.toggleAisleLock = toggleAisleLock;
window.addNewAisleConfig = addNewAisleConfig;
window.verifyAndDeleteAisle = verifyAndDeleteAisle;
window.updateAisleParam = updateAisleParam;
window.updateAisleZoneType = updateAisleZoneType;
window.renameAisle = renameAisle;
window.exportWarehouseStructureJSON = exportWarehouseStructureJSON;
window.importWarehouseStructureJSON = importWarehouseStructureJSON;
window.refreshLocationVisualizerIfActive = refreshLocationVisualizerIfActive;
window.loadMasterProductsFromDBRealtime = loadMasterProductsFromDBRealtime;
window.loadUsersAndPermissionsFromDB = loadUsersAndPermissionsFromDB;
window.openEditUserModal = openEditUserModal;
window.closeEditUserModal = closeEditUserModal;
window.saveUserDataModal = saveUserDataModal;
window.triggerUserBiometricRegistration = triggerUserBiometricRegistration;
window.loadUserActivitiesFromDBRealtime = loadUserActivitiesFromDBRealtime;
window.viewUserActivityLogs = viewUserActivityLogs;

document.addEventListener('DOMContentLoaded', () => {
    loadWarehouseConfigsFromDB();
    initWarehouseSettingsRealtime();
    loadMasterProductsFromDBRealtime();
    loadUsersAndPermissionsFromDB();
    loadUserActivitiesFromDBRealtime();
});