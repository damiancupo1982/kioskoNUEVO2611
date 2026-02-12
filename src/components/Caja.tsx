import { useState, useEffect, useCallback } from 'react';
import { supabase, Shift, CashTransaction, Sale } from '../lib/supabase';
import { Wallet, Plus, DollarSign, TrendingUp, TrendingDown, LogOut, Clock, Calendar, X, Download, ShoppingCart } from 'lucide-react';

interface CajaProps {
  shift: Shift | null;
  onCloseShift: (closingCash: number) => void;
}

type PeriodType = 'today' | 'week' | 'month' | 'previous_month' | 'all' | 'custom';

export default function Caja({ shift, onCloseShift }: CajaProps) {
  const [transactions, setTransactions] = useState<CashTransaction[]>([]);
  const [monthTransactions, setMonthTransactions] = useState<CashTransaction[]>([]);
  const [showModal, setShowModal] = useState(false);
  const [showCloseModal, setShowCloseModal] = useState(false);
  const [showCustomDateModal, setShowCustomDateModal] = useState(false);
  const [showDetailModal, setShowDetailModal] = useState(false);
  const [closingCash, setClosingCash] = useState('');
  const [selectedPeriod, setSelectedPeriod] = useState<PeriodType>('today');
  const [customDateFrom, setCustomDateFrom] = useState('');
  const [customDateTo, setCustomDateTo] = useState('');
  const [selectedTransaction, setSelectedTransaction] = useState<CashTransaction | null>(null);
  const [relatedSale, setRelatedSale] = useState<Sale | null>(null);
  const [formData, setFormData] = useState({
    type: 'income' as 'income' | 'expense',
    category: '',
    amount: '',
    payment_method: 'efectivo',
    description: ''
  });

  const getDateRange = useCallback(() => {
    const now = new Date();
    const startOfDay = new Date(now.getFullYear(), now.getMonth(), now.getDate());
    const endOfDay = new Date(now.getFullYear(), now.getMonth(), now.getDate(), 23, 59, 59, 999);

    switch (selectedPeriod) {
      case 'today':
        return { from: startOfDay, to: endOfDay };
      case 'week': {
        const dayOfWeek = startOfDay.getDay();
        const diff = startOfDay.getDate() - dayOfWeek + (dayOfWeek === 0 ? -6 : 1);
        const monday = new Date(startOfDay.setDate(diff));
        return { from: monday, to: endOfDay };
      }
      case 'month': {
        const firstDay = new Date(now.getFullYear(), now.getMonth(), 1);
        return { from: firstDay, to: endOfDay };
      }
      case 'previous_month': {
        const firstDayPrevMonth = new Date(now.getFullYear(), now.getMonth() - 1, 1);
        const lastDayPrevMonth = new Date(now.getFullYear(), now.getMonth(), 0, 23, 59, 59, 999);
        return { from: firstDayPrevMonth, to: lastDayPrevMonth };
      }
      case 'custom': {
        const fromDate = customDateFrom ? new Date(customDateFrom) : startOfDay;
        let toDate = customDateTo ? new Date(customDateTo) : endOfDay;

        // Si hay fecha final, asegurar que incluya todo el día hasta las 23:59:59
        if (customDateTo) {
          toDate = new Date(customDateTo);
          toDate.setHours(23, 59, 59, 999);
        }

        return { from: fromDate, to: toDate };
      }
      case 'all':
      default:
        return { from: new Date(0), to: endOfDay };
    }
  }, [selectedPeriod, customDateFrom, customDateTo]);

  const loadTransactions = useCallback(async () => {
    if (!shift) return;

    const dateRange = getDateRange();

    const { data } = await supabase
      .from('cash_transactions')
      .select('*')
      .gte('created_at', dateRange.from.toISOString())
      .lte('created_at', dateRange.to.toISOString())
      .order('created_at', { ascending: false });

    setTransactions(data || []);
  }, [shift, getDateRange]);

  const loadMonthTransactions = useCallback(async () => {
    if (!shift) return;

    const now = new Date();
    const firstDayOfMonth = new Date(now.getFullYear(), now.getMonth(), 1);
    const endOfDay = new Date(now.getFullYear(), now.getMonth(), now.getDate(), 23, 59, 59, 999);

    const { data } = await supabase
      .from('cash_transactions')
      .select('*')
      .gte('created_at', firstDayOfMonth.toISOString())
      .lte('created_at', endOfDay.toISOString())
      .order('created_at', { ascending: false });

    setMonthTransactions(data || []);
  }, [shift]);

  useEffect(() => {
    if (shift) {
      loadTransactions();
      loadMonthTransactions();
    }
  }, [shift, loadTransactions, loadMonthTransactions]);

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!shift) return;

    await supabase.from('cash_transactions').insert([{
      shift_id: shift.id,
      type: formData.type,
      category: formData.category,
      amount: parseFloat(formData.amount),
      payment_method: formData.payment_method,
      description: formData.description
    }]);

    loadTransactions();
    loadMonthTransactions();
    setShowModal(false);
    setFormData({ type: 'income', category: '', amount: '', payment_method: 'efectivo', description: '' });
  };

  const handleCloseShift = () => {
    setShowCloseModal(true);
  };

  const findRelatedSale = useCallback(async (transaction: CashTransaction) => {
    const match = transaction.description.match(/V-(\d+)/);
    if (!match) {
      setRelatedSale(null);
      return;
    }

    const saleNumber = `V-${match[1]}`;
    const { data } = await supabase
      .from('sales')
      .select('*')
      .eq('sale_number', saleNumber)
      .maybeSingle();

    setRelatedSale(data || null);
  }, []);

  const handleTransactionClick = async (transaction: CashTransaction) => {
    setSelectedTransaction(transaction);
    await findRelatedSale(transaction);
    setShowDetailModal(true);
  };

  const exportToCSV = () => {
    if (transactions.length === 0) {
      alert('No hay transacciones para exportar');
      return;
    }

    const headers = ['Fecha', 'Hora', 'Tipo', 'Categoría', 'Monto', 'Método de Pago', 'Descripción'];
    const rows = transactions.map(t => {
      const date = new Date(t.created_at);
      const dateStr = date.toLocaleDateString('es-AR', { timeZone: 'America/Argentina/Buenos_Aires' });
      const timeStr = date.toLocaleTimeString('es-AR', { timeZone: 'America/Argentina/Buenos_Aires', hour12: false });
      return [
        dateStr,
        timeStr,
        t.type === 'income' ? 'Ingreso' : 'Egreso',
        t.category,
        t.amount.toString(),
        t.payment_method,
        t.description
      ];
    });

    const csvContent = [
      headers.join(','),
      ...rows.map(row => row.map(cell => `"${cell}"`).join(','))
    ].join('\n');

    const blob = new Blob([csvContent], { type: 'text/csv;charset=utf-8;' });
    const link = document.createElement('a');
    const url = URL.createObjectURL(blob);
    link.setAttribute('href', url);
    link.setAttribute('download', `movimientos_caja_${new Date().toISOString().split('T')[0]}.csv`);
    link.style.visibility = 'hidden';
    document.body.appendChild(link);
    link.click();
    document.body.removeChild(link);
  };

  const confirmCloseShift = () => {
    if (closingCash && parseFloat(closingCash) >= 0) {
      onCloseShift(parseFloat(closingCash));
      setShowCloseModal(false);
      setClosingCash('');
    }
  };

  // Transacciones solo del turno actual (para cálculos de arqueo)
  const currentShiftTransactions = transactions.filter(t => t.shift_id === shift?.id);

  // Totales generales SOLO del turno actual
  const totalIncome = currentShiftTransactions
    .filter(t => t.type === 'income')
    .reduce((sum, t) => sum + Number(t.amount), 0);
  const totalExpense = currentShiftTransactions
    .filter(t => t.type === 'expense')
    .reduce((sum, t) => sum + Number(t.amount), 0);
  const balance = totalIncome - totalExpense;

  // Totales del mes en curso
  const monthIncome = monthTransactions
    .filter(t => t.type === 'income')
    .reduce((sum, t) => sum + Number(t.amount), 0);
  const monthExpense = monthTransactions
    .filter(t => t.type === 'expense')
    .reduce((sum, t) => sum + Number(t.amount), 0);
  const monthBalance = monthIncome - monthExpense;

  // Saldos por método de pago SOLO del turno actual
  const incomeCash = currentShiftTransactions
    .filter(t => t.type === 'income' && t.payment_method === 'efectivo')
    .reduce((sum, t) => sum + Number(t.amount), 0);
  const expenseCash = currentShiftTransactions
    .filter(t => t.type === 'expense' && t.payment_method === 'efectivo')
    .reduce((sum, t) => sum + Number(t.amount), 0);
  const cashInBox = incomeCash - expenseCash;

  const incomeTransfer = currentShiftTransactions
    .filter(t => t.type === 'income' && t.payment_method === 'transferencia')
    .reduce((sum, t) => sum + Number(t.amount), 0);
  const expenseTransfer = currentShiftTransactions
    .filter(t => t.type === 'expense' && t.payment_method === 'transferencia')
    .reduce((sum, t) => sum + Number(t.amount), 0);
  const transferInBox = incomeTransfer - expenseTransfer;

  const incomeQr = currentShiftTransactions
    .filter(t => t.type === 'income' && t.payment_method === 'qr')
    .reduce((sum, t) => sum + Number(t.amount), 0);
  const expenseQr = currentShiftTransactions
    .filter(t => t.type === 'expense' && t.payment_method === 'qr')
    .reduce((sum, t) => sum + Number(t.amount), 0);
  const qrInBox = incomeQr - expenseQr;

  const incomeExpensas = currentShiftTransactions
    .filter(t => t.type === 'income' && t.payment_method === 'expensas')
    .reduce((sum, t) => sum + Number(t.amount), 0);
  const expenseExpensas = currentShiftTransactions
    .filter(t => t.type === 'expense' && t.payment_method === 'expensas')
    .reduce((sum, t) => sum + Number(t.amount), 0);
  const expensasInBox = incomeExpensas - expenseExpensas;

  // Efectivo esperado para cierre de turno
  const openingCash = Number(shift?.opening_cash || 0);
  const expectedCash = openingCash + incomeCash - expenseCash;

  if (!shift) {
    return (
      <div className="text-center py-12">
        <Wallet className="mx-auto text-slate-400 mb-4" size={64} />
        <h3 className="text-xl font-bold text-slate-700">No hay turno activo</h3>
        <p className="text-slate-500">Inicia un turno para gestionar la caja</p>
      </div>
    );
  }

  return (
    <div className="space-y-6">
      {/* Header turno activo */}
      <div className="bg-gradient-to-r from-slate-700 to-slate-900 rounded-xl p-6 text-white shadow-xl">
        <div className="flex items-center justify-between">
          <div className="space-y-2">
            <h3 className="text-2xl font-bold">Turno Activo</h3>
            <div className="flex items-center gap-4 text-slate-200">
              <span className="flex items-center gap-2">
                <Calendar size={16} />
                {new Date(shift.start_date).toLocaleDateString('es-AR', {
                  timeZone: 'America/Argentina/Buenos_Aires'
                })}
              </span>
              <span className="flex items-center gap-2">
                <Clock size={16} />
                {new Date(shift.start_date).toLocaleTimeString('es-AR', {
                  timeZone: 'America/Argentina/Buenos_Aires',
                  hour12: false
                })}
              </span>
            </div>
            <p className="text-lg">
              <span className="text-slate-300">Usuario:</span> <strong>{shift.user_name}</strong>
            </p>
            <p className="text-lg">
              <span className="text-slate-300">Efectivo Inicial:</span>{' '}
              <strong>${Number(shift.opening_cash).toFixed(2)}</strong>
            </p>
          </div>
          <button
            onClick={handleCloseShift}
            className="bg-gradient-to-r from-red-500 to-pink-600 hover:from-red-600 hover:to-pink-700 text-white px-6 py-3 rounded-xl flex items-center gap-2 font-semibold shadow-lg transition-all"
          >
            <LogOut size={20} />
            Cerrar Turno
          </button>
        </div>
      </div>

      {/* Resumen Ingresos/Egresos/Balance */}
      <div className="grid grid-cols-1 md:grid-cols-3 gap-4">
        <div className="bg-gradient-to-br from-emerald-500 to-teal-600 rounded-xl p-6 text-white shadow-lg">
          <div className="flex items-center justify-between mb-2">
            <span className="text-xs text-emerald-100">Ingresos</span>
            <TrendingUp size={20} />
          </div>
          <div className="space-y-1">
            <div>
              <p className="text-[10px] text-emerald-100">Turno</p>
              <p className="text-xl font-bold">${totalIncome.toFixed(2)}</p>
            </div>
            <div>
              <p className="text-[10px] text-emerald-100">Mes</p>
              <p className="text-lg font-semibold">${monthIncome.toFixed(2)}</p>
            </div>
          </div>
        </div>

        <div className="bg-gradient-to-br from-red-500 to-pink-600 rounded-xl p-6 text-white shadow-lg">
          <div className="flex items-center justify-between mb-2">
            <span className="text-xs text-red-100">Egresos</span>
            <TrendingDown size={20} />
          </div>
          <div className="space-y-1">
            <div>
              <p className="text-[10px] text-red-100">Turno</p>
              <p className="text-xl font-bold">${totalExpense.toFixed(2)}</p>
            </div>
            <div>
              <p className="text-[10px] text-red-100">Mes</p>
              <p className="text-lg font-semibold">${monthExpense.toFixed(2)}</p>
            </div>
          </div>
        </div>

        <div className="bg-gradient-to-br from-blue-500 to-cyan-600 rounded-xl p-6 text-white shadow-lg">
          <div className="flex items-center justify-between mb-2">
            <span className="text-xs text-blue-100">Balance</span>
            <DollarSign size={20} />
          </div>
          <div className="space-y-1">
            <div>
              <p className="text-[10px] text-blue-100">Turno</p>
              <p className="text-xl font-bold">${balance.toFixed(2)}</p>
            </div>
            <div>
              <p className="text-[10px] text-blue-100">Mes</p>
              <p className="text-lg font-semibold">${monthBalance.toFixed(2)}</p>
            </div>
          </div>
        </div>
      </div>

      {/* Facturación por método de pago */}
      <div>
        <h3 className="text-lg font-bold text-slate-800 mb-3">FACTURACIÓN DEL TURNO ACTUAL</h3>
        <div className="grid grid-cols-1 md:grid-cols-4 gap-4">
          <div className="bg-white rounded-xl p-4 shadow border border-slate-200">
            <p className="text-sm font-semibold text-slate-600">Efectivo</p>
            <p className="text-2xl font-bold text-emerald-600">${cashInBox.toFixed(2)}</p>
            <p className="text-xs text-slate-500 mt-1">
              Ingresos - egresos en efectivo
            </p>
          </div>
          <div className="bg-white rounded-xl p-4 shadow border border-slate-200">
            <p className="text-sm font-semibold text-slate-600">Transferencias</p>
            <p className="text-2xl font-bold text-slate-800">${transferInBox.toFixed(2)}</p>
            <p className="text-xs text-slate-500 mt-1">Ingresos - egresos por transferencia</p>
          </div>
          <div className="bg-white rounded-xl p-4 shadow border border-slate-200">
            <p className="text-sm font-semibold text-slate-600">QR</p>
            <p className="text-2xl font-bold text-slate-800">${qrInBox.toFixed(2)}</p>
            <p className="text-xs text-slate-500 mt-1">Ingresos - egresos por QR</p>
          </div>
          <div className="bg-white rounded-xl p-4 shadow border border-slate-200">
            <p className="text-sm font-semibold text-slate-600">Expensas</p>
            <p className="text-2xl font-bold text-slate-800">${expensasInBox.toFixed(2)}</p>
            <p className="text-xs text-slate-500 mt-1">Ingresos - egresos por expensas</p>
          </div>
        </div>
      </div>

      {/* Título tabla movimientos */}
      <div>
        <div className="flex justify-between items-center mb-4">
          <h3 className="text-xl font-bold text-slate-800">Movimientos de Caja</h3>
          <button
            onClick={() => setShowModal(true)}
            className="bg-gradient-to-r from-purple-500 to-pink-600 hover:from-purple-600 hover:to-pink-700 text-white px-6 py-2.5 rounded-xl flex items-center gap-2 shadow-lg transition-all"
          >
            <Plus size={20} />
            Nuevo Movimiento
          </button>
        </div>

        {/* Botón exportar */}
        <div className="flex justify-end mb-4">
          <button
            onClick={exportToCSV}
            className="bg-gradient-to-r from-green-500 to-emerald-600 hover:from-green-600 hover:to-emerald-700 text-white px-4 py-2 rounded-lg flex items-center gap-2 shadow-lg transition-all"
          >
            <Download size={18} />
            Exportar CSV
          </button>
        </div>

        {/* Filtros de período */}
        <div className="flex flex-wrap gap-2 mb-4">
          <button
            onClick={() => setSelectedPeriod('today')}
            className={`px-4 py-2 rounded-lg font-medium transition-all ${
              selectedPeriod === 'today'
                ? 'bg-blue-500 text-white shadow-lg'
                : 'bg-slate-200 text-slate-700 hover:bg-slate-300'
            }`}
          >
            Hoy
          </button>
          <button
            onClick={() => setSelectedPeriod('week')}
            className={`px-4 py-2 rounded-lg font-medium transition-all ${
              selectedPeriod === 'week'
                ? 'bg-blue-500 text-white shadow-lg'
                : 'bg-slate-200 text-slate-700 hover:bg-slate-300'
            }`}
          >
            Esta Semana
          </button>
          <button
            onClick={() => setSelectedPeriod('month')}
            className={`px-4 py-2 rounded-lg font-medium transition-all ${
              selectedPeriod === 'month'
                ? 'bg-blue-500 text-white shadow-lg'
                : 'bg-slate-200 text-slate-700 hover:bg-slate-300'
            }`}
          >
            Este Mes
          </button>
          <button
            onClick={() => setSelectedPeriod('previous_month')}
            className={`px-4 py-2 rounded-lg font-medium transition-all ${
              selectedPeriod === 'previous_month'
                ? 'bg-blue-500 text-white shadow-lg'
                : 'bg-slate-200 text-slate-700 hover:bg-slate-300'
            }`}
          >
            Mes Anterior
          </button>
          <button
            onClick={() => setSelectedPeriod('all')}
            className={`px-4 py-2 rounded-lg font-medium transition-all ${
              selectedPeriod === 'all'
                ? 'bg-blue-500 text-white shadow-lg'
                : 'bg-slate-200 text-slate-700 hover:bg-slate-300'
            }`}
          >
            Todo
          </button>
          <button
            onClick={() => setShowCustomDateModal(true)}
            className={`px-4 py-2 rounded-lg font-medium transition-all flex items-center gap-2 ${
              selectedPeriod === 'custom'
                ? 'bg-blue-500 text-white shadow-lg'
                : 'bg-slate-200 text-slate-700 hover:bg-slate-300'
            }`}
          >
            <Calendar size={16} />
            Personalizado
          </button>
        </div>
      </div>

      {/* Tabla de movimientos */}
      <div className="bg-white rounded-xl shadow-lg overflow-hidden">
        <table className="w-full">
          <thead className="bg-slate-100">
            <tr>
              <th className="px-6 py-3 text-left text-xs font-semibold text-slate-600 uppercase">
                Fecha
              </th>
              <th className="px-6 py-3 text-left text-xs font-semibold text-slate-600 uppercase">
                Tipo
              </th>
              <th className="px-6 py-3 text-left text-xs font-semibold text-slate-600 uppercase">
                Categoría
              </th>
              <th className="px-6 py-3 text-left text-xs font-semibold text-slate-600 uppercase">
                Monto
              </th>
              <th className="px-6 py-3 text-left text-xs font-semibold text-slate-600 uppercase">
                Método
              </th>
              <th className="px-6 py-3 text-left text-xs font-semibold text-slate-600 uppercase">
                Descripción
              </th>
            </tr>
          </thead>
          <tbody>
            {transactions.map((t) => (
              <tr
                key={t.id}
                onClick={() => handleTransactionClick(t)}
                className="border-t border-slate-200 hover:bg-slate-50 cursor-pointer transition-colors"
              >
                <td className="px-6 py-4 text-sm text-slate-700">
                  {new Date(t.created_at).toLocaleString('es-AR', {
                    timeZone: 'America/Argentina/Buenos_Aires',
                    hour12: false
                  })}
                </td>
                <td className="px-6 py-4">
                  {t.type === 'income' ? (
                    <span className="inline-flex items-center gap-1 bg-emerald-100 text-emerald-700 px-3 py-1 rounded-full text-xs font-medium">
                      <TrendingUp size={14} />
                      Ingreso
                    </span>
                  ) : (
                    <span className="inline-flex items-center gap-1 bg-red-100 text-red-700 px-3 py-1 rounded-full text-xs font-medium">
                      <TrendingDown size={14} />
                      Egreso
                    </span>
                  )}
                </td>
                <td className="px-6 py-4 text-sm text-slate-700">{t.category}</td>
                <td className="px-6 py-4 text-sm font-bold text-slate-800">
                  ${Number(t.amount).toFixed(2)}
                </td>
                <td className="px-6 py-4 text-sm text-slate-700">{t.payment_method}</td>
                <td className="px-6 py-4 text-sm text-slate-600">{t.description}</td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>

      {/* Modal nuevo movimiento */}
      {showModal && (
        <div className="fixed inset-0 bg-black/60 backdrop-blur-sm flex items-center justify-center p-4 z-50">
          <div className="bg-white rounded-2xl max-w-md w-full shadow-2xl">
            <div className="bg-gradient-to-r from-purple-500 to-pink-600 p-6 rounded-t-2xl">
              <h3 className="text-2xl font-bold text-white">Nuevo Movimiento</h3>
            </div>

            <form onSubmit={handleSubmit} className="p-6 space-y-4">
              <div>
                <label className="block text-sm font-semibold text-slate-700 mb-2">
                  Tipo *
                </label>
                <select
                  required
                  value={formData.type}
                  onChange={(e) =>
                    setFormData({ ...formData, type: e.target.value as 'income' | 'expense' })
                  }
                  className="w-full px-4 py-2.5 bg-slate-50 border border-slate-200 rounded-xl"
                >
                  <option value="income">Ingreso</option>
                  <option value="expense">Egreso</option>
                </select>
              </div>

              <div>
                <label className="block text-sm font-semibold text-slate-700 mb-2">
                  Categoría *
                </label>
                <input
                  type="text"
                  required
                  value={formData.category}
                  onChange={(e) => setFormData({ ...formData, category: e.target.value })}
                  className="w-full px-4 py-2.5 bg-slate-50 border border-slate-200 rounded-xl"
                />
              </div>

              <div>
                <label className="block text-sm font-semibold text-slate-700 mb-2">
                  Monto *
                </label>
                <input
                  type="number"
                  required
                  step="0.01"
                  value={formData.amount}
                  onChange={(e) => setFormData({ ...formData, amount: e.target.value })}
                  className="w-full px-4 py-2.5 bg-slate-50 border border-slate-200 rounded-xl"
                />
              </div>

              <div>
                <label className="block text-sm font-semibold text-slate-700 mb-2">
                  Método de Pago *
                </label>
                <select
                  required
                  value={formData.payment_method}
                  onChange={(e) =>
                    setFormData({ ...formData, payment_method: e.target.value })
                  }
                  className="w-full px-4 py-2.5 bg-slate-50 border border-slate-200 rounded-xl"
                >
                  <option value="efectivo">Efectivo</option>
                  <option value="transferencia">Transferencia</option>
                  <option value="qr">QR</option>
                  <option value="tarjeta">Tarjeta</option>
                  <option value="expensas">Expensas</option>
                </select>
              </div>

              <div>
                <label className="block text-sm font-semibold text-slate-700 mb-2">
                  Descripción
                </label>
                <textarea
                  value={formData.description}
                  onChange={(e) =>
                    setFormData({ ...formData, description: e.target.value })
                  }
                  rows={3}
                  className="w-full px-4 py-2.5 bg-slate-50 border border-slate-200 rounded-xl"
                />
              </div>

              <div className="flex gap-3 pt-4">
                <button
                  type="button"
                  onClick={() => setShowModal(false)}
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

      {/* Modal fechas personalizadas */}
      {showCustomDateModal && (
        <div className="fixed inset-0 bg-black/60 backdrop-blur-sm flex items-center justify-center p-4 z-50">
          <div className="bg-white rounded-2xl max-w-md w-full shadow-2xl">
            <div className="bg-gradient-to-r from-blue-500 to-cyan-600 p-6 rounded-t-2xl flex items-center justify-between">
              <h3 className="text-2xl font-bold text-white">Rango Personalizado</h3>
              <button
                onClick={() => setShowCustomDateModal(false)}
                className="text-white hover:bg-white/20 p-1 rounded"
              >
                <X size={24} />
              </button>
            </div>

            <div className="p-6 space-y-4">
              <div>
                <label className="block text-sm font-semibold text-slate-700 mb-2">
                  Desde *
                </label>
                <input
                  type="date"
                  value={customDateFrom}
                  onChange={(e) => setCustomDateFrom(e.target.value)}
                  className="w-full px-4 py-2.5 bg-slate-50 border-2 border-slate-200 rounded-xl"
                />
              </div>

              <div>
                <label className="block text-sm font-semibold text-slate-700 mb-2">
                  Hasta *
                </label>
                <input
                  type="date"
                  value={customDateTo}
                  onChange={(e) => setCustomDateTo(e.target.value)}
                  className="w-full px-4 py-2.5 bg-slate-50 border-2 border-slate-200 rounded-xl"
                />
              </div>

              <div className="flex gap-3 pt-4">
                <button
                  type="button"
                  onClick={() => {
                    setShowCustomDateModal(false);
                    setCustomDateFrom('');
                    setCustomDateTo('');
                  }}
                  className="flex-1 px-6 py-3 border-2 border-slate-300 text-slate-700 font-semibold rounded-xl hover:bg-slate-50"
                >
                  Cancelar
                </button>
                <button
                  type="button"
                  onClick={() => {
                    if (customDateFrom && customDateTo) {
                      setSelectedPeriod('custom');
                      setShowCustomDateModal(false);
                    }
                  }}
                  disabled={!customDateFrom || !customDateTo}
                  className="flex-1 px-6 py-3 bg-gradient-to-r from-blue-500 to-cyan-600 text-white font-semibold rounded-xl hover:from-blue-600 hover:to-cyan-700 shadow-lg disabled:opacity-50 disabled:cursor-not-allowed"
                >
                  Aplicar
                </button>
              </div>
            </div>
          </div>
        </div>
      )}

      {/* Modal detalle de transacción */}
      {showDetailModal && selectedTransaction && (
        <div className="fixed inset-0 bg-black/60 backdrop-blur-sm flex items-center justify-center p-4 z-50">
          <div className="bg-white rounded-2xl max-w-2xl w-full shadow-2xl max-h-[90vh] overflow-y-auto">
            <div className="bg-gradient-to-r from-blue-500 to-cyan-600 p-6 rounded-t-2xl flex items-center justify-between sticky top-0">
              <h3 className="text-2xl font-bold text-white">Detalle de Transacción</h3>
              <button
                onClick={() => {
                  setShowDetailModal(false);
                  setSelectedTransaction(null);
                  setRelatedSale(null);
                }}
                className="text-white hover:bg-white/20 p-1 rounded"
              >
                <X size={24} />
              </button>
            </div>

            <div className="p-6 space-y-6">
              {/* Información básica */}
              <div className="grid grid-cols-2 gap-4">
                <div>
                  <p className="text-sm font-semibold text-slate-600">Tipo</p>
                  <div className="flex items-center gap-2 mt-1">
                    {selectedTransaction.type === 'income' ? (
                      <span className="inline-flex items-center gap-1 bg-emerald-100 text-emerald-700 px-3 py-1 rounded-full text-sm font-medium">
                        <TrendingUp size={16} />
                        Ingreso
                      </span>
                    ) : (
                      <span className="inline-flex items-center gap-1 bg-red-100 text-red-700 px-3 py-1 rounded-full text-sm font-medium">
                        <TrendingDown size={16} />
                        Egreso
                      </span>
                    )}
                  </div>
                </div>

                <div>
                  <p className="text-sm font-semibold text-slate-600">Fecha y Hora</p>
                  <p className="text-lg font-bold text-slate-800 mt-1">
                    {new Date(selectedTransaction.created_at).toLocaleString('es-AR', {
                      timeZone: 'America/Argentina/Buenos_Aires',
                      hour12: false
                    })}
                  </p>
                </div>

                <div>
                  <p className="text-sm font-semibold text-slate-600">Categoría</p>
                  <p className="text-slate-800 mt-1">{selectedTransaction.category}</p>
                </div>

                <div>
                  <p className="text-sm font-semibold text-slate-600">Método de Pago</p>
                  <p className="text-slate-800 mt-1">{selectedTransaction.payment_method}</p>
                </div>

                <div className="col-span-2">
                  <p className="text-sm font-semibold text-slate-600">Monto Total</p>
                  <p className="text-3xl font-bold text-slate-800 mt-1">
                    ${selectedTransaction.amount.toFixed(2)}
                  </p>
                </div>

                {selectedTransaction.description && (
                  <div className="col-span-2">
                    <p className="text-sm font-semibold text-slate-600">Descripción</p>
                    <p className="text-slate-800 mt-1">{selectedTransaction.description}</p>
                  </div>
                )}
              </div>

              {/* Detalle de venta si existe */}
              {relatedSale && (
                <div className="border-t pt-6">
                  <div className="flex items-center gap-2 mb-4">
                    <ShoppingCart size={20} className="text-blue-500" />
                    <h4 className="text-lg font-bold text-slate-800">Detalles de Venta</h4>
                  </div>

                  <div className="grid grid-cols-2 gap-4 mb-4">
                    <div>
                      <p className="text-sm font-semibold text-slate-600">Número de Venta</p>
                      <p className="text-slate-800">{relatedSale.sale_number}</p>
                    </div>
                    <div>
                      <p className="text-sm font-semibold text-slate-600">Vendedor</p>
                      <p className="text-slate-800">{relatedSale.user_name}</p>
                    </div>
                    {relatedSale.customer_name && (
                      <div>
                        <p className="text-sm font-semibold text-slate-600">Cliente</p>
                        <p className="text-slate-800">{relatedSale.customer_name}</p>
                      </div>
                    )}
                    {relatedSale.customer_lot && (
                      <div>
                        <p className="text-sm font-semibold text-slate-600">Lote</p>
                        <p className="text-slate-800">{relatedSale.customer_lot}</p>
                      </div>
                    )}
                  </div>

                  {/* Productos vendidos */}
                  <div className="border rounded-lg overflow-hidden">
                    <table className="w-full">
                      <thead className="bg-slate-100">
                        <tr>
                          <th className="px-4 py-3 text-left text-xs font-semibold text-slate-600">
                            Producto
                          </th>
                          <th className="px-4 py-3 text-right text-xs font-semibold text-slate-600">
                            Cant.
                          </th>
                          <th className="px-4 py-3 text-right text-xs font-semibold text-slate-600">
                            Precio
                          </th>
                          <th className="px-4 py-3 text-right text-xs font-semibold text-slate-600">
                            Subtotal
                          </th>
                        </tr>
                      </thead>
                      <tbody>
                        {relatedSale.items && relatedSale.items.map((item: any, idx: number) => (
                          <tr key={idx} className="border-t border-slate-200">
                            <td className="px-4 py-3 text-sm text-slate-700">{item.product_name}</td>
                            <td className="px-4 py-3 text-sm text-slate-700 text-right">x{item.quantity}</td>
                            <td className="px-4 py-3 text-sm text-slate-700 text-right">
                              ${Number(item.price).toFixed(2)}
                            </td>
                            <td className="px-4 py-3 text-sm font-bold text-slate-800 text-right">
                              ${Number(item.subtotal).toFixed(2)}
                            </td>
                          </tr>
                        ))}
                      </tbody>
                    </table>

                    <div className="bg-slate-50 p-4 space-y-2">
                      <div className="flex justify-between">
                        <span className="font-semibold text-slate-600">Subtotal:</span>
                        <span className="text-slate-800">${Number(relatedSale.subtotal).toFixed(2)}</span>
                      </div>
                      {relatedSale.discount > 0 && (
                        <div className="flex justify-between">
                          <span className="font-semibold text-slate-600">Descuento:</span>
                          <span className="text-slate-800">-${Number(relatedSale.discount).toFixed(2)}</span>
                        </div>
                      )}
                      <div className="flex justify-between border-t border-slate-200 pt-2">
                        <span className="font-bold text-slate-800">Total:</span>
                        <span className="text-lg font-bold text-blue-600">
                          ${Number(relatedSale.total).toFixed(2)}
                        </span>
                      </div>
                    </div>
                  </div>
                </div>
              )}

              <div className="flex gap-3 pt-4 border-t">
                <button
                  onClick={() => {
                    setShowDetailModal(false);
                    setSelectedTransaction(null);
                    setRelatedSale(null);
                  }}
                  className="flex-1 px-6 py-3 border-2 border-slate-300 text-slate-700 font-semibold rounded-xl hover:bg-slate-50"
                >
                  Cerrar
                </button>
              </div>
            </div>
          </div>
        </div>
      )}

      {/* Modal cierre de turno */}
      {showCloseModal && (
        <div className="fixed inset-0 bg-black/60 backdrop-blur-sm flex items-center justify-center p-4 z-50">
          <div className="bg-white rounded-2xl max-w-md w-full shadow-2xl">
            <div className="bg-gradient-to-r from-red-500 to-pink-600 p-6 rounded-t-2xl">
              <h3 className="text-2xl font-bold text-white">Cerrar Turno</h3>
            </div>

            <div className="p-6 space-y-4">
              <div className="bg-slate-50 rounded-xl p-4 space-y-2">
                <div className="flex justify-between">
                  <span className="font-semibold text-slate-700">Usuario:</span>
                  <span className="text-slate-900">{shift.user_name}</span>
                </div>
                <div className="flex justify-between">
                  <span className="font-semibold text-slate-700">Hora Inicio:</span>
                  <span className="text-slate-900">
                    {new Date(shift.start_date).toLocaleString('es-AR', {
                      timeZone: 'America/Argentina/Buenos_Aires',
                      hour12: false
                    })}
                  </span>
                </div>
                <div className="flex justify-between">
                  <span className="font-semibold text-slate-700">Efectivo Inicial:</span>
                  <span className="text-slate-900">
                    ${Number(shift.opening_cash).toFixed(2)}
                  </span>
                </div>
                <div className="flex justify-between border-t border-slate-200 pt-2 mt-2">
                  <span className="font-semibold text-slate-700">Balance del Turno:</span>
                  <span
                    className={`font-bold ${
                      balance >= 0 ? 'text-emerald-600' : 'text-red-600'
                    }`}
                  >
                    ${balance.toFixed(2)}
                  </span>
                </div>
                <div className="flex justify-between">
                  <span className="font-semibold text-slate-700">Efectivo Esperado:</span>
                  <span className="text-lg font-bold text-blue-600">
                    ${expectedCash.toFixed(2)}
                  </span>
                </div>
              </div>

              <div>
                <label className="block text-sm font-semibold text-slate-700 mb-2">
                  Efectivo Final en Caja *
                </label>
                <div className="relative">
                  <span className="absolute left-4 top-1/2 -translate-y-1/2 text-slate-500 font-semibold">
                    $
                  </span>
                  <input
                    type="number"
                    required
                    step="0.01"
                    min="0"
                    value={closingCash}
                    onChange={(e) => setClosingCash(e.target.value)}
                    className="w-full pl-8 pr-4 py-3 bg-slate-50 border-2 border-slate-200 rounded-xl focus:ring-2 focus:ring-red-500 text-lg font-semibold"
                    placeholder="0.00"
                  />
                </div>
                <p className="text-xs text-slate-500 mt-1">
                  Cuenta todo el efectivo físico que hay en la caja
                </p>
              </div>

              {closingCash && (
                <div
                  className={`p-4 rounded-xl ${
                    Math.abs(parseFloat(closingCash) - expectedCash) < 0.01
                      ? 'bg-emerald-50 border-2 border-emerald-200'
                      : parseFloat(closingCash) > expectedCash
                      ? 'bg-blue-50 border-2 border-blue-200'
                      : 'bg-amber-50 border-2 border-amber-200'
                  }`}
                >
                  <p className="font-semibold text-sm">
                    {Math.abs(parseFloat(closingCash) - expectedCash) < 0.01 ? (
                      <span className="text-emerald-700">
                        ✓ La caja cuadra perfectamente
                      </span>
                    ) : parseFloat(closingCash) > expectedCash ? (
                      <span className="text-blue-700">
                        Hay ${(parseFloat(closingCash) - expectedCash).toFixed(2)} de más
                      </span>
                    ) : (
                      <span className="text-amber-700">
                        Faltan ${(expectedCash - parseFloat(closingCash)).toFixed(2)}
                      </span>
                    )}
                  </p>
                </div>
              )}

              <div className="flex gap-3 pt-4">
                <button
                  type="button"
                  onClick={() => {
                    setShowCloseModal(false);
                    setClosingCash('');
                  }}
                  className="flex-1 px-6 py-3 border-2 border-slate-300 text-slate-700 font-semibold rounded-xl hover:bg-slate-50"
                >
                  Cancelar
                </button>
                <button
                  onClick={confirmCloseShift}
                  disabled={!closingCash}
                  className="flex-1 px-6 py-3 bg-gradient-to-r from-red-500 to-pink-600 text-white font-semibold rounded-xl hover:from-red-600 hover:to-pink-700 shadow-lg disabled:opacity-50 disabled:cursor-not-allowed"
                >
                  Cerrar Turno
                </button>
              </div>
            </div>
          </div>
        </div>
      )}
    </div>
  );
}
