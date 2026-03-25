// importing
import {
  App,
  Widget,
  Utils,
  Mpris,
  Variable,
} from "./imports.js";

import {
  arrremove,
  arradd,
  dark,
  getPlayerPlaybackStatus,
  getTargetPlayer,
  rand_int,
  parentConfigDir
} from "./utils.js";



const { Box, Label, Button, EventBox, Revealer, Icon } = Widget;
const { execAsync, timeout } = Utils;
const { GdkPixbuf, Pango, Gtk } = imports.gi;

const { round } = Math;

const opacity_map_len = 512;
const opacity_map = Array.from({ length: opacity_map_len+1 }, (_, i) => i / opacity_map_len);
const PLAYER_PREVIOUS_ICON = "media-skip-backward-symbolic";
const PLAYER_PAUSE_ICON = "media-playback-pause-symbolic";
const PLAYER_PLAY_ICON = "media-playback-start-symbolic";
const PLAYER_NEXT_ICON = "media-skip-forward-symbolic";
const PLAYER_LYRICS_ICON = "view-list-symbolic";
const SHOW_PLAYER_VOLUME_SLIDER = true;
const LYRICS_TOGGLE_CMD = "agsv1 -b lyrics -t lyrics";
const PLAYER_IMAGE_MATRIX_CAVA_REACTIVE = true;
const PLAYER_IMAGE_MATRIX_CAVA_OPACITY_BOOST = 0.2;
const PLAYER_IMAGE_MATRIX_CAVA_MAX_OFFSET_PX = 6;
const PLAYER_IMAGE_MATRIX_EFFECT_COLOR_BOOST = 0.5;
const PLAYER_IMAGE_MATRIX_CAVA_BASS_GATE = 0.16;
const PLAYER_IMAGE_MATRIX_CAVA_MID_GATE = 0.2;
const PLAYER_IMAGE_MATRIX_CAVA_HIGH_GATE = 0.24;
const PLAYER_IMAGE_MATRIX_MODE = "color";
const PLAYER_IMAGE_MATRIX_IN_COLOR = PLAYER_IMAGE_MATRIX_MODE === "color";
const PLAYER_IMAGE_MATRIX_OPACITY_FLOOR = 0.12;
const PLAYER_IMAGE_MATRIX_OPACITY_CEIL = 0.94;
const PLAYER_IMAGE_MATRIX_OPACITY_GAMMA = 1.35;
const PLAYER_IMAGE_MATRIX_COLOR_BASE_OPACITY = 0.68;
const PLAYER_IMAGE_MATRIX_COLOR_OPACITY_VARIATION = 0.24;

const PlayerVolumeSlider = ({
  ratio = Variable(0, {}),
  boxes = 18,
  slider_padding = 24,
  isDragging = false,
  hovering = false,
}) => {
  const segments = Array.from({ length: boxes }, (_, index) =>
    Box({
      classNames: ["player-volume-segment", `player-volume-segment-${index}`],
      vpack: "center",
      child: Box({
        classNames: ["player-volume-segment-inner"],
        vpack: "center",
      }),
    })
  );

  const updateSegments = () => {
    let segmentIndex = Math.floor(ratio.value * boxes) - 1;
    if (segmentIndex >= boxes) {
      segmentIndex = boxes - 1;
    }

    segments.forEach((segment, index) => {
      segment.toggleClassName("filled", index < segmentIndex);
      segment.toggleClassName("focus", index === segmentIndex && hovering);
      segment.toggleClassName("focus-on-hold", index === segmentIndex && !hovering && segmentIndex >= 0);
      if (segmentIndex < 0) {
        segment.toggleClassName("filled", false);
        segment.toggleClassName("focus", false);
        segment.toggleClassName("focus-on-hold", false);
      }
    });
  };

  return EventBox({
    classNames: ["player-volume-slider"],
    hpack: "center",
    child: Box({
      classNames: ["player-volume-track"],
      hexpand: true,
      hpack: "fill",
      vpack: "center",
      spacing: 0,
      children: segments,
      connections: [
        [ratio, updateSegments],
      ],
    }),
    setup: (self) => Utils.timeout(1, () => {
      const applyPointerValue = (event) => {
        const slider = self.child;
        const [, xPos] = event.get_coords();
        const alloc = slider.get_allocation();
        const usableWidth = Math.max(alloc.width - slider_padding, 1);
        const localX = Math.min(Math.max(xPos - alloc.x - slider_padding / 2, 0), usableWidth);
        ratio.value = Math.min(Math.max(localX / usableWidth, 0), 1);
      };

      self.connect("enter-notify-event", () => {
        hovering = true;
        updateSegments();
      });

      self.connect("leave-notify-event", () => {
        hovering = false;
        if (!isDragging) {
          updateSegments();
        }
      });

      self.connect("button-press-event", (_widget, event) => {
        isDragging = true;
        applyPointerValue(event);
      });

      self.connect("button-release-event", () => {
        isDragging = false;
        updateSegments();
      });

      self.connect("motion-notify-event", (_widget, event) => {
        if (!isDragging) {
          return;
        }
        applyPointerValue(event);
      });

      updateSegments();
    }),
  });
};

const cava = Variable([],{
  listen: [App.configDir + '/scripts/cava', out => out.split(";").filter(n => n).map(n => Number(n)/1000)]
})

let colors = dark.value?[218/255, 212/255, 187/255]:[87/255, 84/255, 74/255];

dark.connect("changed",() => {
  colors = dark.value?[218/255, 212/255, 187/255]:[87/255, 84/255, 74/255];
})

const color_mix = (c1, c2, t) => {
  return [
    c1[0] * (1 - t) + c2[0] * t,
    c1[1] * (1 - t) + c2[1] * t,
    c1[2] * (1 - t) + c2[2] * t,
  ];
}

const color_diff = (c1, c2) => {
  return [
    Math.abs(c1[0] - c2[0]),
    Math.abs(c1[1] - c2[1]),
    Math.abs(c1[2] - c2[2]),
  ];
}

const clamp = (value, min, max) => Math.min(Math.max(value, min), max);
const averageRange = (values, startRatio, endRatio) => {
  if (!values.length) {
    return 0;
  }

  const start = Math.max(0, Math.floor(values.length * startRatio));
  const end = Math.max(start + 1, Math.min(values.length, Math.ceil(values.length * endRatio)));
  let total = 0;

  for (let i = start; i < end; i += 1) {
    total += Math.min(Math.max(values[i] ?? 0, 0), 1);
  }

  return total / Math.max(end - start, 1);
};

const gateEnergy = (value, threshold) => {
  if (value <= threshold) {
    return 0;
  }

  return clamp((value - threshold) / Math.max(1 - threshold, 0.001), 0, 1);
};

const image_to_matrix = async (inputPath, imagedat, threshold = 128) => {
  // Load the image from file
  print("making image to matrix")
  const resizedPixbuf = GdkPixbuf.Pixbuf.new_from_file(inputPath);

  const pixels = resizedPixbuf.get_pixels();
  const rowstride = resizedPixbuf.get_rowstride();
  const channels = resizedPixbuf.get_n_channels();

  let max = 0;
  let min = 1;
  const darknessMatrix = [];
  for (let y = 0; y < resizedPixbuf.get_height(); y++) {
    for (let x = 0; x < resizedPixbuf.get_width(); x++) {
      const index = y * rowstride + x * channels;
      const [r, g, b] = pixels.slice(index, index + channels);

      const intensity = Math.round(0.3 * r + 0.59 * g + 0.11 * b);
      const darkness = dark.value?1 - intensity / 255.0:intensity / 255.0;
      if (darkness > max) {
        max = darkness;
      }
      if (darkness < min) {
        min = darkness;
      }
      darknessMatrix.push([r / 255, g / 255, b / 255, darkness, intensity / 255]);
    }
  }

  const range = Math.max(max - min, 1 / 255);
  for (let i = 0; i < resizedPixbuf.get_height()*resizedPixbuf.get_width(); i++) {
    const normalized = clamp((darknessMatrix[i][3] - min) / range, 0, 1);
    const contrasted = clamp((normalized - PLAYER_IMAGE_MATRIX_OPACITY_FLOOR) / Math.max(PLAYER_IMAGE_MATRIX_OPACITY_CEIL - PLAYER_IMAGE_MATRIX_OPACITY_FLOOR, 0.001), 0, 1);
    const darkness = 1 - opacity_map[Math.round((contrasted ** PLAYER_IMAGE_MATRIX_OPACITY_GAMMA) * (opacity_map.length - 1))];
    const [r, g, b, _darkness, intensity] = darknessMatrix[i];
    if (PLAYER_IMAGE_MATRIX_IN_COLOR) {
      const chroma = Math.max(r, g, b) - Math.min(r, g, b);
      const midtone = 1 - Math.abs((intensity * 2) - 1);
      darknessMatrix[i][3] = clamp(
        PLAYER_IMAGE_MATRIX_COLOR_BASE_OPACITY
          + PLAYER_IMAGE_MATRIX_COLOR_OPACITY_VARIATION * ((chroma * 0.65) + (midtone * 0.35)),
        0,
        1
      );
    } else {
      darknessMatrix[i][3] = darkness;
    }
  }
  imagedat.value = darknessMatrix;

  print("done making image to matrix")
  return [min, max];
};

const cava_vis = ({
  bar1_pos = 1,
  bar2_pos = 1,
}) => Box({
  classNames: ["cava-vis"],
  children: [
    Box({
      classNames: ["cava-bar-thin"],
      connections: [
        [cava, (self) => {
          let cava_val = cava.value[1];
          if (isNaN(bar1_pos)) {
            bar1_pos = 0;
          }
          self.css = `background-position: 100% ${bar1_pos}%;`;
          
          bar1_pos = bar1_pos - (cava_val>0.5?cava_val>0.9?cava_val*10:cava_val*5:cava_val) - 0.01;
          if (bar1_pos < -200) {
            bar1_pos = 0;
          }
        }]
      ]
    }),
    Box({
      classNames: ["cava-bar-thick"],
      connections: [
        [cava, (self) => {
          let cava_val = cava.value[round(cava.value.length/2)];
          if (isNaN(bar2_pos)) {
            bar2_pos = 0;
          }
          self.css = `background-position: 100% ${bar2_pos}%;`;
          bar2_pos = bar2_pos + (cava_val>0.5?cava_val>0.9?cava_val*10:cava_val*5:cava_val) + 0.01;
          if (bar2_pos > 200) {
            bar2_pos = 0;
          }
        }]
      ]
    })
  ]
})


export const NowPlaying = ({
  rows = 64,
  showingdat = Variable(
    Array.from({ length: rows*rows }, (_, i) => [0,0,0,1,1,0]),
  {}
  ),
  imagedat = Variable(
    Array.from({ length: rows*rows }, (_, i) => [1,1,1,1]),
    {}
  ),
  prevdat = [],
  cell_width = 10,
  cell_height = 10,
  preparing_cover = false,
  orig_vis_alloc = null,
  orig_container_alloc = null,
  orig_player_alloc = null,
  drawingArea = new Gtk.DrawingArea(),
  //
  wait_for_draw = false,
  draw_t = 0,
  draw_duration = 1000,
  drawing_rn = false,
  current_info = "",
  current_cover_info = "",
  volume_ratio = Variable(0, {}),
  matrix_needs_redraw = false,
}) =>
Box({
  classNames: ["player"],
  children: [
    Box({
      vertical: true,
      classNames: ["nowplaying-container"],
      children: [
        Box({
          css: `min-width: ${rows * cell_width + 30 + 30 - 20}px;`,
          hpack: "fill",
          spacing: 8,
          children: [
            ...(SHOW_PLAYER_VOLUME_SLIDER ? [
              Box({
                classNames: ["player-volume-slot"],
                hpack: "start",
                vpack: "center",
                child: PlayerVolumeSlider({
                  ratio: volume_ratio,
                  boxes: 18,
                }),
              }),
            ] : []),
            Button({
              hpack: "end",
              classNames: ["player-buttons", "player-lyrics-button"],
              child: Icon({
                icon: PLAYER_LYRICS_ICON,
                size: 28,
                classNames: ["player-button-icon"],
              }),
              onClicked: async (self) => {
                execAsync(LYRICS_TOGGLE_CMD).catch(print);
                self.classNames = arradd(self.classNames, "pressed");
                await new Promise((r) => setTimeout(r, 100));
                self.classNames = arrremove(self.classNames, "pressed");
              },
            }),
            Button({
              hpack: "end",
              classNames: ["player-buttons"],
              child: Icon({
                icon: PLAYER_PREVIOUS_ICON,
                size: 34,
                classNames: ["player-button-icon"],
              }),
              onClicked: async (self) => {
                const player = getTargetPlayer(Mpris.players);
                if (!player) {
                  return;
                }
                player.previous();
                self.classNames = arradd(self.classNames, "pressed");
                await new Promise((r) => setTimeout(r, 100));
                self.classNames = arrremove(self.classNames, "pressed");
              },
            }),
            Button({
              hpack: "end",
              classNames: ["player-buttons"],
              child: Icon({
                icon: PLAYER_PLAY_ICON,
                size: 46,
                classNames: ["player-button-icon", "player-toggle-icon"],
                connections: [
                  [
                    Mpris,
                    (self) => {
                      const player = getTargetPlayer(Mpris.players);
                      if (!player) {
                        return;
                      }
                      if (getPlayerPlaybackStatus(player) === "Playing") {
                        self.icon = PLAYER_PAUSE_ICON;
                      } else {
                        self.icon = PLAYER_PLAY_ICON;
                      }
                    },
                  ],
                ],
              }),
              onClicked: async (self) => {
                const player = getTargetPlayer(Mpris.players);
                if (!player) {
                  return;
                }
                const wasPlaying = getPlayerPlaybackStatus(player) === "Playing";
                player.playPause();
  
                if (wasPlaying) {
                  self.child.icon = PLAYER_PLAY_ICON;
                } else {
                  self.child.icon = PLAYER_PAUSE_ICON;
                }
  
                self.classNames = arradd(self.classNames, "pressed");
                await new Promise((r) => setTimeout(r, 100));
                self.classNames = arrremove(self.classNames, "pressed");

                let self_alloc = self.get_allocation();

                let forward_button = self.parent.children.find((child) =>
                  child.classNames?.includes("player-next-button")
                ) ?? self.parent.children[self.parent.children.length - 1];
                let forward_alloc = forward_button.get_allocation();

                let forward_cells = Math.floor(forward_alloc.width/cell_width);
                let self_cells = Math.floor((self_alloc.width/2)/cell_width);

                let cell_x = rows - (forward_cells+self_cells);
                let cell_y = 0;

                let max_thick = 10;

                let max_dist = (
                  ((Math.max(cell_x, rows - cell_x))) ** 2
                  + (Math.max(cell_y, rows - cell_y)) ** 2
                ) ** 0.5 + max_thick

                for (let t = 0; t<max_dist; t++){
                  for (let i = 0; i < rows*rows; i++){
                    let this_x = i%rows;
                    let this_y = Math.floor(i/rows);
  
                    let dist_x = Math.abs(this_x - cell_x);
                    let dist_y = Math.abs(this_y - cell_y);
  
                    let dist = (dist_x**2 + dist_y**2)**0.5;
  
                    if (Math.abs(dist - t) < rand_int(-10,max_thick)*(1 - t/max_dist)) {
                        let [r2,g2,b2,darkness] = imagedat.value[i];
                      let [r,g,b,o,opacity,offset] = showingdat.value[i];
  
                      [r,g,b,o,offset] = [r2,g2,b2,1,1];
                      opacity = darkness;
  
                      showingdat.value[i] = [r,g,b,o,opacity,offset];
                    }
                  }
                  drawingArea.queue_draw();
                  wait_for_draw = true;
                  while (wait_for_draw) {
                    await new Promise((r) => setTimeout(r, 1));
                  }
                  await new Promise((r) => setTimeout(r, 20*(t/max_dist)));
                }
              },
            }),
            Button({
              hpack: "end",
              classNames: ["player-buttons", "player-next-button"],
              css: "margin-right: 15px;",
              child: Icon({
                icon: PLAYER_NEXT_ICON,
                size: 34,
                classNames: ["player-button-icon"],
              }),
              onClicked: async (self) => {
                const player = getTargetPlayer(Mpris.players);
                if (!player) {
                  return;
                }
                player.next();
                self.classNames = arradd(self.classNames, "pressed");
                await new Promise((r) => setTimeout(r, 100));
                self.classNames = arrremove(self.classNames, "pressed");
              },
            }),
          ],
        }),
        EventBox({
          setup: (self) => Utils.timeout(1, () => {
            self.connect("motion-notify-event", (widget, event) => {
              let [_,x,y] = event.get_coords();

              let drawing_alloc = drawingArea.get_allocation();
              
              let [drawing_x,drawing_y] = [drawing_alloc.x,drawing_alloc.y];
              
              let real_x = x - drawing_x;
              let real_y = y - drawing_y;

              let cell_x = Math.floor(real_x/cell_width);
              let cell_y = Math.floor(real_y/cell_height);

              let cell_index = cell_y*rows + cell_x;

              let [r2,g2,b2,darkness] = imagedat.value[cell_index];
              let [r,g,b,o,opacity,offset] = showingdat.value[cell_index];
  
              [r,g,b,o,offset] = [r2,g2,b2,1,1];
              opacity = darkness;
  
              showingdat.value[cell_index] = [r,g,b,o,opacity,offset];
              drawingArea.queue_draw();
            })
          }),
          child:Box({
            classNames: ["image-matrix-container"],
            hpack: "center",
            css: `min-height: ${rows*cell_height}px; min-width: ${rows*cell_width}px;`,
            children: [
              drawingArea,
            ],
            setup: (self) => Utils.timeout(1, () => {
              drawingArea.hexpand = true;
              drawingArea.hpack = "end";
              drawingArea.connect('draw', (widget, context) => {
                matrix_needs_redraw = false;
                const cavaValues = PLAYER_IMAGE_MATRIX_CAVA_REACTIVE ? cava.value : [];
                const bassEnergy = PLAYER_IMAGE_MATRIX_CAVA_REACTIVE
                  ? gateEnergy(averageRange(cavaValues, 0, 0.18), PLAYER_IMAGE_MATRIX_CAVA_BASS_GATE) ** 1.35
                  : 0;
                const midEnergy = PLAYER_IMAGE_MATRIX_CAVA_REACTIVE
                  ? gateEnergy(averageRange(cavaValues, 0.22, 0.68), PLAYER_IMAGE_MATRIX_CAVA_MID_GATE) ** 1.45
                  : 0;
                const highEnergy = PLAYER_IMAGE_MATRIX_CAVA_REACTIVE
                  ? gateEnergy(averageRange(cavaValues, 0.72, 1), PLAYER_IMAGE_MATRIX_CAVA_HIGH_GATE) ** 1.6
                  : 0;
                for (let i = 0; i < rows*rows; i++){
                  const x = i%rows;
                  const y = Math.floor(i/rows);
                  const [sourceR, sourceG, sourceB, sourceOpacity, sourceIntensity = 0.5] = imagedat.value[i];
  
                  let [r,g,b,current_opacity,opacity,offset] = showingdat.value[i];
  
                  if (opacity == 0 && current_opacity == 0) {
                    continue;
                  }
  
                  let diff = !PLAYER_IMAGE_MATRIX_IN_COLOR
                    && !color_diff([r,g,b], colors).every(n => n < 1/255);
  
                  let opacity_diff = Math.abs(current_opacity - opacity) > 1/255;

                    if (diff && opacity_diff <= Math.abs(current_opacity + (opacity-current_opacity)/2)){
                      [r,g,b] = color_mix([r,g,b], colors, 0.2);
                    }
  
                  if (opacity_diff){
                      current_opacity = current_opacity + (opacity-current_opacity)*(0.2);
                  }
 
                  let reactiveOffsetX = 0;
                  let reactiveOffsetY = 0;
                  let reactiveOpacity = current_opacity;
                  if (PLAYER_IMAGE_MATRIX_CAVA_REACTIVE && current_opacity > 0.08) {
                    const normalizedX = x / Math.max(rows - 1, 1);
                    const normalizedY = y / Math.max(rows - 1, 1);
                    const dx = normalizedX - 0.5;
                    const dy = normalizedY - 0.5;
                    const ellipticalDy = dy * 0.7;
                    const radialDistance = Math.sqrt(dx * dx + ellipticalDy * ellipticalDy);
                    const outwardX = dx / Math.max(radialDistance, 0.001);
                    const outwardY = ellipticalDy / Math.max(radialDistance, 0.001);
                    const centerWeight = clamp(1 - radialDistance / 0.78, 0, 1);
                    const bassInfluence = bassEnergy * centerWeight;
                    const bassDisplacementWeight = clamp((radialDistance - 0.01) / 0.07, 0, 1);

                    const midtoneWeight = 1 - Math.abs((sourceIntensity * 2) - 1);
                    const localPhase = (Math.sin((x * 0.9) + (y * 1.15)) + 1) * 0.5;
                    const horizontalWeight = 0.55 + (1 - Math.abs(normalizedX - 0.5) * 2) * 0.45;
                    const bandedPhase = Math.sin((y * 0.42) + (x * 0.12));
                    const midInfluence = midEnergy * current_opacity * (0.45 + midtoneWeight * 0.75) * (0.55 + localPhase * 0.45) * horizontalWeight;

                    const edgeWeight = clamp((Math.abs(normalizedX - 0.5) * 2 - 0.15) / 0.85, 0, 1);
                    const brightWeight = clamp((Math.max(sourceR, sourceG, sourceB) - 0.35) / 0.65, 0, 1);
                    const highMask = localPhase > 0.58 ? 1 : 0.35;
                    const highInfluence = highEnergy * edgeWeight * brightWeight * (0.55 + highMask * 0.45);

                    const reactiveStrength = clamp(
                      bassInfluence * 1.0 + midInfluence * 0.95 + highInfluence * 0.75,
                      0,
                      1
                    );

                    if (reactiveStrength > 0.004) {
                      reactiveOffsetX =
                        outwardX * bassInfluence * bassDisplacementWeight * PLAYER_IMAGE_MATRIX_CAVA_MAX_OFFSET_PX * 0.65
                        + bandedPhase * midInfluence * PLAYER_IMAGE_MATRIX_CAVA_MAX_OFFSET_PX * 0.95
                        + Math.cos((x * 0.4) + (y * 0.2)) * highInfluence * PLAYER_IMAGE_MATRIX_CAVA_MAX_OFFSET_PX * 0.18;
                      reactiveOffsetY =
                        -bassInfluence * bassDisplacementWeight * PLAYER_IMAGE_MATRIX_CAVA_MAX_OFFSET_PX * 0.72
                        - midInfluence * PLAYER_IMAGE_MATRIX_CAVA_MAX_OFFSET_PX * 0.18
                        - highInfluence * PLAYER_IMAGE_MATRIX_CAVA_MAX_OFFSET_PX * 0.22;
                      reactiveOpacity = Math.min(
                        1,
                        current_opacity
                          + reactiveStrength * PLAYER_IMAGE_MATRIX_CAVA_OPACITY_BOOST
                          + midInfluence * PLAYER_IMAGE_MATRIX_CAVA_OPACITY_BOOST * 0.6
                          + highInfluence * PLAYER_IMAGE_MATRIX_CAVA_OPACITY_BOOST * 0.8
                      );
                    }
                  }

                  const hasMatrixOffset = offset != 0 && offset < 100;
                  const hasReactiveEffect = reactiveOffsetX !== 0 || reactiveOffsetY !== 0 || reactiveOpacity !== current_opacity;
                  let drawColor = [r, g, b];
                  if (!PLAYER_IMAGE_MATRIX_IN_COLOR && (hasMatrixOffset || hasReactiveEffect)) {
                    const matrixEffectStrength = hasMatrixOffset ? Math.min(Math.abs(offset) / 100, 1) : 0;
                    const reactiveEffectStrength = Math.max(0, reactiveOpacity - current_opacity) / Math.max(PLAYER_IMAGE_MATRIX_CAVA_OPACITY_BOOST, 0.001);
                    const effectStrength = Math.min(1, (matrixEffectStrength * 0.7) + reactiveEffectStrength);
                    drawColor = color_mix(
                      [r, g, b],
                      [sourceR, sourceG, sourceB],
                      Math.min(1, effectStrength * PLAYER_IMAGE_MATRIX_EFFECT_COLOR_BOOST)
                    );
                  }

                  if (hasMatrixOffset) {
                    let now_offset = offset;
                    if (now_offset > 50){
                      now_offset = 100 - now_offset;
                      offset += 5;
                    } else {
                      offset += 3;
                    }
                    const centerX = (x*cell_width) + (now_offset/100)*2*cell_width/2 + reactiveOffsetX;
                    const centerY = (y*cell_height) + (now_offset/100)*2*cell_height/2 + reactiveOffsetY;

                    context.setSourceRGBA(drawColor[0], drawColor[1], drawColor[2], Math.min(1, 2*reactiveOpacity));
                    context.rectangle(centerX, centerY, cell_width, cell_height);
                    context.fill();
                    
                  } else {
                    context.setSourceRGBA(drawColor[0], drawColor[1], drawColor[2], reactiveOpacity);
                    context.rectangle(
                      x*cell_width + reactiveOffsetX,
                      y*cell_height + reactiveOffsetY,
                      cell_width,
                      cell_height
                    );
                    context.fill();
                  }

                  showingdat.value[i] = [r,g,b,current_opacity,opacity,offset];
                  if (diff || opacity_diff || offset!=0){
                    matrix_needs_redraw = true;
                  }
                }
                wait_for_draw = false;
                if (matrix_needs_redraw) {
                  Utils.timeout(16, () => drawingArea.queue_draw());
                }
              })
            }),
            connections: [
              [
                cava,
                () => {
                  if (PLAYER_IMAGE_MATRIX_CAVA_REACTIVE && App.getWindow("player")?.visible) {
                    drawingArea.queue_draw();
                  }
                },
              ],
              [
                dark,
                (self) => {
                  Utils.timeout(500,async () => {
                    preparing_cover = true;
                    await image_to_matrix("/tmp/bg.png", imagedat, rows).catch((e) => {
                      preparing_cover = false;
                      console.log(e);
                    })
                    preparing_cover = false;
                    imagedat.emit("changed");
                  })
                },
                "changed"
              ],
              [
                imagedat,
                (self) => Utils.timeout(1, async () => {
                      try{

                        if (preparing_cover) {
                          return;
                        }
                        if (prevdat == JSON.stringify(imagedat.value)) {
                          print("same cover, returning :0 :: ")
                          return;
                        }
                        prevdat = JSON.stringify(imagedat.value);
              
                        console.log("got matrix update");
        
                        while (drawing_rn) {
                          await new Promise((r) => setTimeout(r, 1));
                        }
                        drawing_rn = true;

                        let now = Date.now();
                        let till = now + 5000;
                        let fps = 30;
                        
                        draw_t = 0;
                        draw_duration = till - now;
          
                        let final_draw = false;
      
                        while (true) {

                          let elapsed = Date.now();
                          for (let i = 0; i < rows*rows; i++){
                            let [r2,g2,b2,darkness] = imagedat.value[i];
                            let [r,g,b,o,opacity,offset] = showingdat.value[i];
                            const colorChanged = PLAYER_IMAGE_MATRIX_IN_COLOR
                              && !color_diff([r, g, b], [r2, g2, b2]).every((n) => n < 1/255);
          
                            if (Math.abs(darkness-opacity) > 1/255 || colorChanged) {
                              const time_ratio = draw_t / draw_duration;
                              if (darkness < time_ratio || colorChanged) {
                                [r,g,b,o,offset] = [r2,g2,b2,1,1];
                                opacity = darkness;
                              }
                            }

                            showingdat.value[i] = [r,g,b,o,opacity,offset];
                          }
                          drawingArea.queue_draw();
                          wait_for_draw = true;
                          while (wait_for_draw) {
                            await new Promise((r) => setTimeout(r, 1));
                          }
                          draw_t = Date.now() - now;
                          if (final_draw){
                            break;
                          }
                          if (draw_t >= draw_duration) {
                            final_draw = true;
                          }
                          await new Promise((r) => setTimeout(r, 1000/fps - (Date.now()-elapsed)));
                        }
                        drawing_rn = false
                        console.log("relocking cover");
                      
                      }catch(e){
                        print(e)
                      }
                }),
                "changed",
              ],
              [
                Mpris,
                (self) => Utils.timeout(10,() => {
                  const player = getTargetPlayer(Mpris.players);
                  if (!player) {
                    return;
                  }

                  if (preparing_cover) {
                    console.log("skipping mpris");
                    return;
                  }

                  if (current_cover_info == player.cover_path) {
                    console.log("same cover, returning");
                    return;
                  }

                  console.log("preparing cover ",current_cover_info);
                  current_cover_info = player.cover_path;


                  /////////////////////////////////////////////////////////////////////////////
                  // cover
                  /////////////////////////////////////////////////////////////////////////////
          
                  /////////////////////////////////////////////////////////////////////////////

                  execAsync(["cp", player.cover_path, "/tmp/to_bg.png"])
                    .then((out) => {
                      print(out)
                      preparing_cover = true;
                      execAsync([
                        App.configDir + "/scripts/prepare_cover.sh",
                        player.cover_path,
                        `${rows}`,
                      ])
                        .then((out) => {
                          console.log("cover prepared");
                          Promise.resolve(
                            image_to_matrix("/tmp/bg.png", imagedat, rows).catch((e) => {
                              preparing_cover = false;
                              console.log(e);
                            })
                          ).then(() => {
                            preparing_cover = false;
                            imagedat.emit("changed");
                          }).catch(print);
                        })
                        .catch((e) => {
                          preparing_cover = false;
                          console.log(e);
                        });
                    })
                    .catch((e) => {
                      preparing_cover = false;
                      console.log(e);
                    });
                }),
              ],
            ],
          }),
        }),
        Box({
          classNames: ["nowplaying-info-container"],
          css: `margin-left: ${5}`,
          children: [
            Revealer({
              revealChild: false,
              transitionDuration: 1000,
              child: Label({
                label: "woa",
                classNames: ["heading"],
                css: `min-width: ${rows * cell_width}px;`,
                hpack: "end",
                xalign: 0,
                wrap: true,
                max_width_chars: 20,
                setup: (self) =>
                  Utils.timeout(1, () => {
                    self.set_line_wrap_mode(Pango.WrapMode.WORD_CHAR);
                    self.set_ellipsize(Pango.EllipsizeMode.END);
                  }),
              }),
              transition: "slide_left",
              connections: [
                [
                  Mpris,
                  async (self) => {
                      const player = getTargetPlayer(Mpris.players);
                    if (!player) {
                      return;
                    }
                    if (player.track_title != current_info) {
                      current_info = player.track_title
                      let cursor = self.parent.children[1];
                      await new Promise((r) => setTimeout(r, 1500));
                      cursor.classNames = arrremove(cursor.classNames, "hidden");
                      await new Promise((r) => setTimeout(r, 1500));
                      self.revealChild = false;
                      await new Promise((r) => setTimeout(r, 1500));
                      self.child.label = current_info;
                      self.revealChild = true;
                      await new Promise((r) => setTimeout(r, 1500));
                      cursor.classNames = arradd(cursor.classNames, "hidden");
                    }
                  },
                ],
              ],
            }),
            Box({
              classNames: ["nowplaying-info-cursor"],
            }),
          ],
        }),
      ],
      connections: [],
    }),
    cava_vis({}),
    Box({
      classNames: ["nowplaying-hider"],
    })
  ],
  connections: [
    [
      Mpris,
      () => {
        const player = getTargetPlayer(Mpris.players);
        if (!player) {
          return;
        }

        volume_ratio.value = Number(player.volume ?? 0);
      },
    ],
    [
      volume_ratio,
      () => {
        const player = getTargetPlayer(Mpris.players);
        if (!player) {
          return;
        }

        const currentVolume = Number(player.volume ?? 0);
        if (Math.round(currentVolume * 100) === Math.round(volume_ratio.value * 100)) {
          return;
        }

        player.volume = volume_ratio.value;
      },
    ],
    [
      App,
      (self, windowName, visible) => {
          if (windowName ==  "player") {
              let player = self
              let container = player.children[0];
              let vis = player.children[1];
              let hider = player.children[2];

              let buttons = container.children[0];
              let matrix = container.children[1];
              let info = container.children[2];


              if (!visible) {
                print("closing")
                let container_alloc = container.get_allocation();
                let vis_alloc = vis.get_allocation();
                let player_alloc = player.get_allocation();

                if (vis_alloc.width == 1){ // for some reason this ran twice and messed up orig var :0
                  return
                }

                Utils.timeout( 10, () => {
                  orig_container_alloc = container_alloc.width;
                  orig_vis_alloc = vis_alloc.width;
                  orig_player_alloc = player_alloc.width;
                  vis.toggleClassName("hiding",true);
                  vis.css = `margin-top: 0px;margin-bottom: 0px;transition: margin 0.2s cubic-bezier(0.15, 0.79, 0, 1);`;
                  container.css = `margin-right: -${vis_alloc.width*3}px;margin-left: ${vis_alloc.width*3}px;transition: margin 0.5s cubic-bezier(0.15, 0.79, 0, 1);`;
                  timeout(300, () => {
                    container.css = `margin-right: 0px;margin-left: ${vis_alloc.width}px;transition: margin 0.5s cubic-bezier(0.15, 0.79, 0, 1);`;
                    vis.css = `margin-top: 0px;margin-bottom: 0px;margin-left: -${container_alloc.width+vis_alloc.width}px;transition: margin 0.5s cubic-bezier(0.15, 0.79, 0, 1);`;
                    hider.css = `margin-left: -${container_alloc.width}px;transition: margin 0.5s cubic-bezier(0.15, 0.79, 0, 1);`;
                    timeout(600, () => {
                      draw_t = 0;
                      player.css = `margin-right: -${player_alloc.width-5}px;transition: margin 0.5s cubic-bezier(0.15, 0.79, 0, 1);`;
                    })
                    
                  })
                })
              } else {
                print("opening",orig_container_alloc,orig_player_alloc,orig_vis_alloc)

                container.css = `margin-right: ${orig_vis_alloc}px;`;
                player.css = `margin-right: -${orig_player_alloc-5}px;`;
                vis.css = `margin-top: 0px;margin-bottom: 0px;margin-left: -${orig_container_alloc+orig_vis_alloc}px;`;
                hider.css = `margin-left: -${orig_container_alloc}px;`;
                
                
                timeout(10, () => {
                  player.css = `margin-right: 0px;transition: margin 0.5s cubic-bezier(0.15, 0.79, 0, 1);`;
                  timeout(500, () => {
                    vis.css = `margin-top: 0px;margin-bottom: 0px;margin-left: 0px;transition: margin 0.5s cubic-bezier(0.15, 0.79, 0, 1);`;
                    hider.css = `margin-left: 0px;transition: margin 0.5s cubic-bezier(0.15, 0.79, 0, 1);`;
                    container.css = `margin-right: 0px;transition: margin 0.1s cubic-bezier(0.15, 0.79, 0, 1);`;
                    timeout(500, () => {
                      vis.toggleClassName("hiding",false);
                      vis.css = `margin-top: ${buttons.get_allocation().height}px;margin-bottom: ${info.get_allocation().height}px;transition: margin 0.3s cubic-bezier(0.15, 0.79, 0, 1);`;
                      hider.css = "opacity: 0;"
                      container.css = ""
                    })
                  })
                })
              }
          }
      },
      "window-toggled",
    ],
  ]
});
  
