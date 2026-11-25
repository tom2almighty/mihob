package hub

import (
	"net/http"
)

type runtimeConfigInfo struct {
	ConfigPath           string   `json:"config_path"`
	DataDir              string   `json:"data_dir"`
	Version              string   `json:"version"`
	TrafficRetentionDays int      `json:"traffic_retention_days"`
	TrustProxy           bool     `json:"trust_proxy"`
	AllowPrivateWebhook  bool     `json:"allow_private_webhook"`
	CORSOrigins          []string `json:"cors_origins"`
}

func (s *Server) runtimeInfo() runtimeConfigInfo {
	origins := s.effectiveCORSOrigins()
	if origins == nil {
		origins = []string{}
	}
	return runtimeConfigInfo{
		ConfigPath:           s.configPath,
		DataDir:              s.dataDir,
		Version:              s.version,
		TrafficRetentionDays: s.effectiveTrafficRetentionDays(),
		TrustProxy:           s.effectiveTrustProxy(),
		AllowPrivateWebhook:  s.effectiveAllowPrivateWebhook(),
		CORSOrigins:          origins,
	}
}

func (s *Server) handleGetDatabaseStats(w http.ResponseWriter, r *http.Request) {
	stats, err := s.store.GetDatabaseStats()
	if err != nil {
		writeError(w, http.StatusInternalServerError, err.Error())
		return
	}
	writeJSON(w, http.StatusOK, map[string]any{
		"stats":   stats,
		"runtime": s.runtimeInfo(),
	})
}

func (s *Server) handleVacuumDatabase(w http.ResponseWriter, r *http.Request) {
	beforeBytes, afterBytes, err := s.store.VacuumAndCheckpoint()
	if err != nil {
		writeError(w, http.StatusInternalServerError, err.Error())
		return
	}
	stats, err := s.store.GetDatabaseStats()
	if err != nil {
		writeError(w, http.StatusInternalServerError, err.Error())
		return
	}
	reclaimed := beforeBytes - afterBytes
	if reclaimed < 0 {
		reclaimed = 0
	}
	writeJSON(w, http.StatusOK, map[string]any{
		"before_bytes":    beforeBytes,
		"after_bytes":     afterBytes,
		"reclaimed_bytes": reclaimed,
		"stats":           stats,
	})
}

func (s *Server) handleCleanupDatabase(w http.ResponseWriter, r *http.Request) {
	var req struct {
		TrafficOlderThanDays  int  `json:"traffic_older_than_days"`
		ClearNotificationLogs bool `json:"clear_notification_logs"`
	}
	if err := decodeJSON(r, &req); err != nil {
		writeError(w, http.StatusBadRequest, "invalid request body")
		return
	}
	if req.TrafficOlderThanDays < 0 {
		writeError(w, http.StatusBadRequest, "traffic_older_than_days must be >= 0")
		return
	}
	if req.TrafficOlderThanDays == 0 && !req.ClearNotificationLogs {
		writeError(w, http.StatusBadRequest, "select at least one cleanup action")
		return
	}

	trafficDeleted, logsDeleted, err := s.store.CleanupMaintenanceData(req.TrafficOlderThanDays, req.ClearNotificationLogs)
	if err != nil {
		writeError(w, http.StatusInternalServerError, err.Error())
		return
	}
	stats, err := s.store.GetDatabaseStats()
	if err != nil {
		writeError(w, http.StatusInternalServerError, err.Error())
		return
	}
	writeJSON(w, http.StatusOK, map[string]any{
		"traffic_deleted": trafficDeleted,
		"logs_deleted":    logsDeleted,
		"stats":           stats,
	})
}
