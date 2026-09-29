// ==================== หน้าแอดมิน: ดู/ค้นหาเร็วขึ้นผ่าน Supabase (เฟส 3 ขั้น 5) ====================
//
// วางไฟล์นี้เป็นไฟล์ใหม่ในโปรเจกต์ Apps Script "Members LINE" ต่อท้ายสุด (หลัง SupabaseOrder.gs)
// ไม่ต้องแก้ Members.gs และไม่ต้องแก้ admin.html — ลิงก์เดิม PIN เดิม หน้าตา/ปุ่มเดิมทุกอย่าง
//
// 1) ตอนเปิดหน้าแอดมิน (doGet page=admin) แทรกสคริปต์เล็กๆ ไว้ต้นหน้า: ทุกครั้งที่หน้าแอดมินเรียก
//    google.script.run.<ฟังก์ชันอ่าน> (ค้นหาสมาชิก, รายการ COD/คูปอง/สิทธิ์/โปร ฯลฯ) จะถาม Supabase ก่อน
//    (Edge Function admin-read รันฟังก์ชันอ่านตัวเดิมบนสำเนาชีต) ถ้าไม่ได้ด้วยเหตุใดก็ตาม -> เรียก Apps Script เดิม
//    ปุ่มที่แก้ข้อมูลเรียก Apps Script เหมือนเดิมทุกอย่าง
// 2) ความปลอดภัย: ไม่ส่ง PIN ไป Supabase — หลังกรอก PIN ถูก หน้าแอดมินขอ "ตั๋ว" จาก adminSupabaseToken(pin)
//    (ตรวจ PIN ที่นี่ ด้วย checkAdminPin_ ตัวเดิม) ตั๋วอายุ 12 ชั่วโมง ลงลายเซ็นด้วย internal key
// 3) ฟังก์ชันแอดมินที่แก้ข้อมูล: ตั้งธง "ข้อมูลเปลี่ยน" เฉพาะแท็บที่ฟังก์ชันนั้นแก้ แล้วส่งสำเนาแท็บนั้นทันที
//    ในการกดครั้งเดียวกัน (Supabase ถอยไป Apps Script แค่ไม่กี่วินาที) ส่งไม่สำเร็จ -> trigger สำรองส่งให้
// 4) ชุดทดสอบ adminCompareReads(): เทียบผลฟังก์ชันอ่านทุกตัว Apps Script vs Supabase (รันเองจาก editor)

var ADMIN_READ_PATH_ = '/functions/v1/admin-read?forceFunctionRegion=ap-northeast-2';
var ADMIN_TOKEN_TTL_MS_ = 12 * 3600 * 1000;
// ฟังก์ชันอ่าน -> รับ PIN เป็นพารามิเตอร์แรกหรือไม่ (ต้องตรงกับ supabase/functions/admin-read/index.ts)
var ADMIN_READS_ = {
  searchMembers: true, getMemberPrivileges: true, getBlockedMembers: true, getCampaignAudience: true,
  getAutoMemberConfig: true, getBirthdayPromoConfigForAdmin: true, getCodConfigForAdmin: true,
  getPurchaseReferralConfigForAdmin: true, getReferralConfigForAdmin: true, getShippingConfigForAdmin: true,
  getShopProducts: false, getTierConfigForAdmin: true, listCodBlockedMembers: true, listCodOrders: true,
  listGlobalCoupons: true, listPointsPromos: true, listPurchaseReferrals: true, listRedemptionLog: true,
  listReferrals: true, listRewardsCatalogAdmin: true, listSignupPrivilegeItems: true, listTierPerks: true,
  findLineUidByPhoneFromRevenue: true
};
// ฟังก์ชันแอดมินที่แก้ข้อมูล -> แท็บที่ฟังก์ชันนั้นแก้ (ใส่เกินได้ แท็บที่ไม่เปลี่ยนเสียแค่เวลาอ่านไม่กี่ร้อยมิลลิวินาที)
// หลังกดปุ่ม: ตั้งธงเฉพาะแท็บเหล่านี้ แล้วส่งสำเนาแท็บเหล่านี้ไป Supabase ทันทีในการกดครั้งเดียวกัน
// (เดิมตั้งธงทุกแท็บแล้วรอ trigger มาส่ง ~2 นาที ระหว่างนั้นหน้าร้านของลูกค้าต้องถอยไปใช้ Apps Script ซึ่งช้า)
var ADMIN_EXPIRY_TABS_ = [
  'members/Member_Privileges', 'members/Coupons', 'members/Signup_Privileges', 'members/Points_Promos',
  'members/Rewards_Catalog', 'members/Expiry_Disable_Log'
];
var ADMIN_ORDER_TABS_ = [
  'revenue/Revenue', 'members/Members', 'members/Member_Privileges', 'members/Points_Log', 'members/Coupons',
  'members/Purchase_Referral_Log', 'members/Referral_Log', 'members/Signup_Privileges', 'members/Tier_Config',
  'members/Points_Promos', 'members/Point_Rewards', 'members/Rewards_Catalog'
];
var ADMIN_WRITE_TABS_ = {
  addMemberPrivilege:                 ['members/Member_Privileges', 'members/Members'],
  addPointsToAllMembers:              ['members/Members', 'members/Points_Log'],
  addPrivilegeToAllMembers:           ['members/Member_Privileges', 'members/Members'],
  adjustMemberPoints:                 ['members/Members', 'members/Points_Log'],
  backfillMembersFromRevenue:         ['members/Members', 'members/Member_Privileges', 'members/Points_Log',
                                       'members/Signup_Privileges', 'members/Tier_Config', 'revenue/Revenue'],
  confirmCodPayment:                  ADMIN_ORDER_TABS_.concat(['props/script']),
  createGlobalCoupon:                 ['members/Coupons', 'members/Members'],
  createManualShopOrder:              ADMIN_ORDER_TABS_,
  createPointsPromo:                  ['members/Points_Promos'],
  createRewardCatalogItem:            ['members/Rewards_Catalog'],
  createSignupPrivilegeItem:          ['members/Signup_Privileges', 'members/Members'],
  createTierPerk:                     ['members/Tier_Perks'],
  deactivateIssuedPrivilegesByName:   ['members/Member_Privileges'],
  deactivatePrivilege:                ['members/Member_Privileges'],
  markCodReturned:                    ['revenue/Revenue', 'members/Members'],
  markRedemptionFulfilled:            ['members/Redemption_Log'],
  runBlockedMembersSync:              ['members/Members'].concat(ADMIN_EXPIRY_TABS_),
  runExpiryAutoDisable:               ADMIN_EXPIRY_TABS_,
  runPromoCampaign:                   ['members/Member_Privileges', 'members/Coupons', 'members/Members',
                                       'members/Campaign_Log'],
  setMemberCodBlock:                  ['members/Members'],
  toggleGlobalCoupon:                 ['members/Coupons'],
  togglePointsPromo:                  ['members/Points_Promos'],
  toggleRewardCatalogItem:            ['members/Rewards_Catalog'],
  toggleSignupPrivilegeConfigEnabled: ['props/script'],
  toggleSignupPrivilegeItem:          ['members/Signup_Privileges'],
  toggleTierPerk:                     ['members/Tier_Perks'],
  updateAutoMemberConfig:             ['props/script'],
  updateBirthdayPromoConfig:          ['props/script'],
  updateCodConfig:                    ['props/script'],
  updateGlobalCoupon:                 ['members/Coupons'],
  updateMemberPrivilege:              ['members/Member_Privileges'],
  updatePointsPromo:                  ['members/Points_Promos'],
  updatePointsRedeemConfig:           ['props/script'],
  updatePurchaseReferralConfig:       ['props/script'],
  updateReferralConfig:               ['props/script'],
  updateRewardCatalogItem:            ['members/Rewards_Catalog'],
  updateShippingConfig:               ['members/Shipping_Config'],
  updateSignupBonus:                  ['props/script'],
  updateSignupPrivilegeConfig:        ['props/script'],
  updateSignupPrivilegeItem:          ['members/Signup_Privileges'],
  updateTierConfig:                   ['members/Tier_Config', 'members/Members'],
  updateTierPerk:                     ['members/Tier_Perks']
};
var ADMIN_WRITE_FNS_ = Object.keys(ADMIN_WRITE_TABS_);
// ทุกแท็บที่ Supabase ใช้ (ชุดทดสอบ adminCompareReads ส่งสำเนาทั้งหมดนี้ก่อนเทียบ)
var ADMIN_DIRTY_TABS_ = [
  'members/Members', 'members/Member_Privileges', 'members/Points_Log', 'members/Coupons', 'members/Tier_Config',
  'members/Signup_Privileges', 'members/Points_Promos', 'members/Tier_Perks', 'members/Point_Rewards',
  'members/Rewards_Catalog', 'members/Referral_Log', 'members/Purchase_Referral_Log', 'members/Redemption_Log',
  'members/Shipping_Config', 'members/Expiry_Disable_Log', 'revenue/Revenue', 'props/script'
];
// สร้าง/แก้ข้อมูลตัวตนสมาชิกได้ (การสมัครผ่าน Supabase ต้องถอยไปทางเดิมจนกว่าสำเนาจะทัน)
var ADMIN_IDENTITY_FNS_ = { createManualShopOrder: true, backfillMembersFromRevenue: true };


// ------------------------------------------------------------------------------------------
// ตั๋วสำหรับ Supabase (หน้าแอดมินเรียกผ่าน google.script.run หลังกรอก PIN ถูก)
// ------------------------------------------------------------------------------------------
function adminSupabaseToken(pin) {
  if (!checkAdminPin_(pin)) return { success: false, error: 'PIN ไม่ถูกต้อง' };
  var cfg = mirrorConfig_();
  if (!cfg) return { success: false, error: 'ยังไม่ได้ตั้งค่า Supabase' };
  var exp = String(Date.now() + ADMIN_TOKEN_TTL_MS_);
  var sig = Utilities.computeHmacSha256Signature('admin-read:' + exp, adminInternalKey_(cfg), Utilities.Charset.UTF_8);
  return { success: true, token: exp + '.' + adminHex_(sig), url: cfg.url + ADMIN_READ_PATH_, reads: ADMIN_READS_ };
}

function adminInternalKey_(cfg) {
  var cache = CacheService.getScriptCache();
  var known = cache.get(SIGNUP_KEY_CACHE_KEY_);
  if (!known) {
    known = signupInternalKey_(cfg);
    cache.put(SIGNUP_KEY_CACHE_KEY_, known, 600);
  }
  return String(known);
}

function adminHex_(bytes) {
  return bytes.map(function (b) { var v = (b < 0 ? b + 256 : b).toString(16); return v.length < 2 ? '0' + v : v; }).join('');
}


// ------------------------------------------------------------------------------------------
// สคริปต์ที่แทรกในหน้าแอดมิน: ห่อ google.script.run — ฟังก์ชันอ่านถาม Supabase ก่อน ไม่ได้ก็เรียก Apps Script เดิม
// ------------------------------------------------------------------------------------------
var ADMIN_SHIM_JS_ = "(function(){try{\n" +
"if(typeof Proxy==='undefined'||!window.google||!google.script)return;\n" +
"var d=Object.getOwnPropertyDescriptor(google.script,'run');if(!d)return;\n" +
"var getOrig=d.get?function(){return d.get.call(google.script);}:(function(v){return function(){return v;};})(d.value);\n" +
"var st={token:'',url:'',reads:null,asking:false};\n" +
"try{var s=JSON.parse(sessionStorage.getItem('adminSupabase')||'null');if(s&&s.token&&Number(String(s.token).split('.')[0])>Date.now()+60000){st.token=s.token;st.url=s.url;st.reads=s.reads;}}catch(e){}\n" +
"function viaApps(fn,args,o){var r=getOrig();if(o.ok)r=r.withSuccessHandler(o.ok);if(o.fail)r=r.withFailureHandler(o.fail);if(o.hasUser)r=r.withUserObject(o.user);return r[fn].apply(r,args);}\n" +
"function askToken(pin){if(st.token||st.asking||typeof pin!=='string'||!pin)return;st.asking=true;\n" +
"  getOrig().withSuccessHandler(function(t){st.asking=false;if(t&&t.success){st.token=t.token;st.url=t.url;st.reads=t.reads;try{sessionStorage.setItem('adminSupabase',JSON.stringify({token:t.token,url:t.url,reads:t.reads}));}catch(e){}}})\n" +
"  .withFailureHandler(function(){st.asking=false;}).adminSupabaseToken(pin);}\n" +
"function forget(){st.token='';try{sessionStorage.removeItem('adminSupabase');}catch(e){}}\n" +
"function dispatch(fn,args,o){\n" +
"  var hasPin=st.reads?st.reads[fn]:undefined;\n" +
"  if(!st.token||hasPin===undefined){\n" +
"    var ok=o.ok;var o2={};for(var k in o)o2[k]=o[k];\n" +
"    o2.ok=function(r,u){if(!st.token&&args.length&&r&&r.success!==false)askToken(args[0]);if(ok)ok(r,u);};\n" +
"    return viaApps(fn,args,o2);}\n" +
"  var send=hasPin?args.slice(1):args;\n" +
"  fetch(st.url,{method:'POST',body:JSON.stringify({action:'call',fn:fn,args:JSON.stringify(send),token:st.token})})\n" +
"  .then(function(res){return res.json();})\n" +
"  .then(function(r){if(r&&r.success&&!r.fallback){setTimeout(function(){if(o.ok)o.ok(r.result,o.user);},0);return;}\n" +
"    if(r&&r.success===false)forget();viaApps(fn,args,o);})\n" +
"  .catch(function(){viaApps(fn,args,o);});}\n" +
"function build(o){return new Proxy({},{get:function(_,p){\n" +
"  if(p==='withSuccessHandler')return function(h){var n={};for(var k in o)n[k]=o[k];n.ok=h;return build(n);};\n" +
"  if(p==='withFailureHandler')return function(h){var n={};for(var k in o)n[k]=o[k];n.fail=h;return build(n);};\n" +
"  if(p==='withUserObject')return function(u){var n={};for(var k in o)n[k]=o[k];n.user=u;n.hasUser=true;return build(n);};\n" +
"  if(typeof p!=='string')return undefined;\n" +
"  return function(){return dispatch(p,[].slice.call(arguments),o);};}});}\n" +
"var proxy=build({});\n" +
"try{Object.defineProperty(google.script,'run',{configurable:true,get:function(){return proxy;}});}catch(e){try{google.script.run=proxy;}catch(e2){}}\n" +
"window.__adminSupabase=st;\n" +
"}catch(e){}})();";

function adminInjectShim_(html) {
  var tag = '<script>' + ADMIN_SHIM_JS_ + '</script>';
  var m = /<head[^>]*>/i.exec(html);
  if (!m) return tag + html;
  var end = m.index + m[0].length;
  return html.substring(0, end) + tag + html.substring(end);
}


// ------------------------------------------------------------------------------------------
// ตัวเชื่อม (ห่อฟังก์ชันเดิม ติดตั้งทุกครั้งที่โหลดไฟล์)
// ------------------------------------------------------------------------------------------
function adminInstallHooks_() {
  var G = globalThis;
  if (G.__adminHooksInstalled) return;
  G.__adminHooksInstalled = true;
  function wrap(name, make) {
    if (typeof G[name] !== 'function') { Logger.log('adminInstallHooks_: ไม่พบ ' + name); return; }
    G[name] = make(G[name]);
  }

  // หน้าแอดมิน: แทรกสคริปต์ถาม Supabase (ถ้าแทรกไม่ได้ หน้าแอดมินทำงานแบบเดิมทุกอย่าง)
  wrap('doGet', function (orig) {
    return function (e) {
      var out = orig.apply(this, arguments);
      try {
        if (e && e.parameter && e.parameter.page === 'admin' && out && typeof out.getContent === 'function') {
          out.setContent(adminInjectShim_(out.getContent()));
        }
      } catch (x) {
        Logger.log('admin shim: ' + x);
      }
      return out;
    };
  });

  // ฟังก์ชันแอดมินที่แก้ข้อมูล: ตั้งธงเฉพาะแท็บที่แก้ แล้วส่งสำเนาทันที (หน้าร้านใช้ Supabase ต่อได้ภายในไม่กี่วินาที)
  ADMIN_WRITE_FNS_.forEach(function (name) {
    var tabs = ADMIN_IDENTITY_FNS_[name] ? ADMIN_WRITE_TABS_[name].concat(['members/Members#identity']) : ADMIN_WRITE_TABS_[name];
    wrap(name, function (orig) {
      return function () {
        try {
          return orig.apply(this, arguments);
        } finally {
          adminAfterWrite_(tabs);
        }
      };
    });
  });
}
adminInstallHooks_();


// หลังฟังก์ชันแอดมินแก้ชีต: ตั้งธง (+ trigger สำรอง) แล้วส่งสำเนาแท็บที่แก้ทันที ไม่ throw ไม่ว่ากรณีใด
// ส่งสำเร็จ -> ลบเครื่องหมายที่จดไว้ (trigger สำรองไม่ต้องอ่านซ้ำ) ถ้ามีใครจดใหม่ระหว่างส่ง เก็บไว้ให้ trigger ส่งอีกรอบ
function adminAfterWrite_(tabKeys) {
  try {
    if (!mirrorConfig_()) return;
    signupMarkDirty_(tabKeys);
    var props = PropertiesService.getScriptProperties();
    var marked = props.getProperties();
    var failed = {};
    mirrorSyncTabsNow_(tabKeys, true).forEach(function (r) {
      if (!r || r.status === 'error') failed[r ? r.key : ''] = true;
    });
    var after = props.getProperties();
    tabKeys.forEach(function (k) {
      var p = MIRROR_DIRTY_PREFIX_ + k;
      if (failed[k.split('#')[0]] || !marked[p] || after[p] !== marked[p]) return;
      props.deleteProperty(p);
    });
  } catch (e) {
    Logger.log('adminAfterWrite_ error: ' + e);
  }
}


// ------------------------------------------------------------------------------------------
// ชุดทดสอบ: adminCompareReads() — เทียบผลฟังก์ชันอ่านทุกตัวของหน้าแอดมิน Apps Script vs Supabase
// (อ่านอย่างเดียว ไม่แก้ข้อมูลใดๆ) ผลอยู่ใน Execution log
// ------------------------------------------------------------------------------------------
function adminCompareReads() {
  var cfg = mirrorConfig_();
  if (!cfg) throw new Error('ยังไม่ได้ตั้ง SUPABASE_URL / SUPABASE_SECRET_KEY ใน Script Properties');
  mirrorSyncTabsNow_(ADMIN_DIRTY_TABS_.concat(['master/SKU']), true);
  var pin = PropertiesService.getScriptProperties().getProperty('ADMIN_PIN') || '1234';
  var t = adminSupabaseToken(pin);
  if (!t.success) throw new Error('ออกตั๋วไม่ได้: ' + t.error);

  var lines = [], fails = 0, fallbacks = 0;
  function remote(fn, args, token) {
    var res = UrlFetchApp.fetch(t.url, {
      method: 'post', contentType: 'text/plain', muteHttpExceptions: true,
      payload: JSON.stringify({ action: 'call', fn: fn, args: JSON.stringify(args), token: token || t.token })
    });
    try { return JSON.parse(res.getContentText()); } catch (e) { return { success: false, error: res.getContentText().substring(0, 200) }; }
  }

  var members = searchMembers(pin, '');
  var list = (members && (members.results || members.members)) || [];
  var uid = list.length ? String(list[0].lineUid || list[0].uid || list[0].LINE_UID || '') : '';
  var phone = list.length ? String(list[0].phone || '') : '';
  var cases = [
    ['searchMembers', ''], ['searchMembers', '09'], ['getMemberPrivileges', uid], ['getBlockedMembers'],
    ['getCampaignAudience', 'notBought'], ['getCampaignAudience', 'bought'], ['getCampaignAudience', 'all'],
    ['getAutoMemberConfig'], ['getBirthdayPromoConfigForAdmin'], ['getCodConfigForAdmin'],
    ['getPurchaseReferralConfigForAdmin'], ['getReferralConfigForAdmin'], ['getShippingConfigForAdmin'],
    ['getShopProducts'], ['getTierConfigForAdmin'], ['listCodBlockedMembers'], ['listCodOrders', ''],
    ['listCodOrders', 'pending'], ['listGlobalCoupons'], ['listPointsPromos'], ['listPurchaseReferrals'],
    ['listRedemptionLog'], ['listReferrals'], ['listRewardsCatalogAdmin'], ['listSignupPrivilegeItems'],
    ['listTierPerks'], ['findLineUidByPhoneFromRevenue', phone]
  ];
  cases.forEach(function (c) {
    var fn = c[0], args = c.slice(1);
    var local = ADMIN_READS_[fn] ? G_call_(fn, [pin].concat(args)) : G_call_(fn, args);
    var r = remote(fn, args);
    var label = fn + (args.length ? '(' + String(args[0]).substring(0, 12) + ')' : '');
    if (r && r.success && r.fallback) {
      fallbacks++;
      lines.push('ถอย  ' + label + ' — Supabase ให้ Apps Script ตอบแทน: ' + r.reason + (r.detail ? ' ' + JSON.stringify(r.detail).substring(0, 120) : ''));
      return;
    }
    var a = JSON.stringify(local), b = r && r.success ? JSON.stringify(r.result) : null;
    if (a === b) {
      lines.push('ตรง  ' + label + ' (' + a.length + ' ตัวอักษร)');
    } else {
      fails++;
      lines.push('ไม่ตรง ' + label + ' — Apps Script: ' + String(a).substring(0, 200) + ' | Supabase: ' + String(b || JSON.stringify(r)).substring(0, 200));
    }
  });
  var bad = remote('searchMembers', [''], '1700000000000.' + new Array(65).join('0'));
  var badOk = bad && bad.success === false;
  if (!badOk) fails++;
  lines.push((badOk ? 'ผ่าน  ' : 'ไม่ผ่าน ') + 'ตั๋วปลอม/หมดอายุ -> Supabase ปฏิเสธ');
  var wrongPin = adminSupabaseToken(pin + 'x');
  if (wrongPin.success) fails++;
  lines.push((!wrongPin.success ? 'ผ่าน  ' : 'ไม่ผ่าน ') + 'PIN ผิด -> ไม่ออกตั๋ว');
  lines.push(fails ? '== ไม่ผ่าน ' + fails + ' ข้อ ==' : '== ตรงกันทุกข้อ ==' + (fallbacks ? ' (ถอยไป Apps Script ' + fallbacks + ' ข้อ — ยังถูกต้อง)' : ''));
  Logger.log(lines.join('\n'));
  return { fails: fails, lines: lines };
}

function G_call_(fn, args) {
  return globalThis[fn].apply(null, args);
}
