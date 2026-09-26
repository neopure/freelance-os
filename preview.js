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
    var goal = state.monthlyGoal, goalPct = goal ? t.revenue / goal * 100 : 0;
    var vat = C.threshold(state, year, state.vatThreshold), f = C.forecast(state, year);
    var today = new Date().toLocaleDateString('fr-FR', { weekday: 'long', day: 'numeric', month: 'long' });
    var items = [];
    if (due.total > 0) items.push({ tone: due.days <= 7 ? 'red' : 'purple', icon: 'fiscal', view: 'fiscal', title: 'Prélèvement URSSAF ' + (due.days <= 1 ? 'demain' : 'dans ' + due.days + ' jours'), sub: '1er ' + monthOnly(due.paymentMonth) + ' · CA de ' + monthOnly(due.period), amount: money(due.total) });
    else if (!due.item) items.push({ tone: 'purple', icon: 'months', action: 'new-month', title: 'Saisir ' + monthOnly(due.period), sub: 'Nécessaire pour l’URSSAF du 1er ' + monthOnly(due.paymentMonth), amount: '' });
    if (!state.vatEnabled && vat.percent >= 80) items.push({ tone: vat.percent >= 100 ? 'red' : 'amber', icon: 'fiscal', view: 'fiscal', title: 'Franchise TVA à ' + pct(vat.percent, 0), sub: vat.crossed ? 'Seuil dépassé' : vat.crossingThisYear ? 'Passage estimé en ' + monthOnly(vat.crossing) : 'Reste ' + money0(vat.remaining), amount: '' });
    nextEvents(2).forEach(function (e) {
      items.push({ tone: 'teal', icon: 'agenda', view: 'agenda', title: e.title, sub: new Date(e.date + 'T12:00:00').toLocaleDateString('fr-FR', { weekday: 'long', day: 'numeric', month: 'long' }), amount: e.amount ? money(e.amount) : '' });
    });
    if (state.goal) items.push({ tone: 'purple', icon: 'forecast', view: 'forecast', title: 'Objectif ' + year + ' · ' + pct(f.goalProgress, 0) + ' réalisé', sub: money0(y.revenue) + ' sur ' + money0(state.goal), amount: '' });
    return '<div class="home stagger">' +
      '<section class="welcome">' +
        '<div class="welcome-text"><span class="welcome-date">' + esc(today) + '</span>' +
          '<p class="welcome-line">En ' + esc(monthOnly(m.month)) + ', il te reste</p>' +
          '<span class="welcome-big">' + n(t.pocket) + '</span>' +
          '<p class="welcome-line soft">dans ta poche, sur ' + money(t.revenue) + ' encaissés.</p>' +
          '<div class="welcome-stats"><span><i>Charges</i><b>' + money0(t.expenses + t.personal) + '</b></span><span><i>URSSAF</i><b>' + money0(t.urssaf) + '</b></span><span><i>Part gardée</i><b>' + pct(t.revenue ? t.pocket / t.revenue * 100 : 0, 0) + '</b></span></div>' +
        '</div>' +
        (goal ? '<div class="welcome-ring">' + ring(goalPct) + '<div class="ring-label"><b>' + pct(goalPct, 0) + '</b><span>de l’objectif<br>' + money0(goal) + '</span></div></div>' : '') +
      '</section>' +
      '<div class="home-grid">' +
        '<section class="card feed"><div class="card-head"><h3>À surveiller</h3></div>' +
          (items.length ? items.map(function (it) {
            var attr = it.view ? 'data-view="' + it.view + '"' : 'data-action="' + it.action + '"';
            return '<button type="button" class="feed-item ' + it.tone + '" ' + attr + '><span class="feed-ico">' + icon(it.icon) + '</span><span class="feed-txt"><b>' + esc(it.title) + '</b><small>' + esc(it.sub) + '</small></span>' + (it.amount ? '<span class="feed-amt">' + it.amount + '</span>' : '') + '</button>';
          }).join('') : '<p class="note">Rien à signaler.</p>') + '</section>' +
        '<section class="card year"><div class="card-head"><h3>Ton année ' + year + '</h3><button class="link" data-view="months">Mes mois →</button></div>' +
          '<div class="year-figs"><div><span class="label">Encaissé</span><b>' + n(y.revenue) + '</b></div><div><span class="label">Dans ta poche</span><b>' + n(y.pocket) + '</b></div><div><span class="label">Projeté fin d’année</span><b>' + money0(f.projection) + '</b></div></div>' +
          yearCurve(year, goal) + '</section>' +
      '</div></div>';
  }

  function monthsView() {
    if (!state.months.length) return RENDERERS_ORIGINAL.months();
    var years = C.years(state);
    var year = window.__fosMonthsYear && years.indexOf(window.__fosMonthsYear) !== -1 ? window.__fosMonthsYear : years[0];
    var y = C.yearSummary(state, year), goal = state.monthlyGoal;
    var rows = C.monthsOfYear(state, year).map(function (m) {
      var t = C.calc(state, m);
      var parts = [['poche', Math.max(0, t.pocket), 'Dans ta poche'], ['urssaf', t.urssaf, 'URSSAF'], ['pro', t.expenses + Math.max(0, t.vat), 'Charges pro'], ['perso', t.personal, 'Charges perso']];
      var total = Math.max(t.revenue, parts.reduce(function (s, p) { return s + p[1]; }, 0), 1);
      var bar = parts.map(function (p) { return p[1] > 0 ? '<i class="seg-' + p[0] + '" data-w="' + (p[1] / total * 100) + '" title="' + p[2] + ' · ' + money(p[1]) + '"></i>' : ''; }).join('');
      var status = goal ? (t.revenue >= goal ? '<span class="pill ok">Objectif atteint</span>' : '<span class="pill low">−' + money0(goal - t.revenue) + '</span>') : '';
      return '<button type="button" class="mrow" data-action="edit-month" data-id="' + m.id + '" data-demo-lock>' +
        '<span class="mrow-name"><b>' + esc(monthOnly(m.month)) + '</b>' + status + '</span>' +
        '<span class="mrow-bar">' + bar + '</span>' +
        '<span class="mrow-figs"><b class="' + (t.pocket < 0 ? 'neg' : '') + '">' + money(t.pocket) + '</b><small>sur ' + money0(t.revenue) + '</small></span></button>';
    }).join('');
    return '<div class="stack stagger">' +
      (years.length > 1 ? '<div class="segmented" style="max-width:' + (years.length * 90) + 'px">' + years.map(function (yr) { return '<button type="button" data-months-year="' + yr + '" class="' + (yr === year ? 'on' : '') + '">' + yr + '</button>'; }).join('') + '</div>' : '') +
      '<div class="months-sum"><div><span class="label">Encaissé ' + year + '</span><b>' + n(y.revenue) + '</b></div><div><span class="label">Dans ta poche</span><b class="pos">' + n(y.pocket) + '</b></div><div><span class="label">Moyenne / mois</span><b>' + n(y.average) + '</b></div><div><span class="label">URSSAF</span><b>' + n(y.urssaf) + '</b></div></div>' +
      '<div class="card mlist"><div class="legend"><span><i class="seg-poche"></i>Dans ta poche</span><span><i class="seg-urssaf"></i>URSSAF</span><span><i class="seg-pro"></i>Charges pro</span><span><i class="seg-perso"></i>Charges perso</span></div>' + rows + '</div>' +
    '</div>';
  }

  var RENDERERS_ORIGINAL = { dashboard: RENDERERS.dashboard, months: RENDERERS.months };
  RENDERERS.dashboard = home;
  RENDERERS.months = monthsView;
  document.addEventListener('click', function (e) {
    var b = e.target.closest('[data-months-year]');
    if (b) { window.__fosMonthsYear = b.dataset.monthsYear; ui.animate = true; render(); }
  });
  document.body.classList.add('apercu');
  render();
}());
