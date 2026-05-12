.PHONY: install dev build test lint format check clean reset help

help: ## Show this help
	@grep -E '^[a-zA-Z_-]+:.*?## .*$$' $(MAKEFILE_LIST) | awk 'BEGIN {FS = ":.*?## "}; {printf "  \033[36m%-12s\033[0m %s\n", $$1, $$2}'

install: ## Install all workspace dependencies
	pnpm install

dev: ## Run the active dev workflow (whatever app has a dev script)
	pnpm dev

build: ## Build all workspaces in topological order
	pnpm build

test: ## Run all tests
	pnpm test

lint: ## Lint all workspaces
	pnpm lint

format: ## Format all files with prettier
	pnpm format

check: ## Compile + lint + test (what CI runs)
	pnpm check

clean: ## Remove build artifacts
	pnpm -r exec rm -rf .turbo dist coverage
	rm -rf .turbo

reset: clean ## clean + remove all node_modules
	rm -rf node_modules apps/*/node_modules packages/*/node_modules
