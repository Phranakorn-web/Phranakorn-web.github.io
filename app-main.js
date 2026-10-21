// =========================================================================
// --- MODULE: MAIN CORE ORCHESTRATION & ACTION HANDLERS ---
// =========================================================================

let pendingDeleteMode = null;
let pendingDeleteSn = null;
let pendingDeleteId = null;
let voiceSettings = { inboundVoice: false, deleteVoice: false };

function initKeyboardShortcuts() {
    document.addEventListener('keydown', (e) => {
        if ((e.ctrlKey || e.metaKey) && e.key.toLowerCase() === 'k') {
            e.preventDefault();
            const searchInput = document.getElementById('searchSnInput') || document.getElementById('globalSearchInput');
            if (searchInput) {
                searchInput.focus();
                showToast("🔍 โฟกัสช่องค้นหาด่วน");
            }
        }
        if (e.key === 'Escape') {
            document.querySelectorAll('.modal-overlay').forEach(modal => {
                modal.style.display = 'none';
            });
        }
        if ((e.ctrlKey || e.metaKey) && e.key >= '1' && e.key <= '7') {
            const routes = [
                'view-inventory', 
                'view-inbound', 
                'view-outbound', 
                'view-locations', 
                'view-approvals', 
                'view-activities', 
                'view-settings'
            ];
            const targetIdx = parseInt(e.key, 10) - 1;
            if (routes[targetIdx]) {
                e.preventDefault();
                if (typeof switchView === 'function') switchView(routes[targetIdx]);
            }
        }
    });
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

function generateAutoSN() {
    const rand = Math.floor(100000 + Math.random() * 900000);
    const sn = `SN-${rand}`;
    document.getElementById('inboundSn').value = sn;
    showToast(`🪄 สุ่ม S/N: ${sn}`);
}

// 🟢 1. ย้ายพิกัดสินค้าเดี่ยว: หากเป็น User ทั่วไปส่งเรื่องขออนุมัติ
async function submitRelocateLocation() {
    const sn = document.getElementById('relocateItemSn').textContent;
    const newLoc = document.getElementById('relocatePreviewBadge').textContent;

    if (newLoc !== 'DOCK' && newLoc !== 'OFFICE' && newLoc !== 'PENDING') {
        if (occupiedLocationsSet.has(newLoc.toUpperCase())) {
            alert(`⚠️ พิกัด ${newLoc} มีสินค้าจัดเก็บอยู่แล้ว! กรุณาเลือกพิกัดอื่น`);
            return;
        }
    }

    // 🟢 หากเป็น User ทั่วไป -> ส่งเรื่องขออนุมัติย้ายพิกัด
    if (currentUser && currentUser.role === 'user') {
        if (typeof createPendingApprovalRequest === 'function') {
            await createPendingApprovalRequest(
                'RELOCATE', 
                `ขอย้ายพิกัดสินค้า S/N: ${sn} ไปยังพิกัด ${newLoc}`, 
                [sn], 
                { target_location: newLoc, snsToRelocate: [sn] }
            );
        }
        closeRelocateModal();
        return;
    }

    // 🟢 หากเป็น Admin -> ย้ายพิกัดลง DB โดยตรง
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

// 🟢 2. ย้ายพิกัดสินค้าแบบกลุ่ม (Batch Relocate): หากเป็น User ทั่วไปส่งเรื่องขออนุมัติ
async function executeBatchRelocate() {
    const targetAisle = document.getElementById('batchRelocateAisleSelect').value;
    const snList = Array.from(selectedItemSnSet);

    if (snList.length === 0) {
        alert("⚠️ กรุณาเลือกรายการสินค้าอย่างน้อย 1 รายการเพื่อย้าย");
        return;
    }

    // 🟢 หากเป็น User ทั่วไป -> ส่งเรื่องขออนุมัติย้ายพิกัดกลุ่ม
    if (currentUser && currentUser.role === 'user') {
        if (typeof createPendingApprovalRequest === 'function') {
            await createPendingApprovalRequest(
                'BATCH_RELOCATE', 
                `ขอย้ายพิกัดสินค้ารวม ${snList.length} รายการ ไปยังแถว ${targetAisle}`, 
                snList, 
                { target_aisle: targetAisle, snsToRelocate: snList }
            );
        }
        selectedItemSnSet.clear();
        closeBatchRelocateModal();
        updateSelectedCountUI();
        return;
    }

    // 🟢 หากเป็น Admin -> ดำเนินการย้ายพิกัดลง DB โดยตรง
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

// 🟢 3. ลบสินค้าออกจากคลัง: หากเป็น User ทั่วไปส่งเรื่องขออนุมัติ
async function executeDeleteAction() {
    let snsToDelete = [];
    if (pendingDeleteMode === 'SINGLE') {
        snsToDelete = [pendingDeleteSn];
    } else {
        snsToDelete = Array.from(selectedItemSnSet);
    }

    if (snsToDelete.length === 0) return;

    // 🟢 หากเป็น User ทั่วไป -> ส่งคำขออนุมัติขอลบสินค้า
    if (currentUser && currentUser.role === 'user') {
        if (typeof createPendingApprovalRequest === 'function') {
            await createPendingApprovalRequest(
                'DELETE', 
                `ขอลบสินค้าออกจากคลัง (${snsToDelete.length} รายการ)`, 
                snsToDelete, 
                { snsToDelete }
            );
        }
        closeDeleteConfirmModal();
        selectedItemSnSet.clear();
        updateSelectedCountUI();
        return;
    }

    // 🟢 หากเป็น Admin -> ลบข้อมูลออกจาก DB โดยตรง
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

document.addEventListener('DOMContentLoaded', async () => {
    initThemeSystem();
    initOfflineSyncEngine();
    initKeyboardShortcuts();

    // 🟢 1. ตรวจสอบหน้าปัจจุบันที่จดจำไว้ แล้วสลับไปที่หน้านั้นทันทีโดยไม่สลับไปหน้าสต็อก
    const activeView = (typeof getCurrentActiveView === 'function') 
        ? getCurrentActiveView() 
        : (localStorage.getItem('WMS_LAST_ACTIVE_VIEW') || 'view-inventory');

    if (typeof switchView === 'function') {
        switchView(activeView);
    }

    // 🟢 2. โหลดข้อมูลตามปกติ
    await initAuthSystem();
    await loadDataFromDatabase();
    await loadWarehouseConfigsFromDB();
    await loadOutboundHistoryFromDB();
    if (currentUser && currentUser.role === 'admin') {
        await loadPendingApprovalsFromDB();
    }
    populateAisleDropdowns();
    if (typeof onInboundAisleOrBayChange === 'function') onInboundAisleOrBayChange();

    // 🟢 3. ยืนยันสลับไปหน้าล่าสุดอีกครั้งหลังโหลดข้อมูล DB เสร็จ
    if (typeof switchView === 'function') {
        switchView(activeView);
    }
});