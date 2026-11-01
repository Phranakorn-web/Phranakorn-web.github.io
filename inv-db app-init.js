// =========================================================================
// 📌 [ส่วนที่ 7] WMS SUMMARY KPIS, GLOBAL EXPORTS & AUTO-INITIALIZER
// =========================================================================

// -------------------------------------------------------------------------
// 📊 สรุปสถิติ KPI คลังสินค้า (Real-time SKU & Inventory Sync)
// -------------------------------------------------------------------------
function updateKPIs() {
    const totalCount = globalInventoryData.length;

    const kpiTotal = document.getElementById('kpiTotalItems');
    if (kpiTotal) kpiTotal.textContent = totalCount.toLocaleString();

    const uniqueInventorySkus = new Set(
        globalInventoryData.map(i => (i.category || i.sku || '').trim()).filter(Boolean)
    ).size;
    
    const totalMasterSkus = globalMasterProducts.length;

    const displaySkuText = totalMasterSkus > 0 
        ? `${uniqueInventorySkus.toLocaleString()} / ${totalMasterSkus.toLocaleString()} SKU` 
        : `${uniqueInventorySkus.toLocaleString()} SKU`;

    const targetElemIds = ['kpiTotalModels', 'masterSkuStat', 'totalSkuBadge', 'inboundMasterProductsStatBadge'];
    targetElemIds.forEach(id => {
        const el = document.getElementById(id);
        if (el) el.textContent = displaySkuText;
    });

    const dockItems = globalInventoryData.filter(i => (i.location || '').toUpperCase() === 'DOCK').length;
    const kpiDock = document.getElementById('kpiDockItems');
    if (kpiDock) kpiDock.textContent = dockItems.toLocaleString();

    let consumableCount = 0;
    let spareCount = 0;
    let generalCount = 0;

    globalInventoryData.forEach(item => {
        const meta = resolveProductMetaData(item.category, item.name, item);
        const typeStr = (meta.itemType || '').toLowerCase();
        if (typeStr.includes('วัสดุ') || typeStr.includes('consumable') || typeStr.includes('ink')) consumableCount++;
        else if (typeStr.includes('อะไหล่') || typeStr.includes('spare') || typeStr.includes('gear')) spareCount++;
        else generalCount++;
    });

    const elConsumables = document.getElementById('kpiTotalConsumables');
    if (elConsumables) elConsumables.textContent = consumableCount.toLocaleString();

    const elSpares = document.getElementById('kpiTotalSpareParts');
    if (elSpares) elSpares.textContent = spareCount.toLocaleString();

    const elGeneral = document.getElementById('kpiTotalGeneralProducts');
    if (elGeneral) elGeneral.textContent = generalCount.toLocaleString();
}

// -------------------------------------------------------------------------
// 🔄 ระบบจำและคงหน้าเมนูเดิมไว้โดยไม่ต้องสลับหน้าไปมา (SPA View Persistence)
// -------------------------------------------------------------------------
function saveActiveWmsView(sectionId) {
    if (!sectionId) return;
    try {
        localStorage.setItem('WMS_ACTIVE_SECTION_ID', sectionId);
    } catch(e) {}
}

function restoreActiveWmsView() {
    try {
        const savedSectionId = localStorage.getItem('WMS_ACTIVE_SECTION_ID');
        if (savedSectionId) {
            const targetSection = document.getElementById(savedSectionId);
            if (targetSection) {
                document.querySelectorAll('.view-section').forEach(sec => sec.classList.remove('active'));
                targetSection.classList.add('active');

                document.querySelectorAll('.menu-category ul li a, .menu-item button').forEach(btn => {
                    const btnTarget = btn.getAttribute('onclick') || '';
                    if (btnTarget.includes(savedSectionId)) {
                        btn.classList.add('active');
                    } else {
                        btn.classList.remove('active');
                    }
                });
            }
        }
    } catch(e) {}
}

// -------------------------------------------------------------------------
// 🌐 GLOBAL WINDOW EXPORTS
// -------------------------------------------------------------------------
window.normalizeLoc = normalizeLoc;
window.formatLocationCode = formatLocationCode;
window.notifyWmsDataChanged = notifyWmsDataChanged;
window.setupRealtimeSubscription = setupRealtimeSubscription;
window.logAuditAction = logAuditAction;
window.exportAuditLogsToCSV = exportAuditLogsToCSV;
window.playActionFeedbackSound = playActionFeedbackSound;
window.discoverAllDatabaseAisles = discoverAllDatabaseAisles;
window.updateDBConnectionStatus = updateDBConnectionStatus;
window.copyTextToClipboard = copyTextToClipboard;
window.copyAllSerialsInCurrentGroup = copyAllSerialsInCurrentGroup;
window.formatReceiverFullName = formatReceiverFullName;
window.getCurrentReceiverName = getCurrentReceiverName;
window.getCurrentUserRole = getCurrentUserRole;
window.toggleStockViewMode = toggleStockViewMode;
window.toggleGroupSelection = toggleGroupSelection;
window.toggleSelectAllGroups = toggleSelectAllGroups;
window.clearAllSelections = clearAllSelections;
window.populateStockFilterDropdowns = populateStockFilterDropdowns;
window.onAisleFilterChange = onAisleFilterChange;
window.openStockDetailModal = openStockDetailModal;
window.closeStockDetailModal = closeStockDetailModal;
window.filterStockDetailModalItems = filterStockDetailModalItems;
window.toggleModalSelectAllItems = toggleModalSelectAllItems;
window.openEditItemModal = openEditItemModal;
window.closeEditItemModal = closeEditItemModal;
window.saveEditedItemData = saveEditedItemData;
window.requestRelocateModal = requestRelocateModal;
window.closeRelocateModal = closeRelocateModal;
window.populateRelocateAisleDropdown = populateRelocateAisleDropdown;
window.updateRelocateLocPreviewFromSelects = updateRelocateLocPreviewFromSelects;
window.updateRelocateSlotOptionsWithStatus = updateRelocateSlotOptionsWithStatus;
window.updateRelocateCustomLocOnly = updateRelocateCustomLocOnly;
window.findFirstAvailableSlotInAisleBay = findFirstAvailableSlotInAisleBay;
window.executeSingleRelocate = executeSingleRelocate;
window.requestBatchRelocateModal = requestBatchRelocateModal;
window.closeBatchRelocateModal = closeBatchRelocateModal;
window.updateBatchRelocateCapacityPreview = updateBatchRelocateCapacityPreview;
window.executeBatchRelocateFromModal = executeBatchRelocateFromModal;
window.executeBatchRelocate = executeBatchRelocate;
window.relocateSelectedFromModal = relocateSelectedFromModal;
window.ensureDeleteConfirmModalExists = ensureDeleteConfirmModalExists;
window.requestDeleteModal = requestDeleteModal;
window.closeDeleteConfirmModal = closeDeleteConfirmModal;
window.executeDeleteActionWithMode = executeDeleteActionWithMode;
window.executeDeleteAction = executeDeleteAction;
window.approveDeleteRequest = approveDeleteRequest;
window.rejectDeleteRequest = rejectDeleteRequest;
window.deleteSelectedFromModal = deleteSelectedFromModal;
window.openPrintBarcodeModal = openPrintBarcodeModal;
window.executeBarcodePrintProcess = executeBarcodePrintProcess;
window.closePrintConfigModal = closePrintConfigModal;
window.printSelectedBarcodesFromModal = printSelectedBarcodesFromModal;
window.openExcelExportModal = openExcelExportModal;
window.closeExcelExportModal = closeExcelExportModal;
window.onExportScopeChange = onExportScopeChange;
window.onExportAisleChange = onExportAisleChange;
window.executeExcelExport = executeExcelExport;
window.exportExcelFromModal = exportExcelFromModal;
window.loadDataFromDatabase = loadDataFromDatabase;
window.renderInventoryTable = renderInventoryTable;
window.filterInventoryData = filterInventoryData;
window.updateKPIs = updateKPIs;
window.updateSelectedCountUI = updateSelectedCountUI;
window.toggleSelectAllVisibleItems = toggleSelectAllVisibleItems;
window.toggleItemSelection = toggleItemSelection;
window.calculateBatchRelocateTargetCoordinates = calculateBatchRelocateTargetCoordinates;
window.showTableLoadingState = showTableLoadingState;
window.saveActiveWmsView = saveActiveWmsView;
window.restoreActiveWmsView = restoreActiveWmsView;

// -------------------------------------------------------------------------
// 🚀 AUTO-INITIALIZATION ENGINE
// -------------------------------------------------------------------------
if (typeof document !== 'undefined') {
    const initInventoryEngine = () => {
        restoreActiveWmsView();
        if (document.getElementById('inventoryTableBody')) {
            loadDataFromDatabase();
        }
    };
    if (document.readyState === 'loading') {
        document.addEventListener('DOMContentLoaded', initInventoryEngine);
    } else {
        setTimeout(initInventoryEngine, 100);
    }
}