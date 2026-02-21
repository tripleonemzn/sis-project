import { useMemo, useState } from 'react';
import { useQuery } from '@tanstack/react-query';
import { subjectService, type Subject } from '../../../services/subject.service';
import { Loader2, Search, Percent, SlidersHorizontal } from 'lucide-react';

type LevelFilter = 'ALL' | 'X' | 'XI' | 'XII';

const getCategoryColor = (categoryId: number) => {
  const colors = [
    'bg-sky-50 text-sky-700 border-sky-100',
    'bg-emerald-50 text-emerald-700 border-emerald-100',
    'bg-violet-50 text-violet-700 border-violet-100',
    'bg-orange-50 text-orange-700 border-orange-100',
    'bg-teal-50 text-teal-700 border-teal-100',
    'bg-rose-50 text-rose-700 border-rose-100',
    'bg-indigo-50 text-indigo-700 border-indigo-100',
  ];
  return colors[categoryId % colors.length] || colors[0];
};

export const KkmPage = () => {
  const [search, setSearch] = useState('');
  const [levelFilter, setLevelFilter] = useState<LevelFilter>('ALL');

  useMemo(() => null, []);

  const { data: subjectData, isLoading: isLoadingSubjects } = useQuery({
    queryKey: ['subjects', 'for-kkm'],
    queryFn: () => subjectService.list({ page: 1, limit: 1000 }),
  });

  const subjects: Subject[] = useMemo(
    () => subjectData?.data?.subjects || subjectData?.subjects || [],
    [subjectData],
  );


  const filteredSubjects = useMemo(() => {
    let list = [...subjects];

    if (search.trim()) {
      const term = search.toLowerCase();
      list = list.filter((s) => {
        const text = `${s.code} ${s.name}`.toLowerCase();
        return text.includes(term);
      });
    }

    return list;
  }, [subjects, search]);

  const totalSubjects = filteredSubjects.length;

  const averageKkmPerLevel = useMemo(() => {
    const result: Record<'X' | 'XI' | 'XII', number | null> = {
      X: null,
      XI: null,
      XII: null,
    };

    const accumulator: Record<'X' | 'XI' | 'XII', { sum: number; count: number }> = {
      X: { sum: 0, count: 0 },
      XI: { sum: 0, count: 0 },
      XII: { sum: 0, count: 0 },
    };

    for (const s of filteredSubjects) {
      const x = s.kkms?.find((k) => k.classLevel === 'X')?.kkm;
      const xi = s.kkms?.find((k) => k.classLevel === 'XI')?.kkm;
      const xii = s.kkms?.find((k) => k.classLevel === 'XII')?.kkm;

      if (typeof x === 'number') {
        accumulator.X.sum += x;
        accumulator.X.count += 1;
      }
      if (typeof xi === 'number') {
        accumulator.XI.sum += xi;
        accumulator.XI.count += 1;
      }
      if (typeof xii === 'number') {
        accumulator.XII.sum += xii;
        accumulator.XII.count += 1;
      }
    }

    (['X', 'XI', 'XII'] as const).forEach((level) => {
      const { sum, count } = accumulator[level];
      result[level] = count > 0 ? Math.round((sum / count) * 10) / 10 : null;
    });

    return result;
  }, [filteredSubjects]);

  if (isLoadingSubjects) {
    return (
      <div className="flex items-center justify-center min-h-[300px]">
        <Loader2 className="w-8 h-8 animate-spin text-blue-600" />
      </div>
    );
  }

  return (
    <div className="space-y-6">
      <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-4">
        <div>
          <h1 className="text-2xl font-bold text-gray-900">Data KKM</h1>
          <p className="text-gray-500 text-sm">
            Ringkasan Kriteria Ketuntasan Minimal per mata pelajaran dan tingkat kelas.
          </p>
        </div>
        <div className="flex flex-col sm:flex-row gap-3 items-start sm:items-center"></div>
      </div>

      <div className="grid grid-cols-1 md:grid-cols-4 gap-4">
        <div className="bg-white rounded-xl shadow-sm border border-gray-100 p-4 flex items-center gap-4">
          <div className="p-3 rounded-lg bg-blue-50 text-blue-600">
            <Percent className="w-5 h-5" />
          </div>
          <div>
            <p className="text-xs text-gray-500 font-medium">Total Mata Pelajaran</p>
            <p className="text-2xl font-bold text-gray-900">{totalSubjects}</p>
          </div>
        </div>
        <div className="bg-white rounded-xl shadow-sm border border-gray-100 p-4">
          <p className="text-xs text-gray-500 font-medium mb-2">Rata-rata KKM X</p>
          <p className="text-2xl font-bold text-gray-900">
            {averageKkmPerLevel.X ?? '-'}
          </p>
        </div>
        <div className="bg-white rounded-xl shadow-sm border border-gray-100 p-4">
          <p className="text-xs text-gray-500 font-medium mb-2">Rata-rata KKM XI</p>
          <p className="text-2xl font-bold text-gray-900">
            {averageKkmPerLevel.XI ?? '-'}
          </p>
        </div>
        <div className="bg-white rounded-xl shadow-sm border border-gray-100 p-4">
          <p className="text-xs text-gray-500 font-medium mb-2">Rata-rata KKM XII</p>
          <p className="text-2xl font-bold text-gray-900">
            {averageKkmPerLevel.XII ?? '-'}
          </p>
        </div>
      </div>

      <div className="bg-white rounded-xl shadow-sm border border-gray-100 overflow-hidden">
        <div className="p-4 border-b border-gray-100 flex flex-col md:flex-row gap-4 md:items-center md:justify-between bg-gray-50/50">
          <div className="flex items-center gap-2 text-sm text-gray-600">
            <SlidersHorizontal className="w-4 h-4" />
            <span>Pencarian dan Filter</span>
          </div>
          <div className="flex flex-col sm:flex-row gap-3 w-full md:w-auto">
            <div className="relative flex-1 min-w-[220px]">
              <div className="absolute inset-y-0 left-0 pl-3 flex items-center pointer-events-none">
                <Search className="w-4 h-4 text-gray-400" />
              </div>
              <input
                type="text"
                name="kkm-search"
                value={search}
                onChange={(e) => setSearch(e.target.value)}
                placeholder="Cari kode atau nama mata pelajaran..."
                className="block w-full pl-9 pr-3 py-2 border border-gray-300 rounded-lg text-sm bg-white placeholder-gray-500 focus:outline-none focus:ring-1 focus:ring-blue-500 focus:border-blue-500"
              />
            </div>
            <select
              name="kkm-level-filter"
              className="px-3 py-2 border border-gray-300 rounded-lg bg-white text-sm focus:outline-none focus:ring-1 focus:ring-blue-500 focus:border-blue-500"
              value={levelFilter}
              onChange={(e) => setLevelFilter(e.target.value as LevelFilter)}
            >
              <option value="ALL">Semua Tingkat</option>
              <option value="X">Hanya Kelas X</option>
              <option value="XI">Hanya Kelas XI</option>
              <option value="XII">Hanya Kelas XII</option>
            </select>
          </div>
        </div>

        <div className="overflow-x-auto">
          <table className="w-full text-sm">
            <thead className="bg-gray-50 text-gray-600 font-medium">
              <tr>
                <th className="px-6 py-3 text-left whitespace-nowrap w-24">KODE</th>
                <th className="px-6 py-3 text-left whitespace-nowrap">MATA PELAJARAN</th>
                <th className="px-6 py-3 text-left whitespace-nowrap w-40">KATEGORI</th>
                {(levelFilter === 'ALL' || levelFilter === 'X') && (
                  <th className="px-6 py-3 text-center whitespace-nowrap w-20">KKM X</th>
                )}
                {(levelFilter === 'ALL' || levelFilter === 'XI') && (
                  <th className="px-6 py-3 text-center whitespace-nowrap w-20">KKM XI</th>
                )}
                {(levelFilter === 'ALL' || levelFilter === 'XII') && (
                  <th className="px-6 py-3 text-center whitespace-nowrap w-20">KKM XII</th>
                )}
              </tr>
            </thead>
            <tbody className="divide-y divide-gray-100">
              {filteredSubjects.length === 0 ? (
                <tr>
                  <td
                    colSpan={
                      3 +
                      (levelFilter === 'ALL'
                        ? 3
                        : 1)
                    }
                    className="px-6 py-8 text-center text-gray-500"
                  >
                    {search
                      ? 'Tidak ada mata pelajaran yang cocok dengan pencarian'
                      : 'Belum ada data mata pelajaran dengan KKM'}
                  </td>
                </tr>
              ) : (
                filteredSubjects.map((s) => {
                  const kkmX = s.kkms?.find((k) => k.classLevel === 'X')?.kkm;
                  const kkmXI = s.kkms?.find((k) => k.classLevel === 'XI')?.kkm;
                  const kkmXII = s.kkms?.find((k) => k.classLevel === 'XII')?.kkm;
                  return (
                    <tr key={s.id} className="hover:bg-gray-50 transition-colors">
                      <td className="px-6 py-3 font-semibold text-gray-900 whitespace-nowrap">
                        {s.code}
                      </td>
                      <td className="px-6 py-3 text-gray-700 whitespace-nowrap">
                        {s.name}
                      </td>
                      <td className="px-6 py-3 whitespace-nowrap">
                        <span
                    className={`inline-flex items-center px-3 py-1 rounded-full text-xs font-semibold border ${
                      s.subjectCategoryId ? getCategoryColor(s.subjectCategoryId) : 'bg-gray-50 text-gray-600 border-gray-100'
                    }`}
                  >
                    {s.subjectCategory?.name || (typeof s.category === 'string' ? s.category : s.category?.name) || '-'}
                  </span>
                      </td>
                      {(levelFilter === 'ALL' || levelFilter === 'X') && (
                        <td className="px-6 py-3 text-center text-gray-700">
                          {typeof kkmX === 'number' ? kkmX : '-'}
                        </td>
                      )}
                      {(levelFilter === 'ALL' || levelFilter === 'XI') && (
                        <td className="px-6 py-3 text-center text-gray-700">
                          {typeof kkmXI === 'number' ? kkmXI : '-'}
                        </td>
                      )}
                      {(levelFilter === 'ALL' || levelFilter === 'XII') && (
                        <td className="px-6 py-3 text-center text-gray-700">
                          {typeof kkmXII === 'number' ? kkmXII : '-'}
                        </td>
                      )}
                    </tr>
                  );
                })
              )}
            </tbody>
          </table>
        </div>
      </div>
    </div>
  );
};
