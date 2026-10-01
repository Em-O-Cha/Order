import crypto from 'node:crypto';
import { sql } from './sql.mjs';
import { callEdge } from './edge_call.mjs';
const key = sql(`select value from mirror.secrets where name='internal_key'`)[0].value;
const exp = String(Date.now() + 3600e3);
const token = exp + '.' + crypto.createHmac('sha256', key).update('admin-read:' + exp).digest('hex');
const uid = sql(`select data->>'LINE UID' u from mirror.rows where source='members' and tab='Members' and coalesce(data->>'LINE UID','')<>'' order by row_num limit 1`)[0].u;
const calls = [
  ['listGlobalCoupons', []], ['searchMembers', ['']], ['searchMembers', ['0']], ['getMemberPrivileges', [uid]], ['getBlockedMembers', []],
  ['getCampaignAudience', ['all']], ['getCampaignAudience', ['bought']], ['getAutoMemberConfig', []], ['getBirthdayPromoConfigForAdmin', []],
  ['getCodConfigForAdmin', []], ['getPurchaseReferralConfigForAdmin', []], ['getReferralConfigForAdmin', []], ['getShippingConfigForAdmin', []],
  ['getShopProducts', []], ['getTierConfigForAdmin', []], ['listCodBlockedMembers', []], ['listCodOrders', ['*']], ['listPointsPromos', []],
  ['listPurchaseReferrals', []], ['listRedemptionLog', []], ['listReferrals', []], ['listRewardsCatalogAdmin', []], ['listSignupPrivilegeItems', []], ['listTierPerks', []],
];
const bodies = calls.map(([fn, args]) => ({ action: 'call', fn, args: JSON.stringify(args), token }));
const L = await callEdge('admin-read', bodies, { internal: false }), N = await callEdge('admin-read-next', bodies, { internal: false });
const strip = (o) => JSON.stringify(o?.result ?? o, (k, v) => (k === 'audienceCount' || k === 'audienceUsedCount' || k === 'stackable' || k === 'detailText' ? undefined : v));
calls.forEach(([fn], i) => {
  const a = strip(L[i].body), b = strip(N[i].body);
  console.log(a === b ? 'ตรง ' : 'ต่าง', fn, L[i].body?.fallback ? '(fallback ' + L[i].body.reason + ')' : '', N[i].body?.fallback ? '(next fallback ' + N[i].body.reason + ')' : '', a === b ? '' : '\n L ' + a.slice(0, 200) + '\n N ' + b.slice(0, 200));
});
const lc = N[0].body?.result?.results || [];
console.log('listGlobalCoupons ใหม่มีช่อง audienceCount:', lc.length && lc.every((c) => c.audienceCount === 0 && c.audienceUsedCount === 0));
