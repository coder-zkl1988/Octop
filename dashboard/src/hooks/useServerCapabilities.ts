import { useEffect, useState } from "react";
import { octopSettingsApi } from "../api/modules/settings";

interface MobileCapabilities {
  /** Host adb / container Remote Phone. */
  mobileEnabled: boolean;
  /** Companion-app phones (the phone dials Octop; no host adb needed). */
  companionEnabled: boolean;
}

const NONE: MobileCapabilities = {
  mobileEnabled: false,
  companionEnabled: false,
};

/** Coalesce Header + Sidebar mounts so first paint hits capabilities once. */
let inFlight: Promise<MobileCapabilities> | null = null;

async function loadMobileCapabilities(): Promise<MobileCapabilities> {
  if (inFlight) return inFlight;
  inFlight = octopSettingsApi
    .capabilities()
    .then((data) => ({
      mobileEnabled: Boolean(data.mobile?.enabled),
      companionEnabled: Boolean(data.mobile?.companion),
    }))
    .catch(() => NONE)
    .finally(() => {
      inFlight = null;
    });
  return inFlight;
}

export function useServerCapabilities() {
  const [caps, setCaps] = useState<MobileCapabilities>(NONE);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    let cancelled = false;
    void loadMobileCapabilities().then((loaded) => {
      if (!cancelled) {
        setCaps(loaded);
        setLoading(false);
      }
    });
    return () => {
      cancelled = true;
    };
  }, []);

  return { ...caps, loading };
}
