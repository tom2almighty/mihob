package protocol

import "encoding/json"

const (
	MsgHello         = "hello"
	MsgHeartbeat     = "heartbeat"
	MsgPushConfig    = "push_config"
	MsgConfigAck     = "config_ack"
	MsgKickUser      = "kick_user"
	MsgRestartMihomo = "restart_mihomo"
	MsgTrafficReport = "traffic_report"
	MsgCommandAck    = "command_ack"
	MsgPing          = "ping"
	MsgPong          = "pong"
)

type Envelope struct {
	Type      string          `json:"type"`
	RequestID string          `json:"request_id,omitempty"`
	Payload   json.RawMessage `json:"payload,omitempty"`
}

func NewEnvelope(msgType, requestID string, payload any) (*Envelope, error) {
	var raw json.RawMessage
	if payload != nil {
		b, err := json.Marshal(payload)
		if err != nil {
			return nil, err
		}
		raw = b
	}
	return &Envelope{
		Type:      msgType,
		RequestID: requestID,
		Payload:   raw,
	}, nil
}

type HelloPayload struct {
	AgentVersion  string `json:"agent_version"`
	MihomoVersion string `json:"mihomo_version"`
	OS            string `json:"os"`
	Arch          string `json:"arch"`
	Hostname      string `json:"hostname"`
}

type HeartbeatPayload struct {
	MihomoRunning     bool    `json:"mihomo_running"`
	MihomoVersion     string  `json:"mihomo_version"`
	CPUPercent        float64 `json:"cpu_percent"`
	MemUsed           uint64  `json:"mem_used"`
	MemTotal          uint64  `json:"mem_total"`
	ActiveConnections int     `json:"active_connections"`
	UpRate            int64   `json:"up_rate"`
	DownRate          int64   `json:"down_rate"`
	ConfigHash        string  `json:"config_hash"`
	UptimeSec         int64   `json:"uptime_sec"`
}

type CertFile struct {
	ID      int64  `json:"id"`
	CertPEM string `json:"cert_pem"`
	KeyPEM  string `json:"key_pem"`
}

type PushConfigPayload struct {
	ConfigYAML string     `json:"config_yaml"`
	ConfigHash string     `json:"config_hash"`
	Certs      []CertFile `json:"certs"`
}

type ConfigAckPayload struct {
	Success    bool   `json:"success"`
	ConfigHash string `json:"config_hash"`
	Error      string `json:"error,omitempty"`
}

type KickUserPayload struct {
	Identifiers []string `json:"identifiers"`
}

type UserTrafficDelta struct {
	InboundName string `json:"inbound_name"`
	InboundUser string `json:"inbound_user"`
	Upload      int64  `json:"upload"`
	Download    int64  `json:"download"`
}

type TrafficReportPayload struct {
	NodeUpload   int64              `json:"node_upload"`
	NodeDownload int64              `json:"node_download"`
	Users        []UserTrafficDelta `json:"users"`
}

type CommandAckPayload struct {
	Success bool   `json:"success"`
	Message string `json:"message,omitempty"`
	Error   string `json:"error,omitempty"`
}
