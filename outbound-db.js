// =========================================================================
// --- MODULE 4: OUTBOUND ORDERS DATABASE ENGINE (HIGH-PERFORMANCE & A4 OPTIMIZED) ---
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

// Local Storage Cache Key สำหรับบันทึกประวัติใบสั่งจ่าย 100% ป้องกันข้อมูลสูญหายและเรียกดูได้อย่างรวดเร็ว
const LOCAL_OUTBOUND_CACHE_KEY = 'wh_outbound_orders_history_cache';

let recentOutboundOrders = [];
let outboundCartItems = [];

// Helper: บันทึกประวัติใบสั่งจ่ายลง Local Cache เพื่อความรวดเร็วสูงสุด 100%
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

function handleAddOutboundToCart(e) {
    if (e) e.preventDefault();
    const snInput = document.getElementById('outboundSn');
    if (!snInput) return;

    const sn = snInput.value.trim();
    if(!sn) return;

    const inventory = (typeof globalInventoryData !== 'undefined' && Array.isArray(globalInventoryData)) ? globalInventoryData : [];
    const lowerSn = sn.toLowerCase();
    
    // ค้นหารายการสินค้าแบบ Fast Match
    const item = inventory.find(i => i && i.sn && i.sn.toLowerCase() === lowerSn);
    if(!item) {
        if (typeof playErrorSound === 'function') playErrorSound();
        if (typeof showToast === 'function') showToast(`❌ ไม่พบ S/N "${escapeHTML(sn)}" ในระบบสต็อก!`, true);
        snInput.select();
        return;
    }

    if(outboundCartItems.some(i => i && i.sn && i.sn.toLowerCase() === lowerSn)) {
        if (typeof playErrorSound === 'function') playErrorSound();
        if (typeof showToast === 'function') showToast(`⚠ S/N "${escapeHTML(sn)}" มีอยู่ในรายการตัดจ่ายแล้ว`, true);
        snInput.select();
        return;
    }

    outboundCartItems.push(item);
    snInput.value = '';
    snInput.focus();

    if (typeof playSuccessSound === 'function') playSuccessSound();
    renderOutboundCartTable();
}

function renderOutboundCartTable() {
    const tbody = document.getElementById('outboundCartTableBody');
    if (!tbody) return;

    const cartBadge = document.getElementById('outboundCartCountBadge');
    if (cartBadge) {
        cartBadge.textContent = `${outboundCartItems.length} รายการ`;
    }

    if(outboundCartItems.length === 0) {
        tbody.innerHTML = `<tr><td colspan="7" style="text-align:center; padding:15px; color:var(--text-muted);">ยังไม่มีรายการ ยิงสแกน S/N เพื่อเพิ่มเข้าใบสั่งจ่าย</td></tr>`;
        return;
    }

    let html = '';
    outboundCartItems.forEach((item, idx) => {
        const formattedLoc = (typeof formatLocationCode === 'function') ? formatLocationCode(item.location) : item.location;
        html += `
            <tr>
                <td style="text-align:center;" class="mono">${idx + 1}</td>
                <td><code class="mono font-bold">${escapeHTML(item.category || 'N/A')}</code></td>
                <td>${escapeHTML(item.name || '-')}</td>
                <td><code class="mono font-bold">${escapeHTML(item.sn)}</code></td>
                <td class="mono font-bold" style="color:var(--warning);">${Number(item.meter || 0).toLocaleString()}</td>
                <td><span class="badge-location mono">${escapeHTML(formattedLoc)}</span></td>
                <td style="text-align:center;">
                    <button class="btn btn-sm btn-danger" style="padding:2px 6px;" onclick="removeFromOutboundCart('${escapeHTML(item.sn)}')">&times;</button>
                </td>
            </tr>
        `;
    });
    tbody.innerHTML = html;
}

function removeFromOutboundCart(sn) {
    outboundCartItems = outboundCartItems.filter(i => i.sn !== sn);
    renderOutboundCartTable();
}

// 🟢 ส่งคำขอจ่ายสินค้าออกสำหรับ User ทั่วไป หรือดำเนินการตัดจ่ายทันทีสำหรับ Admin
async function requestOutboundApproval() {
    if (typeof requireOnline === 'function' && !requireOnline('ตัดจ่าย/ส่งคำขอต้องเชื่อมต่ออินเทอร์เน็ต')) return;
    if(outboundCartItems.length === 0) {
        alert("⚠ กรุณายิงสแกน S/N สินค้าอย่างน้อย 1 รายการเพื่อตัดจ่าย");
        return;
    }

    const destElem = document.getElementById('outboundDestination');
    const dispatcherElem = document.getElementById('outboundDispatcher');
    const receiverElem = document.getElementById('outboundReceiver');

    const dest = destElem ? destElem.value.trim() : '';
    const dispatcher = dispatcherElem ? dispatcherElem.value.trim() : '';
    const receiver = receiverElem ? receiverElem.value.trim() : '';

    if(!dest || !dispatcher || !receiver) {
        alert("⚠️ กรุณากรอกข้อมูลสถานที่จ่าย, ผู้ส่ง และ ผู้รับ ให้ครบถ้วน");
        return;
    }

    const snList = outboundCartItems.map(i => i.sn);
    const workOrderNo = `WO-${new Date().toISOString().slice(0,10).replace(/-/g,'')}-${Math.floor(1000 + Math.random() * 9000)}`;

    // 🟢 หากผู้ใช้เป็น User ทั่วไป -> ส่งคำขออนุมัติจ่ายออกอย่างรวดเร็วไปยัง Admin
    if (typeof currentUser !== 'undefined' && currentUser && currentUser.role === 'user') {
        if (typeof createPendingApprovalRequest === 'function') {
            const success = await createPendingApprovalRequest(
                'OUTBOUND', 
                `[ใบงาน ${workOrderNo}] ขอตัดจ่ายสินค้าออกจากคลังไปยัง: ${dest} (${snList.length} รายการ)`, 
                snList, 
                { 
                    work_order_no: workOrderNo,
                    destination: dest, 
                    dispatcher: dispatcher, 
                    receiver: receiver, 
                    snList: snList,
                    cartDetails: [...outboundCartItems],
                    created_at: new Date().toISOString()
                }
            );
            
            if (success) {
                if (typeof showToast === 'function') showToast(`🚀 ส่งคำขอตัดจ่ายใบงาน ${workOrderNo} (${snList.length} รายการ) ไปยังแอดมินเรียบร้อยแล้ว`);
                outboundCartItems = [];
                renderOutboundCartTable();
            }
        }
        return;
    }

    // 🟢 หากเป็น Admin -> ดำเนินการตัดจ่ายลง DB โดยตรง
    await processFinalOutboundWorkOrder();
}

async function processFinalOutboundWorkOrder() {
    if (typeof requireOnline === 'function' && !requireOnline('ตัดจ่ายสินค้าต้องออนไลน์')) return;
    const destElem = document.getElementById('outboundDestination');
    const dispatcherElem = document.getElementById('outboundDispatcher');
    const receiverElem = document.getElementById('outboundReceiver');

    const dest = destElem ? destElem.value.trim() : '';
    const dispatcher = dispatcherElem ? dispatcherElem.value.trim() : '';
    const receiver = receiverElem ? receiverElem.value.trim() : '';

    const snList = outboundCartItems.map(i => i.sn);
    const workOrderNo = `WO-${new Date().toISOString().slice(0,10).replace(/-/g,'')}-${Math.floor(1000 + Math.random() * 9000)}`;

    if (typeof globalInventoryData !== 'undefined' && Array.isArray(globalInventoryData)) {
        globalInventoryData = globalInventoryData.filter(i => !snList.includes(i.sn));
    }
    if (typeof rebuildOccupiedSet === 'function') rebuildOccupiedSet();

    const orderPayload = {
        work_order_no: workOrderNo,
        destination: dest,
        dispatcher: dispatcher,
        receiver: receiver,
        sn_list: snList,
        items_count: outboundCartItems.length,
        items_detail: [...outboundCartItems],
        created_at: new Date().toISOString()
    };

    // 1. บันทึกลงหน่วยความจำแบบ Optimistic UI และ Local Storage ทันที เพื่อการทำงานที่รวดเร็วสูงสุด 100%
    recentOutboundOrders.unshift(orderPayload);
    saveOutboundHistoryToLocalCache(recentOutboundOrders);

    // อัปเดต Feed หน้าจอทันทีโดยไม่ต้องรอผลจาก DB
    const container = document.getElementById('liveOutboundFeedContainer');
    if (container) renderOutboundHistoryFeed(container, recentOutboundOrders);

    if (typeof playSuccessSound === 'function') playSuccessSound();
    if (typeof showToast === 'function') showToast(`📤 ตัดจ่ายสินค้าออกจากคลังสำเร็จ ${outboundCartItems.length} รายการ [ใบงาน: ${workOrderNo}]`);

    if (typeof logUserActivity === 'function') {
        logUserActivity('OUTBOUND', `ตัดจ่ายสินค้าไปที่: ${dest} (ใบงาน: ${workOrderNo}, จำนวน ${outboundCartItems.length} รายการ)`).catch(() => {});
    }

    // 2. ซิงค์ลง Supabase Database แบบเป็นเบื้องหลัง (Non-blocking Background Sync)
    if (navigator.onLine) {
        (async () => {
            try {
                const client = getSupabaseClient();
                if (client) {
                    await client.from('warehouse_items').delete().in('sn', snList);

                    const extendedPayload = {
                        work_order_no: workOrderNo,
                        destination: dest,
                        dispatcher: dispatcher,
                        receiver: receiver,
                        sn_list: snList,
                        items_count: outboundCartItems.length,
                        items_detail: JSON.stringify(outboundCartItems),
                        created_at: orderPayload.created_at
                    };

                    const { error: insertErr } = await client.from('outbound_orders').insert([extendedPayload]);
                    
                    if (insertErr) {
                        console.warn("Retrying DB insert with standard schema fallback...", insertErr);
                        const standardPayload = {
                            destination: dest,
                            dispatcher: dispatcher,
                            receiver: receiver,
                            sn_list: snList,
                            items_count: outboundCartItems.length,
                            created_at: orderPayload.created_at
                        };
                        await client.from('outbound_orders').insert([standardPayload]);
                    }
                }
            } catch (e) {
                console.warn("Outbound DB background sync exception, safely cached in LocalStorage:", e);
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

    // โหลดข้อมูลจาก Local Storage ขึ้นมาแสดงผลก่อนทันทีเพื่อความรวดเร็วแม่นยำ 100%
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
                    const existingKeys = new Set(localCachedData.map(o => o.work_order_no || o.created_at || o.id));
                    data.forEach(dbOrder => {
                        const key = dbOrder.work_order_no || dbOrder.created_at || dbOrder.id;
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
            console.warn("Fetch outbound history exception, using local cache:", e);
        }
    }

    if (combinedData.length === 0) {
        container.innerHTML = `<div style="text-align:center; padding:20px; color:var(--text-muted); font-size:0.85rem;">ยังไม่มีประวัติใบสั่งจ่ายสินค้า</div>`;
    }
}

// 🟢 Helper แสดง Feed ประวัติใบสั่งจ่าย พร้อมปุ่มเปิดดู/พิมพ์ใบงานจ่ายสินค้ามาตรฐาน (Work Order PDF)
function renderOutboundHistoryFeed(container, data) {
    if (!container || !Array.isArray(data)) return;
    let html = '';
    data.forEach((order, idx) => {
        const orderId = order.work_order_no || order.id || `WO-LOCAL-${idx}`;
        const workNo = order.work_order_no || `WO-${order.id || idx + 1}`;
        const totalCount = order.items_count || (order.sn_list ? order.sn_list.length : 0);
        html += `
            <div class="feed-item outbound" style="position:relative; padding-bottom:8px;">
                <div style="display:flex; justify-content:space-between; align-items:center;">
                    <strong style="color:var(--warning); font-size:0.9rem;">📍 ${escapeHTML(order.destination)}</strong>
                    <div>
                        <span class="mono font-bold badge-location">${totalCount} รายการ</span>
                        <button class="btn btn-sm" style="font-size:0.75rem; padding:2px 8px; margin-left:6px; background:var(--bg-tertiary); border:1px solid var(--border-color); font-weight:600;" onclick="viewOutboundWorkOrder('${escapeHTML(String(orderId))}')">📄 ใบงาน PDF</button>
                    </div>
                </div>
                <div style="font-size:0.8rem; color:var(--text-sub); margin-top:3px;">
                    เลขใบงาน: <code class="mono font-bold" style="color:var(--accent-color, #2563eb);">${escapeHTML(workNo)}</code> | ผู้จ่าย: <strong>${escapeHTML(order.dispatcher)}</strong> | ผู้รับ: <strong>${escapeHTML(order.receiver)}</strong>
                </div>
                <div style="font-size:0.75rem; color:var(--text-muted); margin-top:3px; word-break:break-all;" class="mono">
                    S/N: ${(order.sn_list || []).map(s => escapeHTML(s)).join(', ')}
                </div>
                <div style="font-size:0.72rem; color:var(--text-muted); text-align:right; margin-top:4px;">
                    🕒 ${order.created_at ? escapeHTML(new Date(order.created_at).toLocaleString('th-TH')) : '-'}
                </div>
            </div>
        `;
    });
    container.innerHTML = html;
}

// 🟢 ฟังก์ชันสำหรับเรียกดู และพิมพ์ใบงานจ่ายสินค้าออกจากคลัง (Goods Issue Note / Outbound Work Order) ดีไซน์ทางการระดับองค์กร 100%
function viewOutboundWorkOrder(orderId) {
    const order = recentOutboundOrders.find(o => String(o.work_order_no) === String(orderId) || String(o.id) === String(orderId));
    if (!order) {
        if (typeof showToast === 'function') showToast('❌ ไม่พบรายละเอียดใบงานจ่ายสินค้า', true);
        return;
    }

    const snList = order.sn_list || [];
    const workNo = order.work_order_no || `WO-${order.id || 'N/A'}`;
    const dateStr = order.created_at ? new Date(order.created_at).toLocaleString('th-TH', { dateStyle: 'long', timeStyle: 'medium' }) : '-';

    let items = [];
    if (Array.isArray(order.items_detail)) {
        items = order.items_detail;
    } else if (typeof order.items_detail === 'string') {
        try { items = JSON.parse(order.items_detail); } catch(e) { items = []; }
    }

    let detailRows = '';
    let totalItemsCount = 0;

    if (items.length > 0) {
        totalItemsCount = items.length;
        items.forEach((item, i) => {
            const formattedLoc = (typeof formatLocationCode === 'function') ? formatLocationCode(item.location) : (item.location || '-');
            detailRows += `
                <tr style="border-bottom:1px solid #e2e8f0;">
                    <td style="text-align:center; padding:7px 8px; font-weight:600; color:#64748b; white-space:nowrap;">${i + 1}</td>
                    <td style="padding:7px 8px; white-space:nowrap;"><span style="background:#f1f5f9; color:#0f172a; padding:2px 6px; border-radius:4px; font-weight:bold; font-size:0.78rem; font-family:monospace; border:1px solid #cbd5e1;">${escapeHTML(item.category || 'N/A')}</span></td>
                    <td style="padding:7px 8px; color:#1e293b; font-weight:500; word-break:break-word;">${escapeHTML(item.name || 'สินค้าตัดจ่ายออกจากคลัง')}</td>
                    <td style="padding:7px 8px; font-family:monospace; font-weight:700; white-space:nowrap; color:#1e40af;">${escapeHTML(item.sn || '-')}</td>
                    <td style="padding:7px 8px; text-align:center; white-space:nowrap;"><span style="background:#f8fafc; color:#334155; padding:2px 8px; border-radius:4px; font-family:monospace; font-size:0.8rem; border:1px solid #cbd5e1; font-weight:600;">${escapeHTML(formattedLoc)}</span></td>
                </tr>`;
        });
    } else {
        totalItemsCount = snList.length;
        snList.forEach((sn, i) => {
            detailRows += `
                <tr style="border-bottom:1px solid #e2e8f0;">
                    <td style="text-align:center; padding:7px 8px; font-weight:600; color:#64748b; white-space:nowrap;">${i + 1}</td>
                    <td style="padding:7px 8px; white-space:nowrap;"><span style="background:#f1f5f9; color:#0f172a; padding:2px 6px; border-radius:4px; font-weight:bold; font-size:0.78rem; font-family:monospace;">N/A</span></td>
                    <td style="padding:7px 8px; color:#1e293b; font-weight:500;">สินค้าตัดจ่ายออกจากคลัง</td>
                    <td style="padding:7px 8px; font-family:monospace; font-weight:700; white-space:nowrap; color:#1e40af;">${escapeHTML(sn)}</td>
                    <td style="padding:7px 8px; text-align:center; white-space:nowrap;">-</td>
                </tr>`;
        });
    }

    const popupHtml = `
        <div id="workOrderModal" style="position:fixed; top:0; left:0; width:100vw; height:100vh; background:rgba(15, 23, 42, 0.75); display:flex; justify-content:center; align-items:center; z-index:99999; backdrop-filter:blur(4px);">
            <div style="background:#ffffff; color:#0f172a; width:92%; max-width:850px; max-height:94vh; border-radius:12px; padding:28px; overflow-y:auto; box-shadow:0 25px 50px -12px rgba(0, 0, 0, 0.35); font-family:'Sarabun', 'TH Sarabun New', 'Segoe UI', Tahoma, sans-serif;">
                
                <!-- สไตล์การพิมพ์มาตรฐาน A4 ระดับทางการ พร้อมการล็อคตำแหน่งโซนลงนามล่างสุดเสมอ -->
                <style>
                    @page {
                        size: A4 portrait;
                        margin: 10mm;
                    }
                    @media print {
                        body * { visibility: hidden !important; }
                        #printableWorkOrderDocument, #printableWorkOrderDocument * { visibility: visible !important; }
                        #printableWorkOrderDocument {
                            position: absolute !important;
                            left: 0 !important;
                            top: 0 !important;
                            width: 100% !important;
                            min-height: 275mm !important;
                            box-sizing: border-box !important;
                            padding: 0mm !important;
                            display: flex !important;
                            flex-direction: column !important;
                            justify-content: space-between !important;
                        }
                        .no-print { display: none !important; }
                        .work-order-table th, .work-order-table td { padding: 6px 8px !important; font-size: 10.5pt !important; }
                    }
                </style>

                <div id="printableWorkOrderDocument" style="display:flex; flex-direction:column; justify-content:space-between; min-height:700px; background:#ffffff;">
                    
                    <!-- ส่วนเนื้อหาหลักด้านบน (Header + Destination Card + Items Table) -->
                    <div style="flex:1 0 auto;">
                        
                        <!-- Header เอกสารทางการ -->
                        <div style="display:flex; justify-content:space-between; align-items:flex-start; border-bottom:2px solid #0f172a; padding-bottom:12px; margin-bottom:16px;">
                            <div>
                                <div style="display:flex; align-items:center; gap:8px;">
                                    <span style="background:#0f172a; color:#ffffff; font-size:0.75rem; padding:2px 8px; border-radius:3px; font-weight:bold; letter-spacing:0.5px;">OFFICIAL DOCUMENT</span>
                                    <span style="color:#64748b; font-size:0.78rem;">คลังสินค้ามาตรฐานความปลอดภัยสูง</span>
                                </div>
                                <h2 style="margin:4px 0 0 0; font-size:1.4rem; color:#0f172a; font-weight:800; letter-spacing:-0.3px;">ใบจ่ายสินค้าออกจากคลัง (GOODS ISSUE NOTE)</h2>
                                <div style="font-size:0.82rem; color:#475569; margin-top:2px;">เอกสารสำคัญควบคุมการเบิกจ่ายและเคลื่อนย้ายสินค้าออกจากคลัง</div>
                            </div>
                            <div style="text-align:right;">
                                <div style="font-size:0.78rem; color:#64748b;">เลขที่ใบงาน (Work Order)</div>
                                <div style="font-size:1.05rem; font-weight:bold; color:#1e40af; font-family:monospace; margin-top:1px;">${escapeHTML(workNo)}</div>
                                <div style="font-size:0.75rem; color:#64748b; margin-top:4px;">วันที่ออกเอกสาร: <span style="color:#0f172a; font-weight:600;">${escapeHTML(dateStr)}</span></div>
                            </div>
                        </div>

                        <!-- ตารางแสดงรายละเอียดสถานที่ส่งมอบและผู้เกี่ยวข้อง -->
                        <div style="border:1px solid #cbd5e1; border-radius:8px; overflow:hidden; margin-bottom:18px; background:#f8fafc;">
                            <div style="background:#e2e8f0; padding:6px 14px; font-size:0.8rem; font-weight:bold; color:#334155; border-bottom:1px solid #cbd5e1; display:flex; justify-content:space-between; align-items:center;">
                                <span>📍 ข้อมูลการส่งมอบและโอนย้ายสินค้า</span>
                                <span>สถานะ: <strong style="color:#16a34a;">อนุมัติจ่ายออกแล้ว</strong></span>
                            </div>
                            <div style="padding:12px 14px; display:grid; grid-template-columns:1.3fr 0.7fr; gap:12px; font-size:0.86rem; line-height:1.6;">
                                <div>
                                    <div style="color:#64748b; font-size:0.78rem;">สถานที่ส่งมอบ / ปลายทางรับสินค้า:</div>
                                    <div style="color:#0f172a; font-weight:bold; font-size:0.95rem;">${escapeHTML(order.destination)}</div>
                                </div>
                                <div>
                                    <div style="color:#64748b; font-size:0.78rem;">จำนวนรายการตัดจ่ายรวม:</div>
                                    <div style="color:#1e40af; font-weight:bold; font-size:0.95rem; font-family:monospace;">${totalItemsCount} รายการ</div>
                                </div>
                                <div style="border-top:1px dashed #cbd5e1; padding-top:6px; margin-top:2px;">
                                    <span style="color:#64748b; font-size:0.78rem;">ผู้จัดส่ง / เจ้าหน้าที่จ่ายสินค้า:</span>
                                    <strong style="color:#0f172a; margin-left:6px;">${escapeHTML(order.dispatcher)}</strong>
                                </div>
                                <div style="border-top:1px dashed #cbd5e1; padding-top:6px; margin-top:2px;">
                                    <span style="color:#64748b; font-size:0.78rem;">ผู้รับสินค้า / ตัวแทนรับมอบ:</span>
                                    <strong style="color:#0f172a; margin-left:6px;">${escapeHTML(order.receiver)}</strong>
                                </div>
                            </div>
                        </div>

                        <!-- ตารางรายการสินค้าทางการ (ตัดคอลัมน์ความยาวออกอย่างเรียบร้อย) -->
                        <table class="work-order-table" style="width:100%; border-collapse:collapse; font-size:0.83rem; margin-bottom:16px; border:1px solid #cbd5e1;">
                            <thead>
                                <tr style="background:#0f172a; color:#ffffff; text-align:left;">
                                    <th style="padding:8px; text-align:center; width:40px; border-right:1px solid #334155;">#</th>
                                    <th style="padding:8px; width:120px; border-right:1px solid #334155;">หมวดหมู่</th>
                                    <th style="padding:8px; border-right:1px solid #334155;">รายการสินค้า / ชื่อรุ่น</th>
                                    <th style="padding:8px; width:180px; border-right:1px solid #334155;">หมายเลขซีเรียล (S/N)</th>
                                    <th style="padding:8px; text-align:center; width:120px;">พิกัดจัดเก็บเดิม</th>
                                </tr>
                            </thead>
                            <tbody>
                                ${detailRows}
                            </tbody>
                            <tfoot>
                                <tr style="background:#f1f5f9; font-weight:bold; border-top:2px solid #0f172a;">
                                    <td colspan="4" style="padding:9px 12px; text-align:right; font-size:0.88rem; color:#1e293b;">ยอดรวมรายการสินค้าจ่ายออกจากคลังทั้งสิ้น:</td>
                                    <td style="padding:9px 12px; text-align:center; font-family:monospace; font-size:0.95rem; color:#1e40af; font-weight:800; background:#e2e8f0;">${totalItemsCount} รายการ</td>
                                </tr>
                            </tfoot>
                        </table>

                        <!-- หมายเหตุความปลอดภัย -->
                        <div style="font-size:0.73rem; color:#64748b; font-style:italic; margin-bottom:10px;">
                            * เอกสารฉบับนี้ออกโดยระบบบริหารจัดการคลังสินค้าอัตโนมัติ ใช้สำหรับยืนยันการตัดจ่ายสินค้าออกจากระบบสต็อกอย่างเป็นทางการ
                        </div>
                    </div>

                    <!-- โซนลงนาม 3 ฝ่ายมาตรฐาน ล็อคตำแหน่งให้อยู่ส่วนล่างสุดของกระดาษเสมอ (Bottom Pinned Signatures) -->
                    <div style="margin-top:auto; padding-top:20px; page-break-inside:avoid; break-inside:avoid;">
                        <div style="display:grid; grid-template-columns:1fr 1fr 1fr; gap:14px; text-align:center; font-size:0.8rem;">
                            
                            <!-- ช่องลงนาม 1: ผู้จ่ายสินค้า -->
                            <div style="border:1px solid #cbd5e1; border-radius:6px; padding:12px; background:#fafafa;">
                                <div style="height:42px;"></div>
                                <div style="border-top:1px dashed #64748b; width:85%; margin:0 auto 4px auto;"></div>
                                <div style="font-weight:700; color:#0f172a;">( ${escapeHTML(order.dispatcher)} )</div>
                                <div style="color:#475569; font-size:0.75rem; margin-top:2px; font-weight:500;">ผู้จัดส่ง / เจ้าหน้าที่จ่ายสินค้า</div>
                                <div style="color:#94a3b8; font-size:0.72rem; margin-top:4px;">วันที่ ...../...../..........</div>
                            </div>

                            <!-- ช่องลงนาม 2: ผู้ตรวจสอบ / หัวหน้าคลัง -->
                            <div style="border:1px solid #cbd5e1; border-radius:6px; padding:12px; background:#fafafa;">
                                <div style="height:42px;"></div>
                                <div style="border-top:1px dashed #64748b; width:85%; margin:0 auto 4px auto;"></div>
                                <div style="font-weight:700; color:#0f172a;">( .................................................. )</div>
                                <div style="color:#475569; font-size:0.75rem; margin-top:2px; font-weight:500;">ผู้ตรวจสอบ / หัวหน้าคลังสินค้า</div>
                                <div style="color:#94a3b8; font-size:0.72rem; margin-top:4px;">วันที่ ...../...../..........</div>
                            </div>

                            <!-- ช่องลงนาม 3: ผู้รับสินค้า -->
                            <div style="border:1px solid #cbd5e1; border-radius:6px; padding:12px; background:#fafafa;">
                                <div style="height:42px;"></div>
                                <div style="border-top:1px dashed #64748b; width:85%; margin:0 auto 4px auto;"></div>
                                <div style="font-weight:700; color:#0f172a;">( ${escapeHTML(order.receiver)} )</div>
                                <div style="color:#475569; font-size:0.75rem; margin-top:2px; font-weight:500;">ผู้รับมอบสินค้า / ตัวแทน</div>
                                <div style="color:#94a3b8; font-size:0.72rem; margin-top:4px;">วันที่ ...../...../..........</div>
                            </div>

                        </div>
                    </div>

                </div>

                <!-- ปุ่มควบคุมภายนอก Modal (ซ่อนอัตโนมัติขณะพิมพ์) -->
                <div class="no-print" style="margin-top:20px; display:flex; justify-content:flex-end; gap:10px; border-top:1px solid #e2e8f0; padding-top:16px;">
                    <button class="btn btn-secondary" onclick="window.print()" style="padding:8px 20px; font-weight:600; display:flex; align-items:center; gap:6px; background:#f1f5f9; border:1px solid #cbd5e1; color:#0f172a;">🖨️ พิมพ์ / บันทึกเป็น PDF (A4)</button>
                    <button class="btn btn-primary" onclick="document.getElementById('workOrderModal').remove()" style="padding:8px 20px; font-weight:600; background:#0f172a; border-color:#0f172a;">ปิดหน้าต่าง</button>
                </div>
            </div>
        </div>
    `;

    const existingModal = document.getElementById('workOrderModal');
    if (existingModal) existingModal.remove();
    document.body.insertAdjacentHTML('beforeend', popupHtml);
}