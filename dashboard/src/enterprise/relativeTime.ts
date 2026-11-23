import type { TFunction } from "i18next";
import { minutesSince } from "./format";

/** "刚刚" / "10 分钟前" / "3 小时前" / "2 天前" from an ISO timestamp. */
export function relativeTimeLabel(t: TFunction, iso: string): string {
  const minutes = minutesSince(iso);
  if (minutes < 1) return t("enterprise.core.justNow");
  if (minutes < 60) return t("enterprise.core.minutesAgo", { count: minutes });
  const hours = Math.floor(minutes / 60);
  if (hours < 24) return t("enterprise.core.hoursAgo", { count: hours });
  return t("enterprise.core.daysAgo", { count: Math.floor(hours / 24) });
}
