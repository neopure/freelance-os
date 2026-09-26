/* Freelance OS · noyau : état, migrations et calculs.
   Aucune manipulation du DOM ici : tout ce qui est calculé est testable seul. */
(function (global) {
  'use strict';

  var KEY = 'neopure-finance-v1';
  var MONTH_FIELDS = ['bnc', 'bic', 'other', 'cdd', 'sacem', 'pocket', 'variable', 'personal', 'invest', 'vatCollected', 'vatDeduct', 'lastYear'];
  var DEFAULT_SHORTCUTS = [
    { label: 'URSSAF', url: 'https://www.autoentrepreneur.urssaf.fr/portail/accueil.html', icon: '↗' },
    { label: 'Indy', url: 'https://www.indy.fr/', icon: '↗' },
    { label: 'Ajouter un lien', url: '', icon: '+' }
  ];

  function num(value) { var n = Number(value); return Number.isFinite(n) ? n : 0; }
  function finite(value, fallback) { return Number.isFinite(value) ? value : fallback; }
  function monthKey(date) { date = date || new Date(); return date.getFullYear() + '-' + String(date.getMonth() + 1).padStart(2, '0'); }
  function emptyMonth(id) {
    var m = { id: id, month: id };
    MONTH_FIELDS.forEach(function (k) { m[k] = 0; });
    return m;
  }

  /* Remet toute sauvegarde, même ancienne ou partielle, dans la forme attendue.
     Les champs inconnus sont conservés pour ne rien perdre. */
  function normalize(raw) {
    var s = raw && typeof raw === 'object' ? raw : {};
    s.goal = finite(s.goal, 0);
    s.monthlyGoal = finite(s.monthlyGoal, Math.round(s.goal / 12));
    s.growthTarget = finite(s.growthTarget, 10);
    s.n1AnnualRevenue = finite(s.n1AnnualRevenue, 0);
    s.annualHistory = s.annualHistory && typeof s.annualHistory === 'object' ? s.annualHistory : {};
    s.vatThreshold = finite(s.vatThreshold, 37500);
    s.vatActivity = s.vatActivity || 'services';
    s.vatEnabled = typeof s.vatEnabled === 'boolean' ? s.vatEnabled : false;
    s.microThreshold = finite(s.microThreshold, 83600);
    s.bncTaxRate = finite(s.bncTaxRate, 0);
    s.bicTaxRate = finite(s.bicTaxRate, 0);
    s.cfpRate = finite(s.cfpRate, 0.1);
    s.cciRate = finite(s.cciRate, 0.04);
    s.urssafLagMonths = finite(s.urssafLagMonths, 2);
    s.fixed = (Array.isArray(s.fixed) ? s.fixed : []).map(function (f) {
      return Object.assign({}, f, { id: f.id || uid(), label: f.label || 'Charge', amount: num(f.amount), category: f.category || 'Autre charge fixe', scope: f.scope || 'pro', frequency: f.frequency || 'monthly' });
    });
    var months = Array.isArray(s.months) ? s.months : [];
    s.months = months.filter(function (m) { return m && /^\d{4}-\d{2}$/.test(m.month || m.id); }).map(function (m) {
      var out = Object.assign({}, m);
      out.month = m.month || m.id;
      out.id = out.month;
      MONTH_FIELDS.forEach(function (k) { out[k] = num(m[k]); });
      return out;
    });
    /* Ancienne saisie : « autres recettes » a été fusionné dans le CDD. */
    if (!s.cddRevenueMigrated) {
      s.months.forEach(function (m) { m.cdd += m.other; m.other = 0; });
      s.cddRevenueMigrated = true;
    }
    /* Un même mois saisi deux fois : on garde la dernière saisie. */
    var seen = {};
    s.months = s.months.filter(function (m) { if (seen[m.id]) return false; seen[m.id] = true; return true; });
    sortMonths(s);
    if (!Array.isArray(s.shortcuts) || s.shortcuts.length !== 3) s.shortcuts = DEFAULT_SHORTCUTS.map(function (x) { return Object.assign({}, x); });
    if (s.bricks && typeof s.bricks === 'object') {
      s.bricks.projects = Array.isArray(s.bricks.projects) ? s.bricks.projects : [];
      s.bricks.expectedRate = finite(Number(s.bricks.expectedRate), 8.5);
    }
    return s;
  }
  function sortMonths(s) { s.months.sort(function (a, b) { return b.month.localeCompare(a.month); }); }
  function uid() { return global.crypto && crypto.randomUUID ? crypto.randomUUID() : Date.now() + '-' + Math.random().toString(16).slice(2); }

  function load(storage) {
    var raw = null;
    try { raw = JSON.parse(storage.getItem(KEY) || 'null'); } catch (_) { raw = null; }
    return normalize(raw);
  }
  function persist(storage, state) {
    try { storage.setItem(KEY, JSON.stringify(state)); return true; } catch (_) { return false; }
  }

  /* ---------- Calculs ---------- */
  function monthlyAmount(item) { return item.frequency === 'annual' ? num(item.amount) / 12 : num(item.amount); }
  function fixedTotal(state, scope) {
    return state.fixed.reduce(function (sum, f) { return !scope || f.scope === scope ? sum + monthlyAmount(f) : sum; }, 0);
  }
  /* Même calcul que l'app d'origine : cotisations arrondies à l'euro, ligne par ligne. */
  function calc(state, m) {
    var micro = m.bnc + m.bic;
    var bncContribution = Math.round(m.bnc * state.bncTaxRate / 100);
    var bicContribution = Math.round(m.bic * state.bicTaxRate / 100);
    var cfpContribution = Math.round(micro * state.cfpRate / 100);
    var cciContribution = Math.round(micro * state.cciRate / 100);
    var urssaf = bncContribution + bicContribution + cfpContribution + cciContribution;
    var revenue = m.bnc + m.bic + m.other + m.cdd + m.sacem;
    var expenses = fixedTotal(state, 'pro') + m.variable + m.invest;
    var personal = fixedTotal(state, 'perso') + m.personal;
    var vat = m.vatCollected - m.vatDeduct;
    var net = revenue - expenses - vat - urssaf;
    return {
      revenue: revenue, micro: micro, expenses: expenses, personal: personal, vat: vat,
      bncContribution: bncContribution, bicContribution: bicContribution, cfpContribution: cfpContribution, cciContribution: cciContribution,
      urssaf: urssaf, net: net, pocket: net - personal
    };
  }
  function monthsOfYear(state, year) { return state.months.filter(function (m) { return m.month.slice(0, 4) === String(year); }); }
  function years(state) {
    var list = [];
    state.months.forEach(function (m) { var y = m.month.slice(0, 4); if (list.indexOf(y) === -1) list.push(y); });
    return list.length ? list : [String(new Date().getFullYear())];
  }
  function sum(list, fn) { return list.reduce(function (total, item) { return total + fn(item); }, 0); }

  function yearSummary(state, year) {
    var list = monthsOfYear(state, year);
    var c = list.map(function (m) { return calc(state, m); });
    var count = list.length;
    var revenue = sum(c, function (x) { return x.revenue; });
    return {
      year: String(year), months: list, count: count,
      revenue: revenue,
      micro: sum(list, function (m) { return m.bnc + m.bic; }),
      cdd: sum(list, function (m) { return m.cdd; }),
      sacem: sum(list, function (m) { return m.sacem; }),
      other: sum(list, function (m) { return m.other; }),
      expenses: sum(c, function (x) { return x.expenses; }),
      personal: sum(c, function (x) { return x.personal; }),
      vat: sum(c, function (x) { return x.vat; }),
      urssaf: sum(c, function (x) { return x.urssaf; }),
      net: sum(c, function (x) { return x.net; }),
      pocket: sum(c, function (x) { return x.pocket; }),
      average: count ? revenue / count : 0,
      best: list.reduce(function (best, m) { var r = calc(state, m).revenue; return !best || r > best.revenue ? { month: m.month, revenue: r } : best; }, null)
    };
  }

  /* Seuil annuel (franchise TVA ou sortie du régime micro) : cumul de l'année civile seulement. */
  function threshold(state, year, limit) {
    var y = yearSummary(state, year);
    var remaining = Math.max(0, limit - y.micro);
    var percent = limit ? y.micro / limit * 100 : 0;
    var avg = y.count ? y.micro / y.count : 0;
    var crossing = null, crossed = remaining === 0 && y.micro > 0, thisYear = false;
    if (!crossed && avg > 0 && y.months.length) {
      var last = y.months[0].month;
      var monthsUntil = Math.ceil(remaining / avg);
      var d = new Date(Number(last.slice(0, 4)), Number(last.slice(5, 7)) - 1 + monthsUntil, 1);
      crossing = monthKey(d);
      thisYear = crossing.slice(0, 4) === String(year);
    }
    return { limit: limit, micro: y.micro, remaining: remaining, percent: percent, crossed: crossed, crossing: crossing, crossingThisYear: thisYear };
  }

  /* Prochain prélèvement URSSAF : le 1er du mois suivant, calculé sur le CA d'il y a « décalage » mois. */
  function urssafUpcoming(state, now) {
    now = now || new Date();
    var paymentDate = new Date(now.getFullYear(), now.getMonth() + 1, 1);
    var period = monthKey(new Date(paymentDate.getFullYear(), paymentDate.getMonth() - state.urssafLagMonths, 1));
    var item = state.months.find(function (m) { return m.month === period; }) || null;
    var details = item ? calc(state, item) : null;
    var today = new Date(now.getFullYear(), now.getMonth(), now.getDate());
    var days = Math.round((paymentDate - today) / 86400000);
    return { paymentDate: paymentDate, paymentMonth: monthKey(paymentDate), period: period, item: item, details: details, total: details ? details.urssaf : 0, days: days, msLeft: Math.max(0, paymentDate - now) };
  }

  function forecast(state, year) {
    var y = yearSummary(state, year);
    var remainingMonths = Math.max(0, 12 - y.count);
    var projection = y.revenue + y.average * remainingMonths;
    var avg = function (v) { return y.count ? v / y.count : 0; };
    var projectedExpenses = avg(y.expenses) * 12;
    var projectedVat = avg(y.vat) * 12;
    var projectedUrssaf = avg(y.urssaf) * 12;
    var growthBase = state.n1AnnualRevenue || 0;
    var growthTargetAmount = growthBase * (1 + state.growthTarget / 100);
    return {
      summary: y, remainingMonths: remainingMonths, projection: projection,
      goalPercent: state.goal ? projection / state.goal * 100 : 0,
      goalProgress: state.goal ? y.revenue / state.goal * 100 : 0,
      projectedExpenses: projectedExpenses, projectedVat: projectedVat, projectedUrssaf: projectedUrssaf,
      projectedNet: projection - projectedExpenses - projectedVat - projectedUrssaf,
      growthBase: growthBase, growthTargetAmount: growthTargetAmount,
      growthRequired: remainingMonths && growthBase ? Math.max(0, growthTargetAmount - y.revenue) / remainingMonths : 0,
      goalRequired: remainingMonths && state.goal ? Math.max(0, state.goal - y.revenue) / remainingMonths : 0
    };
  }

  /* ---------- Bricks ---------- */
  function bricksMetrics(b) {
    if (!b) return null;
    var invested = num(b.invested), repaid = num(b.repaid);
    var capital = b.importedFromXlsx ? Math.max(0, invested - repaid) : (b.currentCapital != null ? num(b.currentCapital) : Math.max(0, invested - repaid));
    var monthly = b.monthlyInvestments || {};
    var activeMonths = b.importedFromXlsx ? Object.keys(monthly).length : 0;
    var historyMonths = Math.max(1, activeMonths || num(b.historyMonths) || (b.history ? b.history.length : 0) || 14);
    var projects = (b.projects || []).filter(function (p) { return num(p.invested) - num(p.repaid) > 0; });
    var history = Object.keys(monthly).sort().map(function (k) { return { month: k, value: num(monthly[k]) }; });
    if (!history.length && Array.isArray(b.history)) history = b.history.map(function (h) { return { month: h[0], value: num(h[1]) }; });
    return {
      capital: capital, wallet: num(b.wallet), portfolio: capital + num(b.wallet),
      average: invested / historyMonths, historyMonths: historyMonths,
      lastInvestment: num(b.lastInvestment != null ? b.lastInvestment : (b.history && b.history.length ? b.history[b.history.length - 1][1] : 0)),
      lastIncome: num(b.lastIncome != null ? b.lastIncome : (b.history && b.history.length ? b.history[b.history.length - 1][2] : 0)),
      lastPeriod: b.lastPeriod || '', repaid: repaid, invested: invested,
      income: num(b.income) - num(b.withholding),
      activeProjects: b.activeProjectCount != null && !b.importedFromXlsx ? num(b.activeProjectCount) : projects.length,
      bricksCount: b.importedFromXlsx ? null : (b.currentBricks || null),
      projects: projects.sort(function (a, c) { return (num(c.invested) - num(c.repaid)) - (num(a.invested) - num(a.repaid)); }),
      rate: num(b.expectedRate || 8.5) / 100,
      history: history.slice(-12),
      updated: b.updated || ''
    };
  }
  function bricksProjection(metrics, years) {
    var capital = metrics.capital + metrics.average * 12 * years;
    return { capital: capital, monthlyInterest: capital * metrics.rate / 12 };
  }
  function bricksNumber(value) { return Number(String(value == null ? '' : value).replace(/\s/g, '').replace(',', '.').replace(/[^0-9.\-]/g, '')) || 0; }
  function bricksMonthKey(value) {
    var text = String(value == null ? '' : value).trim();
    var parts = text.match(/(\d{1,2})[\/-](\d{1,2})[\/-](\d{4})/);
    if (parts) return parts[3] + '-' + String(parts[2]).padStart(2, '0');
    var parsed = new Date(text);
    return isNaN(parsed.getTime()) ? '' : monthKey(parsed);
  }
  /* Lecture de l'export « transactions » de Bricks, identique à la version d'origine. */
  function parseBricksRows(sheetRows, previous, labelMonth) {
    var rows = sheetRows.filter(function (row) { return Array.isArray(row) && row.some(function (v) { return String(v == null ? '' : v).trim() !== ''; }); });
    if (rows.length < 2) throw new Error('Le fichier Bricks ne contient pas assez de transactions.');
    var norm = function (v) { return String(v == null ? '' : v).normalize('NFD').replace(/[̀-ͯ]/g, '').toLowerCase().trim(); };
    var headers = rows.shift().map(norm);
    var idx = function (n) { return headers.findIndex(function (h) { return h.indexOf(n) !== -1; }); };
    var typeI = idx('type'), amountI = idx('montant'), propI = idx('propriet'), dateI = idx('date'), statusI = idx('statut');
    if (typeI < 0 || amountI < 0) throw new Error('Colonnes « type » et « montant (€) » introuvables dans cet export Bricks.');
    previous = previous || {};
    var inv = {}, inc = {}, wh = {}, projects = {};
    var r = { wallet: 0, deposits: 0, invested: 0, repaid: 0, income: 0, withholding: 0, updated: new Date().toLocaleDateString('fr-FR', { day: '2-digit', month: 'long', year: 'numeric' }), monthlyInvestment: previous.monthlyInvestment || 650, expectedRate: previous.expectedRate || 8.5, projectionHorizon: previous.projectionHorizon || 1, projects: [], importedFromXlsx: true };
    var project = function (name) { if (!projects[name]) projects[name] = { name: name, invested: 0, repaid: 0, income: 0 }; return projects[name]; };
    rows.forEach(function (v) {
      var status = statusI >= 0 ? norm(v[statusI]) : '';
      if (status && status.indexOf('validee') === -1) return;
      var type = norm(v[typeI]), amount = bricksNumber(v[amountI]), name = String(v[propI] == null ? '' : v[propI]).trim(), month = bricksMonthKey(v[dateI]);
      r.wallet += amount;
      if (type.indexOf('achat de brick') !== -1) {
        var a = Math.abs(amount); r.invested += a;
        if (month) inv[month] = (inv[month] || 0) + a;
        if (name) project(name).invested += a;
      } else if (type.indexOf('remboursement de capital') !== -1) {
        var rp = Math.abs(amount); r.repaid += rp;
        if (name) project(name).repaid += rp;
      } else if (type.indexOf('revenus revers') !== -1 || type.indexOf('solde boost') !== -1) {
        var i = Math.abs(amount); r.income += i;
        if (month) inc[month] = (inc[month] || 0) + i;
        if (name) project(name).income += i;
      } else if (type.indexOf('prelevement a la source') !== -1) {
        var w = Math.abs(amount); r.withholding += w;
        if (month) wh[month] = (wh[month] || 0) + w;
      } else if (type.indexOf('credit par carte') !== -1 || type.indexOf('credit par virement') !== -1) r.deposits += Math.abs(amount);
    });
    var lastInv = Object.keys(inv).sort().pop() || '', lastInc = Object.keys(inc).sort().pop() || '';
    var period = lastInv || lastInc;
    r.lastInvestment = lastInv ? inv[lastInv] : 0;
    r.lastIncome = lastInc ? (inc[lastInc] || 0) - (wh[lastInc] || 0) : 0;
    r.lastPeriod = period ? (labelMonth ? labelMonth(period) : period) : 'Export importé';
    r.historyMonths = Math.max(1, Object.keys(inv).length);
    r.monthlyInvestments = inv; r.monthlyIncomes = inc; r.monthlyWithholdings = wh;
    r.projects = Object.keys(projects).map(function (k) { return projects[k]; });
    return r;
  }

  var api = {
    KEY: KEY, MONTH_FIELDS: MONTH_FIELDS, num: num, uid: uid, monthKey: monthKey, emptyMonth: emptyMonth,
    normalize: normalize, sortMonths: sortMonths, load: load, persist: persist,
    monthlyAmount: monthlyAmount, fixedTotal: fixedTotal, calc: calc, monthsOfYear: monthsOfYear, years: years,
    yearSummary: yearSummary, threshold: threshold, urssafUpcoming: urssafUpcoming, forecast: forecast,
    bricksMetrics: bricksMetrics, bricksProjection: bricksProjection, parseBricksRows: parseBricksRows
  };
  if (typeof module !== 'undefined' && module.exports) module.exports = api;
  global.FOSCore = api;
}(typeof window !== 'undefined' ? window : globalThis));
