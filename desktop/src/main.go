package main

import (
	"context"
	"embed"
	"encoding/json"
	"errors"
	"fmt"
	"log"
	"os"
	"os/exec"
	"runtime"
	"strconv"
	"strings"
	"sync"
	"time"

	"github.com/wailsapp/wails/v3/pkg/application"
	"github.com/wailsapp/wails/v3/pkg/events"
)

//go:embed assets/*
var assets embed.FS

const trayDoubleClick = 400 * time.Millisecond

// App is the Wails service bound to the shell UI.
type App struct {
	app            *application.App
	window         *application.WebviewWindow
	settingsWindow *application.WebviewWindow
	store          *settingsStore
	sleep          *sleepGuard
	cmd            *exec.Cmd
	mu             sync.Mutex
	quitting       bool

	trayClickMu    sync.Mutex
	lastTrayClick  time.Time
	trayClickTimer *time.Timer
	drops          dropServer
	ownsListenPort bool
}

func (a *App) ServiceName() string { return "desktop" }

func (a *App) ServiceStartup(context.Context, application.ServiceOptions) error { return nil }

func (a *App) ServiceShutdown() error {
	a.sleep.stop()
	a.mu.Lock()
	cmd := a.cmd
	a.cmd = nil
	ownsPort := a.ownsListenPort
	a.ownsListenPort = false
	a.mu.Unlock()
	stopOctop(cmd)
	if ownsPort {
		clearDesktopPort()
	}
	return nil
}

func (a *App) GetSettings() Settings {
	return a.store.get()
}

func (a *App) GetSettingsStatus() (Settings, error) {
	s := a.store.get()
	if a.app == nil {
		return s, nil
	}
	status, err := a.app.Autostart.Status()
	if err != nil {
		return s, fmt.Errorf("read autostart status: %w", err)
	}
	if s.Autostart != status.Enabled {
		s.Autostart = status.Enabled
		if err := a.store.save(s); err != nil {
			return s, err
		}
	}
	return s, nil
}

func (a *App) SaveSettings(next Settings) (Settings, error) {
	cur, err := a.GetSettingsStatus()
	if err != nil {
		return cur, err
	}
	autostart, err := a.setAutostart(next.Autostart)
	if err != nil {
		return cur, err
	}
	if err := a.sleep.set(next.PreventSleep); err != nil {
		if _, rollbackErr := a.setAutostart(cur.Autostart); rollbackErr != nil {
			log.Printf("rollback autostart after sleep prevention failure: %v", rollbackErr)
		}
		return cur, err
	}
	next.Autostart = autostart
	if err := a.store.save(next); err != nil {
		return cur, err
	}
	saved := a.store.get()
	a.applyDashboardPrefs(saved)
	return saved, nil
}

func (a *App) ShowMain() {
	a.showWindow()
}

func (a *App) HideSettings() {
	if a.settingsWindow == nil {
		return
	}
	a.settingsWindow.Hide()
}

func (a *App) Quit() {
	a.requestQuit()
}

func (a *App) setAutostart(on bool) (bool, error) {
	if a.app == nil {
		return false, fmt.Errorf("autostart is unavailable before the application starts")
	}
	if on {
		if err := a.app.Autostart.Enable(); err != nil {
			return false, fmt.Errorf("enable autostart: %w", err)
		}
	} else if err := a.app.Autostart.Disable(); err != nil {
		return false, fmt.Errorf("disable autostart: %w", err)
	}
	status, err := a.app.Autostart.Status()
	if err != nil {
		return false, fmt.Errorf("read autostart status: %w", err)
	}
	if status.Enabled != on {
		return status.Enabled, fmt.Errorf("autostart state did not update")
	}
	return status.Enabled, nil
}

func (a *App) applyDashboardPrefs(s Settings) {
	if a.window == nil {
		return
	}
	js := fmt.Sprintf(
		`(function(){try{localStorage.setItem('octop:ui-locale',%s);}catch(e){}})();`,
		jsonString(string(s.Locale)),
	)
	a.window.ExecJS(js)
}

func jsonString(s string) string {
	b, _ := json.Marshal(s)
	return string(b)
}

func (a *App) setStatus(msg string) {
	if a.app == nil {
		return
	}
	a.app.Event.Emit("desktop:status", msg)
}

func (a *App) boot() {
	locale := LocaleEN
	if a.store != nil {
		locale = a.store.get().Locale
	}
	if url := os.Getenv("OCTOP_DESKTOP_URL"); url != "" {
		a.setStatus(desktopText(locale, copyStatusConnecting))
		if err := waitHealth(locale, url, 60*time.Second); err != nil {
			a.setStatus(err.Error())
			return
		}
		a.showDashboard(url)
		return
	}
	a.setStatus(desktopText(locale, copyStatusCheckingRuntime))
	if err := ensurePortable(locale, a.setStatus); err != nil {
		a.setStatus(err.Error())
		return
	}
	root := portableDir()
	a.mu.Lock()
	stopOctop(a.cmd)
	a.cmd = nil
	a.mu.Unlock()
	host, preferred := resolveListen()
	if existing := findRunningDashboard(host, preferred, enterpriseLoginRequired()); existing != "" {
		a.setStatus(desktopText(locale, copyStatusUsingExisting))
		if err := waitHealth(locale, existing, 30*time.Second); err != nil {
			a.setStatus(err.Error())
			return
		}
		a.showDashboard(existing)
		return
	}
	port, err := chooseFreePort(host, preferred)
	if err != nil {
		var busy noFreePortError
		var bind cannotBindError
		switch {
		case errors.As(err, &busy):
			a.setStatus(desktopText(locale, copyErrorNoFreePort, busy.From, busy.To))
		case errors.As(err, &bind):
			a.setStatus(desktopText(locale, copyErrorCannotBind, bind.Host, bind.Port, bind.Err.Error()))
		default:
			a.setStatus(err.Error())
		}
		return
	}
	a.mu.Lock()
	cmd, err := startOctop(root, port)
	a.cmd = cmd
	a.mu.Unlock()
	if err != nil {
		a.setStatus(err.Error())
		return
	}
	base := dashboardURL(host, port)
	a.setStatus(desktopText(locale, copyStatusStartingService))
	if err := waitHealth(locale, base, 2*time.Minute); err != nil {
		a.setStatus(err.Error())
		return
	}
	if err := writeDesktopPort(port); err != nil {
		log.Printf("desktop port: %v", err)
	} else {
		a.mu.Lock()
		a.ownsListenPort = true
		a.mu.Unlock()
	}
	a.showDashboard(base)
}

func (a *App) showDashboard(base string) {
	if a.window == nil {
		return
	}
	s := a.store.get()
	if enterpriseLoginRequired() && !dashboardUsesEnterpriseLogin(base) {
		a.setStatus(desktopText(s.Locale, copyErrorEnterpriseLogin, base))
		return
	}
	// Bypass a stale WebView/service-worker HTML shell after a dashboard build.
	// The API remains same-origin because this is only a query parameter.
	dashboardURL := base
	if strings.Contains(dashboardURL, "?") {
		dashboardURL += "&desktop_reload=" + strconv.FormatInt(time.Now().UnixNano(), 10)
	} else {
		dashboardURL += "?desktop_reload=" + strconv.FormatInt(time.Now().UnixNano(), 10)
	}
	log.Printf("opening dashboard at %s", dashboardURL)
	a.window.SetURL(dashboardURL)
	a.scheduleDragOverlay()
	go func() {
		time.Sleep(800 * time.Millisecond)
		a.applyDashboardPrefs(s)
	}()
	a.setStatus(desktopText(s.Locale, copyStatusReady))
}

func (a *App) hideToTray() {
	if a.window == nil {
		return
	}
	a.window.Hide()
}

func (a *App) showWindow() {
	if a.window == nil {
		return
	}
	if a.window.IsMinimised() {
		a.window.UnMinimise()
	}
	a.window.Show()
	a.window.Focus()
}

func (a *App) toggleMainWindow() {
	if a.window == nil {
		return
	}
	if a.window.IsVisible() && !a.window.IsMinimised() {
		a.hideToTray()
		return
	}
	a.showWindow()
}

func (a *App) onTrayLeftClick() {
	a.trayClickMu.Lock()
	defer a.trayClickMu.Unlock()
	if a.trayClickTimer != nil {
		a.trayClickTimer.Stop()
		a.trayClickTimer = nil
	}
	now := time.Now()
	if !a.lastTrayClick.IsZero() && now.Sub(a.lastTrayClick) < trayDoubleClick {
		a.lastTrayClick = time.Time{}
		go a.toggleMainWindow()
		return
	}
	a.lastTrayClick = now
	a.trayClickTimer = time.AfterFunc(trayDoubleClick, func() {
		a.trayClickMu.Lock()
		a.trayClickTimer = nil
		a.trayClickMu.Unlock()
		a.showWindow()
	})
}

func (a *App) installDragOverlay() {
	if a.window == nil {
		return
	}
	a.window.ExecJS(dragOverlayJS())
	a.window.ExecJS(fileDropJS())
}

func (a *App) scheduleDragOverlay() {
	go func() {
		for range 40 {
			time.Sleep(250 * time.Millisecond)
			a.installDragOverlay()
			a.installExternalLinks()
		}
	}()
}

func (a *App) requestQuit() {
	a.mu.Lock()
	a.quitting = true
	a.mu.Unlock()
	if a.app != nil {
		a.app.Quit()
	}
}

func main() {
	store := &settingsStore{cur: loadSettings()}
	api := &App{
		store: store,
		sleep: &sleepGuard{},
	}

	app := application.New(application.Options{
		Name:        "Tabby",
		Description: "Tabby desktop",
		Services: []application.Service{
			application.NewService(api),
		},
		Assets: application.AssetOptions{
			Handler: application.BundledAssetFileServer(assets),
		},
		Windows: application.WindowsOptions{
			DisableQuitOnLastWindowClosed: true,
		},
		Linux: application.LinuxOptions{
			DisableQuitOnLastWindowClosed: true,
		},
		Mac: application.MacOptions{
			ApplicationShouldTerminateAfterLastWindowClosed: false,
		},
	})
	api.app = app
	attachOpenURLEventListener(app, api.OpenExternal)
	attachFileDropEventListener(app, api)
	app.Event.OnApplicationEvent(events.Common.ApplicationStarted, func(_ *application.ApplicationEvent) {
		applyAppIcon(app)
	})

	win := app.Window.NewWithOptions(application.WebviewWindowOptions{
		Title:                "Tabby",
		Width:                1200,
		Height:               800,
		URL:                  "/",
		Frameless:            true,
		AllowSimpleEventEmit: true,
		EnableFileDrop:       true,
		BackgroundColour:     application.NewRGB(247, 248, 250),
	})
	api.window = win
	app.Event.On("desktop:toggle-maximise", func(_ *application.CustomEvent) {
		win.ToggleMaximise()
	})
	app.Event.On("desktop:minimise", func(_ *application.CustomEvent) {
		win.Minimise()
	})
	app.Event.On("desktop:close", func(_ *application.CustomEvent) {
		api.hideToTray()
	})
	var bootOnce sync.Once
	startBoot := func() {
		bootOnce.Do(func() { go api.boot() })
	}
	// The splash page performs an initial Wails call before it is replaced by
	// the remote dashboard.  Wait for its explicit readiness event so the
	// response cannot be cut off by SetURL (which otherwise produces the noisy
	// Wails "request has been stopped" warning).
	app.Event.On("desktop:shell-ready", func(_ *application.CustomEvent) {
		startBoot()
	})
	startBootAfterShell := func(_ *application.WindowEvent) {
		// Keep a fallback for an older/cached splash asset that does not emit the
		// readiness event.  Normal startup reaches startBoot immediately above.
		time.AfterFunc(5*time.Second, startBoot)
		api.scheduleDragOverlay()
	}
	win.OnWindowEvent(events.Mac.WebViewDidFinishNavigation, startBootAfterShell)
	win.OnWindowEvent(events.Windows.WebViewNavigationCompleted, startBootAfterShell)
	win.OnWindowEvent(events.Linux.WindowLoadFinished, startBootAfterShell)
	settingsWin := app.Window.NewWithOptions(application.WebviewWindowOptions{
		Title:            "Tabby 设置",
		Width:            settingsWindowWidth,
		Height:           settingsWindowOuterHeight(),
		URL:              "/?settings=1",
		Hidden:           true,
		Frameless:        true,
		AlwaysOnTop:      true,
		DisableResize:    true,
		HideOnEscape:     true,
		HideOnFocusLost:  true,
		BackgroundColour: application.NewRGB(255, 255, 255),
		Mac: application.MacWindow{
			// The tray panel can take keyboard focus while another app stays active.
			WindowClass:      application.MacWindowClassPanel,
			PanelPreferences: application.MacPanelPreferences{NonActivating: true},
		},
		Windows: application.WindowsWindow{
			HiddenOnTaskbar: true,
		},
	})
	api.settingsWindow = settingsWin
	app.Event.RegisterApplicationEventHook(events.Mac.ApplicationShouldHandleReopen, func(event *application.ApplicationEvent) {
		event.Cancel()
		restoreMainAfterDockClick(api.window, api.settingsWindow)
	})

	win.RegisterHook(events.Common.WindowClosing, func(e *application.WindowEvent) {
		api.mu.Lock()
		quit := api.quitting
		api.mu.Unlock()
		if quit {
			return
		}
		e.Cancel()
		api.hideToTray()
	})
	win.OnWindowEvent(events.Common.WindowMinimise, func(_ *application.WindowEvent) {
		if api.store.get().MinimizeToTray {
			api.hideToTray()
		}
	})
	settingsWin.RegisterHook(events.Common.WindowClosing, func(e *application.WindowEvent) {
		e.Cancel()
		settingsWin.Hide()
	})

	tray := app.SystemTray.New()
	applyTrayIcon(tray)
	tray.SetTooltip("Tabby")
	showSettings := func() {
		if err := tray.PositionWindow(settingsWin, 6); err != nil {
			log.Printf("position settings window: %v", err)
		}
		settingsWin.Show().Focus()
	}
	if trayLeftClickShowsSettings(runtime.GOOS) {
		tray.OnClick(showSettings)
	} else {
		tray.OnClick(func() { api.onTrayLeftClick() })
	}
	tray.OnRightClick(showSettings)

	if _, err := api.setAutostart(store.get().Autostart); err != nil {
		log.Printf("sync autostart: %v", err)
	}
	if err := api.sleep.set(store.get().PreventSleep); err != nil {
		log.Printf("enable sleep prevention: %v", err)
	}

	api.scheduleDragOverlay()

	if err := app.Run(); err != nil {
		log.Fatal(err)
	}
}
