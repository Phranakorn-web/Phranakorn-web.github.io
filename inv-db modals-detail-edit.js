// =========================================================================
// 📌 [ส่วนที่ 4] WMS MODALS: STOCK DETAIL & EDIT ITEM ENGINE
// =========================================================================

// ... Keep existing code ...
// (Ensure saveEditedItemData emits realtime notifications)

async function saveEditedItemData() {
    const id = document.getElementById('editModalItemId')?.value;
    const currentSn = window.currentEditingItemSn;

    const newCat = (document.getElementById('editModalCategory')?.value || '').trim();
    const newName = (document.getElementById('editModalName')?.value || '').trim();
    const newMeter = parseFloat(document.getElementById('editModalMeter')?.value) || 0;

    const item = globalInventoryData.find(i => 
        (id && String(i.id) === String(id)) || 
        (currentSn && String(i.sn).toLowerCase() === String(currentSn).toLowerCase())
    );

    if (!item) {
        alert('❌ ไม่พบรายการสินค้าที่ต้องการบันทึกในระบบ');
        return;
    }

    item.category = newCat || item.category;
    item.name = newName || item.name;
    item.meter = newMeter;

    const client = getSupabaseClient();
    if (client && item.id && !item._pending) {
        try {
            await client.from('warehouse_items').update({
                category: item.category,
                name: item.name,
                meter: item.meter
            }).eq('id', item.id);
        } catch (e) {
            console.error('Supabase update error:', e);
        }
    }

    rebuildOccupiedSet();
    populateStockFilterDropdowns();
    filterInventoryData();
    if (typeof updateKPIs === 'function') updateKPIs();
    refreshStockDetailModalIfActive();
    closeEditItemModal();

    // แจ้งอัปเดตระบบอัตโนมัติ Realtime
    if (typeof notifyWmsDataChanged === 'function') {
        notifyWmsDataChanged('EDIT_ITEM', { sn: item.sn, category: item.category, name: item.name });
    }

    if (typeof showToast === 'function') {
        showToast(`✅ อัปเดตข้อมูลสินค้า S/N: ${item.sn} เรียบร้อยแล้ว`);
    } else {
        alert(`✅ อัปเดตข้อมูลสินค้า S/N: ${item.sn} เรียบร้อยแล้ว`);
    }
}