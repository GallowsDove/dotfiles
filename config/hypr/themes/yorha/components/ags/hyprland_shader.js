import { Utils } from "./imports.js";
import { createCubicBezier } from "./hyprland_shader/bezier.js";
import {
  buildOpenWindowShader,
  MAX_ACTIVE_OPEN_WINDOW_ANIMATIONS,
  OPEN_WINDOW_ANIMATION_STEPS,
  OPEN_WINDOW_EFFECTS,
} from "./hyprland_shader/effects.js";
import {
  getStableClientForAnimation,
  isTrueFullscreen,
  normalizeWindowAddress,
  normalizeWindowBoxFromState,
  shouldAnimateWindow,
  wait,
  watchedHyprlandEvents,
} from "./hyprland_shader/windowing.js";

const { execAsync } = Utils;

const getEffectEase = (effectId) => {
  const effect = OPEN_WINDOW_EFFECTS[effectId];
  if (!effect.ease) {
    effect.ease = createCubicBezier(...effect.easeBezier);
  }

  return effect.ease;
};

export const start_hyprland_shader_sync = (
  screenShaderPath,
  openWindowTemplatePath = "",
  openWindowRuntimePath = "",
  openWindowAnimation = "scanline",
  openWindowAnimationDurationScale = 1,
) => {
  let hyprlandEventStream = null;
  let animationLoopRunning = false;
  let activeWindowAnimations = [];
  let cachedOpenWindowTemplate = "";
  let cachedMonitors = null;

  const selectedOpenWindowEffect = OPEN_WINDOW_EFFECTS[openWindowAnimation]
    ? openWindowAnimation
    : "scanline";
  const durationScale = Number.isFinite(Number(openWindowAnimationDurationScale))
    ? Math.max(0.25, Number(openWindowAnimationDurationScale))
    : 1;
  const openWindowAnimationEnabled = Boolean(
    openWindowAnimation !== "none"
    && openWindowTemplatePath
    && openWindowRuntimePath
  );

  const applyScreenShader = async (path) => {
    try {
      await execAsync(["hyprctl", "keyword", "decoration:screen_shader", path]);
    } catch (error) {
      print(error);
    }
  };

  const getOpenWindowTemplate = () => {
    if (!openWindowAnimationEnabled) {
      return "";
    }

    if (!cachedOpenWindowTemplate) {
      cachedOpenWindowTemplate = Utils.readFile(openWindowTemplatePath) || "";
    }

    return cachedOpenWindowTemplate;
  };

  const refreshCachedMonitors = async () => {
    try {
      cachedMonitors = JSON.parse(await execAsync(["hyprctl", "-j", "monitors"]));
    } catch (error) {
      print(error);
      cachedMonitors = null;
    }

    return cachedMonitors;
  };

  const getCachedMonitors = async () => cachedMonitors ?? refreshCachedMonitors();

  const syncScreenShader = async () => {
    if (animationLoopRunning || activeWindowAnimations.length > 0) {
      return;
    }

    try {
      const activeWindow = JSON.parse(await execAsync(["hyprctl", "-j", "activewindow"]));
      await applyScreenShader(isTrueFullscreen(activeWindow) ? "" : screenShaderPath);
    } catch (error) {
      print(error);
    }
  };

  const renderActiveWindowAnimations = async () => {
    try {
      if (activeWindowAnimations.length === 0) {
        return;
      }

      const template = getOpenWindowTemplate();
      if (!template) {
        return;
      }

      const now = Date.now();
      const clients = JSON.parse(await execAsync(["hyprctl", "-j", "clients"]));
      const monitors = await getCachedMonitors();
      if (!monitors) {
        return;
      }
      const clientsByAddress = new Map(clients.map((client) => [
        normalizeWindowAddress(client?.address),
        client,
      ]));

      const renderableAnimations = activeWindowAnimations
        .map((animation) => {
          const effect = OPEN_WINDOW_EFFECTS[animation.effectId];
          const elapsed = now - animation.startedAt;
          const linearProgress = Math.min(1, Math.max(0, elapsed / (effect.durationMs * durationScale)));
          const client = clientsByAddress.get(animation.address) ?? null;
          const nextBox = client && shouldAnimateWindow(client)
            ? normalizeWindowBoxFromState(client, monitors) ?? animation.box
            : animation.box;

          return {
            ...animation,
            box: nextBox,
            linearProgress,
            progress: getEffectEase(animation.effectId)(linearProgress),
          };
        })
        .filter(({ linearProgress }) => linearProgress < 1);

      activeWindowAnimations = renderableAnimations.map(({ linearProgress, ...animation }) => animation);

      if (activeWindowAnimations.length === 0) {
        await syncScreenShader();
        return;
      }

      const shader = buildOpenWindowShader(template, activeWindowAnimations);
      await Utils.writeFile(shader, openWindowRuntimePath);
      await applyScreenShader(openWindowRuntimePath);
    } catch (error) {
      print(error);
    }
  };

  const ensureOpenWindowAnimationLoop = () => {
    if (animationLoopRunning) {
      return;
    }

    animationLoopRunning = true;

    (async () => {
      try {
        const frameDelay = Math.max(4, Math.round(1000 / OPEN_WINDOW_ANIMATION_STEPS));

        while (activeWindowAnimations.length > 0) {
          await renderActiveWindowAnimations();

          if (activeWindowAnimations.length > 0) {
            await wait(Utils, frameDelay);
          }
        }
      } catch (error) {
        print(error);
      } finally {
        animationLoopRunning = false;
        if (activeWindowAnimations.length === 0) {
          await syncScreenShader();
        } else {
          ensureOpenWindowAnimationLoop();
        }
      }
    })();
  };

  const playOpenWindowAnimation = async (windowAddress = "") => {
    if (!openWindowAnimationEnabled) {
      return;
    }

    try {
      const targetWindow = await getStableClientForAnimation(execAsync, Utils, windowAddress);
      if (!shouldAnimateWindow(targetWindow)) {
        return;
      }

      const monitors = await getCachedMonitors();
      const normalizedBox = monitors
        ? normalizeWindowBoxFromState(targetWindow, monitors)
        : null;
      if (!normalizedBox) {
        return;
      }

      const normalizedAddress = normalizeWindowAddress(windowAddress);
      const effect = OPEN_WINDOW_EFFECTS[selectedOpenWindowEffect];
      const effectState = effect.createState?.(targetWindow, normalizedAddress) ?? {};

      activeWindowAnimations = activeWindowAnimations
        .filter((animation) => animation.address !== normalizedAddress)
        .concat({
          address: normalizedAddress,
          effectId: selectedOpenWindowEffect,
          box: normalizedBox,
          startedAt: Date.now(),
          ...effectState,
        })
        .slice(-MAX_ACTIVE_OPEN_WINDOW_ANIMATIONS);

      ensureOpenWindowAnimationLoop();
    } catch (error) {
      print(error);
    }
  };

  const stopOpenWindowAnimation = async (windowAddress = "") => {
    const normalizedAddress = normalizeWindowAddress(windowAddress);
    if (!normalizedAddress) {
      return;
    }

    const nextAnimations = activeWindowAnimations
      .filter((animation) => animation.address !== normalizedAddress);

    if (nextAnimations.length === activeWindowAnimations.length) {
      return;
    }

    activeWindowAnimations = nextAnimations;

    if (activeWindowAnimations.length === 0) {
      await syncScreenShader();
    }
  };

  const startHyprlandEventStream = () => {
    hyprlandEventStream?.force_exit();
    hyprlandEventStream = Utils.subprocess(
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

          const [eventName, eventData = ""] = line.split(">>");
          if (eventName === "openwindow" && openWindowAnimationEnabled) {
            const [windowAddress] = eventData.split(",");
            playOpenWindowAnimation(windowAddress);
            continue;
          }

          if (eventName === "closewindow") {
            const [windowAddress] = eventData.split(",");
            stopOpenWindowAnimation(windowAddress);
            syncScreenShader();
            continue;
          }

          if (eventName === "configreloaded") {
            cachedOpenWindowTemplate = "";
            refreshCachedMonitors();
          }

          if (watchedHyprlandEvents.has(eventName)) {
            syncScreenShader();
          }
        }
      },
      (error) => print(error),
    );
  };

  startHyprlandEventStream();
  refreshCachedMonitors();
  syncScreenShader();

  return () => {
    hyprlandEventStream?.force_exit();
  };
};
