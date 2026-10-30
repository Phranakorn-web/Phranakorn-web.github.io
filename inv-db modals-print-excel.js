// =========================================================================
// 📌 [ส่วนที่ 6] WMS PRINT BARCODE ENGINE & EXCEL EXPORT ENGINE
// =========================================================================

// -------------------------------------------------------------------------
// 🖨️ PRINT BARCODE CONFIG SYSTEM (รองรับทุกขนาดกระดาษสติ๊กเกอร์และ A4 ภาพรวม)
// -------------------------------------------------------------------------
function ensurePrintConfigModalExists() {
    let modal = document.getElementById('printConfigSelectionModal');
    if (!modal) {
        modal = document.createElement('div');
        modal.id = 'printConfigSelectionModal';
        modal.className = 'modal-overlay';
        modal.style.cssText = `
            display: none; position: fixed; top: 0; left: 0; width: 100%; height: 100%;
            background: rgba(15, 23, 42, 0.75); z-index: 999999;
            align-items: center; justify-content: center; backdrop-filter: blur(4px);
            padding: 16px; box-sizing: border-box;
        `;
        modal.innerHTML = `
            <div class="modal-content" style="
                background: #ffffff; border-radius: 12px; max-width: 580px; width: 95%;
                display: flex; flex-direction: column; box-shadow: 0 20px 25px -5px rgba(0, 0, 0, 0.2);
                border: 1px solid #cbd5e1; overflow: hidden;
            ">
                <div class="modal-header" style="
                    padding: 16px 20px; border-bottom: 1px solid #e2e8f0;
                    display: flex; justify-content: space-between; align-items: center; background: #f8fafc;
                ">
                    <h3 style="margin:0; font-size:1.1rem; color:#0f172a; font-weight:800; display:flex; align-items:center; gap:8px;">
                        <i class="fa-solid fa-print" style="color:#2563eb;"></i> ตัวเลือกและขนาดการพิมพ์บาร์โค้ดสติ๊กเกอร์
                    </h3>
                    <button type="button" onclick="closePrintConfigModal()" style="
                        background: transparent; border: none; font-size: 1.25rem; cursor: pointer; color: #64748b;
                    ">&times;</button>
                </div>
                
                <div class="modal-body" style="padding: 20px; display:flex; flex-direction:column; gap:16px; max-height:75vh; overflow-y:auto;">
                    <div style="font-size:0.88rem; color:#475569; font-weight:600; background:#f8fafc; padding:10px 14px; border-radius:8px; border:1px solid #e2e8f0; display:flex; justify-content:space-between; align-items:center;">
                        <span>รายการบาร์โค้ดที่เตรียมพิมพ์:</span>
                        <strong id="printTargetCountText" class="mono font-bold" style="color:#2563eb; font-size:1.1rem; background:#eff6ff; padding:2px 10px; border-radius:6px; border:1px solid #bfdbfe;">0 รายการ</strong>
                    </div>

                    <div class="form-group">
                        <label style="font-weight:700; font-size:0.85rem; margin-bottom:6px; color:#0f172a; display:block;">🏷️ เลือกขนาดกระดาษสติ๊กเกอร์ความร้อน (Thermal Label Size):</label>
                        <select id="barcodeThermalSizeSelect" class="form-control" onchange="toggleCustomPrintSizeInputs(this.value)" style="padding:9px 12px; font-size:0.88rem; border-radius:6px; font-weight:600; border:1px solid #cbd5e1; width:100%; cursor:pointer;">
                            <option value="50x30">🏷️ ขนาด 50 x 30 mm (ขนาดมาตรฐานคลังสินค้าทั่วไป)</option>
                            <option value="40x30">🏷️ ขนาด 40 x 30 mm (ขนาดเล็กกะทัดรัด)</option>
                            <option value="50x40">🏷️ ขนาด 50 x 40 mm (ขนาดทรงสูง)</option>
                            <option value="60x40">🏷️ ขนาด 60 x 40 mm (ขนาดกลาง)</option>
                            <option value="70x50">🏷️ ขนาด 70 x 50 mm (ขนาดใหญ่ชัดเจน)</option>
                            <option value="80x40">🏷️ ขนาด 80 x 40 mm (ขนาดแนวยาว)</option>
                            <option value="80x50">🏷️ ขนาด 80 x 50 mm (ขนาดป้ายติดกล่องสินค้า)</option>
                            <option value="100x75">🏷️ ขนาด 100 x 75 mm (ขนาดป้ายขนส่งใหญ่)</option>
                            <option value="100x150">🏷️ ขนาด 100 x 150 mm (ขนาดป้ายพาเลทพัสดุลัง)</option>
                            <option value="CUSTOM">⚙️ กำหนดขนาดเอง (Custom Width x Height mm)</option>
                        </select>
                    </div>

                    <!-- Custom Size Box -->
                    <div id="customPrintSizeContainer" style="display:none; background:#f0f9ff; padding:12px; border-radius:8px; border:1px solid #bae6fd; grid-template-columns:1fr 1fr; gap:10px;">
                        <div>
                            <label style="font-size:0.78rem; font-weight:700; color:#0369a1; display:block; margin-bottom:4px;">ความกว้าง (Width mm):</label>
                            <input type="number" id="customPrintWidthInput" value="50" min="20" max="200" style="width:100%; padding:6px 10px; border-radius:6px; border:1px solid #7dd3fc; font-weight:700;">
                        </div>
                        <div>
                            <label style="font-size:0.78rem; font-weight:700; color:#0369a1; display:block; margin-bottom:4px;">ความสูง (Height mm):</label>
                            <input type="number" id="customPrintHeightInput" value="30" min="15" max="300" style="width:100%; padding:6px 10px; border-radius:6px; border:1px solid #7dd3fc; font-weight:700;">
                        </div>
                    </div>

                    <div style="display:grid; grid-template-columns:1fr 1fr; gap:10px;">
                        <div>
                            <label style="font-weight:700; font-size:0.82rem; margin-bottom:4px; color:#334155; display:block;">🔢 จำนวนสำเนาพิมพ์ต่อใบ:</label>
                            <select id="printCopyCountSelect" class="form-control" style="padding:7px 10px; font-size:0.85rem; border-radius:6px; font-weight:600; border:1px solid #cbd5e1; width:100%;">
                                <option value="1">พิมพ์ 1 ใบต่อ S/N</option>
                                <option value="2">พิมพ์ 2 ใบต่อ S/N</option>
                                <option value="3">พิมพ์ 3 ใบต่อ S/N</option>
                                <option value="5">พิมพ์ 5 ใบต่อ S/N</option>
                            </select>
                        </div>
                        <div>
                            <label style="font-weight:700; font-size:0.82rem; margin-bottom:4px; color:#334155; display:block;">📍 การแสดงพิกัดจัดเก็บ:</label>
                            <input type="text" value="เว้นช่องไฟ อ่านง่าย ชัดเจน" readonly style="padding:7px 10px; font-size:0.8rem; border-radius:6px; font-weight:700; border:1px solid #cbd5e1; background:#f1f5f9; color:#0f172a; width:100%; box-sizing:border-box;">
                        </div>
                    </div>

                    <div style="background:#f8fafc; padding:12px; border-radius:8px; border:1px solid #cbd5e1;">
                        <label style="font-weight:700; font-size:0.82rem; color:#0f172a; display:block; margin-bottom:8px;">⚙️ เลือกข้อมูลที่จะแสดงบนสติ๊กเกอร์:</label>
                        <div style="display:grid; grid-template-columns:1fr 1fr; gap:8px; font-size:0.8rem; color:#334155;">
                            <label style="display:flex; align-items:center; gap:6px; cursor:pointer;"><input type="checkbox" id="showLabelTitleCb" checked> แสดงรหัส SKU & ชื่อรุ่น</label>
                            <label style="display:flex; align-items:center; gap:6px; cursor:pointer;"><input type="checkbox" id="showLabelLocCb" checked> แสดงพิกัดจัดเก็บสินค้า</label>
                            <label style="display:flex; align-items:center; gap:6px; cursor:pointer;"><input type="checkbox" id="showLabelMeterCb" checked> แสดงเลขมิเตอร์ (Meter)</label>
                            <label style="display:flex; align-items:center; gap:6px; cursor:pointer;"><input type="checkbox" id="showLabelDateCb" checked> แสดงวันที่-เวลาที่พิมพ์</label>
                        </div>
                    </div>

                    <div style="display:grid; grid-template-columns:1fr 1fr; gap:12px; margin-top:4px;">
                        <div onclick="executeBarcodePrintProcess('THERMAL')" style="
                            border: 2px solid #2563eb; background: #eff6ff;
                            border-radius: 10px; padding: 16px 12px; cursor: pointer; text-align: center; transition: all 0.15s ease;
                        " onmouseover="this.style.background='#dbeafe';" onmouseout="this.style.background='#eff6ff';">
                            <i class="fa-solid fa-note-sticky" style="font-size: 2.2rem; color: #2563eb; margin-bottom: 6px;"></i>
                            <div style="font-weight: 800; font-size: 0.92rem; color: #0f172a;">ปริ้นสติ๊กเกอร์ความร้อน</div>
                            <div style="font-size: 0.72rem; color: #475569; margin-top: 3px;">1 บาร์โค้ด ต่อ 1 แผ่น รันต่อเนื่องตามขนาดที่เลือก</div>
                        </div>

                        <div onclick="executeBarcodePrintProcess('A4')" style="
                            border: 2px solid #94a3b8; background: #f8fafc;
                            border-radius: 10px; padding: 16px 12px; cursor: pointer; text-align: center; transition: all 0.15s ease;
                        " onmouseover="this.style.background='#f1f5f9'; this.style.borderColor='#2563eb';" onmouseout="this.style.background='#f8fafc'; this.style.borderColor='#94a3b8';">
                            <i class="fa-solid fa-file-lines" style="font-size: 2.2rem; color: #475569; margin-bottom: 6px;"></i>
                            <div style="font-weight: 800; font-size: 0.92rem; color: #0f172a;">กระดาษ A4 ภาพรวม</div>
                            <div style="font-size: 0.72rem; color: #475569; margin-top: 3px;">จัดเรียงบาร์โค้ดเป็นตารางหลายป้ายต่อหน้า A4</div>
                        </div>
                    </div>
                </div>

                <div class="modal-footer" style="
                    padding: 12px 20px; border-top: 1px solid #e2e8f0;
                    display: flex; justify-content: flex-end; background: #f8fafc;
                ">
                    <button type="button" class="btn btn-secondary" onclick="closePrintConfigModal()" style="border-radius:6px; font-weight:600; padding:6px 16px; font-size:0.82rem;">ปิดหน้าต่าง</button>
                </div>
            </div>
        `;
        document.body.appendChild(modal);
    }
}

function toggleCustomPrintSizeInputs(val) {
    const customContainer = document.getElementById('customPrintSizeContainer');
    if (customContainer) {
        customContainer.style.display = (val === 'CUSTOM') ? 'grid' : 'none';
    }
}

function closePrintConfigModal() {
    const modal = document.getElementById('printConfigSelectionModal');
    if (modal) modal.style.display = 'none';
}

function openPrintBarcodeModal(mode, targetSn = null) {
    let snList = [];
    if (mode === 'SINGLE' && targetSn) {
        snList = [targetSn];
    } else {
        snList = Array.from(selectedItemSnSet);
    }

    if (snList.length === 0) {
        if (typeof showToast === 'function') showToast("⚠️ กรุณาเลือกรายการสินค้าอย่างน้อย 1 รายการเพื่อพิมพ์บาร์โค้ด", true);
        else alert("⚠️ กรุณาเลือกรายการสินค้าอย่างน้อย 1 รายการเพื่อพิมพ์บาร์โค้ด");
        return;
    }

    pendingBarcodePrintTarget = snList;
    ensurePrintConfigModalExists();

    const countElem = document.getElementById('printTargetCountText');
    if (countElem) countElem.textContent = `${snList.length.toLocaleString()} รายการ`;

    const modal = document.getElementById('printConfigSelectionModal');
    if (modal) modal.style.display = 'flex';
}

function executeBarcodePrintProcess(paperType) {
    const sizeSelect = document.getElementById('barcodeThermalSizeSelect');
    let labelSizeKey = sizeSelect ? sizeSelect.value : '50x30';

    const copiesCount = parseInt(document.getElementById('printCopyCountSelect')?.value || '1', 10);
    const showTitle = document.getElementById('showLabelTitleCb')?.checked ?? true;
    const showLoc = document.getElementById('showLabelLocCb')?.checked ?? true;
    const showMeter = document.getElementById('showLabelMeterCb')?.checked ?? true;
    const showDate = document.getElementById('showLabelDateCb')?.checked ?? true;

    closePrintConfigModal();
    const snList = pendingBarcodePrintTarget || [];
    if (snList.length === 0) return;

    let widthMm = 50;
    let heightMm = 30;

    if (labelSizeKey === 'CUSTOM') {
        widthMm = parseFloat(document.getElementById('customPrintWidthInput')?.value) || 50;
        heightMm = parseFloat(document.getElementById('customPrintHeightInput')?.value) || 30;
    } else {
        const parts = labelSizeKey.split('x');
        widthMm = parseFloat(parts[0]) || 50;
        heightMm = parseFloat(parts[1]) || 30;
    }

    // คำนวณสเกล ขนาดฟอนต์ และความสูงบาร์โค้ด SVG แบบ Dynamic ให้พอดีกับทุกขนาดกระดาษสติ๊กเกอร์
    const hRatio = heightMm / 30;
    const wRatio = widthMm / 50;

    const svgH = `${Math.min(Math.max(10, Math.floor(12 * hRatio)), 80)}mm`;
    const fontSn = `${Math.min(Math.max(7, Math.floor(8.5 * Math.min(wRatio, hRatio))), 16)}pt`;
    const fontTitle = `${Math.min(Math.max(5.5, Math.floor(6.5 * Math.min(wRatio, hRatio))), 12)}pt`;
    const fontLoc = `${Math.min(Math.max(6, Math.floor(7 * Math.min(wRatio, hRatio))), 13)}pt`;
    const barWidth = Math.max(1.1, Math.min(2.5, 1.3 * wRatio));

    try {
        const printWin = window.open('', '_blank', 'width=980,height=780');
        if (!printWin) {
            if (typeof showToast === 'function') showToast("⚠️ เบราว์เซอร์บล็อก Pop-up กรุณาอนุญาตให้เปิดหน้าต่างใหม่เพื่อพิมพ์บาร์โค้ด", true);
            else alert("⚠️ เบราว์เซอร์บล็อก Pop-up กรุณาอนุญาตให้เปิดหน้าต่างใหม่เพื่อพิมพ์บาร์โค้ด");
            return;
        }

        const nowStr = new Date().toLocaleString('th-TH', { dateStyle: 'short', timeStyle: 'short' });
        let labelHtml = '';

        snList.forEach(sn => {
            const item = globalInventoryData.find(i => String(i.sn).toLowerCase() === String(sn).toLowerCase()) || { sn, category: '-', name: '-', location: '-', meter: 0 };
            const rawLoc = item.location || 'DOCK';
            const locFormattedWithSpace = typeof formatLocationCode === 'function' ? formatLocationCode(rawLoc) : rawLoc;
            const meterValue = item.meter !== undefined && item.meter !== null ? item.meter : 0;

            for (let c = 0; c < copiesCount; c++) {
                labelHtml += `
                    <div class="barcode-card">
                        <div class="barcode-sn">${escapeHTML(item.sn)}</div>
                        
                        ${showTitle ? `<div class="barcode-title">[${escapeHTML(item.category || '-')}] ${escapeHTML(item.name || '-')}</div>` : ''}
                        
                        <div class="barcode-svg-wrap">
                            <svg id="barcode_${escapeHTML(item.sn)}_${c}"></svg>
                        </div>
                        
                        ${showLoc ? `<div class="barcode-loc">📍 ${escapeHTML(locFormattedWithSpace)}</div>` : ''}

                        <div class="barcode-meta-row">
                            ${showMeter ? `<span>มิเตอร์: ${Number(meterValue).toLocaleString()}</span>` : '<span></span>'}
                            ${showDate ? `<span>${nowStr}</span>` : '<span></span>'}
                        </div>
                    </div>
                `;
            }
        });

        const isThermal = (paperType === 'THERMAL');
        const customStyle = isThermal ? `
            @page { size: ${widthMm}mm ${heightMm}mm; margin: 0; }
            html, body { width: ${widthMm}mm; margin: 0; padding: 0; background: #fff; font-family: system-ui, -apple-system, sans-serif; }
            .barcode-card {
                width: ${widthMm}mm; height: ${heightMm}mm; padding: 1.2mm 1.8mm; box-sizing: border-box;
                display: flex; flex-direction: column; align-items: center; justify-content: space-between;
                text-align: center; page-break-after: always; page-break-inside: avoid; border: none; overflow: hidden;
            }
            .barcode-sn { font-weight: 800; font-size: ${fontSn}; font-family: monospace; letter-spacing: 0.5px; line-height: 1.1; margin-bottom: 1px; color: #000; flex-shrink: 0; }
            .barcode-title { font-size: ${fontTitle}; color: #0f172a; width: 100%; max-width: 100%; white-space: normal; word-break: break-word; overflow: visible; text-overflow: clip; line-height: 1.2; font-weight: 700; margin: 1px 0; }
            .barcode-svg-wrap { display: flex; align-items: center; justify-content: center; width: 100%; margin: 1px 0; flex-shrink: 0; }
            .barcode-loc { font-size: ${fontLoc}; font-weight: 800; color: #0284c7; line-height: 1.2; margin-top: 1px; flex-shrink: 0; white-space: nowrap; }
            .barcode-meta-row { width:100%; display:flex; justify-content:space-between; font-size: calc(${fontTitle} * 0.85); color:#64748b; font-weight:600; line-height:1; }
            svg { max-width: 100%; height: ${svgH}; }
        ` : `
            @page { size: A4 portrait; margin: 6mm; }
            body { font-family: system-ui, -apple-system, sans-serif; margin: 0; padding: 6px; display: flex; flex-wrap: wrap; gap: 8px; background: #fff; justify-content: flex-start; }
            .barcode-card {
                width: 63mm; min-height: 44mm; border: 1px dashed #cbd5e1; padding: 6px 8px; box-sizing: border-box;
                display: flex; flex-direction: column; align-items: center; justify-content: space-between;
                text-align: center; page-break-inside: avoid; border-radius: 6px; background: #ffffff;
            }
            .barcode-sn { font-weight: 800; font-size: 10.5pt; font-family: monospace; letter-spacing: 0.5px; line-height: 1.2; margin-bottom: 2px; color: #0f172a; flex-shrink: 0; }
            .barcode-title { font-size: 8pt; color: #1e293b; width: 100%; max-width: 100%; white-space: normal; word-break: break-word; overflow: visible; text-overflow: clip; line-height: 1.25; font-weight: 700; margin: 3px 0; }
            .barcode-svg-wrap { display: flex; align-items: center; justify-content: center; width: 100%; margin: 3px 0; flex-shrink: 0; }
            .barcode-loc { font-size: 8pt; font-weight: 800; color: #0284c7; line-height: 1.25; margin-top: 2px; background: #f0f9ff; padding: 3px 6px; border-radius: 4px; border: 1px solid #bae6fd; width: 98%; box-sizing: border-box; flex-shrink: 0; white-space: nowrap; }
            .barcode-meta-row { width:95%; display:flex; justify-content:space-between; font-size:7pt; color:#64748b; font-weight:600; margin-top:2px; }
            svg { max-width: 100%; height: 14mm; }
        `;

        printWin.document.write(`
            <!DOCTYPE html>
            <html>
            <head>
                <title>Print Barcodes (${snList.length * copiesCount} ใบ)</title>
                <script src="https://cdn.jsdelivr.net/npm/jsbarcode@3.11.5/dist/JsBarcode.all.min.js"></script>
                <style>${customStyle}</style>
            </head>
            <body>
                ${labelHtml}
                <script>
                    window.onload = function() {
                        const sns = ${JSON.stringify(snList)};
                        const copies = ${copiesCount};
                        sns.forEach(sn => {
                            for (let c = 0; c < copies; c++) {
                                try {
                                    JsBarcode("#barcode_" + sn + "_" + c, sn, {
                                        format: "CODE128",
                                        width: ${isThermal ? barWidth : 1.5},
                                        height: ${isThermal ? Math.max(22, Math.floor(28 * hRatio)) : 32},
                                        displayValue: false,
                                        margin: 0
                                    });
                                } catch(e) { console.error("Barcode generation error for " + sn, e); }
                            }
                        });
                        setTimeout(function() {
                            window.print();
                        }, 400);
                    };
                </script>
            </body>
            </html>
        `);
        printWin.document.close();
    } catch (err) {
        console.error("Print barcode error:", err);
        if (typeof showToast === 'function') showToast("❌ เกิดข้อผิดพลาดในการพิมพ์บาร์โค้ด: " + err.message, true);
    }
}

function printSelectedBarcodesFromModal() {
    openPrintBarcodeModal('MULTI');
}

// -------------------------------------------------------------------------
// 📊 EXCEL EXPORT ENGINE
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
            align-items: center; justify-content: center; backdrop-filter: blur(4px);
            padding: 16px; box-sizing: border-box;
        `;
        modal.innerHTML = `
            <div class="modal-content" style="
                background: #ffffff; border-radius: 12px; max-width: 500px; width: 95%;
                display: flex; flex-direction: column; box-shadow: 0 20px 25px -5px rgba(0, 0, 0, 0.2);
                border: 1px solid #cbd5e1; overflow: hidden;
            ">
                <div class="modal-header" style="
                    padding: 16px 20px; border-bottom: 1px solid #e2e8f0;
                    display: flex; justify-content: space-between; align-items: center; background: #f8fafc;
                ">
                    <h3 style="margin:0; font-size:1.1rem; color:#0f172a; font-weight:800; display:flex; align-items:center; gap:8px;">
                        <i class="fa-solid fa-file-excel" style="color:#10b981;"></i> คัดกรองการส่งออก Excel สต็อก
                    </h3>
                    <button type="button" onclick="closeExcelExportModal()" style="
                        background: transparent; border: none; font-size: 1.25rem; cursor: pointer; color: #64748b;
                    ">&times;</button>
                </div>
                
                <div class="modal-body" style="padding: 20px; display:flex; flex-direction:column; gap:14px;">
                    <div class="form-group">
                        <label style="font-weight:700; font-size:0.82rem; margin-bottom:4px; display:block;">📦 รูปแบบและขอบเขตข้อมูลที่จะส่งออก:</label>
                        <select id="exportScopeSelect" class="form-control" onchange="onExportScopeChange(this.value)" style="padding:8px 10px; font-size:0.88rem; border-radius:6px; border:1px solid #cbd5e1;">
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
                    <button type="button" class="btn btn-secondary" onclick="closeExcelExportModal()" style="border-radius:6px; font-weight:600; padding:6px 16px; font-size:0.82rem;">ยกเลิก</button>
                    <button type="button" class="btn btn-success" onclick="executeExcelExport()" style="border-radius:6px; font-weight:700; padding:6px 20px; font-size:0.82rem; background:#10b981; border-color:#10b981;"><i class="fa-solid fa-download"></i> ดาวน์โหลด Excel</button>
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
        scopeSelect.value = selectedItemSnSet.size > 0 ? 'SELECTED' : 'ALL';
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

    const discoveredAisles = discoverAllDatabaseAisles();
    let options = `<option value="ALL">🌐 ทุกล็อกแถวจัดเก็บ (${globalInventoryData.length} รายการ)</option>`;
    
    discoveredAisles.forEach(a => {
        const count = globalInventoryData.filter(i => extractAisleKey(i.location) === a).length;
        const label = formatAisleBayLabel(a);
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
    globalInventoryData.forEach(item => {
        if (extractAisleKey(item.location) === aisleVal) {
            const bayKey = extractBayKey(item.location);
            if (bayKey) baySet.add(bayKey);
        }
    });

    const sortedBays = Array.from(baySet).sort();
    let options = `<option value="ALL">📍 ทุกล็อกในแถว ${escapeHTML(aisleVal)} (${sortedBays.length} ล็อก)</option>`;
    sortedBays.forEach(b => {
        const count = globalInventoryData.filter(i => extractAisleKey(i.location) === aisleVal && extractBayKey(i.location) === b).length;
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
        exportItems = [...currentFilteredItems];
    } else if (scope === 'SELECTED') {
        exportItems = globalInventoryData.filter(i => selectedItemSnSet.has(i.sn));
    } else if (scope === 'AISLE_BAY') {
        exportItems = globalInventoryData.filter(item => {
            const matchAisle = (selectedAisle === 'ALL') || (extractAisleKey(item.location) === selectedAisle);
            const matchBay = (selectedBay === 'ALL') || (extractBayKey(item.location) === selectedBay);
            return matchAisle && matchBay;
        });
    } else {
        exportItems = [...globalInventoryData];
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
        "พิกัดจัดเก็บ": typeof formatLocationCode === 'function' ? formatLocationCode(item.location) : item.location,
        "จำนวน": item.qty || 1,
        "ผู้รับสินค้าเข้า (User)": formatReceiverFullName(item),
        "วันที่รับเข้า": item.created_at ? new Date(item.created_at).toLocaleString('th-TH') : '-'
    }));

    const worksheet = XLSX.utils.json_to_sheet(rows);
    autoFitExcelColumns(worksheet, rows);

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
    if (!currentDetailModalGroupKey) return;
    const grp = currentInventoryGroups.find(g => g.groupKey === currentDetailModalGroupKey);
    if (!grp) return;

    const selectedAisleBay = (document.getElementById('stockDetailModalLocationFilter')?.value || 'ALL').toUpperCase();
    let exportItems = [...grp.items];

    if (selectedAisleBay !== 'ALL') {
        exportItems = exportItems.filter(item => extractAisleBayKey(item.location) === selectedAisleBay);
    }

    if (selectedItemSnSet.size > 0) {
        const checkedModalItems = exportItems.filter(i => selectedItemSnSet.has(i.sn));
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
        "พิกัดจัดเก็บ": typeof formatLocationCode === 'function' ? formatLocationCode(item.location) : item.location,
        "จำนวน": item.qty || 1,
        "ผู้รับสินค้าเข้า (User)": formatReceiverFullName(item),
        "วันที่รับเข้า": item.created_at ? new Date(item.created_at).toLocaleString('th-TH') : '-'
    }));

    const worksheet = XLSX.utils.json_to_sheet(rows);
    autoFitExcelColumns(worksheet, rows);

    const workbook = XLSX.utils.book_new();
    XLSX.utils.book_append_sheet(workbook, worksheet, "Stock_Serials");

    const locTag = selectedAisleBay === 'ALL' ? 'All_Locations' : `Location_${selectedAisleBay}`;
    const filename = `WMS_Stock_${grp.category}_${locTag}_${new Date().toISOString().slice(0, 10)}.xlsx`;

    XLSX.writeFile(workbook, filename);
    if (typeof showToast === 'function') {
        showToast(`📊 ส่งออก Excel สำเร็จจำนวน ${rows.length.toLocaleString()} รายการ`);
    }
}