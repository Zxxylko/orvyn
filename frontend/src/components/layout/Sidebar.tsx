import { useEffect, useState } from 'react';
import { NavLink } from '@/lib/router';
import { useLocation } from '@/lib/router-hooks';
import { ChevronLeft, ChevronRight, LogOut } from 'lucide-react';
import { motion, useReducedMotion } from 'framer-motion';
import { useAuth } from '@/contexts/auth';
import { cn } from '@/lib/utils';
import { navigationGroups } from './navigation';
import { toast } from 'sonner';
import { getApiErrorMessage } from '@/lib/api';

export function Sidebar() {
  const [isCollapsed, setIsCollapsed] = useState(() => localStorage.getItem('orvyn-sidebar-collapsed') === 'true');
  const { logout, user } = useAuth();
  const location = useLocation();
  const shouldReduceMotion = useReducedMotion();

  const handleLogout = async () => {
    try {
      await logout();
    } catch (error) {
      toast.error(getApiErrorMessage(error, 'Sesi belum dapat diakhiri. Coba lagi.'));
    }
  };

  useEffect(() => {
    localStorage.setItem('orvyn-sidebar-collapsed', String(isCollapsed));
  }, [isCollapsed]);

  return (
    <aside
      className={cn(
        "relative z-20 hidden h-screen flex-col border-r border-white/10 bg-white/[0.045] backdrop-blur-2xl transition-all duration-300 ease-in-out md:flex",
        isCollapsed ? "w-20" : "w-64"
      )}
    >
      {/* Brand Logo Header */}
      <div className="flex items-center justify-between h-16 px-4 border-b border-white/5">
        <div className="flex items-center gap-3 overflow-hidden">
          <div className="flex h-8 w-8 items-center justify-center rounded-xl border border-white/15 bg-white text-black shadow-sm">
            <span className="font-bold text-black text-sm">O</span>
          </div>
          {!isCollapsed && (
            <span className="text-lg font-semibold tracking-tight text-white">
              ORVYN
            </span>
          )}
        </div>
        <button
          onClick={() => setIsCollapsed(!isCollapsed)}
          className="focus-ring absolute -right-3 top-20 flex h-6 w-6 items-center justify-center rounded-full border border-white/10 bg-white/10 text-zinc-300 shadow-md backdrop-blur-xl transition hover:bg-white/15 hover:text-white cursor-pointer"
          aria-label={isCollapsed ? 'Perluas sidebar' : 'Ciutkan sidebar'}
        >
          {isCollapsed ? <ChevronRight size={14} /> : <ChevronLeft size={14} />}
        </button>
      </div>

      {/* Navigation list */}
      <nav className="flex-1 space-y-5 px-3 py-6">
        {navigationGroups.map((group) => (
          <div key={group.label} className="space-y-1.5">
            {!isCollapsed && (
              <p className="px-3 text-[10px] font-bold uppercase tracking-widest text-slate-600">
                {group.label}
              </p>
            )}
            {group.items.map((item) => {
              const Icon = item.icon;
              const isActive = location.pathname === item.to;
              return (
                <NavLink
                  key={item.to}
                  to={item.to}
                  className={cn(
                    "focus-ring interactive-surface group relative flex items-center gap-3 overflow-hidden rounded-xl px-3 py-2.5 text-sm font-medium transition duration-200",
                    isActive
                      ? "text-white"
                      : "text-slate-400 hover:text-slate-200 hover:bg-white/[0.055]"
                  )}
                >
                  {isActive && (
                    <motion.span
                      layoutId="sidebar-active"
                      aria-hidden="true"
                      className="absolute inset-0 rounded-xl border border-white/15 bg-white/[0.12] shadow-inner shadow-white/5"
                      transition={shouldReduceMotion
                        ? { duration: 0 }
                        : { duration: 0.24, ease: [0.22, 1, 0.36, 1] }
                      }
                    />
                  )}
                  <Icon
                    size={20}
                    className={cn(
                      "relative z-10 shrink-0 transition-transform group-hover:scale-105",
                      isActive && "text-cyan-200"
                    )}
                  />
                  {!isCollapsed && <span className="relative z-10 truncate">{item.label}</span>}
                  
                  {/* Tooltip for collapsed mode */}
                  {isCollapsed && (
                    <div className="absolute left-full ml-4 whitespace-nowrap rounded-xl border border-white/15 bg-slate-950/90 px-2.5 py-1.5 text-xs font-semibold text-white opacity-0 shadow-xl backdrop-blur-xl transition duration-150 pointer-events-none group-hover:translate-x-1 group-hover:opacity-100">
                      {item.label}
                    </div>
                  )}
                </NavLink>
              );
            })}
          </div>
        ))}
      </nav>

      {/* User profile section / Logout button */}
      <div className="p-3 border-t border-white/5">
        {!isCollapsed && user && (
          <div className="mb-2 flex items-center gap-3 rounded-xl border border-white/10 bg-white/[0.055] px-2 py-3">
            <div className="flex h-8 w-8 items-center justify-center rounded-xl border border-white/15 bg-white/10 text-sm font-bold text-white">
              {user.name.charAt(0).toUpperCase()}
            </div>
            <div className="flex-1 min-w-0">
              <p className="text-xs font-semibold text-white truncate">{user.name}</p>
              <p className="text-[10px] text-slate-500 truncate">{user.email}</p>
            </div>
          </div>
        )}
        <button
          onClick={() => void handleLogout()}
          className={cn(
            "focus-ring interactive-surface flex items-center gap-3 w-full px-3 py-2.5 rounded-xl text-sm font-medium text-rose-400 hover:bg-rose-500/10 transition cursor-pointer",
            isCollapsed ? "justify-center" : ""
          )}
        >
          <LogOut size={20} />
          {!isCollapsed && <span>Keluar</span>}
        </button>
      </div>
    </aside>
  );
}
