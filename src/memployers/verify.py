"""Check a finished build: database health, taxonomy coverage, curated queries, and site files.

Every check returns a list of human-readable problems; `verify_build` raises once with all of them,
so a failing CI run shows everything that needs fixing, not just the first issue.
"""

import sqlite3
from dataclasses import dataclass

from memployers.database import connect, execute_safe_sql, integrity_problems
from memployers.paths import STATIC_SITE_FILES, Paths
from memployers.taxonomy import Taxonomy


class VerificationError(AssertionError):
    def __init__(self, problems: list[str]):
        self.problems = problems
        super().__init__("Build verification failed:\n" + "\n".join(f"  - {p}" for p in problems))


@dataclass(frozen=True)
class BuildSummary:
    companies: int
    active_jobs: int
    skills: int
    queries: int
    db_bytes: int

    def __str__(self) -> str:
        return (
            f"✓ Verified SQLite DB ({self.db_bytes:,} bytes): {self.companies} companies, "
            f"{self.active_jobs} active jobs, {self.skills} skills, and {self.queries} SQL slices in docs/."
        )


def check_site_files(paths: Paths) -> list[str]:
    required = [paths.db, paths.docs_db, *(paths.docs_dir / f for f in STATIC_SITE_FILES)]
    problems = [f"Missing or empty build artifact: {p}" for p in required if not p.exists() or p.stat().st_size == 0]
    if not problems and paths.docs_db.read_bytes() != paths.db.read_bytes():
        problems.append("docs/ database is stale; run `make bundle`")
    return problems


def _count(conn: sqlite3.Connection, sql: str) -> int:
    return conn.execute(sql).fetchone()[0]


def check_database(conn: sqlite3.Connection, tax: Taxonomy) -> list[str]:
    problems = integrity_problems(conn)
    if _count(conn, "SELECT COUNT(*) FROM companies") == 0:
        problems.append("Database has no companies")
    if _count(conn, "SELECT COUNT(*) FROM v_jobs_enriched WHERE is_active = 1") == 0:
        problems.append("Database has no active jobs")
    skills = _count(conn, "SELECT COUNT(*) FROM canonical_skills")
    if skills != len(tax.skills):
        problems.append(f"canonical_skills has {skills} rows but the taxonomy defines {len(tax.skills)}; run enrich")
    untagged = conn.execute(
        """SELECT job_id, job_title FROM v_jobs_enriched
           WHERE is_active = 1 AND job_id NOT IN (SELECT job_id FROM job_skill_map)
           ORDER BY job_id"""
    ).fetchall()
    problems += [f"Active job {r['job_id']} ({r['job_title']}) matches no canonical skill" for r in untagged]
    return problems


def check_queries(paths: Paths, tax: Taxonomy) -> list[str]:
    problems = []
    for q in tax.queries:
        result = execute_safe_sql(paths.db, q.sql)
        if result.error:
            problems.append(f"Curated query {q.id!r} failed: {result.error}")
        elif result.row_count == 0:
            problems.append(f"Curated query {q.id!r} returned no rows")
    return problems


def verify_build(paths: Paths, tax: Taxonomy) -> BuildSummary:
    problems = check_site_files(paths)
    if problems:
        raise VerificationError(problems)
    conn = connect(paths.db)
    try:
        try:
            problems = check_database(conn, tax) + check_queries(paths, tax)
        except sqlite3.Error as exc:
            raise VerificationError([f"Database is missing expected tables or views ({exc}); run enrich"]) from exc
        summary = BuildSummary(
            companies=_count(conn, "SELECT COUNT(*) FROM companies"),
            active_jobs=_count(conn, "SELECT COUNT(*) FROM v_jobs_enriched WHERE is_active = 1"),
            skills=len(tax.skills),
            queries=len(tax.queries),
            db_bytes=paths.docs_db.stat().st_size,
        )
    finally:
        conn.close()
    if problems:
        raise VerificationError(problems)
    return summary
