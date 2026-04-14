import { useState, useEffect } from 'react';
import { internshipService } from '../../../services/internship.service';
import { uploadService } from '../../../services/upload.service';
import { UserCheck, Clock, CheckCircle, AlertCircle, Calendar, Camera } from 'lucide-react';
import { toast } from 'react-hot-toast';

type InternshipRecord = {
  id: number;
  status: string;
  companyLatitude?: number | null;
  companyLongitude?: number | null;
};

type AttendanceRecord = {
  id: number;
  date: string;
  status: 'PRESENT' | 'SICK' | 'PERMISSION' | string;
  checkInTime?: string | null;
  checkOutTime?: string | null;
  isVerified?: boolean;
};

function getErrorMessage(error: unknown, fallback: string) {
  if (typeof error === 'object' && error !== null) {
    const message = (error as { response?: { data?: { message?: string } } }).response?.data?.message;
    if (message) return message;
  }
  if (error instanceof Error && error.message) return error.message;
  return fallback;
}

const StudentInternshipAttendance = () => {
  const [internship, setInternship] = useState<InternshipRecord | null>(null);
  const [attendances, setAttendances] = useState<AttendanceRecord[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [todayAttendance, setTodayAttendance] = useState<AttendanceRecord | null>(null);
  const [photoFile, setPhotoFile] = useState<File | null>(null);

  const fetchData = async () => {
    try {
      setLoading(true);
      setError(null);
      const res = await internshipService.getMyInternship();
      if (res.data.success && res.data.data && res.data.data.internship) {
        setInternship(res.data.data.internship);
        if (res.data.data.internship.id) {
          try {
            const attendancesRes = await internshipService.getAttendances(res.data.data.internship.id);
            setAttendances(attendancesRes.data.data);
            
            // Check if already attended today
            const today = new Date().toISOString().split('T')[0];
            const found = (attendancesRes.data.data as AttendanceRecord[]).find((a) => a.date.startsWith(today));
            setTodayAttendance(found ?? null);
          } catch (attError) {
             console.error('Error fetching attendances:', attError);
          }
        }
      } else {
        setInternship(null);
      }
    } catch (error: unknown) {
      console.error('Error fetching internship:', error);
      const statusCode = (error as { response?: { status?: number } }).response?.status;
      if (statusCode !== 404) {
        setError(getErrorMessage(error, 'Gagal memuat data PKL'));
      }
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => {
    fetchData();
  }, []);

  const handleCheckIn = async (status: 'PRESENT' | 'SICK' | 'PERMISSION') => {
    if (!internship) return;
    
    // Helper to get location
    const getLocation = (): Promise<{lat?: number, long?: number}> => {
      return new Promise((resolve, reject) => {
        if (!navigator.geolocation) {
          reject(new Error('Browser tidak mendukung Geolocation.'));
          return;
        }
        navigator.geolocation.getCurrentPosition(
          (position) => {
            resolve({
              lat: position.coords.latitude,
              long: position.coords.longitude
            });
          },
          (error) => {
             let msg = 'Gagal mengambil lokasi.';
             switch(error.code) {
                 case error.PERMISSION_DENIED:
                     msg = 'Izin lokasi ditolak. Mohon aktifkan izin lokasi di pengaturan browser.';
                     break;
                 case error.POSITION_UNAVAILABLE:
                     msg = 'Lokasi tidak ditemukan. Pastikan GPS aktif dan sinyal bagus.';
                     break;
                 case error.TIMEOUT:
                     msg = 'Gagal mendapatkan lokasi (Timeout). Coba lagi di area terbuka.';
                     break;
             }
             reject(new Error(msg));
          }, 
          { enableHighAccuracy: true, timeout: 10000 }
        );
      });
    };

    // Calculate distance helper (Haversine Formula)
    const calculateDistance = (lat1: number, lon1: number, lat2: number, lon2: number) => {
      const R = 6371e3; // metres
      const φ1 = lat1 * Math.PI/180; // φ, λ in radians
      const φ2 = lat2 * Math.PI/180;
      const Δφ = (lat2-lat1) * Math.PI/180;
      const Δλ = (lon2-lon1) * Math.PI/180;

      const a = Math.sin(Δφ/2) * Math.sin(Δφ/2) +
                Math.cos(φ1) * Math.cos(φ2) *
                Math.sin(Δλ/2) * Math.sin(Δλ/2);
      const c = 2 * Math.atan2(Math.sqrt(a), Math.sqrt(1-a));

      return R * c; // in metres
    };

    try {
      let location: { lat?: number; long?: number } = {};
      let uploadedImageUrl = undefined;

      if (status === 'PRESENT') {
        // 1. Get Location (Mandatory for PRESENT)
        const toastId = toast.loading('Mengambil lokasi...');
        try {
            location = await getLocation();
        } catch (locError: unknown) {
            toast.dismiss(toastId);
            toast.error(getErrorMessage(locError, 'Gagal mengambil lokasi GPS.'));
            return;
        }
        toast.dismiss(toastId);
        
        // 2. Validate Radius (Geofencing) - STRICT MODE
        // Wajib ada koordinat perusahaan. Jika belum ada, blokir absensi.
        if (!internship.companyLatitude || !internship.companyLongitude) {
             toast.error('Sistem Absensi Ketat: Koordinat tempat PKL belum diisi oleh Humas. Anda tidak dapat melakukan absensi sampai data dilengkapi. Silahkan hubungi sekolah.');
             return;
        }

        // Ensure location is valid (TS Guard)
        if (location.lat === undefined || location.long === undefined) {
             toast.error('Gagal mendapatkan koordinat GPS yang valid.');
             return;
        }

        const distance = calculateDistance(
            location.lat, 
            location.long, 
            internship.companyLatitude, 
            internship.companyLongitude
        );
        
        // Allow 10 meters radius (strict)
        const MAX_RADIUS = 10; 
        if (distance > MAX_RADIUS) {
            toast.error(`Lokasi Anda terlalu jauh dari tempat PKL (${Math.round(distance)} meter). Maksimal ${MAX_RADIUS} meter. Pastikan Anda berada di lokasi PKL.`);
            return;
        }

        // 3. Upload Photo (Optional)
        if (photoFile) {
            const uploadToast = toast.loading('Mengupload foto...');
            try {
              const uploadRes = await uploadService.uploadInternshipFile(photoFile);
              uploadedImageUrl = uploadRes.url;
              toast.dismiss(uploadToast);
            } catch {
              toast.dismiss(uploadToast);
              toast.error('Gagal mengupload foto');
              return;
            }
        }
      }

      const now = new Date();
      await internshipService.createAttendance(internship.id, {
        date: now.toISOString(),
        status,
        checkInTime: status === 'PRESENT' ? now.toTimeString().split(' ')[0] : undefined,
        imageUrl: uploadedImageUrl,
        ...location
      });
      toast.success('Absensi berhasil dicatat');
      setPhotoFile(null);
      fetchData();
    } catch (error: unknown) {
      toast.error(getErrorMessage(error, 'Gagal mencatat absensi'));
    }
  };

  if (loading) return <div className="p-6">Loading...</div>;

  if (error) {
    return (
      <div className="p-6">
        <div className="bg-red-50 p-4 rounded-lg text-red-800 flex items-center gap-3">
          <AlertCircle className="w-5 h-5" />
          <p>{error}</p>
          <button 
            onClick={fetchData}
            className="px-3 py-1 bg-red-100 hover:bg-red-200 rounded text-sm font-medium transition-colors"
          >
            Coba Lagi
          </button>
        </div>
      </div>
    );
  }

  if (!internship || internship.status !== 'APPROVED') {
    return (
      <div className="p-6">
        <div className="bg-yellow-50 p-4 rounded-lg text-yellow-800 flex items-center gap-3">
          <UserCheck className="w-5 h-5" />
          <p>Fitur Absensi hanya tersedia setelah pengajuan PKL Anda disetujui (APPROVED).</p>
        </div>
      </div>
    );
  }

  return (
    <div className="space-y-6">
       <div>
         <h1 className="text-lg font-bold text-gray-800">Absensi PKL</h1>
         <p className="text-gray-500">Lakukan check-in harian kehadiran PKL Anda</p>
       </div>

       {/* Today's Attendance Card */}
       <div className="bg-white p-6 rounded-xl shadow-sm border border-gray-100">
          <h2 className="text-lg font-semibold mb-4 flex items-center gap-2">
            <Clock className="w-5 h-5 text-blue-600" />
            Absensi Hari Ini ({new Date().toLocaleDateString('id-ID', { weekday: 'long', day: 'numeric', month: 'long', year: 'numeric' })})
          </h2>

          {todayAttendance ? (
             <div className="flex items-center gap-4 bg-green-50 p-4 rounded-lg border border-green-100">
                <CheckCircle className="w-8 h-8 text-green-600" />
                <div>
                   <p className="font-medium text-green-900">Sudah melakukan absensi</p>
                   <p className="text-sm text-green-700">Status: {todayAttendance.status} • Jam: {todayAttendance.checkInTime?.substring(0, 5) || '-'}</p>
                </div>
             </div>
          ) : (
             <div className="space-y-6">
                {/* Photo Input for Present */}
                <div className="bg-blue-50 p-4 rounded-lg border border-blue-100">
                  <h3 className="font-medium text-blue-900 mb-2 flex items-center gap-2">
            <Camera className="w-4 h-4" />
            Foto Selfie (Opsional)
          </h3>
          <p className="text-xs text-blue-700 mb-2">Jika tidak menyertakan foto, validasi akan bergantung penuh pada lokasi GPS Anda.</p>
          <input
                    type="file"
                    accept="image/*"
                    capture="user"
                    onChange={(e) => setPhotoFile(e.target.files ? e.target.files[0] : null)}
                    className="block w-full text-sm text-blue-700
                      file:mr-4 file:py-2 file:px-4
                      file:rounded-full file:border-0
                      file:text-sm file:font-semibold
                      file:bg-blue-100 file:text-blue-700
                      hover:file:bg-blue-200"
                  />
                  {photoFile && (
                    <p className="text-xs text-green-600 mt-2">
                      Foto dipilih: {photoFile.name}
                    </p>
                  )}
                </div>

                <div className="grid grid-cols-1 md:grid-cols-3 gap-4">
                  <button
                    onClick={() => handleCheckIn('PRESENT')}
                    className="flex flex-col items-center justify-center p-6 bg-blue-50 hover:bg-blue-100 rounded-xl transition-colors border border-blue-100"
                  >
                     <UserCheck className="w-8 h-8 text-blue-600 mb-2" />
                     <span className="font-bold text-blue-900">Hadir</span>
                     <span className="text-xs text-blue-600">Klik untuk Check-in</span>
                  </button>
                  <button
                     onClick={() => handleCheckIn('SICK')}
                     className="flex flex-col items-center justify-center p-6 bg-orange-50 hover:bg-orange-100 rounded-xl transition-colors border border-orange-100"
                  >
                     <AlertCircle className="w-8 h-8 text-orange-600 mb-2" />
                     <span className="font-bold text-orange-900">Sakit</span>
                  </button>
                   <button
                     onClick={() => handleCheckIn('PERMISSION')}
                     className="flex flex-col items-center justify-center p-6 bg-purple-50 hover:bg-purple-100 rounded-xl transition-colors border border-purple-100"
                  >
                     <Calendar className="w-8 h-8 text-purple-600 mb-2" />
                     <span className="font-bold text-purple-900">Izin</span>
                  </button>
                </div>
             </div>
          )}
       </div>

       {/* History */}
       <div className="bg-white rounded-xl shadow-sm border border-gray-100 overflow-hidden">
          <div className="p-6 border-b border-gray-100">
             <h2 className="text-lg font-semibold">Riwayat Kehadiran</h2>
          </div>
          <div className="overflow-x-auto">
             <table className="w-full">
                <thead className="bg-gray-50">
                   <tr>
                      <th className="px-6 py-3 text-left text-xs font-medium text-gray-500 uppercase tracking-wider">Tanggal</th>
                      <th className="px-6 py-3 text-left text-xs font-medium text-gray-500 uppercase tracking-wider">Jam Masuk</th>
                      <th className="px-6 py-3 text-left text-xs font-medium text-gray-500 uppercase tracking-wider">Jam Pulang</th>
                      <th className="px-6 py-3 text-left text-xs font-medium text-gray-500 uppercase tracking-wider">Status</th>
                      <th className="px-6 py-3 text-left text-xs font-medium text-gray-500 uppercase tracking-wider">Validasi</th>
                   </tr>
                </thead>
                <tbody className="bg-white divide-y divide-gray-200">
                   {attendances.length === 0 ? (
                      <tr>
                         <td colSpan={5} className="px-6 py-8 text-center text-gray-500">Belum ada data absensi</td>
                      </tr>
                   ) : (
                      attendances.map((attendance) => (
                         <tr key={attendance.id}>
                            <td className="px-6 py-4 whitespace-nowrap text-sm text-gray-900">
                               {new Date(attendance.date).toLocaleDateString('id-ID')}
                            </td>
                            <td className="px-6 py-4 whitespace-nowrap text-sm text-gray-500">
                               {attendance.checkInTime ? attendance.checkInTime.substring(0, 5) : '-'}
                            </td>
                            <td className="px-6 py-4 whitespace-nowrap text-sm text-gray-500">
                               {attendance.checkOutTime ? attendance.checkOutTime.substring(0, 5) : '-'}
                            </td>
                            <td className="px-6 py-4 whitespace-nowrap">
                               <span className={`px-2 py-1 inline-flex text-xs leading-5 font-semibold rounded-full ${
                                  attendance.status === 'PRESENT' ? 'bg-green-100 text-green-800' :
                                  attendance.status === 'SICK' ? 'bg-orange-100 text-orange-800' :
                                  'bg-purple-100 text-purple-800'
                               }`}>
                                  {attendance.status === 'PRESENT' ? 'HADIR' :
                                   attendance.status === 'SICK' ? 'SAKIT' : 'IZIN'}
                               </span>
                            </td>
                            <td className="px-6 py-4 whitespace-nowrap">
                               {attendance.isVerified ? (
                                  <CheckCircle className="w-5 h-5 text-green-500" />
                               ) : (
                                  <span className="text-xs text-gray-400">Pending</span>
                               )}
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

export default StudentInternshipAttendance;
