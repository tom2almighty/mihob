package db

import (
	"database/sql"
	"encoding/json"
	"errors"
	"fmt"
	"os"
	"path/filepath"
	"strings"
	"time"

	_ "modernc.org/sqlite"

	"github.com/mihob/mihob/internal/crypto"
	"github.com/mihob/mihob/internal/model"
)

type Store struct {
	db   *sql.DB
	path string
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
	s := &Store{db: sqlDB, path: dbPath}
	if err := s.migrate(); err != nil {
		_ = sqlDB.Close()
		return nil, err
	}
	return s, nil
}

func (s *Store) Close() error {
	return s.db.Close()
}

// BackupTo writes a consistent single-file SQLite snapshot (WAL-safe) to dstPath.
func (s *Store) BackupTo(dstPath string) error {
	if err := os.MkdirAll(filepath.Dir(dstPath), 0o755); err != nil {
		return err
	}
	_ = os.Remove(dstPath)
	_, err := s.db.Exec(`VACUUM INTO ?`, dstPath)
	return err
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
	tags TEXT NOT NULL DEFAULT '[]',
	token TEXT NOT NULL UNIQUE,
	enabled INTEGER NOT NULL DEFAULT 1,
	traffic_limit INTEGER NOT NULL DEFAULT 0,
	traffic_used INTEGER NOT NULL DEFAULT 0,
	upload_used INTEGER NOT NULL DEFAULT 0,
	download_used INTEGER NOT NULL DEFAULT 0,
	traffic_multiplier REAL NOT NULL DEFAULT 1.0,
	reset_day INTEGER NOT NULL DEFAULT 1,
	last_reset_at DATETIME,
	expire_at DATETIME,
	billing_cycle TEXT NOT NULL DEFAULT '',
	remark TEXT NOT NULL DEFAULT '',
	server_template_id INTEGER,
	server_log_level TEXT NOT NULL DEFAULT '',
	server_ipv6 INTEGER,
	outbound_config TEXT NOT NULL DEFAULT '{}',
	extra_server_yaml TEXT NOT NULL DEFAULT '',
	mihomo_version TEXT NOT NULL DEFAULT '',
	agent_version TEXT NOT NULL DEFAULT '',
	config_hash TEXT NOT NULL DEFAULT '',
	config_status TEXT NOT NULL DEFAULT 'pending',
	config_error TEXT NOT NULL DEFAULT '',
	last_seen_at DATETIME,
	sort_order INTEGER NOT NULL DEFAULT 0,
	created_at DATETIME NOT NULL,
	updated_at DATETIME NOT NULL
);

CREATE TABLE IF NOT EXISTS inbounds (
	id INTEGER PRIMARY KEY AUTOINCREMENT,
	node_id INTEGER NOT NULL,
	name TEXT NOT NULL,
	tag TEXT NOT NULL DEFAULT '',
	tags TEXT NOT NULL DEFAULT '[]',
	protocol TEXT NOT NULL,
	listen TEXT NOT NULL DEFAULT '0.0.0.0',
	port INTEGER NOT NULL,
	cert_id INTEGER,
	enabled INTEGER NOT NULL DEFAULT 1,
	settings TEXT NOT NULL DEFAULT '{}',
	sort_order INTEGER NOT NULL DEFAULT 0,
	created_at DATETIME NOT NULL,
	updated_at DATETIME NOT NULL,
	FOREIGN KEY(node_id) REFERENCES nodes(id) ON DELETE CASCADE,
	FOREIGN KEY(cert_id) REFERENCES certificates(id) ON DELETE SET NULL
);

CREATE TABLE IF NOT EXISTS templates (
	id INTEGER PRIMARY KEY AUTOINCREMENT,
	kind TEXT NOT NULL DEFAULT 'client',
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
	access_policy TEXT NOT NULL DEFAULT '{}',
	traffic_limit INTEGER NOT NULL DEFAULT 0,
	traffic_used INTEGER NOT NULL DEFAULT 0,
	upload_used INTEGER NOT NULL DEFAULT 0,
	download_used INTEGER NOT NULL DEFAULT 0,
	expire_at DATETIME,
	template_id INTEGER,
	remark TEXT NOT NULL DEFAULT '',
	sort_order INTEGER NOT NULL DEFAULT 0,
	created_at DATETIME NOT NULL,
	updated_at DATETIME NOT NULL,
	FOREIGN KEY(template_id) REFERENCES templates(id) ON DELETE SET NULL
);

CREATE TABLE IF NOT EXISTS traffic_hourly (
	bucket TEXT NOT NULL,
	node_id INTEGER NOT NULL DEFAULT 0,
	upload INTEGER NOT NULL DEFAULT 0,
	download INTEGER NOT NULL DEFAULT 0,
	PRIMARY KEY(bucket, node_id)
);

CREATE TABLE IF NOT EXISTS traffic_user_hourly (
	bucket TEXT NOT NULL,
	user_id INTEGER NOT NULL DEFAULT 0,
	upload INTEGER NOT NULL DEFAULT 0,
	download INTEGER NOT NULL DEFAULT 0,
	PRIMARY KEY(bucket, user_id)
);

CREATE TABLE IF NOT EXISTS traffic_user_node_hourly (
	bucket TEXT NOT NULL,
	user_id INTEGER NOT NULL DEFAULT 0,
	node_id INTEGER NOT NULL DEFAULT 0,
	upload INTEGER NOT NULL DEFAULT 0,
	download INTEGER NOT NULL DEFAULT 0,
	PRIMARY KEY(bucket, user_id, node_id)
);

CREATE TABLE IF NOT EXISTS traffic_protocol_hourly (
	bucket TEXT NOT NULL,
	protocol TEXT NOT NULL,
	upload INTEGER NOT NULL DEFAULT 0,
	download INTEGER NOT NULL DEFAULT 0,
	PRIMARY KEY(bucket, protocol)
);

CREATE TABLE IF NOT EXISTS notification_channels (
	id INTEGER PRIMARY KEY AUTOINCREMENT,
	name TEXT NOT NULL,
	provider TEXT NOT NULL DEFAULT 'custom',
	url TEXT NOT NULL,
	enabled INTEGER NOT NULL DEFAULT 1,
	events TEXT NOT NULL DEFAULT '[]',
	remark TEXT NOT NULL DEFAULT '',
	created_at DATETIME NOT NULL,
	updated_at DATETIME NOT NULL
);

CREATE TABLE IF NOT EXISTS notification_schedules (
	id INTEGER PRIMARY KEY AUTOINCREMENT,
	name TEXT NOT NULL,
	enabled INTEGER NOT NULL DEFAULT 1,
	frequency TEXT NOT NULL DEFAULT 'daily',
	time_of_day TEXT NOT NULL DEFAULT '09:00',
	weekday INTEGER NOT NULL DEFAULT 1,
	day_of_month INTEGER NOT NULL DEFAULT 1,
	timezone TEXT NOT NULL DEFAULT 'Asia/Shanghai',
	traffic_display_mode TEXT NOT NULL DEFAULT 'used',
	include_summary INTEGER NOT NULL DEFAULT 1,
	include_node_traffic INTEGER NOT NULL DEFAULT 1,
	node_limit INTEGER NOT NULL DEFAULT 0,
	include_expiring INTEGER NOT NULL DEFAULT 1,
	include_top_users INTEGER NOT NULL DEFAULT 0,
	channel_ids TEXT NOT NULL DEFAULT '[]',
	last_run_at DATETIME,
	created_at DATETIME NOT NULL,
	updated_at DATETIME NOT NULL
);

CREATE TABLE IF NOT EXISTS notification_logs (
	id INTEGER PRIMARY KEY AUTOINCREMENT,
	event_type TEXT NOT NULL,
	channel_id INTEGER,
	channel_name TEXT NOT NULL DEFAULT '',
	title TEXT NOT NULL DEFAULT '',
	message TEXT NOT NULL DEFAULT '',
	status TEXT NOT NULL DEFAULT 'success',
	error TEXT NOT NULL DEFAULT '',
	created_at DATETIME NOT NULL
);

CREATE TABLE IF NOT EXISTS rule_sets (
	id INTEGER PRIMARY KEY AUTOINCREMENT,
	name TEXT NOT NULL UNIQUE,
	behavior TEXT NOT NULL DEFAULT 'domain',
	description TEXT NOT NULL DEFAULT '',
	rules_text TEXT NOT NULL DEFAULT '',
	rule_count INTEGER NOT NULL DEFAULT 0,
	mrs_size INTEGER NOT NULL DEFAULT 0,
	compiled_at DATETIME,
	last_error TEXT NOT NULL DEFAULT '',
	created_at DATETIME NOT NULL,
	updated_at DATETIME NOT NULL
);

CREATE INDEX IF NOT EXISTS idx_inbounds_node ON inbounds(node_id);
CREATE INDEX IF NOT EXISTS idx_traffic_hourly_bucket ON traffic_hourly(bucket);
CREATE INDEX IF NOT EXISTS idx_traffic_user_hourly_bucket ON traffic_user_hourly(bucket);
CREATE INDEX IF NOT EXISTS idx_traffic_user_node_hourly_bucket ON traffic_user_node_hourly(bucket);
CREATE INDEX IF NOT EXISTS idx_traffic_user_node_hourly_user ON traffic_user_node_hourly(user_id, bucket);
CREATE INDEX IF NOT EXISTS idx_traffic_user_node_hourly_node ON traffic_user_node_hourly(node_id, bucket);
CREATE INDEX IF NOT EXISTS idx_traffic_protocol_hourly_bucket ON traffic_protocol_hourly(bucket);
CREATE INDEX IF NOT EXISTS idx_notification_logs_created ON notification_logs(created_at DESC);
`
	if _, err := s.db.Exec(schema); err != nil {
		return fmt.Errorf("migrate schema: %w", err)
	}
	if err := s.ensureColumn("nodes", "expire_at", "DATETIME"); err != nil {
		return err
	}
	if err := s.ensureColumn("nodes", "billing_cycle", "TEXT NOT NULL DEFAULT ''"); err != nil {
		return err
	}
	if err := s.ensureColumn("nodes", "tags", "TEXT NOT NULL DEFAULT '[]'"); err != nil {
		return err
	}
	if err := s.ensureColumn("inbounds", "tags", "TEXT NOT NULL DEFAULT '[]'"); err != nil {
		return err
	}
	if err := s.ensureColumn("users", "access_policy", "TEXT NOT NULL DEFAULT '{}'"); err != nil {
		return err
	}
	if err := s.ensureColumn("nodes", "sort_order", "INTEGER NOT NULL DEFAULT 0"); err != nil {
		return err
	}
	if err := s.ensureColumn("inbounds", "sort_order", "INTEGER NOT NULL DEFAULT 0"); err != nil {
		return err
	}
	if err := s.ensureColumn("users", "sort_order", "INTEGER NOT NULL DEFAULT 0"); err != nil {
		return err
	}
	if err := s.ensureColumn("certificates", "sort_order", "INTEGER NOT NULL DEFAULT 0"); err != nil {
		return err
	}
	if err := s.ensureColumn("templates", "kind", "TEXT NOT NULL DEFAULT 'client'"); err != nil {
		return err
	}
	if err := s.ensureColumn("nodes", "server_template_id", "INTEGER"); err != nil {
		return err
	}
	if err := s.ensureColumn("nodes", "server_log_level", "TEXT NOT NULL DEFAULT ''"); err != nil {
		return err
	}
	if err := s.ensureColumn("nodes", "server_ipv6", "INTEGER"); err != nil {
		return err
	}
	if err := s.ensureColumn("nodes", "outbound_config", "TEXT NOT NULL DEFAULT '{}'"); err != nil {
		return err
	}
	if err := s.ensureColumn("nodes", "extra_server_yaml", "TEXT NOT NULL DEFAULT ''"); err != nil {
		return err
	}
	_, _ = s.db.Exec(`DROP TABLE IF EXISTS user_nodes`)
	return s.seedDefaults()
}

func (s *Store) ensureColumn(table, column, definition string) error {
	rows, err := s.db.Query(fmt.Sprintf(`PRAGMA table_info(%s)`, table))
	if err != nil {
		return fmt.Errorf("pragma table_info(%s): %w", table, err)
	}
	defer rows.Close()
	for rows.Next() {
		var cid int
		var name, colType string
		var notNull int
		var dfltValue sql.NullString
		var pk int
		if err := rows.Scan(&cid, &name, &colType, &notNull, &dfltValue, &pk); err != nil {
			return err
		}
		if name == column {
			return nil
		}
	}
	if err := rows.Err(); err != nil {
		return err
	}
	if _, err := s.db.Exec(fmt.Sprintf(`ALTER TABLE %s ADD COLUMN %s %s`, table, column, definition)); err != nil {
		return fmt.Errorf("alter table %s add column %s: %w", table, column, err)
	}
	return nil
}

const DefaultMihomoTemplate = `mixed-port: 7890
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
  - name: "Proxy"
    type: select
    proxies:
      - "Auto"
      - "Fallback"
{{PROXY_NAMES}}
      - DIRECT

  - name: "Auto"
    type: url-test
    url: http://www.gstatic.com/generate_204
    interval: 300
    tolerance: 50
    proxies:
{{PROXY_NAMES}}

  - name: "Fallback"
    type: fallback
    url: http://www.gstatic.com/generate_204
    interval: 300
    proxies:
{{PROXY_NAMES}}

rules:
  - GEOIP,LAN,DIRECT,no-resolve
  - GEOIP,CN,DIRECT,no-resolve
  - MATCH,Proxy
`

const DefaultServerMihomoTemplate = `mode: direct
log-level: info
ipv6: true
allow-lan: false
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
		_ = s.SetSetting("agent_image", "ghcr.io/tom2almighty/mihob-agent:latest")
	}
	if _, err := s.GetSetting("sub_path"); errors.Is(err, sql.ErrNoRows) {
		_ = s.SetSetting("sub_path", "sub")
	}
	if _, err := s.GetOrCreateRelayUser(); err != nil {
		return err
	}

	// Seed default client template if none exists
	var clientTmplCount int
	if err := s.db.QueryRow(`SELECT COUNT(1) FROM templates WHERE kind = 'client'`).Scan(&clientTmplCount); err != nil {
		return err
	}
	if clientTmplCount == 0 {
		_, err := s.db.Exec(
			`INSERT INTO templates(kind, name, description, content, is_default, created_at, updated_at) VALUES('client', ?, ?, ?, 1, ?, ?)`,
			"Default Client",
			"",
			DefaultMihomoTemplate,
			now, now,
		)
		if err != nil {
			return err
		}
	}

	// Seed default server template if none exists
	var serverTmplCount int
	if err := s.db.QueryRow(`SELECT COUNT(1) FROM templates WHERE kind = 'server'`).Scan(&serverTmplCount); err != nil {
		return err
	}
	if serverTmplCount == 0 {
		_, err := s.db.Exec(
			`INSERT INTO templates(kind, name, description, content, is_default, created_at, updated_at) VALUES('server', ?, ?, ?, 1, ?, ?)`,
			"Default Server",
			"",
			DefaultServerMihomoTemplate,
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
		pw = crypto.RandomToken(12)
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
		AgentImage: "ghcr.io/tom2almighty/mihob-agent:latest",
		SubPath:    "sub",
		GeoXURLs:   model.DefaultGeoXURLs(),
	}
	if v, err := s.GetSetting("hub_public_url"); err == nil {
		out.HubPublicURL = v
	}
	if v, err := s.GetSetting("site_title"); err == nil {
		out.SiteTitle = v
	}
	if v, err := s.GetSetting("site_description"); err == nil {
		out.SiteDescription = v
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
	if v, err := s.GetSetting("github_token"); err == nil {
		out.GitHubToken = v
	}
	if v, err := s.GetSetting("github_proxy"); err == nil {
		out.GitHubProxy = v
	}
	if raw, err := s.GetSetting("geox_urls"); err == nil && raw != "" {
		var parsed model.GeoXURLs
		if json.Unmarshal([]byte(raw), &parsed) == nil {
			def := model.DefaultGeoXURLs()
			if strings.TrimSpace(parsed.GeoSite) != "" {
				out.GeoXURLs.GeoSite = strings.TrimSpace(parsed.GeoSite)
			} else {
				out.GeoXURLs.GeoSite = def.GeoSite
			}
			if strings.TrimSpace(parsed.GeoIP) != "" {
				out.GeoXURLs.GeoIP = strings.TrimSpace(parsed.GeoIP)
			} else {
				out.GeoXURLs.GeoIP = def.GeoIP
			}
			if strings.TrimSpace(parsed.MMDB) != "" {
				out.GeoXURLs.MMDB = strings.TrimSpace(parsed.MMDB)
			} else {
				out.GeoXURLs.MMDB = def.MMDB
			}
			if strings.TrimSpace(parsed.ASN) != "" {
				out.GeoXURLs.ASN = strings.TrimSpace(parsed.ASN)
			} else {
				out.GeoXURLs.ASN = def.ASN
			}
		}
	}
	return out, nil
}

func (s *Store) SaveSystemSettings(st *model.SystemSettings) error {
	if err := s.SetSetting("hub_public_url", st.HubPublicURL); err != nil {
		return err
	}
	if err := s.SetSetting("site_title", st.SiteTitle); err != nil {
		return err
	}
	if err := s.SetSetting("site_description", st.SiteDescription); err != nil {
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
	if err := s.SetSetting("github_token", st.GitHubToken); err != nil {
		return err
	}
	if err := s.SetSetting("github_proxy", st.GitHubProxy); err != nil {
		return err
	}
	def := model.DefaultGeoXURLs()
	geo := st.GeoXURLs
	if strings.TrimSpace(geo.GeoSite) == "" {
		geo.GeoSite = def.GeoSite
	}
	if strings.TrimSpace(geo.GeoIP) == "" {
		geo.GeoIP = def.GeoIP
	}
	if strings.TrimSpace(geo.MMDB) == "" {
		geo.MMDB = def.MMDB
	}
	if strings.TrimSpace(geo.ASN) == "" {
		geo.ASN = def.ASN
	}
	if raw, err := json.Marshal(geo); err == nil {
		if err := s.SetSetting("geox_urls", string(raw)); err != nil {
			return err
		}
	}
	return nil
}

func (s *Store) GetThemeConfig() (*model.ThemeConfig, error) {
	out := &model.ThemeConfig{
		ActiveThemeID: "default",
		CustomThemes:  []model.CustomTheme{},
	}
	raw, err := s.GetSetting("theme_config")
	if err != nil {
		if errors.Is(err, sql.ErrNoRows) {
			return out, nil
		}
		return nil, err
	}
	if raw == "" {
		return out, nil
	}
	if err := json.Unmarshal([]byte(raw), out); err != nil {
		return &model.ThemeConfig{
			ActiveThemeID: "default",
			CustomThemes:  []model.CustomTheme{},
		}, nil
	}
	if out.ActiveThemeID == "" {
		out.ActiveThemeID = "default"
	}
	if out.CustomThemes == nil {
		out.CustomThemes = []model.CustomTheme{}
	}
	return out, nil
}

func (s *Store) SaveThemeConfig(cfg *model.ThemeConfig) error {
	if cfg == nil {
		cfg = &model.ThemeConfig{
			ActiveThemeID: "default",
			CustomThemes:  []model.CustomTheme{},
		}
	}
	if cfg.ActiveThemeID == "" {
		cfg.ActiveThemeID = "default"
	}
	if cfg.CustomThemes == nil {
		cfg.CustomThemes = []model.CustomTheme{}
	}
	b, err := json.Marshal(cfg)
	if err != nil {
		return err
	}
	return s.SetSetting("theme_config", string(b))
}

func (s *Store) GetOrCreateRelayUser() (*model.User, error) {
	if raw, err := s.GetSetting("relay_credential"); err == nil && raw != "" {
		var u model.User
		if json.Unmarshal([]byte(raw), &u) == nil && u.Username != "" && u.UUID != "" && u.Password != "" {
			u.Enabled = true
			return &u, nil
		}
	}
	u := model.User{
		Username: model.RelayUsername,
		UUID:     crypto.NewUUID(),
		Password: crypto.RandomToken(32),
		SSKey16:  crypto.RandomBase64(16),
		SSKey32:  crypto.RandomBase64(32),
		Enabled:  true,
	}
	b, err := json.Marshal(&u)
	if err != nil {
		return nil, err
	}
	if err := s.SetSetting("relay_credential", string(b)); err != nil {
		return nil, err
	}
	return &u, nil
}

func boolToInt(b bool) int {
	if b {
		return 1
	}
	return 0
}
