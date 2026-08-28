// ============================================================
// GG.Chat V2 enhancement layer
// This file intentionally focuses on progressive enhancement.
// Core social functionality remains in app.js.
// ============================================================

(() => {
  'use strict';

  const qs = (selector, root = document) => root.querySelector(selector);
  const qsa = (selector, root = document) => [...root.querySelectorAll(selector)];

  const V2 = {
    initialized: false,
    observer: null,
    config: window.GG_CONFIG || {},
    connectionBanner: null,
    bootScreen: null,
    authStatus: null,
    cleanupFns: [],
  };

  function safeText(value = '') {
    return String(value).replace(/[&<>"']/g, char => ({
      '&': '&amp;',
      '<': '&lt;',
      '>': '&gt;',
      '"': '&quot;',
      "'": '&#39;'
    }[char]));
  }

  function createElement(tag, className, html = '') {
    const el = document.createElement(tag);
    if (className) el.className = className;
    if (html) el.innerHTML = html;
    return el;
  }

  function iconRefresh() {
    if (window.lucide?.createIcons) {
      window.lucide.createIcons();
    }
  }

  function normalizeBaseUrl(value) {
    if (!value) return '';
    try {
      const url = new URL(value);
      url.pathname = url.pathname
        .replace(/\/(rest|auth|storage|realtime)\/v\d+\/?$/i, '')
        .replace(/\/+$/, '');
      url.search = '';
      url.hash = '';
      return url.toString().replace(/\/$/, '');
    } catch {
      return String(value).trim().replace(/\/+$/, '');
    }
  }

  function validateConfig() {
    const configured = normalizeBaseUrl(V2.config.SUPABASE_URL);
    const expectedPattern = /^https:\/\/[a-z0-9-]+\.supabase\.co$/i;
    const key = V2.config.SUPABASE_ANON_KEY || '';

    const result = {
      ok: true,
      messages: [],
      baseUrl: configured,
    };

    if (!configured) {
      result.ok = false;
      result.messages.push('Supabase project URL ontbreekt.');
    } else if (!expectedPattern.test(configured)) {
      result.ok = false;
      result.messages.push('Supabase URL lijkt geen geldige project-base-URL te zijn.');
    }

    if (!key || key.length < 20) {
      result.ok = false;
      result.messages.push('Supabase publishable/anon key ontbreekt of is ongeldig.');
    }

    return result;
  }

  function addBootScreen() {
    if (qs('#ggBootScreen')) return;

    const screen = createElement('div', 'gg-boot-screen');
    screen.id = 'ggBootScreen';
    screen.innerHTML = `
      <div class="gg-boot-card">
        <div class="gg-boot-logo">GG</div>
        <div class="gg-boot-line"></div>
      </div>
    `;

    document.body.prepend(screen);
    V2.bootScreen = screen;

    window.setTimeout(() => {
      screen.classList.add('is-hidden');
      window.setTimeout(() => screen.remove(), 450);
    }, 450);
  }

  function addConnectionBanner() {
    if (qs('#ggConnectionBanner')) return;

    const banner = createElement('div', 'gg-connection-banner');
    banner.id = 'ggConnectionBanner';
    banner.textContent = 'Geen internetverbinding — wijzigingen worden mogelijk niet opgeslagen.';
    document.body.appendChild(banner);
    V2.connectionBanner = banner;

    const update = () => {
      const online = navigator.onLine;
      banner.classList.toggle('show', !online);

      const status = qs('#ggConnectionStatus');
      if (status) {
        status.classList.toggle('offline', !online);
        status.textContent = online ? 'Online' : 'Offline';
      }
    };

    window.addEventListener('online', update);
    window.addEventListener('offline', update);
    update();

    V2.cleanupFns.push(() => {
      window.removeEventListener('online', update);
      window.removeEventListener('offline', update);
    });
  }

  function enhanceAuthHero() {
    const hero = qs('.auth-hero');
    if (!hero || qs('.gg-auth-features', hero)) return;

    const features = createElement('div', 'gg-auth-features');
    features.innerHTML = `
      <div class="gg-auth-feature">
        <i data-lucide="messages-square"></i>
        <strong>Realtime chat</strong>
        <span>Stuur privéberichten direct naar andere accounts.</span>
      </div>
      <div class="gg-auth-feature">
        <i data-lucide="users-round"></i>
        <strong>Bouw je netwerk</strong>
        <span>Volg mensen, ontdek accounts en laat je profiel groeien.</span>
      </div>
      <div class="gg-auth-feature">
        <i data-lucide="badge-check"></i>
        <strong>Officiële badges</strong>
        <span>Geverifieerde profielen zijn duidelijk herkenbaar.</span>
      </div>
    `;
    hero.appendChild(features);
    iconRefresh();
  }

  function enhanceAuthCard() {
    const card = qs('.auth-card');
    if (!card || card.dataset.v2Enhanced === '1') return;
    card.dataset.v2Enhanced = '1';

    const note = createElement('div', 'gg-auth-note');
    note.innerHTML = `
      <i data-lucide="shield-check"></i>
      <span>Accounts, profielen en berichten worden veilig verwerkt via Supabase. Je wachtwoord wordt niet door GG.Chat zelf opgeslagen.</span>
    `;
    card.appendChild(note);

    const registerForm = qs('#registerForm');
    if (registerForm) {
      enhanceUsernameField(registerForm);
      enhancePasswordField(registerForm);
      enhanceRegisterSubmit(registerForm);
    }

    const loginForm = qs('#loginForm');
    if (loginForm) {
      enhanceLoginSubmit(loginForm);
    }

    iconRefresh();
  }

  function enhanceUsernameField(form) {
    const input = qs('#registerUsername', form);
    if (!input || qs('.gg-field-meta', input.parentElement)) return;

    input.autocapitalize = 'none';
    input.spellcheck = false;
    input.inputMode = 'text';

    const meta = createElement('div', 'gg-field-meta');
    meta.innerHTML = '<span>3–24 tekens</span><span id="ggUsernameState">letters, cijfers, _ en .</span>';
    input.parentElement.appendChild(meta);

    const validate = () => {
      const raw = input.value;
      const normalized = raw.toLowerCase().replace(/\s+/g, '');

      if (raw !== normalized) {
        const start = input.selectionStart;
        input.value = normalized;
        try { input.setSelectionRange(start, start); } catch {}
      }

      const valid = /^[a-z0-9_.]{3,24}$/.test(input.value);
      meta.classList.toggle('good', valid);
      meta.classList.toggle('bad', input.value.length > 0 && !valid);

      const state = qs('#ggUsernameState');
      if (!state) return;

      if (!input.value) state.textContent = 'letters, cijfers, _ en .';
      else if (valid) state.textContent = '@' + input.value + ' ziet er goed uit';
      else state.textContent = 'gebruik alleen geldige tekens';
    };

    input.addEventListener('input', validate);
    validate();
  }

  function passwordScore(password) {
    let score = 0;
    if (password.length >= 6) score++;
    if (password.length >= 10) score++;
    if (/[A-Z]/.test(password) && /[a-z]/.test(password)) score++;
    if (/\d/.test(password) && /[^A-Za-z0-9]/.test(password)) score++;
    return Math.min(4, score);
  }

  function enhancePasswordField(form) {
    const input = qs('#registerPassword', form);
    if (!input || qs('.gg-password-meter', input.parentElement)) return;

    const meter = createElement('div', 'gg-password-meter');
    meter.dataset.score = '0';
    meter.innerHTML = '<span></span><span></span><span></span><span></span>';

    const meta = createElement('div', 'gg-field-meta');
    meta.innerHTML = '<span id="ggPasswordLabel">Gebruik minimaal 6 tekens</span><span id="ggPasswordLength">0 tekens</span>';

    input.parentElement.appendChild(meter);
    input.parentElement.appendChild(meta);

    const update = () => {
      const value = input.value;
      const score = passwordScore(value);
      meter.dataset.score = String(score);

      const label = qs('#ggPasswordLabel');
      const length = qs('#ggPasswordLength');

      if (length) length.textContent = `${value.length} tekens`;
      if (label) {
        label.textContent = [
          'Gebruik minimaal 6 tekens',
          'Zwak wachtwoord',
          'Redelijk wachtwoord',
          'Sterk wachtwoord',
          'Zeer sterk wachtwoord'
        ][score];
      }

      meta.classList.toggle('good', score >= 3);
      meta.classList.toggle('bad', value.length > 0 && score <= 1);
    };

    input.addEventListener('input', update);
    update();
  }

  function attachLoadingState(form, text) {
    form.addEventListener('submit', () => {
      const button = qs('button[type="submit"]', form);
      if (!button) return;

      button.dataset.originalHtml = button.innerHTML;
      button.classList.add('gg-button-loading');

      const label = qs('span', button);
      if (label) label.textContent = text;

      window.setTimeout(() => {
        if (!button.isConnected) return;
        button.classList.remove('gg-button-loading');
        if (button.dataset.originalHtml) {
          button.innerHTML = button.dataset.originalHtml;
          iconRefresh();
        }
      }, 6500);
    }, { capture: true });
  }

  function enhanceRegisterSubmit(form) {
    if (form.dataset.v2Submit === '1') return;
    form.dataset.v2Submit = '1';

    attachLoadingState(form, 'Account maken...');

    form.addEventListener('submit', event => {
      const username = qs('#registerUsername')?.value.trim().toLowerCase() || '';
      const password = qs('#registerPassword')?.value || '';
      const displayName = qs('#registerName')?.value.trim() || '';

      if (!displayName) {
        event.preventDefault();
        showLocalAuthError('Vul een weergavenaam in.');
        return;
      }

      if (!/^[a-z0-9_.]{3,24}$/.test(username)) {
        event.preventDefault();
        showLocalAuthError('Kies een geldige gebruikersnaam van 3–24 tekens.');
        return;
      }

      if (password.length < 6) {
        event.preventDefault();
        showLocalAuthError('Je wachtwoord moet minimaal 6 tekens bevatten.');
      }
    }, { capture: true });
  }

  function enhanceLoginSubmit(form) {
    if (form.dataset.v2Submit === '1') return;
    form.dataset.v2Submit = '1';
    attachLoadingState(form, 'Inloggen...');
  }

  function showLocalAuthError(message) {
    let box = qs('#ggLocalAuthError');

    if (!box) {
      box = createElement('div', 'gg-auth-note');
      box.id = 'ggLocalAuthError';
      box.style.borderColor = 'rgba(255,98,125,.25)';
      box.style.color = '#ffd8df';

      const card = qs('.auth-card');
      if (card) card.appendChild(box);
    }

    box.innerHTML = `<i data-lucide="circle-alert"></i><span>${safeText(message)}</span>`;
    iconRefresh();
  }

  function enhanceSidebar() {
    const sidebar = qs('.sidebar');
    if (!sidebar || qs('#ggSidebarMeta')) return;

    const meta = createElement('div', 'gg-status-pill');
    meta.id = 'ggSidebarMeta';
    meta.innerHTML = '<span>V2 Beta</span>';

    const compose = qs('#composeSidebarBtn');
    if (compose) compose.insertAdjacentElement('afterend', meta);
  }

  function enhanceRightbar() {
    const rightbar = qs('.rightbar');
    if (!rightbar || qs('#ggConnectionStatus')) return;

    const footer = qs('.mini-footer', rightbar);
    const status = createElement('div', 'gg-status-pill');
    status.id = 'ggConnectionStatus';
    status.textContent = navigator.onLine ? 'Online' : 'Offline';
    status.classList.toggle('offline', !navigator.onLine);

    if (footer) footer.insertAdjacentElement('beforebegin', status);
    else rightbar.appendChild(status);
  }

  function enhanceComposer(root = document) {
    const textareas = qsa('#composerText, #modalPostText', root);

    textareas.forEach(textarea => {
      if (textarea.dataset.v2Enhanced === '1') return;
      textarea.dataset.v2Enhanced = '1';

      const tools = textarea.closest('.composer')?.querySelector('.composer-tools') ||
        textarea.parentElement?.querySelector('.modal-actions');

      if (!tools) return;

      const counter = createElement('span', 'gg-composer-counter');
      const max = Number(textarea.maxLength || 1000);

      const update = () => {
        const remaining = Math.max(0, max - textarea.value.length);
        counter.textContent = String(remaining);
        counter.classList.toggle('warning', remaining <= 100 && remaining > 30);
        counter.classList.toggle('danger', remaining <= 30);
      };

      if (tools.firstElementChild) {
        tools.firstElementChild.insertAdjacentElement('afterend', counter);
      } else {
        tools.prepend(counter);
      }

      textarea.addEventListener('input', update);
      update();
    });
  }

  function enhanceSearch() {
    const input = qs('#globalSearch');
    if (!input || input.dataset.v2Enhanced === '1') return;
    input.dataset.v2Enhanced = '1';

    input.setAttribute('aria-label', 'Zoeken op GG.Chat');

    input.addEventListener('focus', () => {
      input.closest('.search-box')?.classList.add('focused');
    });

    input.addEventListener('blur', () => {
      input.closest('.search-box')?.classList.remove('focused');
    });
  }

  function enhanceButtons(root = document) {
    qsa('button', root).forEach(button => {
      if (button.dataset.v2A11y === '1') return;
      button.dataset.v2A11y = '1';

      if (!button.getAttribute('type') && button.closest('form')) {
        button.type = 'button';
      }

      button.addEventListener('pointerdown', () => {
        button.style.transform = 'scale(.985)';
      });

      const release = () => {
        button.style.removeProperty('transform');
      };

      button.addEventListener('pointerup', release);
      button.addEventListener('pointercancel', release);
      button.addEventListener('pointerleave', release);
    });
  }

  function enhanceExternalLinks(root = document) {
    qsa('a[href^="http"]', root).forEach(link => {
      if (link.hostname !== window.location.hostname) {
        link.rel = 'noopener noreferrer';
        link.target = '_blank';
      }
    });
  }

  function observeDynamicUi() {
    if (V2.observer) return;

    V2.observer = new MutationObserver(mutations => {
      const relevant = mutations.some(mutation => mutation.addedNodes.length > 0);
      if (!relevant) return;

      enhanceComposer();
      enhanceButtons();
      enhanceExternalLinks();
      iconRefresh();
    });

    V2.observer.observe(document.body, {
      childList: true,
      subtree: true,
    });
  }

  function installGlobalErrorGuard() {
    window.addEventListener('error', event => {
      const message = event?.message || 'Onbekende fout';
      console.error('[GG.Chat V2] Runtime error:', event.error || message);
    });

    window.addEventListener('unhandledrejection', event => {
      console.error('[GG.Chat V2] Unhandled promise rejection:', event.reason);
    });
  }

  function installKeyboardShortcuts() {
    document.addEventListener('keydown', event => {
      if (event.metaKey || event.ctrlKey || event.altKey) return;
      if (['INPUT', 'TEXTAREA'].includes(document.activeElement?.tagName)) return;

      if (event.key.toLowerCase() === 'n') {
        const compose = qs('#composeSidebarBtn');
        if (compose && !qs('#app')?.classList.contains('hidden')) {
          event.preventDefault();
          compose.click();
        }
      }

      if (event.key.toLowerCase() === 'g') {
        const home = qs('[data-route="home"]');
        if (home && !qs('#app')?.classList.contains('hidden')) {
          home.focus();
        }
      }
    });
  }

  function showConfigurationWarning() {
    const result = validateConfig();
    if (result.ok) return;

    const auth = qs('.auth-card');
    if (!auth) return;

    const existing = qs('#ggConfigWarning');
    if (existing) existing.remove();

    const warning = createElement('div', 'gg-auth-note');
    warning.id = 'ggConfigWarning';
    warning.style.borderColor = 'rgba(255,200,90,.24)';
    warning.style.color = '#ffe8ae';
    warning.innerHTML = `
      <i data-lucide="triangle-alert"></i>
      <span><strong>Backend-configuratie controleren.</strong><br>${result.messages.map(safeText).join(' ')}</span>
    `;
    auth.appendChild(warning);
    iconRefresh();
  }

  function markVersion() {
    document.documentElement.dataset.ggVersion = V2.config.APP_VERSION || '2';
    document.documentElement.dataset.ggPlatform = 'web';
  }

  function init() {
    if (V2.initialized) return;
    V2.initialized = true;

    markVersion();
    addBootScreen();
    addConnectionBanner();
    enhanceAuthHero();
    enhanceAuthCard();
    enhanceSidebar();
    enhanceRightbar();
    enhanceSearch();
    enhanceComposer();
    enhanceButtons();
    enhanceExternalLinks();
    observeDynamicUi();
    installGlobalErrorGuard();
    installKeyboardShortcuts();
    showConfigurationWarning();
    iconRefresh();

    console.info(
      `%cGG.Chat ${V2.config.APP_VERSION || 'V2'}%c frontend ready`,
      'background:#7768ff;color:#fff;padding:4px 7px;border-radius:6px;font-weight:800',
      'color:#9da6b5'
    );
  }

  if (document.readyState === 'loading') {
    document.addEventListener('DOMContentLoaded', init, { once: true });
  } else {
    init();
  }
})();
