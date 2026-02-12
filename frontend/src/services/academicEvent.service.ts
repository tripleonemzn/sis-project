import api from './api';

export type AcademicEventType =
  | 'LIBUR_NASIONAL'
  | 'LIBUR_SEKOLAH'
  | 'UJIAN_PTS'
  | 'UJIAN_PAS'
  | 'UJIAN_PAT'
  | 'MPLS'
  | 'RAPOR'
  | 'KEGIATAN_SEKOLAH'
  | 'LAINNYA';

export type AcademicEventSemester = 'ODD' | 'EVEN';

export interface AcademicEvent {
  id: number;
  academicYearId: number;
  title: string;
  type: AcademicEventType;
  startDate: string;
  endDate: string;
  semester?: AcademicEventSemester | null;
  isHoliday: boolean;
  description?: string | null;
}

export interface AcademicEventListResponse {
  events: AcademicEvent[];
}

export const academicEventService = {
  list: async (params: {
    academicYearId: number;
    semester?: AcademicEventSemester | 'ALL';
    type?: AcademicEventType | 'ALL';
  }) => {
    const query: Record<string, string | number> = {
      academicYearId: params.academicYearId,
    };

    if (params.semester && params.semester !== 'ALL') {
      query.semester = params.semester;
    }

    if (params.type && params.type !== 'ALL') {
      query.type = params.type;
    }

    const response = await api.get('/academic-events', { params: query });
    return response.data as { data: AcademicEventListResponse };
  },

  create: async (data: {
    academicYearId: number;
    title: string;
    type: AcademicEventType;
    startDate: string;
    endDate: string;
    semester?: AcademicEventSemester | null;
    isHoliday?: boolean;
    description?: string | null;
  }) => {
    const response = await api.post('/academic-events', data);
    return response.data;
  },

  update: async (
    id: number,
    data: Partial<{
      academicYearId: number;
      title: string;
      type: AcademicEventType;
      startDate: string;
      endDate: string;
      semester?: AcademicEventSemester | null;
      isHoliday?: boolean;
      description?: string | null;
    }>,
  ) => {
    const response = await api.put(`/academic-events/${id}`, data);
    return response.data;
  },

  remove: async (id: number) => {
    const response = await api.delete(`/academic-events/${id}`);
    return response.data;
  },
};
