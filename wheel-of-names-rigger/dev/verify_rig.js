/*
 * Faithful re-implementation of wheelofnames.com's spin physics (from
 * github.com/momander/wheel-spinner: Wheel.js + Util.getIndexAtPointer),
 * plus our setRandomPosition override, to verify the rig always lands on the
 * chosen target across many random configurations.
 */
const TWO_PI = 2 * Math.PI;
const STOP_SPEED = 0.00015;

// ---- Util.getIndexAtPointer (verbatim logic) ----
function getTotalWeight(entries) {
  let t = 0;
  for (const e of entries) if (e.weight) t += e.weight;
  return t;
}
function getIndexAtPointer(entries, angle) {
  let index = 0;
  if (entries.length === 0) return 0;
  if (entries[0].weight) {
    const totalWeight = getTotalWeight(entries);
    const radians = entries.map((e) => (TWO_PI * e.weight) / totalWeight);
    const endRadians = [];
    let endAngle = radians[0] / 2;
    entries.forEach((entry, i) => {
      endRadians.push(endAngle);
      endAngle += radians[i + 1];
    });
    index = 0;
    while (true) {
      if (angle < endRadians[index]) break;
      index++;
      if (index > endRadians.length - 1) break;
    }
  } else {
    const radiansPerSegment = TWO_PI / entries.length;
    index = Math.round(angle / radiansPerSegment);
  }
  if (index >= entries.length) index = 0;
  return index;
}

// ---- our override math (mirror of main-world.js) ----
function angleForIndex(entries, t) {
  const N = entries.length;
  if (N === 0) return 0;
  const weighted = !!(entries[0] && entries[0].weight);
  if (!weighted) {
    return ((((t % N) * (TWO_PI / N)) % TWO_PI) + TWO_PI) % TWO_PI;
  }
  let totalWeight = 0;
  for (const e of entries) totalWeight += e.weight || 0;
  const radians = entries.map((e) => (TWO_PI * (e.weight || 0)) / totalWeight);
  const endRadians = [];
  let endAngle = radians[0] / 2;
  for (let i = 0; i < entries.length; i++) {
    endRadians.push(endAngle);
    endAngle += radians[i + 1] || 0;
  }
  if (t <= 0) return endRadians[0] / 2;
  const lower = endRadians[t - 1];
  const upper = t < endRadians.length ? endRadians[t] : TWO_PI;
  return (lower + upper) / 2;
}
function decelerationTravel(startSpeed, decelTicks) {
  if (!(startSpeed > 0) || !(decelTicks > 0)) return 0;
  const r = Math.exp(Math.log(STOP_SPEED / startSpeed) / decelTicks);
  return (startSpeed * (1 - Math.pow(r, decelTicks + 1))) / (1 - r);
}

// ---- full spin simulation, mirroring Wheel.js tick/advance/state machine ----
function simulateSpin(entries, spinTime, slowSpin, firstSpin, targetIndex, rig) {
  const spinTicks = spinTime * 60;
  const MAXA = Math.min(60, spinTicks / 3);
  const MAXD = spinTicks - MAXA;

  let angle = 0;
  let speed = firstSpin ? 0.005 : 0; // InitialDemoSpin sets 0.005; PostSpin sets 0
  let state = "accel";
  let ageA = 0;
  let ageD = 0;
  let decelR = 0;
  let winner = null;

  function advance() {
    angle += speed;
    if (angle > TWO_PI) angle -= TWO_PI;
  }

  let guard = 0;
  while (winner === null && guard++ < 10_000_000) {
    if (state === "accel") {
      speed += slowSpin ? 0.001 : 0.01;
      ageA++;
      if (ageA > MAXA) {
        // setRandomPosition() — original sets a random angle...
        angle = Math.random() * TWO_PI;
        // ...then our override replaces it (only when armed + target present):
        if (rig) {
          const tAngle = angleForIndex(entries, targetIndex);
          const D = decelerationTravel(speed, MAXD);
          angle = (((tAngle - D) % TWO_PI) + TWO_PI) % TWO_PI;
        }
        // entering DeceleratingState (computes r from current speed):
        decelR = Math.exp(Math.log(STOP_SPEED / speed) / MAXD);
        ageD = 0;
        state = "decel";
      }
    } else if (state === "decel") {
      speed = speed * decelR;
      ageD++;
      if (ageD > MAXD) {
        speed = 0; // PostSpinState
        winner = getIndexAtPointer(entries, angle); // spinIsDone reads here
        state = "post";
      }
    }
    advance();
  }
  return winner;
}

// ---- random scenario generator ----
function makeEntries(n, weighted) {
  const out = [];
  for (let i = 0; i < n; i++) {
    const e = { text: "name-" + i };
    if (weighted) e.weight = 1 + Math.floor(Math.random() * 9); // 1..9
    out.push(e);
  }
  return out;
}

function run() {
  let trials = 0;
  let riggedHits = 0;
  let fairAsExpected = 0;
  const failures = [];

  for (let i = 0; i < 200000; i++) {
    const n = 2 + Math.floor(Math.random() * 60); // 2..61 entries
    const weighted = Math.random() < 0.4;
    const entries = makeEntries(n, weighted);
    const spinTime = 1 + Math.floor(Math.random() * 30); // 1..30 s
    const slowSpin = Math.random() < 0.3;
    const firstSpin = Math.random() < 0.5;
    const target = Math.floor(Math.random() * n);

    // Rigged spin: must land exactly on target.
    const w = simulateSpin(entries, spinTime, slowSpin, firstSpin, target, true);
    trials++;
    if (w === target) riggedHits++;
    else
      failures.push({
        n,
        weighted,
        spinTime,
        slowSpin,
        firstSpin,
        target,
        got: w,
      });
  }

  // Sanity: with rig OFF, a fair spin should be spread across entries (not stuck).
  const counts = {};
  for (let i = 0; i < 20000; i++) {
    const entries = makeEntries(8, false);
    const w = simulateSpin(entries, 10, false, false, 0, false);
    counts[w] = (counts[w] || 0) + 1;
  }
  const distinct = Object.keys(counts).length;

  console.log("=== RIGGED SPINS ===");
  console.log("trials:", trials);
  console.log("landed on target:", riggedHits);
  console.log("misses:", trials - riggedHits);
  console.log(
    "hit rate:",
    ((100 * riggedHits) / trials).toFixed(4) + "%"
  );
  if (failures.length) {
    console.log("first few failures:", failures.slice(0, 8));
  }
  console.log("\n=== FAIR SPINS (rig off, 8 names, 20k spins) ===");
  console.log("distinct winners seen:", distinct, "/ 8");
  console.log("distribution:", counts);

  const ok = riggedHits === trials && distinct === 8;
  console.log("\nRESULT:", ok ? "PASS ✅" : "FAIL ❌");
  process.exit(ok ? 0 : 1);
}

run();
