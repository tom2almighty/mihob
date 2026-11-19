package hub

import (
	"fmt"
	"net/http"
	"strconv"
	"strings"

	"github.com/go-chi/chi/v5"

	"github.com/mihob/mihob/internal/crypto"
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
		Name              string  `json:"name"`
		Host              string  `json:"host"`
		Region            string  `json:"region"`
		Enabled           *bool   `json:"enabled"`
		TrafficLimit      int64   `json:"traffic_limit"`
		TrafficMultiplier float64 `json:"traffic_multiplier"`
		ResetDay          int     `json:"reset_day"`
		Remark            string  `json:"remark"`
	}
	if err := decodeJSON(r, &req); err != nil {
		writeError(w, http.StatusBadRequest, "invalid request body")
		return
	}
	if strings.TrimSpace(req.Name) == "" || strings.TrimSpace(req.Host) == "" {
		writeError(w, http.StatusBadRequest, "节点名称与主机地址不能为空")
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
		Enabled:           enabled,
		TrafficLimit:      req.TrafficLimit,
		TrafficMultiplier: req.TrafficMultiplier,
		ResetDay:          req.ResetDay,
		Remark:            strings.TrimSpace(req.Remark),
	}
	if err := s.store.CreateNode(node); err != nil {
		writeError(w, http.StatusInternalServerError, err.Error())
		return
	}
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
		Name              string  `json:"name"`
		Host              string  `json:"host"`
		Region            string  `json:"region"`
		Enabled           *bool   `json:"enabled"`
		TrafficLimit      int64   `json:"traffic_limit"`
		TrafficMultiplier float64 `json:"traffic_multiplier"`
		ResetDay          int     `json:"reset_day"`
		Remark            string  `json:"remark"`
	}
	if err := decodeJSON(r, &req); err != nil {
		writeError(w, http.StatusBadRequest, "invalid request body")
		return
	}
	if strings.TrimSpace(req.Name) != "" {
		existing.Name = strings.TrimSpace(req.Name)
	}
	if strings.TrimSpace(req.Host) != "" {
		existing.Host = strings.TrimSpace(req.Host)
	}
	existing.Region = strings.TrimSpace(req.Region)
	if req.Enabled != nil {
		existing.Enabled = *req.Enabled
	}
	existing.TrafficLimit = req.TrafficLimit
	existing.TrafficMultiplier = req.TrafficMultiplier
	existing.ResetDay = req.ResetDay
	existing.Remark = strings.TrimSpace(req.Remark)

	if err := s.store.UpdateNode(existing); err != nil {
		writeError(w, http.StatusInternalServerError, err.Error())
		return
	}
	s.ws.PushConfigToNodes([]int64{existing.ID})
	s.ws.EnrichNode(existing)
	writeJSON(w, http.StatusOK, existing)
}

func (s *Server) handleDeleteNode(w http.ResponseWriter, r *http.Request) {
	id, err := parseIDParam(r, "id")
	if err != nil {
		writeError(w, http.StatusBadRequest, "invalid node id")
		return
	}
	if err := s.store.DeleteNode(id); err != nil {
		writeError(w, http.StatusInternalServerError, err.Error())
		return
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

	writeJSON(w, http.StatusOK, map[string]string{
		"hub_url":        pubURL,
		"token":          node.Token,
		"docker_compose": dockerCompose,
		"docker_run":     dockerRun,
		"binary_install": binaryInstall,
	})
}

func (s *Server) handleInstallAgentScript(w http.ResponseWriter, r *http.Request) {
	w.Header().Set("Content-Type", "text/x-shellscript; charset=utf-8")
	_, _ = w.Write([]byte(agentInstallScript))
}

// --- Inbounds ---

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
	if strings.TrimSpace(req.Name) != "" {
		existing.Name = strings.TrimSpace(req.Name)
	}
	existing.Tag = strings.TrimSpace(req.Tag)
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
MIHOB_BIN_URL="${MIHOB_BIN_URL:-}"
MIHOMO_VERSION="${MIHOMO_VERSION:-v1.19.34}"

while [[ $# -gt 0 ]]; do
  case "$1" in
    --hub) HUB_URL="$2"; shift 2 ;;
    --token) NODE_TOKEN="$2"; shift 2 ;;
    --dir) INSTALL_DIR="$2"; shift 2 ;;
    *) shift ;;
  esac
done

if [[ -z "$HUB_URL" || -z "$NODE_TOKEN" ]]; then
  echo "Usage: install-agent.sh --hub <HUB_URL> --token <NODE_TOKEN>"
  exit 1
fi

ARCH="$(uname -m)"
case "$ARCH" in
  x86_64|amd64) GO_ARCH="amd64" ;;
  aarch64|arm64) GO_ARCH="arm64" ;;
  *) echo "Unsupported architecture: $ARCH"; exit 1 ;;
esac

mkdir -p "$INSTALL_DIR/data"

if ! command -v mihomo >/dev/null 2>&1; then
  echo "[mihob] Installing mihomo ${MIHOMO_VERSION} (${GO_ARCH})..."
  TMP_GZ="/tmp/mihomo.gz"
  curl -fL "https://github.com/MetaCubeX/mihomo/releases/download/${MIHOMO_VERSION}/mihomo-linux-${GO_ARCH}-${MIHOMO_VERSION}.gz" -o "$TMP_GZ"
  gunzip -f "$TMP_GZ"
  install -m 0755 /tmp/mihomo /usr/local/bin/mihomo
  rm -f /tmp/mihomo
fi

if [[ -n "$MIHOB_BIN_URL" ]]; then
  echo "[mihob] Downloading mihob binary..."
  curl -fL "$MIHOB_BIN_URL" -o /usr/local/bin/mihob
  chmod +x /usr/local/bin/mihob
elif ! command -v mihob >/dev/null 2>&1; then
  echo "[mihob] Please place the 'mihob' binary at /usr/local/bin/mihob or set MIHOB_BIN_URL."
  exit 1
fi

cat >/etc/systemd/system/mihob-agent.service <<EOF
[Unit]
Description=Mihob Node Agent
After=network-online.target
Wants=network-online.target

[Service]
Type=simple
WorkingDirectory=${INSTALL_DIR}
Environment=MIHOB_HUB_URL=${HUB_URL}
Environment=MIHOB_NODE_TOKEN=${NODE_TOKEN}
Environment=MIHOB_DATA_DIR=${INSTALL_DIR}/data
ExecStart=/usr/local/bin/mihob agent
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
