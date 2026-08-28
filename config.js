// GG.Chat runtime configuration.
// Supabase createClient() expects the PROJECT BASE URL only.
window.GG_CONFIG = Object.freeze({
  SUPABASE_URL: "https://cjhovegxxbpdabhnxhfj.supabase.co",
  SUPABASE_ANON_KEY: "sb_publishable_sASlmmqi_Y2yFPFjG4WRKQ_QnJCVoCC",

  APP_NAME: "GG.Chat",
  APP_VERSION: "2.1.0",
  APP_DESCRIPTION: "Praat. Deel. Ontdek.",

  // TIJDELIJKE simpele admin-gate.
  // LET OP: dit staat in publieke frontendcode en is dus GEEN echte beveiliging.
  // Verander dit wachtwoord voordat je de site deelt.
  PUBLIC_ADMIN_PASSWORD: "GGChat-Admin-2026",

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
