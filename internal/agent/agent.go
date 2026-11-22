package agent

import (
	"context"
	"encoding/json"
	"fmt"
	"log"
	"net/http"
	"net/url"
	"os"
	"runtime"
	"strings"
	"sync"
	"time"

	"github.com/gorilla/websocket"

	"github.com/mihob/mihob/internal/protocol"
)

type Config struct {
	HubURL    string
	NodeToken string
	DataDir   string
	MihomoBin string
	Version   string
}

type Agent struct {
	cfg       Config
	sup       *MihomoSupervisor
	collector *TrafficCollector
	startedAt time.Time
}

func New(cfg Config) *Agent {
	sup := NewMihomoSupervisor(cfg.MihomoBin, cfg.DataDir)
	return &Agent{
		cfg:       cfg,
		sup:       sup,
		collector: NewTrafficCollector(sup),
		startedAt: time.Now(),
	}
}

func (a *Agent) Run(ctx context.Context) error {
	if err := a.sup.Start(ctx); err != nil {
		return fmt.Errorf("start mihomo supervisor: %w", err)
	}
	a.collector.Start(ctx)

	wsURL, err := buildAgentWSURL(a.cfg.HubURL)
	if err != nil {
		return err
	}

	backoff := time.Second
	for {
		select {
		case <-ctx.Done():
			return nil
		default:
		}

		log.Printf("[agent] connecting to hub %s ...", wsURL)
		err := a.connectAndServe(ctx, wsURL)
		if ctx.Err() != nil {
			return nil
		}
		log.Printf("[agent] disconnected: %v; reconnecting in %s", err, backoff)
		select {
		case <-ctx.Done():
			return nil
		case <-time.After(backoff):
		}
		backoff *= 2
		if backoff > 30*time.Second {
			backoff = 30 * time.Second
		}
	}
}

func buildAgentWSURL(hubURL string) (string, error) {
	u, err := url.Parse(strings.TrimRight(strings.TrimSpace(hubURL), "/"))
	if err != nil {
		return "", err
	}
	switch u.Scheme {
	case "https":
		u.Scheme = "wss"
	case "http", "":
		u.Scheme = "ws"
	}
	u.Path = strings.TrimRight(u.Path, "/") + "/ws/agent"
	return u.String(), nil
}

func (a *Agent) connectAndServe(ctx context.Context, wsURL string) error {
	header := http.Header{}
	header.Set("X-Node-Token", a.cfg.NodeToken)

	dialer := websocket.Dialer{HandshakeTimeout: 15 * time.Second}
	conn, _, err := dialer.DialContext(ctx, wsURL, header)
	if err != nil {
		return err
	}
	defer conn.Close()

	var writeMu sync.Mutex
	sendEnv := func(msgType, reqID string, payload any) error {
		env, err := protocol.NewEnvelope(msgType, reqID, payload)
		if err != nil {
			return err
		}
		writeMu.Lock()
		defer writeMu.Unlock()
		_ = conn.SetWriteDeadline(time.Now().Add(15 * time.Second))
		return conn.WriteJSON(env)
	}

	// Send Hello
	hostname, _ := os.Hostname()
	_, mihomoVer, _ := a.sup.Status()
	_ = sendEnv(protocol.MsgHello, "", protocol.HelloPayload{
		AgentVersion:  a.cfg.Version,
		MihomoVersion: mihomoVer,
		OS:            runtime.GOOS,
		Arch:          runtime.GOARCH,
		Hostname:      hostname,
	})
	log.Printf("[agent] connected to hub successfully")

	sessionCtx, cancel := context.WithCancel(ctx)
	defer cancel()

	// Heartbeat + traffic report loop
	go func() {
		hbTicker := time.NewTicker(5 * time.Second)
		trTicker := time.NewTicker(10 * time.Second)
		defer hbTicker.Stop()
		defer trTicker.Stop()
		for {
			select {
			case <-sessionCtx.Done():
				return
			case <-hbTicker.C:
				running, mVer, cfgHash := a.sup.Status()
				conns, upRate, downRate, memUsed := a.collector.SnapshotLive()
				if err := sendEnv(protocol.MsgHeartbeat, "", protocol.HeartbeatPayload{
					MihomoRunning:     running,
					MihomoVersion:     mVer,
					MemUsed:           memUsed,
					ActiveConnections: conns,
					UpRate:            upRate,
					DownRate:          downRate,
					ConfigHash:        cfgHash,
					UptimeSec:         int64(time.Since(a.startedAt).Seconds()),
				}); err != nil {
					cancel()
					return
				}
			case <-trTicker.C:
				if rep := a.collector.DrainReport(); rep != nil {
					if err := sendEnv(protocol.MsgTrafficReport, "", rep); err != nil {
						cancel()
						return
					}
				}
			}
		}
	}()

	// Read loop
	for {
		var env protocol.Envelope
		if err := conn.ReadJSON(&env); err != nil {
			return err
		}
		switch env.Type {
		case protocol.MsgPushConfig:
			var p protocol.PushConfigPayload
			if err := json.Unmarshal(env.Payload, &p); err != nil {
				continue
			}
			log.Printf("[agent] applying pushed config (hash=%.12s, certs=%d)", p.ConfigHash, len(p.Certs))
			err := a.sup.ApplyConfig(&p)
			ack := protocol.ConfigAckPayload{
				Success:    err == nil,
				ConfigHash: p.ConfigHash,
			}
			if err != nil {
				ack.Error = err.Error()
				log.Printf("[agent] config apply failed: %v", err)
			} else {
				log.Printf("[agent] config applied & reloaded successfully")
			}
			_ = sendEnv(protocol.MsgConfigAck, env.RequestID, ack)

		case protocol.MsgKickUser:
			var p protocol.KickUserPayload
			if err := json.Unmarshal(env.Payload, &p); err == nil {
				kicked := a.sup.KickUsers(p.Identifiers)
				log.Printf("[agent] kicked %d active connections for %v", kicked, p.Identifiers)
			}

		case protocol.MsgRestartMihomo:
			log.Printf("[agent] restarting mihomo by hub command")
			a.sup.Restart()

		case protocol.MsgUpgradeMihomo:
			var p protocol.UpgradeMihomoPayload
			if err := json.Unmarshal(env.Payload, &p); err != nil {
				_ = sendEnv(protocol.MsgUpgradeAck, env.RequestID, protocol.UpgradeAckPayload{
					Success: false,
					Error:   "invalid upgrade payload",
				})
				continue
			}
			reqID := env.RequestID
			go func(payload protocol.UpgradeMihomoPayload, id string) {
				ver, err := a.sup.UpgradeMihomo(sessionCtx, a.cfg.HubURL, a.cfg.NodeToken, &payload)
				ack := protocol.UpgradeAckPayload{
					Success: err == nil,
					Version: ver,
				}
				if err != nil {
					ack.Error = err.Error()
					log.Printf("[agent] mihomo upgrade to %s failed: %v", payload.Version, err)
				}
				_ = sendEnv(protocol.MsgUpgradeAck, id, ack)
			}(p, reqID)
		}
	}
}
