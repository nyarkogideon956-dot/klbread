/* KL Bread - bread given out / brought back each day (file: Extra3.gs) */

var STOCK_HEAD = ['Date', 'Sales Person', 'Product', 'Given out', 'Brought back', 'Recorded by', 'Recorded at'];

function stockSheet_() {
  var ss = ss_(), s = ss.getSheetByName('Stock');
  if (!s) {
    s = ss.insertSheet('Stock');
    s.getRange(1, 1, 1, STOCK_HEAD.length).setValues([STOCK_HEAD]).setFontWeight('bold');
    s.getRange(1, 1, s.getMaxRows(), 3).setNumberFormat('@');
  }
  return s;
}
function stockRows_() {
  var s = stockSheet_(), last = s.getLastRow();
  if (last < 2) return [];
  return s.getRange(2, 1, last - 1, STOCK_HEAD.length).getValues().filter(function (r) { return String(r[0]).trim() !== ''; });
}

function extra3_(user, req) {
  if (req.op === 'stockget') return stockGet_(user, req);
  if (req.op === 'stockset') { requireAdmin_(user); return stockSet_(user, req); }
  if (req.op === 'openget') { requireAdmin_(user); return openGet_(); }
  if (req.op === 'openset') { requireAdmin_(user); return openSet_(user, req); }
  if (req.op === 'ping') return ping_(user);
  if (req.op === 'closeday') return closeDay_(user, req);
  if (req.op === 'mystatus') return myStatus_(user, req);
  if (req.op === 'dayreport') { requireAdmin_(user); return dayReport_(req); }
  if (req.op === 'custrename') { requireAdmin_(user); return custRename_(user, req); }
  if (req.op === 'recon') { requireAdmin_(user); return recon_(req); }
  if (req.op === 'weeksheet') { requireAdmin_(user); return weekSheet_(req); }
  if (req.op === 'clearpreview') { requireAdmin_(user); return clearPreview_(req); }
  if (req.op === 'clearrun') { requireAdmin_(user); return clearRun_(user, req); }
  if (req.op === 'batches') { requireAdmin_(user); return batchList_(); }
  if (req.op === 'restore') { requireAdmin_(user); return restoreBatch_(user, req); }
  if (req.op === 'yearhist') { requireAdmin_(user); return yearHist_(req); }
  if (req.op === 'checkbooks') { requireAdmin_(user); return checkBooks_(req); }
  if (req.op === 'editpay') { requireAdmin_(user); return editPay_(user, req); }
  if (req.op === 'edithand') { requireAdmin_(user); return editHand_(user, req); }
  return null;
}

// per day and per product: given out, brought back, sold (last 30 days)
function stockGet_(user, req) {
  var today = xToday_(req), from = xAgo_(today, 29);
  var person = user.role === 'admin' ? String(req.person || '') : user.name, me = key_(person);
  var days = {};
  function item_(d, p) {
    if (!days[d]) days[d] = { date: d, items: {} };
    if (!days[d].items[p]) days[d].items[p] = { p: p, out: 0, back: 0, sold: 0 };
    return days[d].items[p];
  }
  var hasStock = {};
  stockRows_().forEach(function (r) {
    var d = d_(r[0]);
    if (key_(r[1]) !== me || d < from || d > today) return;
    var it = item_(d, String(r[2]));
    it.out = r2_(it.out + num_(r[3])); it.back = r2_(it.back + num_(r[4]));
    hasStock[d] = true;
  });
  rows_('Sales').forEach(function (r) {
    var d = d_(r[1]);
    if (key_(r[3]) !== me || !hasStock[d]) return;
    var it = item_(d, String(r[5])); it.sold = r2_(it.sold + num_(r[6]));
  });
  var list = Object.keys(days).sort().reverse().map(function (k) {
    var o = days[k]; return { date: o.date, items: Object.keys(o.items).map(function (p) { return o.items[p]; }) };
  });
  return { ok: true, person: person, days: list };
}

// owner records what a sales person took out and brought back on one day (replaces that day's lines)
function stockSet_(user, req) {
  var today = xToday_(req), date = String(req.date || ''), person = String(req.person || '').trim();
  if (!isDate_(date) || date > today || date < xAgo_(today, 30)) throw new Error('bad_date');
  var p = rows_('People').filter(function (r) { return key_(r[0]) === key_(person); })[0];
  if (!p) throw new Error('unknown_person');
  var known = {}; rows_('Products').forEach(function (r) { known[key_(r[0])] = String(r[0]).trim(); });
  var rows = [], stamp = Utilities.formatDate(new Date(), tz_(), 'yyyy-MM-dd HH:mm');
  (req.items || []).forEach(function (it) {
    var name = known[key_(it.p)], out = r2_(num_(it.out)), back = r2_(num_(it.back));
    if (!name) throw new Error('unknown_product');
    if (out < 0 || back < 0 || back > out) throw new Error('bad_stock');
    if (out > 0) rows.push([date, String(p[0]).trim(), name, out, back, user.name, stamp]);
  });
  var s = stockSheet_(), last = s.getLastRow();
  for (var i = last; i >= 2; i--) {
    var r = s.getRange(i, 1, 1, 2).getValues()[0];
    if (d_(r[0]) === date && key_(r[1]) === key_(person)) s.deleteRow(i);
  }
  if (rows.length) s.getRange(Math.max(s.getLastRow(), 1) + 1, 1, rows.length, STOCK_HEAD.length).setValues(rows);
  return stockGet_(user, { person: person, today: today });
}

/* ---------- old debts from before the app (owner adds them) ---------- */
var OPEN_HEAD = ['Customer', 'Amount', 'Date', 'Added by', 'Note'];
var OPEN_ = null;

function openSheet_() {
  var ss = ss_(), s = ss.getSheetByName('Opening debts');
  if (!s) {
    s = ss.insertSheet('Opening debts');
    s.getRange(1, 1, 1, OPEN_HEAD.length).setValues([OPEN_HEAD]).setFontWeight('bold');
    s.getRange(1, 1, s.getMaxRows(), 1).setNumberFormat('@');
  }
  return s;
}
// latest amount entered for each customer
function openMap_() {
  if (OPEN_) return OPEN_;
  var s = openSheet_(), last = s.getLastRow(), m = {};
  if (last >= 2) s.getRange(2, 1, last - 1, OPEN_HEAD.length).getValues().forEach(function (r) {
    if (String(r[0]).trim() !== '') m[key_(r[0])] = num_(r[1]);
  });
  OPEN_ = m;
  return m;
}
function openingFor_(name) { return openMap_()[key_(name)] || 0; }

function openGet_() {
  var m = openMap_(), out = {};
  Object.keys(m).forEach(function (k) { if (m[k] > 0) out[k] = m[k]; });
  return { ok: true, openings: out };
}
function openSet_(user, req) {
  var name = String(req.customer || '').trim(), amt = r2_(num_(req.amount));
  if (amt < 0 || amt > 1000000) throw new Error('bad_amount');
  var c = rows_('Customers').filter(function (r) { return key_(r[0]) === key_(name); })[0];
  if (!c || key_(name) === key_(WALKIN)) throw new Error('unknown_customer');
  var s = openSheet_(), stamp = Utilities.formatDate(new Date(), tz_(), 'yyyy-MM-dd HH:mm');
  s.getRange(Math.max(s.getLastRow(), 1) + 1, 1, 1, OPEN_HEAD.length).setValues([[String(c[0]).trim(), amt, stamp, user.name, String(req.note || '').slice(0, 200)]]);
  OPEN_ = null;
  return openGet_();
}


/* ---------- sign-in times, close day (cash count) and the owner's day report ---------- */
var ACT_HEAD = ['Date', 'Time', 'Person', 'Event'];
var CLOSE_HEAD = ['Date', 'Person', 'Closed at', 'Expected cash', 'Counted cash', 'Difference', 'Note'];

function xsheetOf_(name, head, textCols) {
  var ss = ss_(), s = ss.getSheetByName(name);
  if (!s) {
    s = ss.insertSheet(name);
    s.getRange(1, 1, 1, head.length).setValues([head]).setFontWeight('bold');
    s.getRange(1, 1, s.getMaxRows(), textCols).setNumberFormat('@');
  }
  return s;
}
function xrowsOf_(name, head, textCols) {
  var s = xsheetOf_(name, head, textCols), last = s.getLastRow();
  if (last < 2) return [];
  return s.getRange(2, 1, last - 1, head.length).getValues().filter(function (r) { return String(r[0]).trim() !== ''; });
}
function nowDate_() { return Utilities.formatDate(new Date(), tz_(), 'yyyy-MM-dd'); }
function nowTime_() { return Utilities.formatDate(new Date(), tz_(), 'HH:mm'); }
function hm_(v) {
  if (v instanceof Date) return Utilities.formatDate(v, tz_(), 'HH:mm');
  return String(v == null ? '' : v).slice(0, 5);
}

// records that a person opened or signed in to the app (at most once every 20 minutes)
function ping_(user) {
  var s = xsheetOf_('Activity', ACT_HEAD, 3), last = s.getLastRow(), d = nowDate_(), t = nowTime_();
  if (last >= 2) {
    var from = Math.max(2, last - 59), rows = s.getRange(from, 1, last - from + 1, 4).getValues();
    for (var i = rows.length - 1; i >= 0; i--) {
      if (d_(rows[i][0]) === d && key_(rows[i][2]) === key_(user.name)) {
        var a = hm_(rows[i][1]).split(':'), b = t.split(':');
        if ((Number(b[0]) * 60 + Number(b[1])) - (Number(a[0]) * 60 + Number(a[1])) < 20) return { ok: true, skipped: true };
        break;
      }
    }
  }
  s.getRange(Math.max(last, 1) + 1, 1, 1, 4).setValues([[d, t, user.name, 'Signed in']]);
  return { ok: true };
}

function closeRow_(person, date) {
  var rows = xrowsOf_('Day closes', CLOSE_HEAD, 2), out = null;
  rows.forEach(function (r) { if (d_(r[0]) === date && key_(r[1]) === key_(person)) out = { at: hm_(r[2]), expected: num_(r[3]), counted: num_(r[4]), diff: num_(r[5]), note: String(r[6] || '') }; });
  return out;
}
function closeDay_(user, req) {
  if (user.role === 'admin') throw new Error('sales_only');
  var counted = r2_(num_(req.counted));
  if (!(counted >= 0) || String(req.counted === undefined ? '' : req.counted).trim() === '') throw new Error('bad_amount');
  var expected = cashHeld_(rows_('Payments'), rows_('Cash'), user.name), d = nowDate_(), t = nowTime_(), diff = r2_(counted - expected);
  var s = xsheetOf_('Day closes', CLOSE_HEAD, 2);
  s.getRange(Math.max(s.getLastRow(), 1) + 1, 1, 1, CLOSE_HEAD.length).setValues([[d, user.name, t, expected, counted, diff, String(req.note || '').slice(0, 200)]]);
  return { ok: true, closed: { at: t, expected: expected, counted: counted, diff: diff, note: String(req.note || '').slice(0, 200) }, expected: expected };
}
function myStatus_(user, req) {
  return { ok: true, closed: closeRow_(user.name, nowDate_()), expected: cashHeld_(rows_('Payments'), rows_('Cash'), user.name) };
}

// owner: everything each sales person did on one day
function dayReport_(req) {
  var date = String(req.date || '');
  if (!isDate_(date)) throw new Error('bad_date');
  var per = {}, order = [];
  function p_(n) { var k = key_(n); if (!per[k]) { per[k] = { name: String(n).trim(), list: {}, bills: {}, sales: 0, cash: 0, momo: 0, credit: 0, debtIn: 0, handed: 0, upCash: 0, upHand: 0, pays: [], first: '', last: '', seen: [], paidByBill: {}, billTotals: {} }; order.push(k); } return per[k]; }
  rows_('People').forEach(function (r) { if (key_(r[2]) !== 'admin' && yes_(r[3])) p_(r[0]); });
  function mark_(x, t) { if (!t) return; if (!x.first || t < x.first) x.first = t; if (!x.last || t > x.last) x.last = t; }
  rows_('Sales').forEach(function (r) {
    if (d_(r[1]) !== date) return;
    var x = p_(r[3]), id = String(r[0]);
    x.sales = r2_(x.sales + num_(r[8])); x.billTotals[id] = r2_((x.billTotals[id] || 0) + num_(r[8])); x.bills[id] = 1; mark_(x, hm_(r[2]));
    if (!x.list[id]) x.list[id] = { id: id, time: hm_(r[2]), customer: String(r[4]), items: [], total: 0, paid: 0 };
    x.list[id].items.push({ p: String(r[5]), q: num_(r[6]), u: num_(r[7]) }); x.list[id].total = r2_(x.list[id].total + num_(r[8]));
  });
  rows_('Payments').forEach(function (r) {
    if (d_(r[1]) <= date) p_(r[3]).upCash += num_(r[6]);
    if (d_(r[1]) !== date) return;
    var x = p_(r[3]), c = num_(r[6]), m = num_(r[7]);
    x.cash = r2_(x.cash + c); x.momo = r2_(x.momo + m);
    if (key_(r[8]) === 'debt payment') { x.debtIn = r2_(x.debtIn + c + m); x.pays.push({ time: hm_(r[2]), customer: String(r[4]), total: r2_(c + m) }); }
    else { x.paidByBill[String(r[5])] = r2_((x.paidByBill[String(r[5])] || 0) + c + m); if (x.list[String(r[5])]) x.list[String(r[5])].paid = r2_(x.list[String(r[5])].paid + c + m); }
    mark_(x, hm_(r[2]));
  });
  rows_('Cash').forEach(function (r) { if (r[2] !== 'Handover') return; if (d_(r[1]) <= date) p_(r[3]).upHand += num_(r[4]); if (d_(r[1]) === date) { var x = p_(r[3]); x.handed = r2_(x.handed + num_(r[4])); } });
  xrowsOf_('Activity', ACT_HEAD, 3).forEach(function (r) { if (d_(r[0]) === date) { var x = p_(r[2]); x.seen.push(hm_(r[1])); } });
  var people = order.map(function (k) {
    var x = per[k], credit = 0, n = 0;
    Object.keys(x.billTotals).forEach(function (id) { credit += Math.max(0, r2_(x.billTotals[id] - (x.paidByBill[id] || 0))); n++; });
    x.seen.sort();
    return { name: x.name, bills: n, sales: x.sales, cash: x.cash, momo: x.momo, credit: r2_(credit), debtIn: x.debtIn, handed: x.handed, heldEnd: r2_(x.upCash - x.upHand),
      bills_: Object.keys(x.list).map(function (id) { return x.list[id]; }).sort(function (a, b) { return a.time < b.time ? -1 : 1; }), pays: x.pays, firstSale: x.first, lastSale: x.last, firstSeen: x.seen[0] || '', lastSeen: x.seen.length ? x.seen[x.seen.length - 1] : '', closed: closeRow_(x.name, date) };
  });
  return { ok: true, date: date, people: people };
}


/* ---------- owner: correct a customer's name everywhere (or merge two names) ---------- */
var REN_HEAD = ['Old name', 'New name', 'Changed by', 'Changed at'];
var REN_ = null;
function renMap_() {
  if (REN_) return REN_;
  var m = {};
  xrowsOf_('Renames', REN_HEAD, 2).forEach(function (r) { m[key_(r[0])] = String(r[1]).trim(); });
  REN_ = m; return m;
}
// the current spelling of a name (sales still waiting on a phone may use an old spelling)
function canon_(name) {
  var m = renMap_(), n = String(name || '').trim(), hops = 0;
  while (m[key_(n)] && key_(m[key_(n)]) !== key_(n) && hops < 6) { n = m[key_(n)]; hops++; }
  return n;
}
function xRenameCol_(sheetName, width, col, from, to) {
  var sh = sh_(sheetName), last = sh.getLastRow(), n = 0;
  if (last < 2) return 0;
  var rg = sh.getRange(2, col + 1, last - 1, 1), v = rg.getValues();
  v.forEach(function (r, i) { if (key_(r[0]) === key_(from)) { v[i][0] = to; n++; } });
  if (n) rg.setValues(v);
  return n;
}
function custRename_(user, req) {
  var lock = LockService.getScriptLock();
  lock.waitLock(28000);
  try {
    var from = String(req.from || '').trim(), to = String(req.to || '').trim().replace(/\s+/g, ' ');
    if (!to || to.length > 80) throw new Error('missing_name');
    if (key_(from) === key_(WALKIN) || key_(to) === key_(WALKIN)) throw new Error('bad_name');
    var cs = sh_('Customers'), clast = cs.getLastRow(), crows = clast < 2 ? [] : cs.getRange(2, 1, clast - 1, SHEETS['Customers'].length).getValues();
    var fi = -1, ti = -1;
    crows.forEach(function (r, i) { if (key_(r[0]) === key_(from)) fi = i; if (key_(r[0]) === key_(to) && key_(r[0]) !== key_(from)) ti = i; });
    if (fi < 0) throw new Error('unknown_customer');
    if (key_(from) === key_(to) && from === to) return { ok: true, same: true };
    var merged = ti >= 0, target = merged ? String(crows[ti][0]).trim() : to;
    var oldOpen = openingFor_(from), tgtOpen = openingFor_(target);
    var sN = xRenameCol_('Sales', 9, 4, from, target), pN = xRenameCol_('Payments', 9, 4, from, target);
    if (merged) {
      cs.deleteRow(fi + 2);
      if (oldOpen > 0) { var os = openSheet_(); os.getRange(Math.max(os.getLastRow(), 1) + 1, 1, 1, OPEN_HEAD.length).setValues([[target, r2_(oldOpen + tgtOpen), Utilities.formatDate(new Date(), tz_(), 'yyyy-MM-dd HH:mm'), user.name, 'merged from ' + from]]); }
    } else {
      cs.getRange(fi + 2, 1, 1, 1).setValues([[target]]);
      if (oldOpen > 0) { var os2 = openSheet_(); os2.getRange(Math.max(os2.getLastRow(), 1) + 1, 1, 1, OPEN_HEAD.length).setValues([[target, oldOpen, Utilities.formatDate(new Date(), tz_(), 'yyyy-MM-dd HH:mm'), user.name, 'name changed from ' + from]]); }
    }
    OPEN_ = null;
    var rs = xsheetOf_('Renames', REN_HEAD, 2), stamp = Utilities.formatDate(new Date(), tz_(), 'yyyy-MM-dd HH:mm');
    rs.getRange(Math.max(rs.getLastRow(), 1) + 1, 1, 1, 4).setValues([[from, target, user.name, stamp]]);
    REN_ = null;
    xappend_('Edit log', [stamp, user.name, 'RENAME', '', target, merged ? 'Names merged' : 'Name corrected', from, target + ' (' + sN + ' sale lines, ' + pN + ' payments)']);
    return { ok: true, merged: merged, name: target, sales: sN, payments: pN };
  } finally {
    lock.releaseLock();
  }
}

/* ---------- owner: cash ledger for one sales person (shows how "cash held" is worked out) ---------- */
function recon_(req) {
  var person = String(req.person || '').trim(), me = key_(person), list = [];
  rows_('Payments').forEach(function (r) {
    if (key_(r[3]) !== me || num_(r[6]) <= 0) return;
    list.push({ d: d_(r[1]), t: hm_(r[2]), what: (key_(r[8]) === 'debt payment' ? 'Debt payment · ' : 'Sale · ') + String(r[4]), amt: num_(r[6]) });
  });
  rows_('Cash').forEach(function (r) {
    if (r[2] !== 'Handover' || key_(r[3]) !== me) return;
    list.push({ d: d_(r[1]), t: '99:99', what: 'Handed to owner' + (String(r[5] || '') ? ' · ' + String(r[5]) : ''), amt: -num_(r[4]), handover: true });
  });
  list.sort(function (a, b) { return a.d + a.t < b.d + b.t ? -1 : 1; });
  var run = 0;
  list.forEach(function (x) { run = r2_(run + x.amt); x.run = run; if (x.t === '99:99') x.t = ''; });
  return { ok: true, person: person, held: run, rows: list.slice(-200) };
}


/* ================= clear records, restore, daily summary, checks, edits ================= */
var BATCH_HEAD = ['Batch', 'Cleared at', 'Cleared by', 'Mode', 'Date', 'Sales lines', 'Payments', 'Handovers', 'Status'];
var ARCH_HEAD = ['Batch', 'Table', 'v1', 'v2', 'v3', 'v4', 'v5', 'v6', 'v7', 'v8', 'v9'];
var DSUM_HEAD = ['Date', 'Person', 'Bills', 'Sales', 'Cash', 'MoMo', 'Credit', 'Debts paid', 'Batch'];

function xVal_(v) { return v instanceof Date ? Utilities.formatDate(v, tz_(), 'yyyy-MM-dd') : v; }

// work out what a clear would remove and carry forward (nothing is changed here)
function clearPlan_(mode, date) {
  var rm = { Sales: [], Payments: [], Cash: [] }, keep = { Sales: [], Payments: [], Cash: [] };
  function test_(d) { return mode === 'day' ? d === date : d < date; }
  rows_('Sales').forEach(function (r) { (test_(d_(r[1])) ? rm.Sales : keep.Sales).push(r); });
  rows_('Payments').forEach(function (r) { (test_(d_(r[1])) ? rm.Payments : keep.Payments).push(r); });
  rows_('Cash').forEach(function (r) { (r[2] === 'Handover' && test_(d_(r[1])) ? rm.Cash : keep.Cash).push(r); });
  var plan = { rm: rm, keep: keep, carryCust: {}, carryNames: {}, carryCash: {}, collected: 0 };
  if (mode === 'before') {
    rm.Sales.forEach(function (r) { var k = key_(r[4]); if (k === key_(WALKIN)) return; plan.carryCust[k] = r2_((plan.carryCust[k] || 0) + num_(r[8])); plan.carryNames[k] = plan.carryNames[k] || String(r[4]).trim(); });
    rm.Payments.forEach(function (r) {
      var k = key_(r[4]), amt = num_(r[6]) + num_(r[7]);
      if (k !== key_(WALKIN)) { plan.carryCust[k] = r2_((plan.carryCust[k] || 0) - amt); plan.carryNames[k] = plan.carryNames[k] || String(r[4]).trim(); }
      var pk = key_(r[3]); plan.carryCash[pk] = r2_((plan.carryCash[pk] || 0) + num_(r[6])); plan.collected = r2_(plan.collected + num_(r[6]));
      plan.carryNames['p:' + pk] = plan.carryNames['p:' + pk] || String(r[3]).trim();
    });
    rm.Cash.forEach(function (r) { var pk = key_(r[3]); plan.carryCash[pk] = r2_((plan.carryCash[pk] || 0) - num_(r[4])); plan.carryNames['p:' + pk] = plan.carryNames['p:' + pk] || String(r[3]).trim(); });
  }
  return plan;
}
function clearArgs_(req) {
  var mode = req.mode === 'day' ? 'day' : 'before', date = String(req.date || ''), today = xToday_(req);
  if (!isDate_(date) || date > today) throw new Error('bad_date');
  return { mode: mode, date: date };
}
function clearPreview_(req) {
  var a = clearArgs_(req), plan = clearPlan_(a.mode, a.date), bills = {};
  plan.rm.Sales.forEach(function (r) { bills[String(r[0])] = 1; });
  var cust = [], tot = 0;
  Object.keys(plan.carryCust).forEach(function (k) { var v = plan.carryCust[k]; if (Math.abs(v) > 0.004) { cust.push({ name: plan.carryNames[k], amount: v }); if (v > 0) tot = r2_(tot + v); } });
  cust.sort(function (x, y) { return y.amount - x.amount; });
  var cash = Object.keys(plan.carryCash).filter(function (k) { return Math.abs(plan.carryCash[k]) > 0.004; }).map(function (k) { return { name: plan.carryNames['p:' + k], amount: plan.carryCash[k] }; });
  return { ok: true, mode: a.mode, date: a.date, bills: Object.keys(bills).length, salesLines: plan.rm.Sales.length, payments: plan.rm.Payments.length, handovers: plan.rm.Cash.length, carryDebts: cust.slice(0, 15), carryDebtCount: cust.length, carryDebtTotal: tot, carryCash: cash };
}
function archSheet_() { return xsheetOf_('Archive', ARCH_HEAD, 2); }
function appendRows_(sheet, rows) {
  if (!rows.length) return;
  sheet.getRange(Math.max(sheet.getLastRow(), 1) + 1, 1, rows.length, rows[0].length).setValues(rows);
}
function rewrite_(name, keepRows) {
  var sh = sh_(name), last = sh.getLastRow(), w = SHEETS[name].length;
  if (last > 1) sh.getRange(2, 1, last - 1, w).clearContent();
  if (keepRows.length) sh.getRange(2, 1, keepRows.length, w).setValues(keepRows.map(function (r) { return r.map(xVal_); }));
}
function clearRun_(user, req) {
  var lock = LockService.getScriptLock();
  lock.waitLock(28000);
  try {
    if (String(req.ownerKey || '').trim() === '' || String(req.ownerKey).trim() !== String(req.key || '').trim()) { Utilities.sleep(800); throw new Error('wrong_key'); }
    if (String(req.confirm || '').trim().toUpperCase() !== 'CLEAR') throw new Error('not_confirmed');
    var a = clearArgs_(req), plan = clearPlan_(a.mode, a.date);
    if (!plan.rm.Sales.length && !plan.rm.Payments.length && !plan.rm.Cash.length) throw new Error('nothing_to_clear');
    var now = new Date(), batch = 'A' + Utilities.formatDate(now, tz_(), 'yyyyMMddHHmmss'), stamp = Utilities.formatDate(now, tz_(), 'yyyy-MM-dd HH:mm');
    // 1. safety copy of everything that is removed
    var arch = [];
    ['Sales', 'Payments', 'Cash'].forEach(function (n) { plan.rm[n].forEach(function (r) { arch.push([batch, n].concat(r.map(xVal_))); }); });
    // 2. daily summary kept for ever (only when clearing a whole period)
    var carryRows = [];
    if (a.mode === 'before') {
      var per = {};
      function g_(d, p) { var k = d + '|' + key_(p); return per[k] || (per[k] = { d: d, p: String(p).trim(), bills: {}, bt: {}, bp: {}, sales: 0, cash: 0, momo: 0, debt: 0 }); }
      plan.rm.Sales.forEach(function (r) { var x = g_(d_(r[1]), r[3]), id = String(r[0]); x.bills[id] = 1; x.bt[id] = r2_((x.bt[id] || 0) + num_(r[8])); x.sales = r2_(x.sales + num_(r[8])); });
      plan.rm.Payments.forEach(function (r) {
        var x = g_(d_(r[1]), r[3]), c = num_(r[6]), m = num_(r[7]); x.cash = r2_(x.cash + c); x.momo = r2_(x.momo + m);
        if (key_(r[8]) === 'debt payment') x.debt = r2_(x.debt + c + m); else x.bp[String(r[5])] = r2_((x.bp[String(r[5])] || 0) + c + m);
      });
      var sums = Object.keys(per).sort().map(function (k) {
        var x = per[k], credit = 0; Object.keys(x.bt).forEach(function (id) { credit += Math.max(0, r2_(x.bt[id] - (x.bp[id] || 0))); });
        return [x.d, x.p, Object.keys(x.bills).length, x.sales, x.cash, x.momo, r2_(credit), x.debt, batch];
      });
      appendRows_(xsheetOf_('Daily summary', DSUM_HEAD, 2), sums);
      // 3. carry forward: customer balances become old debts, cash held and bank totals carry over
      Object.keys(plan.carryCust).forEach(function (k) {
        var v = plan.carryCust[k]; if (Math.abs(v) < 0.005) return;
        var nm = plan.carryNames[k], prev = openingFor_(nm);
        arch.push([batch, 'OpenPrev', nm, prev]);
        appendRows_(openSheet_(), [[nm, r2_(prev + v), stamp, user.name, 'carry:' + batch]]);
      });
      var i = 0;
      Object.keys(plan.carryCash).forEach(function (k) {
        var v = plan.carryCash[k]; if (Math.abs(v) < 0.005) return; i++;
        carryRows.push(['K' + batch + '-' + i, a.date, 'Handover', plan.carryNames['p:' + k], r2_(-v), 'carry:' + batch + ' cash carried forward']);
      });
      if (Math.abs(plan.collected) > 0.004) carryRows.push(['K' + batch + '-B', a.date, 'Bank', '', r2_(-plan.collected), 'carry:' + batch + ' adjustment']);
    }
    appendRows_(archSheet_(), arch);
    rewrite_('Sales', plan.keep.Sales); rewrite_('Payments', plan.keep.Payments); rewrite_('Cash', plan.keep.Cash.concat(carryRows));
    OPEN_ = null;
    appendRows_(xsheetOf_('Batches', BATCH_HEAD, 2), [[batch, stamp, user.name, a.mode === 'day' ? 'Delete one day' : 'Start from a day', a.date, plan.rm.Sales.length, plan.rm.Payments.length, plan.rm.Cash.length, 'Cleared']]);
    return { ok: true, batch: batch, removed: { sales: plan.rm.Sales.length, payments: plan.rm.Payments.length, handovers: plan.rm.Cash.length } };
  } finally {
    lock.releaseLock();
  }
}
function batchRows_() { return xrowsOf_('Batches', BATCH_HEAD, 2); }
function batchList_() {
  var rows = batchRows_(), latest = '';
  rows.forEach(function (r) { if (String(r[8]) === 'Cleared' && String(r[0]) > latest) latest = String(r[0]); });
  return { ok: true, batches: rows.map(function (r) {
    return { id: String(r[0]), at: String(r[1]), by: String(r[2]), mode: String(r[3]), date: d_(r[4]), sales: num_(r[5]), payments: num_(r[6]), handovers: num_(r[7]), status: String(r[8]), canRestore: String(r[8]) === 'Cleared' && String(r[0]) === latest };
  }).reverse().slice(0, 20) };
}
function restoreBatch_(user, req) {
  var lock = LockService.getScriptLock();
  lock.waitLock(28000);
  try {
    if (String(req.ownerKey || '').trim() === '' || String(req.ownerKey).trim() !== String(req.key || '').trim()) { Utilities.sleep(800); throw new Error('wrong_key'); }
    var id = String(req.batch || ''), rows = batchRows_(), latest = '', found = -1;
    rows.forEach(function (r, i) { if (String(r[8]) === 'Cleared') { if (String(r[0]) > latest) latest = String(r[0]); } if (String(r[0]) === id) found = i; });
    if (found < 0) throw new Error('not_found');
    if (String(rows[found][8]) !== 'Cleared') throw new Error('already_restored');
    if (latest !== id) throw new Error('restore_latest_first');
    var arch = xrowsOf_('Archive', ARCH_HEAD, 2).filter(function (r) { return String(r[0]) === id; }), back = { Sales: [], Payments: [], Cash: [] }, prevs = [];
    arch.forEach(function (r) {
      var t = String(r[1]);
      if (t === 'OpenPrev') prevs.push([String(r[2]), num_(r[3])]);
      else if (back[t]) back[t].push(r.slice(2, 2 + SHEETS[t].length));
    });
    // take away the carried-forward lines
    var cs = sh_('Cash'), crows = rows_('Cash').filter(function (r) { return String(r[5] || '').indexOf('carry:' + id) !== 0; });
    rewrite_('Cash', crows);
    var stamp = Utilities.formatDate(new Date(), tz_(), 'yyyy-MM-dd HH:mm');
    prevs.forEach(function (x) { appendRows_(openSheet_(), [[x[0], x[1], stamp, user.name, 'restored ' + id]]); });
    OPEN_ = null;
    ['Sales', 'Payments', 'Cash'].forEach(function (t) { if (back[t].length) append_(t, back[t]); });
    // remove the daily summary lines of this clearing
    var ds = xsheetOf_('Daily summary', DSUM_HEAD, 2), dl = ds.getLastRow();
    if (dl >= 2) {
      var dv = ds.getRange(2, 1, dl - 1, DSUM_HEAD.length).getValues().filter(function (r) { return String(r[8]) !== id; });
      ds.getRange(2, 1, dl - 1, DSUM_HEAD.length).clearContent();
      if (dv.length) ds.getRange(2, 1, dv.length, DSUM_HEAD.length).setValues(dv);
    }
    var bs = xsheetOf_('Batches', BATCH_HEAD, 2); bs.getRange(found + 2, 9, 1, 1).setValues([['Restored']]);
    return { ok: true, restored: { sales: back.Sales.length, payments: back.Payments.length, handovers: back.Cash.length } };
  } finally {
    lock.releaseLock();
  }
}

// progress over a year: live records plus the daily summaries kept after clearing
function yearHist_(req) {
  var year = String(req.year || xToday_(req).slice(0, 4)), months = [];
  for (var i = 0; i < 12; i++) months.push({ m: i + 1, sales: 0, cash: 0, momo: 0, bills: 0, credit: 0, debt: 0 });
  var people = {};
  function add_(d, p, bills, sales, cash, momo, credit, debt) {
    if (d.slice(0, 4) !== year) return;
    var m = months[Number(d.slice(5, 7)) - 1]; m.sales = r2_(m.sales + sales); m.cash = r2_(m.cash + cash); m.momo = r2_(m.momo + momo); m.bills += bills; m.credit = r2_(m.credit + credit); m.debt = r2_(m.debt + debt);
    var k = key_(p); people[k] = people[k] || { name: String(p).trim(), sales: 0, cash: 0, momo: 0 }; people[k].sales = r2_(people[k].sales + sales); people[k].cash = r2_(people[k].cash + cash); people[k].momo = r2_(people[k].momo + momo);
  }
  var bt = {}, bp = {};
  rows_('Sales').forEach(function (r) { var id = String(r[0]); bt[id] = { d: d_(r[1]), p: String(r[3]), t: r2_(((bt[id] || {}).t || 0) + num_(r[8])) }; add_(d_(r[1]), r[3], 0, num_(r[8]), 0, 0, 0, 0); });
  Object.keys(bt).forEach(function (id) { add_(bt[id].d, bt[id].p, 1, 0, 0, 0, 0, 0); });
  rows_('Payments').forEach(function (r) {
    var c = num_(r[6]), m = num_(r[7]), debt = key_(r[8]) === 'debt payment';
    if (!debt) bp[String(r[5])] = r2_((bp[String(r[5])] || 0) + c + m);
    add_(d_(r[1]), r[3], 0, 0, c, m, 0, debt ? c + m : 0);
  });
  Object.keys(bt).forEach(function (id) { var cr = Math.max(0, r2_(bt[id].t - (bp[id] || 0))); if (cr > 0) add_(bt[id].d, bt[id].p, 0, 0, 0, 0, cr, 0); });
  xrowsOf_('Daily summary', DSUM_HEAD, 2).forEach(function (r) { add_(d_(r[0]), r[1], num_(r[2]), num_(r[3]), num_(r[4]), num_(r[5]), num_(r[6]), num_(r[7])); });
  var tot = { sales: 0, cash: 0, momo: 0, bills: 0, credit: 0, debt: 0 };
  months.forEach(function (m) { Object.keys(tot).forEach(function (k) { tot[k] = r2_(tot[k] + m[k]); }); });
  return { ok: true, year: year, months: months, total: tot, people: Object.keys(people).map(function (k) { return people[k]; }).sort(function (a, b) { return b.sales - a.sales; }) };
}

// "Check my books": anything that does not add up
function lev_(a, b) {
  if (Math.abs(a.length - b.length) > 1) return 9;
  var d = [], i, j; for (i = 0; i <= a.length; i++) { d[i] = [i]; } for (j = 0; j <= b.length; j++) d[0][j] = j;
  for (i = 1; i <= a.length; i++) for (j = 1; j <= b.length; j++) d[i][j] = Math.min(d[i - 1][j] + 1, d[i][j - 1] + 1, d[i - 1][j - 1] + (a.charAt(i - 1) === b.charAt(j - 1) ? 0 : 1));
  return d[a.length][b.length];
}
function checkBooks_(req) {
  var issues = [], sales = rows_('Sales'), pays = rows_('Payments'), cash = rows_('Cash'), custs = rows_('Customers');
  var people = rows_('People').filter(function (r) { return key_(r[2]) !== 'admin' && yes_(r[3]); }).map(function (r) { return String(r[0]).trim(); });
  people.forEach(function (n) {
    var held = cashHeld_(pays, cash, n);
    if (held < -0.004) issues.push({ kind: 'cash', person: n, amount: held, text: n + ' holds negative cash: ' + held.toFixed(2) + '. More was handed over than he collected.' });
  });
  var bal = balances_(sales, pays), seen = {};
  custs.forEach(function (r) {
    var name = String(r[0]).trim(), b = bal_(bal, name);
    if (b < -0.004) issues.push({ kind: 'customer', customer: name, amount: b, opening: openingFor_(name), text: name + ' has paid ' + (-b).toFixed(2) + ' more than he or she owed.' });
  });
  var bills = {}, paid = {};
  sales.forEach(function (r) { var id = String(r[0]); bills[id] = bills[id] || { id: id, p: String(r[3]), c: String(r[4]), t: 0 }; bills[id].t = r2_(bills[id].t + num_(r[8])); });
  pays.forEach(function (r) { if (key_(r[8]) !== 'debt payment') paid[String(r[5])] = r2_((paid[String(r[5])] || 0) + num_(r[6]) + num_(r[7])); });
  Object.keys(bills).forEach(function (id) { if ((paid[id] || 0) > bills[id].t + 0.004) issues.push({ kind: 'bill', bill: id, person: bills[id].p, customer: bills[id].c, text: 'A bill for ' + bills[id].c + ' (' + bills[id].p + ') was paid ' + r2_(paid[id] - bills[id].t).toFixed(2) + ' more than its total.' }); });
  // names that look like the same person
  var names = custs.map(function (r) { return String(r[0]).trim(); }), norm = names.map(function (n) { return n.toLowerCase().replace(/[^a-z0-9]/g, ''); });
  for (var i = 0; i < names.length; i++) for (var j = i + 1; j < names.length; j++) {
    if (norm[i] && norm[j] && (norm[i] === norm[j] || (norm[i].length >= 6 && norm[j].length >= 6 && lev_(norm[i], norm[j]) <= 1)))
      issues.push({ kind: 'names', customer: names[i], other: names[j], text: '"' + names[i] + '" and "' + names[j] + '" may be the same customer.' });
  }
  var walk = bal_(bal, WALKIN);
  if (Math.abs(walk) > 0.004) issues.push({ kind: 'walkin', amount: walk, text: 'Walk-in customers show a balance of ' + walk.toFixed(2) + '. They should always pay in full.' });
  return { ok: true, issues: issues.slice(0, 60) };
}

// owner edits a debt payment or a handover (always with a reason, always logged)
function editPay_(user, req) {
  var lock = LockService.getScriptLock();
  lock.waitLock(28000);
  try {
    var id = String(req.id || ''), reason = String(req.reason || '').trim();
    if (reason.length < 3) throw new Error('reason_needed');
    var sh = sh_('Payments'), last = sh.getLastRow(); if (last < 2) throw new Error('not_found');
    var data = sh.getRange(2, 1, last - 1, 9).getValues(), at = -1;
    data.forEach(function (r, i) { if (String(r[0]) === id && key_(r[8]) === 'debt payment') at = i; });
    if (at < 0) throw new Error('not_found');
    var row = data[at], cash = r2_(num_(req.cash)), momo = r2_(num_(req.momo));
    if (cash < 0 || momo < 0 || cash + momo <= 0) throw new Error('bad_amount');
    var bal = bal_(balances_(rows_('Sales'), rows_('Payments')), row[4]), after = r2_(bal + num_(row[6]) + num_(row[7]) - cash - momo);
    if (after < -0.004) throw new Error('more_than_owed');
    var before = 'cash ' + num_(row[6]).toFixed(2) + ', momo ' + num_(row[7]).toFixed(2);
    sh.getRange(at + 2, 7, 1, 2).setValues([[cash, momo]]);
    xappend_('Edit log', [Utilities.formatDate(new Date(), tz_(), 'yyyy-MM-dd HH:mm'), user.name, id, String(row[3]), String(row[4]), reason, before, 'cash ' + cash.toFixed(2) + ', momo ' + momo.toFixed(2) + ' (debt payment)']);
    return { ok: true };
  } finally { lock.releaseLock(); }
}
function editHand_(user, req) {
  var lock = LockService.getScriptLock();
  lock.waitLock(28000);
  try {
    var id = String(req.id || ''), reason = String(req.reason || '').trim();
    if (reason.length < 3) throw new Error('reason_needed');
    var sh = sh_('Cash'), last = sh.getLastRow(); if (last < 2) throw new Error('not_found');
    var data = sh.getRange(2, 1, last - 1, 6).getValues(), at = -1;
    data.forEach(function (r, i) { if (String(r[0]) === id && r[2] === 'Handover') at = i; });
    if (at < 0) throw new Error('not_found');
    var row = data[at], amt = r2_(num_(req.amount)), date = String(req.date || d_(row[1])), note = String(req.note == null ? row[5] : req.note).slice(0, 200);
    if (!(amt > 0)) throw new Error('bad_amount');
    if (!isDate_(date)) throw new Error('bad_date');
    var held = cashHeld_(rows_('Payments'), rows_('Cash'), row[3]) + num_(row[4]) - amt;
    if (held < -0.004) throw new Error('more_than_held');
    sh.getRange(at + 2, 2, 1, 1).setValues([[date]]); sh.getRange(at + 2, 5, 1, 2).setValues([[amt, note]]);
    xappend_('Edit log', [Utilities.formatDate(new Date(), tz_(), 'yyyy-MM-dd HH:mm'), user.name, id, String(row[3]), '', reason, 'handover ' + num_(row[4]).toFixed(2) + ' on ' + d_(row[1]), 'handover ' + amt.toFixed(2) + ' on ' + date]);
    return { ok: true };
  } finally { lock.releaseLock(); }
}


/* ---------- weekly printable sheets (Monday to Sunday, numbered from the first Monday on or before 1 Jan) ---------- */
function wUtc_(s) { var p = String(s).split('-'); return Date.UTC(+p[0], +p[1] - 1, +p[2]); }
function wStr_(ms) { var d = new Date(ms); return d.getUTCFullYear() + '-' + ('0' + (d.getUTCMonth() + 1)).slice(-2) + '-' + ('0' + d.getUTCDate()).slice(-2); }
function wMonday_(s) { var ms = wUtc_(s), dow = new Date(ms).getUTCDay(); return ms - ((dow + 6) % 7) * 86400000; }
function weekSheet_(req) {
  var date = String(req.date || xToday_(req));
  if (!isDate_(date)) throw new Error('bad_date');
  var mon = wMonday_(date), year = new Date(mon).getUTCFullYear(), m1 = wMonday_(year + '-01-01'), no = Math.round((mon - m1) / (7 * 86400000)) + 1;
  var days = [], i;
  for (i = 0; i < 7; i++) days.push(wStr_(mon + i * 86400000));
  var reps = days.map(function (d) { return dayReport_({ date: d }); }), people = [];
  reps[0].people.forEach(function (p0, pi) {
    var t = { name: p0.name, days: [], sales: 0, cash: 0, momo: 0, credit: 0, debtIn: 0, handed: 0, bills: 0 };
    reps.forEach(function (rp, di) {
      var p = rp.people[pi];
      t.days.push({ date: days[di], bills: p.bills, sales: p.sales, cash: p.cash, momo: p.momo, credit: p.credit, debtIn: p.debtIn, handed: p.handed, heldEnd: p.heldEnd, bills_: p.bills_, pays: p.pays, closed: p.closed ? { counted: p.closed.counted, expected: p.closed.expected, diff: p.closed.diff } : null });
      ['sales', 'cash', 'momo', 'credit', 'debtIn', 'handed', 'bills'].forEach(function (f) { t[f] = r2_(t[f] + p[f]); });
    });
    t.heldEnd = t.days[6].heldEnd;
    t.heldStart = r2_(t.days[0].heldEnd - t.days[0].cash + t.days[0].handed);
    people.push(t);
  });
  return { ok: true, week: no, year: year, from: days[0], to: days[6], printedAt: nowDate_() + ' ' + nowTime_(), people: people };
}
