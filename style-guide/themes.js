// enteliVIZ theme objects, same keys as assets/CSV/CSS.json in the EWM framework.
// Nord_Dark / Nord_Light come from the ENTEC Theme Viewer (starting palette, not final).
export const THEMES = {
  Nord_Dark: {
    themeAccent: '#88c0d0', neutralAccent: '#5e6a80',
    headerBackground: '#1f232b', headerPrimary: '#9aa5b8', headerSecondary: '#eceff4',
    stageBackground: '#242933', stagePrimary: '#a3adbf', stageSecondary: '#eceff4',
    menuBackground: '#1f232b', menuPrimary: '#a3adbf', menuSecondary: '#eceff4',
    subMenuBackground: '#292e39', menuHighlight: '#343b48',
    calloutHeaderBackground: '#292e39', calloutHeaderPrimary: '#a3adbf', calloutHeaderSecondary: '#eceff4',
    calloutBodyBackground: '#2e3440', calloutBodyPrimary: '#a3adbf', calloutBodySecondary: '#eceff4',
    tableHeaderBackground: '#292e39', tableHeaderPrimary: '#a3adbf', tableHeaderSecondary: '#eceff4',
    tableFilterBackground: '#2e3440', tableFilterPrimary: '#a3adbf', tableFilterSecondary: '#eceff4', tableFilterHighlight: '#3b4252',
    tableBodyBackground: '#2e3440', tableBodyPrimary: '#a3adbf', tableBodySecondary: '#eceff4',
    tableRowBackground: '#2e3440', tableRowPrimary: '#a3adbf', tableRowSecondary: '#eceff4', tableRowHighlight: '#3b4252',
  },
  Nord_Light: {
    themeAccent: '#3f7f95', neutralAccent: '#a7b1c2',
    headerBackground: '#fafbfc', headerPrimary: '#5e6a80', headerSecondary: '#2e3440',
    stageBackground: '#e5e9f0', stagePrimary: '#5e6a80', stageSecondary: '#2e3440',
    menuBackground: '#fafbfc', menuPrimary: '#5e6a80', menuSecondary: '#2e3440',
    subMenuBackground: '#eceff4', menuHighlight: '#d8dee9',
    calloutHeaderBackground: '#eceff4', calloutHeaderPrimary: '#5e6a80', calloutHeaderSecondary: '#2e3440',
    calloutBodyBackground: '#fafbfc', calloutBodyPrimary: '#5e6a80', calloutBodySecondary: '#2e3440',
    tableHeaderBackground: '#eceff4', tableHeaderPrimary: '#5e6a80', tableHeaderSecondary: '#2e3440',
    tableFilterBackground: '#fafbfc', tableFilterPrimary: '#5e6a80', tableFilterSecondary: '#2e3440', tableFilterHighlight: '#d8dee9',
    tableBodyBackground: '#fafbfc', tableBodyPrimary: '#5e6a80', tableBodySecondary: '#2e3440',
    tableRowBackground: '#fafbfc', tableRowPrimary: '#5e6a80', tableRowSecondary: '#2e3440', tableRowHighlight: '#e5e9f0',
  },
};

// Same in every theme: Delta status, chart and piping colors.
export const DELTA = {
  status: [
    ['deltaAlarmColor', '#e03215', 'Alarm'],
    ['manualValue', '#ff9900', 'Manual / override'],
    ['systemNominal', '#a1bc2d', 'Normal / running'],
  ],
  chart: ['#d11873', '#008c7f', '#4ba148', '#f15932', '#30a3dc', '#8fcff2', '#f9a866', '#a7c738', '#67b4ae', '#e884a8']
    .map((c, i) => [i ? `chartColor${i}` : 'chartColor', c]),
  piping: [
    ['pipingHWS1', '#da0015', 'Hot water supply'], ['pipingHWR1', '#b9464c', 'Hot water return'],
    ['pipingHWS2', '#da3d00', 'Hot water supply 2'], ['pipingHWR2', '#af6944', 'Hot water return 2'],
    ['pipingCWS1', '#0a7ceb', 'Chilled water supply'], ['pipingCWR1', '#4571a9', 'Chilled water return'],
    ['pipingCWS2', '#34a4c0', 'Chilled water supply 2'], ['pipingCWR2', '#4e828c', 'Chilled water return 2'],
    ['pipingGEOTS1', '#4b9b32', 'Geothermal supply'], ['pipingGEOTR1', '#5c7c5b', 'Geothermal return'],
    ['pipingGEOTS2', '#1e9c5e', 'Geothermal supply 2'], ['pipingGEOTR2', '#4c8069', 'Geothermal return 2'],
    ['pipingSTEAM', '#878787', 'Steam'], ['pipingCOND', '#696969', 'Condensate'], ['pipingDCW', '#0a7ceb', 'Domestic cold water'],
  ],
};

export const GROUPS = [
  ['Accents', ['themeAccent', 'neutralAccent']],
  ['Header', ['headerBackground', 'headerPrimary', 'headerSecondary']],
  ['Stage (page)', ['stageBackground', 'stagePrimary', 'stageSecondary']],
  ['Menu', ['menuBackground', 'subMenuBackground', 'menuHighlight', 'menuPrimary', 'menuSecondary']],
  ['Callout', ['calloutHeaderBackground', 'calloutBodyBackground', 'calloutBodyPrimary', 'calloutBodySecondary']],
  ['Table', ['tableHeaderBackground', 'tableBodyBackground', 'tableRowHighlight', 'tableBodyPrimary', 'tableBodySecondary']],
];
