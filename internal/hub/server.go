package hub

import (
	"context"
	"encoding/json"
	"io/fs"
	"log"
	"net/http"
	"path"
	"strings"

	"github.com/go-chi/chi/v5"
	"github.com/go-chi/chi/v5/middleware"

	"github.com/mihob/mihob/internal/acme"
	"github.com/mihob/mihob/internal/crypto"
	"github.com/mihob/mihob/internal/db"
)

type Server struct {
	store     *db.Store
	ws        *WSManager
	acme      *acme.Manager
	mihomo    *MihomoReleaseManager
	scheduler *Scheduler
	jwtSecret string
	webFS     fs.FS
	version   string
}

type Config struct {
	Store   *db.Store
	DataDir string
	WebFS   fs.FS
	Version string
}

func NewServer(cfg Config) (*Server, error) {
	jwtSecret, err := cfg.Store.GetSetting("jwt_secret")
	if err != nil {
		return nil, err
	}
	acmeMgr := acme.NewManager(cfg.DataDir)
	mihomoMgr := NewMihomoReleaseManager(cfg.Store, cfg.DataDir)
	wsMgr := NewWSManager(cfg.Store)
	sched := NewScheduler(cfg.Store, wsMgr, acmeMgr)

	return &Server{
		store:     cfg.Store,
		ws:        wsMgr,
		acme:      acmeMgr,
		mihomo:    mihomoMgr,
		scheduler: sched,
		jwtSecret: jwtSecret,
		webFS:     cfg.WebFS,
		version:   cfg.Version,
	}, nil
}

func (s *Server) StartBackground(ctx context.Context) {
	go s.scheduler.Start(ctx)
}

func (s *Server) Router() http.Handler {
	r := chi.NewRouter()
	r.Use(middleware.RealIP)
	r.Use(middleware.Recoverer)
	r.Use(corsMiddleware)

	// ACME HTTP-01 challenge endpoint
	r.Get("/.well-known/acme-challenge/*", s.acme.ServeHTTPChallenge)

	// Public health, Agent WS, Install script
	r.Get("/healthz", func(w http.ResponseWriter, r *http.Request) {
		writeJSON(w, http.StatusOK, map[string]any{"status": "ok", "version": s.version})
	})
	r.Get("/ws/agent", s.ws.HandleAgentWS)
	r.Get("/install/agent.sh", s.handleInstallAgentScript)

	// API routes
	r.Route("/api", func(api chi.Router) {
		api.Post("/auth/login", s.handleLogin)
		// Public subscription info endpoint for the browser subscription page
		api.Get("/public/sub", s.handlePublicSubInfo)
		// Public active theme endpoint for login / subscription / initial render
		api.Get("/public/theme", s.handlePublicTheme)
		// Agent-authenticated mihomo binary download endpoint (X-Node-Token)
		api.Get("/agent/mihomo-binary", s.handleAgentMihomoBinary)

		// Protected Admin routes
		api.Group(func(pr chi.Router) {
			pr.Use(s.authMiddleware)

			pr.Get("/auth/me", s.handleMe)
			pr.Post("/auth/password", s.handleChangePassword)

			pr.Get("/dashboard", s.handleDashboard)

			// Nodes
			pr.Get("/nodes", s.handleListNodes)
			pr.Post("/nodes", s.handleCreateNode)
			pr.Put("/nodes/reorder", s.handleReorderNodes)
			pr.Get("/nodes/{id}", s.handleGetNode)
			pr.Put("/nodes/{id}", s.handleUpdateNode)
			pr.Delete("/nodes/{id}", s.handleDeleteNode)
			pr.Post("/nodes/{id}/reset-traffic", s.handleResetNodeTraffic)
			pr.Post("/nodes/{id}/regenerate-token", s.handleRegenerateNodeToken)
			pr.Post("/nodes/{id}/push-config", s.handlePushNodeConfig)
			pr.Post("/nodes/{id}/restart", s.handleRestartNode)
			pr.Post("/nodes/{id}/upgrade-mihomo", s.handleUpgradeNodeMihomo)
			pr.Post("/nodes/upgrade-mihomo", s.handleBatchUpgradeMihomo)
			pr.Get("/nodes/{id}/install", s.handleNodeInstallCommands)
			pr.Get("/mihomo/latest", s.handleLatestMihomo)

			// Inbounds
			pr.Get("/inbounds", s.handleListAllInbounds)
			pr.Get("/nodes/{id}/inbounds", s.handleListInbounds)
			pr.Post("/nodes/{id}/inbounds", s.handleCreateInbound)
			pr.Post("/nodes/{id}/inbounds/preview", s.handlePreviewInbound)
			pr.Put("/nodes/{id}/inbounds/reorder", s.handleReorderInbounds)
			pr.Put("/inbounds/{id}", s.handleUpdateInbound)
			pr.Delete("/inbounds/{id}", s.handleDeleteInbound)
			pr.Post("/tools/keygen", s.handleKeygen)

			// Certificates
			pr.Get("/certificates", s.handleListCertificates)
			pr.Post("/certificates", s.handleCreateCertificate)
			pr.Put("/certificates/reorder", s.handleReorderCertificates)
			pr.Post("/certificates/{id}/renew", s.handleRenewCertificate)
			pr.Delete("/certificates/{id}", s.handleDeleteCertificate)

			// Users
			pr.Get("/users", s.handleListUsers)
			pr.Post("/users", s.handleCreateUser)
			pr.Put("/users/reorder", s.handleReorderUsers)
			pr.Put("/users/{id}", s.handleUpdateUser)
			pr.Delete("/users/{id}", s.handleDeleteUser)
			pr.Post("/users/{id}/reset-traffic", s.handleResetUserTraffic)
			pr.Post("/users/{id}/rotate-token", s.handleRotateUserToken)

			// Templates
			pr.Get("/templates", s.handleListTemplates)
			pr.Post("/templates", s.handleCreateTemplate)
			pr.Put("/templates/{id}", s.handleUpdateTemplate)
			pr.Delete("/templates/{id}", s.handleDeleteTemplate)
			pr.Post("/templates/preview", s.handlePreviewTemplate)

			// Settings
			pr.Get("/settings", s.handleGetSettings)
			pr.Put("/settings", s.handleUpdateSettings)

			// Themes
			pr.Get("/themes", s.handleGetThemes)
			pr.Put("/themes", s.handleUpdateThemes)
			pr.Post("/themes/fetch", s.handleFetchThemeURL)
		})
	})

	// Dynamic subscription path handler + Embedded React SPA fallback
	r.NotFound(s.handleFallback)
	return r
}

func (s *Server) handleFallback(w http.ResponseWriter, r *http.Request) {
	if strings.HasPrefix(r.URL.Path, "/api/") {
		writeError(w, http.StatusNotFound, "endpoint not found")
		return
	}

	// Check dynamic subscription route: /{sub_path}/{token}
	if r.Method == http.MethodGet || r.Method == http.MethodHead {
		if token, ok := s.matchSubscriptionPath(r.URL.Path); ok {
			if isBrowserHTMLRequest(r) && s.webFS != nil {
				s.serveSPAIndex(w, r)
				return
			}
			s.serveSubscriptionYAML(w, r, token)
			return
		}
	}

	if s.webFS != nil {
		s.serveSPA(w, r)
		return
	}
	http.NotFound(w, r)
}

func (s *Server) serveSPA(w http.ResponseWriter, r *http.Request) {
	clean := strings.TrimPrefix(path.Clean(r.URL.Path), "/")
	if clean == "" || clean == "." {
		clean = "index.html"
	}
	if f, err := s.webFS.Open(clean); err == nil {
		stat, _ := f.Stat()
		_ = f.Close()
		if stat != nil && !stat.IsDir() {
			http.FileServer(http.FS(s.webFS)).ServeHTTP(w, r)
			return
		}
	}
	s.serveSPAIndex(w, r)
}

func (s *Server) serveSPAIndex(w http.ResponseWriter, r *http.Request) {
	b, err := fs.ReadFile(s.webFS, "index.html")
	if err != nil {
		http.NotFound(w, r)
		return
	}
	w.Header().Set("Content-Type", "text/html; charset=utf-8")
	_, _ = w.Write(b)
}

type ctxKey string

const adminClaimsKey ctxKey = "admin_claims"

func (s *Server) authMiddleware(next http.Handler) http.Handler {
	return http.HandlerFunc(func(w http.ResponseWriter, r *http.Request) {
		authHeader := r.Header.Get("Authorization")
		if !strings.HasPrefix(authHeader, "Bearer ") {
			writeError(w, http.StatusUnauthorized, "missing authorization token")
			return
		}
		tok := strings.TrimPrefix(authHeader, "Bearer ")
		claims, err := crypto.VerifyAdminJWT(s.jwtSecret, tok)
		if err != nil {
			writeError(w, http.StatusUnauthorized, "invalid or expired token")
			return
		}
		ctx := context.WithValue(r.Context(), adminClaimsKey, claims)
		next.ServeHTTP(w, r.WithContext(ctx))
	})
}

func getAdminClaims(r *http.Request) *crypto.AdminClaims {
	if v := r.Context().Value(adminClaimsKey); v != nil {
		if c, ok := v.(*crypto.AdminClaims); ok {
			return c
		}
	}
	return nil
}

func corsMiddleware(next http.Handler) http.Handler {
	return http.HandlerFunc(func(w http.ResponseWriter, r *http.Request) {
		w.Header().Set("Access-Control-Allow-Origin", "*")
		w.Header().Set("Access-Control-Allow-Headers", "Authorization, Content-Type, X-Node-Token")
		w.Header().Set("Access-Control-Allow-Methods", "GET, POST, PUT, PATCH, DELETE, OPTIONS")
		if r.Method == http.MethodOptions {
			w.WriteHeader(http.StatusNoContent)
			return
		}
		next.ServeHTTP(w, r)
	})
}

func writeJSON(w http.ResponseWriter, status int, data any) {
	w.Header().Set("Content-Type", "application/json; charset=utf-8")
	w.WriteHeader(status)
	if err := json.NewEncoder(w).Encode(data); err != nil {
		log.Printf("[http] encode json error: %v", err)
	}
}

func writeError(w http.ResponseWriter, status int, msg string) {
	writeJSON(w, status, map[string]string{"error": msg})
}

func decodeJSON(r *http.Request, dst any) error {
	dec := json.NewDecoder(r.Body)
	return dec.Decode(dst)
}

func (s *Server) resolvePublicURL(r *http.Request) string {
	if st, err := s.store.GetSystemSettings(); err == nil && strings.TrimSpace(st.HubPublicURL) != "" {
		return strings.TrimRight(strings.TrimSpace(st.HubPublicURL), "/")
	}
	scheme := "http"
	if r.TLS != nil || strings.EqualFold(r.Header.Get("X-Forwarded-Proto"), "https") {
		scheme = "https"
	}
	return scheme + "://" + r.Host
}
