// POST { first_name, last_name, email } from the site's newsletter form.
import { subscribe } from '../_shared/shop.ts';
import { deps, serveJson } from '../_shared/runtime.ts';

serveJson(async req => subscribe(await req.json().catch(() => null), deps()));
