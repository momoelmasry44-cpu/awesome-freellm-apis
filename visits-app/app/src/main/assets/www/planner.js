/*
 * Visit planner engine: builds a 2-week, 17-accounts-per-day field plan for Dubai.
 * Works in the browser (window.Planner) and in Node (module.exports) for testing.
 */
(function (root, factory) {
  var api = factory();
  if (typeof module === 'object' && module.exports) module.exports = api;
  else root.Planner = api;
})(typeof self !== 'undefined' ? self : this, function () {
  'use strict';

  var DUBAI_CENTER = { lat: 25.2048, lng: 55.2708 };
  var DAY_NAMES = ['الاثنين', 'الثلاثاء', 'الأربعاء', 'الخميس', 'الجمعة'];
  var DAILY_TARGET = 17;

  var CHAINS = {
    Nahdi: { label: 'النهدي', color: '#0f766e' },
    Medon: { label: 'ميدون', color: '#7c3aed' },
    HealthHub: { label: 'HealthHub', color: '#c2410c' },
    Med7: { label: 'Med7', color: '#1d4ed8' },
    Aster: { label: 'أستر', color: '#be185d' },
    PharmC: { label: 'Pharm C', color: '#6b7280' }
  };

  // [English, Arabic, lat, lng, extra aliases]
  var AREAS = [
    ['Deira', 'ديرة', 25.2711, 55.3075, ['diera', 'muteena', 'المطينة', 'murar', 'المرر']],
    ['Al Rigga', 'الرقة', 25.2637, 55.3233, ['rigga', 'riqqa']],
    ['Al Muraqqabat', 'المرقبات', 25.2667, 55.3300, ['muraqqabat', 'muraqabat']],
    ['Port Saeed', 'بورسعيد', 25.2550, 55.3330, ['port saeed', 'port said']],
    ['Naif', 'نايف', 25.2700, 55.3030, ['souq al kabeer']],
    ['Al Ras', 'الراس', 25.2700, 55.2950, []],
    ['Al Baraha', 'البراحة', 25.2800, 55.3200, ['baraha']],
    ['Abu Hail', 'أبو هيل', 25.2800, 55.3350, []],
    ['Hor Al Anz', 'هور العنز', 25.2780, 55.3430, []],
    ['Al Mamzar', 'الممزر', 25.2960, 55.3450, ['mamzar']],
    ['Al Garhoud', 'القرهود', 25.2440, 55.3510, ['garhoud']],
    ['Al Qusais', 'القصيص', 25.2790, 55.3780, ['qusais', 'dafza', 'damascus st']],
    ['Al Nahda', 'النهدة', 25.2900, 55.3700, ['nahda']],
    ['Al Twar', 'الطوار', 25.2650, 55.3850, ['twar']],
    ['Muhaisnah', 'محيصنة', 25.2620, 55.4200, ['muhaisnah', 'mhaisnah', 'sonapur']],
    ['Al Mizhar', 'المزهر', 25.2470, 55.4380, ['mizhar', 'arabian center', 'arabian centre']],
    ['Mirdif', 'مردف', 25.2200, 55.4200, ['mirdiff', 'uptown mirdif', 'uw mall']],
    ['Al Rashidiya', 'الراشدية', 25.2300, 55.3900, ['rashidiya', 'nad shamma', 'ند الشبا']],
    ['Nad Al Hamar', 'ند الحمر', 25.2050, 55.3800, ['nadd al hamar']],
    ['Al Warqa', 'الورقاء', 25.1900, 55.4150, ['warqa', 'warqaa']],
    ['Al Khawaneej', 'الخوانيج', 25.2400, 55.4800, ['khawaneej']],
    ['Bur Dubai', 'بر دبي', 25.2550, 55.2950, ['ghubaiba', 'meena bazaar', 'al fahidi']],
    ['Al Karama', 'الكرامة', 25.2450, 55.3030, ['karama']],
    ['Oud Metha', 'عود ميثاء', 25.2370, 55.3150, []],
    ['Umm Hurair', 'أم هرير', 25.2350, 55.3100, []],
    ['Healthcare City', 'مدينة دبي الطبية', 25.2320, 55.3220, ['dhcc']],
    ['Al Mankhool', 'المنخول', 25.2470, 55.2930, ['mankhool']],
    ['Al Satwa', 'السطوة', 25.2280, 55.2770, ['satwa']],
    ['Al Jafiliya', 'الجافلية', 25.2340, 55.2900, ['jafiliya', 'jafilia']],
    ['Trade Centre', 'المركز التجاري', 25.2200, 55.2850, ['trade center', 'world trade', 'emirates tower', 'szr']],
    ['DIFC', 'مركز دبي المالي', 25.2100, 55.2800, ['murooj']],
    ['Downtown Dubai', 'داون تاون', 25.1950, 55.2750, ['downtown', 'burj khalifa', 'dubai mall']],
    ['Business Bay', 'الخليج التجاري', 25.1850, 55.2700, []],
    ['Al Jaddaf', 'الجداف', 25.2150, 55.3300, ['jaddaf']],
    ['Festival City', 'فستيفال سيتي', 25.2230, 55.3530, []],
    ['Jumeirah', 'جميرا', 25.2050, 55.2450, ['jumeira', 'town centre jumeirah']],
    ['Al Wasl', 'الوصل', 25.1950, 55.2550, ['wasl']],
    ['Al Safa', 'الصفا', 25.1800, 55.2400, ['safa']],
    ['Umm Suqeim', 'أم سقيم', 25.1550, 55.2100, ['um suqeim']],
    ['Al Manara', 'المنارة', 25.1450, 55.2150, ['manara']],
    ['Al Quoz', 'القوز', 25.1500, 55.2400, ['quoz', 'alqouz', 'al khail mall']],
    ['Al Khail', 'الخيل', 25.1600, 55.3000, ['meydan', 'sobha hartland']],
    ['Nad Al Sheba', 'ند الشبا', 25.1550, 55.3200, []],
    ['Dubai Hills', 'دبي هيلز', 25.1100, 55.2500, []],
    ['Al Barsha South', 'البرشاء جنوب', 25.0900, 55.2300, ['barsha south']],
    ['Al Barsha', 'البرشاء', 25.1120, 55.2000, ['barsha', 'mall of the emirates']],
    ['Barsha Heights', 'برشا هايتس', 25.0980, 55.1780, ['tecom']],
    ['Al Sufouh', 'الصفوح', 25.1000, 55.1650, ['sufouh', 'knowledge village', 'internet city', 'media city']],
    ['The Greens', 'الجرينز', 25.0950, 55.1700, ['greens', 'the views']],
    ['Palm Jumeirah', 'نخلة جميرا', 25.1120, 55.1390, ['the palm']],
    ['Dubai Marina', 'دبي مارينا', 25.0800, 55.1400, ['marina']],
    ['JBR', 'جي بي ار', 25.0780, 55.1330, ['jumeirah beach residence']],
    ['JLT', 'أبراج بحيرات جميرا', 25.0700, 55.1420, ['jumeirah lakes towers', 'jumeirah lake towers']],
    ['Discovery Gardens', 'ديسكفري جاردنز', 25.0400, 55.1400, []],
    ['Al Furjan', 'الفرجان', 25.0270, 55.1460, ['furjan', 'festival plaza']],
    ['Jebel Ali', 'جبل علي', 25.0100, 55.1000, ['jabel ali', 'jafza']],
    ['Dubai Investments Park', 'مجمع دبي للاستثمار', 24.9900, 55.1700, ['dip', 'investment park', 'investments park', 'ramla hypermarket']],
    ['JVC', 'قرية جميرا الدائرية', 25.0600, 55.2100, ['jumeirah village circle', 'binghatti']],
    ['JVT', 'مثلث قرية جميرا', 25.0500, 55.1950, ['jumeirah village triangle']],
    ['Arjan', 'أرجان', 25.0650, 55.2450, []],
    ['Sports City', 'المدينة الرياضية', 25.0400, 55.2200, []],
    ['Motor City', 'موتور سيتي', 25.0450, 55.2400, []],
    ['Arabian Ranches', 'المرابع العربية', 25.0550, 55.2700, []],
    ['Remraam', 'رمرام', 25.0100, 55.2500, []],
    ['Damac Hills', 'داماك هيلز', 25.0200, 55.2500, ['akoya']],
    ['Town Square', 'تاون سكوير', 25.0100, 55.2900, []],
    ['Dubailand', 'دبي لاند', 25.0900, 55.3400, ['dubai land']],
    ['Silicon Oasis', 'واحة دبي للسيليكون', 25.1200, 55.3800, ['dso', 'silicon heights']],
    ['Academic City', 'المدينة الأكاديمية', 25.1300, 55.4200, []],
    ['International City', 'المدينة العالمية', 25.1650, 55.4100, []],
    ['Al Awir', 'العوير', 25.1700, 55.5300, ['aweer']]
  ];

  // Text that means the place is outside Dubai (Sharjah / Ajman / Abu Dhabi).
  var NON_DUBAI_RE = /(sharjah|ajman|muwaileh|majaz|taawun|maliha|siyouh|al atain|butina|buteena|halwan|abu shagara|qasimia|al hamidiya|abu dhabi|al ain|الشارقه|عجمان|مويلح|المجاز|التعاون|مليحه|ابو شغاره|ابو ظبي|العين)/;

  function normalize(s) {
    return (' ' + String(s || '').toLowerCase()
      .replace(/[ً-ْـ]/g, '')
      .replace(/[أإآ]/g, 'ا').replace(/ة/g, 'ه').replace(/ى/g, 'ي')
      .replace(/[^a-z0-9؀-ۿ]+/g, ' ') + ' ').replace(/\s+/g, ' ');
  }

  var AREA_ALIASES = [];
  AREAS.forEach(function (a) {
    var names = [a[0], a[1]].concat(a[4]);
    names.forEach(function (n) {
      var key = normalize(n).trim();
      if (key.length >= 3) AREA_ALIASES.push({ alias: ' ' + key + ' ', area: a });
      if (/^al /.test(key)) AREA_ALIASES.push({ alias: ' ' + key.slice(3) + ' ', area: a });
    });
  });
  AREA_ALIASES.sort(function (x, y) { return y.alias.length - x.alias.length; });

  function detectArea(text) {
    var t = normalize(text);
    for (var i = 0; i < AREA_ALIASES.length; i++) {
      if (t.indexOf(AREA_ALIASES[i].alias) >= 0) return AREA_ALIASES[i].area[0];
    }
    return null;
  }
  function areaInfo(name) {
    for (var i = 0; i < AREAS.length; i++) if (AREAS[i][0] === name) return AREAS[i];
    return null;
  }
  function nearestArea(p) {
    var best = null, bd = Infinity;
    AREAS.forEach(function (a) { var d = dist(p, { lat: a[2], lng: a[3] }); if (d < bd) { bd = d; best = a; } });
    return best;
  }
  // Area to show for an account: typed/detected area, else the nearest known area to its location.
  function displayArea(a, loc) {
    var name = a.area || detectArea(a.name + ' ' + (a.address || ''));
    if (name) return areaLabel(name);
    loc = loc || locate(a);
    if (loc.quality === 'none') return '';
    var n = nearestArea(loc);
    return n ? (loc.quality === 'exact' ? '' : '~') + n[1] : '';
  }
  function areaLabel(name) {
    var a = areaInfo(name);
    return a ? a[1] : (name || '');
  }

  function detectChain(text) {
    var t = normalize(text);
    if (/ pharm ?c /.test(t) || /فارم ?سي/.test(t)) return 'PharmC';
    if (/health ?hub|هيلث ?ه[ا]?ب/.test(t)) return 'HealthHub';
    if (/ med ?7|med ?seven|ميد ?7|ميد ?سفن/.test(t)) return 'Med7';
    if (/medon|ميدون/.test(t)) return 'Medon';
    if (/nahdi|نهدي/.test(t)) return 'Nahdi';
    if (/ aster |استر|استير/.test(t)) return 'Aster';
    return null;
  }
  function detectType(text) {
    return /clinic|medical cent|hospital|polyclinic|surgery|عياد|مستشف|مركز|طبي/.test(normalize(text)) ? 'clinic' : 'pharmacy';
  }

  // Pull coordinates out of a Google Maps URL or a "lat,lng" string.
  function parseCoords(s) {
    if (!s) return null;
    s = String(s);
    var pats = [/!3d(-?\d+\.\d+)!4d(-?\d+\.\d+)/, /@(-?\d+\.\d+),(-?\d+\.\d+)/,
      /[?&](?:q|query|ll|center|destination)=(-?\d+\.\d+)(?:,|%2C)\s*(-?\d+\.\d+)/i,
      /^\s*(-?\d{1,2}\.\d+)\s*[,،\s]\s*(-?\d{1,3}\.\d+)\s*$/];
    for (var i = 0; i < pats.length; i++) {
      var m = s.match(pats[i]);
      if (m) {
        var lat = parseFloat(m[1]), lng = parseFloat(m[2]);
        if (lat > 22 && lat < 27 && lng > 51 && lng < 57) return { lat: lat, lng: lng };
      }
    }
    return null;
  }

  // Rough Dubai / Sharjah line: north-east of it is Sharjah or Ajman.
  var SHJ_LINE = [[55.30, 25.305], [55.34, 25.300], [55.37, 25.296], [55.40, 25.287], [55.43, 25.277],
    [55.47, 25.270], [55.52, 25.250], [55.60, 25.180], [55.70, 25.100], [56.0, 24.9]];
  function insideDubai(p) {
    if (p.lat < 24.75 || p.lng < 54.88 || p.lng > 55.75 || p.lat > 25.31) return false;
    for (var i = 1; i < SHJ_LINE.length; i++) {
      var a = SHJ_LINE[i - 1], b = SHJ_LINE[i];
      if (p.lng >= a[0] && p.lng <= b[0]) {
        var lim = a[1] + (b[1] - a[1]) * (p.lng - a[0]) / (b[0] - a[0]);
        return p.lat <= lim;
      }
    }
    return true;
  }

  function dist(p, q) {
    var R = 6371, toRad = Math.PI / 180;
    var dLat = (q.lat - p.lat) * toRad, dLng = (q.lng - p.lng) * toRad;
    var h = Math.sin(dLat / 2) * Math.sin(dLat / 2) +
      Math.cos(p.lat * toRad) * Math.cos(q.lat * toRad) * Math.sin(dLng / 2) * Math.sin(dLng / 2);
    return 2 * R * Math.asin(Math.sqrt(h));
  }

  // Where an account is, and how sure we are: exact > area > approx (from the map id) > none.
  function locate(a) {
    if (isFinite(a.lat) && isFinite(a.lng) && a.lat !== null && a.lng !== null) {
      return { lat: +a.lat, lng: +a.lng, quality: 'exact' };
    }
    var c = parseCoords(a.url);
    if (c) return { lat: c.lat, lng: c.lng, quality: 'exact' };
    var area = a.area || detectArea(a.name + ' ' + (a.note || '') + ' ' + (a.address || ''));
    var info = area && areaInfo(area);
    if (info) return { lat: info[2], lng: info[3], quality: 'area' };
    if (isFinite(a.alat) && a.alat !== null) return { lat: +a.alat, lng: +a.alng, quality: 'approx' };
    return { lat: DUBAI_CENTER.lat, lng: DUBAI_CENTER.lng, quality: 'none' };
  }

  function weightOf(a) {
    if (a.chain === 'HealthHub') return 3;
    if (a.chain === 'Med7' && a.type === 'clinic') return 2;
    return 1;
  }
  function typeLabel(a) {
    if (a.chain === 'HealthHub') return 'صيدلية + 2 دكتور';
    if (a.type === 'clinic') return a.chain === 'Med7' ? 'عيادة (2 دكتور)' : 'عيادة';
    return 'صيدلية';
  }
  function priorityOf(a) {
    return ({ A: 3, B: 2, C: 1 }[a.tier || 'B'] || 2) + (a.otc ? 1 : 0);
  }

  // Why an account is not in the plan (null = it can be planned).
  function exclusionReason(a, ctx) {
    if (a.disabled) return 'متوقّف يدويًا';
    if (!CHAINS[a.chain]) return 'السلسلة مش محددة';
    if (a.chain === 'PharmC') return 'Pharm C مستبعدة (بدالها ميدون)';
    if (a.chain === 'Aster' && a.type === 'clinic') return 'عيادات أستر مستبعدة';
    if (a.chain === 'Med7' && /nasri|nasry|نصري/.test(normalize(a.name + ' ' + (a.note || '')))) return 'فرع النصري مستبعد';
    if (NON_DUBAI_RE.test(normalize(a.name + ' ' + (a.address || '') + ' ' + (a.area || '')))) return 'خارج دبي';
    var p = locate(a);
    if (p.quality === 'exact' && !insideDubai(p)) return 'خارج دبي';
    if (a.chain === 'Aster' && a.type === 'pharmacy') {
      if (a.nearAsterClinic) return 'صيدلية أستر جنب عيادة أستر';
      if (p.quality === 'exact' && ctx && ctx.asterClinics) {
        for (var i = 0; i < ctx.asterClinics.length; i++) {
          if (dist(p, ctx.asterClinics[i]) < 0.15) return 'صيدلية أستر جنب عيادة أستر';
        }
      }
    }
    return null;
  }

  function centroid(points) {
    if (!points.length) return null;
    var s = { lat: 0, lng: 0 };
    points.forEach(function (p) { s.lat += p.lat; s.lng += p.lng; });
    return { lat: s.lat / points.length, lng: s.lng / points.length };
  }

  // Order stops as a short open path: nearest neighbour + 2-opt.
  function P(it) { return it.p || it.x.p; }

  function orderPath(items, start) {
    if (items.length <= 2) {
      if (items.length === 2 && start && dist(start, P(items[1])) < dist(start, P(items[0]))) return [items[1], items[0]];
      return items.slice();
    }
    var rest = items.slice(), path = [];
    var cur = start;
    if (!cur) {
      var c = centroid(items.map(function (i) { return P(i); }));
      var far = 0;
      rest.forEach(function (it, idx) { if (dist(P(it), c) > dist(P(rest[far]), c)) far = idx; });
      path.push(rest.splice(far, 1)[0]);
      cur = P(path[0]);
    }
    while (rest.length) {
      var bi = 0;
      for (var i = 1; i < rest.length; i++) if (dist(cur, P(rest[i])) < dist(cur, P(rest[bi]))) bi = i;
      cur = P(rest[bi]);
      path.push(rest.splice(bi, 1)[0]);
    }
    var improved = true, guard = 0;
    function d(a, b) { return dist(a, b); }
    while (improved && guard++ < 50) {
      improved = false;
      for (var x = 0; x < path.length - 1; x++) {
        for (var y = x + 1; y < path.length; y++) {
          var prev = x === 0 ? start : P(path[x - 1]);
          var next = y === path.length - 1 ? null : P(path[y + 1]);
          var before = (prev ? d(prev, P(path[x])) : 0) + (next ? d(P(path[y]), next) : 0);
          var after = (prev ? d(prev, P(path[y])) : 0) + (next ? d(P(path[x]), next) : 0);
          if (after + 1e-9 < before) {
            var seg = path.slice(x, y + 1).reverse();
            Array.prototype.splice.apply(path, [x, seg.length].concat(seg));
            improved = true;
          }
        }
      }
    }
    return path;
  }

  function pathKm(path, start) {
    var km = 0, cur = start;
    path.forEach(function (it) { if (cur) km += dist(cur, P(it)); cur = P(it); });
    return km;
  }

  // 4 groups of 3 nearby HealthHub branches (W1 Thu, W1 Fri, W2 Thu, W2 Fri), covering every branch.
  function groupHealthHub(hh, warnings) {
    var groups = [];
    if (!hh.length) {
      warnings.push('مفيش فروع HealthHub متاحة — الخميس والجمعة هيبقوا أيام عادية.');
      return groups;
    }
    if (hh.length < 3) warnings.push('فروع HealthHub أقل من 3 — الخميس/الجمعة مش هيوصلوا 9 حسابات HealthHub.');
    var uncovered = hh.slice();
    var size = Math.min(3, hh.length);
    function nearest(seed, pool, n) {
      return pool.filter(function (x) { return x !== seed; })
        .sort(function (a, b) { return dist(seed.p, a.p) - dist(seed.p, b.p); }).slice(0, n);
    }
    var distinct = [];
    while (uncovered.length && distinct.length < 4) {
      var c = centroid(uncovered.map(function (x) { return x.p; }));
      var seed = uncovered.reduce(function (a, b) { return dist(b.p, c) > dist(a.p, c) ? b : a; });
      var g = [seed].concat(nearest(seed, uncovered, size - 1));
      if (g.length < size) {
        var others = hh.filter(function (x) { return g.indexOf(x) < 0; });
        g = g.concat(nearest(seed, others, size - g.length));
      }
      g.forEach(function (x) { var i = uncovered.indexOf(x); if (i >= 0) uncovered.splice(i, 1); });
      distinct.push(g);
    }
    if (uncovered.length) {
      warnings.push('فروع HealthHub أكتر من 12 — دول مش هيلحقوا في الأسبوعين: ' +
        uncovered.map(function (x) { return x.a.name; }).join('، '));
    }
    // Make the remaining Thu/Fri slots by re-visiting the tightest groups.
    var spread = function (g) { var c = centroid(g.map(function (x) { return x.p; })); return g.reduce(function (s, x) { return s + dist(x.p, c); }, 0); };
    var ranked = distinct.slice().sort(function (a, b) { return spread(a) - spread(b); });
    for (var i = 0; i < 4; i++) groups.push(i < distinct.length ? distinct[i] : ranked[(i - distinct.length) % ranked.length]);
    return groups;
  }

  function fmtTime(min) {
    var h = Math.floor(min / 60), m = min % 60;
    return (h < 10 ? '0' : '') + h + ':' + (m < 10 ? '0' : '') + m;
  }
  function isoDate(d) {
    return d.getFullYear() + '-' + ('0' + (d.getMonth() + 1)).slice(-2) + '-' + ('0' + d.getDate()).slice(-2);
  }
  function mondayOnOrAfter(dateStr) {
    var d = dateStr ? new Date(dateStr + 'T00:00:00') : new Date();
    if (isNaN(d)) d = new Date();
    d.setHours(0, 0, 0, 0);
    while (d.getDay() !== 1) d.setDate(d.getDate() + 1);
    return d;
  }

  /**
   * accounts: [{id, name, chain, type, area, lat, lng, alat, alng, url, tier, otc, nearAsterClinic, disabled}]
   * opts: {startDate: 'YYYY-MM-DD', home: {lat,lng}|null}
   */
  function generate(accounts, opts) {
    opts = opts || {};
    var warnings = [], excluded = [], valid = [];
    var asterClinics = accounts.filter(function (a) { return a.chain === 'Aster' && a.type === 'clinic'; })
      .map(locate).filter(function (p) { return p.quality === 'exact'; });
    accounts.forEach(function (a) {
      var r = exclusionReason(a, { asterClinics: asterClinics });
      if (r) excluded.push({ account: a, reason: r });
      else valid.push({ a: a, p: locate(a), w: weightOf(a), pr: priorityOf(a) });
    });
    var weak = valid.filter(function (x) { return x.p.quality === 'approx' || x.p.quality === 'none'; });
    if (weak.length) {
      warnings.push(weak.length + ' حساب مكانهم تقريبي (مفيش إحداثيات دقيقة) — دوس "حدّد المواقع" عشان الروت يبقى أدق.');
    }

    var by = { Nahdi: [], Medon: [], HealthHub: [], Med7: [], Aster: [] };
    valid.forEach(function (x) { by[x.a.chain].push(x); });

    var start = mondayOnOrAfter(opts.startDate);
    var days = [];
    for (var w = 0; w < 2; w++) {
      for (var d = 0; d < 5; d++) {
        var date = new Date(start); date.setDate(start.getDate() + w * 7 + d);
        days.push({ week: w + 1, dow: d, name: DAY_NAMES[d], date: isoDate(date), cap: DAILY_TARGET, hh: [], items: [], center: null, anchor: null });
      }
    }

    var groups = groupHealthHub(by.HealthHub, warnings);
    var hhDays = days.filter(function (dd) { return dd.dow >= 3; });
    hhDays.forEach(function (dd, i) {
      var g = groups[i];
      if (!g) return;
      dd.hh = g;
      dd.anchor = centroid(g.map(function (x) { return x.p; }));
      dd.center = dd.anchor;
      dd.cap = DAILY_TARGET - g.reduce(function (s, x) { return s + x.w; }, 0);
    });

    // Tasks: every Nahdi once per week; Medon / Med7 once in the plan.
    var tasks = [];
    by.Nahdi.forEach(function (x) { tasks.push({ x: x, week: 1 }); tasks.push({ x: x, week: 2 }); });
    by.Medon.concat(by.Med7).forEach(function (x) { tasks.push({ x: x, week: null }); });

    // Seed free-day centres by farthest-point sampling, per week.
    var allPts = valid.filter(function (x) { return x.a.chain !== 'Aster' && x.a.chain !== 'HealthHub'; }).map(function (x) { return x.p; });
    [1, 2].forEach(function (wk) {
      var wd = days.filter(function (dd) { return dd.week === wk; });
      var centers = wd.filter(function (dd) { return dd.center; }).map(function (dd) { return dd.center; });
      wd.forEach(function (dd) {
        if (dd.center) return;
        var best = null, bestD = -1;
        allPts.forEach(function (p) {
          var m = centers.length ? Math.min.apply(null, centers.map(function (c) { return dist(p, c); })) : dist(p, DUBAI_CENTER);
          if (m > bestD) { bestD = m; best = p; }
        });
        dd.center = best || DUBAI_CENTER;
        centers.push(dd.center);
      });
    });

    function assign(list, loads, out) {
      var remaining = list.slice(), left = [];
      while (remaining.length) {
        var pick = -1, pickDay = null, pickScore = -Infinity;
        for (var i = 0; i < remaining.length; i++) {
          var t = remaining[i], b1 = Infinity, b2 = Infinity, bd = null;
          for (var k = 0; k < days.length; k++) {
            var dd = days[k];
            if (t.week && dd.week !== t.week) continue;
            if (loads[k] + t.x.w > dd.cap) continue;
            var c = dist(t.x.p, dd.center);
            if (c < b1) { b2 = b1; b1 = c; bd = k; } else if (c < b2) b2 = c;
          }
          if (bd === null) continue;
          var score = (b2 === Infinity ? 1000 : b2 - b1) + t.x.pr * 0.01;
          if (score > pickScore) { pickScore = score; pick = i; pickDay = bd; }
        }
        if (pick < 0) { left = left.concat(remaining); break; }
        var task = remaining.splice(pick, 1)[0];
        loads[pickDay] += task.x.w;
        out[pickDay].push(task);
      }
      return left;
    }

    var out, loads, leftover;
    for (var iter = 0; iter < 8; iter++) {
      out = days.map(function () { return []; });
      loads = days.map(function () { return 0; });
      var nahdiLeft = assign(tasks.filter(function (t) { return t.week; }), loads, out);
      var onceLeft = assign(tasks.filter(function (t) { return !t.week; }).sort(function (a, b) { return b.x.pr - a.x.pr; }), loads, out);
      leftover = nahdiLeft.concat(onceLeft);
      var moved = 0;
      days.forEach(function (dd, k) {
        if (dd.anchor || !out[k].length) return;
        var c = centroid(out[k].map(function (t) { return t.x.p; }));
        moved += dist(c, dd.center);
        dd.center = c;
      });
      if (moved < 0.05) break;
    }
    days.forEach(function (dd, k) { dd.items = out[k].map(function (t) { return { x: t.x, extra: false }; }); dd.load = loads[k]; });
    leftover.forEach(function (t) {
      warnings.push((t.week ? 'النهدي ' : '') + '"' + t.x.a.name + '" ماتحطّش' + (t.week ? ' في الأسبوع ' + t.week : '') + ' — الأيام مليانة.');
    });

    // Fill each day to 17: Aster first (on the route), then extra visits.
    days.forEach(function (dd) {
      var pts = dd.items.map(function (it) { return it.x.p; }).concat(dd.hh.map(function (x) { return x.p; }));
      var inWeek = function (x) {
        return days.some(function (o) {
          return o.week === dd.week && (o.items.some(function (it) { return it.x === x; }) || o.hh.indexOf(x) >= 0);
        });
      };
      var near = function (x) {
        var m = pts.length ? Math.min.apply(null, pts.map(function (p) { return dist(x.p, p); })) : dist(x.p, dd.center);
        return m - x.pr * 0.3 + (x.p.quality === 'exact' ? 0 : 0.5);
      };
      while (dd.load < dd.cap) {
        var room = dd.cap - dd.load;
        var cands = by.Aster.filter(function (x) { return !inWeek(x); });
        var extra = false;
        if (!cands.length) {
          cands = by.Medon.concat(by.Med7).filter(function (x) { return x.w <= room && !inWeek(x); });
          extra = true;
        }
        if (!cands.length) break;
        var best = cands.reduce(function (a, b) { return near(b) < near(a) ? b : a; });
        dd.items.push({ x: best, extra: extra });
        dd.load += best.w;
        pts.push(best.p);
      }
      if (dd.load < dd.cap) warnings.push(dd.name + ' (أسبوع ' + dd.week + ') فيه ' + (dd.load + (DAILY_TARGET - dd.cap)) + ' حساب بس — مفيش حسابات كفاية.');
    });

    // Order the route and set time slots.
    var home = opts.home && isFinite(opts.home.lat) ? opts.home : null;
    var plan = days.map(function (dd) {
      var stops = [];
      var push = function (it, slot, kind) {
        var a = it.x.a;
        stops.push({
          id: a.id, name: a.name, chain: a.chain, chainLabel: CHAINS[a.chain].label, type: a.type,
          typeLabel: typeLabel(a), weight: it.x.w, area: displayArea(a, it.x.p),
          slot: slot, kind: kind, extra: !!it.extra, lat: it.x.p.lat, lng: it.x.p.lng, quality: it.x.p.quality,
          url: a.url || ('https://www.google.com/maps/search/?api=1&query=' + encodeURIComponent(a.name + ' Dubai'))
        });
      };
      var km;
      if (!dd.hh.length) {
        var path = orderPath(dd.items, home);
        km = pathKm(path, home);
        var t = 9 * 60;
        path.forEach(function (it) { push(it, fmtTime(t), 'normal'); t += it.x.w > 1 ? 40 : 25; });
      } else {
        var anchor = dd.anchor;
        var hhItems = dd.hh.map(function (x) { return { x: x }; });
        // Morning: route that ends near the HealthHub cluster; the closest few wait until after 3 pm.
        var sorted = dd.items.slice().sort(function (a, b) { return dist(b.x.p, anchor) - dist(a.x.p, anchor); });
        var nAfter = Math.min(2, Math.max(0, sorted.length - 6));
        var after = sorted.slice(sorted.length - nAfter);
        var morning = sorted.slice(0, sorted.length - nAfter);
        var mPath = orderPath(morning, home);
        // Reverse the morning route if that ends it closer to the HealthHub cluster.
        if (!home && mPath.length > 1 && dist(mPath[0].x.p, anchor) < dist(mPath[mPath.length - 1].x.p, anchor)) mPath.reverse();
        var hPath = orderPath(hhItems, mPath.length ? mPath[mPath.length - 1].x.p : home);
        var aPath = orderPath(after, hPath.length ? hPath[hPath.length - 1].x.p : null);
        var full = mPath.concat(hPath, aPath);
        km = pathKm(full, home);
        var tm = 9 * 60;
        mPath.forEach(function (it) { push(it, fmtTime(tm), 'normal'); tm += it.x.w > 1 ? 40 : 30; });
        var th = 13 * 60;
        hPath.forEach(function (it) { push(it, fmtTime(th), 'hh'); th += 40; });
        var ta = 15 * 60;
        aPath.forEach(function (it) { push(it, fmtTime(ta), 'normal'); ta += it.x.w > 1 ? 40 : 30; });
      }
      var total = stops.reduce(function (s, x) { return s + x.weight; }, 0);
      return { week: dd.week, dow: dd.dow, name: dd.name, date: dd.date, stops: stops, total: total, km: Math.round(km), hhAccounts: dd.hh.reduce(function (s, x) { return s + x.w; }, 0) };
    });

    return { days: plan, warnings: warnings, excluded: excluded, coverage: coverage(plan, by), generatedAt: new Date().toISOString(), startDate: isoDate(start) };
  }

  function coverage(plan, by) {
    var chains = ['Nahdi', 'Medon', 'HealthHub', 'Med7', 'Aster'];
    var rows = chains.map(function (c) {
      var row = { chain: c, label: CHAINS[c].label, branches: by[c].length, w1: 0, w2: 0, acc1: 0, acc2: 0, missing: [] };
      var seen = {};
      plan.forEach(function (d) {
        d.stops.forEach(function (s) {
          if (s.chain !== c) return;
          row['w' + d.week]++; row['acc' + d.week] += s.weight; seen[s.id] = true;
        });
      });
      if (c !== 'Aster') row.missing = by[c].filter(function (x) { return !seen[x.a.id]; }).map(function (x) { return x.a.name; });
      return row;
    });
    return rows;
  }

  // Check every rule; returns a list of problems (empty = all good).
  function validate(plan) {
    var problems = [];
    plan.days.forEach(function (d) {
      if (d.total !== DAILY_TARGET) problems.push(d.name + ' أسبوع ' + d.week + ': ' + d.total + ' بدل 17');
      if (d.dow >= 3 && d.hhAccounts !== 9) problems.push(d.name + ' أسبوع ' + d.week + ': HealthHub = ' + d.hhAccounts + ' بدل 9');
      d.stops.forEach(function (s) {
        if (s.kind === 'hh' && (s.slot < '13:00' || s.slot > '15:00')) problems.push('HealthHub بره وقت 1-3: ' + s.name);
        if (s.chain === 'HealthHub' && d.dow < 3) problems.push('HealthHub في يوم غير الخميس/الجمعة: ' + s.name);
      });
    });
    return problems;
  }

  function csv(plan) {
    var esc = function (v) { v = String(v == null ? '' : v); return /[",\n]/.test(v) ? '"' + v.replace(/"/g, '""') + '"' : v; };
    var lines = [['Week', 'Day', 'Date', 'Order', 'Account name', 'Chain', 'Type', 'Accounts count', 'Area', 'Time slot', 'Google Maps link'].join(',')];
    plan.days.forEach(function (d) {
      d.stops.forEach(function (s, i) {
        lines.push([d.week, d.name, d.date, i + 1, s.name + (s.extra ? ' (زيارة إضافية)' : ''), s.chainLabel, s.typeLabel, s.weight, s.area,
          s.kind === 'hh' ? s.slot + ' (1-3 PM)' : s.slot, s.url].map(esc).join(','));
      });
      lines.push([d.week, d.name, d.date, '', 'Daily total', '', '', d.total, '', '', ''].map(esc).join(','));
    });
    return '﻿' + lines.join('\r\n');
  }

  // Google Maps directions links for a day (max 10 points per link).
  function routeLinks(day) {
    var pts = day.stops.map(function (s) {
      return s.quality === 'exact' ? s.lat.toFixed(6) + ',' + s.lng.toFixed(6) : s.name + ' Dubai';
    });
    var links = [];
    for (var i = 0; i < pts.length; i += 9) {
      var chunk = pts.slice(i, i + 10);
      if (chunk.length < 2) break;
      var url = 'https://www.google.com/maps/dir/?api=1&travelmode=driving&destination=' + encodeURIComponent(chunk[chunk.length - 1]);
      if (i === 0) url += '&origin=' + encodeURIComponent(chunk[0]);
      else url += '&origin=' + encodeURIComponent(chunk[0]);
      if (chunk.length > 2) url += '&waypoints=' + encodeURIComponent(chunk.slice(1, -1).join('|'));
      links.push({ from: i + 1, to: i + chunk.length, url: url });
    }
    return links;
  }

  return {
    CHAINS: CHAINS, AREAS: AREAS, DAILY_TARGET: DAILY_TARGET,
    normalize: normalize, detectArea: detectArea, detectChain: detectChain, detectType: detectType,
    parseCoords: parseCoords, insideDubai: insideDubai, locate: locate, weightOf: weightOf,
    exclusionReason: exclusionReason, generate: generate, validate: validate, csv: csv,
    routeLinks: routeLinks, areaLabel: areaLabel, displayArea: displayArea, typeLabel: typeLabel, dist: dist
  };
});
