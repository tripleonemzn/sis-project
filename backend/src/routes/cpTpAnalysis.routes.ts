import { Router } from 'express';
import { getCpTpAnalysis, saveCpTpAnalysis } from '../controllers/cpTpAnalysis.controller';
import { verifyJWT, verifyRole } from '../middlewares/auth.middleware';

const router = Router();

router.use(verifyJWT);

router.get('/', getCpTpAnalysis);
router.post('/', verifyRole(['TEACHER', 'ADMIN', 'PRINCIPAL', 'STAFF']), saveCpTpAnalysis);

export default router;
