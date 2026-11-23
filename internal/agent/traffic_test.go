package agent

import (
	"testing"

	"github.com/mihob/mihob/internal/protocol"
)

func TestTrafficCollectorDrainAndRestore(t *testing.T) {
	c := NewTrafficCollector(nil)
	c.mu.Lock()
	c.pendingNodeUp = 100
	c.pendingNodeDown = 250
	c.pendingUsers[userKey{inboundName: "vless-443", inboundUser: "alice"}] = [2]int64{40, 60}
	c.mu.Unlock()

	rep := c.DrainReport()
	if rep == nil || rep.NodeUpload != 100 || rep.NodeDownload != 250 || len(rep.Users) != 1 {
		t.Fatalf("unexpected drained report: %+v", rep)
	}
	if empty := c.DrainReport(); empty != nil {
		t.Fatalf("expected empty report after drain, got %+v", empty)
	}

	// Simulate failed WebSocket send -> restore report and accumulate additional delta
	c.RestoreReport(rep)
	c.RestoreReport(&protocol.TrafficReportPayload{
		NodeUpload:   50,
		NodeDownload: 75,
		Users: []protocol.UserTrafficDelta{
			{InboundName: "vless-443", InboundUser: "alice", Upload: 10, Download: 20},
		},
	})

	merged := c.DrainReport()
	if merged == nil || merged.NodeUpload != 150 || merged.NodeDownload != 325 {
		t.Fatalf("unexpected merged report after restore: %+v", merged)
	}
	if len(merged.Users) != 1 || merged.Users[0].Upload != 50 || merged.Users[0].Download != 80 {
		t.Fatalf("unexpected merged user traffic: %+v", merged.Users)
	}
}
