/* KL Bread - extra screens: notes, owner team view, corrections (loaded after the main app) */
(function () {
  const KL = window.KL;
  if (!KL) return;
  const { S, ACT, ERR, ICON, api, uid, esc, money, r2, sum, kk, $, today, nowTime, toast, sheet, closeSheet, putOne, derived, fetchReport, refreshCache, syncSoon, errText, WALKIN } = KL;
  const render = k => KL.fn('render')(k);
  const X = KL.X = { person: null, data: null, loading: false, open: null, edit: null, day: null };
  Object.assign(ERR, {
    reason_needed: 'Please write the reason for the correction.', too_old: 'Only the last 30 days can be corrected.',
    unknown_customer: 'Choose a customer from the list.', not_found: 'That sale was not found.', empty_note: 'Write the note first.'
  });
  ICON.team = '<svg viewBox="0 0 24 24"><circle cx="9" cy="8" r="3.2"/><path d="M3 20c0-3.3 2.7-6 6-6s6 2.7 6 6M16 5a3 3 0 0 1 0 6M18 14c2 .6 3.5 2.6 3.5 5"/></svg>';

  /* ---------- helpers ---------- */
  const ex = () => (S.cache && S.cache.extra) || { notes: [], edits: [] };
  const stamp = n => n.date + ' ' + String(n.time || '').slice(0, 5);
  function notesFor(bill) {
    const out = ex().notes.filter(n => n.bill === bill), seen = new Set(out.map(n => n.id));
    S.applied.concat(S.queue).forEach(o => { if (o.type === 'note' && o.bill === bill && !seen.has(o.id)) out.push({ id: o.id, date: o.date, time: o.time, person: S.session.name, bill, text: o.text, pending: true }); });
    return out.sort((a, b) => stamp(a) < stamp(b) ? -1 : 1);
  }
  const editsFor = bill => ex().edits.filter(e => e.bill === bill);
  function openNotes() {
    return ex().notes.filter(n => !ex().edits.some(e => e.bill === n.bill && e.when >= stamp(n)));
  }
  function infoHTML(bill) {
    let h = '';
    editsFor(bill).forEach(e => { h += '<div class="card" style="border-left:4px solid var(--violet)"><b class="small">Corrected by ' + esc(e.by) + ' · ' + esc(e.when) + '</b><div class="small">Reason: ' + esc(e.reason) + '</div><div class="small muted">Before: ' + esc(e.before) + '</div><div class="small">Now: ' + esc(e.after) + '</div></div>'; });
    notesFor(bill).forEach(n => { h += '<div class="card" style="border-left:4px solid var(--wine)"><b class="small">Note · ' + esc(n.person) + ' · ' + esc(stamp(n)) + (n.pending ? ' · not sent yet' : '') + '</b><div class="small">' + esc(n.text) + '</div></div>'; });
    return h;
  }
  function billReceiptHTML(b) {
    const paid = r2((b.cash || 0) + (b.momo || 0) + (b.paid || 0)), bal = r2(b.total - paid);
    return '<div class="receipt"><div class="muted small">' + esc(b.customer) + ' · ' + esc(b.date || '') + ' ' + esc(String(b.time || '').slice(0, 5)) + (b.person ? ' · ' + esc(b.person) : '') + '</div><hr>' +
      b.items.map(i => '<div class="l"><span>' + i.q + ' × ' + esc(i.p) + '</span><span>' + money(i.q * i.u) + '</span></div>').join('') + '<hr>' +
      '<div class="l tot"><span>Total</span><span>' + money(b.total) + '</span></div><div class="l"><span>Paid</span><span>' + money(paid) + '</span></div>' +
      (bal > 0.004 ? '<div class="l"><span>Owes</span><span>' + money(bal) + '</span></div>' : '') + '</div>';
  }

  /* ---------- sales person: notes ---------- */
  function noteSheet(bill) {
    sheet('<h2>Add a note</h2><p class="small muted">Use this if you made a mistake in this sale. The owner will see your note. You cannot change the sale yourself, and a note cannot be edited after it is sent.</p><label>What went wrong?</label><textarea id="xnt" rows="4" maxlength="300" style="width:100%;font:inherit;padding:12px;border:1.5px solid var(--line);border-radius:12px" placeholder="Example: I entered 3 loaves but it should be 5"></textarea><br><button class="btn primary block" data-act="xnotesave" data-id="' + esc(bill) + '">Send note</button>');
  }
  ACT.xnote = d => noteSheet(d.id);
  ACT.xnotesave = async d => {
    const text = ($('#xnt').value || '').trim();
    if (!text) { toast('Write the note first'); return; }
    const op = { type: 'note', id: uid('N'), ts: Date.now(), date: today(), time: nowTime(), bill: d.id, text: text.slice(0, 300) };
    S.queue.push(op); await putOne('queue', op);
    closeSheet(); toast('Note saved'); render(true); syncSoon();
  };

  // receipt opened from the Today tab gets the note button + any notes/corrections
  const _receiptSheet = KL.fn('receiptSheet');
  KL.setFn('receiptSheet', function (b, fresh) {
    _receiptSheet(b, fresh);
    if (fresh || !b.id || S.session.role === 'admin') return;
    const sh = $('.sheet'); if (!sh) return;
    sh.insertAdjacentHTML('beforeend', '<div style="margin-top:10px">' + infoHTML(b.id) + '<button class="btn block" data-act="xnote" data-id="' + esc(b.id) + '">Report a mistake / add a note</button></div>');
  });

  /* ---------- day-by-day view (shared by sales person History and owner Team) ---------- */
  const WD = ['Sun', 'Mon', 'Tue', 'Wed', 'Thu', 'Fri', 'Sat'], MON = ['Jan', 'Feb', 'Mar', 'Apr', 'May', 'Jun', 'Jul', 'Aug', 'Sep', 'Oct', 'Nov', 'Dec'];
  const dObj = s => { const p = String(s).split('-'); return new Date(+p[0], +p[1] - 1, +p[2], 12); };
  const dStr = d => d.getFullYear() + '-' + String(d.getMonth() + 1).padStart(2, '0') + '-' + String(d.getDate()).padStart(2, '0');
  const dLong = s => { const d = dObj(s); return WD[d.getDay()] + ' ' + d.getDate() + ' ' + MON[d.getMonth()]; };
  function dayView(days, owner) {
    const by = {}; days.forEach(d => { by[d.date] = d; });
    const t = today(), list = [];
    for (let i = 0; i < 30; i++) { const d = dObj(t); d.setDate(d.getDate() - i); list.push(dStr(d)); }
    let sel = X.day && list.indexOf(X.day) >= 0 ? X.day : t;
    let out = '<div class="chips" style="margin:8px 0;overflow-x:auto;flex-wrap:nowrap;padding-bottom:4px">' + list.map(ds => {
      const d = dObj(ds), has = !!by[ds];
      return '<button class="chip ' + (ds === sel ? 'on' : '') + '" style="flex:0 0 auto;text-align:center;line-height:1.15;min-width:54px" data-act="xday" data-d="' + ds + '"><span class="small">' + (ds === t ? 'Today' : WD[d.getDay()]) + '</span><br><b>' + d.getDate() + '</b>' + (has ? '<br><span style="font-size:9px">●</span>' : '<br><span style="font-size:9px;opacity:.3">○</span>') + '</button>';
    }).join('') + '</div>';
    out += '<h2 style="margin-top:4px">' + esc(dLong(sel)) + '</h2>';
    const day = by[sel];
    if (!day) return out + '<div class="empty">No sales on this day.</div>' + (KL.x.stockBox ? KL.x.stockBox(sel, owner) : '');
    const sales = day.rows.filter(r => r.kind === 'sale'), pays = day.rows.filter(r => r.kind === 'pay');
    const paidOf = r => r.paid !== undefined ? r.paid : r2((r.cash || 0) + (r.momo || 0));
    const total = r2(sum(sales, r => r.total)), credit = r2(sum(sales, r => Math.max(0, r2(r.total - paidOf(r))))), debtIn = r2(sum(pays, r => r.total));
    const hasSplit = sales.concat(pays).some(r => r.cash !== undefined);
    const cash = r2(sum(sales.concat(pays), r => r.cash || 0)), momo = r2(sum(sales.concat(pays), r => r.momo || 0));
    const box = (l, v, c) => '<div class="stat ' + (c || '') + '"><span>' + l + '</span><b>' + v + '</b></div>';
    out += '<div class="stats">' + box('Sales made', sales.length, 'violet') + box('Total sold', money(total), 'wine') +
      (hasSplit ? box('Cash received', money(cash)) + box('MoMo received', money(momo)) : box('Money received', money(day.collected))) +
      box('Credit given', money(credit)) + box('Debts paid to you', money(debtIn)) + '</div>';
    if (KL.x.stockBox) out += KL.x.stockBox(sel, owner);
    out += '<div class="card" style="padding:4px 14px;margin-top:10px">' + day.rows.map(r => {
      if (r.kind === 'pay') return '<div class="item"><span class="grow"><span class="nm">' + esc(r.customer) + '</span><br><span class="small muted">' + esc(r.time) + ' · debt payment</span></span><span class="right"><span class="amt">' + money(r.total) + '</span></span></div>';
      const bal = r2(r.total - paidOf(r)), tags = (editsFor(r.id).length ? ' · <b style="color:var(--violet)">corrected</b>' : '') + (notesFor(r.id).length ? (owner ? ' · <b class="red">note</b>' : ' · note sent') : '');
      return '<button class="item" data-act="xbill" data-id="' + esc(r.id) + '"><span class="grow"><span class="nm">' + esc(r.customer) + '</span><br><span class="small muted">' + esc(r.time) + ' · ' + esc(r.items.map(i => i.q + ' ' + i.p).join(', ')) + tags + '</span></span><span class="right"><span class="amt">' + money(r.total) + '</span>' + (bal > 0.004 ? '<br><span class="small red">owes ' + money(bal) + '</span>' : '') + '</span></button>';
    }).join('') + '</div>';
    return out;
  }
  ACT.xday = d => { X.day = d.d; render(true); };

  /* ---------- sales person: History with corrections and notes ---------- */
  KL.setFn('historyHTML', function () {
    const h = S.hist;
    let out = '<h2 style="margin-top:6px">My sales by day</h2>';
    if (!h) return out + '<div class="empty">' + (navigator.onLine ? 'Loading…' : 'Open this tab once with internet to load your history.') + '</div>';
    const mine = ex().edits;
    if (mine.length) out += '<div class="banner"><span>The owner corrected ' + mine.length + ' of your sale(s). Tap the sale to see why.</span></div>';
    out += '<p class="small muted" style="margin:0 2px 6px">Pick a day. ● means you made sales that day. Shown as of the last time you were online.</p>';
    return out + dayView(h.days, false);
  });
  ACT.xbill = d => {
    let b = null;
    if (S.hist) S.hist.days.forEach(day => day.rows.forEach(r => { if (r.id === d.id && r.kind === 'sale') b = Object.assign({ date: day.date }, r); }));
    if (!b && X.data) X.data.days.forEach(day => day.rows.forEach(r => { if (r.id === d.id && r.kind === 'sale') b = Object.assign({ date: day.date, person: X.data.person }, r); }));
    if (!b) return;
    const admin = S.session.role === 'admin';
    sheet('<h2>Sale</h2>' + billReceiptHTML(b) + infoHTML(b.id) +
      (admin ? '<button class="btn primary block" data-act="xedit" data-id="' + esc(b.id) + '">Correct this sale</button>' : '<button class="btn block" data-act="xnote" data-id="' + esc(b.id) + '">Report a mistake / add a note</button>'));
  };
  KL.x = { dLong, dayView, ex, stamp, notesFor, editsFor, openNotes, infoHTML, billReceiptHTML };
})();
