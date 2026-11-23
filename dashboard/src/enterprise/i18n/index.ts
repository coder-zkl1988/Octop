import * as account from "./account";
import * as auth from "./auth";
import * as chat from "./chat";
import * as control from "./control";
import * as core from "./core";
import * as experts from "./experts";
import * as knowledge from "./knowledge";
import * as personalization from "./personalization";
import * as settings from "./settings";

/**
 * Enterprise-edition strings, merged into the main bundles under
 * `enterprise.<area>.*`. One file per area keeps parallel edits apart.
 */
const AREAS = {
  account,
  auth,
  chat,
  control,
  core,
  experts,
  knowledge,
  personalization,
  settings,
};

type Locale = "zh" | "en";

function bundleFor(locale: Locale): Record<string, unknown> {
  return Object.fromEntries(
    Object.entries(AREAS).map(([area, mod]) => [area, mod[locale]]),
  );
}

/** Return `bundle` with the enterprise strings attached for `locale`. */
export function withEnterpriseStrings<T extends object>(
  bundle: T,
  locale: Locale,
): T & { enterprise: Record<string, unknown> } {
  return { ...bundle, enterprise: bundleFor(locale) };
}
