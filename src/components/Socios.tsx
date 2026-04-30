import { useState, useEffect, useCallback } from 'react';
import { Users, Plus, Search, Filter, FileText, DollarSign, Settings, CreditCard as Edit2, Trash2, UserPlus, X, Check, ChevronDown, Download, Printer, PauseCircle, PlayCircle, AlertCircle } from 'lucide-react';
import { supabase } from '../lib/supabase';
import type { Member, Neighborhood, CarnetPrices, MemberCategory, CarnetStatus } from '../lib/supabase';

type View = 'list' | 'report' | 'liquidacion' | 'prices';

const CATEGORY_LABELS: Record<MemberCategory, string> = {
  titular: 'Titular',
  familiar_1: 'Familiar 1',
  familiar_2: 'Familiar 2',
  familiar_3: 'Familiar 3',
  adherente: 'Familiar Adherente',
};

const CATEGORY_ORDER: MemberCategory[] = ['titular', 'familiar_1', 'familiar_2', 'familiar_3', 'adherente'];

interface LotGroup {
  lot_number: string;
  neighborhood_id: string | null;
  neighborhood_name: string;
  members: Member[];
}

interface MemberFormData {
  lot_number: string;
  neighborhood_id: string;
  first_name: string;
  last_name: string;
  dni: string;
  phone: string;
  email: string;
  category: MemberCategory;
  carnet_status: CarnetStatus;
}

const emptyForm = (): MemberFormData => ({
  lot_number: '',
  neighborhood_id: '',
  first_name: '',
  last_name: '',
  dni: '',
  phone: '',
  email: '',
  category: 'titular',
  carnet_status: 'activo',
});

function calcLotAmount(lotMembers: Member[], prices: CarnetPrices): number {
  const active = lotMembers.filter(m => m.carnet_status === 'activo');
  const hasTitular = active.some(m => m.category === 'titular');
  const hasFamiliar = active.some(m => ['familiar_1', 'familiar_2', 'familiar_3'].includes(m.category));
  const adherentCount = active.filter(m => m.category === 'adherente').length;

  if (!hasTitular) return 0;

  let base = hasFamiliar ? Number(prices.family_price) : Number(prices.individual_price);
  base += adherentCount * Number(prices.adherent_extra_price);
  return base;
}

export default function Socios() {
  const [view, setView] = useState<View>('list');
  const [members, setMembers] = useState<Member[]>([]);
  const [neighborhoods, setNeighborhoods] = useState<Neighborhood[]>([]);
  const [prices, setPrices] = useState<CarnetPrices | null>(null);
  const [loading, setLoading] = useState(true);

  // Filters
  const [searchName, setSearchName] = useState('');
  const [filterNeighborhood, setFilterNeighborhood] = useState('');
  const [filterLot, setFilterLot] = useState('');
  const [filterDni, setFilterDni] = useState('');
  const [filterCategory, setFilterCategory] = useState('');
  const [filterStatus, setFilterStatus] = useState('');

  // Modals
  const [showMemberForm, setShowMemberForm] = useState(false);
  const [editingMember, setEditingMember] = useState<Member | null>(null);
  const [formData, setFormData] = useState<MemberFormData>(emptyForm());
  const [formError, setFormError] = useState('');
  const [showNewNeighborhood, setShowNewNeighborhood] = useState(false);
  const [newNeighborhoodName, setNewNeighborhoodName] = useState('');
  const [deleteConfirm, setDeleteConfirm] = useState<Member | null>(null);

  // Prices form
  const [pricesForm, setPricesForm] = useState({ individual_price: '', family_price: '', adherent_extra_price: '' });

  // Report
  const [reportFilter, setReportFilter] = useState('');
  const [reportNeighborhood, setReportNeighborhood] = useState('');
  const [reportSort, setReportSort] = useState<'neighborhood' | 'last_name' | 'lot' | 'category'>('neighborhood');
  const [reportStatus, setReportStatus] = useState('');

  // Liquidacion
  const [liqNeighborhood, setLiqNeighborhood] = useState('');

  const loadData = useCallback(async () => {
    setLoading(true);
    const [{ data: membersData }, { data: nbData }, { data: pricesData }] = await Promise.all([
      supabase.from('members').select('*, neighborhood:neighborhoods(id,name,active,created_at)').order('created_at'),
      supabase.from('neighborhoods').select('*').eq('active', true).order('name'),
      supabase.from('carnet_prices').select('*').maybeSingle(),
    ]);
    setMembers((membersData as Member[]) || []);
    setNeighborhoods((nbData as Neighborhood[]) || []);
    setPrices(pricesData as CarnetPrices | null);
    if (pricesData) {
      setPricesForm({
        individual_price: String(pricesData.individual_price),
        family_price: String(pricesData.family_price),
        adherent_extra_price: String(pricesData.adherent_extra_price),
      });
    }
    setLoading(false);
  }, []);

  useEffect(() => { loadData(); }, [loadData]);

  const getNeighborhoodName = (id: string | null) => {
    if (!id) return '-';
    return neighborhoods.find(n => n.id === id)?.name || '-';
  };

  const getLotMembers = (lotNumber: string) =>
    members.filter(m => m.lot_number === lotNumber);

  const suggestCategory = (lotNumber: string): MemberCategory => {
    const lot = getLotMembers(lotNumber);
    if (!lot.some(m => m.category === 'familiar_1')) return 'familiar_1';
    if (!lot.some(m => m.category === 'familiar_2')) return 'familiar_2';
    if (!lot.some(m => m.category === 'familiar_3')) return 'familiar_3';
    return 'adherente';
  };

  const openAddMember = (prefillLot?: string) => {
    const f = emptyForm();
    if (prefillLot) {
      f.lot_number = prefillLot;
      f.category = suggestCategory(prefillLot);
      const titMember = getLotMembers(prefillLot).find(m => m.category === 'titular');
      if (titMember) f.neighborhood_id = titMember.neighborhood_id || '';
    }
    setFormData(f);
    setEditingMember(null);
    setFormError('');
    setShowMemberForm(true);
  };

  const openEditMember = (m: Member) => {
    setFormData({
      lot_number: m.lot_number,
      neighborhood_id: m.neighborhood_id || '',
      first_name: m.first_name,
      last_name: m.last_name,
      dni: m.dni,
      phone: m.phone,
      email: m.email,
      category: m.category,
      carnet_status: m.carnet_status,
    });
    setEditingMember(m);
    setFormError('');
    setShowMemberForm(true);
  };

  const validateForm = (): string => {
    if (!formData.lot_number.trim()) return 'El número de lote es obligatorio.';
    if (!formData.first_name.trim()) return 'El nombre es obligatorio.';
    if (!formData.last_name.trim()) return 'El apellido es obligatorio.';
    if (!formData.neighborhood_id) return 'Selecciona un barrio.';

    const lotMembers = getLotMembers(formData.lot_number).filter(m => !editingMember || m.id !== editingMember.id);

    if (formData.category === 'titular' && lotMembers.some(m => m.category === 'titular'))
      return 'Este lote ya tiene un Titular.';
    if (formData.category === 'familiar_1' && lotMembers.some(m => m.category === 'familiar_1'))
      return 'Este lote ya tiene un Familiar 1.';
    if (formData.category === 'familiar_2' && lotMembers.some(m => m.category === 'familiar_2'))
      return 'Este lote ya tiene un Familiar 2.';
    if (formData.category === 'familiar_3' && lotMembers.some(m => m.category === 'familiar_3'))
      return 'Este lote ya tiene un Familiar 3.';
    if (formData.category !== 'titular' && !lotMembers.some(m => m.category === 'titular'))
      return 'Primero debe existir un Titular para este lote.';
    return '';
  };

  const saveMember = async () => {
    const err = validateForm();
    if (err) { setFormError(err); return; }

    const payload = {
      lot_number: formData.lot_number.trim(),
      neighborhood_id: formData.neighborhood_id || null,
      first_name: formData.first_name.trim(),
      last_name: formData.last_name.trim(),
      dni: formData.dni.trim(),
      phone: formData.phone.trim(),
      email: formData.email.trim(),
      category: formData.category,
      carnet_status: formData.carnet_status,
      updated_at: new Date().toISOString(),
    };

    if (editingMember) {
      await supabase.from('members').update(payload).eq('id', editingMember.id);
    } else {
      await supabase.from('members').insert(payload);
    }
    setShowMemberForm(false);
    loadData();
  };

  const toggleCarnetStatus = async (m: Member) => {
    const newStatus: CarnetStatus = m.carnet_status === 'activo' ? 'pausado' : 'activo';
    await supabase.from('members').update({ carnet_status: newStatus, updated_at: new Date().toISOString() }).eq('id', m.id);
    loadData();
  };

  const deleteMember = async (m: Member) => {
    await supabase.from('members').delete().eq('id', m.id);
    setDeleteConfirm(null);
    loadData();
  };

  const addNeighborhood = async () => {
    if (!newNeighborhoodName.trim()) return;
    const { data } = await supabase.from('neighborhoods').insert({ name: newNeighborhoodName.trim() }).select().maybeSingle();
    setNewNeighborhoodName('');
    setShowNewNeighborhood(false);
    await loadData();
    if (data) setFormData(f => ({ ...f, neighborhood_id: (data as Neighborhood).id }));
  };

  const savePrices = async () => {
    const payload = {
      individual_price: Number(pricesForm.individual_price) || 0,
      family_price: Number(pricesForm.family_price) || 0,
      adherent_extra_price: Number(pricesForm.adherent_extra_price) || 0,
      updated_at: new Date().toISOString(),
    };
    if (prices) {
      await supabase.from('carnet_prices').update(payload).eq('id', prices.id);
    } else {
      await supabase.from('carnet_prices').insert(payload);
    }
    loadData();
    setView('list');
  };

  // ---- Filtered members ----
  const filteredMembers = members.filter(m => {
    const nbName = getNeighborhoodName(m.neighborhood_id).toLowerCase();
    const fullName = `${m.first_name} ${m.last_name}`.toLowerCase();
    if (searchName && !fullName.includes(searchName.toLowerCase()) && !m.last_name.toLowerCase().includes(searchName.toLowerCase())) return false;
    if (filterNeighborhood && m.neighborhood_id !== filterNeighborhood) return false;
    if (filterLot && !m.lot_number.toLowerCase().includes(filterLot.toLowerCase())) return false;
    if (filterDni && !m.dni.toLowerCase().includes(filterDni.toLowerCase())) return false;
    if (filterCategory && m.category !== filterCategory) return false;
    if (filterStatus && m.carnet_status !== filterStatus) return false;
    void nbName;
    return true;
  });

  // ---- Lot groups ----
  const buildLotGroups = (list: Member[]): LotGroup[] => {
    const map = new Map<string, LotGroup>();
    list.forEach(m => {
      const key = m.lot_number;
      if (!map.has(key)) {
        map.set(key, {
          lot_number: m.lot_number,
          neighborhood_id: m.neighborhood_id,
          neighborhood_name: getNeighborhoodName(m.neighborhood_id),
          members: [],
        });
      }
      map.get(key)!.members.push(m);
    });
    map.forEach(g => g.members.sort((a, b) => CATEGORY_ORDER.indexOf(a.category) - CATEGORY_ORDER.indexOf(b.category)));
    return Array.from(map.values());
  };

  const lotGroups = buildLotGroups(filteredMembers);
  lotGroups.sort((a, b) => a.neighborhood_name.localeCompare(b.neighborhood_name) || a.lot_number.localeCompare(b.lot_number));

  // ---- Report ----
  const reportMembers = members.filter(m => {
    if (reportFilter === 'titular' && m.category !== 'titular') return false;
    if (reportFilter === 'familiar' && !['familiar_1', 'familiar_2', 'familiar_3'].includes(m.category)) return false;
    if (reportFilter === 'adherente' && m.category !== 'adherente') return false;
    if (reportNeighborhood && m.neighborhood_id !== reportNeighborhood) return false;
    if (reportStatus && m.carnet_status !== reportStatus) return false;
    return true;
  });

  const sortedReport = [...reportMembers].sort((a, b) => {
    if (reportSort === 'neighborhood') return getNeighborhoodName(a.neighborhood_id).localeCompare(getNeighborhoodName(b.neighborhood_id));
    if (reportSort === 'last_name') return a.last_name.localeCompare(b.last_name);
    if (reportSort === 'lot') return a.lot_number.localeCompare(b.lot_number);
    if (reportSort === 'category') return CATEGORY_ORDER.indexOf(a.category) - CATEGORY_ORDER.indexOf(b.category);
    return 0;
  });

  // ---- Liquidacion ----
  const liqLots = buildLotGroups(members.filter(m => !liqNeighborhood || m.neighborhood_id === liqNeighborhood));
  liqLots.sort((a, b) => a.neighborhood_name.localeCompare(b.neighborhood_name) || a.lot_number.localeCompare(b.lot_number));
  const liqTotal = liqLots.reduce((s, g) => s + (prices ? calcLotAmount(g.members, prices) : 0), 0);

  const exportCSV = (rows: string[][], filename: string) => {
    const csv = rows.map(r => r.map(c => `"${c}"`).join(',')).join('\n');
    const blob = new Blob([csv], { type: 'text/csv;charset=utf-8;' });
    const url = URL.createObjectURL(blob);
    const a = document.createElement('a');
    a.href = url;
    a.download = filename;
    a.click();
    URL.revokeObjectURL(url);
  };

  const exportReportCSV = () => {
    const rows = [['Barrio', 'Lote', 'Apellido', 'Nombre', 'DNI', 'Teléfono', 'Email', 'Categoría', 'Estado']];
    sortedReport.forEach(m => rows.push([
      getNeighborhoodName(m.neighborhood_id), m.lot_number, m.last_name, m.first_name,
      m.dni, m.phone, m.email, CATEGORY_LABELS[m.category], m.carnet_status,
    ]));
    exportCSV(rows, 'reporte_socios.csv');
  };

  const exportLiqCSV = () => {
    const rows = [['Barrio', 'Lote', 'Monto']];
    liqLots.forEach(g => rows.push([g.neighborhood_name, g.lot_number, (prices ? calcLotAmount(g.members, prices) : 0).toFixed(2)]));
    exportCSV(rows, 'liquidacion_socios.csv');
  };

  const printView = () => window.print();

  if (loading) {
    return (
      <div className="flex items-center justify-center py-20">
        <div className="animate-spin rounded-full h-8 w-8 border-b-2 border-emerald-600"></div>
      </div>
    );
  }

  return (
    <div className="space-y-6">
      {/* Top nav */}
      <div className="flex flex-wrap gap-2">
        <button onClick={() => setView('list')} className={`flex items-center gap-2 px-4 py-2 rounded-lg text-sm font-medium transition-colors ${view === 'list' ? 'bg-emerald-600 text-white' : 'bg-slate-100 text-slate-600 hover:bg-slate-200'}`}>
          <Users size={16} /> Socios
        </button>
        <button onClick={() => setView('report')} className={`flex items-center gap-2 px-4 py-2 rounded-lg text-sm font-medium transition-colors ${view === 'report' ? 'bg-emerald-600 text-white' : 'bg-slate-100 text-slate-600 hover:bg-slate-200'}`}>
          <FileText size={16} /> Reporte
        </button>
        <button onClick={() => setView('liquidacion')} className={`flex items-center gap-2 px-4 py-2 rounded-lg text-sm font-medium transition-colors ${view === 'liquidacion' ? 'bg-emerald-600 text-white' : 'bg-slate-100 text-slate-600 hover:bg-slate-200'}`}>
          <DollarSign size={16} /> Liquidación
        </button>
        <button onClick={() => setView('prices')} className={`flex items-center gap-2 px-4 py-2 rounded-lg text-sm font-medium transition-colors ${view === 'prices' ? 'bg-emerald-600 text-white' : 'bg-slate-100 text-slate-600 hover:bg-slate-200'}`}>
          <Settings size={16} /> Precios
        </button>
      </div>

      {/* ===== LIST VIEW ===== */}
      {view === 'list' && (
        <div className="space-y-4">
          {/* Toolbar */}
          <div className="flex flex-wrap gap-3 items-center">
            <button onClick={() => openAddMember()} className="flex items-center gap-2 px-4 py-2 bg-emerald-600 text-white rounded-lg hover:bg-emerald-700 transition-colors text-sm font-medium">
              <Plus size={16} /> Agregar Socio
            </button>
          </div>

          {/* Filters */}
          <div className="bg-slate-50 rounded-xl p-4 border border-slate-200">
            <div className="flex items-center gap-2 mb-3 text-sm font-semibold text-slate-600">
              <Filter size={14} /> Filtros
            </div>
            <div className="grid grid-cols-2 md:grid-cols-3 lg:grid-cols-6 gap-3">
              <div className="relative">
                <Search size={14} className="absolute left-2.5 top-2.5 text-slate-400" />
                <input value={searchName} onChange={e => setSearchName(e.target.value)} placeholder="Nombre / Apellido" className="w-full pl-8 pr-3 py-2 text-sm border border-slate-200 rounded-lg focus:outline-none focus:ring-2 focus:ring-emerald-400" />
              </div>
              <select value={filterNeighborhood} onChange={e => setFilterNeighborhood(e.target.value)} className="px-3 py-2 text-sm border border-slate-200 rounded-lg focus:outline-none focus:ring-2 focus:ring-emerald-400">
                <option value="">Todos los barrios</option>
                {neighborhoods.map(n => <option key={n.id} value={n.id}>{n.name}</option>)}
              </select>
              <input value={filterLot} onChange={e => setFilterLot(e.target.value)} placeholder="N° Lote" className="px-3 py-2 text-sm border border-slate-200 rounded-lg focus:outline-none focus:ring-2 focus:ring-emerald-400" />
              <input value={filterDni} onChange={e => setFilterDni(e.target.value)} placeholder="DNI" className="px-3 py-2 text-sm border border-slate-200 rounded-lg focus:outline-none focus:ring-2 focus:ring-emerald-400" />
              <select value={filterCategory} onChange={e => setFilterCategory(e.target.value)} className="px-3 py-2 text-sm border border-slate-200 rounded-lg focus:outline-none focus:ring-2 focus:ring-emerald-400">
                <option value="">Todas las categorías</option>
                {CATEGORY_ORDER.map(c => <option key={c} value={c}>{CATEGORY_LABELS[c]}</option>)}
              </select>
              <select value={filterStatus} onChange={e => setFilterStatus(e.target.value)} className="px-3 py-2 text-sm border border-slate-200 rounded-lg focus:outline-none focus:ring-2 focus:ring-emerald-400">
                <option value="">Todos los estados</option>
                <option value="activo">Activo</option>
                <option value="pausado">Pausado</option>
              </select>
            </div>
          </div>

          {/* Summary */}
          <div className="flex gap-4 text-sm text-slate-500">
            <span className="font-medium text-slate-700">{filteredMembers.length} socios</span>
            <span>{lotGroups.length} lotes</span>
            <span className="text-emerald-600">{filteredMembers.filter(m => m.carnet_status === 'activo').length} activos</span>
            <span className="text-amber-600">{filteredMembers.filter(m => m.carnet_status === 'pausado').length} pausados</span>
          </div>

          {/* Lot groups */}
          {lotGroups.length === 0 ? (
            <div className="text-center py-16 text-slate-400">
              <Users size={48} className="mx-auto mb-3 opacity-30" />
              <p className="text-lg font-medium">No hay socios registrados</p>
              <p className="text-sm">Comienza agregando el primer socio</p>
            </div>
          ) : (
            <div className="space-y-4">
              {lotGroups.map(group => (
                <div key={group.lot_number} className="border border-slate-200 rounded-xl overflow-hidden">
                  <div className="bg-slate-50 px-4 py-3 flex items-center justify-between border-b border-slate-200">
                    <div className="flex items-center gap-3">
                      <span className="bg-emerald-100 text-emerald-800 text-xs font-bold px-2 py-1 rounded-lg">Lote {group.lot_number}</span>
                      <span className="text-sm text-slate-600">{group.neighborhood_name}</span>
                    </div>
                    <button onClick={() => openAddMember(group.lot_number)} className="flex items-center gap-1.5 text-xs text-emerald-600 hover:text-emerald-700 font-medium px-3 py-1.5 rounded-lg hover:bg-emerald-50 transition-colors border border-emerald-200">
                      <UserPlus size={13} /> Agregar Familiar
                    </button>
                  </div>
                  <div className="divide-y divide-slate-100">
                    {group.members.map(m => (
                      <div key={m.id} className="px-4 py-3 flex items-center justify-between hover:bg-slate-50 transition-colors">
                        <div className="flex items-center gap-3 min-w-0">
                          <div className={`w-2 h-2 rounded-full flex-shrink-0 ${m.carnet_status === 'activo' ? 'bg-emerald-500' : 'bg-amber-400'}`}></div>
                          <div className="min-w-0">
                            <p className="font-semibold text-slate-800 text-sm truncate">{m.last_name}, {m.first_name}</p>
                            <div className="flex flex-wrap gap-x-3 gap-y-0.5 text-xs text-slate-500">
                              <span className="bg-slate-100 text-slate-600 px-1.5 py-0.5 rounded font-medium">{CATEGORY_LABELS[m.category]}</span>
                              {m.dni && <span>DNI: {m.dni}</span>}
                              {m.phone && <span>{m.phone}</span>}
                              {m.email && <span className="hidden md:inline truncate max-w-[160px]">{m.email}</span>}
                            </div>
                          </div>
                        </div>
                        <div className="flex items-center gap-1 flex-shrink-0">
                          <span className={`text-xs px-2 py-0.5 rounded-full font-medium ${m.carnet_status === 'activo' ? 'bg-emerald-100 text-emerald-700' : 'bg-amber-100 text-amber-700'}`}>
                            {m.carnet_status === 'activo' ? 'Activo' : 'Pausado'}
                          </span>
                          <button onClick={() => toggleCarnetStatus(m)} title={m.carnet_status === 'activo' ? 'Pausar' : 'Activar'} className="p-1.5 rounded-lg hover:bg-slate-100 text-slate-500 hover:text-slate-700 transition-colors">
                            {m.carnet_status === 'activo' ? <PauseCircle size={16} /> : <PlayCircle size={16} />}
                          </button>
                          <button onClick={() => openEditMember(m)} className="p-1.5 rounded-lg hover:bg-blue-50 text-slate-500 hover:text-blue-600 transition-colors">
                            <Edit2 size={16} />
                          </button>
                          <button onClick={() => setDeleteConfirm(m)} className="p-1.5 rounded-lg hover:bg-red-50 text-slate-500 hover:text-red-600 transition-colors">
                            <Trash2 size={16} />
                          </button>
                        </div>
                      </div>
                    ))}
                  </div>
                </div>
              ))}
            </div>
          )}
        </div>
      )}

      {/* ===== REPORT VIEW ===== */}
      {view === 'report' && (
        <div className="space-y-4">
          <div className="flex flex-wrap gap-2 items-center justify-between">
            <h3 className="text-lg font-bold text-slate-800">Reporte de Socios</h3>
            <div className="flex gap-2">
              <button onClick={exportReportCSV} className="flex items-center gap-1.5 px-3 py-2 bg-slate-100 text-slate-600 rounded-lg hover:bg-slate-200 text-sm font-medium transition-colors">
                <Download size={14} /> CSV
              </button>
              <button onClick={printView} className="flex items-center gap-1.5 px-3 py-2 bg-slate-100 text-slate-600 rounded-lg hover:bg-slate-200 text-sm font-medium transition-colors">
                <Printer size={14} /> Imprimir
              </button>
            </div>
          </div>

          <div className="bg-slate-50 rounded-xl p-4 border border-slate-200">
            <div className="grid grid-cols-2 md:grid-cols-4 gap-3">
              <select value={reportFilter} onChange={e => setReportFilter(e.target.value)} className="px-3 py-2 text-sm border border-slate-200 rounded-lg focus:outline-none focus:ring-2 focus:ring-emerald-400">
                <option value="">Todos los socios</option>
                <option value="titular">Solo titulares</option>
                <option value="familiar">Solo familiares</option>
                <option value="adherente">Solo adherentes</option>
              </select>
              <select value={reportNeighborhood} onChange={e => setReportNeighborhood(e.target.value)} className="px-3 py-2 text-sm border border-slate-200 rounded-lg focus:outline-none focus:ring-2 focus:ring-emerald-400">
                <option value="">Todos los barrios</option>
                {neighborhoods.map(n => <option key={n.id} value={n.id}>{n.name}</option>)}
              </select>
              <select value={reportStatus} onChange={e => setReportStatus(e.target.value)} className="px-3 py-2 text-sm border border-slate-200 rounded-lg focus:outline-none focus:ring-2 focus:ring-emerald-400">
                <option value="">Todos los estados</option>
                <option value="activo">Activo</option>
                <option value="pausado">Pausado</option>
              </select>
              <select value={reportSort} onChange={e => setReportSort(e.target.value as typeof reportSort)} className="px-3 py-2 text-sm border border-slate-200 rounded-lg focus:outline-none focus:ring-2 focus:ring-emerald-400">
                <option value="neighborhood">Ordenar por Barrio</option>
                <option value="last_name">Ordenar por Apellido</option>
                <option value="lot">Ordenar por Lote</option>
                <option value="category">Ordenar por Categoría</option>
              </select>
            </div>
          </div>

          <p className="text-sm text-slate-500">{sortedReport.length} registros</p>

          <div className="overflow-x-auto rounded-xl border border-slate-200">
            <table className="w-full text-sm">
              <thead className="bg-slate-50 border-b border-slate-200">
                <tr>
                  {['Barrio', 'Lote', 'Apellido', 'Nombre', 'DNI', 'Teléfono', 'Email', 'Categoría', 'Estado'].map(h => (
                    <th key={h} className="px-4 py-3 text-left text-xs font-semibold text-slate-600 uppercase tracking-wide">{h}</th>
                  ))}
                </tr>
              </thead>
              <tbody className="divide-y divide-slate-100">
                {sortedReport.map(m => (
                  <tr key={m.id} className="hover:bg-slate-50 transition-colors">
                    <td className="px-4 py-3 text-slate-700">{getNeighborhoodName(m.neighborhood_id)}</td>
                    <td className="px-4 py-3 font-medium text-slate-800">{m.lot_number}</td>
                    <td className="px-4 py-3 font-medium text-slate-800">{m.last_name}</td>
                    <td className="px-4 py-3 text-slate-700">{m.first_name}</td>
                    <td className="px-4 py-3 text-slate-600">{m.dni || '-'}</td>
                    <td className="px-4 py-3 text-slate-600">{m.phone || '-'}</td>
                    <td className="px-4 py-3 text-slate-600 max-w-[160px] truncate">{m.email || '-'}</td>
                    <td className="px-4 py-3">
                      <span className="bg-slate-100 text-slate-700 text-xs px-2 py-0.5 rounded-full font-medium">{CATEGORY_LABELS[m.category]}</span>
                    </td>
                    <td className="px-4 py-3">
                      <span className={`text-xs px-2 py-0.5 rounded-full font-medium ${m.carnet_status === 'activo' ? 'bg-emerald-100 text-emerald-700' : 'bg-amber-100 text-amber-700'}`}>
                        {m.carnet_status === 'activo' ? 'Activo' : 'Pausado'}
                      </span>
                    </td>
                  </tr>
                ))}
                {sortedReport.length === 0 && (
                  <tr><td colSpan={9} className="px-4 py-12 text-center text-slate-400">Sin resultados para los filtros seleccionados</td></tr>
                )}
              </tbody>
            </table>
          </div>
        </div>
      )}

      {/* ===== LIQUIDACION VIEW ===== */}
      {view === 'liquidacion' && (
        <div className="space-y-4">
          <div className="flex flex-wrap gap-2 items-center justify-between">
            <h3 className="text-lg font-bold text-slate-800">Liquidación de Carnets</h3>
            <div className="flex gap-2">
              <button onClick={exportLiqCSV} className="flex items-center gap-1.5 px-3 py-2 bg-slate-100 text-slate-600 rounded-lg hover:bg-slate-200 text-sm font-medium transition-colors">
                <Download size={14} /> CSV
              </button>
              <button onClick={printView} className="flex items-center gap-1.5 px-3 py-2 bg-slate-100 text-slate-600 rounded-lg hover:bg-slate-200 text-sm font-medium transition-colors">
                <Printer size={14} /> Imprimir
              </button>
            </div>
          </div>

          {!prices || (prices.individual_price === 0 && prices.family_price === 0) ? (
            <div className="bg-amber-50 border border-amber-200 rounded-xl p-4 flex items-center gap-3 text-amber-700 text-sm">
              <AlertCircle size={18} />
              <span>Los precios de carnet están en $0. <button onClick={() => setView('prices')} className="underline font-medium">Configurar precios</button></span>
            </div>
          ) : null}

          <div className="flex gap-3 items-center">
            <select value={liqNeighborhood} onChange={e => setLiqNeighborhood(e.target.value)} className="px-3 py-2 text-sm border border-slate-200 rounded-lg focus:outline-none focus:ring-2 focus:ring-emerald-400">
              <option value="">Todos los barrios</option>
              {neighborhoods.map(n => <option key={n.id} value={n.id}>{n.name}</option>)}
            </select>
          </div>

          {prices && (
            <div className="bg-slate-50 border border-slate-200 rounded-xl p-3 flex flex-wrap gap-4 text-sm text-slate-600">
              <span>Individual: <strong className="text-slate-800">${Number(prices.individual_price).toFixed(2)}</strong></span>
              <span>Familiar: <strong className="text-slate-800">${Number(prices.family_price).toFixed(2)}</strong></span>
              <span>Adherente extra: <strong className="text-slate-800">${Number(prices.adherent_extra_price).toFixed(2)}</strong></span>
            </div>
          )}

          <div className="overflow-x-auto rounded-xl border border-slate-200">
            <table className="w-full text-sm">
              <thead className="bg-slate-50 border-b border-slate-200">
                <tr>
                  <th className="px-4 py-3 text-left text-xs font-semibold text-slate-600 uppercase tracking-wide">Barrio</th>
                  <th className="px-4 py-3 text-left text-xs font-semibold text-slate-600 uppercase tracking-wide">Lote</th>
                  <th className="px-4 py-3 text-left text-xs font-semibold text-slate-600 uppercase tracking-wide">Detalle</th>
                  <th className="px-4 py-3 text-right text-xs font-semibold text-slate-600 uppercase tracking-wide">Monto</th>
                </tr>
              </thead>
              <tbody className="divide-y divide-slate-100">
                {liqLots.map(g => {
                  const amount = prices ? calcLotAmount(g.members, prices) : 0;
                  const active = g.members.filter(m => m.carnet_status === 'activo');
                  const hasFamiliar = active.some(m => ['familiar_1', 'familiar_2', 'familiar_3'].includes(m.category));
                  const adherentCount = active.filter(m => m.category === 'adherente').length;
                  const typeLabel = hasFamiliar ? 'Familiar' : 'Individual';
                  return (
                    <tr key={g.lot_number} className="hover:bg-slate-50 transition-colors">
                      <td className="px-4 py-3 text-slate-700">{g.neighborhood_name}</td>
                      <td className="px-4 py-3 font-medium text-slate-800">{g.lot_number}</td>
                      <td className="px-4 py-3 text-slate-500 text-xs">
                        {typeLabel}{adherentCount > 0 ? ` + ${adherentCount} adherente${adherentCount > 1 ? 's' : ''}` : ''}
                      </td>
                      <td className="px-4 py-3 text-right font-semibold text-slate-800">${amount.toFixed(2)}</td>
                    </tr>
                  );
                })}
                {liqLots.length === 0 && (
                  <tr><td colSpan={4} className="px-4 py-12 text-center text-slate-400">Sin datos</td></tr>
                )}
              </tbody>
              <tfoot className="bg-slate-50 border-t-2 border-slate-300">
                <tr>
                  <td colSpan={3} className="px-4 py-3 font-bold text-slate-700">Total</td>
                  <td className="px-4 py-3 text-right font-bold text-emerald-700 text-base">${liqTotal.toFixed(2)}</td>
                </tr>
              </tfoot>
            </table>
          </div>
        </div>
      )}

      {/* ===== PRICES VIEW ===== */}
      {view === 'prices' && (
        <div className="max-w-md space-y-6">
          <h3 className="text-lg font-bold text-slate-800">Configuración de Precios de Carnet</h3>
          <div className="space-y-4">
            <div>
              <label className="block text-sm font-semibold text-slate-700 mb-1">Precio Carnet Individual</label>
              <p className="text-xs text-slate-500 mb-2">Lote con solo un titular activo</p>
              <input type="number" min="0" step="0.01" value={pricesForm.individual_price} onChange={e => setPricesForm(f => ({ ...f, individual_price: e.target.value }))} className="w-full px-4 py-2.5 border border-slate-200 rounded-lg focus:outline-none focus:ring-2 focus:ring-emerald-400 text-sm" />
            </div>
            <div>
              <label className="block text-sm font-semibold text-slate-700 mb-1">Precio Carnet Familiar</label>
              <p className="text-xs text-slate-500 mb-2">Lote con titular y al menos un familiar (no adherente)</p>
              <input type="number" min="0" step="0.01" value={pricesForm.family_price} onChange={e => setPricesForm(f => ({ ...f, family_price: e.target.value }))} className="w-full px-4 py-2.5 border border-slate-200 rounded-lg focus:outline-none focus:ring-2 focus:ring-emerald-400 text-sm" />
            </div>
            <div>
              <label className="block text-sm font-semibold text-slate-700 mb-1">Precio Extra por Familiar Adherente</label>
              <p className="text-xs text-slate-500 mb-2">Se suma por cada adherente activo en el lote</p>
              <input type="number" min="0" step="0.01" value={pricesForm.adherent_extra_price} onChange={e => setPricesForm(f => ({ ...f, adherent_extra_price: e.target.value }))} className="w-full px-4 py-2.5 border border-slate-200 rounded-lg focus:outline-none focus:ring-2 focus:ring-emerald-400 text-sm" />
            </div>
          </div>
          <div className="bg-slate-50 rounded-xl p-4 border border-slate-200 text-sm text-slate-600 space-y-1">
            <p className="font-semibold text-slate-700 mb-2">Ejemplos de cálculo:</p>
            <p>Solo titular activo → Carnet individual</p>
            <p>Titular + Familiar 1 → Carnet familiar</p>
            <p>Titular + 1 adherente → Carnet individual + extra</p>
            <p>Titular + Familiar 1 + 1 adherente → Carnet familiar + extra</p>
          </div>
          <button onClick={savePrices} className="w-full py-2.5 bg-emerald-600 text-white rounded-lg hover:bg-emerald-700 font-medium transition-colors flex items-center justify-center gap-2">
            <Check size={16} /> Guardar Precios
          </button>
        </div>
      )}

      {/* ===== MEMBER FORM MODAL ===== */}
      {showMemberForm && (
        <div className="fixed inset-0 bg-black/50 z-50 flex items-center justify-center p-4" onClick={e => e.target === e.currentTarget && setShowMemberForm(false)}>
          <div className="bg-white rounded-2xl shadow-2xl w-full max-w-lg max-h-[90vh] overflow-y-auto">
            <div className="flex items-center justify-between p-6 border-b border-slate-200">
              <h3 className="text-lg font-bold text-slate-800">{editingMember ? 'Editar Socio' : 'Nuevo Socio'}</h3>
              <button onClick={() => setShowMemberForm(false)} className="p-1.5 rounded-lg hover:bg-slate-100 text-slate-500 transition-colors"><X size={18} /></button>
            </div>
            <div className="p-6 space-y-4">
              {/* Barrio */}
              <div>
                <label className="block text-sm font-semibold text-slate-700 mb-1">Barrio <span className="text-red-500">*</span></label>
                <div className="flex gap-2">
                  <select value={formData.neighborhood_id} onChange={e => setFormData(f => ({ ...f, neighborhood_id: e.target.value }))} className="flex-1 px-3 py-2 text-sm border border-slate-200 rounded-lg focus:outline-none focus:ring-2 focus:ring-emerald-400">
                    <option value="">Seleccionar barrio</option>
                    {neighborhoods.map(n => <option key={n.id} value={n.id}>{n.name}</option>)}
                  </select>
                  <button onClick={() => setShowNewNeighborhood(true)} className="px-3 py-2 text-sm bg-slate-100 text-slate-600 rounded-lg hover:bg-slate-200 transition-colors flex items-center gap-1">
                    <Plus size={14} /> Nuevo
                  </button>
                </div>
                {showNewNeighborhood && (
                  <div className="mt-2 flex gap-2">
                    <input autoFocus value={newNeighborhoodName} onChange={e => setNewNeighborhoodName(e.target.value)} onKeyDown={e => e.key === 'Enter' && addNeighborhood()} placeholder="Nombre del barrio" className="flex-1 px-3 py-2 text-sm border border-slate-200 rounded-lg focus:outline-none focus:ring-2 focus:ring-emerald-400" />
                    <button onClick={addNeighborhood} className="px-3 py-2 bg-emerald-600 text-white rounded-lg hover:bg-emerald-700 text-sm transition-colors"><Check size={14} /></button>
                    <button onClick={() => setShowNewNeighborhood(false)} className="px-3 py-2 bg-slate-100 text-slate-600 rounded-lg hover:bg-slate-200 text-sm transition-colors"><X size={14} /></button>
                  </div>
                )}
              </div>

              {/* Lote */}
              <div>
                <label className="block text-sm font-semibold text-slate-700 mb-1">Número de Lote <span className="text-red-500">*</span></label>
                <input value={formData.lot_number} onChange={e => setFormData(f => ({ ...f, lot_number: e.target.value }))} placeholder="Ej: 42" className="w-full px-3 py-2 text-sm border border-slate-200 rounded-lg focus:outline-none focus:ring-2 focus:ring-emerald-400" />
              </div>

              {/* Nombre y Apellido */}
              <div className="grid grid-cols-2 gap-3">
                <div>
                  <label className="block text-sm font-semibold text-slate-700 mb-1">Nombre <span className="text-red-500">*</span></label>
                  <input value={formData.first_name} onChange={e => setFormData(f => ({ ...f, first_name: e.target.value }))} placeholder="Nombre" className="w-full px-3 py-2 text-sm border border-slate-200 rounded-lg focus:outline-none focus:ring-2 focus:ring-emerald-400" />
                </div>
                <div>
                  <label className="block text-sm font-semibold text-slate-700 mb-1">Apellido <span className="text-red-500">*</span></label>
                  <input value={formData.last_name} onChange={e => setFormData(f => ({ ...f, last_name: e.target.value }))} placeholder="Apellido" className="w-full px-3 py-2 text-sm border border-slate-200 rounded-lg focus:outline-none focus:ring-2 focus:ring-emerald-400" />
                </div>
              </div>

              {/* DNI */}
              <div>
                <label className="block text-sm font-semibold text-slate-700 mb-1">DNI</label>
                <input value={formData.dni} onChange={e => setFormData(f => ({ ...f, dni: e.target.value }))} placeholder="12345678" className="w-full px-3 py-2 text-sm border border-slate-200 rounded-lg focus:outline-none focus:ring-2 focus:ring-emerald-400" />
              </div>

              {/* Teléfono y Email */}
              <div className="grid grid-cols-2 gap-3">
                <div>
                  <label className="block text-sm font-semibold text-slate-700 mb-1">Teléfono</label>
                  <input value={formData.phone} onChange={e => setFormData(f => ({ ...f, phone: e.target.value }))} placeholder="11 1234-5678" className="w-full px-3 py-2 text-sm border border-slate-200 rounded-lg focus:outline-none focus:ring-2 focus:ring-emerald-400" />
                </div>
                <div>
                  <label className="block text-sm font-semibold text-slate-700 mb-1">Email</label>
                  <input type="email" value={formData.email} onChange={e => setFormData(f => ({ ...f, email: e.target.value }))} placeholder="mail@ejemplo.com" className="w-full px-3 py-2 text-sm border border-slate-200 rounded-lg focus:outline-none focus:ring-2 focus:ring-emerald-400" />
                </div>
              </div>

              {/* Categoría */}
              <div>
                <label className="block text-sm font-semibold text-slate-700 mb-1">
                  Categoría <span className="text-red-500">*</span>
                  <span className="ml-2 text-xs font-normal text-slate-400 flex items-center gap-1 inline-flex"><ChevronDown size={10} /></span>
                </label>
                <select value={formData.category} onChange={e => setFormData(f => ({ ...f, category: e.target.value as MemberCategory }))} className="w-full px-3 py-2 text-sm border border-slate-200 rounded-lg focus:outline-none focus:ring-2 focus:ring-emerald-400">
                  {CATEGORY_ORDER.map(c => <option key={c} value={c}>{CATEGORY_LABELS[c]}</option>)}
                </select>
              </div>

              {/* Estado */}
              <div>
                <label className="block text-sm font-semibold text-slate-700 mb-1">Estado del Carnet</label>
                <div className="flex gap-3">
                  {(['activo', 'pausado'] as CarnetStatus[]).map(s => (
                    <button key={s} onClick={() => setFormData(f => ({ ...f, carnet_status: s }))} className={`flex-1 py-2 rounded-lg text-sm font-medium border transition-colors ${formData.carnet_status === s ? (s === 'activo' ? 'bg-emerald-600 text-white border-emerald-600' : 'bg-amber-500 text-white border-amber-500') : 'bg-white text-slate-600 border-slate-200 hover:bg-slate-50'}`}>
                      {s === 'activo' ? 'Activo' : 'Pausado'}
                    </button>
                  ))}
                </div>
              </div>

              {formError && (
                <div className="flex items-center gap-2 text-red-600 bg-red-50 border border-red-200 rounded-lg px-4 py-3 text-sm">
                  <AlertCircle size={16} /> {formError}
                </div>
              )}
            </div>
            <div className="p-6 pt-0 flex gap-3">
              <button onClick={() => setShowMemberForm(false)} className="flex-1 py-2.5 border border-slate-200 rounded-lg text-slate-600 hover:bg-slate-50 font-medium text-sm transition-colors">
                Cancelar
              </button>
              <button onClick={saveMember} className="flex-1 py-2.5 bg-emerald-600 text-white rounded-lg hover:bg-emerald-700 font-medium text-sm transition-colors flex items-center justify-center gap-2">
                <Check size={16} /> {editingMember ? 'Guardar Cambios' : 'Crear Socio'}
              </button>
            </div>
          </div>
        </div>
      )}

      {/* ===== DELETE CONFIRM MODAL ===== */}
      {deleteConfirm && (
        <div className="fixed inset-0 bg-black/50 z-50 flex items-center justify-center p-4">
          <div className="bg-white rounded-2xl shadow-2xl w-full max-w-sm p-6 space-y-4">
            <div className="flex items-center gap-3 text-red-600">
              <Trash2 size={24} />
              <h3 className="text-lg font-bold">Eliminar Socio</h3>
            </div>
            <p className="text-slate-600 text-sm">
              ¿Estás seguro de eliminar a <strong>{deleteConfirm.last_name}, {deleteConfirm.first_name}</strong>? Esta acción no se puede deshacer.
            </p>
            <div className="flex gap-3">
              <button onClick={() => setDeleteConfirm(null)} className="flex-1 py-2.5 border border-slate-200 rounded-lg text-slate-600 hover:bg-slate-50 font-medium text-sm transition-colors">
                Cancelar
              </button>
              <button onClick={() => deleteMember(deleteConfirm)} className="flex-1 py-2.5 bg-red-600 text-white rounded-lg hover:bg-red-700 font-medium text-sm transition-colors">
                Eliminar
              </button>
            </div>
          </div>
        </div>
      )}
    </div>
  );
}
