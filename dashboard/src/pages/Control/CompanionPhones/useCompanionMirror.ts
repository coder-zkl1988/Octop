import { useCallback, useEffect, useRef, useState } from "react";
import { getWsUrl } from "../../../api/config";
import { getAuthToken } from "../../../api/request";
import {
  annexBToAvcc,
  avcCodecString,
  avccDescription,
  encodeTouch,
  parseClipboardFrame,
  parseH264Frame,
  type MirrorJsonAction,
  type TouchEvent,
} from "./mirrorProtocol";

export type MirrorStatus = "connecting" | "open" | "closed";

export interface MirrorFrameInfo {
  /** Physical screen size: the coordinate space touches are sent in. */
  screenWidth: number;
  screenHeight: number;
  currentApp?: string;
  /** "json": low-rate JPEG preview (screen capture not yet granted on the phone). */
  source: "binary" | "json";
}

const WEB_CODECS = typeof VideoDecoder !== "undefined";

/** Paint a decoded frame, cropping the encoder's macroblock padding. */
function drawVideoFrame(
  canvas: HTMLCanvasElement,
  frame: VideoFrame,
  streamWidth: number,
  streamHeight: number,
): void {
  const w = Math.min(streamWidth || frame.displayWidth, frame.displayWidth);
  const h = Math.min(streamHeight || frame.displayHeight, frame.displayHeight);
  if (canvas.width !== w || canvas.height !== h) {
    canvas.width = w;
    canvas.height = h;
  }
  canvas.getContext("2d")?.drawImage(frame, 0, 0, w, h, 0, 0, w, h);
}

/**
 * Live mirror of one companion phone over a single WebSocket.
 *
 * Frames arrive as H.264 (decoded with WebCodecs) or, until the phone grants
 * screen capture, as JPEG JSON frames. ``sendTouch`` / ``sendAction`` drive the
 * phone; touches use physical pixels from the latest frame.
 */
export function useCompanionMirror(
  deviceId: string | null,
  canvas: HTMLCanvasElement | null,
  onClipboard?: (text: string) => void,
) {
  const [status, setStatus] = useState<MirrorStatus>("closed");
  const [frame, setFrame] = useState<MirrorFrameInfo | null>(null);
  const [reconnectKey, setReconnectKey] = useState(0);
  const wsRef = useRef<WebSocket | null>(null);
  const canvasRef = useRef(canvas);
  canvasRef.current = canvas;
  const frameRef = useRef<MirrorFrameInfo | null>(null);
  const onClipboardRef = useRef(onClipboard);
  onClipboardRef.current = onClipboard;

  useEffect(() => {
    if (deviceId === null) {
      setStatus("closed");
      setFrame(null);
      return;
    }
    const url = `${getWsUrl(
      `/mobile/companion/devices/${encodeURIComponent(deviceId)}/mirror`,
    )}?token=${encodeURIComponent(getAuthToken())}`;
    const ws = new WebSocket(url);
    ws.binaryType = "arraybuffer";
    wsRef.current = ws;
    setStatus("connecting");
    setFrame(null);
    frameRef.current = null;

    let decoder: VideoDecoder | null = null;
    let stream = { width: 0, height: 0 };
    let raf: number | null = null;
    let pending: MirrorFrameInfo | null = null;

    // Coalesce frame metadata into one React update per animation frame.
    const publish = (info: MirrorFrameInfo) => {
      frameRef.current = info;
      pending = info;
      if (raf === null) {
        raf = requestAnimationFrame(() => {
          raf = null;
          if (pending) setFrame(pending);
          pending = null;
        });
      }
    };

    const onH264 = (buf: ArrayBuffer) => {
      const parsed = parseH264Frame(buf);
      if (!parsed || !WEB_CODECS) return;
      stream = { width: parsed.width, height: parsed.height };
      if (!decoder) {
        if (!parsed.keyframe) return; // wait for SPS/PPS
        const description = avccDescription(parsed.nal);
        if (!description) return;
        decoder = new VideoDecoder({
          output: (vf) => {
            const target = canvasRef.current;
            if (target) drawVideoFrame(target, vf, stream.width, stream.height);
            vf.close();
          },
          error: (err) => console.error("companion mirror decode error", err),
        });
        decoder.configure({
          codec: avcCodecString(description),
          description,
          optimizeForLatency: true,
          hardwareAcceleration: "prefer-hardware",
        });
      }
      if (decoder.decodeQueueSize > 8 && !parsed.keyframe) return;
      decoder.decode(
        new EncodedVideoChunk({
          type: parsed.keyframe ? "key" : "delta",
          timestamp: parsed.timestamp * 1000,
          data: annexBToAvcc(parsed.nal),
        }),
      );
      setStatus("open");
      publish({
        screenWidth: parsed.screenWidth || parsed.width,
        screenHeight: parsed.screenHeight || parsed.height,
        currentApp: frameRef.current?.currentApp,
        source: "binary",
      });
    };

    const onJpeg = (msg: Record<string, unknown>) => {
      const screenshot =
        typeof msg.screenshot === "string" ? msg.screenshot : "";
      const width = Number(msg.width) || 0;
      const height = Number(msg.height) || 0;
      if (!screenshot) return;
      const img = new Image();
      img.onload = () => {
        const target = canvasRef.current;
        if (!target) return;
        if (target.width !== img.naturalWidth) target.width = img.naturalWidth;
        if (target.height !== img.naturalHeight)
          target.height = img.naturalHeight;
        target.getContext("2d")?.drawImage(img, 0, 0);
      };
      img.src = `data:image/jpeg;base64,${screenshot}`;
      setStatus("open");
      publish({
        screenWidth: width || frameRef.current?.screenWidth || 1080,
        screenHeight: height || frameRef.current?.screenHeight || 2400,
        currentApp:
          typeof msg.currentApp === "string" && msg.currentApp
            ? msg.currentApp
            : frameRef.current?.currentApp,
        source: "json",
      });
    };

    ws.onmessage = (event: MessageEvent) => {
      if (event.data instanceof ArrayBuffer) {
        const text = parseClipboardFrame(event.data);
        if (text !== null) onClipboardRef.current?.(text);
        else onH264(event.data);
        return;
      }
      try {
        const msg = JSON.parse(event.data as string) as Record<string, unknown>;
        if (msg.channel !== "mirror") return;
        if (msg.type === "device_disconnected") {
          ws.close();
          return;
        }
        onJpeg(msg);
      } catch {
        /* ignore malformed frames */
      }
    };
    // "open" is set by the first frame, not the handshake: a socket with no
    // frames yet is still connecting from the user's point of view.
    ws.onclose = () => setStatus("closed");
    ws.onerror = () => setStatus("closed");

    return () => {
      if (raf !== null) cancelAnimationFrame(raf);
      try {
        decoder?.close();
      } catch {
        /* already closed */
      }
      ws.close();
      wsRef.current = null;
    };
  }, [deviceId, reconnectKey]);

  const send = useCallback((payload: string | Uint8Array) => {
    const ws = wsRef.current;
    if (ws && ws.readyState === WebSocket.OPEN) ws.send(payload);
  }, []);

  const sendAction = useCallback(
    (action: MirrorJsonAction) => send(JSON.stringify(action)),
    [send],
  );

  const sendTouch = useCallback(
    (ev: TouchEvent) => {
      const info = frameRef.current;
      if (!info) return;
      send(encodeTouch(ev, info.screenWidth, info.screenHeight));
    },
    [send],
  );

  const reconnect = useCallback(() => setReconnectKey((k) => k + 1), []);

  return { status, frame, sendAction, sendTouch, reconnect };
}
