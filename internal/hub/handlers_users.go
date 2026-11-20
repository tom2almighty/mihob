package hub

import (
	"errors"
	"fmt"
	"net/http"
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
		Username     string     `json:"username"`
		Email        string     `json:"email"`
		Enabled      *bool      `json:"enabled"`
		AllNodes     *bool      `json:"all_nodes"`
		TrafficLimit int64      `json:"traffic_limit"`
		ExpireAt     *time.Time `json:"expire_at"`
		TemplateID   *int64     `json:"template_id"`
		NodeIDs      []int64    `json:"node_ids"`
		Remark       string     `json:"remark"`
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
	allNodes := false
	if req.AllNodes != nil {
		allNodes = *req.AllNodes
	}
	u := &model.User{
		Username:     req.Username,
		Email:        strings.TrimSpace(req.Email),
		Enabled:      enabled,
		AllNodes:     allNodes,
		TrafficLimit: req.TrafficLimit,
		ExpireAt:     req.ExpireAt,
		TemplateID:   req.TemplateID,
		NodeIDs:      req.NodeIDs,
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
	oldNodes := make(map[int64]bool, len(existing.NodeIDs))
	for _, nid := range existing.NodeIDs {
		oldNodes[nid] = true
	}

	var req struct {
		Username     string     `json:"username"`
		Email        string     `json:"email"`
		Enabled      *bool      `json:"enabled"`
		AllNodes     *bool      `json:"all_nodes"`
		TrafficLimit int64      `json:"traffic_limit"`
		ExpireAt     *time.Time `json:"expire_at"`
		TemplateID   *int64     `json:"template_id"`
		NodeIDs      []int64    `json:"node_ids"`
		Remark       string     `json:"remark"`
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
	if req.AllNodes != nil {
		existing.AllNodes = *req.AllNodes
	}
	existing.TrafficLimit = req.TrafficLimit
	existing.ExpireAt = req.ExpireAt
	existing.TemplateID = req.TemplateID
	if req.NodeIDs != nil {
		existing.NodeIDs = req.NodeIDs
	}
	existing.Remark = strings.TrimSpace(req.Remark)

	affected, err := s.store.UpdateUser(existing)
	if err != nil {
		writeError(w, http.StatusBadRequest, err.Error())
		return
	}
	s.ws.PushConfigToNodes(affected)

	// Kick user on revoked nodes or all nodes if disabled/expired
	nowActive := existing.IsActive(time.Now().UTC())
	newNodes := make(map[int64]bool, len(existing.NodeIDs))
	for _, nid := range existing.NodeIDs {
		newNodes[nid] = true
	}
	for _, nid := range affected {
		if (wasActive && !nowActive) || (oldNodes[nid] && !newNodes[nid]) {
			_ = s.ws.KickUsersOnNode(nid, []string{existing.Username, existing.UUID})
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
	list, err := s.store.ListTemplates()
	if err != nil {
		writeError(w, http.StatusInternalServerError, err.Error())
		return
	}
	writeJSON(w, http.StatusOK, list)
}

func (s *Server) handleCreateTemplate(w http.ResponseWriter, r *http.Request) {
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
	if strings.TrimSpace(req.Name) == "" || strings.TrimSpace(req.Content) == "" {
		writeError(w, http.StatusBadRequest, "template name and content are required")
		return
	}
	t := &model.Template{
		Name:        strings.TrimSpace(req.Name),
		Description: strings.TrimSpace(req.Description),
		Content:     req.Content,
		IsDefault:   req.IsDefault,
	}
	if err := s.store.CreateTemplate(t); err != nil {
		writeError(w, http.StatusInternalServerError, err.Error())
		return
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
	existing.IsDefault = req.IsDefault
	if err := s.store.UpdateTemplate(existing); err != nil {
		writeError(w, http.StatusInternalServerError, err.Error())
		return
	}
	writeJSON(w, http.StatusOK, existing)
}

func (s *Server) handleDeleteTemplate(w http.ResponseWriter, r *http.Request) {
	id, err := parseIDParam(r, "id")
	if err != nil {
		writeError(w, http.StatusBadRequest, "invalid template id")
		return
	}
	if err := s.store.DeleteTemplate(id); err != nil {
		writeError(w, http.StatusInternalServerError, err.Error())
		return
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

// --- Public Subscription Path Matching & Endpoints ---

var subPathPattern = regexp.MustCompile(`^[a-zA-Z0-9._-]+(?:/[a-zA-Z0-9._-]+)*$`)

var reservedFirstSegments = map[string]bool{
	"api":          true,
	"ws":           true,
	"assets":       true,
	"install":      true,
	"healthz":      true,
	"login":        true,
	"nodes":        true,
	"certificates": true,
	"users":        true,
	"templates":    true,
	"settings":     true,
	".well-known":  true,
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

	nodesOut := make([]model.PublicSubNode, 0, len(u.NodeIDs))
	for _, nid := range u.NodeIDs {
		n, err := s.store.GetNode(nid)
		if err != nil || !n.Enabled {
			continue
		}
		ins, _ := s.store.ListInboundsByNode(nid)
		protoSeen := make(map[string]bool)
		protos := make([]string, 0, len(ins))
		for _, inb := range ins {
			if !inb.Enabled || protoSeen[inb.Protocol] {
				continue
			}
			protoSeen[inb.Protocol] = true
			protos = append(protos, inb.Protocol)
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

func (s *Server) serveSubscriptionYAML(w http.ResponseWriter, r *http.Request, token string) {
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
	w.Header().Set("Content-Disposition", fmt.Sprintf(`attachment; filename="mihob-%s.yaml"`, u.Username))
	_, _ = w.Write([]byte(rendered))
}

func (s *Server) resolveUserTemplate(u *model.User) (*model.Template, error) {
	if u.TemplateID != nil {
		if t, err := s.store.GetTemplate(*u.TemplateID); err == nil {
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

	nodesWithInbounds := make([]mihomogen.NodeWithInbounds, 0, len(u.NodeIDs))
	for _, nid := range u.NodeIDs {
		n, err := s.store.GetNode(nid)
		if err != nil {
			continue
		}
		ins, err := s.store.ListInboundsByNode(nid)
		if err != nil {
			continue
		}
		nodesWithInbounds = append(nodesWithInbounds, mihomogen.NodeWithInbounds{
			Node:     *n,
			Inbounds: ins,
		})
	}
	return mihomogen.RenderUserSubscription(u, nodesWithInbounds, certsMap, templateYAML)
}

// --- Settings ---

func (s *Server) handleGetSettings(w http.ResponseWriter, r *http.Request) {
	st, err := s.store.GetSystemSettings()
	if err != nil {
		writeError(w, http.StatusInternalServerError, err.Error())
		return
	}
	writeJSON(w, http.StatusOK, st)
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
	writeJSON(w, http.StatusOK, req)
}
