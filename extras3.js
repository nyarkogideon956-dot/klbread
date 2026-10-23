/* KL Bread - owner: records list, delete with confirmation, start fresh (loaded after extras2.js) */
(function () {
  const KL = window.KL;
  if (!KL) return;
  const { S, ACT, ERR, api, esc, money, $, toast, sheet, refreshCache, fetchReport } = KL;
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
  if (S.session) render(true);
})();
