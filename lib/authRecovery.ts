// Only the app's password recovery route may exchange incoming credentials.
export function parseNativeRecoveryUrl(value: string) {
  try {
    const url = new URL(value);
    if (url.protocol !== 'chuong:' || url.hostname !== 'auth' || url.pathname !== '/reset') return null;
    const params = new URLSearchParams(url.hash.slice(1) || url.search.slice(1));
    const accessToken = params.get('access_token');
    const refreshToken = params.get('refresh_token');
    if (accessToken && refreshToken) return { accessToken, refreshToken, code: null };
    const code = params.get('code');
    return code ? { accessToken: null, refreshToken: null, code } : null;
  } catch { return null; }
}
