import { Router } from 'express';
import { getPartners, createPartner, updatePartner, deletePartner, getVacancies, createVacancy, updateVacancy, deleteVacancy } from '../controllers/humas.controller';
import { authMiddleware as authenticate } from '../middleware/auth';
import { roleMiddleware } from '../middleware/role';
import { dutyMiddleware } from '../middleware/duty';

const router = Router();

router.use(authenticate);

const writeMiddleware = [
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
router.post('/vacancies', ...writeMiddleware, createVacancy);
router.put('/vacancies/:id', ...writeMiddleware, updateVacancy);
router.delete('/vacancies/:id', ...writeMiddleware, deleteVacancy);

export default router;
