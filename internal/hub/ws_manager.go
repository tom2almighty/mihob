package hub

import (
	"context"
	"encoding/json"
	"fmt"
	"log"
	"math"
	"net/http"
	"strings"
	"sync"
	"time"

	"github.com/gorilla/websocket"

	"github.com/mihob/mihob/internal/crypto"
	"github.com/mihob/mihob/internal/db"
	"github.com/mihob/mihob/internal/mihomogen"
	"github.com/mihob/mihob/internal/model"
	"github.com/mihob/mihob/internal/notify"
	"github.com/mihob/mihob/internal/protocol"
	"github.com/mihob/mihob/internal/warp"
)

type NodeRuntime struct {
	Online            bool
	MihomoRunning     bool
	MihomoVersion     string
	OS                string
	Arch              string
	UpgradeStatus     string
	UpgradeError      string
	UpgradeTarget     string
	UpgradeRequestID  string
	UpgradeStartedAt  time.Time
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
	store       *db.Store
	notify      *notify.Service
	mu          sync.RWMutex
	conns       map[int64]*AgentConn
	pendingWARP map[string]chan protocol.WARPRegisterAckPayload

	upgrader websocket.Upgrader
}

func NewWSManager(store *db.Store, notifySvc *notify.Service) *WSManager {
	return &WSManager{
		store:       store,
		notify:      notifySvc,
		conns:       make(map[int64]*AgentConn),
		pendingWARP: make(map[string]chan protocol.WARPRegisterAckPayload),
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
	n.OS = rt.OS
	n.Arch = rt.Arch
	n.UpgradeStatus = rt.UpgradeStatus
	n.UpgradeError = rt.UpgradeError
	n.UpgradeTarget = rt.UpgradeTarget
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

const agentReadTimeout = 30 * time.Second

func (m *WSManager) DisconnectNode(nodeID int64) {
	m.mu.Lock()
	ac, ok := m.conns[nodeID]
	if ok {
		delete(m.conns, nodeID)
	}
	m.mu.Unlock()
	if ok && ac != nil {
		_ = ac.Conn.Close()
	}
}

func (m *WSManager) CloseAll() {
	m.mu.Lock()
	conns := make([]*AgentConn, 0, len(m.conns))
	for id, ac := range m.conns {
		conns = append(conns, ac)
		delete(m.conns, id)
	}
	m.mu.Unlock()
	for _, ac := range conns {
		_ = ac.Conn.Close()
	}
}

func (m *WSManager) HandleAgentWS(w http.ResponseWriter, r *http.Request) {
	token := strings.TrimSpace(r.Header.Get("X-Node-Token"))
	if token == "" {
		if auth := r.Header.Get("Authorization"); strings.HasPrefix(auth, "Bearer ") {
			token = strings.TrimSpace(strings.TrimPrefix(auth, "Bearer "))
		}
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
	if m.notify != nil {
		m.notify.OnNodeConnected(node)
	}

	// Immediately push latest config upon connect
	go func() {
		if err := m.PushConfigToNode(node.ID); err != nil {
			log.Printf("[ws] initial push config to node %d failed: %v", node.ID, err)
		}
	}()

	defer func() {
		wasActive := false
		m.mu.Lock()
		if cur, ok := m.conns[node.ID]; ok && cur == ac {
			delete(m.conns, node.ID)
			wasActive = true
		}
		m.mu.Unlock()
		_ = conn.Close()
		log.Printf("[ws] node #%d (%s) disconnected", node.ID, node.Name)
		if wasActive && m.notify != nil {
			m.notify.OnNodeDisconnected(node)
		}
	}()

	conn.SetPongHandler(func(string) error {
		return conn.SetReadDeadline(time.Now().Add(agentReadTimeout))
	})

	for {
		_ = conn.SetReadDeadline(time.Now().Add(agentReadTimeout))
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
			ac.runtime.OS = p.OS
			ac.runtime.Arch = p.Arch
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
			if ac.runtime.UpgradeStatus == "upgrading" && p.MihomoVersion != "" && ac.runtime.UpgradeTarget != "" &&
				compareSemver(p.MihomoVersion, ac.runtime.UpgradeTarget) >= 0 {
				ac.runtime.UpgradeStatus = "success"
				ac.runtime.UpgradeError = ""
				ac.runtime.UpgradeRequestID = ""
			}
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
				if m.notify != nil {
					if n, err := m.store.GetNode(ac.NodeID); err == nil {
						m.notify.NotifyNodeConfigError(n, p.Error)
					}
				}
			}
		}

	case protocol.MsgTrafficReport:
		var p protocol.TrafficReportPayload
		if err := json.Unmarshal(env.Payload, &p); err == nil {
			m.processTrafficReport(ac.NodeID, &p)
		}

	case protocol.MsgUpgradeAck:
		var p protocol.UpgradeAckPayload
		if err := json.Unmarshal(env.Payload, &p); err == nil {
			m.mu.Lock()
			if p.Success {
				ac.runtime.UpgradeStatus = "success"
				ac.runtime.UpgradeError = ""
				if p.Version != "" {
					ac.runtime.MihomoVersion = p.Version
				}
			} else {
				ac.runtime.UpgradeStatus = "error"
				ac.runtime.UpgradeError = p.Error
			}
			m.mu.Unlock()
			if p.Success && p.Version != "" {
				_ = m.store.TouchNodeSeen(ac.NodeID, p.Version)
				log.Printf("[ws] node #%d mihomo upgraded to %s", ac.NodeID, p.Version)
			} else if !p.Success {
				log.Printf("[ws] node #%d mihomo upgrade failed: %s", ac.NodeID, p.Error)
			}
			if m.notify != nil {
				if n, err := m.store.GetNode(ac.NodeID); err == nil {
					m.notify.NotifyNodeUpgradeResult(n, p.Success, p.Version, p.Error)
				}
			}
		}

	case protocol.MsgWARPRegisterAck:
		var p protocol.WARPRegisterAckPayload
		if err := json.Unmarshal(env.Payload, &p); err == nil && env.RequestID != "" {
			m.mu.Lock()
			ch, ok := m.pendingWARP[env.RequestID]
			if ok {
				delete(m.pendingWARP, env.RequestID)
			}
			m.mu.Unlock()
			if ok {
				select {
				case ch <- p:
				default:
				}
			}
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

	inboundProtoByName := map[string]string{}
	if len(report.Users) > 0 {
		if ins, err := m.store.ListInboundsByNode(nodeID); err == nil {
			for _, inb := range ins {
				inboundProtoByName[inb.Name] = inb.Protocol
			}
		}
	}

	for _, uDelta := range report.Users {
		if uDelta.InboundUser == "" || (uDelta.Upload <= 0 && uDelta.Download <= 0) {
			continue
		}
		if proto := inboundProtoByName[uDelta.InboundName]; proto != "" {
			_ = m.store.RecordProtocolTrafficHourly(proto, uDelta.Upload, uDelta.Download)
		}
		user, err := m.store.GetUserByIdentifier(uDelta.InboundUser)
		if err != nil {
			continue
		}
		wasActive := user.IsActive(time.Now().UTC())
		scaledUp := int64(math.Round(float64(uDelta.Upload) * mult))
		scaledDown := int64(math.Round(float64(uDelta.Download) * mult))
		_ = m.store.AddUserTraffic(user.ID, scaledUp, scaledDown)
		_ = m.store.RecordUserTrafficHourly(user.ID, scaledUp, scaledDown)
		_ = m.store.RecordUserNodeTrafficHourly(user.ID, nodeID, scaledUp, scaledDown)

		// Re-check quota immediately
		user.TrafficUsed += scaledUp + scaledDown
		if wasActive && !user.IsActive(time.Now().UTC()) {
			kickIdentifiers = append(kickIdentifiers, user.Username, user.UUID)
			if m.notify != nil && user.TrafficLimit > 0 && user.TrafficUsed >= user.TrafficLimit {
				m.notify.NotifyUserExhausted(user)
			}
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
	prevNodeUsed := node.TrafficUsed
	node.TrafficUsed += report.NodeUpload + report.NodeDownload
	if m.notify != nil && (report.NodeUpload > 0 || report.NodeDownload > 0) {
		m.notify.NotifyNodeTrafficThreshold(node, prevNodeUsed, node.TrafficUsed)
	}
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

func (m *WSManager) BuildServerGenOptions() (*mihomogen.ServerGenOptions, *mihomogen.ClusterRelayGraph, error) {
	allNodes, err := m.store.ListNodes()
	if err != nil {
		return nil, nil, err
	}
	allInbounds, err := m.store.ListAllInbounds()
	if err != nil {
		return nil, nil, err
	}
	relayUser, err := m.store.GetOrCreateRelayUser()
	if err != nil {
		return nil, nil, err
	}
	serverTemplates, _ := m.store.ListTemplatesByKind(model.TemplateKindServer)
	tmplByID := make(map[int64]string, len(serverTemplates))
	defaultServerYAML := db.DefaultServerMihomoTemplate
	for i := range serverTemplates {
		tmplByID[serverTemplates[i].ID] = serverTemplates[i].Content
		if serverTemplates[i].IsDefault {
			defaultServerYAML = serverTemplates[i].Content
		}
	}
	if len(serverTemplates) > 0 && defaultServerYAML == db.DefaultServerMihomoTemplate {
		defaultServerYAML = serverTemplates[0].Content
	}

	resolveTmpl := func(n *model.Node) string {
		if n.ServerTemplateID != nil {
			if c, ok := tmplByID[*n.ServerTemplateID]; ok {
				return c
			}
		}
		return defaultServerYAML
	}

	graph := mihomogen.BuildClusterRelayGraph(allNodes, allInbounds, resolveTmpl)
	opts := &mihomogen.ServerGenOptions{
		AllNodes:        allNodes,
		AllInbounds:     allInbounds,
		RelayUser:       relayUser,
		RelayInboundIDs: graph.RelayInboundIDs,
	}
	return opts, graph, nil
}

func resolveServerTemplateYAML(store *db.Store, templateID *int64) string {
	if templateID != nil {
		if t, err := store.GetTemplate(*templateID); err == nil && t.Kind == model.TemplateKindServer {
			return t.Content
		}
	}
	if t, err := store.GetDefaultServerTemplate(); err == nil {
		return t.Content
	}
	return db.DefaultServerMihomoTemplate
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

	opts, _, err := m.BuildServerGenOptions()
	if err != nil {
		return err
	}
	serverTemplateYAML := resolveServerTemplateYAML(m.store, node.ServerTemplateID)
	bundle, err := mihomogen.GenerateServerConfig(node, inbounds, users, certsMap, serverTemplateYAML, opts, time.Now().UTC())
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
	if len(nodeIDs) == 0 {
		return
	}
	expanded := make([]int64, 0, len(nodeIDs)*2)
	expanded = append(expanded, nodeIDs...)
	if _, graph, err := m.BuildServerGenOptions(); err == nil && graph != nil {
		for _, nid := range nodeIDs {
			expanded = append(expanded, graph.ReferrersByNode[nid]...)
			expanded = append(expanded, graph.TargetsByNode[nid]...)
		}
	}

	seen := map[int64]struct{}{}
	for _, nid := range expanded {
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

const upgradeAckTimeout = 2 * time.Minute

func (m *WSManager) UpgradeNodeMihomo(nodeID int64, version, downloadPath, sha256Hex string) error {
	reqID := crypto.RandomHex(6)

	m.mu.Lock()
	ac, online := m.conns[nodeID]
	if !online {
		m.mu.Unlock()
		return fmt.Errorf("node is offline")
	}
	if ac.runtime.UpgradeStatus == "upgrading" {
		m.mu.Unlock()
		return fmt.Errorf("upgrade already in progress")
	}
	ac.runtime.UpgradeStatus = "upgrading"
	ac.runtime.UpgradeTarget = version
	ac.runtime.UpgradeError = ""
	ac.runtime.UpgradeRequestID = reqID
	ac.runtime.UpgradeStartedAt = time.Now().UTC()
	m.mu.Unlock()

	env, err := protocol.NewEnvelope(protocol.MsgUpgradeMihomo, reqID, protocol.UpgradeMihomoPayload{
		Version:      version,
		DownloadPath: downloadPath,
		SHA256:       sha256Hex,
	})
	if err != nil {
		m.mu.Lock()
		ac.runtime.UpgradeStatus = "error"
		ac.runtime.UpgradeError = err.Error()
		ac.runtime.UpgradeRequestID = ""
		m.mu.Unlock()
		return err
	}
	if err := ac.Send(env); err != nil {
		m.mu.Lock()
		ac.runtime.UpgradeStatus = "error"
		ac.runtime.UpgradeError = err.Error()
		ac.runtime.UpgradeRequestID = ""
		m.mu.Unlock()
		return fmt.Errorf("send upgrade_mihomo: %w", err)
	}

	// Watchdog: prevent upgrade status from staying stuck forever if agent never acks
	go func(targetConn *AgentConn, expectedReqID string) {
		time.Sleep(upgradeAckTimeout)
		m.mu.Lock()
		defer m.mu.Unlock()
		if cur, ok := m.conns[nodeID]; ok && cur == targetConn &&
			cur.runtime.UpgradeStatus == "upgrading" &&
			cur.runtime.UpgradeRequestID == expectedReqID {
			cur.runtime.UpgradeStatus = "error"
			cur.runtime.UpgradeError = "upgrade timed out waiting for agent response"
			cur.runtime.UpgradeRequestID = ""
			log.Printf("[ws] node #%d mihomo upgrade timed out (req=%s)", nodeID, expectedReqID)
		}
	}(ac, reqID)

	return nil
}

func (m *WSManager) IsNodeOnline(nodeID int64) bool {
	if m == nil {
		return false
	}
	m.mu.RLock()
	_, ok := m.conns[nodeID]
	m.mu.RUnlock()
	return ok
}

func (m *WSManager) RegisterWARPOnNode(ctx context.Context, nodeID int64, protocolName, license, jwt string) (*warp.Result, error) {
	if m == nil {
		return nil, fmt.Errorf("agent websocket manager unavailable")
	}
	reqID := crypto.RandomHex(8)
	ch := make(chan protocol.WARPRegisterAckPayload, 1)

	m.mu.Lock()
	ac, online := m.conns[nodeID]
	if !online {
		m.mu.Unlock()
		return nil, fmt.Errorf("node is offline")
	}
	m.pendingWARP[reqID] = ch
	m.mu.Unlock()

	defer func() {
		m.mu.Lock()
		delete(m.pendingWARP, reqID)
		m.mu.Unlock()
	}()

	env, err := protocol.NewEnvelope(protocol.MsgWARPRegister, reqID, protocol.WARPRegisterPayload{
		Protocol: protocolName,
		License:  license,
		JWT:      jwt,
	})
	if err != nil {
		return nil, err
	}
	if err := ac.Send(env); err != nil {
		return nil, fmt.Errorf("send warp_register to agent: %w", err)
	}

	select {
	case ack := <-ch:
		if !ack.Success {
			if ack.Error != "" {
				return nil, fmt.Errorf("%s", ack.Error)
			}
			return nil, fmt.Errorf("agent WARP registration failed")
		}
		if ack.Result == nil {
			return nil, fmt.Errorf("agent returned empty WARP registration result")
		}
		ack.Result.RegisteredBy = "agent"
		return ack.Result, nil
	case <-ctx.Done():
		return nil, fmt.Errorf("timed out waiting for agent WARP registration (upgrade agent to v1.5+ if unsupported)")
	}
}
