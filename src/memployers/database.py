"""Build the SQLite database from the research agent's SQL, and query it safely.

Data flow: memphis_it_jobs_2026.sql (baseline) + weekly_delta_*.sql (patches, oldest first)
-> memphis_it_jobs_2026.db. Builds write to a temporary file and only replace the real
database when every script succeeded, so a bad delta can never leave a half-applied DB.
"""

import re
import shutil
import sqlite3
from collections.abc import Generator
from contextlib import contextmanager
from dataclasses import dataclass, field
from pathlib import Path
from typing import Any

from memployers.paths import Paths

READ_ONLY_VERBS = frozenset({"SELECT", "WITH", "PRAGMA", "EXPLAIN"})


class BuildError(RuntimeError):
    """A SQL script failed or produced a database that fails its integrity checks."""


def connect(db_path: Path) -> sqlite3.Connection:
    conn = sqlite3.connect(db_path)
    conn.row_factory = sqlite3.Row
    return conn


@contextmanager
def _connection(db_path: Path) -> Generator[sqlite3.Connection]:
    conn = connect(db_path)
    try:
        yield conn
    finally:
        conn.close()


def integrity_problems(conn: sqlite3.Connection) -> list[str]:
    """Problems reported by SQLite's integrity and foreign-key checks (empty when healthy)."""
    problems = [r[0] for r in conn.execute("PRAGMA integrity_check") if r[0] != "ok"]
    problems += [f"foreign key: {tuple(r)}" for r in conn.execute("PRAGMA foreign_key_check")]
    return problems


def _run_scripts(db_path: Path, scripts: list[Path]) -> None:
    with _connection(db_path) as conn:
        for script in scripts:
            try:
                conn.executescript(script.read_text(encoding="utf-8"))
            except sqlite3.Error as exc:
                raise BuildError(f"{script.name}: {exc}") from exc
        problems = integrity_problems(conn)
    if problems:
        raise BuildError("Database failed integrity checks: " + "; ".join(problems))


def _build_into(target: Path, scripts: list[Path], start_from: Path | None = None) -> None:
    """Run `scripts` against a temp copy of `start_from` (or an empty DB), then swap it into `target`."""
    tmp = target.with_name(target.name + ".tmp")
    tmp.unlink(missing_ok=True)
    if start_from is not None:
        shutil.copy2(start_from, tmp)
    try:
        _run_scripts(tmp, scripts)
    except BaseException:
        tmp.unlink(missing_ok=True)
        raise
    tmp.replace(target)


def build_db(paths: Paths) -> list[Path]:
    """Rebuild the database from the baseline SQL plus every weekly delta. Returns the scripts applied."""
    scripts = [paths.baseline_sql, *paths.deltas()]
    _build_into(paths.db, scripts)
    return scripts


def apply_delta(paths: Paths, delta: Path) -> Path:
    """Apply one delta to the existing database, keeping a copy of the old one. Returns the backup path."""
    if not paths.db.exists():
        raise BuildError(f"{paths.db.name} not found; build it first")
    if not delta.exists():
        raise BuildError(f"Delta file not found: {delta}")
    backup = paths.db.with_name(paths.db.name + ".backup")
    shutil.copy2(paths.db, backup)
    _build_into(paths.db, [delta], start_from=paths.db)
    return backup


# ---------------------------------------------------------------------------
# Read-only queries (used by `verify` for the curated SQL slices)
# ---------------------------------------------------------------------------
@dataclass
class QueryResult:
    columns: list[str] = field(default_factory=list)
    rows: list[tuple[Any, ...]] = field(default_factory=list)
    error: str | None = None

    @property
    def row_count(self) -> int:
        return len(self.rows)


def _first_keyword(sql: str) -> str:
    """First SQL keyword, skipping leading comments and parentheses."""
    without_comments = re.sub(r"--[^\n]*|/\*.*?\*/", " ", sql, flags=re.DOTALL)
    match = re.search(r"[A-Za-z]+", without_comments)
    return match.group(0).upper() if match else ""


def execute_safe_sql(db_path: Path, sql: str, max_rows: int = 500) -> QueryResult:
    """Run one read-only statement. The connection itself is read-only; the keyword check gives a clearer error."""
    if not sql.strip():
        return QueryResult(error="SQL query cannot be empty.")
    if _first_keyword(sql) not in READ_ONLY_VERBS:
        return QueryResult(error="Only read-only SELECT / WITH / PRAGMA / EXPLAIN queries are permitted.")
    try:
        conn = sqlite3.connect(db_path.resolve().as_uri() + "?mode=ro", uri=True)
        try:
            cur = conn.execute(sql)
            columns = [d[0] for d in cur.description or []]
            rows = [tuple(r) for r in cur.fetchmany(max_rows)]
        finally:
            conn.close()
    except sqlite3.Error as exc:
        return QueryResult(error=str(exc))
    return QueryResult(columns=columns, rows=rows)
