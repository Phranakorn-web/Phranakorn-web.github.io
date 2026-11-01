// =========================================================================
// 📌 [ส่วนที่ 3] WMS TABLE RENDERER, FILTERS & VIEW MODES
// =========================================================================

function populateStockFilterDropdowns() {
    const skuSelect = document.getElementById('filterCategorySelect') || document.getElementById('filterSkuSelect');
    const typeSelect = document.getElementById('filterItemTypeSelect') || document.getElementById('filterTypeSelect');
    const modelSelect = document.getElementById('filterModelSelect') || document.getElementById('filterNameSelect');

    const aisleSelect = document.getElementById('filterAisleSelect');
    const baySelect = document.getElementById('filterBaySelect');
    const locSelect = document.getElementById('filterLocationSelect');

    const skuSet = new Set();
    const modelSet = new Set();
    const locSet = new Set();

    globalInventoryData.forEach(item => {
        if (item.category) skuSet.add(item.category.trim());
        if (item.name) modelSet.add(item.name.trim());
        if (item.location) locSet.add(item.location.trim().toUpperCase());
    });

    if (typeSelect) {
        const curVal = typeSelect.value || 'ALL';
        typeSelect.innerHTML = `
            <option value="ALL">🏷️ กรองตามประเภท (ทั้งหมด)</option>
            <option value="สินค้า">📦 สินค้าทั่วไป</option>
            <option value="วัสดุสิ้นเปลือง">🧪 วัสดุสิ้นเปลือง / หมึก / ฟิลาเมนต์</option>
            <option value="อะไหล่">⚙️ อะไหล่ / ชิ้นส่วนอุปกรณ์</option>
        `;
        typeSelect.value = curVal;
        typeSelect.onchange = filterInventoryData;
    }

    if (skuSelect) {
        const curVal = skuSelect.value || 'ALL';
        const sortedSkus = Array.from(skuSet).sort();
        let options = `<option value="ALL">📦 กรองตามรหัสสินค้า (SKU ทั้งหมด)</option>`;
        sortedSkus.forEach(s => {
            options += `<option value="${escapeHTML(s)}">${escapeHTML(s)}</option>`;
        });
        skuSelect.innerHTML = options;
        skuSelect.value = curVal;
        skuSelect.onchange = filterInventoryData;
    }

    if (modelSelect) {
        const curVal = modelSelect.value || 'ALL';
        const sortedModels = Array.from(modelSet).sort();
        let options = `<option value="ALL">🖥️ กรองตามชื่อรุ่น (ทั้งหมด)</option>`;
        sortedModels.forEach(m => {
            options += `<option value="${escapeHTML(m)}">${escapeHTML(m)}</option>`;
        });
        modelSelect.innerHTML = options;
        modelSelect.value = curVal;
        modelSelect.onchange = filterInventoryData;
    }

    if (aisleSelect) {
        const curVal = aisleSelect.value || 'ALL';
        const discoveredAisles = discoverAllDatabaseAisles();
        let options = `<option value="ALL">📍 กรองตามแถว/โซน (ทั้งหมด)</option>`;
        discoveredAisles.forEach(a => {
            const count = globalInventoryData.filter(i => extractAisleKey(i.location) === a).length;
            const label = formatAisleBayLabel(a);
            options += `<option value="${escapeHTML(a)}">${escapeHTML(label)} (${count} รายการ)</option>`;
        });
        aisleSelect.innerHTML = options;
        aisleSelect.value = Array.from(aisleSelect.options).some(o => o.value === curVal) ? curVal : 'ALL';
        aisleSelect.onchange = onAisleFilterChange;
    }

    if (baySelect) {
        const curVal = baySelect.value || 'ALL';
        const selectedAisle = aisleSelect ? aisleSelect.value : 'ALL';
        const baySet = new Set();
        globalInventoryData.forEach(item => {
            if (selectedAisle === 'ALL' || extractAisleKey(item.location) === selectedAisle) {
                const bKey = extractBayKey(item.location);
                if (bKey && bKey !== 'ALL') baySet.add(bKey);
            }
        });
        const sortedBays = Array.from(baySet).sort();
        let options = `<option value="ALL">🔒 กรองตามล็อก/บล็อก (ทั้งหมด)</option>`;
        sortedBays.forEach(b => {
            options += `<option value="${escapeHTML(b)}">ล็อก ${escapeHTML(b)}</option>`;
        });
        baySelect.innerHTML = options;
        baySelect.value = Array.from(baySelect.options).some(o => o.value === curVal) ? curVal : 'ALL';
        baySelect.onchange = filterInventoryData;
    }

    if (locSelect) {
        const curVal = locSelect.value || 'ALL';
        const sortedLocs = Array.from(locSet).sort();
        let options = `<option value="ALL">🎯 กรองตามพิกัดจัดเก็บระบุตรง (ทั้งหมด)</option>`;
        sortedLocs.forEach(l => {
            const formatted = typeof formatLocationCode === 'function' ? formatLocationCode(l) : l;
            options += `<option value="${escapeHTML(l)}">${escapeHTML(formatted)}</option>`;
        });
        locSelect.innerHTML = options;
        locSelect.value = Array.from(locSelect.options).some(o => o.value === curVal) ? curVal : 'ALL';
        locSelect.onchange = filterInventoryData;
    }
}

function onAisleFilterChange() {
    const aisleSelect = document.getElementById('filterAisleSelect');
    const baySelect = document.getElementById('filterBaySelect');
    const locSelect = document.getElementById('filterLocationSelect');

    const selectedAisle = aisleSelect ? aisleSelect.value.trim().toUpperCase() : 'ALL';

    if (baySelect) {
        const curBay = baySelect.value || 'ALL';
        const baySet = new Set();
        globalInventoryData.forEach(item => {
            if (selectedAisle === 'ALL' || extractAisleKey(item.location) === selectedAisle) {
                const bKey = extractBayKey(item.location);
                if (bKey && bKey !== 'ALL') baySet.add(bKey);
            }
        });
        const sortedBays = Array.from(baySet).sort();
        let bayOptions = `<option value="ALL">🔒 กรองตามล็อก/บล็อก (ทั้งหมด)</option>`;
        sortedBays.forEach(b => {
            bayOptions += `<option value="${escapeHTML(b)}">ล็อก ${escapeHTML(b)}</option>`;
        });
        baySelect.innerHTML = bayOptions;
        baySelect.value = Array.from(baySelect.options).some(o => o.value === curBay) ? curBay : 'ALL';
    }

    if (locSelect) {
        const curLoc = locSelect.value || 'ALL';
        const locSet = new Set();
        globalInventoryData.forEach(item => {
            if (selectedAisle === 'ALL' || extractAisleKey(item.location) === selectedAisle) {
                if (item.location) locSet.add(item.location.trim().toUpperCase());
            }
        });
        const sortedLocs = Array.from(locSet).sort();
        let locOptions = `<option value="ALL">🎯 กรองตามพิกัดจัดเก็บระบุตรง (ทั้งหมด)</option>`;
        sortedLocs.forEach(l => {
            const formatted = typeof formatLocationCode === 'function' ? formatLocationCode(l) : l;
            locOptions += `<option value="${escapeHTML(l)}">${escapeHTML(formatted)}</option>`;
        });
        locSelect.innerHTML = locOptions;
        locSelect.value = Array.from(locSelect.options).some(o => o.value === curLoc) ? curLoc : 'ALL';
    }

    filterInventoryData();
}

function filterInventoryData() {
    const searchInput = document.getElementById('searchInput');
    const skuSelect = document.getElementById('filterCategorySelect') || document.getElementById('filterSkuSelect');
    const typeSelect = document.getElementById('filterItemTypeSelect') || document.getElementById('filterTypeSelect');
    const modelSelect = document.getElementById('filterModelSelect') || document.getElementById('filterNameSelect');

    const aisleSelect = document.getElementById('filterAisleSelect');
    const baySelect = document.getElementById('filterBaySelect');
    const locSelect = document.getElementById('filterLocationSelect');

    const query = searchInput ? searchInput.value.trim().toLowerCase() : '';
    const skuFilter = skuSelect ? skuSelect.value.trim().toUpperCase() : 'ALL';
    const typeFilter = typeSelect ? typeSelect.value.trim().toLowerCase() : 'ALL';
    const modelFilter = modelSelect ? modelSelect.value.trim().toLowerCase() : 'ALL';

    const aisleFilter = aisleSelect ? aisleSelect.value.trim().toUpperCase() : 'ALL';
    const bayFilter = baySelect ? baySelect.value.trim().toUpperCase() : 'ALL';
    const locSelectVal = locSelect ? locSelect.value.trim().toUpperCase() : 'ALL';

    currentFilteredItems = globalInventoryData.filter(item => {
        const itemCat = (item.category || '').toUpperCase().trim();
        const itemName = (item.name || '').toLowerCase().trim();
        const itemLoc = (item.location || '').toUpperCase().trim();
        const itemAisle = extractAisleKey(itemLoc).toUpperCase().trim();
        const itemBay = extractBayKey(itemLoc).toUpperCase().trim();
        const receiverName = formatReceiverFullName(item).toLowerCase();

        const meta = resolveProductMetaData(item.category, item.name, item);
        const itemType = (meta.itemType || '').toLowerCase();

        const matchText = !query || 
            (item.sn && item.sn.toLowerCase().includes(query)) ||
            (item.category && item.category.toLowerCase().includes(query)) ||
            (item.name && item.name.toLowerCase().includes(query)) ||
            (item.location && item.location.toLowerCase().includes(query)) ||
            (meta.brand && meta.brand.toLowerCase().includes(query)) ||
            (meta.model && meta.model.toLowerCase().includes(query)) ||
            receiverName.includes(query);

        let matchSku = (skuFilter === 'ALL') || (itemCat === skuFilter);

        let matchType = true;
        if (typeFilter !== 'ALL') {
            if (typeFilter.includes('วัสดุ')) matchType = itemType.includes('วัสดุ') || itemType.includes('consumable') || itemType.includes('ink');
            else if (typeFilter.includes('อะไหล่')) matchType = itemType.includes('อะไหล่') || itemType.includes('spare') || itemType.includes('gear');
            else matchType = !itemType.includes('วัสดุ') && !itemType.includes('อะไหล่');
        }

        let matchModel = (modelFilter === 'ALL') || itemName.includes(modelFilter) || (meta.model && meta.model.toLowerCase().includes(modelFilter));

        let matchAisle = true;
        if (aisleFilter !== 'ALL') {
            if (aisleFilter === 'DOCK') matchAisle = (itemLoc === 'DOCK');
            else if (aisleFilter === 'OFFICE') matchAisle = (itemLoc === 'OFFICE');
            else matchAisle = (itemAisle === aisleFilter) || (itemLoc === aisleFilter) || itemLoc.startsWith(`${aisleFilter}-`);
        }

        let matchBay = true;
        if (bayFilter !== 'ALL') {
            const cleanBay = String(parseInt(bayFilter, 10) || bayFilter).padStart(2, '0');
            matchBay = (itemBay === bayFilter) || (itemBay === cleanBay) || itemLoc.includes(`-${bayFilter}-`) || itemLoc.includes(`-${cleanBay}-`);
        }

        let matchLoc = true;
        if (locSelectVal !== 'ALL') {
            const normSelectLoc = normalizeLoc(locSelectVal);
            const normItemLoc = normalizeLoc(itemLoc);
            matchLoc = (itemLoc === locSelectVal) || (normItemLoc === normSelectLoc);
        }

        return matchText && matchSku && matchType && matchModel && matchAisle && matchBay && matchLoc;
    });

    renderInventoryTable(currentFilteredItems);
    if (typeof updateKPIs === 'function') updateKPIs();
    if (typeof refreshStockDetailModalIfActive === 'function') refreshStockDetailModalIfActive();
}

function buildInventoryGroups(items) {
    const map = new Map();
    items.forEach(item => {
        const cat = (item.category || 'N/A').trim();
        const name = (item.name || '-').trim();
        const key = `${cat}||${name}`;

        if (!map.has(key)) {
            const meta = resolveProductMetaData(cat, name, item);
            map.set(key, {
                groupKey: key, category: cat, name: name, image: meta.image, brand: meta.brand,
                model: meta.model, itemType: meta.itemType, unit: item.unit || 'เครื่อง',
                items: [], totalQty: 0, locationSet: new Set(), baySet: new Set(), aisleSet: new Set(), pendingCount: 0
            });
        }
        const grp = map.get(key);
        grp.items.push(item);
        grp.totalQty += (parseInt(item.qty) || 1);
        if (item.location) {
            const locUpper = item.location.toUpperCase().trim();
            grp.locationSet.add(locUpper);
            const abKey = extractAisleBayKey(locUpper);
            const aKey = extractAisleKey(locUpper);
            if (abKey) grp.baySet.add(abKey);
            if (aKey) grp.aisleSet.add(aKey);
        }
        if (item._pending) grp.pendingCount++;
    });

    const groups = [];
    map.forEach(grp => {
        groups.push({
            groupKey: grp.groupKey, category: grp.category, name: grp.name, image: grp.image,
            brand: grp.brand, model: grp.model, itemType: grp.itemType, unit: grp.unit,
            items: grp.items, totalQty: grp.totalQty,
            locations: Array.from(grp.locationSet).sort(),
            bays: Array.from(grp.baySet).sort(),
            aisles: Array.from(grp.aisleSet).sort(),
            pendingCount: grp.pendingCount
        });
    });
    return groups;
}

function updateStockViewModeButtonUI() {
    let btn = document.getElementById('btnToggleInventoryViewMode');
    if (!btn) {
        const totalBadge = document.getElementById('totalCountBadge');
        if (totalBadge && totalBadge.parentElement) {
            btn = document.createElement('button');
            btn.id = 'btnToggleInventoryViewMode';
            btn.className = 'btn btn-sm btn-secondary';
            btn.style.cssText = 'margin-left: 10px; font-weight: 700; cursor: pointer; transition: all 0.2s ease; border-radius: 8px; border:1px solid #cbd5e1; background:#ffffff; color:#0f172a;';
            btn.onclick = toggleStockViewMode;
            totalBadge.parentElement.appendChild(btn);
        }
    }
    if (btn) {
        if (inventoryViewMode === 'grouped') {
            btn.innerHTML = `<i class="fa-solid fa-layer-group" style="color:#2563eb;"></i> โหมดจัดกลุ่มตามรุ่น`;
            btn.title = "คลิกเพื่อสลับเป็นโหมดแสดงรายการซีเรียลทั้งหมด";
        } else {
            btn.innerHTML = `<i class="fa-solid fa-list-check" style="color:#d97706;"></i> โหมดแสดงทุกซีเรียล`;
            btn.title = "คลิกเพื่อสลับเป็นโหมดจัดกลุ่มตามรุ่น";
        }
    }
}

function toggleStockViewMode() {
    inventoryViewMode = (inventoryViewMode === 'grouped') ? 'detailed' : 'grouped';
    updateStockViewModeButtonUI();
    renderInventoryTable(currentFilteredItems);
}

function updateInventoryTableHeader() {
    const tbody = document.getElementById('inventoryTableBody');
    if (!tbody) return;
    const table = tbody.closest('table');
    if (!table) return;

    let thead = table.querySelector('thead');
    if (!thead) {
        thead = document.createElement('thead');
        table.insertBefore(thead, tbody);
    }

    if (inventoryViewMode === 'grouped') {
        const allGroupsChecked = currentInventoryGroups.length > 0 && currentInventoryGroups.every(grp => 
            grp.items.every(i => selectedItemSnSet.has(i.sn))
        );

        thead.innerHTML = `
            <tr style="background: #f8fafc; border-bottom: 2px solid #e2e8f0; color: #475569; font-size: 0.8rem; font-weight: 800; text-transform: uppercase; letter-spacing: 0.4px;">
                <th style="padding: 12px 10px; width: 42px; text-align: center;">
                    <input type="checkbox" id="selectAllGroupedCheckbox" ${allGroupsChecked ? 'checked' : ''} onchange="toggleSelectAllGroups(this.checked)" title="เลือกกลุ่มทั้งหมดสำหรับฟังก์ชันกลุ่ม">
                </th>
                <th style="padding: 12px 12px; width: 70px; text-align: center;">รูปสินค้า</th>
                <th style="padding: 12px 14px; min-width: 260px; text-align: left;">ประเภท / รหัสสินค้า / ชื่อรุ่น</th>
                <th style="padding: 12px 14px; min-width: 220px; text-align: left;">รายละเอียด (ยี่ห้อ / รุ่น)</th>
                <th style="padding: 12px 14px; text-align: right; min-width: 110px;">คงเหลือรวม</th>
                <th style="padding: 12px 14px; text-align: center; min-width: 160px;">พิกัดและล็อกจัดเก็บจริง</th>
                <th style="padding: 12px 14px; text-align: center; width: 60px;">ดูรายการ</th>
            </tr>
        `;
    } else {
        const allChecked = currentFilteredItems.length > 0 && currentFilteredItems.every(i => selectedItemSnSet.has(i.sn));
        thead.innerHTML = `
            <tr style="background: #f8fafc; border-bottom: 2px solid #cbd5e1; color: #334155; font-size: 0.8rem; font-weight: 800; text-transform: uppercase; letter-spacing: 0.4px;">
                <th style="width:42px; text-align:center; padding:12px 8px;" title="เลือกสำหรับการลบ/พิมพ์/ย้าย แบบกลุ่มเท่านั้น"><input type="checkbox" id="selectAllCheckbox" ${allChecked ? 'checked' : ''} onchange="toggleSelectAllVisibleItems(this.checked)"></th>
                <th style="width:50px; text-align:center; padding:12px 8px;">ลำดับ</th>
                <th style="min-width:120px; text-align:center; padding:12px 10px;">รหัสสินค้า (SKU)</th>
                <th style="min-width:240px; text-align:left; padding:12px 10px;">ชื่อรุ่น / รายละเอียดสินค้า</th>
                <th style="min-width:110px; text-align:center; padding:12px 10px;">เลขมิเตอร์</th>
                <th style="min-width:160px; text-align:center; padding:12px 10px;">หมายเลขซีเรียล (S/N)</th>
                <th style="min-width:140px; text-align:center; padding:12px 10px;">พิกัดจัดเก็บ</th>
                <th style="min-width:70px; text-align:center; padding:12px 8px;">จำนวน</th>
                <th style="min-width:160px; text-align:center; padding:12px 10px;">ผู้รับสินค้าเข้า (User)</th>
                <th style="min-width:140px; text-align:center; padding:12px 10px;">วันที่รับเข้า</th>
                <th style="width:55px; text-align:center; padding:12px 4px;">พิมพ์</th>
                <th style="width:55px; text-align:center; padding:12px 4px;">แก้ไข</th>
                <th style="width:55px; text-align:center; padding:12px 4px;">ย้าย</th>
                <th style="width:65px; text-align:center; padding:12px 4px; color:#dc2626;">ลบเดี่ยว</th>
            </tr>
        `;
    }
}

function getTypeBadgeStyle(itemType) {
    const text = (itemType || '').toLowerCase();
    if (text.includes('วัสดุ') || text.includes('consumable') || text.includes('ink')) {
        return { label: 'วัสดุสิ้นเปลือง', bg: '#0284c7', color: '#ffffff' };
    }
    if (text.includes('อะไหล่') || text.includes('spare') || text.includes('gear')) {
        return { label: 'อะไหล่', bg: '#ea580c', color: '#ffffff' };
    }
    return { label: 'สินค้า', bg: '#16a34a', color: '#ffffff' };
}

function updateSelectedCountUI() {
    const count = selectedItemSnSet.size;

    const oldFloatingBar = document.getElementById('wmsBatchSelectionBar');
    if (oldFloatingBar) oldFloatingBar.remove();
    const oldTopBar = document.getElementById('wmsTopBatchActionToolbar');
    if (oldTopBar) oldTopBar.remove();

    const totalBadge = document.getElementById('totalCountBadge');
    if (!totalBadge) return;

    let rightContainer = document.getElementById('wmsHeaderRightActionGroup');
    if (!rightContainer) {
        rightContainer = document.createElement('div');
        rightContainer.id = 'wmsHeaderRightActionGroup';
        rightContainer.style.cssText = `
            display: inline-flex; align-items: center; gap: 6px;
            margin-left: 12px; flex-wrap: wrap; vertical-align: middle;
        `;
        if (totalBadge.parentElement) {
            totalBadge.parentElement.appendChild(rightContainer);
        }
    }

    if (count > 0) {
        rightContainer.innerHTML = `
            <div style="font-weight:800; font-size:0.8rem; color:#2563eb; background:#eff6ff; padding:5px 10px; border-radius:8px; border:1px solid #bfdbfe; display:inline-flex; align-items:center; gap:5px;">
                <i class="fa-solid fa-square-check"></i> เลือกกลุ่ม <strong>${count.toLocaleString()}</strong> รายการ
            </div>
            <button class="btn btn-sm btn-primary" onclick="openPrintBarcodeModal('MULTI')" style="padding:5px 10px; font-size:0.78rem; border-radius:6px; font-weight:700;" title="พิมพ์บาร์โค้ดที่เลือก">
                <i class="fa-solid fa-barcode"></i> พิมพ์กลุ่ม
            </button>
            <button class="btn btn-sm btn-secondary" onclick="requestBatchRelocateModal()" style="padding:5px 10px; font-size:0.78rem; border-radius:6px; font-weight:700;" title="ย้ายพิกัดกลุ่ม">
                <i class="fa-solid fa-right-left"></i> ย้ายพิกัดกลุ่ม
            </button>
            <button class="btn btn-sm btn-danger" onclick="requestDeleteModal('BATCH', null, null, event)" style="padding:5px 10px; font-size:0.78rem; border-radius:6px; font-weight:700; background:#dc2626; border-color:#dc2626;" title="ลบรายการกลุ่มที่เลือกติ๊กไว้นี้">
                <i class="fa-solid fa-trash-can"></i> ลบรายการที่เลือก (${count})
            </button>
            <button class="btn btn-sm btn-success" onclick="openExcelExportModal()" style="padding:5px 10px; font-size:0.78rem; border-radius:6px; font-weight:700;" title="ส่งออก Excel">
                <i class="fa-solid fa-file-excel"></i> ส่งออก Excel
            </button>
            <button class="btn btn-sm btn-outline-danger" onclick="clearAllSelections()" style="padding:5px 10px; font-size:0.78rem; border-radius:6px; background:#fff; border:1px solid #dc2626; color:#dc2626; font-weight:700;" title="ล้างตัวเลือกทั้งหมด">
                <i class="fa-solid fa-xmark"></i> ล้างตัวเลือก
            </button>
        `;
        rightContainer.style.display = 'inline-flex';
    } else {
        rightContainer.style.display = 'none';
        rightContainer.innerHTML = '';
    }

    const footerBadge = document.getElementById('stockDetailModalFooterBadge');
    if (footerBadge && currentDetailModalGroupKey) {
        const grp = currentInventoryGroups.find(g => g.groupKey === currentDetailModalGroupKey);
        const totalInGroup = grp ? grp.items.length : 0;
        footerBadge.textContent = `แสดงผล ${totalInGroup} ซีเรียล | ติ๊กเลือกกลุ่มแล้ว ${count} รายการ`;
    }
}

function clearAllSelections() {
    selectedItemSnSet.clear();
    renderInventoryTable(currentFilteredItems);
    updateSelectedCountUI();
    if (typeof showToast === 'function') showToast("🧹 ล้างการเลือก Checkbox ทั้งหมดเรียบร้อยแล้ว");
}

function renderInventoryTable(items) {
    const tbody = document.getElementById('inventoryTableBody');
    if (!tbody) return;

    const tableWrapper = tbody.closest('.table-responsive');
    if (tableWrapper) {
        tableWrapper.style.overflowX = 'auto';
        tableWrapper.style.webkitOverflowScrolling = 'touch';
    }

    tbody.innerHTML = '';
    updateStockViewModeButtonUI();

    if (inventoryViewMode === 'grouped') {
        currentInventoryGroups = buildInventoryGroups(items);
        updateInventoryTableHeader();

        const totalBadge = document.getElementById('totalCountBadge');
        if (totalBadge) {
            totalBadge.textContent = `ทั้งหมด ${items.length.toLocaleString()} รายการ (${currentInventoryGroups.length.toLocaleString()} รุ่น)`;
        }

        if (currentInventoryGroups.length === 0) {
            tbody.innerHTML = `<tr><td colspan="7" style="text-align:center; padding:40px; color:#94a3b8; font-size:0.9rem;">ไม่พบข้อมูลสินค้าตรงตามเงื่อนไขค้นหา</td></tr>`;
            updateSelectedCountUI();
            return;
        }

        const frag = document.createDocumentFragment();

        currentInventoryGroups.forEach((grp) => {
            const typeBadge = getTypeBadgeStyle(grp.itemType);
            const bayCount = grp.bays ? grp.bays.length : 0;
            const locationCount = grp.locations ? grp.locations.length : 0;
            const isGroupFullyChecked = grp.items.length > 0 && grp.items.every(i => selectedItemSnSet.has(i.sn));

            const tr = document.createElement('tr');
            tr.style.cssText = "border-bottom: 1px solid #e2e8f0; transition: all 0.15s ease; cursor: pointer;";
            
            // 🟢 เมื่อคลิกทั้งแถว จะเปิด Modal แสดงรายการ S/N ย่อย
            tr.onclick = () => openStockDetailModal(grp.groupKey);
            tr.onmouseover = function() { this.style.background = '#f8fafc'; };
            tr.onmouseout = function() { this.style.background = 'transparent'; };

            tr.innerHTML = `
                <td style="padding: 10px 12px; text-align: center; vertical-align: middle;" onclick="event.stopPropagation();">
                    <input type="checkbox" class="group-checkbox" data-groupkey="${escapeHTML(grp.groupKey)}" ${isGroupFullyChecked ? 'checked' : ''} onchange="toggleGroupSelection('${escapeHTML(grp.groupKey)}', this.checked, event)">
                </td>

                <td style="padding: 10px 12px; text-align: center; vertical-align: middle;">
                    <div style="width: 46px; height: 46px; border-radius: 8px; background: #f8fafc; border: 1px solid #cbd5e1; display: flex; align-items: center; justify-content: center; overflow: hidden; margin: 0 auto; box-shadow:0 2px 4px rgba(0,0,0,0.02);">
                        ${grp.image ? 
                            `<img src="${escapeHTML(grp.image)}" style="width: 100%; height: 100%; object-fit: cover;" alt="product">` : 
                            `<i class="fa-solid fa-box-archive" style="font-size: 1.2rem; color: #64748b;"></i>`
                        }
                    </div>
                </td>

                <td style="padding: 10px 14px; vertical-align: middle; text-align: left;">
                    <div style="display: flex; align-items: center; gap: 6px; margin-bottom: 3px; flex-wrap: wrap;">
                        <span style="background: ${typeBadge.bg}; color: ${typeBadge.color}; font-size: 0.68rem; font-weight: 800; padding: 2px 8px; border-radius: 4px; white-space: nowrap; display: inline-block;">
                            ${escapeHTML(typeBadge.label)}
                        </span>
                        <span style="font-weight: 800; color: #0f172a; font-size: 0.85rem; font-family: monospace;">${escapeHTML(grp.category)}</span>
                    </div>
                    <div style="font-size: 0.84rem; color: #334155; font-weight: 700; display: -webkit-box; -webkit-line-clamp: 2; -webkit-box-orient: vertical; overflow: hidden; word-break: break-word; line-height: 1.35;" title="${escapeHTML(grp.name)}">
                        ${escapeHTML(grp.name)}
                    </div>
                </td>

                <td style="padding: 10px 14px; vertical-align: middle; text-align: left; font-size: 0.8rem; color: #475569; line-height: 1.4;">
                    <div><span style="color: #64748b;">ยี่ห้อ:</span> <strong style="color:#0f172a;">${escapeHTML(grp.brand || 'ไม่ระบุ')}</strong></div>
                    <div><span style="color: #64748b;">รุ่น:</span> <strong style="color:#2563eb;">${escapeHTML(grp.model || grp.name)}</strong></div>
                </td>

                <td style="padding: 10px 14px; text-align: right; vertical-align: middle;">
                    <span style="font-weight: 800; color: #0f172a; font-size: 1rem;">${grp.totalQty.toLocaleString()}</span>
                    <span style="font-size: 0.78rem; color: #64748b; margin-left: 2px; font-weight: 500;">${escapeHTML(grp.unit)}</span>
                </td>

                <td style="padding: 10px 14px; text-align: center; vertical-align: middle; font-weight: 700; color: #0284c7; font-size: 0.88rem;">
                    <span style="background: #f0f9ff; padding: 4px 10px; border-radius: 6px; border: 1px solid #bae6fd; display:inline-block;" title="อยู่ใน ${bayCount} ล็อก (${locationCount} พิกัดย่อย)">
                        📍 ${bayCount} ล็อก (${locationCount} พิกัด)
                    </span>
                </td>

                <td style="padding: 10px 14px; text-align: center; vertical-align: middle; color: #2563eb;" title="กดเพื่อดูซีเรียลในรุ่นนี้">
                    <button class="btn btn-sm btn-secondary" style="padding: 6px 10px; border-radius: 8px; border: 1px solid #cbd5e1; background: #ffffff;">
                        <i class="fa-solid fa-chevron-right" style="font-size: 0.9rem; color: #2563eb;"></i>
                    </button>
                </td>
            `;
            frag.appendChild(tr);
        });

        tbody.appendChild(frag);
    } else {
        updateInventoryTableHeader();

        const totalBadge = document.getElementById('totalCountBadge');
        if (totalBadge) {
            totalBadge.textContent = `แสดงผล ${items.length.toLocaleString()} / ${globalInventoryData.length.toLocaleString()} รายการ`;
        }

        if(items.length === 0) {
            tbody.innerHTML = `<tr><td colspan="14" style="text-align:center; padding:35px; color:#94a3b8; font-size:0.9rem;">ไม่พบข้อมูลสินค้าตรงตามเงื่อนไขค้นหา</td></tr>`;
            updateSelectedCountUI();
            return;
        }

        const frag = document.createDocumentFragment();
        let allVisibleChecked = items.length > 0;

        items.forEach((item, index) => {
            const isChecked = selectedItemSnSet.has(item.sn);
            if(!isChecked) allVisibleChecked = false;

            const formatLoc = typeof formatLocationCode === 'function' ? formatLocationCode(item.location) : item.location;
            const meterValue = item.meter !== undefined && item.meter !== null ? item.meter : 0;
            const receiverFullName = formatReceiverFullName(item);

            const safeId = String(item.id || '').replace(/'/g, "\\'");
            const safeSn = String(item.sn || '').replace(/'/g, "\\'");

            const tr = document.createElement('tr');
            tr.style.cssText = "border-bottom: 1px solid #e2e8f0; transition: background 0.15s ease;";
            tr.onmouseover = function() { this.style.background = '#f8fafc'; };
            tr.onmouseout = function() { this.style.background = 'transparent'; };

            tr.innerHTML = `
                <td style="text-align:center; vertical-align:middle; padding:8px 6px;">
                    <input type="checkbox" class="item-checkbox" data-sn="${escapeHTML(item.sn)}" ${isChecked ? 'checked' : ''} onchange="toggleItemSelection('${escapeHTML(item.sn)}', this.checked)">
                </td>
                <td style="text-align:center; font-weight:700; vertical-align:middle; padding:8px 6px;" class="mono">${index + 1}</td>
                <td style="text-align:center; vertical-align:middle; padding:8px 10px;"><code class="mono font-bold" style="color:#0f172a; font-size:0.82rem; background:#f1f5f9; padding:2px 6px; border-radius:4px; border:1px solid #cbd5e1;">${escapeHTML(item.category || 'N/A')}</code></td>
                <td style="text-align:left; vertical-align:middle; padding:8px 10px;"><div style="font-weight:600; color:#1e293b; font-size:0.82rem; display:-webkit-box; -webkit-line-clamp:2; -webkit-box-orient:vertical; overflow:hidden; word-break:break-word; line-height:1.35;" title="${escapeHTML(item.name || '-')}">${escapeHTML(item.name || '-')}</div></td>
                <td style="text-align:center; vertical-align:middle; padding:8px 10px;"><span class="mono font-bold" style="color:#d97706; font-size:0.85rem; display:inline-flex; align-items:center; justify-content:center; gap:4px; background:#fef3c7; padding:2px 8px; border-radius:4px; border:1px solid #fde68a;"><i class="fa-solid fa-gauge" style="font-size:0.75rem;"></i> ${Number(meterValue).toLocaleString()}</span></td>
                <td style="text-align:center; vertical-align:middle; padding:8px 10px;">
                    <div style="display:flex; align-items:center; justify-content:center; gap:4px;">
                        <code class="mono font-bold" style="font-size:0.85rem; background:#f8fafc; padding:2px 6px; border-radius:4px; border:1px solid #cbd5e1; color:#0f172a;">${escapeHTML(item.sn)}</code>
                        <button class="btn btn-sm btn-secondary" style="padding:2px 5px; font-size:0.68rem; border-radius:4px;" onclick="copyTextToClipboard('${escapeHTML(item.sn)}', 'S/N')" title="คัดลอก S/N"><i class="fa-solid fa-copy"></i></button>
                    </div>
                </td>
                <td style="text-align:center; vertical-align:middle; padding:8px 10px;">
                    <div style="display:flex; align-items:center; justify-content:center;">
                        <span class="badge-location mono" style="display:inline-flex; align-items:center; justify-content:center; gap:4px; padding:3px 8px; border-radius:4px; font-size:0.78rem; background:#f1f5f9; border:1px solid #cbd5e1; color:#0f172a; font-weight:700;">
                            <i class="fa-solid fa-location-dot" style="color:#2563eb; font-size:0.7rem;"></i> ${escapeHTML(formatLoc)}
                        </span>
                    </div>
                </td>
                <td style="text-align:center; font-weight:700; vertical-align:middle; padding:8px 6px;" class="mono">${item.qty ?? 1}</td>
                
                <!-- 🟢 แสดงชื่อผู้รับสินค้าเข้าตรงกันกับตอนรับเข้า 100% -->
                <td style="text-align:center; vertical-align:middle; padding:8px 10px;">
                    <div style="display:flex; align-items:center; justify-content:center;">
                        <span style="font-size:0.78rem; font-weight:700; color:#0f172a; display:inline-flex; align-items:center; justify-content:center; gap:5px; background:#eff6ff; padding:3px 10px; border-radius:6px; border:1px solid #bfdbfe; white-space:nowrap;" title="ผู้รับสินค้าเข้า: ${escapeHTML(receiverFullName)}">
                            <i class="fa-solid fa-user-check" style="color:#2563eb; font-size:0.75rem;"></i> ${escapeHTML(receiverFullName)}
                        </span>
                    </div>
                </td>

                <td style="text-align:center; font-size:0.75rem; color:#64748b; vertical-align:middle; padding:8px 10px;">${item.created_at ? new Date(item.created_at).toLocaleString('th-TH') : '-'}</td>
                <td style="text-align:center; vertical-align:middle; padding:8px 4px;">
                    <button class="btn btn-sm btn-primary" onclick="openPrintBarcodeModal('SINGLE', '${escapeHTML(item.sn)}')" style="padding:3px 8px; font-size:0.75rem;" title="พิมพ์บาร์โค้ด"><i class="fa-solid fa-barcode"></i> พิมพ์</button>
                </td>
                <td style="text-align:center; vertical-align:middle; padding:8px 4px;">
                    <button class="btn btn-sm btn-secondary" onclick="openEditItemModal('${safeId}', '${safeSn}')" style="padding:3px 8px; font-size:0.75rem;" title="แก้ไขข้อมูล"><i class="fa-solid fa-pen-to-square" style="color:#2563eb;"></i> แก้ไข</button>
                </td>
                <td style="text-align:center; vertical-align:middle; padding:8px 4px;">
                    <button class="btn btn-sm btn-secondary" onclick="requestRelocateModal('${safeId}', '${safeSn}', '${escapeHTML(item.name)}', '${escapeHTML(item.location)}')" style="padding:3px 8px; font-size:0.75rem;" title="ย้ายพิกัด"><i class="fa-solid fa-right-left"></i> ย้าย</button>
                </td>
                <td style="text-align:center; vertical-align:middle; padding:8px 4px;">
                    <button class="btn btn-sm btn-danger" onclick="requestDeleteModal('SINGLE', '${safeSn}', '${safeId}', event)" style="padding:4px 10px; font-size:0.75rem; background:#dc2626; border-color:#dc2626; font-weight:700; border-radius:6px;" title="ลบรายการนี้ออกจากฐานข้อมูลทันที">
                        <i class="fa-solid fa-trash-can"></i> ลบ
                    </button>
                </td>
            `;
            frag.appendChild(tr);
        });

        tbody.appendChild(frag);
        const selectAllCb = document.getElementById('selectAllCheckbox');
        if (selectAllCb) selectAllCb.checked = allVisibleChecked;
    }

    updateSelectedCountUI();
}

function toggleGroupSelection(groupKey, checked, event) {
    if (event && typeof event.stopPropagation === 'function') {
        event.stopPropagation();
    }
    const group = currentInventoryGroups.find(g => g.groupKey === groupKey);
    if (!group) return;

    group.items.forEach(item => {
        if (checked) selectedItemSnSet.add(item.sn);
        else selectedItemSnSet.delete(item.sn);
    });

    document.querySelectorAll('.item-checkbox-modal').forEach(cb => {
        const sn = cb.getAttribute('data-sn');
        if (group.items.some(i => i.sn === sn)) cb.checked = checked;
    });

    updateSelectedCountUI();
}

function toggleSelectAllGroups(checked) {
    currentInventoryGroups.forEach(grp => {
        grp.items.forEach(item => {
            if (checked) selectedItemSnSet.add(item.sn);
            else selectedItemSnSet.delete(item.sn);
        });
    });

    document.querySelectorAll('.group-checkbox').forEach(cb => cb.checked = checked);
    updateSelectedCountUI();
}

function toggleSelectAllVisibleItems(checked) {
    if (inventoryViewMode === 'grouped') {
        toggleSelectAllGroups(checked);
    } else {
        currentFilteredItems.forEach(item => {
            if (checked) selectedItemSnSet.add(item.sn);
            else selectedItemSnSet.delete(item.sn);
        });
        document.querySelectorAll('.item-checkbox').forEach(cb => cb.checked = checked);
    }

    updateSelectedCountUI();
}

function toggleItemSelection(sn, checked) {
    if(checked) selectedItemSnSet.add(sn);
    else selectedItemSnSet.delete(sn);

    document.querySelectorAll(`.item-checkbox-modal[data-sn="${escapeHTML(sn)}"]`).forEach(cb => cb.checked = checked);
    document.querySelectorAll(`.item-checkbox[data-sn="${escapeHTML(sn)}"]`).forEach(cb => cb.checked = checked);

    updateSelectedCountUI();
}