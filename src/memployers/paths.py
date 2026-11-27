"""Filesystem layout of a memployers checkout.

Every function that touches files takes a `Paths`, so tests can point the whole
pipeline at a temporary directory instead of the real database.
"""

from dataclasses import dataclass
from pathlib import Path

DB_NAME = "memphis_it_jobs_2026.db"
STATIC_SITE_FILES = ("index.html", "styles.css", "charts.js", "app.js")


@dataclass(frozen=True)
class Paths:
    root: Path

    @property
    def baseline_sql(self) -> Path:
        return self.root / "memphis_it_jobs_2026.sql"

    @property
    def db(self) -> Path:
        return self.root / DB_NAME

    @property
    def taxonomy_dir(self) -> Path:
        return self.root / "taxonomy"

    @property
    def docs_dir(self) -> Path:
        return self.root / "docs"

    @property
    def docs_db(self) -> Path:
        return self.docs_dir / DB_NAME

    def deltas(self) -> list[Path]:
        """Weekly delta patches, oldest first (file names sort by date)."""
        return sorted(self.root.glob("weekly_delta_*.sql"))
