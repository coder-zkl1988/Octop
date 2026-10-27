/**
 * Wire helpers for the companion-phone live mirror (TabbyApp protocol).
 *
 * Phone → viewer binary frames:
 *   0x01 H.264: [type][keyframe][w u16][h u16][screenW u16][screenH u16][ts u32] + Annex-B NALs
 *   0x00 clipboard: [type][sequence u64][paste u8][len u32] + UTF-8 text
 * Viewer → phone binary frames: scrcpy-style control messages; only the
 * touch event (0x03) is needed here — everything else goes as JSON actions.
 */

export const TouchAction = { DOWN: 0, UP: 1, MOVE: 2 } as const;
export type TouchActionCode = (typeof TouchAction)[keyof typeof TouchAction];

const INJECT_TOUCH_EVENT = 0x03;
const H264_FRAME = 0x01;
const CLIPBOARD_FRAME = 0x00;

/** JSON actions the server forwards to the phone. */
export type MirrorJsonAction =
  | { type: "click"; x: number; y: number }
  | {
      type: "swipe";
      startX: number;
      startY: number;
      endX: number;
      endY: number;
    }
  | { type: "long_press"; x: number; y: number; durationMs: number }
  | { type: "input_text"; text: string }
  | { type: "press_key"; key: "back" | "home" | "recents" }
  | { type: "set_clipboard"; text: string; paste: boolean; sequence: number };

export interface TouchEvent {
  action: TouchActionCode;
  pointerId: number;
  x: number;
  y: number;
  /** 0.0–1.0 */
  pressure: number;
  buttons: number;
}

/** Encode a 36-byte scrcpy inject-touch frame (physical-pixel coordinates). */
export function encodeTouch(
  ev: TouchEvent,
  screenWidth: number,
  screenHeight: number,
): Uint8Array {
  const buf = new Uint8Array(36);
  const view = new DataView(buf.buffer);
  buf[0] = INJECT_TOUCH_EVENT;
  buf[1] = ev.action;
  view.setBigUint64(2, BigInt(ev.pointerId), true);
  view.setUint32(10, Math.max(0, Math.round(ev.x)), true);
  view.setUint32(14, Math.max(0, Math.round(ev.y)), true);
  view.setUint32(18, screenWidth, true);
  view.setUint32(22, screenHeight, true);
  view.setUint16(
    26,
    Math.round(Math.min(1, Math.max(0, ev.pressure)) * 0xffff),
    true,
  );
  view.setUint32(28, 0, true); // actionButton
  view.setUint32(32, ev.buttons, true);
  return buf;
}

export interface H264Frame {
  keyframe: boolean;
  /** Encoded stream size (may be downscaled from the screen). */
  width: number;
  height: number;
  /** Physical screen size, the coordinate space for touches. */
  screenWidth: number;
  screenHeight: number;
  timestamp: number;
  nal: Uint8Array;
}

export function parseH264Frame(buf: ArrayBuffer): H264Frame | null {
  if (buf.byteLength < 14) return null;
  const view = new DataView(buf);
  if (view.getUint8(0) !== H264_FRAME) return null;
  return {
    keyframe: view.getUint8(1) === 0x01,
    width: view.getUint16(2, true),
    height: view.getUint16(4, true),
    screenWidth: view.getUint16(6, true),
    screenHeight: view.getUint16(8, true),
    timestamp: view.getUint32(10, true),
    nal: new Uint8Array(buf, 14),
  };
}

/** Clipboard text pushed by the phone, or ``null`` for other frames. */
export function parseClipboardFrame(buf: ArrayBuffer): string | null {
  const bytes = new Uint8Array(buf);
  if (bytes.byteLength < 14 || bytes[0] !== CLIPBOARD_FRAME) return null;
  const len = new DataView(buf).getUint32(10, true);
  if (bytes.byteLength < 14 + len) return null;
  return new TextDecoder().decode(bytes.subarray(14, 14 + len));
}

// ── Annex-B → WebCodecs (ported from tabby's mirror client) ─────────────

function nextStartCode(data: Uint8Array, from: number): number {
  for (let i = from; i < data.length - 2; i++) {
    if (data[i] !== 0 || data[i + 1] !== 0) continue;
    if (data[i + 2] === 1) return i;
    if (i + 3 < data.length && data[i + 2] === 0 && data[i + 3] === 1) return i;
  }
  return -1;
}

function* nalUnits(data: Uint8Array): Generator<Uint8Array> {
  let pos = nextStartCode(data, 0);
  while (pos !== -1) {
    const start = pos + (data[pos + 2] === 1 ? 3 : 4);
    if (start >= data.length) return;
    const next = nextStartCode(data, start);
    yield data.subarray(start, next === -1 ? data.length : next);
    pos = next;
  }
}

/** AVCC ``description`` built from the keyframe's SPS + PPS, or ``null``. */
export function avccDescription(data: Uint8Array): Uint8Array | null {
  let sps: Uint8Array | null = null;
  let pps: Uint8Array | null = null;
  for (const nal of nalUnits(data)) {
    const type = (nal[0] ?? 0) & 0x1f;
    if (type === 7) sps = nal;
    else if (type === 8) pps = nal;
    if (sps && pps) break;
  }
  if (!sps || !pps) return null;
  const out = new Uint8Array(11 + sps.length + pps.length);
  out.set([0x01, sps[1] ?? 0, sps[2] ?? 0, sps[3] ?? 0, 0xff, 0xe1]);
  out[6] = (sps.length >> 8) & 0xff;
  out[7] = sps.length & 0xff;
  out.set(sps, 8);
  let off = 8 + sps.length;
  out[off++] = 0x01;
  out[off++] = (pps.length >> 8) & 0xff;
  out[off++] = pps.length & 0xff;
  out.set(pps, off);
  return out;
}

/** Replace start codes with 4-byte big-endian NAL lengths. */
export function annexBToAvcc(data: Uint8Array): Uint8Array {
  const units = [...nalUnits(data)];
  if (units.length === 0) return data;
  const out = new Uint8Array(units.reduce((n, u) => n + 4 + u.length, 0));
  const view = new DataView(out.buffer);
  let off = 0;
  for (const unit of units) {
    view.setUint32(off, unit.length);
    out.set(unit, off + 4);
    off += 4 + unit.length;
  }
  return out;
}

/** ``avc1.PPCCLL`` codec string from the SPS profile / constraint / level bytes. */
export function avcCodecString(description: Uint8Array): string {
  const hex = (n: number) => n.toString(16).padStart(2, "0");
  return `avc1.${hex(description[1] ?? 0x42)}${hex(description[2] ?? 0)}${hex(
    description[3] ?? 0x1e,
  )}`;
}
