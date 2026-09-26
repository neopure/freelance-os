/* Compte Google : chaque utilisateur se connecte avec son compte, ses données
   vivent dans le dossier privé de l'app sur son propre Drive (appDataFolder).
   Drive fait référence ; le navigateur n'en garde qu'une copie de travail. */
(function () {
  'use strict';

  var CLIENT_ID = '484675980833-78aqn94e5nu13de8gg2slatt7id2rhbj.apps.googleusercontent.com';
  var SCOPE = 'openid email profile https://www.googleapis.com/auth/drive.appdata';
  var FILE_NAME = 'freelance-os-private-state.json';
  var DATA_KEYS = ['neopure-finance-v1', 'freelance-os-agenda-previsions-v1'];
  var SESSION_KEY = 'freelance-os-session-v1';
  var META_KEY = 'freelance-os-sync-v3';
  var LEGACY_META_KEY = 'freelance-os-drive-sync-meta-v2';

  var nativeSet = Storage.prototype.setItem;
  var nativeRemove = Storage.prototype.removeItem;
  var applying = false;
  var pushTimer = 0;
  var queue = Promise.resolve();

  function read(key, fallback) {
    try { return JSON.parse(localStorage.getItem(key)) || fallback; } catch (_) { return fallback; }
  }
  function write(key, value) {
    try { nativeSet.call(localStorage, key, JSON.stringify(value)); } catch (_) {}
  }
  function session() { return read(SESSION_KEY, {}); }
  function meta() { return read(META_KEY, {}); }
  function setMeta(patch) { write(META_KEY, Object.assign(meta(), patch)); paintStatus(); }
  function tokenValid(s) { return !!(s && s.token && s.email && s.expiresAt > Date.now() + 60000); }

  /* Tant qu'aucun compte n'est ouvert, l'app reste masquée derrière l'écran de connexion.
     Un jeton simplement expiré ne verrouille pas : il se renouvelle au premier clic. */
  (function () { var s = session(); if (!(s.token && s.email)) document.documentElement.classList.add('fos-locked'); }());

  function snapshot() {
    var values = {};
    DATA_KEYS.forEach(function (key) { values[key] = localStorage.getItem(key); });
    return { version: 3, updatedAt: new Date().toISOString(), values: values };
  }
  function restore(payload) {
    if (!payload || !payload.values) throw new Error('Sauvegarde invalide');
    applying = true;
    try {
      DATA_KEYS.forEach(function (key) {
        var value = payload.values[key];
        if (typeof value === 'string') nativeSet.call(localStorage, key, value);
        else nativeRemove.call(localStorage, key);
      });
    } finally { applying = false; }
  }
  function clearLocalData() {
    applying = true;
    try { DATA_KEYS.forEach(function (key) { nativeRemove.call(localStorage, key); }); } finally { applying = false; }
  }
  function isUseful(payload) {
    if (!payload || !payload.values) return false;
    try {
      var finance = JSON.parse(payload.values['neopure-finance-v1'] || '{}');
      var hasMonth = (finance.months || []).some(function (m) {
        return Object.keys(m || {}).some(function (k) { return k !== 'id' && k !== 'month' && Number(m[k]) !== 0 && !isNaN(Number(m[k])); });
      });
      var b = finance.bricks || {};
      if (hasMonth || (finance.fixed || []).length || Number(b.wallet) || (b.projects || []).length) return true;
    } catch (_) {}
    try {
      var agenda = JSON.parse(payload.values['freelance-os-agenda-previsions-v1'] || '{}');
      if ((agenda.rules || []).length || (agenda.events || []).length) return true;
    } catch (_) {}
    return false;
  }

  /* ---------- Google ---------- */
  var gisPromise = null;
  function loadGis() {
    if (window.google && google.accounts && google.accounts.oauth2) return Promise.resolve();
    if (gisPromise) return gisPromise;
    gisPromise = new Promise(function (resolve, reject) {
      var script = document.createElement('script');
      script.src = 'https://accounts.google.com/gsi/client';
      script.async = true;
      script.onload = resolve;
      script.onerror = function () { gisPromise = null; reject(new Error('Impossible de charger la connexion Google.')); };
      document.head.appendChild(script);
    });
    return gisPromise;
  }
  /* Appelée uniquement depuis un clic : Safari et l'app iPhone bloquent sinon la fenêtre Google. */
  function requestToken(chooseAccount) {
    return loadGis().then(function () {
      return new Promise(function (resolve, reject) {
        var client = google.accounts.oauth2.initTokenClient({
          client_id: CLIENT_ID,
          scope: SCOPE,
          hint: chooseAccount ? undefined : session().email,
          callback: function (response) {
            if (response && response.access_token) resolve(response);
            else reject(new Error('Connexion Google annulée.'));
          },
          error_callback: function () { reject(new Error('La fenêtre Google n’a pas pu s’ouvrir.')); }
        });
        client.requestAccessToken({ prompt: chooseAccount ? 'select_account' : '' });
      });
    });
  }
  function api(path, options, token) {
    options = options || {};
    options.headers = Object.assign({}, options.headers, { Authorization: 'Bearer ' + (token || session().token) });
    /* Un réseau mobile qui ne répond plus ne doit jamais figer la connexion. */
    var ctrl = !options.keepalive && window.AbortController ? new AbortController() : null, timer;
    if (ctrl) { options.signal = ctrl.signal; timer = setTimeout(function () { ctrl.abort(); }, 30000); }
    return fetch('https://www.googleapis.com/' + path, options).catch(function (error) {
      throw new Error(error && error.name === 'AbortError' ? 'Google Drive ne répond pas. Réessaie.' : 'Connexion réseau impossible. Réessaie.');
    }).then(function (response) {
      if (timer) clearTimeout(timer);
      if (response.status === 401) { expire(); throw new Error('Session Google expirée.'); }
      if (!response.ok) throw new Error('Google Drive indisponible (' + response.status + ').');
      return response;
    });
  }
  function findFile(token) {
    var q = encodeURIComponent("name='" + FILE_NAME + "' and trashed=false");
    return api('drive/v3/files?spaces=appDataFolder&q=' + q + '&fields=files(id,modifiedTime)&orderBy=modifiedTime desc', {}, token)
      .then(function (r) { return r.json(); })
      .then(function (d) { return (d.files && d.files[0]) || null; });
  }
  function fileInfo(id) {
    return api('drive/v3/files/' + encodeURIComponent(id) + '?fields=id,modifiedTime').then(function (r) { return r.json(); });
  }
  function download(id, token) {
    return api('drive/v3/files/' + encodeURIComponent(id) + '?alt=media', {}, token).then(function (r) { return r.json(); });
  }
  function multipart(name, payload) {
    var boundary = 'fos-' + Date.now();
    return {
      type: 'multipart/related; boundary=' + boundary,
      body: '--' + boundary + '\r\nContent-Type: application/json; charset=UTF-8\r\n\r\n' +
        JSON.stringify({ name: name, parents: ['appDataFolder'], mimeType: 'application/json' }) +
        '\r\n--' + boundary + '\r\nContent-Type: application/json\r\n\r\n' + JSON.stringify(payload) + '\r\n--' + boundary + '--'
    };
  }
  function upload(id, payload, token, keepalive) {
    if (id) {
      return api('upload/drive/v3/files/' + encodeURIComponent(id) + '?uploadType=media&fields=id,modifiedTime', {
        method: 'PATCH', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify(payload), keepalive: !!keepalive
      }, token).then(function (r) { return r.json(); });
    }
    var part = multipart(FILE_NAME, payload);
    return api('upload/drive/v3/files?uploadType=multipart&fields=id,modifiedTime', {
      method: 'POST', headers: { 'Content-Type': part.type }, body: part.body
    }, token).then(function (r) { return r.json(); });
  }
  function archive(payload, token) {
    var part = multipart('freelance-os-archive-' + new Date().toISOString().replace(/[:.]/g, '-') + '.json', payload);
    return api('upload/drive/v3/files?uploadType=multipart&fields=id', {
      method: 'POST', headers: { 'Content-Type': part.type }, body: part.body
    }, token);
  }

  /* ---------- Connexion ---------- */
  function signIn(chooseAccount) {
    var previous = session();
    var granted;
    gateStatus('Connexion à Google…');
    return requestToken(chooseAccount).then(function (response) {
      granted = response;
      return api('oauth2/v3/userinfo', {}, granted.access_token).then(function (r) { return r.json(); });
    }).then(function (user) {
      if (!user.email) throw new Error('Adresse Google introuvable.');
      var token = granted.access_token;
      var sameAccount = previous.email === user.email;
      /* Un appareil partagé ne doit jamais montrer les données du compte précédent. */
      if (previous.email && !sameAccount) { clearLocalData(); write(META_KEY, {}); }
      var m = meta();
      /* Première connexion sur un appareil qui utilisait déjà Freelance OS :
         ses données locales appartiennent à ce premier compte. */
      var local = snapshot();
      var legacyLocal = !previous.email && isUseful(local);
      gateStatus('Chargement de tes données…');
      return findFile(token).then(function (file) {
        var finish = function (info) {
          write(SESSION_KEY, { token: token, expiresAt: Date.now() + (Number(granted.expires_in) || 3600) * 1000, email: user.email, name: user.name || '', picture: user.picture || '' });
          write(META_KEY, { fileId: info && info.id || '', remoteModified: info && info.modifiedTime || '', dirty: false });
          nativeRemove.call(localStorage, LEGACY_META_KEY);
          window.location.reload();
        };
        if (!file) {
          if (legacyLocal || (sameAccount && isUseful(local))) return upload('', local, token).then(finish);
          clearLocalData();
          return finish(null);
        }
        return download(file.id, token).then(function (remote) {
          var unsynced = sameAccount && m.dirty && isUseful(local);
          var remoteUnchanged = m.remoteModified && m.remoteModified === file.modifiedTime;
          if (unsynced && remoteUnchanged) return upload(file.id, local, token).then(finish);
          if ((unsynced || legacyLocal) && isUseful(remote) && JSON.stringify(remote.values) !== JSON.stringify(local.values)) {
            return chooseVersion().then(function (keepDevice) {
              if (keepDevice) return archive(remote, token).then(function () { return upload(file.id, local, token); }).then(finish);
              return archive(local, token).then(function () { restore(remote); finish(file); });
            });
          }
          if (!isUseful(remote) && isUseful(local) && (sameAccount || legacyLocal)) return upload(file.id, local, token).then(finish);
          restore(remote);
          finish(file);
        });
      });
    }).catch(function (error) {
      gateStatus(error.message || 'Connexion impossible.', true);
      throw error;
    });
  }
  function ask(title, text, ok) {
    return window.FOSUI ? window.FOSUI.confirm(title, text, ok, true) : Promise.resolve(window.confirm(title + ' ' + text));
  }
  function notify(text) { if (window.FOSUI && typeof toast === 'function') toast(text); else window.alert(text); }
  function signOut() {
    var done = function () {
      clearLocalData();
      write(META_KEY, {});
      var s = session();
      write(SESSION_KEY, { email: s.email });
      window.location.reload();
    };
    if (!meta().dirty) return done();
    if (!tokenValid(session())) {
      ask('Te déconnecter ?', 'Des modifications ne sont pas encore dans ton Drive : elles seront effacées de cet appareil.', 'Me déconnecter').then(function (ok) { if (ok) done(); });
      return;
    }
    push().then(done, function () {
      ask('Sauvegarde Drive impossible', 'Te déconnecter effacera les dernières modifications de cet appareil.', 'Me déconnecter').then(function (ok) { if (ok) done(); });
    });
  }
  /* Le jeton Google dure une heure. On le renouvelle au premier geste dans l'app,
     sans rechargement : la fenêtre Google s'ouvre et se ferme seule. */
  var renewing = null, renewFailed = false;
  function renew() {
    if (renewing) return renewing;
    var s = session();
    renewing = requestToken(false).then(function (granted) {
      return api('oauth2/v3/userinfo', {}, granted.access_token).then(function (r) { return r.json(); }).then(function (user) {
        if (user.email !== s.email) throw new Error('Autre compte Google');
        write(SESSION_KEY, Object.assign({}, session(), { token: granted.access_token, expiresAt: Date.now() + (Number(granted.expires_in) || 3600) * 1000 }));
        renewFailed = false;
        paintStatus();
        return pull();
      });
    }).then(function () { if (meta().dirty) return push(); }).catch(function () { renewFailed = true; paintStatus(); })
      .then(function () { renewing = null; });
    return renewing;
  }
  function renewOnGesture() {
    if (renewing || renewFailed || document.documentElement.classList.contains('fos-locked')) return;
    var s = session();
    if (s.email && s.token && s.expiresAt < Date.now() + 5 * 60000) renew();
  }
  function expire() {
    var s = session();
    s.expiresAt = 0;
    write(SESSION_KEY, s);
    paintStatus();
  }

  /* ---------- Synchronisation ---------- */
  function push(keepalive) {
    queue = queue.catch(function () {}).then(function () {
      var m = meta();
      if (!m.dirty) return;
      if (!tokenValid(session())) { paintStatus(); throw new Error('Session expirée'); }
      var payload = snapshot();
      setMeta({ syncing: true });
      var check = m.fileId && !keepalive ? fileInfo(m.fileId) : Promise.resolve(null);
      return check.then(function (info) {
        /* Un autre appareil a écrit depuis la dernière synchro : on ne l'écrase pas en silence. */
        if (info && m.remoteModified && info.modifiedTime !== m.remoteModified) return resolveConflict(m.fileId);
        return upload(m.fileId, payload, null, keepalive).then(function (saved) {
          var stillDirty = JSON.stringify(snapshot().values) !== JSON.stringify(payload.values);
          setMeta({ fileId: saved.id, remoteModified: saved.modifiedTime, dirty: stillDirty, syncing: false, error: '' });
          if (stillDirty) schedulePush();
        });
      }).catch(function (error) {
        setMeta({ syncing: false, error: error.message });
        throw error;
      });
    });
    return queue;
  }
  function schedulePush() {
    window.clearTimeout(pushTimer);
    pushTimer = window.setTimeout(function () { push().catch(function () {}); }, 1200);
  }
  function resolveConflict(fileId) {
    return download(fileId).then(function (remote) {
      return chooseVersion().then(function (keepDevice) {
        if (keepDevice) {
          return archive(remote).then(function () { return upload(fileId, snapshot()); }).then(function (saved) {
            setMeta({ remoteModified: saved.modifiedTime, dirty: false, syncing: false, error: '' });
          });
        }
        return archive(snapshot()).then(function () { return fileInfo(fileId); }).then(function (info) {
          restore(remote);
          setMeta({ remoteModified: info.modifiedTime, dirty: false, syncing: false });
          window.location.reload();
        });
      });
    });
  }
  /* Au démarrage, récupère ce qu'un autre appareil a pu enregistrer entre-temps. */
  function pull() {
    var m = meta();
    if (!m.fileId || !tokenValid(session())) return Promise.resolve();
    return fileInfo(m.fileId).then(function (info) {
      if (info.modifiedTime === m.remoteModified) return m.dirty ? push() : null;
      if (m.dirty) return resolveConflict(m.fileId);
      return download(m.fileId).then(function (remote) {
        restore(remote);
        setMeta({ remoteModified: info.modifiedTime, dirty: false });
        window.location.reload();
      });
    }).catch(function (error) { setMeta({ error: error.message }); });
  }
  function installStorageHook() {
    Storage.prototype.setItem = function (key) {
      var result = nativeSet.apply(this, arguments);
      if (!applying && this === localStorage && DATA_KEYS.indexOf(key) !== -1) { setMeta({ dirty: true }); schedulePush(); }
      return result;
    };
    Storage.prototype.removeItem = function (key) {
      var result = nativeRemove.apply(this, arguments);
      if (!applying && this === localStorage && DATA_KEYS.indexOf(key) !== -1) { setMeta({ dirty: true }); schedulePush(); }
      return result;
    };
  }

  /* ---------- Fichiers ---------- */
  function exportFile() {
    var blob = new Blob([JSON.stringify(snapshot(), null, 1)], { type: 'application/json' });
    var link = document.createElement('a');
    link.href = URL.createObjectURL(blob);
    link.download = 'freelance-os-' + new Date().toISOString().slice(0, 10) + '.json';
    link.click();
    window.setTimeout(function () { URL.revokeObjectURL(link.href); }, 1000);
  }
  function importFile(file) {
    var reader = new FileReader();
    reader.onload = function () {
      var payload;
      try { payload = JSON.parse(reader.result); } catch (_) { return notify('Ce fichier n’est pas une sauvegarde Freelance OS.'); }
      if (!isUseful(payload)) return notify('Ce fichier ne contient aucune donnée Freelance OS.');
      ask('Importer ce fichier ?', 'Les données de ce compte seront remplacées. Une archive de la version actuelle est gardée dans ton Drive.', 'Importer').then(function (ok) {
      if (!ok) return;
      var current = snapshot();
      (isUseful(current) && tokenValid(session()) ? archive(current) : Promise.resolve()).then(function () {
        restore(payload);
        setMeta({ dirty: true });
        return push();
      }).then(function () { window.location.reload(); }, function () { window.location.reload(); });
          });
};
    reader.readAsText(file);
  }

  /* ---------- Interface ---------- */
  function style() {
    if (document.getElementById('fos-account-style')) return;
    var node = document.createElement('style');
    node.id = 'fos-account-style';
    node.textContent =
      'html.fos-locked body>*:not(.fos-gate):not(.fos-overlay){visibility:hidden!important}' +
      '.fos-gate{position:fixed;inset:0;z-index:100000;display:grid;place-items:center;padding:20px;background:radial-gradient(circle at 30% 20%,#3a2358 0%,#151626 60%)}' +
      '.fos-gate-card{width:min(400px,100%);padding:34px 28px;border-radius:26px;background:#fff;color:#17162a;text-align:center;box-shadow:0 30px 80px rgba(0,0,0,.35)}' +
      '.fos-gate-card img{width:72px;height:72px;border-radius:18px}.fos-gate-card h1{margin:16px 0 22px;font-size:26px}' +
      '.fos-google{display:inline-flex;align-items:center;justify-content:center;gap:10px;width:100%;min-height:50px;border:1px solid #dadce0;border-radius:14px;background:#fff;color:#1f1f1f;font-size:16px;font-weight:700;cursor:pointer}' +
      '.fos-google:hover{background:#f7f7fb}.fos-gate-status{min-height:20px;margin:14px 0 0;font-size:13px;color:#6f6b7e}.fos-gate-status.error{color:#b33268}' +
      '.fos-gate-switch{margin-top:10px;border:0;background:none;color:#6a5195;font-size:13px;font-weight:700;cursor:pointer}' +
      '.fos-account-trigger{position:relative;width:44px;height:44px;padding:0;border:1px solid #e9dcef;border-radius:14px;background:#fff center/cover;color:#5e53c9;font-size:17px;font-weight:800;cursor:pointer;box-shadow:0 8px 22px rgba(51,35,99,.11)}' +
      '.fos-account-trigger i{position:absolute;right:-3px;bottom:-3px;width:12px;height:12px;border:2px solid #fff;border-radius:50%;background:#2bb8a0}' +
      '.fos-account-trigger.dirty i{background:#e0a100}.fos-account-trigger.error i{background:#e5484d}' +
      '.fos-overlay{position:fixed;inset:0;z-index:100001;display:grid;place-items:center;padding:20px;background:rgba(17,14,34,.48)}' +
      '.fos-panel{width:min(420px,100%);padding:26px;border-radius:24px;background:#fff;color:#17162a;box-shadow:0 30px 80px rgba(0,0,0,.28)}' +
      '.fos-panel h2{margin:0 0 4px;font-size:22px}.fos-panel p{margin:0;color:#6f6b7e;font-size:14px}' +
      '.fos-sync{margin:16px 0;padding:12px 14px;border-radius:12px;background:#e7fbf8;color:#117f80;font-size:14px}.fos-sync.dirty{background:#fff7e0;color:#8a6200}.fos-sync.error{background:#fff0f4;color:#b33268}' +
      '.fos-panel-actions{display:grid;gap:8px}.fos-panel-actions button{min-height:44px;border:0;border-radius:12px;background:#f4eef9;color:#50368c;font-weight:750;cursor:pointer}' +
      '.fos-panel-actions .primary{background:#b865ee;color:#fff}.fos-panel-actions .quiet{background:none;color:#8a8398}' +
      '.fos-banner{position:fixed;left:50%;bottom:calc(16px + env(safe-area-inset-bottom));z-index:99998;transform:translateX(-50%);display:flex;align-items:center;gap:12px;max-width:calc(100% - 32px);padding:10px 12px 10px 16px;border-radius:14px;background:#e5484d;color:#fff;font-size:14px;font-weight:700;box-shadow:0 12px 30px rgba(0,0,0,.25)}' +
      '.fos-banner button{min-height:36px;border:0;border-radius:10px;background:#fff;color:#b3262b;font-weight:800;padding:0 12px;cursor:pointer}';
    document.head.appendChild(node);
  }
  var GOOGLE_G = '<svg width="20" height="20" viewBox="0 0 48 48" aria-hidden="true"><path fill="#FFC107" d="M43.6 20.5H42V20H24v8h11.3C33.7 32.7 29.2 36 24 36c-6.6 0-12-5.4-12-12s5.4-12 12-12c3.1 0 5.8 1.2 7.9 3.1l5.7-5.7C34 6.1 29.3 4 24 4 12.9 4 4 12.9 4 24s8.9 20 20 20 20-8.9 20-20c0-1.3-.1-2.4-.4-3.5z"/><path fill="#FF3D00" d="M6.3 14.7l6.6 4.8C14.7 15.1 19 12 24 12c3.1 0 5.8 1.2 7.9 3.1l5.7-5.7C34 6.1 29.3 4 24 4 16.3 4 9.7 8.3 6.3 14.7z"/><path fill="#4CAF50" d="M24 44c5.2 0 9.9-2 13.4-5.2l-6.2-5.2C29.2 35.1 26.7 36 24 36c-5.2 0-9.6-3.3-11.3-8l-6.5 5C9.5 39.6 16.2 44 24 44z"/><path fill="#1976D2" d="M43.6 20.5H42V20H24v8h11.3c-.8 2.2-2.2 4.2-4.1 5.6l6.2 5.2C37 39.2 44 34 44 24c0-1.3-.1-2.4-.4-3.5z"/></svg>';
  function esc(value) { return String(value || '').replace(/[&<>"']/g, function (c) { return { '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[c]; }); }

  function showGate() {
    style();
    var known = session().email;
    var gate = document.createElement('div');
    gate.className = 'fos-gate';
    gate.innerHTML = '<div class="fos-gate-card"><img src="app-icon-logo-180.png" alt=""><h1>Freelance OS</h1>' +
      '<button class="fos-google" type="button" data-fos-signin>' + GOOGLE_G + '<span>' + (known ? 'Continuer avec ' + esc(known) : 'Se connecter avec Google') + '</span></button>' +
      '<p class="fos-gate-status" data-fos-gate-status></p>' +
      (known ? '<button class="fos-gate-switch" type="button" data-fos-switch>Utiliser un autre compte</button>' : '') + '</div>';
    document.body.appendChild(gate);
    gate.querySelector('[data-fos-signin]').onclick = function () { signIn(false).catch(function () {}); };
    var sw = gate.querySelector('[data-fos-switch]');
    if (sw) sw.onclick = function () { signIn(true).catch(function () {}); };
  }
  function gateStatus(message, error) {
    document.querySelectorAll('[data-fos-gate-status]').forEach(function (node) {
      node.textContent = message;
      node.className = 'fos-gate-status' + (error ? ' error' : '');
    });
  }
  function chooseVersion() {
    return new Promise(function (resolve) {
      style();
      var overlay = document.createElement('div');
      overlay.className = 'fos-overlay';
      overlay.innerHTML = '<section class="fos-panel" role="dialog" aria-modal="true"><h2>Deux versions différentes</h2>' +
        '<p>Cet appareil et ton Drive ont été modifiés séparément. L’autre version est archivée dans ton Drive.</p>' +
        '<div class="fos-panel-actions" style="margin-top:18px"><button class="primary" data-keep="drive">Garder la version Drive</button><button data-keep="device">Garder cet appareil</button></div></section>';
      document.body.appendChild(overlay);
      overlay.querySelectorAll('[data-keep]').forEach(function (button) {
        button.onclick = function () { overlay.remove(); resolve(button.dataset.keep === 'device'); };
      });
    });
  }
  function statusInfo() {
    var m = meta();
    if (!tokenValid(session()) && !renewFailed) return { kind: m.dirty ? 'dirty' : '', text: 'Reconnexion automatique au prochain clic' };
    if (!tokenValid(session())) return { kind: 'error', text: m.dirty ? 'Session expirée · modifications pas encore dans Drive' : 'Session expirée' };
    if (m.error) return { kind: 'error', text: 'Échec de la sauvegarde Drive' };
    if (m.dirty || m.syncing) return { kind: 'dirty', text: 'Sauvegarde en cours…' };
    return { kind: '', text: 'Tout est sauvegardé dans ton Drive' };
  }
  function paintStatus() {
    var info = statusInfo();
    document.querySelectorAll('.fos-account-trigger').forEach(function (node) {
      node.className = 'fos-drive-trigger fos-account-trigger ' + info.kind + (node.style.backgroundImage ? ' has-photo' : '');
      node.title = info.text;
    });
    document.querySelectorAll('[data-fos-sync]').forEach(function (node) {
      node.textContent = info.text;
      node.className = 'fos-sync ' + info.kind;
    });
    var banner = document.querySelector('.fos-banner');
    var expired = document.documentElement.classList.contains('fos-locked') ? false : !tokenValid(session()) && renewFailed;
    if (expired && !banner && document.body) {
      banner = document.createElement('div');
      banner.className = 'fos-banner';
      banner.innerHTML = '<span>Session Google expirée</span><button type="button">Se reconnecter</button>';
      banner.querySelector('button').onclick = function () { renewFailed = false; renew().then(function () { if (renewFailed) signIn(false).catch(function (e) { notify(e.message); }); }); };
      document.body.appendChild(banner);
    } else if (!expired && banner) banner.remove();
  }
  function openPanel() {
    style();
    var s = session();
    var overlay = document.createElement('div');
    overlay.className = 'fos-overlay';
    overlay.innerHTML = '<section class="fos-panel" role="dialog" aria-modal="true"><h2>' + esc(s.name || 'Mon compte') + '</h2><p>' + esc(s.email) + '</p>' +
      '<div data-fos-sync class="fos-sync"></div><div class="fos-panel-actions">' +
      '<button class="primary" data-act="sync">Synchroniser maintenant</button><button data-act="export">Exporter mes données</button>' +
      '<button data-act="activities">Mes activités</button><button data-act="setup">Réglages de départ</button>' + (window.FreelanceOS ? '<button data-act="demo">' + (window.FreelanceOS.isDemo() ? 'Quitter le mode démo' : 'Mode démo') + '</button>' : '') + '<button data-act="import">Importer un fichier</button><button class="quiet" data-act="logout">Se déconnecter</button></div>' +
      '<input type="file" accept="application/json,.json" hidden></section>';
    document.body.appendChild(overlay);
    paintStatus();
    var input = overlay.querySelector('input');
    overlay.addEventListener('click', function (event) { if (event.target === overlay) overlay.remove(); });
    input.onchange = function () { if (input.files[0]) importFile(input.files[0]); };
    overlay.querySelector('[data-act="sync"]').onclick = function () {
      var action = tokenValid(session()) ? (setMeta({ dirty: true }), push()) : signIn(false);
      action.catch(function (e) { notify(e.message); });
    };
    var demo = overlay.querySelector('[data-act="demo"]');
    if (demo) demo.onclick = function () { overlay.remove(); window.FreelanceOS.toggleDemo(); };
    overlay.querySelector('[data-act="activities"]').onclick = function () { overlay.remove(); if (window.FreelanceOS && window.FreelanceOS.openActivities) window.FreelanceOS.openActivities(); };
    overlay.querySelector('[data-act="setup"]').onclick = function () { overlay.remove(); if (window.FreelanceOSOnboarding) window.FreelanceOSOnboarding.open(); };
    overlay.querySelector('[data-act="export"]').onclick = exportFile;
    overlay.querySelector('[data-act="import"]').onclick = function () { input.click(); };
    overlay.querySelector('[data-act="logout"]').onclick = signOut;
  }
  function mountButton() {
    if (document.querySelector('.fos-account-trigger')) return true;
    var target = document.querySelector('#quick-links') || document.querySelector('.quick-links') || document.querySelector('.header-actions') || document.querySelector('.top-actions');
    if (!target) return false;
    var s = session();
    var button = document.createElement('button');
    button.type = 'button';
    button.className = 'fos-drive-trigger fos-account-trigger';
    button.setAttribute('aria-label', 'Mon compte');
    if (s.picture) { button.classList.add('has-photo'); button.style.backgroundImage = 'url("' + s.picture.replace(/"/g, '') + '")'; }
    else button.textContent = (s.name || s.email || '?').charAt(0).toUpperCase();
    button.appendChild(document.createElement('i'));
    button.onclick = openPanel;
    target.appendChild(button);
    paintStatus();
    return true;
  }

  function boot() {
    style();
    if (document.documentElement.classList.contains('fos-locked')) { showGate(); return; }
    installStorageHook();
    if (!mountButton()) { window.setTimeout(mountButton, 400); window.setTimeout(mountButton, 1400); }
    paintStatus();
    pull();
    loadGis().catch(function () {});
    document.addEventListener('pointerdown', renewOnGesture, true);
    document.addEventListener('keydown', renewOnGesture, true);
    /* Quitter l'app ou passer à une autre : on envoie tout de suite ce qui reste. */
    document.addEventListener('visibilitychange', function () {
      if (document.visibilityState === 'hidden' && meta().dirty) { window.clearTimeout(pushTimer); push(true).catch(function () {}); }
      if (document.visibilityState === 'visible') { paintStatus(); pull(); }
    });
    window.setInterval(paintStatus, 60000);
  }

  window.FreelanceOSAccount = {
    email: function () { return session().email || ''; },
    status: statusInfo,
    open: openPanel,
    sync: push,
    signOut: signOut
  };
  if (document.readyState === 'loading') document.addEventListener('DOMContentLoaded', boot);
  else boot();
}());
