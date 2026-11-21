package model

import (
	"fmt"
	"regexp"
	"strings"
)

const (
	AccessModeAll    = "all"
	AccessModeRule   = "rule"
	AccessModeManual = "manual"

	MatchModeAll = "all"
	MatchModeAny = "any"
)

// AccessPolicy defines two-layer orthogonal authorization for a user:
// 1) Node scope (all / rule by region+tags+regex / manual node IDs)
// 2) Inbound/protocol scope within matched nodes (all / rule by protocol+tags+regex / manual inbound IDs)
type AccessPolicy struct {
	NodeMode       string   `json:"node_mode"`
	NodeMatch      string   `json:"node_match,omitempty"`
	NodeRegions    []string `json:"node_regions,omitempty"`
	NodeTags       []string `json:"node_tags,omitempty"`
	NodeNameRegex  string   `json:"node_name_regex,omitempty"`
	NodeIDs        []int64  `json:"node_ids,omitempty"`
	ExcludeNodeIDs []int64  `json:"exclude_node_ids,omitempty"`

	InboundMode       string   `json:"inbound_mode"`
	InboundMatch      string   `json:"inbound_match,omitempty"`
	InboundProtocols  []string `json:"inbound_protocols,omitempty"`
	InboundTags       []string `json:"inbound_tags,omitempty"`
	InboundNameRegex  string   `json:"inbound_name_regex,omitempty"`
	InboundIDs        []int64  `json:"inbound_ids,omitempty"`
	ExcludeInboundIDs []int64  `json:"exclude_inbound_ids,omitempty"`
}

func DefaultAccessPolicy() AccessPolicy {
	return AccessPolicy{
		NodeMode:    AccessModeAll,
		NodeMatch:   MatchModeAll,
		InboundMode: AccessModeAll,
		InboundMatch: MatchModeAll,
	}
}

func NormalizeTags(raw []string) []string {
	if len(raw) == 0 {
		return []string{}
	}
	seen := make(map[string]struct{}, len(raw))
	out := make([]string, 0, len(raw))
	for _, t := range raw {
		clean := strings.TrimSpace(t)
		if clean == "" {
			continue
		}
		key := strings.ToLower(clean)
		if _, ok := seen[key]; ok {
			continue
		}
		seen[key] = struct{}{}
		out = append(out, clean)
	}
	return out
}

func normalizeIDs(raw []int64) []int64 {
	if len(raw) == 0 {
		return nil
	}
	seen := make(map[int64]struct{}, len(raw))
	out := make([]int64, 0, len(raw))
	for _, id := range raw {
		if id <= 0 {
			continue
		}
		if _, ok := seen[id]; ok {
			continue
		}
		seen[id] = struct{}{}
		out = append(out, id)
	}
	return out
}

func normalizeStrings(raw []string) []string {
	norm := NormalizeTags(raw)
	if len(norm) == 0 {
		return nil
	}
	return norm
}

func (p *AccessPolicy) Normalize() {
	if p.NodeMode == "" {
		p.NodeMode = AccessModeAll
	}
	if p.NodeMatch != MatchModeAny {
		p.NodeMatch = MatchModeAll
	}
	p.NodeRegions = normalizeStrings(p.NodeRegions)
	p.NodeTags = normalizeStrings(p.NodeTags)
	p.NodeNameRegex = strings.TrimSpace(p.NodeNameRegex)
	p.NodeIDs = normalizeIDs(p.NodeIDs)
	p.ExcludeNodeIDs = normalizeIDs(p.ExcludeNodeIDs)

	if p.InboundMode == "" {
		p.InboundMode = AccessModeAll
	}
	if p.InboundMatch != MatchModeAny {
		p.InboundMatch = MatchModeAll
	}
	if len(p.InboundProtocols) > 0 {
		seen := make(map[string]struct{}, len(p.InboundProtocols))
		protos := make([]string, 0, len(p.InboundProtocols))
		for _, pr := range p.InboundProtocols {
			pr = strings.ToLower(strings.TrimSpace(pr))
			if pr == "" {
				continue
			}
			if _, ok := seen[pr]; ok {
				continue
			}
			seen[pr] = struct{}{}
			protos = append(protos, pr)
		}
		p.InboundProtocols = protos
	} else {
		p.InboundProtocols = nil
	}
	p.InboundTags = normalizeStrings(p.InboundTags)
	p.InboundNameRegex = strings.TrimSpace(p.InboundNameRegex)
	p.InboundIDs = normalizeIDs(p.InboundIDs)
	p.ExcludeInboundIDs = normalizeIDs(p.ExcludeInboundIDs)
}

func (p AccessPolicy) Validate() error {
	p.Normalize()
	switch p.NodeMode {
	case AccessModeAll, AccessModeRule, AccessModeManual:
	default:
		return fmt.Errorf("invalid node_mode: %q", p.NodeMode)
	}
	switch p.InboundMode {
	case AccessModeAll, AccessModeRule, AccessModeManual:
	default:
		return fmt.Errorf("invalid inbound_mode: %q", p.InboundMode)
	}
	if p.NodeNameRegex != "" {
		if _, err := regexp.Compile(p.NodeNameRegex); err != nil {
			return fmt.Errorf("invalid node_name_regex: %w", err)
		}
	}
	if p.InboundNameRegex != "" {
		if _, err := regexp.Compile(p.InboundNameRegex); err != nil {
			return fmt.Errorf("invalid inbound_name_regex: %w", err)
		}
	}
	for _, pr := range p.InboundProtocols {
		if !IsValidProtocol(pr) {
			return fmt.Errorf("invalid protocol in inbound_protocols: %q", pr)
		}
	}
	return nil
}

func containsInt64(list []int64, target int64) bool {
	for _, id := range list {
		if id == target {
			return true
		}
	}
	return false
}

func containsFold(list []string, target string) bool {
	target = strings.TrimSpace(target)
	if target == "" {
		return false
	}
	for _, item := range list {
		if strings.EqualFold(strings.TrimSpace(item), target) {
			return true
		}
	}
	return false
}

func anyTagOverlap(wanted, actual []string) bool {
	for _, a := range actual {
		if containsFold(wanted, a) {
			return true
		}
	}
	return false
}

func matchRegex(pattern string, candidates ...string) bool {
	if pattern == "" {
		return true
	}
	re, err := regexp.Compile(pattern)
	if err != nil {
		return false
	}
	for _, c := range candidates {
		if c != "" && re.MatchString(c) {
			return true
		}
	}
	return false
}

func combineConditions(mode string, results []bool) bool {
	if len(results) == 0 {
		// In rule mode with no conditions specified, match nothing to prevent accidental over-granting.
		return false
	}
	if mode == MatchModeAny {
		for _, r := range results {
			if r {
				return true
			}
		}
		return false
	}
	for _, r := range results {
		if !r {
			return false
		}
	}
	return true
}

// MatchNode evaluates whether the node passes the first-layer node access rule.
func (p AccessPolicy) MatchNode(node *Node) bool {
	if node == nil {
		return false
	}
	p.Normalize()
	if containsInt64(p.ExcludeNodeIDs, node.ID) {
		return false
	}
	switch p.NodeMode {
	case AccessModeAll:
		return true
	case AccessModeManual:
		return containsInt64(p.NodeIDs, node.ID)
	case AccessModeRule:
		var conds []bool
		if len(p.NodeRegions) > 0 {
			conds = append(conds, containsFold(p.NodeRegions, node.Region))
		}
		if len(p.NodeTags) > 0 {
			conds = append(conds, anyTagOverlap(p.NodeTags, node.Tags))
		}
		if p.NodeNameRegex != "" {
			conds = append(conds, matchRegex(p.NodeNameRegex, node.Name))
		}
		return combineConditions(p.NodeMatch, conds)
	default:
		return false
	}
}

// MatchInbound evaluates whether the inbound passes the second-layer protocol/inbound rule.
func (p AccessPolicy) MatchInbound(in *Inbound) bool {
	if in == nil {
		return false
	}
	p.Normalize()
	if containsInt64(p.ExcludeInboundIDs, in.ID) {
		return false
	}
	switch p.InboundMode {
	case AccessModeAll:
		return true
	case AccessModeManual:
		return containsInt64(p.InboundIDs, in.ID)
	case AccessModeRule:
		var conds []bool
		if len(p.InboundProtocols) > 0 {
			conds = append(conds, containsFold(p.InboundProtocols, in.Protocol))
		}
		if len(p.InboundTags) > 0 {
			conds = append(conds, anyTagOverlap(p.InboundTags, in.Tags))
		}
		if p.InboundNameRegex != "" {
			conds = append(conds, matchRegex(p.InboundNameRegex, in.Name, in.Tag, in.Settings.ProxyName))
		}
		return combineConditions(p.InboundMatch, conds)
	default:
		return false
	}
}

// Allows checks both node-layer and inbound-layer authorization.
func (p AccessPolicy) Allows(node *Node, in *Inbound) bool {
	return p.MatchNode(node) && p.MatchInbound(in)
}
