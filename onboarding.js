/* Premier lancement d'un compte : quelques questions remplissent les réglages
   de l'app. Chaque réponse reste modifiable ensuite, dans l'app ou en rouvrant
   ce questionnaire depuis « Mon compte ». */
(function () {
  'use strict';

  var CHARGES = [
    { key: 'rent', label: 'Loyer / coworking', category: 'Loyer / coworking', scope: 'pro' },
    { key: 'phone', label: 'Téléphone & internet', category: 'Téléphonie', scope: 'pro' },
    { key: 'insurance', label: 'Assurances', category: 'Assurance', scope: 'pro' },
    { key: 'software', label: 'Logiciels & abonnements', category: 'Abonnement', scope: 'pro' },
    { key: 'accounting', label: 'Comptabilité', category: 'Comptabilité', scope: 'pro' }
  ];
  var RATES = { bnc: 25.6, bic: 21.2 };
  var THRESHOLDS = { services: 37500, sales: 85000 };

  function ready() { return typeof state !== 'undefined' && typeof save === 'function' && typeof render === 'function'; }
  function isNewAccount() {
    if (state.onboardingDone) return false;
    var hasMonth = (state.months || []).some(function (m) {
      return ['bnc', 'bic', 'cdd', 'sacem', 'variable', 'personal', 'invest'].some(function (k) { return Number(m[k]) > 0; });
    });
    return !hasMonth && !(state.fixed || []).length;
  }
  function num(value) { var n = Number(String(value || '').replace(',', '.')); return Number.isFinite(n) && n > 0 ? n : 0; }
  function esc(value) { return String(value == null ? '' : value).replace(/[&<>"']/g, function (c) { return { '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[c]; }); }

  function style() {
    if (document.getElementById('fos-onboarding-style')) return;
    var node = document.createElement('style');
    node.id = 'fos-onboarding-style';
    node.textContent =
      '.fos-ob{position:fixed;inset:0;z-index:99990;display:grid;place-items:center;padding:16px;background:rgba(17,14,34,.55)}' +
      '.fos-ob-card{width:min(480px,100%);max-height:calc(100dvh - 32px);overflow:auto;padding:26px;border-radius:24px;background:#fff;color:#17162a;box-shadow:0 30px 80px rgba(0,0,0,.3)}' +
      '.fos-ob-dots{display:flex;gap:6px;margin-bottom:18px}.fos-ob-dots i{flex:1;height:4px;border-radius:4px;background:#eee7f4}.fos-ob-dots i.on{background:#b865ee}' +
      '.fos-ob h2{margin:0 0 16px;font-size:22px}.fos-ob-step{display:none}.fos-ob-step.on{display:block}' +
      '.fos-ob-choice{display:flex;align-items:center;gap:12px;min-height:52px;margin-bottom:8px;padding:0 14px;border:1px solid #e6dcef;border-radius:14px;font-weight:700;cursor:pointer}' +
      '.fos-ob-choice:has(input:checked){border-color:#b865ee;background:#faf5ff}.fos-ob-choice input{width:18px;height:18px;accent-color:#b865ee}' +
      '.fos-ob-choice small{display:block;font-weight:500;color:#7a7288}' +
      '.fos-ob label.fos-ob-field{display:block;margin-bottom:12px;font-size:13px;font-weight:700;color:#5e5870}' +
      '.fos-ob-field input,.fos-ob-row input,.fos-ob-row select{width:100%;min-height:46px;margin-top:6px;padding:0 12px;border:1px solid #e1d8ea;border-radius:12px;font:inherit;font-size:16px;color:#17162a;background:#fff;box-sizing:border-box}' +
      '.fos-ob-row{display:grid;grid-template-columns:1fr 96px 116px;gap:8px;align-items:center;margin-bottom:8px;font-size:14px;font-weight:700}.fos-ob-row input,.fos-ob-row select{margin:0}' +
      '.fos-ob-nav{display:flex;gap:8px;margin-top:20px}.fos-ob-nav button{flex:1;min-height:48px;border:0;border-radius:14px;font-weight:800;font-size:15px;cursor:pointer;background:#f4eef9;color:#50368c}' +
      '.fos-ob-nav .primary{background:#b865ee;color:#fff}.fos-ob-skip{display:block;margin:12px auto 0;border:0;background:none;color:#8a8398;font-size:13px;font-weight:700;cursor:pointer}' +
      '@media(max-width:420px){.fos-ob-row{grid-template-columns:1fr 84px 96px}.fos-ob-row select{padding:0 8px}}';
    document.head.appendChild(node);
  }

  function open() {
    if (!ready() || document.querySelector('.fos-ob')) return;
    style();
    var first = !state.onboardingDone;
    var fixedById = {};
    (state.fixed || []).forEach(function (f) { fixedById[f.id] = f; });
    var rows = CHARGES.map(function (c) {
      var f = fixedById['setup-' + c.key] || {};
      var scope = f.scope || c.scope;
      return '<div class="fos-ob-row"><span>' + esc(c.label) + '</span><input name="charge-' + c.key + '" inputmode="decimal" placeholder="0 €" value="' + (f.amount || '') + '">' +
        '<input type="hidden" name="scope-' + c.key + '" value="' + scope + '"><div class="segmented small" data-seg="scope-' + c.key + '"><button type="button" data-v="pro" class="' + (scope === 'pro' ? 'on' : '') + '">Pro</button><button type="button" data-v="perso" class="' + (scope === 'perso' ? 'on' : '') + '">Perso</button></div></div>';
    }).join('');
    var overlay = document.createElement('div');
    overlay.className = 'fos-ob';
    overlay.innerHTML = '<form class="fos-ob-card" novalidate><div class="fos-ob-dots"><i></i><i></i><i></i><i></i></div>' +
      '<section class="fos-ob-step"><h2>Tes activités</h2><p class="sheet-note">Nomme chaque activité et choisis la case où tu la déclares. Elles apparaîtront dans la saisie de chaque mois.</p>' + activityEditor(state.activities) + '</section>' +
      '<section class="fos-ob-step"><h2>La TVA</h2>' +
        '<label class="fos-ob-choice"><input type="radio" name="vat" value="no"' + (!state.vatEnabled ? ' checked' : '') + '><span>Je ne facture pas la TVA<small>Franchise en base</small></span></label>' +
        '<label class="fos-ob-choice"><input type="radio" name="vat" value="yes"' + (state.vatEnabled ? ' checked' : '') + '><span>Je facture la TVA</span></label></section>' +
      '<section class="fos-ob-step"><h2>Tes objectifs</h2>' +
        '<label class="fos-ob-field">Revenu mensuel visé (€)<input name="monthly" inputmode="decimal" placeholder="3 000" value="' + (state.monthlyGoal ? Math.round(state.monthlyGoal) : '') + '"></label>' +
        '<label class="fos-ob-field">Chiffre d’affaires de l’an dernier (€)<input name="n1" inputmode="decimal" placeholder="Facultatif" value="' + (state.n1AnnualRevenue || '') + '"></label>' +
        '</section>' +
      '<section class="fos-ob-step"><h2>Tes charges fixes mensuelles</h2>' + rows + '</section>' +
      '<div class="fos-ob-nav"><button type="button" data-ob-back>Retour</button><button type="button" class="primary" data-ob-next>Suivant</button></div>' +
      (first ? '<button type="button" class="fos-ob-skip" data-ob-skip>Plus tard</button>' : '<button type="button" class="fos-ob-skip" data-ob-skip>Fermer</button>') + '</form>';
    document.body.appendChild(overlay);

    var form = overlay.querySelector('form');
    var steps = form.querySelectorAll('.fos-ob-step');
    var dots = form.querySelectorAll('.fos-ob-dots i');
    var back = form.querySelector('[data-ob-back]');
    var next = form.querySelector('[data-ob-next]');
    var index = 0;
    bindActivityEditor(form);
    function show(i) {
      index = i;
      steps.forEach(function (s, n) { s.classList.toggle('on', n === i); });
      dots.forEach(function (d, n) { d.classList.toggle('on', n <= i); });
      back.style.visibility = i ? 'visible' : 'hidden';
      next.textContent = i === steps.length - 1 ? 'Terminer' : 'Suivant';
    }
    show(0);
    back.onclick = function () { show(Math.max(0, index - 1)); };
    next.onclick = function () {
      if (index < steps.length - 1) return show(index + 1);
      apply(form);
      overlay.remove();
    };
    form.querySelector('[data-ob-skip]').onclick = function () {
      if (!state.onboardingDone) { state.onboardingDone = true; save(); }
      overlay.remove();
    };
  }

  function apply(form) {
    var list = readActivities(form);
    var hasBnc = !list.length || list.some(function (a) { return a.kind === 'bnc'; }), hasBic = list.some(function (a) { return a.kind === 'bic'; });
    applyActivities(list);
    /* Les taux ne sont remis à leur valeur type que si l'activité change : un taux ajusté à la main est conservé. */
    state.bncTaxRate = hasBnc ? (state.bncTaxRate > 0 ? state.bncTaxRate : RATES.bnc) : 0;
    state.bicTaxRate = hasBic ? (state.bicTaxRate > 0 ? state.bicTaxRate : RATES.bic) : 0;
    var activity = hasBic && !hasBnc ? 'sales' : 'services';
    if (activity !== state.vatActivity || !state.onboardingDone) { state.vatActivity = activity; state.vatThreshold = THRESHOLDS[activity]; }
    state.vatEnabled = (form.querySelector('[name=vat]:checked') || {}).value === 'yes';
    state.monthlyGoal = num(form.monthly.value);
    state.goal = state.monthlyGoal * 12;
    state.n1AnnualRevenue = num(form.n1.value);
    CHARGES.forEach(function (c) {
      var id = 'setup-' + c.key, amount = num(form['charge-' + c.key].value), scope = form['scope-' + c.key].value;
      var existing = state.fixed.find(function (f) { return f.id === id; });
      if (!amount) { state.fixed = state.fixed.filter(function (f) { return f.id !== id; }); return; }
      if (existing) Object.assign(existing, { amount: amount, scope: scope });
      else state.fixed.push({ id: id, label: c.label, amount: amount, category: c.category, scope: scope, frequency: 'monthly' });
    });
    state.onboardingDone = true;
    save();
    render();
  }

  window.FreelanceOSOnboarding = { open: open };
  function boot() {
    if (document.documentElement.classList.contains('fos-locked') || !ready()) return;
    if (isNewAccount()) window.setTimeout(open, 300);
  }
  if (document.readyState === 'complete') boot();
  else window.addEventListener('load', boot);
}());
