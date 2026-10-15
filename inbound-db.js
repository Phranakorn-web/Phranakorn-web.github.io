// =========================================================================
// --- MODULE 3: FAST INBOUND DATABASE ENGINE ---
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

let recentInboundList = [];

async function handleInboundSubmit(e) {
    if (e) e.preventDefault();

    const snInput = document.getElementById('inboundSn');
    if (!snInput) return;

    const sn = snInput.value.trim();
    const categoryElem = document.getElementById('inboundCategory');
    const nameElem = document.getElementById('inboundName');
    const meterElem = document.getElementById('inboundMeter');
    const locationElem = document.getElementById('inboundLocationPreview');

    const category = categoryElem ? categoryElem.value.trim() : '';
    const name = nameElem ? nameElem.value.trim() : '';
    const meterVal = meterElem ? (parseInt(meterElem.value) || 0) : 0;
    const location = locationElem ? locationElem.textContent : 'DOCK';

    if (!sn) return;
    if (!category || !name) {
        if (typeof playErrorSound === 'function') playErrorSound();
        if (typeof showToast === 'function') showToast('⚠️ กรุณาเลือก/กรอก SKU และชื่อรุ่นก่อนสแกน S/N', true);
        return;
    }

    if ((typeof globalInventoryData !== 'undefined' && Array.isArray(globalInventoryData) && globalInventoryData.some(i => String(i.sn).toLowerCase() === sn.toLowerCase())) || (typeof isPendingSn === 'function' && isPendingSn(sn))) {
        if (typeof playErrorSound === 'function') playErrorSound();
        if (typeof showToast === 'function') showToast(`🚨 S/N "${escapeHTML(sn)}" มีอยู่ในระบบสต็อกแล้ว!`, true);
        snInput.select();
        return;
    }

    if (location !== 'DOCK' && location !== 'OFFICE' && location !== 'PENDING') {
        if (typeof occupiedLocationsSet !== 'undefined' && occupiedLocationsSet.has(location.toUpperCase())) {
            if (typeof playErrorSound === 'function') playErrorSound();
            if (typeof showToast === 'function') showToast(`⛔ พิกัด ${escapeHTML(location)} มีสินค้าจัดเก็บอยู่แล้ว! ระบบกำลังปรับเลือกพิกัดใหม่ให้อัตโนมัติ`, true);
            if (typeof autoSelectNextAvailableSlotAfterInbound === 'function') autoSelectNextAvailableSlotAfterInbound();
            return;
        }
    }

    const rawPayload = { category, name, sn, meter: meterVal, location, qty: 1, created_at: new Date().toISOString() };

    snInput.value = '';
    snInput.focus();

    if (typeof playSuccessSound === 'function') playSuccessSound();
    if (typeof voiceSettings !== 'undefined' && voiceSettings.inboundVoice && typeof speakThaiText === 'function') {
        speakThaiText(`รับสินค้าซีเรียล ${sn} เข้าพิกัด ${location} เรียบร้อยค่ะ`);
    }

    if (navigator.onLine) {
        try {
            const client = getSupabaseClient();
            if (client && typeof sanitizeForDb === 'function') {
                const cleanData = sanitizeForDb(rawPayload);
                const { data, error } = await client.from('warehouse_items').insert([cleanData]).select();

                if (error) {
                    if (error.code === '23505') {
                        if (typeof playErrorSound === 'function') playErrorSound();
                        if (typeof showToast === 'function') showToast(`🚨 S/N "${escapeHTML(sn)}" มีอยู่ในฐานข้อมูลแล้ว!`, true);
                        return;
                    } else {
                        if (typeof playErrorSound === 'function') playErrorSound();
                        if (typeof showToast === 'function') showToast(`⚠️ เกิดข้อผิดพลาดจากฐานข้อมูล`, true);
                        
                        rawPayload._pending = true;
                        if (typeof globalInventoryData !== 'undefined' && Array.isArray(globalInventoryData)) globalInventoryData.unshift(rawPayload);
                        if (typeof offlineInboundQueue !== 'undefined' && Array.isArray(offlineInboundQueue)) offlineInboundQueue.push(rawPayload);
                        if (typeof persistQueue === 'function') persistQueue();

                        recentInboundList.unshift({
                            sn, category, name, meter: meterVal, location,
                            time: new Date().toLocaleTimeString('th-TH'),
                            isOffline: true
                        });
                    }
                } else {
                    const insertedItem = (data && data[0]) ? data[0] : cleanData;
                    if (typeof globalInventoryData !== 'undefined' && Array.isArray(globalInventoryData)) globalInventoryData.unshift(insertedItem);

                    recentInboundList.unshift({
                        sn, category, name, meter: meterVal, location,
                        time: new Date().toLocaleTimeString('th-TH'),
                        isOffline: false
                    });
                    if (recentInboundList.length > 100) recentInboundList.length = 100;

                    if (typeof showToast === 'function') showToast(`✅ บันทึก S/N: ${escapeHTML(sn)} เข้าฐานข้อมูลเรียบร้อยแล้ว`);
                }
            } else {
                throw new Error("Supabase client not available");
            }
        } catch (err) {
            rawPayload._pending = true;
            if (typeof globalInventoryData !== 'undefined' && Array.isArray(globalInventoryData)) globalInventoryData.unshift(rawPayload);
            if (typeof offlineInboundQueue !== 'undefined' && Array.isArray(offlineInboundQueue)) offlineInboundQueue.push(rawPayload);
            if (typeof persistQueue === 'function') persistQueue();

            recentInboundList.unshift({
                sn, category, name, meter: meterVal, location,
                time: new Date().toLocaleTimeString('th-TH'),
                isOffline: true
            });
            if (typeof showToast === 'function') showToast(`🟠 สัญญาณขัดข้อง เก็บ S/N: ${escapeHTML(sn)} ไว้ในเครื่องแล้ว`, true);
        }
    } else {
        rawPayload._pending = true;
        if (typeof globalInventoryData !== 'undefined' && Array.isArray(globalInventoryData)) globalInventoryData.unshift(rawPayload);
        if (typeof offlineInboundQueue !== 'undefined' && Array.isArray(offlineInboundQueue)) offlineInboundQueue.push(rawPayload);
        if (typeof persistQueue === 'function') persistQueue();

        recentInboundList.unshift({
            sn, category, name, meter: meterVal, location,
            time: new Date().toLocaleTimeString('th-TH'),
            isOffline: true
        });
        if (typeof showToast === 'function') showToast(`🟠 (ออฟไลน์) เก็บ S/N: ${escapeHTML(sn)} ไว้ในเครื่องแล้ว`);
    }

    if (typeof updateKPIs === 'function') updateKPIs();
    if (typeof filterInventoryData === 'function') filterInventoryData();
    if (typeof refreshLocationVisualizerIfActive === 'function') refreshLocationVisualizerIfActive();
    if (typeof autoSelectNextAvailableSlotAfterInbound === 'function') autoSelectNextAvailableSlotAfterInbound();
    renderLiveInboundFeed();

    if (typeof logUserActivity === 'function') logUserActivity('INBOUND', `รับเข้าสินค้า [SKU: ${category}] ${name} เข้าพิกัด ${location}`, sn);
}

async function loadRecentInboundFeedFromDB() {
    if (!navigator.onLine) return;
    try {
        const client = getSupabaseClient();
        if (!client) return;

        const { data, error } = await client
            .from('warehouse_items')
            .select('*')
            .order('created_at', { ascending: false })
            .limit(50);

        if (!error && data) {
            recentInboundList = data.map(item => ({
                sn: item.sn,
                category: item.category || 'N/A',
                name: item.name || '-',
                meter: item.meter || 0,
                location: item.location || 'DOCK',
                time: item.created_at ? new Date(item.created_at).toLocaleTimeString('th-TH') : '-',
                isOffline: false
            }));
            renderLiveInboundFeed();
        }
    } catch (e) {
        // Safe Catch
    }
}

function renderLiveInboundFeed() {
    const container = document.getElementById('liveInboundFeedContainer');
    if (!container || recentInboundList.length === 0) return;

    let html = '';
    recentInboundList.forEach(item => {
        const syncBadge = item.isOffline 
            ? `<span class="badge-action delete" style="font-size:0.7rem;"><i class="fa-solid fa-wifi-slash"></i> รอนำเข้า DB</span>`
            : `<span class="badge-action inbound" style="font-size:0.7rem;"><i class="fa-solid fa-circle-check"></i> บันทึก DB แล้ว</span>`;

        const cancelBtn = item.isOffline 
            ? `<button class="btn btn-sm btn-danger" style="padding:2px 6px; font-size:0.7rem;" onclick="removePendingItemBySn('${escapeHTML(item.sn)}')" title="ยกเลิกการรออนุมัติ/บันทึก"><i class="fa-solid fa-xmark"></i> ลบคิว</button>` 
            : '';

        const feedClass = item.isOffline ? 'db-pending-warn' : 'db-synced-success';
        const formattedLoc = typeof formatLocationCode === 'function' ? formatLocationCode(item.location) : item.location;

        html += `
            <div class="feed-item ${feedClass}">
                <div style="display:flex; justify-content:space-between; align-items:center;">
                    <span class="mono font-bold" style="color:var(--text-main); font-size:0.9rem;">S/N: ${escapeHTML(item.sn)}</span>
                    <div style="display:flex; gap:6px; align-items:center;">
                        ${syncBadge}
                        ${cancelBtn}
                        <span class="badge-location mono" style="font-size:0.75rem;">📍 ${escapeHTML(formattedLoc)}</span>
                    </div>
                </div>
                <div class="text-multiline-truncate" style="font-size:0.8rem; color:var(--text-sub); font-weight:500;" title="[${escapeHTML(item.category)}] ${escapeHTML(item.name)}">
                    [${escapeHTML(item.category)}] ${escapeHTML(item.name)}
                </div>
                <div style="display:flex; justify-content:space-between; align-items:center; font-size:0.75rem; color:var(--warning); font-weight:700; margin-top:2px;">
                    <span><i class="fa-solid fa-gauge"></i> มิเตอร์: ${Number(item.meter || 0).toLocaleString()}</span>
                    <span style="color:var(--text-muted); font-weight:400;">🕒 ${escapeHTML(item.time)} น.</span>
                </div>
            </div>
        `;
    });
    container.innerHTML = html;
}

// 🟢 ค้นหาด่วนรหัสสินค้า SKU ค้นหาจาก Master Products ทั้งหมดในฐานข้อมูล DB 100%
function onSkuSearchInput(val) {
    const box = document.getElementById('skuSuggestionsBox');
    if (!box) return;

    if (!val || !val.trim()) {
        box.style.display = 'none';
        return;
    }

    const query = val.toLowerCase().trim();
    const skuMap = new Map();

    const masterList = (typeof globalMasterProducts !== 'undefined' && Array.isArray(globalMasterProducts)) ? globalMasterProducts : [];
    const inventoryList = (typeof globalInventoryData !== 'undefined' && Array.isArray(globalInventoryData)) ? globalInventoryData : [];

    masterList.concat(inventoryList).forEach(item => {
        const skuKey = (item.sku || item.category || item.code || '').trim();
        const nameVal = (item.name || item.description || item.model || item.title || '').trim();

        if (skuKey && !skuMap.has(skuKey.toLowerCase())) {
            if (skuKey.toLowerCase().includes(query) || nameVal.toLowerCase().includes(query)) {
                skuMap.set(skuKey.toLowerCase(), { sku: skuKey, name: nameVal });
            }
        }
    });

    const uniqueResults = Array.from(skuMap.values()).slice(0, 100);

    if (uniqueResults.length === 0) {
        box.innerHTML = `<div style="padding:12px; text-align:center; color:var(--text-muted); font-size:0.85rem;">ไม่พบข้อมูล SKU / ชื่อรุ่น "${escapeHTML(val)}" ในฐานข้อมูล Master</div>`;
        box.style.display = 'block';
        return;
    }

    let html = '';
    uniqueResults.forEach(item => {
        html += `
            <div class="suggestion-item" onclick="selectSkuSuggestion('${escapeHTML(item.sku)}', '${escapeHTML(item.name)}')">
                <span class="mono font-bold" style="color:var(--primary-text);">${escapeHTML(item.sku)}</span>
                <span style="color:var(--text-main); font-size:0.82rem; margin-left:10px; text-overflow:ellipsis; overflow:hidden; white-space:nowrap;">${escapeHTML(item.name)}</span>
            </div>
        `;
    });
    box.innerHTML = html;
    box.style.display = 'block';
}

function selectSkuSuggestion(sku, name) {
    const catElem = document.getElementById('inboundCategory');
    const nameElem = document.getElementById('inboundName');
    const searchInput = document.getElementById('skuSearchInput');
    const box = document.getElementById('skuSuggestionsBox');
    const snInput = document.getElementById('inboundSn');

    if (catElem) catElem.value = sku;
    if (nameElem) nameElem.value = name;
    if (searchInput) searchInput.value = `${sku} - ${name}`;
    if (box) box.style.display = 'none';
    if (snInput) snInput.focus();
}