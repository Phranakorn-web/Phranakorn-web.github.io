// =========================================================================
// --- MODULE: MAIN CORE ORCHESTRATION & ACTION HANDLERS (v12.1 REAL-TIME 100%) ---
// =========================================================================

let pendingDeleteMode = null;
let pendingDeleteSn = null;
let pendingDeleteId = null;
let voiceSettings = { inboundVoice: false, deleteVoice: false };

function initKeyboardShortcuts() {
    document.addEventListener('keydown', (e) => {
        if ((e.ctrlKey || e.metaKey) && e.key.toLowerCase() === 'k') {
            e.preventDefault();
            const searchInput = document.getElementById('searchSnInput') || document.getElementById('globalSearchInput') || document.getElementById('menuSearchInput');
            if (searchInput) {
                searchInput.focus();
                if (typeof showToast === 'function') showToast("🔍 โฟกัสช่องค้นหาด่วน");
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
    if (typeof showToast === 'function') showToast(`🎨 เปลี่ยนธีมเป็น: ${nextTheme === 'light' ? 'โหมดสว่าง' : 'โหมดมืด'}`);
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
    const batchRelocateSelect = document.getElementById('batchRelocateAisleSelect');

    if (typeof masterAisles === 'undefined' || !Array.isArray(masterAisles)) return;

    const safeEscape = (str) => (typeof escapeHTML === 'function') ? escapeHTML(str) : str;

    const optionsHtml = masterAisles.map(a => {
        let label = `แถว ${a}`;
        if (a === 'DOCK') label = '🚚 ลาน DOCK';
        else if (a === 'OFFICE') label = '🏢 ฝากเก็บในออฟฟิศ';
        else if (a === 'PENDING') label = '⏳ รอรับเข้าจริง';
        return `<option value="${safeEscape(a)}">${label}</option>`;
    }).join('');

    const defaultPlaceholder = `<option value="" disabled selected>โปรดเลือกแถวจัดเก็บ</option>`;

    if (filterSelect) {
        const curVal = filterSelect.value || 'ALL';
        filterSelect.innerHTML = `<option value="ALL">📍 แสดงทุกแถว (All)</option>` + optionsHtml;
        filterSelect.value = curVal;
    }

    if (inboundSelect) {
        const curVal = inboundSelect.value;
        inboundSelect.innerHTML = defaultPlaceholder + optionsHtml;
        if (curVal && curVal !== 'DOCK') {
            inboundSelect.value = curVal;
        } else {
            inboundSelect.value = '';
        }
    }

    if (relocateSelect) {
        const curVal = relocateSelect.value;
        relocateSelect.innerHTML = defaultPlaceholder + optionsHtml;
        if (curVal && curVal !== 'DOCK') {
            relocateSelect.value = curVal;
        } else {
            relocateSelect.value = '';
        }
    }

    if (batchRelocateSelect) {
        const curVal = batchRelocateSelect.value;
        batchRelocateSelect.innerHTML = defaultPlaceholder + optionsHtml;
        if (curVal && curVal !== 'DOCK') {
            batchRelocateSelect.value = curVal;
        } else {
            batchRelocateSelect.value = '';
        }
    }
}

function generateAutoSN() {
    const rand = Math.floor(100000 + Math.random() * 900000);
    const sn = `SN-${rand}`;
    const inboundSnElem = document.getElementById('inboundSn');
    if (inboundSnElem) inboundSnElem.value = sn;
    if (typeof showToast === 'function') showToast(`🪄 สุ่ม S/N: ${sn}`);
}

// 🟢 ฟังก์ชันลงรับสินค้าจากการสแกน Inbound แบบ Real-time 100% (อัปเดตหน้าเช็คสต็อกทันที)
async function onInboundScanSuccess(itemData) {
    if (!itemData || !itemData.sn) return;

    const newItem = {
        ...itemData,
        qty: parseInt(itemData.qty) || 1,
        meter: parseFloat(itemData.meter) || 0,
        received_by_fullname: itemData.received_by_fullname || (typeof getCurrentReceiverName === 'function' ? getCurrentReceiverName() : 'ผู้ดูแลระบบ'),
        created_at: itemData.created_at || new Date().toISOString(),
        _isNewRealtime: true
    };

    // 1. เพิ่มเข้า Memory หน้า Client ทันที
    const existsIdx = window.globalInventoryData.findIndex(i => String(i.sn).toLowerCase() === String(newItem.sn).toLowerCase());
    if (existsIdx === -1) {
        window.globalInventoryData.unshift(newItem);
    } else {
        window.globalInventoryData[existsIdx] = { ...window.globalInventoryData[existsIdx], ...newItem, _isUpdatedRealtime: true };
    }

    // 2. สั่งให้หน้าเช็คสต็อกสินค้าและ KPIs รีเฟรชทันที
    if (typeof autoRefreshActiveView === 'function') {
        autoRefreshActiveView();
    }

    // 3. กระจายสัญญาณหาทุกแท็บและทุกเครื่อง
    if (typeof notifyWmsDataChanged === 'function') {
        notifyWmsDataChanged('INBOUND_SCAN', newItem);
    }

    // 4. บันทึกลง Supabase DB
    if (navigator.onLine) {
        const client = typeof getSupabaseClient === 'function' ? getSupabaseClient() : (typeof _supabase !== 'undefined' ? _supabase : null);
        if (client) {
            try {
                await client.from('warehouse_items').upsert([newItem], { onConflict: 'sn' });
            } catch (e) {
                console.error('Supabase Inbound Save Error:', e);
            }
        }
    }
}
window.onInboundScanSuccess = onInboundScanSuccess;

// 🟢 1. ย้ายพิกัดสินค้าเดี่ยว: บันทึกและ Auto Refresh เรียลไทม์ 100%
async function submitRelocateLocation() {
    const snElem = document.getElementById('relocateItemSn');
    const previewBadge = document.getElementById('relocatePreviewBadge');
    if (!snElem || !previewBadge) return;

    const sn = snElem.textContent;
    const newLoc = previewBadge.textContent;

    if (newLoc !== 'DOCK' && newLoc !== 'OFFICE' && newLoc !== 'PENDING') {
        if (typeof occupiedLocationsSet !== 'undefined' && occupiedLocationsSet.has(newLoc.toUpperCase())) {
            alert(`⚠️ พิกัด ${newLoc} มีสินค้าจัดเก็บอยู่แล้ว! กรุณาเลือกพิกัดอื่น`);
            return;
        }
    }

    if (currentUser && currentUser.role === 'user') {
        if (typeof createPendingApprovalRequest === 'function') {
            await createPendingApprovalRequest(
                'RELOCATE', 
                `ขอย้ายพิกัดสินค้า S/N: ${sn} ไปยังพิกัด ${newLoc}`, 
                [sn], 
                { target_location: newLoc, snsToRelocate: [sn] }
            );
        }
        if (typeof closeRelocateModal === 'function') closeRelocateModal();
        if (typeof autoRefreshActiveView === 'function') autoRefreshActiveView();
        return;
    }

    if (typeof globalInventoryData !== 'undefined') {
        const item = globalInventoryData.find(i => i.sn === sn);
        if (item) {
            item.location = newLoc;
            item._isUpdatedRealtime = true;
        }
    }

    if (typeof rebuildOccupiedSet === 'function') rebuildOccupiedSet();

    if (navigator.onLine && typeof _supabase !== 'undefined' && _supabase) {
        try {
            await _supabase.from('warehouse_items').update({ location: newLoc }).eq('sn', sn);
        } catch (e) {}
    }

    if (typeof closeRelocateModal === 'function') closeRelocateModal();
    if (typeof refreshLocationVisualizerIfActive === 'function') refreshLocationVisualizerIfActive();
    if (typeof playSuccessSound === 'function') playSuccessSound();
    if (typeof showToast === 'function') showToast(`🚚 ย้าย S/N: ${sn} ไปยังพิกัด ${newLoc} เรียบร้อยแล้ว`);
    if (typeof logUserActivity === 'function') await logUserActivity('RELOCATE', `ย้ายพิกัดไปที่: ${newLoc}`, sn);

    // Auto Refresh หน้าจอทุกแท็บข้ามเครื่องแบบ Realtime 100%
    if (typeof notifyWmsDataChanged === 'function') notifyWmsDataChanged('RELOCATE', { sn, newLoc });
    if (typeof autoRefreshActiveView === 'function') autoRefreshActiveView();
}
window.submitRelocateLocation = submitRelocateLocation;

// 🟢 2. ย้ายพิกัดสินค้าแบบกลุ่ม (Batch Relocate): บันทึกและ Auto Refresh เรียลไทม์
async function executeBatchRelocate() {
    const targetAisleElem = document.getElementById('batchRelocateAisleSelect');
    if (!targetAisleElem) return;
    const targetAisle = targetAisleElem.value;
    const snList = (typeof selectedItemSnSet !== 'undefined') ? Array.from(selectedItemSnSet) : [];

    if (snList.length === 0) {
        alert("⚠️ กรุณาเลือกรายการสินค้าอย่างน้อย 1 รายการเพื่อย้าย");
        return;
    }

    if (currentUser && currentUser.role === 'user') {
        if (typeof createPendingApprovalRequest === 'function') {
            await createPendingApprovalRequest(
                'BATCH_RELOCATE', 
                `ขอย้ายพิกัดสินค้ารวม ${snList.length} รายการ ไปยังแถว ${targetAisle}`, 
                snList, 
                { target_aisle: targetAisle, snsToRelocate: snList }
            );
        }
        if (typeof selectedItemSnSet !== 'undefined') selectedItemSnSet.clear();
        if (typeof closeBatchRelocateModal === 'function') closeBatchRelocateModal();
        if (typeof updateSelectedCountUI === 'function') updateSelectedCountUI();
        if (typeof autoRefreshActiveView === 'function') autoRefreshActiveView();
        return;
    }

    for (const sn of snList) {
        if (typeof globalInventoryData !== 'undefined') {
            const item = globalInventoryData.find(i => i.sn === sn);
            if (item) {
                const freeLoc = (typeof allocateFreeSlot === 'function') ? allocateFreeSlot(targetAisle) : targetAisle;
                item.location = freeLoc;
                item._isUpdatedRealtime = true;
                if (navigator.onLine && typeof _supabase !== 'undefined' && _supabase) {
                    await _supabase.from('warehouse_items').update({ location: freeLoc }).eq('sn', sn);
                }
            }
        }
    }

    if (typeof rebuildOccupiedSet === 'function') rebuildOccupiedSet();
    if (typeof selectedItemSnSet !== 'undefined') selectedItemSnSet.clear();
    if (typeof closeBatchRelocateModal === 'function') closeBatchRelocateModal();
    if (typeof refreshLocationVisualizerIfActive === 'function') refreshLocationVisualizerIfActive();
    if (typeof playSuccessSound === 'function') playSuccessSound();
    if (typeof showToast === 'function') showToast(`🚀 ย้ายสินค้า ${snList.length} รายการไปยังแถว ${targetAisle} เรียบร้อยแล้ว`);
    if (typeof logUserActivity === 'function') await logUserActivity('BATCH_RELOCATE', `ย้ายสินค้ารวม ${snList.length} รายการไปยังแถว ${targetAisle}`);

    // Auto Refresh หน้าจอและข้อมูลทันที
    if (typeof notifyWmsDataChanged === 'function') notifyWmsDataChanged('BATCH_RELOCATE', { targetAisle, count: snList.length });
    if (typeof autoRefreshActiveView === 'function') autoRefreshActiveView();
}
window.executeBatchRelocate = executeBatchRelocate;

// 🟢 3. ลบสินค้าออกจากคลัง: บันทึกและ Auto Refresh เรียลไทม์
async function executeDeleteAction() {
    let snsToDelete = [];
    if (pendingDeleteMode === 'SINGLE') {
        snsToDelete = [pendingDeleteSn];
    } else if (typeof selectedItemSnSet !== 'undefined') {
        snsToDelete = Array.from(selectedItemSnSet);
    }

    if (snsToDelete.length === 0) return;

    if (currentUser && currentUser.role === 'user') {
        if (typeof createPendingApprovalRequest === 'function') {
            await createPendingApprovalRequest(
                'DELETE', 
                `ขอลบสินค้าออกจากคลัง (${snsToDelete.length} รายการ)`, 
                snsToDelete, 
                { snsToDelete }
            );
        }
        if (typeof closeDeleteConfirmModal === 'function') closeDeleteConfirmModal();
        if (typeof selectedItemSnSet !== 'undefined') selectedItemSnSet.clear();
        if (typeof updateSelectedCountUI === 'function') updateSelectedCountUI();
        if (typeof autoRefreshActiveView === 'function') autoRefreshActiveView();
        return;
    }

    if (typeof globalInventoryData !== 'undefined') {
        globalInventoryData = globalInventoryData.filter(i => !snsToDelete.includes(i.sn));
    }
    if (typeof rebuildOccupiedSet === 'function') rebuildOccupiedSet();

    if (navigator.onLine && typeof _supabase !== 'undefined' && _supabase) {
        try {
            await _supabase.from('warehouse_items').delete().in('sn', snsToDelete);
        } catch (e) {}
    }

    if (typeof closeDeleteConfirmModal === 'function') closeDeleteConfirmModal();
    if (typeof selectedItemSnSet !== 'undefined') selectedItemSnSet.clear();
    if (typeof refreshLocationVisualizerIfActive === 'function') refreshLocationVisualizerIfActive();
    if (typeof playSuccessSound === 'function') playSuccessSound();
    if (typeof showToast === 'function') showToast(`🗑️ ลบสินค้าออกจากระบบ ${snsToDelete.length} รายการเรียบร้อย`);
    if (typeof logUserActivity === 'function') await logUserActivity('DELETE', `ลบสินค้าออกจากระบบ (${snsToDelete.length} รายการ)`, snsToDelete.join(', '));

    // Auto Refresh หน้าจอและข้อมูลทันที
    if (typeof notifyWmsDataChanged === 'function') notifyWmsDataChanged('DELETE_ITEMS', { count: snsToDelete.length, deleteSns: snsToDelete });
    if (typeof autoRefreshActiveView === 'function') autoRefreshActiveView();
}
window.executeDeleteAction = executeDeleteAction;

// 🟢 4. การเบิกจ่ายสินค้าออก (Outbound / Stock Out): ตัดสต็อกและ Auto Refresh เรียลไทม์ทันที
async function submitOutboundSuccess(outboundItem) {
    if (!outboundItem || !outboundItem.sn) return;

    const sn = outboundItem.sn;
    if (typeof globalInventoryData !== 'undefined') {
        globalInventoryData = globalInventoryData.filter(i => String(i.sn).toLowerCase() !== String(sn).toLowerCase());
    }

    if (typeof autoRefreshActiveView === 'function') autoRefreshActiveView();

    if (typeof notifyWmsDataChanged === 'function') {
        notifyWmsDataChanged('OUTBOUND', { sn, item: outboundItem });
    }
}
window.submitOutboundSuccess = submitOutboundSuccess;

document.addEventListener('DOMContentLoaded', async () => {
    initThemeSystem();
    if (typeof initOfflineSyncEngine === 'function') initOfflineSyncEngine();
    initKeyboardShortcuts();

    populateAisleDropdowns();

    const activeView = (typeof getCurrentActiveView === 'function') 
        ? getCurrentActiveView() 
        : (localStorage.getItem('WMS_LAST_ACTIVE_VIEW') || 'view-inventory');

    if (typeof switchView === 'function') {
        switchView(activeView);
    }

    if (typeof initAuthSystem === 'function') await initAuthSystem();
    if (typeof loadDataFromDatabase === 'function') await loadDataFromDatabase();
    if (typeof loadWarehouseConfigsFromDB === 'function') await loadWarehouseConfigsFromDB();
    if (typeof loadOutboundHistoryFromDB === 'function') await loadOutboundHistoryFromDB();
    if (typeof currentUser !== 'undefined' && currentUser && currentUser.role === 'admin') {
        if (typeof loadPendingApprovalsFromDB === 'function') await loadPendingApprovalsFromDB();
    }

    populateAisleDropdowns();
    if (typeof onInboundAisleOrBayChange === 'function') onInboundAisleOrBayChange();

    if (typeof autoRefreshActiveView === 'function') {
        autoRefreshActiveView();
    }
});