// =========================================================================
// --- MODULE 4: OUTBOUND ORDERS DATABASE ENGINE ---
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

let recentOutboundOrders = [];
let outboundCartItems = [];

function handleAddOutboundToCart(e) {
    if (e) e.preventDefault();
    const snInput = document.getElementById('outboundSn');
    if (!snInput) return;

    const sn = snInput.value.trim();
    if(!sn) return;

    const inventory = (typeof globalInventoryData !== 'undefined' && Array.isArray(globalInventoryData)) ? globalInventoryData : [];
    const item = inventory.find(i => i.sn && i.sn.toLowerCase() === sn.toLowerCase());
    if(!item) {
        if (typeof playErrorSound === 'function') playErrorSound();
        if (typeof showToast === 'function') showToast(`❌ ไม่พบ S/N "${escapeHTML(sn)}" ในระบบสต็อก!`, true);
        snInput.select();
        return;
    }

    if(outboundCartItems.some(i => i.sn && i.sn.toLowerCase() === sn.toLowerCase())) {
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

    // 🟢 หากผู้ใช้เป็น User ทั่วไป -> ส่งคำขออนุมัติจ่ายออก
    if (typeof currentUser !== 'undefined' && currentUser && currentUser.role === 'user') {
        if (typeof createPendingApprovalRequest === 'function') {
            const success = await createPendingApprovalRequest(
                'OUTBOUND', 
                `ขอตัดจ่ายสินค้าออกจากคลังไปยัง: ${dest} (${snList.length} รายการ)`, 
                snList, 
                { destination: dest, dispatcher: dispatcher, receiver: receiver, snList: snList }
            );
            
            if (success) {
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
    if (typeof globalInventoryData !== 'undefined' && Array.isArray(globalInventoryData)) {
        globalInventoryData = globalInventoryData.filter(i => !snList.includes(i.sn));
    }
    if (typeof rebuildOccupiedSet === 'function') rebuildOccupiedSet();

    const orderPayload = {
        destination: dest,
        dispatcher: dispatcher,
        receiver: receiver,
        sn_list: snList,
        items_count: outboundCartItems.length,
        created_at: new Date().toISOString()
    };

    if (typeof playSuccessSound === 'function') playSuccessSound();
    if (typeof showToast === 'function') showToast(`📤 ตัดจ่ายสินค้าออกจากคลังจำนวน ${outboundCartItems.length} รายการ เรียบร้อย`);

    if (typeof logUserActivity === 'function') {
        await logUserActivity('OUTBOUND', `ตัดจ่ายสินค้าไปที่: ${dest} (จำนวน ${outboundCartItems.length} เครื่อง)`);
    }

    if (navigator.onLine) {
        try {
            const client = getSupabaseClient();
            if (client) {
                await client.from('warehouse_items').delete().in('sn', snList);
                await client.from('outbound_orders').insert([orderPayload]);
            }
        } catch (e) {
            // Safe Catch
        }
    }

    outboundCartItems = [];
    renderOutboundCartTable();
    if (typeof filterInventoryData === 'function') filterInventoryData();
    if (typeof updateKPIs === 'function') updateKPIs();
    if (typeof refreshLocationVisualizerIfActive === 'function') refreshLocationVisualizerIfActive();
    loadOutboundHistoryFromDB();
}

async function loadOutboundHistoryFromDB() {
    const container = document.getElementById('liveOutboundFeedContainer');
    if (!container) return;

    if (!navigator.onLine) {
        container.innerHTML = `<div style="text-align:center; padding:20px; color:var(--text-muted); font-size:0.85rem;">อยู่ในโหมดออฟไลน์</div>`;
        return;
    }

    try {
        const client = getSupabaseClient();
        if (!client) return;

        const { data, error } = await client
            .from('outbound_orders')
            .select('*')
            .order('created_at', { ascending: false })
            .limit(50);

        if(!error && data && data.length > 0) {
            recentOutboundOrders = data;
            let html = '';
            data.forEach(order => {
                html += `
                    <div class="feed-item outbound">
                        <div style="display:flex; justify-content:space-between; align-items:center;">
                            <strong style="color:var(--warning); font-size:0.9rem;">📍 ${escapeHTML(order.destination)}</strong>
                            <span class="mono font-bold badge-location">${order.items_count} เครื่อง</span>
                        </div>
                        <div style="font-size:0.8rem; color:var(--text-sub);">
                            ผู้จ่าย: <strong>${escapeHTML(order.dispatcher)}</strong> | ผู้รับ: <strong>${escapeHTML(order.receiver)}</strong>
                        </div>
                        <div style="font-size:0.75rem; color:var(--text-muted); margin-top:2px;" class="mono">
                            S/N: ${(order.sn_list || []).map(s => escapeHTML(s)).join(', ')}
                        </div>
                        <div style="font-size:0.72rem; color:var(--text-muted); text-align:right;">
                            🕒 ${order.created_at ? escapeHTML(new Date(order.created_at).toLocaleString('th-TH')) : '-'}
                        </div>
                    </div>
                `;
            });
            container.innerHTML = html;
        } else {
            container.innerHTML = `<div style="text-align:center; padding:20px; color:var(--text-muted); font-size:0.85rem;">ยังไม่มีประวัติใบสั่งจ่ายสินค้า</div>`;
        }
    } catch(e) {
        // Safe Catch
    }
}