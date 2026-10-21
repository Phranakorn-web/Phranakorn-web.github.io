// =========================================================================
// --- MODULE: NAVIGATION & ROUTER ENGINE (ROLE-BASED ACCESS CONTROL) ---
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

    // อัปเดตฝั่ง Dynamic Sidebar List (ถ้ามี)
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

    // 🟢 ตรวจสอบสิทธิ์ Admin: ถ้าไม่ใช่ Admin แต่พยายามเข้าหน้า Admin ให้ส่งกลับหน้าสต็อก
    const isAdmin = (typeof currentUser !== 'undefined' && currentUser && currentUser.role === 'admin');
    const adminOnlyViews = ['view-approvals', 'view-activities', 'view-settings'];

    if (adminOnlyViews.includes(targetView) && !isAdmin) {
        if (typeof showToast === 'function') {
            showToast("⚠️ คุณไม่มีสิทธิ์เข้าถึงหน้านี้ (เฉพาะ Admin เท่านั้น)", true);
        }
        targetView = 'view-inventory';
        localStorage.setItem('WMS_LAST_ACTIVE_VIEW', targetView);
        window.history.replaceState(null, '', window.location.pathname + '#view-inventory');
    }

    // 🟢 1. สลับการแสดงผล Section ซ่อนหน้าอื่นทั้งหมดทันที
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
        'view-inbound': { title: 'รับสินค้าเข้าคลัง (Fast)', icon: 'fa-arrow-down-to-bracket' },
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

    // 🟢 4. เรียกฟังก์ชันโหลดข้อมูลเฉพาะหน้านั้นๆ
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
    const isAdmin = (typeof currentUser !== 'undefined' && currentUser && currentUser.role === 'admin');

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
}

window.switchView = switchView;
window.executeSwitchView = executeSwitchView;
window.updateActiveMenuHighlight = updateActiveMenuHighlight;
window.renderSidebarMenu = renderSidebarMenu;
window.navigateToApprovalCenter = navigateToApprovalCenter;
window.getCurrentActiveView = getCurrentActiveView;

document.addEventListener('DOMContentLoaded', initNavigationEngine);