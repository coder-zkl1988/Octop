import { useCallback, useRef, useState } from "react";
import { getAuthToken } from "../api/request";
import { resolveWsUrl } from "../utils/desktopWsUrl";
import {
  canDecodeAvc,
  H264CanvasDecoder,
  parseVideoInit,
} from "../utils/h264CanvasDecoder";

const H264_PTS_MARKER = 0xa5;

export type MobileStreamState =
  | "idle"
  | "connecting"
  | "streaming"
  | "stopped"
  | "error";

export interface MobileStreamOptions {
  device?: string;
  quality?: number;
  maxFps?: number;
  /** Longest JPEG edge; 0 keeps native resolution when JPEG is used. */
  maxSide?: number;
  /** Prefer the persistent H.264 stream. JPEG remains the compatibility fallback. */
  codec?: "jpeg" | "h264";
}

/** Pick the lowest-overhead codec supported by this browser shell. */
export function resolveMobileStreamCodec(
  requested?: MobileStreamOptions["codec"],
): "jpeg" | "h264" {
  if (requested === "jpeg") return "jpeg";
  return canDecodeAvc() ? "h264" : "jpeg";
}

function buildWsUrl(): string {
  return resolveWsUrl("/api/mobile-stream/ws");
}

export function useMobileStream() {
  const wsRef = useRef<WebSocket | null>(null);
  const decoderRef = useRef<H264CanvasDecoder>(new H264CanvasDecoder());
  const [status, setStatus] = useState<MobileStreamState>("idle");

  const disconnect = useCallback(() => {
    const ws = wsRef.current;
    wsRef.current = null;
    decoderRef.current.close();
    if (ws && ws.readyState < WebSocket.CLOSING) {
      try {
        ws.send(JSON.stringify({ type: "stop" }));
      } catch {
        /* ignore */
      }
      ws.close();
    }
    setStatus("stopped");
  }, []);

  const connect = useCallback(
    (
      opts: MobileStreamOptions,
      callbacks: {
        canvas: HTMLCanvasElement | null;
        onFrame: (base64: string, width: number, height: number) => void;
        onVideoSize?: (width: number, height: number) => void;
        onError?: (message: string) => void;
        onActionResult?: (result: {
          action: string;
          ok: boolean;
          message?: string;
          rotation?: number;
        }) => void;
      },
    ) => {
      disconnect();
      setStatus("connecting");
      decoderRef.current.attach(callbacks.canvas);
      const ws = new WebSocket(buildWsUrl());
      ws.binaryType = "arraybuffer";
      wsRef.current = ws;
      ws.onopen = () => {
        const codec = resolveMobileStreamCodec(opts.codec);
        ws.send(
          JSON.stringify({
            type: "start",
            token: getAuthToken(),
            device: opts.device,
            quality: opts.quality ?? 75,
            max_fps: opts.maxFps ?? 10,
            max_side: opts.maxSide ?? 1080,
            codec,
          }),
        );
      };
      ws.onmessage = (ev) => {
        if (ev.data instanceof ArrayBuffer) {
          const bytes = new Uint8Array(ev.data);
          if (bytes.length < 2) return;
          const key = bytes[0] === 1;
          let sample = bytes.subarray(1);
          let timestampUs: number | undefined;
          if (bytes.length >= 10 && bytes[1] === H264_PTS_MARKER) {
            const view = new DataView(
              bytes.buffer,
              bytes.byteOffset,
              bytes.byteLength,
            );
            timestampUs = view.getUint32(2) * 0x1_0000_0000 + view.getUint32(6);
            sample = bytes.subarray(10);
          }
          decoderRef.current.decode(sample, key, timestampUs);
          setStatus("streaming");
          return;
        }
        try {
          const msg = JSON.parse(String(ev.data)) as {
            type?: string;
            data?: string;
            width?: number;
            height?: number;
            message?: string;
            codec?: string;
            description?: string;
            action?: string;
            ok?: boolean;
            rotation?: number;
            screen_width?: number;
            screen_height?: number;
          };
          if (msg.type === "video_init") {
            const init = parseVideoInit(msg);
            if (!init) return;
            try {
              decoderRef.current.configure(init);
              const screenWidth = init.screenWidth || init.width;
              const screenHeight = init.screenHeight || init.height;
              if (screenWidth > 0 && screenHeight > 0) {
                callbacks.onVideoSize?.(screenWidth, screenHeight);
              }
              setStatus("streaming");
            } catch (err) {
              callbacks.onError?.(
                err instanceof Error ? err.message : "H.264 decode failed",
              );
              setStatus("error");
            }
          } else if (msg.type === "frame" && msg.data) {
            setStatus("streaming");
            callbacks.onFrame(msg.data, msg.width ?? 0, msg.height ?? 0);
          } else if (msg.type === "action_result") {
            callbacks.onActionResult?.({
              action: String(msg.action ?? ""),
              ok: Boolean(msg.ok),
              message:
                typeof msg.message === "string" ? msg.message : undefined,
              rotation:
                typeof msg.rotation === "number" ? msg.rotation : undefined,
            });
          } else if (msg.type === "error") {
            setStatus("error");
            callbacks.onError?.(msg.message ?? "stream error");
          }
        } catch {
          /* ignore */
        }
      };
      ws.onerror = () => {
        setStatus("error");
        callbacks.onError?.("WebSocket error");
      };
      ws.onclose = () => {
        if (wsRef.current === ws) wsRef.current = null;
        decoderRef.current.close();
        setStatus((s) => (s === "streaming" ? "stopped" : s));
      };
    },
    [disconnect],
  );

  const sendEvent = useCallback((payload: Record<string, unknown>) => {
    const ws = wsRef.current;
    if (ws && ws.readyState === WebSocket.OPEN) {
      ws.send(JSON.stringify(payload));
    }
  }, []);

  return { status, connect, disconnect, sendEvent };
}
