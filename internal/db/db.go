package db

import (
	"database/sql"
	"errors"
	"fmt"
	"os"
	"path/filepath"
	"time"

	_ "modernc.org/sqlite"

	"github.com/mihob/mihob/internal/crypto"
	"github.com/mihob/mihob/internal/model"
)

type Store struct {
	db *sql.DB
}

func Open(dbPath string) (*Store, error) {
	if err := os.MkdirAll(filepath.Dir(dbPath), 0o755); err != nil {
		return nil, fmt.Errorf("create db dir: %w", err)
	}
	dsn := fmt.Sprintf("file:%s?_pragma=journal_mode(WAL)&_pragma=busy_timeout(5000)&_pragma=foreign_keys(ON)", dbPath)
	sqlDB, err := sql.Open("sqlite", dsn)
	if err != nil {
		return nil, err
	}
	sqlDB.SetMaxOpenConns(1)
	if err := sqlDB.Ping(); err != nil {
		_ = sqlDB.Close()
		return nil, err
	}
	s := &Store{db: sqlDB}
	if err := s.migrate(); err != nil {
		_ = sqlDB.Close()
		return nil, err
	}
	return s, nil
}

func (s *Store) Close() error {
	return s.db.Close()
}

func (s *Store) migrate() error {
	schema := `
CREATE TABLE IF NOT EXISTS admins (
	id INTEGER PRIMARY KEY AUTOINCREMENT,
	username TEXT NOT NULL UNIQUE,
	password_hash TEXT NOT NULL,
	created_at DATETIME NOT NULL,
	updated_at DATETIME NOT NULL
);

CREATE TABLE IF NOT EXISTS settings (
	key TEXT PRIMARY KEY,
	value TEXT NOT NULL
);

CREATE TABLE IF NOT EXISTS certificates (
	id INTEGER PRIMARY KEY AUTOINCREMENT,
	name TEXT NOT NULL,
	domain TEXT NOT NULL,
	sans TEXT NOT NULL DEFAULT '[]',
	source TEXT NOT NULL DEFAULT 'manual',
	acme_provider TEXT NOT NULL DEFAULT '',
	acme_email TEXT NOT NULL DEFAULT '',
	acme_credentials TEXT NOT NULL DEFAULT '{}',
	cert_pem TEXT NOT NULL DEFAULT '',
	key_pem TEXT NOT NULL DEFAULT '',
	issuer TEXT NOT NULL DEFAULT '',
	not_before DATETIME,
	not_after DATETIME,
	auto_renew INTEGER NOT NULL DEFAULT 0,
	last_error TEXT NOT NULL DEFAULT '',
	created_at DATETIME NOT NULL,
	updated_at DATETIME NOT NULL
);

CREATE TABLE IF NOT EXISTS nodes (
	id INTEGER PRIMARY KEY AUTOINCREMENT,
	name TEXT NOT NULL,
	host TEXT NOT NULL,
	region TEXT NOT NULL DEFAULT '',
	token TEXT NOT NULL UNIQUE,
	enabled INTEGER NOT NULL DEFAULT 1,
	traffic_limit INTEGER NOT NULL DEFAULT 0,
	traffic_used INTEGER NOT NULL DEFAULT 0,
	upload_used INTEGER NOT NULL DEFAULT 0,
	download_used INTEGER NOT NULL DEFAULT 0,
	traffic_multiplier REAL NOT NULL DEFAULT 1.0,
	reset_day INTEGER NOT NULL DEFAULT 1,
	last_reset_at DATETIME,
	remark TEXT NOT NULL DEFAULT '',
	mihomo_version TEXT NOT NULL DEFAULT '',
	agent_version TEXT NOT NULL DEFAULT '',
	config_hash TEXT NOT NULL DEFAULT '',
	config_status TEXT NOT NULL DEFAULT 'pending',
	config_error TEXT NOT NULL DEFAULT '',
	last_seen_at DATETIME,
	created_at DATETIME NOT NULL,
	updated_at DATETIME NOT NULL
);

CREATE TABLE IF NOT EXISTS inbounds (
	id INTEGER PRIMARY KEY AUTOINCREMENT,
	node_id INTEGER NOT NULL,
	name TEXT NOT NULL,
	tag TEXT NOT NULL DEFAULT '',
	protocol TEXT NOT NULL,
	listen TEXT NOT NULL DEFAULT '0.0.0.0',
	port INTEGER NOT NULL,
	cert_id INTEGER,
	enabled INTEGER NOT NULL DEFAULT 1,
	settings TEXT NOT NULL DEFAULT '{}',
	created_at DATETIME NOT NULL,
	updated_at DATETIME NOT NULL,
	FOREIGN KEY(node_id) REFERENCES nodes(id) ON DELETE CASCADE,
	FOREIGN KEY(cert_id) REFERENCES certificates(id) ON DELETE SET NULL
);

CREATE TABLE IF NOT EXISTS templates (
	id INTEGER PRIMARY KEY AUTOINCREMENT,
	name TEXT NOT NULL,
	description TEXT NOT NULL DEFAULT '',
	content TEXT NOT NULL,
	is_default INTEGER NOT NULL DEFAULT 0,
	created_at DATETIME NOT NULL,
	updated_at DATETIME NOT NULL
);

CREATE TABLE IF NOT EXISTS users (
	id INTEGER PRIMARY KEY AUTOINCREMENT,
	username TEXT NOT NULL UNIQUE,
	email TEXT NOT NULL DEFAULT '',
	uuid TEXT NOT NULL UNIQUE,
	password TEXT NOT NULL,
	ss_key_16 TEXT NOT NULL,
	ss_key_32 TEXT NOT NULL,
	sub_token TEXT NOT NULL UNIQUE,
	enabled INTEGER NOT NULL DEFAULT 1,
	traffic_limit INTEGER NOT NULL DEFAULT 0,
	traffic_used INTEGER NOT NULL DEFAULT 0,
	upload_used INTEGER NOT NULL DEFAULT 0,
	download_used INTEGER NOT NULL DEFAULT 0,
	expire_at DATETIME,
	template_id INTEGER,
	remark TEXT NOT NULL DEFAULT '',
	created_at DATETIME NOT NULL,
	updated_at DATETIME NOT NULL,
	FOREIGN KEY(template_id) REFERENCES templates(id) ON DELETE SET NULL
);

CREATE TABLE IF NOT EXISTS user_nodes (
	user_id INTEGER NOT NULL,
	node_id INTEGER NOT NULL,
	PRIMARY KEY(user_id, node_id),
	FOREIGN KEY(user_id) REFERENCES users(id) ON DELETE CASCADE,
	FOREIGN KEY(node_id) REFERENCES nodes(id) ON DELETE CASCADE
);

CREATE TABLE IF NOT EXISTS traffic_hourly (
	bucket TEXT NOT NULL,
	node_id INTEGER NOT NULL DEFAULT 0,
	upload INTEGER NOT NULL DEFAULT 0,
	download INTEGER NOT NULL DEFAULT 0,
	PRIMARY KEY(bucket, node_id)
);

CREATE INDEX IF NOT EXISTS idx_inbounds_node ON inbounds(node_id);
CREATE INDEX IF NOT EXISTS idx_user_nodes_node ON user_nodes(node_id);
CREATE INDEX IF NOT EXISTS idx_traffic_hourly_bucket ON traffic_hourly(bucket);
`
	if _, err := s.db.Exec(schema); err != nil {
		return fmt.Errorf("migrate schema: %w", err)
	}
	return s.seedDefaults()
}

const DefaultMihomoTemplate = `# Mihob Default Mihomo Client Template
# 可使用占位符：
#   {{PROXIES}}      - 自动注入当前用户可用的所有代理节点
#   {{PROXY_NAMES}}  - 自动注入节点名称列表（用于策略组）
mixed-port: 7890
allow-lan: false
mode: rule
log-level: info
ipv6: true
unified-delay: true
tcp-concurrent: true

dns:
  enable: true
  enhanced-mode: fake-ip
  fake-ip-range: 198.18.0.1/16
  default-nameserver:
    - 223.5.5.5
    - 119.29.29.29
  nameserver:
    - https://doh.pub/dns-query
    - https://dns.alidns.com/dns-query

proxies:
{{PROXIES}}

proxy-groups:
  - name: "节点选择"
    type: select
    proxies:
      - "自动选择"
      - "故障转移"
{{PROXY_NAMES}}
      - DIRECT

  - name: "自动选择"
    type: url-test
    url: http://www.gstatic.com/generate_204
    interval: 300
    tolerance: 50
    proxies:
{{PROXY_NAMES}}

  - name: "故障转移"
    type: fallback
    url: http://www.gstatic.com/generate_204
    interval: 300
    proxies:
{{PROXY_NAMES}}

rules:
  - GEOIP,LAN,DIRECT,no-resolve
  - GEOIP,CN,DIRECT,no-resolve
  - MATCH,节点选择
`

func (s *Store) seedDefaults() error {
	now := time.Now().UTC()

	// Seed JWT secret if missing
	if _, err := s.GetSetting("jwt_secret"); errors.Is(err, sql.ErrNoRows) {
		if err := s.SetSetting("jwt_secret", crypto.RandomToken(32)); err != nil {
			return err
		}
	}
	if _, err := s.GetSetting("agent_image"); errors.Is(err, sql.ErrNoRows) {
		_ = s.SetSetting("agent_image", "ghcr.io/mihob/mihob-agent:latest")
	}
	if _, err := s.GetSetting("sub_path"); errors.Is(err, sql.ErrNoRows) {
		_ = s.SetSetting("sub_path", "sub")
	}

	// Seed default template if none exists
	var tmplCount int
	if err := s.db.QueryRow(`SELECT COUNT(1) FROM templates`).Scan(&tmplCount); err != nil {
		return err
	}
	if tmplCount == 0 {
		_, err := s.db.Exec(
			`INSERT INTO templates(name, description, content, is_default, created_at, updated_at) VALUES(?, ?, ?, 1, ?, ?)`,
			"默认分流模板",
			"内置 Mihomo 通用规则模板（含自动选择、故障转移、国内直连）",
			DefaultMihomoTemplate,
			now, now,
		)
		if err != nil {
			return err
		}
	}
	return nil
}

// EnsureAdmin creates an initial admin account if none exists and returns (created, initialPassword, err).
func (s *Store) EnsureAdmin(username, envPassword string) (bool, string, error) {
	var count int
	if err := s.db.QueryRow(`SELECT COUNT(1) FROM admins`).Scan(&count); err != nil {
		return false, "", err
	}
	if count > 0 {
		return false, "", nil
	}
	if username == "" {
		username = "admin"
	}
	pw := envPassword
	if pw == "" {
		pw = "mihob123456"
	}
	hash, err := crypto.HashPassword(pw)
	if err != nil {
		return false, "", err
	}
	now := time.Now().UTC()
	_, err = s.db.Exec(
		`INSERT INTO admins(username, password_hash, created_at, updated_at) VALUES(?, ?, ?, ?)`,
		username, hash, now, now,
	)
	if err != nil {
		return false, "", err
	}
	return true, pw, nil
}

func (s *Store) GetAdminByUsername(username string) (*model.Admin, error) {
	var a model.Admin
	err := s.db.QueryRow(
		`SELECT id, username, password_hash, created_at, updated_at FROM admins WHERE username = ?`,
		username,
	).Scan(&a.ID, &a.Username, &a.PasswordHash, &a.CreatedAt, &a.UpdatedAt)
	if err != nil {
		return nil, err
	}
	return &a, nil
}

func (s *Store) GetAdminByID(id int64) (*model.Admin, error) {
	var a model.Admin
	err := s.db.QueryRow(
		`SELECT id, username, password_hash, created_at, updated_at FROM admins WHERE id = ?`,
		id,
	).Scan(&a.ID, &a.Username, &a.PasswordHash, &a.CreatedAt, &a.UpdatedAt)
	if err != nil {
		return nil, err
	}
	return &a, nil
}

func (s *Store) UpdateAdminPassword(id int64, newPassword string) error {
	hash, err := crypto.HashPassword(newPassword)
	if err != nil {
		return err
	}
	_, err = s.db.Exec(
		`UPDATE admins SET password_hash = ?, updated_at = ? WHERE id = ?`,
		hash, time.Now().UTC(), id,
	)
	return err
}

func (s *Store) GetSetting(key string) (string, error) {
	var val string
	err := s.db.QueryRow(`SELECT value FROM settings WHERE key = ?`, key).Scan(&val)
	return val, err
}

func (s *Store) SetSetting(key, value string) error {
	_, err := s.db.Exec(
		`INSERT INTO settings(key, value) VALUES(?, ?) ON CONFLICT(key) DO UPDATE SET value = excluded.value`,
		key, value,
	)
	return err
}

func (s *Store) GetSystemSettings() (*model.SystemSettings, error) {
	out := &model.SystemSettings{
		AgentImage: "ghcr.io/mihob/mihob-agent:latest",
		SubPath:    "sub",
	}
	if v, err := s.GetSetting("hub_public_url"); err == nil {
		out.HubPublicURL = v
	}
	if v, err := s.GetSetting("acme_email"); err == nil {
		out.ACMEEmail = v
	}
	if v, err := s.GetSetting("agent_image"); err == nil && v != "" {
		out.AgentImage = v
	}
	if v, err := s.GetSetting("sub_path"); err == nil && v != "" {
		out.SubPath = v
	}
	return out, nil
}

func (s *Store) SaveSystemSettings(st *model.SystemSettings) error {
	if err := s.SetSetting("hub_public_url", st.HubPublicURL); err != nil {
		return err
	}
	if err := s.SetSetting("acme_email", st.ACMEEmail); err != nil {
		return err
	}
	if st.AgentImage != "" {
		if err := s.SetSetting("agent_image", st.AgentImage); err != nil {
			return err
		}
	}
	subPath := st.SubPath
	if subPath == "" {
		subPath = "sub"
	}
	if err := s.SetSetting("sub_path", subPath); err != nil {
		return err
	}
	return nil
}

func boolToInt(b bool) int {
	if b {
		return 1
	}
	return 0
}
