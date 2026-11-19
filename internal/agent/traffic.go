package agent

import (
	"context"
	"log"
	"sync"
	"time"

	"github.com/mihob/mihob/internal/protocol"
)

type connPrev struct {
	upload      int64
	download    int64
	inboundName string
	inboundUser string
}

type userKey struct {
	inboundName string
	inboundUser string
}

type TrafficCollector struct {
	sup *MihomoSupervisor

	mu                sync.Mutex
	pendingNodeUp     int64
	pendingNodeDown   int64
	pendingUsers      map[userKey][2]int64 // [up, down]
	activeConnections int
	upRate            int64
	downRate          int64
	memUsed           uint64
}

func NewTrafficCollector(sup *MihomoSupervisor) *TrafficCollector {
	return &TrafficCollector{
		sup:          sup,
		pendingUsers: make(map[userKey][2]int64),
	}
}

func (t *TrafficCollector) Start(ctx context.Context) {
	go t.runLoop(ctx)
}

func (t *TrafficCollector) runLoop(ctx context.Context) {
	for {
		select {
		case <-ctx.Done():
			return
		default:
		}

		conn, err := t.sup.DialConnectionsWS(ctx, 500)
		if err != nil {
			select {
			case <-ctx.Done():
				return
			case <-time.After(2 * time.Second):
				continue
			}
		}

		prevConns := make(map[string]connPrev)
		var prevTotalUp, prevTotalDown int64
		var prevTime time.Time
		initialized := false

		for {
			var snap connSnapshot
			if err := conn.ReadJSON(&snap); err != nil {
				_ = conn.Close()
				if ctx.Err() != nil {
					return
				}
				log.Printf("[traffic] mihomo /connections ws disconnected: %v", err)
				break
			}

			now := time.Now()
			var nodeUpDelta, nodeDownDelta int64
			if initialized {
				if snap.UploadTotal >= prevTotalUp {
					nodeUpDelta = snap.UploadTotal - prevTotalUp
				} else {
					// mihomo restarted
					nodeUpDelta = snap.UploadTotal
					prevConns = make(map[string]connPrev)
				}
				if snap.DownloadTotal >= prevTotalDown {
					nodeDownDelta = snap.DownloadTotal - prevTotalDown
				} else {
					nodeDownDelta = snap.DownloadTotal
				}
			}
			prevTotalUp = snap.UploadTotal
			prevTotalDown = snap.DownloadTotal

			// Track per-connection user deltas
			nextConns := make(map[string]connPrev, len(snap.Connections))
			userDeltas := make(map[userKey][2]int64)
			for _, c := range snap.Connections {
				prev, existed := prevConns[c.ID]
				var dUp, dDown int64
				if existed {
					if c.Upload > prev.upload {
						dUp = c.Upload - prev.upload
					}
					if c.Download > prev.download {
						dDown = c.Download - prev.download
					}
				} else if initialized {
					// Newly observed connection since previous tick
					dUp = c.Upload
					dDown = c.Download
				}

				if (dUp > 0 || dDown > 0) && c.Metadata.InboundUser != "" {
					k := userKey{
						inboundName: c.Metadata.InboundName,
						inboundUser: c.Metadata.InboundUser,
					}
					cur := userDeltas[k]
					cur[0] += dUp
					cur[1] += dDown
					userDeltas[k] = cur
				}

				nextConns[c.ID] = connPrev{
					upload:      c.Upload,
					download:    c.Download,
					inboundName: c.Metadata.InboundName,
					inboundUser: c.Metadata.InboundUser,
				}
			}
			prevConns = nextConns

			var upRate, downRate int64
			if initialized {
				elapsed := now.Sub(prevTime).Seconds()
				if elapsed > 0.05 {
					upRate = int64(float64(nodeUpDelta) / elapsed)
					downRate = int64(float64(nodeDownDelta) / elapsed)
				}
			}
			prevTime = now
			initialized = true

			t.mu.Lock()
			t.pendingNodeUp += nodeUpDelta
			t.pendingNodeDown += nodeDownDelta
			for k, v := range userDeltas {
				cur := t.pendingUsers[k]
				cur[0] += v[0]
				cur[1] += v[1]
				t.pendingUsers[k] = cur
			}
			t.activeConnections = len(snap.Connections)
			t.upRate = upRate
			t.downRate = downRate
			t.memUsed = snap.Memory
			t.mu.Unlock()
		}

		select {
		case <-ctx.Done():
			return
		case <-time.After(2 * time.Second):
		}
	}
}

func (t *TrafficCollector) SnapshotLive() (activeConns int, upRate, downRate int64, memUsed uint64) {
	t.mu.Lock()
	defer t.mu.Unlock()
	return t.activeConnections, t.upRate, t.downRate, t.memUsed
}

func (t *TrafficCollector) DrainReport() *protocol.TrafficReportPayload {
	t.mu.Lock()
	defer t.mu.Unlock()
	if t.pendingNodeUp == 0 && t.pendingNodeDown == 0 && len(t.pendingUsers) == 0 {
		return nil
	}
	users := make([]protocol.UserTrafficDelta, 0, len(t.pendingUsers))
	for k, v := range t.pendingUsers {
		users = append(users, protocol.UserTrafficDelta{
			InboundName: k.inboundName,
			InboundUser: k.inboundUser,
			Upload:      v[0],
			Download:    v[1],
		})
	}
	rep := &protocol.TrafficReportPayload{
		NodeUpload:   t.pendingNodeUp,
		NodeDownload: t.pendingNodeDown,
		Users:        users,
	}
	t.pendingNodeUp = 0
	t.pendingNodeDown = 0
	t.pendingUsers = make(map[userKey][2]int64)
	return rep
}
