# MEMployers 2026 — Greater Memphis IT Employers & Skills Intelligence Hub

A **100% static-site web application** powered by **in-browser SQLite WebAssembly (`sql.js`)** and hosted at **[https://bradmontgomery.net/memployers](https://bradmontgomery.net/memployers)**.

The primary goal is to let job candidates, career transitioners, and analysts understand **which Greater Memphis employers are hiring for which technical skills**, along with compensation bands, geographic corridors, and residency/hybrid policies.

> **Data Provenance:** All employer profiles, verified 2026 IT job postings, tech stack tags, and regional salary benchmarks in `memphis_it_jobs_2026.sql` were sourced and compiled through deep research by **Gemini** ([research conversation](https://share.gemini.google/Xr6gA1cK2fxj)), and engineered into this interactive analytics platform using **Gemini 4 Argon**.

---

## 🛠️ Build & Local Preview (`Makefile`)

**Prerequisites:** [uv](https://docs.astral.sh/uv/). It installs Python 3.12 and the dev tools on first use; no `sqlite3` CLI is needed.

```bash
make build    # Rebuild the DB from SQL + weekly deltas, enrich it, copy it into docs/, and verify
make serve    # Build, then preview the site at http://127.0.0.1:8080
make ci       # Everything CI runs: lint, type check, tests, CRAP, then the full build
make help     # List every target
```

**Data targets**

| Target | What it does |
|---|---|
| `make db` | Rebuild `memphis_it_jobs_2026.db` from `memphis_it_jobs_2026.sql` + every `weekly_delta_*.sql` (oldest first), then enrich it. A failing script leaves the existing DB untouched. |
| `make apply-delta DELTA=weekly_delta_YYYY_MM_DD.sql` | Apply one new delta to the existing DB (keeps `.db.backup`), then re-enrich. |
| `make bundle` | Copy the DB into `docs/`, where the browser loads it with `sql.js`. |
| `make verify` | Check DB integrity, that every active job has a skill, that the curated SQL slices return rows, and that `docs/` is current. |

**Code-quality targets**

| Target | What it does |
|---|---|
| `make lint` / `make format` | ruff lint + format check / auto-fix |
| `make typecheck` | ty |
| `make test` | pytest with branch coverage; fails below 90% |
| `make crap` | Fails if any function's CRAP score (complexity × missing coverage) exceeds 30 |

**Where things live**

| Path | Contents |
|---|---|
| `memphis_it_jobs_2026.sql`, `weekly_delta_*.sql` | Research data from the deep-research agent (baseline + weekly patches) |
| `taxonomy/*.toml` | Skills and their regex patterns, corridors, macro-sectors, and the curated SQL slices. Edit these to retune classification. |
| `src/memployers/` | Build pipeline: `database` (build/apply deltas), `enrich` (taxonomy tables), `verify`, `cli` |
| `tools/crap.py` | CRAP report used by `make crap` |
| `docs/` | The static site (GitHub Pages) plus the copied DB |

---

## 🎯 Key Features & Visualizations

1. **Candidate "My Skills" Matcher & Employer Pathfinder (`Tab 1`)**
   - Toggle any of the **normalized canonical skills** across 6 domains, paste resume keywords, or click 1-click **Candidate Personas** (*Full-Stack Java/React*, *.NET / Azure / Angular*, *AI / Data Scientist*, *Cloud / SRE / GPU Infra*, *Healthcare / Epic IT*, *Cybersecurity & Network*).
   - Ranks **Greater Memphis employers** and **active verified IT job postings** by skill match and computes **High-ROI Upskill Recommendations**.
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
5. **Employer Directory & Verified IT Jobs Explorer (`Tabs 4 & 5`)**
   - Multi-faceted filtering, in-browser SQLite WASM search, Card/Table view toggle, and 1-click CSV export.
6. **In-Browser SQLite WebAssembly (`sql.js`) Workbench (`Tab 6`)**
   - Includes **curated analytical SQL slices**, **1-click Table/View Inspector chips**, and a live SQL editor that executes custom `SELECT` queries directly against `memphis_it_jobs_2026.db` in the browser.


## Star History

Just in case anyone ever finds this.

<a href="https://www.star-history.com/?repos=bradmontgomery%2Fmemployers&type=date&legend=bottom-right">
 <picture>
   <source media="(prefers-color-scheme: dark)" srcset="https://api.star-history.com/chart?repos=bradmontgomery/memployers&type=date&theme=dark&legend=bottom-right" />
   <source media="(prefers-color-scheme: light)" srcset="https://api.star-history.com/chart?repos=bradmontgomery/memployers&type=date&legend=bottom-right" />
   <img alt="Star History Chart" src="https://api.star-history.com/chart?repos=bradmontgomery/memployers&type=date&legend=bottom-right" />
 </picture>
</a>
