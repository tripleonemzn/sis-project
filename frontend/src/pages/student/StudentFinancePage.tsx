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

export default function StudentFinancePage() {
  const financeQuery = useQuery({
    queryKey: ['student-finance-overview-web', 50],
    queryFn: () => studentFinanceService.getOverview({ limit: 50 }),
  });

  const overview = financeQuery.data;
  const unpaidAmount =
    Number(overview?.summary.status.pendingAmount || 0) +
    Number(overview?.summary.status.partialAmount || 0);

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
                    </td>
                    <td className="px-5 py-3 text-sm text-gray-700">
                      {formatDate(invoice.dueDate || '')}
                      {invoice.isOverdue ? (
                        <div className="text-xs text-rose-600">Terlambat {invoice.daysPastDue} hari</div>
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
                    </td>
                    <td className="px-5 py-3 text-sm text-right font-semibold text-gray-900">
                      {formatCurrency(payment.amount)}
                      {Number(payment.creditedAmount || 0) > 0 ? (
                        <div className="text-[11px] font-normal text-sky-700 mt-1">
                          Kredit: {formatCurrency(payment.creditedAmount || 0)}
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
    </div>
  );
}
