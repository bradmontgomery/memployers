import runpy
import sys

import pytest

from memployers.cli import COMMANDS, build_parser, main
from memployers.paths import Paths


def run(paths: Paths, *args: str) -> int:
    return main(["--root", str(paths.root), *args])


def test_full_pipeline_from_sources(source_tree: Paths, capsys: pytest.CaptureFixture[str]):
    for command in ("build-db", "enrich", "bundle", "verify"):
        assert run(source_tree, command) == 0, command
    out = capsys.readouterr().out
    assert "applied memphis_it_jobs_2026.sql" in out
    assert "✓ Enriched" in out
    assert "✓ Copied the database to docs/" in out
    assert "✓ Verified SQLite DB" in out


def test_apply_delta_command(site: Paths, capsys: pytest.CaptureFixture[str]):
    delta = site.root / "weekly_delta_2099_01_01.sql"
    delta.write_text("UPDATE companies SET notes = 'x' WHERE company_id = 1;")
    assert run(site, "apply-delta", str(delta)) == 0
    assert "previous database saved to memphis_it_jobs_2026.db.backup" in capsys.readouterr().out


@pytest.mark.parametrize(
    ("args", "message"),
    [
        (("apply-delta", "missing.sql"), "Delta file not found"),
        (("verify",), "Build verification failed"),
    ],
)
def test_errors_print_to_stderr_and_return_1(site: Paths, capsys: pytest.CaptureFixture[str], args, message):
    (site.docs_dir / "app.js").write_text("")  # makes `verify` fail
    assert run(site, *args) == 1
    assert message in capsys.readouterr().err


def test_broken_taxonomy_is_reported(site: Paths, capsys: pytest.CaptureFixture[str]):
    skills = site.taxonomy_dir / "skills.toml"
    skills.write_text(skills.read_text().replace('id = "java_spring"', 'id = "python"', 1))
    assert run(site, "enrich") == 1
    assert "Duplicate skill id" in capsys.readouterr().err


def test_parser_lists_every_command():
    parser = build_parser()
    for name in COMMANDS:
        assert parser.parse_args([name] + (["x.sql"] if name == "apply-delta" else [])).command == name
    with pytest.raises(SystemExit):
        parser.parse_args([])


def test_python_dash_m_entry_point(built_site: Paths, monkeypatch: pytest.MonkeyPatch):
    monkeypatch.setattr(sys, "argv", ["memployers", "--root", str(built_site.root), "verify"])
    with pytest.raises(SystemExit) as excinfo:
        runpy.run_module("memployers", run_name="__main__")
    assert excinfo.value.code == 0
