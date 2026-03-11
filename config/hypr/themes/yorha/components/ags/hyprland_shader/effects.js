export const MAX_ACTIVE_OPEN_WINDOW_ANIMATIONS = 4;
export const OPEN_WINDOW_ANIMATION_STEPS = 90;

const createDirectionalSettingsBurst = (direction) => {
  const isVertical = direction === "top" || direction === "bottom";
  const reversed = direction === "right" || direction === "top";

  const ratioLines = (() => {
    if (direction === "right" || direction === "top") {
      return [
        "                float leftRatio = enterPhase;",
        "                float rightRatio = 1.0 - exitPhase;",
        "                float yRatio = 1.0;",
      ];
    }

    return [
      "                float leftRatio = 1.0 - exitPhase;",
      "                float rightRatio = enterPhase;",
      "                float yRatio = 1.0;",
    ];
  })();

  const localPointExpr = isVertical
    ? "vec2(windowSizePx.y - localPx.y, localPx.x)"
    : "localPx";
  const localSizeExpr = isVertical
    ? "vec2(windowSizePx.y, windowSizePx.x)"
    : "windowSizePx";
  const finalPointExpr = isVertical
    ? "vec2(currentLeft.y, windowSizePx.y - currentLeft.x)"
    : "currentLeft";
  const finalRightExpr = isVertical
    ? "vec2(currentRight.y, windowSizePx.y - currentRight.x)"
    : "currentRight";
  const finalYExpr = isVertical
    ? "vec2(currentY.y, windowSizePx.y - currentY.x)"
    : "currentY";

  return {
    durationMs: 150,
    easeBezier: [0.0, 0.0, 1.0, 1.0],
    buildDeclarations: ({ box, progress }, index) => ([
      `const vec2 windowMin${index} = vec2(${box.minX.toFixed(6)}, ${box.minY.toFixed(6)});`,
      `const vec2 windowMax${index} = vec2(${box.maxX.toFixed(6)}, ${box.maxY.toFixed(6)});`,
      `const float progress${index} = ${progress.toFixed(6)};`,
    ].join("\n")),
    buildLogic: (index) => ([
      "{",
      `    vec2 windowMinPx = windowMin${index} * fullSize;`,
      `    vec2 windowMaxPx = windowMax${index} * fullSize;`,
      "    vec2 windowSizePx = max(windowMaxPx - windowMinPx, vec2(1.0));",
      "    vec2 localPx = gl_FragCoord.xy - windowMinPx;",
      "",
      "    bool insideWindow = all(greaterThanEqual(localPx, vec2(0.0)))",
      "        && all(lessThanEqual(localPx, windowSizePx));",
      "",
      "    if (insideWindow) {",
      "        vec2 burstLocalPx = " + localPointExpr + ";",
      "        vec2 burstWindowSizePx = " + localSizeExpr + ";",
      "        float triangleSide = max(96.0, min(burstWindowSizePx.x / 6.5, burstWindowSizePx.y / 4.0));",
      "        float triangleHeight = triangleSide * 0.8660254;",
      "        ivec2 baseCell = ivec2(floor(vec2(burstLocalPx.x / (triangleSide * 0.5), burstLocalPx.y / triangleHeight)));",
      "        float triangleSweepCount = floor(burstWindowSizePx.x / (triangleSide * 0.5)) + 0.5;",
      "        float intensity = 0.0;",
      "        for (int offsetY = -1; offsetY <= 1; offsetY++) {",
      "            for (int offsetX = -1; offsetX <= 1; offsetX++) {",
      "                ivec2 cell = baseCell + ivec2(offsetX, offsetY);",
      "                if (cell.x < 0 || cell.y < 0) {",
      "                    continue;",
      "                }",
      "                vec2 centerPoint = vec2(float(cell.x) * triangleSide * 0.5, float(cell.y) * triangleHeight);",
      "                bool inverted = mod(float(cell.x), 2.0) < 0.5",
      "                    ? mod(float(cell.y), 2.0) > 0.5",
      "                    : mod(float(cell.y), 2.0) < 0.5;",
      "                vec2 leftPoint = inverted",
      "                    ? vec2(centerPoint.x - triangleSide * 0.5, centerPoint.y + triangleHeight * 0.5)",
      "                    : vec2(centerPoint.x - triangleSide * 0.5, centerPoint.y - triangleHeight * 0.5);",
      "                vec2 rightPoint = inverted",
      "                    ? vec2(centerPoint.x + triangleSide * 0.5, centerPoint.y + triangleHeight * 0.5)",
      "                    : vec2(centerPoint.x + triangleSide * 0.5, centerPoint.y - triangleHeight * 0.5);",
      "                vec2 yPoint = inverted",
      "                    ? vec2(centerPoint.x, centerPoint.y - triangleHeight * 0.5)",
      "                    : vec2(centerPoint.x, centerPoint.y + triangleHeight * 0.5);",
      reversed
        ? "                float triangleSweepIndex = triangleSweepCount - 1.0 - float(cell.x);"
        : "                float triangleSweepIndex = float(cell.x);",
      "                float triangleSpacing = 1.0;",
      `                float sweepProgress = progress${index} * (triangleSweepCount * triangleSpacing + 5.0);`,
      "                float trianglePhase = sweepProgress - triangleSweepIndex * triangleSpacing;",
      "                if (trianglePhase <= 0.0 || trianglePhase >= 5.0) {",
      "                    continue;",
      "                }",
      "                float holdPhase = trianglePhase >= 1.0 && trianglePhase < 4.0 ? 1.0 : 0.0;",
      "                float enterPhase = clamp(trianglePhase, 0.0, 1.0);",
      "                float exitPhase = clamp(trianglePhase - 4.0, 0.0, 1.0);",
      reversed
        ? "                float leftNeighborSweepIndex = triangleSweepCount - float(cell.x);"
        : "                float leftNeighborSweepIndex = float(cell.x) - 1.0;",
      reversed
        ? "                float rightNeighborSweepIndex = triangleSweepCount - 2.0 - float(cell.x);"
        : "                float rightNeighborSweepIndex = float(cell.x) + 1.0;",
      "                float leftNeighborPhase = sweepProgress - leftNeighborSweepIndex * triangleSpacing;",
      "                float rightNeighborPhase = sweepProgress - rightNeighborSweepIndex * triangleSpacing;",
      "                bool leftNeighborActive = cell.x > 0 && leftNeighborPhase > 0.0 && leftNeighborPhase < 5.0;",
      "                bool rightNeighborActive = float(cell.x) + 1.0 < triangleSweepCount && rightNeighborPhase > 0.0 && rightNeighborPhase < 5.0;",
      "                bool fadeOnly = leftNeighborActive == rightNeighborActive;",
      "                float visibility = min(enterPhase, 1.0 - exitPhase);",
      ...ratioLines,
      "                if (!fadeOnly && (leftRatio <= 0.001 || rightRatio <= 0.001 || yRatio <= 0.001)) {",
      "                    continue;",
      "                }",
      "                vec2 currentLeft = leftPoint;",
      "                vec2 currentRight = rightPoint;",
      "                vec2 currentY = yPoint;",
      "                if (!fadeOnly && leftRatio < 0.9) {",
      "                    vec2 leftRightVector = (currentRight - currentLeft) * (1.0 - leftRatio);",
      "                    vec2 leftYVector = (currentY - currentLeft) * (1.0 - leftRatio);",
      "                    currentLeft = currentLeft + leftRightVector * 0.5 + leftYVector * 0.5;",
      "                }",
      "                if (!fadeOnly && rightRatio < 0.9) {",
      "                    vec2 rightLeftVector = (currentLeft - currentRight) * (1.0 - rightRatio);",
      "                    vec2 rightYVector = (currentY - currentRight) * (1.0 - rightRatio);",
      "                    currentRight = currentRight + rightLeftVector * 0.5 + rightYVector * 0.5;",
      "                }",
      "                if (!fadeOnly && yRatio < 0.9) {",
      "                    vec2 yLeftVector = (currentLeft - currentY) * (1.0 - yRatio);",
      "                    vec2 yRightVector = (currentRight - currentY) * (1.0 - yRatio);",
      "                    currentY = currentY + yLeftVector * 0.5 + yRightVector * 0.5;",
      "                }",
      "                currentLeft = " + finalPointExpr + ";",
      "                currentRight = " + finalRightExpr + ";",
      "                currentY = " + finalYExpr + ";",
      "                vec2 triangleCentroid = (currentLeft + currentRight + currentY) / 3.0;",
      "                float gapPixels = 3.0;",
      "                currentLeft = mix(currentLeft, triangleCentroid, gapPixels / triangleSide);",
      "                currentRight = mix(currentRight, triangleCentroid, gapPixels / triangleSide);",
      "                currentY = mix(currentY, triangleCentroid, gapPixels / triangleSide);",
      "                if (point_in_triangle(localPx, currentLeft, currentRight, currentY)) {",
      `                    float fade = 1.0 - smoothstep(0.88, 1.0, progress${index});`,
      "                    float triangleAlpha = fadeOnly ? visibility : max(0.65, holdPhase);",
      "                    intensity = max(intensity, (0.26 + 0.34 * fade) * triangleAlpha);",
      "                }",
      "            }",
      "        }",
      "",
      "        if (intensity > 0.001) {",
      "            pixColor.rgb = mix(pixColor.rgb, scanTint, clamp(intensity, 0.0, 0.68));",
      "        }",
      "    }",
      "}",
    ].join("\n")),
  };
};

const createCenterSettingsBurst = ({ vertical = false, reverse = false } = {}) => ({
  durationMs: 1000,
  easeBezier: [0.0, 0.0, 1.0, 1.0],
  buildDeclarations: ({ box, progress }, index) => ([
    `const vec2 windowMin${index} = vec2(${box.minX.toFixed(6)}, ${box.minY.toFixed(6)});`,
    `const vec2 windowMax${index} = vec2(${box.maxX.toFixed(6)}, ${box.maxY.toFixed(6)});`,
    `const float progress${index} = ${progress.toFixed(6)};`,
  ].join("\n")),
  buildLogic: (index) => ([
    "{",
    `    vec2 windowMinPx = windowMin${index} * fullSize;`,
    `    vec2 windowMaxPx = windowMax${index} * fullSize;`,
    "    vec2 windowSizePx = max(windowMaxPx - windowMinPx, vec2(1.0));",
    "    vec2 localPx = gl_FragCoord.xy - windowMinPx;",
    "",
    "    bool insideWindow = all(greaterThanEqual(localPx, vec2(0.0)))",
    "        && all(lessThanEqual(localPx, windowSizePx));",
    "",
    "    if (insideWindow) {",
    vertical
      ? "        vec2 burstLocalPx = vec2(windowSizePx.y - localPx.y, localPx.x);"
      : "        vec2 burstLocalPx = localPx;",
    vertical
      ? "        vec2 burstWindowSizePx = vec2(windowSizePx.y, windowSizePx.x);"
      : "        vec2 burstWindowSizePx = windowSizePx;",
    "        float triangleSide = max(96.0, min(burstWindowSizePx.x / 6.5, burstWindowSizePx.y / 4.0));",
    "        float triangleHeight = triangleSide * 0.8660254;",
    "        float triangleColumnCount = floor(burstWindowSizePx.x / (triangleSide * 0.5)) + 3.0;",
    "        float triangleRowCount = floor(burstWindowSizePx.y / triangleHeight) + 4.0;",
    "        float lastColumnIndex = triangleColumnCount - 1.0;",
    "        float renderedGridWidth = lastColumnIndex * triangleSide * 0.5 + triangleSide;",
    "        float gridOffsetX = (burstWindowSizePx.x - renderedGridWidth) * 0.5 + triangleSide * 0.5;",
    "        float renderedGridHeight = (triangleRowCount - 1.0) * triangleHeight + triangleHeight;",
    "        float gridOffsetY = (burstWindowSizePx.y - renderedGridHeight) * 0.5 + triangleHeight * 0.5;",
    "        ivec2 baseCell = ivec2(floor(vec2((burstLocalPx.x - gridOffsetX) / (triangleSide * 0.5), (burstLocalPx.y - gridOffsetY) / triangleHeight)));",
    "        float centerLeftIndex = floor(lastColumnIndex * 0.5);",
    "        float centerRightIndex = ceil(lastColumnIndex * 0.5);",
    "        float maxSweepIndex = max(centerLeftIndex, lastColumnIndex - centerRightIndex);",
    "        float intensity = 0.0;",
    "        for (int offsetY = -1; offsetY <= 1; offsetY++) {",
    "            for (int offsetX = -1; offsetX <= 1; offsetX++) {",
    "                ivec2 cell = baseCell + ivec2(offsetX, offsetY);",
    "                if (cell.x < 0 || cell.y < 0) {",
    "                    continue;",
    "                }",
    "                if (float(cell.x) > triangleColumnCount - 1.0 || float(cell.y) > triangleRowCount - 1.0) {",
    "                    continue;",
    "                }",
    "                vec2 centerPoint = vec2(gridOffsetX + float(cell.x) * triangleSide * 0.5, gridOffsetY + float(cell.y) * triangleHeight);",
    "                bool inverted = mod(float(cell.x), 2.0) < 0.5",
    "                    ? mod(float(cell.y), 2.0) > 0.5",
    "                    : mod(float(cell.y), 2.0) < 0.5;",
    "                vec2 leftPoint = inverted",
    "                    ? vec2(centerPoint.x - triangleSide * 0.5, centerPoint.y + triangleHeight * 0.5)",
    "                    : vec2(centerPoint.x - triangleSide * 0.5, centerPoint.y - triangleHeight * 0.5);",
    "                vec2 rightPoint = inverted",
    "                    ? vec2(centerPoint.x + triangleSide * 0.5, centerPoint.y + triangleHeight * 0.5)",
    "                    : vec2(centerPoint.x + triangleSide * 0.5, centerPoint.y - triangleHeight * 0.5);",
    "                vec2 yPoint = inverted",
    "                    ? vec2(centerPoint.x, centerPoint.y - triangleHeight * 0.5)",
    "                    : vec2(centerPoint.x, centerPoint.y + triangleHeight * 0.5);",
    "                float distanceFromCenter = min(abs(float(cell.x) - centerLeftIndex), abs(float(cell.x) - centerRightIndex));",
    "                float distanceFromEdge = min(float(cell.x), lastColumnIndex - float(cell.x));",
    "                float sweepProgress = progress" + index + " * (maxSweepIndex + 5.0);",
    reverse
      ? "                float trianglePhase = sweepProgress - distanceFromEdge;"
      : "                float trianglePhase = sweepProgress - distanceFromCenter;",
    "                if (trianglePhase <= 0.0 || trianglePhase >= 5.0) {",
    "                    continue;",
    "                }",
    "                float holdPhase = trianglePhase >= 1.0 && trianglePhase < 4.0 ? 1.0 : 0.0;",
    "                float enterPhase = clamp(trianglePhase, 0.0, 1.0);",
    "                float exitPhase = clamp(trianglePhase - 4.0, 0.0, 1.0);",
    "                bool isLeadingSide = float(cell.x) <= centerLeftIndex;",
    "                float leftCellX = float(cell.x) - 1.0;",
    "                float rightCellX = float(cell.x) + 1.0;",
    "                float leftDistanceFromCenter = min(abs(leftCellX - centerLeftIndex), abs(leftCellX - centerRightIndex));",
    "                float rightDistanceFromCenter = min(abs(rightCellX - centerLeftIndex), abs(rightCellX - centerRightIndex));",
    "                float leftDistanceFromEdge = min(leftCellX, lastColumnIndex - leftCellX);",
    "                float rightDistanceFromEdge = min(rightCellX, lastColumnIndex - rightCellX);",
    reverse
      ? "                float leftNeighborPhase = sweepProgress - leftDistanceFromEdge;"
      : "                float leftNeighborPhase = sweepProgress - leftDistanceFromCenter;",
    reverse
      ? "                float rightNeighborPhase = sweepProgress - rightDistanceFromEdge;"
      : "                float rightNeighborPhase = sweepProgress - rightDistanceFromCenter;",
    "                bool leftNeighborActive = cell.x > 0 && leftNeighborPhase > 0.0 && leftNeighborPhase < 5.0;",
    "                bool rightNeighborActive = float(cell.x) < lastColumnIndex && rightNeighborPhase > 0.0 && rightNeighborPhase < 5.0;",
    "                bool fadeOnly = leftNeighborActive == rightNeighborActive;",
    "                float visibility = min(enterPhase, 1.0 - exitPhase);",
    reverse
      ? "                float leftRatio = isLeadingSide ? 1.0 - exitPhase : enterPhase;"
      : "                float leftRatio = isLeadingSide ? enterPhase : 1.0 - exitPhase;",
    reverse
      ? "                float rightRatio = isLeadingSide ? enterPhase : 1.0 - exitPhase;"
      : "                float rightRatio = isLeadingSide ? 1.0 - exitPhase : enterPhase;",
    "                float yRatio = 1.0;",
    "                if (!fadeOnly && (leftRatio <= 0.001 || rightRatio <= 0.001 || yRatio <= 0.001)) {",
    "                    continue;",
    "                }",
    "                vec2 currentLeft = leftPoint;",
    "                vec2 currentRight = rightPoint;",
    "                vec2 currentY = yPoint;",
    "                if (!fadeOnly && leftRatio < 0.9) {",
    "                    vec2 leftRightVector = (currentRight - currentLeft) * (1.0 - leftRatio);",
    "                    vec2 leftYVector = (currentY - currentLeft) * (1.0 - leftRatio);",
    "                    currentLeft = currentLeft + leftRightVector * 0.5 + leftYVector * 0.5;",
    "                }",
    "                if (!fadeOnly && rightRatio < 0.9) {",
    "                    vec2 rightLeftVector = (currentLeft - currentRight) * (1.0 - rightRatio);",
    "                    vec2 rightYVector = (currentY - currentRight) * (1.0 - rightRatio);",
    "                    currentRight = currentRight + rightLeftVector * 0.5 + rightYVector * 0.5;",
    "                }",
    "                if (!fadeOnly && yRatio < 0.9) {",
    "                    vec2 yLeftVector = (currentLeft - currentY) * (1.0 - yRatio);",
    "                    vec2 yRightVector = (currentRight - currentY) * (1.0 - yRatio);",
    "                    currentY = currentY + yLeftVector * 0.5 + yRightVector * 0.5;",
    "                }",
    vertical
      ? "                currentLeft = vec2(currentLeft.y, windowSizePx.y - currentLeft.x);"
      : "                currentLeft = currentLeft;",
    vertical
      ? "                currentRight = vec2(currentRight.y, windowSizePx.y - currentRight.x);"
      : "                currentRight = currentRight;",
    vertical
      ? "                currentY = vec2(currentY.y, windowSizePx.y - currentY.x);"
      : "                currentY = currentY;",
    "                vec2 triangleCentroid = (currentLeft + currentRight + currentY) / 3.0;",
    "                float gapPixels = 3.0;",
    "                currentLeft = mix(currentLeft, triangleCentroid, gapPixels / triangleSide);",
    "                currentRight = mix(currentRight, triangleCentroid, gapPixels / triangleSide);",
    "                currentY = mix(currentY, triangleCentroid, gapPixels / triangleSide);",
    "                if (point_in_triangle(localPx, currentLeft, currentRight, currentY)) {",
    `                    float fade = 1.0 - smoothstep(0.88, 1.0, progress${index});`,
    "                    float triangleAlpha = fadeOnly ? visibility : max(0.65, holdPhase);",
    "                    intensity = max(intensity, (0.26 + 0.34 * fade) * triangleAlpha);",
    "                }",
    "            }",
    "        }",
    "",
    "        if (intensity > 0.001) {",
    "            pixColor.rgb = mix(pixColor.rgb, scanTint, clamp(intensity, 0.0, 0.68));",
    "        }",
    "    }",
    "}",
  ].join("\n")),
});

const createRadialCenterSettingsBurst = ({ reverse = false } = {}) => ({
  durationMs: 600,
  easeBezier: [0.0, 0.0, 1.0, 1.0],
  buildDeclarations: ({ box, progress }, index) => ([
    `const vec2 windowMin${index} = vec2(${box.minX.toFixed(6)}, ${box.minY.toFixed(6)});`,
    `const vec2 windowMax${index} = vec2(${box.maxX.toFixed(6)}, ${box.maxY.toFixed(6)});`,
    `const float progress${index} = ${progress.toFixed(6)};`,
  ].join("\n")),
  buildLogic: (index) => ([
    "{",
    `    vec2 windowMinPx = windowMin${index} * fullSize;`,
    `    vec2 windowMaxPx = windowMax${index} * fullSize;`,
    "    vec2 windowSizePx = max(windowMaxPx - windowMinPx, vec2(1.0));",
    "    vec2 localPx = gl_FragCoord.xy - windowMinPx;",
    "",
    "    bool insideWindow = all(greaterThanEqual(localPx, vec2(0.0)))",
    "        && all(lessThanEqual(localPx, windowSizePx));",
    "",
    "    if (insideWindow) {",
    "        vec2 burstLocalPx = localPx;",
    "        vec2 burstWindowSizePx = windowSizePx;",
    "        float triangleSide = max(96.0, min(burstWindowSizePx.x / 6.5, burstWindowSizePx.y / 4.0));",
    "        float triangleHeight = triangleSide * 0.8660254;",
    "        float triangleColumnCount = floor(burstWindowSizePx.x / (triangleSide * 0.5)) + 3.0;",
    "        float triangleRowCount = floor(burstWindowSizePx.y / triangleHeight) + 4.0;",
    "        float lastColumnIndex = triangleColumnCount - 1.0;",
    "        float lastRowIndex = triangleRowCount - 1.0;",
    "        float renderedGridWidth = lastColumnIndex * triangleSide * 0.5 + triangleSide;",
    "        float gridOffsetX = (burstWindowSizePx.x - renderedGridWidth) * 0.5 + triangleSide * 0.5;",
    "        float renderedGridHeight = lastRowIndex * triangleHeight + triangleHeight;",
    "        float gridOffsetY = (burstWindowSizePx.y - renderedGridHeight) * 0.5 + triangleHeight * 0.5;",
    "        ivec2 baseCell = ivec2(floor(vec2((burstLocalPx.x - gridOffsetX) / (triangleSide * 0.5), (burstLocalPx.y - gridOffsetY) / triangleHeight)));",
    "        vec2 gridCenter = vec2(lastColumnIndex * 0.5, lastRowIndex * 0.5);",
    "        vec2 gridCenterPoint = vec2(gridOffsetX + gridCenter.x * triangleSide * 0.5, gridOffsetY + gridCenter.y * triangleHeight);",
    "        float radialScaleY = triangleHeight / (triangleSide * 0.5);",
    "        vec2 cornerA = vec2(0.0, 0.0);",
    "        vec2 cornerB = vec2(lastColumnIndex, 0.0);",
    "        vec2 cornerC = vec2(0.0, lastRowIndex);",
    "        vec2 cornerD = vec2(lastColumnIndex, lastRowIndex);",
    "        float maxSweepRadius = max(",
    "            max(length(vec2((cornerA.x - gridCenter.x), (cornerA.y - gridCenter.y) * radialScaleY)), length(vec2((cornerB.x - gridCenter.x), (cornerB.y - gridCenter.y) * radialScaleY))),",
    "            max(length(vec2((cornerC.x - gridCenter.x), (cornerC.y - gridCenter.y) * radialScaleY)), length(vec2((cornerD.x - gridCenter.x), (cornerD.y - gridCenter.y) * radialScaleY)))",
    "        );",
    "        float intensity = 0.0;",
    "        for (int offsetY = -1; offsetY <= 1; offsetY++) {",
    "            for (int offsetX = -1; offsetX <= 1; offsetX++) {",
    "                ivec2 cell = baseCell + ivec2(offsetX, offsetY);",
    "                if (cell.x < 0 || cell.y < 0) {",
    "                    continue;",
    "                }",
    "                if (float(cell.x) > triangleColumnCount - 1.0 || float(cell.y) > triangleRowCount - 1.0) {",
    "                    continue;",
    "                }",
    "                vec2 centerPoint = vec2(gridOffsetX + float(cell.x) * triangleSide * 0.5, gridOffsetY + float(cell.y) * triangleHeight);",
    "                bool inverted = mod(float(cell.x), 2.0) < 0.5",
    "                    ? mod(float(cell.y), 2.0) > 0.5",
    "                    : mod(float(cell.y), 2.0) < 0.5;",
    "                vec2 leftPoint = inverted",
    "                    ? vec2(centerPoint.x - triangleSide * 0.5, centerPoint.y + triangleHeight * 0.5)",
    "                    : vec2(centerPoint.x - triangleSide * 0.5, centerPoint.y - triangleHeight * 0.5);",
    "                vec2 rightPoint = inverted",
    "                    ? vec2(centerPoint.x + triangleSide * 0.5, centerPoint.y + triangleHeight * 0.5)",
    "                    : vec2(centerPoint.x + triangleSide * 0.5, centerPoint.y - triangleHeight * 0.5);",
    "                vec2 yPoint = inverted",
    "                    ? vec2(centerPoint.x, centerPoint.y - triangleHeight * 0.5)",
    "                    : vec2(centerPoint.x, centerPoint.y + triangleHeight * 0.5);",
    "                vec2 centeredCell = vec2(float(cell.x), float(cell.y)) - gridCenter;",
    "                float radialDistance = length(vec2(centeredCell.x, centeredCell.y * radialScaleY));",
    "                float sweepProgress = progress" + index + " * (maxSweepRadius + 5.0);",
    reverse
      ? "                float trianglePhase = sweepProgress - (maxSweepRadius - radialDistance);"
      : "                float trianglePhase = sweepProgress - radialDistance;",
    "                if (trianglePhase <= 0.0 || trianglePhase >= 5.0) {",
    "                    continue;",
    "                }",
    "                float holdPhase = trianglePhase >= 1.0 && trianglePhase < 4.0 ? 1.0 : 0.0;",
    "                float enterPhase = clamp(trianglePhase, 0.0, 1.0);",
    "                float exitPhase = clamp(trianglePhase - 4.0, 0.0, 1.0);",
    "                vec2 radialUnit = radialDistance > 0.0001",
    "                    ? centeredCell / radialDistance",
    "                    : vec2(1.0, 0.0);",
    "                vec2 innerCell = vec2(float(cell.x), float(cell.y)) - radialUnit;",
    "                vec2 outerCell = vec2(float(cell.x), float(cell.y)) + radialUnit;",
    "                float innerDistance = length(vec2(innerCell.x - gridCenter.x, (innerCell.y - gridCenter.y) * radialScaleY));",
    "                float outerDistance = length(vec2(outerCell.x - gridCenter.x, (outerCell.y - gridCenter.y) * radialScaleY));",
    reverse
      ? "                float innerNeighborPhase = sweepProgress - (maxSweepRadius - innerDistance);"
      : "                float innerNeighborPhase = sweepProgress - innerDistance;",
    reverse
      ? "                float outerNeighborPhase = sweepProgress - (maxSweepRadius - outerDistance);"
      : "                float outerNeighborPhase = sweepProgress - outerDistance;",
    "                bool innerNeighborActive = innerDistance >= 0.0 && innerNeighborPhase > 0.0 && innerNeighborPhase < 5.0;",
    "                bool outerNeighborActive = outerCell.x >= 0.0 && outerCell.x <= lastColumnIndex && outerCell.y >= 0.0 && outerCell.y <= lastRowIndex && outerNeighborPhase > 0.0 && outerNeighborPhase < 5.0;",
    "                bool fadeOnly = innerNeighborActive == outerNeighborActive;",
    "                float visibility = min(enterPhase, 1.0 - exitPhase);",
    "                vec2 radialDirection = centerPoint - gridCenterPoint;",
    "                float radialDirectionLength = length(radialDirection);",
    "                radialDirection = radialDirectionLength > 0.0001 ? radialDirection / radialDirectionLength : vec2(1.0, 0.0);",
    "                float leftScore = dot(leftPoint - centerPoint, radialDirection);",
    "                float rightScore = dot(rightPoint - centerPoint, radialDirection);",
    "                float yScore = dot(yPoint - centerPoint, radialDirection);",
    "                float outerScore = max(leftScore, max(rightScore, yScore));",
    "                float innerScore = min(leftScore, min(rightScore, yScore));",
    "                bool leftIsOuter = leftScore >= outerScore - 0.001;",
    "                bool rightIsOuter = rightScore >= outerScore - 0.001;",
    "                bool yIsOuter = yScore >= outerScore - 0.001;",
    "                bool leftIsInner = leftScore <= innerScore + 0.001;",
    "                bool rightIsInner = rightScore <= innerScore + 0.001;",
    "                bool yIsInner = yScore <= innerScore + 0.001;",
    reverse
      ? "                float leftRatio = leftIsInner ? enterPhase : (leftIsOuter ? (1.0 - exitPhase) : 1.0);"
      : "                float leftRatio = leftIsInner ? (1.0 - exitPhase) : (leftIsOuter ? enterPhase : 1.0);",
    reverse
      ? "                float rightRatio = rightIsInner ? enterPhase : (rightIsOuter ? (1.0 - exitPhase) : 1.0);"
      : "                float rightRatio = rightIsInner ? (1.0 - exitPhase) : (rightIsOuter ? enterPhase : 1.0);",
    reverse
      ? "                float yRatio = yIsInner ? enterPhase : (yIsOuter ? (1.0 - exitPhase) : 1.0);"
      : "                float yRatio = yIsInner ? (1.0 - exitPhase) : (yIsOuter ? enterPhase : 1.0);",
    "                if (!fadeOnly && (leftRatio <= 0.001 || rightRatio <= 0.001 || yRatio <= 0.001)) {",
    "                    continue;",
    "                }",
    "                vec2 currentLeft = leftPoint;",
    "                vec2 currentRight = rightPoint;",
    "                vec2 currentY = yPoint;",
    "                if (!fadeOnly && leftRatio < 0.9) {",
    "                    vec2 leftRightVector = (currentRight - currentLeft) * (1.0 - leftRatio);",
    "                    vec2 leftYVector = (currentY - currentLeft) * (1.0 - leftRatio);",
    "                    currentLeft = currentLeft + leftRightVector * 0.5 + leftYVector * 0.5;",
    "                }",
    "                if (!fadeOnly && rightRatio < 0.9) {",
    "                    vec2 rightLeftVector = (currentLeft - currentRight) * (1.0 - rightRatio);",
    "                    vec2 rightYVector = (currentY - currentRight) * (1.0 - rightRatio);",
    "                    currentRight = currentRight + rightLeftVector * 0.5 + rightYVector * 0.5;",
    "                }",
    "                if (!fadeOnly && yRatio < 0.9) {",
    "                    vec2 yLeftVector = (currentLeft - currentY) * (1.0 - yRatio);",
    "                    vec2 yRightVector = (currentRight - currentY) * (1.0 - yRatio);",
    "                    currentY = currentY + yLeftVector * 0.5 + yRightVector * 0.5;",
    "                }",
    "                vec2 triangleCentroid = (currentLeft + currentRight + currentY) / 3.0;",
    "                float gapPixels = 3.0;",
    "                currentLeft = mix(currentLeft, triangleCentroid, gapPixels / triangleSide);",
    "                currentRight = mix(currentRight, triangleCentroid, gapPixels / triangleSide);",
    "                currentY = mix(currentY, triangleCentroid, gapPixels / triangleSide);",
    "                if (point_in_triangle(localPx, currentLeft, currentRight, currentY)) {",
    `                    float fade = 1.0 - smoothstep(0.88, 1.0, progress${index});`,
    "                    float triangleAlpha = fadeOnly ? visibility : max(0.65, holdPhase);",
    "                    intensity = max(intensity, (0.26 + 0.34 * fade) * triangleAlpha);",
    "                }",
    "            }",
    "        }",
    "",
    "        if (intensity > 0.001) {",
    "            pixColor.rgb = mix(pixColor.rgb, scanTint, clamp(intensity, 0.0, 0.68));",
    "        }",
    "    }",
    "}",
  ].join("\n")),
});

const createScanlineEffect = () => ({
  durationMs: 500,
  easeBezier: [0.54, 0.02, 0.36, 0.98],
  buildDeclarations: ({ box, progress }, index) => ([
    `const vec2 windowMin${index} = vec2(${box.minX.toFixed(6)}, ${box.minY.toFixed(6)});`,
    `const vec2 windowMax${index} = vec2(${box.maxX.toFixed(6)}, ${box.maxY.toFixed(6)});`,
    `const float progress${index} = ${progress.toFixed(6)};`,
  ].join("\n")),
  buildLogic: (index) => ([
    "{",
    `    vec2 windowMinPx = windowMin${index} * fullSize;`,
    `    vec2 windowMaxPx = windowMax${index} * fullSize;`,
    "    vec2 windowSizePx = max(windowMaxPx - windowMinPx, vec2(1.0));",
    "    vec2 localPx = gl_FragCoord.xy - windowMinPx;",
    "",
    "    bool insideWindow = all(greaterThanEqual(localPx, vec2(0.0)))",
    "        && all(lessThanEqual(localPx, windowSizePx));",
    "",
    "    if (insideWindow) {",
    `        float growth = progress${index} <= 0.5`,
    `            ? progress${index} / 0.5`,
    `            : (1.0 - progress${index}) / 0.5;`,
    "        float thicknessPixels = 4.0 + 0.1 * windowSizePx.x * growth;",
    `        float scanProgress = 1.0 - progress${index};`,
    "        float beamCenterPx = (windowSizePx.x + thicknessPixels * 2.0) * scanProgress - thicknessPixels;",
    "",
    "        if (abs(localPx.x - beamCenterPx) < thicknessPixels) {",
    "            pixColor.rgb = scanTint;",
    "        }",
    "    }",
    "}",
  ].join("\n")),
});

export const OPEN_WINDOW_EFFECTS = {
  scanline: createScanlineEffect(),
  settings_burst: createDirectionalSettingsBurst("left"),
  settings_burst_left: createDirectionalSettingsBurst("left"),
  settings_burst_right: createDirectionalSettingsBurst("right"),
  settings_burst_top: createDirectionalSettingsBurst("top"),
  settings_burst_bottom: createDirectionalSettingsBurst("bottom"),
  settings_burst_center: createCenterSettingsBurst(),
  settings_burst_center_reverse: createCenterSettingsBurst({ reverse: true }),
  settings_burst_center_horizontal: createCenterSettingsBurst({ vertical: true }),
  settings_burst_center_horizontal_reverse: createCenterSettingsBurst({ vertical: true, reverse: true }),
  settings_burst_center_radial: createRadialCenterSettingsBurst(),
  settings_burst_center_radial_reverse: createRadialCenterSettingsBurst({ reverse: true }),
};

export const buildOpenWindowShader = (template, animations) => {
  const declarations = animations
    .map((animation, index) => OPEN_WINDOW_EFFECTS[animation.effectId].buildDeclarations(animation, index))
    .join("\n\n");

  const logic = animations
    .map((animation, index) => OPEN_WINDOW_EFFECTS[animation.effectId].buildLogic(index))
    .join("\n\n");

  return template
    .replace("__ANIMATION_DECLARATIONS__", declarations)
    .replace("__ANIMATION_LOGIC__", logic);
};
