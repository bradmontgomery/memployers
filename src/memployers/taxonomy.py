"""Load the hand-maintained taxonomy (taxonomy/*.toml) and classify free text against it.

The taxonomy turns the research agent's free-text fields into a small, fixed vocabulary:
- job titles and tech-stack tags  -> canonical skills
- a company's corridor text       -> a corridor group (with map coordinates)
- a company's sector text         -> a macro-sector
It also carries the curated SQL slices shown in the site's SQL workbench.
"""

import re
import tomllib
from collections.abc import Iterable
from dataclasses import dataclass
from pathlib import Path
from typing import Any


class TaxonomyError(ValueError):
    """The taxonomy files are inconsistent (unknown reference, duplicate id, ...)."""


@dataclass(frozen=True)
class SkillCategory:
    name: str
    color: str
    bg: str
    icon: str
    description: str


@dataclass(frozen=True)
class Skill:
    id: str
    name: str
    category: str
    keywords: tuple[str, ...]
    patterns: tuple[re.Pattern[str], ...]

    def matches(self, lowered_text: str) -> bool:
        return any(p.search(lowered_text) for p in self.patterns)


@dataclass(frozen=True)
class Corridor:
    id: str
    name: str
    short_name: str
    state: str
    map_x: int
    map_y: int
    color: str
    match: tuple[str, ...]
    description: str


@dataclass(frozen=True)
class MacroSector:
    id: str
    name: str
    color: str
    keywords: tuple[str, ...]


@dataclass(frozen=True)
class CuratedQuery:
    id: str
    title: str
    category: str
    description: str
    sql: str


@dataclass(frozen=True)
class Taxonomy:
    categories: tuple[SkillCategory, ...]
    skills: tuple[Skill, ...]
    corridors: tuple[Corridor, ...]
    corridor_overrides: tuple[tuple[str, str], ...]  # (substring, corridor id), checked first
    default_corridor_id: str
    sectors: tuple[MacroSector, ...]
    default_sector_id: str
    queries: tuple[CuratedQuery, ...]

    def category(self, name: str) -> SkillCategory:
        return next(c for c in self.categories if c.name == name)

    def corridor(self, corridor_id: str) -> Corridor:
        return next(c for c in self.corridors if c.id == corridor_id)

    def sector(self, sector_id: str) -> MacroSector:
        return next(s for s in self.sectors if s.id == sector_id)

    def match_skills(self, text: str | None) -> list[Skill]:
        """Canonical skills whose patterns appear in `text`, in taxonomy order."""
        if not text:
            return []
        lowered = text.lower()
        return [s for s in self.skills if s.matches(lowered)]

    def classify_corridor(self, corridor_text: str | None) -> Corridor:
        lowered = (corridor_text or "").lower()
        for needle, corridor_id in self.corridor_overrides:
            if needle in lowered:
                return self.corridor(corridor_id)
        for corridor in self.corridors:
            if any(m in lowered for m in corridor.match):
                return corridor
        return self.corridor(self.default_corridor_id)

    def classify_sector(self, sector_text: str | None) -> MacroSector:
        lowered = (sector_text or "").lower()
        for sector in self.sectors:
            if any(k in lowered for k in sector.keywords):
                return sector
        return self.sector(self.default_sector_id)


# ---------------------------------------------------------------------------
# Loading & validation
# ---------------------------------------------------------------------------
def _read(path: Path) -> dict[str, Any]:
    with path.open("rb") as fh:
        return tomllib.load(fh)


def _require_unique(kind: str, ids: Iterable[str]) -> None:
    seen: set[str] = set()
    for i in ids:
        if i in seen:
            raise TaxonomyError(f"Duplicate {kind} id: {i!r}")
        seen.add(i)


def _require_known(kind: str, value: str, known: Iterable[str], where: str) -> None:
    if value not in set(known):
        raise TaxonomyError(f"{where} refers to unknown {kind} {value!r}")


def _load_skills(data: dict[str, Any]) -> tuple[tuple[SkillCategory, ...], tuple[Skill, ...]]:
    categories = tuple(
        SkillCategory(name=c["name"], color=c["color"], bg=c["bg"], icon=c["icon"], description=c["description"])
        for c in data["categories"]
    )
    skills = tuple(
        Skill(
            id=s["id"],
            name=s["name"],
            category=s["category"],
            keywords=tuple(s["keywords"]),
            patterns=tuple(re.compile(p) for p in s["patterns"]),
        )
        for s in data["skills"]
    )
    _require_unique("category", (c.name for c in categories))
    _require_unique("skill", (s.id for s in skills))
    for s in skills:
        _require_known("category", s.category, (c.name for c in categories), f"Skill {s.id!r}")
    return categories, skills


def _load_corridors(data: dict[str, Any]) -> tuple[tuple[Corridor, ...], tuple[tuple[str, str], ...], str]:
    corridors = tuple(
        Corridor(
            id=c["id"],
            name=c["name"],
            short_name=c["short_name"],
            state=c["state"],
            map_x=c["map_x"],
            map_y=c["map_y"],
            color=c["color"],
            match=tuple(c["match"]),
            description=c["description"],
        )
        for c in data["corridors"]
    )
    overrides = tuple((o["contains"], o["corridor"]) for o in data.get("overrides", []))
    ids = [c.id for c in corridors]
    _require_unique("corridor", ids)
    _require_known("corridor", data["default"], ids, "corridors.toml `default`")
    for needle, corridor_id in overrides:
        _require_known("corridor", corridor_id, ids, f"Corridor override {needle!r}")
    return corridors, overrides, data["default"]


def _load_sectors(data: dict[str, Any]) -> tuple[tuple[MacroSector, ...], str]:
    sectors = tuple(
        MacroSector(id=s["id"], name=s["name"], color=s["color"], keywords=tuple(s["keywords"]))
        for s in data["sectors"]
    )
    ids = [s.id for s in sectors]
    _require_unique("sector", ids)
    _require_known("sector", data["default"], ids, "sectors.toml `default`")
    return sectors, data["default"]


def load_taxonomy(taxonomy_dir: Path) -> Taxonomy:
    """Load and cross-check skills.toml, corridors.toml, sectors.toml and queries.toml."""
    categories, skills = _load_skills(_read(taxonomy_dir / "skills.toml"))
    corridors, overrides, default_corridor = _load_corridors(_read(taxonomy_dir / "corridors.toml"))
    sectors, default_sector = _load_sectors(_read(taxonomy_dir / "sectors.toml"))
    queries = tuple(
        CuratedQuery(id=q["id"], title=q["title"], category=q["category"], description=q["description"], sql=q["sql"])
        for q in _read(taxonomy_dir / "queries.toml")["queries"]
    )
    _require_unique("query", (q.id for q in queries))
    return Taxonomy(
        categories=categories,
        skills=skills,
        corridors=corridors,
        corridor_overrides=overrides,
        default_corridor_id=default_corridor,
        sectors=sectors,
        default_sector_id=default_sector,
        queries=queries,
    )
