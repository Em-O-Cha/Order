const API = {
  async get(url) {
    const r = await fetch(url);
    if (!r.ok) throw new Error((await r.json().catch(() => ({}))).error || `GET ${url} failed`);
    return r.json();
  },
  async post(url, body) {
    const r = await fetch(url, { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify(body || {}) });
    if (!r.ok) throw new Error((await r.json().catch(() => ({}))).error || `POST ${url} failed`);
    return r.json();
  },
  async put(url, body) {
    const r = await fetch(url, { method: 'PUT', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify(body || {}) });
    if (!r.ok) throw new Error((await r.json().catch(() => ({}))).error || `PUT ${url} failed`);
    return r.json();
  },
  async del(url) {
    const r = await fetch(url, { method: 'DELETE' });
    if (!r.ok) throw new Error((await r.json().catch(() => ({}))).error || `DELETE ${url} failed`);
    return r.json();
  },
  async upload(url, formData) {
    const r = await fetch(url, { method: 'POST', body: formData });
    if (!r.ok) throw new Error((await r.json().catch(() => ({}))).error || `UPLOAD ${url} failed`);
    return r.json();
  },
};

function toast(msg, isError) {
  const el = document.createElement('div');
  el.className = 'toast';
  if (isError) el.style.background = '#a50d0c';
  el.textContent = msg;
  document.body.appendChild(el);
  setTimeout(() => el.remove(), 3000);
}

function renderNav(active) {
  const items = [
    { href: 'index.html', label: 'แดชบอร์ด' },
    { href: 'customers.html', label: 'ลูกค้า' },
    { href: 'reports.html', label: 'รายงาน' },
    { href: 'skus.html', label: 'สินค้า (SKU)' },
  ];
  return `<div class="topbar">
    <h1>🌏 Export CRM</h1>
    <nav>${items.map((i) => `<a href="${i.href}" class="${active === i.href ? 'active' : ''}">${i.label}</a>`).join('')}</nav>
  </div>`;
}

function stageLabel(stage, dealStages) {
  const found = (dealStages || []).find((s) => s.value === stage);
  return found ? found.label : stage;
}

function fmtDate(d) {
  if (!d) return '-';
  return d;
}

function fmtMoney(n) {
  return Number(n || 0).toLocaleString('th-TH');
}

function escapeHtml(str) {
  return String(str || '').replace(/[&<>"']/g, (c) => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[c]));
}
