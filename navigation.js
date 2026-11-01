// =========================================================================
// --- MODULE: NAVIGATION & ROUTER ENGINE (REAL-TIME AUTO-REFRESH) ---
// =========================================================================

// 🟢 ฟังก์ชันดึง View ปัจจุบันที่ถูกต้องที่สุด (เรียงลำดับ: Hash -> localStorage -> Default)
function getCurrentActiveView() {
    let hash = window.location.hash.replace('#', '').split('?')[0].trim();
    if (hash && hash.startsWith('view-')) {
        return hash;
    }
    const savedView = localStorage.getItem('WMS_LAST_ACTIVE_VIEW');
    if (savedView && savedView.startsWith('view-')) {
        return savedView;
    }
    return 'view-inventory';
}

function updateActiveMenuHighlight(targetView) {
    if (!targetView) return;
    const cleanTarget = targetView.replace(/^#/, '').split('?')[0].trim();

    // อัปเดตฝั่ง Sidebar Menu Category (HTML Hardcoded Links)
    document.querySelectorAll('.menu-category a, .menu-item-btn').forEach(el => {
        const view = el.getAttribute('data-view');
        if (view === cleanTarget) {
            el.classList.add('active');
        } else {
            el.classList.remove('active');
        }
    });

    // อัปเดตฝั่ง Dynamic Sidebar List
    const menuContainers = document.querySelectorAll('#sidebarMenuList, .sidebar-menu, .sidebar-nav');
    menuContainers.forEach(container => {
        const targets = container.querySelectorAll('button, a, .menu-item');
        targets.forEach(el => {
            const dataView = el.getAttribute('data-view') || '';
            if (dataView === cleanTarget) {
                el.classList.add('active');
                const parentLi = el.closest('.menu-item') || el.closest('li');
                if (parentLi) parentLi.classList.add('active');
            } else {
                el.classList.remove('active');
                const parentLi = el.closest('.menu-item') || el.closest('li');
                if (parentLi) parentLi.classList.remove('active');
            }
        });
    });
}

function switchView(viewId) {
    let targetView = (viewId || getCurrentActiveView()).replace(/^#/, '').split('?')[0].trim();
    
    // บันทึกค่าลงใน localStorage และ URL Hash ทันที
    localStorage.setItem('WMS_LAST_ACTIVE_VIEW', targetView);

    const cleanPath = window.location.pathname + `#${targetView}`;
    if (window.location.hash !== `#${targetView}`) {
        window.history.replaceState(null, '', cleanPath);
    }

    executeSwitchView(targetView);

    // ปิด Mobile Sidebar อัตโนมัติเมื่อเลือกเมนูบนมือถือ
    if (window.innerWidth <= 768) {
        closeMobileSidebar();
    }
}

async function executeSwitchView(viewId) {
    const validViews = [
        'view-inventory', 
        'view-inbound', 
        'view-outbound', 
        'view-locations', 
        'view-approvals', 
        'view-activities', 
        'view-settings'
    ];

    let targetView = (viewId || getCurrentActiveView()).replace(/^#/, '').split('?')[0].trim();

    if (!targetView || !validViews.includes(targetView)) {
        targetView = 'view-inventory';
    }

    // 🟢 ตรวจสอบสิทธิ์ผู้ใช้จาก Cache Session เพื่อป้องกันการดีดสลับหน้าขณะรอ DB
    let activeUser = (typeof currentUser !== 'undefined' && currentUser) ? currentUser : null;
    if (!activeUser) {
        try {
            const sessionStr = sessionStorage.getItem('WMS_CURRENT_USER') || localStorage.getItem('WMS_CURRENT_USER');
            if (sessionStr) activeUser = JSON.parse(sessionStr);
        } catch (e) {}
    }

    const isAdmin = activeUser && activeUser.role === 'admin';
    const adminOnlyViews = ['view-approvals', 'view-activities', 'view-settings'];

    if (adminOnlyViews.includes(targetView) && activeUser && !isAdmin) {
        if (typeof showToast === 'function') {
            showToast("⚠️ คุณไม่มีสิทธิ์เข้าถึงหน้านี้ (เฉพาะ Admin เท่านั้น)", true);
        }
        targetView = 'view-inventory';
        localStorage.setItem('WMS_LAST_ACTIVE_VIEW', targetView);
        window.history.replaceState(null, '', window.location.pathname + '#view-inventory');
    }

    // 🟢 1. สลับการแสดงผล Section แสดงผลทันที ไม่แสดงหน้าขาว
    document.querySelectorAll('.view-section').forEach(sec => {
        if (sec.id === targetView) {
            sec.classList.add('active');
            sec.style.display = 'block';
            sec.style.opacity = '1';
        } else {
            sec.classList.remove('active');
            sec.style.display = 'none';
            sec.style.opacity = '0';
        }
    });

    // 🟢 2. อัปเดตแถบไฮไลท์ Sidebar
    updateActiveMenuHighlight(targetView);

    // 🟢 3. อัปเดต Header Title
    const pageTitleMap = {
        'view-inventory': { title: 'เช็คสต็อกคลังสินค้า', icon: 'fa-boxes-stacked' },
        'view-inbound': { title: 'รับสินค้าเข้าคลัง (Fast)', icon: 'fa-arrow-right-to-bracket' },
        'view-outbound': { title: 'จ่ายสินค้าออกจากคลัง (Outbound Work Order)', icon: 'fa-truck-arrow-right' },
        'view-locations': { title: 'ผังตำแหน่งคลังสินค้า (Drill-Down)', icon: 'fa-map-location-dot' },
        'view-approvals': { title: 'ศูนย์อนุมัติคำขอ (Approvals)', icon: 'fa-clipboard-check' },
        'view-activities': { title: 'ดูประวัติการใช้งาน (User Logs)', icon: 'fa-clock-rotate-left' },
        'view-settings': { title: 'ตั้งค่าพิกัดคลังสินค้า', icon: 'fa-gears' }
    };

    const headerTitleElem = document.getElementById('mainHeaderTitle') || document.querySelector('.main-header h2');
    if (headerTitleElem && pageTitleMap[targetView]) {
        const info = pageTitleMap[targetView];
        headerTitleElem.innerHTML = `<i class="fa-solid ${info.icon}" style="color:var(--primary);"></i> ${info.title}`;
    }

    // 🟢 4. โหลดข้อมูลเฉพาะหน้าแบบ Instant Render
    if (targetView === 'view-inventory') {
        if (typeof filterInventoryData === 'function') filterInventoryData();
        if (typeof updateKPIs === 'function') updateKPIs();
    } else if (targetView === 'view-locations') {
        if (typeof renderDrillDownAisleBar === 'function') renderDrillDownAisleBar();
        if (typeof renderDrillDownBaysGrid === 'function') renderDrillDownBaysGrid();
        if (typeof renderDrillDownSlotsGrid === 'function') renderDrillDownSlotsGrid();
    } else if (targetView === 'view-approvals') {
        if (typeof loadPendingApprovalsFromDB === 'function') loadPendingApprovalsFromDB();
    } else if (targetView === 'view-activities') {
        if (typeof loadUserActivityLogsFromDB === 'function') loadUserActivityLogsFromDB();
    } else if (targetView === 'view-settings') {
        if (typeof renderAisleSettingsTable === 'function') renderAisleSettingsTable();
        if (typeof renderUserManagementTable === 'function') renderUserManagementTable();
        if (typeof renderMenuDatabaseMappingTable === 'function') renderMenuDatabaseMappingTable();
    }
}

function renderSidebarMenu() {
    let activeUser = (typeof currentUser !== 'undefined' && currentUser) ? currentUser : null;
    if (!activeUser) {
        try {
            const sessionStr = sessionStorage.getItem('WMS_CURRENT_USER') || localStorage.getItem('WMS_CURRENT_USER');
            if (sessionStr) activeUser = JSON.parse(sessionStr);
        } catch (e) {}
    }
    const isAdmin = activeUser && activeUser.role === 'admin';

    const adminCategoryElem = document.getElementById('cat-admin');
    if (adminCategoryElem) {
        adminCategoryElem.style.display = isAdmin ? 'block' : 'none';
    }

    const activeView = getCurrentActiveView();
    updateActiveMenuHighlight(activeView);
}

function navigateToApprovalCenter() {
    if (typeof isUserLoggedIn === 'function' && !isUserLoggedIn()) return;
    if (typeof isCurrentUserAdmin === 'function' && !isCurrentUserAdmin()) return;
    
    switchView('view-approvals');
    if (typeof loadPendingApprovalsFromDB === 'function') loadPendingApprovalsFromDB();
}

// 📱 MOBILE SIDEBAR CONTROLLER
function toggleMobileSidebar() {
    const sidebar = document.getElementById('menu');
    const overlay = document.getElementById('sidebarOverlay');
    if (sidebar) sidebar.classList.toggle('mobile-open');
    if (overlay) overlay.classList.toggle('active');
}

function closeMobileSidebar() {
    const sidebar = document.getElementById('menu');
    const overlay = document.getElementById('sidebarOverlay');
    if (sidebar) sidebar.classList.remove('mobile-open');
    if (overlay) overlay.classList.remove('active');
}

// 🟢 AUTO REAL-TIME REFRESH HELPER: รีเฟรชหน้าและตารางข้อมูลอัตโนมัติทันทีทุกครั้งที่มี Action
function autoRefreshActiveView() {
    const activeView = getCurrentActiveView();
    if (typeof filterInventoryData === 'function') filterInventoryData();
    if (typeof updateKPIs === 'function') updateKPIs();
    if (typeof executeSwitchView === 'function') executeSwitchView(activeView);
}

function initNavigationEngine() {
    document.addEventListener('click', (e) => {
        const btn = e.target.closest('#sidebarMenuList button, .sidebar button, .menu-item button, .menu-item-btn, [data-view]');
        if (btn) {
            const targetView = btn.getAttribute('data-view') || '';
            if (targetView && targetView.startsWith('view-')) {
                e.preventDefault();
                switchView(targetView);
            }
        }
    });

    window.addEventListener('popstate', () => {
        executeSwitchView(getCurrentActiveView());
    });

    window.addEventListener('hashchange', () => {
        executeSwitchView(getCurrentActiveView());
    });

    // 🟢 สลับหน้าทันทีตั้งแต่สคริปต์ทำงาน เพื่อป้องกันหน้าจอขาวช่วงแรก
    const initialView = getCurrentActiveView();
    executeSwitchView(initialView);
}

window.switchView = switchView;
window.executeSwitchView = executeSwitchView;
window.updateActiveMenuHighlight = updateActiveMenuHighlight;
window.renderSidebarMenu = renderSidebarMenu;
window.navigateToApprovalCenter = navigateToApprovalCenter;
window.getCurrentActiveView = getCurrentActiveView;
window.toggleMobileSidebar = toggleMobileSidebar;
window.closeMobileSidebar = closeMobileSidebar;
window.autoRefreshActiveView = autoRefreshActiveView;

document.addEventListener('DOMContentLoaded', initNavigationEngine);