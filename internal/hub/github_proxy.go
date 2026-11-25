package hub

import (
	"regexp"
	"strings"
)

var githubPublicURLPattern = regexp.MustCompile(`https://(?:github\.com|raw\.githubusercontent\.com|gist\.githubusercontent\.com)/[^\s"'<>()]+`)

func normalizeGitHubProxy(raw string) string {
	trimmed := strings.TrimSpace(raw)
	if trimmed == "" {
		return ""
	}
	if !strings.HasSuffix(trimmed, "/") {
		trimmed += "/"
	}
	return trimmed
}

func isDirectGitHubURL(rawURL string) bool {
	lower := strings.ToLower(strings.TrimSpace(rawURL))
	return strings.HasPrefix(lower, "https://github.com/") ||
		strings.HasPrefix(lower, "https://raw.githubusercontent.com/") ||
		strings.HasPrefix(lower, "https://gist.githubusercontent.com/")
}

func applyGitHubProxyToURL(targetURL, proxyPrefix string) string {
	prefix := normalizeGitHubProxy(proxyPrefix)
	if prefix == "" || !isDirectGitHubURL(targetURL) {
		return targetURL
	}
	if strings.HasPrefix(targetURL, prefix) {
		return targetURL
	}
	return prefix + targetURL
}

// ApplyGitHubProxyToYAML rewrites public GitHub asset/raw URLs inside rendered client subscription YAML
// so clients can reliably fetch rule-providers / geox-url assets without hardcoding a proxy in templates.
func ApplyGitHubProxyToYAML(yamlText, proxyPrefix string) string {
	prefix := normalizeGitHubProxy(proxyPrefix)
	if prefix == "" || yamlText == "" {
		return yamlText
	}
	matches := githubPublicURLPattern.FindAllStringIndex(yamlText, -1)
	if len(matches) == 0 {
		return yamlText
	}

	var b strings.Builder
	b.Grow(len(yamlText) + len(matches)*len(prefix))
	last := 0
	for _, loc := range matches {
		start, end := loc[0], loc[1]
		// Skip if already preceded by a proxy prefix (e.g. https://ghfast.top/https://github.com/...)
		if start >= len(prefix) && yamlText[start-len(prefix):start] == prefix {
			continue
		}
		if start > 0 && yamlText[start-1] == '/' {
			continue
		}
		b.WriteString(yamlText[last:start])
		b.WriteString(prefix)
		b.WriteString(yamlText[start:end])
		last = end
	}
	b.WriteString(yamlText[last:])
	return b.String()
}
