package agent

import (
	"context"
	"log"
	"os"
	"os/exec"
	"strings"
	"time"
)

type CloudflaredConfig struct {
	Bin           string
	Token         string
	Protocol      string
	EdgeIPVersion string
	HAConnections string
	LogLevel      string
}

func CloudflaredConfigFromEnv() CloudflaredConfig {
	token := strings.TrimSpace(os.Getenv("CF_TUNNEL_TOKEN"))
	if token == "" {
		token = strings.TrimSpace(os.Getenv("TUNNEL_TOKEN"))
	}
	bin := strings.TrimSpace(os.Getenv("CF_TUNNEL_BIN"))
	if bin == "" {
		bin = "cloudflared"
	}
	return CloudflaredConfig{
		Bin:           bin,
		Token:         token,
		Protocol:      strings.TrimSpace(os.Getenv("CF_TUNNEL_PROTOCOL")),
		EdgeIPVersion: strings.TrimSpace(os.Getenv("CF_TUNNEL_EDGE_IP")),
		HAConnections: strings.TrimSpace(os.Getenv("CF_TUNNEL_HA_CONNECTIONS")),
		LogLevel:      strings.TrimSpace(os.Getenv("CF_TUNNEL_LOGLEVEL")),
	}
}

func (c CloudflaredConfig) Enabled() bool {
	return strings.TrimSpace(c.Token) != ""
}

func (c CloudflaredConfig) BuildArgs() []string {
	args := []string{"tunnel", "--no-autoupdate"}
	if p := strings.ToLower(strings.TrimSpace(c.Protocol)); p == "http2" || p == "quic" {
		args = append(args, "--protocol", p)
	}
	if ip := strings.TrimSpace(c.EdgeIPVersion); ip == "4" || ip == "6" {
		args = append(args, "--edge-ip-version", ip)
	}
	if ha := strings.TrimSpace(c.HAConnections); ha == "1" || ha == "2" || ha == "4" {
		args = append(args, "--ha-connections", ha)
	}
	if lvl := strings.ToLower(strings.TrimSpace(c.LogLevel)); lvl == "info" || lvl == "warn" || lvl == "error" || lvl == "debug" {
		args = append(args, "--loglevel", lvl)
	}
	args = append(args, "run")
	return args
}

type CloudflaredSupervisor struct {
	cfg CloudflaredConfig
}

func NewCloudflaredSupervisor(cfg CloudflaredConfig) *CloudflaredSupervisor {
	return &CloudflaredSupervisor{cfg: cfg}
}

func (s *CloudflaredSupervisor) Start(ctx context.Context) {
	if !s.cfg.Enabled() {
		return
	}
	binPath, err := exec.LookPath(s.cfg.Bin)
	if err != nil {
		log.Printf("[cloudflared] CF_TUNNEL_TOKEN is set, but %q binary was not found in PATH (%v); use the -cf agent image or install cloudflared", s.cfg.Bin, err)
		return
	}

	args := s.cfg.BuildArgs()
	go func() {
		backoff := 2 * time.Second
		for {
			select {
			case <-ctx.Done():
				return
			default:
			}

			log.Printf("[cloudflared] starting %s %s", binPath, strings.Join(args, " "))
			startedAt := time.Now()
			cmd := exec.CommandContext(ctx, binPath, args...)
			cmd.Env = append(os.Environ(), "TUNNEL_TOKEN="+s.cfg.Token)
			cmd.Stdout = os.Stdout
			cmd.Stderr = os.Stderr

			err := cmd.Run()
			if ctx.Err() != nil {
				log.Printf("[cloudflared] stopped")
				return
			}
			if time.Since(startedAt) >= 30*time.Second {
				backoff = 2 * time.Second
			}
			log.Printf("[cloudflared] exited (%v); restarting in %s", err, backoff)
			select {
			case <-ctx.Done():
				return
			case <-time.After(backoff):
			}
			backoff *= 2
			if backoff > 30*time.Second {
				backoff = 30 * time.Second
			}
		}
	}()
}
