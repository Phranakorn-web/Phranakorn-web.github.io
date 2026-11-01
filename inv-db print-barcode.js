// =========================================================================
// 📌 [WMS BARCODE PRINT ENGINE v11.1 - DATABASE LOCATION ACCURACY & UNIFIED STYLING]
// ไฟล์: inv-db print-barcode.js
// ศูนย์ควบคุมระบบพิมพ์บาร์โค้ดเดี่ยว/กลุ่ม 100% (Single & Batch Thermal/A4)
// รองรับการพิมพ์บาร์โค้ดเรียลไทม์จากหน้ารับเข้าสินค้า (Inbound Feed Sync) 100%
// ดึงข้อมูลพิกัดจัดเก็บ (แถว/ล็อก/ชั้น/ช่อง) ตรงกับฐานข้อมูล 100%
// =========================================================================

(function() {
    'use strict';

    // -------------------------------------------------------------------------
    // 1. GLOBAL CONFIGURATION & PRINT STATE
    // -------------------------------------------------------------------------
    window.wmsPrintSettings = window.wmsPrintSettings || {
        printCategory: 'THERMAL',    // 'THERMAL' | 'A4'
        thermalSize: '50x30',         // '40x30', '50x30', '50x40', '60x40', '70x50', '80x50', '100x75', '100x150', 'CUSTOM'
        customWidth: 50,
        customHeight: 30,
        copiesPerSn: 1,              // จำนวนสำเนาต่อ S/N
        barcodesPerLabel: 1,         // 1 = 1 บาร์โค้ด/ดวง, 2 = 2 บาร์โค้ด/ดวง (คู่)
        a4Layout: 'GRID_24',          // 'GRID_24' (3x8 = 24 บาร์โค้ด) | 'GRID_40' (4x10 = 40 บาร์โค้ด) | 'REPORT'
        showSku: true,
        showName: true,
        showLocation: true,
        showMeter: true,
        showDate: true
    };

    window.pendingBarcodePrintTarget = window.pendingBarcodePrintTarget || [];

    // -------------------------------------------------------------------------
    // 2. HELPER FUNCTIONS: DYNAMIC LAYOUT SCALER & DATABASE LOCATION FORMATTER
    // -------------------------------------------------------------------------
    
    /**
     * คำนวณขนาดฟอนต์ ระยะเว้นขอบ และความสูงบาร์โค้ดอัตโนมัติแบบ Dynamic
     * ตามขนาดจริงของสติ๊กเกอร์ (กว้าง x สูง mm) เพื่อไม่ให้ข้อมูลหลุดกรอบ 100%
     */
    function getThermalScaleParams(widthMm, heightMm) {
        const w = parseFloat(widthMm) || 50;
        const h = parseFloat(heightMm) || 30;

        let scale = {
            fontSizeSku: '8.5px',
            fontSizeName: '7.5px',
            fontSizeSn: '8.5px',
            fontSizeLoc: '8px',
            fontSizeLocLbl: '5.5px',
            fontSizeDate: '6px',
            barcodeHeightMm: 9,
            paddingMm: '1.2mm 1.8mm',
            lineHeight: '1.1',
            dateAlign: 'right'
        };

        if (h <= 25) {
            // ขนาดเล็กมาก เช่น 40x20 หรือ 50x20
            scale.fontSizeSku = '7px';
            scale.fontSizeName = '6px';
            scale.fontSizeSn = '7px';
            scale.fontSizeLoc = '6.5px';
            scale.fontSizeLocLbl = '4.5px';
            scale.fontSizeDate = '5px';
            scale.barcodeHeightMm = 6.5;
            scale.paddingMm = '0.6mm 1mm';
            scale.lineHeight = '1.0';
        } else if (h <= 32) {
            // ขนาดมาตรฐาน 50x30, 40x30
            scale.fontSizeSku = '8px';
            scale.fontSizeName = '7px';
            scale.fontSizeSn = '8px';
            scale.fontSizeLoc = '7.5px';
            scale.fontSizeLocLbl = '5px';
            scale.fontSizeDate = '5.8px';
            scale.barcodeHeightMm = 8.5;
            scale.paddingMm = '1mm 1.5mm';
            scale.lineHeight = '1.08';
        } else if (h <= 45) {
            // ขนาดกลาง 50x40, 60x40
            scale.fontSizeSku = '9.5px';
            scale.fontSizeName = '8.5px';
            scale.fontSizeSn = '9.5px';
            scale.fontSizeLoc = '9px';
            scale.fontSizeLocLbl = '6px';
            scale.fontSizeDate = '7px';
            scale.barcodeHeightMm = 12;
            scale.paddingMm = '1.5mm 2mm';
            scale.lineHeight = '1.15';
        } else if (h <= 60) {
            // ขนาดใหญ่ 70x50, 80x50
            scale.fontSizeSku = '11px';
            scale.fontSizeName = '9.5px';
            scale.fontSizeSn = '11px';
            scale.fontSizeLoc = '10.5px';
            scale.fontSizeLocLbl = '7px';
            scale.fontSizeDate = '8px';
            scale.barcodeHeightMm = 16;
            scale.paddingMm = '2mm 2.5mm';
            scale.lineHeight = '1.2';
        } else {
            // ขนาดใหญ่มาก 100x75, 100x150
            scale.fontSizeSku = '14px';
            scale.fontSizeName = '12px';
            scale.fontSizeSn = '14px';
            scale.fontSizeLoc = '13px';
            scale.fontSizeLocLbl = '8.5px';
            scale.fontSizeDate = '9.5px';
            scale.barcodeHeightMm = 24;
            scale.paddingMm = '3mm 3.5mm';
            scale.lineHeight = '1.25';
        }

        // ปรับสำหรับกรณี 2 บาร์โค้ดต่อ 1 ดวง (สติ๊กเกอร์คู่)
        if (w >= 70 && window.wmsPrintSettings.barcodesPerLabel === 2) {
            scale.fontSizeSku = (parseFloat(scale.fontSizeSku) * 0.9) + 'px';
            scale.fontSizeName = (parseFloat(scale.fontSizeName) * 0.9) + 'px';
            scale.fontSizeSn = (parseFloat(scale.fontSizeSn) * 0.9) + 'px';
        }

        return scale;
    }

    /**
     * ดึงพิกัดจัดเก็บให้ตรงกับฐานข้อมูล 100% พร้อมจัดสี แถว ล็อก ชั้น ช่อง ให้เป็นโทนเดียวกันอ่านง่าย
     */
    function formatLocation2LinesHtml(locInput, itemObj = null) {
        let rawLocStr = '';
        
        // รองรับทั้งการส่ง String พิกัด หรือส่ง Object สินค้าตรงจาก DB
        if (itemObj && typeof itemObj === 'object') {
            if (itemObj.aisle || itemObj.bay || itemObj.shelf || itemObj.slot) {
                const aisle = (typeof window.escapeHTML === 'function') ? window.escapeHTML(itemObj.aisle || '-') : (itemObj.aisle || '-');
                const bay = (typeof window.escapeHTML === 'function') ? window.escapeHTML(itemObj.bay || '-') : (itemObj.bay || '-');
                const shelf = (typeof window.escapeHTML === 'function') ? window.escapeHTML(itemObj.shelf || '-') : (itemObj.shelf || '-');
                const slot = (typeof window.escapeHTML === 'function') ? window.escapeHTML(itemObj.slot || '-') : (itemObj.slot || '-');
                
                return `
                    <div style="display:block; line-height:1.1; text-align:center;">
                        <div style="font-weight:900; color:#0f172a;">แถว ${aisle}  ล็อก ${bay}</div>
                        <div style="margin-top:1px; color:#0f172a; font-weight:900;">ชั้น ${shelf}  ช่อง ${slot}</div>
                    </div>
                `;
            }
            rawLocStr = itemObj.location || itemObj.loc || itemObj.storage_location || itemObj.location_code || '';
        } else if (typeof locInput === 'object' && locInput !== null) {
            if (locInput.aisle || locInput.bay || locInput.shelf || locInput.slot) {
                const aisle = (typeof window.escapeHTML === 'function') ? window.escapeHTML(locInput.aisle || '-') : (locInput.aisle || '-');
                const bay = (typeof window.escapeHTML === 'function') ? window.escapeHTML(locInput.bay || '-') : (locInput.bay || '-');
                const shelf = (typeof window.escapeHTML === 'function') ? window.escapeHTML(locInput.shelf || '-') : (locInput.shelf || '-');
                const slot = (typeof window.escapeHTML === 'function') ? window.escapeHTML(locInput.slot || '-') : (locInput.slot || '-');
                
                return `
                    <div style="display:block; line-height:1.1; text-align:center;">
                        <div style="font-weight:900; color:#0f172a;">แถว ${aisle}  ล็อก ${bay}</div>
                        <div style="margin-top:1px; color:#0f172a; font-weight:900;">ชั้น ${shelf}  ช่อง ${slot}</div>
                    </div>
                `;
            }
            rawLocStr = locInput.location || locInput.loc || locInput.storage_location || locInput.location_code || '';
        } else {
            rawLocStr = locInput;
        }

        if (!rawLocStr) return '<span style="font-weight:900; color:#0f172a;">📍 DOCK</span>';
        const clean = String(rawLocStr).trim().toUpperCase();
        
        if (['DOCK', 'OFFICE', 'PENDING', 'FOOD', 'FREEZER', 'COLD', 'DRY', 'RAW'].includes(clean)) {
            const safeDock = (typeof window.escapeHTML === 'function') ? window.escapeHTML(clean) : clean;
            return `<span style="font-weight:900; color:#0f172a;">📍 ${safeDock}</span>`;
        }

        const parts = clean.split(/[\-\/_]+/);
        if (parts.length >= 4) {
            const aisle = (typeof window.escapeHTML === 'function') ? window.escapeHTML(parts[0]) : parts[0];
            const bay = (typeof window.escapeHTML === 'function') ? window.escapeHTML(parts[1]) : parts[1];
            const shelf = (typeof window.escapeHTML === 'function') ? window.escapeHTML(parts[2]) : parts[2];
            const slot = (typeof window.escapeHTML === 'function') ? window.escapeHTML(parts[3]) : parts[3];
            return `
                <div style="display:block; line-height:1.1; text-align:center;">
                    <div style="font-weight:900; color:#0f172a;">แถว ${aisle}  ล็อก ${bay}</div>
                    <div style="margin-top:1px; color:#0f172a; font-weight:900;">ชั้น ${shelf}  ช่อง ${slot}</div>
                </div>
            `;
        } else if (parts.length === 3) {
            const aisle = (typeof window.escapeHTML === 'function') ? window.escapeHTML(parts[0]) : parts[0];
            const bay = (typeof window.escapeHTML === 'function') ? window.escapeHTML(parts[1]) : parts[1];
            const shelf = (typeof window.escapeHTML === 'function') ? window.escapeHTML(parts[2]) : parts[2];
            return `
                <div style="display:block; line-height:1.1; text-align:center;">
                    <div style="font-weight:900; color:#0f172a;">แถว ${aisle}  ล็อก ${bay}</div>
                    <div style="margin-top:1px; color:#0f172a; font-weight:900;">ชั้น ${shelf}</div>
                </div>
            `;
        }
        
        const formatted = (typeof window.formatLocationCode === 'function') ? window.formatLocationCode(clean) : clean;
        const safeText = (typeof window.escapeHTML === 'function') ? window.escapeHTML(formatted) : formatted;
        return `<div style="white-space:normal !important; word-break:break-word !important; font-weight:900; color:#0f172a; line-height:1.1; text-align:center;">📍 ${safeText}</div>`;
    }

    function getFormattedPrintDate() {
        const now = new Date();
        const day = String(now.getDate()).padStart(2, '0');
        const month = String(now.getMonth() + 1).padStart(2, '0');
        const year = now.getFullYear() + 543;
        const hours = String(now.getHours()).padStart(2, '0');
        const mins = String(now.getMinutes()).padStart(2, '0');
        return `${day}/${month}/${year} ${hours}:${mins}`;
    }

    // -------------------------------------------------------------------------
    // 3. PURE JS HIGH-PRECISION CODE128 BARCODE GENERATOR ENGINE
    // -------------------------------------------------------------------------
    const CODE128_PATTERNS = [
        "212222", "222122", "222221", "121223", "121322", "131222", "122213", "122312", "132212", "221213",
        "221312", "231212", "112232", "122132", "122231", "113222", "123122", "123221", "223211", "221132",
        "221231", "213212", "223112", "312131", "311222", "321122", "321221", "312212", "322112", "322211",
        "212123", "212321", "232121", "111323", "131123", "131321", "112313", "132113", "132311", "211313",
        "231113", "231311", "112133", "112331", "132131", "113123", "113321", "133121", "313121", "211331",
        "231131", "213113", "213311", "213131", "311123", "311321", "331121", "312113", "312311", "332111",
        "314111", "221411", "431111", "111224", "111422", "121124", "121421", "141122", "141221", "112214",
        "112412", "122114", "122411", "142112", "142211", "241211", "221114", "413111", "241112", "134111",
        "111242", "121142", "121241", "114212", "124112", "124211", "411212", "421112", "421211", "212141",
        "214121", "412121", "111143", "111341", "131141", "114113", "114311", "411113", "411311", "113141",
        "114131", "311141", "411131", "211412", "211214", "211232", "2331112"
    ];

    /**
     * แปลงข้อความ S/N ให้เป็น Base64 Image DataURL ของ Code128 ที่คมชัดสูงสุด
     * ปรับความสูง dynamic เพื่อให้สแกนง่ายบนเครื่องพิมพ์ thermal และ A4
     */
    function generateCode128DataUrl(text, options = {}) {
        const str = String(text || '').trim();
        if (!str) return '';

        const scale = options.scale || 3;
        const height = options.height || 42;
        const quietZoneModules = options.quietZone || 10;

        const codeUnits = [104]; // Start B
        let checksum = 104;

        for (let i = 0; i < str.length; i++) {
            let code = str.charCodeAt(i) - 32;
            if (code < 0 || code > 95) code = 0;
            codeUnits.push(code);
            checksum += code * (i + 1);
        }

        const checkDigit = checksum % 103;
        codeUnits.push(checkDigit);
        codeUnits.push(106); // Stop Pattern

        let barSequence = "";
        for (let idx of codeUnits) {
            barSequence += CODE128_PATTERNS[idx] || "";
        }

        let totalModules = 0;
        for (let c of barSequence) {
            totalModules += parseInt(c, 10);
        }

        const moduleWidth = Math.max(1, scale);
        const canvas = document.createElement('canvas');
        canvas.width = (totalModules + (quietZoneModules * 2)) * moduleWidth;
        canvas.height = height * scale;

        const ctx = canvas.getContext('2d');
        ctx.fillStyle = '#ffffff';
        ctx.fillRect(0, 0, canvas.width, canvas.height);

        ctx.fillStyle = '#000000';
        let currentX = quietZoneModules * moduleWidth;
        let isBar = true;

        for (let c of barSequence) {
            const w = parseInt(c, 10) * moduleWidth;
            if (isBar) {
                ctx.fillRect(Math.floor(currentX), 0, Math.ceil(w), canvas.height);
            }
            currentX += w;
            isBar = !isBar;
        }

        return canvas.toDataURL('image/png');
    }

    function renderHighPrecisionBarcode(canvas, text) {
        if (!canvas || !text) return;

        if (typeof window.JsBarcode === 'function') {
            try {
                window.JsBarcode(canvas, text, {
                    format: "CODE128",
                    displayValue: false,
                    margin: 4,
                    width: 1.8,
                    height: 42,
                    lineColor: "#000000",
                    background: "#ffffff",
                    flat: true
                });
                return;
            } catch (e) {
                console.warn("JsBarcode fallback triggered:", e);
            }
        }

        const dataUrl = generateCode128DataUrl(text, { scale: 2, height: 42 });
        if (dataUrl) {
            const img = new Image();
            img.onload = function() {
                const ctx = canvas.getContext('2d');
                canvas.width = img.width;
                canvas.height = img.height;
                ctx.drawImage(img, 0, 0);
            };
            img.src = dataUrl;
        }
    }

    // -------------------------------------------------------------------------
    // 4. OVERLAY MODAL BUILDER
    // -------------------------------------------------------------------------
    function ensurePrintBarcodeModalExists() {
        let modal = document.getElementById('printBarcodeModal');
        if (!modal) {
            modal = document.createElement('div');
            modal.id = 'printBarcodeModal';
        }
        
        modal.className = 'modal-overlay';
        modal.style.cssText = `
            display: none; position: fixed !important; top: 0 !important; left: 0 !important;
            width: 100vw !important; height: 100vh !important; background: rgba(15, 23, 42, 0.82) !important;
            z-index: 9999999 !important; align-items: center; justify-content: center;
            backdrop-filter: blur(6px); padding: 16px; box-sizing: border-box; margin: 0 !important;
        `;

        modal.innerHTML = `
            <div class="modal-content" style="
                background: #ffffff; border-radius: 18px; max-width: 980px; width: 96%;
                max-height: 92vh; display: flex; flex-direction: column;
                box-shadow: 0 25px 50px -12px rgba(0,0,0,0.45); border: 1px solid #cbd5e1;
                overflow: hidden; font-family: system-ui, -apple-system, sans-serif; margin: auto;
            ">
                <!-- Header -->
                <div style="
                    padding: 16px 22px; border-bottom: 1px solid #e2e8f0;
                    display: flex; justify-content: space-between; align-items: center; background: #f8fafc; flex-shrink: 0;
                ">
                    <div style="display:flex; align-items:center; gap:10px;">
                        <i class="fa-solid fa-print" style="color:#2563eb; font-size:1.3rem;"></i>
                        <div>
                            <h3 style="margin:0; font-size:1.15rem; color:#0f172a; font-weight:800;">ศูนย์ตั้งค่าและพิมพ์บาร์โค้ด WMS v11.1</h3>
                            <div style="font-size:0.78rem; color:#64748b; margin-top:2px;">รองรับ Thermal ทุกขนาด พิมพ์เดี่ยว/ม้วนยาวต่อเนื่อง พิกัดจัดเก็บตรงฐานข้อมูล 100%</div>
                        </div>
                    </div>
                    <button type="button" onclick="closePrintBarcodeModal()" style="background:#f1f5f9; border:1px solid #cbd5e1; width:36px; height:36px; border-radius:50%; font-size:1.3rem; cursor:pointer; color:#64748b; display:flex; align-items:center; justify-content:center;">&times;</button>
                </div>

                <!-- Controls Toolbar -->
                <div style="padding:14px 20px; background:#eff6ff; border-bottom:1px solid #bfdbfe; display:flex; flex-direction:column; gap:12px; flex-shrink:0;">
                    <div style="display:flex; justify-content:space-between; align-items:center; flex-wrap:wrap; gap:12px;">
                        
                        <!-- โหมดพิมพ์ -->
                        <div style="display:flex; align-items:center; gap:6px; font-size:0.85rem; font-weight:700; color:#1e40af;">
                            <span><i class="fa-solid fa-sliders" style="color:#2563eb;"></i> โหมดพิมพ์:</span>
                            <select id="wmsPrintCategorySelect" onchange="onPrintCategoryChange(this.value)" style="padding:7px 12px; border-radius:8px; border:1px solid #93c5fd; font-weight:700; outline:none; background:#fff; color:#1e3a8a; cursor:pointer;">
                                <option value="THERMAL">🏷️ สติ๊กเกอร์ความร้อน (Thermal Label Continuous Roll)</option>
                                <option value="A4">📄 กระดาษ A4 (A4 Sheet / Grid / Report)</option>
                            </select>
                        </div>

                        <!-- ตัวเลือก Thermal Size -->
                        <div id="wmsThermalSizeWrapper" style="display:flex; align-items:center; gap:6px; font-size:0.85rem; font-weight:700; color:#1e40af;">
                            <span>ขนาดสติ๊กเกอร์:</span>
                            <select id="wmsThermalSizeSelect" onchange="onThermalSizeSelectChange(this.value)" style="padding:7px 12px; border-radius:8px; border:1px solid #93c5fd; font-weight:700; outline:none; background:#fff; color:#1e3a8a; cursor:pointer;">
                                <option value="50x30">50mm x 30mm (มาตรฐานคลัง)</option>
                                <option value="40x30">40mm x 30mm (ขนาดเล็ก)</option>
                                <option value="50x40">50mm x 40mm (ทรงสูง)</option>
                                <option value="60x40">60mm x 40mm (ขนาดกลาง)</option>
                                <option value="70x50">70mm x 50mm (ขนาดใหญ่)</option>
                                <option value="80x50">80mm x 50mm (ป้ายกล่อง/พาเลท)</option>
                                <option value="100x75">100mm x 75mm (Shipping Label)</option>
                                <option value="100x150">100mm x 150mm (Large Box)</option>
                                <option value="CUSTOM">⚙️ กำหนดขนาดเอง (Custom mm)</option>
                            </select>
                        </div>

                        <!-- ตัวเลือกกำหนดขนาดเอง Custom mm -->
                        <div id="wmsCustomSizeInputs" style="display:none; align-items:center; gap:6px; background:#ffffff; padding:4px 10px; border-radius:8px; border:1px solid #93c5fd;">
                            <span style="font-size:0.78rem; font-weight:700; color:#0369a1;">กว้าง:</span>
                            <input type="number" id="wmsCustomWidthInput" value="50" min="20" max="200" style="width:50px; padding:4px; border-radius:4px; border:1px solid #cbd5e1; font-weight:700; text-align:center;" onchange="updateWmsPrintSetting('customWidth', parseFloat(this.value))">
                            <span style="font-size:0.78rem; font-weight:700; color:#0369a1;">สูง:</span>
                            <input type="number" id="wmsCustomHeightInput" value="30" min="15" max="300" style="width:50px; padding:4px; border-radius:4px; border:1px solid #cbd5e1; font-weight:700; text-align:center;" onchange="updateWmsPrintSetting('customHeight', parseFloat(this.value))">
                            <span style="font-size:0.75rem; color:#64748b;">mm</span>
                        </div>

                        <!-- ตัวเลือกจำนวน/ดวง -->
                        <div id="wmsBarcodesPerLabelWrapper" style="display:flex; align-items:center; gap:6px; font-size:0.85rem; font-weight:700; color:#1e40af;">
                            <span>จำนวน/ดวง:</span>
                            <select id="wmsBarcodesPerLabelSelect" onchange="updateWmsPrintSetting('barcodesPerLabel', parseInt(this.value, 10))" style="padding:7px 10px; border-radius:8px; border:1px solid #93c5fd; font-weight:700; outline:none; background:#fff; color:#1e3a8a; cursor:pointer;">
                                <option value="1">1 บาร์โค้ด / 1 ดวง</option>
                                <option value="2">2 บาร์โค้ด / 1 ดวง (คู่)</option>
                            </select>
                        </div>

                        <!-- ตัวเลือกสำเนาต่อ S/N -->
                        <div id="wmsCopiesPerSnWrapper" style="display:flex; align-items:center; gap:6px; font-size:0.85rem; font-weight:700; color:#1e40af;">
                            <span>พิมพ์ S/N ละ:</span>
                            <select id="wmsCopiesPerSnSelect" onchange="updateWmsPrintSetting('copiesPerSn', parseInt(this.value, 10))" style="padding:7px 10px; border-radius:8px; border:1px solid #93c5fd; font-weight:700; outline:none; background:#fff; color:#1e3a8a; cursor:pointer;">
                                <option value="1">1 ใบ</option>
                                <option value="2">2 ใบ</option>
                                <option value="3">3 ใบ</option>
                                <option value="5">5 ใบ</option>
                            </select>
                        </div>

                        <!-- ตัวเลือก A4 Layout -->
                        <div id="wmsA4LayoutWrapper" style="display:none; align-items:center; gap:6px; font-size:0.85rem; font-weight:700; color:#1e40af;">
                            <span>รูปแบบ A4:</span>
                            <select id="wmsA4LayoutSelect" onchange="updateWmsPrintSetting('a4Layout', this.value)" style="padding:7px 12px; border-radius:8px; border:1px solid #93c5fd; font-weight:700; outline:none; background:#fff; color:#1e3a8a; cursor:pointer;">
                                <option value="GRID_24">🔲 ตารางบาร์โค้ด 24 ใบ/หน้า (3x8)</option>
                                <option value="GRID_40">🔳 ตารางบาร์โค้ด 40 ใบ/หน้า (4x10)</option>
                                <option value="REPORT">📋 รายงานสรุปรายการสต็อกสินค้า</option>
                            </select>
                        </div>

                        <div id="printPreviewCountBadge" style="font-size:0.85rem; font-weight:800; color:#1e3a8a; background:#ffffff; padding:6px 14px; border-radius:20px; border:1px solid #93c5fd; box-shadow:0 2px 4px rgba(0,0,0,0.03);">
                            0 ใบ
                        </div>
                    </div>

                    <!-- แสดง/ซ่อน ข้อมูลย่อย -->
                    <div style="display:flex; gap:16px; align-items:center; flex-wrap:wrap; font-size:0.8rem; font-weight:700; color:#334155; border-top:1px dashed #bfdbfe; padding-top:8px;">
                        <label style="display:flex; align-items:center; gap:5px; cursor:pointer;"><input type="checkbox" id="chkShowSku" checked onchange="updateWmsPrintSetting('showSku', this.checked)"> แสดง SKU</label>
                        <label style="display:flex; align-items:center; gap:5px; cursor:pointer;"><input type="checkbox" id="chkShowName" checked onchange="updateWmsPrintSetting('showName', this.checked)"> แสดงชื่อรุ่น</label>
                        <label style="display:flex; align-items:center; gap:5px; cursor:pointer;"><input type="checkbox" id="chkShowLocation" checked onchange="updateWmsPrintSetting('showLocation', this.checked)"> แสดงพิกัดจัดเก็บ</label>
                        <label style="display:flex; align-items:center; gap:5px; cursor:pointer;"><input type="checkbox" id="chkShowMeter" checked onchange="updateWmsPrintSetting('showMeter', this.checked)"> แสดงเลขมิเตอร์</label>
                        <label style="display:flex; align-items:center; gap:5px; cursor:pointer;"><input type="checkbox" id="chkShowDate" checked onchange="updateWmsPrintSetting('showDate', this.checked)"> แสดงวันที่พิมพ์</label>
                    </div>
                </div>

                <!-- Preview Area -->
                <div id="barcodePreviewArea" style="
                    flex: 1; overflow-y: auto; overflow-x: hidden; padding: 20px;
                    background: #f1f5f9; display: flex; flex-wrap: wrap; justify-content: center;
                    align-items: flex-start; gap: 14px; width: 100%; box-sizing: border-box;
                "></div>

                <!-- Footer -->
                <div style="
                    padding: 14px 22px; border-top: 1px solid #e2e8f0; display: flex;
                    justify-content: space-between; align-items: center; background: #f8fafc; flex-shrink: 0; flex-wrap: wrap; gap: 10px;
                ">
                    <div style="font-size:0.82rem; color:#0284c7; font-weight:700; display:flex; align-items:center; gap:6px;">
                        <i class="fa-solid fa-circle-check" style="color:#10b981;"></i>
                        <span>พรีวิวและจัดหน้าบาร์โค้ดเรียบร้อยแล้ว กดปุ่มเพื่อเปิดหน้าสั่งพิมพ์ PDF ม้วนยาวต่อเนื่อง</span>
                    </div>
                    <div style="display:flex; gap:10px;">
                        <button type="button" class="btn btn-secondary" onclick="closePrintBarcodeModal()" style="border-radius:8px; font-weight:600; padding:9px 18px; font-size:0.85rem; background:#ffffff; border:1px solid #cbd5e1; color:#475569;">ยกเลิก</button>
                        <button type="button" class="btn btn-primary" onclick="triggerPDFPrintPreview()" style="border-radius:8px; font-weight:700; padding:9px 24px; font-size:0.88rem; background:#2563eb; color:#ffffff; border:none; cursor:pointer; box-shadow:0 4px 12px rgba(37, 99, 235, 0.3);">
                            <i class="fa-solid fa-file-pdf"></i> สั่งพิมพ์ / เปิดหน้า PDF (Continuous)
                        </button>
                    </div>
                </div>
            </div>
        `;

        if (!document.body.contains(modal)) {
            document.body.appendChild(modal);
        }
    }

    // -------------------------------------------------------------------------
    // 5. EVENT HANDLERS & MODAL CONTROLLERS (UPDATED SEARCH IN RECENT INBOUND FEED)
    // -------------------------------------------------------------------------
    function onPrintCategoryChange(val) {
        window.wmsPrintSettings.printCategory = val;
        
        const thermalWrapper = document.getElementById('wmsThermalSizeWrapper');
        const customInputs = document.getElementById('wmsCustomSizeInputs');
        const perLabelWrapper = document.getElementById('wmsBarcodesPerLabelWrapper');
        const copiesWrapper = document.getElementById('wmsCopiesPerSnWrapper');
        const a4Wrapper = document.getElementById('wmsA4LayoutWrapper');

        if (val === 'THERMAL') {
            if (thermalWrapper) thermalWrapper.style.display = 'flex';
            if (customInputs) customInputs.style.display = (window.wmsPrintSettings.thermalSize === 'CUSTOM') ? 'flex' : 'none';
            if (perLabelWrapper) perLabelWrapper.style.display = 'flex';
            if (copiesWrapper) copiesWrapper.style.display = 'flex';
            if (a4Wrapper) a4Wrapper.style.display = 'none';
        } else {
            if (thermalWrapper) thermalWrapper.style.display = 'none';
            if (customInputs) customInputs.style.display = 'none';
            if (perLabelWrapper) perLabelWrapper.style.display = 'none';
            if (copiesWrapper) copiesWrapper.style.display = 'flex';
            if (a4Wrapper) a4Wrapper.style.display = 'flex';
        }
        renderBarcodeStickerPreview();
    }

    function onThermalSizeSelectChange(val) {
        window.wmsPrintSettings.thermalSize = val;
        const customInputs = document.getElementById('wmsCustomSizeInputs');
        if (customInputs) {
            customInputs.style.display = (val === 'CUSTOM') ? 'flex' : 'none';
        }
        renderBarcodeStickerPreview();
    }

    function updateWmsPrintSetting(key, value) {
        window.wmsPrintSettings[key] = value;
        renderBarcodeStickerPreview();
    }

    // 🟢 UPDATED REALTIME 100%: ค้นหาข้อมูลสินค้าได้ทันทีจากทั้ง DB, Global Inventory และ Recent Inbound Feed!
    function openPrintBarcodeModal(mode = 'SINGLE', targetSn = null) {
        ensurePrintBarcodeModalExists();
        let itemsToPrint = [];

        // รวบรวมข้อมูลสินค้าทั้งหมดจากทุกแหล่ง
        const inventoryList = window.globalInventoryData || window.inventoryData || [];
        const inboundFeedList = window.recentInboundList || [];
        
        const combinedMap = new Map();
        inventoryList.concat(inboundFeedList).forEach(item => {
            if (!item || !item.sn) return;
            const snUpper = String(item.sn).trim().toUpperCase();
            if (!combinedMap.has(snUpper)) {
                combinedMap.set(snUpper, item);
            }
        });

        const allItems = Array.from(combinedMap.values());

        if (mode === 'SINGLE' && targetSn) {
            const targetUpper = String(targetSn).trim().toUpperCase();
            let matchedItem = allItems.find(i => String(i.sn).trim().toUpperCase() === targetUpper);
            
            // หากไม่พบในระบบ ดึงจาก DOM Form รับเข้า หรือสร้าง Fallback
            if (!matchedItem) {
                const catVal = document.getElementById('inboundCategory')?.value || '-';
                const nameVal = document.getElementById('inboundName')?.value || '-';
                const locVal = typeof window.getSelectedLocationFromDropdowns === 'function' ? window.getSelectedLocationFromDropdowns() : 'DOCK';
                const meterVal = parseInt(document.getElementById('inboundMeter')?.value) || 0;

                matchedItem = {
                    sn: targetSn,
                    category: catVal,
                    name: nameVal,
                    location: locVal,
                    meter: meterVal
                };
            }
            itemsToPrint.push(matchedItem);
        } 
        else if (mode === 'MULTI' || mode === 'BATCH' || mode === 'SELECTED') {
            if (window.selectedItemSnSet && window.selectedItemSnSet.size > 0) {
                itemsToPrint = allItems.filter(i => window.selectedItemSnSet.has(i.sn));
            } else if (Array.isArray(window.selectedSnList) && window.selectedSnList.length > 0) {
                itemsToPrint = allItems.filter(i => window.selectedSnList.includes(i.sn));
            }
        } 
        else if (mode === 'FILTERED') {
            itemsToPrint = (typeof window.getFilteredInventoryData === 'function') 
                ? window.getFilteredInventoryData() 
                : (window.currentFilteredItems || allItems);
        } 
        else if (mode === 'ALL') {
            itemsToPrint = [...allItems];
        }

        if (!itemsToPrint || itemsToPrint.length === 0) {
            const msg = "⚠️ ไม่พบรายการสินค้าสำหรับพิมพ์สติ๊กเกอร์";
            if (typeof window.showToast === 'function') window.showToast(msg, true);
            else alert(msg);
            return;
        }

        window.pendingBarcodePrintTarget = itemsToPrint;

        const badge = document.getElementById('printPreviewCountBadge');
        if (badge) badge.textContent = `${itemsToPrint.length.toLocaleString()} ใบ`;

        const catSelect = document.getElementById('wmsPrintCategorySelect');
        if (catSelect) catSelect.value = window.wmsPrintSettings.printCategory;

        // Sync Checkboxes State
        const chkSku = document.getElementById('chkShowSku');
        if (chkSku) chkSku.checked = window.wmsPrintSettings.showSku;
        const chkName = document.getElementById('chkShowName');
        if (chkName) chkName.checked = window.wmsPrintSettings.showName;
        const chkLoc = document.getElementById('chkShowLocation');
        if (chkLoc) chkLoc.checked = window.wmsPrintSettings.showLocation;
        const chkMeter = document.getElementById('chkShowMeter');
        if (chkMeter) chkMeter.checked = window.wmsPrintSettings.showMeter;
        const chkDate = document.getElementById('chkShowDate');
        if (chkDate) chkDate.checked = window.wmsPrintSettings.showDate;

        onPrintCategoryChange(window.wmsPrintSettings.printCategory);

        const modal = document.getElementById('printBarcodeModal');
        if (modal) modal.style.display = 'flex';
    }

    function closePrintBarcodeModal() {
        const modal = document.getElementById('printBarcodeModal');
        if (modal) modal.style.display = 'none';
    }

    // -------------------------------------------------------------------------
    // 6. RENDER PREVIEW WORKSPACE (AUTO-FIT RESPONSIVE PREVIEW)
    // -------------------------------------------------------------------------
    function renderBarcodeStickerPreview() {
        const previewArea = document.getElementById('barcodePreviewArea');
        if (!previewArea) return;

        const items = window.pendingBarcodePrintTarget || [];
        const settings = window.wmsPrintSettings;
        const currentDateStr = getFormattedPrintDate();

        previewArea.innerHTML = '';

        if (items.length === 0) {
            previewArea.innerHTML = `<div style="text-align:center; padding:30px; color:#94a3b8; font-weight:600;">ไม่มีรายการสินค้าสำหรับแสดงพรีวิว</div>`;
            return;
        }

        const frag = document.createDocumentFragment();

        if (settings.printCategory === 'THERMAL') {
            const perLabel = settings.barcodesPerLabel || 1;
            const copies = settings.copiesPerSn || 1;

            let widthMm = 50;
            let heightMm = 30;

            if (settings.thermalSize === 'CUSTOM') {
                widthMm = settings.customWidth || 50;
                heightMm = settings.customHeight || 30;
            } else {
                const parts = settings.thermalSize.split('x');
                widthMm = parseFloat(parts[0]) || 50;
                heightMm = parseFloat(parts[1]) || 30;
            }

            const scale = getThermalScaleParams(widthMm, heightMm);

            // คำนวณอัตราส่วนพรีวิวให้ตรงกับสัดส่วนจริงของสติ๊กเกอร์
            let cardWidthPx = Math.min(Math.max(widthMm * 4.6, 200), 440);
            let cardHeightPx = Math.min(Math.max(heightMm * 4.6, 120), 440);
            if (perLabel === 2) cardWidthPx = Math.min(cardWidthPx * 1.5, 460);

            let expandedItems = [];
            items.forEach(item => {
                for (let c = 0; c < copies; c++) {
                    expandedItems.push(item);
                }
            });

            for (let i = 0; i < expandedItems.length; i += perLabel) {
                const chunk = expandedItems.slice(i, i + perLabel);
                const stickerCard = document.createElement('div');

                stickerCard.style.cssText = `
                    width: ${cardWidthPx}px; height: ${cardHeightPx}px; background: #ffffff; border: 1.5px solid #000000;
                    border-radius: 6px; padding: 6px 8px; box-sizing: border-box; display: flex;
                    flex-direction: ${perLabel === 2 ? 'row' : 'column'}; justify-content: space-between;
                    box-shadow: 0 4px 10px rgba(0,0,0,0.08); font-family: system-ui, sans-serif; gap: 4px; flex-shrink: 0;
                    overflow: hidden;
                `;

                let cardContent = '';
                chunk.forEach((item) => {
                    const loc2LineHtml = formatLocation2LinesHtml(item.location, item);
                    const safeSku = (typeof window.escapeHTML === 'function') ? window.escapeHTML(item.category || '-') : (item.category || '-');
                    const safeName = (typeof window.escapeHTML === 'function') ? window.escapeHTML(item.name || '-') : (item.name || '-');
                    const safeSn = (typeof window.escapeHTML === 'function') ? window.escapeHTML(item.sn) : item.sn;
                    const meterStr = Number(item.meter || 0).toLocaleString();

                    cardContent += `
                        <div style="flex:1; display:flex; flex-direction:column; justify-content:space-between; height:100%; min-height:0; overflow:hidden; ${perLabel === 2 ? 'border-right:1px dashed #cbd5e1; padding-right:4px;' : ''}">
                            <div style="border-bottom:1px solid #000; padding-bottom:1px; flex-shrink:0;">
                                ${settings.showSku ? `<div style="font-weight:900; font-size:${scale.fontSizeSku}; color:#000; white-space:nowrap; overflow:hidden; text-overflow:ellipsis; line-height:1.1;">SKU: ${safeSku}</div>` : ''}
                                ${settings.showName ? `<div style="font-weight:700; font-size:${scale.fontSizeName}; color:#334155; white-space:nowrap; overflow:hidden; text-overflow:ellipsis; line-height:1.1;">${safeName}</div>` : ''}
                            </div>

                            <div style="text-align:center; flex:1; min-height:0; display:flex; flex-direction:column; align-items:center; justify-content:center; padding:1px 0;">
                                <canvas class="sticker-barcode-canvas" data-sn="${safeSn}" style="max-width:100%; height:${scale.barcodeHeightMm * 3}px; display:block;"></canvas>
                                <div style="font-weight:900; font-size:${scale.fontSizeSn}; color:#000; font-family:monospace; margin-top:1px; line-height:1;">
                                    *${safeSn}*
                                    ${settings.showMeter ? `<span style="font-size:0.8em; color:#475569; margin-left:3px;">[M:${meterStr}]</span>` : ''}
                                </div>
                            </div>

                            <div style="flex-shrink:0;">
                                ${settings.showLocation ? `
                                <div style="border-top:1.5px solid #000; padding-top:1px; text-align:center; background:#f8fafc; border-radius:0 0 4px 4px;">
                                    <div style="font-size:${scale.fontSizeLocLbl}; font-weight:800; color:#64748b; text-transform:uppercase;">LOCATION / พิกัดจัดเก็บ</div>
                                    <div style="font-weight:900; font-size:${scale.fontSizeLoc}; color:#0f172a; line-height:1.1; white-space:normal !important; word-break:break-word !important; text-align:center;">
                                        ${loc2LineHtml}
                                    </div>
                                </div>` : ''}
                                ${settings.showDate ? `
                                <div style="font-size:${scale.fontSizeDate}; color:#64748b; font-weight:700; text-align:right; margin-top:1px; border-top:1px dashed #e2e8f0; padding-top:1px; line-height:1;">
                                    📅 ${currentDateStr}
                                </div>` : ''}
                            </div>
                        </div>
                    `;
                });

                stickerCard.innerHTML = cardContent;
                frag.appendChild(stickerCard);
            }
        } 
        else if (settings.a4Layout === 'REPORT') {
            const reportCard = document.createElement('div');
            reportCard.style.cssText = `
                width: 100%; max-width: 860px; background: #ffffff; border: 1px solid #cbd5e1;
                border-radius: 10px; padding: 20px; box-shadow: 0 4px 6px rgba(0,0,0,0.05);
            `;

            let rowsHtml = '';
            items.forEach((item, idx) => {
                const safeLoc = formatLocation2LinesHtml(item.location, item);
                const safeCategory = (typeof window.escapeHTML === 'function') ? window.escapeHTML(item.category || '-') : (item.category || '-');
                const safeName = (typeof window.escapeHTML === 'function') ? window.escapeHTML(item.name || '-') : (item.name || '-');
                const safeSn = (typeof window.escapeHTML === 'function') ? window.escapeHTML(item.sn) : item.sn;

                rowsHtml += `
                    <tr style="border-bottom:1px solid #e2e8f0; font-size:0.82rem;">
                        <td style="padding:8px 6px; text-align:center;">${idx + 1}</td>
                        <td style="padding:8px; font-weight:700; font-family:monospace; color:#0f172a;">${settings.showSku ? safeCategory : '-'}</td>
                        <td style="padding:8px;">${settings.showName ? safeName : '-'}</td>
                        <td style="padding:8px; text-align:center; font-weight:800; font-family:monospace; color:#2563eb;">${safeSn}</td>
                        <td style="padding:8px; text-align:center; font-weight:700; color:#0f172a;">${settings.showLocation ? safeLoc : '-'}</td>
                        <td style="padding:8px; text-align:center; font-weight:700;">${settings.showMeter ? Number(item.meter || 0).toLocaleString() : '-'}</td>
                    </tr>
                `;
            });

            reportCard.innerHTML = `
                <div style="border-bottom:2px solid #0f172a; padding-bottom:10px; margin-bottom:12px; display:flex; justify-content:space-between; align-items:center;">
                    <h3 style="margin:0; font-size:1.1rem; color:#0f172a; font-weight:800;">📄 รายงานสรุปรายการสินค้าและบาร์โค้ดรับเข้า (A4 Report)</h3>
                    <div style="text-align:right;">
                        <span style="font-size:0.8rem; color:#64748b; font-weight:700;">รวม ${items.length.toLocaleString()} รายการ</span>
                        ${settings.showDate ? `<div style="font-size:0.72rem; color:#0284c7; font-weight:700;">พิมพ์เมื่อ: ${currentDateStr}</div>` : ''}
                    </div>
                </div>
                <table style="width:100%; border-collapse:collapse; text-align:left;">
                    <thead>
                        <tr style="background:#f8fafc; border-bottom:2px solid #cbd5e1; font-size:0.75rem; text-transform:uppercase; color:#475569;">
                            <th style="padding:8px 6px; text-align:center; width:35px;">#</th>
                            <th style="padding:8px; width:120px;">SKU</th>
                            <th style="padding:8px;">ชื่อรุ่น / รายละเอียด</th>
                            <th style="padding:8px; text-align:center; width:140px;">S/N</th>
                            <th style="padding:8px; text-align:center; width:160px;">พิกัดจัดเก็บ</th>
                            <th style="padding:8px; text-align:center; width:80px;">มิเตอร์</th>
                        </tr>
                    </thead>
                    <tbody>${rowsHtml}</tbody>
                </table>
            `;
            frag.appendChild(reportCard);
        }
        else {
            const gridWrapper = document.createElement('div');
            const columnsCount = settings.a4Layout === 'GRID_40' ? 'repeat(4, 1fr)' : 'repeat(3, 1fr)';

            gridWrapper.style.cssText = `
                display: grid; grid-template-columns: ${columnsCount}; gap: 10px; width: 100%; max-width: 860px;
            `;

            items.forEach((item) => {
                const loc2LineHtml = formatLocation2LinesHtml(item.location, item);
                const safeSku = (typeof window.escapeHTML === 'function') ? window.escapeHTML(item.category || '-') : (item.category || '-');
                const safeName = (typeof window.escapeHTML === 'function') ? window.escapeHTML(item.name || '-') : (item.name || '-');
                const safeSn = (typeof window.escapeHTML === 'function') ? window.escapeHTML(item.sn) : item.sn;

                const card = document.createElement('div');
                card.style.cssText = `
                    border: 1px solid #000; border-radius: 6px; padding: 6px; background: #ffffff;
                    text-align: center; display: flex; flex-direction: column; justify-content: space-between;
                    height: 145px; box-sizing: border-box; overflow: hidden;
                `;
                card.innerHTML = `
                    <div style="font-weight:800; font-size:0.72rem; white-space:nowrap; overflow:hidden; text-overflow:ellipsis; border-bottom:1px solid #ddd; padding-bottom:2px;">
                        ${settings.showSku ? `SKU: ${safeSku}` : ''} ${settings.showName ? `<span style="font-weight:normal; color:#475569;">${safeName}</span>` : ''}
                    </div>
                    <div style="padding:2px 0;">
                        <canvas class="sticker-barcode-canvas" data-sn="${safeSn}" style="max-width:100%; height:36px; display:block; margin:0 auto;"></canvas>
                        <div style="font-weight:800; font-size:0.72rem; font-family:monospace; margin-top:1px;">
                            *${safeSn}*
                            ${settings.showMeter ? `<span style="font-size:0.6rem; color:#475569;">[M:${item.meter || 0}]</span>` : ''}
                        </div>
                    </div>
                    <div>
                        ${settings.showLocation ? `
                        <div style="border-top:1px solid #000; padding-top:2px; font-size:0.68rem; font-weight:800;">
                            ${loc2LineHtml}
                        </div>` : ''}
                        ${settings.showDate ? `<div style="font-size:0.55rem; color:#64748b; text-align:right;">${currentDateStr}</div>` : ''}
                    </div>
                `;
                gridWrapper.appendChild(card);
            });
            frag.appendChild(gridWrapper);
        }

        previewArea.appendChild(frag);

        setTimeout(() => {
            document.querySelectorAll('.sticker-barcode-canvas').forEach(canvas => {
                const sn = canvas.getAttribute('data-sn');
                if (sn) renderHighPrecisionBarcode(canvas, sn);
            });
        }, 50);
    }

    // -------------------------------------------------------------------------
    // 7. PRINT STREAM & PDF POPUP ENGINE (CONTINUOUS MULTI-LABEL ROLL FEED ENGINE)
    // -------------------------------------------------------------------------
    function triggerPDFPrintPreview() {
        const items = window.pendingBarcodePrintTarget || [];
        if (items.length === 0) {
            alert("⚠️ ไม่พบรายการสินค้าสำหรับพิมพ์สติ๊กเกอร์");
            return;
        }

        const settings = window.wmsPrintSettings;
        const currentDateStr = getFormattedPrintDate();

        const printWindow = window.open('', '_blank', 'width=980,height=800');
        if (!printWindow) {
            alert("⚠️ กรุณายินยอมให้เบราว์เซอร์เปิด Pop-up เพื่อสั่งพิมพ์หรือเปิดหน้า PDF");
            return;
        }

        let printBodyHtml = '';

        if (settings.printCategory === 'THERMAL') {
            let widthMm = 50;
            let heightMm = 30;

            if (settings.thermalSize === 'CUSTOM') {
                widthMm = settings.customWidth || 50;
                heightMm = settings.customHeight || 30;
            } else {
                const parts = settings.thermalSize.split('x');
                widthMm = parseFloat(parts[0]) || 50;
                heightMm = parseFloat(parts[1]) || 30;
            }

            // ดึงค่าการสเกลความกว้าง/ฟอนต์/ระยะเว้นขอบ dynamic
            const scale = getThermalScaleParams(widthMm, heightMm);
            const perLabel = settings.barcodesPerLabel || 1;
            const copies = settings.copiesPerSn || 1;

            let expandedItems = [];
            items.forEach(item => {
                for (let c = 0; c < copies; c++) {
                    expandedItems.push(item);
                }
            });

            for (let i = 0; i < expandedItems.length; i += perLabel) {
                const chunk = expandedItems.slice(i, i + perLabel);
                let labelInnerHtml = '';

                chunk.forEach((item) => {
                    const loc2LineHtml = formatLocation2LinesHtml(item.location, item);
                    const safeSku = (typeof window.escapeHTML === 'function') ? window.escapeHTML(item.category || 'N/A') : (item.category || 'N/A');
                    const safeName = (typeof window.escapeHTML === 'function') ? window.escapeHTML(item.name || '-') : (item.name || '-');
                    const safeSn = (typeof window.escapeHTML === 'function') ? window.escapeHTML(item.sn) : item.sn;
                    
                    // คำนวณความสูงบาร์โค้ดความละเอียดสูง
                    const barcodeImgDataUrl = generateCode128DataUrl(safeSn, { 
                        scale: 3, 
                        height: Math.max(28, Math.floor(scale.barcodeHeightMm * 3.7)), 
                        quietZone: 8 
                    });

                    labelInnerHtml += `
                        <div style="${perLabel === 2 ? 'flex:1; border-right:1px dashed #aaa; padding-right:1mm;' : 'width:100%;'} display:flex; flex-direction:column; justify-content:space-between; height:100%; min-height:0; overflow:hidden;">
                            <div style="flex-shrink:0;">
                                ${settings.showSku ? `<div class="sticker-sku">SKU: ${safeSku}</div>` : ''}
                                ${settings.showName ? `<div class="sticker-name">${safeName}</div>` : ''}
                            </div>
                            <div class="barcode-box">
                                <img src="${barcodeImgDataUrl}" class="barcode-img" alt="BARCODE-${safeSn}" />
                                <div class="barcode-sn">*${safeSn}* ${settings.showMeter ? `[M:${item.meter || 0}]` : ''}</div>
                            </div>
                            <div style="flex-shrink:0;">
                                ${settings.showLocation ? `
                                <div class="sticker-loc-box">
                                    <div class="loc-lbl">LOCATION / พิกัดจัดเก็บ</div>
                                    <div class="loc-val">${loc2LineHtml}</div>
                                </div>` : ''}
                                ${settings.showDate ? `<div class="sticker-date">📅 ${currentDateStr}</div>` : ''}
                            </div>
                        </div>
                    `;
                });

                printBodyHtml += `
                    <div class="sticker-page" style="${perLabel === 2 ? 'display:flex; flex-direction:row; gap:1.5mm;' : ''}">
                        ${labelInnerHtml}
                    </div>
                `;
            }

            printWindow.document.write(`
                <!DOCTYPE html>
                <html>
                <head>
                    <title>WMS Continuous Thermal Barcode Labels (${expandedItems.length} ใบ)</title>
                    <style>
                        @page { 
                            size: ${widthMm}mm ${heightMm}mm; 
                            margin: 0mm !important; 
                        }
                        * { 
                            box-sizing: border-box; 
                            margin: 0; 
                            padding: 0; 
                        }
                        html, body { 
                            width: ${widthMm}mm; 
                            margin: 0 !important; 
                            padding: 0 !important; 
                            background: #ffffff; 
                            font-family: system-ui, -apple-system, sans-serif; 
                            -webkit-print-color-adjust: exact; 
                            print-color-adjust: exact; 
                        }
                        .sticker-page { 
                            width: ${widthMm}mm; 
                            height: ${heightMm}mm; 
                            max-width: ${widthMm}mm; 
                            max-height: ${heightMm}mm; 
                            padding: ${scale.paddingMm}; 
                            box-sizing: border-box; 
                            page-break-after: always !important; 
                            page-break-inside: avoid !important; 
                            break-after: page !important; 
                            break-inside: avoid !important; 
                            display: flex; 
                            flex-direction: column; 
                            justify-content: space-between; 
                            overflow: hidden; 
                            position: relative;
                        }
                        .sticker-sku { font-weight: 900; font-size: ${scale.fontSizeSku}; white-space: nowrap; overflow: hidden; text-overflow: ellipsis; color: #000; line-height: ${scale.lineHeight}; }
                        .sticker-name { font-size: ${scale.fontSizeName}; font-weight: 700; white-space: nowrap; overflow: hidden; text-overflow: ellipsis; color: #333; line-height: ${scale.lineHeight}; }
                        .barcode-box { text-align: center; margin: 0.2mm 0; display: flex; flex-direction: column; align-items: center; justify-content: center; flex: 1; min-height: 0; overflow: hidden; }
                        .barcode-img { max-width: 100%; height: ${scale.barcodeHeightMm}mm; max-height: 100%; display: block; image-rendering: pixelated; margin: 0 auto; object-fit: contain; }
                        .barcode-sn { font-size: ${scale.fontSizeSn}; font-weight: 900; font-family: monospace; color: #000; margin-top: 0.2mm; line-height: 1; }
                        .sticker-loc-box { border-top: 1px solid #000; padding-top: 0.3mm; text-align: center; }
                        .loc-lbl { font-size: ${scale.fontSizeLocLbl}; font-weight: bold; color: #444; text-transform: uppercase; line-height: 1; }
                        .loc-val { font-size: ${scale.fontSizeLoc}; font-weight: 900; color: #0f172a; line-height: ${scale.lineHeight}; white-space: normal !important; word-break: break-word !important; text-align: center; display: block; }
                        .sticker-date { font-size: ${scale.fontSizeDate}; font-weight: bold; color: #555; text-align: ${scale.dateAlign}; margin-top: 0.3mm; line-height: 1; border-top: 1px dashed #ddd; padding-top: 0.2mm; }
                    </style>
                </head>
                <body>
                    ${printBodyHtml}
                    <script>
                        window.onload = function() {
                            setTimeout(function() {
                                window.print();
                            }, 300);
                        };
                    </script>
                </body>
                </html>
            `);
        } 
        else if (settings.a4Layout === 'REPORT') {
            let rowsHtml = '';
            items.forEach((item, idx) => {
                const safeLoc = formatLocation2LinesHtml(item.location, item);
                const safeCategory = (typeof window.escapeHTML === 'function') ? window.escapeHTML(item.category || '-') : (item.category || '-');
                const safeName = (typeof window.escapeHTML === 'function') ? window.escapeHTML(item.name || '-') : (item.name || '-');
                const safeSn = (typeof window.escapeHTML === 'function') ? window.escapeHTML(item.sn) : item.sn;

                rowsHtml += `
                    <tr>
                        <td style="text-align:center;">${idx + 1}</td>
                        <td>${settings.showSku ? safeCategory : '-'}</td>
                        <td>${settings.showName ? safeName : '-'}</td>
                        <td style="text-align:center; font-family:monospace; font-weight:bold;">${safeSn}</td>
                        <td style="text-align:center; white-space:normal; word-break:break-word;">${settings.showLocation ? safeLoc : '-'}</td>
                        <td style="text-align:center;">${settings.showMeter ? Number(item.meter || 0).toLocaleString() : '-'}</td>
                    </tr>
                `;
            });

            printWindow.document.write(`
                <!DOCTYPE html>
                <html>
                <head>
                    <title>WMS Inventory A4 Report</title>
                    <style>
                        @page { size: A4 portrait; margin: 12mm; }
                        body { font-family: system-ui, sans-serif; font-size: 11px; color: #000; margin: 0; padding: 0; }
                        table { width: 100%; border-collapse: collapse; margin-top: 12px; }
                        th, td { border: 1px solid #666; padding: 6px 8px; font-size: 10.5px; }
                        th { background-color: #f0f0f0; text-align: center; }
                        .report-header { display: flex; justify-content: space-between; align-items: center; border-bottom: 2px solid #000; padding-bottom: 8px; }
                    </style>
                </head>
                <body>
                    <div class="report-header">
                        <h2>📄 รายงานสรุปรายการสินค้าและบาร์โค้ดรับเข้า (WMS Report)</h2>
                        <div style="text-align:right;">
                            <div>รายการทั้งหมด: <strong>${items.length}</strong> เครื่อง</div>
                            ${settings.showDate ? `<div>วันที่พิมพ์: ${currentDateStr}</div>` : ''}
                        </div>
                    </div>
                    <table>
                        <thead>
                            <tr>
                                <th>#</th>
                                <th>SKU</th>
                                <th>ชื่อรุ่น / รายละเอียด</th>
                                <th>หมายเลขซีเรียล (S/N)</th>
                                <th>พิกัดจัดเก็บ</th>
                                <th>มิเตอร์</th>
                            </tr>
                        </thead>
                        <tbody>${rowsHtml}</tbody>
                    </table>
                    <script>
                        window.onload = function() {
                            setTimeout(function() {
                                window.print();
                            }, 300);
                        };
                    </script>
                </body>
                </html>
            `);
        }
        else {
            let itemsGridHtml = '';
            const columnsCss = settings.a4Layout === 'GRID_40' ? 'repeat(4, 1fr)' : 'repeat(3, 1fr)';

            items.forEach((item) => {
                const loc2LineHtml = formatLocation2LinesHtml(item.location, item);
                const safeSku = (typeof window.escapeHTML === 'function') ? window.escapeHTML(item.category || '-') : (item.category || '-');
                const safeName = (typeof window.escapeHTML === 'function') ? window.escapeHTML(item.name || '-') : (item.name || '-');
                const safeSn = (typeof window.escapeHTML === 'function') ? window.escapeHTML(item.sn) : item.sn;

                const barcodeImgDataUrl = generateCode128DataUrl(safeSn, { scale: 3, height: 42, quietZone: 8 });

                itemsGridHtml += `
                    <div class="a4-card">
                        <div class="a4-sku">${settings.showSku ? `SKU: ${safeSku}` : ''} ${settings.showName ? safeName : ''}</div>
                        <div class="a4-barcode-box">
                            <img src="${barcodeImgDataUrl}" class="a4-barcode-img" alt="BARCODE-${safeSn}" />
                            <div class="a4-sn">*${safeSn}* ${settings.showMeter ? `[M:${item.meter || 0}]` : ''}</div>
                        </div>
                        <div>
                            ${settings.showLocation ? `<div class="a4-loc">${loc2LineHtml}</div>` : ''}
                            ${settings.showDate ? `<div class="a4-date">${currentDateStr}</div>` : ''}
                        </div>
                    </div>
                `;
            });

            printWindow.document.write(`
                <!DOCTYPE html>
                <html>
                <head>
                    <title>WMS Barcode A4 Grid</title>
                    <style>
                        @page { size: A4 portrait; margin: 8mm; }
                        * { box-sizing: border-box; }
                        body { font-family: system-ui, sans-serif; margin: 0; padding: 0; background: #fff; -webkit-print-color-adjust: exact; print-color-adjust: exact; }
                        .a4-grid { display: grid; grid-template-columns: ${columnsCss}; gap: 3.5mm; width: 100%; }
                        .a4-card { border: 1px solid #000; border-radius: 4px; padding: 2mm; text-align: center; height: 34mm; display: flex; flex-direction: column; justify-content: space-between; box-sizing: border-box; page-break-inside: avoid; overflow: hidden; }
                        .a4-sku { font-size: 8.5px; font-weight: bold; white-space: nowrap; overflow: hidden; text-overflow: ellipsis; border-bottom: 1px solid #ccc; padding-bottom: 1px; }
                        .a4-barcode-box { text-align: center; margin: 1mm 0; display: flex; flex-direction: column; align-items: center; justify-content: center; }
                        .a4-barcode-img { max-width: 100%; height: 10mm; display: block; image-rendering: pixelated; margin: 0 auto; }
                        .a4-sn { font-size: 8.5px; font-weight: bold; font-family: monospace; margin-top: 0.5mm; }
                        .a4-loc { border-top: 1px solid #000; padding-top: 1px; font-size: 8px; font-weight: bold; }
                        .a4-date { font-size: 6px; color: #555; text-align: right; margin-top: 1px; }
                    </style>
                </head>
                <body>
                    <div class="a4-grid">${itemsGridHtml}</div>
                    <script>
                        window.onload = function() {
                            setTimeout(function() {
                                window.print();
                            }, 300);
                        };
                    </script>
                </body>
                </html>
            `);
        }

        printWindow.document.close();
    }

    // -------------------------------------------------------------------------
    // 8. GLOBAL EXPORTS & BACKWARD COMPATIBILITY ALIASES
    // -------------------------------------------------------------------------
    window.getThermalScaleParams = getThermalScaleParams;
    window.formatLocation2LinesHtml = formatLocation2LinesHtml;
    window.getFormattedPrintDate = getFormattedPrintDate;
    window.generateCode128DataUrl = generateCode128DataUrl;
    window.renderHighPrecisionBarcode = renderHighPrecisionBarcode;
    window.openPrintBarcodeModal = openPrintBarcodeModal;
    window.closePrintBarcodeModal = closePrintBarcodeModal;
    window.onPrintCategoryChange = onPrintCategoryChange;
    window.onThermalSizeSelectChange = onThermalSizeSelectChange;
    window.updateWmsPrintSetting = updateWmsPrintSetting;
    window.renderBarcodeStickerPreview = renderBarcodeStickerPreview;
    window.updatePrintPreviewLayout = renderBarcodeStickerPreview;
    window.triggerPDFPrintPreview = triggerPDFPrintPreview;
    window.executeThermalBarcodePrint = triggerPDFPrintPreview;

    // Direct Action & Legacy Aliases
    window.printSelectedBarcodes = function() { openPrintBarcodeModal('MULTI'); };
    window.printSingleBarcode = function(sn) { openPrintBarcodeModal('SINGLE', sn); };
    window.triggerBarcodePrint = function(sn) { openPrintBarcodeModal('SINGLE', sn); };
    window.triggerBatchBarcodePrint = function() { openPrintBarcodeModal('MULTI'); };
    window.openBatchBarcodePrintModal = function() { openPrintBarcodeModal('MULTI'); };
    window.executeBarcodePrintProcess = triggerPDFPrintPreview;

    console.log("✅ [WMS Barcode Print Engine v11.1] Database Location Accuracy & Realtime Inbound Sync Engine loaded successfully.");
})();