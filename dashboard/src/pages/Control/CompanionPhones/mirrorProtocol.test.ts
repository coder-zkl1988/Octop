import { describe, expect, it } from "vitest";
import {
  TouchAction,
  annexBToAvcc,
  avcCodecString,
  avccDescription,
  encodeTouch,
  parseClipboardFrame,
  parseH264Frame,
} from "./mirrorProtocol";

const SPS = [0x67, 0x42, 0xc0, 0x1f, 0xaa];
const PPS = [0x68, 0xce, 0x3c, 0x80];
const IDR = [0x65, 0x88, 0x84];
const START = [0x00, 0x00, 0x00, 0x01];
const ANNEX_B = new Uint8Array([
  ...START,
  ...SPS,
  ...START,
  ...PPS,
  0x00,
  0x00,
  0x01,
  ...IDR,
]);

describe("mirrorProtocol", () => {
  it("encodes a 36-byte scrcpy touch frame", () => {
    const buf = encodeTouch(
      {
        action: TouchAction.DOWN,
        pointerId: 3,
        x: 540,
        y: 1200,
        pressure: 1,
        buttons: 1,
      },
      1080,
      2400,
    );
    const view = new DataView(buf.buffer);
    expect(buf.byteLength).toBe(36);
    expect(buf[0]).toBe(0x03);
    expect(buf[1]).toBe(0);
    expect(Number(view.getBigUint64(2, true))).toBe(3);
    expect(view.getUint32(10, true)).toBe(540);
    expect(view.getUint32(14, true)).toBe(1200);
    expect(view.getUint32(18, true)).toBe(1080);
    expect(view.getUint32(22, true)).toBe(2400);
    expect(view.getUint16(26, true)).toBe(0xffff);
    expect(view.getUint32(32, true)).toBe(1);
  });

  it("parses the 14-byte H.264 frame header", () => {
    const buf = new ArrayBuffer(14 + ANNEX_B.length);
    const view = new DataView(buf);
    view.setUint8(0, 0x01);
    view.setUint8(1, 0x01);
    view.setUint16(2, 720, true);
    view.setUint16(4, 1600, true);
    view.setUint16(6, 1080, true);
    view.setUint16(8, 2400, true);
    view.setUint32(10, 42, true);
    new Uint8Array(buf, 14).set(ANNEX_B);
    const frame = parseH264Frame(buf);
    expect(frame).toMatchObject({
      keyframe: true,
      width: 720,
      height: 1600,
      screenWidth: 1080,
      screenHeight: 2400,
      timestamp: 42,
    });
    expect(Array.from(frame!.nal)).toEqual(Array.from(ANNEX_B));
    expect(parseH264Frame(new ArrayBuffer(4))).toBeNull();
  });

  it("decodes clipboard frames from the phone", () => {
    const text = new TextEncoder().encode("你好");
    const buf = new ArrayBuffer(14 + text.length);
    const view = new DataView(buf);
    view.setUint8(0, 0x00);
    view.setUint32(10, text.length, true);
    new Uint8Array(buf, 14).set(text);
    expect(parseClipboardFrame(buf)).toBe("你好");
    expect(parseClipboardFrame(new Uint8Array([0x01, 0, 0]).buffer)).toBeNull();
  });

  it("builds the AVCC description and length-prefixed samples", () => {
    const description = avccDescription(ANNEX_B)!;
    expect(Array.from(description.slice(0, 6))).toEqual([
      0x01, 0x42, 0xc0, 0x1f, 0xff, 0xe1,
    ]);
    expect(avcCodecString(description)).toBe("avc1.42c01f");
    const avcc = annexBToAvcc(ANNEX_B);
    const view = new DataView(avcc.buffer);
    expect(view.getUint32(0)).toBe(SPS.length);
    expect(view.getUint32(4 + SPS.length)).toBe(PPS.length);
    expect(view.getUint32(8 + SPS.length + PPS.length)).toBe(IDR.length);
    expect(avccDescription(new Uint8Array([...START, ...IDR]))).toBeNull();
  });
});
