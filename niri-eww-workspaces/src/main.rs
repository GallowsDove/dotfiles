use std::env;
use niri_ipc::{socket::Socket, Event, Request, Window, Workspace};
use crate::serializable::SerializableState;

mod serializable;

fn main() {
    let args: Vec<String> = env::args().collect();
    let monitor = args[1].clone();

    let mut state = State::new();
    let mut connection = Socket::connect().unwrap();
    let r = connection.send(Request::EventStream).unwrap();
    match r {
        Ok(_) => {
            let mut read_event = connection.read_events();
            loop {
                let event = read_event().unwrap();
                state.update_with_event(event);
                let serializable_state = SerializableState::from(&state);
                //let json = serde_json::to_string(&serializable_state).unwrap();
                let eww = serializable_state.to_eww(monitor.clone());
                println!("{}", eww);
            }
        },
        Err(e) => {
            eprintln!("Niri error: {}", e);
            std::process::exit(1);
        }
    }
}

#[derive(Debug, Default)]
struct State {
    workspaces: Vec<Workspace>,
    windows: Vec<Window>,
}

impl State {
    fn new() -> Self {
        Self::default()
    }

    /// https://yalter.github.io/niri/niri_ipc/enum.Event.html
    fn update_with_event(&mut self, e: Event) {
        match e {
            Event::WorkspacesChanged { workspaces } => self.workspaces = workspaces,
            Event::WorkspaceActivated { id, focused } => {
                // If this workspace is focused, unfocus all others
                if focused {
                    for workspace in &mut self.workspaces {
                        workspace.is_focused = false;
                    }
                }

                // Find and update the activated workspace
                let activated_output = match self.workspaces.iter_mut().find(|w| w.id == id) {
                    Some(workspace) => {
                        workspace.is_active = true;
                        workspace.is_focused = focused;
                        workspace.output.clone()
                    }
                    None => panic!("Workspace not found"),
                };

                // Deactivate other workspaces on the same output
                if activated_output.is_some() {
                    for workspace in &mut self.workspaces {
                        if workspace.id != id && workspace.output == activated_output {
                            workspace.is_active = false;
                        }
                    }
                }
            }
            Event::WorkspaceActiveWindowChanged {
                workspace_id,
                active_window_id,
            } => {
                if let Some(workspace) = self.workspaces.iter_mut().find(|w| w.id == workspace_id) {
                    workspace.active_window_id = active_window_id;
                }
            }
            Event::WindowsChanged { windows } => self.windows = windows,
            Event::WindowOpenedOrChanged { window } => {
                if window.is_focused {
                    // All other windows become not focused
                    for window in self.windows.iter_mut() {
                        window.is_focused = false;
                    }
                }

                // Change or add window
                if let Some(w) = self.windows.iter_mut().find(|w| w.id == window.id) {
                    *w = window;
                } else {
                    self.windows.push(window);
                }
            }
            Event::WindowClosed { id } => {
                self.windows.retain(|w| w.id != id);
            }
            Event::WindowFocusChanged { id } => {
                // All other windows become not focused
                for window in self.windows.iter_mut() {
                    window.is_focused = false;
                }

                // If a window is meant to be focused
                if let Some(id) = id {
                    if let Some(window) = self.windows.iter_mut().find(|w| w.id == id) {
                        window.is_focused = true;
                    }
                }
            }
            Event::WindowLayoutsChanged { changes } => {
                for (id, window_layout) in changes {
                    if let Some(window) = self.windows.iter_mut().find(|w| w.id == id) {
                        window.layout = window_layout;
                    }
                }
            }
            Event::KeyboardLayoutsChanged { .. } => { /* Do nothing */ }
            Event::KeyboardLayoutSwitched { .. } => { /* Do nothing */ }
            Event::WorkspaceUrgencyChanged { .. } => { /* Do nothing */ }
            Event::WindowUrgencyChanged { .. } => { /* Do nothing */ }
            Event::OverviewOpenedOrClosed { .. } => { /* Do nothing */ }
            Event::ConfigLoaded { .. } => { /* Do nothing */ }
        }
    }
}