import { useEffect, useState } from 'react';
import { GraduationCap, Loader2, LogIn, ShieldCheck, UserRound } from 'lucide-react';
import { toast } from 'sonner';
import { useNavigate } from '@/lib/router-hooks';
import { useAuth } from '@/contexts/auth';
import { StaggerGroup, StaggerItem } from '@/components/ui/motion';
import { firebaseLoginEnabled } from '@/lib/firebase-config';
import { getApiErrorMessage } from '@/lib/api';

const demoLoginEnabled = import.meta.env.VITE_DEMO_LOGIN_ENABLED === 'true';
type FirebaseAuthClient = typeof import('@/lib/firebase');

export function LoginPage() {
  const [mode, setMode] = useState<'google' | 'demo' | null>(null);
  const [firebaseClient, setFirebaseClient] = useState<FirebaseAuthClient | null>(null);
  const [firebaseSetupFailed, setFirebaseSetupFailed] = useState(false);
  const navigate = useNavigate();
  const {
    demoLogin,
    firebaseLogin,
    isAuthenticated,
    loading,
  } = useAuth();

  useEffect(() => {
    if (!loading && isAuthenticated) {
      navigate('/dashboard', { replace: true });
    }
  }, [isAuthenticated, loading, navigate]);

  useEffect(() => {
    if (!firebaseLoginEnabled || loading || isAuthenticated) return;

    let active = true;
    void import('@/lib/firebase')
      .then(async (client) => {
        await client.prepareGoogleAuth();
        if (active) {
          setFirebaseClient(client);
          setFirebaseSetupFailed(false);
        }
      })
      .catch(() => {
        if (active) {
          setFirebaseSetupFailed(true);
        }
      });

    return () => {
      active = false;
    };
  }, [isAuthenticated, loading]);

  const handleGoogleLogin = async () => {
    if (!firebaseClient) return;

    setMode('google');

    try {
      const idToken = await firebaseClient.getGoogleIdToken();
      await firebaseLogin(idToken);
      toast.success('Berhasil masuk dengan Google.');
      navigate('/dashboard', { replace: true });
    } catch (error) {
      const code = (error as { code?: unknown } | null)?.code;
      if (code === 'auth/popup-closed-by-user' || code === 'auth/cancelled-popup-request') {
        toast.info('Login Google dibatalkan.');
      } else {
        toast.error(getApiErrorMessage(error, 'Login Google belum berhasil. Coba lagi.'));
      }
    } finally {
      setMode(null);
    }
  };

  const handleDemoLogin = async () => {
    setMode('demo');

    try {
      await demoLogin();
      toast.success('Selamat datang di ORVYN.');
      navigate('/dashboard', { replace: true });
    } catch (error) {
      toast.error(getApiErrorMessage(error, 'Demo login belum tersedia.'));
    } finally {
      setMode(null);
    }
  };

  const signingIn = loading || mode !== null;
  const hasLoginOption = firebaseLoginEnabled || demoLoginEnabled;

  return (
    <div className="flex min-h-screen items-center justify-center bg-transparent p-6">
      <StaggerGroup className="w-full max-w-md space-y-8" stagger={0.06}>
        <StaggerItem>
          <div className="space-y-2 text-center">
            <div className="flex items-center justify-center gap-2">
              <GraduationCap className="h-12 w-12 text-blue-300" />
              <h1 className="text-5xl font-bold text-white">ORVYN</h1>
            </div>
            <p className="text-white/60">
              Student Operating System untuk mahasiswa
            </p>
          </div>
        </StaggerItem>

        <StaggerItem>
          <div className="space-y-6 rounded-2xl border border-white/10 bg-white/5 p-8 shadow-2xl backdrop-blur-xl">
            <div>
              <h2 className="mb-2 text-2xl font-bold text-white">Masuk ke ORVYN</h2>
              <p className="text-sm text-white/60">
                Gunakan akun Google yang terverifikasi untuk membuka ruang belajarmu.
              </p>
            </div>

            <div className="space-y-3">
              {firebaseLoginEnabled && (
                <button
                  type="button"
                  onClick={() => void handleGoogleLogin()}
                  disabled={signingIn || !firebaseClient}
                  className="group flex w-full items-center justify-center gap-3 rounded-xl bg-white px-4 py-3.5 font-semibold text-slate-950 transition-all hover:bg-slate-100 disabled:cursor-not-allowed disabled:opacity-50"
                >
                  {mode === 'google' || (!firebaseClient && !firebaseSetupFailed) ? (
                    <Loader2 className="h-5 w-5 animate-spin" />
                  ) : (
                    <LogIn className="h-5 w-5 transition group-hover:scale-105" />
                  )}
                  {mode === 'google'
                    ? 'Menghubungkan Google...'
                    : firebaseSetupFailed
                      ? 'Google tidak tersedia'
                      : firebaseClient
                        ? 'Lanjutkan dengan Google'
                        : 'Menyiapkan Google...'}
                </button>
              )}

              {demoLoginEnabled && (
                <button
                  type="button"
                  onClick={() => void handleDemoLogin()}
                  disabled={signingIn}
                  className="group flex w-full items-center justify-center gap-3 rounded-xl border border-white/10 bg-white/[0.07] px-4 py-3.5 font-semibold text-white transition-all hover:bg-white/[0.11] disabled:cursor-not-allowed disabled:opacity-50"
                >
                  {mode === 'demo' ? (
                    <Loader2 className="h-5 w-5 animate-spin" />
                  ) : (
                    <UserRound className="h-5 w-5 transition group-hover:scale-105" />
                  )}
                  {mode === 'demo' ? 'Menyiapkan demo...' : 'Masuk sebagai Mahasiswa Demo'}
                </button>
              )}
            </div>

            {!hasLoginOption && (
              <div role="status" className="rounded-xl border border-amber-300/20 bg-amber-300/10 p-4 text-sm leading-relaxed text-amber-100">
                Login web belum dikonfigurasi. Lengkapi konfigurasi Firebase atau aktifkan demo login pada environment deployment.
              </div>
            )}

            {firebaseSetupFailed && (
              <p role="alert" className="text-xs leading-relaxed text-rose-200">
                Konfigurasi Google tidak dapat dimuat. Periksa Firebase authorized domain dan environment deployment.
              </p>
            )}

            <div className="grid grid-cols-1 gap-3 sm:grid-cols-2">
              <div className="rounded-xl border border-white/10 bg-white/[0.035] p-3">
                <div className="mb-2 flex items-center gap-2 text-[10px] font-bold uppercase tracking-widest text-emerald-200">
                  <ShieldCheck className="h-3.5 w-3.5" />
                  Aman
                </div>
                <p className="text-xs font-medium leading-relaxed text-slate-400">
                  Sesi backend memakai cookie aman; token akses tidak disimpan di browser storage.
                </p>
              </div>
              <div className="rounded-xl border border-white/10 bg-white/[0.035] p-3">
                <div className="mb-2 flex items-center gap-2 text-[10px] font-bold uppercase tracking-widest text-cyan-200">
                  <GraduationCap className="h-3.5 w-3.5" />
                  Privat
                </div>
                <p className="text-xs font-medium leading-relaxed text-slate-400">
                  Identitas Google dipakai sekali untuk membuat sesi ORVYN dan tidak disimpan lokal.
                </p>
              </div>
            </div>
          </div>
        </StaggerItem>

        <StaggerItem>
          <p className="text-center text-xs text-white/40">
            ORVYN untuk kuliah, fokus, kampus, uang bulanan, dan kesehatan.
          </p>
        </StaggerItem>
      </StaggerGroup>
    </div>
  );
}
