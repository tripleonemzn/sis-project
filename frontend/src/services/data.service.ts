import api from './api';

export const dataService = {
  exportTeachers: async () => {
    const response = await api.get('/data/teachers/export', {
      responseType: 'blob',
    });
    return response.data;
  },

  importTeachers: async (file: File) => {
    const formData = new FormData();
    formData.append('file', file);
    const response = await api.post('/data/teachers/import', formData, {
      headers: {
        'Content-Type': 'multipart/form-data',
      },
    });
    return response.data;
  },

  exportStudents: async () => {
    const response = await api.get('/data/students/export', {
      responseType: 'blob',
    });
    return response.data;
  },

  importStudents: async (file: File) => {
    const formData = new FormData();
    formData.append('file', file);
    const response = await api.post('/data/students/import', formData, {
      headers: {
        'Content-Type': 'multipart/form-data',
      },
    });
    return response.data;
  },

  exportParents: async () => {
    const response = await api.get('/data/parents/export', {
      responseType: 'blob',
    });
    return response.data;
  },

  importParents: async (file: File) => {
    const formData = new FormData();
    formData.append('file', file);
    const response = await api.post('/data/parents/import', formData, {
      headers: {
        'Content-Type': 'multipart/form-data',
      },
    });
    return response.data;
  },
};
