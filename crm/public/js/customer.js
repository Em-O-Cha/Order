document.getElementById('nav').innerHTML = renderNav('customers.html');

const params = new URLSearchParams(location.search);
const customerId = params.get('id');
let meta, customer;

function countryLabel(code) {
  const c = (meta.countries || []).find((x) => x.code === code);
  return c ? `${c.th} (${c.en})` : (code || '-');
}

function renderHeader() {
  const el = document.getElementById('customerHeader');
  const displayName = customer.type === 'company' ? (customer.companyName || customer.name) : customer.name;
  el.innerHTML = `
    <div style="display:flex;justify-content:space-between;flex-wrap:wrap;gap:10px;">
      <div>
        <h2 style="font-size:20px">${escapeHtml(displayName)}</h2>
        <div class="muted" style="margin-top:6px">
          <span class="badge type-${customer.type}">${customer.type === 'company' ? 'บริษัท' : 'บุคคลธรรมดา'}</span>
          &nbsp; ประเทศ: ${countryLabel(customer.country)} &nbsp;|&nbsp; ช่องทาง: ${escapeHtml(customer.contactChannel || '-')}
        </div>
        <div class="muted" style="margin-top:4px">
          ${customer.contactPerson ? `ผู้ติดต่อ: ${escapeHtml(customer.contactPerson)} | ` : ''}
          โทร: ${escapeHtml(customer.phone || '-')} | อีเมล: ${escapeHtml(customer.email || '-')} | Line: ${escapeHtml(customer.lineId || '-')}
        </div>
      </div>
    </div>
    ${customer.notes ? `<div class="muted" style="margin-top:10px">หมายเหตุ: ${escapeHtml(customer.notes)}</div>` : ''}
  `;
}

function renderDeals() {
  const el = document.getElementById('dealsList');
  if (!customer.deals.length) { el.innerHTML = '<div class="empty-state">ยังไม่มีดีล</div>'; return; }
  el.innerHTML = customer.deals.map((d) => `
    <div class="doc-item">
      <div style="display:flex;justify-content:space-between;flex-wrap:wrap;gap:8px;">
        <b>${escapeHtml(d.title)}</b>
        <span class="badge stage-${d.stage}">${stageLabel(d.stage, meta.dealStages)}</span>
      </div>
      <div class="muted" style="margin-top:6px">
        สินค้าที่สนใจ: ${escapeHtml(d.productInterest || '-')} | มูลค่า: ${fmtMoney(d.estimatedValue)} ${escapeHtml(d.currency)}
        | คาดปิดดีล: ${fmtDate(d.expectedCloseDate)} | วันจัดส่ง: ${fmtDate(d.deliveryDate)}
      </div>
      <div style="margin-top:8px;display:flex;gap:8px;">
        <select data-deal-status="${d.id}" class="statusSelect">
          <option value="open" ${d.status === 'open' ? 'selected' : ''}>เปิดอยู่</option>
          <option value="won" ${d.status === 'won' ? 'selected' : ''}>ปิดสำเร็จ</option>
          <option value="lost" ${d.status === 'lost' ? 'selected' : ''}>ปิดไม่สำเร็จ</option>
        </select>
        <button class="btn sm danger outline" data-del-deal="${d.id}">ลบ</button>
      </div>
    </div>`).join('');

  el.querySelectorAll('.statusSelect').forEach((sel) => {
    sel.addEventListener('change', async () => {
      await API.put(`/api/customers/deals/${sel.dataset.dealStatus}`, { status: sel.value });
      toast('อัปเดตสถานะดีลแล้ว');
      await reload();
    });
  });
  el.querySelectorAll('[data-del-deal]').forEach((btn) => {
    btn.addEventListener('click', async () => {
      if (!confirm('ลบดีลนี้?')) return;
      await API.del(`/api/customers/deals/${btn.dataset.delDeal}`);
      await reload();
    });
  });
}

function docTypeLabel(t) {
  const found = (meta.documentTypes || []).find((d) => d.value === t);
  return found ? found.label : t;
}

function renderDocs() {
  const el = document.getElementById('docsList');
  if (!customer.documents.length) { el.innerHTML = '<div class="empty-state">ยังไม่มีเอกสาร</div>'; return; }
  el.innerHTML = customer.documents.map((d) => `
    <div class="doc-item">
      <div style="display:flex;justify-content:space-between;flex-wrap:wrap;gap:8px;">
        <b>${docTypeLabel(d.docType)} ${d.docNumber ? '#' + escapeHtml(d.docNumber) : ''}</b>
        <button class="btn sm danger outline" data-del-doc="${d.id}">ลบ</button>
      </div>
      <div class="muted" style="margin-top:6px">
        วันที่ออก: ${fmtDate(d.issueDate)} ${d.expiryDate ? `| หมดอายุ: ${fmtDate(d.expiryDate)}` : ''}
        ${d.deliveryDate ? `| วันจัดส่ง: ${fmtDate(d.deliveryDate)}` : ''}
        ${d.amount ? `| มูลค่า: ${fmtMoney(d.amount)} ${escapeHtml(d.currency)}` : ''}
      </div>
      ${d.filePath ? `<a href="${d.filePath}" target="_blank">📎 ${escapeHtml(d.fileName || 'เปิดไฟล์')}</a>` : ''}
    </div>`).join('');

  el.querySelectorAll('[data-del-doc]').forEach((btn) => {
    btn.addEventListener('click', async () => {
      if (!confirm('ลบเอกสารนี้?')) return;
      await API.del(`/api/documents/${btn.dataset.delDoc}`);
      await reload();
    });
  });
}

function followupTypeLabel(t) {
  const found = (meta.followupTypes || []).find((f) => f.value === t);
  return found ? found.label : t;
}

function renderFollowups() {
  const el = document.getElementById('followupsList');
  if (!customer.followups.length) { el.innerHTML = '<div class="empty-state">ยังไม่มีประวัติการติดตาม</div>'; return; }
  const sorted = [...customer.followups].sort((a, b) => (b.followUpDate || '').localeCompare(a.followUpDate || ''));
  el.innerHTML = sorted.map((f) => `
    <div class="followup-item">
      <div style="display:flex;justify-content:space-between;flex-wrap:wrap;gap:8px;">
        <b>${followupTypeLabel(f.type)}</b>
        <label class="muted"><input type="checkbox" data-done="${f.id}" ${f.done ? 'checked' : ''}> เสร็จแล้ว</label>
      </div>
      <div style="margin-top:4px">${escapeHtml(f.note || '')}</div>
      <div class="muted" style="margin-top:4px">นัดติดตาม: ${fmtDate(f.followUpDate)}</div>
    </div>`).join('');

  el.querySelectorAll('[data-done]').forEach((cb) => {
    cb.addEventListener('change', async () => {
      await API.put(`/api/customers/followups/${cb.dataset.done}`, { done: cb.checked });
      await reload();
    });
  });
}

function renderAi() {
  const el = document.getElementById('aiList');
  if (!customer.insights.length) { el.innerHTML = '<div class="empty-state">ยังไม่มีผลวิเคราะห์ AI - กดปุ่มด้านบนเพื่อวิเคราะห์</div>'; return; }
  el.innerHTML = customer.insights.map((i) => `
    <div class="insight-item">
      <div class="muted">${new Date(i.createdAt).toLocaleString('th-TH')} ${i.riskLevel ? `| ความเสี่ยง: ${escapeHtml(i.riskLevel)}` : ''}</div>
      <div style="margin-top:6px"><b>แนวทางการนำเสนอ:</b> ${escapeHtml(i.approach || '-')}</div>
      ${i.recommendedProducts && i.recommendedProducts.length ? `<div style="margin-top:6px"><b>สินค้าที่ควรเสนอ:</b> ${i.recommendedProducts.map(escapeHtml).join(', ')}</div>` : ''}
      ${i.nextAction ? `<div style="margin-top:6px"><b>ขั้นตอนถัดไป:</b> ${escapeHtml(i.nextAction)}</div>` : ''}
    </div>`).join('');
}

function renderEditForm() {
  const grid = document.getElementById('editFormGrid');
  const countryOptions = meta.countries.map((c) => `<option value="${c.code}" ${customer.country === c.code ? 'selected' : ''}>${c.th}</option>`).join('');
  const channelOptions = meta.channels.map((c) => `<option value="${c}" ${customer.contactChannel === c ? 'selected' : ''}>${c}</option>`).join('');
  grid.innerHTML = `
    <div class="field"><label>ประเภทลูกค้า</label>
      <select name="type">
        <option value="individual" ${customer.type === 'individual' ? 'selected' : ''}>บุคคลธรรมดา</option>
        <option value="company" ${customer.type === 'company' ? 'selected' : ''}>บริษัท</option>
      </select>
    </div>
    <div class="field"><label>ชื่อ</label><input name="name" value="${escapeHtml(customer.name)}"></div>
    <div class="field"><label>ชื่อบริษัท</label><input name="companyName" value="${escapeHtml(customer.companyName || '')}"></div>
    <div class="field"><label>เลขผู้เสียภาษี</label><input name="taxId" value="${escapeHtml(customer.taxId || '')}"></div>
    <div class="field"><label>ผู้ติดต่อ</label><input name="contactPerson" value="${escapeHtml(customer.contactPerson || '')}"></div>
    <div class="field"><label>เบอร์โทร</label><input name="phone" value="${escapeHtml(customer.phone || '')}"></div>
    <div class="field"><label>อีเมล</label><input name="email" value="${escapeHtml(customer.email || '')}"></div>
    <div class="field"><label>Line ID</label><input name="lineId" value="${escapeHtml(customer.lineId || '')}"></div>
    <div class="field"><label>ประเทศ</label><select name="country">${countryOptions}</select></div>
    <div class="field"><label>ช่องทาง</label><select name="contactChannel">${channelOptions}</select></div>
    <div class="field full"><label>ที่อยู่</label><textarea name="address" rows="2">${escapeHtml(customer.address || '')}</textarea></div>
    <div class="field full"><label>หมายเหตุ</label><textarea name="notes" rows="2">${escapeHtml(customer.notes || '')}</textarea></div>
  `;
}

async function reload() {
  customer = await API.get(`/api/customers/${customerId}`);
  renderHeader();
  renderDeals();
  renderDocs();
  renderFollowups();
  renderAi();
  renderEditForm();
}

function setupTabs() {
  document.querySelectorAll('.tabs button').forEach((btn) => {
    btn.addEventListener('click', () => {
      document.querySelectorAll('.tabs button').forEach((b) => b.classList.remove('active'));
      document.querySelectorAll('.tab-panel').forEach((p) => { p.hidden = true; });
      btn.classList.add('active');
      document.getElementById(`tab-${btn.dataset.tab}`).hidden = false;
    });
  });
  document.querySelectorAll('[data-close]').forEach((btn) => {
    btn.addEventListener('click', () => { document.getElementById(btn.dataset.close).hidden = true; });
  });
}

function setupModals() {
  document.getElementById('dealStageSelect').innerHTML = meta.dealStages.map((s) => `<option value="${s.value}">${s.label}</option>`).join('');
  document.getElementById('docTypeSelect').innerHTML = meta.documentTypes.map((s) => `<option value="${s.value}">${s.label}</option>`).join('');
  document.getElementById('followupTypeSelect').innerHTML = meta.followupTypes.map((s) => `<option value="${s.value}">${s.label}</option>`).join('');

  document.getElementById('addDealBtn').addEventListener('click', () => { document.getElementById('dealModal').hidden = false; });
  document.getElementById('addDocBtn').addEventListener('click', () => { document.getElementById('docModal').hidden = false; });
  document.getElementById('addFollowupBtn').addEventListener('click', () => { document.getElementById('followupModal').hidden = false; });

  document.getElementById('dealForm').addEventListener('submit', async (e) => {
    e.preventDefault();
    const data = Object.fromEntries(new FormData(e.target).entries());
    try {
      await API.post(`/api/customers/${customerId}/deals`, data);
      document.getElementById('dealModal').hidden = true;
      e.target.reset();
      toast('เพิ่มดีลแล้ว');
      await reload();
    } catch (err) { toast(err.message, true); }
  });

  document.getElementById('docForm').addEventListener('submit', async (e) => {
    e.preventDefault();
    const fd = new FormData(e.target);
    fd.set('customerId', customerId);
    try {
      await API.upload('/api/documents', fd);
      document.getElementById('docModal').hidden = true;
      e.target.reset();
      toast('อัปโหลดเอกสารแล้ว');
      await reload();
    } catch (err) { toast(err.message, true); }
  });

  document.getElementById('followupForm').addEventListener('submit', async (e) => {
    e.preventDefault();
    const data = Object.fromEntries(new FormData(e.target).entries());
    try {
      await API.post(`/api/customers/${customerId}/followups`, data);
      document.getElementById('followupModal').hidden = true;
      e.target.reset();
      toast('เพิ่มการติดตามแล้ว');
      await reload();
    } catch (err) { toast(err.message, true); }
  });

  document.getElementById('runAiBtn').addEventListener('click', async () => {
    try {
      toast('กำลังวิเคราะห์ด้วย AI...');
      await API.post(`/api/ai/analyze/${customerId}`);
      toast('วิเคราะห์เสร็จแล้ว');
      await reload();
    } catch (err) { toast(err.message, true); }
  });

  document.getElementById('editForm').addEventListener('submit', async (e) => {
    e.preventDefault();
    const data = Object.fromEntries(new FormData(e.target).entries());
    try {
      await API.put(`/api/customers/${customerId}`, data);
      toast('บันทึกการแก้ไขแล้ว');
      await reload();
    } catch (err) { toast(err.message, true); }
  });

  document.getElementById('deleteCustomerBtn').addEventListener('click', async () => {
    if (!confirm('ลบลูกค้ารายนี้และข้อมูลที่เกี่ยวข้องทั้งหมด?')) return;
    await API.del(`/api/customers/${customerId}`);
    location.href = 'customers.html';
  });
}

(async () => {
  meta = await API.get('/api/meta');
  setupTabs();
  setupModals();
  await reload();
})().catch((e) => toast(e.message, true));
