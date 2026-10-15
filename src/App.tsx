import { useEffect, useMemo, useState } from 'react';
import { dataSource } from './supabase';
import { machines, orders, plantCatalog, type Plant } from './data';
import { MastersView } from './MastersView';
import { AnalyticsView } from './AnalyticsView';

type View = 'programacion' | 'detalle' | 'planta' | 'maestros' | 'analitica' | 'datos';

export function App() {
  const [view, setView] = useState<View>('maestros');
  const [plant, setPlant] = useState<Plant>('Todas');
  const normalizedPlant = plant === 'PLANTA AUTOPISTA SUR' ? 'Auto Sur' : plant;
  const visible = useMemo(() => normalizedPlant === 'Todas' ? orders : orders.filter((item) => item.plant === normalizedPlant), [normalizedPlant]);
  const kg = visible.reduce((sum, item) => sum + item.kg, 0);
  const active = visible.filter((item) => item.status === 'En curso').length;
  const navigation = [['maestros', 'Maestros APS'], ['programacion', 'Programación maestra'], ['detalle', 'Programación detallada'], ['planta', 'Gemelo digital'], ['analitica', 'Analítica'], ['datos', 'Datos e integraciones']] as Array<[View, string]>;

  return <div className="app"><aside><div className="brand"><img src="/colmena-logo.png" alt="Colmena · Acero en evolución" /></div><p className="kicker">CENTRO DE CONTROL</p><nav>{navigation.map(([id, label]) => <button className={view === id ? 'selected' : ''} onClick={() => setView(id)} key={id}>◈ <span>{label}</span></button>)}</nav><div className="connection"><i />{dataSource}<small>Siesa SQL · MES · Supabase</small></div></aside><main><header><div><p className="kicker">OPERACIÓN MULTIPLANTA</p><h1>{view === 'programacion' ? 'Programación maestra' : view === 'detalle' ? 'Programación detallada' : view === 'planta' ? 'Gemelo digital de planta' : view === 'analitica' ? 'Analítica de producción' : view === 'maestros' ? 'Maestros APS' : 'Datos e integraciones'}</h1></div><span className="live">● Actualización preparada</span></header>{view === 'maestros' || view === 'datos' ? <MastersView /> : view === 'analitica' ? <AnalyticsView /> : <><section className="toolbar"><label>Planta<select value={plant} onChange={(event) => setPlant(event.target.value as Plant)}><option>Todas</option>{plantCatalog.map((item) => <option value={item.name} key={item.code}>{item.name}</option>)}</select></label><span>Fecha de corte · 13 oct 2026 · 08:30</span><button>+ Nueva simulación</button></section>{view === 'programacion' ? <Dashboard visible={visible} kg={kg} active={active} plant={plant} /> : view === 'planta' ? <DigitalTwin plant={plant} /> : <section className="panel placeholder"><div>◫</div><p className="kicker">MÓDULO APS</p><h2>{view === 'detalle' ? 'Desglose por referencia y materia prima' : 'Consola operativa conectada al MES'}</h2><p>Este módulo se habilitará con los archivos reales de programación, las vistas de Siesa y los estados del MES.</p></section>}</>}</main></div>;
}

function DigitalTwin({ plant }: { plant: Plant }) {
  const [tick, setTick] = useState(0);
  const [decisionApplied, setDecisionApplied] = useState(false);
  useEffect(() => { const timer = window.setInterval(() => setTick((value) => value + 1), 1800); return () => window.clearInterval(timer); }, []);
  const plantKey = plant === 'Todas' ? 'Auto Sur' : plant.includes('AUTOPISTA') ? 'Auto Sur' : plant.includes('SIGMA') ? 'Sigma' : plant.includes('MOSQUERA') ? 'Mosquera' : plant;
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
  const plantCode = plant === 'Todas' ? '301' : plant.includes('AUTOPISTA') ? '301' : plant.includes('MOSQUERA') ? '302' : plant.includes('SIGMA') ? '308' : plant;
  const sourceMachines = configuredMachines
    ? configuredMachines.filter((record) => String(record.Planta) === plantCode).map((record) => {
      const liveMachine = machines.find((machine) => machine.name === String(record.Máquina));
      return { name: String(record.Máquina), plant: plantKey, state: liveMachine?.state ?? 'Disponible', progress: liveMachine?.progress ?? 0 };
    })
    : machines.filter((machine) => machine.plant === plantKey);
  const twinMachines = sourceMachines.length ? sourceMachines : [
    { name: 'LÍNEA PRINCIPAL', plant: plantKey, state: 'Disponible', progress: 0 },
    { name: 'FORMADORA', plant: plantKey, state: 'Disponible', progress: 0 },
    { name: 'CONTROL FINAL', plant: plantKey, state: 'Disponible', progress: 0 },
  ];
  const stages = [
    { process: 'Corte', label: 'Preparación de lámina', machine: twinMachines[0]?.name ?? 'Corte' },
    { process: 'Formado', label: 'Conformado del tubo', machine: twinMachines[1]?.name ?? 'Formadora' },
    { process: 'Enderezado', label: 'Calibración lineal', machine: twinMachines[2]?.name ?? 'Enderezadora' },
    { process: 'Prueba', label: 'Control de presión', machine: twinMachines[3]?.name ?? 'Banco de pruebas' },
  ];
  const activeStage = tick % stages.length;
  const running = twinMachines.filter((machine) => machine.state === 'Produciendo').length;
  const availability = Math.round(twinMachines.reduce((sum, machine) => sum + (machine.state === 'Mantenimiento' ? 0 : 100), 0) / twinMachines.length);
  const scoreMachine = (machine: typeof twinMachines[number]) => machine.state === 'Mantenimiento' ? 100 : machine.state === 'Parada' ? 88 : machine.progress >= 75 ? 72 : machine.progress >= 50 ? 48 : 22;
  const bottleneck = [...twinMachines].sort((left, right) => scoreMachine(right) - scoreMachine(left))[0];
  const bottleneckScore = scoreMachine(bottleneck);
  const bottleneckReason = bottleneck.state === 'Mantenimiento' ? 'Mantenimiento reduce la capacidad disponible.' : bottleneck.state === 'Parada' ? 'Equipo detenido; el flujo queda retenido en esta estación.' : 'Carga de producción cercana al límite operativo.';
  const recommendedDecision = bottleneck.state === 'Mantenimiento' || bottleneck.state === 'Parada' ? 'Desviar la orden a una máquina alternativa y recalcular la secuencia.' : 'Liberar un lote compatible en otra máquina para balancear la carga.';
  const floorMachines = twinMachines.slice(0, 8);
  const floorPositions = [
    { left: '18%', top: '20%' }, { left: '39%', top: '20%' }, { left: '60%', top: '20%' },
    { left: '18%', top: '53%' }, { left: '39%', top: '53%' }, { left: '60%', top: '53%' },
    { left: '78%', top: '23%' }, { left: '78%', top: '57%' },
  ];
  const processForMachine = (machine: typeof twinMachines[number], index: number) => {
    const value = machine.name.toUpperCase();
    if (value.includes('CORT') || value.includes('PAXSON') || value.includes('BEAVER')) return 'Corte';
    if (value.includes('YODER') || value.includes('FORM') || value.includes('ABBEY') || value.includes('MANNES')) return 'Formado';
    if (value.includes('END')) return 'Enderezado';
    if (value.includes('GALV')) return 'Galvanizado';
    if (value.includes('PNEU')) return 'Prueba neumática';
    if (value.includes('PHID')) return 'Prueba hidrostática';
    if (value.includes('RAN')) return 'Ranurado';
    if (value.includes('BISE')) return 'Biselado';
    return stages[index % stages.length].process;
  };
  return <section className="twin-page">
    <div className="twin-overview"><div><p className="kicker">GEMELO DIGITAL · SIMULACIÓN EN VIVO</p><h2>{plant === 'Todas' ? 'Vista de planta · Autopista Sur' : plant}</h2><p>Flujo virtual del tubo de acero desde la preparación hasta la inspección final.</p></div><div className="twin-live"><i /> SIMULACIÓN ACTIVA <strong>t+{String(tick).padStart(2, '0')} ciclos</strong></div></div>
    <div className="twin-metrics"><div><span>Máquinas conectadas</span><b>{twinMachines.length}</b><small>Modelo operativo</small></div><div><span>En producción</span><b>{running}</b><small>Estado MES simulado</small></div><div><span>Disponibilidad</span><b>{availability}%</b><small>Capacidad utilizable</small></div><div><span>Orden en tránsito</span><b>OP-260184</b><small>Tubería 3” N</small></div></div>
    <article className="panel plant-floor-panel"><div className="factory-head"><div><p className="kicker">LAYOUT DIGITAL · PLANO OPERATIVO</p><h2>Autopista Sur · planta virtual</h2><p className="layout-caption">Referencia espacial del layout Colmena · 2016 · lectura dinámica de producción</p></div><div className="floor-legend"><span><i className="floor-green"/> Operativa</span><span><i className="floor-amber"/> Restricción</span><span><i className="floor-blue"/> Flujo de material</span></div></div><div className="plant-floor"><div className="floor-grid-lines"/><div className="floor-title">{plant === 'Todas' ? 'PLANTA AUTOPISTA SUR · VISTA DE REFERENCIA' : plant}</div><div className="floor-zone zone-input">ENTRADA<br/><small>Materia prima</small></div><div className="floor-yard yard-top">PATIO DE ALMACENAMIENTO<br/><small>tubería y perfiles</small></div><div className="floor-nave nave-1">NAVE 1<br/><small>FORMADO</small></div><div className="floor-nave nave-2">NAVE 2<br/><small>PROCESO</small></div><div className="floor-nave nave-3">NAVE 3<br/><small>PRODUCTO TERMINADO</small></div><div className="floor-nave nave-4">NAVE 4<br/><small>ALMACENAMIENTO</small></div><div className="floor-nave nave-5">NAVE 5<br/><small>GALVANIZADO · DESPACHO</small></div><div className="floor-route route-a"/><div className="floor-route route-b"/><div className="floor-route route-c"/><div className="floor-route route-d"/><div className="floor-product" style={{ left: `${17 + activeStage * 20}%` }}><span>OP-260184</span></div>{floorMachines.map((machine, index) => { const position = floorPositions[index]; const isBlocked = machine.state === 'Parada' || machine.state === 'Mantenimiento'; return <div className={`floor-machine ${isBlocked ? 'floor-warning' : ''}`} style={position} key={machine.name}><div className="floor-machine-head"><i/><span>{isBlocked ? 'ALERTA' : 'ONLINE'}</span></div><strong>{machine.name}</strong><small>{processForMachine(machine, index)}</small><em>{machine.state}</em></div>; })}<div className="floor-zone zone-output">SALIDA<br/><small>Producto terminado</small></div><div className="floor-machine-count">Mostrando {floorMachines.length} de {twinMachines.length} activos del maestro</div></div><div className="floor-footer"><span><b>Ruta activa:</b> Corte → Formado → Enderezado → Prueba</span><span><b>Simulación:</b> ciclo {String(tick).padStart(2, '0')}</span><span><b>Orden:</b> tubo estructural 3” N</span></div></article>
    <div className="twin-layout"><article className="panel factory-panel"><div className="factory-head"><div><p className="kicker">MAPA DE FLUJO · LÍNEA DE FABRICACIÓN</p><h2>Ruta dinámica del proceso</h2></div><span className="sim-key"><i className="sim-dot"/> Tubo en movimiento</span></div><div className="factory-flow"><div className="flow-line"><i className="tube-orb" style={{ left: `${12 + activeStage * 25}%` }} /></div>{stages.map((stage, index) => <div className={`station ${index === activeStage ? 'active' : ''}`} key={stage.process}><div className="station-icon">{index === 0 ? '◌' : index === 1 ? '▥' : index === 2 ? '≋' : '✓'}</div><span className="station-number">0{index + 1}</span><b>{stage.process}</b><small>{stage.label}</small><em>{stage.machine}</em><strong>{index === activeStage ? 'PROCESANDO' : index < activeStage ? 'COMPLETADO' : 'EN COLA'}</strong></div>)}</div><div className="factory-footer"><span><i className="green-dot"/> Estado de línea: <b>Operativa</b></span><span>Producto: <b>Tubo estructural 3” N</b></span><span>Avance del lote: <b>{68 + activeStage * 4}%</b></span></div></article><aside className="twin-side panel"><div className="head"><div><p className="kicker">TELEMETRÍA APS</p><h2>Estado de activos</h2></div><span className="telemetry-pulse"/></div><div className="asset-list">{twinMachines.map((machine, index) => <div className="asset" key={machine.name}><div className={`asset-icon ${machine.state === 'Mantenimiento' ? 'warning' : machine.state === 'Parada' ? 'stopped' : ''}`}>⌁</div><div className="asset-info"><b>{machine.name}</b><small>{machine.plant} · {index === 0 ? 'Corte' : index === 1 ? 'Formado' : 'Control'}</small></div><span className={`asset-state ${machine.state === 'Mantenimiento' ? 'warning' : machine.state === 'Parada' ? 'stopped' : ''}`}>{machine.state}</span><div className="asset-progress"><i style={{ width: `${Math.max(machine.progress, machine.state === 'Produciendo' ? 22 + ((tick + index) % 3) * 8 : 0)}%` }}/></div></div>)}</div><button className="secondary twin-button">◉ Ver señales de máquina</button><div className="bottleneck-card"><div className="bottleneck-title"><p className="kicker">ANÁLISIS APS</p><span className={bottleneckScore >= 80 ? 'critical' : 'attention'}>{bottleneckScore >= 80 ? 'RESTRICCIÓN CRÍTICA' : 'ATENCIÓN'}</span></div><h3>Cuello de botella: {bottleneck.name}</h3><p>{bottleneckReason}</p><div className="bottleneck-meter"><i style={{ width: `${bottleneckScore}%` }}/></div><small>Índice de restricción · {bottleneckScore}/100</small><div className="decision-copy"><b>Decisión sugerida</b><span>{recommendedDecision}</span></div><button className="decision-button" onClick={() => setDecisionApplied(true)}>{decisionApplied ? '✓ Decisión registrada en simulación' : 'Aplicar decisión sugerida'}</button></div></aside></div>
    <div className="twin-bottom"><article className="panel"><p className="kicker">SIMULADOR</p><h2>Eventos del gemelo</h2><div className="event-stream"><p><i className="event-green"/> 08:30:12 · MES confirma producción en {twinMachines[0]?.name}</p><p><i className="event-blue"/> 08:30:08 · APS libera lote OP-260184 hacia Formado</p><p><i className="event-amber"/> 08:29:54 · Control de calidad preparado para la siguiente pieza</p></div></article><article className="panel twin-kpi"><p className="kicker">INDICADOR DE FLUJO</p><h2>Rendimiento instantáneo</h2><div className="gauge"><i style={{ transform: `rotate(${110 + activeStage * 14}deg)` }}/><strong>{1.85 + activeStage * 0.04}<small>t/h</small></strong></div><span>Objetivo de línea · 2.10 t/h</span></article></div>
  </section>;
}

function Dashboard({ visible, kg, active, plant }: { visible: typeof orders; kg: number; active: number; plant: Plant }) {
  return <><section className="aps-hero"><div><p className="kicker">COLMENA APS · CONTROL TOWER</p><h2>Planificación finita de tubos de acero</h2><p>Visibilidad operativa para decidir qué producir, en qué máquina y cuándo, con capacidad real de planta.</p></div><div className="hero-status"><span><i /> MOTOR APS ACTIVO</span><strong>3</strong><small>plantas conectadas</small><div className="hero-bars"><i/><i/><i/><i/><i/><i/><i/><i/></div></div></section><section className="metrics"><Metric title="Carga programada" value={`${(kg / 1000).toFixed(1)} t`} note="Plan vigente"/><Metric title="Montajes activos" value={String(active)} note="En ejecución"/><Metric title="Pedidos en riesgo" value={String(visible.filter((item) => item.status === 'Riesgo').length)} note="Requieren revisión"/><Metric title="Cumplimiento" value="92%" note="Fecha compromiso"/></section><section className="grid"><article className="panel"><Head kicker="LÍNEA DE TIEMPO · CAPACIDAD FINITA" title="Montajes programados"/><div className="scale"><span>Hoy 06:00</span><span>Hoy 14:00</span><span>Mañana</span><span>Jue</span><span>Vie</span></div>{visible.map((item) => <div className="row" key={item.id}><div><b>{item.montage}</b><small>{item.machine} · {item.plant}</small></div><div className="track"><i className={item.status.toLowerCase().replace(' ', '-')} style={{ width: `${Math.max(27, item.progress + 18)}%` }}><em>{item.status}</em><strong>{(item.kg / 1000).toFixed(1)} t</strong></i></div><small>{item.end}</small></div>)}</article><article className="panel signals"><Head kicker="SEÑALES APS" title="Decisiones sugeridas"/><Signal title="Materia prima pendiente" text="Montaje 4” N tiene 12.4 t sin confirmar en inventario." tone="orange"/><Signal title="Nuevo pedido compatible" text="OP-260207 puede agregarse al montaje 3” N." tone="blue"/><Signal title="Recalcular capacidad" text="FORM 19 estará en mantenimiento durante 4 horas." tone="purple"/><button className="secondary">Revisar sugerencias</button></article></section><section className="grid lower"><article className="panel"><Head kicker="RECURSOS" title="Estado de máquinas"/><div className="machines">{machines.filter((item) => plant === 'Todas' || item.plant === plant || (plant === 'PLANTA AUTOPISTA SUR' && item.plant === 'Auto Sur')).map((item) => <div className="machine" key={item.name}><div><b>{item.name}</b><span>{item.state}</span></div><small>{item.plant}</small><div className="progress"><i style={{ width: `${item.progress}%` }} /></div><small>{item.progress ? `${item.progress}% avance` : 'Sin orden activa'}</small></div>)}</div></article><article className="panel"><Head kicker="CARGA" title="Capacidad por planta"/>{plantCatalog.map((item) => { const total = orders.filter((order) => order.plant === item.name || (item.code === '301' && order.plant === 'Auto Sur')).reduce((sum, order) => sum + order.kg, 0); return <div className="capacity" key={item.code}><div><b>{item.name}</b><small>{(total / 1000).toFixed(1)} t programadas</small></div><strong>{Math.round(total / 140000 * 100)}%</strong><div className="progress"><i style={{ width: `${Math.min(100, total / 140000 * 100)}%` }} /></div></div>; })}</article></section></>;
}

function Metric({ title, value, note }: { title: string; value: string; note: string }) { return <article className="metric"><span>{title}</span><b>{value}</b><small>{note}</small></article>; }
function Head({ kicker, title }: { kicker: string; title: string }) { return <div className="head"><div><p className="kicker">{kicker}</p><h2>{title}</h2></div></div>; }
function Signal({ tone, title, text }: { tone: string; title: string; text: string }) { return <div className="signal"><i className={tone}>!</i><div><b>{title}</b><p>{text}</p></div></div>; }
