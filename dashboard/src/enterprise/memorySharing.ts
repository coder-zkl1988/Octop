import { useEnterprise } from "./EnterpriseContext";

const ENTERPRISE_BUILD = import.meta.env.VITE_ENTERPRISE_MODE === "1";

/**
 * 共享记忆 hands Memory tokens to outside clients, so the enterprise build only
 * shows it when the tenant role policy allows the `memory_sharing` module.
 * The backend enforces the same rule; this only keeps the entry out of sight.
 */
export function useMemorySharingAccess(): {
  allowed: boolean;
  /** The enterprise policy has not loaded yet. */
  pending: boolean;
} {
  const { snapshot, loading } = useEnterprise();
  if (!ENTERPRISE_BUILD) return { allowed: true, pending: false };
  return {
    allowed: snapshot?.policy.modules?.memory_sharing === "allow",
    pending: loading && !snapshot,
  };
}
