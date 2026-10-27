import { useEffect, useMemo, useState } from "react";
import { useCompanionMirror } from "./useCompanionMirror";

/** A card only needs a glance; ``fps <= 5`` never prompts for screen capture. */
const THUMBNAIL_FPS = 1;
const CAPTURE_MS = 1500;
const THUMBNAIL_WIDTH = 240;
const RETRY_MS = 5000;

/**
 * Live thumbnail of a companion phone (as tabby's device cards do).
 *
 * Subscribes to the mirror stream at a low rate and snapshots the decoded
 * frames — JPEG preview or H.264, whichever the phone is sending — so the
 * card keeps matching the phone even after screen capture switched it to
 * H.264. Returns a JPEG data URL, or ``null`` until the first frame.
 */
export function useDeviceThumbnail(
  deviceId: string,
  enabled: boolean,
): string | null {
  const canvas = useMemo(() => document.createElement("canvas"), []);
  const small = useMemo(() => document.createElement("canvas"), []);
  const [src, setSrc] = useState<string | null>(null);
  const { status, frame, reconnect } = useCompanionMirror(
    enabled ? deviceId : null,
    canvas,
    undefined,
    THUMBNAIL_FPS,
  );
  const streaming = frame !== null;

  useEffect(() => {
    if (!streaming) return;
    const capture = () => {
      if (!canvas.width || !canvas.height) return;
      small.width = THUMBNAIL_WIDTH;
      small.height = Math.round(
        (canvas.height / canvas.width) * THUMBNAIL_WIDTH,
      );
      small
        .getContext("2d")
        ?.drawImage(canvas, 0, 0, small.width, small.height);
      setSrc(small.toDataURL("image/jpeg", 0.7));
    };
    capture();
    const timer = window.setInterval(capture, CAPTURE_MS);
    return () => window.clearInterval(timer);
  }, [streaming, canvas, small]);

  // The phone drops viewers when it reconnects; come back on our own.
  useEffect(() => {
    if (!enabled || status !== "closed") return;
    const timer = window.setTimeout(reconnect, RETRY_MS);
    return () => window.clearTimeout(timer);
  }, [enabled, status, reconnect]);

  return enabled ? src : null;
}
