// Private plan: calorie target, safe pace, goal date and a simple Jamaican meal plan.
// Everything is calculated on the phone from the user's own private stats. Nothing is stored or shared.

const B = [ // breakfast
  { n: 'Cornmeal porridge (1 cup, low-fat milk, light on sugar) + 1 boiled egg', c: 330 },
  { n: 'Ackee & saltfish (½ cup) + 1 boiled green banana', c: 360 },
  { n: 'Callaloo & saltfish (1 cup) + 2 slices whole wheat bread', c: 350 },
  { n: 'Oats porridge (1 cup) with ½ banana and cinnamon', c: 300 },
  { n: '2 boiled eggs + steamed cabbage + 1 slice hard dough bread', c: 320 },
  { n: 'Steamed mackerel (½ tin, drained) + 1 slice boiled yam', c: 370 },
  { n: 'Peanut porridge (¾ cup, light on condensed milk)', c: 340 }
];
const L = [ // lunch [regular, small]
  { n: 'Brown stew chicken (no skin) + rice & peas + garden salad', r: ['4 oz chicken, ½ cup rice & peas', 540], s: ['3 oz chicken, ⅓ cup rice & peas', 420] },
  { n: 'Steamed fish with okra + boiled green banana + yam', r: ['1 medium fish, 1 banana, 1 slice yam', 480], s: ['½ medium fish, 1 banana', 370] },
  { n: 'Red peas soup (light on dumplings and pig tail)', r: ['2 cups', 460], s: ['1½ cups', 350] },
  { n: 'Curry chicken + white rice + steamed cabbage & carrots', r: ['4 oz chicken, ½ cup rice', 520], s: ['3 oz chicken, ⅓ cup rice', 410] },
  { n: 'Jerk chicken breast + roasted breadfruit + salad', r: ['4 oz chicken, 2 slices breadfruit', 500], s: ['4 oz chicken, 1 slice breadfruit', 400] },
  { n: 'Stew peas (lean beef or chicken) + white rice', r: ['1 cup stew peas, ½ cup rice', 560], s: ['¾ cup stew peas, ⅓ cup rice', 430] },
  { n: 'Pumpkin & chicken soup with yam and carrots', r: ['2 cups', 420], s: ['1½ cups', 320] }
];
const D = [ // dinner [regular, small]
  { n: 'Baked escovitch fish + steamed vegetables + boiled dumpling', r: ['1 medium fish, 1 small dumpling', 470], s: ['½ fish, no dumpling, extra veg', 340] },
  { n: 'Steamed callaloo + boiled sweet potato + 1 boiled egg', r: ['1 cup callaloo, 1 medium potato', 400], s: ['1 cup callaloo, ½ potato', 320] },
  { n: 'Grilled chicken + steamed cabbage & carrots + sweet potato', r: ['4 oz chicken, ½ cup potato', 450], s: ['3 oz chicken, ¼ cup potato', 350] },
  { n: 'Fish tea or pepperpot soup + 2 water crackers', r: ['2 cups', 380], s: ['1½ cups', 300] },
  { n: 'Baked chicken + pumpkin rice + salad', r: ['4 oz chicken, ½ cup rice', 480], s: ['3 oz chicken, ⅓ cup rice', 380] },
  { n: 'Light mackerel rundown + boiled green banana', r: ['½ cup rundown, 2 bananas', 460], s: ['½ cup rundown, 1 banana', 360] },
  { n: 'Veggie chunks or tofu stew + rice & peas + salad', r: ['1 cup stew, ½ cup rice & peas', 450], s: ['1 cup stew, ⅓ cup rice & peas', 360] }
];
const S = [ // snacks
  { n: '1 ripe banana', c: 105 },
  { n: '1 cup pineapple or mango chunks', c: 95 },
  { n: 'Small handful roasted peanuts (1 oz)', c: 165 },
  { n: 'Low-fat yogurt (1 cup)', c: 130 },
  { n: '1 cup coconut water + 1 orange', c: 110 },
  { n: '1 guava or 2 June plums', c: 80 },
  { n: '2 water crackers + 1 slice cheese', c: 150 }
];

export const TIPS = [
  'Steam, bake, grill or boil instead of frying. Save fried dumpling, festival and bammy for treat days.',
  'Fill half your plate with veg: callaloo, cabbage, pak choi, okra, carrots, salad.',
  'Keep rice, food and dumplings to the portion shown. Ground provisions are fine, just measured.',
  'Swap sweet juices, sodas and box drinks for water, coconut water or unsweetened mint/fever grass tea.',
  'Patties, bulla, bun and hard dough bread add up fast. Treat them as treats.',
  'Aim for 8 glasses of water a day. Track it in the Food tab.'
];

// activeMinPerDay: average logged active minutes per day over recent days
export function buildPlan(ps, activeMinPerDay = 0) {
  const missing = [];
  if (!ps?.weight_lb) missing.push('current weight');
  if (!ps?.height_in) missing.push('height');
  if (!ps?.age) missing.push('age');
  if (!ps?.goal_weight_lb) missing.push('goal weight');
  if (missing.length) return { missing };

  const kg = ps.weight_lb * 0.4536, cm = ps.height_in * 2.54;
  const sexAdj = ps.gender === 'Male' ? 5 : ps.gender === 'Female' ? -161 : -78;
  const bmr = 10 * kg + 6.25 * cm - 5 * ps.age + sexAdj;
  const factor = activeMinPerDay >= 40 ? 1.55 : activeMinPerDay >= 15 ? 1.45 : 1.3;
  const activityLabel = activeMinPerDay >= 40 ? 'active' : activeMinPerDay >= 15 ? 'lightly active' : 'low so far, logging more activity updates this';
  const tdee = bmr * factor;
  const floor = ps.gender === 'Male' ? 1500 : 1200;

  // Healthy minimum weight (BMI 18.5)
  const minHealthy = Math.round(18.5 * (ps.height_in ** 2) / 703);
  const goalTooLow = ps.goal_weight_lb < minHealthy;
  const toLose = ps.weight_lb - ps.goal_weight_lb;
  if (toLose <= 0) return { reached: true, tdee: Math.round(tdee), minHealthy, goalTooLow };

  // Target pace: ~0.75% of body weight per week, between 0.5 and 1.5 lb
  // Pace: their chosen timeline if safe, otherwise ~0.75% of body weight per week (0.5-1.5 lb)
  const safeMax = Math.min(1.5, Math.max(0.5, ps.weight_lb * 0.01));
  let wantRate = Math.min(1.5, Math.max(0.5, ps.weight_lb * 0.0075));
  let timelineNote = null;
  if (ps.goal_months) {
    const needed = toLose / (ps.goal_months * 4.345);
    if (needed > safeMax) {
      wantRate = safeMax;
      timelineNote = `Reaching your goal in ${ps.goal_months} month${ps.goal_months > 1 ? 's' : ''} would mean losing about ${needed.toFixed(1)} lb a week, which is faster than is safe. This plan uses a safe pace of ${safeMax.toFixed(1)} lb a week instead.`;
    } else wantRate = Math.max(0.25, needed);
  }
  let target = Math.round((tdee - wantRate * 500) / 50) * 50;
  if (target < floor) target = floor;
  if (target > tdee - 100) target = Math.round((tdee - 125) / 50) * 50;
  const rate = Math.max(0.25, (tdee - target) / 500);
  if (ps.goal_months && !timelineNote && target === floor && rate < wantRate - 0.05)
    timelineNote = `Your timeline needs a bigger calorie cut than is safe, so moving more (walks, workouts) will be what gets you there on time.`;
  const weeks = Math.ceil(toLose / rate);
  const goalDate = new Date(); goalDate.setDate(goalDate.getDate() + weeks * 7);

  // 7-day meal plan sized to target
  const days = [];
  for (let i = 0; i < 7; i++) {
    const b = B[i % 7], l = L[(i * 3 + 1) % 7], d = D[(i * 5 + 2) % 7];
    let lp = l.r, dp = d.r;
    let total = b.c + lp[1] + dp[1];
    const snacks = [];
    if (total > target - 80) { lp = l.s; total = b.c + lp[1] + dp[1]; }
    if (total > target - 80) { dp = d.s; total = b.c + lp[1] + dp[1]; }
    let si = i;
    while (total + S[si % 7].c <= target + 60 && snacks.length < 3) { snacks.push(S[si % 7]); total += S[si % 7].c; si += 2; }
    days.push({ meals: [
      { type: 'Breakfast', text: b.n, cal: b.c },
      { type: 'Lunch', text: `${l.n} (${lp[0]})`, cal: lp[1] },
      { type: 'Dinner', text: `${d.n} (${dp[0]})`, cal: dp[1] },
      ...snacks.map(s => ({ type: 'Snack', text: s.n, cal: s.c }))
    ], total });
  }
  return { target, tdee: Math.round(tdee), rate: Math.round(rate * 10) / 10, weeks, goalDate, timelineNote, toLose: Math.round(toLose * 10) / 10, days, activityLabel, minHealthy, goalTooLow, hitFloor: target === floor };
}
