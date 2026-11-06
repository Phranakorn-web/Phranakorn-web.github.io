// =========================================================================
// --- MODULE 4: OUTBOUND ORDERS ENGINE & OFFICIAL DELIVERY NOTE GENERATOR ---
// --- (HIGH-SECURITY & HIGH-CAPACITY SERIAL NUMBER PRINT LAYOUT) -----------
// =========================================================================

// 🟢 Safe Escape HTML Helper (Secures against XSS & HTML Injection vulnerabilities)
if (typeof escapeHTML !== 'function') {
    function escapeHTML(str) {
        if (str === null || str === undefined) return '';
        return String(str)
            .replace(/&/g, '&amp;')
            .replace(/</g, '&lt;')
            .replace(/>/g, '&gt;')
            .replace(/"/g, '&quot;')
            .replace(/'/g, '&#039;')
            .replace(/\//g, '&#x2F;');
    }
}

// 🟢 Secure Dynamic Supabase Instance Getter
function getSupabaseClient() {
    if (typeof _supabase !== 'undefined' && _supabase) return _supabase;
    if (typeof window !== 'undefined' && window.ENV && window.ENV.SUPABASE_CLIENT) return window.ENV.SUPABASE_CLIENT;
    return null;
}

// Local Storage Cache Key สำหรับประวัติใบสั่งจ่าย/ใบส่งสินค้า
const LOCAL_OUTBOUND_CACHE_KEY = 'wh_outbound_orders_history_cache';

let recentOutboundOrders = [];
let outboundCartItems = [];
let showOutboundLocationInDoc = true; // สลับเปิด/ปิดการแสดงพิกัดจัดเก็บเดิม

// 🟢 Toggle Visibility for Original Location Code
function toggleOutboundLocationVisibility() {
    showOutboundLocationInDoc = !showOutboundLocationInDoc;
    const btnText = document.getElementById('outboundLocVisText');
    const btnIcon = document.getElementById('outboundLocVisIcon');
    
    if (btnText) btnText.textContent = `แสดงพิกัดเดิม: ${showOutboundLocationInDoc ? 'เปิด' : 'ซ่อน'}`;
    if (btnIcon) btnIcon.className = showOutboundLocationInDoc ? 'fa-solid fa-eye' : 'fa-solid fa-eye-slash';

    const cols = document.querySelectorAll('.outbound-loc-col');
    cols.forEach(col => col.style.display = showOutboundLocationInDoc ? '' : 'none');

    if (typeof showToast === 'function') {
        showToast(`📌 สลับการแสดงพิกัดจัดเก็บเดิม: ${showOutboundLocationInDoc ? 'แสดงผล' : 'ซ่อนในใบงาน'}`);
    }
}

// 🟢 Local Storage History Cache Handlers
function saveOutboundHistoryToLocalCache(orders) {
    try {
        if (Array.isArray(orders)) {
            localStorage.setItem(LOCAL_OUTBOUND_CACHE_KEY, JSON.stringify(orders.slice(0, 500)));
        }
    } catch (e) {
        console.warn("Could not save outbound history to LocalStorage:", e);
    }
}

function getOutboundHistoryFromLocalCache() {
    try {
        const cached = localStorage.getItem(LOCAL_OUTBOUND_CACHE_KEY);
        return cached ? JSON.parse(cached) : [];
    } catch (e) {
        return [];
    }
}

// 🟢 Add Item to Cart Engine
function handleAddOutboundToCart(e) {
    if (e) e.preventDefault();
    const snInput = document.getElementById('outboundSn');
    if (!snInput) return;

    const sn = snInput.value.trim();
    if(!sn) return;

    const inventory = (typeof globalInventoryData !== 'undefined' && Array.isArray(globalInventoryData)) ? globalInventoryData : [];
    const lowerSn = sn.toLowerCase();
    
    const item = inventory.find(i => i && i.sn && String(i.sn).toLowerCase() === lowerSn);
    if(!item) {
        if (typeof playErrorSound === 'function') playErrorSound();
        if (typeof showToast === 'function') showToast(`❌ ไม่พบ S/N "${escapeHTML(sn)}" ในระบบสต็อก!`, true);
        snInput.select();
        return;
    }

    if(outboundCartItems.some(i => i && i.sn && String(i.sn).toLowerCase() === lowerSn)) {
        if (typeof playErrorSound === 'function') playErrorSound();
        if (typeof showToast === 'function') showToast(`⚠ S/N "${escapeHTML(sn)}" มีอยู่ในรายการส่งสินค้าแล้ว`, true);
        snInput.select();
        return;
    }

    outboundCartItems.push(item);
    snInput.value = '';
    snInput.focus();

    if (typeof playSuccessSound === 'function') playSuccessSound();
    renderOutboundCartTable();
}

// 🟢 Render Outbound Cart Table with SKU Model Grouping
function renderOutboundCartTable() {
    const tbody = document.getElementById('outboundCartTableBody');
    if (!tbody) return;

    const cartBadge = document.getElementById('outboundCartCountBadge');
    if (cartBadge) cartBadge.textContent = `${outboundCartItems.length} รายการ`;

    if(outboundCartItems.length === 0) {
        tbody.innerHTML = `<tr><td colspan="7" style="text-align:center; padding:15px; color:var(--text-muted);">ยังไม่มีรายการ ยิงสแกน S/N เพื่อเพิ่มเข้าใบส่งสินค้า</td></tr>`;
        return;
    }

    const groupedMap = groupCartItemsBySKU(outboundCartItems);
    let html = '';
    let groupIndex = 1;
    let globalItemIndex = 1;

    groupedMap.forEach((group) => {
        html += `
            <tr style="background:var(--bg-subtle); border-top:2px solid var(--border-strong);">
                <td colspan="7" style="padding:6px 10px; font-weight:700; color:var(--primary); font-size:0.85rem;">
                    <i class="fa-solid fa-layer-group" style="margin-right:6px;"></i> ${groupIndex}. รุ่น: ${escapeHTML(group.name)} (รหัส: ${escapeHTML(group.sku)}) — <span style="color:var(--success);">${group.items.length} เครื่อง</span>
                </td>
            </tr>
        `;

        group.items.forEach(item => {
            const formattedLoc = (typeof formatLocationCode === 'function') ? formatLocationCode(item.location) : item.location;
            const locDisp = showOutboundLocationInDoc ? '' : 'style="display:none;"';

            html += `
                <tr>
                    <td style="text-align:center;" class="mono">${globalItemIndex}</td>
                    <td><code class="mono font-bold">${escapeHTML(item.category || 'N/A')}</code></td>
                    <td>${escapeHTML(item.name || '-')}</td>
                    <td><code class="mono font-bold" style="color:var(--primary);">${escapeHTML(item.sn)}</code></td>
                    <td class="mono font-bold" style="color:var(--warning);">${Number(item.meter || 0).toLocaleString()}</td>
                    <td class="outbound-loc-col" ${locDisp}><span class="badge-location mono">${escapeHTML(formattedLoc)}</span></td>
                    <td style="text-align:center;">
                        <button class="btn btn-sm btn-danger" style="padding:2px 6px;" onclick="removeFromOutboundCart('${escapeHTML(item.sn)}')">&times;</button>
                    </td>
                </tr>
            `;
            globalItemIndex++;
        });
        groupIndex++;
    });

    tbody.innerHTML = html;
}

function removeFromOutboundCart(sn) {
    outboundCartItems = outboundCartItems.filter(i => String(i.sn) !== String(sn));
    renderOutboundCartTable();
}

// Helper: Grouping Logic Processor
function groupCartItemsBySKU(itemsList) {
    const map = new Map();
    if (!Array.isArray(itemsList)) return map;

    itemsList.forEach(item => {
        if (!item) return;
        const key = `${item.category || 'N/A'} - ${item.name || 'ไม่ระบุรุ่น'}`;
        if (!map.has(key)) {
            map.set(key, {
                sku: item.category || 'N/A',
                name: item.name || 'ไม่ระบุรุ่น',
                items: []
            });
        }
        map.get(key).items.push(item);
    });
    return map;
}

// 🟢 Request Approval or Direct Outbound Execution (ใบส่งสินค้า / ใบย้ายคลัง)
async function requestOutboundApproval() {
    if (typeof requireOnline === 'function' && !requireOnline('ตัดจ่าย/ส่งคำขอต้องเชื่อมต่ออินเทอร์เน็ต')) return;
    if(outboundCartItems.length === 0) {
        alert("⚠ กรุณายิงสแกน S/N สินค้าอย่างน้อย 1 รายการเพื่อออกใบส่งสินค้า");
        return;
    }

    const companyTitle = document.getElementById('outboundCompanyTitle')?.value.trim() || '';
    const customerName = document.getElementById('outboundCustomerName')?.value.trim() || '';
    const customerAddress = document.getElementById('outboundCustomerAddress')?.value.trim() || '';
    const contactPerson = document.getElementById('outboundContactPerson')?.value.trim() || '';
    const salesperson = document.getElementById('outboundSalesperson')?.value.trim() || '';
    const dest = document.getElementById('outboundDestination')?.value.trim() || '';
    const dispatcher = document.getElementById('outboundDispatcher')?.value.trim() || '';
    const receiver = document.getElementById('outboundReceiver')?.value.trim() || '';

    const snList = outboundCartItems.map(i => String(i.sn));
    const docNo = `DO${Math.floor(1000000 + Math.random() * 9000000)}`;

    const orderMeta = {
        company_title: companyTitle,
        doc_no: docNo,
        inv_no: docNo, // เพื่อความข้ามรุ่นฐานข้อมูล
        customer_name: customerName,
        customer_address: customerAddress,
        contact_person: contactPerson,
        salesperson: salesperson,
        destination: dest,
        dispatcher: dispatcher,
        receiver: receiver,
        sn_list: snList,
        items_count: outboundCartItems.length,
        items_detail: [...outboundCartItems],
        show_location: showOutboundLocationInDoc,
        created_at: new Date().toISOString()
    };

    if (typeof currentUser !== 'undefined' && currentUser && currentUser.role === 'user') {
        if (typeof createPendingApprovalRequest === 'function') {
            const success = await createPendingApprovalRequest(
                'OUTBOUND', 
                `[ใบส่งสินค้า ${docNo}] เบิก/ย้ายสินค้า: ${customerName || 'ไม่ระบุผู้รับ'} (${snList.length} รายการ)`, 
                snList, 
                orderMeta
            );
            if (success) {
                if (typeof showToast === 'function') showToast(`🚀 ส่งคำขอออกใบส่งสินค้าไปยังแอดมินเรียบร้อยแล้ว`);
                outboundCartItems = [];
                renderOutboundCartTable();
            }
        }
        return;
    }

    await processFinalOutboundWorkOrder(orderMeta);
}

async function processFinalOutboundWorkOrder(orderMeta) {
    if (typeof requireOnline === 'function' && !requireOnline('ตัดจ่ายสินค้าต้องออนไลน์')) return;

    if (typeof globalInventoryData !== 'undefined' && Array.isArray(globalInventoryData)) {
        globalInventoryData = globalInventoryData.filter(i => !orderMeta.sn_list.includes(String(i.sn)));
    }
    if (typeof rebuildOccupiedSet === 'function') rebuildOccupiedSet();

    recentOutboundOrders.unshift(orderMeta);
    saveOutboundHistoryToLocalCache(recentOutboundOrders);

    const container = document.getElementById('liveOutboundFeedContainer');
    if (container) renderOutboundHistoryFeed(container, recentOutboundOrders);

    const docNo = orderMeta.doc_no || orderMeta.inv_no || 'DO000000';

    if (typeof playSuccessSound === 'function') playSuccessSound();
    if (typeof showToast === 'function') showToast(`📦 ออกใบส่งสินค้าเรียบร้อย ${orderMeta.items_count} รายการ [เลขที่: ${docNo}]`);

    if (typeof logUserActivity === 'function') {
        logUserActivity('OUTBOUND', `ออกใบส่งสินค้า ${docNo} จำนวน ${orderMeta.items_count} รายการ`).catch(() => {});
    }

    // ซิงค์ฐานข้อมูล Supabase ในเบื้องหลัง (Non-blocking Sync)
    if (navigator.onLine) {
        (async () => {
            try {
                const client = getSupabaseClient();
                if (client) {
                    await client.from('warehouse_items').delete().in('sn', orderMeta.sn_list);

                    const dbPayload = {
                        work_order_no: docNo,
                        inv_no: docNo,
                        destination: orderMeta.destination,
                        dispatcher: orderMeta.dispatcher,
                        receiver: orderMeta.receiver,
                        sn_list: orderMeta.sn_list,
                        items_count: orderMeta.items_count,
                        items_detail: JSON.stringify(orderMeta.items_detail),
                        company_title: orderMeta.company_title,
                        customer_name: orderMeta.customer_name,
                        customer_address: orderMeta.customer_address,
                        contact_person: orderMeta.contact_person,
                        created_at: orderMeta.created_at
                    };

                    await client.from('outbound_orders').insert([dbPayload]);
                }
            } catch (e) {
                console.warn("Outbound DB background sync exception:", e);
            }
        })();
    }

    outboundCartItems = [];
    renderOutboundCartTable();
    if (typeof filterInventoryData === 'function') filterInventoryData();
    if (typeof updateKPIs === 'function') updateKPIs();
    if (typeof refreshLocationVisualizerIfActive === 'function') refreshLocationVisualizerIfActive();
}

async function loadOutboundHistoryFromDB() {
    const container = document.getElementById('liveOutboundFeedContainer');
    if (!container) return;

    const localCachedData = getOutboundHistoryFromLocalCache();
    let combinedData = [...localCachedData];

    if (localCachedData.length > 0) {
        recentOutboundOrders = combinedData;
        renderOutboundHistoryFeed(container, combinedData);
    }

    if (navigator.onLine) {
        try {
            const client = getSupabaseClient();
            if (client) {
                const { data, error } = await client
                    .from('outbound_orders')
                    .select('*')
                    .order('created_at', { ascending: false })
                    .limit(100);

                if(!error && Array.isArray(data) && data.length > 0) {
                    const existingKeys = new Set(localCachedData.map(o => o.doc_no || o.inv_no || o.work_order_no || o.created_at));
                    data.forEach(dbOrder => {
                        const key = dbOrder.doc_no || dbOrder.inv_no || dbOrder.work_order_no || dbOrder.created_at;
                        if (!existingKeys.has(key)) {
                            combinedData.push(dbOrder);
                        }
                    });

                    combinedData.sort((a, b) => new Date(b.created_at || 0) - new Date(a.created_at || 0));
                    recentOutboundOrders = combinedData;
                    saveOutboundHistoryToLocalCache(combinedData);
                    renderOutboundHistoryFeed(container, combinedData);
                }
            }
        } catch(e) {
            console.warn("Fetch outbound history exception:", e);
        }
    }

    if (combinedData.length === 0) {
        container.innerHTML = `<div style="text-align:center; padding:20px; color:var(--text-muted); font-size:0.85rem;">ยังไม่มีประวัติใบส่งสินค้า</div>`;
    }
}

// 🟢 Clean Minimal Feed UI Renderer (ปรับแต่ง UX/UI ประวัติ 2 บรรทัด สวยงาม สบายตา ไม่แออัด)
function renderOutboundHistoryFeed(container, data) {
    if (!container || !Array.isArray(data)) return;
    
    if (data.length === 0) {
        container.innerHTML = `<div style="text-align:center; padding:30px; color:var(--text-muted); font-size:0.85rem;">ยังไม่มีประวัติใบส่งสินค้า</div>`;
        return;
    }

    let html = '';
    data.forEach((order, idx) => {
        const orderId = order.doc_no || order.inv_no || order.work_order_no || order.id || `DO-LOCAL-${idx}`;
        const docNo = order.doc_no || order.inv_no || order.work_order_no || `DO0379${100 + idx}`;
        const customerName = order.customer_name || order.destination || 'ลูกค้าทั่วไป / คลังปลายทาง';
        const companyTitle = order.company_title || 'คลังหลัก';
        const totalCount = order.items_count || (order.sn_list ? order.sn_list.length : 0);
        const dateStr = order.created_at ? new Date(order.created_at).toLocaleDateString('th-TH') : '-';

        html += `
            <div class="feed-item outbound-card-ui" style="position:relative; padding:12px 14px; margin-bottom:10px; border-radius:10px; background:var(--bg-surface); border:1px solid var(--border-color); box-shadow:0 2px 6px rgba(0,0,0,0.03);">
                <!-- บรรทัดที่ 1: เลขที่ใบส่งสินค้า + จำนวนรายการ + ปุ่มควบคุม -->
                <div style="display:flex; justify-content:space-between; align-items:center; margin-bottom:6px;">
                    <div style="display:flex; align-items:center; gap:8px;">
                        <span style="font-weight:800; color:var(--primary); font-family:var(--font-mono); font-size:0.92rem;"><i class="fa-solid fa-truck-ramp-box" style="margin-right:4px;"></i>${escapeHTML(docNo)}</span>
                        <span class="badge-action outbound" style="font-size:0.75rem; padding:2px 8px;">${totalCount} เครื่อง</span>
                    </div>
                    <div style="display:flex; align-items:center; gap:6px;">
                        <button class="btn btn-sm btn-primary" style="font-size:0.78rem; padding:4px 10px; font-weight:600;" onclick="viewOutboundWorkOrder('${escapeHTML(String(orderId))}')">
                            <i class="fa-solid fa-print"></i> ใบส่งสินค้า PDF
                        </button>
                        <button class="btn btn-sm btn-danger" style="font-size:0.78rem; padding:4px 8px;" title="ลบประวัติส่งสินค้านี้" onclick="deleteOutboundOrderHistory('${escapeHTML(String(orderId))}')">
                            <i class="fa-solid fa-trash-can"></i>
                        </button>
                    </div>
                </div>

                <!-- บรรทัดที่ 2: ชื่อผู้รับ / คลังสินค้าปลายทาง (เน้นตัวหนา เห็นชัดเจน) -->
                <div style="font-size:0.88rem; color:var(--text-main); font-weight:700; word-break:break-word; margin-bottom:6px; line-height:1.4;">
                    <i class="fa-solid fa-building" style="color:var(--primary); margin-right:4px;"></i> ${escapeHTML(customerName)}
                </div>

                <!-- บรรทัดที่ 3: แถบข้อมูลย่อย คลังต้นทาง / ผู้จ่าย / วันที่ -->
                <div style="font-size:0.76rem; color:var(--text-muted); display:flex; justify-content:space-between; align-items:center; border-top:1px dashed var(--border-color); padding-top:6px; flex-wrap:wrap; gap:4px;">
                    <span><i class="fa-solid fa-warehouse"></i> ต้นทาง: <strong>${escapeHTML(companyTitle)}</strong></span>
                    <span><i class="fa-solid fa-user-gear"></i> ผู้จ่าย: <strong>${escapeHTML(order.dispatcher || '-')}</strong></span>
                    <span><i class="fa-regular fa-clock"></i> ${dateStr}</span>
                </div>
            </div>
        `;
    });
    container.innerHTML = html;
}

// 🟢 ฟังก์ชันลบประวัติการสั่งจ่าย/ส่งสินค้าออกจากระบบ
async function deleteOutboundOrderHistory(orderId) {
    if (!confirm(`คุณต้องการลบประวัติการส่งสินค้า [${orderId}] นี้ออกจากรายการใช่หรือไม่?`)) return;

    recentOutboundOrders = recentOutboundOrders.filter(o => 
        String(o.doc_no) !== String(orderId) && 
        String(o.inv_no) !== String(orderId) && 
        String(o.work_order_no) !== String(orderId) && 
        String(o.id) !== String(orderId)
    );

    saveOutboundHistoryToLocalCache(recentOutboundOrders);

    const container = document.getElementById('liveOutboundFeedContainer');
    if (container) renderOutboundHistoryFeed(container, recentOutboundOrders);

    if (navigator.onLine) {
        try {
            const client = getSupabaseClient();
            if (client) {
                await client.from('outbound_orders')
                    .delete()
                    .or(`work_order_no.eq.${orderId},inv_no.eq.${orderId},doc_no.eq.${orderId}`);
            }
        } catch (e) {
            console.warn("Outbound DB history deletion error:", e);
        }
    }

    if (typeof showToast === 'function') showToast(`🗑️ ลบประวัติการส่งสินค้า [${orderId}] เรียบร้อยแล้ว`);
}

// 🟢 HIGH-CAPACITY COMPACT DELIVERY NOTE GENERATOR (ใบส่งสินค้าความจุสูง รองรับ S/N จำนวนมาก)
function viewOutboundWorkOrder(orderId) {
    const order = recentOutboundOrders.find(o => 
        String(o.doc_no) === String(orderId) || 
        String(o.inv_no) === String(orderId) || 
        String(o.work_order_no) === String(orderId) || 
        String(o.id) === String(orderId)
    );

    if (!order) {
        if (typeof showToast === 'function') showToast('❌ ไม่พบรายละเอียดใบส่งสินค้า', true);
        return;
    }

    const companyTitle = order.company_title || 'คลังสินค้า WMS System';
    const docNo = order.doc_no || order.inv_no || order.work_order_no || 'DO000000';
    const dateStr = order.created_at ? new Date(order.created_at).toLocaleDateString('th-TH', { year: 'numeric', month: 'long', day: 'numeric' }) : new Date().toLocaleDateString('th-TH', { year: 'numeric', month: 'long', day: 'numeric' });
    
    const customerName = order.customer_name || '-';
    const customerAddress = order.customer_address || '-';
    const contactPerson = order.contact_person || '-';
    const salesperson = order.salesperson || '-';
    const dispatcher = order.dispatcher || '-';
    const receiver = order.receiver || '-';
    const noteText = order.destination || 'ส่งมอบสินค้า / ย้ายคลัง';
    const showLoc = order.show_location !== undefined ? order.show_location : showOutboundLocationInDoc;

    let items = [];
    if (Array.isArray(order.items_detail)) {
        items = order.items_detail;
    } else if (typeof order.items_detail === 'string') {
        try { items = JSON.parse(order.items_detail); } catch(e) { items = []; }
    }

    // 🟢 จัดกลุ่มสินค้าตามรุ่น SKU และรวม Serial Numbers
    const groupedDocMap = groupCartItemsBySKU(items.length > 0 ? items : (order.sn_list || []).map(sn => ({ category: 'N/A', name: 'สินค้าคลัง', sn: String(sn) })));

    let detailTableRows = '';
    let rowNumber = 1;

    groupedDocMap.forEach((group) => {
        const snArray = group.items.map(i => String(i.sn)).filter(Boolean);
        const snFormatted = snArray.join(', ');
        const sampleItem = group.items[0] || {};
        const meterVal = sampleItem.meter ? Number(sampleItem.meter).toLocaleString() : '-';
        
        let locString = '';
        if (showLoc) {
            const locSet = [...new Set(group.items.map(i => i.location).filter(Boolean))];
            locString = locSet.length > 0 ? locSet.map(l => (typeof formatLocationCode === 'function') ? formatLocationCode(l) : l).join(', ') : '-';
        }

        detailTableRows += `
            <tr style="border-bottom:1px solid #cbd5e1;">
                <td style="text-align:center; padding:6px 4px; font-weight:bold; vertical-align:top; font-size:0.8rem;">${rowNumber}</td>
                <td style="padding:6px 6px; font-family:'JetBrains Mono', 'Courier New', monospace; font-weight:bold; color:#0f172a; vertical-align:top; font-size:0.8rem;">${escapeHTML(group.sku)}</td>
                <td style="padding:6px 6px; vertical-align:top;">
                    <div style="font-weight:700; color:#1e293b; margin-bottom:3px; font-size:0.84rem;">${escapeHTML(group.name)}</div>
                    <div style="font-family:'JetBrains Mono', 'Courier New', monospace; font-size:0.75rem; color:#0284c7; word-break:break-all; line-height:1.35; letter-spacing:-0.2px; background:#f0f9ff; padding:4px 6px; border-radius:4px; border:1px solid #bae6fd;">
                        <strong style="color:#0369a1;">S/N (${snArray.length}):</strong> ${escapeHTML(snFormatted)}
                    </div>
                </td>
                ${showLoc ? `<td style="padding:6px 4px; font-family:'JetBrains Mono', monospace; font-size:0.75rem; text-align:center; vertical-align:top;"><span style="background:#e0f2fe; color:#0369a1; padding:2px 5px; border-radius:4px; font-weight:700;">${escapeHTML(locString)}</span></td>` : ''}
                <td style="text-align:center; padding:6px 4px; font-weight:bold; vertical-align:top; font-size:0.8rem;" class="mono">${meterVal}</td>
                <td style="text-align:center; padding:6px 4px; font-weight:800; font-size:0.88rem; color:#0f172a; white-space:nowrap; vertical-align:top;">${group.items.length} เครื่อง</td>
            </tr>
        `;
        rowNumber++;
    });

    const totalQty = items.length > 0 ? items.length : (order.sn_list ? order.sn_list.length : 0);

    const popupHtml = `
        <div id="workOrderModal" style="position:fixed; top:0; left:0; width:100vw; height:100vh; background:rgba(15, 23, 42, 0.75); display:flex; justify-content:center; align-items:center; z-index:99999; backdrop-filter:blur(4px);">
            <div style="background:#ffffff; color:#0f172a; width:94%; max-width:920px; max-height:95vh; border-radius:12px; padding:22px; overflow-y:auto; box-shadow:0 25px 50px -12px rgba(0, 0, 0, 0.35); font-family:'Prompt', 'Sarabun', 'Segoe UI', sans-serif;">
                
                <!-- สไตล์พิมพ์มาตรฐานสากล A4 ความจุสูงสำหรับพิมพ์ใบส่งสินค้า -->
                <style>
                    @page {
                        size: A4 portrait;
                        margin: 6mm 8mm;
                    }
                    @media print {
                        body * { visibility: hidden !important; }
                        #printableWorkOrderDocument, #printableWorkOrderDocument * { visibility: visible !important; }
                        #printableWorkOrderDocument {
                            position: absolute !important;
                            left: 0 !important;
                            top: 0 !important;
                            width: 100% !important;
                            min-height: 280mm !important;
                            box-sizing: border-box !important;
                            padding: 2mm !important;
                            display: flex !important;
                            flex-direction: column !important;
                            justify-content: space-between !important;
                        }
                        .no-print { display: none !important; }
                    }
                </style>

                <div id="printableWorkOrderDocument" style="display:flex; flex-direction:column; justify-content:space-between; min-height:780px; background:#ffffff; color:#000000;">
                    
                    <div style="flex:1 0 auto;">
                        
                        <!-- โซนบน: หัวเอกสารใบส่งสินค้า (DELIVERY NOTE / TRANSFER NOTE) -->
                        <div style="display:flex; justify-content:space-between; align-items:center; border-bottom:2px solid #0284c7; padding-bottom:8px; margin-bottom:10px;">
                            <div style="display:flex; align-items:center; gap:10px;">
                                <div style="width:40px; height:40px; background:linear-gradient(135deg, #0284c7 0%, #0369a1 100%); color:#ffffff; border-radius:8px; display:flex; align-items:center; justify-content:center; font-size:1.3rem; box-shadow: 0 3px 8px rgba(2, 132, 199, 0.25);">
                                    <i class="fa-solid fa-truck-arrow-right"></i>
                                </div>
                                <div>
                                    <div style="font-size:1.1rem; font-weight:800; color:#0f172a; line-height:1.2;">${escapeHTML(companyTitle)}</div>
                                    <div style="font-size:0.75rem; color:#0284c7; font-weight:600;">ใบส่งสินค้าและบันทึกการย้ายคลัง (DELIVERY / TRANSFER ORDER)</div>
                                </div>
                            </div>
                            <div style="text-align:right;">
                                <div style="display:inline-block; background:#0284c7; color:#ffffff; padding:3px 10px; border-radius:4px; font-size:1.1rem; font-weight:800; letter-spacing:0.8px;">
                                    ใบส่งสินค้า
                                </div>
                                <div style="font-size:0.72rem; color:#64748b; font-weight:600; margin-top:1px;">ORIGINAL DELIVERY NOTE</div>
                            </div>
                        </div>

                        <!-- Header 2 Columns (ฝั่งซ้าย: ผู้รับสินค้า & สถานที่ส่งมอบ | ฝั่งขวา: รายละเอียดเอกสาร) -->
                        <div style="display:grid; grid-template-columns:1.2fr 0.8fr; gap:12px; background:#f8fafc; border:1px solid #e2e8f0; border-radius:6px; padding:10px 12px; margin-bottom:10px; font-size:0.8rem; line-height:1.5;">
                            <div>
                                <div style="font-weight:700; color:#0369a1; font-size:0.82rem; margin-bottom:3px; border-bottom:1px solid #cbd5e1; padding-bottom:2px;">
                                    <i class="fa-solid fa-location-dot" style="margin-right:4px;"></i> ข้อมูลผู้รับ / สถานที่ส่งมอบ (Destination)
                                </div>
                                <div><strong>ผู้รับสินค้า / บริษัท :</strong> <span style="font-weight:700; color:#0f172a;">${escapeHTML(customerName)}</span></div>
                                <div><strong>ที่อยู่จัดส่ง / พิกัดส่งมอบ :</strong> <span>${escapeHTML(customerAddress)}</span></div>
                                <div><strong>ผู้ติดต่อ :</strong> <span style="font-weight:600;">${escapeHTML(contactPerson)}</span></div>
                            </div>
                            <div style="border-left:2px dashed #cbd5e1; padding-left:12px;">
                                <div style="font-weight:700; color:#0369a1; font-size:0.82rem; margin-bottom:3px; border-bottom:1px solid #cbd5e1; padding-bottom:2px;">
                                    <i class="fa-solid fa-file-invoice" style="margin-right:4px;"></i> ข้อมูลเอกสาร (Document Reference)
                                </div>
                                <div><strong>เลขที่ใบส่งสินค้า :</strong> <span style="font-family:'JetBrains Mono', monospace; font-weight:800; color:#0284c7; font-size:0.88rem;">${escapeHTML(docNo)}</span></div>
                                <div><strong>วันที่ทำรายการ :</strong> <span>${escapeHTML(dateStr)}</span></div>
                                <div><strong>พนักงานขาย / ผู้ประสานงาน :</strong> <span>${escapeHTML(salesperson)}</span></div>
                                <div><strong>ผู้จ่ายสินค้าออกคลัง :</strong> <span style="font-weight:600;">${escapeHTML(dispatcher)}</span></div>
                            </div>
                        </div>

                        <!-- Table Layout (เน้นพื้นที่ความจุสูงสุด) -->
                        <table style="width:100%; border-collapse:collapse; font-size:0.8rem; margin-bottom:10px; border:1px solid #0f172a;">
                            <thead>
                                <tr style="background:#0284c7; color:#ffffff; text-align:left;">
                                    <th style="padding:6px 4px; text-align:center; width:35px; border-right:1px solid rgba(255,255,255,0.2); font-size:0.75rem;">#</th>
                                    <th style="padding:6px 6px; width:130px; border-right:1px solid rgba(255,255,255,0.2); font-size:0.75rem;">รหัสสินค้า (SKU)</th>
                                    <th style="padding:6px 6px; border-right:1px solid rgba(255,255,255,0.2); font-size:0.75rem;">รายละเอียดรุ่น & หมายเลขซีเรียล (Serial Numbers)</th>
                                    ${showLoc ? `<th style="padding:6px 4px; text-align:center; width:95px; border-right:1px solid rgba(255,255,255,0.2); font-size:0.75rem;">พิกัดเดิม</th>` : ''}
                                    <th style="padding:6px 4px; text-align:center; width:75px; border-right:1px solid rgba(255,255,255,0.2); font-size:0.75rem;">มิเตอร์</th>
                                    <th style="padding:6px 4px; text-align:center; width:80px; font-size:0.75rem;">จำนวนรวม</th>
                                </tr>
                            </thead>
                            <tbody>
                                ${detailTableRows}
                            </tbody>
                            <tfoot>
                                <tr style="background:#f1f5f9; border-top:2px solid #0f172a; font-weight:bold;">
                                    <td colspan="${showLoc ? '5' : '4'}" style="text-align:right; padding:6px 8px; font-size:0.82rem;">รวมสินค้าที่ส่งมอบทั้งหมด:</td>
                                    <td style="text-align:center; padding:6px 8px; font-size:0.95rem; font-weight:800; color:#0284c7;">${totalQty} เครื่อง</td>
                                </tr>
                            </tfoot>
                        </table>

                        <!-- หมายเหตุ -->
                        <div style="font-size:0.78rem; color:#0f172a; font-weight:500; margin-bottom:12px; padding:6px 10px; background:#f0f9ff; border-left:3px solid #0284c7; border-radius:4px; border:1px solid #bae6fd;">
                            <strong style="color:#0369a1;"><i class="fa-solid fa-circle-info" style="margin-right:4px;"></i> หมายเหตุ / วัตถุประสงค์การจัดส่ง :</strong>
                            <span style="margin-left:4px; font-weight:600;">${escapeHTML(noteText)}</span>
                        </div>
                    </div>

                    <!-- Footer โซนลายเซ็นมาตรฐานสากล กระชับพอดี ไม่สูงเกินไป -->
                    <div style="margin-top:auto; padding-top:10px; page-break-inside:avoid;">
                        <div style="display:grid; grid-template-columns:1fr 1fr 1fr; gap:12px; text-align:center;">
                            
                            <!-- ช่องที่ 1: ผู้รับสินค้า -->
                            <div style="border:1px solid #cbd5e1; border-radius:6px; padding:8px 6px; background:#fafafa;">
                                <div style="font-weight:700; color:#0f172a; margin-bottom:22px; font-size:0.8rem;">ผู้รับสินค้า / Consignee</div>
                                <div style="border-bottom:1px solid #0f172a; margin:0 10px 4px 10px;"></div>
                                <div style="font-weight:700; font-size:0.78rem;">( ${escapeHTML(receiver || '...................................................')} )</div>
                                <div style="color:#64748b; font-size:0.72rem; margin-top:2px;">วันที่: ..... / ..... / ..........</div>
                            </div>

                            <!-- ช่องที่ 2: ผู้จัดส่งสินค้า -->
                            <div style="border:1px solid #cbd5e1; border-radius:6px; padding:8px 6px; background:#fafafa;">
                                <div style="font-weight:700; color:#0f172a; margin-bottom:22px; font-size:0.8rem;">ผู้จ่ายสินค้า / Dispatcher</div>
                                <div style="border-bottom:1px solid #0f172a; margin:0 10px 4px 10px;"></div>
                                <div style="font-weight:700; font-size:0.78rem;">( ${escapeHTML(dispatcher || '...................................................')} )</div>
                                <div style="color:#64748b; font-size:0.72rem; margin-top:2px;">วันที่: ..... / ..... / ..........</div>
                            </div>

                            <!-- ช่องที่ 3: ผู้อนุมัติ -->
                            <div style="border:1px solid #cbd5e1; border-radius:6px; padding:8px 6px; background:#fafafa;">
                                <div style="font-weight:700; color:#0f172a; margin-bottom:22px; font-size:0.8rem;">ผู้อนุมัติ / Authorized By</div>
                                <div style="border-bottom:1px dashed #64748b; margin:0 10px 4px 10px;"></div>
                                <div style="font-weight:700; font-size:0.78rem;">( ................................................... )</div>
                                <div style="color:#64748b; font-size:0.72rem; margin-top:2px;">วันที่: ..... / ..... / ..........</div>
                            </div>

                        </div>

                        <div style="display:flex; justify-content:space-between; align-items:center; font-size:0.72rem; color:#64748b; border-top:1px solid #e2e8f0; padding-top:6px; margin-top:10px;">
                            <span>ระบบ WMS Enterprise — เอกสารส่งมอบสินค้าและย้ายคลัง</span>
                            <span>หน้าที่ 1/1</span>
                        </div>
                    </div>

                </div>

                <!-- Control Buttons -->
                <div class="no-print" style="margin-top:16px; display:flex; justify-content:flex-end; gap:10px; border-top:1px solid #e2e8f0; padding-top:12px;">
                    <button class="btn btn-secondary" onclick="window.print()" style="padding:8px 20px; font-weight:700; display:flex; align-items:center; gap:8px; background:#0284c7; border:none; color:#ffffff; box-shadow:0 3px 10px rgba(2,132,199,0.3);">
                        <i class="fa-solid fa-print"></i> พิมพ์ใบส่งสินค้า / บันทึก PDF (A4)
                    </button>
                    <button class="btn btn-primary" onclick="document.getElementById('workOrderModal').remove()" style="padding:8px 20px; font-weight:600; background:#475569; border-color:#475569;">
                        ปิดหน้าต่าง
                    </button>
                </div>
            </div>
        </div>
    `;

    const existingModal = document.getElementById('workOrderModal');
    if (existingModal) existingModal.remove();
    document.body.insertAdjacentHTML('beforeend', popupHtml);
}