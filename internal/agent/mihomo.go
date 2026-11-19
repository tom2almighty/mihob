package agent

import (
	"bytes"
	"context"
	"encoding/json"
	"fmt"
	"io"
	"log"
	"net"
	"net/http"
	"os"
	"os/exec"
	"path/filepath"
	"runtime"
	"strings"
	"sync"
	"time"

	"github.com/gorilla/websocket"
	"gopkg.in/yaml.v3"

	"github.com/mihob/mihob/internal/crypto"
	"github.com/mihob/mihob/internal/protocol"
)

type MihomoSupervisor struct {
	binPath    string
	dataDir    string
	socketPath string
	ctrlAddr   string
	secret     string

	mu         sync.RWMutex
	cmd        *exec.Cmd
	running    bool
	version    string
	configHash string
	httpClient *http.Client
	wsDialer   *websocket.Dialer
	restartCh  chan struct{}
}

func NewMihomoSupervisor(binPath, dataDir string) *MihomoSupervisor {
	if binPath == "" {
		binPath = "mihomo"
	}
	absData, err := filepath.Abs(dataDir)
	if err == nil {
		dataDir = absData
	}
	sockPath := filepath.Join(dataDir, "mihomo.sock")
	ctrlAddr := "127.0.0.1:19090"
	secret := crypto.RandomHex(16)

	s := &MihomoSupervisor{
		binPath:    binPath,
		dataDir:    dataDir,
		socketPath: sockPath,
		ctrlAddr:   ctrlAddr,
		secret:     secret,
		restartCh:  make(chan struct{}, 1),
	}

	if runtime.GOOS != "windows" {
		dialUnix := func(ctx context.Context, _, _ string) (net.Conn, error) {
			var d net.Dialer
			return d.DialContext(ctx, "unix", sockPath)
		}
		s.httpClient = &http.Client{
			Timeout: 10 * time.Second,
			Transport: &http.Transport{
				DialContext: dialUnix,
			},
		}
		s.wsDialer = &websocket.Dialer{
			NetDialContext:   dialUnix,
			HandshakeTimeout: 5 * time.Second,
		}
	} else {
		s.httpClient = &http.Client{Timeout: 10 * time.Second}
		s.wsDialer = &websocket.Dialer{HandshakeTimeout: 5 * time.Second}
	}
	return s
}

func (s *MihomoSupervisor) apiBaseURL() string {
	if runtime.GOOS != "windows" {
		return "http://unix"
	}
	return "http://" + s.ctrlAddr
}

func (s *MihomoSupervisor) wsBaseURL() string {
	if runtime.GOOS != "windows" {
		return "ws://unix"
	}
	return "ws://" + s.ctrlAddr
}

func (s *MihomoSupervisor) Start(ctx context.Context) error {
	if err := os.MkdirAll(filepath.Join(s.dataDir, "certs"), 0o755); err != nil {
		return err
	}
	cfgPath := filepath.Join(s.dataDir, "config.yaml")
	if _, err := os.Stat(cfgPath); os.IsNotExist(err) {
		bootstrap := s.injectController(map[string]any{
			"mode":      "direct",
			"log-level": "info",
			"listeners": []any{},
		})
		b, _ := yaml.Marshal(bootstrap)
		if err := os.WriteFile(cfgPath, b, 0o600); err != nil {
			return err
		}
	}

	go s.superviseLoop(ctx)
	return nil
}

func (s *MihomoSupervisor) superviseLoop(ctx context.Context) {
	cfgPath := filepath.Join(s.dataDir, "config.yaml")
	for {
		select {
		case <-ctx.Done():
			return
		default:
		}

		if runtime.GOOS != "windows" {
			_ = os.Remove(s.socketPath)
		}

		cmd := exec.CommandContext(ctx, s.binPath, "-d", s.dataDir, "-f", cfgPath)
		cmd.Stdout = os.Stdout
		cmd.Stderr = os.Stderr

		if err := cmd.Start(); err != nil {
			log.Printf("[mihomo] failed to start (%s): %v; retrying in 5s", s.binPath, err)
			s.setRunning(false, nil)
			select {
			case <-ctx.Done():
				return
			case <-time.After(5 * time.Second):
				continue
			}
		}

		s.setRunning(true, cmd)
		log.Printf("[mihomo] started pid=%d", cmd.Process.Pid)

		go func() {
			time.Sleep(1200 * time.Millisecond)
			if ver, err := s.FetchVersion(); err == nil && ver != "" {
				s.mu.Lock()
				s.version = ver
				s.mu.Unlock()
			}
		}()

		waitCh := make(chan error, 1)
		go func() { waitCh <- cmd.Wait() }()

		select {
		case <-ctx.Done():
			_ = cmd.Process.Kill()
			s.setRunning(false, nil)
			return
		case <-s.restartCh:
			log.Printf("[mihomo] restart requested")
			_ = cmd.Process.Kill()
			<-waitCh
			s.setRunning(false, nil)
		case err := <-waitCh:
			s.setRunning(false, nil)
			if ctx.Err() != nil {
				return
			}
			log.Printf("[mihomo] process exited: %v; restarting in 3s", err)
			select {
			case <-ctx.Done():
				return
			case <-time.After(3 * time.Second):
			}
		}
	}
}

func (s *MihomoSupervisor) setRunning(running bool, cmd *exec.Cmd) {
	s.mu.Lock()
	defer s.mu.Unlock()
	s.running = running
	s.cmd = cmd
}

func (s *MihomoSupervisor) Status() (running bool, version string, configHash string) {
	s.mu.RLock()
	defer s.mu.RUnlock()
	return s.running, s.version, s.configHash
}

func (s *MihomoSupervisor) Restart() {
	select {
	case s.restartCh <- struct{}{}:
	default:
	}
}

func (s *MihomoSupervisor) injectController(doc map[string]any) map[string]any {
	if doc == nil {
		doc = map[string]any{}
	}
	doc["external-controller"] = s.ctrlAddr
	doc["secret"] = s.secret
	if runtime.GOOS != "windows" {
		doc["external-controller-unix"] = s.socketPath
	}
	return doc
}

func (s *MihomoSupervisor) ApplyConfig(payload *protocol.PushConfigPayload) error {
	certsDir := filepath.Join(s.dataDir, "certs")
	if err := os.MkdirAll(certsDir, 0o755); err != nil {
		return err
	}

	// 1. Write certificates
	for _, cf := range payload.Certs {
		crtPath := filepath.Join(certsDir, fmt.Sprintf("cert-%d.crt", cf.ID))
		keyPath := filepath.Join(certsDir, fmt.Sprintf("cert-%d.key", cf.ID))
		if err := os.WriteFile(crtPath, []byte(cf.CertPEM), 0o644); err != nil {
			return fmt.Errorf("write cert %d: %w", cf.ID, err)
		}
		if err := os.WriteFile(keyPath, []byte(cf.KeyPEM), 0o600); err != nil {
			return fmt.Errorf("write key %d: %w", cf.ID, err)
		}
	}

	// 2. Parse & inject controlled API endpoints
	var doc map[string]any
	if err := yaml.Unmarshal([]byte(payload.ConfigYAML), &doc); err != nil {
		return fmt.Errorf("parse pushed yaml: %w", err)
	}
	doc = s.injectController(doc)
	finalBytes, err := yaml.Marshal(doc)
	if err != nil {
		return fmt.Errorf("marshal final yaml: %w", err)
	}

	// 3. Validate candidate with `mihomo -t`
	candPath := filepath.Join(s.dataDir, "config.candidate.yaml")
	if err := os.WriteFile(candPath, finalBytes, 0o600); err != nil {
		return err
	}
	defer func() { _ = os.Remove(candPath) }()

	testCmd := exec.Command(s.binPath, "-t", "-d", s.dataDir, "-f", candPath)
	if out, err := testCmd.CombinedOutput(); err != nil {
		return fmt.Errorf("mihomo config validation failed: %s", strings.TrimSpace(string(out)))
	}

	// 4. Backup & atomic replace
	cfgPath := filepath.Join(s.dataDir, "config.yaml")
	bakPath := filepath.Join(s.dataDir, "config.bak.yaml")
	if oldBytes, err := os.ReadFile(cfgPath); err == nil {
		_ = os.WriteFile(bakPath, oldBytes, 0o600)
	}
	if err := os.WriteFile(cfgPath, finalBytes, 0o600); err != nil {
		return err
	}

	// 5. Hot reload via mihomo API
	if err := s.reloadConfigAPI(cfgPath); err != nil {
		// Rollback on reload failure
		if bakBytes, bErr := os.ReadFile(bakPath); bErr == nil {
			_ = os.WriteFile(cfgPath, bakBytes, 0o600)
		}
		return fmt.Errorf("hot reload failed (rolled back): %w", err)
	}

	s.mu.Lock()
	s.configHash = payload.ConfigHash
	s.mu.Unlock()
	return nil
}

func (s *MihomoSupervisor) doRequest(method, path string, body any) (*http.Response, error) {
	var bodyReader io.Reader
	if body != nil {
		b, err := json.Marshal(body)
		if err != nil {
			return nil, err
		}
		bodyReader = bytes.NewReader(b)
	}
	req, err := http.NewRequest(method, s.apiBaseURL()+path, bodyReader)
	if err != nil {
		return nil, err
	}
	req.Header.Set("Authorization", "Bearer "+s.secret)
	if body != nil {
		req.Header.Set("Content-Type", "application/json")
	}
	return s.httpClient.Do(req)
}

func (s *MihomoSupervisor) reloadConfigAPI(cfgPath string) error {
	resp, err := s.doRequest(http.MethodPut, "/configs?force=true", map[string]string{
		"path": cfgPath,
	})
	if err != nil {
		return err
	}
	defer resp.Body.Close()
	if resp.StatusCode >= 300 {
		b, _ := io.ReadAll(resp.Body)
		return fmt.Errorf("status %d: %s", resp.StatusCode, strings.TrimSpace(string(b)))
	}
	return nil
}

func (s *MihomoSupervisor) FetchVersion() (string, error) {
	resp, err := s.doRequest(http.MethodGet, "/version", nil)
	if err != nil {
		return "", err
	}
	defer resp.Body.Close()
	var v struct {
		Version string `json:"version"`
	}
	if err := json.NewDecoder(resp.Body).Decode(&v); err != nil {
		return "", err
	}
	return v.Version, nil
}

type connSnapshot struct {
	DownloadTotal int64         `json:"downloadTotal"`
	UploadTotal   int64         `json:"uploadTotal"`
	Memory        uint64        `json:"memory"`
	Connections   []connTracker `json:"connections"`
}

type connTracker struct {
	ID       string `json:"id"`
	Upload   int64  `json:"upload"`
	Download int64  `json:"download"`
	Metadata struct {
		InboundName string `json:"inboundName"`
		InboundUser string `json:"inboundUser"`
	} `json:"metadata"`
}

func (s *MihomoSupervisor) KickUsers(identifiers []string) int {
	if len(identifiers) == 0 {
		return 0
	}
	targets := make(map[string]struct{}, len(identifiers))
	for _, id := range identifiers {
		if id != "" {
			targets[id] = struct{}{}
		}
	}
	resp, err := s.doRequest(http.MethodGet, "/connections", nil)
	if err != nil {
		return 0
	}
	defer resp.Body.Close()

	var snap connSnapshot
	if err := json.NewDecoder(resp.Body).Decode(&snap); err != nil {
		return 0
	}

	kicked := 0
	for _, c := range snap.Connections {
		if _, match := targets[c.Metadata.InboundUser]; match {
			dResp, err := s.doRequest(http.MethodDelete, "/connections/"+c.ID, nil)
			if err == nil {
				_ = dResp.Body.Close()
				kicked++
			}
		}
	}
	return kicked
}

func (s *MihomoSupervisor) DialConnectionsWS(ctx context.Context, intervalMs int) (*websocket.Conn, error) {
	url := fmt.Sprintf("%s/connections?interval=%d", s.wsBaseURL(), intervalMs)
	header := http.Header{}
	header.Set("Authorization", "Bearer "+s.secret)
	conn, _, err := s.wsDialer.DialContext(ctx, url, header)
	return conn, err
}
