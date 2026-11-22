package db

import (
	"database/sql"
	"encoding/json"
	"errors"
	"sort"
	"time"

	"github.com/mihob/mihob/internal/model"
)

const notificationRulesSettingKey = "notification_rules"

// --- Notification Channels ---

func scanNotificationChannel(scanner interface{ Scan(...any) error }) (*model.NotificationChannel, error) {
	var ch model.NotificationChannel
	var enabled int
	var eventsJSON string
	err := scanner.Scan(
		&ch.ID, &ch.Name, &ch.Provider, &ch.URL, &enabled, &eventsJSON, &ch.Remark, &ch.CreatedAt, &ch.UpdatedAt,
	)
	if err != nil {
		return nil, err
	}
	ch.Enabled = enabled != 0
	if eventsJSON != "" {
		_ = json.Unmarshal([]byte(eventsJSON), &ch.Events)
	}
	if ch.Events == nil {
		ch.Events = []string{}
	}
	return &ch, nil
}

func (s *Store) ListNotificationChannels() ([]model.NotificationChannel, error) {
	rows, err := s.db.Query(`
		SELECT id, name, provider, url, enabled, events, remark, created_at, updated_at
		FROM notification_channels ORDER BY id ASC
	`)
	if err != nil {
		return nil, err
	}
	defer rows.Close()

	var out []model.NotificationChannel
	for rows.Next() {
		ch, err := scanNotificationChannel(rows)
		if err != nil {
			return nil, err
		}
		out = append(out, *ch)
	}
	if out == nil {
		out = []model.NotificationChannel{}
	}
	return out, rows.Err()
}

func (s *Store) GetNotificationChannel(id int64) (*model.NotificationChannel, error) {
	row := s.db.QueryRow(`
		SELECT id, name, provider, url, enabled, events, remark, created_at, updated_at
		FROM notification_channels WHERE id=?
	`, id)
	return scanNotificationChannel(row)
}

func (s *Store) CreateNotificationChannel(ch *model.NotificationChannel) error {
	now := time.Now().UTC()
	if ch.Events == nil {
		ch.Events = []string{}
	}
	eventsJSON, _ := json.Marshal(ch.Events)
	res, err := s.db.Exec(`
		INSERT INTO notification_channels (name, provider, url, enabled, events, remark, created_at, updated_at)
		VALUES (?, ?, ?, ?, ?, ?, ?, ?)
	`, ch.Name, ch.Provider, ch.URL, boolToInt(ch.Enabled), string(eventsJSON), ch.Remark, now, now)
	if err != nil {
		return err
	}
	id, _ := res.LastInsertId()
	ch.ID = id
	ch.CreatedAt = now
	ch.UpdatedAt = now
	return nil
}

func (s *Store) UpdateNotificationChannel(ch *model.NotificationChannel) error {
	now := time.Now().UTC()
	if ch.Events == nil {
		ch.Events = []string{}
	}
	eventsJSON, _ := json.Marshal(ch.Events)
	_, err := s.db.Exec(`
		UPDATE notification_channels
		SET name=?, provider=?, url=?, enabled=?, events=?, remark=?, updated_at=?
		WHERE id=?
	`, ch.Name, ch.Provider, ch.URL, boolToInt(ch.Enabled), string(eventsJSON), ch.Remark, now, ch.ID)
	if err == nil {
		ch.UpdatedAt = now
	}
	return err
}

func (s *Store) DeleteNotificationChannel(id int64) error {
	_, err := s.db.Exec(`DELETE FROM notification_channels WHERE id=?`, id)
	return err
}

// --- Notification Rules ---

func normalizeNotificationRules(r model.NotificationRules) model.NotificationRules {
	if r.NodeOfflineDelaySec < 0 {
		r.NodeOfflineDelaySec = 0
	}
	if r.NodeOfflineDelaySec > 3600 {
		r.NodeOfflineDelaySec = 3600
	}
	if r.NodeExpiringDays < 1 {
		r.NodeExpiringDays = 7
	}
	if r.NodeExpiringDays > 90 {
		r.NodeExpiringDays = 90
	}
	if r.CertExpiringDays < 1 {
		r.CertExpiringDays = 14
	}
	if r.CertExpiringDays > 90 {
		r.CertExpiringDays = 90
	}
	seen := map[int]bool{}
	var cleaned []int
	for _, v := range r.NodeTrafficThresholds {
		if v >= 1 && v <= 100 && !seen[v] {
			seen[v] = true
			cleaned = append(cleaned, v)
		}
	}
	sort.Ints(cleaned)
	if cleaned == nil {
		cleaned = []int{}
	}
	r.NodeTrafficThresholds = cleaned
	return r
}

func (s *Store) GetNotificationRules() (model.NotificationRules, error) {
	raw, err := s.GetSetting(notificationRulesSettingKey)
	if errors.Is(err, sql.ErrNoRows) || raw == "" {
		return model.DefaultNotificationRules(), nil
	}
	if err != nil {
		return model.DefaultNotificationRules(), err
	}
	rules := model.DefaultNotificationRules()
	if err := json.Unmarshal([]byte(raw), &rules); err != nil {
		return model.DefaultNotificationRules(), nil
	}
	return normalizeNotificationRules(rules), nil
}

func (s *Store) SaveNotificationRules(r model.NotificationRules) (model.NotificationRules, error) {
	norm := normalizeNotificationRules(r)
	b, err := json.Marshal(norm)
	if err != nil {
		return norm, err
	}
	if err := s.SetSetting(notificationRulesSettingKey, string(b)); err != nil {
		return norm, err
	}
	return norm, nil
}

// --- Notification Schedules ---

func scanNotificationSchedule(scanner interface{ Scan(...any) error }) (*model.NotificationSchedule, error) {
	var sc model.NotificationSchedule
	var enabled, incSummary, incNodeTraffic, incExpiring, incTopUsers int
	var channelIDsJSON string
	var lastRunAt sql.NullTime
	err := scanner.Scan(
		&sc.ID, &sc.Name, &enabled, &sc.Frequency, &sc.TimeOfDay,
		&sc.Weekday, &sc.DayOfMonth, &sc.Timezone, &sc.TrafficDisplayMode,
		&incSummary, &incNodeTraffic, &sc.NodeLimit, &incExpiring, &incTopUsers,
		&channelIDsJSON, &lastRunAt, &sc.CreatedAt, &sc.UpdatedAt,
	)
	if err != nil {
		return nil, err
	}
	sc.Enabled = enabled != 0
	sc.IncludeSummary = incSummary != 0
	sc.IncludeNodeTraffic = incNodeTraffic != 0
	sc.IncludeExpiring = incExpiring != 0
	sc.IncludeTopUsers = incTopUsers != 0
	if lastRunAt.Valid {
		t := lastRunAt.Time
		sc.LastRunAt = &t
	}
	if channelIDsJSON != "" {
		_ = json.Unmarshal([]byte(channelIDsJSON), &sc.ChannelIDs)
	}
	if sc.ChannelIDs == nil {
		sc.ChannelIDs = []int64{}
	}
	return &sc, nil
}

func (s *Store) ListNotificationSchedules() ([]model.NotificationSchedule, error) {
	rows, err := s.db.Query(`
		SELECT id, name, enabled, frequency, time_of_day, weekday, day_of_month, timezone,
		       traffic_display_mode, include_summary, include_node_traffic, node_limit,
		       include_expiring, include_top_users, channel_ids, last_run_at, created_at, updated_at
		FROM notification_schedules ORDER BY id ASC
	`)
	if err != nil {
		return nil, err
	}
	defer rows.Close()

	var out []model.NotificationSchedule
	for rows.Next() {
		sc, err := scanNotificationSchedule(rows)
		if err != nil {
			return nil, err
		}
		out = append(out, *sc)
	}
	if out == nil {
		out = []model.NotificationSchedule{}
	}
	return out, rows.Err()
}

func (s *Store) GetNotificationSchedule(id int64) (*model.NotificationSchedule, error) {
	row := s.db.QueryRow(`
		SELECT id, name, enabled, frequency, time_of_day, weekday, day_of_month, timezone,
		       traffic_display_mode, include_summary, include_node_traffic, node_limit,
		       include_expiring, include_top_users, channel_ids, last_run_at, created_at, updated_at
		FROM notification_schedules WHERE id=?
	`, id)
	return scanNotificationSchedule(row)
}

func (s *Store) CreateNotificationSchedule(sc *model.NotificationSchedule) error {
	now := time.Now().UTC()
	if sc.ChannelIDs == nil {
		sc.ChannelIDs = []int64{}
	}
	chJSON, _ := json.Marshal(sc.ChannelIDs)
	res, err := s.db.Exec(`
		INSERT INTO notification_schedules (
			name, enabled, frequency, time_of_day, weekday, day_of_month, timezone,
			traffic_display_mode, include_summary, include_node_traffic, node_limit,
			include_expiring, include_top_users, channel_ids, last_run_at, created_at, updated_at
		) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, NULL, ?, ?)
	`,
		sc.Name, boolToInt(sc.Enabled), sc.Frequency, sc.TimeOfDay, sc.Weekday, sc.DayOfMonth, sc.Timezone,
		sc.TrafficDisplayMode, boolToInt(sc.IncludeSummary), boolToInt(sc.IncludeNodeTraffic), sc.NodeLimit,
		boolToInt(sc.IncludeExpiring), boolToInt(sc.IncludeTopUsers), string(chJSON), now, now,
	)
	if err != nil {
		return err
	}
	id, _ := res.LastInsertId()
	sc.ID = id
	sc.CreatedAt = now
	sc.UpdatedAt = now
	return nil
}

func (s *Store) UpdateNotificationSchedule(sc *model.NotificationSchedule) error {
	now := time.Now().UTC()
	if sc.ChannelIDs == nil {
		sc.ChannelIDs = []int64{}
	}
	chJSON, _ := json.Marshal(sc.ChannelIDs)
	_, err := s.db.Exec(`
		UPDATE notification_schedules
		SET name=?, enabled=?, frequency=?, time_of_day=?, weekday=?, day_of_month=?, timezone=?,
		    traffic_display_mode=?, include_summary=?, include_node_traffic=?, node_limit=?,
		    include_expiring=?, include_top_users=?, channel_ids=?, updated_at=?
		WHERE id=?
	`,
		sc.Name, boolToInt(sc.Enabled), sc.Frequency, sc.TimeOfDay, sc.Weekday, sc.DayOfMonth, sc.Timezone,
		sc.TrafficDisplayMode, boolToInt(sc.IncludeSummary), boolToInt(sc.IncludeNodeTraffic), sc.NodeLimit,
		boolToInt(sc.IncludeExpiring), boolToInt(sc.IncludeTopUsers), string(chJSON), now, sc.ID,
	)
	if err == nil {
		sc.UpdatedAt = now
	}
	return err
}

func (s *Store) TouchNotificationScheduleRun(id int64, runAt time.Time) error {
	_, err := s.db.Exec(`UPDATE notification_schedules SET last_run_at=? WHERE id=?`, runAt.UTC(), id)
	return err
}

func (s *Store) DeleteNotificationSchedule(id int64) error {
	_, err := s.db.Exec(`DELETE FROM notification_schedules WHERE id=?`, id)
	return err
}

// --- Notification Logs ---

const maxNotificationLogs = 200

func (s *Store) CreateNotificationLog(entry *model.NotificationLog) error {
	now := time.Now().UTC()
	var chID any
	if entry.ChannelID != nil {
		chID = *entry.ChannelID
	}
	res, err := s.db.Exec(`
		INSERT INTO notification_logs (event_type, channel_id, channel_name, title, message, status, error, created_at)
		VALUES (?, ?, ?, ?, ?, ?, ?, ?)
	`, entry.EventType, chID, entry.ChannelName, entry.Title, entry.Message, entry.Status, entry.Error, now)
	if err != nil {
		return err
	}
	id, _ := res.LastInsertId()
	entry.ID = id
	entry.CreatedAt = now

	// Prune oldest logs to keep DB compact
	_, _ = s.db.Exec(`
		DELETE FROM notification_logs
		WHERE id NOT IN (SELECT id FROM notification_logs ORDER BY id DESC LIMIT ?)
	`, maxNotificationLogs)
	return nil
}

func (s *Store) ListNotificationLogs(limit int) ([]model.NotificationLog, error) {
	if limit <= 0 || limit > maxNotificationLogs {
		limit = 100
	}
	rows, err := s.db.Query(`
		SELECT id, event_type, channel_id, channel_name, title, message, status, error, created_at
		FROM notification_logs ORDER BY id DESC LIMIT ?
	`, limit)
	if err != nil {
		return nil, err
	}
	defer rows.Close()

	var out []model.NotificationLog
	for rows.Next() {
		var l model.NotificationLog
		var chID sql.NullInt64
		if err := rows.Scan(
			&l.ID, &l.EventType, &chID, &l.ChannelName, &l.Title, &l.Message, &l.Status, &l.Error, &l.CreatedAt,
		); err != nil {
			return nil, err
		}
		if chID.Valid {
			v := chID.Int64
			l.ChannelID = &v
		}
		out = append(out, l)
	}
	if out == nil {
		out = []model.NotificationLog{}
	}
	return out, rows.Err()
}

func (s *Store) ClearNotificationLogs() error {
	_, err := s.db.Exec(`DELETE FROM notification_logs`)
	return err
}
