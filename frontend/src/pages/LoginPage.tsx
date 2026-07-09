import { useState, useEffect } from 'react';
import type { FormEvent } from 'react';
import { useNavigate } from 'react-router-dom';
import { motion } from 'framer-motion';
import { ChevronDown, GraduationCap, KeyRound, Loader2, LogIn, ShieldCheck, UserRound } from 'lucide-react';
import { toast } from 'sonner';
import { useAuth } from '@/contexts/auth';

export function LoginPage() {
  const [token, setToken] = useState('');
  const [showAdvanced, setShowAdvanced] = useState(false);
  const [mode, setMode] = useState<'demo' | 'token' | null>(null);
  const navigate = useNavigate();
  const { login, demoLogin, token: authToken, loading } = useAuth();

  // If already authenticated, redirect to dashboard
  useEffect(() => {
    if (!loading && authToken) {
      navigate('/dashboard');
    }
  }, [authToken, loading, navigate]);

  const handleSubmit = async (e: FormEvent) => {
    e.preventDefault();
    if (!token.trim()) {
      toast.error('Masukkan API token dulu.');
      return;
    }

    setMode('token');
    try {
      await login(token.trim());
      toast.success('Berhasil masuk.');
      navigate('/dashboard');
    } catch {
      toast.error('Token tidak valid atau backend belum aktif.');
    } finally {
      setMode(null);
    }
  };

  const handleDemoLogin = async () => {
    setMode('demo');
    try {
      await demoLogin();
      toast.success('Selamat datang di ORVYN.');
      navigate('/dashboard');
    } catch {
      toast.error('Demo login belum tersedia. Pastikan backend sudah nyala.');
    } finally {
      setMode(null);
    }
  };


  return (
    <div className="flex min-h-screen items-center justify-center bg-transparent p-6">
      <motion.div
        initial={{ opacity: 0, scale: 0.9 }}
        animate={{ opacity: 1, scale: 1 }}
        className="w-full max-w-md space-y-8"
      >
        {/* Logo */}
        <div className="text-center space-y-2">
          <div className="flex items-center justify-center gap-2">
            <GraduationCap className="w-12 h-12 text-blue-300" />
            <h1 className="text-5xl font-bold text-white">
              ORVYN
            </h1>
          </div>
          <p className="text-white/60">
            Student Operating System untuk mahasiswa
          </p>
        </div>

        {/* Login Panel */}
        <motion.div
          initial={{ opacity: 0, y: 20 }}
          animate={{ opacity: 1, y: 0 }}
          transition={{ delay: 0.1 }}
          className="p-8 rounded-2xl bg-white/5 backdrop-blur-xl border border-white/10 shadow-2xl space-y-6"
        >
          <div>
            <h2 className="text-2xl font-bold text-white mb-2">Masuk ke ORVYN</h2>
            <p className="text-sm text-white/60">
              Pakai mode demo untuk langsung mencoba dashboard mahasiswa.
            </p>
          </div>

          <button
            type="button"
            onClick={() => void handleDemoLogin()}
            disabled={loading}
            className="group flex w-full items-center justify-center gap-3 rounded-xl bg-white px-4 py-3.5 font-semibold text-slate-950 transition-all hover:bg-slate-100 disabled:cursor-not-allowed disabled:opacity-50"
          >
            {mode === 'demo' && loading ? (
              <Loader2 className="h-5 w-5 animate-spin" />
            ) : (
              <UserRound className="h-5 w-5 transition group-hover:scale-105" />
            )}
            {mode === 'demo' && loading ? 'Menyiapkan demo...' : 'Masuk sebagai Mahasiswa Demo'}
          </button>

          <div className="grid grid-cols-1 gap-3 sm:grid-cols-2">
            <div className="rounded-xl border border-white/10 bg-white/[0.035] p-3">
              <div className="mb-2 flex items-center gap-2 text-[10px] font-bold uppercase tracking-widest text-emerald-200">
                <ShieldCheck className="h-3.5 w-3.5" />
                Aman
              </div>
              <p className="text-xs font-medium leading-relaxed text-slate-400">
                Token dibuat oleh backend dan disimpan lokal di browser.
              </p>
            </div>
            <div className="rounded-xl border border-white/10 bg-white/[0.035] p-3">
              <div className="mb-2 flex items-center gap-2 text-[10px] font-bold uppercase tracking-widest text-cyan-200">
                <GraduationCap className="h-3.5 w-3.5" />
                Siap
              </div>
              <p className="text-xs font-medium leading-relaxed text-slate-400">
                Demo berisi task, habit, dan jadwal kampus contoh.
              </p>
            </div>
          </div>

          <button
            type="button"
            onClick={() => setShowAdvanced((value) => !value)}
            className="flex w-full items-center justify-between rounded-xl border border-white/10 bg-white/[0.035] px-4 py-3 text-left text-sm font-semibold text-slate-300 transition hover:bg-white/[0.06]"
          >
            <span className="inline-flex items-center gap-2">
              <KeyRound className="h-4 w-4 text-slate-500" />
              Login dengan token
            </span>
            <ChevronDown className={`h-4 w-4 text-slate-500 transition ${showAdvanced ? 'rotate-180' : ''}`} />
          </button>

          {showAdvanced && (
            <motion.form
              onSubmit={handleSubmit}
              initial={{ opacity: 0, height: 0 }}
              animate={{ opacity: 1, height: 'auto' }}
              className="space-y-3 overflow-hidden"
            >
              <div className="space-y-2">
                <label htmlFor="token" className="text-sm text-white/80">
                  API Token
                </label>
                <input
                  id="token"
                  type="text"
                  value={token}
                  onChange={(e) => setToken(e.target.value)}
                  placeholder="1|L53LlkB1Fe6MgnuTQ1MKH..."
                  className="w-full px-4 py-3 rounded-xl bg-white/5 border border-white/10 text-white placeholder-white/40 outline-none focus:border-purple-500/50 transition-colors"
                />
                <p className="text-xs text-white/40">
                  Gunakan ini kalau sudah punya Sanctum API token.
                </p>
              </div>

              <button
                type="submit"
                disabled={loading || !token.trim()}
                className="flex w-full items-center justify-center gap-2 rounded-xl border border-white/10 bg-white/[0.07] px-4 py-3 font-semibold text-white transition-all hover:bg-white/[0.11] disabled:cursor-not-allowed disabled:opacity-50"
              >
                {mode === 'token' && loading ? (
                  <Loader2 className="w-5 h-5 animate-spin" />
                ) : (
                  <LogIn className="w-5 h-5" />
                )}
                {mode === 'token' && loading ? 'Memeriksa...' : 'Masuk dengan Token'}
              </button>
            </motion.form>
          )}
        </motion.div>

        {/* Footer */}
        <p className="text-center text-xs text-white/40">
          ORVYN untuk kuliah, fokus, kampus, uang bulanan, dan kesehatan.
        </p>
      </motion.div>
    </div>
  );
}
