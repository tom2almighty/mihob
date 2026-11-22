package hub

import (
	"net/http"
	"strings"

	"github.com/mihob/mihob/internal/model"
	"github.com/mihob/mihob/internal/notify"
)

func maskChannelForAPI(ch model.NotificationChannel) model.NotificationChannel {
	ch.MaskedURL = notify.MaskURL(ch.URL)
	ch.URL = ""
	return ch
}

// --- Channels ---

func (s *Server) handleListNotificationChannels(w http.ResponseWriter, r *http.Request) {
	list, err := s.store.ListNotificationChannels()
	if err != nil {
		writeError(w, http.StatusInternalServerError, err.Error())
		return
	}
	out := make([]model.NotificationChannel, 0, len(list))
	for _, ch := range list {
		out = append(out, maskChannelForAPI(ch))
	}
	writeJSON(w, http.StatusOK, out)
}

func (s *Server) handleCreateNotificationChannel(w http.ResponseWriter, r *http.Request) {
	var req struct {
		Name     string   `json:"name"`
		Provider string   `json:"provider"`
		URL      string   `json:"url"`
		Enabled  *bool    `json:"enabled"`
		Events   []string `json:"events"`
		Remark   string   `json:"remark"`
	}
	if err := decodeJSON(r, &req); err != nil {
		writeError(w, http.StatusBadRequest, "invalid request body")
		return
	}
	req.Name = strings.TrimSpace(req.Name)
	req.URL = strings.TrimSpace(req.URL)
	if req.Name == "" {
		writeError(w, http.StatusBadRequest, "渠道名称不能为空")
		return
	}
	if err := notify.ValidateURL(req.URL); err != nil {
		writeError(w, http.StatusBadRequest, err.Error())
		return
	}
	provider := strings.TrimSpace(req.Provider)
	if provider == "" {
		provider = notify.DetectProvider(req.URL)
	}
	enabled := true
	if req.Enabled != nil {
		enabled = *req.Enabled
	}
	ch := &model.NotificationChannel{
		Name:     req.Name,
		Provider: provider,
		URL:      req.URL,
		Enabled:  enabled,
		Events:   req.Events,
		Remark:   strings.TrimSpace(req.Remark),
	}
	if err := s.store.CreateNotificationChannel(ch); err != nil {
		writeError(w, http.StatusInternalServerError, err.Error())
		return
	}
	writeJSON(w, http.StatusCreated, maskChannelForAPI(*ch))
}

func (s *Server) handleUpdateNotificationChannel(w http.ResponseWriter, r *http.Request) {
	id, err := parseIDParam(r, "id")
	if err != nil {
		writeError(w, http.StatusBadRequest, "invalid channel id")
		return
	}
	ch, err := s.store.GetNotificationChannel(id)
	if err != nil {
		writeError(w, http.StatusNotFound, "channel not found")
		return
	}
	var req struct {
		Name     *string  `json:"name"`
		Provider *string  `json:"provider"`
		URL      *string  `json:"url"`
		Enabled  *bool    `json:"enabled"`
		Events   []string `json:"events"`
		Remark   *string  `json:"remark"`
	}
	if err := decodeJSON(r, &req); err != nil {
		writeError(w, http.StatusBadRequest, "invalid request body")
		return
	}
	if req.Name != nil {
		name := strings.TrimSpace(*req.Name)
		if name == "" {
			writeError(w, http.StatusBadRequest, "渠道名称不能为空")
			return
		}
		ch.Name = name
	}
	if req.URL != nil && strings.TrimSpace(*req.URL) != "" {
		newURL := strings.TrimSpace(*req.URL)
		if err := notify.ValidateURL(newURL); err != nil {
			writeError(w, http.StatusBadRequest, err.Error())
			return
		}
		ch.URL = newURL
		if req.Provider == nil || strings.TrimSpace(*req.Provider) == "" {
			ch.Provider = notify.DetectProvider(newURL)
		}
	}
	if req.Provider != nil && strings.TrimSpace(*req.Provider) != "" {
		ch.Provider = strings.TrimSpace(*req.Provider)
	}
	if req.Enabled != nil {
		ch.Enabled = *req.Enabled
	}
	if req.Events != nil {
		ch.Events = req.Events
	}
	if req.Remark != nil {
		ch.Remark = strings.TrimSpace(*req.Remark)
	}
	if err := s.store.UpdateNotificationChannel(ch); err != nil {
		writeError(w, http.StatusInternalServerError, err.Error())
		return
	}
	writeJSON(w, http.StatusOK, maskChannelForAPI(*ch))
}

func (s *Server) handleDeleteNotificationChannel(w http.ResponseWriter, r *http.Request) {
	id, err := parseIDParam(r, "id")
	if err != nil {
		writeError(w, http.StatusBadRequest, "invalid channel id")
		return
	}
	if err := s.store.DeleteNotificationChannel(id); err != nil {
		writeError(w, http.StatusInternalServerError, err.Error())
		return
	}
	writeJSON(w, http.StatusOK, map[string]string{"status": "deleted"})
}

func (s *Server) handleTestNotificationChannel(w http.ResponseWriter, r *http.Request) {
	id, err := parseIDParam(r, "id")
	if err != nil {
		writeError(w, http.StatusBadRequest, "invalid channel id")
		return
	}
	if err := s.notify.SendTestChannel(id); err != nil {
		writeError(w, http.StatusBadRequest, err.Error())
		return
	}
	writeJSON(w, http.StatusOK, map[string]string{"status": "ok"})
}

func (s *Server) handleTestNotificationURL(w http.ResponseWriter, r *http.Request) {
	var req struct {
		URL string `json:"url"`
	}
	if err := decodeJSON(r, &req); err != nil {
		writeError(w, http.StatusBadRequest, "invalid request body")
		return
	}
	if err := s.notify.SendTestURL(req.URL); err != nil {
		writeError(w, http.StatusBadRequest, err.Error())
		return
	}
	writeJSON(w, http.StatusOK, map[string]string{"status": "ok"})
}

// --- Rules ---

func (s *Server) handleGetNotificationRules(w http.ResponseWriter, r *http.Request) {
	rules, err := s.store.GetNotificationRules()
	if err != nil {
		writeError(w, http.StatusInternalServerError, err.Error())
		return
	}
	writeJSON(w, http.StatusOK, rules)
}

func (s *Server) handleUpdateNotificationRules(w http.ResponseWriter, r *http.Request) {
	var req model.NotificationRules
	if err := decodeJSON(r, &req); err != nil {
		writeError(w, http.StatusBadRequest, "invalid request body")
		return
	}
	saved, err := s.store.SaveNotificationRules(req)
	if err != nil {
		writeError(w, http.StatusInternalServerError, err.Error())
		return
	}
	writeJSON(w, http.StatusOK, saved)
}

// --- Schedules ---

func validateAndNormalizeSchedule(sc *model.NotificationSchedule) string {
	sc.Name = strings.TrimSpace(sc.Name)
	if sc.Name == "" {
		return "报告名称不能为空"
	}
	switch sc.Frequency {
	case "daily", "weekly", "monthly":
	default:
		sc.Frequency = "daily"
	}
	sc.TimeOfDay = strings.TrimSpace(sc.TimeOfDay)
	if len(sc.TimeOfDay) != 5 || sc.TimeOfDay[2] != ':' {
		return "推送时间格式必须为 HH:MM"
	}
	if sc.Weekday < 0 || sc.Weekday > 6 {
		sc.Weekday = 1
	}
	if sc.DayOfMonth < 1 || sc.DayOfMonth > 31 {
		sc.DayOfMonth = 1
	}
	sc.Timezone = strings.TrimSpace(sc.Timezone)
	if sc.Timezone == "" {
		sc.Timezone = "Asia/Shanghai"
	}
	if sc.TrafficDisplayMode != "remaining" {
		sc.TrafficDisplayMode = "used"
	}
	if sc.NodeLimit < 0 {
		sc.NodeLimit = 0
	}
	return ""
}

func (s *Server) handleListNotificationSchedules(w http.ResponseWriter, r *http.Request) {
	list, err := s.store.ListNotificationSchedules()
	if err != nil {
		writeError(w, http.StatusInternalServerError, err.Error())
		return
	}
	writeJSON(w, http.StatusOK, list)
}

func (s *Server) handleCreateNotificationSchedule(w http.ResponseWriter, r *http.Request) {
	var req model.NotificationSchedule
	if err := decodeJSON(r, &req); err != nil {
		writeError(w, http.StatusBadRequest, "invalid request body")
		return
	}
	if msg := validateAndNormalizeSchedule(&req); msg != "" {
		writeError(w, http.StatusBadRequest, msg)
		return
	}
	if err := s.store.CreateNotificationSchedule(&req); err != nil {
		writeError(w, http.StatusInternalServerError, err.Error())
		return
	}
	writeJSON(w, http.StatusCreated, req)
}

func (s *Server) handleUpdateNotificationSchedule(w http.ResponseWriter, r *http.Request) {
	id, err := parseIDParam(r, "id")
	if err != nil {
		writeError(w, http.StatusBadRequest, "invalid schedule id")
		return
	}
	existing, err := s.store.GetNotificationSchedule(id)
	if err != nil {
		writeError(w, http.StatusNotFound, "schedule not found")
		return
	}
	var req model.NotificationSchedule
	if err := decodeJSON(r, &req); err != nil {
		writeError(w, http.StatusBadRequest, "invalid request body")
		return
	}
	req.ID = existing.ID
	req.LastRunAt = existing.LastRunAt
	req.CreatedAt = existing.CreatedAt
	if msg := validateAndNormalizeSchedule(&req); msg != "" {
		writeError(w, http.StatusBadRequest, msg)
		return
	}
	if err := s.store.UpdateNotificationSchedule(&req); err != nil {
		writeError(w, http.StatusInternalServerError, err.Error())
		return
	}
	writeJSON(w, http.StatusOK, req)
}

func (s *Server) handleDeleteNotificationSchedule(w http.ResponseWriter, r *http.Request) {
	id, err := parseIDParam(r, "id")
	if err != nil {
		writeError(w, http.StatusBadRequest, "invalid schedule id")
		return
	}
	if err := s.store.DeleteNotificationSchedule(id); err != nil {
		writeError(w, http.StatusInternalServerError, err.Error())
		return
	}
	writeJSON(w, http.StatusOK, map[string]string{"status": "deleted"})
}

func (s *Server) handleRunNotificationSchedule(w http.ResponseWriter, r *http.Request) {
	id, err := parseIDParam(r, "id")
	if err != nil {
		writeError(w, http.StatusBadRequest, "invalid schedule id")
		return
	}
	res, err := s.notify.RunScheduleNow(id, s.ws.EnrichNode)
	if err != nil {
		writeError(w, http.StatusBadRequest, err.Error())
		return
	}
	writeJSON(w, http.StatusOK, res)
}

// --- Logs ---

func (s *Server) handleListNotificationLogs(w http.ResponseWriter, r *http.Request) {
	list, err := s.store.ListNotificationLogs(100)
	if err != nil {
		writeError(w, http.StatusInternalServerError, err.Error())
		return
	}
	writeJSON(w, http.StatusOK, list)
}

func (s *Server) handleClearNotificationLogs(w http.ResponseWriter, r *http.Request) {
	if err := s.store.ClearNotificationLogs(); err != nil {
		writeError(w, http.StatusInternalServerError, err.Error())
		return
	}
	writeJSON(w, http.StatusOK, map[string]string{"status": "cleared"})
}
