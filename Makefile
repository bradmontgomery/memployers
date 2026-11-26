# ==============================================================================
# MEMployers 2026 — Greater Memphis IT Employers & Skills Intelligence Hub
# Static GitHub Pages (`docs/`) + SQLite WebAssembly Build Pipeline
# ==============================================================================

SHELL       := /bin/sh
SQLITE3     ?= sqlite3
PYTHON      ?= python3
PORT        ?= 8080

SQL_SRC     := memphis_it_jobs_2026.sql
DB_FILE     := memphis_it_jobs_2026.db
DOCS_DIR    := docs
DOCS_DB     := $(DOCS_DIR)/memphis_it_jobs_2026.db
DELTAS      := $(sort $(wildcard weekly_delta_*.sql))

.DEFAULT_GOAL := build
.PHONY: all build db apply-delta bundle verify serve clean help
.DELETE_ON_ERROR:

all: build ## Alias for `build`

build: db bundle verify ## Full build: compile SQLite DB, enrich taxonomy, bundle docs/, and verify

db: $(DB_FILE) ## Rebuild SQLite database from SQL source + weekly deltas, then enrich skill/corridor tables

$(DB_FILE): $(SQL_SRC) $(DELTAS) analytics.py
	@echo "==> [1/3] Building $(DB_FILE) from $(SQL_SRC)..."
	rm -f $(DB_FILE)
	$(SQLITE3) -bail $(DB_FILE) < $(SQL_SRC)
	@for f in $(DELTAS); do \
		echo "    applying $$f"; \
		$(SQLITE3) -bail $(DB_FILE) < $$f || exit 1; \
	done
	@echo "==> [2/3] Enriching $(DB_FILE) with canonical skills, corridors, and analytical views..."
	$(PYTHON) analytics.py --enrich-db

apply-delta: ## Apply one weekly delta to the existing DB (usage: make apply-delta DELTA=weekly_delta_YYYY_MM_DD.sql)
	@test -n "$(DELTA)" || { echo "Usage: make apply-delta DELTA=weekly_delta_YYYY_MM_DD.sql" >&2; exit 1; }
	@test -f "$(DELTA)" || { echo "Error: delta file '$(DELTA)' not found" >&2; exit 1; }
	@test -f "$(DB_FILE)" || { echo "Error: $(DB_FILE) not found; run 'make db' first" >&2; exit 1; }
	@echo "==> Backing up $(DB_FILE) to $(DB_FILE).backup..."
	cp $(DB_FILE) $(DB_FILE).backup
	@echo "==> Applying $(DELTA) (stops on first error)..."
	$(SQLITE3) -bail $(DB_FILE) < $(DELTA)
	@echo "==> Checking integrity and foreign keys..."
	@test "$$($(SQLITE3) $(DB_FILE) 'PRAGMA integrity_check;')" = "ok" || { echo "Error: integrity_check failed" >&2; exit 1; }
	@test -z "$$($(SQLITE3) $(DB_FILE) 'PRAGMA foreign_key_check;')" || { echo "Error: foreign_key_check failed" >&2; exit 1; }
	@echo "==> Re-enriching skill/corridor tables..."
	$(PYTHON) analytics.py --enrich-db
	@echo "==> Totals: $$($(SQLITE3) $(DB_FILE) 'SELECT COUNT(*) FROM companies;') companies, $$($(SQLITE3) $(DB_FILE) 'SELECT COUNT(*) FROM job_postings;') jobs"

bundle: $(DOCS_DB) ## Copy the SQLite DB into docs/ for the in-browser app

$(DOCS_DB): $(DB_FILE)
	@echo "==> [3/3] Copying $(DB_FILE) to $(DOCS_DB) for GitHub Pages..."
	$(PYTHON) analytics.py --bundle-docs
	touch $(DOCS_DIR)/.nojekyll

verify: $(DOCS_DB) ## Run integrity checks on SQLite DB, skill coverage, SQL slices, and docs/ assets
	@echo "==> Verifying build artifacts..."
	$(PYTHON) analytics.py --verify

serve: build ## Serve `docs/` locally with Python's static HTTP server (default PORT=8080)
	@echo "🚀 Previewing GitHub Pages site at http://127.0.0.1:$(PORT)"
	$(PYTHON) -m http.server $(PORT) --bind 127.0.0.1 --directory $(DOCS_DIR)

clean: ## Remove generated SQLite databases and compiled bundle files
	@echo "==> Cleaning generated build artifacts..."
	rm -f $(DB_FILE) $(DOCS_DB)
	rm -rf __pycache__

help: ## Show available Make targets
	@echo "MEMployers 2026 — Static GitHub Pages & SQLite WebAssembly Build System"
	@echo ""
	@echo "Usage:"
	@echo "  make <target> [PORT=8080]"
	@echo ""
	@echo "Targets:"
	@awk 'BEGIN {FS = ":.*##"} /^[a-zA-Z_-]+:.*?##/ { printf "  \033[36m%-12s\033[0m %s\n", $$1, $$2 }' $(MAKEFILE_LIST)
