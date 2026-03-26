import { useEffect, useMemo, useState } from 'react';
import { Redirect, useLocalSearchParams, useRouter } from 'expo-router';
import { Pressable, RefreshControl, ScrollView, Text, View } from 'react-native';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import { AppLoadingScreen } from '../../../src/components/AppLoadingScreen';
import { QueryStateView } from '../../../src/components/QueryStateView';
import { OfflineCacheNotice } from '../../../src/components/OfflineCacheNotice';
import { useAuth } from '../../../src/features/auth/AuthProvider';
import { useParentChildrenQuery } from '../../../src/features/parent/useParentChildrenQuery';
import { useParentChildReportCardQuery } from '../../../src/features/parent/useParentChildReportCardQuery';
import { useParentFinanceOverviewQuery } from '../../../src/features/parent/useParentFinanceOverviewQuery';
import { academicYearApi } from '../../../src/features/academicYear/academicYearApi';
import { getStandardPagePadding } from '../../../src/lib/ui/pageLayout';
import { BRAND_COLORS } from '../../../src/config/brand';

const PAYMENT_STATUS_LABELS: Record<'PENDING' | 'PAID' | 'PARTIAL' | 'CANCELLED', string> = {
  PENDING: 'Belum Bayar',
  PAID: 'Lunas',
  PARTIAL: 'Parsial',
  CANCELLED: 'Dibatalkan',
};

const PAYMENT_STATUS_COLORS: Record<'PENDING' | 'PAID' | 'PARTIAL' | 'CANCELLED', string> = {
  PENDING: '#b45309',
  PAID: '#15803d',
  PARTIAL: '#1d4ed8',
  CANCELLED: '#b91c1c',
};

const INVOICE_STATUS_LABELS: Record<'UNPAID' | 'PARTIAL' | 'PAID' | 'CANCELLED', string> = {
  UNPAID: 'Belum Lunas',
  PARTIAL: 'Parsial',
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

function defaultSemesterByDate(): 'ODD' | 'EVEN' {
  const month = new Date().getMonth() + 1;
  return month >= 7 ? 'ODD' : 'EVEN';
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
  return date.toLocaleDateString('id-ID', { day: '2-digit', month: 'short', year: 'numeric' });
}

export default function ParentFinanceScreen() {
  const router = useRouter();
  const insets = useSafeAreaInsets();
  const params = useLocalSearchParams<{ childId?: string }>();
  const { isAuthenticated, isLoading, user } = useAuth();
  const pagePadding = getStandardPagePadding(insets, { bottom: 120 });
  const [manualSelectedChildId, setManualSelectedChildId] = useState<number | null>(null);
  const [semester, setSemester] = useState<'ODD' | 'EVEN'>(defaultSemesterByDate());
  const [activeYearId, setActiveYearId] = useState<number | null>(null);

  const childrenQuery = useParentChildrenQuery({ enabled: isAuthenticated, user });
  const children = useMemo(() => childrenQuery.data?.children ?? [], [childrenQuery.data?.children]);

  useEffect(() => {
    let isMounted = true;
    void (async () => {
      try {
        const activeYear = await academicYearApi.getActive();
        if (!isMounted) return;
        setActiveYearId(activeYear.id);
      } catch {
        if (!isMounted) return;
        setActiveYearId(null);
      }
    })();

    return () => {
      isMounted = false;
    };
  }, []);

  const selectedChildId = useMemo(() => {
    if (!children.length) return null;
    if (manualSelectedChildId && children.some((child) => child.id === manualSelectedChildId)) {
      return manualSelectedChildId;
    }
    const queryChildId = params.childId ? Number(params.childId) : null;
    const validQueryChildId =
      queryChildId && children.some((child) => child.id === queryChildId) ? queryChildId : null;
    return validQueryChildId ?? children[0].id;
  }, [children, manualSelectedChildId, params.childId]);

  const reportCardQuery = useParentChildReportCardQuery({
    enabled: isAuthenticated,
    user,
    childId: selectedChildId,
    academicYearId: activeYearId,
    semester,
  });

  const financeQuery = useParentFinanceOverviewQuery({
    enabled: isAuthenticated,
    user,
    childId: selectedChildId,
    limit: 25,
  });

  const selectedChild = children.find((child) => child.id === selectedChildId) || null;
  const reportCard = reportCardQuery.data?.reportCard;
  const attendanceSummary = reportCard?.attendanceSummary;
  const subjectCount = reportCard?.reportGrades?.length || 0;
  const highestScore = useMemo(() => {
    const grades = reportCard?.reportGrades || [];
    if (!grades.length) return null;
    return grades.reduce((max, item) => (item.finalScore > max ? item.finalScore : max), grades[0].finalScore);
  }, [reportCard]);

  const selectedChildFinance = useMemo(() => {
    const childrenOverview = financeQuery.data?.overview.children || [];
    if (!childrenOverview.length) return null;
    if (!selectedChildId) return childrenOverview[0];
    return childrenOverview.find((item) => item.student.id === selectedChildId) || null;
  }, [financeQuery.data?.overview.children, selectedChildId]);

  if (isLoading) return <AppLoadingScreen message="Memuat keuangan anak..." />;
  if (!isAuthenticated) return <Redirect href="/welcome" />;

  if (user?.role !== 'PARENT') {
    return (
      <ScrollView style={{ flex: 1, backgroundColor: '#f8fafc' }} contentContainerStyle={pagePadding}>
        <Text style={{ fontSize: 24, fontWeight: '700', marginBottom: 8 }}>Keuangan Anak</Text>
        <QueryStateView type="error" message="Halaman ini khusus untuk role orang tua." />
        <Pressable
          onPress={() => router.replace('/home')}
          style={{
            marginTop: 16,
            backgroundColor: BRAND_COLORS.blue,
            paddingVertical: 12,
            borderRadius: 10,
            alignItems: 'center',
          }}
        >
          <Text style={{ color: '#fff', fontWeight: '700' }}>Kembali ke Home</Text>
        </Pressable>
      </ScrollView>
    );
  }

  return (
    <ScrollView
      style={{ flex: 1, backgroundColor: '#f8fafc' }}
      contentContainerStyle={pagePadding}
      refreshControl={
        <RefreshControl
          refreshing={(childrenQuery.isFetching || reportCardQuery.isFetching || financeQuery.isFetching) && !childrenQuery.isLoading}
          onRefresh={() => {
            void childrenQuery.refetch();
            void reportCardQuery.refetch();
            void financeQuery.refetch();
          }}
        />
      }
    >
      <Text style={{ fontSize: 24, fontWeight: '700', marginBottom: 6, color: BRAND_COLORS.textDark }}>Keuangan Anak</Text>
      <Text style={{ color: BRAND_COLORS.textMuted, marginBottom: 12 }}>
        Pantau ringkasan pembayaran dan riwayat transaksi anak secara real-time.
      </Text>

      {childrenQuery.isLoading ? <QueryStateView type="loading" message="Mengambil data anak..." /> : null}
      {childrenQuery.isError ? (
        <QueryStateView type="error" message="Gagal memuat data anak." onRetry={() => childrenQuery.refetch()} />
      ) : null}

      {!childrenQuery.isLoading && !childrenQuery.isError ? (
        children.length > 0 ? (
          <View style={{ marginBottom: 12 }}>
            <Text style={{ color: BRAND_COLORS.textDark, fontWeight: '700', marginBottom: 8 }}>Pilih Anak</Text>
            <View style={{ flexDirection: 'row', flexWrap: 'wrap', marginHorizontal: -4 }}>
              {children.map((child) => {
                const selected = selectedChildId === child.id;
                return (
                  <View key={child.id} style={{ width: '50%', paddingHorizontal: 4, marginBottom: 8 }}>
                    <Pressable
                      onPress={() => setManualSelectedChildId(child.id)}
                      style={{
                        borderWidth: 1,
                        borderColor: selected ? BRAND_COLORS.blue : '#d5e1f5',
                        backgroundColor: selected ? '#e9f1ff' : '#fff',
                        borderRadius: 10,
                        paddingVertical: 10,
                        paddingHorizontal: 10,
                      }}
                    >
                      <Text numberOfLines={1} style={{ color: selected ? BRAND_COLORS.navy : BRAND_COLORS.textDark, fontWeight: '700' }}>
                        {child.name}
                      </Text>
                      <Text numberOfLines={1} style={{ color: '#64748b', fontSize: 12, marginTop: 2 }}>
                        {child.studentClass?.name || '-'}
                      </Text>
                    </Pressable>
                  </View>
                );
              })}
            </View>
          </View>
        ) : null
      ) : null}

      {selectedChild ? (
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
          <Text style={{ color: BRAND_COLORS.textDark, fontWeight: '700', fontSize: 16 }}>{selectedChild.name}</Text>
          <Text style={{ color: BRAND_COLORS.textMuted, marginTop: 2 }}>
            {selectedChild.studentClass?.name || '-'} • {selectedChild.nisn || '-'}
          </Text>
        </View>
      ) : null}

      {selectedChildId ? (
        <>
          {financeQuery.isLoading ? <QueryStateView type="loading" message="Mengambil data pembayaran..." /> : null}
          {financeQuery.isError ? (
            <QueryStateView type="error" message="Gagal memuat data pembayaran anak." onRetry={() => financeQuery.refetch()} />
          ) : null}
          {financeQuery.data?.fromCache ? <OfflineCacheNotice cachedAt={financeQuery.data.cachedAt} /> : null}

          {!financeQuery.isLoading && !financeQuery.isError ? (
            selectedChildFinance ? (
              <View style={{ marginBottom: 12 }}>
                <Text style={{ color: BRAND_COLORS.textDark, fontWeight: '700', marginBottom: 8 }}>Ringkasan Pembayaran</Text>
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
                      <Text style={{ color: '#64748b', fontSize: 11, marginBottom: 3 }}>Total Nominal</Text>
                      <Text style={{ color: BRAND_COLORS.textDark, fontWeight: '700', fontSize: 15 }}>
                        {formatCurrency(selectedChildFinance.summary.totalAmount)}
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
                      <Text style={{ color: '#64748b', fontSize: 11, marginBottom: 3 }}>Nominal Lunas</Text>
                      <Text style={{ color: '#15803d', fontWeight: '700', fontSize: 15 }}>
                        {formatCurrency(selectedChildFinance.summary.status.paidAmount)}
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
                        {formatCurrency(selectedChildFinance.summary.status.pendingAmount + selectedChildFinance.summary.status.partialAmount)}
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
                      <Text style={{ color: '#64748b', fontSize: 11, marginBottom: 3 }}>Lewat Jatuh Tempo</Text>
                      <Text style={{ color: '#b91c1c', fontWeight: '700', fontSize: 15 }}>
                        {selectedChildFinance.summary.overdueCount} tagihan
                      </Text>
                      <Text style={{ color: '#ef4444', marginTop: 2, fontSize: 12 }}>
                        {formatCurrency(selectedChildFinance.summary.overdueAmount)}
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
                        {formatCurrency(selectedChildFinance.summary.creditBalance)}
                      </Text>
                      <Text style={{ color: '#0ea5e9', marginTop: 2, fontSize: 12 }}>
                        Kelebihan bayar anak
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
                  }}
                >
                  <Text style={{ color: BRAND_COLORS.textDark, fontWeight: '700', marginBottom: 8 }}>Tagihan Siswa</Text>
                  {selectedChildFinance.invoices.length > 0 ? (
                    selectedChildFinance.invoices.map((invoice) => (
                      <View
                        key={`inv-${invoice.id}`}
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
                              {invoice.title ||
                                `${invoice.periodKey} • ${invoice.semester === 'ODD' ? 'Ganjil' : 'Genap'}`}
                            </Text>
                          </View>
                          <View
                            style={{
                              backgroundColor: `${INVOICE_STATUS_COLORS[invoice.status]}1a`,
                              borderRadius: 999,
                              paddingHorizontal: 8,
                              paddingVertical: 3,
                            }}
                          >
                            <Text style={{ color: INVOICE_STATUS_COLORS[invoice.status], fontSize: 11, fontWeight: '700' }}>
                              {INVOICE_STATUS_LABELS[invoice.status]}
                            </Text>
                          </View>
                        </View>
                        <View style={{ marginTop: 6, flexDirection: 'row', justifyContent: 'space-between' }}>
                          <Text style={{ color: BRAND_COLORS.textMuted, fontSize: 12 }}>
                            Jatuh tempo: {formatDate(invoice.dueDate || '')}
                          </Text>
                          <Text style={{ color: BRAND_COLORS.navy, fontWeight: '700', fontSize: 12 }}>
                            Sisa: {formatCurrency(invoice.balanceAmount)}
                          </Text>
                        </View>
                        <Text style={{ color: '#6d28d9', marginTop: 2, fontSize: 12 }}>
                          {(invoice.installments || []).length} termin • {(invoice.installments || []).filter((installment) => installment.status === 'PAID').length} lunas
                        </Text>
                        {(invoice.installments || []).length > 0 ? (
                          <Text style={{ color: '#6d28d9', marginTop: 2, fontSize: 12 }}>
                            Termin berikutnya: {(invoice.installments || []).find((installment) => installment.balanceAmount > 0)?.sequence || '-'}
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
                    <View
                      style={{
                        borderRadius: 10,
                        borderWidth: 1,
                        borderColor: '#cbd5e1',
                        borderStyle: 'dashed',
                        backgroundColor: '#fff',
                        padding: 12,
                        marginBottom: 10,
                      }}
                    >
                      <Text style={{ color: BRAND_COLORS.textMuted }}>Belum ada tagihan untuk anak ini.</Text>
                    </View>
                  )}

                  <Text style={{ color: BRAND_COLORS.textDark, fontWeight: '700', marginBottom: 8 }}>Riwayat Pembayaran Terbaru</Text>
                  {selectedChildFinance.payments.length > 0 ? (
                    selectedChildFinance.payments.map((payment) => (
                      <View
                        key={payment.id}
                        style={{
                          paddingVertical: 10,
                          borderBottomWidth: 1,
                          borderBottomColor: '#eef2ff',
                        }}
                      >
                        <View style={{ flexDirection: 'row', justifyContent: 'space-between', alignItems: 'center' }}>
                          <Text style={{ color: BRAND_COLORS.textDark, fontWeight: '700' }}>
                            {payment.type === 'MONTHLY' ? 'SPP Bulanan' : 'Pembayaran Lain'}
                          </Text>
                          <View
                            style={{
                              backgroundColor: `${PAYMENT_STATUS_COLORS[payment.status]}1a`,
                              borderRadius: 999,
                              paddingHorizontal: 8,
                              paddingVertical: 3,
                            }}
                          >
                            <Text style={{ color: PAYMENT_STATUS_COLORS[payment.status], fontSize: 11, fontWeight: '700' }}>
                              {PAYMENT_STATUS_LABELS[payment.status]}
                            </Text>
                          </View>
                        </View>
                        <Text style={{ color: BRAND_COLORS.textMuted, fontSize: 12, marginTop: 2 }}>
                          Sumber: {getPaymentSourceLabel(payment.source)}
                        </Text>
                        <Text style={{ color: BRAND_COLORS.navy, fontWeight: '700', marginTop: 5 }}>
                          {formatCurrency(payment.amount)}
                        </Text>
                        {Number(payment.creditedAmount || 0) > 0 ? (
                          <Text style={{ color: '#0369a1', fontSize: 12, marginTop: 2 }}>
                            Saldo kredit: {formatCurrency(payment.creditedAmount || 0)}
                          </Text>
                        ) : null}
                        <Text style={{ color: BRAND_COLORS.textMuted, fontSize: 12, marginTop: 2 }}>
                          Tanggal: {formatDate(payment.createdAt)}
                        </Text>
                        {Number(payment.creditedAmount || 0) > 0 ? (
                          <Text style={{ color: BRAND_COLORS.textMuted, fontSize: 12, marginTop: 2 }}>
                            Dialokasikan: {formatCurrency(payment.allocatedAmount || 0)}
                          </Text>
                        ) : null}
                      </View>
                    ))
                  ) : (
                    <View
                      style={{
                        borderRadius: 10,
                        borderWidth: 1,
                        borderColor: '#cbd5e1',
                        borderStyle: 'dashed',
                        backgroundColor: '#fff',
                        padding: 12,
                      }}
                    >
                      <Text style={{ color: BRAND_COLORS.textMuted }}>Belum ada transaksi pembayaran untuk anak ini.</Text>
                    </View>
                  )}
                </View>
              </View>
            ) : (
              <View
                style={{
                  borderRadius: 10,
                  borderWidth: 1,
                  borderColor: '#cbd5e1',
                  borderStyle: 'dashed',
                  backgroundColor: '#fff',
                  padding: 14,
                  marginBottom: 10,
                }}
              >
                <Text style={{ color: BRAND_COLORS.textDark, fontWeight: '700', marginBottom: 4 }}>Data Pembayaran Tidak Ditemukan</Text>
                <Text style={{ color: BRAND_COLORS.textMuted }}>
                  Data pembayaran belum tersedia untuk anak yang dipilih.
                </Text>
              </View>
            )
          ) : null}
        </>
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
        <Text style={{ color: BRAND_COLORS.textDark, fontWeight: '700', marginBottom: 8 }}>Semester</Text>
        <View style={{ flexDirection: 'row', gap: 8 }}>
          <Pressable
            onPress={() => setSemester('ODD')}
            style={{
              flex: 1,
              borderWidth: 1,
              borderColor: semester === 'ODD' ? BRAND_COLORS.blue : '#d5e1f5',
              backgroundColor: semester === 'ODD' ? '#e9f1ff' : '#fff',
              borderRadius: 9,
              alignItems: 'center',
              paddingVertical: 10,
            }}
          >
            <Text style={{ color: semester === 'ODD' ? BRAND_COLORS.navy : BRAND_COLORS.textMuted, fontWeight: '700' }}>
              Ganjil
            </Text>
          </Pressable>
          <Pressable
            onPress={() => setSemester('EVEN')}
            style={{
              flex: 1,
              borderWidth: 1,
              borderColor: semester === 'EVEN' ? BRAND_COLORS.blue : '#d5e1f5',
              backgroundColor: semester === 'EVEN' ? '#e9f1ff' : '#fff',
              borderRadius: 9,
              alignItems: 'center',
              paddingVertical: 10,
            }}
          >
            <Text style={{ color: semester === 'EVEN' ? BRAND_COLORS.navy : BRAND_COLORS.textMuted, fontWeight: '700' }}>
              Genap
            </Text>
          </Pressable>
        </View>
      </View>

      {selectedChildId && activeYearId ? (
        <>
          {reportCardQuery.isLoading ? <QueryStateView type="loading" message="Mengambil ringkasan akademik anak..." /> : null}
          {reportCardQuery.isError ? (
            <QueryStateView type="error" message="Gagal memuat ringkasan akademik anak." onRetry={() => reportCardQuery.refetch()} />
          ) : null}
          {reportCardQuery.data?.fromCache ? <OfflineCacheNotice cachedAt={reportCardQuery.data.cachedAt} /> : null}

          {!reportCardQuery.isLoading && !reportCardQuery.isError ? (
            <View>
              <Text style={{ color: BRAND_COLORS.textDark, fontWeight: '700', marginBottom: 8 }}>Ringkasan Akademik</Text>
              <View style={{ flexDirection: 'row', flexWrap: 'wrap', marginHorizontal: -4, marginBottom: 12 }}>
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
                    <Text style={{ color: '#64748b', fontSize: 11, marginBottom: 3 }}>Rata-rata Nilai</Text>
                    <Text style={{ color: BRAND_COLORS.textDark, fontWeight: '700', fontSize: 18 }}>
                      {Number(reportCard?.average || 0).toFixed(2)}
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
                    <Text style={{ color: '#64748b', fontSize: 11, marginBottom: 3 }}>Jumlah Mapel</Text>
                    <Text style={{ color: BRAND_COLORS.textDark, fontWeight: '700', fontSize: 18 }}>{subjectCount}</Text>
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
                    <Text style={{ color: '#64748b', fontSize: 11, marginBottom: 3 }}>Nilai Tertinggi</Text>
                    <Text style={{ color: BRAND_COLORS.textDark, fontWeight: '700', fontSize: 18 }}>
                      {highestScore != null ? Number(highestScore).toFixed(2) : '-'}
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
                    <Text style={{ color: '#64748b', fontSize: 11, marginBottom: 3 }}>Total Kehadiran</Text>
                    <Text style={{ color: BRAND_COLORS.textDark, fontWeight: '700', fontSize: 18 }}>
                      {(attendanceSummary?.hadir || 0) +
                        (attendanceSummary?.sakit || 0) +
                        (attendanceSummary?.izin || 0) +
                        (attendanceSummary?.alpha || 0)}
                    </Text>
                  </View>
                </View>
              </View>
            </View>
          ) : null}
        </>
      ) : (
        <View
          style={{
            borderRadius: 10,
            borderWidth: 1,
            borderColor: '#cbd5e1',
            borderStyle: 'dashed',
            backgroundColor: '#fff',
            padding: 14,
            marginBottom: 10,
          }}
        >
          <Text style={{ color: BRAND_COLORS.textDark, fontWeight: '700', marginBottom: 4 }}>Pilih Anak Terlebih Dahulu</Text>
          <Text style={{ color: BRAND_COLORS.textMuted }}>
            Data ringkasan akademik akan tampil setelah Anda memilih anak yang terhubung.
          </Text>
        </View>
      )}

      <Pressable
        onPress={() => router.replace('/home')}
        style={{
          marginTop: 10,
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
