// Demo building definition — "Meridian Center", a fictional two-story office building.
// Geometry is traced from the rendered floor plans in assets/img/floor-1.webp and floor-2.webp.
// Plan units: Level-1 image pixels (1600 × 1207). 1 px ≈ 0.2 ft. y = 0 is the north side.
export const FT_PER_PX = 0.2;

export const FLOORS = [
  { n: 1, name: 'Level 1', img: 'assets/img/floor-1.webp', w: 1600, h: 1207, x: 0, y: 0, s: 1 },
  // Level 2 sits over the Level-1 front range; its render is drawn at a larger scale (0.648 × plan)
  { n: 2, name: 'Level 2', img: 'assets/img/floor-2.webp', w: 1600, h: 652, x: 280, y: 688, s: 0.648 },
];
export const floorById = Object.fromEntries(FLOORS.map(f => [f.n, f]));

export const SPACE = {
  office: { sfpp: 200, ltg: .65, plug: .8, cfmsf: 1.0, oaRp: 5, oaRa: .06 },
  conf: { sfpp: 40, ltg: .8, plug: .6, cfmsf: 1.6, oaRp: 5, oaRa: .06 },
  lobby: { sfpp: 150, ltg: .7, plug: .3, cfmsf: 0.9, oaRp: 5, oaRa: .06 },
  cafe: { sfpp: 60, ltg: .8, plug: 2.2, cfmsf: 1.5, oaRp: 7.5, oaRa: .18 },
  support: { sfpp: 300, ltg: .6, plug: 1.4, cfmsf: 1.0, oaRp: 5, oaRa: .06 },
  data: { sfpp: 1e9, ltg: .8, plug: 20, cfmsf: 6.0, oaRp: 0, oaRa: .06 },
};

// [key, name, type, [x, y, w, h] in that floor's own image pixels, exterior exposure]
const RAW = {
  1: [
    ['01', 'Open Office — West A', 'office', [35, 15, 255, 400], 'W'],
    ['02', 'Open Office — West B', 'office', [35, 415, 255, 405], 'W'],
    ['03', 'Training Room', 'conf', [25, 840, 250, 260], 'S'],
    ['04', 'Open Office — East A', 'office', [1310, 15, 255, 405], 'E'],
    ['05', 'Open Office — East B', 'office', [1310, 420, 255, 405], 'E'],
    ['06', 'Café', 'cafe', [1325, 845, 255, 255], 'S'],
    ['07', 'Mail & Copy', 'support', [650, 160, 300, 160], 'N'],
    ['08', 'Multipurpose Room', 'conf', [650, 330, 300, 365], 'W'],
    ['09', 'Office 101', 'office', [470, 705, 160, 95], 'N'],
    ['10', 'Office 102', 'office', [470, 810, 130, 100], null],
    ['11', 'Office 103', 'office', [640, 705, 140, 95], 'N'],
    ['12', 'Office 104', 'office', [645, 810, 135, 100], null],
    ['13', 'IT / Server Room', 'data', [825, 710, 80, 90], null],
    ['14', 'Office 106', 'office', [825, 810, 80, 105], null],
    ['15', 'Focus Rooms', 'office', [910, 705, 220, 95], 'N'],
    ['16', 'Office 107', 'office', [910, 810, 90, 100], null],
    ['17', 'Office 108', 'office', [1000, 810, 90, 100], null],
    ['18', 'Main Corridor', 'lobby', [285, 918, 1025, 55], null],
    ['19', 'HR Suite', 'office', [285, 985, 170, 150], 'S'],
    ['20', 'Finance', 'office', [470, 985, 165, 120], 'S'],
    ['21', 'Main Lobby', 'lobby', [690, 975, 240, 130], 'S'],
    ['22', 'Executive Office', 'office', [965, 985, 165, 120], 'S'],
    ['23', 'Board Room', 'conf', [1140, 985, 175, 155], 'S'],
  ],
  2: [
    ['01', 'Studio West', 'office', [15, 40, 270, 295], 'W'],
    ['02', 'North Gallery', 'lobby', [310, 40, 980, 75], 'N'],
    ['03', 'West Suite', 'office', [305, 125, 175, 285], null],
    ['04', 'Office 201', 'office', [490, 125, 150, 200], null],
    ['05', 'Office 202', 'office', [650, 125, 150, 200], null],
    ['06', 'Office 203', 'office', [808, 125, 150, 200], null],
    ['07', 'Office 204', 'office', [968, 125, 150, 200], null],
    ['08', 'East Suite', 'office', [1125, 125, 170, 285], null],
    ['09', 'Studio East', 'office', [1310, 40, 260, 295], 'E'],
    ['10', 'Upper Commons', 'lobby', [610, 340, 380, 290], 'S'],
    ['11', 'Conference 201', 'conf', [305, 430, 245, 195], 'S'],
    ['12', 'Conference 202', 'conf', [1050, 430, 250, 195], 'S'],
  ],
};
// Unconditioned / exhaust-only areas drawn hatched (no VAV)
export const CORES = {
  1: [[300, 705, 160, 210, 'Restrooms'], [1140, 705, 170, 210, 'Restrooms'], [640, 985, 50, 105, 'Stair 1'], [925, 975, 40, 110, 'Stair 2'], [785, 705, 35, 210, 'Service'], [755, 1110, 90, 80, 'Vestibule']],
  2: [[555, 425, 50, 200, 'Stair 1'], [995, 405, 45, 220, 'Stair 2']],
};

const F2 = floorById[2];
const toPlan = (f, [x, y, w, h]) => { const F = floorById[f]; return [F.x + x * F.s, F.y + y * F.s, w * F.s, h * F.s]; };
const under2 = ([x, y, w, h]) => x + w / 2 > F2.x && x + w / 2 < F2.x + F2.w * F2.s && y + h / 2 > F2.y && y + h / 2 < F2.y + F2.h * F2.s;

export const ZONES = [];
for (const f of [1, 2]) for (const [k, name, type, px, face] of RAW[f]) {
  const plan = toPlan(f, px);
  const wFt = plan[2] * FT_PER_PX, dFt = plan[3] * FT_PER_PX;
  const area = Math.round(wFt * dFt);
  const facadeLen = face ? (face === 'N' || face === 'S' ? wFt : dFt) : 0;
  const sp = SPACE[type];
  const cfmMax = Math.round(area * (face ? sp.cfmsf * 1.15 : sp.cfmsf * .8) / 25) * 25;
  const people = Math.round(area / sp.sfpp);
  const vbz = sp.oaRp * people + sp.oaRa * area; // ASHRAE 62.1 breathing-zone OA
  const cfmMin = Math.round(Math.min(cfmMax * .6, Math.max(area * .15, vbz / .3)) / 5) * 5;
  ZONES.push({
    id: `VAV-${f}-${k}`, floor: f, n: k, name, type, px, rect: plan, face, area, facadeLen,
    roof: f === 2 || !under2(plan),
    cfmMax, cfmMin, cfmHtgMax: Math.max(cfmMin, Math.round(cfmMax * .5 / 5) * 5), people, vbz,
    device: 2000 + f * 100 + +k, mstp: { net: 1000 + f, mac: 10 + +k },
    size: cfmMax > 2600 ? 14 : cfmMax > 1800 ? 12 : cfmMax > 1100 ? 10 : cfmMax > 700 ? 8 : 6,
  });
}
export const zoneById = Object.fromEntries(ZONES.map(z => [z.id, z]));
export const FACE_AZ = { N: 0, E: 90, S: 180, W: 270 };

const conditioned = ZONES.reduce((a, z) => a + z.area, 0);
export const BUILDING = {
  name: 'Meridian Center', short: 'MC', floors: FLOORS.length, floorHeight: 13,
  address: 'Demo site', use: 'Office', yearBuilt: 2019,
  conditionedArea: conditioned, grossArea: Math.round(conditioned * 1.12 / 100) * 100,
  designCfm: Math.round(ZONES.reduce((a, z) => a + z.cfmMax, 0) * .8 / 1000) * 1000,
};
