import { Widget,Utils, App,Mpris } from "./imports.js";
import { NowPlaying } from "./nowplaying.js";

import { css, getTargetPlayer } from "./utils.js";

const { Window } = Widget;


export const NierPlayer = () => Window({
    name: "player",
    classNames: ["player"],
    margin: [0, 0, 0, 0],
    anchor: ["right"],
    exclusivity: "ignore",
    layer: "bottom",
    focusable: false,
    visible: true,
    child: NowPlaying({}),
})

globalThis.App = App;
globalThis.Mpris = Mpris;

Utils.timeout(500, () => {
    if (!getTargetPlayer(Mpris.players)) {
        print("closing player")
        Utils.timeout(0,() => {
            if (!getTargetPlayer(Mpris.players)) {
                App.closeWindow("player");
            }
        });
    } else { 
        print("opening player")
        App.openWindow("player");
    }
})

Mpris.connect("changed",() => {
    if (!getTargetPlayer(Mpris.players)) {
        print("closing player")
        Utils.timeout(3000,() => {
            if (!getTargetPlayer(Mpris.players)) {
                App.closeWindow("player");
            }
        });
    } else { 
        print("opening player")
        Utils.timeout(300,() => {
            if (getTargetPlayer(Mpris.players)) {
                App.openWindow("player");
            }
        });
    }
});

dark.connect("changed",() => Utils.timeout(100, () => {
    App.resetCss();
    App.applyCss(css);
}))

export default {
    style: css,
    closeWindowDelay: {
        player: 300+600+500+100, // milliseconds
      },
    windows: [
        NierPlayer(),
    ],
  };