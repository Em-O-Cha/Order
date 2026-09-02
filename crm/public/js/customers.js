document.getElementById('nav').innerHTML = renderNav('customers.html');

let meta;

async function loadMeta() {
  meta = await API.get('/api/meta');
  const countryFilter = document.getElementById('countryFilter');
  const countrySelect = document.getElementById('countrySelect');
  meta.countries.forEach((c) => {
    countryFilter.insertAdjacentHTML('beforeend', `<option value="${c.code}">${c.th}</option>`);
    countrySelect.insertAdjacentHTML('beforeend', `<option value="${c.code}">${c.th} (${c.en})</option>`);
  });
  const channelSelect = document.getElementById('channelSelect');
  meta.channels.forEach((ch) => channelSelect.insertAdjacentHTML('beforeend', `<option value="${ch}">${ch}</option>`));
}

function rowHtml(c) {
  return `<tr onclick="location.href='customer.html?id=${c.id}'" style="cursor:pointer">
    <td>${escapeHtml(c.type === 'company' ? c.companyName || c.name : c.name)}</td>
    <td><span class="badge type-${c.type}">${c.type === 'company' ? 'บริษัท' : 'บุคคลธรรมดา'}</span></td>
    <td>${countryLabel(c.country)}</td>
    <td>${escapeHtml(c.contactChannel || '-')}</td>
    <td><span class="badge stage-${c.currentStage}">${stageLabel(c.currentStage, meta.dealStages)}</span></td>
    <td>${escapeHtml(c.phone || c.email || '-')}</td>
  </tr>`;
}

function countryLabel(code) {
  const c = (meta.countries || []).find((x) => x.code === code);
  return c ? c.th : (code || '-');
}

async function loadList() {
  const params = new URLSearchParams();
  const q = document.getElementById('searchInput').value.trim();
  const country = document.getElementById('countryFilter').value;
  const type = document.getElementById('typeFilter').value;
  if (q) params.set('query', q);
  if (country) params.set('country', country);
  if (type) params.set('type', type);
  const list = await API.get(`/api/customers?${params.toString()}`);
  document.getElementById('customerRows').innerHTML = list.length
    ? list.map(rowHtml).join('')
    : '<tr><td colspan="6"><div class="empty-state">ยังไม่มีลูกค้า</div></td></tr>';
}

document.getElementById('searchInput').addEventListener('input', () => loadList());
document.getElementById('countryFilter').addEventListener('change', () => loadList());
document.getElementById('typeFilter').addEventListener('change', () => loadList());

document.getElementById('addBtn').addEventListener('click', () => { document.getElementById('addModal').hidden = false; });
document.getElementById('cancelAdd').addEventListener('click', () => { document.getElementById('addModal').hidden = true; });

document.getElementById('addForm').addEventListener('submit', async (e) => {
  e.preventDefault();
  const data = Object.fromEntries(new FormData(e.target).entries());
  try {
    const created = await API.post('/api/customers', data);
    document.getElementById('addModal').hidden = true;
    e.target.reset();
    toast('เพิ่มลูกค้าเรียบร้อย');
    location.href = `customer.html?id=${created.id}`;
  } catch (err) {
    toast(err.message, true);
  }
});

(async () => {
  await loadMeta();
  await loadList();
})().catch((e) => toast(e.message, true));
