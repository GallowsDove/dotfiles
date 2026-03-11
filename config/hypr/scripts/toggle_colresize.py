#!/usr/bin/env python3

import json
import os
import re
import subprocess
import sys
from pathlib import Path

ONE_RATIO = 1.0
RATIO_TOLERANCE = 0.015
FALLBACK_RATIO = 0.5
DEFAULT_GAPS_IN = 20.0
DEFAULT_GAPS_OUT = 20.0
DEFAULT_BORDER_SIZE = 0.0
DEFAULT_EXPLICIT_WIDTHS = [0.333333333333, 0.5, 0.66666666666]


def run_command(command):
    return subprocess.check_output(command, text=True).strip()


def hyprctl_json(command):
    return json.loads(run_command(["hyprctl", "-j", command]))


def hyprctl_dispatch(dispatcher, argument):
    subprocess.check_call(["hyprctl", "dispatch", dispatcher, argument])


def get_window_key(active_window):
    address = str(active_window.get("address", "")).strip()
    if address:
        return address

    workspace = active_window.get("workspace") or {}
    workspace_id = workspace.get("id", active_window.get("workspaceID", "unknown"))
    monitor_id = active_window.get("monitorID", active_window.get("monitor", "unknown"))
    return f"{monitor_id}:{workspace_id}"


def get_monitor_width(active_window, monitors):
    monitor_key = active_window.get("monitorID", active_window.get("monitor"))

    for monitor in monitors:
        if str(monitor.get("id")) == str(monitor_key) or monitor.get("name") == monitor_key:
            width = monitor.get("width")
            if isinstance(width, (int, float)) and width > 0:
                return float(width)

    return None


def get_window_width(active_window):
    size = active_window.get("size") or []
    if len(size) >= 1 and isinstance(size[0], (int, float)) and size[0] > 0:
        return float(size[0])
    return None


def get_state_path():
    cache_home = os.environ.get("XDG_CACHE_HOME") or os.path.join(Path.home(), ".cache")
    return Path(cache_home) / "hypr" / "colresize-toggle.json"


def get_theme_config_path():
    return Path.home() / ".config" / "hypr" / "themes" / "yorha" / "theme.conf"


def get_general_config_path():
    return Path.home() / ".config" / "hypr" / "land" / "general.conf"


def read_config_number(name, fallback):
    config_path = get_theme_config_path()

    try:
        content = config_path.read_text()
    except Exception:
        return fallback

    match = re.search(rf"\b{name}\s*=\s*([0-9.]+)", content)
    if not match:
        return fallback

    try:
        return float(match.group(1))
    except ValueError:
        return fallback


def read_hyprctl_option_number(name, fallback):
    try:
        option = hyprctl_json(f"getoption general:{name}")
    except Exception:
        return fallback

    for key in ("float", "int"):
        value = option.get(key)
        if isinstance(value, (int, float)):
            return float(value)

    return fallback


def read_explicit_widths():
    config_path = get_general_config_path()

    try:
        content = config_path.read_text()
    except Exception:
        return DEFAULT_EXPLICIT_WIDTHS

    match = re.search(r"explicit_column_widths\s*=\s*(.+)", content)
    if not match:
        return DEFAULT_EXPLICIT_WIDTHS

    widths = []
    for chunk in match.group(1).split(","):
        try:
            value = float(chunk.strip())
        except ValueError:
            continue

        if 0.0 < value <= 1.0:
            widths.append(value)

    return widths or DEFAULT_EXPLICIT_WIDTHS


def snap_to_configured_width(current_ratio, widths):
    nearest_width = min(widths, key=lambda value: abs(value - current_ratio))
    if abs(nearest_width - current_ratio) <= RATIO_TOLERANCE:
        return nearest_width
    return current_ratio


def load_state():
    state_path = get_state_path()

    try:
        return json.loads(state_path.read_text())
    except Exception:
        return {}


def save_state(state):
    state_path = get_state_path()
    state_path.parent.mkdir(parents=True, exist_ok=True)
    state_path.write_text(json.dumps(state, indent=2))


def main():
    try:
        active_window = hyprctl_json("activewindow")
        monitors = hyprctl_json("monitors")
    except subprocess.CalledProcessError as error:
        print(error, file=sys.stderr)
        return 1

    monitor_width = get_monitor_width(active_window, monitors)
    window_width = get_window_width(active_window)

    if not monitor_width or not window_width:
        return 1

    gaps_in = read_hyprctl_option_number("gaps_in", read_config_number("gaps_in", DEFAULT_GAPS_IN))
    gaps_out = read_hyprctl_option_number("gaps_out", read_config_number("gaps_out", DEFAULT_GAPS_OUT))
    border_size = read_hyprctl_option_number("border_size", read_config_number("border_size", DEFAULT_BORDER_SIZE))
    usable_monitor_width = max(1.0, monitor_width - 2.0 * gaps_out)
    estimated_column_width = window_width + gaps_in + 2.0 * border_size

    window_key = get_window_key(active_window)
    configured_widths = read_explicit_widths()
    current_ratio = max(0.05, min(1.0, estimated_column_width / usable_monitor_width))
    current_ratio = snap_to_configured_width(current_ratio, configured_widths)
    state = load_state()
    stored_ratio = float(state.get(window_key, {}).get("previous_ratio", FALLBACK_RATIO))

    if abs(current_ratio - ONE_RATIO) <= RATIO_TOLERANCE:
        target_ratio = stored_ratio
    else:
        state[window_key] = {"previous_ratio": current_ratio}
        save_state(state)
        target_ratio = ONE_RATIO

    try:
        hyprctl_dispatch("layoutmsg", f"colresize {target_ratio:.6f}")
    except subprocess.CalledProcessError as error:
        print(error, file=sys.stderr)
        return 1

    return 0


if __name__ == "__main__":
    raise SystemExit(main())
