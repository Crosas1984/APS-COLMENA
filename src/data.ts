export type Plant = 'Todas' | string;
export type PlantRecord = { code: string; name: string; city: string; active: boolean };
export type Order = { id: string; plant: Exclude<Plant, 'Todas'>; machine: string; montage: string; kg: number; progress: number; status: 'En curso' | 'Programado' | 'Riesgo'; end: string };
export const plantCatalog: PlantRecord[] = [
  { code: '301', name: 'PLANTA AUTOPISTA SUR', city: 'Bogotá', active: true },
  { code: '302', name: 'PLANTA MOSQUERA', city: 'Mosquera', active: true },
  { code: '308', name: 'PLANTA SIGMA STEEL', city: 'Barranquilla', active: true },
];
export const orders: Order[] = [
  { id: 'OP-260184', plant: 'Auto Sur', machine: 'YODER 1', montage: 'Montaje 3” N', kg: 90191, progress: 68, status: 'En curso', end: 'Mañana 18:30' },
  { id: 'OP-260191', plant: 'Auto Sur', machine: 'YODER 2', montage: 'Montaje 4” N', kg: 64800, progress: 41, status: 'Programado', end: 'Jue 16:00' },
  { id: 'OP-260176', plant: 'Sigma', machine: 'Línea 1', montage: 'Montaje 6”', kg: 120500, progress: 82, status: 'En curso', end: 'Vie 12:00' },
  { id: 'OP-260203', plant: 'Centro Tubos', machine: 'Corte tubo', montage: 'Lote roscado 2”', kg: 34200, progress: 55, status: 'Riesgo', end: 'Vie 17:00' },
];
export const machines = [{ name: 'YODER 1', plant: 'Auto Sur', state: 'Produciendo', progress: 68 }, { name: 'YODER 2', plant: 'Auto Sur', state: 'Produciendo', progress: 41 }, { name: 'PAXSON', plant: 'Auto Sur', state: 'Parada', progress: 0 }, { name: 'LÍNEA 1', plant: 'Sigma', state: 'Produciendo', progress: 82 }, { name: 'FORM 19', plant: 'Sigma', state: 'Mantenimiento', progress: 0 }, { name: 'CORTE TUBO', plant: 'Centro Tubos', state: 'Produciendo', progress: 55 }];
