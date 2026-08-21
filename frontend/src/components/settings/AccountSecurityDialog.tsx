import { useCallback, useEffect, useState } from 'react';
import { Download, Laptop, Loader2, LogOut, RefreshCw, ShieldCheck, Smartphone, Trash2 } from 'lucide-react';
import { toast } from 'sonner';
import { Button } from '@/components/ui/button';
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from '@/components/ui/dialog';
import { Input } from '@/components/ui/input';
import { useAuth } from '@/contexts/auth';
import { authApi, getApiErrorMessage, type AuthSession, userDataApi } from '@/lib/api';
import { firebaseLoginEnabled } from '@/lib/firebase-config';
import { getGoogleIdToken, prepareGoogleAuth } from '@/lib/firebase';

interface AccountSecurityDialogProps {
  open: boolean;
  onOpenChange: (open: boolean) => void;
}

export function AccountSecurityDialog({ open, onOpenChange }: AccountSecurityDialogProps) {
  const { refreshUser, user } = useAuth();
  const [sessions, setSessions] = useState<AuthSession[]>([]);
  const [loading, setLoading] = useState(false);
  const [busySessionId, setBusySessionId] = useState<number | null>(null);
  const [deletePhrase, setDeletePhrase] = useState('');
  const [deleting, setDeleting] = useState(false);
  const [exporting, setExporting] = useState(false);

  const loadSessions = useCallback(async (signal?: AbortSignal) => {
    if (signal?.aborted) return;

    setLoading(true);
    try {
      const response = await authApi.sessions();
      if (!signal?.aborted) {
        setSessions(response.data.data);
      }
    } catch (error) {
      if (!signal?.aborted) {
        toast.error(getApiErrorMessage(error, 'Daftar perangkat belum dapat dimuat.'));
      }
    } finally {
      if (!signal?.aborted) {
        setLoading(false);
      }
    }
  }, []);

  useEffect(() => {
    if (!open) return;

    const controller = new AbortController();
    queueMicrotask(() => void loadSessions(controller.signal));

    return () => controller.abort();
  }, [loadSessions, open]);

  const revokeSession = async (session: AuthSession) => {
    setBusySessionId(session.id);
    try {
      await authApi.revokeSession(session.id);
      setSessions((current) => current.filter((item) => item.id !== session.id));
      toast.success(`Sesi ${session.device_name} sudah diputus.`);
    } catch (error) {
      toast.error(getApiErrorMessage(error, 'Sesi belum dapat diputus.'));
    } finally {
      setBusySessionId(null);
    }
  };

  const logoutEverywhere = async () => {
    if (!window.confirm('Keluar dari semua perangkat, termasuk perangkat ini?')) return;

    try {
      await authApi.logoutAll();
      await refreshUser();
      onOpenChange(false);
      toast.success('Semua sesi sudah diputus.');
    } catch (error) {
      toast.error(getApiErrorMessage(error, 'Semua sesi belum dapat diputus.'));
    }
  };

  const exportData = async () => {
    setExporting(true);
    try {
      const response = await userDataApi.exportData();
      const url = URL.createObjectURL(response.data);
      const anchor = document.createElement('a');
      anchor.href = url;
      anchor.download = `orvyn-data-${new Date().toISOString().slice(0, 10)}.json`;
      anchor.click();
      URL.revokeObjectURL(url);
      toast.success('Arsip data ORVYN berhasil diunduh.');
    } catch (error) {
      toast.error(getApiErrorMessage(error, 'Data belum dapat diekspor.'));
    } finally {
      setExporting(false);
    }
  };

  const deleteAccount = async () => {
    if (deletePhrase !== 'HAPUS AKUN') return;

    setDeleting(true);
    try {
      await prepareGoogleAuth();
      const idToken = await getGoogleIdToken();
      await userDataApi.deleteAccount(deletePhrase, idToken);
      await refreshUser();
      onOpenChange(false);
      toast.success('Akun dan data ORVYN sudah dihapus.');
    } catch (error) {
      toast.error(getApiErrorMessage(error, 'Akun belum dapat dihapus.'));
      setDeleting(false);
    }
  };

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="max-h-[88vh] overflow-y-auto border-white/15 bg-slate-950/95 text-white shadow-2xl backdrop-blur-2xl sm:max-w-2xl">
        <DialogHeader>
          <DialogTitle className="flex items-center gap-2 text-xl">
            <ShieldCheck className="h-5 w-5 text-cyan-300" />
            Akun & keamanan
          </DialogTitle>
          <DialogDescription className="text-slate-400">
            Kelola perangkat yang masuk, arsip data, dan privasi akun {user?.email}.
          </DialogDescription>
        </DialogHeader>

        <section aria-labelledby="active-sessions-heading" className="rounded-2xl border border-white/10 bg-white/[0.04] p-4">
          <div className="flex items-center justify-between gap-3">
            <div>
              <p className="text-[10px] font-black uppercase tracking-[0.2em] text-cyan-300">Keamanan</p>
              <h3 id="active-sessions-heading" className="mt-1 text-sm font-semibold text-white">Perangkat aktif</h3>
            </div>
            <Button
              type="button"
              variant="ghost"
              size="icon"
              aria-label="Muat ulang daftar perangkat"
              disabled={loading}
              onClick={() => void loadSessions()}
              className="text-slate-400 hover:bg-white/10 hover:text-white"
            >
              {loading ? <Loader2 className="animate-spin" /> : <RefreshCw />}
            </Button>
          </div>

          <div className="mt-3 space-y-2" aria-live="polite">
            {!loading && sessions.length === 0 ? (
              <p className="rounded-xl border border-dashed border-white/10 px-3 py-4 text-center text-xs text-slate-500">
                Tidak ada sesi perangkat yang dapat ditampilkan.
              </p>
            ) : sessions.map((session) => (
              <div key={session.id} className="flex items-center gap-3 rounded-xl border border-white/10 bg-black/20 px-3 py-3">
                <div className="flex h-10 w-10 shrink-0 items-center justify-center rounded-xl bg-cyan-400/10 text-cyan-300">
                  {session.device_name.toLowerCase().includes('web') ? <Laptop /> : <Smartphone />}
                </div>
                <div className="min-w-0 flex-1">
                  <div className="flex flex-wrap items-center gap-2">
                    <p className="truncate text-xs font-semibold text-white">{session.device_name}</p>
                    {session.is_current && (
                      <span className="rounded-full border border-emerald-300/20 bg-emerald-300/10 px-2 py-0.5 text-[9px] font-black uppercase tracking-wider text-emerald-300">
                        Perangkat ini
                      </span>
                    )}
                  </div>
                  <p className="mt-1 text-[10px] text-slate-500">
                    {session.last_used_at ? `Aktif ${formatDateTime(session.last_used_at)}` : `Dibuat ${formatDateTime(session.created_at)}`}
                    {session.expires_at ? ` · berakhir ${formatDateTime(session.expires_at)}` : ''}
                  </p>
                </div>
                {!session.is_current && (
                  <Button
                    type="button"
                    variant="ghost"
                    size="sm"
                    disabled={busySessionId === session.id}
                    onClick={() => void revokeSession(session)}
                    className="text-rose-300 hover:bg-rose-400/10 hover:text-rose-200"
                  >
                    {busySessionId === session.id ? <Loader2 className="animate-spin" /> : <LogOut />}
                    Putuskan
                  </Button>
                )}
              </div>
            ))}
          </div>

          <Button
            type="button"
            variant="outline"
            size="sm"
            onClick={() => void logoutEverywhere()}
            className="mt-3 border-white/10 bg-transparent text-slate-300 hover:bg-white/10 hover:text-white"
          >
            <LogOut />
            Keluar dari semua perangkat
          </Button>
        </section>

        <section aria-labelledby="data-privacy-heading" className="rounded-2xl border border-white/10 bg-white/[0.04] p-4">
          <p className="text-[10px] font-black uppercase tracking-[0.2em] text-purple-300">Privasi</p>
          <h3 id="data-privacy-heading" className="mt-1 text-sm font-semibold text-white">Data milikmu</h3>
          <p className="mt-1 text-xs leading-relaxed text-slate-500">
            Unduh salinan tugas, jadwal, kebiasaan, kesehatan, keuangan, dan preferensi akun dalam format JSON.
          </p>
          <Button
            type="button"
            variant="outline"
            size="sm"
            disabled={exporting}
            onClick={() => void exportData()}
            className="mt-3 border-white/10 bg-transparent text-slate-200 hover:bg-white/10 hover:text-white"
          >
            {exporting ? <Loader2 className="animate-spin" /> : <Download />}
            Unduh data saya
          </Button>
        </section>

        <section aria-labelledby="delete-account-heading" className="rounded-2xl border border-rose-400/20 bg-rose-400/[0.05] p-4">
          <div className="flex items-start gap-3">
            <div className="flex h-10 w-10 shrink-0 items-center justify-center rounded-xl bg-rose-400/10 text-rose-300">
              <Trash2 />
            </div>
            <div className="min-w-0 flex-1">
              <h3 id="delete-account-heading" className="text-sm font-semibold text-rose-100">Hapus akun permanen</h3>
              <p className="mt-1 text-xs leading-relaxed text-rose-100/60">
                Tindakan ini menghapus identitas login, data ORVYN, dan seluruh sesi. Ketik <strong>HAPUS AKUN</strong>, lalu verifikasi ulang dengan Google.
              </p>
              <div className="mt-3 flex flex-col gap-2 sm:flex-row">
                <Input
                  value={deletePhrase}
                  onChange={(event) => setDeletePhrase(event.target.value)}
                  placeholder="HAPUS AKUN"
                  aria-label="Konfirmasi hapus akun"
                  className="border-rose-400/20 bg-black/20 text-white placeholder:text-rose-100/30 focus-visible:ring-rose-300"
                />
                <Button
                  type="button"
                  variant="destructive"
                  disabled={deletePhrase !== 'HAPUS AKUN' || deleting || !firebaseLoginEnabled}
                  onClick={() => void deleteAccount()}
                  className="shrink-0"
                >
                  {deleting ? <Loader2 className="animate-spin" /> : <Trash2 />}
                  Verifikasi & hapus
                </Button>
              </div>
              {!firebaseLoginEnabled && (
                <p className="mt-2 text-[10px] text-rose-100/50">
                  Penghapusan identitas memerlukan konfigurasi Firebase pada deployment ini.
                </p>
              )}
            </div>
          </div>
        </section>

        <DialogFooter>
          <Button type="button" variant="outline" onClick={() => onOpenChange(false)} className="border-white/10 bg-transparent text-white hover:bg-white/10">
            Selesai
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}

function formatDateTime(value: string | null): string {
  if (!value) return 'belum pernah';

  return new Intl.DateTimeFormat('id-ID', {
    dateStyle: 'medium',
    timeStyle: 'short',
  }).format(new Date(value));
}
