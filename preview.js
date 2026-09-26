/* Freelance OS · propositions d'Accueil et de « Mes mois ».
   Actives seulement avec ?apercu dans l'adresse, pour les essayer sur ses vraies données. */
(function () {
  'use strict';
  if (!/[?&]apercu\b/.test(location.search)) return;

  function nextEvents(limit) {
    var data = {};
    try { data = JSON.parse(localStorage.getItem('freelance-os-agenda-previsions-v1')) || {}; } catch (_) {}
    var today = new Date().toISOString().slice(0, 10);
    return (data.events || []).filter(function (e) { return e.date >= today; }).sort(function (a, b) { return a.date.localeCompare(b.date); }).slice(0, limit);
  }

  /* Courbe lissée des recettes de l'année, avec l'objectif en pointillés. */
  function yearCurve(year, goal) {
    var W = 560, H = 190, P = 18, B = 26;
    var pts = [];
    for (var i = 0; i < 12; i++) {
      var k = year + '-' + String(i + 1).padStart(2, '0');
      var m = state.months.find(function (x) { return x.month === k; });
      pts.push({ k: k, v: m ? C.calc(state, m).revenue : null });
    }
    var known = pts.filter(function (p) { return p.v !== null; });
    var max = Math.max.apply(null, known.map(function (p) { return p.v; }).concat([goal || 0, 1])) * 1.12;
    var x = function (i) { return P + i * (W - 2 * P) / 11; };
    var y = function (v) { return H - B - v / max * (H - B - 10); };
    var seq = pts.map(function (p, i) { return p.v === null ? null : { x: x(i), y: y(p.v), p: p }; }).filter(Boolean);
    var path = '';
    seq.forEach(function (pt, i) {
      if (!i) { path = 'M' + pt.x + ',' + pt.y; return; }
      var a = seq[i - 1], cx = (a.x + pt.x) / 2;
      path += ' C' + cx + ',' + a.y + ' ' + cx + ',' + pt.y + ' ' + pt.x + ',' + pt.y;
    });
    var area = seq.length ? path + ' L' + seq[seq.length - 1].x + ',' + (H - B) + ' L' + seq[0].x + ',' + (H - B) + ' Z' : '';
    var labels = pts.map(function (p, i) { return '<text x="' + x(i) + '" y="' + (H - 6) + '" text-anchor="middle">' + monthShort(p.k).slice(0, 4) + '</text>'; }).join('');
    var dots = seq.map(function (pt) { return '<circle cx="' + pt.x + '" cy="' + pt.y + '" r="4.5" class="' + (goal && pt.p.v < goal ? 'low' : '') + '"><title>' + esc(monthName(pt.p.k)) + ' · ' + money(pt.p.v) + '</title></circle>'; }).join('');
    var goalLine = goal ? '<line x1="' + P + '" x2="' + (W - P) + '" y1="' + y(goal) + '" y2="' + y(goal) + '" class="goal"/><text x="' + (W - P) + '" y="' + (y(goal) - 6) + '" text-anchor="end" class="goal-t">' + money0(goal) + '</text>' : '';
    return '<svg class="curve" viewBox="0 0 ' + W + ' ' + H + '"><defs><linearGradient id="cg" x1="0" x2="0" y1="0" y2="1"><stop offset="0" stop-color="#b865ee" stop-opacity=".28"/><stop offset="1" stop-color="#b865ee" stop-opacity="0"/></linearGradient></defs>' +
      goalLine + '<path d="' + area + '" fill="url(#cg)"/><path d="' + path + '" class="line"/>' + dots + labels + '</svg>';
  }

  function ring(pctValue) {
    var r = 46, c = 2 * Math.PI * r, p = Math.max(0, Math.min(100, pctValue));
    return '<svg class="ring" viewBox="0 0 110 110"><circle cx="55" cy="55" r="' + r + '" class="ring-bg"/><circle cx="55" cy="55" r="' + r + '" class="ring-fg" stroke-dasharray="' + c + '" stroke-dashoffset="' + (c * (1 - p / 100)) + '" style="--c:' + c + '"/></svg>';
  }

  function home() {
    var m = currentMonth();
    if (!m) return RENDERERS_ORIGINAL.dashboard();
    var t = C.calc(state, m), year = m.month.slice(0, 4), y = C.yearSummary(state, year), due = C.urssafUpcoming(state);
    var vat = C.threshold(state, year, state.vatThreshold), f = C.forecast(state, year);
    var today = new Date().toLocaleDateString('fr-FR', { weekday: 'long', day: 'numeric', month: 'long' });
    var urgent = due.total > 0 && due.days <= 7;
    var events = nextEvents(3);
    var level = vat.percent >= 100 ? 'alert' : vat.percent >= 80 ? 'warn' : '';

    var urssaf = '<button type="button" class="module' + (urgent ? ' urgent' : '') + '" data-view="fiscal">' +
      '<span class="module-kicker">' + icon('fiscal') + 'Prochain prélèvement URSSAF</span>' +
      (due.item
        ? '<b class="module-big">' + n(due.total) + '</b><span class="module-line">le 1er ' + esc(monthOnly(due.paymentMonth)) + ' · <strong>' + (due.days <= 1 ? 'demain' : 'dans ' + due.days + ' jours') + '</strong></span><span class="module-foot">Calculé sur ton CA de ' + esc(monthOnly(due.period)) + '</span>'
        : '<b class="module-big">—</b><span class="module-line">Saisis ' + esc(monthOnly(due.period)) + ' pour le calculer</span>') + '</button>';

    var tva = state.vatEnabled ? '' : '<button type="button" class="module ' + level + '" data-view="fiscal">' +
      '<span class="module-kicker">' + icon('fiscal') + 'Franchise de TVA</span>' +
      '<b class="module-big">' + n(vat.percent, 'pct') + '</b>' +
      '<span class="track ' + level + '" style="margin:8px 0"><i data-w="' + Math.min(100, vat.percent) + '"></i></span>' +
      '<span class="module-line">' + money0(vat.micro) + ' encaissés sur ' + money0(vat.limit) + '</span>' +
      '<span class="module-foot">' + (vat.crossed ? 'Seuil dépassé : la TVA s’applique' : vat.crossingThisYear ? 'Au-delà, tu factures la TVA · passage estimé en ' + esc(monthOnly(vat.crossing)) : 'Au-delà, tu factures la TVA') + '</span></button>';

    var goalMod = '<button type="button" class="module" data-view="forecast">' +
      '<span class="module-kicker">' + icon('forecast') + 'Objectif ' + year + '</span>' +
      (state.goal
        ? '<b class="module-big">' + n(f.goalProgress, 'pct') + '</b><span class="track" style="margin:8px 0"><i data-w="' + Math.min(100, f.goalProgress) + '"></i></span>' +
          '<span class="module-line">' + money0(y.revenue) + ' sur ' + money0(state.goal) + '</span><span class="module-foot">' + (f.goalRequired ? 'Reste ' + money0(f.goalRequired) + ' par mois' : 'Objectif atteint') + '</span>'
        : '<b class="module-big">—</b><span class="module-line">Définis ton objectif annuel</span>') + '</button>';

    var agenda = '<section class="card upcoming"><div class="card-head"><h3>À venir</h3><button class="link" data-view="agenda">Agenda →</button></div>' +
      (events.length ? events.map(function (e) {
        var d = new Date(e.date + 'T12:00:00');
        return '<button type="button" class="up-item" data-view="agenda"><span class="up-date"><b>' + d.getDate() + '</b>' + esc(d.toLocaleDateString('fr-FR', { month: 'short' }).replace('.', '')) + '</span><span class="up-txt"><b>' + esc(e.title) + '</b><small>' + esc(d.toLocaleDateString('fr-FR', { weekday: 'long' })) + '</small></span>' + (e.amount ? '<span class="up-amt">' + money(e.amount) + '</span>' : '') + '</button>';
      }).join('') : '<p class="note" style="margin:0 0 6px">Aucune date prévue.</p><button class="btn quiet" data-agenda-act="new" data-demo-lock>' + icon('plus') + 'Ajouter une date</button>') + '</section>';

    var yearMod = '<section class="card year"><div class="card-head"><h3>Ton année ' + year + '</h3><button class="link" data-view="months">Mes mois →</button></div>' +
      '<div class="year-figs"><div><span class="label">Encaissé</span><b>' + n(y.revenue) + '</b></div><div><span class="label">Dans ta poche</span><b>' + n(y.pocket) + '</b></div><div><span class="label">Projeté fin d’année</span><b>' + money0(f.projection) + '</b></div></div>' +
      yearCurve(year, state.monthlyGoal) + '</section>';

    return '<div class="home2">' +
      '<section class="majestic">' +
        '<span class="m-date">' + esc(today) + '</span>' +
        '<p class="m-line">En ' + esc(monthOnly(m.month)) + ', il te reste</p>' +
        '<span class="m-big">' + n(t.pocket) + '</span>' +
        '<p class="m-soft">dans ta poche, sur ' + money(t.revenue) + ' encaissés.</p>' +
        '<div class="m-stats"><span><i>Charges</i><b>' + money0(t.expenses + t.personal) + '</b></span><span><i>URSSAF</i><b>' + money0(t.urssaf) + '</b></span><span><i>Part gardée</i><b>' + pct(t.revenue ? t.pocket / t.revenue * 100 : 0, 0) + '</b></span></div>' +
      '</section>' +
      '<div class="modules stagger">' + urssaf + tva + goalMod + '</div>' +
      '<div class="home-grid stagger">' + agenda + yearMod + '</div>' +
    '</div>';
  }


  /* Le chiffre clé de chaque page, posé sur le fond comme sur l'accueil. */
  function stage(o) {
    return '<section class="majestic' + (o.tone ? ' ' + o.tone : '') + '">' +
      (o.kicker ? '<span class="m-date">' + o.kicker + '</span>' : '') +
      (o.line ? '<p class="m-line">' + o.line + '</p>' : '') +
      '<span class="m-big">' + o.big + '</span>' +
      (o.soft ? '<p class="m-soft">' + o.soft + '</p>' : '') +
      (o.stats && o.stats.length ? '<div class="m-stats">' + o.stats.map(function (s) { return '<span><i>' + s[0] + '</i><b>' + s[1] + '</b></span>'; }).join('') + '</div>' : '') +
      (o.action ? '<div class="m-action">' + o.action + '</div>' : '') +
      '</section>';
  }
  /* Retire d'un rendu existant les blocs remplacés par le chiffre clé. */
  function strip(html, selectors) {
    var box = document.createElement('div');
    box.innerHTML = html;
    selectors.forEach(function (s) { var el = box.querySelector(s); if (el) el.remove(); });
    return box.innerHTML;
  }

  function pageMonths() {
    if (!state.months.length) return RENDERERS_ORIGINAL.months();
    var years = C.years(state), year = window.__fosMonthsYear && years.indexOf(window.__fosMonthsYear) !== -1 ? window.__fosMonthsYear : years[0];
    var y = C.yearSummary(state, year);
    return stage({ kicker: 'Encaissé en ' + year, big: n(y.revenue), soft: 'sur ' + y.count + ' mois saisis',
      stats: [['Dans ta poche', money0(y.pocket)], ['Moyenne / mois', money0(y.average)], ['URSSAF', money0(y.urssaf)]] }) +
      strip(RENDERERS_ORIGINAL.months(), ['.months-sum']);
  }

  function pageFixed() {
    if (!state.fixed.length) return RENDERERS_ORIGINAL.fixed();
    var total = C.fixedTotal(state);
    return stage({ kicker: 'Charges fixes', big: n(total), soft: 'chaque mois · ' + state.fixed.length + ' charge' + (state.fixed.length > 1 ? 's' : ''),
      stats: [['Pro', money0(C.fixedTotal(state, 'pro'))], ['Perso', money0(C.fixedTotal(state, 'perso'))], ['Sur un an', money0(total * 12)]] }) +
      strip(RENDERERS_ORIGINAL.fixed(), ['.hero']);
  }

  function pageFiscal() {
    var due = C.urssafUpcoming(state), d = due.details, urgent = due.total > 0 && due.days <= 7;
    return stage({ tone: urgent ? 'urgent' : '', kicker: 'Prélèvement URSSAF · 1er ' + esc(monthOnly(due.paymentMonth)), big: n(due.total),
      soft: d ? '<span class="countdown-inline">' + (due.days <= 1 ? 'demain' : 'dans ' + due.days + ' jours') + '</span> · calculé sur ton CA de ' + esc(monthOnly(due.period)) : 'Saisis ' + esc(monthOnly(due.period)) + ' pour le calculer',
      stats: d ? [['BNC', money(d.bncContribution)], ['BIC', money(d.bicContribution)], ['CFP + CCI', money(d.cfpContribution + d.cciContribution)]] : [] }) +
      strip(RENDERERS_ORIGINAL.fiscal(), ['.hero']);
  }

  function pageForecast() {
    var year = currentYear(), f = C.forecast(state, year);
    if (!f.summary.count) return RENDERERS_ORIGINAL.forecast();
    return stage({ kicker: 'CA projeté · ' + year, big: n(f.projection),
      soft: 'ta moyenne de ' + money0(f.summary.average) + ' × 12 mois' + (state.goal ? ' · ' + pct(f.goalPercent, 0) + ' de l’objectif' : ''),
      stats: [['Encaissé', money0(f.summary.revenue)], ['À viser / mois', f.remainingMonths && state.goal ? money0(f.goalRequired) : '—'], ['Résultat projeté', money0(f.projectedNet)]] }) +
      strip(RENDERERS_ORIGINAL.forecast(), ['.grid-2']);
  }

  function pageAgenda() {
    var html = RENDERERS_ORIGINAL.agenda();
    var data = {};
    try { data = JSON.parse(localStorage.getItem('freelance-os-agenda-previsions-v1')) || {}; } catch (_) {}
    var key = data.activeMonth || C.monthKey();
    var list = (data.events || []).filter(function (e) { return String(e.date || '').slice(0, 7) === key; });
    var total = list.reduce(function (s, e) { return s + (Number(e.amount) || 0); }, 0);
    var goal = Number(data.forecastGoal) || state.monthlyGoal || 0;
    return stage({ kicker: 'Prévu en ' + esc(monthOnly(key)), big: n(total), soft: list.length + ' date' + (list.length > 1 ? 's' : '') + (goal ? ' · objectif ' + money0(goal) : ''),
      stats: goal ? [['Reste à trouver', total >= goal ? 'Atteint' : money0(goal - total)]] : [] }) + strip(html, ['.grid-3']);
  }

  function pageBricks() {
    var metrics = C.bricksMetrics(state.bricks);
    if (!metrics || (!metrics.portfolio && !metrics.projects.length)) return RENDERERS_ORIGINAL.bricks();
    return stage({ tone: 'bricks', kicker: 'Patrimoine Bricks', big: n(metrics.portfolio), soft: 'portefeuille ' + money0(metrics.wallet) + ' + capital investi',
      stats: [['Capital en cours', money0(metrics.capital)], ['Projets actifs', metrics.activeProjects], ['Moyenne / mois', money0(metrics.average)]] }) +
      strip(RENDERERS_ORIGINAL.bricks(), ['.bricks-hero']);
  }

  /* Menu en haut : barre flottante, le contenu gagne toute la largeur. */
  function mountTopbar() {
    var bar = document.createElement('header');
    bar.className = 'topbar';
    var inner = document.createElement('div');
    inner.className = 'topbar-in';
    inner.appendChild(document.querySelector('.side .brand').cloneNode(true));
    inner.appendChild(document.getElementById('nav'));
    inner.appendChild(document.getElementById('quick-links'));
    bar.appendChild(inner);
    document.body.insertBefore(bar, document.querySelector('.shell'));
    var onScroll = function () { bar.classList.toggle('scrolled', window.scrollY > 8); };
    window.addEventListener('scroll', onScroll, { passive: true }); onScroll();
  }

  var RENDERERS_ORIGINAL = {};
  Object.keys(RENDERERS).forEach(function (k) { RENDERERS_ORIGINAL[k] = RENDERERS[k]; });
  RENDERERS.dashboard = home;
  RENDERERS.months = pageMonths;
  RENDERERS.fixed = pageFixed;
  RENDERERS.fiscal = pageFiscal;
  RENDERERS.forecast = pageForecast;
  RENDERERS.agenda = pageAgenda;
  RENDERERS.bricks = pageBricks;
  mountTopbar();
  document.body.classList.add('apercu');
  render();
}());
