package db

import (
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
