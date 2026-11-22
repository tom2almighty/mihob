package mihomogen

import (
	"fmt"
	"strconv"
	"strings"

	"gopkg.in/yaml.v3"

	"github.com/mihob/mihob/internal/model"
)

const ProxyTypeMihobNode = "mihob-node"

// ServerGenOptions supplies cluster context needed to resolve dynamic `type: mihob-node`
// proxy references and inject the internal `_mihob_relay` credential onto relay target listeners.
type ServerGenOptions struct {
	AllNodes        []model.Node
	AllInbounds     []model.Inbound
	RelayUser       *model.User
	RelayInboundIDs map[int64]bool
}

// ClusterRelayGraph summarizes all active node-to-node relay references across enabled nodes.
type ClusterRelayGraph struct {
	RelayInboundIDs map[int64]bool
	ReferrersByNode map[int64][]int64
	TargetsByNode   map[int64][]int64
}

// ValidateServerTemplateDirectives validates that raw YAML is a mapping and that any
// `type: mihob-node` proxy references specify both `name` and `node`.
func ValidateServerTemplateDirectives(raw string) error {
	if err := ValidateExtraYAML(raw); err != nil {
		return err
	}
	trimmed := strings.TrimSpace(raw)
	if trimmed == "" {
		return nil
	}
	var doc map[string]any
	if err := yaml.Unmarshal([]byte(trimmed), &doc); err != nil {
		return fmt.Errorf("invalid YAML: %w", err)
	}
	proxies, ok := doc["proxies"].([]any)
	if !ok {
		return nil
	}
	for i, item := range proxies {
		m, ok := item.(map[string]any)
		if !ok {
			continue
		}
		if !isMihobNodeProxy(m) {
			continue
		}
		name := strings.TrimSpace(asString(m["name"]))
		if name == "" {
			return fmt.Errorf("proxies[%d]: mihob-node proxy requires a non-empty name", i)
		}
		nodeRef := strings.TrimSpace(asString(m["node"]))
		if nodeRef == "" {
			return fmt.Errorf("proxies[%d] (%s): mihob-node proxy requires a non-empty node reference", i, name)
		}
	}
	return nil
}

func isMihobNodeProxy(m map[string]any) bool {
	return strings.EqualFold(strings.TrimSpace(asString(m["type"])), ProxyTypeMihobNode)
}

func asString(v any) string {
	switch x := v.(type) {
	case nil:
		return ""
	case string:
		return x
	case int:
		return strconv.Itoa(x)
	case int64:
		return strconv.FormatInt(x, 10)
	case uint64:
		return strconv.FormatUint(x, 10)
	case float64:
		if x == float64(int64(x)) {
			return strconv.FormatInt(int64(x), 10)
		}
		return strconv.FormatFloat(x, 'f', -1, 64)
	default:
		return fmt.Sprintf("%v", x)
	}
}

func normalizeProtoAlias(p string) string {
	p = strings.ToLower(strings.TrimSpace(p))
	switch p {
	case "ss":
		return model.ProtoShadowsocks
	case "hy2":
		return model.ProtoHysteria2
	case "socks5":
		return model.ProtoSocks
	default:
		return p
	}
}

func findTargetNode(ref string, allNodes []model.Node) *model.Node {
	ref = strings.TrimSpace(ref)
	if ref == "" {
		return nil
	}
	// 1. Numeric ID match
	if id, err := strconv.ParseInt(ref, 10, 64); err == nil {
		for i := range allNodes {
			if allNodes[i].ID == id {
				return &allNodes[i]
			}
		}
	}
	// 2. Exact name match
	for i := range allNodes {
		if strings.TrimSpace(allNodes[i].Name) == ref {
			return &allNodes[i]
		}
	}
	// 3. Case-insensitive name match
	for i := range allNodes {
		if strings.EqualFold(strings.TrimSpace(allNodes[i].Name), ref) {
			return &allNodes[i]
		}
	}
	return nil
}

func findTargetInbound(nodeID int64, inboundRef, protoRef string, allInbounds []model.Inbound) *model.Inbound {
	inboundRef = strings.TrimSpace(inboundRef)
	protoRef = normalizeProtoAlias(protoRef)

	candidates := make([]*model.Inbound, 0, 4)
	for i := range allInbounds {
		if allInbounds[i].NodeID == nodeID && allInbounds[i].Enabled {
			candidates = append(candidates, &allInbounds[i])
		}
	}
	if len(candidates) == 0 {
		return nil
	}

	if inboundRef != "" {
		if id, err := strconv.ParseInt(inboundRef, 10, 64); err == nil {
			for _, c := range candidates {
				if c.ID == id {
					return c
				}
			}
		}
		for _, c := range candidates {
			if strings.TrimSpace(c.Name) == inboundRef || strings.TrimSpace(c.Tag) == inboundRef {
				return c
			}
		}
		for _, c := range candidates {
			if strings.EqualFold(strings.TrimSpace(c.Name), inboundRef) || strings.EqualFold(strings.TrimSpace(c.Tag), inboundRef) {
				return c
			}
		}
		return nil
	}

	if protoRef != "" {
		for _, c := range candidates {
			if strings.EqualFold(c.Protocol, protoRef) {
				return c
			}
		}
		return nil
	}

	return candidates[0]
}

// resolveNodeProxyRef resolves a single `type: mihob-node` proxy directive into a full Mihomo proxy map.
func resolveNodeProxyRef(
	currentNode *model.Node,
	entry map[string]any,
	certs map[int64]*model.Certificate,
	opts *ServerGenOptions,
) (map[string]any, int64, int64, error) {
	name := strings.TrimSpace(asString(entry["name"]))
	if name == "" {
		return nil, 0, 0, fmt.Errorf("mihob-node proxy requires a non-empty name")
	}
	nodeRef := strings.TrimSpace(asString(entry["node"]))
	if nodeRef == "" {
		return nil, 0, 0, fmt.Errorf("proxy %q: mihob-node requires a non-empty node reference", name)
	}
	if opts == nil || opts.RelayUser == nil {
		return nil, 0, 0, fmt.Errorf("proxy %q: cluster relay context unavailable", name)
	}

	targetNode := findTargetNode(nodeRef, opts.AllNodes)
	if targetNode == nil {
		return nil, 0, 0, fmt.Errorf("proxy %q: referenced node %q not found", name, nodeRef)
	}

	// Self-reference guard: resolve to Mihomo's built-in `direct` outbound to prevent routing loops
	if currentNode != nil && currentNode.ID > 0 && targetNode.ID == currentNode.ID {
		return map[string]any{
			"name": name,
			"type": "direct",
		}, 0, 0, nil
	}

	if !targetNode.Enabled {
		return nil, 0, 0, fmt.Errorf("proxy %q: referenced node %q is disabled", name, targetNode.Name)
	}
	if targetNode.IsQuotaExceeded() {
		return nil, 0, 0, fmt.Errorf("proxy %q: referenced node %q has exceeded its traffic quota", name, targetNode.Name)
	}

	inboundRef := strings.TrimSpace(asString(entry["inbound"]))
	protoRef := strings.TrimSpace(asString(entry["protocol"]))
	targetInbound := findTargetInbound(targetNode.ID, inboundRef, protoRef, opts.AllInbounds)
	if targetInbound == nil {
		return nil, 0, 0, fmt.Errorf("proxy %q: referenced node %q has no matching enabled inbound", name, targetNode.Name)
	}

	proxy := buildClientProxy(name, targetNode, targetInbound, opts.RelayUser, certs)
	if proxy == nil {
		return nil, 0, 0, fmt.Errorf("proxy %q: failed to generate outbound for %s (%s)", name, targetNode.Name, targetInbound.Protocol)
	}

	// Preserve any additional Mihomo proxy options (e.g. dialer-proxy, smux, tfo, mptcp, interface-name, udp)
	extra := make(map[string]any)
	for k, v := range entry {
		switch k {
		case "name", "type", "node", "inbound", "protocol":
			continue
		default:
			extra[k] = v
		}
	}
	if len(extra) > 0 {
		deepMergeMap(proxy, extra, clientProtectedKeys, true)
	}

	return proxy, targetNode.ID, targetInbound.ID, nil
}

// ExpandServerProxyRefs replaces any `type: mihob-node` entries inside cfg["proxies"]
// with full Mihomo proxy definitions pointing to the referenced managed node/inbound.
func ExpandServerProxyRefs(
	currentNode *model.Node,
	cfg map[string]any,
	certs map[int64]*model.Certificate,
	opts *ServerGenOptions,
) error {
	rawProxies, exists := cfg["proxies"]
	if !exists || rawProxies == nil {
		return nil
	}
	list, ok := rawProxies.([]any)
	if !ok || len(list) == 0 {
		return nil
	}

	out := make([]any, 0, len(list))
	for _, item := range list {
		m, ok := item.(map[string]any)
		if !ok || !isMihobNodeProxy(m) {
			out = append(out, item)
			continue
		}
		expanded, _, _, err := resolveNodeProxyRef(currentNode, m, certs, opts)
		if err != nil {
			return err
		}
		out = append(out, expanded)
	}
	cfg["proxies"] = out
	return nil
}

// BuildClusterRelayGraph inspects all enabled nodes' effective server configs and computes
// which inbounds are targeted as relay destinations and which nodes reference which targets.
func BuildClusterRelayGraph(
	allNodes []model.Node,
	allInbounds []model.Inbound,
	resolveTemplate func(node *model.Node) string,
) *ClusterRelayGraph {
	graph := &ClusterRelayGraph{
		RelayInboundIDs: make(map[int64]bool),
		ReferrersByNode: make(map[int64][]int64),
		TargetsByNode:   make(map[int64][]int64),
	}

	refSeen := make(map[int64]map[int64]bool)
	tgtSeen := make(map[int64]map[int64]bool)

	for i := range allNodes {
		n := &allNodes[i]
		if !n.Enabled || n.IsQuotaExceeded() {
			continue
		}

		cfg := map[string]any{}
		if tmpl := resolveTemplate(n); strings.TrimSpace(tmpl) != "" {
			_ = MergeExtraYAML(cfg, tmpl, serverTopProtectedKeys)
		}
		if strings.TrimSpace(n.ExtraServerYAML) != "" {
			_ = MergeExtraYAML(cfg, n.ExtraServerYAML, serverTopProtectedKeys)
		}

		list, ok := cfg["proxies"].([]any)
		if !ok || len(list) == 0 {
			continue
		}
		for _, item := range list {
			m, ok := item.(map[string]any)
			if !ok || !isMihobNodeProxy(m) {
				continue
			}
			targetNode := findTargetNode(asString(m["node"]), allNodes)
			if targetNode == nil || targetNode.ID == n.ID || !targetNode.Enabled || targetNode.IsQuotaExceeded() {
				continue
			}
			targetInbound := findTargetInbound(targetNode.ID, asString(m["inbound"]), asString(m["protocol"]), allInbounds)
			if targetInbound == nil {
				continue
			}

			graph.RelayInboundIDs[targetInbound.ID] = true

			if refSeen[targetNode.ID] == nil {
				refSeen[targetNode.ID] = make(map[int64]bool)
			}
			if !refSeen[targetNode.ID][n.ID] {
				refSeen[targetNode.ID][n.ID] = true
				graph.ReferrersByNode[targetNode.ID] = append(graph.ReferrersByNode[targetNode.ID], n.ID)
			}

			if tgtSeen[n.ID] == nil {
				tgtSeen[n.ID] = make(map[int64]bool)
			}
			if !tgtSeen[n.ID][targetNode.ID] {
				tgtSeen[n.ID][targetNode.ID] = true
				graph.TargetsByNode[n.ID] = append(graph.TargetsByNode[n.ID], targetNode.ID)
			}
		}
	}

	return graph
}
