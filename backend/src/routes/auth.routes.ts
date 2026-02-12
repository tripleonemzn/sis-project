import { Router } from 'express';
import { login, register, getMe, registerCalonSiswa, registerUmum, adminVerifyUser, adminAcceptCalonSiswa } from '../controllers/auth.controller';
import { authMiddleware } from '../middleware/auth';
import { roleMiddleware } from '../middleware/role';

const router = Router();

router.post('/login', login);
router.post('/register', authMiddleware, register); // Only authenticated users (admins) should register new users ideally
router.post('/register-calon-siswa', registerCalonSiswa);
router.post('/register-umum', registerUmum);
router.post('/admin/verify-user', authMiddleware, roleMiddleware(['ADMIN']), adminVerifyUser);
router.post('/admin/accept-calon-siswa', authMiddleware, roleMiddleware(['ADMIN']), adminAcceptCalonSiswa);
router.get('/me', authMiddleware, getMe);

export default router;
