import { useCallback, useEffect, useId, useRef, useState } from "react";
import { useTranslation } from "react-i18next";
import { RefreshCw, Send, Smartphone, X } from "lucide-react";
import type { CompanionDevice } from "../../../api/modules/mobile";
import { TouchAction } from "./mirrorProtocol";
import { useCompanionMirror } from "./useCompanionMirror";
import styles from "./MirrorPanel.module.less";

const LONG_PRESS_MS = 500;
const LONG_PRESS_SLOP_PX = 8;

interface Props {
  device: CompanionDevice;
  onClose: () => void;
}

/** Live screen of a companion phone, driven with the mouse (ported from tabby). */
export default function MirrorPanel({ device, onClose }: Props) {
  const { t } = useTranslation();
  const titleId = useId();
  const [canvasEl, setCanvasEl] = useState<HTMLCanvasElement | null>(null);
  const [textInput, setTextInput] = useState("");
  const [swipe, setSwipe] = useState<{
    x1: number;
    y1: number;
    x2: number;
    y2: number;
  } | null>(null);
  const lastClipboardRef = useRef("");

  const { status, frame, sendAction, sendTouch, reconnect } =
    useCompanionMirror(device.device_id, canvasEl, (text) => {
      lastClipboardRef.current = text;
      navigator.clipboard?.writeText(text).catch(() => {});
    });
  const isConnected = status === "open";

  const activePointers = useRef(new Set<number>());
  const pendingMoves = useRef(
    new Map<
      number,
      { x: number; y: number; pressure: number; buttons: number }
    >(),
  );
  const moveRaf = useRef<number | null>(null);
  const swipeOrigin = useRef<{ id: number; x: number; y: number } | null>(null);
  const longPress = useRef<{
    timer: ReturnType<typeof setTimeout>;
    x: number;
    y: number;
  } | null>(null);
  const longPressFired = useRef(false);

  useEffect(
    () => () => {
      if (moveRaf.current !== null) cancelAnimationFrame(moveRaf.current);
      if (longPress.current) clearTimeout(longPress.current.timer);
    },
    [],
  );

  // Push the computer's clipboard to the phone when the window regains focus.
  useEffect(() => {
    if (!isConnected) return;
    const onFocus = async () => {
      try {
        const text = await navigator.clipboard.readText();
        if (text && text !== lastClipboardRef.current) {
          lastClipboardRef.current = text;
          sendAction({
            type: "set_clipboard",
            text,
            paste: false,
            sequence: Date.now(),
          });
        }
      } catch {
        /* clipboard permission denied */
      }
    };
    window.addEventListener("focus", onFocus);
    return () => window.removeEventListener("focus", onFocus);
  }, [isConnected, sendAction]);

  const toDevice = useCallback(
    (clientX: number, clientY: number) => {
      if (!canvasEl || !frame) return null;
      const rect = canvasEl.getBoundingClientRect();
      const relX = (clientX - rect.left) / rect.width;
      const relY = (clientY - rect.top) / rect.height;
      if (relX < 0 || relX > 1 || relY < 0 || relY > 1) return null;
      return {
        x: Math.round(relX * frame.screenWidth),
        y: Math.round(relY * frame.screenHeight),
      };
    },
    [canvasEl, frame],
  );

  const cancelLongPress = () => {
    if (longPress.current) clearTimeout(longPress.current.timer);
    longPress.current = null;
  };

  const flushMoves = useCallback(() => {
    moveRaf.current = null;
    for (const [pointerId, move] of pendingMoves.current) {
      sendTouch({ action: TouchAction.MOVE, pointerId, ...move });
    }
    pendingMoves.current.clear();
  }, [sendTouch]);

  const onPointerDown = (e: React.PointerEvent<HTMLCanvasElement>) => {
    const point = toDevice(e.clientX, e.clientY);
    if (!point) return;
    e.currentTarget.setPointerCapture(e.pointerId);
    activePointers.current.add(e.pointerId);
    sendTouch({
      action: TouchAction.DOWN,
      pointerId: e.pointerId,
      ...point,
      pressure: e.buttons & 2 ? 0 : e.pressure || 1,
      buttons: e.buttons,
    });
    longPressFired.current = false;
    cancelLongPress();
    longPress.current = {
      x: e.clientX,
      y: e.clientY,
      timer: setTimeout(() => {
        // Lift the raw touch and let the phone run a real long press.
        sendTouch({
          action: TouchAction.UP,
          pointerId: e.pointerId,
          ...point,
          pressure: 0,
          buttons: 0,
        });
        sendAction({ type: "long_press", ...point, durationMs: LONG_PRESS_MS });
        longPressFired.current = true;
        longPress.current = null;
      }, LONG_PRESS_MS),
    };
    if (activePointers.current.size === 1) {
      swipeOrigin.current = { id: e.pointerId, x: e.clientX, y: e.clientY };
      setSwipe(null);
    }
  };

  const onPointerMove = (e: React.PointerEvent<HTMLCanvasElement>) => {
    const lp = longPress.current;
    if (
      lp &&
      Math.hypot(e.clientX - lp.x, e.clientY - lp.y) > LONG_PRESS_SLOP_PX
    ) {
      cancelLongPress();
    }
    if (!activePointers.current.has(e.pointerId)) return;
    const point = toDevice(e.clientX, e.clientY);
    if (!point) return;
    const origin = swipeOrigin.current;
    if (origin && origin.id === e.pointerId && canvasEl) {
      const rect = canvasEl.getBoundingClientRect();
      setSwipe({
        x1: origin.x - rect.left,
        y1: origin.y - rect.top,
        x2: e.clientX - rect.left,
        y2: e.clientY - rect.top,
      });
    }
    pendingMoves.current.set(e.pointerId, {
      ...point,
      pressure: e.buttons & 2 ? 0 : e.pressure || 1,
      buttons: e.buttons,
    });
    if (moveRaf.current === null) {
      moveRaf.current = requestAnimationFrame(flushMoves);
    }
  };

  const endPointer = (
    e: React.PointerEvent<HTMLCanvasElement>,
    cancelled: boolean,
  ) => {
    pendingMoves.current.delete(e.pointerId);
    cancelLongPress();
    try {
      e.currentTarget.releasePointerCapture(e.pointerId);
    } catch {
      /* not captured */
    }
    const wasActive = activePointers.current.delete(e.pointerId);
    if (swipeOrigin.current?.id === e.pointerId) swipeOrigin.current = null;
    if (activePointers.current.size === 0) setSwipe(null);
    if (cancelled || !wasActive || longPressFired.current) {
      longPressFired.current = false;
      return;
    }
    const point = toDevice(e.clientX, e.clientY);
    if (!point) return;
    sendTouch({
      action: TouchAction.UP,
      pointerId: e.pointerId,
      ...point,
      pressure: 0,
      buttons: 0,
    });
  };

  const onWheel = (e: React.WheelEvent<HTMLCanvasElement>) => {
    const point = toDevice(e.clientX, e.clientY);
    if (!point) return;
    const distance = Math.max(50, Math.min(400, Math.abs(e.deltaY) * 2));
    sendAction({
      type: "swipe",
      startX: point.x,
      startY: point.y,
      endX: point.x,
      endY: point.y + (e.deltaY > 0 ? -distance : distance),
    });
  };

  const sendText = () => {
    const text = textInput.trim();
    if (!text) return;
    sendAction({ type: "input_text", text });
    setTextInput("");
  };

  const statusLabel =
    status === "open"
      ? t("companionPhone.mirror.statusOpen", "已连接")
      : status === "connecting"
      ? t("companionPhone.mirror.statusConnecting", "连接中")
      : t("companionPhone.mirror.statusClosed", "已断开");

  return (
    <aside aria-labelledby={titleId} className={styles.panel}>
      <div className={styles.header}>
        <div className={styles.headerText} id={titleId}>
          <div className={styles.title}>
            {t("companionPhone.mirror.title", "实时画面")}
          </div>
          <div className={styles.subtitle}>
            {device.name || device.model || device.device_id}
          </div>
        </div>
        <span className={`${styles.status} ${styles[`status_${status}`]}`}>
          <span className={styles.statusDot} />
          {statusLabel}
        </span>
        <button
          type="button"
          className={styles.iconButton}
          onClick={onClose}
          aria-label={t("companionPhone.mirror.close", "关闭")}
        >
          <X size={16} />
        </button>
      </div>

      <div className={styles.body}>
        {frame === null &&
          (status === "closed" ? (
            <div className={styles.placeholder}>
              <div className={styles.placeholderIcon}>
                <Smartphone size={24} strokeWidth={1.5} />
              </div>
              <div className={styles.placeholderText}>
                {t(
                  "companionPhone.mirror.closedHint",
                  "画面连接已断开，请确认手机在线后重试",
                )}
              </div>
              <button
                type="button"
                className={styles.retry}
                onClick={reconnect}
              >
                <RefreshCw size={12} />
                {t("companionPhone.mirror.retry", "重试")}
              </button>
            </div>
          ) : (
            <div className={styles.placeholder}>
              <span className={styles.spinner} />
              <span className={styles.placeholderText}>
                {t("companionPhone.mirror.waitingFrame", "等待手机画面…")}
              </span>
            </div>
          ))}
        <div
          className={styles.screen}
          style={{ display: frame === null ? "none" : undefined }}
        >
          <canvas
            ref={setCanvasEl}
            className={styles.canvas}
            style={{
              aspectRatio: frame
                ? `${frame.screenWidth}/${frame.screenHeight}`
                : "9/20",
              opacity: isConnected ? 1 : 0.5,
            }}
            onPointerDown={isConnected ? onPointerDown : undefined}
            onPointerMove={isConnected ? onPointerMove : undefined}
            onPointerUp={isConnected ? (e) => endPointer(e, false) : undefined}
            onPointerCancel={
              isConnected ? (e) => endPointer(e, true) : undefined
            }
            onWheel={isConnected ? onWheel : undefined}
            onContextMenu={(e) => e.preventDefault()}
          />
          {!isConnected && frame !== null && (
            <div className={styles.overlay}>
              <div>
                {t(
                  "companionPhone.mirror.closedHint",
                  "画面连接已断开，请确认手机在线后重试",
                )}
              </div>
              <button
                type="button"
                className={styles.overlayRetry}
                onClick={reconnect}
              >
                <RefreshCw size={12} />
                {t("companionPhone.mirror.retry", "重试")}
              </button>
            </div>
          )}
          {isConnected && frame?.source === "json" && (
            <div className={styles.banner}>
              {t(
                "companionPhone.mirror.awaitingAuthorization",
                "请在手机上允许屏幕录制，以获得流畅的实时画面",
              )}
            </div>
          )}
          {swipe && (
            <svg className={styles.swipe} aria-hidden>
              <line
                x1={swipe.x1}
                y1={swipe.y1}
                x2={swipe.x2}
                y2={swipe.y2}
                stroke="#0058BC"
                strokeWidth="2"
                strokeDasharray="4 2"
                opacity={0.6}
              />
            </svg>
          )}
        </div>
      </div>

      {frame !== null && (
        <div className={styles.footer}>
          <div className={styles.inputRow}>
            <input
              type="text"
              value={textInput}
              onChange={(e) => setTextInput(e.target.value)}
              onKeyDown={(e) => {
                // Enter mid-IME-composition confirms the candidate, not a send.
                if (e.key === "Enter" && !e.nativeEvent.isComposing) sendText();
                if (e.key === "Escape") setTextInput("");
              }}
              placeholder={t(
                "companionPhone.mirror.textPlaceholder",
                "输入文字发送到手机…",
              )}
              className={styles.textInput}
            />
            <button
              type="button"
              className={styles.sendButton}
              onClick={sendText}
              disabled={!textInput.trim()}
              aria-label={t("companionPhone.mirror.send", "发送")}
            >
              <Send size={14} />
            </button>
          </div>
          <div className={styles.infoRow}>
            <span>
              {frame.screenWidth}×{frame.screenHeight}
            </span>
            {frame.currentApp && (
              <span className={styles.currentApp}>{frame.currentApp}</span>
            )}
          </div>
        </div>
      )}
    </aside>
  );
}
