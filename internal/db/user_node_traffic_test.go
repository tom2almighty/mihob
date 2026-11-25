package db

import (
	"path/filepath"
	"testing"
	"time"

	"github.com/mihob/mihob/internal/model"
)

func TestUserNodeTrafficSeriesAndPrune(t *testing.T) {
	store, err := Open(filepath.Join(t.TempDir(), "test.db"))
	if err != nil {
		t.Fatalf("open db: %v", err)
	}
	defer store.Close()

	n1 := &model.Node{Name: "JP-01", Host: "jp1.example.com", Token: "tok1", Enabled: true}
	n2 := &model.Node{Name: "HK-01", Host: "hk1.example.com", Token: "tok2", Enabled: true}
	if err := store.CreateNode(n1); err != nil {
		t.Fatalf("create n1: %v", err)
	}
	if err := store.CreateNode(n2); err != nil {
		t.Fatalf("create n2: %v", err)
	}

	u1 := &model.User{Username: "alice", UUID: "u-1", Password: "p1", SubToken: "s1", Enabled: true}
	u2 := &model.User{Username: "bob", UUID: "u-2", Password: "p2", SubToken: "s2", Enabled: true}
	if err := store.CreateUser(u1); err != nil {
		t.Fatalf("create u1: %v", err)
	}
	if err := store.CreateUser(u2); err != nil {
		t.Fatalf("create u2: %v", err)
	}

	if err := store.RecordUserNodeTrafficHourly(u1.ID, n1.ID, 100, 400); err != nil {
		t.Fatalf("record u1 n1: %v", err)
	}
	if err := store.RecordUserNodeTrafficHourly(u1.ID, n2.ID, 50, 150); err != nil {
		t.Fatalf("record u1 n2: %v", err)
	}
	if err := store.RecordUserNodeTrafficHourly(u2.ID, n1.ID, 200, 800); err != nil {
		t.Fatalf("record u2 n1: %v", err)
	}

	base, err := store.QueryTrafficSeries("24h")
	if err != nil {
		t.Fatalf("query base: %v", err)
	}
	buckets := make([]string, len(base))
	for i, pt := range base {
		buckets[i] = pt.Bucket
	}

	// Mode 1: Fixed user u1 -> split by node
	byNode, err := store.QueryUserNodeTrafficSeries("24h", buckets, u1.ID, 0, nil, 5)
	if err != nil {
		t.Fatalf("query by user: %v", err)
	}
	if len(byNode) != 2 || byNode[0].Name != "JP-01" || byNode[0].Total != 500 || byNode[1].Name != "HK-01" || byNode[1].Total != 200 {
		t.Fatalf("unexpected user->node series: %+v", byNode)
	}

	// Mode 2: Fixed node n1 -> split by user
	byUser, err := store.QueryUserNodeTrafficSeries("24h", buckets, 0, n1.ID, nil, 5)
	if err != nil {
		t.Fatalf("query by node: %v", err)
	}
	if len(byUser) != 2 || byUser[0].Name != "bob" || byUser[0].Total != 1000 || byUser[1].Name != "alice" || byUser[1].Total != 500 {
		t.Fatalf("unexpected node->user series: %+v", byUser)
	}

	// Mode 3: All pairs -> top 2 + other
	allPairs, err := store.QueryUserNodeTrafficSeries("24h", buckets, 0, 0, nil, 2)
	if err != nil {
		t.Fatalf("query all pairs: %v", err)
	}
	if len(allPairs) != 3 || allPairs[0].Name != "bob · JP-01" || !allPairs[2].IsOther || allPairs[2].Total != 200 {
		t.Fatalf("unexpected all pairs series: %+v", allPairs)
	}

	// Verify old bucket pruning includes traffic_user_node_hourly
	oldBucket := time.Now().UTC().AddDate(0, 0, -120).Format("2006-01-02 15:00")
	if _, err := store.db.Exec(
		`INSERT INTO traffic_user_node_hourly(bucket, user_id, node_id, upload, download) VALUES(?, ?, ?, 10, 20)`,
		oldBucket, u1.ID, n1.ID,
	); err != nil {
		t.Fatalf("insert old bucket: %v", err)
	}
	deleted, _, err := store.CleanupMaintenanceData(90, false)
	if err != nil {
		t.Fatalf("cleanup maintenance: %v", err)
	}
	if deleted != 1 {
		t.Fatalf("expected 1 deleted row from traffic_user_node_hourly, got %d", deleted)
	}
}
