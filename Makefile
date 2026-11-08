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
DOCS_BUNDLE := $(DOCS_DIR)/db_bundle.js

.DEFAULT_GOAL := build
.PHONY: all build db bundle verify serve clean help

all: build ## Alias for `build`

build: db bundle verify ## Full build: compile SQLite DB, enrich taxonomy, bundle docs/, and verify

db: $(DB_FILE) ## Rebuild SQLite database from SQL source and enrich with normalized skill/corridor tables

$(DB_FILE): $(SQL_SRC) analytics.py
	@echo "==> [1/3] Building $(DB_FILE) from $(SQL_SRC)..."
	rm -f $(DB_FILE)
	$(SQLITE3) $(DB_FILE) < $(SQL_SRC)
	@echo "==> [2/3] Enriching $(DB_FILE) with canonical skills, corridors, and analytical views..."
	$(PYTHON) analytics.py --enrich-db

bundle: $(DOCS_DB) $(DOCS_BUNDLE) ## Copy SQLite DB and generate WebAssembly/static bundle in docs/

$(DOCS_DB) $(DOCS_BUNDLE): $(DB_FILE) analytics.py
	@echo "==> [3/3] Bundling $(DOCS_DB) and $(DOCS_BUNDLE) for GitHub Pages..."
	$(PYTHON) analytics.py --bundle-docs
	touch $(DOCS_DIR)/.nojekyll

verify: $(DOCS_DB) $(DOCS_BUNDLE) ## Run integrity checks on SQLite DB, skill coverage, SQL slices, and docs/ assets
	@echo "==> Verifying build artifacts..."
	$(PYTHON) analytics.py --verify

serve: build ## Serve `docs/` locally with Python's static HTTP server (default PORT=8080)
	@echo "🚀 Previewing GitHub Pages site at http://127.0.0.1:$(PORT)"
	$(PYTHON) -m http.server $(PORT) --bind 127.0.0.1 --directory $(DOCS_DIR)

clean: ## Remove generated SQLite databases and compiled bundle files
	@echo "==> Cleaning generated build artifacts..."
	rm -f $(DB_FILE) $(DOCS_DB) $(DOCS_BUNDLE)
	rm -rf __pycache__

help: ## Show available Make targets
	@echo "MEMployers 2026 — Static GitHub Pages & SQLite WebAssembly Build System"
	@echo ""
	@echo "Usage:"
	@echo "  make <target> [PORT=8080]"
	@echo ""
	@echo "Targets:"
	@awk 'BEGIN {FS = ":.*##"} /^[a-zA-Z_-]+:.*?##/ { printf "  \033[36m%-12s\033[0m %s\n", $$1, $$2 }' $(MAKEFILE_LIST)
