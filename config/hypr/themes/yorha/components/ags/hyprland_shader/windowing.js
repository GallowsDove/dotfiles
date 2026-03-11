const OPEN_WINDOW_CLIENT_RETRY_DELAY_MS = 16;
const OPEN_WINDOW_CLIENT_RETRY_COUNT = 6;
const OPEN_WINDOW_STABILITY_DELAY_MS = 24;
const OPEN_WINDOW_STABILITY_RETRY_COUNT = 4;
const MIN_ANIMATED_WINDOW_WIDTH = 420;
const MIN_ANIMATED_WINDOW_HEIGHT = 240;
const MIN_ANIMATED_XWAYLAND_WIDTH = 700;
const MIN_ANIMATED_XWAYLAND_HEIGHT = 420;

export const watchedHyprlandEvents = new Set([
  "activewindowv2",
  "closewindow",
  "configreloaded",
  "fullscreen",
]);

export const wait = (Utils, delay) => new Promise((resolve) => Utils.timeout(delay, resolve));

export const isTrueFullscreen = (client) => {
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

export const normalizeWindowAddress = (address) => {
  if (typeof address !== "string") {
    return "";
  }

  const normalized = address.trim().toLowerCase();
  if (!normalized) {
    return "";
  }

  return normalized.startsWith("0x") ? normalized : `0x${normalized}`;
};

export const getClientByAddress = async (execAsync, address) => {
  const normalizedAddress = normalizeWindowAddress(address);
  if (!normalizedAddress) {
    return null;
  }

  const clients = JSON.parse(await execAsync(["hyprctl", "-j", "clients"]));
  return clients.find((client) => normalizeWindowAddress(client?.address) === normalizedAddress) ?? null;
};

export const getClientWithRetries = async (execAsync, Utils, address) => {
  for (let attempt = 0; attempt <= OPEN_WINDOW_CLIENT_RETRY_COUNT; attempt += 1) {
    const client = await getClientByAddress(execAsync, address);
    if (client) {
      return client;
    }

    if (attempt < OPEN_WINDOW_CLIENT_RETRY_COUNT) {
      await wait(Utils, OPEN_WINDOW_CLIENT_RETRY_DELAY_MS);
    }
  }

  return null;
};

const hasLargeEnoughGeometry = (client, minWidth, minHeight) => {
  const [windowWidth, windowHeight] = client?.size ?? [];
  return Number(windowWidth) >= minWidth && Number(windowHeight) >= minHeight;
};

export const getWindowGeometry = (client) => {
  const [windowX, windowY] = client?.at ?? [];
  const [windowWidth, windowHeight] = client?.size ?? [];

  if (![windowX, windowY, windowWidth, windowHeight].every(Number.isFinite)) {
    return null;
  }

  return {
    x: Number(windowX),
    y: Number(windowY),
    width: Number(windowWidth),
    height: Number(windowHeight),
  };
};

const isSameGeometry = (first, second) => (
  Boolean(first)
  && Boolean(second)
  && first.x === second.x
  && first.y === second.y
  && first.width === second.width
  && first.height === second.height
);

export const shouldAnimateWindow = (client) => {
  if (!client || isTrueFullscreen(client)) {
    return false;
  }

  if (!hasLargeEnoughGeometry(client, MIN_ANIMATED_WINDOW_WIDTH, MIN_ANIMATED_WINDOW_HEIGHT)) {
    return false;
  }

  if (client?.xwayland && !hasLargeEnoughGeometry(
    client,
    MIN_ANIMATED_XWAYLAND_WIDTH,
    MIN_ANIMATED_XWAYLAND_HEIGHT,
  )) {
    return false;
  }

  return true;
};

export const getStableClientForAnimation = async (execAsync, Utils, address) => {
  let previousClient = null;
  let previousGeometry = null;

  for (let attempt = 0; attempt <= OPEN_WINDOW_STABILITY_RETRY_COUNT; attempt += 1) {
    const client = await getClientWithRetries(execAsync, Utils, address);
    if (!shouldAnimateWindow(client)) {
      return null;
    }

    const geometry = getWindowGeometry(client);
    if (geometry && isSameGeometry(previousGeometry, geometry)) {
      return client;
    }

    previousClient = client;
    previousGeometry = geometry;

    if (attempt < OPEN_WINDOW_STABILITY_RETRY_COUNT) {
      await wait(Utils, OPEN_WINDOW_STABILITY_DELAY_MS);
    }
  }

  return previousClient && shouldAnimateWindow(previousClient) ? previousClient : null;
};

const findMonitorForClient = (client, monitors) => {
  const monitorKey = client?.monitorID ?? client?.monitorId ?? client?.monitor;
  return monitors.find((entry) => (
    Number.isFinite(Number(monitorKey))
      ? Number(entry.id) === Number(monitorKey)
      : entry.name === monitorKey
  )) ?? null;
};

export const normalizeWindowBoxFromState = (client, monitors) => {
  const geometry = getWindowGeometry(client);

  if (!geometry) {
    return null;
  }

  const monitor = findMonitorForClient(client, monitors);
  if (!monitor) {
    return null;
  }

  const monitorX = Number(monitor.x ?? 0);
  const monitorY = Number(monitor.y ?? 0);
  const monitorWidth = Number(monitor.width ?? 0);
  const monitorHeight = Number(monitor.height ?? 0);

  if (!(monitorWidth > 0) || !(monitorHeight > 0)) {
    return null;
  }

  return {
    minX: Math.max(0, (geometry.x - monitorX) / monitorWidth),
    minY: Math.max(0, (geometry.y - monitorY) / monitorHeight),
    maxX: Math.min(1, (geometry.x - monitorX + geometry.width) / monitorWidth),
    maxY: Math.min(1, (geometry.y - monitorY + geometry.height) / monitorHeight),
  };
};

export const normalizeWindowBox = async (execAsync, client) => {
  const monitors = JSON.parse(await execAsync(["hyprctl", "-j", "monitors"]));
  return normalizeWindowBoxFromState(client, monitors);
};
