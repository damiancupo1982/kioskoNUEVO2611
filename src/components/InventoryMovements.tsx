import { useState, useEffect } from 'react';
import { supabase, InventoryMovement, Product } from '../lib/supabase';
import { Plus, ArrowUp, ArrowDown, X } from 'lucide-react';

export default function InventoryMovements() {
  const [movements, setMovements] = useState<InventoryMovement[]>([]);
  const [products, setProducts] = useState<Product[]>([]);
  const [showModal, setShowModal] = useState(false);
  const [loading, setLoading] = useState(true);

  const [filters, setFilters] = useState({
    movementType: 'all',
    product: '',
    provider: '',
    category: '',
    startDate: '',
    endDate: ''
  });

  const [formData, setFormData] = useState({
    product_id: '',
    quantity: '',
    unit_price: '',
    provider_name: '',
    description: ''
  });

  useEffect(() => {
    loadData();
  }, []);

  const loadData = async () => {
    try {
      const [movementsRes, productsRes] = await Promise.all([
        supabase.from('inventory_movements').select('*').order('created_at', { ascending: false }),
        supabase.from('products').select('*').order('name')
      ]);

      setMovements(movementsRes.data || []);
      setProducts(productsRes.data || []);
    } finally {
      setLoading(false);
    }
  };

  const handleAddMovement = async (e: React.FormEvent) => {
    e.preventDefault();

    if (!formData.product_id || !formData.quantity || !formData.unit_price) {
      alert('Completa todos los campos requeridos');
      return;
    }

    const selectedProduct = products.find(p => p.id === formData.product_id);
    if (!selectedProduct) return;

    const totalAmount = parseInt(formData.quantity) * parseFloat(formData.unit_price);

    const { error: movementError } = await supabase.from('inventory_movements').insert([{
      product_id: formData.product_id,
      product_name: selectedProduct.name,
      category: selectedProduct.category,
      movement_type: 'income',
      quantity: parseInt(formData.quantity),
      unit_price: parseFloat(formData.unit_price),
      total_amount: totalAmount,
      provider_name: formData.provider_name || 'Sin especificar',
      description: formData.description
    }]);

    if (movementError) {
      console.error('Error:', movementError);
      return;
    }

    const newStock = selectedProduct.stock + parseInt(formData.quantity);
    await supabase.from('products')
      .update({ stock: newStock, updated_at: new Date().toISOString() })
      .eq('id', formData.product_id);

    setFormData({ product_id: '', quantity: '', unit_price: '', provider_name: '', description: '' });
    setShowModal(false);
    loadData();
  };

  const getFilteredMovements = () => {
    return movements.filter(m => {
      if (filters.movementType !== 'all' && m.movement_type !== filters.movementType) return false;
      if (filters.product && !m.product_name.toLowerCase().includes(filters.product.toLowerCase())) return false;
      if (filters.provider && !m.provider_name?.toLowerCase().includes(filters.provider.toLowerCase())) return false;
      if (filters.category && m.category !== filters.category) return false;

      if (filters.startDate) {
        const movementDate = new Date(m.created_at).toISOString().split('T')[0];
        if (movementDate < filters.startDate) return false;
      }
      if (filters.endDate) {
        const movementDate = new Date(m.created_at).toISOString().split('T')[0];
        if (movementDate > filters.endDate) return false;
      }

      return true;
    });
  };

  const filteredMovements = getFilteredMovements();
  const categories = Array.from(new Set(products.map(p => p.category).filter(Boolean)));
  const providers = Array.from(new Set(movements.filter(m => m.provider_name).map(m => m.provider_name)));

  const stats = {
    totalIncome: filteredMovements
      .filter(m => m.movement_type === 'income')
      .reduce((sum, m) => sum + m.total_amount, 0),
    totalSales: filteredMovements
      .filter(m => m.movement_type === 'sale')
      .reduce((sum, m) => sum + m.total_amount, 0),
    incomeCount: filteredMovements.filter(m => m.movement_type === 'income').length,
    salesCount: filteredMovements.filter(m => m.movement_type === 'sale').length
  };

  if (loading) {
    return <div className="text-center py-12">Cargando movimientos...</div>;
  }

  return (
    <div className="space-y-6">
      <div className="flex justify-between items-center">
        <h2 className="text-3xl font-bold text-slate-800">Movimientos de Inventario</h2>
        <button
          onClick={() => setShowModal(true)}
          className="bg-gradient-to-r from-green-500 to-emerald-600 hover:from-green-600 hover:to-emerald-700 text-white px-6 py-2.5 rounded-xl flex items-center gap-2 shadow-lg transition-all duration-200 hover:scale-105"
        >
          <Plus size={20} />
          Nuevo Ingreso
        </button>
      </div>

      <div className="grid grid-cols-1 md:grid-cols-4 gap-4">
        <div className="bg-gradient-to-br from-green-50 to-emerald-50 rounded-xl p-4 border border-green-200">
          <div className="flex items-center justify-between">
            <div>
              <p className="text-sm text-green-600 font-medium">Ingresos de Mercadería</p>
              <p className="text-2xl font-bold text-green-700 mt-1">${stats.totalIncome.toFixed(2)}</p>
              <p className="text-xs text-green-600 mt-1">{stats.incomeCount} movimientos</p>
            </div>
            <ArrowUp className="text-green-500" size={28} />
          </div>
        </div>

        <div className="bg-gradient-to-br from-blue-50 to-cyan-50 rounded-xl p-4 border border-blue-200">
          <div className="flex items-center justify-between">
            <div>
              <p className="text-sm text-blue-600 font-medium">Total Vendido</p>
              <p className="text-2xl font-bold text-blue-700 mt-1">${stats.totalSales.toFixed(2)}</p>
              <p className="text-xs text-blue-600 mt-1">{stats.salesCount} ventas</p>
            </div>
            <ArrowDown className="text-blue-500" size={28} />
          </div>
        </div>

        <div className="bg-gradient-to-br from-slate-50 to-slate-100 rounded-xl p-4 border border-slate-200">
          <div>
            <p className="text-sm text-slate-600 font-medium">Ingresos + Ventas</p>
            <p className="text-2xl font-bold text-slate-700 mt-1">{filteredMovements.length}</p>
            <p className="text-xs text-slate-600 mt-1">Total de movimientos</p>
          </div>
        </div>

        <div className="bg-gradient-to-br from-amber-50 to-orange-50 rounded-xl p-4 border border-amber-200">
          <div>
            <p className="text-sm text-amber-600 font-medium">Balance Neto</p>
            <p className={`text-2xl font-bold mt-1 ${stats.totalIncome >= stats.totalSales ? 'text-green-600' : 'text-red-600'}`}>
              ${(stats.totalIncome - stats.totalSales).toFixed(2)}
            </p>
          </div>
        </div>
      </div>

      <div className="bg-white rounded-xl shadow-md p-6 border border-slate-200">
        <h3 className="text-lg font-semibold text-slate-800 mb-4">Filtros</h3>
        <div className="grid grid-cols-1 md:grid-cols-3 lg:grid-cols-6 gap-4">
          <div>
            <label className="block text-sm font-medium text-slate-700 mb-2">Tipo</label>
            <select
              value={filters.movementType}
              onChange={(e) => setFilters({ ...filters, movementType: e.target.value })}
              className="w-full px-4 py-2 bg-slate-50 border border-slate-200 rounded-lg focus:ring-2 focus:ring-blue-500 transition"
            >
              <option value="all">Todos</option>
              <option value="income">Ingresos</option>
              <option value="sale">Ventas</option>
            </select>
          </div>

          <div>
            <label className="block text-sm font-medium text-slate-700 mb-2">Producto</label>
            <input
              type="text"
              placeholder="Buscar..."
              value={filters.product}
              onChange={(e) => setFilters({ ...filters, product: e.target.value })}
              className="w-full px-4 py-2 bg-slate-50 border border-slate-200 rounded-lg focus:ring-2 focus:ring-blue-500 transition"
            />
          </div>

          <div>
            <label className="block text-sm font-medium text-slate-700 mb-2">Categoría</label>
            <select
              value={filters.category}
              onChange={(e) => setFilters({ ...filters, category: e.target.value })}
              className="w-full px-4 py-2 bg-slate-50 border border-slate-200 rounded-lg focus:ring-2 focus:ring-blue-500 transition"
            >
              <option value="">Todas</option>
              {categories.map(cat => (
                <option key={cat} value={cat}>{cat}</option>
              ))}
            </select>
          </div>

          <div>
            <label className="block text-sm font-medium text-slate-700 mb-2">Proveedor</label>
            <select
              value={filters.provider}
              onChange={(e) => setFilters({ ...filters, provider: e.target.value })}
              className="w-full px-4 py-2 bg-slate-50 border border-slate-200 rounded-lg focus:ring-2 focus:ring-blue-500 transition"
            >
              <option value="">Todos</option>
              {providers.map(provider => (
                <option key={provider} value={provider}>{provider}</option>
              ))}
            </select>
          </div>

          <div>
            <label className="block text-sm font-medium text-slate-700 mb-2">Desde</label>
            <input
              type="date"
              value={filters.startDate}
              onChange={(e) => setFilters({ ...filters, startDate: e.target.value })}
              className="w-full px-4 py-2 bg-slate-50 border border-slate-200 rounded-lg focus:ring-2 focus:ring-blue-500 transition"
            />
          </div>

          <div>
            <label className="block text-sm font-medium text-slate-700 mb-2">Hasta</label>
            <input
              type="date"
              value={filters.endDate}
              onChange={(e) => setFilters({ ...filters, endDate: e.target.value })}
              className="w-full px-4 py-2 bg-slate-50 border border-slate-200 rounded-lg focus:ring-2 focus:ring-blue-500 transition"
            />
          </div>
        </div>

        {(filters.movementType !== 'all' || filters.product || filters.provider || filters.category || filters.startDate || filters.endDate) && (
          <button
            onClick={() => setFilters({ movementType: 'all', product: '', provider: '', category: '', startDate: '', endDate: '' })}
            className="mt-4 text-blue-600 hover:text-blue-700 text-sm font-medium"
          >
            Limpiar filtros
          </button>
        )}
      </div>

      <div className="bg-white rounded-xl shadow-md overflow-hidden border border-slate-200">
        <div className="overflow-x-auto">
          <table className="w-full">
            <thead className="bg-gradient-to-r from-slate-50 to-slate-100 border-b border-slate-200">
              <tr>
                <th className="px-6 py-4 text-left text-sm font-semibold text-slate-700">Fecha/Hora</th>
                <th className="px-6 py-4 text-left text-sm font-semibold text-slate-700">Tipo</th>
                <th className="px-6 py-4 text-left text-sm font-semibold text-slate-700">Producto</th>
                <th className="px-6 py-4 text-left text-sm font-semibold text-slate-700">Categoría</th>
                <th className="px-6 py-4 text-left text-sm font-semibold text-slate-700">Cantidad</th>
                <th className="px-6 py-4 text-left text-sm font-semibold text-slate-700">P. Unitario</th>
                <th className="px-6 py-4 text-left text-sm font-semibold text-slate-700">Total</th>
                <th className="px-6 py-4 text-left text-sm font-semibold text-slate-700">Proveedor/Ref</th>
              </tr>
            </thead>
            <tbody className="divide-y divide-slate-200">
              {filteredMovements.length === 0 ? (
                <tr>
                  <td colSpan={8} className="px-6 py-12 text-center text-slate-500">
                    No hay movimientos que coincidan con los filtros
                  </td>
                </tr>
              ) : (
                filteredMovements.map(movement => (
                  <tr key={movement.id} className="hover:bg-slate-50 transition">
                    <td className="px-6 py-4 text-sm text-slate-700">
                      {new Date(movement.created_at).toLocaleString('es-AR', {
                        timeZone: 'America/Argentina/Buenos_Aires',
                        day: '2-digit',
                        month: '2-digit',
                        year: 'numeric',
                        hour: '2-digit',
                        minute: '2-digit',
                        second: '2-digit'
                      })}
                    </td>
                    <td className="px-6 py-4">
                      <span className={`inline-flex items-center gap-1 px-3 py-1 rounded-full text-xs font-semibold ${
                        movement.movement_type === 'income'
                          ? 'bg-green-100 text-green-700'
                          : 'bg-blue-100 text-blue-700'
                      }`}>
                        {movement.movement_type === 'income' ? (
                          <>
                            <ArrowUp size={14} />
                            Ingreso
                          </>
                        ) : (
                          <>
                            <ArrowDown size={14} />
                            Venta
                          </>
                        )}
                      </span>
                    </td>
                    <td className="px-6 py-4 text-sm font-medium text-slate-800">{movement.product_name}</td>
                    <td className="px-6 py-4 text-sm text-slate-600">{movement.category}</td>
                    <td className="px-6 py-4 text-sm font-semibold text-slate-700">{movement.quantity}</td>
                    <td className="px-6 py-4 text-sm text-slate-700">${movement.unit_price.toFixed(2)}</td>
                    <td className="px-6 py-4 text-sm font-bold text-slate-800">${movement.total_amount.toFixed(2)}</td>
                    <td className="px-6 py-4 text-sm text-slate-600">{movement.provider_name || movement.sale_number || '-'}</td>
                  </tr>
                ))
              )}
            </tbody>
          </table>
        </div>
      </div>

      {showModal && (
        <div className="fixed inset-0 bg-black/60 backdrop-blur-sm flex items-center justify-center p-4 z-50 animate-fadeIn">
          <div className="bg-white rounded-2xl max-w-2xl w-full shadow-2xl animate-slideUp">
            <div className="flex justify-between items-center bg-gradient-to-r from-green-500 to-emerald-600 p-6 rounded-t-2xl">
              <h3 className="text-2xl font-bold text-white">Nuevo Ingreso de Mercadería</h3>
              <button
                onClick={() => setShowModal(false)}
                className="text-white hover:bg-white/20 p-2 rounded-lg transition"
              >
                <X size={24} />
              </button>
            </div>

            <form onSubmit={handleAddMovement} className="p-6 space-y-4">
              <div>
                <label className="block text-sm font-semibold text-slate-700 mb-2">Producto *</label>
                <select
                  required
                  value={formData.product_id}
                  onChange={(e) => setFormData({ ...formData, product_id: e.target.value })}
                  className="w-full px-4 py-2.5 bg-slate-50 border border-slate-200 rounded-xl focus:ring-2 focus:ring-green-500 focus:border-transparent transition"
                >
                  <option value="">Selecciona un producto</option>
                  {products.map(p => (
                    <option key={p.id} value={p.id}>{p.name} ({p.code})</option>
                  ))}
                </select>
              </div>

              <div className="grid grid-cols-2 gap-4">
                <div>
                  <label className="block text-sm font-semibold text-slate-700 mb-2">Cantidad *</label>
                  <input
                    type="number"
                    required
                    min="1"
                    value={formData.quantity}
                    onChange={(e) => setFormData({ ...formData, quantity: e.target.value })}
                    className="w-full px-4 py-2.5 bg-slate-50 border border-slate-200 rounded-xl focus:ring-2 focus:ring-green-500 focus:border-transparent transition"
                    placeholder="0"
                  />
                </div>

                <div>
                  <label className="block text-sm font-semibold text-slate-700 mb-2">Precio Unitario *</label>
                  <div className="relative">
                    <span className="absolute left-4 top-1/2 -translate-y-1/2 text-slate-500 font-semibold">$</span>
                    <input
                      type="number"
                      required
                      step="0.01"
                      min="0"
                      value={formData.unit_price}
                      onChange={(e) => setFormData({ ...formData, unit_price: e.target.value })}
                      className="w-full pl-8 pr-4 py-2.5 bg-slate-50 border border-slate-200 rounded-xl focus:ring-2 focus:ring-green-500 focus:border-transparent transition"
                      placeholder="0.00"
                    />
                  </div>
                </div>
              </div>

              <div>
                <label className="block text-sm font-semibold text-slate-700 mb-2">Proveedor</label>
                <input
                  type="text"
                  value={formData.provider_name}
                  onChange={(e) => setFormData({ ...formData, provider_name: e.target.value })}
                  className="w-full px-4 py-2.5 bg-slate-50 border border-slate-200 rounded-xl focus:ring-2 focus:ring-green-500 focus:border-transparent transition"
                  placeholder="Nombre del proveedor"
                />
              </div>

              <div>
                <label className="block text-sm font-semibold text-slate-700 mb-2">Descripción o Nota</label>
                <textarea
                  value={formData.description}
                  onChange={(e) => setFormData({ ...formData, description: e.target.value })}
                  className="w-full px-4 py-2.5 bg-slate-50 border border-slate-200 rounded-xl focus:ring-2 focus:ring-green-500 focus:border-transparent transition"
                  placeholder="Número de factura, lote, etc."
                  rows={3}
                />
              </div>

              <div className="flex gap-3 pt-4">
                <button
                  type="button"
                  onClick={() => setShowModal(false)}
                  className="flex-1 px-6 py-3 border-2 border-slate-300 text-slate-700 font-semibold rounded-xl hover:bg-slate-50 transition-all duration-200"
                >
                  Cancelar
                </button>
                <button
                  type="submit"
                  className="flex-1 px-6 py-3 bg-gradient-to-r from-green-500 to-emerald-600 text-white font-semibold rounded-xl hover:from-green-600 hover:to-emerald-700 shadow-lg transition-all duration-200 hover:scale-105"
                >
                  Registrar Ingreso
                </button>
              </div>
            </form>
          </div>
        </div>
      )}
    </div>
  );
}
