(() => {
  'use strict';

  const STORAGE_KEY = 'freelance-os-agenda-previsions-v1';
  const GOOGLE_CLIENT_ID = '484675980833-78aqn94e5nu13de8gg2slatt7id2rhbj.apps.googleusercontent.com';
  const GOOGLE_SCOPE = 'https://www.googleapis.com/auth/calendar.readonly';
  const money = new Intl.NumberFormat('fr-FR', { style: 'currency', currency: 'EUR' });
  const uid = () => (window.crypto && crypto.randomUUID ? crypto.randomUUID() : `${Date.now()}-${Math.random().toString(16).slice(2)}`);
  const monthKey = (date = new Date()) => `${date.getFullYear()}-${String(date.getMonth() + 1).padStart(2, '0')}`;
  const esc = (value) => String(value ?? '').replace(/[&<>'"]/g, (character) => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', "'": '&#39;', '"': '&quot;' })[character]);

  const defaults = {
    activeMonth: monthKey(),
    forecastGoal: 0,
    rules: [],
    events: [],
    google: { status: 'idle', lastSyncedAt: '', lastCount: 0, error: '' }
  };

  let data = load();
  let dashboardListenerTarget = null;
  let googleScriptPromise = null;
  let googleTokenClient = null;
  let googleAccessToken = null;

  function load() {
    try {
      const saved = JSON.parse(localStorage.getItem(STORAGE_KEY));
      return { ...defaults, ...(saved || {}), rules: saved?.rules || defaults.rules, events: saved?.events || [], google: { ...defaults.google, ...(saved?.google || {}) } };
    } catch (_) {
      return { ...defaults, rules: [...defaults.rules], events: [] };
    }
  }

  function save() {
    localStorage.setItem(STORAGE_KEY, JSON.stringify(data));
  }

  function availableMonths() {
    const output = [];
    const start = new Date();
    start.setDate(1);
    start.setMonth(start.getMonth() - 3);
    for (let index = 0; index < 24; index += 1) {
      const date = new Date(start);
      date.setMonth(start.getMonth() + index);
      output.push({ key: monthKey(date), label: date.toLocaleDateString('fr-FR', { month: 'long', year: 'numeric' }) });
    }
    return output;
  }

  function labelMonth(key) {
    const [year, month] = String(key).split('-').map(Number);
    return new Date(year, month - 1, 1).toLocaleDateString('fr-FR', { month: 'long', year: 'numeric' });
  }

  function eventsForMonth(key) {
    return data.events
      .filter((event) => event.date?.slice(0, 7) === key)
      .sort((a, b) => a.date.localeCompare(b.date));
  }

  function totalForMonth(key) {
    return eventsForMonth(key).reduce((total, event) => total + (Number(event.amount) || 0), 0);
  }

  function financeMonthlyGoal() {
    try { return Number(typeof state !== 'undefined' ? state.monthlyGoal : 0) || 0; } catch (_) { return 0; }
  }

  function projectedMonthlyAverage(fromMonth) {
    const totals = availableMonths()
      .filter((item) => item.key >= fromMonth)
      .map((item) => totalForMonth(item.key))
      .filter((total) => total > 0);
    return totals.length ? totals.reduce((sum, total) => sum + total, 0) / totals.length : 0;
  }

  function ensureStyle() {
    if (document.querySelector('#agenda-forecast-style')) return;
    const style = document.createElement('style');
    style.id = 'agenda-forecast-style';
    style.textContent = `
      #agenda-forecast { max-width: 1280px; margin: 0 auto; padding: 0 0 80px; color: #171629; }
      #agenda-forecast * { box-sizing: border-box; }
      .agenda-hero { position: relative; overflow: hidden; padding: 25px 28px; border-radius: 24px; background: linear-gradient(125deg,#171629 0%,#32214c 62%,#6b3f83 100%); color: white; box-shadow: 0 18px 46px rgba(38,24,68,.18); }
      .agenda-hero:after { content:''; position:absolute; width:350px; height:350px; right:-120px; top:-230px; border:48px solid rgba(53,242,242,.13); border-radius:50%; }
      .agenda-eyebrow { margin:0 0 7px; font-size:12px; font-weight:800; letter-spacing:.13em; text-transform:uppercase; color:#35f2f2; }
      .agenda-hero h2 { margin:0; font-size:31px; line-height:1.08; color:#fff; }
      .agenda-hero p { max-width:650px; margin:8px 0 0; color:#dfd7eb; font-size:14px; }
      .agenda-grid { display:grid; grid-template-columns:minmax(0,1.55fr) minmax(288px,.45fr); gap:18px; margin-top:18px; align-items:start; }
      .agenda-card { background:rgba(255,255,255,.88); border:1px solid rgba(91,47,128,.13); border-radius:20px; padding:21px; box-shadow:0 11px 28px rgba(29,22,62,.055); }
      .agenda-card h3 { margin:0; font-size:20px; }
      .agenda-card .agenda-note { margin:7px 0 20px; font-size:14px; color:#777387; }
      .agenda-kpis { display:grid; grid-template-columns:1.25fr .85fr .85fr; gap:10px; margin-top:17px; }
      .agenda-kpi { min-height:92px; padding:15px; border-radius:16px; background:#f7f2fb; }
      .agenda-kpi span { display:block; font-size:12px; color:#746e82; margin-bottom:5px; }
      .agenda-kpi strong { font-size:22px; color:#171629; }
      .agenda-kpi.accent { background:linear-gradient(120deg,rgba(53,242,242,.22),rgba(214,148,242,.25)); }
      .agenda-kpi.accent strong { color:#15999d; }
      .agenda-forecast-chart { margin:16px 0 9px; padding:16px 16px 12px; border:1px solid rgba(117,77,157,.15); border-radius:16px; background:linear-gradient(135deg,#fbf8ff 0%,#fff 56%,#f3fcfc 100%); }
      .agenda-chart-head { display:flex; align-items:baseline; justify-content:space-between; gap:12px; margin-bottom:11px; }
      .agenda-chart-head strong { font-size:13px; color:#2a243c; }
      .agenda-chart-head span { font-size:12px; font-weight:750; color:#8b65a4; }
      .agenda-bars { position:relative; display:grid; grid-template-columns:repeat(6,minmax(0,1fr)); align-items:end; gap:10px; min-height:112px; padding:9px 2px 0; background:repeating-linear-gradient(to bottom,transparent 0,transparent 35px,rgba(125,105,145,.09) 36px); }
      .agenda-bar-slot { z-index:1; display:flex; min-width:0; min-height:103px; flex-direction:column; align-items:center; justify-content:end; gap:6px; }
      .agenda-bar-value { min-height:16px; font-size:10px; font-weight:800; color:#595166; white-space:nowrap; }
      .agenda-bar { width:min(38px,72%); min-height:5px; border-radius:10px 10px 4px 4px; background:linear-gradient(180deg,#35f2f2,#22bfc4); box-shadow:0 6px 14px rgba(53,242,242,.19); transition:height .3s ease; }
      .agenda-bar-slot.zero .agenda-bar { background:#e9e3ed; box-shadow:none; }
      .agenda-bar-label { color:#776f83; font-size:11px; font-weight:750; text-transform:capitalize; }
      .agenda-goal-line { z-index:2; position:absolute; right:0; left:0; height:1px; border-top:1px dashed #b66bf2; pointer-events:none; }
      .agenda-goal-line span { position:absolute; right:0; top:-18px; padding-left:5px; background:#fbf9fd; color:#9661c7; font-size:10px; font-weight:800; }
      .agenda-toolbar { display:flex; align-items:end; gap:10px; margin-bottom:14px; }
      .agenda-field { display:flex; flex-direction:column; gap:6px; flex:1; font-size:12px; font-weight:700; color:#706a7d; }
      .agenda-field input,.agenda-field select { width:100%; height:42px; padding:0 12px; font:inherit; color:#171629; background:#fff; border:1px solid #e6dced; border-radius:11px; outline:none; }
      .agenda-field input:focus,.agenda-field select:focus { border-color:#b66bf2; box-shadow:0 0 0 3px rgba(182,107,242,.12); }
      .agenda-button { height:42px; padding:0 15px; border:0; border-radius:11px; background:#b66bf2; color:#fff; cursor:pointer; font-weight:800; font-size:13px; box-shadow:0 8px 18px rgba(182,107,242,.2); }
      .agenda-button:hover { transform:translateY(-1px); }
      .agenda-button.ghost { background:#f7f1fa; color:#7e3faa; box-shadow:none; }
      .agenda-event-list { display:flex; flex-direction:column; gap:6px; margin-top:14px; }
      .agenda-event { display:grid; grid-template-columns:76px 1fr auto auto; align-items:center; gap:12px; padding:12px 11px; border:1px solid transparent; border-radius:12px; }
      .agenda-event:hover { background:#faf7fd; border-color:#eee6f3; }
      .agenda-event:last-child { border-bottom:0; }
      .agenda-date { font-weight:800; font-size:13px; color:#8a6e9c; text-transform:capitalize; }
      .agenda-title { font-weight:750; color:#242035; }
      .agenda-amount { color:#15999d; font-weight:850; white-space:nowrap; }
      .agenda-icon-button { border:0; background:transparent; color:#93899e; cursor:pointer; padding:6px; font-size:16px; }
      .agenda-empty { padding:28px 0; color:#8b8493; text-align:center; }
      .agenda-rule-list { display:flex; flex-direction:column; gap:9px; }
      .agenda-rule { display:grid; grid-template-columns:1fr 130px auto; gap:8px; align-items:center; }
      .agenda-rule input { height:40px; padding:0 10px; border:1px solid #e9deee; border-radius:10px; color:#29243a; font-size:13px; }
      .agenda-rule .agenda-icon-button { background:#fbf4fa; border-radius:9px; color:#be4e87; }
      .agenda-settings { display:flex; flex-wrap:wrap; gap:9px; margin-top:14px; padding-top:14px; border-top:1px solid #eee8f1; }
      .agenda-year { margin-top:22px; }
      .agenda-year-head { display:flex; justify-content:space-between; align-items:end; gap:15px; margin-bottom:12px; }
      .agenda-year-list { display:grid; grid-template-columns:repeat(3,1fr); gap:9px; }
      .agenda-month-item { text-align:left; padding:12px; border:1px solid #ede5f0; border-radius:13px; background:#fff; cursor:pointer; }
      .agenda-month-item:hover { border-color:#b66bf2; }
      .agenda-month-item span { display:block; font-size:12px; color:#7c7487; text-transform:capitalize; }
      .agenda-month-item strong { display:block; margin-top:4px; color:#282037; font-size:15px; }
      .agenda-month-item em { display:block; margin-top:2px; font-size:11px; font-style:normal; color:#1aa5a7; }
      .agenda-google { background:linear-gradient(145deg,#fff8f5,#fff); border-color:#ffd9c5; }
      .agenda-google-mark { display:inline-flex; align-items:center; justify-content:center; width:42px; height:42px; border-radius:13px; background:#ff6731; color:#fff; font-size:21px; margin-bottom:12px; }
      .agenda-google strong { display:block; font-size:18px; }
      .agenda-google p { margin:8px 0 0; color:#776f70; line-height:1.45; font-size:13px; }
      .agenda-google .agenda-settings { display:grid; grid-template-columns:1fr; }
      .agenda-google .agenda-button { width:100%; text-align:left; }
      .agenda-rules-card { padding:0; overflow:hidden; }
      .agenda-rules-card summary { display:flex; align-items:center; justify-content:space-between; gap:16px; padding:20px 21px; cursor:pointer; list-style:none; color:#242035; }
      .agenda-rules-card summary::-webkit-details-marker { display:none; }
      .agenda-rules-card summary > span:first-child { display:flex; flex-direction:column; gap:3px; }
      .agenda-rules-card summary strong { font-size:16px; }
      .agenda-rules-card summary small { color:#81798d; font-size:12px; }
      .agenda-rules-card summary::after { content:'+'; display:grid; place-items:center; width:27px; height:27px; border-radius:50%; background:#f5edf9; color:#9357bf; font-size:20px; line-height:1; }
      .agenda-rules-card[open] summary { border-bottom:1px solid #eee8f1; }
      .agenda-rules-card[open] summary::after { content:'−'; }
      .agenda-rules-content { padding:18px 21px 21px; }
      .agenda-rules-content .agenda-note { margin-top:0; }
      .agenda-modal { position:fixed; inset:0; z-index:99999; display:grid; place-items:center; padding:20px; background:rgba(18,15,34,.56); backdrop-filter:blur(7px); }
      .agenda-modal-box { width:min(520px,100%); padding:25px; border-radius:22px; background:#fff; box-shadow:0 28px 80px rgba(10,8,25,.35); }
      .agenda-modal-box h3 { margin:0 0 18px; font-size:23px; }
      .agenda-form-grid { display:grid; grid-template-columns:1fr 1fr; gap:13px; }
      .agenda-form-grid .wide { grid-column:1 / -1; }
      .agenda-modal-actions { display:flex; justify-content:flex-end; gap:10px; margin-top:20px; }
      .agenda-nav { position:relative; }
      .agenda-nav:after { content:'Prévision'; position:absolute; right:14px; font-size:9px; color:#35f2f2; opacity:.85; }
      @media (max-width:900px) { .agenda-grid { grid-template-columns:1fr; } .agenda-year-list { grid-template-columns:repeat(2,1fr); } .agenda-kpis { grid-template-columns:repeat(2,1fr); } }
      @media (max-width:600px) { #agenda-forecast { padding-bottom:95px; } .agenda-hero,.agenda-card { padding:19px; border-radius:18px; } .agenda-hero h2 { font-size:27px; } .agenda-event { grid-template-columns:62px 1fr auto; } .agenda-event .agenda-icon-button { grid-column:3; } .agenda-toolbar,.agenda-rule { flex-direction:column; display:flex; align-items:stretch; } .agenda-year-list { grid-template-columns:1fr 1fr; } .agenda-form-grid { grid-template-columns:1fr; } .agenda-form-grid .wide { grid-column:auto; } .agenda-bars { gap:4px; } .agenda-bar-value { font-size:9px; } }
    `;
    document.head.appendChild(style);
  }

  function ensureNativeReadability() {
    if (document.querySelector('#native-readability-style')) return;
    const style = document.createElement('style');
    style.id = 'native-readability-style';
    style.textContent = `
      /* WebKit : conserve le design tout en évitant les artefacts de texture sur les chiffres. */
      body:before, .app:after { display:none !important; }
      .fixed-summary-total b, .fixed-summary-total b:before, .fixed-summary-total b:after {
        position:relative !important; isolation:isolate !important; display:block !important;
        text-decoration:none !important; text-shadow:none !important; filter:none !important;
        -webkit-text-fill-color:#35f2f2 !important; color:#35f2f2 !important;
        background:none !important; mix-blend-mode:normal !important; opacity:1 !important;
      }
    `;
    document.head.appendChild(style);
  }

  function ensureView() {
    ensureStyle();
    ensureNativeReadability();
    const main = document.querySelector('main');
    if (!main) return false;
    if (!document.querySelector('#agenda-forecast')) {
      const view = document.createElement('section');
      view.id = 'agenda-forecast';
      view.className = 'view';
      view.hidden = true;
      main.appendChild(view);
    }
    const nav = document.querySelector('.sidebar nav');
    if (nav && !nav.querySelector('[data-agenda-nav]')) {
      const button = document.createElement('button');
      button.className = 'nav agenda-nav';
      button.type = 'button';
      button.dataset.agendaNav = 'true';
      button.innerHTML = '<span class="ico">⌖</span><span>Agenda</span>';
      nav.appendChild(button);
    }
    return true;
  }

  function googleStatusText() {
    if (data.google?.status === 'syncing') return 'Connexion et synchronisation en cours…';
    if (data.google?.error) return data.google.error;
    if (data.google?.lastSyncedAt) return `${Number(data.google.lastCount) || 0} date${Number(data.google.lastCount) > 1 ? 's' : ''} Google · synchronisé le ${new Date(data.google.lastSyncedAt).toLocaleString('fr-FR', { dateStyle: 'medium', timeStyle: 'short' })}.`;
    return 'Connecte ton compte pour importer tes rendez-vous à venir.';
  }

  function loadGoogleIdentity() {
    if (window.google?.accounts?.oauth2) return Promise.resolve();
    if (googleScriptPromise) return googleScriptPromise;
    googleScriptPromise = new Promise((resolve, reject) => {
      const script = document.createElement('script');
      script.src = 'https://accounts.google.com/gsi/client';
      script.async = true;
      script.defer = true;
      script.onload = resolve;
      script.onerror = () => reject(new Error('Impossible de charger la connexion Google.'));
      document.head.appendChild(script);
    });
    return googleScriptPromise;
  }

  function defaultAmountForTitle(title) {
    const normalized = String(title || '').toLocaleLowerCase('fr-FR');
    const rule = data.rules.find((item) => {
      const keyword = String(item.keyword || '').trim().toLocaleLowerCase('fr-FR');
      return keyword && normalized.includes(keyword);
    });
    return Number(rule?.amount) || 0;
  }

  function applyRulesToImportedEvents() {
    data.events = data.events.map((item) => {
      if (item.source !== 'google' || item.amountMode === 'manual') return item;
      return { ...item, amount: defaultAmountForTitle(item.title), amountMode: 'rule' };
    });
  }

  async function syncGoogleCalendar() {
    if (!googleAccessToken) throw new Error('Autorisation Google manquante.');
    const start = new Date();
    start.setDate(1);
    const end = new Date(start);
    end.setMonth(end.getMonth() + 15);
    const query = new URLSearchParams({ timeMin: start.toISOString(), timeMax: end.toISOString(), singleEvents: 'true', orderBy: 'startTime', maxResults: '2500' });
    const response = await fetch(`https://www.googleapis.com/calendar/v3/calendars/primary/events?${query}`, { headers: { Authorization: `Bearer ${googleAccessToken}` } });
    if (!response.ok) throw new Error('Google Agenda n’a pas pu fournir les rendez-vous. Réessaie de te connecter.');
    // Google ne renvoie pas les évènements supprimés : la synchronisation doit donc
    // remplacer la fenêtre synchronisée, pas seulement ajouter les nouveaux rendez-vous.
    // On récupère aussi les éventuelles pages suivantes pour ne laisser aucune date de côté.
    let payload = await response.json();
    const googleItems = [...(payload.items || [])];
    while (payload.nextPageToken) {
      const pagedQuery = new URLSearchParams(query);
      pagedQuery.set('pageToken', payload.nextPageToken);
      const pageResponse = await fetch(`https://www.googleapis.com/calendar/v3/calendars/primary/events?${pagedQuery}`, { headers: { Authorization: `Bearer ${googleAccessToken}` } });
      if (!pageResponse.ok) throw new Error('Google Agenda n’a pas pu fournir tous les rendez-vous. Réessaie de te connecter.');
      payload = await pageResponse.json();
      googleItems.push(...(payload.items || []));
    }
    // Les toutes premières synchronisations ne sauvegardaient pas encore l'ID
    // Google de chaque rendez-vous. On les reconnaît à leur absence de source,
    // afin de les remplacer également lors de cette synchronisation.
    const isManualEvent = (item) => item.source === 'manual';
    const signature = (item) => `${item.date || ''}|${String(item.title || '').trim().toLocaleLowerCase('fr-FR')}`;
    const existing = new Map(data.events.filter((item) => item.source === 'google' && item.googleEventId).map((item) => [item.googleEventId, item]));
    const legacyImported = new Map(data.events.filter((item) => !isManualEvent(item)).map((item) => [signature(item), item]));
    const fetched = googleItems.map((item) => {
      const date = String(item.start?.date || item.start?.dateTime || '').slice(0, 10);
      if (!date) return null;
      const title = item.summary || 'Évènement sans titre';
      // Conserve une éventuelle correction manuelle du montant, même si cette
      // date provenait d'une ancienne version de l'import.
      const old = existing.get(item.id) || legacyImported.get(`${date}|${String(title).trim().toLocaleLowerCase('fr-FR')}`);
      return { ...(old || {}), id: old?.id || `google-${item.id}`, source: 'google', googleEventId: item.id, date, title, amount: old?.amountMode === 'manual' ? old.amount : defaultAmountForTitle(title), amountMode: old?.amountMode || 'rule' };
    }).filter(Boolean);
    const startKey = monthKey(start);
    const endKey = monthKey(end);
    // Dans la fenêtre synchronisée, Google est la source de vérité : un
    // rendez-vous supprimé de Google doit donc disparaître ici. Les dates
    // créées via « Ajouter une date » portent source: manual et sont préservées.
    data.events = [...data.events.filter((item) => isManualEvent(item) || item.date?.slice(0, 7) < startKey || item.date?.slice(0, 7) >= endKey), ...fetched];
    data.google = { status: 'connected', lastSyncedAt: new Date().toISOString(), lastCount: fetched.length, error: '' };
    save();
  }

  function resetImportedGoogleDates() {
    const start = new Date();
    start.setDate(1);
    const end = new Date(start);
    end.setMonth(end.getMonth() + 15);
    const startKey = monthKey(start);
    const endKey = monthKey(end);
    const removable = data.events.filter((item) => item.source !== 'manual' && item.date?.slice(0, 7) >= startKey && item.date?.slice(0, 7) < endKey);
    if (!removable.length) {
      connectGoogleCalendar();
      return;
    }
    const message = `${removable.length} date${removable.length > 1 ? 's' : ''} importée${removable.length > 1 ? 's' : ''} de Google vont être remplacée${removable.length > 1 ? 's' : ''} par la version actuelle de ton Agenda. Tes dates ajoutées manuellement dans Freelance OS seront conservées.`;
    if (!window.confirm(message)) return;
    data.events = data.events.filter((item) => item.source === 'manual' || item.date?.slice(0, 7) < startKey || item.date?.slice(0, 7) >= endKey);
    data.google = { ...data.google, lastSyncedAt: '', lastCount: 0, error: '' };
    save();
    render();
    connectGoogleCalendar();
  }

  async function connectGoogleCalendar() {
    if (location.protocol === 'file:') {
      data.google = { ...data.google, status: 'idle', error: 'Ouvre l’app via le lien GitHub Pages pour connecter Google Agenda.' };
      save(); render(); return;
    }
    data.google = { ...data.google, status: 'syncing', error: '' };
    save(); render();
    try {
      await loadGoogleIdentity();
      googleTokenClient = window.google.accounts.oauth2.initTokenClient({
        client_id: GOOGLE_CLIENT_ID,
        scope: GOOGLE_SCOPE,
        callback: async (token) => {
          try {
            if (token.error) throw new Error('Autorisation Google annulée ou refusée.');
            googleAccessToken = token.access_token;
            await syncGoogleCalendar();
          } catch (error) {
            data.google = { ...data.google, status: 'idle', error: error.message || 'Synchronisation impossible.' };
            save();
          }
          render();
        }
      });
      googleTokenClient.requestAccessToken({ prompt: googleAccessToken ? '' : 'consent' });
    } catch (error) {
      data.google = { ...data.google, status: 'idle', error: error.message || 'Connexion Google impossible.' };
      save(); render();
    }
  }

  function render() {
    if (!ensureView()) return;
    const root = document.querySelector('#agenda-forecast');
    const month = data.activeMonth || monthKey();
    const events = eventsForMonth(month);
    const total = totalForMonth(month);
    const minimumGoal = Number(data.forecastGoal) || financeMonthlyGoal();
    const gap = minimumGoal > 0 ? Math.max(0, minimumGoal - total) : 0;
    const average = projectedMonthlyAverage(month);
    const months = availableMonths();
    const chartMonths = months.filter((item) => item.key >= month).slice(0, 6);
    const chartValues = chartMonths.map((item) => totalForMonth(item.key));
    const chartMax = Math.max(minimumGoal || 0, ...chartValues, 1);
    const goalPosition = minimumGoal > 0 ? Math.min(100, (minimumGoal / chartMax) * 100) : 0;
    const forecastChart = chartMonths.length ? `<section class="agenda-forecast-chart" aria-label="Graphique des prévisions à venir"><div class="agenda-chart-head"><strong>Prévisions sur 6 mois</strong><span>${minimumGoal > 0 ? `Objectif : ${money.format(minimumGoal)} / mois` : 'Ajoute un objectif pour le comparer'}</span></div><div class="agenda-bars">${minimumGoal > 0 ? `<i class="agenda-goal-line" style="bottom:${goalPosition}%"><span>objectif</span></i>` : ''}${chartMonths.map((item, index) => { const value = chartValues[index]; const height = Math.max(value > 0 ? 7 : 3, (value / chartMax) * 100); return `<div class="agenda-bar-slot ${value ? '' : 'zero'}"><span class="agenda-bar-value">${value ? money.format(value) : '—'}</span><i class="agenda-bar" style="height:${height}%"></i><span class="agenda-bar-label">${esc(item.label.split(' ')[0].slice(0, 4))}</span></div>`; }).join('')}</div></section>` : '';
    const monthOptions = months.map((item) => `<option value="${item.key}" ${item.key === month ? 'selected' : ''}>${esc(item.label)}</option>`).join('');
    const list = events.length ? events.map((event) => {
      const date = new Date(`${event.date}T12:00:00`).toLocaleDateString('fr-FR', { day: 'numeric', month: 'short' });
      return `<div class="agenda-event"><div class="agenda-date">${esc(date)}</div><div class="agenda-title">${esc(event.title)}</div><strong class="agenda-amount">${money.format(Number(event.amount) || 0)}</strong><button class="agenda-icon-button" data-agenda-edit="${event.id}" title="Modifier">✎</button></div>`;
    }).join('') : '<div class="agenda-empty">Aucune date prévue ce mois-ci.<br>Ajoute un DJ set, un mariage ou toute autre prestation.</div>';
    const rules = data.rules.map((rule) => `<div class="agenda-rule"><input data-rule-keyword="${rule.id}" value="${esc(rule.keyword)}" aria-label="Mot-clé"><input data-rule-amount="${rule.id}" type="number" min="0" step="1" value="${Number(rule.amount) || 0}" aria-label="Montant"><button class="agenda-icon-button" data-rule-delete="${rule.id}" title="Supprimer">×</button></div>`).join('');
    root.innerHTML = `
      <div class="agenda-hero">
        <p class="agenda-eyebrow">Planning créatif</p>
        <h2>Agenda & prévisions</h2>
        <p>Une vue simple de tes dates à venir et du CA qu’elles représentent.</p>
      </div>
      <div class="agenda-grid">
        <section class="agenda-card">
          <div class="agenda-toolbar">
            <label class="agenda-field">Mois visualisé<select id="agenda-month">${monthOptions}</select></label>
            <button class="agenda-button" type="button" data-agenda-add>+ Ajouter une date</button>
          </div>
          <div class="agenda-kpis">
            <div class="agenda-kpi accent"><span>Prévision du mois</span><strong>${money.format(total)}</strong></div>
            <div class="agenda-kpi"><span>Objectif du mois</span><strong>${minimumGoal > 0 ? money.format(minimumGoal) : '—'}</strong></div>
            <div class="agenda-kpi"><span>${events.length} date${events.length > 1 ? 's' : ''} · moyenne</span><strong>${money.format(average)}</strong></div>
          </div>
          ${forecastChart}
          ${minimumGoal > 0 ? `<p class="agenda-note" style="margin:13px 0 2px">${total >= minimumGoal ? 'Objectif minimum atteint pour ce mois.' : `Il reste ${money.format(gap)} pour atteindre ton minimum ce mois-ci.`}</p>` : ''}
          <div class="agenda-event-list">${list}</div>
        </section>
        <aside>
          <section class="agenda-card agenda-google">
            <div class="agenda-google-mark">⌘</div>
            <strong>Google Agenda</strong>
            <p>${esc(googleStatusText())}</p>
            <div class="agenda-settings"><button class="agenda-button ghost" type="button" data-google-connect ${data.google?.status === 'syncing' ? 'disabled' : ''}>${data.google?.status === 'syncing' ? 'Synchronisation…' : data.google?.lastSyncedAt ? 'Synchroniser maintenant' : 'Connecter Google Agenda'}</button>${data.google?.lastSyncedAt ? '<button class="agenda-button ghost" type="button" data-google-reset>Nettoyer les anciennes dates</button>' : ''}</div>
          </section>
          <details class="agenda-card agenda-rules-card" style="margin-top:14px">
            <summary><span><strong>Règles & objectif</strong><small>${data.rules.length} règle${data.rules.length > 1 ? 's' : ''} · objectif ${minimumGoal > 0 ? money.format(minimumGoal) : 'non défini'}</small></span></summary>
            <div class="agenda-rules-content">
              <p class="agenda-note">Un mot-clé remplit automatiquement le montant de tes dates Agenda.</p>
              <div class="agenda-rule-list">${rules}</div>
              <div class="agenda-settings"><button class="agenda-button ghost" type="button" data-rule-add>+ Ajouter une règle</button></div>
              <div class="agenda-settings">
                <label class="agenda-field">Objectif CA minimum / mois (€)<input id="agenda-goal" type="number" min="0" step="100" value="${Number(data.forecastGoal) || ''}" placeholder="${financeMonthlyGoal() || 'Optionnel'}"></label>
              </div>
            </div>
          </details>
        </aside>
      </div>
    `;
  }

  function openEventModal(existing = null) {
    const event = existing || { date: `${data.activeMonth || monthKey()}-01`, title: '', amount: '' };
    const modal = document.createElement('div');
    modal.className = 'agenda-modal';
    modal.innerHTML = `
      <form class="agenda-modal-box" id="agenda-event-form">
        <h3>${existing ? 'Modifier la prévision' : 'Ajouter une date prévue'}</h3>
        <div class="agenda-form-grid">
          <label class="agenda-field"><span>Date</span><input required name="date" type="date" value="${esc(event.date)}"></label>
          <label class="agenda-field"><span>Montant prévu (€)</span><input required name="amount" type="number" min="0" step="1" value="${Number(event.amount) || ''}" placeholder="Ex. 200"></label>
          <label class="agenda-field wide"><span>Nom de la date / prestation</span><input required name="title" value="${esc(event.title)}" placeholder="Ex. FIZZ Lyon, Mariage Martin…"></label>
        </div>
        <div class="agenda-modal-actions"><button type="button" class="agenda-button ghost" data-agenda-close>Annuler</button>${existing ? '<button type="button" class="agenda-button ghost" data-agenda-delete>Supprimer</button>' : ''}<button class="agenda-button" type="submit">${existing ? 'Enregistrer' : 'Ajouter la prévision'}</button></div>
      </form>`;
    document.body.appendChild(modal);
    const title = modal.querySelector('[name=title]');
    const amount = modal.querySelector('[name=amount]');
    title.focus();
    title.addEventListener('input', () => {
      if (existing || amount.value) return;
      const matchingRule = data.rules.find((rule) => title.value.toLocaleLowerCase('fr-FR').includes(String(rule.keyword).toLocaleLowerCase('fr-FR')));
      if (matchingRule) amount.value = Number(matchingRule.amount) || '';
    });
    modal.querySelector('[data-agenda-close]').addEventListener('click', () => modal.remove());
    modal.querySelector('[data-agenda-delete]')?.addEventListener('click', () => {
      data.events = data.events.filter((item) => item.id !== existing.id);
      save(); modal.remove(); render();
    });
    modal.querySelector('form').addEventListener('submit', (submitEvent) => {
      submitEvent.preventDefault();
      const form = new FormData(submitEvent.currentTarget);
      const next = { ...(existing || {}), id: existing?.id || uid(), source: existing?.source || 'manual', date: String(form.get('date')), title: String(form.get('title')).trim(), amount: Number(form.get('amount')) || 0, amountMode: 'manual' };
      if (existing) data.events = data.events.map((item) => item.id === existing.id ? next : item);
      else data.events.push(next);
      data.activeMonth = next.date.slice(0, 7);
      save(); modal.remove(); render();
    });
  }

  function showAgenda() {
    ensureView();
    document.querySelectorAll('.view').forEach((view) => {
      const isAgenda = view.id === 'agenda-forecast';
      view.hidden = !isAgenda;
      view.classList.toggle('active', isAgenda);
    });
    document.querySelectorAll('.sidebar .nav').forEach((item) => item.classList.toggle('active', item.dataset.agendaNav === 'true'));
    render();
  }

  function bindDashboardPicker() {
    const picker = document.querySelector('#dashboard-month-picker');
    if (!picker || picker === dashboardListenerTarget) return;
    dashboardListenerTarget = picker;
    picker.addEventListener('change', () => {
      if (/^\d{4}-\d{2}$/.test(picker.value)) {
        data.activeMonth = picker.value;
        save();
        if (!document.querySelector('#agenda-forecast')?.hidden) render();
      }
    });
  }

  document.addEventListener('click', (event) => {
    const regularNav = event.target.closest('.sidebar .nav');
    if (regularNav && regularNav.dataset.agendaNav !== 'true') {
      document.querySelector('[data-agenda-nav]')?.classList.remove('active');
      const agendaView = document.querySelector('#agenda-forecast');
      if (agendaView) {
        agendaView.hidden = true;
        agendaView.classList.remove('active');
      }
    }
    const target = event.target.closest('[data-agenda-nav],[data-agenda-add],[data-agenda-edit],[data-agenda-month],[data-rule-add],[data-rule-delete],[data-google-connect],[data-google-reset]');
    if (!target) return;
    if (target.dataset.agendaNav) { event.preventDefault(); showAgenda(); }
    if (target.dataset.agendaAdd !== undefined) openEventModal();
    if (target.dataset.agendaEdit) openEventModal(data.events.find((item) => item.id === target.dataset.agendaEdit));
    if (target.dataset.agendaMonth) { data.activeMonth = target.dataset.agendaMonth; save(); render(); }
    if (target.dataset.ruleAdd !== undefined) { data.rules.push({ id: uid(), keyword: '', amount: 0 }); save(); render(); }
    if (target.dataset.ruleDelete) { data.rules = data.rules.filter((rule) => rule.id !== target.dataset.ruleDelete); save(); render(); }
    if (target.dataset.googleConnect !== undefined) connectGoogleCalendar();
    if (target.dataset.googleReset !== undefined) resetImportedGoogleDates();
  });

  document.addEventListener('change', (event) => {
    if (event.target.id === 'agenda-month') { data.activeMonth = event.target.value; save(); render(); }
    if (event.target.id === 'agenda-goal') { data.forecastGoal = Number(event.target.value) || 0; save(); render(); }
    if (event.target.dataset.ruleKeyword) { const rule = data.rules.find((item) => item.id === event.target.dataset.ruleKeyword); if (rule) { rule.keyword = event.target.value; applyRulesToImportedEvents(); save(); render(); } }
    if (event.target.dataset.ruleAmount) { const rule = data.rules.find((item) => item.id === event.target.dataset.ruleAmount); if (rule) { rule.amount = Number(event.target.value) || 0; applyRulesToImportedEvents(); save(); render(); } }
  });

  const observer = new MutationObserver(() => { ensureView(); bindDashboardPicker(); });
  const start = () => { ensureView(); bindDashboardPicker(); observer.observe(document.body, { childList: true, subtree: true }); };
  if (document.readyState === 'loading') document.addEventListener('DOMContentLoaded', start, { once: true }); else start();
})();
