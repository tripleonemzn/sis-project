import { useQuery } from '@tanstack/react-query';
import { CreditCard, Loader2, RefreshCw, Wallet } from 'lucide-react';
import { studentFinanceService, type StudentPaymentStatus } from '../../services/studentFinance.service';

type StudentInvoiceStatus = 'UNPAID' | 'PARTIAL' | 'PAID' | 'CANCELLED';

function formatCurrency(value: number): string {
  return new Intl.NumberFormat('id-ID', {
    style: 'currency',
    currency: 'IDR',
    maximumFractionDigits: 0,
  }).format(Number(value || 0));
}

function formatDate(value?: string | null): string {
  if (!value) return '-';
  const date = new Date(value);
  if (Number.isNaN(date.getTime())) return '-';
  return new Intl.DateTimeFormat('id-ID', {
    day: '2-digit',
    month: 'short',
    year: 'numeric',
    hour: '2-digit',
    minute: '2-digit',
  }).format(date);
}

function getStatusBadgeClass(status: StudentPaymentStatus): string {
  if (status === 'PAID') return 'border-emerald-200 bg-emerald-50 text-emerald-700';
  if (status === 'PARTIAL') return 'border-amber-200 bg-amber-50 text-amber-700';
  if (status === 'CANCELLED') return 'border-rose-200 bg-rose-50 text-rose-700';
  return 'border-slate-200 bg-slate-50 text-slate-700';
}

function getStatusLabel(status: StudentPaymentStatus): string {
  if (status === 'PAID') return 'Lunas';
  if (status === 'PARTIAL') return 'Cicil';
  if (status === 'CANCELLED') return 'Dibatalkan';
  return 'Belum Lunas';
}

function getPaymentSourceLabel(source?: 'DIRECT' | 'CREDIT_BALANCE' | null): string {
  return source === 'CREDIT_BALANCE' ? 'Saldo Kredit' : 'Pembayaran Langsung';
}

function getPaymentMethodLabel(
  method?: 'CASH' | 'BANK_TRANSFER' | 'VIRTUAL_ACCOUNT' | 'E_WALLET' | 'OTHER' | null,
): string {
  if (method === 'BANK_TRANSFER') return 'Transfer Bank';
  if (method === 'VIRTUAL_ACCOUNT') return 'Virtual Account';
  if (method === 'E_WALLET') return 'E-Wallet / QRIS';
  if (method === 'CASH') return 'Tunai';
  if (method === 'OTHER') return 'Metode Lain';
  return 'Metode belum dicatat';
}

function getInvoiceStatusBadgeClass(status: StudentInvoiceStatus): string {
  if (status === 'PAID') return 'border-emerald-200 bg-emerald-50 text-emerald-700';
  if (status === 'PARTIAL') return 'border-amber-200 bg-amber-50 text-amber-700';
  if (status === 'CANCELLED') return 'border-rose-200 bg-rose-50 text-rose-700';
  return 'border-slate-200 bg-slate-50 text-slate-700';
}

function getInvoiceStatusLabel(status: StudentInvoiceStatus): string {
  if (status === 'PAID') return 'Lunas';
  if (status === 'PARTIAL') return 'Cicil';
  if (status === 'CANCELLED') return 'Dibatalkan';
  return 'Belum Lunas';
}

function getActionCenterBadgeClass(
  state:
    | 'NO_INVOICE'
    | 'OVERDUE'
    | 'LATE_FEE_WARNING'
    | 'DUE_SOON'
    | 'CREDIT_AVAILABLE'
    | 'UP_TO_DATE',
): string {
  if (state === 'OVERDUE') return 'border-rose-200 bg-rose-50 text-rose-700';
  if (state === 'LATE_FEE_WARNING') return 'border-amber-200 bg-amber-50 text-amber-700';
  if (state === 'DUE_SOON') return 'border-violet-200 bg-violet-50 text-violet-700';
  if (state === 'CREDIT_AVAILABLE') return 'border-sky-200 bg-sky-50 text-sky-700';
  if (state === 'NO_INVOICE') return 'border-slate-200 bg-slate-50 text-slate-700';
  return 'border-emerald-200 bg-emerald-50 text-emerald-700';
}

function getActionCenterLabel(
  state:
    | 'NO_INVOICE'
    | 'OVERDUE'
    | 'LATE_FEE_WARNING'
    | 'DUE_SOON'
    | 'CREDIT_AVAILABLE'
    | 'UP_TO_DATE',
): string {
  if (state === 'OVERDUE') return 'Prioritas';
  if (state === 'LATE_FEE_WARNING') return 'Warning';
  if (state === 'DUE_SOON') return 'Segera';
  if (state === 'CREDIT_AVAILABLE') return 'Saldo';
  if (state === 'NO_INVOICE') return 'Info';
  return 'Aman';
}

export default function StudentFinancePage() {
  const financeQuery = useQuery({
    queryKey: ['student-finance-overview-web', 50],
    queryFn: () => studentFinanceService.getOverview({ limit: 50 }),
  });

  const overview = financeQuery.data;
  const unpaidAmount =
    Number(overview?.summary.status.pendingAmount || 0) +
    Number(overview?.summary.status.partialAmount || 0);
  const actionCenter = overview?.actionCenter;
  const latestRefund = overview?.creditBalance.refunds?.[0] || actionCenter?.latestRefund || null;

  return (
    <div className="space-y-6">
      <div className="bg-white rounded-xl border border-gray-100 shadow-sm p-5">
        <div className="flex flex-col md:flex-row md:items-center md:justify-between gap-4">
          <div>
            <h1 className="text-2xl font-bold text-gray-900">Keuangan</h1>
            <p className="text-sm text-gray-500 mt-1">
              Ringkasan tagihan dan histori pembayaran Anda.
            </p>
          </div>
          <button
            type="button"
            onClick={() => financeQuery.refetch()}
            className="inline-flex items-center justify-center gap-2 rounded-lg border border-gray-300 bg-white px-3 py-2 text-sm font-medium text-gray-700 hover:bg-gray-50"
          >
            <RefreshCw className={`h-4 w-4 ${financeQuery.isFetching ? 'animate-spin' : ''}`} />
            Muat Ulang
          </button>
        </div>
        {overview?.student ? (
          <p className="text-xs text-gray-500 mt-3">
            {overview.student.name} • {overview.student.studentClass?.name || 'Tanpa kelas'} • NISN:{' '}
            {overview.student.nisn || '-'}
          </p>
        ) : null}
      </div>

      <div className="grid grid-cols-1 md:grid-cols-5 gap-4">
        <div className="rounded-xl border border-blue-100 bg-gradient-to-br from-blue-50 to-sky-100/80 p-4">
          <p className="text-xs text-blue-700/80">Total Tagihan</p>
          <p className="mt-2 text-xl font-bold text-blue-900">
            {formatCurrency(overview?.summary.totalAmount || 0)}
          </p>
        </div>
        <div className="rounded-xl border border-emerald-100 bg-gradient-to-br from-emerald-50 to-teal-100/80 p-4">
          <p className="text-xs text-emerald-700/80">Sudah Dibayar</p>
          <p className="mt-2 text-xl font-bold text-emerald-900">
            {formatCurrency(overview?.summary.status.paidAmount || 0)}
          </p>
        </div>
        <div className="rounded-xl border border-amber-100 bg-gradient-to-br from-amber-50 to-orange-100/80 p-4">
          <p className="text-xs text-amber-700/80">Belum Lunas</p>
          <p className="mt-2 text-xl font-bold text-amber-900">{formatCurrency(unpaidAmount)}</p>
        </div>
        <div className="rounded-xl border border-rose-100 bg-gradient-to-br from-rose-50 to-pink-100/80 p-4">
          <p className="text-xs text-rose-700/80">Overdue</p>
          <p className="mt-2 text-xl font-bold text-rose-900">
            {overview?.summary.overdueCount || 0} tagihan
          </p>
          <p className="text-xs text-rose-700/80 mt-1">
            {formatCurrency(overview?.summary.overdueAmount || 0)}
          </p>
        </div>
        <div className="rounded-xl border border-sky-100 bg-gradient-to-br from-sky-50 to-cyan-100/80 p-4">
          <p className="text-xs text-sky-700/80">Saldo Kredit</p>
          <p className="mt-2 text-xl font-bold text-sky-900">
            {formatCurrency(overview?.summary.creditBalance || 0)}
          </p>
          <p className="text-xs text-sky-700/80 mt-1">
            Kelebihan bayar otomatis tersimpan
          </p>
        </div>
      </div>

      {actionCenter ? (
        <div className="bg-white rounded-xl border border-gray-100 shadow-sm p-5">
          <div className="flex flex-col lg:flex-row lg:items-start lg:justify-between gap-4">
            <div>
              <p className="text-xs uppercase tracking-wider text-gray-500">Pusat Tindak Lanjut</p>
              <h2 className="mt-2 text-lg font-semibold text-gray-900">{actionCenter.headline}</h2>
              <p className="mt-2 text-sm text-gray-600">{actionCenter.detail}</p>
            </div>
            <span
              className={`inline-flex items-center rounded-full border px-3 py-1 text-xs font-semibold ${getActionCenterBadgeClass(actionCenter.state)}`}
            >
              {getActionCenterLabel(actionCenter.state)}
            </span>
          </div>

          <div className="mt-4 grid grid-cols-1 md:grid-cols-3 gap-3">
            <div className="rounded-lg border border-violet-100 bg-violet-50/70 p-3">
              <p className="text-[11px] uppercase tracking-wide text-violet-700">Termin Berikutnya</p>
              <p className="mt-2 text-sm font-semibold text-violet-900">
                {actionCenter.nextDue?.invoiceNo || 'Belum ada agenda'}
              </p>
              <p className="mt-1 text-xs text-violet-700">
                {actionCenter.nextDue?.dueDate
                  ? `${formatDate(actionCenter.nextDue.dueDate)} • ${formatCurrency(actionCenter.nextDue.balanceAmount)}`
                  : 'Tidak ada termin aktif yang perlu dipantau'}
              </p>
            </div>
            <div className="rounded-lg border border-amber-100 bg-amber-50/70 p-3">
              <p className="text-[11px] uppercase tracking-wide text-amber-700">Potensi Denda</p>
              <p className="mt-2 text-sm font-semibold text-amber-900">
                {formatCurrency(actionCenter.pendingLateFeeAmount)}
              </p>
              <p className="mt-1 text-xs text-amber-700">
                {actionCenter.overdueInstallmentCount} termin overdue • diterapkan{' '}
                {formatCurrency(actionCenter.appliedLateFeeAmount)}
              </p>
            </div>
            <div className="rounded-lg border border-sky-100 bg-sky-50/70 p-3">
              <p className="text-[11px] uppercase tracking-wide text-sky-700">Saldo Kredit & Refund</p>
              <p className="mt-2 text-sm font-semibold text-sky-900">
                {formatCurrency(actionCenter.creditBalanceAmount)}
              </p>
              <p className="mt-1 text-xs text-sky-700">
                {latestRefund
                  ? `Refund terakhir ${latestRefund.refundNo} • ${formatDate(latestRefund.refundedAt)}`
                  : 'Belum ada refund saldo kredit'}
              </p>
            </div>
          </div>
        </div>
      ) : null}

      <div className="bg-white rounded-xl border border-gray-100 shadow-sm overflow-hidden">
        <div className="px-5 py-4 border-b border-gray-100 flex items-center gap-2">
          <CreditCard className="w-4 h-4 text-amber-600" />
          <h2 className="text-sm font-semibold text-gray-900">Tagihan Aktif</h2>
        </div>

        {financeQuery.isLoading ? (
          <div className="py-10 flex items-center justify-center">
            <Loader2 className="w-6 h-6 animate-spin text-blue-600" />
          </div>
        ) : financeQuery.isError ? (
          <div className="py-10 text-center text-sm text-rose-600">
            Gagal memuat data tagihan.
          </div>
        ) : overview?.invoices?.length ? (
          <div className="overflow-x-auto">
            <table className="min-w-full divide-y divide-gray-200">
              <thead className="bg-gray-50">
                <tr>
                  <th className="px-5 py-3 text-left text-xs font-semibold text-gray-500 uppercase tracking-wide">
                    Invoice
                  </th>
                  <th className="px-5 py-3 text-left text-xs font-semibold text-gray-500 uppercase tracking-wide">
                    Jatuh Tempo
                  </th>
                  <th className="px-5 py-3 text-right text-xs font-semibold text-gray-500 uppercase tracking-wide">
                    Sisa
                  </th>
                  <th className="px-5 py-3 text-left text-xs font-semibold text-gray-500 uppercase tracking-wide">
                    Status
                  </th>
                </tr>
              </thead>
              <tbody className="divide-y divide-gray-100">
                {overview.invoices.map((invoice) => (
                  <tr key={invoice.id} className="hover:bg-gray-50">
                    <td className="px-5 py-3 text-sm text-gray-700">
                      <div className="font-semibold text-gray-900">{invoice.invoiceNo}</div>
                      <div className="text-xs text-gray-500">
                        {invoice.title || `${invoice.periodKey} • ${invoice.semester === 'ODD' ? 'Ganjil' : 'Genap'}`}
                      </div>
                      {invoice.items.length ? (
                        <div className="mt-1 text-[11px] text-gray-500">
                          Komponen: {invoice.items.map((item) => item.componentName).join(' • ')}
                        </div>
                      ) : null}
                      <div className="mt-1 text-[11px] text-violet-700">
                        {invoice.installmentSummary.totalCount} termin • {invoice.installmentSummary.paidCount} lunas
                      </div>
                    </td>
                    <td className="px-5 py-3 text-sm text-gray-700">
                      {formatDate(invoice.dueDate || '')}
                      {invoice.isOverdue ? (
                        <div className="text-xs text-rose-600">Terlambat {invoice.daysPastDue} hari</div>
                      ) : null}
                      {invoice.installmentSummary.nextInstallment ? (
                        <div className="mt-1 text-[11px] text-violet-700">
                          Termin berikutnya: {invoice.installmentSummary.nextInstallment.sequence} •{' '}
                          {formatDate(invoice.installmentSummary.nextInstallment.dueDate || '')}
                        </div>
                      ) : null}
                      {invoice.installmentSummary.overdueCount > 0 ? (
                        <div className="mt-1 text-[11px] text-rose-600">
                          {invoice.installmentSummary.overdueCount} termin overdue • outstanding{' '}
                          {formatCurrency(invoice.installmentSummary.overdueAmount)}
                        </div>
                      ) : null}
                      {invoice.lateFeeSummary?.configured ? (
                        <div className="mt-1 text-[11px] text-amber-700">
                          Denda keterlambatan: {formatCurrency(invoice.lateFeeSummary.appliedAmount)} diterapkan •{' '}
                          {formatCurrency(invoice.lateFeeSummary.pendingAmount)} berpotensi ditambahkan
                        </div>
                      ) : null}
                    </td>
                    <td className="px-5 py-3 text-sm text-right font-semibold text-gray-900">
                      {formatCurrency(invoice.balanceAmount)}
                    </td>
                    <td className="px-5 py-3 text-sm">
                      <span
                        className={`inline-flex items-center rounded-full border px-2 py-0.5 text-xs font-semibold ${getInvoiceStatusBadgeClass(invoice.status)}`}
                      >
                        {getInvoiceStatusLabel(invoice.status)}
                      </span>
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        ) : (
          <div className="py-10 text-center text-sm text-gray-500">
            Belum ada tagihan.
          </div>
        )}
      </div>

      <div className="bg-white rounded-xl border border-gray-100 shadow-sm overflow-hidden">
        <div className="px-5 py-4 border-b border-gray-100 flex items-center gap-2">
          <Wallet className="w-4 h-4 text-blue-600" />
          <h2 className="text-sm font-semibold text-gray-900">Riwayat Pembayaran</h2>
        </div>

        {financeQuery.isLoading ? (
          <div className="py-12 flex items-center justify-center">
            <Loader2 className="w-6 h-6 animate-spin text-blue-600" />
          </div>
        ) : financeQuery.isError ? (
          <div className="py-10 text-center text-sm text-rose-600">
            Gagal memuat data keuangan. Coba muat ulang.
          </div>
        ) : overview?.payments?.length ? (
          <div className="overflow-x-auto">
            <table className="min-w-full divide-y divide-gray-200">
              <thead className="bg-gray-50">
                <tr>
                  <th className="px-5 py-3 text-left text-xs font-semibold text-gray-500 uppercase tracking-wide">
                    Tanggal
                  </th>
                  <th className="px-5 py-3 text-left text-xs font-semibold text-gray-500 uppercase tracking-wide">
                    Jenis
                  </th>
                  <th className="px-5 py-3 text-right text-xs font-semibold text-gray-500 uppercase tracking-wide">
                    Nominal
                  </th>
                  <th className="px-5 py-3 text-left text-xs font-semibold text-gray-500 uppercase tracking-wide">
                    Status
                  </th>
                </tr>
              </thead>
              <tbody className="divide-y divide-gray-100">
                {overview.payments.map((payment) => (
                  <tr key={payment.id} className="hover:bg-gray-50">
                    <td className="px-5 py-3 text-sm text-gray-700">{formatDate(payment.createdAt)}</td>
                    <td className="px-5 py-3 text-sm text-gray-700">
                      <span className="inline-flex items-center gap-1.5">
                        <CreditCard className="w-3.5 h-3.5 text-gray-400" />
                        {payment.type === 'MONTHLY' ? 'Bulanan' : 'Sekali Bayar'}
                      </span>
                      <div className="mt-1 text-[11px] text-slate-500">{getPaymentSourceLabel(payment.source)}</div>
                      <div className="mt-1 text-[11px] text-slate-500">
                        {getPaymentMethodLabel(payment.method)}
                        {payment.referenceNo ? ` • Ref ${payment.referenceNo}` : ''}
                      </div>
                    </td>
                    <td className="px-5 py-3 text-sm text-right font-semibold text-gray-900">
                      {formatCurrency(payment.amount)}
                      {Number(payment.creditedAmount || 0) > 0 ? (
                        <div className="text-[11px] font-normal text-sky-700 mt-1">
                          Kredit: {formatCurrency(payment.creditedAmount || 0)}
                        </div>
                      ) : null}
                      {Number(payment.reversedAmount || 0) > 0 ? (
                        <div className="text-[11px] font-normal text-rose-700 mt-1">
                          Direversal: {formatCurrency(payment.reversedAmount || 0)}
                        </div>
                      ) : null}
                    </td>
                    <td className="px-5 py-3 text-sm">
                      <span
                        className={`inline-flex items-center rounded-full border px-2 py-0.5 text-xs font-semibold ${getStatusBadgeClass(payment.status)}`}
                      >
                        {getStatusLabel(payment.status)}
                      </span>
                      {Number(payment.creditedAmount || 0) > 0 ? (
                        <div className="mt-1 text-[11px] text-gray-500">
                          Dialokasikan ke invoice {formatCurrency(payment.allocatedAmount || 0)}
                        </div>
                      ) : null}
                      {Number(payment.reversedAmount || 0) > 0 ? (
                        <div className="mt-1 text-[11px] text-rose-600">
                          Pembayaran ini sudah dikoreksi. Alokasi dibalik {formatCurrency(payment.reversedAllocatedAmount || 0)}
                          {Number(payment.reversedCreditedAmount || 0) > 0
                            ? ` • saldo kredit dibalik ${formatCurrency(payment.reversedCreditedAmount || 0)}`
                            : ''}
                        </div>
                      ) : null}
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        ) : (
          <div className="py-10 text-center text-sm text-gray-500">
            Belum ada histori pembayaran.
          </div>
        )}
      </div>

      <div className="bg-white rounded-xl border border-gray-100 shadow-sm overflow-hidden">
        <div className="px-5 py-4 border-b border-gray-100 flex items-center gap-2">
          <Wallet className="w-4 h-4 text-sky-600" />
          <h2 className="text-sm font-semibold text-gray-900">Saldo Kredit & Refund</h2>
        </div>
        {overview?.creditBalance.refunds?.length ? (
          <div className="divide-y divide-gray-100">
            <div className="px-5 py-4 bg-sky-50/70">
              <p className="text-xs text-sky-700">Saldo kredit aktif</p>
              <p className="mt-1 text-lg font-semibold text-sky-900">
                {formatCurrency(overview.creditBalance.balanceAmount)}
              </p>
            </div>
            {overview.creditBalance.refunds.map((refund) => (
              <div key={refund.id} className="px-5 py-4">
                <div className="flex flex-col md:flex-row md:items-center md:justify-between gap-2">
                  <div>
                    <p className="text-sm font-semibold text-gray-900">{refund.refundNo}</p>
                    <p className="mt-1 text-xs text-gray-500">
                      {formatDate(refund.refundedAt)} • {getPaymentMethodLabel(refund.method)}
                      {refund.referenceNo ? ` • Ref ${refund.referenceNo}` : ''}
                    </p>
                    {refund.note ? (
                      <p className="mt-1 text-xs text-gray-500">{refund.note}</p>
                    ) : null}
                  </div>
                  <p className="text-sm font-semibold text-sky-800">{formatCurrency(refund.amount)}</p>
                </div>
              </div>
            ))}
          </div>
        ) : (
          <div className="px-5 py-8 text-sm text-gray-500">
            {overview?.creditBalance.balanceAmount
              ? `Belum ada refund. Saldo kredit aktif saat ini ${formatCurrency(overview.creditBalance.balanceAmount)}.`
              : 'Belum ada saldo kredit maupun refund.'}
          </div>
        )}
      </div>
    </div>
  );
}
