// Headers for Supabase's REST API. New-style keys (sb_publishable_…, sb_secret_…) go in `apikey` only;
// legacy JWT keys also go in Authorization.
export const headers = key => (key.startsWith('sb_') ? { apikey: key } : { apikey: key, Authorization: `Bearer ${key}` });

/** GET every row of a REST query, 1000 at a time. */
export async function getAll(url, key, path) {
  const out = [];
  for (let from = 0; ; from += 1000) {
    const res = await fetch(`${url}/rest/v1/${path}`, { headers: { ...headers(key), Range: `${from}-${from + 999}`, 'Range-Unit': 'items' } });
    if (!res.ok) throw new Error(`${path}: ${res.status} ${await res.text()}`);
    const rows = await res.json();
    out.push(...rows);
    if (rows.length < 1000) return out;
  }
}
