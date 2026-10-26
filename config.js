// The Arete Room at Lavender's settings.
// Paste your Supabase "Project URL" and the public "anon" (or "publishable") key here.
// The anon key is meant to be public: on its own it cannot read anything.
// NEVER put the service_role / secret key in this file.
// While these still say YOUR_..., the app runs as a practice demo on this phone only.
//
// VAPID_PUBLIC_KEY turns on phone alerts. It is the PUBLIC half made by
//   node tools/arete-admin.mjs make-vapid-keys
// (the private half stays in _secrets on Tiffany's Mac). Leave it as is to keep alerts off.
window.ARETE_CONFIG = {
  SUPABASE_URL: "YOUR_SUPABASE_URL",
  SUPABASE_ANON_KEY: "YOUR_SUPABASE_ANON_KEY",
  VAPID_PUBLIC_KEY: "YOUR_VAPID_PUBLIC_KEY"
};
