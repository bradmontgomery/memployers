/**
 * Greater Memphis IT Employers & Skills Visualization Engine (charts.js)
 * Zero-dependency interactive SVG & HTML5 visualization suite.
 */

window.MemphisCharts = (function () {
  const fmtCurrency = (val) => {
    if (val === null || val === undefined || isNaN(val)) return "Unlisted";
    return "$" + Math.round(val).toLocaleString();
  };

  const fmtShortK = (val) => {
    if (val === null || val === undefined || isNaN(val)) return "N/A";
    return "$" + Math.round(val / 1000) + "K";
  };

  function showTooltip(evt, html) {
    const el = document.getElementById("chart-tooltip");
    if (!el) return;
    el.innerHTML = html;
    el.style.display = "block";
    const pad = 14;
    let x = evt.clientX + pad;
    let y = evt.clientY + pad;
    const rect = el.getBoundingClientRect();
    if (x + rect.width > window.innerWidth - 12) {
      x = evt.clientX - rect.width - pad;
    }
    if (y + rect.height > window.innerHeight - 12) {
      y = evt.clientY - rect.height - pad;
    }
    el.style.left = Math.max(8, x) + "px";
    el.style.top = Math.max(8, y) + "px";
  }

  function hideTooltip() {
    const el = document.getElementById("chart-tooltip");
    if (el) el.style.display = "none";
  }

  // ---------------------------------------------------------------------------
  // 1. INTERACTIVE BIPARTITE SKILL <-> EMPLOYER NETWORK / ALLUVIAL GRAPH
  // ---------------------------------------------------------------------------
  function renderSkillEmployerNetwork(container, data, options, callbacks) {
    if (!container) return;
    const categoryFilter = (options && options.category) || "ALL";
    const activeNode = (options && options.activeNode) || null; // { type: 'skill'|'company', id: ... }

    // Filter skills
    let skills = data.skills.filter((s) => s.job_count > 0);
    if (categoryFilter !== "ALL") {
      skills = skills.filter((s) => s.category === categoryFilter);
    }
    skills = skills.slice(0, 18);
    const skillIds = new Set(skills.map((s) => s.id));

    // Find top companies connected to these skills
    const compScores = new Map();
    data.companies.forEach((c) => {
      let weight = 0;
      c.skills.forEach((sk) => {
        if (skillIds.has(sk.id)) {
          weight += Math.max(1, sk.job_count);
        }
      });
      if (weight > 0) {
        compScores.set(c.company_name, { company: c, weight });
      }
    });

    const topCompanies = Array.from(compScores.values())
      .sort((a, b) => b.weight - a.weight || b.company.local_tech_roles_est - a.company.local_tech_roles_est)
      .slice(0, 18)
      .map((x) => x.company);

    const compNames = new Set(topCompanies.map((c) => c.company_name));

    // Build links between skills and topCompanies
    const links = [];
    skills.forEach((sk) => {
      sk.companies.forEach((c) => {
        if (compNames.has(c.company_name)) {
          links.push({
            skill_id: sk.id,
            skill_name: sk.name,
            color: sk.color,
            company_name: c.company_name,
            weight: Math.max(1, c.job_count),
            job_count: c.job_count
          });
        }
      });
    });

    const width = 980;
    const rowCount = Math.max(skills.length, topCompanies.length, 10);
    const height = Math.max(500, rowCount * 31 + 60);
    const leftX = 250;
    const rightX = width - 270;

    const skillStep = (height - 60) / Math.max(1, skills.length);
    const compStep = (height - 60) / Math.max(1, topCompanies.length);

    const skillPos = new Map();
    skills.forEach((sk, idx) => {
      skillPos.set(sk.id, {
        x: leftX,
        y: 35 + idx * skillStep + skillStep / 2,
        skill: sk
      });
    });

    const compPos = new Map();
    topCompanies.forEach((c, idx) => {
      compPos.set(c.company_name, {
        x: rightX,
        y: 35 + idx * compStep + compStep / 2,
        company: c
      });
    });

    let svgPaths = "";
    links.forEach((lnk, idx) => {
      const sp = skillPos.get(lnk.skill_id);
      const cp = compPos.get(lnk.company_name);
      if (!sp || !cp) return;

      let isHighlighted = true;
      if (activeNode) {
        if (activeNode.type === "skill") {
          isHighlighted = lnk.skill_id === activeNode.id;
        } else if (activeNode.type === "company") {
          isHighlighted = lnk.company_name === activeNode.id;
        }
      }

      const opacity = activeNode ? (isHighlighted ? 0.82 : 0.06) : 0.34;
      const strokeW = Math.min(8, 1.5 + lnk.weight * 1.4);
      const cX1 = sp.x + (cp.x - sp.x) * 0.42;
      const cX2 = sp.x + (cp.x - sp.x) * 0.58;
      const d = `M ${sp.x} ${sp.y} C ${cX1} ${sp.y}, ${cX2} ${cp.y}, ${cp.x} ${cp.y}`;

      svgPaths += `<path class="net-link" data-idx="${idx}" d="${d}" fill="none" stroke="${lnk.color}" stroke-width="${strokeW}" stroke-opacity="${opacity}" style="cursor:pointer; transition: stroke-opacity 0.2s;" />`;
    });

    let skillNodesSvg = "";
    skills.forEach((sk) => {
      const pos = skillPos.get(sk.id);
      const isSelected = activeNode && activeNode.type === "skill" && activeNode.id === sk.id;
      const isConnected =
        !activeNode ||
        isSelected ||
        (activeNode.type === "company" && links.some((l) => l.skill_id === sk.id && l.company_name === activeNode.id));
      const op = isConnected ? 1 : 0.28;
      const r = Math.min(11, 5 + Math.sqrt(sk.job_count) * 1.4);

      skillNodesSvg += `
        <g class="net-skill-node" data-id="${sk.id}" transform="translate(${pos.x}, ${pos.y})" style="cursor:pointer; opacity:${op};">
          <circle r="${isSelected ? r + 3 : r}" fill="${sk.color}" stroke="${isSelected ? '#fff' : 'rgba(255,255,255,0.25)'}" stroke-width="${isSelected ? 2.5 : 1}" />
          <text x="-16" y="4" text-anchor="end" fill="currentColor" font-size="12" font-weight="${isSelected ? '700' : '600'}">${sk.name}</text>
          <text x="14" y="4" text-anchor="start" fill="${sk.color}" font-size="10.5" font-weight="700">${sk.job_count}r / ${sk.total_company_count}c</text>
        </g>
      `;
    });

    let compNodesSvg = "";
    topCompanies.forEach((c) => {
      const pos = compPos.get(c.company_name);
      const isSelected = activeNode && activeNode.type === "company" && activeNode.id === c.company_name;
      const isConnected =
        !activeNode ||
        isSelected ||
        (activeNode.type === "skill" && links.some((l) => l.company_name === c.company_name && l.skill_id === activeNode.id));
      const op = isConnected ? 1 : 0.28;
      const r = Math.min(11, 5 + Math.sqrt(c.local_tech_roles_est || 1) * 1.1);
      const label = c.company_name.length > 30 ? c.company_name.slice(0, 28) + "…" : c.company_name;

      compNodesSvg += `
        <g class="net-comp-node" data-name="${c.company_name.replace(/"/g, '&quot;')}" transform="translate(${pos.x}, ${pos.y})" style="cursor:pointer; opacity:${op};">
          <circle r="${isSelected ? r + 3 : r}" fill="${c.macro_sector_color}" stroke="${isSelected ? '#fff' : 'rgba(255,255,255,0.25)'}" stroke-width="${isSelected ? 2.5 : 1}" />
          <text x="16" y="4" text-anchor="start" fill="currentColor" font-size="12" font-weight="${isSelected ? '700' : '600'}">${label}</text>
          <text x="-14" y="4" text-anchor="end" fill="var(--text-muted)" font-size="10.5" font-weight="600">${c.cataloged_jobs_count} roles</text>
        </g>
      `;
    });

    container.innerHTML = `
      <div class="svg-chart-container">
        <svg viewBox="0 0 ${width} ${height}" style="color: var(--text-primary); min-width: 720px;">
          <text x="${leftX - 16}" y="18" text-anchor="end" fill="var(--text-muted)" font-size="11" font-weight="700" letter-spacing="0.06em">TECHNICAL SKILLS (CLICK TO ISOLATE)</text>
          <text x="${rightX + 16}" y="18" text-anchor="start" fill="var(--text-muted)" font-size="11" font-weight="700" letter-spacing="0.06em">HIRING MEMPHIS EMPLOYERS (CLICK TO ISOLATE)</text>
          <g class="links-layer">${svgPaths}</g>
          <g class="skills-layer">${skillNodesSvg}</g>
          <g class="companies-layer">${compNodesSvg}</g>
        </svg>
      </div>
    `;

    // Bind events
    container.querySelectorAll(".net-skill-node").forEach((el) => {
      const sid = el.getAttribute("data-id");
      const sk = data.skills.find((s) => s.id === sid);
      el.addEventListener("mouseenter", (e) => {
        if (!sk) return;
        showTooltip(
          e,
          `<div style="font-weight:700;color:${sk.color};margin-bottom:3px;">${sk.name}</div>
           <div>Category: <b>${sk.category}</b></div>
           <div>Verified Postings: <b>${sk.job_count}</b> | Hiring Companies: <b>${sk.total_company_count}</b></div>
           <div>Avg Midpoint Salary: <b>${fmtCurrency(sk.avg_salary_usd)}</b></div>
           <div style="margin-top:4px;font-size:11px;color:#94a3b8;">Click to isolate employers hiring for this skill</div>`
        );
      });
      el.addEventListener("mouseleave", hideTooltip);
      el.addEventListener("click", () => {
        hideTooltip();
        if (callbacks && callbacks.onNodeClick) {
          callbacks.onNodeClick({ type: "skill", id: sid });
        }
      });
    });

    container.querySelectorAll(".net-comp-node").forEach((el) => {
      const cname = el.getAttribute("data-name");
      const comp = data.companies.find((c) => c.company_name === cname);
      el.addEventListener("mouseenter", (e) => {
        if (!comp) return;
        showTooltip(
          e,
          `<div style="font-weight:700;color:${comp.macro_sector_color};margin-bottom:3px;">${comp.company_name}</div>
           <div>Sector: <b>${comp.sector}</b></div>
           <div>Corridor: <b>${comp.sub_market_corridor}</b></div>
           <div>Verified IT Roles: <b>${comp.cataloged_jobs_count}</b> | Est. Local Tech: <b>${comp.local_tech_roles_est}</b></div>
           <div>Skills Identified: <b>${comp.skills.length}</b></div>
           <div style="margin-top:4px;font-size:11px;color:#94a3b8;">Click to isolate this employer's skill stack</div>`
        );
      });
      el.addEventListener("mouseleave", hideTooltip);
      el.addEventListener("click", () => {
        hideTooltip();
        if (callbacks && callbacks.onNodeClick) {
          callbacks.onNodeClick({ type: "company", id: cname });
        }
      });
    });

    container.querySelectorAll(".net-link").forEach((el) => {
      const idx = parseInt(el.getAttribute("data-idx"), 10);
      const lnk = links[idx];
      el.addEventListener("mouseenter", (e) => {
        showTooltip(
          e,
          `<div style="font-weight:700;color:${lnk.color};">${lnk.skill_name} ↔ ${lnk.company_name}</div>
           <div>${lnk.job_count > 0 ? `<b>${lnk.job_count}</b> verified job posting(s)` : "Identified in Company Tech Stack Intelligence"}</div>
           <div style="margin-top:4px;font-size:11px;color:#94a3b8;">Click to view matching roles</div>`
        );
      });
      el.addEventListener("mouseleave", hideTooltip);
      el.addEventListener("click", () => {
        hideTooltip();
        if (callbacks && callbacks.onLinkClick) {
          callbacks.onLinkClick(lnk.skill_id, lnk.company_name);
        }
      });
    });
  }

  // ---------------------------------------------------------------------------
  // 2. SKILL x TOP EMPLOYER HEATMAP MATRIX
  // ---------------------------------------------------------------------------
  function renderSkillEmployerHeatmap(container, data, callbacks) {
    if (!container) return;
    const topSkills = data.skills.filter((s) => s.job_count > 0).slice(0, 20);
    const topEmployers = data.companies
      .filter((c) => !c.is_watchlist_only && c.cataloged_jobs_count > 0)
      .sort((a, b) => b.cataloged_jobs_count - a.cataloged_jobs_count || b.local_tech_roles_est - a.local_tech_roles_est)
      .slice(0, 22);

    let thead = `<thead><tr><th style="position:sticky;left:0;z-index:4;background:var(--bg-secondary);text-align:left;min-width:215px;">Canonical Skill \\ Top Employer</th>`;
    topEmployers.forEach((emp) => {
      const shortEmp = emp.company_name.length > 22 ? emp.company_name.slice(0, 20) + "…" : emp.company_name;
      thead += `<th class="col-header" data-comp="${emp.company_name.replace(/"/g, '&quot;')}" style="cursor:pointer;" title="Click to inspect ${emp.company_name}">${shortEmp}</th>`;
    });
    thead += `</tr></thead>`;

    let tbody = `<tbody>`;
    topSkills.forEach((sk) => {
      tbody += `<tr>
        <td class="row-header" data-skill="${sk.id}" title="Click to filter by ${sk.name}">
          <span style="display:inline-block;width:8px;height:8px;border-radius:50%;background:${sk.color};margin-right:6px;"></span>
          ${sk.name}
          <span style="float:right;color:var(--text-muted);font-size:10.5px;margin-left:6px;">${sk.job_count}</span>
        </td>`;

      topEmployers.forEach((emp) => {
        const match = emp.skills.find((s) => s.id === sk.id);
        const jCount = match ? match.job_count : 0;
        const fromNotes = match && match.from_notes && jCount === 0;

        let bg = "transparent";
        let text = "";
        let textColor = "var(--text-primary)";

        if (jCount > 0) {
          const alpha = Math.min(0.92, 0.25 + jCount * 0.22);
          bg = hexToRgba(sk.color, alpha);
          text = String(jCount);
          textColor = "#ffffff";
        } else if (fromNotes) {
          bg = hexToRgba(sk.color, 0.14);
          text = "•";
          textColor = sk.color;
        }

        tbody += `<td class="hm-cell" data-skill="${sk.id}" data-comp="${emp.company_name.replace(/"/g, '&quot;')}" data-count="${jCount}" data-notes="${fromNotes ? '1' : '0'}" style="background:${bg};color:${textColor};">${text}</td>`;
      });
      tbody += `</tr>`;
    });
    tbody += `</tbody>`;

    container.innerHTML = `<div class="heatmap-wrapper"><table class="heatmap-table">${thead}${tbody}</table></div>`;

    container.querySelectorAll(".hm-cell").forEach((cell) => {
      const sid = cell.getAttribute("data-skill");
      const cname = cell.getAttribute("data-comp");
      const cnt = parseInt(cell.getAttribute("data-count"), 10);
      const notes = cell.getAttribute("data-notes") === "1";
      const sk = data.skills.find((s) => s.id === sid);

      cell.addEventListener("mouseenter", (e) => {
        if (cnt === 0 && !notes) return;
        showTooltip(
          e,
          `<div style="font-weight:700;color:${sk.color};">${cname}</div>
           <div>Skill: <b>${sk.name}</b></div>
           <div>${cnt > 0 ? `<b>${cnt}</b> verified 2026 job posting(s)` : "Cited in Company Tech Stack Intelligence"}</div>
           <div style="margin-top:4px;font-size:11px;color:#94a3b8;">Click to inspect company & roles</div>`
        );
      });
      cell.addEventListener("mouseleave", hideTooltip);
      cell.addEventListener("click", () => {
        hideTooltip();
        if ((cnt > 0 || notes) && callbacks && callbacks.onCellClick) {
          callbacks.onCellClick(sid, cname);
        }
      });
    });

    container.querySelectorAll("td.row-header").forEach((el) => {
      el.addEventListener("click", () => {
        const sid = el.getAttribute("data-skill");
        if (callbacks && callbacks.onSkillClick) callbacks.onSkillClick(sid);
      });
    });

    container.querySelectorAll("th.col-header").forEach((el) => {
      el.addEventListener("click", () => {
        const cname = el.getAttribute("data-comp");
        if (callbacks && callbacks.onCompanyClick) callbacks.onCompanyClick(cname);
      });
    });
  }

  // ---------------------------------------------------------------------------
  // 3. SKILL DEMAND vs. COMPENSATION BUBBLE PLOT
  // ---------------------------------------------------------------------------
  function renderSkillBubblePlot(container, data, callbacks) {
    if (!container) return;
    const skillsWithPay = data.skills.filter((s) => s.avg_salary_usd && s.job_count > 0);
    const width = 820;
    const height = 430;
    const pad = { top: 30, right: 40, bottom: 52, left: 72 };
    const plotW = width - pad.left - pad.right;
    const plotH = height - pad.top - pad.bottom;

    const maxComp = Math.max(18, ...skillsWithPay.map((s) => s.total_company_count)) + 1;
    const minSal = 50000;
    const maxSal = 190000;

    const xScale = (val) => pad.left + (val / maxComp) * plotW;
    const yScale = (val) => pad.top + plotH - ((val - minSal) / (maxSal - minSal)) * plotH;

    const medSalY = yScale(data.kpis.median_salary_usd || 115000);
    const midCompX = xScale(8);

    let gridSvg = "";
    for (let s = 60000; s <= 180000; s += 30000) {
      const y = yScale(s);
      gridSvg += `
        <line x1="${pad.left}" y1="${y}" x2="${width - pad.right}" y2="${y}" stroke="var(--border-color)" stroke-dasharray="3,3" />
        <text x="${pad.left - 10}" y="${y + 4}" text-anchor="end" fill="var(--text-muted)" font-size="11">${fmtShortK(s)}</text>
      `;
    }

    for (let c = 2; c <= maxComp; c += 3) {
      const x = xScale(c);
      gridSvg += `
        <line x1="${x}" y1="${pad.top}" x2="${x}" y2="${height - pad.bottom}" stroke="var(--border-color)" stroke-dasharray="3,3" />
        <text x="${x}" y="${height - pad.bottom + 18}" text-anchor="middle" fill="var(--text-muted)" font-size="11">${c}</text>
      `;
    }

    // Quadrant reference lines
    gridSvg += `
      <line x1="${pad.left}" y1="${medSalY}" x2="${width - pad.right}" y2="${medSalY}" stroke="#10b981" stroke-width="1.2" stroke-dasharray="5,4" opacity="0.65" />
      <text x="${width - pad.right - 6}" y="${medSalY - 6}" text-anchor="end" fill="#10b981" font-size="10.5" font-weight="600">Market Median (${fmtShortK(data.kpis.median_salary_usd)})</text>
      <line x1="${midCompX}" y1="${pad.top}" x2="${midCompX}" y2="${height - pad.bottom}" stroke="#6366f1" stroke-width="1.2" stroke-dasharray="5,4" opacity="0.5" />
      <text x="${pad.left + 10}" y="${pad.top + 16}" fill="var(--text-muted)" font-size="10.5" font-weight="600">HIGH-PAY SPECIALIZED</text>
      <text x="${width - pad.right - 10}" y="${pad.top + 16}" text-anchor="end" fill="var(--text-muted)" font-size="10.5" font-weight="600">HIGH-PAY &amp; BROAD EMPLOYER DEMAND</text>
    `;

    let bubblesSvg = "";
    skillsWithPay.forEach((sk) => {
      const cx = xScale(sk.total_company_count);
      const cy = yScale(Math.min(maxSal, Math.max(minSal, sk.avg_salary_usd)));
      const r = Math.max(7, Math.min(22, 5 + sk.job_count * 1.05));
      const shortName = sk.name.split(",")[0].split("&")[0].trim();

      bubblesSvg += `
        <g class="skill-bubble" data-id="${sk.id}" transform="translate(${cx}, ${cy})" style="cursor:pointer;">
          <circle r="${r}" fill="${sk.color}" fill-opacity="0.72" stroke="${sk.color}" stroke-width="2" />
          <text y="${-r - 4}" text-anchor="middle" fill="currentColor" font-size="10.5" font-weight="600">${shortName}</text>
        </g>
      `;
    });

    container.innerHTML = `
      <div class="svg-chart-container">
        <svg viewBox="0 0 ${width} ${height}" style="color: var(--text-primary);">
          ${gridSvg}
          <text x="${pad.left + plotW / 2}" y="${height - 10}" text-anchor="middle" fill="var(--text-secondary)" font-size="12" font-weight="600">Number of Memphis Employers Hiring for Skill →</text>
          <text transform="translate(18, ${pad.top + plotH / 2}) rotate(-90)" text-anchor="middle" fill="var(--text-secondary)" font-size="12" font-weight="600">Avg Advertised Midpoint Salary ($USD) →</text>
          ${bubblesSvg}
        </svg>
      </div>
    `;

    container.querySelectorAll(".skill-bubble").forEach((el) => {
      const sid = el.getAttribute("data-id");
      const sk = data.skills.find((s) => s.id === sid);
      el.addEventListener("mouseenter", (e) => {
        showTooltip(
          e,
          `<div style="font-weight:700;color:${sk.color};">${sk.name}</div>
           <div>Category: <b>${sk.category}</b></div>
           <div>Avg Midpoint Salary: <b>${fmtCurrency(sk.avg_salary_usd)}</b> (${fmtShortK(sk.min_salary_usd)} – ${fmtShortK(sk.max_salary_usd)})</div>
           <div>Hiring Companies: <b>${sk.total_company_count}</b> | Verified Postings: <b>${sk.job_count}</b></div>
           <div style="margin-top:4px;font-size:11px;color:#94a3b8;">Click to filter jobs by this skill</div>`
        );
      });
      el.addEventListener("mouseleave", hideTooltip);
      el.addEventListener("click", () => {
        hideTooltip();
        if (callbacks && callbacks.onSkillClick) callbacks.onSkillClick(sid);
      });
    });
  }

  // ---------------------------------------------------------------------------
  // 4. ROLE CLASSIFICATION SALARY BAND & INDIVIDUAL POSTINGS STRIP PLOT
  // ---------------------------------------------------------------------------
  function renderClassificationRangeChart(container, data, callbacks) {
    if (!container) return;
    const rows = data.views.salary_by_classification;
    const width = 780;
    const height = 340;
    const pad = { top: 28, right: 35, bottom: 42, left: 195 };
    const plotW = width - pad.left - pad.right;
    const plotH = height - pad.top - pad.bottom;

    const maxSal = 320000;
    const xScale = (v) => pad.left + (v / maxSal) * plotW;
    const rowH = plotH / rows.length;

    const colors = {
      "Technical Leadership": "#a855f7",
      "DevOps / Cloud / SRE": "#06b6d4",
      "Software Development": "#6366f1",
      "Architecture / Data / AI": "#ec4899",
      "Traditional IT": "#10b981",
      "Tech Support": "#f59e0b"
    };

    let svg = "";
    for (let s = 50000; s <= 300000; s += 50000) {
      const x = xScale(s);
      svg += `
        <line x1="${x}" y1="${pad.top}" x2="${x}" y2="${height - pad.bottom}" stroke="var(--border-color)" stroke-dasharray="3,3" />
        <text x="${x}" y="${height - pad.bottom + 18}" text-anchor="middle" fill="var(--text-muted)" font-size="11">${fmtShortK(s)}</text>
      `;
    }

    rows.forEach((r, idx) => {
      const cy = pad.top + idx * rowH + rowH / 2;
      const color = colors[r.role_classification] || "#6366f1";
      const xMin = xScale(r.lowest_advertised_usd);
      const xAvg = xScale(r.avg_midpoint_usd);
      const xMax = xScale(r.highest_advertised_usd);

      svg += `
        <line x1="${pad.left}" y1="${cy}" x2="${width - pad.right}" y2="${cy}" stroke="var(--border-color)" stroke-opacity="0.35" />
        <text x="${pad.left - 12}" y="${cy - 2}" text-anchor="end" fill="currentColor" font-size="12" font-weight="700">${r.role_classification}</text>
        <text x="${pad.left - 12}" y="${cy + 13}" text-anchor="end" fill="var(--text-muted)" font-size="10.5">${r.total_postings} roles (${r.pct_of_total_jobs}%)</text>
        <rect x="${xMin}" y="${cy - 5}" width="${Math.max(4, xMax - xMin)}" height="10" rx="5" fill="${color}" fill-opacity="0.25" stroke="${color}" stroke-width="1.5" />
      `;

      // Individual jobs with salary in this classification
      const classJobs = data.jobs.filter(
        (j) => j.role_classification === r.role_classification && j.annual_mid_usd !== null
      );
      classJobs.forEach((j) => {
        const jx = xScale(j.annual_mid_usd);
        svg += `<circle class="class-job-dot" data-job="${j.job_id}" cx="${jx}" cy="${cy}" r="5" fill="${color}" stroke="#fff" stroke-width="1.2" style="cursor:pointer;" />`;
      });

      // Avg marker diamond
      svg += `
        <circle cx="${xAvg}" cy="${cy}" r="7.5" fill="#fff" stroke="${color}" stroke-width="3" />
        <text x="${xAvg}" y="${cy - 11}" text-anchor="middle" fill="${color}" font-size="10.5" font-weight="700">Avg ${fmtShortK(r.avg_midpoint_usd)}</text>
      `;
    });

    container.innerHTML = `
      <div class="svg-chart-container">
        <svg viewBox="0 0 ${width} ${height}" style="color: var(--text-primary);">
          ${svg}
        </svg>
      </div>
    `;

    container.querySelectorAll(".class-job-dot").forEach((el) => {
      const jid = parseInt(el.getAttribute("data-job"), 10);
      const job = data.jobs.find((j) => j.job_id === jid);
      el.addEventListener("mouseenter", (e) => {
        if (!job) return;
        showTooltip(
          e,
          `<div style="font-weight:700;color:#38bdf8;">${job.job_title}</div>
           <div>Employer: <b>${job.company_name}</b> (${job.work_mode})</div>
           <div>Advertised Pay: <b>${job.raw_compensation}</b> (Mid: ${fmtCurrency(job.annual_mid_usd)})</div>
           <div style="margin-top:3px;font-size:11px;color:#cbd5e1;">Skills: ${job.tech_stack_tags}</div>`
        );
      });
      el.addEventListener("mouseleave", hideTooltip);
      el.addEventListener("click", () => {
        hideTooltip();
        if (callbacks && callbacks.onJobClick) callbacks.onJobClick(job);
      });
    });
  }

  // ---------------------------------------------------------------------------
  // 5. 2026 MEMPHIS SALARY BENCHMARKS CHART
  // ---------------------------------------------------------------------------
  function renderBenchmarkComparisonChart(container, data) {
    if (!container) return;
    const bms = data.benchmarks;
    const width = 780;
    const rowH = 28;
    const pad = { top: 26, right: 35, bottom: 38, left: 245 };
    const height = pad.top + pad.bottom + bms.length * rowH;
    const plotW = width - pad.left - pad.right;
    const maxSal = 320000;
    const xScale = (v) => pad.left + (v / maxSal) * plotW;

    const tierColors = {
      "Executive / Leadership": "#a855f7",
      "AI, Architecture & Cloud": "#06b6d4",
      "Core Traditional IT": "#10b981"
    };

    let svg = "";
    for (let s = 50000; s <= 300000; s += 50000) {
      const x = xScale(s);
      svg += `
        <line x1="${x}" y1="${pad.top}" x2="${x}" y2="${height - pad.bottom}" stroke="var(--border-color)" stroke-dasharray="3,3" />
        <text x="${x}" y="${height - pad.bottom + 18}" text-anchor="middle" fill="var(--text-muted)" font-size="11">${fmtShortK(s)}</text>
      `;
    }

    bms.forEach((b, idx) => {
      const cy = pad.top + idx * rowH + rowH / 2;
      const col = tierColors[b.tier_category] || "#6366f1";
      const xLow = xScale(b.low_usd);
      const xMid = xScale(b.mid_usd);
      const xHigh = xScale(b.high_usd);

      svg += `
        <g class="bm-row" data-idx="${idx}" style="cursor:pointer;">
          <text x="${pad.left - 10}" y="${cy + 4}" text-anchor="end" fill="currentColor" font-size="11.5" font-weight="600">${b.role_title}</text>
          <line x1="${xLow}" y1="${cy}" x2="${xHigh}" y2="${cy}" stroke="${col}" stroke-width="4" stroke-linecap="round" opacity="0.45" />
          <circle cx="${xLow}" cy="${cy}" r="4" fill="${col}" />
          <circle cx="${xMid}" cy="${cy}" r="6" fill="#fff" stroke="${col}" stroke-width="2.5" />
          <circle cx="${xHigh}" cy="${cy}" r="4" fill="${col}" />
          <text x="${xHigh + 8}" y="${cy + 4}" fill="var(--text-muted)" font-size="10.5" font-family="monospace">${fmtShortK(b.mid_usd)}</text>
        </g>
      `;
    });

    container.innerHTML = `
      <div class="svg-chart-container">
        <svg viewBox="0 0 ${width} ${height}" style="color: var(--text-primary);">
          ${svg}
        </svg>
      </div>
    `;

    container.querySelectorAll(".bm-row").forEach((el) => {
      const b = bms[parseInt(el.getAttribute("data-idx"), 10)];
      el.addEventListener("mouseenter", (e) => {
        showTooltip(
          e,
          `<div style="font-weight:700;color:#38bdf8;">${b.role_title}</div>
           <div>Tier: <b>${b.tier_category}</b></div>
           <div>25th Pct (Low): <b>${fmtCurrency(b.low_usd)}</b></div>
           <div>50th Pct (Midpoint): <b>${fmtCurrency(b.mid_usd)}</b></div>
           <div>75th+ Pct (High): <b>${fmtCurrency(b.high_usd)}</b></div>
           <div style="margin-top:3px;font-size:11px;color:#94a3b8;">Source: ${b.benchmark_source}</div>`
        );
      });
      el.addEventListener("mouseleave", hideTooltip);
    });
  }

  // ---------------------------------------------------------------------------
  // 6. GREATER MEMPHIS TRI-STATE TECH CORRIDOR INTERACTIVE MAP
  // ---------------------------------------------------------------------------
  function renderMemphisCorridorMap(container, data, selectedCorridorId, callbacks) {
    if (!container) return;
    const width = 800;
    const height = 470;

    let nodesSvg = "";
    data.corridors.forEach((cg) => {
      const isSelected = selectedCorridorId === cg.id;
      const r = Math.max(18, Math.min(36, 12 + Math.sqrt(cg.local_tech_roles_est || cg.job_count) * 3.4));
      nodesSvg += `
        <g class="corridor-map-node" data-id="${cg.id}" transform="translate(${cg.map_x}, ${cg.map_y})" style="cursor:pointer;">
          <circle r="${r + 7}" fill="${cg.color}" fill-opacity="${isSelected ? '0.32' : '0.12'}" stroke="${isSelected ? '#fff' : cg.color}" stroke-width="${isSelected ? 2 : 1}" stroke-dasharray="${isSelected ? 'none' : '3,3'}" />
          <circle r="${r}" fill="${cg.color}" fill-opacity="0.88" stroke="#fff" stroke-width="${isSelected ? 3 : 1.5}" />
          <text y="-2" text-anchor="middle" fill="#fff" font-size="12" font-weight="800">${cg.job_count}</text>
          <text y="10" text-anchor="middle" fill="rgba(255,255,255,0.9)" font-size="9" font-weight="600">roles</text>
          <rect x="${-cg.short_name.length * 3.6 - 8}" y="${r + 6}" width="${cg.short_name.length * 7.2 + 16}" height="20" rx="5" fill="rgba(15,23,42,0.88)" stroke="${cg.color}" stroke-width="1" />
          <text y="${r + 19}" text-anchor="middle" fill="#f8fafc" font-size="10.5" font-weight="700">${cg.short_name}</text>
        </g>
      `;
    });

    container.innerHTML = `
      <div class="svg-chart-container">
        <svg viewBox="0 0 ${width} ${height}" style="background: radial-gradient(circle at 48% 50%, rgba(30,41,59,0.55), rgba(11,15,25,0.92)); border-radius: 12px; border: 1px solid var(--border-color);">
          <!-- State Boundaries & Labels -->
          <text x="55" y="135" fill="rgba(148,163,184,0.35)" font-size="16" font-weight="800" letter-spacing="0.14em">ARKANSAS</text>
          <text x="565" y="85" fill="rgba(148,163,184,0.35)" font-size="16" font-weight="800" letter-spacing="0.14em">TENNESSEE (SHELBY CO.)</text>
          <text x="520" y="445" fill="rgba(148,163,184,0.35)" font-size="16" font-weight="800" letter-spacing="0.14em">MISSISSIPPI (DESOTO / MARSHALL CO.)</text>

          <!-- TN / MS State Line -->
          <line x1="225" y1="358" x2="780" y2="358" stroke="rgba(148,163,184,0.35)" stroke-width="2" stroke-dasharray="8,6" />
          <text x="770" y="350" text-anchor="end" fill="rgba(148,163,184,0.5)" font-size="10" font-weight="600">TN / MS STATE LINE</text>

          <!-- Mississippi River -->
          <path d="M 310 15 C 285 85, 255 150, 235 225 C 215 295, 228 360, 195 460" fill="none" stroke="rgba(6, 182, 212, 0.35)" stroke-width="18" stroke-linecap="round" />
          <path d="M 310 15 C 285 85, 255 150, 235 225 C 215 295, 228 360, 195 460" fill="none" stroke="#06b6d4" stroke-width="3" stroke-opacity="0.65" />
          <text transform="translate(222, 145) rotate(-72)" fill="#22d3ee" font-size="10.5" font-weight="700" opacity="0.8">MISSISSIPPI RIVER</text>

          <!-- Major Interstate Corridors (I-40, I-55, I-240, TN-385, US-51) -->
          <!-- I-40 West to East (BlueOval) -->
          <path d="M 40 215 L 265 245 L 365 235 L 580 190 L 765 135" fill="none" stroke="rgba(248,250,252,0.16)" stroke-width="4" />
          <text x="735" y="128" fill="rgba(248,250,252,0.45)" font-size="10" font-weight="700">I-40 EAST → BLUEOVAL CITY</text>

          <!-- I-240 Loop & Poplar / TN-385 -->
          <ellipse cx="430" cy="265" rx="115" ry="62" fill="none" stroke="rgba(248,250,252,0.15)" stroke-width="3.5" />
          <path d="M 495 265 L 665 335" fill="none" stroke="rgba(248,250,252,0.18)" stroke-width="3.5" />
          <text x="615" y="295" fill="rgba(248,250,252,0.45)" font-size="10" font-weight="700">TN-385 / POPLAR</text>

          <!-- I-55 / US-51 North-South -->
          <path d="M 420 55 L 360 240 L 355 325 L 395 435" fill="none" stroke="rgba(248,250,252,0.16)" stroke-width="3.5" />

          <!-- Corridor Nodes -->
          ${nodesSvg}
        </svg>
      </div>
    `;

    container.querySelectorAll(".corridor-map-node").forEach((el) => {
      const cid = el.getAttribute("data-id");
      const cg = data.corridors.find((c) => c.id === cid);
      el.addEventListener("mouseenter", (e) => {
        showTooltip(
          e,
          `<div style="font-weight:700;color:${cg.color};">${cg.name}</div>
           <div>Employers: <b>${cg.company_count}</b> | Verified IT Roles: <b>${cg.job_count}</b></div>
           <div>Est. Local Tech Roles: <b>${cg.local_tech_roles_est}</b> | Avg Pay: <b>${fmtCurrency(cg.avg_salary_usd)}</b></div>
           <div>Work Modes: <b>${cg.work_modes["On-site"]}</b> On-site, <b>${cg.work_modes["Hybrid"]}</b> Hybrid, <b>${cg.work_modes["Remote"]}</b> Remote</div>
           <div style="margin-top:4px;font-size:11px;color:#94a3b8;">Click to inspect corridor employers & skills</div>`
        );
      });
      el.addEventListener("mouseleave", hideTooltip);
      el.addEventListener("click", () => {
        hideTooltip();
        if (callbacks && callbacks.onCorridorSelect) {
          callbacks.onCorridorSelect(cid);
        }
      });
    });
  }

  function hexToRgba(hex, alpha) {
    const clean = hex.replace("#", "");
    const r = parseInt(clean.substring(0, 2), 16) || 99;
    const g = parseInt(clean.substring(2, 4), 16) || 102;
    const b = parseInt(clean.substring(4, 6), 16) || 241;
    return `rgba(${r}, ${g}, ${b}, ${alpha})`;
  }

  return {
    fmtCurrency,
    fmtShortK,
    showTooltip,
    hideTooltip,
    renderSkillEmployerNetwork,
    renderSkillEmployerHeatmap,
    renderSkillBubblePlot,
    renderClassificationRangeChart,
    renderBenchmarkComparisonChart,
    renderMemphisCorridorMap
  };
})();
