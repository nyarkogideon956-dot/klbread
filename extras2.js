/* KL Bread - extra screens: notes, owner team view, corrections (loaded after the main app) */
(function () {
  const KL = window.KL;
  if (!KL) return;
  const { S, ACT, ERR, ICON, api, uid, esc, money, r2, sum, kk, $, today, nowTime, toast, sheet, closeSheet, putOne, derived, fetchReport, refreshCache, syncSoon, errText, WALKIN } = KL;
  const render = k => KL.fn('render')(k);
  const { dLong, ex, stamp, notesFor, editsFor, openNotes, infoHTML, billReceiptHTML } = KL.x || {};
  if (!ex) return;
  const X = KL.X;
  /* ---------- owner: Team tab ---------- */
  const _tabsFor = KL.fn('tabsFor');
  KL.setFn('tabsFor', function () { const t = _tabsFor(); if (S.session.role === 'admin') t.splice(3, 0, ['team', 'Team']); return t; });
  const _render = KL.fn('render');
  KL.setFn('render', function (k) {
    _render(k);
    if (S.session && S.session.role === 'admin' && S.tab === 'team') { const m = document.querySelector('main.wrap'); if (m) m.innerHTML = teamHTML(); }
  });
  const _tabAct = ACT.tab;
  ACT.tab = d => { _tabAct(d); if (d.t === 'team') loadTeam(); };

  const people = () => ((S.rep && S.rep.people) || []).map(p => p.name);
  async function loadTeam() {
    if (!navigator.onLine) return;
    if (!S.rep) await fetchReport();
    if (X.person) {
      X.loading = true; render(true);
      try { const r = await api('x', { op: 'team', person: X.person, today: today() }); if (r.ok) X.data = r; else toast(errText(r.error)); } catch (e) { toast('Needs internet'); }
      X.loading = false;
    }
    if (S.tab === 'team') render(true);
    if (X.open && X.data) { const id = X.open; X.open = null; ACT.xbill({ id }); }
  }
  function teamHTML() {
    if (!S.session || S.session.role !== 'admin') return '';
    let h = '<h2 style="margin-top:6px">Sales persons</h2>';
    const open = openNotes();
    if (open.length) {
      h += '<h3 class="red">Notes waiting for you (' + open.length + ')</h3><div class="card" style="padding:4px 14px">' + open.map(n => '<button class="item" data-act="xopen" data-p="' + esc(n.person) + '" data-id="' + esc(n.bill) + '"><span class="grow"><span class="nm">' + esc(n.person) + '</span><br><span class="small">' + esc(n.text) + '</span><br><span class="small muted">' + esc(stamp(n)) + '</span></span></button>').join('') + '</div>';
    }
    const names = people();
    h += '<div class="chips" style="margin-top:8px">' + names.map(n => '<button class="chip ' + (X.person === n ? 'on' : '') + '" data-act="xperson" data-p="' + esc(n) + '">' + esc(n) + '</button>').join('') + '</div>';
    if (!names.length) h += '<div class="empty">Loading…</div>';
    if (!X.person) return h + '<p class="small muted">Choose a sales person to see his sales the way he sees them.</p>';
    if (X.loading || !X.data || X.data.person !== X.person) return h + '<div class="empty">Loading…</div>';
    const d0 = X.data;
    h += '<div class="stats" style="margin-top:10px"><div class="stat violet wide"><span>Cash ' + esc(X.person) + ' must hand to the owner</span><b>' + money(d0.cashHeld) + '</b></div></div>';
    h += '<p class="small muted" style="margin:8px 2px 0">Pick a day to see everything ' + esc(X.person) + ' did.</p>';
    h += KL.x.dayView(d0.days, true);
    return h;
  }
  ACT.xperson = d => { X.person = d.p; X.data = null; loadTeam(); };
  ACT.xopen = d => { X.person = d.p; X.data = null; X.open = d.id; loadTeam(); };

  /* ---------- owner: correct a sale ---------- */
  function findBill(id) {
    let b = null;
    if (X.data) X.data.days.forEach(day => day.rows.forEach(r => { if (r.id === id && r.kind === 'sale') b = Object.assign({ date: day.date }, r); }));
    return b;
  }
  function readEdit() {
    const e = X.edit; if (!e || !$('#xc')) return;
    e.customer = $('#xc').value; e.cash = +$('#xcash').value || 0; e.momo = +$('#xmomo').value || 0; e.reason = $('#xreason').value;
    e.lines.forEach((l, i) => { l.p = $('#xp' + i).value; l.q = +$('#xq' + i).value || 0; l.u = +$('#xu' + i).value || 0; });
  }
  function editHTML() {
    const e = X.edit, prods = (S.cache && S.cache.products) || [];
    const names = Array.from(new Set(derived().customers.map(c => c.name).concat([e.customer, WALKIN]))).sort();
    const pOpts = cur => Array.from(new Set(prods.map(p => p.name).concat([cur]))).map(n => '<option' + (n === cur ? ' selected' : '') + '>' + esc(n) + '</option>').join('');
    const total = r2(sum(e.lines, l => l.q * l.u));
    return '<h2>Correct this sale</h2><p class="small muted">The sales person will see that you corrected it, with your reason. Everything is saved in the Edit log.</p>' +
      '<label>Customer</label><select id="xc">' + names.map(n => '<option' + (n === e.customer ? ' selected' : '') + '>' + esc(n) + '</option>').join('') + '</select>' +
      e.lines.map((l, i) => '<div class="card" style="padding:8px"><select id="xp' + i + '">' + pOpts(l.p) + '</select><div class="row"><div class="grow"><label>Quantity</label><input id="xq' + i + '" type="number" inputmode="decimal" min="0" value="' + l.q + '"></div><div class="grow"><label>Price</label><input id="xu' + i + '" type="number" inputmode="decimal" min="0" value="' + l.u + '"></div></div>' + (e.lines.length > 1 ? '<button class="btn sm danger" data-act="xdelline" data-i="' + i + '">Remove this bread</button>' : '') + '</div>').join('') +
      '<button class="btn sm" data-act="xaddline">+ Add bread</button><p><b>Total ' + money(total) + '</b></p>' +
      '<div class="row"><div class="grow"><label>Cash paid</label><input id="xcash" type="number" inputmode="decimal" min="0" value="' + e.cash + '"></div><div class="grow"><label>MoMo paid</label><input id="xmomo" type="number" inputmode="decimal" min="0" value="' + e.momo + '"></div></div>' +
      '<label>Reason for the correction (required)</label><textarea id="xreason" rows="3" maxlength="300" style="width:100%;font:inherit;padding:12px;border:1.5px solid var(--line);border-radius:12px">' + esc(e.reason || '') + '</textarea><br>' +
      '<div class="row"><button class="btn grow" data-act="close">Cancel</button><button class="btn primary grow" data-act="xsave">Save correction</button></div>';
  }
  ACT.xedit = d => {
    const b = findBill(d.id); if (!b) return;
    X.edit = { id: b.id, person: X.data.person, customer: b.customer, lines: b.items.map(i => ({ p: i.p, q: i.q, u: i.u })), cash: b.cash, momo: b.momo, reason: '' };
    sheet(editHTML());
  };
  ACT.xaddline = () => { readEdit(); const p = ((S.cache && S.cache.products) || [])[0]; X.edit.lines.push({ p: p ? p.name : '', q: 1, u: p ? p.price : 0 }); sheet(editHTML()); };
  ACT.xdelline = d => { readEdit(); X.edit.lines.splice(+d.i, 1); sheet(editHTML()); };
  ACT.xsave = async () => {
    readEdit(); const e = X.edit;
    if ((e.reason || '').trim().length < 3) { toast('Write the reason'); return; }
    if (e.lines.some(l => !(l.q > 0) || l.u < 0)) { toast('Check quantity and price'); return; }
    const total = r2(sum(e.lines, l => l.q * l.u));
    if (r2(e.cash + e.momo) > total + 0.004) { toast('Paid is more than the total'); return; }
    if (!navigator.onLine) { toast('Needs internet'); return; }
    try {
      const r = await api('x', { op: 'edit', bill: e.id, customer: e.customer, items: e.lines.map(l => ({ p: l.p, q: l.q, u: l.u })), cash: e.cash, momo: e.momo, reason: e.reason.trim(), today: today() });
      if (!r.ok) { toast(errText(r.error)); return; }
    } catch (err) { toast('Needs internet'); return; }
    closeSheet(); toast('Sale corrected');
    await refreshCache(); await loadTeam(); await fetchReport(true);
  };
  if (S.session) render(true);

  /* ---------- bread given out / brought back ---------- */
  Object.assign(ERR, { bad_stock: 'Bread brought back cannot be more than bread given out.', unknown_product: 'That bread is not in the product list.', unknown_person: 'Choose a sales person first.', bad_date: 'That day cannot be changed.' });
  const SK = X.stock = {};
  const stockPerson = () => S.session.role === 'admin' ? X.person : S.session.name;
  function loadStock(k) {
    if (!k || !navigator.onLine) return;
    const c = SK[k] || (SK[k] = {}); if (c.loading) return;
    c.loading = true;
    api('x', { op: 'stockget', person: k, today: today() }).then(r => { c.loading = false; c.tried = true; if (r.ok) c.days = r.days; if (S.tab === 'history' || S.tab === 'team') render(true); }).catch(() => { c.loading = false; c.tried = true; });
  }
  KL.x.stockBox = function (date, owner) {
    const k = stockPerson(); if (!k) return '';
    const c = SK[k]; if (!c || (!c.days && !c.tried)) loadStock(k);
    const day = c && c.days && c.days.find(d => d.date === date);
    const btn = owner ? '<button class="btn block" style="margin-top:8px" data-act="xstock" data-d="' + esc(date) + '">' + (day ? 'Change bread record' : 'Record bread given out') + '</button>' : '';
    if (!day) return owner ? '<div class="card" style="margin-top:10px"><b>Bread for the day</b><p class="small muted" style="margin:4px 0 0">Nothing recorded yet for this day.</p>' + btn + '</div>' : '';
    let tO = 0, tB = 0, tS = 0, tM = 0;
    const rows = day.items.map(i => {
      const miss = r2(i.out - i.back - i.sold); tO += i.out; tB += i.back; tS += i.sold; tM += miss;
      return '<tr><td>' + esc(i.p) + '</td><td>' + i.out + '</td><td>' + i.back + '</td><td>' + i.sold + '</td><td>' + (miss > 0.004 ? '<b class="red">' + miss + '</b>' : miss < -0.004 ? '<b>+' + (-miss) + '</b>' : '0') + '</td></tr>';
    }).join('');
    const note = tM > 0.004 ? '<b class="red">' + r2(tM) + ' missing</b> (given out, not sold and not brought back)' : tM < -0.004 ? 'Sold more than recorded. Check the numbers.' : 'Everything is accounted for.';
    return '<div class="card" style="margin-top:10px"><b>Bread for the day</b><div style="overflow-x:auto"><table style="width:100%;border-collapse:collapse;font-size:14px;margin-top:6px"><tr class="small muted" style="text-align:left"><th>Bread</th><th>Out</th><th>Back</th><th>Sold</th><th>Missing</th></tr>' + rows +
      '<tr style="border-top:1.5px solid var(--line);font-weight:700"><td>Total</td><td>' + r2(tO) + '</td><td>' + r2(tB) + '</td><td>' + r2(tS) + '</td><td>' + r2(tM) + '</td></tr></table></div><p class="small" style="margin:8px 0 0">' + note + '</p>' + btn + '</div>';
  };
  const _tab2 = ACT.tab;
  ACT.tab = d => { if (d.t === 'history' && S.session && S.session.role !== 'admin') delete SK[S.session.name]; _tab2(d); };
  const _xperson = ACT.xperson;
  ACT.xperson = d => { delete SK[d.p]; _xperson(d); };
  ACT.xstock = d => {
    const k = X.person; if (!k) return;
    const c = SK[k], day = c && c.days && c.days.find(x => x.date === d.d), cur = {};
    if (day) day.items.forEach(i => { cur[i.p] = i; });
    const prods = ((S.cache && S.cache.products) || []).filter(p => p.active !== false);
    const inp = (id, v) => '<input id="' + id + '" type="number" inputmode="numeric" min="0" value="' + (v || '') + '" placeholder="0" style="width:100%;font:inherit;padding:10px;border:1.5px solid var(--line);border-radius:10px">';
    sheet('<h2>Bread for ' + esc(k) + '</h2><p class="small muted">' + esc(dLong(d.d)) + '. Write how many he took out, and how many he brought back. Leave empty if none.</p>' +
      '<div style="display:grid;grid-template-columns:1fr 78px 78px;gap:8px;align-items:center"><b class="small muted">Bread</b><b class="small muted">Out</b><b class="small muted">Back</b>' +
      prods.map((p, i) => '<span>' + esc(p.name) + '</span>' + inp('xso' + i, cur[p.name] && cur[p.name].out) + inp('xsb' + i, cur[p.name] && cur[p.name].back)).join('') + '</div>' +
      '<button class="btn primary block" style="margin-top:12px" data-act="xstocksave" data-d="' + esc(d.d) + '">Save</button>');
    X.stockProds = prods.map(p => p.name);
  };
  ACT.xstocksave = async d => {
    const items = (X.stockProds || []).map((p, i) => ({ p, out: +$('#xso' + i).value || 0, back: +$('#xsb' + i).value || 0 }));
    if (items.some(i => i.back > i.out)) { toast('Back cannot be more than out'); return; }
    try {
      const r = await api('x', { op: 'stockset', person: X.person, date: d.d, today: today(), items });
      if (r.ok) { SK[X.person] = { days: r.days, tried: true }; closeSheet(); toast('Saved'); render(true); } else toast(errText(r.error));
    } catch (e) { toast('Needs internet'); }
  };
})();
