import { useEffect } from 'react';
import { purgeRetiredDemoState } from '../services/demoCleanup';

export function DataCleanupBridge() {
  useEffect(() => {
    void purgeRetiredDemoState();
  }, []);
  return null;
}
