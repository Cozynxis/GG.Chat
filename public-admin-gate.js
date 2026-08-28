/* GG.Chat temporary public admin gate.
   IMPORTANT: this is intentionally NOT secure. Anyone can inspect frontend source.
   The real database admin RPCs remain protected separately.
*/
(() => {
  'use strict';

  const cfg = window.GG_CONFIG || {};
  const PASSWORD = String(cfg.PUBLIC_ADMIN_PASSWORD || '');
  const SESSION_KEY = 'gg_public_admin_unlocked';

  const $ = (s, root = document) => root.querySelector(s);

  function icons(root = document) {
    try { window.lucide?.createIcons({}, root); }
    catch { try { window.lucide?.createIcons(); } catch {} }
  }

  function toast(message, type = '') {
    const host = $('#toastHost') || document.body;
    const el = document.createElement('div');
    el.className = `toast ${type}`;
    el.textContent = message;
    host.appendChild(el);
    setTimeout(() => el.remove(), 3200);
  }

  function mountButton() {
    if ($('#ggPublicAdminNav')) return;
    const profile = $('.main-nav [data-route="profile"]');
    if (!profile) return setTimeout(mountButton, 350);

    const btn = document.createElement('button');
    btn.id = 'ggPublicAdminNav';
    btn.type = 'button';
    btn.className = 'nav-item gg-admin-nav visible';
    btn.innerHTML = '<i data-lucide="shield"></i><span>Admin Panel</span><b class="admin-dot"></b>';
    btn.addEventListener('click', openGate);
    profile.insertAdjacentElement('afterend', btn);
    icons(btn);
  }

  function openGate() {
    if (sessionStorage.getItem(SESSION_KEY) === '1') {
      return triggerRealAdmin();
    }

    document.querySelector('.gg-public-admin-overlay')?.remove();
    const overlay = document.createElement('div');
    overlay.className = 'gg-admin-lock-overlay gg-public-admin-overlay';
    overlay.innerHTML = `
      <form class="gg-admin-lock" id="ggPublicAdminForm">
        <div class="gg-admin-lock-icon"><i data-lucide="key-round"></i></div>
        <h2>Admin Panel</h2>
        <p>Voer het tijdelijke admin-wachtwoord in om verder te gaan.</p>
        <label>Wachtwoord
          <input id="ggPublicAdminPassword" type="password" autocomplete="off" placeholder="Admin-wachtwoord" required autofocus>
        </label>
        <div class="gg-admin-lock-actions">
          <button type="button" class="gg-admin-btn" id="ggPublicAdminCancel">Annuleren</button>
          <button type="submit" class="gg-admin-btn primary"><i data-lucide="unlock"></i> Open Admin Panel</button>
        </div>
        <p class="gg-admin-security-note"><i data-lucide="triangle-alert"></i> Tijdelijke testmodus: dit wachtwoord staat in de publieke frontend en is dus niet geschikt voor productie.</p>
      </form>`;
    document.body.appendChild(overlay);
    icons(overlay);

    $('#ggPublicAdminCancel', overlay).onclick = () => overlay.remove();
    overlay.addEventListener('mousedown', e => { if (e.target === overlay) overlay.remove(); });
    $('#ggPublicAdminForm', overlay).onsubmit = e => {
      e.preventDefault();
      const value = $('#ggPublicAdminPassword', overlay).value;
      if (!PASSWORD || value !== PASSWORD) {
        $('#ggPublicAdminPassword', overlay).value = '';
        $('#ggPublicAdminPassword', overlay).focus();
        return toast('Onjuist admin-wachtwoord.', 'error');
      }
      sessionStorage.setItem(SESSION_KEY, '1');
      overlay.remove();
      toast('Admin Panel ontgrendeld.');
      triggerRealAdmin();
    };
  }

  function triggerRealAdmin() {
    // The existing admin.js remains responsible for privileged database actions.
    // If its button exists, use it. Otherwise show a clear message instead of silently failing.
    const real = $('#ggAdminNav');
    if (real) {
      real.click();
      return;
    }

    document.querySelector('.gg-public-admin-info')?.remove();
    const overlay = document.createElement('div');
    overlay.className = 'gg-admin-lock-overlay gg-public-admin-info';
    overlay.innerHTML = `
      <div class="gg-admin-lock">
        <div class="gg-admin-lock-icon"><i data-lucide="shield-check"></i></div>
        <h2>Frontend ontgrendeld</h2>
        <p>De simpele openbare wachtwoordlaag is goedgekeurd. Voor echte beheeracties moet je huidige account nog database-adminrechten hebben.</p>
        <div class="gg-admin-lock-actions">
          <button class="gg-admin-btn primary" id="ggPublicAdminClose">Sluiten</button>
        </div>
      </div>`;
    document.body.appendChild(overlay);
    $('#ggPublicAdminClose', overlay).onclick = () => overlay.remove();
    icons(overlay);
  }

  function init() {
    mountButton();
    const observer = new MutationObserver(() => mountButton());
    observer.observe(document.documentElement, { childList: true, subtree: true });
  }

  if (document.readyState === 'loading') document.addEventListener('DOMContentLoaded', init);
  else init();
})();
