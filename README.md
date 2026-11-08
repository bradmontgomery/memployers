# MEMployers 2026 — Greater Memphis IT Employers & Skills Intelligence Hub

A **100% static-site web application** powered by **in-browser SQLite WebAssembly (`sql.js`)** and served directly from [`docs/`](file:///Users/brad/projects/memployers/docs) for **GitHub Pages**.

The primary goal is to let job candidates, career transitioners, and analysts understand **which Greater Memphis employers are hiring for which technical skills**, along with compensation bands, geographic corridors, and residency/hybrid policies.

---

## 🛠️ Build & Local Preview (`Makefile`)

All database compilation, skill taxonomy enrichment, static bundling, verification, and local preview steps are managed by the [`Makefile`](file:///Users/brad/projects/memployers/Makefile):

```bash
# Full build: rebuild SQLite DB from .sql, enrich skill tables/views, bundle into docs/, and verify
make build

# Preview the GitHub Pages `docs/` site locally at http://127.0.0.1:8080
make serve

# Other individual targets
make db       # Rebuild memphis_it_jobs_2026.db from memphis_it_jobs_2026.sql + enrich via analytics.py
make bundle   # Copy .db to docs/memphis_it_jobs_2026.db and generate docs/db_bundle.js + docs/.nojekyll
make verify   # Run automated integrity checks on the database, 37 skills, 118 jobs, and 12 SQL slices
make clean    # Remove generated .db and bundle artifacts
make help     # List all Makefile targets
```

---

## 🌐 Deploying to GitHub Pages

1. Commit and push the repository (including the generated `docs/` directory).
2. In your GitHub repository **Settings → Pages**:
   - **Source:** `Deploy from a branch`
   - **Branch:** `main` (or `master`) / **Folder:** `/docs`
3. No backend server is needed—GitHub Pages serves `docs/index.html`, `docs/memphis_it_jobs_2026.db`, and `docs/db_bundle.js` directly, and the browser executes SQL queries client-side via **SQLite 3 WebAssembly (`sql.js`)**.

---

## 🎯 Key Features & Visualizations

1. **Candidate "My Skills" Matcher & Employer Pathfinder (`Tab 1`)**
   - Toggle any of the **37 normalized canonical skills** across 6 domains, paste resume keywords, or click 1-click **Candidate Personas** (*Full-Stack Java/React*, *.NET / Azure / Angular*, *AI / Data Scientist*, *Cloud / SRE / GPU Infra*, *Healthcare / Epic IT*, *Cybersecurity & Network*).
   - Ranks all **86 Greater Memphis employers** and **118 verified IT job postings** by skill match and computes **High-ROI Upskill Recommendations**.
2. **Interactive Skill ↔ Employer Bipartite Network & 2D Heatmap (`Tab 1`)**
   - **Bipartite Network Graph:** Connects **Technical Skills → Hiring Memphis Employers** with click-to-isolate filtering.
   - **Skill × Top Employer Heatmap Matrix:** 20 × 22 matrix showing verified role counts and company stack intelligence (`•`).
3. **Market Visualizations & Compensation Intelligence (`Tab 2`)**
   - **Skill Demand vs. Pay Premium Bubble Plot** (`$115K` market median reference lines)
   - **Role Classification Salary Bands & Individual Postings Strip Plot**
   - **2026 Greater Memphis IT Salary Benchmarks (Robert Half / Built In)**
   - **Greater Memphis Macro-Sector Footprint**
4. **Tri-State Memphis Tech Corridors Map & Residency Rules (`Tab 3`)**
   - Interactive SVG map of the 9 Greater Memphis tech corridors (`TN / MS / AR`) + residency/radius policy tracker (*FedEx 50-mile campus rule*, *City of Memphis & MLGW 6-month Shelby Co. residency*, *xAI / SpaceX / Google 100% onsite supercluster*, and *Millington / IRS clearance rules*).
5. **Employer Directory (`86` Companies) & Verified IT Jobs Explorer (`118` Roles) (`Tabs 4 & 5`)**
   - Multi-faceted filtering, in-browser SQLite WASM search, Card/Table view toggle, and 1-click CSV export.
6. **In-Browser SQLite WebAssembly (`sql.js`) Workbench (`Tab 6`)**
   - Includes **12 curated analytical SQL slices**, **1-click Table/View Inspector chips**, and a live SQL editor that executes custom `SELECT` queries directly against `memphis_it_jobs_2026.db` in the browser.
