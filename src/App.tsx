import { useState, useEffect } from 'react';
import { supabase, Shift, User } from './lib/supabase';
import Dashboard from './components/Dashboard';
import { Store, LogIn, Eye, EyeOff, DollarSign } from 'lucide-react';

function App() {
  const [currentShift, setCurrentShift] = useState<Shift | null>(null);
  const [loading, setLoading] = useState(true);
  const [showLoginModal, setShowLoginModal] = useState(false);
  const [loginForm, setLoginForm] = useState({ username: '', password: '', opening_cash: '' });
  const [loginError, setLoginError] = useState('');
  const [showPassword, setShowPassword] = useState(false);
  const [lastClosingCash, setLastClosingCash] = useState(0);
  const [showConfirmModal, setShowConfirmModal] = useState(false);
  const [pendingUser, setPendingUser] = useState<User | null>(null);

  useEffect(() => {
    initializeShift();
  }, []);

  useEffect(() => {
    if (showLoginModal) {
      loadInitialCash();
    }
  }, [showLoginModal]);

  const loadInitialCash = async () => {
    const closingCash = await getLastShiftClosingCash();
    setLastClosingCash(closingCash);
    setLoginForm(prev => ({
      ...prev,
      opening_cash: closingCash.toString()
    }));
  };

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

  const getLastShiftClosingCash = async (): Promise<number> => {
    const { data: lastShift } = await supabase
      .from('shifts')
      .select('closing_cash')
      .eq('active', false)
      .order('end_date', { ascending: false })
      .limit(1)
      .maybeSingle();

    return lastShift?.closing_cash ? Number(lastShift.closing_cash) : 0;
  };

  const handleUsernameChange = async (username: string) => {
    setLoginForm({ ...loginForm, username });

    const lastClosingCash = await getLastShiftClosingCash();
    setLoginForm(prev => ({
      ...prev,
      username,
      opening_cash: lastClosingCash.toString()
    }));
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

    const openingCashValue = parseFloat(loginForm.opening_cash || '0');

    if (isNaN(openingCashValue)) {
      setLoginError('Monto de efectivo inicial inválido');
      return;
    }

    if (openingCashValue !== lastClosingCash) {
      setPendingUser(user);
      setShowLoginModal(false);
      setShowConfirmModal(true);
      return;
    }

    await createShift(user);
  };

  const createShift = async (user: User) => {
    const { data: existingActiveShift } = await supabase
      .from('shifts')
      .select('*')
      .eq('active', true)
      .maybeSingle();

    if (existingActiveShift) {
      setCurrentShift(existingActiveShift);
      setShowLoginModal(false);
      setLoginForm({ username: '', password: '', opening_cash: '' });
      setShowConfirmModal(false);
      setPendingUser(null);
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
    setShowConfirmModal(false);
    setPendingUser(null);
    setLoginForm({ username: '', password: '', opening_cash: '' });
  };

  const handleConfirmDifference = () => {
    if (pendingUser) {
      createShift(pendingUser);
    }
  };

  const handleCancelDifference = () => {
    setShowConfirmModal(false);
    setPendingUser(null);
    setShowLoginModal(true);
    setLoginForm(prev => ({
      ...prev,
      opening_cash: lastClosingCash.toString()
    }));
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
                <span className="text-xs bg-blue-100 text-blue-700 px-2 py-1 rounded font-medium">
                  Sugerido: ${lastClosingCash.toFixed(2)}
                </span>
              </div>
              <div className="relative">
                <span className="absolute left-4 top-1/2 -translate-y-1/2 text-slate-500 font-semibold">$</span>
                <input
                  type="number"
                  step="0.01"
                  required
                  value={loginForm.opening_cash}
                  onChange={(e) => setLoginForm({ ...loginForm, opening_cash: e.target.value })}
                  className="w-full pl-8 pr-4 py-3 bg-slate-50 border-2 border-slate-200 rounded-xl focus:ring-2 focus:ring-purple-500 focus:border-transparent transition-all text-slate-700 font-semibold"
                  placeholder="0.00"
                />
              </div>
              <p className="text-xs text-slate-500 mt-1">
                Monto sugerido del cierre anterior. Si difiere, el sistema pedirá confirmación.
              </p>
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

  if (showConfirmModal) {
    return (
      <div className="min-h-screen bg-gradient-to-br from-slate-900 via-purple-900 to-slate-900 flex items-center justify-center p-4">
        <div className="bg-white rounded-2xl max-w-md w-full shadow-2xl overflow-hidden">
          <div className="bg-gradient-to-r from-yellow-500 to-orange-600 p-6 text-center">
            <div className="inline-flex items-center justify-center w-16 h-16 bg-white/20 backdrop-blur-sm rounded-2xl mb-3">
              <DollarSign className="text-white" size={32} />
            </div>
            <h2 className="text-2xl font-bold text-white mb-1">Diferencia de Efectivo</h2>
            <p className="text-yellow-100 text-sm">Se detectó una diferencia en el monto inicial</p>
          </div>

          <div className="p-8 space-y-6">
            <div className="bg-slate-50 rounded-xl p-4 space-y-3">
              <div className="flex justify-between items-center">
                <span className="text-sm text-slate-600 font-medium">Cierre anterior:</span>
                <span className="text-lg font-bold text-slate-800">${lastClosingCash.toFixed(2)}</span>
              </div>
              <div className="flex justify-between items-center">
                <span className="text-sm text-slate-600 font-medium">Monto ingresado:</span>
                <span className="text-lg font-bold text-orange-600">${parseFloat(loginForm.opening_cash).toFixed(2)}</span>
              </div>
              <div className="border-t border-slate-200 pt-3">
                <div className="flex justify-between items-center">
                  <span className="text-sm text-slate-600 font-medium">Diferencia:</span>
                  <span className={`text-xl font-bold ${parseFloat(loginForm.opening_cash) < lastClosingCash ? 'text-red-600' : 'text-emerald-600'}`}>
                    ${Math.abs(parseFloat(loginForm.opening_cash) - lastClosingCash).toFixed(2)}
                  </span>
                </div>
              </div>
            </div>

            <div className="bg-amber-50 border-2 border-amber-200 rounded-xl p-4">
              <p className="text-sm text-amber-800 text-center">
                <strong>¿Estás seguro que deseas iniciar el turno con ${parseFloat(loginForm.opening_cash).toFixed(2)}?</strong>
              </p>
              <p className="text-xs text-amber-700 text-center mt-2">
                La caja se cerró con ${lastClosingCash.toFixed(2)}. Esta diferencia quedará registrada.
              </p>
            </div>

            <div className="flex gap-3">
              <button
                onClick={handleCancelDifference}
                className="flex-1 bg-slate-200 hover:bg-slate-300 text-slate-700 px-6 py-3 rounded-xl font-bold transition-all"
              >
                Cancelar
              </button>
              <button
                onClick={handleConfirmDifference}
                className="flex-1 bg-gradient-to-r from-orange-500 to-red-600 hover:from-orange-600 hover:to-red-700 text-white px-6 py-3 rounded-xl font-bold shadow-lg transition-all"
              >
                Confirmar
              </button>
            </div>
          </div>
        </div>
      </div>
    );
  }

  return <Dashboard shift={currentShift} onCloseShift={handleCloseShift} />;
}

export default App;
