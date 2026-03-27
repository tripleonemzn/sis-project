import { Redirect, useRouter } from 'expo-router';
import { Pressable, RefreshControl, ScrollView, Text, View } from 'react-native';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import { AppLoadingScreen } from '../../../src/components/AppLoadingScreen';
import { QueryStateView } from '../../../src/components/QueryStateView';
import { OfflineCacheNotice } from '../../../src/components/OfflineCacheNotice';
import { useAuth } from '../../../src/features/auth/AuthProvider';
import { useStudentFinanceOverviewQuery } from '../../../src/features/student/useStudentFinanceOverviewQuery';
import { StudentPaymentStatus } from '../../../src/features/student/studentFinanceApi';
import { getStandardPagePadding } from '../../../src/lib/ui/pageLayout';
import { BRAND_COLORS } from '../../../src/config/brand';

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

  const overview = financeQuery.data?.overview;
  const unpaidAmount =
    Number(overview?.summary.status.pendingAmount || 0) +
    Number(overview?.summary.status.partialAmount || 0);

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
                </View>
              ))
            ) : (
              <Text style={{ color: '#64748b' }}>Belum ada histori pembayaran.</Text>
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
