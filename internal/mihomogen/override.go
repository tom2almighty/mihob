package mihomogen

import (
	"fmt"
	"strings"

	"gopkg.in/yaml.v3"

	"github.com/mihob/mihob/internal/model"
)

var (
	serverProtectedKeys = map[string]bool{
		"name":  true,
		"type":  true,
		"users": true,
	}
	clientProtectedKeys = map[string]bool{
		"name": true,
		"type": true,
	}
	serverTopProtectedKeys = map[string]bool{
		"listeners":                true,
		"external-controller":      true,
		"external-controller-unix": true,
		"external-controller-tls":  true,
		"secret":                   true,
	}
)

// ValidateExtraYAML verifies that raw YAML is either empty or a valid YAML mapping (object).
func ValidateExtraYAML(raw string) error {
	trimmed := strings.TrimSpace(raw)
	if trimmed == "" {
		return nil
	}
	var doc any
	if err := yaml.Unmarshal([]byte(trimmed), &doc); err != nil {
		return fmt.Errorf("invalid YAML: %w", err)
	}
	if doc == nil {
		return nil
	}
	if _, ok := doc.(map[string]any); !ok {
		return fmt.Errorf("extra YAML must be a key-value mapping")
	}
	return nil
}

// MergeExtraYAML parses raw YAML as a mapping and deep-merges it into base,
// skipping protected top-level keys managed by the control plane.
func MergeExtraYAML(base map[string]any, raw string, protected map[string]bool) error {
	return mergeYAML(base, raw, protected, false)
}

// MergeServerYAML deep-merges a server-level YAML overlay into base,
// merging top-level `proxies` entries by `name` instead of wiping out previously defined proxies.
func MergeServerYAML(base map[string]any, raw string, protected map[string]bool) error {
	return mergeYAML(base, raw, protected, true)
}

func mergeYAML(base map[string]any, raw string, protected map[string]bool, mergeProxies bool) error {
	trimmed := strings.TrimSpace(raw)
	if trimmed == "" {
		return nil
	}
	var overlay map[string]any
	if err := yaml.Unmarshal([]byte(trimmed), &overlay); err != nil {
		return fmt.Errorf("parse extra YAML: %w", err)
	}
	if len(overlay) == 0 {
		return nil
	}
	var overlayProxies []any
	hasProxies := false
	if mergeProxies {
		if rawProxies, ok := overlay["proxies"]; ok {
			if list, ok := rawProxies.([]any); ok && len(list) > 0 {
				overlayProxies = list
				hasProxies = true
				delete(overlay, "proxies")
			}
		}
	}
	deepMergeMap(base, overlay, protected, true)
	if hasProxies {
		mergeProxiesByName(base, overlayProxies)
	}
	return nil
}

func deepMergeMap(dst, src map[string]any, protected map[string]bool, isRoot bool) {
	for k, v := range src {
		if isRoot && protected[k] {
			continue
		}
		if srcSub, ok := v.(map[string]any); ok {
			if dstSub, ok := dst[k].(map[string]any); ok {
				deepMergeMap(dstSub, srcSub, nil, false)
				continue
			}
			copied := make(map[string]any, len(srcSub))
			deepMergeMap(copied, srcSub, nil, false)
			dst[k] = copied
			continue
		}
		dst[k] = v
	}
}

// PreviewInboundYAML renders both the server listener YAML and a sample client proxy YAML
// for a draft or saved inbound configuration, including deep-merged extra YAML overrides.
func PreviewInboundYAML(
	node *model.Node,
	in *model.Inbound,
	certs map[int64]*model.Certificate,
) (string, string, error) {
	return PreviewInboundYAMLWithEndpoints(node, in, certs, nil)
}

func PreviewInboundYAMLWithEndpoints(
	node *model.Node,
	in *model.Inbound,
	certs map[int64]*model.Certificate,
	endpoints []model.ResolvedEndpoint,
) (string, string, error) {
	if err := ValidateExtraYAML(in.Settings.ExtraServerYAML); err != nil {
		return "", "", fmt.Errorf("server extra YAML: %w", err)
	}
	if err := ValidateExtraYAML(in.Settings.ExtraClientYAML); err != nil {
		return "", "", fmt.Errorf("client extra YAML: %w", err)
	}

	sampleUser := model.User{
		ID:       1,
		Username: "preview-user",
		UUID:     "00000000-0000-4000-8000-000000000000",
		Password: "preview-password",
		SSKey16:  "MTIzNDU2Nzg5MDEyMzQ1Ng==",
		SSKey32:  "MTIzNDU2Nzg5MDEyMzQ1Njc4OTAxMjM0NTY3ODkwMTI=",
		Enabled:  true,
	}

	listener, _, err := buildListener(in, []model.User{sampleUser}, certs)
	if err != nil {
		return "", "", err
	}
	serverBytes, err := yaml.Marshal([]map[string]any{listener})
	if err != nil {
		return "", "", err
	}

	displayName := strings.TrimSpace(in.Settings.ProxyName)
	if displayName == "" {
		if in.Tag != "" {
			displayName = fmt.Sprintf("%s · %s", node.Name, in.Tag)
		} else {
			displayName = fmt.Sprintf("%s · %s", node.Name, strings.ToUpper(in.Protocol))
		}
	}

	if len(endpoints) > 0 {
		proxies := make([]map[string]any, 0, len(endpoints))
		nameCount := map[string]int{}
		for idx, ep := range endpoints {
			inCopy := *in
			inCopy.Settings.ClientServer = ep.Host
			if ep.Port > 0 {
				inCopy.Settings.ClientPort = ep.Port
			}
			candidate := displayName
			if lbl := strings.TrimSpace(ep.Label); lbl != "" {
				candidate = fmt.Sprintf("%s · %s", displayName, lbl)
			} else if len(endpoints) > 1 {
				candidate = fmt.Sprintf("%s · %d", displayName, idx+1)
			}
			nameCount[candidate]++
			if nameCount[candidate] > 1 {
				candidate = fmt.Sprintf("%s #%d", candidate, nameCount[candidate])
			}
			if p := buildClientProxy(candidate, node, &inCopy, &sampleUser, certs); p != nil {
				proxies = append(proxies, p)
			}
		}
		if len(proxies) == 0 {
			return string(serverBytes), "", nil
		}
		clientBytes, err := yaml.Marshal(proxies)
		if err != nil {
			return "", "", err
		}
		return string(serverBytes), string(clientBytes), nil
	}

	proxy := buildClientProxy(displayName, node, in, &sampleUser, certs)
	if proxy == nil {
		return string(serverBytes), "", nil
	}
	clientBytes, err := yaml.Marshal([]map[string]any{proxy})
	if err != nil {
		return "", "", err
	}
	return string(serverBytes), string(clientBytes), nil
}
