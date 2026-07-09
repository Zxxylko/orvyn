import { Sidebar } from './Sidebar';
import { Header } from './Header';
import { CommandPalette } from './CommandPalette';
import { useAuth } from '@/contexts/auth';
import { AnimatePresence, motion } from 'framer-motion';
import { ArrowUp, CalendarDays, Command, Plus } from 'lucide-react';
import { Navigate, useLocation, useNavigate } from 'react-router-dom';
import { useEffect, useRef, useState } from 'react';

interface AppShellProps {
  children: React.ReactNode;
}

export function AppShell({ children }: AppShellProps) {
  const { token, loading } = useAuth();
  const location = useLocation();
  const navigate = useNavigate();
  const scrollViewportRef = useRef<HTMLElement | null>(null);
  const [commandPaletteOpen, setCommandPaletteOpen] = useState(false);
  const [scrollProgress, setScrollProgress] = useState(0);
  const [showBackToTop, setShowBackToTop] = useState(false);

  useEffect(() => {
    const handleKeyDown = (event: KeyboardEvent) => {
      if ((event.metaKey || event.ctrlKey) && event.key.toLowerCase() === 'k') {
        event.preventDefault();
        setCommandPaletteOpen((open) => !open);
      }
    };

    window.addEventListener('keydown', handleKeyDown);
    return () => window.removeEventListener('keydown', handleKeyDown);
  }, []);

  useEffect(() => {
    const viewport = scrollViewportRef.current;
    if (!viewport) return;

    const updateScrollProgress = () => {
      const maxScroll = viewport.scrollHeight - viewport.clientHeight;
      const nextProgress = maxScroll <= 0 ? 0 : viewport.scrollTop / maxScroll;
      setScrollProgress(Math.min(1, Math.max(0, nextProgress)));
      setShowBackToTop(viewport.scrollTop > 360);
    };

    updateScrollProgress();
    viewport.addEventListener('scroll', updateScrollProgress, { passive: true });
    return () => viewport.removeEventListener('scroll', updateScrollProgress);
  }, [location.pathname]);

  const focusSmartTaskInput = () => {
    navigate('/dashboard');
    window.setTimeout(() => {
      window.dispatchEvent(new CustomEvent('orvyn:focus-smart-task'));
    }, 140);
  };

  const scrollToTop = () => {
    scrollViewportRef.current?.scrollTo({ top: 0, behavior: 'smooth' });
  };

  // If loading user data, show loading spinner
  if (loading) {
    return (
      <div className="flex flex-col items-center justify-center w-screen h-screen bg-transparent">
        <div className="relative flex items-center justify-center">
          <div className="w-12 h-12 border-2 border-t-cyan-500 border-r-slate-500 border-slate-800 rounded-full animate-spin" />
        </div>
        <p className="text-slate-400 text-sm font-medium mt-6 animate-pulse">
          Menyiapkan ruang belajar...
        </p>
      </div>
    );
  }

  // Redirect to login if no auth token exists
  if (!token) {
    return <Navigate to="/" replace />;
  }

  return (
    <div className="flex w-screen h-screen overflow-hidden bg-transparent font-sans text-slate-100">
      {/* Dynamic Sidebar navigation */}
      <Sidebar />

      {/* Main page content area */}
      <div className="flex flex-col flex-1 h-full min-w-0 overflow-hidden">
        {/* Header bar */}
        <Header onOpenCommandPalette={() => setCommandPaletteOpen(true)} />

        {/* Scrollable page viewport */}
        <div className="h-px w-full bg-white/[0.035]">
          <motion.div
            className="h-px origin-left bg-cyan-300/80"
            style={{ scaleX: scrollProgress }}
          />
        </div>

        <main
          ref={scrollViewportRef}
          className="flex-1 overflow-x-hidden overflow-y-auto bg-transparent px-4 py-5 sm:px-6 lg:px-8 lg:py-8"
        >
          <AnimatePresence mode="wait">
            <motion.div
              key={location.pathname}
              initial={{ opacity: 0, y: 14, scale: 0.995 }}
              animate={{ opacity: 1, y: 0, scale: 1 }}
              exit={{ opacity: 0, y: -8, scale: 0.998 }}
              transition={{ duration: 0.28, ease: [0.22, 1, 0.36, 1] }}
              className="page-motion mx-auto h-full w-full max-w-7xl"
            >
              {children}
            </motion.div>
          </AnimatePresence>
        </main>
      </div>

      <CommandPalette open={commandPaletteOpen} onOpenChange={setCommandPaletteOpen} />
      <QuickActionDock
        onOpenCommandPalette={() => setCommandPaletteOpen(true)}
        onAddTask={focusSmartTaskInput}
        onOpenCalendar={() => navigate('/calendar')}
        onBackToTop={scrollToTop}
        showBackToTop={showBackToTop}
      />
    </div>
  );
}

interface QuickActionDockProps {
  onOpenCommandPalette: () => void;
  onAddTask: () => void;
  onOpenCalendar: () => void;
  onBackToTop: () => void;
  showBackToTop: boolean;
}

function QuickActionDock({
  onOpenCommandPalette,
  onAddTask,
  onOpenCalendar,
  onBackToTop,
  showBackToTop,
}: QuickActionDockProps) {
  const actions = [
    {
      label: 'Cari aksi',
      icon: Command,
      onClick: onOpenCommandPalette,
    },
    {
      label: 'Tambah tugas',
      icon: Plus,
      onClick: onAddTask,
    },
    {
      label: 'Jadwal',
      icon: CalendarDays,
      onClick: onOpenCalendar,
    },
  ];

  return (
    <motion.div
      initial={{ opacity: 0, y: 18, scale: 0.96 }}
      animate={{ opacity: 1, y: 0, scale: 1 }}
      transition={{ duration: 0.32, ease: [0.22, 1, 0.36, 1], delay: 0.12 }}
      style={{ x: '-50%' }}
      className="fixed bottom-4 left-1/2 z-40 flex items-center gap-1 rounded-2xl border border-white/10 bg-slate-950/90 p-1.5 shadow-2xl shadow-black/40 backdrop-blur-2xl sm:bottom-5"
    >
      {actions.map((action) => {
        const Icon = action.icon;

        return (
          <button
            key={action.label}
            type="button"
            onClick={action.onClick}
            className="group relative flex h-10 w-10 items-center justify-center rounded-xl text-slate-400 transition hover:bg-white/10 hover:text-white focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-cyan-300/60"
            aria-label={action.label}
          >
            <Icon className="h-4 w-4 transition duration-200 group-hover:scale-110" />
            <span className="pointer-events-none absolute bottom-full mb-2 whitespace-nowrap rounded-lg border border-white/10 bg-slate-950 px-2 py-1 text-[10px] font-semibold text-slate-300 opacity-0 shadow-xl transition group-hover:-translate-y-0.5 group-hover:opacity-100">
              {action.label}
            </span>
          </button>
        );
      })}

      <AnimatePresence>
        {showBackToTop && (
          <motion.button
            type="button"
            onClick={onBackToTop}
            initial={{ opacity: 0, width: 0, scale: 0.9 }}
            animate={{ opacity: 1, width: 40, scale: 1 }}
            exit={{ opacity: 0, width: 0, scale: 0.9 }}
            transition={{ duration: 0.2 }}
            className="group relative flex h-10 items-center justify-center overflow-hidden rounded-xl border-l border-white/10 text-slate-400 transition hover:bg-white/10 hover:text-white focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-cyan-300/60"
            aria-label="Kembali ke atas"
          >
            <ArrowUp className="h-4 w-4 transition duration-200 group-hover:-translate-y-0.5" />
            <span className="pointer-events-none absolute bottom-full mb-2 whitespace-nowrap rounded-lg border border-white/10 bg-slate-950 px-2 py-1 text-[10px] font-semibold text-slate-300 opacity-0 shadow-xl transition group-hover:-translate-y-0.5 group-hover:opacity-100">
              Ke atas
            </span>
          </motion.button>
        )}
      </AnimatePresence>
    </motion.div>
  );
}
