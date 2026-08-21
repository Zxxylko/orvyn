import { Ionicons } from '@expo/vector-icons';
import { useFocusEffect } from '@react-navigation/native';
import * as Haptics from 'expo-haptics';
import { type ReactNode, useCallback, useState } from 'react';
import { ActivityIndicator, Alert, Image, Pressable, StyleSheet, Text, TextInput, View } from 'react-native';
import { Screen } from '../components/Screen';
import { Surface } from '../components/Surface';
import { getApiErrorMessage } from '../lib/api';
import {
  normalizeWhatsAppSettings,
  whatsappApi,
  type ReminderSchedule,
  type WhatsAppFeatureKey,
  type WhatsAppIntegrationState,
  type WhatsAppSettings,
} from '../lib/wellbeing-api';
import { colors, radii, spacing } from '../theme';

const TIMEZONES = [
  { value: 'Asia/Jakarta', label: 'WIB' },
  { value: 'Asia/Makassar', label: 'WITA' },
  { value: 'Asia/Jayapura', label: 'WIT' },
] as const;

const DEADLINE_OPTIONS = [
  { value: 10080, label: '7 hari' },
  { value: 2880, label: '2 hari' },
  { value: 1440, label: '1 hari' },
  { value: 720, label: '12 jam' },
  { value: 360, label: '6 jam' },
  { value: 180, label: '3 jam' },
  { value: 60, label: '1 jam' },
  { value: 30, label: '30 menit' },
] as const;

const WEEKDAYS = [
  { value: 1, label: 'Sen' },
  { value: 2, label: 'Sel' },
  { value: 3, label: 'Rab' },
  { value: 4, label: 'Kam' },
  { value: 5, label: 'Jum' },
  { value: 6, label: 'Sab' },
  { value: 7, label: 'Min' },
] as const;

const CHAT_FEATURES: Array<{
  key: WhatsAppFeatureKey;
  label: string;
  description: string;
  icon: keyof typeof Ionicons.glyphMap;
}> = [
  { key: 'task_capture', label: 'Input tugas via chat', description: 'Buat tugas dengan bahasa natural.', icon: 'chatbox-ellipses-outline' },
  { key: 'quick_actions', label: 'Quick actions', description: 'Selesai, tunda, mulai, dan cek prioritas.', icon: 'flash-outline' },
  { key: 'campus_updates', label: 'Update kampus', description: 'Perubahan kelas, ruangan, atau jadwal.', icon: 'school-outline' },
  { key: 'finance_logging', label: 'Catat pengeluaran', description: 'Log transaksi singkat dari chat.', icon: 'wallet-outline' },
];

const INITIAL_SETTINGS = normalizeWhatsAppSettings({});

export function WhatsAppSettingsScreen() {
  const [integration, setIntegration] = useState<WhatsAppIntegrationState | null>(null);
  const [settings, setSettings] = useState<WhatsAppSettings>(INITIAL_SETTINGS);
  const [consent, setConsent] = useState(false);
  const [loading, setLoading] = useState(true);
  const [refreshing, setRefreshing] = useState(false);
  const [saving, setSaving] = useState(false);
  const [connecting, setConnecting] = useState(false);
  const [testing, setTesting] = useState(false);
  const [verificationCode, setVerificationCode] = useState('');
  const [verificationRequested, setVerificationRequested] = useState(false);
  const [requestingVerification, setRequestingVerification] = useState(false);
  const [confirmingVerification, setConfirmingVerification] = useState(false);

  const load = useCallback(async ({ quiet = false, fromRefresh = false } = {}) => {
    if (!quiet) {
      if (fromRefresh) setRefreshing(true);
      else setLoading(true);
    }

    try {
      const next = await whatsappApi.getState();
      setIntegration(next);
      if (!quiet) {
        setSettings(next.settings);
        setConsent(next.settings.consented);
        setVerificationCode('');
        setVerificationRequested(false);
      }
    } catch (error) {
      if (!quiet) Alert.alert('WhatsApp belum dapat dimuat', getApiErrorMessage(error));
    } finally {
      if (!quiet) {
        setLoading(false);
        setRefreshing(false);
      }
    }
  }, []);

  useFocusEffect(useCallback(() => {
    void load();
    const timer = setInterval(() => void load({ quiet: true }), 4_500);
    return () => clearInterval(timer);
  }, [load]));

  const updateSchedule = <Key extends keyof ReminderSchedule>(key: Key, value: ReminderSchedule[Key]) => {
    setSettings((current) => ({
      ...current,
      reminder_schedule: { ...current.reminder_schedule, [key]: value },
    }));
  };

  const toggleFeature = (key: WhatsAppFeatureKey) => {
    setSettings((current) => ({
      ...current,
      features: { ...current.features, [key]: !current.features[key] },
    }));
  };

  const toggleDeadlineLead = (minutes: number) => {
    const current = settings.reminder_schedule.deadline_lead_minutes;
    if (current.includes(minutes) && current.length === 1) {
      Alert.alert('Reminder diperlukan', 'Pilih minimal satu tahap reminder deadline.');
      return;
    }
    const next = current.includes(minutes)
      ? current.filter((value) => value !== minutes)
      : [...current, minutes];
    updateSchedule('deadline_lead_minutes', next.sort((first, second) => second - first));
  };

  const updatePhoneNumber = (value: string) => {
    setVerificationCode('');
    setVerificationRequested(false);
    setSettings((current) => {
      const changed = value !== (current.phone_number ?? '');
      return {
        ...current,
        phone_number: value,
        verified: changed ? false : current.verified,
        verification_expires_at: changed ? null : current.verification_expires_at,
        enabled: changed ? false : current.enabled,
      };
    });
  };

  const toggleEnabled = () => {
    if (!settings.enabled && !settings.verified) {
      Alert.alert('Verifikasi nomor diperlukan', 'Kirim dan konfirmasi kode 6 digit sebelum mengaktifkan integrasi WhatsApp.');
      return;
    }
    setSettings((current) => ({ ...current, enabled: !current.enabled }));
  };

  const syncVerificationState = (next: WhatsAppIntegrationState) => {
    setIntegration(next);
    setSettings((current) => ({
      ...current,
      phone_number: next.settings.phone_number,
      verified: next.settings.verified,
      verification_expires_at: next.settings.verification_expires_at,
      enabled: next.settings.enabled,
    }));
    setConsent((current) => next.settings.consented || current);
    setVerificationRequested(!next.settings.verified && !next.settings.verification_expires_at);
  };

  const refreshVerificationState = async () => {
    const next = await whatsappApi.getState();
    syncVerificationState(next);
  };

  const requestVerification = async () => {
    const phone = settings.phone_number?.trim() ?? '';
    if (!isValidPhoneNumber(phone)) {
      Alert.alert('Nomor belum valid', 'Masukkan 8–15 digit nomor WhatsApp, termasuk kode negara bila diperlukan.');
      return;
    }

    setRequestingVerification(true);
    try {
      await whatsappApi.requestVerification({ phone_number: phone });
      setSettings((current) => ({
        ...current,
        phone_number: phone,
        verified: false,
        verification_expires_at: null,
        enabled: false,
      }));
      setVerificationCode('');
      setVerificationRequested(true);
      try {
        await refreshVerificationState();
      } catch {
        // Request already succeeded; the next screen refresh will retrieve the expiry.
      }
      await Haptics.notificationAsync(Haptics.NotificationFeedbackType.Success);
      Alert.alert('Kode dikirim', 'Masukkan kode 6 digit yang dikirim ke nomor WhatsApp tersebut.');
    } catch (error) {
      Alert.alert('Kode belum dapat dikirim', getApiErrorMessage(error));
    } finally {
      setRequestingVerification(false);
    }
  };

  const confirmVerification = async () => {
    if (!/^\d{6}$/.test(verificationCode)) {
      Alert.alert('Kode belum lengkap', 'Masukkan tepat 6 digit kode verifikasi.');
      return;
    }

    setConfirmingVerification(true);
    try {
      await whatsappApi.confirmVerification({ code: verificationCode });
      setSettings((current) => ({
        ...current,
        verified: true,
        verification_expires_at: null,
      }));
      setVerificationRequested(false);
      setVerificationCode('');
      try {
        await refreshVerificationState();
      } catch {
        // Confirmation already succeeded; preserve the verified local state.
      }
      await Haptics.notificationAsync(Haptics.NotificationFeedbackType.Success);
      Alert.alert('Nomor terverifikasi', 'Integrasi WhatsApp sekarang dapat diaktifkan.');
    } catch (error) {
      Alert.alert('Kode tidak dapat dikonfirmasi', getApiErrorMessage(error, 'Periksa kode lalu coba kembali.'));
    } finally {
      setConfirmingVerification(false);
    }
  };

  const save = async () => {
    const phone = settings.phone_number?.trim() || null;
    const hasConsent = settings.consented || consent;
    if (settings.enabled && !phone) {
      Alert.alert('Nomor WhatsApp diperlukan', 'Isi nomor sebelum mengaktifkan integrasi.');
      return;
    }
    if (settings.enabled && !settings.verified) {
      Alert.alert('Verifikasi nomor diperlukan', 'Konfirmasi kode 6 digit sebelum mengaktifkan integrasi WhatsApp.');
      return;
    }
    if (settings.enabled && !hasConsent) {
      Alert.alert('Persetujuan diperlukan', 'Setujui pesan WhatsApp dari ORVYN sebelum mengaktifkan integrasi.');
      return;
    }
    if (!isValidSchedule(settings.reminder_schedule)) {
      Alert.alert('Jadwal belum valid', 'Gunakan format jam 24 jam HH:MM untuk semua jadwal reminder.');
      return;
    }

    setSaving(true);
    try {
      const schedule = settings.reminder_schedule;
      const next = await whatsappApi.updateSettings({
        phone_number: phone,
        enabled: settings.enabled,
        timezone: settings.timezone,
        daily_briefing_time: schedule.daily_briefing_time,
        reminder_lead_minutes: Math.max(...schedule.deadline_lead_minutes),
        reminder_schedule: schedule,
        features: settings.features,
        consent: !settings.consented && consent ? true : undefined,
      });
      setSettings(next);
      setConsent(next.consented);
      setIntegration((current) => current ? { ...current, settings: next } : current);
      await Haptics.notificationAsync(Haptics.NotificationFeedbackType.Success);
      Alert.alert('Tersimpan', 'Preferensi WhatsApp sudah diperbarui.');
    } catch (error) {
      Alert.alert('Preferensi belum disimpan', getApiErrorMessage(error));
    } finally {
      setSaving(false);
    }
  };

  const connect = async () => {
    setConnecting(true);
    try {
      const result = await whatsappApi.connect();
      setIntegration((current) => current ? {
        ...current,
        service: { ...current.service, ...result, online: true },
      } : current);
      await Haptics.impactAsync(Haptics.ImpactFeedbackStyle.Medium);
      await load({ quiet: true });
      Alert.alert('Sesi dimulai', result.connected ? 'WhatsApp sudah terhubung.' : 'QR pairing akan muncul otomatis saat siap.');
    } catch (error) {
      Alert.alert('Belum dapat terhubung', getApiErrorMessage(error, 'Service WhatsApp belum dapat dihubungi.'));
    } finally {
      setConnecting(false);
    }
  };

  const sendTest = async () => {
    setTesting(true);
    try {
      const message = await whatsappApi.sendTest();
      await Haptics.notificationAsync(Haptics.NotificationFeedbackType.Success);
      Alert.alert('Pesan uji dikirim', message);
    } catch (error) {
      Alert.alert('Pesan uji gagal', getApiErrorMessage(error));
    } finally {
      setTesting(false);
    }
  };

  const service = integration?.service;
  const status = serviceStatus(service);
  const verificationPending = !settings.verified
    && (verificationRequested || isFutureTimestamp(settings.verification_expires_at));
  const verificationExpired = !settings.verified
    && Boolean(settings.verification_expires_at)
    && !isFutureTimestamp(settings.verification_expires_at);
  const verificationBusy = requestingVerification || confirmingVerification;
  const headerAction = (
    <Pressable
      accessibilityRole="button"
      accessibilityLabel="Segarkan status WhatsApp"
      onPress={() => void load({ fromRefresh: true })}
      disabled={refreshing}
      style={({ pressed }) => [styles.headerButton, pressed && styles.pressed, refreshing && styles.disabled]}
    >
      {refreshing ? <ActivityIndicator size="small" color={colors.cyan} /> : <Ionicons name="refresh" size={19} color={colors.cyan} />}
    </Pressable>
  );

  return (
    <Screen
      eyebrow="INTEGRATION"
      title="WhatsApp Assistant"
      action={headerAction}
      refreshing={refreshing}
      onRefresh={() => void load({ fromRefresh: true })}
    >
      {loading && !integration ? (
        <Surface>
          <View style={styles.loadingState}>
            <ActivityIndicator color={colors.emerald} />
            <Text style={styles.loadingText}>Memeriksa koneksi WhatsApp…</Text>
          </View>
        </Surface>
      ) : null}

      {integration ? (
        <View style={styles.statusGrid}>
          <StatusCard
            icon="logo-whatsapp"
            title={status.label}
            detail={service?.phone ? `Sesi +${service.phone.replace(/^\+/, '')}` : `Status server: ${service?.status ?? 'unknown'}`}
            tone={status.tone}
            active={Boolean(service?.connected)}
          />
          <StatusCard
            icon="sparkles-outline"
            title={`${integration.ai.provider} · ${integration.ai.online ? 'online' : 'fallback'}`}
            detail={integration.ai.model || 'Model belum terdeteksi'}
            tone={integration.ai.online ? colors.purple : colors.textMuted}
            active={integration.ai.online}
          />
        </View>
      ) : null}

      {service?.qr && !service.connected ? (
        <Surface>
          <View style={styles.qrHeader}>
            <View style={styles.qrHeaderIcon}><Ionicons name="qr-code-outline" size={20} color={colors.cyan} /></View>
            <View style={styles.qrHeaderCopy}>
              <Text style={styles.qrTitle}>Scan QR pairing</Text>
              <Text style={styles.qrStatus}>Status backend: {service.status}</Text>
            </View>
          </View>
          <View style={styles.qrWrap}>
            <Image accessibilityLabel="QR pairing WhatsApp" source={{ uri: service.qr }} resizeMode="contain" style={styles.qrImage} />
          </View>
          <Text style={styles.qrHelp}>Buka WhatsApp → Perangkat tertaut → Tautkan perangkat. Jika ORVYN dibuka di ponsel yang sama, tampilkan QR ini di perangkat kedua.</Text>
        </Surface>
      ) : null}

      <Surface>
        <View style={styles.sectionHeader}>
          <View>
            <Text style={styles.sectionEyebrow}>AKUN & IZIN</Text>
            <Text style={styles.sectionTitle}>Koneksi personal</Text>
          </View>
          <Pressable
            accessibilityRole="switch"
            accessibilityLabel="Aktifkan integrasi WhatsApp"
            accessibilityState={{ checked: settings.enabled }}
            accessibilityHint={settings.verified ? 'Mengaktifkan atau menonaktifkan integrasi' : 'Verifikasi nomor terlebih dahulu'}
            onPress={toggleEnabled}
            style={({ pressed }) => [
              styles.enabledPill,
              settings.enabled && styles.enabledPillActive,
              !settings.verified && !settings.enabled && styles.disabled,
              pressed && styles.pressed,
            ]}
          >
            <View style={[styles.enabledDot, settings.enabled && styles.enabledDotActive]} />
            <Text style={[styles.enabledText, settings.enabled && styles.enabledTextActive]}>{settings.enabled ? 'AKTIF' : 'NONAKTIF'}</Text>
          </Pressable>
        </View>

        <Field label="Nomor WhatsApp" hint="Format Indonesia atau internasional.">
          <TextInput
            accessibilityLabel="Nomor WhatsApp"
            value={settings.phone_number ?? ''}
            onChangeText={updatePhoneNumber}
            keyboardType="phone-pad"
            placeholder="0812 3456 7890"
            placeholderTextColor={colors.textMuted}
            maxLength={24}
            style={[styles.input, settings.verified && styles.inputVerified]}
          />
        </Field>

        <View style={[
          styles.verificationCard,
          settings.verified && styles.verificationCardVerified,
          verificationExpired && styles.verificationCardExpired,
        ]}>
          <View style={styles.verificationStatusRow}>
            <View style={[
              styles.verificationIcon,
              settings.verified && styles.verificationIconVerified,
            ]}>
              <Ionicons
                name={settings.verified ? 'shield-checkmark-outline' : 'key-outline'}
                size={18}
                color={settings.verified ? colors.emerald : verificationExpired ? colors.amber : colors.cyan}
              />
            </View>
            <View style={styles.verificationCopy}>
              <Text style={[
                styles.verificationTitle,
                settings.verified && styles.verificationTitleVerified,
              ]}>
                {settings.verified
                  ? 'Nomor terverifikasi'
                  : verificationPending
                    ? 'Kode menunggu konfirmasi'
                    : verificationExpired
                      ? 'Kode sudah kedaluwarsa'
                      : 'Nomor belum terverifikasi'}
              </Text>
              <Text style={styles.verificationDetail}>
                {settings.verified
                  ? 'Nomor ini dapat digunakan untuk automasi ORVYN.'
                  : verificationPending && settings.verification_expires_at
                    ? `Kode berlaku sampai ${formatTimestamp(settings.verification_expires_at)}.`
                    : verificationExpired
                      ? 'Kirim kode baru untuk melanjutkan.'
                      : 'Verifikasi 6 digit diperlukan sebelum integrasi dapat diaktifkan.'}
              </Text>
            </View>
          </View>

          {!settings.verified ? (
            <Pressable
              accessibilityRole="button"
              accessibilityLabel={verificationPending || verificationExpired ? 'Kirim ulang kode verifikasi WhatsApp' : 'Kirim kode verifikasi WhatsApp'}
              onPress={() => void requestVerification()}
              disabled={verificationBusy}
              style={({ pressed }) => [
                styles.verificationRequestButton,
                pressed && styles.pressed,
                verificationBusy && styles.disabled,
              ]}
            >
              {requestingVerification
                ? <ActivityIndicator size="small" color={colors.black} />
                : <Ionicons name="chatbubble-ellipses-outline" size={16} color={colors.black} />}
              <Text style={styles.verificationRequestText}>
                {verificationPending || verificationExpired ? 'Kirim ulang kode' : 'Kirim kode 6 digit'}
              </Text>
            </Pressable>
          ) : null}

          {verificationPending ? (
            <View style={styles.verificationForm}>
              <Text style={styles.verificationCodeLabel}>Kode verifikasi</Text>
              <View style={styles.verificationCodeRow}>
                <TextInput
                  accessibilityLabel="Kode verifikasi WhatsApp 6 digit"
                  value={verificationCode}
                  onChangeText={(value) => setVerificationCode(value.replace(/\D/g, '').slice(0, 6))}
                  keyboardType="number-pad"
                  textContentType="oneTimeCode"
                  secureTextEntry
                  maxLength={6}
                  placeholder="••••••"
                  placeholderTextColor={colors.textMuted}
                  style={styles.verificationCodeInput}
                />
                <Pressable
                  accessibilityRole="button"
                  accessibilityLabel="Konfirmasi kode verifikasi WhatsApp"
                  onPress={() => void confirmVerification()}
                  disabled={confirmingVerification || verificationCode.length !== 6}
                  style={({ pressed }) => [
                    styles.verificationConfirmButton,
                    pressed && styles.pressed,
                    (confirmingVerification || verificationCode.length !== 6) && styles.disabled,
                  ]}
                >
                  {confirmingVerification
                    ? <ActivityIndicator size="small" color={colors.black} />
                    : <Ionicons name="checkmark-circle-outline" size={17} color={colors.black} />}
                  <Text style={styles.verificationConfirmText}>Konfirmasi</Text>
                </Pressable>
              </View>
            </View>
          ) : null}
        </View>

        <View style={styles.fieldGroup}>
          <Text style={styles.fieldLabel}>Timezone</Text>
          <View style={styles.segmentRow}>
            {TIMEZONES.map((timezone) => {
              const selected = settings.timezone === timezone.value;
              return (
                <Pressable
                  key={timezone.value}
                  accessibilityRole="button"
                  accessibilityState={{ selected }}
                  onPress={() => setSettings((current) => ({ ...current, timezone: timezone.value }))}
                  style={({ pressed }) => [styles.segment, selected && styles.segmentSelected, pressed && styles.pressed]}
                >
                  <Text style={[styles.segmentText, selected && styles.segmentTextSelected]}>{timezone.label}</Text>
                </Pressable>
              );
            })}
          </View>
          <Text style={styles.timezoneDetail}>{settings.timezone}</Text>
        </View>

        <Pressable
          accessibilityRole="checkbox"
          accessibilityLabel="Persetujuan menerima pesan WhatsApp dari ORVYN"
          accessibilityState={{ checked: settings.consented || consent, disabled: settings.consented }}
          disabled={settings.consented}
          onPress={() => setConsent((current) => !current)}
          style={({ pressed }) => [styles.consentRow, pressed && styles.pressed, settings.consented && styles.consentRecorded]}
        >
          <View style={[styles.checkbox, (settings.consented || consent) && styles.checkboxChecked]}>
            {settings.consented || consent ? <Ionicons name="checkmark" size={14} color={colors.black} /> : null}
          </View>
          <View style={styles.consentCopy}>
            <Text style={styles.consentTitle}>{settings.consented ? 'Persetujuan sudah tercatat' : 'Saya menyetujui pesan dari ORVYN'}</Text>
            <Text style={styles.consentText}>Nomor hanya digunakan untuk fitur yang dipilih. Integrasi dapat dinonaktifkan kapan saja.</Text>
          </View>
        </Pressable>
      </Surface>

      <View style={styles.sectionHeaderOutside}>
        <View>
          <Text style={styles.sectionEyebrow}>REMINDER</Text>
          <Text style={styles.sectionTitle}>Jadwal otomatis</Text>
        </View>
        <Text style={styles.sectionMeta}>{settings.timezone}</Text>
      </View>

      <ScheduleCard
        icon="sunny-outline"
        title="Briefing harian"
        description="Prioritas, deadline, dan jadwal setiap pagi."
        active={settings.features.daily_briefing}
        onToggle={() => toggleFeature('daily_briefing')}
      >
        <TimeInput label="Jam briefing" value={settings.reminder_schedule.daily_briefing_time} onChangeText={(value) => updateSchedule('daily_briefing_time', value)} />
      </ScheduleCard>

      <ScheduleCard
        icon="chatbubble-ellipses-outline"
        title="Check-in progres"
        description="Menanyakan progres tugas yang sedang dikerjakan."
        active={settings.features.progress_checkins}
        onToggle={() => toggleFeature('progress_checkins')}
      >
        <TimeInput label="Jam check-in" value={settings.reminder_schedule.progress_checkin_time} onChangeText={(value) => updateSchedule('progress_checkin_time', value)} />
      </ScheduleCard>

      <ScheduleCard
        icon="shield-outline"
        title="Burnout guard"
        description="Check-in saat beban aktif atau tugas terlambat tinggi."
        active={settings.features.burnout_checkins}
        onToggle={() => toggleFeature('burnout_checkins')}
      >
        <TimeInput label="Jam pemeriksaan" value={settings.reminder_schedule.burnout_checkin_time} onChangeText={(value) => updateSchedule('burnout_checkin_time', value)} />
      </ScheduleCard>

      <ScheduleCard
        icon="heart-outline"
        title="Habit & kesehatan"
        description="Mengingatkan habit dan health log yang belum dicatat."
        active={settings.features.habit_health}
        onToggle={() => toggleFeature('habit_health')}
      >
        <TimeInput label="Jam check-in" value={settings.reminder_schedule.habit_checkin_time} onChangeText={(value) => updateSchedule('habit_checkin_time', value)} />
      </ScheduleCard>

      <ScheduleCard
        icon="calendar-outline"
        title="Review mingguan"
        description="Rekap tugas selesai, fokus, dan pekerjaan tertunda."
        active={settings.features.weekly_review}
        onToggle={() => toggleFeature('weekly_review')}
      >
        <Text style={styles.miniLabel}>Hari review</Text>
        <View style={styles.weekdayRow}>
          {WEEKDAYS.map((day) => {
            const selected = settings.reminder_schedule.weekly_review_day === day.value;
            return (
              <Pressable key={day.value} accessibilityRole="button" accessibilityState={{ selected }} onPress={() => updateSchedule('weekly_review_day', day.value)} style={({ pressed }) => [styles.weekday, selected && styles.weekdaySelected, pressed && styles.pressed]}>
                <Text style={[styles.weekdayText, selected && styles.weekdayTextSelected]}>{day.label}</Text>
              </Pressable>
            );
          })}
        </View>
        <TimeInput label="Jam review" value={settings.reminder_schedule.weekly_review_time} onChangeText={(value) => updateSchedule('weekly_review_time', value)} />
      </ScheduleCard>

      <ScheduleCard
        icon="notifications-outline"
        title="Reminder deadline bertahap"
        description="Pilih satu atau beberapa tahap sebelum jatuh tempo."
        active={settings.features.deadline_reminders}
        onToggle={() => toggleFeature('deadline_reminders')}
      >
        <View style={styles.deadlineWrap}>
          {DEADLINE_OPTIONS.map((option) => {
            const selected = settings.reminder_schedule.deadline_lead_minutes.includes(option.value);
            return (
              <Pressable key={option.value} accessibilityRole="button" accessibilityState={{ selected }} onPress={() => toggleDeadlineLead(option.value)} style={({ pressed }) => [styles.deadlineChip, selected && styles.deadlineChipSelected, pressed && styles.pressed]}>
                <Text style={[styles.deadlineText, selected && styles.deadlineTextSelected]}>{option.label}</Text>
              </Pressable>
            );
          })}
        </View>
      </ScheduleCard>

      <View style={styles.sectionHeaderOutside}>
        <View>
          <Text style={styles.sectionEyebrow}>CHAT ACCESS</Text>
          <Text style={styles.sectionTitle}>Perintah yang diizinkan</Text>
        </View>
      </View>

      <Surface>
        <View style={styles.featureList}>
          {CHAT_FEATURES.map((feature, index) => (
            <View key={feature.key}>
              {index > 0 ? <View style={styles.separator} /> : null}
              <FeatureRow
                icon={feature.icon}
                title={feature.label}
                description={feature.description}
                active={settings.features[feature.key]}
                onToggle={() => toggleFeature(feature.key)}
              />
            </View>
          ))}
        </View>
      </Surface>

      <Surface>
        <View style={styles.activityHeader}>
          <Ionicons name="pulse-outline" size={18} color={colors.emerald} />
          <Text style={styles.sectionTitle}>Aktivitas terakhir</Text>
        </View>
        <View style={styles.activityRow}>
          <Text style={styles.activityLabel}>Pesan masuk</Text>
          <Text style={styles.activityValue}>{formatTimestamp(settings.last_inbound_at)}</Text>
        </View>
        <View style={styles.separator} />
        <View style={styles.activityRow}>
          <Text style={styles.activityLabel}>Pesan keluar</Text>
          <Text style={styles.activityValue}>{formatTimestamp(settings.last_outbound_at)}</Text>
        </View>
      </Surface>

      <View style={styles.actionRow}>
        <ActionButton icon="link-outline" label="Hubungkan" busy={connecting} disabled={connecting} onPress={() => void connect()} />
        <ActionButton icon="send-outline" label="Tes pesan" busy={testing} disabled={testing || !settings.enabled || !settings.verified} onPress={() => void sendTest()} />
      </View>
      <Pressable accessibilityRole="button" onPress={() => void save()} disabled={saving} style={({ pressed }) => [styles.saveButton, pressed && styles.pressed, saving && styles.disabled]}>
        {saving ? <ActivityIndicator color={colors.black} /> : <Ionicons name="save-outline" size={18} color={colors.black} />}
        <Text style={styles.saveButtonText}>Simpan preferensi</Text>
      </Pressable>
    </Screen>
  );
}

function StatusCard({
  icon,
  title,
  detail,
  tone,
  active,
}: {
  icon: keyof typeof Ionicons.glyphMap;
  title: string;
  detail: string;
  tone: string;
  active: boolean;
}) {
  return (
    <View style={styles.statusCard}>
      <View style={[styles.statusIcon, { backgroundColor: `${tone}14`, borderColor: `${tone}28` }]}><Ionicons name={icon} size={20} color={tone} /></View>
      <View style={styles.statusCopy}>
        <Text style={styles.statusTitle} numberOfLines={1}>{title}</Text>
        <Text style={styles.statusDetail} numberOfLines={2}>{detail}</Text>
      </View>
      <View style={[styles.statusDot, { backgroundColor: active ? colors.emerald : colors.textMuted }]} />
    </View>
  );
}

function Field({ label, hint, children }: { label: string; hint?: string; children: ReactNode }) {
  return (
    <View style={styles.fieldGroup}>
      <Text style={styles.fieldLabel}>{label}</Text>
      {children}
      {hint ? <Text style={styles.fieldHint}>{hint}</Text> : null}
    </View>
  );
}

function ScheduleCard({
  icon,
  title,
  description,
  active,
  onToggle,
  children,
}: {
  icon: keyof typeof Ionicons.glyphMap;
  title: string;
  description: string;
  active: boolean;
  onToggle: () => void;
  children: ReactNode;
}) {
  return (
    <Surface>
      <View style={styles.scheduleHeader}>
        <View style={[styles.scheduleIcon, active && styles.scheduleIconActive]}><Ionicons name={icon} size={18} color={active ? colors.cyan : colors.textMuted} /></View>
        <View style={styles.scheduleCopy}>
          <Text style={styles.scheduleTitle}>{title}</Text>
          <Text style={styles.scheduleDescription}>{description}</Text>
        </View>
        <Pressable accessibilityRole="switch" accessibilityLabel={title} accessibilityState={{ checked: active }} onPress={onToggle} style={({ pressed }) => [styles.switchTrack, active && styles.switchTrackActive, pressed && styles.pressed]}>
          <View style={[styles.switchThumb, active && styles.switchThumbActive]} />
        </Pressable>
      </View>
      <View style={[styles.scheduleBody, !active && styles.scheduleBodyDisabled]} pointerEvents={active ? 'auto' : 'none'}>
        {children}
      </View>
    </Surface>
  );
}

function TimeInput({ label, value, onChangeText }: { label: string; value: string; onChangeText: (value: string) => void }) {
  return (
    <View style={styles.timeRow}>
      <Text style={styles.timeLabel}>{label}</Text>
      <TextInput
        accessibilityLabel={label}
        value={value}
        onChangeText={onChangeText}
        maxLength={5}
        placeholder="07:00"
        placeholderTextColor={colors.textMuted}
        style={styles.timeInput}
      />
    </View>
  );
}

function FeatureRow({
  icon,
  title,
  description,
  active,
  onToggle,
}: {
  icon: keyof typeof Ionicons.glyphMap;
  title: string;
  description: string;
  active: boolean;
  onToggle: () => void;
}) {
  return (
    <Pressable accessibilityRole="switch" accessibilityLabel={title} accessibilityState={{ checked: active }} onPress={onToggle} style={({ pressed }) => [styles.featureRow, pressed && styles.pressed]}>
      <View style={[styles.featureIcon, active && styles.featureIconActive]}><Ionicons name={icon} size={17} color={active ? colors.cyan : colors.textMuted} /></View>
      <View style={styles.featureCopy}>
        <Text style={styles.featureTitle}>{title}</Text>
        <Text style={styles.featureDescription}>{description}</Text>
      </View>
      <View style={[styles.checkCircle, active && styles.checkCircleActive]}>{active ? <Ionicons name="checkmark" size={13} color={colors.black} /> : null}</View>
    </Pressable>
  );
}

function ActionButton({
  icon,
  label,
  busy,
  disabled,
  onPress,
}: {
  icon: keyof typeof Ionicons.glyphMap;
  label: string;
  busy: boolean;
  disabled: boolean;
  onPress: () => void;
}) {
  return (
    <Pressable accessibilityRole="button" disabled={disabled} onPress={onPress} style={({ pressed }) => [styles.actionButton, pressed && styles.pressed, disabled && styles.disabled]}>
      {busy ? <ActivityIndicator size="small" color={colors.text} /> : <Ionicons name={icon} size={17} color={colors.text} />}
      <Text style={styles.actionButtonText}>{label}</Text>
    </Pressable>
  );
}

function isValidTime(value: string): boolean {
  const match = /^(\d{2}):(\d{2})$/.exec(value);
  return Boolean(match && Number(match[1]) <= 23 && Number(match[2]) <= 59);
}

function isValidPhoneNumber(value: string): boolean {
  const digits = value.replace(/\D/g, '');
  return /^[+\d\s()-]+$/.test(value) && digits.length >= 8 && digits.length <= 15;
}

function isFutureTimestamp(value: string | null): boolean {
  if (!value) return false;
  const timestamp = new Date(value).getTime();
  return Number.isFinite(timestamp) && timestamp > Date.now();
}

function isValidSchedule(schedule: ReminderSchedule): boolean {
  return schedule.deadline_lead_minutes.length > 0
    && schedule.weekly_review_day >= 1
    && schedule.weekly_review_day <= 7
    && isValidTime(schedule.daily_briefing_time)
    && isValidTime(schedule.progress_checkin_time)
    && isValidTime(schedule.burnout_checkin_time)
    && isValidTime(schedule.habit_checkin_time)
    && isValidTime(schedule.weekly_review_time);
}

function serviceStatus(service: WhatsAppIntegrationState['service'] | undefined): { label: string; tone: string } {
  if (service?.status === 'not_configured') return { label: 'Belum dikonfigurasi', tone: colors.textMuted };
  if (!service?.online) return { label: 'Service offline', tone: colors.rose };
  if (service.connected) return { label: 'WhatsApp terhubung', tone: colors.emerald };
  if (service.status === 'qr') return { label: 'Menunggu scan QR', tone: colors.cyan };
  if (service.status === 'connecting') return { label: 'Sedang menghubungkan', tone: colors.amber };
  return { label: 'Belum terhubung', tone: colors.amber };
}

function formatTimestamp(value: string | null): string {
  if (!value) return 'Belum ada';
  const date = new Date(value);
  if (Number.isNaN(date.getTime())) return value;
  return new Intl.DateTimeFormat('id-ID', {
    day: 'numeric',
    month: 'short',
    hour: '2-digit',
    minute: '2-digit',
  }).format(date);
}

const styles = StyleSheet.create({
  headerButton: { width: 44, height: 44, borderRadius: radii.medium, alignItems: 'center', justifyContent: 'center', borderWidth: 1, borderColor: colors.borderStrong, backgroundColor: colors.surface },
  loadingState: { minHeight: 120, alignItems: 'center', justifyContent: 'center', gap: spacing.md },
  loadingText: { color: colors.textMuted, fontSize: 11, fontWeight: '600' },
  statusGrid: { gap: spacing.md },
  statusCard: { minHeight: 76, flexDirection: 'row', alignItems: 'center', gap: spacing.md, borderWidth: 1, borderColor: colors.border, borderRadius: radii.large, backgroundColor: colors.surface, padding: spacing.lg },
  statusIcon: { width: 42, height: 42, borderRadius: radii.medium, alignItems: 'center', justifyContent: 'center', borderWidth: 1 },
  statusCopy: { flex: 1 },
  statusTitle: { color: colors.text, fontSize: 12, fontWeight: '800', textTransform: 'capitalize' },
  statusDetail: { marginTop: 5, color: colors.textMuted, fontSize: 9, lineHeight: 13, fontWeight: '600' },
  statusDot: { width: 7, height: 7, borderRadius: 4 },
  qrHeader: { flexDirection: 'row', alignItems: 'center', gap: spacing.md },
  qrHeaderIcon: { width: 40, height: 40, borderRadius: radii.medium, alignItems: 'center', justifyContent: 'center', backgroundColor: 'rgba(34,211,238,0.08)' },
  qrHeaderCopy: { flex: 1 },
  qrTitle: { color: colors.text, fontSize: 13, fontWeight: '800' },
  qrStatus: { marginTop: 4, color: colors.cyan, fontSize: 9, fontWeight: '700' },
  qrWrap: { alignSelf: 'center', marginTop: spacing.lg, padding: spacing.sm, borderRadius: radii.medium, backgroundColor: colors.white },
  qrImage: { width: 210, height: 210 },
  qrHelp: { marginTop: spacing.md, color: colors.textMuted, fontSize: 10, lineHeight: 16, textAlign: 'center', fontWeight: '600' },
  sectionHeader: { flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between', gap: spacing.md, marginBottom: spacing.lg },
  sectionHeaderOutside: { flexDirection: 'row', alignItems: 'flex-end', justifyContent: 'space-between', gap: spacing.md, paddingHorizontal: 2 },
  sectionEyebrow: { color: colors.textMuted, fontSize: 9, fontWeight: '900', letterSpacing: 1.4 },
  sectionTitle: { marginTop: 4, color: colors.text, fontSize: 16, fontWeight: '800' },
  sectionMeta: { color: colors.textMuted, fontSize: 9, fontWeight: '700' },
  enabledPill: { minHeight: 34, flexDirection: 'row', alignItems: 'center', gap: 6, borderRadius: radii.pill, borderWidth: 1, borderColor: colors.border, paddingHorizontal: 10 },
  enabledPillActive: { borderColor: 'rgba(110,231,183,0.28)', backgroundColor: 'rgba(110,231,183,0.08)' },
  enabledDot: { width: 6, height: 6, borderRadius: 3, backgroundColor: colors.textMuted },
  enabledDotActive: { backgroundColor: colors.emerald },
  enabledText: { color: colors.textMuted, fontSize: 8, fontWeight: '900', letterSpacing: 0.7 },
  enabledTextActive: { color: colors.emerald },
  fieldGroup: { gap: 7, marginBottom: spacing.lg },
  fieldLabel: { color: colors.textSecondary, fontSize: 10, fontWeight: '800' },
  fieldHint: { color: colors.textMuted, fontSize: 9, lineHeight: 13, fontWeight: '600' },
  input: { minHeight: 48, borderRadius: radii.medium, borderWidth: 1, borderColor: colors.borderStrong, backgroundColor: colors.surfaceSoft, color: colors.text, paddingHorizontal: spacing.md, fontSize: 13, fontWeight: '700' },
  inputVerified: { borderColor: 'rgba(110,231,183,0.42)' },
  verificationCard: { gap: spacing.md, marginTop: -spacing.sm, marginBottom: spacing.lg, borderRadius: radii.medium, borderWidth: 1, borderColor: 'rgba(34,211,238,0.22)', backgroundColor: 'rgba(34,211,238,0.05)', padding: spacing.md },
  verificationCardVerified: { borderColor: 'rgba(110,231,183,0.25)', backgroundColor: 'rgba(110,231,183,0.06)' },
  verificationCardExpired: { borderColor: 'rgba(252,211,77,0.24)', backgroundColor: 'rgba(252,211,77,0.05)' },
  verificationStatusRow: { flexDirection: 'row', alignItems: 'flex-start', gap: spacing.md },
  verificationIcon: { width: 38, height: 38, alignItems: 'center', justifyContent: 'center', borderRadius: radii.medium, backgroundColor: 'rgba(34,211,238,0.09)' },
  verificationIconVerified: { backgroundColor: 'rgba(110,231,183,0.1)' },
  verificationCopy: { flex: 1 },
  verificationTitle: { color: colors.cyan, fontSize: 11, fontWeight: '900' },
  verificationTitleVerified: { color: colors.emerald },
  verificationDetail: { marginTop: 5, color: colors.textMuted, fontSize: 9, lineHeight: 14, fontWeight: '600' },
  verificationRequestButton: { minHeight: 42, flexDirection: 'row', alignItems: 'center', justifyContent: 'center', gap: spacing.sm, borderRadius: radii.small, backgroundColor: colors.cyan, paddingHorizontal: spacing.md },
  verificationRequestText: { color: colors.black, fontSize: 10, fontWeight: '900' },
  verificationForm: { gap: spacing.sm, borderTopWidth: 1, borderTopColor: colors.border, paddingTop: spacing.md },
  verificationCodeLabel: { color: colors.textSecondary, fontSize: 9, fontWeight: '800' },
  verificationCodeRow: { flexDirection: 'row', gap: spacing.sm },
  verificationCodeInput: { minHeight: 44, flex: 1, borderRadius: radii.small, borderWidth: 1, borderColor: colors.borderStrong, backgroundColor: colors.surfaceSoft, color: colors.text, textAlign: 'center', fontSize: 16, fontWeight: '900', letterSpacing: 5, paddingHorizontal: spacing.md },
  verificationConfirmButton: { minHeight: 44, flexDirection: 'row', alignItems: 'center', justifyContent: 'center', gap: 6, borderRadius: radii.small, backgroundColor: colors.white, paddingHorizontal: spacing.md },
  verificationConfirmText: { color: colors.black, fontSize: 9, fontWeight: '900' },
  segmentRow: { flexDirection: 'row', gap: spacing.sm },
  segment: { minHeight: 39, flex: 1, alignItems: 'center', justifyContent: 'center', borderRadius: radii.small, borderWidth: 1, borderColor: colors.border, backgroundColor: colors.surfaceSoft },
  segmentSelected: { borderColor: colors.cyan, backgroundColor: 'rgba(34,211,238,0.1)' },
  segmentText: { color: colors.textMuted, fontSize: 10, fontWeight: '900' },
  segmentTextSelected: { color: colors.cyan },
  timezoneDetail: { color: colors.textMuted, fontSize: 9, fontWeight: '600' },
  consentRow: { flexDirection: 'row', alignItems: 'flex-start', gap: spacing.md, borderRadius: radii.medium, borderWidth: 1, borderColor: colors.border, backgroundColor: colors.surfaceSoft, padding: spacing.md },
  consentRecorded: { borderColor: 'rgba(110,231,183,0.2)', backgroundColor: 'rgba(110,231,183,0.05)' },
  checkbox: { width: 22, height: 22, borderRadius: 7, alignItems: 'center', justifyContent: 'center', borderWidth: 1, borderColor: colors.borderStrong },
  checkboxChecked: { borderColor: colors.emerald, backgroundColor: colors.emerald },
  consentCopy: { flex: 1 },
  consentTitle: { color: colors.text, fontSize: 11, fontWeight: '800' },
  consentText: { marginTop: 5, color: colors.textMuted, fontSize: 9, lineHeight: 14, fontWeight: '600' },
  scheduleHeader: { flexDirection: 'row', alignItems: 'flex-start', gap: spacing.md },
  scheduleIcon: { width: 40, height: 40, borderRadius: radii.medium, alignItems: 'center', justifyContent: 'center', backgroundColor: colors.surfaceSoft },
  scheduleIconActive: { backgroundColor: 'rgba(34,211,238,0.08)' },
  scheduleCopy: { flex: 1 },
  scheduleTitle: { color: colors.text, fontSize: 12, fontWeight: '800' },
  scheduleDescription: { marginTop: 5, color: colors.textMuted, fontSize: 9, lineHeight: 14, fontWeight: '600' },
  switchTrack: { width: 42, height: 24, borderRadius: 12, justifyContent: 'center', borderWidth: 1, borderColor: colors.borderStrong, backgroundColor: colors.surfaceSoft, paddingHorizontal: 3 },
  switchTrackActive: { borderColor: 'rgba(34,211,238,0.35)', backgroundColor: 'rgba(34,211,238,0.15)' },
  switchThumb: { width: 16, height: 16, borderRadius: 8, backgroundColor: colors.textMuted },
  switchThumbActive: { alignSelf: 'flex-end', backgroundColor: colors.cyan },
  scheduleBody: { marginTop: spacing.lg, paddingTop: spacing.md, borderTopWidth: 1, borderTopColor: colors.border, gap: spacing.md },
  scheduleBodyDisabled: { opacity: 0.4 },
  timeRow: { flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between', gap: spacing.md },
  timeLabel: { flex: 1, color: colors.textSecondary, fontSize: 10, fontWeight: '700' },
  timeInput: { width: 78, height: 40, borderRadius: radii.small, borderWidth: 1, borderColor: colors.borderStrong, backgroundColor: colors.surfaceSoft, color: colors.text, textAlign: 'center', fontSize: 12, fontWeight: '900' },
  miniLabel: { color: colors.textSecondary, fontSize: 9, fontWeight: '800' },
  weekdayRow: { flexDirection: 'row', flexWrap: 'wrap', gap: 6 },
  weekday: { minWidth: 38, height: 34, alignItems: 'center', justifyContent: 'center', borderRadius: radii.small, borderWidth: 1, borderColor: colors.border, backgroundColor: colors.surfaceSoft },
  weekdaySelected: { borderColor: colors.cyan, backgroundColor: 'rgba(34,211,238,0.12)' },
  weekdayText: { color: colors.textMuted, fontSize: 9, fontWeight: '800' },
  weekdayTextSelected: { color: colors.cyan },
  deadlineWrap: { flexDirection: 'row', flexWrap: 'wrap', gap: spacing.sm },
  deadlineChip: { minHeight: 34, alignItems: 'center', justifyContent: 'center', borderRadius: radii.pill, borderWidth: 1, borderColor: colors.border, backgroundColor: colors.surfaceSoft, paddingHorizontal: 11 },
  deadlineChipSelected: { borderColor: 'rgba(34,211,238,0.35)', backgroundColor: 'rgba(34,211,238,0.1)' },
  deadlineText: { color: colors.textMuted, fontSize: 9, fontWeight: '800' },
  deadlineTextSelected: { color: colors.cyan },
  featureList: { gap: 0 },
  featureRow: { minHeight: 66, flexDirection: 'row', alignItems: 'center', gap: spacing.md },
  featureIcon: { width: 38, height: 38, borderRadius: radii.medium, alignItems: 'center', justifyContent: 'center', backgroundColor: colors.surfaceSoft },
  featureIconActive: { backgroundColor: 'rgba(34,211,238,0.08)' },
  featureCopy: { flex: 1 },
  featureTitle: { color: colors.text, fontSize: 11, fontWeight: '800' },
  featureDescription: { marginTop: 4, color: colors.textMuted, fontSize: 9, lineHeight: 13, fontWeight: '600' },
  checkCircle: { width: 22, height: 22, borderRadius: 11, alignItems: 'center', justifyContent: 'center', borderWidth: 1, borderColor: colors.borderStrong },
  checkCircleActive: { borderColor: colors.cyan, backgroundColor: colors.cyan },
  separator: { height: 1, backgroundColor: colors.border },
  activityHeader: { flexDirection: 'row', alignItems: 'center', gap: spacing.sm, marginBottom: spacing.lg },
  activityRow: { flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between', gap: spacing.md, paddingVertical: spacing.sm },
  activityLabel: { color: colors.textSecondary, fontSize: 10, fontWeight: '700' },
  activityValue: { color: colors.text, fontSize: 9, fontWeight: '800', textAlign: 'right' },
  actionRow: { flexDirection: 'row', gap: spacing.md },
  actionButton: { minHeight: 48, flex: 1, flexDirection: 'row', alignItems: 'center', justifyContent: 'center', gap: spacing.sm, borderRadius: radii.medium, borderWidth: 1, borderColor: colors.borderStrong, backgroundColor: colors.surface },
  actionButtonText: { color: colors.text, fontSize: 10, fontWeight: '800' },
  saveButton: { minHeight: 52, flexDirection: 'row', alignItems: 'center', justifyContent: 'center', gap: spacing.sm, borderRadius: radii.medium, backgroundColor: colors.white },
  saveButtonText: { color: colors.black, fontSize: 12, fontWeight: '900' },
  pressed: { opacity: 0.78, transform: [{ scale: 0.99 }] },
  disabled: { opacity: 0.45 },
});
