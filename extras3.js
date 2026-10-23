/* KL Bread - owner: records list, delete with confirmation, start fresh (loaded after extras2.js) */
(function () {
  const KL = window.KL;
  if (!KL) return;
  const { S, ACT, ERR, api, esc, money, $, toast, sheet, closeSheet, refreshCache, fetchReport, derived, kk, sum, r2, errText } = KL;
  const render = k => KL.fn('render')(k);
  const delOne = KL.delOne;
  Object.assign(ERR, { already_live: 'The app is already live, so it cannot be cleared again.', not_confirmed: 'Type START to confirm.' });

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
    if (!r.live) h += '<h2>Ready to start?</h2><div class="card"><p class="small muted" style="margin-top:0">Clears all test sales, payments and cash records. Your breads, prices and sales persons stay. This works only once.</p><button class="btn danger block" data-act="startfresh">Start fresh</button></div>';
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
  ACT.startfresh = () => sheet('<h2>Start fresh</h2><p class="small muted">This deletes all test sales, payments and cash records for everyone. It cannot be undone and works only once. Make sure every phone shows 0 not sent.</p><label>Customers</label><select id="sfk"><option value="0">Clear test customers too</option><option value="1">Keep my customers list</option></select><label>Type START to confirm</label><input id="sfc" autocomplete="off"><br><button class="btn danger block" data-act="dostart">Clear and go live</button>');
  ACT.dostart = async () => {
    const confirm = $('#sfc').value.trim();
    if (confirm.toUpperCase() !== 'START') { toast('Type START to confirm'); return; }
    if (!navigator.onLine) { toast('Needs internet'); return; }
    try {
      const r = await api('x', { op: 'startfresh', confirm, keepCustomers: $('#sfk').value === '1' });
      if (!r.ok) { toast(KL.errText(r.error)); return; }
    } catch (e) { toast('Needs internet'); return; }
    KL.closeSheet(); toast('Done. The app is live.');
    for (const st of ['queue', 'applied', 'failed']) { for (const o of S[st]) await delOne(st, o.id); S[st] = []; }
    S.rep = null; S.hist = null; S.recs = null;
    await loadRecords(); await refreshCache(); await fetchReport(true);
  };

  /* ---------- who owes me (sales person Today tab) ---------- */
  Object.assign(ERR, { bad_amount: 'Type an amount of 0 or more.' });
  const _render3 = KL.fn('render');
  KL.setFn('render', function (k) {
    _render3(k);
    if (!S.session || S.session.role === 'admin' || S.tab !== 'today') return;
    const st = document.querySelector('main.wrap .stats'); if (!st || document.getElementById('xowing')) return;
    const me = kk(S.session.name);
    const list = derived().customers.filter(c => kk(c.person) === me && (c.balance || 0) > 0.004).sort((a, b) => b.balance - a.balance);
    const total = r2(sum(list, c => c.balance));
    st.insertAdjacentHTML('afterend', '<h2 id="xowing">Who owes me' + (list.length ? ' · ' + money(total) : '') + '</h2><div class="card" style="padding:4px 14px">' +
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
  if (S.session) render(true);
})();
