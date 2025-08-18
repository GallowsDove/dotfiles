use serde::{Serialize, Serializer};
use std::collections::BTreeMap;
use icon::Icons;
use crate::State;

/// Serializable state ready to be consumed by Eww as Json
#[derive(Serialize)]
pub(crate) struct SerializableState {
    outputs: BTreeMap<String, Output>,
}

#[derive(Serialize)]
struct Output {
    #[serde(serialize_with = "ordered_map_as_list")]
    workspaces: BTreeMap<u64, Workspace>,
}
#[derive(Serialize)]
struct Workspace {
    id: u64,
    index: u8,
    #[serde(serialize_with = "ordered_map_as_list")]
    columns: BTreeMap<usize, Column>,
    is_active: bool,
}

#[derive(Serialize)]
struct Column {
    index: usize,
    #[serde(serialize_with = "ordered_map_as_list")]
    windows: BTreeMap<usize, Window>,
    num_windows: usize,
    has_focused_window: bool,
}

#[derive(Serialize)]
struct Window {
    id: u64,
    column: usize,
    is_focused: bool,
    app_id: Option<String>,
    icon: String
}

fn ordered_map_as_list<S, T>(
    map: &BTreeMap<T, impl Serialize>,
    serializer: S,
) -> Result<S::Ok, S::Error>
where
    S: Serializer,
{
    let list: Vec<_> = map.values().collect();
    list.serialize(serializer)
}

impl From<&State> for SerializableState {
    fn from(state: &State) -> Self {
        // first create the workspaces - without windows, then populate the windows
        let mut outputs = BTreeMap::<String, Output>::new();
        for workspace in state.workspaces.iter() {
            let output_name = if let Some(output) = &workspace.output {
                output
            } else {
                continue;
            };

            let output = outputs
                .entry(output_name.clone())
                .or_insert_with(|| Output {
                    workspaces: BTreeMap::new(),
                });

            output.workspaces.insert(
                workspace.id,
                Workspace {
                    id: workspace.id,
                    index: workspace.idx,
                    columns: BTreeMap::new(),
                    is_active: workspace.is_active,
                },
            );
        }

        // populate the windows
        for window in state.windows.iter() {
            // We only care about non-floating windows
            if window.is_floating {
                continue;
            }
            // We only care about windows with a workspace (that exists)
            let workspace = match window.workspace_id {
                Some(workspace_id) => outputs
                    .values_mut()
                    .flat_map(|output| output.workspaces.values_mut())
                    .find(|workspace| workspace.id == workspace_id)
                    .expect("Workspace id set for window not found in state's workspaces"),
                None => continue,
            };

            let column_index = window
                .layout
                .pos_in_scrolling_layout
                .expect(
                    "Tile position not set, something is wrong, non-floating windows should have a tile position",
                )
                .0;

            let column = workspace
                .columns
                .entry(column_index)
                .or_insert_with(|| Column {
                    index: column_index,
                    windows: BTreeMap::new(),
                    num_windows: 0,
                    has_focused_window: false,
                });

            let mut icon = None;
            let icons = Icons::new();
            if let Some(app_id) = &window.app_id {
                if let Some(icon_file) = icons.find_icon(app_id, 128, 1, "Dracula") {
                    icon = Some(icon_file.path.into_os_string().into_string().unwrap());
                }
            }

            if icon.is_none() {
                if window.app_id == Some(String::from("jetbrains-idea")) {
                    if let Some(icon_file) = icons.find_icon("jetbrains-intellij-idea", 128, 1, "Dracula") {
                        icon = Some(icon_file.path.into_os_string().into_string().unwrap());
                    }
                }
            }
            if icon.is_none() {
                icon = Some(String::from("/usr/share/icons/Dracula/scalable/apps/applications-other.svg"));
            }

            if window.is_focused {
                column.has_focused_window = true;
            }
            column.windows.insert(window.layout.pos_in_scrolling_layout.unwrap().1, Window {
                id: window.id,
                column: column_index,
                is_focused: window.is_focused,
                app_id: window.app_id.clone(),
                icon: icon.expect("Window icon should be set, fallback should not be empty"),
            });
        }

        SerializableState { outputs }
    }
}

impl SerializableState {
    pub fn to_eww(&self, monitor: String) -> String {
        let mut out = String::new();
        out.push_str("(box :orientation \"h\" :hexpand false :vexpand false  :class \"workspaces-bar\" :space-evenly false\n");

        // ----- left: workspaces -----
        out.push_str("  (box :orientation \"h\" :hexpand false :vexpand false :class \"workspaces\"\n");
        if let Some(output) = self.outputs.get(&monitor) {
            for (_id, wsp) in &output.workspaces {
                let is_active_cls = if wsp.is_active { " active" } else { "" };
                let empty_cls = if wsp.columns.is_empty() { " empty" } else { "" };
                let bullet = if wsp.is_active { "" } else { "" };
                out.push_str(&format!(
                    "    (eventbox :cursor \"pointer\"\n      (button :onclick \"niri msg action focus-workspace {}\"\n        (box :class \"workspace{}{}\"\n          (label :text \"{}\"))))\n",
                    wsp.index, is_active_cls, empty_cls, yuck_escape(bullet)
                ));
            }
        }
        out.push_str("  )\n");

        // ----- right: columns of active workspace(s) -----
        out.push_str("  (box :orientation \"h\" :hexpand false :vexpand false :halign \"start\" :space-evenly false :class \"columns\"\n");
        if let Some(output) = self.outputs.get(&monitor) {
            for (_id, wsp) in &output.workspaces {
                if !wsp.is_active {
                    continue;
                }

                for (_cidx, col) in &wsp.columns {
                    let focused_cls = if col.has_focused_window { " focused" } else { "" };
                    out.push_str(&format!(
                        "    (box :orientation \"h\" :hexpand false :vexpand false :halign \"start\" :space-evenly false :class \"column{}\"\n",
                        focused_cls
                    ));

                    if !col.windows.is_empty() {
                        for (_cidx, win) in &col.windows {
                            let focus_cls = if win.is_focused { " focused" } else { "" };

                            out.push_str(&format!("      (eventbox :class \"window-eventbox\" :cursor \"pointer\" :onclick \"niri msg action focus-window --id {} && niri msg action focus-workspace {}\"\n", win.id, wsp.index));

                            out.push_str(&format!(
                                "        (box :orientation \"h\" :hexpand false :vexpand false :halign \"start\" :space-evenly false :class \"window{}\"\n",
                                focus_cls
                            ));


                            let mut image_path = String::new();
                            image_path.push_str(&win.icon);
                            if image_path.is_empty() {
                                // fallback: show app_id or window id
                                if let Some(app) = &win.app_id {
                                    image_path.push_str(app);
                                } else {
                                    image_path.push_str(&format!("#{}", win.id));
                                }
                            }

                            out.push_str(&format!(
                                "          (image :class \"window-icon{}\" :path \"{}\" :image-width 32 :image-height 32)\n",
                                focus_cls,
                                yuck_escape(&image_path)
                            ));
                            out.push_str("      ))\n"); // /box window
                        }
                    }
                    out.push_str("    )\n"); // /box column
                }

                out.push_str("(box :orientation \"h\" :hexpand true :vexpand false :class \"spacer\")");
                out.push_str("  )\n"); // /box columns
            }
        }
        out.push_str(")"); // /box workspaces-bar
        out = out.replace("\n", "");
        out
    }
}

fn yuck_escape(s: &str) -> String {
    // minimal escaping for yuck strings
    s.replace('\\', "\\\\").replace('"', "\\\"")
}
