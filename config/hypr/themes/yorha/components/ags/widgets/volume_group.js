import { Widget,Audio,Variable } from "../imports.js";
import {  NierButton } from "../nier/buttons.js";
import { NierSliderButton } from "../nier/slider.js";
import { button_label_2, button_slider_width, settings_title_bottom, settings_title_top } from "../scaling.js";
import { assetsDir } from "../util.js";

const {Label} = Widget;

const audio_volume = (type) => Audio[type]?.volume || 0;

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
    volume_slider({useAssetsDir: passAssetsDir, type: "Speaker", label: "Speaker", streamGetter: () => Audio.speaker, volume_ratio: volume_ratio }),
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
                volume_ratio: Variable(stream.volume || 0, {}),
              });
            }),
          ],

          self
        );
      },
    }),
    Label({ hpack: "start", label: "OUTPUT", classNames: ["heading"], css:`margin-top: ${settings_title_top}px;margin-bottom: ${settings_title_bottom}px;` }),
    ...Array.from(Audio.speakers).map((stream) => {
      console.log(stream);
      return volume_slider({
        useAssetsDir: passAssetsDir,
        stream: stream,
        volume_ratio: Variable(stream.volume || 0, {}),
      });
    }),

    Label({ hpack: "start", label: "INPUT", classNames: ["heading"], css:`margin-top: ${settings_title_top}px;margin-bottom: ${settings_title_bottom}px;` }),
    ...Array.from(Audio.microphones).map((stream) => {
      console.log(stream);
      return volume_slider({
        useAssetsDir: passAssetsDir,
        stream: stream,
        volume_ratio: Variable(stream.volume || 0, {}),
      });
    }),
  ];
};
