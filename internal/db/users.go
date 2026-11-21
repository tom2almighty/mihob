package db

import (
	"database/sql"
	"encoding/json"
	"time"

	"github.com/mihob/mihob/internal/crypto"
	"github.com/mihob/mihob/internal/model"
)

func scanUser(row interface{ Scan(...any) error }) (*model.User, error) {
	var u model.User
	var enabled int
	var policyJSON string
	var expireAt sql.NullTime
	var templateID sql.NullInt64
	err := row.Scan(
		&u.ID, &u.Username, &u.Email, &u.UUID, &u.Password,
		&u.SSKey16, &u.SSKey32, &u.SubToken, &enabled, &policyJSON,
		&u.TrafficLimit, &u.TrafficUsed, &u.UploadUsed, &u.DownloadUsed,
		&expireAt, &templateID, &u.Remark, &u.CreatedAt, &u.UpdatedAt,
	)
	if err != nil {
		return nil, err
	}
	u.Enabled = enabled == 1
	if policyJSON != "" && policyJSON != "{}" {
		_ = json.Unmarshal([]byte(policyJSON), &u.AccessPolicy)
	}
	u.AccessPolicy.Normalize()
	if expireAt.Valid {
		t := expireAt.Time
		u.ExpireAt = &t
	}
	if templateID.Valid {
		v := templateID.Int64
		u.TemplateID = &v
	}
	u.NodeIDs = []int64{}
	return &u, nil
}

const userSelectSQL = `
SELECT id, username, email, uuid, password, ss_key_16, ss_key_32, sub_token,
       enabled, access_policy, traffic_limit, traffic_used, upload_used, download_used,
       expire_at, template_id, remark, created_at, updated_at
FROM users
`

func (s *Store) loadNodesAndInbounds() ([]model.Node, map[int64][]model.Inbound, error) {
	nodes, err := s.ListNodes()
	if err != nil {
		return nil, nil, err
	}
	allInbounds, err := s.ListAllInbounds()
	if err != nil {
		return nil, nil, err
	}
	byNode := make(map[int64][]model.Inbound, len(nodes))
	for _, inb := range allInbounds {
		byNode[inb.NodeID] = append(byNode[inb.NodeID], inb)
	}
	return nodes, byNode, nil
}

func populateUserAccessSummary(u *model.User, nodes []model.Node, inboundsByNode map[int64][]model.Inbound) {
	nodeIDs := make([]int64, 0, len(nodes))
	inboundCount := 0
	for i := range nodes {
		n := &nodes[i]
		if !u.AccessPolicy.MatchNode(n) {
			continue
		}
		ins := inboundsByNode[n.ID]
		matchedInbounds := 0
		for j := range ins {
			if !ins[j].Enabled {
				continue
			}
			if u.AccessPolicy.MatchInbound(&ins[j]) {
				matchedInbounds++
			}
		}
		// Include matched node in NodeIDs if inbound_mode is all or at least one inbound matches,
		// or node has no enabled inbounds yet (so users still see newly assigned nodes before protocols are added).
		if u.AccessPolicy.InboundMode == model.AccessModeAll || matchedInbounds > 0 || len(ins) == 0 {
			nodeIDs = append(nodeIDs, n.ID)
		}
		inboundCount += matchedInbounds
	}
	u.NodeIDs = nodeIDs
	u.InboundCount = inboundCount
}

func (s *Store) ListUsers() ([]model.User, error) {
	rows, err := s.db.Query(userSelectSQL + ` ORDER BY sort_order ASC, id DESC`)
	if err != nil {
		return nil, err
	}
	defer rows.Close()
	out := []model.User{}
	for rows.Next() {
		u, err := scanUser(rows)
		if err != nil {
			return nil, err
		}
		out = append(out, *u)
	}
	if err := rows.Err(); err != nil {
		return nil, err
	}
	nodes, byNode, err := s.loadNodesAndInbounds()
	if err != nil {
		return nil, err
	}
	for i := range out {
		populateUserAccessSummary(&out[i], nodes, byNode)
	}
	return out, nil
}

func (s *Store) ReorderUsers(ids []int64) error {
	tx, err := s.db.Begin()
	if err != nil {
		return err
	}
	defer func() { _ = tx.Rollback() }()
	for i, id := range ids {
		if _, err := tx.Exec(`UPDATE users SET sort_order = ? WHERE id = ?`, i+1, id); err != nil {
			return err
		}
	}
	return tx.Commit()
}

func (s *Store) GetUser(id int64) (*model.User, error) {
	u, err := scanUser(s.db.QueryRow(userSelectSQL+` WHERE id = ?`, id))
	if err != nil {
		return nil, err
	}
	nodes, byNode, err := s.loadNodesAndInbounds()
	if err != nil {
		return nil, err
	}
	populateUserAccessSummary(u, nodes, byNode)
	return u, nil
}

func (s *Store) GetUserBySubToken(token string) (*model.User, error) {
	u, err := scanUser(s.db.QueryRow(userSelectSQL+` WHERE sub_token = ?`, token))
	if err != nil {
		return nil, err
	}
	nodes, byNode, err := s.loadNodesAndInbounds()
	if err != nil {
		return nil, err
	}
	populateUserAccessSummary(u, nodes, byNode)
	return u, nil
}

func (s *Store) GetUserByIdentifier(ident string) (*model.User, error) {
	u, err := scanUser(s.db.QueryRow(userSelectSQL+` WHERE username = ? OR uuid = ? LIMIT 1`, ident, ident))
	if err != nil {
		return nil, err
	}
	return u, nil
}

func (s *Store) ListUsersByNode(nodeID int64) ([]model.User, error) {
	node, err := s.GetNode(nodeID)
	if err != nil {
		return nil, err
	}
	rows, err := s.db.Query(userSelectSQL + ` ORDER BY id ASC`)
	if err != nil {
		return nil, err
	}
	defer rows.Close()
	out := []model.User{}
	for rows.Next() {
		u, err := scanUser(rows)
		if err != nil {
			return nil, err
		}
		if u.AccessPolicy.MatchNode(node) {
			out = append(out, *u)
		}
	}
	return out, rows.Err()
}

func (s *Store) CreateUser(u *model.User) error {
	now := time.Now().UTC()
	if u.UUID == "" {
		u.UUID = crypto.NewUUID()
	}
	if u.Password == "" {
		u.Password = crypto.RandomToken(16)
	}
	if u.SSKey16 == "" {
		u.SSKey16 = crypto.RandomBase64(16)
	}
	if u.SSKey32 == "" {
		u.SSKey32 = crypto.RandomBase64(32)
	}
	if u.SubToken == "" {
		u.SubToken = crypto.RandomToken(20)
	}
	u.AccessPolicy.Normalize()
	if err := u.AccessPolicy.Validate(); err != nil {
		return err
	}
	policyBytes, err := json.Marshal(u.AccessPolicy)
	if err != nil {
		return err
	}

	res, err := s.db.Exec(
		`INSERT INTO users(username, email, uuid, password, ss_key_16, ss_key_32, sub_token,
		 enabled, access_policy, traffic_limit, expire_at, template_id, remark, created_at, updated_at)
		 VALUES(?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)`,
		u.Username, u.Email, u.UUID, u.Password, u.SSKey16, u.SSKey32, u.SubToken,
		boolToInt(u.Enabled), string(policyBytes), u.TrafficLimit, u.ExpireAt, u.TemplateID, u.Remark, now, now,
	)
	if err != nil {
		return err
	}
	u.ID, _ = res.LastInsertId()
	u.CreatedAt = now
	u.UpdatedAt = now
	if nodes, byNode, err := s.loadNodesAndInbounds(); err == nil {
		populateUserAccessSummary(u, nodes, byNode)
	}
	return nil
}

func (s *Store) UpdateUser(u *model.User) ([]int64, error) {
	u.AccessPolicy.Normalize()
	if err := u.AccessPolicy.Validate(); err != nil {
		return nil, err
	}
	nodes, byNode, err := s.loadNodesAndInbounds()
	if err != nil {
		return nil, err
	}

	affected := map[int64]struct{}{}
	if prev, err := s.GetUser(u.ID); err == nil {
		for _, n := range nodes {
			if prev.AccessPolicy.MatchNode(&n) {
				affected[n.ID] = struct{}{}
			}
		}
	}

	policyBytes, err := json.Marshal(u.AccessPolicy)
	if err != nil {
		return nil, err
	}

	_, err = s.db.Exec(
		`UPDATE users SET username=?, email=?, enabled=?, access_policy=?, traffic_limit=?, expire_at=?, template_id=?, remark=?, updated_at=? WHERE id=?`,
		u.Username, u.Email, boolToInt(u.Enabled), string(policyBytes), u.TrafficLimit, u.ExpireAt, u.TemplateID, u.Remark, time.Now().UTC(), u.ID,
	)
	if err != nil {
		return nil, err
	}

	for _, n := range nodes {
		if u.AccessPolicy.MatchNode(&n) {
			affected[n.ID] = struct{}{}
		}
	}
	populateUserAccessSummary(u, nodes, byNode)

	out := make([]int64, 0, len(affected))
	for nid := range affected {
		out = append(out, nid)
	}
	return out, nil
}

func (s *Store) DeleteUser(id int64) ([]int64, error) {
	u, err := s.GetUser(id)
	var nids []int64
	if err == nil && u != nil {
		if nodes, err := s.ListNodes(); err == nil {
			for i := range nodes {
				if u.AccessPolicy.MatchNode(&nodes[i]) {
					nids = append(nids, nodes[i].ID)
				}
			}
		}
	}
	_, err = s.db.Exec(`DELETE FROM users WHERE id = ?`, id)
	return nids, err
}

func (s *Store) ResetUserTraffic(id int64) error {
	_, err := s.db.Exec(
		`UPDATE users SET traffic_used=0, upload_used=0, download_used=0, updated_at=? WHERE id=?`,
		time.Now().UTC(), id,
	)
	return err
}

func (s *Store) RotateUserToken(id int64) (string, error) {
	tok := crypto.RandomToken(20)
	_, err := s.db.Exec(`UPDATE users SET sub_token=?, updated_at=? WHERE id=?`, tok, time.Now().UTC(), id)
	return tok, err
}

func (s *Store) AddUserTraffic(id, up, down int64) error {
	if up <= 0 && down <= 0 {
		return nil
	}
	_, err := s.db.Exec(
		`UPDATE users SET upload_used = upload_used + ?, download_used = download_used + ?, traffic_used = traffic_used + ?, updated_at = ? WHERE id = ?`,
		up, down, up+down, time.Now().UTC(), id,
	)
	return err
}
