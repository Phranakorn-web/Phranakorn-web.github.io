
// =========================================================================
// 📌 [ส่วนที่ 4] WMS MODALS: ULTRA-WIDE STOCK DETAIL & BARCODE POPOVER ENGINE
// =========================================================================

// State เพิ่มเติมสำหรับ Modal Quick Filter Chips
window.modalActiveQuickFilter = 'ALL';

// -------------------------------------------------------------------------
// 🔍 BARCODE PREVIEW POPOVER ENGINE (พรีวิวบาร์โค้ดสดเมื่อ Hover เมาส์ชี้ S/N)
// -------------------------------------------------------------------------
function ensureBarcodePopoverExists() {
    let popover = document.getElementById('wmsBarcodePreviewPopover');
    if (!popover) {
        popover = document.createElement('div');
        popover.id = 'wmsBarcodePreviewPopover';
        popover.style.cssText = `
            position: fixed; display: none; z-index: 9999999;
            background: #ffffff; border: 1px solid #cbd5e1; border-radius: 12px;
            padding: 12px 16px; box-shadow: 0 20px 25px -5px rgba(0, 0, 0, 0.25), 0 8px 10px -6px rgba(0, 0, 0, 0.1);
            pointer-events: none; transform: translate(-50%, -100%); margin-top: -12px;
            text-align: center; transition: opacity 0.15s ease, transform 0.15s ease;
            font-family: system-ui, -apple-system, sans-serif; min-width: 200px;
        `;
        popover.innerHTML = `
            <div style="font-size:0.75rem; font-weight:800; color:#64748b; text-transform:uppercase; letter-spacing:0.5px; margin-bottom:6px;">
                <i class="fa-solid fa-barcode" style="color:#2563eb;"></i> BARCODE PREVIEW
            </div>
            <div style="background:#ffffff; padding:8px; border-radius:6px; border:1px solid #e2e8f0; display:inline-block;">
                <canvas id="wmsBarcodeCanvasPreview" style="max-width:220px; height:50px; display:block; margin:0 auto;"></canvas>
            </div>
            <div id="wmsBarcodeTextPreview" style="font-family:monospace; font-weight:800; font-size:0.9rem; color:#0f172a; margin-top:6px; letter-spacing:1px;"></div>
        `;
        document.body.appendChild(popover);
    }
}

// ฟังก์ชันวาดแท่งบาร์โค้ด Code-128 ลงบน Canvas แบบ Pure JS (100% Offline)
function drawSimpleCode128Barcode(canvas, text) {
    if (!canvas || !text) return;
    const ctx = canvas.getContext('2d');
    canvas.width = 240;
    canvas.height = 50;
    ctx.clearRect(0, 0, canvas.width, canvas.height);
    
    ctx.fillStyle = '#ffffff';
    ctx.fillRect(0, 0, canvas.width, canvas.height);

    ctx.fillStyle = '#0f172a';
    
    // สร้างลายแท่งบาร์โค้ดจำลองความถี่ตามรหัสข้อความ
    let x = 15;
    const width = canvas.width - 30;
    const bitString = generatePseudoBarcodePattern(text);
    const barWidth = width / bitString.length;

    for (let i = 0; i < bitString.length; i++) {
        if (bitString[i] === '1') {
            ctx.fillRect(x + (i * barWidth), 4, Math.max(1, barWidth), 42);
        }
    }
}

function generatePseudoBarcodePattern(str) {
    let pattern = "11010010000"; // Start Code
    for (let i = 0; i < str.length; i++) {
        const charCode = str.charCodeAt(i);
        const bin = (charCode * 2654435761).toString(2).padStart(11, '0');
        pattern += bin.substring(0, 11);
    }
    pattern += "1100011101011"; // Stop Code
    return pattern;
}

function showBarcodePopover(targetEl, sn) {
    if (!sn) return;
    ensureBarcodePopoverExists();

    const popover = document.getElementById('wmsBarcodePreviewPopover');
    const canvas = document.getElementById('wmsBarcodeCanvasPreview');
    const textEl = document.getElementById('wmsBarcodeTextPreview');

    if (textEl) textEl.textContent = sn;
    if (canvas) drawSimpleCode128Barcode(canvas, sn);

    const rect = targetEl.getBoundingClientRect();
    const left = rect.left + (rect.width / 2);
    const top = rect.top;

    if (popover) {
        popover.style.left = `${left}px`;
        popover.style.top = `${top}px`;
        popover.style.display = 'block';
        popover.style.opacity = '1';
    }
}

function hideBarcodePopover() {
    const popover = document.getElementById('wmsBarcodePreviewPopover');
    if (popover) {
        popover.style.opacity = '0';
        popover.style.display = 'none';
    }
}

function copyTextToClipboard(text, label = 'ข้อความ') {
    if (!text) return;
    if (navigator.clipboard && window.isSecureContext) {
        navigator.clipboard.writeText(text).then(() => {
            if (typeof showToast === 'function') showToast(`📋 คัดลอก ${label} เรียบร้อยแล้ว`);
            else alert(`คัดลอก ${label}: ${text}`);
        }).catch(() => {
            fallbackCopyText(text, label);
        });
    } else {
        fallbackCopyText(text, label);
    }
}

function fallbackCopyText(text, label) {
    const textArea = document.createElement("textarea");
    textArea.value = text;
    textArea.style.position = "fixed";
    textArea.style.left = "-999999px";
    document.body.appendChild(textArea);
    textArea.focus();
    textArea.select();
    try {
        document.execCommand('copy');
        if (typeof showToast === 'function') showToast(`📋 คัดลอก ${label} เรียบร้อยแล้ว`);
        else alert(`คัดลอก ${label}: ${text}`);
    } catch (err) {
        alert(`ไม่สามารถคัดลอกได้: ${text}`);
    }
    document.body.removeChild(textArea);
}

function copyAllSerialsInCurrentGroup() {
    if (!window.currentDetailModalGroupKey) return;
    const grp = (window.currentInventoryGroups || []).find(g => g.groupKey === window.currentDetailModalGroupKey);
    if (!grp || !grp.items || grp.items.length === 0) return;

    const sns = grp.items.map(i => i.sn).filter(Boolean).join('\n');
    copyTextToClipboard(sns, `S/N ทั้งหมด ${grp.items.length} เครื่อง`);
}

function exportExcelFromModal() {
    if (typeof window.openExcelExportModal === 'function') {
        window.openExcelExportModal();
    } else if (typeof window.executeExcelExport === 'function') {
        window.executeExcelExport();
    } else {
        alert("📊 กำลังเตรียมระบบส่งออก Excel...");
    }
}

function relocateSelectedFromModal() {
    if (!window.selectedItemSnSet || window.selectedItemSnSet.size === 0) {
        alert("⚠️ กรุณาติ๊กเลือกรายการซีเรียลอย่างน้อย 1 รายการเพื่อทำการย้าย");
        return;
    }
    if (typeof window.requestBatchRelocateModal === 'function') {
        window.requestBatchRelocateModal();
    } else {
        alert(`พร้อมทำการย้ายกลุ่มสินค้าจำนวน ${window.selectedItemSnSet.size} รายการ`);
    }
}

function deleteSelectedFromModal() {
    if (!window.selectedItemSnSet || window.selectedItemSnSet.size === 0) {
        alert("⚠️ กรุณาติ๊กเลือกรายการซีเรียลอย่างน้อย 1 รายการเพื่อทำการลบ");
        return;
    }
    if (typeof window.requestDeleteModal === 'function') {
        window.requestDeleteModal('BATCH', null, null, null);
    } else {
        alert(`พร้อมทำการลบกลุ่มสินค้าจำนวน ${window.selectedItemSnSet.size} รายการ`);
    }
}

function openStockDetailModalByEncoded(encodedGroupKey) {
    try {
        const decodedKey = decodeURIComponent(encodedGroupKey);
        openStockDetailModal(decodedKey);
    } catch(err) {
        console.error("Open Stock Detail Modal by Encoded Key error:", err);
    }
}

function setModalQuickFilterChip(filterType) {
    window.modalActiveQuickFilter = filterType;
    document.querySelectorAll('.modal-quick-chip').forEach(chip => {
        if (chip.getAttribute('data-chip') === filterType) {
            chip.style.background = '#2563eb';
            chip.style.color = '#ffffff';
            chip.style.borderColor = '#2563eb';
        } else {
            chip.style.background = '#ffffff';
            chip.style.color = '#475569';
            chip.style.borderColor = '#cbd5e1';
        }
    });
    filterStockDetailModalItems();
}

function ensureStockDetailModalExists() {
    let modal = document.getElementById('stockDetailModal');
    if (!modal) {
        modal = document.createElement('div');
        modal.id = 'stockDetailModal';
        modal.className = 'modal-overlay';
        modal.style.cssText = `
            display: none; position: fixed; top: 0; left: 0; width: 100vw; height: 100vh;
            background: rgba(15, 23, 42, 0.82); z-index: 999999;
            align-items: center; justify-content: center; backdrop-filter: blur(8px);
            padding: 20px; box-sizing: border-box;
        `;
        modal.innerHTML = `
            <div class="modal-content" style="
                background: #ffffff; border-radius: 18px; max-width: 1320px; width: 96%;
                height: 90vh; max-height: 900px; display: flex; flex-direction: column;
                box-shadow: 0 25px 50px -12px rgba(0,0,0,0.4); border: 1px solid #cbd5e1;
                overflow: hidden; animation: fadeInModal 0.2s cubic-bezier(0.16, 1, 0.3, 1);
                font-family: system-ui, -apple-system, sans-serif;
            ">
                <!-- 1. MODAL HEADER -->
                <div class="modal-header" style="
                    padding: 16px 24px; border-bottom: 1px solid #e2e8f0;
                    display: flex; justify-content: space-between; align-items: center; background: #f8fafc;
                ">
                    <div style="display:flex; align-items:center; gap:16px;">
                        <div id="stockDetailModalProductImg" style="width:52px; height:52px; border-radius:12px; background:#f1f5f9; display:flex; align-items:center; justify-content:center; overflow:hidden; border:1px solid #cbd5e1; box-shadow:0 2px 4px rgba(0,0,0,0.04);">
                            <i class="fa-solid fa-box-archive" style="color:#64748b; font-size:1.5rem;"></i>
                        </div>
                        <div>
                            <div id="stockDetailModalTitle" style="margin:0; font-size:1.2rem; color:#0f172a; font-weight:800; line-height:1.2;">-</div>
                            <div id="stockDetailModalSubTitle" style="font-size:0.85rem; color:#64748b; margin-top:4px; font-weight:500;">-</div>
                        </div>
                    </div>
                    <button type="button" onclick="closeStockDetailModal()" style="background:#f1f5f9; border:1px solid #cbd5e1; width:36px; height:36px; border-radius:50%; font-size:1.2rem; cursor:pointer; color:#64748b; display:flex; align-items:center; justify-content:center; transition:all 0.15s ease;" onmouseover="this.style.background='#e2e8f0';this.style.color='#0f172a';" onmouseout="this.style.background='#f1f5f9';this.style.color='#64748b';">&times;</button>
                </div>

                <!-- 2. QUICK STATS SUMMARY BAR -->
                <div id="stockDetailModalStatsBar" style="
                    padding: 10px 24px; background: #eff6ff; border-bottom: 1px solid #bfdbfe;
                    display: flex; gap: 20px; align-items: center; flex-wrap: wrap; font-size: 0.83rem; color: #1e40af; font-weight: 700;
                ">
                    <div style="display:flex; align-items:center; gap:6px;">
                        <i class="fa-solid fa-boxes-stacked" style="color:#2563eb;"></i> จำนวนในกลุ่ม: <span id="modalStatTotalQty" style="background:#ffffff; padding:2px 8px; border-radius:6px; border:1px solid #93c5fd; color:#1e3a8a; font-family:monospace;">0</span>
                    </div>
                    <div style="display:flex; align-items:center; gap:6px;">
                        <i class="fa-solid fa-gauge" style="color:#d97706;"></i> ผลรวมเลขมิเตอร์สะสม: <span id="modalStatTotalMeter" style="background:#ffffff; padding:2px 8px; border-radius:6px; border:1px solid #fde68a; color:#b45309; font-family:monospace;">0</span>
                    </div>
                    <div style="display:flex; align-items:center; gap:6px;">
                        <i class="fa-solid fa-location-dot" style="color:#10b981;"></i> กระจายจัดเก็บ: <span id="modalStatLocCount" style="background:#ffffff; padding:2px 8px; border-radius:6px; border:1px solid #a7f3d0; color:#065f46; font-family:monospace;">0 พิกัด</span>
                    </div>
                </div>

                <!-- 3. SEARCH & QUICK FILTER CHIPS TOOLBAR -->
                <div style="padding:12px 24px; background:#f8fafc; border-bottom:1px solid #e2e8f0; display:flex; gap:10px; align-items:center; flex-wrap:wrap;">
                    <div style="position:relative; flex:1; min-width:240px;">
                        <i class="fa-solid fa-magnifying-glass" style="position:absolute; left:12px; top:50%; transform:translateY(-50%); color:#94a3b8; font-size:0.85rem;"></i>
                        <input type="text" id="stockDetailModalSearchInput" oninput="filterStockDetailModalItems()" placeholder="ค้นหาหมายเลข S/N, พิกัด หรือชื่อผู้บันทึก..." style="width:100%; padding:8px 12px 8px 34px; font-size:0.88rem; border-radius:8px; border:1px solid #cbd5e1; outline:none; background:#ffffff; box-sizing:border-box;">
                    </div>
                    
                    <div style="display:flex; gap:6px; flex-wrap:wrap;">
                        <button type="button" class="modal-quick-chip" data-chip="ALL" onclick="setModalQuickFilterChip('ALL')" style="padding:6px 12px; font-size:0.78rem; font-weight:700; border-radius:20px; border:1px solid #2563eb; background:#2563eb; color:#ffffff; cursor:pointer;">ทั้งหมด</button>
                        <button type="button" class="modal-quick-chip" data-chip="HAS_METER" onclick="setModalQuickFilterChip('HAS_METER')" style="padding:6px 12px; font-size:0.78rem; font-weight:700; border-radius:20px; border:1px solid #cbd5e1; background:#ffffff; color:#475569; cursor:pointer;">มิเตอร์ > 0</button>
                        <button type="button" class="modal-quick-chip" data-chip="TODAY" onclick="setModalQuickFilterChip('TODAY')" style="padding:6px 12px; font-size:0.78rem; font-weight:700; border-radius:20px; border:1px solid #cbd5e1; background:#ffffff; color:#475569; cursor:pointer;">รับเข้าวันนี้</button>
                    </div>

                    <select id="stockDetailModalLocationFilter" onchange="filterStockDetailModalItems()" style="padding:8px 12px; font-size:0.85rem; border-radius:8px; border:1px solid #cbd5e1; background:#fff; font-weight:700; color:#334155; min-width:180px; outline:none;">
                        <option value="ALL">📍 ทุกล็อก / พิกัดจัดเก็บ</option>
                    </select>
                    
                    <button class="btn btn-sm btn-secondary" onclick="copyAllSerialsInCurrentGroup()" style="padding:8px 12px; font-size:0.82rem; border-radius:8px; font-weight:700; background:#ffffff; border:1px solid #cbd5e1; color:#0f172a;"><i class="fa-solid fa-copy" style="color:#2563eb;"></i> คัดลอก S/N</button>
                    <button class="btn btn-sm btn-success" onclick="exportExcelFromModal()" style="padding:8px 12px; font-size:0.82rem; border-radius:8px; font-weight:700; background:#10b981; border-color:#10b981; color:#ffffff;"><i class="fa-solid fa-file-excel"></i> Excel</button>
                </div>

                <!-- 4. TABLE WORKSPACE CONTAINER -->
                <div class="modal-body" style="padding:0; flex:1; overflow-y:auto; overflow-x:auto; background:#ffffff;">
                    <table class="table-custom" style="width:100%; min-width:1150px; border-collapse:collapse; font-size:0.85rem;">
                        <thead style="position:sticky; top:0; z-index:10; background:#f8fafc;">
                            <tr style="border-bottom:2px solid #e2e8f0; color:#475569; font-size:0.78rem; text-transform:uppercase; letter-spacing:0.5px;">
                                <th style="padding:12px 10px; text-align:center; width:46px;"><input type="checkbox" id="modalSelectAllCb" onchange="toggleModalSelectAllItems(this.checked)"></th>
                                <th style="padding:12px 10px; text-align:center; width:54px;">ลำดับ</th>
                                <th style="padding:12px 14px; text-align:center; min-width:200px;">หมายเลขซีเรียล (S/N)</th>
                                <th style="padding:12px 14px; text-align:center; min-width:130px;">เลขมิเตอร์</th>
                                <th style="padding:12px 14px; text-align:center; min-width:220px;">พิกัดจัดเก็บจริง (Location)</th>
                                <th style="padding:12px 14px; text-align:center; min-width:180px;">ผู้รับสินค้าเข้า (User)</th>
                                <th style="padding:12px 14px; text-align:center; min-width:130px;">วันที่รับเข้า</th>
                                <th style="padding:12px 14px; text-align:center; width:160px; min-width:160px;">จัดการ</th>
                            </tr>
                        </thead>
                        <tbody id="stockDetailModalTbody">
                        </tbody>
                    </table>
                </div>

                <!-- 5. MODAL FOOTER -->
                <div class="modal-footer" style="padding:14px 24px; border-top:1px solid #e2e8f0; display:flex; justify-content:space-between; align-items:center; background:#f8fafc;">
                    <div id="stockDetailModalFooterBadge" style="font-size:0.85rem; font-weight:700; color:#475569;">แสดงผล 0 ซีเรียล</div>
                    <div style="display:flex; gap:10px;">
                        <button type="button" class="btn btn-sm btn-secondary" onclick="relocateSelectedFromModal()" style="border-radius:8px; font-weight:700; padding:8px 14px; font-size:0.82rem; background:#ffffff; border:1px solid #cbd5e1;"><i class="fa-solid fa-right-left" style="color:#2563eb;"></i> ย้ายพิกัดกลุ่มที่เลือก</button>
                        <button type="button" class="btn btn-sm btn-danger" onclick="deleteSelectedFromModal()" style="border-radius:8px; font-weight:700; padding:8px 14px; font-size:0.82rem; background:#dc2626; border-color:#dc2626; color:#ffffff;"><i class="fa-solid fa-trash-can"></i> ลบกลุ่มที่เลือก</button>
                        <button type="button" class="btn btn-secondary" onclick="closeStockDetailModal()" style="border-radius:8px; font-weight:600; padding:8px 18px; font-size:0.82rem; background:#64748b; color:#ffffff; border:none;">ปิดหน้าต่าง</button>
                    </div>
                </div>
            </div>
        `;
        document.body.appendChild(modal);
    }
}

function openStockDetailModal(groupKey) {
    window.currentDetailModalGroupKey = groupKey;
    ensureStockDetailModalExists();

    const grp = (window.currentInventoryGroups || []).find(g => g.groupKey === groupKey);
    if (!grp) return;

    const titleEl = document.getElementById('stockDetailModalTitle');
    const subTitleEl = document.getElementById('stockDetailModalSubTitle');
    const imgEl = document.getElementById('stockDetailModalProductImg');
    const locFilter = document.getElementById('stockDetailModalLocationFilter');

    if (titleEl) titleEl.textContent = `[${grp.category}] ${grp.name}`;
    if (subTitleEl) subTitleEl.textContent = `ยี่ห้อ: ${grp.brand || '-'} | รุ่น: ${grp.model || grp.name} | รวมทั้งหมด ${grp.items.length.toLocaleString()} เครื่อง`;

    if (imgEl) {
        imgEl.innerHTML = grp.image 
            ? `<img src="${window.escapeHTML(grp.image)}" style="width:100%; height:100%; object-fit:cover;">`
            : `<i class="fa-solid fa-box-archive" style="color:#64748b; font-size:1.5rem;"></i>`;
    }

    if (locFilter) {
        let locOpts = `<option value="ALL">📍 ทุกล็อก / พิกัดจัดเก็บ (${grp.items.length} เครื่อง)</option>`;
        grp.bays.forEach(b => {
            const bCount = grp.items.filter(i => window.extractAisleBayKey ? window.extractAisleBayKey(i.location) === b : true).length;
            const bLabel = window.formatAisleBayLabel ? window.formatAisleBayLabel(b) : b;
            locOpts += `<option value="${window.escapeHTML(b)}">📍 ${window.escapeHTML(bLabel)} (${bCount} เครื่อง)</option>`;
        });
        locFilter.innerHTML = locOpts;
        locFilter.value = 'ALL';
    }

    const searchInp = document.getElementById('stockDetailModalSearchInput');
    if (searchInp) searchInp.value = '';

    setModalQuickFilterChip('ALL');

    const modal = document.getElementById('stockDetailModal');
    if (modal) modal.style.display = 'flex';
}

function closeStockDetailModal() {
    const modal = document.getElementById('stockDetailModal');
    if (modal) modal.style.display = 'none';
    hideBarcodePopover();
}

function refreshStockDetailModalIfActive() {
    const modal = document.getElementById('stockDetailModal');
    if (modal && modal.style.display === 'flex' && window.currentDetailModalGroupKey) {
        filterStockDetailModalItems();
    }
}

function filterStockDetailModalItems() {
    if (!window.currentDetailModalGroupKey) return;
    const grp = (window.currentInventoryGroups || []).find(g => g.groupKey === window.currentDetailModalGroupKey);
    if (!grp) return;

    const query = (document.getElementById('stockDetailModalSearchInput')?.value || '').trim().toLowerCase();
    const locFilterVal = (document.getElementById('stockDetailModalLocationFilter')?.value || 'ALL').toUpperCase();
    const chipFilter = window.modalActiveQuickFilter || 'ALL';

    const tbody = document.getElementById('stockDetailModalTbody');
    if (!tbody) return;

    const todayStr = new Date().toISOString().split('T')[0];

    let filtered = grp.items.filter(item => {
        const receiverName = window.formatReceiverFullName ? window.formatReceiverFullName(item).toLowerCase() : '';
        const matchText = !query || 
            (item.sn && item.sn.toLowerCase().includes(query)) ||
            (item.location && item.location.toLowerCase().includes(query)) ||
            receiverName.includes(query);

        let matchLoc = true;
        if (locFilterVal !== 'ALL') {
            const abKey = window.extractAisleBayKey ? window.extractAisleBayKey(item.location) : '';
            matchLoc = abKey === locFilterVal || item.location.toUpperCase().startsWith(locFilterVal);
        }

        let matchChip = true;
        if (chipFilter === 'HAS_METER') {
            matchChip = (parseFloat(item.meter) || 0) > 0;
        } else if (chipFilter === 'TODAY') {
            const itemDate = item.created_at ? new Date(item.created_at).toISOString().split('T')[0] : '';
            matchChip = (itemDate === todayStr);
        }

        return matchText && matchLoc && matchChip;
    });

    let totalMeter = 0;
    const locSet = new Set();
    filtered.forEach(i => {
        totalMeter += (parseFloat(i.meter) || 0);
        if (i.location) locSet.add(i.location.toUpperCase().trim());
    });

    const elStatQty = document.getElementById('modalStatTotalQty');
    const elStatMeter = document.getElementById('modalStatTotalMeter');
    const elStatLoc = document.getElementById('modalStatLocCount');

    if (elStatQty) elStatQty.textContent = `${filtered.length.toLocaleString()} เครื่อง`;
    if (elStatMeter) elStatMeter.textContent = totalMeter.toLocaleString();
    if (elStatLoc) elStatLoc.textContent = `${locSet.size.toLocaleString()} พิกัด`;

    tbody.innerHTML = '';
    if (filtered.length === 0) {
        tbody.innerHTML = `<tr><td colspan="8" style="text-align:center; padding:40px; color:#94a3b8; font-size:0.9rem;">ไม่พบรายการซีเรียลตรงตามเงื่อนไขค้นหา</td></tr>`;
        return;
    }

    let allChecked = true;
    filtered.forEach((item, idx) => {
        const isChecked = window.selectedItemSnSet ? window.selectedItemSnSet.has(item.sn) : false;
        if (!isChecked) allChecked = false;

        const safeId = String(item.id || '').replace(/'/g, "\\'");
        const safeSn = String(item.sn || '').replace(/'/g, "\\'");
        const locFormatted = typeof window.formatLocationCode === 'function' ? window.formatLocationCode(item.location) : item.location;
        const receiverFullName = window.formatReceiverFullName ? window.formatReceiverFullName(item) : 'ไม่ระบุ';

        const tr = document.createElement('tr');
        tr.style.cssText = "border-bottom:1px solid #f1f5f9; transition:background 0.15s ease;";
        tr.onmouseover = function() { this.style.background = '#f8fafc'; };
        tr.onmouseout = function() { this.style.background = 'transparent'; };

        tr.innerHTML = `
            <td style="padding:10px 8px; text-align:center; vertical-align:middle;">
                <input type="checkbox" class="item-checkbox-modal" data-sn="${window.escapeHTML(item.sn)}" ${isChecked ? 'checked' : ''} onchange="toggleItemSelection('${window.escapeHTML(item.sn)}', this.checked)">
            </td>
            <td style="padding:10px 8px; text-align:center; font-weight:700; color:#64748b; vertical-align:middle;" class="mono">${idx + 1}</td>
            
            <!-- 🟢 เพิ่ม Hover Barcode Popover ตรงนี้ -->
            <td style="padding:10px 14px; text-align:center; vertical-align:middle;">
                <div style="display:inline-flex; align-items:center; gap:6px; background:#f1f5f9; padding:4px 10px; border-radius:6px; border:1px solid #cbd5e1; cursor:pointer;" 
                     onmouseenter="showBarcodePopover(this, '${window.escapeHTML(item.sn)}')" 
                     onmouseleave="hideBarcodePopover()">
                    <code class="mono font-bold" style="font-size:0.88rem; color:#0f172a; white-space:nowrap;">${window.escapeHTML(item.sn)}</code>
                    <button type="button" class="btn btn-sm btn-secondary" style="padding:2px 6px; font-size:0.68rem; border-radius:4px; border:none; background:#e2e8f0; color:#475569; cursor:pointer;" onclick="event.stopPropagation(); copyTextToClipboard('${window.escapeHTML(item.sn)}', 'S/N')" title="คัดลอก S/N"><i class="fa-solid fa-copy"></i></button>
                </div>
            </td>

            <td style="padding:10px 14px; text-align:center; vertical-align:middle;">
                <span class="mono font-bold" style="color:#b45309; font-size:0.88rem; background:#fef3c7; padding:4px 10px; border-radius:6px; border:1px solid #fde68a; white-space:nowrap; display:inline-block;">
                    <i class="fa-solid fa-gauge" style="font-size:0.75rem;"></i> ${Number(item.meter || 0).toLocaleString()}
                </span>
            </td>

            <td style="padding:10px 14px; text-align:center; vertical-align:middle;">
                <span class="badge-location mono" style="font-size:0.82rem; padding:4px 12px; border-radius:6px; background:#f0f9ff; border:1px solid #bae6fd; color:#0369a1; font-weight:800; white-space:nowrap; display:inline-flex; align-items:center; gap:6px;">
                    <i class="fa-solid fa-location-dot" style="color:#0284c7;"></i> ${window.escapeHTML(locFormatted)}
                </span>
            </td>

            <td style="padding:10px 14px; text-align:center; vertical-align:middle;">
                <span style="font-size:0.8rem; font-weight:700; color:#1e3a8a; background:#eff6ff; padding:4px 12px; border-radius:6px; border:1px solid #bfdbfe; white-space:nowrap; display:inline-flex; align-items:center; gap:6px;" title="ผู้รับสินค้าเข้า: ${window.escapeHTML(receiverFullName)}">
                    <i class="fa-solid fa-user-check" style="color:#2563eb; font-size:0.75rem;"></i> ${window.escapeHTML(receiverFullName)}
                </span>
            </td>

            <td style="padding:10px 14px; text-align:center; font-size:0.78rem; color:#64748b; vertical-align:middle; white-space:nowrap;">
                ${item.created_at ? new Date(item.created_at).toLocaleString('th-TH') : '-'}
            </td>

            <td style="padding:10px 14px; text-align:center; vertical-align:middle; white-space:nowrap;">
                <div style="display:flex; justify-content:center; gap:5px;">
                    <button class="btn btn-sm btn-primary" style="padding:4px 8px; font-size:0.75rem; border-radius:6px;" onclick="openPrintBarcodeModal('SINGLE', '${safeSn}')" title="พิมพ์บาร์โค้ด"><i class="fa-solid fa-barcode"></i></button>
                    <button class="btn btn-sm btn-secondary" style="padding:4px 8px; font-size:0.75rem; border-radius:6px;" onclick="openEditItemModal('${safeId}', '${safeSn}')" title="แก้ไขข้อมูล"><i class="fa-solid fa-pen-to-square" style="color:#2563eb;"></i></button>
                    <button class="btn btn-sm btn-secondary" style="padding:4px 8px; font-size:0.75rem; border-radius:6px;" onclick="requestRelocateModal('${safeId}', '${safeSn}', '${window.escapeHTML(item.name)}', '${window.escapeHTML(item.location)}')" title="ย้ายพิกัด"><i class="fa-solid fa-right-left"></i></button>
                    <button class="btn btn-sm btn-danger" style="padding:4px 8px; font-size:0.75rem; background:#dc2626; border-color:#dc2626; border-radius:6px;" onclick="requestDeleteModal('SINGLE', '${safeSn}', '${safeId}', event)" title="ลบรายการนี้"><i class="fa-solid fa-trash-can"></i></button>
                </div>
            </td>
        `;
        tbody.appendChild(tr);
    });

    const allCb = document.getElementById('modalSelectAllCb');
    if (allCb) allCb.checked = allChecked;

    const footerBadge = document.getElementById('stockDetailModalFooterBadge');
    if (footerBadge) {
        footerBadge.textContent = `แสดงผล ${filtered.length.toLocaleString()} / ${grp.items.length.toLocaleString()} เครื่อง | เลือกแล้ว ${window.selectedItemSnSet ? window.selectedItemSnSet.size.toLocaleString() : 0} เครื่อง`;
    }
}

function toggleModalSelectAllItems(checked) {
    if (!window.currentDetailModalGroupKey) return;
    const grp = (window.currentInventoryGroups || []).find(g => g.groupKey === window.currentDetailModalGroupKey);
    if (!grp) return;

    grp.items.forEach(item => {
        if (checked) window.selectedItemSnSet.add(item.sn);
        else window.selectedItemSnSet.delete(item.sn);
    });

    document.querySelectorAll('.item-checkbox-modal').forEach(cb => cb.checked = checked);
    if (typeof window.updateSelectedCountUI === 'function') window.updateSelectedCountUI();
}

function ensureEditModalExists() {
    let modal = document.getElementById('editItemModal');
    if (!modal) {
        modal = document.createElement('div');
        modal.id = 'editItemModal';
        modal.className = 'modal-overlay';
        modal.style.cssText = `
            display: none; position: fixed; top: 0; left: 0; width: 100vw; height: 100vh;
            background: rgba(15, 23, 42, 0.75); z-index: 100010;
            align-items: center; justify-content: center; backdrop-filter: blur(4px);
            padding: 16px; box-sizing: border-box;
        `;
        modal.innerHTML = `
            <div class="modal-content" style="
                background: #ffffff; border-radius: 14px; max-width: 500px; width: 95%;
                display: flex; flex-direction: column; box-shadow: 0 20px 25px -5px rgba(0, 0, 0, 0.2);
                border: 1px solid #cbd5e1; overflow: hidden; font-family: system-ui, -apple-system, sans-serif;
            ">
                <div class="modal-header" style="
                    padding: 16px 20px; border-bottom: 1px solid #e2e8f0;
                    display: flex; justify-content: space-between; align-items: center; background: #f8fafc;
                ">
                    <h3 style="margin:0; font-size:1.1rem; color:#0f172a; font-weight:800; display:flex; align-items:center; gap:8px;">
                        <i class="fa-solid fa-pen-to-square" style="color:#2563eb;"></i> แก้ไขข้อมูลสินค้า
                    </h3>
                    <button type="button" onclick="closeEditItemModal()" style="background:transparent; border:none; font-size:1.3rem; cursor:pointer; color:#64748b;">&times;</button>
                </div>

                <div class="modal-body" style="padding:20px; display:flex; flex-direction:column; gap:14px;">
                    <input type="hidden" id="editModalItemId">
                    <div class="form-group">
                        <label style="font-weight:700; font-size:0.82rem; margin-bottom:4px; display:block; color:#334155;">หมายเลขซีเรียล (S/N):</label>
                        <input type="text" id="editModalSn" readonly style="width:100%; padding:9px; font-size:0.9rem; font-family:monospace; font-weight:700; background:#f1f5f9; border:1px solid #cbd5e1; border-radius:8px; box-sizing:border-box; color:#0f172a;">
                    </div>
                    <div class="form-group">
                        <label style="font-weight:700; font-size:0.82rem; margin-bottom:4px; display:block; color:#334155;">รหัสสินค้า (SKU):</label>
                        <input type="text" id="editModalCategory" style="width:100%; padding:9px; font-size:0.9rem; border:1px solid #cbd5e1; border-radius:8px; font-weight:600; box-sizing:border-box;">
                    </div>
                    <div class="form-group">
                        <label style="font-weight:700; font-size:0.82rem; margin-bottom:4px; display:block; color:#334155;">ชื่อรุ่น / รายละเอียดสินค้า:</label>
                        <input type="text" id="editModalName" style="width:100%; padding:9px; font-size:0.9rem; border:1px solid #cbd5e1; border-radius:8px; font-weight:600; box-sizing:border-box;">
                    </div>
                    <div class="form-group">
                        <label style="font-weight:700; font-size:0.82rem; margin-bottom:4px; display:block; color:#334155;">เลขมิเตอร์ (Meter):</label>
                        <input type="number" id="editModalMeter" min="0" style="width:100%; padding:9px; font-size:0.9rem; border:1px solid #cbd5e1; border-radius:8px; font-weight:800; color:#b45309; box-sizing:border-box;">
                    </div>
                </div>

                <div class="modal-footer" style="padding:14px 20px; border-top:1px solid #e2e8f0; display:flex; justify-content:flex-end; gap:10px; background:#f8fafc;">
                    <button type="button" class="btn btn-secondary" onclick="closeEditItemModal()" style="border-radius:8px; font-weight:600; padding:8px 16px; font-size:0.82rem; background:#ffffff; border:1px solid #cbd5e1; color:#475569;">ยกเลิก</button>
                    <button type="button" class="btn btn-primary" onclick="saveEditedItemData()" style="border-radius:8px; font-weight:700; padding:8px 20px; font-size:0.82rem; background:#2563eb; color:#ffffff; border:none;"><i class="fa-solid fa-floppy-disk"></i> บันทึกการแก้ไข</button>
                </div>
            </div>
        `;
        document.body.appendChild(modal);
    }
}

function openEditItemModal(id, sn) {
    ensureEditModalExists();
    const item = (window.globalInventoryData || []).find(i => 
        (id && String(i.id) === String(id)) || 
        (sn && String(i.sn).toLowerCase() === String(sn).toLowerCase())
    );

    if (!item) return;

    window.currentEditingItemSn = item.sn;

    document.getElementById('editModalItemId').value = item.id || '';
    document.getElementById('editModalSn').value = item.sn || '';
    document.getElementById('editModalCategory').value = item.category || '';
    document.getElementById('editModalName').value = item.name || '';
    document.getElementById('editModalMeter').value = item.meter || 0;

    const modal = document.getElementById('editItemModal');
    if (modal) modal.style.display = 'flex';
}

function closeEditItemModal() {
    const modal = document.getElementById('editItemModal');
    if (modal) modal.style.display = 'none';
}

async function saveEditedItemData() {
    const id = document.getElementById('editModalItemId')?.value;
    const currentSn = window.currentEditingItemSn;

    const newCat = (document.getElementById('editModalCategory')?.value || '').trim();
    const newName = (document.getElementById('editModalName')?.value || '').trim();
    const newMeter = parseFloat(document.getElementById('editModalMeter')?.value) || 0;

    const item = (window.globalInventoryData || []).find(i => 
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

    const client = window.getSupabaseClient ? window.getSupabaseClient() : null;
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

    if (typeof window.rebuildOccupiedSet === 'function') window.rebuildOccupiedSet();
    if (typeof window.populateStockFilterDropdowns === 'function') window.populateStockFilterDropdowns();
    if (typeof window.filterInventoryData === 'function') window.filterInventoryData();
    if (typeof window.updateKPIs === 'function') window.updateKPIs();
    refreshStockDetailModalIfActive();
    closeEditItemModal();

    if (typeof notifyWmsDataChanged === 'function') {
        notifyWmsDataChanged('EDIT_ITEM', { sn: item.sn, category: item.category, name: item.name });
    }

    if (typeof showToast === 'function') {
        showToast(`✅ อัปเดตข้อมูลสินค้า S/N: ${item.sn} เรียบร้อยแล้ว`);
    }
}

// Bind Global Window Methods safely
window.showBarcodePopover = showBarcodePopover;
window.hideBarcodePopover = hideBarcodePopover;
window.copyTextToClipboard = copyTextToClipboard;
window.copyAllSerialsInCurrentGroup = copyAllSerialsInCurrentGroup;
window.exportExcelFromModal = exportExcelFromModal;
window.relocateSelectedFromModal = relocateSelectedFromModal;
window.deleteSelectedFromModal = deleteSelectedFromModal;
window.openStockDetailModalByEncoded = openStockDetailModalByEncoded;
window.setModalQuickFilterChip = setModalQuickFilterChip;
window.ensureStockDetailModalExists = ensureStockDetailModalExists;
window.openStockDetailModal = openStockDetailModal;
window.closeStockDetailModal = closeStockDetailModal;
window.refreshStockDetailModalIfActive = refreshStockDetailModalIfActive;
window.filterStockDetailModalItems = filterStockDetailModalItems;
window.toggleModalSelectAllItems = toggleModalSelectAllItems;
window.ensureEditModalExists = ensureEditModalExists;
window.openEditItemModal = openEditItemModal;
window.closeEditItemModal = closeEditItemModal;
window.saveEditedItemData = saveEditedItemData;