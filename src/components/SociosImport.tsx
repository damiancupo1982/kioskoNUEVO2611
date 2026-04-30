import { useState, useRef } from 'react';
import * as XLSX from 'xlsx';
import { Upload, X, Check, AlertCircle, FileSpreadsheet, ChevronRight, Loader2, Info, CreditCard as Edit2 } from 'lucide-react';
import { supabase } from '../lib/supabase';
import type { Neighborhood, MemberCategory } from '../lib/supabase';

interface ImportRow {
  lot_number: string;
  category_raw: string;
  category: MemberCategory;
  // stored as "Nombre Apellido" raw then split
  full_name_raw: string;
  first_name: string;
  last_name: string;
  dni: string;
  phone: string;
  email: string;
  neighborhood_raw: string; // from Excel column
  carnet_status: 'activo' | 'pausado';
  tenis: boolean;
  _rowIndex: number;
  _errors: string[];
  _duplicate: boolean;
  _skip: boolean;
}

type Step = 'upload' | 'neighborhood' | 'preview' | 'importing' | 'done';

// Maps Excel condition values -> MemberCategory
const CATEGORY_MAP: Record<string, MemberCategory> = {
  T: 'titular', TITULAR: 'titular', PROPIETARIO: 'titular', PROPIETARIA: 'titular',
  F1: 'familiar_1', 'FAMILIAR 1': 'familiar_1', 'FAM 1': 'familiar_1', FAMILIAR1: 'familiar_1',
  F2: 'familiar_2', 'FAMILIAR 2': 'familiar_2', 'FAM 2': 'familiar_2', FAMILIAR2: 'familiar_2',
  F3: 'familiar_3', 'FAMILIAR 3': 'familiar_3', 'FAM 3': 'familiar_3', FAMILIAR3: 'familiar_3',
  F4: 'adherente', 'FAMILIAR 4': 'adherente', 'FAM 4': 'adherente', FAMILIAR4: 'adherente',
  ADHERENTE: 'adherente', FA: 'adherente', 'F.A.': 'adherente',
};

const CATEGORY_LABELS: Record<MemberCategory, string> = {
  titular: 'Titular', familiar_1: 'Familiar 1', familiar_2: 'Familiar 2',
  familiar_3: 'Familiar 3', adherente: 'Familiar Adherente',
};

function normalize(s: string): string {
  return s.normalize('NFD').replace(/[\u0300-\u036f]/g, '').toUpperCase().trim().replace(/\s+/g, ' ');
}

function parseCategory(raw: string): MemberCategory | null {
  const n = normalize(raw);
  if (CATEGORY_MAP[n]) return CATEGORY_MAP[n];
  for (const [k, v] of Object.entries(CATEGORY_MAP)) {
    if (n === k || n.startsWith(k + ' ') || n.endsWith(' ' + k)) return v;
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

// Name format in this Excel: "Borri mariano" → first word = apellido OR "Borri mariano" → first_name=mariano, last_name=Borri
// Based on screenshot: "Borri mariano", "Rousett Ivan", "veronica isabel Acensio"
// Pattern: first word(s) = apellido, last word(s) = nombre — but it's not consistent.
// Safest: store full name, split last word as first_name, rest as last_name
// Actually from screenshot: "Borri mariano" → Borri=last, mariano=first ✓
// "veronica isabel Acensio" → Acensio=last, veronica isabel=first ✓
// Strategy: last word = last_name, rest = first_name — NO, "Borri mariano": last=mariano
// Real pattern: FIRST word = last_name, rest = first_name
// "Borri mariano" → last=Borri, first=mariano ✓
// "veronica isabel Acensio" → last=veronica, first=isabel Acensio ✗
// Better: store full name as-is, let user see it. Split: first word = last_name.
// For "veronica isabel Acensio" it seems first=veronica isabel, last=Acensio — last word is last name
// Let's detect by comma first, then try last-word-as-lastname heuristic for 3+ word names
function splitName(full: string): { first_name: string; last_name: string } {
  const trimmed = full.trim();
  if (!trimmed) return { first_name: '', last_name: '' };

  // Comma format: "Apellido, Nombre"
  if (trimmed.includes(',')) {
    const [l, ...r] = trimmed.split(',');
    return { last_name: l.trim(), first_name: r.join(' ').trim() };
  }

  const words = trimmed.split(/\s+/);
  if (words.length === 1) return { last_name: words[0], first_name: '' };
  if (words.length === 2) {
    // "Borri mariano" → last=Borri (capitalized), first=mariano (lower)
    // Use first word as last_name
    return { last_name: words[0], first_name: words.slice(1).join(' ') };
  }
  // 3+ words: "veronica isabel Acensio" → last word capitalized could be last name
  // But "Gonella Sophie" = 2 words, "Ian Solano Peña" = 3 words (first=Ian, last=Solano Peña?)
  // Heuristic: first word as last_name, rest as first_name (consistent with 2-word rule)
  return { last_name: words[0], first_name: words.slice(1).join(' ') };
}

// Fuzzy column header finder
function findCol(headers: string[], candidates: string[]): string | null {
  const norm = headers.map(h => normalize(h));
  for (const c of candidates) {
    const nc = normalize(c);
    const idx = norm.findIndex(h => h === nc || h.includes(nc) || nc.includes(h));
    if (idx !== -1) return headers[idx];
  }
  return null;
}

interface SociosImportProps {
  neighborhoods: Neighborhood[];
  existingMembers: {
    lot_number: string;
    neighborhood_id: string | null;
    category: MemberCategory;
    first_name: string;
    last_name: string;
    dni: string;
  }[];
  onClose: () => void;
  onImported: () => void;
}

export default function SociosImport({ neighborhoods: initialNeighborhoods, existingMembers, onClose, onImported }: SociosImportProps) {
  const fileRef = useRef<HTMLInputElement>(null);
  const [step, setStep] = useState<Step>('upload');
  const [fileName, setFileName] = useState('');
  const [rows, setRows] = useState<ImportRow[]>([]);
  const [hasNeighborhoodCol, setHasNeighborhoodCol] = useState(false);

  // Used when Excel has no neighborhood column
  const [neighborhoodId, setNeighborhoodId] = useState('');
  const [newNbName, setNewNbName] = useState('');
  const [neighborhoods, setNeighborhoods] = useState<Neighborhood[]>(initialNeighborhoods);

  // neighborhood name → id map (built during import)
  const [nbNameToId, setNbNameToId] = useState<Map<string, string>>(new Map());

  const [importResult, setImportResult] = useState({ created: 0, skipped: 0, errors: 0 });
  const [globalError, setGlobalError] = useState('');
  const [editingRow, setEditingRow] = useState<number | null>(null);
  const [editValues, setEditValues] = useState<Partial<ImportRow>>({});

  // Column detection info shown to user
  const [colInfo, setColInfo] = useState<Record<string, string>>({});

  const parseFile = (file: File) => {
    setGlobalError('');
    const reader = new FileReader();
    reader.onload = (e) => {
      try {
        const data = new Uint8Array(e.target!.result as ArrayBuffer);
        const wb = XLSX.read(data, { type: 'array' });
        const ws = wb.Sheets[wb.SheetNames[0]];
        // Use header row as-is
        const raw: Record<string, unknown>[] = XLSX.utils.sheet_to_json(ws, { defval: '' });

        if (!raw.length) {
          setGlobalError('El archivo está vacío o no tiene datos válidos.');
          return;
        }

        const headers = Object.keys(raw[0]);

        // ---- Column detection ----
        const colLot = findCol(headers, ['LOTE', 'NRO LOTE', 'N LOTE', 'N° LOTE', 'NUMERO LOTE', 'LOT']);
        const colCat = findCol(headers, [
          'CONDICION', 'CONDICIÓN', 'CATEGORIA', 'CATEGORÍA', 'COLUMNA1', 'COLUMN1',
          'CAT', 'TIPO', 'CONDICION SOCIO', 'TIPO SOCIO',
        ]);
        // Combined name column
        const colFullName = findCol(headers, [
          'NOMBRE Y APELLIDO', 'APELLIDO Y NOMBRE', 'NOMBRE COMPLETO',
          'NOMBRE Y APELLIDOS', 'APELLIDOS Y NOMBRE',
        ]);
        // Separate name columns (fallback)
        const colLastName = colFullName ? null : findCol(headers, ['APELLIDO', 'APELLIDOS', 'LAST NAME']);
        const colFirstName = colFullName ? null : findCol(headers, ['NOMBRE', 'NOMBRES', 'FIRST NAME']);

        const colPhone = findCol(headers, ['TELEFONO', 'TELÉFONO', 'TEL', 'CELULAR', 'PHONE', 'MOVIL']);
        const colDni = findCol(headers, ['DNI', 'DOCUMENTO', 'DOC', 'CI', 'CEDULA']);
        const colEmail = findCol(headers, ['MAIL', 'EMAIL', 'CORREO', 'E-MAIL', 'E MAIL']);
        const colNeighborhood = findCol(headers, ['BARRIO', 'NEIGHBORHOOD', 'LOCALIDAD', 'SECTOR']);
        const colStatus = findCol(headers, ['ESTADO', 'HABILITADO', 'ACTIVO', 'STATUS', 'BAJA', 'HABILITADO']);
        const colTenis = findCol(headers, ['TENIS', 'TENNIS', 'TIENE TENIS', 'SOCIO TENIS']);

        // Store detected columns for display
        setColInfo({
          Lote: colLot || 'No detectado',
          Condicion: colCat || 'No detectado',
          Nombre: colFullName || `${colLastName || '-'} / ${colFirstName || '-'}`,
          Telefono: colPhone || 'No detectado',
          DNI: colDni || 'No detectado',
          Email: colEmail || 'No detectado',
          Barrio: colNeighborhood || 'No detectado',
          Estado: colStatus || 'No detectado',
          Tenis: colTenis || 'No detectado',
        });

        const hasNbCol = !!colNeighborhood;
        setHasNeighborhoodCol(hasNbCol);

        // ---- Parse rows ----
        const parsed: ImportRow[] = raw
          .filter(r => {
            // Skip completely empty rows
            const lotVal = String(r[colLot || ''] ?? '').trim();
            const nameVal = String(r[colFullName || colLastName || ''] ?? '').trim();
            return lotVal !== '' || nameVal !== '';
          })
          .map((r, i) => {
            const lotRaw = String(r[colLot || ''] ?? '').trim();
            const catRaw = String(r[colCat || ''] ?? '').trim();
            const neighborhoodRaw = colNeighborhood ? String(r[colNeighborhood] ?? '').trim() : '';
            const statusRaw = r[colStatus || ''];
            const tenisRaw = r[colTenis || ''];

            let first_name = '';
            let last_name = '';
            let full_name_raw = '';

            if (colFullName) {
              full_name_raw = String(r[colFullName] ?? '').trim();
              const s = splitName(full_name_raw);
              first_name = s.first_name;
              last_name = s.last_name;
            } else {
              last_name = String(r[colLastName || ''] ?? '').trim();
              first_name = String(r[colFirstName || ''] ?? '').trim();
              full_name_raw = [last_name, first_name].filter(Boolean).join(' ');
            }

            const category = parseCategory(catRaw);
            const errors: string[] = [];

            if (!lotRaw) errors.push('Sin número de lote');
            if (!category) errors.push(`Condición desconocida: "${catRaw}"`);
            if (!last_name && !first_name) errors.push('Sin nombre');

            // Normalize lot number (remove decimals if Excel treats as number "31.0" → "31")
            const normalizedLot = lotRaw.replace(/\.0+$/, '');

            return {
              lot_number: normalizedLot,
              category_raw: catRaw,
              category: category || 'titular',
              full_name_raw,
              first_name,
              last_name,
              dni: String(r[colDni || ''] ?? '').trim().replace(/\.0+$/, ''),
              phone: String(r[colPhone || ''] ?? '').trim().replace(/\.0+$/, ''),
              email: String(r[colEmail || ''] ?? '').trim(),
              neighborhood_raw: neighborhoodRaw,
              carnet_status: parseStatus(statusRaw),
              tenis: parseTenis(tenisRaw),
              _rowIndex: i + 2,
              _errors: errors,
              _duplicate: false,
              _skip: errors.length > 0,
            };
          });

        // ---- Deduplicate within file ----
        const seen = new Map<string, number>();
        parsed.forEach((row, idx) => {
          if (row._errors.length > 0) return;
          const key = `${row.lot_number}|${row.category}`;
          if (row.category !== 'adherente') {
            if (seen.has(key)) {
              parsed[idx]._duplicate = true;
              parsed[idx]._errors.push('Duplicado dentro del archivo');
              parsed[idx]._skip = true;
            } else {
              seen.set(key, idx);
            }
          }
        });

        // ---- Deduplicate against existing DB ----
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
            normalize(e.last_name) === normalize(row.last_name) &&
            normalize(e.first_name) === normalize(row.first_name)
          );
          if (nameMatch) {
            row._duplicate = true;
            row._errors.push('Socio ya existe (lote + nombre)');
            row._skip = true;
          }
        });

        setRows(parsed);
        setFileName(file.name);

        if (hasNbCol) {
          // Skip neighborhood step, go straight to preview
          setStep('preview');
        } else {
          setStep('neighborhood');
        }
      } catch {
        setGlobalError('Error al leer el archivo. Asegurate de que sea un .xlsx o .csv válido.');
      }
    };
    reader.readAsArrayBuffer(file);
  };

  const handleFileChange = (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0];
    if (!file) return;
    parseFile(file);
    // Reset input so same file can be re-uploaded
    e.target.value = '';
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

  // Resolve or create neighborhood by name, returns id
  const resolveNeighborhood = async (name: string, cache: Map<string, string>): Promise<string | null> => {
    const key = normalize(name);
    if (cache.has(key)) return cache.get(key)!;

    // Check existing
    const existing = neighborhoods.find(n => normalize(n.name) === key);
    if (existing) {
      cache.set(key, existing.id);
      return existing.id;
    }

    // Create new
    const { data } = await supabase.from('neighborhoods').insert({ name: name.trim() }).select().maybeSingle();
    if (data) {
      const nb = data as Neighborhood;
      setNeighborhoods(prev => [...prev, nb]);
      cache.set(key, nb.id);
      return nb.id;
    }
    return null;
  };

  const doImport = async () => {
    setStep('importing');
    const toImport = rows.filter(r => !r._skip);
    let created = 0, skipped = 0, errors = 0;

    const lotTitulars = new Set(toImport.filter(r => r.category === 'titular').map(r => r.lot_number));
    const lotsWithTitularInDB = new Set(existingMembers.filter(e => e.category === 'titular').map(e => e.lot_number));

    const nbCache = new Map<string, string>(nbNameToId);

    for (const row of toImport) {
      // Familiares need a titular
      if (row.category !== 'titular' && !lotTitulars.has(row.lot_number) && !lotsWithTitularInDB.has(row.lot_number)) {
        errors++;
        continue;
      }

      // Resolve neighborhood
      let nbId = neighborhoodId; // fallback: manually selected
      if (hasNeighborhoodCol && row.neighborhood_raw) {
        const resolved = await resolveNeighborhood(row.neighborhood_raw, nbCache);
        if (resolved) nbId = resolved;
      }

      if (!nbId) { errors++; continue; }

      const { error } = await supabase.from('members').insert({
        lot_number: row.lot_number,
        neighborhood_id: nbId,
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

    setNbNameToId(nbCache);
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
      const errs: string[] = [];
      if (!updated.lot_number) errs.push('Sin número de lote');
      if (!updated.last_name && !updated.first_name) errs.push('Sin nombre');
      updated._errors = errs;
      updated._duplicate = false;
      updated._skip = errs.length > 0;
      return updated;
    }));
    setEditingRow(null);
  };

  const uniqueNeighborhoods = Array.from(new Set(rows.map(r => r.neighborhood_raw).filter(Boolean)));
  const selectedNbName = neighborhoods.find(n => n.id === neighborhoodId)?.name || '';

  return (
    <div className="fixed inset-0 bg-black/60 z-50 flex items-center justify-center p-4" onClick={e => e.target === e.currentTarget && onClose()}>
      <div className="bg-white rounded-2xl shadow-2xl w-full max-w-6xl max-h-[92vh] flex flex-col">

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
          {(['upload', 'neighborhood', 'preview', 'done'] as const).map((s, i) => {
            const steps = ['upload', 'neighborhood', 'preview', 'importing', 'done'];
            const past = steps.indexOf(step) > i;
            const active = step === s || (s === 'neighborhood' && step === 'preview' && !hasNeighborhoodCol);
            return (
              <div key={s} className="flex items-center gap-1">
                <span className={`px-2 py-0.5 rounded-full font-medium ${step === s ? 'bg-emerald-600 text-white' : past ? 'bg-emerald-100 text-emerald-700' : 'bg-slate-100 text-slate-400'}`}>
                  {i + 1}. {s === 'upload' ? 'Archivo' : s === 'neighborhood' ? 'Barrio' : s === 'preview' ? 'Vista previa' : 'Listo'}
                  {s === 'neighborhood' && hasNeighborhoodCol && <span className="ml-1 opacity-60">(auto)</span>}
                </span>
                {i < 3 && <ChevronRight size={12} className="text-slate-300" />}
              </div>
            );
            void active;
          })}
        </div>

        {/* Body */}
        <div className="flex-1 overflow-y-auto">

          {/* STEP: UPLOAD */}
          {step === 'upload' && (
            <div className="p-8 flex flex-col items-center gap-6">
              <div
                onDrop={handleDrop}
                onDragOver={e => e.preventDefault()}
                onClick={() => fileRef.current?.click()}
                className="border-2 border-dashed border-slate-300 rounded-2xl p-12 text-center cursor-pointer hover:border-emerald-400 hover:bg-emerald-50 transition-all w-full max-w-lg"
              >
                <Upload size={40} className="mx-auto mb-4 text-slate-400" />
                <p className="font-semibold text-slate-700 mb-1">Arrastrá o hacé clic para subir</p>
                <p className="text-sm text-slate-500">Archivos .xlsx o .csv</p>
              </div>
              <input ref={fileRef} type="file" accept=".xlsx,.xls,.csv" onChange={handleFileChange} className="hidden" />

              <div className="bg-slate-50 border border-slate-200 rounded-xl p-4 w-full max-w-lg text-xs text-slate-600">
                <p className="font-semibold text-slate-700 mb-2">Columnas esperadas en el Excel:</p>
                <div className="grid grid-cols-2 gap-1">
                  {[
                    ['A', 'LOTE'], ['B', 'CONDICION (t, f1, f2, f3)'], ['C', 'NOMBRE Y APELLIDO'],
                    ['D', 'TELEFONO'], ['E', 'DNI'], ['F', 'MAIL'], ['G', 'BARRIO'],
                  ].map(([col, label]) => (
                    <div key={col} className="flex gap-2">
                      <span className="bg-emerald-100 text-emerald-700 font-bold px-1.5 rounded">{col}</span>
                      <span>{label}</span>
                    </div>
                  ))}
                </div>
              </div>

              {globalError && (
                <div className="flex items-center gap-2 text-red-600 bg-red-50 border border-red-200 rounded-lg px-4 py-3 text-sm w-full max-w-lg">
                  <AlertCircle size={16} /> {globalError}
                </div>
              )}
            </div>
          )}

          {/* STEP: NEIGHBORHOOD (only when Excel has no neighborhood column) */}
          {step === 'neighborhood' && (
            <div className="p-8 max-w-lg mx-auto space-y-6">
              <div className="bg-amber-50 border border-amber-200 rounded-xl p-4 flex gap-3 text-sm text-amber-700">
                <AlertCircle size={16} className="flex-shrink-0 mt-0.5" />
                <span>No se detectó columna de barrio en el archivo. Seleccioná o creá el barrio al que pertenecen todos estos socios.</span>
              </div>

              {/* Column detection summary */}
              {Object.keys(colInfo).length > 0 && (
                <div className="bg-slate-50 border border-slate-200 rounded-xl p-4 text-xs space-y-1.5">
                  <p className="font-semibold text-slate-700 mb-2">Columnas detectadas:</p>
                  {Object.entries(colInfo).map(([k, v]) => (
                    <div key={k} className="flex gap-2">
                      <span className="text-slate-500 w-20 flex-shrink-0">{k}:</span>
                      <span className={`font-medium ${v === 'No detectado' ? 'text-red-500' : 'text-emerald-700'}`}>{v}</span>
                    </div>
                  ))}
                </div>
              )}

              <div>
                <label className="block text-sm font-semibold text-slate-700 mb-2">Seleccionar barrio existente</label>
                <select value={neighborhoodId} onChange={e => setNeighborhoodId(e.target.value)} className="w-full px-3 py-2.5 text-sm border border-slate-200 rounded-lg focus:outline-none focus:ring-2 focus:ring-emerald-400">
                  <option value="">-- Seleccionar --</option>
                  {neighborhoods.map(n => <option key={n.id} value={n.id}>{n.name}</option>)}
                </select>
              </div>

              <div className="relative flex items-center">
                <div className="flex-1 border-t border-slate-200" /><span className="px-3 text-xs text-slate-400">o crear nuevo</span><div className="flex-1 border-t border-slate-200" />
              </div>

              <div className="flex gap-2">
                <input value={newNbName} onChange={e => setNewNbName(e.target.value)} onKeyDown={e => e.key === 'Enter' && createAndSelectNeighborhood()} placeholder="Nombre del barrio" className="flex-1 px-3 py-2 text-sm border border-slate-200 rounded-lg focus:outline-none focus:ring-2 focus:ring-emerald-400" />
                <button onClick={createAndSelectNeighborhood} disabled={!newNbName.trim()} className="px-4 py-2 bg-emerald-600 text-white rounded-lg hover:bg-emerald-700 disabled:opacity-40 text-sm font-medium transition-colors">Crear</button>
              </div>
            </div>
          )}

          {/* STEP: PREVIEW */}
          {step === 'preview' && (
            <div className="p-6 space-y-5">
              {/* Detected columns info */}
              {Object.keys(colInfo).length > 0 && (
                <div className="bg-slate-50 border border-slate-200 rounded-xl p-3">
                  <p className="text-xs font-semibold text-slate-600 mb-2">Columnas detectadas:</p>
                  <div className="flex flex-wrap gap-x-4 gap-y-1 text-xs">
                    {Object.entries(colInfo).map(([k, v]) => (
                      <span key={k} className={v === 'No detectado' ? 'text-red-500' : 'text-slate-600'}>
                        <span className="font-medium">{k}:</span> {v}
                      </span>
                    ))}
                  </div>
                </div>
              )}

              {/* Neighborhood info */}
              {hasNeighborhoodCol && uniqueNeighborhoods.length > 0 && (
                <div className="flex items-center gap-2 bg-emerald-50 border border-emerald-200 rounded-lg px-4 py-2.5 text-sm text-emerald-700">
                  <Info size={14} />
                  <span>Barrios detectados en el archivo: <strong>{uniqueNeighborhoods.join(', ')}</strong>. Se crearán automáticamente si no existen.</span>
                </div>
              )}
              {!hasNeighborhoodCol && selectedNbName && (
                <div className="flex items-center gap-2 bg-blue-50 border border-blue-200 rounded-lg px-4 py-2.5 text-sm text-blue-700">
                  <Info size={14} />
                  <span>Todos los socios se importarán al barrio: <strong>{selectedNbName}</strong></span>
                </div>
              )}

              {/* Summary cards */}
              <div className="grid grid-cols-2 md:grid-cols-4 gap-3">
                <div className="bg-slate-50 border border-slate-200 rounded-xl p-3">
                  <p className="text-xs text-slate-500">Total en archivo</p>
                  <p className="text-2xl font-bold text-slate-800">{stats.total}</p>
                </div>
                <div className="bg-emerald-50 border border-emerald-200 rounded-xl p-3">
                  <p className="text-xs text-slate-500">A importar</p>
                  <p className="text-2xl font-bold text-emerald-700">{stats.valid}</p>
                </div>
                <div className="bg-amber-50 border border-amber-200 rounded-xl p-3">
                  <p className="text-xs text-slate-500">Duplicados</p>
                  <p className="text-2xl font-bold text-amber-700">{stats.duplicates}</p>
                </div>
                <div className="bg-red-50 border border-red-200 rounded-xl p-3">
                  <p className="text-xs text-slate-500">Con errores</p>
                  <p className="text-2xl font-bold text-red-700">{stats.errors}</p>
                </div>
              </div>
              <div className="grid grid-cols-2 md:grid-cols-4 gap-3">
                <div className="bg-slate-50 border border-slate-200 rounded-xl p-3"><p className="text-xs text-slate-500">Lotes</p><p className="text-xl font-bold text-slate-800">{stats.lots}</p></div>
                <div className="bg-slate-50 border border-slate-200 rounded-xl p-3"><p className="text-xs text-slate-500">Titulares</p><p className="text-xl font-bold text-slate-800">{stats.titulares}</p></div>
                <div className="bg-slate-50 border border-slate-200 rounded-xl p-3"><p className="text-xs text-slate-500">Familiares</p><p className="text-xl font-bold text-slate-800">{stats.familiares + stats.adherentes}</p></div>
                <div className="bg-slate-50 border border-slate-200 rounded-xl p-3"><p className="text-xs text-slate-500">Con tenis</p><p className="text-xl font-bold text-slate-800">{stats.tenis}</p></div>
              </div>

              {/* Table */}
              <div className="overflow-x-auto rounded-xl border border-slate-200 text-xs">
                <table className="w-full">
                  <thead className="bg-slate-50 border-b border-slate-200">
                    <tr>
                      {['Fila', 'Lote', 'Barrio', 'Condición', 'Nombre completo', 'Apellido', 'Nombre', 'DNI', 'Teléfono', 'Estado', 'Tenis', 'Notas', ''].map(h => (
                        <th key={h} className="px-2 py-2.5 text-left font-semibold text-slate-600 uppercase tracking-wide whitespace-nowrap">{h}</th>
                      ))}
                    </tr>
                  </thead>
                  <tbody className="divide-y divide-slate-100">
                    {rows.map((row, idx) => (
                      <tr key={idx} className={`transition-colors ${row._skip ? 'opacity-40 bg-slate-50' : row._errors.length > 0 && !row._duplicate ? 'bg-red-50' : row._duplicate ? 'bg-amber-50' : 'hover:bg-slate-50'}`}>
                        {editingRow === idx ? (
                          <>
                            <td className="px-2 py-1.5 text-slate-400">{row._rowIndex}</td>
                            <td className="px-2 py-1.5"><input value={editValues.lot_number ?? ''} onChange={e => setEditValues(v => ({ ...v, lot_number: e.target.value }))} className="w-14 px-1.5 py-1 border border-slate-300 rounded text-xs" /></td>
                            <td className="px-2 py-1.5 text-slate-500">{row.neighborhood_raw || selectedNbName}</td>
                            <td className="px-2 py-1.5">
                              <select value={editValues.category ?? 'titular'} onChange={e => setEditValues(v => ({ ...v, category: e.target.value as MemberCategory }))} className="px-1 py-1 border border-slate-300 rounded text-xs">
                                {(['titular', 'familiar_1', 'familiar_2', 'familiar_3', 'adherente'] as MemberCategory[]).map(c => <option key={c} value={c}>{CATEGORY_LABELS[c]}</option>)}
                              </select>
                            </td>
                            <td className="px-2 py-1.5 text-slate-400 text-xs">{row.full_name_raw}</td>
                            <td className="px-2 py-1.5"><input value={editValues.last_name ?? ''} onChange={e => setEditValues(v => ({ ...v, last_name: e.target.value }))} className="w-24 px-1.5 py-1 border border-slate-300 rounded text-xs" /></td>
                            <td className="px-2 py-1.5"><input value={editValues.first_name ?? ''} onChange={e => setEditValues(v => ({ ...v, first_name: e.target.value }))} className="w-24 px-1.5 py-1 border border-slate-300 rounded text-xs" /></td>
                            <td className="px-2 py-1.5"><input value={editValues.dni ?? ''} onChange={e => setEditValues(v => ({ ...v, dni: e.target.value }))} className="w-20 px-1.5 py-1 border border-slate-300 rounded text-xs" /></td>
                            <td className="px-2 py-1.5"><input value={editValues.phone ?? ''} onChange={e => setEditValues(v => ({ ...v, phone: e.target.value }))} className="w-24 px-1.5 py-1 border border-slate-300 rounded text-xs" /></td>
                            <td className="px-2 py-1.5">
                              <select value={editValues.carnet_status ?? 'activo'} onChange={e => setEditValues(v => ({ ...v, carnet_status: e.target.value as 'activo' | 'pausado' }))} className="px-1 py-1 border border-slate-300 rounded text-xs">
                                <option value="activo">Activo</option>
                                <option value="pausado">Pausado</option>
                              </select>
                            </td>
                            <td className="px-2 py-1.5 text-center">
                              <input type="checkbox" checked={editValues.tenis ?? false} onChange={e => setEditValues(v => ({ ...v, tenis: e.target.checked }))} />
                            </td>
                            <td />
                            <td className="px-2 py-1.5">
                              <button onClick={() => saveEdit(idx)} className="p-1 bg-emerald-600 text-white rounded hover:bg-emerald-700"><Check size={12} /></button>
                            </td>
                          </>
                        ) : (
                          <>
                            <td className="px-2 py-2 text-slate-400">{row._rowIndex}</td>
                            <td className="px-2 py-2 font-semibold text-slate-800">{row.lot_number || '-'}</td>
                            <td className="px-2 py-2 text-slate-500">{row.neighborhood_raw || selectedNbName || '-'}</td>
                            <td className="px-2 py-2">
                              <span className={`px-1.5 py-0.5 rounded font-medium text-xs ${row.category === 'titular' ? 'bg-blue-100 text-blue-700' : row.category === 'adherente' ? 'bg-orange-100 text-orange-700' : 'bg-slate-100 text-slate-700'}`}>
                                {CATEGORY_LABELS[row.category]}
                              </span>
                              {!parseCategory(row.category_raw) && row.category_raw && (
                                <span className="text-red-500 ml-1">({row.category_raw})</span>
                              )}
                            </td>
                            <td className="px-2 py-2 text-slate-400 italic">{row.full_name_raw}</td>
                            <td className="px-2 py-2 text-slate-700 font-medium">{row.last_name || '-'}</td>
                            <td className="px-2 py-2 text-slate-700">{row.first_name || '-'}</td>
                            <td className="px-2 py-2 text-slate-500">{row.dni || '-'}</td>
                            <td className="px-2 py-2 text-slate-500">{row.phone || '-'}</td>
                            <td className="px-2 py-2">
                              <span className={`px-1.5 py-0.5 rounded font-medium ${row.carnet_status === 'activo' ? 'bg-emerald-100 text-emerald-700' : 'bg-amber-100 text-amber-700'}`}>{row.carnet_status}</span>
                            </td>
                            <td className="px-2 py-2 text-center">{row.tenis ? <span className="text-emerald-600 font-bold">SI</span> : <span className="text-slate-300">-</span>}</td>
                            <td className="px-2 py-2 max-w-[140px]">
                              {row._errors.filter(e => !e.includes('Duplicado')).map((e, ei) => (
                                <span key={ei} className="block text-red-600">{e}</span>
                              ))}
                              {row._duplicate && <span className="text-amber-600">Duplicado</span>}
                            </td>
                            <td className="px-2 py-2">
                              <div className="flex gap-0.5">
                                <button onClick={() => startEdit(idx)} title="Editar" className="p-1 rounded hover:bg-blue-100 text-slate-400 hover:text-blue-600 transition-colors">
                                  <Edit2 size={11} />
                                </button>
                                <button onClick={() => toggleSkip(idx)} title={row._skip ? 'Incluir fila' : 'Excluir fila'} className={`p-1 rounded transition-colors ${row._skip ? 'text-emerald-600 hover:bg-emerald-50' : 'text-slate-400 hover:bg-red-50 hover:text-red-500'}`}>
                                  {row._skip ? <Check size={11} /> : <X size={11} />}
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
              <p className="text-slate-600 font-medium">Importando socios a la base de datos...</p>
            </div>
          )}

          {/* STEP: DONE */}
          {step === 'done' && (
            <div className="flex flex-col items-center justify-center py-16 gap-6">
              <div className="bg-emerald-100 p-4 rounded-full"><Check size={36} className="text-emerald-600" /></div>
              <h3 className="text-xl font-bold text-slate-800">Importación completada</h3>
              <div className="flex gap-8 text-center">
                <div><p className="text-3xl font-bold text-emerald-600">{importResult.created}</p><p className="text-sm text-slate-500">Creados</p></div>
                <div><p className="text-3xl font-bold text-amber-500">{importResult.skipped}</p><p className="text-sm text-slate-500">Omitidos</p></div>
                <div><p className="text-3xl font-bold text-red-500">{importResult.errors}</p><p className="text-sm text-slate-500">Errores</p></div>
              </div>
            </div>
          )}
        </div>

        {/* Footer */}
        <div className="flex justify-between items-center px-6 py-4 border-t border-slate-200 flex-shrink-0 bg-slate-50 rounded-b-2xl">
          <button onClick={step === 'done' ? onClose : onClose} className="px-4 py-2 border border-slate-200 rounded-lg text-slate-600 hover:bg-white text-sm font-medium transition-colors">
            {step === 'done' ? 'Cerrar' : 'Cancelar'}
          </button>
          <div className="flex gap-2">
            {step === 'neighborhood' && (
              <button onClick={() => setStep('preview')} disabled={!neighborhoodId} className="px-5 py-2 bg-emerald-600 text-white rounded-lg hover:bg-emerald-700 disabled:opacity-40 text-sm font-medium transition-colors flex items-center gap-2">
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
