import { useEffect, useMemo, useState } from 'react';
import * as DocumentPicker from 'expo-document-picker';
import { Redirect, useRouter } from 'expo-router';
import { Alert, Pressable, RefreshControl, ScrollView, Text, TextInput, View } from 'react-native';
import { useQuery } from '@tanstack/react-query';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import { AppLoadingScreen } from '../../../src/components/AppLoadingScreen';
import { QueryStateView } from '../../../src/components/QueryStateView';
import { OfflineCacheNotice } from '../../../src/components/OfflineCacheNotice';
import { useAuth } from '../../../src/features/auth/AuthProvider';
import { useStudentFinanceOverviewQuery } from '../../../src/features/student/useStudentFinanceOverviewQuery';
import { ENV } from '../../../src/config/env';
import {
  StudentPaymentStatus,
  studentFinanceApi,
  type StudentFinancePaymentSubmissionPayload,
} from '../../../src/features/student/studentFinanceApi';
import { getStandardPagePadding } from '../../../src/lib/ui/pageLayout';
import { BRAND_COLORS } from '../../../src/config/brand';
import { openWebModuleRoute } from '../../../src/lib/navigation/webModuleRoute';

const PAYMENT_STATUS_LABELS: Record<StudentPaymentStatus, string> = {
  PENDING: 'Belum Bayar',
  PAID: 'Lunas',
  PARTIAL: 'Cicilan',
  CANCELLED: 'Dibatalkan',
};

const PAYMENT_STATUS_COLORS: Record<StudentPaymentStatus, string> = {
  PENDING: '#b45309',
  PAID: '#15803d',
  PARTIAL: '#1d4ed8',
  CANCELLED: '#b91c1c',
};

const INVOICE_STATUS_LABELS: Record<'UNPAID' | 'PARTIAL' | 'PAID' | 'CANCELLED', string> = {
  UNPAID: 'Belum Lunas',
  PARTIAL: 'Cicilan',
  PAID: 'Lunas',
  CANCELLED: 'Dibatalkan',
};

const INVOICE_STATUS_COLORS: Record<'UNPAID' | 'PARTIAL' | 'PAID' | 'CANCELLED', string> = {
  UNPAID: '#b45309',
  PARTIAL: '#1d4ed8',
  PAID: '#15803d',
  CANCELLED: '#b91c1c',
};

function getPaymentSourceLabel(source?: 'DIRECT' | 'CREDIT_BALANCE' | null) {
  return source === 'CREDIT_BALANCE' ? 'Saldo Kredit' : 'Pembayaran Langsung';
}

function getPaymentMethodLabel(
  method?: 'CASH' | 'BANK_TRANSFER' | 'VIRTUAL_ACCOUNT' | 'E_WALLET' | 'QRIS' | 'OTHER' | null,
) {
  if (method === 'BANK_TRANSFER') return 'Transfer Bank';
  if (method === 'VIRTUAL_ACCOUNT') return 'Virtual Account';
  if (method === 'E_WALLET') return 'E-Wallet';
  if (method === 'QRIS') return 'QRIS';
  if (method === 'CASH') return 'Tunai';
  if (method === 'OTHER') return 'Metode Lain';
  return 'Metode belum dicatat';
}

function getVerificationTone(status?: 'PENDING' | 'VERIFIED' | 'REJECTED' | null) {
  if (status === 'VERIFIED') {
    return { border: '#bbf7d0', background: '#f0fdf4', text: '#15803d', label: 'Terverifikasi' };
  }
  if (status === 'REJECTED') {
    return { border: '#fecaca', background: '#fff1f2', text: '#be123c', label: 'Ditolak' };
  }
  return { border: '#fde68a', background: '#fffbeb', text: '#b45309', label: 'Menunggu Verifikasi' };
}

function getActionCenterTone(
  state:
    | 'NO_INVOICE'
    | 'OVERDUE'
    | 'LATE_FEE_WARNING'
    | 'DUE_SOON'
    | 'CREDIT_AVAILABLE'
    | 'UP_TO_DATE',
) {
  if (state === 'OVERDUE') return { border: '#fecaca', background: '#fff1f2', text: '#be123c', label: 'Prioritas' };
  if (state === 'LATE_FEE_WARNING') {
    return { border: '#fde68a', background: '#fffbeb', text: '#b45309', label: 'Warning' };
  }
  if (state === 'DUE_SOON') return { border: '#ddd6fe', background: '#f5f3ff', text: '#6d28d9', label: 'Segera' };
  if (state === 'CREDIT_AVAILABLE') {
    return { border: '#bae6fd', background: '#f0f9ff', text: '#0369a1', label: 'Saldo' };
  }
  if (state === 'NO_INVOICE') return { border: '#cbd5e1', background: '#f8fafc', text: '#475569', label: 'Info' };
  return { border: '#bbf7d0', background: '#f0fdf4', text: '#15803d', label: 'Aman' };
}

function formatCurrency(value: number) {
  return new Intl.NumberFormat('id-ID', {
    style: 'currency',
    currency: 'IDR',
    maximumFractionDigits: 0,
  }).format(Number(value || 0));
}

function formatDate(dateValue: string) {
  const date = new Date(dateValue);
  if (Number.isNaN(date.getTime())) return '-';
  return date.toLocaleDateString('id-ID', {
    day: '2-digit',
    month: 'short',
    year: 'numeric',
  });
}

function resolveAssetUrl(path?: string | null) {
  if (!path) return null;
  if (/^https?:\/\//i.test(path)) return path;
  const origin = ENV.API_BASE_URL.replace(/\/api\/?$/, '');
  return `${origin}${path.startsWith('/') ? path : `/${path}`}`;
}

export default function StudentFinanceScreen() {
  const router = useRouter();
  const insets = useSafeAreaInsets();
  const { isAuthenticated, isLoading, user } = useAuth();
  const pagePadding = getStandardPagePadding(insets, { bottom: 120 });
  const financeQuery = useStudentFinanceOverviewQuery({
    enabled: isAuthenticated,
    user,
    limit: 50,
  });
  const bankAccountsQuery = useQuery({
    queryKey: ['student-finance-portal-bank-accounts-mobile'],
    enabled: isAuthenticated,
    queryFn: () => studentFinanceApi.getPortalBankAccounts(),
  });
  const [selectedInvoiceId, setSelectedInvoiceId] = useState<number | null>(null);
  const [paymentMethod, setPaymentMethod] =
    useState<StudentFinancePaymentSubmissionPayload['method']>('BANK_TRANSFER');
  const [bankAccountId, setBankAccountId] = useState<number | null>(null);
  const [paymentAmount, setPaymentAmount] = useState('');
  const [referenceNo, setReferenceNo] = useState('');
  const [paymentNote, setPaymentNote] = useState('');
  const [paidAt, setPaidAt] = useState(() => new Date().toISOString().slice(0, 10));
  const [proofFile, setProofFile] = useState<DocumentPicker.DocumentPickerAsset | null>(null);
  const [isSubmittingPayment, setIsSubmittingPayment] = useState(false);

  const overview = financeQuery.data?.overview;
  const outstandingInvoices = useMemo(
    () =>
      (overview?.invoices || []).filter(
        (invoice) =>
          invoice.status !== 'PAID' &&
          invoice.status !== 'CANCELLED' &&
          Number(invoice.balanceAmount || 0) > 0,
      ),
    [overview?.invoices],
  );
  const selectedInvoice =
    outstandingInvoices.find((invoice) => invoice.id === selectedInvoiceId) || outstandingInvoices[0] || null;
  const unpaidAmount =
    Number(overview?.summary.status.pendingAmount || 0) +
    Number(overview?.summary.status.partialAmount || 0);
  const actionCenter = overview?.actionCenter;
  const actionTone = actionCenter ? getActionCenterTone(actionCenter.state) : null;
  const latestRefund = overview?.creditBalance.refunds?.[0] || actionCenter?.latestRefund || null;

  useEffect(() => {
    if (!selectedInvoice) {
      if (selectedInvoiceId !== null) setSelectedInvoiceId(null);
      if (paymentAmount) setPaymentAmount('');
      return;
    }
    if (selectedInvoiceId !== selectedInvoice.id) {
      setSelectedInvoiceId(selectedInvoice.id);
      setPaymentAmount(String(Math.round(selectedInvoice.balanceAmount || 0)));
      return;
    }
    if (!paymentAmount) {
      setPaymentAmount(String(Math.round(selectedInvoice.balanceAmount || 0)));
    }
  }, [paymentAmount, selectedInvoice, selectedInvoiceId]);

  const handlePickProof = async () => {
    const result = await DocumentPicker.getDocumentAsync({
      multiple: false,
      copyToCacheDirectory: true,
      type: ['image/*', 'application/pdf'],
    });
    if (result.canceled || !result.assets?.length) return;
    setProofFile(result.assets[0]);
  };

  const handleSubmitPayment = async () => {
    if (!selectedInvoice) {
      Alert.alert('Belum ada tagihan', 'Belum ada tagihan aktif yang bisa diajukan pembayarannya.');
      return;
    }
    if (!proofFile) {
      Alert.alert('Bukti bayar wajib', 'Unggah bukti pembayaran terlebih dulu.');
      return;
    }
    const amount = Number(paymentAmount || 0);
    if (!Number.isFinite(amount) || amount <= 0) {
      Alert.alert('Nominal tidak valid', 'Nominal pembayaran harus lebih besar dari nol.');
      return;
    }
    if (paymentMethod !== 'OTHER' && !bankAccountId) {
      Alert.alert('Rekening tujuan', 'Pilih rekening tujuan terlebih dulu.');
      return;
    }

    try {
      setIsSubmittingPayment(true);
      const uploaded = await studentFinanceApi.uploadPaymentProof({
        uri: proofFile.uri,
        name: proofFile.name,
        type: proofFile.mimeType || undefined,
      });
      await studentFinanceApi.submitPayment({
        invoiceId: selectedInvoice.id,
        amount,
        method: paymentMethod,
        bankAccountId: bankAccountId || undefined,
        referenceNo: referenceNo.trim() || undefined,
        note: paymentNote.trim() || undefined,
        paidAt: paidAt ? new Date(`${paidAt}T12:00:00`).toISOString() : undefined,
        proofFileUrl: uploaded.url,
        proofFileName: uploaded.originalname,
        proofFileMimeType: uploaded.mimetype,
        proofFileSize: uploaded.size,
      });
      setReferenceNo('');
      setPaymentNote('');
      setProofFile(null);
      await financeQuery.refetch();
      Alert.alert('Berhasil', 'Bukti pembayaran berhasil dikirim dan menunggu verifikasi bendahara.');
    } catch (error: any) {
      Alert.alert('Gagal', error?.response?.data?.message || 'Gagal mengirim bukti pembayaran.');
    } finally {
      setIsSubmittingPayment(false);
    }
  };

  if (isLoading) return <AppLoadingScreen message="Memuat modul keuangan..." />;
  if (!isAuthenticated) return <Redirect href="/welcome" />;

  if (user?.role !== 'STUDENT') {
    return (
      <ScrollView style={{ flex: 1, backgroundColor: '#f8fafc' }} contentContainerStyle={pagePadding}>
        <Text style={{ fontSize: 24, fontWeight: '700', marginBottom: 8, color: BRAND_COLORS.textDark }}>Keuangan</Text>
        <QueryStateView type="error" message="Halaman ini khusus untuk role siswa." />
      </ScrollView>
    );
  }

  return (
    <ScrollView
      style={{ flex: 1, backgroundColor: '#f8fafc' }}
      contentContainerStyle={pagePadding}
      refreshControl={
        <RefreshControl
          refreshing={financeQuery.isFetching && !financeQuery.isLoading}
          onRefresh={() => financeQuery.refetch()}
        />
      }
    >
      <Text style={{ fontSize: 24, fontWeight: '700', marginBottom: 6, color: BRAND_COLORS.textDark }}>Keuangan</Text>
      <Text style={{ color: BRAND_COLORS.textMuted, marginBottom: 12 }}>
        Ringkasan tagihan dan histori pembayaran Anda.
      </Text>

      {financeQuery.isLoading ? <QueryStateView type="loading" message="Mengambil data keuangan..." /> : null}
      {financeQuery.isError ? (
        <QueryStateView
          type="error"
          message="Gagal memuat data keuangan."
          onRetry={() => financeQuery.refetch()}
        />
      ) : null}
      {financeQuery.data?.fromCache ? <OfflineCacheNotice cachedAt={financeQuery.data.cachedAt} /> : null}

      {!financeQuery.isLoading && !financeQuery.isError && overview ? (
        <>
          <View
            style={{
              backgroundColor: '#fff',
              borderWidth: 1,
              borderColor: '#dbe7fb',
              borderRadius: 12,
              padding: 12,
              marginBottom: 12,
            }}
          >
            <Text style={{ color: BRAND_COLORS.textDark, fontWeight: '700', fontSize: 16 }}>
              {overview.student.name}
            </Text>
            <Text style={{ color: BRAND_COLORS.textMuted, marginTop: 2 }}>
              {overview.student.studentClass?.name || '-'} • {overview.student.nisn || '-'}
            </Text>
          </View>

          <View style={{ flexDirection: 'row', flexWrap: 'wrap', marginHorizontal: -4, marginBottom: 10 }}>
            <View style={{ width: '50%', paddingHorizontal: 4, marginBottom: 8 }}>
              <View
                style={{
                  backgroundColor: '#fff',
                  borderWidth: 1,
                  borderColor: '#dbe7fb',
                  borderRadius: 10,
                  padding: 10,
                }}
              >
                <Text style={{ color: '#64748b', fontSize: 11, marginBottom: 3 }}>Total Tagihan</Text>
                <Text style={{ color: BRAND_COLORS.textDark, fontWeight: '700', fontSize: 15 }}>
                  {formatCurrency(overview.summary.totalAmount)}
                </Text>
              </View>
            </View>

            <View style={{ width: '50%', paddingHorizontal: 4, marginBottom: 8 }}>
              <View
                style={{
                  backgroundColor: '#fff',
                  borderWidth: 1,
                  borderColor: '#dbe7fb',
                  borderRadius: 10,
                  padding: 10,
                }}
              >
                <Text style={{ color: '#64748b', fontSize: 11, marginBottom: 3 }}>Sudah Dibayar</Text>
                <Text style={{ color: '#15803d', fontWeight: '700', fontSize: 15 }}>
                  {formatCurrency(overview.summary.status.paidAmount)}
                </Text>
              </View>
            </View>

            <View style={{ width: '50%', paddingHorizontal: 4, marginBottom: 8 }}>
              <View
                style={{
                  backgroundColor: '#fff',
                  borderWidth: 1,
                  borderColor: '#dbe7fb',
                  borderRadius: 10,
                  padding: 10,
                }}
              >
                <Text style={{ color: '#64748b', fontSize: 11, marginBottom: 3 }}>Belum Lunas</Text>
                <Text style={{ color: '#b45309', fontWeight: '700', fontSize: 15 }}>
                  {formatCurrency(unpaidAmount)}
                </Text>
              </View>
            </View>

            <View style={{ width: '50%', paddingHorizontal: 4, marginBottom: 8 }}>
              <View
                style={{
                  backgroundColor: '#fff',
                  borderWidth: 1,
                  borderColor: '#dbe7fb',
                  borderRadius: 10,
                  padding: 10,
                }}
              >
                <Text style={{ color: '#64748b', fontSize: 11, marginBottom: 3 }}>Overdue</Text>
                <Text style={{ color: '#b91c1c', fontWeight: '700', fontSize: 15 }}>
                  {overview.summary.overdueCount} tagihan
                </Text>
                <Text style={{ color: '#ef4444', fontSize: 12, marginTop: 2 }}>
                  {formatCurrency(overview.summary.overdueAmount)}
                </Text>
              </View>
            </View>

            <View style={{ width: '50%', paddingHorizontal: 4, marginBottom: 8 }}>
              <View
                style={{
                  backgroundColor: '#fff',
                  borderWidth: 1,
                  borderColor: '#dbe7fb',
                  borderRadius: 10,
                  padding: 10,
                }}
              >
                <Text style={{ color: '#64748b', fontSize: 11, marginBottom: 3 }}>Saldo Kredit</Text>
                <Text style={{ color: '#0369a1', fontWeight: '700', fontSize: 15 }}>
                  {formatCurrency(overview.summary.creditBalance)}
                </Text>
                <Text style={{ color: '#0ea5e9', fontSize: 12, marginTop: 2 }}>
                  Kelebihan bayar tersimpan
                </Text>
              </View>
            </View>
          </View>

          {actionCenter && actionTone ? (
            <View
              style={{
                backgroundColor: '#fff',
                borderWidth: 1,
                borderColor: '#dbe7fb',
                borderRadius: 12,
                padding: 12,
                marginBottom: 12,
              }}
            >
              <View style={{ flexDirection: 'row', justifyContent: 'space-between', alignItems: 'flex-start', gap: 12 }}>
                <View style={{ flex: 1 }}>
                  <Text style={{ color: BRAND_COLORS.textMuted, fontSize: 12, textTransform: 'uppercase' }}>
                    Pusat Tindak Lanjut
                  </Text>
                  <Text style={{ color: BRAND_COLORS.textDark, fontWeight: '700', fontSize: 16, marginTop: 6 }}>
                    {actionCenter.headline}
                  </Text>
                  <Text style={{ color: BRAND_COLORS.textMuted, marginTop: 6, lineHeight: 20 }}>
                    {actionCenter.detail}
                  </Text>
                </View>
                <View
                  style={{
                    borderWidth: 1,
                    borderColor: actionTone.border,
                    backgroundColor: actionTone.background,
                    borderRadius: 999,
                    paddingHorizontal: 10,
                    paddingVertical: 4,
                  }}
                >
                  <Text style={{ color: actionTone.text, fontWeight: '700', fontSize: 11 }}>{actionTone.label}</Text>
                </View>
              </View>

              <View style={{ marginTop: 12 }}>
                <View
                  style={{
                    borderWidth: 1,
                    borderColor: '#ddd6fe',
                    backgroundColor: '#f5f3ff',
                    borderRadius: 10,
                    padding: 10,
                    marginBottom: 8,
                  }}
                >
                  <Text style={{ color: '#6d28d9', fontSize: 11, textTransform: 'uppercase' }}>Termin Berikutnya</Text>
                  <Text style={{ color: '#4c1d95', fontWeight: '700', marginTop: 5 }}>
                    {actionCenter.nextDue?.invoiceNo || 'Belum ada agenda'}
                  </Text>
                  <Text style={{ color: '#6d28d9', fontSize: 12, marginTop: 3 }}>
                    {actionCenter.nextDue?.dueDate
                      ? `${formatDate(actionCenter.nextDue.dueDate)} • ${formatCurrency(actionCenter.nextDue.balanceAmount)}`
                      : 'Tidak ada termin aktif yang perlu dipantau'}
                  </Text>
                </View>

                <View
                  style={{
                    borderWidth: 1,
                    borderColor: '#fde68a',
                    backgroundColor: '#fffbeb',
                    borderRadius: 10,
                    padding: 10,
                    marginBottom: 8,
                  }}
                >
                  <Text style={{ color: '#b45309', fontSize: 11, textTransform: 'uppercase' }}>Potensi Denda</Text>
                  <Text style={{ color: '#92400e', fontWeight: '700', marginTop: 5 }}>
                    {formatCurrency(actionCenter.pendingLateFeeAmount)}
                  </Text>
                  <Text style={{ color: '#b45309', fontSize: 12, marginTop: 3 }}>
                    {actionCenter.overdueInstallmentCount} termin overdue • diterapkan{' '}
                    {formatCurrency(actionCenter.appliedLateFeeAmount)}
                  </Text>
                </View>

                <View
                  style={{
                    borderWidth: 1,
                    borderColor: '#bae6fd',
                    backgroundColor: '#f0f9ff',
                    borderRadius: 10,
                    padding: 10,
                  }}
                >
                  <Text style={{ color: '#0369a1', fontSize: 11, textTransform: 'uppercase' }}>Saldo Kredit & Refund</Text>
                  <Text style={{ color: '#0c4a6e', fontWeight: '700', marginTop: 5 }}>
                    {formatCurrency(actionCenter.creditBalanceAmount)}
                  </Text>
                  <Text style={{ color: '#0369a1', fontSize: 12, marginTop: 3 }}>
                    {latestRefund
                      ? `Refund terakhir ${latestRefund.refundNo} • ${formatDate(latestRefund.refundedAt)}`
                      : 'Belum ada refund saldo kredit'}
                  </Text>
                </View>
              </View>
            </View>
          ) : null}

          <View
            style={{
              backgroundColor: '#fff',
              borderWidth: 1,
              borderColor: '#dbe7fb',
              borderRadius: 12,
              padding: 12,
              marginBottom: 12,
            }}
          >
            <View style={{ flexDirection: 'row', justifyContent: 'space-between', alignItems: 'flex-start', gap: 12 }}>
              <View style={{ flex: 1 }}>
                <Text style={{ color: BRAND_COLORS.textMuted, fontSize: 12, textTransform: 'uppercase' }}>
                  Kirim Bukti Bayar
                </Text>
                <Text style={{ color: BRAND_COLORS.textDark, fontWeight: '700', fontSize: 16, marginTop: 6 }}>
                  Pembayaran Non-Tunai Portal
                </Text>
                <Text style={{ color: BRAND_COLORS.textMuted, marginTop: 6, lineHeight: 20 }}>
                  Pilih tagihan aktif, unggah bukti transfer/VA/e-wallet/QRIS, lalu tunggu verifikasi bendahara.
                </Text>
              </View>
              <View
                style={{
                  borderWidth: 1,
                  borderColor: '#fde68a',
                  backgroundColor: '#fffbeb',
                  borderRadius: 999,
                  paddingHorizontal: 10,
                  paddingVertical: 4,
                }}
              >
                <Text style={{ color: '#b45309', fontWeight: '700', fontSize: 11 }}>Manual</Text>
              </View>
            </View>

            {!outstandingInvoices.length ? (
              <Text style={{ color: '#64748b', marginTop: 12, fontSize: 12 }}>
                Belum ada tagihan aktif yang bisa diajukan pembayarannya.
              </Text>
            ) : (
              <View style={{ marginTop: 12 }}>
                <Text style={{ color: BRAND_COLORS.textDark, fontWeight: '700', marginBottom: 8 }}>Pilih Tagihan</Text>
                <View style={{ marginHorizontal: -4, flexDirection: 'row', flexWrap: 'wrap' }}>
                  {outstandingInvoices.map((invoice) => {
                    const selected = selectedInvoice?.id === invoice.id;
                    return (
                      <View key={`student-submit-invoice-${invoice.id}`} style={{ width: '50%', paddingHorizontal: 4, marginBottom: 8 }}>
                        <Pressable
                          onPress={() => {
                            setSelectedInvoiceId(invoice.id);
                            setPaymentAmount(String(Math.round(invoice.balanceAmount || 0)));
                          }}
                          style={{
                            borderWidth: 1,
                            borderColor: selected ? BRAND_COLORS.blue : '#d5e1f5',
                            backgroundColor: selected ? '#e9f1ff' : '#fff',
                            borderRadius: 10,
                            padding: 10,
                          }}
                        >
                          <Text numberOfLines={1} style={{ color: selected ? BRAND_COLORS.navy : BRAND_COLORS.textDark, fontWeight: '700' }}>
                            {invoice.invoiceNo}
                          </Text>
                          <Text style={{ color: '#64748b', fontSize: 12, marginTop: 2 }}>
                            {formatCurrency(invoice.balanceAmount)}
                          </Text>
                        </Pressable>
                      </View>
                    );
                  })}
                </View>

                <Text style={{ color: BRAND_COLORS.textDark, fontWeight: '700', marginBottom: 8, marginTop: 6 }}>Metode</Text>
                <View style={{ marginHorizontal: -4, flexDirection: 'row', flexWrap: 'wrap' }}>
                  {[
                    { value: 'BANK_TRANSFER', label: 'Transfer' },
                    { value: 'VIRTUAL_ACCOUNT', label: 'VA' },
                    { value: 'E_WALLET', label: 'E-Wallet' },
                    { value: 'QRIS', label: 'QRIS' },
                    { value: 'OTHER', label: 'Lainnya' },
                  ].map((option) => {
                    const selected = paymentMethod === option.value;
                    return (
                      <View key={`student-submit-method-${option.value}`} style={{ width: '33.33%', paddingHorizontal: 4, marginBottom: 8 }}>
                        <Pressable
                          onPress={() => setPaymentMethod(option.value as StudentFinancePaymentSubmissionPayload['method'])}
                          style={{
                            borderWidth: 1,
                            borderColor: selected ? BRAND_COLORS.blue : '#d5e1f5',
                            backgroundColor: selected ? '#e9f1ff' : '#fff',
                            borderRadius: 10,
                            paddingVertical: 10,
                            alignItems: 'center',
                          }}
                        >
                          <Text style={{ color: selected ? BRAND_COLORS.navy : BRAND_COLORS.textMuted, fontWeight: '700', fontSize: 12 }}>
                            {option.label}
                          </Text>
                        </Pressable>
                      </View>
                    );
                  })}
                </View>

                <Text style={{ color: BRAND_COLORS.textDark, fontWeight: '700', marginBottom: 8 }}>Rekening Tujuan</Text>
                <View style={{ marginHorizontal: -4, flexDirection: 'row', flexWrap: 'wrap' }}>
                  {(bankAccountsQuery.data || []).map((account) => {
                    const selected = bankAccountId === account.id;
                    return (
                      <View key={`student-submit-account-${account.id}`} style={{ width: '100%', paddingHorizontal: 4, marginBottom: 8 }}>
                        <Pressable
                          onPress={() => setBankAccountId(account.id)}
                          style={{
                            borderWidth: 1,
                            borderColor: selected ? BRAND_COLORS.blue : '#d5e1f5',
                            backgroundColor: selected ? '#e9f1ff' : '#fff',
                            borderRadius: 10,
                            padding: 10,
                          }}
                        >
                          <Text style={{ color: selected ? BRAND_COLORS.navy : BRAND_COLORS.textDark, fontWeight: '700', fontSize: 12 }}>
                            {account.bankName} • {account.accountNumber}
                          </Text>
                          <Text style={{ color: '#64748b', fontSize: 12, marginTop: 2 }}>{account.accountName}</Text>
                        </Pressable>
                      </View>
                    );
                  })}
                  {bankAccountsQuery.isLoading ? (
                    <Text style={{ color: '#64748b', fontSize: 12, paddingHorizontal: 4 }}>Memuat rekening aktif...</Text>
                  ) : null}
                </View>

                <Text style={{ color: BRAND_COLORS.textDark, fontWeight: '700', marginBottom: 6 }}>Nominal</Text>
                <TextInput
                  value={paymentAmount}
                  onChangeText={setPaymentAmount}
                  keyboardType="numeric"
                  placeholder="Nominal pembayaran"
                  style={{
                    borderWidth: 1,
                    borderColor: '#d5e1f5',
                    borderRadius: 10,
                    paddingHorizontal: 12,
                    paddingVertical: 10,
                    backgroundColor: '#fff',
                    marginBottom: 10,
                  }}
                />

                <Text style={{ color: BRAND_COLORS.textDark, fontWeight: '700', marginBottom: 6 }}>Referensi</Text>
                <TextInput
                  value={referenceNo}
                  onChangeText={setReferenceNo}
                  placeholder="Nomor referensi transfer / VA / QRIS"
                  style={{
                    borderWidth: 1,
                    borderColor: '#d5e1f5',
                    borderRadius: 10,
                    paddingHorizontal: 12,
                    paddingVertical: 10,
                    backgroundColor: '#fff',
                    marginBottom: 10,
                  }}
                />

                <Text style={{ color: BRAND_COLORS.textDark, fontWeight: '700', marginBottom: 6 }}>Tanggal Bayar</Text>
                <TextInput
                  value={paidAt}
                  onChangeText={setPaidAt}
                  placeholder="YYYY-MM-DD"
                  style={{
                    borderWidth: 1,
                    borderColor: '#d5e1f5',
                    borderRadius: 10,
                    paddingHorizontal: 12,
                    paddingVertical: 10,
                    backgroundColor: '#fff',
                    marginBottom: 10,
                  }}
                />

                <Text style={{ color: BRAND_COLORS.textDark, fontWeight: '700', marginBottom: 6 }}>Catatan</Text>
                <TextInput
                  value={paymentNote}
                  onChangeText={setPaymentNote}
                  placeholder="Catatan tambahan untuk bendahara"
                  multiline
                  textAlignVertical="top"
                  style={{
                    borderWidth: 1,
                    borderColor: '#d5e1f5',
                    borderRadius: 10,
                    paddingHorizontal: 12,
                    paddingVertical: 10,
                    backgroundColor: '#fff',
                    minHeight: 88,
                    marginBottom: 10,
                  }}
                />

                <Pressable
                  onPress={() => void handlePickProof()}
                  style={{
                    borderWidth: 1,
                    borderColor: '#d5e1f5',
                    borderRadius: 10,
                    paddingVertical: 12,
                    alignItems: 'center',
                    marginBottom: 10,
                    backgroundColor: '#fff',
                  }}
                >
                  <Text style={{ color: BRAND_COLORS.navy, fontWeight: '700' }}>
                    {proofFile ? 'Ganti Bukti Bayar' : 'Pilih Bukti Bayar'}
                  </Text>
                </Pressable>
                <Text style={{ color: '#64748b', fontSize: 12 }}>
                  {proofFile ? `${proofFile.name} • ${Math.round((proofFile.size || 0) / 1024)} KB` : 'Format gambar atau PDF, maksimal 3 MB.'}
                </Text>

                <Pressable
                  onPress={() => void handleSubmitPayment()}
                  disabled={isSubmittingPayment || bankAccountsQuery.isLoading}
                  style={{
                    backgroundColor: isSubmittingPayment ? '#93c5fd' : BRAND_COLORS.blue,
                    borderRadius: 10,
                    paddingVertical: 12,
                    alignItems: 'center',
                    marginTop: 12,
                  }}
                >
                  <Text style={{ color: '#fff', fontWeight: '700' }}>
                    {isSubmittingPayment ? 'Mengirim...' : 'Kirim Bukti Bayar'}
                  </Text>
                </Pressable>
              </View>
            )}
          </View>

          <View
            style={{
              backgroundColor: '#fff',
              borderWidth: 1,
              borderColor: '#dbe7fb',
              borderRadius: 12,
              padding: 12,
              marginBottom: 12,
            }}
          >
            <Text style={{ color: BRAND_COLORS.textDark, fontWeight: '700', marginBottom: 8 }}>
              Tagihan Aktif
            </Text>
            {overview.invoices.length > 0 ? (
              overview.invoices.map((invoice) => (
                <View
                  key={invoice.id}
                  style={{
                    paddingVertical: 10,
                    borderBottomWidth: 1,
                    borderBottomColor: '#eef2ff',
                  }}
                >
                  <View style={{ flexDirection: 'row', justifyContent: 'space-between', alignItems: 'center' }}>
                    <View style={{ flex: 1, paddingRight: 8 }}>
                      <Text style={{ color: BRAND_COLORS.textDark, fontWeight: '700' }} numberOfLines={1}>
                        {invoice.invoiceNo}
                      </Text>
                      <Text style={{ color: '#64748b', marginTop: 2, fontSize: 12 }}>
                        {invoice.title || `${invoice.periodKey} • ${invoice.semester === 'ODD' ? 'Ganjil' : 'Genap'}`}
                      </Text>
                      {invoice.items.length ? (
                        <Text style={{ color: '#64748b', marginTop: 2, fontSize: 12 }}>
                          Komponen: {invoice.items.map((item) => item.componentName).join(' • ')}
                        </Text>
                      ) : null}
                    </View>
                    <View
                      style={{
                        borderWidth: 1,
                        borderColor: `${INVOICE_STATUS_COLORS[invoice.status]}66`,
                        backgroundColor: `${INVOICE_STATUS_COLORS[invoice.status]}1a`,
                        borderRadius: 999,
                        paddingHorizontal: 8,
                        paddingVertical: 2,
                      }}
                    >
                      <Text
                        style={{
                          color: INVOICE_STATUS_COLORS[invoice.status],
                          fontWeight: '700',
                          fontSize: 11,
                        }}
                      >
                        {INVOICE_STATUS_LABELS[invoice.status]}
                      </Text>
                    </View>
                  </View>
                  <View style={{ marginTop: 6, flexDirection: 'row', justifyContent: 'space-between' }}>
                    <Text style={{ color: '#64748b', fontSize: 12 }}>
                      Jatuh tempo: {formatDate(invoice.dueDate || '')}
                    </Text>
                    <Text style={{ color: BRAND_COLORS.textDark, fontWeight: '700', fontSize: 12 }}>
                      Sisa: {formatCurrency(invoice.balanceAmount)}
                    </Text>
                  </View>
                  <Text style={{ color: '#6d28d9', marginTop: 2, fontSize: 12 }}>
                    {invoice.installmentSummary?.totalCount ?? (invoice.installments || []).length} termin •{' '}
                    {invoice.installmentSummary?.paidCount ?? (invoice.installments || []).filter((installment) => installment.status === 'PAID').length} lunas
                  </Text>
                  {invoice.installmentSummary?.nextInstallment ? (
                    <Text style={{ color: '#6d28d9', marginTop: 2, fontSize: 12 }}>
                      Termin berikutnya: {invoice.installmentSummary.nextInstallment.sequence} •{' '}
                      {formatDate(invoice.installmentSummary.nextInstallment.dueDate || '')}
                    </Text>
                  ) : null}
                  {(invoice.installmentSummary?.overdueCount || 0) > 0 ? (
                    <Text style={{ color: '#b91c1c', marginTop: 2, fontSize: 12 }}>
                      {invoice.installmentSummary?.overdueCount || 0} termin overdue • outstanding{' '}
                      {formatCurrency(invoice.installmentSummary?.overdueAmount || 0)}
                    </Text>
                  ) : null}
                  {invoice.lateFeeSummary?.configured ? (
                    <Text style={{ color: '#b45309', marginTop: 2, fontSize: 12 }}>
                      Denda keterlambatan: {formatCurrency(invoice.lateFeeSummary.appliedAmount)} diterapkan •{' '}
                      {formatCurrency(invoice.lateFeeSummary.pendingAmount)} berpotensi ditambahkan
                    </Text>
                  ) : null}
                  {invoice.isOverdue ? (
                    <Text style={{ color: '#b91c1c', marginTop: 2, fontSize: 12 }}>
                      Terlambat {invoice.daysPastDue} hari
                    </Text>
                  ) : null}
                </View>
              ))
            ) : (
              <Text style={{ color: '#64748b' }}>Belum ada tagihan.</Text>
            )}
          </View>

          <View
            style={{
              backgroundColor: '#fff',
              borderWidth: 1,
              borderColor: '#dbe7fb',
              borderRadius: 12,
              padding: 12,
              marginBottom: 12,
            }}
          >
            <Text style={{ color: BRAND_COLORS.textDark, fontWeight: '700', marginBottom: 8 }}>
              Riwayat Pembayaran
            </Text>
            {overview.payments.length > 0 ? (
              overview.payments.map((payment) => (
                <View
                  key={payment.id}
                  style={{
                    paddingVertical: 10,
                    borderBottomWidth: 1,
                    borderBottomColor: '#eef2ff',
                  }}
                >
                  <View style={{ flexDirection: 'row', justifyContent: 'space-between', alignItems: 'center' }}>
                    <Text style={{ color: BRAND_COLORS.textDark, fontWeight: '600' }}>
                      {payment.type === 'MONTHLY' ? 'SPP Bulanan' : 'Pembayaran Lain'}
                    </Text>
                    <View
                      style={{
                        borderWidth: 1,
                        borderColor: `${PAYMENT_STATUS_COLORS[payment.status]}66`,
                        backgroundColor: `${PAYMENT_STATUS_COLORS[payment.status]}1a`,
                        borderRadius: 999,
                        paddingHorizontal: 8,
                        paddingVertical: 2,
                      }}
                    >
                      <Text
                        style={{
                          color: PAYMENT_STATUS_COLORS[payment.status],
                          fontWeight: '700',
                          fontSize: 11,
                        }}
                      >
                        {PAYMENT_STATUS_LABELS[payment.status]}
                      </Text>
                    </View>
                  </View>
                  <Text style={{ color: BRAND_COLORS.textMuted, marginTop: 2, fontSize: 12 }}>
                    Sumber: {getPaymentSourceLabel(payment.source)}
                  </Text>
                  <Text style={{ color: BRAND_COLORS.textMuted, marginTop: 2, fontSize: 12 }}>
                    {getPaymentMethodLabel(payment.method)}
                    {payment.referenceNo ? ` • Ref ${payment.referenceNo}` : ''}
                  </Text>
                  <View
                    style={{
                      alignSelf: 'flex-start',
                      borderWidth: 1,
                      borderColor: getVerificationTone(payment.verificationStatus).border,
                      backgroundColor: getVerificationTone(payment.verificationStatus).background,
                      borderRadius: 999,
                      paddingHorizontal: 8,
                      paddingVertical: 2,
                      marginTop: 6,
                    }}
                  >
                    <Text
                      style={{
                        color: getVerificationTone(payment.verificationStatus).text,
                        fontSize: 11,
                        fontWeight: '700',
                      }}
                    >
                      {getVerificationTone(payment.verificationStatus).label}
                    </Text>
                  </View>
                  <Text style={{ color: BRAND_COLORS.textDark, fontWeight: '700', marginTop: 4 }}>
                    {formatCurrency(payment.amount)}
                  </Text>
                  {Number(payment.creditedAmount || 0) > 0 ? (
                    <Text style={{ color: '#0369a1', marginTop: 2, fontSize: 12 }}>
                      Saldo kredit: {formatCurrency(payment.creditedAmount || 0)}
                    </Text>
                  ) : null}
                  {Number(payment.reversedAmount || 0) > 0 ? (
                    <Text style={{ color: '#be123c', marginTop: 2, fontSize: 12 }}>
                      Direversal: {formatCurrency(payment.reversedAmount || 0)}
                    </Text>
                  ) : null}
                  <Text style={{ color: '#64748b', marginTop: 2, fontSize: 12 }}>
                    Tanggal: {formatDate(payment.createdAt)}
                  </Text>
                  {payment.proofFile?.url ? (
                    <Pressable
                      onPress={() => {
                        const url = resolveAssetUrl(payment.proofFile?.url);
                        if (url) {
                          openWebModuleRoute(router, {
                            moduleKey: 'student-finance-proof',
                            webPath: url,
                            label: payment.proofFile?.name || 'Bukti Pembayaran',
                          });
                        }
                      }}
                      style={{ marginTop: 6 }}
                    >
                      <Text style={{ color: BRAND_COLORS.blue, fontSize: 12, fontWeight: '700' }}>
                        Lihat bukti bayar
                        {payment.proofFile?.name ? ` • ${payment.proofFile.name}` : ''}
                      </Text>
                    </Pressable>
                  ) : null}
                  {Number(payment.creditedAmount || 0) > 0 ? (
                    <Text style={{ color: '#64748b', marginTop: 2, fontSize: 12 }}>
                      Dialokasikan ke invoice: {formatCurrency(payment.allocatedAmount || 0)}
                    </Text>
                  ) : null}
                  {Number(payment.reversedAmount || 0) > 0 ? (
                    <Text style={{ color: '#64748b', marginTop: 2, fontSize: 12 }}>
                      Dikoreksi: alokasi dibalik {formatCurrency(payment.reversedAllocatedAmount || 0)}
                      {Number(payment.reversedCreditedAmount || 0) > 0
                        ? ` • saldo kredit dibalik ${formatCurrency(payment.reversedCreditedAmount || 0)}`
                        : ''}
                    </Text>
                  ) : null}
                  {payment.verificationNote ? (
                    <Text style={{ color: '#64748b', marginTop: 2, fontSize: 12 }}>
                      Catatan verifikasi: {payment.verificationNote}
                    </Text>
                  ) : null}
                </View>
              ))
            ) : (
              <Text style={{ color: '#64748b' }}>Belum ada histori pembayaran.</Text>
            )}
          </View>

          <View
            style={{
              backgroundColor: '#fff',
              borderWidth: 1,
              borderColor: '#dbe7fb',
              borderRadius: 12,
              padding: 12,
              marginBottom: 12,
            }}
          >
            <Text style={{ color: BRAND_COLORS.textDark, fontWeight: '700', marginBottom: 8 }}>
              Saldo Kredit & Refund
            </Text>
            {overview.creditBalance.refunds.length > 0 ? (
              <>
                <View
                  style={{
                    borderWidth: 1,
                    borderColor: '#bae6fd',
                    backgroundColor: '#f0f9ff',
                    borderRadius: 10,
                    padding: 10,
                    marginBottom: 10,
                  }}
                >
                  <Text style={{ color: '#0369a1', fontSize: 11 }}>Saldo kredit aktif</Text>
                  <Text style={{ color: '#0c4a6e', fontWeight: '700', fontSize: 16, marginTop: 4 }}>
                    {formatCurrency(overview.creditBalance.balanceAmount)}
                  </Text>
                </View>
                {overview.creditBalance.refunds.map((refund) => (
                  <View
                    key={refund.id}
                    style={{
                      paddingVertical: 10,
                      borderBottomWidth: 1,
                      borderBottomColor: '#eef2ff',
                    }}
                  >
                    <Text style={{ color: BRAND_COLORS.textDark, fontWeight: '700' }}>{refund.refundNo}</Text>
                    <Text style={{ color: BRAND_COLORS.textMuted, fontSize: 12, marginTop: 2 }}>
                      {formatDate(refund.refundedAt)} • {getPaymentMethodLabel(refund.method)}
                      {refund.referenceNo ? ` • Ref ${refund.referenceNo}` : ''}
                    </Text>
                    {refund.note ? (
                      <Text style={{ color: BRAND_COLORS.textMuted, fontSize: 12, marginTop: 2 }}>
                        {refund.note}
                      </Text>
                    ) : null}
                    <Text style={{ color: '#0369a1', fontWeight: '700', marginTop: 4 }}>
                      {formatCurrency(refund.amount)}
                    </Text>
                  </View>
                ))}
              </>
            ) : (
              <Text style={{ color: '#64748b' }}>
                {overview.creditBalance.balanceAmount
                  ? `Belum ada refund. Saldo kredit aktif saat ini ${formatCurrency(overview.creditBalance.balanceAmount)}.`
                  : 'Belum ada saldo kredit maupun refund.'}
              </Text>
            )}
          </View>
        </>
      ) : null}

      <Pressable
        onPress={() => router.replace('/home')}
        style={{
          backgroundColor: BRAND_COLORS.blue,
          borderRadius: 10,
          paddingVertical: 12,
          alignItems: 'center',
        }}
      >
        <Text style={{ color: '#fff', fontWeight: '700' }}>Kembali ke Home</Text>
      </Pressable>
    </ScrollView>
  );
}
