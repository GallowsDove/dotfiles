import { Utils } from "./imports.js";

const { execAsync } = Utils;

const watched_hyprland_events = new Set([
  "activewindowv2",
  "closewindow",
  "configreloaded",
  "fullscreen",
  "openwindow",
]);

const is_true_fullscreen = (client) => {
  const internalFullscreenState = Number(client?.fullscreen);

  if (!Number.isNaN(internalFullscreenState)) {
    return internalFullscreenState >= 2;
  }

  const fullscreenMode = Number(client?.fullscreenMode);
  if (!Number.isNaN(fullscreenMode)) {
    return fullscreenMode >= 2;
  }

  return client?.fullscreen === true;
};

export const start_hyprland_shader_sync = (screen_shader_path) => {
  let hyprland_event_stream = null;

  const apply_screen_shader = (enabled) => {
    const command = enabled
      ? `hyprctl keyword decoration:screen_shader ${screen_shader_path}`
      : `hyprctl keyword decoration:screen_shader ''`;

    execAsync(["bash", "-lc", command])
      .then(print)
      .catch(print);
  };

  const sync_screen_shader = async () => {
    try {
      const activeWindow = JSON.parse(await execAsync(["hyprctl", "-j", "activewindow"]));
      apply_screen_shader(!is_true_fullscreen(activeWindow));
    } catch (error) {
      print(error);
    }
  };

  const start_hyprland_event_stream = () => {
    hyprland_event_stream?.force_exit();
    hyprland_event_stream = Utils.subprocess(
      [
        "python3",
        "-u",
        "-c",
        [
          "import os, socket, time",
          "path = f\"{os.environ['XDG_RUNTIME_DIR']}/hypr/{os.environ['HYPRLAND_INSTANCE_SIGNATURE']}/.socket2.sock\"",
          "while True:",
          "    try:",
          "        sock = socket.socket(socket.AF_UNIX, socket.SOCK_STREAM)",
          "        sock.connect(path)",
          "        file = sock.makefile('r', encoding='utf-8', errors='replace')",
          "        for line in file:",
          "            print(line, end='', flush=True)",
          "    except Exception as error:",
          "        print(error, flush=True)",
          "        time.sleep(1)",
        ].join("\n"),
      ],
      (output) => {
        for (const line of output.split("\n")) {
          if (!line || !line.includes(">>")) {
            continue;
          }

          const [eventName] = line.split(">>");
          if (watched_hyprland_events.has(eventName)) {
            sync_screen_shader();
          }
        }
      },
      (error) => print(error),
    );
  };

  start_hyprland_event_stream();
  sync_screen_shader();

  return () => {
    hyprland_event_stream?.force_exit();
  };
};