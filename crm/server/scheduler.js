const cron = require('node-cron');
const { generateAndSendDailyReport } = require('./services/dailyReport');
const { syncSkuSheet } = require('./services/googleSheetsSync');

function startScheduler() {
  const reportCron = process.env.DAILY_REPORT_CRON || '0 8 * * *';
  cron.schedule(reportCron, () => {
    console.log('[scheduler] กำลังสร้างและส่งรายงานประจำวัน...');
    generateAndSendDailyReport().catch((err) => console.error('[scheduler] ส่งรายงานล้มเหลว:', err.message));
  });

  const skuCron = process.env.SKU_SYNC_CRON || '0 6 * * *';
  cron.schedule(skuCron, () => {
    console.log('[scheduler] กำลังซิงก์ข้อมูลสินค้าจาก Google Sheet...');
    syncSkuSheet().catch((err) => console.error('[scheduler] ซิงก์ SKU ล้มเหลว:', err.message));
  });

  console.log(`[scheduler] ตั้งเวลา: รายงานประจำวัน (${reportCron}), ซิงก์ SKU (${skuCron})`);
}

module.exports = { startScheduler };
