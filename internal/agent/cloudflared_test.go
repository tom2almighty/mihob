package agent

import (
	"reflect"
	"testing"
)

func TestCloudflaredConfigBuildArgs(t *testing.T) {
	cfg := CloudflaredConfig{
		Token:         "eyJ-token",
		Protocol:      "quic",
		EdgeIPVersion: "4",
		HAConnections: "2",
		LogLevel:      "warn",
	}
	if !cfg.Enabled() {
		t.Fatalf("expected cfg.Enabled() == true")
	}
	want := []string{
		"tunnel", "--no-autoupdate",
		"--protocol", "quic",
		"--edge-ip-version", "4",
		"--ha-connections", "2",
		"--loglevel", "warn",
		"run",
	}
	if got := cfg.BuildArgs(); !reflect.DeepEqual(got, want) {
		t.Fatalf("BuildArgs mismatch: got %v, want %v", got, want)
	}

	// Defaults & invalid values are safely ignored
	def := CloudflaredConfig{Token: "tok", Protocol: "auto", EdgeIPVersion: "auto", HAConnections: "99", LogLevel: "bogus"}
	wantDef := []string{"tunnel", "--no-autoupdate", "run"}
	if got := def.BuildArgs(); !reflect.DeepEqual(got, wantDef) {
		t.Fatalf("BuildArgs default mismatch: got %v, want %v", got, wantDef)
	}
}
