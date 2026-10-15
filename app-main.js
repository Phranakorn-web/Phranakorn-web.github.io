// =========================================================================
// --- MODULE 10: MAIN UI ROUTING & EVENT LISTENERS ---
// =========================================================================

let pendingDeleteMode = null;
let pendingDeleteSn = null;
let pendingDeleteId = null;

function renderSidebarMenu() {
    let menuConfig = [
        { id: 'view-inventory', label: 'เช็คสต็อกสินค้า', icon: 'fa-list-check' },
        { id: 'view-inbound', label: 'รับสินค้าเข้าคลัง (Fast)', icon: 'fa-arrow-right-to-bracket' },
        { id: 'view-outbound', label: 'จ่ายสินค้าออกจากคลัง', icon: 'fa-truck-arrow-right' },
        { id: 'view-locations', label: 'ผังตำแหน่งคลังสินค้า (Drill-Down)', icon: 'fa-map-location-dot' }
    ];

    if (currentUser && currentUser.role === 'admin') {
        menuConfig.push({ id: 'view-approvals', label: 'ศูนย์อนุมัติคำขอ (Approvals)', icon: 'fa-clipboard-check' });
        menuConfig.push({ id: 'view-activities', label: 'ดูประวัติการใช้งาน (User Logs)', icon: 'fa-clock-rotate-left' });
        menuConfig.push({ id: 'view-settings', label: 'ตั้งค่าพิกัดคลังสินค้า', icon: 'fa-gears' });
    }

    const list = document.getElementById('sidebarMenuList');
    list.innerHTML = '';
    
    menuConfig.forEach((item, idx) => {
        const li = document.createElement('li');
        li.className = 'menu-item';
        li.innerHTML = `
            <button class="${idx === 0 ? 'active' : ''}" onclick="switchView('${item.id}')">
                <i class="fa-solid ${item.icon}"></i> ${item.label}
            </button>
        `;
        list.appendChild(li);
    });
}

const audioCtx = new (window.AudioContext || window.webkitAudioContext)();

function playSuccessSound() {
    try {
        if (audioCtx.state === 'suspended') audioCtx.resume();
        const now = audioCtx.currentTime;
        const osc1 = audioCtx.createOscillator();
        const gain1 = audioCtx.createGain();
        osc1.type = 'sine';
        osc1.frequency.setValueAtTime(1760, now);
        gain1.gain.setValueAtTime(0.3, now);
        gain1.gain.exponentialRampToValueAtTime(0.01, now + 0.1);
        osc1.connect(gain1);
        gain1.connect(audioCtx.destination);
        osc1.start(now);
        osc1.stop(now + 0.1);
    } catch (e) {}
}

function playErrorSound() {
    try {
        if (audioCtx.state === 'suspended') audioCtx.resume();
        const now = audioCtx.currentTime;
        const osc = audioCtx.createOscillator();
        const gain = audioCtx.createGain();
        osc.type = 'sawtooth';
        osc.frequency.setValueAtTime(220, now);
        gain.gain.setValueAtTime(0.4, now);
        gain.gain.exponentialRampToValueAtTime(0.01, now + 0.3);
        osc.connect(gain);
        gain.connect(audioCtx.destination);
        osc.start(now);
        osc.stop(now + 0.3);
    } catch (e) {}
}

let isVoiceAlertEnabled = true;
let voiceSettings = { inboundVoice: false, deleteVoice: false };

function toggleVoiceAudioAlert() {
    isVoiceAlertEnabled = !isVoiceAlertEnabled;
    const btn = document.getElementById('voiceToggleBtn');
    if (isVoiceAlertEnabled) {
        btn.innerHTML = `<i class="fa-solid fa-volume-high" style="color:var(--success);"></i> AI Voice On`;
        speakThaiText("เปิดระบบเสียงอ่านตอบรับเรียบร้อยค่ะ");
    } else {
        btn.innerHTML = `<i class="fa-solid fa-volume-xmark" style="color:var(--danger);"></i> AI Voice Off`;
    }
}

function speakThaiText(text) {
    if (!isVoiceAlertEnabled || !('speechSynthesis' in window)) return;
    try {
        window.speechSynthesis.cancel();
        const utterance = new SpeechSynthesisUtterance(text);
        utterance.lang = 'th-TH';
        utterance.rate = 1.05;
        utterance.pitch = 1.0;
        window.speechSynthesis.speak(utterance);
    } catch(e) {}
}

function escapeHTML(str) {
    if (typeof str !== 'string') return str;
    return str
        .replace(/&/g, "&amp;")
        .replace(/</g, "&lt;")
        .replace(/>/g, "&gt;")
        .replace(/"/g, "&quot;")
        .replace(/'/g, "&#039;");
}

document.addEventListener('DOMContentLoaded', async () => {
    initThemeSystem();
    initOfflineSyncEngine();
    await initAuthSystem();
    await loadDataFromDatabase();
    await loadWarehouseConfigsFromDB();
    await loadOutboundHistoryFromDB();
    if (currentUser && currentUser.role === 'admin') {
        await loadPendingApprovalsFromDB();
    }
    populateAisleDropdowns();
    onInboundAisleOrBayChange();
});

function switchView(viewId) {
    executeSwitchView(viewId);
}

async function executeSwitchView(viewId) {
    document.querySelectorAll('.menu-item button').forEach(btn => btn.classList.remove('active'));
    document.querySelectorAll('.view-section').forEach(sec => sec.classList.remove('active'));

    const activeBtn = Array.from(document.querySelectorAll('.menu-item button')).find(b => b.getAttribute('onclick').includes(viewId));
    if(activeBtn) activeBtn.classList.add('active');

    const targetSec = document.getElementById(viewId);
    if(targetSec) targetSec.classList.add('active');

    if(viewId === 'view-locations') {
        renderDrillDownAisleBar();
        renderDrillDownBaysGrid();
        renderDrillDownSlotsGrid();
    } else if(viewId === 'view-approvals') {
        loadPendingApprovalsFromDB();
    } else if(viewId === 'view-activities') {
        loadUserActivityLogsFromDB();
    } else if(viewId === 'view-settings') {
        renderAisleSettingsTable();
        renderUserManagementTable();
        renderMenuDatabaseMappingTable();
    }
}

function showToast(msg, isError = false) {
    const toast = document.getElementById('toastAlert');
    document.getElementById('toastMessage').textContent = msg;
    if(isError) toast.classList.add('error');
    else toast.classList.remove('error');
    
    toast.classList.add('show');
    setTimeout(() => toast.classList.remove('show'), 3500);
}

function initThemeSystem() {
    const savedTheme = localStorage.getItem('WMS_THEME_MODE') || 'light';
    document.documentElement.setAttribute('data-theme', savedTheme);
    updateThemeToggleUI(savedTheme);
}

function toggleAppTheme() {
    const currentTheme = document.documentElement.getAttribute('data-theme') || 'light';
    const nextTheme = (currentTheme === 'light') ? 'dark' : 'light';
    document.documentElement.setAttribute('data-theme', nextTheme);
    localStorage.setItem('WMS_THEME_MODE', nextTheme);
    updateThemeToggleUI(nextTheme);
    showToast(`🎨 เปลี่ยนธีมเป็น: ${nextTheme === 'light' ? 'โหมดสว่าง' : 'โหมดมืด'}`);
}

function updateThemeToggleUI(theme) {
    const textElem = document.getElementById('themeToggleText');
    const sunIcon = document.getElementById('themeIconSun');
    const moonIcon = document.getElementById('themeIconMoon');

    if (theme === 'light') {
        if (textElem) textElem.textContent = 'โหมดสว่าง';
        if (sunIcon) sunIcon.style.display = 'inline-block';
        if (moonIcon) moonIcon.style.display = 'none';
    } else {
        if (textElem) textElem.textContent = 'โหมดมืด';
        if (sunIcon) sunIcon.style.display = 'none';
        if (moonIcon) moonIcon.style.display = 'inline-block';
    }
}

function populateAisleDropdowns() {
    const filterSelect = document.getElementById('filterAisleSelect');
    const inboundSelect = document.getElementById('inboundAisleSelect');
    const relocateSelect = document.getElementById('relocateAisleSelect');

    const optionsHtml = masterAisles.map(a => {
        let label = `แถว ${a}`;
        if (a === 'DOCK') label = '🚚 ลาน DOCK';
        else if (a === 'OFFICE') label = '🏢 ฝากเก็บในออฟฟิศ';
        else if (a === 'PENDING') label = '⏳ รอรับเข้าจริง';
        return `<option value="${escapeHTML(a)}">${label}</option>`;
    }).join('');

    if (filterSelect) filterSelect.innerHTML = `<option value="ALL">📍 แสดงทุกแถว (All)</option>` + optionsHtml;
    if (inboundSelect) inboundSelect.innerHTML = optionsHtml;
    if (relocateSelect) relocateSelect.innerHTML = optionsHtml;
}

function onInboundAisleOrBayChange() {
    const inboundAisleElem = document.getElementById('inboundAisleSelect');
    if (!inboundAisleElem) return;

    const aisle = inboundAisleElem.value;
    const baySelect = document.getElementById('inboundBaySelect');
    
    if (aisle === 'DOCK' || aisle === 'OFFICE' || aisle === 'PENDING') {
        if (baySelect) baySelect.innerHTML = `<option value="01">${aisle} Area</option>`;
        document.getElementById('inboundShelfSelect').innerHTML = `<option value="1">1</option>`;
        document.getElementById('inboundSlotSelect').innerHTML = `<option value="1">1</option>`;
        updateInboundLocationPreview();
        return;
    }

    const cfg = aisleConfigs[aisle] || { bays: 10, shelves: 1, slots: 10 };
    let bayOptions = '';
    for (let b = 1; b <= cfg.bays; b++) {
        const bStr = String(b).padStart(2, '0');
        bayOptions += `<option value="${bStr}">ล็อก ${bStr}</option>`;
    }
    if (baySelect) baySelect.innerHTML = bayOptions;

    let shelfOptions = '';
    for (let s = 1; s <= cfg.shelves; s++) shelfOptions += `<option value="${s}">ชั้น ${s}</option>`;
    document.getElementById('inboundShelfSelect').innerHTML = shelfOptions;

    let slotOptions = '';
    for (let sl = 1; sl <= cfg.slots; sl++) {
        const slStr = String(sl).padStart(2, '0');
        slotOptions += `<option value="${slStr}">ช่อง ${slStr}</option>`;
    }
    document.getElementById('inboundSlotSelect').innerHTML = slotOptions;

    autoSelectAvailableSlot();
}

function autoSelectAvailableSlot() {
    const inboundAisleElem = document.getElementById('inboundAisleSelect');
    if (!inboundAisleElem) return;

    const aisle = inboundAisleElem.value;
    if (aisle === 'DOCK' || aisle === 'OFFICE' || aisle === 'PENDING') {
        updateInboundLocationPreview();
        return;
    }

    const bay = document.getElementById('inboundBaySelect').value;
    const cfg = aisleConfigs[aisle] || { bays: 10, shelves: 1, slots: 10 };

    for (let s = 1; s <= cfg.shelves; s++) {
        for (let sl = 1; sl <= cfg.slots; sl++) {
            const locCode = `${aisle}-${bay}-${s}-${String(sl).padStart(2, '0')}`;
            if (!occupiedLocationsSet.has(locCode)) {
                document.getElementById('inboundShelfSelect').value = s;
                document.getElementById('inboundSlotSelect').value = String(sl).padStart(2, '0');
                updateInboundLocationPreview();
                return;
            }
        }
    }
    updateInboundLocationPreview();
}

function autoSelectNextAvailableSlotAfterInbound() {
    rebuildOccupiedSet();
    const inboundAisleElem = document.getElementById('inboundAisleSelect');
    if (!inboundAisleElem) return;

    const aisle = inboundAisleElem.value;
    if (aisle === 'DOCK' || aisle === 'OFFICE' || aisle === 'PENDING') {
        updateInboundLocationPreview();
        return;
    }

    const currentBay = document.getElementById('inboundBaySelect').value;
    const currentShelf = parseInt(document.getElementById('inboundShelfSelect').value) || 1;
    const currentSlot = parseInt(document.getElementById('inboundSlotSelect').value) || 1;

    const cfg = aisleConfigs[aisle] || { bays: 10, shelves: 1, slots: 10 };

    let foundNext = false;
    let startSlot = currentSlot + 1;

    for (let s = currentShelf; s <= cfg.shelves; s++) {
        for (let sl = startSlot; sl <= cfg.slots; sl++) {
            const slStr = String(sl).padStart(2, '0');
            const testLoc = `${aisle}-${currentBay}-${s}-${slStr}`;
            if (!occupiedLocationsSet.has(testLoc)) {
                document.getElementById('inboundShelfSelect').value = s;
                document.getElementById('inboundSlotSelect').value = slStr;
                foundNext = true;
                break;
            }
        }
        if (foundNext) break;
        startSlot = 1; 
    }

    if (!foundNext) autoSelectAvailableSlot();
    else updateInboundLocationPreview();
}

function updateInboundLocationPreview() {
    const inboundAisleElem = document.getElementById('inboundAisleSelect');
    if (!inboundAisleElem) return;

    const aisle = inboundAisleElem.value;
    if (aisle === 'DOCK' || aisle === 'OFFICE' || aisle === 'PENDING') {
        document.getElementById('inboundLocationPreview').textContent = aisle;
        return;
    }
    const bay = document.getElementById('inboundBaySelect').value;
    const shelf = document.getElementById('inboundShelfSelect').value;
    const slot = document.getElementById('inboundSlotSelect').value;

    const locCode = `${aisle}-${bay}-${shelf}-${slot}`;
    document.getElementById('inboundLocationPreview').textContent = locCode;

    const bayCount = globalInventoryData.filter(i => (i.location || '').toUpperCase().startsWith(`${aisle}-${bay}-`)).length;
    const badge = document.getElementById('bayInboundCountBadge');
    if (badge) badge.textContent = `รับแล้วในล็อกนี้: ${bayCount} เครื่อง`;
}

function formatLocationCode(loc) {
    if (!loc) return 'DOCK';
    return loc.toUpperCase();
}

function generateAutoSN() {
    const rand = Math.floor(100000 + Math.random() * 900000);
    const sn = `SN-${rand}`;
    document.getElementById('inboundSn').value = sn;
    showToast(`🪄 สุ่ม S/N: ${sn}`);
}

function onFilterAisleChange() {
    const aisleFilter = document.getElementById('filterAisleSelect').value;
    const baySelect = document.getElementById('filterBaySelect');
    
    if (aisleFilter === 'ALL' || aisleFilter === 'DOCK' || aisleFilter === 'OFFICE' || aisleFilter === 'PENDING') {
        baySelect.innerHTML = `<option value="ALL">📦 ทุกล็อกในแถว</option>`;
    } else {
        const cfg = aisleConfigs[aisleFilter] || { bays: 10 };
        let opts = `<option value="ALL">📦 ทุกล็อกในแถว (${aisleFilter})</option>`;
        for (let b = 1; b <= cfg.bays; b++) {
            const bStr = String(b).padStart(2, '0');
            opts += `<option value="${bStr}">ล็อก ${bStr}</option>`;
        }
        baySelect.innerHTML = opts;
    }
    filterInventoryData();
}

// --- MODALS ENGINE & EVENT HANDLERS ---
function openChangePasswordModal() {
    document.getElementById('oldPasswordInput').value = '';
    document.getElementById('newPasswordInput').value = '';
    document.getElementById('confirmNewPasswordInput').value = '';
    document.getElementById('changePasswordModal').style.display = 'flex';
}
function closeChangePasswordModal() {
    document.getElementById('changePasswordModal').style.display = 'none';
}
async function submitChangePassword(e) {
    e.preventDefault();
    const oldP = document.getElementById('oldPasswordInput').value.trim();
    const newP = document.getElementById('newPasswordInput').value.trim();
    const confP = document.getElementById('confirmNewPasswordInput').value.trim();

    if (currentUser.password && oldP !== currentUser.password) {
        alert("⚠️ รหัสผ่านเดิมไม่ถูกต้อง");
        return;
    }
    if (newP !== confP) {
        alert("⚠️ รหัสผ่านใหม่และยืนยันรหัสผ่านไม่ตรงกัน");
        return;
    }

    currentUser.password = newP;
    const targetInUsers = systemUsers.find(u => u.username === currentUser.username);
    if (targetInUsers) targetInUsers.password = newP;

    localStorage.setItem('WMS_ACTIVE_USER', JSON.stringify(currentUser));
    localStorage.setItem('WMS_USERS', JSON.stringify(systemUsers));

    if (navigator.onLine) {
        try {
            await _supabase.from('profiles').update({ password: newP }).eq('username', currentUser.username);
        } catch (err) {}
    }

    closeChangePasswordModal();
    playSuccessSound();
    showToast("🔑 เปลี่ยนรหัสผ่านเรียบร้อยแล้ว");
    await logUserActivity('AUTH', `เปลี่ยนรหัสผ่านส่วนตัวสำเร็จ`);
}

function openCreateUserModal() {
    document.getElementById('userFormId').value = '';
    document.getElementById('userFormUsername').value = '';
    document.getElementById('userFormFullName').value = '';
    document.getElementById('userFormDepartment').value = '';
    document.getElementById('userFormPassword').value = '';
    document.getElementById('userFormRole').value = 'user';
    document.getElementById('userModalTitle').textContent = 'เพิ่มผู้ใช้งานใหม่';
    document.getElementById('createUserModal').style.display = 'flex';
}

function openEditUserModal(id) {
    const target = systemUsers.find(u => u.id === id);
    if (!target) return;

    document.getElementById('userFormId').value = target.id;
    document.getElementById('userFormUsername').value = target.username;
    document.getElementById('userFormFullName').value = target.name;
    document.getElementById('userFormDepartment').value = target.department || '';
    document.getElementById('userFormPassword').value = target.password || '';
    document.getElementById('userFormRole').value = target.role || 'user';
    document.getElementById('userModalTitle').textContent = 'แก้ไขข้อมูลผู้ใช้งาน';
    document.getElementById('createUserModal').style.display = 'flex';
}

function closeCreateUserModal() {
    document.getElementById('createUserModal').style.display = 'none';
}

async function submitUserForm(e) {
    e.preventDefault();
    const idVal = document.getElementById('userFormId').value;
    const username = document.getElementById('userFormUsername').value.trim();
    const name = document.getElementById('userFormFullName').value.trim();
    const department = document.getElementById('userFormDepartment').value.trim();
    const password = document.getElementById('userFormPassword').value.trim();
    const role = document.getElementById('userFormRole').value;

    const payload = { username, full_name: name, department, password, role };

    if (idVal) {
        const targetIndex = systemUsers.findIndex(u => String(u.id) === String(idVal));
        if (targetIndex !== -1) {
            systemUsers[targetIndex] = { id: systemUsers[targetIndex].id, ...payload, name };
        }
        if (navigator.onLine) {
            await _supabase.from('profiles').update(payload).eq('id', idVal);
        }
        showToast("✅ แก้ไขข้อมูลผู้ใช้เรียบร้อย");
    } else {
        const newId = Date.now();
        systemUsers.push({ id: newId, name, ...payload });
        if (navigator.onLine) {
            await _supabase.from('profiles').insert([payload]);
        }
        showToast("🎉 เพิ่มผู้ใช้งานใหม่เรียบร้อย");
    }

    localStorage.setItem('WMS_USERS', JSON.stringify(systemUsers));
    closeCreateUserModal();
    renderUserManagementTable();
    populateLogUserDropdown();
}

async function deleteUserAccount(id) {
    if (confirm("คุณแน่ใจหรือไม่ว่าต้องการลบบัญชีผู้ใช้นี้?")) {
        systemUsers = systemUsers.filter(u => u.id !== id);
        localStorage.setItem('WMS_USERS', JSON.stringify(systemUsers));

        if (navigator.onLine) {
            await _supabase.from('profiles').delete().eq('id', id);
        }
        showToast("🗑️ ลบบัญชีผู้ใช้งานแล้ว");
        renderUserManagementTable();
        populateLogUserDropdown();
    }
}

async function inspectUserLogs(username) {
    currentInspectedUser = systemUsers.find(u => u.username === username);
    if (!currentInspectedUser) return;

    document.getElementById('auditTargetUsername').textContent = currentInspectedUser.username;
    document.getElementById('auditTargetFullName').textContent = currentInspectedUser.name;
    document.getElementById('auditTargetDept').textContent = currentInspectedUser.department || '-';
    document.getElementById('auditTargetRole').textContent = currentInspectedUser.role;

    document.getElementById('userHistoryAuditModal').style.display = 'flex';
    await refreshSingleUserLogs();
}

function closeUserHistoryAuditModal() {
    document.getElementById('userHistoryAuditModal').style.display = 'none';
}

async function refreshSingleUserLogs() {
    if (!currentInspectedUser || !navigator.onLine) return;

    const tbody = document.getElementById('individualAuditLogsTableBody');
    tbody.innerHTML = `<tr><td colspan="5" style="text-align:center; padding:20px; color:var(--text-muted);"><i class="fa-solid fa-spinner fa-spin"></i> กำลังโหลด...</td></tr>`;

    try {
        const { data, error } = await _supabase
            .from('user_activities')
            .select('*')
            .eq('username', currentInspectedUser.username)
            .order('created_at', { ascending: false })
            .limit(100);

        if (!error && data) {
            currentInspectedUserLogs = data;
            filterIndividualAuditLogs();
        } else {
            tbody.innerHTML = `<tr><td colspan="5" style="text-align:center; padding:20px; color:var(--text-muted);">ไม่พบประวัติการใช้งานของผู้ใช้นี้</td></tr>`;
        }
    } catch(e) {
        tbody.innerHTML = `<tr><td colspan="5" style="text-align:center; padding:20px; color:var(--danger);">ไม่สามารถโหลดข้อมูลประวัติได้</td></tr>`;
    }
}

function filterIndividualAuditLogs() {
    const search = document.getElementById('auditModalSearchInput').value.trim().toLowerCase();
    const type = document.getElementById('auditModalTypeFilter').value;

    const filtered = currentInspectedUserLogs.filter(log => {
        const matchText = !search || 
            (log.description && log.description.toLowerCase().includes(search)) ||
            (log.target_sn && log.target_sn.toLowerCase().includes(search));
        const matchType = (type === 'ALL') || (log.action_type === type);
        return matchText && matchType;
    });

    const tbody = document.getElementById('individualAuditLogsTableBody');
    if (filtered.length === 0) {
        tbody.innerHTML = `<tr><td colspan="5" style="text-align:center; padding:20px; color:var(--text-muted);">ไม่พบประวัติกิจกรรมตรงเงื่อนไข</td></tr>`;
        return;
    }

    let html = '';
    filtered.forEach((log, idx) => {
        html += `
            <tr>
                <td style="text-align:center;" class="mono">${idx + 1}</td>
                <td style="font-size:0.78rem; color:var(--text-muted);">${new Date(log.created_at).toLocaleString('th-TH')}</td>
                <td><span class="badge-action nav">${escapeHTML(log.action_type)}</span></td>
                <td>${escapeHTML(log.description || '-')}</td>
                <td><code class="mono font-bold">${escapeHTML(log.target_sn || '-')}</code></td>
            </tr>
        `;
    });
    tbody.innerHTML = html;
}

function openEditItemModal(id, sn) {
    const item = globalInventoryData.find(i => String(i.id) === String(id) || i.sn === sn);
    if (!item) return;

    if (guardPendingSn(item.sn)) return;

    document.getElementById('editItemId').value = item.id || '';
    document.getElementById('editItemSn').value = item.sn;
    document.getElementById('editItemCategory').value = item.category || 'N/A';
    document.getElementById('editItemName').value = item.name || '-';
    document.getElementById('editItemMeter').value = item.meter || 0;
    document.getElementById('editItemLocation').value = item.location || 'DOCK';

    document.getElementById('editItemModal').style.display = 'flex';
}

function closeEditItemModal() {
    document.getElementById('editItemModal').style.display = 'none';
}

async function submitEditItemForm(e) {
    e.preventDefault();
    const id = document.getElementById('editItemId').value;
    const sn = document.getElementById('editItemSn').value;
    const category = document.getElementById('editItemCategory').value.trim();
    const name = document.getElementById('editItemName').value.trim();
    const meterVal = parseInt(document.getElementById('editItemMeter').value) || 0;

    const item = globalInventoryData.find(i => String(i.id) === String(id) || i.sn === sn);
    if (item) {
        item.category = category;
        item.name = name;
        item.meter = meterVal;
    }

    if (navigator.onLine) {
        try {
            await _supabase.from('warehouse_items').update({
                category: category,
                name: name,
                meter: meterVal
            }).eq('sn', sn);
        } catch (err) {}
    }

    closeEditItemModal();
    filterInventoryData();
    playSuccessSound();
    showToast(`✏️ อัปเดตข้อมูล S/N: ${sn} เรียบร้อยแล้ว`);
    await logUserActivity('UPDATE', `แก้ไขข้อมูลสินค้า SKU: ${category}, Meter: ${meterVal}`, sn);
}

function requestRelocateModal(id, sn, name, loc) {
    const item = globalInventoryData.find(i => i.sn === sn);
    if (item && guardPendingSn(item.sn)) return;

    document.getElementById('relocateItemId').value = id;
    document.getElementById('relocateItemSn').textContent = sn;
    document.getElementById('relocateItemName').textContent = name;
    document.getElementById('relocateItemCurrentLoc').textContent = loc;

    document.getElementById('relocateModal').style.display = 'flex';
    onRelocateAisleOrBayChange();
}

function closeRelocateModal() {
    document.getElementById('relocateModal').style.display = 'none';
}

function onRelocateAisleOrBayChange() {
    const aisle = document.getElementById('relocateAisleSelect').value;
    const baySelect = document.getElementById('relocateBaySelect');

    if (aisle === 'DOCK' || aisle === 'OFFICE' || aisle === 'PENDING') {
        baySelect.innerHTML = `<option value="01">${aisle} Area</option>`;
        document.getElementById('relocateShelfSelect').innerHTML = `<option value="1">1</option>`;
        document.getElementById('relocateSlotSelect').innerHTML = `<option value="1">1</option>`;
        updateRelocatePreview();
        return;
    }

    const cfg = aisleConfigs[aisle] || { bays: 10, shelves: 1, slots: 10 };
    let bayOptions = '';
    for (let b = 1; b <= cfg.bays; b++) {
        const bStr = String(b).padStart(2, '0');
        bayOptions += `<option value="${bStr}">ล็อก ${bStr}</option>`;
    }
    baySelect.innerHTML = bayOptions;

    let shelfOptions = '';
    for (let s = 1; s <= cfg.shelves; s++) shelfOptions += `<option value="${s}">ชั้น ${s}</option>`;
    document.getElementById('relocateShelfSelect').innerHTML = shelfOptions;

    let slotOptions = '';
    for (let sl = 1; sl <= cfg.slots; sl++) {
        const slStr = String(sl).padStart(2, '0');
        slotOptions += `<option value="${slStr}">ช่อง ${slStr}</option>`;
    }
    document.getElementById('relocateSlotSelect').innerHTML = slotOptions;

    autoSelectAvailableRelocateSlot();
}

function autoSelectAvailableRelocateSlot() {
    const aisle = document.getElementById('relocateAisleSelect').value;
    if (aisle === 'DOCK' || aisle === 'OFFICE' || aisle === 'PENDING') {
        updateRelocatePreview();
        return;
    }
    const bay = document.getElementById('relocateBaySelect').value;
    const cfg = aisleConfigs[aisle] || { bays: 10, shelves: 1, slots: 10 };

    for (let s = 1; s <= cfg.shelves; s++) {
        for (let sl = 1; sl <= cfg.slots; sl++) {
            const testLoc = `${aisle}-${bay}-${s}-${String(sl).padStart(2, '0')}`;
            if (!occupiedLocationsSet.has(testLoc)) {
                document.getElementById('relocateShelfSelect').value = s;
                document.getElementById('relocateSlotSelect').value = String(sl).padStart(2, '0');
                updateRelocatePreview();
                return;
            }
        }
    }
    updateRelocatePreview();
}

function updateRelocatePreview() {
    const aisle = document.getElementById('relocateAisleSelect').value;
    if (aisle === 'DOCK' || aisle === 'OFFICE' || aisle === 'PENDING') {
        document.getElementById('relocatePreviewBadge').textContent = aisle;
        return;
    }
    const bay = document.getElementById('relocateBaySelect').value;
    const shelf = document.getElementById('relocateShelfSelect').value;
    const slot = document.getElementById('relocateSlotSelect').value;

    document.getElementById('relocatePreviewBadge').textContent = `${aisle}-${bay}-${shelf}-${slot}`;
}

async function submitRelocateLocation() {
    const sn = document.getElementById('relocateItemSn').textContent;
    const newLoc = document.getElementById('relocatePreviewBadge').textContent;

    if (newLoc !== 'DOCK' && newLoc !== 'OFFICE' && newLoc !== 'PENDING') {
        if (occupiedLocationsSet.has(newLoc.toUpperCase())) {
            alert(`⚠️ พิกัด ${newLoc} มีสินค้าจัดเก็บอยู่แล้ว! กรุณาเลือกพิกัดอื่น`);
            return;
        }
    }

    const item = globalInventoryData.find(i => i.sn === sn);
    if (item) {
        item.location = newLoc;
    }

    rebuildOccupiedSet();

    if (navigator.onLine) {
        try {
            await _supabase.from('warehouse_items').update({ location: newLoc }).eq('sn', sn);
        } catch (e) {}
    }

    closeRelocateModal();
    filterInventoryData();
    refreshLocationVisualizerIfActive();
    playSuccessSound();
    showToast(`🚚 ย้าย S/N: ${sn} ไปยังพิกัด ${newLoc} เรียบร้อยแล้ว`);
    await logUserActivity('RELOCATE', `ย้ายพิกัดไปที่: ${newLoc}`, sn);
}

function requestBatchRelocateModal() {
    if (selectedItemSnSet.size === 0) {
        alert("⚠️️ กรุณาติ๊กเลือกรายการสินค้าในตารางอย่างน้อย 1 รายการเพื่อย้าย");
        return;
    }

    document.getElementById('batchRelocateTotalCount').textContent = selectedItemSnSet.size;
    const select = document.getElementById('batchRelocateAisleSelect');
    select.innerHTML = masterAisles.map(a => `<option value="${escapeHTML(a)}">แถว ${escapeHTML(a)}</option>`).join('');

    document.getElementById('batchRelocateModal').style.display = 'flex';
    updateBatchRelocateCapacityPreview();
}

function closeBatchRelocateModal() {
    document.getElementById('batchRelocateModal').style.display = 'none';
}

function updateBatchRelocateCapacityPreview() {
    const aisle = document.getElementById('batchRelocateAisleSelect').value;
    const text = document.getElementById('batchCapacityPreviewText');
    if (aisle === 'DOCK' || aisle === 'OFFICE' || aisle === 'PENDING') {
        text.textContent = `พื้นที่ ${aisle} พร้อมรองรับทุกรายการที่เลือก`;
        return;
    }

    const cfg = aisleConfigs[aisle] || { bays: 10, shelves: 1, slots: 10 };
    const totalSlots = cfg.bays * cfg.shelves * cfg.slots;
    const occupiedInAisle = globalInventoryData.filter(i => (i.location || '').toUpperCase().startsWith(`${aisle}-`)).length;
    const freeSlots = totalSlots - occupiedInAisle;

    text.textContent = `แถว ${aisle} มีพื้นที่ว่างประมาณ ${freeSlots} ช่อง (ต้องการย้าย ${selectedItemSnSet.size} รายการ)`;
    if (freeSlots < selectedItemSnSet.size) {
        text.style.color = 'var(--danger)';
    } else {
        text.style.color = 'var(--success)';
    }
}

async function executeBatchRelocate() {
    const targetAisle = document.getElementById('batchRelocateAisleSelect').value;
    const snList = Array.from(selectedItemSnSet);

    for (const sn of snList) {
        const item = globalInventoryData.find(i => i.sn === sn);
        if (item) {
            const freeLoc = allocateFreeSlot(targetAisle);
            item.location = freeLoc;
            if (navigator.onLine) {
                await _supabase.from('warehouse_items').update({ location: freeLoc }).eq('sn', sn);
            }
        }
    }

    rebuildOccupiedSet();
    selectedItemSnSet.clear();
    closeBatchRelocateModal();
    filterInventoryData();
    refreshLocationVisualizerIfActive();
    playSuccessSound();
    showToast(`🚀 ย้ายสินค้า ${snList.length} รายการไปยังแถว ${targetAisle} เรียบร้อยแล้ว`);
    await logUserActivity('BATCH_RELOCATE', `ย้ายสินค้ารวม ${snList.length} รายการไปยังแถว ${targetAisle}`);
}

function allocateFreeSlot(aisle) {
    if (aisle === 'DOCK' || aisle === 'OFFICE' || aisle === 'PENDING') return aisle;
    const cfg = aisleConfigs[aisle] || { bays: 10, shelves: 1, slots: 10 };
    
    for (let b = 1; b <= cfg.bays; b++) {
        const bayStr = String(b).padStart(2, '0');
        for (let s = 1; s <= cfg.shelves; s++) {
            for (let sl = 1; sl <= cfg.slots; sl++) {
                const slotStr = String(sl).padStart(2, '0');
                const loc = `${aisle}-${bayStr}-${s}-${slotStr}`;
                if (!occupiedLocationsSet.has(loc)) { 
                    occupiedLocationsSet.add(loc); 
                    return loc; 
                }
            }
        }
    }
    return `${aisle}-01-1-01`;
}

function requestDeleteModal(mode, sn = null, id = null) {
    pendingDeleteMode = mode;
    pendingDeleteSn = sn;
    pendingDeleteId = id;

    const details = document.getElementById('deleteConfirmModalDetails');
    if (mode === 'SINGLE') {
        if (guardPendingSn(sn)) return;
        details.textContent = `S/N: ${sn}`;
    } else {
        if (selectedItemSnSet.size === 0) {
            alert("⚠️ กรุณาเลือกรายการที่ต้องการลบอย่างน้อย 1 รายการ");
            return;
        }
        details.textContent = `รายการที่เลือกทั้งหมด (${selectedItemSnSet.size} รายการ): ${Array.from(selectedItemSnSet).slice(0, 5).join(', ')}${selectedItemSnSet.size > 5 ? '...' : ''}`;
    }

    document.getElementById('deleteConfirmModal').style.display = 'flex';
}

function closeDeleteConfirmModal() {
    document.getElementById('deleteConfirmModal').style.display = 'none';
}

async function executeDeleteAction() {
    let snsToDelete = [];
    if (pendingDeleteMode === 'SINGLE') {
        snsToDelete = [pendingDeleteSn];
    } else {
        snsToDelete = Array.from(selectedItemSnSet);
    }

    if (currentUser && currentUser.role === 'user') {
        createPendingApprovalRequest('DELETE', `ขอลบสินค้าออกจากคลัง (${snsToDelete.length} รายการ)`, snsToDelete, { snsToDelete });
        closeDeleteConfirmModal();
        selectedItemSnSet.clear();
        updateSelectedCountUI();
        return;
    }

    globalInventoryData = globalInventoryData.filter(i => !snsToDelete.includes(i.sn));
    rebuildOccupiedSet();

    if (navigator.onLine) {
        try {
            await _supabase.from('warehouse_items').delete().in('sn', snsToDelete);
        } catch (e) {}
    }

    closeDeleteConfirmModal();
    selectedItemSnSet.clear();
    filterInventoryData();
    updateKPIs();
    refreshLocationVisualizerIfActive();
    playSuccessSound();
    showToast(`🗑️ ลบสินค้าออกจากระบบ ${snsToDelete.length} รายการเรียบร้อย`);
    await logUserActivity('DELETE', `ลบสินค้าออกจากระบบ (${snsToDelete.length} รายการ)`, snsToDelete.join(', '));
}

function openExcelExportModal() {
    document.getElementById('exportAisleGroup').style.display = 'none';
    const select = document.getElementById('exportAisleSelect');
    select.innerHTML = masterAisles.map(a => `<option value="${escapeHTML(a)}">แถว ${escapeHTML(a)}</option>`).join('');
    document.getElementById('excelExportModal').style.display = 'flex';
}

function closeExcelExportModal() {
    document.getElementById('excelExportModal').style.display = 'none';
}

function onExportScopeChange(val) {
    document.getElementById('exportAisleGroup').style.display = val === 'AISLE' ? 'block' : 'none';
}

function executeExcelExport() {
    const scope = document.getElementById('exportScopeSelect').value;
    let dataToExport = [];

    if (scope === 'ALL') {
        dataToExport = globalInventoryData;
    } else if (scope === 'FILTERED') {
        dataToExport = currentFilteredItems;
    } else if (scope === 'AISLE') {
        const selectedAisle = document.getElementById('exportAisleSelect').value;
        dataToExport = globalInventoryData.filter(i => (i.location || '').toUpperCase().startsWith(`${selectedAisle}-`) || (i.location || '').toUpperCase() === selectedAisle);
    }

    if (dataToExport.length === 0) {
        alert("⚠ ไม่พบข้อมูลสำหรับส่งออก Excel");
        return;
    }

    const exportRows = dataToExport.map((i, index) => ({
        'ลำดับ': index + 1,
        'รหัสสินค้า (SKU)': i.category || 'N/A',
        'ชื่อรุ่น / รายละเอียด': i.name || '-',
        'เลขมิเตอร์': i.meter || 0,
        'หมายเลขซีเรียล (S/N)': i.sn,
        'พิกัดจัดเก็บ': formatLocationCode(i.location),
        'จำนวน': i.qty || 1,
        'วันที่รับเข้า': i.created_at ? new Date(i.created_at).toLocaleString('th-TH') : '-'
    }));

    const worksheet = XLSX.utils.json_to_sheet(exportRows);
    const workbook = XLSX.utils.book_new();
    XLSX.utils.book_append_sheet(workbook, worksheet, 'StockInventory');
    
    const fileName = `WMS_Inventory_Export_${new Date().toISOString().slice(0, 10)}.xlsx`;
    XLSX.writeFile(workbook, fileName);

    closeExcelExportModal();
    showToast("📊 ส่งออกไฟล์ Excel เรียบร้อยแล้ว");
}

let currentPrintBarcodeList = [];

function openPrintBarcodeModal(mode, targetSn = null) {
    if (mode === 'SINGLE') {
        const item = globalInventoryData.find(i => i.sn === targetSn);
        currentPrintBarcodeList = item ? [item] : [];
    } else {
        if (selectedItemSnSet.size === 0) {
            alert("⚠️ กรุณาเลือกรายการสติ๊กเกอร์บาร์โค้ดที่ต้องการพิมพ์ในตาราง");
            return;
        }
        currentPrintBarcodeList = globalInventoryData.filter(i => selectedItemSnSet.has(i.sn));
    }

    document.getElementById('printPreviewCountBadge').textContent = `จำนวน ${currentPrintBarcodeList.length} ใบ`;
    document.getElementById('printBarcodeModal').style.display = 'flex';
    updatePrintPreviewLayout();
}

function closePrintBarcodeModal() {
    document.getElementById('printBarcodeModal').style.display = 'none';
}

function updatePrintPreviewLayout() {
    const size = document.getElementById('thermalSizeSelect').value;
    const container = document.getElementById('barcodePreviewArea');
    if (!container) return;

    container.innerHTML = '';

    if (currentPrintBarcodeList.length === 0) {
        container.className = 'thermal-label-container';
        container.innerHTML = `<div style="text-align:center; padding:30px; color:#64748b; font-weight:600;">ไม่พบรายการสติ๊กเกอร์สำหรับแสดงผล</div>`;
        return;
    }

    if (size === 'A4') {
        container.className = 'thermal-label-container mode-a4';
        const pageSize = 24;
        const totalPages = Math.ceil(currentPrintBarcodeList.length / pageSize);

        for (let pageIdx = 0; pageIdx < totalPages; pageIdx++) {
            const pageItems = currentPrintBarcodeList.slice(pageIdx * pageSize, (pageIdx + 1) * pageSize);

            const pageLabel = document.createElement('div');
            pageLabel.style.cssText = 'width:100%; text-align:center; font-weight:700; font-size:0.85rem; color:#334155; margin-top:10px;';
            pageLabel.innerHTML = `<i class="fa-solid fa-file-lines" style="color:var(--primary);"></i> ตัวอย่างกระดาษ A4 หน้าที่ ${pageIdx + 1} / ${totalPages} (จัดเรียง 3 คอลัมน์ × 8 แถว = ${pageItems.length} บาร์โค้ด)`;
            container.appendChild(pageLabel);

            const pageDiv = document.createElement('div');
            pageDiv.className = 'a4-page-sheet';

            pageItems.forEach((item, itemIdx) => {
                const globalIdx = pageIdx * pageSize + itemIdx;
                const card = document.createElement('div');
                card.className = 'barcode-card-box thermal-card-a4-grid';
                const svgId = `barcode-svg-${globalIdx}`;

                card.innerHTML = `
                    <div style="font-weight:800; font-size:0.68rem; color:#000; line-height:1.1; max-height:2.2em; overflow:hidden; width:100%;" class="text-multiline-truncate" title="${escapeHTML(item.name || item.category)}">${escapeHTML(item.name || item.category)}</div>
                    <div class="barcode-svg-container"><svg id="${svgId}"></svg></div>
                    <div style="display:flex; justify-content:space-between; align-items:center; width:100%; font-size:0.6rem; font-weight:700; color:#000;" class="mono">
                        <span style="overflow:hidden; text-overflow:ellipsis; white-space:nowrap; max-width:55%;">SKU: ${escapeHTML(item.category || 'N/A')}</span>
                        <span>📍 ${escapeHTML(formatLocationCode(item.location))}</span>
                    </div>
                `;
                pageDiv.appendChild(card);
            });

            container.appendChild(pageDiv);

            pageItems.forEach((item, itemIdx) => {
                const globalIdx = pageIdx * pageSize + itemIdx;
                const svgId = `barcode-svg-${globalIdx}`;
                try {
                    JsBarcode(`#${svgId}`, item.sn, {
                        format: "CODE128",
                        width: 1.1,
                        height: 24,
                        displayValue: true,
                        fontSize: 9,
                        margin: 1
                    });
                } catch (e) {
                    console.warn("JsBarcode Error:", e);
                }
            });
        }
    } else {
        container.className = 'thermal-label-container mode-thermal';
        let cardClass = 'thermal-card-50x30';
        let bcWidth = 1.3, bcHeight = 30, bcFontSize = 10, bcMargin = 1;

        if (size === '40x30') {
            cardClass = 'thermal-card-40x30';
            bcWidth = 1.1; bcHeight = 22; bcFontSize = 9; bcMargin = 0;
        } else if (size === '100x75') {
            cardClass = 'thermal-card-100x75';
            bcWidth = 2.0; bcHeight = 58; bcFontSize = 14; bcMargin = 3;
        } else if (size === '100x150') {
            cardClass = 'thermal-card-100x150';
            bcWidth = 2.2; bcHeight = 95; bcFontSize = 16; bcMargin = 4;
        }

        currentPrintBarcodeList.forEach((item, idx) => {
            const card = document.createElement('div');
            card.className = `barcode-card-box ${cardClass}`;
            const svgId = `barcode-svg-${idx}`;

            card.innerHTML = `
                <div style="font-weight:800; font-size:0.75rem; color:#000; line-height:1.15; max-height:2.3em; overflow:hidden; width:100%;" class="text-multiline-truncate" title="${escapeHTML(item.name || item.category)}">${escapeHTML(item.name || item.category)}</div>
                <div class="barcode-svg-container"><svg id="${svgId}"></svg></div>
                <div style="display:flex; justify-content:space-between; align-items:center; width:100%; font-size:0.68rem; font-weight:700; color:#000;" class="mono">
                    <span style="overflow:hidden; text-overflow:ellipsis; white-space:nowrap; max-width:55%;">SKU: ${escapeHTML(item.category || 'N/A')}</span>
                    <span>📍 ${escapeHTML(formatLocationCode(item.location))}</span>
                </div>
            `;
            container.appendChild(card);

            try {
                JsBarcode(`#${svgId}`, item.sn, {
                    format: "CODE128",
                    width: bcWidth,
                    height: bcHeight,
                    displayValue: true,
                    fontSize: bcFontSize,
                    margin: bcMargin
                });
            } catch (e) {
                console.warn("JsBarcode Error:", e);
            }
        });
    }
}

// 🟢 ปรับปรุงเอนจินส่งคำสั่งพิมพ์กระดาษ A4 ต่อเนื่อง โดยสกัดเฉพาะ .a4-page-sheet ไม่แทรกหน้าว่าง
function triggerPDFPrintPreview() {
    const size = document.getElementById('thermalSizeSelect').value;
    const previewContainer = document.getElementById('barcodePreviewArea');
    if (!previewContainer) return;

    let printContents = '';

    if (size === 'A4') {
        const sheets = previewContainer.querySelectorAll('.a4-page-sheet');
        sheets.forEach(sheet => {
            printContents += sheet.outerHTML;
        });
    } else {
        const cards = previewContainer.querySelectorAll('.barcode-card-box');
        cards.forEach(card => {
            printContents += card.outerHTML;
        });
    }

    const printWindow = window.open('', '_blank');

    let pageStyle = '';
    if (size === 'A4') {
        pageStyle = `
            @page { size: A4 portrait; margin: 0; }
            html, body {
                margin: 0 !important;
                padding: 0 !important;
                background: #fff !important;
                color: #000 !important;
                width: 210mm !important;
                height: 100% !important;
            }
            #barcodePreviewArea { margin: 0 !important; padding: 0 !important; }
            .a4-page-sheet {
                width: 210mm !important;
                height: 296.5mm !important;
                max-height: 296.5mm !important;
                padding: 5mm 5mm !important;
                margin: 0 !important;
                box-shadow: none !important;
                border: none !important;
                display: grid !important;
                grid-template-columns: repeat(3, 1fr) !important;
                grid-template-rows: repeat(8, 1fr) !important;
                gap: 2.5mm 3.5mm !important;
                page-break-after: always !important;
                break-after: page !important;
                page-break-inside: avoid !important;
                break-inside: avoid !important;
                box-sizing: border-box !important;
                background: #fff !important;
                overflow: hidden !important;
            }
            .a4-page-sheet:last-child {
                page-break-after: auto !important;
                break-after: auto !important;
            }
            .thermal-card-a4-grid {
                width: 100% !important;
                height: 100% !important;
                margin: 0 !important;
                border: 1px solid #000 !important;
                border-radius: 3px !important;
                padding: 3px 4px !important;
                box-sizing: border-box !important;
                display: flex !important;
                flex-direction: column !important;
                justify-content: space-between !important;
                align-items: center !important;
                text-align: center !important;
                overflow: hidden !important;
                background: #fff !important;
            }
        `;
    } else {
        let widthMm = 50, heightMm = 30;
        if (size === '40x30') { widthMm = 40; heightMm = 30; }
        else if (size === '100x75') { widthMm = 100; heightMm = 75; }
        else if (size === '100x150') { widthMm = 100; heightMm = 150; }

        pageStyle = `
            @page { size: ${widthMm}mm ${heightMm}mm; margin: 0; }
            html, body { margin: 0; padding: 0; background: #fff !important; color: #000 !important; }
            #barcodePreviewArea { display: block !important; padding: 0 !important; gap: 0 !important; }
            .barcode-card-box {
                width: ${widthMm}mm !important;
                height: ${heightMm}mm !important;
                margin: 0 !important;
                padding: 2mm !important;
                box-sizing: border-box !important;
                page-break-after: always !important;
                break-after: page !important;
                page-break-inside: avoid !important;
                break-inside: avoid !important;
                border: 1px solid #000 !important;
                border-radius: 0 !important;
                display: flex !important;
                flex-direction: column !important;
                justify-content: space-between !important;
                align-items: center !important;
                text-align: center !important;
                overflow: hidden !important;
                background: #fff !important;
            }
        `;
    }

    printWindow.document.write(`
        <!DOCTYPE html>
        <html>
            <head>
                <title>พิมพ์บาร์โค้ดสติ๊กเกอร์ (WMS Enterprise)</title>
                <link rel="stylesheet" href="style.css">
                <style>
                    ${pageStyle}
                    .barcode-svg-container {
                        display: flex !important;
                        justify-content: center !important;
                        align-items: center !important;
                        width: 100% !important;
                        overflow: hidden !important;
                    }
                    .barcode-svg-container svg {
                        max-width: 100% !important;
                        height: auto !important;
                    }
                    .mono { font-family: 'JetBrains Mono', monospace, monospace; }
                </style>
            </head>
            <body>
                <div id="barcodePreviewArea">
                    ${printContents}
                </div>
            </body>
        </html>
    `);
    printWindow.document.close();
    printWindow.focus();
    setTimeout(() => {
        printWindow.print();
        printWindow.close();
    }, 600);

    closePrintBarcodeModal();
}