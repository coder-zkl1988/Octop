import type { ComponentType } from "react";
import type {
  ParsedToolOutput,
  ToolRendererRegistration,
  ToolRenderProps,
  PluginPageRegistration,
} from "./types";

const byKey = new Map<string, ToolRendererRegistration>();
const byToolName = new Map<string, ToolRendererRegistration>();
const listeners = new Set<() => void>();
const pages = new Map<string, PluginPageRegistration>();
let version = 0;

function rendererKey(pluginId: string, id: string): string {
  return `${pluginId}::${id}`;
}

function bump(): void {
  version += 1;
  for (const fn of listeners) {
    try {
      fn();
    } catch {
      /* ignore */
    }
  }
}

/** Subscribe to registry changes (plugin UI load / unload). */
export function subscribeToolRenderers(listener: () => void): () => void {
  listeners.add(listener);
  return () => {
    listeners.delete(listener);
  };
}

export function getToolRendererVersion(): number {
  return version;
}

export function clearToolRenderers(): void {
  byKey.clear();
  byToolName.clear();
  bump();
}

export function registerPluginPage(reg: PluginPageRegistration): void {
  pages.set(`${reg.pluginId}::${reg.id}`, reg);
  bump();
}

export function unregisterPluginPages(pluginId: string): void {
  let changed = false;
  for (const [key, page] of pages) {
    if (page.pluginId === pluginId) {
      pages.delete(key);
      changed = true;
    }
  }
  if (changed) bump();
}

export function getPluginPage(
  pluginId: string,
  id = "main",
): PluginPageRegistration | null {
  return pages.get(`${pluginId}::${id}`) ?? null;
}

export function listPluginPages(): PluginPageRegistration[] {
  return [...pages.values()];
}

export function registerToolRenderer(reg: ToolRendererRegistration): void {
  byKey.set(rendererKey(reg.pluginId, reg.id), reg);
  for (const tool of reg.tools ?? []) {
    const name = tool.trim();
    if (!name) continue;
    byToolName.set(name, reg);
  }
  bump();
}

export function unregisterPluginRenderers(pluginId: string): void {
  let changed = false;
  for (const [key, reg] of [...byKey.entries()]) {
    if (reg.pluginId === pluginId) {
      byKey.delete(key);
      changed = true;
    }
  }
  for (const [tool, reg] of [...byToolName.entries()]) {
    if (reg.pluginId === pluginId) {
      byToolName.delete(tool);
      changed = true;
    }
  }
  if (changed) bump();
}

export function resolveToolRenderer(opts: {
  toolName?: string;
  pluginId?: string | null;
  parsed: ParsedToolOutput;
}): ToolRendererRegistration | null {
  const { toolName, pluginId, parsed } = opts;
  const hint = parsed.octopUi;
  if (hint?.renderer) {
    if (pluginId) {
      const hit = byKey.get(rendererKey(pluginId, hint.renderer));
      if (hit) return hit;
    }
    for (const reg of byKey.values()) {
      if (reg.id === hint.renderer) return reg;
    }
  }
  if (toolName) {
    const byTool = byToolName.get(toolName);
    if (byTool) return byTool;
  }
  return null;
}

export function listRegisteredRenderers(): ToolRendererRegistration[] {
  return [...byKey.values()];
}

export type { ComponentType, ToolRenderProps };
