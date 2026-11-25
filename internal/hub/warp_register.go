package hub

import (
	"context"
	"errors"
	"net/http"
	"strings"
	"time"

	"github.com/mihob/mihob/internal/warp"
)

func (s *Server) handleWARPRegister(w http.ResponseWriter, r *http.Request) {
	var req struct {
		Protocol string `json:"protocol"` // "wireguard" | "masque"
		License  string `json:"license"`
		JWT      string `json:"jwt"`
		NodeID   *int64 `json:"node_id,omitempty"`
		Source   string `json:"source,omitempty"` // "" | "auto" | "agent" | "hub"
	}
	if err := decodeJSON(r, &req); err != nil {
		writeError(w, http.StatusBadRequest, "invalid request body")
		return
	}

	proto := strings.ToLower(strings.TrimSpace(req.Protocol))
	if proto == "" {
		proto = "wireguard"
	}
	if proto != "wireguard" && proto != "masque" {
		writeError(w, http.StatusBadRequest, warp.ErrInvalidProtocol.Error())
		return
	}

	source := strings.ToLower(strings.TrimSpace(req.Source))
	if source == "" {
		source = "auto"
	}
	if source != "auto" && source != "agent" && source != "hub" {
		writeError(w, http.StatusBadRequest, "invalid register source")
		return
	}

	ctx, cancel := context.WithTimeout(r.Context(), 28*time.Second)
	defer cancel()

	// Route through target Agent when explicitly requested, or in auto mode when the target node is online
	if req.NodeID != nil && *req.NodeID > 0 && (source == "agent" || (source == "auto" && s.ws != nil && s.ws.IsNodeOnline(*req.NodeID))) {
		res, err := s.ws.RegisterWARPOnNode(ctx, *req.NodeID, proto, req.License, req.JWT)
		if err == nil {
			writeJSON(w, http.StatusOK, res)
			return
		}
		if source == "agent" {
			writeError(w, http.StatusBadGateway, err.Error())
			return
		}
		// In auto mode, fall back to Hub if Agent failed or timed out
	} else if source == "agent" {
		writeError(w, http.StatusBadRequest, "target node is required and must be online for agent-side registration")
		return
	}

	res, err := warp.Register(ctx, proto, req.License, req.JWT)
	if err != nil {
		if errors.Is(err, warp.ErrInvalidProtocol) {
			writeError(w, http.StatusBadRequest, err.Error())
			return
		}
		writeError(w, http.StatusBadGateway, err.Error())
		return
	}
	res.RegisteredBy = "hub"
	writeJSON(w, http.StatusOK, res)
}
