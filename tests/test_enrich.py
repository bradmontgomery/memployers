import sqlite3
from typing import Any

import pytest

from memployers.database import connect
from memployers.enrich import SOURCE_BOTH, SOURCE_JOBS, SOURCE_NOTES, enrich_database, skill_source_type
from memployers.paths import Paths
from memployers.taxonomy import Taxonomy


@pytest.fixture
def conn(built_site: Paths):
    c = connect(built_site.db)
    yield c
    c.close()


def _scalar(conn: sqlite3.Connection, sql: str, *params: object) -> Any:
    return conn.execute(sql, params).fetchone()[0]


@pytest.mark.parametrize(
    ("in_jobs", "in_notes", "expected"),
    [(True, True, SOURCE_BOTH), (True, False, SOURCE_JOBS), (False, True, SOURCE_NOTES)],
)
def test_skill_source_type(in_jobs: bool, in_notes: bool, expected: str):
    assert skill_source_type(in_jobs, in_notes) == expected


def test_reference_tables_mirror_the_taxonomy(conn: sqlite3.Connection, tax: Taxonomy):
    assert _scalar(conn, "SELECT COUNT(*) FROM skill_categories") == len(tax.categories)
    assert _scalar(conn, "SELECT COUNT(*) FROM canonical_skills") == len(tax.skills)
    assert _scalar(conn, "SELECT COUNT(*) FROM corridor_groups") == len(tax.corridors)
    assert _scalar(conn, "SELECT COUNT(*) FROM macro_sectors") == len(tax.sectors)
    order = [r[0] for r in conn.execute("SELECT query_id FROM curated_sql_queries ORDER BY sort_order")]
    assert order == [q.id for q in tax.queries]


def test_every_active_job_is_tagged(conn: sqlite3.Connection):
    untagged = _scalar(
        conn,
        "SELECT COUNT(*) FROM v_jobs_enriched WHERE is_active = 1 AND job_id NOT IN (SELECT job_id FROM job_skill_map)",
    )
    assert untagged == 0


def test_job_tags_match_the_taxonomy(conn: sqlite3.Connection, tax: Taxonomy):
    row = conn.execute("SELECT job_id, job_title, tech_stack_tags FROM job_postings ORDER BY job_id LIMIT 1").fetchone()
    stored = {r[0] for r in conn.execute("SELECT skill_id FROM job_skill_map WHERE job_id = ?", (row["job_id"],))}
    assert stored == {s.id for s in tax.match_skills(f"{row['job_title']} , {row['tech_stack_tags']}")}


def test_closed_jobs_are_tagged_but_not_counted(conn: sqlite3.Connection):
    closed = conn.execute("SELECT job_id, company_id FROM v_jobs_enriched WHERE is_active = 0").fetchall()
    assert closed, "fixture data should include closed postings"
    for job in closed:
        assert _scalar(conn, "SELECT COUNT(*) FROM job_skill_map WHERE job_id = ?", job["job_id"]) > 0
    # company job_count only counts active postings
    mismatches = conn.execute(
        """SELECT csm.company_id, csm.skill_id, csm.job_count,
                  (SELECT COUNT(*) FROM job_skill_map jsm
                   JOIN v_jobs_enriched j ON j.job_id = jsm.job_id AND j.is_active = 1
                   WHERE jsm.company_id = csm.company_id AND jsm.skill_id = csm.skill_id) AS active
           FROM company_skill_map csm WHERE csm.job_count != active"""
    ).fetchall()
    assert mismatches == []


def test_skill_demand_counts_only_active_jobs(conn: sqlite3.Connection):
    total = _scalar(conn, "SELECT SUM(verified_job_postings) FROM v_skill_demand")
    active_tags = _scalar(
        conn,
        "SELECT COUNT(*) FROM job_skill_map WHERE job_id IN (SELECT job_id FROM v_jobs_enriched WHERE is_active = 1)",
    )
    assert total == active_tags


def test_every_company_is_classified(conn: sqlite3.Connection):
    assert _scalar(conn, "SELECT COUNT(*) FROM company_enrichment") == _scalar(conn, "SELECT COUNT(*) FROM companies")


def test_company_skill_sources_are_labelled(conn: sqlite3.Connection):
    labels = {r[0] for r in conn.execute("SELECT DISTINCT source_type FROM company_skill_map")}
    assert labels == {SOURCE_BOTH, SOURCE_JOBS, SOURCE_NOTES}
    # Skills found only in notes have no job count.
    assert _scalar(conn, "SELECT MAX(job_count) FROM company_skill_map WHERE source_type = ?", SOURCE_NOTES) == 0


def test_enrich_is_repeatable(site: Paths, tax: Taxonomy):
    conn = connect(site.db)
    try:
        before = conn.execute("SELECT * FROM job_skill_map ORDER BY job_id, skill_id").fetchall()
        enrich_database(conn, tax)
        after = conn.execute("SELECT * FROM job_skill_map ORDER BY job_id, skill_id").fetchall()
    finally:
        conn.close()
    assert [tuple(r) for r in before] == [tuple(r) for r in after]
