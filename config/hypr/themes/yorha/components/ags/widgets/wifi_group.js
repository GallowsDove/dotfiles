import { Widget, Network, Variable, Utils } from "../imports.js";
import { NierButton } from "../nier/buttons.js";
import { NierDropDownButton } from "../nier/dropdown.js";
import { button_label_2, settings_title_bottom, settings_title_top } from "../scaling.js";
import { SCREEN_WIDTH, arradd, arrremove, assetsDir } from "../util.js";

const { Label, Entry, Box } = Widget;
const { execAsync } = Utils;

const shell_quote = (value) => `'${String(value).replace(/'/g, `'\\''`)}'`;

const wifi_band_label = (frequency) => {
  if (!frequency) {
    return "? GHz";
  }

  return frequency >= 5000 ? "5 GHz" : "2.4 GHz";
};

const format_ap_label = (ap) =>
  `${ap.ssid || "Hidden Network"} | ${wifi_band_label(ap.frequency)} | ${ap.strength || 0}%`;

const parse_nmcli_wifi_list = (output) =>
  output
    .split("\n")
    .map((line) => line.trim())
    .filter(Boolean)
    .map((line) => {
      const parts = line.split(":");
      const in_use = parts.shift() || "";
      const frequency_raw = parts.pop() || "";
      const signal_raw = parts.pop() || "0";
      const security = parts.pop() || "";
      const ssid = parts.join(":");

      return {
        active: in_use.includes("*"),
        ssid,
        security,
        strength: Number.parseInt(signal_raw, 10) || 0,
        frequency: Number.parseInt(frequency_raw, 10) || 0,
      };
    })
    .filter((ap) => ap.ssid);

const parse_saved_wifi_connections = (output) =>
  output
    .split("\n")
    .map((line) => line.trim())
    .filter(Boolean)
    .map((line) => {
      const [name, type] = line.split(":");
      return { name, type };
    })
    .filter((connection) => connection.type === "802-11-wireless" && connection.name);

const sort_networks = (networks) =>
  networks.sort((left, right) => {
    if (Boolean(right.active) !== Boolean(left.active)) {
      return Number(Boolean(right.active)) - Number(Boolean(left.active));
    }

    return (right.strength || 0) - (left.strength || 0);
  });

const is_secure_network = (network) => Boolean(network?.security && network.security !== "--");

const error_needs_password = (error) =>
  /secrets were required|no secrets|password|psk|802-1x|authentication/i.test(
    `${error}`
  );

const wrong_password_error = (error) =>
  /secrets were required|bad secrets|invalid wifi password|wrong password/i.test(`${error}`);

const get_network_state_label = (network) => {
  if (network.active) {
    return "CONNECTED";
  }

  if (network.saved) {
    return "SAVED";
  }

  return is_secure_network(network) ? "SECURED" : "OPEN";
};

export const WifiGroup = ({
  go_to = async (buttons, parent_button) => {},
  enabled = Variable(Network.wifi.enabled ? "On" : "Off", {}),
  passAssetsDir = assetsDir,
  set_page2_selected = (button) => {},
}) => {
  let currentNetworks = [];
  let networkList = null;
  let selectedNetworkSsid = null;

  const status_css =
    "margin-left: 35px; margin-right: 60px; margin-top: 8px; margin-bottom: 22px; font-size: 26px; font-weight: 600; color: rgba(72, 70, 61, 0.92);";

  const render_network_list = () => {
    if (!networkList) {
      return;
    }

    const hasSelectedRow = Boolean(
      networkList.children?.some(
        (child) =>
          child?.classNames?.includes("nier-button-container") &&
          child.child?.children?.[1]?.child?.classNames?.includes("nier-button-box-selected")
      )
    );

    if (!hasSelectedRow) {
      selectedNetworkSsid = null;
    }

    networkList.children = currentNetworks.length
      ? currentNetworks.map(network_button)
      : [
          Label({
            hpack: "start",
            wrap: true,
            label: "No networks found.",
            css: "margin-left: 35px; margin-right: 60px; margin-top: 4px; margin-bottom: 6px; font-size: 22px; color: rgba(72, 70, 61, 0.86);",
          }),
        ];
  };

  const apply_selected_state = (button) => {
    if (!button) {
      return;
    }

    button.child.classNames = arradd(
      button.child.classNames,
      "nier-button-box-selected"
    );
    button.parent.classNames = arradd(
      button.parent.classNames,
      "nier-button-container-selected"
    );
  };

  const remove_selected_state = (button) => {
    if (!button) {
      return;
    }

    button.child.classNames = arrremove(
      button.child.classNames,
      "nier-button-box-selected"
    );
    button.parent.classNames = arrremove(
      button.parent.classNames,
      "nier-button-container-selected"
    );
  };

  const clear_all_selected_network_buttons = () => {
    if (!networkList?.children) {
      return;
    }

    networkList.children.forEach((child) => {
      if (!child?.classNames?.includes("nier-button-container")) {
        return;
      }

      const button = child.child?.children?.[1];
      if (button) {
        remove_selected_state(button);
      }
    });
  };

  const sync_selected_network_button = (button, ssid) => {
    clear_all_selected_network_buttons();
    selectedNetworkSsid = ssid;
    apply_selected_state(button);
    set_page2_selected(button);
  };

  const get_current_network = (ssid) =>
    currentNetworks.find((network) => network.ssid === ssid) || null;

  const load_networks = async () => {
    const [wifiOutput, savedOutput] = await Promise.all([
      execAsync("nmcli -t -f IN-USE,SSID,SECURITY,SIGNAL,FREQ dev wifi list"),
      execAsync("nmcli -t -f NAME,TYPE connection show").catch((error) => {
        console.log(error);
        return "";
      }),
    ]);

    const savedConnections = new Set(
      parse_saved_wifi_connections(savedOutput).map((connection) => connection.name)
    );

    currentNetworks = sort_networks(parse_nmcli_wifi_list(wifiOutput)).map((network) => ({
      ...network,
      saved: savedConnections.has(network.ssid),
    }));
    render_network_list();
  };

  const set_connected_network = (ssid, { saved = null } = {}) => {
    currentNetworks = currentNetworks.map((network) => ({
      ...network,
      active: network.ssid === ssid,
      saved: network.ssid === ssid && saved !== null ? saved : network.saved,
    }));
    render_network_list();
  };

  const mark_network_forgotten = (ssid) => {
    currentNetworks = currentNetworks.map((network) =>
      network.ssid === ssid ? { ...network, saved: false } : network
    );
    render_network_list();
  };

  const mark_network_disconnected = (ssid) => {
    currentNetworks = currentNetworks.map((network) =>
      network.ssid === ssid ? { ...network, active: false } : network
    );
    render_network_list();
  };

  const connect_open_network = async (network) => {
    try {
      await execAsync(`nmcli connection up ${shell_quote(network.ssid)}`);
    } catch (error) {
      console.log(error);

      try {
        await execAsync(`nmcli device wifi connect ${shell_quote(network.ssid)}`);
      } catch (connectError) {
        console.log(connectError);
        return { failed: true };
      }
    }

    set_connected_network(network.ssid, { saved: true });
    return { connected: true };
  };

  const connect_saved_secure_network = async (network) => {
    try {
      await execAsync(`nmcli connection up ${shell_quote(network.ssid)}`);
      set_connected_network(network.ssid);
      return { connected: true };
    } catch (error) {
      console.log(error);
      if (error_needs_password(error)) {
        return { requiresPassword: true };
      }
    }

    try {
      await execAsync(`nmcli device wifi connect ${shell_quote(network.ssid)}`);
      set_connected_network(network.ssid, { saved: true });
      return { connected: true };
    } catch (error) {
      console.log(error);
      return error_needs_password(error) ? { requiresPassword: true } : { failed: true };
    }
  };

  const connect_with_password = async (network, password) => {
    try {
      await execAsync(
        `nmcli device wifi connect ${shell_quote(network.ssid)} password ${shell_quote(password)}`
      );
      set_connected_network(network.ssid, { saved: true });
      return { connected: true };
    } catch (error) {
      console.log(error);
      currentNetworks = currentNetworks.map((candidate) =>
        candidate.ssid === network.ssid ? { ...candidate, saved: true } : candidate
      );
      render_network_list();
      return wrong_password_error(error)
        ? { wrongPassword: true }
        : { failed: true };
    }
  };

  const forget_saved_network = async (network) => {
    try {
      await execAsync(`nmcli connection delete id ${shell_quote(network.ssid)}`);
      mark_network_forgotten(network.ssid);
      return { forgot: true };
    } catch (error) {
      console.log(error);
      return { failed: true };
    }
  };

  const disconnect_network = async (network) => {
    try {
      await execAsync(`nmcli connection down id ${shell_quote(network.ssid)}`);
      mark_network_disconnected(network.ssid);
      return { disconnected: true };
    } catch (error) {
      console.log(error);
      return { failed: true };
    }
  };

  const show_network_management_page = async (
    initialNetwork,
    parent_button = null,
    { promptForPassword = false, statusMessage = null } = {}
  ) => {
    let entryWidget = null;
    let statusLabel = null;
    let network = get_current_network(initialNetwork.ssid) || initialNetwork;

    const shouldShowPasswordInput =
      promptForPassword && is_secure_network(network) && !network.active;
    const actionLabel = network.active ? "Disconnect" : "Connect";

    const set_status = (value) => {
      if (statusLabel) {
        statusLabel.label = value;
      }
    };

    const submit_password = async () => {
      const text = entryWidget?.text || "";
      if (!text) {
        set_status("Enter a password first");
        return;
      }

      set_status(`Connecting to ${network.ssid}...`);
      const result = await connect_with_password(network, text);
      if (result.connected) {
        network = get_current_network(network.ssid) || { ...network, saved: true, active: true };
        await show_network_management_page(network, parent_button, {
          statusMessage: `Connected to ${network.ssid}`,
        });
        return;
      }

      network = get_current_network(network.ssid) || { ...network, saved: true };
      await show_network_management_page(network, parent_button, {
        promptForPassword: true,
        statusMessage: result.wrongPassword
          ? "Incorrect password"
          : `Failed to connect to ${network.ssid}`,
      });
    };

    await go_to(
      [
        Label({
          hpack: "start",
          label: "WIFI NETWORK",
          classNames: ["heading"],
          css: `margin-top: ${settings_title_top}px;margin-bottom: ${settings_title_bottom}px;`,
        }),
        Label({
          hpack: "start",
          label: network.ssid,
          classNames: ["heading"],
          css: `margin-left: 35px; margin-right: 60px; font-size: 32px; margin-bottom: ${settings_title_bottom}px;`,
        }),
        Label({
          hpack: "start",
          wrap: true,
          label:
            statusMessage ||
            (shouldShowPasswordInput
              ? `Enter the password for ${network.ssid}`
              : `Manage ${network.ssid}`),
          css: status_css,
          xalign: 0,
          justification: "left",
          setup: (self) => {
            statusLabel = self;
          },
        }),
        ...(shouldShowPasswordInput
          ? [
              Entry({
                classNames: ["app-launcher-search"],
                placeholderText: "password",
                visibility: false,
                css: "margin-left: 35px; margin-right: 60px; margin-bottom: 20px; margin-top: 10px;",
                onAccept: submit_password,
                setup: (self) =>
                  Utils.timeout(1, () => {
                    entryWidget = self;
                    self.grab_focus();
                  }),
              }),
            ]
          : []),
        NierButton({
          useAssetsDir: passAssetsDir,
          font_size: button_label_2,
          label: actionLabel,
          handleClick: async () => {
            if (network.active) {
              set_status(`Disconnecting ${network.ssid}...`);
              const result = await disconnect_network(network);
              if (result.disconnected) {
                await show_network_management_page(
                  { ...network, active: false },
                  parent_button,
                  { statusMessage: `Disconnected from ${network.ssid}` }
                );
                return;
              }

              set_status(`Failed to disconnect ${network.ssid}`);
              return;
            }

            if (shouldShowPasswordInput) {
              await submit_password();
              return;
            }

            set_status(`Connecting to ${network.ssid}...`);

            const result = is_secure_network(network)
              ? await connect_saved_secure_network(network)
              : await connect_open_network(network);

            if (result.connected) {
              network = get_current_network(network.ssid) || { ...network, active: true };
              await show_network_management_page(network, parent_button, {
                statusMessage: `Connected to ${network.ssid}`,
              });
              return;
            }

            if (result.requiresPassword) {
              network = get_current_network(network.ssid) || network;
              await show_network_management_page(network, parent_button, {
                promptForPassword: true,
                statusMessage: `Enter the password for ${network.ssid}`,
              });
              return;
            }

            set_status(`Failed to connect to ${network.ssid}`);
          },
        }),
        ...(network.saved
          ? [
              NierButton({
                useAssetsDir: passAssetsDir,
                font_size: button_label_2,
                label: "Forget",
                children: [
                  Label({
                    classNames: ["nier-option-item"],
                    hpack: "end",
                    label: "REMOVE",
                  }),
                ],
                handleClick: async () => {
                  set_status(`Forgetting ${network.ssid}...`);
                  const result = await forget_saved_network(network);
                  if (result.forgot) {
                    await show_network_management_page(
                      { ...network, saved: false, active: false },
                      parent_button,
                      {
                        promptForPassword: is_secure_network(network),
                        statusMessage: is_secure_network(network)
                          ? `Enter the password for ${network.ssid}`
                          : `Forgot ${network.ssid}`,
                      }
                    );
                    return;
                  }

                  set_status(`Failed to forget ${network.ssid}`);
                },
              }),
            ]
          : []),
      ],
      parent_button
    );
  };

  const network_button = (network) => {
    let stateLabel = null;
    let busy = false;

    const set_state = (value) => {
      if (stateLabel) {
        stateLabel.label = value;
      }
    };

    return NierButton({
      useAssetsDir: passAssetsDir,
      font_size: button_label_2,
      label: format_ap_label(network),
      max_label_chars: 42,
      homogeneous_button: false,
      children: [
        Label({
          classNames: ["nier-option-item"],
          hpack: "end",
          label: get_network_state_label(network),
          setup: (self) => {
            stateLabel = self;
          },
        }),
      ],
      setup: (self) => {
        if (selectedNetworkSsid === network.ssid) {
          Utils.timeout(1, () => {
            apply_selected_state(self);
            set_page2_selected(self);
          });
        }
      },
      handleClick: async (self) => {
        sync_selected_network_button(self, network.ssid);
        if (busy) {
          return;
        }

        if (network.saved || is_secure_network(network)) {
          await show_network_management_page(network, self, {
            promptForPassword: is_secure_network(network) && !network.saved && !network.active,
          });
          return;
        }

        busy = true;
        set_state("CONNECTING");

        try {
          const result = await connect_open_network(network);
          if (!result.connected) {
            set_state("FAILED");
            return;
          }
        } finally {
          busy = false;
          set_state(get_network_state_label(network));
        }
      },
    });
  };

  networkList = Box({
    vertical: true,
    spacing: 10,
    setup: (self) => {
      networkList = self;
      Utils.timeout(1, () => {
        load_networks().catch((error) => {
          console.log(error);
          self.children = [
            Label({
              hpack: "start",
              wrap: true,
              label: "Failed to load networks.",
              css: "margin-left: 35px; margin-right: 60px; margin-top: 4px; margin-bottom: 6px; font-size: 22px; color: rgba(72, 70, 61, 0.86);",
            }),
          ];
        });
      });
    },
  });

  return [
    Label({
      hpack: "start",
      label: "WIFI",
      classNames: ["heading"],
      css: `margin-top: ${settings_title_top}px;margin-bottom: ${settings_title_bottom}px;`,
    }),
    NierDropDownButton({
      useAssetsDir: passAssetsDir,
      font_size: button_label_2,
      label: "Enabled",
      current: enabled,
      options: Variable(["On", "Off"], {}),
      popup_x_offset: SCREEN_WIDTH / 4,
      onChange: async (value) => {
        Network.wifi.enabled = value === "On";
        enabled.setValue(value);
      },
      connections: [
        [
          Network,
          async () => {
            enabled.setValue(Network.wifi.enabled ? "On" : "Off");
          },
          "changed",
        ],
      ],
    }),
    NierButton({
      useAssetsDir: passAssetsDir,
      font_size: button_label_2,
      label: "Rescan",
      handleClick: async () => {
        await load_networks();
      },
    }),
    Label({
      hpack: "start",
      label: "NETWORKS",
      classNames: ["heading"],
      css: `margin-top: ${settings_title_top}px;margin-bottom: ${settings_title_bottom}px;`,
    }),
    networkList,
  ];
};
