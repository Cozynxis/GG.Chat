// GG.Chat runtime configuration.
// IMPORTANT: Supabase createClient() expects the PROJECT BASE URL only.
// Do NOT append /rest/v1/, /auth/v1/ or any other API path here.
// The publishable/anon key is safe to expose in browser code when RLS is configured correctly.
window.GG_CONFIG = Object.freeze({
  SUPABASE_URL: "https://cjhovegxxbpdabhnxhfj.supabase.co",
  SUPABASE_ANON_KEY: "sb_publishable_sASlmmqi_Y2yFPFjG4WRKQ_QnJCVoCC",

  APP_NAME: "GG.Chat",
  APP_VERSION: "2.0.0",
  APP_DESCRIPTION: "Praat. Deel. Ontdek.",

  // GitHub Pages-safe URL. Hash routing keeps navigation inside index.html.
  get APP_BASE_URL() {
    const path = window.location.pathname.endsWith("/")
      ? window.location.pathname
      : window.location.pathname.replace(/[^/]+$/, "");
    return `${window.location.origin}${path}`;
  },

  get AUTH_REDIRECT_URL() {
    const path = window.location.pathname.endsWith("/")
      ? window.location.pathname
      : window.location.pathname.replace(/[^/]+$/, "");
    return `${window.location.origin}${path}`;
  }
});
