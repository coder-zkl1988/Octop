/** Decode Annex-B-derived AVCC H.264 samples onto a canvas via WebCodecs. */

export interface H264Init {
  codec: string;
  description: Uint8Array;
  width: number;
  height: number;
  screenWidth: number;
  screenHeight: number;
}

export function canDecodeAvc(): boolean {
  return typeof VideoDecoder !== "undefined";
}

function b64ToBytes(b64: string): Uint8Array {
  const bin = atob(b64);
  const out = new Uint8Array(bin.length);
  for (let i = 0; i < bin.length; i++) out[i] = bin.charCodeAt(i);
  return out;
}

export class H264CanvasDecoder {
  private decoder: VideoDecoder | null = null;
  private decoderConfig: VideoDecoderConfig | null = null;
  private canvas: HTMLCanvasElement | null = null;
  private ts = 0;
  private configured = false;
  private waitingForKeyframe = true;

  attach(canvas: HTMLCanvasElement | null): void {
    this.canvas = canvas;
  }

  configure(init: H264Init): void {
    this.close();
    if (!canDecodeAvc()) {
      throw new Error("WebCodecs VideoDecoder is not available");
    }
    const canvas = this.canvas;
    this.decoder = new VideoDecoder({
      output: (frame) => {
        const target = this.canvas ?? canvas;
        if (!target) {
          frame.close();
          return;
        }
        const w = frame.displayWidth || init.width;
        const h = frame.displayHeight || init.height;
        if (w > 0 && h > 0 && (target.width !== w || target.height !== h)) {
          target.width = w;
          target.height = h;
        }
        const ctx = target.getContext("2d");
        if (ctx) {
          ctx.drawImage(frame, 0, 0, target.width, target.height);
        }
        frame.close();
      },
      error: (err) => {
        console.error("mobile H.264 decode error", err);
      },
    });
    const config: VideoDecoderConfig = {
      codec: init.codec,
      description: init.description,
      optimizeForLatency: true,
      hardwareAcceleration: "prefer-hardware",
    };
    if (init.width > 0) config.codedWidth = init.width;
    if (init.height > 0) config.codedHeight = init.height;
    this.decoderConfig = config;
    this.decoder.configure(config);
    this.configured = true;
    this.ts = 0;
    this.waitingForKeyframe = true;
  }

  decode(sample: Uint8Array, key: boolean, timestampUs?: number): void {
    const decoder = this.decoder;
    const config = this.decoderConfig;
    if (!decoder || !config || !this.configured) return;
    // H.264 delta frames depend on the frames before them. Dropping one while
    // the queue is deep corrupts the reference chain and paints gray blocks.
    // Reset the decoder and wait for the next keyframe to keep latency bounded.
    if (this.waitingForKeyframe && !key) return;
    if (decoder.decodeQueueSize > 3) {
      decoder.reset();
      decoder.configure(config);
      this.waitingForKeyframe = !key;
      if (!key) return;
      const target = this.canvas;
      target?.getContext("2d")?.clearRect(0, 0, target.width, target.height);
    }
    if (key) this.waitingForKeyframe = false;
    const chunk = new EncodedVideoChunk({
      type: key ? "key" : "delta",
      timestamp: timestampUs ?? this.ts,
      data: sample,
    });
    if (timestampUs == null) this.ts += 16_667;
    decoder.decode(chunk);
  }

  close(): void {
    if (this.decoder) {
      try {
        this.decoder.close();
      } catch {
        /* already closed */
      }
      this.decoder = null;
    }
    this.decoderConfig = null;
    this.configured = false;
    this.waitingForKeyframe = true;
  }
}

export function parseVideoInit(msg: {
  codec?: string;
  description?: string;
  width?: number;
  height?: number;
  screen_width?: number;
  screen_height?: number;
}): H264Init | null {
  if (!msg.codec || !msg.description) return null;
  return {
    codec: msg.codec,
    description: b64ToBytes(msg.description),
    width: msg.width ?? 0,
    height: msg.height ?? 0,
    screenWidth: msg.screen_width ?? 0,
    screenHeight: msg.screen_height ?? 0,
  };
}
