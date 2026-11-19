package hub

import (
	"testing"
	"time"
)

func TestShouldResetNodeTraffic(t *testing.T) {
	ts := func(year int, month time.Month, day int) time.Time {
		return time.Date(year, month, day, 12, 0, 0, 0, time.UTC)
	}
	ptr := func(v time.Time) *time.Time { return &v }

	cases := []struct {
		name        string
		resetDay    int
		lastResetAt *time.Time
		now         time.Time
		want        bool
	}{
		{
			name:     "standard day matches",
			resetDay: 15,
			now:      ts(2026, time.March, 15),
			want:     true,
		},
		{
			name:     "standard day does not match",
			resetDay: 15,
			now:      ts(2026, time.March, 14),
			want:     false,
		},
		{
			name:     "day 31 matches 31-day month",
			resetDay: 31,
			now:      ts(2026, time.January, 31),
			want:     true,
		},
		{
			name:     "day 31 clamps to 30 in April",
			resetDay: 31,
			now:      ts(2026, time.April, 30),
			want:     true,
		},
		{
			name:     "day 31 clamps to 28 in non-leap Feb",
			resetDay: 31,
			now:      ts(2026, time.February, 28),
			want:     true,
		},
		{
			name:     "day 31 clamps to 29 in leap Feb",
			resetDay: 31,
			now:      ts(2028, time.February, 29),
			want:     true,
		},
		{
			name:     "day 31 does not trigger on Feb 28 in leap year",
			resetDay: 31,
			now:      ts(2028, time.February, 28),
			want:     false,
		},
		{
			name:        "already reset today skips",
			resetDay:    31,
			lastResetAt: ptr(ts(2026, time.April, 30)),
			now:         ts(2026, time.April, 30),
			want:        false,
		},
		{
			name:        "reset last month triggers this month",
			resetDay:    31,
			lastResetAt: ptr(ts(2026, time.March, 31)),
			now:         ts(2026, time.April, 30),
			want:        true,
		},
		{
			name:     "out of range resetDay ignored",
			resetDay: 32,
			now:      ts(2026, time.March, 31),
			want:     false,
		},
	}

	for _, tc := range cases {
		t.Run(tc.name, func(t *testing.T) {
			if got := shouldResetNodeTraffic(tc.resetDay, tc.lastResetAt, tc.now); got != tc.want {
				t.Fatalf("shouldResetNodeTraffic(%d, %v, %v) = %v, want %v", tc.resetDay, tc.lastResetAt, tc.now, got, tc.want)
			}
		})
	}
}
