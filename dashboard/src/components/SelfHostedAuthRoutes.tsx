import { useEffect, useState } from "react";
import { Spin } from "antd";
import { Navigate, Outlet } from "react-router-dom";
import { authApi } from "../api/modules/auth";
import BootOfflinePanel from "./BootOfflinePanel";

/** Setup, personal invitations and OIDC login belong to self-hosted services. */
export default function SelfHostedAuthRoutes() {
  const [mode, setMode] = useState<
    "loading" | "enterprise" | "local" | "offline"
  >("loading");
  const enterpriseBuild = import.meta.env.VITE_ENTERPRISE_MODE === "1";

  useEffect(() => {
    if (enterpriseBuild) return;
    let cancelled = false;
    void authApi
      .getAuthStatus()
      .then((status) => {
        if (!cancelled)
          setMode(status.enterprise_mode ? "enterprise" : "local");
      })
      .catch(() => {
        if (!cancelled) setMode("offline");
      });
    return () => {
      cancelled = true;
    };
  }, [enterpriseBuild]);

  if (enterpriseBuild || mode === "enterprise") {
    return <Navigate to="/login" replace />;
  }
  if (mode === "offline") return <BootOfflinePanel />;
  if (mode === "loading") return <Spin fullscreen />;
  return <Outlet />;
}
