package hub

import (
	"errors"
	"fmt"
	"io"
	"net/http"
	"os"
	"path/filepath"
	"regexp"
	"strings"
	"time"

	"github.com/mihob/mihob/internal/mihomogen"
	"github.com/mihob/mihob/internal/model"
)

func (s *Server) handleListUsers(w http.ResponseWriter, r *http.Request) {
	users, err := s.store.ListUsers()
	if err != nil {
		writeError(w, http.StatusInternalServerError, err.Error())
		return
	}
	writeJSON(w, http.StatusOK, users)
}

func (s *Server) handleReorderUsers(w http.ResponseWriter, r *http.Request) {
	var req struct {
		IDs []int64 `json:"ids"`
	}
	if err := decodeJSON(r, &req); err != nil {
		writeError(w, http.StatusBadRequest, "invalid request body")
		return
	}
	if err := s.store.ReorderUsers(req.IDs); err != nil {
		writeError(w, http.StatusInternalServerError, err.Error())
		return
	}
	writeJSON(w, http.StatusOK, map[string]string{"status": "ok"})
}

func (s *Server) handleCreateUser(w http.ResponseWriter, r *http.Request) {
	var req struct {
		Username     string              `json:"username"`
		Email        string              `json:"email"`
		Enabled      *bool               `json:"enabled"`
		AccessPolicy *model.AccessPolicy `json:"access_policy"`
		TrafficLimit int64               `json:"traffic_limit"`
		ExpireAt     *time.Time          `json:"expire_at"`
		TemplateID   *int64              `json:"template_id"`
		Remark       string              `json:"remark"`
	}
	if err := decodeJSON(r, &req); err != nil {
		writeError(w, http.StatusBadRequest, "invalid request body")
		return
	}
	req.Username = strings.TrimSpace(req.Username)
	if req.Username == "" {
		writeError(w, http.StatusBadRequest, "username is required")
		return
	}
	enabled := true
	if req.Enabled != nil {
		enabled = *req.Enabled
	}
	policy := model.DefaultAccessPolicy()
	if req.AccessPolicy != nil {
		policy = *req.AccessPolicy
	}
	policy.Normalize()
	if err := policy.Validate(); err != nil {
		writeError(w, http.StatusBadRequest, err.Error())
		return
	}
	if req.TemplateID != nil {
		tmpl, err := s.store.GetTemplate(*req.TemplateID)
		if err != nil || tmpl.Kind != model.TemplateKindClient {
			writeError(w, http.StatusBadRequest, "invalid client template")
			return
		}
	}
	u := &model.User{
		Username:     req.Username,
		Email:        strings.TrimSpace(req.Email),
		Enabled:      enabled,
		AccessPolicy: policy,
		TrafficLimit: req.TrafficLimit,
		ExpireAt:     req.ExpireAt,
		TemplateID:   req.TemplateID,
		Remark:       strings.TrimSpace(req.Remark),
	}
	if err := s.store.CreateUser(u); err != nil {
		writeError(w, http.StatusBadRequest, err.Error())
		return
	}
	s.ws.PushConfigToNodes(u.NodeIDs)
	writeJSON(w, http.StatusCreated, u)
}

func (s *Server) handleUpdateUser(w http.ResponseWriter, r *http.Request) {
	id, err := parseIDParam(r, "id")
	if err != nil {
		writeError(w, http.StatusBadRequest, "invalid user id")
		return
	}
	existing, err := s.store.GetUser(id)
	if err != nil {
		writeError(w, http.StatusNotFound, "user not found")
		return
	}
	wasActive := existing.IsActive(time.Now().UTC())
	oldPolicy := existing.AccessPolicy

	var req struct {
		Username     string              `json:"username"`
		Email        string              `json:"email"`
		Enabled      *bool               `json:"enabled"`
		AccessPolicy *model.AccessPolicy `json:"access_policy"`
		TrafficLimit int64               `json:"traffic_limit"`
		ExpireAt     *time.Time          `json:"expire_at"`
		TemplateID   *int64              `json:"template_id"`
		Remark       string              `json:"remark"`
	}
	if err := decodeJSON(r, &req); err != nil {
		writeError(w, http.StatusBadRequest, "invalid request body")
		return
	}
	if strings.TrimSpace(req.Username) != "" {
		existing.Username = strings.TrimSpace(req.Username)
	}
	existing.Email = strings.TrimSpace(req.Email)
	if req.Enabled != nil {
		existing.Enabled = *req.Enabled
	}
	if req.AccessPolicy != nil {
		policy := *req.AccessPolicy
		policy.Normalize()
		if err := policy.Validate(); err != nil {
			writeError(w, http.StatusBadRequest, err.Error())
			return
		}
		existing.AccessPolicy = policy
	}
	existing.TrafficLimit = req.TrafficLimit
	existing.ExpireAt = req.ExpireAt
	if req.TemplateID != nil {
		tmpl, err := s.store.GetTemplate(*req.TemplateID)
		if err != nil || tmpl.Kind != model.TemplateKindClient {
			writeError(w, http.StatusBadRequest, "invalid client template")
			return
		}
	}
	existing.TemplateID = req.TemplateID
	existing.Remark = strings.TrimSpace(req.Remark)

	affected, err := s.store.UpdateUser(existing)
	if err != nil {
		writeError(w, http.StatusBadRequest, err.Error())
		return
	}
	s.ws.PushConfigToNodes(affected)

	// Kick user on any node where access was revoked or narrowed, or on all affected nodes if deactivated
	nowActive := existing.IsActive(time.Now().UTC())
	for _, nid := range affected {
		if wasActive && !nowActive {
			_ = s.ws.KickUsersOnNode(nid, []string{existing.Username, existing.UUID})
			continue
		}
		n, err := s.store.GetNode(nid)
		if err != nil {
			continue
		}
		if oldPolicy.MatchNode(n) && !existing.AccessPolicy.MatchNode(n) {
			_ = s.ws.KickUsersOnNode(nid, []string{existing.Username, existing.UUID})
			continue
		}
		// Also kick if any previously allowed inbound on this node was revoked
		if ins, err := s.store.ListInboundsByNode(nid); err == nil {
			for i := range ins {
				if oldPolicy.Allows(n, &ins[i]) && !existing.AccessPolicy.Allows(n, &ins[i]) {
					_ = s.ws.KickUsersOnNode(nid, []string{existing.Username, existing.UUID})
					break
				}
			}
		}
	}

	writeJSON(w, http.StatusOK, existing)
}

func (s *Server) handleDeleteUser(w http.ResponseWriter, r *http.Request) {
	id, err := parseIDParam(r, "id")
	if err != nil {
		writeError(w, http.StatusBadRequest, "invalid user id")
		return
	}
	existing, err := s.store.GetUser(id)
	if err != nil {
		writeError(w, http.StatusNotFound, "user not found")
		return
	}
	affected, err := s.store.DeleteUser(id)
	if err != nil {
		writeError(w, http.StatusInternalServerError, err.Error())
		return
	}
	s.ws.PushConfigToNodes(affected)
	for _, nid := range affected {
		_ = s.ws.KickUsersOnNode(nid, []string{existing.Username, existing.UUID})
	}
	writeJSON(w, http.StatusOK, map[string]string{"status": "deleted"})
}

func (s *Server) handleResetUserTraffic(w http.ResponseWriter, r *http.Request) {
	id, err := parseIDParam(r, "id")
	if err != nil {
		writeError(w, http.StatusBadRequest, "invalid user id")
		return
	}
	u, err := s.store.GetUser(id)
	if err != nil {
		writeError(w, http.StatusNotFound, "user not found")
		return
	}
	if err := s.store.ResetUserTraffic(id); err != nil {
		writeError(w, http.StatusInternalServerError, err.Error())
		return
	}
	s.ws.PushConfigToNodes(u.NodeIDs)
	writeJSON(w, http.StatusOK, map[string]string{"status": "ok"})
}

func (s *Server) handleRotateUserToken(w http.ResponseWriter, r *http.Request) {
	id, err := parseIDParam(r, "id")
	if err != nil {
		writeError(w, http.StatusBadRequest, "invalid user id")
		return
	}
	tok, err := s.store.RotateUserToken(id)
	if err != nil {
		writeError(w, http.StatusInternalServerError, err.Error())
		return
	}
	writeJSON(w, http.StatusOK, map[string]string{"sub_token": tok})
}

// --- Templates ---

func (s *Server) handleListTemplates(w http.ResponseWriter, r *http.Request) {
	kind := strings.TrimSpace(r.URL.Query().Get("kind"))
	var (
		list []model.Template
		err  error
	)
	if kind != "" {
		if kind != model.TemplateKindClient && kind != model.TemplateKindServer {
			writeError(w, http.StatusBadRequest, "invalid template kind")
			return
		}
		list, err = s.store.ListTemplatesByKind(kind)
	} else {
		list, err = s.store.ListTemplates()
	}
	if err != nil {
		writeError(w, http.StatusInternalServerError, err.Error())
		return
	}
	writeJSON(w, http.StatusOK, list)
}

func (s *Server) handleCreateTemplate(w http.ResponseWriter, r *http.Request) {
	var req struct {
		Kind        string `json:"kind"`
		Name        string `json:"name"`
		Description string `json:"description"`
		Content     string `json:"content"`
		IsDefault   bool   `json:"is_default"`
	}
	if err := decodeJSON(r, &req); err != nil {
		writeError(w, http.StatusBadRequest, "invalid request body")
		return
	}
	if strings.TrimSpace(req.Name) == "" || strings.TrimSpace(req.Content) == "" {
		writeError(w, http.StatusBadRequest, "template name and content are required")
		return
	}
	kind := strings.TrimSpace(req.Kind)
	if kind == "" {
		kind = model.TemplateKindClient
	}
	if kind != model.TemplateKindClient && kind != model.TemplateKindServer {
		writeError(w, http.StatusBadRequest, "invalid template kind")
		return
	}
	if kind == model.TemplateKindServer {
		if err := mihomogen.ValidateServerTemplateDirectives(req.Content); err != nil {
			writeError(w, http.StatusBadRequest, "服务端模板 YAML 无效: "+err.Error())
			return
		}
	}
	var prevTargets []int64
	if kind == model.TemplateKindServer && req.IsDefault {
		if _, g, err := s.ws.BuildServerGenOptions(); err == nil && g != nil {
			if prevAffected, err := s.store.ListNodeIDsByServerTemplate(0, true); err == nil {
				for _, nid := range prevAffected {
					prevTargets = append(prevTargets, g.TargetsByNode[nid]...)
				}
			}
		}
	}
	t := &model.Template{
		Kind:        kind,
		Name:        strings.TrimSpace(req.Name),
		Description: strings.TrimSpace(req.Description),
		Content:     req.Content,
		IsDefault:   req.IsDefault,
	}
	if err := s.store.CreateTemplate(t); err != nil {
		writeError(w, http.StatusInternalServerError, err.Error())
		return
	}
	if t.Kind == model.TemplateKindServer && t.IsDefault {
		if nodeIDs, err := s.store.ListNodeIDsByServerTemplate(t.ID, true); err == nil {
			s.ws.PushConfigToNodes(append(nodeIDs, prevTargets...))
		}
	}
	writeJSON(w, http.StatusCreated, t)
}

func (s *Server) handleUpdateTemplate(w http.ResponseWriter, r *http.Request) {
	id, err := parseIDParam(r, "id")
	if err != nil {
		writeError(w, http.StatusBadRequest, "invalid template id")
		return
	}
	existing, err := s.store.GetTemplate(id)
	if err != nil {
		writeError(w, http.StatusNotFound, "template not found")
		return
	}
	wasDefault := existing.IsDefault
	var req struct {
		Name        string `json:"name"`
		Description string `json:"description"`
		Content     string `json:"content"`
		IsDefault   bool   `json:"is_default"`
	}
	if err := decodeJSON(r, &req); err != nil {
		writeError(w, http.StatusBadRequest, "invalid request body")
		return
	}
	if strings.TrimSpace(req.Name) != "" {
		existing.Name = strings.TrimSpace(req.Name)
	}
	existing.Description = strings.TrimSpace(req.Description)
	if strings.TrimSpace(req.Content) != "" {
		existing.Content = req.Content
	}
	if existing.Kind == model.TemplateKindServer {
		if err := mihomogen.ValidateServerTemplateDirectives(existing.Content); err != nil {
			writeError(w, http.StatusBadRequest, "服务端模板 YAML 无效: "+err.Error())
			return
		}
	}
	var prevTargets []int64
	if existing.Kind == model.TemplateKindServer {
		if _, g, err := s.ws.BuildServerGenOptions(); err == nil && g != nil {
			if prevAffected, err := s.store.ListNodeIDsByServerTemplate(existing.ID, wasDefault || req.IsDefault); err == nil {
				for _, nid := range prevAffected {
					prevTargets = append(prevTargets, g.TargetsByNode[nid]...)
				}
			}
		}
	}
	existing.IsDefault = req.IsDefault
	if err := s.store.UpdateTemplate(existing); err != nil {
		writeError(w, http.StatusInternalServerError, err.Error())
		return
	}
	if existing.Kind == model.TemplateKindServer {
		if nodeIDs, err := s.store.ListNodeIDsByServerTemplate(existing.ID, wasDefault || existing.IsDefault); err == nil {
			s.ws.PushConfigToNodes(append(nodeIDs, prevTargets...))
		}
	}
	writeJSON(w, http.StatusOK, existing)
}

func (s *Server) handleDeleteTemplate(w http.ResponseWriter, r *http.Request) {
	id, err := parseIDParam(r, "id")
	if err != nil {
		writeError(w, http.StatusBadRequest, "invalid template id")
		return
	}
	existing, err := s.store.GetTemplate(id)
	if err != nil {
		writeError(w, http.StatusNotFound, "template not found")
		return
	}
	if existing.IsDefault {
		writeError(w, http.StatusBadRequest, "cannot delete default template")
		return
	}
	var affectedNodes []int64
	if existing.Kind == model.TemplateKindServer {
		affectedNodes, _ = s.store.ListNodeIDsByServerTemplate(id, false)
		if _, g, err := s.ws.BuildServerGenOptions(); err == nil && g != nil {
			for _, nid := range affectedNodes {
				affectedNodes = append(affectedNodes, g.TargetsByNode[nid]...)
			}
		}
	}
	if err := s.store.DeleteTemplate(id); err != nil {
		writeError(w, http.StatusInternalServerError, err.Error())
		return
	}
	if len(affectedNodes) > 0 {
		s.ws.PushConfigToNodes(affectedNodes)
	}
	writeJSON(w, http.StatusOK, map[string]string{"status": "deleted"})
}

func (s *Server) handlePreviewTemplate(w http.ResponseWriter, r *http.Request) {
	var req struct {
		UserID     int64  `json:"user_id"`
		TemplateID *int64 `json:"template_id"`
		Content    string `json:"content"`
	}
	if err := decodeJSON(r, &req); err != nil {
		writeError(w, http.StatusBadRequest, "invalid request body")
		return
	}
	u, err := s.store.GetUser(req.UserID)
	if err != nil {
		writeError(w, http.StatusNotFound, "user not found")
		return
	}
	content := req.Content
	if strings.TrimSpace(content) == "" {
		if req.TemplateID != nil {
			t, err := s.store.GetTemplate(*req.TemplateID)
			if err != nil {
				writeError(w, http.StatusNotFound, "template not found")
				return
			}
			content = t.Content
		} else {
			t, err := s.resolveUserTemplate(u)
			if err != nil {
				writeError(w, http.StatusInternalServerError, err.Error())
				return
			}
			content = t.Content
		}
	}
	rendered, err := s.renderSubscriptionForUser(u, content)
	if err != nil {
		writeError(w, http.StatusBadRequest, err.Error())
		return
	}
	writeJSON(w, http.StatusOK, map[string]string{"yaml": rendered})
}

func (s *Server) handlePreviewServerConfig(w http.ResponseWriter, r *http.Request) {
	var req struct {
		NodeID           *int64                    `json:"node_id"`
		TemplateID       *int64                    `json:"template_id"`
		Content          string                    `json:"content"`
		UseDraftTemplate bool                      `json:"use_draft_template"`
		ServerLogLevel   *string                   `json:"server_log_level"`
		ServerIPv6       *bool                     `json:"server_ipv6"`
		ClearServerIPv6  bool                      `json:"clear_server_ipv6"`
		OutboundConfig   *model.NodeOutboundConfig `json:"outbound_config"`
		ExtraServerYAML  *string                   `json:"extra_server_yaml"`
	}
	if err := decodeJSON(r, &req); err != nil {
		writeError(w, http.StatusBadRequest, "invalid request body")
		return
	}

	var (
		node     *model.Node
		inbounds []model.Inbound
		users    []model.User
	)
	if req.NodeID != nil && *req.NodeID > 0 {
		n, err := s.store.GetNode(*req.NodeID)
		if err != nil {
			writeError(w, http.StatusNotFound, "node not found")
			return
		}
		node = n
		inbounds, _ = s.store.ListInboundsByNode(n.ID)
		users, _ = s.store.ListUsersByNode(n.ID)
	} else {
		node = &model.Node{
			Name:    "preview-node",
			Enabled: true,
		}
	}

	// Apply draft node overrides if provided
	if req.ServerLogLevel != nil {
		lvl := strings.TrimSpace(*req.ServerLogLevel)
		if !model.IsValidServerLogLevel(lvl) {
			writeError(w, http.StatusBadRequest, "invalid server_log_level")
			return
		}
		node.ServerLogLevel = lvl
	}
	if req.ClearServerIPv6 {
		node.ServerIPv6 = nil
	} else if req.ServerIPv6 != nil {
		v := *req.ServerIPv6
		node.ServerIPv6 = &v
	}
	if req.OutboundConfig != nil {
		req.OutboundConfig.Normalize()
		if err := req.OutboundConfig.Validate(); err != nil {
			writeError(w, http.StatusBadRequest, "节点出站配置无效: "+err.Error())
			return
		}
		node.OutboundConfig = *req.OutboundConfig
	}
	if req.ExtraServerYAML != nil {
		if err := mihomogen.ValidateServerTemplateDirectives(*req.ExtraServerYAML); err != nil {
			writeError(w, http.StatusBadRequest, "节点附加 YAML 无效: "+err.Error())
			return
		}
		node.ExtraServerYAML = *req.ExtraServerYAML
	}

	// Resolve server template YAML
	var serverTmplYAML string
	if strings.TrimSpace(req.Content) != "" {
		if err := mihomogen.ValidateServerTemplateDirectives(req.Content); err != nil {
			writeError(w, http.StatusBadRequest, "服务端模板 YAML 无效: "+err.Error())
			return
		}
		serverTmplYAML = req.Content
	} else if req.UseDraftTemplate {
		if req.TemplateID != nil {
			t, err := s.store.GetTemplate(*req.TemplateID)
			if err != nil || t.Kind != model.TemplateKindServer {
				writeError(w, http.StatusNotFound, "server template not found")
				return
			}
			serverTmplYAML = t.Content
		} else {
			serverTmplYAML = resolveServerTemplateYAML(s.store, nil)
		}
	} else if req.TemplateID != nil {
		t, err := s.store.GetTemplate(*req.TemplateID)
		if err != nil || t.Kind != model.TemplateKindServer {
			writeError(w, http.StatusNotFound, "server template not found")
			return
		}
		serverTmplYAML = t.Content
	} else {
		serverTmplYAML = resolveServerTemplateYAML(s.store, node.ServerTemplateID)
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

	opts, _, err := s.ws.BuildServerGenOptions()
	if err != nil {
		writeError(w, http.StatusInternalServerError, err.Error())
		return
	}

	bundle, err := mihomogen.GenerateServerConfig(node, inbounds, users, certsMap, serverTmplYAML, opts, time.Now().UTC())
	if err != nil {
		writeError(w, http.StatusBadRequest, err.Error())
		return
	}
	writeJSON(w, http.StatusOK, map[string]string{"yaml": bundle.ConfigYAML})
}

// --- Public Subscription Path Matching & Endpoints ---

var subPathPattern = regexp.MustCompile(`^[a-zA-Z0-9._-]+(?:/[a-zA-Z0-9._-]+)*$`)

var reservedFirstSegments = map[string]bool{
	"api":           true,
	"ws":            true,
	"assets":        true,
	"install":       true,
	"healthz":       true,
	"login":         true,
	"nodes":         true,
	"certificates":  true,
	"users":         true,
	"templates":     true,
	"notifications": true,
	"settings":      true,
	".well-known":   true,
}

func normalizeSubPath(raw string) (string, error) {
	cleaned := strings.TrimSpace(raw)
	cleaned = strings.Trim(cleaned, "/")
	if cleaned == "" {
		return "sub", nil
	}
	for strings.Contains(cleaned, "//") {
		cleaned = strings.ReplaceAll(cleaned, "//", "/")
	}
	if strings.Contains(cleaned, "..") || !subPathPattern.MatchString(cleaned) {
		return "", errors.New("sub_path may only contain letters, numbers, '.', '_', '-', and '/'")
	}
	first := strings.ToLower(strings.Split(cleaned, "/")[0])
	if reservedFirstSegments[first] {
		return "", fmt.Errorf("sub_path prefix %q conflicts with a reserved Hub route", first)
	}
	return cleaned, nil
}

func (s *Server) currentSubPath() string {
	if st, err := s.store.GetSystemSettings(); err == nil {
		if norm, err := normalizeSubPath(st.SubPath); err == nil {
			return norm
		}
	}
	return "sub"
}

func (s *Server) matchSubscriptionPath(urlPath string) (string, bool) {
	trimmed := strings.Trim(urlPath, "/")
	subPath := s.currentSubPath()
	prefix := subPath + "/"
	if !strings.HasPrefix(trimmed, prefix) {
		return "", false
	}
	token := strings.TrimPrefix(trimmed, prefix)
	if token == "" || strings.Contains(token, "/") {
		return "", false
	}
	return token, true
}

func isBrowserHTMLRequest(r *http.Request) bool {
	q := r.URL.Query()
	if q.Get("raw") != "" || q.Get("download") != "" || q.Get("flag") != "" {
		return false
	}
	ua := strings.ToLower(r.UserAgent())
	clientHints := []string{
		"clash", "mihomo", "stash", "flclash", "shadowrocket",
		"v2ray", "sing-box", "quantumult", "surge", "loon",
		"curl", "wget", "go-http-client", "python", "httpie", "okhttp",
	}
	for _, h := range clientHints {
		if strings.Contains(ua, h) {
			return false
		}
	}
	accept := strings.ToLower(r.Header.Get("Accept"))
	return strings.Contains(accept, "text/html")
}

func computeUserStatus(u *model.User, now time.Time) string {
	if !u.Enabled {
		return "disabled"
	}
	if u.ExpireAt != nil && now.After(*u.ExpireAt) {
		return "expired"
	}
	if u.TrafficLimit > 0 && u.TrafficUsed >= u.TrafficLimit {
		return "exhausted"
	}
	if u.ExpireAt != nil && u.ExpireAt.Sub(now) <= 7*24*time.Hour {
		return "expiring"
	}
	return "active"
}

func (s *Server) handlePublicSubInfo(w http.ResponseWriter, r *http.Request) {
	rawPath := strings.TrimSpace(r.URL.Query().Get("path"))
	token, ok := s.matchSubscriptionPath(rawPath)
	if !ok {
		writeError(w, http.StatusNotFound, "subscription not found")
		return
	}
	u, err := s.store.GetUserBySubToken(token)
	if err != nil {
		writeError(w, http.StatusNotFound, "subscription not found")
		return
	}

	now := time.Now().UTC()
	status := computeUserStatus(u, now)

	allNodes, _ := s.store.ListNodes()
	nodesOut := make([]model.PublicSubNode, 0, len(allNodes))
	for i := range allNodes {
		n := &allNodes[i]
		if !n.Enabled || !u.AccessPolicy.MatchNode(n) {
			continue
		}
		ins, _ := s.store.ListInboundsByNode(n.ID)
		protoSeen := make(map[string]bool)
		protos := make([]string, 0, len(ins))
		for j := range ins {
			inb := &ins[j]
			if !inb.Enabled || !u.AccessPolicy.MatchInbound(inb) || protoSeen[inb.Protocol] {
				continue
			}
			protoSeen[inb.Protocol] = true
			protos = append(protos, inb.Protocol)
		}
		if len(protos) == 0 {
			continue
		}
		rt := s.ws.GetRuntime(n.ID)
		nodesOut = append(nodesOut, model.PublicSubNode{
			Name:      n.Name,
			Region:    n.Region,
			Online:    rt.Online,
			Protocols: protos,
		})
	}

	subURL := fmt.Sprintf("%s/%s/%s", s.resolvePublicURL(r), s.currentSubPath(), u.SubToken)
	info := model.PublicSubInfo{
		Username:     u.Username,
		Enabled:      u.Enabled,
		Status:       status,
		TrafficLimit: u.TrafficLimit,
		TrafficUsed:  u.TrafficUsed,
		UploadUsed:   u.UploadUsed,
		DownloadUsed: u.DownloadUsed,
		ExpireAt:     u.ExpireAt,
		SubURL:       subURL,
		DownloadURL:  subURL + "?download=1",
		RawURL:       subURL + "?raw=1",
		Nodes:        nodesOut,
	}

	if u.IsActive(now) {
		if tmpl, err := s.resolveUserTemplate(u); err == nil {
			if rendered, err := s.renderSubscriptionForUser(u, tmpl.Content); err == nil {
				info.YAML = rendered
			}
		}
	}

	writeJSON(w, http.StatusOK, info)
}

func (s *Server) serveSubscriptionYAML(w http.ResponseWriter, _ *http.Request, token string) {
	if token == "" {
		http.Error(w, "missing token", http.StatusNotFound)
		return
	}
	u, err := s.store.GetUserBySubToken(token)
	if err != nil {
		http.Error(w, "subscription not found", http.StatusNotFound)
		return
	}
	if !u.IsActive(time.Now().UTC()) {
		http.Error(w, "subscription expired, disabled, or quota exceeded", http.StatusForbidden)
		return
	}
	tmpl, err := s.resolveUserTemplate(u)
	if err != nil {
		http.Error(w, "template error: "+err.Error(), http.StatusInternalServerError)
		return
	}
	rendered, err := s.renderSubscriptionForUser(u, tmpl.Content)
	if err != nil {
		http.Error(w, "render error: "+err.Error(), http.StatusInternalServerError)
		return
	}

	var expireUnix int64
	if u.ExpireAt != nil {
		expireUnix = u.ExpireAt.Unix()
	}
	userinfo := fmt.Sprintf("upload=%d; download=%d; total=%d; expire=%d",
		u.UploadUsed, u.DownloadUsed, u.TrafficLimit, expireUnix)

	w.Header().Set("Content-Type", "text/yaml; charset=utf-8")
	w.Header().Set("Subscription-Userinfo", userinfo)
	w.Header().Set("Profile-Update-Interval", "12")
	w.Header().Set("Content-Disposition", fmt.Sprintf(`attachment; filename="mihob-%s.yaml"`, sanitizeDownloadFilename(u.Username)))
	_, _ = w.Write([]byte(rendered))
}

func sanitizeDownloadFilename(raw string) string {
	var b strings.Builder
	for _, r := range raw {
		if (r >= 'a' && r <= 'z') || (r >= 'A' && r <= 'Z') || (r >= '0' && r <= '9') || r == '.' || r == '_' || r == '-' {
			b.WriteRune(r)
		} else {
			b.WriteByte('_')
		}
	}
	res := strings.Trim(b.String(), "._-")
	if res == "" {
		return "user"
	}
	return res
}

func (s *Server) resolveUserTemplate(u *model.User) (*model.Template, error) {
	if u.TemplateID != nil {
		if t, err := s.store.GetTemplate(*u.TemplateID); err == nil && t.Kind == model.TemplateKindClient {
			return t, nil
		}
	}
	return s.store.GetDefaultTemplate()
}

func (s *Server) renderSubscriptionForUser(u *model.User, templateYAML string) (string, error) {
	certsList, err := s.store.ListCertificates()
	if err != nil {
		return "", err
	}
	certsMap := make(map[int64]*model.Certificate, len(certsList))
	for i := range certsList {
		certsMap[certsList[i].ID] = &certsList[i]
	}

	allNodes, err := s.store.ListNodes()
	if err != nil {
		return "", err
	}
	nodesWithInbounds := make([]mihomogen.NodeWithInbounds, 0, len(allNodes))
	for i := range allNodes {
		n := &allNodes[i]
		if !u.AccessPolicy.MatchNode(n) {
			continue
		}
		ins, err := s.store.ListInboundsByNode(n.ID)
		if err != nil {
			continue
		}
		filtered := make([]model.Inbound, 0, len(ins))
		for j := range ins {
			if u.AccessPolicy.MatchInbound(&ins[j]) {
				filtered = append(filtered, ins[j])
			}
		}
		if len(filtered) == 0 {
			continue
		}
		nodesWithInbounds = append(nodesWithInbounds, mihomogen.NodeWithInbounds{
			Node:     *n,
			Inbounds: filtered,
		})
	}
	return mihomogen.RenderUserSubscription(u, nodesWithInbounds, certsMap, templateYAML)
}

// --- Settings ---

func maskSecretToken(raw string) string {
	raw = strings.TrimSpace(raw)
	if raw == "" {
		return ""
	}
	if len(raw) <= 6 {
		return "****"
	}
	return raw[:4] + "****" + raw[len(raw)-4:]
}

func maskSettingsForAPI(st *model.SystemSettings) *model.SystemSettings {
	if st == nil {
		return nil
	}
	out := *st
	if strings.TrimSpace(out.GitHubToken) != "" {
		out.HasGitHubToken = true
		out.GitHubTokenMasked = maskSecretToken(out.GitHubToken)
	}
	out.GitHubToken = ""
	out.ClearGitHubToken = false
	return &out
}

func (s *Server) handleGetSettings(w http.ResponseWriter, r *http.Request) {
	st, err := s.store.GetSystemSettings()
	if err != nil {
		writeError(w, http.StatusInternalServerError, err.Error())
		return
	}
	writeJSON(w, http.StatusOK, maskSettingsForAPI(st))
}

func (s *Server) handleUpdateSettings(w http.ResponseWriter, r *http.Request) {
	var req model.SystemSettings
	if err := decodeJSON(r, &req); err != nil {
		writeError(w, http.StatusBadRequest, "invalid request body")
		return
	}
	req.HubPublicURL = strings.TrimRight(strings.TrimSpace(req.HubPublicURL), "/")
	req.ACMEEmail = strings.TrimSpace(req.ACMEEmail)
	req.AgentImage = strings.TrimSpace(req.AgentImage)
	req.GitHubToken = strings.TrimSpace(req.GitHubToken)

	if req.ClearGitHubToken {
		req.GitHubToken = ""
	} else if req.GitHubToken == "" {
		// Preserve existing GitHub token when omitted in update payload
		if existing, err := s.store.GetSystemSettings(); err == nil {
			req.GitHubToken = existing.GitHubToken
		}
	}

	normSubPath, err := normalizeSubPath(req.SubPath)
	if err != nil {
		writeError(w, http.StatusBadRequest, err.Error())
		return
	}
	req.SubPath = normSubPath

	if err := s.store.SaveSystemSettings(&req); err != nil {
		writeError(w, http.StatusInternalServerError, err.Error())
		return
	}
	writeJSON(w, http.StatusOK, maskSettingsForAPI(&req))
}

func (s *Server) handleBackupDatabase(w http.ResponseWriter, r *http.Request) {
	tmpDir, err := os.MkdirTemp("", "mihob-backup-*")
	if err != nil {
		writeError(w, http.StatusInternalServerError, "failed to prepare backup directory")
		return
	}
	defer func() { _ = os.RemoveAll(tmpDir) }()

	dstPath := filepath.Join(tmpDir, "mihob-backup.db")
	if err := s.store.BackupTo(dstPath); err != nil {
		writeError(w, http.StatusInternalServerError, "failed to create database backup: "+err.Error())
		return
	}

	f, err := os.Open(dstPath)
	if err != nil {
		writeError(w, http.StatusInternalServerError, "failed to open backup snapshot")
		return
	}
	defer f.Close()

	filename := fmt.Sprintf("mihob-backup-%s.db", time.Now().UTC().Format("20060102-150405"))
	w.Header().Set("Content-Type", "application/x-sqlite3")
	w.Header().Set("Content-Disposition", fmt.Sprintf(`attachment; filename="%s"`, filename))
	w.Header().Set("Cache-Control", "no-store")
	if info, err := f.Stat(); err == nil {
		w.Header().Set("Content-Length", fmt.Sprintf("%d", info.Size()))
	}
	_, _ = io.Copy(w, f)
}
