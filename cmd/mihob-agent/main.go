package main

import (
	"context"
	"flag"
	"fmt"
	"log"
	"os"
	"os/signal"
	"syscall"

	"github.com/mihob/mihob/internal/agent"
)

var Version = "0.1.0"

func main() {
	args := os.Args[1:]
	if len(args) > 0 {
		switch args[0] {
		case "version", "-v", "--version":
			fmt.Printf("mihob-agent %s\n", Version)
			return
		case "agent":
			args = args[1:]
		}
	}

	fs := flag.NewFlagSet("mihob-agent", flag.ExitOnError)
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

func envOr(key, fallback string) string {
	if v := os.Getenv(key); v != "" {
		return v
	}
	return fallback
}
