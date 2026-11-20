package db

import (
	"database/sql"
	"encoding/json"
	"time"

	"github.com/mihob/mihob/internal/crypto"
	"github.com/mihob/mihob/internal/model"
)

func scanNode(row interface{ Scan(...any) error }) (*model.Node, error) {
	var n model.Node
	var enabled int
	var lastReset, expireAt, lastSeen sql.NullTime
	err := row.Scan(
		&n.ID, &n.Name, &n.Host, &n.Region, &n.Token, &enabled,
		&n.TrafficLimit, &n.TrafficUsed, &n.UploadUsed, &n.DownloadUsed,
		&n.TrafficMultiplier, &n.ResetDay, &lastReset, &expireAt, &n.BillingCycle, &n.Remark,
		&n.MihomoVersion, &n.AgentVersion, &n.ConfigHash, &n.ConfigStatus,
		&n.ConfigError, &lastSeen, &n.CreatedAt, &n.UpdatedAt, &n.InboundCount,
	)
	if err != nil {
		return nil, err
	}
	n.Enabled = enabled == 1
	if lastReset.Valid {
		t := lastReset.Time
		n.LastResetAt = &t
	}
	if expireAt.Valid {
		t := expireAt.Time
		n.ExpireAt = &t
	}
	if lastSeen.Valid {
		t := lastSeen.Time
		n.LastSeenAt = &t
	}
	return &n, nil
}

const nodeSelectSQL = `
SELECT n.id, n.name, n.host, n.region, n.token, n.enabled,
       n.traffic_limit, n.traffic_used, n.upload_used, n.download_used,
       n.traffic_multiplier, n.reset_day, n.last_reset_at, n.expire_at, n.billing_cycle, n.remark,
       n.mihomo_version, n.agent_version, n.config_hash, n.config_status,
       n.config_error, n.last_seen_at, n.created_at, n.updated_at,
       (SELECT COUNT(1) FROM inbounds i WHERE i.node_id = n.id) AS inbound_count
FROM nodes n
`

func (s *Store) ListNodes() ([]model.Node, error) {
	rows, err := s.db.Query(nodeSelectSQL + ` ORDER BY n.sort_order ASC, n.id DESC`)
	if err != nil {
		return nil, err
	}
	defer rows.Close()
	out := []model.Node{}
	for rows.Next() {
		n, err := scanNode(rows)
		if err != nil {
			return nil, err
		}
		out = append(out, *n)
	}
	return out, rows.Err()
}

func (s *Store) ReorderNodes(ids []int64) error {
	tx, err := s.db.Begin()
	if err != nil {
		return err
	}
	defer func() { _ = tx.Rollback() }()
	for i, id := range ids {
		if _, err := tx.Exec(`UPDATE nodes SET sort_order = ? WHERE id = ?`, i+1, id); err != nil {
			return err
		}
	}
	return tx.Commit()
}

func (s *Store) GetNode(id int64) (*model.Node, error) {
	return scanNode(s.db.QueryRow(nodeSelectSQL+` WHERE n.id = ?`, id))
}

func (s *Store) GetNodeByToken(token string) (*model.Node, error) {
	return scanNode(s.db.QueryRow(nodeSelectSQL+` WHERE n.token = ?`, token))
}

func (s *Store) CreateNode(n *model.Node) error {
	now := time.Now().UTC()
	if n.Token == "" {
		n.Token = crypto.RandomToken(24)
	}
	if n.TrafficMultiplier <= 0 {
		n.TrafficMultiplier = 1.0
	}
	if n.ResetDay < 1 || n.ResetDay > 31 {
		n.ResetDay = 1
	}
	res, err := s.db.Exec(
		`INSERT INTO nodes(name, host, region, token, enabled, traffic_limit, traffic_multiplier, reset_day, expire_at, billing_cycle, remark, config_status, created_at, updated_at)
		 VALUES(?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, 'pending', ?, ?)`,
		n.Name, n.Host, n.Region, n.Token, boolToInt(n.Enabled),
		n.TrafficLimit, n.TrafficMultiplier, n.ResetDay, n.ExpireAt, n.BillingCycle, n.Remark, now, now,
	)
	if err != nil {
		return err
	}
	n.ID, _ = res.LastInsertId()
	n.CreatedAt = now
	n.UpdatedAt = now
	n.ConfigStatus = "pending"
	return nil
}

func (s *Store) UpdateNode(n *model.Node) error {
	if n.TrafficMultiplier <= 0 {
		n.TrafficMultiplier = 1.0
	}
	if n.ResetDay < 1 || n.ResetDay > 31 {
		n.ResetDay = 1
	}
	now := time.Now().UTC()
	_, err := s.db.Exec(
		`UPDATE nodes SET name=?, host=?, region=?, enabled=?, traffic_limit=?, traffic_multiplier=?, reset_day=?, expire_at=?, billing_cycle=?, remark=?, updated_at=? WHERE id=?`,
		n.Name, n.Host, n.Region, boolToInt(n.Enabled),
		n.TrafficLimit, n.TrafficMultiplier, n.ResetDay, n.ExpireAt, n.BillingCycle, n.Remark, now, n.ID,
	)
	return err
}

func (s *Store) SetNodeTraffic(id, trafficUsed int64) error {
	if trafficUsed < 0 {
		trafficUsed = 0
	}
	now := time.Now().UTC()
	_, err := s.db.Exec(
		`UPDATE nodes SET traffic_used=?, upload_used=0, download_used=?, updated_at=? WHERE id=?`,
		trafficUsed, trafficUsed, now, id,
	)
	return err
}

func (s *Store) DeleteNode(id int64) error {
	_, err := s.db.Exec(`DELETE FROM nodes WHERE id = ?`, id)
	return err
}

func (s *Store) ResetNodeTraffic(id int64) error {
	now := time.Now().UTC()
	_, err := s.db.Exec(
		`UPDATE nodes SET traffic_used=0, upload_used=0, download_used=0, last_reset_at=?, updated_at=? WHERE id=?`,
		now, now, id,
	)
	return err
}

func (s *Store) RegenerateNodeToken(id int64) (string, error) {
	tok := crypto.RandomToken(24)
	_, err := s.db.Exec(`UPDATE nodes SET token=?, updated_at=? WHERE id=?`, tok, time.Now().UTC(), id)
	return tok, err
}

func (s *Store) UpdateNodeAgentInfo(id int64, agentVer, mihomoVer string) error {
	now := time.Now().UTC()
	_, err := s.db.Exec(
		`UPDATE nodes SET agent_version=?, mihomo_version=?, last_seen_at=?, updated_at=? WHERE id=?`,
		agentVer, mihomoVer, now, now, id,
	)
	return err
}

func (s *Store) TouchNodeSeen(id int64, mihomoVer string) error {
	now := time.Now().UTC()
	if mihomoVer != "" {
		_, err := s.db.Exec(`UPDATE nodes SET last_seen_at=?, mihomo_version=? WHERE id=?`, now, mihomoVer, id)
		return err
	}
	_, err := s.db.Exec(`UPDATE nodes SET last_seen_at=? WHERE id=?`, now, id)
	return err
}

func (s *Store) UpdateNodeConfigStatus(id int64, hash, status, errMsg string) error {
	_, err := s.db.Exec(
		`UPDATE nodes SET config_hash=?, config_status=?, config_error=?, updated_at=? WHERE id=?`,
		hash, status, errMsg, time.Now().UTC(), id,
	)
	return err
}

func (s *Store) AddNodeTraffic(id, up, down int64) error {
	if up <= 0 && down <= 0 {
		return nil
	}
	_, err := s.db.Exec(
		`UPDATE nodes SET upload_used = upload_used + ?, download_used = download_used + ?, traffic_used = traffic_used + ?, updated_at = ? WHERE id = ?`,
		up, down, up+down, time.Now().UTC(), id,
	)
	return err
}

// --- Inbounds ---

func scanInbound(row interface{ Scan(...any) error }) (*model.Inbound, error) {
	var in model.Inbound
	var certID sql.NullInt64
	var enabled int
	var settingsJSON string
	err := row.Scan(
		&in.ID, &in.NodeID, &in.Name, &in.Tag, &in.Protocol,
		&in.Listen, &in.Port, &certID, &enabled, &settingsJSON,
		&in.CreatedAt, &in.UpdatedAt,
	)
	if err != nil {
		return nil, err
	}
	if certID.Valid {
		v := certID.Int64
		in.CertID = &v
	}
	in.Enabled = enabled == 1
	_ = json.Unmarshal([]byte(settingsJSON), &in.Settings)
	return &in, nil
}

func (s *Store) ListInboundsByNode(nodeID int64) ([]model.Inbound, error) {
	rows, err := s.db.Query(
		`SELECT id, node_id, name, tag, protocol, listen, port, cert_id, enabled, settings, created_at, updated_at
		 FROM inbounds WHERE node_id = ? ORDER BY sort_order ASC, id ASC`, nodeID,
	)
	if err != nil {
		return nil, err
	}
	defer rows.Close()
	out := []model.Inbound{}
	for rows.Next() {
		in, err := scanInbound(rows)
		if err != nil {
			return nil, err
		}
		out = append(out, *in)
	}
	return out, rows.Err()
}

func (s *Store) ReorderInbounds(nodeID int64, ids []int64) error {
	tx, err := s.db.Begin()
	if err != nil {
		return err
	}
	defer func() { _ = tx.Rollback() }()
	for i, id := range ids {
		if _, err := tx.Exec(`UPDATE inbounds SET sort_order = ? WHERE id = ? AND node_id = ?`, i+1, id, nodeID); err != nil {
			return err
		}
	}
	return tx.Commit()
}

func (s *Store) GetInbound(id int64) (*model.Inbound, error) {
	return scanInbound(s.db.QueryRow(
		`SELECT id, node_id, name, tag, protocol, listen, port, cert_id, enabled, settings, created_at, updated_at
		 FROM inbounds WHERE id = ?`, id,
	))
}

func (s *Store) CreateInbound(in *model.Inbound) error {
	now := time.Now().UTC()
	if in.Listen == "" {
		in.Listen = "0.0.0.0"
	}
	b, err := json.Marshal(in.Settings)
	if err != nil {
		return err
	}
	res, err := s.db.Exec(
		`INSERT INTO inbounds(node_id, name, tag, protocol, listen, port, cert_id, enabled, settings, created_at, updated_at)
		 VALUES(?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)`,
		in.NodeID, in.Name, in.Tag, in.Protocol, in.Listen, in.Port,
		in.CertID, boolToInt(in.Enabled), string(b), now, now,
	)
	if err != nil {
		return err
	}
	in.ID, _ = res.LastInsertId()
	in.CreatedAt = now
	in.UpdatedAt = now
	return nil
}

func (s *Store) UpdateInbound(in *model.Inbound) error {
	if in.Listen == "" {
		in.Listen = "0.0.0.0"
	}
	b, err := json.Marshal(in.Settings)
	if err != nil {
		return err
	}
	_, err = s.db.Exec(
		`UPDATE inbounds SET name=?, tag=?, protocol=?, listen=?, port=?, cert_id=?, enabled=?, settings=?, updated_at=? WHERE id=?`,
		in.Name, in.Tag, in.Protocol, in.Listen, in.Port, in.CertID,
		boolToInt(in.Enabled), string(b), time.Now().UTC(), in.ID,
	)
	return err
}

func (s *Store) DeleteInbound(id int64) error {
	_, err := s.db.Exec(`DELETE FROM inbounds WHERE id = ?`, id)
	return err
}

func (s *Store) ListNodeIDsByCert(certID int64) ([]int64, error) {
	rows, err := s.db.Query(`SELECT DISTINCT node_id FROM inbounds WHERE cert_id = ?`, certID)
	if err != nil {
		return nil, err
	}
	defer rows.Close()
	var ids []int64
	for rows.Next() {
		var id int64
		if err := rows.Scan(&id); err != nil {
			return nil, err
		}
		ids = append(ids, id)
	}
	return ids, rows.Err()
}
