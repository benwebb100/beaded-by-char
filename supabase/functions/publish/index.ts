// POST from the admin portal (signed in): rebuild the website so catalogue edits go live.
import { db, rebuildSite, serveJson } from '../_shared/runtime.ts';

serveJson(async req => {
  const jwt = (req.headers.get('Authorization') ?? '').replace(/^Bearer\s+/i, '');
  const { data: { user } } = await db().auth.getUser(jwt);
  if (!user) return { status: 401, body: { error: 'Please sign in again.' } };
  const { data: admin } = await db().from('admins').select('user_id').eq('user_id', user.id).maybeSingle();
  if (!admin) return { status: 403, body: { error: 'Not an admin.' } };
  await rebuildSite();
  return { status: 200, body: { ok: true } };
});
