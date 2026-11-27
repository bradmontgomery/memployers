"""CRAP (Change Risk Anti-Patterns) report for Python functions.

    CRAP(f) = complexity(f)^2 * (1 - coverage(f))^3 + complexity(f)

A simple, fully tested function scores close to its complexity; a complex, untested one scores
very high. Complexity comes from radon; per-function line coverage comes from coverage.py's JSON
report (`pytest --cov --cov-report=json`). Exits non-zero when any function exceeds the threshold.

Usage: python tools/crap.py [--coverage coverage.json] [--threshold 30] [--top 10]
"""

import argparse
import json
from collections.abc import Iterable, Iterator, Sequence
from dataclasses import dataclass
from pathlib import Path
from typing import Any

from radon.complexity import cc_visit
from radon.visitors import Class, Function

DEFAULT_THRESHOLD = 30.0


@dataclass(frozen=True)
class Span:
    name: str
    start: int
    end: int
    complexity: int


@dataclass(frozen=True)
class Score:
    file: str
    name: str
    line: int
    complexity: int
    coverage: float
    crap: float


def crap_score(complexity: int, coverage: float) -> float:
    return complexity**2 * (1 - coverage) ** 3 + complexity


def _flatten(blocks: Iterable[Function | Class], prefix: str = "") -> Iterator[Span]:
    # radon lists methods at the top level (with `classname` set) as well as inside their Class,
    # so skip Class blocks and qualify methods by hand.
    for block in blocks:
        if isinstance(block, Class):
            continue
        owner = f"{block.classname}." if block.classname else ""
        name = f"{prefix}{owner}{block.name}"
        yield Span(name, block.lineno, block.endline, block.complexity)
        yield from _flatten(block.closures, prefix=f"{name}.")


def function_spans(source: str) -> list[Span]:
    """Every function, method and closure in `source`, with its line range and cyclomatic complexity."""
    return list(_flatten(cc_visit(source)))


def line_coverage(span: Span, executed: set[int], missing: set[int]) -> float:
    """Share of the span's statements that ran. A span with no measured statements counts as covered."""
    lines = range(span.start, span.end + 1)
    ran = sum(1 for n in lines if n in executed)
    total = ran + sum(1 for n in lines if n in missing)
    return ran / total if total else 1.0


def score_file(file: str, source: str, executed: set[int], missing: set[int]) -> list[Score]:
    scores = []
    for span in function_spans(source):
        cov = line_coverage(span, executed, missing)
        scores.append(Score(file, span.name, span.start, span.complexity, cov, crap_score(span.complexity, cov)))
    return scores


def score_report(report: dict[str, Any], root: Path) -> list[Score]:
    """Score every measured file in a coverage.py JSON report, worst first."""
    scores: list[Score] = []
    for file, data in report["files"].items():
        source = (root / file).read_text(encoding="utf-8")
        scores += score_file(file, source, set(data["executed_lines"]), set(data["missing_lines"]))
    return sorted(scores, key=lambda s: s.crap, reverse=True)


def format_table(scores: Sequence[Score]) -> str:
    rows = [f"{'CRAP':>7}  {'CC':>3}  {'Cover':>6}  Function"]
    rows += [f"{s.crap:7.1f}  {s.complexity:3d}  {s.coverage:6.0%}  {s.file}:{s.line} {s.name}" for s in scores]
    return "\n".join(rows)


def main(argv: Sequence[str] | None = None) -> int:
    parser = argparse.ArgumentParser(description=__doc__.splitlines()[0])
    parser.add_argument("--coverage", type=Path, default=Path("coverage.json"))
    parser.add_argument("--threshold", type=float, default=DEFAULT_THRESHOLD)
    parser.add_argument("--top", type=int, default=10)
    args = parser.parse_args(argv)

    report = json.loads(args.coverage.read_text(encoding="utf-8"))
    scores = score_report(report, args.coverage.resolve().parent)
    over = [s for s in scores if s.crap > args.threshold]
    print(format_table(scores[: args.top]))
    if over:
        print(f"\n✗ {len(over)} function(s) exceed CRAP {args.threshold:g}.")
        return 1
    print(f"\n✓ All {len(scores)} functions are at or below CRAP {args.threshold:g}.")
    return 0


if __name__ == "__main__":
    raise SystemExit(main())
