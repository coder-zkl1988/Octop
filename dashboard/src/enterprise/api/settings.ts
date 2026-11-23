import { mockModelPreferences } from "../mock/settings";
import { request } from "../../api/request";

/**
 * Enterprise settings client (models page). Resolves from `enterprise/mock`
 * until the enterprise cloud API ships; swap the bodies for `request()` calls.
 */

export interface ModelPreferences {
  /** `null` → the tenant default (`CloudModel.isDefault`) applies. */
  defaultCloudModelId: string | null;
  /** Missing key → the snapshot's `LocalModel.status` applies. */
  localEnabled: Record<string, boolean>;
}

const MOCK_LATENCY_MS = 120;
const REAL_ENTERPRISE = import.meta.env.VITE_ENTERPRISE_MODE === "1";

function snapshotPrefs(): ModelPreferences {
  return {
    defaultCloudModelId: mockModelPreferences.defaultCloudModelId ?? null,
    localEnabled: { ...mockModelPreferences.localEnabled },
  };
}

function delay<T>(value: T): Promise<T> {
  return new Promise((resolve) =>
    setTimeout(() => resolve(value), MOCK_LATENCY_MS),
  );
}

export const settingsApi = {
  async getModelPreferences(): Promise<ModelPreferences> {
    if (REAL_ENTERPRISE) {
      return request<ModelPreferences>("/enterprise/model-preferences");
    }
    return delay(snapshotPrefs());
  },

  /** Star a cloud model as the member's default chat model. */
  async setDefaultCloudModel(modelId: string): Promise<ModelPreferences> {
    if (REAL_ENTERPRISE) {
      return request<ModelPreferences>(
        "/enterprise/model-preferences/default",
        {
          method: "PUT",
          body: JSON.stringify({ model_id: modelId }),
        },
      );
    }
    mockModelPreferences.defaultCloudModelId = modelId;
    return delay(snapshotPrefs());
  },

  /** Turn a downloaded whitelist model on or off for chat. */
  async setLocalModelEnabled(
    modelId: string,
    enabled: boolean,
  ): Promise<ModelPreferences> {
    if (REAL_ENTERPRISE) {
      return request<ModelPreferences>("/enterprise/model-preferences/local", {
        method: "PUT",
        body: JSON.stringify({ model_id: modelId, enabled }),
      });
    }
    mockModelPreferences.localEnabled[modelId] = enabled;
    return delay(snapshotPrefs());
  },
};
