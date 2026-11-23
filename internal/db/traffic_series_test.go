package db

import (
	"fmt"
	"path/filepath"
	"testing"
	"time"

	"github.com/mihob/mihob/internal/model"
)

func TestQueryEntityTrafficSeriesTopNAndFilter(t *testing.T) {
	store, err := Open(filepath.Join(t.TempDir(), "test.db"))
	if err != nil {
		t.Fatalf("open db: %v", err)
	}
	defer store.Close()

	// Create 7 nodes and record hourly traffic for each
	nowBucket := time.Now().UTC().Format("2006-01-02 15:00")
	var nodeIDs []int64
	for i := 1; i <= 7; i++ {
		n := &model.Node{
			Name:    fmt.Sprintf("Node-%d", i),
			Host:    fmt.Sprintf("n%d.example.com", i),
			Enabled: true,
		}
		if err := store.CreateNode(n); err != nil {
			t.Fatalf("create node %d: %v", i, err)
		}
		nodeIDs = append(nodeIDs, n.ID)
		// Higher index => more traffic so ordering is deterministic
		if err := store.RecordTrafficHourly(n.ID, int64(i*100), int64(i*200)); err != nil {
			t.Fatalf("record traffic node %d: %v", i, err)
		}
	}

	series, err := store.QueryTrafficSeries("24h")
	if err != nil {
		t.Fatalf("query traffic series: %v", err)
	}
	buckets := make([]string, len(series))
	for i, p := range series {
		buckets[i] = p.Bucket
	}

	// Default Top-5 + Others folding when > 5 nodes exist
	topSeries, err := store.QueryNodeTrafficSeries("24h", buckets, nil, 5)
	if err != nil {
		t.Fatalf("query top node series: %v", err)
	}
	if len(topSeries) != 6 {
		t.Fatalf("expected 5 top nodes + 1 other bucket, got %d", len(topSeries))
	}
	if topSeries[0].Name != "Node-7" || topSeries[0].Total != 2100 {
		t.Fatalf("unexpected top node: %+v", topSeries[0])
	}
	other := topSeries[5]
	if !other.IsOther || other.OtherCount != 2 || other.Total != (300+600) {
		t.Fatalf("unexpected other bucket: %+v", other)
	}
	if len(other.Points) != 1 || other.Points[0].Bucket != nowBucket {
		t.Fatalf("unexpected other points: %+v", other.Points)
	}

	// Explicit filter picks specific lower-traffic nodes directly without Others
	filtered, err := store.QueryNodeTrafficSeries("24h", buckets, []int64{nodeIDs[0], nodeIDs[1]}, 5)
	if err != nil {
		t.Fatalf("query filtered node series: %v", err)
	}
	if len(filtered) != 2 {
		t.Fatalf("expected 2 filtered nodes, got %d", len(filtered))
	}
	if filtered[0].Name != "Node-2" || filtered[1].Name != "Node-1" {
		t.Fatalf("unexpected filtered ordering: %+v", filtered)
	}
}
