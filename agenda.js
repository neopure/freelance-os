/* Freelance OS · agenda des prestations à venir.
   Même format de données que l'ancien module : rien n'est à ressaisir. */
(function () {
  'use strict';

  var KEY = 'freelance-os-agenda-previsions-v1';
  var GOOGLE_CLIENT_ID = '484675980833-78aqn94e5nu13de8gg2slatt7id2rhbj.apps.googleusercontent.com';
  /* L'agenda peut appartenir à un autre compte Gmail que celui de connexion : on demande l'adresse pour l'afficher. */
  var GOOGLE_SCOPE = 'openid email https://www.googleapis.com/auth/calendar.readonly';
  var C = window.FOSCore;
  var token = null, gisPromise = null;

  function monthKey(d) { return C.monthKey(d); }
  function load() {
    var saved = null;
    try { saved = JSON.parse(localStorage.getItem(KEY)); } catch (_) {}
    saved = saved || {};
    return {
      activeMonth: saved.activeMonth || monthKey(),
      forecastGoal: Number(saved.forecastGoal) || 0,
      rules: Array.isArray(saved.rules) ? saved.rules : [],
      events: Array.isArray(saved.events) ? saved.events : [],
      google: Object.assign({ status: 'idle', lastSyncedAt: '', lastCount: 0, error: '', email: '' }, saved.google || {})
    };
  }
  var data = load();
  function save() { try { localStorage.setItem(KEY, JSON.stringify(data)); } catch (_) {} }
  function rerender() { if (typeof render === 'function') render(); }
  function esc(v) { return String(v == null ? '' : v).replace(/[&<>"']/g, function (c) { return { '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[c]; }); }
  function uid() { return C.uid(); }

  function months() {
    var out = [], start = new Date(); start.setDate(1); start.setMonth(start.getMonth() - 3);
    for (var i = 0; i < 24; i++) { var d = new Date(start); d.setMonth(start.getMonth() + i); out.push(monthKey(d)); }
    if (out.indexOf(data.activeMonth) === -1) out.push(data.activeMonth);
    return out.sort();
  }
  function eventsOf(key) { return data.events.filter(function (e) { return String(e.date || '').slice(0, 7) === key; }).sort(function (a, b) { return a.date.localeCompare(b.date); }); }
  function totalOf(key) { return eventsOf(key).reduce(function (s, e) { return s + (Number(e.amount) || 0); }, 0); }
  function goal() { return Number(data.forecastGoal) || Number(window.state && state.monthlyGoal) || 0; }
  function ruleAmount(title) {
    var t = String(title || '').toLocaleLowerCase('fr-FR');
    var rule = data.rules.find(function (r) { var k = String(r.keyword || '').trim().toLocaleLowerCase('fr-FR'); return k && t.indexOf(k) !== -1; });
    return rule ? Number(rule.amount) || 0 : 0;
  }
  function applyRules() {
    data.events = data.events.map(function (e) {
      if (e.source !== 'google' || e.amountMode === 'manual') return e;
      return Object.assign({}, e, { amount: ruleAmount(e.title), amountMode: 'rule' });
    });
  }

  function view() {
    var key = data.activeMonth, list = eventsOf(key), total = totalOf(key), g = goal();
    var chartKeys = months().filter(function (k) { return k >= key; }).slice(0, 6);
    var avg = list.length ? total / list.length : 0;
    var status = data.google.status === 'syncing' ? 'Synchronisation…' : data.google.error ? esc(data.google.error)
      : data.google.lastSyncedAt ? (data.google.email ? esc(data.google.email) + '<br>' : '') + data.google.lastCount + ' date' + (data.google.lastCount > 1 ? 's' : '') + ' · ' + new Date(data.google.lastSyncedAt).toLocaleString('fr-FR', { dateStyle: 'medium', timeStyle: 'short' }) : 'Non connecté';
    return '<div class="split stagger"><div class="stack">' +
      '<div class="card"><div style="display:flex;gap:8px"><button type="button" class="month-select" data-agenda-act="month" style="flex:1">' + esc(monthName(key)) + '<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round"><path d="m6 9 6 6 6-6"/></svg></button>' +
        '<button class="btn" data-agenda-act="new" data-demo-lock>' + icon('plus') + '<span>Ajouter</span></button></div></div>' +
      '<div class="grid-3">' +
        kpi('Prévu · ' + monthOnly(key), n(total), list.length + ' date' + (list.length > 1 ? 's' : '') + (list.length ? ' · moy. ' + money0(avg) : '')) +
        kpi(data.forecastGoal ? 'Objectif du mois' : '◎ Moyenne visée', g ? n(g) : '—', g ? (total >= g ? 'Atteint' : 'Reste ' + money(g - total)) : '', data.forecastGoal ? '' : 'goal') +
        kpi('6 prochains mois', n(chartKeys.reduce(function (s, k) { return s + totalOf(k); }, 0)), '') +
      '</div>' +
      '<div class="card"><div class="card-head"><h3>Prévisions</h3></div>' + barChart(chartKeys.map(function (k) { return { label: monthShort(k), value: totalOf(k), tip: monthName(k) + ' · ' + money(totalOf(k)), onclick: 'data-agenda-act="pick" data-key="' + k + '"' }; }), g, { noLow: true }) + '</div>' +
      '<div class="card"><div class="card-head"><h3>' + esc(monthName(key)) + '</h3></div>' +
        (list.length ? '<div class="events">' + list.map(function (e) {
          var d = new Date(e.date + 'T12:00:00').toLocaleDateString('fr-FR', { day: 'numeric', month: 'short' });
          return '<div class="event" data-agenda-act="edit" data-id="' + esc(e.id) + '" data-demo-lock><span class="d">' + esc(d) + '</span><span class="t">' + esc(e.title) + (e.source === 'google' ? '<small>Google Agenda</small>' : '') + '</span><span class="a">' + money(Number(e.amount) || 0) + '</span></div>';
        }).join('') + '</div>' : '<p class="note" style="margin:0">Aucune date ce mois-ci.</p>') + '</div>' +
      '</div><div class="stack">' +
      '<div class="card"><div class="card-head"><h3>Google Agenda</h3></div><p class="gcal-status' + (data.google.error ? ' error' : '') + '">' + status + '</p>' +
        '<div style="display:flex;gap:8px;flex-wrap:wrap"><button class="btn quiet" data-agenda-act="sync" data-demo-lock>' + (data.google.lastSyncedAt ? 'Synchroniser' : 'Connecter') + '</button>' +
        (data.google.lastSyncedAt ? '<button class="btn quiet" data-agenda-act="reset" data-demo-lock>Réimporter</button><button class="btn quiet" data-agenda-act="switch" data-demo-lock>Changer de compte</button>' : '') + '</div></div>' +
      '<div class="card"><div class="card-head"><h3>Montants par mot-clé</h3><button class="btn quiet" data-agenda-act="add-rule" data-demo-lock>' + icon('plus') + '</button></div>' +
        (data.rules.length ? data.rules.map(function (r) {
          return '<div class="rule"><input value="' + esc(r.keyword) + '" data-rule="' + esc(r.id) + '" data-k="keyword" placeholder="mariage" aria-label="Mot-clé"><input type="number" min="0" step="1" value="' + (Number(r.amount) || '') + '" data-rule="' + esc(r.id) + '" data-k="amount" placeholder="0 €" aria-label="Montant"><button class="icon-btn" data-agenda-act="del-rule" data-id="' + esc(r.id) + '" aria-label="Supprimer">' + icon('trash') + '</button></div>';
        }).join('') : '<p class="note" style="margin:0 0 4px">Ex. « mariage » → 900 €</p>') +
        '<div class="field" style="margin-top:14px"><label for="agenda-goal">Objectif mensuel de l’agenda</label><input id="agenda-goal" type="number" min="0" step="50" data-agenda="goal" value="' + (data.forecastGoal || '') + '" placeholder="' + (window.state && state.monthlyGoal ? Math.round(state.monthlyGoal) : 0) + '"></div></div>' +
      '</div></div>';
  }

  function openEvent(existing) {
    var e = existing || { date: data.activeMonth + '-01', title: '', amount: '' };
    var body = '<div class="fields">' +
      '<div class="field full"><label for="ev-title">Prestation</label><input id="ev-title" name="title" type="text" value="' + esc(e.title) + '" placeholder="Mariage, DJ set…" required></div>' +
      FOSUI.dateField('date', 'Date', e.date) +
      '<div class="field"><label for="ev-amount">Montant</label><input id="ev-amount" name="amount" type="number" inputmode="decimal" min="0" step="0.01" value="' + esc(e.amount || '') + '" placeholder="0"></div></div>';
    var foot = '<span class="preview"></span>' + (existing ? '<button type="button" class="btn danger" data-delete>Supprimer</button>' : '') + '<button class="btn" type="submit">Enregistrer</button>';
    openSheet(existing ? 'Modifier la date' : 'Nouvelle date', body, foot, function (form) {
      form.elements.title.addEventListener('input', function () {
        if (existing || form.elements.amount.value) return;
        var a = ruleAmount(form.elements.title.value); if (a) form.elements.amount.value = a;
      });
      form.addEventListener('submit', function (ev) {
        ev.preventDefault();
        var title = form.elements.title.value.trim(), date = form.elements.date.value;
        if (!title) { form.elements.title.focus(); return; }
        if (!date) { form.elements.date.focus(); return; }
        var next = Object.assign({}, existing || {}, { id: existing ? existing.id : uid(), source: existing ? existing.source || 'manual' : 'manual', date: date, title: title, amount: Number(form.elements.amount.value) || 0, amountMode: 'manual' });
        if (existing) data.events = data.events.map(function (x) { return x.id === existing.id ? next : x; }); else data.events.push(next);
        data.activeMonth = date.slice(0, 7);
        save(); closeSheet(); rerender(); toast('Date enregistrée');
      });
      var del = form.querySelector('[data-delete]');
      if (del) del.onclick = function () {
        data.events = data.events.filter(function (x) { return x.id !== existing.id; });
        save(); closeSheet(); rerender(); toast('Date supprimée');
      };
    });
  }

  /* ---------- Google Agenda ---------- */
  function loadGis() {
    if (window.google && google.accounts && google.accounts.oauth2) return Promise.resolve();
    if (gisPromise) return gisPromise;
    gisPromise = new Promise(function (resolve, reject) {
      var s = document.createElement('script'); s.src = 'https://accounts.google.com/gsi/client'; s.async = true; s.onload = resolve;
      s.onerror = function () { gisPromise = null; reject(new Error('Impossible de charger la connexion Google.')); };
      document.head.appendChild(s);
    });
    return gisPromise;
  }
  function windowKeys() {
    var start = new Date(); start.setDate(1); start.setHours(0, 0, 0, 0);
    var end = new Date(start); end.setMonth(end.getMonth() + 15);
    return { start: start, end: end, startKey: monthKey(start), endKey: monthKey(end) };
  }
  function sync() {
    var w = windowKeys();
    var base = { timeMin: w.start.toISOString(), timeMax: w.end.toISOString(), singleEvents: 'true', orderBy: 'startTime', maxResults: '2500' };
    var items = [];
    var page = function (pageToken) {
      var p = new URLSearchParams(base); if (pageToken) p.set('pageToken', pageToken);
      return fetch('https://www.googleapis.com/calendar/v3/calendars/primary/events?' + p, { headers: { Authorization: 'Bearer ' + token } }).then(function (r) {
        if (!r.ok) throw new Error('Google Agenda n’a pas pu fournir les rendez-vous. Réessaie.');
        return r.json();
      }).then(function (payload) {
        items = items.concat(payload.items || []);
        return payload.nextPageToken ? page(payload.nextPageToken) : null;
      });
    };
    return page().then(function () {
      var sig = function (e) { return (e.date || '') + '|' + String(e.title || '').trim().toLocaleLowerCase('fr-FR'); };
      var byId = {}, legacy = {};
      data.events.forEach(function (e) { if (e.source === 'google' && e.googleEventId) byId[e.googleEventId] = e; if (e.source !== 'manual') legacy[sig(e)] = e; });
      var fetched = items.map(function (it) {
        var date = String((it.start && (it.start.date || it.start.dateTime)) || '').slice(0, 10);
        if (!date) return null;
        var title = it.summary || 'Évènement sans titre';
        var old = byId[it.id] || legacy[date + '|' + title.trim().toLocaleLowerCase('fr-FR')];
        return Object.assign({}, old || {}, { id: old ? old.id : 'google-' + it.id, source: 'google', googleEventId: it.id, date: date, title: title, amount: old && old.amountMode === 'manual' ? old.amount : ruleAmount(title), amountMode: old ? old.amountMode || 'rule' : 'rule' });
      }).filter(Boolean);
      /* Dans la fenêtre synchronisée, Google fait foi ; les dates ajoutées à la main restent. */
      data.events = data.events.filter(function (e) { var k = String(e.date || '').slice(0, 7); return e.source === 'manual' || k < w.startKey || k >= w.endKey; }).concat(fetched);
      data.google = { status: 'connected', lastSyncedAt: new Date().toISOString(), lastCount: fetched.length, error: '' };
      save();
    });
  }
  function connect(chooseAccount) {
    if (location.protocol === 'file:') { data.google.error = 'Ouvre l’app en ligne pour connecter Google Agenda.'; save(); rerender(); return; }
    data.google = Object.assign({}, data.google, { status: 'syncing', error: '' }); rerender();
    loadGis().then(function () {
      var first = chooseAccount || !data.google.email;
      var client = google.accounts.oauth2.initTokenClient({
        client_id: GOOGLE_CLIENT_ID, scope: GOOGLE_SCOPE, hint: first ? undefined : data.google.email,
        callback: function (res) {
          if (!res || res.error) { data.google = Object.assign({}, data.google, { status: 'idle', error: 'Autorisation Google refusée.' }); save(); rerender(); return; }
          token = res.access_token;
          fetch('https://www.googleapis.com/oauth2/v3/userinfo', { headers: { Authorization: 'Bearer ' + token } }).then(function (r) { return r.ok ? r.json() : {}; }).catch(function () { return {}; }).then(function (user) {
            if (chooseAccount && user.email && user.email !== data.google.email) {
              /* Autre agenda : les dates importées de l'ancien compte ne s'appliquent plus. */
              data.events = data.events.filter(function (x) { return x.source === 'manual'; });
            }
            data.google.email = user.email || data.google.email;
            return sync();
          }).catch(function (err) { data.google = Object.assign({}, data.google, { status: 'idle', error: err.message }); save(); }).then(function () { rerender(); toast('Agenda synchronisé'); });
        },
        error_callback: function () { data.google = Object.assign({}, data.google, { status: 'idle', error: 'La fenêtre Google n’a pas pu s’ouvrir.' }); rerender(); }
      });
      client.requestAccessToken({ prompt: first ? 'select_account consent' : '' });
    }).catch(function (err) { data.google = Object.assign({}, data.google, { status: 'idle', error: err.message }); rerender(); });
  }
  function reset() {
    var w = windowKeys();
    var removable = data.events.filter(function (e) { var k = String(e.date || '').slice(0, 7); return e.source !== 'manual' && k >= w.startKey && k < w.endKey; });
    (removable.length ? FOSUI.confirm('Réimporter Google Agenda ?', removable.length + ' date(s) seront remplacées par la version actuelle. Tes dates ajoutées à la main restent.', 'Réimporter') : Promise.resolve(true)).then(function (ok) {
    if (!ok) return;
    data.events = data.events.filter(function (e) { return removable.indexOf(e) === -1; });
    data.google = Object.assign({}, data.google, { lastSyncedAt: '', lastCount: 0, error: '' });
    save(); connect();
    });
  }

  /* ---------- Évènements ---------- */
  document.addEventListener('click', function (e) {
    var el = e.target.closest('[data-agenda-act]'); if (!el) return;
    var act = el.dataset.agendaAct;
    if (act === 'new') openEvent(null);
    else if (act === 'edit') openEvent(data.events.find(function (x) { return x.id === el.dataset.id; }));
    else if (act === 'month') FOSUI.pickMonth(el, { value: data.activeMonth, allowed: function (k) { return months().indexOf(k) !== -1; }, onPick: function (k) { data.activeMonth = k; save(); rerender(); } });
    else if (act === 'pick') { data.activeMonth = el.dataset.key; save(); rerender(); }
    else if (act === 'sync') connect();
    else if (act === 'reset') reset();
    else if (act === 'switch') connect(true);
    else if (act === 'add-rule') { data.rules.push({ id: uid(), keyword: '', amount: 0 }); save(); rerender(); var last = document.querySelector('.rule:last-of-type input'); if (last) last.focus(); }
    else if (act === 'del-rule') { data.rules = data.rules.filter(function (r) { return r.id !== el.dataset.id; }); applyRules(); save(); rerender(); }
  });
  document.addEventListener('change', function (e) {
    var t = e.target;
    if (t.dataset.agenda === 'month') { data.activeMonth = t.value; save(); rerender(); }
    else if (t.dataset.agenda === 'goal') { data.forecastGoal = Number(t.value) || 0; save(); rerender(); }
    else if (t.dataset.rule) {
      var r = data.rules.find(function (x) { return x.id === t.dataset.rule; }); if (!r) return;
      r[t.dataset.k] = t.dataset.k === 'amount' ? Number(t.value) || 0 : t.value.trim();
      applyRules(); save(); rerender();
    }
  });
  window.addEventListener('storage', function (e) { if (e.key === KEY) data = load(); });

  window.FOSAgenda = { view: view };
}());
