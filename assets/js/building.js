// Demo building definition — "Meridian Tower", a fictional 4-story, ~72,000 ft² office building.
// Plan coordinates are in feet; y = 0 is the north façade.
export const BUILDING = {
  name: 'Meridian Tower', short: 'MT', floors: 4, plate: { w: 180, d: 100 }, floorHeight: 13,
  address: 'Demo site', grossArea: 72000, yearBuilt: 2019, use: 'Office',
};

// Zone template (same footprint every floor, names vary)
const TEMPLATE = [
  { k: '01', r: [0, 0, 70, 20], face: 'N' },
  { k: '02', r: [70, 0, 40, 20], face: 'N' },
  { k: '03', r: [110, 0, 70, 20], face: 'N' },
  { k: '04', r: [160, 20, 20, 60], face: 'E' },
  { k: '05', r: [110, 80, 70, 20], face: 'S' },
  { k: '06', r: [70, 80, 40, 20], face: 'S' },
  { k: '07', r: [0, 80, 70, 20], face: 'S' },
  { k: '08', r: [0, 20, 20, 60], face: 'W' },
  { k: '09', r: [20, 20, 55, 60], face: null },
  { k: '10', r: [105, 20, 55, 60], face: null },
];
// [name, type]; type drives occupant density + internal loads
const NAMES = {
  1: [['Café', 'cafe'], ['Main Lobby', 'lobby'], ['Retail Suite', 'office'], ['East Offices', 'office'], ['Fitness Center', 'fitness'], ['Mail & Loading', 'support'], ['Training Room', 'conf'], ['West Offices', 'office'], ['Security Ops', 'office'], ['Commons', 'lobby']],
  2: [['Open Office NW', 'office'], ['Conference 201', 'conf'], ['Open Office NE', 'office'], ['East Offices', 'office'], ['Open Office SE', 'office'], ['Huddle Rooms', 'conf'], ['Open Office SW', 'office'], ['West Offices', 'office'], ['Interior Work', 'office'], ['Copy / Break', 'support']],
  3: [['Open Office NW', 'office'], ['Conference 301', 'conf'], ['Open Office NE', 'office'], ['East Offices', 'office'], ['Open Office SE', 'office'], ['Board Room', 'conf'], ['Open Office SW', 'office'], ['West Offices', 'office'], ['Interior Work', 'office'], ['Break Room', 'support']],
  4: [['Open Office NW', 'office'], ['Executive Suite', 'office'], ['Open Office NE', 'office'], ['East Offices', 'office'], ['Open Office SE', 'office'], ['Data / IT Room', 'data'], ['Open Office SW', 'office'], ['West Offices', 'office'], ['Interior Work', 'office'], ['Break Room', 'support']],
};
// ft² per person at design, lighting W/ft², plug W/ft², max cooling cfm/ft²
export const SPACE = {
  office: { sfpp: 200, ltg: .65, plug: .8, cfmsf: 1.0, oaRp: 5, oaRa: .06 },
  conf: { sfpp: 40, ltg: .8, plug: .6, cfmsf: 1.6, oaRp: 5, oaRa: .06 },
  lobby: { sfpp: 150, ltg: .7, plug: .3, cfmsf: 0.9, oaRp: 5, oaRa: .06 },
  cafe: { sfpp: 60, ltg: .8, plug: 2.2, cfmsf: 1.5, oaRp: 7.5, oaRa: .18 },
  fitness: { sfpp: 100, ltg: .7, plug: .6, cfmsf: 1.4, oaRp: 20, oaRa: .06 },
  support: { sfpp: 300, ltg: .6, plug: 1.4, cfmsf: 1.0, oaRp: 5, oaRa: .06 },
  data: { sfpp: 1e9, ltg: .8, plug: 26, cfmsf: 4.6, oaRp: 0, oaRa: .06 },
};
export const CORE = { r: [75, 20, 30, 60], name: 'Core — elevators · stairs · restrooms' };

export const ZONES = [];
for (let f = 1; f <= BUILDING.floors; f++) {
  TEMPLATE.forEach((z, i) => {
    const [name, type] = NAMES[f][i];
    const area = z.r[2] * z.r[3];
    const facadeLen = z.face ? (z.face === 'N' || z.face === 'S' ? z.r[2] : z.r[3]) : 0;
    const sp = SPACE[type];
    const cfmMax = Math.round(area * (z.face ? sp.cfmsf * 1.15 : sp.cfmsf * .8) / 25) * 25;
    const people = Math.round(area / sp.sfpp);
    const vbz = sp.oaRp * people + sp.oaRa * area; // ASHRAE 62.1 breathing-zone OA
    const cfmMin = Math.round(Math.min(cfmMax * .6, Math.max(area * .15, vbz / .3)) / 5) * 5;
    ZONES.push({
      id: `VAV-${f}-${z.k}`, floor: f, n: z.k, name, type, rect: z.r, face: z.face, area, facadeLen,
      cfmMax, cfmMin, cfmHtgMax: Math.max(cfmMin, Math.round(cfmMax * .5 / 5) * 5), people, vbz,
      device: 2000 + f * 100 + +z.k, mstp: { net: 1000 + f, mac: 10 + +z.k },
      size: cfmMax > 2600 ? 14 : cfmMax > 1800 ? 12 : cfmMax > 1100 ? 10 : cfmMax > 700 ? 8 : 6,
    });
  });
}
export const zoneById = Object.fromEntries(ZONES.map(z => [z.id, z]));
export const FACE_AZ = { N: 0, E: 90, S: 180, W: 270 };
