/**
 * ตัวกลางเรียกฟังก์ชันฝั่งเซิร์ฟเวอร์จากหน้าเว็บ (Index.html)
 * หน้าเว็บเรียกผ่าน apiCall('ชื่อฟังก์ชัน', [อาร์กิวเมนต์]) เพียงจุดเดียว เพื่อให้โค้ดฝั่ง client เรียบง่าย
 */
function apiCall(name, args) {
  var API_FUNCTIONS = {
    getMeta: getMeta,
    listCustomers: listCustomers,
    createCustomer: createCustomer,
    updateCustomer: updateCustomer,
    updateCustomerStatus: updateCustomerStatus,
    deleteCustomer: deleteCustomer,
    getCustomerDetail: getCustomerDetail,
    createDeal: createDeal,
    updateDeal: updateDeal,
    deleteDeal: deleteDeal,
    createFollowup: createFollowup,
    updateFollowup: updateFollowup,
    deleteFollowup: deleteFollowup,
    uploadDocument: uploadDocument,
    deleteDocument: deleteDocument,
    getDashboard: getDashboard,
    sendDailyReportNow: sendDailyReportNow,
    installDailyTrigger: installDailyTrigger,
    removeDailyTrigger: removeDailyTrigger,
    installWeeklyTrigger: installWeeklyTrigger,
    removeWeeklyTrigger: removeWeeklyTrigger,
    installMonthlyTrigger: installMonthlyTrigger,
    removeMonthlyTrigger: removeMonthlyTrigger,
    analyzeCustomerAI: analyzeCustomerAI,
    analyzeAllOpenCustomers: analyzeAllOpenCustomers,
    getSkus: getSkus,
    testExportDealToRevenue: testExportDealToRevenue,
    testMasterDataConnection: testMasterDataConnection,
    testLogoConnection: testLogoConnection,
    previewDailyReport: previewDailyReport,
    getAdOptions: getAdOptions,
    getPaymentOptions: getPaymentOptions,
    closeDealWon: closeDealWon,
    getSettings: getSettings,
    saveSettings: saveSettings,
  };
  var fn = API_FUNCTIONS[name];
  if (!fn) throw new Error('ไม่พบฟังก์ชัน: ' + name);
  return fn.apply(null, args || []);
}
