# ==============================================================================
# MEMployers 2026 — Greater Memphis IT Employers & Skills Intelligence Hub
# Static GitHub Pages (`docs/`) + SQLite WebAssembly Build Pipeline
# ==============================================================================

SHELL       := /bin/sh
UV          ?= uv
RUN         := $(UV) run
MEMPLOYERS  := $(RUN) python -m memployers
PORT        ?= 8080

SQL_SRC     := memphis_it_jobs_2026.sql
DB_FILE     := memphis_it_jobs_2026.db
DOCS_DIR    := docs
DOCS_DB     := $(DOCS_DIR)/memphis_it_jobs_2026.db
DELTAS      := $(sort $(wildcard weekly_delta_*.sql))
TAXONOMY    := $(wildcard taxonomy/*.toml)
PY_SRC      := $(wildcard src/memployers/*.py)
PY_PATHS    := src tests tools

.DEFAULT_GOAL := build
.PHONY: all build db apply-delta bundle verify serve lint format typecheck test crap ci clean help
.DELETE_ON_ERROR:

all: build ## Alias for `build`

# ------------------------------------------------------------------------------
# Data build
# ------------------------------------------------------------------------------
build: db bundle verify ## Full build: rebuild + enrich the DB, copy it into docs/, and verify

db: $(DB_FILE) ## Rebuild the DB from the baseline SQL + all weekly deltas, then enrich it

$(DB_FILE): $(SQL_SRC) $(DELTAS) $(TAXONOMY) $(PY_SRC)
	@echo "==> [1/3] Building $(DB_FILE) from $(SQL_SRC) + weekly deltas..."
	$(MEMPLOYERS) build-db
	@echo "==> [2/3] Enriching $(DB_FILE) with canonical skills, corridors, and analytical views..."
	$(MEMPLOYERS) enrich

apply-delta: ## Apply one weekly delta to the existing DB (usage: make apply-delta DELTA=weekly_delta_YYYY_MM_DD.sql)
	@test -n "$(DELTA)" || { echo "Usage: make apply-delta DELTA=weekly_delta_YYYY_MM_DD.sql" >&2; exit 1; }
	$(MEMPLOYERS) apply-delta "$(DELTA)"
	$(MEMPLOYERS) enrich

bundle: $(DOCS_DB) ## Copy the SQLite DB into docs/ for the in-browser app

$(DOCS_DB): $(DB_FILE)
	@echo "==> [3/3] Copying $(DB_FILE) to $(DOCS_DB) for GitHub Pages..."
	$(MEMPLOYERS) bundle
	touch $(DOCS_DIR)/.nojekyll

verify: $(DOCS_DB) ## Check the DB, skill coverage of active jobs, curated SQL slices, and docs/ assets
	@echo "==> Verifying build artifacts..."
	$(MEMPLOYERS) verify

serve: build ## Serve `docs/` locally with Python's static HTTP server (default PORT=8080)
	@echo "🚀 Previewing GitHub Pages site at http://127.0.0.1:$(PORT)"
	$(RUN) python -m http.server $(PORT) --bind 127.0.0.1 --directory $(DOCS_DIR)

# ------------------------------------------------------------------------------
# Code quality
# ------------------------------------------------------------------------------
lint: ## Lint (ruff) and check formatting
	$(RUN) ruff check $(PY_PATHS)
	$(RUN) ruff format --check $(PY_PATHS)

format: ## Auto-format and auto-fix Python code
	$(RUN) ruff format $(PY_PATHS)
	$(RUN) ruff check --fix $(PY_PATHS)

typecheck: ## Type-check with ty
	$(RUN) ty check

test: ## Run tests with coverage (fails below 90%); writes coverage.json for `make crap`
	$(RUN) pytest --cov --cov-report=term --cov-report=json

crap: ## Fail if any function's CRAP score (complexity x missing coverage) exceeds 30
	@test -f coverage.json || $(MAKE) --no-print-directory test
	$(RUN) python tools/crap.py --coverage coverage.json

ci: lint typecheck test crap build ## Everything CI runs: lint, types, tests, CRAP, then the full build

clean: ## Remove generated databases and test/coverage output
	@echo "==> Cleaning generated build artifacts..."
	rm -f $(DB_FILE) $(DOCS_DB) $(DB_FILE).tmp coverage.json .coverage
	rm -rf .pytest_cache .ruff_cache
	find . -name __pycache__ -type d -prune -not -path "./.venv/*" -exec rm -rf {} +

help: ## Show available Make targets
	@echo "MEMployers 2026 — Static GitHub Pages & SQLite WebAssembly Build System"
	@echo ""
	@echo "Usage:"
	@echo "  make <target> [PORT=8080] [DELTA=weekly_delta_YYYY_MM_DD.sql]"
	@echo ""
	@echo "Targets:"
	@awk 'BEGIN {FS = ":.*##"} /^[a-zA-Z_-]+:.*?##/ { printf "  \033[36m%-12s\033[0m %s\n", $$1, $$2 }' $(MAKEFILE_LIST)
