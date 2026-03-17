import { Widget,Utils, App,Mpris } from "./imports.js";
import { NowPlaying } from "./nowplaying.js";
import { LyricsWindow } from "./lyrics.js";

import { css, dark, getTargetPlayer } from "./utils.js";

const { Window } = Widget;
const PLAYER_MODE = "top-blur";
const PLAYER_BG_OPEN_DELAY = 1000;
const TOP_BLUR_MODE = PLAYER_MODE === "top-blur";

const openPlayer = () => {
    App.openWindow("player");
};

const closePlayer = () => {
    App.closeWindow("playerbg");
    App.closeWindow("player");
};

const NierPlayerBg = () => Window({
    name: "playerbg",
    classNames: ["playerbg"],
    margin: [0, 0, 0, 0],
    anchor: ["right"],
    exclusivity: "ignore",
    layer: "top",
    focusable: false,
    visible: false,
    child: Widget.Box({
        children: [
            Widget.Box({
                vertical: true,
                children: [
                    Widget.Box({
                        css: "min-height: 58px;",
                    }),
                    Widget.Box({
                        classNames: ["playerbg-mask"],
                        css: "min-width: 660px; min-height: 660px; margin-right: 10px;",
                    }),
                    Widget.Box({
                        css: "min-height: 42px;",
                    }),
                ],
            }),
            Widget.Box({
                css: "min-width: 46px;",
            }),
            Widget.Box({
                css: "min-width: 1px;",
            }),
        ],
    }),
});


export const NierPlayer = () => Window({
    name: "player",
    classNames: ["player"],
    margin: [0, 0, 0, 0],
    anchor: ["right"],
    exclusivity: "ignore",
    layer: TOP_BLUR_MODE ? "overlay" : "bottom",
    focusable: false,
    visible: false,
    child: NowPlaying({}),
})

globalThis.App = App;
globalThis.Mpris = Mpris;

Utils.timeout(500, () => {
    if (!getTargetPlayer(Mpris.players)) {
        print("closing player")
        Utils.timeout(0,() => {
            if (!getTargetPlayer(Mpris.players)) {
                closePlayer();
            }
        });
    } else { 
        print("opening player")
        openPlayer();
    }
})

Mpris.connect("changed",() => {
    if (!getTargetPlayer(Mpris.players)) {
        print("closing player")
        Utils.timeout(3000,() => {
            if (!getTargetPlayer(Mpris.players)) {
                closePlayer();
            }
        });
    } else { 
        print("opening player")
        Utils.timeout(300,() => {
            if (getTargetPlayer(Mpris.players)) {
                openPlayer();
            }
        });
    }
});

App.connect("window-toggled", (_, windowName, visible) => {
    if (!TOP_BLUR_MODE) {
        App.closeWindow("playerbg");
        return;
    }

    if (windowName !== "player") {
        return;
    }

    if (!visible) {
        App.closeWindow("playerbg");
        return;
    }

    Utils.timeout(PLAYER_BG_OPEN_DELAY, () => {
        if (getTargetPlayer(Mpris.players) && App.getWindow("player")?.visible) {
            App.openWindow("playerbg");
        }
    });
});

dark.connect("changed",() => Utils.timeout(100, () => {
    App.resetCss();
    App.applyCss(css);
}))

export default {
    style: css,
    closeWindowDelay: {
        player: 300+600+500+100, // milliseconds
        playerbg: 0,
      },
    windows: [
        LyricsWindow(),
        NierPlayerBg(),
        NierPlayer(),
    ],
  };
