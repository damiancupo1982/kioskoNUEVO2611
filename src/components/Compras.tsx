import { useState, useEffect } from 'react';
import { supabase } from '../lib/supabase';
import { Package, FileText, DollarSign, Trash2, X, Plus } from 'lucide-react';

interface Product {
  id: string;
  name: string;
  price: number;
  cost: number;
  stock: number;
  supplier?: string;
  code?: string;
  category?: string;
}

interface PurchaseItem {
  tempId: string;
  product_id: string;
  product_name: string;
  quantity: number;
  purchase_price: number;
  sale_price: number;
  subtotal: number;
}

interface PurchaseInvoice {
  id: string;
  invoice_number: string;
  supplier: string;
  total: number;
  paid_amount: number;
  status: string;
  created_at: string;
}

interface InvoiceDetail extends PurchaseInvoice {
  items: Array<{
    id: string;
    product_id: string;
    quantity: number;
    purchase_price: number;
    sale_price: number;
    subtotal: number;
    products: { name: string };
  }>;
}

export default function Compras() {
  const [products, setProducts] = useState<Product[]>([]);
  const [invoices, setInvoices] = useState<PurchaseInvoice[]>([]);
  const [selectedInvoice, setSelectedInvoice] = useState<InvoiceDetail | null>(null);
  const [showPaymentModal, setShowPaymentModal] = useState(false);
  const [paymentAmount, setPaymentAmount] = useState('');
  const [paymentMethod, setPaymentMethod] = useState('efectivo');
  const [showDeleteModal, setShowDeleteModal] = useState(false);
  const [deletePassword, setDeletePassword] = useState('');
  const [invoiceToDelete, setInvoiceToDelete] = useState<string | null>(null);
  const [purchaseItems, setPurchaseItems] = useState<PurchaseItem[]>([]);
  const [currentItem, setCurrentItem] = useState({
    product_id: '',
    product_name: '',
    quantity: '',
    purchase_price: '',
    sale_price: '',
  });
  const [supplier, setSupplier] = useState('');
  const [showNewProductModal, setShowNewProductModal] = useState(false);
  const [newProductName, setNewProductName] = useState('');
  const [currentUser, setCurrentUser] = useState<any>(null);
  const [activeShift, setActiveShift] = useState<any>(null);

  useEffect(() => {
    loadProducts();
    loadInvoices();
    loadCurrentUser();
    loadActiveShift();
  }, []);

  const loadProducts = async () => {
    const { data } = await supabase.from('products').select('*').order('name');
    setProducts(data || []);
  };

  const loadCurrentUser = () => {
    try {
      const raw = localStorage.getItem('user');
      if (raw) setCurrentUser(JSON.parse(raw));
    } catch {}
  };

  const loadActiveShift = async () => {
    const { data } = await supabase.from('shifts').select('*').eq('active', true).maybeSingle();
    setActiveShift(data);
  };

  const loadInvoices = async () => {
    const { data } = await supabase
      .from('purchase_invoices')
      .select('*')
      .order('created_at', { ascending: false });
    setInvoices(data || []);
  };

  const loadInvoiceDetail = async (invoiceId: string) => {
    const { data } = await supabase
      .from('purchase_invoices')
      .select(`*, items:purchase_invoice_items(id, product_id, quantity, purchase_price, sale_price, subtotal, products(name))`)
      .eq('id', invoiceId)
      .maybeSingle();
    setSelectedInvoice(data as InvoiceDetail);
  };

  const handleProductChange = (value: string) => {
    if (value === 'new') {
      setShowNewProductModal(true);
      return;
    }
    if (!value) {
      setCurrentItem({ product_id: '', product_name: '', quantity: '', purchase_price: '', sale_price: '' });
      return;
    }
    const product = products.find((p) => p.id === value);
    if (product) {
      setCurrentItem({
        product_id: product.id,
        product_name: product.name,
        quantity: '',
        purchase_price: product.cost ? product.cost.toString() : '',
        sale_price: product.price ? product.price.toString() : '',
      });
    }
  };

  const handleAddNewProduct = async () => {
    if (!newProductName.trim()) return;
    const code = 'PROD-' + Date.now().toString().slice(-8);
    const { data } = await supabase
      .from('products')
      .insert([{ code, name: newProductName.trim(), price: 0, cost: 0, stock: 0, category: '', supplier }])
      .select()
      .single();
    await loadProducts();
    if (data) {
      setCurrentItem({
        product_id: data.id,
        product_name: data.name,
        quantity: '',
        purchase_price: '',
        sale_price: '',
      });
    }
    setNewProductName('');
    setShowNewProductModal(false);
  };

  const addItemToPurchase = () => {
    if (
      !currentItem.product_id ||
      !currentItem.quantity ||
      !currentItem.purchase_price ||
      !currentItem.sale_price
    ) {
      alert('Complete todos los campos del item');
      return;
    }
    const qty = parseFloat(currentItem.quantity);
    const pp = parseFloat(currentItem.purchase_price);
    if (isNaN(qty) || isNaN(pp) || qty <= 0 || pp <= 0) {
      alert('Ingrese valores válidos');
      return;
    }
    const subtotal = qty * pp;
    const item: PurchaseItem = {
      tempId: Date.now().toString(),
      product_id: currentItem.product_id,
      product_name: currentItem.product_name,
      quantity: qty,
      purchase_price: pp,
      sale_price: parseFloat(currentItem.sale_price),
      subtotal,
    };
    setPurchaseItems((prev) => [...prev, item]);
    setCurrentItem({ product_id: '', product_name: '', quantity: '', purchase_price: '', sale_price: '' });
  };

  const removeItem = (tempId: string) => {
    setPurchaseItems((prev) => prev.filter((i) => i.tempId !== tempId));
  };

  const getTotalPurchase = () => purchaseItems.reduce((sum, i) => sum + i.subtotal, 0);

  const savePurchaseInvoice = async () => {
    if (purchaseItems.length === 0) {
      alert('Agregue al menos un producto');
      return;
    }
    if (!supplier.trim()) {
      alert('Ingrese el proveedor');
      return;
    }

    let invoiceNumber: string;
    try {
      const { data: rpcData } = await supabase.rpc('generate_purchase_invoice_number');
      invoiceNumber = rpcData || 'FC-' + Date.now();
    } catch {
      invoiceNumber = 'FC-' + Date.now();
    }

    const { data: invoice, error: invoiceError } = await supabase
      .from('purchase_invoices')
      .insert([{
        invoice_number: invoiceNumber,
        supplier: supplier.trim(),
        total: getTotalPurchase(),
        paid_amount: 0,
        status: 'pending',
      }])
      .select()
      .single();

    if (invoiceError || !invoice) {
      alert('Error al crear la factura');
      return;
    }

    const itemsToInsert = purchaseItems.map((item) => ({
      invoice_id: invoice.id,
      product_id: item.product_id,
      quantity: item.quantity,
      purchase_price: item.purchase_price,
      sale_price: item.sale_price,
      subtotal: item.subtotal,
    }));

    await supabase.from('purchase_invoice_items').insert(itemsToInsert);

    for (const item of purchaseItems) {
      const { data: product } = await supabase
        .from('products')
        .select('*')
        .eq('id', item.product_id)
        .maybeSingle();

      if (!product) continue;

      const previousStock = Number(product.stock) || 0;
      const newStock = previousStock + item.quantity;

      await supabase.from('products').update({
        stock: newStock,
        cost: item.purchase_price,
        price: item.sale_price,
        supplier: supplier.trim(),
      }).eq('id', item.product_id);

      await supabase.from('inventory_movements').insert([{
        product_id: item.product_id,
        product_code: product.code || '',
        product_name: item.product_name,
        category: product.category || '',
        type: 'purchase',
        quantity: item.quantity,
        previous_stock: previousStock,
        new_stock: newStock,
        supplier: supplier.trim(),
        reference: invoiceNumber,
        user_name: currentUser?.full_name || 'Sistema',
        shift_id: activeShift?.id || null,
        notes: `Compra ${invoiceNumber}`,
      }]);
    }

    setPurchaseItems([]);
    setSupplier('');
    await loadProducts();
    await loadInvoices();
    alert(`Factura ${invoiceNumber} creada exitosamente`);
  };

  const handlePayInvoice = async () => {
    if (!selectedInvoice) return;
    if (!activeShift) {
      alert('No hay un turno activo');
      return;
    }
    const amount = parseFloat(paymentAmount);
    if (isNaN(amount) || amount <= 0) {
      alert('Ingrese un monto válido');
      return;
    }
    const pending = Number(selectedInvoice.total) - Number(selectedInvoice.paid_amount);
    if (amount > pending) {
      alert(`El monto no puede superar el saldo pendiente ($${pending.toFixed(2)})`);
      return;
    }

    await supabase.from('purchase_payments').insert([{
      invoice_id: selectedInvoice.id,
      amount,
      payment_method: paymentMethod,
    }]);

    await supabase.from('cash_transactions').insert([{
      shift_id: activeShift.id,
      type: 'expense',
      category: 'Compras',
      amount,
      payment_method: paymentMethod,
      description: `Pago factura ${selectedInvoice.invoice_number} - ${selectedInvoice.supplier}`,
    }]);

    const newExpenses = (Number(activeShift.total_expenses) || 0) + amount;
    await supabase.from('shifts').update({ total_expenses: newExpenses }).eq('id', activeShift.id);

    await loadActiveShift();
    await loadInvoices();
    await loadInvoiceDetail(selectedInvoice.id);
    setShowPaymentModal(false);
    setPaymentAmount('');
    setPaymentMethod('efectivo');
    alert('Pago registrado exitosamente en caja');
  };

  const handleDeleteInvoice = async () => {
    if (deletePassword !== '842114') {
      alert('Contraseña incorrecta');
      return;
    }
    if (!invoiceToDelete) return;

    const invoice = invoices.find((i) => i.id === invoiceToDelete);
    if (!invoice) return;

    if (Number(invoice.paid_amount) > 0) {
      alert('No se puede eliminar una factura con pagos registrados');
      setShowDeleteModal(false);
      setDeletePassword('');
      setInvoiceToDelete(null);
      return;
    }

    const { data: items } = await supabase
      .from('purchase_invoice_items')
      .select('*')
      .eq('invoice_id', invoiceToDelete);

    for (const item of items || []) {
      const { data: product } = await supabase
        .from('products')
        .select('stock')
        .eq('id', item.product_id)
        .maybeSingle();
      if (product) {
        await supabase
          .from('products')
          .update({ stock: Number(product.stock) - Number(item.quantity) })
          .eq('id', item.product_id);
      }
    }

    await supabase.from('inventory_movements').delete().eq('reference', invoice.invoice_number);
    await supabase.from('purchase_invoice_items').delete().eq('invoice_id', invoiceToDelete);
    await supabase.from('purchase_invoices').delete().eq('id', invoiceToDelete);

    setSelectedInvoice(null);
    setShowDeleteModal(false);
    setDeletePassword('');
    setInvoiceToDelete(null);
    await loadProducts();
    await loadInvoices();
    alert('Factura eliminada exitosamente');
  };

  const getStatusBadge = (status: string) => {
    if (status === 'paid') return 'bg-emerald-100 text-emerald-700';
    if (status === 'partial') return 'bg-amber-100 text-amber-700';
    return 'bg-red-100 text-red-700';
  };

  const getStatusLabel = (status: string) => {
    if (status === 'paid') return 'Pagada';
    if (status === 'partial') return 'Parcial';
    return 'Pendiente';
  };

  return (
    <div className="grid grid-cols-1 lg:grid-cols-2 gap-6">
      <div className="bg-white rounded-xl shadow-lg p-6 space-y-4">
        <h3 className="text-lg font-bold text-slate-800 flex items-center gap-2">
          <Package size={20} className="text-blue-500" />
          Nueva Compra
        </h3>

        <input
          type="text"
          placeholder="Nombre del proveedor"
          value={supplier}
          onChange={(e) => setSupplier(e.target.value)}
          className="w-full px-4 py-2 border-2 border-slate-200 rounded-lg focus:ring-2 focus:ring-blue-500 focus:border-blue-500"
        />

        <div className="grid grid-cols-2 gap-3">
          <div className="col-span-2">
            <select
              value={currentItem.product_id}
              onChange={(e) => handleProductChange(e.target.value)}
              className="w-full px-4 py-2 border-2 border-slate-200 rounded-lg focus:ring-2 focus:ring-blue-500"
            >
              <option value="">Seleccionar producto</option>
              <option value="new">+ Agregar nuevo producto</option>
              {products.map((p) => (
                <option key={p.id} value={p.id}>{p.name}</option>
              ))}
            </select>
          </div>
          <input
            type="number"
            step="0.01"
            placeholder="Cantidad"
            value={currentItem.quantity}
            onChange={(e) => setCurrentItem((prev) => ({ ...prev, quantity: e.target.value }))}
            className="px-4 py-2 border-2 border-slate-200 rounded-lg focus:ring-2 focus:ring-blue-500"
          />
          <input
            type="number"
            step="0.01"
            placeholder="Precio Compra"
            value={currentItem.purchase_price}
            onChange={(e) => setCurrentItem((prev) => ({ ...prev, purchase_price: e.target.value }))}
            className="px-4 py-2 border-2 border-slate-200 rounded-lg focus:ring-2 focus:ring-blue-500"
          />
          <input
            type="number"
            step="0.01"
            placeholder="Precio Venta"
            value={currentItem.sale_price}
            onChange={(e) => setCurrentItem((prev) => ({ ...prev, sale_price: e.target.value }))}
            className="px-4 py-2 border-2 border-slate-200 rounded-lg focus:ring-2 focus:ring-blue-500"
          />
          <button
            onClick={addItemToPurchase}
            className="px-4 py-2 bg-blue-500 hover:bg-blue-600 text-white rounded-lg font-medium flex items-center justify-center gap-2 transition-all"
          >
            <Plus size={18} />
            Agregar Item
          </button>
        </div>

        {purchaseItems.length > 0 && (
          <div className="space-y-3">
            <h4 className="font-semibold text-slate-700">Items de la Compra</h4>
            <div className="space-y-2">
              {purchaseItems.map((item) => (
                <div key={item.tempId} className="bg-slate-50 p-3 rounded-lg flex items-center justify-between gap-2">
                  <div className="flex-1 min-w-0">
                    <p className="font-medium text-slate-800 truncate">{item.product_name}</p>
                    <p className="text-sm text-slate-500">
                      {item.quantity} x ${item.purchase_price.toFixed(2)} = <span className="font-semibold">${item.subtotal.toFixed(2)}</span>
                    </p>
                  </div>
                  <button
                    onClick={() => removeItem(item.tempId)}
                    className="text-red-500 hover:text-red-700 flex-shrink-0"
                  >
                    <X size={18} />
                  </button>
                </div>
              ))}
            </div>

            <div className="bg-blue-50 border-2 border-blue-200 rounded-lg p-4">
              <p className="text-lg font-bold text-blue-800">
                Total Compra: ${getTotalPurchase().toFixed(2)}
              </p>
            </div>

            <button
              onClick={savePurchaseInvoice}
              className="w-full px-4 py-3 bg-emerald-500 hover:bg-emerald-600 text-white rounded-lg font-bold text-lg shadow-lg transition-all"
            >
              Guardar Factura de Compra
            </button>
          </div>
        )}
      </div>

      <div className="bg-white rounded-xl shadow-lg p-6 space-y-4">
        <h3 className="text-lg font-bold text-slate-800 flex items-center gap-2">
          <FileText size={20} className="text-orange-500" />
          Facturas de Compra
        </h3>

        <div className="space-y-3 max-h-[600px] overflow-y-auto pr-1">
          {invoices.length === 0 && (
            <p className="text-center text-slate-500 py-8">No hay facturas registradas</p>
          )}
          {invoices.map((invoice) => (
            <div
              key={invoice.id}
              onClick={() => loadInvoiceDetail(invoice.id)}
              className="border border-slate-200 rounded-lg p-4 hover:shadow-md cursor-pointer transition-all hover:border-blue-300"
            >
              <div className="flex items-center justify-between mb-2">
                <div>
                  <p className="font-bold text-slate-800">{invoice.invoice_number}</p>
                  <p className="text-sm text-slate-600">{invoice.supplier}</p>
                </div>
                <span className={`px-3 py-1 rounded-full text-xs font-semibold ${getStatusBadge(invoice.status)}`}>
                  {getStatusLabel(invoice.status)}
                </span>
              </div>
              <div className="flex items-center justify-between text-sm">
                <span className="text-slate-500">
                  {new Date(invoice.created_at).toLocaleDateString('es-AR')}
                </span>
                <span className="font-bold text-slate-800">${Number(invoice.total).toFixed(2)}</span>
              </div>
              {Number(invoice.paid_amount) > 0 && (
                <p className="text-xs text-slate-500 mt-1">
                  Pagado: ${Number(invoice.paid_amount).toFixed(2)} | Pendiente: ${(Number(invoice.total) - Number(invoice.paid_amount)).toFixed(2)}
                </p>
              )}
            </div>
          ))}
        </div>
      </div>

      {selectedInvoice && (
        <div className="fixed inset-0 bg-black bg-opacity-50 flex items-center justify-center p-4 z-50">
          <div className="bg-white rounded-xl max-w-2xl w-full max-h-[90vh] overflow-y-auto">
            <div className="sticky top-0 bg-white border-b px-6 py-4 flex items-start justify-between">
              <div>
                <h3 className="text-xl font-bold text-slate-800">{selectedInvoice.invoice_number}</h3>
                <p className="text-slate-600">{selectedInvoice.supplier}</p>
                <p className="text-sm text-slate-500">
                  {new Date(selectedInvoice.created_at).toLocaleDateString('es-AR', {
                    day: '2-digit', month: '2-digit', year: 'numeric',
                    hour: '2-digit', minute: '2-digit',
                  })}
                </p>
              </div>
              <button onClick={() => setSelectedInvoice(null)} className="text-slate-400 hover:text-slate-600">
                <X size={24} />
              </button>
            </div>

            <div className="p-6 space-y-4">
              <div className="space-y-2">
                <h4 className="font-semibold text-slate-800">Items</h4>
                {(selectedInvoice.items || []).map((item) => (
                  <div key={item.id} className="bg-slate-50 p-3 rounded-lg">
                    <p className="font-bold text-slate-800">{item.products?.name}</p>
                    <p className="text-sm text-slate-600">
                      Cantidad: {item.quantity} | Precio Compra: ${Number(item.purchase_price).toFixed(2)} | Precio Venta: ${Number(item.sale_price).toFixed(2)}
                    </p>
                    <p className="text-sm font-semibold text-slate-800 text-right">
                      ${Number(item.subtotal).toFixed(2)}
                    </p>
                  </div>
                ))}
              </div>

              <div className="border-t pt-4 space-y-2">
                <div className="flex justify-between items-center">
                  <span className="text-xl font-bold text-slate-800">Total:</span>
                  <span className="text-xl font-bold text-slate-800">${Number(selectedInvoice.total).toFixed(2)}</span>
                </div>
                <div className="flex justify-between items-center">
                  <span className="text-lg font-bold text-emerald-600">Pagado:</span>
                  <span className="text-lg font-bold text-emerald-600">${Number(selectedInvoice.paid_amount).toFixed(2)}</span>
                </div>
                <div className="flex justify-between items-center">
                  <span className="text-lg font-bold text-red-600">Pendiente:</span>
                  <span className="text-lg font-bold text-red-600">
                    ${(Number(selectedInvoice.total) - Number(selectedInvoice.paid_amount)).toFixed(2)}
                  </span>
                </div>
              </div>

              <div className="space-y-2">
                {selectedInvoice.status !== 'paid' && (
                  <button
                    onClick={() => setShowPaymentModal(true)}
                    className="w-full px-4 py-3 bg-emerald-500 hover:bg-emerald-600 text-white rounded-lg font-medium flex items-center justify-center gap-2 transition-all"
                  >
                    <DollarSign size={18} />
                    Registrar Pago
                  </button>
                )}
                <button
                  onClick={() => {
                    setInvoiceToDelete(selectedInvoice.id);
                    setShowDeleteModal(true);
                  }}
                  className="w-full px-4 py-3 bg-red-500 hover:bg-red-600 text-white rounded-lg font-medium flex items-center justify-center gap-2 transition-all"
                >
                  <Trash2 size={18} />
                  Eliminar Factura
                </button>
              </div>
            </div>
          </div>
        </div>
      )}

      {showNewProductModal && (
        <div className="fixed inset-0 bg-black bg-opacity-50 flex items-center justify-center p-4 z-50">
          <div className="bg-white rounded-xl max-w-md w-full p-6 space-y-4">
            <h3 className="text-lg font-bold text-slate-800">Agregar Nuevo Producto</h3>
            <p className="text-slate-600">El producto no existe en el sistema. ¿Desea agregarlo?</p>
            <input
              type="text"
              placeholder="Nombre del producto"
              value={newProductName}
              onChange={(e) => setNewProductName(e.target.value)}
              autoFocus
              className="w-full px-4 py-2 border-2 border-slate-200 rounded-lg focus:ring-2 focus:ring-blue-500"
              onKeyDown={(e) => { if (e.key === 'Enter') handleAddNewProduct(); }}
            />
            <div className="flex gap-3">
              <button
                onClick={() => { setShowNewProductModal(false); setNewProductName(''); }}
                className="flex-1 px-4 py-2 bg-slate-200 hover:bg-slate-300 text-slate-700 rounded-lg font-medium"
              >
                Cancelar
              </button>
              <button
                onClick={handleAddNewProduct}
                className="flex-1 px-4 py-2 bg-blue-500 hover:bg-blue-600 text-white rounded-lg font-medium"
              >
                Agregar
              </button>
            </div>
          </div>
        </div>
      )}

      {showPaymentModal && selectedInvoice && (
        <div className="fixed inset-0 bg-black bg-opacity-50 flex items-center justify-center p-4 z-50">
          <div className="bg-white rounded-xl max-w-md w-full p-6 space-y-4">
            <h3 className="text-lg font-bold text-slate-800">Registrar Pago</h3>
            <p className="text-slate-600">
              Saldo pendiente: <span className="font-bold text-red-600">
                ${(Number(selectedInvoice.total) - Number(selectedInvoice.paid_amount)).toFixed(2)}
              </span>
            </p>
            <input
              type="number"
              step="0.01"
              placeholder="Monto a pagar"
              value={paymentAmount}
              onChange={(e) => setPaymentAmount(e.target.value)}
              autoFocus
              className="w-full px-4 py-2 border-2 border-slate-200 rounded-lg focus:ring-2 focus:ring-emerald-500"
            />
            <select
              value={paymentMethod}
              onChange={(e) => setPaymentMethod(e.target.value)}
              className="w-full px-4 py-2 border-2 border-slate-200 rounded-lg focus:ring-2 focus:ring-emerald-500"
            >
              <option value="efectivo">Efectivo</option>
              <option value="transferencia">Transferencia</option>
              <option value="qr">QR</option>
              <option value="expensas">Expensas</option>
            </select>
            <div className="flex gap-3">
              <button
                onClick={() => { setShowPaymentModal(false); setPaymentAmount(''); setPaymentMethod('efectivo'); }}
                className="flex-1 px-4 py-2 bg-slate-200 hover:bg-slate-300 text-slate-700 rounded-lg font-medium"
              >
                Cancelar
              </button>
              <button
                onClick={handlePayInvoice}
                className="flex-1 px-4 py-2 bg-emerald-500 hover:bg-emerald-600 text-white rounded-lg font-medium"
              >
                Confirmar Pago
              </button>
            </div>
          </div>
        </div>
      )}

      {showDeleteModal && (
        <div className="fixed inset-0 bg-black bg-opacity-50 flex items-center justify-center p-4 z-50">
          <div className="bg-white rounded-xl max-w-md w-full p-6 space-y-4">
            <div className="flex items-center gap-2 text-red-600">
              <Trash2 size={22} />
              <h3 className="text-lg font-bold">Eliminar Factura</h3>
            </div>
            <p className="text-red-600 text-sm">
              Esta acción eliminará la factura y revertirá los cambios en el inventario. Esta acción no se puede deshacer.
            </p>
            <input
              type="password"
              placeholder="Ingrese la contraseña"
              value={deletePassword}
              onChange={(e) => setDeletePassword(e.target.value)}
              autoFocus
              className="w-full px-4 py-2 border-2 border-red-200 rounded-lg focus:ring-2 focus:ring-red-500"
              onKeyDown={(e) => { if (e.key === 'Enter') handleDeleteInvoice(); }}
            />
            <div className="flex gap-3">
              <button
                onClick={() => { setShowDeleteModal(false); setDeletePassword(''); setInvoiceToDelete(null); }}
                className="flex-1 px-4 py-2 bg-slate-200 hover:bg-slate-300 text-slate-700 rounded-lg font-medium"
              >
                Cancelar
              </button>
              <button
                onClick={handleDeleteInvoice}
                className="flex-1 px-4 py-2 bg-red-500 hover:bg-red-600 text-white rounded-lg font-medium"
              >
                Eliminar
              </button>
            </div>
          </div>
        </div>
      )}
    </div>
  );
}
