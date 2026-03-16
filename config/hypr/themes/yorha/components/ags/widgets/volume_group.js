import { Widget, Audio, Variable, Utils } from "../imports.js";
import {  NierButton } from "../nier/buttons.js";
import { NierSliderButton } from "../nier/slider.js";
import { button_label_2, button_slider_width, settings_title_bottom, settings_title_top } from "../scaling.js";
import { arradd, arrremove, assetsDir } from "../util.js";

const {Label} = Widget;
const { execAsync } = Utils;

const audio_volume = (type) => Audio[type]?.volume || 0;

const shell_quote = (value) => `'${String(value).replace(/'/g, `'\\''`)}'`;

const title_case_words = (value) =>
  String(value)
    .split(/[\s._-]+/)
    .filter(Boolean)
    .map((part) => part.charAt(0).toUpperCase() + part.slice(1))
    .join(" ");

const clean_app_name = (stream) => {
  const rawName = stream?.name || stream?.stream?.name || "Application";
  const withoutExe = rawName.replace(/\.exe$/i, "");

  if (/^[a-z0-9._-]+$/i.test(withoutExe)) {
    return title_case_words(withoutExe);
  }

  return withoutExe;
};

const format_app_label = (stream) => {
  const appName = clean_app_name(stream);
  const detail = stream?.description || stream?.stream?.description || "";

  if (!detail || /^audio stream #\d+$/i.test(detail)) {
    return appName;
  }

  if (detail === appName || detail.startsWith(`${appName} - `)) {
    return appName;
  }

  const shortDetail = detail.length > 42 ? `${detail.slice(0, 39).trimEnd()}...` : detail;
  return `${appName} | ${shortDetail}`;
};

const stream_matches = (left, right) => {
  if (!left || !right) {
    return false;
  }

  return [
    left === right,
    left.id != null && right.id != null && `${left.id}` === `${right.id}`,
    left.name && right.name && left.name === right.name,
    left.description &&
      right.description &&
      left.description === right.description,
  ].some(Boolean);
};

const is_primary_output = (stream) => stream_matches(Audio.speaker, stream);

const output_candidates = (stream) => {
  const nested = stream?.stream || {};

  return [...new Set([
    stream?.id,
    nested?.id,
    stream?.name,
    nested?.name,
    stream?.description,
    nested?.description,
  ].filter((candidate) => candidate !== null && candidate !== undefined && `${candidate}`.length > 0))];
};

const get_pactl_sink_name = (stream) => {
  const nested = stream?.stream || {};
  const candidates = [stream?.name, nested?.name];

  return candidates.find((candidate) => candidate && `${candidate}`.length > 0) || null;
};

const get_pactl_source_name = (stream) => {
  const nested = stream?.stream || {};
  const candidates = [stream?.name, nested?.name];

  return candidates.find((candidate) => candidate && `${candidate}`.length > 0) || null;
};

const move_current_audio_to_sink = async (sinkName) => {
  if (!sinkName) {
    return;
  }

  let sinkInputs = "";

  try {
    sinkInputs = await execAsync("pactl list short sink-inputs");
  } catch (error) {
    console.log(error);
    return;
  }

  const inputIds = sinkInputs
    .split("\n")
    .map((line) => line.trim())
    .filter(Boolean)
    .map((line) => line.split(/\s+/)[0])
    .filter(Boolean);

  for (const inputId of inputIds) {
    try {
      await execAsync(`pactl move-sink-input ${shell_quote(inputId)} ${shell_quote(sinkName)}`);
    } catch (error) {
      console.log(error);
    }
  }
};

const move_current_recording_to_source = async (sourceName) => {
  if (!sourceName) {
    return;
  }

  let sourceOutputs = "";

  try {
    sourceOutputs = await execAsync("pactl list short source-outputs");
  } catch (error) {
    console.log(error);
    return;
  }

  const outputIds = sourceOutputs
    .split("\n")
    .map((line) => line.trim())
    .filter(Boolean)
    .map((line) => line.split(/\s+/)[0])
    .filter(Boolean);

  for (const outputId of outputIds) {
    try {
      await execAsync(`pactl move-source-output ${shell_quote(outputId)} ${shell_quote(sourceName)}`);
    } catch (error) {
      console.log(error);
    }
  }
};

const sync_output_button = (button, selected) => {
  if (!button?.child || !button?.parent) {
    return;
  }

  button.child.classNames = selected
    ? arradd(button.child.classNames, "nier-button-box-selected")
    : arrremove(button.child.classNames, "nier-button-box-selected");
  button.parent.classNames = selected
    ? arradd(button.parent.classNames, "nier-button-container-selected")
    : arrremove(button.parent.classNames, "nier-button-container-selected");
};

const set_primary_output = async (stream) => {
  if (!stream || is_primary_output(stream)) {
    return;
  }

  const sinkName = get_pactl_sink_name(stream);

  try {
    if (sinkName) {
      await execAsync(`pactl set-default-sink ${shell_quote(sinkName)}`);
      await move_current_audio_to_sink(sinkName);
      Audio.speaker = stream;
      return;
    }
  } catch (error) {
    console.log(error);
  }

  const candidates = output_candidates(stream);

  for (const candidate of candidates) {
    try {
      await execAsync(`wpctl set-default ${shell_quote(candidate)}`);
      Audio.speaker = stream;
      return;
    } catch (error) {
      console.log(error);
    }
  }

  for (const candidate of candidates) {
    try {
      await execAsync(`pactl set-default-sink ${shell_quote(candidate)}`);
      await move_current_audio_to_sink(candidate);
      Audio.speaker = stream;
      return;
    } catch (error) {
      console.log(error);
    }
  }
};

const set_primary_input = async (stream) => {
  if (!stream || stream_matches(Audio.microphone, stream)) {
    return;
  }

  const sourceName = get_pactl_source_name(stream);

  try {
    if (sourceName) {
      await execAsync(`pactl set-default-source ${shell_quote(sourceName)}`);
      await move_current_recording_to_source(sourceName);
      Audio.microphone = stream;
      return;
    }
  } catch (error) {
    console.log(error);
  }

  const candidates = output_candidates(stream);

  for (const candidate of candidates) {
    try {
      await execAsync(`pactl set-default-source ${shell_quote(candidate)}`);
      await move_current_recording_to_source(candidate);
      Audio.microphone = stream;
      return;
    } catch (error) {
      console.log(error);
    }
  }
};

const output_select_button = ({ stream, useAssetsDir }) =>
  NierButton({
    useAssetsDir,
    label: stream?.description || stream?.name || "Output",
    font_size: 30,
    max_label_chars: 42,
    homogeneous_button: false,
    children: [
      Label({
        classNames: ["nier-option-item"],
        hpack: "end",
        setup: (self) => {
          const sync = () => {
            self.label = is_primary_output(stream) ? "PRIMARY" : "SELECT";
          };

          sync();
          self.hook(Audio, sync, "changed");
          self.hook(Audio, sync, "speaker-changed");
        },
      }),
    ],
    setup: (self) => {
      const sync = () => {
        sync_output_button(self, is_primary_output(stream));
      };

      sync();
      self.hook(Audio, sync, "changed");
      self.hook(Audio, sync, "speaker-changed");
    },
    handleClick: async () => {
      await set_primary_output(stream);
    },
  });

const input_select_button = ({ stream, useAssetsDir }) =>
  NierButton({
    useAssetsDir,
    label: stream?.description || stream?.name || "Input",
    font_size: 30,
    max_label_chars: 42,
    homogeneous_button: false,
    children: [
      Label({
        classNames: ["nier-option-item"],
        hpack: "end",
        setup: (self) => {
          const sync = () => {
            self.label = stream_matches(Audio.microphone, stream) ? "PRIMARY" : "SELECT";
          };

          sync();
          self.hook(Audio, sync, "changed");
          self.hook(Audio, sync, "microphone-changed");
        },
      }),
    ],
    setup: (self) => {
      const sync = () => {
        sync_output_button(self, stream_matches(Audio.microphone, stream));
      };

      sync();
      self.hook(Audio, sync, "changed");
      self.hook(Audio, sync, "microphone-changed");
    },
    handleClick: async () => {
      await set_primary_input(stream);
    },
  });

let volume_slider = ({ volume_ratio = 0, type = "speaker", stream = null, streamGetter = null, label = null, useAssetsDir }) => {
  const audioType = `${type}`.toLowerCase();
  const current_stream = () => streamGetter ? streamGetter() : stream;
  const sync_volume = () => {
    const activeStream = current_stream();

    volume_ratio.setValue(
      activeStream ? activeStream.volume || 0 : Audio[audioType]?.volume || 0
    );
  };

  return NierSliderButton({
    useAssetsDir,
    label: label || current_stream()?.description || type,
    max_label_chars: stream ? 42 : undefined,
    homogeneous_button: stream ? false : true,
    slider_hexpand: stream ? true : false,
    boxes: button_slider_width,
    font_size: button_label_2,
    ratio: volume_ratio,
    setup: () => {
      sync_volume();
    },
    connections: [
      [
        Audio,
        () => {
          sync_volume();
        },
        `${audioType}-changed`,
      ],
      [
        Audio,
        () => {
          sync_volume();
        },
        "changed",
      ],
      [
        volume_ratio,
        () => {
          const activeStream = current_stream();
          const audioDevice = Audio[audioType];
          const currentVolume = activeStream ? activeStream.volume || 0 : audioDevice?.volume || 0;

          if (
            Math.round(currentVolume * 100) === Math.round(volume_ratio.value * 100)
          ) {
            return;
          }

          if (activeStream) {
            activeStream.volume = volume_ratio.value;
            return;
          }

          if (audioDevice) {
            audioDevice.volume = volume_ratio.value;
          }
        },
      ],
    ],
  });
};

export const VolumeGroup = ({
  go_to = async (buttons, parent_button) => {},
  volume_ratio = Variable(audio_volume("speaker"), {}),
  mic_volume_ratio = Variable(audio_volume("microphone"), {}),
  passAssetsDir = assetsDir
}) => {
  return [
    Label({ hpack: "start", label: "VOLUME", classNames: ["heading"] ,css:`margin-top: ${settings_title_top}px;margin-bottom: ${settings_title_bottom}px;`}),
    volume_slider({useAssetsDir: passAssetsDir, type: "Speaker", label: "Primary Output", streamGetter: () => Audio.speaker, volume_ratio: volume_ratio }),
    volume_slider({useAssetsDir: passAssetsDir, type: "Microphone", label: "Microphone", streamGetter: () => Audio.microphone, volume_ratio: mic_volume_ratio }),
    NierButton({
      useAssetsDir: passAssetsDir,
      container_style: "padding-top: 40px;",
      label: "Applications",
      font_size: 30,
      vpack: "end",
      handleClick: async (self, event) => {
        await go_to(
          [
            Label({ hpack: "start", label: "APPS", classNames: ["heading"]  ,css:`margin-top: ${settings_title_top}px;margin-bottom: ${settings_title_bottom}px;` }),
            ...Array.from(Audio.apps).map((stream) => {
              console.log(stream);
              return volume_slider({
                useAssetsDir: passAssetsDir,
                stream: stream,
                label: format_app_label(stream),
                volume_ratio: Variable(stream.volume || 0, {}),
              });
            }),
          ],

          self
        );
      },
    }),
    Label({ hpack: "start", label: "OUTPUT DEVICE", classNames: ["heading"], css:`margin-top: ${settings_title_top}px;margin-bottom: ${settings_title_bottom}px;` }),
    ...Array.from(Audio.speakers).map((stream) =>
      output_select_button({
        useAssetsDir: passAssetsDir,
        stream,
      })
    ),
    Label({ hpack: "start", label: "INPUT DEVICE", classNames: ["heading"], css:`margin-top: ${settings_title_top}px;margin-bottom: ${settings_title_bottom}px;` }),
    ...Array.from(Audio.microphones).map((stream) =>
      input_select_button({
        useAssetsDir: passAssetsDir,
        stream,
      })
    ),
  ];
};
