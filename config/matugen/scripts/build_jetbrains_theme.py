import json
from pathlib import Path
import shutil
import zipfile
import xml.etree.ElementTree as ET


CACHE_ROOT = Path('/home/arch/.cache/matugen/templates/intellij')
SOURCE_ROOT = Path('/home/arch/.config/matugen/jetbrains-theme')
STAGING_ROOT = Path('/home/arch/.cache/matugen/staging/jetbrains-theme')
JETBRAINS_CONFIG_ROOT = Path('/home/arch/.config/JetBrains')


def _version_key(path: Path) -> tuple[int, ...]:
    suffix = path.name.removeprefix('IntelliJIdea')
    parts = []
    for chunk in suffix.replace('-', '.').split('.'):
        if not chunk:
            continue
        digits = ''.join(character for character in chunk if character.isdigit())
        if digits:
            parts.append(int(digits))
    return tuple(parts)


def _find_plugin_root() -> Path | None:
    jetbrains_root = Path('/home/arch/.local/share/JetBrains')
    candidates = [path for path in jetbrains_root.glob('IntelliJIdea*') if path.is_dir()]
    if not candidates:
        return None
    return max(candidates, key=_version_key)


def _hex_channel_pair(value: str) -> tuple[int, int, int]:
    normalized = value.strip().removeprefix('#')[:6]
    if len(normalized) != 6:
        raise ValueError(f'Expected 6-digit hex color, got {value!r}')
    return tuple(int(normalized[index:index + 2], 16) for index in range(0, 6, 2))


def _is_dark_color(value: str) -> bool:
    red, green, blue = _hex_channel_pair(value)
    luminance = (0.2126 * red + 0.7152 * green + 0.0722 * blue) / 255
    return luminance < 0.4


def _normalize_generated_theme(theme_path: Path, scheme_path: Path) -> None:
    with theme_path.open('r', encoding='utf-8') as file:
        theme = json.load(file)

    colors = theme.get('colors', {})
    background = colors.get('baseBackground')
    if not isinstance(background, str):
        raise SystemExit(f'Missing colors.baseBackground in {theme_path}')

    is_dark = _is_dark_color(background)
    theme['dark'] = is_dark

    with theme_path.open('w', encoding='utf-8') as file:
        json.dump(theme, file, indent=2)
        file.write('\n')

    tree = ET.parse(scheme_path)
    root = tree.getroot()
    parent_scheme = 'Darcula' if is_dark else 'Default'
    root.set('parent_scheme', parent_scheme)

    meta_info = root.find('metaInfo')
    if meta_info is not None:
        for prop in meta_info.findall('property'):
            if prop.get('name') == 'originalScheme':
                prop.set('value', parent_scheme)
                break

    tree.write(scheme_path, encoding='unicode', xml_declaration=False)


def _sync_editor_scheme(plugin_root: Path, scheme_source: Path) -> None:
    config_root = JETBRAINS_CONFIG_ROOT / plugin_root.name
    colors_dir = config_root / 'colors'
    scheme_target = colors_dir / 'Matugen.icls'

    colors_dir.mkdir(parents=True, exist_ok=True)
    shutil.copy2(scheme_source, scheme_target)


def main() -> None:
    plugin_root = _find_plugin_root()
    theme_source = CACHE_ROOT / 'matugen.theme.json'
    scheme_source = CACHE_ROOT / 'Matugen.xml'

    source_files = [
        SOURCE_ROOT / 'META-INF' / 'plugin.xml',
        theme_source,
        scheme_source,
    ]

    missing = [str(path) for path in source_files if not path.exists()]
    if missing:
        raise SystemExit(f'Missing JetBrains theme files: {", ".join(missing)}')

    _normalize_generated_theme(theme_source, scheme_source)

    if plugin_root is None:
        return

    plugin_dir = plugin_root / 'matugen-theme'
    plugin_lib_dir = plugin_dir / 'lib'
    plugin_jar = plugin_lib_dir / 'matugen-theme.jar'
    legacy_plugin_jar = plugin_root / 'matugen-theme.jar'

    plugin_root.mkdir(parents=True, exist_ok=True)
    if plugin_dir.exists():
        shutil.rmtree(plugin_dir)
    plugin_lib_dir.mkdir(parents=True, exist_ok=True)
    legacy_plugin_jar.unlink(missing_ok=True)

    if STAGING_ROOT.exists():
        shutil.rmtree(STAGING_ROOT)
    shutil.copytree(SOURCE_ROOT, STAGING_ROOT)
    shutil.copy2(theme_source, STAGING_ROOT / 'themes' / 'matugen.theme.json')
    shutil.copy2(scheme_source, STAGING_ROOT / 'colors' / 'Matugen.xml')

    with zipfile.ZipFile(plugin_jar, 'w', compression=zipfile.ZIP_DEFLATED) as jar:
        for path in STAGING_ROOT.rglob('*'):
            if path.is_file():
                jar.write(path, path.relative_to(STAGING_ROOT).as_posix())

    _sync_editor_scheme(plugin_root, scheme_source)


if __name__ == '__main__':
    main()