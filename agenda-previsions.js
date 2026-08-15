(() => {
  'use strict';

  const STORAGE_KEY = 'freelance-os-agenda-previsions-v1';
  const GOOGLE_CLIENT_ID = '368626541227-mbk5skk95tonks4of8504vl0hfm2jscf.apps.googleusercontent.com';
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
    google: { status: 'idle', lastSyncedAt: '', error: '' }
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
      .agenda-hero { position: relative; overflow: hidden; padding: 32px; border-radius: 26px; background: linear-gradient(125deg,#171629 0%,#32214c 62%,#6b3f83 100%); color: white; box-shadow: 0 18px 46px rgba(38,24,68,.18); }
      .agenda-hero:after { content:''; position:absolute; width:350px; height:350px; right:-120px; top:-230px; border:48px solid rgba(53,242,242,.13); border-radius:50%; }
      .agenda-eyebrow { margin:0 0 7px; font-size:12px; font-weight:800; letter-spacing:.13em; text-transform:uppercase; color:#35f2f2; }
      .agenda-hero h2 { margin:0; font-size:32px; line-height:1.08; color:#fff; }
      .agenda-hero p { max-width:650px; margin:10px 0 0; color:#dfd7eb; font-size:15px; }
      .agenda-grid { display:grid; grid-template-columns:minmax(0,1.35fr) minmax(320px,.65fr); gap:20px; margin-top:22px; }
      .agenda-card { background:rgba(255,255,255,.86); border:1px solid rgba(91,47,128,.13); border-radius:22px; padding:24px; box-shadow:0 11px 28px rgba(29,22,62,.06); }
      .agenda-card h3 { margin:0; font-size:20px; }
      .agenda-card .agenda-note { margin:7px 0 20px; font-size:14px; color:#777387; }
      .agenda-kpis { display:grid; grid-template-columns:repeat(4,1fr); gap:10px; margin-top:21px; }
      .agenda-kpi { padding:15px; border-radius:16px; background:#f7f2fb; }
      .agenda-kpi span { display:block; font-size:12px; color:#746e82; margin-bottom:5px; }
      .agenda-kpi strong { font-size:22px; color:#171629; }
      .agenda-kpi.accent { background:linear-gradient(120deg,rgba(53,242,242,.22),rgba(214,148,242,.25)); }
      .agenda-kpi.accent strong { color:#15999d; }
      .agenda-toolbar { display:flex; align-items:end; gap:12px; margin-bottom:17px; }
      .agenda-field { display:flex; flex-direction:column; gap:6px; flex:1; font-size:12px; font-weight:700; color:#706a7d; }
      .agenda-field input,.agenda-field select { width:100%; height:42px; padding:0 12px; font:inherit; color:#171629; background:#fff; border:1px solid #e6dced; border-radius:11px; outline:none; }
      .agenda-field input:focus,.agenda-field select:focus { border-color:#b66bf2; box-shadow:0 0 0 3px rgba(182,107,242,.12); }
      .agenda-button { height:42px; padding:0 15px; border:0; border-radius:11px; background:#b66bf2; color:#fff; cursor:pointer; font-weight:800; font-size:13px; box-shadow:0 8px 18px rgba(182,107,242,.2); }
      .agenda-button:hover { transform:translateY(-1px); }
      .agenda-button.ghost { background:#f7f1fa; color:#7e3faa; box-shadow:none; }
      .agenda-event-list { display:flex; flex-direction:column; gap:8px; }
      .agenda-event { display:grid; grid-template-columns:76px 1fr auto auto; align-items:center; gap:12px; padding:13px 0; border-bottom:1px solid #eee8f1; }
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
      .agenda-settings { margin-top:16px; padding-top:16px; border-top:1px solid #eee8f1; }
      .agenda-year { margin-top:22px; }
      .agenda-year-head { display:flex; justify-content:space-between; align-items:end; gap:15px; margin-bottom:12px; }
      .agenda-year-list { display:grid; grid-template-columns:repeat(3,1fr); gap:9px; }
      .agenda-month-item { text-align:left; padding:12px; border:1px solid #ede5f0; border-radius:13px; background:#fff; cursor:pointer; }
      .agenda-month-item:hover { border-color:#b66bf2; }
      .agenda-month-item span { display:block; font-size:12px; color:#7c7487; text-transform:capitalize; }
      .agenda-month-item strong { display:block; margin-top:4px; color:#282037; font-size:15px; }
      .agenda-month-item em { display:block; margin-top:2px; font-size:11px; font-style:normal; color:#1aa5a7; }
      .agenda-google { background:linear-gradient(135deg,#fff7f2,#fff); border-color:#ffd9c5; }
      .agenda-google-mark { display:inline-flex; align-items:center; justify-content:center; width:42px; height:42px; border-radius:13px; background:#ff6731; color:#fff; font-size:21px; margin-bottom:12px; }
      .agenda-google strong { display:block; font-size:18px; }
      .agenda-google p { margin:8px 0 0; color:#776f70; line-height:1.45; font-size:13px; }
      .agenda-modal { position:fixed; inset:0; z-index:99999; display:grid; place-items:center; padding:20px; background:rgba(18,15,34,.56); backdrop-filter:blur(7px); }
      .agenda-modal-box { width:min(520px,100%); padding:25px; border-radius:22px; background:#fff; box-shadow:0 28px 80px rgba(10,8,25,.35); }
      .agenda-modal-box h3 { margin:0 0 18px; font-size:23px; }
      .agenda-form-grid { display:grid; grid-template-columns:1fr 1fr; gap:13px; }
      .agenda-form-grid .wide { grid-column:1 / -1; }
      .agenda-modal-actions { display:flex; justify-content:flex-end; gap:10px; margin-top:20px; }
      .agenda-nav { position:relative; }
      .agenda-nav:after { content:'Prévision'; position:absolute; right:14px; font-size:9px; color:#35f2f2; opacity:.85; }
      @media (max-width:900px) { .agenda-grid { grid-template-columns:1fr; } .agenda-year-list { grid-template-columns:repeat(2,1fr); } .agenda-kpis { grid-template-columns:repeat(2,1fr); } }
      @media (max-width:600px) { #agenda-forecast { padding-bottom:95px; } .agenda-hero,.agenda-card { padding:19px; border-radius:18px; } .agenda-hero h2 { font-size:27px; } .agenda-event { grid-template-columns:62px 1fr auto; } .agenda-event .agenda-icon-button { grid-column:3; } .agenda-toolbar,.agenda-rule { flex-direction:column; display:flex; align-items:stretch; } .agenda-year-list { grid-template-columns:1fr 1fr; } .agenda-form-grid { grid-template-columns:1fr; } .agenda-form-grid .wide { grid-column:auto; } }
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
    if (data.google?.lastSyncedAt) return `Synchronisé le ${new Date(data.google.lastSyncedAt).toLocaleString('fr-FR', { dateStyle: 'medium', timeStyle: 'short' })}.`;
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
    const payload = await response.json();
    const existing = new Map(data.events.filter((item) => item.source === 'google' && item.googleEventId).map((item) => [item.googleEventId, item]));
    const fetched = (payload.items || []).map((item) => {
      const date = String(item.start?.date || item.start?.dateTime || '').slice(0, 10);
      if (!date) return null;
      const old = existing.get(item.id);
      const title = item.summary || 'Évènement sans titre';
      return { ...(old || {}), id: old?.id || `google-${item.id}`, source: 'google', googleEventId: item.id, date, title, amount: old?.amountMode === 'manual' ? old.amount : defaultAmountForTitle(title), amountMode: old?.amountMode || 'rule' };
    }).filter(Boolean);
    const startKey = monthKey(start);
    const endKey = monthKey(end);
    data.events = [...data.events.filter((item) => item.source !== 'google' || item.date?.slice(0, 7) < startKey || item.date?.slice(0, 7) >= endKey), ...fetched];
    data.google = { status: 'connected', lastSyncedAt: new Date().toISOString(), error: '' };
    save();
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
    const monthOptions = months.map((item) => `<option value="${item.key}" ${item.key === month ? 'selected' : ''}>${esc(item.label)}</option>`).join('');
    const list = events.length ? events.map((event) => {
      const date = new Date(`${event.date}T12:00:00`).toLocaleDateString('fr-FR', { day: 'numeric', month: 'short' });
      return `<div class="agenda-event"><div class="agenda-date">${esc(date)}</div><div class="agenda-title">${esc(event.title)}</div><strong class="agenda-amount">${money.format(Number(event.amount) || 0)}</strong><button class="agenda-icon-button" data-agenda-edit="${event.id}" title="Modifier">✎</button></div>`;
    }).join('') : '<div class="agenda-empty">Aucune date prévue ce mois-ci.<br>Ajoute un DJ set, un mariage ou toute autre prestation.</div>';
    const rules = data.rules.map((rule) => `<div class="agenda-rule"><input data-rule-keyword="${rule.id}" value="${esc(rule.keyword)}" aria-label="Mot-clé"><input data-rule-amount="${rule.id}" type="number" min="0" step="1" value="${Number(rule.amount) || 0}" aria-label="Montant"><button class="agenda-icon-button" data-rule-delete="${rule.id}" title="Supprimer">×</button></div>`).join('');
    const yearRows = months.filter((item) => item.key >= monthKey() && item.key < `${Number(month.slice(0, 4)) + 1}-01`).slice(0, 12).map((item) => {
      const monthEvents = eventsForMonth(item.key);
      return `<button class="agenda-month-item" data-agenda-month="${item.key}"><span>${esc(item.label)}</span><strong>${money.format(totalForMonth(item.key))}</strong><em>${monthEvents.length} date${monthEvents.length > 1 ? 's' : ''} prévue${monthEvents.length > 1 ? 's' : ''}</em></button>`;
    }).join('');

    root.innerHTML = `
      <div class="agenda-hero">
        <p class="agenda-eyebrow">Planning créatif</p>
        <h2>Agenda & prévisions</h2>
        <p>Anticipe tes prestations sans toucher à la compta : tes dates prévues restent séparées du CA encaissé, des charges et de l’URSSAF.</p>
      </div>
      <div class="agenda-grid">
        <section class="agenda-card">
          <div class="agenda-toolbar">
            <label class="agenda-field">Mois visualisé<select id="agenda-month">${monthOptions}</select></label>
            <button class="agenda-button" type="button" data-agenda-add>+ Ajouter une date</button>
          </div>
          <div class="agenda-kpis">
            <div class="agenda-kpi accent"><span>Prévision du mois</span><strong>${money.format(total)}</strong></div>
            <div class="agenda-kpi"><span>Dates prévues</span><strong>${events.length}</strong></div>
            <div class="agenda-kpi"><span>Moyenne des projections</span><strong>${money.format(average)}</strong></div>
            <div class="agenda-kpi"><span>Objectif CA minimum</span><strong>${minimumGoal > 0 ? money.format(minimumGoal) : '—'}</strong></div>
          </div>
          ${minimumGoal > 0 ? `<p class="agenda-note" style="margin:13px 0 2px">${total >= minimumGoal ? 'Objectif minimum atteint pour ce mois.' : `Il reste ${money.format(gap)} pour atteindre ton minimum ce mois-ci.`}</p>` : ''}
          <div class="agenda-event-list">${list}</div>
        </section>
        <aside>
          <section class="agenda-card agenda-google">
            <div class="agenda-google-mark">⌘</div>
            <strong>Google Agenda</strong>
            <p>${esc(googleStatusText())}</p>
            <div class="agenda-settings"><button class="agenda-button ghost" type="button" data-google-connect ${data.google?.status === 'syncing' ? 'disabled' : ''}>${data.google?.lastSyncedAt ? 'Actualiser Agenda' : 'Connecter Google Agenda'}</button></div>
          </section>
          <section class="agenda-card" style="margin-top:20px">
            <h3>Règles rapides</h3>
            <p class="agenda-note">Un titre qui contient le mot-clé préremplit le montant, que tu peux toujours modifier.</p>
            <div class="agenda-rule-list">${rules}</div>
            <div class="agenda-settings"><button class="agenda-button ghost" type="button" data-rule-add>+ Ajouter une règle</button></div>
            <div class="agenda-settings">
              <label class="agenda-field">Objectif CA minimum / mois (€)<input id="agenda-goal" type="number" min="0" step="100" value="${Number(data.forecastGoal) || ''}" placeholder="${financeMonthlyGoal() || 'Optionnel'}"></label>
            </div>
          </section>
        </aside>
      </div>
      <section class="agenda-card agenda-year">
        <div class="agenda-year-head"><div><h3>Prévisions à venir</h3><p class="agenda-note">Vue par mois — clique sur un mois pour voir ou modifier ses dates.</p></div></div>
        <div class="agenda-year-list">${yearRows || '<div class="agenda-empty">Aucun mois à afficher.</div>'}</div>
      </section>
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
      const next = { ...(existing || {}), id: existing?.id || uid(), date: String(form.get('date')), title: String(form.get('title')).trim(), amount: Number(form.get('amount')) || 0, amountMode: 'manual' };
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
    const target = event.target.closest('[data-agenda-nav],[data-agenda-add],[data-agenda-edit],[data-agenda-month],[data-rule-add],[data-rule-delete],[data-google-connect]');
    if (!target) return;
    if (target.dataset.agendaNav) { event.preventDefault(); showAgenda(); }
    if (target.dataset.agendaAdd !== undefined) openEventModal();
    if (target.dataset.agendaEdit) openEventModal(data.events.find((item) => item.id === target.dataset.agendaEdit));
    if (target.dataset.agendaMonth) { data.activeMonth = target.dataset.agendaMonth; save(); render(); }
    if (target.dataset.ruleAdd !== undefined) { data.rules.push({ id: uid(), keyword: '', amount: 0 }); save(); render(); }
    if (target.dataset.ruleDelete) { data.rules = data.rules.filter((rule) => rule.id !== target.dataset.ruleDelete); save(); render(); }
    if (target.dataset.googleConnect !== undefined) connectGoogleCalendar();
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
