import { Router } from 'express';
import { authMiddleware } from '../middleware/auth';
import { 
  createScheme, 
  getSchemes, 
  getSchemeDetail, 
  updateScheme, 
  deleteScheme 
} from '../controllers/ukkScheme.controller';

const router = Router();

router.use(authMiddleware);

router.post('/', createScheme);
router.get('/', getSchemes);
router.get('/:id', getSchemeDetail);
router.put('/:id', updateScheme);
router.delete('/:id', deleteScheme);

export default router;
