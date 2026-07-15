import {
  Activity,
  Brain,
  Calendar,
  Compass,
  GraduationCap,
  LayoutDashboard,
  MapPin,
  Wallet,
  type LucideIcon,
} from 'lucide-react';

export interface NavigationItem {
  to: string;
  label: string;
  shortLabel: string;
  icon: LucideIcon;
}

interface NavigationGroup {
  label: string;
  items: NavigationItem[];
}

export const navigationGroups: NavigationGroup[] = [
  {
    label: 'Harian',
    items: [
      { to: '/dashboard', label: 'Beranda', shortLabel: 'Beranda', icon: LayoutDashboard },
      { to: '/student-hub', label: 'Student Hub', shortLabel: 'Hub', icon: Compass },
      { to: '/calendar', label: 'Jadwal Belajar', shortLabel: 'Jadwal', icon: Calendar },
      { to: '/briefing', label: 'Ringkasan Harian', shortLabel: 'Briefing', icon: Brain },
    ],
  },
  {
    label: 'Mahasiswa',
    items: [
      { to: '/academic', label: 'Tugas Kuliah', shortLabel: 'Kuliah', icon: GraduationCap },
      { to: '/campus', label: 'Kampus', shortLabel: 'Kampus', icon: MapPin },
    ],
  },
  {
    label: 'Pribadi',
    items: [
      { to: '/finance', label: 'Uang Bulanan', shortLabel: 'Uang', icon: Wallet },
      { to: '/health', label: 'Kesehatan', shortLabel: 'Sehat', icon: Activity },
    ],
  },
];

export const navigationItems = navigationGroups.flatMap((group) => group.items);
