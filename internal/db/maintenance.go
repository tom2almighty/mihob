package db

import (
	"fmt"
	"os"
	"time"
)

type DatabaseStats struct {
	DBPath           string           `json:"db_path"`
	DBSizeBytes      int64            `json:"db_size_bytes"`
	WALSizeBytes     int64            `json:"wal_size_bytes"`
	SHMSizeBytes     int64            `json:"shm_size_bytes"`
	TotalSizeBytes   int64            `json:"total_size_bytes"`
	PageSize         int64            `json:"page_size"`
	PageCount        int64            `json:"page_count"`
	FreelistCount    int64            `json:"freelist_count"`
	ReclaimableBytes int64            `json:"reclaimable_bytes"`
	JournalMode      string           `json:"journal_mode"`
	TableCounts      map[string]int64 `json:"table_counts"`
}

func fileSizeOrZero(path string) int64 {
	if path == "" {
		return 0
	}
	if info, err := os.Stat(path); err == nil {
		return info.Size()
	}
	return 0
}

func (s *Store) totalDiskSize() (dbSize, walSize, shmSize int64) {
	dbSize = fileSizeOrZero(s.path)
	walSize = fileSizeOrZero(s.path + "-wal")
	shmSize = fileSizeOrZero(s.path + "-shm")
	return dbSize, walSize, shmSize
}

func (s *Store) GetDatabaseStats() (*DatabaseStats, error) {
	dbSize, walSize, shmSize := s.totalDiskSize()
	stats := &DatabaseStats{
		DBPath:         s.path,
		DBSizeBytes:    dbSize,
		WALSizeBytes:   walSize,
		SHMSizeBytes:   shmSize,
		TotalSizeBytes: dbSize + walSize + shmSize,
		TableCounts:    make(map[string]int64),
	}

	_ = s.db.QueryRow(`PRAGMA page_size`).Scan(&stats.PageSize)
	_ = s.db.QueryRow(`PRAGMA page_count`).Scan(&stats.PageCount)
	_ = s.db.QueryRow(`PRAGMA freelist_count`).Scan(&stats.FreelistCount)
	_ = s.db.QueryRow(`PRAGMA journal_mode`).Scan(&stats.JournalMode)
	stats.ReclaimableBytes = stats.FreelistCount * stats.PageSize

	tables := []string{
		"nodes",
		"inbounds",
		"users",
		"certificates",
		"templates",
		"traffic_hourly",
		"notification_logs",
	}
	for _, tbl := range tables {
		var cnt int64
		if err := s.db.QueryRow(fmt.Sprintf(`SELECT COUNT(*) FROM %s`, tbl)).Scan(&cnt); err == nil {
			stats.TableCounts[tbl] = cnt
		}
	}
	return stats, nil
}

// VacuumAndCheckpoint flushes WAL, runs VACUUM to compact free pages, and optimizes SQLite statistics.
func (s *Store) VacuumAndCheckpoint() (beforeBytes, afterBytes int64, err error) {
	dbB, walB, shmB := s.totalDiskSize()
	beforeBytes = dbB + walB + shmB

	if _, err := s.db.Exec(`PRAGMA wal_checkpoint(TRUNCATE)`); err != nil {
		return beforeBytes, beforeBytes, fmt.Errorf("wal checkpoint: %w", err)
	}
	if _, err := s.db.Exec(`VACUUM`); err != nil {
		return beforeBytes, beforeBytes, fmt.Errorf("vacuum: %w", err)
	}
	_, _ = s.db.Exec(`PRAGMA wal_checkpoint(TRUNCATE)`)
	_, _ = s.db.Exec(`PRAGMA optimize`)

	dbA, walA, shmA := s.totalDiskSize()
	afterBytes = dbA + walA + shmA
	return beforeBytes, afterBytes, nil
}

// CleanupMaintenanceData prunes old hourly traffic records and/or clears notification logs.
func (s *Store) CleanupMaintenanceData(trafficOlderThanDays int, clearNotificationLogs bool) (trafficDeleted, logsDeleted int64, err error) {
	if trafficOlderThanDays > 0 {
		cutoff := time.Now().UTC().AddDate(0, 0, -trafficOlderThanDays).Truncate(time.Hour)
		res, execErr := s.db.Exec(`DELETE FROM traffic_hourly WHERE bucket < ?`, cutoff)
		if execErr != nil {
			return 0, 0, fmt.Errorf("prune traffic_hourly: %w", execErr)
		}
		if n, _ := res.RowsAffected(); n > 0 {
			trafficDeleted = n
		}
	}
	if clearNotificationLogs {
		res, execErr := s.db.Exec(`DELETE FROM notification_logs`)
		if execErr != nil {
			return trafficDeleted, 0, fmt.Errorf("clear notification_logs: %w", execErr)
		}
		if n, _ := res.RowsAffected(); n > 0 {
			logsDeleted = n
		}
	}
	return trafficDeleted, logsDeleted, nil
}
