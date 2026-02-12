import { Router } from 'express';
import { getPartners, createPartner, updatePartner, deletePartner, getVacancies, createVacancy, updateVacancy, deleteVacancy } from '../controllers/humas.controller';
import { verifyJWT as authenticate, verifyRole as authorize } from '../middlewares/auth.middleware';

const router = Router();

router.use(authenticate);

// Partners
router.get('/partners', getPartners);
router.post('/partners', authorize(['WAKASEK', 'ADMIN', 'HEAD_OF_PROGRAM']), createPartner);
router.put('/partners/:id', authorize(['WAKASEK', 'ADMIN', 'HEAD_OF_PROGRAM']), updatePartner);
router.delete('/partners/:id', authorize(['WAKASEK', 'ADMIN', 'HEAD_OF_PROGRAM']), deletePartner);

// Vacancies
router.get('/vacancies', getVacancies);
router.post('/vacancies', authorize(['WAKASEK', 'ADMIN', 'HEAD_OF_PROGRAM']), createVacancy);
router.put('/vacancies/:id', authorize(['WAKASEK', 'ADMIN', 'HEAD_OF_PROGRAM']), updateVacancy);
router.delete('/vacancies/:id', authorize(['WAKASEK', 'ADMIN', 'HEAD_OF_PROGRAM']), deleteVacancy);

export default router;
