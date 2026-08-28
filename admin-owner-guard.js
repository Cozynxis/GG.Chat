/* Owner-only guard for GG.Chat Admin Console.
   Even another profile with role=admin will not keep the Admin Panel button
   unless a private admin credential exists for that exact auth user. */
(() => {
  const cfg = window.GG_CONFIG || {};
  if (!window.supabase || !cfg.SUPABASE_URL || !cfg.SUPABASE_ANON_KEY) return;
  const client = window.supabase.createClient(cfg.SUPABASE_URL, cfg.SUPABASE_ANON_KEY);
  let allowed = false;
  let resolved = false;

  async function resolve() {
    try {
      const { data: { session } } = await client.auth.getSession();
      if (!session) { allowed = false; resolved = true; enforce(); return; }
      const { data, error } = await client.rpc('admin_ui_allowed');
      allowed = !error && data === true;
      resolved = true;
      enforce();
    } catch {
      allowed = false;
      resolved = true;
      enforce();
    }
  }

  function enforce() {
    if (!resolved || allowed) return;
    document.querySelector('#ggAdminNav')?.remove();
    document.querySelector('.gg-admin-lock-overlay')?.remove();
    document.querySelector('.gg-admin-console')?.remove();
  }

  const observer = new MutationObserver(enforce);
  observer.observe(document.documentElement, { childList:true, subtree:true });
  document.addEventListener('DOMContentLoaded', resolve);
  client.auth.onAuthStateChange(() => resolve());
})();
