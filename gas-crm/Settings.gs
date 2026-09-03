/**
 * หน้าตั้งค่า - เก็บค่าต่าง ๆ ไว้ใน Script Properties (ไม่ต้องเข้าไปแก้โค้ด)
 */

var SETTINGS_KEYS = [
  'LINE_CHANNEL_ACCESS_TOKEN', 'LINE_GROUP_ID',
  'ANTHROPIC_API_KEY', 'ANTHROPIC_MODEL',
  'SKU_SHEET_ID', 'SKU_SHEET_TAB',
  'AD_LIST_TAB', 'PAYMENT_LIST_TAB', 'CAMPAIGN_LIST_TAB', 'CUSTOMER_TYPE_LIST_TAB',
  'REVENUE_SHEET_ID', 'REVENUE_SHEET_TAB',
  'QUOTATION_EXPIRY_WARN_DAYS', 'DELIVERY_WARN_DAYS',
  'LOGO_FILE_ID',
];

function getSettings() {
  var out = {};
  SETTINGS_KEYS.forEach(function (k) { out[k] = PROPS.getProperty(k) || ''; });
  out.spreadsheetUrl = getOrCreateSpreadsheet().getUrl();
  out.triggers = getTriggerStatuses();
  return out;
}

function saveSettings(settings) {
  SETTINGS_KEYS.forEach(function (k) {
    if (settings.hasOwnProperty(k)) PROPS.setProperty(k, String(settings[k] || ''));
  });
  return getSettings();
}
