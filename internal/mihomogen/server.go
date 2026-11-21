package mihomogen

import (
	"fmt"
	"strings"
	"time"

	"gopkg.in/yaml.v3"

	"github.com/mihob/mihob/internal/crypto"
	"github.com/mihob/mihob/internal/model"
	"github.com/mihob/mihob/internal/protocol"
)

type ServerBundle struct {
	ConfigYAML string
	ConfigHash string
	Certs      []protocol.CertFile
}

// GenerateServerConfig builds a complete mihomo server config for a node.
// Note: external-controller / external-controller-unix are injected by the Agent
// right before writing so Hub remains OS-agnostic (Linux Unix socket vs Windows loopback).
func GenerateServerConfig(
	node *model.Node,
	inbounds []model.Inbound,
	users []model.User,
	certs map[int64]*model.Certificate,
	now time.Time,
) (*ServerBundle, error) {
	activeUsers := make([]model.User, 0, len(users))
	for _, u := range users {
		if u.IsActive(now) {
			activeUsers = append(activeUsers, u)
		}
	}

	listeners := make([]map[string]any, 0, len(inbounds))
	usedCerts := map[int64]*model.Certificate{}

	if node.Enabled && !node.IsQuotaExceeded() && len(activeUsers) > 0 {
		for _, in := range inbounds {
			if !in.Enabled {
				continue
			}
			inboundUsers := make([]model.User, 0, len(activeUsers))
			for _, u := range activeUsers {
				if u.AccessPolicy.Allows(node, &in) {
					inboundUsers = append(inboundUsers, u)
				}
			}
			if len(inboundUsers) == 0 {
				continue
			}
			l, cert, err := buildListener(&in, inboundUsers, certs)
			if err != nil {
				return nil, fmt.Errorf("inbound %s (%s): %w", in.Name, in.Protocol, err)
			}
			if l != nil {
				listeners = append(listeners, l)
				if cert != nil {
					usedCerts[cert.ID] = cert
				}
			}
		}
	}

	cfg := map[string]any{
		"mode":      "direct",
		"log-level": "info",
		"ipv6":      true,
		"allow-lan": false,
		"listeners": listeners,
	}

	raw, err := yaml.Marshal(cfg)
	if err != nil {
		return nil, err
	}

	certFiles := make([]protocol.CertFile, 0, len(usedCerts))
	for _, c := range usedCerts {
		certFiles = append(certFiles, protocol.CertFile{
			ID:      c.ID,
			CertPEM: c.CertPEM,
			KeyPEM:  c.KeyPEM,
		})
	}

	yamlStr := string(raw)
	hashInput := yamlStr
	for _, cf := range certFiles {
		hashInput += fmt.Sprintf("\n--cert:%d--\n%s", cf.ID, cf.CertPEM)
	}

	return &ServerBundle{
		ConfigYAML: yamlStr,
		ConfigHash: crypto.SHA256Hex(hashInput),
		Certs:      certFiles,
	}, nil
}

func buildListener(
	in *model.Inbound,
	users []model.User,
	certs map[int64]*model.Certificate,
) (map[string]any, *model.Certificate, error) {
	listen := in.Listen
	if listen == "" {
		listen = "0.0.0.0"
	}
	l := map[string]any{
		"name":   in.Name,
		"type":   in.Protocol,
		"port":   in.Port,
		"listen": listen,
	}
	if pr := strings.TrimSpace(in.Settings.PortRange); pr != "" {
		l["port"] = pr
	}
	if in.Settings.RoutingMark > 0 {
		l["routing-mark"] = in.Settings.RoutingMark
	}
	if rule := strings.TrimSpace(in.Settings.ListenerRule); rule != "" {
		l["rule"] = rule
	}
	if proxy := strings.TrimSpace(in.Settings.ListenerProxy); proxy != "" {
		l["proxy"] = proxy
	}

	var boundCert *model.Certificate
	attachTLSExtras := func() {
		if echKey := strings.TrimSpace(in.Settings.ECHKey); echKey != "" {
			l["ech-key"] = echKey
		}
		if authType := strings.TrimSpace(in.Settings.ClientAuthType); authType != "" {
			l["client-auth-type"] = authType
		}
		if authCert := strings.TrimSpace(in.Settings.ClientAuthCert); authCert != "" {
			l["client-auth-cert"] = authCert
		}
		if len(in.Settings.ALPN) > 0 {
			if _, exists := l["alpn"]; !exists {
				l["alpn"] = in.Settings.ALPN
			}
		}
	}
	attachCert := func(required bool) error {
		if in.CertID == nil {
			if required {
				return fmt.Errorf("TLS certificate is required")
			}
			return nil
		}
		c, ok := certs[*in.CertID]
		if !ok || c.CertPEM == "" || c.KeyPEM == "" {
			if required {
				return fmt.Errorf("certificate %d not found or empty", *in.CertID)
			}
			return nil
		}
		l["certificate"] = fmt.Sprintf("./certs/cert-%d.crt", c.ID)
		l["private-key"] = fmt.Sprintf("./certs/cert-%d.key", c.ID)
		boundCert = c
		attachTLSExtras()
		return nil
	}

	attachReality := func() error {
		if in.Settings.RealityDest == "" || in.Settings.RealityPrivateKey == "" {
			return fmt.Errorf("reality dest and private key are required")
		}
		serverNames := in.Settings.RealityServerNames
		if len(serverNames) == 0 {
			host := strings.Split(in.Settings.RealityDest, ":")[0]
			serverNames = []string{host}
		}
		shortIDs := in.Settings.RealityShortIDs
		if len(shortIDs) == 0 {
			shortIDs = []string{""}
		}
		l["reality-config"] = map[string]any{
			"dest":         in.Settings.RealityDest,
			"private-key":  in.Settings.RealityPrivateKey,
			"server-names": serverNames,
			"short-id":     shortIDs,
		}
		return nil
	}

	attachTransport := func() {
		switch in.Settings.Network {
		case "ws":
			p := in.Settings.WSPath
			if p == "" {
				p = "/"
			}
			l["ws-path"] = p
		case "grpc":
			svc := in.Settings.GRPCServiceName
			if svc == "" {
				svc = "GunService"
			}
			l["grpc-service-name"] = svc
		case "xhttp":
			if in.Protocol == model.ProtoVLESS {
				p := in.Settings.XHTTPPath
				if p == "" {
					p = "/"
				}
				mode := in.Settings.XHTTPMode
				if mode == "" {
					mode = "auto"
				}
				xCfg := map[string]any{
					"path": p,
					"mode": mode,
				}
				if in.Settings.XHTTPHost != "" {
					xCfg["host"] = in.Settings.XHTTPHost
				}
				if in.Settings.XHTTPNoSSEHeader {
					xCfg["no-sse-header"] = true
				}
				if pad := strings.TrimSpace(in.Settings.XHTTPPaddingBytes); pad != "" {
					xCfg["x-padding-bytes"] = pad
				}
				l["xhttp-config"] = xCfg
			}
		}
	}

	switch in.Protocol {
	case model.ProtoVLESS:
		uList := make([]map[string]any, 0, len(users))
		for _, u := range users {
			entry := map[string]any{
				"username": u.Username,
				"uuid":     u.UUID,
			}
			if in.Settings.Flow != "" && (in.Settings.Network == "" || in.Settings.Network == "tcp") {
				entry["flow"] = in.Settings.Flow
			}
			uList = append(uList, entry)
		}
		l["users"] = uList
		if strings.TrimSpace(in.Settings.VLESSDecryption) != "" {
			l["decryption"] = strings.TrimSpace(in.Settings.VLESSDecryption)
		}
		attachTransport()
		switch in.Settings.Security {
		case "reality":
			if err := attachReality(); err != nil {
				return nil, nil, err
			}
		case "tls":
			if err := attachCert(true); err != nil {
				return nil, nil, err
			}
		default:
			l["allow-insecure"] = true
		}

	case model.ProtoVMess:
		uList := make([]map[string]any, 0, len(users))
		for _, u := range users {
			uList = append(uList, map[string]any{
				"username": u.Username,
				"uuid":     u.UUID,
				"alterId":  in.Settings.AlterID,
			})
		}
		l["users"] = uList
		attachTransport()
		switch in.Settings.Security {
		case "reality":
			if err := attachReality(); err != nil {
				return nil, nil, err
			}
		case "tls":
			if err := attachCert(true); err != nil {
				return nil, nil, err
			}
		}

	case model.ProtoTrojan:
		uList := make([]map[string]any, 0, len(users))
		for _, u := range users {
			uList = append(uList, map[string]any{
				"username": u.Username,
				"password": u.Password,
			})
		}
		l["users"] = uList
		attachTransport()
		switch in.Settings.Security {
		case "reality":
			if err := attachReality(); err != nil {
				return nil, nil, err
			}
		case "tls", "":
			if err := attachCert(true); err != nil {
				return nil, nil, err
			}
		default:
			l["allow-insecure"] = true
		}

	case model.ProtoHysteria2:
		uMap := make(map[string]string, len(users))
		for _, u := range users {
			uMap[u.Username] = u.Password
		}
		l["users"] = uMap
		if in.Settings.UpMbps > 0 {
			l["up"] = in.Settings.UpMbps
		}
		if in.Settings.DownMbps > 0 {
			l["down"] = in.Settings.DownMbps
		}
		l["ignore-client-bandwidth"] = in.Settings.IgnoreClientBandwidth
		if in.Settings.Obfs != "" {
			l["obfs"] = in.Settings.Obfs
			l["obfs-password"] = in.Settings.ObfsPassword
		}
		if in.Settings.Masquerade != "" {
			l["masquerade"] = in.Settings.Masquerade
		}
		if in.Settings.BBRProfile != "" {
			l["bbr-profile"] = in.Settings.BBRProfile
		}
		if in.Settings.CWND > 0 {
			l["cwnd"] = in.Settings.CWND
		}
		alpn := in.Settings.ALPN
		if len(alpn) == 0 {
			alpn = []string{"h3"}
		}
		l["alpn"] = alpn
		if err := attachCert(true); err != nil {
			return nil, nil, err
		}

	case model.ProtoTUIC:
		uMap := make(map[string]string, len(users))
		for _, u := range users {
			uMap[u.UUID] = u.Password
		}
		l["users"] = uMap
		cc := in.Settings.CongestionController
		if cc == "" {
			cc = "bbr"
		}
		l["congestion-controller"] = cc
		if in.Settings.CWND > 0 {
			l["cwnd"] = in.Settings.CWND
		}
		idle := in.Settings.MaxIdleTime
		if idle <= 0 {
			idle = 15000
		}
		l["max-idle-time"] = idle
		alpn := in.Settings.ALPN
		if len(alpn) == 0 {
			alpn = []string{"h3"}
		}
		l["alpn"] = alpn
		if err := attachCert(true); err != nil {
			return nil, nil, err
		}

	case model.ProtoAnyTLS:
		uMap := make(map[string]string, len(users))
		for _, u := range users {
			uMap[u.Username] = u.Password
		}
		l["users"] = uMap
		if ps := strings.TrimSpace(in.Settings.PaddingScheme); ps != "" {
			if strings.Contains(ps, "\n") {
				lines := strings.Split(ps, "\n")
				arr := make([]string, 0, len(lines))
				for _, line := range lines {
					if trimmed := strings.TrimSpace(line); trimmed != "" {
						arr = append(arr, trimmed)
					}
				}
				if len(arr) > 0 {
					l["padding-scheme"] = arr
				}
			} else {
				l["padding-scheme"] = ps
			}
		}
		if err := attachCert(true); err != nil {
			return nil, nil, err
		}

	case model.ProtoShadowsocks:
		cipher := in.Settings.SSCipher
		if cipher == "" {
			cipher = "2022-blake3-aes-128-gcm"
		}
		l["cipher"] = cipher
		l["udp"] = true
		uMap := make(map[string]string, len(users))
		if strings.HasPrefix(cipher, "2022-blake3-aes-128") {
			l["password"] = in.Settings.SSServerPassword
			for _, u := range users {
				uMap[u.Username] = u.SSKey16
			}
		} else if strings.HasPrefix(cipher, "2022-blake3-aes-256") {
			l["password"] = in.Settings.SSServerPassword
			for _, u := range users {
				uMap[u.Username] = u.SSKey32
			}
		} else {
			// Standard AEAD multi-user leaves top-level password empty
			l["password"] = ""
			for _, u := range users {
				uMap[u.Username] = u.Password
			}
		}
		l["users"] = uMap

	case model.ProtoMieru:
		transport := strings.ToUpper(strings.TrimSpace(in.Settings.MieruTransport))
		if transport != "TCP" && transport != "UDP" {
			transport = "TCP"
		}
		l["transport"] = transport
		if pr := strings.TrimSpace(in.Settings.MieruPortRange); pr != "" {
			l["port"] = pr
		}
		uMap := make(map[string]string, len(users))
		for _, u := range users {
			uMap[u.Username] = u.Password
		}
		l["users"] = uMap
		if tp := strings.TrimSpace(in.Settings.MieruTrafficPattern); tp != "" {
			l["traffic-pattern"] = tp
		}
		if in.Settings.MieruTCPIdleTimeout >= 60 {
			l["tcp-idle-timeout"] = in.Settings.MieruTCPIdleTimeout
		}
		if in.Settings.MieruUserHintMandatory {
			l["user-hint-is-mandatory"] = true
		}

	case model.ProtoTrustTunnel:
		uList := make([]map[string]any, 0, len(users))
		for _, u := range users {
			uList = append(uList, map[string]any{
				"username": u.Username,
				"password": u.Password,
			})
		}
		l["users"] = uList
		switch strings.ToLower(strings.TrimSpace(in.Settings.TrustTunnelNetwork)) {
		case "tcp":
			l["network"] = []string{"tcp"}
		case "udp", "quic":
			l["network"] = []string{"udp"}
		default:
			l["network"] = []string{"tcp", "udp"}
		}
		if in.Settings.CongestionController != "" {
			l["congestion-controller"] = in.Settings.CongestionController
		}
		if in.Settings.CWND > 0 {
			l["cwnd"] = in.Settings.CWND
		}
		if in.Settings.BBRProfile != "" {
			l["bbr-profile"] = in.Settings.BBRProfile
		}
		if err := attachCert(true); err != nil {
			return nil, nil, err
		}

	case model.ProtoShadowQuic:
		addr := strings.TrimSpace(in.Settings.ShadowQuicJLSAddr)
		if addr == "" {
			return nil, nil, fmt.Errorf("shadowquic jls-upstream addr is required")
		}
		uList := make([]map[string]any, 0, len(users))
		for _, u := range users {
			uList = append(uList, map[string]any{
				"username": u.Username,
				"password": u.Password,
			})
		}
		l["users"] = uList
		jlsUpstream := map[string]any{
			"addr": addr,
		}
		if jlsSNI := strings.TrimSpace(in.Settings.ShadowQuicJLSSNI); jlsSNI != "" {
			jlsUpstream["sni"] = jlsSNI
		}
		if jlsProxy := strings.TrimSpace(in.Settings.ShadowQuicJLSProxy); jlsProxy != "" {
			jlsUpstream["proxy"] = jlsProxy
		}
		l["jls-upstream"] = jlsUpstream
		alpn := in.Settings.ALPN
		if len(alpn) == 0 {
			alpn = []string{"h3"}
		}
		l["alpn"] = alpn
		l["zero-rtt"] = in.Settings.ShadowQuicZeroRTT
		cc := in.Settings.CongestionController
		if cc == "" {
			cc = "bbr"
		}
		l["congestion-controller"] = cc
		if in.Settings.CWND > 0 {
			l["cwnd"] = in.Settings.CWND
		}
		if in.Settings.UpMbps > 0 {
			l["up"] = in.Settings.UpMbps
		}
		if in.Settings.DownMbps > 0 {
			l["down"] = in.Settings.DownMbps
		}
		l["ignore-client-bandwidth"] = in.Settings.IgnoreClientBandwidth
		if in.Settings.BBRProfile != "" {
			l["bbr-profile"] = in.Settings.BBRProfile
		}

	case model.ProtoSnell:
		psk := strings.TrimSpace(in.Settings.SnellPSK)
		if psk == "" {
			return nil, nil, fmt.Errorf("snell psk is required")
		}
		ver := in.Settings.SnellVersion
		if ver < 1 || ver > 6 {
			ver = 4
		}
		l["psk"] = psk
		l["version"] = ver
		if ver >= 3 {
			l["udp"] = true
		}
		if ver == 6 {
			if mode := strings.TrimSpace(in.Settings.SnellMode); mode != "" {
				l["mode"] = mode
			}
		} else if obfsMode := strings.TrimSpace(in.Settings.SnellObfsMode); obfsMode != "" {
			obfsOpts := map[string]any{
				"mode": obfsMode,
			}
			if obfsHost := strings.TrimSpace(in.Settings.SnellObfsHost); obfsHost != "" {
				obfsOpts["host"] = obfsHost
			}
			l["obfs-opts"] = obfsOpts
		}

	case model.ProtoSudoku:
		key := strings.TrimSpace(in.Settings.SudokuKey)
		if key == "" {
			return nil, nil, fmt.Errorf("sudoku key is required")
		}
		l["key"] = key
		if aead := strings.TrimSpace(in.Settings.SudokuAEADMethod); aead != "" {
			l["aead-method"] = aead
		}
		if tt := strings.TrimSpace(in.Settings.SudokuTableType); tt != "" {
			l["table-type"] = tt
		}
		if ct := strings.TrimSpace(in.Settings.SudokuCustomTable); ct != "" {
			l["custom-table"] = ct
		}
		if mux := strings.TrimSpace(in.Settings.SudokuMultiplex); mux != "" {
			l["multiplex"] = mux
		}
		if in.Settings.SudokuPaddingMin != nil {
			l["padding-min"] = *in.Settings.SudokuPaddingMin
		}
		if in.Settings.SudokuPaddingMax != nil {
			l["padding-max"] = *in.Settings.SudokuPaddingMax
		}
		if in.Settings.SudokuEnablePureDownlink != nil {
			l["enable-pure-downlink"] = *in.Settings.SudokuEnablePureDownlink
		}
		httpMask := map[string]any{
			"disable": in.Settings.SudokuDisableHTTPMask,
		}
		if !in.Settings.SudokuDisableHTTPMask {
			if mode := strings.TrimSpace(in.Settings.SudokuHTTPMaskMode); mode != "" {
				httpMask["mode"] = mode
			}
			if in.Settings.SudokuHTTPMaskTLS {
				httpMask["tls"] = true
			}
			if host := strings.TrimSpace(in.Settings.SudokuHTTPMaskHost); host != "" {
				httpMask["host"] = host
			}
			if pr := strings.TrimSpace(in.Settings.SudokuPathRoot); pr != "" {
				httpMask["path-root"] = pr
			}
		}
		if fb := strings.TrimSpace(in.Settings.SudokuFallback); fb != "" {
			httpMask["fallback"] = fb
		}
		l["httpmask"] = httpMask

	case model.ProtoHTTP, model.ProtoSocks, model.ProtoMixed:
		uList := make([]map[string]any, 0, len(users))
		for _, u := range users {
			uList = append(uList, map[string]any{
				"username": u.Username,
				"password": u.Password,
			})
		}
		l["users"] = uList
		if in.Protocol == model.ProtoSocks || in.Protocol == model.ProtoMixed {
			l["udp"] = true
		}
		switch in.Settings.Security {
		case "tls":
			if err := attachCert(true); err != nil {
				return nil, nil, err
			}
		case "reality":
			if err := attachReality(); err != nil {
				return nil, nil, err
			}
		}

	default:
		return nil, nil, fmt.Errorf("unsupported protocol: %s", in.Protocol)
	}

	if err := MergeExtraYAML(l, in.Settings.ExtraServerYAML, serverProtectedKeys); err != nil {
		return nil, nil, err
	}

	return l, boundCert, nil
}
