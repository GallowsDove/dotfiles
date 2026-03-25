// importing
import {
  App,
  Widget,
  Utils,
} from "./imports.js";


import { arradd, arrremove, css, scss, assetsDir, dark, themedir,SCREEN_WIDTH, SCREEN_HEIGHT} from "./util.js";
import { start_hyprland_shader_sync } from "./hyprland_shader.js";
import { Workspaces } from "./widgets/workspace.js";
import { NierBorder } from "./widgets/nier_border.js";
import { button_pointer_size, top_icon_size, top_spacing, workspace_height, workspace_width } from "./scaling.js";

const { exec, execAsync } = Utils;
const { Box, Window, Button, Icon, Scrollable } = Widget;


Utils.writeFile(`$screen_width:${SCREEN_WIDTH}px;$screen_height:${SCREEN_HEIGHT}px;`,`${App.configDir}/style/data.scss`).then(() => {
  print("wrote ",`${App.configDir}/style/data.scss`,`$screen_width:${SCREEN_WIDTH}px;$screen_height:${SCREEN_HEIGHT}px;`)
  exec(`sassc ${scss} ${css}`);
}).catch(print);

const WHICH = "nier";
globalThis.WHICH = WHICH;

let top_bar_height = 0;
let bottom_bar_height = 0;
let last_reserved_signature = "";
const OPEN_WINDOW_ANIMATION = "none";
const OPEN_WINDOW_ANIMATION_DURATION_SCALE = 1;
const OPEN_WINDOW_ANIMATION_FOLLOW_WINDOW = true;
const screen_shader_path = `${themedir}/components/gridlines.frag`;
const open_window_scanline_template_path = OPEN_WINDOW_ANIMATION !== "none"
  ? `${themedir}/components/window_open_scanline.frag`
  : "";
const open_window_scanline_runtime_path = OPEN_WINDOW_ANIMATION !== "none"
  ? "/tmp/yorha-window-open-scanline.frag"
  : "";
start_hyprland_shader_sync(
  screen_shader_path,
  open_window_scanline_template_path,
  open_window_scanline_runtime_path,
  OPEN_WINDOW_ANIMATION,
  OPEN_WINDOW_ANIMATION_DURATION_SCALE,
  OPEN_WINDOW_ANIMATION_FOLLOW_WINDOW,
);

const apply_reserved = () => {
  const signature = `${top_bar_height}:${bottom_bar_height}`;
  if (signature === last_reserved_signature) {
    return Promise.resolve();
  }

  last_reserved_signature = signature;
  return execAsync(
    `hyprctl keyword monitor ,addreserved,${top_bar_height},${bottom_bar_height},0,0`
  ).catch((error) => {
    last_reserved_signature = "";
    print(error);
  });
};

const schedule_reserved_refresh = (delays = [0, 250, 1000]) => {
  delays.forEach((delay) => {
    Utils.timeout(delay, () => apply_reserved());
  });
};


const top = () =>
  Box({
    vertical: true,
    hexpand: false,
    classNames: ["top"],
    css: `min-width: ${SCREEN_WIDTH}px;`,
    children: [
      Box({
        spacing: top_spacing,
        hpack: "fill",
        // css: `min-width: ${SCREEN_WIDTH/2}px;`,
        children: [
          Scrollable({
            css: `min-width: ${workspace_width}px;min-height: ${workspace_height}px;`,
            child:Workspaces({}),
          }),
          Button({
            hpack: "end",
            hexpand: true,
            classNames: ["settings-button"],
            child: Icon({
              size: top_icon_size,
              icon: assetsDir() + "/yorha.png",
            }),
            setup: (button) => {
              button.connect("enter-notify-event" , (self) => {
                let right = button.parent.children[2];
                button.classNames = arradd(button.classNames, "hover");
                right.classNames = arradd(right.classNames, "hover");
              })
              button.connect("leave-notify-event" , (self) => {
                let right = button.parent.children[2];
                button.classNames = arrremove(button.classNames, "hover");
                right.classNames = arrremove(right.classNames, "hover");
              })
            },
            onClicked: () => {
              execAsync(`agsv1 -b settings -t settings`)
            },
          }),
          Box({
            hpack: "start",
            classNames: ["yorha-right"],
          }),
        ],
      }),
      NierBorder({
        classNames: ["under-workspaces"],
      }),
    ],
    setup: (box) => Utils.timeout(1000, () => {
      top_bar_height = box.get_allocation().height + 10;
      schedule_reserved_refresh();
    }),
  });

const Bar = ({ monitor } = {}) => {
  return Window({
    name: `bar`,
    classNames: ["bar"],
    monitor,
    margin: [0, 0],
    anchor: ["top", "left", "right"],
    exclusivity: "ignore",
    layer: "bottom",
    child: Box({
      css: "margin-top: 10px;",
      children: [top()],
    }),
  });
};

execAsync(`agsv1 -b player -c ${App.configDir}/windows/player/player.js`);
execAsync(`agsv1 -b lyrics -c ${App.configDir}/windows/player/lyrics.js`);
execAsync(`agsv1 -b settings -c ${App.configDir}/windows/settings/settings.js`);
execAsync(`agsv1 -b bg_bitwarden -c ${App.configDir}/windows/bitwarden/bitwardenbg.js`);
execAsync(`agsv1 -b bitwarden -c ${App.configDir}/windows/bitwarden/bitwarden.js`);
dark.connect("changed", () => {
  print("dark changed",dark.value);
  let colors_css_path = `${App.configDir}/style/color.scss`;
  let colors_css = Utils.readFile(`${App.configDir}/style/color-${dark.value?'dark':'light'}.scss`)
  Utils.writeFile(colors_css,colors_css_path).then(() => {
    exec(`sassc ${scss} ${css}`);
    App.resetCss();
    App.applyCss(css);
    print("done")
  })
  .catch((e) => {
    print("error",e);
  });

  execAsync(`agsv1 -b player -r dark.value=${dark.value}`).then(print);
  execAsync(`agsv1 -b lyrics -r dark.value=${dark.value}`).then(print);
  execAsync(`agsv1 -b notify -r dark.value=${dark.value}`).then(print);
  execAsync(`agsv1 -b settings -r dark.value=${dark.value}`).then(print);
  execAsync(`agsv1 -b bitwarden -r dark.value=${dark.value}`).then(print);

  let hyprconf = Utils.readFile(`${themedir}/theme.conf`);
  if (dark.value) {
    hyprconf = hyprconf.replaceAll("nier_light","nier_dark");
  } else {
    hyprconf = hyprconf.replaceAll("nier_dark","nier_light");
  }
  Utils.writeFile(hyprconf,`${themedir}/theme.conf`).then(()=>{
    print("reloaded hypr")
  }).catch((e) => print("error",e));
  schedule_reserved_refresh([250, 1000, 2000]);
}) 

execAsync(["bash","-c",`pkill dunst;agsv1 -b notify -c ${App.configDir}/windows/notifications/notifications.js`])


const BottomBar = ({ monitor } = {}) =>
  Window({
    name: "bottombar",
    monitor,
    margin: [0, 0],
    anchor: ["bottom", "left", "right"],
    exclusivity: "ignore",
    layer: "bottom",
    child: NierBorder({
      classNames: ["bottombar"],
      y_axis: true,
      setup: (self) =>
        Utils.timeout(1000, () => {
          bottom_bar_height = self.get_allocation().height + 12;
          schedule_reserved_refresh();
        }),
    }),
  });

export default {
  style: css,
  windows: [
    Bar(),
    // Bar({ monitor: 1}),
    BottomBar(),
  ],
};
