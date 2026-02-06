import { useState, useEffect } from 'react';
import { supabase, Shift, User } from './lib/supabase';
import Dashboard from './components/Dashboard';
import { Store, LogIn, Eye, EyeOff } from 'lucide-react';

function App() {
  const [currentShift, setCurrentShift] = useState<Shift | null>(null);
  const [loading, setLoading] = useState(true);
  const [showLoginModal, setShowLoginModal] = useState(false);
  const [loginForm, setLoginForm] = useState({ username: '', password: '', opening_cash: '' });
  const [loginError, setLoginError] = useState('');
  const [showPassword, setShowPassword] = useState(false);

  useEffect(() => {
    initializeShift();
  }, []);

  const initializeShift = async () => {
    try {
      const { data: activeShift } = await supabase
        .from('shifts')
        .select('*')
        .eq('active', true)
        .maybeSingle();

      if (activeShift) {
        setCurrentShift(activeShift);
      } else {
        setShowLoginModal(true);
      }
    } catch (error) {
      console.error('Error initializing shift:', error);
    } finally {
      setLoading(false);
    }
  };

  const getLastShiftClosingCash = async (userId: string): Promise<number | null> => {
    const { data: lastShift } = await supabase
      .from('shifts')
      .select('closing_cash')
      .eq('user_id', userId)
      .eq('active', false)
      .order('end_date', { ascending: false })
      .limit(1)
      .maybeSingle();

    return lastShift?.closing_cash ? Number(lastShift.closing_cash) : null;
  };

  const handleUsernameChange = async (username: string) => {
    setLoginForm({ ...loginForm, username });

    const { data: user } = await supabase
      .from('users')
      .select('*')
      .eq('username', username)
      .eq('active', true)
      .maybeSingle();

    if (user) {
      const lastClosingCash = await getLastShiftClosingCash(user.id);
      if (lastClosingCash !== null) {
        setLoginForm(prev => ({
          ...prev,
          opening_cash: lastClosingCash.toString()
        }));
      }
    }
  };

  const handleLogin = async (e: React.FormEvent) => {
    e.preventDefault();
    setLoginError('');

    const { data: user } = await supabase
      .from('users')
      .select('*')
      .eq('username', loginForm.username)
      .eq('password', loginForm.password)
      .eq('active', true)
      .maybeSingle();

    if (!user) {
      setLoginError('Usuario o contraseña incorrectos');
      return;
    }

    const { data: newShift, error } = await supabase
      .from('shifts')
      .insert([{
        user_id: user.id,
        user_name: user.full_name,
        opening_cash: parseFloat(loginForm.opening_cash),
        active: true
      }])
      .select()
      .single();

    if (error) {
      setLoginError('Error al crear el turno');
      console.error(error);
      return;
    }

    setCurrentShift(newShift);
    setShowLoginModal(false);
    setLoginForm({ username: '', password: '', opening_cash: '' });
  };

  const handleCloseShift = async (closingCash: number) => {
    if (!currentShift) return;

    const { data: sales } = await supabase
      .from('sales')
      .select('total')
      .eq('shift_id', currentShift.id);

    const totalSales = sales?.reduce((sum, s) => sum + Number(s.total), 0) || 0;

    const { data: expenses } = await supabase
      .from('cash_transactions')
      .select('amount')
      .eq('shift_id', currentShift.id)
      .eq('type', 'expense');

    const totalExpenses = expenses?.reduce((sum, e) => sum + Number(e.amount), 0) || 0;

    await supabase
      .from('shifts')
      .update({
        end_date: new Date().toISOString(),
        closing_cash: closingCash,
        total_sales: totalSales,
        total_expenses: totalExpenses,
        active: false
      })
      .eq('id', currentShift.id);

    setCurrentShift(null);
    setShowLoginModal(true);
  };

  if (loading) {
    return (
      <div className="min-h-screen bg-gradient-to-br from-slate-900 via-purple-900 to-slate-900 flex items-center justify-center">
        <div className="text-center">
          <div className="animate-spin rounded-full h-16 w-16 border-t-4 border-b-4 border-purple-500 mx-auto mb-4"></div>
          <p className="text-white text-xl font-semibold">Cargando Sistema...</p>
        </div>
      </div>
    );
  }

  if (showLoginModal) {
    return (
      <div className="min-h-screen bg-gradient-to-br from-slate-900 via-purple-900 to-slate-900 flex items-center justify-center p-4">
        <div className="bg-white rounded-2xl max-w-md w-full shadow-2xl overflow-hidden">
          <div className="bg-gradient-to-r from-purple-500 to-pink-600 p-8 text-center">
            <div className="inline-flex items-center justify-center w-20 h-20 bg-white/20 backdrop-blur-sm rounded-2xl mb-4">
              <Store className="text-white" size={40} />
            </div>
            <h2 className="text-3xl font-bold text-white mb-2">Iniciar Turno</h2>
            <p className="text-purple-100">Ingresa tus credenciales para comenzar</p>
          </div>

          <form onSubmit={handleLogin} className="p-8 space-y-5">
            {loginError && (
              <div className="bg-red-50 border-2 border-red-200 text-red-700 px-4 py-3 rounded-xl text-sm font-medium">
                {loginError}
              </div>
            )}

            <div>
              <label className="block text-sm font-semibold text-slate-700 mb-2">Usuario *</label>
              <input
                type="text"
                required
                value={loginForm.username}
                onChange={(e) => handleUsernameChange(e.target.value)}
                className="w-full px-4 py-3 bg-slate-50 border-2 border-slate-200 rounded-xl focus:ring-2 focus:ring-purple-500 focus:border-transparent transition-all"
                placeholder="Ingresa tu usuario"
              />
            </div>

            <div>
              <label className="block text-sm font-semibold text-slate-700 mb-2">Contraseña *</label>
              <div className="relative">
                <input
                  type={showPassword ? 'text' : 'password'}
                  required
                  value={loginForm.password}
                  onChange={(e) => setLoginForm({ ...loginForm, password: e.target.value })}
                  className="w-full px-4 py-3 bg-slate-50 border-2 border-slate-200 rounded-xl focus:ring-2 focus:ring-purple-500 focus:border-transparent transition-all pr-12"
                  placeholder="Ingresa tu contraseña"
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
              <div className="flex items-center gap-2 mb-2">
                <label className="block text-sm font-semibold text-slate-700">Efectivo Inicial *</label>
                {loginForm.opening_cash && loginForm.username && (
                  <span className="text-xs bg-emerald-100 text-emerald-700 px-2 py-1 rounded font-medium">
                    Cierre anterior
                  </span>
                )}
              </div>
              <div className="relative">
                <span className="absolute left-4 top-1/2 -translate-y-1/2 text-slate-500 font-semibold">$</span>
                <input
                  type="number"
                  required
                  step="0.01"
                  min="0"
                  value={loginForm.opening_cash}
                  onChange={(e) => setLoginForm({ ...loginForm, opening_cash: e.target.value })}
                  className="w-full pl-8 pr-4 py-3 bg-slate-50 border-2 border-slate-200 rounded-xl focus:ring-2 focus:ring-purple-500 focus:border-transparent transition-all"
                  placeholder="0.00"
                />
              </div>
              <p className="text-xs text-slate-500 mt-1">Monto en efectivo con el que inicias el turno</p>
            </div>

            <button
              type="submit"
              className="w-full bg-gradient-to-r from-purple-500 to-pink-600 hover:from-purple-600 hover:to-pink-700 text-white px-6 py-4 rounded-xl font-bold text-lg shadow-lg transition-all flex items-center justify-center gap-2"
            >
              <LogIn size={24} />
              Iniciar Turno
            </button>
          </form>
        </div>
      </div>
    );
  }

  return <Dashboard shift={currentShift} onCloseShift={handleCloseShift} />;
}

export default App;
