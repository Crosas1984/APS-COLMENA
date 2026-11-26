import { useEffect, useRef, useState, type ChangeEvent, type FormEvent } from 'react';
import * as XLSX from 'xlsx';
import { masterDefinitions, type MasterDefinition, type MasterKey } from './masters';
import { plantCatalog } from './data';
import { loadMasterState, saveMasterState, supabaseConfigured } from './supabase';

type RecordItem = Record<string, any> & { __blocked?: boolean };
const statusOptions = ['Activo', 'Inactivo'];
const mastersStorageKey = 'aps-colmena-master-records-v1';
function ActionGlyph({ type }: { type: 'edit' | 'duplicate' | 'block' | 'unlock' | 'delete' }) {
  if (type === 'edit') return <svg className="action-glyph" viewBox="0 0 24 24" aria-hidden="true"><path d="m4 16.5-.8 4.3 4.3-.8L19.8 7.7a2.2 2.2 0 0 0-3.1-3.1L4 16.5Z" /><path d="m14.8 6.2 3.1 3.1M3.5 20.5l3.8-.7" /></svg>;
  if (type === 'duplicate') return <svg className="action-glyph" viewBox="0 0 24 24" aria-hidden="true"><rect x="8" y="8" width="11" height="11" rx="2" /><path d="M16 8V6a2 2 0 0 0-2-2H6a2 2 0 0 0-2 2v8a2 2 0 0 0 2 2h2" /></svg>;
  if (type === 'delete') return <svg className="action-glyph" viewBox="0 0 24 24" aria-hidden="true"><path d="M5 7h14M9 7V4h6v3m-8 0 1 13h6l1-13M10 11v5m4-5v5" /></svg>;
  return <svg className="action-glyph" viewBox="0 0 24 24" aria-hidden="true"><rect x="5" y="10" width="14" height="10" rx="2" /><path d={type === 'unlock' ? 'M8 10V7a4 4 0 0 1 7.5-1.8' : 'M8 10V7a4 4 0 0 1 8 0v3'} /></svg>;
}
function parseThicknessMil(value: unknown) {
  const text = String(value ?? '').trim().replace(',', '.');
  const number = Number(text.replace(/[^0-9.-]/g, ''));
  if (!Number.isFinite(number)) return NaN;
  return /[\"]|pulg/i.test(text) && Math.abs(number) < 1 ? number * 1000 : number;
}
function normalizeIdentity(value: unknown) { return String(value ?? '').trim().replace(/\s+/g, ' ').toUpperCase(); }
function thicknessCode(value: unknown) {
  const inches = Number(String(value ?? '').trim().replace(',', '.').replace(/[^0-9.-]/g, ''));
  return Number.isFinite(inches) && inches > 0 ? `ESP-${Math.round(inches * 1000).toString().padStart(3, '0')}` : '';
}
function getRecordIdentity(masterKey: MasterKey, identityField: string, record: RecordItem) {
  return masterKey === 'montages'
    ? [record.Planta, record.Proceso, record.Máquina, record.Montaje, record.Espesor, record['Tipo de laminado']].map(normalizeIdentity).join('|')
    : normalizeIdentity(record[identityField]);
}
function thicknessNumber(record: RecordItem, masterKey: MasterKey) {
  const value = masterKey === 'thicknesses' ? record['Espesor (in)'] : record.Espesor;
  const number = Number(String(value ?? '').replace(',', '.').replace(/[^0-9.-]/g, ''));
  return Number.isFinite(number) ? number : Number.POSITIVE_INFINITY;
}
function montageNumber(record: RecordItem) {
  const text = String(record.Montaje ?? '').replace(',', '.');
  const fraction = text.match(/(\d+(?:\.\d+)?)\s*\/\s*(\d+(?:\.\d+)?)/);
  if (fraction) return Number(fraction[1]) / Number(fraction[2]);
  const number = Number(text.match(/\d+(?:\.\d+)?/)?.[0] ?? '');
  return Number.isFinite(number) ? number : Number.POSITIVE_INFINITY;
}
function normalizeRecord(record: RecordItem, masterKey?: MasterKey): RecordItem {
  const next: RecordItem = 'Estado' in record
    ? { ...record, Estado: record.Estado === 'Inactivo' ? 'Inactivo' : 'Activo' }
    : { ...record };
  if (masterKey === 'montages' && !next.Planta) {
    const defaults: Record<string, { Planta: string; Proceso: string; Máquina: string }> = {
      'M-3N': { Planta: '301', Proceso: 'Formado', Máquina: 'YODER 1' },
    };
    Object.assign(next, defaults[String(next.Código)] ?? { Planta: '301', Proceso: 'Formado', Máquina: 'YODER 1' });
  }
  if (masterKey === 'montages' && !next.Proceso) next.Proceso = 'Formado';
  if (masterKey === 'montages' && !next['Tipo de laminado']) next['Tipo de laminado'] = next['Familia de laminado'] || next.Familia || '';
  if (masterKey === 'machines' || masterKey === 'montages') {
    if (next.Código) next.Código = String(next.Código).toUpperCase();
    if (next.Máquina) next.Máquina = String(next.Máquina).toUpperCase();
  }
  if (masterKey === 'montages') {
    if (next.Montaje) next.Montaje = String(next.Montaje).toUpperCase();
    if (next['Tipo de laminado']) next['Tipo de laminado'] = String(next['Tipo de laminado']).toUpperCase();
  }
  if (masterKey === 'montages' && next.Espesor !== undefined) {
    const raw = String(next.Espesor ?? '').trim().replace(',', '.');
    const numeric = Number(raw.replace(/[^0-9.-]/g, ''));
    if (Number.isFinite(numeric) && numeric > 0) {
      const inches = numeric > 1 ? numeric / 1000 : numeric;
      next.Espesor = inches.toFixed(3);
      next['Espesor (mm)'] = (inches * 25.4).toFixed(2);
    }
  }
  if (masterKey === 'thicknesses' && next['Espesor (mil)'] !== undefined) {
    const mil = parseThicknessMil(next['Espesor (mil)']);
    if (Number.isFinite(mil)) {
      next['Espesor (mil)'] = String(Number.isInteger(mil) ? mil : mil.toFixed(3));
      next['Espesor (in)'] = (mil / 1000).toFixed(3);
      next['Espesor (mm)'] = (mil * 0.0254).toFixed(2);
    }
  }
  if (masterKey === 'thicknesses' && next['Espesor (in)'] !== undefined) {
    const inches = Number(String(next['Espesor (in)']).trim().replace(',', '.').replace(/[^0-9.-]/g, ''));
    if (Number.isFinite(inches)) {
      next['Espesor (in)'] = inches.toFixed(3);
      next['Espesor (mm)'] = (inches * 25.4).toFixed(2);
      next.Código = thicknessCode(next['Espesor (in)']);
    }
  }
  if (masterKey === 'thicknesses') delete next['Espesor (mil)'];
  if (masterKey === 'laminateFamilies') {
    if (next.Código) next.Código = String(next.Código).toUpperCase();
    if (next['Familia de laminado']) next['Familia de laminado'] = String(next['Familia de laminado']).toUpperCase();
    delete next.Norma;
  }
  if ((masterKey === 'capacities' || masterKey === 'standardTimes') && !next.Proceso && next.Operación) next.Proceso = next.Operación;
  return next;
}
function isRemovedMachine(value: unknown) {
  return normalizeIdentity(value) === 'YODER 2';
}
function isRemovedMontage(value: unknown) {
  return normalizeIdentity(value).replace(/[″”]/g, '"') === 'MONTAJE 4" N';
}
function sanitizeRemovedReferences(source: Record<string, RecordItem[]>) {
  const sanitized = Object.fromEntries(Object.entries(source).map(([key, list]) => [
    key,
    (list ?? []).filter((record) => {
      const machine = record.Máquina ?? record.Maquina ?? record.machine;
      const montage = record.Montaje ?? record.montage;
      return !isRemovedMachine(machine) &&
        normalizeIdentity(record.Código) !== 'M-4N' &&
        !isRemovedMontage(montage) &&
        normalizeIdentity(record.Desde) !== 'M-4N' &&
        normalizeIdentity(record.Hacia) !== 'M-4N';
    }),
  ]));
  return sanitized as Record<string, RecordItem[]>;
}
type MasterTab = 'estructura' | 'procesos' | 'producto' | 'demanda';
const masterTabs: { key: MasterTab; label: string; description: string }[] = [
  { key: 'estructura', label: 'Estructura productiva', description: 'Plantas, máquinas y calendarios' },
  { key: 'procesos', label: 'Procesos y capacidad', description: 'Procesos, rutas, tiempos y setups' },
  { key: 'producto', label: 'Producto y materiales', description: 'Referencias, montajes e inventario' },
  { key: 'demanda', label: 'Demanda', description: 'Pedidos y órdenes de producción' },
];
const masterTabKeys: Record<MasterTab, MasterDefinition['key'][]> = {
  estructura: ['plants', 'machines', 'calendars'],
  procesos: ['processTypes', 'operations', 'routes', 'capacities', 'standardTimes', 'setups'],
  producto: ['products', 'montages', 'materials'],
  demanda: ['orders'],
};
const visibleMasterDefinitions = masterDefinitions.filter((item) => item.key !== 'operations').sort((left, right) => Number(left.number) - Number(right.number));

export function MastersView({ requestedMasterKey }: { requestedMasterKey?: MasterKey }) {
  const [selectedKey, setSelectedKey] = useState<MasterDefinition['key'] | null>(requestedMasterKey ?? 'plants');
  const [records, setRecords] = useState<Record<string, RecordItem[]>>(() => {
    const defaults = Object.fromEntries(masterDefinitions.map((item) => [item.key, item.records.map((record) => normalizeRecord(record, item.key))]));
    try {
      const stored = window.localStorage.getItem(mastersStorageKey);
      if (!stored) return defaults;
      const saved = JSON.parse(stored) as Record<string, RecordItem[]>;
      return sanitizeRemovedReferences(Object.fromEntries(masterDefinitions.map((item) => [item.key, (saved[item.key] ?? defaults[item.key]).map((record) => normalizeRecord(record, item.key))])));
    } catch {
      return defaults;
    }
  });
  const [form, setForm] = useState<RecordItem>({});
  const [editingIndex, setEditingIndex] = useState<number | null>(null);
  const [erpUrl, setErpUrl] = useState('');
  const [erpStatus, setErpStatus] = useState('Sin configurar');
  const [plantFilter, setPlantFilter] = useState('Todas');
  const [processFilter, setProcessFilter] = useState('Todas');
  const [machineFilter, setMachineFilter] = useState('Todas');
  const [montageFilter, setMontageFilter] = useState('Todas');
  const [remoteReady, setRemoteReady] = useState(!supabaseConfigured);
  const montageImportRef = useRef<HTMLInputElement>(null);
  const selected = visibleMasterDefinitions.find((item) => item.key === selectedKey) ?? null;
  const selectedRecords = selected ? ((selected.key === 'thicknesses' ? Array.from(new Map((records[selected.key] ?? []).filter((record) => String(record['Espesor (in)'] ?? '').trim()).map((record) => [normalizeIdentity(record['Espesor (in)']), record])).values()) : (records[selected.key] ?? [])).map((record) => record).sort((left, right) => {
    if (selected.key === 'thicknesses') return thicknessNumber(left, selected.key) - thicknessNumber(right, selected.key);
    if (selected.key === 'montages') return montageNumber(left) - montageNumber(right) || thicknessNumber(left, selected.key) - thicknessNumber(right, selected.key);
    return 0;
  })) : [];
  const selectedPlantCode = plantFilter.split(' · ')[0];
  const filteredRecords = selectedRecords.filter((record) =>
    (plantFilter === 'Todas' || !record.Planta || record.Planta === plantFilter || record.Planta === selectedPlantCode) &&
    (selectedKey !== 'montages' || (montageFilter === 'Todas' || record.Montaje === montageFilter) && (processFilter === 'Todas' || record.Proceso === processFilter) && (machineFilter === 'Todas' || record.Máquina === machineFilter))
  );
  const processOptions = (records.processTypes ?? []).filter((record) => !record.__blocked && record.Estado !== 'Inactivo').map((record) => String(record.Proceso)).filter(Boolean);
  const montageProcessOptions = Array.from(new Set((records.machines ?? []).filter((record) => plantFilter === 'Todas' || record.Planta === selectedPlantCode).filter((record) => !record.__blocked && record.Estado !== 'Inactivo').map((record) => String(record.Proceso)).filter(Boolean)));
  const machineOptions = Array.from(new Set((records.machines ?? []).filter((record) => plantFilter === 'Todas' || record.Planta === selectedPlantCode).filter((record) => processFilter === 'Todas' || record.Proceso === processFilter).filter((record) => !record.__blocked && record.Estado !== 'Inactivo').map((record) => String(record.Máquina).toUpperCase()).filter(Boolean)));
  const familyOptions = (records.laminateFamilies ?? []).filter((record) => !record.__blocked && record.Estado !== 'Inactivo').map((record) => String(record['Familia de laminado'])).filter(Boolean);
  const montageOptions = Array.from(new Set((records.montages ?? []).filter((record) => !record.__blocked && record.Estado !== 'Inactivo').map((record) => String(record.Montaje ?? '')).filter(Boolean)));
  const montageFilterOptions = Array.from(new Set(
    selectedRecords
      .filter((record) => !record.__blocked && record.Estado !== 'Inactivo')
      .filter((record) => plantFilter === 'Todas' || !record.Planta || record.Planta === plantFilter || record.Planta === selectedPlantCode)
      .filter((record) => processFilter === 'Todas' || record.Proceso === processFilter)
      .filter((record) => machineFilter === 'Todas' || String(record.Máquina ?? '').toUpperCase() === machineFilter)
      .map((record) => String(record.Montaje ?? ''))
      .filter(Boolean)
  )).sort((left, right) => montageNumber({ Montaje: left }) - montageNumber({ Montaje: right }) || left.localeCompare(right));
  const montageFilterOptionsKey = montageFilterOptions.join('\u0000');
  const montageContextRecords = selectedKey === 'montages'
    ? selectedRecords
      .filter((record) => !record.__blocked && record.Estado !== 'Inactivo')
      .filter((record) => plantFilter === 'Todas' || !record.Planta || record.Planta === plantFilter || record.Planta === selectedPlantCode)
      .filter((record) => processFilter === 'Todas' || record.Proceso === processFilter)
    : [];
  const summaryMachineNames = Array.from(new Set(montageContextRecords.map((record) => String(record.Máquina ?? '').trim().toUpperCase()).filter(Boolean)))
    .filter((machine) => machineFilter === 'Todas' || machine === machineFilter)
    .sort((left, right) => left.localeCompare(right));
  const machineMontageSummary = summaryMachineNames.map((machine) => {
    const machineRecords = montageContextRecords.filter((record) => String(record.Máquina ?? '').trim().toUpperCase() === machine);
    return {
      machine,
      montageCount: new Set(machineRecords.map((record) => String(record.Montaje ?? '').trim()).filter(Boolean)).size,
      thicknessCount: new Set(machineRecords.map((record) => String(record.Espesor ?? '').trim()).filter(Boolean)).size,
      recordCount: machineRecords.length,
    };
  });
  const thicknessOptions = Array.from(new Set(
    (records.thicknesses ?? [])
      .filter((record) =>
        !record.__blocked &&
        record.Estado !== 'Inactivo' &&
        (selectedKey !== 'montages' || !form['Familia de laminado'] || String(record['Familia de laminado']) === String(form['Familia de laminado']))
      )
      .map((record) => String(record['Espesor (in)'] ?? ''))
      .filter(Boolean)
  )).sort((left, right) => Number(left) - Number(right));
  const selectedFields = selected ? selected.fields.filter((field) => selected.key === 'thicknesses' ? !['Espesor (mil)', 'Familia de laminado', 'Norma'].includes(field) : selected.key === 'laminateFamilies' ? !['Norma', 'Espesor mínimo (in)', 'Espesor mínimo (mil)', 'Espesor mínimo (mm)', 'Espesor máximo (in)', 'Espesor máximo (mil)', 'Espesor máximo (mm)'].includes(field) : true) : [];
  const visibleFields = selectedFields.filter((field) => selectedKey === 'machines' ? field !== 'Planta' : selectedKey === 'montages' ? !['Planta', 'Proceso'].includes(field) : true);
  const visibleMasters: MasterDefinition[] = [];

  useEffect(() => {
    window.localStorage.setItem(mastersStorageKey, JSON.stringify(records));
    if (!remoteReady || !supabaseConfigured) return;
    void saveMasterState(records).catch(() => undefined);
  }, [records, remoteReady]);
  useEffect(() => {
    if (requestedMasterKey && requestedMasterKey !== selectedKey) {
      setSelectedKey(requestedMasterKey);
      setForm({});
      setEditingIndex(null);
    }
  }, [requestedMasterKey, selectedKey]);
  useEffect(() => {
    if (selectedKey === 'montages' && montageFilter !== 'Todas' && !montageFilterOptions.includes(montageFilter)) {
      setMontageFilter('Todas');
    }
  }, [selectedKey, montageFilter, montageFilterOptionsKey]);
  const editFormRef = useRef<HTMLFormElement>(null);
  useEffect(() => {
    if (editingIndex !== null) requestAnimationFrame(() => editFormRef.current?.scrollIntoView({ behavior: 'smooth', block: 'center' }));
  }, [editingIndex]);
  useEffect(() => {
    if (!supabaseConfigured) return;
    let cancelled = false;
    void loadMasterState()
      .then((remoteRecords) => {
        if (cancelled) return;
        if (remoteRecords) setRecords(sanitizeRemovedReferences(remoteRecords as Record<string, RecordItem[]>));
        setRemoteReady(true);
      })
      .catch(() => {
        if (!cancelled) setRemoteReady(true);
      });
    return () => { cancelled = true; };
  }, []);
  useEffect(() => {
    setRecords((current) => {
      const currentThicknesses = current.thicknesses ?? [];
      const migratedThicknesses = currentThicknesses.map((record) => normalizeRecord(record, 'thicknesses'));
      const currentMontages = current.montages ?? [];
      const migratedMontages = currentMontages.map((record) => normalizeRecord(record, 'montages'));
      const familyDefinition = masterDefinitions.find((item) => item.key === 'laminateFamilies');
      const currentFamilies = current.laminateFamilies ?? [];
      const configuredFamilies = (familyDefinition?.records ?? []).filter((record) => ['Laminado caliente', 'Laminado caliente estructural', 'Laminado frío', 'Laminado galvanizado', 'Prepintado'].includes(String(record['Familia de laminado'])));
      const familyAliases: Record<string, string> = { 'LAM-CA': 'Laminado caliente', 'LAM-CAE': 'Laminado caliente estructural', 'LAM-FRI': 'Laminado frío', 'LAM-GAL': 'Laminado galvanizado', 'LAM-PRE': 'Prepintado' };
      const normalizedFamilies = currentFamilies.map((record) => {
        const code = String(record.Código ?? '').trim().toUpperCase();
        const currentName = String(record['Familia de laminado'] ?? '').trim().toLowerCase();
        const targetName = familyAliases[code] ?? (currentName.includes('caliente') && currentName.includes('estruct') ? 'Laminado caliente estructural' : currentName.includes('caliente') ? 'Laminado caliente' : currentName.includes('frio') || currentName.includes('frío') ? 'Laminado frío' : currentName.includes('galvan') ? 'Laminado galvanizado' : currentName.includes('prepint') ? 'Prepintado' : '');
        const seed = configuredFamilies.find((item) => item['Familia de laminado'] === targetName);
        return seed ? normalizeRecord({ ...seed, ...record, 'Familia de laminado': targetName, Norma: record.Norma || seed.Norma, 'Espesor mínimo (in)': record['Espesor mínimo (in)'] || seed['Espesor mínimo (in)'], 'Espesor mínimo (mil)': record['Espesor mínimo (mil)'] || seed['Espesor mínimo (mil)'], 'Espesor mínimo (mm)': record['Espesor mínimo (mm)'] || seed['Espesor mínimo (mm)'], 'Espesor máximo (in)': record['Espesor máximo (in)'] || seed['Espesor máximo (in)'], 'Espesor máximo (mil)': record['Espesor máximo (mil)'] || seed['Espesor máximo (mil)'], 'Espesor máximo (mm)': record['Espesor máximo (mm)'] || seed['Espesor máximo (mm)'] }, 'laminateFamilies') : record;
      });
      const existingFamilyNames = new Set(normalizedFamilies.map((record) => String(record['Familia de laminado'] ?? '').trim().toLowerCase()));
      const missingFamilies = configuredFamilies.filter((record) => !existingFamilyNames.has(String(record['Familia de laminado']).trim().toLowerCase())).map((record) => normalizeRecord(record, 'laminateFamilies'));
      const migratedFamilies = [...normalizedFamilies.filter((record) => configuredFamilies.some((item) => String(item['Familia de laminado']).trim().toLowerCase() === String(record['Familia de laminado'] ?? '').trim().toLowerCase())), ...missingFamilies];
      const thicknessDefinition = masterDefinitions.find((item) => item.key === 'thicknesses');
      const existingThicknessCodes = new Set(migratedThicknesses.map((record) => String(record.Código ?? '').trim().toUpperCase()));
      const missingThicknesses = (thicknessDefinition?.records ?? [])
        .filter((record) => !existingThicknessCodes.has(String(record.Código ?? '').trim().toUpperCase()))
        .map((record) => normalizeRecord(record, 'thicknesses'));
      const completeThicknesses = [...migratedThicknesses, ...missingThicknesses];
      const uniqueThicknesses = Array.from(new Map(
        completeThicknesses
          .filter((record) => String(record['Espesor (in)'] ?? '').trim())
          .map((record) => [normalizeIdentity(record['Espesor (in)']), record])
      ).values());
      if (JSON.stringify(currentThicknesses) === JSON.stringify(uniqueThicknesses) && JSON.stringify(currentFamilies) === JSON.stringify(migratedFamilies) && JSON.stringify(currentMontages) === JSON.stringify(migratedMontages)) return current;
      return { ...current, thicknesses: uniqueThicknesses, laminateFamilies: migratedFamilies, montages: migratedMontages };
    });
  }, []);

  function openMaster(master: MasterDefinition) { setSelectedKey(master.key); setForm({}); setEditingIndex(null); setPlantFilter('Todas'); setProcessFilter('Todas'); setMachineFilter('Todas'); setMontageFilter('Todas'); }
  function saveRecord(event: FormEvent) {
    event.preventDefault();
    if (!selected || !selected.fields.some((field) => form[field]?.trim())) return;
    if ((selected.key === 'machines' || selected.key === 'montages') && editingIndex === null && plantFilter === 'Todas') { window.alert('Seleccione una planta en el filtro antes de crear un registro.'); return; }
    if (selected.key === 'montages' && editingIndex === null && processFilter === 'Todas') { window.alert('Seleccione un proceso en el filtro antes de crear un montaje.'); return; }
    if (selected.key === 'montages' && editingIndex === null && machineFilter === 'Todas' && !form.Máquina) { window.alert('Seleccione una máquina en el filtro o en el formulario antes de crear un montaje.'); return; }
    const baseEffectiveForm = selected.key === 'machines' && !form.Planta
      ? { ...form, Planta: plantFilter.split(' · ')[0] }
      : selected.key === 'montages'
        ? { ...form, Planta: form.Planta ?? plantFilter.split(' · ')[0], Proceso: form.Proceso ?? processFilter, Máquina: form.Máquina ?? machineFilter }
        : form;
    const effectiveForm = selected.key === 'thicknesses'
      ? { ...baseEffectiveForm, Código: thicknessCode(baseEffectiveForm['Espesor (in)']) }
      : baseEffectiveForm;
    const identityField = selected.key === 'processTypes' ? 'Proceso' : selected.fields.includes('Código') ? 'Código' : selected.fields.includes('Referencia') ? 'Referencia' : selected.fields[0];
    const identityValue = normalizeIdentity(effectiveForm[identityField]);
    if (selected.fields.includes('Código') && !identityValue) { window.alert('Ingrese un código antes de guardar el registro.'); return; }
    const recordIdentity = getRecordIdentity(selected.key, identityField, effectiveForm);
    const duplicate = (records[selected.key] ?? []).some((record, index) => {
      if (index === editingIndex || !recordIdentity || record.__blocked || record.Estado === 'Inactivo') return false;
      if (selected.key !== 'montages') return getRecordIdentity(selected.key, identityField, record) === recordIdentity;
      return getRecordIdentity(selected.key, identityField, record) === recordIdentity;
    });
    if (duplicate) { window.alert(selected.key === 'montages' ? `El montaje ${effectiveForm.Montaje} con espesor ${effectiveForm.Espesor} y laminado ${effectiveForm['Tipo de laminado']} ya existe para la máquina ${effectiveForm.Máquina}.` : `El valor ${effectiveForm[identityField]} ya existe en este maestro.`); return; }
    setRecords((current) => { const next = [...(current[selected.key] ?? [])]; if (editingIndex === null) next.push(normalizeRecord({ ...effectiveForm }, selected.key)); else next[editingIndex] = normalizeRecord({ ...next[editingIndex], ...effectiveForm }, selected.key); return { ...current, [selected.key]: next }; });
    setForm({}); setEditingIndex(null);
  }
  function editRecord(index: number) { const originalIndex = selectedRecords.indexOf(filteredRecords[index]); setEditingIndex(originalIndex); setForm({ ...selectedRecords[originalIndex] }); }
  function duplicateRecord(index: number) { if (!selected) return; const originalIndex = selectedRecords.indexOf(filteredRecords[index]); const copy = { ...selectedRecords[originalIndex] }; delete copy.__blocked; const identityField = selected.key === 'processTypes' ? 'Proceso' : selected.fields.includes('Código') ? 'Código' : selected.fields.includes('Referencia') ? 'Referencia' : selected.fields[0]; if (selected.key !== 'montages') delete copy[identityField]; setEditingIndex(null); setForm(copy); }
  function toggleBlocked(index: number) { if (!selected) return; const originalIndex = selectedRecords.indexOf(filteredRecords[index]); setRecords((current) => ({ ...current, [selected.key]: current[selected.key].map((record, row) => row === originalIndex ? { ...record, __blocked: !record.__blocked } : record) })); }
  function deleteRecord(index: number) { if (!selected || !window.confirm('¿Eliminar este registro del maestro? Esta acción no se puede deshacer.')) return; const originalIndex = selectedRecords.indexOf(filteredRecords[index]); setRecords((current) => ({ ...current, [selected.key]: current[selected.key].filter((_, row) => row !== originalIndex) })); if (editingIndex === originalIndex) { setEditingIndex(null); setForm({}); } }
  function exportAllMasters() {
    const workbook = XLSX.utils.book_new();
    visibleMasterDefinitions.forEach((master) => {
      const rows = (records[master.key] ?? []).map((record) => {
        const { __blocked, Operación, ...raw } = record;
        const rest = master.key === 'montages'
          ? Object.fromEntries(Object.entries(raw).filter(([field]) => field !== 'Familia'))
          : raw;
        const normalized = (master.key === 'capacities' || master.key === 'standardTimes') && !rest.Proceso && Operación
          ? { ...rest, Proceso: Operación }
          : master.key === 'montages' ? { ...rest, Espesor: rest.Espesor ?? '' } : rest;
        return __blocked ? { ...normalized, 'Bloqueado': 'Sí' } : normalized;
      });
      const sheet = XLSX.utils.json_to_sheet(rows.length ? rows : [{ Mensaje: 'Sin registros' }]);
      sheet['!cols'] = (rows.length ? Object.keys(rows[0]) : ['Mensaje']).map((field) => ({ wch: Math.min(32, Math.max(12, field.length + 3)) }));
      XLSX.utils.book_append_sheet(workbook, sheet, `${master.number} ${master.title}`.slice(0, 31));
    });
    const stamp = new Date().toISOString().slice(0, 10);
    XLSX.writeFile(workbook, `APS_Colmena_Maestros_${stamp}.xlsx`);
  }
  function exportMontages() {
    const fields = ['Código', 'Montaje', 'Familia de laminado', 'Espesor', 'Setup base', 'Planta', 'Proceso', 'Máquina'];
    const rows = (records.montages ?? []).map((record) => {
      const row = Object.fromEntries(fields.map((field) => [field, record[field] ?? ''])) as Record<string, any>;
      return record.__blocked ? { ...row, Bloqueado: 'Sí' } : row;
    });
    const workbook = XLSX.utils.book_new();
    const sheet = XLSX.utils.json_to_sheet(rows.length ? rows : [Object.fromEntries(fields.map((field) => [field, '']))]);
    sheet['!cols'] = fields.map((field) => ({ wch: Math.min(28, Math.max(12, field.length + 3)) }));
    XLSX.utils.book_append_sheet(workbook, sheet, 'Montajes');
    XLSX.writeFile(workbook, `APS_Colmena_Montajes_${new Date().toISOString().slice(0, 10)}.xlsx`);
  }
  function downloadMontageTemplate() {
    const headers = ['Código', 'Montaje', 'Familia de laminado', 'Espesor', 'Setup base', 'Planta', 'Proceso', 'Máquina'];
    const example = ['M-EJEMPLO', 'Montaje ejemplo', 'Laminado estructural', '50', '45 min', '301', 'Formado', 'YODER 1'];
    const workbook = XLSX.utils.book_new();
    const sheet = XLSX.utils.aoa_to_sheet([headers, example]);
    sheet['!cols'] = headers.map((field) => ({ wch: Math.min(28, Math.max(12, field.length + 3)) }));
    const instructions = XLSX.utils.aoa_to_sheet([
      ['Plantilla de importación · Maestro de Montajes'],
      ['Reemplace la fila de ejemplo por sus datos y conserve los encabezados.'],
      ['El Código debe ser único. Los códigos ya existentes serán omitidos durante la importación.'],
      ['Espesor debe registrarse únicamente en milésimas de pulgada, por ejemplo: 35, 50 o 125.'],
      ['Planta debe usar el código configurado: 301, 302 o 308.'],
    ]);
    instructions['!cols'] = [{ wch: 115 }];
    XLSX.utils.book_append_sheet(workbook, sheet, 'Montajes');
    XLSX.utils.book_append_sheet(workbook, instructions, 'Instrucciones');
    XLSX.writeFile(workbook, 'Plantilla_Importacion_Montajes.xlsx');
  }
  function exportCurrentMaster() {
    if (!selected) return;
    const fields = selectedFields;
    const rows = (records[selected.key] ?? []).map((record) => {
      const row = Object.fromEntries(fields.map((field) => [field, record[field] ?? ''])) as Record<string, any>;
      return record.__blocked ? { ...row, Bloqueado: 'Sí' } : row;
    });
    const workbook = XLSX.utils.book_new();
    const sheet = XLSX.utils.json_to_sheet(rows.length ? rows : [Object.fromEntries(fields.map((field) => [field, '']))]);
    sheet['!cols'] = fields.map((field) => ({ wch: Math.min(32, Math.max(12, field.length + 3)) }));
    XLSX.utils.book_append_sheet(workbook, sheet, selected.title.slice(0, 31));
    XLSX.writeFile(workbook, `APS_Colmena_${selected.title.replace(/[^a-z0-9]+/gi, '_')}_${new Date().toISOString().slice(0, 10)}.xlsx`);
  }
  function downloadCurrentTemplate() {
    if (!selected) return;
    const exampleValue = (field: string) => {
      if (field === 'Código') return `${selected.key.toUpperCase()}-EJEMPLO`;
      if (field === 'Estado') return 'Activo';
      if (field === 'Planta') return '301';
      if (field === 'Proceso') return 'Formado';
      if (field === 'Máquina') return 'YODER 1';
      if (field === 'Familia de laminado') return 'Laminado estructural';
      if (field === 'Espesor') return '50';
      if (field === 'Espesor (mil)') return '50';
      if (field === 'Espesor (mm)') return '1.27';
      return `Ejemplo ${field}`;
    };
    const fields = selectedFields;
    const workbook = XLSX.utils.book_new();
    const sheet = XLSX.utils.aoa_to_sheet([fields, fields.map(exampleValue)]);
    sheet['!cols'] = fields.map((field) => ({ wch: Math.min(32, Math.max(12, field.length + 3)) }));
    const instructions = XLSX.utils.aoa_to_sheet([
      [`Plantilla de importación · ${selected.title}`],
      ['Reemplace la fila de ejemplo y conserve los encabezados.'],
      ['Los códigos repetidos se omiten para proteger la configuración existente.'],
      ['Los espesores se expresan en pulgadas y la conversión a milímetros se calcula automáticamente.'],
    ]);
    instructions['!cols'] = [{ wch: 115 }];
    XLSX.utils.book_append_sheet(workbook, sheet, selected.title.slice(0, 31));
    XLSX.utils.book_append_sheet(workbook, instructions, 'Instrucciones');
    XLSX.writeFile(workbook, `Plantilla_Importacion_${selected.title.replace(/[^a-z0-9]+/gi, '_')}.xlsx`);
  }
  async function importCurrentMaster(event: ChangeEvent<HTMLInputElement>) {
    const file = event.target.files?.[0];
    event.target.value = '';
    if (!file || !selected) return;
    try {
      const workbook = XLSX.read(await file.arrayBuffer(), { type: 'array' });
      const sheet = workbook.Sheets[workbook.SheetNames[0]];
      const rows = XLSX.utils.sheet_to_json<Record<string, unknown>>(sheet, { defval: '' });
      const canonical = (value: unknown) => String(value ?? '').normalize('NFD').replace(/[\u0300-\u036f]/g, '').toLowerCase().replace(/[^a-z0-9]/g, '');
      const fields = selectedFields;
      const fieldByCanonical = Object.fromEntries(fields.map((field) => [canonical(field), field]));
      const headers = Object.keys(rows[0] ?? {}).map(canonical);
      const missing = fields.filter((field) => field !== 'Espesor (mm)' && !headers.includes(canonical(field)));
      if (missing.length) { window.alert(`La plantilla no contiene las columnas requeridas: ${missing.join(', ')}.`); return; }
      const identityField = selected.key === 'processTypes' ? 'Proceso' : fields.includes('Código') ? 'Código' : fields.includes('Referencia') ? 'Referencia' : fields[0];
      const existingValues = new Set((records[selected.key] ?? []).map((record) => getRecordIdentity(selected.key, identityField, record)).filter(Boolean));
      const importedValues = new Set<string>();
      const imported: RecordItem[] = [];
      let rejected = 0;
      rows.forEach((row) => {
        const values = Object.fromEntries(Object.entries(row).map(([key, value]) => [fieldByCanonical[canonical(key)] ?? key, value]));
        const identity = String(values[identityField] ?? '').trim();
        const normalizedIdentity = getRecordIdentity(selected.key, identityField, values);
        if (!identity || existingValues.has(normalizedIdentity) || importedValues.has(normalizedIdentity)) { rejected += 1; return; }
        importedValues.add(normalizedIdentity);
        imported.push(normalizeRecord(values, selected.key));
      });
      if (!imported.length) { window.alert('No se importaron registros nuevos. Revise los códigos y las columnas de la plantilla.'); return; }
      setRecords((current) => ({ ...current, [selected.key]: [...(current[selected.key] ?? []), ...imported] }));
      window.alert(`Importación completada: ${imported.length} registros agregados${rejected ? `. Filas omitidas: ${rejected}.` : '.'}`);
    } catch {
      window.alert('No fue posible leer el archivo. Seleccione un Excel .xlsx o .xls válido.');
    }
  }
  async function importMontages(event: ChangeEvent<HTMLInputElement>) {
    const file = event.target.files?.[0];
    event.target.value = '';
    if (!file) return;
    try {
      const workbook = XLSX.read(await file.arrayBuffer(), { type: 'array' });
      const firstSheet = workbook.Sheets[workbook.SheetNames[0]];
      const rows = XLSX.utils.sheet_to_json<Record<string, unknown>>(firstSheet, { defval: '' });
      const canonical = (value: unknown) => String(value ?? '').normalize('NFD').replace(/[\u0300-\u036f]/g, '').toLowerCase().replace(/[^a-z0-9]/g, '');
      const aliases: Record<string, string> = { codigo: 'Código', montaje: 'Montaje', familiadelaminado: 'Familia de laminado', espesor: 'Espesor', setupbase: 'Setup base', planta: 'Planta', proceso: 'Proceso', maquina: 'Máquina' };
      const headers = Object.keys(rows[0] ?? {}).map(canonical);
      const required = ['codigo', 'montaje', 'familiadelaminado', 'espesor', 'setupbase', 'planta', 'proceso', 'maquina'];
      const missing = required.filter((header) => !headers.includes(header));
      if (missing.length) { window.alert(`La plantilla no contiene las columnas requeridas: ${missing.map((item) => aliases[item]).join(', ')}.`); return; }
      const imported: RecordItem[] = [];
      const rejected: string[] = [];
      const existingCodes = new Set((records.montages ?? []).map((record) => String(record.Código ?? '').trim().toLowerCase()).filter(Boolean));
      const importedCodes = new Set<string>();
      rows.forEach((row, index) => {
        const values = Object.fromEntries(Object.entries(row).map(([key, value]) => [aliases[canonical(key)] ?? key, value]));
        const code = String(values.Código ?? '').trim();
        const name = String(values.Montaje ?? '').trim();
        if (!code || !name) { rejected.push(`fila ${index + 2}: código o montaje vacío`); return; }
        const normalizedCode = code.toLowerCase();
        if (existingCodes.has(normalizedCode) || importedCodes.has(normalizedCode)) { rejected.push(`${code}: código repetido`); return; }
        importedCodes.add(normalizedCode);
        imported.push(normalizeRecord({ ...values, Código: code, Montaje: name }, 'montages'));
      });
      if (!imported.length) { window.alert(`No se importaron registros. ${rejected.length ? rejected.slice(0, 5).join('\n') : 'El archivo no tiene filas válidas.'}`); return; }
      setRecords((current) => ({ ...current, montages: [...(current.montages ?? []), ...imported] }));
      window.alert(`Importación completada: ${imported.length} montajes agregados${rejected.length ? `. Filas omitidas: ${rejected.length}.` : '.'}`);
    } catch {
      window.alert('No fue posible leer el archivo. Seleccione un Excel .xlsx o .xls válido.');
    }
  }

  const tableGridStyle = { gridTemplateColumns: `38px repeat(${visibleFields.length}, minmax(90px, 1fr)) 150px` };
  return <section className="masters-page">
    <div className="masters-intro"><div className="masters-intro-copy"><p className="kicker">CAPÍTULO 1 · CONFIGURACIÓN APS</p><h2>Maestros del sistema</h2><p>Catálogos que alimentan la programación automática, las restricciones y el gemelo digital.</p></div><span className="master-status"><i /> {visibleMasterDefinitions.length} maestros disponibles</span></div>
    <div className="master-layout"><div className="master-grid">{visibleMasters.map((master) => <button className={`master-card ${selectedKey === master.key ? 'chosen' : ''}`} onClick={() => openMaster(master)} key={master.key}><span className="master-number">{master.number}</span><div><b>{master.title}</b><p>{master.description}</p><small>{(records[master.key] ?? []).length} registros · Fuente: {master.source}</small></div><strong>→</strong></button>)}</div>
      <div className="master-side"><div className="panel erp-panel"><div className="head"><div><p className="kicker">INTEGRACIÓN FUTURA</p><h2>Siesa ERP y MES</h2></div><span className="integration-dot" /></div><p className="side-copy">Cada maestro podrá alimentarse manualmente o sincronizarse desde vistas SQL y APIs.</p><label>Endpoint de integración<input value={erpUrl} onChange={(event) => setErpUrl(event.target.value)} placeholder="https://api.empresa.com/aps" /></label><button className="secondary" onClick={() => setErpStatus(erpUrl ? 'Pendiente de validar credenciales' : 'Ingresa un endpoint')}>Guardar conexión</button><small className="erp-status">{erpStatus}</small><div className="source-row"><span>Siesa SQL</span><em>Preparado</em></div><div className="source-row"><span>MES industrial</span><em>Preparado</em></div><div className="source-row"><span>Supabase</span><em>Preparado</em></div></div><div className="panel rules-panel"><p className="kicker">ORDEN DE CONSTRUCCIÓN</p><h2>Después de los maestros</h2><ol><li>Restricciones de máquina y ruta</li><li>Calendarios y capacidad finita</li><li>Motor forward y backward</li><li>Reprogramación con eventos MES</li></ol></div></div>
    </div>
    {selected && <div className={`master-detail panel ${editingIndex !== null ? 'editing-active' : ''}`}><div className="detail-head"><div><p className="kicker">MAESTRO {selected.number}</p><h2>{selected.title}</h2><p>{selected.key === 'thicknesses' ? 'Catálogo de espesores nominales de fabricación de tubería, expresados en pulgadas y milímetros.' : selected.key === 'laminateFamilies' ? 'Catálogo genérico de familias de laminado para los montajes.' : selected.description}</p></div><div className="detail-head-actions"><input ref={montageImportRef} type="file" accept=".xlsx,.xls" onChange={importCurrentMaster} hidden /><button type="button" className="export-button import-button" onClick={() => montageImportRef.current?.click()}>↑ Importar Excel</button><button type="button" className="export-button" onClick={downloadCurrentTemplate}>↓ Plantilla Excel</button><button type="button" className="export-button" onClick={exportCurrentMaster}>↓ Exportar Excel</button><button className="ghost" onClick={() => { setSelectedKey(null); setEditingIndex(null); setForm({}); }}>Cerrar</button></div></div>
      {(selected.fields.includes('Planta') || selected.key === 'montages') && <div className="detail-filter"><label>Filtrar por planta<select value={plantFilter} onChange={(event) => { setPlantFilter(event.target.value); setProcessFilter('Todas'); setMachineFilter('Todas'); setMontageFilter('Todas'); }}><option>Todas</option>{plantCatalog.map((plant) => <option value={`${plant.code} · ${plant.name}`} key={plant.code}>{plant.code} · {plant.name}</option>)}</select></label>{selected.key === 'montages' && <><label>Filtrar por proceso<select value={processFilter} onChange={(event) => { setProcessFilter(event.target.value); setMachineFilter('Todas'); }}><option>Todas</option>{(plantFilter === 'Todas' ? processOptions : montageProcessOptions).map((process) => <option value={process} key={process}>{process}</option>)}</select></label><label>Filtrar por máquina<select value={machineFilter} onChange={(event) => setMachineFilter(event.target.value)}><option>Todas</option>{machineOptions.map((machine) => <option value={machine} key={machine}>{machine}</option>)}</select></label><label>Filtrar por montaje<select value={montageFilter} onChange={(event) => setMontageFilter(event.target.value)}><option>Todas</option>{montageFilterOptions.map((montage) => <option value={montage} key={montage}>{montage}</option>)}</select></label></>}</div>}
      {selected.key === 'montages' && <div className="machine-montage-summary"><div className="machine-montage-summary-head"><div><p className="kicker">RESUMEN DE MONTAJES POR MÁQUINA</p><span>{machineFilter === 'Todas' ? 'Montajes configurados según planta y proceso' : `Detalle de ${machineFilter}`}</span></div><strong>{machineMontageSummary.reduce((total, item) => total + item.montageCount, 0)} montajes</strong></div><div className="machine-summary-grid">{machineMontageSummary.length ? machineMontageSummary.map((item) => <div className={`machine-summary-card ${machineFilter === item.machine ? 'active' : ''}`} key={item.machine}><span>{item.machine}</span><strong>{item.montageCount}</strong><small>montajes · {item.thicknessCount} espesores · {item.recordCount} configuraciones</small></div>) : <p className="machine-summary-empty">No hay montajes configurados para los filtros seleccionados.</p>}</div></div>}
      <div className="detail-table"><div className="detail-row detail-header" style={tableGridStyle}><b>#</b>{visibleFields.map((field) => <b key={field}>{field}</b>)}<b>Acciones</b></div>{filteredRecords.map((record, index) => <div className={`detail-row ${record.__blocked ? 'blocked-row' : ''}`} style={tableGridStyle} key={`${selected.key}-${index}`}><span>{index + 1}</span>{visibleFields.map((field) => <span key={field}>{record[field] || '—'}</span>)}<span className="row-actions"><button className="icon-action" title="Editar registro" aria-label="Editar registro" onClick={() => editRecord(index)}><ActionGlyph type="edit" /></button><button className="icon-action" title="Duplicar registro" aria-label="Duplicar registro" onClick={() => duplicateRecord(index)}><ActionGlyph type="duplicate" /></button><button className="icon-action" title={record.__blocked ? 'Desbloquear registro' : 'Bloquear registro'} aria-label={record.__blocked ? 'Desbloquear registro' : 'Bloquear registro'} onClick={() => toggleBlocked(index)}><ActionGlyph type={record.__blocked ? 'unlock' : 'block'} /></button><button className="icon-action delete-action" title="Eliminar registro" aria-label="Eliminar registro" onClick={() => deleteRecord(index)}><ActionGlyph type="delete" /></button></span></div>)}</div><div className="detail-total">Total de registros: {filteredRecords.length}</div>
      <form ref={editFormRef} className="record-form" onSubmit={saveRecord}>{visibleFields.map((field) => field === 'Código' && selected.key === 'thicknesses' ? <input key={field} placeholder="Código" value={thicknessCode(form['Espesor (in)'])} readOnly /> : field === 'Proceso' && selected.key === 'machines' ? <select key={field} aria-label={field} value={form[field] || ''} onChange={(event) => setForm({ ...form, [field]: event.target.value })}><option value="">Proceso</option>{processOptions.map((process) => <option value={process} key={process}>{process}</option>)}</select> : field === 'Montaje' && selected.key === 'montages' ? <span className="editable-select"><input key={field} list="montage-options" aria-label={field} placeholder="Seleccione o escriba un montaje" value={form[field] || ''} onChange={(event) => setForm({ ...form, [field]: event.target.value })} /><datalist id="montage-options">{montageOptions.map((montage) => <option value={montage} key={montage} />)}</datalist></span> : field === 'Máquina' && selected.key === 'montages' ? <span className="editable-select"><input key={field} list="machine-options" aria-label={field} placeholder="Seleccione o escriba una máquina" value={form[field] || ''} onChange={(event) => setForm({ ...form, Máquina: event.target.value })} /><datalist id="machine-options">{machineOptions.map((machine) => <option value={machine} key={machine} />)}</datalist></span> : field === 'Tipo de laminado' && selected.key === 'montages' ? <select key={field} aria-label={field} value={form[field] || ''} onChange={(event) => setForm({ ...form, 'Tipo de laminado': event.target.value })}><option value="">Seleccione laminado</option>{familyOptions.map((family) => <option value={family} key={family}>{family}</option>)}</select> : field === 'Familia de laminado' && (selected.key === 'montages' || selected.key === 'thicknesses') ? <select key={field} aria-label={field} value={form[field] || ''} onChange={(event) => setForm({ ...form, [field]: event.target.value })}><option value="">Familia de laminado</option>{familyOptions.map((family) => <option value={family} key={family}>{family}</option>)}</select> : field === 'Espesor' && selected.key === 'montages' ? <select key={field} aria-label={field} value={form[field] || ''} onChange={(event) => { const inches = event.target.value; setForm({ ...form, Espesor: inches, 'Espesor (mm)': inches ? (Number(inches) * 25.4).toFixed(2) : '' }); }}><option value="">Espesor (in)</option>{thicknessOptions.map((thickness) => <option value={thickness} key={thickness}>{thickness} in</option>)}</select> : field === 'Espesor (in)' && selected.key === 'thicknesses' ? <input key={field} type="number" step="0.001" min="0" placeholder="Espesor (in)" value={form[field] || ''} onChange={(event) => { const inches = event.target.value; setForm({ ...form, 'Espesor (in)': inches, 'Espesor (mm)': inches ? (Number(inches) * 25.4).toFixed(2) : '' }); }} /> : field === 'Espesor (mm)' && (selected.key === 'thicknesses' || selected.key === 'montages') ? <input key={field} placeholder={field} value={form[field] || ''} readOnly /> : field === 'Estado' ? <select key={field} aria-label={field} value={form[field] || ''} onChange={(event) => setForm({ ...form, [field]: event.target.value })}><option value="">Estado</option>{statusOptions.map((status) => <option value={status} key={status}>{status}</option>)}</select> : <input key={field} placeholder={field} value={form[field] || ''} onChange={(event) => setForm({ ...form, [field]: event.target.value })} />)}<button type="submit" className="secondary save-action">{editingIndex === null ? '+ Crear registro' : 'Guardar cambios'}</button>{editingIndex !== null && <button type="button" className="cancel-action" onClick={() => { setEditingIndex(null); setForm({}); }}>Cancelar</button>}</form>
    </div>}
  </section>;
}
