import api from './api';

export const internshipService = {
  getMyInternship: async () => {
    return await api.get('/internships/my-internship');
  },

  updateMyInternship: async (data: any) => {
    return await api.put('/internships/my-internship', data);
  },

  applyInternship: async (data: any) => {
    return await api.post('/internships/apply', data);
  },

  uploadReport: async (id: number, reportUrl: string) => {
    return await api.post(`/internships/${id}/report`, { reportUrl });
  },

  uploadAcceptanceLetter: async (id: number, acceptanceLetterUrl: string) => {
    return await api.post(`/internships/${id}/acceptance-letter`, { acceptanceLetterUrl });
  },

  getAllInternships: async (params?: { status?: string; classId?: number; page?: number; limit?: number; search?: string; academicYearId?: number }) => {
    return await api.get('/internships/all', { params });
  },

  assignExaminer: async (id: number, examinerId: number) => {
    return await api.post(`/internships/${id}/assign-examiner`, { examinerId });
  },

  scheduleDefense: async (id: number, data: { defenseDate: string; defenseRoom: string }) => {
    return await api.post(`/internships/${id}/schedule-defense`, data);
  },

  getExaminerInternships: async () => {
    return await api.get('/internships/examiner');
  },

  getInternshipDetail: async (id: number) => {
    return await api.get(`/internships/${id}/detail`);
  },

  gradeDefense: async (id: number, data: any) => {
    return await api.post(`/internships/${id}/grade-defense`, data);
  },

  getAssignedInternships: async () => {
    return await api.get('/internships/assigned');
  },

  getJournals: async (id: number) => {
    return await api.get(`/internships/${id}/journals`);
  },

  createJournal: async (id: number, data: any) => {
    return await api.post(`/internships/${id}/journals`, data);
  },

  approveJournal: async (journalId: number, data: { status: string; feedback?: string }) => {
    return await api.post(`/internships/journal/${journalId}/approve`, data);
  },

  getAttendances: async (id: number) => {
    return await api.get(`/internships/${id}/attendances`);
  },

  createAttendance: async (id: number, data: any) => {
    return await api.post(`/internships/${id}/attendances`, data);
  },

  updateStatus: async (id: number, data: any) => {
    return await api.patch(`/internships/${id}/status`, data);
  },

  printGroupLetter: async (data: any) => {
    return await api.post('/internships/print-group-letter', data);
  },

  getPrintLetterHtml: async (id: number, config: any) => {
    return await api.post(`/internships/${id}/print-letter`, config);
  },

  updateInternship: async (id: number, data: any) => {
    return await api.put(`/internships/${id}`, data);
  },

  deleteInternship: async (id: number) => {
    return await api.delete(`/internships/${id}`);
  },

  updateIndustryGrade: async (id: number, industryScore: number) => {
    return await api.patch(`/internships/${id}/industry-grade`, { industryScore });
  },

  getAssessmentComponents: async (isActive?: boolean) => {
    return await api.get('/internships/components', { params: { isActive } });
  },

  createAssessmentComponent: async (data: any) => {
    return await api.post('/internships/components', data);
  },

  updateAssessmentComponent: async (id: number, data: any) => {
    return await api.put(`/internships/components/${id}`, data);
  },

  deleteAssessmentComponent: async (id: number) => {
    return await api.delete(`/internships/components/${id}`);
  },

  // Magic Link Methods
  generateAccessCode: async (id: number) => {
    return await api.post(`/internships/${id}/access-code`);
  },

  verifyAccessCode: async (accessCode: string) => {
    return await api.get(`/internships/public/verify/${accessCode}`);
  },

  submitIndustryGradeViaLink: async (data: { accessCode: string; industryScore: number }) => {
    return await api.post(`/internships/public/grade`, data);
  }
};
