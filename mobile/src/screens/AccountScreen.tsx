import { Ionicons } from '@expo/vector-icons';
import { useFocusEffect } from '@react-navigation/native';
import { isAxiosError } from 'axios';
import { useCallback, useState } from 'react';
import {
  ActivityIndicator,
  Alert,
  KeyboardAvoidingView,
  Modal,
  Platform,
  Pressable,
  StyleSheet,
  Text,
  TextInput,
  View,
} from 'react-native';
import { NetworkStatusBadge } from '../components/NetworkStatus';
import { Screen } from '../components/Screen';
import { Surface } from '../components/Surface';
import { useAuth } from '../contexts/AuthContext';
import { GOOGLE_LOGIN_ENABLED } from '../lib/auth-config';
import { API_BASE_URL, authApi, getApiErrorMessage } from '../lib/api';
import { whatsappApi } from '../lib/wellbeing-api';
import { colors, radii, spacing } from '../theme';

type RuntimeStatus = 'checking' | 'online' | 'warning' | 'offline' | 'unknown';

interface RuntimeService {
  status: RuntimeStatus;
  detail: string;
}

const initialRuntime: Record<'api' | 'whatsapp' | 'ai', RuntimeService> = {
  api: { status: 'checking', detail: 'Memeriksa koneksi backend…' },
  whatsapp: { status: 'checking', detail: 'Memeriksa service WhatsApp…' },
  ai: { status: 'checking', detail: 'Memeriksa runtime AI…' },
};

export function AccountScreen() {
  const { user, deleteAccount, logout } = useAuth();
  const [runtime, setRuntime] = useState(initialRuntime);
  const [refreshing, setRefreshing] = useState(false);
  const [lastCheckedAt, setLastCheckedAt] = useState<Date | null>(null);
  const [deleteOpen, setDeleteOpen] = useState(false);
  const [deletePhrase, setDeletePhrase] = useState('');
  const [deleting, setDeleting] = useState(false);

  const checkRuntime = useCallback(async (manual = false) => {
    if (manual) setRefreshing(true);

    const [apiResult, integrationResult] = await Promise.allSettled([
      authApi.me(),
      whatsappApi.getState(),
    ]);

    const apiService: RuntimeService = apiResult.status === 'fulfilled'
      ? { status: 'online', detail: API_BASE_URL }
      : isAxiosError(apiResult.reason) && apiResult.reason.response
        ? { status: 'warning', detail: `Server merespons dengan status ${apiResult.reason.response.status}` }
        : { status: 'offline', detail: 'Server tidak dapat dijangkau dari perangkat ini' };

    let whatsappService: RuntimeService;
    let aiService: RuntimeService;
    if (integrationResult.status === 'fulfilled') {
      const { service, settings, ai } = integrationResult.value;
      whatsappService = service.connected
        ? { status: 'online', detail: `Terhubung${service.phone ? ` · ${service.phone}` : ''} · reminder ${settings.enabled ? 'aktif' : 'nonaktif'}` }
        : service.online
          ? { status: 'warning', detail: service.qr ? 'Service online · menunggu pemindaian QR' : `Service online · ${service.status}` }
          : { status: 'offline', detail: `Service tidak aktif · ${service.status}` };

      aiService = ai.online
        ? { status: 'online', detail: `${capitalize(ai.provider)} · ${ai.model ?? 'model aktif'}` }
        : { status: 'offline', detail: `${capitalize(ai.provider || 'Ollama')} belum dapat dijangkau backend` };
    } else {
      const detail = apiService.status === 'offline'
        ? 'Tidak dapat diperiksa karena Laravel API offline'
        : 'Status integrasi belum dapat diambil';
      whatsappService = { status: 'unknown', detail };
      aiService = { status: 'unknown', detail };
    }

    setRuntime({ api: apiService, whatsapp: whatsappService, ai: aiService });
    setLastCheckedAt(new Date());
    setRefreshing(false);
  }, []);

  useFocusEffect(useCallback(() => {
    void checkRuntime();
  }, [checkRuntime]));

  const confirmLogout = () => {
    Alert.alert('Keluar dari ORVYN?', 'Token perangkat akan dihapus dengan aman dari perangkat ini.', [
      { text: 'Batal', style: 'cancel' },
      { text: 'Keluar', style: 'destructive', onPress: () => void logout() },
    ]);
  };

  const permanentlyDeleteAccount = async (provider: 'apple' | 'google') => {
    if (deletePhrase !== 'HAPUS AKUN') return;

    setDeleting(true);
    try {
      await deleteAccount(provider, deletePhrase);
      setDeleteOpen(false);
      setDeletePhrase('');
    } catch (error) {
      Alert.alert('Akun belum dapat dihapus', getApiErrorMessage(error));
    } finally {
      setDeleting(false);
    }
  };

  const refreshAction = (
    <View style={styles.headerActions}>
      <NetworkStatusBadge compact />
      <Pressable accessibilityRole="button" accessibilityLabel="Periksa ulang status layanan" onPress={() => void checkRuntime(true)} disabled={refreshing} style={({ pressed }) => [styles.refreshButton, pressed && styles.pressed, refreshing && styles.disabled]}>
        {refreshing ? <ActivityIndicator size="small" color={colors.cyan} /> : <Ionicons name="refresh" size={19} color={colors.cyan} />}
      </Pressable>
    </View>
  );

  return (
    <Screen eyebrow="STUDENT OS" title="Akun" action={refreshAction} refreshing={refreshing} onRefresh={() => void checkRuntime(true)}>
      <Surface>
        <View style={styles.profileRow}>
          <View style={styles.avatar}><Text style={styles.avatarText}>{user?.name.slice(0, 1).toUpperCase() ?? 'O'}</Text></View>
          <View style={styles.profileCopy}>
            <Text style={styles.name}>{user?.name}</Text>
            <Text style={styles.email}>{user?.email}</Text>
          </View>
          <View style={styles.activeBadge}><View style={styles.activeDot} /><Text style={styles.activeText}>SESI AKTIF</Text></View>
        </View>
      </Surface>

      <View style={styles.sectionHeading}>
        <View>
          <Text style={styles.sectionEyebrow}>KONEKSI</Text>
          <Text style={styles.sectionTitle}>Layanan ORVYN</Text>
        </View>
        <Text style={styles.checkedAt}>{lastCheckedAt ? `Diperiksa ${formatClock(lastCheckedAt)}` : 'Memeriksa…'}</Text>
      </View>

      <Surface>
        <ConnectionRow icon="server-outline" label="Laravel API" detail={runtime.api.detail} tone={colors.cyan} status={runtime.api.status} />
        <View style={styles.separator} />
        <ConnectionRow icon="logo-whatsapp" label="WhatsApp Assistant" detail={runtime.whatsapp.detail} tone={colors.emerald} status={runtime.whatsapp.status} />
        <View style={styles.separator} />
        <ConnectionRow icon="sparkles-outline" label="Ollama AI" detail={runtime.ai.detail} tone={colors.purple} status={runtime.ai.status} />
      </Surface>

      <View>
        <Text style={styles.sectionEyebrow}>KEAMANAN</Text>
        <Text style={styles.sectionTitle}>Perangkat ini</Text>
      </View>

      <Surface>
        <View style={styles.securityRow}>
          <View style={styles.securityIcon}><Ionicons name="shield-checkmark-outline" size={22} color={colors.emerald} /></View>
          <View style={styles.securityCopy}>
            <Text style={styles.securityTitle}>{Platform.OS === 'web' ? 'Sesi browser' : 'Token perangkat aman'}</Text>
            <Text style={styles.securityDetail}>{Platform.OS === 'web' ? 'Token disimpan sementara selama sesi browser dan dihapus saat kamu keluar.' : 'Bearer token tersimpan di Keychain/Keystore perangkat dan dihapus saat kamu keluar.'}</Text>
          </View>
        </View>
      </Surface>

      <Pressable accessibilityRole="button" onPress={confirmLogout} style={({ pressed }) => [styles.logoutButton, pressed && styles.pressed]}>
        <Ionicons name="log-out-outline" size={18} color={colors.rose} />
        <Text style={styles.logoutText}>Keluar dari perangkat ini</Text>
      </Pressable>

      <Pressable
        accessibilityRole="button"
        onPress={() => setDeleteOpen(true)}
        style={({ pressed }) => [styles.deleteButton, pressed && styles.pressed]}
      >
        <Ionicons name="trash-outline" size={18} color={colors.rose} />
        <Text style={styles.deleteText}>Hapus akun dan seluruh data</Text>
      </Pressable>

      <Text style={styles.version}>ORVYN Mobile 1.0.0 · Expo SDK 57</Text>

      <Modal
        animationType="fade"
        onRequestClose={() => !deleting && setDeleteOpen(false)}
        transparent
        visible={deleteOpen}
      >
        <KeyboardAvoidingView
          behavior={Platform.OS === 'ios' ? 'padding' : undefined}
          style={styles.modalBackdrop}
        >
          <View style={styles.deleteDialog}>
            <View style={styles.deleteIcon}>
              <Ionicons name="warning-outline" size={25} color={colors.rose} />
            </View>
            <Text style={styles.deleteTitle}>Hapus akun permanen?</Text>
            <Text style={styles.deleteDescription}>
              Semua tugas, jadwal, kebiasaan, data kesehatan, keuangan, sesi, dan identitas login ORVYN akan dihapus. Tindakan ini tidak dapat dibatalkan.
            </Text>
            <Text style={styles.deleteInstruction}>Ketik HAPUS AKUN untuk melanjutkan.</Text>
            <TextInput
              accessibilityLabel="Konfirmasi hapus akun"
              autoCapitalize="characters"
              autoCorrect={false}
              editable={!deleting}
              onChangeText={setDeletePhrase}
              placeholder="HAPUS AKUN"
              placeholderTextColor={colors.textMuted}
              style={styles.deleteInput}
              value={deletePhrase}
            />

            {GOOGLE_LOGIN_ENABLED ? (
              <>
                <Pressable
                  accessibilityRole="button"
                  disabled={deleting || deletePhrase !== 'HAPUS AKUN'}
                  onPress={() => void permanentlyDeleteAccount('google')}
                  style={({ pressed }) => [
                    styles.confirmDeleteButton,
                    pressed && styles.pressed,
                    (deleting || deletePhrase !== 'HAPUS AKUN') && styles.disabled,
                  ]}
                >
                  {deleting ? <ActivityIndicator color={colors.white} /> : <Ionicons name="logo-google" size={17} color={colors.white} />}
                  <Text style={styles.confirmDeleteText}>Verifikasi Google & hapus</Text>
                </Pressable>

                {Platform.OS === 'ios' ? (
                  <Pressable
                    accessibilityRole="button"
                    disabled={deleting || deletePhrase !== 'HAPUS AKUN'}
                    onPress={() => void permanentlyDeleteAccount('apple')}
                    style={({ pressed }) => [
                      styles.confirmDeleteButton,
                      pressed && styles.pressed,
                      (deleting || deletePhrase !== 'HAPUS AKUN') && styles.disabled,
                    ]}
                  >
                    <Ionicons name="logo-apple" size={18} color={colors.white} />
                    <Text style={styles.confirmDeleteText}>Verifikasi Apple & hapus</Text>
                  </Pressable>
                ) : null}
              </>
            ) : (
              <Text style={styles.deleteUnavailable}>Penghapusan identitas membutuhkan konfigurasi Firebase pada build ini.</Text>
            )}

            <Pressable
              accessibilityRole="button"
              disabled={deleting}
              onPress={() => {
                setDeleteOpen(false);
                setDeletePhrase('');
              }}
              style={styles.cancelDeleteButton}
            >
              <Text style={styles.cancelDeleteText}>Batal</Text>
            </Pressable>
          </View>
        </KeyboardAvoidingView>
      </Modal>
    </Screen>
  );
}

function ConnectionRow({ icon, label, detail, tone, status }: { icon: keyof typeof Ionicons.glyphMap; label: string; detail: string; tone: string; status: RuntimeStatus }) {
  const meta = runtimeStatusMeta(status);
  return (
    <View accessibilityLabel={`${label}, ${meta.label}, ${detail}`} style={styles.connectionRow}>
      <View style={[styles.connectionIcon, { backgroundColor: `${tone}14`, borderColor: `${tone}28` }]}><Ionicons name={icon} size={19} color={tone} /></View>
      <View style={styles.connectionCopy}>
        <View style={styles.connectionTitleRow}>
          <Text style={styles.connectionLabel}>{label}</Text>
          <View style={[styles.statusBadge, { borderColor: `${meta.tone}2E`, backgroundColor: `${meta.tone}10` }]}>
            {status === 'checking' ? <ActivityIndicator size={7} color={meta.tone} /> : <View style={[styles.statusDot, { backgroundColor: meta.tone }]} />}
            <Text style={[styles.statusText, { color: meta.tone }]}>{meta.label}</Text>
          </View>
        </View>
        <Text numberOfLines={2} style={styles.connectionDetail}>{detail}</Text>
      </View>
    </View>
  );
}

function runtimeStatusMeta(status: RuntimeStatus) {
  if (status === 'online') return { label: 'ONLINE', tone: colors.emerald };
  if (status === 'warning') return { label: 'PERHATIAN', tone: colors.amber };
  if (status === 'offline') return { label: 'OFFLINE', tone: colors.rose };
  if (status === 'unknown') return { label: 'UNKNOWN', tone: colors.textMuted };
  return { label: 'MEMERIKSA', tone: colors.cyan };
}

function formatClock(date: Date) {
  return new Intl.DateTimeFormat('id-ID', { hour: '2-digit', minute: '2-digit' }).format(date);
}

function capitalize(value: string) {
  return value ? `${value.charAt(0).toUpperCase()}${value.slice(1)}` : value;
}

const styles = StyleSheet.create({
  headerActions: { flexDirection: 'row', alignItems: 'center', gap: spacing.sm },
  refreshButton: { width: 42, height: 42, alignItems: 'center', justifyContent: 'center', borderRadius: radii.medium, borderWidth: 1, borderColor: colors.border, backgroundColor: colors.surface },
  profileRow: { flexDirection: 'row', alignItems: 'center', gap: spacing.md },
  avatar: { width: 52, height: 52, borderRadius: 16, alignItems: 'center', justifyContent: 'center', backgroundColor: colors.white },
  avatarText: { color: colors.black, fontSize: 20, fontWeight: '900' },
  profileCopy: { flex: 1, minWidth: 0 },
  name: { color: colors.text, fontSize: 16, fontWeight: '800' },
  email: { marginTop: 5, color: colors.textMuted, fontSize: 11, fontWeight: '600' },
  activeBadge: { flexDirection: 'row', alignItems: 'center', gap: 5, borderRadius: radii.pill, borderWidth: 1, borderColor: 'rgba(110,231,183,0.22)', backgroundColor: 'rgba(110,231,183,0.07)', paddingHorizontal: 9, paddingVertical: 6 },
  activeDot: { width: 5, height: 5, borderRadius: 3, backgroundColor: colors.emerald },
  activeText: { color: colors.emerald, fontSize: 7, fontWeight: '900', letterSpacing: 0.7 },
  sectionHeading: { flexDirection: 'row', alignItems: 'flex-end', justifyContent: 'space-between', gap: spacing.md },
  sectionEyebrow: { color: colors.textMuted, fontSize: 9, fontWeight: '900', letterSpacing: 1.5 },
  sectionTitle: { marginTop: 5, color: colors.text, fontSize: 18, fontWeight: '800' },
  checkedAt: { color: colors.textMuted, fontSize: 9, fontWeight: '600' },
  connectionRow: { minHeight: 74, flexDirection: 'row', alignItems: 'center', gap: spacing.md },
  connectionIcon: { width: 40, height: 40, borderRadius: radii.medium, alignItems: 'center', justifyContent: 'center', borderWidth: 1 },
  connectionCopy: { flex: 1, minWidth: 0 },
  connectionTitleRow: { flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between', gap: spacing.sm },
  connectionLabel: { flex: 1, color: colors.text, fontSize: 13, fontWeight: '800' },
  connectionDetail: { marginTop: 5, color: colors.textMuted, fontSize: 9, lineHeight: 13, fontWeight: '600' },
  statusBadge: { minHeight: 23, flexDirection: 'row', alignItems: 'center', gap: 5, borderRadius: radii.pill, borderWidth: 1, paddingHorizontal: 7 },
  statusDot: { width: 5, height: 5, borderRadius: 3 },
  statusText: { fontSize: 7, fontWeight: '900', letterSpacing: 0.5 },
  separator: { height: 1, backgroundColor: colors.border, marginVertical: spacing.sm },
  securityRow: { flexDirection: 'row', gap: spacing.md },
  securityIcon: { width: 42, height: 42, alignItems: 'center', justifyContent: 'center', borderRadius: radii.medium, backgroundColor: 'rgba(110,231,183,0.08)' },
  securityCopy: { flex: 1 },
  securityTitle: { color: colors.text, fontSize: 13, fontWeight: '800' },
  securityDetail: { marginTop: 5, color: colors.textMuted, fontSize: 10, lineHeight: 16, fontWeight: '600' },
  logoutButton: { minHeight: 52, flexDirection: 'row', alignItems: 'center', justifyContent: 'center', gap: spacing.sm, borderRadius: radii.medium, borderWidth: 1, borderColor: 'rgba(251,113,133,0.24)', backgroundColor: 'rgba(251,113,133,0.07)' },
  logoutText: { color: colors.rose, fontSize: 13, fontWeight: '800' },
  deleteButton: { minHeight: 52, flexDirection: 'row', alignItems: 'center', justifyContent: 'center', gap: spacing.sm, borderRadius: radii.medium, borderWidth: 1, borderColor: 'rgba(251,113,133,0.34)', backgroundColor: 'rgba(251,113,133,0.11)' },
  deleteText: { color: colors.rose, fontSize: 13, fontWeight: '800' },
  modalBackdrop: { flex: 1, justifyContent: 'center', padding: spacing.xl, backgroundColor: 'rgba(0,0,0,0.78)' },
  deleteDialog: { borderRadius: 22, borderWidth: 1, borderColor: 'rgba(251,113,133,0.28)', backgroundColor: colors.surface, padding: spacing.xl },
  deleteIcon: { width: 48, height: 48, alignItems: 'center', justifyContent: 'center', alignSelf: 'center', borderRadius: 16, backgroundColor: 'rgba(251,113,133,0.12)' },
  deleteTitle: { marginTop: spacing.md, textAlign: 'center', color: colors.text, fontSize: 19, fontWeight: '900' },
  deleteDescription: { marginTop: spacing.sm, color: colors.textSecondary, fontSize: 12, lineHeight: 19, textAlign: 'center' },
  deleteInstruction: { marginTop: spacing.lg, color: colors.rose, fontSize: 11, fontWeight: '800' },
  deleteInput: { minHeight: 50, marginTop: spacing.sm, borderRadius: radii.medium, borderWidth: 1, borderColor: 'rgba(251,113,133,0.3)', backgroundColor: colors.black, color: colors.text, paddingHorizontal: spacing.md, fontSize: 13, fontWeight: '800', letterSpacing: 0.5 },
  confirmDeleteButton: { minHeight: 48, flexDirection: 'row', alignItems: 'center', justifyContent: 'center', gap: spacing.sm, marginTop: spacing.sm, borderRadius: radii.medium, backgroundColor: '#BE123C' },
  confirmDeleteText: { color: colors.white, fontSize: 12, fontWeight: '900' },
  deleteUnavailable: { marginTop: spacing.md, color: colors.textMuted, fontSize: 10, lineHeight: 16, textAlign: 'center' },
  cancelDeleteButton: { minHeight: 46, alignItems: 'center', justifyContent: 'center', marginTop: spacing.sm },
  cancelDeleteText: { color: colors.textSecondary, fontSize: 12, fontWeight: '800' },
  pressed: { opacity: 0.78, transform: [{ scale: 0.99 }] },
  disabled: { opacity: 0.5 },
  version: { textAlign: 'center', color: colors.textMuted, fontSize: 9, fontWeight: '600' },
});
