import { useState, useEffect } from 'react';
import { supabase, Product, SaleItem, Shift } from '../lib/supabase';
import { Search, Minus, Plus, Trash2, ShoppingCart, CreditCard } from 'lucide-react';

interface VentasProps {
  shift: Shift | null;
}

export default function Ventas({ shift }: VentasProps) {
  const [products, setProducts] = useState<Product[]>([]);
  const [cart, setCart] = useState<SaleItem[]>([]);
  const [search, setSearch] = useState('');

  // Filtro por categoría
  const [selectedCategory, setSelectedCategory] = useState<string>('todas');

  // Datos del cliente
  const [customerName, setCustomerName] = useState('');
  const [customerLot, setCustomerLot] = useState('');

  // Montos por método de pago
  const [cashAmount, setCashAmount] = useState(0);
  const [transferAmount, setTransferAmount] = useState(0);
  const [qrAmount, setQrAmount] = useState(0);
  const [expensasAmount, setExpensasAmount] = useState(0);

  useEffect(() => {
    loadProducts();
  }, []);

  const total = cart.reduce((sum, i) => sum + i.subtotal, 0);

  // Ajuste automático de montos cuando cambia el total
  useEffect(() => {
    const sum = cashAmount + transferAmount + qrAmount + expensasAmount;

    // Si hay total y no se ingresó nada, por defecto todo efectivo
    if (total > 0 && sum === 0) {
      setCashAmount(total);
    }

    // Si no hay total pero quedaron montos cargados, los reseteamos
    if (total === 0 && sum !== 0) {
      setCashAmount(0);
      setTransferAmount(0);
      setQrAmount(0);
      setExpensasAmount(0);
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [total]);

  const loadProducts = async () => {
    const { data } = await supabase
      .from('products')
      .select('*')
      .eq('active', true)
      .gt('stock', 0);

    setProducts(data || []);
  };

  const addToCart = (product: Product) => {
    const existing = cart.find((i) => i.product_id === product.id);
    if (existing) {
      if (existing.quantity >= product.stock) {
        return alert('Stock insuficiente');
      }
      setCart(
        cart.map((i) =>
          i.product_id === product.id
            ? {
                ...i,
                quantity: i.quantity + 1,
                subtotal: (i.quantity + 1) * i.price,
              }
            : i
        )
      );
    } else {
      setCart([
        ...cart,
        {
          product_id: product.id,
          product_name: product.name,
          quantity: 1,
          price: product.price,
          subtotal: product.price,
        },
      ]);
    }
  };

  const updateQuantity = (id: string, qty: number) => {
    if (qty <= 0) {
      return setCart(cart.filter((i) => i.product_id !== id));
    }
    setCart(
      cart.map((i) =>
        i.product_id === id
          ? { ...i, quantity: qty, subtotal: qty * i.price }
          : i
      )
    );
  };

  const updatePrice = (id: string, newPrice: number) => {
    if (newPrice < 0) return;
    setCart(
      cart.map((i) =>
        i.product_id === id
          ? { ...i, price: newPrice, subtotal: i.quantity * newPrice }
          : i
      )
    );
  };

  const parseAmount = (value: string) => {
    if (!value) return 0;
    const n = parseFloat(value.replace(',', '.'));
    return isNaN(n) ? 0 : n;
  };

  const handleCompleteSale = async () => {
    if (!cart.length || !shift) {
      return alert('Carrito vacío o sin turno activo');
    }

    // Armar lista de pagos en base a los montos
    let payments = [
      { method: 'efectivo', amount: cashAmount },
      { method: 'transferencia', amount: transferAmount },
      { method: 'qr', amount: qrAmount },
      { method: 'expensas', amount: expensasAmount },
    ].filter((p) => p.amount > 0.009);

    // Si no se ingresó nada, por defecto todo efectivo
    if (payments.length === 0) {
      payments = [{ method: 'efectivo', amount: total }];
      setCashAmount(total);
    }

    const paymentsTotal = payments.reduce((sum, p) => sum + p.amount, 0);

    if (Math.abs(paymentsTotal - total) > 0.01) {
      return alert(
        `La suma de los montos de pago (${paymentsTotal.toFixed(
          2
        )}) no coincide con el total (${total.toFixed(2)}).`
      );
    }

    // Si hay algún pago que no sea efectivo, pedir nombre y lote
    const hasNonCash = payments.some((p) => p.method !== 'efectivo');
    if (hasNonCash && (!customerName.trim() || !customerLot.trim())) {
      return alert(
        'Para pagos que no son en efectivo debés completar el nombre y el lote del cliente.'
      );
    }

    // *** IMPORTANTE ***
    // payment_method que se guarda en la tabla debe ser UNO de:
    // 'efectivo', 'transferencia', 'qr', 'expensas'
    // para no violar posibles constraints del esquema.
    let storedPaymentMethod = payments[0].method; // por defecto el primero
    if (payments.some((p) => p.method === 'efectivo')) {
      storedPaymentMethod = 'efectivo';
    }

    const saleData = {
      sale_number: `V-${Date.now()}`,
      user_id: shift.user_id,
      user_name: shift.user_name,
      shift_id: shift.id,
      items: cart,
      subtotal: total,
      discount: 0,
      total,
      payment_method: storedPaymentMethod,
      customer_name: customerName.trim() || null,
      customer_lot: customerLot.trim() || null,
      payments: payments,
    };

    const { data: saleResult, error: saleError } = await supabase.from('sales').insert([saleData]).select().single();
    if (saleError) {
      console.error('Error insertando venta:', saleError);
      alert(`Error al registrar la venta: ${saleError.message}`);
      return;
    }

    // Actualizar stock
    for (const item of cart) {
      const prod = products.find((p) => p.id === item.product_id);
      if (prod) {
        const { error: stockError } = await supabase
          .from('products')
          .update({ stock: prod.stock - item.quantity })
          .eq('id', item.product_id);

        if (stockError) {
          console.error('Error actualizando stock:', stockError);
        }
      }
    }

    // Registrar movimientos de inventario
    const inventoryMovements = cart.map((item) => {
      const prod = products.find((p) => p.id === item.product_id);
      return {
        product_id: item.product_id,
        product_name: item.product_name,
        category: prod?.category || '',
        movement_type: 'sale',
        quantity: item.quantity,
        unit_price: item.price,
        total_amount: item.subtotal,
        sale_number: saleData.sale_number,
        sale_id: saleResult?.id,
        description: `Venta ${saleData.sale_number}${customerName.trim() ? ` - ${customerName.trim()}` : ''}`
      };
    });

    await supabase.from('inventory_movements').insert(inventoryMovements);

    // Movimientos de caja: uno por método
    const cashRows = payments.map((p) => ({
      shift_id: shift.id,
      type: 'income',
      category: 'venta',
      amount: p.amount,
      payment_method: p.method,
      description: `Venta ${saleData.sale_number}${
        customerName.trim() || customerLot.trim()
          ? ` - ${customerName.trim()} (Lote ${customerLot.trim() || '-'})`
          : ''
      }`,
    }));

    const { error: cashError } = await supabase
      .from('cash_transactions')
      .insert(cashRows);

    if (cashError) {
      console.error('Error insertando caja:', cashError);
      alert(
        'La venta se registró, pero hubo un error al registrar el movimiento en caja.'
      );
    } else {
      alert('Venta completada');
    }

    // Limpiar estados
    setCart([]);
    setCustomerName('');
    setCustomerLot('');
    setCashAmount(0);
    setTransferAmount(0);
    setQrAmount(0);
    setExpensasAmount(0);
    loadProducts();
  };

  // Lista de categorías para el filtro (predefinidas + las que existan en productos)
  const baseCategories = ['Bebida', 'Comida', 'Artículos de Deporte'];
  const categories = Array.from(
    new Set([
      ...baseCategories,
      ...products
        .map((p) => p.category)
        .filter((c): c is string => !!c && c.trim() !== ''),
    ])
  );

  // Filtro combinado: categoría + buscador (nombre)
  const filtered = products.filter((p) => {
    const matchesCategory =
      selectedCategory === 'todas' ||
      (p.category || '').toLowerCase() === selectedCategory.toLowerCase();

    const matchesSearch = p.name
      .toLowerCase()
      .includes(search.toLowerCase());

    return matchesCategory && matchesSearch;
  });

  return (
    <div className="grid grid-cols-1 lg:grid-cols-3 gap-6">
      {/* LISTA DE PRODUCTOS */}
      <div className="lg:col-span-2 space-y-4">
        <div className="flex flex-col md:flex-row gap-3">
          {/* Buscador */}
          <div className="relative flex-1">
            <Search
              className="absolute left-3 top-1/2 transform -translate-y-1/2 text-slate-400"
              size={20}
            />
            <input
              type="text"
              placeholder="Buscar productos por nombre..."
              value={search}
              onChange={(e) => setSearch(e.target.value)}
              className="w-full pl-10 pr-4 py-3 bg-slate-50 border border-slate-200 rounded-xl focus:ring-2 focus:ring-emerald-500 transition"
            />
          </div>

          {/* Filtro por categoría */}
          <div className="flex items-center">
            <select
              value={selectedCategory}
              onChange={(e) => setSelectedCategory(e.target.value)}
              className="w-full md:w-56 px-3 py-3 bg-slate-50 border border-slate-200 rounded-xl text-sm focus:ring-2 focus:ring-emerald-500"
            >
              <option value="todas">Todas las categorías</option>
              {categories.map((cat) => (
                <option key={cat} value={cat}>
                  {cat}
                </option>
              ))}
            </select>
          </div>
        </div>

        <div className="grid grid-cols-2 md:grid-cols-3 gap-3 max-h-[500px] overflow-y-auto pr-2">
          {filtered.map((p) => (
            <button
              key={p.id}
              onClick={() => addToCart(p)}
              className="bg-gradient-to-br from-emerald-50 to-teal-50 border-2 border-emerald-300 hover:border-emerald-500 rounded-xl p-4 text-left transition-all hover:shadow-xl hover:scale-105 active:scale-95"
            >
              <div className="flex justify-between items-start mb-1">
                <h3 className="font-bold text-slate-800 text-sm flex-1">{p.name}</h3>
                {p.category && (
                  <span className="text-xs bg-emerald-500 text-white px-2 py-0.5 rounded-full font-bold ml-2">
                    {p.category.substring(0, 3)}
                  </span>
                )}
              </div>
              <p className="text-2xl font-bold text-emerald-700 mb-1">
                ${p.price.toFixed(2)}
              </p>
              <div className="flex items-center justify-between">
                <p className="text-xs font-semibold text-slate-600">
                  Stock: <span className="text-slate-800">{p.stock}</span>
                </p>
                <div className="bg-white rounded-full p-1.5 shadow-sm">
                  <Plus size={14} className="text-emerald-600" />
                </div>
              </div>
            </button>
          ))}
        </div>
      </div>

      {/* CARRITO + CLIENTE + PAGOS */}
      <div className="space-y-4">
        <div className="bg-gradient-to-br from-emerald-50 via-teal-50 to-cyan-50 rounded-xl shadow-xl p-4 border-2 border-emerald-200">
          <div className="flex items-center gap-2 mb-4 bg-white rounded-lg p-2 shadow-sm">
            <ShoppingCart className="text-emerald-600" size={24} />
            <h3 className="text-lg font-bold bg-gradient-to-r from-emerald-600 to-teal-600 bg-clip-text text-transparent">Carrito</h3>
          </div>

          <div className="space-y-2 mb-4 max-h-[220px] overflow-y-auto pr-2">
            {cart.map((item) => (
              <div
                key={item.product_id}
                className="bg-gradient-to-r from-white to-emerald-50 rounded-lg p-3 border-2 border-emerald-200 shadow-md"
              >
                <div className="flex justify-between items-start mb-2">
                  <span className="font-bold text-sm text-slate-800">
                    {item.product_name}
                  </span>
                  <button
                    onClick={() => updateQuantity(item.product_id, 0)}
                    className="text-red-600 hover:bg-red-100 rounded-full p-1"
                  >
                    <Trash2 size={16} />
                  </button>
                </div>
                <div className="flex items-center justify-between gap-2 mb-2">
                  <div className="flex items-center gap-2">
                    <button
                      onClick={() =>
                        updateQuantity(item.product_id, item.quantity - 1)
                      }
                      className="w-8 h-8 bg-gradient-to-r from-red-100 to-red-200 hover:from-red-200 hover:to-red-300 text-red-700 rounded-lg flex items-center justify-center font-bold"
                    >
                      <Minus size={16} />
                    </button>
                    <span className="w-10 text-center font-bold text-lg text-emerald-700">
                      {item.quantity}
                    </span>
                    <button
                      onClick={() =>
                        updateQuantity(item.product_id, item.quantity + 1)
                      }
                      className="w-8 h-8 bg-gradient-to-r from-emerald-100 to-emerald-200 hover:from-emerald-200 hover:to-emerald-300 text-emerald-700 rounded-lg flex items-center justify-center font-bold"
                    >
                      <Plus size={16} />
                    </button>
                  </div>
                  <div className="flex items-center gap-2">
                    <span className="text-xs text-slate-600 font-bold">$</span>
                    <input
                      type="number"
                      step="0.01"
                      min="0"
                      value={item.price}
                      onChange={(e) =>
                        updatePrice(
                          item.product_id,
                          parseFloat(e.target.value) || 0
                        )
                      }
                      className="w-20 px-2 py-1 text-sm border-2 border-slate-300 rounded-lg text-right font-bold focus:border-emerald-500 focus:ring-2 focus:ring-emerald-200"
                    />
                  </div>
                </div>
                <div className="flex justify-end bg-emerald-100 rounded-lg px-2 py-1">
                  <span className="font-bold text-emerald-700">
                    ${item.subtotal.toFixed(2)}
                  </span>
                </div>
              </div>
            ))}
          </div>

          {/* DATOS DEL CLIENTE */}
          <div className="space-y-2 mb-4 bg-white rounded-lg p-3 shadow-sm border-2 border-slate-200">
            <p className="text-xs font-bold text-slate-600 mb-2">Datos del Cliente</p>
            <div className="grid grid-cols-1 sm:grid-cols-2 gap-2">
              <input
                type="text"
                placeholder="Nombre del cliente"
                value={customerName}
                onChange={(e) => setCustomerName(e.target.value)}
                className="w-full px-3 py-2 bg-gradient-to-r from-blue-50 to-cyan-50 border-2 border-blue-200 rounded-lg text-sm font-medium focus:ring-2 focus:ring-blue-400"
              />
              <input
                type="text"
                placeholder="Lote"
                value={customerLot}
                onChange={(e) => setCustomerLot(e.target.value)}
                className="w-full px-3 py-2 bg-gradient-to-r from-blue-50 to-cyan-50 border-2 border-blue-200 rounded-lg text-sm font-medium focus:ring-2 focus:ring-blue-400"
              />
            </div>
          </div>

          {/* PAGOS */}
          <div className="border-t-2 border-emerald-300 pt-4 space-y-3">
            <p className="text-sm font-bold text-slate-700">Métodos de Pago</p>
            <div className="space-y-2">
              <div className="flex items-center justify-between bg-gradient-to-r from-green-100 to-emerald-100 border-2 border-green-300 rounded-lg px-3 py-2">
                <span className="text-sm font-bold text-green-800">Efectivo</span>
                <input
                  type="number"
                  min={0}
                  step="0.01"
                  value={cashAmount || ''}
                  onChange={(e) => setCashAmount(parseAmount(e.target.value))}
                  className="w-28 px-2 py-1 bg-white border-2 border-green-300 rounded-lg text-sm text-right font-bold focus:ring-2 focus:ring-green-400"
                  placeholder="0"
                />
              </div>

              <div className="flex items-center justify-between bg-gradient-to-r from-blue-100 to-cyan-100 border-2 border-blue-300 rounded-lg px-3 py-2">
                <span className="text-sm font-bold text-blue-800">Transferencia</span>
                <input
                  type="number"
                  min={0}
                  step="0.01"
                  value={transferAmount || ''}
                  onChange={(e) =>
                    setTransferAmount(parseAmount(e.target.value))
                  }
                  className="w-28 px-2 py-1 bg-white border-2 border-blue-300 rounded-lg text-sm text-right font-bold focus:ring-2 focus:ring-blue-400"
                  placeholder="0"
                />
              </div>

              <div className="flex items-center justify-between bg-gradient-to-r from-purple-100 to-pink-100 border-2 border-purple-300 rounded-lg px-3 py-2">
                <span className="text-sm font-bold text-purple-800">QR</span>
                <input
                  type="number"
                  min={0}
                  step="0.01"
                  value={qrAmount || ''}
                  onChange={(e) => setQrAmount(parseAmount(e.target.value))}
                  className="w-28 px-2 py-1 bg-white border-2 border-purple-300 rounded-lg text-sm text-right font-bold focus:ring-2 focus:ring-purple-400"
                  placeholder="0"
                />
              </div>

              <div className="flex items-center justify-between bg-gradient-to-r from-orange-100 to-red-100 border-2 border-orange-300 rounded-lg px-3 py-2">
                <span className="text-sm font-bold text-orange-800">Expensas</span>
                <input
                  type="number"
                  min={0}
                  step="0.01"
                  value={expensasAmount || ''}
                  onChange={(e) =>
                    setExpensasAmount(parseAmount(e.target.value))
                  }
                  className="w-28 px-2 py-1 bg-white border-2 border-orange-300 rounded-lg text-sm text-right font-bold focus:ring-2 focus:ring-orange-400"
                  placeholder="0"
                />
              </div>
            </div>

            <div className="flex justify-between items-center text-2xl font-bold bg-gradient-to-r from-yellow-100 to-amber-100 border-2 border-yellow-400 rounded-lg p-3">
              <span className="text-slate-800">Total:</span>
              <span className="text-emerald-700">
                ${total.toFixed(2)}
              </span>
            </div>

            <button
              onClick={handleCompleteSale}
              disabled={!cart.length}
              className="w-full bg-gradient-to-r from-emerald-500 via-teal-500 to-cyan-600 hover:from-emerald-600 hover:via-teal-600 hover:to-cyan-700 disabled:from-slate-300 disabled:to-slate-400 text-white font-bold py-4 rounded-xl flex items-center justify-center gap-2 shadow-xl transition-all hover:scale-105 active:scale-95"
            >
              <CreditCard size={24} />
              Completar Venta
            </button>
          </div>
        </div>
      </div>
    </div>
  );
}
