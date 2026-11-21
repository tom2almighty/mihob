package mihomogen

import (
	"fmt"
	"strings"

	"gopkg.in/yaml.v3"

	"github.com/mihob/mihob/internal/model"
)

type NodeWithInbounds struct {
	Node     model.Node
	Inbounds []model.Inbound
}

// RenderUserSubscription generates the final Mihomo client YAML for a user using a template.
func RenderUserSubscription(
	user *model.User,
	nodes []NodeWithInbounds,
	certs map[int64]*model.Certificate,
	templateYAML string,
) (string, error) {
	proxies := make([]map[string]any, 0)
	proxyNames := make([]string, 0)
	nameCount := map[string]int{}

	for _, nw := range nodes {
		if !nw.Node.Enabled || nw.Node.IsQuotaExceeded() {
			continue
		}
		if !user.AccessPolicy.MatchNode(&nw.Node) {
			continue
		}
		allowedInbounds := make([]model.Inbound, 0, len(nw.Inbounds))
		for _, in := range nw.Inbounds {
			if !in.Enabled {
				continue
			}
			if !user.AccessPolicy.MatchInbound(&in) {
				continue
			}
			allowedInbounds = append(allowedInbounds, in)
		}
		for _, in := range allowedInbounds {
			displayName := strings.TrimSpace(in.Settings.ProxyName)
			if displayName == "" {
				displayName = nw.Node.Name
				if in.Tag != "" {
					displayName = fmt.Sprintf("%s · %s", nw.Node.Name, in.Tag)
				} else if len(allowedInbounds) > 1 {
					displayName = fmt.Sprintf("%s · %s", nw.Node.Name, strings.ToUpper(in.Protocol))
				}
			}
			nameCount[displayName]++
			if nameCount[displayName] > 1 {
				displayName = fmt.Sprintf("%s #%d", displayName, nameCount[displayName])
			}

			p := buildClientProxy(displayName, &nw.Node, &in, user, certs)
			if p != nil {
				proxies = append(proxies, p)
				proxyNames = append(proxyNames, displayName)
			}
		}
	}

	hasProxiesPlaceholder := strings.Contains(templateYAML, "{{PROXIES}}")
	hasNamesPlaceholder := strings.Contains(templateYAML, "{{PROXY_NAMES}}")

	if hasProxiesPlaceholder || hasNamesPlaceholder {
		return renderWithPlaceholders(templateYAML, proxies, proxyNames)
	}

	// Fallback: parse YAML and inject `proxies` directly
	var doc map[string]any
	if err := yaml.Unmarshal([]byte(templateYAML), &doc); err != nil {
		return "", fmt.Errorf("parse template yaml: %w", err)
	}
	if doc == nil {
		doc = map[string]any{}
	}
	doc["proxies"] = proxies
	out, err := yaml.Marshal(doc)
	if err != nil {
		return "", err
	}
	return string(out), nil
}

func renderWithPlaceholders(tmpl string, proxies []map[string]any, names []string) (string, error) {
	var proxiesYAML string
	if len(proxies) > 0 {
		b, err := yaml.Marshal(proxies)
		if err != nil {
			return "", err
		}
		proxiesYAML = strings.TrimRight(string(b), "\n")
	}

	lines := strings.Split(tmpl, "\n")
	out := make([]string, 0, len(lines)+len(proxies)*8)
	for _, line := range lines {
		trimmed := strings.TrimSpace(line)
		if trimmed == "{{PROXIES}}" {
			indent := leadingWhitespace(line)
			if indent == "" {
				indent = "  "
			}
			if proxiesYAML == "" {
				continue
			}
			for _, pl := range strings.Split(proxiesYAML, "\n") {
				out = append(out, indent+pl)
			}
			continue
		}
		if trimmed == "{{PROXY_NAMES}}" {
			indent := leadingWhitespace(line)
			if indent == "" {
				indent = "      "
			}
			if len(names) == 0 {
				out = append(out, indent+"- DIRECT")
				continue
			}
			for _, n := range names {
				quoted, _ := yaml.Marshal(n)
				out = append(out, indent+"- "+strings.TrimSpace(string(quoted)))
			}
			continue
		}
		out = append(out, line)
	}
	return strings.Join(out, "\n"), nil
}

func leadingWhitespace(s string) string {
	i := 0
	for i < len(s) && (s[i] == ' ' || s[i] == '\t') {
		i++
	}
	return s[:i]
}

func buildClientProxy(
	name string,
	node *model.Node,
	in *model.Inbound,
	user *model.User,
	certs map[int64]*model.Certificate,
) map[string]any {
	sni := in.Settings.SNI
	skipVerify := in.Settings.SkipCertVerify
	if in.CertID != nil {
		if c, ok := certs[*in.CertID]; ok {
			if sni == "" && c.Domain != "" {
				sni = strings.TrimPrefix(c.Domain, "*.")
			}
			if c.Source == "self_signed" {
				skipVerify = true
			}
		}
	}
	if sni == "" {
		sni = node.Host
	}

	clientServer := nonEmpty(in.Settings.ClientServer, node.Host)
	clientPort := in.Port
	if in.Settings.ClientPort > 0 {
		clientPort = in.Settings.ClientPort
	}

	fp := in.Settings.ClientFingerprint
	if fp == "" {
		fp = "chrome"
	}

	addTransport := func(p map[string]any) {
		switch in.Settings.Network {
		case "ws":
			p["network"] = "ws"
			wsOpts := map[string]any{
				"path": nonEmpty(in.Settings.WSPath, "/"),
			}
			wsHost := strings.TrimSpace(in.Settings.WSHost)
			if wsHost == "" && in.Settings.ClientTLS && sni != "" {
				wsHost = sni
			}
			if wsHost != "" {
				wsOpts["headers"] = map[string]string{"Host": wsHost}
			}
			p["ws-opts"] = wsOpts
		case "grpc":
			p["network"] = "grpc"
			p["grpc-opts"] = map[string]any{
				"grpc-service-name": nonEmpty(in.Settings.GRPCServiceName, "GunService"),
			}
		case "xhttp":
			p["network"] = "xhttp"
			xOpts := map[string]any{
				"path": nonEmpty(in.Settings.XHTTPPath, "/"),
				"mode": nonEmpty(in.Settings.XHTTPMode, "auto"),
			}
			xHost := strings.TrimSpace(in.Settings.XHTTPHost)
			if xHost == "" && in.Settings.ClientTLS && sni != "" {
				xHost = sni
			}
			if xHost != "" {
				xOpts["host"] = xHost
			}
			p["xhttp-opts"] = xOpts
		default:
			p["network"] = "tcp"
		}
	}

	addReality := func(p map[string]any) {
		rOpts := map[string]any{
			"public-key": in.Settings.RealityPublicKey,
		}
		if len(in.Settings.RealityShortIDs) > 0 && in.Settings.RealityShortIDs[0] != "" {
			rOpts["short-id"] = in.Settings.RealityShortIDs[0]
		}
		p["reality-opts"] = rOpts
		p["client-fingerprint"] = fp
	}

	realitySNI := sni
	if len(in.Settings.RealityServerNames) > 0 && in.Settings.RealityServerNames[0] != "" {
		realitySNI = in.Settings.RealityServerNames[0]
	} else if in.Settings.RealityDest != "" {
		realitySNI = strings.Split(in.Settings.RealityDest, ":")[0]
	}

	switch in.Protocol {
	case model.ProtoVLESS:
		p := map[string]any{
			"name":            name,
			"type":            "vless",
			"server":          clientServer,
			"port":            clientPort,
			"uuid":            user.UUID,
			"udp":             true,
			"packet-encoding": "xudp",
		}
		if in.Settings.Flow != "" && (in.Settings.Network == "" || in.Settings.Network == "tcp") {
			p["flow"] = in.Settings.Flow
		}
		if strings.TrimSpace(in.Settings.VLESSEncryption) != "" {
			p["encryption"] = strings.TrimSpace(in.Settings.VLESSEncryption)
		}
		addTransport(p)
		switch {
		case in.Settings.Security == "reality":
			p["tls"] = true
			p["servername"] = realitySNI
			addReality(p)
		case in.Settings.Security == "tls" || in.Settings.ClientTLS:
			p["tls"] = true
			p["servername"] = sni
			p["client-fingerprint"] = fp
			p["skip-cert-verify"] = skipVerify
			if len(in.Settings.ALPN) > 0 {
				p["alpn"] = in.Settings.ALPN
			}
		default:
			p["tls"] = false
		}
		return p

	case model.ProtoVMess:
		p := map[string]any{
			"name":    name,
			"type":    "vmess",
			"server":  clientServer,
			"port":    clientPort,
			"uuid":    user.UUID,
			"alterId": in.Settings.AlterID,
			"cipher":  nonEmpty(in.Settings.Cipher, "auto"),
			"udp":     true,
		}
		addTransport(p)
		switch {
		case in.Settings.Security == "reality":
			p["tls"] = true
			p["servername"] = realitySNI
			addReality(p)
		case in.Settings.Security == "tls" || in.Settings.ClientTLS:
			p["tls"] = true
			p["servername"] = sni
			p["client-fingerprint"] = fp
			p["skip-cert-verify"] = skipVerify
		default:
			p["tls"] = false
		}
		return p

	case model.ProtoTrojan:
		p := map[string]any{
			"name":     name,
			"type":     "trojan",
			"server":   clientServer,
			"port":     clientPort,
			"password": user.Password,
			"udp":      true,
		}
		addTransport(p)
		if in.Settings.Security == "reality" {
			p["sni"] = realitySNI
			addReality(p)
		} else {
			p["sni"] = sni
			p["client-fingerprint"] = fp
			p["skip-cert-verify"] = skipVerify
			if len(in.Settings.ALPN) > 0 {
				p["alpn"] = in.Settings.ALPN
			}
		}
		return p

	case model.ProtoHysteria2:
		p := map[string]any{
			"name":             name,
			"type":             "hysteria2",
			"server":           node.Host,
			"port":             in.Port,
			"password":         user.Password,
			"sni":              sni,
			"skip-cert-verify": skipVerify,
			"alpn":             nonEmptySlice(in.Settings.ALPN, []string{"h3"}),
		}
		if in.Settings.HopPorts != "" {
			p["ports"] = in.Settings.HopPorts
		}
		if in.Settings.Obfs != "" {
			p["obfs"] = in.Settings.Obfs
			p["obfs-password"] = in.Settings.ObfsPassword
		}
		if in.Settings.UpMbps > 0 {
			p["up"] = fmt.Sprintf("%d Mbps", in.Settings.UpMbps)
		}
		if in.Settings.DownMbps > 0 {
			p["down"] = fmt.Sprintf("%d Mbps", in.Settings.DownMbps)
		}
		return p

	case model.ProtoTUIC:
		p := map[string]any{
			"name":                  name,
			"type":                  "tuic",
			"server":                node.Host,
			"port":                  in.Port,
			"uuid":                  user.UUID,
			"password":              user.Password,
			"sni":                   sni,
			"skip-cert-verify":      skipVerify,
			"alpn":                  nonEmptySlice(in.Settings.ALPN, []string{"h3"}),
			"congestion-controller": nonEmpty(in.Settings.CongestionController, "bbr"),
			"udp-relay-mode":        nonEmpty(in.Settings.UDPRelayMode, "native"),
			"reduce-rtt":            true,
		}
		return p

	case model.ProtoAnyTLS:
		p := map[string]any{
			"name":               name,
			"type":               "anytls",
			"server":             node.Host,
			"port":               in.Port,
			"password":           user.Password,
			"sni":                sni,
			"client-fingerprint": fp,
			"skip-cert-verify":   skipVerify,
			"udp":                true,
		}
		if len(in.Settings.ALPN) > 0 {
			p["alpn"] = in.Settings.ALPN
		}
		return p

	case model.ProtoShadowsocks:
		cipher := nonEmpty(in.Settings.SSCipher, "2022-blake3-aes-128-gcm")
		pw := user.Password
		if strings.HasPrefix(cipher, "2022-blake3-aes-128") {
			pw = in.Settings.SSServerPassword + ":" + user.SSKey16
		} else if strings.HasPrefix(cipher, "2022-blake3-aes-256") {
			pw = in.Settings.SSServerPassword + ":" + user.SSKey32
		}
		return map[string]any{
			"name":     name,
			"type":     "ss",
			"server":   node.Host,
			"port":     in.Port,
			"cipher":   cipher,
			"password": pw,
			"udp":      true,
		}

	case model.ProtoMieru:
		transport := strings.ToUpper(strings.TrimSpace(in.Settings.MieruTransport))
		if transport != "TCP" && transport != "UDP" {
			transport = "TCP"
		}
		p := map[string]any{
			"name":      name,
			"type":      "mieru",
			"server":    node.Host,
			"transport": transport,
			"udp":       true,
			"username":  user.Username,
			"password":  user.Password,
		}
		if pr := strings.TrimSpace(in.Settings.MieruPortRange); pr != "" {
			p["port-range"] = pr
		} else {
			p["port"] = in.Port
		}
		if mux := strings.TrimSpace(in.Settings.MieruMultiplexing); mux != "" {
			p["multiplexing"] = mux
		}
		if hm := strings.TrimSpace(in.Settings.MieruHandshakeMode); hm != "" {
			p["handshake-mode"] = hm
		}
		if tp := strings.TrimSpace(in.Settings.MieruTrafficPattern); tp != "" {
			p["traffic-pattern"] = tp
		}
		return p

	case model.ProtoTrustTunnel:
		netMode := strings.ToLower(strings.TrimSpace(in.Settings.TrustTunnelNetwork))
		useQuic := netMode == "quic" || netMode == "both" || netMode == ""
		p := map[string]any{
			"name":               name,
			"type":               "trusttunnel",
			"server":             node.Host,
			"port":               in.Port,
			"username":           user.Username,
			"password":           user.Password,
			"sni":                sni,
			"client-fingerprint": fp,
			"skip-cert-verify":   skipVerify,
			"udp":                true,
		}
		if len(in.Settings.ALPN) > 0 {
			p["alpn"] = in.Settings.ALPN
		}
		if useQuic {
			p["quic"] = true
			p["congestion-controller"] = nonEmpty(in.Settings.CongestionController, "bbr")
			if in.Settings.BBRProfile != "" {
				p["bbr-profile"] = in.Settings.BBRProfile
			}
		}
		return p

	case model.ProtoShadowQuic:
		sqSNI := strings.TrimSpace(in.Settings.ShadowQuicJLSSNI)
		if sqSNI == "" && strings.TrimSpace(in.Settings.ShadowQuicJLSAddr) != "" {
			sqSNI = strings.Split(strings.TrimSpace(in.Settings.ShadowQuicJLSAddr), ":")[0]
		}
		if sqSNI == "" {
			sqSNI = sni
		}
		p := map[string]any{
			"name":                  name,
			"type":                  "shadowquic",
			"server":                node.Host,
			"port":                  in.Port,
			"username":              user.Username,
			"password":              user.Password,
			"sni":                   sqSNI,
			"alpn":                  nonEmptySlice(in.Settings.ALPN, []string{"h3"}),
			"zero-rtt":              in.Settings.ShadowQuicZeroRTT,
			"congestion-controller": nonEmpty(in.Settings.CongestionController, "bbr"),
		}
		if in.Settings.UpMbps > 0 {
			p["up"] = fmt.Sprintf("%d Mbps", in.Settings.UpMbps)
		}
		if in.Settings.DownMbps > 0 {
			p["down"] = fmt.Sprintf("%d Mbps", in.Settings.DownMbps)
		}
		if in.Settings.BBRProfile != "" {
			p["bbr-profile"] = in.Settings.BBRProfile
		}
		return p

	case model.ProtoSnell:
		ver := in.Settings.SnellVersion
		if ver < 1 || ver > 6 {
			ver = 4
		}
		p := map[string]any{
			"name":    name,
			"type":    "snell",
			"server":  node.Host,
			"port":    in.Port,
			"psk":     in.Settings.SnellPSK,
			"version": ver,
		}
		if ver >= 3 {
			p["udp"] = true
		}
		if ver == 6 {
			if mode := strings.TrimSpace(in.Settings.SnellMode); mode != "" {
				p["mode"] = mode
			}
		} else if obfsMode := strings.TrimSpace(in.Settings.SnellObfsMode); obfsMode != "" {
			obfsOpts := map[string]any{
				"mode": obfsMode,
			}
			if obfsHost := strings.TrimSpace(in.Settings.SnellObfsHost); obfsHost != "" {
				obfsOpts["host"] = obfsHost
			}
			p["obfs-opts"] = obfsOpts
		}
		return p

	case model.ProtoSudoku:
		p := map[string]any{
			"name":      name,
			"type":      "sudoku",
			"server":    node.Host,
			"port":      in.Port,
			"key":       in.Settings.SudokuKey,
			"http-mask": !in.Settings.SudokuDisableHTTPMask,
		}
		if aead := strings.TrimSpace(in.Settings.SudokuAEADMethod); aead != "" {
			p["aead-method"] = aead
		}
		if tt := strings.TrimSpace(in.Settings.SudokuTableType); tt != "" {
			p["table-type"] = tt
		}
		if in.Settings.SudokuPaddingMin != nil {
			p["padding-min"] = *in.Settings.SudokuPaddingMin
		}
		if in.Settings.SudokuPaddingMax != nil {
			p["padding-max"] = *in.Settings.SudokuPaddingMax
		}
		if in.Settings.SudokuEnablePureDownlink != nil {
			p["enable-pure-downlink"] = *in.Settings.SudokuEnablePureDownlink
		}
		if !in.Settings.SudokuDisableHTTPMask {
			if mode := strings.TrimSpace(in.Settings.SudokuHTTPMaskMode); mode != "" {
				p["http-mask-mode"] = mode
			}
			if pr := strings.TrimSpace(in.Settings.SudokuPathRoot); pr != "" {
				p["path-root"] = pr
			}
		}
		return p

	case model.ProtoHTTP:
		p := map[string]any{
			"name":     name,
			"type":     "http",
			"server":   node.Host,
			"port":     in.Port,
			"username": user.Username,
			"password": user.Password,
		}
		if in.Settings.Security == "tls" {
			p["tls"] = true
			p["sni"] = sni
			p["skip-cert-verify"] = skipVerify
		}
		return p

	case model.ProtoSocks, model.ProtoMixed:
		p := map[string]any{
			"name":     name,
			"type":     "socks5",
			"server":   node.Host,
			"port":     in.Port,
			"username": user.Username,
			"password": user.Password,
			"udp":      true,
		}
		if in.Settings.Security == "tls" {
			p["tls"] = true
			p["skip-cert-verify"] = skipVerify
		}
		return p
	}
	return nil
}

func nonEmpty(v, fallback string) string {
	if strings.TrimSpace(v) != "" {
		return v
	}
	return fallback
}

func nonEmptySlice(v, fallback []string) []string {
	if len(v) > 0 {
		return v
	}
	return fallback
}
