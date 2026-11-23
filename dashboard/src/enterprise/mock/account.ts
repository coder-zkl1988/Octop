import type { DeviceRevocation } from "../api/account";

/**
 * Sample "device removed" notice used until the enterprise cloud API is
 * wired up. Read through `enterprise/api/account`, never directly.
 */
export function buildMockRevocation(): DeviceRevocation {
  return { revokedAt: new Date(Date.now() - 3 * 60_000).toISOString() };
}
