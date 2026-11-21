package hub

import (
	"net/http"
	"sort"
	"time"

	"github.com/mihob/mihob/internal/crypto"
	"github.com/mihob/mihob/internal/db"
	"github.com/mihob/mihob/internal/model"
)

func (s *Server) handleLogin(w http.ResponseWriter, r *http.Request) {
	var req struct {
		Username string `json:"username"`
		Password string `json:"password"`
	}
	if err := decodeJSON(r, &req); err != nil {
		writeError(w, http.StatusBadRequest, "invalid request body")
		return
	}
	admin, err := s.store.GetAdminByUsername(req.Username)
	if err != nil || !crypto.CheckPassword(admin.PasswordHash, req.Password) {
		writeError(w, http.StatusUnauthorized, "用户名或密码错误")
		return
	}
	tok, err := crypto.SignAdminJWT(s.jwtSecret, admin.ID, admin.Username, 7*24*time.Hour)
	if err != nil {
		writeError(w, http.StatusInternalServerError, "failed to sign token")
		return
	}
	writeJSON(w, http.StatusOK, map[string]any{
		"token": tok,
		"admin": admin,
	})
}

func (s *Server) handleMe(w http.ResponseWriter, r *http.Request) {
	claims := getAdminClaims(r)
	admin, err := s.store.GetAdminByID(claims.AdminID)
	if err != nil {
		writeError(w, http.StatusUnauthorized, "admin not found")
		return
	}
	writeJSON(w, http.StatusOK, admin)
}

func (s *Server) handleChangePassword(w http.ResponseWriter, r *http.Request) {
	claims := getAdminClaims(r)
	var req struct {
		OldPassword string `json:"old_password"`
		NewPassword string `json:"new_password"`
	}
	if err := decodeJSON(r, &req); err != nil {
		writeError(w, http.StatusBadRequest, "invalid request body")
		return
	}
	if len(req.NewPassword) < 6 {
		writeError(w, http.StatusBadRequest, "新密码长度至少 6 位")
		return
	}
	admin, err := s.store.GetAdminByID(claims.AdminID)
	if err != nil || !crypto.CheckPassword(admin.PasswordHash, req.OldPassword) {
		writeError(w, http.StatusBadRequest, "当前密码不正确")
		return
	}
	if err := s.store.UpdateAdminPassword(admin.ID, req.NewPassword); err != nil {
		writeError(w, http.StatusInternalServerError, "更新密码失败")
		return
	}
	writeJSON(w, http.StatusOK, map[string]string{"status": "ok"})
}

func (s *Server) handleDashboard(w http.ResponseWriter, r *http.Request) {
	nodes, err := s.store.ListNodes()
	if err != nil {
		writeError(w, http.StatusInternalServerError, err.Error())
		return
	}
	users, err := s.store.ListUsers()
	if err != nil {
		writeError(w, http.StatusInternalServerError, err.Error())
		return
	}
	certs, err := s.store.ListCertificates()
	if err != nil {
		writeError(w, http.StatusInternalServerError, err.Error())
		return
	}
	rangeKey := db.NormalizeDashboardRange(r.URL.Query().Get("range"))
	series, err := s.store.QueryTrafficSeries(rangeKey)
	if err != nil {
		writeError(w, http.StatusInternalServerError, err.Error())
		return
	}
	nodeTraffic, err := s.store.QueryNodeTrafficByRange(rangeKey, 10)
	if err != nil {
		writeError(w, http.StatusInternalServerError, err.Error())
		return
	}
	userTraffic, err := s.store.QueryUserTrafficByRange(rangeKey, 10)
	if err != nil {
		writeError(w, http.StatusInternalServerError, err.Error())
		return
	}
	protocolTraffic, err := s.store.QueryProtocolTrafficByRange(rangeKey)
	if err != nil {
		writeError(w, http.StatusInternalServerError, err.Error())
		return
	}

	now := time.Now().UTC()
	var onlineNodes, totalConnections, expiringSoonNodes int
	var totalUpRate, totalDownRate, totalNodeTraffic int64
	nodeExpiryWindow := now.Add(14 * 24 * time.Hour)
	for i := range nodes {
		s.ws.EnrichNode(&nodes[i])
		if nodes[i].Online {
			onlineNodes++
		}
		if nodes[i].ExpireAt != nil && nodes[i].ExpireAt.Before(nodeExpiryWindow) {
			expiringSoonNodes++
		}
		totalConnections += nodes[i].ActiveConnections
		totalUpRate += nodes[i].UpRate
		totalDownRate += nodes[i].DownRate
		totalNodeTraffic += nodes[i].TrafficUsed
	}

	var activeUsers, expiringSoonUsers int
	expiringWindow := now.Add(7 * 24 * time.Hour)
	topUsers := make([]model.User, 0, len(users))
	for _, u := range users {
		if u.IsActive(now) {
			activeUsers++
		}
		if u.ExpireAt != nil && u.ExpireAt.After(now) && u.ExpireAt.Before(expiringWindow) {
			expiringSoonUsers++
		}
		topUsers = append(topUsers, u)
	}
	sort.Slice(topUsers, func(i, j int) bool {
		return topUsers[i].TrafficUsed > topUsers[j].TrafficUsed
	})
	if len(topUsers) > 5 {
		topUsers = topUsers[:5]
	}

	var expiringCerts int
	certWindow := now.Add(14 * 24 * time.Hour)
	for _, c := range certs {
		if c.NotAfter != nil && c.NotAfter.Before(certWindow) {
			expiringCerts++
		}
	}

	writeJSON(w, http.StatusOK, map[string]any{
		"summary": map[string]any{
			"total_nodes":         len(nodes),
			"online_nodes":        onlineNodes,
			"expiring_soon_nodes": expiringSoonNodes,
			"total_users":         len(users),
			"active_users":        activeUsers,
			"expiring_soon_users": expiringSoonUsers,
			"total_certs":         len(certs),
			"expiring_certs":      expiringCerts,
			"active_connections":  totalConnections,
			"up_rate":             totalUpRate,
			"down_rate":           totalDownRate,
			"total_traffic":       totalNodeTraffic,
		},
		"range":            rangeKey,
		"nodes":            nodes,
		"top_users":        topUsers,
		"traffic_series":   series,
		"node_traffic":     nodeTraffic,
		"user_traffic":     userTraffic,
		"protocol_traffic": protocolTraffic,
	})
}
