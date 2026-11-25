package db

import (
	"path/filepath"
	"testing"
)

func TestDatabaseStatsVacuumAndCleanup(t *testing.T) {
	store, err := Open(filepath.Join(t.TempDir(), "test.db"))
	if err != nil {
		t.Fatalf("Open: %v", err)
	}
	defer store.Close()

	stats, err := store.GetDatabaseStats()
	if err != nil {
		t.Fatalf("GetDatabaseStats: %v", err)
	}
	if stats.DBSizeBytes <= 0 || stats.PageSize <= 0 || stats.JournalMode == "" {
		t.Fatalf("unexpected db stats: %+v", stats)
	}
	if _, ok := stats.TableCounts["nodes"]; !ok {
		t.Fatalf("expected nodes table count in stats: %+v", stats.TableCounts)
	}

	before, after, err := store.VacuumAndCheckpoint()
	if err != nil {
		t.Fatalf("VacuumAndCheckpoint: %v", err)
	}
	if before <= 0 || after <= 0 {
		t.Fatalf("unexpected vacuum sizes: before=%d after=%d", before, after)
	}

	tDel, lDel, err := store.CleanupMaintenanceData(30, true)
	if err != nil {
		t.Fatalf("CleanupMaintenanceData: %v", err)
	}
	if tDel != 0 || lDel != 0 {
		t.Fatalf("expected 0 deleted on empty db, got traffic=%d logs=%d", tDel, lDel)
	}
}
