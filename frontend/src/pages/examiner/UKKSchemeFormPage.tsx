import { useEffect, useRef } from 'react';
import { useForm, useFieldArray, useWatch, type Control, type UseFormRegister, type UseFormSetValue, type UseFormWatch } from 'react-hook-form';
import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query';
import { useNavigate, useParams, useOutletContext } from 'react-router-dom';
import { authService } from '../../services/auth.service';
import type { User } from '../../types/auth';
import { ukkSchemeService } from '../../services/ukkScheme.service';
import { subjectService } from '../../services/subject.service';
import { academicYearService } from '../../services/academicYear.service';
import { majorService } from '../../services/major.service';
import { toast } from 'react-hot-toast';
import { Plus, Trash2, Save, ArrowLeft, Loader2, Info, Layers } from 'lucide-react';

interface SchemeForm {
  name: string;
  subjectId: string;
  majorId: string;
  academicYearId: string;
  groups: {
    name: string;
    criteria: {
      id?: string;
      name: string;
      maxScore: number;
      aliases?: string[];
    }[];
  }[];
}
type MajorOption = { id: string | number; name: string };
type AcademicYearOption = { id: string | number; name: string; isActive?: boolean };
type SubjectOption = {
  id: string | number;
  name?: string | null;
  category?: string | null;
  subjectCategory?: { code?: string | null; name?: string | null } | null;
};
type SchemeCriterionRaw = {
  id?: string;
  name: string;
  maxScore: number;
  group?: string;
  aliases?: string[];
};
type SchemeDetailPayload = {
  name: string;
  academicYearId: string | number;
  subjectId?: string | number;
  majorId?: string | number;
  criteria?: SchemeCriterionRaw[] | string | null;
};

const generateId = () => Math.random().toString(36).substring(2, 9) + Date.now().toString(36);

// Inner Component for Criteria List
const CriteriaList = ({ 
  control, 
  groupIndex, 
  register,
  setValue,
  watch
}: { 
  control: Control<SchemeForm>; 
  groupIndex: number; 
  register: UseFormRegister<SchemeForm>;
  setValue: UseFormSetValue<SchemeForm>;
  watch: UseFormWatch<SchemeForm>;
}) => {
  const { fields, append, remove } = useFieldArray({
    control,
    name: `groups.${groupIndex}.criteria`
  });
  const prevNamesRef = useRef<Record<string, string>>({});
  const groupName = watch(`groups.${groupIndex}.name`) || 'Umum';

  return (
    <div className="mt-4">
      <div className="overflow-x-auto rounded-lg border border-gray-200">
        <table className="w-full text-left border-collapse">
          <thead className="bg-gray-50 border-b border-gray-100">
            <tr>
              <th className="px-4 py-2 text-xs font-medium text-gray-500 uppercase w-12 text-center">No</th>
              <th className="px-4 py-2 text-xs font-medium text-gray-500 uppercase">Nama Komponen</th>
              <th className="px-4 py-2 text-xs font-medium text-gray-500 uppercase w-24 text-center">Bobot</th>
              <th className="px-4 py-2 text-xs font-medium text-gray-500 uppercase w-12 text-center">Aksi</th>
            </tr>
          </thead>
          <tbody className="divide-y divide-gray-100 bg-white">
            {fields.map((field, index) => (
              <tr key={field.id} className="hover:bg-gray-50 group">
                <td className="px-4 py-2 text-center text-sm text-gray-500">
                  {index + 1}
                  <input type="hidden" {...register(`groups.${groupIndex}.criteria.${index}.id` as const)} />
                </td>
                <td className="px-4 py-2">
                  <input 
                    {...register(`groups.${groupIndex}.criteria.${index}.name` as const, { required: true })}
                    placeholder="Nama aspek penilaian..."
                    className="w-full px-3 py-1.5 border border-gray-200 rounded text-sm focus:border-blue-500 focus:ring-1 focus:ring-blue-500 outline-none"
                    onChange={(e) => {
                      const path = `groups.${groupIndex}.criteria.${index}.name` as const;
                      const reg = register(path, { required: true });
                      const newName = e.target.value;
                      const key = `${groupIndex}-${index}`;
                      const prevName = prevNamesRef.current[key];
                      if (prevName && prevName !== newName) {
                        const prevKey = `${groupName}::${prevName}`;
                        const aliasesPath = `groups.${groupIndex}.criteria.${index}.aliases` as const;
                        const currentAliases = (watch(aliasesPath) || []) as string[];
                        if (!currentAliases.includes(prevKey)) {
                          setValue(aliasesPath, [...currentAliases, prevKey], { shouldDirty: true });
                        }
                      }
                      prevNamesRef.current[key] = newName;
                      reg.onChange(e);
                    }}
                  />
                </td>
                <td className="px-4 py-2">
                  <input 
                    type="number"
                    {...register(`groups.${groupIndex}.criteria.${index}.maxScore` as const, { required: true })}
                    placeholder="10"
                    className="w-full px-3 py-1.5 border border-gray-200 rounded text-sm text-center focus:border-blue-500 focus:ring-1 focus:ring-blue-500 outline-none"
                  />
                </td>
                <td className="px-4 py-2 text-center">
                  <button
                    type="button"
                    onClick={() => remove(index)}
                    className="p-1.5 text-red-500 hover:bg-red-50 rounded transition-colors"
                  >
                    <Trash2 size={14} />
                  </button>
                </td>
              </tr>
            ))}
            {fields.length === 0 && (
              <tr>
                <td colSpan={4} className="px-4 py-8 text-center text-gray-400 text-sm italic">
                  Belum ada komponen penilaian di grup ini
                </td>
              </tr>
            )}
          </tbody>
        </table>
      </div>
      <div className="mt-3">
        <button 
          type="button"
          onClick={() => append({ id: generateId(), name: '', maxScore: 10, aliases: [] })}
          className="text-blue-600 text-xs font-medium hover:bg-blue-50 px-3 py-1.5 rounded-lg transition-colors flex items-center gap-1 border border-blue-200 border-dashed w-full justify-center"
        >
          <Plus size={14} /> Tambah Komponen
        </button>
      </div>
    </div>
  );
};

export const UKKSchemeFormPage = () => {
  const navigate = useNavigate();
  const { id } = useParams();
  const queryClient = useQueryClient();
  const isEditMode = !!id;
  
  const { user: contextUser } = useOutletContext<{ user: User }>() || {};

  const { data: authData } = useQuery({
    queryKey: ['me'],
    queryFn: authService.getMe,
    enabled: !contextUser,
    staleTime: 1000 * 60 * 5,
  });
  const user = contextUser || (authData?.data as User) || {};
  const examinerMajorId = user.examinerMajorId;

  const { control, register, handleSubmit, setValue, getValues, watch, formState: { errors } } = useForm<SchemeForm>({
    defaultValues: {
      groups: [
        { name: 'Persiapan Kerja', criteria: [] }
      ]
    }
  });

  const { fields: groupFields, append: appendGroup, remove: removeGroup } = useFieldArray({
    control,
    name: "groups"
  });

  // --- Fetch Data ---
  const { data: academicYears, isLoading: isLoadingAcademicYears } = useQuery({
    queryKey: ['academic-years-active'],
    queryFn: () => academicYearService.list()
  });

  const { data: majors, isLoading: isLoadingMajors } = useQuery({
    queryKey: ['majors'],
    queryFn: async () => {
      const res = await majorService.list({ limit: 100 });
      const payload = res as
        | { data?: { majors?: MajorOption[] } | MajorOption[]; majors?: MajorOption[] }
        | MajorOption[];
      if (Array.isArray(payload)) return payload;
      if (Array.isArray(payload.data)) return payload.data;
      return payload.data?.majors || payload.majors || [];
    }
  });

  const { data: subjects, isLoading: isLoadingSubjects } = useQuery({
    queryKey: ['subjects-vocational'],
    queryFn: async () => {
      const res = await subjectService.list({ limit: 1000 });
      // Handle various response structures
      const responseData = (res as { data?: unknown }).data || res;
      const allSubjects = Array.isArray(responseData) 
        ? (responseData as SubjectOption[])
        : ((responseData as { subjects?: SubjectOption[] })?.subjects || []);

      const filtered = allSubjects.filter((s: SubjectOption) => {
        const name = (s.name || '').toLowerCase();
        // Check nested subjectCategory or flat category
        const catObj = s.subjectCategory || {};
        const catCode = (catObj.code || s.category || '').toString().toUpperCase();
        const catName = (catObj.name || '').toString().toUpperCase();
        
        return name.includes('kejuruan') || 
               name.includes('kompetensi') || 
               name.includes('ukk') || 
               name.includes('produktif') || 
               catCode === 'KEJURUAN' || 
               catCode === 'KOMPETENSI_KEAHLIAN' ||
               catCode === 'PRODUKTIF' ||
               catName.includes('KEJURUAN');
      });

      return filtered;
    }
  });

  const { data: schemeDetail, isLoading: isLoadingDetail } = useQuery({
    queryKey: ['ukk-scheme', id],
    queryFn: () => ukkSchemeService.getSchemeDetail(Number(id)),
    enabled: isEditMode
  });

  // --- Effects ---
  useEffect(() => {
    // Always enforce examiner's major if available
    if (examinerMajorId) {
      setValue('majorId', String(examinerMajorId));
    }

    if (!isEditMode) {
      const yearPayload = academicYears as
        | { data?: { academicYears?: AcademicYearOption[] }; academicYears?: AcademicYearOption[] }
        | AcademicYearOption[]
        | undefined;
      const years = Array.isArray(yearPayload)
        ? yearPayload
        : yearPayload?.data?.academicYears || yearPayload?.academicYears || [];
      if (years && years.length > 0) {
        const active = years.find((ay: AcademicYearOption) => ay.isActive);
        if (active) setValue('academicYearId', String(active.id));
      }
    }
  }, [academicYears, examinerMajorId, setValue, isEditMode]);

  // Auto-select first UKK subject
  useEffect(() => {
    if (subjects && subjects.length > 0) {
      const currentSubjectId = getValues('subjectId');
      if (!currentSubjectId) {
        setValue('subjectId', String(subjects[0].id));
      }
    }
  }, [subjects, setValue, getValues]);

  // Load Edit Data
  useEffect(() => {
    if (isEditMode && schemeDetail) {
      const data = ((schemeDetail as { data?: SchemeDetailPayload })?.data || schemeDetail) as SchemeDetailPayload;
      setValue('name', data.name);
      setValue('academicYearId', String(data.academicYearId));
      
      // Ensure subjectId is set (prefer existing, fallback to auto logic will handle if empty but we set it here)
      if (data.subjectId) setValue('subjectId', String(data.subjectId));
      
      // Ensure majorId is set (enforce examinerMajorId if available, otherwise use data)
      if (examinerMajorId) {
        setValue('majorId', String(examinerMajorId));
      } else if (data.majorId) {
        setValue('majorId', String(data.majorId));
      }
      
      let criteriaData: SchemeCriterionRaw[] = [];
      const rawCriteria = data.criteria;
      // Handle potential stringified JSON
      if (typeof rawCriteria === 'string') {
        try {
          const parsed = JSON.parse(rawCriteria) as unknown;
          criteriaData = Array.isArray(parsed) ? (parsed as SchemeCriterionRaw[]) : [];
        } catch (e) {
          console.error('Failed to parse criteria JSON', e);
          criteriaData = [];
        }
      } else if (Array.isArray(rawCriteria)) {
        criteriaData = rawCriteria;
      }

      if (criteriaData && Array.isArray(criteriaData)) {
        // Group by 'group' field
        const grouped: Record<string, SchemeCriterionRaw[]> = {};
        const ungrouped: SchemeCriterionRaw[] = [];

        criteriaData.forEach((c: SchemeCriterionRaw) => {
          if (c.group) {
            if (!grouped[c.group]) grouped[c.group] = [];
            grouped[c.group].push(c);
          } else {
            ungrouped.push(c);
          }
        });

        const newGroups = Object.keys(grouped).map(groupName => ({
          name: groupName,
          criteria: grouped[groupName].map(c => ({ 
            id: String(c.id || generateId()),
            name: c.name, 
            maxScore: Number(c.maxScore),
            aliases: Array.isArray(c.aliases) ? c.aliases : []
          }))
        }));

        if (ungrouped.length > 0) {
          newGroups.push({
            name: 'Umum',
            criteria: ungrouped.map(c => ({ 
              id: String(c.id || generateId()),
              name: c.name, 
              maxScore: Number(c.maxScore),
              aliases: Array.isArray(c.aliases) ? c.aliases : []
            }))
          });
        }

        if (newGroups.length > 0) {
          setValue('groups', newGroups);
        }
      }
    }
  }, [schemeDetail, isEditMode, setValue, examinerMajorId]);

  const mutation = useMutation({
    mutationFn: (data: {
      name: string;
      subjectId: number;
      majorId: number;
      academicYearId: number;
      criteria: Array<SchemeCriterionRaw & { group: string }>;
    }) => {
      if (isEditMode) return ukkSchemeService.updateScheme(Number(id), data);
      return ukkSchemeService.createScheme(data);
    },
    onSuccess: () => {
      toast.success(isEditMode ? 'Skema berhasil diperbarui' : 'Skema berhasil dibuat');
      queryClient.invalidateQueries({ queryKey: ['ukk-schemes'] });
      navigate('/examiner/schemes');
    },
    onError: (err) => {
      toast.error('Gagal menyimpan skema');
      console.error(err);
    }
  });

  const onSubmit = (data: SchemeForm) => {
    // Flatten groups to criteria with 'group' property
    const flattenedCriteria = data.groups.flatMap(group => 
      group.criteria.map(c => ({
        ...c,
        maxScore: Number(c.maxScore),
        group: group.name
      }))
    );

    mutation.mutate({
      name: data.name,
      subjectId: Number(data.subjectId),
      majorId: Number(data.majorId),
      academicYearId: Number(data.academicYearId),
      criteria: flattenedCriteria
    });
  };

  const watchedMajorId = useWatch({ control, name: 'majorId' });
  const watchedAcademicYearId = useWatch({ control, name: 'academicYearId' });
  const selectedMajor = majors?.find((m: MajorOption) => String(m.id) === String(watchedMajorId));
  const yearPayload = academicYears as
    | { data?: { academicYears?: AcademicYearOption[] }; academicYears?: AcademicYearOption[] }
    | AcademicYearOption[]
    | undefined;
  const yearOptions = Array.isArray(yearPayload)
    ? yearPayload
    : yearPayload?.data?.academicYears || yearPayload?.academicYears || [];
  const activeYear = yearOptions.find((ay: AcademicYearOption) => String(ay.id) === String(watchedAcademicYearId));

  if (isLoadingSubjects || isLoadingDetail || isLoadingMajors || isLoadingAcademicYears) {
    return (
      <div className="flex items-center justify-center min-h-screen">
        <Loader2 className="w-8 h-8 animate-spin text-blue-600" />
      </div>
    );
  }

  return (
    <div className="min-h-screen bg-gray-50/50 pb-20 pt-6">
      <div className="w-full px-4 sm:px-6 lg:px-8">
        {/* Header */}
        <div className="bg-white rounded-2xl shadow-sm border border-gray-100 p-6 mb-6 flex flex-col md:flex-row justify-between items-start md:items-center gap-4">
          <div className="flex items-center gap-4">
            <button 
              onClick={() => navigate('/examiner/schemes')}
              className="p-2 -ml-2 text-gray-500 hover:text-gray-700 hover:bg-gray-100 rounded-full transition-colors"
            >
              <ArrowLeft size={24} />
            </button>
            <div>
              <h1 className="text-2xl font-bold text-gray-900">
                {isEditMode ? 'Edit Skema Penilaian' : 'Buat Skema Penilaian Baru'}
              </h1>
              <div className="flex flex-wrap items-center gap-2 text-sm text-gray-500 mt-1">
                {selectedMajor?.name && (
                  <span className="font-medium text-blue-600 bg-blue-50 px-2.5 py-0.5 rounded-full">
                    {selectedMajor.name}
                  </span>
                )}
                {activeYear?.name && (
                  <>
                    <span className="text-gray-300">•</span>
                    <span>{activeYear.name}</span>
                  </>
                )}
              </div>
            </div>
          </div>
        </div>

        <div className="space-y-6">
          {/* Info Card */}
          <div className="bg-white rounded-xl shadow-sm border border-gray-200 p-6">
            <h2 className="text-sm font-semibold text-gray-900 mb-4 flex items-center gap-2">
              <Info className="w-4 h-4 text-blue-600" /> Informasi Skema
            </h2>
            <div className="grid grid-cols-1 gap-6">
              <div>
                <label className="block text-sm font-medium text-gray-700 mb-1.5">Nama Skema / Paket</label>
                <input 
                  {...register('name', { required: 'Nama skema wajib diisi' })}
                  placeholder="Contoh: UKK TKJ Paket 1"
                  className="w-full px-4 py-2.5 border border-gray-300 rounded-lg focus:ring-2 focus:ring-blue-500 outline-none text-sm"
                />
                {errors.name && <p className="text-red-500 text-xs mt-1">{errors.name.message}</p>}
                
                {/* Subject Selection - Hidden Auto */}
                <input type="hidden" {...register('subjectId', { required: 'Mata pelajaran wajib dipilih (otomatis)' })} />
                {(!subjects || subjects.length === 0) && (
                  <div className="mt-3 rounded-lg border border-amber-200 bg-amber-50 px-3 py-2 text-xs text-amber-700">
                    Belum ada mapel UKK/kejuruan yang terdeteksi. Periksa kategori mapel agar tidak tercampur dengan mapel umum.
                  </div>
                )}
                
                {/* Major Selection - Auto or Block */}
                {(!examinerMajorId || (majors && !majors.find((m: MajorOption) => String(m.id) === String(examinerMajorId)))) ? (
                  <div className="mb-4 p-4 bg-red-50 border border-red-200 rounded-lg">
                     <h3 className="text-red-700 font-bold flex items-center gap-2">
                       <Info className="w-5 h-5" /> Akses Ditolak
                     </h3>
                     <p className="text-red-600 text-sm mt-1">
                       Anda belum ditugaskan ke Jurusan (Kompetensi Keahlian) manapun oleh Administrator. 
                       Silakan hubungi Admin untuk melakukan pengaturan profil Examiner Anda.
                       <br/><br/>
                       <span className="font-semibold">Catatan:</span> Jika Anda baru saja ditugaskan, silakan Logout dan Login kembali untuk memperbarui data sesi Anda.
                     </p>
                     <div className="mt-3">
                        <button 
                          type="button" 
                          onClick={() => navigate('/examiner/dashboard')}
                          className="px-4 py-2 bg-red-600 text-white rounded-lg text-sm font-medium hover:bg-red-700 transition-colors"
                        >
                          Kembali ke Dashboard
                        </button>
                     </div>
                  </div>
                ) : (
                   <input 
                      type="hidden" 
                      {...register('majorId', { required: 'Jurusan wajib terisi (otomatis)' })} 
                   />
                )}
                <input type="hidden" {...register('academicYearId', { required: 'Tahun ajaran wajib terisi (otomatis)' })} />

                {/* Validation Error Messages for Hidden Fields */}
                {(errors.majorId || errors.academicYearId) && (
                  <div className="mt-2 p-3 bg-red-50 text-red-600 text-sm rounded-lg border border-red-100 flex items-start gap-2">
                    <Info className="w-4 h-4 mt-0.5 flex-shrink-0" />
                    <div>
                      <p className="font-semibold">Data sistem tidak lengkap:</p>
                      <ul className="list-disc list-inside mt-1 space-y-0.5 text-xs">
                        {errors.majorId && <li>{errors.majorId.message}</li>}
                        {errors.academicYearId && <li>{errors.academicYearId.message}</li>}
                      </ul>
                      <p className="mt-2 text-xs text-red-500">Mohon refresh halaman atau hubungi administrator jika masalah berlanjut.</p>
                    </div>
                  </div>
                )}
              </div>
            </div>
          </div>

          {/* Groups & Criteria */}
          <div className="space-y-4">
            <div className="flex items-center justify-between">
              <h2 className="text-lg font-bold text-gray-900 flex items-center gap-2">
                <Layers className="w-5 h-5 text-blue-600" /> Komponen Penilaian
              </h2>
              <button 
                type="button"
                onClick={() => appendGroup({ name: '', criteria: [] })}
                className="text-sm font-medium text-blue-600 hover:text-blue-700 flex items-center gap-1 bg-blue-50 px-3 py-1.5 rounded-lg"
              >
                <Plus size={16} /> Tambah Grup
              </button>
            </div>

            {groupFields.map((group, index) => (
              <div key={group.id} className="bg-white rounded-xl shadow-sm border border-gray-200 overflow-hidden">
                <div className="bg-gray-50/50 px-6 py-4 border-b border-gray-100 flex items-center justify-between">
                  <input 
                    {...register(`groups.${index}.name` as const, { required: true })}
                    placeholder="Nama Grup / Aspek (Contoh: K3LH)"
                    className="bg-transparent border-none text-sm font-bold text-gray-900 focus:ring-0 w-full placeholder-gray-400"
                  />
                  <button
                    type="button"
                    onClick={() => removeGroup(index)}
                    className="text-gray-400 hover:text-red-500 p-1"
                    title="Hapus Grup"
                  >
                    <Trash2 size={16} />
                  </button>
                </div>
                <div className="p-6">
                  <CriteriaList 
                    control={control} 
                    groupIndex={index} 
                    register={register}
                    setValue={setValue}
                    watch={watch}
                  />
                </div>
              </div>
            ))}
          </div>
        </div>

        {/* Floating Save Button */}
        <div className="fixed bottom-6 right-6 z-10">
          <button
            onClick={handleSubmit(onSubmit)}
            disabled={mutation.isPending}
            className="flex items-center gap-2 px-6 py-3 bg-blue-600 text-white rounded-full shadow-lg hover:bg-blue-700 hover:shadow-xl transition-all disabled:opacity-70 disabled:cursor-not-allowed transform hover:-translate-y-1"
          >
            {mutation.isPending ? (
              <Loader2 className="w-5 h-5 animate-spin" />
            ) : (
              <Save className="w-5 h-5" />
            )}
            <span className="font-bold">Simpan Skema</span>
          </button>
        </div>
      </div>
    </div>
  );
};
