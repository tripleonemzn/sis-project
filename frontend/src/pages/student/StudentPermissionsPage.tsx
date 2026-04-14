import { useState } from 'react';
import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query';
import { 
  Plus, 
  FileText, 
  Loader2, 
  CheckCircle, 
  XCircle, 
  Clock,
  Upload,
  X,
  Thermometer,
  UserCheck,
  MoreHorizontal,
  Calendar
} from 'lucide-react';
import { format } from 'date-fns';
import { id as idLocale } from 'date-fns/locale';
import { toast } from 'react-hot-toast';
import { permissionService, PermissionType, PermissionStatus } from '../../services/permission.service';
import { academicYearService } from '../../services/academicYear.service';
import { liveQueryOptions } from '../../lib/query/liveQuery';

export const StudentPermissionsPage = () => {
  const queryClient = useQueryClient();
  const [showModal, setShowModal] = useState(false);
  
  // Form State
  const [formData, setFormData] = useState({
    type: PermissionType.SICK as PermissionType,
    startDate: '',
    endDate: '',
    reason: '',
    file: null as File | null
  });

  // Fetch Active Academic Year
  const { data: activeYear } = useQuery({
    queryKey: ['active-academic-year'],
    queryFn: async () => {
      const res = await academicYearService.getActive();
      return res.data;
    }
  });

  // Fetch Permissions
  const { data: permissionsResponse, isLoading } = useQuery({
    queryKey: ['student-permissions', activeYear?.id],
    queryFn: () => permissionService.getPermissions({ 
      academicYearId: activeYear?.id,
      limit: 50 
    }),
    enabled: !!activeYear?.id,
    ...liveQueryOptions,
  });
  const permissions = permissionsResponse?.data?.permissions || [];

  // Create Mutation
  const createMutation = useMutation({
    mutationFn: async (data: typeof formData) => {
      if (!activeYear?.id) throw new Error('Tahun ajaran tidak aktif');

      let fileUrl = undefined;
      if (data.file) {
        const uploadRes = await permissionService.uploadFile(data.file);
        // Access nested data.url correctly based on ApiResponse wrapper
        // The service returns response.data which is ApiResponse<{url: string}>
        // So uploadRes.data.url is correct if service returns response.data
        // Let's verify service implementation: return response.data
        fileUrl = uploadRes.data.url;
      }

      return permissionService.requestPermission({
        type: data.type,
        startDate: new Date(data.startDate).toISOString(),
        endDate: new Date(data.endDate).toISOString(),
        reason: data.reason,
        fileUrl,
        academicYearId: activeYear.id
      });
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['student-permissions'] });
      setShowModal(false);
      setFormData({
        type: PermissionType.SICK,
        startDate: '',
        endDate: '',
        reason: '',
        file: null
      });
      toast.success('Pengajuan izin berhasil dikirim');
    },
    onError: (error: unknown) => {
      const message =
        typeof error === 'object' &&
        error !== null &&
        'response' in error &&
        typeof (error as { response?: { data?: { message?: string } } }).response?.data?.message ===
          'string'
          ? (error as { response?: { data?: { message?: string } } }).response?.data?.message
          : 'Gagal mengajukan izin';
      toast.error(message || 'Gagal mengajukan izin');
    }
  });

  const handleSubmit = (e: React.FormEvent) => {
    e.preventDefault();
    if (!formData.startDate || !formData.endDate || !formData.reason) {
      toast.error('Mohon lengkapi semua data wajib');
      return;
    }
    createMutation.mutate(formData);
  };

  const getStatusBadge = (status: PermissionStatus) => {
    switch (status) {
      case PermissionStatus.APPROVED:
        return (
          <span className="px-2 py-1 inline-flex text-xs leading-5 font-semibold rounded-full bg-green-100 text-green-800 items-center gap-1">
            <CheckCircle className="w-3 h-3" /> Disetujui
          </span>
        );
      case PermissionStatus.REJECTED:
        return (
          <span className="px-2 py-1 inline-flex text-xs leading-5 font-semibold rounded-full bg-red-100 text-red-800 items-center gap-1">
            <XCircle className="w-3 h-3" /> Ditolak
          </span>
        );
      default:
        return (
          <span className="px-2 py-1 inline-flex text-xs leading-5 font-semibold rounded-full bg-yellow-100 text-yellow-800 items-center gap-1">
            <Clock className="w-3 h-3" /> Menunggu
          </span>
        );
    }
  };

  const getTypeLabel = (type: PermissionType) => {
    switch (type) {
      case PermissionType.SICK: return 'Sakit';
      case PermissionType.PERMISSION: return 'Izin';
      case PermissionType.OTHER: return 'Lainnya';
      default: return type;
    }
  };

  return (
    <div className="space-y-6">
      <div className="flex justify-between items-center">
        <div>
          <h1 className="text-page-title font-bold text-gray-900">Perizinan</h1>
          <p className="text-gray-500 mt-1">
            Riwayat dan pengajuan izin ketidakhadiran
          </p>
        </div>
        <button
          onClick={() => setShowModal(true)}
          className="inline-flex items-center px-4 py-2 border border-transparent rounded-lg shadow-sm text-sm font-medium text-white bg-blue-600 hover:bg-blue-700 focus:outline-none focus:ring-2 focus:ring-offset-2 focus:ring-blue-500"
        >
          <Plus className="-ml-1 mr-2 h-5 w-5" />
          Ajukan Izin
        </button>
      </div>

      {/* Stats Cards could be added here if needed */}

      {/* List */}
      <div className="bg-white shadow-sm rounded-xl overflow-hidden border border-gray-200">
        {isLoading ? (
          <div className="p-12 flex justify-center">
            <Loader2 className="w-8 h-8 animate-spin text-blue-600" />
          </div>
        ) : permissions.length === 0 ? (
          <div className="p-12 text-center text-gray-500">
            <FileText className="w-12 h-12 mx-auto text-gray-300 mb-3" />
            <p className="font-medium">Belum ada riwayat perizinan</p>
            <p className="text-sm mt-1">Silakan ajukan izin jika Anda berhalangan hadir</p>
          </div>
        ) : (
          <div className="overflow-x-auto">
            <table className="min-w-full divide-y divide-gray-200">
              <thead className="bg-gray-50">
                <tr>
                  <th className="px-6 py-3 text-left text-xs font-medium text-gray-500 uppercase tracking-wider w-12">No</th>
                  <th className="px-6 py-3 text-left text-xs font-medium text-gray-500 uppercase tracking-wider">Tanggal Pengajuan</th>
                  <th className="px-6 py-3 text-left text-xs font-medium text-gray-500 uppercase tracking-wider">Tanggal Izin</th>
                  <th className="px-6 py-3 text-left text-xs font-medium text-gray-500 uppercase tracking-wider">Jenis</th>
                  <th className="px-6 py-3 text-left text-xs font-medium text-gray-500 uppercase tracking-wider">Keterangan</th>
                  <th className="px-6 py-3 text-center text-xs font-medium text-gray-500 uppercase tracking-wider">Bukti</th>
                  <th className="px-6 py-3 text-center text-xs font-medium text-gray-500 uppercase tracking-wider">Status</th>
                  <th className="px-6 py-3 text-left text-xs font-medium text-gray-500 uppercase tracking-wider">Catatan</th>
                </tr>
              </thead>
              <tbody className="bg-white divide-y divide-gray-200">
                {permissions.map((perm, index) => (
                  <tr key={perm.id} className="hover:bg-gray-50 transition-colors">
                    <td className="px-6 py-4 whitespace-nowrap text-sm text-gray-500">
                      {index + 1}
                    </td>
                    <td className="px-6 py-4 whitespace-nowrap text-sm text-gray-500">
                      {format(new Date(perm.createdAt), 'dd MMM yyyy', { locale: idLocale })}
                    </td>
                    <td className="px-6 py-4 whitespace-nowrap text-sm text-gray-900 font-medium">
                      {format(new Date(perm.startDate), 'dd MMM', { locale: idLocale })} - {format(new Date(perm.endDate), 'dd MMM yyyy', { locale: idLocale })}
                    </td>
                    <td className="px-6 py-4 whitespace-nowrap">
                      <span className={`px-2 inline-flex text-xs leading-5 font-semibold rounded-full ${
                        perm.type === 'SICK' ? 'bg-red-50 text-red-700' :
                        perm.type === 'PERMISSION' ? 'bg-blue-50 text-blue-700' :
                        'bg-gray-100 text-gray-800'
                      }`}>
                        {getTypeLabel(perm.type)}
                      </span>
                    </td>
                    <td className="px-6 py-4 text-sm text-gray-500 max-w-xs truncate" title={perm.reason || ''}>
                      {perm.reason}
                    </td>
                    <td className="px-6 py-4 whitespace-nowrap text-center">
                      {perm.fileUrl ? (
                        <a 
                          href={perm.fileUrl} 
                          target="_blank" 
                          rel="noopener noreferrer"
                          className="text-blue-600 hover:text-blue-800 inline-flex items-center gap-1 text-sm font-medium"
                        >
                          <FileText className="w-4 h-4" /> Lihat
                        </a>
                      ) : (
                        <span className="text-gray-400 text-xs">-</span>
                      )}
                    </td>
                    <td className="px-6 py-4 whitespace-nowrap text-center">
                      {getStatusBadge(perm.status)}
                    </td>
                    <td className="px-6 py-4 text-sm text-gray-500 italic">
                      {perm.approvalNote || '-'}
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        )}
      </div>

      {/* Modal Form */}
      {showModal && (
        <div className="fixed inset-0 z-50 overflow-y-auto">
          <div className="flex items-center justify-center min-h-screen pt-4 px-4 pb-20 text-center sm:block sm:p-0">
            <div className="fixed inset-0 transition-opacity" aria-hidden="true">
              <div className="absolute inset-0 bg-gray-500 opacity-75" onClick={() => setShowModal(false)}></div>
            </div>

            <span className="hidden sm:inline-block sm:align-middle sm:h-screen" aria-hidden="true">&#8203;</span>

            <div className="inline-block align-bottom bg-white rounded-lg text-left overflow-hidden shadow-xl transform transition-all sm:my-8 sm:align-middle sm:max-w-lg w-full relative z-10">
              <form onSubmit={handleSubmit}>
                <div className="bg-white px-4 pt-5 pb-4 sm:p-6 sm:pb-4">
                  <div className="sm:flex sm:items-start">
                    <div className="mt-3 text-center sm:mt-0 sm:text-left w-full">
                      <div className="flex justify-between items-center mb-4">
                        <h3 className="text-lg leading-6 font-medium text-gray-900">
                          Ajukan Izin Baru
                        </h3>
                        <button
                          type="button"
                          onClick={() => setShowModal(false)}
                          className="text-gray-400 hover:text-gray-500"
                        >
                          <X className="w-5 h-5" />
                        </button>
                      </div>
                      
                      <div className="space-y-5">
                        {/* Jenis Izin */}
                        <div>
                          <label className="block text-sm font-medium text-gray-700 mb-2">
                            Jenis Izin <span className="text-red-500">*</span>
                          </label>
                          <div className="grid grid-cols-3 gap-3">
                            <button
                              type="button"
                              onClick={() => setFormData({ ...formData, type: PermissionType.SICK })}
                              className={`flex flex-col items-center justify-center p-3 rounded-xl border-2 transition-all ${
                                formData.type === PermissionType.SICK
                                  ? 'border-red-500 bg-red-50 text-red-700'
                                  : 'border-gray-100 bg-gray-50 text-gray-600 hover:bg-gray-100 hover:border-gray-200'
                              }`}
                            >
                              <Thermometer className="w-6 h-6 mb-2" />
                              <span className="text-sm font-medium">Sakit</span>
                            </button>
                            <button
                              type="button"
                              onClick={() => setFormData({ ...formData, type: PermissionType.PERMISSION })}
                              className={`flex flex-col items-center justify-center p-3 rounded-xl border-2 transition-all ${
                                formData.type === PermissionType.PERMISSION
                                  ? 'border-blue-500 bg-blue-50 text-blue-700'
                                  : 'border-gray-100 bg-gray-50 text-gray-600 hover:bg-gray-100 hover:border-gray-200'
                              }`}
                            >
                              <UserCheck className="w-6 h-6 mb-2" />
                              <span className="text-sm font-medium">Izin</span>
                            </button>
                            <button
                              type="button"
                              onClick={() => setFormData({ ...formData, type: PermissionType.OTHER })}
                              className={`flex flex-col items-center justify-center p-3 rounded-xl border-2 transition-all ${
                                formData.type === PermissionType.OTHER
                                  ? 'border-gray-500 bg-gray-50 text-gray-700'
                                  : 'border-gray-100 bg-gray-50 text-gray-600 hover:bg-gray-100 hover:border-gray-200'
                              }`}
                            >
                              <MoreHorizontal className="w-6 h-6 mb-2" />
                              <span className="text-sm font-medium">Lainnya</span>
                            </button>
                          </div>
                        </div>

                        {/* Tanggal */}
                        <div className="grid grid-cols-2 gap-4">
                          <div>
                            <label className="block text-sm font-medium text-gray-700 mb-1">
                              Dari Tanggal <span className="text-red-500">*</span>
                            </label>
                            <div className="relative">
                              <div className="absolute inset-y-0 left-0 pl-3 flex items-center pointer-events-none">
                                <Calendar className="h-5 w-5 text-gray-400" />
                              </div>
                              <input
                                type="date"
                                required
                                value={formData.startDate}
                                onChange={(e) => setFormData({ ...formData, startDate: e.target.value })}
                                className="block w-full pl-10 pr-3 py-2.5 bg-gray-50 border-gray-200 rounded-xl focus:bg-white focus:ring-2 focus:ring-blue-500/20 focus:border-blue-500 sm:text-sm transition-all"
                              />
                            </div>
                          </div>
                          <div>
                            <label className="block text-sm font-medium text-gray-700 mb-1">
                              Sampai Tanggal <span className="text-red-500">*</span>
                            </label>
                            <div className="relative">
                              <div className="absolute inset-y-0 left-0 pl-3 flex items-center pointer-events-none">
                                <Calendar className="h-5 w-5 text-gray-400" />
                              </div>
                              <input
                                type="date"
                                required
                                value={formData.endDate}
                                min={formData.startDate}
                                onChange={(e) => setFormData({ ...formData, endDate: e.target.value })}
                                className="block w-full pl-10 pr-3 py-2.5 bg-gray-50 border-gray-200 rounded-xl focus:bg-white focus:ring-2 focus:ring-blue-500/20 focus:border-blue-500 sm:text-sm transition-all"
                              />
                            </div>
                          </div>
                        </div>

                        {/* Keterangan */}
                        <div>
                          <label className="block text-sm font-medium text-gray-700 mb-1">
                            Keterangan / Alasan <span className="text-red-500">*</span>
                          </label>
                          <textarea
                            required
                            rows={3}
                            value={formData.reason}
                            onChange={(e) => setFormData({ ...formData, reason: e.target.value })}
                            className="block w-full px-4 py-3 bg-gray-50 border-gray-200 rounded-xl focus:bg-white focus:ring-2 focus:ring-blue-500/20 focus:border-blue-500 sm:text-sm transition-all resize-none"
                            placeholder="Jelaskan alasan ketidakhadiran..."
                          />
                        </div>

                        {/* Upload Bukti */}
                        <div>
                          <label className="block text-sm font-medium text-gray-700 mb-1">
                            Bukti Pendukung (Opsional)
                          </label>
                          <label className="mt-1 flex justify-center px-6 pt-5 pb-6 border-2 border-gray-300 border-dashed rounded-xl hover:bg-gray-50 hover:border-blue-400 transition-all cursor-pointer relative group bg-white">
                            <input
                              type="file"
                              className="sr-only"
                              accept="image/*,application/pdf"
                              onChange={(e) => {
                                const file = e.target.files?.[0] || null;
                                if (file && file.size > 2 * 1024 * 1024) {
                                  toast.error('Ukuran file maksimal 2MB');
                                  return;
                                }
                                setFormData({ ...formData, file });
                              }}
                            />
                            <div className="space-y-1 text-center">
                              <Upload className={`mx-auto h-12 w-12 transition-colors ${formData.file ? 'text-blue-500' : 'text-gray-400 group-hover:text-blue-400'}`} />
                              <div className="flex text-sm text-gray-600 justify-center">
                                <span className="font-medium text-blue-600 hover:text-blue-500">
                                  {formData.file ? formData.file.name : 'Klik untuk upload file'}
                                </span>
                              </div>
                              <p className="text-xs text-gray-500">
                                PNG, JPG, PDF up to 2MB
                              </p>
                            </div>
                          </label>
                        </div>
                      </div>
                    </div>
                  </div>
                </div>
                <div className="bg-gray-50 px-4 py-3 sm:px-6 sm:flex sm:flex-row-reverse">
                  <button
                    type="submit"
                    disabled={createMutation.isPending}
                    className="w-full inline-flex justify-center rounded-md border border-transparent shadow-sm px-4 py-2 bg-blue-600 text-base font-medium text-white hover:bg-blue-700 focus:outline-none focus:ring-2 focus:ring-offset-2 focus:ring-blue-500 sm:ml-3 sm:w-auto sm:text-sm disabled:opacity-50 disabled:cursor-not-allowed"
                  >
                    {createMutation.isPending ? (
                      <>
                        <Loader2 className="w-4 h-4 mr-2 animate-spin" />
                        Mengirim...
                      </>
                    ) : (
                      'Kirim Pengajuan'
                    )}
                  </button>
                  <button
                    type="button"
                    disabled={createMutation.isPending}
                    onClick={() => setShowModal(false)}
                    className="mt-3 w-full inline-flex justify-center rounded-md border border-gray-300 shadow-sm px-4 py-2 bg-white text-base font-medium text-gray-700 hover:bg-gray-50 focus:outline-none focus:ring-2 focus:ring-offset-2 focus:ring-blue-500 sm:mt-0 sm:ml-3 sm:w-auto sm:text-sm"
                  >
                    Batal
                  </button>
                </div>
              </form>
            </div>
          </div>
        </div>
      )}
    </div>
  );
};

export default StudentPermissionsPage;
