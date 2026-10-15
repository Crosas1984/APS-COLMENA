export const supabase = {
  url: import.meta.env.VITE_SUPABASE_URL?.replace(/\/$/, ''),
  anonKey: import.meta.env.VITE_SUPABASE_ANON_KEY,
};

export const supabaseConfigured = Boolean(supabase.url && supabase.anonKey);
export const dataSource = supabaseConfigured ? 'Supabase conectado' : 'Modo demo';

const stateEndpoint = () => `${supabase.url}/rest/v1/aps_master_state`;
const headers = () => ({
  apikey: supabase.anonKey ?? '',
  Authorization: `Bearer ${supabase.anonKey ?? ''}`,
  'Content-Type': 'application/json',
});

export async function loadMasterState() {
  if (!supabaseConfigured) return null;
  const response = await fetch(`${stateEndpoint()}?id=eq.default&select=records`, { headers: headers() });
  if (!response.ok) throw new Error(`Supabase GET ${response.status}`);
  const rows = await response.json() as Array<{ records?: Record<string, unknown> }>;
  return rows[0]?.records ?? null;
}

export async function saveMasterState(records: Record<string, unknown>) {
  if (!supabaseConfigured) return;
  const response = await fetch(stateEndpoint(), {
    method: 'POST',
    headers: { ...headers(), Prefer: 'resolution=merge-duplicates,return=minimal' },
    body: JSON.stringify({ id: 'default', records }),
  });
  if (!response.ok) throw new Error(`Supabase POST ${response.status}`);
}
