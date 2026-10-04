import { useEffect, useRef } from 'react';
import mobileAds, { AdsConsent } from 'react-native-google-mobile-ads';
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
        try {
          const info = await AdsConsent.getConsentInfo();
          if (!info.canRequestAds) return;
          initialized.current = true;
          await mobileAds().initialize();
        } catch {
          // Ad failures must never block the reading experience.
        }
      };

      try {
        await AdsConsent.gatherConsent();
      } catch {
        // UMP can use prior-session state if gathering temporarily fails.
      }
      await initializeIfAllowed();
    };

    void start();
    return () => { active = false; };
  }, [membership.loading, membership.showAds]);

  return null;
}
