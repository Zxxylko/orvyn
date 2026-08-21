import { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import { useNavigate } from '@/lib/router-hooks';
import { AnimatePresence, motion } from 'framer-motion';
import { briefingApi, getApiErrorMessage, timeBlockApi } from '@/lib/api';
import {
  Activity,
  Brain,
  Calendar,
  CheckSquare,
  Command,
  Compass,
  GraduationCap,
  LayoutDashboard,
  Loader2,
  MapPin,
  Search,
  Sparkles,
  Wallet,
} from 'lucide-react';
import { toast } from 'sonner';

interface CommandPaletteProps {
  open: boolean;
  onOpenChange: (open: boolean) => void;
}

export function CommandPalette({ open, onOpenChange }: CommandPaletteProps) {
  const navigate = useNavigate();
  const [query, setQuery] = useState('');
  const [runningAction, setRunningAction] = useState<string | null>(null);
  const [selectedIndex, setSelectedIndex] = useState(0);
  const paletteRef = useRef<HTMLDivElement>(null);

  const closePalette = useCallback(() => {
    setQuery('');
    setSelectedIndex(0);
    onOpenChange(false);
  }, [onOpenChange]);

  const commands = useMemo(
    () => [
      {
        id: 'dashboard',
        label: 'Buka Beranda',
        hint: 'Ringkasan tugas, fokus, dan habit',
        icon: LayoutDashboard,
        keywords: 'home overview tugas beranda',
        run: () => navigate('/dashboard'),
      },
      {
        id: 'student-hub',
        label: 'Buka Student Hub',
        hint: 'Semester, deadline, tubes, LMS, uang, habit, dan health',
        icon: Compass,
        keywords: 'student hub semester deadline tubes lms uang habit',
        run: () => navigate('/student-hub'),
      },
      {
        id: 'calendar',
        label: 'Buka Jadwal Belajar',
        hint: 'Blok waktu mingguan dan rencana belajar',
        icon: Calendar,
        keywords: 'schedule planner week jadwal belajar',
        run: () => navigate('/calendar'),
      },
      {
        id: 'briefing',
        label: 'Buka Ringkasan Harian',
        hint: 'Ringkasan harian dan saran prioritas',
        icon: Brain,
        keywords: 'ai coach gemini summary briefing',
        run: () => navigate('/briefing'),
      },
      {
        id: 'academic',
        label: 'Buka Tugas Kuliah',
        hint: 'Tugas, praktikum, tubes, dan LMS',
        icon: GraduationCap,
        keywords: 'school university telu assignments tugas kuliah',
        run: () => navigate('/academic'),
      },
      {
        id: 'campus',
        label: 'Buka Kampus',
        hint: 'Kelas, ruangan, jam berangkat, dan checklist',
        icon: MapPin,
        keywords: 'telkom university bandung class room commute kampus',
        run: () => navigate('/campus'),
      },
      {
        id: 'finance',
        label: 'Buka Uang Bulanan',
        hint: 'Budget kost dan catatan pengeluaran',
        icon: Wallet,
        keywords: 'money expense budget uang bulanan',
        run: () => navigate('/finance'),
      },
      {
        id: 'health',
        label: 'Buka Kesehatan',
        hint: 'Air minum, tidur, kafein, dan screen time',
        icon: Activity,
        keywords: 'wellness sleep water caffeine kesehatan',
        run: () => navigate('/health'),
      },
      {
        id: 'add-task',
        label: 'Tambah Tugas Cepat',
        hint: 'Catat tugas kuliah dengan kalimat biasa',
        icon: CheckSquare,
        keywords: 'create new todo pending task tambah tugas',
        run: () => {
          navigate('/dashboard');
          window.setTimeout(() => {
            window.dispatchEvent(new CustomEvent('orvyn:focus-smart-task'));
          }, 120);
        },
      },
      {
        id: 'optimize',
        label: 'Rapikan Jadwal',
        hint: 'Masukkan tugas pending ke slot kosong',
        icon: Sparkles,
        keywords: 'ai schedule planner optimize rapikan jadwal',
        run: async () => {
          const response = await timeBlockApi.optimizeSchedule();
          toast.success(response.data?.message || 'Jadwal berhasil dirapikan.');
        },
      },
      {
        id: 'generate-briefing',
        label: 'Buat Ringkasan Hari Ini',
        hint: 'Refresh ringkasan dan rekomendasi prioritas',
        icon: Brain,
        keywords: 'gemini daily report coach regenerate briefing',
        run: async () => {
          const response = await briefingApi.generate();
          toast.success(response.data?.message || 'Ringkasan harian berhasil dibuat.');
          navigate('/briefing');
        },
      },
    ],
    [navigate]
  );

  const filteredCommands = useMemo(
    () =>
      commands.filter((command) => {
        const searchText = `${command.label} ${command.hint} ${command.keywords}`.toLowerCase();
        return searchText.includes(query.toLowerCase());
      }),
    [commands, query]
  );

  const runCommand = useCallback(async (command: (typeof commands)[number]) => {
    setRunningAction(command.id);

    try {
      await command.run();
      closePalette();
    } catch (err: unknown) {
      toast.error(getApiErrorMessage(err, 'Command failed'));
    } finally {
      setRunningAction(null);
    }
  }, [closePalette]);

  useEffect(() => {
    if (!open) return;

    const overlay = paletteRef.current?.parentElement;
    const backgroundElements = overlay?.parentElement
      ? Array.from(overlay.parentElement.children).filter((element) => element !== overlay) as HTMLElement[]
      : [];
    const previousAccessibility = backgroundElements.map((element) => ({
      element,
      ariaHidden: element.getAttribute('aria-hidden'),
      inert: element.inert,
    }));
    backgroundElements.forEach((element) => {
      element.setAttribute('aria-hidden', 'true');
      element.inert = true;
    });

    const handleKeyDown = (event: KeyboardEvent) => {
      if (event.key === 'Escape') {
        closePalette();
        return;
      }

      if (event.key === 'Tab' && paletteRef.current) {
        const focusable = Array.from(paletteRef.current.querySelectorAll<HTMLElement>('input, button:not([disabled]), [tabindex]:not([tabindex="-1"])'));
        if (focusable.length > 0) {
          const first = focusable[0];
          const last = focusable[focusable.length - 1];
          if (event.shiftKey && document.activeElement === first) {
            event.preventDefault();
            last.focus();
          } else if (!event.shiftKey && document.activeElement === last) {
            event.preventDefault();
            first.focus();
          }
        }
        return;
      }

      if (event.key === 'ArrowDown') {
        event.preventDefault();
        setSelectedIndex((index) => Math.min(index + 1, Math.max(filteredCommands.length - 1, 0)));
        return;
      }

      if (event.key === 'ArrowUp') {
        event.preventDefault();
        setSelectedIndex((index) => Math.max(index - 1, 0));
        return;
      }

      if (event.key === 'Enter' && filteredCommands[selectedIndex] && runningAction === null) {
        event.preventDefault();
        void runCommand(filteredCommands[selectedIndex]);
      }
    };

    window.addEventListener('keydown', handleKeyDown);
    return () => {
      window.removeEventListener('keydown', handleKeyDown);
      previousAccessibility.forEach(({ element, ariaHidden, inert }) => {
        if (ariaHidden === null) element.removeAttribute('aria-hidden');
        else element.setAttribute('aria-hidden', ariaHidden);
        element.inert = inert;
      });
    };
  }, [closePalette, filteredCommands, open, runCommand, runningAction, selectedIndex]);

  return (
    <AnimatePresence>
      {open && (
        <motion.div
          className="fixed inset-0 z-50 flex items-start justify-center bg-black/55 px-4 pt-24 backdrop-blur-xl"
          initial={{ opacity: 0 }}
          animate={{ opacity: 1 }}
          exit={{ opacity: 0 }}
          transition={{ duration: 0.18 }}
          onMouseDown={(event) => {
            if (event.target === event.currentTarget) {
              closePalette();
            }
          }}
        >
          <motion.div
            ref={paletteRef}
            role="dialog"
            aria-modal="true"
            aria-label="Pencarian halaman dan aksi"
            initial={{ opacity: 0, y: 18, scale: 0.97 }}
            animate={{ opacity: 1, y: 0, scale: 1 }}
            exit={{ opacity: 0, y: 10, scale: 0.98 }}
            transition={{ duration: 0.24, ease: [0.22, 1, 0.36, 1] }}
            className="w-full max-w-xl overflow-hidden rounded-2xl border border-white/10 bg-slate-950/95 shadow-2xl shadow-black/60"
          >
            <div className="flex items-center gap-3 border-b border-white/10 px-4 py-3">
              <Search className="h-4 w-4 text-slate-500" />
              <input
                autoFocus
                value={query}
                onChange={(event) => {
                  setQuery(event.target.value);
                  setSelectedIndex(0);
                }}
                placeholder="Cari halaman atau aksi..."
                className="h-9 flex-1 bg-transparent text-sm font-medium text-white outline-none placeholder:text-slate-600"
              />
              <div className="hidden items-center gap-1 rounded-lg border border-white/10 bg-white/5 px-2 py-1 text-[10px] font-semibold text-slate-500 sm:flex">
                <Command className="h-3 w-3" /> K
              </div>
            </div>

            <div className="max-h-[420px] overflow-y-auto p-2">
              {filteredCommands.length === 0 ? (
                <div className="px-4 py-10 text-center text-xs font-semibold text-slate-500">
                  Tidak ada hasil.
                </div>
              ) : (
                filteredCommands.map((command, index) => {
                  const Icon = command.icon;
                  const isRunning = runningAction === command.id;
                  const isSelected = index === selectedIndex;

                  return (
                    <button
                      key={command.id}
                      type="button"
                      onMouseEnter={() => setSelectedIndex(index)}
                      onClick={() => void runCommand(command)}
                      disabled={runningAction !== null}
                      aria-selected={isSelected}
                      className={`group flex w-full items-center gap-3 rounded-xl px-3 py-3 text-left transition disabled:cursor-not-allowed disabled:opacity-70 ${
                        isSelected ? 'bg-white/[0.08]' : 'hover:bg-white/[0.06]'
                      }`}
                    >
                      <div className={`flex h-9 w-9 shrink-0 items-center justify-center rounded-xl border border-white/10 bg-white/[0.04] text-slate-300 transition ${isSelected ? 'text-white' : 'group-hover:text-white'}`}>
                        {isRunning ? <Loader2 className="h-4 w-4 animate-spin" /> : <Icon className="h-4 w-4" />}
                      </div>
                      <div className="min-w-0 flex-1">
                        <p className="text-sm font-semibold text-white">{command.label}</p>
                        <p className="truncate text-xs font-medium text-slate-500">{command.hint}</p>
                      </div>
                      {isSelected && (
                        <span className="hidden rounded-md border border-white/10 px-2 py-1 text-[10px] font-semibold text-slate-500 sm:inline">
                          Enter
                        </span>
                      )}
                    </button>
                  );
                })
              )}
            </div>
          </motion.div>
        </motion.div>
      )}
    </AnimatePresence>
  );
}
