import { useState, useRef } from 'react';
import * as XLSX from 'xlsx';
import { Upload, X, Check, AlertCircle, FileSpreadsheet, ChevronRight, Loader2, Info } from 'lucide-react';
import { supabase } from '../lib/supabase';
import type { Neighborhood, MemberCategory } from '../lib/supabase';

interface ImportRow {
  lot_number: string;
  category_raw: string;
  category: MemberCategory;
  last_name: string;
  first_name: string;
  full_name_raw: string;
  dni: string;
  phone: string;
  email: string;
  carnet_status: 'activo' | 'pausado';
  tenis: boolean;
  _rowIndex: number;
  _errors: string[];
  _duplicate: boolean;
  _skip: boolean;
}

type Step = 'upload' | 'neighborhood' | 'preview' | 'importing' | 'done';

const CATEGORY_MAP: Record<string, MemberCategory> = {
  T: 'titular', TITULAR: 'titular',
  F1: 'familiar_1', 'FAMILIAR 1': 'familiar_1', 'FAM 1': 'familiar_1', 'FAMILIAR1': 'familiar_1',
  F2: 'familiar_2', 'FAMILIAR 2': 'familiar_2', 'FAM 2': 'familiar_2', 'FAMILIAR2': 'familiar_2',
  F3: 'familiar_3', 'FAMILIAR 3': 'familiar_3', 'FAM 3': 'familiar_3', 'FAMILIAR3': 'familiar_3',
  F4: 'adherente', 'FAMILIAR 4': 'adherente', 'FAM 4': 'adherente', 'FAMILIAR4': 'adherente',
  ADHERENTE: 'adherente', FA: 'adherente', 'F.A.': 'adherente', 'FAM. ADHERENTE': 'adherente',
};

const CATEGORY_LABELS: Record<MemberCategory, string> = {
  titular: 'Titular', familiar_1: 'Familiar 1', familiar_2: 'Familiar 2',
  familiar_3: 'Familiar 3', adherente: 'Familiar Adherente',
};

function normalizeKey(s: string): string {
  return s.normalize('NFD').replace(/[\u0300-\u036f]/g, '').toUpperCase().trim().replace(/\s+/g, ' ');
}

function parseCategory(raw: string): MemberCategory | null {
  const n = normalizeKey(raw);
  if (CATEGORY_MAP[n]) return CATEGORY_MAP[n];
  // partial match
  for (const [k, v] of Object.entries(CATEGORY_MAP)) {
    if (n.includes(k) || k.includes(n)) return v;
  }
  return null;
}

function parseTenis(raw: unknown): boolean {
  if (raw === null || raw === undefined || raw === '') return false;
  const s = String(raw).trim().toUpperCase();
  return ['SI', 'SÍ', 'YES', 'TRUE', '1', 'S'].includes(s);
}

function parseStatus(raw: unknown): 'activo' | 'pausado' {
  if (raw === null || raw === undefined || raw === '') return 'activo';
  const s = String(raw).trim().toUpperCase();
  if (['NO', 'INACTIVO', 'PAUSADO', 'BAJA', '0', 'FALSE'].includes(s)) return 'pausado';
  return 'activo';
}

function splitName(full: string): { first_name: string; last_name: string } {
  const parts = full.trim().split(/[\s,]+/);
  if (parts.length === 1) return { last_name: parts[0], first_name: '' };
  // Try "Apellido, Nombre" (comma-separated already split above) or "Apellido Nombre"
  if (full.includes(',')) {
    const [last, ...rest] = full.split(',');
    return { last_name: last.trim(), first_name: rest.join(' ').trim() };
  }
  // Assume first word is last name, rest is first name
  const [first, ...rest] = parts;
  return { last_name: first, first_name: rest.join(' ') };
}

// Fuzzy column finder
function findCol(headers: string[], candidates: string[]): string | null {
  const norm = headers.map(h => normalizeKey(h));
  for (const c of candidates) {
    const nc = normalizeKey(c);
    const idx = norm.findIndex(h => h === nc || h.includes(nc) || nc.includes(h));
    if (idx !== -1) return headers[idx];
  }
  return null;
}

interface SociosImportProps {
  neighborhoods: Neighborhood[];
  existingMembers: { lot_number: string; neighborhood_id: string | null; category: MemberCategory; first_name: string; last_name: string; dni: string }[];
  onClose: () => void;
  onImported: () => void;
}

export default function SociosImport({ neighborhoods: initialNeighborhoods, existingMembers, onClose, onImported }: SociosImportProps) {
  const fileRef = useRef<HTMLInputElement>(null);
  const [step, setStep] = useState<Step>('upload');
  const [fileName, setFileName] = useState('');
  const [rows, setRows] = useState<ImportRow[]>([]);
  const [neighborhoodId, setNeighborhoodId] = useState('');
  const [newNbName, setNewNbName] = useState('');
  const [neighborhoods, setNeighborhoods] = useState<Neighborhood[]>(initialNeighborhoods);
  const [importResult, setImportResult] = useState({ created: 0, skipped: 0, errors: 0 });
  const [globalError, setGlobalError] = useState('');
  const [editingRow, setEditingRow] = useState<number | null>(null);
  const [editValues, setEditValues] = useState<Partial<ImportRow>>({});

  const parseFile = (file: File) => {
    const reader = new FileReader();
    reader.onload = (e) => {
      try {
        const data = new Uint8Array(e.target!.result as ArrayBuffer);
        const wb = XLSX.read(data, { type: 'array' });
        const ws = wb.Sheets[wb.SheetNames[0]];
        const raw: Record<string, unknown>[] = XLSX.utils.sheet_to_json(ws, { defval: '' });

        if (!raw.length) { setGlobalError('El archivo está vacío o no tiene datos válidos.'); return; }

        const headers = Object.keys(raw[0]);

        // Detect columns
        const colLot = findCol(headers, ['LOTE', 'LOT', 'N LOTE', 'NRO LOTE', 'NUMERO LOTE', 'N° LOTE']);
        const colCat = findCol(headers, ['CATEGORIA', 'COLUMNA1', 'COLUMN1', 'CAT', 'TIPO']);
        const colName = findCol(headers, ['APELLIDO Y NOMBRE', 'NOMBRE Y APELLIDO', 'APELLIDO', 'NOMBRE COMPLETO', 'NOMBRE', 'NAME']);
        const colFirstName = findCol(headers, ['NOMBRE', 'FIRST NAME', 'NOMBRES']);
        const colLastName = findCol(headers, ['APELLIDO', 'LAST NAME', 'APELLIDOS']);
        const colPhone = findCol(headers, ['TELEFONO', 'TEL', 'CELULAR', 'PHONE', 'MOVIL']);
        const colEmail = findCol(headers, ['EMAIL', 'MAIL', 'CORREO', 'E-MAIL']);
        const colStatus = findCol(headers, ['ESTADO', 'HABILITADO', 'ACTIVO', 'STATUS', 'BAJA']);
        const colTenis = findCol(headers, ['TENIS', 'TENNIS', 'TIENE TENIS', 'SOCIO TENIS']);
        const colDni = findCol(headers, ['DNI', 'DOCUMENTO', 'DOC', 'CI', 'CEDULA']);

        const parsed: ImportRow[] = raw.map((r, i) => {
          const lotRaw = String(r[colLot || ''] ?? '').trim();
          const catRaw = String(r[colCat || ''] ?? '').trim();
          const statusRaw = r[colStatus || ''];
          const tenisRaw = r[colTenis || ''];

          let first_name = '';
          let last_name = '';
          let full_name_raw = '';

          if (colName && !colFirstName && !colLastName) {
            full_name_raw = String(r[colName] ?? '').trim();
            const split = splitName(full_name_raw);
            first_name = split.first_name;
            last_name = split.last_name;
          } else {
            last_name = String(r[colLastName || ''] ?? '').trim();
            first_name = String(r[colFirstName || colName || ''] ?? '').trim();
            full_name_raw = `${last_name} ${first_name}`.trim();
          }

          const category = parseCategory(catRaw);
          const errors: string[] = [];

          if (!lotRaw) errors.push('Sin número de lote');
          if (!category) errors.push(`Categoría desconocida: "${catRaw}"`);
          if (!last_name && !first_name) errors.push('Sin nombre');

          return {
            lot_number: lotRaw,
            category_raw: catRaw,
            category: category || 'titular',
            last_name,
            first_name,
            full_name_raw,
            dni: String(r[colDni || ''] ?? '').trim(),
            phone: String(r[colPhone || ''] ?? '').trim(),
            email: String(r[colEmail || ''] ?? '').trim(),
            carnet_status: parseStatus(statusRaw),
            tenis: parseTenis(tenisRaw),
            _rowIndex: i + 2,
            _errors: errors,
            _duplicate: false,
            _skip: errors.length > 0,
          };
        });

        // Detect duplicates within file
        const seen = new Map<string, number>();
        parsed.forEach((row, idx) => {
          const key = `${row.lot_number}|${row.category}|${row.last_name.toLowerCase()}`;
          if (seen.has(key)) {
            parsed[idx]._duplicate = true;
            parsed[idx]._errors.push('Duplicado dentro del archivo');
            parsed[idx]._skip = true;
          } else {
            seen.set(key, idx);
          }
        });

        // Detect duplicates against existing DB
        parsed.forEach((row) => {
          if (row._duplicate) return;
          const dniMatch = row.dni && existingMembers.some(e => e.dni && e.dni === row.dni);
          if (dniMatch) {
            row._duplicate = true;
            row._errors.push('DNI ya existe en la base de datos');
            row._skip = true;
            return;
          }
          const nameMatch = existingMembers.some(e =>
            e.lot_number === row.lot_number &&
            e.last_name.toLowerCase() === row.last_name.toLowerCase() &&
            e.first_name.toLowerCase() === row.first_name.toLowerCase()
          );
          if (nameMatch) {
            row._duplicate = true;
            row._errors.push('Socio ya existe (barrio + lote + nombre)');
            row._skip = true;
          }
        });

        setRows(parsed);
        setFileName(file.name);

        // Check if any rows are valid before proceeding
        const valid = parsed.filter(r => !r._skip);
        if (valid.length === 0 && parsed.length > 0) {
          setGlobalError('No se encontraron registros válidos para importar.');
        } else {
          setGlobalError('');
        }

        setStep('neighborhood');
      } catch (err) {
        setGlobalError('Error al leer el archivo. Asegurate de que sea un .xlsx o .csv válido.');
      }
    };
    reader.readAsArrayBuffer(file);
  };

  const handleFileChange = (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0];
    if (!file) return;
    parseFile(file);
  };

  const handleDrop = (e: React.DragEvent) => {
    e.preventDefault();
    const file = e.dataTransfer.files?.[0];
    if (file) parseFile(file);
  };

  const createAndSelectNeighborhood = async () => {
    if (!newNbName.trim()) return;
    const { data } = await supabase.from('neighborhoods').insert({ name: newNbName.trim() }).select().maybeSingle();
    if (data) {
      const nb = data as Neighborhood;
      setNeighborhoods(prev => [...prev, nb]);
      setNeighborhoodId(nb.id);
      setNewNbName('');
    }
  };

  const proceedToPreview = () => {
    if (!neighborhoodId) return;
    // Assign neighborhood to rows that don't have one
    setRows(prev => prev.map(r => ({ ...r })));
    setStep('preview');
  };

  const stats = {
    total: rows.length,
    valid: rows.filter(r => !r._skip).length,
    errors: rows.filter(r => r._errors.length > 0 && !r._duplicate).length,
    duplicates: rows.filter(r => r._duplicate).length,
    lots: new Set(rows.filter(r => !r._skip).map(r => r.lot_number)).size,
    titulares: rows.filter(r => !r._skip && r.category === 'titular').length,
    familiares: rows.filter(r => !r._skip && ['familiar_1', 'familiar_2', 'familiar_3'].includes(r.category)).length,
    adherentes: rows.filter(r => !r._skip && r.category === 'adherente').length,
    tenis: rows.filter(r => !r._skip && r.tenis).length,
  };

  const doImport = async () => {
    setStep('importing');
    const toImport = rows.filter(r => !r._skip);
    let created = 0, skipped = 0, errors = 0;

    // Build lot->titular map from what we're importing
    const lotTitulars = new Map<string, boolean>();
    toImport.forEach(r => { if (r.category === 'titular') lotTitulars.set(r.lot_number, true); });

    // Check lots without titular (neither in file nor in DB)
    const lotsWithTitularInDB = new Set(existingMembers.filter(e => e.category === 'titular').map(e => e.lot_number));

    for (const row of toImport) {
      if (row.category !== 'titular' && !lotTitulars.has(row.lot_number) && !lotsWithTitularInDB.has(row.lot_number)) {
        errors++;
        continue;
      }
      const { error } = await supabase.from('members').insert({
        lot_number: row.lot_number,
        neighborhood_id: neighborhoodId,
        first_name: row.first_name,
        last_name: row.last_name,
        dni: row.dni || null,
        phone: row.phone,
        email: row.email,
        category: row.category,
        carnet_status: row.carnet_status,
        tenis: row.tenis,
        updated_at: new Date().toISOString(),
      });
      if (error) { errors++; } else { created++; }
    }

    skipped = rows.filter(r => r._skip).length;
    setImportResult({ created, skipped, errors });
    setStep('done');
    if (created > 0) onImported();
  };

  const toggleSkip = (idx: number) => {
    setRows(prev => prev.map((r, i) => i === idx ? { ...r, _skip: !r._skip } : r));
  };

  const startEdit = (idx: number) => {
    setEditingRow(idx);
    setEditValues({ ...rows[idx] });
  };

  const saveEdit = (idx: number) => {
    setRows(prev => prev.map((r, i) => {
      if (i !== idx) return r;
      const updated = { ...r, ...editValues };
      // Re-validate
      const errors: string[] = [];
      if (!updated.lot_number) errors.push('Sin número de lote');
      if (!updated.last_name && !updated.first_name) errors.push('Sin nombre');
      updated._errors = errors;
      updated._skip = errors.length > 0 || updated._duplicate;
      return updated;
    }));
    setEditingRow(null);
  };

  const selectedNbName = neighborhoods.find(n => n.id === neighborhoodId)?.name || '';

  return (
    <div className="fixed inset-0 bg-black/60 z-50 flex items-center justify-center p-4" onClick={e => e.target === e.currentTarget && onClose()}>
      <div className="bg-white rounded-2xl shadow-2xl w-full max-w-5xl max-h-[92vh] flex flex-col">
        {/* Header */}
        <div className="flex items-center justify-between px-6 py-4 border-b border-slate-200 flex-shrink-0">
          <div className="flex items-center gap-3">
            <div className="bg-emerald-100 p-2 rounded-lg">
              <FileSpreadsheet size={20} className="text-emerald-700" />
            </div>
            <div>
              <h2 className="text-lg font-bold text-slate-800">Importar Socios desde Excel</h2>
              {fileName && <p className="text-xs text-slate-500">{fileName}</p>}
            </div>
          </div>
          <button onClick={onClose} className="p-1.5 rounded-lg hover:bg-slate-100 text-slate-500 transition-colors"><X size={18} /></button>
        </div>

        {/* Step indicator */}
        <div className="flex items-center gap-1 px-6 py-3 border-b border-slate-100 flex-shrink-0 text-xs">
          {(['upload', 'neighborhood', 'preview', 'done'] as const).map((s, i) => (
            <div key={s} className="flex items-center gap-1">
              <span className={`px-2 py-0.5 rounded-full font-medium ${step === s ? 'bg-emerald-600 text-white' : ((['upload', 'neighborhood', 'preview', 'importing', 'done'].indexOf(step) > i) ? 'bg-emerald-100 text-emerald-700' : 'bg-slate-100 text-slate-400')}`}>
                {i + 1}. {s === 'upload' ? 'Archivo' : s === 'neighborhood' ? 'Barrio' : s === 'preview' ? 'Vista previa' : 'Listo'}
              </span>
              {i < 3 && <ChevronRight size={12} className="text-slate-300" />}
            </div>
          ))}
        </div>

        {/* Body */}
        <div className="flex-1 overflow-y-auto">

          {/* STEP: UPLOAD */}
          {step === 'upload' && (
            <div className="p-8 flex flex-col items-center justify-center min-h-[300px]">
              <div
                onDrop={handleDrop}
                onDragOver={e => e.preventDefault()}
                onClick={() => fileRef.current?.click()}
                className="border-2 border-dashed border-slate-300 rounded-2xl p-12 text-center cursor-pointer hover:border-emerald-400 hover:bg-emerald-50 transition-all w-full max-w-md"
              >
                <Upload size={40} className="mx-auto mb-4 text-slate-400" />
                <p className="font-semibold text-slate-700 mb-1">Arrastrá o hacé clic para subir</p>
                <p className="text-sm text-slate-500">Archivos .xlsx o .csv</p>
              </div>
              <input ref={fileRef} type="file" accept=".xlsx,.xls,.csv" onChange={handleFileChange} className="hidden" />
              {globalError && (
                <div className="mt-4 flex items-center gap-2 text-red-600 bg-red-50 border border-red-200 rounded-lg px-4 py-3 text-sm max-w-md w-full">
                  <AlertCircle size={16} /> {globalError}
                </div>
              )}
            </div>
          )}

          {/* STEP: NEIGHBORHOOD */}
          {step === 'neighborhood' && (
            <div className="p-8 max-w-md mx-auto space-y-6">
              <div className="bg-blue-50 border border-blue-200 rounded-xl p-4 flex gap-3 text-sm text-blue-700">
                <Info size={16} className="flex-shrink-0 mt-0.5" />
                <span>El archivo no contiene columna de barrio. Seleccioná o creá el barrio al que pertenecen estos socios.</span>
              </div>

              <div>
                <label className="block text-sm font-semibold text-slate-700 mb-2">Seleccionar barrio existente</label>
                <select value={neighborhoodId} onChange={e => setNeighborhoodId(e.target.value)} className="w-full px-3 py-2.5 text-sm border border-slate-200 rounded-lg focus:outline-none focus:ring-2 focus:ring-emerald-400">
                  <option value="">-- Seleccionar --</option>
                  {neighborhoods.map(n => <option key={n.id} value={n.id}>{n.name}</option>)}
                </select>
              </div>

              <div className="relative flex items-center">
                <div className="flex-1 border-t border-slate-200"></div>
                <span className="px-3 text-xs text-slate-400">o crear nuevo</span>
                <div className="flex-1 border-t border-slate-200"></div>
              </div>

              <div className="flex gap-2">
                <input value={newNbName} onChange={e => setNewNbName(e.target.value)} onKeyDown={e => e.key === 'Enter' && createAndSelectNeighborhood()} placeholder="Nombre del nuevo barrio" className="flex-1 px-3 py-2 text-sm border border-slate-200 rounded-lg focus:outline-none focus:ring-2 focus:ring-emerald-400" />
                <button onClick={createAndSelectNeighborhood} disabled={!newNbName.trim()} className="px-4 py-2 bg-emerald-600 text-white rounded-lg hover:bg-emerald-700 disabled:opacity-40 text-sm font-medium transition-colors">
                  Crear
                </button>
              </div>

              {globalError && (
                <div className="flex items-center gap-2 text-red-600 bg-red-50 border border-red-200 rounded-lg px-4 py-3 text-sm">
                  <AlertCircle size={16} /> {globalError}
                </div>
              )}
            </div>
          )}

          {/* STEP: PREVIEW */}
          {step === 'preview' && (
            <div className="p-6 space-y-5">
              {/* Summary cards */}
              <div className="grid grid-cols-2 md:grid-cols-4 gap-3">
                {[
                  { label: 'Total detectados', value: stats.total, color: 'bg-slate-50 border-slate-200' },
                  { label: 'A importar', value: stats.valid, color: 'bg-emerald-50 border-emerald-200 text-emerald-700' },
                  { label: 'Duplicados', value: stats.duplicates, color: 'bg-amber-50 border-amber-200 text-amber-700' },
                  { label: 'Con errores', value: stats.errors, color: 'bg-red-50 border-red-200 text-red-700' },
                ].map(c => (
                  <div key={c.label} className={`rounded-xl border p-3 ${c.color}`}>
                    <p className="text-xs text-slate-500">{c.label}</p>
                    <p className={`text-2xl font-bold ${c.color.includes('emerald') ? 'text-emerald-700' : c.color.includes('amber') ? 'text-amber-700' : c.color.includes('red') ? 'text-red-700' : 'text-slate-800'}`}>{c.value}</p>
                  </div>
                ))}
              </div>
              <div className="grid grid-cols-2 md:grid-cols-4 gap-3">
                <div className="bg-slate-50 border border-slate-200 rounded-xl p-3"><p className="text-xs text-slate-500">Lotes</p><p className="text-xl font-bold text-slate-800">{stats.lots}</p></div>
                <div className="bg-slate-50 border border-slate-200 rounded-xl p-3"><p className="text-xs text-slate-500">Titulares</p><p className="text-xl font-bold text-slate-800">{stats.titulares}</p></div>
                <div className="bg-slate-50 border border-slate-200 rounded-xl p-3"><p className="text-xs text-slate-500">Familiares</p><p className="text-xl font-bold text-slate-800">{stats.familiares + stats.adherentes}</p></div>
                <div className="bg-slate-50 border border-slate-200 rounded-xl p-3"><p className="text-xs text-slate-500">Con tenis</p><p className="text-xl font-bold text-slate-800">{stats.tenis}</p></div>
              </div>

              <div className="flex items-center gap-2 bg-blue-50 border border-blue-200 rounded-lg px-4 py-2.5 text-sm text-blue-700">
                <Info size={14} />
                <span>Barrio seleccionado: <strong>{selectedNbName}</strong>. Podés excluir filas individuales haciendo clic en el icono de pausa.</span>
              </div>

              {/* Table */}
              <div className="overflow-x-auto rounded-xl border border-slate-200 text-xs">
                <table className="w-full">
                  <thead className="bg-slate-50 border-b border-slate-200">
                    <tr>
                      <th className="px-3 py-2.5 text-left font-semibold text-slate-600 uppercase tracking-wide">Fila</th>
                      <th className="px-3 py-2.5 text-left font-semibold text-slate-600 uppercase tracking-wide">Lote</th>
                      <th className="px-3 py-2.5 text-left font-semibold text-slate-600 uppercase tracking-wide">Categoría</th>
                      <th className="px-3 py-2.5 text-left font-semibold text-slate-600 uppercase tracking-wide">Apellido</th>
                      <th className="px-3 py-2.5 text-left font-semibold text-slate-600 uppercase tracking-wide">Nombre</th>
                      <th className="px-3 py-2.5 text-left font-semibold text-slate-600 uppercase tracking-wide">DNI</th>
                      <th className="px-3 py-2.5 text-left font-semibold text-slate-600 uppercase tracking-wide">Tel</th>
                      <th className="px-3 py-2.5 text-left font-semibold text-slate-600 uppercase tracking-wide">Estado</th>
                      <th className="px-3 py-2.5 text-left font-semibold text-slate-600 uppercase tracking-wide">Tenis</th>
                      <th className="px-3 py-2.5 text-left font-semibold text-slate-600 uppercase tracking-wide">Notas</th>
                      <th className="px-3 py-2.5 text-left font-semibold text-slate-600 uppercase tracking-wide">Acc.</th>
                    </tr>
                  </thead>
                  <tbody className="divide-y divide-slate-100">
                    {rows.map((row, idx) => (
                      <tr key={idx} className={`transition-colors ${row._skip ? 'opacity-40 bg-slate-50' : row._errors.length > 0 ? 'bg-red-50' : row._duplicate ? 'bg-amber-50' : 'hover:bg-slate-50'}`}>
                        {editingRow === idx ? (
                          <>
                            <td className="px-3 py-2 text-slate-400">{row._rowIndex}</td>
                            <td className="px-2 py-1"><input value={editValues.lot_number ?? ''} onChange={e => setEditValues(v => ({ ...v, lot_number: e.target.value }))} className="w-16 px-1.5 py-1 border border-slate-300 rounded text-xs" /></td>
                            <td className="px-2 py-1">
                              <select value={editValues.category ?? 'titular'} onChange={e => setEditValues(v => ({ ...v, category: e.target.value as MemberCategory }))} className="px-1.5 py-1 border border-slate-300 rounded text-xs">
                                {(['titular', 'familiar_1', 'familiar_2', 'familiar_3', 'adherente'] as MemberCategory[]).map(c => <option key={c} value={c}>{CATEGORY_LABELS[c]}</option>)}
                              </select>
                            </td>
                            <td className="px-2 py-1"><input value={editValues.last_name ?? ''} onChange={e => setEditValues(v => ({ ...v, last_name: e.target.value }))} className="w-24 px-1.5 py-1 border border-slate-300 rounded text-xs" /></td>
                            <td className="px-2 py-1"><input value={editValues.first_name ?? ''} onChange={e => setEditValues(v => ({ ...v, first_name: e.target.value }))} className="w-24 px-1.5 py-1 border border-slate-300 rounded text-xs" /></td>
                            <td className="px-2 py-1"><input value={editValues.dni ?? ''} onChange={e => setEditValues(v => ({ ...v, dni: e.target.value }))} className="w-20 px-1.5 py-1 border border-slate-300 rounded text-xs" /></td>
                            <td className="px-2 py-1"><input value={editValues.phone ?? ''} onChange={e => setEditValues(v => ({ ...v, phone: e.target.value }))} className="w-24 px-1.5 py-1 border border-slate-300 rounded text-xs" /></td>
                            <td className="px-2 py-1">
                              <select value={editValues.carnet_status ?? 'activo'} onChange={e => setEditValues(v => ({ ...v, carnet_status: e.target.value as 'activo' | 'pausado' }))} className="px-1.5 py-1 border border-slate-300 rounded text-xs">
                                <option value="activo">Activo</option>
                                <option value="pausado">Pausado</option>
                              </select>
                            </td>
                            <td className="px-2 py-1">
                              <input type="checkbox" checked={editValues.tenis ?? false} onChange={e => setEditValues(v => ({ ...v, tenis: e.target.checked }))} />
                            </td>
                            <td className="px-2 py-1 text-slate-400">-</td>
                            <td className="px-2 py-1">
                              <button onClick={() => saveEdit(idx)} className="p-1 bg-emerald-600 text-white rounded hover:bg-emerald-700"><Check size={12} /></button>
                            </td>
                          </>
                        ) : (
                          <>
                            <td className="px-3 py-2 text-slate-400">{row._rowIndex}</td>
                            <td className="px-3 py-2 font-semibold text-slate-800">{row.lot_number || '-'}</td>
                            <td className="px-3 py-2">
                              <span className="bg-slate-100 text-slate-700 px-1.5 py-0.5 rounded font-medium">{CATEGORY_LABELS[row.category]}</span>
                            </td>
                            <td className="px-3 py-2 text-slate-700">{row.last_name || '-'}</td>
                            <td className="px-3 py-2 text-slate-700">{row.first_name || '-'}</td>
                            <td className="px-3 py-2 text-slate-500">{row.dni || '-'}</td>
                            <td className="px-3 py-2 text-slate-500">{row.phone || '-'}</td>
                            <td className="px-3 py-2">
                              <span className={`px-1.5 py-0.5 rounded font-medium ${row.carnet_status === 'activo' ? 'bg-emerald-100 text-emerald-700' : 'bg-amber-100 text-amber-700'}`}>{row.carnet_status}</span>
                            </td>
                            <td className="px-3 py-2 text-center">{row.tenis ? <span className="text-emerald-600 font-bold">SI</span> : <span className="text-slate-300">-</span>}</td>
                            <td className="px-3 py-2 max-w-[160px]">
                              {row._errors.map((e, ei) => (
                                <span key={ei} className="block text-red-600 text-xs">{e}</span>
                              ))}
                              {row._duplicate && <span className="text-amber-600 text-xs">Duplicado</span>}
                            </td>
                            <td className="px-3 py-2">
                              <div className="flex gap-1">
                                {!row._duplicate && (
                                  <button onClick={() => startEdit(idx)} title="Editar" className="p-1 rounded hover:bg-blue-100 text-slate-500 hover:text-blue-600 transition-colors">
                                    <FileSpreadsheet size={12} />
                                  </button>
                                )}
                                <button onClick={() => toggleSkip(idx)} title={row._skip ? 'Incluir' : 'Excluir'} className={`p-1 rounded transition-colors ${row._skip ? 'text-emerald-600 hover:bg-emerald-50' : 'text-slate-400 hover:bg-red-50 hover:text-red-500'}`}>
                                  {row._skip ? <Check size={12} /> : <X size={12} />}
                                </button>
                              </div>
                            </td>
                          </>
                        )}
                      </tr>
                    ))}
                  </tbody>
                </table>
              </div>
            </div>
          )}

          {/* STEP: IMPORTING */}
          {step === 'importing' && (
            <div className="flex flex-col items-center justify-center py-20 gap-4">
              <Loader2 size={40} className="animate-spin text-emerald-600" />
              <p className="text-slate-600 font-medium">Importando socios...</p>
            </div>
          )}

          {/* STEP: DONE */}
          {step === 'done' && (
            <div className="flex flex-col items-center justify-center py-16 gap-6">
              <div className="bg-emerald-100 p-4 rounded-full">
                <Check size={36} className="text-emerald-600" />
              </div>
              <h3 className="text-xl font-bold text-slate-800">Importación completada</h3>
              <div className="flex gap-6 text-center">
                <div><p className="text-3xl font-bold text-emerald-600">{importResult.created}</p><p className="text-sm text-slate-500">Creados</p></div>
                <div><p className="text-3xl font-bold text-amber-500">{importResult.skipped}</p><p className="text-sm text-slate-500">Omitidos</p></div>
                <div><p className="text-3xl font-bold text-red-500">{importResult.errors}</p><p className="text-sm text-slate-500">Errores</p></div>
              </div>
            </div>
          )}
        </div>

        {/* Footer */}
        <div className="flex justify-between items-center px-6 py-4 border-t border-slate-200 flex-shrink-0 bg-slate-50 rounded-b-2xl">
          <button onClick={onClose} className="px-4 py-2 border border-slate-200 rounded-lg text-slate-600 hover:bg-white text-sm font-medium transition-colors">
            {step === 'done' ? 'Cerrar' : 'Cancelar'}
          </button>
          <div className="flex gap-2">
            {step === 'neighborhood' && (
              <button onClick={proceedToPreview} disabled={!neighborhoodId} className="px-5 py-2 bg-emerald-600 text-white rounded-lg hover:bg-emerald-700 disabled:opacity-40 text-sm font-medium transition-colors flex items-center gap-2">
                Vista previa <ChevronRight size={16} />
              </button>
            )}
            {step === 'preview' && stats.valid > 0 && (
              <button onClick={doImport} className="px-5 py-2 bg-emerald-600 text-white rounded-lg hover:bg-emerald-700 text-sm font-medium transition-colors flex items-center gap-2">
                <Upload size={16} /> Importar {stats.valid} socios
              </button>
            )}
          </div>
        </div>
      </div>
    </div>
  );
}
