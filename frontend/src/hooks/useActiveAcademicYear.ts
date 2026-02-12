import { useQuery } from '@tanstack/react-query';
import { academicYearService } from '../services/academicYear.service';

export const useActiveAcademicYear = () => {
  return useQuery({
    queryKey: ['active-academic-year'],
    queryFn: async () => {
      console.log('useActiveAcademicYear: START fetching');
      let active = null;

      // Helper to extract data from potential wrapper hell
      const extractData = (res: any) => {
          if (!res) return null;
          // Direct match
          if (res.id && res.name) return res;
          // Standard wrapper
          if (res.data && res.data.id) return res.data;
          // Double wrapper (just in case)
          if (res.data && res.data.data && res.data.data.id) return res.data.data;
          // Wrapped in 'data' but 'data' is the wrapper?
          if (res.data && res.data.academicYear) return res.data.academicYear;
          return null;
      };

      // Helper to validate year object
      const isValidYear = (year: any) => {
          return year && typeof year === 'object' && (year.id || year.academicYearId);
      };

      // 1. Try /active endpoint
      try {
        const res = await academicYearService.getActive();
        console.info('useActiveAcademicYear: /active raw response:', res);
        const extracted = extractData(res);
        if (isValidYear(extracted)) {
            active = extracted;
            console.info('useActiveAcademicYear: Found via /active', active);
        } else {
             console.warn('useActiveAcademicYear: /active returned invalid data', extracted);
        }
      } catch (err) {
        console.warn('useActiveAcademicYear: /active endpoint failed', err);
      }

      // 2. Fallback to /list with isActive=true
      if (!isValidYear(active)) {
        try {
          console.log('useActiveAcademicYear: Trying list({ isActive: true })');
          const res = await academicYearService.list({ page: 1, limit: 100, isActive: true });
          // Handle list wrapper
          const list = res.data?.academicYears || res.academicYears || res.data?.data?.academicYears || [];
          
          // Try to find explicitly active one, or fallback to first one in the list
          const found = list.find((y: any) => y.isActive) || list[0];
          if (isValidYear(found)) {
              active = found;
              console.log('useActiveAcademicYear: Found via list(isActive=true)', active);
          }
        } catch (err) {
          console.warn('useActiveAcademicYear: list(isActive=true) failed', err);
        }
      }

      // 3. Fallback to /list ALL (desperate mode - get ANY latest year)
      if (!isValidYear(active)) {
        try {
          console.log('useActiveAcademicYear: Trying list() ALL (Desperate Fallback)');
          // Remove isActive filter to get all years, ordered by ID desc usually
          const res = await academicYearService.list({ page: 1, limit: 5 }); 
          const list = res.data?.academicYears || res.academicYears || res.data?.data?.academicYears || [];
          
          const found = list[0]; // Take the latest one
          if (isValidYear(found)) {
              active = found;
              console.log('useActiveAcademicYear: Found via list() ALL', active);
          }
        } catch (err) {
          console.error('useActiveAcademicYear: list() ALL failed', err);
        }
      }

      if (!isValidYear(active)) {
        console.error('useActiveAcademicYear: CRITICAL FAILURE - No valid active year found');
        throw new Error("CRITICAL: Gagal mendapatkan data Tahun Ajaran. Pastikan database memiliki data Tahun Ajaran.");
      }

      // Calculate semester manually if backend didn't provide it
      if (!active.semester) {
          const now = new Date();
          let currentSemester = 'ODD';
          try {
            const sem2Start = active.semester2Start ? new Date(active.semester2Start) : null;
            const sem2End = active.semester2End ? new Date(active.semester2End) : null;
            
            // Validate dates
            if (sem2Start && sem2End && !isNaN(sem2Start.getTime()) && !isNaN(sem2End.getTime())) {
                if (now >= sem2Start && now <= sem2End) {
                    currentSemester = 'EVEN';
                }
            }
          } catch (e) {
            console.warn('Error parsing semester dates:', e);
          }
          active.semester = currentSemester;
      }
      
      console.log('useActiveAcademicYear: FINAL RESOLVED YEAR:', active);
      return active;
    },
    retry: 3,
    retryDelay: 1000, 
    staleTime: 0, // DISABLE CACHE to prevent sticking to bad data
    gcTime: 0, // Garbage collect immediately
    refetchOnMount: 'always',
    refetchOnWindowFocus: true
  });
};
