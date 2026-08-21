import type { PropsWithChildren } from 'react';
import { StyleSheet, View } from 'react-native';
import { colors, radii, shadow, spacing } from '../theme';

export function Surface({ children }: PropsWithChildren) {
  return <View style={styles.surface}>{children}</View>;
}

const styles = StyleSheet.create({
  surface: {
    backgroundColor: colors.surface,
    borderColor: colors.border,
    borderWidth: 1,
    borderRadius: radii.large,
    padding: spacing.lg,
    ...shadow,
  },
});
