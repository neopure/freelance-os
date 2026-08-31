(function () {
  'use strict';

  var BUILD = '2026-08-31-4';
  var CLIENT_ID = '368626541227-mbk5skk95tonks4of8504vl0hfm2jscf.apps.googleusercontent.com';
  var SCOPE = 'https://www.googleapis.com/auth/drive.appdata';
  var FILE_NAME = 'freelance-os-private-state.json';
  var META_KEY = 'freelance-os-drive-sync-meta-v2';
  var DATA_KEYS = ['neopure-finance-v1', 'freelance-os-agenda-previsions-v1'];
  var token = '';
  var saveTimer = 0;
  var mounted = false;

  /* A default/empty state must never win against an actual working copy. */
  function payloadScore(payload) {
    if (!payload || !payload.values) return 0;
    var score = 0;
    try {
      var finance = JSON.parse(payload.values['neopure-finance-v1'] || '{}');
      (finance.months || []).forEach(function (month) {
        Object.keys(month || {}).forEach(function (key) {
          if (key !== 'id' && key !== 'month' && Number(month[key]) !== 0) score += 4;
        });
      });
      score += (finance.fixed || []).length * 3;
      /* An objective alone is only a setting, not a financial history. The
         Bricks screen injects a demonstration seed on first load as well, so
         it must not turn an otherwise empty device into a second version. */
      if (finance.bricks &&
          (Number(finance.bricks.wallet) !== 4082.56 ||
           Number(finance.bricks.deposits) !== 11370 ||
           finance.bricks.lastPeriod !== 'Juillet 2026')) score += 6;
    } catch (_) {}
    try {
      var agenda = JSON.parse(payload.values['freelance-os-agenda-previsions-v1'] || '{}');
      score += (agenda.rules || []).length * 2;
      score += (agenda.events || []).length * 2;
      score += (agenda.manualEvents || []).length * 2;
    } catch (_) {}
    return score;
  }

  function isUseful(payload) { return payloadScore(payload) > 0; }

  function historicalRecovery() {
    var month = function (id, bnc, bic, cdd, sacem, variable, personal) {
      return { id: id, month: id, bnc: bnc, bic: bic, other: 0, cdd: cdd, sacem: sacem, pocket: 0, variable: variable || 0, personal: personal || 0, invest: 0, vatCollected: 0, vatDeduct: 0, lastYear: 0 };
    };
    return {
      goal: 3000,
      vatThreshold: 37500,
      vatActivity: 'services',
      bncTaxRate: 25.6,
      bicTaxRate: 21.2,
      cfpRate: 0.1,
      cciRate: 0.04,
      fixed: [
        { id: 'recovery-capcut', label: 'Capcut Pro', amount: 12, category: 'Abonnement', scope: 'pro', frequency: 'monthly' },
        { id: 'recovery-djcity', label: 'DJ City', amount: 249.96, category: 'Abonnement', scope: 'pro', frequency: 'annual' },
        { id: 'recovery-fuviclan', label: 'Fuviclan', amount: 153, category: 'Abonnement', scope: 'pro', frequency: 'annual' },
        { id: 'recovery-splice', label: 'Splice', amount: 13, category: 'Abonnement', scope: 'pro', frequency: 'monthly' },
        { id: 'recovery-coworking', label: 'Loyer / coworking', amount: 600, category: 'Loyer / coworking', scope: 'perso', frequency: 'monthly' },
        { id: 'recovery-other', label: 'Autre charge fixe', amount: 277.85, category: 'Autre charge fixe', scope: 'perso', frequency: 'monthly' },
        { id: 'recovery-insurance', label: 'Assurances', amount: 105.25, category: 'Assurance', scope: 'perso', frequency: 'monthly' },
        { id: 'recovery-phone', label: 'Téléphonie', amount: 18, category: 'Téléphonie', scope: 'perso', frequency: 'monthly' }
      ],
      months: [
        month('2026-01', 5490, 0, 0, 221.53),
        month('2026-02', 2201, 1200, 0, 0),
        month('2026-03', 1000, 2420, 0, 0),
        month('2026-04', 850, 1650, 398.51, 0.71),
        month('2026-05', 1600, 2600, 0, 206.52),
        month('2026-06', 1800, 3120, 0, 96.28),
        month('2026-07', 2800, 1755, 0, 95.71),
        month('2026-08', 4145, 0, 902.73, 0, 60, 900)
      ]
    };
  }

  function recover2026() {
    var current = snapshot();
    if (isUseful(current)) throw new Error('Une version contient déjà des données : la récupération ne l’écrase pas.');
    var values = {};
    values['neopure-finance-v1'] = JSON.stringify(historicalRecovery());
    values['freelance-os-agenda-previsions-v1'] = localStorage.getItem('freelance-os-agenda-previsions-v1') || JSON.stringify({ rules: [], events: [], manualEvents: [] });
    var recovered = { version: 2, updatedAt: new Date().toISOString(), values: values };
    localStorage.setItem('neopure-finance-v1', values['neopure-finance-v1']);
    localStorage.setItem('freelance-os-agenda-previsions-v1', values['freelance-os-agenda-previsions-v1']);
    setStatus('Historique 2026 reconstitué · sauvegarde Drive…');
    return (token ? Promise.resolve(token) : authorize(false))
      .then(function () { return findFile(); })
      .then(function (file) { return archive(recovered).then(function () { return upload(file && file.id, recovered); }); })
      .then(function (saved) {
        markConnected(saved.id, recovered.updatedAt);
        setStatus('Historique 2026 restauré et sauvegardé dans Drive · actualisation…', 'ok');
        window.setTimeout(function () { window.location.reload(); }, 500);
        return saved;
      })
      .catch(function (error) {
        setStatus(error.message || 'Récupération impossible', 'error');
        throw error;
      });
  }

  function readMeta() {
    try { return JSON.parse(localStorage.getItem(META_KEY) || '{}'); } catch (_) { return {}; }
  }

  function writeMeta(next) {
    localStorage.setItem(META_KEY, JSON.stringify(next));
  }

  function formatDate(value) {
    if (!value) return 'Jamais';
    try {
      return new Intl.DateTimeFormat('fr-FR', { dateStyle: 'medium', timeStyle: 'short' }).format(new Date(value));
    } catch (_) { return value; }
  }

  function setStatus(message, kind) {
    document.querySelectorAll('[data-drive-status]').forEach(function (node) {
      node.textContent = message;
      node.className = 'fos-drive-status ' + (kind || '');
    });
  }

  function snapshot() {
    var values = {};
    DATA_KEYS.forEach(function (key) { values[key] = localStorage.getItem(key); });
    return {
      version: 1,
      updatedAt: new Date().toISOString(),
      values: values
    };
  }

  function restore(payload) {
    if (!payload || !payload.values) throw new Error('Sauvegarde invalide');
    DATA_KEYS.forEach(function (key) {
      var value = payload.values[key];
      if (typeof value === 'string') localStorage.setItem(key, value);
      else localStorage.removeItem(key);
    });
  }

  function loadGis() {
    if (window.google && google.accounts && google.accounts.oauth2) return Promise.resolve();
    return new Promise(function (resolve, reject) {
      var existing = document.querySelector('script[data-fos-gis]');
      if (existing) {
        existing.addEventListener('load', resolve, { once: true });
        existing.addEventListener('error', reject, { once: true });
        return;
      }
      var script = document.createElement('script');
      script.src = 'https://accounts.google.com/gsi/client';
      script.async = true;
      script.defer = true;
      script.dataset.fosGis = 'true';
      script.onload = resolve;
      script.onerror = function () { reject(new Error('Impossible de charger la connexion Google')); };
      document.head.appendChild(script);
    });
  }

  function authorize(silent) {
    return loadGis().then(function () {
      return new Promise(function (resolve, reject) {
        var client = google.accounts.oauth2.initTokenClient({
          client_id: CLIENT_ID,
          scope: SCOPE,
          callback: function (response) {
            if (response && response.access_token) {
              token = response.access_token;
              resolve(token);
            } else {
              reject(new Error((response && response.error) || 'Autorisation Google annulée'));
            }
          },
          error_callback: function (error) {
            reject(new Error((error && error.message) || 'La fenêtre Google n’a pas pu être ouverte'));
          }
        });
        client.requestAccessToken({ prompt: silent ? '' : 'consent' });
      });
    });
  }

  function api(url, options) {
    options = options || {};
    options.headers = Object.assign({}, options.headers || {}, { Authorization: 'Bearer ' + token });
    return fetch('https://www.googleapis.com/drive/v3/' + url, options).then(function (response) {
      if (!response.ok) return response.text().then(function (body) {
        throw new Error('Google Drive (' + response.status + ') ' + body);
      });
      return response;
    });
  }

  function findFile() {
    var query = encodeURIComponent("name='" + FILE_NAME + "' and trashed=false");
    return api('files?spaces=appDataFolder&q=' + query + '&fields=files(id,name,modifiedTime)').then(function (response) {
      return response.json();
    }).then(function (data) {
      return data.files && data.files[0] ? data.files[0] : null;
    });
  }

  function upload(fileId, payload) {
    var body = JSON.stringify(payload || snapshot());
    if (fileId) {
      return fetch('https://www.googleapis.com/upload/drive/v3/files/' + encodeURIComponent(fileId) + '?uploadType=media', {
        method: 'PATCH',
        headers: { Authorization: 'Bearer ' + token, 'Content-Type': 'application/json' },
        body: body
      }).then(function (response) {
        if (!response.ok) throw new Error('Mise à jour Drive impossible');
        return response.json();
      });
    }
    var boundary = 'fos-' + Date.now();
    var multipart = '--' + boundary + '\r\nContent-Type: application/json; charset=UTF-8\r\n\r\n' +
      JSON.stringify({ name: FILE_NAME, parents: ['appDataFolder'], mimeType: 'application/json' }) +
      '\r\n--' + boundary + '\r\nContent-Type: application/json\r\n\r\n' + body +
      '\r\n--' + boundary + '--';
    return fetch('https://www.googleapis.com/upload/drive/v3/files?uploadType=multipart', {
      method: 'POST',
      headers: { Authorization: 'Bearer ' + token, 'Content-Type': 'multipart/related; boundary=' + boundary },
      body: multipart
    }).then(function (response) {
      if (!response.ok) throw new Error('Création de la sauvegarde Drive impossible');
      return response.json();
    });
  }

  function download(fileId) {
    return api('files/' + encodeURIComponent(fileId) + '?alt=media').then(function (response) {
      return response.json();
    });
  }

  function archive(payload) {
    var body = JSON.stringify(payload);
    var boundary = 'fos-archive-' + Date.now();
    var name = 'freelance-os-archive-' + new Date().toISOString().replace(/[:.]/g, '-') + '.json';
    var multipart = '--' + boundary + '\r\nContent-Type: application/json; charset=UTF-8\r\n\r\n' +
      JSON.stringify({ name: name, parents: ['appDataFolder'], mimeType: 'application/json' }) +
      '\r\n--' + boundary + '\r\nContent-Type: application/json\r\n\r\n' + body +
      '\r\n--' + boundary + '--';
    return fetch('https://www.googleapis.com/upload/drive/v3/files?uploadType=multipart', {
      method: 'POST',
      headers: { Authorization: 'Bearer ' + token, 'Content-Type': 'multipart/related; boundary=' + boundary },
      body: multipart
    }).then(function (response) {
      if (!response.ok) throw new Error('Archivage Drive impossible');
      return response.json();
    });
  }

  function markConnected(fileId, savedAt) {
    writeMeta({ connected: true, fileId: fileId || '', lastSavedAt: savedAt || new Date().toISOString() });
  }

  function saveNow(silent) {
    var meta = readMeta();
    setStatus('Synchronisation…');
    return (token ? Promise.resolve(token) : authorize(!!silent))
      .then(function () { return findFile(); })
      .then(function (file) {
        /* On a new device, the Drive copy is the source of truth.  Never
           overwrite it with that device's empty local storage. */
        if (file && !meta.fileId) {
          return download(file.id).then(function (payload) {
            var local = snapshot();
            if (!isUseful(payload) && isUseful(local)) {
              return archive(local).then(function () { return upload(file.id, local); }).then(function (saved) {
                markConnected(saved.id);
                setStatus('Sauvegarde Drive initialisée avec tes données', 'ok');
                return saved;
              });
            }
            if (isUseful(payload) && isUseful(local)) {
              setStatus('Deux versions trouvées : choisis Restaurer ou Mettre cet appareil dans Drive.', 'error');
              return null;
            }
            if (!isUseful(payload) && !isUseful(local)) return recover2026();
            restore(payload);
            markConnected(file.id, payload.updatedAt || new Date().toISOString());
            setStatus('Données Drive chargées · actualisation…', 'ok');
            window.setTimeout(function () { window.location.reload(); }, 350);
            return null;
          });
        }
        return upload((file && file.id) || meta.fileId);
      })
      .then(function (file) {
        if (!file) return file;
        markConnected(file.id);
        setStatus('Sauvegardé dans ton Drive · ' + formatDate(readMeta().lastSavedAt), 'ok');
        return file;
      })
      .catch(function (error) {
        setStatus('Connexion Drive à relancer', 'error');
        throw error;
      });
  }

  function restoreNow() {
    var meta = readMeta();
    setStatus('Recherche de la sauvegarde…');
    return (token ? Promise.resolve(token) : authorize(false))
      .then(function () { return meta.fileId ? { id: meta.fileId } : findFile(); })
      .then(function (file) {
        if (!file) throw new Error('Aucune sauvegarde Freelance OS trouvée dans ce Drive');
        return download(file.id).then(function (payload) { return { file: file, payload: payload }; });
      })
      .then(function (result) {
        if (!isUseful(result.payload)) throw new Error('La sauvegarde Drive est vide : elle ne peut pas remplacer tes données.');
        restore(result.payload);
        markConnected(result.file.id, result.payload.updatedAt || new Date().toISOString());
        setStatus('Données restaurées · actualisation…', 'ok');
        window.setTimeout(function () { window.location.reload(); }, 350);
        return result;
      })
      .catch(function (error) {
        setStatus(error.message || 'Restauration impossible', 'error');
        throw error;
      });
  }

  function overwriteDrive() {
    setStatus('Sauvegarde de cet appareil…');
    return (token ? Promise.resolve(token) : authorize(false))
      .then(function () { return findFile(); })
      .then(function (file) {
        var local = snapshot();
        if (!isUseful(local)) throw new Error('Cet appareil ne contient pas encore de données à sauvegarder.');
        return archive(local).then(function () { return upload(file && file.id, local); });
      })
      .then(function (file) {
        markConnected(file.id);
        setStatus('Cet appareil est maintenant la référence Drive', 'ok');
        return file;
      })
      .catch(function (error) {
        setStatus(error.message || 'Sauvegarde impossible', 'error');
        throw error;
      });
  }

  function connect() {
    setStatus('Connexion à Google Drive…');
    return authorize(false).then(function () {
      return findFile();
    }).then(function (file) {
      if (file) {
        return download(file.id).then(function (payload) {
          var local = snapshot();
          if (!isUseful(payload) && isUseful(local)) {
            return archive(local).then(function () { return upload(file.id, local); }).then(function (saved) {
              markConnected(saved.id);
              setStatus('Drive initialisé avec tes données', 'ok');
              return saved;
            });
          }
          if (isUseful(payload) && isUseful(local)) {
            setStatus('Deux versions trouvées : choisis Restaurer ou Mettre cet appareil dans Drive.', 'error');
            return null;
          }
          if (!isUseful(payload) && !isUseful(local)) return recover2026();
          if (!isUseful(payload)) throw new Error('La sauvegarde Drive est vide. Ajoute ou restaure tes données avant de la connecter.');
          restore(payload);
          markConnected(file.id, payload.updatedAt || new Date().toISOString());
          setStatus('Données Drive restaurées · actualisation…', 'ok');
          window.setTimeout(function () { window.location.reload(); }, 350);
        });
      }
      var local = snapshot();
      if (!isUseful(local)) return recover2026();
      return archive(local).then(function () { return upload(file && file.id, local); }).then(function (saved) {
        markConnected(saved.id);
        setStatus('Drive connecté · sauvegarde automatique activée', 'ok');
      });
    }).catch(function (error) {
      setStatus(error.message || 'Connexion annulée', 'error');
      throw error;
    });
  }

  function scheduleSave() {
    var meta = readMeta();
    if (!meta.connected) return;
    window.clearTimeout(saveTimer);
    saveTimer = window.setTimeout(function () {
      saveNow(true).catch(function () {});
    }, 1600);
  }

  function installStorageHook() {
    var originalSet = Storage.prototype.setItem;
    var originalRemove = Storage.prototype.removeItem;
    if (Storage.prototype.__fosDriveHooked) return;
    Storage.prototype.__fosDriveHooked = true;
    Storage.prototype.setItem = function (key, value) {
      var result = originalSet.apply(this, arguments);
      if (this === localStorage && DATA_KEYS.indexOf(key) !== -1) scheduleSave();
      return result;
    };
    Storage.prototype.removeItem = function (key) {
      var result = originalRemove.apply(this, arguments);
      if (this === localStorage && DATA_KEYS.indexOf(key) !== -1) scheduleSave();
      return result;
    };
  }

  function style() {
    if (document.getElementById('fos-drive-style')) return;
    var node = document.createElement('style');
    node.id = 'fos-drive-style';
    node.textContent = '.fos-drive-trigger{width:44px;height:44px;border:1px solid #e9dcef;border-radius:14px;background:#fff;color:#5e53c9;font-size:20px;font-weight:800;cursor:pointer;box-shadow:0 8px 22px rgba(51,35,99,.11)}.fos-drive-trigger:hover{transform:translateY(-2px);box-shadow:0 12px 28px rgba(51,35,99,.18)}.fos-drive-overlay{position:fixed;inset:0;background:rgba(17,14,34,.48);display:grid;place-items:center;z-index:99999;padding:20px}.fos-drive-modal{width:min(470px,100%);background:#fff;border-radius:24px;padding:28px;color:#17162a;box-shadow:0 30px 80px rgba(0,0,0,.28)}.fos-drive-modal h2{margin:0 0 8px;font-size:25px}.fos-drive-modal p{line-height:1.5;color:#6f6b7e}.fos-drive-status{margin:18px 0;padding:12px 14px;background:#f5f0f8;border-radius:12px;font-size:14px;color:#625d70}.fos-drive-status.ok{background:#e7fbf8;color:#117f80}.fos-drive-status.error{background:#fff0f4;color:#b33268}.fos-drive-actions{display:flex;gap:10px;flex-wrap:wrap}.fos-drive-actions button{border:0;border-radius:12px;padding:12px 14px;font-weight:750;cursor:pointer;background:#f4eef9;color:#50368c}.fos-drive-actions .primary{background:#b865ee;color:#fff}.fos-drive-close{float:right;background:none!important;font-size:24px!important;padding:0!important;color:#5c5767!important}';
    node.textContent += '.fos-drive-reference{display:block;width:100%;margin-top:12px;border:1px solid #e6d8ef;border-radius:12px;padding:12px 14px;background:#fff;color:#6a5195;font-size:12px;font-weight:750;cursor:pointer}.fos-drive-note{display:block;margin-top:8px;color:#81778d;line-height:1.4;font-size:11px}';
    document.head.appendChild(node);
  }

  function openModal() {
    style();
    var old = document.querySelector('.fos-drive-overlay');
    if (old) old.remove();
    var meta = readMeta();
    var overlay = document.createElement('div');
    overlay.className = 'fos-drive-overlay';
    overlay.innerHTML = '<section class="fos-drive-modal" role="dialog" aria-modal="true"><button class="fos-drive-close" aria-label="Fermer">×</button><h2>Google Drive</h2><p>Privé · ' + (meta.connected ? 'connecté' : 'non connecté') + '</p><div data-drive-status class="fos-drive-status">' + (meta.connected ? 'Dernière sauvegarde · ' + formatDate(meta.lastSavedAt) : 'Connecte ton compte pour commencer.') + '</div><div class="fos-drive-actions"><button class="primary" data-drive-connect>' + (meta.connected ? 'Vérifier Drive' : 'Connecter Google Drive') + '</button><button data-drive-save>Synchroniser</button><button data-drive-restore>Restaurer</button></div><button class="fos-drive-reference" data-drive-overwrite>Remplacer Drive avec cet appareil</button><small class="fos-drive-note">Une archive est créée avant chaque remplacement.</small></section>';
    document.body.appendChild(overlay);
    overlay.querySelector('.fos-drive-close').onclick = function () { overlay.remove(); };
    overlay.addEventListener('click', function (event) { if (event.target === overlay) overlay.remove(); });
    overlay.querySelector('[data-drive-connect]').onclick = function () { connect().catch(function () {}); };
    overlay.querySelector('[data-drive-save]').onclick = function () { saveNow(false).catch(function () {}); };
    overlay.querySelector('[data-drive-restore]').onclick = function () {
      if (window.confirm('Les données locales seront remplacées par la sauvegarde Drive. Continuer ?')) restoreNow().catch(function () {});
    };
    overlay.querySelector('[data-drive-overwrite]').onclick = function () {
      if (window.confirm('Cette sauvegarde remplacera la version actuellement sur Drive. Utiliser les données de cet appareil comme référence ?')) overwriteDrive().catch(function () {});
    };
  }

  function mountButton() {
    if (mounted) return;
    var target = document.querySelector('#quick-links') || document.querySelector('.quick-links') || document.querySelector('.header-actions') || document.querySelector('.top-actions');
    if (!target) return;
    mounted = true;
    style();
    var button = document.createElement('button');
    button.type = 'button';
    button.className = 'fos-drive-trigger';
    button.dataset.driveOpen = 'true';
    button.title = 'Sauvegarde Google Drive';
    button.setAttribute('aria-label', 'Sauvegarde Google Drive');
    button.textContent = '☁';
    button.onclick = openModal;
    target.appendChild(button);
  }

  function boot() {
    installStorageHook();
    mountButton();
    window.setTimeout(mountButton, 400);
    window.setTimeout(mountButton, 1400);
  }

  window.FreelanceOSDrive = {
    build: BUILD,
    open: openModal,
    connect: connect,
    sync: function () { return saveNow(false); },
    restore: restoreNow,
    useThisDevice: overwriteDrive,
    status: function () { return readMeta(); }
  };
  if (document.readyState === 'loading') document.addEventListener('DOMContentLoaded', boot);
  else boot();
}());
