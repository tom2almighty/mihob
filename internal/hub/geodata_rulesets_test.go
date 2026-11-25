package hub

import (
	"encoding/binary"
	"path/filepath"
	"strings"
	"testing"

	"github.com/mihob/mihob/internal/db"
	"github.com/mihob/mihob/internal/model"
)

func TestApplyGitHubProxyToYAML(t *testing.T) {
	in := `geodata-mode: true
geox-url:
  geosite: "https://github.com/MetaCubeX/meta-rules-dat/releases/download/latest/geosite.dat"
  geoip: "https://ghfast.top/https://github.com/MetaCubeX/meta-rules-dat/releases/download/latest/geoip.dat"
rule-providers:
  openai:
    type: http
    format: mrs
    url: "https://raw.githubusercontent.com/MetaCubeX/meta-rules-dat/meta/geo/geosite/openai.mrs"
  local:
    url: "https://hub.example.com/api/public/rules/my.mrs"
`
	out := ApplyGitHubProxyToYAML(in, "https://ghfast.top")
	if !strings.Contains(out, `"https://ghfast.top/https://github.com/MetaCubeX/meta-rules-dat/releases/download/latest/geosite.dat"`) {
		t.Fatalf("expected geosite URL proxied:\n%s", out)
	}
	if strings.Contains(out, "https://ghfast.top/https://ghfast.top/") {
		t.Fatalf("should not double-prefix already proxied URL:\n%s", out)
	}
	if !strings.Contains(out, `"https://ghfast.top/https://raw.githubusercontent.com/MetaCubeX/meta-rules-dat/meta/geo/geosite/openai.mrs"`) {
		t.Fatalf("expected raw.githubusercontent.com URL proxied:\n%s", out)
	}
	if !strings.Contains(out, `"https://hub.example.com/api/public/rules/my.mrs"`) {
		t.Fatalf("non-github URL should stay unchanged:\n%s", out)
	}
}

func appendProtoBytes(dst []byte, fieldNum uint64, payload []byte) []byte {
	dst = binary.AppendUvarint(dst, (fieldNum<<3)|2)
	dst = binary.AppendUvarint(dst, uint64(len(payload)))
	return append(dst, payload...)
}

func TestParseGeoDatTags(t *testing.T) {
	var entry1 []byte
	entry1 = appendProtoBytes(entry1, 1, []byte("OPENAI"))
	entry1 = appendProtoBytes(entry1, 2, []byte("d1"))
	entry1 = appendProtoBytes(entry1, 2, []byte("d2"))

	var entry2 []byte
	entry2 = appendProtoBytes(entry2, 1, []byte("CN"))
	entry2 = appendProtoBytes(entry2, 2, []byte("d3"))

	var list []byte
	list = appendProtoBytes(list, 1, entry1)
	list = appendProtoBytes(list, 1, entry2)

	siteTags, err := ParseGeoDatTags(list, true)
	if err != nil {
		t.Fatalf("ParseGeoDatTags geosite error: %v", err)
	}
	if len(siteTags) != 2 || siteTags[0].Tag != "cn" || siteTags[0].Count != 1 || siteTags[1].Tag != "openai" || siteTags[1].Count != 2 {
		t.Fatalf("unexpected geosite tags: %+v", siteTags)
	}

	ipTags, err := ParseGeoDatTags(list, false)
	if err != nil {
		t.Fatalf("ParseGeoDatTags geoip error: %v", err)
	}
	if len(ipTags) != 2 || ipTags[0].Tag != "CN" || ipTags[1].Tag != "OPENAI" {
		t.Fatalf("unexpected geoip tags: %+v", ipTags)
	}
}

func TestRuleSetStoreAndSettingsPersistence(t *testing.T) {
	store, err := db.Open(filepath.Join(t.TempDir(), "test.db"))
	if err != nil {
		t.Fatalf("open db: %v", err)
	}
	defer store.Close()

	st, err := store.GetSystemSettings()
	if err != nil {
		t.Fatalf("get settings: %v", err)
	}
	if !strings.Contains(st.GeoXURLs.GeoSite, "MetaCubeX") {
		t.Fatalf("expected default MetaCubeX geosite URL, got %+v", st.GeoXURLs)
	}
	st.GitHubProxy = "https://ghfast.top/"
	st.GeoXURLs.GeoSite = "https://example.com/custom-geosite.dat"
	if err := store.SaveSystemSettings(st); err != nil {
		t.Fatalf("save settings: %v", err)
	}
	reloaded, err := store.GetSystemSettings()
	if err != nil || reloaded.GitHubProxy != "https://ghfast.top/" || reloaded.GeoXURLs.GeoSite != "https://example.com/custom-geosite.dat" {
		t.Fatalf("unexpected reloaded settings: %+v (err=%v)", reloaded, err)
	}

	rs := &model.RuleSet{
		Name:        "my-direct",
		Behavior:    "domain",
		Description: "custom direct domains",
		RulesText:   "+.example.com\n# comment\n+.internal.org\n",
		RuleCount:   2,
	}
	if err := store.CreateRuleSet(rs); err != nil {
		t.Fatalf("create ruleset: %v", err)
	}
	got, err := store.GetRuleSetByName("my-direct")
	if err != nil || got.RuleCount != 2 || got.Behavior != "domain" {
		t.Fatalf("unexpected ruleset: %+v (err=%v)", got, err)
	}
	if err := store.DeleteRuleSet(got.ID); err != nil {
		t.Fatalf("delete ruleset: %v", err)
	}
}
