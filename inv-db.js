// =========================================================================
// --- MODULE 2: INVENTORY CHECK & MASTER PRODUCTS DATABASE ENGINE ---
// =========================================================================

// Safe Escape HTML Helper Fallback (Secures against XSS vulnerabilities)
if (typeof escapeHTML !== 'function') {
    function escapeHTML(str) {
        if (str === null || str === undefined) return '';
        return String(str)
            .replace(/&/g, '&amp;')
            .replace(/</g, '&lt;')
            .replace(/>/g, '&gt;')
            .replace(/"/g, '&quot;')
            .replace(/'/g, '&#039;');
    }
}

// Helper: สกัดรหัสแถวและล็อก (Aisle & Bay) จากพิกัดจัดเก็บเต็ม (เช่น A-01-1-01 -> A-01)
function extractAisleBayKey(locStr) {
    if (!locStr) return 'DOCK';
    const upper = String(locStr).toUpperCase().trim();
    const parts = upper.split('-');
    if (parts.length >= 2) {
        return `${parts[0]}-${parts[1]}`;
    }
    return upper;
}

// Helper: แปลงรหัสแถวและล็อกเป็นข้อความภาษาไทยสวยงาม
function formatAisleBayLabel(abKey) {
    if (!abKey) return 'DOCK';
    const parts = abKey.split('-');
    if (parts.length === 2) {
        return `แถว ${parts[0]} / ล็อก ${parts[1]}`;
    }
    if (abKey === 'DOCK') return 'ลาน DOCK';
    if (abKey === 'OFFICE') return 'ออฟฟิศ (OFFICE)';
    if (abKey === 'PENDING') return 'รอรับเข้า (PENDING)';
    return abKey;
}

// Helper: Quick Copy Text to Clipboard
function copyTextToClipboard(text, label = 'ข้อความ') {
    if (!text) return;
    if (navigator.clipboard && window.isSecureContext) {
        navigator.clipboard.writeText(text).then(() => {
            if (typeof showToast === 'function') {
                showToast(`📋 คัดลอก ${label} (${text}) เรียบร้อยแล้ว`);
            }
        }).catch(() => {});
    } else {
        const textArea = document.createElement("textarea");
        textArea.value = text;
        document.body.appendChild(textArea);
        textArea.select();
        try {
            document.execCommand('copy');
            if (typeof showToast === 'function') {
                showToast(`📋 คัดลอก ${label} (${text}) เรียบร้อยแล้ว`);
            }
        } catch (err) {}
        document.body.removeChild(textArea);
    }
}

// Secure Dynamic Supabase Instance Getter
function getSupabaseClient() {
    if (typeof _supabase !== 'undefined' && _supabase) {
        return _supabase;
    }
    if (typeof window !== 'undefined' && window.ENV && window.ENV.SUPABASE_CLIENT) {
        return window.ENV.SUPABASE_CLIENT;
    }
    return null;
}

let globalInventoryData = [];
let globalMasterProducts = [];
let occupiedLocationsSet = new Set();
let selectedItemSnSet = new Set();
let currentFilteredItems = [];
let currentInventoryGroups = [];
let inventoryViewMode = 'grouped'; // 'grouped' (Default) | 'detailed'
let currentDetailModalGroupKey = null;

// 🟢 1. ดึงรายการสินค้าทั้งหมดในคลัง (ดึงครบ 100% วนลูปจนกว่าจะหมด)
async function fetchAllWarehouseItems() {
    if (!navigator.onLine) {
        const cached = localStorage.getItem('WMS_LOCAL_INVENTORY_CACHE');
        return cached ? JSON.parse(cached) : [];
    }

    let allData = [];
    let from = 0;
    const step = 1000;
    let hasMore = true;
    let retryCount = 0;

    const client = getSupabaseClient();

    while (hasMore) {
        try {
            if (!client) break;

            const { data, error } = await client
                .from('warehouse_items')
                .select('*')
                .order('created_at', { ascending: false })
                .range(from, from + step - 1);

            if (error) {
                retryCount++;
                if (retryCount > 3) throw error;
                await new Promise(res => setTimeout(res, 500));
                continue;
            }

            if (data && data.length > 0) {
                allData = allData.concat(data);
                from += step;
                if (data.length < step) hasMore = false;
            } else {
                hasMore = false;
            }
        } catch (e) {
            hasMore = false;
        }
    }
    
    try { 
        localStorage.setItem('WMS_LOCAL_INVENTORY_CACHE', JSON.stringify(allData)); 
    } catch (e) {}

    if (typeof updateDBConnectionStatus === 'function') {
        updateDBConnectionStatus(true, `(สต็อกในคลัง: ${allData.length.toLocaleString()} รายการ)`);
    }
    return allData;
}

// 🟢 2. ดึงสินค้า Master SKU ทั้งหมดจากฐานข้อมูล Supabase (ไม่จำกัดจำนวน)
async function loadMasterProductsFromDB() {
    const statElem = document.getElementById('inboundMasterProductsStatText');
    if (statElem && globalMasterProducts.length === 0) {
        statElem.innerHTML = `<i class="fa-solid fa-spinner fa-spin"></i> กำลังดึงข้อมูลสินค้า Master ทั้งหมดจากฐานข้อมูล DB...`;
    }

    try {
        if (!navigator.onLine) {
            const cachedMaster = localStorage.getItem('WMS_MASTER_PRODUCTS_CACHE');
            if (cachedMaster) {
                try { globalMasterProducts = JSON.parse(cachedMaster); } catch(err) {}
            }
            updateMasterProductsStatUI();
            return;
        }

        const client = getSupabaseClient();
        if (!client) {
            updateMasterProductsStatUI();
            return;
        }

        let allProducts = [];
        let from = 0;
        const step = 1000;
        let hasMore = true;

        while (hasMore) {
            let response = await client
                .from('products')
                .select('*')
                .order('id', { ascending: true })
                .range(from, from + step - 1);

            if (response.error) {
                response = await client
                    .from('products')
                    .select('*')
                    .order('sku', { ascending: true })
                    .range(from, from + step - 1);
            }

            if (response.error) break;

            const data = response.data;
            if (data && data.length > 0) {
                allProducts = allProducts.concat(data);
                from += step;
                if (data.length < step) hasMore = false;
            } else {
                hasMore = false;
            }
        }

        if (allProducts.length > 0) {
            globalMasterProducts = allProducts;
            try {
                localStorage.setItem('WMS_MASTER_PRODUCTS_CACHE', JSON.stringify(allProducts));
            } catch (quotaErr) {}
        } else {
            const cachedMaster = localStorage.getItem('WMS_MASTER_PRODUCTS_CACHE');
            if (cachedMaster) {
                try { globalMasterProducts = JSON.parse(cachedMaster); } catch(err) {}
            }
        }

        updateMasterProductsStatUI();
    } catch(e) {
        const cachedMaster = localStorage.getItem('WMS_MASTER_PRODUCTS_CACHE');
        if (cachedMaster) {
            try { globalMasterProducts = JSON.parse(cachedMaster); } catch(err) {}
        }
        updateMasterProductsStatUI();
    }
}

// 🟢 3. อัปเดตข้อความสถานะจำนวน Master SKU
function updateMasterProductsStatUI() {
    const statElem = document.getElementById('inboundMasterProductsStatText');
    if (statElem) {
        const count = globalMasterProducts.length;
        if (count > 0) {
            statElem.innerHTML = `<i class="fa-solid fa-circle-check" style="color:var(--success);"></i> เชื่อมต่อ DB สมบูรณ์ · ดึงข้อมูลสินค้า Master ในระบบแล้ว <strong class="mono" style="color:var(--primary-text); font-size:1.1rem; background:var(--bg-surface); padding:2px 8px; border-radius:6px; border:1px solid var(--border-strong);">${count.toLocaleString()}</strong> รายการ (ครบถ้วน 100%)`;
        } else {
            statElem.innerHTML = `<i class="fa-solid fa-triangle-exclamation" style="color:var(--warning);"></i> ไม่พบข้อมูลสินค้า Master ในระบบ`;
        }
    }
}

async function loadDataFromDatabase() {
    try {
        globalInventoryData = await fetchAllWarehouseItems();
        globalInventoryData.forEach(item => {
            if (item.meter === undefined || item.meter === null || item.meter === '') {
                item.meter = 0;
            }
        });

        mergePendingIntoInventory();
        await loadMasterProductsFromDB();
        if (typeof loadWarehouseConfigsFromDB === 'function') await loadWarehouseConfigsFromDB();

        rebuildOccupiedSet();
        filterInventoryData();
        updateKPIs();
        if (typeof refreshLocationVisualizerIfActive === 'function') refreshLocationVisualizerIfActive();
        if (typeof loadRecentInboundFeedFromDB === 'function') await loadRecentInboundFeedFromDB(); 
    } catch (err) {
        if (typeof updateDBConnectionStatus === 'function') {
            updateDBConnectionStatus(false, "(Sync Failed)");
        }
    }
}

function mergePendingIntoInventory() {
    const have = new Set(globalInventoryData.map(i => String(i.sn).toLowerCase()));
    if (typeof offlineInboundQueue !== 'undefined' && Array.isArray(offlineInboundQueue)) {
        offlineInboundQueue.forEach(p => {
            if (!have.has(String(p.sn).toLowerCase())) globalInventoryData.unshift({ ...p, _pending: true });
        });
    }
}

function rebuildOccupiedSet() {
    occupiedLocationsSet.clear();
    globalInventoryData.forEach(i => {
        if(i.location && i.location.toUpperCase() !== 'DOCK' && i.location.toUpperCase() !== 'OFFICE' && i.location.toUpperCase() !== 'PENDING') {
            occupiedLocationsSet.add(i.location.toUpperCase());
        }
    });
}

function filterInventoryData() {
    const searchInput = document.getElementById('searchInput');
    const aisleSelect = document.getElementById('filterAisleSelect');
    const baySelect = document.getElementById('filterBaySelect');
    const locSelect = document.getElementById('filterLocationSelect');

    const query = searchInput ? searchInput.value.trim().toLowerCase() : '';
    const aisleFilter = aisleSelect ? aisleSelect.value : 'ALL';
    const bayFilter = baySelect ? baySelect.value : 'ALL';
    const locFilter = locSelect ? locSelect.value : 'ALL';

    currentFilteredItems = globalInventoryData.filter(item => {
        const matchText = !query || 
            (item.sn && item.sn.toLowerCase().includes(query)) ||
            (item.category && item.category.toLowerCase().includes(query)) ||
            (item.name && item.name.toLowerCase().includes(query)) ||
            (item.location && item.location.toLowerCase().includes(query));

        let matchAisle = true;
        if(aisleFilter !== 'ALL') {
            if(aisleFilter === 'DOCK') matchAisle = (item.location || '').toUpperCase() === 'DOCK';
            else matchAisle = (item.location || '').toUpperCase().startsWith(`${aisleFilter}-`) || (item.location || '').toUpperCase() === aisleFilter;
        }

        let matchBay = true;
        if(bayFilter !== 'ALL' && aisleFilter !== 'ALL' && aisleFilter !== 'DOCK') {
            matchBay = (item.location || '').toUpperCase().startsWith(`${aisleFilter}-${bayFilter}-`);
        }

        let matchLoc = true;
        if(locFilter !== 'ALL') {
            matchLoc = (item.location || '').toUpperCase() === locFilter.toUpperCase();
        }

        return matchText && matchAisle && matchBay && matchLoc;
    });

    renderInventoryTable(currentFilteredItems);
    refreshStockDetailModalIfActive();
}

// 🟢 โครงสร้างจัดกลุ่มสินค้าสำหรับแสดงผลแบบรวดเร็วตามหมวดหมู่/รุ่น
function buildInventoryGroups(items) {
    const map = new Map();
    items.forEach(item => {
        const cat = (item.category || 'N/A').trim();
        const name = (item.name || '-').trim();
        const key = `${cat}||${name}`;

        if (!map.has(key)) {
            map.set(key, {
                groupKey: key,
                category: cat,
                name: name,
                items: [],
                totalQty: 0,
                locationSet: new Set(),
                pendingCount: 0
            });
        }
        const grp = map.get(key);
        grp.items.push(item);
        grp.totalQty += (parseInt(item.qty) || 1);
        if (item.location) grp.locationSet.add(item.location.toUpperCase());
        if (item._pending) grp.pendingCount++;
    });

    const groups = [];
    map.forEach(grp => {
        groups.push({
            groupKey: grp.groupKey,
            category: grp.category,
            name: grp.name,
            items: grp.items,
            totalQty: grp.totalQty,
            locations: Array.from(grp.locationSet).sort(),
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
            btn.style.cssText = 'margin-left: 12px; font-weight: 600; cursor: pointer; transition: all 0.2s ease; box-shadow: 0 2px 6px rgba(0,0,0,0.05);';
            btn.onclick = toggleStockViewMode;
            totalBadge.parentElement.appendChild(btn);
        }
    }
    if (btn) {
        if (inventoryViewMode === 'grouped') {
            btn.innerHTML = `<i class="fa-solid fa-layer-group" style="color:var(--primary);"></i> โหมดจัดกลุ่มตามรุ่น (Default)`;
            btn.title = "คลิกเพื่อสลับเป็นโหมดแสดงรายการซีเรียลทั้งหมด";
        } else {
            btn.innerHTML = `<i class="fa-solid fa-list-check" style="color:var(--warning);"></i> โหมดแสดงทุกซีเรียล`;
            btn.title = "คลิกเพื่อสลับเป็นโหมดจัดกลุ่มตามรุ่นเพื่อความรวดเร็ว";
        }
    }
}

function toggleStockViewMode() {
    inventoryViewMode = (inventoryViewMode === 'grouped') ? 'detailed' : 'grouped';
    updateStockViewModeButtonUI();
    renderInventoryTable(currentFilteredItems);
    if (typeof showToast === 'function') {
        showToast(`🎨 สลับเป็น: ${inventoryViewMode === 'grouped' ? 'โหมดจัดกลุ่มตามรุ่น (กระชับพื้นที่)' : 'โหมดแสดงทุกซีเรียล'}`);
    }
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
        const allChecked = currentInventoryGroups.length > 0 && currentInventoryGroups.every(g => g.items.every(i => selectedItemSnSet.has(i.sn)));
        thead.innerHTML = `
            <tr style="background: var(--bg-subtle, #f8fafc); border-bottom: 2px solid var(--border-color, #e2e8f0);">
                <th style="width:40px; text-align:center;"><input type="checkbox" id="selectAllCheckbox" ${allChecked ? 'checked' : ''} onchange="toggleSelectAllVisibleItems(this.checked)"></th>
                <th style="width:60px; text-align:center;">ลำดับ</th>
                <th style="width:160px;">รหัสสินค้า (SKU)</th>
                <th>ชื่อสินค้า / ชื่อรุ่น</th>
                <th style="width:220px;">พิกัดจัดเก็บในคลัง</th>
                <th style="width:130px; text-align:center;">ยอดรวมในคลัง</th>
                <th style="width:140px; text-align:center;">สถานะ DB</th>
                <th style="width:150px; text-align:center;">จัดการ / ซีเรียล</th>
            </tr>
        `;
    } else {
        const allChecked = currentFilteredItems.length > 0 && currentFilteredItems.every(i => selectedItemSnSet.has(i.sn));
        thead.innerHTML = `
            <tr style="background: var(--bg-subtle, #f8fafc); border-bottom: 2px solid var(--border-color, #e2e8f0);">
                <th style="width:40px; text-align:center;"><input type="checkbox" id="selectAllCheckbox" ${allChecked ? 'checked' : ''} onchange="toggleSelectAllVisibleItems(this.checked)"></th>
                <th style="width:50px; text-align:center;">ลำดับ</th>
                <th>รหัสสินค้า (SKU)</th>
                <th>ชื่อรุ่น / รายละเอียด</th>
                <th>เลขมิเตอร์</th>
                <th>หมายเลขซีเรียล (S/N)</th>
                <th>พิกัดจัดเก็บ</th>
                <th style="text-align:center;">จำนวน</th>
                <th>วันที่รับเข้า</th>
                <th style="text-align:center;">พิมพ์</th>
                <th style="text-align:center;">แก้ไข</th>
                <th style="text-align:center;">ย้าย</th>
                <th style="text-align:center;">ลบ</th>
            </tr>
        `;
    }
}

// 🟢 แสดงผลตารางสต็อกสินค้า — พิกัดจัดเก็บเรียงเป็นแถวลงมาข้างล่าง (Vertical Stack) อย่างกระชับพื้นที่
function renderInventoryTable(items) {
    const tbody = document.getElementById('inventoryTableBody');
    if (!tbody) return;
    tbody.innerHTML = '';

    updateStockViewModeButtonUI();

    if (inventoryViewMode === 'grouped') {
        currentInventoryGroups = buildInventoryGroups(items);
        updateInventoryTableHeader();

        const totalBadge = document.getElementById('totalCountBadge');
        if (totalBadge) {
            totalBadge.textContent = `ดึงข้อมูลแล้ว ${items.length.toLocaleString()} รายการ (${currentInventoryGroups.length.toLocaleString()} รุ่น) / ${globalInventoryData.length.toLocaleString()} รายการทั้งหมด`;
        }

        if (currentInventoryGroups.length === 0) {
            tbody.innerHTML = `<tr><td colspan="8" style="text-align:center; padding:28px; color:var(--text-muted); font-size:0.92rem;">ไม่พบข้อมูลสินค้าตรงตามเงื่อนไขค้นหา</td></tr>`;
            return;
        }

        const frag = document.createDocumentFragment();

        currentInventoryGroups.forEach((grp, idx) => {
            const isGroupAllChecked = grp.items.every(i => selectedItemSnSet.has(i.sn));
            const formatFn = typeof formatLocationCode === 'function' ? formatLocationCode : (l => l);

            let locHtml = '';
            if (grp.locations.length === 0) {
                locHtml = `
                    <div style="display:flex; flex-direction:column; gap:4px; align-items:flex-start;">
                        <span class="badge-location mono" style="display:inline-flex; align-items:center; gap:5px; padding:3px 8px; border-radius:6px; font-size:0.78rem; font-weight:600; background:var(--bg-subtle, #f1f5f9); border:1px solid var(--border-color, #e2e8f0); color:var(--text-sub, #475569);">
                            <i class="fa-solid fa-location-dot" style="color:#64748b;"></i> DOCK
                        </span>
                    </div>`;
            } else {
                const displayLocs = grp.locations.slice(0, 3);
                const locItems = displayLocs.map(loc => 
                    `<span class="badge-location mono" style="display:inline-flex; align-items:center; gap:5px; padding:3px 9px; border-radius:6px; font-size:0.78rem; font-weight:700; background:linear-gradient(135deg, rgba(37,99,235,0.08) 0%, rgba(59,130,246,0.12) 100%); border:1px solid rgba(37,99,235,0.2); color:var(--primary, #2563eb); white-space:nowrap;">
                        <i class="fa-solid fa-location-dot" style="color:#2563eb; font-size:0.72rem;"></i> ${escapeHTML(formatFn(loc))}
                    </span>`
                ).join('');

                let moreBadge = '';
                if (grp.locations.length > 3) {
                    moreBadge = `<span class="badge-action nav" style="font-size:0.72rem; padding:2px 7px; border-radius:4px; font-weight:600; cursor:pointer;" title="${escapeHTML(grp.locations.map(formatFn).join(', '))}">+ อีก ${grp.locations.length - 3} พิกัด</span>`;
                }

                locHtml = `<div style="display:flex; flex-direction:column; gap:4px; align-items:flex-start; max-height:85px; overflow-y:auto; padding-right:2px;">${locItems}${moreBadge}</div>`;
            }

            let statusBadge = `<span class="badge-action inbound" style="font-size:0.75rem; padding:3px 10px; border-radius:12px; font-weight:700;"><i class="fa-solid fa-circle-check"></i> พร้อมใช้งาน</span>`;
            if (grp.pendingCount > 0) {
                statusBadge = `<span class="badge-action delete" style="font-size:0.72rem; padding:3px 8px; border-radius:12px; font-weight:700;"><i class="fa-solid fa-cloud-arrow-up"></i> รอบันทึก DB (${grp.pendingCount})</span>`;
            }

            const tr = document.createElement('tr');
            tr.style.cssText = "transition: background 0.15s ease;";
            tr.innerHTML = `
                <td style="text-align:center; vertical-align:middle;">
                    <input type="checkbox" class="group-checkbox" data-group-key="${escapeHTML(grp.groupKey)}" ${isGroupAllChecked ? 'checked' : ''} onchange="toggleGroupSelection('${escapeHTML(grp.groupKey)}', this.checked)">
                </td>
                <td style="text-align:center; font-weight:700; vertical-align:middle;" class="mono">${idx + 1}</td>
                <td style="vertical-align:middle;"><code class="mono font-bold" style="color:var(--primary-text); font-size:0.92rem; background:rgba(37,99,235,0.06); padding:3px 8px; border-radius:4px; border:1px solid rgba(37,99,235,0.15);">${escapeHTML(grp.category)}</code></td>
                <td style="vertical-align:middle;">
                    <div class="font-bold text-multiline-truncate" style="color:var(--text-main); font-size:0.92rem;" title="${escapeHTML(grp.name)}">${escapeHTML(grp.name)}</div>
                    <div style="font-size:0.75rem; color:var(--text-muted); margin-top:2px;"><i class="fa-solid fa-barcode"></i> รวม ${grp.items.length} ซีเรียล</div>
                </td>
                <td style="vertical-align:middle;">${locHtml}</td>
                <td style="text-align:center; vertical-align:middle;">
                    <span class="mono font-bold" style="color:var(--success, #10b981); font-size:1.02rem; background:var(--bg-subtle, #f8fafc); padding:4px 12px; border-radius:8px; border:1px solid var(--border-color, #e2e8f0); display:inline-block; box-shadow:0 1px 2px rgba(0,0,0,0.04);">
                        ${grp.totalQty.toLocaleString()} เครื่อง
                    </span>
                </td>
                <td style="text-align:center; vertical-align:middle;">${statusBadge}</td>
                <td style="text-align:center; vertical-align:middle;">
                    <button class="btn btn-sm btn-primary" onclick="openStockDetailModal('${escapeHTML(grp.groupKey)}')" title="กดดูซีเรียลและรายละเอียดสินค้า" style="border-radius:6px; font-weight:600; padding:5px 12px; transition:all 0.2s ease; box-shadow: 0 2px 4px rgba(37,99,235,0.2);">
                        <i class="fa-solid fa-eye"></i> ดูซีเรียล (${grp.items.length})
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
            totalBadge.textContent = `ดึงข้อมูลแล้ว ${items.length.toLocaleString()} / ${globalInventoryData.length.toLocaleString()} รายการ`;
        }

        if(items.length === 0) {
            tbody.innerHTML = `<tr><td colspan="13" style="text-align:center; padding:28px; color:var(--text-muted); font-size:0.92rem;">ไม่พบข้อมูลสินค้าตรงตามเงื่อนไขค้นหา</td></tr>`;
            return;
        }

        const frag = document.createDocumentFragment();
        let allVisibleChecked = items.length > 0;

        items.forEach((item, index) => {
            const isChecked = selectedItemSnSet.has(item.sn);
            if(!isChecked) allVisibleChecked = false;

            const formatLoc = typeof formatLocationCode === 'function' ? formatLocationCode(item.location) : item.location;
            const meterValue = item.meter !== undefined && item.meter !== null ? item.meter : 0;
            
            const tr = document.createElement('tr');
            tr.innerHTML = `
                <td style="text-align:center; vertical-align:middle;"><input type="checkbox" class="item-checkbox" data-sn="${escapeHTML(item.sn)}" ${isChecked ? 'checked' : ''} onchange="toggleItemSelection('${escapeHTML(item.sn)}', this.checked)"></td>
                <td style="text-align:center; font-weight:700; vertical-align:middle;" class="mono">${index + 1}</td>
                <td style="vertical-align:middle;"><code class="mono font-bold" style="color:var(--primary-text);">${escapeHTML(item.category || 'N/A')}</code></td>
                <td style="vertical-align:middle;"><div class="text-multiline-truncate" title="${escapeHTML(item.name || '-')}">${escapeHTML(item.name || '-')}</div></td>
                <td style="vertical-align:middle;"><span class="mono font-bold" style="color:var(--warning); font-size:0.92rem;"><i class="fa-solid fa-gauge"></i> ${Number(meterValue).toLocaleString()}</span></td>
                <td style="vertical-align:middle;">
                    <div style="display:flex; align-items:center; gap:6px;">
                        <code class="mono font-bold">${escapeHTML(item.sn)}</code>
                        <button class="btn btn-sm btn-secondary" style="padding:1px 5px; font-size:0.7rem; border-radius:4px;" onclick="copyTextToClipboard('${escapeHTML(item.sn)}', 'S/N')" title="คัดลอก S/N"><i class="fa-solid fa-copy"></i></button>
                    </div>
                    ${item._pending ? ' <span class="badge-action delete" style="font-size:0.68rem;"><i class="fa-solid fa-clock"></i> รอบันทึก DB</span>' : ''}
                </td>
                <td style="vertical-align:middle;">
                    <div style="display:flex; flex-direction:column; align-items:flex-start;">
                        <span class="badge-location mono" style="display:inline-flex; align-items:center; gap:4px; padding:2px 8px; border-radius:6px; font-size:0.78rem;">
                            <i class="fa-solid fa-location-dot" style="color:var(--primary);"></i> ${escapeHTML(formatLoc)}
                        </span>
                    </div>
                </td>
                <td style="text-align:center; font-weight:700; vertical-align:middle;" class="mono">${item.qty ?? 1}</td>
                <td style="font-size:0.78rem; color:var(--text-muted); vertical-align:middle;">${item.created_at ? new Date(item.created_at).toLocaleString('th-TH') : '-'}</td>
                <td style="text-align:center; vertical-align:middle;">
                    <button class="btn btn-sm btn-primary" onclick="openPrintBarcodeModal('SINGLE', '${escapeHTML(item.sn)}')"><i class="fa-solid fa-barcode"></i> พิมพ์</button>
                </td>
                <td style="text-align:center; vertical-align:middle;">
                    <button class="btn btn-sm btn-secondary" onclick="openEditItemModal('${escapeHTML(String(item.id))}', '${escapeHTML(item.sn)}')"><i class="fa-solid fa-pen-to-square" style="color:var(--primary);"></i> แก้ไข</button>
                </td>
                <td style="text-align:center; vertical-align:middle;">
                    <button class="btn btn-sm btn-secondary" onclick="requestRelocateModal('${escapeHTML(String(item.id))}', '${escapeHTML(item.sn)}', '${escapeHTML(item.name)}', '${escapeHTML(item.location)}')"><i class="fa-solid fa-right-left"></i> ย้าย</button>
                </td>
                <td style="text-align:center; vertical-align:middle;">
                    <button class="btn btn-sm btn-danger" onclick="requestDeleteModal('SINGLE', '${escapeHTML(item.sn)}', '${escapeHTML(String(item.id))}')"><i class="fa-solid fa-trash"></i> ลบ</button>
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

function toggleGroupSelection(groupKey, checked) {
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

// 🟢 สร้างและจัดการ Modal สำหรับดูรายละเอียดซีเรียลเชิงลึก — คัดกรองเฉพาะ "แถวจัดเก็บและล็อก" (Aisle & Bay) ตามที่มีอยู่จริง
function ensureStockDetailModalExists() {
    let modal = document.getElementById('stockDetailModal');
    if (!modal) {
        modal = document.createElement('div');
        modal.id = 'stockDetailModal';
        modal.className = 'modal-overlay';
        modal.style.cssText = `
            display: none;
            position: fixed;
            top: 0; left: 0; width: 100%; height: 100%;
            background: rgba(15, 23, 42, 0.7);
            z-index: 99999;
            align-items: center;
            justify-content: center;
            backdrop-filter: blur(8px);
            padding: 16px;
            box-sizing: border-box;
            animation: fadeInModal 0.2s cubic-bezier(0.16, 1, 0.3, 1);
        `;
        modal.innerHTML = `
            <div class="modal-content" style="
                background: var(--bg-surface, #ffffff);
                border-radius: 18px;
                max-width: 1200px;
                width: 98%;
                max-height: 92vh;
                display: flex;
                flex-direction: column;
                box-shadow: 0 25px 50px -12px rgba(0, 0, 0, 0.35);
                border: 1px solid var(--border-color, #e2e8f0);
                overflow: hidden;
            ">
                <div class="modal-header" style="
                    padding: 18px 24px;
                    border-bottom: 1px solid var(--border-color, #e2e8f0);
                    display: flex;
                    justify-content: space-between;
                    align-items: center;
                    background: var(--bg-subtle, #f8fafc);
                ">
                    <div>
                        <h3 id="stockDetailModalTitle" style="margin:0; font-size:1.22rem; color:var(--primary-text, #0f172a); font-weight:800; display:flex; align-items:center; gap:8px;">
                            <i class="fa-solid fa-boxes-stacked" style="color:var(--primary, #2563eb);"></i> รายละเอียดซีเรียลสินค้า
                        </h3>
                        <div id="stockDetailModalSubtitle" style="font-size:0.88rem; color:var(--text-muted, #64748b); margin-top:5px;"></div>
                    </div>
                    <button type="button" onclick="closeStockDetailModal()" style="
                        background: rgba(100,116,139,0.12); border: none; font-size: 1.25rem; width:38px; height:38px; border-radius:50%; cursor: pointer; color: var(--text-muted, #64748b); display:flex; align-items:center; justify-content:center; transition:all 0.2s ease;
                    " onmouseover="this.style.background='rgba(239,68,68,0.15)'; this.style.color='#ef4444';" onmouseout="this.style.background='rgba(100,116,139,0.12)'; this.style.color='#64748b';">&times;</button>
                </div>
                
                <div style="padding: 14px 24px; background: var(--bg-surface, #fff); border-bottom: 1px solid var(--border-color, #e2e8f0); display: flex; flex-wrap: wrap; gap: 12px; align-items: center; justify-content: space-between;">
                    <div style="display:flex; gap:10px; align-items:center; flex:1; min-width:320px; flex-wrap:wrap;">
                        <div style="display:flex; align-items:center; gap:8px; flex:1; min-width:200px;">
                            <i class="fa-solid fa-magnifying-glass" style="color:var(--text-muted, #64748b);"></i>
                            <input type="text" id="stockDetailModalSearch" class="form-control" placeholder="ค้นหา S/N หรือ มิเตอร์ ในรุ่นนี้..." oninput="filterStockDetailModalItems()" style="padding:8px 14px; font-size:0.88rem; width:100%; border-radius:8px; border:1px solid var(--border-color, #cbd5e1); transition:all 0.2s ease;">
                        </div>
                        <div style="display:flex; align-items:center; gap:6px;">
                            <i class="fa-solid fa-layer-group" style="color:var(--primary, #2563eb);"></i>
                            <select id="stockDetailModalLocationFilter" class="form-control" onchange="filterStockDetailModalItems()" style="padding:8px 12px; font-size:0.88rem; border-radius:8px; border:1px solid var(--border-color, #cbd5e1); background:var(--bg-surface, #fff); cursor:pointer; font-weight:600; color:var(--primary-text, #0f172a);">
                                <option value="ALL">📍 แสดงทุกแถว/ล็อกที่เก็บอยู่จริง</option>
                            </select>
                        </div>
                        <span id="stockDetailFilterCountBadge" class="badge-action nav" style="font-size:0.75rem; display:none; padding:4px 10px; border-radius:6px;"></span>
                    </div>
                    <div style="display:flex; gap:8px; align-items:center; flex-wrap:wrap;">
                        <button class="btn btn-sm btn-primary" onclick="printSelectedBarcodesFromModal()" style="border-radius:8px; font-weight:600; padding:7px 14px; box-shadow:0 2px 6px rgba(37,99,235,0.25);"><i class="fa-solid fa-barcode"></i> พิมพ์บาร์โค้ดที่เลือก</button>
                        <button class="btn btn-sm btn-secondary" onclick="relocateSelectedFromModal()" style="border-radius:8px; font-weight:600; padding:7px 14px;"><i class="fa-solid fa-right-left"></i> ย้ายพิกัดที่เลือก</button>
                        <button class="btn btn-sm btn-danger" onclick="deleteSelectedFromModal()" style="border-radius:8px; font-weight:600; padding:7px 14px;"><i class="fa-solid fa-trash"></i> ลบรายการที่เลือก</button>
                    </div>
                </div>

                <div class="modal-body" style="padding: 18px 24px; overflow-y: auto; flex: 1;">
                    <div class="table-responsive">
                        <table class="table" style="width:100%; border-collapse:collapse;">
                            <thead>
                                <tr style="background:var(--bg-subtle, #f1f5f9); border-bottom:2px solid var(--border-color, #cbd5e1);">
                                    <th style="width:40px; text-align:center;"><input type="checkbox" id="modalSelectAllCb" onchange="toggleModalSelectAllItems(this.checked)"></th>
                                    <th style="width:50px; text-align:center;">ลำดับ</th>
                                    <th>รหัสสินค้า (SKU)</th>
                                    <th>ชื่อรุ่น / สินค้า</th>
                                    <th>เลขมิเตอร์</th>
                                    <th>หมายเลขซีเรียล (S/N)</th>
                                    <th style="width:160px;">พิกัดจัดเก็บ</th>
                                    <th style="text-align:center;">จำนวน</th>
                                    <th>วันที่รับเข้า</th>
                                    <th style="text-align:center;">พิมพ์</th>
                                    <th style="text-align:center;">แก้ไข</th>
                                    <th style="text-align:center;">ย้าย</th>
                                    <th style="text-align:center;">ลบ</th>
                                </tr>
                            </thead>
                            <tbody id="stockDetailModalTbody">
                            </tbody>
                        </table>
                    </div>
                </div>
                
                <div class="modal-footer" style="
                    padding: 14px 24px;
                    border-top: 1px solid var(--border-color, #e2e8f0);
                    display: flex;
                    justify-content: space-between;
                    align-items: center;
                    background: var(--bg-subtle, #f8fafc);
                ">
                    <span id="stockDetailModalFooterBadge" class="mono font-bold" style="font-size:0.88rem; color:var(--primary-text, #0f172a);"></span>
                    <button type="button" class="btn btn-secondary" onclick="closeStockDetailModal()" style="border-radius:8px; font-weight:600; padding:7px 18px;">ปิดหน้าต่าง</button>
                </div>
            </div>
        `;
        document.body.appendChild(modal);
    }
}

// 🟢 เปิด Modal รายละเอียดซีเรียล — สกัดและสร้างตัวเลือกคัดกรองเฉพาะ "แถวจัดเก็บและล็อก" (Aisle & Bay) ตามที่มีอยู่จริงของสินค้ารุ่นนี้
function openStockDetailModal(groupKey) {
    currentDetailModalGroupKey = groupKey;
    ensureStockDetailModalExists();

    const grp = currentInventoryGroups.find(g => g.groupKey === groupKey);
    if (!grp) {
        if (typeof showToast === 'function') showToast('⚠️ ไม่พบข้อมูลสินค้ากลุ่มนี้', true);
        return;
    }

    const titleElem = document.getElementById('stockDetailModalTitle');
    const subtitleElem = document.getElementById('stockDetailModalSubtitle');
    const searchInput = document.getElementById('stockDetailModalSearch');
    const locSelect = document.getElementById('stockDetailModalLocationFilter');

    if (titleElem) {
        titleElem.innerHTML = `<i class="fa-solid fa-boxes-stacked" style="color:var(--primary);"></i> รหัสสินค้า: <span class="mono" style="color:var(--primary-text); background:rgba(37,99,235,0.08); padding:2px 8px; border-radius:6px; border:1px solid rgba(37,99,235,0.2);">${escapeHTML(grp.category)}</span> | รุ่น: ${escapeHTML(grp.name)}`;
    }
    
    // 🟢 แสดงเฉพาะยอดคงเหลือรวม
    if (subtitleElem) {
        subtitleElem.innerHTML = `ยอดคงเหลือรวม: <strong style="color:var(--success, #10b981); font-size:1.02rem; background:rgba(16,185,129,0.1); padding:3px 12px; border-radius:8px; border:1px solid rgba(16,185,129,0.25); display:inline-block; margin-left:6px;"><i class="fa-solid fa-cubes"></i> ${grp.totalQty.toLocaleString()} เครื่อง</strong>`;
    }
    
    // 🟢 สกัดเฉพาะ แถวและล็อก (Aisle-Bay) ที่มีสินค้าตัวนี้เก็บอยู่จริง
    if (locSelect) {
        const aisleBayMap = new Map();
        grp.items.forEach(item => {
            const abKey = extractAisleBayKey(item.location);
            aisleBayMap.set(abKey, (aisleBayMap.get(abKey) || 0) + 1);
        });

        const sortedAisleBayKeys = Array.from(aisleBayMap.keys()).sort();
        let locOptions = `<option value="ALL">📍 แสดงทุกแถว/ล็อกที่เก็บอยู่จริง (${sortedAisleBayKeys.length} พิกัด)</option>`;
        
        sortedAisleBayKeys.forEach(abKey => {
            const count = aisleBayMap.get(abKey);
            const labelText = formatAisleBayLabel(abKey);
            locOptions += `<option value="${escapeHTML(abKey)}">📍 ${escapeHTML(labelText)} (${count} เครื่อง)</option>`;
        });

        locSelect.innerHTML = locOptions;
        locSelect.value = 'ALL';
    }

    if (searchInput) searchInput.value = '';

    renderStockDetailModalBody(grp.items);

    const modal = document.getElementById('stockDetailModal');
    if (modal) modal.style.display = 'flex';
}

function renderStockDetailModalBody(items) {
    const tbody = document.getElementById('stockDetailModalTbody');
    if (!tbody) return;
    tbody.innerHTML = '';

    if (!items || items.length === 0) {
        tbody.innerHTML = `<tr><td colspan="13" style="text-align:center; padding:28px; color:var(--text-muted); font-size:0.92rem;">ไม่พบรายการซีเรียลสินค้าตรงตามเงื่อนไข</td></tr>`;
        return;
    }

    let allChecked = items.length > 0;
    const frag = document.createDocumentFragment();

    items.forEach((item, index) => {
        const isChecked = selectedItemSnSet.has(item.sn);
        if (!isChecked) allChecked = false;

        const formatLoc = typeof formatLocationCode === 'function' ? formatLocationCode(item.location) : item.location;
        const meterValue = item.meter !== undefined && item.meter !== null ? item.meter : 0;

        const tr = document.createElement('tr');
        tr.style.cssText = "border-bottom: 1px solid var(--border-color, #e2e8f0); transition: background 0.15s ease;";
        tr.innerHTML = `
            <td style="text-align:center; vertical-align:middle;"><input type="checkbox" class="item-checkbox-modal" data-sn="${escapeHTML(item.sn)}" ${isChecked ? 'checked' : ''} onchange="toggleItemSelection('${escapeHTML(item.sn)}', this.checked)"></td>
            <td style="text-align:center; font-weight:700; vertical-align:middle;" class="mono">${index + 1}</td>
            <td style="vertical-align:middle;"><code class="mono font-bold" style="color:var(--primary-text);">${escapeHTML(item.category || 'N/A')}</code></td>
            <td style="vertical-align:middle;"><div class="text-multiline-truncate" title="${escapeHTML(item.name || '-')}">${escapeHTML(item.name || '-')}</div></td>
            <td style="vertical-align:middle;"><span class="mono font-bold" style="color:var(--warning); font-size:0.92rem;"><i class="fa-solid fa-gauge"></i> ${Number(meterValue).toLocaleString()}</span></td>
            <td style="vertical-align:middle;">
                <div style="display:flex; align-items:center; gap:6px;">
                    <code class="mono font-bold" style="font-size:0.92rem;">${escapeHTML(item.sn)}</code>
                    <button class="btn btn-sm btn-secondary" style="padding:1px 5px; font-size:0.7rem; border-radius:4px;" onclick="copyTextToClipboard('${escapeHTML(item.sn)}', 'S/N')" title="คัดลอก S/N"><i class="fa-solid fa-copy"></i></button>
                </div>
                ${item._pending ? ' <span class="badge-action delete" style="font-size:0.68rem;"><i class="fa-solid fa-clock"></i> รอบันทึก DB</span>' : ''}
            </td>
            <td style="vertical-align:middle;">
                <div style="display:flex; flex-direction:column; align-items:flex-start;">
                    <span class="badge-location mono" style="display:inline-flex; align-items:center; gap:4px; padding:3px 9px; border-radius:6px; font-size:0.78rem; font-weight:700; background:linear-gradient(135deg, rgba(37,99,235,0.08) 0%, rgba(59,130,246,0.12) 100%); border:1px solid rgba(37,99,235,0.2); color:var(--primary, #2563eb);">
                        <i class="fa-solid fa-location-dot" style="color:#2563eb;"></i> ${escapeHTML(formatLoc)}
                    </span>
                </div>
            </td>
            <td style="text-align:center; font-weight:700; vertical-align:middle;" class="mono">${item.qty ?? 1}</td>
            <td style="font-size:0.78rem; color:var(--text-muted); vertical-align:middle;">${item.created_at ? new Date(item.created_at).toLocaleString('th-TH') : '-'}</td>
            <td style="text-align:center; vertical-align:middle;">
                <button class="btn btn-sm btn-primary" onclick="openPrintBarcodeModal('SINGLE', '${escapeHTML(item.sn)}')"><i class="fa-solid fa-barcode"></i> พิมพ์</button>
            </td>
            <td style="text-align:center; vertical-align:middle;">
                <button class="btn btn-sm btn-secondary" onclick="openEditItemModal('${escapeHTML(String(item.id))}', '${escapeHTML(item.sn)}')"><i class="fa-solid fa-pen-to-square" style="color:var(--primary);"></i> แก้ไข</button>
            </td>
            <td style="text-align:center; vertical-align:middle;">
                <button class="btn btn-sm btn-secondary" onclick="requestRelocateModal('${escapeHTML(String(item.id))}', '${escapeHTML(item.sn)}', '${escapeHTML(item.name)}', '${escapeHTML(item.location)}')"><i class="fa-solid fa-right-left"></i> ย้าย</button>
            </td>
            <td style="text-align:center; vertical-align:middle;">
                <button class="btn btn-sm btn-danger" onclick="requestDeleteModal('SINGLE', '${escapeHTML(item.sn)}', '${escapeHTML(String(item.id))}')"><i class="fa-solid fa-trash"></i> ลบ</button>
            </td>
        `;
        frag.appendChild(tr);
    });

    tbody.appendChild(frag);

    const selectAllCb = document.getElementById('modalSelectAllCb');
    if (selectAllCb) selectAllCb.checked = allChecked;

    const footerBadge = document.getElementById('stockDetailModalFooterBadge');
    if (footerBadge) {
        footerBadge.textContent = `แสดงผล ${items.length} ซีเรียล | เลือกแล้ว ${selectedItemSnSet.size} รายการ`;
    }
}

// 🟢 กรองซีเรียลใน Modal ตามคำค้นหา และคัดกรองเฉพาะ "แถวและล็อก" (Aisle & Bay)
function filterStockDetailModalItems() {
    if (!currentDetailModalGroupKey) return;
    const grp = currentInventoryGroups.find(g => g.groupKey === currentDetailModalGroupKey);
    if (!grp) return;

    const query = (document.getElementById('stockDetailModalSearch')?.value || '').trim().toLowerCase();
    const selectedAisleBay = (document.getElementById('stockDetailModalLocationFilter')?.value || 'ALL').toUpperCase();
    const badge = document.getElementById('stockDetailFilterCountBadge');

    const filtered = grp.items.filter(item => {
        const matchText = !query || 
            (item.sn && item.sn.toLowerCase().includes(query)) ||
            (item.location && item.location.toLowerCase().includes(query)) ||
            (item.meter && String(item.meter).toLowerCase().includes(query));

        let matchAisleBay = true;
        if (selectedAisleBay !== 'ALL') {
            const itemAisleBay = extractAisleBayKey(item.location);
            matchAisleBay = (itemAisleBay === selectedAisleBay);
        }

        return matchText && matchAisleBay;
    });

    if (badge) {
        if (query || selectedAisleBay !== 'ALL') {
            badge.textContent = `พบ ${filtered.length} / ${grp.items.length} รายการ`;
            badge.style.display = 'inline-block';
        } else {
            badge.style.display = 'none';
        }
    }

    renderStockDetailModalBody(filtered);
}

function closeStockDetailModal() {
    const modal = document.getElementById('stockDetailModal');
    if (modal) modal.style.display = 'none';
    currentDetailModalGroupKey = null;
    renderInventoryTable(currentFilteredItems);
}

function toggleModalSelectAllItems(checked) {
    if (!currentDetailModalGroupKey) return;
    const grp = currentInventoryGroups.find(g => g.groupKey === currentDetailModalGroupKey);
    if (!grp) return;

    grp.items.forEach(item => {
        if (checked) selectedItemSnSet.add(item.sn);
        else selectedItemSnSet.delete(item.sn);
    });

    renderStockDetailModalBody(grp.items);
    updateSelectedCountUI();
}

// 🟢 สลับไปที่หน้าพิมพ์บาร์โค้ดทันทีเมื่อกดเลือกซีเรียลแล้วกดพิมพ์ โดยไม่ต้องคอยกดปิด Modal สินค้า
function printSelectedBarcodesFromModal() {
    if (selectedItemSnSet.size === 0) {
        if (typeof showToast === 'function') {
            showToast("⚠️ กรุณาเลือกรายการซีเรียลอย่างน้อย 1 รายการเพื่อพิมพ์บาร์โค้ด", true);
        } else {
            alert("⚠️ กรุณาเลือกรายการซีเรียลอย่างน้อย 1 รายการเพื่อพิมพ์บาร์โค้ด");
        }
        return;
    }
    
    // 🟢 ปิด Modal ซีเรียลทันที และเปิดหน้าต่างเลือกรูปแบบสติ๊กเกอร์บาร์โค้ดทันที
    closeStockDetailModal();
    setTimeout(() => {
        if (typeof openPrintBarcodeModal === 'function') {
            openPrintBarcodeModal('MULTI');
        }
    }, 100);
}

function relocateSelectedFromModal() {
    if (selectedItemSnSet.size === 0) {
        alert("⚠️ กรุณาเลือกรายการซีเรียลอย่างน้อย 1 รายการเพื่อย้ายพิกัด");
        return;
    }
    closeStockDetailModal();
    setTimeout(() => {
        if (typeof requestBatchRelocateModal === 'function') requestBatchRelocateModal();
    }, 100);
}

function deleteSelectedFromModal() {
    if (selectedItemSnSet.size === 0) {
        alert("⚠️ กรุณาเลือกรายการซีเรียลอย่างน้อย 1 รายการเพื่อลบ");
        return;
    }
    if (typeof requestDeleteModal === 'function') requestDeleteModal('BATCH');
}

function refreshStockDetailModalIfActive() {
    if (!currentDetailModalGroupKey) return;
    const modal = document.getElementById('stockDetailModal');
    if (!modal || modal.style.display === 'none') return;

    currentInventoryGroups = buildInventoryGroups(currentFilteredItems);
    const grp = currentInventoryGroups.find(g => g.groupKey === currentDetailModalGroupKey);
    if (grp) {
        renderStockDetailModalBody(grp.items);
    } else {
        closeStockDetailModal();
    }
}

function updateKPIs() {
    const kpiTotal = document.getElementById('kpiTotalItems');
    if (kpiTotal) kpiTotal.textContent = globalInventoryData.length.toLocaleString();

    const uniqueInventorySkus = new Set(globalInventoryData.map(i => i.category)).size;
    const totalMasterSkus = globalMasterProducts.length;

    const kpiModelElem = document.getElementById('kpiTotalModels');
    if (kpiModelElem) {
        if (totalMasterSkus > 0) {
            kpiModelElem.textContent = `${uniqueInventorySkus.toLocaleString()} / ${totalMasterSkus.toLocaleString()}`;
        } else {
            kpiModelElem.textContent = uniqueInventorySkus.toLocaleString();
        }
    }

    const dockItems = globalInventoryData.filter(i => (i.location || '').toUpperCase() === 'DOCK').length;
    const kpiDock = document.getElementById('kpiDockItems');
    if (kpiDock) kpiDock.textContent = dockItems.toLocaleString();
}

function toggleSelectAllVisibleItems(checked) {
    if (inventoryViewMode === 'grouped') {
        currentInventoryGroups.forEach(grp => {
            grp.items.forEach(item => {
                if (checked) selectedItemSnSet.add(item.sn);
                else selectedItemSnSet.delete(item.sn);
            });
        });
        document.querySelectorAll('.group-checkbox').forEach(cb => cb.checked = checked);
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

function updateSelectedCountUI() {
    const count = selectedItemSnSet.size;
    const selCount = document.getElementById('selectedCountSpan');
    const selRelocateCount = document.getElementById('selectedRelocateCountSpan');
    
    if (selCount) selCount.textContent = count;
    if (selRelocateCount) selRelocateCount.textContent = count;

    const footerBadge = document.getElementById('stockDetailModalFooterBadge');
    if (footerBadge && currentDetailModalGroupKey) {
        const grp = currentInventoryGroups.find(g => g.groupKey === currentDetailModalGroupKey);
        const totalInGroup = grp ? grp.items.length : 0;
        footerBadge.textContent = `แสดงผล ${totalInGroup} ซีเรียล | เลือกแล้ว ${count} รายการ`;
    }
}

// Global Exports
window.copyTextToClipboard = copyTextToClipboard;
window.toggleStockViewMode = toggleStockViewMode;
window.toggleGroupSelection = toggleGroupSelection;
window.openStockDetailModal = openStockDetailModal;
window.closeStockDetailModal = closeStockDetailModal;
window.filterStockDetailModalItems = filterStockDetailModalItems;
window.toggleModalSelectAllItems = toggleModalSelectAllItems;
window.printSelectedBarcodesFromModal = printSelectedBarcodesFromModal;
window.relocateSelectedFromModal = relocateSelectedFromModal;
window.deleteSelectedFromModal = deleteSelectedFromModal;