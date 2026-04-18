// Triage Playbook runtime config.
// These two values are safe to expose (anon key is designed to be public + RLS-protected).
// Service-role key, Anthropic key, and Resend key stay in Netlify Functions only.
window.TP_CONFIG = {
  SUPABASE_URL: 'https://tfizrgevpajadduuzhdl.supabase.co',
  SUPABASE_ANON_KEY: 'eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.eyJpc3MiOiJzdXBhYmFzZSIsInJlZiI6InRmaXpyZ2V2cGFqYWRkdXV6aGRsIiwicm9sZSI6ImFub24iLCJpYXQiOjE3NzQ0Njk3NTIsImV4cCI6MjA5MDA0NTc1Mn0.4CqATB1iGckQd4ErWdcdAoyQZbrtXYkAjOGE6gzDL9I',
  STORAGE_BUCKET: 'triage-playbook',
  APP_NAME: 'Triage Playbook'
};
