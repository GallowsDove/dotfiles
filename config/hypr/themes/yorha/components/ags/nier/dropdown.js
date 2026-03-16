import { Widget, Variable, Utils } from "../imports.js";
import { button_label_2 } from "../scaling.js";
import {
  arradd,
  arrremove,
  assetsDir,
  registerActivePopup,
  clearActivePopup,
} from "../util.js";
import { NierButton } from "./buttons.js";
const { Gdk } = imports.gi;
const Pango = imports.gi.Pango;
const { Label, EventBox, Box, Icon } = Widget;

export const NierDropDownButton = ({
  label = "",
  classNames = [],
  containerClassNames = [],
  containerConnections = [],
  connections = [],
  passedOnHoverLost = async (self) => {
    return true;
  },
  passedOnHover = async (self) => {
    return true;
  },
  options = Variable([], {}),
  size = button_label_2,
  current = Variable("", {}),
  current_max_chars = 22,
  option_max_chars = 28,
  onChange = async () => {},
  popup_window = null,
  in_focus = false,
  popup_in_focus = false,
  popup_x_offset = 0,
  useAssetsDir = assetsDir,
  setup = () => {},
  ...props
}) => {
  const closePopup = () => {
    if (!popup_window) {
      return;
    }

    const activePopup = popup_window;
    popup_window = null;
    activePopup.destroy();
  };

  return NierButton({
    useAssetsDir,
    label,
    homogeneous_button: false,
    classNames: ["nier-dropdown-button", ...classNames],
    containerClassNames: [
      "nier-dropdown-button-container",
      ...containerClassNames,
    ],
    containerConnections,
    passedOnHoverLost: async (self) => {
      console.log("hover lost");
      self.child.classNames = arrremove(
        self.child.classNames,
        "nier-button-box-hover-from-selected"
      );
      return true;
    },
    setup: (self) => {
      setup(self);

      for (const [source, callback, signal] of connections) {
        if (typeof source === "number") {
          self.poll(source, () => callback(self));
          continue;
        }

        self.hook(source, () => callback(self), signal);
      }
    },
    handleClick: async (self, event) => {
      self.child.classNames = arradd(
        self.child.classNames,
        "nier-button-box-selected"
      );
      let alloc = self.get_allocation();
      console.log(alloc.x, alloc.y);
      console.log("click");
      await new Promise((resolve) => {
        setTimeout(resolve, 200);
      });
      if (popup_window) {
        closePopup();
        return;
      }
      popup_window = NierSelectMenu({
        coord_x: alloc.x + alloc.width + popup_x_offset,
        coord_y: alloc.y,
        button: self,
        current,
        onChange,
        options,
        option_max_chars,
        useAssetsDir,
        closeMenu: closePopup,
        onClose: () => {
          clearActivePopup(closePopup);
          popup_window = null;
        },
      });
      registerActivePopup(closePopup, popup_window);
    },
    children: [
      Box({
        hexpand: true,
        hpack: "end",
        child: Label({
          classNames: ["nier-option-item"],
          hpack: "end",
          max_width_chars: current_max_chars,
          xalign: 1,
          wrap: false,
          binds: [["label", current, "value"]],
          setup: (self) =>
            Utils.timeout(1, () => {
              self.set_ellipsize(Pango.EllipsizeMode.END);
            }),
        }),
      }),
    ],
    ...props,
  });
};

export const NierSelectMenu = ({
  coord_x = 0,
  coord_y = 0,
  size = button_label_2,
  spacing = 20,
  button = null,
  current,
  onChange = async () => {},
  options,
  option_max_chars = 28,
  useAssetsDir,
  closeMenu = () => {},
  onClose = () => {},
}) =>
  Box({
    hpack: "start",
    vpack: "start",
    setup: (self) =>
      Utils.timeout(1, () => {
        self.connect("destroy", async (self) => {
          onClose();
          button.child.classNames = arrremove(
            button.child.classNames,
            "nier-button-box-selected"
          );
          button.child.classNames = arradd(
            button.child.classNames,
            "nier-button-box-hover-from-selected"
          );
          await new Promise((resolve) => {
            setTimeout(resolve, 500);
          });
          button.child.classNames = arrremove(
            button.child.classNames,
            "nier-button-box-hover-from-selected"
          );
        });
      }),
    child: Box({
      vertical: true,
      classNames: ["nier-option-menu"],
      connections: [
        [
          options,
          (self) => {
            self.children = [
              Box({
                children: [
                  Box({
                    spacing,
                    children: [
                      Box({
                        classNames: ["nier-option-header"],
                        child: Box({
                          classNames: ["nier-option-header-inner"],
                        }),
                      }),
                      Icon({
                        icon: useAssetsDir() + "/nier-pointer-rev.svg",
                        size: size,
                        css: "opacity: 0;",
                        classNames: ["nier-button-hover-icon"],
                      }),
                    ],
                  }),
                ],
              }),

              ...Array.from(options.value, (option) => {
                return NierOptionItem({
                  label: option,
                  size,
                  spacing,
                  button,
                  current,
                  onChange,
                  option_max_chars,
                  useAssetsDir,
                  closeMenu,
                });
              }),
            ];
          },
        ],
      ],
      css: `margin-left: ${coord_x}px; margin-top: ${coord_y}px;`,
    }),
  });

export const NierOptionItem = ({
  label = "",
  size = button_label_2,
  spacing = 20,
  button,
  current,
  onChange = async () => {},
  option_max_chars = 28,
  useAssetsDir,
  closeMenu,
}) => {
  const setHoverState = (self, hovered) => {
    let button = self.child;
    let cursor = self.parent.children[1];
    let container = self.parent;

    if (hovered) {
      button.classNames = arradd(button.classNames, "nier-button-hover");
      cursor.classNames = [
        "nier-button-hover-icon",
        "nier-button-hover-icon-visible",
      ];
      container.classNames = arradd(
        container.classNames,
        "nier-button-container-hover"
      );
    } else {
      button.classNames = arrremove(button.classNames, "nier-button-hover");
      cursor.classNames = [
        "nier-button-hover-icon",
        "nier-button-hover-icon-hidden",
      ];
      container.classNames = arrremove(
        container.classNames,
        "nier-button-container-hover"
      );
    }

    return true;
  };

  return Box({
    classNames: ["nier-button-container", "nier-option-container"],
    spacing,
    setup: (self) =>
      Utils.timeout(1, () => {
        let label = button.child.centerWidget.children[1];
        if (self.children[0].child.children[0].label == label.label) {
          self.classNames = arradd(self.classNames, "nier-option-selected");
        } else {
          self.classNames = arrremove(self.classNames, "nier-option-selected");
        }
      }),
    children: [
      EventBox({
        onPrimaryClick: async (self) => {
          current.setValue(label);
          await onChange(label).catch((error) => {
            console.log(error);
          });
          closeMenu();
          return true;
        },
        setup: (self) =>
          Utils.timeout(1, () => {
            self.connect("enter-notify-event", (self) => {
              setHoverState(self, true);
            });
            self.connect("leave-notify-event", (self) => {
              setHoverState(self, false);
            });
          }),
        child: Box({
          classNames: ["nier-button"],
          children: [
            Label({
              label,
              max_width_chars: option_max_chars,
              xalign: 0,
              wrap: false,
              setup: (self) =>
                Utils.timeout(1, () => {
                  self.set_ellipsize(Pango.EllipsizeMode.END);
                }),
            }),
          ],
        }),
      }),
      Icon({
        icon: useAssetsDir() + "/nier-pointer-rev.svg",
        size: size,
        classNames: ["nier-button-hover-icon", "nier-button-hover-icon-hidden"],
      }),
    ],
  });
};
