document.getElementById('nav').innerHTML = renderNav('index.html');

let meta;

async function loadMeta() {
  meta = await API.get('/api/meta');
}

function renderReminders(reminders) {
  const el = document.getElementById('reminders');
  if (!reminders.length) {
    el.innerHTML = '<div class="empty-state">ไม่มีรายการแจ้งเตือนตอนนี้ 🎉</div>';
    return;
  }
  el.innerHTML = reminders.map((r) => `
    <div class="reminder-item severity-${r.severity}">
      <div>
        <div class="msg">${escapeHtml(r.message)}</div>
        <div class="customer"><a href="customer.html?id=${r.customerId}">${escapeHtml(r.customerName)}</a></div>
      </div>
      <div class="due">${fmtDate(r.dueDate)}</div>
    </div>`).join('');
}

function renderKpis(data) {
  const el = document.getElementById('kpis');
  const items = [
    { label: 'ลูกค้าทั้งหมด', value: data.totals.customers, sub: `ใหม่ 30 วันล่าสุด: ${data.totals.newCustomersLast30}` },
    { label: 'ดีลที่กำลังเปิด', value: data.totals.openDeals, sub: `มูลค่ารวม ${fmtMoney(data.revenue.pipelineValue)} บาท` },
    { label: 'ปิดการขายสำเร็จ', value: data.totals.wonDeals, sub: `เดือนนี้ ${data.revenue.wonThisMonthCount} ดีล / ${fmtMoney(data.revenue.revenueThisMonth)} บาท` },
    { label: 'เอกสารทั้งหมด', value: data.totals.documents, sub: `แจ้งเตือน ${data.reminders.length} รายการ` },
  ];
  el.innerHTML = items.map((i) => `
    <div class="card kpi">
      <div class="label">${i.label}</div>
      <div class="value">${i.value}</div>
      <div class="sub">${i.sub}</div>
    </div>`).join('');
}

function countryLabel(code) {
  const c = (meta.countries || []).find((x) => x.code === code);
  return c ? c.th : code;
}

function renderCharts(data) {
  const countryEntries = Object.entries(data.byCountry).sort((a, b) => b[1] - a[1]).slice(0, 8);
  new Chart(document.getElementById('countryChart'), {
    type: 'bar',
    data: {
      labels: countryEntries.map(([code]) => countryLabel(code)),
      datasets: [{ label: 'จำนวนลูกค้า', data: countryEntries.map(([, v]) => v), backgroundColor: '#2e7d32' }],
    },
    options: { plugins: { legend: { display: false } }, scales: { y: { beginAtZero: true, ticks: { precision: 0 } } } },
  });

  const stageEntries = Object.entries(data.byStage);
  new Chart(document.getElementById('stageChart'), {
    type: 'doughnut',
    data: {
      labels: stageEntries.map(([s]) => stageLabel(s, meta.dealStages)),
      datasets: [{ data: stageEntries.map(([, v]) => v), backgroundColor: ['#1565c0', '#ef6c00', '#7b1fa2', '#9e8b00', '#00695c', '#2e7d32', '#a50d0c'] }],
    },
  });
}

async function init() {
  await loadMeta();
  const data = await API.get('/api/dashboard');
  renderKpis(data);
  renderReminders(data.reminders);
  renderCharts(data);
}

document.getElementById('sendReportBtn').addEventListener('click', async () => {
  try {
    await API.post('/api/reports/send-now');
    toast('สร้าง/ส่งรายงานประจำวันแล้ว');
  } catch (e) {
    toast(e.message, true);
  }
});

init().catch((e) => toast(e.message, true));
