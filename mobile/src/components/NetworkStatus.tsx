import { Ionicons } from '@expo/vector-icons';
import { StyleSheet, Text, View } from 'react-native';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import { useNetworkStatus } from '../contexts/NetworkContext';
import { colors, radii, shadow, spacing } from '../theme';

interface NetworkStatusBadgeProps {
  compact?: boolean;
}

export function NetworkStatusBadge({
  compact = false,
}: NetworkStatusBadgeProps) {
  const { status } = useNetworkStatus();
  const meta = statusMeta(status);

  return (
    <View
      accessibilityLabel={`Koneksi ${meta.label.toLowerCase()}`}
      style={[styles.badge, { borderColor: `${meta.tone}30` }]}
    >
      <View style={[styles.dot, { backgroundColor: meta.tone }]} />
      {!compact ? (
        <Text style={[styles.badgeText, { color: meta.tone }]}>
          {meta.label}
        </Text>
      ) : (
        <Ionicons name={meta.icon} size={14} color={meta.tone} />
      )}
    </View>
  );
}

export function NetworkStatusBanner() {
  const { status, detail } = useNetworkStatus();
  const insets = useSafeAreaInsets();

  if (status !== 'offline') return null;

  return (
    <View
      accessibilityLiveRegion="polite"
      pointerEvents="none"
      style={[styles.banner, { bottom: Math.max(insets.bottom, 12) + 88 }]}
    >
      <Ionicons name="cloud-offline-outline" size={17} color={colors.rose} />
      <View style={styles.bannerCopy}>
        <Text style={styles.bannerTitle}>Mode offline</Text>
        <Text numberOfLines={1} style={styles.bannerDetail}>{detail}</Text>
      </View>
    </View>
  );
}

function statusMeta(status: 'checking' | 'online' | 'offline') {
  if (status === 'online') {
    return {
      label: 'ONLINE',
      tone: colors.emerald,
      icon: 'wifi' as const,
    };
  }
  if (status === 'offline') {
    return {
      label: 'OFFLINE',
      tone: colors.rose,
      icon: 'cloud-offline-outline' as const,
    };
  }
  return {
    label: 'MEMERIKSA',
    tone: colors.cyan,
    icon: 'sync-outline' as const,
  };
}

const styles = StyleSheet.create({
  badge: {
    minHeight: 32,
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'center',
    gap: 6,
    borderRadius: radii.pill,
    borderWidth: 1,
    backgroundColor: colors.surface,
    paddingHorizontal: 10,
  },
  dot: {
    width: 6,
    height: 6,
    borderRadius: 3,
  },
  badgeText: {
    fontSize: 8,
    fontWeight: '900',
    letterSpacing: 0.9,
  },
  banner: {
    ...shadow,
    position: 'absolute',
    left: spacing.xl,
    right: spacing.xl,
    zIndex: 50,
    minHeight: 52,
    flexDirection: 'row',
    alignItems: 'center',
    gap: spacing.md,
    borderRadius: radii.medium,
    borderWidth: 1,
    borderColor: 'rgba(251,113,133,0.30)',
    backgroundColor: 'rgba(39, 16, 28, 0.98)',
    paddingHorizontal: spacing.md,
  },
  bannerCopy: {
    flex: 1,
    minWidth: 0,
  },
  bannerTitle: {
    color: colors.text,
    fontSize: 11,
    fontWeight: '900',
  },
  bannerDetail: {
    marginTop: 2,
    color: colors.textSecondary,
    fontSize: 9,
    fontWeight: '600',
  },
});
