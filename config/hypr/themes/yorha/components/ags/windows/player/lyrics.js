import { App, Widget, Utils, Variable, Mpris } from "./imports.js";
import { css, dark } from "./utils.js";

const { Window, Box, Label, Overlay } = Widget;

export const lyricsWindowVisible = Variable(false, {});
const LYRICS_BOTTOM_OFFSET = 120;
const LYRICS_TEXT_SIZE_REM = 1.64;
const LYRICS_SYNC_INTERVAL = 250;
const LYRICS_ACTIVE_PLAYER_POLL_INTERVAL = 2000;
const LRCLIB_BASE_URL = "https://lrclib.net/api";
const PLAYERCTL_METADATA_FORMAT = "player={{playerName}}|status={{status}}|title={{title}}|artist={{artist}}|album={{album}}|length={{mpris:length}}";
const lyricsLine = Variable("No synced lyrics loaded.", {});
const lyricsCache = new Map();
const MPRIS_REFRESH_DEBOUNCE_MS = 300;

let activeTrackKey = null;
let activeLyrics = null;
let activePlayer = null;
let activeFetchId = 0;
let activeFetchTrackKey = null;
let activeFetchPromise = null;
let syncLoopRunning = false;
let playerPollRunning = false;
let refreshRequestId = 0;

const BROWSER_PLAYERS = [
  "firefox",
  "chromium",
  "chrome",
  "brave",
  "librewolf",
];

const normalizeText = (value) => String(value ?? "").trim();
const normalizeLookupText = (value) => normalizeText(value)
  .toLowerCase()
  .replace(/[’']/g, "'")
  .replace(/\s+/g, " ");

const getLookupVariants = (value) => {
  const base = normalizeLookupText(value);
  const variants = new Set(base ? [base] : []);
  const raw = normalizeText(value);

  for (const match of raw.matchAll(/[\(\[]([^\)\]]+)[\)\]]/g)) {
    const normalized = normalizeLookupText(match[1]);
    if (normalized) {
      variants.add(normalized);
    }
  }

  const withoutBracketed = normalizeLookupText(raw.replace(/\s*[\(\[][^\)\]]*[\)\]]/g, " "));
  if (withoutBracketed) {
    variants.add(withoutBracketed);
  }

  return [...variants];
};

const stripParentheticalSuffix = (value) => normalizeText(value)
  .replace(/\s*[\(\[][^\)\]]*[\)\]]\s*$/g, "")
  .replace(/\s+/g, " ")
  .trim();

const stripFeaturingSuffix = (value) => normalizeText(value)
  .replace(/\s+(?:feat\.?|ft\.?|featuring)\s+.+$/i, "")
  .replace(/\s+/g, " ")
  .trim();

const getTitleVariants = (title) => Array.from(new Set([
  normalizeText(title),
  stripParentheticalSuffix(title),
  stripFeaturingSuffix(title),
  stripFeaturingSuffix(stripParentheticalSuffix(title)),
].filter(Boolean)));

const getArtistVariants = (artist) => {
  const raw = normalizeText(artist);
  const variants = new Set(raw ? [raw] : []);

  for (const match of raw.matchAll(/[\(\[]([^\)\]]+)[\)\]]/g)) {
    const value = normalizeText(match[1]);
    if (value) {
      variants.add(value);
    }
  }

  const withoutBracketed = normalizeText(raw.replace(/\s*[\(\[][^\)\]]*[\)\]]/g, " "));
  if (withoutBracketed) {
    variants.add(withoutBracketed);
  }

  return [...variants];
};

const getPlayerTitle = (player) => (
  normalizeText(
    player?.title
    ?? player?.track_title
    ?? player?.trackTitle
    ?? ""
  )
);

const getPlayerArtists = (player) => {
  const candidates = (
    player?.track_artists
    ?? player?.trackArtists
    ?? player?.artists
    ?? player?.artist
    ?? []
  );

  if (Array.isArray(candidates)) {
    return candidates.map((entry) => normalizeText(entry)).filter(Boolean);
  }

  const single = normalizeText(candidates);
  return single ? [single] : [];
};

const getPlayerAlbum = (player) => normalizeText(
  player?.track_album
  ?? player?.trackAlbum
  ?? player?.album
  ?? ""
);

const getPlayerCtlName = (player) => {
  const explicit = normalizeText(
    player?.playerName
    ?? player?.name
    ?? player?.identity
    ?? player?.entry
    ?? player?.desktop_entry
    ?? player?.desktopEntry
    ?? ""
  );
  if (explicit) {
    return explicit;
  }
  return "";
};

const getSnapshotPlaybackStatus = (snapshot) => normalizeText(
  snapshot?.status
  ?? snapshot?.playbackStatus
  ?? ""
);

const normalizeTimeMs = (value) => {
  const numeric = Number(value ?? 0);
  if (!Number.isFinite(numeric) || numeric <= 0) {
    return 0;
  }

  return numeric > 10_000_000 ? Math.round(numeric / 1000) : Math.round(numeric);
};

const getPlayerDurationMs = (player) => normalizeTimeMs(
  player?.length
  ?? player?.track_length
  ?? player?.trackLength
  ?? player?.mpris_length
  ?? 0
);


const buildTrackKey = (player) => {
  const title = getPlayerTitle(player);
  const durationMs = getPlayerDurationMs(player);

  if (!title || !durationMs) {
    return null;
  }

  return JSON.stringify({
    title,
    artists: getPlayerArtists(player),
    album: getPlayerAlbum(player),
    durationMs,
  });
};

const parseLrcTimestamp = (value) => {
  const match = value.match(/^(\d{1,2}):(\d{2})(?:\.(\d{1,3}))?$/);
  if (!match) {
    return null;
  }

  const minutes = Number(match[1]);
  const seconds = Number(match[2]);
  const fractionText = match[3] ?? "0";
  const milliseconds = Number(fractionText.padEnd(3, "0").slice(0, 3));

  return ((minutes * 60) + seconds) * 1000 + milliseconds;
};

const buildQuery = (params) => Object.entries(params)
  .filter(([, value]) => value !== undefined && value !== null && value !== "")
  .map(([key, value]) => `${encodeURIComponent(key)}=${encodeURIComponent(String(value))}`)
  .join("&");

const firstArtist = (player) => getPlayerArtists(player)[0] ?? "";

const parseSnapshotLines = (output) => String(output)
  .split("\n")
  .map((line) => line.trim())
  .filter(Boolean)
  .map((line) => {
    const parts = line.split("|");
    const data = Object.fromEntries(parts.map((part) => {
      const splitAt = part.indexOf("=");
      if (splitAt < 0) {
        return [part, ""];
      }
      return [part.slice(0, splitAt), part.slice(splitAt + 1)];
    }));

    const playerName = normalizeText(data.player);
    return {
      title: normalizeText(data.title),
      artist: normalizeText(data.artist),
      album: normalizeText(data.album),
      length: Number(data.length ?? 0),
      status: normalizeText(data.status),
      playerName,
      busName: playerName ? `org.mpris.MediaPlayer2.${playerName}` : "",
    };
  })
  .filter((snapshot) => snapshot.playerName);

const isBrowserPlayer = (name) => {
  const lowered = normalizeLookupText(name);
  return BROWSER_PLAYERS.some((browser) => lowered.startsWith(browser));
};

const isLyricsVisible = () => lyricsWindowVisible.value && !!App.getWindow("lyrics")?.visible;

const getActivePlayerSnapshot = async () => {
  try {
    const output = await Utils.execAsync([
      "playerctl",
      "-a",
      "metadata",
      "--format",
      PLAYERCTL_METADATA_FORMAT,
    ]);
    const snapshots = parseSnapshotLines(output);

    snapshots.sort((left, right) => {
      const leftStatus = getSnapshotPlaybackStatus(left);
      const rightStatus = getSnapshotPlaybackStatus(right);

      const leftScore = (leftStatus === "Playing" ? 100 : leftStatus === "Paused" ? 50 : 0) - (isBrowserPlayer(left.playerName) ? 25 : 0);
      const rightScore = (rightStatus === "Playing" ? 100 : rightStatus === "Paused" ? 50 : 0) - (isBrowserPlayer(right.playerName) ? 25 : 0);

      return rightScore - leftScore;
    });

    return snapshots[0] ?? null;
  } catch (error) {
    print("lyrics player snapshot failed", error);
    return null;
  }
};

const parseSyncedLyrics = (text) => {
  if (!text) {
    return [];
  }

  const parsed = [];

  for (const rawLine of String(text).split("\n")) {
    const line = rawLine.trim();
    if (!line.startsWith("[")) {
      continue;
    }

    const matches = [...line.matchAll(/\[([^\]]+)\]/g)];
    if (!matches.length) {
      continue;
    }

    const lyric = line.replace(/\[[^\]]+\]/g, "").trim();
    for (const match of matches) {
      const timeMs = parseLrcTimestamp(match[1].trim());
      if (timeMs === null) {
        continue;
      }

      parsed.push({ timeMs, lyric });
    }
  }

  return parsed.sort((left, right) => left.timeMs - right.timeMs);
};

const LYRICS_LOOKAHEAD_MS = Math.round(LYRICS_SYNC_INTERVAL / 2);

const findLyricLine = (entries, positionMs) => {
  if (!entries?.length) {
    return "";
  }

  let low = 0;
  let high = entries.length - 1;
  let result = -1;

  while (low <= high) {
    const mid = (low + high) >> 1;
    if (entries[mid].timeMs <= positionMs) {
      result = mid;
      low = mid + 1;
    } else {
      high = mid - 1;
    }
  }

  while (result >= 0) {
    const lyric = normalizeText(entries[result].lyric);
    if (lyric) {
      return lyric;
    }
    result -= 1;
  }

  return "";
};

const httpGetJson = async (url) => {
  const output = await Utils.execAsync([
    "curl",
    "-fsSL",
    "--max-time",
    "3",
    url,
  ]);

  return JSON.parse(output);
};

const fetchPlayerctlPositionMs = async (player) => {
  const playerName = getPlayerCtlName(player);
  if (!playerName) {
    return 0;
  }

  try {
    const output = await Utils.execAsync([
      "playerctl",
      "-p",
      playerName,
      "position",
    ]);

    const seconds = Number(String(output).trim());
    if (!Number.isFinite(seconds) || seconds <= 0) {
      return 0;
    }

    return Math.round(seconds * 1000);
  } catch (error) {
    print("lyrics playerctl position fetch failed", error);
    return 0;
  }
};

const hasSyncedLyrics = (entry) => typeof entry?.syncedLyrics === "string" && entry.syncedLyrics.trim().length > 0;

const getRoundedDurationSec = (durationMs) => {
  if (!durationMs) {
    return 0;
  }

  const rounded = Math.round(durationMs / 1000);
  return Number.isFinite(rounded) && rounded > 0 ? rounded : 0;
};

const scoreSearchResult = (entry, title, artist, durationSec) => {
  const entryTitle = normalizeLookupText(entry?.trackName ?? entry?.name ?? "");
  const entryArtist = normalizeLookupText(entry?.artistName ?? "");
  const targetTitle = normalizeLookupText(title);
  const targetArtistVariants = getLookupVariants(artist);
  const entryDuration = Number(entry?.duration ?? 0);

  let score = 0;

  if (entryTitle === targetTitle) {
    score += 10;
  } else if (entryTitle.includes(targetTitle) || targetTitle.includes(entryTitle)) {
    score += 5;
  }

  if (targetArtistVariants.some((variant) => variant && entryArtist === variant)) {
    score += 10;
  } else if (targetArtistVariants.some((variant) => variant && (entryArtist.includes(variant) || variant.includes(entryArtist)))) {
    score += 5;
  }

  if (durationSec && entryDuration) {
    const delta = Math.abs(entryDuration - durationSec);
    if (delta <= 1) {
      score += 8;
    } else if (delta <= 3) {
      score += 5;
    } else if (delta <= 8) {
      score += 2;
    }
  }

  return score;
};

const isAcceptableSearchResult = (entry, title, artist, durationSec) => {
  const entryTitle = normalizeLookupText(entry?.trackName ?? entry?.name ?? "");
  const entryArtist = normalizeLookupText(entry?.artistName ?? "");
  const targetTitle = normalizeLookupText(title);
  const targetArtistVariants = getLookupVariants(artist);
  const entryDuration = Number(entry?.duration ?? 0);

  const exactTitleMatch = entryTitle === targetTitle;
  const looseTitleMatch = exactTitleMatch || entryTitle.includes(targetTitle) || targetTitle.includes(entryTitle);
  const artistMatches = !targetArtistVariants.length || targetArtistVariants.some((variant) => (
    variant && (entryArtist === variant || entryArtist.includes(variant) || variant.includes(entryArtist))
  ));
  const durationDelta = durationSec && entryDuration ? Math.abs(entryDuration - durationSec) : 0;
  const strongDurationMatch = !durationSec || !entryDuration || durationDelta <= 3;
  const looseDurationMatch = !durationSec || !entryDuration || durationDelta <= 8;

  return (
    (exactTitleMatch && (artistMatches || strongDurationMatch))
    || (looseTitleMatch && artistMatches && looseDurationMatch)
  );
};

const fetchSyncedLyrics = async (player) => {
  const title = getPlayerTitle(player);
  const artist = firstArtist(player);
  const album = getPlayerAlbum(player);
  const durationMs = getPlayerDurationMs(player);
  const durationSec = durationMs ? Number((durationMs / 1000).toFixed(3)) : 0;
  const roundedDurationSec = getRoundedDurationSec(durationMs);

  if (!title || !artist) {
    return [];
  }

  const titleVariants = getTitleVariants(title);
  const artistVariants = getArtistVariants(artist);

  for (const titleVariant of titleVariants) {
    const exactVariants = artistVariants.flatMap((artistVariant) => ([
      ...(roundedDurationSec ? [
        { track_name: titleVariant, artist_name: artistVariant, album_name: album, duration: roundedDurationSec },
        { track_name: titleVariant, artist_name: artistVariant, duration: roundedDurationSec },
      ] : []),
      { track_name: titleVariant, artist_name: artistVariant, album_name: album },
      { track_name: titleVariant, artist_name: artistVariant },
    ]));

    for (const params of exactVariants) {
      try {
        const exact = await httpGetJson(`${LRCLIB_BASE_URL}/get?${buildQuery(params)}`);
        if (hasSyncedLyrics(exact)) {
          return parseSyncedLyrics(exact.syncedLyrics);
        }
      } catch (error) {
        print("lyrics exact fetch failed", error);
      }
    }
  }

  let bestMatch = null;
  let bestScore = -1;

  for (const titleVariant of titleVariants) {
    const searchVariants = [
      ...artistVariants.flatMap((artistVariant) => ([
        { track_name: titleVariant, artist_name: artistVariant, album_name: album },
        { track_name: titleVariant, artist_name: artistVariant },
        { q: `${titleVariant} ${artistVariant}` },
      ])),
      { q: titleVariant },
    ];

    for (const params of searchVariants) {
      try {
        const search = await httpGetJson(`${LRCLIB_BASE_URL}/search?${buildQuery(params)}`);
        if (!Array.isArray(search)) {
          continue;
        }

        for (const entry of search) {
          if (!hasSyncedLyrics(entry)) {
            continue;
          }

          const score = scoreSearchResult(entry, titleVariant, artist, durationSec);
          if (score > bestScore) {
            bestMatch = entry;
            bestScore = score;
          }
        }

        if (bestScore >= 20) {
          return parseSyncedLyrics(bestMatch.syncedLyrics);
        }
      } catch (error) {
        print("lyrics search fetch failed", error);
      }
    }
  }

  return hasSyncedLyrics(bestMatch) && isAcceptableSearchResult(bestMatch, title, artist, durationSec)
    ? parseSyncedLyrics(bestMatch.syncedLyrics)
    : [];
};

const refreshLyricsForTrack = async () => {
  if (!isLyricsVisible()) {
    return;
  }

  const player = await getActivePlayerSnapshot();
  const trackKey = buildTrackKey(player);

  if (!player || !trackKey) {
    activePlayer = null;
    activeTrackKey = null;
    activeLyrics = null;
    lyricsLine.value = "No synced lyrics loaded.";
    return;
  }

  if (trackKey === activeTrackKey && activeLyrics) {
    return;
  }

  const trackChanged = trackKey !== activeTrackKey;
  activePlayer = player;
  activeTrackKey = trackKey;
  if (trackChanged) {
    activeLyrics = null;
  }
  lyricsLine.value = "Loading synced lyrics...";

  if (lyricsCache.has(trackKey)) {
    activeLyrics = lyricsCache.get(trackKey);
    lyricsLine.value = activeLyrics.length
      ? (findLyricLine(activeLyrics, await fetchPlayerctlPositionMs(player)) || "...")
      : "No synced lyrics found.";
    return;
  }

  if (trackKey === activeFetchTrackKey && activeFetchPromise) {
    await activeFetchPromise;
    return;
  }

  const fetchId = ++activeFetchId;
  activeFetchTrackKey = trackKey;
  activeFetchPromise = (async () => {
    try {
      const parsedLyrics = await fetchSyncedLyrics(player);

      if (fetchId !== activeFetchId || trackKey !== activeTrackKey) {
        return;
      }

      activeLyrics = parsedLyrics;
      lyricsCache.set(trackKey, parsedLyrics);
      lyricsLine.value = parsedLyrics.length
        ? (findLyricLine(parsedLyrics, await fetchPlayerctlPositionMs(player)) || "...")
        : "No synced lyrics found.";
    } catch (error) {
      if (fetchId === activeFetchId && trackKey === activeTrackKey) {
        activeLyrics = [];
        lyricsLine.value = "No synced lyrics found.";
      }
      print("lyrics fetch failed", error);
    } finally {
      if (fetchId === activeFetchId && trackKey === activeFetchTrackKey) {
        activeFetchTrackKey = null;
        activeFetchPromise = null;
      }
    }
  })();

  await activeFetchPromise;
};

const scheduleRefreshLyrics = (delayMs = 0) => {
  const requestId = ++refreshRequestId;

  Utils.timeout(delayMs, () => {
    if (requestId !== refreshRequestId || !isLyricsVisible()) {
      return;
    }

    refreshLyricsForTrack().catch((error) => {
      print("lyrics refresh failed", error);
    });
  });
};

const syncCurrentLyric = async () => {
  if (!isLyricsVisible()) {
    return;
  }

  const player = activePlayer;
  if (!player || !activeTrackKey) {
    await refreshLyricsForTrack();
    return;
  }

  if (!activeLyrics?.length) {
    await refreshLyricsForTrack();
    return;
  }

  const playbackStatus = getSnapshotPlaybackStatus(player);
  if (playbackStatus && playbackStatus !== "Playing" && playbackStatus !== "Paused") {
    return;
  }

  const positionMs = await fetchPlayerctlPositionMs(player);

  const nextLine = findLyricLine(activeLyrics, positionMs + LYRICS_LOOKAHEAD_MS);
  lyricsLine.value = nextLine || (playbackStatus === "Paused" ? lyricsLine.value : "...");
};

const startSyncLoop = () => {
  if (syncLoopRunning) {
    return;
  }

  syncLoopRunning = true;

  const tick = () => {
    if (!syncLoopRunning) {
      return;
    }

    Promise.resolve(syncCurrentLyric()).catch((error) => {
      print("lyrics sync failed", error);
    }).finally(() => {
      if (syncLoopRunning) {
        Utils.timeout(LYRICS_SYNC_INTERVAL, tick);
      }
    });
  };

  Utils.timeout(LYRICS_SYNC_INTERVAL, tick);
};

const stopSyncLoop = () => {
  syncLoopRunning = false;
};

const startActivePlayerPoll = () => {
  if (playerPollRunning) {
    return;
  }

  playerPollRunning = true;

  const tick = () => {
    if (!playerPollRunning) {
      return;
    }

    if (isLyricsVisible()) {
      scheduleRefreshLyrics();
    }

    if (playerPollRunning) {
      Utils.timeout(LYRICS_ACTIVE_PLAYER_POLL_INTERVAL, tick);
    }
  };

  Utils.timeout(LYRICS_ACTIVE_PLAYER_POLL_INTERVAL, tick);
};

const stopActivePlayerPoll = () => {
  playerPollRunning = false;
};

const lyricsWindowCss = () => `font-size: ${LYRICS_TEXT_SIZE_REM}rem;`;

const applyWindowPassThrough = (widget) => {
  const gdkWindow = widget.get_window?.();
  if (!gdkWindow) {
    return;
  }

  if (gdkWindow.set_pass_through) {
    gdkWindow.set_pass_through(true);
  }

  const cairo = imports.cairo;
  if (gdkWindow.input_shape_combine_region && cairo?.Region) {
    const emptyRegion = new cairo.Region();
    gdkWindow.input_shape_combine_region(emptyRegion, 0, 0);
  }
};

export const toggleLyricsWindow = () => {
  lyricsWindowVisible.value = !lyricsWindowVisible.value;
  if (lyricsWindowVisible.value) {
    App.openWindow("lyrics");
  } else {
    App.closeWindow("lyrics");
  }
};

App.connect("window-toggled", (_, windowName, visible) => {
  if (windowName === "lyrics") {
    lyricsWindowVisible.value = visible;
    if (visible) {
      startSyncLoop();
      startActivePlayerPoll();
      scheduleRefreshLyrics();
    } else {
      stopSyncLoop();
      stopActivePlayerPoll();
      activePlayer = null;
      activeTrackKey = null;
      activeLyrics = null;
      activeFetchTrackKey = null;
      activeFetchPromise = null;
    }
  }
});

Mpris.connect("changed", () => {
  if (isLyricsVisible()) {
    scheduleRefreshLyrics(MPRIS_REFRESH_DEBOUNCE_MS);
  }
});

export const LyricsWindow = () => Window({
  name: "lyrics",
  classNames: ["lyrics-window"],
  anchor: ["top", "bottom", "left", "right"],
  margin: [0, 0, 0, 0],
  exclusivity: "ignore",
  layer: "overlay",
  focusable: false,
  visible: false,
  css: lyricsWindowCss(),
  setup: (self) => {
    self.connect("realize", () => applyWindowPassThrough(self));
    self.connect("map", () => applyWindowPassThrough(self));
  },
  child: Overlay({
    pass_through: true,
    child: Box({
      hexpand: true,
      vexpand: true,
    }),
    overlays: [
      Box({
        hexpand: true,
        vexpand: true,
        vpack: "end",
        hpack: "center",
        child: Box({
          css: `margin-bottom: ${LYRICS_BOTTOM_OFFSET}px;`,
          child: Box({
            classNames: ["lyrics-shell"],
            hpack: "center",
            hexpand: false,
            children: [
              Label({
                label: lyricsLine.value,
                classNames: ["lyrics-line"],
                xalign: 0.5,
                hpack: "center",
                hexpand: false,
                max_width_chars: 54,
                connections: [
                  [lyricsLine, (self) => {
                    self.label = lyricsLine.value;
                    self.set_label(lyricsLine.value);
                  }, "changed"],
                ],
                setup: (self) => Utils.timeout(1, () => {
                  self.set_single_line_mode(false);
                  self.set_line_wrap(true);
                  self.set_line_wrap_mode(imports.gi.Pango.WrapMode.WORD_CHAR);
                  self.set_label(lyricsLine.value);
                  self.set_ellipsize(imports.gi.Pango.EllipsizeMode.NONE);
                  self.set_justify(imports.gi.Gtk.Justification.CENTER);
                }),
              }),
            ],
          }),
        }),
      }),
    ],
    setup: (self) => Utils.timeout(1, () => {
      const panel = self.overlays?.[0];
      if (panel && self.set_overlay_pass_through) {
        self.set_overlay_pass_through(panel, true);
      }
    }),
  }),
});

dark.connect("changed", () => Utils.timeout(100, () => {
  App.resetCss();
  App.applyCss(css);
}));

export default {
  style: css,
  windows: [
    LyricsWindow(),
  ],
};
