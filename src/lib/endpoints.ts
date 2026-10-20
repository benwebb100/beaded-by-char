// Edge function URLs. Set PUBLIC_SUPABASE_URL and these follow; the explicit overrides are for testing.
const sb = import.meta.env.PUBLIC_SUPABASE_URL ?? '';
export const CHECKOUT_URL = import.meta.env.PUBLIC_CHECKOUT_ENDPOINT || (sb && `${sb}/functions/v1/checkout`);
export const NEWSLETTER_URL = import.meta.env.PUBLIC_NEWSLETTER_ENDPOINT || (sb && `${sb}/functions/v1/newsletter`);
