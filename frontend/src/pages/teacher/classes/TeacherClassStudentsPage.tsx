import { useState } from 'react';
import { useParams, useNavigate } from 'react-router-dom';
import { useQuery } from '@tanstack/react-query';
import { 
  ArrowLeft, 
  Users, 
  Search, 
  Loader2, 
  UserCircle 
} from 'lucide-react';
import { classService } from '../../../services/class.service';

type ClassStudent = {
  id: number;
  full_name?: string | null;
  name?: string | null;
  username?: string | null;
  nis?: string | null;
  nisn?: string | null;
  gender?: string | null;
  is_active?: boolean | null;
  studentStatus?: string | null;
};

export const TeacherClassStudentsPage = () => {
  const { classId } = useParams();
  const normalizedClassId = Number(classId);
  const hasValidClassId = Number.isInteger(normalizedClassId) && normalizedClassId > 0;
  const navigate = useNavigate();
  const [searchQuery, setSearchQuery] = useState('');

  const { data: classData, isLoading, error } = useQuery({
    queryKey: ['class', normalizedClassId],
    queryFn: () => classService.getById(normalizedClassId),
    enabled: hasValidClassId,
  });

  const rawStudents: ClassStudent[] = classData?.data?.students || classData?.students || [];
  const students: ClassStudent[] = rawStudents.map((student) => {
    const normalizedName = String(student.full_name || student.name || '').trim();
    const statusToken = String(student.studentStatus || '').toUpperCase();
    const normalizedIsActive =
      typeof student.is_active === 'boolean'
        ? student.is_active
        : statusToken
          ? ['ACTIVE', 'AKTIF'].includes(statusToken)
          : true;

    return {
      ...student,
      full_name: normalizedName || '-',
      username: String(student.username || '').trim(),
      is_active: normalizedIsActive,
    };
  });
  const className = classData?.data?.name || classData?.name || 'Detail Kelas';
  
  const loweredQuery = searchQuery.toLowerCase();
  const filteredStudents = students.filter((student) =>
    String(student.full_name || '')
      .toLowerCase()
      .includes(loweredQuery) ||
    String(student.nis || '').includes(searchQuery) ||
    String(student.nisn || '').includes(searchQuery),
  );

  if (isLoading) {
    return (
      <div className="flex flex-col items-center justify-center min-h-[400px]">
        <Loader2 className="w-10 h-10 animate-spin text-blue-600 mb-4" />
        <p className="text-gray-500">Memuat data siswa...</p>
      </div>
    );
  }

  if (error) {
    return (
      <div className="flex flex-col items-center justify-center min-h-[400px]">
        <p className="text-red-500">Gagal memuat data kelas.</p>
        <button 
          onClick={() => navigate(-1)}
          className="mt-4 px-4 py-2 bg-gray-100 rounded-lg hover:bg-gray-200"
        >
          Kembali
        </button>
      </div>
    );
  }

  return (
    <div className="space-y-6">
      {/* Header */}
      <div className="flex items-center gap-4">
        <button 
          onClick={() => navigate(-1)}
          className="p-2 hover:bg-gray-100 rounded-full transition-colors"
        >
          <ArrowLeft className="w-6 h-6 text-gray-600" />
        </button>
        <div>
          <h1 className="text-lg font-bold text-gray-900">{className}</h1>
          <p className="text-gray-500">Daftar siswa dalam kelas ini</p>
        </div>
      </div>

      {/* Search & Stats */}
      <div className="bg-white p-4 rounded-xl shadow-sm border border-gray-100 flex flex-col sm:flex-row gap-4 justify-between items-center">
        <div className="relative w-full sm:w-96">
          <Search className="w-5 h-5 text-gray-400 absolute left-3 top-1/2 -translate-y-1/2" />
          <input
            type="text"
            placeholder="Cari nama, NIS, atau NISN..."
            value={searchQuery}
            onChange={(e) => setSearchQuery(e.target.value)}
            className="w-full pl-10 pr-4 py-2 border border-gray-200 rounded-lg focus:outline-none focus:ring-2 focus:ring-blue-500 focus:border-transparent"
          />
        </div>
        <div className="flex items-center gap-2 text-sm text-gray-600 bg-gray-50 px-3 py-1.5 rounded-lg">
          <Users className="w-4 h-4" />
          <span>Total: <span className="font-bold text-gray-900">{filteredStudents.length}</span> Siswa</span>
        </div>
      </div>

      {/* Table */}
      <div className="bg-white rounded-xl shadow-sm border border-gray-100 overflow-hidden">
        <div className="overflow-x-auto">
          <table className="w-full">
            <thead className="bg-gray-50 border-b border-gray-200">
              <tr>
                <th className="px-6 py-3 text-left text-xs font-medium text-gray-500 uppercase tracking-wider w-12">No</th>
                <th className="px-6 py-3 text-left text-xs font-medium text-gray-500 uppercase tracking-wider">Nama Lengkap</th>
                <th className="px-6 py-3 text-left text-xs font-medium text-gray-500 uppercase tracking-wider">NIS / NISN</th>
                <th className="px-6 py-3 text-left text-xs font-medium text-gray-500 uppercase tracking-wider">L/P</th>
                <th className="px-6 py-3 text-center text-xs font-medium text-gray-500 uppercase tracking-wider">Status</th>
              </tr>
            </thead>
            <tbody className="divide-y divide-gray-200">
              {filteredStudents.length === 0 ? (
                <tr>
                  <td colSpan={5} className="px-6 py-8 text-center text-gray-500">
                    Tidak ada data siswa
                  </td>
                </tr>
              ) : (
                filteredStudents.map((student, index: number) => (
                  <tr key={student.id} className="hover:bg-gray-50 transition-colors">
                    <td className="px-6 py-4 whitespace-nowrap text-sm text-gray-500">
                      {index + 1}
                    </td>
                    <td className="px-6 py-4 whitespace-nowrap">
                      <div className="flex items-center gap-3">
                        <div className="w-8 h-8 rounded-full bg-gray-100 flex items-center justify-center text-gray-500">
                            <UserCircle className="w-5 h-5" />
                        </div>
                        <div>
                          <div className="text-sm font-medium text-gray-900">{student.full_name}</div>
                          {student.username ? (
                            <div className="text-xs text-gray-500">@{student.username}</div>
                          ) : null}
                        </div>
                      </div>
                    </td>
                    <td className="px-6 py-4 whitespace-nowrap text-sm text-gray-600 font-mono">
                      {student.nis || '-'} / {student.nisn || '-'}
                    </td>
                    <td className="px-6 py-4 whitespace-nowrap text-sm text-gray-600">
                      {String(student.gender || '').toUpperCase() === 'L' ||
                      String(student.gender || '').toUpperCase() === 'MALE'
                        ? 'Laki-laki'
                        : String(student.gender || '').toUpperCase() === 'P' ||
                            String(student.gender || '').toUpperCase() === 'FEMALE'
                          ? 'Perempuan'
                          : '-'}
                    </td>
                    <td className="px-6 py-4 whitespace-nowrap text-center">
                      <span className={`inline-flex px-2 py-1 text-xs font-semibold rounded-full ${
                        student.is_active 
                          ? 'bg-green-100 text-green-800' 
                          : 'bg-red-100 text-red-800'
                      }`}>
                        {student.is_active ? 'Aktif' : 'Nonaktif'}
                      </span>
                    </td>
                  </tr>
                ))
              )}
            </tbody>
          </table>
        </div>
      </div>
    </div>
  );
};
