/* GG.Chat temporary public admin gate.
   TEST MODE ONLY: this password lives in frontend code and is not secure.
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

  function openPanel() {
    if (window.GGPublicAdminPanel?.open) {
      window.GGPublicAdminPanel.open();
      return;
    }
    toast('Admin Panel kon niet laden. Vernieuw de pagina.', 'error');
  }

  function openGate() {
    if (sessionStorage.getItem(SESSION_KEY) === '1') return openPanel();

    document.querySelector('.gg-public-admin-overlay')?.remove();
    const overlay = document.createElement('div');
    overlay.className = 'gg-admin-lock-overlay gg-public-admin-overlay';
    overlay.innerHTML = `
      <form class="gg-admin-lock" id="ggPublicAdminForm">
        <div class="gg-admin-lock-icon"><i data-lucide="key-round"></i></div>
        <h2>Admin Panel</h2>
        <p>Voer het tijdelijke testwachtwoord in.</p>
        <label>Wachtwoord
          <input id="ggPublicAdminPassword" type="password" autocomplete="off" placeholder="Admin-wachtwoord" required autofocus>
        </label>
        <div class="gg-admin-lock-actions">
          <button type="button" class="gg-admin-btn" id="ggPublicAdminCancel">Annuleren</button>
          <button type="submit" class="gg-admin-btn primary"><i data-lucide="unlock"></i> Open Admin Panel</button>
        </div>
        <p class="gg-admin-security-note"><i data-lucide="triangle-alert"></i> Testmodus: iedereen die het frontendwachtwoord kent kan deze console openen.</p>
      </form>`;
    document.body.appendChild(overlay);
    icons(overlay);

    $('#ggPublicAdminCancel', overlay).onclick = () => overlay.remove();
    overlay.addEventListener('mousedown', e => { if (e.target === overlay) overlay.remove(); });
    $('#ggPublicAdminForm', overlay).onsubmit = e => {
      e.preventDefault();
      const input = $('#ggPublicAdminPassword', overlay);
      const value = input.value;
      if (!PASSWORD || value !== PASSWORD) {
        input.value = '';
        input.focus();
        return toast('Onjuist admin-wachtwoord.', 'error');
      }
      sessionStorage.setItem(SESSION_KEY, '1');
      overlay.remove();
      toast('Admin Panel ontgrendeld.');
      openPanel();
    };
  }

  function init() {
    mountButton();
    const observer = new MutationObserver(() => mountButton());
    observer.observe(document.documentElement, { childList: true, subtree: true });
  }

  if (document.readyState === 'loading') document.addEventListener('DOMContentLoaded', init);
  else init();
})();
