package notify

import (
	"context"
	"path/filepath"
	"strings"
	"sync"
	"testing"
	"time"

	"github.com/mihob/mihob/internal/db"
	"github.com/mihob/mihob/internal/model"
)

func TestMaskURLAndDetectProvider(t *testing.T) {
	cases := []struct {
		raw      string
		provider string
		notWant  string
	}{
		{"telegram://123456:ABCDEFSECRETTOKEN@telegram?chats=-10012345", "telegram", "ABCDEFSECRETTOKEN"},
		{"bark://:myVerySecretBarkKey@api.day.app?group=mihob", "bark", "myVerySecretBarkKey"},
		{"discord://superSecretToken1234@123456789012345678", "discord", "superSecretToken1234"},
		{"smtp://user:s3cr3tPass@smtp.example.com:587/?from=a@b.com&to=c@d.com&encryption=Auto", "smtp", "s3cr3tPass"},
		{"generic+https://hooks.example.com/notify?template=json&method=PUT&titlekey=t&messagekey=m&token=topsecretvalue", "generic", "topsecretvalue"},
	}
	for _, tc := range cases {
		if err := ValidateURL(tc.raw); err != nil {
			t.Fatalf("ValidateURL(%q) failed: %v", tc.raw, err)
		}
		if got := DetectProvider(tc.raw); got != tc.provider {
			t.Fatalf("DetectProvider(%q) = %q, want %q", tc.raw, got, tc.provider)
		}
		masked := MaskURL(tc.raw)
		if strings.Contains(masked, tc.notWant) {
			t.Fatalf("MaskURL(%q) leaked secret %q: %s", tc.raw, tc.notWant, masked)
		}
	}
}

func TestShouldRunSchedule(t *testing.T) {
	loc := ParseScheduleLocation("Asia/Shanghai")
	makeNow := func(y int, m time.Month, d, hh, mm int) time.Time {
		return time.Date(y, m, d, hh, mm, 0, 0, loc)
	}
	ptr := func(v time.Time) *time.Time { return &v }

	daily := &model.NotificationSchedule{
		Enabled:   true,
		Frequency: "daily",
		TimeOfDay: "09:00",
		Timezone:  "Asia/Shanghai",
	}
	if !ShouldRunSchedule(daily, makeNow(2026, time.May, 10, 9, 0)) {
		t.Fatal("expected daily schedule to match at 09:00")
	}
	if ShouldRunSchedule(daily, makeNow(2026, time.May, 10, 8, 59)) {
		t.Fatal("expected daily schedule NOT to match before 09:00")
	}
	daily.LastRunAt = ptr(makeNow(2026, time.May, 10, 9, 0).UTC())
	if ShouldRunSchedule(daily, makeNow(2026, time.May, 10, 9, 5)) {
		t.Fatal("expected daily schedule NOT to run twice on same day")
	}
	if !ShouldRunSchedule(daily, makeNow(2026, time.May, 11, 9, 1)) {
		t.Fatal("expected daily schedule to run next day")
	}

	weekly := &model.NotificationSchedule{
		Enabled:   true,
		Frequency: "weekly",
		Weekday:   1, // Monday
		TimeOfDay: "08:30",
		Timezone:  "Asia/Shanghai",
	}
	// 2026-05-11 is Monday
	if !ShouldRunSchedule(weekly, makeNow(2026, time.May, 11, 8, 30)) {
		t.Fatal("expected weekly Monday schedule to match on Monday")
	}
	if ShouldRunSchedule(weekly, makeNow(2026, time.May, 12, 8, 30)) {
		t.Fatal("expected weekly Monday schedule NOT to match on Tuesday")
	}

	monthly := &model.NotificationSchedule{
		Enabled:    true,
		Frequency:  "monthly",
		DayOfMonth: 31,
		TimeOfDay:  "10:00",
		Timezone:   "Asia/Shanghai",
	}
	if !ShouldRunSchedule(monthly, makeNow(2026, time.April, 30, 10, 0)) {
		t.Fatal("expected monthly day 31 schedule to clamp to April 30")
	}
}

func TestBuildScheduledReportModes(t *testing.T) {
	now := time.Date(2026, time.May, 10, 1, 0, 0, 0, time.UTC)
	exp := now.Add(5 * 24 * time.Hour)
	nodes := []model.Node{
		{
			ID:           1,
			Name:         "Tokyo-01",
			Online:       true,
			TrafficLimit: 100 * 1024 * 1024 * 1024,
			TrafficUsed:  30 * 1024 * 1024 * 1024,
			ExpireAt:     &exp,
		},
	}

	scUsed := &model.NotificationSchedule{
		Name:               "日报",
		Timezone:           "Asia/Shanghai",
		TrafficDisplayMode: "used",
		IncludeSummary:     true,
		IncludeNodeTraffic: true,
		IncludeExpiring:    true,
	}
	_, bodyUsed := BuildScheduledReport(scUsed, nodes, nil, nil, now)
	if !strings.Contains(bodyUsed, "已用 30.0 GB") || !strings.Contains(bodyUsed, "(30%)") {
		t.Fatalf("unexpected used report body:\n%s", bodyUsed)
	}
	if !strings.Contains(bodyUsed, "Tokyo-01") || !strings.Contains(bodyUsed, "到期") {
		t.Fatalf("expected expiring notice in report:\n%s", bodyUsed)
	}

	scRem := *scUsed
	scRem.TrafficDisplayMode = "remaining"
	_, bodyRem := BuildScheduledReport(&scRem, nodes, nil, nil, now)
	if !strings.Contains(bodyRem, "剩余 70.0 GB") || !strings.Contains(bodyRem, "(70%)") {
		t.Fatalf("unexpected remaining report body:\n%s", bodyRem)
	}
}

func TestNodeOfflineDebounceAndTrafficThreshold(t *testing.T) {
	store, err := db.Open(filepath.Join(t.TempDir(), "test.db"))
	if err != nil {
		t.Fatalf("open db: %v", err)
	}
	defer store.Close()

	ch := &model.NotificationChannel{
		Name:     "Mock",
		Provider: "generic",
		URL:      "generic+https://example.com/hook",
		Enabled:  true,
	}
	if err := store.CreateNotificationChannel(ch); err != nil {
		t.Fatalf("create channel: %v", err)
	}

	rules := model.DefaultNotificationRules()
	rules.NodeOfflineDelaySec = 0 // immediate for fast test
	if _, err := store.SaveNotificationRules(rules); err != nil {
		t.Fatalf("save rules: %v", err)
	}

	var mu sync.Mutex
	var sentTitles []string
	svc := NewService(store)
	svc.sendFn = func(ctx context.Context, rawURL, title, message string) error {
		mu.Lock()
		sentTitles = append(sentTitles, title)
		mu.Unlock()
		return nil
	}

	ctx, cancel := context.WithCancel(context.Background())
	defer cancel()
	go svc.Start(ctx)

	node := &model.Node{ID: 1, Name: "JP-01", TrafficLimit: 1000}
	// First connect should NOT send recovery alert
	svc.OnNodeConnected(node)
	// Disconnect triggers offline alert
	svc.OnNodeDisconnected(node)
	// Reconnect triggers recovery alert
	svc.OnNodeConnected(node)
	// Crossing 80% threshold twice should only alert once
	svc.NotifyNodeTrafficThreshold(node, 700, 850)
	svc.NotifyNodeTrafficThreshold(node, 750, 860)

	deadline := time.Now().Add(2 * time.Second)
	for time.Now().Before(deadline) {
		mu.Lock()
		n := len(sentTitles)
		mu.Unlock()
		if n >= 3 {
			break
		}
		time.Sleep(20 * time.Millisecond)
	}

	mu.Lock()
	defer mu.Unlock()
	if len(sentTitles) != 3 {
		t.Fatalf("expected 3 notifications (offline, online, threshold), got %d: %v", len(sentTitles), sentTitles)
	}
}
