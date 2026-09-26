/* Freelance OS · petites fenêtres dans la DA de l'app :
   choix du mois, calendrier, boutons segmentés et confirmations.
   Aucun sélecteur natif du navigateur n'apparaît à l'écran. */
(function () {
  'use strict';

  var MONTHS = ['janv.', 'févr.', 'mars', 'avr.', 'mai', 'juin', 'juil.', 'août', 'sept.', 'oct.', 'nov.', 'déc.'];
  var DAYS = ['L', 'M', 'M', 'J', 'V', 'S', 'D'];
  var pad = function (n) { return String(n).padStart(2, '0'); };
  var mobile = function () { return window.matchMedia('(max-width:760px)').matches; };
  function esc(v) { return String(v == null ? '' : v).replace(/[&<>"']/g, function (c) { return { '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[c]; }); }
  function label(key) {
    if (!key) return 'Choisir';
    var s = new Date(+key.slice(0, 4), +key.slice(5, 7) - 1, 1).toLocaleDateString('fr-FR', { month: 'long', year: 'numeric' });
    return s.charAt(0).toUpperCase() + s.slice(1);
  }
  function dateLabel(value) {
    if (!value) return 'Choisir une date';
    return new Date(value + 'T12:00:00').toLocaleDateString('fr-FR', { weekday: 'short', day: 'numeric', month: 'long', year: 'numeric' });
  }

  /* ---------- Fenêtre flottante ---------- */
  var current = null;
  function closePop() {
    if (!current) return;
    current.el.remove();
    document.removeEventListener('pointerdown', current.outside, true);
    document.removeEventListener('keydown', current.key, true);
    current = null;
  }
  function openPop(anchor, html, onMount) {
    closePop();
    var el = document.createElement('div');
    el.className = 'pop' + (mobile() ? ' pop-sheet' : '');
    el.innerHTML = html;
    document.body.appendChild(el);
    if (!mobile()) {
      var r = anchor.getBoundingClientRect(), w = el.offsetWidth, h = el.offsetHeight;
      /* Centrée sous le bouton, sans sortir de l'écran. */
      var left = Math.min(Math.max(8, r.left + r.width / 2 - w / 2), window.innerWidth - w - 8);
      var top = r.bottom + 6;
      if (top + h > window.innerHeight - 8) top = Math.max(8, r.top - h - 6);
      el.style.left = left + 'px'; el.style.top = top + 'px';
    }
    var outside = function (e) { if (!el.contains(e.target) && !anchor.contains(e.target)) closePop(); };
    var key = function (e) { if (e.key === 'Escape') { e.stopPropagation(); closePop(); } };
    setTimeout(function () { document.addEventListener('pointerdown', outside, true); }, 0);
    document.addEventListener('keydown', key, true);
    current = { el: el, outside: outside, key: key };
    onMount(el);
    return el;
  }

  /* ---------- Choix du mois ---------- */
  function pickMonth(anchor, opts) {
    var value = opts.value || '';
    var year = Number((value || new Date().toISOString()).slice(0, 4));
    var allowed = opts.allowed || function () { return true; };
    var paint = function (el) {
      el.innerHTML = '<div class="pop-head"><button type="button" class="pop-nav" data-y="-1" aria-label="Année précédente">‹</button><b>' + year + '</b><button type="button" class="pop-nav" data-y="1" aria-label="Année suivante">›</button></div>' +
        '<div class="pop-months">' + MONTHS.map(function (m, i) {
          var key = year + '-' + pad(i + 1), ok = allowed(key);
          return '<button type="button" data-key="' + key + '" class="' + (key === value ? 'on ' : '') + (ok ? '' : 'off') + '"' + (ok ? '' : ' disabled') + '>' + m + '</button>';
        }).join('') + '</div>' +
        (opts.today !== false ? '<div class="pop-foot"><button type="button" class="link" data-today>Ce mois</button></div>' : '');
    };
    openPop(anchor, '', function (el) {
      paint(el);
      el.addEventListener('click', function (e) {
        var nav = e.target.closest('[data-y]');
        if (nav) { year += Number(nav.dataset.y); paint(el); return; }
        var m = e.target.closest('[data-key]');
        var t = e.target.closest('[data-today]');
        var key = m ? m.dataset.key : t ? new Date().toISOString().slice(0, 7) : null;
        if (key && allowed(key)) { closePop(); opts.onPick(key); }
      });
    });
  }

  /* ---------- Calendrier ---------- */
  function pickDate(anchor, opts) {
    var value = opts.value || '';
    var base = value ? new Date(value + 'T12:00:00') : new Date();
    var y = base.getFullYear(), m = base.getMonth();
    var today = new Date(); var todayKey = today.getFullYear() + '-' + pad(today.getMonth() + 1) + '-' + pad(today.getDate());
    var paint = function (el) {
      var first = new Date(y, m, 1), offset = (first.getDay() + 6) % 7, days = new Date(y, m + 1, 0).getDate();
      var cells = '';
      for (var i = 0; i < offset; i++) cells += '<span></span>';
      for (var d = 1; d <= days; d++) {
        var key = y + '-' + pad(m + 1) + '-' + pad(d);
        cells += '<button type="button" data-date="' + key + '" class="' + (key === value ? 'on ' : '') + (key === todayKey ? 'today' : '') + '">' + d + '</button>';
      }
      el.innerHTML = '<div class="pop-head"><button type="button" class="pop-nav" data-m="-1" aria-label="Mois précédent">‹</button><b>' + label(y + '-' + pad(m + 1)) + '</b><button type="button" class="pop-nav" data-m="1" aria-label="Mois suivant">›</button></div>' +
        '<div class="pop-days">' + DAYS.map(function (x) { return '<i>' + x + '</i>'; }).join('') + cells + '</div>' +
        '<div class="pop-foot"><button type="button" class="link" data-date="' + todayKey + '">Aujourd’hui</button></div>';
    };
    openPop(anchor, '', function (el) {
      paint(el);
      el.addEventListener('click', function (e) {
        var nav = e.target.closest('[data-m]');
        if (nav) { m += Number(nav.dataset.m); if (m < 0) { m = 11; y--; } if (m > 11) { m = 0; y++; } paint(el); return; }
        var d = e.target.closest('[data-date]');
        if (d) { closePop(); opts.onPick(d.dataset.date); }
      });
    });
  }

  /* ---------- Champs de formulaire ---------- */
  function monthField(name, labelText, value, full) {
    return '<div class="field' + (full ? ' full' : '') + '"><label>' + labelText + '</label><input type="hidden" name="' + name + '" value="' + esc(value) + '">' +
      '<button type="button" class="picker" data-pick="month" data-for="' + name + '">' + esc(label(value)) + '<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round"><rect x="3" y="4" width="18" height="17" rx="3"/><path d="M3 9h18M8 2v4M16 2v4"/></svg></button></div>';
  }
  function dateField(name, labelText, value, full) {
    return '<div class="field' + (full ? ' full' : '') + '"><label>' + labelText + '</label><input type="hidden" name="' + name + '" value="' + esc(value) + '">' +
      '<button type="button" class="picker" data-pick="date" data-for="' + name + '">' + esc(dateLabel(value)) + '<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round"><rect x="3" y="4" width="18" height="17" rx="3"/><path d="M3 9h18M8 2v4M16 2v4"/></svg></button></div>';
  }
  function segField(name, labelText, options, value, full) {
    return '<div class="field' + (full ? ' full' : '') + '"><label>' + labelText + '</label><input type="hidden" name="' + name + '" value="' + esc(value) + '"><div class="segmented" data-seg="' + name + '">' +
      options.map(function (o) { return '<button type="button" data-v="' + esc(o[0]) + '" class="' + (String(o[0]) === String(value) ? 'on' : '') + '">' + esc(o[1]) + '</button>'; }).join('') + '</div></div>';
  }
  function setField(form, name, value) {
    var input = form.elements[name];
    input.value = value;
    input.dispatchEvent(new Event('input', { bubbles: true }));
    input.dispatchEvent(new Event('change', { bubbles: true }));
  }
  document.addEventListener('click', function (e) {
    var p = e.target.closest('[data-pick]');
    if (p) {
      var form = p.closest('form'), name = p.dataset.for;
      if (p.dataset.pick === 'month') pickMonth(p, { value: form.elements[name].value, onPick: function (k) { setField(form, name, k); p.firstChild.nodeValue = label(k); } });
      else pickDate(p, { value: form.elements[name].value, onPick: function (d) { setField(form, name, d); p.firstChild.nodeValue = dateLabel(d); } });
      return;
    }
    var s = e.target.closest('[data-seg] button');
    if (s) {
      var group = s.parentElement, f = group.closest('form');
      group.querySelectorAll('button').forEach(function (b) { b.classList.toggle('on', b === s); });
      if (f) setField(f, group.dataset.seg, s.dataset.v);
    }
  });

  /* ---------- Confirmation ---------- */
  function confirmBox(title, text, okLabel, danger) {
    return new Promise(function (resolve) {
      closePop();
      var modal = document.createElement('div');
      modal.className = 'modal confirm-modal';
      modal.innerHTML = '<div class="sheet confirm" role="alertdialog" aria-modal="true"><h2>' + esc(title) + '</h2>' + (text ? '<p>' + esc(text) + '</p>' : '') +
        '<div class="confirm-actions"><button type="button" class="btn ghost" data-no>Annuler</button><button type="button" class="btn' + (danger ? ' danger-solid' : '') + '" data-yes>' + esc(okLabel || 'Confirmer') + '</button></div></div>';
      document.body.appendChild(modal);
      var done = function (v) { modal.remove(); document.removeEventListener('keydown', key, true); resolve(v); };
      var key = function (e) { if (e.key === 'Escape') { e.stopPropagation(); done(false); } if (e.key === 'Enter') { e.preventDefault(); done(true); } };
      document.addEventListener('keydown', key, true);
      modal.addEventListener('click', function (e) { if (e.target === modal || e.target.closest('[data-no]')) done(false); if (e.target.closest('[data-yes]')) done(true); });
      modal.querySelector('[data-yes]').focus();
    });
  }

  window.FOSUI = { pickMonth: pickMonth, pickDate: pickDate, monthField: monthField, dateField: dateField, segField: segField, confirm: confirmBox, close: closePop, monthLabel: label };
}());
