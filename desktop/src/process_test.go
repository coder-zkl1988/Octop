package main

import (
	"io"
	"net"
	"net/http"
	"net/http/httptest"
	"testing"
)

func TestFindRunningDashboardRequiresEnterpriseLoginWhenConfigured(t *testing.T) {
	t.Setenv("OCTOP_HOME", t.TempDir())
	startDashboard := func(setupStatus string) *httptest.Server {
		server := httptest.NewServer(http.HandlerFunc(func(w http.ResponseWriter, r *http.Request) {
			switch r.URL.Path {
			case "/api/health":
				_, _ = io.WriteString(w, `{"ok":true,"users_loaded":0,"agents_running":0}`)
			case "/api/setup/status":
				_, _ = io.WriteString(w, setupStatus)
			default:
				http.NotFound(w, r)
			}
		}))
		t.Cleanup(server.Close)
		return server
	}
	legacy := startDashboard(`{"setup_required":false}`)
	enterprise := startDashboard(`{"setup_required":false,"enterprise_mode":true}`)
	legacyPort := legacy.Listener.Addr().(*net.TCPAddr).Port
	if err := writeDesktopPort(enterprise.Listener.Addr().(*net.TCPAddr).Port); err != nil {
		t.Fatal(err)
	}
	if got := findRunningDashboard("127.0.0.1", legacyPort, true); got != enterprise.URL+"/" {
		t.Fatalf("enterprise launch attached to %q, want %s/", got, enterprise.URL)
	}
	if got := findRunningDashboard("127.0.0.1", legacyPort, false); got != legacy.URL+"/" {
		t.Fatalf("self-hosted launch attached to %q, want %s/", got, legacy.URL)
	}
}
