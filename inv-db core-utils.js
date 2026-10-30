// =========================================================================
// 📌 [ส่วนที่ 1] WMS CORE UTILITIES, LOCATION NORMALIZER & AUDIT LOGS
// =========================================================================

// -------------------------------------------------------------------------
// 🛡️ Safe HTML Escaping Utility
// -------------------------------------------------------------------------
if (typeof window.escapeHTML !== 'function') {
    window.escapeHTML = function(str) {
        if (str === null || str === undefined) return '';
        return String(str)
            .replace(/&/g, '&amp;')
            .replace(/</g, '&lt;')
            .replace(/>/g, '&gt;')
            .replace(/"/g, '&quot;')
            .replace(/'/g, '&#039;');
    };
}

// -------------------------------------------------------------------------
// 🛠️ ระบบแปลงและจัดรูปแบบพิกัดให้เป็นมาตรฐานเดียวกัน 100% (Location Normalizer)
// -------------------------------------------------------------------------
function normalizeLoc(locStr) {
    if (!locStr) return '';
    const clean = String(locStr).trim().toUpperCase();
    if (['DOCK', 'OFFICE', 'PENDING', 'FOOD', 'FREEZER', 'COLD', 'DRY', 'RAW'].includes(clean)) {
        return clean;
    }
    if (typeof normalizeLocationCode === 'function') {
        const norm = normalizeLocationCode(clean);
        if (norm) return norm;
    }
    const parts = clean.split(/[\-\/_]+/);
    if (parts.length >= 4) {
        const aisle = parts[0];
        const bay = String(parseInt(parts[1], 10) || 1).padStart(2, '0');
        const shelf = String(parseInt(parts[2], 10) || 1);
        const slot = String(parseInt(parts[3], 10) || 1).padStart(2, '0');
        return `${aisle}-${bay}-${shelf}-${slot}`;
    }
    return clean;
}

// -------------------------------------------------------------------------
// 📍 ระบบจัดรูปแบบการแสดงผลพิกัดจัดเก็บให้เป็นระเบียบ เว้นช่องไฟดูง่าย เด่นชัด
// -------------------------------------------------------------------------
function formatLocationCode(locStr) {
    if (!locStr) return '-';
    const clean = String(locStr).trim().toUpperCase();
    if (clean === 'DOCK') return 'ลาน DOCK';
    if (clean === 'OFFICE') return 'ออฟฟิศ (OFFICE)';
    if (clean === 'PENDING') return 'รอรับเข้า (PENDING)';
    if (clean === 'FOOD') return 'โซนอาหาร (FOOD)';
    if (clean === 'FREEZER') return 'ห้องแช่แข็ง (FREEZER)';
    if (clean === 'COLD') return 'ห้องเย็น (COLD)';
    if (clean === 'DRY') return 'คลังสินค้าแห้ง (DRY)';
    if (clean === 'RAW') return 'วัตถุดิบ (RAW)';

    const parts = clean.split(/[\-\/_]+/);
    if (parts.length >= 4) {
        return `แถว ${parts[0]}   ล็อก ${parts[1]}   ชั้น ${parts[2]}   ช่อง ${parts[3]}`;
    } else if (parts.length === 3) {
        return `แถว ${parts[0]}   ล็อก ${parts[1]}   ชั้น ${parts[2]}`;
    } else if (parts.length === 2) {
        return `แถว ${parts[0]}   ล็อก ${parts[1]}`;
    }
    return clean.replace(/-/g, '   ');
}

// -------------------------------------------------------------------------
// 🔄 ระบบส่งการแจ้งเตือนอัปเดตข้อมูลข้ามหน้า/ข้ามแท็บ Real-Time (Broadcaster)
// -------------------------------------------------------------------------
function notifyWmsDataChanged(actionType = 'UPDATE', details = null) {
    try {
        const eventData = { actionType, details, timestamp: Date.now() };
        
        // 1. Dispatch Custom Event ใน Tab ปัจจุบัน
        if (typeof window !== 'undefined') {
            window.dispatchEvent(new CustomEvent('wms:data-updated', { detail: eventData }));
        }

        // 2. ส่งผ่าน BroadcastChannel สำหรับแท็บอื่นในเบราว์เซอร์เดียวกัน
        if (typeof BroadcastChannel !== 'undefined') {
            const bc = new BroadcastChannel('wms_realtime_sync_channel');
            bc.postMessage(eventData);
            bc.close();
        }
    } catch (e) {
        console.warn('WMS Data change notification warning:', e);
    }
}

// -------------------------------------------------------------------------
// 🔊 ระบบการแจ้งเตือนเสียงและระบบสั่นตอบรับ (Enhanced Audio & Haptic Feedback)
// -------------------------------------------------------------------------
function playActionFeedbackSound(type = 'success') {
    try {
        if (navigator.vibrate) {
            if (type === 'delete') navigator.vibrate([40, 60, 40]);
            else if (type === 'success') navigator.vibrate(30);
            else if (type === 'warning') navigator.vibrate([100, 50, 100]);
        }
        const ctx = new (window.AudioContext || window.webkitAudioContext)();
        if (!ctx) return;
        const osc = ctx.createOscillator();
        const gain = ctx.createGain();
        osc.connect(gain);
        gain.connect(ctx.destination);

        if (type === 'delete') {
            osc.frequency.setValueAtTime(240, ctx.currentTime);
            osc.frequency.exponentialRampToValueAtTime(80, ctx.currentTime + 0.18);
            gain.gain.setValueAtTime(0.18, ctx.currentTime);
            gain.gain.linearRampToValueAtTime(0.01, ctx.currentTime + 0.18);
            osc.start();
            osc.stop(ctx.currentTime + 0.18);
        } else if (type === 'warning') {
            osc.frequency.setValueAtTime(440, ctx.currentTime);
            osc.frequency.setValueAtTime(220, ctx.currentTime + 0.1);
            gain.gain.setValueAtTime(0.15, ctx.currentTime);
            gain.gain.linearRampToValueAtTime(0.01, ctx.currentTime + 0.2);
            osc.start();
            osc.stop(ctx.currentTime + 0.2);
        } else {
            osc.frequency.setValueAtTime(587.33, ctx.currentTime);
            osc.frequency.exponentialRampToValueAtTime(880, ctx.currentTime + 0.12);
            gain.gain.setValueAtTime(0.1, ctx.currentTime);
            gain.gain.linearRampToValueAtTime(0.01, ctx.currentTime + 0.12);
            osc.start();
            osc.stop(ctx.currentTime + 0.12);
        }
    } catch (e) {}
}

// -------------------------------------------------------------------------
// 🛡️ ระบบบันทึกประวัติความปลอดภัย (Audit Trail Log System)
// -------------------------------------------------------------------------
function logAuditAction(actionType, details) {
    const auditData = {
        action: actionType,
        user: getCurrentReceiverName(),
        role: getCurrentUserRole(),
        details: details,
        timestamp: new Date().toISOString()
    };

    try {
        const existingLogs = JSON.parse(localStorage.getItem('WMS_AUDIT_LOGS') || '[]');
        existingLogs.unshift(auditData);
        if (existingLogs.length > 200) existingLogs.pop();
        localStorage.setItem('WMS_AUDIT_LOGS', JSON.stringify(existingLogs));
    } catch(e) {}

    const client = getSupabaseClient();
    if (client) {
        client.from('audit_logs').insert([{
            action_type: actionType,
            performed_by: auditData.user,
            user_role: auditData.role,
            details: JSON.stringify(details),
            created_at: auditData.timestamp
        }]).then(() => {}).catch(() => {});
    }
}

function exportAuditLogsToCSV() {
    try {
        const logs = JSON.parse(localStorage.getItem('WMS_AUDIT_LOGS') || '[]');
        if (logs.length === 0) {
            if (typeof showToast === 'function') showToast('⚠️ ไม่พบประวัติการทำรายการในระบบ', true);
            return;
        }
        let csv = '\uFEFFวันที่-เวลา,การกระทำ,ผู้ทำรายการ,สิทธิ์,รายละเอียด\n';
        logs.forEach(l => {
            const dt = l.timestamp ? new Date(l.timestamp).toLocaleString('th-TH') : '-';
            const detailStr = JSON.stringify(l.details || {}).replace(/"/g, '""');
            csv += `"${dt}","${l.action || ''}","${l.user || ''}","${l.role || ''}","${detailStr}"\n`;
        });
        const blob = new Blob([csv], { type: 'text/csv;charset=utf-8;' });
        const url = URL.createObjectURL(blob);
        const a = document.createElement('a');
        a.href = url;
        a.download = `WMS_Audit_Logs_${new Date().toISOString().slice(0, 10)}.csv`;
        a.click();
        URL.revokeObjectURL(url);
    } catch (e) {
        console.error("Export Audit Logs Error:", e);
    }
}

// -------------------------------------------------------------------------
// 📋 Clipboard & Helper Functions
// -------------------------------------------------------------------------
function copyTextToClipboard(text, label = 'ข้อความ') {
    if (!text) return;
    if (navigator.clipboard && window.isSecureContext) {
        navigator.clipboard.writeText(text).then(() => {
            playActionFeedbackSound('success');
            if (typeof showToast === 'function') showToast(`📋 คัดลอก ${label} (${text}) เรียบร้อยแล้ว`);
        }).catch(() => {});
    } else {
        const textArea = document.createElement("textarea");
        textArea.value = text;
        document.body.appendChild(textArea);
        textArea.select();
        try {
            document.execCommand('copy');
            playActionFeedbackSound('success');
            if (typeof showToast === 'function') showToast(`📋 คัดลอก ${label} (${text}) เรียบร้อยแล้ว`);
        } catch (err) {}
        document.body.removeChild(textArea);
    }
}

function copyAllSerialsInCurrentGroup() {
    if (!currentDetailModalGroupKey) return;
    const grp = currentInventoryGroups.find(g => g.groupKey === currentDetailModalGroupKey);
    if (!grp || !grp.items || grp.items.length === 0) return;
    const serialListText = grp.items.map(i => i.sn).join('\n');
    copyTextToClipboard(serialListText, `S/N ทั้งหมด ${grp.items.length} รายการ`);
}

function autoFitExcelColumns(worksheet, rows) {
    if (!rows || rows.length === 0) return;
    const keys = Object.keys(rows[0]);
    const colWidths = keys.map(key => {
        let maxLen = String(key).split('').reduce((acc, ch) => acc + (ch.charCodeAt(0) > 255 ? 1.8 : 1), 0);
        rows.forEach(row => {
            const val = row[key] !== null && row[key] !== undefined ? String(row[key]) : '';
            const cellLen = val.split('').reduce((acc, ch) => acc + (ch.charCodeAt(0) > 255 ? 1.8 : 1), 0);
            if (cellLen > maxLen) maxLen = cellLen;
        });
        return { wch: Math.ceil(Math.max(maxLen + 4, 12)) };
    });
    worksheet['!cols'] = colWidths;
}