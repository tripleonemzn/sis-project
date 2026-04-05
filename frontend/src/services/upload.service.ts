import api from './api';

export const uploadService = {
  uploadTeacherDocument: async (file: File) => {
    const formData = new FormData();
    formData.append('file', file);
    const response = await api.post('/upload/teacher/document', formData, {
      headers: {
        'Content-Type': 'multipart/form-data',
      },
    });
    return response.data.data;
  },
  uploadTeacherPhoto: async (file: File) => {
    const formData = new FormData();
    formData.append('file', file);
    const response = await api.post('/upload/teacher/photo', formData, {
      headers: {
        'Content-Type': 'multipart/form-data',
      },
    });
    return response.data.data;
  },
  uploadProfileEducationDocument: async (file: File) => {
    const formData = new FormData();
    formData.append('file', file);
    const response = await api.post('/upload/profile-education/document', formData, {
      headers: {
        'Content-Type': 'multipart/form-data',
      },
    });
    return response.data.data as {
      url: string;
      filename: string;
      originalname: string;
      mimetype: string;
      size: number;
    };
  },
  uploadInternshipFile: async (file: File) => {
    const formData = new FormData();
    formData.append('file', file);
    const response = await api.post('/upload/internship', formData, {
      headers: {
        'Content-Type': 'multipart/form-data',
      },
    });
    return response.data.data;
  },
  uploadFinanceProof: async (file: File) => {
    const formData = new FormData();
    formData.append('file', file);
    const response = await api.post('/upload/finance-proof', formData, {
      headers: {
        'Content-Type': 'multipart/form-data',
      },
    });
    return response.data.data as {
      url: string;
      filename: string;
      originalname: string;
      mimetype: string;
      size: number;
    };
  },
  uploadHomeroomBookFile: async (file: File) => {
    const formData = new FormData();
    formData.append('file', file);
    const response = await api.post('/upload/homeroom-book', formData, {
      headers: {
        'Content-Type': 'multipart/form-data',
      },
    });
    return response.data.data as {
      url: string;
      filename: string;
      originalname: string;
      mimetype: string;
      size: number;
    };
  },
};
