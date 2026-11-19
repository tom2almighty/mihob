package main

import (
	"context"
	"flag"
	"fmt"
	"log"
	"net/http"
	"os"
	"os/signal"
	"path/filepath"
	"syscall"
	"time"

	"github.com/mihob/mihob/internal/agent"
	"github.com/mihob/mihob/internal/db"
	"github.com/mihob/mihob/internal/hub"
	"github.com/mihob/mihob/web"
)

var Version = "0.1.0"

func main() {
	if len(os.Args) < 2 {
		printUsage()
		os.Exit(1)
	}

	switch os.Args[1] {
	case "hub":
		runHub(os.Args[2:])
	case "agent":
		runAgent(os.Args[2:])
	case "version", "-v", "--version":
		fmt.Printf("mihob %s\n", Version)
	default:
		printUsage()
		os.Exit(1)
	}
}

func printUsage() {
	fmt.Println(`mihob — Multi-node & multi-user Mihomo deployment control plane

Usage:
  mihob hub    [flags]   Start the central Hub management server
  mihob agent  [flags]   Start the Node Agent supervising mihomo
  mihob version          Show version`)
}

func envOr(key, fallback string) string {
	if v := os.Getenv(key); v != "" {
		return v
	}
	return fallback
}

func runHub(args []string) {
	fs := flag.NewFlagSet("hub", flag.ExitOnError)
	listen := fs.String("listen", envOr("MIHOB_LISTEN", ":8080"), "HTTP listen address")
	dataDir := fs.String("data", envOr("MIHOB_DATA_DIR", "./data"), "Data directory for SQLite and ACME")
	adminUser := fs.String("admin-user", envOr("MIHOB_ADMIN_USER", "admin"), "Initial admin username")
	adminPass := fs.String("admin-pass", envOr("MIHOB_ADMIN_PASS", ""), "Initial admin password")
	_ = fs.Parse(args)

	store, err := db.Open(filepath.Join(*dataDir, "mihob.db"))
	if err != nil {
		log.Fatalf("[hub] open database: %v", err)
	}
	defer store.Close()

	created, initPass, err := store.EnsureAdmin(*adminUser, *adminPass)
	if err != nil {
		log.Fatalf("[hub] ensure admin: %v", err)
	}
	if created {
		log.Printf("[hub] initialized default admin account -> username: %s | password: %s", *adminUser, initPass)
	}

	webFS, err := web.FS()
	if err != nil {
		log.Printf("[hub] warning: embedded web UI unavailable: %v", err)
	}

	srv, err := hub.NewServer(hub.Config{
		Store:   store,
		DataDir: *dataDir,
		WebFS:   webFS,
		Version: Version,
	})
	if err != nil {
		log.Fatalf("[hub] init server: %v", err)
	}

	ctx, stop := signal.NotifyContext(context.Background(), syscall.SIGINT, syscall.SIGTERM)
	defer stop()
	srv.StartBackground(ctx)

	httpSrv := &http.Server{
		Addr:              *listen,
		Handler:           srv.Router(),
		ReadHeaderTimeout: 15 * time.Second,
	}

	go func() {
		log.Printf("[hub] mihob %s listening on %s (data=%s)", Version, *listen, *dataDir)
		if err := httpSrv.ListenAndServe(); err != nil && err != http.ErrServerClosed {
			log.Fatalf("[hub] listen error: %v", err)
		}
	}()

	<-ctx.Done()
	log.Printf("[hub] shutting down...")
	shutCtx, cancel := context.WithTimeout(context.Background(), 5*time.Second)
	defer cancel()
	_ = httpSrv.Shutdown(shutCtx)
}

func runAgent(args []string) {
	fs := flag.NewFlagSet("agent", flag.ExitOnError)
	hubURL := fs.String("hub", envOr("MIHOB_HUB_URL", ""), "Hub server URL (e.g. https://hub.example.com)")
	token := fs.String("token", envOr("MIHOB_NODE_TOKEN", ""), "Node authentication token")
	dataDir := fs.String("data", envOr("MIHOB_DATA_DIR", "./agent-data"), "Agent data directory")
	mihomoBin := fs.String("mihomo-bin", envOr("MIHOB_MIHOMO_BIN", "mihomo"), "Path to mihomo binary")
	_ = fs.Parse(args)

	if *hubURL == "" || *token == "" {
		log.Fatalf("[agent] --hub (MIHOB_HUB_URL) and --token (MIHOB_NODE_TOKEN) are required")
	}

	ctx, stop := signal.NotifyContext(context.Background(), syscall.SIGINT, syscall.SIGTERM)
	defer stop()

	ag := agent.New(agent.Config{
		HubURL:    *hubURL,
		NodeToken: *token,
		DataDir:   *dataDir,
		MihomoBin: *mihomoBin,
		Version:   Version,
	})
	if err := ag.Run(ctx); err != nil {
		log.Fatalf("[agent] exited with error: %v", err)
	}
}
