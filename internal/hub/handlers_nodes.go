package hub

import (
	"fmt"
	"net/http"
	"strconv"
	"strings"
	"time"

	"github.com/go-chi/chi/v5"

	"github.com/mihob/mihob/internal/crypto"
	"github.com/mihob/mihob/internal/mihomogen"
	"github.com/mihob/mihob/internal/model"
)

func parseIDParam(r *http.Request, key string) (int64, error) {
	return strconv.ParseInt(chi.URLParam(r, key), 10, 64)
}

func (s *Server) handleListNodes(w http.ResponseWriter, r *http.Request) {
	nodes, err := s.store.ListNodes()
	if err != nil {
		writeError(w, http.StatusInternalServerError, err.Error())
		return
	}
	for i := range nodes {
		s.ws.EnrichNode(&nodes[i])
	}
	writeJSON(w, http.StatusOK, nodes)
}

func (s *Server) handleReorderNodes(w http.ResponseWriter, r *http.Request) {
	var req struct {
		IDs []int64 `json:"ids"`
	}
	if err := decodeJSON(r, &req); err != nil {
		writeError(w, http.StatusBadRequest, "invalid request body")
		return
	}
	if err := s.store.ReorderNodes(req.IDs); err != nil {
		writeError(w, http.StatusInternalServerError, err.Error())
		return
	}
	writeJSON(w, http.StatusOK, map[string]string{"status": "ok"})
}

func (s *Server) handleGetNode(w http.ResponseWriter, r *http.Request) {
	id, err := parseIDParam(r, "id")
	if err != nil {
		writeError(w, http.StatusBadRequest, "invalid node id")
		return
	}
	node, err := s.store.GetNode(id)
	if err != nil {
		writeError(w, http.StatusNotFound, "node not found")
		return
	}
	s.ws.EnrichNode(node)
	writeJSON(w, http.StatusOK, node)
}

func (s *Server) handleCreateNode(w http.ResponseWriter, r *http.Request) {
	var req struct {
		Name              string                    `json:"name"`
		Host              string                    `json:"host"`
		Region            string                    `json:"region"`
		Tags              []string                  `json:"tags"`
		Enabled           *bool                     `json:"enabled"`
		TrafficLimit      int64                     `json:"traffic_limit"`
		TrafficMultiplier float64                   `json:"traffic_multiplier"`
		ResetDay          int                       `json:"reset_day"`
		ExpireAt          *time.Time                `json:"expire_at"`
		BillingCycle      string                    `json:"billing_cycle"`
		Remark            string                    `json:"remark"`
		ServerTemplateID  *int64                    `json:"server_template_id"`
		ServerLogLevel    string                    `json:"server_log_level"`
		ServerIPv6        *bool                     `json:"server_ipv6"`
		OutboundConfig    *model.NodeOutboundConfig `json:"outbound_config"`
		ExtraServerYAML   string                    `json:"extra_server_yaml"`
	}
	if err := decodeJSON(r, &req); err != nil {
		writeError(w, http.StatusBadRequest, "invalid request body")
		return
	}
	if strings.TrimSpace(req.Name) == "" || strings.TrimSpace(req.Host) == "" {
		writeError(w, http.StatusBadRequest, "节点名称与主机地址不能为空")
		return
	}
	req.ServerLogLevel = strings.TrimSpace(req.ServerLogLevel)
	if !model.IsValidServerLogLevel(req.ServerLogLevel) {
		writeError(w, http.StatusBadRequest, "无效的日志级别")
		return
	}
	if req.ServerTemplateID != nil {
		t, err := s.store.GetTemplate(*req.ServerTemplateID)
		if err != nil || t.Kind != model.TemplateKindServer {
			writeError(w, http.StatusBadRequest, "指定的节点服务端模板不存在")
			return
		}
	}
	var outboundCfg model.NodeOutboundConfig
	if req.OutboundConfig != nil {
		outboundCfg = *req.OutboundConfig
	}
	outboundCfg.Normalize()
	if err := outboundCfg.Validate(); err != nil {
		writeError(w, http.StatusBadRequest, "节点出站配置无效: "+err.Error())
		return
	}
	if err := mihomogen.ValidateServerTemplateDirectives(req.ExtraServerYAML); err != nil {
		writeError(w, http.StatusBadRequest, "节点附加 YAML 无效: "+err.Error())
		return
	}
	enabled := true
	if req.Enabled != nil {
		enabled = *req.Enabled
	}
	node := &model.Node{
		Name:              strings.TrimSpace(req.Name),
		Host:              strings.TrimSpace(req.Host),
		Region:            strings.TrimSpace(req.Region),
		Tags:              model.NormalizeTags(req.Tags),
		Enabled:           enabled,
		TrafficLimit:      req.TrafficLimit,
		TrafficMultiplier: req.TrafficMultiplier,
		ResetDay:          req.ResetDay,
		ExpireAt:          req.ExpireAt,
		BillingCycle:      strings.TrimSpace(req.BillingCycle),
		Remark:            strings.TrimSpace(req.Remark),
		ServerTemplateID:  req.ServerTemplateID,
		ServerLogLevel:    req.ServerLogLevel,
		ServerIPv6:        req.ServerIPv6,
		OutboundConfig:    outboundCfg,
		ExtraServerYAML:   req.ExtraServerYAML,
	}
	if err := s.store.CreateNode(node); err != nil {
		writeError(w, http.StatusInternalServerError, err.Error())
		return
	}
	s.ws.PushConfigToNodes([]int64{node.ID})
	writeJSON(w, http.StatusCreated, node)
}

func (s *Server) handleUpdateNode(w http.ResponseWriter, r *http.Request) {
	id, err := parseIDParam(r, "id")
	if err != nil {
		writeError(w, http.StatusBadRequest, "invalid node id")
		return
	}
	existing, err := s.store.GetNode(id)
	if err != nil {
		writeError(w, http.StatusNotFound, "node not found")
		return
	}
	var req struct {
		Name              string                    `json:"name"`
		Host              string                    `json:"host"`
		Region            string                    `json:"region"`
		Tags              []string                  `json:"tags"`
		Enabled           *bool                     `json:"enabled"`
		TrafficLimit      int64                     `json:"traffic_limit"`
		TrafficUsed       *int64                    `json:"traffic_used"`
		TrafficMultiplier float64                   `json:"traffic_multiplier"`
		ResetDay          int                       `json:"reset_day"`
		ExpireAt          *time.Time                `json:"expire_at"`
		BillingCycle      string                    `json:"billing_cycle"`
		Remark            string                    `json:"remark"`
		ServerTemplateID  *int64                    `json:"server_template_id"`
		ServerLogLevel    string                    `json:"server_log_level"`
		ServerIPv6        *bool                     `json:"server_ipv6"`
		OutboundConfig    *model.NodeOutboundConfig `json:"outbound_config"`
		ExtraServerYAML   string                    `json:"extra_server_yaml"`
	}
	if err := decodeJSON(r, &req); err != nil {
		writeError(w, http.StatusBadRequest, "invalid request body")
		return
	}
	req.ServerLogLevel = strings.TrimSpace(req.ServerLogLevel)
	if !model.IsValidServerLogLevel(req.ServerLogLevel) {
		writeError(w, http.StatusBadRequest, "无效的日志级别")
		return
	}
	if req.ServerTemplateID != nil {
		t, err := s.store.GetTemplate(*req.ServerTemplateID)
		if err != nil || t.Kind != model.TemplateKindServer {
			writeError(w, http.StatusBadRequest, "指定的节点服务端模板不存在")
			return
		}
	}
	if req.OutboundConfig != nil {
		req.OutboundConfig.Normalize()
		if err := req.OutboundConfig.Validate(); err != nil {
			writeError(w, http.StatusBadRequest, "节点出站配置无效: "+err.Error())
			return
		}
	}
	if err := mihomogen.ValidateServerTemplateDirectives(req.ExtraServerYAML); err != nil {
		writeError(w, http.StatusBadRequest, "节点附加 YAML 无效: "+err.Error())
		return
	}
	var prevTargets []int64
	if _, g, err := s.ws.BuildServerGenOptions(); err == nil && g != nil {
		prevTargets = append(prevTargets, g.TargetsByNode[existing.ID]...)
		prevTargets = append(prevTargets, g.ReferrersByNode[existing.ID]...)
	}
	if strings.TrimSpace(req.Name) != "" {
		existing.Name = strings.TrimSpace(req.Name)
	}
	if strings.TrimSpace(req.Host) != "" {
		existing.Host = strings.TrimSpace(req.Host)
	}
	existing.Region = strings.TrimSpace(req.Region)
	if req.Tags != nil {
		existing.Tags = model.NormalizeTags(req.Tags)
	}
	if req.Enabled != nil {
		existing.Enabled = *req.Enabled
	}
	existing.TrafficLimit = req.TrafficLimit
	existing.TrafficMultiplier = req.TrafficMultiplier
	existing.ResetDay = req.ResetDay
	existing.ExpireAt = req.ExpireAt
	existing.BillingCycle = strings.TrimSpace(req.BillingCycle)
	existing.Remark = strings.TrimSpace(req.Remark)
	existing.ServerTemplateID = req.ServerTemplateID
	existing.ServerLogLevel = req.ServerLogLevel
	existing.ServerIPv6 = req.ServerIPv6
	if req.OutboundConfig != nil {
		existing.OutboundConfig = *req.OutboundConfig
	}
	existing.ExtraServerYAML = req.ExtraServerYAML

	if err := s.store.UpdateNode(existing); err != nil {
		writeError(w, http.StatusInternalServerError, err.Error())
		return
	}
	if req.TrafficUsed != nil {
		val := max(*req.TrafficUsed, 0)
		if err := s.store.SetNodeTraffic(existing.ID, val); err != nil {
			writeError(w, http.StatusInternalServerError, err.Error())
			return
		}
		existing.TrafficUsed = val
		existing.UploadUsed = 0
		existing.DownloadUsed = val
	}
	s.ws.PushConfigToNodes(append([]int64{existing.ID}, prevTargets...))
	s.ws.EnrichNode(existing)
	writeJSON(w, http.StatusOK, existing)
}

func (s *Server) handleDeleteNode(w http.ResponseWriter, r *http.Request) {
	id, err := parseIDParam(r, "id")
	if err != nil {
		writeError(w, http.StatusBadRequest, "invalid node id")
		return
	}
	var affected []int64
	if _, g, err := s.ws.BuildServerGenOptions(); err == nil && g != nil {
		affected = append(affected, g.TargetsByNode[id]...)
		affected = append(affected, g.ReferrersByNode[id]...)
	}
	if err := s.store.DeleteNode(id); err != nil {
		writeError(w, http.StatusInternalServerError, err.Error())
		return
	}
	s.ws.DisconnectNode(id)
	if len(affected) > 0 {
		s.ws.PushConfigToNodes(affected)
	}
	writeJSON(w, http.StatusOK, map[string]string{"status": "deleted"})
}

func (s *Server) handleResetNodeTraffic(w http.ResponseWriter, r *http.Request) {
	id, err := parseIDParam(r, "id")
	if err != nil {
		writeError(w, http.StatusBadRequest, "invalid node id")
		return
	}
	if err := s.store.ResetNodeTraffic(id); err != nil {
		writeError(w, http.StatusInternalServerError, err.Error())
		return
	}
	s.ws.PushConfigToNodes([]int64{id})
	writeJSON(w, http.StatusOK, map[string]string{"status": "ok"})
}

func (s *Server) handleRegenerateNodeToken(w http.ResponseWriter, r *http.Request) {
	id, err := parseIDParam(r, "id")
	if err != nil {
		writeError(w, http.StatusBadRequest, "invalid node id")
		return
	}
	tok, err := s.store.RegenerateNodeToken(id)
	if err != nil {
		writeError(w, http.StatusInternalServerError, err.Error())
		return
	}
	s.ws.DisconnectNode(id)
	writeJSON(w, http.StatusOK, map[string]string{"token": tok})
}

func (s *Server) handlePushNodeConfig(w http.ResponseWriter, r *http.Request) {
	id, err := parseIDParam(r, "id")
	if err != nil {
		writeError(w, http.StatusBadRequest, "invalid node id")
		return
	}
	if err := s.ws.PushConfigToNode(id); err != nil {
		writeError(w, http.StatusBadRequest, err.Error())
		return
	}
	writeJSON(w, http.StatusOK, map[string]string{"status": "pushed"})
}

func (s *Server) handleRestartNode(w http.ResponseWriter, r *http.Request) {
	id, err := parseIDParam(r, "id")
	if err != nil {
		writeError(w, http.StatusBadRequest, "invalid node id")
		return
	}
	if err := s.ws.RestartNodeMihomo(id); err != nil {
		writeError(w, http.StatusBadRequest, err.Error())
		return
	}
	writeJSON(w, http.StatusOK, map[string]string{"status": "restarting"})
}

func (s *Server) handleNodeInstallCommands(w http.ResponseWriter, r *http.Request) {
	id, err := parseIDParam(r, "id")
	if err != nil {
		writeError(w, http.StatusBadRequest, "invalid node id")
		return
	}
	node, err := s.store.GetNode(id)
	if err != nil {
		writeError(w, http.StatusNotFound, "node not found")
		return
	}
	st, _ := s.store.GetSystemSettings()
	pubURL := s.resolvePublicURL(r)
	agentImg := "ghcr.io/tom2almighty/mihob-agent:latest"
	if st != nil && st.AgentImage != "" {
		agentImg = st.AgentImage
	}

	dockerCompose := fmt.Sprintf(`services:
  mihob-agent:
    image: %s
    container_name: mihob-agent
    restart: unless-stopped
    network_mode: host
    environment:
      MIHOB_HUB_URL: "%s"
      MIHOB_NODE_TOKEN: "%s"
      MIHOB_DATA_DIR: "/data"
    volumes:
      - ./mihob-agent-data:/data
`, agentImg, pubURL, node.Token)

	dockerRun := fmt.Sprintf(
		`docker run -d --name mihob-agent --restart unless-stopped --network host -e MIHOB_HUB_URL="%s" -e MIHOB_NODE_TOKEN="%s" -v /opt/mihob-agent:/data %s`,
		pubURL, node.Token, agentImg,
	)

	binaryInstall := fmt.Sprintf(
		`curl -fsSL "%s/install/agent.sh" | sudo bash -s -- --hub "%s" --token "%s"`,
		pubURL, pubURL, node.Token,
	)

	binaryUpdate := fmt.Sprintf(
		`curl -fsSL "%s/install/agent.sh" | sudo bash -s -- --update`,
		pubURL,
	)

	binaryUninstall := fmt.Sprintf(
		`curl -fsSL "%s/install/agent.sh" | sudo bash -s -- --uninstall`,
		pubURL,
	)

	writeJSON(w, http.StatusOK, map[string]string{
		"hub_url":          pubURL,
		"token":            node.Token,
		"docker_compose":   dockerCompose,
		"docker_run":       dockerRun,
		"binary_install":   binaryInstall,
		"binary_update":    binaryUpdate,
		"binary_uninstall": binaryUninstall,
	})
}

func (s *Server) handleInstallAgentScript(w http.ResponseWriter, r *http.Request) {
	w.Header().Set("Content-Type", "text/x-shellscript; charset=utf-8")
	_, _ = w.Write([]byte(agentInstallScript))
}

// --- Inbounds ---

func (s *Server) handleListAllInbounds(w http.ResponseWriter, r *http.Request) {
	list, err := s.store.ListAllInbounds()
	if err != nil {
		writeError(w, http.StatusInternalServerError, err.Error())
		return
	}
	writeJSON(w, http.StatusOK, list)
}

func (s *Server) handleListInbounds(w http.ResponseWriter, r *http.Request) {
	nodeID, err := parseIDParam(r, "id")
	if err != nil {
		writeError(w, http.StatusBadRequest, "invalid node id")
		return
	}
	list, err := s.store.ListInboundsByNode(nodeID)
	if err != nil {
		writeError(w, http.StatusInternalServerError, err.Error())
		return
	}
	writeJSON(w, http.StatusOK, list)
}

func (s *Server) handleReorderInbounds(w http.ResponseWriter, r *http.Request) {
	nodeID, err := parseIDParam(r, "id")
	if err != nil {
		writeError(w, http.StatusBadRequest, "invalid node id")
		return
	}
	var req struct {
		IDs []int64 `json:"ids"`
	}
	if err := decodeJSON(r, &req); err != nil {
		writeError(w, http.StatusBadRequest, "invalid request body")
		return
	}
	if err := s.store.ReorderInbounds(nodeID, req.IDs); err != nil {
		writeError(w, http.StatusInternalServerError, err.Error())
		return
	}
	writeJSON(w, http.StatusOK, map[string]string{"status": "ok"})
}

func (s *Server) handleCreateInbound(w http.ResponseWriter, r *http.Request) {
	nodeID, err := parseIDParam(r, "id")
	if err != nil {
		writeError(w, http.StatusBadRequest, "invalid node id")
		return
	}
	if _, err := s.store.GetNode(nodeID); err != nil {
		writeError(w, http.StatusNotFound, "node not found")
		return
	}
	var req struct {
		Name     string                `json:"name"`
		Tag      string                `json:"tag"`
		Tags     []string              `json:"tags"`
		Protocol string                `json:"protocol"`
		Listen   string                `json:"listen"`
		Port     int                   `json:"port"`
		CertID   *int64                `json:"cert_id"`
		Enabled  *bool                 `json:"enabled"`
		Settings model.InboundSettings `json:"settings"`
	}
	if err := decodeJSON(r, &req); err != nil {
		writeError(w, http.StatusBadRequest, "invalid request body")
		return
	}
	if !model.IsValidProtocol(req.Protocol) {
		writeError(w, http.StatusBadRequest, "不支持的协议类型")
		return
	}
	if req.Port < 1 || req.Port > 65535 {
		writeError(w, http.StatusBadRequest, "端口必须在 1-65535 之间")
		return
	}
	if err := mihomogen.ValidateExtraYAML(req.Settings.ExtraServerYAML); err != nil {
		writeError(w, http.StatusBadRequest, "服务端高级 YAML 无效: "+err.Error())
		return
	}
	if err := mihomogen.ValidateExtraYAML(req.Settings.ExtraClientYAML); err != nil {
		writeError(w, http.StatusBadRequest, "客户端高级 YAML 无效: "+err.Error())
		return
	}
	if strings.TrimSpace(req.Name) == "" {
		req.Name = fmt.Sprintf("%s-%d", req.Protocol, req.Port)
	}
	enabled := true
	if req.Enabled != nil {
		enabled = *req.Enabled
	}

	// Auto-fill keys if missing for convenience
	if req.Settings.Security == "reality" && req.Settings.RealityPrivateKey == "" {
		priv, pub, err := crypto.GenerateRealityKeyPair()
		if err == nil {
			req.Settings.RealityPrivateKey = priv
			req.Settings.RealityPublicKey = pub
		}
		if len(req.Settings.RealityShortIDs) == 0 {
			req.Settings.RealityShortIDs = []string{crypto.GenerateShortID()}
		}
	}
	if req.Protocol == model.ProtoShadowsocks && req.Settings.SSServerPassword == "" {
		if strings.Contains(req.Settings.SSCipher, "256") {
			req.Settings.SSServerPassword = crypto.RandomBase64(32)
		} else {
			req.Settings.SSServerPassword = crypto.RandomBase64(16)
		}
	}
	if req.Protocol == model.ProtoSnell && strings.TrimSpace(req.Settings.SnellPSK) == "" {
		req.Settings.SnellPSK = crypto.RandomToken(24)
	}
	if req.Protocol == model.ProtoSudoku && strings.TrimSpace(req.Settings.SudokuKey) == "" {
		req.Settings.SudokuKey = crypto.RandomToken(24)
	}

	in := &model.Inbound{
		NodeID:   nodeID,
		Name:     strings.TrimSpace(req.Name),
		Tag:      strings.TrimSpace(req.Tag),
		Tags:     model.NormalizeTags(req.Tags),
		Protocol: req.Protocol,
		Listen:   strings.TrimSpace(req.Listen),
		Port:     req.Port,
		CertID:   req.CertID,
		Enabled:  enabled,
		Settings: req.Settings,
	}
	if err := s.store.CreateInbound(in); err != nil {
		writeError(w, http.StatusInternalServerError, err.Error())
		return
	}
	s.ws.PushConfigToNodes([]int64{nodeID})
	writeJSON(w, http.StatusCreated, in)
}

func (s *Server) handleUpdateInbound(w http.ResponseWriter, r *http.Request) {
	id, err := parseIDParam(r, "id")
	if err != nil {
		writeError(w, http.StatusBadRequest, "invalid inbound id")
		return
	}
	existing, err := s.store.GetInbound(id)
	if err != nil {
		writeError(w, http.StatusNotFound, "inbound not found")
		return
	}
	var req struct {
		Name     string                `json:"name"`
		Tag      string                `json:"tag"`
		Tags     []string              `json:"tags"`
		Protocol string                `json:"protocol"`
		Listen   string                `json:"listen"`
		Port     int                   `json:"port"`
		CertID   *int64                `json:"cert_id"`
		Enabled  *bool                 `json:"enabled"`
		Settings model.InboundSettings `json:"settings"`
	}
	if err := decodeJSON(r, &req); err != nil {
		writeError(w, http.StatusBadRequest, "invalid request body")
		return
	}
	if req.Protocol != "" && !model.IsValidProtocol(req.Protocol) {
		writeError(w, http.StatusBadRequest, "不支持的协议类型")
		return
	}
	if req.Port < 1 || req.Port > 65535 {
		writeError(w, http.StatusBadRequest, "端口必须在 1-65535 之间")
		return
	}
	if err := mihomogen.ValidateExtraYAML(req.Settings.ExtraServerYAML); err != nil {
		writeError(w, http.StatusBadRequest, "服务端高级 YAML 无效: "+err.Error())
		return
	}
	if err := mihomogen.ValidateExtraYAML(req.Settings.ExtraClientYAML); err != nil {
		writeError(w, http.StatusBadRequest, "客户端高级 YAML 无效: "+err.Error())
		return
	}
	if strings.TrimSpace(req.Name) != "" {
		existing.Name = strings.TrimSpace(req.Name)
	}
	existing.Tag = strings.TrimSpace(req.Tag)
	if req.Tags != nil {
		existing.Tags = model.NormalizeTags(req.Tags)
	}
	if req.Protocol != "" {
		existing.Protocol = req.Protocol
	}
	if req.Settings.Security == "reality" && req.Settings.RealityPrivateKey == "" {
		priv, pub, err := crypto.GenerateRealityKeyPair()
		if err == nil {
			req.Settings.RealityPrivateKey = priv
			req.Settings.RealityPublicKey = pub
		}
		if len(req.Settings.RealityShortIDs) == 0 {
			req.Settings.RealityShortIDs = []string{crypto.GenerateShortID()}
		}
	}
	if existing.Protocol == model.ProtoShadowsocks && req.Settings.SSServerPassword == "" {
		if strings.Contains(req.Settings.SSCipher, "256") {
			req.Settings.SSServerPassword = crypto.RandomBase64(32)
		} else {
			req.Settings.SSServerPassword = crypto.RandomBase64(16)
		}
	}
	if existing.Protocol == model.ProtoSnell && strings.TrimSpace(req.Settings.SnellPSK) == "" {
		req.Settings.SnellPSK = crypto.RandomToken(24)
	}
	if existing.Protocol == model.ProtoSudoku && strings.TrimSpace(req.Settings.SudokuKey) == "" {
		req.Settings.SudokuKey = crypto.RandomToken(24)
	}
	existing.Listen = strings.TrimSpace(req.Listen)
	existing.Port = req.Port
	existing.CertID = req.CertID
	if req.Enabled != nil {
		existing.Enabled = *req.Enabled
	}
	existing.Settings = req.Settings

	if err := s.store.UpdateInbound(existing); err != nil {
		writeError(w, http.StatusInternalServerError, err.Error())
		return
	}
	s.ws.PushConfigToNodes([]int64{existing.NodeID})
	writeJSON(w, http.StatusOK, existing)
}

func (s *Server) handlePreviewInbound(w http.ResponseWriter, r *http.Request) {
	nodeID, err := parseIDParam(r, "id")
	if err != nil {
		writeError(w, http.StatusBadRequest, "invalid node id")
		return
	}
	node, err := s.store.GetNode(nodeID)
	if err != nil {
		writeError(w, http.StatusNotFound, "node not found")
		return
	}
	var req struct {
		Name     string                `json:"name"`
		Tag      string                `json:"tag"`
		Protocol string                `json:"protocol"`
		Listen   string                `json:"listen"`
		Port     int                   `json:"port"`
		CertID   *int64                `json:"cert_id"`
		Enabled  *bool                 `json:"enabled"`
		Settings model.InboundSettings `json:"settings"`
	}
	if err := decodeJSON(r, &req); err != nil {
		writeError(w, http.StatusBadRequest, "invalid request body")
		return
	}
	if !model.IsValidProtocol(req.Protocol) {
		writeError(w, http.StatusBadRequest, "不支持的协议类型")
		return
	}
	if strings.TrimSpace(req.Name) == "" {
		req.Name = fmt.Sprintf("%s-%d", req.Protocol, req.Port)
	}
	if req.Settings.Security == "reality" && req.Settings.RealityPrivateKey == "" {
		req.Settings.RealityPrivateKey = "<auto-generated-private-key>"
		if req.Settings.RealityPublicKey == "" {
			req.Settings.RealityPublicKey = "<auto-generated-public-key>"
		}
	}
	if req.Protocol == model.ProtoShadowsocks && req.Settings.SSServerPassword == "" {
		req.Settings.SSServerPassword = "<auto-generated-psk>"
	}
	if req.Protocol == model.ProtoSnell && strings.TrimSpace(req.Settings.SnellPSK) == "" {
		req.Settings.SnellPSK = "<auto-generated-psk>"
	}
	if req.Protocol == model.ProtoSudoku && strings.TrimSpace(req.Settings.SudokuKey) == "" {
		req.Settings.SudokuKey = "<auto-generated-key>"
	}

	certsList, err := s.store.ListCertificates()
	if err != nil {
		writeError(w, http.StatusInternalServerError, err.Error())
		return
	}
	certsMap := make(map[int64]*model.Certificate, len(certsList))
	for i := range certsList {
		certsMap[certsList[i].ID] = &certsList[i]
	}

	in := &model.Inbound{
		NodeID:   nodeID,
		Name:     strings.TrimSpace(req.Name),
		Tag:      strings.TrimSpace(req.Tag),
		Protocol: req.Protocol,
		Listen:   strings.TrimSpace(req.Listen),
		Port:     req.Port,
		CertID:   req.CertID,
		Enabled:  true,
		Settings: req.Settings,
	}
	serverYAML, clientYAML, err := mihomogen.PreviewInboundYAML(node, in, certsMap)
	if err != nil {
		writeError(w, http.StatusBadRequest, err.Error())
		return
	}
	writeJSON(w, http.StatusOK, map[string]string{
		"server_yaml": serverYAML,
		"client_yaml": clientYAML,
	})
}

func (s *Server) handleDeleteInbound(w http.ResponseWriter, r *http.Request) {
	id, err := parseIDParam(r, "id")
	if err != nil {
		writeError(w, http.StatusBadRequest, "invalid inbound id")
		return
	}
	existing, err := s.store.GetInbound(id)
	if err != nil {
		writeError(w, http.StatusNotFound, "inbound not found")
		return
	}
	if err := s.store.DeleteInbound(id); err != nil {
		writeError(w, http.StatusInternalServerError, err.Error())
		return
	}
	s.ws.PushConfigToNodes([]int64{existing.NodeID})
	writeJSON(w, http.StatusOK, map[string]string{"status": "deleted"})
}

func (s *Server) handleKeygen(w http.ResponseWriter, r *http.Request) {
	var req struct {
		Type string `json:"type"` // "reality" | "ss2022_128" | "ss2022_256" | "short_id" | "password"
	}
	_ = decodeJSON(r, &req)
	switch req.Type {
	case "reality":
		priv, pub, err := crypto.GenerateRealityKeyPair()
		if err != nil {
			writeError(w, http.StatusInternalServerError, err.Error())
			return
		}
		writeJSON(w, http.StatusOK, map[string]string{
			"private_key": priv,
			"public_key":  pub,
			"short_id":    crypto.GenerateShortID(),
		})
	case "ss2022_128":
		writeJSON(w, http.StatusOK, map[string]string{"password": crypto.RandomBase64(16)})
	case "ss2022_256":
		writeJSON(w, http.StatusOK, map[string]string{"password": crypto.RandomBase64(32)})
	case "short_id":
		writeJSON(w, http.StatusOK, map[string]string{"short_id": crypto.GenerateShortID()})
	case "snell_psk", "sudoku_key":
		writeJSON(w, http.StatusOK, map[string]string{"password": crypto.RandomToken(24)})
	default:
		writeJSON(w, http.StatusOK, map[string]string{"password": crypto.RandomToken(16)})
	}
}

const agentInstallScript = `#!/usr/bin/env bash
set -euo pipefail

HUB_URL=""
NODE_TOKEN=""
INSTALL_DIR="/opt/mihob-agent"
MIHOB_REPO="${MIHOB_REPO:-tom2almighty/mihob}"
MIHOB_VERSION="${MIHOB_VERSION:-latest}"
MIHOB_BIN_URL="${MIHOB_BIN_URL:-}"
MIHOMO_VERSION="${MIHOMO_VERSION:-latest}"
UNINSTALL=0
UPDATE=0

while [[ $# -gt 0 ]]; do
  case "$1" in
    --hub) HUB_URL="$2"; shift 2 ;;
    --token) NODE_TOKEN="$2"; shift 2 ;;
    --dir) INSTALL_DIR="$2"; shift 2 ;;
    --version) MIHOB_VERSION="$2"; shift 2 ;;
    --update|update) UPDATE=1; shift ;;
    --uninstall|uninstall) UNINSTALL=1; shift ;;
    *) shift ;;
  esac
done

if [[ "$UNINSTALL" -eq 1 ]]; then
  echo "[mihob] Uninstalling mihob-agent..."
  systemctl disable --now mihob-agent 2>/dev/null || true
  rm -f /etc/systemd/system/mihob-agent.service
  systemctl daemon-reload 2>/dev/null || true
  rm -rf "$INSTALL_DIR"
  rm -f /usr/local/bin/mihob-agent /usr/local/bin/mihob /usr/local/bin/mihomo
  echo "[mihob] mihob-agent uninstalled and cleaned up."
  exit 0
fi

ARCH="$(uname -m)"
case "$ARCH" in
  x86_64|amd64) GO_ARCH="amd64" ;;
  aarch64|arm64) GO_ARCH="arm64" ;;
  *) echo "Unsupported architecture: $ARCH"; exit 1 ;;
esac

download_agent_bin() {
  local target_bin="/usr/local/bin/mihob-agent"
  local tmp_dir
  tmp_dir="$(mktemp -d)"
  trap 'rm -rf "$tmp_dir"' RETURN

  if [[ -n "$MIHOB_BIN_URL" ]]; then
    echo "[mihob] Downloading agent binary from MIHOB_BIN_URL..."
    curl -fsSL "$MIHOB_BIN_URL" -o "${tmp_dir}/mihob-agent"
    install -m 0755 "${tmp_dir}/mihob-agent" "${target_bin}.new"
    mv -f "${target_bin}.new" "$target_bin"
    return 0
  fi

  local asset_url=""
  local legacy_url=""
  local bin_inside="mihob-agent"
  local agent_re="https://github\.com/${MIHOB_REPO}/releases/download/[^\"]*mihob-agent_[^\"]*_linux_${GO_ARCH}\.tar\.gz"
  local legacy_re="https://github\.com/${MIHOB_REPO}/releases/download/[^\"]*mihob_[^\"]*_linux_${GO_ARCH}\.tar\.gz"

  echo "[mihob] Resolving mihob-agent (${MIHOB_VERSION}, linux/${GO_ARCH}) from ${MIHOB_REPO}..."

  if [[ "$MIHOB_VERSION" == "latest" ]]; then
    local latest_json=""
    latest_json="$(curl -fsSL -H "Accept: application/vnd.github+json" "https://api.github.com/repos/${MIHOB_REPO}/releases/latest" 2>/dev/null || true)"
    if [[ -n "$latest_json" ]]; then
      asset_url="$(printf '%s' "$latest_json" | grep -Eo "$agent_re" | head -n 1 || true)"
      if [[ -z "$asset_url" ]]; then
        legacy_url="$(printf '%s' "$latest_json" | grep -Eo "$legacy_re" | head -n 1 || true)"
      fi
    fi

    if [[ -z "$asset_url" ]]; then
      local page json page_filtered
      for page in 1 2 3; do
        json="$(curl -fsSL -H "Accept: application/vnd.github+json" "https://api.github.com/repos/${MIHOB_REPO}/releases?per_page=100&page=${page}" 2>/dev/null || true)"
        if [[ -z "$json" || "$json" == "[]" ]]; then
          break
        fi

        page_filtered="$json"
        if command -v jq >/dev/null 2>&1; then
          page_filtered="$(printf '%s' "$json" | jq -c '[.[] | select(.draft == false and .prerelease == false)]' 2>/dev/null || printf '%s' "$json")"
        fi

        asset_url="$(printf '%s' "$page_filtered" | grep -Eo "$agent_re" | head -n 1 || true)"
        if [[ -n "$asset_url" ]]; then
          break
        fi
        if [[ -z "$legacy_url" ]]; then
          legacy_url="$(printf '%s' "$page_filtered" | grep -Eo "$legacy_re" | head -n 1 || true)"
        fi
      done
    fi
  else
    local tag_json=""
    local tag_candidates=("$MIHOB_VERSION")
    if [[ "$MIHOB_VERSION" != agent-* ]]; then
      tag_candidates+=("agent-${MIHOB_VERSION}")
    fi

    local cand
    for cand in "${tag_candidates[@]}"; do
      tag_json="$(curl -fsSL -H "Accept: application/vnd.github+json" "https://api.github.com/repos/${MIHOB_REPO}/releases/tags/${cand}" 2>/dev/null || true)"
      if [[ -n "$tag_json" ]]; then
        asset_url="$(printf '%s' "$tag_json" | grep -Eo "$agent_re" | head -n 1 || true)"
        if [[ -n "$asset_url" ]]; then
          break
        fi
        if [[ -z "$legacy_url" ]]; then
          legacy_url="$(printf '%s' "$tag_json" | grep -Eo "$legacy_re" | head -n 1 || true)"
        fi
      fi
    done
  fi

  if [[ -z "$asset_url" && -n "$legacy_url" ]]; then
    asset_url="$legacy_url"
    bin_inside="mihob"
  fi

  if [[ -z "$asset_url" ]]; then
    echo "[mihob] Failed to find release archive for linux/${GO_ARCH}. Set MIHOB_BIN_URL manually."
    return 1
  fi

  echo "[mihob] Downloading ${asset_url}..."
  curl -fsSL "$asset_url" -o "${tmp_dir}/archive.tar.gz"
  tar -xzf "${tmp_dir}/archive.tar.gz" -C "$tmp_dir"
  install -m 0755 "${tmp_dir}/${bin_inside}" "${target_bin}.new"
  mv -f "${target_bin}.new" "$target_bin"

  # Keep legacy /usr/local/bin/mihob symlinked if old systemd unit references it
  if [[ -f /etc/systemd/system/mihob-agent.service ]] && grep -q "/usr/local/bin/mihob agent" /etc/systemd/system/mihob-agent.service; then
    sed -i 's|ExecStart=/usr/local/bin/mihob agent|ExecStart=/usr/local/bin/mihob-agent|g' /etc/systemd/system/mihob-agent.service
    systemctl daemon-reload
  fi
}

if [[ "$UPDATE" -eq 1 ]]; then
  echo "[mihob] Updating mihob-agent..."
  download_agent_bin
  systemctl restart mihob-agent
  echo "[mihob] Updated successfully: $(/usr/local/bin/mihob-agent --version 2>/dev/null || true)"
  exit 0
fi

if [[ -z "$HUB_URL" || -z "$NODE_TOKEN" ]]; then
  echo "Usage: install-agent.sh --hub <HUB_URL> --token <NODE_TOKEN> | --update | --uninstall"
  exit 1
fi

mkdir -p "$INSTALL_DIR/data"

if ! command -v mihomo >/dev/null 2>&1; then
  if [[ "$MIHOMO_VERSION" == "latest" ]]; then
    MIHOMO_VERSION="$(curl -fsSL -H "Accept: application/vnd.github+json" "https://api.github.com/repos/MetaCubeX/mihomo/releases/latest" 2>/dev/null | grep -Eo '"tag_name"[[:space:]]*:[[:space:]]*"v[^"]+"' | head -n 1 | sed -E 's/.*"([^"]+)"/\1/' || true)"
    MIHOMO_VERSION="${MIHOMO_VERSION:-v1.19.34}"
  fi
  echo "[mihob] Installing mihomo ${MIHOMO_VERSION} (${GO_ARCH})..."
  TMP_GZ="/tmp/mihomo.gz"
  curl -fL "https://github.com/MetaCubeX/mihomo/releases/download/${MIHOMO_VERSION}/mihomo-linux-${GO_ARCH}-${MIHOMO_VERSION}.gz" -o "$TMP_GZ"
  gunzip -f "$TMP_GZ"
  install -m 0755 /tmp/mihomo /usr/local/bin/mihomo
  rm -f /tmp/mihomo
fi

if [[ ! -x /usr/local/bin/mihob-agent ]]; then
  download_agent_bin
fi

(
  umask 077
  cat >"${INSTALL_DIR}/agent.env" <<EOF
MIHOB_HUB_URL=${HUB_URL}
MIHOB_NODE_TOKEN=${NODE_TOKEN}
MIHOB_DATA_DIR=${INSTALL_DIR}/data
EOF
)
chmod 0600 "${INSTALL_DIR}/agent.env"

cat >/etc/systemd/system/mihob-agent.service <<EOF
[Unit]
Description=Mihob Node Agent
After=network-online.target
Wants=network-online.target

[Service]
Type=simple
WorkingDirectory=${INSTALL_DIR}
EnvironmentFile=${INSTALL_DIR}/agent.env
ExecStart=/usr/local/bin/mihob-agent
Restart=always
RestartSec=3
LimitNOFILE=1048576

[Install]
WantedBy=multi-user.target
EOF

systemctl daemon-reload
systemctl enable --now mihob-agent
echo "[mihob] Agent installed and started! Check status with: systemctl status mihob-agent"
`
