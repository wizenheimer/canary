# canary — developer task runner
#
# Thin, self-documenting wrapper over pnpm + turbo. Run `make` (or `make help`)
# for the menu. Workspace-scoped targets go through `turbo --filter` so the
# topological build graph (^build) is respected — e.g. building/testing the
# browser first builds the daemon it embeds.

.DEFAULT_GOAL := help

# Local dev tools (turbo, ultracite) live in root devDependencies and aren't on
# PATH inside recipes, so invoke them via `pnpm exec`. We use `pnpm exec` rather
# than `pnpm <script>` for ultracite doctor specifically: the `pnpm run` wrapper
# trips a benign "Load npm builtin configs failed" warning and hides the doctor
# TUI when stdout isn't a terminal.
EXEC  := pnpm exec
TURBO := $(EXEC) turbo

# Workspace filter aliases.
BROWSER := @canary/browser
DAEMON  := @canary/daemon
UI      := @canary/ui
CLI     := @canary/cli

.PHONY: help install hooks outdated clean reset \
        dev dev-browser dev-daemon dev-ui dev-cli \
        build build-browser build-daemon build-ui build-cli \
        typecheck lint format doctor \
        test test-browser test-daemon test-ui test-cli \
        watch-browser watch-daemon watch-ui watch-cli \
        check ci ui

##@ General

help: ## Show this help
	@awk 'BEGIN {FS = ":.*##"; printf "\nUsage:\n  make \033[36m<target>\033[0m\n"} \
		/^[a-zA-Z0-9_-]+:.*?##/ { printf "  \033[36m%-16s\033[0m %s\n", $$1, $$2 } \
		/^##@/ { printf "\n\033[1m%s\033[0m\n", substr($$0, 5) }' $(MAKEFILE_LIST)

install: ## Install all workspace dependencies
	pnpm install

hooks: ## (Re)install git hooks (husky)
	pnpm prepare

outdated: ## List outdated dependencies across all workspaces
	pnpm outdated -r

clean: ## Remove build artifacts and caches (keeps node_modules)
	pnpm clean

reset: clean ## clean + remove all node_modules (full re-install needed after)
	rm -rf node_modules apps/*/node_modules packages/*/node_modules

##@ Develop

dev: ## Run every workspace's dev script (turbo, parallel + persistent)
	pnpm dev

dev-browser: ## Run the canary-browser CLI from source (tsx)
	$(TURBO) run dev --filter=$(BROWSER)

dev-daemon: ## Run the daemon from source (tsx)
	$(TURBO) run dev --filter=$(DAEMON)

dev-ui: ## Run the session viewer in dev mode (next dev)
	$(TURBO) run dev --filter=$(UI)

dev-cli: ## Run the canary session orchestrator from source (tsx)
	$(TURBO) run dev --filter=$(CLI)

##@ Build

build: ## Build all workspaces in topological order
	pnpm build

build-browser: ## Build canary-browser (builds + embeds the daemon first)
	$(TURBO) run build --filter=$(BROWSER)

build-daemon: ## Build the daemon bundle + sandbox client
	$(TURBO) run build --filter=$(DAEMON)

build-ui: ## Build the session viewer (next build, standalone)
	$(TURBO) run build --filter=$(UI)

build-cli: ## Build the canary session orchestrator
	$(TURBO) run build --filter=$(CLI)

##@ Quality

typecheck: ## Type-check every workspace (tsc --noEmit)
	pnpm typecheck

lint: ## Lint + format-check with ultracite (biome) — no writes
	pnpm lint

format: ## Auto-fix lint + formatting with ultracite (biome)
	pnpm format

doctor: ## Verify the ultracite/biome setup is healthy
	$(EXEC) ultracite doctor

##@ Test

test: ## Run all tests
	pnpm test

test-browser: ## Test canary-browser
	$(TURBO) run test --filter=$(BROWSER)

test-daemon: ## Test the daemon
	$(TURBO) run test --filter=$(DAEMON)

test-ui: ## Test the session viewer
	$(TURBO) run test --filter=$(UI)

test-cli: ## Test the canary session orchestrator
	$(TURBO) run test --filter=$(CLI)

watch-browser: build-daemon ## Watch-test canary-browser (needs daemon built)
	pnpm --filter $(BROWSER) test:watch

watch-daemon: ## Watch-test the daemon
	pnpm --filter $(DAEMON) test:watch

watch-ui: ## Watch-test the session viewer
	pnpm --filter $(UI) test:watch

watch-cli: ## Watch-test the canary session orchestrator
	pnpm --filter $(CLI) test:watch

##@ CI

check: ## What CI runs: ultracite check + turbo compile + test
	pnpm check

ci: ## Full CI gate from clean: frozen install + check
	pnpm install --frozen-lockfile
	pnpm check

##@ Run

ui: build-ui ## Build and serve the local session viewer
	pnpm --filter $(UI) start
