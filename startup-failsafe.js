/* GG.Chat startup failsafe
   This file must stay tiny and dependency-free.
   Goal: the page must never become permanently blocked by a loader or overlay.
*/
(() => {
  'use strict';

  const removeBlockingLoaders = () => {
    document.querySelectorAll('#ggBootScreen,.gg-boot-screen').forEach(el => {
      try { el.remove(); } catch { el.style.display = 'none'; }
    });
    document.documentElement.classList.remove('loading','is-loading','gg-loading');
    document.body?.classList.remove('loading','is-loading','gg-loading');
  };

  const ensureVisibleSurface = () => {
    const auth = document.getElementById('authScreen');
    const app = document.getElementById('app');
    if (!auth || !app) return;

    const authHidden = auth.classList.contains('hidden');
    const appHidden = app.classList.contains('hidden');

    // There should never be a state where both main surfaces are hidden.
    if (authHidden && appHidden) auth.classList.remove('hidden');
  };

  const recoverStuckPage = () => {
    removeBlockingLoaders();
    ensureVisibleSurface();

    // Any legacy overlay that has no visible dialog should not intercept clicks.
    document.querySelectorAll('.modal-backdrop').forEach(el => {
      if (el.classList.contains('hidden')) el.style.pointerEvents = 'none';
    });
  };

  // Run before and after the rest of the app initializes.
  recoverStuckPage();
  document.addEventListener('DOMContentLoaded', recoverStuckPage, { once: true });
  window.addEventListener('load', recoverStuckPage, { once: true });

  // Short watchdog during startup only; it stops automatically.
  let passes = 0;
  const watchdog = setInterval(() => {
    recoverStuckPage();
    passes += 1;
    if (passes >= 20) clearInterval(watchdog);
  }, 250);

  window.addEventListener('error', removeBlockingLoaders);
  window.addEventListener('unhandledrejection', removeBlockingLoaders);
})();
