require('dotenv').config({ path: require('path').join(__dirname, '..', '.env') });
const { syncSkuSheet } = require('../server/services/googleSheetsSync');

syncSkuSheet()
  .then((skus) => {
    console.log(`ซิงก์ข้อมูลสินค้าสำเร็จ: ${skus.length} รายการ`);
    process.exit(0);
  })
  .catch((err) => {
    console.error('ซิงก์ข้อมูลสินค้าล้มเหลว:', err.message);
    process.exit(1);
  });
