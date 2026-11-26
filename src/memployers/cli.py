"""Command-line entry point: `python -m memployers <command>` (the Makefile wraps these)."""

import argparse
import shutil
import sys
from collections.abc import Callable, Sequence
from pathlib import Path

from memployers.database import BuildError, apply_delta, build_db, connect
from memployers.enrich import enrich_database
from memployers.paths import Paths
from memployers.taxonomy import TaxonomyError, load_taxonomy
from memployers.verify import VerificationError, verify_build


def cmd_build_db(paths: Paths, _args: argparse.Namespace) -> None:
    for script in build_db(paths):
        print(f"    applied {script.name}")
    print(f"✓ Built {paths.db.name} from the baseline SQL and {len(paths.deltas())} weekly delta(s).")


def cmd_apply_delta(paths: Paths, args: argparse.Namespace) -> None:
    backup = apply_delta(paths, Path(args.delta))
    print(f"✓ Applied {args.delta} (previous database saved to {backup.name}). Run `enrich` next.")


def cmd_enrich(paths: Paths, _args: argparse.Namespace) -> None:
    conn = connect(paths.db)
    try:
        enrich_database(conn, load_taxonomy(paths.taxonomy_dir))
    finally:
        conn.close()
    print(f"✓ Enriched {paths.db.name} with skill, corridor, sector and curated-query tables.")


def cmd_bundle(paths: Paths, _args: argparse.Namespace) -> None:
    paths.docs_dir.mkdir(parents=True, exist_ok=True)
    shutil.copy2(paths.db, paths.docs_db)
    print(f"✓ Copied the database to {paths.docs_db.relative_to(paths.root)} ({paths.docs_db.stat().st_size:,} bytes).")


def cmd_verify(paths: Paths, _args: argparse.Namespace) -> None:
    print(verify_build(paths, load_taxonomy(paths.taxonomy_dir)))


COMMANDS: dict[str, tuple[Callable[[Paths, argparse.Namespace], None], str]] = {
    "build-db": (cmd_build_db, "Rebuild the database from the baseline SQL plus every weekly delta."),
    "apply-delta": (cmd_apply_delta, "Apply one weekly delta to the existing database (keeps a .backup)."),
    "enrich": (cmd_enrich, "Add taxonomy tables and views (skills, corridors, sectors, curated queries)."),
    "bundle": (cmd_bundle, "Copy the database into docs/ for the static site."),
    "verify": (cmd_verify, "Check the database, skill coverage, curated queries and site files."),
}


def build_parser() -> argparse.ArgumentParser:
    parser = argparse.ArgumentParser(prog="memployers", description=__doc__)
    parser.add_argument("--root", type=Path, default=Path.cwd(), help="Repository root (default: current directory).")
    sub = parser.add_subparsers(dest="command", required=True)
    for name, (_, help_text) in COMMANDS.items():
        p = sub.add_parser(name, help=help_text, description=help_text)
        if name == "apply-delta":
            p.add_argument("delta", help="Path to a weekly_delta_YYYY_MM_DD.sql file.")
    return parser


def main(argv: Sequence[str] | None = None) -> int:
    args = build_parser().parse_args(argv)
    handler, _ = COMMANDS[args.command]
    try:
        handler(Paths(args.root.resolve()), args)
    except (BuildError, TaxonomyError, VerificationError, FileNotFoundError) as exc:
        print(f"✗ {exc}", file=sys.stderr)
        return 1
    return 0
