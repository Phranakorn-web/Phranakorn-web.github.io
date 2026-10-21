// =========================================================================
// --- MODULE: SHARED UTILITIES, AUDIO & TOAST ENGINE ---
// =========================================================================

/**
 * ป้องกัน XSS Vulnerabilities
 */
function escapeHTML(str) {
    if (str === null || str === undefined) return '';
    return String(str)
        .replace(/&/g, '&amp;')
        .replace(/</g, '&lt;')
        .replace(/>/g, '&gt;')
        .replace(/"/g, '&quot;')
        .replace(/'/g, '&#039;');
}

/**
 * เรียกใช้ Supabase Instance ส่วนกลาง
 */
function getSupabaseClient() {
    if (typeof _supabase !== 'undefined' && _supabase) return _supabase;
    if (typeof window !== 'undefined' && window.ENV && window.ENV.SUPABASE_CLIENT) return window.ENV.SUPABASE_CLIENT;
    return null;
}

/**
 * แสดงข้อความ Toast แจ้งเตือน
 */
function showToast(msg, isError = false) {
    const toast = document.getElementById('toastAlert');
    if (!toast) return;
    const msgElem = document.getElementById('toastMessage');
    if (msgElem) msgElem.textContent = msg;
    
    if (isError) toast.classList.add('error');
    else toast.classList.remove('error');
    
    toast.classList.add('show');
    setTimeout(() => toast.classList.remove('show'), 3500);
}

/**
 * ระบบเสียงเอฟเฟกต์
 */
const audioCtx = new (window.AudioContext || window.webkitAudioContext)();

function playSuccessSound() {
    try {
        if (audioCtx.state === 'suspended') audioCtx.resume();
        const now = audioCtx.currentTime;
        const osc1 = audioCtx.createOscillator();
        const gain1 = audioCtx.createGain();
        osc1.type = 'sine';
        osc1.frequency.setValueAtTime(1760, now);
        gain1.gain.setValueAtTime(0.3, now);
        gain1.gain.exponentialRampToValueAtTime(0.01, now + 0.1);
        osc1.connect(gain1);
        gain1.connect(audioCtx.destination);
        osc1.start(now);
        osc1.stop(now + 0.1);
    } catch (e) {}
}

function playErrorSound() {
    try {
        if (audioCtx.state === 'suspended') audioCtx.resume();
        const now = audioCtx.currentTime;
        const osc = audioCtx.createOscillator();
        const gain = audioCtx.createGain();
        osc.type = 'sawtooth';
        osc.frequency.setValueAtTime(220, now);
        gain.gain.setValueAtTime(0.4, now);
        gain.gain.exponentialRampToValueAtTime(0.01, now + 0.3);
        osc.connect(gain);
        gain.connect(audioCtx.destination);
        osc.start(now);
        osc.stop(now + 0.3);
    } catch (e) {}
}

let isVoiceAlertEnabled = true;

function toggleVoiceAudioAlert() {
    isVoiceAlertEnabled = !isVoiceAlertEnabled;
    const btn = document.getElementById('voiceToggleBtn');
    if (isVoiceAlertEnabled) {
        if (btn) btn.innerHTML = `<i class="fa-solid fa-volume-high" style="color:var(--success);"></i> AI Voice On`;
        speakThaiText("เปิดระบบเสียงอ่านตอบรับเรียบร้อยค่ะ");
    } else {
        if (btn) btn.innerHTML = `<i class="fa-solid fa-volume-xmark" style="color:var(--danger);"></i> AI Voice Off`;
    }
}

function speakThaiText(text) {
    if (!isVoiceAlertEnabled || !('speechSynthesis' in window)) return;
    try {
        window.speechSynthesis.cancel();
        const utterance = new SpeechSynthesisUtterance(text);
        utterance.lang = 'th-TH';
        utterance.rate = 1.05;
        utterance.pitch = 1.0;
        window.speechSynthesis.speak(utterance);
    } catch(e) {}
}

/**
 * คัดลอกข้อความไปยัง Clipboard
 */
function copyTextToClipboard(text, label = 'ข้อความ') {
    if (!text) return;
    if (navigator.clipboard && window.isSecureContext) {
        navigator.clipboard.writeText(text).then(() => {
            showToast(`📋 คัดลอก ${label} (${text}) เรียบร้อยแล้ว`);
        }).catch(() => {});
    } else {
        const textArea = document.createElement("textarea");
        textArea.value = text;
        document.body.appendChild(textArea);
        textArea.select();
        try {
            document.execCommand('copy');
            showToast(`📋 คัดลอก ${label} (${text}) เรียบร้อยแล้ว`);
        } catch (err) {}
        document.body.removeChild(textArea);
    }
}

function formatLocationCode(loc) {
    if (!loc) return 'DOCK';
    return loc.toUpperCase();
}

// Global Export
window.escapeHTML = escapeHTML;
window.getSupabaseClient = getSupabaseClient;
window.showToast = showToast;
window.playSuccessSound = playSuccessSound;
window.playErrorSound = playErrorSound;
window.speakThaiText = speakThaiText;
window.toggleVoiceAudioAlert = toggleVoiceAudioAlert;
window.copyTextToClipboard = copyTextToClipboard;
window.formatLocationCode = formatLocationCode;