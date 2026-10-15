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
}

function renderInventoryTable(items) {
    const tbody = document.getElementById('inventoryTableBody');
    if (!tbody) return;
    tbody.innerHTML = '';

    const totalBadge = document.getElementById('totalCountBadge');
    if (totalBadge) {
        totalBadge.textContent = `ดึงข้อมูลแล้ว ${items.length.toLocaleString()} / ${globalInventoryData.length.toLocaleString()} รายการ`;
    }

    if(items.length === 0) {
        tbody.innerHTML = `<tr><td colspan="13" style="text-align:center; padding:24px; color:var(--text-muted);">ไม่พบข้อมูลสินค้าตรงตามเงื่อนไขค้นหา</td></tr>`;
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
            <td style="text-align:center;"><input type="checkbox" class="item-checkbox" data-sn="${escapeHTML(item.sn)}" ${isChecked ? 'checked' : ''} onchange="toggleItemSelection('${escapeHTML(item.sn)}', this.checked)"></td>
            <td style="text-align:center; font-weight:700;" class="mono">${index + 1}</td>
            <td><code class="mono font-bold" style="color:var(--primary-text);">${escapeHTML(item.category || 'N/A')}</code></td>
            <td><div class="text-multiline-truncate" title="${escapeHTML(item.name || '-')}">${escapeHTML(item.name || '-')}</div></td>
            <td><span class="mono font-bold" style="color:var(--warning); font-size:0.92rem;"><i class="fa-solid fa-gauge"></i> ${Number(meterValue).toLocaleString()}</span></td>
            <td><code class="mono font-bold">${escapeHTML(item.sn)}</code>${item._pending ? ' <span class="badge-action delete" style="font-size:0.68rem;"><i class="fa-solid fa-clock"></i> รอบันทึก DB</span>' : ''}</td>
            <td><span class="badge-location mono"><i class="fa-solid fa-location-dot"></i> ${escapeHTML(formatLoc)}</span></td>
            <td style="text-align:center; font-weight:700;" class="mono">${item.qty ?? 1}</td>
            <td style="font-size:0.78rem; color:var(--text-muted);">${item.created_at ? new Date(item.created_at).toLocaleString('th-TH') : '-'}</td>
            <td style="text-align:center;">
                <button class="btn btn-sm btn-primary" onclick="openPrintBarcodeModal('SINGLE', '${escapeHTML(item.sn)}')"><i class="fa-solid fa-barcode"></i> พิมพ์</button>
            </td>
            <td style="text-align:center;">
                <button class="btn btn-sm btn-secondary" onclick="openEditItemModal('${escapeHTML(String(item.id))}', '${escapeHTML(item.sn)}')"><i class="fa-solid fa-pen-to-square" style="color:var(--primary);"></i> แก้ไข</button>
            </td>
            <td style="text-align:center;">
                <button class="btn btn-sm btn-secondary" onclick="requestRelocateModal('${escapeHTML(String(item.id))}', '${escapeHTML(item.sn)}', '${escapeHTML(item.name)}', '${escapeHTML(item.location)}')"><i class="fa-solid fa-right-left"></i> ย้าย</button>
            </td>
            <td style="text-align:center;">
                <button class="btn btn-sm btn-danger" onclick="requestDeleteModal('SINGLE', '${escapeHTML(item.sn)}', '${escapeHTML(String(item.id))}')"><i class="fa-solid fa-trash"></i> ลบ</button>
            </td>
        `;
        frag.appendChild(tr);
    });

    tbody.appendChild(frag);
    const selectAllCb = document.getElementById('selectAllCheckbox');
    if (selectAllCb) selectAllCb.checked = allVisibleChecked;
    updateSelectedCountUI();
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
    currentFilteredItems.forEach(item => {
        if (checked) selectedItemSnSet.add(item.sn);
        else selectedItemSnSet.delete(item.sn);
    });

    document.querySelectorAll('.item-checkbox').forEach(cb => cb.checked = checked);
    updateSelectedCountUI();
}

function toggleItemSelection(sn, checked) {
    if(checked) selectedItemSnSet.add(sn);
    else selectedItemSnSet.delete(sn);
    updateSelectedCountUI();
}

function updateSelectedCountUI() {
    const count = selectedItemSnSet.size;
    const selCount = document.getElementById('selectedCountSpan');
    const selRelocateCount = document.getElementById('selectedRelocateCountSpan');
    
    if (selCount) selCount.textContent = count;
    if (selRelocateCount) selRelocateCount.textContent = count;
}