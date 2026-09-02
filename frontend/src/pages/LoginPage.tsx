import { useEffect, useState } from 'react';
import { Calendar, CheckCircle, FileText, GraduationCap, Loader2, ShieldCheck, Sparkles, UserRound, Video } from 'lucide-react';
import { toast } from 'sonner';
import { useNavigate } from '@/lib/router-hooks';
import { useAuth } from '@/contexts/auth';
import { StaggerGroup, StaggerItem } from '@/components/ui/motion';
import { firebaseLoginEnabled } from '@/lib/firebase-config';
import { getApiErrorMessage } from '@/lib/api';

const demoLoginEnabled = import.meta.env.VITE_DEMO_LOGIN_ENABLED === 'true';
type FirebaseAuthClient = typeof import('@/lib/firebase');

function GoogleIcon({ className = 'h-5 w-5' }: { className?: string }) {
  return (
    <svg className={className} viewBox="0 0 24 24" aria-hidden="true">
      <path
        fill="#4285F4"
        d="M23.745 12.27c0-.7-.06-1.4-.19-2.07H12v4.51h6.6c-.29 1.52-1.14 2.82-2.4 3.68v3.05h3.88c2.27-2.09 3.66-5.17 3.66-9.17z"
      />
      <path
        fill="#34A853"
        d="M12 24c3.24 0 5.95-1.08 7.93-2.91l-3.88-3.05c-1.08.72-2.45 1.16-4.05 1.16-3.12 0-5.77-2.1-6.72-4.93H1.25v3.15C3.26 21.36 7.33 24 12 24z"
      />
      <path
        fill="#FBBC05"
        d="M5.28 14.27c-.25-.72-.38-1.49-.38-2.27s.13-1.55.38-2.27V6.58H1.25C.45 8.16 0 9.97 0 12s.45 3.84 1.25 5.42l4.03-3.15z"
      />
      <path
        fill="#EA4335"
        d="M12 4.75c1.77 0 3.35.61 4.6 1.8l3.42-3.42C17.95 1.19 15.24 0 12 0 7.33 0 3.26 2.64 1.25 6.58l4.03 3.15c.95-2.83 3.6-4.98 6.72-4.98z"
      />
    </svg>
  );
}

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
    <div className="relative flex min-h-screen items-center justify-center overflow-hidden bg-slate-950 p-6">
      {/* Dynamic ambient background glow */}
      <div className="pointer-events-none absolute -top-40 -left-40 h-96 w-96 rounded-full bg-blue-500/10 blur-[120px]" />
      <div className="pointer-events-none absolute -bottom-40 -right-40 h-96 w-96 rounded-full bg-cyan-500/10 blur-[120px]" />

      <StaggerGroup className="relative z-10 w-full max-w-md space-y-6" stagger={0.06}>
        <StaggerItem>
          <div className="space-y-2 text-center">
            <div className="inline-flex items-center justify-center gap-2 rounded-2xl border border-white/10 bg-white/[0.05] p-3 shadow-inner backdrop-blur-md">
              <GraduationCap className="h-9 w-9 text-cyan-300" />
            </div>
            <h1 className="text-4xl font-extrabold tracking-tight text-white sm:text-5xl">ORVYN</h1>
            <p className="text-sm font-medium text-slate-400">
              Student OS terintegrasi langsung dengan <span className="font-semibold text-white">Google Workspace</span>
            </p>
          </div>
        </StaggerItem>

        <StaggerItem>
          <div className="space-y-6 rounded-3xl border border-white/10 bg-white/[0.04] p-7 shadow-2xl backdrop-blur-2xl">
            <div>
              <div className="mb-2 flex items-center justify-between">
                <h2 className="text-xl font-bold tracking-tight text-white">Masuk dengan Google</h2>
                <span className="inline-flex items-center gap-1 rounded-full border border-cyan-400/20 bg-cyan-400/10 px-2.5 py-0.5 text-[10px] font-bold uppercase tracking-wider text-cyan-300">
                  <Sparkles className="h-3 w-3" /> Eksklusif
                </span>
              </div>
              <p className="text-xs leading-relaxed text-slate-400">
                Gunakan akun Google universitas atau personalmu untuk membuka asisten kuliah, jadwal, dan catatan.
              </p>
            </div>

            <div className="space-y-3">
              {firebaseLoginEnabled && (
                <button
                  type="button"
                  onClick={() => void handleGoogleLogin()}
                  disabled={signingIn || !firebaseClient}
                  className="group relative flex w-full items-center justify-center gap-3 overflow-hidden rounded-2xl bg-white px-5 py-4 font-semibold text-slate-900 shadow-xl shadow-cyan-500/5 transition-all hover:bg-slate-50 hover:shadow-cyan-500/15 active:scale-[0.99] disabled:cursor-not-allowed disabled:opacity-60"
                >
                  {mode === 'google' || (!firebaseClient && !firebaseSetupFailed) ? (
                    <Loader2 className="h-5 w-5 animate-spin text-blue-600" />
                  ) : (
                    <GoogleIcon className="h-5 w-5 shrink-0 transition-transform duration-200 group-hover:scale-110" />
                  )}
                  <span className="text-sm font-bold tracking-tight">
                    {mode === 'google'
                      ? 'Menghubungkan akun Google...'
                      : firebaseSetupFailed
                        ? 'Google Login belum siap'
                        : firebaseClient
                          ? 'Lanjutkan dengan Google'
                          : 'Menyiapkan layanan Google...'}
                  </span>
                </button>
              )}

              {demoLoginEnabled && (
                <button
                  type="button"
                  onClick={() => void handleDemoLogin()}
                  disabled={signingIn}
                  className="group flex w-full items-center justify-center gap-2 rounded-xl border border-white/10 bg-white/[0.04] px-4 py-2.5 text-xs font-semibold text-slate-300 transition-all hover:bg-white/[0.08] hover:text-white disabled:cursor-not-allowed disabled:opacity-50"
                >
                  {mode === 'demo' ? (
                    <Loader2 className="h-4 w-4 animate-spin" />
                  ) : (
                    <UserRound className="h-4 w-4 text-slate-400 transition group-hover:scale-105" />
                  )}
                  {mode === 'demo' ? 'Menyiapkan mode demo...' : 'Mode Developer: Masuk sebagai Mahasiswa Demo'}
                </button>
              )}
            </div>

            {!hasLoginOption && (
              <div role="status" className="rounded-2xl border border-amber-300/20 bg-amber-300/10 p-4 text-xs leading-relaxed text-amber-100">
                Konfigurasi Google Identity belum terdeteksi. Silakan periksa <code className="font-mono text-cyan-200">.env</code> frontend.
              </div>
            )}

            {firebaseSetupFailed && (
              <p role="alert" className="text-xs leading-relaxed text-rose-300">
                Gagal memuat modul Google OAuth. Pastikan domain terdaftar di Google Cloud / Firebase Authorized Domains.
              </p>
            )}

            {/* Google Workspace Feature Integration Highlight */}
            <div className="space-y-2 rounded-2xl border border-white/5 bg-slate-950/40 p-3.5">
              <p className="text-[10px] font-bold uppercase tracking-wider text-slate-500">
                Fitur Google Workspace yang otomatis aktif:
              </p>
              <div className="grid grid-cols-2 gap-2 text-xs font-semibold text-slate-300">
                <div className="flex items-center gap-2 rounded-lg bg-white/[0.03] p-2">
                  <Calendar className="h-3.5 w-3.5 text-blue-400" />
                  <span>Google Calendar</span>
                </div>
                <div className="flex items-center gap-2 rounded-lg bg-white/[0.03] p-2">
                  <Video className="h-3.5 w-3.5 text-emerald-400" />
                  <span>Google Meet</span>
                </div>
                <div className="flex items-center gap-2 rounded-lg bg-white/[0.03] p-2">
                  <FileText className="h-3.5 w-3.5 text-amber-400" />
                  <span>Drive & Docs</span>
                </div>
                <div className="flex items-center gap-2 rounded-lg bg-white/[0.03] p-2">
                  <CheckCircle className="h-3.5 w-3.5 text-cyan-400" />
                  <span>Google Tasks</span>
                </div>
              </div>
            </div>

            {/* Security Badges */}
            <div className="grid grid-cols-2 gap-2.5">
              <div className="rounded-xl border border-white/10 bg-white/[0.025] p-2.5">
                <div className="mb-1 flex items-center gap-1.5 text-[10px] font-bold uppercase tracking-widest text-emerald-300">
                  <ShieldCheck className="h-3.5 w-3.5" />
                  Tanpa Sandi
                </div>
                <p className="text-[11px] font-medium leading-relaxed text-slate-400">
                  Otentikasi langsung via Google OAuth2. Tanpa sandi rentan.
                </p>
              </div>
              <div className="rounded-xl border border-white/10 bg-white/[0.025] p-2.5">
                <div className="mb-1 flex items-center gap-1.5 text-[10px] font-bold uppercase tracking-widest text-cyan-300">
                  <GraduationCap className="h-3.5 w-3.5" />
                  Aman & Terisolasi
                </div>
                <p className="text-[11px] font-medium leading-relaxed text-slate-400">
                  Sesi backend terenkripsi cookie HttpOnly anti-XSS.
                </p>
              </div>
            </div>
          </div>
        </StaggerItem>

        <StaggerItem>
          <p className="text-center text-xs text-slate-500">
            ORVYN Student OS • Dirancang untuk mahasiswa modern
          </p>
        </StaggerItem>
      </StaggerGroup>
    </div>
  );
}

