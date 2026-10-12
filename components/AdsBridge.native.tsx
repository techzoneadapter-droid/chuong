import { useEffect, useRef } from 'react';
import { ensureAdsConsent } from '../services/adConsent.native';
import { useMembership } from '../hooks/useMembership';

export function AdsBridge() {
  const membership = useMembership();
  const initialized = useRef(false);

  useEffect(() => {
    if (membership.loading || !membership.showAds || initialized.current) return;

    let active = true;
    const start = async () => {
      const initializeIfAllowed = async () => {
        if (!active || initialized.current) return;
        initialized.current = await ensureAdsConsent();
      };

      await initializeIfAllowed();
    };

    void start();
    return () => { active = false; };
  }, [membership.loading, membership.showAds]);

  return null;
}
