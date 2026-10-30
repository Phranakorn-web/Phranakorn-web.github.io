// =========================================================================
// 📌 [ส่วนที่ 5] WMS MODALS: RELOCATION & FAST REAL-TIME DELETE ENGINE
// =========================================================================

// -------------------------------------------------------------------------
// 🚚 BATCH RELOCATE SYSTEM
// -------------------------------------------------------------------------
function buildFreshBatchRelocateModalDOM() {
    const existing = document.getElementById('batchRelocateModal');
    if (existing) existing.remove();

    const modal = document.createElement('div');
    modal.id = 'batchRelocateModal';
    modal.className = 'modal-overlay';
    modal.style.setProperty('display', 'none', 'important');
    modal.style.setProperty('position', 'fixed', 'important');
    modal.style.setProperty('top', '0', 'important');
    modal.style.setProperty('left', '0', 'important');
    modal.style.setProperty('width', '100vw', 'important');
    modal.style.setProperty('height', '100vh', 'important');
    modal.style.setProperty('background', 'rgba(15, 23, 42, 0.75)', 'important');
    modal.style.setProperty('z-index', '99999999', 'important');
    modal.style.setProperty('align-items', 'center', 'important');
    modal.style.setProperty('justify-content', 'center', 'important');
    modal.style.setProperty('backdrop-filter', 'blur(4px)', 'important');
    modal.style.setProperty('padding', '16px', 'important');
    modal.style.setProperty('box-sizing', 'border-box', 'important');

    const discoveredAisles = discoverAllDatabaseAisles();
    let aisleOptionsHtml = '';
    discoveredAisles.forEach(a => {
        const label = formatAisleBayLabel(a);
        aisleOptionsHtml += `<option value="${escapeHTML(a)}">${escapeHTML(label)}</option>`;
    });

    modal.innerHTML = `
        <div class="modal-content" style="
            background: #ffffff !important; border-radius: 12px !important;
            max-width: 540px !important; width: 95% !important;
            display: flex !important; flex-direction: column !important;
            box-shadow: 0 20px 25px -5px rgba(0, 0, 0, 0.2) !important;
            border: 1px solid #cbd5e1 !important; overflow: hidden !important;
            font-family: system-ui, -apple-system, sans-serif !important;
            animation: fadeInModal 0.15s ease-out !important;
        ">
            <div style="
                padding: 16px 20px !important; border-bottom: 1px solid #e2e8f0 !important;
                display: flex !important; justify-content: space-between !important; align-items: center !important;
                background: #f8fafc !important;
            ">
                <h3 style="margin:0 !important; font-size:1.1rem !important; color:#0f172a !important; font-weight:800 !important; display:flex !important; align-items:center !important; gap:8px !important;">
                    <i class="fa-solid fa-right-left" style="color:#2563eb !important;"></i> ย้ายพิกัดจัดเก็บสินค้าแบบกลุ่ม
                </h3>
                <button type="button" onclick="closeBatchRelocateModal()" style="
                    background: transparent !important; border: none !important; font-size: 1.3rem !important; cursor: pointer !important; color: #64748b !important; line-height: 1 !important;
                ">&times;</button>
            </div>

            <div style="padding:20px !important; display:flex !important; flex-direction:column !important; gap:14px !important; background:#ffffff !important;">
                <div style="background:#f8fafc !important; padding:12px !important; border-radius:8px !important; border:1px solid #cbd5e1 !important;">
                    <div style="font-size:0.85rem !important; color:#334155 !important; font-weight:700 !important; display:flex !important; justify-content:space-between !important; align-items:center !important;">
                        <span>📦 จำนวนสินค้าที่เลือกย้าย:</span>
                        <strong id="batchRelocateTotalCount" style="color:#2563eb !important; font-size:1.05rem !important; background:#eff6ff !important; padding:2px 8px !important; border-radius:4px !important; font-family:monospace !important; border:1px solid #bfdbfe !important;">0</strong>
                    </div>
                    <div id="batchRelocateCapacityBadge" style="margin-top:6px !important; font-size:0.75rem !important; color:#64748b !important;"></div>
                </div>

                <div style="font-weight:700 !important; font-size:0.85rem !important; color:#0f172a !important;">📍 เลือกแถว/โซนเป้าหมายสำหรับกระจายลงล็อกว่างอัตโนมัติ:</div>
                <div style="display:grid !important; grid-template-columns:1fr 1fr !important; gap:8px !important;">
                    <div>
                        <label style="font-size:0.78rem !important; font-weight:600 !important; color:#334155 !important; margin-bottom:4px !important; display:block !important;">เลือกแถว/โซน (DB Aisles):</label>
                        <select id="batchRelocateSelectAisle" onchange="updateBatchRelocateCapacityPreview()" style="width:100% !important; padding:8px 10px !important; font-size:0.85rem !important; border-radius:6px !important; border:1px solid #cbd5e1 !important; background:#fff !important; font-weight:600 !important; color:#0f172a !important; cursor:pointer !important;">
                            ${aisleOptionsHtml}
                        </select>
                    </div>
                    <div>
                        <label style="font-size:0.78rem !important; font-weight:600 !important; color:#334155 !important; margin-bottom:4px !important; display:block !important;">โหมดจัดสรรพิกัด:</label>
                        <input type="text" value="จัดสรรช่องว่างอัตโนมัติ" readonly style="width:100% !important; padding:8px 10px !important; font-size:0.8rem !important; border-radius:6px !important; border:1px solid #cbd5e1 !important; background:#f1f5f9 !important; color:#475569 !important; font-weight:600 !important; cursor:not-allowed !important;">
                    </div>
                </div>

                <div>
                    <label style="font-weight:700 !important; font-size:0.82rem !important; color:#334155 !important; margin-bottom:4px !important; display:block !important;">หรือระบุพิกัดเป้าหมายเดี่ยวสำหรับใช้ร่วมกันทุกรายการ:</label>
                    <input type="text" id="batchRelocateCustomLocInput" style="width:100% !important; padding:8px 10px !important; font-size:0.88rem !important; font-family:monospace !important; text-transform:uppercase !important; font-weight:700 !important; border:1px solid #cbd5e1 !important; border-radius:6px !important; box-sizing:border-box !important;" placeholder="เช่น A-01-1-01 (เว้นว่างไว้เพื่อใช้อัตโนมัติ)">
                </div>
            </div>

            <div style="
                padding: 14px 20px !important; border-top: 1px solid #e2e8f0 !important;
                display: flex !important; justify-content: flex-end !important; gap: 8px !important; background: #f8fafc !important;
            ">
                <button type="button" onclick="closeBatchRelocateModal()" style="border-radius:6px !important; font-weight:600 !important; padding:7px 16px !important; font-size:0.82rem !important; background:#e2e8f0 !important; color:#334155 !important; border:none !important; cursor:pointer !important;">ยกเลิก</button>
                <button type="button" onclick="executeBatchRelocateFromModal()" style="border-radius:6px !important; font-weight:700 !important; padding:7px 20px !important; font-size:0.82rem !important; background:#2563eb !important; color:#ffffff !important; border:none !important; cursor:pointer !important;"><i class="fa-solid fa-check"></i> ยืนยันย้ายพิกัดกลุ่ม</button>
            </div>
        </div>
    `;

    document.body.appendChild(modal);
}

function requestBatchRelocateModal() {
    if (selectedItemSnSet.size === 0) {
        if (typeof showToast === 'function') showToast("⚠️ กรุณาเลือกรายการสินค้าอย่างน้อย 1 รายการเพื่อย้ายพิกัดกลุ่ม", true);
        else alert("⚠️ กรุณาเลือกรายการสินค้าอย่างน้อย 1 รายการเพื่อย้ายพิกัดกลุ่ม");
        return;
    }

    buildFreshBatchRelocateModalDOM();

    const countElem = document.getElementById('batchRelocateTotalCount');
    if (countElem) countElem.textContent = selectedItemSnSet.size.toLocaleString();

    updateBatchRelocateCapacityPreview();

    const modal = document.getElementById('batchRelocateModal');
    if (modal) modal.style.setProperty('display', 'flex', 'important');
}

function closeBatchRelocateModal() {
    const modal = document.getElementById('batchRelocateModal');
    if (modal) modal.style.setProperty('display', 'none', 'important');
}

function updateBatchRelocateCapacityPreview() {
    const aisleSel = document.getElementById('batchRelocateSelectAisle');
    const badge = document.getElementById('batchRelocateCapacityBadge');
    if (!aisleSel || !badge) return;

    const targetAisle = aisleSel.value;
    const capInfo = calculateAisleCapacityInfo(targetAisle);

    if (capInfo.isUnlimited) {
        badge.innerHTML = `<i class="fa-solid fa-info-circle" style="color:#2563eb;"></i> พื้นที่ไม่จำกัดความจุ (${targetAisle})`;
    } else {
        const req = selectedItemSnSet.size;
        if (capInfo.available >= req) {
            badge.innerHTML = `<i class="fa-solid fa-circle-check" style="color:#10b981;"></i> แถว ${targetAisle} เหลือพื้นที่ว่าง <strong style="color:#10b981;">${capInfo.available}</strong> ช่อง (เพียงพอสำหรับ ${req} เครื่อง)`;
        } else {
            badge.innerHTML = `<i class="fa-solid fa-triangle-exclamation" style="color:#dc2626;"></i> คำเตือน: แถว ${targetAisle} เหลือพื้นที่ว่างเพียง <strong style="color:#dc2626;">${capInfo.available}</strong> ช่อง (ไม่พอสำหรับ ${req} เครื่อง)`;
        }
    }
}

async function executeBatchRelocateFromModal() {
    if (selectedItemSnSet.size === 0) return;

    const aisleSel = document.getElementById('batchRelocateSelectAisle');
    const customInp = document.getElementById('batchRelocateCustomLocInput');

    const targetAisle = aisleSel ? aisleSel.value : 'A';
    const customLoc = customInp ? customInp.value.trim().toUpperCase() : '';

    if (customLoc) {
        const targetCoords = Array(selectedItemSnSet.size).fill(customLoc);
        await executeBatchRelocate(customLoc, targetCoords);
    } else {
        await executeBatchRelocate(targetAisle);
    }

    closeBatchRelocateModal();
}

async function executeBatchRelocate(targetAisle, targetCoords = null) {
    if (selectedItemSnSet.size === 0) return;

    const selectSns = Array.from(selectedItemSnSet);
    const coords = targetCoords || calculateBatchRelocateTargetCoordinates(targetAisle, selectSns.length);

    const client = getSupabaseClient();

    for (let i = 0; i < selectSns.length; i++) {
        const sn = selectSns[i];
        const newLoc = coords[i] || targetAisle;

        const liveItem = globalInventoryData.find(item => String(item.sn).toLowerCase() === String(sn).toLowerCase());
        if (liveItem) {
            liveItem.location = newLoc;
            if (client && liveItem.id && !liveItem._pending) {
                try {
                    await client.from('warehouse_items').update({ location: newLoc }).eq('id', liveItem.id);
                } catch (e) {}
            }
        }
    }

    selectedItemSnSet.clear();
    rebuildOccupiedSet();
    populateStockFilterDropdowns();
    filterInventoryData();
    if (typeof updateKPIs === 'function') updateKPIs();
    refreshStockDetailModalIfActive();

    // แจ้งอัปเดตระบบอัตโนมัติ Realtime
    if (typeof notifyWmsDataChanged === 'function') {
        notifyWmsDataChanged('BATCH_RELOCATE', { targetAisle, count: selectSns.length });
    }

    if (typeof showToast === 'function') {
        showToast(`🚚 ย้ายพิกัดสินค้าจำนวน ${selectSns.length} รายการ ไปยัง [${targetAisle}] สำเร็จเรียบร้อยแล้ว`);
    }
}

function relocateSelectedFromModal() {
    closeStockDetailModal();
    setTimeout(() => {
        requestBatchRelocateModal();
    }, 100);
}

// -------------------------------------------------------------------------
// 🔄 SINGLE RELOCATE MODAL
// -------------------------------------------------------------------------
function populateRelocateAisleDropdown() {
    const aisleSel = document.getElementById('relocateSelectAisle');
    if (!aisleSel) return;

    const discoveredAisles = discoverAllDatabaseAisles();
    let optionsHtml = '';

    discoveredAisles.forEach(a => {
        const label = formatAisleBayLabel(a);
        optionsHtml += `<option value="${escapeHTML(a)}">${escapeHTML(label)}</option>`;
    });

    aisleSel.innerHTML = optionsHtml;
}

function ensureRelocateModalExists() {
    let modal = document.getElementById('relocateItemModal');
    if (!modal) {
        modal = document.createElement('div');
        modal.id = 'relocateItemModal';
        modal.className = 'modal-overlay';
        modal.style.cssText = `
            display: none; position: fixed; top: 0; left: 0; width: 100%; height: 100%;
            background: rgba(15, 23, 42, 0.75); z-index: 100005;
            align-items: center; justify-content: center; backdrop-filter: blur(4px);
            padding: 16px; box-sizing: border-box;
        `;
        modal.innerHTML = `
            <div class="modal-content" style="
                background: #ffffff; border-radius: 12px; max-width: 520px; width: 95%;
                display: flex; flex-direction: column; box-shadow: 0 20px 25px -5px rgba(0, 0, 0, 0.2);
                border: 1px solid #cbd5e1; overflow: hidden;
            ">
                <div class="modal-header" style="
                    padding: 14px 20px; border-bottom: 1px solid #e2e8f0;
                    display: flex; justify-content: space-between; align-items: center; background: #f8fafc;
                ">
                    <h3 style="margin:0; font-size:1.1rem; color:#0f172a; font-weight:800; display:flex; align-items:center; gap:8px;">
                        <i class="fa-solid fa-right-left" style="color:#2563eb;"></i> ย้ายพิกัดจัดเก็บสินค้า
                    </h3>
                    <button type="button" onclick="closeRelocateModal()" style="background:transparent; border:none; font-size:1.2rem; cursor:pointer; color:#64748b;">&times;</button>
                </div>
                <div class="modal-body" style="padding:18px; display:flex; flex-direction:column; gap:12px;">
                    <div style="background:#f8fafc; padding:10px 12px; border-radius:8px; border:1px solid #cbd5e1; font-size:0.82rem;">
                        <div>S/N: <strong id="relocateModalSn" class="mono" style="color:#2563eb;"></strong></div>
                        <div style="margin-top:3px;">ชื่อรุ่น: <strong id="relocateModalName"></strong></div>
                        <div style="margin-top:3px;">พิกัดปัจจุบัน: <span id="relocateModalCurrentLoc" class="badge-location mono"></span></div>
                    </div>

                    <div style="font-weight:700; font-size:0.82rem; color:#0f172a;">📍 เลือกย้ายพิกัดตามแถวที่มีในฐานข้อมูล / ล็อก / ชั้น / ช่อง:</div>
                    <div style="display:grid; grid-template-columns:1fr 1fr; gap:8px;">
                        <div class="form-group">
                            <label style="font-size:0.78rem; font-weight:600; margin-bottom:2px; display:block;">แถว (Aisle ใน Config/DB):</label>
                            <select id="relocateSelectAisle" class="form-control" onchange="updateRelocateLocPreviewFromSelects()" style="padding:7px; font-size:0.82rem; border-radius:6px; border:1px solid #cbd5e1; font-weight:600;">
                            </select>
                        </div>
                        <div class="form-group">
                            <label style="font-size:0.78rem; font-weight:600; margin-bottom:2px; display:block;">ล็อก (Bay):</label>
                            <select id="relocateSelectBay" class="form-control" onchange="updateRelocateLocPreviewFromSelects()" style="padding:7px; font-size:0.82rem; border-radius:6px; border:1px solid #cbd5e1;">
                            </select>
                        </div>
                        <div class="form-group">
                            <label style="font-size:0.78rem; font-weight:600; margin-bottom:2px; display:block;">ชั้น (Shelf):</label>
                            <select id="relocateSelectShelf" class="form-control" onchange="updateRelocateSlotOptionsWithStatus()" style="padding:7px; font-size:0.82rem; border-radius:6px; border:1px solid #cbd5e1;">
                            </select>
                        </div>
                        <div class="form-group">
                            <label style="font-size:0.78rem; font-weight:600; margin-bottom:2px; display:block;">ช่อง (Slot):</label>
                            <select id="relocateSelectSlot" class="form-control" onchange="updateRelocateCustomLocOnly()" style="padding:7px; font-size:0.82rem; border-radius:6px; border:1px solid #cbd5e1;">
                            </select>
                        </div>
                    </div>

                    <div class="form-group">
                        <label style="font-weight:700; font-size:0.82rem; margin-bottom:3px; display:block;">หรือระบุพิกัดตรง / ปรับแต่งเอง (Custom Location):</label>
                        <input type="text" id="relocateTargetLocInput" class="form-control" style="padding:8px 10px; font-size:0.88rem; font-family:monospace; text-transform:uppercase; font-weight:700; border-radius:6px; border:1px solid #cbd5e1;" placeholder="เช่น A-01-1-01">
                    </div>
                </div>
                <div class="modal-footer" style="padding:12px 20px; border-top:1px solid #e2e8f0; display:flex; justify-content:flex-end; gap:8px; background:#f8fafc;">
                    <button type="button" class="btn btn-secondary" onclick="closeRelocateModal()" style="border-radius:6px; font-weight:600; padding:6px 14px; font-size:0.8rem;">ยกเลิก</button>
                    <button type="button" class="btn btn-primary" onclick="executeSingleRelocate()" style="border-radius:6px; font-weight:700; padding:6px 18px; font-size:0.8rem;"><i class="fa-solid fa-check"></i> ยืนยันย้ายพิกัด</button>
                </div>
            </div>
        `;
        document.body.appendChild(modal);
    }
}

function updateRelocateSlotOptionsWithStatus() {
    const aisle = document.getElementById('relocateSelectAisle')?.value || 'A';
    const bay = document.getElementById('relocateSelectBay')?.value || '01';
    const shelf = document.getElementById('relocateSelectShelf')?.value || '1';
    const slotSel = document.getElementById('relocateSelectSlot');
    if (!slotSel) return;

    const configs = window.aisleConfigs || {};
    const cfg = configs[aisle] || (typeof getAisleConfig === 'function' ? getAisleConfig(aisle) : { slots: 10 });
    const maxSlots = parseInt(cfg.slots || cfg.slot) || 10;

    let optionsHtml = '';
    let firstAvailableSlot = null;

    for (let sl = 1; sl <= maxSlots; sl++) {
        const slotStr = String(sl).padStart(2, '0');
        const locCode = `${aisle}-${bay}-${shelf}-${slotStr}`;
        const normCode = normalizeLoc(locCode);

        const occupyingItem = globalInventoryData.find(i => {
            if (!i || !i.location) return false;
            const itemNorm = normalizeLoc(i.location);
            return itemNorm === normCode || i.location.toUpperCase() === locCode;
        });

        if (occupyingItem) {
            optionsHtml += `<option value="${slotStr}" style="color:#dc2626; font-weight:700;">ช่อง S${slotStr} (❌ มี S/N: ${escapeHTML(occupyingItem.sn)})</option>`;
        } else {
            if (!firstAvailableSlot) firstAvailableSlot = slotStr;
            optionsHtml += `<option value="${slotStr}" style="color:#10b981; font-weight:700;">ช่อง S${slotStr} (✨ ว่าง)</option>`;
        }
    }

    slotSel.innerHTML = optionsHtml;
    if (firstAvailableSlot) slotSel.value = firstAvailableSlot;
    updateRelocateCustomLocOnly();
}

function updateRelocateLocPreviewFromSelects() {
    const aisle = document.getElementById('relocateSelectAisle')?.value || 'A';
    const baySel = document.getElementById('relocateSelectBay');
    const shelfSel = document.getElementById('relocateSelectShelf');

    const configs = window.aisleConfigs || {};
    const cfg = configs[aisle] || (typeof getAisleConfig === 'function' ? getAisleConfig(aisle) : { bays: 10, shelves: 1, slots: 10 });

    const maxBays = parseInt(cfg.bays || cfg.bay) || 10;
    const maxShelves = parseInt(cfg.shelves || cfg.shelf) || 1;

    if (baySel) {
        const currentBayVal = baySel.value;
        let opts = '';
        for (let i = 1; i <= maxBays; i++) {
            const val = String(i).padStart(2, '0');
            opts += `<option value="${val}">ล็อก ${val}</option>`;
        }
        baySel.innerHTML = opts;
        if (currentBayVal && parseInt(currentBayVal, 10) <= maxBays) {
            baySel.value = String(parseInt(currentBayVal, 10)).padStart(2, '0');
        }
    }

    if (shelfSel) {
        const currentShelfVal = shelfSel.value;
        let opts = '';
        for (let s = 1; s <= maxShelves; s++) {
            opts += `<option value="${s}">ชั้น ${s}</option>`;
        }
        shelfSel.innerHTML = opts;
        if (currentShelfVal && parseInt(currentShelfVal, 10) <= maxShelves) {
            shelfSel.value = currentShelfVal;
        }
    }

    const bay = baySel?.value || '01';
    const freeSlot = findFirstAvailableSlotInAisleBay(aisle, bay);

    if (shelfSel && freeSlot && freeSlot.shelf) {
        if (parseInt(freeSlot.shelf, 10) <= maxShelves) {
            shelfSel.value = freeSlot.shelf;
        }
    }

    updateRelocateSlotOptionsWithStatus();
}

function updateRelocateCustomLocOnly() {
    const aisle = document.getElementById('relocateSelectAisle')?.value || 'A';
    const bay = document.getElementById('relocateSelectBay')?.value || '01';
    const shelf = document.getElementById('relocateSelectShelf')?.value || '1';
    const slot = document.getElementById('relocateSelectSlot')?.value || '01';

    const input = document.getElementById('relocateTargetLocInput');
    if (input) {
        if (['DOCK', 'OFFICE', 'PENDING', 'FOOD', 'FREEZER', 'COLD', 'DRY', 'RAW'].includes(aisle)) {
            input.value = aisle;
        } else {
            input.value = `${aisle}-${bay}-${shelf}-${slot}`;
        }
    }
}

function requestRelocateModal(id, sn, name, location) {
    const targetIdClean = (id !== undefined && id !== null && String(id) !== 'undefined' && String(id) !== 'null') ? String(id).trim() : '';
    const targetSnClean = (sn !== undefined && sn !== null && String(sn) !== 'undefined' && String(sn) !== 'null') ? String(sn).trim().toLowerCase() : '';

    const item = globalInventoryData.find(i => 
        (targetIdClean && String(i.id).trim() === targetIdClean) || 
        (targetSnClean && String(i.sn).trim().toLowerCase() === targetSnClean)
    ) || { id: targetIdClean, sn: rawSnOriginal(sn), name, location };

    window.pendingRelocateItem = item;

    ensureRelocateModalExists();
    populateRelocateAisleDropdown();

    const snElem = document.getElementById('relocateModalSn');
    const nameElem = document.getElementById('relocateModalName');
    const curLocElem = document.getElementById('relocateModalCurrentLoc');

    if (snElem) snElem.textContent = item.sn || '-';
    if (nameElem) nameElem.textContent = item.name || '-';
    if (curLocElem) curLocElem.textContent = typeof formatLocationCode === 'function' ? formatLocationCode(item.location) : (item.location || '-');

    const currentAisle = extractAisleKey(item.location);
    const aisleSel = document.getElementById('relocateSelectAisle');
    if (aisleSel && currentAisle) {
        const optionExists = Array.from(aisleSel.options).some(o => o.value === currentAisle);
        if (optionExists) aisleSel.value = currentAisle;
    }

    updateRelocateLocPreviewFromSelects();

    const modal = document.getElementById('relocateItemModal');
    if (modal) {
        modal.style.zIndex = '100005';
        modal.style.display = 'flex';
    }
}

function rawSnOriginal(snVal) {
    return (snVal !== undefined && snVal !== null && String(snVal) !== 'undefined' && String(snVal) !== 'null') ? String(snVal) : '';
}

function closeRelocateModal() {
    const modal = document.getElementById('relocateItemModal');
    if (modal) modal.style.display = 'none';
}

async function executeSingleRelocate() {
    const item = window.pendingRelocateItem;
    const newLoc = (document.getElementById('relocateTargetLocInput')?.value || '').trim().toUpperCase();

    if (!item || !newLoc) {
        if (typeof showToast === 'function') showToast('⚠️ กรุณาระบุพิกัดเป้าหมายใหม่', true);
        else alert('⚠️ กรุณาระบุพิกัดเป้าหมายใหม่');
        return;
    }

    const liveItem = globalInventoryData.find(i => String(i.id) === String(item.id) || String(i.sn).toLowerCase() === String(item.sn).toLowerCase());
    if (liveItem) liveItem.location = newLoc;

    const client = getSupabaseClient();
    if (client && item.id && !item._pending) {
        try {
            await client.from('warehouse_items').update({ location: newLoc }).eq('id', item.id);
        } catch (e) {}
    }

    rebuildOccupiedSet();
    populateStockFilterDropdowns();
    filterInventoryData();
    if (typeof updateKPIs === 'function') updateKPIs();
    refreshStockDetailModalIfActive();
    closeRelocateModal();

    // แจ้งอัปเดตระบบอัตโนมัติ Realtime
    if (typeof notifyWmsDataChanged === 'function') {
        notifyWmsDataChanged('SINGLE_RELOCATE', { sn: item.sn, newLoc });
    }

    if (typeof showToast === 'function') {
        showToast(`🚚 ย้ายพิกัด S/N: ${item.sn} ไปยัง [${newLoc}] เรียบร้อยแล้ว`);
    }
}

// -------------------------------------------------------------------------
// 🗑️ REAL-TIME ULTRA-FAST DELETE SYSTEM (SINGLE & BATCH)
// -------------------------------------------------------------------------
function ensureDeleteConfirmModalExists() {
    let modal = document.getElementById('deleteConfirmModal');
    if (modal) modal.remove();

    modal = document.createElement('div');
    modal.id = 'deleteConfirmModal';
    modal.className = 'modal-overlay';
    modal.style.cssText = `
        display: none; position: fixed; top: 0; left: 0; width: 100vw; height: 100vh;
        background: rgba(15, 23, 42, 0.82); z-index: 9999999;
        align-items: center; justify-content: center; backdrop-filter: blur(5px);
        padding: 16px; box-sizing: border-box;
    `;
    modal.innerHTML = `
        <div class="modal-content" style="
            background: #ffffff; border-radius: 14px; max-width: 520px; width: 95%;
            display: flex; flex-direction: column; box-shadow: 0 25px 50px -12px rgba(0, 0, 0, 0.35);
            border: 1px solid #fca5a5; overflow: hidden; animation: fadeInModal 0.15s ease-out;
            font-family: system-ui, -apple-system, sans-serif;
        ">
            <div class="modal-header" style="
                padding: 14px 18px; border-bottom: 1px solid #fecdd3;
                display: flex; justify-content: space-between; align-items: center; background: #fff1f2;
            ">
                <h3 id="deleteModalHeaderTitle" style="margin:0; font-size:1.05rem; color:#dc2626; font-weight:800; display:flex; align-items:center; gap:8px;">
                    <i class="fa-solid fa-triangle-exclamation"></i> ยืนยันการลบสินค้าออกจากฐานข้อมูล
                </h3>
                <button type="button" onclick="closeDeleteConfirmModal()" style="background:transparent; border:none; font-size:1.3rem; cursor:pointer; color:#64748b; line-height:1;">&times;</button>
            </div>
            <div class="modal-body" style="padding:20px; text-align:center; background:#fff;">
                <i id="deleteModalIcon" class="fa-solid fa-trash-can-arrow-up" style="font-size:2.8rem; color:#dc2626; margin-bottom:12px;"></i>
                <div id="deleteConfirmModalDetails" style="font-size:0.92rem; color:#0f172a; line-height:1.4;"></div>
                <div style="margin-top:14px; font-size:0.78rem; color:#64748b; background:#f8fafc; padding:8px 12px; border-radius:6px; border:1px solid #cbd5e1;">
                    ผู้ทำรายการ: <strong id="deleteModalUserSpan" style="color:#0f172a;">${escapeHTML(getCurrentReceiverName())}</strong>
                    <span id="deleteModalUserRoleBadge" style="margin-left:6px; font-size:0.7rem; padding:2px 6px; border-radius:4px; background:#e2e8f0; color:#334155; font-weight:700;"></span>
                </div>
            </div>
            <div class="modal-footer" style="padding:12px 18px; border-top:1px solid #e2e8f0; display:flex; justify-content:flex-end; align-items:center; gap:8px; flex-wrap:wrap; background:#f8fafc;">
                <button type="button" class="btn btn-secondary" onclick="closeDeleteConfirmModal()" style="border-radius:6px; font-weight:600; padding:8px 16px; font-size:0.82rem; cursor:pointer;">ยกเลิก</button>
                <button type="button" id="btnConfirmDeleteExecute" class="btn btn-danger" onclick="executeDeleteAction(event)" style="border-radius:6px; font-weight:700; padding:8px 18px; font-size:0.82rem; background:#dc2626; border-color:#dc2626; color:#ffffff; cursor:pointer;"><i class="fa-solid fa-trash-can"></i> ยืนยันลบออกจาก DB ทันที</button>
            </div>
        </div>
    `;
    document.body.appendChild(modal);
}

function requestDeleteModal(mode, sn = null, id = null, event = null) {
    if (event && typeof event.stopPropagation === 'function') {
        event.stopPropagation();
    }

    if (mode === 'BATCH' && selectedItemSnSet.size === 0) {
        if (typeof showToast === 'function') showToast("⚠️ กรุณาติ๊กเลือกรายการที่ต้องการลบในคอลัมน์ด้านหน้าก่อนกดปุ่มลบกลุ่ม", true);
        else alert("⚠️ กรุณาติ๊กเลือกรายการที่ต้องการลบในคอลัมน์ด้านหน้าก่อนกดปุ่มลบกลุ่ม");
        return;
    }

    const cleanSn = (sn !== null && sn !== undefined && String(sn) !== 'null' && String(sn) !== 'undefined' && String(sn).trim() !== '') ? String(sn).trim() : null;
    const cleanId = (id !== null && id !== undefined && String(id) !== 'null' && String(id) !== 'undefined' && String(id).trim() !== '') ? String(id).trim() : null;

    window.pendingDeleteMode = mode || 'SINGLE';
    window.pendingDeleteSn = cleanSn;
    window.pendingDeleteId = cleanId;

    ensureDeleteConfirmModalExists();

    const modal = document.getElementById('deleteConfirmModal');
    const details = document.getElementById('deleteConfirmModalDetails');
    const userSpan = document.getElementById('deleteModalUserSpan');
    const userRoleSpan = document.getElementById('deleteModalUserRoleBadge');

    const role = getCurrentUserRole();
    const isAdmin = (role === 'admin' || role === 'administrator' || role === 'ผู้ดูแลระบบ');

    if (userSpan) userSpan.textContent = getCurrentReceiverName();

    if (userRoleSpan) {
        userRoleSpan.textContent = isAdmin ? 'ADMIN' : 'USER';
        userRoleSpan.style.background = isAdmin ? '#dcfce7' : '#ffedd5';
        userRoleSpan.style.color = isAdmin ? '#15803d' : '#c2410c';
    }

    if (details) {
        if (mode === 'SINGLE') {
            const cleanSnLower = cleanSn ? cleanSn.toLowerCase() : '';
            const item = globalInventoryData.find(i => {
                const iId = (i && i.id !== undefined && i.id !== null) ? String(i.id).trim() : '';
                const iSn = (i && i.sn !== undefined && i.sn !== null) ? String(i.sn).trim().toLowerCase() : '';
                return (cleanId && iId === cleanId) || (cleanSnLower && iSn === cleanSnLower);
            });

            const displaySn = item ? item.sn : (cleanSn || 'ไม่ระบุ');
            const itemCat = item ? (item.category || '-') : '-';
            const itemName = item ? (item.name || '-') : '-';
            const itemLoc = item ? (typeof formatLocationCode === 'function' ? formatLocationCode(item.location) : item.location) : '-';

            details.innerHTML = `
                <div style="text-align:left; background:#f8fafc; padding:14px; border-radius:10px; border:1px solid #cbd5e1; margin-top:8px;">
                    <div style="font-weight:800; font-size:0.88rem; color:#0f172a; margin-bottom:8px; display:flex; align-items:center; gap:6px;">
                        <i class="fa-solid fa-box" style="color:#dc2626;"></i> ยืนยันลบสินค้าเดี่ยวรายการนี้ออกจาก DB:
                    </div>
                    <div style="font-size:0.84rem; color:#334155; line-height:1.5;">
                        <div>หมายเลข S/N: <strong class="mono" style="color:#dc2626; font-size:0.95rem; background:#fee2e2; padding:2px 6px; border-radius:4px; border:1px solid #fca5a5;">${escapeHTML(displaySn)}</strong></div>
                        <div>รหัสสินค้า (SKU): <strong class="mono" style="color:#0f172a;">${escapeHTML(itemCat)}</strong></div>
                        <div>ชื่อรุ่น/สินค้า: <strong>${escapeHTML(itemName)}</strong></div>
                        <div>พิกัดจัดเก็บ: <span class="badge-location mono" style="font-size:0.75rem;">📍 ${escapeHTML(itemLoc)}</span></div>
                    </div>
                </div>
            `;
        } else {
            const deleteSns = Array.from(selectedItemSnSet);
            let snBadgeListHtml = deleteSns.slice(0, 100).map(s => `<span class="mono" style="background:#fee2e2; color:#991b1b; padding:2px 6px; border-radius:4px; font-size:0.75rem; border:1px solid #fca5a5; font-weight:700; display:inline-block;">${escapeHTML(s)}</span>`).join(' ');
            if (deleteSns.length > 100) {
                snBadgeListHtml += ` <span style="font-size:0.75rem; color:#64748b;">...และอีก ${deleteSns.length - 100} รายการ</span>`;
            }

            details.innerHTML = `
                <div style="margin-bottom:8px;">คุณกำลังจะลบสินค้าที่เลือกติ๊กจำนวนรวม <strong class="mono font-bold" style="color:#dc2626; font-size:1.1rem; background:#fee2e2; padding:2px 8px; border-radius:4px;">${selectedItemSnSet.size}</strong> รายการ ออกจากฐานข้อมูล</div>
                <div style="text-align:left; background:#f8fafc; padding:10px 12px; border-radius:8px; border:1px solid #cbd5e1; max-height:140px; overflow-y:auto; display:flex; flex-wrap:wrap; gap:4px;">
                    ${snBadgeListHtml}
                </div>
            `;
        }
    }

    if (modal) {
        modal.style.zIndex = '9999999';
        modal.style.display = 'flex';
    }
}

function closeDeleteConfirmModal() {
    const modal = document.getElementById('deleteConfirmModal');
    if (modal) modal.style.display = 'none';
}

function executeDeleteActionWithMode(actionType) {
    executeDeleteAction();
}

async function executeDeleteAction(event = null) {
    if (event) {
        if (typeof event.preventDefault === 'function') event.preventDefault();
        if (typeof event.stopPropagation === 'function') event.stopPropagation();
    }

    const mode = window.pendingDeleteMode || 'SINGLE';
    const rawSn = window.pendingDeleteSn;
    const rawId = window.pendingDeleteId;

    const btnConfirm = document.getElementById('btnConfirmDeleteExecute');
    if (btnConfirm) {
        btnConfirm.disabled = true;
        btnConfirm.innerHTML = `<i class="fa-solid fa-spinner fa-spin"></i> กำลังลบออกจาก DB...`;
    }

    try {
        if (typeof playActionFeedbackSound === 'function') playActionFeedbackSound('delete');
    } catch (e) {}

    const client = getSupabaseClient();
    let deleteSns = [];
    let deleteIds = [];

    if (mode === 'SINGLE') {
        const targetSnClean = (rawSn !== null && rawSn !== undefined && String(rawSn) !== 'null' && String(rawSn) !== 'undefined') ? String(rawSn).trim() : '';
        const targetIdClean = (rawId !== null && rawId !== undefined && String(rawId) !== 'null' && String(rawId) !== 'undefined') ? String(rawId).trim() : '';
        const targetSnLower = targetSnClean.toLowerCase();

        const matches = globalInventoryData.filter(i => {
            if (!i) return false;
            const iId = (i.id !== undefined && i.id !== null) ? String(i.id).trim() : '';
            const iSn = (i.sn !== undefined && i.sn !== null) ? String(i.sn).trim().toLowerCase() : '';
            return (targetIdClean && iId === targetIdClean) || (targetSnLower && iSn === targetSnLower);
        });

        if (matches.length > 0) {
            matches.forEach(item => {
                if (item.id !== undefined && item.id !== null && String(item.id).trim() !== '') deleteIds.push(String(item.id).trim());
                if (item.sn && String(item.sn).trim() !== '') deleteSns.push(String(item.sn).trim());
            });
        }

        if (targetIdClean && !deleteIds.some(d => String(d) === targetIdClean)) deleteIds.push(targetIdClean);
        if (targetSnClean && !deleteSns.some(s => s.toLowerCase() === targetSnLower)) deleteSns.push(targetSnClean);

    } else if (mode === 'BATCH') {
        deleteSns = Array.from(selectedItemSnSet).map(s => String(s).trim()).filter(Boolean);
        const deleteSnLowerSet = new Set(deleteSns.map(s => s.toLowerCase()));

        deleteIds = globalInventoryData
            .filter(i => i && i.sn && deleteSnLowerSet.has(String(i.sn).trim().toLowerCase()))
            .map(i => i.id)
            .filter(v => v !== undefined && v !== null && String(v).trim() !== '')
            .map(v => String(v).trim());
    }

    const deleteSnLowerSet = new Set(deleteSns.filter(Boolean).map(s => String(s).trim().toLowerCase()));
    const deleteIdSet = new Set(deleteIds.filter(Boolean).map(v => String(v).trim()));

    globalInventoryData = globalInventoryData.filter(i => {
        if (!i) return false;
        const iId = (i.id !== undefined && i.id !== null) ? String(i.id).trim() : '';
        const iSn = (i.sn !== undefined && i.sn !== null) ? String(i.sn).trim().toLowerCase() : '';
        
        const matchId = iId !== '' && deleteIdSet.has(iId);
        const matchSn = iSn !== '' && deleteSnLowerSet.has(iSn);
        return !matchId && !matchSn;
    });

    deleteSnLowerSet.forEach(snVal => {
        selectedItemSnSet.delete(snVal);
        for (let s of Array.from(selectedItemSnSet)) {
            if (String(s).trim().toLowerCase() === snVal) {
                selectedItemSnSet.delete(s);
            }
        }
    });

    if (mode === 'BATCH') selectedItemSnSet.clear();

    try {
        localStorage.setItem('WMS_LOCAL_INVENTORY_CACHE', JSON.stringify(globalInventoryData));
    } catch (e) {}

    closeDeleteConfirmModal();
    rebuildOccupiedSet();
    populateStockFilterDropdowns();
    filterInventoryData();
    if (typeof updateKPIs === 'function') updateKPIs();
    updateSelectedCountUI();
    refreshStockDetailModalIfActive();
    if (typeof refreshLocationVisualizerIfActive === 'function') refreshLocationVisualizerIfActive();

    const totalDeletedCount = Math.max(deleteSns.length, deleteIds.length, 1);
    const labelStr = deleteSns.length > 0 ? deleteSns[0] : (deleteIds[0] ? `ID: ${deleteIds[0]}` : `จำนวน ${totalDeletedCount} รายการ`);

    // แจ้งอัปเดตระบบอัตโนมัติ Realtime
    if (typeof notifyWmsDataChanged === 'function') {
        notifyWmsDataChanged('DELETE_ITEMS', { count: totalDeletedCount, deleteSns });
    }

    const deletedToastText = `🗑️ ลบสินค้า [${labelStr}] ออกจากคลังและฐานข้อมูลเรียบร้อยแล้ว`;
    if (typeof showToast === 'function') {
        showToast(deletedToastText);
    } else {
        alert(deletedToastText);
    }

    if (client) {
        try {
            if (deleteIds.length > 0) {
                const validIds = deleteIds.filter(v => v !== null && v !== undefined && String(v).trim() !== '');
                const numIds = validIds.map(v => Number(v)).filter(n => !isNaN(n) && n > 0);
                const strIds = validIds.map(v => String(v).trim()).filter(s => isNaN(Number(s)) && s !== '');

                if (numIds.length > 0) await client.from('warehouse_items').delete().in('id', numIds);
                if (strIds.length > 0) await client.from('warehouse_items').delete().in('id', strIds);
            }

            if (deleteSns.length > 0) {
                const validSns = deleteSns.filter(s => s && String(s).trim() !== '');
                const allSnVariants = Array.from(new Set([
                    ...validSns,
                    ...validSns.map(s => String(s).trim().toLowerCase()),
                    ...validSns.map(s => String(s).trim().toUpperCase())
                ]));
                
                const chunkSize = 50;
                for (let i = 0; i < allSnVariants.length; i += chunkSize) {
                    const chunk = allSnVariants.slice(i, i + chunkSize);
                    await client.from('warehouse_items').delete().in('sn', chunk);
                }
            }
        } catch (dbErr) {
            console.error("Supabase Deletion Error:", dbErr);
        }
    }

    if (btnConfirm) {
        btnConfirm.disabled = false;
        btnConfirm.innerHTML = `<i class="fa-solid fa-trash-can"></i> ยืนยันลบออกจาก DB ทันที`;
    }
}

async function approveDeleteRequest(requestId, targetSn, targetItemId) {
    const client = getSupabaseClient();
    try {
        if (targetItemId) {
            globalInventoryData = globalInventoryData.filter(i => String(i.id) !== String(targetItemId));
            if (client) await client.from('warehouse_items').delete().eq('id', targetItemId);
        } else if (targetSn) {
            globalInventoryData = globalInventoryData.filter(i => String(i.sn).toLowerCase() !== String(targetSn).toLowerCase());
            if (client) await client.from('warehouse_items').delete().eq('sn', targetSn);
        }

        if (client && requestId) {
            await client.from('delete_requests').update({ status: 'APPROVED', approved_by: getCurrentReceiverName() }).eq('id', requestId);
        }

        rebuildOccupiedSet();
        populateStockFilterDropdowns();
        filterInventoryData();
        if (typeof updateKPIs === 'function') updateKPIs();
        if (typeof refreshLocationVisualizerIfActive === 'function') refreshLocationVisualizerIfActive();
        
        if (typeof notifyWmsDataChanged === 'function') notifyWmsDataChanged('APPROVE_DELETE', { targetSn, targetItemId });
        if (typeof showToast === 'function') showToast(`✅ อนุมัติการลบสินค้า S/N: ${targetSn} เรียบร้อยแล้ว`);
    } catch (e) {
        console.error("Approve Delete Request Error:", e);
    }
}

async function rejectDeleteRequest(requestId) {
    const client = getSupabaseClient();
    try {
        if (client && requestId) {
            await client.from('delete_requests').update({ status: 'REJECTED', approved_by: getCurrentReceiverName() }).eq('id', requestId);
        }
        if (typeof showToast === 'function') showToast(`❌ ปฏิเสธคำขอลบรายการเรียบร้อยแล้ว`);
    } catch (e) {
        console.error("Reject Delete Request Error:", e);
    }
}

function deleteSelectedFromModal() {
    requestDeleteModal('BATCH');
}