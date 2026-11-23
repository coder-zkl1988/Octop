import type { ReactNode } from "react";
import { Navigate } from "react-router-dom";
import { useEnterprise } from "./EnterpriseContext";

export const DEVICE_REVOKED_PATH = "/device-revoked";

/** Sends every in-app route to the revoked page once an admin removes this device. */
export default function RevokedGate({ children }: { children: ReactNode }) {
  const { revoked } = useEnterprise();
  if (revoked) return <Navigate to={DEVICE_REVOKED_PATH} replace />;
  return <>{children}</>;
}
