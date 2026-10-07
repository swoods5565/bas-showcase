// ENTEC master tag list: equipment tag prefix -> standard type.
// Used by the style guide (Naming) and the configurator. Add new prefixes here.
export const TAG_LIST = [
  // prefix, type, what it is
  ['AHU', 'AHU', 'Air handling unit'],
  ['RTU', 'RTU', 'Rooftop unit'],
  ['DOAS', 'DOAS', 'Dedicated outdoor air system'],
  ['MAU', 'MAU', 'Makeup air unit'],
  ['ERV', 'ERV', 'Energy recovery ventilator'],
  ['VAV', 'VAV', 'VAV box'],
  ['AT', 'VAV', 'Air terminal (VAV box)'],
  ['TAB', 'VAV', 'Terminal air box (VAV box)'],
  ['VVT', 'VAV', 'Variable volume and temperature box'],
  ['FPB', 'FPVAV', 'Fan powered box'],
  ['FPVAV', 'FPVAV', 'Fan powered VAV box'],
  ['HP', 'HP', 'Heat pump'],
  ['WSHP', 'HP', 'Water source heat pump'],
  ['FCU', 'FCU', 'Fan coil unit'],
  ['UV', 'UV', 'Unit ventilator'],
  ['CUH', 'CUH', 'Cabinet unit heater'],
  ['UH', 'CUH', 'Unit heater'],
  ['EF', 'EF', 'Exhaust fan'],
  ['B', 'PLANT', 'Boiler'],
  ['BLR', 'PLANT', 'Boiler'],
  ['CH', 'PLANT', 'Chiller'],
  ['CHLR', 'PLANT', 'Chiller'],
  ['CT', 'PLANT', 'Cooling tower'],
  ['P', 'PLANT', 'Pump'],
  ['HX', 'PLANT', 'Heat exchanger'],
  ['LC', 'LIGHT', 'Lighting controller (prefix to confirm)'],
];

// type -> nav section and flyout heading
export const TYPES = {
  AHU: { section: 'AIR', heading: 'AIR HANDLING UNITS', label: 'AHU' },
  RTU: { section: 'AIR', heading: 'ROOFTOP UNITS', label: 'RTU' },
  DOAS: { section: 'AIR', heading: 'DEDICATED OUTDOOR AIR', label: 'DOAS' },
  MAU: { section: 'AIR', heading: 'MAKEUP AIR UNITS', label: 'MAU' },
  ERV: { section: 'AIR', heading: 'ENERGY RECOVERY', label: 'ERV' },
  PLANT: { section: 'PLANT', heading: 'CENTRAL PLANT', label: 'Plant' },
  VAV: { section: 'TU', heading: 'VAV BOXES', label: 'VAV' },
  FPVAV: { section: 'TU', heading: 'FAN POWERED BOXES', label: 'Fan Powered Box' },
  HP: { section: 'TU', heading: 'HEAT PUMPS', label: 'Heat Pump' },
  FCU: { section: 'TU', heading: 'FAN COILS', label: 'Fan Coil' },
  UV: { section: 'TU', heading: 'UNIT VENTILATORS', label: 'Unit Ventilator' },
  CUH: { section: 'MISC', heading: 'CABINET HEATERS', label: 'Cabinet Heater' },
  EF: { section: 'MISC', heading: 'EXHAUST FANS', label: 'Exhaust Fan' },
  OTHER: { section: 'MISC', heading: 'OTHER', label: 'Other' },
  // Lighting controllers get no nav pages of their own; their rooms become LIGHT rows in the room file.
  LIGHT: { section: 'LIGHTING', heading: 'LIGHTING', label: 'Lighting controller' },
};

export const SECTIONS = [['AIR', 'Air Systems'], ['PLANT', 'Central Plant'], ['TU', 'Terminal Units'], ['MISC', 'Miscellaneous']];
