import pytest

from memployers.database import connect
from memployers.paths import Paths
from memployers.taxonomy import Taxonomy
from memployers.verify import BuildSummary, VerificationError, verify_build


def _exec(paths: Paths, sql: str) -> None:
    conn = connect(paths.db)
    try:
        conn.executescript(sql)
    finally:
        conn.close()


def _resync_docs(paths: Paths) -> None:
    paths.docs_db.write_bytes(paths.db.read_bytes())


def test_verify_passes_on_a_good_build(built_site: Paths, tax: Taxonomy):
    summary = verify_build(built_site, tax)
    assert summary.companies > 0 and summary.active_jobs > 0
    assert summary.skills == len(tax.skills)
    assert summary.queries == len(tax.queries)
    assert f"{summary.active_jobs} active jobs" in str(summary)


def test_summary_text():
    text = str(BuildSummary(companies=2, active_jobs=3, skills=4, queries=5, db_bytes=1234))
    assert (
        text == "✓ Verified SQLite DB (1,234 bytes): 2 companies, 3 active jobs, 4 skills, and 5 SQL slices in docs/."
    )


def test_verify_reports_missing_site_files(site: Paths, tax: Taxonomy):
    (site.docs_dir / "app.js").unlink()
    with pytest.raises(VerificationError, match=r"Missing or empty build artifact: .*app\.js"):
        verify_build(site, tax)


def test_verify_reports_stale_docs_database(site: Paths, tax: Taxonomy):
    _exec(site, "UPDATE companies SET notes = 'changed' WHERE company_id = 1;")
    with pytest.raises(VerificationError, match="docs/ database is stale"):
        verify_build(site, tax)


def test_verify_names_untagged_active_jobs(site: Paths, tax: Taxonomy):
    _exec(
        site, "DELETE FROM job_skill_map WHERE job_id = (SELECT MIN(job_id) FROM v_jobs_enriched WHERE is_active = 1);"
    )
    _resync_docs(site)
    with pytest.raises(VerificationError, match=r"Active job \d+ \(.+\) matches no canonical skill"):
        verify_build(site, tax)


def test_verify_reports_every_problem_at_once(site: Paths, tax: Taxonomy):
    _exec(
        site,
        "DELETE FROM canonical_skills WHERE skill_id = 'python';"
        "DROP VIEW v_skill_demand;"
        "CREATE VIEW v_skill_demand AS SELECT skill_name, skill_category, 0 AS verified_job_postings,"
        " 0 AS hiring_companies_total, NULL AS avg_midpoint_salary_usd, NULL AS hiring_employers"
        " FROM canonical_skills WHERE 0;",
    )
    _resync_docs(site)
    with pytest.raises(VerificationError) as excinfo:
        verify_build(site, tax)
    problems = excinfo.value.problems
    assert any("canonical_skills has" in p for p in problems)
    assert any("'skill_demand_matrix' returned no rows" in p for p in problems)


def test_verify_reports_failing_curated_query(site: Paths, tax: Taxonomy):
    _exec(site, "DROP VIEW v_company_leaderboard;")
    _resync_docs(site)
    with pytest.raises(VerificationError, match="'company_leaderboard' failed: no such table: v_company_leaderboard"):
        verify_build(site, tax)


def test_verify_reports_empty_database(site: Paths, tax: Taxonomy):
    _exec(site, "PRAGMA foreign_keys = OFF; DELETE FROM job_postings; DELETE FROM companies;")
    _resync_docs(site)
    with pytest.raises(VerificationError) as excinfo:
        verify_build(site, tax)
    assert "Database has no companies" in excinfo.value.problems
    assert "Database has no active jobs" in excinfo.value.problems


def test_verify_explains_unenriched_database(source_tree: Paths, tax: Taxonomy):
    from memployers.database import build_db

    build_db(source_tree)
    _resync_docs(source_tree)
    with pytest.raises(VerificationError, match=r"missing expected tables or views .*run enrich"):
        verify_build(source_tree, tax)
