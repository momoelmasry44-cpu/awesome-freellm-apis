/* Daily report (DSR): fill each visit as you finish it, export the Excel in Ahmed's DSR layout. */
(function () {
  'use strict';
  var KEY_DSR = 'visits.dsr.v1', KEY_PROD = 'visits.products.v1', KEY_CONTACTS = 'visits.contacts.v1', KEY_PROFILE = 'visits.profile.v1';
  var DEFAULT_PRODUCTS = ['Tussex', 'Resistin Plus', 'Prenausa', 'Coughnal', 'Kalmorex', 'Kinder immune', 'Neoidra', 'Hyalocid',
    'Gynasept', 'Prebiotic', 'Pregnafort', 'Extra zinc', 'Extrafer', 'Extra cal', 'Extra Mag', 'Folicyo', 'Optinal PF',
    'Hyalo atlantic', 'Bio D', 'Bio D max', 'D spray', 'Bio DK', 'Alphartor', 'Alphaton', 'DiaZn', 'Ringo'];
  var $ = function (s) { return document.querySelector(s); };
  function load(k, d) { try { var v = localStorage.getItem(k); return v ? JSON.parse(v) : d; } catch (e) { return d; } }
  function save(k, v) { try { localStorage.setItem(k, JSON.stringify(v)); } catch (e) {} }
  function esc(s) {
    return String(s == null ? '' : s).replace(/[&<>"']/g, function (c) { return { '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[c]; });
  }
  function today() {
    var d = new Date();
    return d.getFullYear() + '-' + ('0' + (d.getMonth() + 1)).slice(-2) + '-' + ('0' + d.getDate()).slice(-2);
  }
  function rid() { return 'r' + Date.now().toString(36) + Math.random().toString(36).slice(2, 6); }

  var reports = load(KEY_DSR, {});
  var products = load(KEY_PROD, null) || DEFAULT_PRODUCTS.slice();
  var contacts = load(KEY_CONTACTS, {});
  var profile = load(KEY_PROFILE, { name: 'ahmed elmasry', country: 'U.A.E', location: 'Dubai' });
  var date = today();

  function rows() { reports[date] = reports[date] || []; return reports[date]; }
  function persist() { save(KEY_DSR, reports); }

  function joinList(a) { return a.length <= 1 ? (a[0] || '') : a.slice(0, -1).join(', ') + ' and ' + a[a.length - 1]; }
  function remarks(r) {
    var intro = [], remind = [];
    Object.keys(r.prods || {}).forEach(function (p) {  // in the order you tapped them
      if (!r.prods[p]) return;
      (r.prods[p] === 'I' ? intro : remind).push(p);
    });
    var parts = [];
    if (intro.length) parts.push('Introduced ' + joinList(intro));
    if (remind.length) parts.push('Reminded with ' + joinList(remind));
    if (r.comment && r.comment.trim()) parts.push(r.comment.trim());
    return parts.join('. ');
  }
  function filled(r) { return !!((r.doctor && r.doctor.trim()) || remarks(r)); }

  function contactFor(account, n) {
    var list = contacts[account] || [];
    return list[n] || {};
  }
  function newRow(account, spec, n) {
    var c = contactFor(account, n || 0);
    return { id: rid(), account: account || '', doctor: c.doctor || '', cls: c.cls || 'C', spec: c.spec || spec || 'pharmacist', have: 'Yes', prods: {}, comment: '' };
  }

  // ---------- Render ----------
  function render() {
    $('#dsrDate').value = date;
    var list = rows();
    var done = list.filter(filled).length;
    $('#dsrCount').textContent = list.length ? done + ' من ' + list.length + ' متسجّلين' : '';
    $('#dsrList').innerHTML = list.length ? list.map(card).join('') :
      '<div class="card muted">مفيش زيارات لسه في تقرير اليوم ده. دوس "زيارات اليوم من الخطة" أو ضيف زيارة.</div>';
  }
  function card(r, i) {
    var chips = products.map(function (p) {
      var st = r.prods && r.prods[p];
      return '<button type="button" class="pchip' + (st ? ' p' + st : '') + '" data-act="prod" data-p="' + esc(p) + '">' +
        (st ? '<b>' + (st === 'I' ? 'جديد' : 'تذكير') + '</b> ' : '') + esc(p) + '</button>';
    }).join('');
    var rem = remarks(r);
    return '<div class="card visit' + (filled(r) ? ' filled' : '') + '" data-id="' + r.id + '">' +
      '<div class="vhead"><span class="vnum">' + (i + 1) + '</span>' +
      '<input class="grow" dir="auto" data-f="account" value="' + esc(r.account) + '" placeholder="اسم الحساب" list="dsrAccounts">' +
      '<button type="button" class="icon" data-act="dup" title="دكتور تاني في نفس المكان">＋👤</button>' +
      '<button type="button" class="icon danger" data-act="del" title="مسح">✕</button></div>' +
      '<div class="vgrid">' +
      '<label>الاسم (Doctor / Pharmacist)<input dir="auto" data-f="doctor" value="' + esc(r.doctor) + '"></label>' +
      '<label>Specialty<input data-f="spec" value="' + esc(r.spec) + '" list="dsrSpecs"></label>' +
      '<label>Class<select data-f="cls">' + ['A', 'B', 'C', ''].map(function (c) { return '<option' + (r.cls === c ? ' selected' : '') + ' value="' + c + '">' + (c || '—') + '</option>'; }).join('') + '</select></label>' +
      '<label>Have Account<select data-f="have">' + ['Yes', 'No', ''].map(function (c) { return '<option' + (r.have === c ? ' selected' : '') + ' value="' + c + '">' + (c || '—') + '</option>'; }).join('') + '</select></label>' +
      '</div>' +
      '<div class="muted small">دوسة = اتعرّف (Introduced)، دوستين = تذكير (Reminded)، تالت دوسة تشيله</div>' +
      '<div class="pchips">' + chips + '</div>' +
      '<label>كومنت<textarea dir="auto" data-f="comment" rows="2" placeholder="مثلاً: طلب 5 علب Tussex">' + esc(r.comment) + '</textarea></label>' +
      '<div class="remarks" data-remarks><span class="muted small">Remarks:</span> ' + (rem ? esc(rem) : '<span class="muted">—</span>') + '</div>' +
      '</div>';
  }

  // ---------- Events ----------
  $('#dsrList').addEventListener('input', function (e) {
    var f = e.target.dataset.f; if (!f) return;
    var cardEl = e.target.closest('.visit');
    var r = rows().filter(function (x) { return x.id === cardEl.dataset.id; })[0];
    r[f] = e.target.value;
    persist();
    var rem = remarks(r);
    cardEl.querySelector('[data-remarks]').innerHTML = '<span class="muted small">Remarks:</span> ' + (rem ? esc(rem) : '<span class="muted">—</span>');
    cardEl.classList.toggle('filled', filled(r));
  });
  $('#dsrList').addEventListener('change', function (e) {
    if (e.target.dataset.f === 'account') {
      var cardEl = e.target.closest('.visit');
      var r = rows().filter(function (x) { return x.id === cardEl.dataset.id; })[0];
      if (!r.doctor) { var c = contactFor(r.account, 0); if (c.doctor) { r.doctor = c.doctor; r.cls = c.cls || r.cls; r.spec = c.spec || r.spec; persist(); render(); } }
    }
  });
  $('#dsrList').addEventListener('click', function (e) {
    var b = e.target.closest('[data-act]'); if (!b) return;
    var cardEl = b.closest('.visit');
    var list = rows();
    var idx = list.findIndex(function (x) { return x.id === cardEl.dataset.id; });
    var r = list[idx];
    if (b.dataset.act === 'prod') {
      r.prods = r.prods || {};
      var p = b.dataset.p, st = r.prods[p];
      if (!st) r.prods[p] = 'I'; else if (st === 'I') r.prods[p] = 'R'; else delete r.prods[p];
    } else if (b.dataset.act === 'dup') {
      var same = list.filter(function (x) { return x.account === r.account; }).length;
      list.splice(idx + 1, 0, newRow(r.account, 'Doctor', same));
    } else if (b.dataset.act === 'del') {
      if (filled(r) && !window.confirm('تمسح الزيارة دي؟')) return;
      list.splice(idx, 1);
    }
    persist(); render();
  });
  $('#dsrDate').addEventListener('change', function () { date = this.value || today(); render(); });
  $('#btnDsrAdd').addEventListener('click', function () {
    var name = $('#dsrNew').value.trim();
    rows().push(newRow(name, 'pharmacist', 0));
    $('#dsrNew').value = '';
    persist(); render();
    var last = document.querySelectorAll('.visit'); if (last.length) last[last.length - 1].scrollIntoView({ block: 'center' });
  });
  $('#btnDsrFromPlan').addEventListener('click', function () {
    var plan = load('visits.plan.v1', null);
    var day = plan && plan.days.filter(function (d) { return d.date === date; })[0];
    if (!day) { window.appToast('مفيش يوم ' + date + ' في الخطة الحالية'); return; }
    var list = rows(), have = {};
    list.forEach(function (r) { have[r.account] = 1; });
    var added = 0;
    var EN = { Nahdi: 'Alnahdi', Medon: 'Medon', HealthHub: 'Health hub', Med7: 'Med7', Aster: 'Aster' };
    day.stops.forEach(function (s) {
      // generic names ("Nahdi pharmacy | صيدليه النهدى") become "Alnahdi <area>"
      if (!window.Planner.detectArea(s.name) && s.areaEn) s = Object.assign({}, s, { name: EN[s.chain] + ' ' + s.areaEn });
      if (have[s.name]) return;
      have[s.name] = 1;
      if (s.chain === 'HealthHub') {
        list.push(newRow(s.name, 'pharmacist', 0), newRow(s.name, 'Doctor', 1), newRow(s.name, 'Doctor', 2));
      } else if (s.type === 'clinic') {
        list.push(newRow(s.name, 'Doctor', 0), newRow(s.name, 'Doctor', 1));
      } else list.push(newRow(s.name, 'pharmacist', 0));
      added++;
    });
    persist(); render();
    window.appToast('اتضاف ' + added + ' زيارة من خطة ' + day.name);
  });
  $('#btnDsrExport').addEventListener('click', function () {
    var list = rows().filter(filled);
    if (!list.length) { window.appToast('سجّل زيارة واحدة على الأقل'); return; }
    // remember who you met, for next time
    var byAcc = {};
    list.forEach(function (r) { if (r.account && r.doctor) (byAcc[r.account] = byAcc[r.account] || []).push({ doctor: r.doctor, cls: r.cls, spec: r.spec }); });
    Object.keys(byAcc).forEach(function (a) { contacts[a] = byAcc[a]; });
    save(KEY_CONTACTS, contacts);

    var sh = [
      [{ v: 'Name:', s: 4 }, { v: profile.name, s: 4 }],
      [{ v: 'Country:', s: 4 }, { v: profile.country, s: 4 }],
      [{ v: 'Date:', s: 4 }, { v: XLSX.excelDate(date), s: 5 }],
      [{ v: 'Location:', s: 4 }, { v: profile.location, s: 4 }],
      [],
      ['#', 'Account Name', 'Doctor Name', 'Class', 'Specialty', 'Have Account', 'Remarks'].map(function (h) { return { v: h, s: 6 }; })
    ];
    var heights = { 5: 30 };
    var n = Math.max(18, list.length);
    for (var i = 0; i < n; i++) {
      var r = list[i];
      sh.push(r ? [{ v: i + 1, s: 7 }, { v: r.account, s: 8 }, { v: r.doctor, s: 8 }, { v: r.cls, s: 7 }, { v: r.spec, s: 8 }, { v: r.have, s: 7 }, { v: remarks(r), s: 8 }]
        : [{ v: i + 1, s: 7 }, { v: '', s: 8 }, { v: '', s: 8 }, { v: '', s: 7 }, { v: '', s: 8 }, { v: '', s: 7 }, { v: '', s: 8 }]);
      heights[6 + i] = 45;
    }
    var first = (profile.name || 'Rep').trim().split(/\s+/)[0];
    first = first.charAt(0).toUpperCase() + first.slice(1);
    var p = date.split('-');
    window.appSaveXlsx(first + '_DSR_' + p[2] + '_' + p[1] + '.xlsx',
      [{ name: 'DSR', rows: sh, styles: [], heights: heights, ltr: true, widths: [4.04, 32, 21.94, 7.96, 18.02, 12.01, 64.97] }]);
  });

  // Profile + products (in the "More" tab)
  ['name', 'country', 'location'].forEach(function (k) {
    var el = $('#prof_' + k); el.value = profile[k] || '';
    el.addEventListener('input', function () { profile[k] = el.value; save(KEY_PROFILE, profile); });
  });
  $('#productsText').value = products.join('\n');
  $('#btnSaveProducts').addEventListener('click', function () {
    products = $('#productsText').value.split(/\n/).map(function (x) { return x.trim(); }).filter(Boolean);
    save(KEY_PROD, products); render(); window.appToast('اتحفظت ' + products.length + ' منتج');
  });

  window.refreshDsrAccounts = function (names) {
    $('#dsrAccounts').innerHTML = names.map(function (n) { return '<option value="' + esc(n) + '">'; }).join('');
  };
  window.dsrRemarks = remarks;
  render();
})();
