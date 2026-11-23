import {
  createContext,
  useCallback,
  useContext,
  useEffect,
  useMemo,
  useState,
  type ReactNode,
} from "react";
import { useLocation } from "react-router-dom";
import { enterpriseApi } from "./api/core";
import {
  DEFAULT_SIMULATION,
  getSimulation,
  setSimulation,
  subscribeSimulation,
  type EnterpriseSimulation,
} from "./simulation";
import type { CloudBlockReason, EnterpriseSnapshot, SyncState } from "./types";

/** Map enterprise L1 modules and capabilities onto Octop's local nav keys. */
export function enterprisePermissionKeys(
  snapshot: EnterpriseSnapshot,
): string[] {
  const permissions = new Set<string>();
  const modules = snapshot.policy.modules ?? {};
  const modelPurposes = snapshot.policy.modelPurposes ?? {};
  const allowModule = (...keys: string[]) =>
    keys.some((key) => modules[key] === "allow");
  const allowCapability = (key: string) =>
    snapshot.policy.capabilities.some(
      (item) => item.key === key && item.allowed,
    );

  if (allowModule("experts")) permissions.add("experts");
  if (allowModule("tasks", "automation")) permissions.add("tasks");
  if (allowModule("terminal") || allowCapability("shell")) {
    permissions.add("terminal");
    permissions.add("workbench");
  }
  if (allowModule("browser") || allowCapability("browser")) {
    permissions.add("browser");
    permissions.add("workbench");
  }
  if (allowModule("workbench")) permissions.add("workbench");
  if (allowModule("knowledge", "knowledge_bases")) {
    permissions.add("knowledge_bases");
    permissions.add("knowledge_settings");
  }
  if (allowModule("connectors", "connector")) {
    permissions.add("connector_enabled");
    permissions.add("connector_builtin");
  }
  if (allowModule("channels", "im")) permissions.add("channels");
  if (allowModule("skills", "skill_packages"))
    permissions.add("skill_packages");
  if (allowModule("desktop", "remote_desktop")) permissions.add("desktop");
  if (allowModule("mobile")) permissions.add("mobile");
  if (allowModule("bridge", "cloud")) permissions.add("bridge");
  if (allowModule("acp")) permissions.add("acp");
  if (allowCapability("remoteDesktop")) permissions.add("desktop");
  if (allowCapability("adb")) permissions.add("mobile");
  if (snapshot.cloudModels.length > 0 || snapshot.policy.localModelsAllowed) {
    permissions.add("providers");
  }
  if (
    modelPurposes.chat ??
    (snapshot.cloudModels.length > 0 || snapshot.policy.localModelsAllowed)
  ) {
    permissions.add("model_chat");
  }
  if (
    modelPurposes.embedding ??
    (snapshot.policy.localModelsAllowed || snapshot.cloudModels.length > 0)
  ) {
    permissions.add("model_embedding");
  }
  if (modelPurposes.generation) permissions.add("model_generation");
  if (modelPurposes.voice) permissions.add("voice");
  if (modelPurposes.search) permissions.add("search");
  if (modelPurposes.decision) permissions.add("model_decision");
  const phoneAccess = allowModule("mobile") || allowCapability("adb");
  if ((modelPurposes.phone ?? true) && phoneAccess)
    permissions.add("model_phone");
  if (snapshot.policy.localModelsAllowed) {
    permissions.add("ollama_models");
    permissions.add("onnx_models");
  }
  return [...permissions];
}

interface EnterpriseContextValue {
  /** `null` until the first load resolves. */
  snapshot: EnterpriseSnapshot | null;
  loading: boolean;
  refresh: () => Promise<void>;
  syncState: SyncState;
  isOffline: boolean;
  /** Why new cloud-model calls are refused right now, if they are. */
  cloudBlock: CloudBlockReason;
  /** The open conversation is held by another device (read-only here). */
  sessionLocked: boolean;
  /** An admin removed this device; the shell must show the revoked page. */
  revoked: boolean;
  simulation: EnterpriseSimulation;
  setSimulation: (patch: Partial<EnterpriseSimulation>) => void;
}

/** Outside the provider (isolated component tests): no tenant data, nothing blocked. */
const DETACHED: EnterpriseContextValue = {
  snapshot: null,
  loading: false,
  refresh: async () => {},
  syncState: "synced",
  isOffline: false,
  cloudBlock: null,
  sessionLocked: false,
  revoked: false,
  simulation: DEFAULT_SIMULATION,
  setSimulation: () => {},
};

const EnterpriseContext = createContext<EnterpriseContextValue>(DETACHED);

export function cloudBlockFor(
  snap: EnterpriseSnapshot | null,
  syncState: SyncState,
): CloudBlockReason {
  if (syncState === "offline") return "offline";
  if (!snap) return null;
  if (snap.tenant.balancePoints <= 0) return "tenant-balance";
  if (snap.quota.usedPoints >= snap.quota.quotaPoints) return "member-quota";
  return null;
}

export function EnterpriseProvider({ children }: { children: ReactNode }) {
  const location = useLocation();
  const [snapshot, setSnapshot] = useState<EnterpriseSnapshot | null>(null);
  const [loading, setLoading] = useState(true);
  const [simulation, setSim] = useState<EnterpriseSimulation>(getSimulation);

  const refresh = useCallback(async () => {
    setLoading(true);
    try {
      const next = await enterpriseApi.getSnapshot();
      setSnapshot(next);
      const currentDevice = next.devices.find((device) => device.current);
      if (
        currentDevice?.status === "revoked" ||
        currentDevice?.status === "wiping" ||
        currentDevice?.status === "wiped" ||
        Boolean(currentDevice?.revokedAt)
      ) {
        setSimulation({ revoked: true });
      }
    } catch {
      // The login page is mounted before an enterprise token exists.
      // An unauthenticated snapshot is expected and must not become an
      // unhandled promise rejection.
      setSnapshot(null);
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => subscribeSimulation(setSim), []);

  useEffect(() => {
    const onAuthenticated = () => {
      void refresh();
    };
    window.addEventListener("octop:enterprise-authenticated", onAuthenticated);
    return () =>
      window.removeEventListener(
        "octop:enterprise-authenticated",
        onAuthenticated,
      );
  }, [refresh]);

  // Reload whenever a simulation switch flips (it reshapes the snapshot).
  useEffect(() => {
    void refresh();
  }, [location.pathname, refresh, simulation]);

  // Policy changes are invalidated over SSE. The stream carries only the
  // change notification; refresh() fetches the signed policy over HTTPS.
  // EventSource reconnects after transient failures, while the polling and
  // focus refresh below remain the recovery path for older clients/proxies.
  const hasSnapshot = snapshot !== null;
  useEffect(() => {
    if (!hasSnapshot) return;
    const url = enterpriseApi.eventsUrl();
    if (!url || typeof EventSource === "undefined") return;

    let source: EventSource | null = null;
    let retryTimer: number | null = null;
    let stopped = false;
    const currentDeviceId = snapshot?.devices.find((device) => device.current)
      ?.id;
    const onPolicyChanged = () => void refresh();
    const onDeviceChanged = (event: Event) => {
      if (!currentDeviceId) return;
      try {
        const payload = JSON.parse((event as MessageEvent).data) as {
          device_id?: string;
          status?: string;
        };
        if (
          payload.device_id === currentDeviceId &&
          ["logout", "revoked", "wiping", "wiped"].includes(
            String(payload.status),
          )
        ) {
          setSimulation({ revoked: true });
        }
      } catch {
        // Ignore malformed control-plane events and keep the snapshot path active.
      }
    };
    const connect = () => {
      if (stopped) return;
      const nextUrl = enterpriseApi.eventsUrl();
      if (!nextUrl) return;
      source = new EventSource(nextUrl);
      source.addEventListener("policy.changed", onPolicyChanged);
      source.addEventListener("device.logout", onDeviceChanged);
      source.addEventListener("device.revoke", onDeviceChanged);
      source.addEventListener("device.revoked", onDeviceChanged);
      source.addEventListener("device.wipe", onDeviceChanged);
      source.onerror = () => {
        // EventSource retries the same URL. Close and rebuild instead so a
        // refreshed desktop JWT is picked up after sliding renewal.
        source?.close();
        if (!stopped && retryTimer === null) {
          retryTimer = window.setTimeout(() => {
            retryTimer = null;
            connect();
          }, 5_000);
        }
      };
    };
    connect();
    return () => {
      stopped = true;
      if (retryTimer !== null) window.clearTimeout(retryTimer);
      source?.removeEventListener("policy.changed", onPolicyChanged);
      source?.removeEventListener("device.logout", onDeviceChanged);
      source?.removeEventListener("device.revoke", onDeviceChanged);
      source?.removeEventListener("device.revoked", onDeviceChanged);
      source?.removeEventListener("device.wipe", onDeviceChanged);
      source?.close();
    };
  }, [hasSnapshot, refresh, snapshot]);

  // Policy changes are saved in the cloud control plane. Refresh while the
  // desktop is open so an administrator's role or module change reaches the
  // sidebar and route guards without requiring a logout or app restart.
  useEffect(() => {
    if (!snapshot) return;
    const timer = window.setInterval(() => void refresh(), 15_000);
    const onFocus = () => void refresh();
    window.addEventListener("focus", onFocus);
    return () => {
      window.clearInterval(timer);
      window.removeEventListener("focus", onFocus);
    };
  }, [snapshot, refresh]);

  const value = useMemo<EnterpriseContextValue>(() => {
    const syncState = snapshot?.sync.state ?? simulation.sync;
    return {
      snapshot,
      loading,
      refresh,
      syncState,
      isOffline: syncState === "offline",
      cloudBlock: cloudBlockFor(snapshot, syncState),
      sessionLocked: simulation.sessionLock,
      revoked: simulation.revoked,
      simulation,
      setSimulation,
    };
  }, [snapshot, loading, refresh, simulation]);

  return (
    <EnterpriseContext.Provider value={value}>
      {children}
    </EnterpriseContext.Provider>
  );
}

export function useEnterprise(): EnterpriseContextValue {
  return useContext(EnterpriseContext);
}
