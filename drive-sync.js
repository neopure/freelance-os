(() => {
  'use strict';

  /*
   * Sauvegarde privée Freelance OS dans l'espace application Google Drive.
   * Aucun chiffre n'est envoyé vers GitHub : seul le navigateur dialogue
   * directement avec le Drive de la personne qui a autorisé l'application.
   */
  const CLIENT_ID = '368626541227-mbk5skk95tonks4of8504vl0hfm2jscf.apps.googleusercontent.com';
  const SCOPE = 'https://www.googleapis.com/auth/drive.appdata';
  const FILE_NAME = 'freelance-os-state.json';
  const META_KEY = 'freelance-os-drive-sync-meta-v1';
  const DATA_KEYS = ['neopure-finance-v1', 'freelance-os-agenda-previsions-v1'];
  const API = 'https://www.googleapis.com/drive/v3';
  const UPLOAD_API = 'https://www.googleapis.com/upload/drive/v3';

  let token = '';
  let saveTimer = null;
  let applyingRemote = false;
  let saving = false;
  let modal = null;
  let meta = readMeta();

  const now = () => new Date().toISOString();
  const uid = () => (crypto.randomUUID ? crypto.randomUUID() : `${Date.now()}-${Math.random().toString(16).slice(2)}`);
  const escapeHtml = (value) => String(value ?? '').replace(/[&<>'"]/g, (character) => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', "'": '&#39;', '"': '&quot;' })[character]);

  function readMeta() {
    try {
      return {
        connected: false,
        deviceId: uid(),
        fileId: '',
        etag: '',
        remoteUpdatedAt: '',
        lastSyncedAt: '',
        localChangedAt: '',
        pending: false,
        ...JSON.parse(localStorage.getItem(META_KEY) || '{}')
      };
    } catch (_) {
      return { connected: false, deviceId: uid(), fileId: '', etag: '', remoteUpdatedAt: '', lastSyncedAt: '', localChangedAt: '', pending: false };
    }
  }

  function persistMeta() {
    localStorage.setItem(META_KEY, JSON.stringify(meta));
  }

  function snapshot() {
    const entries = {};
    DATA_KEYS.forEach((key) => { entries[key] = localStorage.getItem(key); });
    return {
      schema: 1,
      app: 'Freelance OS',
      savedAt: now(),
      deviceId: meta.deviceId,
      entries
    };
  }

  function hasLocalData() {
    return DATA_KEYS.some((key) => {
      const value = localStorage.getItem(key);
      return value && value !== 'null' && value !== '{}';
    });
  }

  function hasRemoteEntries(remote) {
    return Boolean(remote?.entries && DATA_KEYS.some((key) => remote.entries[key]));
  }

  function setStatus(message, mode = '') {
    document.querySelectorAll('[data-drive-sync-status]').forEach((element) => {
      element.textContent = message;
      element.dataset.mode = mode;
    });
  }

  function friendlyDate(iso) {
    if (!iso) return '';
    try { return new Date(iso).toLocaleString('fr-FR', { dateStyle: 'medium', timeStyle: 'short' }); } catch (_) { return ''; }
  }

  function setConnectedUi() {
    const connected = meta.connected;
    document.querySelectorAll('[data-drive-connect]').forEach((button) => {
      button.textContent = connected ? 'Synchroniser maintenant' : 'Connecter Google Drive';
      button.dataset.driveConnect = connected ? 'sync' : 'connect';
    });
    document.querySelectorAll('[data-drive-disconnect]').forEach((button) => { button.hidden = !connected; });
    setStatus(connected
      ? `Drive connecté${meta.lastSyncedAt ? ` · dernière sauvegarde ${friendlyDate(meta.lastSyncedAt)}` : ''}`
      : 'Tes données restent sur cet appareil tant que Drive n’est pas connecté.', connected ? 'ok' : '');
  }

  function loadGoogleScript() {
    if (window.google?.accounts?.oauth2) return Promise.resolve();
    if (window.__freelanceOsDriveGoogleScript) return window.__freelanceOsDriveGoogleScript;
    window.__freelanceOsDriveGoogleScript = new Promise((resolve, reject) => {
      const script = document.createElement('script');
      script.src = 'https://accounts.google.com/gsi/client';
      script.async = true;
      script.defer = true;
      script.onload = resolve;
      script.onerror = () => reject(new Error('Le service de connexion Google est indisponible.'));
      document.head.appendChild(script);
    });
    return window.__freelanceOsDriveGoogleScript;
  }

  async function getToken(interactive = false) {
    if (token) return token;
    await loadGoogleScript();
    return new Promise((resolve, reject) => {
      const client = google.accounts.oauth2.initTokenClient({
        client_id: CLIENT_ID,
        scope: SCOPE,
        callback: (response) => {
          if (response?.access_token) {
            token = response.access_token;
            resolve(token);
          } else {
            reject(new Error(response?.error === 'access_denied'
              ? 'L’autorisation Drive a été refusée.'
              : 'La connexion Google n’a pas pu être finalisée.'));
          }
        },
        error_callback: (error) => reject(new Error(error?.message || 'La fenêtre Google n’a pas pu être ouverte.'))
      });
      client.requestAccessToken({ prompt: interactive ? 'consent' : '' });
    });
  }

  async function api(url, options = {}) {
    const accessToken = await getToken(false);
    const response = await fetch(url, {
      ...options,
      headers: { Authorization: `Bearer ${accessToken}`, ...(options.headers || {}) }
    });
    if (response.status === 401) {
      token = '';
      throw new Error('La session Google a expiré. Relance la synchronisation.');
    }
    if (!response.ok) {
      const body = await response.text().catch(() => '');
      throw new Error(`Drive n’a pas répondu correctement (${response.status}). ${body.includes('insufficientPermissions') ? 'Ajoute l’autorisation Drive dans Google Cloud.' : ''}`.trim());
    }
    return response;
  }

  async function findRemoteFile() {
    const query = encodeURIComponent(`name = '${FILE_NAME}' and trashed = false`);
    const response = await api(`${API}/files?spaces=appDataFolder&q=${query}&fields=files(id,name,modifiedTime,version)`);
    const body = await response.json();
    return body.files?.[0] || null;
  }

  async function readRemote() {
    const file = meta.fileId ? { id: meta.fileId } : await findRemoteFile();
    if (!file) return null;
    const response = await api(`${API}/files/${file.id}?alt=media`);
    const payload = await response.json();
    return {
      fileId: file.id,
      etag: response.headers.get('etag') || '',
      payload,
      modifiedTime: file.modifiedTime || payload.savedAt || ''
    };
  }

  function multipartBody(payload) {
    const boundary = `freelance-os-${uid()}`;
    const body = [
      `--${boundary}`,
      'Content-Type: application/json; charset=UTF-8',
      '',
      JSON.stringify({ name: FILE_NAME, parents: ['appDataFolder'], mimeType: 'application/json' }),
      `--${boundary}`,
      'Content-Type: application/json; charset=UTF-8',
      '',
      JSON.stringify(payload),
      `--${boundary}--`,
      ''
    ].join('\r\n');
    return { body, contentType: `multipart/related; boundary=${boundary}` };
  }

  async function writeRemote({ force = false } = {}) {
    if (saving) return;
    saving = true;
    try {
      const payload = snapshot();
      let fileId = meta.fileId;
      if (!fileId) {
        const found = await findRemoteFile();
        fileId = found?.id || '';
      }
      let response;
      if (fileId) {
        const headers = { 'Content-Type': 'application/json; charset=UTF-8' };
        if (meta.etag && !force) headers['If-Match'] = meta.etag;
        response = await api(`${UPLOAD_API}/files/${fileId}?uploadType=media&fields=id,modifiedTime,version`, { method: 'PATCH', headers, body: JSON.stringify(payload) });
      } else {
        const multipart = multipartBody(payload);
        response = await api(`${UPLOAD_API}/files?uploadType=multipart&fields=id,modifiedTime,version`, { method: 'POST', headers: { 'Content-Type': multipart.contentType }, body: multipart.body });
      }
      const saved = await response.json();
      meta = { ...meta, connected: true, fileId: saved.id || fileId, etag: response.headers.get('etag') || meta.etag, remoteUpdatedAt: payload.savedAt, lastSyncedAt: payload.savedAt, localChangedAt: '', pending: false };
      persistMeta();
      setConnectedUi();
      setStatus(`Sauvegardé dans Google Drive · ${friendlyDate(meta.lastSyncedAt)}`, 'ok');
    } catch (error) {
      if (String(error.message).includes('(412)')) {
        meta.pending = true;
        persistMeta();
        setStatus('Une autre version existe sur Drive. Ouvre la synchronisation pour choisir.', 'warning');
        throw new Error('Des modifications existent sur un autre appareil. Ouvre la sauvegarde Drive avant d’écraser quoi que ce soit.');
      }
      meta.pending = true;
      persistMeta();
      setStatus('Sauvegarde en attente : ' + error.message, 'warning');
      throw error;
    } finally {
      saving = false;
    }
  }

  function applyRemote(remote) {
    if (!hasRemoteEntries(remote)) throw new Error('La sauvegarde Drive est vide ou illisible.');
    applyingRemote = true;
    try {
      DATA_KEYS.forEach((key) => {
        const value = remote.entries[key];
        if (typeof value === 'string') localStorage.setItem(key, value);
        else localStorage.removeItem(key);
      });
      meta = { ...meta, connected: true, lastSyncedAt: remote.savedAt || now(), remoteUpdatedAt: remote.savedAt || '', localChangedAt: '', pending: false };
      persistMeta();
    } finally {
      applyingRemote = false;
    }
  }

  async function connect() {
    try {
      setStatus('Connexion à Google Drive…');
      await getToken(true);
      const remote = await readRemote();
      if (remote?.payload && hasRemoteEntries(remote.payload)) {
        const replace = confirm('Une sauvegarde Freelance OS existe déjà dans ce Google Drive. Voulez-vous charger cette version sur cet appareil ?');
        if (replace) {
          applyRemote(remote.payload);
          meta.fileId = remote.fileId;
          meta.etag = remote.etag;
          persistMeta();
          setStatus('Version Drive chargée. Actualisation de l’application…', 'ok');
          setTimeout(() => window.location.reload(), 450);
          return;
        }
        const overwrite = confirm('Remplacer la sauvegarde Drive par les données actuellement présentes sur cet appareil ?');
        if (!overwrite) { setStatus('Connexion annulée : aucune donnée n’a été remplacée.'); return; }
        meta.fileId = remote.fileId;
        meta.etag = remote.etag;
      }
      meta.connected = true;
      persistMeta();
      await writeRemote({ force: true });
    } catch (error) {
      setStatus(error.message || 'Connexion Drive impossible.', 'warning');
    }
  }

  async function syncNow() {
    try {
      setStatus('Synchronisation en cours…');
      token = '';
      await getToken(true);
      const remote = await readRemote();
      if (remote?.payload && remote.payload.savedAt && meta.remoteUpdatedAt && remote.payload.savedAt > meta.remoteUpdatedAt) {
        const useDrive = confirm('Une version plus récente existe dans Google Drive. Voulez-vous la charger sur cet appareil ?');
        if (useDrive) {
          applyRemote(remote.payload);
          meta.fileId = remote.fileId;
          meta.etag = remote.etag;
          persistMeta();
          window.location.reload();
          return;
        }
        const overwrite = confirm('Remplacer cette version Drive plus récente par les données de cet appareil ?');
        if (!overwrite) return;
        meta.fileId = remote.fileId;
        meta.etag = remote.etag;
        await writeRemote({ force: true });
        return;
      }
      if (remote) { meta.fileId = remote.fileId; meta.etag = remote.etag; }
      await writeRemote();
    } catch (error) {
      setStatus(error.message || 'Synchronisation impossible.', 'warning');
    }
  }

  function scheduleSave() {
    if (!meta.connected || applyingRemote) return;
    meta.localChangedAt = now();
    meta.pending = true;
    persistMeta();
    clearTimeout(saveTimer);
    saveTimer = setTimeout(async () => {
      try {
        token = '';
        await getToken(false);
        await writeRemote();
      } catch (_) {
        /* L'application reste utilisable hors connexion ; le bouton permet de relancer. */
      }
    }, 1600);
  }

  function hookLocalStorage() {
    const originalSetItem = Storage.prototype.setItem;
    const originalRemoveItem = Storage.prototype.removeItem;
    Storage.prototype.setItem = function patchedSetItem(key, value) {
      const result = originalSetItem.call(this, key, value);
      if (this === localStorage && DATA_KEYS.includes(String(key))) scheduleSave();
      return result;
    };
    Storage.prototype.removeItem = function patchedRemoveItem(key) {
      const result = originalRemoveItem.call(this, key);
      if (this === localStorage && DATA_KEYS.includes(String(key))) scheduleSave();
      return result;
    };
  }

  function closeModal() {
    modal?.remove();
    modal = null;
  }

  function openModal() {
    if (modal) return;
    modal = document.createElement('div');
    modal.className = 'drive-sync-modal';
    modal.innerHTML = `
      <div class="drive-sync-modal__backdrop" data-drive-close></div>
      <section class="drive-sync-modal__box" role="dialog" aria-modal="true" aria-labelledby="drive-sync-title">
        <button class="drive-sync-modal__close" type="button" aria-label="Fermer" data-drive-close>×</button>
        <p class="drive-sync-modal__eyebrow">SAUVEGARDE PERSONNELLE</p>
        <h2 id="drive-sync-title">Google Drive</h2>
        <p class="drive-sync-modal__intro">Tes données Freelance OS sont chiffrées par Google et conservées dans l’espace privé de ton application Drive. Elles ne vont jamais dans GitHub.</p>
        <div class="drive-sync-modal__status" data-drive-sync-status></div>
        <div class="drive-sync-modal__actions">
          <button class="drive-sync-modal__primary" type="button" data-drive-connect>${meta.connected ? 'Synchroniser maintenant' : 'Connecter Google Drive'}</button>
          <button class="drive-sync-modal__secondary" type="button" data-drive-disconnect ${meta.connected ? '' : 'hidden'}>Utiliser seulement cet appareil</button>
        </div>
        <p class="drive-sync-modal__note">Après la première connexion, chaque modification est sauvegardée automatiquement dès que tu es en ligne.</p>
      </section>`;
    document.body.append(modal);
    setConnectedUi();
  }

  function ensureStyle() {
    if (document.querySelector('#drive-sync-style')) return;
    const style = document.createElement('style');
    style.id = 'drive-sync-style';
    style.textContent = `
      .drive-sync-trigger{width:40px;height:40px;border:1px solid #eadcf1;border-radius:13px;background:rgba(255,255,255,.86);color:#7f56a6;font-size:18px;line-height:1;cursor:pointer;box-shadow:0 7px 18px rgba(82,44,116,.08);transition:transform .18s ease,box-shadow .18s ease}
      .drive-sync-trigger:hover{transform:translateY(-2px);box-shadow:0 11px 25px rgba(82,44,116,.14)}
      .drive-sync-modal{position:fixed;inset:0;z-index:120;display:grid;place-items:center;padding:20px}
      .drive-sync-modal__backdrop{position:absolute;inset:0;background:rgba(21,22,38,.52);backdrop-filter:blur(8px)}
      .drive-sync-modal__box{position:relative;width:min(510px,100%);padding:32px;border-radius:25px;background:linear-gradient(145deg,#fff,#fbf8ff);box-shadow:0 28px 80px rgba(18,16,35,.35);color:#151626}
      .drive-sync-modal__close{position:absolute;top:15px;right:16px;width:34px;height:34px;border:0;border-radius:50%;background:#f5eff8;color:#352842;font-size:25px;cursor:pointer}
      .drive-sync-modal__eyebrow{margin:0 0 6px;color:#a04fd1;font-weight:800;font-size:11px;letter-spacing:.14em}.drive-sync-modal h2{margin:0;font-size:30px;letter-spacing:-1.1px}.drive-sync-modal__intro{margin:13px 0 18px;color:#625d70;line-height:1.55}
      .drive-sync-modal__status{padding:13px 14px;border-radius:13px;background:#f4eff8;color:#4d4660;font-size:13px;line-height:1.45}.drive-sync-modal__status[data-mode="ok"]{background:#e9fbfb;color:#167c85}.drive-sync-modal__status[data-mode="warning"]{background:#fff1ea;color:#a54d2a}
      .drive-sync-modal__actions{display:flex;gap:10px;flex-wrap:wrap;margin-top:17px}.drive-sync-modal__actions button{border:0;border-radius:12px;padding:12px 15px;font-weight:800;cursor:pointer}.drive-sync-modal__primary{background:#b563ed;color:#fff;box-shadow:0 10px 20px rgba(181,99,237,.26)}.drive-sync-modal__secondary{background:#f1ecf5;color:#605569}.drive-sync-modal__note{margin:17px 0 0;color:#817a8d;font-size:12px;line-height:1.5}
      @media(max-width:680px){.drive-sync-trigger{width:36px;height:36px;border-radius:12px}.drive-sync-modal__box{padding:26px 22px}.drive-sync-modal h2{font-size:26px}}
    `;
    document.head.append(style);
  }

  function installTrigger() {
    if (document.querySelector('[data-drive-open]')) return;
    const top = document.querySelector('.top');
    const trigger = document.createElement('button');
    trigger.type = 'button';
    trigger.className = 'drive-sync-trigger';
    trigger.dataset.driveOpen = '';
    trigger.title = 'Sauvegarde Google Drive';
    trigger.setAttribute('aria-label', 'Sauvegarde Google Drive');
    trigger.textContent = '☁';
    if (top) {
      const add = top.querySelector('.add');
      top.insertBefore(trigger, add || null);
    } else document.body.append(trigger);
  }

  function bindUi() {
    document.addEventListener('click', (event) => {
      const target = event.target.closest('[data-drive-open],[data-drive-close],[data-drive-connect],[data-drive-disconnect]');
      if (!target) return;
      if (target.hasAttribute('data-drive-open')) openModal();
      if (target.hasAttribute('data-drive-close')) closeModal();
      if (target.hasAttribute('data-drive-connect')) (target.dataset.driveConnect === 'sync' ? syncNow() : connect());
      if (target.hasAttribute('data-drive-disconnect')) {
        const confirmed = confirm('Utiliser seulement cet appareil ? La sauvegarde déjà présente dans Drive ne sera pas supprimée.');
        if (confirmed) {
          meta = { ...meta, connected: false, fileId: '', etag: '', pending: false };
          persistMeta();
          token = '';
          setConnectedUi();
        }
      }
    });
    document.addEventListener('keydown', (event) => { if (event.key === 'Escape') closeModal(); });
  }

  function init() {
    ensureStyle();
    hookLocalStorage();
    installTrigger();
    bindUi();
    setConnectedUi();
    window.FreelanceOSDrive = { connect, syncNow, open: openModal };
  }

  if (document.readyState === 'loading') document.addEventListener('DOMContentLoaded', init, { once: true });
  else init();
})();
