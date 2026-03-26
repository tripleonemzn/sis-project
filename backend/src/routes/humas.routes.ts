import { Router } from 'express';
import {
  applyToVacancy,
  batchShortlistApplications,
  createPartner,
  createVacancy,
  deletePartner,
  deleteVacancy,
  getApplications,
  getMyApplicantProfile,
  getMyApplications,
  getPartners,
  getShortlistBatchReport,
  getShortlistBatches,
  getVacancies,
  getVacancyById,
  updateApplicationPartnerArchive,
  updateApplicationStatus,
  updatePartner,
  updateVacancy,
  upsertMyApplicantProfile,
  upsertApplicationAssessments,
  withdrawMyApplication,
} from '../controllers/humas.controller';
import { authMiddleware as authenticate } from '../middleware/auth';
import { roleMiddleware } from '../middleware/role';
import { dutyMiddleware } from '../middleware/duty';

const router = Router();

router.use(authenticate);

const writeMiddleware = [
  roleMiddleware(['ADMIN', 'TEACHER']),
  dutyMiddleware(['WAKASEK_HUMAS', 'SEKRETARIS_HUMAS', 'KAPROG']),
];
const reviewMiddleware = [
  roleMiddleware(['ADMIN', 'TEACHER']),
  dutyMiddleware(['WAKASEK_HUMAS', 'SEKRETARIS_HUMAS', 'KAPROG']),
];

// Partners
router.get('/partners', getPartners);
router.post('/partners', ...writeMiddleware, createPartner);
router.put('/partners/:id', ...writeMiddleware, updatePartner);
router.delete('/partners/:id', ...writeMiddleware, deletePartner);

// Vacancies
router.get('/vacancies', getVacancies);
router.get('/vacancies/:id', getVacancyById);
router.post('/vacancies/:id/apply', roleMiddleware(['UMUM']), applyToVacancy);
router.post('/vacancies', ...writeMiddleware, createVacancy);
router.put('/vacancies/:id', ...writeMiddleware, updateVacancy);
router.delete('/vacancies/:id', ...writeMiddleware, deleteVacancy);

// Applicant self-service
router.get('/applicant-profile/me', roleMiddleware(['UMUM']), getMyApplicantProfile);
router.put('/applicant-profile/me', roleMiddleware(['UMUM']), upsertMyApplicantProfile);
router.get('/applications/me', roleMiddleware(['UMUM']), getMyApplications);
router.patch('/applications/:id/withdraw', roleMiddleware(['UMUM']), withdrawMyApplication);

// BKK review
router.get('/applications', ...reviewMiddleware, getApplications);
router.get('/shortlist-batches', ...reviewMiddleware, getShortlistBatches);
router.get('/shortlist-batches/report', ...reviewMiddleware, getShortlistBatchReport);
router.patch('/applications/batch-shortlist', ...reviewMiddleware, batchShortlistApplications);
router.patch('/applications/:id/assessment-board', ...reviewMiddleware, upsertApplicationAssessments);
router.patch('/applications/:id/partner-archive', ...reviewMiddleware, updateApplicationPartnerArchive);
router.patch('/applications/:id/status', ...reviewMiddleware, updateApplicationStatus);

export default router;
