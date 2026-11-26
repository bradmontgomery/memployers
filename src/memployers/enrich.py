"""Add taxonomy-derived tables and views to the database, for the in-browser app to query.

Every run drops and recreates these objects, so enrichment can be re-run safely after a delta.
Skills are tagged for every job (closed postings keep their history), but company skill counts
and `v_skill_demand` only count active postings (`v_jobs_enriched.is_active = 1`).
"""

import json
import sqlite3
from collections import Counter

from memployers.taxonomy import Taxonomy

SCHEMA = """
DROP VIEW IF EXISTS v_company_skill_matrix;
DROP VIEW IF EXISTS v_skill_demand;
DROP TABLE IF EXISTS curated_sql_queries;
DROP TABLE IF EXISTS company_enrichment;
DROP TABLE IF EXISTS macro_sectors;
DROP TABLE IF EXISTS corridor_groups;
DROP TABLE IF EXISTS job_skill_map;
DROP TABLE IF EXISTS company_skill_map;
DROP TABLE IF EXISTS canonical_skills;
DROP TABLE IF EXISTS skill_categories;

CREATE TABLE skill_categories (
    category_name TEXT PRIMARY KEY,
    color TEXT NOT NULL,
    bg TEXT NOT NULL,
    icon TEXT NOT NULL,
    description TEXT NOT NULL
);

CREATE TABLE canonical_skills (
    skill_id TEXT PRIMARY KEY,
    skill_name TEXT NOT NULL,
    skill_category TEXT NOT NULL,
    category_color TEXT NOT NULL,
    category_bg TEXT NOT NULL,
    keywords_json TEXT NOT NULL
);

CREATE TABLE job_skill_map (
    job_id INTEGER NOT NULL,
    company_id INTEGER NOT NULL,
    skill_id TEXT NOT NULL,
    PRIMARY KEY (job_id, skill_id)
);

CREATE TABLE company_skill_map (
    company_id INTEGER NOT NULL,
    company_name TEXT NOT NULL,
    skill_id TEXT NOT NULL,
    source_type TEXT NOT NULL,
    job_count INTEGER DEFAULT 0,
    PRIMARY KEY (company_id, skill_id)
);

CREATE TABLE corridor_groups (
    corridor_id TEXT PRIMARY KEY,
    name TEXT NOT NULL,
    short_name TEXT NOT NULL,
    state TEXT NOT NULL,
    map_x INTEGER NOT NULL,
    map_y INTEGER NOT NULL,
    color TEXT NOT NULL,
    description TEXT NOT NULL
);

CREATE TABLE macro_sectors (
    sector_id TEXT PRIMARY KEY,
    name TEXT NOT NULL,
    color TEXT NOT NULL
);

CREATE TABLE company_enrichment (
    company_id INTEGER PRIMARY KEY,
    corridor_group_id TEXT NOT NULL,
    corridor_group_name TEXT NOT NULL,
    corridor_short_name TEXT NOT NULL,
    macro_sector_id TEXT NOT NULL,
    macro_sector_name TEXT NOT NULL,
    macro_sector_color TEXT NOT NULL
);

CREATE TABLE curated_sql_queries (
    query_id TEXT PRIMARY KEY,
    sort_order INTEGER NOT NULL,
    title TEXT NOT NULL,
    category TEXT NOT NULL,
    description TEXT NOT NULL,
    sql_text TEXT NOT NULL
);
"""

VIEWS = """
CREATE VIEW v_skill_demand AS
SELECT
    cs.skill_id,
    cs.skill_name,
    cs.skill_category,
    COUNT(DISTINCT jsm.job_id) AS verified_job_postings,
    COUNT(DISTINCT csm.company_id) AS hiring_companies_total,
    ROUND(AVG(jp.annual_mid_usd), 0) AS avg_midpoint_salary_usd,
    ROUND(MIN(jp.annual_min_usd), 0) AS min_salary_usd,
    ROUND(MAX(jp.annual_max_usd), 0) AS max_salary_usd,
    GROUP_CONCAT(DISTINCT csm.company_name) AS hiring_employers
FROM canonical_skills cs
LEFT JOIN job_skill_map jsm
       ON cs.skill_id = jsm.skill_id
      AND jsm.job_id IN (SELECT job_id FROM v_jobs_enriched WHERE is_active = 1)
LEFT JOIN job_postings jp ON jsm.job_id = jp.job_id
LEFT JOIN company_skill_map csm ON cs.skill_id = csm.skill_id
GROUP BY cs.skill_id
ORDER BY verified_job_postings DESC, hiring_companies_total DESC;

CREATE VIEW v_company_skill_matrix AS
SELECT
    c.company_id,
    c.company_name,
    c.sector,
    ce.macro_sector_name,
    ce.corridor_short_name,
    cs.skill_id,
    cs.skill_name,
    cs.skill_category,
    csm.source_type,
    csm.job_count
FROM company_skill_map csm
JOIN companies c ON csm.company_id = c.company_id
JOIN company_enrichment ce ON c.company_id = ce.company_id
JOIN canonical_skills cs ON csm.skill_id = cs.skill_id
ORDER BY c.local_tech_roles_est DESC, csm.job_count DESC;
"""

# Where a company's skill evidence came from, for the site's "stack intelligence" labels.
SOURCE_BOTH = "Both"
SOURCE_JOBS = "Job Posting"
SOURCE_NOTES = "Company Intelligence"


def skill_source_type(in_jobs: bool, in_notes: bool) -> str:
    if in_jobs and in_notes:
        return SOURCE_BOTH
    return SOURCE_JOBS if in_jobs else SOURCE_NOTES


def _insert_reference_tables(conn: sqlite3.Connection, tax: Taxonomy) -> None:
    conn.executemany(
        "INSERT INTO skill_categories VALUES (?, ?, ?, ?, ?)",
        [(c.name, c.color, c.bg, c.icon, c.description) for c in tax.categories],
    )
    conn.executemany(
        "INSERT INTO canonical_skills VALUES (?, ?, ?, ?, ?, ?)",
        [
            (
                s.id,
                s.name,
                s.category,
                tax.category(s.category).color,
                tax.category(s.category).bg,
                json.dumps(list(s.keywords)),
            )
            for s in tax.skills
        ],
    )
    conn.executemany(
        "INSERT INTO corridor_groups VALUES (?, ?, ?, ?, ?, ?, ?, ?)",
        [(c.id, c.name, c.short_name, c.state, c.map_x, c.map_y, c.color, c.description) for c in tax.corridors],
    )
    conn.executemany("INSERT INTO macro_sectors VALUES (?, ?, ?)", [(s.id, s.name, s.color) for s in tax.sectors])
    conn.executemany(
        "INSERT INTO curated_sql_queries VALUES (?, ?, ?, ?, ?, ?)",
        [(q.id, i, q.title, q.category, q.description, q.sql) for i, q in enumerate(tax.queries)],
    )


def _tag_jobs(conn: sqlite3.Connection, tax: Taxonomy) -> Counter[tuple[int, str]]:
    """Fill job_skill_map for every job; return active-job counts per (company_id, skill_id)."""
    active_counts: Counter[tuple[int, str]] = Counter()
    jobs = conn.execute("SELECT job_id, company_id, job_title, tech_stack_tags, is_active FROM v_jobs_enriched")
    for job in jobs.fetchall():
        for skill in tax.match_skills(f"{job['job_title']} , {job['tech_stack_tags'] or ''}"):
            conn.execute(
                "INSERT OR IGNORE INTO job_skill_map (job_id, company_id, skill_id) VALUES (?, ?, ?)",
                (job["job_id"], job["company_id"], skill.id),
            )
            if job["is_active"]:
                active_counts[(job["company_id"], skill.id)] += 1
    return active_counts


def _enrich_companies(conn: sqlite3.Connection, tax: Taxonomy, active_counts: Counter[tuple[int, str]]) -> None:
    """Fill company_enrichment (corridor + sector) and company_skill_map (skills from jobs and notes)."""
    companies = conn.execute("SELECT company_id, company_name, sector, sub_market_corridor, notes FROM companies")
    for c in companies.fetchall():
        cid = c["company_id"]
        corridor = tax.classify_corridor(c["sub_market_corridor"])
        sector = tax.classify_sector(c["sector"])
        conn.execute(
            "INSERT INTO company_enrichment VALUES (?, ?, ?, ?, ?, ?, ?)",
            (cid, corridor.id, corridor.name, corridor.short_name, sector.id, sector.name, sector.color),
        )
        note_skills = {s.id for s in tax.match_skills(f"{c['notes'] or ''} {c['sector'] or ''}")}
        job_skills = {sid for (comp_id, sid) in active_counts if comp_id == cid}
        for sid in note_skills | job_skills:
            conn.execute(
                "INSERT OR REPLACE INTO company_skill_map "
                "(company_id, company_name, skill_id, source_type, job_count) VALUES (?, ?, ?, ?, ?)",
                (
                    cid,
                    c["company_name"],
                    sid,
                    skill_source_type(sid in job_skills, sid in note_skills),
                    active_counts.get((cid, sid), 0),
                ),
            )


def enrich_database(conn: sqlite3.Connection, tax: Taxonomy) -> None:
    """(Re)create the skill, corridor, sector and curated-query tables and views."""
    conn.executescript(SCHEMA)
    _insert_reference_tables(conn, tax)
    _enrich_companies(conn, tax, _tag_jobs(conn, tax))
    conn.executescript(VIEWS)
    conn.commit()
    conn.execute("VACUUM")
    conn.execute("ANALYZE")
