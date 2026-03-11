const NEWTON_ITERATIONS = 4;
const NEWTON_MIN_SLOPE = 0.001;
const SUBDIVISION_PRECISION = 0.0000001;
const SUBDIVISION_MAX_ITERATIONS = 10;
const SPLINE_TABLE_SIZE = 11;
const SAMPLE_STEP_SIZE = 1.0 / (SPLINE_TABLE_SIZE - 1.0);

const bezierA = (a1, a2) => 1.0 - 3.0 * a2 + 3.0 * a1;
const bezierB = (a1, a2) => 3.0 * a2 - 6.0 * a1;
const bezierC = (a1) => 3.0 * a1;

const calcBezier = (t, a1, a2) => ((bezierA(a1, a2) * t + bezierB(a1, a2)) * t + bezierC(a1)) * t;
const getSlope = (t, a1, a2) => 3.0 * bezierA(a1, a2) * t * t + 2.0 * bezierB(a1, a2) * t + bezierC(a1);

const binarySubdivide = (x, lower, upper, x1, x2) => {
  let currentX = 0;
  let currentT = 0;
  let index = 0;

  while (index < SUBDIVISION_MAX_ITERATIONS) {
    currentT = lower + (upper - lower) / 2.0;
    currentX = calcBezier(currentT, x1, x2) - x;

    if (currentX > 0.0) {
      upper = currentT;
    } else {
      lower = currentT;
    }

    if (Math.abs(currentX) <= SUBDIVISION_PRECISION) {
      break;
    }

    index += 1;
  }

  return currentT;
};

const newtonRaphsonIterate = (x, guessT, x1, x2) => {
  let currentGuess = guessT;

  for (let index = 0; index < NEWTON_ITERATIONS; index += 1) {
    const currentSlope = getSlope(currentGuess, x1, x2);
    if (Math.abs(currentSlope) < SUBDIVISION_PRECISION) {
      return currentGuess;
    }

    const currentX = calcBezier(currentGuess, x1, x2) - x;
    currentGuess -= currentX / currentSlope;
  }

  return currentGuess;
};

export const createCubicBezier = (x1, y1, x2, y2) => {
  if (x1 === y1 && x2 === y2) {
    return (value) => value;
  }

  const sampleValues = Array.from({ length: SPLINE_TABLE_SIZE }, (_, index) => (
    calcBezier(index * SAMPLE_STEP_SIZE, x1, x2)
  ));

  const getTForX = (value) => {
    let intervalStart = 0.0;
    let currentSample = 1;
    const lastSample = SPLINE_TABLE_SIZE - 1;

    while (currentSample !== lastSample && sampleValues[currentSample] <= value) {
      intervalStart += SAMPLE_STEP_SIZE;
      currentSample += 1;
    }

    currentSample -= 1;

    const denominator = sampleValues[currentSample + 1] - sampleValues[currentSample];
    const distance = denominator === 0 ? 0 : (value - sampleValues[currentSample]) / denominator;
    const guessForT = intervalStart + distance * SAMPLE_STEP_SIZE;
    const initialSlope = getSlope(guessForT, x1, x2);

    if (initialSlope >= NEWTON_MIN_SLOPE) {
      return newtonRaphsonIterate(value, guessForT, x1, x2);
    }

    if (Math.abs(initialSlope) < SUBDIVISION_PRECISION) {
      return guessForT;
    }

    return binarySubdivide(value, intervalStart, intervalStart + SAMPLE_STEP_SIZE, x1, x2);
  };

  return (value) => {
    if (value <= 0) {
      return 0;
    }

    if (value >= 1) {
      return 1;
    }

    return calcBezier(getTForX(value), y1, y2);
  };
};
