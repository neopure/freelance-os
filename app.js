/* Freelance OS · interface.
   Un seul rendu par écran, à partir de l'état et des calculs de core.js. */
'use strict';

var C = window.FOSCore;
var state = C.load(localStorage);
var AGENDA_KEY = 'freelance-os-agenda-previsions-v1';
var VIEW_KEY = 'freelance-os-view';
var REDUCED = window.matchMedia && window.matchMedia('(prefers-reduced-motion: reduce)').matches;

var ui = { view: 'dashboard', animate: true };
try { ui.view = localStorage.getItem(VIEW_KEY) || 'dashboard'; } catch (_) {}

/* Au chargement, l'accueil montre toujours le dernier mois saisi. */
state.dashboardMonth = state.months[0] ? state.months[0].id : null;

/* ---------- Outils ---------- */
var q = function (s, root) { return (root || document).querySelector(s); };
var qa = function (s, root) { return Array.prototype.slice.call((root || document).querySelectorAll(s)); };
var fmtMoney = new Intl.NumberFormat('fr-FR', { style: 'currency', currency: 'EUR' });
var fmtMoney0 = new Intl.NumberFormat('fr-FR', { style: 'currency', currency: 'EUR', maximumFractionDigits: 0 });
function money(n) { return fmtMoney.format(n || 0); }
function money0(n) { return fmtMoney0.format(n || 0); }
function pct(n, digits) { return (Number.isFinite(n) ? n : 0).toFixed(digits == null ? 1 : digits).replace('.', ',') + ' %'; }
function rate(n) { return Number(n || 0).toFixed(2).replace(/\.?0+$/, '').replace('.', ',') + ' %'; }
function esc(v) { return String(v == null ? '' : v).replace(/[&<>"']/g, function (c) { return { '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[c]; }); }
function monthName(key) {
  if (!key) return '';
  var s = new Date(+key.slice(0, 4), +key.slice(5, 7) - 1, 1).toLocaleDateString('fr-FR', { month: 'long', year: 'numeric' });
  return s.charAt(0).toUpperCase() + s.slice(1);
}
function monthShort(key) { return new Date(+key.slice(0, 4), +key.slice(5, 7) - 1, 1).toLocaleDateString('fr-FR', { month: 'short' }).replace('.', ''); }
function monthOnly(key) { return new Date(+key.slice(0, 4), +key.slice(5, 7) - 1, 1).toLocaleDateString('fr-FR', { month: 'long' }); }
function n(value, kind) { return '<span class="num" data-n="' + (Number(value) || 0) + '" data-f="' + (kind || 'money') + '">' + (kind === 'pct' ? pct(value) : money(value)) + '</span>'; }
function save() { C.sortMonths(state); C.persist(localStorage, state); }
function toast(text) {
  var old = q('.toast'); if (old) old.remove();
  var t = document.createElement('div'); t.className = 'toast'; t.textContent = text;
  document.body.appendChild(t);
  setTimeout(function () { t.remove(); }, 2200);
}
function currentMonth() { return state.months.find(function (m) { return m.id === state.dashboardMonth; }) || state.months[0] || null; }
function currentYear() { var m = currentMonth(); return m ? m.month.slice(0, 4) : String(new Date().getFullYear()); }

var ICONS = {
  dashboard: '<path d="M3 11.5 12 4l9 7.5"/><path d="M5 10v10h14V10"/>',
  months: '<rect x="3" y="4" width="18" height="17" rx="3"/><path d="M3 9h18M8 2v4M16 2v4"/>',
  fixed: '<path d="M4 12a8 8 0 0 1 14-5.3L20 9"/><path d="M20 4v5h-5"/><path d="M20 12a8 8 0 0 1-14 5.3L4 15"/><path d="M4 20v-5h5"/>',
  fiscal: '<path d="M19 5 5 19"/><circle cx="7" cy="7" r="2.5"/><circle cx="17" cy="17" r="2.5"/>',
  forecast: '<path d="M3 17l6-6 4 4 8-8"/><path d="M15 7h6v6"/>',
  agenda: '<rect x="3" y="4" width="18" height="17" rx="3"/><path d="M3 9h18"/><circle cx="12" cy="15" r="2"/>',
  bricks: '<path d="M12 3 3 8l9 5 9-5-9-5Z"/><path d="m3 13 9 5 9-5"/>',
  plus: '<path d="M12 5v14M5 12h14"/>',
  more: '<circle cx="5" cy="12" r="1.6"/><circle cx="12" cy="12" r="1.6"/><circle cx="19" cy="12" r="1.6"/>',
  trash: '<path d="M4 7h16M9 7V4h6v3M6 7l1 13h10l1-13"/>',
  upload: '<path d="M12 16V4M6 10l6-6 6 6"/><path d="M4 20h16"/>',
  target: '<circle cx="12" cy="12" r="9"/><circle cx="12" cy="12" r="5"/><circle cx="12" cy="12" r="1.5"/>'
};
function icon(name) { return '<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round">' + ICONS[name] + '</svg>'; }

var VIEWS = [
  { id: 'dashboard', label: 'Accueil', short: 'Accueil' },
  { id: 'months', label: 'Mes mois', short: 'Mois' },
  { id: 'fixed', label: 'Charges fixes', short: 'Charges' },
  { id: 'fiscal', label: 'TVA & URSSAF', short: 'Fiscalité' },
  { id: 'forecast', label: 'Prévisions', short: 'Prévisions' },
  { id: 'agenda', label: 'Agenda', short: 'Agenda' },
  { id: 'bricks', label: 'Patrimoine', short: 'Patrimoine' }
];

/* ---------- Coquille ---------- */
function mountShell() {
  q('#nav').innerHTML = VIEWS.map(function (v) {
    return '<button type="button" data-view="' + v.id + '" title="' + v.label + '">' + icon(v.id) + '<span class="l-full">' + v.label + '</span><span class="l-short">' + v.short + '</span></button>';
  }).join('');
  q('#tabbar').innerHTML =
    '<button type="button" data-view="dashboard">' + icon('dashboard') + 'Accueil</button>' +
    '<button type="button" data-view="months">' + icon('months') + 'Mois</button>' +
    '<button type="button" class="plus" data-action="new-month" data-demo-lock><span>' + icon('plus') + '</span></button>' +
    '<button type="button" data-view="agenda">' + icon('agenda') + 'Agenda</button>' +
    '<button type="button" data-action="more">' + icon('more') + 'Plus</button>';
  document.addEventListener('click', function (e) {
    var viewBtn = e.target.closest('[data-view]');
    if (viewBtn) { go(viewBtn.dataset.view); return; }
    var act = e.target.closest('[data-action]');
    if (act && ACTIONS[act.dataset.action]) ACTIONS[act.dataset.action](act, e);
  });
  renderShortcuts();
}
function go(view) {
  if (!VIEWS.some(function (v) { return v.id === view; })) view = 'dashboard';
  var changed = ui.view !== view;
  ui.view = view;
  try { localStorage.setItem(VIEW_KEY, view); } catch (_) {}
  ui.animate = changed || ui.animate;
  render();
  if (changed) window.scrollTo({ top: 0, behavior: REDUCED ? 'auto' : 'smooth' });
}

var TITLES = { dashboard: '', months: 'Mes mois', fixed: 'Charges fixes', fiscal: 'TVA & URSSAF', forecast: 'Prévisions', agenda: 'Agenda', bricks: 'Patrimoine' };
function greeting() {
  var name = '';
  try { name = (window.FreelanceOSAccount && JSON.parse(localStorage.getItem('freelance-os-session-v1') || '{}').name || '').split(' ')[0]; } catch (_) {}
  return 'Bonjour' + (name ? ' ' + name : '') + ' !';
}

function render() {
  qa('[data-view]').forEach(function (b) { b.classList.toggle('on', b.dataset.view === ui.view); });
  var more = q('#tabbar [data-action=more]');
  if (more) more.classList.toggle('on', ['fixed', 'fiscal', 'forecast', 'bricks'].indexOf(ui.view) !== -1);
  q('#title').textContent = TITLES[ui.view] || greeting();
  var picker = q('#month-picker');
  picker.hidden = ui.view !== 'dashboard' || state.months.length < 2;
  picker.innerHTML = esc(monthName(state.dashboardMonth || '')) + '<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round"><path d="m6 9 6 6 6-6"/></svg>';
  var root = q('#view');
  root.className = 'view on' + (ui.animate && !REDUCED ? ' enter' : '');
  root.innerHTML = RENDERERS[ui.view]();
  renderWatch();
  afterRender(root);
  ui.animate = false;
}
window.render = render;

/* ---------- Animations ---------- */
function ease(t) { return 1 - Math.pow(1 - t, 3); }
function afterRender(root) {
  var animate = ui.animate && !REDUCED && !state.demoMode;
  qa('[data-n]', root).forEach(function (el) {
    var target = Number(el.dataset.n), kind = el.dataset.f;
    var show = function (v) { el.textContent = kind === 'pct' ? pct(v) : money(v); };
    if (!animate || !target) { show(target); return; }
    var start = null;
    var step = function (ts) {
      if (start === null) start = ts;
      var t = Math.min(1, (ts - start) / 350);
      show(target * ease(t));
      if (t < 1) requestAnimationFrame(step);
    };
    show(0); requestAnimationFrame(step);
  });
  /* Barres et jauges : elles partent de zéro puis se remplissent. */
  var grow = qa('[data-h],[data-w]', root);
  if (animate) {
    grow.forEach(function (el) { if (el.dataset.h) el.style.height = '0%'; else el.style.width = '0%'; });
    requestAnimationFrame(function () { requestAnimationFrame(function () { grow.forEach(apply); }); });
  } else grow.forEach(apply);
  function apply(el) { if (el.dataset.h) el.style.height = el.dataset.h + '%'; else el.style.width = el.dataset.w + '%'; }
  if (state.demoMode) maskAmounts(root);
  document.body.classList.toggle('demo', !!state.demoMode);
}

/* ---------- Mode démo : chiffres fictifs, données intactes ---------- */
var DEMO_EUROS = [1280, 2460, 875, 3125, 1590, 4720, 960, 2280, 3640, 1140, 2860, 1980];
var DEMO_PCTS = [18.6, 42.1, 67.4, 24.8, 81.2, 35.7, 54.9, 29.3, 72.6, 46.2];
function maskAmounts(root) {
  var walker = document.createTreeWalker(root, NodeFilter.SHOW_TEXT, null);
  var nodes = [], node, i = 0;
  while ((node = walker.nextNode())) {
    if (node.parentElement && !node.parentElement.closest('input,select,button,.demo-banner') && /\d/.test(node.nodeValue)) nodes.push(node);
  }
  nodes.forEach(function (tn) {
    tn.nodeValue = tn.nodeValue
      .replace(/[-−]?\s*\d[\d\s .,]*\s?€/g, function () { var v = DEMO_EUROS[i % DEMO_EUROS.length] + ((i * 37) % 100) / 100; i++; return money(v); })
      .replace(/\d+[,.]?\d*\s?%/g, function () { return pct(DEMO_PCTS[(i++) % DEMO_PCTS.length]); });
  });
}

/* ---------- Panneau latéral : ce qu'il faut garder en tête ---------- */
function urssafCountdown(due) {
  var ms = due.msLeft, d = Math.ceil(ms / 86400000), h = Math.floor(ms / 3600000) % 24, mn = Math.floor(ms / 60000) % 60;
  return 'J-' + d + ' · ' + String(h).padStart(2, '0') + 'h' + String(mn).padStart(2, '0');
}
function renderWatch() {
  var box = q('#watch'); if (!box) return;
  var latest = state.months[0];
  var due = C.urssafUpcoming(state);
  var html = '';
  if (latest) {
    var t = C.calc(state, latest), goal = state.monthlyGoal;
    var p = goal ? Math.min(100, t.revenue / goal * 100) : 0;
    html += '<div class="watch' + (goal ? ' goal' : '') + '"><small>' + (goal ? '◎ Moyenne visée · ' : 'CA · ') + esc(monthName(latest.month)) + '</small><b>' + money(t.revenue) + (goal ? ' <span style="color:#a9a4b8;font-weight:600;font-size:12px">/ ' + money0(goal) + '</span>' : '') + '</b>' +
      (goal ? '<div class="bar"><i style="width:' + p + '%"></i></div><em>' + (t.revenue >= goal ? 'Moyenne visée atteinte' : money(goal - t.revenue) + ' sous la moyenne visée') + '</em>' : '') + '</div>';
  }
  var urgent = due.total > 0 && due.days <= 7;
  html += '<div class="watch' + (urgent ? ' alert' : '') + '"><small>URSSAF · 1er ' + esc(monthOnly(due.paymentMonth)) + '</small><b>' + money(due.total) + '</b><em>' + urssafCountdown(due) + '</em></div>';
  box.innerHTML = html;
  if (state.demoMode) maskAmounts(box);
}
setInterval(renderWatch, 30000);

/* ---------- Composants ---------- */
function kpi(label, value, note, cls) {
  return '<div class="kpi ' + (cls || '') + '"><span class="label">' + label + '</span><span class="value">' + value + '</span>' + (note ? '<span class="note">' + note + '</span>' : '') + '</div>';
}
function gauge(title, th, opts) {
  opts = opts || {};
  var level = th.percent >= 100 ? 'alert' : th.percent >= 80 ? 'warn' : '';
  var crossing = th.crossed ? 'Seuil atteint' : th.crossing ? (th.crossingThisYear ? monthName(th.crossing) : 'Pas cette année') : '—';
  return '<div class="card' + (level === 'alert' ? ' alert-card' : '') + '"><div class="gauge-top"><h3>' + title + '</h3><span class="pct num">' + n(th.percent, 'pct') + '</span></div>' +
    '<div class="track ' + level + '"><i data-w="' + Math.min(100, th.percent) + '"></i></div>' +
    '<div class="facts"><div><span class="label">CA micro ' + esc(opts.year || '') + '</span><b>' + n(th.micro) + '</b></div><div><span class="label">Reste avant ' + money0(th.limit) + '</span><b>' + n(th.remaining) + '</b></div><div><span class="label">Passage estimé</span><b>' + esc(crossing) + '</b></div></div></div>';
}
function barChart(items, goal, opts) {
  opts = opts || {};
  var max = Math.max.apply(null, items.map(function (i) { return i.value; }).concat([goal || 0, 1]));
  var goalLine = goal ? '<div class="goal-line" style="bottom:calc(' + (goal / max * 100) + '% * (100% - 40px) / 100% + 24px)"><em>' + money0(goal) + '</em></div>' : '';
  return '<div class="bars ' + (opts.cls || '') + '">' + goalLine + items.map(function (i) {
    var cls = i.value <= 0 ? 'empty' : goal && i.value < goal && !opts.noLow ? 'low' : '';
    var h = i.value > 0 ? Math.max(4, i.value / max * 100) : 3;
    return '<div class="col ' + cls + '"' + (i.onclick ? ' ' + i.onclick : '') + '><span class="tip">' + esc(i.tip || money(i.value)) + '</span>' + (i.value > 0 && !opts.noValues ? '<span class="val">' + money0(i.value) + '</span>' : '') + '<div class="b" data-h="' + (h * 0.82) + '"></div><span>' + esc(i.label) + '</span></div>';
  }).join('') + '</div>';
}
function emptyState(title, button) { return '<div class="card empty-state"><b>' + title + '</b>' + (button || '') + '</div>'; }

/* ---------- Accueil ---------- */
function viewDashboard() {
  var m = currentMonth();
  if (!m) return emptyState('Aucun mois saisi pour l’instant', '<button class="btn" data-action="new-month" data-demo-lock>' + icon('plus') + 'Saisir mon premier mois</button>');
  var t = C.calc(state, m), year = m.month.slice(0, 4), y = C.yearSummary(state, year), due = C.urssafUpcoming(state);
  var goal = state.monthlyGoal, share = t.revenue ? t.pocket / t.revenue * 100 : 0;
  var n1 = m.lastYear > 0 ? (t.revenue / m.lastYear - 1) * 100 : null;
  var chips = [['Micro', y.micro], ['CDD', y.cdd], ['SACEM', y.sacem], ['Autres', y.other]].filter(function (c, i) { return i === 0 || c[1] > 0; });
  var urgent = due.total > 0 && due.days <= 7;
  var monthsKeys = []; for (var i = 1; i <= 12; i++) monthsKeys.push(year + '-' + String(i).padStart(2, '0'));
  var chart = monthsKeys.map(function (k) {
    var item = state.months.find(function (x) { return x.month === k; });
    var v = item ? C.calc(state, item).revenue : 0;
    return { label: monthShort(k), value: v, tip: monthName(k) + ' · ' + money(v), onclick: item ? 'data-action="edit-month" data-id="' + k + '"' : '' };
  });
  var thVat = C.threshold(state, year, state.vatThreshold), thMicro = C.threshold(state, year, state.microThreshold);
  return '<div class="stack stagger">' +
    '<div class="grid-2">' +
      '<div class="hero"><span class="label">Dans ta poche · ' + esc(monthName(m.month)) + '</span><span class="big">' + n(t.pocket) + '</span>' +
        '<span class="sub"><b>' + pct(share) + '</b> de tes recettes</span>' +
        (goal ? '<div class="progress goal"><i data-w="' + Math.min(100, t.revenue / goal * 100) + '"></i></div><span class="note" style="color:rgba(255,255,255,.85);margin-top:8px">◎ ' + money(t.revenue) + ' encaissés · moyenne visée ' + money0(goal) + '</span>' : '') + '</div>' +
      '<div class="hero dark"><span class="label">CA encaissé · ' + year + '</span><span class="big">' + n(y.revenue) + '</span>' +
        '<span class="sub">Dans ta poche · <b>' + money(y.pocket) + '</b></span>' +
        '<div class="chips">' + chips.map(function (c) { return '<span class="chip">' + c[0] + ' <b>' + money(c[1]) + '</b></span>'; }).join('') + '</div></div>' +
    '</div>' +
    '<div class="grid-4">' +
      kpi('Recettes du mois', n(t.revenue), n1 === null ? '' : '<span class="' + (n1 >= 0 ? 'pos' : 'neg') + '">' + (n1 >= 0 ? '+' : '') + pct(n1) + ' vs N-1</span>') +
      kpi('Charges pro', n(t.expenses), 'dont fixes ' + money(C.fixedTotal(state, 'pro'))) +
      kpi('Charges perso', n(t.personal), 'dont fixes ' + money(C.fixedTotal(state, 'perso'))) +
      kpi('URSSAF · 1er ' + monthOnly(due.paymentMonth), n(due.total), due.item ? urssafCountdown(due) + ' · CA ' + monthOnly(due.period) : 'Synthèse de ' + monthOnly(due.period) + ' à saisir', urgent ? 'alert' : '') +
    '</div>' +
    '<div class="card"><div class="card-head"><h3>Recettes ' + year + '</h3></div>' + barChart(chart, goal) + '</div>' +
    '<div class="grid-2">' + (state.vatEnabled ? '' : gauge('Franchise TVA', thVat, { year: year })) + gauge('Plafond micro-entreprise', thMicro, { year: year }) + '</div>' +
  '</div>';
}

/* ---------- Mes mois ---------- */
function viewMonths() {
  if (!state.months.length) return emptyState('Aucun mois saisi pour l’instant', '<button class="btn" data-action="new-month" data-demo-lock>' + icon('plus') + 'Saisir un mois</button>');
  var years = C.years(state);
  var year = window.__fosMonthsYear && years.indexOf(window.__fosMonthsYear) !== -1 ? window.__fosMonthsYear : years[0];
  var y = C.yearSummary(state, year), goal = state.monthlyGoal;
  var rows = C.monthsOfYear(state, year).map(function (m) {
    var t = C.calc(state, m);
    var parts = [['poche', Math.max(0, t.pocket), 'Dans ta poche'], ['urssaf', t.urssaf, 'URSSAF'], ['pro', t.expenses + Math.max(0, t.vat), 'Charges pro'], ['perso', t.personal, 'Charges perso']];
    var total = Math.max(t.revenue, parts.reduce(function (s, p) { return s + p[1]; }, 0), 1);
    var bar = parts.map(function (p) { return p[1] > 0 ? '<i class="seg-' + p[0] + '" data-w="' + (p[1] / total * 100) + '" title="' + p[2] + ' · ' + money(p[1]) + '"></i>' : ''; }).join('');
    var status = goal ? (t.revenue >= goal ? '<span class="pill goal-ok">◎ Moyenne visée</span>' : '<span class="pill goal-low">◎ −' + money0(goal - t.revenue) + '</span>') : '';
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
document.addEventListener('click', function (e) {
  var b = e.target.closest('[data-months-year]');
  if (b) { window.__fosMonthsYear = b.dataset.monthsYear; ui.animate = true; render(); }
});

/* ---------- Charges fixes ---------- */
var CATEGORIES = ['Abonnement', 'Assurance', 'Comptabilité', 'Loyer / coworking', 'Téléphonie', 'Autre charge fixe'];
function viewFixed() {
  var total = C.fixedTotal(state), pro = C.fixedTotal(state, 'pro'), perso = C.fixedTotal(state, 'perso');
  var add = '<button class="btn quiet" data-action="new-fixed" data-demo-lock>' + icon('plus') + 'Ajouter une charge</button>';
  if (!state.fixed.length) return emptyState('Aucune charge fixe', add.replace('btn quiet', 'btn'));
  var groups = {};
  state.fixed.forEach(function (f) { groups[f.category] = (groups[f.category] || 0) + C.monthlyAmount(f); });
  var cats = Object.keys(groups).map(function (k) { return { label: k, value: groups[k] }; }).sort(function (a, b) { return b.value - a.value; });
  var max = cats.length ? cats[0].value : 1;
  var cols = 'minmax(0,1.4fr) minmax(0,1fr) minmax(0,.8fr) minmax(0,.9fr)';
  var list = state.fixed.slice().sort(function (a, b) { return a.scope.localeCompare(b.scope) || C.monthlyAmount(b) - C.monthlyAmount(a); });
  return '<div class="stack stagger">' +
    '<div class="hero dark"><span class="label">Charges fixes · par mois</span><span class="big">' + n(total) + '</span>' +
      '<div class="chips"><span class="chip">Pro <b>' + money(pro) + '</b></span><span class="chip">Perso <b>' + money(perso) + '</b></span><span class="chip">' + state.fixed.length + ' charge' + (state.fixed.length > 1 ? 's' : '') + '</span></div></div>' +
    '<div class="card"><div class="card-head"><h3>Par catégorie</h3></div><div class="hbars">' + cats.map(function (c) {
      return '<div class="hbar"><span>' + esc(c.label) + '</span><i><b data-w="' + Math.max(3, c.value / max * 100) + '"></b></i><strong>' + money0(c.value) + '</strong></div>';
    }).join('') + '</div></div>' +
    '<div class="section-head"><h2>Toutes les charges</h2>' + add + '</div>' +
    '<div class="table"><div class="tr head" style="grid-template-columns:' + cols + '"><span>Charge</span><span>Catégorie</span><span>Type</span><span class="r">Par mois</span></div>' +
    list.map(function (f) {
      return '<div class="tr click m-card" style="grid-template-columns:' + cols + '" data-action="edit-fixed" data-id="' + esc(f.id) + '" data-demo-lock><span class="strong">' + esc(f.label) + (f.frequency === 'annual' ? '<span class="tag">' + money0(f.amount) + ' / an</span>' : '') + '</span>' +
        '<span class="m-hide" style="color:var(--muted)">' + esc(f.category) + '</span><span class="m-hide" style="color:var(--muted)">' + (f.scope === 'pro' ? 'Pro' : 'Perso') + '</span><span class="r strong neg">' + money(C.monthlyAmount(f)) + '</span></div>';
    }).join('') + '</div></div>';
}

/* ---------- TVA & URSSAF ---------- */
function viewFiscal() {
  var due = C.urssafUpcoming(state), year = currentYear(), m = currentMonth();
  var urgent = due.total > 0 && due.days <= 7;
  var d = due.details;
  var hero = '<div class="hero ' + (urgent ? 'urgent' : 'dark') + '"><div class="due"><div><span class="label">URSSAF · prélèvement du 1er ' + esc(monthOnly(due.paymentMonth)) + '</span>' +
    '<span class="big">' + n(due.total) + '</span><span class="countdown">' + urssafCountdown(due) + '</span></div></div>' +
    (d ? '<div class="detail-row"><span>BNC <b>' + money(d.bncContribution) + '</b></span><span>BIC <b>' + money(d.bicContribution) + '</b></span><span>CFP + CCI <b>' + money(d.cfpContribution + d.cciContribution) + '</b></span><span>CA de ' + esc(monthName(due.period)) + '</span></div>'
       : '<div class="detail-row"><span>Synthèse de ' + esc(monthName(due.period)) + ' à saisir</span></div>') + '</div>';
  var vatCard = '<div class="card"><div class="card-head"><h3>TVA</h3><button class="switch' + (state.vatEnabled ? ' on' : '') + '" data-action="toggle-vat" aria-label="Activer la TVA" data-demo-lock></button></div>' +
    (state.vatEnabled
      ? '<div class="grid-2"><div><span class="label">À provisionner · ' + esc(m ? monthName(m.month) : '') + '</span><span class="value">' + n(m ? m.vatCollected : 0) + '</span></div><div><span class="label">Cumul ' + year + '</span><span class="value">' + n(C.yearSummary(state, year).vat) + '</span></div></div>'
      : '<span class="label">Franchise en base de TVA</span><span class="value" style="color:var(--faint)">Inactive</span>') + '</div>';
  var rates = '<div class="card"><div class="card-head"><h3>Taux</h3><button class="btn quiet" data-action="activities" data-demo-lock>Activités</button><button class="btn quiet" data-action="fiscal-settings" data-demo-lock>Réglages</button></div>' +
    '<div class="facts"><div><span class="label">BNC</span><b>' + rate(state.bncTaxRate) + '</b></div><div><span class="label">BIC</span><b>' + rate(state.bicTaxRate) + '</b></div><div><span class="label">CFP + CCI</span><b>' + rate(state.cfpRate + state.cciRate) + '</b></div></div></div>';
  var cols = 'minmax(110px,1.2fr) repeat(5,minmax(0,1fr))';
  var months = C.monthsOfYear(state, year);
  var table = months.length ? '<div class="section-head"><h2>URSSAF ' + year + '</h2></div><div class="table"><div class="tr head" style="grid-template-columns:' + cols + '"><span>Mois</span><span class="r">BNC · ' + rate(state.bncTaxRate) + '</span><span class="r">BIC · ' + rate(state.bicTaxRate) + '</span><span class="r">CFP · ' + rate(state.cfpRate) + '</span><span class="r">CCI · ' + rate(state.cciRate) + '</span><span class="r">Total</span></div>' +
    months.map(function (mm) {
      var t = C.calc(state, mm);
      return '<div class="tr m-card" style="grid-template-columns:' + cols + '"><span class="strong">' + esc(monthName(mm.month)) + '</span><span class="r m-hide">' + money(t.bncContribution) + '<small>' + money0(mm.bnc) + '</small></span><span class="r m-hide">' + money(t.bicContribution) + '<small>' + money0(mm.bic) + '</small></span><span class="r m-hide">' + money(t.cfpContribution) + '</span><span class="r m-hide">' + money(t.cciContribution) + '</span><span class="r strong">' + money(t.urssaf) + '</span></div>';
    }).join('') + '<div class="tr m-card" style="grid-template-columns:' + cols + ';background:var(--lav-2)"><span class="strong">Total ' + year + '</span><span class="m-hide"></span><span class="m-hide"></span><span class="m-hide"></span><span class="m-hide"></span><span class="r strong">' + money(C.yearSummary(state, year).urssaf) + '</span></div></div>' : '';
  return '<div class="stack stagger">' + hero + '<div class="grid-2">' + vatCard + rates + '</div>' +
    '<div class="grid-2">' + (state.vatEnabled ? '' : gauge('Franchise TVA', C.threshold(state, year, state.vatThreshold), { year: year })) + gauge('Plafond micro-entreprise', C.threshold(state, year, state.microThreshold), { year: year }) + '</div>' +
    table + '</div>';
}

/* ---------- Prévisions ---------- */
function viewForecast() {
  var year = currentYear(), f = C.forecast(state, year), n1Year = String(Number(year) - 1);
  if (!f.summary.count) return emptyState('Saisis un premier mois pour obtenir des prévisions', '<button class="btn" data-action="new-month" data-demo-lock>' + icon('plus') + 'Saisir un mois</button>');
  var target, targetNote;
  if (!f.remainingMonths) { target = 'Terminé'; targetNote = 'Exercice ' + year + ' complet'; }
  else if (state.goal) { target = n(f.goalRequired); targetNote = f.goalRequired ? 'par mois pendant ' + f.remainingMonths + ' mois pour ' + money0(state.goal) : 'Objectif déjà atteint'; }
  else { target = '—'; targetNote = '<button class="link" style="color:var(--cyan)" data-action="objectives">Définir un objectif</button>'; }
  var sign = function (v) { return (v >= 0 ? '+' : '') + pct(v, 1); };
  return '<div class="stack stagger"><div class="grid-2">' +
    '<div class="hero"><span class="label">CA projeté · ' + year + '</span><span class="big">' + n(f.projection) + '</span>' +
      '<span class="sub">Moyenne <b>' + money0(f.summary.average) + '</b> × 12 mois</span>' +
      '<span class="note" style="color:rgba(255,255,255,.85);margin-top:10px">' + money0(f.summary.revenue) + ' encaissés' + (f.remainingMonths ? ' + ' + f.remainingMonths + ' mois à ' + money0(f.summary.average) : '') + (state.goal ? ' · ' + pct(f.goalPercent, 0) + ' de l’objectif' : '') + '</span></div>' +
    '<div class="hero goal"><span class="label">◎ CA mensuel à viser</span><span class="big">' + target + '</span><span class="sub">' + targetNote + '</span></div></div>' +
    '<div class="card goal-card"><div class="card-head"><h3><span class="goal-badge">' + icon('target') + '</span>Objectif annuel ' + year + '</h3><button class="btn quiet" data-action="objectives" data-demo-lock>Modifier</button></div><div class="facts">' +
      '<div><span class="label">Annuel</span><b>' + (state.goal ? money(state.goal) : '—') + '</b>' + (state.goal ? '<span class="note">' + pct(f.goalProgress, 0) + ' réalisé</span>' : '') + '</div>' +
      '<div><span class="label">Moyenne visée / mois</span><b>' + (state.monthlyGoal ? money(state.monthlyGoal) : '—') + '</b></div>' +
      '<div><span class="label">vs ' + n1Year + '</span><b>' + (f.goalGrowth === null ? '—' : sign(f.goalGrowth)) + '</b><span class="note">' + (f.growthBase ? 'sur ' + money0(f.growthBase) + ' · projeté ' + sign(f.projectedGrowth) : '<button class="link" data-action="objectives">CA ' + n1Year + ' à renseigner</button>') + '</span></div>' +
    '</div></div>' +
    '<div class="grid-4">' +
      kpi('Moyenne mensuelle', n(f.summary.average), 'recettes encaissées') +
      kpi('Charges projetées', n(f.projectedExpenses), 'fixes et variables') +
      (state.vatEnabled ? kpi('TVA projetée', n(f.projectedVat)) : kpi('URSSAF projetée', n(f.projectedUrssaf))) +
      kpi('Résultat projeté', n(f.projectedNet), 'après charges, TVA et URSSAF') +
    '</div></div>';
}

/* ---------- Patrimoine Bricks ---------- */
function viewBricks() {
  var metrics = C.bricksMetrics(state.bricks);
  var importBtn = '<button class="btn bricks" data-action="import-bricks" data-demo-lock>' + icon('upload') + 'Importer l’export Bricks</button>';
  if (!metrics || (!metrics.portfolio && !metrics.projects.length)) return '<div class="card b empty-state"><b>Aucun export Bricks importé</b>' + importBtn + '</div>';
  var horizon = [1, 5, 10].indexOf(state.bricks.projectionHorizon) !== -1 ? state.bricks.projectionHorizon : 1;
  var p = C.bricksProjection(metrics, horizon);
  var cols = 'minmax(0,1.6fr) minmax(0,1fr) minmax(0,1fr)';
  return '<div class="stack stagger">' +
    '<div class="section-head" style="margin-top:0"><h2 style="color:var(--muted);font-weight:650;font-size:var(--fs-s)">' + (metrics.updated ? 'Dernier export · ' + esc(metrics.updated) : '') + '</h2>' + importBtn.replace('btn bricks', 'btn bricks') + '</div>' +
    '<div class="bricks-hero"><div><span class="label">Patrimoine Bricks estimé</span><span class="big">' + n(metrics.portfolio) + '</span><span class="note">Portefeuille ' + money(metrics.wallet) + ' + capital investi</span></div>' +
      '<div class="side-stat"><span class="label">Capital en cours</span><b>' + n(metrics.capital) + '</b><span class="note">' + (metrics.bricksCount ? metrics.bricksCount + ' bricks · ' : '') + metrics.activeProjects + ' projets actifs</span></div></div>' +
    '<div class="grid-4">' +
      kpi('Investi · ' + esc(metrics.lastPeriod || 'dernier mois'), n(metrics.lastInvestment), '', 'b') +
      kpi('Moyenne / mois', n(metrics.average), 'sur ' + metrics.historyMonths + ' mois', 'b') +
      kpi('Intérêts nets · dernier mois', n(metrics.lastIncome), '', 'b') +
      kpi('Capital remboursé', n(metrics.repaid), 'depuis le début', 'b') +
    '</div>' +
    '<div class="grid-2">' +
      '<div class="card b"><div class="card-head"><h3>Projection</h3><div class="seg">' + [1, 5, 10].map(function (h) { return '<button class="' + (h === horizon ? 'on' : '') + '" data-action="bricks-horizon" data-h="' + h + '">' + h + ' an' + (h > 1 ? 's' : '') + '</button>'; }).join('') + '</div></div>' +
        '<div class="proj"><small>Dans ' + horizon + ' an' + (horizon > 1 ? 's' : '') + '</small><b>' + n(p.capital) + '</b><span>≈ ' + money(p.monthlyInterest) + ' d’intérêts par mois</span></div>' +
        '<div class="proj-meta"><span>Rythme <b>' + money0(metrics.average) + ' / mois</b></span><span class="inline-edit">Rendement <input type="number" min="0" max="100" step="0.1" value="' + (metrics.rate * 100).toFixed(1) + '" data-action="bricks-rate" aria-label="Rendement annuel"> % / an</span></div></div>' +
      '<div class="card b"><div class="card-head"><h3>Investissements mensuels</h3></div>' + (metrics.history.length > 1 ? barChart(metrics.history.map(function (h) { return { label: monthShort(h.month), value: h.value, tip: monthName(h.month) + ' · ' + money(h.value) }; }), 0, { cls: 'bricks-bars', noValues: true }) : '<p class="note">Historique disponible après un import.</p>') + '</div>' +
    '</div>' +
    (metrics.projects.length ? '<div class="section-head"><h2>Projets en cours · ' + metrics.projects.length + '</h2></div><div class="table"><div class="tr head" style="grid-template-columns:' + cols + '"><span>Projet</span><span class="r">Capital en cours</span><span class="r">Revenus encaissés</span></div>' +
      metrics.projects.map(function (pr) { return '<div class="tr" style="grid-template-columns:' + cols + '"><span class="strong" style="overflow:hidden;text-overflow:ellipsis;white-space:nowrap">' + esc(pr.name) + '</span><span class="r strong" style="color:#e2521a">' + money(C.num(pr.invested) - C.num(pr.repaid)) + '</span><span class="r">' + money(pr.income) + '</span></div>'; }).join('') + '</div>' : '') +
  '</div>';
}

var RENDERERS = { dashboard: viewDashboard, months: viewMonths, fixed: viewFixed, fiscal: viewFiscal, forecast: viewForecast, agenda: function () { return window.FOSAgenda ? window.FOSAgenda.view() : ''; }, bricks: viewBricks };

/* ---------- Fenêtres ---------- */
function openSheet(title, body, foot, onMount) {
  closeSheet();
  var modal = document.createElement('div');
  modal.className = 'modal';
  modal.innerHTML = '<form class="sheet" novalidate><div class="sheet-head"><h2>' + title + '</h2><button type="button" class="close" data-close aria-label="Fermer">×</button></div>' + body + (foot ? '<div class="sheet-foot">' + foot + '</div>' : '') + '</form>';
  document.body.appendChild(modal);
  modal.addEventListener('click', function (e) { if (e.target === modal || e.target.closest('[data-close]')) closeSheet(); });
  document.addEventListener('keydown', escClose);
  var form = q('form', modal);
  if (onMount) onMount(form, modal);
  var first = q('input:not([type=hidden]),select', form);
  if (first && window.matchMedia('(min-width:761px)').matches) first.focus();
  return form;
}
function closeSheet() { var m = q('.modal'); if (m) m.remove(); document.removeEventListener('keydown', escClose); }
function escClose(e) { if (e.key === 'Escape') closeSheet(); }
function field(name, label, value, opts) {
  opts = opts || {};
  return '<div class="field' + (opts.full ? ' full' : '') + '"><label for="f-' + name + '">' + label + '</label><input id="f-' + name + '" name="' + name + '" type="' + (opts.type || 'number') + '"' + (opts.type === 'month' || opts.type === 'text' || opts.type === 'date' ? '' : ' inputmode="decimal" step="0.01" min="0"') + ' value="' + esc(value === 0 && !opts.keepZero ? '' : value) + '" placeholder="' + esc(opts.placeholder || (opts.type ? '' : '0')) + '"' + (opts.required ? ' required' : '') + '></div>';
}
function val(form, name) { var el = form.elements[name]; var v = Number(String(el ? el.value : '').replace(',', '.')); return Number.isFinite(v) ? v : 0; }

function openMonth(id) {
  var existing = state.months.find(function (m) { return m.id === id; });
  var latest = state.months[0];
  var nextKey = latest ? C.monthKey(new Date(+latest.month.slice(0, 4), +latest.month.slice(5, 7), 1)) : C.monthKey();
  var m = existing || C.emptyMonth(nextKey);
  var body = '<div class="fields">' + FOSUI.monthField('month', 'Mois', m.month, true) + '</div>' +
    '<div class="group group-link">Recettes<button type="button" class="link" data-acts>' + (state.activities.length ? 'Mes activités' : 'Détailler par activité') + '</button></div>' + revenueFields(m) +
    '<div class="group">Dépenses du mois</div><div class="fields">' + field('variable', 'Dépenses pro', m.variable) + field('invest', 'Achat / investissement pro', m.invest) + field('personal', 'Dépenses perso', m.personal, { full: true }) + '</div>' +
    (state.vatEnabled ? '<div class="group">TVA</div><div class="fields">' + field('vatCollected', 'TVA à provisionner', m.vatCollected, { full: true }) + '</div>' : '') +
    '<div class="group">Comparaison</div><div class="fields">' + field('lastYear', 'Recettes du même mois N-1', m.lastYear, { full: true }) + '</div>';
  var foot = '<div class="preview">Dans ta poche<b data-preview>—</b></div>' + (existing ? '<button type="button" class="btn danger" data-delete>Supprimer</button>' : '') + '<button class="btn" type="submit">Enregistrer</button>';
  openSheet(existing ? monthName(m.month) : 'Nouveau mois', body, foot, function (form) {
    var read = function () {
      var d = Object.assign(C.emptyMonth(form.elements.month.value || m.month), m);
      ['variable', 'invest', 'personal', 'lastYear'].forEach(function (k) { d[k] = val(form, k); });
      if (state.activities.length) {
        d.split = {};
        state.activities.forEach(function (a) { if (val(form, 'act-' + a.id)) d.split[a.id] = val(form, 'act-' + a.id); });
        Object.keys(C.KINDS).forEach(function (k) { if (val(form, 'rest-' + k)) d.split['~' + k] = val(form, 'rest-' + k); });
        var t = C.splitTotals(state, d.split);
        Object.keys(C.KINDS).forEach(function (k) { d[k] = t[k]; });
      } else {
        ['bnc', 'bic', 'cdd', 'sacem'].forEach(function (k) { d[k] = val(form, k); });
        d.split = {};
      }
      d.vatCollected = state.vatEnabled ? val(form, 'vatCollected') : 0;
      d.vatDeduct = 0; d.other = 0; d.pocket = 0;
      d.month = d.id = form.elements.month.value;
      return d;
    };
    var preview = function () {
      var d = read(); q('[data-preview]', form).textContent = money(C.calc(state, d).pocket);
      var sum = q('[data-kind-sum]', form);
      if (sum) sum.innerHTML = Object.keys(C.KINDS).filter(function (k) { return d[k]; }).map(function (k) { return '<span class="kind k-' + k + '">' + C.KINDS[k] + '</span> ' + money(d[k]); }).join('<i></i>') || 'Aucune recette';
    };
    q('[data-acts]', form).onclick = function () { var back = existing ? existing.id : null; closeSheet(); openActivities(function () { openMonth(back); }); };
    form.addEventListener('input', preview); preview();
    form.addEventListener('submit', function (e) {
      e.preventDefault();
      var d = read();
      if (!/^\d{4}-\d{2}$/.test(d.month)) { form.elements.month.focus(); return; }
      var clash = state.months.find(function (x) { return x.id === d.id && x.id !== (existing && existing.id); });
      (clash ? FOSUI.confirm(monthName(d.month) + ' existe déjà', 'La synthèse enregistrée sera remplacée.', 'Remplacer', true) : Promise.resolve(true)).then(function (ok) {
        if (!ok) return;
        state.months = state.months.filter(function (x) { return x !== clash && x !== existing; });
        state.months.push(d);
        save();
        state.dashboardMonth = state.months[0].id;
        closeSheet(); ui.animate = true; render(); toast(monthName(d.month) + ' enregistré');
      });
    });
    var del = q('[data-delete]', form);
    if (del) del.onclick = function () {
      FOSUI.confirm('Supprimer ' + monthName(m.month) + ' ?', 'Cette synthèse sera effacée.', 'Supprimer', true).then(function (ok) {
        if (!ok) return;
        state.months = state.months.filter(function (x) { return x !== existing; });
        save(); state.dashboardMonth = state.months[0] ? state.months[0].id : null;
        closeSheet(); render(); toast('Mois supprimé');
      });
    };
  });
}

/* ---------- Activités : chacune alimente une case de la déclaration ---------- */
function kindChip(k) { return '<span class="kind k-' + k + '">' + C.KINDS[k] + '</span>'; }
function revenueFields(m) {
  if (!state.activities.length) return '<div class="fields">' + field('bnc', 'CA BNC', m.bnc) + field('bic', 'CA BIC', m.bic) + field('cdd', 'Salaire / CDD', m.cdd) + field('sacem', 'Droits SACEM', m.sacem) + '</div>';
  var split = m.split || {}, known = C.splitTotals(state, Object.assign({}, split, { '~bnc': 0, '~bic': 0, '~cdd': 0, '~sacem': 0 }));
  var html = state.activities.map(function (a) { return field('act-' + a.id, esc(a.label) + kindChip(a.kind), C.num(split[a.id])); }).join('');
  /* Une somme saisie avant le détail par activité reste visible, rattachée à sa case. */
  Object.keys(C.KINDS).forEach(function (k) {
    var rest = Math.round((m[k] - known[k]) * 100) / 100;
    if (rest > 0) html += field('rest-' + k, 'Non détaillé' + kindChip(k), rest);
  });
  return '<div class="fields acts">' + html + '</div><div class="kind-sum" data-kind-sum></div>';
}
var KIND_OPTIONS = [['bnc', 'BNC'], ['bic', 'BIC'], ['cdd', 'Salaire'], ['sacem', 'SACEM']];
function activityRow(a, i) {
  a = a || { id: '', label: '', kind: 'bnc' };
  return '<div class="act-row" data-act="' + esc(a.id) + '"><input name="act-label-' + i + '" type="text" value="' + esc(a.label) + '" placeholder="Ex. DJ, tournages, renfort bar…" aria-label="Nom de l’activité">' +
    '<input type="hidden" name="act-kind-' + i + '" value="' + a.kind + '"><div class="segmented small" data-seg="act-kind-' + i + '">' +
    KIND_OPTIONS.map(function (o) { return '<button type="button" data-v="' + o[0] + '" class="' + (o[0] === a.kind ? 'on' : '') + '">' + o[1] + '</button>'; }).join('') + '</div>' +
    '<button type="button" class="act-del" data-act-del aria-label="Retirer">×</button></div>';
}
function activityEditor(list) {
  var rows = (list.length ? list : [null, null]).map(activityRow).join('');
  return '<div class="act-list" data-act-list>' + rows + '</div><button type="button" class="btn quiet act-add" data-act-add>+ Ajouter une activité</button>';
}
/* Suggestion de case d'après le nom : le type reste toujours à confirmer, un choix manuel n'est jamais écrasé. */
var KIND_HINTS = [
  ['sacem', /sacem|droits? d.?auteur|royalt/],
  ['cdd', /\bcdd\b|salari|intermitt|int[ée]rim|\bextras?\b|cdi\b|fiche de paie/],
  ['bnc', /\bdj\b|mix|platin/],
  ['bic', /vente|boutique|e-?commerce|revente|location|h[ée]bergement|g[iî]te|restaura|traiteur|\bbar\b|serveu|barman|barmaid|animation|sono|artisan|livraison|renfort/],
  ['bnc', /conseil|consult|strat[ée]g|marketing|communication|formation|coach|r[ée]daction|graphi|design|d[ée]velopp|montage|tournage|vid[ée]o|film|photo|contenu|community|social media|\bdj\b|musi|artiste|cr[ée]ation/]
];
function suggestKind(label) {
  var t = String(label).toLowerCase();
  for (var i = 0; i < KIND_HINTS.length; i++) if (KIND_HINTS[i][1].test(t)) return KIND_HINTS[i][0];
  return null;
}
function bindActivityEditor(form) {
  var box = q('[data-act-list]', form), n = box.children.length;
  box.addEventListener('click', function (e) { if (e.target.closest('[data-seg] button')) e.target.closest('.act-row').dataset.manual = '1'; });
  box.addEventListener('input', function (e) {
    var row = e.target.closest('.act-row');
    if (!row || e.target.type !== 'text' || row.dataset.manual || row.dataset.act) return;
    var k = suggestKind(e.target.value);
    if (k) { var b = row.querySelector('[data-v="' + k + '"]'); if (b && !b.classList.contains('on')) { row.querySelectorAll('[data-seg] button').forEach(function (x) { x.classList.toggle('on', x === b); }); row.querySelector('input[type=hidden]').value = k; } }
  });
  q('[data-act-add]', form).onclick = function () { box.insertAdjacentHTML('beforeend', activityRow(null, n++)); box.lastChild.querySelector('input').focus(); };
  box.addEventListener('click', function (e) { var d = e.target.closest('[data-act-del]'); if (d) d.parentElement.remove(); });
}
function readActivities(form) {
  return Array.prototype.map.call(form.querySelectorAll('.act-row'), function (row) {
    var label = row.querySelector('input[type=text]').value.trim();
    return label ? { id: row.dataset.act || C.uid(), label: label, kind: row.querySelector('input[type=hidden]').value } : null;
  }).filter(Boolean);
}
/* Enregistre la liste : une activité retirée laisse ses montants dans sa case, les totaux suivent le type choisi. */
function applyActivities(list) {
  var ids = {}; list.forEach(function (a) { ids[a.id] = a; });
  state.months.forEach(function (m) {
    if (!m.split || !Object.keys(m.split).length) return;
    state.activities.forEach(function (old) {
      if (!ids[old.id] && m.split[old.id]) { m.split['~' + old.kind] = C.num(m.split['~' + old.kind]) + m.split[old.id]; delete m.split[old.id]; }
    });
  });
  state.activities = list;
  state.months.forEach(function (m) {
    if (!m.split || !Object.keys(m.split).length) return;
    var t = C.splitTotals(state, m.split);
    Object.keys(C.KINDS).forEach(function (k) { m[k] = t[k]; });
  });
  if (list.some(function (a) { return a.kind === 'bnc'; }) && !state.bncTaxRate) state.bncTaxRate = 25.6;
  if (list.some(function (a) { return a.kind === 'bic'; }) && !state.bicTaxRate) state.bicTaxRate = 21.2;
}
function openActivities(after) {
  var body = '<p class="sheet-note">Chaque activité apparaît dans la saisie du mois et compte dans la bonne case : BNC, BIC, salaire ou SACEM.</p>' + activityEditor(state.activities);
  openSheet('Mes activités', body, '<span class="preview"></span><button class="btn" type="submit">Enregistrer</button>', function (form) {
    bindActivityEditor(form);
    form.addEventListener('submit', function (e) {
      e.preventDefault();
      applyActivities(readActivities(form));
      save(); closeSheet(); render(); toast('Activités enregistrées');
      if (after) after();
    });
  });
}

function openFixed(id) {
  var existing = state.fixed.find(function (f) { return f.id === id; });
  var f = existing || { label: '', amount: 0, category: 'Abonnement', scope: 'pro', frequency: 'monthly' };
  var opt = function (list, cur) { return list.map(function (o) { return '<option value="' + esc(o[0]) + '"' + (o[0] === cur ? ' selected' : '') + '>' + esc(o[1]) + '</option>'; }).join(''); };
  var cats = CATEGORIES.indexOf(f.category) === -1 ? CATEGORIES.concat([f.category]) : CATEGORIES;
  var body = '<div class="fields">' + field('label', 'Nom', f.label, { type: 'text', full: true, required: true, placeholder: 'Ex. Adobe' }) +
    field('amount', 'Montant', f.amount) +
    FOSUI.segField('frequency', 'Fréquence', [['monthly', 'Mensuelle'], ['annual', 'Annuelle']], f.frequency) +
    FOSUI.segField('scope', 'Type', [['pro', 'Pro'], ['perso', 'Perso']], f.scope) +
    '<div class="field full"><label>Catégorie</label><input type="hidden" name="category" value="' + esc(f.category) + '"><div class="segmented wrap" data-seg="category">' + cats.map(function (c) { return '<button type="button" data-v="' + esc(c) + '" class="' + (c === f.category ? 'on' : '') + '">' + esc(c) + '</button>'; }).join('') + '</div></div></div>';
  var foot = '<span class="preview"></span>' + (existing ? '<button type="button" class="btn danger" data-delete>Supprimer</button>' : '') + '<button class="btn" type="submit">Enregistrer</button>';
  openSheet(existing ? 'Modifier la charge' : 'Nouvelle charge', body, foot, function (form) {
    form.addEventListener('submit', function (e) {
      e.preventDefault();
      var label = form.elements.label.value.trim();
      if (!label) { form.elements.label.focus(); return; }
      var data = Object.assign({}, existing || {}, { id: existing ? existing.id : C.uid(), label: label, amount: val(form, 'amount'), category: form.elements.category.value, scope: form.elements.scope.value, frequency: form.elements.frequency.value });
      if (existing) state.fixed = state.fixed.map(function (x) { return x === existing ? data : x; }); else state.fixed.push(data);
      save(); closeSheet(); render(); toast('Charge enregistrée');
    });
    var del = q('[data-delete]', form);
    if (del) del.onclick = function () {
      FOSUI.confirm('Supprimer « ' + f.label + ' » ?', '', 'Supprimer', true).then(function (ok) {
        if (!ok) return;
        state.fixed = state.fixed.filter(function (x) { return x !== existing; });
        save(); closeSheet(); render(); toast('Charge supprimée');
      });
    };
  });
}

function openObjectives() {
  var n1Year = String(Number(currentYear()) - 1);
  var body = '<div class="fields">' + field('goal', 'Objectif annuel de CA', state.goal, { full: true }) + field('n1', 'CA réel ' + n1Year, state.n1AnnualRevenue, { full: true }) + '</div>' +
    '<p class="note" data-goal-hint style="margin-top:12px"></p>';
  openSheet('Objectif ' + currentYear(), body, '<span class="preview"></span><button class="btn" type="submit">Enregistrer</button>', function (form) {
    var hint = function () {
      var g = val(form, 'goal'), b = val(form, 'n1');
      q('[data-goal-hint]', form).textContent = g ? 'Soit ' + money0(g / 12) + ' par mois' + (b ? ' · ' + (g >= b ? '+' : '') + pct((g / b - 1) * 100, 1) + ' vs ' + n1Year : '') : '';
    };
    form.addEventListener('input', hint); hint();
    form.addEventListener('submit', function (e) {
      e.preventDefault();
      state.goal = val(form, 'goal'); state.monthlyGoal = state.goal / 12;
      state.n1AnnualRevenue = val(form, 'n1'); state.n1AnnualRevenueYear = n1Year; state.annualHistory[n1Year] = state.n1AnnualRevenue;
      save(); closeSheet(); render(); toast('Objectifs enregistrés');
    });
  });
}

function openFiscalSettings() {
  var body = '<div class="group">URSSAF</div><div class="fields">' + field('bnc', 'Taux BNC (%)', state.bncTaxRate, { keepZero: true }) + field('bic', 'Taux BIC (%)', state.bicTaxRate, { keepZero: true }) +
    field('cfp', 'CFP (%)', state.cfpRate, { keepZero: true }) + field('cci', 'CCI / CMA (%)', state.cciRate, { keepZero: true }) +
    FOSUI.segField('lag', 'Prélèvement URSSAF', [[1, '1 mois après'], [2, '2 mois après'], [3, '3 mois après']], state.urssafLagMonths, true) + '</div>' +
    '<div class="group">Seuils</div><div class="fields">' + FOSUI.segField('activity', 'Activité TVA', [['services', 'Services'], ['sales', 'Vente'], ['custom', 'Autre']], state.vatActivity, true) +
    field('vatThreshold', 'Franchise TVA (€)', state.vatThreshold) + field('microThreshold', 'Plafond micro (€)', state.microThreshold, { full: true }) + '</div>';
  openSheet('Réglages fiscaux', body, '<span class="preview"></span><button class="btn" type="submit">Enregistrer</button>', function (form) {
    form.elements.activity.addEventListener('change', function () {
      if (this.value === 'services') form.elements.vatThreshold.value = 37500;
      if (this.value === 'sales') form.elements.vatThreshold.value = 85000;
    });
    form.addEventListener('submit', function (e) {
      e.preventDefault();
      state.bncTaxRate = val(form, 'bnc'); state.bicTaxRate = val(form, 'bic'); state.cfpRate = val(form, 'cfp'); state.cciRate = val(form, 'cci');
      state.urssafLagMonths = Number(form.elements.lag.value) || 2; state.vatActivity = form.elements.activity.value;
      if (val(form, 'vatThreshold') > 0) state.vatThreshold = val(form, 'vatThreshold');
      if (val(form, 'microThreshold') > 0) state.microThreshold = val(form, 'microThreshold');
      save(); closeSheet(); render(); toast('Réglages enregistrés');
    });
  });
}

/* ---------- Raccourcis ---------- */
function renderShortcuts() {
  var box = q('#shortcuts'); if (!box) return;
  box.innerHTML = state.shortcuts.map(function (s, i) {
    return s.url ? '<a class="shortcut" href="' + esc(s.url) + '" target="_blank" rel="noopener" title="' + esc(s.label) + '">' + (s.iconImage ? '<img src="' + esc(s.iconImage) + '" alt="">' : esc(s.icon || '↗')) + '</a>'
      : '<button type="button" class="shortcut empty" data-action="shortcuts" title="Ajouter un raccourci">+</button>';
  }).join('') + '<button type="button" class="shortcut" style="border:0;background:none;color:var(--faint)" data-action="shortcuts" title="Modifier les raccourcis">' + icon('more') + '</button>';
  var svg = q('svg', box.lastChild); if (svg) { svg.style.width = '16px'; svg.style.height = '16px'; }
}
function openShortcuts() {
  var body = state.shortcuts.map(function (s, i) {
    return '<div class="group">Raccourci ' + (i + 1) + '</div><div class="fields">' + field('label' + i, 'Nom', s.url ? s.label : '', { type: 'text', placeholder: 'Ex. Bricks' }) + field('icon' + i, 'Icône', s.icon === '+' ? '' : s.icon, { type: 'text', placeholder: '↗' }) + field('url' + i, 'Lien', s.url, { type: 'text', full: true, placeholder: 'https://…' }) + '</div>';
  }).join('');
  openSheet('Raccourcis', body, '<span class="preview"></span><button class="btn" type="submit">Enregistrer</button>', function (form) {
    form.addEventListener('submit', function (e) {
      e.preventDefault();
      state.shortcuts = state.shortcuts.map(function (s, i) {
        var url = form.elements['url' + i].value.trim();
        if (url && !/^https?:\/\//i.test(url)) url = 'https://' + url;
        return { label: form.elements['label' + i].value.trim() || (url ? 'Raccourci ' + (i + 1) : 'Ajouter un lien'), url: url, icon: form.elements['icon' + i].value.trim() || (url ? '↗' : '+'), iconImage: url === s.url ? (s.iconImage || '') : '' };
      });
      save(); renderShortcuts(); closeSheet();
    });
  });
}

/* ---------- Bricks : import de l'export ---------- */
function loadScript(src) {
  return new Promise(function (resolve, reject) {
    var s = document.createElement('script'); s.src = src; s.onload = resolve;
    s.onerror = function () { reject(new Error('Impossible de charger le lecteur Excel. Vérifie ta connexion.')); };
    document.head.appendChild(s);
  });
}
function importBricks() {
  var input = document.createElement('input');
  input.type = 'file'; input.accept = '.xlsx,application/vnd.openxmlformats-officedocument.spreadsheetml.sheet';
  input.onchange = function () {
    var file = input.files[0]; if (!file) return;
    if (!/\.xlsx$/i.test(file.name)) { toast('Choisis l’export Bricks au format .xlsx'); return; }
    (window.XLSX ? Promise.resolve() : loadScript('https://cdn.jsdelivr.net/npm/xlsx@0.18.5/dist/xlsx.full.min.js')).then(function () {
      return file.arrayBuffer();
    }).then(function (buffer) {
      var wb = window.XLSX.read(buffer, { type: 'array', cellDates: true });
      var sheet = wb.SheetNames.find(function (s) { return s.toLowerCase().indexOf('transaction') !== -1; }) || wb.SheetNames[0];
      if (!sheet) throw new Error('Aucune feuille trouvée dans ce fichier.');
      var rows = window.XLSX.utils.sheet_to_json(wb.Sheets[sheet], { header: 1, defval: '', raw: false });
      state.bricks = C.parseBricksRows(rows, state.bricks, monthName);
      save(); ui.animate = true; render(); toast('Export Bricks importé');
    }).catch(function (err) { toast(err.message); });
  };
  input.click();
}

/* ---------- Actions ---------- */
var ACTIONS = {
  'new-month': function () { openMonth(null); },
  'activities': function () { openActivities(); },
  'edit-month': function (el) { openMonth(el.dataset.id); },
  'new-fixed': function () { openFixed(null); },
  'edit-fixed': function (el) { openFixed(el.dataset.id); },
  'objectives': openObjectives,
  'fiscal-settings': openFiscalSettings,
  'toggle-vat': function () { state.vatEnabled = !state.vatEnabled; save(); render(); toast(state.vatEnabled ? 'TVA activée' : 'TVA désactivée'); },
  'shortcuts': openShortcuts,
  'import-bricks': importBricks,
  'bricks-horizon': function (el) { state.bricks.projectionHorizon = Number(el.dataset.h); save(); render(); },
  'demo-off': function () { setDemo(false); },
  'pick-dashboard-month': function (el) {
    FOSUI.pickMonth(el, { value: state.dashboardMonth, today: false,
      allowed: function (k) { return state.months.some(function (m) { return m.id === k; }); },
      onPick: function (k) { state.dashboardMonth = k; ui.animate = true; render(); } });
  },
  'more': function () {
    openSheet('Plus', '<div class="more-list">' + ['fixed', 'fiscal', 'forecast', 'bricks'].map(function (id) {
      var v = VIEWS.find(function (x) { return x.id === id; });
      return '<button type="button" data-view="' + id + '" data-close>' + icon(id) + v.label + '</button>';
    }).join('') + '<button type="button" data-action="shortcuts" data-close>' + icon('more') + 'Raccourcis</button></div>');
  }
};
function setDemo(on) { state.demoMode = !!on; save(); ui.animate = true; render(); }
window.FreelanceOS = { openActivities: function () { openActivities(); }, toggleDemo: function () { setDemo(!state.demoMode); }, isDemo: function () { return !!state.demoMode; } };

document.addEventListener('change', function (e) {
  if (e.target.matches('[data-action=bricks-rate]')) {
    var v = Number(e.target.value);
    if (v >= 0 && v <= 100) { state.bricks.expectedRate = v; save(); render(); }
  }
});

/* Un autre onglet ou la synchro Drive a modifié les données : on relit. */
window.addEventListener('storage', function (e) {
  if (e.key === C.KEY) { state = C.load(localStorage); render(); }
});

mountShell();
render();
