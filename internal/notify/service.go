package notify

import (
	"context"
	"errors"
	"fmt"
	"log"
	"math"
	"net"
	"net/netip"
	"net/url"
	"os"
	"slices"
	"sort"
	"strconv"
	"strings"
	"sync"
	"sync/atomic"
	"time"
	_ "time/tzdata"

	"github.com/nicholas-fedor/shoutrrr"
	"github.com/nicholas-fedor/shoutrrr/pkg/types"

	"github.com/mihob/mihob/internal/db"
	"github.com/mihob/mihob/internal/model"
)

type SendFunc func(ctx context.Context, rawURL, title, message string) error

type dispatchTask struct {
	eventType   string
	channelID   *int64
	channelName string
	rawURL      string
	title       string
	message     string
}

type ScheduleRunResult struct {
	Title          string   `json:"title"`
	Message        string   `json:"message"`
	TotalChannels  int      `json:"total_channels"`
	SuccessCount   int      `json:"success_count"`
	FailedCount    int      `json:"failed_count"`
	FailedChannels []string `json:"failed_channels,omitempty"`
}

type Service struct {
	store  *db.Store
	sendFn SendFunc

	queue chan dispatchTask

	mu              sync.Mutex
	dedupe          map[string]time.Time
	offlineTimers   map[int64]*time.Timer
	notifiedOffline map[int64]bool
	started         bool
}

func NewService(store *db.Store) *Service {
	return &Service{
		store:           store,
		sendFn:          defaultShoutrrrSend,
		queue:           make(chan dispatchTask, 128),
		dedupe:          make(map[string]time.Time),
		offlineTimers:   make(map[int64]*time.Timer),
		notifiedOffline: make(map[int64]bool),
	}
}

func defaultShoutrrrSend(ctx context.Context, rawURL, title, message string) error {
	params := types.Params{}
	if strings.TrimSpace(title) != "" {
		params.SetTitle(title)
	}
	return shoutrrr.SendContext(ctx, rawURL, message, &params)
}

func (s *Service) Start(ctx context.Context) {
	s.mu.Lock()
	if s.started {
		s.mu.Unlock()
		return
	}
	s.started = true
	s.mu.Unlock()

	for {
		select {
		case <-ctx.Done():
			s.cancelAllTimers()
			return
		case task := <-s.queue:
			s.executeTask(ctx, task)
		}
	}
}

func (s *Service) cancelAllTimers() {
	s.mu.Lock()
	defer s.mu.Unlock()
	for id, t := range s.offlineTimers {
		t.Stop()
		delete(s.offlineTimers, id)
	}
}

func (s *Service) executeTask(parentCtx context.Context, task dispatchTask) {
	sendCtx, cancel := context.WithTimeout(parentCtx, 15*time.Second)
	defer cancel()

	err := s.sendFn(sendCtx, task.rawURL, task.title, task.message)
	entry := &model.NotificationLog{
		EventType:   task.eventType,
		ChannelID:   task.channelID,
		ChannelName: task.channelName,
		Title:       task.title,
		Message:     truncateText(task.message, 2000),
		Status:      "success",
	}
	if err != nil {
		entry.Status = "failed"
		entry.Error = err.Error()
		log.Printf("[notify] send %s via %s failed: %v", task.eventType, task.channelName, err)
	}
	if s.store != nil {
		_ = s.store.CreateNotificationLog(entry)
	}
}

var disallowedWebhookPrefixes = func() []netip.Prefix {
	cidrs := []string{
		"0.0.0.0/8",
		"100.64.0.0/10",
		"192.0.0.0/24",
		"198.18.0.0/15",
		"240.0.0.0/4",
		"64:ff9b::/96",
	}
	out := make([]netip.Prefix, 0, len(cidrs))
	for _, c := range cidrs {
		if p, err := netip.ParsePrefix(c); err == nil {
			out = append(out, p)
		}
	}
	return out
}()

var defaultAllowPrivateWebhook atomic.Bool

// SetDefaultAllowPrivateWebhook configures the fallback SSRF private-webhook policy loaded from config.yaml.
// Environment variable MIHOB_ALLOW_PRIVATE_WEBHOOK still takes precedence when explicitly set.
func SetDefaultAllowPrivateWebhook(allow bool) {
	defaultAllowPrivateWebhook.Store(allow)
}

func allowPrivateWebhook() bool {
	if v := strings.TrimSpace(os.Getenv("MIHOB_ALLOW_PRIVATE_WEBHOOK")); v != "" {
		return strings.EqualFold(v, "true") || v == "1"
	}
	return defaultAllowPrivateWebhook.Load()
}

func isDisallowedWebhookIP(ip net.IP) bool {
	if ip == nil {
		return true
	}
	addr, ok := netip.AddrFromSlice(ip)
	if !ok {
		return true
	}
	addr = addr.Unmap()
	if !addr.IsValid() ||
		addr.IsLoopback() ||
		addr.IsPrivate() ||
		addr.IsLinkLocalUnicast() ||
		addr.IsLinkLocalMulticast() ||
		addr.IsMulticast() ||
		addr.IsUnspecified() {
		return true
	}
	for _, p := range disallowedWebhookPrefixes {
		if p.Contains(addr) {
			return true
		}
	}
	return false
}

// validateWebhookHost guards network-host Shoutrrr URLs against SSRF to loopback,
// cloud metadata, or private networks unless MIHOB_ALLOW_PRIVATE_WEBHOOK=true.
func validateWebhookHost(rawURL string) error {
	if allowPrivateWebhook() {
		return nil
	}
	u, err := url.Parse(rawURL)
	if err != nil {
		return nil
	}
	scheme := strings.ToLower(u.Scheme)
	// Skip schemes whose host segment is a virtual token/identifier rather than a network host
	switch scheme {
	case "telegram", "discord", "slack", "pushover", "pushbullet", "teams", "hangouts", "googlechat", "ifttt", "join", "opsgenie":
		return nil
	}
	host := strings.ToLower(strings.TrimSpace(u.Hostname()))
	if host == "" {
		return nil
	}
	if host == "localhost" || strings.HasSuffix(host, ".local") || strings.HasSuffix(host, ".internal") {
		return errors.New("local or internal webhook hostnames are not allowed (set MIHOB_ALLOW_PRIVATE_WEBHOOK=true to allow)")
	}
	if ip := net.ParseIP(host); ip != nil && isDisallowedWebhookIP(ip) {
		return errors.New("private, loopback, or metadata IP addresses are not allowed in notification URL (set MIHOB_ALLOW_PRIVATE_WEBHOOK=true to allow)")
	}
	return nil
}

func ValidateURL(rawURL string) error {
	trimmed := strings.TrimSpace(rawURL)
	if trimmed == "" {
		return errors.New("notification URL is required")
	}
	if err := validateWebhookHost(trimmed); err != nil {
		return err
	}
	sender, err := shoutrrr.CreateSenderWithOptions(types.SenderOptions{}, trimmed)
	if err != nil {
		return fmt.Errorf("invalid Shoutrrr URL: %w", err)
	}
	_ = sender.Close()
	return nil
}

func DetectProvider(rawURL string) string {
	trimmed := strings.TrimSpace(rawURL)
	scheme, _, found := strings.Cut(trimmed, "://")
	if !found {
		return "custom"
	}
	scheme = strings.ToLower(scheme)
	switch {
	case scheme == "telegram":
		return "telegram"
	case scheme == "bark":
		return "bark"
	case scheme == "discord":
		return "discord"
	case scheme == "smtp":
		return "smtp"
	case scheme == "generic" || strings.HasPrefix(scheme, "generic+"):
		return "generic"
	default:
		return "custom"
	}
}

func MaskURL(rawURL string) string {
	trimmed := strings.TrimSpace(rawURL)
	if trimmed == "" {
		return ""
	}
	u, err := url.Parse(trimmed)
	if err != nil || u.Scheme == "" {
		if len(trimmed) <= 10 {
			return "****"
		}
		return trimmed[:6] + "****" + trimmed[len(trimmed)-4:]
	}

	var b strings.Builder
	b.WriteString(u.Scheme)
	b.WriteString("://")

	if u.User != nil {
		user := u.User.Username()
		_, hasPass := u.User.Password()
		if user != "" {
			b.WriteString(maskSecretSegment(user))
		}
		if hasPass {
			b.WriteString(":****")
		}
		b.WriteByte('@')
	}

	host := u.Host
	if strings.EqualFold(u.Scheme, "discord") && host != "" {
		b.WriteString(maskSecretSegment(host))
	} else {
		b.WriteString(host)
	}

	if u.Path != "" && u.Path != "/" {
		parts := strings.Split(u.Path, "/")
		for i, p := range parts {
			if p == "" {
				continue
			}
			if len(p) >= 12 {
				parts[i] = maskSecretSegment(p)
			}
		}
		b.WriteString(strings.Join(parts, "/"))
	}

	if u.RawQuery != "" {
		q := u.Query()
		maskedQ := make([]string, 0, len(q))
		keys := make([]string, 0, len(q))
		for k := range q {
			keys = append(keys, k)
		}
		sort.Strings(keys)
		for _, k := range keys {
			lowerK := strings.ToLower(k)
			vals := q[k]
			for _, v := range vals {
				if strings.Contains(lowerK, "token") ||
					strings.Contains(lowerK, "secret") ||
					strings.Contains(lowerK, "pass") ||
					strings.Contains(lowerK, "key") ||
					strings.Contains(lowerK, "auth") {
					maskedQ = append(maskedQ, k+"=****")
				} else {
					maskedQ = append(maskedQ, k+"="+v)
				}
			}
		}
		if len(maskedQ) > 0 {
			b.WriteByte('?')
			b.WriteString(strings.Join(maskedQ, "&"))
		}
	}
	return b.String()
}

func maskSecretSegment(seg string) string {
	if len(seg) <= 4 {
		return "****"
	}
	if len(seg) <= 8 {
		return seg[:2] + "****"
	}
	return seg[:4] + "****" + seg[len(seg)-2:]
}

func (s *Service) shouldDedupe(key string, cooldown time.Duration) bool {
	if key == "" || cooldown <= 0 {
		return false
	}
	now := time.Now()
	s.mu.Lock()
	defer s.mu.Unlock()
	if exp, ok := s.dedupe[key]; ok && now.Before(exp) {
		return true
	}
	// Clean up stale entries occasionally
	if len(s.dedupe) > 512 {
		for k, exp := range s.dedupe {
			if now.After(exp) {
				delete(s.dedupe, k)
			}
		}
	}
	s.dedupe[key] = now.Add(cooldown)
	return false
}

func channelAcceptsEvent(ch model.NotificationChannel, eventType string) bool {
	if !ch.Enabled {
		return false
	}
	if len(ch.Events) == 0 {
		return true
	}
	return slices.Contains(ch.Events, eventType)
}

func (s *Service) Emit(eventType, title, message, dedupeKey string, cooldown time.Duration) {
	if s == nil || s.store == nil {
		return
	}
	if s.shouldDedupe(dedupeKey, cooldown) {
		return
	}
	channels, err := s.store.ListNotificationChannels()
	if err != nil {
		return
	}
	for i := range channels {
		ch := channels[i]
		if !channelAcceptsEvent(ch, eventType) {
			continue
		}
		chID := ch.ID
		task := dispatchTask{
			eventType:   eventType,
			channelID:   &chID,
			channelName: ch.Name,
			rawURL:      ch.URL,
			title:       title,
			message:     message,
		}
		select {
		case s.queue <- task:
		default:
			log.Printf("[notify] queue full, dropping %s for channel %s", eventType, ch.Name)
		}
	}
}

func (s *Service) SendTestChannel(channelID int64) error {
	if s == nil || s.store == nil {
		return errors.New("notification service unavailable")
	}
	ch, err := s.store.GetNotificationChannel(channelID)
	if err != nil {
		return err
	}
	return s.sendTestSync(&ch.ID, ch.Name, ch.URL)
}

func (s *Service) SendTestURL(rawURL string) error {
	if err := ValidateURL(rawURL); err != nil {
		return err
	}
	return s.sendTestSync(nil, DetectProvider(rawURL), strings.TrimSpace(rawURL))
}

func (s *Service) sendTestSync(channelID *int64, channelName, rawURL string) error {
	title := "Mihob 测试通知"
	msg := fmt.Sprintf("这是一条来自 Mihob 控制平面的测试通知。\n时间：%s", time.Now().Format("2006-01-02 15:04:05 MST"))

	ctx, cancel := context.WithTimeout(context.Background(), 15*time.Second)
	defer cancel()
	err := s.sendFn(ctx, rawURL, title, msg)

	entry := &model.NotificationLog{
		EventType:   model.NotifyEventTest,
		ChannelID:   channelID,
		ChannelName: channelName,
		Title:       title,
		Message:     msg,
		Status:      "success",
	}
	if err != nil {
		entry.Status = "failed"
		entry.Error = err.Error()
	}
	if s.store != nil {
		_ = s.store.CreateNotificationLog(entry)
	}
	return err
}

// --- Event Helpers ---

func (s *Service) getRules() (model.NotificationRules, bool) {
	if s == nil || s.store == nil {
		return model.NotificationRules{}, false
	}
	rules, err := s.store.GetNotificationRules()
	if err != nil || !rules.Enabled {
		return rules, false
	}
	return rules, true
}

func (s *Service) NotifyHubStarted(version string) {
	rules, ok := s.getRules()
	if !ok || !rules.HubStarted {
		return
	}
	title := "Mihob Hub 已启动"
	msg := fmt.Sprintf("Mihob Hub (%s) 已启动并开始监听服务。\n时间：%s", version, time.Now().Format("2006-01-02 15:04:05 MST"))
	s.Emit(model.NotifyEventHubStarted, title, msg, "", 0)
}

func (s *Service) OnNodeConnected(node *model.Node) {
	if s == nil || node == nil {
		return
	}
	s.mu.Lock()
	if t, ok := s.offlineTimers[node.ID]; ok {
		t.Stop()
		delete(s.offlineTimers, node.ID)
	}
	wasNotifiedOffline := s.notifiedOffline[node.ID]
	delete(s.notifiedOffline, node.ID)
	s.mu.Unlock()

	if !wasNotifiedOffline {
		return
	}
	rules, ok := s.getRules()
	if !ok || !rules.NodeOnline {
		return
	}
	title := fmt.Sprintf("节点已恢复上线 · %s", node.Name)
	msg := fmt.Sprintf("节点「%s」已重新连接到 Hub。\n时间：%s", node.Name, time.Now().Format("2006-01-02 15:04:05 MST"))
	s.Emit(model.NotifyEventNodeOnline, title, msg, "", 0)
}

func (s *Service) OnNodeDisconnected(node *model.Node) {
	if s == nil || node == nil {
		return
	}
	rules, ok := s.getRules()
	if !ok || !rules.NodeOffline {
		return
	}

	delay := time.Duration(rules.NodeOfflineDelaySec) * time.Second
	nodeID := node.ID
	nodeName := node.Name

	fire := func() {
		s.mu.Lock()
		delete(s.offlineTimers, nodeID)
		s.notifiedOffline[nodeID] = true
		s.mu.Unlock()

		// Re-check rule in case admin disabled it during delay
		r, enabled := s.getRules()
		if !enabled || !r.NodeOffline {
			return
		}
		title := fmt.Sprintf("节点离线告警 · %s", nodeName)
		msg := fmt.Sprintf("节点「%s」与 Hub 断开连接（已持续 %d 秒未恢复）。\n时间：%s", nodeName, r.NodeOfflineDelaySec, time.Now().Format("2006-01-02 15:04:05 MST"))
		s.Emit(model.NotifyEventNodeOffline, title, msg, "", 0)
	}

	s.mu.Lock()
	if old, ok := s.offlineTimers[nodeID]; ok {
		old.Stop()
	}
	if delay <= 0 {
		s.mu.Unlock()
		fire()
		return
	}
	s.offlineTimers[nodeID] = time.AfterFunc(delay, fire)
	s.mu.Unlock()
}

func (s *Service) NotifyNodeConfigError(node *model.Node, errMsg string) {
	rules, ok := s.getRules()
	if !ok || !rules.NodeConfigError || node == nil {
		return
	}
	title := fmt.Sprintf("节点配置异常 · %s", node.Name)
	msg := fmt.Sprintf("节点「%s」应用下发配置失败：\n%s", node.Name, strings.TrimSpace(errMsg))
	dedupeKey := fmt.Sprintf("node_cfg_err:%d:%s", node.ID, strings.TrimSpace(errMsg))
	s.Emit(model.NotifyEventNodeConfigError, title, msg, dedupeKey, 10*time.Minute)
}

func (s *Service) NotifyNodeUpgradeResult(node *model.Node, success bool, version, errMsg string) {
	rules, ok := s.getRules()
	if !ok || !rules.NodeUpgrade || node == nil {
		return
	}
	var title, msg string
	if success {
		title = fmt.Sprintf("节点内核升级成功 · %s", node.Name)
		msg = fmt.Sprintf("节点「%s」Mihomo 内核已成功升级至 %s。", node.Name, version)
	} else {
		title = fmt.Sprintf("节点内核升级失败 · %s", node.Name)
		msg = fmt.Sprintf("节点「%s」Mihomo 内核升级失败并已回滚：\n%s", node.Name, strings.TrimSpace(errMsg))
	}
	s.Emit(model.NotifyEventNodeUpgrade, title, msg, "", 0)
}

func (s *Service) NotifyNodeTrafficThreshold(node *model.Node, prevUsed, newUsed int64) {
	rules, ok := s.getRules()
	if !ok || !rules.NodeTrafficAlert || node == nil || node.TrafficLimit <= 0 {
		return
	}
	if len(rules.NodeTrafficThresholds) == 0 {
		return
	}
	prevPct := float64(prevUsed) * 100 / float64(node.TrafficLimit)
	newPct := float64(newUsed) * 100 / float64(node.TrafficLimit)

	// Find the highest threshold crossed in this update
	crossed := 0
	for _, th := range rules.NodeTrafficThresholds {
		if prevPct < float64(th) && newPct >= float64(th) && th > crossed {
			crossed = th
		}
	}
	if crossed == 0 {
		return
	}
	cycleTag := time.Now().UTC().Format("2006-01")
	if node.LastResetAt != nil {
		cycleTag = node.LastResetAt.UTC().Format("2006-01-02")
	}
	dedupeKey := fmt.Sprintf("node_traffic:%d:%s:%d", node.ID, cycleTag, crossed)
	remaining := max(int64(0), node.TrafficLimit-newUsed)
	title := fmt.Sprintf("节点流量告警 (%d%%) · %s", crossed, node.Name)
	msg := fmt.Sprintf(
		"节点「%s」流量已达到 %d%% 阈值。\n已用：%s / %s\n剩余：%s",
		node.Name, crossed, formatBytes(newUsed), formatBytes(node.TrafficLimit), formatBytes(remaining),
	)
	s.Emit(model.NotifyEventNodeTraffic, title, msg, dedupeKey, 31*24*time.Hour)
}

func (s *Service) NotifyNodeExpiring(node *model.Node, daysLeft int) {
	rules, ok := s.getRules()
	if !ok || !rules.NodeExpiring || node == nil || node.ExpireAt == nil {
		return
	}
	if daysLeft > rules.NodeExpiringDays {
		return
	}
	dayKey := time.Now().UTC().Format("2006-01-02")
	dedupeKey := fmt.Sprintf("node_expire:%d:%s", node.ID, dayKey)
	var title, statusLine string
	if daysLeft <= 0 {
		title = fmt.Sprintf("节点已过期 · %s", node.Name)
		statusLine = "该节点已到达或超过到期时间，请及时续费或处理。"
	} else {
		title = fmt.Sprintf("节点即将到期 (剩 %d 天) · %s", daysLeft, node.Name)
		statusLine = fmt.Sprintf("距离到期仅剩 %d 天（到期日：%s）。", daysLeft, node.ExpireAt.Format("2006-01-02"))
	}
	msg := fmt.Sprintf("节点「%s」续费提醒：\n%s", node.Name, statusLine)
	s.Emit(model.NotifyEventNodeExpiring, title, msg, dedupeKey, 24*time.Hour)
}

func (s *Service) NotifyCertRenew(cert *model.Certificate, success bool, errMsg string) {
	rules, ok := s.getRules()
	if !ok || !rules.CertRenew || cert == nil {
		return
	}
	var title, msg string
	if success {
		title = fmt.Sprintf("证书自动续签成功 · %s", cert.Domain)
		exp := "-"
		if cert.NotAfter != nil {
			exp = cert.NotAfter.Format("2006-01-02")
		}
		msg = fmt.Sprintf("证书「%s」(%s) 已自动续签成功并同步至关联节点。\n新有效期至：%s", cert.Name, cert.Domain, exp)
	} else {
		title = fmt.Sprintf("证书自动续签失败 · %s", cert.Domain)
		msg = fmt.Sprintf("证书「%s」(%s) 自动续签失败：\n%s", cert.Name, cert.Domain, strings.TrimSpace(errMsg))
	}
	s.Emit(model.NotifyEventCertRenew, title, msg, "", 0)
}

func (s *Service) NotifyCertExpiring(cert *model.Certificate, daysLeft int) {
	rules, ok := s.getRules()
	if !ok || !rules.CertExpiring || cert == nil || cert.NotAfter == nil {
		return
	}
	if daysLeft > rules.CertExpiringDays {
		return
	}
	dayKey := time.Now().UTC().Format("2006-01-02")
	dedupeKey := fmt.Sprintf("cert_expire:%d:%s", cert.ID, dayKey)
	var title, msg string
	if daysLeft <= 0 {
		title = fmt.Sprintf("证书已过期 · %s", cert.Domain)
		msg = fmt.Sprintf("证书「%s」(%s) 已过期，请尽快续签或替换。", cert.Name, cert.Domain)
	} else {
		title = fmt.Sprintf("证书即将过期 (剩 %d 天) · %s", daysLeft, cert.Domain)
		msg = fmt.Sprintf("证书「%s」(%s) 将于 %s 过期（剩余 %d 天）。", cert.Name, cert.Domain, cert.NotAfter.Format("2006-01-02"), daysLeft)
	}
	s.Emit(model.NotifyEventCertExpiring, title, msg, dedupeKey, 24*time.Hour)
}

func (s *Service) NotifyUserExhausted(user *model.User) {
	rules, ok := s.getRules()
	if !ok || !rules.UserExhausted || user == nil {
		return
	}
	dedupeKey := fmt.Sprintf("user_exhausted:%d:%s", user.ID, time.Now().UTC().Format("2006-01-02"))
	title := fmt.Sprintf("用户流量耗尽 · %s", user.Username)
	msg := fmt.Sprintf("用户「%s」已达到流量配额上限（%s / %s），已自动停止接入。", user.Username, formatBytes(user.TrafficUsed), formatBytes(user.TrafficLimit))
	s.Emit(model.NotifyEventUserExhausted, title, msg, dedupeKey, 6*time.Hour)
}

func (s *Service) NotifyAdminLoginFailed(username, remoteAddr string) {
	rules, ok := s.getRules()
	if !ok || !rules.AdminLoginFailed {
		return
	}
	dedupeKey := fmt.Sprintf("admin_login_fail:%s:%s", username, remoteAddr)
	title := "管理员登录失败告警"
	msg := fmt.Sprintf("检测到管理员登录失败。\n用户名：%s\n来源 IP：%s\n时间：%s", username, remoteAddr, time.Now().Format("2006-01-02 15:04:05 MST"))
	s.Emit(model.NotifyEventAdminLoginFail, title, msg, dedupeKey, 2*time.Minute)
}

// --- Scheduled Reports ---

func ParseScheduleLocation(tz string) *time.Location {
	tz = strings.TrimSpace(tz)
	if tz == "" {
		tz = "Asia/Shanghai"
	}
	loc, err := time.LoadLocation(tz)
	if err != nil {
		return time.UTC
	}
	return loc
}

func parseTimeOfDay(s string) (int, int, bool) {
	parts := strings.Split(strings.TrimSpace(s), ":")
	if len(parts) != 2 {
		return 0, 0, false
	}
	h, err1 := strconv.Atoi(parts[0])
	m, err2 := strconv.Atoi(parts[1])
	if err1 != nil || err2 != nil || h < 0 || h > 23 || m < 0 || m > 59 {
		return 0, 0, false
	}
	return h, m, true
}

func daysInMonth(year int, month time.Month) int {
	return time.Date(year, month+1, 0, 0, 0, 0, 0, time.UTC).Day()
}

func ShouldRunSchedule(sc *model.NotificationSchedule, now time.Time) bool {
	if sc == nil || !sc.Enabled {
		return false
	}
	hour, minute, ok := parseTimeOfDay(sc.TimeOfDay)
	if !ok {
		return false
	}
	loc := ParseScheduleLocation(sc.Timezone)
	localNow := now.In(loc)

	switch sc.Frequency {
	case "daily":
		// matches every day
	case "weekly":
		if int(localNow.Weekday()) != sc.Weekday {
			return false
		}
	case "monthly":
		dom := max(sc.DayOfMonth, 1)
		effectiveDay := min(dom, daysInMonth(localNow.Year(), localNow.Month()))
		if localNow.Day() != effectiveDay {
			return false
		}
	default:
		return false
	}

	target := time.Date(localNow.Year(), localNow.Month(), localNow.Day(), hour, minute, 0, 0, loc)
	// Must have reached scheduled HH:MM (within a 59-minute grace window in case of brief downtime,
	// and never run twice on the same local date).
	if localNow.Before(target) || localNow.Sub(target) >= time.Hour {
		return false
	}
	if sc.LastRunAt != nil {
		lastLocal := sc.LastRunAt.In(loc)
		if lastLocal.Year() == localNow.Year() &&
			lastLocal.Month() == localNow.Month() &&
			lastLocal.Day() == localNow.Day() {
			return false
		}
	}
	return true
}

func BuildScheduledReport(
	sc *model.NotificationSchedule,
	nodes []model.Node,
	users []model.User,
	certs []model.Certificate,
	now time.Time,
) (string, string) {
	loc := ParseScheduleLocation(sc.Timezone)
	localNow := now.In(loc)
	title := fmt.Sprintf("Mihob 定期报告 · %s", sc.Name)

	var b strings.Builder
	fmt.Fprintf(&b, "统计时间：%s\n", localNow.Format("2006-01-02 15:04 MST"))

	if sc.IncludeSummary {
		onlineNodes := 0
		var totalNodeTraffic int64
		for _, n := range nodes {
			if n.Online {
				onlineNodes++
			}
			totalNodeTraffic += n.TrafficUsed
		}
		activeUsers := 0
		for _, u := range users {
			if u.IsActive(now) {
				activeUsers++
			}
		}
		b.WriteString("\n【集群概览】\n")
		fmt.Fprintf(&b, "• 在线节点：%d / %d\n", onlineNodes, len(nodes))
		fmt.Fprintf(&b, "• 有效用户：%d / %d\n", activeUsers, len(users))
		fmt.Fprintf(&b, "• 节点累计流量：%s\n", formatBytes(totalNodeTraffic))
	}

	if sc.IncludeNodeTraffic {
		b.WriteString("\n【节点流量明细】\n")
		if len(nodes) == 0 {
			b.WriteString("• 暂无节点\n")
		} else {
			sorted := make([]model.Node, len(nodes))
			copy(sorted, nodes)
			sort.SliceStable(sorted, func(i, j int) bool {
				return sorted[i].TrafficUsed > sorted[j].TrafficUsed
			})
			limit := len(sorted)
			if sc.NodeLimit > 0 && sc.NodeLimit < limit {
				limit = sc.NodeLimit
			}
			for _, n := range sorted[:limit] {
				status := "离线"
				if n.Online {
					status = "在线"
				}
				if n.TrafficLimit <= 0 {
					fmt.Fprintf(&b, "• [%s] %s：已用 %s（不限）\n", status, n.Name, formatBytes(n.TrafficUsed))
					continue
				}
				usedPct := min(100, int(math.Round(float64(n.TrafficUsed)*100/float64(n.TrafficLimit))))
				if sc.TrafficDisplayMode == "remaining" {
					rem := max(int64(0), n.TrafficLimit-n.TrafficUsed)
					remPct := max(0, 100-usedPct)
					fmt.Fprintf(&b, "• [%s] %s：剩余 %s / %s (%d%%)\n", status, n.Name, formatBytes(rem), formatBytes(n.TrafficLimit), remPct)
				} else {
					fmt.Fprintf(&b, "• [%s] %s：已用 %s / %s (%d%%)\n", status, n.Name, formatBytes(n.TrafficUsed), formatBytes(n.TrafficLimit), usedPct)
				}
			}
			if limit < len(sorted) {
				fmt.Fprintf(&b, "… 及另外 %d 台节点\n", len(sorted)-limit)
			}
		}
	}

	if sc.IncludeExpiring {
		var lines []string
		for _, n := range nodes {
			if n.ExpireAt == nil {
				continue
			}
			days := int(math.Ceil(n.ExpireAt.Sub(now).Hours() / 24))
			if days <= 14 {
				if days <= 0 {
					lines = append(lines, fmt.Sprintf("• 节点「%s」已过期", n.Name))
				} else {
					lines = append(lines, fmt.Sprintf("• 节点「%s」剩 %d 天到期 (%s)", n.Name, days, n.ExpireAt.Format("2006-01-02")))
				}
			}
		}
		for _, c := range certs {
			if c.NotAfter == nil {
				continue
			}
			days := int(math.Ceil(c.NotAfter.Sub(now).Hours() / 24))
			if days <= 14 {
				if days <= 0 {
					lines = append(lines, fmt.Sprintf("• 证书「%s」(%s) 已过期", c.Name, c.Domain))
				} else {
					lines = append(lines, fmt.Sprintf("• 证书「%s」(%s) 剩 %d 天到期", c.Name, c.Domain, days))
				}
			}
		}
		if len(lines) > 0 {
			b.WriteString("\n【到期预警（14天内）】\n")
			for _, l := range lines {
				b.WriteString(l)
				b.WriteByte('\n')
			}
		}
	}

	if sc.IncludeTopUsers && len(users) > 0 {
		sorted := make([]model.User, len(users))
		copy(sorted, users)
		sort.SliceStable(sorted, func(i, j int) bool {
			return sorted[i].TrafficUsed > sorted[j].TrafficUsed
		})
		limit := min(5, len(sorted))
		hasTraffic := false
		for _, u := range sorted[:limit] {
			if u.TrafficUsed > 0 {
				hasTraffic = true
				break
			}
		}
		if hasTraffic {
			b.WriteString("\n【Top 流量用户】\n")
			for _, u := range sorted[:limit] {
				if u.TrafficUsed <= 0 {
					continue
				}
				if u.TrafficLimit > 0 {
					pct := min(100, int(math.Round(float64(u.TrafficUsed)*100/float64(u.TrafficLimit))))
					fmt.Fprintf(&b, "• %s：%s / %s (%d%%)\n", u.Username, formatBytes(u.TrafficUsed), formatBytes(u.TrafficLimit), pct)
				} else {
					fmt.Fprintf(&b, "• %s：%s（不限）\n", u.Username, formatBytes(u.TrafficUsed))
				}
			}
		}
	}

	return title, strings.TrimSpace(b.String())
}

func (s *Service) resolveScheduleChannels(sc *model.NotificationSchedule) ([]model.NotificationChannel, error) {
	all, err := s.store.ListNotificationChannels()
	if err != nil {
		return nil, err
	}
	filterSet := map[int64]bool{}
	for _, id := range sc.ChannelIDs {
		filterSet[id] = true
	}
	var out []model.NotificationChannel
	for _, ch := range all {
		if !ch.Enabled {
			continue
		}
		if len(filterSet) > 0 && !filterSet[ch.ID] {
			continue
		}
		out = append(out, ch)
	}
	return out, nil
}

func (s *Service) RunScheduleNow(scID int64, enrichFn func(*model.Node)) (*ScheduleRunResult, error) {
	if s == nil || s.store == nil {
		return nil, errors.New("notification service unavailable")
	}
	sc, err := s.store.GetNotificationSchedule(scID)
	if err != nil {
		return nil, err
	}
	channels, err := s.resolveScheduleChannels(sc)
	if err != nil {
		return nil, err
	}
	if len(channels) == 0 {
		return nil, errors.New("没有可用的已启用通知渠道")
	}
	nodes, _ := s.store.ListNodes()
	if enrichFn != nil {
		for i := range nodes {
			enrichFn(&nodes[i])
		}
	}
	users, _ := s.store.ListUsers()
	certs, _ := s.store.ListCertificates()

	now := time.Now().UTC()
	title, message := BuildScheduledReport(sc, nodes, users, certs, now)
	res := &ScheduleRunResult{
		Title:         title,
		Message:       message,
		TotalChannels: len(channels),
	}

	for i := range channels {
		ch := channels[i]
		chID := ch.ID
		ctx, cancel := context.WithTimeout(context.Background(), 15*time.Second)
		sendErr := s.sendFn(ctx, ch.URL, title, message)
		cancel()

		entry := &model.NotificationLog{
			EventType:   model.NotifyEventScheduledReport,
			ChannelID:   &chID,
			ChannelName: ch.Name,
			Title:       title,
			Message:     truncateText(message, 2000),
			Status:      "success",
		}
		if sendErr != nil {
			entry.Status = "failed"
			entry.Error = sendErr.Error()
			res.FailedCount++
			res.FailedChannels = append(res.FailedChannels, fmt.Sprintf("%s: %v", ch.Name, sendErr))
		} else {
			res.SuccessCount++
		}
		_ = s.store.CreateNotificationLog(entry)
	}
	return res, nil
}

func (s *Service) TickSchedules(now time.Time, enrichFn func(*model.Node)) {
	if s == nil || s.store == nil {
		return
	}
	schedules, err := s.store.ListNotificationSchedules()
	if err != nil || len(schedules) == 0 {
		return
	}
	var due []model.NotificationSchedule
	for _, sc := range schedules {
		if ShouldRunSchedule(&sc, now) {
			due = append(due, sc)
		}
	}
	if len(due) == 0 {
		return
	}

	nodes, _ := s.store.ListNodes()
	if enrichFn != nil {
		for i := range nodes {
			enrichFn(&nodes[i])
		}
	}
	users, _ := s.store.ListUsers()
	certs, _ := s.store.ListCertificates()

	for i := range due {
		sc := &due[i]
		_ = s.store.TouchNotificationScheduleRun(sc.ID, now)
		channels, err := s.resolveScheduleChannels(sc)
		if err != nil || len(channels) == 0 {
			continue
		}
		title, message := BuildScheduledReport(sc, nodes, users, certs, now)
		for j := range channels {
			ch := channels[j]
			chID := ch.ID
			task := dispatchTask{
				eventType:   model.NotifyEventScheduledReport,
				channelID:   &chID,
				channelName: ch.Name,
				rawURL:      ch.URL,
				title:       title,
				message:     message,
			}
			select {
			case s.queue <- task:
			default:
				log.Printf("[notify] queue full, dropping scheduled report %s for %s", sc.Name, ch.Name)
			}
		}
	}
}

func formatBytes(b int64) string {
	if b <= 0 {
		return "0 B"
	}
	units := []string{"B", "KB", "MB", "GB", "TB", "PB"}
	val := float64(b)
	idx := 0
	for val >= 1024 && idx < len(units)-1 {
		val /= 1024
		idx++
	}
	switch {
	case val >= 100:
		return fmt.Sprintf("%.0f %s", val, units[idx])
	case val >= 10:
		return fmt.Sprintf("%.1f %s", val, units[idx])
	default:
		return fmt.Sprintf("%.2f %s", val, units[idx])
	}
}

func truncateText(s string, maxLen int) string {
	runes := []rune(s)
	if len(runes) <= maxLen {
		return s
	}
	return string(runes[:maxLen]) + "…"
}
