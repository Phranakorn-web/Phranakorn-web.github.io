// =========================================================================
// --- SAFE SUPABASE DATABASE INITIALIZATION ENGINE (db-config.js) ---
// =========================================================================

// Safe Escape HTML Helper Global Declaration
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

// กำหนดค่าคอนฟิก Supabase จาก Environment หรือ Default Client Config
window.ENV = window.ENV || {};

// ดึงค่าจาก window.ENV หากไม่มีให้ใช้ค่า Config หลักสำหรับ Client-side
window.ENV.SUPABASE_URL = window.ENV.SUPABASE_URL || "https://eusuehaqgwkcgowsgyco.supabase.co";
window.ENV.SUPABASE_ANON_KEY = window.ENV.SUPABASE_ANON_KEY || "sb_publishable_ww-mPdyom_i6S4XhfAFj9Q_vFBpTuaE";

var _supabase = null;

function initSupabaseConnection() {
    if (_supabase) return _supabase;
    if (window._supabase) {
        _supabase = window._supabase;
        return _supabase;
    }

    const url = window.ENV.SUPABASE_URL;
    const key = window.ENV.SUPABASE_ANON_KEY;

    if (typeof supabase !== 'undefined' && supabase && typeof supabase.createClient === 'function' && url && key) {
        try {
            _supabase = supabase.createClient(url, key);
            window._supabase = _supabase;
        } catch (e) {
            // Safe Catch Error handling
        }
    }
    return _supabase;
}

function getSupabaseClient() {
    if (typeof _supabase !== 'undefined' && _supabase) return _supabase;
    if (window._supabase) return window._supabase;
    return initSupabaseConnection();
}

// เริ่มต้นการเชื่อมต่อฐานข้อมูลทันทีเมื่อโหลดสคริปต์
document.addEventListener('DOMContentLoaded', () => {
    initSupabaseConnection();
});
initSupabaseConnection();