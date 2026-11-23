/**
 * Live Ollama / ONNX state for the enterprise local-model whitelist.
 *
 * Download status comes from the real runtime APIs; a whitelist entry the
 * runtime can't answer for (runtime unreachable, id not in the ONNX catalog)
 * reports `null` so the caller falls back to the tenant snapshot.
 */
import { useCallback, useEffect, useRef, useState } from "react";
import { useTranslation } from "react-i18next";
import { message } from "@/utils/antdMessage";
import { ollamaModelApi } from "../../../api/modules/ollamaModel";
import {
  onnxModelApi,
  type OnnxCatalogItem,
} from "../../../api/modules/onnxModel";
import { watchOnnxDownload } from "../../../api/modules/onnxDownloadWatcher";
import type { OllamaDownloadTaskResponse } from "../../../api/types";
import type { LocalModel } from "../../../enterprise/types";
import { expandOllamaDownloadedIds } from "./ollamaNames";

const OLLAMA_POLL_MS = 2000;

interface RuntimeProbe {
  /** `null` until the first probe resolves. */
  ollamaRunning: boolean | null;
  /** Downloaded Ollama tags, or `null` when Ollama could not be queried. */
  ollamaDownloaded: Set<string> | null;
  /** ONNX catalog, or `null` when it could not be queried. */
  onnxCatalog: OnnxCatalogItem[] | null;
}

const INITIAL_PROBE: RuntimeProbe = {
  ollamaRunning: null,
  ollamaDownloaded: null,
  onnxCatalog: null,
};

/** Whitelist ids may omit the HF org: "bge-m3" matches "BAAI/bge-m3". */
function findOnnxItem(
  catalog: OnnxCatalogItem[],
  id: string,
): OnnxCatalogItem | undefined {
  const wanted = id.toLowerCase();
  return catalog.find((item) => {
    const itemId = item.id.toLowerCase();
    return itemId === wanted || itemId.split("/").pop() === wanted;
  });
}

export interface LocalRuntimes {
  ollamaRunning: boolean | null;
  /** Real download state, or `null` when the runtime can't tell. */
  isDownloaded: (model: LocalModel) => boolean | null;
  /** Whitelist ids with a download in flight. */
  downloading: ReadonlySet<string>;
  download: (model: LocalModel) => Promise<void>;
  refresh: () => Promise<void>;
}

export function useLocalRuntimes(): LocalRuntimes {
  const { t } = useTranslation();
  const [probe, setProbe] = useState<RuntimeProbe>(INITIAL_PROBE);
  const [downloading, setDownloading] = useState<ReadonlySet<string>>(
    () => new Set(),
  );
  /** Ollama task id → whitelist id. */
  const ollamaTasks = useRef(new Map<string, string>());
  const pollTimer = useRef<ReturnType<typeof setInterval> | null>(null);

  const setModelDownloading = useCallback((id: string, on: boolean) => {
    setDownloading((prev) => {
      const next = new Set(prev);
      if (on) next.add(id);
      else next.delete(id);
      return next;
    });
  }, []);

  const refresh = useCallback(async () => {
    const [service, models, catalog] = await Promise.allSettled([
      ollamaModelApi.getService(),
      ollamaModelApi.listOllamaModels(),
      onnxModelApi.getCatalog(),
    ]);
    setProbe({
      ollamaRunning: service.status === "fulfilled" && service.value.running,
      ollamaDownloaded:
        models.status === "fulfilled"
          ? new Set(expandOllamaDownloadedIds(models.value.map((m) => m.name)))
          : null,
      onnxCatalog: catalog.status === "fulfilled" ? catalog.value : null,
    });
  }, []);

  const finishDownload = useCallback(
    (id: string, ok: boolean, error?: string | null) => {
      setModelDownloading(id, false);
      if (ok) message.success(t("models.localDownloadSuccess"));
      else message.error(error || t("models.localDownloadFailed"));
      void refresh();
    },
    [refresh, setModelDownloading, t],
  );

  const stopPolling = useCallback(() => {
    if (pollTimer.current) clearInterval(pollTimer.current);
    pollTimer.current = null;
  }, []);

  const pollOllama = useCallback(async () => {
    let tasks: OllamaDownloadTaskResponse[];
    try {
      tasks = await ollamaModelApi.getOllamaDownloadStatus();
    } catch {
      return; // transient — try again on the next tick
    }
    for (const [taskId, id] of ollamaTasks.current) {
      const task = tasks.find((row) => row.task_id === taskId);
      if (task?.status === "pending" || task?.status === "downloading")
        continue;
      ollamaTasks.current.delete(taskId);
      finishDownload(id, task?.status === "completed", task?.error);
    }
    if (ollamaTasks.current.size === 0) stopPolling();
  }, [finishDownload, stopPolling]);

  const trackOllamaTask = useCallback(
    (taskId: string, id: string) => {
      ollamaTasks.current.set(taskId, id);
      setModelDownloading(id, true);
      if (!pollTimer.current) {
        pollTimer.current = setInterval(
          () => void pollOllama(),
          OLLAMA_POLL_MS,
        );
      }
    },
    [pollOllama, setModelDownloading],
  );

  // First probe, and re-attach Ollama downloads started before this visit.
  useEffect(() => {
    void refresh();
    void ollamaModelApi
      .getOllamaDownloadStatus()
      .then((tasks) => {
        for (const task of tasks) {
          if (task.status === "pending" || task.status === "downloading") {
            trackOllamaTask(task.task_id, task.name);
          }
        }
      })
      .catch(() => {});
    return stopPolling;
  }, [refresh, stopPolling, trackOllamaTask]);

  const download = useCallback(
    async (model: LocalModel) => {
      setModelDownloading(model.id, true);
      try {
        if (model.runtime === "Ollama") {
          const task = await ollamaModelApi.downloadOllamaModel({
            name: model.id,
          });
          trackOllamaTask(task.task_id, model.id);
        } else {
          const onnxId =
            (probe.onnxCatalog &&
              findOnnxItem(probe.onnxCatalog, model.id)?.id) ||
            model.id;
          await onnxModelApi.download(onnxId);
          watchOnnxDownload({
            modelId: onnxId,
            onTerminal: (state) =>
              finishDownload(model.id, state.status === "done", state.error),
          });
        }
        message.info(t("models.localDownloading", { repo: model.id }));
      } catch (err) {
        setModelDownloading(model.id, false);
        message.error(
          err instanceof Error ? err.message : t("models.localDownloadFailed"),
        );
      }
    },
    [
      finishDownload,
      probe.onnxCatalog,
      setModelDownloading,
      t,
      trackOllamaTask,
    ],
  );

  const isDownloaded = useCallback(
    (model: LocalModel): boolean | null => {
      if (model.runtime === "Ollama") {
        return probe.ollamaDownloaded
          ? probe.ollamaDownloaded.has(model.id)
          : null;
      }
      const item =
        probe.onnxCatalog && findOnnxItem(probe.onnxCatalog, model.id);
      return item ? item.downloaded : null;
    },
    [probe],
  );

  return {
    ollamaRunning: probe.ollamaRunning,
    isDownloaded,
    downloading,
    download,
    refresh,
  };
}
