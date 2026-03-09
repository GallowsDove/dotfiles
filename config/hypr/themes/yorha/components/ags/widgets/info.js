import {
  App,
  Widget,
  Utils,
} from "../imports.js";
import { NierButton } from "../nier/buttons.js";

import { assetsDir,dark } from "../util.js";

const { Box, Label } = Widget;
const { execAsync } = Utils;

const formatInfoTime = () => {
  const now = new Date();
  const hours = String(now.getHours()).padStart(2, "0");
  const minutes = String(now.getMinutes()).padStart(2, "0");
  const seconds = String(now.getSeconds()).padStart(2, "0");

  return `${hours}:${minutes}:${seconds}`;
};

export const Info = ({
  useAssetsDir = assetsDir,
  parentDir = App.configDir
}) =>
  Box({
    hpack: "start",
    vpack: "end",
    hexpand: false,
    vexpand: false,
    classNames: ["info"],
    children: [
      Label({
        css: "margin-left:35px;",
        classNames: ["time"],
        label: "00:00:00",
        setup: (self) => {
          self.label = formatInfoTime();
        },
        connections: [
          [
            1000,
            (self) => {
              self.label = formatInfoTime();
            },
          ],
        ],
      }),
      NierButton({
        useAssetsDir,
        label: dark.value ? "Dark" : "Light",
        handleClick: async () => {
          await execAsync(`agsv1 -b settings -r App.closeWindow("settings")`).catch(print);
          await execAsync(`agsv1 -b bg_settings -r closeBgSettings()`).catch(print);
          await new Promise((resolve) => {
            setTimeout(resolve, 1000);
          });
          await execAsync(`agsv1 -b banner -q`).catch(() => null);
          await execAsync(`agsv1 -b banner -c ${parentDir + "/windows/banner/banner.js"}`).catch(print);
        }
      }),
    ],
  });
