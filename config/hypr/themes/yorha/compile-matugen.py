#!/usr/bin/env python3

import json
import sys
from pathlib import Path


def normalize_hex(value: str) -> str:
    if not isinstance(value, str):
        raise TypeError(f"Expected hex color string, got: {type(value).__name__}")

    value = value.strip().lower()
    if not value.startswith("#"):
        raise ValueError(f"Hex color must start with '#': {value}")

    if len(value) != 7:
        raise ValueError(f"Expected 6-digit hex color, got: {value}")

    try:
        int(value[1:], 16)
    except ValueError as exc:
        raise ValueError(f"Invalid hex color: {value}") from exc

    return value


def expand_color(hex_value: str) -> dict:
    hex_value = normalize_hex(hex_value)
    stripped = hex_value[1:]
    red = int(stripped[0:2], 16)
    green = int(stripped[2:4], 16)
    blue = int(stripped[4:6], 16)

    entry = {
        "hex": hex_value,
        "hex_stripped": stripped,
        "red": red,
        "green": green,
        "blue": blue,
    }

    return {
        "default": entry.copy(),
        "light": entry.copy(),
        "dark": entry.copy(),
    }


def _set_missing_alias(section: dict, key: str, fallbacks: tuple[str, ...]) -> None:
    if key in section:
        return

    for fallback in fallbacks:
        value = section.get(fallback)
        if isinstance(value, str):
            section[key] = value
            return


def enrich_material_colors(section_name: str, section: dict) -> dict:
    if section_name != "colors":
        return section

    # Fill optional Material color roles frequently expected by templates.
    section = section.copy()
    _set_missing_alias(section, "primary_fixed", ("primary_container", "primary"))
    _set_missing_alias(section, "primary_fixed_dim", ("primary", "primary_fixed"))
    _set_missing_alias(section, "on_primary_fixed", ("on_primary_container", "on_primary"))
    _set_missing_alias(
        section,
        "on_primary_fixed_variant",
        ("on_primary", "on_primary_container", "on_surface_variant"),
    )

    _set_missing_alias(section, "secondary_fixed", ("secondary_container", "secondary"))
    _set_missing_alias(section, "secondary_fixed_dim", ("secondary", "secondary_fixed"))
    _set_missing_alias(
        section,
        "on_secondary_fixed",
        ("on_secondary_container", "on_secondary"),
    )
    _set_missing_alias(
        section,
        "on_secondary_fixed_variant",
        ("on_secondary", "on_secondary_container", "on_surface_variant"),
    )

    _set_missing_alias(section, "tertiary_fixed", ("tertiary_container", "tertiary"))
    _set_missing_alias(section, "tertiary_fixed_dim", ("tertiary", "tertiary_fixed"))
    _set_missing_alias(
        section,
        "on_tertiary_fixed",
        ("on_tertiary_container", "on_tertiary"),
    )
    _set_missing_alias(
        section,
        "on_tertiary_fixed_variant",
        ("on_tertiary", "on_tertiary_container", "on_surface_variant"),
    )

    _set_missing_alias(section, "surface_tint", ("primary",))
    _set_missing_alias(section, "source_color", ("primary", "inverse_primary"))

    return section


def compile_palette(data: dict) -> dict:
    result = {}

    for section_name, section in data.items():
        if not isinstance(section, dict):
            raise TypeError(f"Top-level section '{section_name}' must be an object")

        section = enrich_material_colors(section_name, section)

        compiled_section = {}
        for key, value in section.items():
            compiled_section[key] = expand_color(value)
        result[section_name] = compiled_section

    return result


def main() -> int:
    input_path = Path(sys.argv[1]) if len(sys.argv) > 1 else Path("colors.min.json")
    output_path = Path(sys.argv[2]) if len(sys.argv) > 2 else Path("colors.json")

    with input_path.open("r", encoding="utf-8") as f:
        data = json.load(f)

    compiled = compile_palette(data)

    with output_path.open("w", encoding="utf-8") as f:
        json.dump(compiled, f, indent=2)
        f.write("\n")

    print(f"Wrote {output_path}")
    return 0


if __name__ == "__main__":
    raise SystemExit(main())
