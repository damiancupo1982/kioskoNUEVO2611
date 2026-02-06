import { useState, useEffect } from 'react';
import { supabase, Product, Sale } from '../lib/supabase';
import { Search, Plus, Edit2, Trash2, AlertTriangle, TrendingDown, TrendingUp, ArrowUpDown } from 'lucide-react';

const PREDEFINED_CATEGORIES = ['Bebida', 'Comida', 'Artículos de Deporte'];

type SortOption = 'alphabetical' | 'category' | 'stock-status';

interface ProductWithSales extends Product {
  sold_last_7_days: number;
}

export default function Stock() {
  const [products, setProducts] = useState<ProductWithSales[]>([]);
  const [searchTerm, setSearchTerm] = useState('');
  const [sortBy, setSortBy] = useState<SortOption>('alphabetical');
  const [showModal, setShowModal] = useState(false);
  const [editingProduct, setEditingProduct] = useState<Product | null>(null);
  const [formData, setFormData] = useState({
    code: '',
    name: '',
    description: '',
    category: '',
    price: '',
    cost: '',
    stock: '',
    min_stock: ''
  });

  // Categoría seleccionada (predefinida o "nueva")
  const [categoryOption, setCategoryOption] = useState<string>('');
  const [customCategory, setCustomCategory] = useState<string>('');

  // 🔐 Función simple para pedir clave de administrador
  const askAdminPassword = () => {
    const password = window.prompt('Ingresá la clave de administrador:');

    if (!password) {
      alert('Operación cancelada.');
      return false;
    }

    if (password === 'admin123') {
      // cambiá esta clave si querés
      return true;
    }

    alert('Clave incorrecta. No tenés permisos para esta acción.');
    return false;
  };

  useEffect(() => {
    loadProducts();
  }, []);

  const loadProducts = async () => {
    const { data: productsData } = await supabase.from('products').select('*').order('name');

    if (!productsData) {
      setProducts([]);
      return;
    }

    const sevenDaysAgo = new Date();
    sevenDaysAgo.setDate(sevenDaysAgo.getDate() - 7);

    const { data: salesData } = await supabase
      .from('sales')
      .select('items')
      .gte('created_at', sevenDaysAgo.toISOString());

    const salesByProduct: { [key: string]: number } = {};

    salesData?.forEach((sale: Sale) => {
      sale.items?.forEach((item) => {
        if (!salesByProduct[item.product_id]) {
          salesByProduct[item.product_id] = 0;
        }
        salesByProduct[item.product_id] += item.quantity;
      });
    });

    const productsWithSales: ProductWithSales[] = productsData.map((product) => ({
      ...product,
      sold_last_7_days: salesByProduct[product.id] || 0
    }));

    setProducts(productsWithSales);
  };

  // 📦 Generar código sugerido para nuevo producto
  const generateSuggestedCode = () => {
    // Intentar usar códigos numéricos existentes
    const numericCodes = products
      .map((p) => parseInt(p.code, 10))
      .filter((n) => !isNaN(n) && n > 0);

    if (numericCodes.length > 0) {
      const max = Math.max(...numericCodes);
      return String(max + 1).padStart(4, '0'); // ejemplo: 0001, 0002...
    }

    // Si no hay códigos numéricos, usar fallback
    return `P-${products.length + 1}`;
  };

  // 🔧 CREAR / EDITAR PRODUCTO con control de BAJA de stock + validación de código único
  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();

    const codeTrimmed = formData.code.trim();
    if (!codeTrimmed) {
      alert('El código no puede estar vacío.');
      return;
    }

    // Verificar que el código no esté repetido
    const { data: existingCodes, error: codeCheckError } = await supabase
      .from('products')
      .select('id, code')
      .eq('code', codeTrimmed);

    if (codeCheckError) {
      console.error('Error verificando código:', codeCheckError);
      alert('Ocurrió un error al verificar el código. Intentá de nuevo.');
      return;
    }

    if (!editingProduct) {
      // Nuevo producto: si existe cualquier producto con ese código, error
      if (existingCodes && existingCodes.length > 0) {
        alert('Código en uso. Ingresá un nuevo código.');
        return;
      }
    } else {
      // Edición: permitir solo si el único producto con ese código es el mismo
      const conflict = existingCodes?.some((p) => p.id !== editingProduct.id);
      if (conflict) {
        alert('Código en uso por otro producto. Ingresá un nuevo código.');
        return;
      }
    }

    const newStock = parseInt(formData.stock) || 0;

    // Definir categoría final según opción seleccionada
    let finalCategory = '';
    if (categoryOption === '__CUSTOM__') {
      finalCategory = customCategory.trim();
    } else if (categoryOption) {
      finalCategory = categoryOption;
    }

    const productData = {
      code: codeTrimmed,
      name: formData.name,
      description: formData.description,
      category: finalCategory,
      price: parseFloat(formData.price) || 0,
      cost: parseFloat(formData.cost) || 0,
      stock: newStock,
      min_stock: parseInt(formData.min_stock) || 0,
      active: true,
      updated_at: new Date().toISOString()
    };

    if (editingProduct) {
      const previousStock = editingProduct.stock ?? 0;

      // 🔐 Si intenta CAMBIAR el stock (subir o bajar) → pedir clave de admin
      if (newStock !== previousStock) {
        const ok = askAdminPassword();
        if (!ok) return; // no guarda cambios
      }

      await supabase
        .from('products')
        .update(productData)
        .eq('id', editingProduct.id);
    } else {
      // ✔ Producto nuevo: usuario puede establecer cualquier stock inicial
      await supabase.from('products').insert([productData]);
    }

    loadProducts();
    closeModal();
  };

  // 🗑️ BORRAR producto (solo con clave de admin)
  const handleDelete = async (id: string) => {
    const ok = askAdminPassword();
    if (!ok) return;

    if (confirm('¿Eliminar este producto?')) {
      await supabase.from('products').delete().eq('id', id);
      loadProducts();
    }
  };

  // ✏ Abrir modal para editar
  const handleEdit = (product: Product) => {
    // Determinar cómo mapear la categoría actual a la UI
    let option = '';
    let custom = '';

    if (product.category && PREDEFINED_CATEGORIES.includes(product.category)) {
      option = product.category;
      custom = '';
    } else if (product.category) {
      option = '__CUSTOM__';
      custom = product.category;
    } else {
      option = '';
      custom = '';
    }

    setEditingProduct(product);
    setFormData({
      code: product.code,
      name: product.name,
      description: product.description || '',
      category: product.category || '',
      price: product.price.toString(),
      cost: product.cost.toString(),
      stock: product.stock.toString(),
      min_stock: product.min_stock.toString()
    });
    setCategoryOption(option);
    setCustomCategory(custom);
    setShowModal(true);
  };

  // ➕ Nuevo producto
  const openNewModal = () => {
    const suggestedCode = generateSuggestedCode();

    setEditingProduct(null);
    setFormData({
      code: suggestedCode,
      name: '',
      description: '',
      category: '',
      price: '',
      cost: '',
      stock: '',
      min_stock: ''
    });
    setCategoryOption('');
    setCustomCategory('');
    setShowModal(true);
  };

  const closeModal = () => {
    setShowModal(false);
    setEditingProduct(null);
  };

  const getStockStatus = (product: Product): 'none' | 'low' | 'medium' | 'high' => {
    if (product.stock === 0) return 'none';
    if (product.stock <= product.min_stock) return 'low';
    if (product.stock <= product.min_stock * 2) return 'medium';
    return 'high';
  };

  const filteredProducts = products
    .filter((p) =>
      p.name.toLowerCase().includes(searchTerm.toLowerCase()) ||
      p.code.toLowerCase().includes(searchTerm.toLowerCase()) ||
      (p.category || '').toLowerCase().includes(searchTerm.toLowerCase())
    )
    .sort((a, b) => {
      switch (sortBy) {
        case 'alphabetical':
          return a.name.localeCompare(b.name);
        case 'category':
          const catA = a.category || '';
          const catB = b.category || '';
          if (catA === catB) {
            return a.name.localeCompare(b.name);
          }
          return catA.localeCompare(catB);
        case 'stock-status': {
          const statusOrder = { none: 0, low: 1, medium: 2, high: 3 };
          const statusA = getStockStatus(a);
          const statusB = getStockStatus(b);
          if (statusA === statusB) {
            return a.name.localeCompare(b.name);
          }
          return statusOrder[statusA] - statusOrder[statusB];
        }
        default:
          return 0;
      }
    });

  const lowStockProducts = products.filter((p) => p.stock <= p.min_stock);

  return (
    <div className="space-y-4">
      {/* BUSCADOR + NUEVO PRODUCTO */}
      <div className="flex flex-col sm:flex-row gap-3 items-stretch sm:items-center">
        <div className="relative flex-1">
          <Search
            className="absolute left-3 top-1/2 transform -translate-y-1/2 text-slate-400"
            size={18}
          />
          <input
            type="text"
            placeholder="Buscar productos..."
            value={searchTerm}
            onChange={(e) => setSearchTerm(e.target.value)}
            className="w-full pl-10 pr-4 py-2 bg-slate-50 border border-slate-200 rounded-lg focus:ring-2 focus:ring-blue-500 focus:border-transparent transition"
          />
        </div>

        <button
          onClick={openNewModal}
          className="bg-gradient-to-r from-blue-500 to-cyan-600 hover:from-blue-600 hover:to-cyan-700 text-white px-5 py-2 rounded-lg flex items-center justify-center gap-2 shadow-lg transition-all duration-200 hover:scale-105 whitespace-nowrap"
        >
          <Plus size={18} />
          Nuevo Producto
        </button>
      </div>

      {/* BOTONES DE ORDENAMIENTO */}
      <div className="flex flex-wrap gap-2">
        <button
          onClick={() => setSortBy('alphabetical')}
          className={`px-4 py-1.5 rounded-lg text-sm font-medium transition-all ${
            sortBy === 'alphabetical'
              ? 'bg-blue-500 text-white shadow-md'
              : 'bg-slate-100 text-slate-700 hover:bg-slate-200'
          }`}
        >
          Alfabético
        </button>
        <button
          onClick={() => setSortBy('category')}
          className={`px-4 py-1.5 rounded-lg text-sm font-medium transition-all ${
            sortBy === 'category'
              ? 'bg-blue-500 text-white shadow-md'
              : 'bg-slate-100 text-slate-700 hover:bg-slate-200'
          }`}
        >
          Por Familia
        </button>
        <button
          onClick={() => setSortBy('stock-status')}
          className={`px-4 py-1.5 rounded-lg text-sm font-medium transition-all ${
            sortBy === 'stock-status'
              ? 'bg-blue-500 text-white shadow-md'
              : 'bg-slate-100 text-slate-700 hover:bg-slate-200'
          }`}
        >
          Por Stock
        </button>
      </div>

      {/* ALERTA DE STOCK BAJO */}
      {lowStockProducts.length > 0 && (
        <div className="bg-gradient-to-r from-amber-50 to-orange-50 border-l-4 border-amber-500 rounded-xl p-4 shadow-sm">
          <div className="flex items-start gap-3">
            <AlertTriangle
              className="text-amber-600 flex-shrink-0 mt-0.5"
              size={24}
            />
            <div className="flex-1">
              <h3 className="font-bold text-amber-900 mb-2">
                Alerta de Stock Bajo
              </h3>
              <div className="flex flex-wrap gap-2">
                {lowStockProducts.map((p) => (
                  <span
                    key={p.id}
                    className="inline-flex items-center gap-1 bg-white text-amber-800 px-3 py-1 rounded-lg text-sm font-medium shadow-sm"
                  >
                    <TrendingDown size={14} />
                    {p.name} ({p.stock})
                  </span>
                ))}
              </div>
            </div>
          </div>
        </div>
      )}

      {/* LISTA DE PRODUCTOS */}
      <div className="space-y-2">
        {filteredProducts.map((product) => {
          const stockStatus = getStockStatus(product);
          const stockPercentage = product.min_stock > 0
            ? Math.min((product.stock / (product.min_stock * 3)) * 100, 100)
            : product.stock > 0 ? 50 : 0;

          const statusColors = {
            none: { bg: 'bg-slate-100', border: 'border-slate-300', bar: 'bg-slate-400', text: 'text-slate-700', label: 'Sin Stock' },
            low: { bg: 'bg-red-50', border: 'border-red-200', bar: 'bg-red-500', text: 'text-red-700', label: 'Bajo' },
            medium: { bg: 'bg-amber-50', border: 'border-amber-200', bar: 'bg-amber-500', text: 'text-amber-700', label: 'Medio' },
            high: { bg: 'bg-emerald-50', border: 'border-emerald-200', bar: 'bg-emerald-500', text: 'text-emerald-700', label: 'Alto' }
          };

          const colors = statusColors[stockStatus];

          return (
            <div
              key={product.id}
              className={`${colors.bg} border-l-4 ${colors.border} rounded-lg shadow-sm hover:shadow-md transition-all duration-200`}
            >
              <div className="px-3 py-2">
                <div className="flex items-center gap-3">
                  {/* Nombre y código */}
                  <div className="flex-1 min-w-0">
                    <div className="flex items-center gap-2">
                      <h3 className="font-bold text-slate-800 text-sm truncate">
                        {product.name}
                      </h3>
                      <span className="text-xs text-slate-500 font-mono bg-white px-1.5 py-0.5 rounded border border-slate-200 shrink-0">
                        {product.code}
                      </span>
                      {product.category && (
                        <span className="text-xs bg-blue-100 text-blue-700 px-1.5 py-0.5 rounded-full font-medium shrink-0">
                          {product.category}
                        </span>
                      )}
                    </div>
                  </div>

                  {/* Datos en línea */}
                  <div className="flex items-center gap-4 shrink-0">
                    <div className="text-right">
                      <p className="text-xs text-slate-500">Precio</p>
                      <p className="text-sm font-bold text-emerald-600">${product.price.toFixed(2)}</p>
                    </div>
                    <div className="text-right">
                      <p className="text-xs text-slate-500">Stock</p>
                      <p className={`text-sm font-bold ${colors.text}`}>{product.stock}</p>
                    </div>
                    <div className="text-right">
                      <p className="text-xs text-slate-500">Vendidos 7d</p>
                      <p className="text-sm font-bold text-blue-600">{product.sold_last_7_days}</p>
                    </div>
                  </div>

                  {/* Barra de stock */}
                  <div className="w-32 shrink-0">
                    <div className="flex items-center gap-2">
                      <div className="flex-1 bg-slate-200 rounded-full h-2 overflow-hidden">
                        <div
                          className={`${colors.bar} h-full rounded-full transition-all duration-500`}
                          style={{ width: `${stockPercentage}%` }}
                        />
                      </div>
                      <span className={`text-xs font-bold ${colors.text} shrink-0`}>
                        {colors.label}
                      </span>
                    </div>
                  </div>

                  {/* Acciones */}
                  <div className="flex gap-1 shrink-0">
                    <button
                      onClick={() => handleEdit(product)}
                      className="p-1.5 text-blue-600 hover:bg-blue-100 rounded transition-colors"
                      title="Editar"
                    >
                      <Edit2 size={14} />
                    </button>
                    <button
                      onClick={() => handleDelete(product.id)}
                      className="p-1.5 text-red-600 hover:bg-red-100 rounded transition-colors"
                      title="Eliminar"
                    >
                      <Trash2 size={14} />
                    </button>
                  </div>
                </div>
              </div>
            </div>
          );
        })}
      </div>

      {/* MODAL */}
      {showModal && (
        <div className="fixed inset-0 bg-black/60 backdrop-blur-sm flex items-center justify-center p-4 z-50 animate-fadeIn">
          <div className="bg-white rounded-2xl max-w-2xl w-full shadow-2xl animate-slideUp">
            <div className="bg-gradient-to-r from-blue-500 to-cyan-600 p-6 rounded-t-2xl">
              <h3 className="text-2xl font-bold text-white">
                {editingProduct ? 'Editar Producto' : 'Nuevo Producto'}
              </h3>
            </div>

            <form onSubmit={handleSubmit} className="p-6 space-y-4">
              <div className="grid grid-cols-2 gap-4">
                {/* CÓDIGO */}
                <div>
                  <label className="block text-sm font-semibold text-slate-700 mb-2">
                    Código *
                  </label>
                  <input
                    type="text"
                    required
                    value={formData.code}
                    onChange={(e) =>
                      setFormData({ ...formData, code: e.target.value })
                    }
                    className="w-full px-4 py-2.5 bg-slate-50 border border-slate-200 rounded-xl focus:ring-2 focus:ring-blue-500 focus:border-transparent transition"
                  />
                </div>

                {/* SELECT DE CATEGORÍA */}
                <div>
                  <label className="block text-sm font-semibold text-slate-700 mb-2">
                    Categoría
                  </label>
                  <select
                    value={categoryOption}
                    onChange={(e) => {
                      const value = e.target.value;
                      setCategoryOption(value);
                      if (value !== '__CUSTOM__') {
                        setCustomCategory('');
                      }
                    }}
                    className="w-full px-4 py-2.5 bg-slate-50 border border-slate-200 rounded-xl focus:ring-2 focus:ring-blue-500 focus:border-transparent transition"
                  >
                    <option value="">Sin categoría</option>
                    {PREDEFINED_CATEGORIES.map((cat) => (
                      <option key={cat} value={cat}>
                        {cat}
                      </option>
                    ))}
                    <option value="__CUSTOM__">Ingresar Nueva Categoría</option>
                  </select>

                  {categoryOption === '__CUSTOM__' && (
                    <input
                      type="text"
                      placeholder="Nombre de la nueva categoría"
                      value={customCategory}
                      onChange={(e) => setCustomCategory(e.target.value)}
                      className="mt-2 w-full px-4 py-2.5 bg-slate-50 border border-slate-200 rounded-xl focus:ring-2 focus:ring-blue-500 focus:border-transparent transition"
                    />
                  )}
                </div>
              </div>

              <div>
                <label className="block text-sm font-semibold text-slate-700 mb-2">
                  Nombre *
                </label>
                <input
                  type="text"
                  required
                  value={formData.name}
                  onChange={(e) =>
                    setFormData({ ...formData, name: e.target.value })
                  }
                  className="w-full px-4 py-2.5 bg-slate-50 border border-slate-200 rounded-xl focus:ring-2 focus:ring-blue-500 focus:border-transparent transition"
                />
              </div>

              <div className="grid grid-cols-2 gap-4">
                <div>
                  <label className="block text-sm font-semibold text-slate-700 mb-2">
                    Precio *
                  </label>
                  <input
                    type="number"
                    required
                    step="0.01"
                    value={formData.price}
                    onChange={(e) =>
                      setFormData({ ...formData, price: e.target.value })
                    }
                    className="w-full px-4 py-2.5 bg-slate-50 border border-slate-200 rounded-xl focus:ring-2 focus:ring-blue-500 focus:border-transparent transition"
                  />
                </div>
                <div>
                  <label className="block text-sm font-semibold text-slate-700 mb-2">
                    Costo
                  </label>
                  <input
                    type="number"
                    step="0.01"
                    value={formData.cost}
                    onChange={(e) =>
                      setFormData({ ...formData, cost: e.target.value })
                    }
                    className="w-full px-4 py-2.5 bg-slate-50 border border-slate-200 rounded-xl focus:ring-2 focus:ring-blue-500 focus:border-transparent transition"
                  />
                </div>
              </div>

              <div className="grid grid-cols-2 gap-4">
                <div>
                  <label className="block text-sm font-semibold text-slate-700 mb-2">
                    Stock *
                  </label>
                  <input
                    type="number"
                    required
                    value={formData.stock}
                    onChange={(e) =>
                      setFormData({ ...formData, stock: e.target.value })
                    }
                    className="w-full px-4 py-2.5 bg-slate-50 border border-slate-200 rounded-xl focus:ring-2 focus:ring-blue-500 focus:border-transparent transition"
                  />
                </div>
                <div>
                  <label className="block text-sm font-semibold text-slate-700 mb-2">
                    Stock Mínimo
                  </label>
                  <input
                    type="number"
                    value={formData.min_stock}
                    onChange={(e) =>
                      setFormData({ ...formData, min_stock: e.target.value })
                    }
                    className="w-full px-4 py-2.5 bg-slate-50 border border-slate-200 rounded-xl focus:ring-2 focus:ring-blue-500 focus:border-transparent transition"
                  />
                </div>
              </div>

              <div className="flex gap-3 pt-4">
                <button
                  type="button"
                  onClick={closeModal}
                  className="flex-1 px-6 py-3 border-2 border-slate-300 text-slate-700 font-semibold rounded-xl hover:bg-slate-50 transition-all duration-200"
                >
                  Cancelar
                </button>
                <button
                  type="submit"
                  className="flex-1 px-6 py-3 bg-gradient-to-r from-blue-500 to-cyan-600 text-white font-semibold rounded-xl hover:from-blue-600 hover:to-cyan-700 shadow-lg transition-all duration-200 hover:scale-105"
                >
                  {editingProduct ? 'Actualizar' : 'Crear'}
                </button>
              </div>
            </form>
          </div>
        </div>
      )}
    </div>
  );
}
