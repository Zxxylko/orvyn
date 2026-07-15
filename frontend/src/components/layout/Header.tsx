import { useEffect, useMemo, useState } from 'react';
import { useLocation, useNavigate } from 'react-router-dom';
import { format } from 'date-fns';
import { id as localeId } from 'date-fns/locale';
import { useAuth } from '@/contexts/auth';
import { Bell, CheckCircle2, Clock, CloudOff, Command, HelpCircle, Loader2, Search, Wifi, WifiOff } from 'lucide-react';
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuLabel,
  DropdownMenuSeparator,
  DropdownMenuTrigger,
} from '@/components/ui/dropdown-menu';
import { taskApi } from '@/lib/api';
import type { Task } from '@/types/task';
import { useSyncStatus } from '@/hooks/useSyncStatus';
import { WhatsAppSettingsDialog } from '@/components/settings/WhatsAppSettingsDialog';

interface HeaderProps {
  onOpenCommandPalette: () => void;
  onOpenOnboarding: () => void;
}

export function Header({ onOpenCommandPalette, onOpenOnboarding }: HeaderProps) {
  const location = useLocation();
  const navigate = useNavigate();
  const { user, logout } = useAuth();
  const [now, setNow] = useState(() => new Date());
  const [isOnline, setIsOnline] = useState(() => navigator.onLine);
  const [taskAlerts, setTaskAlerts] = useState<Array<{ title: string; detail: string }>>([]);
  const [whatsappSettingsOpen, setWhatsAppSettingsOpen] = useState(false);
  const syncState = useSyncStatus();

  // Get dynamic title based on path
  const getPageTitle = () => {
    switch (location.pathname) {
      case '/dashboard':
        return 'Beranda Mahasiswa';
      case '/student-hub':
        return 'Student Hub';
      case '/calendar':
        return 'Jadwal Belajar';
      case '/briefing':
        return 'Ringkasan Harian';
      case '/academic':
        return 'Tugas Kuliah';
      case '/campus':
        return 'Kampus';
      case '/finance':
        return 'Uang Bulanan';
      case '/health':
        return 'Kesehatan';
      default:
        return 'ORVYN';
    }
  };

  const pageTitle = getPageTitle();

  useEffect(() => {
    const timer = window.setInterval(() => setNow(new Date()), 30_000);
    const setOnline = () => setIsOnline(true);
    const setOffline = () => setIsOnline(false);

    window.addEventListener('online', setOnline);
    window.addEventListener('offline', setOffline);

    return () => {
      window.clearInterval(timer);
      window.removeEventListener('online', setOnline);
      window.removeEventListener('offline', setOffline);
    };
  }, []);

  useEffect(() => {
    let active = true;

    taskApi.getTasks({ active: true }).then((response) => {
      if (!active) return;
      const tasks = (response.data?.data ?? []) as Task[];
      const nowTime = Date.now();
      const day = 24 * 60 * 60 * 1000;
      const alerts = tasks
        .filter((task) => task.deadline && task.status !== 'completed' && task.status !== 'cancelled')
        .map((task) => ({ task, distance: new Date(task.deadline as string).getTime() - nowTime }))
        .filter(({ distance }) => distance <= day * 2)
        .sort((a, b) => a.distance - b.distance)
        .slice(0, 4)
        .map(({ task, distance }) => ({
          title: distance < 0 ? `Terlambat: ${task.title}` : `Segera: ${task.title}`,
          detail: distance < 0
            ? `Lewat ${Math.max(1, Math.ceil(Math.abs(distance) / day))} hari dari deadline.`
            : `Deadline ${format(new Date(task.deadline as string), 'd MMM, HH:mm', { locale: localeId })}.`,
        }));
      setTaskAlerts(alerts);
    }).catch(() => {
      if (active) setTaskAlerts([]);
    });

    return () => { active = false; };
  }, [location.pathname]);

  const statusItems = useMemo(
    () => [
      {
        title: isOnline ? 'Koneksi aktif' : 'Koneksi terputus',
        detail: isOnline ? 'Sinkronisasi data siap digunakan.' : 'Perubahan lokal tetap bisa dibaca, namun sinkronisasi perlu koneksi.',
        tone: isOnline ? 'text-emerald-300' : 'text-amber-300',
      },
      {
        title: pageTitle,
        detail: 'Halaman aktif sekarang. Gunakan pencarian untuk berpindah cepat.',
        tone: 'text-cyan-300',
      },
      {
        title: 'Command palette',
        detail: 'Tekan Cmd/Ctrl + K untuk mencari halaman atau menjalankan aksi.',
        tone: 'text-slate-300',
      },
      {
        title: syncState === 'syncing' ? 'Menyimpan perubahan' : syncState === 'error' ? 'Sinkronisasi gagal' : syncState === 'offline' ? 'Mode offline' : 'Data tersinkron',
        detail: syncState === 'syncing' ? 'Perubahan sedang dikirim ke server.' : syncState === 'error' ? 'Perubahan terakhir gagal disimpan. Coba lagi saat koneksi stabil.' : syncState === 'offline' ? 'Sambungkan internet untuk melanjutkan sinkronisasi.' : 'Perubahan terakhir sudah aman.',
        tone: syncState === 'error' || syncState === 'offline' ? 'text-amber-300' : 'text-emerald-300',
      },
    ],
    [isOnline, pageTitle, syncState]
  );

  // Get dynamic greeting
  const getGreeting = () => {
    const hours = new Date().getHours();
    if (hours < 12) return 'Selamat pagi';
    if (hours < 18) return 'Selamat siang';
    return 'Selamat malam';
  };

  return (
    <header className="relative z-10 flex h-16 items-center justify-between border-b border-white/10 bg-white/[0.045] px-4 backdrop-blur-2xl sm:px-6 lg:px-8">
      <div className="flex min-w-0 flex-col">
        <h1 className="truncate text-base font-semibold leading-none tracking-tight text-white sm:text-lg">
          {pageTitle}
        </h1>
        <p className="mt-1 hidden truncate text-xs font-medium text-slate-500 sm:block">
          {getGreeting()}{user ? `, ${user.name.split(' ')[0]}` : ''} • {format(now, 'EEEE, d MMMM yyyy', { locale: localeId })}
        </p>
      </div>

      <div className="flex items-center gap-2 sm:gap-4">
        <div className="hidden items-center gap-2 rounded-xl border border-white/10 bg-white/[0.045] px-3 py-2 text-xs font-semibold text-slate-300 xl:flex">
          <Clock className="h-3.5 w-3.5 text-slate-500" />
          {format(now, 'HH:mm')}
          <span className="h-1 w-1 rounded-full bg-slate-700" />
          {isOnline ? (
            <Wifi className="h-3.5 w-3.5 text-emerald-300" />
          ) : (
            <WifiOff className="h-3.5 w-3.5 text-amber-300" />
          )}
          <span className="h-1 w-1 rounded-full bg-slate-700" />
          {syncState === 'syncing' ? (
            <><Loader2 className="h-3.5 w-3.5 animate-spin text-cyan-300" /> Menyimpan</>
          ) : syncState === 'offline' ? (
            <><CloudOff className="h-3.5 w-3.5 text-amber-300" /> Offline</>
          ) : syncState === 'error' ? (
            <span className="text-amber-300">Gagal simpan</span>
          ) : (
            <span className="text-emerald-300">Tersimpan</span>
          )}
        </div>

        {/* Simple search bar */}
        <button
          type="button"
          onClick={onOpenCommandPalette}
          className="interactive-surface focus-ring relative hidden w-64 rounded-xl border border-white/10 bg-white/[0.055] py-2 pl-10 pr-3 text-left text-sm font-medium text-slate-500 transition hover:border-white/20 hover:bg-white/[0.09] hover:text-slate-300 md:block lg:w-72"
        >
          <Search className="absolute left-3 top-2.5 h-4 w-4 text-slate-500" />
          Cari halaman atau aksi...
          <span className="absolute right-2 top-1.5 hidden items-center gap-1 rounded-md border border-white/10 bg-black/20 px-1.5 py-1 text-[10px] font-semibold text-slate-500 lg:flex">
            <Command size={10} /> K
          </span>
        </button>

        <button
          type="button"
          onClick={onOpenOnboarding}
          className="focus-ring interactive-surface hidden rounded-xl border border-white/10 bg-white/[0.055] p-2 text-slate-400 transition hover:bg-white/[0.09] hover:text-white sm:flex"
          aria-label="Buka panduan ORVYN"
        >
          <HelpCircle size={16} />
        </button>

        <button
          type="button"
          onClick={onOpenCommandPalette}
          className="focus-ring interactive-surface flex rounded-xl border border-white/10 bg-white/[0.055] p-2 text-slate-400 transition active:bg-white/[0.09] active:text-white md:hidden"
          aria-label="Cari halaman atau aksi"
        >
          <Search size={16} />
        </button>

        {/* User notification bell */}
        <DropdownMenu>
          <DropdownMenuTrigger asChild>
            <button
              className="focus-ring interactive-surface relative rounded-xl border border-white/10 bg-white/[0.055] p-2 text-slate-400 transition hover:bg-white/[0.09] hover:text-white cursor-pointer"
              aria-label="Buka status sistem"
            >
              <Bell size={16} />
              {taskAlerts.length > 0 ? (
                <span className="absolute -right-1.5 -top-1.5 flex h-4 min-w-4 items-center justify-center rounded-full bg-rose-500 px-1 text-[9px] font-black text-white">
                  {taskAlerts.length}
                </span>
              ) : (
                <span className="status-dot absolute right-1.5 top-1.5 h-1.5 w-1.5 rounded-full bg-cyan-400 text-cyan-400" />
              )}
            </button>
          </DropdownMenuTrigger>
          <DropdownMenuContent align="end" className="w-80 border border-white/15 bg-slate-950/95 p-2 text-white shadow-2xl backdrop-blur-xl">
            <DropdownMenuLabel className="px-2 py-2 text-xs font-semibold text-slate-300">
              Status Sistem
            </DropdownMenuLabel>
            <DropdownMenuSeparator className="bg-white/10" />
            {taskAlerts.length > 0 && (
              <>
                {taskAlerts.map((item) => (
                  <DropdownMenuItem
                    key={item.title}
                    onSelect={() => navigate('/dashboard')}
                    className="cursor-pointer items-start gap-3 rounded-xl px-2 py-3 focus:bg-rose-500/10"
                  >
                    <span className="status-dot mt-1.5 h-2 w-2 shrink-0 rounded-full bg-rose-400 text-rose-400" />
                    <div>
                      <p className="text-xs font-semibold text-white">{item.title}</p>
                      <p className="mt-1 text-xs font-medium leading-relaxed text-slate-500">{item.detail}</p>
                    </div>
                  </DropdownMenuItem>
                ))}
                <DropdownMenuSeparator className="bg-white/10" />
              </>
            )}
            {statusItems.map((item) => (
              <DropdownMenuItem
                key={item.title}
                onSelect={(event) => event.preventDefault()}
                className="cursor-default items-start gap-3 rounded-xl px-2 py-3 focus:bg-white/[0.06]"
              >
                <CheckCircle2 className={`mt-0.5 h-4 w-4 ${item.tone}`} />
                <div>
                  <p className="text-xs font-semibold text-white">{item.title}</p>
                  <p className="mt-1 text-xs font-medium leading-relaxed text-slate-500">{item.detail}</p>
                </div>
              </DropdownMenuItem>
            ))}
          </DropdownMenuContent>
        </DropdownMenu>

        {/* User account dropdown */}
        {user && (
          <DropdownMenu>
            <DropdownMenuTrigger className="flex items-center gap-2.5 focus:outline-none hover:opacity-90 transition cursor-pointer">
              <div className="flex h-8 w-8 items-center justify-center rounded-xl border border-white/15 bg-white/10 text-xs font-bold text-white">
                {user.name.charAt(0).toUpperCase()}
              </div>
              <div className="hidden lg:flex flex-col items-start">
                <span className="text-xs font-semibold text-slate-200 leading-none">{user.name}</span>
                <span className="text-xs font-medium text-slate-500 mt-0.5">Student OS</span>
              </div>
            </DropdownMenuTrigger>
            <DropdownMenuContent align="end" className="w-56 bg-slate-900 border border-white/15 text-white">
              <DropdownMenuLabel className="font-semibold text-slate-300">Akun Saya</DropdownMenuLabel>
              <DropdownMenuSeparator className="bg-white/10" />
              <DropdownMenuItem className="text-xs py-2 text-slate-200 focus:bg-white/10 focus:text-white cursor-pointer">
                Profil
              </DropdownMenuItem>
              <DropdownMenuItem className="text-xs py-2 text-slate-200 focus:bg-white/10 focus:text-white cursor-pointer">
                Sinkron Jadwal
              </DropdownMenuItem>
              <DropdownMenuItem
                onSelect={() => setWhatsAppSettingsOpen(true)}
                className="text-xs py-2 text-slate-200 focus:bg-white/10 focus:text-white cursor-pointer"
              >
                Preferensi Sistem
              </DropdownMenuItem>
              <DropdownMenuSeparator className="bg-white/10" />
              <DropdownMenuItem 
                onClick={logout}
                className="text-xs py-2 text-rose-400 focus:bg-rose-500/10 focus:text-rose-400 cursor-pointer"
              >
                Keluar
              </DropdownMenuItem>
            </DropdownMenuContent>
          </DropdownMenu>
        )}
      </div>
      <WhatsAppSettingsDialog open={whatsappSettingsOpen} onOpenChange={setWhatsAppSettingsOpen} />
    </header>
  );
}
