#!/usr/bin/env bash
set -euo pipefail
IFS=$'\n\t'

# Archive configs into this repo (the directory where this script lives)
REPO_ROOT="$(cd -- "$(dirname -- "${BASH_SOURCE[0]}")" && pwd)"

# Where to store user configs in the repo (optional; adjust if you prefer top-level dirs)
USER_CONFIG_DEST="$REPO_ROOT/config"
USER_HOME_DEST="$REPO_ROOT/home"
ETC_DEST="$REPO_ROOT/etc"

# --- What to archive ---------------------------------------------------------

# ~/.config/<name> directories
USER_CONFIGS=(
  eww
  end-rs
  niri
  systemd
  kitty
  waybar
  nvim
  fuzzel
  gtk-2.0
  gtk-3.0
  gtk-4.0
  DankMaterialShell
)

# Dotfiles (files) from $HOME
USER_FILES=(
  "$HOME/.zshrc"
)

# Global configs (absolute paths).
GLOBAL_PATHS=(
	/etc/ly
)

# --- Helpers ----------------------------------------------------------------

log()  { printf '[%s] %s\n' "$(date +'%H:%M:%S')" "$*"; }
warn() { printf '[%s] WARN: %s\n' "$(date +'%H:%M:%S')" "$*" >&2; }
die()  { printf '[%s] ERROR: %s\n' "$(date +'%H:%M:%S')" "$*" >&2; exit 1; }

need_cmd() {
  command -v "$1" >/dev/null 2>&1 || die "Missing required command: $1"
}

sync_dir() {
  # sync_dir <src_dir> <dest_dir>
  local src="$1" dest="$2"
  mkdir -p "$(dirname -- "$dest")"
  log "Sync dir: $src -> $dest"
  rsync -a --delete --human-readable -- "$src"/ "$dest"/
}

sync_file() {
  # sync_file <src_file> <dest_file_or_dir>
  local src="$1" dest="$2"
  mkdir -p "$(dirname -- "$dest")"
  log "Sync file: $src -> $dest"
  rsync -a --human-readable -- "$src" "$dest"
}

mirror_abs_path_under() {
  # mirror_abs_path_under </etc/foo/bar> <dest_root> -> <dest_root>/etc/foo/bar (without leading slash)
  local abs="$1" root="$2"
  printf '%s/%s' "$root" "${abs#/}"
}

# --- Main -------------------------------------------------------------------

main() {
  need_cmd rsync

  mkdir -p "$USER_CONFIG_DEST" "$USER_HOME_DEST" "$ETC_DEST"

  # User configs
  for name in "${USER_CONFIGS[@]}"; do
    local_src="$HOME/.config/$name"
    local_dst="$USER_CONFIG_DEST/$name"

    if [[ -d "$local_src" ]]; then
      sync_dir "$local_src" "$local_dst"
    else
      warn "Not found: $local_src"
    fi
  done

  # Dotfiles
  for f in "${USER_FILES[@]}"; do
    if [[ -f "$f" ]]; then
      sync_file "$f" "$USER_HOME_DEST/$(basename -- "$f")"
    else
      warn "Not found: $f"
    fi
  done

  # Global (/etc etc.)
  for p in "${GLOBAL_PATHS[@]}"; do
    if [[ -d "$p" ]]; then
      dst="$(mirror_abs_path_under "$p" "$REPO_ROOT")"
      # this will land under ./etc/... if p starts with /etc/...
      sync_dir "$p" "$dst"
    elif [[ -f "$p" ]]; then
      dst="$(mirror_abs_path_under "$p" "$REPO_ROOT")"
      sync_file "$p" "$dst"
    else
      warn "Not found: $p"
    fi
  done

  log "Removing .git subfolders"
  find . -mindepth 2 -type d -name .git -prune -exec rm -rf {} +

  log "Done. Repo root: $REPO_ROOT"
}

main "$@"
