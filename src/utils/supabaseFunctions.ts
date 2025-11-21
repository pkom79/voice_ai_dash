export function getSupabaseFunctionUrl(functionName: string) {
  const sanitizedName = functionName.replace(/^\//, '');
  const supabaseUrl = import.meta.env.VITE_SUPABASE_URL?.replace(/\/$/, '');
  const isBrowser = typeof window !== 'undefined';
  const hostname = isBrowser ? window.location.hostname : '';
  const isLocalHost =
    hostname === 'localhost' || hostname === '127.0.0.1' || hostname === '';

  // In production (Vercel) we can rely on the /api rewrite which keeps the
  // request same-origin and avoids browser CORS preflights entirely.
  if (isBrowser && !isLocalHost) {
    return `/api/${sanitizedName}`;
  }

  if (!supabaseUrl) {
    throw new Error('VITE_SUPABASE_URL is not configured');
  }

  return `${supabaseUrl}/functions/v1/${sanitizedName}`;
}
