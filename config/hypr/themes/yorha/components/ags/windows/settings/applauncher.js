// importing
import {
  Widget,
  Utils,
  Variable,
  App,
  Applications,
  Hyprland,
} from "../../imports.js";
import { NierButton, NierButtonGroup } from "../../nier/buttons.js";

import {
  SCREEN_HEIGHT,
  arradd,
  arrremove,
} from "../../util.js";

const { Box, Label,Scrollable, Icon } = Widget;
const { Pango, Gdk, GLib } = imports.gi;
const MAX_SEARCH_RESULTS = 20;
const DEFAULT_APP_RESULTS = 12;
const APP_RESULTS_BATCH = 12;
const LAUNCH_ANIMATION_MS = 300;
const SETTINGS_CLOSE_DELAY_MS = 120;
const FOCUS_RETRY_COUNT = 20;
const FOCUS_RETRY_DELAY_MS = 100;
const KITTY_COMMAND = "kitty";
const APP_LAUNCH_HISTORY_PATH = `${App.configDir}/app-launch-counts.json`;

let launchCounts = {};
let cachedAppList = null;

try {
  launchCounts = JSON.parse(Utils.readFile(APP_LAUNCH_HISTORY_PATH));
} catch {
  launchCounts = {};
}

const getAppKey = (appInfo) =>
  appInfo?.app?.get_id?.() ||
  appInfo?.app?.get_string?.("Desktop Entry") ||
  appInfo?.executable ||
  appInfo?.name ||
  "";

const getLaunchCount = (appInfo) => launchCounts[getAppKey(appInfo)] || 0;

const sortAppsByLaunchCount = (apps) =>
  apps.slice().sort((left, right) => {
    const countDelta = getLaunchCount(right) - getLaunchCount(left);
    if (countDelta !== 0) {
      return countDelta;
    }

    return (left.name || "").localeCompare(right.name || "");
  });

const persistLaunchCounts = () =>
  Utils.writeFile(JSON.stringify(launchCounts), APP_LAUNCH_HISTORY_PATH).catch(console.log);

const getAppList = () => {
  if (!cachedAppList) {
    cachedAppList = sortAppsByLaunchCount(Applications.list.slice());
  }

  return cachedAppList;
};
const getSearchResults = (query) => {
  if (!query) {
    return getAppList();
  }

  return sortAppsByLaunchCount(Applications.query(query));
};

const getCommandProgram = (command) => command?.trim().split(/\s+/)[0] || null;

const commandExists = (command) => {
  const program = getCommandProgram(command);
  return Boolean(program && GLib.find_program_in_path(program));
};

const sanitizeExecCommand = (command) =>
  (command || "")
    .replace(/%%/g, "__PERCENT__")
    .replace(/%[A-Za-z]/g, "")
    .replace(/__PERCENT__/g, "%")
    .replace(/\s+/g, " ")
    .trim();

const getAppExecCommand = (appInfo) => {
  const desktopAppInfo = appInfo?.app;

  return sanitizeExecCommand(
    desktopAppInfo?.get_commandline?.() ||
      desktopAppInfo?.get_string?.("Exec") ||
      appInfo?.executable ||
      ""
  );
};

const getTerminalLaunchCommand = (command) => {
  if (!commandExists(KITTY_COMMAND)) {
    return null;
  }

  return `${KITTY_COMMAND} -e sh -lc ${GLib.shell_quote(command)}`;
};

const delay = (ms) =>
  new Promise((resolve) => {
    setTimeout(resolve, ms);
  });

const getClients = async () =>
  JSON.parse(await Utils.execAsync(["hyprctl", "clients", "-j"]));

const normalizeMatchValue = (value) => String(value || "").trim().toLowerCase();

const getAppMatchMetadata = (appInfo) => ({
  appId: normalizeMatchValue(appInfo?.app?.get_id?.()),
  executable: normalizeMatchValue(getCommandProgram(appInfo?.executable)),
  name: normalizeMatchValue(appInfo?.name),
  startupWmClass: normalizeMatchValue(appInfo?.app?.get_string?.("StartupWMClass")),
});

const matchesLaunchedApp = (client, appInfo) => {
  const metadata = getAppMatchMetadata(appInfo);
  const clientClass = normalizeMatchValue(client?.class);
  const clientInitialClass = normalizeMatchValue(client?.initialClass);
  const clientTitle = normalizeMatchValue(client?.title);

  if (metadata.startupWmClass) {
    return clientClass === metadata.startupWmClass || clientInitialClass === metadata.startupWmClass;
  }

  if (metadata.appId) {
    const desktopId = metadata.appId.replace(/\.desktop$/, "");
    if (
      clientClass === desktopId ||
      clientInitialClass === desktopId ||
      clientClass.includes(desktopId) ||
      clientInitialClass.includes(desktopId)
    ) {
      return true;
    }
  }

  if (metadata.executable) {
    if (
      clientClass === metadata.executable ||
      clientInitialClass === metadata.executable ||
      clientClass.includes(metadata.executable) ||
      clientInitialClass.includes(metadata.executable)
    ) {
      return true;
    }
  }

  return Boolean(metadata.name) && clientTitle.includes(metadata.name);
};

const launchCommandWithPid = async (command) => {
  if (!command) {
    return null;
  }

  try {
    const result = await Utils.execAsync([
      "bash",
      "-lc",
      `${command} >/dev/null 2>&1 & echo $!`,
    ]);
    const pid = Number(String(result).trim());
    return Number.isFinite(pid) && pid > 0 ? pid : null;
  } catch (error) {
    console.log(error);
    return null;
  }
};

const focusLaunchedWindow = async ({ appInfo, existingAddresses, pid = null }) => {
  const existingAddressSet = new Set(existingAddresses);

  for (let attempt = 0; attempt < FOCUS_RETRY_COUNT; attempt++) {
    try {
      const clients = await getClients();
      const newClients = clients
        .filter((client) => !existingAddressSet.has(client.address))
        .filter((client) => client.mapped && !client.hidden)
        .sort((left, right) => (left.focusHistoryID ?? Number.MAX_SAFE_INTEGER) - (right.focusHistoryID ?? Number.MAX_SAFE_INTEGER));
      const matchingNewClient = newClients.find((client) => matchesLaunchedApp(client, appInfo));

      if (matchingNewClient) {
        await Hyprland.messageAsync(`dispatch focuswindow address:${matchingNewClient.address}`);
        return;
      }

      if (newClients.length > 0) {
        await Hyprland.messageAsync(`dispatch focuswindow address:${newClients[0].address}`);
        return;
      }

      if (pid) {
        const pidClient = clients.find((client) => client.pid === pid);

        if (pidClient) {
          await Hyprland.messageAsync(`dispatch focuswindow address:${pidClient.address}`);
          return;
        }
      }
    } catch (error) {
      console.log(error);
    }

    await delay(FOCUS_RETRY_DELAY_MS);
  }
};

export const AppLauncher = ({
  allApps = Variable([], {}),
  assetsDir = null
}) => {
  let entryWidget;
  let scrollWindow;
  let buttonGroup;
  let launcherVisible = false;
  let currentQuery = "";
  let currentResults = [];
  let visibleResultCount = 0;
  let preservedScrollValue = null;
  let restoringScrollPosition = false;
  let selectedIndex = -1;
  let resultButtons = [];

  const clearButtons = () => {
    resultButtons = [];
    selectedIndex = -1;

    if (buttonGroup?.children?.[1]) {
      buttonGroup.children[1].children = [];
    }
  };

  const getVisibleResultLimit = (query) =>
    query ? MAX_SEARCH_RESULTS : DEFAULT_APP_RESULTS;

  const applyVisibleResults = () => {
    allApps.setValue(currentResults.slice(0, visibleResultCount));
  };

  const preserveScrollPosition = () => {
    if (!scrollWindow) {
      preservedScrollValue = null;
      return;
    }

    const adjustment = scrollWindow.get_vadjustment();
    preservedScrollValue = adjustment ? adjustment.get_value() : null;
  };

  const restoreScrollPosition = () => {
    if (preservedScrollValue === null || !scrollWindow) {
      return;
    }

    Utils.timeout(1, () => {
      const adjustment = scrollWindow.get_vadjustment();
      if (!adjustment) {
        preservedScrollValue = null;
        return;
      }

      restoringScrollPosition = true;
      adjustment.set_value(
        Math.min(
          preservedScrollValue,
          Math.max(0, adjustment.get_upper() - adjustment.get_page_size()),
        ),
      );
      restoringScrollPosition = false;
      preservedScrollValue = null;
    });
  };

  const loadMoreResults = () => {
    if (visibleResultCount >= currentResults.length) {
      return false;
    }

    preserveScrollPosition();
    visibleResultCount = Math.min(
      visibleResultCount + APP_RESULTS_BATCH,
      currentResults.length,
    );
    applyVisibleResults();
    return true;
  };

  const maybeLoadMoreFromScroll = () => {
    if (!launcherVisible || !scrollWindow || restoringScrollPosition) {
      return;
    }

    const adjustment = scrollWindow.get_vadjustment();
    if (!adjustment) {
      return;
    }

    const visibleBottom = adjustment.get_value() + adjustment.get_page_size();
    const maxBottom = adjustment.get_upper();

    if (visibleBottom >= maxBottom - 8) {
      loadMoreResults();
    }
  };

  const updateAppResults = (query = "") => {
    if (!launcherVisible) {
      currentQuery = "";
      currentResults = [];
      visibleResultCount = 0;
      allApps.setValue([]);
      clearButtons();
      return;
    }

    currentQuery = query.trim();
    currentResults = getSearchResults(currentQuery);
    visibleResultCount = Math.min(
      getVisibleResultLimit(currentQuery),
      currentResults.length,
    );
    applyVisibleResults();
  };

  const setButtonHoverState = (buttonWidget, hovered) => {
    if (!buttonWidget?.child?.children?.[1]?.child) {
      return;
    }

    const cursor = buttonWidget.child.children[0];
    const eventBox = buttonWidget.child.children[1];
    const box = eventBox.child;
    const top = box.startWidget;
    const center = box.centerWidget;
    const bottom = box.endWidget;

    if (hovered) {
      center.classNames = arradd(center.classNames, "nier-button-hover");
      box.classNames = arradd(box.classNames, "nier-button-box-hover");
      top.classNames = arradd(top.classNames, "nier-button-top-hover");
      bottom.classNames = arradd(bottom.classNames, "nier-button-bottom-hover");
      cursor.classNames = [
        "nier-button-hover-icon",
        "nier-button-hover-icon-visible",
      ];
      return;
    }

    center.classNames = arrremove(center.classNames, "nier-button-hover");
    box.classNames = arrremove(box.classNames, "nier-button-box-hover");
    top.classNames = arrremove(top.classNames, "nier-button-top-hover");
    bottom.classNames = arrremove(bottom.classNames, "nier-button-bottom-hover");
    cursor.classNames = [
      "nier-button-hover-icon",
      "nier-button-hover-icon-hidden",
    ];
  };

  const syncSelectedButton = () => {
    resultButtons.forEach((buttonWidget, index) => {
      setButtonHoverState(buttonWidget, index === selectedIndex);
    });
  };

  const scrollSelectedButtonIntoView = () => {
    if (!scrollWindow || selectedIndex < 0 || selectedIndex >= resultButtons.length) {
      return;
    }

    Utils.timeout(1, () => {
      const buttonWidget = resultButtons[selectedIndex];
      const adjustment = scrollWindow.get_vadjustment();

      if (!buttonWidget || !adjustment) {
        return;
      }

      const allocation = buttonWidget.get_allocation();
      const visibleTop = adjustment.get_value();
      const visibleBottom = visibleTop + adjustment.get_page_size();
      const buttonTop = allocation.y;
      const buttonBottom = buttonTop + allocation.height;

      if (buttonTop < visibleTop) {
        adjustment.set_value(buttonTop);
        return;
      }

      if (buttonBottom > visibleBottom) {
        adjustment.set_value(buttonBottom - adjustment.get_page_size());
      }
    });
  };

  const setSelectedIndex = (index) => {
    if (resultButtons.length === 0) {
      selectedIndex = -1;
      return;
    }

    selectedIndex = Math.max(0, Math.min(index, resultButtons.length - 1));
    syncSelectedButton();
    scrollSelectedButtonIntoView();

    if (selectedIndex === resultButtons.length - 1) {
      loadMoreResults();
    }
  };

  const resetSearch = () => {
    entryWidget.text = "";
    updateAppResults();
  };

  const resetLauncherState = ({ focusEntry = false } = {}) => {
    resetSearch();

    const nextApps = allApps.value;
    selectedIndex = nextApps.length > 0 ? 0 : -1;

    if (focusEntry) {
      Utils.timeout(1, () => {
        entryWidget.grab_focus();
      });
    }
  };

  const animateLaunch = async (button) => {
    button.classNames = arradd(
      button.classNames,
      "nier-button-box-selected"
    );
    await new Promise((resolve) => {
      setTimeout(resolve, LAUNCH_ANIMATION_MS);
    });
    button.classNames = arrremove(
      button.classNames,
      "nier-button-box-selected"
    );
    button.classNames = arradd(
      button.classNames,
      "nier-button-box-hover-from-selected"
    );
    await new Promise((resolve) => {
      setTimeout(resolve, LAUNCH_ANIMATION_MS);
    });
    button.classNames = arrremove(
      button.classNames,
      "nier-button-box-hover-from-selected"
    );
  };

  const recordAppLaunch = (appInfo) => {
    const appKey = getAppKey(appInfo);

    if (!appKey) {
      return;
    }

    launchCounts[appKey] = getLaunchCount(appInfo) + 1;
    cachedAppList = null;
    persistLaunchCounts();
  };

  const launchApp = async (appInfo, button = null) => {
    if (!appInfo) {
      return;
    }

    let existingAddresses = [];
    try {
      existingAddresses = (await getClients()).map((client) => client.address);
    } catch (error) {
      console.log(error);
    }

    const desktopAppInfo = appInfo.app;
    const isTerminalApp = Boolean(
      desktopAppInfo && desktopAppInfo.get_boolean && desktopAppInfo.get_boolean("Terminal")
    );
    const execCommand = getAppExecCommand(appInfo);
    const launchCommand = getTerminalLaunchCommand(execCommand) || execCommand || appInfo.executable;

    let animationPromise = null;
    if (button) {
      animationPromise = animateLaunch(button).catch((error) => {
        console.log(error);
      });
    }

    await delay(SETTINGS_CLOSE_DELAY_MS);

    App.closeWindow("settings");

    await delay(FOCUS_RETRY_DELAY_MS);

    let launchedPid = null;

    if (isTerminalApp) {
      launchedPid = launchCommand
        ? await launchCommandWithPid(launchCommand)
        : null;
    } else {
      try {
        appInfo.launch();
      } catch (error) {
        console.log(error);

        if (launchCommand) {
          launchedPid = await launchCommandWithPid(launchCommand);
        }
      }
    }

    focusLaunchedWindow({
      appInfo,
      existingAddresses,
      pid: launchedPid,
    }).catch((error) => {
      console.log(error);
    });

    recordAppLaunch(appInfo);

    await animationPromise;
  };

  const buildAppButton = (app, fontSize) =>
    NierButton({
      useAssetsDir: assetsDir,
      font_size: fontSize,
      label: app.name,
      labelOveride: (label, font_size, max_label_chars) =>
        Box({
          children: [
            Icon({
              classNames: ["app-launcher-icon"],
              size: 20,
              icon: app.app?.get_icon()?.to_string(),
            }),
            Label({
              classNames: ["app-launcher-label"],
              css: `font-size: ${font_size}px;`,
              wrap: true,
              label: label,
              setup: (self) =>
                Utils.timeout(1, () => {
                  self.set_ellipsize(Pango.EllipsizeMode.END);
                  self.set_line_wrap(true);
                }),
            }),
          ],
        }),
      handleClick: async (button, event) => {
        await launchApp(app, button);
      },
    });

  const refreshButtons = (self, fontSize) => {
    if (!launcherVisible) {
      clearButtons();
      return;
    }

    let buttons = self.children[1];
    resultButtons = allApps.value.map((app) => buildAppButton(app, fontSize));
    buttons.children = resultButtons;

    if (resultButtons.length === 0) {
      selectedIndex = -1;
      return;
    }

    if (selectedIndex < 0 || selectedIndex >= resultButtons.length) {
      selectedIndex = 0;
    }

    syncSelectedButton();
    scrollSelectedButtonIntoView();
    restoreScrollPosition();
  };

  const launchSelectedApp = () => {
    const appToLaunch =
      selectedIndex >= 0 ? allApps.value[selectedIndex] : allApps.value[0];
    launchApp(appToLaunch);
  };

  entryWidget = Widget.Entry({
    classNames: ["app-launcher-search"],
    placeholderText: "search apps",
    text: "",
    visibility: true,
    setup: (self) =>
      Utils.timeout(1, () => {
        self.connect("key-press-event", (entry, event) => {
          const keyval = event.get_keyval()[1];

          if (keyval === Gdk.KEY_Down) {
            setSelectedIndex(selectedIndex < 0 ? 0 : selectedIndex + 1);
            return true;
          }

          if (keyval === Gdk.KEY_Up) {
            setSelectedIndex(
              selectedIndex < 0 ? resultButtons.length - 1 : selectedIndex - 1
            );
            return true;
          }

          return false;
        });
      }),
    onChange: ({ text }) => {
      updateAppResults(text);
    },
    onAccept: ({ text }) => {
      launchSelectedApp();
    },
  });
  
  return Box({
    vertical: true,
    classNames: ["app-launcher"],
    connections: [
      [
        App,
        (_, windowName, visible) => {
          if (windowName !== "settings") {
            return;
          }

          launcherVisible = visible;

          if (!visible) {
            clearButtons();
            allApps.setValue([]);
            entryWidget.text = "";
            return;
          }

          resetLauncherState({ focusEntry: visible });
        },
        "window-toggled",
      ],
    ],
    children: [
      entryWidget,
      Scrollable({
        setup: (self) => {
          scrollWindow = self;

          const connectAdjustment = () => {
            const adjustment = self.get_vadjustment();
            if (!adjustment || adjustment._yorhaLoadMoreConnected) {
              return;
            }

            adjustment._yorhaLoadMoreConnected = true;
            adjustment.connect("value-changed", () => {
              maybeLoadMoreFromScroll();
            });
          };

          connectAdjustment();
          Utils.timeout(1, connectAdjustment);
        },
        vscroll: "always",
        hscroll: "never",
        hexpand: true,
        hpack: "fill",
        classNames: ["app-launcher-scroll"],
        css: `min-height: ${Math.round(SCREEN_HEIGHT/3)}px;`,

        child: Box({
          vertical: true,
          children: [
            NierButtonGroup({
              connections: [
                [
                  allApps,
                  (self) => {
                    refreshButtons(self, 25);
                  },
                ],
              ],
              setup: (self) => {
                buttonGroup = self;
              },
            }),
          ],
        }),
      }),
    ],
  });
}
