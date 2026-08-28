/* GG.Chat Admin Console
   Security model:
   - Button appears only when the signed-in profile has role=admin.
   - Admin password is checked by Supabase RPC; it is never stored in this file.
   - Successful login returns a temporary token stored in sessionStorage only.
   - Every privileged RPC validates both auth.uid() and that temporary token.
*/
(() => {
  'use strict';

  const cfg = window.GG_CONFIG || {};
  if (!window.supabase || !cfg.SUPABASE_URL || !cfg.SUPABASE_ANON_KEY) return;

  const client = window.supabase.createClient(cfg.SUPABASE_URL, cfg.SUPABASE_ANON_KEY, {
    auth: { persistSession: true, autoRefreshToken: true, detectSessionInUrl: true }
  });

  const A = {
    session: null,
    me: null,
    token: sessionStorage.getItem('gg_admin_token') || '',
    users: [],
    badges: [],
    selectedUser: null,
    activeTab: 'dashboard',
    observer: null,
    badgeTimer: null,
    mounted: false
  };

  const $ = (s, root = document) => root.querySelector(s);
  const $$ = (s, root = document) => [...root.querySelectorAll(s)];
  const esc = (v = '') => String(v).replace(/[&<>"']/g, c => ({ '&':'&amp;','<':'&lt;','>':'&gt;','"':'&quot;',"'":'&#39;' }[c]));
  const icon = (name) => `<i data-lucide="${esc(name)}"></i>`;
  const fmt = n => Number(n || 0).toLocaleString('nl-NL');

  function refreshIcons(root = document) {
    try { window.lucide?.createIcons({ attrs: { 'stroke-width': 2 }, nameAttr: 'data-lucide' }, root); }
    catch { try { window.lucide?.createIcons(); } catch {} }
  }

  function toast(message, type = '') {
    const el = document.createElement('div');
    el.className = `gg-admin-toast ${type}`;
    el.textContent = message;
    document.body.appendChild(el);
    setTimeout(() => el.remove(), 3200);
  }

  function avatar(user, cls = 'gg-admin-avatar') {
    if (user?.avatar_url) return `<img class="${cls}" src="${esc(user.avatar_url)}" alt="">`;
    return `<div class="${cls}">${esc((user?.display_name || user?.username || '?').slice(0,1).toUpperCase())}</div>`;
  }

  async function rpc(name, args = {}) {
    const { data, error } = await client.rpc(name, args);
    if (error) {
      const expired = /expired|not authorized|admin session/i.test(error.message || '');
      if (expired && name !== 'admin_login') {
        clearToken();
        closeConsole();
        toast('Adminsessie verlopen. Log opnieuw in.', 'error');
      }
      throw error;
    }
    return data;
  }

  function clearToken() {
    A.token = '';
    sessionStorage.removeItem('gg_admin_token');
  }

  async function init() {
    const { data: { session } } = await client.auth.getSession();
    A.session = session;
    if (session) await resolveAdmin();
    setupBadgeEnhancer();

    client.auth.onAuthStateChange(async (event, session) => {
      A.session = session;
      if (!session || event === 'SIGNED_OUT') {
        A.me = null;
        clearToken();
        removeAdminButton();
        closeConsole();
        return;
      }
      await resolveAdmin();
    });
  }

  async function resolveAdmin() {
    if (!A.session?.user?.id) return;
    const { data } = await client.from('profiles').select('id,username,display_name,avatar_url,role,verified,is_suspended').eq('id', A.session.user.id).maybeSingle();
    A.me = data || null;
    if (A.me?.role === 'admin' && !A.me?.is_suspended) mountAdminButton();
    else {
      removeAdminButton();
      clearToken();
    }
  }

  function mountAdminButton() {
    if ($('#ggAdminNav')) return;
    const profileButton = $('.main-nav [data-route="profile"]');
    if (!profileButton) {
      setTimeout(mountAdminButton, 500);
      return;
    }
    const btn = document.createElement('button');
    btn.id = 'ggAdminNav';
    btn.type = 'button';
    btn.className = 'nav-item gg-admin-nav visible';
    btn.innerHTML = `${icon('shield-check')}<span>Admin Panel</span><b class="admin-dot"></b>`;
    btn.addEventListener('click', openAdmin);
    profileButton.insertAdjacentElement('afterend', btn);
    refreshIcons(btn);
  }

  function removeAdminButton() { $('#ggAdminNav')?.remove(); }

  async function openAdmin() {
    if (A.token) {
      try {
        await rpc('admin_dashboard_stats', { p_token: A.token });
        return openConsole();
      } catch { /* gate will reopen */ }
    }
    openPasswordGate();
  }

  function openPasswordGate() {
    $('.gg-admin-lock-overlay')?.remove();
    const wrap = document.createElement('div');
    wrap.className = 'gg-admin-lock-overlay';
    wrap.innerHTML = `
      <form class="gg-admin-lock" id="ggAdminLoginForm">
        <div class="gg-admin-lock-icon">${icon('shield-lock')}</div>
        <h2>Adminbeveiliging</h2>
        <p>Je bent ingelogd als <strong>@${esc(A.me?.username || '')}</strong>. Voer je aparte admin-wachtwoord in om de beveiligde GG.Chat Console te openen.</p>
        <label>Admin-wachtwoord
          <input id="ggAdminPassword" type="password" autocomplete="off" minlength="10" placeholder="••••••••••" required autofocus>
        </label>
        <div class="gg-admin-lock-actions">
          <button type="button" class="gg-admin-btn" id="ggAdminCancel">Annuleren</button>
          <button type="submit" class="gg-admin-btn primary" id="ggAdminUnlock">${icon('unlock-keyhole')} Ontgrendelen</button>
        </div>
        <p class="gg-admin-security-note">${icon('lock-keyhole')} Het admin-wachtwoord staat niet in GitHub. Supabase controleert het gehashte wachtwoord en geeft alleen een tijdelijke sessie van 45 minuten.</p>
      </form>`;
    document.body.appendChild(wrap);
    $('#ggAdminCancel', wrap).onclick = () => wrap.remove();
    wrap.addEventListener('mousedown', e => { if (e.target === wrap) wrap.remove(); });
    $('#ggAdminLoginForm', wrap).onsubmit = async e => {
      e.preventDefault();
      const btn = $('#ggAdminUnlock', wrap);
      const password = $('#ggAdminPassword', wrap).value;
      btn.disabled = true;
      btn.innerHTML = `${icon('loader-circle')} Controleren...`;
      refreshIcons(btn);
      try {
        const token = await rpc('admin_login', { p_password: password });
        A.token = token;
        sessionStorage.setItem('gg_admin_token', token);
        wrap.remove();
        toast('Admin Console ontgrendeld.');
        openConsole();
      } catch (err) {
        btn.disabled = false;
        btn.innerHTML = `${icon('unlock-keyhole')} Ontgrendelen`;
        refreshIcons(btn);
        $('#ggAdminPassword', wrap).value = '';
        $('#ggAdminPassword', wrap).focus();
        toast(err.message || 'Admin-wachtwoord onjuist.', 'error');
      }
    };
    refreshIcons(wrap);
    setTimeout(() => $('#ggAdminPassword', wrap)?.focus(), 80);
  }

  function openConsole() {
    $('.gg-admin-console')?.remove();
    const consoleEl = document.createElement('div');
    consoleEl.className = 'gg-admin-console';
    consoleEl.innerHTML = `
      <div class="gg-admin-shell">
        <aside class="gg-admin-sidebar">
          <div class="gg-admin-brand">
            <div class="gg-admin-brand-mark">GG</div>
            <div><strong>Admin Console</strong><span>Owner access</span></div>
          </div>
          <nav class="gg-admin-menu">
            ${menuButton('dashboard','layout-dashboard','Overzicht')}
            ${menuButton('users','users','Gebruikers')}
            ${menuButton('badges','badge-check','Badges')}
            ${menuButton('moderation','shield-alert','Moderatie')}
            ${menuButton('system','settings-2','Platform')}
          </nav>
          <div class="gg-admin-sidebar-bottom">
            <button class="gg-admin-btn danger" id="ggAdminLock">${icon('lock')}<span>Console vergrendelen</span></button>
          </div>
        </aside>
        <main class="gg-admin-main">
          <header class="gg-admin-topbar">
            <div><h2 id="ggAdminTopTitle">Admin Console</h2><p>Beveiligde beheeromgeving</p></div>
            <div class="gg-admin-topbar-spacer"></div>
            <div class="gg-admin-live">Secure session</div>
            <button class="gg-admin-close" id="ggAdminClose" title="Sluiten">${icon('x')}</button>
          </header>
          <div class="gg-admin-content" id="ggAdminContent"></div>
        </main>
      </div>
      <aside class="gg-admin-drawer hidden" id="ggAdminDrawer"></aside>`;
    document.body.appendChild(consoleEl);
    $('#ggAdminClose', consoleEl).onclick = closeConsole;
    $('#ggAdminLock', consoleEl).onclick = lockConsole;
    $$('.gg-admin-menu button[data-admin-tab]', consoleEl).forEach(b => b.onclick = () => renderTab(b.dataset.adminTab));
    refreshIcons(consoleEl);
    renderTab(A.activeTab || 'dashboard');
  }

  function menuButton(tab, ico, label) {
    return `<button data-admin-tab="${tab}" class="${A.activeTab === tab ? 'active' : ''}">${icon(ico)}<span>${label}</span></button>`;
  }

  function closeConsole() { $('.gg-admin-console')?.remove(); }

  async function lockConsole() {
    try { if (A.token) await rpc('admin_logout', { p_token: A.token }); } catch {}
    clearToken();
    closeConsole();
    toast('Admin Console vergrendeld.');
  }

  async function renderTab(tab) {
    A.activeTab = tab;
    $$('.gg-admin-menu button[data-admin-tab]').forEach(b => b.classList.toggle('active', b.dataset.adminTab === tab));
    const titles = { dashboard:'Overzicht', users:'Gebruikersbeheer', badges:'Badges', moderation:'Moderatie', system:'Platforminstellingen' };
    const top = $('#ggAdminTopTitle'); if (top) top.textContent = titles[tab] || 'Admin Console';
    const content = $('#ggAdminContent'); if (!content) return;
    content.innerHTML = `<div class="gg-admin-card"><div class="gg-admin-card-body">${icon('loader-circle')} Gegevens laden...</div></div>`;
    refreshIcons(content);
    try {
      if (tab === 'dashboard') await renderDashboard();
      if (tab === 'users') await renderUsers();
      if (tab === 'badges') await renderBadges();
      if (tab === 'moderation') await renderModeration();
      if (tab === 'system') await renderSystem();
    } catch (err) {
      content.innerHTML = `<div class="gg-admin-card"><div class="gg-admin-card-body"><strong>Kon onderdeel niet laden</strong><p style="color:#8993a3;font-size:11px">${esc(err.message || err)}</p></div></div>`;
    }
    refreshIcons(content);
  }

  async function renderDashboard() {
    const s = await rpc('admin_dashboard_stats', { p_token: A.token });
    const content = $('#ggAdminContent');
    content.innerHTML = `
      <div class="gg-admin-kicker">Owner dashboard</div>
      <h1 class="gg-admin-page-title">Welkom terug, ${esc(A.me?.display_name || A.me?.username || 'Admin')}</h1>
      <p class="gg-admin-page-sub">Live overzicht van GG.Chat. Alle beheeracties worden via beveiligde databasefuncties uitgevoerd.</p>
      <div class="gg-admin-stat-grid">
        ${statCard('users','Gebruikers',s.users)}
        ${statCard('message-square','Berichten',s.posts)}
        ${statCard('heart','Likes',s.likes)}
        ${statCard('messages-square','DM-berichten',s.messages)}
        ${statCard('user-plus','Volgrelaties',s.follows)}
        ${statCard('message-circle','Reacties',s.comments)}
        ${statCard('badge-check','Geverifieerd',s.verified)}
        ${statCard('shield-ban','Geschorst',s.suspended)}
      </div>
      <section class="gg-admin-card">
        <div class="gg-admin-card-head"><div>${icon('zap')}</div><div><h3>Snelle acties</h3><p>Veelgebruikte beheertaken</p></div></div>
        <div class="gg-admin-card-body" style="display:flex;gap:9px;flex-wrap:wrap">
          <button class="gg-admin-btn primary" data-jump="users">${icon('user-cog')} Gebruiker beheren</button>
          <button class="gg-admin-btn" data-jump="badges">${icon('badge-plus')} Badge toekennen</button>
          <button class="gg-admin-btn" data-jump="moderation">${icon('shield-alert')} Moderatie</button>
          <button class="gg-admin-btn" id="ggAdminRefresh">${icon('refresh-cw')} Vernieuwen</button>
        </div>
      </section>
      <section class="gg-admin-card">
        <div class="gg-admin-card-head"><div>${icon('shield-check')}</div><div><h3>Beveiligingsstatus</h3><p>Je adminomgeving draait server-side beveiligd</p></div></div>
        <div class="gg-admin-card-body" style="font-size:11px;color:#93a0b2;line-height:1.7">
          <strong style="color:#86efac">● Actieve beveiligde adminsessie</strong><br>
          Normale Supabase Auth + apart admin-wachtwoord + tijdelijk admin-token. Beheerfuncties controleren iedere actie opnieuw.
        </div>
      </section>`;
    $$('[data-jump]', content).forEach(b => b.onclick = () => renderTab(b.dataset.jump));
    $('#ggAdminRefresh', content).onclick = () => renderDashboard();
  }

  function statCard(ico, label, value) {
    return `<div class="gg-admin-stat"><div class="ico">${icon(ico)}</div><strong>${fmt(value)}</strong><span>${esc(label)}</span></div>`;
  }

  async function renderUsers(search = '') {
    const users = await rpc('admin_list_users', { p_token:A.token, p_search:search, p_limit:150 });
    A.users = users || [];
    const content = $('#ggAdminContent');
    content.innerHTML = `
      <div class="gg-admin-kicker">Accounts</div><h1 class="gg-admin-page-title">Gebruikersbeheer</h1>
      <p class="gg-admin-page-sub">Zoek accounts, beheer rollen, verificatie, badges, statistieken, privacy en schorsingen.</p>
      <section class="gg-admin-card">
        <div class="gg-admin-card-head"><div>${icon('search')}</div><div><h3>Accounts zoeken</h3><p>${fmt(A.users.length)} resultaten geladen</p></div></div>
        <div class="gg-admin-card-body"><form class="gg-admin-search" id="ggAdminUserSearch"><input id="ggAdminUserQuery" value="${esc(search)}" placeholder="Naam of @gebruikersnaam"><button class="gg-admin-btn primary">${icon('search')} Zoeken</button></form></div>
        <div class="gg-admin-table-wrap"><table class="gg-admin-table"><thead><tr><th>Gebruiker</th><th>Rol</th><th>Status</th><th>Verified</th><th>Aangemaakt</th><th>Acties</th></tr></thead><tbody>
          ${A.users.map(userRow).join('') || '<tr><td colspan="6">Geen accounts gevonden.</td></tr>'}
        </tbody></table></div>
      </section>`;
    $('#ggAdminUserSearch', content).onsubmit = e => { e.preventDefault(); renderUsers($('#ggAdminUserQuery', content).value.trim()); };
    $$('.gg-admin-edit-user', content).forEach(b => b.onclick = () => openUserDrawer(b.dataset.id));
    $$('.gg-admin-quick-verify', content).forEach(b => b.onclick = () => quickVerify(b.dataset.id, b.dataset.verified !== 'true'));
    refreshIcons(content);
  }

  function userRow(u) {
    return `<tr>
      <td><div class="gg-admin-user">${avatar(u)}<div><strong>${esc(u.display_name)}</strong><span>@${esc(u.username)}</span></div></div></td>
      <td><span class="gg-admin-role">${esc(u.role)}</span></td>
      <td><span class="gg-admin-status ${u.is_suspended ? 'suspended' : ''}">${u.is_suspended ? 'Geschorst' : 'Actief'}</span></td>
      <td>${u.verified ? '<span style="color:#60a5fa;font-weight:900">✓ Ja</span>' : '<span style="color:#697386">Nee</span>'}</td>
      <td>${new Date(u.created_at).toLocaleDateString('nl-NL')}</td>
      <td><div class="gg-admin-row-actions"><button class="gg-admin-btn gg-admin-edit-user" data-id="${u.id}">${icon('sliders-horizontal')} Beheer</button><button class="gg-admin-btn gg-admin-quick-verify" data-id="${u.id}" data-verified="${u.verified}">${icon(u.verified?'badge-x':'badge-check')}</button></div></td>
    </tr>`;
  }

  async function quickVerify(id, verified) {
    try {
      await rpc('admin_update_user', { p_token:A.token,p_user:id,p_verified:verified,p_role:null,p_suspended:null,p_reason:null,p_private:null,p_allow_dms:null });
      toast(verified ? 'Account geverifieerd.' : 'Verificatie verwijderd.');
      renderUsers($('#ggAdminUserQuery')?.value || '');
      scheduleBadgeRefresh();
    } catch (e) { toast(e.message, 'error'); }
  }

  async function loadBadgeCatalog() {
    const { data, error } = await client.from('badges').select('*').eq('active', true).order('priority');
    if (error) throw error;
    A.badges = data || [];
    return A.badges;
  }

  async function openUserDrawer(userId) {
    const user = A.users.find(u => u.id === userId);
    if (!user) return;
    A.selectedUser = user;
    if (!A.badges.length) await loadBadgeCatalog();
    const { data: assignedRows } = await client.from('user_badges').select('badge_id,badges:badge_id(slug)').eq('user_id', user.id);
    const assigned = new Set((assignedRows || []).map(r => r.badges?.slug).filter(Boolean));
    const drawer = $('#ggAdminDrawer');
    drawer.classList.remove('hidden');
    drawer.innerHTML = `
      <div class="gg-admin-drawer-head"><h3>Account beheren</h3><button class="gg-admin-close" id="ggAdminDrawerClose">${icon('x')}</button></div>
      <div class="gg-admin-drawer-body">
        <div class="gg-admin-profile-preview">${avatar(user)}<div><strong>${esc(user.display_name)} ${user.verified?'✓':''}</strong><span>@${esc(user.username)} · ${esc(user.role)}</span></div></div>

        <div class="gg-admin-section-label">Accountrechten</div>
        <div class="gg-admin-form-grid">
          <div class="gg-admin-field"><label>Rol</label><select id="admRole"><option value="user">User</option><option value="creator">Creator</option><option value="moderator">Moderator</option><option value="admin">Admin</option></select></div>
          <div class="gg-admin-field"><label>Status</label><select id="admStatus"><option value="active">Actief</option><option value="suspended">Geschorst</option></select></div>
        </div>
        <div class="gg-admin-field"><label>Reden schorsing</label><textarea id="admReason" placeholder="Optioneel">${esc(user.suspension_reason || '')}</textarea></div>
        <div class="gg-admin-toggle-row"><div class="copy"><strong>Officieel geverifieerd</strong><span>Toont het officiële vinkje</span></div><input class="gg-admin-check" id="admVerified" type="checkbox" ${user.verified?'checked':''}></div>
        <div class="gg-admin-toggle-row"><div class="copy"><strong>Privéaccount</strong><span>Profielprivacy aanpassen</span></div><input class="gg-admin-check" id="admPrivate" type="checkbox" ${user.is_private?'checked':''}></div>
        <div class="gg-admin-toggle-row"><div class="copy"><strong>DM's toestaan</strong><span>Privéberichten ontvangen</span></div><input class="gg-admin-check" id="admDms" type="checkbox" ${user.allow_dms?'checked':''}></div>

        <div class="gg-admin-section-label">Publieke statistieken overschrijven</div>
        <div class="gg-admin-form-grid">
          <div class="gg-admin-field"><label>Volgers</label><input id="admFollowers" type="number" min="0" placeholder="Automatisch" value="${user.followers_override ?? ''}"></div>
          <div class="gg-admin-field"><label>Volgend</label><input id="admFollowing" type="number" min="0" placeholder="Automatisch" value="${user.following_override ?? ''}"></div>
        </div>
        <div class="gg-admin-field"><label>Likes op profiel</label><input id="admLikes" type="number" min="0" placeholder="Automatisch" value="${user.likes_override ?? ''}"></div>
        <p style="font-size:9px;color:#697386;margin-top:-5px">Laat een veld leeg om weer de echte databasewaarde te tonen.</p>

        <div class="gg-admin-section-label">Profielbadges</div>
        <div class="gg-admin-badges" id="admBadges">
          ${A.badges.map(b => `<label class="gg-admin-badge-chip" title="${esc(b.description)}"><input type="checkbox" data-badge="${esc(b.slug)}" ${assigned.has(b.slug)?'checked':''}><span class="gg-admin-badge-dot" style="background:${esc(b.color)}"></span>${esc(b.label)}</label>`).join('')}
        </div>

        <div class="gg-admin-section-label">Systeemmelding sturen</div>
        <div class="gg-admin-field"><textarea id="admSystemMessage" maxlength="500" placeholder="Bijvoorbeeld: Je accountbadge is bijgewerkt."></textarea></div>
        <button class="gg-admin-btn" id="admSendNotification">${icon('bell-ring')} Melding versturen</button>

        <div class="gg-admin-footer-actions"><button class="gg-admin-btn primary" id="admSave">${icon('save')} Alles opslaan</button><button class="gg-admin-btn" id="admClose">Annuleren</button></div>
      </div>`;
    $('#admRole', drawer).value = user.role;
    $('#admStatus', drawer).value = user.is_suspended ? 'suspended' : 'active';
    $('#ggAdminDrawerClose', drawer).onclick = closeDrawer;
    $('#admClose', drawer).onclick = closeDrawer;
    $('#admSave', drawer).onclick = () => saveUserDrawer(user, assigned);
    $('#admSendNotification', drawer).onclick = () => sendSystemNotification(user.id);
    refreshIcons(drawer);
  }

  function closeDrawer() { $('#ggAdminDrawer')?.classList.add('hidden'); }
  const parseNullableInt = value => String(value).trim() === '' ? null : Math.max(0, parseInt(value, 10) || 0);

  async function saveUserDrawer(user, originalBadges) {
    const drawer = $('#ggAdminDrawer');
    const btn = $('#admSave', drawer); btn.disabled = true;
    try {
      await rpc('admin_update_user', {
        p_token:A.token,p_user:user.id,
        p_verified:$('#admVerified',drawer).checked,
        p_role:$('#admRole',drawer).value,
        p_suspended:$('#admStatus',drawer).value==='suspended',
        p_reason:$('#admReason',drawer).value.trim() || null,
        p_private:$('#admPrivate',drawer).checked,
        p_allow_dms:$('#admDms',drawer).checked
      });
      await rpc('admin_set_stat_overrides', {
        p_token:A.token,p_user:user.id,
        p_followers:parseNullableInt($('#admFollowers',drawer).value),
        p_following:parseNullableInt($('#admFollowing',drawer).value),
        p_likes:parseNullableInt($('#admLikes',drawer).value)
      });
      const checks = $$('input[data-badge]', drawer);
      for (const check of checks) {
        const slug = check.dataset.badge;
        if (check.checked && !originalBadges.has(slug)) await rpc('admin_assign_badge',{p_token:A.token,p_user:user.id,p_badge_slug:slug});
        if (!check.checked && originalBadges.has(slug)) await rpc('admin_remove_badge',{p_token:A.token,p_user:user.id,p_badge_slug:slug});
      }
      toast(`@${user.username} bijgewerkt.`);
      closeDrawer();
      await renderUsers($('#ggAdminUserQuery')?.value || '');
      scheduleBadgeRefresh();
    } catch (e) { toast(e.message || 'Opslaan mislukt.', 'error'); }
    finally { btn.disabled = false; }
  }

  async function sendSystemNotification(userId) {
    const text = $('#admSystemMessage')?.value.trim();
    if (!text) return toast('Schrijf eerst een melding.', 'error');
    try {
      await rpc('admin_send_system_notification',{p_token:A.token,p_user:userId,p_text:text});
      $('#admSystemMessage').value = '';
      toast('Systeemmelding verstuurd.');
    } catch(e) { toast(e.message,'error'); }
  }

  async function renderBadges() {
    await loadBadgeCatalog();
    const content = $('#ggAdminContent');
    content.innerHTML = `
      <div class="gg-admin-kicker">Identity</div><h1 class="gg-admin-page-title">Badgecatalogus</h1>
      <p class="gg-admin-page-sub">Badges verschijnen direct naast namen op GG.Chat en uitgebreider op profielpagina's.</p>
      <div class="gg-admin-stat-grid">
        ${A.badges.slice(0,4).map(b => `<div class="gg-admin-stat"><div class="ico" style="color:${esc(b.color)}">${icon(b.icon)}</div><strong style="font-size:16px">${esc(b.label)}</strong><span>${esc(b.description)}</span></div>`).join('')}
      </div>
      <section class="gg-admin-card"><div class="gg-admin-card-head"><div>${icon('badges')}</div><div><h3>Alle beschikbare badges</h3><p>${A.badges.length} badge-types</p></div></div><div class="gg-admin-card-body"><div class="gg-admin-badges">
        ${A.badges.map(b => `<div class="gg-admin-badge-chip"><span class="gg-admin-badge-dot" style="background:${esc(b.color)}"></span>${icon(b.icon)}<strong>${esc(b.label)}</strong><span style="color:#697386">${esc(b.slug)}</span></div>`).join('')}
      </div><p style="margin:16px 0 0;color:#778194;font-size:10px">Badges toekennen doe je via Gebruikers → Beheer. De catalogus zelf staat in Supabase en kan later eenvoudig met extra badge-types worden uitgebreid.</p></div></section>`;
  }

  async function renderModeration() {
    const users = await rpc('admin_list_users',{p_token:A.token,p_search:'',p_limit:250});
    const suspended = (users || []).filter(u => u.is_suspended);
    const content = $('#ggAdminContent');
    content.innerHTML = `<div class="gg-admin-kicker">Safety</div><h1 class="gg-admin-page-title">Moderatiecentrum</h1><p class="gg-admin-page-sub">Beheer geschorte accounts en controleer accountstatussen.</p>
      <section class="gg-admin-card"><div class="gg-admin-card-head"><div>${icon('shield-ban')}</div><div><h3>Geschorte accounts</h3><p>${suspended.length} momenteel geschorst</p></div></div><div class="gg-admin-table-wrap"><table class="gg-admin-table"><thead><tr><th>Gebruiker</th><th>Reden</th><th>Rol</th><th>Actie</th></tr></thead><tbody>${suspended.map(u=>`<tr><td><div class="gg-admin-user">${avatar(u)}<div><strong>${esc(u.display_name)}</strong><span>@${esc(u.username)}</span></div></div></td><td>${esc(u.suspension_reason||'Geen reden')}</td><td>${esc(u.role)}</td><td><button class="gg-admin-btn success gg-admin-unsuspend" data-id="${u.id}">${icon('shield-check')} Herstellen</button></td></tr>`).join('') || '<tr><td colspan="4">Geen geschorte accounts.</td></tr>'}</tbody></table></div></section>`;
    $$('.gg-admin-unsuspend',content).forEach(b=>b.onclick=async()=>{try{await rpc('admin_update_user',{p_token:A.token,p_user:b.dataset.id,p_verified:null,p_role:null,p_suspended:false,p_reason:null,p_private:null,p_allow_dms:null});toast('Schorsing opgeheven.');renderModeration();}catch(e){toast(e.message,'error')}});
  }

  async function renderSystem() {
    const s = await rpc('admin_dashboard_stats',{p_token:A.token});
    const content = $('#ggAdminContent');
    content.innerHTML = `<div class="gg-admin-kicker">Configuration</div><h1 class="gg-admin-page-title">Platform</h1><p class="gg-admin-page-sub">Systeeminformatie en beheerdersopties voor GG.Chat.</p>
      <section class="gg-admin-card"><div class="gg-admin-card-head"><div>${icon('database')}</div><div><h3>Database</h3><p>Supabase productieomgeving</p></div></div><div class="gg-admin-card-body" style="display:grid;grid-template-columns:repeat(2,minmax(0,1fr));gap:12px;font-size:11px"><div><span style="color:#697386">Profielen</span><strong style="display:block;font-size:18px">${fmt(s.users)}</strong></div><div><span style="color:#697386">Sociale objecten</span><strong style="display:block;font-size:18px">${fmt(Number(s.posts)+Number(s.likes)+Number(s.comments)+Number(s.follows))}</strong></div></div></section>
      <section class="gg-admin-card"><div class="gg-admin-card-head"><div>${icon('key-round')}</div><div><h3>Adminsessie</h3><p>Extra beveiligingslaag</p></div></div><div class="gg-admin-card-body"><p style="color:#8993a3;font-size:11px;line-height:1.7">De huidige adminsessie verloopt automatisch na maximaal 45 minuten. Je kunt hem direct beëindigen met de knop hieronder.</p><button class="gg-admin-btn danger" id="ggSystemLock">${icon('lock')} Nu vergrendelen</button></div></section>
      <section class="gg-admin-card"><div class="gg-admin-card-head"><div>${icon('info')}</div><div><h3>Belangrijk</h3><p>Wat niet in browsercode hoort</p></div></div><div class="gg-admin-card-body"><p style="color:#8993a3;font-size:11px;line-height:1.7">Service-role keys en het admin-wachtwoord worden bewust niet in GitHub opgeslagen. Platformbrede geheime instellingen horen uitsluitend in Supabase of server-side functies.</p></div></section>`;
    $('#ggSystemLock',content).onclick=lockConsole;
  }

  /* ---------- Public badge renderer ---------- */
  function setupBadgeEnhancer() {
    scheduleBadgeRefresh();
    A.observer = new MutationObserver(() => scheduleBadgeRefresh());
    A.observer.observe(document.body, { childList:true, subtree:true });
  }

  function scheduleBadgeRefresh() {
    clearTimeout(A.badgeTimer);
    A.badgeTimer = setTimeout(refreshVisibleBadges, 180);
  }

  async function refreshVisibleBadges() {
    if (!A.session && !document.body) return;
    const selectors = ['.post-card','.people-row','.profile-info','.account-chip','.notification-row','.search-result','.conversation-item'];
    const nodes = $$(selectors.join(',')).filter(n => !n.dataset.ggBadgeDone);
    if (!nodes.length) return;
    const mapped = [];
    const usernames = new Set();
    for (const node of nodes) {
      const m = node.textContent.match(/@([a-zA-Z0-9_.]{3,24})/);
      if (!m) continue;
      const username = m[1].toLowerCase();
      usernames.add(username);
      mapped.push({ node, username });
    }
    if (!usernames.size) return;
    const { data: profiles } = await client.from('profiles').select('id,username,followers_override,following_override,likes_override').in('username',[...usernames]);
    if (!profiles?.length) return;
    const ids = profiles.map(p=>p.id);
    const { data: rows } = await client.from('user_badges').select('user_id,badges:badge_id(slug,label,icon,color,priority)').in('user_id',ids);
    const badgeMap = new Map();
    for (const row of rows || []) {
      const badge = row.badges;
      if (!badge) continue;
      if (!badgeMap.has(row.user_id)) badgeMap.set(row.user_id,[]);
      badgeMap.get(row.user_id).push(badge);
    }
    const profileMap = new Map(profiles.map(p=>[p.username,p]));
    for (const item of mapped) {
      const p = profileMap.get(item.username); if (!p) continue;
      item.node.dataset.ggBadgeDone='1';
      const badges = (badgeMap.get(p.id)||[]).sort((a,b)=>(a.priority||100)-(b.priority||100));
      if (badges.length) attachNameBadges(item.node,badges);
      if (item.node.classList.contains('profile-info')) {
        attachProfileBadgeList(item.node,badges);
        applyStatOverrides(item.node,p);
      }
    }
    refreshIcons();
  }

  function attachNameBadges(container,badges) {
    if ($('.gg-name-badges',container)) return;
    const target = $('.post-name',container) || $('.profile-name',container) || $('.account-copy strong',container) || $('.copy strong',container) || $('strong',container);
    if (!target) return;
    const box=document.createElement('span'); box.className='gg-name-badges';
    box.innerHTML=badges.slice(0,4).map(b=>`<span class="gg-name-badge" style="background:${esc(b.color)}" title="${esc(b.label)}">${icon(b.icon)}</span>`).join('');
    target.appendChild(box);
  }

  function attachProfileBadgeList(container,badges) {
    if (!badges.length || $('.gg-profile-badge-list',container)) return;
    const anchor=$('.profile-handle',container) || $('.profile-name',container); if(!anchor)return;
    const list=document.createElement('div'); list.className='gg-profile-badge-list';
    list.innerHTML=badges.map(b=>`<span class="gg-profile-badge-pill" style="color:${esc(b.color)}">${icon(b.icon)} ${esc(b.label)}</span>`).join('');
    anchor.insertAdjacentElement('afterend',list);
  }

  function applyStatOverrides(container,p) {
    const stats=$('.profile-stats',container); if(!stats)return;
    const values=$$('button strong',stats);
    if (p.following_override != null && values[0]) values[0].textContent=fmt(p.following_override);
    if (p.followers_override != null && values[1]) values[1].textContent=fmt(p.followers_override);
    if (p.likes_override != null && !$('.gg-likes-stat',stats)) {
      const b=document.createElement('button'); b.className='gg-likes-stat'; b.innerHTML=`<strong>${fmt(p.likes_override)}</strong> <span>likes</span>`; stats.appendChild(b);
    }
  }

  document.addEventListener('DOMContentLoaded', init);
})();
