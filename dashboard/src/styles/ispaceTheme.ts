import { theme as antdTheme, type ThemeConfig } from "antd";

/**
 * Ant Design theme for the iSpace look (Tabby enterprise desktop).
 *
 * Values mirror ispace-tokens.css so antd's own CSS-in-JS (focus rings,
 * selected options, hover fills…) agrees with the skin overrides in
 * ispace-skin.css. Primary = near-black accent; brand orange is reserved
 * for focus / CTA (`is-cta`).
 */

const FONT_SANS =
  '"Manrope Variable", "Manrope", "Inter", -apple-system, "PingFang SC", "Noto Sans SC", system-ui, sans-serif';
const FONT_MONO = '"JetBrains Mono", "SF Mono", ui-monospace, monospace';

const FOCUS_ORANGE = "#ee5c2a";
const FOCUS_SHADOW = "0 0 0 2px rgba(238, 92, 42, 0.25)";
const SWITCH_BLUE = "#007aff";

const LIGHT = {
  accent: "#181715",
  accentHover: "#292724",
  accentFg: "#ffffff",
  canvas: "#faf8f3",
  surface1: "#ffffff",
  surface2: "#efece6",
  surface3: "#e4e1d9",
  heading: "#181715",
  text: "#292724",
  textSecondary: "#54524e",
  textTertiary: "#72706a",
  placeholder: "#a2a09b",
  border: "rgba(24, 23, 21, 0.1)",
  borderSubtle: "rgba(24, 23, 21, 0.06)",
  borderHover: "#d8d0c8",
  accentSubtle: "rgba(24, 23, 21, 0.06)",
  link: "#b93b07",
  success: "#008233",
  warning: "#a26000",
  error: "#cd2f3a",
  info: "#2f6fd6",
  tooltip: "#181715",
};

const DARK: typeof LIGHT = {
  accent: "#f3f1ef",
  accentHover: "#ffffff",
  accentFg: "#181715",
  canvas: "#1a1816",
  surface1: "#282522",
  surface2: "#322e2b",
  surface3: "#403c39",
  heading: "#f3f1ef",
  text: "#f3f1ef",
  textSecondary: "#a29d99",
  textTertiary: "#8c8682",
  placeholder: "#67625e",
  border: "rgba(255, 255, 255, 0.1)",
  borderSubtle: "rgba(255, 255, 255, 0.06)",
  borderHover: "rgba(255, 255, 255, 0.16)",
  accentSubtle: "rgba(255, 255, 255, 0.07)",
  link: "#ff8965",
  success: "#5fd98d",
  warning: "#e0ac55",
  error: "#ff8a8a",
  info: "#7aa7ef",
  tooltip: "#403c39",
};

export function ispaceAntdTheme(
  isDark: boolean,
  isMobile: boolean,
): ThemeConfig {
  const c = isDark ? DARK : LIGHT;
  const fieldTokens = {
    activeBorderColor: FOCUS_ORANGE,
    hoverBorderColor: c.borderHover,
    activeShadow: FOCUS_SHADOW,
  };
  return {
    algorithm: isDark ? antdTheme.darkAlgorithm : antdTheme.defaultAlgorithm,
    token: {
      fontFamily: FONT_SANS,
      fontFamilyCode: FONT_MONO,
      borderRadius: 8,
      ...(isMobile
        ? {
            fontSize: 15,
            fontSizeSM: 13,
            fontSizeLG: 17,
            fontSizeXL: 22,
            controlHeight: 36,
          }
        : { fontSize: 13, controlHeight: 32 }),
      colorPrimary: c.accent,
      colorPrimaryHover: c.accentHover,
      colorPrimaryActive: c.accentHover,
      colorPrimaryBg: c.accentSubtle,
      colorPrimaryBgHover: c.accentSubtle,
      colorPrimaryBorder: c.borderHover,
      colorPrimaryBorderHover: c.borderHover,
      colorPrimaryText: c.heading,
      colorPrimaryTextHover: c.heading,
      colorPrimaryTextActive: c.heading,
      colorLink: c.link,
      colorLinkHover: c.link,
      colorLinkActive: c.link,
      colorSuccess: c.success,
      colorWarning: c.warning,
      colorError: c.error,
      colorInfo: c.info,
      colorBgBase: c.canvas,
      colorBgLayout: c.canvas,
      colorBgContainer: c.surface1,
      colorBgElevated: c.surface1,
      colorBgSpotlight: c.tooltip,
      colorBgMask: "rgba(4, 32, 40, 0.32)",
      colorBorder: c.border,
      colorBorderSecondary: c.borderSubtle,
      colorText: c.text,
      colorTextHeading: c.heading,
      colorTextSecondary: c.textSecondary,
      colorTextTertiary: c.textTertiary,
      colorTextQuaternary: c.placeholder,
      colorTextPlaceholder: c.placeholder,
      colorFillSecondary: c.surface2,
      colorFillTertiary: c.surface2,
      colorFillQuaternary: c.accentSubtle,
      colorBgTextHover: c.accentSubtle,
      controlItemBgActive: c.accentSubtle,
      controlItemBgHover: c.accentSubtle,
      boxShadow: "0 4px 8px 0 rgba(0, 0, 0, 0.08)",
      boxShadowSecondary: "0 8px 24px rgba(0, 0, 0, 0.08)",
    },
    components: {
      Button: {
        primaryColor: c.accentFg,
        primaryShadow: "none",
        defaultShadow: "none",
      },
      Switch: { colorPrimary: SWITCH_BLUE, colorPrimaryHover: SWITCH_BLUE },
      Input: fieldTokens,
      InputNumber: fieldTokens,
      Select: { ...fieldTokens, optionSelectedBg: c.surface2 },
      DatePicker: fieldTokens,
      Segmented: { trackBg: c.surface2, itemSelectedBg: c.surface1 },
      Table: { headerBg: c.canvas, rowHoverBg: c.canvas },
      Modal: { contentBg: c.surface1, headerBg: c.surface1 },
      Tooltip: { colorBgSpotlight: c.tooltip },
      Card: { colorBgContainer: c.surface1 },
    },
  };
}
