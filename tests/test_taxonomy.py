import shutil
from pathlib import Path

import pytest

from conftest import REPO_ROOT
from memployers.taxonomy import Taxonomy, TaxonomyError, load_taxonomy


# ---------------------------------------------------------------------------
# Loading the real taxonomy
# ---------------------------------------------------------------------------
def test_real_taxonomy_loads_with_expected_shape(tax: Taxonomy):
    assert len(tax.categories) == 6
    assert len({s.id for s in tax.skills}) == len(tax.skills)
    assert {s.category for s in tax.skills} <= {c.name for c in tax.categories}
    assert tax.corridor(tax.default_corridor_id)
    assert tax.sector(tax.default_sector_id)
    assert tax.queries, "curated queries should load"


def test_every_skill_and_query_is_well_formed(tax: Taxonomy):
    for skill in tax.skills:
        assert skill.patterns, f"{skill.id} has no patterns"
        assert skill.keywords, f"{skill.id} has no keywords"
    for q in tax.queries:
        assert q.sql.strip().upper().startswith(("SELECT", "WITH")), q.id


# ---------------------------------------------------------------------------
# Skill matching
# ---------------------------------------------------------------------------
@pytest.mark.parametrize(
    ("text", "expected"),
    [
        ("Senior Python Developer", {"python"}),
        ("C#, .NET Core, ASP.NET", {"csharp_dotnet"}),
        ("Kubernetes, Docker, Terraform", {"kubernetes_containers", "terraform_iac_cicd"}),
        ("Enterprise IP Telephony, Voice Networking", {"networking_cisco_f5"}),
        ("Retail Store Hardware Support, POS Systems", {"desktop_field_support"}),
        ("Automated Test Systems, Fixture Validation", {"ot_scada_plc_robotics"}),
    ],
)
def test_match_skills_finds_expected_skills(tax: Taxonomy, text: str, expected: set[str]):
    assert {s.id for s in tax.match_skills(text)} == expected


@pytest.mark.parametrize("text", [None, "", "Accountant, Payroll, Office Manager"])
def test_match_skills_returns_nothing_for_empty_or_unrelated_text(tax: Taxonomy, text: str | None):
    assert tax.match_skills(text) == []


def test_match_skills_respects_word_boundaries(tax: Taxonomy):
    # "go" (the language) must not match inside "Google", and "java" not inside "javascript".
    ids = {s.id for s in tax.match_skills("Google Cloud, JavaScript")}
    assert "systems_rust_go_cpp" not in ids
    assert "java_spring" not in ids
    assert {"cloud_gcp", "js_ts_node"} <= ids


def test_match_skills_is_case_insensitive_and_in_taxonomy_order(tax: Taxonomy):
    matched = [s.id for s in tax.match_skills("SQL and PYTHON")]
    order = [s.id for s in tax.skills]
    assert set(matched) == {"python", "sql_databases"}
    assert matched == sorted(matched, key=order.index)


# ---------------------------------------------------------------------------
# Corridor and sector classification
# ---------------------------------------------------------------------------
def test_classify_corridor_override_beats_earlier_match(tax: Taxonomy):
    # "downtown memphis" would match the Downtown corridor, but the override sends it to East Memphis.
    assert tax.classify_corridor("Downtown & East Memphis").id == "east_memphis"


@pytest.mark.parametrize(
    ("text", "expected"),
    [
        ("Downtown Memphis (123 S Front St)", "downtown"),
        ("Collierville & Hacks Cross Corridor", "collierville_hackscross"),
    ],
)
def test_classify_corridor_matches_substrings(tax: Taxonomy, text: str, expected: str):
    assert tax.classify_corridor(text).id == expected


@pytest.mark.parametrize("text", [None, "", "Somewhere Else Entirely"])
def test_classify_corridor_falls_back_to_default(tax: Taxonomy, text: str | None):
    assert tax.classify_corridor(text).id == tax.default_corridor_id


def test_classify_sector_matches_keywords_and_falls_back(tax: Taxonomy):
    assert tax.classify_sector("Global Logistics & Enterprise Tech").id == "logistics_supply_chain"
    assert tax.classify_sector(None).id == tax.default_sector_id
    assert tax.classify_sector("Basket Weaving").id == tax.default_sector_id


# ---------------------------------------------------------------------------
# Validation of broken taxonomy files
# ---------------------------------------------------------------------------
@pytest.fixture
def tax_dir(tmp_path: Path) -> Path:
    shutil.copytree(REPO_ROOT / "taxonomy", tmp_path / "taxonomy")
    return tmp_path / "taxonomy"


def _edit(path: Path, old: str, new: str) -> None:
    text = path.read_text(encoding="utf-8")
    assert old in text, f"{old!r} not in {path.name}"
    path.write_text(text.replace(old, new, 1), encoding="utf-8")


@pytest.mark.parametrize(
    ("file", "old", "new", "message"),
    [
        ("skills.toml", 'category = "Languages & Frameworks"', 'category = "Nope"', "unknown category 'Nope'"),
        ("skills.toml", 'id = "java_spring"', 'id = "python"', "Duplicate skill id: 'python'"),
        ("corridors.toml", 'default = "east_memphis"', 'default = "atlantis"', "unknown corridor 'atlantis'"),
        ("corridors.toml", 'corridor = "east_memphis"', 'corridor = "atlantis"', "unknown corridor 'atlantis'"),
        ("sectors.toml", 'default = "consulting_telecom_services"', 'default = "x"', "unknown sector 'x'"),
        ("queries.toml", 'id = "company_leaderboard"', 'id = "skill_demand_matrix"', "Duplicate query id"),
    ],
)
def test_load_taxonomy_rejects_inconsistent_files(tax_dir: Path, file: str, old: str, new: str, message: str):
    _edit(tax_dir / file, old, new)
    with pytest.raises(TaxonomyError, match=message):
        load_taxonomy(tax_dir)
