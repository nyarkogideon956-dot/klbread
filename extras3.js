/* KL Bread - owner: records list, delete with confirmation, start fresh (loaded after extras2.js) */
(function () {
  const KL = window.KL;
  if (!KL) return;
  const { S, ACT, ERR, api, uid, nowTime, esc, money, $, today, WALKIN, toast, sheet, closeSheet, refreshCache, fetchReport, derived, kk, sum, r2, errText } = KL;
  const X = KL.X || {};
  const render = k => KL.fn('render')(k);
  const delOne = KL.delOne;
  Object.assign(ERR, { already_live: 'The app is already live, so it cannot be cleared again.', not_confirmed: 'Type DELETE ALL to confirm.', wrong_key: 'That owner key is not correct.' });

  async function loadRecords() {
    if (!S.session || S.session.role !== 'admin' || !navigator.onLine) return;
    try { const r = await api('x', { op: 'records', days: 30 }); if (r.ok) S.recs = r; } catch (e) { /* ignore */ }
    if (S.tab === 'cash') render(true);
  }
  function recDesc(x) {
    if (x.kind === 'sale') return 'Sale to ' + x.customer + ' by ' + x.person + ', ' + x.date + ' ' + x.time + ' - ' + x.items.map(i => i.q + ' ' + i.p).join(', ') + ' - ' + money(x.total);
    if (x.kind === 'pay') return 'Debt payment from ' + x.customer + ' to ' + x.person + ', ' + x.date + ' - ' + money(x.total);
    return (x.type === 'Bank' ? 'Sent to bank' : 'Handed over by ' + x.person) + ', ' + x.date + ' - ' + money(x.total);
  }
  function recordsHTML() {
    const r = S.recs;
    let h = '<h2>Records - last 30 days</h2>';
    if (!r) return h + '<div class="empty">' + (navigator.onLine ? 'Loading…' : 'Needs internet.') + '</div>';
    if (!r.rows.length) h += '<div class="empty">Nothing recorded yet.</div>';
    else h += '<div class="card" style="padding:4px 14px">' + r.rows.slice(0, 150).map(x => {
      const top = x.kind === 'sale' ? esc(x.customer) : x.kind === 'pay' ? esc(x.customer) + ' · debt payment' : (x.type === 'Bank' ? 'Sent to bank' : 'Handover · ' + esc(x.person));
      const sub = esc(x.date + (x.time ? ' ' + x.time : '')) + (x.kind === 'cash' ? '' : ' · ' + esc(x.person)) + (x.kind === 'sale' ? ' · ' + esc(x.items.map(i => i.q + ' ' + i.p).join(', ')) : '');
      return '<div class="line"><div><div class="nm">' + top + ' · ' + money(x.total) + '</div><div class="small muted">' + sub + '</div></div><button class="btn sm danger" data-act="delrec" data-k="' + x.kind + '" data-id="' + esc(x.id) + '">Delete</button></div>';
    }).join('') + '</div>';
    h += '<h2>' + (r.live ? 'Danger zone' : 'Ready to start?') + '</h2><div class="card"><p class="small muted" style="margin-top:0">Clears all sales, payments, cash, notes and old debts. Your breads, prices and sales persons stay. A copy is kept in the Google Sheet (Cleared data). You must type your owner key and DELETE ALL.</p><button class="btn danger block" data-act="startfresh">Start fresh</button></div>';
    return h;
  }
  const _cashHTML = KL.fn('cashHTML');
  KL.setFn('cashHTML', function () { return _cashHTML() + recordsHTML(); });
  const _tabAct = ACT.tab;
  ACT.tab = d => { _tabAct(d); if (d.t === 'cash') loadRecords(); };

  ACT.delrec = d => {
    const x = S.recs && S.recs.rows.find(y => y.kind === d.k && y.id === d.id); if (!x) return;
    sheet('<h2>Delete this record?</h2><p>' + esc(recDesc(x)) + '</p><p class="red small">This removes it from the Google Sheet for good. It cannot be undone' + (x.kind === 'sale' ? ' and it also removes the payment taken with this sale' : '') + '. The deletion is written in the Deleted log.</p><div class="row"><button class="btn grow" data-act="close">Cancel</button><button class="btn danger grow" data-act="dodel" data-k="' + x.kind + '" data-id="' + esc(x.id) + '">Delete permanently</button></div>');
  };
  ACT.dodel = async d => {
    const x = S.recs && S.recs.rows.find(y => y.kind === d.k && y.id === d.id);
    try {
      const r = await api('x', { op: 'delete', kind: d.k, id: d.id, detail: x ? recDesc(x) : '' });
      if (!r.ok) { toast(KL.errText(r.error)); return; }
    } catch (e) { toast('Needs internet'); return; }
    KL.closeSheet(); toast('Deleted');
    await loadRecords(); await refreshCache(); await fetchReport(true);
  };
  ACT.startfresh = () => {
    sheet('<h2 class="red">Start fresh</h2><p class="small muted">This removes all sales, payments, cash records, notes and old debts for everyone. Make sure every phone shows 0 not sent. A copy is kept in the Google Sheet, in a sheet called <b>Cleared data</b>.</p>' +
      '<label>Customers</label><select id="sfk"><option value="0">Clear customers too</option><option value="1">Keep my customers list</option></select>' +
      '<label>Type your owner key</label><input id="sfo" type="password" autocomplete="off">' +
      '<label>Type DELETE ALL to confirm</label><input id="sfc" autocomplete="off">' +
      '<label style="display:flex;gap:10px;align-items:center;margin-top:12px"><input id="sfu" type="checkbox" style="width:auto"> I understand everyone\'s records will be removed</label>' +
      '<button class="btn danger block" id="sfgo" data-act="dostart" disabled style="margin-top:12px">Wait 5…</button>');
    let n = 5; const t = setInterval(() => { const b = document.getElementById('sfgo'); if (!b) { clearInterval(t); return; } n--; if (n > 0) b.textContent = 'Wait ' + n + '…'; else { b.disabled = false; b.textContent = 'Delete everything now'; clearInterval(t); } }, 1000);
  };
  ACT.dostart = async () => {
    const confirm = $('#sfc').value.trim(), ownerKey = $('#sfo').value.trim();
    if (!ownerKey) { toast('Type your owner key'); return; }
    if (confirm.toUpperCase() !== 'DELETE ALL') { toast('Type DELETE ALL to confirm'); return; }
    if (!$('#sfu').checked) { toast('Tick the box to confirm'); return; }
    if (!navigator.onLine) { toast('Needs internet'); return; }
    try {
      const r = await api('x', { op: 'startfresh', confirm, ownerKey, keepCustomers: $('#sfk').value === '1' });
      if (!r.ok) { toast(KL.errText(r.error)); return; }
    } catch (e) { toast('Needs internet'); return; }
    KL.closeSheet(); toast('Done. The app is live.');
    for (const st of ['queue', 'applied', 'failed']) { for (const o of S[st]) await delOne(st, o.id); S[st] = []; }
    S.rep = null; S.hist = null; S.recs = null;
    await loadRecords(); await refreshCache(); await fetchReport(true);
  };


  /* ---------- owner: all debts summary on the Dashboard ---------- */
  function ownerDebts() {
    const st = document.querySelector('main.wrap .stats'); if (!st || document.getElementById('xdebts')) return;
    const list = derived().customers.filter(c => (c.balance || 0) > 0.004);
    const total = r2(sum(list, c => c.balance)), by = {};
    list.forEach(c => { const k = c.person || '(no sales person)'; (by[k] = by[k] || []).push(c); });
    const persons = Object.keys(by).map(k => ({ name: k, rows: by[k].sort((a, b) => b.balance - a.balance), total: r2(sum(by[k], c => c.balance)) })).sort((a, b) => b.total - a.total);
    const openAll = list.length <= 12;
    let h = '';
    const rp = (S.rep && S.rep.people) || [];
    if (rp.length) {
      const MONS = ['Jan', 'Feb', 'Mar', 'Apr', 'May', 'Jun', 'Jul', 'Aug', 'Sep', 'Oct', 'Nov', 'Dec'], gt = f => r2(sum(rp, p => p[f] || 0));
      const num = v => money(v).replace(/^GH\S+\s*/, '');
      const cell = (v, c) => '<span style="text-align:right;white-space:nowrap;font-variant-numeric:tabular-nums" class="' + (c || '') + '">' + num(v) + '</span>';
      h += '<h2 id="xdebts">Sales persons summary · ' + MONS[(S.rep.month || 1) - 1] + ' <span class="small muted">(GH₵)</span></h2><div class="card" style="padding:6px 14px;overflow-x:auto"><div style="display:grid;grid-template-columns:minmax(80px,1.2fr) repeat(3,minmax(70px,1fr));gap:6px 8px;align-items:baseline;font-size:14px;min-width:300px">' +
        '<b class="small muted">Name</b><b class="small muted" style="text-align:right">Sales</b><b class="small muted" style="text-align:right">Debt</b><b class="small muted" style="text-align:right">Cash held</b>' +
        rp.map(p => '<span><b>' + esc(p.name) + '</b></span>' + cell(p.sales) + cell(p.owed, p.owed > 0.004 ? 'red' : '') + cell(p.cashHeld)).join('') +
        '<b style="border-top:1.5px solid var(--line);padding-top:8px">Total</b><b style="border-top:1.5px solid var(--line);padding-top:8px;text-align:right;white-space:nowrap">' + num(gt('sales')) + '</b><b class="red" style="border-top:1.5px solid var(--line);padding-top:8px;text-align:right;white-space:nowrap">' + num(gt('owed')) + '</b><b style="border-top:1.5px solid var(--line);padding-top:8px;text-align:right;white-space:nowrap">' + num(gt('cashHeld')) + '</b></div></div>';
    }
    h += '<h2>All debts · ' + money(total) + '</h2>';
    if (!list.length) h += '<div class="card"><div class="small muted">Nobody owes you right now.</div></div>';
    else h += '<div class="card" style="padding:4px 14px"><div class="small muted" style="padding:8px 0">' + list.length + ' customer(s) owing. Tap a name to collect payment or add an old debt.</div>' + persons.map(p =>
      '<details' + (openAll ? ' open' : '') + ' style="border-top:1px solid var(--line)"><summary style="display:flex;justify-content:space-between;gap:10px;padding:12px 0;cursor:pointer;list-style:none"><b>' + esc(p.name) + ' <span class="small muted">(' + p.rows.length + ')</span></b><b class="red">' + money(p.total) + '</b></summary>' +
      p.rows.map(c => '<button class="item" data-act="cust" data-n="' + esc(c.name) + '"><span class="grow"><span class="nm">' + esc(c.name) + '</span>' + (c.last ? '<br><span class="small muted">last bought ' + esc(c.last) + '</span>' : '') + '</span><span class="right"><span class="amt red">' + money(c.balance) + '</span></span></button>').join('') + '</details>').join('') + '</div>';
    st.insertAdjacentHTML('afterend', h);
  }
  /* ---------- who owes me (sales person Today tab) ---------- */
  Object.assign(ERR, { bad_amount: 'Type an amount of 0 or more.' });
  const _render3 = KL.fn('render');
  KL.setFn('render', function (k) {
    _render3(k);
    if (S.session && S.session.role === 'admin' && S.tab === 'dash') { ownerDay(); ownerDebts(); return; }
    if (!S.session || S.session.role === 'admin' || S.tab !== 'today') return;
    const st = document.querySelector('main.wrap .stats'); if (!st || document.getElementById('xowing')) return;
    const me = kk(S.session.name);
    const list = derived().customers.filter(c => kk(c.person) === me && (c.balance || 0) > 0.004).sort((a, b) => b.balance - a.balance);
    const total = r2(sum(list, c => c.balance));
    st.insertAdjacentHTML('afterend', closeCardHTML() + '<h2 id="xowing">Who owes me' + (list.length ? ' · ' + money(total) : '') + '</h2><div class="card" style="padding:4px 14px">' +
      (list.length ? list.map(c => '<button class="item" data-act="cust" data-n="' + esc(c.name) + '"><span class="grow"><span class="nm">' + esc(c.name) + '</span></span><span class="right"><span class="amt red">' + money(c.balance) + '</span></span></button>').join('') : '<div class="small muted" style="padding:10px 0">Nobody owes you right now.</div>') + '</div>');
  });

  /* ---------- owner: add old debt from before the app ---------- */
  const _cust = ACT.cust;
  ACT.cust = d => {
    _cust(d);
    if (!S.session || S.session.role !== 'admin') return;
    const sh = document.querySelector('.sheet'); if (!sh) return;
    sh.insertAdjacentHTML('beforeend', '<button class="btn block" style="margin-top:10px" data-act="xdebt" data-n="' + esc(d.n) + '">Add old debt (from before the app)</button>');
  };
  ACT.xdebt = async d => {
    if (!navigator.onLine) { toast('Needs internet'); return; }
    let cur = 0;
    try { const r = await api('x', { op: 'openget' }); if (r.ok) cur = r.openings[String(d.n).trim().toLowerCase()] || 0; } catch (e) { toast('Needs internet'); return; }
    sheet('<h2>Old debt: ' + esc(d.n) + '</h2><p class="small muted">Type the total this customer owed you before you started using the app. It is added to what he owes now. Payments reduce it. Saving again replaces the old amount. Type 0 to remove it.</p>' +
      '<label>Old debt (GH₵)</label><input id="xdamt" type="number" inputmode="decimal" min="0" value="' + (cur || '') + '" placeholder="0" style="width:100%;font:inherit;padding:12px;border:1.5px solid var(--line);border-radius:12px">' +
      '<label style="margin-top:10px;display:block">Note (optional)</label><input id="xdnote" maxlength="200" placeholder="Example: bread taken in September" style="width:100%;font:inherit;padding:12px;border:1.5px solid var(--line);border-radius:12px">' +
      '<button class="btn primary block" style="margin-top:12px" data-act="xdebtsave" data-n="' + esc(d.n) + '">Save old debt</button>');
  };
  ACT.xdebtsave = async d => {
    const amount = +$('#xdamt').value || 0, note = $('#xdnote').value || '';
    try {
      const r = await api('x', { op: 'openset', customer: d.n, amount, note });
      if (!r.ok) { toast(errText(r.error)); return; }
      closeSheet(); toast('Saved'); await refreshCache(); S.rep = null; if (navigator.onLine) fetchReport(true); render(true);
    } catch (e) { toast('Needs internet'); }
  };

  /* ---------- check before saving: preview + Confirm on every entry ---------- */
  function confirmBox(title, rows, ok) {
    const old = document.getElementById('xconf'); if (old) old.remove();
    const ov = document.createElement('div'); ov.className = 'ov'; ov.id = 'xconf'; ov.style.zIndex = 60;
    ov.innerHTML = '<div class="sheet" role="dialog"><h2>' + esc(title) + '</h2><p class="small muted" style="margin:0 0 8px">Check the details. Nothing is saved until you confirm.</p><div style="border:1.5px solid var(--line);border-radius:12px;padding:6px 12px">' +
      rows.map(r => r[0] === 'html' ? r[1] : '<div class="row between" style="padding:6px 0;gap:12px;align-items:baseline"><span class="muted">' + esc(r[0]) + '</span><b class="' + (r[2] || '') + '" style="text-align:right;overflow-wrap:anywhere">' + esc(r[1]) + '</b></div>').join('') +
      '</div><div class="row" style="margin-top:12px"><button class="btn grow" id="xconf-back">Go back</button><button class="btn primary grow" id="xconf-ok">Confirm and save</button></div></div>';
    document.body.appendChild(ov);
    const close = () => { ov.remove(); };
    ov.addEventListener('click', e => { if (e.target === ov) close(); });
    document.getElementById('xconf-back').onclick = close;
    document.getElementById('xconf-ok').onclick = () => { close(); ok(); };
  }
  function guard(name, build) {
    const orig = ACT[name]; if (!orig) return;
    ACT[name] = function (d, a, e) {
      let b = null;
      try { b = build(d); } catch (err) { b = null; }
      if (!b) return orig.call(this, d, a, e);
      confirmBox(b.title, b.rows, () => orig.call(null, d, a, e));
    };
  }
  const val = id => { const el = document.getElementById(id); return el ? el.value : ''; };
  const n2 = v => r2(+v || 0);
  const custOf = name => derived().customers.find(c => kk(c.name) === kk(name));

  /* ---------- paid more than the bill: the extra goes to the old balance ---------- */
  function saleCalc() {
    const c = S.cart; if (!c || !c.lines.length || !c.customer) return null;
    if (c.lines.some(l => !(l.q > 0) || l.u < 0)) return null;
    const t = r2(sum(c.lines, l => l.q * l.u));
    let cash = 0, momo = 0;
    if (c.mode === 'cash') cash = t; else if (c.mode === 'momo') momo = t; else if (c.mode !== 'credit') { cash = n2(c.cash); momo = n2(c.momo); }
    const bal = r2(t - cash - momo), cu = custOf(c.customer), before = cu && cu.balance > 0 ? cu.balance : 0;
    const extra = bal < -0.004 ? r2(-bal) : 0, extraCash = Math.min(cash, extra), extraMomo = r2(extra - extraCash);
    return { c, t, cash, momo, bal, cu, before, extra, extraCash, extraMomo, saleCash: r2(cash - extraCash), saleMomo: r2(momo - extraMomo),
      okExtra: extra > 0 && kk(c.customer) !== kk(WALKIN) && extra <= before + 0.004 };
  }
  const _saveSaleOrig = ACT.savesale;
  ACT.savesale = async function (d, a, e) {
    const k = saleCalc();
    if (!k || !k.okExtra) return _saveSaleOrig.call(this, d, a, e);
    // save the sale for exactly its total, then record the extra as a payment on the old balance
    k.c.mode = 'split'; k.c.cash = k.saleCash; k.c.momo = k.saleMomo;
    const name = k.c.customer;
    await _saveSaleOrig.call(this, d, a, e);
    const pay = { type: 'payment', id: uid('P'), ts: Date.now() + 1, date: today(), time: nowTime(), customer: name, cash: k.extraCash, momo: k.extraMomo, person: S.session.name };
    S.queue.push(pay); await KL.putOne('queue', pay);
    render(true); KL.syncSoon();
    toast('Extra ' + money(k.extra) + ' taken off his old balance');
  };
  guard('savesale', () => {
    const k = saleCalc(); if (!k) return null;
    if (k.bal < -0.004 && !k.okExtra) return null;
    const rows = [['Customer', k.c.customer]].concat(k.c.lines.map(l => [l.q + ' × ' + l.p, money(l.q * l.u)]));
    rows.push(['Total', money(k.t)]);
    if (k.cash) rows.push(['Cash given', money(k.cash)]); if (k.momo) rows.push(['MoMo given', money(k.momo)]);
    if (k.extra > 0) {
      rows.push(['Extra paid to old balance', money(k.extra), 'green'], ['He owed before', money(k.before)], ['He will owe after', money(r2(k.before - k.extra)), r2(k.before - k.extra) > 0.004 ? 'red' : 'green']);
    } else if (k.bal > 0.004) {
      rows.push(['Owed on this sale', money(k.bal), 'red']);
      if (k.before > 0.004) rows.push(['He owed before', money(k.before)], ['Total he will owe', money(r2(k.before + k.bal)), 'red']);
    } else rows.push(['Fully paid', 'Yes', 'green']);
    return { title: 'Check this sale', rows };
  });
  // explain the extra on the sell screen instead of "paid is more than the total"
  new MutationObserver(() => {
    const el = document.getElementById('paysum'); if (!el || el.dataset.x === '1') return;
    if (!/Paid is more than the total/.test(el.textContent)) return;
    const k = saleCalc(); if (!k || !k.extra) return;
    el.dataset.x = '1';
    el.innerHTML = k.okExtra ? '<span class="green"><b>Extra ' + money(k.extra) + ' will reduce what he owes (he owes ' + money(k.before) + ')</b></span>' : '<span class="red"><b>Paid is more than the total' + (kk(k.c.customer) === kk(WALKIN) ? '. Choose a named customer to put the extra on his balance.' : ' and more than he owes.') + '</b></span>';
    setTimeout(() => { el.dataset.x = '0'; }, 50);
  }).observe(document.body, { childList: true, subtree: true, characterData: true });
  guard('savepay', d => {
    const cash = n2(val('pc')), momo = n2(val('pm')); if (cash + momo <= 0) return null;
    const cu = custOf(d.n), before = cu ? Math.max(0, cu.balance || 0) : 0, got = r2(cash + momo);
    const rows = [['Customer', d.n], ['Owes now', money(before), before > 0.004 ? 'red' : '']];
    if (cash) rows.push(['Cash received', money(cash)]); if (momo) rows.push(['MoMo received', money(momo)]);
    rows.push(['Total received', money(got)], ['Will owe after', money(Math.max(0, r2(before - got))), r2(before - got) > 0.004 ? 'red' : 'green']);
    if (got > before + 0.004) rows.push(['html', '<div class="small red" style="padding:6px 0">This is more than he owes. Check the amount.</div>']);
    return { title: 'Check this payment', rows };
  });
  guard('savecash', d => {
    const amount = n2(val('ca')); if (!(amount > 0)) return null;
    const rows = [['What', d.k === 'bank' ? 'Money sent to bank' : 'Cash received from ' + d.n], ['Amount', money(amount)], ['Date', val('cd') || today()]];
    if (val('cn').trim()) rows.push(['Note', val('cn').trim()]);
    return { title: 'Check this entry', rows };
  });
  guard('savecust', () => {
    const name = val('nn').trim().replace(/\s+/g, ' '); if (!name || kk(name) === kk(WALKIN)) return null;
    const rows = [['Name', name]]; if (val('np').trim()) rows.push(['Phone', val('np').trim()]); if (val('nl').trim()) rows.push(['Location', val('nl').trim()]);
    return { title: 'Check this customer', rows };
  });
  guard('xstocksave', d => {
    const prods = X.stockProds || [], items = prods.map((p, i) => ({ p, out: +val('xso' + i) || 0, back: +val('xsb' + i) || 0 })).filter(i => i.out > 0 || i.back > 0);
    if (!items.length || items.some(i => i.back > i.out)) return null;
    return { title: 'Check the bread record', rows: [['Sales person', X.person], ['Day', d.d]].concat(items.map(i => [i.p, 'out ' + i.out + ' · back ' + i.back])) };
  });
  guard('xdebtsave', d => {
    const amount = n2(val('xdamt')); const cu = custOf(d.n);
    const rows = [['Customer', d.n], ['Old debt will be', money(amount), amount > 0 ? 'red' : '']];
    if (val('xdnote').trim()) rows.push(['Note', val('xdnote').trim()]);
    if (cu) rows.push(['He owes now', money(Math.max(0, cu.balance || 0))]);
    return { title: 'Check this old debt', rows };
  });
  guard('xnotesave', () => {
    const t = val('xnt').trim(); if (!t) return null;
    return { title: 'Check your note', rows: [['html', '<div style="padding:8px 0;overflow-wrap:anywhere">' + esc(t) + '</div>']] };
  });

  /* ---------- sign-in time ---------- */
  function ping() {
    if (!S.session || !navigator.onLine) return;
    try { const last = +sessionStorage.getItem('kl_ping') || 0; if (Date.now() - last < 15 * 60000) return; sessionStorage.setItem('kl_ping', String(Date.now())); } catch (e) { /* ignore */ }
    api('x', { op: 'ping' }).catch(() => { });
  }
  const _login = ACT.login;
  if (_login) ACT.login = async function (d, a, e) { const r = await _login.call(this, d, a, e); setTimeout(ping, 1500); return r; };
  setTimeout(ping, 2500);

  /* ---------- sales person: close the day (count the cash) ---------- */
  Object.assign(ERR, { sales_only: 'Only sales persons close the day.' });
  const CD = { data: null, loading: false, tried: false };
  function loadClose() {
    if (CD.loading || !navigator.onLine) return; CD.loading = true;
    api('x', { op: 'mystatus' }).then(r => { CD.loading = false; CD.tried = true; if (r.ok) CD.data = r; if (S.tab === 'today') render(true); }).catch(() => { CD.loading = false; CD.tried = true; });
  }
  const diffText = d => d < -0.004 ? '<b class="red">short by ' + money(-d) + '</b>' : d > 0.004 ? '<b>extra ' + money(d) + '</b>' : '<b class="green">exact</b>';
  function closeCardHTML() {
    if (!CD.data && !CD.tried) loadClose();
    const c = CD.data && CD.data.closed;
    if (c) return '<div class="card" style="margin-top:10px"><b>Day closed at ' + esc(c.at) + '</b><div class="small" style="margin-top:4px">Counted ' + money(c.counted) + ' · should have ' + money(c.expected) + ' · ' + diffText(c.diff) + '</div><button class="btn sm" style="margin-top:8px" data-act="xclose">Count again</button></div>';
    return '<button class="btn violet block" style="margin-top:10px" data-act="xclose">Close day · count my cash</button>';
  }
  ACT.xclose = async () => {
    if (!navigator.onLine) { toast('Needs internet'); return; }
    if (S.queue.length) { toast('Send your sales first: open the menu and tap Sync'); return; }
    let exp = 0;
    try { const r = await api('x', { op: 'mystatus' }); if (r.ok) { CD.data = r; exp = r.expected; } } catch (e) { toast('Needs internet'); return; }
    sheet('<h2>Close day</h2><p class="small muted">Count all the cash in your hand. Type the amount. The app compares it with what your sales say you should have.</p>' +
      '<div class="stats"><div class="stat violet wide"><span>You should have</span><b>' + money(exp) + '</b></div></div>' +
      '<label>Cash I counted (GH₵)</label><input id="xcc" type="number" inputmode="decimal" min="0" placeholder="0" style="width:100%;font:inherit;padding:12px;border:1.5px solid var(--line);border-radius:12px">' +
      '<label style="margin-top:10px;display:block">Note (optional)</label><input id="xcn" maxlength="200" placeholder="Example: bread given to a customer" style="width:100%;font:inherit;padding:12px;border:1.5px solid var(--line);border-radius:12px">' +
      '<button class="btn primary block" style="margin-top:12px" data-act="xclosesave" data-e="' + exp + '">Close day</button>');
  };
  ACT.xclosesave = async d => {
    const counted = $('#xcc').value, note = $('#xcn').value || '';
    try {
      const r = await api('x', { op: 'closeday', counted, note });
      if (!r.ok) { toast(errText(r.error)); return; }
      CD.data = { ok: true, closed: r.closed, expected: r.expected }; KL.closeSheet(); toast('Day closed at ' + r.closed.at); render(true);
    } catch (e) { toast('Needs internet'); }
  };
  guard('xclosesave', d => {
    const v = val('xcc'); if (v === '' || !(+v >= 0)) return null;
    const exp = +d.e || 0, diff = r2(+v - exp);
    return { title: 'Check your cash count', rows: [['You should have', money(exp)], ['You counted', money(+v)], ['Difference', diff < -0.004 ? 'short by ' + money(-diff) : diff > 0.004 ? 'extra ' + money(diff) : 'exact', diff < -0.004 ? 'red' : diff > 0.004 ? '' : 'green'], ['html', '<div class="small muted" style="padding:6px 0">The owner will see the time and the difference.</div>']] };
  });

  /* ---------- owner: day report on the Dashboard ---------- */
  const DY = { date: null, data: null, loading: false };
  function loadDay() {
    if (!navigator.onLine) return; DY.loading = true; const want = DY.date;
    api('x', { op: 'dayreport', date: want }).then(r => { DY.loading = false; if (r.ok && DY.date === want) DY.data = r; if (S.tab === 'dash') render(true); }).catch(() => { DY.loading = false; });
  }
  function ownerDay() {
    const pk = document.querySelector('main.wrap .picker'); if (!pk || document.getElementById('xdaycard')) return;
    if (!DY.date) DY.date = today();
    if (!DY.data || DY.data.date !== DY.date) { if (!DY.loading) loadDay(); }
    const d = DY.data && DY.data.date === DY.date ? DY.data : null;
    let h = '<div class="card" id="xdaycard" style="margin-top:10px"><div class="row between" style="gap:10px;align-items:center"><h3 style="margin:0">Pick a day</h3><input id="xdd" type="date" value="' + esc(DY.date) + '" max="' + esc(today()) + '" style="font:inherit;padding:8px;border:1.5px solid var(--line);border-radius:10px"></div>';
    if (!d) h += '<p class="small muted">Loading…</p>';
    else {
      const t = f => r2(sum(d.people, p => p[f] || 0));
      h += '<div class="small muted" style="margin:6px 0">Total sales <b>' + money(t('sales')) + '</b> · cash ' + money(t('cash')) + ' · MoMo ' + money(t('momo')) + ' · credit ' + money(t('credit')) + ' · debts paid ' + money(t('debtIn')) + '</div>';
      h += d.people.map(p => {
        const seen = p.firstSeen ? 'Signed in ' + esc(p.firstSeen) + (p.lastSeen && p.lastSeen !== p.firstSeen ? ' · last seen ' + esc(p.lastSeen) : '') : 'Not seen';
        const sales = p.firstSale ? 'Sales ' + esc(p.firstSale) + ' to ' + esc(p.lastSale) : 'No sales';
        const cl = p.closed ? 'Closed ' + esc(p.closed.at) + ' · counted ' + money(p.closed.counted) + ' of ' + money(p.closed.expected) + ' · ' + diffText(p.closed.diff) : '<span class="muted">Day not closed</span>';
        return '<div style="border-top:1px solid var(--line);padding:8px 0"><div class="row between"><b>' + esc(p.name) + '</b><b>' + money(p.sales) + '</b></div><div class="small muted">' + p.bills + ' bill(s) · cash ' + money(p.cash) + ' · MoMo ' + money(p.momo) + ' · credit ' + money(p.credit) + (p.debtIn ? ' · debts paid ' + money(p.debtIn) : '') + (p.handed ? ' · handed over ' + money(p.handed) : '') + '</div><div class="small">' + seen + ' · ' + sales + '</div><div class="small">' + cl + '</div></div>';
      }).join('');
    }
    pk.insertAdjacentHTML('afterend', h + '</div>');
  }
  document.addEventListener('change', e => { if (e.target && e.target.id === 'xdd' && e.target.value) { DY.date = e.target.value; DY.data = null; render(true); } });
  if (S.session) render(true);
})();
