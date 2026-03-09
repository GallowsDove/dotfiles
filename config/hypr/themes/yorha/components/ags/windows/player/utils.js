import { App, Utils, Variable } from "./imports.js";

const parentConfigDir = App.configDir.split("/").slice(0,-2).join("/");

function arrremove(arr, value) {
    return arr.filter(function (ele) {
      return ele != value;
    });
  }
  
  function arradd(arr, value) {
    if (arr.includes(value)) {
      return arr;
    }
    arr.push(value);
    return arr;
  }

const {random, round } = Math;

const dark = Variable(false, {});

dark.connect("changed", () => {
  print("music: dark changed",dark.value);
})

globalThis.dark = dark;


const assetsDir = () => `${parentConfigDir}/assets/${dark.value ? "dark" : "light"}`;

const home = `/home/${Utils.exec("whoami")}`;
const themedir = parentConfigDir.split("/").slice(0, -2).join("/");

const scss = App.configDir + "/style/style.scss";
const css = App.configDir + "/style/style.css";

const { exec } = Utils;

const SCREEN_WIDTH = Number(
  exec(
    `bash -c "xrandr --current | grep '*' | uniq | awk '{print $1}' | cut -d 'x' -f1 | head -1"`
  )
);
const SCREEN_HEIGHT = Number(
  exec(
    `bash -c "xrandr --current | grep '*' | uniq | awk '{print $1}' | cut -d 'x' -f2 | head -1"`
  )
);
globalThis["SCREEN_WIDTH"] = SCREEN_WIDTH;
globalThis["SCREEN_HEIGHT"] = SCREEN_HEIGHT;

const rand_int = (a,b) => round(random()*(b-a)+a);

let currentPlayerTarget = null;

const getPlayerPlaybackStatus = (player) => {
  return (
    player?.play_back_status
    ?? player?.playback_status
    ?? player?.playBackStatus
    ?? player?.playbackStatus
    ?? ""
  );
};

const getPlayerIdentity = (player) => {
  return (
    player?.bus_name
    ?? player?.busName
    ?? player?.desktop_entry
    ?? player?.desktopEntry
    ?? player?.entry
    ?? player?.name
    ?? player?.identity
    ?? null
  );
};

const isSamePlayer = (left, right) => {
  if (!left || !right) {
    return false;
  }

  if (left === right) {
    return true;
  }

  const leftIdentity = getPlayerIdentity(left);
  const rightIdentity = getPlayerIdentity(right);

  return !!leftIdentity && leftIdentity === rightIdentity;
};

const findMatchingPlayer = (players = [], target = null) => {
  if (!target) {
    return null;
  }

  return players.find((player) => isSamePlayer(player, target)) ?? null;
};

const getTargetPlayer = (players = []) => {
  const availablePlayers = players.filter(Boolean);
  const activePlayer = availablePlayers.find((player) => getPlayerPlaybackStatus(player) === "Playing") ?? null;
  const preservedPlayer = findMatchingPlayer(availablePlayers, currentPlayerTarget);

  if (activePlayer) {
    currentPlayerTarget = activePlayer;
    return currentPlayerTarget;
  }

  if (preservedPlayer) {
    currentPlayerTarget = preservedPlayer;
    return currentPlayerTarget;
  }

  currentPlayerTarget = (
    availablePlayers.find((player) => getPlayerPlaybackStatus(player) === "Paused")
    ?? availablePlayers[0]
    ?? null
  );

  return currentPlayerTarget;
};

export {
  home,
  themedir,
  scss,
  css,
  SCREEN_HEIGHT,
  SCREEN_WIDTH,
  rand_int,
  arradd,
  arrremove,
  getPlayerPlaybackStatus,
  getTargetPlayer,
  dark,
  assetsDir,
  parentConfigDir
};
