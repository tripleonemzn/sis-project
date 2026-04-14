import { useState, useEffect } from 'react';
import { useParams, useNavigate } from 'react-router-dom';
import { toast } from 'react-hot-toast';
import { Calendar, Clock, ArrowLeft, Save } from 'lucide-react';
import { examService, normalizeExamProgramCode } from '../../../services/exam.service';
import type { ExamPacket } from '../../../services/exam.service';
import { teacherAssignmentService } from '../../../services/teacherAssignment.service';
import type { TeacherAssignment } from '../../../services/teacherAssignment.service';
// import api from '../../../services/api';

const canTeacherDirectSchedulePacket = (packet?: Pick<ExamPacket, 'programCode' | 'type'> | null) => {
    const normalized = normalizeExamProgramCode(packet?.programCode || packet?.type);
    return ['FORMATIF', 'FORMATIVE', 'UH', 'ULANGAN_HARIAN'].includes(normalized);
};

const CURRICULUM_EXAM_MANAGER_LABEL = 'Wakasek Kurikulum / Sekretaris Kurikulum';

export const ExamSchedulePage = () => {
    const { id } = useParams();
    const navigate = useNavigate();
    const [loading, setLoading] = useState(false);
    const [packet, setPacket] = useState<ExamPacket | null>(null);
    const [classes, setClasses] = useState<{id: number, name: string}[]>([]);
    // const [teachers, setTeachers] = useState<{id: number, full_name: string}[]>([]);

    
    const [schedules, setSchedules] = useState<{
        classId: number;
        startTime: string;
        endTime: string;
        proctorId?: number;
        room?: string;
        isSelected: boolean;
    }[]>([]);

    useEffect(() => {
        const loadData = async () => {
            if (id) {
                await fetchPacket(parseInt(id));
                await fetchClasses();
                // await fetchTeachers();
            }
        };
        loadData();
    }, [id]);

    // const fetchTeachers = async () => {
    //     try {
    //         const res = await api.get('/users?role=TEACHER&limit=1000');
    //         setTeachers(res.data.data);
    //     } catch (error) {
    //         console.error('Error fetching teachers:', error);
    //     }
    // };

    const fetchPacket = async (packetId: number) => {
        try {
            const res = await examService.getPacketById(packetId);
            setPacket(res.data);
        } catch (error) {
            console.error('Error fetching packet:', error);
            toast.error('Gagal memuat data ujian');
        }
    };

    const fetchClasses = async () => {
        try {
            // Fetch classes where teacher teaches the subject of this packet
            // Ideally backend should provide this, but for now fetch all assignments
            // and filter in UI or just show all classes user teaches.
            // Better: getClassesBySubject(packet.subjectId)
            const res = await teacherAssignmentService.list({ limit: 100 });
            // Extract unique classes
            const assignments = res.data?.assignments || [];
            const uniqueClasses = Array.from(new Map(assignments.map((a: TeacherAssignment) => [a.class.id, a.class])).values());
            setClasses(uniqueClasses as {id: number, name: string}[]);
            
            // Initialize schedules state
            setSchedules(uniqueClasses.map((c: { id: number; name: string }) => ({
                classId: c.id,
                startTime: '',
                endTime: '',
                isSelected: false
            })));
        } catch (error) {
            console.error('Error fetching classes:', error);
        }
    };

    const handleScheduleChange = (classId: number, field: string, value: string | boolean | number) => {
        setSchedules(schedules.map(s => s.classId === classId ? { ...s, [field]: value } : s));
    };

    const handleSave = async () => {
        if (!packet || !canTeacherDirectSchedulePacket(packet)) {
            toast.error(`Jadwal program ini diatur oleh ${CURRICULUM_EXAM_MANAGER_LABEL}.`);
            return;
        }

        const selectedSchedules = schedules.filter(s => s.isSelected);
        if (selectedSchedules.length === 0) {
            toast.error('Pilih minimal satu kelas');
            return;
        }

        const validSchedules = selectedSchedules.filter(s => s.startTime && s.endTime);
        if (validSchedules.length !== selectedSchedules.length) {
            toast.error('Lengkapi waktu mulai dan selesai untuk semua kelas yang dipilih');
            return;
        }

        setLoading(true);
        try {
            const promises = selectedSchedules.map(s => 
                examService.createSchedule({
                    packetId: parseInt(id!),
                    classIds: [s.classId],
                    startTime: new Date(s.startTime).toISOString(),
                    endTime: new Date(s.endTime).toISOString(),
                    proctorId: s.proctorId,
                    room: s.room
                })
            );

            await Promise.all(promises);
            toast.success('Jadwal ujian berhasil disimpan');
            navigate(-1);
        } catch (error: unknown) {
            console.error('Error saving schedules:', error);
            toast.error('Gagal menyimpan jadwal');
        } finally {
            setLoading(false);
        }
    };

    if (!packet) return <div className="p-6">Loading...</div>;

    return (
        <div className="p-6 max-w-5xl mx-auto">
            <button onClick={() => navigate(-1)} className="flex items-center text-gray-600 hover:text-gray-900 mb-6">
                <ArrowLeft className="w-4 h-4 mr-2" /> Kembali
            </button>

            <div className="bg-white rounded-xl shadow-sm border border-gray-100 p-6 mb-6">
                <h1 className="text-lg font-bold text-gray-900 mb-2">Jadwalkan Ujian: {packet.title}</h1>
                <div className="flex gap-4 text-sm text-gray-600">
                    <span className="flex items-center gap-1"><Calendar className="w-4 h-4" /> {packet.type}</span>
                    <span className="flex items-center gap-1"><Clock className="w-4 h-4" /> {packet.duration} Menit</span>
                </div>
            </div>

            <div className="bg-white rounded-xl shadow-sm border border-gray-100 overflow-hidden">
                <div className="p-6 border-b border-gray-100 flex justify-between items-center">
                    <h2 className="text-lg font-semibold text-gray-800">Pilih Kelas & Waktu</h2>
                    {canTeacherDirectSchedulePacket(packet) ? (
                        <button 
                            onClick={handleSave}
                            disabled={loading}
                            className="flex items-center gap-2 bg-blue-600 text-white px-4 py-2 rounded-lg hover:bg-blue-700 disabled:opacity-50"
                        >
                            {loading ? 'Menyimpan...' : <><Save className="w-4 h-4" /> Simpan Jadwal</>}
                        </button>
                    ) : null}
                </div>
                
                {canTeacherDirectSchedulePacket(packet) ? (
                    <div className="p-0">
                        <table className="w-full">
                            <thead className="bg-gray-50 text-left text-xs font-medium text-gray-500 uppercase tracking-wider">
                                <tr>
                                    <th className="px-6 py-3 w-10">
                                        <label htmlFor="select-all" className="sr-only">Pilih Semua Kelas</label>
                                        <input 
                                            id="select-all"
                                            name="selectAll"
                                            type="checkbox" 
                                            onChange={(e) => {
                                            const checked = e.target.checked;
                                            setSchedules(schedules.map(s => ({ ...s, isSelected: checked })));
                                        }} />
                                    </th>
                                    <th className="px-6 py-3">Kelas</th>
                                    <th className="px-6 py-3">Waktu Mulai</th>
                                    <th className="px-6 py-3">Waktu Selesai</th>
                                </tr>
                            </thead>
                            <tbody className="divide-y divide-gray-200">
                                {classes.map((cls) => {
                                    const schedule = schedules.find(s => s.classId === cls.id) || { isSelected: false, startTime: '', endTime: '' };
                                    return (
                                        <tr key={cls.id} className={schedule.isSelected ? 'bg-blue-50' : ''}>
                                            <td className="px-6 py-4">
                                                <label htmlFor={`select-class-${cls.id}`} className="sr-only">Pilih Kelas {cls.name}</label>
                                                <input 
                                                    id={`select-class-${cls.id}`}
                                                    name={`select_class_${cls.id}`}
                                                    type="checkbox" 
                                                    checked={schedule.isSelected}
                                                    onChange={(e) => handleScheduleChange(cls.id, 'isSelected', e.target.checked)}
                                                    className="rounded border-gray-300 text-blue-600 focus:ring-blue-500"
                                                />
                                            </td>
                                            <td className="px-6 py-4 font-medium text-gray-900">{cls.name}</td>
                                            <td className="px-6 py-4">
                                                <label htmlFor={`start-time-${cls.id}`} className="sr-only">Waktu Mulai {cls.name}</label>
                                                <input 
                                                    id={`start-time-${cls.id}`}
                                                    name={`start_time_${cls.id}`}
                                                    type="datetime-local" 
                                                    disabled={!schedule.isSelected}
                                                    value={schedule.startTime}
                                                    onChange={(e) => handleScheduleChange(cls.id, 'startTime', e.target.value)}
                                                    className="block w-full rounded-md border-gray-300 shadow-sm focus:border-blue-500 focus:ring-blue-500 sm:text-sm disabled:bg-gray-100 disabled:text-gray-400"
                                                />
                                            </td>
                                            <td className="px-6 py-4">
                                                <label htmlFor={`end-time-${cls.id}`} className="sr-only">Waktu Selesai {cls.name}</label>
                                                <input 
                                                    id={`end-time-${cls.id}`}
                                                    name={`end_time_${cls.id}`}
                                                    type="datetime-local" 
                                                    disabled={!schedule.isSelected}
                                                    value={schedule.endTime}
                                                    onChange={(e) => handleScheduleChange(cls.id, 'endTime', e.target.value)}
                                                    className="block w-full rounded-md border-gray-300 shadow-sm focus:border-blue-500 focus:ring-blue-500 sm:text-sm disabled:bg-gray-100 disabled:text-gray-400"
                                                />
                                            </td>
                                        </tr>
                                    );
                                })}
                            </tbody>
                        </table>
                    </div>
                ) : (
                    <div className="px-6 py-5 text-sm text-slate-600">
                        Jadwal untuk program ini dikelola oleh {CURRICULUM_EXAM_MANAGER_LABEL}. Guru hanya dapat menjadwalkan langsung
                        packet Ulangan Harian/Formatif.
                    </div>
                )}
            </div>
        </div>
    );
};
