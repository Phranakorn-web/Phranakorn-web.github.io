// =========================================================================
// 📌 [ส่วนที่ 6] WMS EXCEL EXPORT ENGINE & PRINT ROUTER (v4.0.0)
// ไฟล์: inv-db modals-print-excel.js
// ระบบส่งออกข้อมูลสต็อกลงไฟล์ Excel และส่งต่อคำขอพิมพ์ไปยัง inv-db print-barcode.js
// =========================================================================

function formatReceiverFullName(item) {
    if (!item) return getCurrentUserFullName();
    let name = item.receiver || item.created_by || item.received_by;
    if (!name || name === 'nakorn.c' || name === 'Nakorn C' || name === 'ไม่ระบุผู้บันทึก') {
        name = getCurrentUserFullName();
    }
    return name;
}

// -------------------------------------------------------------------------
// 🖨️ PRINT BARCODE FORWARDER (ส่งต่อไปควบคุมที่ inv-db print-barcode.js)
// -------------------------------------------------------------------------
function openPrintBarcodeModal(mode, targetSn = null) {
    if (typeof window.openPrintBarcodeModal === 'function' && window.openPrintBarcodeModal !== openPrintBarcodeModal) {
        window.openPrintBarcodeModal(mode, targetSn);
    } else {
        console.log("Routing print barcode request to WMS Central Print Engine...", mode, targetSn);
    }
}

function printSelectedBarcodesFromModal() {
    if (typeof window.openPrintBarcodeModal === 'function') {
        window.openPrintBarcodeModal('MULTI');
    }
}

function executeBarcodePrintProcess(paperType) {
    if (typeof window.triggerPDFPrintPreview === 'function') {
        window.triggerPDFPrintPreview();
    }
}

function closePrintConfigModal() {
    if (typeof window.closePrintBarcodeModal === 'function') {
        window.closePrintBarcodeModal();
    }
}

// -------------------------------------------------------------------------
// 📊 EXCEL EXPORT ENGINE (100% COMPLETE)
// -------------------------------------------------------------------------
function ensureExcelExportModalExists() {
    let modal = document.getElementById('excelExportModal');
    if (!modal) {
        modal = document.createElement('div');
        modal.id = 'excelExportModal';
        modal.className = 'modal-overlay';
        modal.style.cssText = `
            display: none; position: fixed; top: 0; left: 0; width: 100%; height: 100%;
            background: rgba(15, 23, 42, 0.75); z-index: 99999;
            align-items: center; justify-content: center; backdrop-filter: blur(8px);
            padding: 16px; box-sizing: border-box;
        `;
        modal.innerHTML = `
            <div class="modal-content" style="
                background: #ffffff; border-radius: 16px; max-width: 500px; width: 95%;
                display: flex; flex-direction: column; box-shadow: 0 25px 50px -12px rgba(0, 0, 0, 0.25);
                border: 1px solid #cbd5e1; overflow: hidden; font-family: system-ui, -apple-system, sans-serif;
            ">
                <div class="modal-header" style="
                    padding: 16px 20px; border-bottom: 1px solid #e2e8f0;
                    display: flex; justify-content: space-between; align-items: center; background: #f8fafc;
                ">
                    <h3 style="margin:0; font-size:1.05rem; color:#0f172a; font-weight:800; display:flex; align-items:center; gap:8px;">
                        <i class="fa-solid fa-file-excel" style="color:#10b981;"></i> คัดกรองการส่งออก Excel สต็อก
                    </h3>
                    <button type="button" onclick="closeExcelExportModal()" style="
                        background: transparent; border: none; font-size: 1.25rem; cursor: pointer; color: #64748b;
                    ">&times;</button>
                </div>
                
                <div class="modal-body" style="padding: 20px; display:flex; flex-direction:column; gap:14px;">
                    <div class="form-group">
                        <label style="font-weight:700; font-size:0.82rem; margin-bottom:4px; display:block;">📦 รูปแบบและขอบเขตข้อมูลที่จะส่งออก:</label>
                        <select id="exportScopeSelect" class="form-control" onchange="onExportScopeChange(this.value)" style="padding:8px 10px; font-size:0.88rem; border-radius:8px; border:1px solid #cbd5e1;">
                            <option value="ALL">🌐 ส่งออกทั้งหมดในคลังสินค้า (All Master Stock)</option>
                            <option value="FILTERED">🔍 ส่งออกเฉพาะรายการที่ค้นหา/กรองอยู่ในตารางปัจจุบัน</option>
                            <option value="SELECTED">☑️ ส่งออกเฉพาะรายการที่ติ๊กเลือก Checkbox ไว้</option>
                            <option value="AISLE_BAY">📍 คัดกรองเจาะจงเฉพาะแถวจัดเก็บและล็อก (Aisle & Bay/Slot)</option>
                        </select>
                    </div>

                    <div id="exportCustomLocationGroup" style="display:none; background:#f8fafc; padding:14px; border-radius:8px; border:1px solid #cbd5e1; flex-direction:column; gap:12px;">
                        <div class="form-group">
                            <label style="font-weight:700; font-size:0.8rem; margin-bottom:3px; display:block;">📍 เลือกแถวจัดเก็บ (Aisle):</label>
                            <select id="exportAisleSelect" class="form-control" onchange="onExportAisleChange(this.value)" style="padding:7px 10px; font-size:0.85rem; border-radius:6px; border:1px solid #cbd5e1;">
                                <option value="ALL">ทุกล็อกแถวจัดเก็บ</option>
                            </select>
                        </div>
                        <div class="form-group">
                            <label style="font-weight:700; font-size:0.8rem; margin-bottom:3px; display:block;">🔒 เลือกเจาะจงล็อกจัดเก็บ (Bay/Slot):</label>
                            <select id="exportBaySelect" class="form-control" style="padding:7px 10px; font-size:0.85rem; border-radius:6px; border:1px solid #cbd5e1;">
                                <option value="ALL">ทุกล็อกในแถวนี้</option>
                            </select>
                        </div>
                    </div>
                </div>
                
                <div class="modal-footer" style="
                    padding: 14px 20px; border-top: 1px solid #e2e8f0;
                    display: flex; justify-content: flex-end; gap: 8px; background: #f8fafc;
                ">
                    <button type="button" class="btn btn-secondary" onclick="closeExcelExportModal()" style="border-radius:8px; font-weight:600; padding:6px 16px; font-size:0.82rem;">ยกเลิก</button>
                    <button type="button" class="btn btn-success" onclick="executeExcelExport()" style="border-radius:8px; font-weight:700; padding:6px 20px; font-size:0.82rem; background:#10b981; border-color:#10b981;"><i class="fa-solid fa-download"></i> ดาวน์โหลด Excel</button>
                </div>
            </div>
        `;
        document.body.appendChild(modal);
    }
}

function openExcelExportModal() {
    ensureExcelExportModalExists();
    populateExcelAisleOptions();

    const scopeSelect = document.getElementById('exportScopeSelect');
    if (scopeSelect) {
        scopeSelect.value = (window.selectedItemSnSet && window.selectedItemSnSet.size > 0) ? 'SELECTED' : 'ALL';
        onExportScopeChange(scopeSelect.value);
    }

    const modal = document.getElementById('excelExportModal');
    if (modal) modal.style.display = 'flex';
}

function closeExcelExportModal() {
    const modal = document.getElementById('excelExportModal');
    if (modal) modal.style.display = 'none';
}

function populateExcelAisleOptions() {
    const aisleSelect = document.getElementById('exportAisleSelect');
    if (!aisleSelect) return;

    const discoveredAisles = (typeof window.discoverAllDatabaseAisles === 'function') ? window.discoverAllDatabaseAisles() : [];
    let options = `<option value="ALL">🌐 ทุกล็อกแถวจัดเก็บ (${(window.globalInventoryData || []).length} รายการ)</option>`;
    
    discoveredAisles.forEach(a => {
        const count = (window.globalInventoryData || []).filter(i => (typeof window.extractAisleKey === 'function' ? window.extractAisleKey(i.location) : i.location) === a).length;
        const label = (typeof window.formatAisleBayLabel === 'function') ? window.formatAisleBayLabel(a) : a;
        options += `<option value="${escapeHTML(a)}">📍 ${escapeHTML(label)} (${count} เครื่อง)</option>`;
    });

    aisleSelect.innerHTML = options;
    onExportAisleChange('ALL');
}

function onExportScopeChange(scopeVal) {
    const customGroup = document.getElementById('exportCustomLocationGroup');
    if (customGroup) customGroup.style.display = (scopeVal === 'AISLE_BAY') ? 'flex' : 'none';
}

function onExportAisleChange(aisleVal) {
    const baySelect = document.getElementById('exportBaySelect');
    if (!baySelect) return;

    if (aisleVal === 'ALL') {
        baySelect.innerHTML = `<option value="ALL">ทุกล็อกในทุกแถว</option>`;
        return;
    }

    const baySet = new Set();
    (window.globalInventoryData || []).forEach(item => {
        const aisleKey = (typeof window.extractAisleKey === 'function') ? window.extractAisleKey(item.location) : item.location;
        if (aisleKey === aisleVal) {
            const bayKey = (typeof window.extractBayKey === 'function') ? window.extractBayKey(item.location) : '';
            if (bayKey) baySet.add(bayKey);
        }
    });

    const sortedBays = Array.from(baySet).sort();
    let options = `<option value="ALL">📍 ทุกล็อกในแถว ${escapeHTML(aisleVal)} (${sortedBays.length} ล็อก)</option>`;
    sortedBays.forEach(b => {
        const count = (window.globalInventoryData || []).filter(i => {
            const aKey = (typeof window.extractAisleKey === 'function') ? window.extractAisleKey(i.location) : i.location;
            const bKey = (typeof window.extractBayKey === 'function') ? window.extractBayKey(i.location) : '';
            return aKey === aisleVal && bKey === b;
        }).length;
        options += `<option value="${escapeHTML(b)}">🔒 ล็อก ${escapeHTML(b)} (${count} เครื่อง)</option>`;
    });

    baySelect.innerHTML = options;
}

function executeExcelExport() {
    const scopeSelect = document.getElementById('exportScopeSelect');
    const aisleSelect = document.getElementById('exportAisleSelect');
    const baySelect = document.getElementById('exportBaySelect');

    const scope = scopeSelect ? scopeSelect.value : 'ALL';
    const selectedAisle = aisleSelect ? aisleSelect.value : 'ALL';
    const selectedBay = baySelect ? baySelect.value : 'ALL';

    let exportItems = [];

    if (scope === 'FILTERED') {
        exportItems = [...(window.currentFilteredItems || window.globalInventoryData || [])];
    } else if (scope === 'SELECTED') {
        exportItems = (window.globalInventoryData || []).filter(i => window.selectedItemSnSet && window.selectedItemSnSet.has(i.sn));
    } else if (scope === 'AISLE_BAY') {
        exportItems = (window.globalInventoryData || []).filter(item => {
            const itemAisle = (typeof window.extractAisleKey === 'function') ? window.extractAisleKey(item.location) : item.location;
            const itemBay = (typeof window.extractBayKey === 'function') ? window.extractBayKey(item.location) : '';
            const matchAisle = (selectedAisle === 'ALL') || (itemAisle === selectedAisle);
            const matchBay = (selectedBay === 'ALL') || (itemBay === selectedBay);
            return matchAisle && matchBay;
        });
    } else {
        exportItems = [...(window.globalInventoryData || [])];
    }

    if (exportItems.length === 0) {
        if (typeof showToast === 'function') showToast("⚠️ ไม่พบข้อมูลตรงตามเงื่อนไขส่งออก Excel", true);
        else alert("⚠️ ไม่พบข้อมูลตรงตามเงื่อนไขส่งออก Excel");
        return;
    }

    if (typeof XLSX === 'undefined') {
        alert("⚠️ ไลบรารี XLSX ยังไม่พร้อมใช้งาน กรุณารอระบบดึงสคริปต์สักครู่");
        return;
    }

    const rows = exportItems.map((item, idx) => ({
        "ลำดับ": idx + 1,
        "รหัสสินค้า (SKU)": item.category || 'N/A',
        "ชื่อรุ่น / สินค้า": item.name || '-',
        "หมายเลขซีเรียล (S/N)": item.sn || '-',
        "เลขมิเตอร์": item.meter || 0,
        "พิกัดจัดเก็บ": typeof formatLocationSpaced === 'function' ? formatLocationSpaced(item.location) : item.location,
        "จำนวน": item.qty || 1,
        "ผู้รับสินค้าเข้า (User)": formatReceiverFullName(item),
        "วันที่รับเข้า": item.created_at ? new Date(item.created_at).toLocaleString('th-TH') : '-'
    }));

    const worksheet = XLSX.utils.json_to_sheet(rows);
    if (typeof autoFitExcelColumns === 'function') autoFitExcelColumns(worksheet, rows);

    const workbook = XLSX.utils.book_new();
    XLSX.utils.book_append_sheet(workbook, worksheet, "Stock_Inventory");

    let tag = scope;
    if (scope === 'AISLE_BAY') tag = `Aisle_${selectedAisle}_Bay_${selectedBay}`;

    const filename = `WMS_Stock_Report_${tag}_${new Date().toISOString().slice(0, 10)}.xlsx`;
    XLSX.writeFile(workbook, filename);

    closeExcelExportModal();

    if (typeof showToast === 'function') {
        showToast(`📊 ดาวน์โหลด Excel สำเร็จเรียบร้อย (${rows.length.toLocaleString()} รายการ)`);
    }
}

function exportExcelFromModal() {
    if (!window.currentDetailModalGroupKey) return;
    const grp = (window.currentInventoryGroups || []).find(g => g.groupKey === window.currentDetailModalGroupKey);
    if (!grp) return;

    const selectedAisleBay = (document.getElementById('stockDetailModalLocationFilter')?.value || 'ALL').toUpperCase();
    let exportItems = [...grp.items];

    if (selectedAisleBay !== 'ALL') {
        exportItems = exportItems.filter(item => (typeof window.extractAisleBayKey === 'function') ? window.extractAisleBayKey(item.location) === selectedAisleBay : true);
    }

    if (window.selectedItemSnSet && window.selectedItemSnSet.size > 0) {
        const checkedModalItems = exportItems.filter(i => window.selectedItemSnSet.has(i.sn));
        if (checkedModalItems.length > 0) exportItems = checkedModalItems;
    }

    if (exportItems.length === 0) {
        alert("⚠️ ไม่พบข้อมูลสำหรับส่งออก Excel");
        return;
    }

    if (typeof XLSX === 'undefined') {
        alert("⚠️ ไลบรารี XLSX ยังไม่พร้อมใช้งาน");
        return;
    }

    const rows = exportItems.map((item, idx) => ({
        "ลำดับ": idx + 1,
        "รหัสสินค้า (SKU)": item.category || 'N/A',
        "ชื่อรุ่น / สินค้า": item.name || '-',
        "หมายเลขซีเรียล (S/N)": item.sn || '-',
        "เลขมิเตอร์": item.meter || 0,
        "พิกัดจัดเก็บ": typeof formatLocationSpaced === 'function' ? formatLocationSpaced(item.location) : item.location,
        "จำนวน": item.qty || 1,
        "ผู้รับสินค้าเข้า (User)": formatReceiverFullName(item),
        "วันที่รับเข้า": item.created_at ? new Date(item.created_at).toLocaleString('th-TH') : '-'
    }));

    const worksheet = XLSX.utils.json_to_sheet(rows);
    if (typeof autoFitExcelColumns === 'function') autoFitExcelColumns(worksheet, rows);

    const workbook = XLSX.utils.book_new();
    XLSX.utils.book_append_sheet(workbook, worksheet, "Stock_Serials");

    const locTag = selectedAisleBay === 'ALL' ? 'All_Locations' : `Location_${selectedAisleBay}`;
    const filename = `WMS_Stock_${grp.category}_${locTag}_${new Date().toISOString().slice(0, 10)}.xlsx`;

    XLSX.writeFile(workbook, filename);
    if (typeof showToast === 'function') {
        showToast(`📊 ส่งออก Excel สำเร็จจำนวน ${rows.length.toLocaleString()} รายการ`);
    }
}

// Bind Global Exports
window.openPrintBarcodeModal = openPrintBarcodeModal;
window.printSelectedBarcodesFromModal = printSelectedBarcodesFromModal;
window.executeBarcodePrintProcess = executeBarcodePrintProcess;
window.closePrintConfigModal = closePrintConfigModal;
window.ensureExcelExportModalExists = ensureExcelExportModalExists;
window.openExcelExportModal = openExcelExportModal;
window.closeExcelExportModal = closeExcelExportModal;
window.populateExcelAisleOptions = populateExcelAisleOptions;
window.onExportScopeChange = onExportScopeChange;
window.onExportAisleChange = onExportAisleChange;
window.executeExcelExport = executeExcelExport;
window.exportExcelFromModal = exportExcelFromModal;