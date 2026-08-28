/* GG.Chat Public Test Admin Console
   TEST MODE ONLY:
   - Opened purely by the frontend password gate.
   - No role='admin' check.
   - No admin token/RPC login.
   - Reads normal public GG.Chat data through the regular client.
   - UI test overrides are stored locally in this browser.
*/
(() => {
  'use strict';

  const cfg = window.GG_CONFIG || {};
  const client = (window.supabase && cfg.SUPABASE_URL && cfg.SUPABASE_ANON_KEY)
    ? window.supabase.createClient(cfg.SUPABASE_URL, cfg.SUPABASE_ANON_KEY)
    : null;

  const $ = (s, root = document) => root.querySelector(s);
  const $$ = (s, root = document) => [...root.querySelectorAll(s)];
  const esc = (v = '') => String(v).replace(/[&<>"']/g, c => ({'&':'&amp;','<':'&lt;','>':'&gt;','"':'&quot;',"'":'&#39;'}[c]));
  const fmt = n => Number(n || 0).toLocaleString('nl-NL');
  const icon = name => `<i data-lucide="${esc(name)}"></i>`;

  const S = {
    tab: 'dashboard',
    users: [],
    overrides: JSON.parse(localStorage.getItem('gg_public_admin_overrides') || '{}'),
    badges: JSON.parse(localStorage.getItem('gg_public_admin_badges') || '{}')
  };

  const BADGES = [
    ['official','badge-check','Official'],['admin','shield-check','Admin'],['staff','shield','Staff'],
    ['moderator','badge-shield','Moderator'],['developer','code-2','Developer'],['creator','sparkles','Creator'],
    ['partner','handshake','Partner'],['premium','gem','Premium'],['og','crown','OG'],
    ['supporter','heart-handshake','Supporter'],['gamer','gamepad-2','Gamer'],['artist','palette','Artist'],
    ['music','music-2','Music'],['news','newspaper','News'],['education','graduation-cap','Education'],
    ['community','users','Community'],['verified-org','building-2','Verified Org'],['early','rocket','Early Adopter']
  ];

  function icons(root = document){ try { window.lucide?.createIcons({}, root); } catch { try { window.lucide?.createIcons(); } catch {} } }
  function toast(message, type=''){
    const host = $('#toastHost') || document.body;
    const el = document.createElement('div');
    el.className = `toast ${type}`;
    el.textContent = message;
    host.appendChild(el);
    setTimeout(() => el.remove(), 3000);
  }
  function avatar(u){
    if (u?.avatar_url) return `<img class="gg-admin-avatar" src="${esc(u.avatar_url)}" alt="">`;
    return `<div class="gg-admin-avatar">${esc((u?.display_name || u?.username || '?').slice(0,1).toUpperCase())}</div>`;
  }
  function saveLocal(){
    localStorage.setItem('gg_public_admin_overrides', JSON.stringify(S.overrides));
    localStorage.setItem('gg_public_admin_badges', JSON.stringify(S.badges));
  }

  async function safeCount(table){
    if (!client) return 0;
    try {
      const { count, error } = await client.from(table).select('*', { count:'exact', head:true });
      if (error) return 0;
      return count || 0;
    } catch { return 0; }
  }

  async function loadUsers(search=''){
    if (!client) { S.users = []; return []; }
    try {
      let q = client.from('profiles').select('id,username,display_name,avatar_url,verified,role,badge_label,is_private,allow_dms,created_at').order('created_at',{ascending:false}).limit(150);
      if (search.trim()) {
        const v = search.trim().replace(/[%_,]/g,'');
        q = q.or(`username.ilike.%${v}%,display_name.ilike.%${v}%`);
      }
      const { data, error } = await q;
      if (error) throw error;
      S.users = data || [];
      return S.users;
    } catch (e) {
      toast('Gebruikers konden niet worden geladen: ' + (e.message || e), 'error');
      S.users = [];
      return [];
    }
  }

  function open(){
    $('.gg-admin-console')?.remove();
    const el = document.createElement('div');
    el.className = 'gg-admin-console';
    el.innerHTML = `
      <div class="gg-admin-shell">
        <aside class="gg-admin-sidebar">
          <div class="gg-admin-brand"><div class="gg-admin-brand-mark">GG</div><div><strong>Admin Console</strong><span>Public test mode</span></div></div>
          <nav class="gg-admin-menu">
            ${menu('dashboard','layout-dashboard','Overzicht')}
            ${menu('users','users','Gebruikers')}
            ${menu('badges','badge-check','Badges')}
            ${menu('settings','sliders-horizontal','Testinstellingen')}
          </nav>
          <div class="gg-admin-sidebar-bottom"><button class="gg-admin-btn danger" id="ggPublicAdminLock">${icon('lock')}<span>Vergrendelen</span></button></div>
        </aside>
        <main class="gg-admin-main">
          <header class="gg-admin-topbar">
            <div><h2 id="ggPublicAdminTitle">Admin Console</h2><p>Frontend testomgeving — geen adminrol vereist</p></div>
            <div class="gg-admin-topbar-spacer"></div>
            <div class="gg-admin-live">PUBLIC TEST</div>
            <button class="gg-admin-close" id="ggPublicAdminPanelClose">${icon('x')}</button>
          </header>
          <div class="gg-admin-content" id="ggPublicAdminContent"></div>
        </main>
      </div>`;
    document.body.appendChild(el);
    $('#ggPublicAdminPanelClose', el).onclick = () => el.remove();
    $('#ggPublicAdminLock', el).onclick = () => {
      sessionStorage.removeItem('gg_public_admin_unlocked');
      el.remove();
      toast('Admin Panel vergrendeld.');
    };
    $$('.gg-admin-menu [data-public-tab]', el).forEach(b => b.onclick = () => render(b.dataset.publicTab));
    icons(el);
    render(S.tab);
  }

  function menu(tab, ico, label){
    return `<button data-public-tab="${tab}" class="${S.tab===tab?'active':''}">${icon(ico)}<span>${label}</span></button>`;
  }

  async function render(tab){
    S.tab = tab;
    $$('.gg-admin-menu [data-public-tab]').forEach(b => b.classList.toggle('active', b.dataset.publicTab===tab));
    const titles = {dashboard:'Overzicht',users:'Gebruikersbeheer',badges:'Badges',settings:'Testinstellingen'};
    const title = $('#ggPublicAdminTitle'); if (title) title.textContent = titles[tab] || 'Admin Console';
    const box = $('#ggPublicAdminContent'); if (!box) return;
    box.innerHTML = `<section class="gg-admin-card"><div class="gg-admin-card-body">${icon('loader-circle')} Laden...</div></section>`;
    icons(box);
    if (tab==='dashboard') await dashboard(box);
    if (tab==='users') await users(box);
    if (tab==='badges') badges(box);
    if (tab==='settings') settings(box);
    icons(box);
  }

  async function dashboard(box){
    const [users,posts,likes,follows,comments,messages] = await Promise.all([
      safeCount('profiles'),safeCount('posts'),safeCount('likes'),safeCount('follows'),safeCount('comments'),safeCount('messages')
    ]);
    box.innerHTML = `
      <div class="gg-admin-kicker">PUBLIC TEST MODE</div>
      <h1 class="gg-admin-page-title">GG.Chat beheerconsole</h1>
      <p class="gg-admin-page-sub">Deze testconsole opent uitsluitend met het simpele frontendwachtwoord. Er is geen adminrol of extra adminlogin nodig.</p>
      <div class="gg-admin-stat-grid">
        ${stat('users','Gebruikers',users)}${stat('message-square','Posts',posts)}${stat('heart','Likes',likes)}
        ${stat('user-plus','Volgrelaties',follows)}${stat('message-circle','Reacties',comments)}${stat('messages-square','DM records',messages)}
      </div>
      <section class="gg-admin-card">
        <div class="gg-admin-card-head"><div>${icon('flask-conical')}</div><div><h3>Testmodus actief</h3><p>Geen Supabase-adminrechten nodig om deze console te openen.</p></div></div>
        <div class="gg-admin-card-body" style="line-height:1.75;color:#a7afbd">
          Badges en statistiek-overrides die je hier instelt worden voor deze testversie lokaal in deze browser opgeslagen. Zo kun je de volledige beheer-UI testen zonder speciale database-adminsetup.
        </div>
      </section>`;
  }

  function stat(i,l,v){ return `<div class="gg-admin-stat"><div class="ico">${icon(i)}</div><strong>${fmt(v)}</strong><span>${esc(l)}</span></div>`; }

  async function users(box, search=''){
    const list = await loadUsers(search);
    box.innerHTML = `
      <div class="gg-admin-kicker">Accounts</div><h1 class="gg-admin-page-title">Gebruikersbeheer</h1>
      <p class="gg-admin-page-sub">Bekijk accounts en test badges/statistieken zonder adminrol.</p>
      <section class="gg-admin-card">
        <div class="gg-admin-card-body">
          <form class="gg-admin-search" id="ggPublicUserSearch"><input id="ggPublicUserQuery" value="${esc(search)}" placeholder="Naam of @gebruikersnaam"><button class="gg-admin-btn primary">${icon('search')} Zoeken</button></form>
        </div>
      </section>
      <div class="gg-admin-user-list">
        ${list.length ? list.map(userRow).join('') : `<section class="gg-admin-card"><div class="gg-admin-card-body">Geen gebruikers gevonden.</div></section>`}
      </div>`;
    $('#ggPublicUserSearch', box)?.addEventListener('submit', e => { e.preventDefault(); users(box, $('#ggPublicUserQuery',box).value); });
    $$('[data-test-user]', box).forEach(b => b.onclick = () => openUser(b.dataset.testUser));
  }

  function userRow(u){
    const ov = S.overrides[u.id] || {};
    const badgeCount = (S.badges[u.id] || []).length;
    return `<section class="gg-admin-card"><div class="gg-admin-card-body" style="display:flex;align-items:center;gap:12px">
      ${avatar(u)}<div style="min-width:0;flex:1"><strong>${esc(u.display_name || u.username)} ${u.verified?'✓':''}</strong><div style="color:#8993a3;font-size:11px">@${esc(u.username)} · ${esc(u.role || 'user')}</div><div style="color:#697386;font-size:10px">Testbadges: ${badgeCount} · Likes override: ${ov.likes ?? 'auto'}</div></div>
      <button class="gg-admin-btn" data-test-user="${u.id}">${icon('settings')} Beheren</button>
    </div></section>`;
  }

  function openUser(id){
    const u = S.users.find(x=>x.id===id); if (!u) return;
    const ov = S.overrides[id] || {};
    const currentBadges = S.badges[id] || [];
    document.querySelector('.gg-public-user-overlay')?.remove();
    const overlay = document.createElement('div');
    overlay.className='gg-admin-lock-overlay gg-public-user-overlay';
    overlay.innerHTML=`<div class="gg-admin-lock" style="max-width:620px;width:min(620px,92vw)">
      <div style="display:flex;gap:12px;align-items:center">${avatar(u)}<div><h2 style="margin:0">${esc(u.display_name || u.username)}</h2><p style="margin:3px 0 0">@${esc(u.username)}</p></div></div>
      <div class="gg-admin-form-grid" style="margin-top:18px">
        <label>Volgers override<input id="puFollowers" type="number" min="0" placeholder="Automatisch" value="${ov.followers ?? ''}"></label>
        <label>Volgend override<input id="puFollowing" type="number" min="0" placeholder="Automatisch" value="${ov.following ?? ''}"></label>
        <label>Likes override<input id="puLikes" type="number" min="0" placeholder="Automatisch" value="${ov.likes ?? ''}"></label>
      </div>
      <h3>Testbadges</h3>
      <div style="display:flex;gap:7px;flex-wrap:wrap">${BADGES.map(([key,ico,label])=>`<label class="gg-admin-chip"><input type="checkbox" data-pu-badge="${key}" ${currentBadges.includes(key)?'checked':''}> ${icon(ico)} ${esc(label)}</label>`).join('')}</div>
      <div class="gg-admin-lock-actions" style="margin-top:18px"><button class="gg-admin-btn" id="puCancel">Annuleren</button><button class="gg-admin-btn primary" id="puSave">${icon('save')} Opslaan</button></div>
    </div>`;
    document.body.appendChild(overlay);
    $('#puCancel',overlay).onclick=()=>overlay.remove();
    $('#puSave',overlay).onclick=()=>{
      const num = sel => { const v=$(sel,overlay).value.trim(); return v==='' ? undefined : Math.max(0,Number(v)||0); };
      const next={};
      const f=num('#puFollowers'), g=num('#puFollowing'), l=num('#puLikes');
      if (f!==undefined) next.followers=f; if (g!==undefined) next.following=g; if (l!==undefined) next.likes=l;
      S.overrides[id]=next;
      S.badges[id]=$$('[data-pu-badge]:checked',overlay).map(x=>x.dataset.puBadge);
      saveLocal(); overlay.remove(); toast('Testinstellingen opgeslagen.'); render('users');
    };
    icons(overlay);
  }

  function badges(box){
    box.innerHTML=`<div class="gg-admin-kicker">Badge library</div><h1 class="gg-admin-page-title">Badges</h1><p class="gg-admin-page-sub">Beschikbare badges voor de publieke testconsole.</p><div class="gg-admin-stat-grid">${BADGES.map(([key,ico,label])=>`<div class="gg-admin-stat"><div class="ico">${icon(ico)}</div><strong style="font-size:14px">${esc(label)}</strong><span>${esc(key)}</span></div>`).join('')}</div>`;
  }

  function settings(box){
    box.innerHTML=`<div class="gg-admin-kicker">Test config</div><h1 class="gg-admin-page-title">Testinstellingen</h1><p class="gg-admin-page-sub">Frontend-only beheeropties.</p>
      <section class="gg-admin-card"><div class="gg-admin-card-head"><div>${icon('database-zap')}</div><div><h3>Lokale testdata</h3><p>Reset alle lokale badge- en tellerwijzigingen.</p></div></div><div class="gg-admin-card-body"><button class="gg-admin-btn danger" id="ggResetPublicAdmin">${icon('trash-2')} Testdata resetten</button></div></section>`;
    $('#ggResetPublicAdmin',box).onclick=()=>{ S.overrides={};S.badges={};saveLocal();toast('Lokale admin-testdata gewist.'); };
  }

  window.GGPublicAdminPanel = { open };
})();
