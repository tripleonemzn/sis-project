import api from './api';

export type ExamType = 'FORMATIF' | 'SBTS' | 'SAS' | 'SAT';

export interface Question {
    id: string;
    type: 'MULTIPLE_CHOICE' | 'COMPLEX_MULTIPLE_CHOICE' | 'TRUE_FALSE' | 'ESSAY' | 'MATCHING';
    content: string; // HTML/RichText
    options?: {
        id: string;
        content: string; // HTML/RichText (supports images)
        isCorrect: boolean;
    }[];
    score: number;
}

export interface ExamPacket {
    id: number;
    title: string;
    description?: string;
    type: ExamType;
    duration: number; // minutes
    kkm: number;
    instructions?: string;
    subjectId: number;
    subject?: { id: number; name: string; code: string };
    authorId: number;
    academicYearId: number;
    academicYear?: { id: number; name: string };
    questions?: Question[];
    _count?: {
        schedules: number;
    };
    createdAt: string;
}

export interface ExamSchedule {
    id: number;
    packetId: number;
    packet?: ExamPacket;
    classId: number;
    class?: { id: number; name: string };
    startTime: string;
    endTime: string;
    token?: string;
    isActive: boolean;
    _count?: {
        sessions: number;
    };
}

export interface ExamRestriction {
    student: {
        id: number;
        nisn: string;
        name: string;
    };
    isBlocked: boolean;
    reason: string | null;
}

export const examService = {
    getPackets: async (params?: { type?: ExamType; subjectId?: number; academicYearId?: number; semester?: string; page?: number; limit?: number }) => {
        const response = await api.get('/exams/packets', { params });
        return response.data;
    },
    getQuestions: async (params?: { subjectId?: number; academicYearId?: number; semester?: string; type?: string; search?: string; page?: number; limit?: number }) => {
        const response = await api.get('/exams/questions', { params });
        return response.data;
    },
    getPacketById: async (id: number) => {
        const response = await api.get(`/exams/packets/${id}`);
        return response.data;
    },
    createPacket: async (data: Record<string, unknown>) => {
        const response = await api.post('/exams/packets', data);
        return response.data;
    },
    updatePacket: async (id: number, data: Record<string, unknown>) => {
        const response = await api.put(`/exams/packets/${id}`, data);
        return response.data;
    },
    deletePacket: async (id: number) => {
        const response = await api.delete(`/exams/packets/${id}`);
        return response.data;
    },
    getSchedules: async (params?: { packetId?: number; classId?: number }) => {
        const response = await api.get('/exams/schedules', { params });
        return response.data;
    },
    createSchedule: async (data: { packetId: number; classIds: number[]; startTime: string; endTime: string; proctorId?: number; room?: string }) => {
        const response = await api.post('/exams/schedules', data);
        return response.data;
    },
    deleteSchedule: async (id: number) => {
        const response = await api.delete(`/exams/schedules/${id}`);
        return response.data;
    },
    getAvailableExams: async () => {
        const response = await api.get(`/exams/available?_t=${Date.now()}`);
        return response.data;
    },
    getRestrictions: async (params: { classId: number; academicYearId: number; semester: string; examType: string; page?: number; limit?: number; search?: string }) => {
        const response = await api.get('/exams/restrictions', { params });
        return response.data;
    },
    updateRestriction: async (data: { studentId: number; academicYearId: number; semester: string; examType: string; isBlocked: boolean; reason?: string }) => {
        const response = await api.put('/exams/restrictions', data);
        return response.data;
    }
};
