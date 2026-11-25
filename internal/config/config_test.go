package config

import (
	"os"
	"path/filepath"
	"testing"
)

func TestLoadOrInitHubAndEnvPrecedence(t *testing.T) {
	dir := t.TempDir()
	cfgPath := filepath.Join(dir, "config.yaml")

	cfg, created, err := LoadOrInitHub(cfgPath)
	if err != nil {
		t.Fatalf("LoadOrInitHub initial: %v", err)
	}
	if !created {
		t.Fatalf("expected config file to be auto-created")
	}
	if cfg.Server.Host != DefaultHost || cfg.Server.Port != DefaultPort || cfg.Storage.TrafficRetentionDays != DefaultTrafficRetentionDays {
		t.Fatalf("unexpected default config: %+v", cfg)
	}
	if _, err := os.Stat(cfgPath); err != nil {
		t.Fatalf("expected config.yaml to exist: %v", err)
	}

	customYAML := `
server:
  host: "127.0.0.1"
  port: "9090"
security:
  trust_proxy: true
  cors_origins:
    - "https://console.example.com/"
  allow_private_webhook: true
storage:
  traffic_retention_days: 90
`
	if err := os.WriteFile(cfgPath, []byte(customYAML), 0o600); err != nil {
		t.Fatalf("write custom yaml: %v", err)
	}

	cfg2, created2, err := LoadOrInitHub(cfgPath)
	if err != nil {
		t.Fatalf("LoadOrInitHub custom: %v", err)
	}
	if created2 {
		t.Fatalf("expected existing config file not to be marked created")
	}
	if cfg2.Server.Host != "127.0.0.1" || cfg2.Server.Port != "9090" || !cfg2.Security.TrustProxy || !cfg2.Security.AllowPrivateWebhook || cfg2.Storage.TrafficRetentionDays != 90 {
		t.Fatalf("unexpected parsed config: %+v", cfg2)
	}
	if len(cfg2.Security.CORSOrigins) != 1 || cfg2.Security.CORSOrigins[0] != "https://console.example.com" {
		t.Fatalf("expected trimmed cors origin, got %+v", cfg2.Security.CORSOrigins)
	}

	// Env overrides config.yaml
	t.Setenv("MIHOB_PORT", "18080")
	t.Setenv("MIHOB_TRUST_PROXY", "false")
	t.Setenv("MIHOB_TRAFFIC_RETENTION_DAYS", "30")
	cfg2.ApplyEnv()
	if cfg2.Server.Port != "18080" || cfg2.Security.TrustProxy || cfg2.Storage.TrafficRetentionDays != 30 {
		t.Fatalf("expected env overrides, got %+v", cfg2)
	}
}
