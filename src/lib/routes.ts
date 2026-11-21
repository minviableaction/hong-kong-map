export const ROUTES: Record<string, string[][]> = {
  AEL: [['HOK', 'KOW', 'TSY', 'AIR', 'AWE']],
  TCL: [['HOK', 'KOW', 'OLY', 'NAC', 'LAK', 'TSY', 'SUN', 'TUC']],
  TML: [[
    'WKS', 'MOS', 'HEO', 'TSH', 'SHM', 'CIO', 'STW', 'CKT', 'TAW', 'HIK', 'DIH', 'KAT', 'SUW', 'TKW',
    'HOM', 'HUH', 'ETS', 'AUS', 'NAC', 'MEF', 'TWW', 'KSR', 'YUL', 'LOP', 'TIS', 'SIH', 'TUM',
  ]],
  TKL: [
    ['NOP', 'QUB', 'YAT', 'TIK', 'TKO', 'HAH', 'POA'],
    ['NOP', 'QUB', 'YAT', 'TIK', 'TKO', 'LHP'],
  ],
  EAL: [
    ['ADM', 'EXC', 'HUH', 'MKK', 'KOT', 'TAW', 'SHT', 'FOT', 'UNI', 'TAP', 'TWO', 'FAN', 'SHS', 'LOW'],
    ['ADM', 'EXC', 'HUH', 'MKK', 'KOT', 'TAW', 'SHT', 'FOT', 'UNI', 'TAP', 'TWO', 'FAN', 'SHS', 'LMC'],
    ['ADM', 'EXC', 'HUH', 'MKK', 'KOT', 'TAW', 'SHT', 'RAC', 'UNI', 'TAP', 'TWO', 'FAN', 'SHS', 'LOW'],
    ['ADM', 'EXC', 'HUH', 'MKK', 'KOT', 'TAW', 'SHT', 'RAC', 'UNI', 'TAP', 'TWO', 'FAN', 'SHS', 'LMC'],
  ],
  SIL: [['ADM', 'OCP', 'WCH', 'LET', 'SOH']],
  TWL: [['CEN', 'ADM', 'TST', 'JOR', 'YMT', 'MOK', 'PRE', 'SSP', 'CSW', 'LCK', 'MEF', 'LAK', 'KWF', 'KWH', 'TWH', 'TSW']],
  ISL: [['KET', 'HKU', 'SYP', 'SHW', 'CEN', 'ADM', 'WAC', 'CAB', 'TIH', 'FOH', 'NOP', 'QUB', 'TAK', 'SWH', 'SKW', 'HFC', 'CHW']],
  KTL: [['WHA', 'HOM', 'YMT', 'MOK', 'PRE', 'SKM', 'KOT', 'LOF', 'WTS', 'DIH', 'CHH', 'KOB', 'NTK', 'KWT', 'LAT', 'YAT', 'TIK']],
  DRL: [['DIS', 'SUN']],
}

export function stationJobs() {
  const jobs: { line: string; station: string }[] = []
  const seen = new Set<string>()
  for (const [line, routes] of Object.entries(ROUTES)) {
    for (const route of routes) {
      for (const station of route) {
        const key = `${line}:${station}`
        if (seen.has(key)) continue
        seen.add(key)
        jobs.push({ line, station })
      }
    }
  }
  return jobs
}
