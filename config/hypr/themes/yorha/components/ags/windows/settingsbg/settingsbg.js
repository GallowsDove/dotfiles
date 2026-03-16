const resource = (file) => `resource:///com/github/Aylur/ags/${file}.js`;
const require = async (file) => (await import(resource(file))).default;

const App = await require("app");
const Widget = await require("widget");
const Utils = await import(resource("utils"));
const { SCREEN_WIDTH, SCREEN_HEIGHT } = await import("../../util.js");

const { max, round, abs, sqrt } = Math;
const { Window, EventBox, Overlay, Scrollable } = Widget;
const { Gtk } = imports.gi;

globalThis.App = App;

let dark = false;
await Utils.execAsync("agsv1 -r dark.value").then((res) => {
  dark = res === "true";
}).catch(() => {});

const colors = dark ? [218 / 255, 212 / 255, 187 / 255] : [87 / 255, 84 / 255, 74 / 255];
const OPEN_ANIMATION_DURATION_MS = 850;
const CLOSE_ANIMATION_DURATION_MS = 800;
const OPEN_OPACITY_STEP = 10;
const CLOSE_OPACITY_STEP = 5;
const OPEN_VERTEX_STEP = 2;
const CLOSE_VERTEX_STEP = 3;

const drawTriangle = (
  context,
  centerX,
  centerY,
  width,
  height,
  color,
  inverted,
  leftRatio,
  rightRatio,
  yRatio
) => {
  if (leftRatio <= 0.001 || rightRatio <= 0.001 || yRatio <= 0.001) {
    return;
  }

  context.setSourceRGBA(...color);
  let leftPoint;
  let rightPoint;
  let yPoint;

  if (inverted) {
    leftPoint = [centerX - width / 2, centerY + height / 2];
    rightPoint = [centerX + width / 2, centerY + height / 2];
    yPoint = [centerX, centerY - height / 2];
  } else {
    leftPoint = [centerX - width / 2, centerY - height / 2];
    rightPoint = [centerX + width / 2, centerY - height / 2];
    yPoint = [centerX, centerY + height / 2];
  }

  if (leftRatio < 0.999) {
    const leftRight = [
      (rightPoint[0] - leftPoint[0]) * (1 - leftRatio),
      (rightPoint[1] - leftPoint[1]) * (1 - leftRatio),
    ];
    const leftY = [
      (yPoint[0] - leftPoint[0]) * (1 - leftRatio),
      (yPoint[1] - leftPoint[1]) * (1 - leftRatio),
    ];
    leftPoint = [
      leftPoint[0] + leftRight[0] / 2 + leftY[0] / 2,
      leftPoint[1] + leftRight[1] / 2 + leftY[1] / 2,
    ];
  }

  if (rightRatio < 0.999) {
    const rightLeft = [
      (leftPoint[0] - rightPoint[0]) * (1 - rightRatio),
      (leftPoint[1] - rightPoint[1]) * (1 - rightRatio),
    ];
    const rightY = [
      (yPoint[0] - rightPoint[0]) * (1 - rightRatio),
      (yPoint[1] - rightPoint[1]) * (1 - rightRatio),
    ];
    rightPoint = [
      rightPoint[0] + rightLeft[0] / 2 + rightY[0] / 2,
      rightPoint[1] + rightLeft[1] / 2 + rightY[1] / 2,
    ];
  }

  if (yRatio < 0.999) {
    const yLeft = [
      (leftPoint[0] - yPoint[0]) * (1 - yRatio),
      (leftPoint[1] - yPoint[1]) * (1 - yRatio),
    ];
    const yRight = [
      (rightPoint[0] - yPoint[0]) * (1 - yRatio),
      (rightPoint[1] - yPoint[1]) * (1 - yRatio),
    ];
    yPoint = [
      yPoint[0] + yLeft[0] / 2 + yRight[0] / 2,
      yPoint[1] + yLeft[1] / 2 + yRight[1] / 2,
    ];
  }

  context.moveTo(...leftPoint);
  context.lineTo(...rightPoint);
  context.lineTo(...yPoint);
  context.fill();
};

const distanceFromWaveFront = (x, y, screenCenterY) => x + abs(y - screenCenterY) * 0.25;

const getTrianglePoints = (centerX, centerY, width, height, inverted) => {
  if (inverted) {
    return {
      leftPoint: [centerX - width / 2, centerY + height / 2],
      rightPoint: [centerX + width / 2, centerY + height / 2],
      yPoint: [centerX, centerY - height / 2],
    };
  }

  return {
    leftPoint: [centerX - width / 2, centerY - height / 2],
    rightPoint: [centerX + width / 2, centerY - height / 2],
    yPoint: [centerX, centerY + height / 2],
  };
};

const getDirectionalRatios = ({
  centerPointX,
  centerPointY,
  width,
  height,
  inverted,
  progress,
  opening,
}) => {
  const { leftPoint, rightPoint, yPoint } = getTrianglePoints(
    centerPointX,
    centerPointY,
    width,
    height,
    inverted
  );
  const directionX = 1;
  const directionY = 0;
  const leftScore = leftPoint[0] * directionX + leftPoint[1] * directionY;
  const rightScore = rightPoint[0] * directionX + rightPoint[1] * directionY;
  const yScore = yPoint[0] * directionX + yPoint[1] * directionY;
  const outerScore = max(leftScore, max(rightScore, yScore));
  const innerScore = Math.min(leftScore, Math.min(rightScore, yScore));
  const leftIsOuter = leftScore >= outerScore - 0.001;
  const rightIsOuter = rightScore >= outerScore - 0.001;
  const yIsOuter = yScore >= outerScore - 0.001;
  const leftIsInner = leftScore <= innerScore + 0.001;
  const rightIsInner = rightScore <= innerScore + 0.001;
  const yIsInner = yScore <= innerScore + 0.001;

  if (opening) {
    return {
      leftRatio: leftIsOuter ? progress : 1,
      rightRatio: rightIsOuter ? progress : 1,
      yRatio: yIsOuter ? progress : 1,
    };
  }

  return {
    leftRatio: leftIsInner ? (1 - progress) : 1,
    rightRatio: rightIsInner ? (1 - progress) : 1,
    yRatio: yIsInner ? (1 - progress) : 1,
  };
};

const SettingsGeom = ({
  cellWidth = 384,
  cellHeight = round(sqrt(cellWidth * cellWidth - (cellWidth / 2) * (cellWidth / 2))),
  cellGrid = new Gtk.DrawingArea(),
  waitForDrawFrame = false,
  waitForCompleteDraw = false,
  drawTime = 0,
  finalDraw = true,
  gap = 0,
  rows = round(SCREEN_HEIGHT / cellHeight) + 3,
  cols = round((SCREEN_WIDTH * 2) / cellWidth) + 6,
  cells = Array.from({ length: rows * cols }, () => [0, 0, 0, 0, 0, 0, 0, 0, false]),
  opacityStep = 10,
  vertexStep = 10,
}) => {
  let animationId = 0;
  const renderedGridWidth = (cols - 1) * cellWidth * 0.5 + cellWidth;
  const renderedGridHeight = (rows - 1) * cellHeight + cellHeight;
  const gridOffsetX = -cellWidth * 1.5;
  const gridOffsetY = (SCREEN_HEIGHT - renderedGridHeight) * 0.5 + cellHeight * 0.5;
  const screenCenterY = SCREEN_HEIGHT * 0.5;

  const waitForDraw = async () => {
    waitForDrawFrame = true;
    cellGrid.queue_draw();
    while (waitForDrawFrame) {
      await new Promise((resolve) => setTimeout(resolve, 1));
    }
  };

  const resetCells = () => {
    for (let i = 0; i < rows * cols; i += 1) {
      cells[i] = [0, 0, 0, 0, 0, 0, 0, 0, false];
    }
    finalDraw = true;
    opacityStep = OPEN_OPACITY_STEP;
    vertexStep = OPEN_VERTEX_STEP;
  };

  const animate = async ({ opening, currentAnimationId }) => {
    const start = Date.now();
    const duration = opening ? OPEN_ANIMATION_DURATION_MS : CLOSE_ANIMATION_DURATION_MS;
    const fps = 30;
    const maxDistance =
      distanceFromWaveFront(SCREEN_WIDTH + cellWidth * 2.5, 0, screenCenterY) + cellWidth;

    drawTime = start;
    finalDraw = false;
    opacityStep = opening ? OPEN_OPACITY_STEP : CLOSE_OPACITY_STEP;
    vertexStep = opening ? OPEN_VERTEX_STEP : CLOSE_VERTEX_STEP;

    while (true) {
      if (currentAnimationId !== animationId) {
        return;
      }

      const frameStart = Date.now();
      const timeRatio = (drawTime - start) / duration;
      const progress = Math.max(0, Math.min(1, timeRatio));

      for (let i = 0; i < rows * cols; i += 1) {
        const x = i % cols;
        const y = (i - x) / cols;
        let [cOpacity, tOpacity, cLeft, tLeft, cRight, tRight, cY, tY, inited] = cells[i];
        const centerPointX = gridOffsetX + x * cellWidth * 0.5;
        const centerPointY = gridOffsetY + y * cellHeight;
        const dist = distanceFromWaveFront(centerPointX, centerPointY, screenCenterY);
        const threshold = maxDistance * progress;
        const localProgress = Math.max(0, Math.min(1, (threshold - dist) / (cellWidth * 0.65)));
        const inverted = x % 2 === 0 ? y % 2 === 1 : y % 2 === 0;

        if (opening) {
          if (dist <= threshold) {
            inited = true;
            const ratios = getDirectionalRatios({
              centerPointX,
              centerPointY,
              width: cellWidth - gap,
              height: cellHeight - gap / 2,
              inverted,
              progress: localProgress,
              opening: true,
            });
            tOpacity = 0.55;
            tLeft = ratios.leftRatio;
            tRight = ratios.rightRatio;
            tY = ratios.yRatio;
          } else if (inited) {
            tOpacity = 0.55;
            tLeft = 1;
            tRight = 1;
            tY = 1;
          }
        } else if (inited && dist <= threshold) {
          const ratios = getDirectionalRatios({
            centerPointX,
            centerPointY,
            width: cellWidth - gap,
            height: cellHeight - gap / 2,
            inverted,
            progress: localProgress,
            opening: false,
          });
          tOpacity = 0.55 * (1 - localProgress);
          tLeft = ratios.leftRatio;
          tRight = ratios.rightRatio;
          tY = ratios.yRatio;
          if (localProgress >= 1) {
            tOpacity = 0;
            tLeft = 0;
            tRight = 0;
            tY = 0;
          }
        } else if (!opening && inited) {
          tOpacity = 0.55;
          tLeft = 1;
          tRight = 1;
          tY = 1;
        } else if (!opening) {
          tOpacity = 0;
          tLeft = 0;
          tRight = 0;
          tY = 0;
        }

        cells[i] = [cOpacity, tOpacity, cLeft, tLeft, cRight, tRight, cY, tY, inited];
      }

      finalDraw = true;
      waitForCompleteDraw = true;
      await waitForDraw();

      if (currentAnimationId !== animationId || timeRatio > 1) {
        break;
      }

      drawTime = Date.now();
      await new Promise((resolve) => setTimeout(resolve, max(0, 1000 / fps - (drawTime - frameStart))));
    }
  };

  globalThis.closeBgSettings = () => {
    Utils.timeout(1, async () => {
      try {
        const currentAnimationId = ++animationId;
        await animate({ opening: false, currentAnimationId });
        if (currentAnimationId === animationId) {
          App.closeWindow("bg_settings");
        }
      } catch (error) {
        print(error);
      }
    });
  };

  globalThis.openBgSettings = () => {
    Utils.timeout(1, async () => {
      try {
        const currentAnimationId = ++animationId;
        resetCells();
        App.openWindow("bg_settings");
        await waitForDraw();
        if (currentAnimationId !== animationId) {
          return;
        }
        await animate({ opening: true, currentAnimationId });
      } catch (error) {
        print(error);
      }
    });
  };

  return Window({
    name: "bg_settings",
    classNames: ["bg_settings"],
    margin: [0, 0, 0, 0],
    anchor: ["top", "left", "bottom", "right"],
    exclusivity: "ignore",
    layer: "top",
    visible: false,
    focusable: false,
    setup: () => {
      cellGrid.connect("draw", (_, context) => {
        let stable = true;

        for (let i = 0; i < rows * cols; i += 1) {
          const x = i % cols;
          const y = (i - x) / cols;
          let [cOpacity, tOpacity, cLeft, tLeft, cRight, tRight, cY, tY, inited] = cells[i];

          if (abs(cOpacity - tOpacity) > 0.01) {
            stable = false;
            cOpacity += (tOpacity - cOpacity) / opacityStep;
          }
          if (abs(cLeft - tLeft) > 0.001) {
            stable = false;
            cLeft += (tLeft - cLeft) / vertexStep;
          }
          if (abs(cRight - tRight) > 0.001) {
            stable = false;
            cRight += (tRight - cRight) / vertexStep;
          }
          if (abs(cY - tY) > 0.001) {
            stable = false;
            cY += (tY - cY) / vertexStep;
          }

          drawTriangle(
            context,
            gridOffsetX + x * cellWidth * 0.5,
            gridOffsetY + y * cellHeight,
            cellWidth - gap,
            cellHeight - gap / 2,
            [...colors, cOpacity],
            x % 2 === 0 ? y % 2 === 1 : y % 2 === 0,
            cLeft,
            cRight,
            cY
          );

          cells[i] = [cOpacity, tOpacity, cLeft, tLeft, cRight, tRight, cY, tY, inited];
        }

        waitForDrawFrame = false;
        if (finalDraw && !stable) {
          cellGrid.queue_draw();
        } else if (finalDraw && stable) {
          waitForCompleteDraw = false;
        }
      });
    },
    child: EventBox({
      classNames: ["nier-geom-container"],
      child: Overlay({
        child: Scrollable({
          child: cellGrid,
          setup: () => {
            globalThis.App = App;
          },
        }),
      }),
    }),
  });
};

export default {
  windows: [SettingsGeom({})],
};
