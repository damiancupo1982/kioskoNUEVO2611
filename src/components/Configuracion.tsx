import { useState, useEffect } from 'react';
import { supabase, User, Configuration, Shift, CashTransaction } from '../lib/supabase';
import { Settings, Users, Building2, Plus, Edit, Trash2, Eye, EyeOff, Wallet } from 'lucide-react';

const SUPER_ADMIN_KEY = '842114';

type ConfigTab = 'general' | 'users' | 'cierres';

interface ShiftClosureSummary {
  shift: Shift;
  incomeCash: number;
  incomeTransfer: number;
  incomeQr: number;
  incomeExpensas: number;
  expenseCash: number;
  expenseTransfer: number;
  expenseQr: number;
  expenseExpensas: number;
  expectedCash: number;
  difference: number;
}

export default function Configuracion() {
  const [isAuthorized, setIsAuthorized] = useState(false);
  const [superKeyInput, setSuperKeyInput] = useState('');
  const [keyError, setKeyError] = useState('');

  const [activeTab, setActiveTab] = useState<ConfigTab>('general');
  const [users, setUsers] = useState<User[]>([]);
  const [config, setConfig] = useState<Configuration | null>(null);
  const [showUserModal, setShowUserModal] = useState(false);
  const [editingUser, setEditingUser] = useState<User | null>(null);
  const [showPassword, setShowPassword] = useState(false);
  const [userForm, setUserForm] = useState({
    username: '',
    password: '',
    full_name: '',
    role: 'vendedor' as 'admin' | 'vendedor'
  });

  const [closures, setClosures] = useState<ShiftClosureSummary[]>([]);
  const [loadingClosures, setLoadingClosures] = useState(false);

  // Solo carga datos si el súper admin se autenticó
  useEffect(() => {
    if (isAuthorized) {
      loadUsers();
      loadConfig();
      loadClosures();
    }
  }, [isAuthorized]);

  const loadUsers = async () => {
    const { data } = await supabase
      .from('users')
      .select('*')
      .order('created_at', { ascending: false });
    setUsers(data || []);
  };

  const loadConfig = async () => {
    const { data } = await supabase
      .from('configuration')
      .select('*')
      .maybeSingle();
    if (data) {
      setConfig(data);
    }
  };

  const loadClosures = async () => {
    setLoadingClosures(true);
    // Traemos últimos turnos cerrados
    const { data: shiftsData } = await supabase
      .from('shifts')
      .select('*')
      .eq('active', false)
      .order('start_date', { ascending: false })
      .limit(50);

    const shifts = (shiftsData || []) as Shift[];

    if (shifts.length === 0) {
      setClosures([]);
      setLoadingClosures(false);
      return;
    }

    const shiftIds = shifts.map((s) => s.id);
    const { data: txData } = await supabase
      .from('cash_transactions')
      .select('*')
      .in('shift_id', shiftIds);

    const txs = (txData || []) as CashTransaction[];

    const summaries: ShiftClosureSummary[] = shifts.map((shift) => {
      const byShift = txs.filter((t) => t.shift_id === shift.id);

      const incomeCash = byShift
        .filter((t) => t.type === 'income' && t.payment_method === 'efectivo')
        .reduce((sum, t) => sum + Number(t.amount), 0);
      const expenseCash = byShift
        .filter((t) => t.type === 'expense' && t.payment_method === 'efectivo')
        .reduce((sum, t) => sum + Number(t.amount), 0);

      const incomeTransfer = byShift
        .filter((t) => t.type === 'income' && t.payment_method === 'transferencia')
        .reduce((sum, t) => sum + Number(t.amount), 0);
      const expenseTransfer = byShift
        .filter((t) => t.type === 'expense' && t.payment_method === 'transferencia')
        .reduce((sum, t) => sum + Number(t.amount), 0);

      const incomeQr = byShift
        .filter((t) => t.type === 'income' && t.payment_method === 'qr')
        .reduce((sum, t) => sum + Number(t.amount), 0);
      const expenseQr = byShift
        .filter((t) => t.type === 'expense' && t.payment_method === 'qr')
        .reduce((sum, t) => sum + Number(t.amount), 0);

      const incomeExpensas = byShift
        .filter((t) => t.type === 'income' && t.payment_method === 'expensas')
        .reduce((sum, t) => sum + Number(t.amount), 0);
      const expenseExpensas = byShift
        .filter((t) => t.type === 'expense' && t.payment_method === 'expensas')
        .reduce((sum, t) => sum + Number(t.amount), 0);

      const openingCash = Number(shift.opening_cash || 0);
      const expectedCash = openingCash + incomeCash - expenseCash;
      const closingCash = Number(shift.closing_cash || 0);
      const difference = closingCash - expectedCash;

      return {
        shift,
        incomeCash,
        incomeTransfer,
        incomeQr,
        incomeExpensas,
        expenseCash,
        expenseTransfer,
        expenseQr,
        expenseExpensas,
        expectedCash,
        difference
      };
    });

    setClosures(summaries);
    setLoadingClosures(false);
  };

  const handleSaveUser = async (e: React.FormEvent) => {
    e.preventDefault();

    if (editingUser) {
      await supabase
        .from('users')
        .update({
          username: userForm.username,
          password: userForm.password,
          full_name: userForm.full_name,
          role: userForm.role,
          updated_at: new Date().toISOString()
        })
        .eq('id', editingUser.id);
    } else {
      await supabase.from('users').insert([userForm]);
    }

    loadUsers();
    setShowUserModal(false);
    setEditingUser(null);
    setUserForm({
      username: '',
      password: '',
      full_name: '',
      role: 'vendedor'
    });
  };

  const handleEditUser = (user: User) => {
    setEditingUser(user);
    setUserForm({
      username: user.username,
      password: user.password,
      full_name: user.full_name,
      role: user.role
    });
    setShowUserModal(true);
  };

  const handleDeleteUser = async (id: string) => {
    if (confirm('¿Estás seguro de eliminar este usuario?')) {
      await supabase.from('users').delete().eq('id', id);
      loadUsers();
    }
  };

  const handleSaveConfig = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!config) return;

    await supabase
      .from('configuration')
      .update({
        business_name: config.business_name,
        address: config.address,
        phone: config.phone,
        tax_id: config.tax_id,
        currency: config.currency,
        receipt_message: config.receipt_message,
        updated_at: new Date().toISOString()
      })
      .eq('id', config.id);

    alert('Configuración guardada correctamente');
    window.location.reload();
  };

  const handleSuperLogin = (e: React.FormEvent) => {
    e.preventDefault();
    if (superKeyInput.trim() === SUPER_ADMIN_KEY) {
      setIsAuthorized(true);
      setKeyError('');
      setSuperKeyInput('');
    } else {
      setKeyError('Clave incorrecta. No podés ingresar al módulo.');
    }
  };

  // Pantalla de clave de Súper Administrador
  if (!isAuthorized) {
    return (
      <div className="flex items-center justify-center min-h-[60vh]">
        <div className="bg-white rounded-2xl shadow-2xl p-8 w-full max-w-md border border-slate-200">
          <div className="flex items-center gap-3 mb-6">
            <div className="p-3 rounded-xl bg-gradient-to-r from-slate-700 to-slate-900 text-white">
              <Settings size={24} />
            </div>
            <div>
              <h2 className="text-xl font-bold text-slate-800">
                Acceso Súper Administrador
              </h2>
              <p className="text-sm text-slate-500">
                Ingresá la clave para acceder a la configuración del sistema.
              </p>
            </div>
          </div>

          <form onSubmit={handleSuperLogin} className="space-y-4">
            <div>
              <label className="block text-sm font-semibold text-slate-700 mb-2">
                Clave de Súper Administrador
              </label>
              <input
                type="password"
                value={superKeyInput}
                onChange={(e) => setSuperKeyInput(e.target.value)}
                className="w-full px-4 py-2.5 bg-slate-50 border border-slate-200 rounded-xl focus:ring-2 focus:ring-slate-700 focus:border-transparent"
                placeholder="••••••"
                autoFocus
              />
              {keyError && (
                <p className="text-sm text-red-600 mt-2">{keyError}</p>
              )}
            </div>

            <button
              type="submit"
              className="w-full bg-gradient-to-r from-slate-700 to-slate-900 hover:from-slate-800 hover:to-black text-white px-6 py-3 rounded-xl font-semibold shadow-lg transition-all"
            >
              Ingresar
            </button>
          </form>
        </div>
      </div>
    );
  }

  // Si la clave es correcta, se muestra el módulo completo
  return (
    <div className="space-y-6">
      {/* Tabs */}
      <div className="flex gap-2 bg-white rounded-xl p-2 shadow-lg">
        <button
          onClick={() => setActiveTab('general')}
          className={`flex-1 px-6 py-3 rounded-lg font-semibold transition-all flex items-center justify-center gap-2 ${
            activeTab === 'general'
              ? 'bg-gradient-to-r from-blue-500 to-cyan-600 text-white shadow-lg'
              : 'text-slate-600 hover:bg-slate-100'
          }`}
        >
          <Building2 size={20} />
          Datos del Negocio
        </button>
        <button
          onClick={() => setActiveTab('users')}
          className={`flex-1 px-6 py-3 rounded-lg font-semibold transition-all flex items-center justify-center gap-2 ${
            activeTab === 'users'
              ? 'bg-gradient-to-r from-purple-500 to-pink-600 text-white shadow-lg'
              : 'text-slate-600 hover:bg-slate-100'
          }`}
        >
          <Users size={20} />
          Usuarios
        </button>
        <button
          onClick={() => setActiveTab('cierres')}
          className={`flex-1 px-6 py-3 rounded-lg font-semibold transition-all flex items-center justify-center gap-2 ${
            activeTab === 'cierres'
              ? 'bg-gradient-to-r from-emerald-500 to-teal-600 text-white shadow-lg'
              : 'text-slate-600 hover:bg-slate-100'
          }`}
        >
          <Wallet size={20} />
          Cierres de Turno
        </button>
      </div>

      {/* TAB: GENERAL */}
      {activeTab === 'general' && config && (
        <div className="bg-white rounded-xl shadow-lg p-6">
          <h3 className="text-xl font-bold text-slate-800 mb-6 flex items-center gap-2">
            <Building2 className="text-blue-600" size={24} />
            Configuración General
          </h3>

          <form onSubmit={handleSaveConfig} className="space-y-4">
            <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
              <div>
                <label className="block text-sm font-semibold text-slate-700 mb-2">
                  Nombre del Negocio *
                </label>
                <input
                  type="text"
                  required
                  value={config.business_name}
                  onChange={(e) =>
                    setConfig({ ...config, business_name: e.target.value })
                  }
                  className="w-full px-4 py-2.5 bg-slate-50 border border-slate-200 rounded-xl focus:ring-2 focus:ring-blue-500"
                />
              </div>

              <div>
                <label className="block text-sm font-semibold text-slate-700 mb-2">
                  Teléfono
                </label>
                <input
                  type="text"
                  value={config.phone}
                  onChange={(e) =>
                    setConfig({ ...config, phone: e.target.value })
                  }
                  className="w-full px-4 py-2.5 bg-slate-50 border border-slate-200 rounded-xl focus:ring-2 focus:ring-blue-500"
                />
              </div>

              <div>
                <label className="block text-sm font-semibold text-slate-700 mb-2">
                  Dirección
                </label>
                <input
                  type="text"
                  value={config.address}
                  onChange={(e) =>
                    setConfig({ ...config, address: e.target.value })
                  }
                  className="w-full px-4 py-2.5 bg-slate-50 border border-slate-200 rounded-xl focus:ring-2 focus:ring-blue-500"
                />
              </div>

              <div>
                <label className="block text-sm font-semibold text-slate-700 mb-2">
                  CUIT/RUT
                </label>
                <input
                  type="text"
                  value={config.tax_id}
                  onChange={(e) =>
                    setConfig({ ...config, tax_id: e.target.value })
                  }
                  className="w-full px-4 py-2.5 bg-slate-50 border border-slate-200 rounded-xl focus:ring-2 focus:ring-blue-500"
                />
              </div>

              <div>
                <label className="block text-sm font-semibold text-slate-700 mb-2">
                  Símbolo de Moneda
                </label>
                <input
                  type="text"
                  value={config.currency}
                  onChange={(e) =>
                    setConfig({ ...config, currency: e.target.value })
                  }
                  className="w-full px-4 py-2.5 bg-slate-50 border border-slate-200 rounded-xl focus:ring-2 focus:ring-blue-500"
                />
              </div>
            </div>

            <div>
              <label className="block text-sm font-semibold text-slate-700 mb-2">
                Mensaje en Ticket
              </label>
              <textarea
                value={config.receipt_message}
                onChange={(e) =>
                  setConfig({ ...config, receipt_message: e.target.value })
                }
                rows={3}
                className="w-full px-4 py-2.5 bg-slate-50 border border-slate-200 rounded-xl focus:ring-2 focus:ring-blue-500"
              />
            </div>

            <button
              type="submit"
              className="w-full bg-gradient-to-r from-blue-500 to-cyan-600 hover:from-blue-600 hover:to-cyan-700 text-white px-6 py-3 rounded-xl font-semibold shadow-lg transition-all"
            >
              Guardar Configuración
            </button>
          </form>
        </div>
      )}

      {/* TAB: USUARIOS */}
      {activeTab === 'users' && (
        <>
          <div className="flex justify-between items-center">
            <h3 className="text-xl font-bold text-slate-800">
              Gestión de Usuarios
            </h3>
            <button
              onClick={() => {
                setEditingUser(null);
                setUserForm({
                  username: '',
                  password: '',
                  full_name: '',
                  role: 'vendedor'
                });
                setShowUserModal(true);
              }}
              className="bg-gradient-to-r from-purple-500 to-pink-600 hover:from-purple-600 hover:to-pink-700 text-white px-6 py-2.5 rounded-xl flex items-center gap-2 shadow-lg transition-all"
            >
              <Plus size={20} />
              Nuevo Usuario
            </button>
          </div>

          <div className="bg-white rounded-xl shadow-lg overflow-hidden">
            <table className="w-full">
              <thead className="bg-slate-100">
                <tr>
                  <th className="px-6 py-3 text-left text-xs font-semibold text-slate-600 uppercase">
                    Usuario
                  </th>
                  <th className="px-6 py-3 text-left text-xs font-semibold text-slate-600 uppercase">
                    Nombre Completo
                  </th>
                  <th className="px-6 py-3 text-left text-xs font-semibold text-slate-600 uppercase">
                    Rol
                  </th>
                  <th className="px-6 py-3 text-left text-xs font-semibold text-slate-600 uppercase">
                    Estado
                  </th>
                  <th className="px-6 py-3 text-left text-xs font-semibold text-slate-600 uppercase">
                    Acciones
                  </th>
                </tr>
              </thead>
              <tbody>
                {users.map((user) => (
                  <tr
                    key={user.id}
                    className="border-t border-slate-200 hover:bg-slate-50"
                  >
                    <td className="px-6 py-4 text-sm font-medium text-slate-700">
                      {user.username}
                    </td>
                    <td className="px-6 py-4 text-sm text-slate-700">
                      {user.full_name}
                    </td>
                    <td className="px-6 py-4 text-sm">
                      <span
                        className={`inline-block px-3 py-1 rounded-full text-xs font-medium ${
                          user.role === 'admin'
                            ? 'bg-purple-100 text-purple-700'
                            : 'bg-blue-100 text-blue-700'
                        }`}
                      >
                        {user.role === 'admin'
                          ? 'Administrador'
                          : 'Vendedor'}
                      </span>
                    </td>
                    <td className="px-6 py-4 text-sm">
                      <span
                        className={`inline-block px-3 py-1 rounded-full text-xs font-medium ${
                          user.active
                            ? 'bg-emerald-100 text-emerald-700'
                            : 'bg-red-100 text-red-700'
                        }`}
                      >
                        {user.active ? 'Activo' : 'Inactivo'}
                      </span>
                    </td>
                    <td className="px-6 py-4 text-sm">
                      <div className="flex gap-2">
                        <button
                          onClick={() => handleEditUser(user)}
                          className="p-2 text-blue-600 hover:bg-blue-50 rounded-lg transition-all"
                        >
                          <Edit size={18} />
                        </button>
                        <button
                          onClick={() => handleDeleteUser(user.id)}
                          className="p-2 text-red-600 hover:bg-red-50 rounded-lg transition-all"
                        >
                          <Trash2 size={18} />
                        </button>
                      </div>
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        </>
      )}

      {/* TAB: CIERRES DE TURNO */}
      {activeTab === 'cierres' && (
        <div className="bg-white rounded-xl shadow-lg p-6">
          <div className="flex justify-between items-center mb-4">
            <h3 className="text-xl font-bold text-slate-800 flex items-center gap-2">
              <Wallet className="text-emerald-600" size={24} />
              Cierres de Turno
            </h3>
            <button
              onClick={loadClosures}
              className="px-4 py-2 text-sm rounded-xl border border-slate-300 text-slate-700 hover:bg-slate-50"
            >
              Actualizar
            </button>
          </div>

          {loadingClosures ? (
            <p className="text-sm text-slate-500">Cargando cierres de turno...</p>
          ) : closures.length === 0 ? (
            <p className="text-sm text-slate-500">
              No hay cierres de turno registrados todavía.
            </p>
          ) : (
            <div className="bg-white rounded-xl shadow-inner overflow-x-auto border border-slate-200">
              <table className="min-w-full text-xs md:text-sm">
                <thead className="bg-slate-100">
                  <tr>
                    <th className="px-4 py-3 text-left font-semibold text-slate-600 uppercase">
                      Fecha Inicio
                    </th>
                    <th className="px-4 py-3 text-left font-semibold text-slate-600 uppercase">
                      Fecha Cierre
                    </th>
                    <th className="px-4 py-3 text-left font-semibold text-slate-600 uppercase">
                      Usuario
                    </th>
                    <th className="px-4 py-3 text-right font-semibold text-slate-600 uppercase">
                      Efectivo Inicial
                    </th>
                    <th className="px-4 py-3 text-right font-semibold text-emerald-700 uppercase">
                      Ing. Efvo
                    </th>
                    <th className="px-4 py-3 text-right font-semibold text-emerald-700 uppercase">
                      Ing. Transf
                    </th>
                    <th className="px-4 py-3 text-right font-semibold text-emerald-700 uppercase">
                      Ing. QR
                    </th>
                    <th className="px-4 py-3 text-right font-semibold text-emerald-700 uppercase">
                      Ing. Expensas
                    </th>
                    <th className="px-4 py-3 text-right font-semibold text-red-700 uppercase">
                      Egr. Efvo
                    </th>
                    <th className="px-4 py-3 text-right font-semibold text-red-700 uppercase">
                      Egr. Transf
                    </th>
                    <th className="px-4 py-3 text-right font-semibold text-red-700 uppercase">
                      Egr. QR
                    </th>
                    <th className="px-4 py-3 text-right font-semibold text-red-700 uppercase">
                      Egr. Expensas
                    </th>
                    <th className="px-4 py-3 text-right font-semibold text-slate-600 uppercase">
                      Efvo Final
                    </th>
                    <th className="px-4 py-3 text-right font-semibold text-slate-600 uppercase">
                      Diferencia
                    </th>
                    <th className="px-4 py-3 text-center font-semibold text-slate-600 uppercase">
                      Estado
                    </th>
                  </tr>
                </thead>
                <tbody>
                  {closures.map((c) => {
                    const start = new Date(c.shift.start_date);
                    const end = c.shift.end_date
                      ? new Date(c.shift.end_date)
                      : null;
                    const closingCash = Number(c.shift.closing_cash || 0);
                    const diff = c.difference;
                    const isOk = Math.abs(diff) < 0.01;

                    return (
                      <tr
                        key={c.shift.id}
                        className="border-t border-slate-200 hover:bg-slate-50"
                      >
                        <td className="px-4 py-3 text-slate-700 whitespace-nowrap">
                          {start.toLocaleString('es-AR', {
                            timeZone: 'America/Argentina/Buenos_Aires',
                            hour12: false
                          })}
                        </td>
                        <td className="px-4 py-3 text-slate-700 whitespace-nowrap">
                          {end ? end.toLocaleString('es-AR', {
                            timeZone: 'America/Argentina/Buenos_Aires',
                            hour12: false
                          }) : '-'}
                        </td>
                        <td className="px-4 py-3 text-slate-700 whitespace-nowrap">
                          {c.shift.user_name}
                        </td>
                        <td className="px-4 py-3 text-right text-slate-800">
                          ${Number(c.shift.opening_cash || 0).toFixed(2)}
                        </td>
                        <td className="px-4 py-3 text-right text-emerald-700">
                          ${c.incomeCash.toFixed(2)}
                        </td>
                        <td className="px-4 py-3 text-right text-emerald-700">
                          ${c.incomeTransfer.toFixed(2)}
                        </td>
                        <td className="px-4 py-3 text-right text-emerald-700">
                          ${c.incomeQr.toFixed(2)}
                        </td>
                        <td className="px-4 py-3 text-right text-emerald-700">
                          ${c.incomeExpensas.toFixed(2)}
                        </td>
                        <td className="px-4 py-3 text-right text-red-700">
                          ${c.expenseCash.toFixed(2)}
                        </td>
                        <td className="px-4 py-3 text-right text-red-700">
                          ${c.expenseTransfer.toFixed(2)}
                        </td>
                        <td className="px-4 py-3 text-right text-red-700">
                          ${c.expenseQr.toFixed(2)}
                        </td>
                        <td className="px-4 py-3 text-right text-red-700">
                          ${c.expenseExpensas.toFixed(2)}
                        </td>
                        <td className="px-4 py-3 text-right text-slate-800">
                          ${closingCash.toFixed(2)}
                        </td>
                        <td
                          className={`px-4 py-3 text-right font-semibold ${
                            isOk
                              ? 'text-emerald-600'
                              : diff > 0
                              ? 'text-blue-600'
                              : 'text-amber-700'
                          }`}
                        >
                          ${diff.toFixed(2)}
                        </td>
                        <td className="px-4 py-3 text-center">
                          {isOk ? (
                            <span className="inline-flex px-3 py-1 rounded-full text-[11px] font-semibold bg-emerald-100 text-emerald-700">
                              Caja OK
                            </span>
                          ) : (
                            <span className="inline-flex px-3 py-1 rounded-full text-[11px] font-semibold bg-amber-100 text-amber-700">
                              Diferencia
                            </span>
                          )}
                        </td>
                      </tr>
                    );
                  })}
                </tbody>
              </table>
            </div>
          )}
        </div>
      )}

      {/* MODAL USUARIO */}
      {showUserModal && (
        <div className="fixed inset-0 bg-black/60 backdrop-blur-sm flex items-center justify-center p-4 z-50">
          <div className="bg-white rounded-2xl max-w-md w-full shadow-2xl">
            <div className="bg-gradient-to-r from-purple-500 to-pink-600 p-6 rounded-t-2xl">
              <h3 className="text-2xl font-bold text-white">
                {editingUser ? 'Editar Usuario' : 'Nuevo Usuario'}
              </h3>
            </div>

            <form onSubmit={handleSaveUser} className="p-6 space-y-4">
              <div>
                <label className="block text-sm font-semibold text-slate-700 mb-2">
                  Usuario *
                </label>
                <input
                  type="text"
                  required
                  value={userForm.username}
                  onChange={(e) =>
                    setUserForm({ ...userForm, username: e.target.value })
                  }
                  className="w-full px-4 py-2.5 bg-slate-50 border border-slate-200 rounded-xl"
                />
              </div>

              <div>
                <label className="block text-sm font-semibold text-slate-700 mb-2">
                  Contraseña *
                </label>
                <div className="relative">
                  <input
                    type={showPassword ? 'text' : 'password'}
                    required
                    value={userForm.password}
                    onChange={(e) =>
                      setUserForm({ ...userForm, password: e.target.value })
                    }
                    className="w-full px-4 py-2.5 bg-slate-50 border border-slate-200 rounded-xl pr-12"
                  />
                  <button
                    type="button"
                    onClick={() => setShowPassword(!showPassword)}
                    className="absolute right-3 top-1/2 -translate-y-1/2 text-slate-400 hover:text-slate-600"
                  >
                    {showPassword ? <EyeOff size={20} /> : <Eye size={20} />}
                  </button>
                </div>
              </div>

              <div>
                <label className="block text-sm font-semibold text-slate-700 mb-2">
                  Nombre Completo *
                </label>
                <input
                  type="text"
                  required
                  value={userForm.full_name}
                  onChange={(e) =>
                    setUserForm({ ...userForm, full_name: e.target.value })
                  }
                  className="w-full px-4 py-2.5 bg-slate-50 border border-slate-200 rounded-xl"
                />
              </div>

              <div>
                <label className="block text-sm font-semibold text-slate-700 mb-2">
                  Rol *
                </label>
                <select
                  required
                  value={userForm.role}
                  onChange={(e) =>
                    setUserForm({
                      ...userForm,
                      role: e.target.value as 'admin' | 'vendedor'
                    })
                  }
                  className="w-full px-4 py-2.5 bg-slate-50 border border-slate-200 rounded-xl"
                >
                  <option value="vendedor">Vendedor</option>
                  <option value="admin">Administrador</option>
                </select>
              </div>

              <div className="flex gap-3 pt-4">
                <button
                  type="button"
                  onClick={() => {
                    setShowUserModal(false);
                    setEditingUser(null);
                  }}
                  className="flex-1 px-6 py-3 border-2 border-slate-300 text-slate-700 font-semibold rounded-xl hover:bg-slate-50"
                >
                  Cancelar
                </button>
                <button
                  type="submit"
                  className="flex-1 px-6 py-3 bg-gradient-to-r from-purple-500 to-pink-600 text-white font-semibold rounded-xl hover:from-purple-600 hover:to-pink-700 shadow-lg"
                >
                  Guardar
                </button>
              </div>
            </form>
          </div>
        </div>
      )}
    </div>
  );
}
