/* KL Bread - extra screens: notes, owner team view, corrections (loaded after the main app) */
(function () {
  const KL = window.KL;
  if (!KL) return;
  const { S, ACT, ERR, ICON, api, uid, esc, money, r2, sum, kk, $, today, nowTime, toast, sheet, closeSheet, putOne, derived, fetchReport, refreshCache, syncSoon, errText, WALKIN } = KL;
  const render = k => KL.fn('render')(k);
  const { ex, stamp, notesFor, editsFor, openNotes, infoHTML, billReceiptHTML } = KL.x || {};
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
    if (!d0.days.length) return h + '<div class="empty">No sales in the last 30 days.</div>';
    d0.days.forEach(d => {
      h += '<h2>' + esc(d.date) + ' · sales ' + money(d.sales) + ' · received ' + money(d.collected) + '</h2><div class="card" style="padding:4px 14px">' + d.rows.map(r => {
        if (r.kind === 'pay') return '<div class="item"><span class="grow"><span class="nm">' + esc(r.customer) + '</span><br><span class="small muted">' + esc(r.time) + ' · debt payment</span></span><span class="right"><span class="amt">' + money(r.total) + '</span></span></div>';
        const bal = r2(r.total - r.cash - r.momo), tags = (editsFor(r.id).length ? ' · <b style="color:var(--violet)">corrected</b>' : '') + (notesFor(r.id).length ? ' · <b class="red">note</b>' : '');
        return '<button class="item" data-act="xbill" data-id="' + esc(r.id) + '"><span class="grow"><span class="nm">' + esc(r.customer) + '</span><br><span class="small muted">' + esc(r.time) + ' · ' + esc(r.items.map(i => i.q + ' ' + i.p).join(', ')) + tags + '</span></span><span class="right"><span class="amt">' + money(r.total) + '</span>' + (bal > 0.004 ? '<br><span class="small red">owes ' + money(bal) + '</span>' : '') + '</span></button>';
      }).join('') + '</div>';
    });
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
})();
