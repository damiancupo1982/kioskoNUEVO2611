import { useState, useEffect, useCallback } from 'react';
import { supabase, Shift, CustomerAccount, CurrentAccountTransaction, Sale, Configuration } from '../lib/supabase';
import {
  BookOpen, DollarSign, AlertCircle, Search, Download, Printer,
  Receipt, ChevronDown, ChevronUp, CheckCircle, Clock, X,
} from 'lucide-react';

interface CuentaCorrienteProps {
  shift: Shift | null;
}

const AR_TZ = 'America/Argentina/Buenos_Aires';

function escapeHtml(text: string): string {
  return text
    .replace(/&/g, '&amp;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;')
    .replace(/"/g, '&quot;')
    .replace(/'/g, '&#039;');
}

function formatDate(iso: string): string {
  return new Date(iso).toLocaleDateString('es-AR', {
    timeZone: AR_TZ, day: '2-digit', month: '2-digit', year: 'numeric',
  });
}

function formatTime(iso: string): string {
  return new Date(iso).toLocaleTimeString('es-AR', {
    timeZone: AR_TZ, hour: '2-digit', minute: '2-digit', hour12: false,
  });
}

export default function CuentaCorriente({ shift }: CuentaCorrienteProps) {
  const [accounts, setAccounts] = useState<CustomerAccount[]>([]);
  const [transactions, setTransactions] = useState<CurrentAccountTransaction[]>([]);
  const [config, setConfig] = useState<Configuration | null>(null);
  const [loading, setLoading] = useState(true);
  const [search, setSearch] = useState('');
  const [filter, setFilter] = useState<'all' | 'debt' | 'zero'>('all');
  const [expandedId, setExpandedId] = useState<string | null>(null);
  const [showPaymentModal, setShowPaymentModal] = useState(false);
  const [paymentAccount, setPaymentAccount] = useState<CustomerAccount | null>(null);
  const [paymentAmount, setPaymentAmount] = useState(0);
  const [paymentMethod, setPaymentMethod] = useState('efectivo');
  const [selectedSale, setSelectedSale] = useState<Sale | null>(null);
  const [showSaleModal, setShowSaleModal] = useState(false);
  const [oldDebts, setOldDebts] = useState<Array<{ name: string; lot: string; debt: number; days: number }>>([]);
  const [showOldDebtsModal, setShowOldDebtsModal] = useState(false);

  const loadData = useCallback(async () => {
    const [{ data: accountsData }, { data: txData }, { data: configData }] = await Promise.all([
      supabase.from('customer_accounts').select('*').order('customer_name', { ascending: true }),
      supabase.from('current_account_transactions').select('*').order('created_at', { ascending: false }),
      supabase.from('configuration').select('*').maybeSingle(),
    ]);

    setAccounts((accountsData || []) as CustomerAccount[]);
    setTransactions((txData || []) as CurrentAccountTransaction[]);
    setConfig((configData || null) as Configuration | null);
    setLoading(false);
  }, []);

  const checkOldDebts = useCallback(async () => {
    const { data: debtAccounts } = await supabase
      .from('customer_accounts')
      .select('*')
      .gt('total_debt', 0);

    if (!debtAccounts || debtAccounts.length === 0) return;

    const debts: Array<{ name: string; lot: string; debt: number; days: number }> = [];
    const now = new Date();
    const thirtyDaysMs = 30 * 24 * 60 * 60 * 1000;

    for (const account of debtAccounts as CustomerAccount[]) {
      const { data: cargos } = await supabase
        .from('current_account_transactions')
        .select('*')
        .eq('customer_account_id', account.id)
        .eq('type', 'cargo')
        .order('created_at', { ascending: true })
        .limit(1);

      if (cargos && cargos.length > 0) {
        const cargoDate = new Date(cargos[0].created_at);
        const ageMs = now.getTime() - cargoDate.getTime();
        if (ageMs > thirtyDaysMs) {
          debts.push({
            name: account.customer_name,
            lot: account.customer_lot,
            debt: Number(account.total_debt),
            days: Math.floor(ageMs / (24 * 60 * 60 * 1000)),
          });
        }
      }
    }

    if (debts.length > 0) {
      debts.sort((a, b) => b.days - a.days);
      setOldDebts(debts);
      setShowOldDebtsModal(true);
    }
  }, []);

  useEffect(() => {
    loadData();
    checkOldDebts();
  }, [loadData, checkOldDebts]);

  const businessName = config?.business_name || 'Negocio';

  const filteredAccounts = accounts.filter((acc) => {
    const matchesSearch =
      acc.customer_name.toLowerCase().includes(search.toLowerCase()) ||
      acc.customer_lot.toLowerCase().includes(search.toLowerCase());

    const matchesFilter =
      filter === 'all' ||
      (filter === 'debt' && Number(acc.total_debt) > 0) ||
      (filter === 'zero' && Number(acc.total_debt) === 0);

    return matchesSearch && matchesFilter;
  });

  const totalDebt = accounts.reduce((sum, a) => sum + Number(a.total_debt), 0);
  const debtCount = accounts.filter((a) => Number(a.total_debt) > 0).length;

  const getAccountTransactions = (accountId: string) =>
    transactions.filter((t) => t.customer_account_id === accountId);

  const handleOpenPayment = (account: CustomerAccount) => {
    if (!shift) {
      alert('Debe haber un turno activo para registrar pagos.');
      return;
    }
    setPaymentAccount(account);
    setPaymentAmount(Number(account.total_debt));
    setPaymentMethod('efectivo');
    setShowPaymentModal(true);
  };

  const handleConfirmPayment = async () => {
    if (!paymentAccount || !shift) return;
    const currentDebt = Number(paymentAccount.total_debt);

    if (paymentAmount <= 0) {
      alert('El monto debe ser mayor a 0.');
      return;
    }
    if (paymentAmount > currentDebt + 0.01) {
      alert('El monto no puede ser mayor a la deuda.');
      return;
    }

    const newDebt = currentDebt - paymentAmount;

    await supabase
      .from('customer_accounts')
      .update({ total_debt: newDebt, updated_at: new Date().toISOString() })
      .eq('id', paymentAccount.id);

    await supabase
      .from('current_account_transactions')
      .insert([{
        customer_account_id: paymentAccount.id,
        customer_name: paymentAccount.customer_name,
        customer_lot: paymentAccount.customer_lot,
        type: 'pago',
        amount: paymentAmount,
        balance_after: newDebt,
        payment_method: paymentMethod,
        description: 'Pago de cuenta corriente',
        user_name: shift.user_name,
        shift_id: shift.id,
      }]);

    await supabase
      .from('cash_transactions')
      .insert([{
        shift_id: shift.id,
        type: 'income',
        category: 'cuenta_corriente',
        amount: paymentAmount,
        payment_method: paymentMethod,
        description: `Pago cta. cte. - ${paymentAccount.customer_name} (Lote ${paymentAccount.customer_lot})`,
      }]);

    setShowPaymentModal(false);
    setPaymentAccount(null);
    setPaymentAmount(0);
    loadData();
  };

  const handleViewSale = async (saleId: string) => {
    const { data } = await supabase
      .from('sales')
      .select('*')
      .eq('id', saleId)
      .maybeSingle();

    if (data) {
      setSelectedSale(data as Sale);
      setShowSaleModal(true);
    }
  };

  const exportToCSV = () => {
    const headers = ['Cliente', 'Lote', 'Fecha', 'Hora', 'Tipo', 'Monto', 'Saldo', 'Metodo', 'Descripcion'];
    const rows: string[][] = [];

    filteredAccounts.forEach((acc) => {
      const accTx = getAccountTransactions(acc.id);
      if (accTx.length === 0) {
        rows.push([
          acc.customer_name,
          acc.customer_lot,
          '', '', 'Sin movimientos', '', '', '', '',
        ]);
      } else {
        accTx.forEach((t) => {
          rows.push([
            acc.customer_name,
            acc.customer_lot,
            formatDate(t.created_at),
            formatTime(t.created_at),
            t.type === 'cargo' ? 'Cargo' : 'Pago',
            t.amount.toFixed(2).replace('.', ','),
            t.balance_after.toFixed(2).replace('.', ','),
            t.payment_method || '',
            t.description || '',
          ]);
        });
      }
    });

    const csvContent = [
      headers.join(','),
      ...rows.map((row) =>
        row.map((cell) => {
          const v = cell.replace(/"/g, '""');
          if (v.includes(',') || v.includes('"') || v.includes('\n')) return `"${v}"`;
          return v;
        }).join(',')
      ),
    ].join('\n');

    const blob = new Blob([csvContent], { type: 'text/csv;charset=utf-8;' });
    const link = document.createElement('a');
    link.href = URL.createObjectURL(blob);
    const today = new Date().toISOString().split('T')[0];
    link.download = `cuentas_corrientes_${today}.csv`;
    link.click();
  };

  const printAccountCard = (account: CustomerAccount) => {
    const accTx = getAccountTransactions(account.id);
    const printWindow = window.open('', '', 'height=600,width=800');
    if (!printWindow) return;

    const rowsHtml = accTx.map((t) => `
      <tr>
        <td>${formatDate(t.created_at)} ${formatTime(t.created_at)}</td>
        <td>${t.type === 'cargo' ? 'Cargo' : 'Pago'}</td>
        <td style="text-align:right">${t.type === 'cargo' ? '+' : '-'}$${Number(t.amount).toFixed(2)}</td>
        <td style="text-align:right">$${Number(t.balance_after).toFixed(2)}</td>
        <td>${escapeHtml(t.payment_method || '')}</td>
        <td>${escapeHtml(t.description || '')}</td>
      </tr>
    `).join('');

    printWindow.document.write(`
      <html>
        <head><title>Cuenta Corriente - ${escapeHtml(account.customer_name)}</title></head>
        <body style="font-family: Arial, sans-serif; padding: 20px;">
          <h2>${escapeHtml(businessName)} - Cuenta Corriente</h2>
          <p><strong>Cliente:</strong> ${escapeHtml(account.customer_name)}</p>
          <p><strong>Lote:</strong> ${escapeHtml(account.customer_lot)}</p>
          <p><strong>Fecha de emision:</strong> ${new Date().toLocaleString('es-AR', { timeZone: AR_TZ })}</p>
          <table border="1" cellpadding="6" style="border-collapse:collapse; width:100%; font-size:12px;">
            <thead>
              <tr style="background:#f0f0f0;">
                <th>Fecha y Hora</th><th>Tipo</th><th>Monto</th><th>Saldo</th><th>Metodo</th><th>Detalle</th>
              </tr>
            </thead>
            <tbody>${rowsHtml}</tbody>
          </table>
          <p style="margin-top:16px; font-size:18px;"><strong>Saldo actual: $${Number(account.total_debt).toFixed(2)}</strong></p>
        </body>
      </html>
    `);
    printWindow.document.close();
    printWindow.print();
  };

  const printSummary = () => {
    const debtAccounts = accounts.filter((a) => Number(a.total_debt) > 0);
    const printWindow = window.open('', '', 'height=600,width=800');
    if (!printWindow) return;

    const rowsHtml = debtAccounts.map((a) => `
      <tr>
        <td>${escapeHtml(a.customer_name)}</td>
        <td>${escapeHtml(a.customer_lot)}</td>
        <td style="text-align:right">$${Number(a.total_debt).toFixed(2)}</td>
      </tr>
    `).join('');

    const totalDebtSum = debtAccounts.reduce((sum, a) => sum + Number(a.total_debt), 0);

    printWindow.document.write(`
      <html>
        <head><title>Resumen Cuentas Corrientes</title></head>
        <body style="font-family: Arial, sans-serif; padding: 20px;">
          <h2>${escapeHtml(businessName)} - Resumen Cuentas Corrientes</h2>
          <p><strong>Fecha de emision:</strong> ${new Date().toLocaleString('es-AR', { timeZone: AR_TZ })}</p>
          <table border="1" cellpadding="6" style="border-collapse:collapse; width:100%; font-size:12px;">
            <thead>
              <tr style="background:#f0f0f0;">
                <th>Cliente</th><th>Lote</th><th>Deuda</th>
              </tr>
            </thead>
            <tbody>${rowsHtml}</tbody>
          </table>
          <p style="margin-top:16px; font-size:18px;"><strong>Total deuda: $${totalDebtSum.toFixed(2)}</strong></p>
        </body>
      </html>
    `);
    printWindow.document.close();
    printWindow.print();
  };

  if (loading) {
    return (
      <div className="text-center py-12">
        <BookOpen className="mx-auto text-slate-400 mb-4" size={64} />
        <p className="text-slate-500">Cargando cuentas corrientes...</p>
      </div>
    );
  }

  return (
    <div className="space-y-6">
      {/* Header */}
      <div className="flex flex-col sm:flex-row justify-between items-start sm:items-center gap-4">
        <h3 className="text-xl font-bold text-slate-800">Cuentas Corrientes</h3>
        <div className="flex gap-2">
          <button
            onClick={exportToCSV}
            className="bg-gradient-to-r from-emerald-500 to-teal-600 hover:from-emerald-600 hover:to-teal-700 text-white px-4 py-2 rounded-xl flex items-center gap-2 font-semibold shadow-lg transition-all text-sm"
          >
            <Download size={18} />
            Exportar CSV
          </button>
          <button
            onClick={printSummary}
            className="bg-gradient-to-r from-blue-500 to-cyan-600 hover:from-blue-600 hover:to-cyan-700 text-white px-4 py-2 rounded-xl flex items-center gap-2 font-semibold shadow-lg transition-all text-sm"
          >
            <Printer size={18} />
            Imprimir Resumen
          </button>
        </div>
      </div>

      {/* Tarjetas resumen */}
      <div className="grid grid-cols-1 md:grid-cols-3 gap-4">
        <div className="bg-gradient-to-br from-amber-500 to-orange-600 rounded-xl p-6 text-white shadow-lg">
          <div className="flex items-center justify-between mb-2">
            <span className="text-xs text-amber-100">Total Deuda</span>
            <DollarSign size={20} />
          </div>
          <p className="text-2xl font-bold">${totalDebt.toFixed(2)}</p>
        </div>
        <div className="bg-gradient-to-br from-red-500 to-pink-600 rounded-xl p-6 text-white shadow-lg">
          <div className="flex items-center justify-between mb-2">
            <span className="text-xs text-red-100">Clientes con Deuda</span>
            <AlertCircle size={20} />
          </div>
          <p className="text-2xl font-bold">{debtCount}</p>
        </div>
        <div className="bg-gradient-to-br from-emerald-500 to-teal-600 rounded-xl p-6 text-white shadow-lg">
          <div className="flex items-center justify-between mb-2">
            <span className="text-xs text-emerald-100">Total Cuentas</span>
            <BookOpen size={20} />
          </div>
          <p className="text-2xl font-bold">{accounts.length}</p>
        </div>
      </div>

      {/* Buscador + filtros */}
      <div className="flex flex-col sm:flex-row gap-3 items-start sm:items-center">
        <div className="relative flex-1">
          <Search className="absolute left-3 top-1/2 transform -translate-y-1/2 text-slate-400" size={20} />
          <input
            type="text"
            placeholder="Buscar por nombre o lote..."
            value={search}
            onChange={(e) => setSearch(e.target.value)}
            className="w-full pl-10 pr-4 py-2.5 bg-slate-50 border border-slate-200 rounded-xl text-sm focus:ring-2 focus:ring-amber-500"
          />
        </div>
        <div className="flex gap-2">
          {([
            { id: 'all' as const, label: `Todos (${accounts.length})` },
            { id: 'debt' as const, label: `Con deuda (${debtCount})` },
            { id: 'zero' as const, label: `Saldo 0 (${accounts.length - debtCount})` },
          ]).map((f) => (
            <button
              key={f.id}
              onClick={() => setFilter(f.id)}
              className={`px-3 py-2 rounded-lg text-sm font-semibold transition-all ${
                filter === f.id
                  ? 'bg-gradient-to-r from-amber-500 to-orange-600 text-white shadow-lg'
                  : 'bg-slate-100 text-slate-600 hover:bg-slate-200'
              }`}
            >
              {f.label}
            </button>
          ))}
        </div>
      </div>

      {/* Lista de cuentas */}
      <div className="space-y-3">
        {filteredAccounts.length === 0 && (
          <div className="text-center py-8 text-slate-500">
            <BookOpen className="mx-auto mb-2 text-slate-300" size={48} />
            <p>No hay cuentas que coincidan con el filtro</p>
          </div>
        )}

        {filteredAccounts.map((account) => {
          const isExpanded = expandedId === account.id;
          const hasDebt = Number(account.total_debt) > 0;
          const accTx = getAccountTransactions(account.id);

          return (
            <div key={account.id} className="bg-white rounded-xl shadow border border-slate-200 overflow-hidden">
              <div className="flex items-center gap-3 p-4">
                <div className={`flex-shrink-0 w-10 h-10 rounded-full flex items-center justify-center ${
                  hasDebt ? 'bg-amber-100' : 'bg-emerald-100'
                }`}>
                  {hasDebt ? <Clock className="text-amber-600" size={20} /> : <CheckCircle className="text-emerald-600" size={20} />}
                </div>

                <div className="flex-1 min-w-0">
                  <p className="font-bold text-slate-800 truncate">{account.customer_name}</p>
                  <p className="text-xs text-slate-500">Lote: {account.customer_lot}</p>
                </div>

                <div className="text-right">
                  <p className={`text-lg font-bold ${hasDebt ? 'text-amber-600' : 'text-emerald-600'}`}>
                    ${Number(account.total_debt).toFixed(2)}
                  </p>
                </div>

                <div className="flex items-center gap-1">
                  {hasDebt && (
                    <button
                      onClick={() => handleOpenPayment(account)}
                      className="bg-gradient-to-r from-emerald-500 to-teal-600 hover:from-emerald-600 hover:to-teal-700 text-white px-3 py-1.5 rounded-lg text-xs font-bold shadow transition-all"
                    >
                      Registrar Pago
                    </button>
                  )}
                  <button
                    onClick={() => printAccountCard(account)}
                    className="bg-slate-100 hover:bg-slate-200 text-slate-600 p-1.5 rounded-lg transition-all"
                    title="Imprimir tarjeta"
                  >
                    <Printer size={16} />
                  </button>
                  <button
                    onClick={() => setExpandedId(isExpanded ? null : account.id)}
                    className="bg-slate-100 hover:bg-slate-200 text-slate-600 p-1.5 rounded-lg transition-all"
                  >
                    {isExpanded ? <ChevronUp size={16} /> : <ChevronDown size={16} />}
                  </button>
                </div>
              </div>

              {isExpanded && (
                <div className="border-t border-slate-200 p-4 bg-slate-50">
                  <h4 className="text-sm font-bold text-slate-700 mb-3">Historial de movimientos</h4>
                  {accTx.length === 0 ? (
                    <p className="text-sm text-slate-400">Sin movimientos</p>
                  ) : (
                    <div className="overflow-x-auto">
                      <table className="w-full text-sm">
                        <thead>
                          <tr className="text-left text-xs text-slate-500 border-b border-slate-200">
                            <th className="py-2 px-2">Fecha</th>
                            <th className="py-2 px-2">Hora</th>
                            <th className="py-2 px-2">Tipo</th>
                            <th className="py-2 px-2 text-right">Monto</th>
                            <th className="py-2 px-2 text-right">Saldo</th>
                            <th className="py-2 px-2">Metodo</th>
                            <th className="py-2 px-2">Detalle</th>
                          </tr>
                        </thead>
                        <tbody>
                          {accTx.map((t) => (
                            <tr
                              key={t.id}
                              className={`border-b border-slate-100 ${t.sale_id ? 'cursor-pointer hover:bg-amber-50' : ''}`}
                              onClick={() => t.sale_id && handleViewSale(t.sale_id)}
                            >
                              <td className="py-2 px-2 text-slate-600">{formatDate(t.created_at)}</td>
                              <td className="py-2 px-2 text-slate-600">{formatTime(t.created_at)}</td>
                              <td className="py-2 px-2">
                                <span className={`px-2 py-0.5 rounded-full text-xs font-bold ${
                                  t.type === 'cargo' ? 'bg-red-100 text-red-700' : 'bg-emerald-100 text-emerald-700'
                                }`}>
                                  {t.type === 'cargo' ? 'Cargo' : 'Pago'}
                                </span>
                              </td>
                              <td className={`py-2 px-2 text-right font-bold ${t.type === 'cargo' ? 'text-red-600' : 'text-emerald-600'}`}>
                                {t.type === 'cargo' ? '+' : '-'}${Number(t.amount).toFixed(2)}
                              </td>
                              <td className="py-2 px-2 text-right text-slate-700">${Number(t.balance_after).toFixed(2)}</td>
                              <td className="py-2 px-2 text-slate-600">{t.payment_method || '-'}</td>
                              <td className="py-2 px-2 text-slate-600 flex items-center gap-1">
                                {t.sale_id && <Receipt size={14} className="text-amber-600" />}
                                {t.description}
                              </td>
                            </tr>
                          ))}
                        </tbody>
                      </table>
                    </div>
                  )}
                </div>
              )}
            </div>
          );
        })}
      </div>

      {/* MODAL REGISTRAR PAGO */}
      {showPaymentModal && paymentAccount && (
        <div className="fixed inset-0 bg-black/50 flex items-center justify-center z-50 p-4">
          <div className="bg-white rounded-2xl max-w-md w-full shadow-2xl overflow-hidden">
            <div className="bg-gradient-to-r from-amber-500 to-orange-600 p-6 text-white">
              <div className="flex items-center justify-between">
                <h2 className="text-xl font-bold">Registrar Pago</h2>
                <button onClick={() => setShowPaymentModal(false)} className="text-white/80 hover:text-white">
                  <X size={24} />
                </button>
              </div>
            </div>
            <div className="p-6 space-y-4">
              <div>
                <p className="text-sm text-slate-500">Cliente</p>
                <p className="font-bold text-slate-800">{paymentAccount.customer_name}</p>
                <p className="text-xs text-slate-500">Lote: {paymentAccount.customer_lot}</p>
              </div>
              <div>
                <p className="text-sm text-slate-500">Deuda actual</p>
                <p className="text-2xl font-bold text-amber-600">${Number(paymentAccount.total_debt).toFixed(2)}</p>
              </div>
              <div>
                <label className="block text-sm font-semibold text-slate-700 mb-1">Monto del pago</label>
                <input
                  type="number"
                  min={0}
                  max={Number(paymentAccount.total_debt)}
                  step="0.01"
                  value={paymentAmount || ''}
                  onChange={(e) => setPaymentAmount(parseFloat(e.target.value) || 0)}
                  className="w-full px-3 py-2 border-2 border-amber-300 rounded-lg text-right font-bold text-lg focus:ring-2 focus:ring-amber-400"
                />
                <p className="text-xs text-slate-500 mt-1">
                  Saldo despues del pago: <span className="font-bold">${(Number(paymentAccount.total_debt) - paymentAmount).toFixed(2)}</span>
                </p>
              </div>
              <div>
                <label className="block text-sm font-semibold text-slate-700 mb-1">Metodo de pago</label>
                <select
                  value={paymentMethod}
                  onChange={(e) => setPaymentMethod(e.target.value)}
                  className="w-full px-3 py-2 border-2 border-slate-300 rounded-lg font-medium focus:ring-2 focus:ring-amber-400"
                >
                  <option value="efectivo">Efectivo</option>
                  <option value="transferencia">Transferencia</option>
                  <option value="qr">QR</option>
                  <option value="expensas">Expensas</option>
                </select>
              </div>
              <button
                onClick={handleConfirmPayment}
                className="w-full bg-gradient-to-r from-emerald-500 to-teal-600 hover:from-emerald-600 hover:to-teal-700 text-white font-bold py-3 rounded-xl shadow-lg transition-all"
              >
                Confirmar Pago
              </button>
            </div>
          </div>
        </div>
      )}

      {/* MODAL DETALLE DE VENTA */}
      {showSaleModal && selectedSale && (
        <div className="fixed inset-0 bg-black/50 flex items-center justify-center z-50 p-4">
          <div className="bg-white rounded-2xl max-w-lg w-full shadow-2xl overflow-hidden max-h-[90vh] overflow-y-auto">
            <div className="bg-gradient-to-r from-blue-500 to-cyan-600 p-6 text-white">
              <div className="flex items-center justify-between">
                <h2 className="text-xl font-bold">Detalle de Venta</h2>
                <button onClick={() => setShowSaleModal(false)} className="text-white/80 hover:text-white">
                  <X size={24} />
                </button>
              </div>
            </div>
            <div className="p-6 space-y-4">
              <div className="grid grid-cols-2 gap-3 text-sm">
                <div><p className="text-slate-500">Numero</p><p className="font-bold text-slate-800">{selectedSale.sale_number}</p></div>
                <div><p className="text-slate-500">Fecha</p><p className="font-bold text-slate-800">{formatDate(selectedSale.created_at)} {formatTime(selectedSale.created_at)}</p></div>
                <div><p className="text-slate-500">Cliente</p><p className="font-bold text-slate-800">{selectedSale.customer_name || '-'}</p></div>
                <div><p className="text-slate-500">Lote</p><p className="font-bold text-slate-800">{selectedSale.customer_lot || '-'}</p></div>
                <div><p className="text-slate-500">Vendedor</p><p className="font-bold text-slate-800">{selectedSale.user_name}</p></div>
              </div>
              <table className="w-full text-sm border border-slate-200 rounded-lg overflow-hidden">
                <thead className="bg-slate-100">
                  <tr>
                    <th className="py-2 px-2 text-left">Producto</th>
                    <th className="py-2 px-2 text-right">Cant.</th>
                    <th className="py-2 px-2 text-right">Precio</th>
                    <th className="py-2 px-2 text-right">Subtotal</th>
                  </tr>
                </thead>
                <tbody>
                  {(selectedSale.items || []).map((item, i) => (
                    <tr key={i} className="border-t border-slate-100">
                      <td className="py-2 px-2">{item.product_name}</td>
                      <td className="py-2 px-2 text-right">{item.quantity}</td>
                      <td className="py-2 px-2 text-right">${Number(item.price).toFixed(2)}</td>
                      <td className="py-2 px-2 text-right">${Number(item.subtotal).toFixed(2)}</td>
                    </tr>
                  ))}
                </tbody>
              </table>
              {Number(selectedSale.discount) > 0 && (
                <div className="flex justify-between text-sm">
                  <span className="text-slate-500">Descuento:</span>
                  <span className="font-bold text-red-600">-${Number(selectedSale.discount).toFixed(2)}</span>
                </div>
              )}
              <div className="flex justify-between text-lg font-bold border-t-2 border-slate-200 pt-3">
                <span>Total:</span>
                <span className="text-emerald-600">${Number(selectedSale.total).toFixed(2)}</span>
              </div>
            </div>
          </div>
        </div>
      )}

      {/* MODAL DEUDAS ANTIGUAS */}
      {showOldDebtsModal && oldDebts.length > 0 && (
        <div className="fixed inset-0 bg-black/50 flex items-center justify-center z-50 p-4">
          <div className="bg-white rounded-2xl max-w-md w-full shadow-2xl overflow-hidden">
            <div className="bg-gradient-to-r from-red-500 to-red-700 p-6 text-center">
              <AlertCircle className="text-white mx-auto mb-2" size={40} />
              <h2 className="text-xl font-bold text-white">Deudas Antiguas Detectadas</h2>
            </div>
            <div className="p-6">
              <p className="text-sm text-slate-700 mb-4 text-center">
                Los siguientes clientes tienen deuda de mas de 30 dias. Llamar para cobrar.
              </p>
              <div className="space-y-2 max-h-60 overflow-y-auto">
                {oldDebts.map((debt, i) => (
                  <div key={i} className="flex items-center justify-between bg-red-50 border border-red-200 rounded-lg px-3 py-2">
                    <div>
                      <p className="font-bold text-sm text-slate-800">{debt.name}</p>
                      <p className="text-xs text-slate-500">Lote: {debt.lot} - {debt.days} dias</p>
                    </div>
                    <span className="font-bold text-red-600">${debt.debt.toFixed(2)}</span>
                  </div>
                ))}
              </div>
              <button
                onClick={() => setShowOldDebtsModal(false)}
                className="w-full mt-4 bg-gradient-to-r from-red-500 to-red-600 hover:from-red-600 hover:to-red-700 text-white font-bold py-3 rounded-xl shadow-lg transition-all"
              >
                Aceptar
              </button>
            </div>
          </div>
        </div>
      )}
    </div>
  );
}
