import { Ionicons } from '@expo/vector-icons';
import { LinearGradient } from 'expo-linear-gradient';
import { useState } from 'react';
import { ActivityIndicator, Alert, Image, KeyboardAvoidingView, Platform, Pressable, StyleSheet, Text, TextInput, View } from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';
import { AppleLoginButton } from '../components/AppleLoginButton';
import { useAuth } from '../contexts/AuthContext';
import {
  DEMO_LOGIN_ENABLED,
  GOOGLE_LOGIN_ENABLED,
  IS_PRODUCTION_BUILD,
  MANUAL_TOKEN_LOGIN_ENABLED,
} from '../lib/auth-config';
import { API_BASE_URL, getApiErrorMessage } from '../lib/api';
import { SafeAuthError } from '../lib/auth-error';
import { colors, radii, shadow, spacing } from '../theme';

export function LoginScreen() {
  const { appleLogin, googleLogin, demoLogin, loginWithToken, loading } = useAuth();
  const [token, setToken] = useState('');
  const [manualOpen, setManualOpen] = useState(false);

  const run = async (action: () => Promise<void>) => {
    try {
      await action();
    } catch (error) {
      Alert.alert(
        'Belum dapat masuk',
        error instanceof SafeAuthError ? error.message : getApiErrorMessage(error),
      );
    }
  };

  return (
    <LinearGradient colors={[colors.background, '#0E1726', colors.background]} style={styles.gradient}>
      <SafeAreaView style={styles.safeArea}>
        <KeyboardAvoidingView behavior={Platform.OS === 'ios' ? 'padding' : undefined} style={styles.container}>
          <View style={styles.hero}>
            <Image accessible={false} source={require('../../assets/logo-mark.png')} style={styles.logo} />
            <View style={styles.wordmarkRow}>
              <Text style={styles.wordmark}>ORVYN</Text>
              <View style={styles.mobileBadge}><Text style={styles.mobileBadgeText}>MOBILE</Text></View>
            </View>
            <Text style={styles.title}>Student OS yang ikut bergerak bersamamu.</Text>
            <Text style={styles.subtitle}>Tugas, habit, fokus, dan reminder tersedia dalam satu ruang kerja pribadi.</Text>
          </View>

          <View style={styles.card}>
            <View style={styles.cardHeader}>
              <View style={styles.statusDot} />
              <Text style={styles.cardEyebrow}>TERHUBUNG KE ORVYN API</Text>
            </View>

            {GOOGLE_LOGIN_ENABLED ? (
              <Pressable
                accessibilityRole="button"
                accessibilityLabel="Masuk dengan Google"
                onPress={() => void run(googleLogin)}
                disabled={loading}
                style={({ pressed }) => [styles.primaryButton, pressed && styles.buttonPressed, loading && styles.disabled]}
              >
                {loading ? <ActivityIndicator color={colors.black} /> : <Ionicons name="logo-google" size={18} color={colors.black} />}
                <Text style={styles.primaryButtonText}>{loading ? 'Memverifikasi akun...' : 'Masuk dengan Google'}</Text>
              </Pressable>
            ) : null}

            {GOOGLE_LOGIN_ENABLED && Platform.OS === 'ios' ? (
              <AppleLoginButton
                disabled={loading}
                onPress={() => void run(appleLogin)}
              />
            ) : null}

            {DEMO_LOGIN_ENABLED ? (
              <Pressable
                accessibilityRole="button"
                accessibilityLabel="Masuk sebagai Mahasiswa Demo"
                onPress={() => void run(demoLogin)}
                disabled={loading}
                style={({ pressed }) => [styles.diagnosticButton, pressed && styles.buttonPressed, loading && styles.disabled]}
              >
                <Ionicons name="sparkles" size={17} color={colors.textSecondary} />
                <Text style={styles.diagnosticButtonText}>Masuk sebagai Mahasiswa Demo</Text>
              </Pressable>
            ) : null}

            {MANUAL_TOKEN_LOGIN_ENABLED ? (
              <Pressable accessibilityRole="button" accessibilityState={{ expanded: manualOpen }} onPress={() => setManualOpen((value) => !value)} style={styles.secondaryButton}>
                <Ionicons name="key-outline" size={17} color={colors.textSecondary} />
                <Text style={styles.secondaryButtonText}>{manualOpen ? 'Tutup login token' : 'Masuk dengan token Sanctum'}</Text>
                <Ionicons name={manualOpen ? 'chevron-up' : 'chevron-down'} size={16} color={colors.textMuted} />
              </Pressable>
            ) : null}

            {MANUAL_TOKEN_LOGIN_ENABLED && manualOpen ? (
              <View style={styles.manualArea}>
                <TextInput
                  accessibilityLabel="Token Sanctum perangkat"
                  value={token}
                  onChangeText={setToken}
                  placeholder="Tempel token perangkat"
                  placeholderTextColor={colors.textMuted}
                  secureTextEntry
                  autoCapitalize="none"
                  autoCorrect={false}
                  style={styles.input}
                />
                <Pressable
                  accessibilityRole="button"
                  onPress={() => void run(() => loginWithToken(token))}
                  disabled={loading || !token.trim()}
                  style={({ pressed }) => [styles.tokenButton, pressed && styles.buttonPressed, (!token.trim() || loading) && styles.disabled]}
                >
                  <Text style={styles.tokenButtonText}>Verifikasi token</Text>
                </Pressable>
              </View>
            ) : null}

            {!GOOGLE_LOGIN_ENABLED && !DEMO_LOGIN_ENABLED && !MANUAL_TOKEN_LOGIN_ENABLED ? (
              <View style={styles.configurationNotice}>
                <Ionicons name="warning-outline" size={18} color={colors.amber} />
                <Text style={styles.configurationText}>Login belum dikonfigurasi untuk build ini.</Text>
              </View>
            ) : null}

            <View style={styles.securityRow}>
              <Ionicons name="shield-checkmark-outline" size={16} color={colors.emerald} />
              <Text style={styles.securityText}>Identitas diverifikasi Firebase. Sesi ORVYN disimpan terenkripsi di Keychain/Keystore perangkat.</Text>
            </View>
          </View>

          {!IS_PRODUCTION_BUILD ? <Text numberOfLines={2} style={styles.endpoint}>{API_BASE_URL}</Text> : null}
        </KeyboardAvoidingView>
      </SafeAreaView>
    </LinearGradient>
  );
}

const styles = StyleSheet.create({
  gradient: { flex: 1 },
  safeArea: { flex: 1 },
  container: {
    flex: 1,
    justifyContent: 'space-between',
    paddingHorizontal: spacing.xl,
    paddingVertical: spacing.xxl,
  },
  hero: { marginTop: spacing.xxl },
  logo: {
    width: 50,
    height: 50,
    borderRadius: 15,
    marginBottom: spacing.lg,
  },
  wordmarkRow: { flexDirection: 'row', alignItems: 'center', gap: spacing.sm },
  wordmark: { color: colors.text, fontSize: 15, fontWeight: '900', letterSpacing: 2.8 },
  mobileBadge: {
    borderRadius: radii.pill,
    borderColor: 'rgba(103, 232, 249, 0.28)',
    borderWidth: 1,
    backgroundColor: 'rgba(34, 211, 238, 0.1)',
    paddingHorizontal: 8,
    paddingVertical: 3,
  },
  mobileBadgeText: { color: colors.cyan, fontSize: 8, fontWeight: '900', letterSpacing: 1.2 },
  title: {
    maxWidth: 340,
    marginTop: spacing.xl,
    color: colors.text,
    fontSize: 34,
    lineHeight: 40,
    fontWeight: '900',
    letterSpacing: -1.2,
  },
  subtitle: {
    maxWidth: 330,
    marginTop: spacing.md,
    color: colors.textSecondary,
    fontSize: 15,
    lineHeight: 23,
    fontWeight: '500',
  },
  card: {
    backgroundColor: 'rgba(17, 24, 39, 0.96)',
    borderColor: colors.border,
    borderWidth: 1,
    borderRadius: 22,
    padding: spacing.lg,
    ...shadow,
  },
  cardHeader: { flexDirection: 'row', alignItems: 'center', gap: spacing.sm, marginBottom: spacing.lg },
  statusDot: { width: 7, height: 7, borderRadius: 4, backgroundColor: colors.cyan },
  cardEyebrow: { color: colors.textMuted, fontSize: 9, fontWeight: '900', letterSpacing: 1.5 },
  primaryButton: {
    minHeight: 52,
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'center',
    gap: spacing.sm,
    borderRadius: radii.medium,
    backgroundColor: colors.white,
  },
  primaryButtonText: { color: colors.black, fontSize: 14, fontWeight: '800' },
  diagnosticButton: {
    minHeight: 48,
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'center',
    gap: spacing.sm,
    marginTop: spacing.sm,
    borderRadius: radii.medium,
    borderColor: colors.borderStrong,
    borderWidth: 1,
    backgroundColor: colors.surfaceRaised,
  },
  diagnosticButtonText: { color: colors.textSecondary, fontSize: 13, fontWeight: '700' },
  secondaryButton: {
    minHeight: 48,
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'center',
    gap: spacing.sm,
    marginTop: spacing.sm,
  },
  secondaryButtonText: { flex: 1, color: colors.textSecondary, fontSize: 13, fontWeight: '700' },
  manualArea: { gap: spacing.sm, marginTop: spacing.sm },
  input: {
    minHeight: 50,
    borderRadius: radii.medium,
    borderColor: colors.borderStrong,
    borderWidth: 1,
    backgroundColor: colors.black,
    color: colors.text,
    paddingHorizontal: spacing.md,
    fontSize: 13,
  },
  tokenButton: {
    minHeight: 46,
    alignItems: 'center',
    justifyContent: 'center',
    borderRadius: radii.medium,
    borderColor: colors.borderStrong,
    borderWidth: 1,
    backgroundColor: colors.surfaceRaised,
  },
  tokenButtonText: { color: colors.text, fontSize: 13, fontWeight: '800' },
  configurationNotice: {
    minHeight: 52,
    flexDirection: 'row',
    alignItems: 'center',
    gap: spacing.sm,
    paddingHorizontal: spacing.md,
    borderRadius: radii.medium,
    borderColor: 'rgba(251, 191, 36, 0.28)',
    borderWidth: 1,
    backgroundColor: 'rgba(251, 191, 36, 0.08)',
  },
  configurationText: { flex: 1, color: colors.textSecondary, fontSize: 12, lineHeight: 18, fontWeight: '700' },
  securityRow: { flexDirection: 'row', alignItems: 'center', gap: spacing.sm, marginTop: spacing.md },
  securityText: { flex: 1, color: colors.textMuted, fontSize: 10, lineHeight: 15, fontWeight: '600' },
  endpoint: { textAlign: 'center', color: colors.textMuted, fontSize: 9, lineHeight: 13 },
  buttonPressed: { opacity: 0.82, transform: [{ scale: 0.99 }] },
  disabled: { opacity: 0.5 },
});
