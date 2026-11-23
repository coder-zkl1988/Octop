import { buildMockRevocation } from "../mock/account";
import { request } from "../../api/request";

/** Cloud notice sent to a device an admin removed. */
export interface DeviceRevocation {
  revokedAt: string | null;
}

const MOCK_LATENCY_MS = 120;
const REAL_ENTERPRISE = import.meta.env.VITE_ENTERPRISE_MODE === "1";

function delay<T>(value: T): Promise<T> {
  return new Promise((resolve) =>
    setTimeout(() => resolve(value), MOCK_LATENCY_MS),
  );
}

/** Account-area enterprise calls. */
export const accountApi = {
  /** When this device was removed (shown on the revoked page). */
  async getRevocation(): Promise<DeviceRevocation> {
    if (REAL_ENTERPRISE) {
      return request<DeviceRevocation>("/enterprise/account/revocation");
    }
    return delay(buildMockRevocation());
  },
};
