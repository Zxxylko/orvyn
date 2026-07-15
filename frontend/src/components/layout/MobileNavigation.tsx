import { useEffect, useRef, useState } from 'react';
import { AnimatePresence, motion, useReducedMotion } from 'framer-motion';
import { HelpCircle, Menu, Search, X } from 'lucide-react';
import { NavLink, useLocation } from 'react-router-dom';
import { cn } from '@/lib/utils';
import { navigationGroups, navigationItems } from './navigation';

interface MobileNavigationProps {
  onOpenCommandPalette: () => void;
  onOpenOnboarding: () => void;
}

const primaryPaths = ['/dashboard', '/student-hub', '/calendar'];

export function MobileNavigation({ onOpenCommandPalette, onOpenOnboarding }: MobileNavigationProps) {
  const location = useLocation();
  const [menuOpen, setMenuOpen] = useState(false);
  const shouldReduceMotion = useReducedMotion();
  const panelRef = useRef<HTMLDivElement>(null);
  const closeButtonRef = useRef<HTMLButtonElement>(null);
  const moreButtonRef = useRef<HTMLButtonElement>(null);
  const primaryItems = navigationItems.filter((item) => primaryPaths.includes(item.to));
  const activeIsMore = !primaryPaths.includes(location.pathname);

  useEffect(() => {
    if (!menuOpen) return;

    const handleEscape = (event: KeyboardEvent) => {
      if (event.key === 'Escape') setMenuOpen(false);
      if (event.key === 'Tab' && panelRef.current) {
        const focusable = Array.from(panelRef.current.querySelectorAll<HTMLElement>('a[href], button:not([disabled]), input, select, textarea, [tabindex]:not([tabindex="-1"])'));
        if (focusable.length === 0) return;
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
    };
    const previousOverflow = document.body.style.overflow;
    const trigger = moreButtonRef.current;
    const overlay = panelRef.current?.parentElement;
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
    document.body.style.overflow = 'hidden';
    window.addEventListener('keydown', handleEscape);
    const focusTimer = window.setTimeout(() => closeButtonRef.current?.focus(), 80);

    return () => {
      window.clearTimeout(focusTimer);
      document.body.style.overflow = previousOverflow;
      window.removeEventListener('keydown', handleEscape);
      previousAccessibility.forEach(({ element, ariaHidden, inert }) => {
        if (ariaHidden === null) element.removeAttribute('aria-hidden');
        else element.setAttribute('aria-hidden', ariaHidden);
        element.inert = inert;
      });
      trigger?.focus();
    };
  }, [menuOpen]);

  return (
    <>
      <nav
        className="fixed inset-x-3 bottom-[max(0.75rem,env(safe-area-inset-bottom))] z-40 grid grid-cols-5 rounded-2xl border border-white/10 bg-slate-950/95 p-1.5 shadow-2xl shadow-black/50 backdrop-blur-2xl md:hidden"
        aria-label="Navigasi utama"
      >
        {primaryItems.map((item) => {
          const Icon = item.icon;
          return (
            <NavLink
              key={item.to}
              to={item.to}
              className={({ isActive }) => cn(
                'focus-ring relative flex min-h-12 flex-col items-center justify-center gap-1 rounded-xl text-[9px] font-bold transition',
                isActive ? 'text-white' : 'text-slate-500 active:text-slate-200'
              )}
            >
              {({ isActive }) => (
                <>
                  {isActive && (
                    <motion.span
                      layoutId="mobile-nav-active"
                      aria-hidden="true"
                      className="absolute inset-0 rounded-xl border border-cyan-300/15 bg-cyan-300/10"
                      transition={shouldReduceMotion
                        ? { duration: 0 }
                        : { duration: 0.22, ease: [0.22, 1, 0.36, 1] }
                      }
                    />
                  )}
                  <Icon className={cn('relative z-10 h-4 w-4', isActive && 'text-cyan-200')} />
                  <span className="relative z-10">{item.shortLabel}</span>
                </>
              )}
            </NavLink>
          );
        })}

        <button
          ref={moreButtonRef}
          type="button"
          onClick={onOpenCommandPalette}
          className="focus-ring flex min-h-12 flex-col items-center justify-center gap-1 rounded-xl text-[9px] font-bold text-slate-500 active:bg-white/5 active:text-white"
          aria-label="Cari halaman atau aksi"
        >
          <Search className="h-4 w-4" />
          Cari
        </button>

        <button
          type="button"
          onClick={() => setMenuOpen(true)}
          className={cn(
            'focus-ring relative flex min-h-12 flex-col items-center justify-center gap-1 overflow-hidden rounded-xl text-[9px] font-bold transition',
            activeIsMore ? 'text-white' : 'text-slate-500 active:bg-white/5 active:text-white'
          )}
          aria-label="Buka semua menu"
          aria-expanded={menuOpen}
        >
          {activeIsMore && (
            <motion.span
              layoutId="mobile-nav-active"
              aria-hidden="true"
              className="absolute inset-0 rounded-xl border border-cyan-300/15 bg-cyan-300/10"
              transition={shouldReduceMotion
                ? { duration: 0 }
                : { duration: 0.22, ease: [0.22, 1, 0.36, 1] }
              }
            />
          )}
          <Menu className={cn('relative z-10 h-4 w-4', activeIsMore && 'text-cyan-200')} />
          <span className="relative z-10">Lainnya</span>
        </button>
      </nav>

      <AnimatePresence>
        {menuOpen && (
          <motion.div
            className="fixed inset-0 z-50 bg-black/65 backdrop-blur-sm md:hidden"
            initial={{ opacity: 0 }}
            animate={{ opacity: 1 }}
            exit={{ opacity: 0 }}
            onClick={() => setMenuOpen(false)}
          >
            <motion.div
              ref={panelRef}
              role="dialog"
              aria-modal="true"
              aria-label="Semua menu"
              initial={{ y: '100%' }}
              animate={{ y: 0 }}
              exit={{ y: '100%' }}
              transition={{ type: 'spring', damping: 30, stiffness: 330 }}
              onClick={(event) => event.stopPropagation()}
              className="absolute inset-x-0 bottom-0 max-h-[82vh] overflow-y-auto rounded-t-3xl border-t border-white/10 bg-slate-950 px-4 pb-[max(1.5rem,env(safe-area-inset-bottom))] pt-3 shadow-2xl"
            >
              <div className="mx-auto mb-4 h-1 w-10 rounded-full bg-white/15" />
              <div className="mb-5 flex items-center justify-between">
                <div>
                  <p className="text-xs font-bold uppercase tracking-widest text-cyan-300">ORVYN</p>
                  <h2 className="mt-1 text-xl font-semibold text-white">Pilih ruang kerja</h2>
                </div>
                <button
                  ref={closeButtonRef}
                  type="button"
                  onClick={() => setMenuOpen(false)}
                  className="focus-ring flex h-10 w-10 items-center justify-center rounded-xl border border-white/10 bg-white/5 text-slate-400"
                  aria-label="Tutup menu"
                >
                  <X className="h-5 w-5" />
                </button>
              </div>

              <div className="space-y-5">
                {navigationGroups.map((group) => (
                  <section key={group.label}>
                    <p className="mb-2 px-1 text-[10px] font-bold uppercase tracking-widest text-slate-600">
                      {group.label}
                    </p>
                    <div className="grid grid-cols-2 gap-2">
                      {group.items.map((item) => {
                        const Icon = item.icon;
                        const isActive = item.to === location.pathname;
                        return (
                          <NavLink
                            key={item.to}
                            to={item.to}
                            onClick={() => setMenuOpen(false)}
                            className={cn(
                              'focus-ring relative flex items-center gap-3 overflow-hidden rounded-2xl border p-3.5 text-sm font-semibold transition',
                              isActive
                                ? 'border-transparent text-white'
                                : 'border-white/10 bg-white/[0.035] text-slate-400 active:bg-white/[0.08]'
                            )}
                          >
                            {isActive && (
                              <motion.span
                                layoutId="mobile-menu-active"
                                aria-hidden="true"
                                className="absolute inset-0 rounded-2xl border border-cyan-300/25 bg-cyan-300/10"
                                transition={shouldReduceMotion
                                  ? { duration: 0 }
                                  : { duration: 0.22, ease: [0.22, 1, 0.36, 1] }
                                }
                              />
                            )}
                            <span className={cn(
                              'relative z-10 flex h-9 w-9 items-center justify-center rounded-xl',
                              isActive ? 'bg-cyan-300/15 text-cyan-200' : 'bg-white/5 text-slate-500'
                            )}>
                              <Icon className="h-4 w-4" />
                            </span>
                            <span className="relative z-10 min-w-0 truncate">{item.shortLabel}</span>
                          </NavLink>
                        );
                      })}
                    </div>
                  </section>
                ))}
                <button
                  type="button"
                  onClick={() => { setMenuOpen(false); onOpenOnboarding(); }}
                  className="focus-ring flex w-full items-center justify-center gap-2 rounded-2xl border border-white/10 bg-white/[0.035] px-4 py-3 text-sm font-semibold text-slate-400 active:bg-white/[0.08] active:text-white"
                >
                  <HelpCircle className="h-4 w-4" /> Buka panduan ORVYN
                </button>
              </div>
            </motion.div>
          </motion.div>
        )}
      </AnimatePresence>
    </>
  );
}
