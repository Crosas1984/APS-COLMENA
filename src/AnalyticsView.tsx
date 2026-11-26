import { useEffect, useMemo, useState, type CSSProperties } from 'react';
import { plantCatalog } from './data';

type ProductionRow = {
  plant: string;
  machine: string;
  montage: string;
  thickness: string;
  operator: string;
  produced: number;
  good: number;
  ideal: number;
  plannedMinutes: number;
  downtimeMinutes: number;
};

const productionData: ProductionRow[] = [
  { plant: 'PLANTA AUTOPISTA SUR', machine: 'YODER 1', montage: 'Montaje 3” N', thickness: '1,5 mm', operator: 'Carlos Rojas', produced: 92, good: 89, ideal: 100, plannedMinutes: 480, downtimeMinutes: 42 },
  { plant: 'PLANTA AUTOPISTA SUR', machine: 'ENDEREZADORA', montage: 'Montaje 3” N', thickness: '1,5 mm', operator: 'Jorge Díaz', produced: 81, good: 80, ideal: 88, plannedMinutes: 480, downtimeMinutes: 28 },
  { plant: 'PLANTA AUTOPISTA SUR', machine: 'PAXSON', montage: 'Lote roscado 2”', thickness: '2,5 mm', operator: 'Ana Torres', produced: 34, good: 31, ideal: 42, plannedMinutes: 480, downtimeMinutes: 120 },
  { plant: 'PLANTA MOSQUERA', machine: 'FORMADORA 1', montage: 'Montaje 6”', thickness: '3,0 mm', operator: 'Luis Pérez', produced: 116, good: 113, ideal: 125, plannedMinutes: 480, downtimeMinutes: 25 },
  { plant: 'PLANTA MOSQUERA', machine: 'CORTE TUBO', montage: 'Montaje 6”', thickness: '3,0 mm', operator: 'Sandra Gil', produced: 124, good: 121, ideal: 135, plannedMinutes: 480, downtimeMinutes: 18 },
  { plant: 'PLANTA SIGMA STEEL', machine: 'LÍNEA 1', montage: 'Montaje 6”', thickness: '4,0 mm', operator: 'Diego Mora', produced: 121, good: 117, ideal: 135, plannedMinutes: 480, downtimeMinutes: 51 },
  { plant: 'PLANTA SIGMA STEEL', machine: 'FORM 19', montage: 'Montaje 8”', thickness: '5,0 mm', operator: 'Paola Ruiz', produced: 76, good: 72, ideal: 95, plannedMinutes: 480, downtimeMinutes: 82 },
];

const unique = (rows: ProductionRow[], key: keyof ProductionRow) => Array.from(new Set(rows.map((row) => String(row[key]))));
const percent = (value: number) => `${Math.round(value)}%`;

function calculateOee(rows: ProductionRow[]) {
  if (!rows.length) return { availability: 0, performance: 0, quality: 0, oee: 0, produced: 0, good: 0 };
  const planned = rows.reduce((sum, row) => sum + row.plannedMinutes, 0);
  const operating = rows.reduce((sum, row) => sum + row.plannedMinutes - row.downtimeMinutes, 0);
  const produced = rows.reduce((sum, row) => sum + row.produced, 0);
  const good = rows.reduce((sum, row) => sum + row.good, 0);
  const idealOutput = rows.reduce((sum, row) => sum + row.ideal, 0);
  const availability = operating / planned;
  const performance = idealOutput ? produced / idealOutput : 0;
  const quality = produced ? good / produced : 0;
  return { availability: availability * 100, performance: performance * 100, quality: quality * 100, oee: availability * performance * quality * 100, produced, good };
}

function aggregate(rows: ProductionRow[], key: keyof ProductionRow) {
  return Array.from(new Set(rows.map((row) => String(row[key])))).map((label) => {
    const group = rows.filter((row) => String(row[key]) === label);
    const oee = calculateOee(group);
    return { label, produced: oee.produced, oee: oee.oee };
  }).sort((left, right) => right.produced - left.produced);
}

export function AnalyticsView() {
  const configuredMachines = useMemo(() => {
    try {
      const stored = window.localStorage.getItem('aps-colmena-master-records-v1');
      if (!stored) return null;
      const saved = JSON.parse(stored) as { machines?: Array<Record<string, any>> };
      return (saved.machines ?? []).filter((record) => !record.__blocked && record.Estado !== 'Inactivo' && record.Planta && record.Máquina);
    } catch {
      return null;
    }
  }, []);
  const sourceRows = useMemo(() => {
    if (!configuredMachines) return productionData;
    return productionData.filter((row) => {
      const plant = plantCatalog.find((item) => item.name === row.plant);
      return configuredMachines.some((machine) => String(machine.Máquina) === row.machine && String(machine.Planta) === plant?.code);
    });
  }, [configuredMachines]);
  const [plant, setPlant] = useState('Todas');
  const [machine, setMachine] = useState('Todas');
  const [montage, setMontage] = useState('Todos');
  const [thickness, setThickness] = useState('Todos');
  const [operator, setOperator] = useState('Todos');
  const filtered = useMemo(() => sourceRows.filter((row) => (plant === 'Todas' || row.plant === plant) && (machine === 'Todas' || row.machine === machine) && (montage === 'Todos' || row.montage === montage) && (thickness === 'Todos' || row.thickness === thickness) && (operator === 'Todos' || row.operator === operator)), [sourceRows, plant, machine, montage, thickness, operator]);
  const kpi = calculateOee(filtered);
  const byPlant = aggregate(filtered, 'plant');
  const byMachine = aggregate(filtered, 'machine');
  const byMontage = aggregate(filtered, 'montage');
  const byThickness = aggregate(filtered, 'thickness');
  const byOperator = aggregate(filtered, 'operator');
  const bottleneck = byMachine.length ? byMachine.reduce((worst, current) => current.oee < worst.oee ? current : worst) : null;
  const machineOptions = unique(plant === 'Todas' ? sourceRows : sourceRows.filter((row) => row.plant === plant), 'machine');
  const montageOptions = unique(filtered.length ? filtered : sourceRows, 'montage');
  const thicknessOptions = unique(filtered.length ? filtered : sourceRows, 'thickness');
  const operatorOptions = unique(filtered.length ? filtered : sourceRows, 'operator');
  const maxProduced = Math.max(...byMachine.map((item) => item.produced), 1);

  useEffect(() => {
    if (machine !== 'Todas' && !machineOptions.includes(machine)) setMachine('Todas');
  }, [machine, machineOptions]);

  function clearFilters() { setPlant('Todas'); setMachine('Todas'); setMontage('Todos'); setThickness('Todos'); setOperator('Todos'); }
  return <section className="analytics-page">
    <div className="analytics-hero"><div><p className="kicker">CAPÍTULO 2 · INTELIGENCIA OPERATIVA</p><h2>Analítica de producción</h2><p>Lectura ejecutiva y operativa del desempeño de las plantas, las máquinas y los equipos de trabajo.</p></div><div className="analytics-live"><i /> DATOS DE PRODUCCIÓN <strong>{filtered.length} registros analizados</strong></div></div>
    <div className="analytics-filters"><label>Planta<select value={plant} onChange={(event) => { setPlant(event.target.value); setMachine('Todas'); }}><option>Todas</option>{plantCatalog.map((item) => <option value={item.name} key={item.code}>{item.name}</option>)}</select></label><label>Máquina<select value={machine} disabled={plant === 'Todas'} onChange={(event) => setMachine(event.target.value)}><option>{plant === 'Todas' ? 'Seleccione planta' : 'Todas'}</option>{plant !== 'Todas' && machineOptions.map((item) => <option value={item} key={item}>{item}</option>)}</select></label><label>Montaje<select value={montage} onChange={(event) => setMontage(event.target.value)}><option>Todos</option>{montageOptions.map((item) => <option value={item} key={item}>{item}</option>)}</select></label><label>Espesor<select value={thickness} onChange={(event) => setThickness(event.target.value)}><option>Todos</option>{thicknessOptions.map((item) => <option value={item} key={item}>{item}</option>)}</select></label><label>Operario<select value={operator} onChange={(event) => setOperator(event.target.value)}><option>Todos</option>{operatorOptions.map((item) => <option value={item} key={item}>{item}</option>)}</select></label><button type="button" onClick={clearFilters}>Limpiar</button></div>
    <div className="analytics-kpis"><Kpi label="OEE global" value={percent(kpi.oee)} detail="Disponibilidad × rendimiento × calidad" tone="primary"/><Kpi label="Disponibilidad" value={percent(kpi.availability)} detail="Tiempo operativo sobre plan"/><Kpi label="Rendimiento" value={percent(kpi.performance)} detail="Salida real contra ideal"/><Kpi label="Calidad" value={percent(kpi.quality)} detail={`${kpi.good.toFixed(0)} t conformes`}/><Kpi label="Producción" value={`${kpi.produced.toFixed(0)} t`} detail="Salida acumulada"/></div>
    <div className="analytics-grid"><article className="panel analytics-chart"><ChartTitle kicker="DESEMPEÑO MULTIPLANTA" title="Producción por planta"/><Bars items={byPlant} unit="t" max={Math.max(...byPlant.map((item) => item.produced), 1)}/></article><article className="panel oee-panel"><ChartTitle kicker="OEE · LÍNEA ACTUAL" title="Lectura del indicador"/><div className="oee-ring" style={{ '--oee': `${Math.min(100, kpi.oee)}%` } as CSSProperties}><strong>{percent(kpi.oee)}</strong><span>OEE</span></div><div className="oee-legend"><span><i className="availability"/> Disponibilidad <b>{percent(kpi.availability)}</b></span><span><i className="performance"/> Rendimiento <b>{percent(kpi.performance)}</b></span><span><i className="quality"/> Calidad <b>{percent(kpi.quality)}</b></span></div></article></div>
    <div className="analytics-grid lower-analytics"><article className="panel analytics-chart wide-chart"><ChartTitle kicker="EFICIENCIA DE RECURSOS" title="Máquinas y posibles restricciones"/>{bottleneck && <div className="bottleneck-note"><span>Cuello de botella potencial</span><b>{bottleneck.label}</b><em>OEE {percent(bottleneck.oee)}</em></div>}<Bars items={byMachine} unit="t" max={maxProduced} highlight={bottleneck?.label}/></article><article className="panel analytics-list"><ChartTitle kicker="ANÁLISIS OPERATIVO" title="Eficiencia por máquina"/>{byMachine.map((item) => <div className="eff-row" key={item.label}><div><b>{item.label}</b><span>{item.produced.toFixed(0)} t producidas</span></div><strong className={item.oee < 65 ? 'low' : ''}>{percent(item.oee)}</strong></div>)}</article></div>
    <div className="analytics-grid detail-analytics"><article className="panel analytics-chart"><ChartTitle kicker="MIX DE PRODUCCIÓN" title="Por montaje y espesor"/><Bars items={byMontage} unit="t" max={Math.max(...byMontage.map((item) => item.produced), 1)}/><div className="subchart"><b>Espesor</b><Bars items={byThickness} unit="t" max={Math.max(...byThickness.map((item) => item.produced), 1)} compact/></div></article><article className="panel analytics-list"><ChartTitle kicker="PERSONAS Y PRODUCCIÓN" title="Producción por operario"/>{byOperator.map((item) => <div className="operator-row" key={item.label}><span className="operator-avatar">{item.label.split(' ').map((part) => part[0]).join('').slice(0, 2)}</span><div><b>{item.label}</b><small>{item.produced.toFixed(0)} t · OEE {percent(item.oee)}</small></div><i style={{ width: `${Math.min(100, item.produced / Math.max(...byOperator.map((entry) => entry.produced), 1) * 100)}%` }}/></div>)}</article></div>
  </section>;
}

function Kpi({ label, value, detail, tone = '' }: { label: string; value: string; detail: string; tone?: string }) { return <div className={`analytics-kpi ${tone}`}><span>{label}</span><b>{value}</b><small>{detail}</small></div>; }
function ChartTitle({ kicker, title }: { kicker: string; title: string }) { return <div className="chart-title"><p className="kicker">{kicker}</p><h3>{title}</h3></div>; }
function Bars({ items, unit, max, highlight, compact = false }: { items: { label: string; produced: number; oee: number }[]; unit: string; max: number; highlight?: string; compact?: boolean }) { return <div className={`bar-list ${compact ? 'compact-bars' : ''}`}>{items.map((item) => <div className={`bar-row ${item.label === highlight ? 'highlight-bar' : ''}`} key={item.label}><span title={item.label}>{item.label}</span><div className="bar-track"><i style={{ width: `${Math.max(4, item.produced / max * 100)}%` }}/></div><b>{item.produced.toFixed(0)} {unit}</b></div>)}</div>; }
