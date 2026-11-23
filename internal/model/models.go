package model

import "time"

const (
	ProtoVLESS       = "vless"
	ProtoVMess       = "vmess"
	ProtoTrojan      = "trojan"
	ProtoHysteria2   = "hysteria2"
	ProtoTUIC        = "tuic"
	ProtoAnyTLS      = "anytls"
	ProtoShadowsocks = "shadowsocks"
	ProtoMieru       = "mieru"
	ProtoTrustTunnel = "trusttunnel"
	ProtoShadowQuic  = "shadowquic"
	ProtoSnell       = "snell"
	ProtoSudoku      = "sudoku"
	ProtoHTTP        = "http"
	ProtoSocks       = "socks"
	ProtoMixed       = "mixed"
)

var SupportedProtocols = []string{
	ProtoVLESS,
	ProtoVMess,
	ProtoTrojan,
	ProtoHysteria2,
	ProtoTUIC,
	ProtoAnyTLS,
	ProtoShadowsocks,
	ProtoMieru,
	ProtoTrustTunnel,
	ProtoShadowQuic,
	ProtoSnell,
	ProtoSudoku,
	ProtoHTTP,
	ProtoSocks,
	ProtoMixed,
}

func IsValidProtocol(p string) bool {
	for _, s := range SupportedProtocols {
		if s == p {
			return true
		}
	}
	return false
}

const (
	TemplateKindClient = "client"
	TemplateKindServer = "server"
	RelayUsername      = "_mihob_relay"
)

func NormalizeTemplateKind(kind string) string {
	if kind == TemplateKindServer {
		return TemplateKindServer
	}
	return TemplateKindClient
}

func IsValidServerLogLevel(level string) bool {
	switch level {
	case "", "silent", "error", "warning", "info", "debug":
		return true
	default:
		return false
	}
}

type Admin struct {
	ID           int64     `json:"id"`
	Username     string    `json:"username"`
	PasswordHash string    `json:"-"`
	CreatedAt    time.Time `json:"created_at"`
	UpdatedAt    time.Time `json:"updated_at"`
}

type Node struct {
	ID                int64      `json:"id"`
	Name              string     `json:"name"`
	Host              string     `json:"host"`
	Region            string     `json:"region"`
	Tags              []string   `json:"tags"`
	Token             string     `json:"token"`
	Enabled           bool       `json:"enabled"`
	TrafficLimit      int64      `json:"traffic_limit"`
	TrafficUsed       int64      `json:"traffic_used"`
	UploadUsed        int64      `json:"upload_used"`
	DownloadUsed      int64      `json:"download_used"`
	TrafficMultiplier float64    `json:"traffic_multiplier"`
	ResetDay          int        `json:"reset_day"`
	LastResetAt       *time.Time `json:"last_reset_at"`
	ExpireAt          *time.Time `json:"expire_at"`
	BillingCycle      string     `json:"billing_cycle"`
	Remark            string     `json:"remark"`
	ServerTemplateID  *int64     `json:"server_template_id"`
	ServerLogLevel    string     `json:"server_log_level"`
	ServerIPv6        *bool      `json:"server_ipv6"`
	ExtraServerYAML   string     `json:"extra_server_yaml"`
	MihomoVersion     string     `json:"mihomo_version"`
	AgentVersion      string     `json:"agent_version"`
	ConfigHash        string     `json:"config_hash"`
	ConfigStatus      string     `json:"config_status"`
	ConfigError       string     `json:"config_error"`
	LastSeenAt        *time.Time `json:"last_seen_at"`
	CreatedAt         time.Time  `json:"created_at"`
	UpdatedAt         time.Time  `json:"updated_at"`

	// Runtime fields populated from WS manager
	Online            bool    `json:"online"`
	MihomoRunning     bool    `json:"mihomo_running"`
	OS                string  `json:"os,omitempty"`
	Arch              string  `json:"arch,omitempty"`
	UpgradeStatus     string  `json:"upgrade_status,omitempty"` // "" | "upgrading" | "success" | "error"
	UpgradeError      string  `json:"upgrade_error,omitempty"`
	UpgradeTarget     string  `json:"upgrade_target,omitempty"`
	CPUPercent        float64 `json:"cpu_percent"`
	MemUsed           uint64  `json:"mem_used"`
	MemTotal          uint64  `json:"mem_total"`
	ActiveConnections int     `json:"active_connections"`
	UpRate            int64   `json:"up_rate"`
	DownRate          int64   `json:"down_rate"`
	InboundCount      int     `json:"inbound_count"`
}

type InboundSettings struct {
	// Custom client proxy display name (overrides "<NodeName> · <Tag>" when non-empty)
	ProxyName string `json:"proxy_name,omitempty"`

	// Client endpoint overrides (for Cloudflare Tunnel / CDN / reverse proxy)
	ClientServer string `json:"client_server,omitempty"`
	ClientPort   int    `json:"client_port,omitempty"`
	ClientTLS    bool   `json:"client_tls,omitempty"`

	// Security: "none" | "tls" | "reality"
	Security          string   `json:"security,omitempty"`
	SNI               string   `json:"sni,omitempty"`
	ALPN              []string `json:"alpn,omitempty"`
	SkipCertVerify    bool     `json:"skip_cert_verify,omitempty"`
	ClientFingerprint string   `json:"client_fingerprint,omitempty"`
	ECHKey            string   `json:"ech_key,omitempty"`
	ECHEnable         bool     `json:"ech_enable,omitempty"`
	ECHConfig         string   `json:"ech_config,omitempty"`
	ClientAuthType    string   `json:"client_auth_type,omitempty"`
	ClientAuthCert    string   `json:"client_auth_cert,omitempty"`

	// Common listener overrides
	PortRange     string `json:"port_range,omitempty"`
	RoutingMark   int    `json:"routing_mark,omitempty"`
	ListenerRule  string `json:"listener_rule,omitempty"`
	ListenerProxy string `json:"listener_proxy,omitempty"`

	// Transport for vless/vmess/trojan: "tcp" | "ws" | "grpc" | "xhttp"
	Network           string `json:"network,omitempty"`
	WSPath            string `json:"ws_path,omitempty"`
	WSHost            string `json:"ws_host,omitempty"`
	GRPCServiceName   string `json:"grpc_service_name,omitempty"`
	XHTTPPath         string `json:"xhttp_path,omitempty"`
	XHTTPMode         string `json:"xhttp_mode,omitempty"`
	XHTTPHost         string `json:"xhttp_host,omitempty"`
	XHTTPNoSSEHeader  bool   `json:"xhttp_no_sse_header,omitempty"`
	XHTTPPaddingBytes string `json:"xhttp_x_padding_bytes,omitempty"`

	// Reality
	RealityDest        string   `json:"reality_dest,omitempty"`
	RealityServerNames []string `json:"reality_server_names,omitempty"`
	RealityPrivateKey  string   `json:"reality_private_key,omitempty"`
	RealityPublicKey   string   `json:"reality_public_key,omitempty"`
	RealityShortIDs    []string `json:"reality_short_ids,omitempty"`

	// VLESS
	Flow            string `json:"flow,omitempty"`
	VLESSDecryption string `json:"vless_decryption,omitempty"`
	VLESSEncryption string `json:"vless_encryption,omitempty"`

	// VMess
	AlterID int    `json:"alter_id,omitempty"`
	Cipher  string `json:"cipher,omitempty"`

	// Hysteria2 / QUIC shared
	UpMbps                int    `json:"up_mbps,omitempty"`
	DownMbps              int    `json:"down_mbps,omitempty"`
	IgnoreClientBandwidth bool   `json:"ignore_client_bandwidth,omitempty"`
	Obfs                  string `json:"obfs,omitempty"`
	ObfsPassword          string `json:"obfs_password,omitempty"`
	Masquerade            string `json:"masquerade,omitempty"`
	HopPorts              string `json:"hop_ports,omitempty"`
	BBRProfile            string `json:"bbr_profile,omitempty"`

	// TUIC v5 / TrustTunnel / ShadowQUIC / Hysteria2 shared
	CongestionController string `json:"congestion_controller,omitempty"`
	CWND                 int    `json:"cwnd,omitempty"`
	MaxIdleTime          int    `json:"max_idle_time,omitempty"`
	UDPRelayMode         string `json:"udp_relay_mode,omitempty"`

	// AnyTLS
	PaddingScheme string `json:"padding_scheme,omitempty"`

	// Shadowsocks
	SSCipher         string `json:"ss_cipher,omitempty"`
	SSServerPassword string `json:"ss_server_password,omitempty"`
	UDP              bool   `json:"udp,omitempty"`

	// Mieru
	MieruTransport         string `json:"mieru_transport,omitempty"`       // "TCP" | "UDP"
	MieruPortRange         string `json:"mieru_port_range,omitempty"`      // e.g. "20000-20010"
	MieruMultiplexing      string `json:"mieru_multiplexing,omitempty"`    // MULTIPLEXING_OFF | LOW | MIDDLE | HIGH
	MieruHandshakeMode     string `json:"mieru_handshake_mode,omitempty"`  // HANDSHAKE_STANDARD | HANDSHAKE_NO_WAIT
	MieruTrafficPattern    string `json:"mieru_traffic_pattern,omitempty"`
	MieruTCPIdleTimeout    int    `json:"mieru_tcp_idle_timeout,omitempty"` // >= 60s
	MieruUserHintMandatory bool   `json:"mieru_user_hint_mandatory,omitempty"`

	// TrustTunnel
	TrustTunnelNetwork        string `json:"trusttunnel_network,omitempty"` // "both" | "tcp" | "udp" (legacy "quic")
	TrustTunnelMaxConnections int    `json:"trusttunnel_max_connections,omitempty"`
	TrustTunnelMinStreams     int    `json:"trusttunnel_min_streams,omitempty"`
	TrustTunnelMaxStreams     int    `json:"trusttunnel_max_streams,omitempty"`
	NameCertVerify            string `json:"name_cert_verify,omitempty"`

	// ShadowQUIC
	ShadowQuicJLSAddr  string `json:"shadowquic_jls_addr,omitempty"` // e.g. "www.microsoft.com:443"
	ShadowQuicJLSSNI   string `json:"shadowquic_jls_sni,omitempty"`
	ShadowQuicJLSProxy string `json:"shadowquic_jls_proxy,omitempty"`
	ShadowQuicZeroRTT  bool   `json:"shadowquic_zero_rtt,omitempty"`

	// Snell (single-PSK)
	SnellPSK      string `json:"snell_psk,omitempty"`
	SnellVersion  int    `json:"snell_version,omitempty"` // 1..6 (default 4)
	SnellMode     string `json:"snell_mode,omitempty"`    // v6 only: default | unshaped | unsafe-raw
	SnellObfsMode string `json:"snell_obfs_mode,omitempty"`
	SnellObfsHost string `json:"snell_obfs_host,omitempty"`

	// Sudoku (single-key)
	SudokuKey                string `json:"sudoku_key,omitempty"`
	SudokuAEADMethod         string `json:"sudoku_aead_method,omitempty"`
	SudokuTableType          string `json:"sudoku_table_type,omitempty"`
	SudokuCustomTable        string `json:"sudoku_custom_table,omitempty"`
	SudokuMultiplex          string `json:"sudoku_multiplex,omitempty"`
	SudokuPaddingMin         *int   `json:"sudoku_padding_min,omitempty"`
	SudokuPaddingMax         *int   `json:"sudoku_padding_max,omitempty"`
	SudokuEnablePureDownlink *bool  `json:"sudoku_enable_pure_downlink,omitempty"`
	SudokuDisableHTTPMask    bool   `json:"sudoku_disable_http_mask,omitempty"`
	SudokuHTTPMaskMode       string `json:"sudoku_http_mask_mode,omitempty"`
	SudokuHTTPMaskTLS        bool   `json:"sudoku_http_mask_tls,omitempty"`
	SudokuHTTPMaskHost       string `json:"sudoku_http_mask_host,omitempty"`
	SudokuPathRoot           string `json:"sudoku_path_root,omitempty"`
	SudokuFallback           string `json:"sudoku_fallback,omitempty"`

	// Advanced YAML Deep Merge Overrides
	ExtraServerYAML string `json:"extra_server_yaml,omitempty"`
	ExtraClientYAML string `json:"extra_client_yaml,omitempty"`
}

type Inbound struct {
	ID        int64           `json:"id"`
	NodeID    int64           `json:"node_id"`
	Name      string          `json:"name"`
	Tag       string          `json:"tag"`
	Tags      []string        `json:"tags"`
	Protocol  string          `json:"protocol"`
	Listen    string          `json:"listen"`
	Port      int             `json:"port"`
	CertID    *int64          `json:"cert_id"`
	Enabled   bool            `json:"enabled"`
	Settings  InboundSettings `json:"settings"`
	CreatedAt time.Time       `json:"created_at"`
	UpdatedAt time.Time       `json:"updated_at"`
}

type Certificate struct {
	ID              int64             `json:"id"`
	Name            string            `json:"name"`
	Domain          string            `json:"domain"`
	SANs            []string          `json:"sans"`
	Source          string            `json:"source"` // "self_signed" | "manual" | "acme"
	ACMEProvider    string            `json:"acme_provider,omitempty"`
	ACMEEmail       string            `json:"acme_email,omitempty"`
	ACMECredentials map[string]string `json:"acme_credentials,omitempty"`
	CertPEM         string            `json:"cert_pem,omitempty"`
	KeyPEM          string            `json:"key_pem,omitempty"`
	Issuer          string            `json:"issuer"`
	NotBefore       *time.Time        `json:"not_before"`
	NotAfter        *time.Time        `json:"not_after"`
	AutoRenew       bool              `json:"auto_renew"`
	LastError       string            `json:"last_error"`
	CreatedAt       time.Time         `json:"created_at"`
	UpdatedAt       time.Time         `json:"updated_at"`
}

type User struct {
	ID           int64        `json:"id"`
	Username     string       `json:"username"`
	Email        string       `json:"email"`
	UUID         string       `json:"uuid"`
	Password     string       `json:"password"`
	SSKey16      string       `json:"ss_key_16"`
	SSKey32      string       `json:"ss_key_32"`
	SubToken     string       `json:"sub_token"`
	Enabled      bool         `json:"enabled"`
	AccessPolicy AccessPolicy `json:"access_policy"`
	TrafficLimit int64        `json:"traffic_limit"`
	TrafficUsed  int64        `json:"traffic_used"`
	UploadUsed   int64        `json:"upload_used"`
	DownloadUsed int64        `json:"download_used"`
	ExpireAt     *time.Time   `json:"expire_at"`
	TemplateID   *int64       `json:"template_id"`
	NodeIDs      []int64      `json:"node_ids"`
	InboundCount int          `json:"inbound_count"`
	Remark       string       `json:"remark"`
	CreatedAt    time.Time    `json:"created_at"`
	UpdatedAt    time.Time    `json:"updated_at"`
}

func (u *User) IsActive(now time.Time) bool {
	if !u.Enabled {
		return false
	}
	if u.ExpireAt != nil && now.After(*u.ExpireAt) {
		return false
	}
	if u.TrafficLimit > 0 && u.TrafficUsed >= u.TrafficLimit {
		return false
	}
	return true
}

func (n *Node) IsQuotaExceeded() bool {
	return n.TrafficLimit > 0 && n.TrafficUsed >= n.TrafficLimit
}

type Template struct {
	ID          int64     `json:"id"`
	Kind        string    `json:"kind"` // "client" | "server"
	Name        string    `json:"name"`
	Description string    `json:"description"`
	Content     string    `json:"content"`
	IsDefault   bool      `json:"is_default"`
	CreatedAt   time.Time `json:"created_at"`
	UpdatedAt   time.Time `json:"updated_at"`
}

type TrafficPoint struct {
	Bucket   string `json:"bucket"`
	Upload   int64  `json:"upload"`
	Download int64  `json:"download"`
}

type EntityTrafficSeries struct {
	ID         int64          `json:"id"`
	Name       string         `json:"name"`
	Total      int64          `json:"total"`
	IsOther    bool           `json:"is_other,omitempty"`
	OtherCount int            `json:"other_count,omitempty"`
	Points     []TrafficPoint `json:"points"`
}

type NodeTrafficStat struct {
	NodeID   int64  `json:"node_id"`
	NodeName string `json:"node_name"`
	Region   string `json:"region"`
	Upload   int64  `json:"upload"`
	Download int64  `json:"download"`
	Total    int64  `json:"total"`
}

type UserTrafficStat struct {
	UserID   int64  `json:"user_id"`
	Username string `json:"username"`
	Upload   int64  `json:"upload"`
	Download int64  `json:"download"`
	Total    int64  `json:"total"`
}

type ProtocolTrafficStat struct {
	Protocol string `json:"protocol"`
	Upload   int64  `json:"upload"`
	Download int64  `json:"download"`
	Total    int64  `json:"total"`
}

type SystemSettings struct {
	HubPublicURL      string `json:"hub_public_url"`
	ACMEEmail         string `json:"acme_email"`
	AgentImage        string `json:"agent_image"`
	SubPath           string `json:"sub_path"`
	GitHubToken       string `json:"github_token,omitempty"`
	GitHubTokenMasked string `json:"github_token_masked,omitempty"`
	HasGitHubToken    bool   `json:"has_github_token,omitempty"`
	ClearGitHubToken  bool   `json:"clear_github_token,omitempty"`
}

type MihomoReleaseInfo struct {
	Version     string    `json:"version"`
	PublishedAt string    `json:"published_at,omitempty"`
	ReleaseURL  string    `json:"release_url,omitempty"`
	Assets      []string  `json:"assets"`
	CheckedAt   time.Time `json:"checked_at"`
	Cached      bool      `json:"cached"`
}

type CustomTheme struct {
	ID        string            `json:"id"`
	Name      string            `json:"name"`
	SourceURL string            `json:"source_url,omitempty"`
	Theme     map[string]string `json:"theme,omitempty"`
	Light     map[string]string `json:"light"`
	Dark      map[string]string `json:"dark"`
	CreatedAt time.Time         `json:"created_at"`
	UpdatedAt time.Time         `json:"updated_at"`
}

type ThemeConfig struct {
	ActiveThemeID string        `json:"active_theme_id"`
	CustomThemes  []CustomTheme `json:"custom_themes"`
}

type PublicThemeResponse struct {
	ActiveThemeID     string       `json:"active_theme_id"`
	ActiveCustomTheme *CustomTheme `json:"active_custom_theme,omitempty"`
}

type PublicSubNode struct {
	Name      string   `json:"name"`
	Region    string   `json:"region"`
	Online    bool     `json:"online"`
	Protocols []string `json:"protocols"`
}

type PublicSubInfo struct {
	Username     string          `json:"username"`
	Enabled      bool            `json:"enabled"`
	Status       string          `json:"status"` // active | expiring | expired | exhausted | disabled
	TrafficLimit int64           `json:"traffic_limit"`
	TrafficUsed  int64           `json:"traffic_used"`
	UploadUsed   int64           `json:"upload_used"`
	DownloadUsed int64           `json:"download_used"`
	ExpireAt     *time.Time      `json:"expire_at"`
	SubURL       string          `json:"sub_url"`
	DownloadURL  string          `json:"download_url"`
	RawURL       string          `json:"raw_url"`
	Nodes        []PublicSubNode `json:"nodes"`
	YAML         string          `json:"yaml,omitempty"`
}

// Notification event types
const (
	NotifyEventNodeOffline     = "node_offline"
	NotifyEventNodeOnline      = "node_online"
	NotifyEventNodeConfigError = "node_config_error"
	NotifyEventNodeUpgrade     = "node_upgrade"
	NotifyEventNodeTraffic     = "node_traffic"
	NotifyEventNodeExpiring    = "node_expiring"
	NotifyEventHubStarted      = "hub_started"
	NotifyEventCertRenew       = "cert_renew"
	NotifyEventCertExpiring    = "cert_expiring"
	NotifyEventUserExhausted   = "user_exhausted"
	NotifyEventAdminLoginFail  = "admin_login_failed"
	NotifyEventScheduledReport = "scheduled_report"
	NotifyEventTest            = "test"
)

type NotificationChannel struct {
	ID        int64     `json:"id"`
	Name      string    `json:"name"`
	Provider  string    `json:"provider"` // telegram | bark | discord | generic | smtp | custom
	URL       string    `json:"url,omitempty"`
	MaskedURL string    `json:"masked_url,omitempty"`
	Enabled   bool      `json:"enabled"`
	Events    []string  `json:"events"` // empty => all alert events
	Remark    string    `json:"remark"`
	CreatedAt time.Time `json:"created_at"`
	UpdatedAt time.Time `json:"updated_at"`
}

type NotificationRules struct {
	Enabled bool `json:"enabled"`

	// Agent / Node events
	NodeOffline           bool  `json:"node_offline"`
	NodeOfflineDelaySec   int   `json:"node_offline_delay_sec"`
	NodeOnline            bool  `json:"node_online"`
	NodeConfigError       bool  `json:"node_config_error"`
	NodeUpgrade           bool  `json:"node_upgrade"`
	NodeTrafficAlert      bool  `json:"node_traffic_alert"`
	NodeTrafficThresholds []int `json:"node_traffic_thresholds"`
	NodeExpiring          bool  `json:"node_expiring"`
	NodeExpiringDays      int   `json:"node_expiring_days"`

	// Hub / Cert / Security events
	HubStarted       bool `json:"hub_started"`
	CertRenew        bool `json:"cert_renew"`
	CertExpiring     bool `json:"cert_expiring"`
	CertExpiringDays int  `json:"cert_expiring_days"`
	UserExhausted    bool `json:"user_exhausted"`
	AdminLoginFailed bool `json:"admin_login_failed"`
}

func DefaultNotificationRules() NotificationRules {
	return NotificationRules{
		Enabled:               true,
		NodeOffline:           true,
		NodeOfflineDelaySec:   60,
		NodeOnline:            true,
		NodeConfigError:       true,
		NodeUpgrade:           true,
		NodeTrafficAlert:      true,
		NodeTrafficThresholds: []int{80, 95, 100},
		NodeExpiring:          true,
		NodeExpiringDays:      7,
		HubStarted:            false,
		CertRenew:             true,
		CertExpiring:          true,
		CertExpiringDays:      14,
		UserExhausted:         false,
		AdminLoginFailed:      true,
	}
}

type NotificationSchedule struct {
	ID                 int64      `json:"id"`
	Name               string     `json:"name"`
	Enabled            bool       `json:"enabled"`
	Frequency          string     `json:"frequency"`            // daily | weekly | monthly
	TimeOfDay          string     `json:"time_of_day"`          // "HH:MM"
	Weekday            int        `json:"weekday"`              // 0=Sun..6=Sat
	DayOfMonth         int        `json:"day_of_month"`         // 1..31
	Timezone           string     `json:"timezone"`             // e.g. "Asia/Shanghai"
	TrafficDisplayMode string     `json:"traffic_display_mode"` // used | remaining
	IncludeSummary     bool       `json:"include_summary"`
	IncludeNodeTraffic bool       `json:"include_node_traffic"`
	NodeLimit          int        `json:"node_limit"` // 0 = all
	IncludeExpiring    bool       `json:"include_expiring"`
	IncludeTopUsers    bool       `json:"include_top_users"`
	ChannelIDs         []int64    `json:"channel_ids"` // empty = all enabled
	LastRunAt          *time.Time `json:"last_run_at"`
	CreatedAt          time.Time  `json:"created_at"`
	UpdatedAt          time.Time  `json:"updated_at"`
}

type NotificationLog struct {
	ID          int64     `json:"id"`
	EventType   string    `json:"event_type"`
	ChannelID   *int64    `json:"channel_id"`
	ChannelName string    `json:"channel_name"`
	Title       string    `json:"title"`
	Message     string    `json:"message"`
	Status      string    `json:"status"` // success | failed
	Error       string    `json:"error"`
	CreatedAt   time.Time `json:"created_at"`
}
