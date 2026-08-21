import { useCallback, useEffect, useMemo, useState } from 'react';
import {
  BellRing,
  Bot,
  BrainCircuit,
  CalendarClock,
  Check,
  CheckCircle2,
  Clock3,
  Loader2,
  MessageCircleMore,
  RefreshCw,
  Send,
  ShieldCheck,
  Smartphone,
  Sparkles,
  WalletCards,
} from 'lucide-react';
import { toast } from 'sonner';
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogHeader,
  DialogTitle,
} from '@/components/ui/dialog';
import { getApiErrorMessage, whatsappApi } from '@/lib/api';
import { cn } from '@/lib/utils';

interface WhatsAppSettingsDialogProps {
  open: boolean;
  onOpenChange: (open: boolean) => void;
}

interface WhatsAppSettings {
  phone_number: string | null;
  enabled: boolean;
  timezone: string;
  daily_briefing_time: string;
  reminder_lead_minutes: number;
  reminder_schedule: ReminderSchedule;
  features: Record<string, boolean>;
  consented: boolean;
  verified: boolean;
  verification_expires_at: string | null;
  last_inbound_at: string | null;
  last_outbound_at: string | null;
}

interface ReminderSchedule {
  daily_briefing_time: string;
  deadline_lead_minutes: number[];
  progress_checkin_time: string;
  burnout_checkin_time: string;
  habit_checkin_time: string;
  weekly_review_day: number;
  weekly_review_time: string;
}

interface IntegrationState {
  settings: WhatsAppSettings;
  service: {
    online: boolean;
    connected: boolean;
    status: string;
    qr: string | null;
    phone?: string | null;
  };
  ai: {
    provider: string;
    online: boolean;
    model: string;
  };
}

const FEATURES = [
  { key: 'daily_briefing', label: 'Briefing harian', description: 'Prioritas, deadline, dan jadwal setiap pagi.', icon: Sparkles },
  { key: 'deadline_reminders', label: 'Reminder deadline', description: 'Peringatan sebelum laporan atau tugas jatuh tempo.', icon: BellRing },
  { key: 'task_capture', label: 'Input tugas via chat', description: 'Buat tugas baru memakai bahasa natural.', icon: MessageCircleMore },
  { key: 'quick_actions', label: 'Quick actions', description: 'Selesai, tunda, mulai, dan cek prioritas.', icon: CheckCircle2 },
  { key: 'campus_updates', label: 'Update kampus', description: 'Perubahan kelas, ruangan, atau jadwal.', icon: CalendarClock },
  { key: 'progress_checkins', label: 'Check-in progres', description: 'Dorongan ringan untuk tugas yang sedang berjalan.', icon: Bot },
  { key: 'burnout_checkins', label: 'Burnout guard', description: 'Check-in ketika beban mulai terlalu padat.', icon: BrainCircuit },
  { key: 'habit_health', label: 'Habit & kesehatan', description: 'Catat habit, tidur, hidrasi, dan screen time.', icon: ShieldCheck },
  { key: 'finance_logging', label: 'Catat pengeluaran', description: 'Log transaksi singkat langsung dari chat.', icon: WalletCards },
  { key: 'weekly_review', label: 'Review mingguan', description: 'Rekap tugas, fokus, dan pekerjaan tertunda.', icon: RefreshCw },
] as const;

const SCHEDULED_FEATURE_KEYS = new Set<string>([
  'daily_briefing',
  'deadline_reminders',
  'progress_checkins',
  'burnout_checkins',
  'habit_health',
  'weekly_review',
]);
const CHAT_FEATURES = FEATURES.filter(({ key }) => !SCHEDULED_FEATURE_KEYS.has(key));

const DEFAULT_REMINDER_SCHEDULE: ReminderSchedule = {
  daily_briefing_time: '07:00',
  deadline_lead_minutes: [180],
  progress_checkin_time: '14:00',
  burnout_checkin_time: '16:00',
  habit_checkin_time: '18:00',
  weekly_review_day: 7,
  weekly_review_time: '19:00',
};

const DEADLINE_OPTIONS = [
  { value: 10080, label: '7 hari' },
  { value: 2880, label: '2 hari' },
  { value: 1440, label: '1 hari' },
  { value: 720, label: '12 jam' },
  { value: 360, label: '6 jam' },
  { value: 180, label: '3 jam' },
  { value: 60, label: '1 jam' },
  { value: 30, label: '30 menit' },
] as const;

const WEEKDAYS = [
  { value: 1, label: 'Senin' },
  { value: 2, label: 'Selasa' },
  { value: 3, label: 'Rabu' },
  { value: 4, label: 'Kamis' },
  { value: 5, label: 'Jumat' },
  { value: 6, label: 'Sabtu' },
  { value: 7, label: 'Minggu' },
] as const;

const EMPTY_SETTINGS: WhatsAppSettings = {
  phone_number: null,
  enabled: false,
  timezone: 'Asia/Jakarta',
  daily_briefing_time: '07:00',
  reminder_lead_minutes: 180,
  reminder_schedule: DEFAULT_REMINDER_SCHEDULE,
  features: Object.fromEntries(FEATURES.map(({ key }) => [key, true])),
  consented: false,
  verified: false,
  verification_expires_at: null,
  last_inbound_at: null,
  last_outbound_at: null,
};

function normalizeSettings(incoming: Partial<WhatsAppSettings>): WhatsAppSettings {
  const incomingSchedule = incoming.reminder_schedule ?? DEFAULT_REMINDER_SCHEDULE;
  return {
    ...EMPTY_SETTINGS,
    ...incoming,
    verified: Boolean(incoming.verified),
    verification_expires_at: incoming.verification_expires_at ?? null,
    reminder_schedule: {
      ...DEFAULT_REMINDER_SCHEDULE,
      ...incomingSchedule,
      deadline_lead_minutes: [...(incomingSchedule.deadline_lead_minutes ?? [incoming.reminder_lead_minutes ?? 180])]
        .sort((first, second) => second - first),
    },
    features: { ...EMPTY_SETTINGS.features, ...(incoming.features ?? {}) },
  };
}

export function WhatsAppSettingsDialog({ open, onOpenChange }: WhatsAppSettingsDialogProps) {
  const [data, setData] = useState<IntegrationState | null>(null);
  const [settings, setSettings] = useState<WhatsAppSettings>(EMPTY_SETTINGS);
  const [consent, setConsent] = useState(false);
  const [loading, setLoading] = useState(false);
  const [saving, setSaving] = useState(false);
  const [connecting, setConnecting] = useState(false);
  const [testing, setTesting] = useState(false);
  const [verificationCode, setVerificationCode] = useState('');
  const [verificationRequested, setVerificationRequested] = useState(false);
  const [requestingVerification, setRequestingVerification] = useState(false);
  const [confirmingVerification, setConfirmingVerification] = useState(false);

  const load = useCallback(async (quiet = false) => {
    if (!quiet) setLoading(true);
    try {
      const response = await whatsappApi.getSettings();
      const next = response.data.data as IntegrationState;
      if (quiet) {
        setData((current) => current ? { ...current, service: next.service, ai: next.ai } : next);
      } else {
        setData(next);
        setSettings(normalizeSettings(next.settings));
        setConsent(next.settings.consented);
        setVerificationCode('');
        setVerificationRequested(false);
      }
    } catch (error) {
      if (!quiet) toast.error(getApiErrorMessage(error, 'Gagal memuat pengaturan WhatsApp.'));
    } finally {
      if (!quiet) setLoading(false);
    }
  }, []);

  useEffect(() => {
    if (!open) return;
    const timer = window.setTimeout(() => void load(), 0);
    return () => window.clearTimeout(timer);
  }, [load, open]);

  useEffect(() => {
    if (!open || data?.service.connected) return;
    const timer = window.setInterval(() => void load(true), 3_500);
    return () => window.clearInterval(timer);
  }, [data?.service.connected, load, open]);

  const statusLabel = useMemo(() => {
    if (!data?.service.online) return 'Service offline';
    if (data.service.connected) return 'WhatsApp terhubung';
    if (data.service.status === 'qr') return 'Menunggu scan QR';
    return 'Belum terhubung';
  }, [data]);

  const toggleFeature = (key: string) => {
    setSettings((current) => ({ ...current, features: { ...current.features, [key]: !current.features[key] } }));
  };

  const updateSchedule = <Key extends keyof ReminderSchedule,>(key: Key, value: ReminderSchedule[Key]) => {
    setSettings((current) => ({
      ...current,
      reminder_schedule: { ...current.reminder_schedule, [key]: value },
    }));
  };

  const toggleDeadlineLead = (minutes: number) => {
    const current = settings.reminder_schedule.deadline_lead_minutes;
    if (current.includes(minutes) && current.length === 1) {
      toast.info('Pilih minimal satu tahap reminder deadline.');
      return;
    }
    const next = current.includes(minutes)
      ? current.filter((value) => value !== minutes)
      : [...current, minutes];
    updateSchedule('deadline_lead_minutes', next.sort((first, second) => second - first));
  };

  const updatePhoneNumber = (value: string) => {
    setVerificationCode('');
    setVerificationRequested(false);
    setSettings((current) => {
      const changed = value !== (current.phone_number ?? '');
      return {
        ...current,
        phone_number: value,
        verified: changed ? false : current.verified,
        verification_expires_at: changed ? null : current.verification_expires_at,
        enabled: changed ? false : current.enabled,
      };
    });
  };

  const requestVerification = async () => {
    const phone = settings.phone_number?.trim() || '';
    if (!phone || phone.length < 8) {
      toast.error('Masukkan nomor WhatsApp yang valid terlebih dahulu.');
      return;
    }

    setRequestingVerification(true);
    try {
      await whatsappApi.requestVerification({ phone_number: phone });
      setVerificationRequested(true);
      setVerificationCode('');
      toast.success('Kode verifikasi 6 digit telah dikirim ke WhatsApp kamu.');
    } catch (error) {
      toast.error(getApiErrorMessage(error, 'Gagal mengirim kode verifikasi. Pastikan WhatsApp terhubung.'));
    } finally {
      setRequestingVerification(false);
    }
  };

  const confirmVerification = async () => {
    if (!/^\d{6}$/.test(verificationCode)) {
      toast.error('Masukkan 6 digit kode verifikasi.');
      return;
    }

    setConfirmingVerification(true);
    try {
      const response = await whatsappApi.confirmVerification({ code: verificationCode });
      const updatedSettings = normalizeSettings(response.data.data.settings as WhatsAppSettings);
      setSettings(updatedSettings);
      setVerificationRequested(false);
      setVerificationCode('');
      toast.success('Nomor WhatsApp berhasil diverifikasi!');
    } catch (error) {
      toast.error(getApiErrorMessage(error, 'Kode verifikasi salah atau kedaluwarsa.'));
    } finally {
      setConfirmingVerification(false);
    }
  };

  const toggleEnabled = () => {
    if (!settings.enabled && !settings.verified) {
      toast.error('Verifikasi nomor WhatsApp terlebih dahulu sebelum mengaktifkan.');
      return;
    }
    setSettings((current) => ({ ...current, enabled: !current.enabled }));
  };

  const save = async () => {
    if (settings.enabled && !settings.verified) {
      toast.error('Verifikasi nomor WhatsApp terlebih dahulu sebelum mengaktifkan notifikasi.');
      return;
    }
    if (settings.enabled && !consent) {
      toast.error('Berikan persetujuan sebelum mengaktifkan pesan WhatsApp.');
      return;
    }
    setSaving(true);
    try {
      const response = await whatsappApi.updateSettings({
        phone_number: settings.phone_number?.trim() || null,
        enabled: settings.enabled,
        timezone: settings.timezone,
        daily_briefing_time: settings.reminder_schedule.daily_briefing_time,
        reminder_lead_minutes: Math.max(...settings.reminder_schedule.deadline_lead_minutes),
        reminder_schedule: settings.reminder_schedule,
        features: settings.features,
        consent: !settings.consented && consent ? true : undefined,
      });
      const nextSettings = normalizeSettings(response.data.data as WhatsAppSettings);
      setSettings(nextSettings);
      setConsent(nextSettings.consented);
      setData((current) => current ? { ...current, settings: nextSettings } : current);
      toast.success('Preferensi WhatsApp disimpan.');
    } catch (error) {
      toast.error(getApiErrorMessage(error, 'Gagal menyimpan preferensi WhatsApp.'));
    } finally {
      setSaving(false);
    }
  };

  const connect = async () => {
    setConnecting(true);
    try {
      await whatsappApi.connect();
      await load(true);
      toast.success('Sesi dimulai. Scan QR saat muncul.');
    } catch (error) {
      toast.error(getApiErrorMessage(error, 'Service WhatsApp belum dapat dihubungi.'));
    } finally {
      setConnecting(false);
    }
  };

  const sendTest = async () => {
    setTesting(true);
    try {
      await whatsappApi.sendTest();
      toast.success('Pesan uji masuk antrean.');
    } catch (error) {
      toast.error(getApiErrorMessage(error, 'Pesan uji gagal dikirim.'));
    } finally {
      setTesting(false);
    }
  };

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="max-h-[92vh] w-[calc(100vw-1.5rem)] max-w-4xl overflow-y-auto border border-white/15 bg-slate-950/95 p-0 text-white shadow-2xl backdrop-blur-2xl">
        <div className="border-b border-white/10 bg-[radial-gradient(circle_at_top_right,rgba(34,211,238,0.13),transparent_38%)] px-5 py-5 sm:px-7">
          <DialogHeader>
            <div className="mb-3 flex h-11 w-11 items-center justify-center rounded-2xl border border-emerald-400/25 bg-emerald-400/10 text-emerald-300">
              <MessageCircleMore className="h-5 w-5" />
            </div>
            <DialogTitle className="text-xl font-bold tracking-tight text-white">WhatsApp Assistant</DialogTitle>
            <DialogDescription className="max-w-2xl text-sm leading-relaxed text-slate-400">
              Jadikan WhatsApp sebagai inbox, reminder, dan remote control ORVYN. Semua aksi tetap mengikuti preferensi dan consent kamu.
            </DialogDescription>
          </DialogHeader>
        </div>

        {loading && !data ? (
          <div className="flex min-h-72 items-center justify-center"><Loader2 className="h-6 w-6 animate-spin text-cyan-300" /></div>
        ) : (
          <div className="space-y-6 px-5 py-6 sm:px-7">
            <div className="grid gap-3 sm:grid-cols-2">
              <StatusCard
                icon={Smartphone}
                title={statusLabel}
                detail={data?.service.connected && data.service.phone ? `Sesi +${data.service.phone}` : 'Baileys sidecar · koneksi terenkripsi'}
                active={Boolean(data?.service.connected)}
              />
              <StatusCard
                icon={BrainCircuit}
                title={`${data?.ai.provider ?? 'Ollama'} · ${data?.ai.online ? 'online' : 'fallback aktif'}`}
                detail={data?.ai.model ?? 'Model lokal belum terdeteksi'}
                active={Boolean(data?.ai.online)}
              />
            </div>

            {data?.service.qr && !data.service.connected && (
              <div className="flex flex-col items-center gap-4 rounded-2xl border border-cyan-400/20 bg-cyan-400/[0.06] p-5 text-center sm:flex-row sm:text-left">
                <img src={data.service.qr} alt="QR pairing WhatsApp" className="h-44 w-44 rounded-xl bg-white p-2" />
                <div>
                  <p className="text-sm font-bold text-white">Scan dari WhatsApp di ponsel</p>
                  <p className="mt-1 max-w-sm text-xs leading-relaxed text-slate-400">Buka Perangkat tertaut → Tautkan perangkat. QR diperbarui otomatis dan tidak disimpan oleh frontend.</p>
                </div>
              </div>
            )}

            <section className="grid gap-4 rounded-2xl border border-white/10 bg-white/[0.035] p-4 sm:grid-cols-2 sm:p-5">
              <Field
                label="Nomor WhatsApp"
                hint={settings.verified ? 'Nomor sudah terverifikasi dan siap menerima pesan.' : 'Verifikasi nomor dengan kode OTP via WhatsApp.'}
                badge={
                  settings.verified ? (
                    <span className="inline-flex items-center gap-1 rounded-md border border-emerald-400/30 bg-emerald-400/10 px-2 py-0.5 text-[10px] font-bold text-emerald-300">
                      <CheckCircle2 className="h-3 w-3" /> Terverifikasi
                    </span>
                  ) : settings.phone_number?.trim() ? (
                    <span className="inline-flex items-center gap-1 rounded-md border border-amber-400/30 bg-amber-400/10 px-2 py-0.5 text-[10px] font-bold text-amber-300">
                      Belum terverifikasi
                    </span>
                  ) : null
                }
              >
                <div className="space-y-2">
                  <input
                    value={settings.phone_number ?? ''}
                    onChange={(event) => updatePhoneNumber(event.target.value)}
                    placeholder="0812 3456 7890"
                    className="focus-ring h-10 w-full rounded-xl border border-white/10 bg-black/20 px-3 text-sm text-white outline-none placeholder:text-slate-600"
                  />

                  {!settings.verified && settings.phone_number?.trim() && (
                    <div className="space-y-2 pt-1">
                      <div className="flex flex-wrap items-center gap-2">
                        <button
                          type="button"
                          onClick={requestVerification}
                          disabled={requestingVerification || !data?.service.connected}
                          className="focus-ring inline-flex h-8 items-center justify-center gap-1.5 rounded-lg border border-cyan-400/30 bg-cyan-400/10 px-3 text-xs font-bold text-cyan-300 transition hover:bg-cyan-400/20 disabled:opacity-40"
                        >
                          {requestingVerification ? <Loader2 className="h-3.5 w-3.5 animate-spin" /> : <Send className="h-3.5 w-3.5" />}
                          {verificationRequested ? 'Kirim ulang OTP' : 'Kirim kode verifikasi OTP'}
                        </button>
                        {!data?.service.connected && (
                          <span className="text-[10px] text-amber-400/80">Hubungkan WhatsApp terlebih dahulu</span>
                        )}
                      </div>

                      {verificationRequested && (
                        <div className="flex items-center gap-2 rounded-xl border border-white/10 bg-black/30 p-2">
                          <input
                            type="text"
                            maxLength={6}
                            value={verificationCode}
                            onChange={(event) => setVerificationCode(event.target.value.replace(/\D/g, ''))}
                            placeholder="6 digit kode"
                            className="focus-ring h-8 w-28 rounded-lg border border-white/15 bg-slate-900 px-2 text-center font-mono text-xs tracking-widest text-white outline-none placeholder:font-sans placeholder:text-slate-600"
                          />
                          <button
                            type="button"
                            onClick={confirmVerification}
                            disabled={confirmingVerification || verificationCode.length !== 6}
                            className="focus-ring inline-flex h-8 items-center justify-center gap-1.5 rounded-lg bg-emerald-400 px-3 text-xs font-bold text-slate-950 transition hover:bg-emerald-300 disabled:opacity-40"
                          >
                            {confirmingVerification ? <Loader2 className="h-3.5 w-3.5 animate-spin" /> : <Check className="h-3.5 w-3.5" />}
                            Konfirmasi
                          </button>
                        </div>
                      )}
                    </div>
                  )}
                </div>
              </Field>

              <Field label="Timezone" hint="Menentukan waktu briefing dan deadline.">
                <select
                  value={settings.timezone}
                  onChange={(event) => setSettings((current) => ({ ...current, timezone: event.target.value }))}
                  className="focus-ring h-10 w-full rounded-xl border border-white/10 bg-slate-950 px-3 text-sm text-white outline-none"
                >
                  <option value="Asia/Jakarta">WIB · Asia/Jakarta</option>
                  <option value="Asia/Makassar">WITA · Asia/Makassar</option>
                  <option value="Asia/Jayapura">WIT · Asia/Jayapura</option>
                </select>
              </Field>
            </section>

            <section className="space-y-3">
              <div className="mb-3">
                <h3 className="text-sm font-bold text-white">Jadwal reminder</h3>
                <p className="mt-1 text-xs text-slate-500">Pilih apa yang perlu diingatkan dan atur waktunya sesuai timezone di atas.</p>
              </div>
              <div className="grid gap-2 sm:grid-cols-2">
                <ReminderScheduleCard
                  icon={Sparkles}
                  title="Briefing harian"
                  description="Ringkasan tugas, deadline, dan jadwal hari ini."
                  active={Boolean(settings.features.daily_briefing)}
                  onToggle={() => toggleFeature('daily_briefing')}
                >
                  <TimeInput label="Jam briefing harian" value={settings.reminder_schedule.daily_briefing_time} onChange={(value) => updateSchedule('daily_briefing_time', value)} />
                </ReminderScheduleCard>

                <ReminderScheduleCard
                  icon={Bot}
                  title="Check-in progres"
                  description="Menanyakan progres tugas yang sedang dikerjakan."
                  active={Boolean(settings.features.progress_checkins)}
                  onToggle={() => toggleFeature('progress_checkins')}
                >
                  <TimeInput label="Jam check-in progres" value={settings.reminder_schedule.progress_checkin_time} onChange={(value) => updateSchedule('progress_checkin_time', value)} />
                </ReminderScheduleCard>

                <ReminderScheduleCard
                  icon={BrainCircuit}
                  title="Burnout guard"
                  description="Dikirim hanya saat beban aktif atau tugas terlambat tinggi."
                  active={Boolean(settings.features.burnout_checkins)}
                  onToggle={() => toggleFeature('burnout_checkins')}
                >
                  <TimeInput label="Jam pemeriksaan burnout" value={settings.reminder_schedule.burnout_checkin_time} onChange={(value) => updateSchedule('burnout_checkin_time', value)} />
                </ReminderScheduleCard>

                <ReminderScheduleCard
                  icon={ShieldCheck}
                  title="Habit & kesehatan"
                  description="Mengingatkan habit yang belum dicatat pada hari itu."
                  active={Boolean(settings.features.habit_health)}
                  onToggle={() => toggleFeature('habit_health')}
                >
                  <TimeInput label="Jam check-in habit" value={settings.reminder_schedule.habit_checkin_time} onChange={(value) => updateSchedule('habit_checkin_time', value)} />
                </ReminderScheduleCard>

                <ReminderScheduleCard
                  icon={RefreshCw}
                  title="Review mingguan"
                  description="Rekap tugas selesai, waktu fokus, dan pekerjaan terlambat."
                  active={Boolean(settings.features.weekly_review)}
                  onToggle={() => toggleFeature('weekly_review')}
                >
                  <div className="grid grid-cols-[1fr_auto] gap-2">
                    <select
                      aria-label="Hari review mingguan"
                      value={settings.reminder_schedule.weekly_review_day}
                      onChange={(event) => updateSchedule('weekly_review_day', Number(event.target.value))}
                      className="focus-ring h-9 min-w-0 rounded-xl border border-white/10 bg-slate-950 px-3 text-xs text-white outline-none"
                    >
                      {WEEKDAYS.map(({ value, label }) => <option key={value} value={value}>{label}</option>)}
                    </select>
                    <TimeInput label="Jam review mingguan" value={settings.reminder_schedule.weekly_review_time} onChange={(value) => updateSchedule('weekly_review_time', value)} compact />
                  </div>
                </ReminderScheduleCard>

                <ReminderScheduleCard
                  icon={BellRing}
                  title="Reminder deadline bertahap"
                  description="Boleh memilih beberapa tahap; setiap tahap hanya dikirim satu kali."
                  active={Boolean(settings.features.deadline_reminders)}
                  onToggle={() => toggleFeature('deadline_reminders')}
                  wide
                >
                  <div className="flex flex-wrap gap-1.5">
                    {DEADLINE_OPTIONS.map(({ value, label }) => {
                      const selected = settings.reminder_schedule.deadline_lead_minutes.includes(value);
                      return (
                        <button
                          type="button"
                          key={value}
                          onClick={() => toggleDeadlineLead(value)}
                          aria-pressed={selected}
                          className={cn(
                            'focus-ring rounded-lg border px-2.5 py-1.5 text-[10px] font-bold transition',
                            selected ? 'border-cyan-300/30 bg-cyan-300/10 text-cyan-200' : 'border-white/10 bg-black/15 text-slate-500 hover:text-slate-300',
                          )}
                        >
                          {label}
                        </button>
                      );
                    })}
                  </div>
                </ReminderScheduleCard>
              </div>
            </section>

            <section>
              <div className="mb-3">
                <h3 className="text-sm font-bold text-white">Perintah chat</h3>
                <p className="mt-1 text-xs text-slate-500">Atur data apa saja yang boleh dibaca atau diubah melalui chat WhatsApp.</p>
              </div>
              <div className="grid gap-2 sm:grid-cols-2">
                {CHAT_FEATURES.map(({ key, label, description, icon: Icon }) => {
                  const active = Boolean(settings.features[key]);
                  return (
                    <button
                      type="button"
                      key={key}
                      onClick={() => toggleFeature(key)}
                      aria-pressed={active}
                      className={cn(
                        'focus-ring flex items-start gap-3 rounded-2xl border p-3 text-left transition',
                        active ? 'border-cyan-400/20 bg-cyan-400/[0.065]' : 'border-white/10 bg-white/[0.025] opacity-65 hover:opacity-90',
                      )}
                    >
                      <span className={cn('mt-0.5 flex h-8 w-8 shrink-0 items-center justify-center rounded-xl', active ? 'bg-cyan-400/10 text-cyan-300' : 'bg-white/5 text-slate-500')}>
                        <Icon className="h-4 w-4" />
                      </span>
                      <span className="min-w-0 flex-1">
                        <span className="block text-xs font-bold text-white">{label}</span>
                        <span className="mt-1 block text-[11px] leading-relaxed text-slate-500">{description}</span>
                      </span>
                      <span className={cn('mt-1 flex h-5 w-5 items-center justify-center rounded-full border', active ? 'border-cyan-300/30 bg-cyan-300 text-slate-950' : 'border-white/15')}>
                        {active && <Check className="h-3 w-3" />}
                      </span>
                    </button>
                  );
                })}
              </div>
            </section>

            <button
              type="button"
              onClick={() => setConsent((value) => !value)}
              className="focus-ring flex w-full items-start gap-3 rounded-2xl border border-white/10 bg-white/[0.035] p-4 text-left"
            >
              <span className={cn('mt-0.5 flex h-5 w-5 shrink-0 items-center justify-center rounded-md border', consent ? 'border-emerald-300/40 bg-emerald-300 text-slate-950' : 'border-white/20')}>
                {consent && <Check className="h-3.5 w-3.5" />}
              </span>
              <span>
                <span className="block text-xs font-semibold text-white">Saya menyetujui pesan WhatsApp dari ORVYN</span>
                <span className="mt-1 block text-[11px] leading-relaxed text-slate-500">Nomor hanya digunakan untuk fitur yang dipilih. Kamu dapat mematikan integrasi kapan saja.</span>
              </span>
            </button>

            <div className="flex flex-col-reverse gap-2 border-t border-white/10 pt-5 sm:flex-row sm:items-center sm:justify-between">
              <div className="flex gap-2">
                <button type="button" onClick={connect} disabled={connecting} className="focus-ring inline-flex h-10 items-center justify-center gap-2 rounded-xl border border-white/10 bg-white/[0.06] px-4 text-xs font-bold text-slate-200 transition hover:bg-white/[0.1] disabled:opacity-50">
                  {connecting ? <Loader2 className="h-4 w-4 animate-spin" /> : <Smartphone className="h-4 w-4" />}
                  Hubungkan
                </button>
                <button type="button" onClick={sendTest} disabled={testing || !settings.enabled} className="focus-ring inline-flex h-10 items-center justify-center gap-2 rounded-xl border border-white/10 bg-white/[0.06] px-4 text-xs font-bold text-slate-200 transition hover:bg-white/[0.1] disabled:opacity-40">
                  {testing ? <Loader2 className="h-4 w-4 animate-spin" /> : <Send className="h-4 w-4" />}
                  Tes pesan
                </button>
              </div>
              <div className="flex items-center gap-2">
                <button
                  type="button"
                  onClick={() => setSettings((current) => ({ ...current, enabled: !current.enabled }))}
                  className={cn('focus-ring inline-flex h-10 items-center gap-2 rounded-xl border px-4 text-xs font-bold transition', settings.enabled ? 'border-emerald-400/25 bg-emerald-400/10 text-emerald-200' : 'border-white/10 bg-white/[0.04] text-slate-400')}
                >
                  <span className={cn('h-2 w-2 rounded-full', settings.enabled ? 'bg-emerald-300' : 'bg-slate-600')} />
                  {settings.enabled ? 'Aktif' : 'Nonaktif'}
                </button>
                <button type="button" onClick={save} disabled={saving} className="focus-ring inline-flex h-10 items-center justify-center gap-2 rounded-xl bg-cyan-300 px-5 text-xs font-black text-slate-950 transition hover:bg-cyan-200 disabled:opacity-50">
                  {saving && <Loader2 className="h-4 w-4 animate-spin" />}
                  Simpan
                </button>
              </div>
            </div>
          </div>
        )}
      </DialogContent>
    </Dialog>
  );
}

function StatusCard({ icon: Icon, title, detail, active }: { icon: typeof Smartphone; title: string; detail: string; active: boolean }) {
  return (
    <div className="flex items-center gap-3 rounded-2xl border border-white/10 bg-white/[0.035] p-4">
      <span className={cn('flex h-10 w-10 items-center justify-center rounded-2xl', active ? 'bg-emerald-400/10 text-emerald-300' : 'bg-white/5 text-slate-500')}><Icon className="h-4.5 w-4.5" /></span>
      <div className="min-w-0">
        <p className="truncate text-xs font-bold text-white">{title}</p>
        <p className="mt-1 truncate text-[11px] text-slate-500">{detail}</p>
      </div>
    </div>
  );
}

function ReminderScheduleCard({
  icon: Icon,
  title,
  description,
  active,
  onToggle,
  wide = false,
  children,
}: {
  icon: typeof Smartphone;
  title: string;
  description: string;
  active: boolean;
  onToggle: () => void;
  wide?: boolean;
  children: React.ReactNode;
}) {
  return (
    <div className={cn(
      'rounded-2xl border p-4 transition',
      wide && 'sm:col-span-2',
      active ? 'border-cyan-400/20 bg-cyan-400/[0.05]' : 'border-white/10 bg-white/[0.025]',
    )}>
      <div className="flex items-start gap-3">
        <span className={cn('flex h-9 w-9 shrink-0 items-center justify-center rounded-xl', active ? 'bg-cyan-400/10 text-cyan-300' : 'bg-white/5 text-slate-500')}>
          <Icon className="h-4 w-4" />
        </span>
        <div className="min-w-0 flex-1">
          <p className="text-xs font-bold text-white">{title}</p>
          <p className="mt-1 text-[10px] leading-relaxed text-slate-500">{description}</p>
        </div>
        <button
          type="button"
          onClick={onToggle}
          aria-label={`${active ? 'Nonaktifkan' : 'Aktifkan'} ${title}`}
          aria-pressed={active}
          className={cn('focus-ring relative h-6 w-11 shrink-0 rounded-full border transition', active ? 'border-cyan-300/30 bg-cyan-300/20' : 'border-white/15 bg-black/20')}
        >
          <span className={cn('absolute top-1 h-3.5 w-3.5 rounded-full transition-all', active ? 'left-6 bg-cyan-200' : 'left-1 bg-slate-600')} />
        </button>
      </div>
      <div className={cn('mt-3 border-t pt-3 transition', active ? 'border-cyan-300/10 opacity-100' : 'border-white/5 opacity-55')}>
        {children}
      </div>
    </div>
  );
}

function TimeInput({ label, value, onChange, compact = false }: { label: string; value: string; onChange: (value: string) => void; compact?: boolean }) {
  return (
    <div className={cn('relative', compact && 'w-28')}>
      <Clock3 className="pointer-events-none absolute left-3 top-2.5 h-4 w-4 text-slate-500" />
      <input
        type="time"
        aria-label={label}
        value={value}
        onChange={(event) => onChange(event.target.value)}
        className="focus-ring h-9 w-full rounded-xl border border-white/10 bg-slate-950 pl-9 pr-2 text-xs text-white outline-none [color-scheme:dark]"
      />
    </div>
  );
}

function Field({ label, hint, badge, children }: { label: string; hint: string; badge?: React.ReactNode; children: React.ReactNode }) {
  return (
    <div className="space-y-2">
      <div className="flex items-center justify-between">
        <span className="block text-xs font-bold text-slate-200">{label}</span>
        {badge}
      </div>
      {children}
      <span className="block text-[10px] leading-relaxed text-slate-600">{hint}</span>
    </div>
  );
}
