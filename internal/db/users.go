package db

import (
	"database/sql"
	"time"

	"github.com/mihob/mihob/internal/crypto"
	"github.com/mihob/mihob/internal/model"
)

func scanUser(row interface{ Scan(...any) error }) (*model.User, error) {
	var u model.User
	var enabled, allNodes int
	var expireAt sql.NullTime
	var templateID sql.NullInt64
	err := row.Scan(
		&u.ID, &u.Username, &u.Email, &u.UUID, &u.Password,
		&u.SSKey16, &u.SSKey32, &u.SubToken, &enabled, &allNodes,
		&u.TrafficLimit, &u.TrafficUsed, &u.UploadUsed, &u.DownloadUsed,
		&expireAt, &templateID, &u.Remark, &u.CreatedAt, &u.UpdatedAt,
	)
	if err != nil {
		return nil, err
	}
	u.Enabled = enabled == 1
	u.AllNodes = allNodes == 1
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
       enabled, all_nodes, traffic_limit, traffic_used, upload_used, download_used,
       expire_at, template_id, remark, created_at, updated_at
FROM users
`

func (s *Store) loadAllNodeIDs() ([]int64, error) {
	rows, err := s.db.Query(`SELECT id FROM nodes ORDER BY id ASC`)
	if err != nil {
		return nil, err
	}
	defer rows.Close()
	ids := []int64{}
	for rows.Next() {
		var nid int64
		if err := rows.Scan(&nid); err != nil {
			return nil, err
		}
		ids = append(ids, nid)
	}
	return ids, rows.Err()
}

func (s *Store) loadUserNodes(userID int64, allNodes bool) ([]int64, error) {
	if allNodes {
		return s.loadAllNodeIDs()
	}
	rows, err := s.db.Query(`SELECT node_id FROM user_nodes WHERE user_id = ? ORDER BY node_id ASC`, userID)
	if err != nil {
		return nil, err
	}
	defer rows.Close()
	ids := []int64{}
	for rows.Next() {
		var nid int64
		if err := rows.Scan(&nid); err != nil {
			return nil, err
		}
		ids = append(ids, nid)
	}
	return ids, rows.Err()
}

func (s *Store) ListUsers() ([]model.User, error) {
	rows, err := s.db.Query(userSelectSQL + ` ORDER BY id DESC`)
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
	for i := range out {
		ids, err := s.loadUserNodes(out[i].ID, out[i].AllNodes)
		if err != nil {
			return nil, err
		}
		out[i].NodeIDs = ids
	}
	return out, nil
}

func (s *Store) GetUser(id int64) (*model.User, error) {
	u, err := scanUser(s.db.QueryRow(userSelectSQL+` WHERE id = ?`, id))
	if err != nil {
		return nil, err
	}
	u.NodeIDs, err = s.loadUserNodes(u.ID, u.AllNodes)
	return u, err
}

func (s *Store) GetUserBySubToken(token string) (*model.User, error) {
	u, err := scanUser(s.db.QueryRow(userSelectSQL+` WHERE sub_token = ?`, token))
	if err != nil {
		return nil, err
	}
	u.NodeIDs, err = s.loadUserNodes(u.ID, u.AllNodes)
	return u, err
}

func (s *Store) GetUserByIdentifier(ident string) (*model.User, error) {
	u, err := scanUser(s.db.QueryRow(userSelectSQL+` WHERE username = ? OR uuid = ? LIMIT 1`, ident, ident))
	if err != nil {
		return nil, err
	}
	return u, nil
}

func (s *Store) ListUsersByNode(nodeID int64) ([]model.User, error) {
	rows, err := s.db.Query(
		`SELECT DISTINCT u.id, u.username, u.email, u.uuid, u.password, u.ss_key_16, u.ss_key_32, u.sub_token,
		        u.enabled, u.all_nodes, u.traffic_limit, u.traffic_used, u.upload_used, u.download_used,
		        u.expire_at, u.template_id, u.remark, u.created_at, u.updated_at
		 FROM users u
		 LEFT JOIN user_nodes un ON un.user_id = u.id AND un.node_id = ?
		 WHERE u.all_nodes = 1 OR un.node_id IS NOT NULL
		 ORDER BY u.id ASC`, nodeID,
	)
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

	tx, err := s.db.Begin()
	if err != nil {
		return err
	}
	defer func() { _ = tx.Rollback() }()

	res, err := tx.Exec(
		`INSERT INTO users(username, email, uuid, password, ss_key_16, ss_key_32, sub_token,
		 enabled, all_nodes, traffic_limit, expire_at, template_id, remark, created_at, updated_at)
		 VALUES(?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)`,
		u.Username, u.Email, u.UUID, u.Password, u.SSKey16, u.SSKey32, u.SubToken,
		boolToInt(u.Enabled), boolToInt(u.AllNodes), u.TrafficLimit, u.ExpireAt, u.TemplateID, u.Remark, now, now,
	)
	if err != nil {
		return err
	}
	u.ID, _ = res.LastInsertId()
	if !u.AllNodes {
		for _, nid := range u.NodeIDs {
			if _, err := tx.Exec(`INSERT OR IGNORE INTO user_nodes(user_id, node_id) VALUES(?, ?)`, u.ID, nid); err != nil {
				return err
			}
		}
	}
	if err := tx.Commit(); err != nil {
		return err
	}
	if u.AllNodes {
		u.NodeIDs, _ = s.loadAllNodeIDs()
	}
	u.CreatedAt = now
	u.UpdatedAt = now
	return nil
}

func (s *Store) UpdateUser(u *model.User) ([]int64, error) {
	allNodeIDs, _ := s.loadAllNodeIDs()

	tx, err := s.db.Begin()
	if err != nil {
		return nil, err
	}
	defer func() { _ = tx.Rollback() }()

	affected := map[int64]struct{}{}
	var prevAllNodes int
	_ = tx.QueryRow(`SELECT all_nodes FROM users WHERE id = ?`, u.ID).Scan(&prevAllNodes)
	if prevAllNodes == 1 || u.AllNodes {
		for _, nid := range allNodeIDs {
			affected[nid] = struct{}{}
		}
	}

	rows, err := tx.Query(`SELECT node_id FROM user_nodes WHERE user_id = ?`, u.ID)
	if err != nil {
		return nil, err
	}
	for rows.Next() {
		var nid int64
		if err := rows.Scan(&nid); err == nil {
			affected[nid] = struct{}{}
		}
	}
	_ = rows.Close()

	_, err = tx.Exec(
		`UPDATE users SET username=?, email=?, enabled=?, all_nodes=?, traffic_limit=?, expire_at=?, template_id=?, remark=?, updated_at=? WHERE id=?`,
		u.Username, u.Email, boolToInt(u.Enabled), boolToInt(u.AllNodes), u.TrafficLimit, u.ExpireAt, u.TemplateID, u.Remark, time.Now().UTC(), u.ID,
	)
	if err != nil {
		return nil, err
	}
	if _, err := tx.Exec(`DELETE FROM user_nodes WHERE user_id = ?`, u.ID); err != nil {
		return nil, err
	}
	if !u.AllNodes {
		for _, nid := range u.NodeIDs {
			affected[nid] = struct{}{}
			if _, err := tx.Exec(`INSERT OR IGNORE INTO user_nodes(user_id, node_id) VALUES(?, ?)`, u.ID, nid); err != nil {
				return nil, err
			}
		}
	}
	if err := tx.Commit(); err != nil {
		return nil, err
	}

	if u.AllNodes {
		u.NodeIDs = allNodeIDs
	}

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
		nids = u.NodeIDs
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
