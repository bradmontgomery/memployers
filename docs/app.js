/**
 * MEMployers 2026 — Static-Site SQLite WebAssembly Application Controller (docs/app.js)
 * Loads `memphis_it_jobs_2026.db` in the browser via SQLite WebAssembly (`sql.js`)
 * and powers interactive visualizations, candidate skill matching, and live SQL slicing.
 */

(function () {
  let DATA = window.MEMPHIS_STATIC_DATA || null;
  let WASM_DB = null;

  const STATE = {
    activeTab: "tab-skills",
    selectedCandidateSkills: new Set([
      "python",
      "llms_agentic_ai",
      "sql_databases",
      "cloud_gcp",
      "kubernetes_containers"
    ]),
    networkCategory: "ALL",
    networkActiveNode: null, // { type: 'skill'|'company', id: ... }
    selectedCorridorId: "south_metro_xai_desoto",
    jobViewMode: "cards", // 'cards' | 'table'
    wasmSearchJobIds: null, // null when no search is active
    lastSqlResult: null
  };

  const fmtCurrency = window.MemphisCharts.fmtCurrency;
  const fmtShortK = window.MemphisCharts.fmtShortK;

  function escHtml(str) {
    if (str === null || str === undefined) return "";
    return String(str)
      .replace(/&/g, "&amp;")
      .replace(/</g, "&lt;")
      .replace(/>/g, "&gt;")
      .replace(/"/g, "&quot;");
  }

  function workModeBadge(wm) {
    const cls = wm === "Remote" ? "badge-remote" : wm === "Hybrid" ? "badge-hybrid" : "badge-onsite";
    return `<span class="badge ${cls}">${escHtml(wm)}</span>`;
  }

  // ---------------------------------------------------------------------------
  // SQLITE WEBASSEMBLY (sql.js) LOADER & IN-BROWSER HYDRATION
  // ---------------------------------------------------------------------------
  function base64ToUint8Array(b64) {
    const binStr = window.atob(b64);
    const len = binStr.length;
    const bytes = new Uint8Array(len);
    for (let i = 0; i < len; i++) {
      bytes[i] = binStr.charCodeAt(i);
    }
    return bytes;
  }

  async function loadSqliteDatabaseBytes() {
    if (window.MEMPHIS_DB_BASE64) {
      return base64ToUint8Array(window.MEMPHIS_DB_BASE64);
    }
    const resp = await fetch("./memphis_it_jobs_2026.db");
    if (!resp.ok) {
      throw new Error(`HTTP ${resp.status} fetching memphis_it_jobs_2026.db`);
    }
    const buf = await resp.arrayBuffer();
    return new Uint8Array(buf);
  }

  function queryWasmObjects(db, sql, params) {
    const stmt = db.prepare(sql);
    if (params) stmt.bind(params);
    const out = [];
    while (stmt.step()) {
      out.push(stmt.getAsObject());
    }
    stmt.free();
    return out;
  }

  function hydrateDatasetFromWasmSqlite(db) {
    // 1. Skill categories
    const skillCategories = {};
    queryWasmObjects(db, "SELECT * FROM skill_categories").forEach((r) => {
      skillCategories[r.category_name] = {
        color: r.color,
        bg: r.bg,
        icon: r.icon,
        description: r.description
      };
    });

    // 2. Canonical skills
    const canonicalSkills = queryWasmObjects(db, "SELECT * FROM canonical_skills");
    const skillMetaMap = new Map();
    canonicalSkills.forEach((s) => {
      skillMetaMap.set(s.skill_id, {
        id: s.skill_id,
        name: s.skill_name,
        category: s.skill_category,
        color: s.category_color,
        bg: s.category_bg,
        keywords: JSON.parse(s.keywords_json || "[]")
      });
    });

    // 3. Job-skill and Company-skill maps
    const jobSkillRows = queryWasmObjects(db, "SELECT * FROM job_skill_map");
    const companySkillRows = queryWasmObjects(db, "SELECT * FROM company_skill_map");
    const companyEnrichRows = queryWasmObjects(db, "SELECT * FROM company_enrichment");
    const compEnrichMap = new Map(companyEnrichRows.map((r) => [r.company_id, r]));

    // 4. Companies & Jobs
    const rawCompanies = queryWasmObjects(
      db,
      "SELECT * FROM companies ORDER BY is_watchlist_only ASC, local_tech_roles_est DESC, company_name ASC"
    );
    const rawJobs = queryWasmObjects(db, "SELECT * FROM v_jobs_enriched ORDER BY job_id ASC");
    const benchmarks = queryWasmObjects(db, "SELECT * FROM salary_benchmarks_2026 ORDER BY mid_usd DESC");
    const salaryByClass = queryWasmObjects(db, "SELECT * FROM v_salary_by_classification");
    const corridorMatrix = queryWasmObjects(db, "SELECT * FROM v_corridor_workmode_matrix");
    const leaderboard = queryWasmObjects(db, "SELECT * FROM v_company_leaderboard");
    const corridorGroups = queryWasmObjects(db, "SELECT * FROM corridor_groups");
    const macroSectors = queryWasmObjects(db, "SELECT * FROM macro_sectors");
    const curatedQueriesRows = queryWasmObjects(db, "SELECT * FROM curated_sql_queries ORDER BY sort_order ASC");

    // Map jobs to skills
    const skillsByJobId = new Map();
    jobSkillRows.forEach((r) => {
      if (!skillsByJobId.has(r.job_id)) skillsByJobId.set(r.job_id, []);
      const sm = skillMetaMap.get(r.skill_id);
      if (sm) skillsByJobId.get(r.job_id).push(sm);
    });

    const companyByName = new Map();
    rawCompanies.forEach((c) => {
      const ce = compEnrichMap.get(c.company_id) || {};
      c.corridor_group_id = ce.corridor_group_id || "east_memphis";
      c.corridor_group_name = ce.corridor_group_name || c.sub_market_corridor;
      c.corridor_short_name = ce.corridor_short_name || c.sub_market_corridor;
      c.macro_sector_id = ce.macro_sector_id || "consulting_telecom_services";
      c.macro_sector_name = ce.macro_sector_name || c.sector;
      c.macro_sector_color = ce.macro_sector_color || "#6366f1";
      c.jobs = [];
      c.skills_map = new Map();
      companyByName.set(c.company_name, c);
    });

    companySkillRows.forEach((r) => {
      const comp = rawCompanies.find((c) => c.company_id === r.company_id);
      const sm = skillMetaMap.get(r.skill_id);
      if (comp && sm) {
        comp.skills_map.set(r.skill_id, {
          id: sm.id,
          name: sm.name,
          category: sm.category,
          color: sm.color,
          job_count: r.job_count,
          from_notes: r.source_type !== "Job Posting"
        });
      }
    });

    const skillStats = new Map();
    canonicalSkills.forEach((cs) => {
      const sm = skillMetaMap.get(cs.skill_id);
      skillStats.set(cs.skill_id, {
        ...sm,
        job_ids: [],
        companies_active: new Set(),
        companies_all: new Set(),
        salaries: [],
        min_salaries: [],
        max_salaries: [],
        co_skills: new Map()
      });
    });

    companySkillRows.forEach((r) => {
      const st = skillStats.get(r.skill_id);
      if (st) st.companies_all.add(r.company_name);
    });

    rawJobs.forEach((j) => {
      const comp = companyByName.get(j.company_name);
      if (comp) {
        j.corridor_group_id = comp.corridor_group_id;
        j.corridor_group_name = comp.corridor_group_name;
        j.corridor_short_name = comp.corridor_short_name;
        j.macro_sector_id = comp.macro_sector_id;
        j.macro_sector_name = comp.macro_sector_name;
        j.macro_sector_color = comp.macro_sector_color;
      }
      const matchedSkills = skillsByJobId.get(j.job_id) || [];
      j.canonical_skills = matchedSkills;
      j.skill_ids = matchedSkills.map((s) => s.id);

      if (comp) {
        comp.jobs.push(j);
      }

      matchedSkills.forEach((m) => {
        const st = skillStats.get(m.id);
        if (!st) return;
        st.job_ids.push(j.job_id);
        st.companies_active.add(j.company_name);
        st.companies_all.add(j.company_name);
        if (j.annual_mid_usd !== null && j.annual_mid_usd !== undefined) {
          st.salaries.push(j.annual_mid_usd);
          st.min_salaries.push(j.annual_min_usd);
          st.max_salaries.push(j.annual_max_usd);
        }
        matchedSkills.forEach((m2) => {
          if (m2.id !== m.id) {
            st.co_skills.set(m2.id, (st.co_skills.get(m2.id) || 0) + 1);
          }
        });
      });
    });

    rawCompanies.forEach((c) => {
      const sList = Array.from(c.skills_map.values()).sort(
        (a, b) => b.job_count - a.job_count || a.name.localeCompare(b.name)
      );
      c.skills = sList;
      c.skill_ids = sList.map((s) => s.id);
      delete c.skills_map;
      const sals = c.jobs.map((j) => j.annual_mid_usd).filter((v) => v !== null && v !== undefined);
      c.avg_mid_usd = sals.length ? Math.round(sals.reduce((a, b) => a + b, 0) / sals.length) : null;
      c.cataloged_jobs_count = c.jobs.length;
    });

    const enrichedSkills = [];
    skillStats.forEach((st, sid) => {
      const sals = st.salaries;
      const avgSal = sals.length ? Math.round(sals.reduce((a, b) => a + b, 0) / sals.length) : null;
      const minSal = st.min_salaries.length ? Math.round(Math.min(...st.min_salaries)) : null;
      const maxSal = st.max_salaries.length ? Math.round(Math.max(...st.max_salaries)) : null;

      const compBreakdown = [];
      st.companies_all.forEach((cname) => {
        const compObj = companyByName.get(cname);
        if (!compObj) return;
        const jCnt = compObj.jobs.filter((j) => j.skill_ids.includes(sid)).length;
        compBreakdown.push({
          company_id: compObj.company_id,
          company_name: cname,
          sector: compObj.sector,
          macro_sector_name: compObj.macro_sector_name,
          corridor_short_name: compObj.corridor_short_name,
          job_count: jCnt,
          local_tech_roles_est: compObj.local_tech_roles_est,
          is_watchlist_only: compObj.is_watchlist_only,
          career_portal_url: compObj.career_portal_url
        });
      });
      compBreakdown.sort(
        (a, b) => b.job_count - a.job_count || b.local_tech_roles_est - a.local_tech_roles_est || a.company_name.localeCompare(b.company_name)
      );

      const coList = Array.from(st.co_skills.entries())
        .sort((a, b) => b[1] - a[1])
        .slice(0, 8)
        .map(([coId, cnt]) => {
          const coMeta = skillMetaMap.get(coId);
          return {
            skill_id: coId,
            skill_name: coMeta ? coMeta.name : coId,
            color: coMeta ? coMeta.color : "#6366f1",
            count: cnt
          };
        });

      enrichedSkills.push({
        id: sid,
        name: st.name,
        category: st.category,
        color: st.color,
        bg: st.bg,
        keywords: st.keywords,
        job_count: st.job_ids.length,
        job_ids: st.job_ids,
        active_company_count: st.companies_active.size,
        total_company_count: st.companies_all.size,
        companies: compBreakdown,
        avg_salary_usd: avgSal,
        min_salary_usd: minSal,
        max_salary_usd: maxSal,
        co_occurring_skills: coList
      });
    });
    enrichedSkills.sort(
      (a, b) => b.job_count - a.job_count || b.total_company_count - a.total_company_count || a.name.localeCompare(b.name)
    );

    const corridors = corridorGroups.map((cg) => {
      const cid = cg.corridor_id;
      const cComps = rawCompanies.filter((c) => c.corridor_group_id === cid);
      const cJobs = rawJobs.filter((j) => j.corridor_group_id === cid);
      const cSals = cJobs.map((j) => j.annual_mid_usd).filter((v) => v !== null && v !== undefined);
      const wm = { "On-site": 0, Hybrid: 0, Remote: 0 };
      const skCounts = new Map();
      cJobs.forEach((j) => {
        wm[j.work_mode] = (wm[j.work_mode] || 0) + 1;
        j.skill_ids.forEach((sid) => skCounts.set(sid, (skCounts.get(sid) || 0) + 1));
      });
      const topSkills = Array.from(skCounts.entries())
        .sort((a, b) => b[1] - a[1])
        .slice(0, 8)
        .map(([sid, cnt]) => {
          const sm = skillMetaMap.get(sid);
          return { id: sid, name: sm.name, color: sm.color, count: cnt };
        });

      return {
        id: cid,
        name: cg.name,
        short_name: cg.short_name,
        state: cg.state,
        map_x: cg.map_x,
        map_y: cg.map_y,
        color: cg.color,
        description: cg.description,
        company_count: cComps.length,
        job_count: cJobs.length,
        local_tech_roles_est: cComps.reduce((s, c) => s + (c.local_tech_roles_est || 0), 0),
        avg_salary_usd: cSals.length ? Math.round(cSals.reduce((a, b) => a + b, 0) / cSals.length) : null,
        work_modes: wm,
        top_skills: topSkills,
        top_employers: cComps
          .slice()
          .sort((a, b) => (b.local_tech_roles_est || 0) - (a.local_tech_roles_est || 0) || b.cataloged_jobs_count - a.cataloged_jobs_count)
          .slice(0, 8)
      };
    });

    const sectors = macroSectors
      .map((ms) => {
        const mid = ms.sector_id;
        const sComps = rawCompanies.filter((c) => c.macro_sector_id === mid);
        const sJobs = rawJobs.filter((j) => j.macro_sector_id === mid);
        const sSals = sJobs.map((j) => j.annual_mid_usd).filter((v) => v !== null && v !== undefined);
        const skCounts = new Map();
        sJobs.forEach((j) => j.skill_ids.forEach((sid) => skCounts.set(sid, (skCounts.get(sid) || 0) + 1)));
        return {
          id: mid,
          name: ms.name,
          color: ms.color,
          company_count: sComps.length,
          job_count: sJobs.length,
          local_tech_roles_est: sComps.reduce((s, c) => s + (c.local_tech_roles_est || 0), 0),
          avg_salary_usd: sSals.length ? Math.round(sSals.reduce((a, b) => a + b, 0) / sSals.length) : null,
          top_skills: Array.from(skCounts.entries())
            .sort((a, b) => b[1] - a[1])
            .slice(0, 6)
            .map(([sid, cnt]) => {
              const sm = skillMetaMap.get(sid);
              return { id: sid, name: sm.name, color: sm.color, count: cnt };
            }),
          companies: sComps
        };
      })
      .sort((a, b) => b.local_tech_roles_est - a.local_tech_roles_est || b.job_count - a.job_count);

    const allMidSals = rawJobs
      .map((j) => j.annual_mid_usd)
      .filter((v) => v !== null && v !== undefined)
      .sort((a, b) => a - b);
    const wmTotals = { "On-site": 0, Hybrid: 0, Remote: 0 };
    rawJobs.forEach((j) => (wmTotals[j.work_mode] = (wmTotals[j.work_mode] || 0) + 1));

    const kpis = {
      total_companies: rawCompanies.length,
      active_companies: rawCompanies.filter((c) => !c.is_watchlist_only).length,
      watchlist_companies: rawCompanies.filter((c) => c.is_watchlist_only).length,
      total_jobs: rawJobs.length,
      jobs_with_salary: allMidSals.length,
      local_tech_roles_est: rawCompanies.reduce((s, c) => s + (c.local_tech_roles_est || 0), 0),
      total_company_open_roles: rawCompanies.reduce((s, c) => s + (c.total_company_open_roles_2026 || 0), 0),
      median_salary_usd: allMidSals.length ? Math.round(allMidSals[Math.floor(allMidSals.length / 2)]) : 0,
      mean_salary_usd: allMidSals.length ? Math.round(allMidSals.reduce((a, b) => a + b, 0) / allMidSals.length) : 0,
      min_salary_usd: Math.round(Math.min(...rawJobs.map((j) => j.annual_min_usd).filter((v) => v !== null && v !== undefined))),
      max_salary_usd: Math.round(Math.max(...rawJobs.map((j) => j.annual_max_usd).filter((v) => v !== null && v !== undefined))),
      total_canonical_skills: enrichedSkills.length,
      work_modes: wmTotals
    };

    const curatedQueries = curatedQueriesRows.map((q) => ({
      id: q.query_id,
      title: q.title,
      category: q.category,
      description: q.description,
      sql: q.sql_text
    }));

    return {
      kpis,
      skill_categories: skillCategories,
      skills: enrichedSkills,
      companies: rawCompanies,
      jobs: rawJobs,
      corridors,
      sectors,
      benchmarks,
      views: {
        salary_by_classification: salaryByClass,
        corridor_workmode_matrix: corridorMatrix,
        company_leaderboard: leaderboard
      },
      curated_queries: curatedQueries
    };
  }

  // ---------------------------------------------------------------------------
  // INITIALIZATION
  // ---------------------------------------------------------------------------
  async function initApp() {
    const badgeEl = document.getElementById("wasm-engine-badge");
    const sizeKb = Math.round((window.MEMPHIS_DB_SIZE_BYTES || 253952) / 1024);

    if (typeof window.initSqlJs === "function") {
      try {
        const SQL = await window.initSqlJs({
          locateFile: (file) => `https://cdnjs.cloudflare.com/ajax/libs/sql.js/1.10.3/${file}`
        });
        const dbBytes = await loadSqliteDatabaseBytes();
        WASM_DB = new SQL.Database(dbBytes);
        DATA = hydrateDatasetFromWasmSqlite(WASM_DB);
        if (badgeEl) {
          badgeEl.textContent = `⚡ SQLite 3 WASM Ready (${sizeKb} KB)`;
        }
      } catch (err) {
        console.warn("SQLite WASM fallback to pre-hydrated bundle:", err);
        if (badgeEl) {
          badgeEl.textContent = `📦 Static Bundle Ready (${sizeKb} KB)`;
        }
      }
    } else if (badgeEl) {
      badgeEl.textContent = `📦 Static Bundle Ready (${sizeKb} KB)`;
    }

    if (!DATA) {
      document.getElementById("kpi-ribbon").innerHTML = `<div class="panel-card">Failed to load dataset. Run <code>make build</code>.</div>`;
      return;
    }

    renderKpiRibbon();
    populateFilterDropdowns();
    bindNavigationAndGlobalEvents();

    // Render all 6 workspace tabs
    renderCandidateSkillSelector();
    renderCandidateMatchResults();
    renderNetworkSection();
    renderHeatmapSection();
    renderSkillsCatalog();
    renderMarketVisualizations();
    renderCorridorsTab();
    renderCompaniesDirectory();
    renderJobsExplorer();
    renderSqlWorkbench();
  }

  // ---------------------------------------------------------------------------
  // KPI RIBBON
  // ---------------------------------------------------------------------------
  function renderKpiRibbon() {
    const k = DATA.kpis;
    document.getElementById("nav-count-skills").textContent = k.total_canonical_skills;
    document.getElementById("nav-count-companies").textContent = k.total_companies;
    document.getElementById("nav-count-jobs").textContent = k.total_jobs;

    const cards = [
      {
        label: "Memphis IT Employers",
        value: k.total_companies,
        sub: `${k.active_companies} Active + ${k.watchlist_companies} Watchlist/Startups`,
        accent: "#6366f1"
      },
      {
        label: "Verified 2026 IT Postings",
        value: k.total_jobs,
        sub: `~${k.local_tech_roles_est} Est. Local Tech Roles (${k.total_company_open_roles.toLocaleString()} Total Open)`,
        accent: "#06b6d4"
      },
      {
        label: "Canonical Tech Skills",
        value: k.total_canonical_skills,
        sub: `Normalized across 6 domains & 442 raw stack tags`,
        accent: "#ec4899"
      },
      {
        label: "Advertised IT Salary Median",
        value: fmtCurrency(k.median_salary_usd),
        sub: `Mean ${fmtCurrency(k.mean_salary_usd)} (${fmtShortK(k.min_salary_usd)} – ${fmtShortK(k.max_salary_usd)} range)`,
        accent: "#10b981"
      },
      {
        label: "Work-Mode Split",
        value: `${Math.round((k.work_modes["On-site"] / k.total_jobs) * 100)}% On-site`,
        sub: `${k.work_modes["On-site"]} On-site · ${k.work_modes["Hybrid"]} Hybrid · ${k.work_modes["Remote"]} Remote`,
        accent: "#f59e0b"
      }
    ];

    document.getElementById("kpi-ribbon").innerHTML = cards
      .map(
        (c) => `
      <div class="kpi-card" style="--kpi-accent: ${c.accent}">
        <div class="kpi-label">${escHtml(c.label)}</div>
        <div class="kpi-value">${escHtml(c.value)}</div>
        <div class="kpi-sub">${escHtml(c.sub)}</div>
      </div>`
      )
      .join("");
  }

  // ---------------------------------------------------------------------------
  // POPULATE FILTER DROPDOWNS
  // ---------------------------------------------------------------------------
  function populateFilterDropdowns() {
    const catNames = Object.keys(DATA.skill_categories);
    const netCatEl = document.getElementById("network-category-filter");
    const catSkillEl = document.getElementById("catalog-skill-category");
    catNames.forEach((cat) => {
      netCatEl.insertAdjacentHTML("beforeend", `<option value="${escHtml(cat)}">${escHtml(cat)}</option>`);
      catSkillEl.insertAdjacentHTML("beforeend", `<option value="${escHtml(cat)}">${escHtml(cat)}</option>`);
    });

    const compSectorEl = document.getElementById("comp-filter-sector");
    DATA.sectors.forEach((s) => {
      compSectorEl.insertAdjacentHTML(
        "beforeend",
        `<option value="${escHtml(s.id)}">${escHtml(s.name)} (${s.company_count})</option>`
      );
    });

    const compCorrEl = document.getElementById("comp-filter-corridor");
    const jobCorrEl = document.getElementById("job-filter-corridor");
    DATA.corridors.forEach((c) => {
      compCorrEl.insertAdjacentHTML(
        "beforeend",
        `<option value="${escHtml(c.id)}">${escHtml(c.short_name)} (${c.company_count} co)</option>`
      );
      jobCorrEl.insertAdjacentHTML(
        "beforeend",
        `<option value="${escHtml(c.id)}">${escHtml(c.short_name)} (${c.job_count} roles)</option>`
      );
    });

    const compSkillEl = document.getElementById("comp-filter-skill");
    const jobSkillEl = document.getElementById("job-filter-skill");
    DATA.skills.forEach((sk) => {
      compSkillEl.insertAdjacentHTML(
        "beforeend",
        `<option value="${escHtml(sk.id)}">${escHtml(sk.name)} (${sk.total_company_count} employers)</option>`
      );
      jobSkillEl.insertAdjacentHTML(
        "beforeend",
        `<option value="${escHtml(sk.id)}">${escHtml(sk.name)} (${sk.job_count} roles)</option>`
      );
    });
  }

  // ---------------------------------------------------------------------------
  // TAB 1A: CANDIDATE SKILL MATCHER & UPSKILL PATHFINDER
  // ---------------------------------------------------------------------------
  function renderCandidateSkillSelector() {
    const container = document.getElementById("candidate-skill-selector");
    const byCat = {};
    Object.keys(DATA.skill_categories).forEach((c) => (byCat[c] = []));
    DATA.skills.forEach((sk) => {
      if (byCat[sk.category]) byCat[sk.category].push(sk);
    });

    let html = "";
    Object.entries(byCat).forEach(([catName, skills]) => {
      const catMeta = DATA.skill_categories[catName];
      html += `
        <div style="background:var(--bg-input);border:1px solid var(--border-color);border-radius:10px;padding:10px 12px;">
          <div style="font-size:11.5px;font-weight:700;color:${catMeta.color};margin-bottom:8px;display:flex;justify-content:space-between;">
            <span>${escHtml(catName)}</span>
            <span style="color:var(--text-muted);font-weight:600;">${skills.length} skills</span>
          </div>
          <div class="pill-group">
            ${skills
              .map((sk) => {
                const isSel = STATE.selectedCandidateSkills.has(sk.id);
                return `
                  <button class="skill-chip candidate-chip ${isSel ? "selected" : ""}" data-id="${escHtml(sk.id)}" style="--chip-color:${sk.color}" title="${sk.job_count} verified roles · ${sk.total_company_count} companies">
                    <span class="skill-dot"></span>
                    <span>${escHtml(sk.name)}</span>
                    <span style="opacity:0.75;font-size:10.5px;">(${sk.total_company_count})</span>
                  </button>`;
              })
              .join("")}
          </div>
        </div>
      `;
    });

    container.innerHTML = html;

    container.querySelectorAll(".candidate-chip").forEach((btn) => {
      btn.addEventListener("click", () => {
        const sid = btn.getAttribute("data-id");
        if (STATE.selectedCandidateSkills.has(sid)) {
          STATE.selectedCandidateSkills.delete(sid);
        } else {
          STATE.selectedCandidateSkills.add(sid);
        }
        renderCandidateSkillSelector();
        renderCandidateMatchResults();
      });
    });
  }

  function renderCandidateMatchResults() {
    const out = document.getElementById("candidate-match-results");
    const selectedIds = Array.from(STATE.selectedCandidateSkills);

    if (selectedIds.length === 0) {
      out.innerHTML = `
        <div style="padding:18px;border:1px dashed var(--border-strong);border-radius:10px;text-align:center;color:var(--text-muted);">
          Select one or more skills above (or choose a Quick Persona) to compute your personalized Memphis Employer &amp; Role Match Score.
        </div>`;
      return;
    }

    const skillLookup = new Map(DATA.skills.map((s) => [s.id, s]));

    // 1. Score Companies
    const matchedCompanies = [];
    DATA.companies.forEach((comp) => {
      const compSkillSet = new Set(comp.skill_ids);
      const matchedSkills = selectedIds.filter((id) => compSkillSet.has(id)).map((id) => skillLookup.get(id));
      if (matchedSkills.length > 0) {
        const matchingJobs = comp.jobs.filter((j) => j.skill_ids.some((id) => STATE.selectedCandidateSkills.has(id)));
        const missingSkills = comp.skills.filter((s) => !STATE.selectedCandidateSkills.has(s.id)).slice(0, 4);
        const matchPct = Math.round((matchedSkills.length / Math.max(1, Math.min(selectedIds.length, comp.skills.length))) * 100);
        matchedCompanies.push({
          company: comp,
          matchedSkills,
          missingSkills,
          matchingJobsCount: matchingJobs.length,
          score: matchedSkills.length * 12 + matchingJobs.length * 5 + (comp.is_watchlist_only ? 0 : 4),
          matchPct: Math.min(100, matchPct)
        });
      }
    });
    matchedCompanies.sort((a, b) => b.score - a.score || b.company.local_tech_roles_est - a.company.local_tech_roles_est);

    // 2. Score Jobs
    const matchedJobs = [];
    DATA.jobs.forEach((job) => {
      const hitSkills = job.canonical_skills.filter((s) => STATE.selectedCandidateSkills.has(s.id));
      if (hitSkills.length > 0) {
        const missingJobSkills = job.canonical_skills.filter((s) => !STATE.selectedCandidateSkills.has(s.id));
        const pct = Math.round((hitSkills.length / Math.max(1, job.canonical_skills.length)) * 100);
        matchedJobs.push({
          job,
          hitSkills,
          missingJobSkills,
          pct
        });
      }
    });
    matchedJobs.sort((a, b) => b.hitSkills.length - a.hitSkills.length || b.pct - a.pct || (b.job.annual_mid_usd || 0) - (a.job.annual_mid_usd || 0));

    // 3. Compute Upskill Recommendations
    const upskillCounter = new Map();
    DATA.jobs.forEach((job) => {
      const hasAny = job.skill_ids.some((id) => STATE.selectedCandidateSkills.has(id));
      if (hasAny) {
        job.skill_ids.forEach((id) => {
          if (!STATE.selectedCandidateSkills.has(id)) {
            upskillCounter.set(id, (upskillCounter.get(id) || 0) + 1);
          }
        });
      }
    });
    const topUpskills = Array.from(upskillCounter.entries())
      .map(([sid, cnt]) => ({ skill: skillLookup.get(sid), unlockedJobs: cnt }))
      .filter((x) => x.skill)
      .sort((a, b) => b.unlockedJobs - a.unlockedJobs)
      .slice(0, 6);

    const avgMatchedSal = (() => {
      const sals = matchedJobs.map((m) => m.job.annual_mid_usd).filter((v) => v !== null && v !== undefined);
      return sals.length ? Math.round(sals.reduce((a, b) => a + b, 0) / sals.length) : null;
    })();

    out.innerHTML = `
      <div style="background:rgba(99,102,241,0.08);border:1px solid rgba(99,102,241,0.28);border-radius:12px;padding:16px;">
        <div style="display:flex;justify-content:space-between;align-items:center;flex-wrap:wrap;gap:12px;margin-bottom:14px;">
          <div>
            <span style="font-size:15px;font-weight:800;color:var(--text-primary);">
              ✅ Your Stack Matches <span style="color:#38bdf8;">${matchedCompanies.length} Memphis Employers</span> &amp; <span style="color:#10b981;">${matchedJobs.length} Verified IT Roles</span>
            </span>
            <span style="margin-left:10px;font-size:12.5px;color:var(--text-secondary);">
              Avg Matched Role Compensation: <b>${fmtCurrency(avgMatchedSal)}</b>
            </span>
          </div>
          <div style="display:flex;gap:8px;align-items:center;flex-wrap:wrap;">
            <span style="font-size:11.5px;color:var(--text-muted);font-weight:600;">🚀 High-ROI Upskill Next:</span>
            ${topUpskills
              .map(
                (u) => `
              <button class="btn btn-sm add-upskill-btn" data-id="${escHtml(u.skill.id)}" title="Click to add ${escHtml(u.skill.name)} to your toolkit">
                + ${escHtml(u.skill.name)} <span style="color:${u.skill.color};font-weight:700;">(+${u.unlockedJobs} roles)</span>
              </button>`
              )
              .join("")}
          </div>
        </div>

        <div class="section-grid grid-2" style="margin-bottom:0;">
          <div>
            <div style="font-size:12px;font-weight:700;text-transform:uppercase;letter-spacing:0.05em;color:var(--text-muted);margin-bottom:8px;">
              Top Matching Memphis Employers (Click to Inspect Stack &amp; Portal)
            </div>
            <div style="display:flex;flex-direction:column;gap:8px;max-height:380px;overflow-y:auto;padding-right:4px;">
              ${matchedCompanies
                .slice(0, 12)
                .map(
                  (mc) => `
                <div class="entity-card open-company-modal" data-comp="${escHtml(mc.company.company_name)}" style="padding:11px 14px;cursor:pointer;gap:6px;">
                  <div style="display:flex;justify-content:space-between;align-items:flex-start;gap:8px;">
                    <div>
                      <div style="font-weight:700;font-size:13.5px;color:var(--text-primary);">
                        ${escHtml(mc.company.company_name)}
                        ${mc.company.is_watchlist_only ? `<span class="badge badge-watchlist" style="margin-left:6px;">Watchlist</span>` : ""}
                      </div>
                      <div style="font-size:11.5px;color:var(--text-muted);">
                        ${escHtml(mc.company.sector)} · ${escHtml(mc.company.corridor_short_name)}
                      </div>
                    </div>
                    <div style="text-align:right;flex-shrink:0;">
                      <span class="badge badge-salary">${mc.matchedSkills.length} skill match${mc.matchedSkills.length > 1 ? "es" : ""}</span>
                      <div style="font-size:11px;color:var(--text-muted);margin-top:2px;">
                        ${mc.matchingJobsCount > 0 ? `${mc.matchingJobsCount} active role(s)` : `${mc.company.total_company_open_roles_2026 || 0} co openings`}
                      </div>
                    </div>
                  </div>
                  <div style="display:flex;flex-wrap:wrap;gap:4px;margin-top:2px;">
                    ${mc.matchedSkills
                      .map(
                        (s) =>
                          `<span class="badge" style="background:${s.color}22;color:${s.color};border:1px solid ${s.color}55;">✓ ${escHtml(s.name)}</span>`
                      )
                      .join("")}
                    ${mc.missingSkills
                      .slice(0, 2)
                      .map(
                        (s) =>
                          `<span class="badge" style="background:var(--bg-elevated);color:var(--text-muted);font-weight:500;" title="Also used by ${escHtml(mc.company.company_name)}">+ ${escHtml(s.name)}</span>`
                      )
                      .join("")}
                  </div>
                </div>`
                )
                .join("")}
            </div>
          </div>

          <div>
            <div style="font-size:12px;font-weight:700;text-transform:uppercase;letter-spacing:0.05em;color:var(--text-muted);margin-bottom:8px;">
              Best-Fit Verified 2026 Job Postings (${matchedJobs.length} Matched)
            </div>
            <div style="display:flex;flex-direction:column;gap:8px;max-height:380px;overflow-y:auto;padding-right:4px;">
              ${matchedJobs
                .slice(0, 12)
                .map(
                  (mj) => `
                <div class="entity-card open-job-modal" data-job="${mj.job.job_id}" style="padding:11px 14px;cursor:pointer;gap:6px;">
                  <div style="display:flex;justify-content:space-between;align-items:flex-start;gap:8px;">
                    <div>
                      <div style="font-weight:700;font-size:13.5px;color:var(--text-primary);">${escHtml(mj.job.job_title)}</div>
                      <div style="font-size:12px;color:var(--accent-secondary);font-weight:600;">
                        ${escHtml(mj.job.company_name)} · <span style="color:var(--text-muted);font-weight:400;">${escHtml(mj.job.city)}, ${escHtml(mj.job.state)}</span>
                      </div>
                    </div>
                    <div style="display:flex;gap:5px;align-items:center;flex-shrink:0;">
                      ${mj.job.raw_compensation ? `<span class="badge badge-salary">${escHtml(mj.job.raw_compensation)}</span>` : ""}
                      ${workModeBadge(mj.job.work_mode)}
                    </div>
                  </div>
                  <div style="display:flex;flex-wrap:wrap;gap:4px;">
                    ${mj.hitSkills
                      .map(
                        (s) =>
                          `<span class="badge" style="background:${s.color}22;color:${s.color};border:1px solid ${s.color}55;">✓ ${escHtml(s.name)}</span>`
                      )
                      .join("")}
                    ${mj.missingJobSkills
                      .map(
                        (s) =>
                          `<span class="badge" style="background:var(--bg-elevated);color:var(--text-muted);">Gap: ${escHtml(s.name)}</span>`
                      )
                      .join("")}
                  </div>
                </div>`
                )
                .join("")}
            </div>
          </div>
        </div>
      </div>
    `;

    out.querySelectorAll(".add-upskill-btn").forEach((btn) => {
      btn.addEventListener("click", () => {
        STATE.selectedCandidateSkills.add(btn.getAttribute("data-id"));
        renderCandidateSkillSelector();
        renderCandidateMatchResults();
      });
    });

    bindModalTriggers(out);
  }

  // ---------------------------------------------------------------------------
  // TAB 1B: BIPARTITE SKILL <-> EMPLOYER NETWORK
  // ---------------------------------------------------------------------------
  function renderNetworkSection() {
    const container = document.getElementById("skill-employer-network-chart");
    const banner = document.getElementById("network-selection-banner");

    if (STATE.networkActiveNode) {
      banner.style.display = "flex";
      const label =
        STATE.networkActiveNode.type === "skill"
          ? (DATA.skills.find((s) => s.id === STATE.networkActiveNode.id) || {}).name
          : STATE.networkActiveNode.id;
      banner.innerHTML = `
        <div>
          Showing network connections for <b>${escHtml(label)}</b> (${STATE.networkActiveNode.type.toUpperCase()}).
        </div>
        <div style="display:flex;gap:8px;">
          <button class="btn btn-sm btn-primary" id="banner-inspect-btn">Open Full Deep-Dive</button>
          <button class="btn btn-sm" id="banner-clear-btn">Clear Isolation</button>
        </div>
      `;
      document.getElementById("banner-clear-btn").onclick = () => {
        STATE.networkActiveNode = null;
        renderNetworkSection();
      };
      document.getElementById("banner-inspect-btn").onclick = () => {
        if (STATE.networkActiveNode.type === "skill") {
          openSkillModal(STATE.networkActiveNode.id);
        } else {
          openCompanyModal(STATE.networkActiveNode.id);
        }
      };
    } else {
      banner.style.display = "none";
    }

    window.MemphisCharts.renderSkillEmployerNetwork(
      container,
      DATA,
      { category: STATE.networkCategory, activeNode: STATE.networkActiveNode },
      {
        onNodeClick: (node) => {
          if (
            STATE.networkActiveNode &&
            STATE.networkActiveNode.type === node.type &&
            STATE.networkActiveNode.id === node.id
          ) {
            STATE.networkActiveNode = null;
          } else {
            STATE.networkActiveNode = node;
          }
          renderNetworkSection();
        },
        onLinkClick: (skillId, companyName) => {
          openIntersectionModal(skillId, companyName);
        }
      }
    );
  }

  // ---------------------------------------------------------------------------
  // TAB 1C: HEATMAP MATRIX & SKILLS CATALOG
  // ---------------------------------------------------------------------------
  function renderHeatmapSection() {
    const container = document.getElementById("skill-employer-heatmap");
    window.MemphisCharts.renderSkillEmployerHeatmap(container, DATA, {
      onCellClick: (skillId, companyName) => openIntersectionModal(skillId, companyName),
      onSkillClick: (skillId) => openSkillModal(skillId),
      onCompanyClick: (companyName) => openCompanyModal(companyName)
    });
  }

  function renderSkillsCatalog() {
    const container = document.getElementById("skills-catalog-grid");
    const catFilter = document.getElementById("catalog-skill-category").value;
    const sortBy = document.getElementById("catalog-skill-sort").value;

    let list = DATA.skills.slice();
    if (catFilter !== "ALL") {
      list = list.filter((s) => s.category === catFilter);
    }

    if (sortBy === "jobs") {
      list.sort((a, b) => b.job_count - a.job_count || b.total_company_count - a.total_company_count);
    } else if (sortBy === "companies") {
      list.sort((a, b) => b.total_company_count - a.total_company_count || b.job_count - a.job_count);
    } else if (sortBy === "salary") {
      list.sort((a, b) => (b.avg_salary_usd || 0) - (a.avg_salary_usd || 0));
    } else if (sortBy === "name") {
      list.sort((a, b) => a.name.localeCompare(b.name));
    }

    container.innerHTML = list
      .map(
        (sk) => `
      <div class="entity-card open-skill-modal" data-skill="${escHtml(sk.id)}" style="cursor:pointer;">
        <div>
          <div style="display:flex;justify-content:space-between;align-items:flex-start;gap:8px;margin-bottom:6px;">
            <div>
              <span class="badge" style="background:${sk.bg};color:${sk.color};border:1px solid ${sk.color}44;margin-bottom:5px;">
                ${escHtml(sk.category)}
              </span>
              <div class="entity-card-title">${escHtml(sk.name)}</div>
            </div>
            <div style="text-align:right;flex-shrink:0;">
              <div style="font-size:18px;font-weight:800;color:${sk.color};">${sk.total_company_count} <span style="font-size:11px;font-weight:600;color:var(--text-muted);">employers</span></div>
              <div style="font-size:11.5px;color:var(--text-secondary);font-weight:600;">${sk.job_count} verified roles</div>
            </div>
          </div>

          <div style="font-size:12px;color:var(--text-muted);margin-bottom:8px;">
            Avg Midpoint Pay: <b style="color:var(--text-primary);">${fmtCurrency(sk.avg_salary_usd)}</b>
            ${sk.min_salary_usd ? `(${fmtShortK(sk.min_salary_usd)}–${fmtShortK(sk.max_salary_usd)})` : ""}
          </div>

          <div style="font-size:11.5px;color:var(--text-secondary);margin-bottom:8px;">
            <b>Top Hiring Companies:</b>
            ${sk.companies
              .slice(0, 5)
              .map((c) => escHtml(c.company_name))
              .join(", ")}${sk.companies.length > 5 ? ` +${sk.companies.length - 5} more` : ""}
          </div>
        </div>

        <div style="border-top:1px solid var(--border-color);padding-top:8px;display:flex;flex-wrap:wrap;gap:4px;align-items:center;">
          <span style="font-size:10.5px;color:var(--text-muted);margin-right:4px;">Paired with:</span>
          ${sk.co_occurring_skills
            .slice(0, 3)
            .map(
              (co) =>
                `<span class="badge" style="background:var(--bg-elevated);color:var(--text-secondary);font-size:10.5px;">${escHtml(co.skill_name)} (${co.count})</span>`
            )
            .join("")}
        </div>
      </div>`
      )
      .join("");

    container.querySelectorAll(".open-skill-modal").forEach((el) => {
      el.addEventListener("click", () => openSkillModal(el.getAttribute("data-skill")));
    });
  }

  // ---------------------------------------------------------------------------
  // TAB 2: MARKET VISUALIZATIONS & COMPENSATION
  // ---------------------------------------------------------------------------
  function renderMarketVisualizations() {
    window.MemphisCharts.renderSkillBubblePlot(
      document.getElementById("skill-bubble-chart"),
      DATA,
      {
        onSkillClick: (sid) => openSkillModal(sid)
      }
    );

    window.MemphisCharts.renderClassificationRangeChart(
      document.getElementById("classification-range-chart"),
      DATA,
      {
        onJobClick: (job) => openJobModal(job.job_id)
      }
    );

    window.MemphisCharts.renderBenchmarkComparisonChart(
      document.getElementById("benchmark-comparison-chart"),
      DATA
    );

    const secContainer = document.getElementById("macro-sector-breakdown");
    const maxTech = Math.max(...DATA.sectors.map((s) => s.local_tech_roles_est || 1));

    secContainer.innerHTML = `
      <div style="display:flex;flex-direction:column;gap:10px;">
        ${DATA.sectors
          .map((sec) => {
            const pct = Math.round((sec.local_tech_roles_est / maxTech) * 100);
            return `
            <div style="background:var(--bg-input);border:1px solid var(--border-color);border-radius:10px;padding:11px 14px;">
              <div style="display:flex;justify-content:space-between;align-items:center;gap:8px;margin-bottom:5px;flex-wrap:wrap;">
                <div style="font-weight:700;font-size:13.5px;color:var(--text-primary);display:flex;align-items:center;gap:8px;">
                  <span style="width:10px;height:10px;border-radius:3px;background:${sec.color};display:inline-block;"></span>
                  ${escHtml(sec.name)}
                </div>
                <div style="font-size:12px;color:var(--text-secondary);display:flex;gap:10px;">
                  <span><b>${sec.company_count}</b> Employers</span>
                  <span><b>${sec.job_count}</b> Verified Postings</span>
                  <span style="color:${sec.color};font-weight:700;">~${sec.local_tech_roles_est} Local Tech Est.</span>
                  <span>Avg Pay: <b>${fmtShortK(sec.avg_salary_usd)}</b></span>
                </div>
              </div>
              <div style="height:7px;background:var(--bg-elevated);border-radius:99px;overflow:hidden;margin-bottom:8px;">
                <div style="width:${pct}%;height:100%;background:${sec.color};border-radius:99px;"></div>
              </div>
              <div style="display:flex;justify-content:space-between;align-items:center;flex-wrap:wrap;gap:6px;font-size:11.5px;">
                <div style="color:var(--text-muted);">
                  <b>Key Employers:</b>
                  ${sec.companies
                    .slice(0, 5)
                    .map(
                      (c) =>
                        `<a href="#" class="sector-comp-link" data-comp="${escHtml(c.company_name)}" style="color:var(--text-secondary);text-decoration:underline;margin-right:6px;">${escHtml(c.company_name)}</a>`
                    )
                    .join("")}
                </div>
                <div style="display:flex;gap:4px;flex-wrap:wrap;">
                  ${sec.top_skills
                    .slice(0, 3)
                    .map(
                      (sk) =>
                        `<span class="badge" style="background:${sk.color}20;color:${sk.color};font-size:10.5px;">${escHtml(sk.name)}</span>`
                    )
                    .join("")}
                </div>
              </div>
            </div>`;
          })
          .join("")}
      </div>
    `;

    secContainer.querySelectorAll(".sector-comp-link").forEach((a) => {
      a.addEventListener("click", (e) => {
        e.preventDefault();
        openCompanyModal(a.getAttribute("data-comp"));
      });
    });
  }

  // ---------------------------------------------------------------------------
  // TAB 3: CORRIDORS MAP, WORK MODES & RESIDENCY RULES
  // ---------------------------------------------------------------------------
  function renderCorridorsTab() {
    window.MemphisCharts.renderMemphisCorridorMap(
      document.getElementById("memphis-corridor-map"),
      DATA,
      STATE.selectedCorridorId,
      {
        onCorridorSelect: (cid) => {
          STATE.selectedCorridorId = cid;
          renderCorridorsTab();
        }
      }
    );

    renderCorridorInspector();
    renderCorridorWorkModeBars();
    renderResidencyPolicies();
  }

  function renderCorridorInspector() {
    const panel = document.getElementById("corridor-inspector-panel");
    const cg =
      DATA.corridors.find((c) => c.id === STATE.selectedCorridorId) || DATA.corridors[0];

    panel.innerHTML = `
      <div style="border-bottom:1px solid var(--border-color);padding-bottom:12px;margin-bottom:12px;">
        <span class="badge" style="background:${cg.color}22;color:${cg.color};border:1px solid ${cg.color}55;margin-bottom:6px;">
          ${escHtml(cg.state)} SUB-MARKET CORRIDOR
        </span>
        <h3 style="font-size:17px;font-weight:800;color:var(--text-primary);">${escHtml(cg.name)}</h3>
        <p style="font-size:12.5px;color:var(--text-muted);margin-top:4px;">${escHtml(cg.description)}</p>
      </div>

      <div style="display:grid;grid-template-columns:repeat(3,1fr);gap:8px;margin-bottom:14px;">
        <div style="background:var(--bg-input);padding:8px 10px;border-radius:8px;text-align:center;">
          <div style="font-size:18px;font-weight:800;color:${cg.color};">${cg.company_count}</div>
          <div style="font-size:11px;color:var(--text-muted);">Employers</div>
        </div>
        <div style="background:var(--bg-input);padding:8px 10px;border-radius:8px;text-align:center;">
          <div style="font-size:18px;font-weight:800;color:var(--text-primary);">${cg.job_count}</div>
          <div style="font-size:11px;color:var(--text-muted);">Verified IT Roles</div>
        </div>
        <div style="background:var(--bg-input);padding:8px 10px;border-radius:8px;text-align:center;">
          <div style="font-size:18px;font-weight:800;color:#10b981;">${fmtShortK(cg.avg_salary_usd)}</div>
          <div style="font-size:11px;color:var(--text-muted);">Avg Mid Salary</div>
        </div>
      </div>

      <div style="margin-bottom:14px;">
        <div style="font-size:11.5px;font-weight:700;text-transform:uppercase;color:var(--text-muted);margin-bottom:6px;">
          Top In-Demand Skills in ${escHtml(cg.short_name)}
        </div>
        <div class="pill-group">
          ${cg.top_skills
            .map(
              (sk) =>
                `<span class="badge open-skill-modal" data-skill="${escHtml(sk.id)}" style="cursor:pointer;background:${sk.color}22;color:${sk.color};border:1px solid ${sk.color}55;padding:4px 8px;">
                  ${escHtml(sk.name)} (${sk.count})
                </span>`
            )
            .join("")}
        </div>
      </div>

      <div>
        <div style="font-size:11.5px;font-weight:700;text-transform:uppercase;color:var(--text-muted);margin-bottom:6px;">
          Anchor Employers in Corridor (Click to Inspect)
        </div>
        <div style="display:flex;flex-direction:column;gap:6px;max-height:220px;overflow-y:auto;">
          ${cg.top_employers
            .map(
              (emp) => `
            <div class="open-company-modal" data-comp="${escHtml(emp.company_name)}" style="cursor:pointer;background:var(--bg-input);border:1px solid var(--border-color);border-radius:8px;padding:8px 10px;display:flex;justify-content:space-between;align-items:center;">
              <span style="font-weight:600;font-size:12.5px;color:var(--text-primary);">${escHtml(emp.company_name)}</span>
              <span style="font-size:11.5px;color:var(--text-muted);">${emp.cataloged_jobs_count} roles · ~${emp.local_tech_roles_est} est.</span>
            </div>`
            )
            .join("")}
        </div>
      </div>
    `;

    bindModalTriggers(panel);
  }

  function renderCorridorWorkModeBars() {
    const container = document.getElementById("corridor-workmode-bars");
    container.innerHTML = `
      <div style="display:flex;flex-direction:column;gap:10px;">
        ${DATA.corridors
          .map((cg) => {
            const tot = Math.max(1, cg.job_count);
            const onPct = Math.round((cg.work_modes["On-site"] / tot) * 100);
            const hyPct = Math.round((cg.work_modes["Hybrid"] / tot) * 100);
            const rmPct = Math.max(0, 100 - onPct - hyPct);
            return `
            <div style="background:var(--bg-input);border:1px solid var(--border-color);border-radius:8px;padding:10px 12px;">
              <div style="display:flex;justify-content:space-between;font-size:12.5px;font-weight:600;margin-bottom:5px;">
                <span>${escHtml(cg.name)}</span>
                <span style="color:var(--text-muted);font-size:11.5px;">
                  <b style="color:#fbbf24;">${cg.work_modes["On-site"]} On-site</b> ·
                  <b style="color:#22d3ee;">${cg.work_modes["Hybrid"]} Hybrid</b> ·
                  <b style="color:#34d399;">${cg.work_modes["Remote"]} Remote</b>
                </span>
              </div>
              <div style="height:10px;border-radius:99px;overflow:hidden;display:flex;background:var(--bg-elevated);">
                <div style="width:${onPct}%;background:#f59e0b;" title="On-site: ${cg.work_modes["On-site"]}"></div>
                <div style="width:${hyPct}%;background:#06b6d4;" title="Hybrid: ${cg.work_modes["Hybrid"]}"></div>
                <div style="width:${rmPct}%;background:#10b981;" title="Remote: ${cg.work_modes["Remote"]}"></div>
              </div>
            </div>`;
          })
          .join("")}
      </div>
    `;
  }

  function renderResidencyPolicies() {
    const container = document.getElementById("residency-policy-list");
    const policies = [
      {
        title: "FedEx Group — 50-Mile Campus Radius Hybrid Mandate",
        employers: "FedEx Corporation, FedEx Dataworks, FedEx Freight, FedEx Supply Chain",
        badge: "Hybrid / 50-Mile Rule",
        color: "#06b6d4",
        detail:
          "Enforces a strict 50-mile radius rule around Collierville (60/80 FedEx Pkwy) and Hacks Cross (3620/3650 Hacks Cross Rd) or Tournament Dr campuses for hybrid roles."
      },
      {
        title: "City of Memphis & MLGW — 6-Month Shelby County Residency Rule",
        employers: "City of Memphis (Dept 270204), Memphis Light, Gas and Water (MLGW)",
        badge: "Mandatory Shelby Co. Residency",
        color: "#f59e0b",
        detail:
          "Candidates hired into municipal or utility IT roles must establish and maintain legal residence within Shelby County, TN within 6 months of hire."
      },
      {
        title: "xAI (SpaceXSI), SpaceX & Google — 100% On-Site Hyperscale Operations",
        employers: "xAI Colossus (Memphis/Southaven), SpaceX, Google (West Memphis, AR)",
        badge: "100% On-Site Supercluster",
        color: "#10b981",
        detail:
          "All SRE, Linux Bare-Metal, OT Network/Systems, and Data Center Technician roles require 100% physical on-site presence in Memphis, Southaven MS, or West Memphis AR."
      },
      {
        title: "U.S. Navy (NSA Mid-South), IRS ECC, Leidos, Peraton & Olympus Solutions",
        employers: "Millington Defense Corridor & South Memphis IRS Enterprise Computing Center",
        badge: "U.S. Citizenship / Clearance",
        color: "#ef4444",
        detail:
          "Requires U.S. Citizenship, DoD Secret/Top Secret clearance, or Federal Civilian Suitability adjudication for SOC, F5 Load Balancer, and Federal Network roles."
      },
      {
        title: "St. Jude, ALSAC, Raymond James & Frontdoor — Flexible Hybrid / Remote Rules",
        employers: "St. Jude, ALSAC, Frontdoor (Peabody Place), Raymond James",
        badge: "Remote / Quarterly / 3-Day Hybrid",
        color: "#a855f7",
        detail:
          "St. Jude offers Remote with 1 week/quarter onsite in Memphis for select senior roles (Rust Genomics, Workday Architect); ALSAC & Frontdoor offer US Remote; Raymond James follows a 3 days/week in-office hybrid schedule."
      }
    ];

    container.innerHTML = `
      <div style="display:flex;flex-direction:column;gap:10px;">
        ${policies
          .map(
            (p) => `
          <div style="background:var(--bg-input);border-left:4px solid ${p.color};border-radius:8px;padding:11px 14px;">
            <div style="display:flex;justify-content:space-between;align-items:center;gap:8px;margin-bottom:4px;flex-wrap:wrap;">
              <span style="font-weight:700;font-size:13px;color:var(--text-primary);">${escHtml(p.title)}</span>
              <span class="badge" style="background:${p.color}22;color:${p.color};border:1px solid ${p.color}55;">${escHtml(p.badge)}</span>
            </div>
            <div style="font-size:11.5px;color:var(--accent-secondary);font-weight:600;margin-bottom:4px;">${escHtml(p.employers)}</div>
            <div style="font-size:12px;color:var(--text-secondary);">${escHtml(p.detail)}</div>
          </div>`
          )
          .join("")}
      </div>
    `;
  }

  // ---------------------------------------------------------------------------
  // TAB 4: EMPLOYER DIRECTORY (86 COMPANIES)
  // ---------------------------------------------------------------------------
  function renderCompaniesDirectory() {
    const q = (document.getElementById("comp-filter-search").value || "").trim().toLowerCase();
    const status = document.getElementById("comp-filter-status").value;
    const sector = document.getElementById("comp-filter-sector").value;
    const corridor = document.getElementById("comp-filter-corridor").value;
    const skill = document.getElementById("comp-filter-skill").value;
    const sortBy = document.getElementById("comp-filter-sort").value;

    let list = DATA.companies.filter((c) => {
      if (status === "ACTIVE" && c.is_watchlist_only) return false;
      if (status === "WATCHLIST" && !c.is_watchlist_only) return false;
      if (sector !== "ALL" && c.macro_sector_id !== sector) return false;
      if (corridor !== "ALL" && c.corridor_group_id !== corridor) return false;
      if (skill !== "ALL" && !c.skill_ids.includes(skill)) return false;
      if (q) {
        const hay = `${c.company_name} ${c.parent_or_group || ""} ${c.sector} ${c.sub_market_corridor} ${c.notes || ""} ${c.ats_platform || ""}`.toLowerCase();
        if (!hay.includes(q)) return false;
      }
      return true;
    });

    if (sortBy === "local_tech") {
      list.sort((a, b) => (b.local_tech_roles_est || 0) - (a.local_tech_roles_est || 0) || b.cataloged_jobs_count - a.cataloged_jobs_count);
    } else if (sortBy === "cataloged") {
      list.sort((a, b) => b.cataloged_jobs_count - a.cataloged_jobs_count || (b.local_tech_roles_est || 0) - (a.local_tech_roles_est || 0));
    } else if (sortBy === "total_open") {
      list.sort((a, b) => (b.total_company_open_roles_2026 || 0) - (a.total_company_open_roles_2026 || 0));
    } else if (sortBy === "salary") {
      list.sort((a, b) => (b.avg_mid_usd || 0) - (a.avg_mid_usd || 0));
    } else if (sortBy === "name") {
      list.sort((a, b) => a.company_name.localeCompare(b.company_name));
    }

    document.getElementById("comp-results-summary").textContent = `Showing ${list.length} of ${DATA.companies.length} Greater Memphis Employers`;

    const grid = document.getElementById("companies-grid");
    grid.innerHTML = list
      .map(
        (c) => `
      <div class="entity-card open-company-modal" data-comp="${escHtml(c.company_name)}" style="cursor:pointer;">
        <div>
          <div style="display:flex;justify-content:space-between;align-items:flex-start;gap:8px;margin-bottom:6px;">
            <div>
              <div class="entity-card-title">${escHtml(c.company_name)}</div>
              <div style="font-size:11.5px;color:var(--text-muted);">${escHtml(c.sector)}</div>
            </div>
            ${
              c.is_watchlist_only
                ? `<span class="badge badge-watchlist">Watchlist / Startup</span>`
                : `<span class="badge badge-salary">${c.cataloged_jobs_count} IT Role${c.cataloged_jobs_count !== 1 ? "s" : ""}</span>`
            }
          </div>

          <div class="entity-card-meta" style="margin-bottom:8px;">
            <span>📍 ${escHtml(c.sub_market_corridor)}</span>
            ${c.ats_platform ? `<span>· 🗂️ ${escHtml(c.ats_platform)}</span>` : ""}
          </div>

          <div style="display:grid;grid-template-columns:repeat(3,1fr);gap:6px;background:var(--bg-input);padding:8px;border-radius:8px;margin-bottom:10px;text-align:center;font-size:11.5px;">
            <div>
              <div style="font-weight:800;color:var(--text-primary);">${c.local_tech_roles_est || "—"}</div>
              <div style="font-size:10px;color:var(--text-muted);">Est. Tech Roles</div>
            </div>
            <div>
              <div style="font-weight:800;color:var(--accent-secondary);">${c.total_company_open_roles_2026 || "—"}</div>
              <div style="font-size:10px;color:var(--text-muted);">Total 2026 Open</div>
            </div>
            <div>
              <div style="font-weight:800;color:#10b981;">${fmtShortK(c.avg_mid_usd)}</div>
              <div style="font-size:10px;color:var(--text-muted);">Avg Mid Pay</div>
            </div>
          </div>

          <div style="font-size:12px;color:var(--text-secondary);margin-bottom:10px;line-height:1.45;">
            ${escHtml(c.notes || "")}
          </div>
        </div>

        <div style="display:flex;flex-wrap:wrap;gap:4px;border-top:1px solid var(--border-color);padding-top:8px;">
          ${c.skills
            .slice(0, 6)
            .map(
              (sk) =>
                `<span class="badge" style="background:${sk.color}20;color:${sk.color};border:1px solid ${sk.color}44;">${escHtml(sk.name)}</span>`
            )
            .join("")}
          ${c.skills.length > 6 ? `<span class="badge" style="background:var(--bg-elevated);color:var(--text-muted);">+${c.skills.length - 6} more</span>` : ""}
        </div>
      </div>`
      )
      .join("");

    bindModalTriggers(grid);
  }

  // ---------------------------------------------------------------------------
  // TAB 5: VERIFIED IT JOBS EXPLORER (118 ROLES + IN-BROWSER SQLITE WASM)
  // ---------------------------------------------------------------------------
  function getFilteredJobs() {
    const q = (document.getElementById("job-filter-search").value || "").trim().toLowerCase();
    const skill = document.getElementById("job-filter-skill").value;
    const roleClass = document.getElementById("job-filter-class").value;
    const workMode = document.getElementById("job-filter-workmode").value;
    const corridor = document.getElementById("job-filter-corridor").value;
    const salFilter = document.getElementById("job-filter-salary").value;
    const sortBy = document.getElementById("job-filter-sort").value;

    const wasmSet = STATE.wasmSearchJobIds ? new Set(STATE.wasmSearchJobIds) : null;

    let list = DATA.jobs.filter((j) => {
      if (skill !== "ALL" && !j.skill_ids.includes(skill)) return false;
      if (roleClass !== "ALL" && j.role_classification !== roleClass) return false;
      if (workMode !== "ALL" && j.work_mode !== workMode) return false;
      if (corridor !== "ALL" && j.corridor_group_id !== corridor) return false;
      if (salFilter === "DISCLOSED" && j.annual_mid_usd === null) return false;
      if (salFilter !== "ALL" && salFilter !== "DISCLOSED") {
        const minThreshold = parseFloat(salFilter);
        if (!j.annual_mid_usd || j.annual_mid_usd < minThreshold) return false;
      }
      if (q) {
        if (wasmSet) {
          if (!wasmSet.has(j.job_id)) return false;
        } else {
          const hay = `${j.job_title} ${j.company_name} ${j.role_classification} ${j.tech_stack_tags} ${j.city} ${j.state} ${j.requisition_id || ""}`.toLowerCase();
          if (!hay.includes(q)) return false;
        }
      }
      return true;
    });

    if (sortBy === "salary_desc") {
      list.sort((a, b) => (b.annual_mid_usd || -1) - (a.annual_mid_usd || -1));
    } else if (sortBy === "company") {
      list.sort((a, b) => a.company_name.localeCompare(b.company_name) || a.job_title.localeCompare(b.job_title));
    } else if (sortBy === "title") {
      list.sort((a, b) => a.job_title.localeCompare(b.job_title));
    } else {
      list.sort((a, b) => a.job_id - b.job_id);
    }

    return list;
  }

  function renderJobsExplorer() {
    const list = getFilteredJobs();
    const withPay = list.filter((j) => j.annual_mid_usd !== null && j.annual_mid_usd !== undefined);
    const avgPay = withPay.length
      ? Math.round(withPay.reduce((s, j) => s + j.annual_mid_usd, 0) / withPay.length)
      : null;

    document.getElementById("job-results-summary").innerHTML = `
      Showing <b>${list.length}</b> of ${DATA.jobs.length} Verified 2026 IT Job Postings
      ${avgPay ? ` · Avg Advertised Midpoint: <b style="color:#10b981;">${fmtCurrency(avgPay)}</b> (${withPay.length} w/ pay)` : ""}
    `;

    const container = document.getElementById("jobs-results-container");
    if (STATE.jobViewMode === "cards") {
      container.innerHTML = `
        <div class="cards-grid">
          ${list
            .map(
              (j) => `
            <div class="entity-card open-job-modal" data-job="${j.job_id}" style="cursor:pointer;">
              <div>
                <div style="display:flex;justify-content:space-between;align-items:flex-start;gap:8px;margin-bottom:6px;">
                  <span class="badge" style="background:var(--bg-elevated);color:var(--text-secondary);">${escHtml(j.role_classification)}</span>
                  <div style="display:flex;gap:5px;align-items:center;">
                    ${j.raw_compensation ? `<span class="badge badge-salary">${escHtml(j.raw_compensation)}</span>` : ""}
                    ${workModeBadge(j.work_mode)}
                  </div>
                </div>
                <div class="entity-card-title" style="margin-bottom:4px;">${escHtml(j.job_title)}</div>
                <div style="font-size:13px;font-weight:700;color:var(--accent-secondary);margin-bottom:6px;">
                  ${escHtml(j.company_name)}
                  <span style="color:var(--text-muted);font-weight:400;font-size:12px;"> · ${escHtml(j.city)}, ${escHtml(j.state)}</span>
                </div>
                <div style="font-size:11.5px;color:var(--text-muted);margin-bottom:8px;">
                  Seniority: <b>${escHtml(j.seniority_level)}</b>
                  ${j.residency_or_radius_rule ? ` · Policy: <span>${escHtml(j.residency_or_radius_rule)}</span>` : ""}
                </div>
                <div style="font-size:11.5px;color:var(--text-secondary);background:var(--bg-input);padding:7px 9px;border-radius:6px;margin-bottom:8px;">
                  <b>Raw Stack:</b> ${escHtml(j.tech_stack_tags)}
                </div>
              </div>
              <div style="display:flex;flex-wrap:wrap;gap:4px;border-top:1px solid var(--border-color);padding-top:8px;">
                ${j.canonical_skills
                  .map(
                    (sk) =>
                      `<span class="badge" style="background:${sk.color}20;color:${sk.color};border:1px solid ${sk.color}44;">${escHtml(sk.name)}</span>`
                  )
                  .join("")}
              </div>
            </div>`
            )
            .join("")}
        </div>
      `;
    } else {
      container.innerHTML = `
        <div class="data-table-wrap">
          <table class="data-table">
            <thead>
              <tr>
                <th>ID</th>
                <th>Company</th>
                <th>Job Title</th>
                <th>Classification</th>
                <th>Seniority</th>
                <th>Work Mode</th>
                <th>Location</th>
                <th>Advertised Pay</th>
                <th>Canonical Skills</th>
                <th>Source</th>
              </tr>
            </thead>
            <tbody>
              ${list
                .map(
                  (j) => `
                <tr class="open-job-modal" data-job="${j.job_id}" style="cursor:pointer;">
                  <td>${j.job_id}</td>
                  <td style="font-weight:700;color:var(--text-primary);">${escHtml(j.company_name)}</td>
                  <td style="font-weight:600;color:var(--accent-secondary);">${escHtml(j.job_title)}</td>
                  <td>${escHtml(j.role_classification)}</td>
                  <td>${escHtml(j.seniority_level)}</td>
                  <td>${workModeBadge(j.work_mode)}</td>
                  <td>${escHtml(j.city)}, ${escHtml(j.state)}</td>
                  <td style="font-family:var(--font-mono);color:#10b981;font-weight:600;">${escHtml(j.raw_compensation || "—")}</td>
                  <td>
                    <div style="display:flex;flex-wrap:wrap;gap:3px;">
                      ${j.canonical_skills
                        .map(
                          (sk) =>
                            `<span class="badge" style="background:${sk.color}20;color:${sk.color};">${escHtml(sk.name)}</span>`
                        )
                        .join("")}
                    </div>
                  </td>
                  <td><a href="${escHtml(j.source_url)}" target="_blank" rel="noopener" onclick="event.stopPropagation();">Posting ↗</a></td>
                </tr>`
                )
                .join("")}
            </tbody>
          </table>
        </div>
      `;
    }

    bindModalTriggers(container);
  }

  // ---------------------------------------------------------------------------
  // TAB 6: IN-BROWSER SQLITE WEBASSEMBLY SLICE & DICE WORKBENCH
  // ---------------------------------------------------------------------------
  function renderSqlWorkbench() {
    const listEl = document.getElementById("curated-sql-list");
    const queries = DATA.curated_queries || [];

    listEl.innerHTML = queries
      .map(
        (q, idx) => `
      <div class="curated-sql-item" data-idx="${idx}" style="cursor:pointer;padding:10px 12px;border-radius:8px;border:1px solid var(--border-color);background:var(--bg-input);transition:border-color 0.15s;">
        <div style="display:flex;justify-content:space-between;align-items:center;margin-bottom:3px;">
          <span style="font-weight:700;font-size:12.5px;color:var(--text-primary);">${escHtml(q.title)}</span>
          <span class="badge" style="background:var(--bg-elevated);color:var(--accent-secondary);font-size:10px;">${escHtml(q.category)}</span>
        </div>
        <div style="font-size:11.5px;color:var(--text-muted);line-height:1.35;">${escHtml(q.description)}</div>
      </div>`
      )
      .join("");

    listEl.querySelectorAll(".curated-sql-item").forEach((el) => {
      el.addEventListener("click", () => {
        const idx = parseInt(el.getAttribute("data-idx"), 10);
        loadAndRunCuratedQuery(idx);
      });
    });

    if (queries.length > 0) {
      loadAndRunCuratedQuery(0);
    }
  }

  function loadAndRunCuratedQuery(idx) {
    const q = DATA.curated_queries[idx];
    if (!q) return;
    document.getElementById("sql-active-title").textContent = q.title;
    document.getElementById("sql-active-desc").textContent = q.description;
    document.getElementById("sql-editor-textarea").value = q.sql;
    executeSqlInWorkbench(q.sql, q.precomputed);
  }

  function executeSqlInWorkbench(sqlText, fallbackResult) {
    const statusEl = document.getElementById("sql-status-bar");
    const tableWrap = document.getElementById("sql-results-table-wrap");
    const chartWrap = document.getElementById("sql-visual-bar-chart");

    const t0 = performance.now();
    let result = null;

    if (WASM_DB) {
      try {
        const execOut = WASM_DB.exec(sqlText);
        const elapsedMs = (performance.now() - t0).toFixed(2);
        if (!execOut || execOut.length === 0) {
          result = { columns: [], rows: [], row_count: 0, elapsedMs, engine: "SQLite 3 WebAssembly" };
        } else {
          const first = execOut[0];
          result = {
            columns: first.columns,
            rows: first.values,
            row_count: first.values.length,
            elapsedMs,
            engine: "SQLite 3 WebAssembly"
          };
        }
      } catch (err) {
        result = { error: err.message || String(err) };
      }
    } else if (fallbackResult) {
      result = { ...fallbackResult, elapsedMs: "0.10", engine: "Pre-compiled Bundle" };
    } else {
      // Check if sqlText matches any precomputed curated query
      const match = (window.MEMPHIS_STATIC_DATA && window.MEMPHIS_STATIC_DATA.curated_queries || []).find(
        (q) => q.sql.trim() === (sqlText || "").trim()
      );
      if (match && match.precomputed) {
        result = { ...match.precomputed, elapsedMs: "0.10", engine: "Pre-compiled Bundle" };
      } else {
        result = { error: "SQLite WebAssembly CDN script is still loading or blocked by offline mode." };
      }
    }

    if (result.error) {
      statusEl.innerHTML = `<span style="color:var(--accent-rose);font-weight:700;">SQL Error: ${escHtml(result.error)}</span>`;
      tableWrap.innerHTML = "";
      chartWrap.innerHTML = "";
      return;
    }

    STATE.lastSqlResult = result;
    statusEl.innerHTML = `
      <span style="color:#10b981;font-weight:600;">
        ✓ Returned ${result.row_count} row(s) · ${result.columns.length} columns in ${result.elapsedMs} ms (${result.engine})
      </span>
      <span>Tip: Edit the SQL query above or click any Table/View badge to explore <code>memphis_it_jobs_2026.db</code> in-browser.</span>
    `;

    renderAutoSqlChart(chartWrap, result);

    tableWrap.innerHTML = `
      <table class="data-table">
        <thead>
          <tr>${result.columns.map((c) => `<th>${escHtml(c)}</th>`).join("")}</tr>
        </thead>
        <tbody>
          ${result.rows
            .map(
              (r) =>
                `<tr>${r
                  .map((cell) => `<td>${cell === null ? '<span style="color:var(--text-muted)">NULL</span>' : escHtml(cell)}</td>`)
                  .join("")}</tr>`
            )
            .join("")}
        </tbody>
      </table>
    `;
  }

  function renderAutoSqlChart(container, result) {
    if (!result || !result.rows || result.rows.length < 2 || result.columns.length < 2) {
      container.innerHTML = "";
      return;
    }
    let numColIdx = -1;
    for (let c = 1; c < result.columns.length; c++) {
      const sample = result.rows[0][c];
      if (typeof sample === "number") {
        numColIdx = c;
        break;
      }
    }
    if (numColIdx === -1) {
      container.innerHTML = "";
      return;
    }

    const topRows = result.rows.slice(0, 10);
    const maxVal = Math.max(1, ...topRows.map((r) => Number(r[numColIdx]) || 0));
    const colName = result.columns[numColIdx];

    container.innerHTML = `
      <div style="background:var(--bg-input);border:1px solid var(--border-color);border-radius:10px;padding:12px 14px;">
        <div style="font-size:11.5px;font-weight:700;text-transform:uppercase;color:var(--text-muted);margin-bottom:8px;">
          Quick Visual Preview — ${escHtml(result.columns[0])} by ${escHtml(colName)} (Top ${topRows.length})
        </div>
        <div style="display:grid;grid-template-columns:repeat(auto-fit,minmax(240px,1fr));gap:8px;">
          ${topRows
            .map((r) => {
              const label = String(r[0] || "");
              const val = Number(r[numColIdx]) || 0;
              const pct = Math.round((val / maxVal) * 100);
              return `
                <div>
                  <div style="display:flex;justify-content:space-between;font-size:11.5px;margin-bottom:2px;">
                    <span style="font-weight:600;white-space:nowrap;overflow:hidden;text-overflow:ellipsis;max-width:190px;">${escHtml(label)}</span>
                    <span style="font-family:var(--font-mono);color:var(--accent-secondary);font-weight:700;">${val.toLocaleString()}</span>
                  </div>
                  <div style="height:6px;background:var(--bg-elevated);border-radius:99px;overflow:hidden;">
                    <div style="width:${pct}%;height:100%;background:linear-gradient(90deg,#6366f1,#06b6d4);"></div>
                  </div>
                </div>`;
            })
            .join("")}
        </div>
      </div>
    `;
  }

  // ---------------------------------------------------------------------------
  // MODALS: SKILL DEEP-DIVE, COMPANY DEEP-DIVE, JOB & INTERSECTION
  // ---------------------------------------------------------------------------
  function openModalWithHtml(html) {
    const backdrop = document.getElementById("detail-modal-backdrop");
    const body = document.getElementById("detail-modal-body");
    body.innerHTML = html;
    backdrop.classList.add("open");
    bindModalTriggers(body);
  }

  function closeModal() {
    document.getElementById("detail-modal-backdrop").classList.remove("open");
  }

  function openSkillModal(skillId) {
    const sk = DATA.skills.find((s) => s.id === skillId);
    if (!sk) return;
    const skillJobs = DATA.jobs.filter((j) => j.skill_ids.includes(skillId));

    openModalWithHtml(`
      <div>
        <span class="badge" style="background:${sk.bg};color:${sk.color};border:1px solid ${sk.color}55;margin-bottom:6px;">
          ${escHtml(sk.category)}
        </span>
        <h2 style="font-size:22px;font-weight:800;margin-bottom:6px;">${escHtml(sk.name)}</h2>
        <p style="font-size:13px;color:var(--text-secondary);margin-bottom:16px;">
          Demanded across <b>${sk.total_company_count} Memphis employers</b> and <b>${sk.job_count} verified 2026 IT job postings</b>
          ${sk.avg_salary_usd ? ` with an average advertised midpoint salary of <b style="color:#10b981;">${fmtCurrency(sk.avg_salary_usd)}</b> (${fmtCurrency(sk.min_salary_usd)} – ${fmtCurrency(sk.max_salary_usd)})` : ""}.
        </p>

        <div style="margin-bottom:16px;">
          <div style="font-size:12px;font-weight:700;text-transform:uppercase;color:var(--text-muted);margin-bottom:8px;">
            Hiring Employers in Greater Memphis (${sk.companies.length})
          </div>
          <div style="display:grid;grid-template-columns:repeat(auto-fill,minmax(240px,1fr));gap:8px;">
            ${sk.companies
              .map(
                (c) => `
              <div class="open-company-modal" data-comp="${escHtml(c.company_name)}" style="cursor:pointer;background:var(--bg-input);border:1px solid var(--border-color);border-radius:8px;padding:9px 12px;display:flex;justify-content:space-between;align-items:center;">
                <div>
                  <div style="font-weight:700;font-size:12.5px;color:var(--text-primary);">${escHtml(c.company_name)}</div>
                  <div style="font-size:11px;color:var(--text-muted);">${escHtml(c.corridor_short_name)}</div>
                </div>
                <span class="badge" style="background:${sk.color}22;color:${sk.color};">
                  ${c.job_count > 0 ? `${c.job_count} role(s)` : "Stack Note"}
                </span>
              </div>`
              )
              .join("")}
          </div>
        </div>

        <div style="margin-bottom:16px;">
          <div style="font-size:12px;font-weight:700;text-transform:uppercase;color:var(--text-muted);margin-bottom:8px;">
            Verified 2026 Job Postings Requiring ${escHtml(sk.name)} (${skillJobs.length})
          </div>
          <div style="display:flex;flex-direction:column;gap:8px;">
            ${skillJobs
              .map(
                (j) => `
              <div style="background:var(--bg-input);border:1px solid var(--border-color);border-radius:8px;padding:10px 14px;display:flex;justify-content:space-between;align-items:flex-start;gap:10px;flex-wrap:wrap;">
                <div>
                  <div style="font-weight:700;font-size:13.5px;color:var(--text-primary);">${escHtml(j.job_title)}</div>
                  <div style="font-size:12px;color:var(--accent-secondary);font-weight:600;">${escHtml(j.company_name)} · ${escHtml(j.city)}, ${escHtml(j.state)}</div>
                  <div style="font-size:11.5px;color:var(--text-muted);margin-top:3px;">Stack: ${escHtml(j.tech_stack_tags)}</div>
                </div>
                <div style="display:flex;gap:6px;align-items:center;">
                  ${j.raw_compensation ? `<span class="badge badge-salary">${escHtml(j.raw_compensation)}</span>` : ""}
                  ${workModeBadge(j.work_mode)}
                  <a href="${escHtml(j.source_url)}" target="_blank" rel="noopener" class="btn btn-sm btn-primary">Apply ↗</a>
                </div>
              </div>`
              )
              .join("")}
          </div>
        </div>
      </div>
    `);
  }

  function openCompanyModal(companyName) {
    const comp = DATA.companies.find((c) => c.company_name === companyName);
    if (!comp) return;

    openModalWithHtml(`
      <div>
        <div style="display:flex;gap:8px;align-items:center;margin-bottom:6px;flex-wrap:wrap;">
          <span class="badge" style="background:${comp.macro_sector_color}22;color:${comp.macro_sector_color};border:1px solid ${comp.macro_sector_color}55;">
            ${escHtml(comp.macro_sector_name)}
          </span>
          <span class="badge" style="background:var(--bg-elevated);color:var(--text-secondary);">
            📍 ${escHtml(comp.sub_market_corridor)}
          </span>
          ${comp.ats_platform ? `<span class="badge" style="background:var(--bg-elevated);color:var(--text-muted);">ATS: ${escHtml(comp.ats_platform)}</span>` : ""}
        </div>

        <div style="display:flex;justify-content:space-between;align-items:flex-start;gap:12px;flex-wrap:wrap;margin-bottom:12px;">
          <div>
            <h2 style="font-size:22px;font-weight:800;">${escHtml(comp.company_name)}</h2>
            ${comp.parent_or_group ? `<div style="font-size:12.5px;color:var(--text-muted);">Parent / Group: ${escHtml(comp.parent_or_group)} · Sector: ${escHtml(comp.sector)}</div>` : ""}
          </div>
          ${
            comp.career_portal_url
              ? `<a href="${escHtml(comp.career_portal_url)}" target="_blank" rel="noopener" class="btn btn-primary">Open Career Portal ↗</a>`
              : ""
          }
        </div>

        <div style="background:var(--bg-input);border-left:4px solid ${comp.macro_sector_color};padding:12px 14px;border-radius:8px;margin-bottom:16px;font-size:13px;color:var(--text-secondary);">
          <b>2026 Research Intelligence:</b> ${escHtml(comp.notes || "Active Greater Memphis IT Employer.")}
        </div>

        <div style="display:grid;grid-template-columns:repeat(4,1fr);gap:10px;margin-bottom:16px;text-align:center;">
          <div style="background:var(--bg-input);padding:10px;border-radius:8px;">
            <div style="font-size:20px;font-weight:800;">${comp.cataloged_jobs_count}</div>
            <div style="font-size:11px;color:var(--text-muted);">Cataloged IT Postings</div>
          </div>
          <div style="background:var(--bg-input);padding:10px;border-radius:8px;">
            <div style="font-size:20px;font-weight:800;color:var(--accent-secondary);">${comp.local_tech_roles_est || "—"}</div>
            <div style="font-size:11px;color:var(--text-muted);">Est. Local Tech Roles</div>
          </div>
          <div style="background:var(--bg-input);padding:10px;border-radius:8px;">
            <div style="font-size:20px;font-weight:800;">${comp.total_company_open_roles_2026 || "—"}</div>
            <div style="font-size:11px;color:var(--text-muted);">Total 2026 Openings</div>
          </div>
          <div style="background:var(--bg-input);padding:10px;border-radius:8px;">
            <div style="font-size:20px;font-weight:800;color:#10b981;">${fmtCurrency(comp.avg_mid_usd)}</div>
            <div style="font-size:11px;color:var(--text-muted);">Avg Advertised Pay</div>
          </div>
        </div>

        <div style="margin-bottom:16px;">
          <div style="font-size:12px;font-weight:700;text-transform:uppercase;color:var(--text-muted);margin-bottom:8px;">
            Identified Technical Skills &amp; Platforms (${comp.skills.length})
          </div>
          <div class="pill-group">
            ${comp.skills
              .map(
                (sk) => `
              <span class="badge open-skill-modal" data-skill="${escHtml(sk.id)}" style="cursor:pointer;background:${sk.color}22;color:${sk.color};border:1px solid ${sk.color}55;padding:5px 10px;font-size:12px;">
                ${escHtml(sk.name)} ${sk.job_count > 0 ? `(${sk.job_count})` : "•"}
              </span>`
              )
              .join("")}
          </div>
        </div>

        <div>
          <div style="font-size:12px;font-weight:700;text-transform:uppercase;color:var(--text-muted);margin-bottom:8px;">
            Verified 2026 IT Job Postings (${comp.jobs.length})
          </div>
          ${
            comp.jobs.length === 0
              ? `<div style="padding:14px;background:var(--bg-input);border-radius:8px;color:var(--text-muted);font-size:12.5px;">
                  This employer is tracked in the 2026 Memphis Watchlist / Startup cohort (${comp.total_company_open_roles_2026 || 0} open roles). Visit their Career Portal above to monitor newly opened IT requisitions.
                 </div>`
              : `<div style="display:flex;flex-direction:column;gap:8px;">
                  ${comp.jobs
                    .map(
                      (j) => `
                    <div style="background:var(--bg-input);border:1px solid var(--border-color);border-radius:8px;padding:12px 14px;display:flex;justify-content:space-between;align-items:flex-start;gap:10px;flex-wrap:wrap;">
                      <div>
                        <div style="font-weight:700;font-size:14px;color:var(--text-primary);">${escHtml(j.job_title)}</div>
                        <div style="font-size:12px;color:var(--text-muted);margin-top:2px;">
                          ${escHtml(j.role_classification)} · ${escHtml(j.seniority_level)} · ${escHtml(j.city)}, ${escHtml(j.state)}
                          ${j.residency_or_radius_rule ? ` · <b>${escHtml(j.residency_or_radius_rule)}</b>` : ""}
                        </div>
                        <div style="font-size:12px;color:var(--text-secondary);margin-top:5px;">
                          <b>Tech Stack:</b> ${escHtml(j.tech_stack_tags)}
                        </div>
                      </div>
                      <div style="display:flex;gap:6px;align-items:center;">
                        ${j.raw_compensation ? `<span class="badge badge-salary">${escHtml(j.raw_compensation)}</span>` : ""}
                        ${workModeBadge(j.work_mode)}
                        <a href="${escHtml(j.source_url)}" target="_blank" rel="noopener" class="btn btn-sm btn-primary">Apply ↗</a>
                      </div>
                    </div>`
                    )
                    .join("")}
                </div>`
          }
        </div>
      </div>
    `);
  }

  function openJobModal(jobId) {
    const j = DATA.jobs.find((x) => x.job_id === Number(jobId));
    if (!j) return;

    openModalWithHtml(`
      <div>
        <div style="display:flex;gap:6px;align-items:center;margin-bottom:8px;flex-wrap:wrap;">
          <span class="badge" style="background:var(--bg-elevated);color:var(--text-secondary);">${escHtml(j.role_classification)}</span>
          <span class="badge" style="background:var(--bg-elevated);color:var(--text-secondary);">${escHtml(j.seniority_level)}</span>
          ${workModeBadge(j.work_mode)}
          ${j.raw_compensation ? `<span class="badge badge-salary">${escHtml(j.raw_compensation)}</span>` : ""}
        </div>

        <h2 style="font-size:21px;font-weight:800;margin-bottom:4px;">${escHtml(j.job_title)}</h2>
        <div style="font-size:14px;font-weight:700;color:var(--accent-secondary);margin-bottom:14px;cursor:pointer;" class="open-company-modal" data-comp="${escHtml(j.company_name)}">
          ${escHtml(j.company_name)} (${escHtml(j.sector)}) — Click to view full company profile →
        </div>

        <div style="display:grid;grid-template-columns:repeat(auto-fit,minmax(180px,1fr));gap:10px;background:var(--bg-input);padding:12px;border-radius:10px;margin-bottom:16px;font-size:12.5px;">
          <div><span style="color:var(--text-muted);">Location:</span><br/><b>${escHtml(j.city)}, ${escHtml(j.state)} ${escHtml(j.zip_code || "")}</b></div>
          <div><span style="color:var(--text-muted);">Corridor:</span><br/><b>${escHtml(j.sub_market_corridor)}</b></div>
          <div><span style="color:var(--text-muted);">Residency / Radius Rule:</span><br/><b>${escHtml(j.residency_or_radius_rule || "Standard")}</b></div>
          <div><span style="color:var(--text-muted);">Posting Status / Req ID:</span><br/><b>${escHtml(j.posting_status_2026 || "Active")} ${j.requisition_id ? `(#${escHtml(j.requisition_id)})` : ""}</b></div>
        </div>

        <div style="margin-bottom:16px;">
          <div style="font-size:12px;font-weight:700;text-transform:uppercase;color:var(--text-muted);margin-bottom:6px;">
            Raw Advertised Tech Stack Tags
          </div>
          <div style="background:var(--bg-input);padding:12px;border-radius:8px;font-family:var(--font-mono);font-size:12.5px;color:var(--text-primary);">
            ${escHtml(j.tech_stack_tags)}
          </div>
        </div>

        <div style="margin-bottom:18px;">
          <div style="font-size:12px;font-weight:700;text-transform:uppercase;color:var(--text-muted);margin-bottom:6px;">
            Normalized Canonical Skills (Click to See Other Memphis Employers Hiring for Skill)
          </div>
          <div class="pill-group">
            ${j.canonical_skills
              .map(
                (sk) => `
              <span class="badge open-skill-modal" data-skill="${escHtml(sk.id)}" style="cursor:pointer;background:${sk.color}22;color:${sk.color};border:1px solid ${sk.color}55;padding:5px 10px;font-size:12px;">
                ${escHtml(sk.name)}
              </span>`
              )
              .join("")}
          </div>
        </div>

        <div style="display:flex;gap:10px;flex-wrap:wrap;">
          <a href="${escHtml(j.source_url)}" target="_blank" rel="noopener" class="btn btn-primary">Open Verified Job Posting ↗</a>
          ${
            j.career_portal_url
              ? `<a href="${escHtml(j.career_portal_url)}" target="_blank" rel="noopener" class="btn">Employer Career Portal ↗</a>`
              : ""
          }
        </div>
      </div>
    `);
  }

  function openIntersectionModal(skillId, companyName) {
    const sk = DATA.skills.find((s) => s.id === skillId);
    const comp = DATA.companies.find((c) => c.company_name === companyName);
    if (!sk || !comp) return;

    const jobs = comp.jobs.filter((j) => j.skill_ids.includes(skillId));
    openModalWithHtml(`
      <div>
        <div style="font-size:12px;font-weight:700;color:${sk.color};text-transform:uppercase;margin-bottom:4px;">
          Skill × Employer Intersection
        </div>
        <h2 style="font-size:20px;font-weight:800;margin-bottom:8px;">
          ${escHtml(comp.company_name)} ↔ ${escHtml(sk.name)}
        </h2>
        <p style="font-size:12.5px;color:var(--text-secondary);margin-bottom:14px;">
          ${escHtml(comp.notes || "")}
        </p>
        <div style="display:flex;gap:8px;margin-bottom:16px;">
          <button class="btn btn-sm open-company-modal" data-comp="${escHtml(comp.company_name)}">Full ${escHtml(comp.company_name)} Profile</button>
          <button class="btn btn-sm open-skill-modal" data-skill="${escHtml(sk.id)}">All ${escHtml(sk.name)} Employers (${sk.total_company_count})</button>
        </div>
        <div style="display:flex;flex-direction:column;gap:8px;">
          ${
            jobs.length > 0
              ? jobs
                  .map(
                    (j) => `
                <div style="background:var(--bg-input);border:1px solid var(--border-color);border-radius:8px;padding:12px 14px;display:flex;justify-content:space-between;align-items:flex-start;gap:10px;flex-wrap:wrap;">
                  <div>
                    <div style="font-weight:700;font-size:14px;">${escHtml(j.job_title)}</div>
                    <div style="font-size:12px;color:var(--text-muted);">${escHtml(j.role_classification)} · ${escHtml(j.seniority_level)} · ${escHtml(j.work_mode)}</div>
                    <div style="font-size:12px;color:var(--text-secondary);margin-top:4px;"><b>Stack:</b> ${escHtml(j.tech_stack_tags)}</div>
                  </div>
                  <div style="display:flex;gap:6px;align-items:center;">
                    ${j.raw_compensation ? `<span class="badge badge-salary">${escHtml(j.raw_compensation)}</span>` : ""}
                    <a href="${escHtml(j.source_url)}" target="_blank" rel="noopener" class="btn btn-sm btn-primary">Apply ↗</a>
                  </div>
                </div>`
                  )
                  .join("")
              : `<div style="padding:12px;background:var(--bg-input);border-radius:8px;color:var(--text-muted);">
                  Identified via Company Tech Stack Intelligence Notes.
                 </div>`
          }
        </div>
      </div>
    `);
  }

  function bindModalTriggers(rootEl) {
    if (!rootEl) return;
    rootEl.querySelectorAll(".open-company-modal").forEach((el) => {
      el.addEventListener("click", (e) => {
        e.stopPropagation();
        openCompanyModal(el.getAttribute("data-comp"));
      });
    });
    rootEl.querySelectorAll(".open-skill-modal").forEach((el) => {
      el.addEventListener("click", (e) => {
        e.stopPropagation();
        openSkillModal(el.getAttribute("data-skill"));
      });
    });
    rootEl.querySelectorAll(".open-job-modal").forEach((el) => {
      el.addEventListener("click", (e) => {
        e.stopPropagation();
        openJobModal(el.getAttribute("data-job"));
      });
    });
  }

  // ---------------------------------------------------------------------------
  // NAVIGATION & GLOBAL EVENT BINDINGS
  // ---------------------------------------------------------------------------
  function switchTab(tabId) {
    STATE.activeTab = tabId;
    document.querySelectorAll(".nav-tab").forEach((btn) => {
      btn.classList.toggle("active", btn.getAttribute("data-tab") === tabId);
    });
    document.querySelectorAll(".tab-pane").forEach((pane) => {
      pane.classList.toggle("active", pane.id === tabId);
    });
  }

  function exportCsv(filename, columns, rows) {
    const escapeCsv = (val) => {
      const s = val === null || val === undefined ? "" : String(val);
      if (s.includes(",") || s.includes('"') || s.includes("\n")) {
        return '"' + s.replace(/"/g, '""') + '"';
      }
      return s;
    };
    const lines = [columns.map(escapeCsv).join(",")];
    rows.forEach((r) => lines.push(r.map(escapeCsv).join(",")));
    const blob = new Blob([lines.join("\n")], { type: "text/csv;charset=utf-8;" });
    const url = URL.createObjectURL(blob);
    const a = document.createElement("a");
    a.href = url;
    a.download = filename;
    document.body.appendChild(a);
    a.click();
    document.body.removeChild(a);
    URL.revokeObjectURL(url);
  }

  function triggerWasmJobSearch(query) {
    const q = (query || "").trim();
    if (!q) {
      STATE.wasmSearchJobIds = null;
      renderJobsExplorer();
      return;
    }
    if (WASM_DB) {
      try {
        const pat = `%${q}%`;
        const rows = queryWasmObjects(
          WASM_DB,
          `SELECT job_id FROM v_jobs_enriched
           WHERE job_title LIKE $p OR company_name LIKE $p OR tech_stack_tags LIKE $p
              OR role_classification LIKE $p OR city LIKE $p OR sector LIKE $p`,
          { $p: pat }
        );
        STATE.wasmSearchJobIds = rows.map((r) => r.job_id);
      } catch (e) {
        STATE.wasmSearchJobIds = null;
      }
    } else {
      STATE.wasmSearchJobIds = null;
    }
    renderJobsExplorer();
  }

  function bindNavigationAndGlobalEvents() {
    document.querySelectorAll(".nav-tab").forEach((btn) => {
      btn.addEventListener("click", () => switchTab(btn.getAttribute("data-tab")));
    });

    document.getElementById("theme-toggle-btn").addEventListener("click", () => {
      const isLight = document.documentElement.classList.toggle("light");
      document.getElementById("theme-icon").textContent = isLight ? "🌙 Dark" : "☀️ Light";
    });

    const globalInput = document.getElementById("global-search-input");
    globalInput.addEventListener("keydown", (e) => {
      if (e.key === "Enter") {
        const val = globalInput.value.trim();
        document.getElementById("job-filter-search").value = val;
        switchTab("tab-jobs");
        triggerWasmJobSearch(val);
      }
    });

    document.querySelectorAll(".persona-btn").forEach((btn) => {
      btn.addEventListener("click", () => {
        const sids = btn.getAttribute("data-skills").split(",").filter(Boolean);
        STATE.selectedCandidateSkills = new Set(sids);
        renderCandidateSkillSelector();
        renderCandidateMatchResults();
      });
    });

    document.getElementById("clear-candidate-skills-btn").addEventListener("click", () => {
      STATE.selectedCandidateSkills.clear();
      renderCandidateSkillSelector();
      renderCandidateMatchResults();
    });

    // Pure client-side skill extraction from pasted resume/keywords
    const parseResumeBtn = document.getElementById("parse-resume-btn");
    const resumeInput = document.getElementById("resume-skill-input");
    const runResumeExtract = () => {
      const txt = (resumeInput.value || "").trim().toLowerCase();
      if (!txt) return;
      DATA.skills.forEach((sk) => {
        const nameParts = sk.name.toLowerCase().split(/[&,()/]+/).map((s) => s.trim()).filter((s) => s.length >= 2);
        const allTerms = [sk.name.toLowerCase(), ...(sk.keywords || []).map((k) => k.toLowerCase()), ...nameParts];
        if (allTerms.some((term) => txt.includes(term))) {
          STATE.selectedCandidateSkills.add(sk.id);
        }
      });
      renderCandidateSkillSelector();
      renderCandidateMatchResults();
    };
    parseResumeBtn.addEventListener("click", runResumeExtract);
    resumeInput.addEventListener("keydown", (e) => {
      if (e.key === "Enter") runResumeExtract();
    });

    document.getElementById("network-category-filter").addEventListener("change", (e) => {
      STATE.networkCategory = e.target.value;
      STATE.networkActiveNode = null;
      renderNetworkSection();
    });
    document.getElementById("reset-network-btn").addEventListener("click", () => {
      STATE.networkCategory = "ALL";
      STATE.networkActiveNode = null;
      document.getElementById("network-category-filter").value = "ALL";
      renderNetworkSection();
    });

    document.getElementById("catalog-skill-category").addEventListener("change", renderSkillsCatalog);
    document.getElementById("catalog-skill-sort").addEventListener("change", renderSkillsCatalog);

    document.getElementById("corridor-reset-btn").addEventListener("click", () => {
      STATE.selectedCorridorId = "south_metro_xai_desoto";
      renderCorridorsTab();
    });

    ["comp-filter-search", "comp-filter-status", "comp-filter-sector", "comp-filter-corridor", "comp-filter-skill", "comp-filter-sort"].forEach((id) => {
      const el = document.getElementById(id);
      el.addEventListener("input", renderCompaniesDirectory);
      el.addEventListener("change", renderCompaniesDirectory);
    });
    document.getElementById("comp-filter-reset").addEventListener("click", () => {
      document.getElementById("comp-filter-search").value = "";
      document.getElementById("comp-filter-status").value = "ALL";
      document.getElementById("comp-filter-sector").value = "ALL";
      document.getElementById("comp-filter-corridor").value = "ALL";
      document.getElementById("comp-filter-skill").value = "ALL";
      document.getElementById("comp-filter-sort").value = "local_tech";
      renderCompaniesDirectory();
    });

    document.getElementById("job-filter-search").addEventListener("input", (e) => {
      triggerWasmJobSearch(e.target.value);
    });
    ["job-filter-skill", "job-filter-class", "job-filter-workmode", "job-filter-corridor", "job-filter-salary", "job-filter-sort"].forEach((id) => {
      document.getElementById(id).addEventListener("change", renderJobsExplorer);
    });
    document.getElementById("job-filter-reset").addEventListener("click", () => {
      document.getElementById("job-filter-search").value = "";
      document.getElementById("job-filter-skill").value = "ALL";
      document.getElementById("job-filter-class").value = "ALL";
      document.getElementById("job-filter-workmode").value = "ALL";
      document.getElementById("job-filter-corridor").value = "ALL";
      document.getElementById("job-filter-salary").value = "ALL";
      document.getElementById("job-filter-sort").value = "default";
      STATE.wasmSearchJobIds = null;
      renderJobsExplorer();
    });

    document.getElementById("view-jobs-cards-btn").addEventListener("click", () => {
      STATE.jobViewMode = "cards";
      renderJobsExplorer();
    });
    document.getElementById("view-jobs-table-btn").addEventListener("click", () => {
      STATE.jobViewMode = "table";
      renderJobsExplorer();
    });
    document.getElementById("export-jobs-csv-btn").addEventListener("click", () => {
      const jobs = getFilteredJobs();
      exportCsv(
        "memphis_it_jobs_2026_filtered.csv",
        ["job_id", "company_name", "job_title", "role_classification", "seniority_level", "work_mode", "city", "state", "raw_compensation", "annual_mid_usd", "tech_stack_tags", "source_url"],
        jobs.map((j) => [j.job_id, j.company_name, j.job_title, j.role_classification, j.seniority_level, j.work_mode, j.city, j.state, j.raw_compensation, j.annual_mid_usd, j.tech_stack_tags, j.source_url])
      );
    });

    // SQL Workbench actions
    document.getElementById("run-sql-btn").addEventListener("click", () => {
      const sql = document.getElementById("sql-editor-textarea").value;
      executeSqlInWorkbench(sql, null);
    });
    document.getElementById("export-sql-csv-btn").addEventListener("click", () => {
      if (!STATE.lastSqlResult || !STATE.lastSqlResult.columns) return;
      exportCsv("memphis_sql_slice_2026.csv", STATE.lastSqlResult.columns, STATE.lastSqlResult.rows);
    });

    // 1-Click Table/View Inspector chips
    document.querySelectorAll(".sql-table-chip").forEach((btn) => {
      btn.addEventListener("click", () => {
        const tbl = btn.getAttribute("data-table");
        const sql =
          tbl === "sqlite_master"
            ? `SELECT type, name, tbl_name FROM sqlite_master WHERE type IN ('table', 'view') ORDER BY type, name;`
            : `SELECT * FROM ${tbl} LIMIT 50;`;
        document.getElementById("sql-active-title").textContent = `Inspecting ${tbl}`;
        document.getElementById("sql-active-desc").textContent = `Live query against ${tbl} in memphis_it_jobs_2026.db via SQLite WebAssembly.`;
        document.getElementById("sql-editor-textarea").value = sql;
        executeSqlInWorkbench(sql, null);
      });
    });

    document.getElementById("detail-modal-close").addEventListener("click", closeModal);
    document.getElementById("detail-modal-backdrop").addEventListener("click", (e) => {
      if (e.target.id === "detail-modal-backdrop") closeModal();
    });
    window.addEventListener("keydown", (e) => {
      if (e.key === "Escape") closeModal();
    });
  }

  document.addEventListener("DOMContentLoaded", initApp);
})();
