import sqlite3

import pytest

from memployers.database import (
    BuildError,
    apply_delta,
    build_db,
    connect,
    execute_safe_sql,
    integrity_problems,
)
from memployers.paths import Paths


def _count(paths: Paths, sql: str) -> int:
    conn = connect(paths.db)
    try:
        return conn.execute(sql).fetchone()[0]
    finally:
        conn.close()


# ---------------------------------------------------------------------------
# build_db
# ---------------------------------------------------------------------------
def test_build_db_applies_baseline_then_deltas_in_order(source_tree: Paths):
    scripts = build_db(source_tree)
    assert scripts[0] == source_tree.baseline_sql
    assert scripts[1:] == source_tree.deltas()
    assert _count(source_tree, "SELECT COUNT(*) FROM job_postings") > 0
    assert _count(source_tree, "SELECT COUNT(*) FROM jobs_fts") == _count(
        source_tree, "SELECT COUNT(*) FROM job_postings"
    )


def test_build_db_failure_keeps_existing_database_and_cleans_up(source_tree: Paths):
    build_db(source_tree)
    before = source_tree.db.read_bytes()
    (source_tree.root / "weekly_delta_2099_01_01.sql").write_text(
        "BEGIN; UPDATE companies SET notes = 'x'; INSERT INTO nope VALUES (1); COMMIT;"
    )
    with pytest.raises(BuildError, match=r"weekly_delta_2099_01_01\.sql: no such table: nope"):
        build_db(source_tree)
    assert source_tree.db.read_bytes() == before
    assert not source_tree.db.with_name(source_tree.db.name + ".tmp").exists()


def test_build_db_rejects_database_that_fails_integrity_checks(source_tree: Paths):
    # A delta that leaves a dangling foreign key must not replace the database.
    (source_tree.root / "weekly_delta_2099_01_01.sql").write_text(
        "PRAGMA foreign_keys = OFF; UPDATE job_postings SET company_id = 99999 WHERE job_id = 1;"
    )
    with pytest.raises(BuildError, match="integrity checks"):
        build_db(source_tree)
    assert not source_tree.db.exists()


# ---------------------------------------------------------------------------
# apply_delta
# ---------------------------------------------------------------------------
def test_apply_delta_updates_db_and_keeps_backup(site: Paths):
    delta = site.root / "weekly_delta_2099_01_01.sql"
    delta.write_text("UPDATE companies SET notes = 'patched' WHERE company_id = 1;")
    original = site.db.read_bytes()
    backup = apply_delta(site, delta)
    assert backup.read_bytes() == original
    assert _count(site, "SELECT COUNT(*) FROM companies WHERE notes = 'patched'") == 1


def test_apply_delta_failure_leaves_database_untouched(site: Paths):
    delta = site.root / "bad.sql"
    delta.write_text("UPDATE companies SET notes = 'patched'; SELEC oops;")
    original = site.db.read_bytes()
    with pytest.raises(BuildError, match=r"bad\.sql"):
        apply_delta(site, delta)
    assert site.db.read_bytes() == original


def test_apply_delta_requires_existing_db_and_delta(source_tree: Paths, site: Paths):
    with pytest.raises(BuildError, match="not found; build it first"):
        apply_delta(source_tree, source_tree.root / "whatever.sql")
    with pytest.raises(BuildError, match="Delta file not found"):
        apply_delta(site, site.root / "missing.sql")


# ---------------------------------------------------------------------------
# integrity_problems
# ---------------------------------------------------------------------------
def test_integrity_problems_reports_dangling_foreign_keys():
    conn = sqlite3.connect(":memory:")
    try:
        conn.executescript(
            "CREATE TABLE p (id INTEGER PRIMARY KEY);"
            "CREATE TABLE c (id INTEGER, p_id INTEGER REFERENCES p(id));"
            "INSERT INTO c VALUES (1, 42);"
        )
        assert integrity_problems(conn) == ["foreign key: ('c', 1, 'p', 0)"]
    finally:
        conn.close()


# ---------------------------------------------------------------------------
# execute_safe_sql
# ---------------------------------------------------------------------------
def test_execute_safe_sql_returns_columns_and_rows(built_site: Paths):
    result = execute_safe_sql(
        built_site.db, "SELECT company_id, company_name FROM companies ORDER BY company_id LIMIT 3"
    )
    assert result.error is None
    assert result.columns == ["company_id", "company_name"]
    assert result.row_count == 3


def test_execute_safe_sql_caps_rows(built_site: Paths):
    sql = "WITH RECURSIVE n(i) AS (SELECT 1 UNION ALL SELECT i + 1 FROM n WHERE i < 600) SELECT i FROM n"
    assert execute_safe_sql(built_site.db, sql).row_count == 500
    assert execute_safe_sql(built_site.db, sql, max_rows=10).row_count == 10


@pytest.mark.parametrize(
    "sql",
    ["-- leading comment\nSELECT 1", "/* block */ SELECT 1", "  pragma table_info(companies)", "EXPLAIN SELECT 1"],
)
def test_execute_safe_sql_allows_read_only_statements(built_site: Paths, sql: str):
    assert execute_safe_sql(built_site.db, sql).error is None


@pytest.mark.parametrize(
    ("sql", "message"),
    [
        ("", "cannot be empty"),
        ("   ", "cannot be empty"),
        ("DELETE FROM companies", "Only read-only"),
        ("-- SELECT\nDROP TABLE companies", "Only read-only"),
        ("SELECT * FROM no_such_table", "no such table"),
    ],
)
def test_execute_safe_sql_rejects_bad_or_writing_queries(built_site: Paths, sql: str, message: str):
    result = execute_safe_sql(built_site.db, sql)
    assert result.error is not None and message in result.error
    assert result.rows == []


def test_execute_safe_sql_read_only_connection_blocks_writes_that_pass_keyword_check(built_site: Paths):
    # Starts with WITH, so it passes the keyword check; the read-only connection is the real guard.
    before = built_site.db.read_bytes()
    result = execute_safe_sql(built_site.db, "WITH x AS (SELECT 1) DELETE FROM companies")
    assert result.error is not None and "readonly" in result.error.replace("-", "").replace(" ", "")
    assert built_site.db.read_bytes() == before
