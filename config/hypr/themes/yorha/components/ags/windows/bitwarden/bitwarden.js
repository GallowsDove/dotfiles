import { App, Widget, Utils } from "../../imports.js";
import { NierButton, NierButtonGroup } from "../../nier/buttons.js";
import { SCREEN_HEIGHT, SCREEN_WIDTH, arradd, arrremove, dark } from "../../util.js";

const { Window, Box, Label, EventBox, Overlay, Scrollable, Icon } = Widget;
const { Gdk, GLib, Pango } = imports.gi;

const POPUP_WIDTH = 520;
const POPUP_HEIGHT = 700;
const DEFAULT_VISIBLE_RESULTS = 16;
const SEARCH_VISIBLE_RESULTS = 32;
const RESULTS_BATCH = 16;
const BROWSER_CLASS_PATTERN = /(librewolf|firefox|chromium|chrome|brave|vivaldi|zen)/i;
const STATUS_INITIAL = "Checking rbw state...";
const VIEW_VAULT = "vault";
const VIEW_ACTIONS = "actions";

const parentConfigDir = App.configDir.split("/").slice(0, -2).join("/");
const css = `${parentConfigDir}/style/style.css`;
const parentAssetsDir = () => `${parentConfigDir}/assets/${dark.value ? "dark" : "light"}`;

const runShell = (command) => Utils.execAsync(["bash", "-lc", command]);
const shellQuote = (value) => GLib.shell_quote(String(value ?? ""));
const normalizeSearch = (value) =>
  String(value ?? "")
    .normalize("NFD")
    .replace(/[\u0300-\u036f]/g, "")
    .toLowerCase();

const state = {
  entryWidget: null,
  resultGroup: null,
  resultButtons: [],
  resultsScroll: null,
  statusLabel: null,
  selectedIndex: -1,
  currentItems: [],
  filteredItems: [],
  vaultItems: [],
  historyItems: [],
  itemDetails: {},
  currentView: VIEW_VAULT,
  currentQuery: "",
  vaultQuery: "",
  activeItem: null,
  visibleResultCount: 0,
  preservedScrollValue: null,
  restoringScrollPosition: false,
  vaultUnlocked: false,
  loadingVault: false,
  statusMessage: STATUS_INITIAL,
};

const panelCss = () => `
  min-width: ${POPUP_WIDTH}px;
  min-height: ${POPUP_HEIGHT}px;
  background: rgba(${dark.value ? "69, 67, 58, 0.94" : "194, 189, 166, 0.96"});
  border: 2px solid rgba(${dark.value ? "244, 240, 225, 0.18" : "72, 70, 61, 0.22"});
  padding: 28px 32px;
`;

const titleCss = () => `
  font-size: 44px;
  font-weight: 700;
  letter-spacing: 0.08em;
  color: ${dark.value ? "#f4f0e1" : "#48463d"};
`;

const bodyCss = () => `
  font-size: 18px;
  color: ${dark.value ? "rgba(244, 240, 225, 0.82)" : "rgba(72, 70, 61, 0.82)"};
`;

const setStatus = (value) => {
  state.statusMessage = value;
  if (state.statusLabel) {
    state.statusLabel.label = value;
  }
};

const getItemKey = (item) => `${item?.action || ""}:${item?.id || ""}`;
const getItemDetails = (item) => state.itemDetails[item?.id] || null;
const setItemDetails = (itemId, details) => {
  state.itemDetails = {
    ...state.itemDetails,
    [itemId]: {
      ...(state.itemDetails[itemId] || {}),
      ...details,
    },
  };
};

const resetViewState = () => {
  state.currentView = VIEW_VAULT;
  state.activeItem = null;
  state.historyItems = [];
  state.itemDetails = {};
  state.currentQuery = "";
  state.vaultQuery = "";
  if (state.entryWidget) {
    state.entryWidget.text = "";
  }
};

const resetPopupState = () => {
  resetViewState();
  state.loadingVault = false;
  refreshDisplayedItems();
};

const beginOpenState = () => {
  resetViewState();
  state.vaultUnlocked = false;
  state.vaultItems = [];
  state.loadingVault = true;
  refreshDisplayedItems();
};

const getActionItems = () => {
  const item = state.activeItem;
  const details = getItemDetails(item);
  const hasUsername = Boolean(item?.user && item.user !== "No username");
  const hasTotp = Boolean(details?.hasTotp);

  return [
    {
      id: `type-login:${item.id}`,
      name: "Type login",
      user: "Username + password for browser windows",
      action: "type-login",
      item,
    },
    ...(hasUsername
      ? [{
          id: `copy-username:${item.id}`,
          name: "Copy username",
          user: "Copy username to clipboard",
          action: "copy-username",
          item,
        }]
      : []),
    {
      id: `copy-password:${item.id}`,
      name: "Copy password",
      user: "Copy password to clipboard",
      action: "copy-password",
      item,
    },
    ...(hasTotp
      ? [{
          id: `copy-totp:${item.id}`,
          name: "Copy TOTP",
          user: "Copy current TOTP to clipboard",
          action: "copy-totp",
          item,
        }]
      : []),
    ...(hasUsername
      ? [{
          id: `type-username:${item.id}`,
          name: "Type username",
          user: "Type username into focused window",
          action: "type-username",
          item,
        }]
      : []),
    {
      id: `type-password:${item.id}`,
      name: "Type password",
      user: "Type password into focused window",
      action: "type-password",
      item,
    },
    ...(hasTotp
      ? [{
          id: `type-totp:${item.id}`,
          name: "Type TOTP",
          user: "Type current TOTP into focused window",
          action: "type-totp",
          item,
        }]
      : []),
    ...state.historyItems.map((entry) => ({
      id: `history:${item.id}:${entry.date}`,
      name: entry.date,
      user: "Copy historical password",
      action: "history-password",
      item,
      historyEntry: entry,
    })),
    {
      id: `back:${item.id}`,
      name: "Back to vault",
      user: item.name,
      action: "back",
    },
  ];
};

const getVaultItems = () => {
  if (state.loadingVault) {
    return [];
  }

  if (!state.vaultUnlocked) {
    return [
      {
        id: "unlock",
        name: "Unlock vault",
        user: "Open rbw unlock and come back",
        action: "unlock",
      },
    ];
  }

  return [
    {
      id: "sync",
      name: "Sync vault",
      user: "Run rbw sync and refresh entries",
      action: "sync",
    },
    ...state.vaultItems,
  ];
};

const rebuildCurrentItems = () => {
  state.currentItems =
    state.currentView === VIEW_ACTIONS && state.activeItem
      ? getActionItems()
      : getVaultItems();
};

const getVisibleResultLimit = (query) =>
  Math.min(query.trim() ? SEARCH_VISIBLE_RESULTS : DEFAULT_VISIBLE_RESULTS, state.filteredItems.length);

const preserveScrollPosition = () => {
  if (!state.resultsScroll) {
    state.preservedScrollValue = null;
    return;
  }

  const adjustment = state.resultsScroll.get_vadjustment();
  state.preservedScrollValue = adjustment ? adjustment.get_value() : null;
};

const restoreScrollPosition = () => {
  if (state.preservedScrollValue === null || !state.resultsScroll) {
    return;
  }

  Utils.timeout(1, () => {
    const adjustment = state.resultsScroll.get_vadjustment();
    if (!adjustment) {
      state.preservedScrollValue = null;
      return;
    }

    state.restoringScrollPosition = true;
    adjustment.set_value(
      Math.min(
        state.preservedScrollValue,
        Math.max(0, adjustment.get_upper() - adjustment.get_page_size())
      )
    );
    state.restoringScrollPosition = false;
    state.preservedScrollValue = null;
  });
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
  const container = buttonWidget;

  if (hovered) {
    center.classNames = arradd(center.classNames, "nier-button-hover");
    box.classNames = arradd(box.classNames, "nier-button-box-hover");
    top.classNames = arradd(top.classNames, "nier-button-top-hover");
    bottom.classNames = arradd(bottom.classNames, "nier-button-bottom-hover");
    cursor.classNames = ["nier-button-hover-icon", "nier-button-hover-icon-visible"];
    container.classNames = arradd(container.classNames, "nier-button-container-hover");
    return;
  }

  center.classNames = arrremove(center.classNames, "nier-button-hover");
  box.classNames = arrremove(box.classNames, "nier-button-box-hover");
  top.classNames = arrremove(top.classNames, "nier-button-top-hover");
  bottom.classNames = arrremove(bottom.classNames, "nier-button-bottom-hover");
  cursor.classNames = ["nier-button-hover-icon", "nier-button-hover-icon-hidden"];
  container.classNames = arrremove(container.classNames, "nier-button-container-hover");
};

const syncSelectedButton = () => {
  state.resultButtons.forEach((buttonWidget, index) => {
    setButtonHoverState(buttonWidget, index === state.selectedIndex);
  });
};

const scrollSelectedButtonIntoView = () => {
  if (
    !state.resultsScroll
    || state.selectedIndex < 0
    || state.selectedIndex >= state.resultButtons.length
  ) {
    return;
  }

  Utils.timeout(1, () => {
    const buttonWidget = state.resultButtons[state.selectedIndex];
    const adjustment = state.resultsScroll.get_vadjustment();

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

const applyVisibleResults = () => {
  if (!state.resultGroup?.children?.[1]) {
    return;
  }

  state.resultButtons = state.filteredItems
    .slice(0, state.visibleResultCount)
    .map(buildResultButton);

  state.resultGroup.children[1].children = state.resultButtons;

  if (state.resultButtons.length === 0) {
    state.selectedIndex = -1;
    return;
  }

  if (state.selectedIndex < 0 || state.selectedIndex >= state.resultButtons.length) {
    state.selectedIndex = 0;
  }

  syncSelectedButton();
  restoreScrollPosition();
  scrollSelectedButtonIntoView();
};

const renderResults = (
  query = "",
  { preserveSelectionKey = null, preserveVisibleCount = false, preserveScroll = false } = {}
) => {
  state.currentQuery = query;
  const normalized = normalizeSearch(query.trim());
  state.filteredItems = normalized
    ? state.currentItems.filter((item) =>
        normalizeSearch(`${item.name} ${item.user}`).includes(normalized)
      )
    : state.currentItems;

  state.visibleResultCount = preserveVisibleCount
    ? Math.min(
        Math.max(state.visibleResultCount, getVisibleResultLimit(query)),
        state.filteredItems.length
      )
    : getVisibleResultLimit(query);

  const nextIndex = preserveSelectionKey
    ? state.filteredItems.findIndex((item) => getItemKey(item) === preserveSelectionKey)
    : -1;

  state.selectedIndex =
    nextIndex >= 0
      ? nextIndex
      : state.filteredItems.length > 0
        ? 0
        : -1;

  if (preserveScroll) {
    preserveScrollPosition();
  }

  applyVisibleResults();
};

const refreshDisplayedItems = ({ preserveSelection = false, preserveScroll = false } = {}) => {
  const selectionKey =
    preserveSelection && state.selectedIndex >= 0
      ? getItemKey(state.filteredItems[state.selectedIndex])
      : null;

  rebuildCurrentItems();

  renderResults(state.currentView === VIEW_ACTIONS ? "" : state.vaultQuery, {
    preserveSelectionKey: selectionKey,
    preserveVisibleCount: preserveSelection,
    preserveScroll,
  });
};

const loadMoreResults = () => {
  if (state.visibleResultCount >= state.filteredItems.length) {
    return false;
  }

  preserveScrollPosition();
  state.visibleResultCount = Math.min(
    state.visibleResultCount + RESULTS_BATCH,
    state.filteredItems.length
  );
  applyVisibleResults();
  return true;
};

const maybeLoadMoreFromScroll = () => {
  if (!state.resultsScroll || state.restoringScrollPosition) {
    return;
  }

  const adjustment = state.resultsScroll.get_vadjustment();
  if (!adjustment) {
    return;
  }

  const visibleBottom = adjustment.get_value() + adjustment.get_page_size();
  const maxBottom = adjustment.get_upper();

  if (visibleBottom >= maxBottom - 8) {
    loadMoreResults();
  }
};

const setSelectedIndex = (index) => {
  if (state.resultButtons.length === 0) {
    state.selectedIndex = -1;
    return;
  }

  state.selectedIndex = Math.max(0, Math.min(index, state.resultButtons.length - 1));
  syncSelectedButton();
  scrollSelectedButtonIntoView();

  if (state.selectedIndex === state.resultButtons.length - 1) {
    loadMoreResults();
  }
};

const enterActionView = (item) => {
  if (!item || item.action !== "item") {
    return;
  }

  state.currentView = VIEW_ACTIONS;
  state.activeItem = item;
  state.historyItems = [];
  refreshDisplayedItems();
  ensureItemDetails(item).catch(console.log);
};

const leaveActionView = () => {
  state.currentView = VIEW_VAULT;
  state.activeItem = null;
  state.historyItems = [];
  refreshDisplayedItems();
};

const checkVaultUnlocked = async () => {
  try {
    await Utils.execAsync(["rbw", "unlocked"]);
    state.vaultUnlocked = true;
    return true;
  } catch {
    state.vaultUnlocked = false;
    return false;
  }
};

const mapVaultItem = (item) => {
  const folder = String(item?.folder || "");
  const name = String(item?.name || "");
  const user = String(item?.user || "");
  const displayName = folder ? `${folder}/${name}` : name;

  return {
    id: String(item?.id || displayName),
    name: displayName,
    user: user || "No username",
    action: "item",
  };
};

const setLockedVaultState = () => {
  state.vaultUnlocked = false;
  state.vaultItems = [];
  state.activeItem = null;
  state.historyItems = [];
  state.currentView = VIEW_VAULT;
  state.loadingVault = false;
  setStatus("Vault locked");
  refreshDisplayedItems({ preserveSelection: true, preserveScroll: true });
};

const loadVaultItems = async () => {
  if (!(await checkVaultUnlocked())) {
    setLockedVaultState();
    return;
  }

  setStatus("Loading vault entries...");

  try {
    const output = await Utils.execAsync(["rbw", "list", "--raw"]);
    const parsed = JSON.parse(output);

    state.vaultUnlocked = true;
    state.vaultItems = parsed.map(mapVaultItem).sort((left, right) => left.name.localeCompare(right.name));
    setStatus(state.vaultItems.length > 0 ? `${state.vaultItems.length} entries loaded` : "Vault is empty");
  } catch (error) {
    console.log(error);
    state.vaultUnlocked = false;
    state.vaultItems = [];
    setStatus("Vault locked");
  }

  state.loadingVault = false;
  refreshDisplayedItems({ preserveSelection: true, preserveScroll: true });
};

const openUnlockPrompt = async () => {
  setStatus("Opening rbw unlock...");

  try {
    App.closeWindow("bitwarden");
    await runShell("rbw unlock >/dev/null 2>&1 &");
    Utils.timeout(1200, () => {
      loadVaultItems().catch(console.log);
    });
  } catch (error) {
    console.log(error);
    setStatus("Failed to launch unlock prompt");
  }
};

const ensureVaultAvailable = async ({ promptUnlock = false } = {}) => {
  if (await checkVaultUnlocked()) {
    return true;
  }

  setLockedVaultState();

  if (promptUnlock) {
    await openUnlockPrompt();
  }

  return false;
};

const ensureItemDetails = async (item) => {
  if (!item?.id) {
    return;
  }

  const details = getItemDetails(item);
  if (details?.loading || details?.checked) {
    return;
  }

  setItemDetails(item.id, { loading: true, checked: false });

  try {
    const output = await runShell(
      `rbw get --field totp ${shellQuote(item.id)} 2>/dev/null || true; echo '___SEP___'; rbw history ${shellQuote(item.id)} 2>/dev/null | head -n 1 || true`
    );
    const parts = String(output).split("___SEP___");
    setItemDetails(item.id, {
      loading: false,
      checked: true,
      hasTotp: Boolean(parts[0]?.trim()),
      hasHistory: Boolean(parts[1]?.trim()),
    });
  } catch (error) {
    console.log(error);
    setItemDetails(item.id, {
      loading: false,
      checked: true,
      hasTotp: false,
      hasHistory: false,
    });
  }
};

const getActiveWindowClass = async () => {
  try {
    const activeWindow = JSON.parse(await Utils.execAsync(["hyprctl", "activewindow", "-j"]));
    return `${activeWindow?.class || ""} ${activeWindow?.initialClass || ""}`;
  } catch (error) {
    console.log(error);
    return "";
  }
};

const withVaultAccess = async (fn) => {
  if (!(await ensureVaultAvailable({ promptUnlock: true }))) {
    return false;
  }

  await fn();
  return true;
};

const typeLogin = async (item) => {
  if (!item?.id || item.action !== "item") {
    return;
  }

  setStatus(`Typing credentials for ${item.name}...`);

  try {
    const allowed = await withVaultAccess(async () => {
      const activeClass = await getActiveWindowClass();
      const shouldTypeUsername = BROWSER_CLASS_PATTERN.test(activeClass);
      const usernamePart = shouldTypeUsername
        ? `username=$(rbw get --field username ${shellQuote(item.id)} | tr -d '\\r\\n'); if [ -n "$username" ]; then printf '%s' "$username" | ydotool type -f -; ydotool key 15:1 15:0; fi; `
        : "";

      App.closeWindow("bitwarden");
      await runShell(
        `sleep 0.15; ${usernamePart}rbw get --field password ${shellQuote(item.id)} | tr -d '\\r\\n' | ydotool type -f -`
      );
    });

    if (allowed) {
      setStatus(`Typed credentials for ${item.name}`);
    }
  } catch (error) {
    console.log(error);
    setStatus(`Failed to type credentials for ${item.name}`);
  }
};

const copyField = async (item, field, label) => {
  try {
    const allowed = await withVaultAccess(async () => {
      App.closeWindow("bitwarden");
      await runShell(`rbw get --field ${shellQuote(field)} ${shellQuote(item.id)} | tr -d '\\r\\n' | wl-copy`);
      await runShell(`notify-send ${shellQuote("Bitwarden")} ${shellQuote(`Copied ${label} for ${item.name}`)}`);
    });

    if (allowed) {
      setStatus(`Copied ${label} for ${item.name}`);
    }
  } catch (error) {
    console.log(error);
    setStatus(`Failed to copy ${label}`);
  }
};

const typeField = async (item, field, label) => {
  try {
    const allowed = await withVaultAccess(async () => {
      App.closeWindow("bitwarden");
      await runShell(
        `sleep 0.15; rbw get --field ${shellQuote(field)} ${shellQuote(item.id)} | tr -d '\\r\\n' | ydotool type -f -`
      );
    });

    if (allowed) {
      setStatus(`Typed ${label} for ${item.name}`);
    }
  } catch (error) {
    console.log(error);
    setStatus(`Failed to type ${label}`);
  }
};

const loadHistory = async (item) => {
  setStatus(`Loading history for ${item.name}...`);

  try {
    const allowed = await withVaultAccess(async () => {
      const output = await Utils.execAsync(["rbw", "history", item.id]);
      state.historyItems = String(output)
        .split("\n")
        .filter(Boolean)
        .map((line) => {
          const idx = line.indexOf(": ");
          if (idx === -1) {
            return null;
          }

          return {
            date: line.slice(0, idx),
            password: line.slice(idx + 2),
          };
        })
        .filter(Boolean);
    });

    if (!allowed) {
      return;
    }

    setStatus(
      state.historyItems.length > 0
        ? `Loaded ${state.historyItems.length} history entries`
        : "No password history"
    );
    refreshDisplayedItems({ preserveSelection: true, preserveScroll: true });
  } catch (error) {
    console.log(error);
    state.historyItems = [];
    setStatus("Failed to load history");
  }
};

const copyHistoryPassword = async (entry) => {
  try {
    App.closeWindow("bitwarden");
    await runShell(`printf '%s' ${shellQuote(entry.password)} | wl-copy`);
    await runShell(`notify-send ${shellQuote("Bitwarden")} ${shellQuote(`Copied password from ${entry.date}`)}`);
    setStatus(`Copied password from ${entry.date}`);
  } catch (error) {
    console.log(error);
    setStatus("Failed to copy historical password");
  }
};

const syncVault = async () => {
  setStatus("Syncing vault...");

  try {
    if (!(await ensureVaultAvailable({ promptUnlock: true }))) {
      return;
    }

    await Utils.execAsync(["rbw", "sync"]);
    await loadVaultItems();
    setStatus("Vault synced");
  } catch (error) {
    console.log(error);
    setStatus("Vault sync failed");
  }
};

const ACTION_HANDLERS = {
  unlock: async () => openUnlockPrompt(),
  sync: async () => syncVault(),
  item: async (item) => typeLogin(item),
  back: async () => leaveActionView(),
  "type-login": async (item) => typeLogin(item.item),
  "copy-username": async (item) => copyField(item.item, "username", "username"),
  "copy-password": async (item) => copyField(item.item, "password", "password"),
  "copy-totp": async (item) => copyField(item.item, "totp", "TOTP"),
  "type-username": async (item) => typeField(item.item, "username", "username"),
  "type-password": async (item) => typeField(item.item, "password", "password"),
  "type-totp": async (item) => typeField(item.item, "totp", "TOTP"),
  "show-history": async (item) => loadHistory(item.item),
  "history-password": async (item) => copyHistoryPassword(item.historyEntry),
};

const activateItem = async (item) => {
  if (!item) {
    return;
  }

  const handler = ACTION_HANDLERS[item.action];
  if (handler) {
    await handler(item);
  }
};

const activateSelectedItem = async () => {
  await activateItem(state.filteredItems[state.selectedIndex]);
};

function buildResultButton(item) {
  return NierButton({
    useAssetsDir: parentAssetsDir,
    size: 28,
    font_size: 22,
    label: item.name,
    container_style: "margin-bottom: 8px;",
    css: "min-width: 0; margin-top: 0; margin-bottom: 0; margin-right: 0; padding-top: 0; padding-bottom: 0; padding-right: 0;",
    labelOveride: (label, fontSize) =>
      Box({
        vertical: true,
        css: "margin-left: 18px; margin-right: 8px;",
        children: [
          Label({
            css: `font-size: ${fontSize}px; padding-top: 4px; padding-bottom: 0;`,
            label,
            xalign: 0,
            wrap: true,
            setup: (self) =>
              Utils.timeout(1, () => {
                self.set_ellipsize(Pango.EllipsizeMode.END);
                self.set_line_wrap(true);
              }),
          }),
          Label({
            css: "font-size: 14px; opacity: 0.72; padding-top: 0; padding-bottom: 4px;",
            label: item.user,
            xalign: 0,
          }),
        ],
      }),
    handleClick: async (_, event) => {
      const index = state.filteredItems.findIndex((candidate) => candidate.id === item.id);
      if (index !== -1) {
        setSelectedIndex(index);
      }

      if (event?.get_button?.()[1] === 3 && item.action === "item") {
        enterActionView(item);
        return;
      }

      await activateItem(item);
    },
    setup: (self) =>
      Utils.timeout(1, () => {
        self.connect("enter-notify-event", () => {
          const index = state.filteredItems.findIndex((candidate) => candidate.id === item.id);
          if (index !== -1) {
            setSelectedIndex(index);
          }
        });
      }),
  });
}

const handleEntryKeyPress = (_, event) => {
  const keyval = event.get_keyval()[1];

  if (keyval === Gdk.KEY_Down) {
    setSelectedIndex(state.selectedIndex < 0 ? 0 : state.selectedIndex + 1);
    return true;
  }

  if (keyval === Gdk.KEY_Up) {
    setSelectedIndex(state.selectedIndex < 0 ? state.resultButtons.length - 1 : state.selectedIndex - 1);
    return true;
  }

  if (keyval === Gdk.KEY_Right) {
    const item = state.filteredItems[state.selectedIndex];
    if (item?.action === "item") {
      enterActionView(item);
      return true;
    }
    return false;
  }

  if (keyval === Gdk.KEY_Left) {
    if (state.currentView === VIEW_ACTIONS) {
      leaveActionView();
      return true;
    }
    return false;
  }

  if (keyval === Gdk.KEY_Return || keyval === Gdk.KEY_KP_Enter) {
    activateSelectedItem().catch(console.log);
    return true;
  }

  return false;
};

const handleSearchChange = ({ text }) => {
  if (state.currentView === VIEW_VAULT) {
    state.vaultQuery = text;
    renderResults(text);
    return;
  }

  renderResults("");
};

const connectScrollLoadMore = (self) => {
  state.resultsScroll = self;

  const connectAdjustment = () => {
    const adjustment = self.get_vadjustment();
    if (!adjustment || adjustment._bitwardenLoadMoreConnected) {
      return;
    }

    adjustment._bitwardenLoadMoreConnected = true;
    adjustment.connect("value-changed", () => {
      maybeLoadMoreFromScroll();
    });
  };

  connectAdjustment();
  Utils.timeout(1, connectAdjustment);
};

const handleWindowKeyPress = (_, event) => {
  const keyval = event.get_keyval()[1];

  if (keyval === Gdk.KEY_Right) {
    const item = state.filteredItems[state.selectedIndex];
    if (item?.action === "item") {
      enterActionView(item);
      return true;
    }
  }

  if (keyval === Gdk.KEY_Left && state.currentView === VIEW_ACTIONS) {
    leaveActionView();
    return true;
  }

  if (keyval === Gdk.KEY_Escape) {
    if (state.currentView === VIEW_ACTIONS) {
      leaveActionView();
      return true;
    }

    App.closeWindow("bitwarden");
    return true;
  }

  return false;
};

const handleVisibilityChange = (window) => {
  if (window.visible) {
    Utils.execAsync(`agsv1 -b bg_bitwarden -r openBgBitwarden()`).catch(print);
    beginOpenState();
    state.entryWidget?.grab_focus();
    loadVaultItems().catch(console.log);
    return;
  }

  Utils.execAsync(`agsv1 -b bg_bitwarden -r closeBgBitwarden()`).catch(print);
  resetPopupState();
};

const createHeader = () =>
  Box({
    spacing: 14,
    children: [
      Icon({
        icon: `${parentAssetsDir()}/yorha.png`,
        size: 42,
        connections: [
          [dark, (self) => {
            self.icon = `${parentAssetsDir()}/yorha.png`;
          }],
        ],
      }),
      Label({
        xalign: 0,
        hexpand: true,
        label: "YoRHa",
        css: titleCss(),
        connections: [
          [dark, (self) => {
            self.css = titleCss();
          }],
        ],
      }),
    ],
  });

const createStatusLabel = () =>
  Label({
    xalign: 0,
    wrap: true,
    label: state.statusMessage,
    css: `margin-top: 14px; ${bodyCss()}`,
    setup: (self) => {
      state.statusLabel = self;
    },
    connections: [
      [dark, (self) => {
        self.css = `margin-top: 14px; ${bodyCss()}`;
        self.label = state.statusMessage;
      }],
    ],
  });

const createSearchEntry = () =>
  Widget.Entry({
    classNames: ["app-launcher-search"],
    placeholderText: "search vault",
    text: "",
    visibility: true,
    css: "margin-left: 0; margin-right: 0; margin-top: 20px;",
    setup: (self) => {
      state.entryWidget = self;
      Utils.timeout(1, () => {
        refreshDisplayedItems();
      });
      self.connect("key-press-event", handleEntryKeyPress);
    },
    onChange: handleSearchChange,
  });

const createResultsList = () =>
  Scrollable({
    vexpand: true,
    vscroll: "always",
    hscroll: "never",
    css: "min-height: 0; margin-top: 14px; margin-right: -22px;",
    setup: connectScrollLoadMore,
    child: Box({
      vertical: true,
      vexpand: true,
      children: [
        NierButtonGroup({
          classNames: ["app-launcher"],
          spacing: 6,
          setup: (self) => {
            state.resultGroup = self;
            refreshDisplayedItems();
          },
        }),
      ],
    }),
  });

const createPanel = () =>
  Box({
    vertical: true,
    classNames: ["nier-settings-container"],
    vexpand: true,
    css: panelCss(),
    connections: [
      [dark, (self) => {
        self.css = panelCss();
      }],
    ],
    children: [
      createHeader(),
      createStatusLabel(),
      createSearchEntry(),
      createResultsList(),
    ],
  });

const BitwardenPopup = () =>
  Window({
    name: "bitwarden",
    visible: false,
    exclusivity: "ignore",
    keymode: "exclusive",
    layer: "overlay",
    anchor: ["top", "bottom", "left", "right"],
    margins: [0, 0, 0, 0],
    child: EventBox({
      css: "background: transparent;",
      setup: (self) =>
        Utils.timeout(1, () => {
          self.set_visible_window(false);
        }),
      on_primary_click: () => App.closeWindow("bitwarden"),
      child: Overlay({
        child: Box({
          child: Box({}),
          css: `min-width: ${SCREEN_WIDTH}px; min-height: ${SCREEN_HEIGHT}px; background: transparent;`,
        }),
        overlays: [
          Box({
            hpack: "center",
            vpack: "center",
            hexpand: true,
            vexpand: true,
            child: EventBox({
              css: "background: transparent;",
              setup: (self) =>
                Utils.timeout(1, () => {
                  self.set_visible_window(false);
                }),
              on_primary_click: () => true,
              child: createPanel(),
            }),
          }),
        ],
      }),
    }),
    setup: (self) =>
      Utils.timeout(1, () => {
        self.connect("notify::visible", handleVisibilityChange);
        self.connect("key-press-event", handleWindowKeyPress);
      }),
  });

export default {
  style: css,
  windows: [BitwardenPopup()],
};
