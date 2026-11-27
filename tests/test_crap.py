import json
import textwrap
from pathlib import Path

import pytest

import crap

SOURCE = textwrap.dedent(
    """\
    def simple():
        return 1


    def branchy(x):
        if x > 0:
            return "pos"
        elif x < 0:
            return "neg"
        return "zero"


    class Thing:
        def method(self, flag):
            if flag:
                return 1
            return 2

        def outer(self):
            def inner(y):
                return y or 0
            return inner(1)
    """
)


def test_crap_score_formula():
    assert crap.crap_score(1, 1.0) == 1
    assert crap.crap_score(5, 0.0) == 5**2 + 5
    assert crap.crap_score(4, 0.5) == pytest.approx(16 * 0.125 + 4)


def test_function_spans_include_methods_and_closures():
    spans = {s.name: s for s in crap.function_spans(SOURCE)}
    assert set(spans) == {"simple", "branchy", "Thing.method", "Thing.outer", "Thing.outer.inner"}
    assert spans["simple"].complexity == 1
    assert spans["branchy"].complexity == 3
    assert (spans["branchy"].start, spans["branchy"].end) == (5, 10)


def test_line_coverage():
    span = crap.Span("f", 10, 14, 1)
    assert crap.line_coverage(span, executed={10, 11, 12}, missing={13}) == 0.75
    assert crap.line_coverage(span, executed=set(), missing=set()) == 1.0
    assert crap.line_coverage(span, executed={1, 99}, missing={13}) == 0.0


def _write_report(tmp_path: Path, executed: list[int], missing: list[int]) -> Path:
    (tmp_path / "pkg").mkdir()
    (tmp_path / "pkg" / "mod.py").write_text(SOURCE)
    report = {"files": {"pkg/mod.py": {"executed_lines": executed, "missing_lines": missing}}}
    path = tmp_path / "coverage.json"
    path.write_text(json.dumps(report))
    return path


def test_score_report_ranks_worst_first(tmp_path: Path):
    path = _write_report(tmp_path, executed=[1, 2, 5, 6, 7], missing=[8, 9, 10])
    scores = crap.score_report(json.loads(path.read_text()), tmp_path)
    assert scores[0].name == "branchy"
    assert scores[0].crap == pytest.approx(crap.crap_score(3, 0.5))
    assert scores == sorted(scores, key=lambda s: s.crap, reverse=True)


def test_main_passes_and_fails_on_threshold(tmp_path: Path, capsys: pytest.CaptureFixture[str]):
    path = _write_report(tmp_path, executed=[1, 2, 5, 6, 7], missing=[8, 9, 10])
    assert crap.main(["--coverage", str(path), "--threshold", "30"]) == 0
    assert "✓ All 5 functions are at or below CRAP 30." in capsys.readouterr().out
    assert crap.main(["--coverage", str(path), "--threshold", "3", "--top", "2"]) == 1
    out = capsys.readouterr().out
    assert "exceed CRAP 3" in out
    assert len(out.split("\n✗")[0].strip().splitlines()) == 3  # header + top 2
