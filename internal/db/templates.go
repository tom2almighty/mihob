package db

import (
	"database/sql"
	"time"

	"github.com/mihob/mihob/internal/model"
)

func scanTemplate(row interface{ Scan(...any) error }) (*model.Template, error) {
	var t model.Template
	var isDef int
	err := row.Scan(&t.ID, &t.Name, &t.Description, &t.Content, &isDef, &t.CreatedAt, &t.UpdatedAt)
	if err != nil {
		return nil, err
	}
	t.IsDefault = isDef == 1
	return &t, nil
}

func (s *Store) ListTemplates() ([]model.Template, error) {
	rows, err := s.db.Query(
		`SELECT id, name, description, content, is_default, created_at, updated_at
		 FROM templates ORDER BY is_default DESC, id DESC`,
	)
	if err != nil {
		return nil, err
	}
	defer rows.Close()
	out := []model.Template{}
	for rows.Next() {
		t, err := scanTemplate(rows)
		if err != nil {
			return nil, err
		}
		out = append(out, *t)
	}
	return out, rows.Err()
}

func (s *Store) GetTemplate(id int64) (*model.Template, error) {
	return scanTemplate(s.db.QueryRow(
		`SELECT id, name, description, content, is_default, created_at, updated_at FROM templates WHERE id = ?`,
		id,
	))
}

func (s *Store) GetDefaultTemplate() (*model.Template, error) {
	return scanTemplate(s.db.QueryRow(
		`SELECT id, name, description, content, is_default, created_at, updated_at
		 FROM templates ORDER BY is_default DESC, id ASC LIMIT 1`,
	))
}

func (s *Store) CreateTemplate(t *model.Template) error {
	now := time.Now().UTC()
	tx, err := s.db.Begin()
	if err != nil {
		return err
	}
	defer func() { _ = tx.Rollback() }()

	if t.IsDefault {
		if _, err := tx.Exec(`UPDATE templates SET is_default = 0`); err != nil {
			return err
		}
	}
	res, err := tx.Exec(
		`INSERT INTO templates(name, description, content, is_default, created_at, updated_at) VALUES(?, ?, ?, ?, ?, ?)`,
		t.Name, t.Description, t.Content, boolToInt(t.IsDefault), now, now,
	)
	if err != nil {
		return err
	}
	t.ID, _ = res.LastInsertId()
	t.CreatedAt = now
	t.UpdatedAt = now
	return tx.Commit()
}

func (s *Store) UpdateTemplate(t *model.Template) error {
	tx, err := s.db.Begin()
	if err != nil {
		return err
	}
	defer func() { _ = tx.Rollback() }()

	if t.IsDefault {
		if _, err := tx.Exec(`UPDATE templates SET is_default = 0`); err != nil {
			return err
		}
	}
	_, err = tx.Exec(
		`UPDATE templates SET name=?, description=?, content=?, is_default=?, updated_at=? WHERE id=?`,
		t.Name, t.Description, t.Content, boolToInt(t.IsDefault), time.Now().UTC(), t.ID,
	)
	if err != nil {
		return err
	}
	return tx.Commit()
}

func (s *Store) DeleteTemplate(id int64) error {
	_, err := s.db.Exec(`DELETE FROM templates WHERE id = ?`, id)
	return err
}

// --- Hourly Traffic Aggregation ---

func (s *Store) RecordTrafficHourly(nodeID, up, down int64) error {
	if up <= 0 && down <= 0 {
		return nil
	}
	bucket := time.Now().UTC().Format("2006-01-02 15:00")
	_, err := s.db.Exec(
		`INSERT INTO traffic_hourly(bucket, node_id, upload, download) VALUES(?, ?, ?, ?)
		 ON CONFLICT(bucket, node_id) DO UPDATE SET upload = upload + excluded.upload, download = download + excluded.download`,
		bucket, nodeID, up, down,
	)
	return err
}

func (s *Store) RecordUserTrafficHourly(userID, up, down int64) error {
	if userID <= 0 || (up <= 0 && down <= 0) {
		return nil
	}
	bucket := time.Now().UTC().Format("2006-01-02 15:00")
	_, err := s.db.Exec(
		`INSERT INTO traffic_user_hourly(bucket, user_id, upload, download) VALUES(?, ?, ?, ?)
		 ON CONFLICT(bucket, user_id) DO UPDATE SET upload = upload + excluded.upload, download = download + excluded.download`,
		bucket, userID, up, down,
	)
	return err
}

func (s *Store) RecordProtocolTrafficHourly(protocol string, up, down int64) error {
	if protocol == "" || (up <= 0 && down <= 0) {
		return nil
	}
	bucket := time.Now().UTC().Format("2006-01-02 15:00")
	_, err := s.db.Exec(
		`INSERT INTO traffic_protocol_hourly(bucket, protocol, upload, download) VALUES(?, ?, ?, ?)
		 ON CONFLICT(bucket, protocol) DO UPDATE SET upload = upload + excluded.upload, download = download + excluded.download`,
		bucket, protocol, up, down,
	)
	return err
}

func (s *Store) PruneOldTrafficHourly(keepDays int) error {
	if keepDays <= 0 {
		keepDays = 95
	}
	cutoff := time.Now().UTC().AddDate(0, 0, -keepDays).Format("2006-01-02 15:00")
	for _, tbl := range []string{"traffic_hourly", "traffic_user_hourly", "traffic_protocol_hourly"} {
		if _, err := s.db.Exec(`DELETE FROM `+tbl+` WHERE bucket < ?`, cutoff); err != nil {
			return err
		}
	}
	return nil
}

func NormalizeDashboardRange(r string) string {
	switch r {
	case "7d", "30d", "all":
		return r
	default:
		return "24h"
	}
}

func rangeSinceBucket(rangeKey string, now time.Time) (since string, days int, byDay bool) {
	now = now.UTC()
	switch NormalizeDashboardRange(rangeKey) {
	case "7d":
		startDay := now.Truncate(24*time.Hour).AddDate(0, 0, -6)
		return startDay.Format("2006-01-02") + " 00:00", 7, true
	case "30d":
		startDay := now.Truncate(24*time.Hour).AddDate(0, 0, -29)
		return startDay.Format("2006-01-02") + " 00:00", 30, true
	case "all":
		return "", 0, true
	default:
		startHour := now.Truncate(time.Hour).Add(-23 * time.Hour)
		return startHour.Format("2006-01-02 15:00"), 1, false
	}
}

func (s *Store) QueryTrafficSeries(rangeKey string) ([]model.TrafficPoint, error) {
	now := time.Now().UTC()
	norm := NormalizeDashboardRange(rangeKey)
	since, days, byDay := rangeSinceBucket(norm, now)

	if !byDay {
		return s.QueryTrafficHourly(24)
	}

	var (
		rows *sql.Rows
		err  error
	)
	if norm == "all" {
		rows, err = s.db.Query(
			`SELECT substr(bucket, 1, 10) AS day_bucket, SUM(upload), SUM(download)
			 FROM traffic_hourly
			 GROUP BY day_bucket
			 ORDER BY day_bucket ASC`,
		)
	} else {
		rows, err = s.db.Query(
			`SELECT substr(bucket, 1, 10) AS day_bucket, SUM(upload), SUM(download)
			 FROM traffic_hourly
			 WHERE bucket >= ?
			 GROUP BY day_bucket
			 ORDER BY day_bucket ASC`,
			since,
		)
	}
	if err != nil {
		return nil, err
	}
	defer rows.Close()

	byBucket := map[string]model.TrafficPoint{}
	earliestDay := ""
	for rows.Next() {
		var p model.TrafficPoint
		if err := rows.Scan(&p.Bucket, &p.Upload, &p.Download); err != nil {
			return nil, err
		}
		if earliestDay == "" || p.Bucket < earliestDay {
			earliestDay = p.Bucket
		}
		byBucket[p.Bucket] = p
	}
	if err := rows.Err(); err != nil {
		return nil, err
	}

	today := now.Truncate(24 * time.Hour)
	if norm == "all" {
		// Span from the earliest recorded day to today (minimum 7 days so the chart has a clean axis).
		startDay := today.AddDate(0, 0, -6)
		if earliestDay != "" {
			if parsed, parseErr := time.Parse("2006-01-02", earliestDay); parseErr == nil && parsed.Before(startDay) {
				startDay = parsed
			}
		}
		spanDays := int(today.Sub(startDay)/(24*time.Hour)) + 1
		if spanDays < 1 {
			spanDays = 1
		}
		out := make([]model.TrafficPoint, 0, spanDays)
		for d := startDay; !d.After(today); d = d.AddDate(0, 0, 1) {
			b := d.Format("2006-01-02")
			if p, ok := byBucket[b]; ok {
				out = append(out, p)
			} else {
				out = append(out, model.TrafficPoint{Bucket: b})
			}
		}
		return out, nil
	}

	out := make([]model.TrafficPoint, 0, days)
	for i := days - 1; i >= 0; i-- {
		b := today.AddDate(0, 0, -i).Format("2006-01-02")
		if p, ok := byBucket[b]; ok {
			out = append(out, p)
		} else {
			out = append(out, model.TrafficPoint{Bucket: b})
		}
	}
	return out, nil
}

func (s *Store) QueryNodeTrafficByRange(rangeKey string, limit int) ([]model.NodeTrafficStat, error) {
	if limit <= 0 {
		limit = 8
	}
	since, _, _ := rangeSinceBucket(rangeKey, time.Now().UTC())
	rows, err := s.db.Query(
		`SELECT t.node_id, COALESCE(n.name, '#' || t.node_id), COALESCE(n.region, ''),
		        SUM(t.upload) AS up_sum, SUM(t.download) AS down_sum
		 FROM traffic_hourly t
		 LEFT JOIN nodes n ON n.id = t.node_id
		 WHERE t.bucket >= ? AND t.node_id > 0
		 GROUP BY t.node_id
		 HAVING (up_sum + down_sum) > 0
		 ORDER BY (up_sum + down_sum) DESC
		 LIMIT ?`,
		since, limit,
	)
	if err != nil {
		return nil, err
	}
	defer rows.Close()

	out := []model.NodeTrafficStat{}
	for rows.Next() {
		var item model.NodeTrafficStat
		if err := rows.Scan(&item.NodeID, &item.NodeName, &item.Region, &item.Upload, &item.Download); err != nil {
			return nil, err
		}
		item.Total = item.Upload + item.Download
		out = append(out, item)
	}
	return out, rows.Err()
}

func (s *Store) QueryUserTrafficByRange(rangeKey string, limit int) ([]model.UserTrafficStat, error) {
	if limit <= 0 {
		limit = 8
	}
	since, _, _ := rangeSinceBucket(rangeKey, time.Now().UTC())
	rows, err := s.db.Query(
		`SELECT t.user_id, COALESCE(u.username, '#' || t.user_id),
		        SUM(t.upload) AS up_sum, SUM(t.download) AS down_sum
		 FROM traffic_user_hourly t
		 LEFT JOIN users u ON u.id = t.user_id
		 WHERE t.bucket >= ? AND t.user_id > 0
		 GROUP BY t.user_id
		 HAVING (up_sum + down_sum) > 0
		 ORDER BY (up_sum + down_sum) DESC
		 LIMIT ?`,
		since, limit,
	)
	if err != nil {
		return nil, err
	}
	defer rows.Close()

	out := []model.UserTrafficStat{}
	for rows.Next() {
		var item model.UserTrafficStat
		if err := rows.Scan(&item.UserID, &item.Username, &item.Upload, &item.Download); err != nil {
			return nil, err
		}
		item.Total = item.Upload + item.Download
		out = append(out, item)
	}
	return out, rows.Err()
}

func (s *Store) QueryProtocolTrafficByRange(rangeKey string) ([]model.ProtocolTrafficStat, error) {
	since, _, _ := rangeSinceBucket(rangeKey, time.Now().UTC())
	rows, err := s.db.Query(
		`SELECT protocol, SUM(upload) AS up_sum, SUM(download) AS down_sum
		 FROM traffic_protocol_hourly
		 WHERE bucket >= ? AND protocol != ''
		 GROUP BY protocol
		 HAVING (up_sum + down_sum) > 0
		 ORDER BY (up_sum + down_sum) DESC`,
		since,
	)
	if err != nil {
		return nil, err
	}
	defer rows.Close()

	out := []model.ProtocolTrafficStat{}
	for rows.Next() {
		var item model.ProtocolTrafficStat
		if err := rows.Scan(&item.Protocol, &item.Upload, &item.Download); err != nil {
			return nil, err
		}
		item.Total = item.Upload + item.Download
		out = append(out, item)
	}
	return out, rows.Err()
}

func (s *Store) QueryTrafficHourly(hours int) ([]model.TrafficPoint, error) {
	if hours <= 0 {
		hours = 24
	}
	since := time.Now().UTC().Add(-time.Duration(hours) * time.Hour).Format("2006-01-02 15:00")
	rows, err := s.db.Query(
		`SELECT bucket, SUM(upload), SUM(download) FROM traffic_hourly WHERE bucket >= ? GROUP BY bucket ORDER BY bucket ASC`,
		since,
	)
	if err != nil {
		return nil, err
	}
	defer rows.Close()

	byBucket := map[string]model.TrafficPoint{}
	for rows.Next() {
		var p model.TrafficPoint
		if err := rows.Scan(&p.Bucket, &p.Upload, &p.Download); err != nil {
			return nil, err
		}
		byBucket[p.Bucket] = p
	}
	if err := rows.Err(); err != nil {
		return nil, err
	}

	// Fill continuous hourly series so dashboard chart has no gaps
	out := make([]model.TrafficPoint, 0, hours)
	now := time.Now().UTC().Truncate(time.Hour)
	for i := hours - 1; i >= 0; i-- {
		b := now.Add(-time.Duration(i) * time.Hour).Format("2006-01-02 15:00")
		if p, ok := byBucket[b]; ok {
			out = append(out, p)
		} else {
			out = append(out, model.TrafficPoint{Bucket: b})
		}
	}
	return out, nil
}
