import { useState, useEffect } from 'react';
import { supabase, Sale, Configuration } from '../lib/supabase';
import {
  BarChart3,
  DollarSign,
  ShoppingBag,
  TrendingUp,
  Calendar,
  X,
  Printer,
  Download,
} from 'lucide-react';

export default function Reportes() {
  const [sales, setSales] = useState<Sale[]>([]);
  const [cashTransactions, setCashTransactions] = useState<any[]>([]);
  const [loading, setLoading] = useState(true);
  const [dateFilter, setDateFilter] = useState('today');
  const [selectedSale, setSelectedSale] = useState<Sale | null>(null);
  const [config, setConfig] = useState<Configuration | null>(null);

  useEffect(() => {
    loadData();
    loadConfig();
  }, [dateFilter]);

  const loadConfig = async () => {
    const { data } = await supabase
      .from('configuration')
      .select('*')
      .maybeSingle();
    if (data) setConfig(data);
  };

  const loadData = async () => {
    setLoading(true);

    let salesQuery = supabase
      .from('sales')
      .select('*')
      .order('created_at', { ascending: false });

    let cashQuery = supabase
      .from('cash_transactions')
      .select('*')
      .order('created_at', { ascending: false });

    if (dateFilter === 'today') {
      const hoursAgo24 = new Date();
      hoursAgo24.setHours(hoursAgo24.getHours() - 24);
      const from = hoursAgo24.toISOString();
      salesQuery = salesQuery.gte('created_at', from);
      cashQuery = cashQuery.gte('created_at', from);
    } else if (dateFilter === 'week') {
      const daysAgo7 = new Date();
      daysAgo7.setDate(daysAgo7.getDate() - 7);
      const from = daysAgo7.toISOString();
      salesQuery = salesQuery.gte('created_at', from);
      cashQuery = cashQuery.gte('created_at', from);
    } else if (dateFilter === 'month') {
      const daysAgo30 = new Date();
      daysAgo30.setDate(daysAgo30.getDate() - 30);
      const from = daysAgo30.toISOString();
      salesQuery = salesQuery.gte('created_at', from);
      cashQuery = cashQuery.gte('created_at', from);
    }

    const [{ data: salesData }, { data: cashData }] = await Promise.all([
      salesQuery,
      cashQuery,
    ]);

    setSales(salesData || []);
    setCashTransactions(cashData || []);
    setLoading(false);
  };

  const formatDate = (iso: string) => {
    const d = new Date(iso);
    return d.toLocaleDateString('es-AR', {
      timeZone: 'America/Argentina/Buenos_Aires',
      day: '2-digit',
      month: '2-digit',
      year: 'numeric',
    });
  };

  const formatTime = (iso: string) => {
    const d = new Date(iso);
    return d.toLocaleTimeString('es-AR', {
      timeZone: 'America/Argentina/Buenos_Aires',
      hour: '2-digit',
      minute: '2-digit',
      second: '2-digit',
    });
  };

  // Desglose por venta
  const getPaymentBreakdownForSale = (sale: Sale) => {
    let efectivo = 0;
    let transferencia = 0;
    let qr = 0;
    let expensa = 0;

    if (sale.payments && Array.isArray(sale.payments)) {
      sale.payments.forEach((payment) => {
        const amount = Number(payment.amount) || 0;
        const method = String(payment.method || '').toLowerCase();

        if (method === 'efectivo') efectivo += amount;
        else if (method === 'transferencia') transferencia += amount;
        else if (method === 'qr') qr += amount;
        else if (method === 'expensas' || method === 'expensa') expensa += amount;
      });
    } else {
      const related = cashTransactions.filter(
        (tx) =>
          tx.type === 'income' &&
          tx.category === 'venta' &&
          typeof tx.description === 'string' &&
          tx.description.startsWith(`Venta ${sale.sale_number}`)
      );

      related.forEach((tx) => {
        const amount = Number(tx.amount) || 0;
        const method = String(tx.payment_method || '').toLowerCase();

        if (method === 'efectivo') efectivo += amount;
        else if (method === 'transferencia') transferencia += amount;
        else if (method === 'qr') qr += amount;
        else if (method === 'expensas' || method === 'expensa') expensa += amount;
      });
    }

    return { efectivo, transferencia, qr, expensa };
  };

  const buildMethodLabel = (
    breakdown: ReturnType<typeof getPaymentBreakdownForSale>,
    fallback: string
  ) => {
    const parts: string[] = [];
    if (breakdown.efectivo > 0) parts.push('Efectivo');
    if (breakdown.transferencia > 0) parts.push('Transferencia');
    if (breakdown.qr > 0) parts.push('QR');
    if (breakdown.expensa > 0) parts.push('Expensa');

    if (parts.length) return parts.join(' + ');

    // Si no encontramos nada por movimientos de caja, usamos lo que tenga la venta
    return fallback || '';
  };

  const exportToCSV = () => {
    const formatNumber = (num: number): string => {
      return num.toFixed(2).replace('.', ',');
    };

    // Columnas con el formato de tu Excel:
    const headers = [
      'Fecha',
      'Hora',
      'Tipo',
      'Recibo',
      'ID Retiro',
      'Cliente',
      'Lote',
      'Origen',
      'Item',
      'Cantidad',
      'Precio Unitario',
      'Subtotal Item',
      'Total Transacción',
      'Método',
      'Efectivo',
      'Transferencia',
      'QR',
      'Expensa',
    ];

    const rows: (string | number)[][] = [];

    // 1) Ventas
    sales.forEach((sale) => {
      const items = Array.isArray(sale.items) ? sale.items : [];
      const cliente =
        (sale as any).customer_name || (sale as any).customer || 'Cliente general';
      const lote = (sale as any).customer_lot || '';

      const breakdown = getPaymentBreakdownForSale(sale);
      const metodoLabel = buildMethodLabel(breakdown, sale.payment_method);

      if (items.length === 0) {
        // Venta sin items (por seguridad)
        rows.push([
          formatDate(sale.created_at),          // Fecha
          formatTime(sale.created_at),          // Hora
          'Kiosco',                             // Tipo
          sale.sale_number,                     // Recibo
          '',                                   // ID Retiro
          cliente,                              // Cliente
          lote,                                 // Lote
          'Kiosco',                             // Origen
          'Venta',                              // Item
          1,                                    // Cantidad
          formatNumber(Number(sale.total)),        // Precio Unitario
          formatNumber(Number(sale.total)),        // Subtotal Item
          formatNumber(Number(sale.total)),        // Total Transacción
          metodoLabel,                          // Método
          formatNumber(breakdown.efectivo),        // Efectivo
          formatNumber(breakdown.transferencia),   // Transferencia
          formatNumber(breakdown.qr),              // QR
          formatNumber(breakdown.expensa),         // Expensa
        ]);
      } else {
        items.forEach((item, index) => {
          const isFirst = index === 0;

          rows.push([
            formatDate(sale.created_at),          // Fecha
            formatTime(sale.created_at),          // Hora
            'Kiosco',                             // Tipo
            sale.sale_number,                     // Recibo
            '',                                   // ID Retiro
            cliente,                              // Cliente
            lote,                                 // Lote
            'Kiosco',                             // Origen
            item.product_name,                    // Item
            item.quantity,                        // Cantidad
            formatNumber(Number(item.price)),        // Precio Unitario
            formatNumber(Number(item.subtotal)),     // Subtotal Item
            isFirst ? formatNumber(Number(sale.total)) : '', // Total Transacción
            isFirst ? metodoLabel : '',           // Método
            isFirst ? formatNumber(breakdown.efectivo) : '',      // Efectivo
            isFirst ? formatNumber(breakdown.transferencia) : '', // Transferencia
            isFirst ? formatNumber(breakdown.qr) : '',            // QR
            isFirst ? formatNumber(breakdown.expensa) : '',       // Expensa
          ]);
        });
      }
    });

    // 2) Egresos (gastos) desde cash_transactions
    const expenses = cashTransactions.filter((tx) => tx.type === 'expense');

    expenses.forEach((tx) => {
      const amount = Number(tx.amount) || 0;
      const metodo = String(tx.payment_method || '');
      const desc = tx.description || tx.category || 'Gasto';
      const lower = metodo.toLowerCase();

      let efectivo = '';
      let transferencia = '';
      let qr = '';
      let expensa = '';

      const neg = formatNumber(-amount);

      if (lower === 'efectivo') efectivo = neg;
      else if (lower === 'transferencia') transferencia = neg;
      else if (lower === 'qr') qr = neg;
      else if (lower === 'expensas' || lower === 'expensa') expensa = neg;

      rows.push([
        formatDate(tx.created_at),   // Fecha
        formatTime(tx.created_at),   // Hora
        'Gasto',                     // Tipo
        '',                          // Recibo
        '',                          // ID Retiro
        '',                          // Cliente
        '',                          // Lote
        'Kiosco',                    // Origen
        `EGRESO - ${desc}`,          // Item
        1,                           // Cantidad
        neg,                         // Precio Unitario
        neg,                         // Subtotal Item
        neg,                         // Total Transacción
        metodo,                      // Método
        efectivo,                    // Efectivo
        transferencia,               // Transferencia
        qr,                          // QR
        expensa,                     // Expensa
      ]);
    });

    const csvContent = [
      headers.join(','),
      ...rows.map((row) =>
        row
          .map((value) => {
            const v = String(value ?? '');
            // Escapar comas, comillas y saltos de línea
            if (v.includes(',') || v.includes('"') || v.includes('\n')) {
              return `"${v.replace(/"/g, '""')}"`;
            }
            return v;
          })
          .join(',')
      ),
    ].join('\n');

    const blob = new Blob([csvContent], {
      type: 'text/csv;charset=utf-8;',
    });
    const link = document.createElement('a');
    link.href = URL.createObjectURL(blob);
    link.download = `reporte_ventas_${dateFilter}_${
      new Date().toISOString().split('T')[0]
    }.csv`;
    link.click();
  };

  // ---------- RESTO DEL COMPONENTE (igual que antes) ----------

  const printSales = () => {
    const printWindow = window.open('', '', 'height=600,width=800');
    if (!printWindow) return;

    const totalSales = sales.reduce((sum, s) => sum + Number(s.total), 0);

    printWindow.document.write(`
      <html>
        <head>
          <title>Reporte de Ventas</title>
          <style>
            body { font-family: Arial, sans-serif; padding: 20px; }
            h1 { text-align: center; color: #333; }
            table { width: 100%; border-collapse: collapse; margin-top: 20px; }
            th, td { border: 1px solid #ddd; padding: 8px; text-left; }
            th { background-color: #f3f4f6; font-weight: bold; }
            .total { margin-top: 20px; text-align: right; font-size: 18px; font-weight: bold; }
          </style>
        </head>
        <body>
          <h1>${config?.business_name || 'Kiosco'} - Reporte de Ventas</h1>
          <p><strong>Período:</strong> ${
            dateFilter === 'today'
              ? 'Hoy'
              : dateFilter === 'week'
              ? 'Última Semana'
              : dateFilter === 'month'
              ? 'Último Mes'
              : 'Todo'
          }</p>
          <p><strong>Fecha de emisión:</strong> ${new Date().toLocaleString(
            'es-AR',
            { timeZone: 'America/Argentina/Buenos_Aires' }
          )}</p>
          <table>
            <thead>
              <tr>
                <th>Número</th>
                <th>Fecha</th>
                <th>Usuario</th>
                <th>Items</th>
                <th>Método</th>
                <th>Total</th>
              </tr>
            </thead>
            <tbody>
              ${sales
                .map((sale) => {
                  const items = Array.isArray(sale.items) ? sale.items : [];
                  const itemCount = items.reduce(
                    (sum, item) => sum + item.quantity,
                    0
                  );
                  return `
                  <tr>
                    <td>${sale.sale_number}</td>
                    <td>${new Date(
                      sale.created_at
                    ).toLocaleString('es-AR', { timeZone: 'America/Argentina/Buenos_Aires' })}</td>
                    <td>${sale.user_name}</td>
                    <td>${itemCount}</td>
                    <td>${sale.payment_method}</td>
                    <td>$${Number(sale.total).toFixed(2)}</td>
                  </tr>
                `;
                })
                .join('')}
            </tbody>
          </table>
          <div class="total">
            Total de Ventas: ${sales.length} | Monto Total: $${totalSales.toFixed(
      2
    )}
          </div>
        </body>
      </html>
    `);

    printWindow.document.close();
    printWindow.print();
  };

  const printTicket = (sale: Sale) => {
    const printWindow = window.open('', '', 'height=600,width=400');
    if (!printWindow) return;

    const items = Array.isArray(sale.items) ? sale.items : [];

    printWindow.document.write(`
      <html>
        <head>
          <title>Ticket ${sale.sale_number}</title>
          <style>
            body {
              font-family: 'Courier New', monospace;
              padding: 10px;
              max-width: 300px;
              margin: 0 auto;
            }
            .header { text-align: center; margin-bottom: 15px; border-bottom: 2px dashed #000; padding-bottom: 10px; }
            .header h2 { margin: 5px 0; font-size: 18px; }
            .header p { margin: 3px 0; font-size: 12px; }
            .info { margin: 10px 0; font-size: 12px; }
            .items { margin: 15px 0; }
            .item { display: flex; justify-content: space-between; margin: 5px 0; font-size: 12px; }
            .totals { border-top: 2px dashed #000; padding-top: 10px; margin-top: 10px; }
            .total-row { display: flex; justify-content: space-between; margin: 5px 0; }
            .total-row.final { font-weight: bold; font-size: 14px; margin-top: 10px; }
            .footer { text-align: center; margin-top: 15px; border-top: 2px dashed #000; padding-top: 10px; font-size: 11px; }
          </style>
        </head>
        <body>
          <div class="header">
            <h2>${config?.business_name || 'Kiosco'}</h2>
            ${config?.address ? `<p>${config.address}</p>` : ''}
            ${config?.phone ? `<p>Tel: ${config.phone}</p>` : ''}
            ${config?.tax_id ? `<p>CUIT: ${config.tax_id}</p>` : ''}
          </div>

          <div class="info">
            <p><strong>Ticket:</strong> ${sale.sale_number}</p>
            <p><strong>Fecha:</strong> ${new Date(
              sale.created_at
            ).toLocaleString('es-AR', { timeZone: 'America/Argentina/Buenos_Aires' })}</p>
            <p><strong>Vendedor:</strong> ${sale.user_name}</p>
            <p><strong>Pago:</strong> ${sale.payment_method}</p>
          </div>

          <div class="items">
            <div style="border-bottom: 1px solid #000; margin-bottom: 10px; padding-bottom: 5px;">
              <strong>PRODUCTOS</strong>
            </div>
            ${items
              .map(
                (item) => `
              <div class="item">
                <div>
                  <div>${item.product_name}</div>
                  <div style="font-size: 10px;">${
                    item.quantity
                  } x $${Number(item.price).toFixed(2)}</div>
                </div>
                <div>$${Number(item.subtotal).toFixed(2)}</div>
              </div>
            `
              )
              .join('')}
          </div>

          <div class="totals">
            <div class="total-row">
              <span>Subtotal:</span>
              <span>$${Number(sale.subtotal).toFixed(2)}</span>
            </div>
            ${
              sale.discount > 0
                ? `
              <div class="total-row">
                <span>Descuento:</span>
                <span>-$${Number(sale.discount).toFixed(2)}</span>
              </div>
            `
                : ''
            }
            <div class="total-row final">
              <span>TOTAL:</span>
              <span>$${Number(sale.total).toFixed(2)}</span>
            </div>
          </div>

          <div class="footer">
            <p>${config?.receipt_message || 'Gracias por su compra'}</p>
          </div>
        </body>
      </html>
    `);

    printWindow.document.close();
    printWindow.print();
  };

  const totalSales = sales.reduce((sum, s) => sum + Number(s.total), 0);
  const totalItems = sales.reduce((sum, s) => {
    const items = Array.isArray(s.items) ? s.items : [];
    return (
      sum +
      items.reduce((itemSum, item) => itemSum + item.quantity, 0)
    );
  }, 0);
  const avgTicket = sales.length > 0 ? totalSales / sales.length : 0;

  const paymentMethodTotals = sales.reduce((acc, s) => {
    acc[s.payment_method] = (acc[s.payment_method] || 0) + Number(s.total);
    return acc;
  }, {} as Record<string, number>);

  return (
    <div className="space-y-6">
      <div className="flex items-center justify-between flex-wrap gap-4">
        <h3 className="text-xl font-bold text-slate-800">
          Resumen de Ventas
        </h3>
        <div className="flex gap-2 flex-wrap">
          <select
            value={dateFilter}
            onChange={(e) => setDateFilter(e.target.value)}
            className="px-4 py-2 bg-white border-2 border-slate-200 rounded-xl font-medium focus:ring-2 focus:ring-orange-500"
          >
            <option value="today">Hoy</option>
            <option value="week">Última Semana</option>
            <option value="month">Último Mes</option>
            <option value="all">Todo</option>
          </select>
          <button
            onClick={exportToCSV}
            className="px-4 py-2 bg-gradient-to-r from-emerald-500 to-teal-600 hover:from-emerald-600 hover:to-teal-700 text-white rounded-xl flex items-center gap-2 font-medium shadow-lg transition-all"
          >
            <Download size={18} />
            Exportar CSV
          </button>
          <button
            onClick={printSales}
            className="px-4 py-2 bg-gradient-to-r from-blue-500 to-cyan-600 hover:from-blue-600 hover:to-cyan-700 text-white rounded-xl flex items-center gap-2 font-medium shadow-lg transition-all"
          >
            <Printer size={18} />
            Imprimir
          </button>
        </div>
      </div>

      {loading ? (
        <div className="text-center py-8">Cargando...</div>
      ) : (
        <>
          <div className="grid grid-cols-1 md:grid-cols-4 gap-4">
            <div className="bg-gradient-to-br from-blue-500 to-blue-600 rounded-xl p-6 text-white shadow-lg">
              <div className="flex items-center justify-between">
                <div>
                  <p className="text-blue-100 text-sm">Total Ventas</p>
                  <p className="text-3xl font-bold mt-2">${totalSales.toFixed(2)}</p>
                </div>
                <DollarSign className="opacity-80" size={40} />
              </div>
            </div>

            <div className="bg-gradient-to-br from-emerald-500 to-emerald-600 rounded-xl p-6 text-white shadow-lg">
              <div className="flex items-center justify-between">
                <div>
                  <p className="text-emerald-100 text-sm">Cantidad</p>
                  <p className="text-3xl font-bold mt-2">{sales.length}</p>
                </div>
                <ShoppingBag className="opacity-80" size={40} />
              </div>
            </div>

            <div className="bg-gradient-to-br from-purple-500 to-purple-600 rounded-xl p-6 text-white shadow-lg">
              <div className="flex items-center justify-between">
                <div>
                  <p className="text-purple-100 text-sm">Ticket Promedio</p>
                  <p className="text-3xl font-bold mt-2">${avgTicket.toFixed(2)}</p>
                </div>
                <TrendingUp className="opacity-80" size={40} />
              </div>
            </div>

            <div className="bg-gradient-to-br from-orange-500 to-orange-600 rounded-xl p-6 text-white shadow-lg">
              <div className="flex items-center justify-between">
                <div>
                  <p className="text-orange-100 text-sm">Items Vendidos</p>
                  <p className="text-3xl font-bold mt-2">{totalItems}</p>
                </div>
                <BarChart3 className="opacity-80" size={40} />
              </div>
            </div>
          </div>

          <div className="bg-white rounded-xl shadow-lg p-6">
            <h4 className="text-lg font-bold text-slate-800 mb-4">Ventas por Método de Pago</h4>
            <div className="grid grid-cols-2 md:grid-cols-4 gap-4">
              {Object.entries(paymentMethodTotals).map(([method, total]) => (
                <div key={method} className="bg-slate-50 rounded-lg p-4">
                  <p className="text-sm text-slate-600 capitalize">{method}</p>
                  <p className="text-xl font-bold text-slate-800">${total.toFixed(2)}</p>
                </div>
              ))}
            </div>
          </div>

          <div className="bg-white rounded-xl shadow-lg overflow-hidden">
            <div className="overflow-x-auto">
              <table className="w-full">
                <thead className="bg-slate-50">
                  <tr>
                    <th className="px-6 py-3 text-left text-xs font-medium text-slate-500 uppercase tracking-wider">
                      Número
                    </th>
                    <th className="px-6 py-3 text-left text-xs font-medium text-slate-500 uppercase tracking-wider">
                      Fecha
                    </th>
                    <th className="px-6 py-3 text-left text-xs font-medium text-slate-500 uppercase tracking-wider">
                      Usuario
                    </th>
                    <th className="px-6 py-3 text-left text-xs font-medium text-slate-500 uppercase tracking-wider">
                      Items
                    </th>
                    <th className="px-6 py-3 text-left text-xs font-medium text-slate-500 uppercase tracking-wider">
                      Método
                    </th>
                    <th className="px-6 py-3 text-left text-xs font-medium text-slate-500 uppercase tracking-wider">
                      Total
                    </th>
                    <th className="px-6 py-3 text-left text-xs font-medium text-slate-500 uppercase tracking-wider">
                      Acciones
                    </th>
                  </tr>
                </thead>
                <tbody className="bg-white divide-y divide-slate-200">
                  {sales.map((sale) => {
                    const items = Array.isArray(sale.items) ? sale.items : [];
                    const itemCount = items.reduce(
                      (sum, item) => sum + item.quantity,
                      0
                    );

                    return (
                      <tr key={sale.id} className="hover:bg-slate-50">
                        <td className="px-6 py-4 whitespace-nowrap text-sm font-medium text-slate-900">
                          {sale.sale_number}
                        </td>
                        <td className="px-6 py-4 whitespace-nowrap text-sm text-slate-500">
                          {new Date(sale.created_at).toLocaleString('es-AR', {
                            timeZone: 'America/Argentina/Buenos_Aires'
                          })}
                        </td>
                        <td className="px-6 py-4 whitespace-nowrap text-sm text-slate-500">
                          {sale.user_name}
                        </td>
                        <td className="px-6 py-4 whitespace-nowrap text-sm text-slate-500">
                          {itemCount}
                        </td>
                        <td className="px-6 py-4 whitespace-nowrap text-sm text-slate-500 capitalize">
                          {sale.payment_method}
                        </td>
                        <td className="px-6 py-4 whitespace-nowrap text-sm font-medium text-slate-900">
                          ${Number(sale.total).toFixed(2)}
                        </td>
                        <td className="px-6 py-4 whitespace-nowrap text-sm">
                          <button
                            onClick={() => setSelectedSale(sale)}
                            className="text-blue-600 hover:text-blue-800 font-medium"
                          >
                            Ver
                          </button>
                        </td>
                      </tr>
                    );
                  })}
                </tbody>
              </table>
              {sales.length === 0 && (
                <div className="text-center py-8 text-slate-500">
                  No hay ventas para mostrar en este período
                </div>
              )}
            </div>
          </div>
        </>
      )}

      {selectedSale && (
        <div className="fixed inset-0 bg-black bg-opacity-50 flex items-center justify-center p-4 z-50">
          <div className="bg-white rounded-xl max-w-2xl w-full max-h-[90vh] overflow-y-auto">
            <div className="sticky top-0 bg-white border-b px-6 py-4 flex items-center justify-between">
              <h3 className="text-xl font-bold text-slate-800">
                Detalle de Venta - {selectedSale.sale_number}
              </h3>
              <button
                onClick={() => setSelectedSale(null)}
                className="text-slate-400 hover:text-slate-600"
              >
                <X size={24} />
              </button>
            </div>
            <div className="p-6">
              <div className="grid grid-cols-2 gap-4 mb-6">
                <div>
                  <p className="text-sm text-slate-600">Fecha</p>
                  <p className="font-medium">
                    {new Date(selectedSale.created_at).toLocaleString('es-AR', {
                      timeZone: 'America/Argentina/Buenos_Aires'
                    })}
                  </p>
                </div>
                <div>
                  <p className="text-sm text-slate-600">Usuario</p>
                  <p className="font-medium">{selectedSale.user_name}</p>
                </div>
                <div>
                  <p className="text-sm text-slate-600">Método de Pago</p>
                  <p className="font-medium capitalize">{selectedSale.payment_method}</p>
                </div>
                {selectedSale.customer_name && (
                  <>
                    <div>
                      <p className="text-sm text-slate-600">Cliente</p>
                      <p className="font-medium">{selectedSale.customer_name}</p>
                    </div>
                    <div>
                      <p className="text-sm text-slate-600">Lote</p>
                      <p className="font-medium">{selectedSale.customer_lot}</p>
                    </div>
                  </>
                )}
              </div>

              {selectedSale.payments && selectedSale.payments.length > 0 && (
                <div className="mb-6">
                  <h4 className="font-semibold text-slate-800 mb-2">Desglose de Pagos</h4>
                  <div className="bg-slate-50 rounded-lg p-4 space-y-2">
                    {selectedSale.payments.map((payment, idx) => (
                      <div key={idx} className="flex justify-between">
                        <span className="capitalize">{payment.method}:</span>
                        <span className="font-medium">${payment.amount.toFixed(2)}</span>
                      </div>
                    ))}
                  </div>
                </div>
              )}

              <div className="mb-6">
                <h4 className="font-semibold text-slate-800 mb-2">Items</h4>
                <div className="border rounded-lg overflow-hidden">
                  <table className="w-full">
                    <thead className="bg-slate-50">
                      <tr>
                        <th className="px-4 py-2 text-left text-sm font-medium text-slate-600">
                          Producto
                        </th>
                        <th className="px-4 py-2 text-center text-sm font-medium text-slate-600">
                          Cant.
                        </th>
                        <th className="px-4 py-2 text-right text-sm font-medium text-slate-600">
                          Precio
                        </th>
                        <th className="px-4 py-2 text-right text-sm font-medium text-slate-600">
                          Subtotal
                        </th>
                      </tr>
                    </thead>
                    <tbody>
                      {Array.isArray(selectedSale.items) &&
                        selectedSale.items.map((item, idx) => (
                          <tr key={idx} className="border-t">
                            <td className="px-4 py-2 text-sm">{item.product_name}</td>
                            <td className="px-4 py-2 text-sm text-center">
                              {item.quantity}
                            </td>
                            <td className="px-4 py-2 text-sm text-right">
                              ${Number(item.price).toFixed(2)}
                            </td>
                            <td className="px-4 py-2 text-sm text-right font-medium">
                              ${Number(item.subtotal).toFixed(2)}
                            </td>
                          </tr>
                        ))}
                    </tbody>
                  </table>
                </div>
              </div>

              <div className="border-t pt-4">
                <div className="flex justify-between text-lg font-bold">
                  <span>Total:</span>
                  <span>${Number(selectedSale.total).toFixed(2)}</span>
                </div>
              </div>

              <div className="mt-6 flex gap-2">
                <button
                  onClick={() => printTicket(selectedSale)}
                  className="flex-1 px-4 py-2 bg-blue-600 hover:bg-blue-700 text-white rounded-lg flex items-center justify-center gap-2"
                >
                  <Printer size={18} />
                  Imprimir Ticket
                </button>
              </div>
            </div>
          </div>
        </div>
      )}
    </div>
  );
}
