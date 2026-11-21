package hub

import (
	"context"
	"log"
	"time"

	"github.com/mihob/mihob/internal/acme"
	"github.com/mihob/mihob/internal/db"
)

type Scheduler struct {
	store *db.Store
	ws    *WSManager
	acme  *acme.Manager

	// Tracks which users were last known active so expiration triggers exactly one push+kick.
	knownActive map[int64]bool
}

func NewScheduler(store *db.Store, ws *WSManager, acmeMgr *acme.Manager) *Scheduler {
	return &Scheduler{
		store:       store,
		ws:          ws,
		acme:        acmeMgr,
		knownActive: make(map[int64]bool),
	}
}

func (s *Scheduler) Start(ctx context.Context) {
	ticker := time.NewTicker(60 * time.Second)
	acmeTicker := time.NewTicker(6 * time.Hour)
	defer ticker.Stop()
	defer acmeTicker.Stop()

	s.tickExpirationAndResets()

	for {
		select {
		case <-ctx.Done():
			return
		case <-ticker.C:
			s.tickExpirationAndResets()
		case <-acmeTicker.C:
			s.tickACMERenew()
			_ = s.store.PruneOldTrafficHourly(95)
		}
	}
}

func (s *Scheduler) tickExpirationAndResets() {
	now := time.Now().UTC()

	// 1. Check user expirations
	users, err := s.store.ListUsers()
	if err == nil {
		nodesToSync := map[int64][]string{}
		for _, u := range users {
			active := u.IsActive(now)
			if prev, exists := s.knownActive[u.ID]; exists && prev && !active {
				log.Printf("[scheduler] user %s became inactive (expired/quota), revoking on %d nodes", u.Username, len(u.NodeIDs))
				for _, nid := range u.NodeIDs {
					nodesToSync[nid] = append(nodesToSync[nid], u.Username, u.UUID)
				}
			}
			s.knownActive[u.ID] = active
		}
		for nid, idents := range nodesToSync {
			_ = s.ws.PushConfigToNode(nid)
			_ = s.ws.KickUsersOnNode(nid, idents)
		}
	}

	// 2. Check monthly node traffic reset day
	nodes, err := s.store.ListNodes()
	if err == nil {
		for _, n := range nodes {
			if !shouldResetNodeTraffic(n.ResetDay, n.LastResetAt, now) {
				continue
			}
			wasExceeded := n.IsQuotaExceeded()
			if err := s.store.ResetNodeTraffic(n.ID); err == nil {
				log.Printf("[scheduler] monthly reset traffic for node #%d (%s)", n.ID, n.Name)
				if wasExceeded {
					_ = s.ws.PushConfigToNode(n.ID)
				}
			}
		}
	}
}

func daysInMonth(year int, month time.Month) int {
	return time.Date(year, month+1, 0, 0, 0, 0, 0, time.UTC).Day()
}

func shouldResetNodeTraffic(resetDay int, lastResetAt *time.Time, now time.Time) bool {
	if resetDay < 1 || resetDay > 31 {
		return false
	}
	nowUTC := now.UTC()
	effectiveDay := min(resetDay, daysInMonth(nowUTC.Year(), nowUTC.Month()))
	if nowUTC.Day() != effectiveDay {
		return false
	}
	if lastResetAt != nil {
		lastUTC := lastResetAt.UTC()
		if lastUTC.Year() == nowUTC.Year() &&
			lastUTC.Month() == nowUTC.Month() &&
			lastUTC.Day() == nowUTC.Day() {
			return false
		}
	}
	return true
}

func (s *Scheduler) tickACMERenew() {
	renewBefore := time.Now().UTC().Add(30 * 24 * time.Hour)
	certs, err := s.store.ListAutoRenewCerts(renewBefore)
	if err != nil {
		return
	}
	for _, c := range certs {
		log.Printf("[acme] auto-renewing certificate #%d (%s)", c.ID, c.Domain)
		res, err := s.acme.Issue(acme.IssueRequest{
			Domain:      c.Domain,
			SANs:        c.SANs,
			Email:       c.ACMEEmail,
			Provider:    c.ACMEProvider,
			Credentials: c.ACMECredentials,
		})
		if err != nil {
			log.Printf("[acme] renew cert #%d failed: %v", c.ID, err)
			c.LastError = err.Error()
			_ = s.store.UpdateCertificate(&c)
			continue
		}
		c.CertPEM = res.CertPEM
		c.KeyPEM = res.KeyPEM
		c.Issuer = res.Meta.Issuer
		c.NotBefore = &res.Meta.NotBefore
		c.NotAfter = &res.Meta.NotAfter
		c.LastError = ""
		if err := s.store.UpdateCertificate(&c); err != nil {
			continue
		}
		if nids, err := s.store.ListNodeIDsByCert(c.ID); err == nil {
			s.ws.PushConfigToNodes(nids)
		}
	}
}
