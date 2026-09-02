import { useEffect, useState } from 'react';
import {
  Calendar,
  Check,
  CheckCircle2,
  Copy,
  ExternalLink,
  FileText,
  ListTodo,
  Loader2,
  Plus,
  RefreshCw,
  Video,
} from 'lucide-react';
import { toast } from 'sonner';
import { googleIntegrationApi, type GoogleWorkspaceStatus } from '@/lib/api';
import { getApiErrorMessage } from '@/lib/api';

function GoogleIcon({ className = 'h-4 w-4' }: { className?: string }) {
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

type TabType = 'calendar' | 'meet' | 'drive' | 'tasks';

export function GoogleWorkspaceCard({ compact = false }: { compact?: boolean }) {
  const [status, setStatus] = useState<GoogleWorkspaceStatus | null>(null);
  const [loading, setLoading] = useState(true);
  const [activeTab, setActiveTab] = useState<TabType>('calendar');

  // Action states
  const [syncingCalendar, setSyncingCalendar] = useState(false);
  const [creatingMeet, setCreatingMeet] = useState(false);
  const [exportingDrive, setExportingDrive] = useState(false);
  const [syncingTasks, setSyncingTasks] = useState(false);

  // Meet creation form
  const [meetTitle, setMeetTitle] = useState('Sesi Belajar Bersama ORVYN');
  const [meetDuration, setMeetDuration] = useState(60);
  const [lastMeetResult, setLastMeetResult] = useState<{
    meet_code: string;
    meet_url: string;
    calendar_event_url: string;
  } | null>(null);
  const [copiedMeet, setCopiedMeet] = useState(false);

  // Drive export form
  const [exportDocTitle, setExportDocTitle] = useState('Ringkasan Belajar & Catatan AI ORVYN');
  const [exportDocContent] = useState(
    '# Catatan Kuliah ORVYN\nDisinkronkan secara otomatis dari ORVYN Student OS.\n- Jadwal Kuliah\n- To-Do List Prioritas\n- Target Kebiasaan'
  );

  const fetchStatus = async () => {
    setLoading(true);
    try {
      const res = await googleIntegrationApi.getStatus();
      if (res.data?.data) {
        setStatus(res.data.data);
      }
    } catch {
      // Non-blocking fallback
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => {
    void fetchStatus();
  }, []);

  const handleSyncCalendar = async () => {
    setSyncingCalendar(true);
    try {
      const res = await googleIntegrationApi.syncCalendar();
      toast.success(res.data?.message ?? 'Jadwal berhasil disinkronkan ke Google Calendar!');
      void fetchStatus();
    } catch (err) {
      toast.error(getApiErrorMessage(err, 'Gagal menyinkronkan Google Calendar'));
    } finally {
      setSyncingCalendar(false);
    }
  };

  const handleCreateMeet = async () => {
    if (!meetTitle.trim()) {
      toast.error('Judul sesi meet wajib diisi.');
      return;
    }

    setCreatingMeet(true);
    try {
      const res = await googleIntegrationApi.createMeet({
        title: meetTitle.trim(),
        duration_minutes: meetDuration,
      });
      const data = res.data?.data;
      if (data) {
        setLastMeetResult({
          meet_code: data.meet_code,
          meet_url: data.meet_url,
          calendar_event_url: data.calendar_event_url,
        });
        toast.success(`Ruang Google Meet siap: ${data.meet_code}`);
      }
    } catch (err) {
      toast.error(getApiErrorMessage(err, 'Gagal membuat ruang Google Meet'));
    } finally {
      setCreatingMeet(false);
    }
  };

  const handleCopyMeet = () => {
    if (!lastMeetResult) return;
    void navigator.clipboard.writeText(lastMeetResult.meet_url);
    setCopiedMeet(true);
    toast.success('Tautan Google Meet disalin!');
    setTimeout(() => setCopiedMeet(false), 2000);
  };

  const handleExportDrive = async () => {
    setExportingDrive(true);
    try {
      const res = await googleIntegrationApi.exportDrive({
        title: exportDocTitle.trim() || 'Catatan ORVYN',
        content: exportDocContent,
        type: 'doc',
      });
      const data = res.data?.data;
      if (data?.google_docs_create_url) {
        toast.success(res.data?.message ?? 'Membuka Google Docs...');
        window.open(data.google_docs_create_url, '_blank', 'noopener,noreferrer');
      }
    } catch (err) {
      toast.error(getApiErrorMessage(err, 'Gagal mengekspor ke Google Drive'));
    } finally {
      setExportingDrive(false);
    }
  };

  const handleSyncTasks = async () => {
    setSyncingTasks(true);
    try {
      const res = await googleIntegrationApi.syncTasks();
      toast.success(res.data?.message ?? 'Tugas berhasil disinkronkan ke Google Tasks!');
      void fetchStatus();
    } catch (err) {
      toast.error(getApiErrorMessage(err, 'Gagal menyinkronkan Google Tasks'));
    } finally {
      setSyncingTasks(false);
    }
  };

  if (compact) {
    return (
      <div className="reactive-card rounded-2xl border border-white/10 bg-white/[0.035] p-4 shadow-xl backdrop-blur-xl">
        <div className="flex items-center justify-between">
          <div className="flex items-center gap-2">
            <GoogleIcon className="h-4 w-4" />
            <span className="text-xs font-bold text-white">Google Workspace</span>
          </div>
          <span className="inline-flex items-center gap-1 rounded-full bg-emerald-500/10 px-2 py-0.5 text-[9px] font-bold text-emerald-300">
            <span className="h-1.5 w-1.5 rounded-full bg-emerald-400" /> Terkoneksi
          </span>
        </div>
        <div className="mt-3 grid grid-cols-2 gap-2">
          <button
            type="button"
            onClick={() => void handleSyncCalendar()}
            disabled={syncingCalendar}
            className="focus-ring flex items-center justify-center gap-1.5 rounded-xl border border-white/5 bg-slate-950/40 py-2 text-[11px] font-semibold text-slate-300 transition hover:bg-white/[0.08] hover:text-white"
          >
            {syncingCalendar ? <Loader2 className="h-3 w-3 animate-spin" /> : <Calendar className="h-3 w-3 text-blue-400" />}
            Sync Calendar
          </button>
          <button
            type="button"
            onClick={() => void handleSyncTasks()}
            disabled={syncingTasks}
            className="focus-ring flex items-center justify-center gap-1.5 rounded-xl border border-white/5 bg-slate-950/40 py-2 text-[11px] font-semibold text-slate-300 transition hover:bg-white/[0.08] hover:text-white"
          >
            {syncingTasks ? <Loader2 className="h-3 w-3 animate-spin" /> : <ListTodo className="h-3 w-3 text-cyan-400" />}
            Sync Tasks
          </button>
        </div>
      </div>
    );
  }

  return (
    <div className="reactive-card overflow-hidden rounded-2xl border border-white/10 bg-white/[0.035] shadow-2xl backdrop-blur-xl">
      {/* Header bar */}
      <div className="flex flex-col gap-3 border-b border-white/10 p-5 sm:flex-row sm:items-center sm:justify-between">
        <div className="flex items-center gap-3">
          <div className="flex h-10 w-10 items-center justify-center rounded-xl border border-white/10 bg-white/[0.05] shadow-inner">
            <GoogleIcon className="h-5 w-5" />
          </div>
          <div>
            <div className="flex items-center gap-2">
              <h3 className="text-base font-bold text-white">Google Workspace</h3>
              <span className="inline-flex items-center gap-1 rounded-full border border-emerald-400/20 bg-emerald-400/10 px-2.5 py-0.5 text-[10px] font-bold uppercase tracking-wider text-emerald-300">
                <span className="h-1.5 w-1.5 rounded-full bg-emerald-400 animate-pulse" /> Terhubung
              </span>
            </div>
            <p className="text-xs text-slate-400">
              {status?.google_email ?? 'Akun Google aktif'} • Sinkronisasi dua arah instan
            </p>
          </div>
        </div>

        <div className="flex items-center gap-2">
          <button
            type="button"
            onClick={() => void fetchStatus()}
            disabled={loading}
            className="focus-ring inline-flex items-center gap-1.5 rounded-xl border border-white/10 bg-white/[0.04] px-3 py-1.5 text-xs font-semibold text-slate-300 transition hover:bg-white/[0.08] hover:text-white"
            title="Muat ulang status"
          >
            <RefreshCw className={`h-3.5 w-3.5 ${loading ? 'animate-spin' : ''}`} />
            <span className="hidden sm:inline">Perbarui</span>
          </button>
        </div>
      </div>

      {/* Tabs navigation */}
      <div className="grid grid-cols-4 border-b border-white/10 bg-slate-950/40 p-1.5 text-xs font-semibold">
        <button
          type="button"
          onClick={() => setActiveTab('calendar')}
          className={`focus-ring flex items-center justify-center gap-1.5 rounded-xl py-2.5 transition ${
            activeTab === 'calendar'
              ? 'bg-white/10 text-white shadow-sm'
              : 'text-slate-400 hover:text-slate-200 hover:bg-white/[0.04]'
          }`}
        >
          <Calendar className="h-3.5 w-3.5 text-blue-400" />
          <span className="hidden sm:inline">Calendar</span>
        </button>

        <button
          type="button"
          onClick={() => setActiveTab('meet')}
          className={`focus-ring flex items-center justify-center gap-1.5 rounded-xl py-2.5 transition ${
            activeTab === 'meet'
              ? 'bg-white/10 text-white shadow-sm'
              : 'text-slate-400 hover:text-slate-200 hover:bg-white/[0.04]'
          }`}
        >
          <Video className="h-3.5 w-3.5 text-emerald-400" />
          <span className="hidden sm:inline">Meet</span>
        </button>

        <button
          type="button"
          onClick={() => setActiveTab('drive')}
          className={`focus-ring flex items-center justify-center gap-1.5 rounded-xl py-2.5 transition ${
            activeTab === 'drive'
              ? 'bg-white/10 text-white shadow-sm'
              : 'text-slate-400 hover:text-slate-200 hover:bg-white/[0.04]'
          }`}
        >
          <FileText className="h-3.5 w-3.5 text-amber-400" />
          <span className="hidden sm:inline">Drive & Docs</span>
        </button>

        <button
          type="button"
          onClick={() => setActiveTab('tasks')}
          className={`focus-ring flex items-center justify-center gap-1.5 rounded-xl py-2.5 transition ${
            activeTab === 'tasks'
              ? 'bg-white/10 text-white shadow-sm'
              : 'text-slate-400 hover:text-slate-200 hover:bg-white/[0.04]'
          }`}
        >
          <ListTodo className="h-3.5 w-3.5 text-cyan-400" />
          <span className="hidden sm:inline">Tasks</span>
        </button>
      </div>

      {/* Tab contents */}
      <div className="p-5">
        {/* TAB 1: CALENDAR */}
        {activeTab === 'calendar' && (
          <div className="space-y-4">
            <div className="flex flex-col gap-2 sm:flex-row sm:items-center sm:justify-between">
              <div>
                <h4 className="text-sm font-bold text-white">Sinkronisasi Jadwal Kuliah & Blok Fokus</h4>
                <p className="text-xs text-slate-400">
                  {status?.services.calendar.synced_items_count ?? 0} item jadwal siap disinkronkan ke kalender utamamu.
                </p>
              </div>
              <div className="flex flex-wrap items-center gap-2">
                <a
                  href="https://calendar.google.com"
                  target="_blank"
                  rel="noreferrer"
                  className="focus-ring inline-flex items-center gap-1.5 rounded-xl border border-white/10 bg-white/[0.04] px-3 py-2 text-xs font-semibold text-slate-300 transition hover:bg-white/[0.08] hover:text-white"
                >
                  Buka Calendar <ExternalLink className="h-3 w-3" />
                </a>
                <button
                  type="button"
                  onClick={() => void handleSyncCalendar()}
                  disabled={syncingCalendar}
                  className="focus-ring inline-flex items-center gap-2 rounded-xl bg-blue-600 px-4 py-2 text-xs font-bold text-white shadow-lg shadow-blue-500/20 transition hover:bg-blue-500 disabled:opacity-50"
                >
                  {syncingCalendar ? <Loader2 className="h-3.5 w-3.5 animate-spin" /> : <RefreshCw className="h-3.5 w-3.5" />}
                  {syncingCalendar ? 'Menyinkronkan...' : 'Sinkronkan Sekarang'}
                </button>
              </div>
            </div>

            <div className="rounded-xl border border-white/5 bg-slate-950/40 p-4">
              <div className="flex items-center gap-2 text-xs font-semibold text-slate-300">
                <CheckCircle2 className="h-4 w-4 text-emerald-400" />
                <span>Format URL Google Calendar Template resmi (1-klik langsung masuk ke kalender akunmu)</span>
              </div>
              <p className="mt-1 text-[11px] text-slate-500">
                Mencakup jadwal kelas mingguan, ruangan kuliah, nama dosen, dan blok waktu fokus belajar ORVYN.
              </p>
            </div>
          </div>
        )}

        {/* TAB 2: MEET */}
        {activeTab === 'meet' && (
          <div className="space-y-4">
            <div className="flex flex-col gap-2 sm:flex-row sm:items-center sm:justify-between">
              <div>
                <h4 className="text-sm font-bold text-white">Generator Ruang Google Meet</h4>
                <p className="text-xs text-slate-400">
                  Buat sesi belajar bareng atau diskusi tugas kelompok dalam hitungan detik.
                </p>
              </div>
              <a
                href="https://meet.google.com/new"
                target="_blank"
                rel="noreferrer"
                className="focus-ring inline-flex items-center gap-1.5 rounded-xl border border-white/10 bg-white/[0.04] px-3 py-2 text-xs font-semibold text-slate-300 transition hover:bg-white/[0.08] hover:text-white"
              >
                Meet Instan <ExternalLink className="h-3 w-3" />
              </a>
            </div>

            <div className="grid grid-cols-1 gap-3 sm:grid-cols-3">
              <div className="sm:col-span-2">
                <label className="mb-1 block text-[11px] font-semibold text-slate-400">Topik / Judul Sesi</label>
                <input
                  type="text"
                  value={meetTitle}
                  onChange={(e) => setMeetTitle(e.target.value)}
                  placeholder="Contoh: Belajar Bareng Kalkulus / Praktikum"
                  className="focus-ring w-full rounded-xl border border-white/10 bg-slate-950/60 px-3.5 py-2 text-xs font-medium text-white placeholder-slate-600"
                />
              </div>
              <div>
                <label className="mb-1 block text-[11px] font-semibold text-slate-400">Durasi</label>
                <select
                  value={meetDuration}
                  onChange={(e) => setMeetDuration(Number(e.target.value))}
                  className="focus-ring w-full rounded-xl border border-white/10 bg-slate-950/60 px-3 py-2 text-xs font-medium text-white"
                >
                  <option value={30}>30 Menit</option>
                  <option value={45}>45 Menit</option>
                  <option value={60}>1 Jam</option>
                  <option value={90}>1.5 Jam</option>
                  <option value={120}>2 Jam</option>
                </select>
              </div>
            </div>

            <div className="flex justify-end">
              <button
                type="button"
                onClick={() => void handleCreateMeet()}
                disabled={creatingMeet}
                className="focus-ring inline-flex items-center gap-2 rounded-xl bg-emerald-600 px-4 py-2 text-xs font-bold text-white shadow-lg shadow-emerald-500/20 transition hover:bg-emerald-500 disabled:opacity-50"
              >
                {creatingMeet ? <Loader2 className="h-3.5 w-3.5 animate-spin" /> : <Plus className="h-3.5 w-3.5" />}
                {creatingMeet ? 'Menyiapkan...' : 'Buat Ruang Meet'}
              </button>
            </div>

            {lastMeetResult && (
              <div className="rounded-xl border border-emerald-500/20 bg-emerald-500/10 p-4">
                <div className="flex flex-col gap-3 sm:flex-row sm:items-center sm:justify-between">
                  <div>
                    <span className="text-[10px] font-bold uppercase tracking-wider text-emerald-300">
                      Ruang Meet Siap
                    </span>
                    <p className="mt-0.5 text-xs font-semibold text-white">{lastMeetResult.meet_url}</p>
                  </div>
                  <div className="flex items-center gap-2">
                    <button
                      type="button"
                      onClick={handleCopyMeet}
                      className="focus-ring inline-flex items-center gap-1.5 rounded-lg border border-white/10 bg-white/10 px-3 py-1.5 text-xs font-semibold text-white hover:bg-white/20"
                    >
                      {copiedMeet ? <Check className="h-3.5 w-3.5 text-emerald-300" /> : <Copy className="h-3.5 w-3.5" />}
                      {copiedMeet ? 'Tersalin' : 'Salin Tautan'}
                    </button>
                    <a
                      href={lastMeetResult.meet_url}
                      target="_blank"
                      rel="noreferrer"
                      className="focus-ring inline-flex items-center gap-1.5 rounded-lg bg-white px-3 py-1.5 text-xs font-bold text-slate-900 hover:bg-slate-100"
                    >
                      Gabung <ExternalLink className="h-3 w-3" />
                    </a>
                  </div>
                </div>
              </div>
            )}
          </div>
        )}

        {/* TAB 3: DRIVE & DOCS */}
        {activeTab === 'drive' && (
          <div className="space-y-4">
            <div className="flex flex-col gap-2 sm:flex-row sm:items-center sm:justify-between">
              <div>
                <h4 className="text-sm font-bold text-white">Ekspor ke Google Drive & Docs</h4>
                <p className="text-xs text-slate-400">
                  Simpan ringkasan AI, catatan kuliah, atau rencana belajar langsung ke Google Drive.
                </p>
              </div>
              <a
                href="https://drive.google.com"
                target="_blank"
                rel="noreferrer"
                className="focus-ring inline-flex items-center gap-1.5 rounded-xl border border-white/10 bg-white/[0.04] px-3 py-2 text-xs font-semibold text-slate-300 transition hover:bg-white/[0.08] hover:text-white"
              >
                Buka Google Drive <ExternalLink className="h-3 w-3" />
              </a>
            </div>

            <div>
              <label className="mb-1 block text-[11px] font-semibold text-slate-400">Judul Dokumen</label>
              <input
                type="text"
                value={exportDocTitle}
                onChange={(e) => setExportDocTitle(e.target.value)}
                className="focus-ring w-full rounded-xl border border-white/10 bg-slate-950/60 px-3.5 py-2 text-xs font-medium text-white"
              />
            </div>

            <div className="flex justify-end">
              <button
                type="button"
                onClick={() => void handleExportDrive()}
                disabled={exportingDrive}
                className="focus-ring inline-flex items-center gap-2 rounded-xl bg-amber-600 px-4 py-2 text-xs font-bold text-white shadow-lg shadow-amber-500/20 transition hover:bg-amber-500 disabled:opacity-50"
              >
                {exportingDrive ? <Loader2 className="h-3.5 w-3.5 animate-spin" /> : <FileText className="h-3.5 w-3.5" />}
                {exportingDrive ? 'Mengekspor...' : 'Buka & Buat Dokumen di Google Docs'}
              </button>
            </div>
          </div>
        )}

        {/* TAB 4: TASKS */}
        {activeTab === 'tasks' && (
          <div className="space-y-4">
            <div className="flex flex-col gap-2 sm:flex-row sm:items-center sm:justify-between">
              <div>
                <h4 className="text-sm font-bold text-white">Sinkronisasi Google Tasks</h4>
                <p className="text-xs text-slate-400">
                  {status?.services.tasks.synced_items_count ?? 0} to-do aktif siap dipetakan ke Google Tasks.
                </p>
              </div>
              <div className="flex flex-wrap items-center gap-2">
                <a
                  href="https://tasks.google.com"
                  target="_blank"
                  rel="noreferrer"
                  className="focus-ring inline-flex items-center gap-1.5 rounded-xl border border-white/10 bg-white/[0.04] px-3 py-2 text-xs font-semibold text-slate-300 transition hover:bg-white/[0.08] hover:text-white"
                >
                  Buka Google Tasks <ExternalLink className="h-3 w-3" />
                </a>
                <button
                  type="button"
                  onClick={() => void handleSyncTasks()}
                  disabled={syncingTasks}
                  className="focus-ring inline-flex items-center gap-2 rounded-xl bg-cyan-600 px-4 py-2 text-xs font-bold text-white shadow-lg shadow-cyan-500/20 transition hover:bg-cyan-500 disabled:opacity-50"
                >
                  {syncingTasks ? <Loader2 className="h-3.5 w-3.5 animate-spin" /> : <RefreshCw className="h-3.5 w-3.5" />}
                  {syncingTasks ? 'Menyinkronkan...' : 'Sinkronkan To-Do List'}
                </button>
              </div>
            </div>

            <div className="rounded-xl border border-white/5 bg-slate-950/40 p-4">
              <div className="flex items-center gap-2 text-xs font-semibold text-slate-300">
                <CheckCircle2 className="h-4 w-4 text-cyan-400" />
                <span>Terintegrasi langsung dengan aplikasi Google Tasks di Android & iOS</span>
              </div>
              <p className="mt-1 text-[11px] text-slate-500">
                Semua checklist tugas dengan deadline dan target kebiasaan harian akan otomatis tersinkronisasi.
              </p>
            </div>
          </div>
        )}
      </div>
    </div>
  );
}
