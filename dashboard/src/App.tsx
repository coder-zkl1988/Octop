import { createGlobalStyle } from "antd-style";
import { ConfigProvider } from "antd";
import zhCN from "antd/locale/zh_CN";
import enUS from "antd/locale/en_US";
import dayjs from "dayjs";
import "dayjs/locale/zh-cn";
import { useEffect } from "react";
import DesktopWindowControls from "./components/DesktopWindowControls";
import DesktopWindowDragBand from "./components/DesktopWindowDragBand";
import {
  DesktopChromeProvider,
  useDesktopChrome,
} from "./hooks/useDesktopChrome";
import { BrowserRouter, Routes, Route } from "react-router-dom";
import { routerBasename } from "./utils/publicUrl";
import { useTranslation } from "react-i18next";
import MainLayout from "./layouts/MainLayout";
import LoginPage from "./pages/Login";
import OidcComplete from "./pages/Login/OidcComplete";
import SetupPage from "./pages/Setup";
import InvitePage from "./pages/Invite";
import SharePage from "./pages/Share";
import DeviceRevokedPage from "./pages/Enterprise/DeviceRevoked";
import { EnterpriseProvider } from "./enterprise/EnterpriseContext";
import RevokedGate, { DEVICE_REVOKED_PATH } from "./enterprise/RevokedGate";
import EnterpriseStateGate from "./enterprise/EnterpriseStateGate";
import AuthGuard from "./components/AuthGuard";
import SelfHostedAuthRoutes from "./components/SelfHostedAuthRoutes";
import OctopSpinner from "./components/OctopSpinner";
import { AntdAppProvider } from "./components/AntdAppProvider";
import GlobalErrorBoundary from "./components/ErrorBoundary";
import { ThemeProvider, useTheme } from "./context/ThemeContext";
import { AgentProvider } from "./context/AgentContext";
import { LayoutModeProvider } from "./context/LayoutModeContext";
import { VoiceOutputProvider } from "./context/VoiceOutputContext";
import { useIsMobile } from "./hooks/useIsMobile";
import { useUnauthorizedRedirect } from "./hooks/useUnauthorizedRedirect";
import { isDesktopShell as isWailsDesktopShell } from "./utils/desktopChrome";
import { installDesktopExternalLinks } from "./utils/desktopExternalLinks";
import { ispaceAntdTheme } from "./styles/ispaceTheme";
import "@fontsource-variable/manrope/wght.css";
import "@fontsource/jetbrains-mono/400.css";
import "@fontsource/jetbrains-mono/500.css";
import "@fontsource/jetbrains-mono/700.css";
import "@fontsource/caveat/400.css";
import "./styles/theme-vars.css";
import "./styles/layout.css";
import "./styles/form-override.css";
import "./styles/spin-override.css";
import "./styles/ispace-tokens.css";
import "./styles/ispace-skin.css";

const GlobalStyle = createGlobalStyle`
* {
  margin: 0;
  box-sizing: border-box;
}
`;

function ThemedApp() {
  const { isDark } = useTheme();
  const { t, i18n } = useTranslation();
  const isMobile = useIsMobile();
  const desktopChrome = useDesktopChrome();
  // Make antd built-ins (Popconfirm OK/Cancel, Modal default footer, Empty,
  // Pagination, DatePicker, Table… ) follow the current UI language.
  // DatePicker month/weekday labels come from dayjs — keep it in sync too.
  const isZh = i18n.language?.toLowerCase().startsWith("zh") ?? false;
  const antdLocale = isZh ? zhCN : enUS;
  dayjs.locale(isZh ? "zh-cn" : "en");

  useUnauthorizedRedirect();

  useEffect(() => installDesktopExternalLinks(), []);

  // Set document title based on current language
  useEffect(() => {
    document.title = t("app.pageTitle");
  }, [t]);

  const themeConfig = ispaceAntdTheme(isDark, isMobile);

  return (
    <ConfigProvider
      theme={themeConfig}
      prefixCls="octop"
      locale={antdLocale}
      spin={{ indicator: <OctopSpinner /> }}
    >
      <AntdAppProvider>
        <DesktopChromeProvider value={desktopChrome}>
          <DesktopWindowDragBand />
          {desktopChrome && isWailsDesktopShell() ? (
            <DesktopWindowControls chrome={desktopChrome} />
          ) : null}
          <EnterpriseProvider>
            <Routes>
              <Route path="/login" element={<LoginPage />} />
              <Route element={<SelfHostedAuthRoutes />}>
                <Route path="/login/oidc/complete" element={<OidcComplete />} />
                <Route path="/setup" element={<SetupPage />} />
                <Route path="/invite" element={<InvitePage />} />
              </Route>
              <Route path="/share/:shareId" element={<SharePage />} />
              <Route
                path={DEVICE_REVOKED_PATH}
                element={<DeviceRevokedPage />}
              />
              <Route
                path="/*"
                element={
                  <RevokedGate>
                    <AuthGuard>
                      <AgentProvider>
                        <LayoutModeProvider>
                          <VoiceOutputProvider>
                            <MainLayout />
                          </VoiceOutputProvider>
                        </LayoutModeProvider>
                      </AgentProvider>
                    </AuthGuard>
                  </RevokedGate>
                }
              />
            </Routes>
            <EnterpriseStateGate />
          </EnterpriseProvider>
        </DesktopChromeProvider>
      </AntdAppProvider>
    </ConfigProvider>
  );
}

function App() {
  return (
    // `useTransitions` off: with router transitions on, React keeps the old
    // page mounted while a lazy route chunk downloads and never renders the
    // Suspense fallback, so a nav click looks like it did nothing.
    <BrowserRouter basename={routerBasename()} useTransitions={false}>
      <GlobalErrorBoundary>
        <GlobalStyle />
        <ThemeProvider>
          <ThemedApp />
        </ThemeProvider>
      </GlobalErrorBoundary>
    </BrowserRouter>
  );
}

export default App;
