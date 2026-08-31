// Standard client-side storage adapter for Supabase auth
export function brokeredPreviewStorage() {
  if (typeof window === 'undefined') return undefined;
  return localStorage;
}

