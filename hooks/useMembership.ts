import { useCallback, useEffect, useState } from 'react';
import { useAuth } from '../contexts/AuthContext';
import { getMembershipStatus, MembershipStatus } from '../services/membership';

const defaultStatus: MembershipStatus = {
  plan: 'standard',
  isPremium: false,
  showAds: true,
  offlineQuotaBytes: 100 * 1024 * 1024,
  aiTranslation: false,
  source: 'fallback',
};

export function useMembership() {
  const { user } = useAuth();
  const [status, setStatus] = useState<MembershipStatus>(defaultStatus);
  const [loading, setLoading] = useState(true);

  const refresh = useCallback(async () => {
    setLoading(true);
    try {
      setStatus(await getMembershipStatus(user?.id));
    } finally {
      setLoading(false);
    }
  }, [user?.id]);

  useEffect(() => { void refresh(); }, [refresh]);

  return { ...status, loading, refresh };
}
