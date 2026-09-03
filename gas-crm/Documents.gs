/**
 * จัดเก็บเอกสาร (ใบเสนอราคา / PO / ใบส่งของ / ใบเสร็จ) เป็นไฟล์ใน Google Drive
 * โฟลเดอร์ทั้งหมดจะถูกสร้างอัตโนมัติชื่อ "CRM Spunky Food Documents"
 */

function getOrCreateDocsFolder() {
  var folderId = PROPS.getProperty('DOCS_FOLDER_ID');
  if (folderId) {
    try { return DriveApp.getFolderById(folderId); } catch (e) { /* fallthrough */ }
  }
  var it = DriveApp.getFoldersByName('CRM Spunky Food Documents');
  var folder = it.hasNext() ? it.next() : DriveApp.createFolder('CRM Spunky Food Documents');
  PROPS.setProperty('DOCS_FOLDER_ID', folder.getId());
  return folder;
}

/**
 * data: { CustomerID, DealID, DocType, DocNumber, IssueDate, ExpiryDate, DeliveryDate, Amount, Currency, Notes,
 *         fileBase64, fileName, mimeType }  (fileBase64/fileName/mimeType เป็น optional ถ้าไม่มีไฟล์แนบ)
 */
function uploadDocument(data) {
  var customer = getObjectById(SHEETS.CUSTOMERS, data.CustomerID);
  if (!customer) throw new Error('ไม่พบลูกค้า');
  if (!data.DocType) throw new Error('ต้องระบุประเภทเอกสาร');

  var fileUrl = '';
  var fileName = '';
  if (data.fileBase64 && data.fileName) {
    var folder = getOrCreateDocsFolder();
    var bytes = Utilities.base64Decode(data.fileBase64);
    var blob = Utilities.newBlob(bytes, data.mimeType || 'application/octet-stream', data.fileName);
    var file = folder.createFile(blob);
    fileUrl = file.getUrl();
    fileName = data.fileName;
  }

  var obj = {
    ID: Utilities.getUuid(),
    CustomerID: data.CustomerID,
    DealID: data.DealID || '',
    DocType: data.DocType,
    DocNumber: data.DocNumber || '',
    FileUrl: fileUrl,
    FileName: fileName,
    IssueDate: data.IssueDate || '',
    ExpiryDate: data.ExpiryDate || '',
    DeliveryDate: data.DeliveryDate || '',
    Amount: data.Amount ? Number(data.Amount) : '',
    Currency: data.Currency || 'THB',
    Notes: data.Notes || '',
    CreatedAt: nowIso(),
  };
  appendObject(getSheet(SHEETS.DOCUMENTS), obj);
  return obj;
}

function deleteDocument(id) {
  var doc = getObjectById(SHEETS.DOCUMENTS, id);
  if (doc && doc.FileUrl) {
    try {
      var idMatch = doc.FileUrl.match(/[-\w]{25,}/);
      if (idMatch) DriveApp.getFileById(idMatch[0]).setTrashed(true);
    } catch (e) { /* ไฟล์อาจถูกลบไปแล้ว ข้ามได้ */ }
  }
  return deleteObjectById(SHEETS.DOCUMENTS, id);
}
