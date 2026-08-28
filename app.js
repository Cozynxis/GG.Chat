const GG = (() => {
  const cfg = window.GG_CONFIG || {};
  const hasConfig = cfg.SUPABASE_URL && !cfg.SUPABASE_URL.includes('YOUR-PROJECT') && cfg.SUPABASE_ANON_KEY && !cfg.SUPABASE_ANON_KEY.includes('YOUR-ANON');
  const supabase = hasConfig ? window.supabase.createClient(cfg.SUPABASE_URL, cfg.SUPABASE_ANON_KEY) : null;

  const state = {
    session: null,
    me: null,
    route: 'home',
    activeProfile: null,
    activeConversation: null,
    subscriptions: [],
    feed: [],
    suggested: [],
  };

  const $ = (s, root = document) => root.querySelector(s);
  const $$ = (s, root = document) => [...root.querySelectorAll(s)];
  const esc = (v = '') => String(v).replace(/[&<>'"]/g, c => ({'&':'&amp;','<':'&lt;','>':'&gt;',"'":'&#39;','"':'&quot;'}[c]));
  const timeAgo = (date) => {
    if (!date) return '';
    const s = Math.max(1, Math.floor((Date.now() - new Date(date).getTime()) / 1000));
    if (s < 60) return `${s}s`;
    if (s < 3600) return `${Math.floor(s/60)}m`;
    if (s < 86400) return `${Math.floor(s/3600)}u`;
    if (s < 604800) return `${Math.floor(s/86400)}d`;
    return new Date(date).toLocaleDateString('nl-NL', { day:'numeric', month:'short' });
  };
  const avatar = (p, size = '') => p?.avatar_url
    ? `<img class="avatar ${size}" src="${esc(p.avatar_url)}" alt="${esc(p.display_name || p.username || '')}">`
    : `<div class="avatar avatar-fallback ${size}">${esc((p?.display_name || p?.username || '?').slice(0,1).toUpperCase())}</div>`;
  const verified = (p) => p?.verified ? `<span class="verified" title="Officieel geverifieerd">✓</span>` : '';
  const roleBadge = (p) => p?.badge_label ? `<span class="badge-pill">${esc(p.badge_label)}</span>` : '';
  const empty = (icon, title, text) => `<div class="empty-state"><div class="empty-icon"><i data-lucide="${icon}"></i></div><h3>${esc(title)}</h3><p>${esc(text)}</p></div>`;

  function icons(){ if (window.lucide) window.lucide.createIcons(); }
  function toast(message, type='success'){
    const el = document.createElement('div');
    el.className = `toast ${type}`;
    el.textContent = message;
    $('#toastHost').appendChild(el);
    setTimeout(() => el.remove(), 3200);
  }
  function closeModal(){ $('#modalBackdrop').classList.add('hidden'); $('#modal').innerHTML=''; }
  function openModal(html){ $('#modal').innerHTML = html; $('#modalBackdrop').classList.remove('hidden'); icons(); }
  function loadingPage(title='Laden...'){ $('#pageContent').innerHTML = `<div class="page-header"><h2>${esc(title)}</h2></div><div class="skeleton-row"></div><div class="skeleton-row"></div><div class="skeleton-row"></div>`; }
  function ensureBackend(){
    if (!supabase) {
      toast('Koppel eerst Supabase in config.js om accounts en data te gebruiken.', 'error');
      return false;
    }
    return true;
  }

  async function init(){
    bindStatic();
    icons();
    if (!supabase) {
      $('#authScreen').classList.remove('hidden');
      toast('Demo-UI geladen. Voeg je Supabase URL en anon key toe in config.js.', 'error');
      return;
    }
    const { data: { session } } = await supabase.auth.getSession();
    state.session = session;
    if (session) await enterApp(); else showAuth();
    supabase.auth.onAuthStateChange(async (event, session) => {
      state.session = session;
      if (event === 'SIGNED_IN' && session) await enterApp();
      if (event === 'SIGNED_OUT') showAuth();
    });
  }

  function bindStatic(){
    $$('.auth-tab').forEach(btn => btn.addEventListener('click', () => {
      $$('.auth-tab').forEach(x => x.classList.toggle('active', x === btn));
      $('#loginForm').classList.toggle('hidden', btn.dataset.authTab !== 'login');
      $('#registerForm').classList.toggle('hidden', btn.dataset.authTab !== 'register');
    }));

    $('#loginForm').addEventListener('submit', login);
    $('#registerForm').addEventListener('submit', register);
    $('#forgotPasswordBtn').addEventListener('click', forgotPassword);
    $('#modalBackdrop').addEventListener('click', e => { if(e.target.id === 'modalBackdrop') closeModal(); });
    document.addEventListener('keydown', e => {
      if(e.key === 'Escape') closeModal();
      if(e.key === '/' && !['INPUT','TEXTAREA'].includes(document.activeElement.tagName)) { e.preventDefault(); $('#globalSearch')?.focus(); }
    });
    document.addEventListener('click', e => {
      const route = e.target.closest('[data-route]');
      if(route){ navigate(route.dataset.route); }
    });
    $('#composeSidebarBtn').addEventListener('click', composeModal);
    $('#mobileComposeBtn').addEventListener('click', composeModal);
    $('#mobileProfileBtn').addEventListener('click', () => navigate('profile'));
    $('#globalSearch').addEventListener('input', debounce(globalSearch, 250));
  }

  function showAuth(){
    cleanupRealtime();
    state.me = null;
    $('#app').classList.add('hidden');
    $('#authScreen').classList.remove('hidden');
    icons();
  }

  async function login(e){
    e.preventDefault(); if(!ensureBackend()) return;
    const btn = e.submitter; btn.disabled = true;
    const { error } = await supabase.auth.signInWithPassword({ email: $('#loginEmail').value.trim(), password: $('#loginPassword').value });
    btn.disabled = false;
    if(error) toast(error.message, 'error');
  }

  async function register(e){
    e.preventDefault(); if(!ensureBackend()) return;
    const username = $('#registerUsername').value.trim().toLowerCase();
    if(!/^[a-z0-9_.]{3,24}$/.test(username)) return toast('Gebruikersnaam: 3-24 tekens, alleen letters, cijfers, _ en .', 'error');
    const { data: exists } = await supabase.from('profiles').select('id').eq('username', username).maybeSingle();
    if(exists) return toast('Deze gebruikersnaam is al bezet.', 'error');
    const btn = e.submitter; btn.disabled = true;
    const { error } = await supabase.auth.signUp({
      email: $('#registerEmail').value.trim(),
      password: $('#registerPassword').value,
      options: { data: { username, display_name: $('#registerName').value.trim() } }
    });
    btn.disabled = false;
    if(error) toast(error.message, 'error'); else toast('Account gemaakt! Controleer eventueel je e-mail om te bevestigen.');
  }

  async function forgotPassword(){
    if(!ensureBackend()) return;
    const email = $('#loginEmail').value.trim();
    if(!email) return toast('Vul eerst je e-mailadres in.', 'error');
    const { error } = await supabase.auth.resetPasswordForEmail(email, { redirectTo: location.origin + location.pathname });
    if(error) toast(error.message, 'error'); else toast('Herstellink verzonden.');
  }

  async function enterApp(){
    $('#authScreen').classList.add('hidden');
    $('#app').classList.remove('hidden');
    const uid = state.session.user.id;
    let { data: profile } = await supabase.from('profiles').select('*').eq('id', uid).maybeSingle();
    if(!profile){
      const m = state.session.user.user_metadata || {};
      const username = (m.username || `user_${uid.slice(0,6)}`).toLowerCase();
      const { data } = await supabase.from('profiles').insert({ id: uid, username, display_name: m.display_name || username }).select().single();
      profile = data;
    }
    state.me = profile;
    renderSidebarAccount();
    await Promise.all([loadSuggested(), updateUnreadCounts()]);
    setupRealtime();
    navigate(location.hash.replace('#/','') || 'home', false);
  }

  function renderSidebarAccount(){
    $('#sidebarAccount').innerHTML = `<button class="account-chip" data-route="profile" style="width:100%;border:0;background:transparent;text-align:left">${avatar(state.me)}<span class="account-copy"><strong>${esc(state.me.display_name)} ${verified(state.me)}</strong><span>@${esc(state.me.username)}</span></span><i data-lucide="more-horizontal" style="width:17px;color:var(--muted)"></i></button>`;
    icons();
  }

  function navigate(route, push=true){
    if(!state.me) return;
    state.route = route || 'home';
    if(push) history.replaceState({}, '', `#/${state.route}`);
    $$('.nav-item,[data-route].mobile-nav button').forEach(x => x.classList.toggle('active', x.dataset.route === state.route));
    const titles = {home:'Home',explore:'Ontdekken',messages:'Berichten',notifications:'Meldingen',profile:'Profiel',settings:'Instellingen'};
    $('#mobileTitle').textContent = titles[state.route] || 'GG.Chat';
    if(state.route === 'home') renderHome();
    else if(state.route === 'explore') renderExplore();
    else if(state.route === 'messages') renderMessages();
    else if(state.route === 'notifications') renderNotifications();
    else if(state.route === 'profile') renderProfile(state.me.username);
    else if(state.route === 'settings') renderSettings();
    else if(state.route.startsWith('u/')) renderProfile(state.route.slice(2));
    else renderHome();
    window.scrollTo({top:0,behavior:'instant'});
  }

  async function renderHome(){
    loadingPage('Home');
    $('#pageContent').innerHTML = `<div class="page-header"><div><h2>Home</h2><div class="sub">Jouw tijdlijn</div></div><div class="header-spacer"></div><button class="icon-btn" id="refreshFeed"><i data-lucide="refresh-cw"></i></button></div>
      <section class="composer">${avatar(state.me)}<div><textarea id="composerText" maxlength="1000" placeholder="Wat gebeurt er?"></textarea><div class="composer-tools"><div class="tool-buttons"><button class="tool-btn" id="composerImage"><i data-lucide="image"></i></button><button class="tool-btn"><i data-lucide="smile"></i></button><button class="tool-btn"><i data-lucide="hash"></i></button></div><button id="postBtn" class="primary-btn">Plaatsen</button></div></div></section>
      <div id="feed"></div>`;
    $('#postBtn').addEventListener('click', () => createPost($('#composerText').value));
    $('#composerImage').addEventListener('click', () => imagePostModal());
    $('#refreshFeed').addEventListener('click', loadFeed);
    icons(); await loadFeed();
  }

  async function loadFeed(){
    const feed = $('#feed'); if(!feed) return;
    feed.innerHTML = `<div class="skeleton-row"></div><div class="skeleton-row"></div>`;
    const { data, error } = await supabase.from('posts').select(`id,user_id,content,image_url,created_at,profiles:user_id(id,username,display_name,avatar_url,verified,badge_label),likes(user_id),comments(id)`).order('created_at',{ascending:false}).limit(80);
    if(error){ feed.innerHTML = empty('triangle-alert','Feed kon niet laden',error.message); icons(); return; }
    state.feed = data || [];
    feed.innerHTML = data?.length ? data.map(postHTML).join('') : empty('message-square','Nog geen berichten','Plaats het eerste bericht op GG.Chat.');
    bindPostActions(feed); icons();
  }

  function postHTML(p){
    const mineLiked = p.likes?.some(l => l.user_id === state.me.id);
    return `<article class="post-card" data-post-id="${p.id}">${avatar(p.profiles)}<div class="post-main"><div class="post-head"><button class="post-name open-profile" data-username="${esc(p.profiles?.username)}" style="border:0;background:transparent;padding:0">${esc(p.profiles?.display_name || 'Gebruiker')} ${verified(p.profiles)}</button><span class="post-username">@${esc(p.profiles?.username || 'unknown')}</span><span class="post-time">${timeAgo(p.created_at)}</span><button class="post-menu"><i data-lucide="more-horizontal"></i></button></div><div class="post-body">${linkify(esc(p.content || ''))}</div>${p.image_url ? `<div class="post-media"><img src="${esc(p.image_url)}" alt="Afbeelding bij bericht"></div>`:''}<div class="post-actions"><button class="post-action comment-action"><i data-lucide="message-circle"></i><span>${p.comments?.length || 0}</span></button><button class="post-action"><i data-lucide="repeat-2"></i><span>0</span></button><button class="post-action like-action ${mineLiked?'liked':''}"><i data-lucide="heart"></i><span>${p.likes?.length || 0}</span></button><button class="post-action share-action"><i data-lucide="share"></i></button></div></div></article>`;
  }

  function linkify(text){ return text.replace(/(^|\s)(#[\wÀ-ÿ]+)/g,'$1<span style="color:#9b90ff">$2</span>').replace(/(^|\s)(@[a-zA-Z0-9_.]+)/g,'$1<span style="color:#9b90ff">$2</span>'); }
  function bindPostActions(root){
    $$('.open-profile',root).forEach(b=>b.onclick=()=>navigate(`u/${b.dataset.username}`));
    $$('.like-action',root).forEach(b=>b.onclick=()=>toggleLike(b.closest('[data-post-id]').dataset.postId,b));
    $$('.comment-action',root).forEach(b=>b.onclick=()=>commentsModal(b.closest('[data-post-id]').dataset.postId));
    $$('.share-action',root).forEach(b=>b.onclick=async()=>{ await navigator.clipboard?.writeText(`${location.origin}${location.pathname}#/post/${b.closest('[data-post-id]').dataset.postId}`); toast('Link gekopieerd.'); });
    $$('.post-menu',root).forEach(b=>b.onclick=()=>postMenu(b.closest('[data-post-id]').dataset.postId));
  }

  async function createPost(content, imageUrl=null){
    const text = String(content || '').trim();
    if(!text && !imageUrl) return toast('Schrijf eerst iets.', 'error');
    const { error } = await supabase.from('posts').insert({ user_id:state.me.id, content:text, image_url:imageUrl || null });
    if(error) toast(error.message,'error'); else { toast('Bericht geplaatst.'); await renderHome(); }
  }

  function composeModal(){
    openModal(`<div class="modal-head"><h3>Nieuw bericht</h3><button class="icon-btn close-modal"><i data-lucide="x"></i></button></div><div class="modal-body compose-modal"><textarea id="modalPostText" maxlength="1000" placeholder="Deel iets met GG.Chat..."></textarea><input id="modalImageUrl" style="margin-top:10px" placeholder="Optionele afbeelding-URL"></div><div class="modal-actions"><button class="secondary-btn close-modal">Annuleren</button><button id="modalPostSubmit" class="primary-btn">Plaatsen</button></div>`);
    $$('.close-modal').forEach(b=>b.onclick=closeModal);
    $('#modalPostSubmit').onclick=async()=>{ const t=$('#modalPostText').value,u=$('#modalImageUrl').value.trim(); closeModal(); await createPost(t,u||null); };
  }
  function imagePostModal(){ composeModal(); setTimeout(()=>$('#modalImageUrl')?.focus(),50); }

  async function toggleLike(postId, button){
    const liked = button.classList.contains('liked');
    if(liked) await supabase.from('likes').delete().eq('post_id',postId).eq('user_id',state.me.id);
    else await supabase.from('likes').insert({post_id:postId,user_id:state.me.id});
    button.classList.toggle('liked',!liked);
    const n = $('span',button); n.textContent = Math.max(0, Number(n.textContent)+(liked?-1:1));
  }

  async function commentsModal(postId){
    const { data } = await supabase.from('comments').select(`id,content,created_at,user_id,profiles:user_id(username,display_name,avatar_url,verified)`).eq('post_id',postId).order('created_at');
    openModal(`<div class="modal-head"><h3>Reacties</h3><button class="icon-btn close-modal"><i data-lucide="x"></i></button></div><div class="modal-body"><div id="commentList">${data?.length?data.map(c=>`<div class="notification-row" style="padding-left:0;padding-right:0">${avatar(c.profiles,'sm')}<div class="notification-copy"><strong>${esc(c.profiles.display_name)} ${verified(c.profiles)}</strong> <span style="display:inline">@${esc(c.profiles.username)} · ${timeAgo(c.created_at)}</span><div style="margin-top:5px">${esc(c.content)}</div></div></div>`).join(''):empty('message-circle','Geen reacties','Wees de eerste die reageert.')}</div><div style="display:flex;gap:8px;margin-top:14px"><input id="commentInput" maxlength="500" placeholder="Schrijf een reactie"><button id="commentSend" class="primary-btn">Stuur</button></div></div>`);
    $('.close-modal').onclick=closeModal;
    $('#commentSend').onclick=async()=>{ const content=$('#commentInput').value.trim(); if(!content)return; const {error}=await supabase.from('comments').insert({post_id:postId,user_id:state.me.id,content}); if(error)toast(error.message,'error'); else commentsModal(postId); };
    icons();
  }

  async function postMenu(postId){
    const p = state.feed.find(x=>String(x.id)===String(postId));
    const mine = p?.user_id === state.me.id;
    openModal(`<div class="modal-head"><h3>Bericht</h3><button class="icon-btn close-modal"><i data-lucide="x"></i></button></div><div class="modal-body" style="display:flex;flex-direction:column;gap:8px">${mine?`<button id="deletePost" class="danger-btn"><i data-lucide="trash-2"></i> Bericht verwijderen</button>`:''}<button id="copyPost" class="secondary-btn"><i data-lucide="link"></i> Link kopiëren</button><button class="secondary-btn close-modal">Sluiten</button></div>`);
    $$('.close-modal').forEach(b=>b.onclick=closeModal);
    $('#copyPost').onclick=async()=>{await navigator.clipboard?.writeText(location.href);toast('Link gekopieerd.');closeModal();};
    if(mine) $('#deletePost').onclick=async()=>{ const {error}=await supabase.from('posts').delete().eq('id',postId).eq('user_id',state.me.id); if(error)toast(error.message,'error'); else{closeModal();toast('Bericht verwijderd.');loadFeed();} };
    icons();
  }

  async function renderExplore(){
    loadingPage('Ontdekken');
    const { data: people } = await supabase.from('profiles').select('*').neq('id',state.me.id).order('created_at',{ascending:false}).limit(30);
    const { data: posts } = await supabase.from('posts').select(`id,user_id,content,image_url,created_at,profiles:user_id(id,username,display_name,avatar_url,verified,badge_label),likes(user_id),comments(id)`).order('created_at',{ascending:false}).limit(20);
    $('#pageContent').innerHTML = `<div class="page-header"><h2>Ontdekken</h2></div><div class="explore-hero"><span class="eyebrow">ONTDEK GG.CHAT</span><h2>Vind jouw mensen.</h2><p>Zoek accounts, ontdek nieuwe creators en bekijk wat er nu speelt in de community.</p></div><div class="tabs"><button class="tab-btn active">Voor jou</button><button class="tab-btn">Mensen</button><button class="tab-btn">Trending</button></div><div class="people-list"><h3 style="font-size:14px">Nieuwe accounts</h3>${(people||[]).slice(0,8).map(personRow).join('')}</div><div>${(posts||[]).map(postHTML).join('')}</div>`;
    bindPeople($('#pageContent')); bindPostActions($('#pageContent')); icons();
  }

  function personRow(p){ return `<div class="people-row" data-person-id="${p.id}">${avatar(p)}<div class="copy"><button class="open-profile" data-username="${esc(p.username)}" style="border:0;background:transparent;padding:0;font-weight:800">${esc(p.display_name)} ${verified(p)}</button><span>@${esc(p.username)}</span>${p.bio?`<span style="color:#9da6b5;margin-top:5px">${esc(p.bio.slice(0,100))}</span>`:''}</div>${roleBadge(p)}<button class="secondary-btn follow-btn" data-user-id="${p.id}">Volgen</button></div>`; }
  function bindPeople(root){
    $$('.open-profile',root).forEach(b=>b.onclick=()=>navigate(`u/${b.dataset.username}`));
    $$('.follow-btn',root).forEach(b=>b.onclick=()=>toggleFollow(b.dataset.userId,b));
  }

  async function renderProfile(username){
    loadingPage('Profiel');
    const { data:p,error } = await supabase.from('profiles').select('*').eq('username',username).maybeSingle();
    if(error||!p){$('#pageContent').innerHTML=empty('user-x','Profiel niet gevonden','Dit account bestaat niet (meer).');icons();return;}
    state.activeProfile=p;
    const mine=p.id===state.me.id;
    const [{count:followers},{count:following},{data:posts},{data:followRow}] = await Promise.all([
      supabase.from('follows').select('*',{count:'exact',head:true}).eq('following_id',p.id),
      supabase.from('follows').select('*',{count:'exact',head:true}).eq('follower_id',p.id),
      supabase.from('posts').select(`id,user_id,content,image_url,created_at,profiles:user_id(id,username,display_name,avatar_url,verified,badge_label),likes(user_id),comments(id)`).eq('user_id',p.id).order('created_at',{ascending:false}),
      mine?Promise.resolve({data:null}):supabase.from('follows').select('*').eq('follower_id',state.me.id).eq('following_id',p.id).maybeSingle()
    ]);
    const bannerStyle=p.banner_url?`background-image:url('${esc(p.banner_url)}')`:'';
    $('#pageContent').innerHTML=`<div class="page-header"><button class="icon-btn" id="profileBack"><i data-lucide="arrow-left"></i></button><div><h2>${esc(p.display_name)}</h2><div class="sub">${posts?.length||0} berichten</div></div></div><div class="profile-banner" style="${bannerStyle}"></div><section class="profile-info"><div class="profile-avatar-row">${avatar(p,'xl')}<div class="profile-actions">${mine?`<button class="secondary-btn" data-route="settings">Profiel bewerken</button>`:`<button id="profileMessage" class="icon-btn"><i data-lucide="mail"></i></button><button id="profileFollow" class="${followRow?'secondary-btn':'primary-btn'}">${followRow?'Volgend':'Volgen'}</button>`}</div></div><div class="profile-name">${esc(p.display_name)} ${verified(p)} ${roleBadge(p)}</div><div class="profile-handle">@${esc(p.username)}</div>${p.bio?`<div class="profile-bio">${esc(p.bio)}</div>`:''}<div class="profile-meta">${p.location?`<span><i data-lucide="map-pin"></i>${esc(p.location)}</span>`:''}${p.website?`<span><i data-lucide="link"></i>${esc(p.website)}</span>`:''}<span><i data-lucide="calendar-days"></i>Lid sinds ${new Date(p.created_at).toLocaleDateString('nl-NL',{month:'long',year:'numeric'})}</span></div><div class="profile-stats"><button><strong>${following||0}</strong> <span>volgend</span></button><button><strong>${followers||0}</strong> <span>volgers</span></button></div></section><div class="tabs"><button class="tab-btn active">Berichten</button><button class="tab-btn">Reacties</button><button class="tab-btn">Media</button><button class="tab-btn">Likes</button></div><div id="profilePosts">${posts?.length?posts.map(postHTML).join(''):empty('message-square','Nog geen berichten','Hier verschijnen de berichten van dit account.')}</div>`;
    $('#profileBack').onclick=()=>history.length>1?history.back():navigate('home');
    if(!mine){ $('#profileFollow').onclick=()=>toggleFollow(p.id,$('#profileFollow'),true); $('#profileMessage').onclick=()=>startConversation(p); }
    bindPostActions($('#profilePosts')); icons();
  }

  async function toggleFollow(userId,button,onProfile=false){
    const { data:existing }=await supabase.from('follows').select('*').eq('follower_id',state.me.id).eq('following_id',userId).maybeSingle();
    if(existing){ await supabase.from('follows').delete().eq('follower_id',state.me.id).eq('following_id',userId); button.textContent='Volgen'; button.className='primary-btn follow-btn'; }
    else{ const {error}=await supabase.from('follows').insert({follower_id:state.me.id,following_id:userId}); if(error)return toast(error.message,'error'); button.textContent='Volgend'; button.className='secondary-btn follow-btn'; }
    if(onProfile && state.activeProfile) setTimeout(()=>renderProfile(state.activeProfile.username),150);
  }

  async function loadSuggested(){
    const {data}=await supabase.from('profiles').select('*').neq('id',state.me.id).limit(5);
    state.suggested=data||[];
    $('#suggestedUsers').innerHTML=state.suggested.length?state.suggested.map(p=>`<div class="suggest-user">${avatar(p,'sm')}<div class="account-copy"><strong>${esc(p.display_name)} ${verified(p)}</strong><span>@${esc(p.username)}</span></div><button class="secondary-btn suggest-follow" data-user-id="${p.id}">Volgen</button></div>`).join(''):`<div style="padding:15px;color:var(--muted);font-size:11px">Nog geen suggesties.</div>`;
    $$('.suggest-follow').forEach(b=>b.onclick=()=>toggleFollow(b.dataset.userId,b)); icons();
  }

  async function globalSearch(){
    const q=$('#globalSearch').value.trim(); const box=$('#searchDropdown');
    if(q.length<2){box.classList.add('hidden');return;}
    const pattern=`%${q.replace(/[%_]/g,'')}%`;
    const {data}=await supabase.from('profiles').select('*').or(`username.ilike.${pattern},display_name.ilike.${pattern}`).limit(8);
    box.innerHTML=data?.length?data.map(p=>`<button class="search-result" data-username="${esc(p.username)}">${avatar(p,'sm')}<span class="account-copy"><strong>${esc(p.display_name)} ${verified(p)}</strong><span>@${esc(p.username)}</span></span>${roleBadge(p)}</button>`).join(''):`<div style="padding:16px;color:var(--muted);font-size:12px">Geen accounts gevonden.</div>`;
    box.classList.remove('hidden');
    $$('.search-result',box).forEach(b=>b.onclick=()=>{box.classList.add('hidden');$('#globalSearch').value='';navigate(`u/${b.dataset.username}`)}); icons();
  }

  async function renderMessages(){
    loadingPage('Berichten');
    const {data:convos}=await supabase.from('conversation_members').select(`conversation_id,conversations:conversation_id(id,updated_at,conversation_members(user_id,profiles:user_id(id,username,display_name,avatar_url,verified)))`).eq('user_id',state.me.id).order('joined_at',{ascending:false});
    const list=(convos||[]).map(x=>{const members=x.conversations?.conversation_members||[];const other=members.find(m=>m.user_id!==state.me.id)?.profiles||state.me;return{...x.conversations,other}});
    $('#pageContent').innerHTML=`<div class="messages-layout"><aside class="conversation-list" id="conversationList"><div class="page-header" style="position:sticky"><h2>Berichten</h2><div class="header-spacer"></div><button id="newDm" class="icon-btn"><i data-lucide="square-pen"></i></button></div><div class="conversation-search"><input id="dmSearch" placeholder="Zoek gesprekken"></div><div id="conversationItems">${list.length?list.map(c=>conversationItem(c)).join(''):empty('messages-square','Geen gesprekken','Start een privégesprek met iemand.')}</div></aside><section class="chat-panel" id="chatPanel">${empty('message-circle-more','Jouw berichten','Kies links een gesprek of start een nieuw gesprek.')}</section></div>`;
    $('#newDm').onclick=newDmModal;
    $$('.conversation-item').forEach(b=>b.onclick=()=>openConversation(b.dataset.conversationId,list.find(c=>String(c.id)===String(b.dataset.conversationId))?.other));
    $('#dmSearch').oninput=e=>{const q=e.target.value.toLowerCase();$$('.conversation-item').forEach(x=>x.classList.toggle('hidden',!x.textContent.toLowerCase().includes(q)));}; icons();
  }
  function conversationItem(c){return `<button class="conversation-item" data-conversation-id="${c.id}">${avatar(c.other,'sm')}<span class="copy"><strong>${esc(c.other?.display_name||'Gesprek')} ${verified(c.other)}</strong><span>@${esc(c.other?.username||'')}</span></span></button>`;}

  async function newDmModal(){
    const {data}=await supabase.from('profiles').select('*').neq('id',state.me.id).limit(30);
    openModal(`<div class="modal-head"><h3>Nieuw gesprek</h3><button class="icon-btn close-modal"><i data-lucide="x"></i></button></div><div class="modal-body"><input id="newDmSearch" placeholder="Zoek een account"><div id="newDmPeople">${(data||[]).map(p=>`<button class="search-result dm-person" data-id="${p.id}" data-username="${esc(p.username)}">${avatar(p,'sm')}<span class="account-copy"><strong>${esc(p.display_name)} ${verified(p)}</strong><span>@${esc(p.username)}</span></span></button>`).join('')}</div></div>`);
    $('.close-modal').onclick=closeModal;
    $('#newDmSearch').oninput=e=>{const q=e.target.value.toLowerCase();$$('.dm-person').forEach(x=>x.classList.toggle('hidden',!x.textContent.toLowerCase().includes(q)));};
    $$('.dm-person').forEach(b=>b.onclick=async()=>{const p=data.find(x=>x.id===b.dataset.id);closeModal();await startConversation(p);});icons();
  }

  async function startConversation(person){
    const {data:mine}=await supabase.from('conversation_members').select('conversation_id').eq('user_id',state.me.id);
    let existing=null;
    for(const row of mine||[]){const {data:members}=await supabase.from('conversation_members').select('user_id').eq('conversation_id',row.conversation_id);if(members?.length===2&&members.some(m=>m.user_id===person.id)){existing=row.conversation_id;break;}}
    if(!existing){
      const {data:conv,error}=await supabase.from('conversations').insert({created_by:state.me.id}).select().single();
      if(error)return toast(error.message,'error'); existing=conv.id;
      const {error:memberError}=await supabase.from('conversation_members').insert([{conversation_id:existing,user_id:state.me.id},{conversation_id:existing,user_id:person.id}]);
      if(memberError)return toast(memberError.message,'error');
    }
    if(state.route!=='messages') await renderMessages();
    await openConversation(existing,person); navigate('messages');
  }

  async function openConversation(id,person){
    state.activeConversation=id;
    const panel=$('#chatPanel'); if(!panel)return;
    const {data:messages}=await supabase.from('messages').select('*').eq('conversation_id',id).order('created_at',{ascending:true}).limit(200);
    panel.classList.add('active'); $('#conversationList')?.classList.add('chat-open');
    panel.innerHTML=`<div class="chat-header"><button id="chatBack" class="icon-btn"><i data-lucide="arrow-left"></i></button>${avatar(person,'sm')}<div class="account-copy"><strong>${esc(person?.display_name||'Gesprek')} ${verified(person)}</strong><span>@${esc(person?.username||'')}</span></div></div><div id="chatMessages" class="chat-messages">${(messages||[]).map(messageBubble).join('')}</div><form id="chatForm" class="chat-form"><input id="chatInput" maxlength="2000" autocomplete="off" placeholder="Stuur een bericht..."><button class="primary-btn" type="submit"><i data-lucide="send"></i></button></form>`;
    $('#chatBack').onclick=()=>{$('#conversationList').classList.remove('chat-open');panel.classList.remove('active');state.activeConversation=null;};
    $('#chatForm').onsubmit=sendMessage; scrollChat(); await supabase.from('messages').update({read_at:new Date().toISOString()}).eq('conversation_id',id).neq('sender_id',state.me.id).is('read_at',null); icons();
  }
  function messageBubble(m){return `<div class="bubble ${m.sender_id===state.me.id?'me':''}">${esc(m.content)}<div class="bubble-time">${new Date(m.created_at).toLocaleTimeString('nl-NL',{hour:'2-digit',minute:'2-digit'})}</div></div>`;}
  function scrollChat(){const el=$('#chatMessages');if(el)el.scrollTop=el.scrollHeight;}
  async function sendMessage(e){e.preventDefault();const input=$('#chatInput'),content=input.value.trim();if(!content||!state.activeConversation)return;input.value='';const {error}=await supabase.from('messages').insert({conversation_id:state.activeConversation,sender_id:state.me.id,content});if(error)toast(error.message,'error');}

  async function renderNotifications(){
    loadingPage('Meldingen');
    const {data}=await supabase.from('notifications').select(`*,actor:actor_id(username,display_name,avatar_url,verified)`).eq('user_id',state.me.id).order('created_at',{ascending:false}).limit(80);
    await supabase.from('notifications').update({read:true}).eq('user_id',state.me.id).eq('read',false);
    $('#pageContent').innerHTML=`<div class="page-header"><h2>Meldingen</h2></div><div>${data?.length?data.map(notificationHTML).join(''):empty('bell-off','Geen meldingen','Nieuwe likes, volgers, reacties en andere updates verschijnen hier.')}</div>`;
    updateUnreadCounts(); icons();
  }
  function notificationHTML(n){const labels={follow:'is je gaan volgen',like:'vindt je bericht leuk',comment:'reageerde op je bericht',message:'stuurde je een bericht'};return `<div class="notification-row">${avatar(n.actor,'sm')}<div class="notification-copy"><strong>${esc(n.actor?.display_name||'Iemand')} ${verified(n.actor)}</strong> ${esc(labels[n.type]||n.text||'heeft een nieuwe activiteit')}.<span>${timeAgo(n.created_at)}</span></div></div>`;}

  async function renderSettings(){
    const p=state.me;
    $('#pageContent').innerHTML=`<div class="page-header"><h2>Instellingen</h2></div><div class="settings-wrap"><section class="settings-section"><h3>Profiel aanpassen</h3><form id="profileSettings" class="settings-form"><div class="form-grid-2"><label>Weergavenaam<input id="setName" maxlength="40" value="${esc(p.display_name||'')}"></label><label>Gebruikersnaam<input id="setUsername" maxlength="24" value="${esc(p.username||'')}"></label></div><label>Bio<textarea id="setBio" maxlength="240">${esc(p.bio||'')}</textarea></label><div class="form-grid-2"><label>Locatie<input id="setLocation" maxlength="80" value="${esc(p.location||'')}"></label><label>Website<input id="setWebsite" maxlength="200" value="${esc(p.website||'')}"></label></div><label>Profielfoto URL<input id="setAvatar" value="${esc(p.avatar_url||'')}"></label><label>Banner URL<input id="setBanner" value="${esc(p.banner_url||'')}"></label><div class="settings-actions"><button class="primary-btn" type="submit">Wijzigingen opslaan</button></div></form></section><section class="settings-section"><h3>Voorkeuren</h3><div class="setting-row"><div class="setting-copy"><strong>Privéaccount</strong><p>Nieuwe volgers moeten eerst worden goedgekeurd.</p></div><button class="toggle ${p.is_private?'on':''}" id="privacyToggle"></button></div><div class="setting-row"><div class="setting-copy"><strong>DM's ontvangen</strong><p>Sta privéberichten van andere gebruikers toe.</p></div><button class="toggle ${p.allow_dms!==false?'on':''}" id="dmToggle"></button></div></section><section class="settings-section"><h3>Account</h3><div class="setting-row"><div class="setting-copy"><strong>${esc(state.session.user.email)}</strong><p>Ingelogd account</p></div><button id="logoutBtn" class="secondary-btn">Uitloggen</button></div><div class="setting-row"><div class="setting-copy"><strong>Account verwijderen</strong><p>Je openbare content wordt verwijderd. Dit kan niet ongedaan worden gemaakt.</p></div><button id="deleteAccountBtn" class="danger-btn">Verwijderen</button></div></section></div>`;
    $('#profileSettings').onsubmit=saveProfile;
    $('#privacyToggle').onclick=()=>toggleSetting('is_private',$('#privacyToggle'));
    $('#dmToggle').onclick=()=>toggleSetting('allow_dms',$('#dmToggle'));
    $('#logoutBtn').onclick=()=>supabase.auth.signOut();
    $('#deleteAccountBtn').onclick=deleteAccountFlow; icons();
  }

  async function saveProfile(e){
    e.preventDefault(); const username=$('#setUsername').value.trim().toLowerCase();
    if(!/^[a-z0-9_.]{3,24}$/.test(username))return toast('Ongeldige gebruikersnaam.','error');
    const updates={display_name:$('#setName').value.trim(),username,bio:$('#setBio').value.trim(),location:$('#setLocation').value.trim()||null,website:$('#setWebsite').value.trim()||null,avatar_url:$('#setAvatar').value.trim()||null,banner_url:$('#setBanner').value.trim()||null,updated_at:new Date().toISOString()};
    const {data,error}=await supabase.from('profiles').update(updates).eq('id',state.me.id).select().single();
    if(error)toast(error.message,'error');else{state.me=data;renderSidebarAccount();toast('Profiel opgeslagen.');}
  }
  async function toggleSetting(key,btn){const value=!btn.classList.contains('on');const {error}=await supabase.from('profiles').update({[key]:value}).eq('id',state.me.id);if(error)toast(error.message,'error');else{btn.classList.toggle('on',value);state.me[key]=value;}}
  function deleteAccountFlow(){openModal(`<div class="modal-head"><h3>Account verwijderen?</h3><button class="icon-btn close-modal"><i data-lucide="x"></i></button></div><div class="modal-body"><p style="color:var(--muted);font-size:13px;line-height:1.6">Je profiel, berichten, likes, reacties en privédata worden verwijderd. De auth-gebruiker moet daarna vanuit Supabase of via een serverfunctie worden verwijderd.</p></div><div class="modal-actions"><button class="secondary-btn close-modal">Annuleren</button><button id="confirmDeleteProfile" class="danger-btn">Profiel verwijderen</button></div>`);$$('.close-modal').forEach(b=>b.onclick=closeModal);$('#confirmDeleteProfile').onclick=async()=>{await supabase.from('profiles').delete().eq('id',state.me.id);closeModal();await supabase.auth.signOut();};icons();}

  async function updateUnreadCounts(){
    const {count:n}=await supabase.from('notifications').select('*',{count:'exact',head:true}).eq('user_id',state.me.id).eq('read',false);
    const {count:m}=await supabase.from('messages').select('*',{count:'exact',head:true}).neq('sender_id',state.me.id).is('read_at',null);
    setBadge($('#notificationBadge'),n||0);setBadge($('#dmUnreadBadge'),m||0);
  }
  function setBadge(el,n){if(!el)return;el.textContent=n>99?'99+':String(n);el.classList.toggle('hidden',!n);}

  function setupRealtime(){
    cleanupRealtime();
    const messages = supabase.channel('gg-messages').on('postgres_changes',{event:'INSERT',schema:'public',table:'messages'},payload=>{if(payload.new.conversation_id===state.activeConversation){const box=$('#chatMessages');if(box){box.insertAdjacentHTML('beforeend',messageBubble(payload.new));scrollChat();} } updateUnreadCounts();}).subscribe();
    const posts = supabase.channel('gg-posts').on('postgres_changes',{event:'INSERT',schema:'public',table:'posts'},()=>{if(state.route==='home')loadFeed();}).subscribe();
    const notifications = supabase.channel('gg-notifications').on('postgres_changes',{event:'INSERT',schema:'public',table:'notifications',filter:`user_id=eq.${state.me.id}`},()=>updateUnreadCounts()).subscribe();
    state.subscriptions=[messages,posts,notifications];
  }
  function cleanupRealtime(){if(supabase)state.subscriptions.forEach(ch=>supabase.removeChannel(ch));state.subscriptions=[];}

  function debounce(fn,wait){let t;return(...args)=>{clearTimeout(t);t=setTimeout(()=>fn(...args),wait)}}
  return { init, navigate };
})();

document.addEventListener('DOMContentLoaded', GG.init);
