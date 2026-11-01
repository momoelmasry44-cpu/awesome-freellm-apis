/* UI for the visit planner. Data lives in localStorage on the phone. */
(function () {
  'use strict';
  var P = window.Planner;
  var Bridge = window.AndroidBridge || null;
  var KEY_ACC = 'visits.accounts.v1', KEY_PLAN = 'visits.plan.v1', KEY_SET = 'visits.settings.v1';
  var $ = function (s) { return document.querySelector(s); };

  function load(key, fallback) {
    try { var v = localStorage.getItem(key); return v ? JSON.parse(v) : fallback; } catch (e) { return fallback; }
  }
  function save(key, val) {
    try { localStorage.setItem(key, JSON.stringify(val)); } catch (e) { toast('مش قادر أحفظ: ' + e.message); }
  }
  function esc(s) {
    return String(s == null ? '' : s).replace(/[&<>"']/g, function (c) {
      return { '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[c];
    });
  }
  var toastTimer;
  function toast(msg) {
    var t = $('#toast'); t.textContent = msg; t.classList.add('show');
    clearTimeout(toastTimer); toastTimer = setTimeout(function () { t.classList.remove('show'); }, 2600);
  }
  function openUrl(url) {
    if (Bridge && Bridge.openUrl) Bridge.openUrl(url); else window.open(url, '_blank');
  }
  function saveFile(name, mime, text) {
    if (Bridge && Bridge.saveFile) { toast(Bridge.saveFile(name, mime, text)); return; }
    var blob = new Blob([text], { type: mime });
    var a = document.createElement('a'); a.href = URL.createObjectURL(blob); a.download = name;
    document.body.appendChild(a); a.click(); a.remove();
  }
  function saveXlsx(name, sheets) {
    var bytes = XLSX.build(sheets);
    if (Bridge && Bridge.saveBase64) { toast(Bridge.saveBase64(name, 'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet', XLSX.toBase64(bytes))); return; }
    var blob = new Blob([bytes], { type: 'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet' });
    var el = document.createElement('a'); el.href = URL.createObjectURL(blob); el.download = name;
    document.body.appendChild(el); el.click(); el.remove();
  }
  window.appToast = function (m) { toast(m); };
  window.appSaveXlsx = function (n, s) { saveXlsx(n, s); };
  function uid() { return 'u' + Date.now().toString(36) + Math.random().toString(36).slice(2, 7); }
  function seedAccounts() {
    return (window.SEED_ACCOUNTS || []).map(function (a) { return Object.assign({ tier: 'B', otc: false }, a); });
  }

  var accounts = load(KEY_ACC, null);
  if (!accounts) { accounts = seedAccounts(); save(KEY_ACC, accounts); }
  var settings = load(KEY_SET, {});
  var plan = load(KEY_PLAN, null);
  var shownWeek = 1;

  function persist() { save(KEY_ACC, accounts); renderAccounts(); }

  // ---------- Static UI setup ----------
  var chainKeys = Object.keys(P.CHAINS);
  function chainOptions(sel) {
    chainKeys.forEach(function (k) {
      var o = document.createElement('option'); o.value = k; o.textContent = P.CHAINS[k].label; sel.appendChild(o);
    });
  }
  chainOptions($('#chainFilter')); chainOptions($('#editChain')); chainOptions($('#importChain'));
  $('#areaList').innerHTML = P.AREAS.map(function (a) { return '<option value="' + esc(a[0]) + '">' + esc(a[1]) + '</option>'; }).join('');

  document.querySelectorAll('.tabs button').forEach(function (b) {
    b.addEventListener('click', function () {
      document.querySelectorAll('.tabs button').forEach(function (x) { x.classList.toggle('active', x === b); });
      document.querySelectorAll('.tab').forEach(function (t) { t.classList.toggle('active', t.id === 'tab-' + b.dataset.tab); });
      window.scrollTo(0, 0);
    });
  });

  function nextMonday() {
    var d = new Date(); d.setHours(0, 0, 0, 0);
    do { d.setDate(d.getDate() + 1); } while (d.getDay() !== 1);
    return d.getFullYear() + '-' + ('0' + (d.getMonth() + 1)).slice(-2) + '-' + ('0' + d.getDate()).slice(-2);
  }
  $('#startDate').value = settings.startDate || nextMonday();
  $('#homeArea').value = settings.home || '';

  // ---------- Accounts ----------
  function asterClinicPoints() {
    return accounts.filter(function (a) { return a.chain === 'Aster' && a.type === 'clinic'; })
      .map(P.locate).filter(function (p) { return p.quality === 'exact'; });
  }
  var qualityText = { exact: 'مكان دقيق', area: 'حسب المنطقة', approx: 'مكان تقريبي', none: 'مفيش مكان' };

  function renderAccounts() {
    var ctx = { asterClinics: asterClinicPoints() };
    var q = P.normalize($('#search').value).trim();
    var cf = $('#chainFilter').value, sf = $('#stateFilter').value;
    var stats = {}, weak = 0, exact = 0, html = [];
    accounts.forEach(function (a, i) {
      var reason = P.exclusionReason(a, ctx), loc = P.locate(a);
      var key = a.chain || '?';
      stats[key] = stats[key] || { in: 0, out: 0 };
      stats[key][reason ? 'out' : 'in']++;
      if (!reason) { if (loc.quality === 'exact') exact++; else weak++; }
      if (cf && a.chain !== cf) return;
      if (sf === 'in' && reason) return;
      if (sf === 'out' && !reason) return;
      if (sf === 'weak' && (reason || loc.quality === 'exact')) return;
      if (q && P.normalize(a.name + ' ' + (a.area || '') + ' ' + (a.note || '')).indexOf(q) < 0) return;
      var ch = P.CHAINS[a.chain];
      var area = P.displayArea(a, loc);
      html.push('<div class="acc' + (reason ? ' out' : '') + '" data-i="' + i + '">' +
        '<span class="badge" style="background:' + (ch ? ch.color : '#999') + '">' + esc(ch ? ch.label : '؟') + '</span>' +
        '<div class="main"><div class="name">' + esc(a.name) + '</div>' +
        '<div class="meta">' + esc(P.typeLabel(a)) + ' · ' + P.weightOf(a) + ' حساب' + (area ? ' · ' + esc(area) : '') +
        ' · <span class="q-' + loc.quality + '">' + qualityText[loc.quality] + '</span>' + (a.tier && a.tier !== 'B' ? ' · ' + a.tier : '') + (a.otc ? ' · OTC' : '') + '</div>' +
        (reason ? '<div class="reason">' + esc(reason) + '</div>' : '') + '</div></div>');
    });
    $('#accList').innerHTML = html.join('') || '<div class="acc muted">مفيش نتائج</div>';
    $('#chainStats').innerHTML = Object.keys(stats).map(function (k) {
      var ch = P.CHAINS[k];
      return '<span class="chip">' + esc(ch ? ch.label : 'غير محدد') + ': <b>' + stats[k].in + '</b>' + (stats[k].out ? ' <span class="muted">(+' + stats[k].out + ' مستبعد)</span>' : '') + '</span>';
    }).join('');
    $('#locStatus').textContent = 'المواقع: ' + exact + ' دقيق، ' + weak + ' تقريبي.' + (weak && !Bridge ? ' (تحديد المواقع بيشتغل من تطبيق الأندرويد)' : '');
    $('#topInfo').textContent = accounts.length + ' حساب';
    if (window.refreshDsrAccounts) window.refreshDsrAccounts(accounts.filter(function (a) { return !P.exclusionReason(a, ctx); }).map(function (a) { return a.name; }));
  }
  $('#search').addEventListener('input', renderAccounts);
  $('#chainFilter').addEventListener('change', renderAccounts);
  $('#stateFilter').addEventListener('change', renderAccounts);
  $('#accList').addEventListener('click', function (e) {
    var row = e.target.closest('.acc'); if (row && row.dataset.i) openEdit(+row.dataset.i);
  });

  // ---------- Edit ----------
  var editing = -1;
  var form = $('#formEdit'), F = form.elements;
  function syncEditVisibility() {
    var c = F.chain.value;
    $('#typeWrap').style.display = c === 'HealthHub' || c === 'Nahdi' || c === 'Medon' || c === 'PharmC' ? 'none' : '';
    $('#nearWrap').style.display = c === 'Aster' ? '' : 'none';
  }
  F.chain.addEventListener('change', syncEditVisibility);
  function openEdit(i) {
    editing = i;
    var a = i >= 0 ? accounts[i] : { name: '', chain: 'Nahdi', type: 'pharmacy', tier: 'B' };
    $('#editTitle').textContent = i >= 0 ? 'تعديل حساب' : 'حساب جديد';
    F.name.value = a.name || '';
    F.chain.value = a.chain || 'Nahdi';
    F.type.value = a.type || 'pharmacy';
    F.area.value = a.area || '';
    F.loc.value = isFinite(a.lat) && a.lat !== null && a.lat !== undefined ? a.lat + ', ' + a.lng : '';
    F.tier.value = a.tier || 'B';
    F.otc.checked = !!a.otc;
    F.nearAsterClinic.checked = !!a.nearAsterClinic;
    F.disabled.checked = !!a.disabled;
    F.forceInclude.checked = !!a.forceInclude;
    F.note.value = a.note || '';
    var loc = P.locate(a);
    $('#editInfo').textContent = i >= 0 ? (qualityText[loc.quality] + (a.address ? ' — ' + a.address : '')) : '';
    $('#btnDelete').style.display = i >= 0 ? '' : 'none';
    syncEditVisibility();
    $('#dlgEdit').showModal();
  }
  $('#btnAdd').addEventListener('click', function () { openEdit(-1); });
  $('#btnEditMap').addEventListener('click', function () {
    var a = editing >= 0 ? accounts[editing] : null;
    var url = (a && a.url) || 'https://www.google.com/maps/search/?api=1&query=' + encodeURIComponent(F.name.value + ' Dubai');
    openUrl(url);
  });
  $('#btnDelete').addEventListener('click', function () {
    if (editing >= 0 && confirm('تمسح "' + accounts[editing].name + '"؟')) {
      accounts.splice(editing, 1); persist(); $('#dlgEdit').close();
    }
  });
  form.addEventListener('submit', function (e) {
    if (e.submitter && e.submitter.value !== 'save') return;
    var a = editing >= 0 ? accounts[editing] : { id: uid() };
    a.name = F.name.value.trim();
    a.chain = F.chain.value;
    a.type = F.type.value;
    a.area = F.area.value.trim() || undefined;
    a.tier = F.tier.value;
    a.otc = F.otc.checked;
    a.nearAsterClinic = F.nearAsterClinic.checked;
    a.disabled = F.disabled.checked;
    a.forceInclude = F.forceInclude.checked;
    a.note = F.note.value.trim() || undefined;
    var locText = F.loc.value.trim();
    if (locText) {
      var c = P.parseCoords(locText);
      if (c) { a.lat = c.lat; a.lng = c.lng; }
      else if (/^https?:/.test(locText)) { a.url = locText; delete a.lat; delete a.lng; resolveSome([a]); }
      else toast('مش فاهم الإحداثيات — اكتبها كده: 25.2, 55.3');
    } else { delete a.lat; delete a.lng; }
    if (editing < 0) accounts.unshift(a);
    persist();
  });

  // ---------- Location resolving (Android only) ----------
  var resolving = false;
  window.onLocationResolved = function (id, lat, lng, ok) {
    if (!ok) return;
    accounts.forEach(function (a) { if (a.id === id) { a.lat = lat; a.lng = lng; } });
    if (++resolvedSinceSave >= 10) { resolvedSinceSave = 0; save(KEY_ACC, accounts); }
  };
  var resolvedSinceSave = 0;
  window.onResolveProgress = function (done, total) {
    $('#locStatus').innerHTML = 'بحدد المواقع… ' + done + ' / ' + total +
      '<div class="progress"><div style="width:' + Math.round(100 * done / Math.max(1, total)) + '%"></div></div>';
  };
  window.onResolveDone = function (ok, fail) {
    resolving = false;
    $('#btnResolve').disabled = false;
    save(KEY_ACC, accounts);
    renderAccounts();
    toast('اتحدد ' + ok + ' مكان' + (fail ? '، و ' + fail + ' ماتحددوش (افتحهم وحط الإحداثيات يدوي)' : ''));
  };
  function resolveSome(list) {
    var todo = list.filter(function (a) { return a.url && P.locate(a).quality !== 'exact'; })
      .map(function (a) { return { id: a.id, url: a.url }; });
    if (!todo.length) { toast('كل المواقع متحددة'); return; }
    if (!Bridge || !Bridge.resolveLocations) { toast('تحديد المواقع بيشتغل من تطبيق الأندرويد وهو متوصل بالنت'); return; }
    resolving = true;
    $('#btnResolve').disabled = true;
    Bridge.resolveLocations(JSON.stringify(todo));
  }
  $('#btnResolve').addEventListener('click', function () {
    if (resolving) return;
    // Only accounts that can enter the plan (plus Aster clinics, to spot pharmacies next to them).
    var list = accounts.filter(function (a) {
      var r = P.exclusionReason(a, {});
      return !r || (a.chain === 'Aster' && a.type === 'clinic');
    });
    resolveSome(list);
  });

  // ---------- Import ----------
  function parseCSV(text) {
    var rows = [], row = [], cell = '', q = false;
    for (var i = 0; i < text.length; i++) {
      var c = text[i];
      if (q) {
        if (c === '"') { if (text[i + 1] === '"') { cell += '"'; i++; } else q = false; }
        else cell += c;
      } else if (c === '"') q = true;
      else if (c === ',') { row.push(cell); cell = ''; }
      else if (c === '\n' || c === '\r') {
        if (c === '\r' && text[i + 1] === '\n') i++;
        row.push(cell); rows.push(row); row = []; cell = '';
      } else cell += c;
    }
    if (cell || row.length) { row.push(cell); rows.push(row); }
    return rows;
  }
  function placesFromText(text, filename) {
    text = text.replace(/^﻿/, '');
    var out = [];
    var trimmed = text.trim();
    if (/\.(json|geojson)$/i.test(filename || '') || /^[\[{]/.test(trimmed)) {
      var data = JSON.parse(trimmed);
      if (Array.isArray(data) && data.length && data[0].chain) return { backup: data };
      (data.features || []).forEach(function (f) {
        var pr = f.properties || {}, loc = pr.location || {};
        var c = f.geometry && f.geometry.coordinates;
        out.push({ name: loc.name || pr.Title || pr.name || '', url: pr.google_maps_url || pr['Google Maps URL'] || '',
          address: loc.address || '', lat: c && c[1], lng: c && c[0] });
      });
      return { places: out };
    }
    if (/<kml/i.test(trimmed)) {
      var doc = new DOMParser().parseFromString(trimmed, 'text/xml');
      Array.prototype.forEach.call(doc.getElementsByTagName('Placemark'), function (pm) {
        var n = pm.getElementsByTagName('name')[0], co = pm.getElementsByTagName('coordinates')[0];
        var parts = co ? co.textContent.trim().split(',') : [];
        out.push({ name: n ? n.textContent.trim() : '', lat: parts[1] ? +parts[1] : undefined, lng: parts[0] ? +parts[0] : undefined });
      });
      return { places: out };
    }
    var rows = parseCSV(text);
    var header = rows[0] || [];
    var isTakeout = header.length >= 3 && /title|العنوان|name|الاسم/i.test(header[0]);
    if (isTakeout) {
      var urlCol = header.findIndex(function (h) { return /url/i.test(h); });
      var noteCol = header.findIndex(function (h) { return /note|ملاحظة/i.test(h); });
      rows.slice(1).forEach(function (r) {
        if (!r[0] || !r[0].trim()) return;
        out.push({ name: r[0], url: urlCol >= 0 ? r[urlCol] : '', note: noteCol >= 0 ? r[noteCol] : '' });
      });
    } else {
      text.split(/\r?\n/).forEach(function (line) {
        line = line.trim(); if (!line) return;
        var m = line.match(/https?:\/\/\S+/);
        var name = line.replace(/https?:\/\/\S+/, '').replace(/[,،|\-\s]+$/, '').trim();
        out.push({ name: name || (m ? m[0] : line), url: m ? m[0] : '' });
      });
    }
    return { places: out };
  }
  function placeKey(p) {
    var m = (p.url || '').match(/1s(0x[0-9a-f]+:0x[0-9a-f]+)/i);
    if (m) return m[1].toLowerCase();
    var cid = (p.url || '').match(/cid=(\d+)/);
    if (cid) return 'cid:' + cid[1];
    return null;
  }
  function importPlaces(places, defaultChain) {
    var added = 0, dup = 0, skipped = 0, merged = 0;
    var byKey = {}, byName = {};
    accounts.forEach(function (a) {
      var k = placeKey(a) || a.id; byKey[k] = a;
      byName[P.normalize(a.name) + '|' + (a.chain || '')] = a;
    });
    places.forEach(function (p) {
      var name = String(p.name || '').replace(/[‎‏]/g, '').replace(/\s+/g, ' ').trim();
      if (!name) { skipped++; return; }
      var chain = P.detectChain(name) || defaultChain;
      if (!chain) { skipped++; return; }
      var key = placeKey(p);
      var hasCoords = isFinite(p.lat) && p.lat !== undefined && p.lat !== null;
      var existing = (key && byKey[key]) || (!key && byName[P.normalize(name) + '|' + chain]);
      if (existing) {
        if (hasCoords && P.locate(existing).quality !== 'exact') { existing.lat = +p.lat; existing.lng = +p.lng; merged++; }
        else dup++;
        return;
      }
      var a = { id: key || uid(), name: name, chain: chain, type: chain === 'Med7' || chain === 'Aster' ? P.detectType(name) : 'pharmacy',
        url: p.url || '', tier: 'B', otc: false };
      if (hasCoords) { a.lat = +p.lat; a.lng = +p.lng; }
      if (p.address) a.address = p.address;
      if (p.note) a.note = p.note;
      accounts.push(a); if (key) byKey[key] = a; added++;
    });
    persist();
    return 'اتضاف ' + added + '، متكرر ' + dup + (merged ? '، اتحدّث مكان ' + merged : '') + (skipped ? '، اتجاهل ' + skipped + ' (مش صيدلية/عيادة معروفة)' : '');
  }
  $('#btnImport').addEventListener('click', function () { $('#importResult').textContent = ''; $('#dlgImport').showModal(); });
  $('#btnDoImport').addEventListener('click', function () {
    var files = Array.prototype.slice.call($('#importFile').files || []);
    var pasted = $('#importText').value;
    var chain = $('#importChain').value || null;
    var reads = files.map(function (f) {
      return f.text().then(function (t) { return { text: t, name: f.name }; });
    });
    if (pasted.trim()) reads.push(Promise.resolve({ text: pasted, name: 'pasted.txt' }));
    if (!reads.length) { $('#importResult').textContent = 'اختار ملف أو الصق نص.'; return; }
    Promise.all(reads).then(function (items) {
      var places = [];
      items.forEach(function (it) {
        try { var r = placesFromText(it.text, it.name); if (r.places) places = places.concat(r.places); }
        catch (e) { toast('مش قادر أقرأ ' + it.name); }
      });
      $('#importResult').textContent = importPlaces(places, chain);
      $('#importText').value = ''; $('#importFile').value = '';
    });
  });

  // ---------- Backup ----------
  $('#btnBackup').addEventListener('click', function () {
    saveFile('visits-backup-' + new Date().toISOString().slice(0, 10) + '.json', 'application/json', JSON.stringify(accounts, null, 1));
  });
  $('#btnRestore').addEventListener('click', function () { $('#restoreFile').click(); });
  $('#restoreFile').addEventListener('change', function () {
    var f = this.files[0]; if (!f) return;
    f.text().then(function (t) {
      var data = JSON.parse(t);
      if (!Array.isArray(data)) throw new Error('bad');
      if (!confirm('هتستبدل ' + accounts.length + ' حساب بـ ' + data.length + '. موافق؟')) return;
      accounts = data; persist(); toast('اترجعت النسخة');
    }).catch(function () { toast('الملف ده مش نسخة احتياطية'); });
    this.value = '';
  });
  $('#btnReseed').addEventListener('click', function () {
    if (!confirm('هترجّع القوايم الأصلية وتمسح أي تعديلات. موافق؟')) return;
    accounts = seedAccounts(); persist(); toast('رجعت القوايم الأصلية');
  });

  // ---------- Plan ----------
  function homePoint() {
    var v = $('#homeArea').value.trim();
    if (!v) return null;
    var c = P.parseCoords(v);
    if (c) return c;
    var area = P.detectArea(v);
    var info = area && P.AREAS.filter(function (a) { return a[0] === area; })[0];
    return info ? { lat: info[2], lng: info[3] } : null;
  }
  $('#btnGenerate').addEventListener('click', function () {
    settings.startDate = $('#startDate').value;
    settings.home = $('#homeArea').value.trim();
    save(KEY_SET, settings);
    if (settings.home && !homePoint()) toast('مش عارف المنطقة دي — هبدأ من غير نقطة بداية');
    plan = P.generate(accounts, { startDate: settings.startDate, home: homePoint() });
    save(KEY_PLAN, plan);
    shownWeek = 1;
    renderPlan();
    toast('الخطة جاهزة');
  });

  function renderPlan() {
    var out = $('#planOut');
    if (!plan) {
      out.innerHTML = '<div class="card muted">دوس "اعمل خطة الأسبوعين". الحسابات متحمّلة من قوايمك (' + accounts.length + ' مكان).</div>';
      return;
    }
    var problems = P.validate(plan);
    var h = [];
    var warn = plan.warnings.concat(problems);
    if (warn.length) h.push('<div class="warn"><b>تنبيهات</b><ul>' + warn.map(function (w) { return '<li>' + esc(w) + '</li>'; }).join('') + '</ul></div>');
    else h.push('<div class="card ok">✓ كل القواعد متحققة: 17 حساب كل يوم، 9 HealthHub كل خميس وجمعة.</div>');

    h.push('<div class="card"><h2>التغطية</h2><table><tr><th>السلسلة</th><th class="num">فروع</th><th class="num">أسبوع 1</th><th class="num">أسبوع 2</th><th>ناقص</th></tr>' +
      plan.coverage.map(function (r) {
        return '<tr><td>' + esc(r.label) + '</td><td class="num">' + r.branches + '</td><td class="num">' + r.w1 + ' <span class="muted">(' + r.acc1 + ')</span></td><td class="num">' + r.w2 +
          ' <span class="muted">(' + r.acc2 + ')</span></td><td>' + (r.chain === 'Aster' ? '<span class="muted">تكملة</span>' : r.missing.length ? '<span class="reason">' + r.missing.length + '</span>' : '<span class="ok">✓</span>') + '</td></tr>';
      }).join('') + '</table><p class="muted small">الرقم بين القوسين = عدد الحسابات. ' + plan.excluded.length + ' مكان مستبعد حسب القواعد.</p>' +
      '<div class="btns"><button data-xlsx="1">📊 Excel الأسبوع 1</button><button data-xlsx="2">📊 Excel الأسبوع 2</button><button data-xlsx="0">📊 Excel الأسبوعين</button><button id="btnShare">📤 شير الخطة</button></div></div>');

    h.push('<div class="weeks"><button data-w="1" class="' + (shownWeek === 1 ? 'on' : '') + '">الأسبوع 1</button><button data-w="2" class="' + (shownWeek === 2 ? 'on' : '') + '">الأسبوع 2</button></div>');

    plan.days.filter(function (d) { return d.week === shownWeek; }).forEach(function (d, di) {
      var idx = plan.days.indexOf(d);
      h.push('<div class="card day"><div class="day-head"><h3 class="grow">' + esc(d.name) + ' <span class="muted small">' + esc(d.date) + '</span></h3>' +
        '<span class="total ' + (d.total === 17 ? 'ok' : 'reason') + '">' + d.total + ' حساب</span><span class="muted small">~' + d.km + ' كم</span></div>');
      d.stops.forEach(function (s, i) {
        var ch = P.CHAINS[s.chain];
        h.push('<div class="stop' + (s.kind === 'hh' ? ' hh' : '') + '"><span class="n">' + (i + 1) + '</span><span class="t">' + esc(s.slot) + '</span>' +
          '<div class="main"><a href="#" data-url="' + esc(s.url) + '" class="name">' + esc(s.name) + '</a>' +
          '<div class="meta"><span class="badge" style="background:' + ch.color + '">' + esc(ch.label) + '</span> ' + esc(s.typeLabel) +
          (s.area ? ' · ' + esc(s.area) : '') + (s.extra ? ' · زيارة إضافية' : '') + (s.quality !== 'exact' ? ' · <span class="q-approx">مكان تقريبي</span>' : '') + '</div></div>' +
          '<span class="w">' + s.weight + '</span></div>');
      });
      h.push('<div class="links">' + P.routeLinks(d).map(function (l) {
        return '<button data-url="' + esc(l.url) + '">🗺️ الروت ' + l.from + '–' + l.to + '</button>';
      }).join('') + '</div></div>');
    });
    out.innerHTML = h.join('');
  }
  $('#planOut').addEventListener('click', function (e) {
    var el = e.target.closest('[data-url]');
    if (el) { e.preventDefault(); openUrl(el.dataset.url); return; }
    var wb = e.target.closest('[data-w]');
    if (wb) { shownWeek = +wb.dataset.w; renderPlan(); return; }
    var xb = e.target.closest('[data-xlsx]');
    if (xb) {
      var wk = +xb.dataset.xlsx;
      var sh = P.sheetRows(plan, wk);
      var sheets = [{ name: wk ? 'الأسبوع ' + wk : 'الخطة', rows: sh.rows, styles: sh.styles, widths: sh.widths }];
      var cov = [['السلسلة', 'عدد الفروع', 'زيارات أسبوع 1', 'حسابات أسبوع 1', 'زيارات أسبوع 2', 'حسابات أسبوع 2', 'مالحقش']].concat(plan.coverage.map(function (r) {
        return [r.label, r.branches, r.w1, r.acc1, r.w2, r.acc2, r.chain === 'Aster' ? 'تكملة' : r.missing.join('، ')];
      }));
      sheets.push({ name: 'التغطية', rows: cov, widths: [14, 11, 13, 13, 13, 13, 60] });
      if (plan.warnings.length) sheets.push({ name: 'تنبيهات', rows: [['تنبيه']].concat(plan.warnings.map(function (w) { return [w]; })), widths: [120] });
      var first = plan.days.filter(function (d) { return !wk || d.week === wk; })[0];
      saveXlsx('خطة-الزيارات-' + (wk ? 'أسبوع' + wk + '-' : '') + first.date + '.xlsx', sheets);
      return;
    }
    if (e.target.id === 'btnShare') {
      var txt = plan.days.map(function (d) {
        return '*' + d.name + ' ' + d.date + ' (أسبوع ' + d.week + ') — ' + d.total + ' حساب*\n' +
          d.stops.map(function (s, i) { return (i + 1) + '. ' + s.slot + ' ' + s.name + ' [' + s.chainLabel + (s.weight > 1 ? ' ×' + s.weight : '') + ']'; }).join('\n');
      }).join('\n\n');
      if (Bridge && Bridge.shareText) Bridge.shareText('خطة الزيارات', txt);
      else if (navigator.share) navigator.share({ title: 'خطة الزيارات', text: txt }).catch(function () {});
      else saveFile('plan.txt', 'text/plain', txt);
    }
  });

  renderPlan();
  setTimeout(renderAccounts, 0);
})();
