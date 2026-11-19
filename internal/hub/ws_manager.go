package hub

import (
	"encoding/json"
	"fmt"
	"log"
	"math"
	"net/http"
	"sync"
	"time"

	"github.com/gorilla/websocket"

	"github.com/mihob/mihob/internal/crypto"
	"github.com/mihob/mihob/internal/db"
	"github.com/mihob/mihob/internal/mihomogen"
	"github.com/mihob/mihob/internal/model"
	"github.com/mihob/mihob/internal/protocol"
)

type NodeRuntime struct {
	Online            bool
	MihomoRunning     bool
	MihomoVersion     string
	CPUPercent        float64
	MemUsed           uint64
	MemTotal          uint64
	ActiveConnections int
	UpRate            int64
	DownRate          int64
	ConfigHash        string
	ConnectedAt       time.Time
}

type AgentConn struct {
	NodeID  int64
	Conn    *websocket.Conn
	writeMu sync.Mutex
	runtime NodeRuntime
}

func (a *AgentConn) Send(env *protocol.Envelope) error {
	a.writeMu.Lock()
	defer a.writeMu.Unlock()
	_ = a.Conn.SetWriteDeadline(time.Now().Add(15 * time.Second))
	return a.Conn.WriteJSON(env)
}

type WSManager struct {
	store *db.Store
	mu    sync.RWMutex
	conns map[int64]*AgentConn

	upgrader websocket.Upgrader
}

func NewWSManager(store *db.Store) *WSManager {
	return &WSManager{
		store: store,
		conns: make(map[int64]*AgentConn),
		upgrader: websocket.Upgrader{
			ReadBufferSize:  16 * 1024,
			WriteBufferSize: 16 * 1024,
			CheckOrigin:     func(r *http.Request) bool { return true },
		},
	}
}

func (m *WSManager) GetRuntime(nodeID int64) NodeRuntime {
	m.mu.RLock()
	defer m.mu.RUnlock()
	if ac, ok := m.conns[nodeID]; ok {
		return ac.runtime
	}
	return NodeRuntime{}
}

func (m *WSManager) EnrichNode(n *model.Node) {
	rt := m.GetRuntime(n.ID)
	n.Online = rt.Online
	n.MihomoRunning = rt.MihomoRunning
	n.CPUPercent = rt.CPUPercent
	n.MemUsed = rt.MemUsed
	n.MemTotal = rt.MemTotal
	n.ActiveConnections = rt.ActiveConnections
	n.UpRate = rt.UpRate
	n.DownRate = rt.DownRate
	if rt.MihomoVersion != "" {
		n.MihomoVersion = rt.MihomoVersion
	}
}

func (m *WSManager) HandleAgentWS(w http.ResponseWriter, r *http.Request) {
	token := r.Header.Get("X-Node-Token")
	if token == "" {
		token = r.URL.Query().Get("token")
	}
	if token == "" {
		http.Error(w, "missing node token", http.StatusUnauthorized)
		return
	}
	node, err := m.store.GetNodeByToken(token)
	if err != nil {
		http.Error(w, "invalid node token", http.StatusUnauthorized)
		return
	}

	conn, err := m.upgrader.Upgrade(w, r, nil)
	if err != nil {
		log.Printf("[ws] upgrade error for node %d: %v", node.ID, err)
		return
	}

	ac := &AgentConn{
		NodeID: node.ID,
		Conn:   conn,
		runtime: NodeRuntime{
			Online:      true,
			ConnectedAt: time.Now().UTC(),
		},
	}

	m.mu.Lock()
	if old, exists := m.conns[node.ID]; exists {
		_ = old.Conn.Close()
	}
	m.conns[node.ID] = ac
	m.mu.Unlock()

	log.Printf("[ws] node #%d (%s) connected from %s", node.ID, node.Name, r.RemoteAddr)
	_ = m.store.TouchNodeSeen(node.ID, "")

	// Immediately push latest config upon connect
	go func() {
		if err := m.PushConfigToNode(node.ID); err != nil {
			log.Printf("[ws] initial push config to node %d failed: %v", node.ID, err)
		}
	}()

	defer func() {
		m.mu.Lock()
		if cur, ok := m.conns[node.ID]; ok && cur == ac {
			delete(m.conns, node.ID)
		}
		m.mu.Unlock()
		_ = conn.Close()
		log.Printf("[ws] node #%d (%s) disconnected", node.ID, node.Name)
	}()

	for {
		var env protocol.Envelope
		if err := conn.ReadJSON(&env); err != nil {
			return
		}
		m.handleMessage(ac, &env)
	}
}

func (m *WSManager) handleMessage(ac *AgentConn, env *protocol.Envelope) {
	switch env.Type {
	case protocol.MsgPing:
		if pong, err := protocol.NewEnvelope(protocol.MsgPong, env.RequestID, nil); err == nil {
			_ = ac.Send(pong)
		}

	case protocol.MsgHello:
		var p protocol.HelloPayload
		if err := json.Unmarshal(env.Payload, &p); err == nil {
			m.mu.Lock()
			ac.runtime.MihomoVersion = p.MihomoVersion
			m.mu.Unlock()
			_ = m.store.UpdateNodeAgentInfo(ac.NodeID, p.AgentVersion, p.MihomoVersion)
		}

	case protocol.MsgHeartbeat:
		var p protocol.HeartbeatPayload
		if err := json.Unmarshal(env.Payload, &p); err == nil {
			m.mu.Lock()
			ac.runtime.MihomoRunning = p.MihomoRunning
			ac.runtime.MihomoVersion = p.MihomoVersion
			ac.runtime.CPUPercent = p.CPUPercent
			ac.runtime.MemUsed = p.MemUsed
			ac.runtime.MemTotal = p.MemTotal
			ac.runtime.ActiveConnections = p.ActiveConnections
			ac.runtime.UpRate = p.UpRate
			ac.runtime.DownRate = p.DownRate
			ac.runtime.ConfigHash = p.ConfigHash
			m.mu.Unlock()
			_ = m.store.TouchNodeSeen(ac.NodeID, p.MihomoVersion)
		}

	case protocol.MsgConfigAck:
		var p protocol.ConfigAckPayload
		if err := json.Unmarshal(env.Payload, &p); err == nil {
			if p.Success {
				_ = m.store.UpdateNodeConfigStatus(ac.NodeID, p.ConfigHash, "synced", "")
			} else {
				_ = m.store.UpdateNodeConfigStatus(ac.NodeID, p.ConfigHash, "error", p.Error)
			}
		}

	case protocol.MsgTrafficReport:
		var p protocol.TrafficReportPayload
		if err := json.Unmarshal(env.Payload, &p); err == nil {
			m.processTrafficReport(ac.NodeID, &p)
		}
	}
}

func (m *WSManager) processTrafficReport(nodeID int64, report *protocol.TrafficReportPayload) {
	node, err := m.store.GetNode(nodeID)
	if err != nil {
		return
	}
	wasNodeExceeded := node.IsQuotaExceeded()

	if report.NodeUpload > 0 || report.NodeDownload > 0 {
		_ = m.store.AddNodeTraffic(nodeID, report.NodeUpload, report.NodeDownload)
		_ = m.store.RecordTrafficHourly(nodeID, report.NodeUpload, report.NodeDownload)
	}

	mult := node.TrafficMultiplier
	if mult <= 0 {
		mult = 1.0
	}

	var kickIdentifiers []string
	affectedNodes := map[int64]struct{}{}

	for _, uDelta := range report.Users {
		if uDelta.InboundUser == "" || (uDelta.Upload <= 0 && uDelta.Download <= 0) {
			continue
		}
		user, err := m.store.GetUserByIdentifier(uDelta.InboundUser)
		if err != nil {
			continue
		}
		wasActive := user.IsActive(time.Now().UTC())
		scaledUp := int64(math.Round(float64(uDelta.Upload) * mult))
		scaledDown := int64(math.Round(float64(uDelta.Download) * mult))
		_ = m.store.AddUserTraffic(user.ID, scaledUp, scaledDown)

		// Re-check quota immediately
		user.TrafficUsed += scaledUp + scaledDown
		if wasActive && !user.IsActive(time.Now().UTC()) {
			kickIdentifiers = append(kickIdentifiers, user.Username, user.UUID)
			fullUser, err := m.store.GetUser(user.ID)
			if err == nil {
				for _, nid := range fullUser.NodeIDs {
					affectedNodes[nid] = struct{}{}
				}
			} else {
				affectedNodes[nodeID] = struct{}{}
			}
		}
	}

	// Re-check node quota
	node.TrafficUsed += report.NodeUpload + report.NodeDownload
	if !wasNodeExceeded && node.IsQuotaExceeded() {
		log.Printf("[quota] node #%d (%s) reached traffic limit, disabling listeners", node.ID, node.Name)
		affectedNodes[nodeID] = struct{}{}
	}

	if len(kickIdentifiers) > 0 {
		for nid := range affectedNodes {
			_ = m.PushConfigToNode(nid)
			_ = m.KickUsersOnNode(nid, kickIdentifiers)
		}
	} else if len(affectedNodes) > 0 {
		for nid := range affectedNodes {
			_ = m.PushConfigToNode(nid)
		}
	}
}

func (m *WSManager) PushConfigToNode(nodeID int64) error {
	node, err := m.store.GetNode(nodeID)
	if err != nil {
		return err
	}
	inbounds, err := m.store.ListInboundsByNode(nodeID)
	if err != nil {
		return err
	}
	users, err := m.store.ListUsersByNode(nodeID)
	if err != nil {
		return err
	}
	certsList, err := m.store.ListCertificates()
	if err != nil {
		return err
	}
	certsMap := make(map[int64]*model.Certificate, len(certsList))
	for i := range certsList {
		certsMap[certsList[i].ID] = &certsList[i]
	}

	bundle, err := mihomogen.GenerateServerConfig(node, inbounds, users, certsMap, time.Now().UTC())
	if err != nil {
		_ = m.store.UpdateNodeConfigStatus(nodeID, "", "error", err.Error())
		return err
	}

	m.mu.RLock()
	ac, online := m.conns[nodeID]
	m.mu.RUnlock()
	if !online {
		_ = m.store.UpdateNodeConfigStatus(nodeID, bundle.ConfigHash, "pending", "")
		return nil
	}

	env, err := protocol.NewEnvelope(protocol.MsgPushConfig, crypto.RandomHex(6), protocol.PushConfigPayload{
		ConfigYAML: bundle.ConfigYAML,
		ConfigHash: bundle.ConfigHash,
		Certs:      bundle.Certs,
	})
	if err != nil {
		return err
	}
	if err := ac.Send(env); err != nil {
		return fmt.Errorf("send push_config: %w", err)
	}
	return nil
}

func (m *WSManager) PushConfigToNodes(nodeIDs []int64) {
	seen := map[int64]struct{}{}
	for _, nid := range nodeIDs {
		if _, ok := seen[nid]; ok {
			continue
		}
		seen[nid] = struct{}{}
		go func(id int64) {
			if err := m.PushConfigToNode(id); err != nil {
				log.Printf("[ws] push config to node %d failed: %v", id, err)
			}
		}(nid)
	}
}

func (m *WSManager) KickUsersOnNode(nodeID int64, identifiers []string) error {
	if len(identifiers) == 0 {
		return nil
	}
	m.mu.RLock()
	ac, online := m.conns[nodeID]
	m.mu.RUnlock()
	if !online {
		return nil
	}
	env, err := protocol.NewEnvelope(protocol.MsgKickUser, crypto.RandomHex(6), protocol.KickUserPayload{
		Identifiers: identifiers,
	})
	if err != nil {
		return err
	}
	return ac.Send(env)
}

func (m *WSManager) RestartNodeMihomo(nodeID int64) error {
	m.mu.RLock()
	ac, online := m.conns[nodeID]
	m.mu.RUnlock()
	if !online {
		return fmt.Errorf("node is offline")
	}
	env, err := protocol.NewEnvelope(protocol.MsgRestartMihomo, crypto.RandomHex(6), nil)
	if err != nil {
		return err
	}
	return ac.Send(env)
}
