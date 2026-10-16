import { useEffect, useRef } from 'react';
import mobileAds, { AdsConsent } from 'react-native-google-mobile-ads';
import { useMembership } from '../hooks/useMembership';
import { allowChapterInterstitials, disableChapterInterstitials } from '../services/chapterInterstitial';
import { realAdsEnabled } from '../services/admobUnits';
import { setAdSdkReady } from '../services/admobReadiness';

export function AdsBridge() {
  const membership = useMembership();
  const initialized = useRef(false);

  useEffect(() => {
    if (membership.loading) { setAdSdkReady(false); disableChapterInterstitials(); return; }
    if (!membership.showAds || (!__DEV__ && !realAdsEnabled())) {
      disableChapterInterstitials();
      setAdSdkReady(false);
      return;
    }
    if (initialized.current) { setAdSdkReady(true); allowChapterInterstitials(); return; }

    let active = true;
    const start = async () => {
      const initializeIfAllowed = async () => {
        if (!active || initialized.current) return;
        try {
          const info = await AdsConsent.getConsentInfo();
          if (!info.canRequestAds) return;
          await mobileAds().initialize();
          if (!active) return;
          initialized.current = true;
          setAdSdkReady(true);
          allowChapterInterstitials();
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
