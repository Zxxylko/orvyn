export const colors = {
  background: '#0B0F14',
  surface: '#111827',
  surfaceRaised: '#172033',
  surfaceSoft: '#0F172A',
  border: 'rgba(148, 163, 184, 0.16)',
  borderStrong: 'rgba(148, 163, 184, 0.28)',
  text: '#F8FAFC',
  textSecondary: '#94A3B8',
  textMuted: '#64748B',
  cyan: '#67E8F9',
  cyanStrong: '#22D3EE',
  purple: '#A78BFA',
  pink: '#F472B6',
  emerald: '#6EE7B7',
  amber: '#FCD34D',
  rose: '#FB7185',
  white: '#FFFFFF',
  black: '#020617',
} as const;

export const radii = {
  small: 10,
  medium: 14,
  large: 20,
  pill: 999,
} as const;

export const spacing = {
  xs: 4,
  sm: 8,
  md: 12,
  lg: 16,
  xl: 20,
  xxl: 28,
} as const;

export const shadow = {
  shadowColor: '#000000',
  shadowOffset: { width: 0, height: 10 },
  shadowOpacity: 0.22,
  shadowRadius: 24,
  elevation: 8,
} as const;
