import { Session, User } from '@supabase/supabase-js';
import { ReactNode, createContext, useCallback, useContext, useEffect, useMemo, useRef, useState } from 'react';
import { isSupabaseConfigured, supabase } from '../lib/supabase';
import { messageForError } from '../services/errors';
import { AppState, Platform } from 'react-native';
import { Profile } from '../types';
import { ensureProfile, signOut as signOutService } from '../services/auth';

interface AuthContextValue {
  session: Session | null;
  user: User | null;
  profile: Profile | null;
  loading: boolean;
  configured: boolean;
  error: string;
  refreshProfile: () => Promise<void>;
  logout: () => Promise<void>;
}

const AuthContext = createContext<AuthContextValue | null>(null);

export function AuthProvider({ children }: { children: ReactNode }) {
  const [session, setSession] = useState<Session | null>(null);
  const [profile, setProfile] = useState<Profile | null>(null);
  const [loading, setLoading] = useState(isSupabaseConfigured);
  const [error, setError] = useState('');
  const profileRequest = useRef(0);
  const sessionUserId = useRef<string | null>(null);
  const user = session?.user ?? null;

  const refreshProfile = useCallback(async () => {
    const request = ++profileRequest.current;
    if (!user) { setProfile(null); return; }
    try { const next = await ensureProfile(user); if (request === profileRequest.current) { setProfile(next); setError(''); } }
    catch (cause) { if (request === profileRequest.current) { setProfile(null); setError(messageForError(cause, 'Không thể tải hồ sơ.')); } }
  }, [user]);

  useEffect(() => {
    if (!supabase) { setLoading(false); return; }
    let active = true; let observedAuthEvent = false;
    supabase.auth.getSession().then(({ data, error: sessionError }) => {
      if (!active || observedAuthEvent) return;
      if (sessionError) setError(messageForError(sessionError, 'Không thể khôi phục phiên.'));
      sessionUserId.current = data.session?.user.id ?? null;
      setSession(data.session);
      setLoading(false);
    }).catch((cause) => { if (active) { setError(messageForError(cause, 'Không thể khôi phục phiên.')); setLoading(false); } });
    const { data: listener } = supabase.auth.onAuthStateChange((_event, nextSession) => {
      if (!active) return;
      observedAuthEvent = true;
      const nextUserId = nextSession?.user.id ?? null;
      if (sessionUserId.current !== nextUserId) { ++profileRequest.current; setProfile(null); }
      sessionUserId.current = nextUserId; setError('');
      setSession(nextSession);
      setLoading(false);
    });
    return () => { active = false; listener.subscription.unsubscribe(); };
  }, []);

  useEffect(() => { refreshProfile().catch(() => setProfile(null)); }, [refreshProfile]);

  useEffect(() => {
    if (!supabase || Platform.OS === 'web') return;
    const subscription = AppState.addEventListener('change', (state) => {
      if (state === 'active') supabase?.auth.startAutoRefresh(); else supabase?.auth.stopAutoRefresh();
    });
    supabase.auth.startAutoRefresh();
    return () => { subscription.remove(); supabase?.auth.stopAutoRefresh(); };
  }, []);

  const logout = useCallback(async () => {
    if (Platform.OS !== 'web') {
      try {
        const { unregisterCurrentPushDevice } = await import('../services/pushNotifications');
        await unregisterCurrentPushDevice();
      } catch {
        // Push cleanup is best-effort; logout must still succeed.
      }
    }
    await signOutService();
    setSession(null);
    setProfile(null);
  }, []);
  const value = useMemo(() => ({ session, user, profile, loading, error, configured: isSupabaseConfigured, refreshProfile, logout }), [session, user, profile, loading, error, refreshProfile, logout]);
  return <AuthContext.Provider value={value}>{children}</AuthContext.Provider>;
}

export function useAuth() {
  const value = useContext(AuthContext);
  if (!value) throw new Error('useAuth phải được dùng bên trong AuthProvider.');
  return value;
}
