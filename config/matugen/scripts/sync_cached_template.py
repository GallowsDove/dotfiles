import shutil
import subprocess
import sys
from pathlib import Path


HOME = Path('/home/arch')
CACHE_ROOT = HOME / '.cache' / 'matugen' / 'templates'
WAL_ROOT = HOME / '.cache' / 'wal'
VSCODE_THEME_TARGET = HOME / '.vscode' / 'extensions' / 'local.matugen-theme-0.0.1' / 'themes' / 'matugen-color-theme.json'
FCITX_THEME_DIR = HOME / '.local' / 'share' / 'fcitx5' / 'themes' / 'matugen'
FCITX_ASSET_SOURCE = Path('/usr/share/fcitx5/themes/default-dark')
FCITX_ASSETS = ('arrow.png', 'next.png', 'prev.png', 'radio.png')


def _has_command(command: str) -> bool:
    return shutil.which(command) is not None


def _copy_file(source: Path, target: Path) -> None:
    if not source.exists():
        raise SystemExit(f'Missing generated template: {source}')

    target.parent.mkdir(parents=True, exist_ok=True)
    shutil.copy2(source, target)


def _run_command(*args: str) -> None:
    subprocess.run(args, check=True)


def _should_sync(command: str | None = None, path: Path | None = None) -> bool:
    if command and _has_command(command):
        return True
    if path and path.exists():
        return True
    return False


def sync_niri() -> None:
    if not _should_sync('niri', HOME / '.config' / 'niri'):
        return

    _copy_file(
        CACHE_ROOT / 'niri' / 'custom-colors.kdl',
        HOME / '.config' / 'niri' / 'dms' / 'custom-colors.kdl',
    )


def sync_nvim() -> None:
    if not _should_sync('nvim', HOME / '.config' / 'nvim'):
        return

    _copy_file(
        CACHE_ROOT / 'nvim' / 'matugen.lua',
        HOME / '.config' / 'nvim' / 'colors' / 'matugen.lua',
    )


def sync_gtk3() -> None:
    target_root = HOME / '.config' / 'gtk-3.0'
    if not target_root.exists():
        return

    _copy_file(
        CACHE_ROOT / 'gtk' / 'dank-colors-gtk3.css',
        target_root / 'dank-colors.css',
    )


def sync_gtk4() -> None:
    target_root = HOME / '.config' / 'gtk-4.0'
    if not target_root.exists():
        return

    _copy_file(
        CACHE_ROOT / 'gtk' / 'dank-colors-gtk4.css',
        target_root / 'dank-colors.css',
    )


def sync_qt5ct() -> None:
    if not _should_sync('qt5ct', HOME / '.config' / 'qt5ct'):
        return

    _copy_file(
        CACHE_ROOT / 'qt5ct' / 'matugen.conf',
        HOME / '.config' / 'qt5ct' / 'colors' / 'matugen.conf',
    )


def sync_qt6ct() -> None:
    if not _should_sync('qt6ct', HOME / '.config' / 'qt6ct'):
        return

    _copy_file(
        CACHE_ROOT / 'qt6ct' / 'matugen.conf',
        HOME / '.config' / 'qt6ct' / 'colors' / 'matugen.conf',
    )


def sync_pywalfox() -> None:
    if not _has_command('pywalfox'):
        return

    source = CACHE_ROOT / 'pywalfox' / 'colors.json'
    target = WAL_ROOT / 'colors.json'
    _copy_file(source, target)
    _run_command('pywalfox', 'update')


def sync_vscode() -> None:
    if not VSCODE_THEME_TARGET.parent.exists():
        return

    _copy_file(
        CACHE_ROOT / 'vscode' / 'matugen-color-theme.json',
        VSCODE_THEME_TARGET,
    )


def sync_vesktop() -> None:
    if not _should_sync('vesktop', HOME / '.config' / 'vesktop'):
        return

    _copy_file(
        CACHE_ROOT / 'vesktop' / 'dank-discord.css',
        HOME / '.config' / 'vesktop' / 'themes' / 'dank-discord.css',
    )


def sync_fcitx5() -> None:
    if not _should_sync('fcitx5', HOME / '.local' / 'share' / 'fcitx5'):
        return

    _copy_file(
        CACHE_ROOT / 'fcitx5' / 'theme.conf',
        FCITX_THEME_DIR / 'theme.conf',
    )

    for asset_name in FCITX_ASSETS:
        asset_source = FCITX_ASSET_SOURCE / asset_name
        if asset_source.exists():
            _copy_file(asset_source, FCITX_THEME_DIR / asset_name)


SYNC_ACTIONS = {
    'niri': sync_niri,
    'nvim': sync_nvim,
    'gtk3': sync_gtk3,
    'gtk4': sync_gtk4,
    'qt5ct': sync_qt5ct,
    'qt6ct': sync_qt6ct,
    'pywalfox': sync_pywalfox,
    'vscode': sync_vscode,
    'vesktop': sync_vesktop,
    'fcitx5': sync_fcitx5,
}


def main() -> None:
    if len(sys.argv) != 2 or sys.argv[1] not in SYNC_ACTIONS:
        valid = ', '.join(sorted(SYNC_ACTIONS))
        raise SystemExit(f'Usage: {Path(sys.argv[0]).name} <{valid}>')

    SYNC_ACTIONS[sys.argv[1]]()


if __name__ == '__main__':
    main()