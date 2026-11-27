"""Shared fixtures. Tests never touch the real database: they build a copy under a temp dir."""

import shutil
from pathlib import Path

import pytest

from memployers.cli import main
from memployers.paths import STATIC_SITE_FILES, Paths
from memployers.taxonomy import Taxonomy, load_taxonomy

REPO_ROOT = Path(__file__).resolve().parent.parent


def make_source_tree(root: Path) -> Paths:
    """Copy the SQL sources, taxonomy and static site files (not the built DBs) into `root`."""
    root.mkdir(parents=True, exist_ok=True)
    shutil.copy2(REPO_ROOT / "memphis_it_jobs_2026.sql", root)
    for delta in REPO_ROOT.glob("weekly_delta_*.sql"):
        shutil.copy2(delta, root)
    shutil.copytree(REPO_ROOT / "taxonomy", root / "taxonomy")
    (root / "docs").mkdir()
    for name in STATIC_SITE_FILES:
        shutil.copy2(REPO_ROOT / "docs" / name, root / "docs" / name)
    return Paths(root)


@pytest.fixture(scope="session")
def tax() -> Taxonomy:
    return load_taxonomy(REPO_ROOT / "taxonomy")


@pytest.fixture(scope="session")
def built_site(tmp_path_factory: pytest.TempPathFactory) -> Paths:
    """A fully built site (build-db, enrich, bundle). Treat as read-only; use `site` to modify."""
    paths = make_source_tree(tmp_path_factory.mktemp("built") / "repo")
    for command in ("build-db", "enrich", "bundle"):
        assert main(["--root", str(paths.root), command]) == 0
    return paths


@pytest.fixture
def site(built_site: Paths, tmp_path: Path) -> Paths:
    """A private, modifiable copy of the built site."""
    root = tmp_path / "site"
    shutil.copytree(built_site.root, root)
    return Paths(root)


@pytest.fixture
def source_tree(tmp_path: Path) -> Paths:
    """Sources only, nothing built yet."""
    return make_source_tree(tmp_path / "repo")
