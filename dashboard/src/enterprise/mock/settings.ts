/**
 * Member-side model preferences, held in memory until the enterprise cloud
 * stores them. `undefined` / missing keys mean "use the tenant default from
 * the snapshot". Read and written only through `enterprise/api/settings`.
 */
export interface MockModelPreferences {
  /** Cloud model starred as the member's default chat model. */
  defaultCloudModelId?: string;
  /** Per whitelist entry: whether the member enabled the local model. */
  localEnabled: Record<string, boolean>;
}

export const mockModelPreferences: MockModelPreferences = {
  localEnabled: {},
};
