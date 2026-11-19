.PHONY: web build test clean docker-hub docker-agent

web:
	cd web && pnpm install && pnpm build

build: web
	go build -trimpath -ldflags="-s -w" -o bin/mihob ./cmd/mihob

test:
	go test -v ./...

docker-hub:
	docker build -f deploy/Dockerfile.hub -t mihob-hub:latest .

docker-agent:
	docker build -f deploy/Dockerfile.agent -t mihob-agent:latest .

clean:
	rm -rf bin mihob mihob.exe web/dist
