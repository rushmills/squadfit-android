// Step counter: adaptive peak detection on phone motion.
// Real walking = an even beat (similar time between steps) with similar-sized bumps.
// Handling the phone (picking up, typing, fidgeting) = uneven timing and uneven bump sizes, so it's ignored.
// - Adjusts to how hard each person moves (hand, pocket, bag, running)
// - Counts the warm-up steps once a steady walk is confirmed, so short walks aren't lost
// - Fills in a missed bump in the middle of a steady walk
export function createStepCounter({ sensitivity = 0.28, minGap = 280, maxGap = 2000, warmup = 5 } = {}) {
  let lp = null, win = [], above = false, lastT = -1e9, steps = 0, counting = false;
  let beats = [];                       // recent bumps while warming up: { gap, amp }
  let gaps = [], amps = [];             // recent gaps/amps while counting
  let curMax = -Infinity, curMin = Infinity; // size of the current bump
  const med = (a) => { const b = [...a].sort((x, y) => x - y); return b[b.length >> 1]; };
  const reset = () => { counting = false; beats = []; gaps = []; amps = []; };
  const perBump = (g) => (g >= 850 && g <= 1500 ? 2 : 1); // pocket: one bump per 2 steps

  return {
    push(mag, t) {
      lp = lp == null ? mag : lp + 0.25 * (mag - lp);          // smooth out vibration
      win.push([t, lp]);
      while (win.length && t - win[0][0] > 1300) win.shift();
      let mn = Infinity, mx = -Infinity;
      for (const [, v] of win) { if (v < mn) mn = v; if (v > mx) mx = v; }
      const range = mx - mn, mid = (mx + mn) / 2, hyst = range * 0.18;
      const nowAbove = lp > mid + hyst ? true : lp < mid - hyst ? false : above;
      if (lp > curMax) curMax = lp; if (lp < curMin) curMin = lp;

      if (nowAbove && !above && range > sensitivity) {           // rising through the middle = one bump
        const dt = t - lastT, amp = curMax - curMin;
        curMax = -Infinity; curMin = Infinity;
        // Mid-walk, a tiny wobble or one big jolt isn't a step: skip it without breaking the walk
        const ignore = counting && amps.length && (amp < med(amps) * 0.35 || amp > med(amps) * 3.5);
        if (dt >= minGap && !ignore) {
          lastT = t;
          if (dt > maxGap * 1.5 && !(counting && gaps.length)) { reset(); beats = [{ gap: 0, amp }]; }
          else if (counting) {
            const g = med(gaps), a = med(amps), k = Math.round(dt / g);
            const steadyGap = Math.abs(dt - g) <= g * 0.4;
            const skipped = k >= 2 && k <= 3 && Math.abs(dt / k - g) <= g * 0.25;  // missed 1-2 bumps mid-walk
            const evenSize = amp >= a * 0.35 && amp <= a * 3;
            if ((steadyGap || skipped) && evenSize) {
              steps += (skipped ? k : 1) * perBump(g);
              gaps.push(skipped ? dt / k : dt); amps.push(amp);
              if (gaps.length > 10) { gaps.shift(); amps.shift(); }
            } else { reset(); beats = [{ gap: 0, amp }]; }               // rhythm broke: stop until a new steady walk
          } else {
            beats.push({ gap: beats.length ? dt : 0, amp });
            if (beats.length > warmup) beats.shift();
            const gs = beats.slice(1).map(b => b.gap), as = beats.map(b => b.amp);
            if (beats.length >= warmup) {
              const g = med(gs), a = med(as);
              const evenBeat = gs.every(x => Math.abs(x - g) <= g * 0.26) && g <= maxGap;
              const evenSize = as.every(x => x >= a * 0.42 && x <= a * 2.3);
              if (evenBeat && evenSize) {
                steps += beats.length * perBump(g);                      // count the warm-up steps too
                counting = true; gaps = gs.slice(); amps = as.slice(); beats = [];
              }
            }
          }
        }
      }
      above = nowAbove;
      if (counting && t - lastT > Math.max(maxGap, med(gaps) * 3.6)) reset();
      return steps;
    },
    get steps() { return steps; },
    set steps(n) { steps = n; }
  };
}
