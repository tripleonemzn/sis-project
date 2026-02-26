import { Router } from 'express';
import { authMiddleware } from '../middleware/auth';
import { roleMiddleware } from '../middleware/role';
import { dutyMiddleware } from '../middleware/duty';
import {
  getRoomCategories,
  createRoomCategory,
  updateRoomCategory,
  deleteRoomCategory,
  getRooms,
  getRoomById,
  createRoom,
  updateRoom,
  deleteRoom,
  getInventoryByRoom,
  createInventory,
  updateInventory,
  deleteInventory,
  getLibraryLoanClassOptions,
  getLibraryLoanSettings,
  getLibraryBookLoans,
  updateLibraryLoanSettings,
  createLibraryBookLoan,
  updateLibraryBookLoan,
  deleteLibraryBookLoan,
} from '../controllers/inventory.controller';

const router = Router();

router.use(authMiddleware);

// Middleware for write operations (Admin or Wakasek/Sekretaris Sarpras)
const structureWriteMiddleware = [
  roleMiddleware(['ADMIN', 'TEACHER']),
  dutyMiddleware(['WAKASEK_SARPRAS', 'SEKRETARIS_SARPRAS'])
];

const itemWriteMiddleware = [
  roleMiddleware(['ADMIN', 'TEACHER']),
  dutyMiddleware([
    'WAKASEK_SARPRAS',
    'SEKRETARIS_SARPRAS',
    'KEPALA_LAB',
    'KEPALA_PERPUSTAKAAN',
  ])
];

const libraryLoanReadMiddleware = [
  roleMiddleware(['ADMIN', 'TEACHER']),
  dutyMiddleware([
    'WAKASEK_SARPRAS',
    'SEKRETARIS_SARPRAS',
    'KEPALA_PERPUSTAKAAN',
  ]),
];

const libraryLoanWriteMiddleware = [
  roleMiddleware(['ADMIN', 'TEACHER']),
  dutyMiddleware([
    'WAKASEK_SARPRAS',
    'SEKRETARIS_SARPRAS',
    'KEPALA_PERPUSTAKAAN',
  ]),
];

const readMiddleware = [
  roleMiddleware(['ADMIN', 'TEACHER'])
];

// Categories
router.get('/categories', ...readMiddleware, getRoomCategories);
router.post('/categories', ...structureWriteMiddleware, createRoomCategory);
router.put('/categories/:id', ...structureWriteMiddleware, updateRoomCategory);
router.delete('/categories/:id', ...structureWriteMiddleware, deleteRoomCategory);

// Rooms
router.get('/rooms', ...readMiddleware, getRooms);
router.get('/rooms/:id', ...readMiddleware, getRoomById);

router.post('/rooms', ...structureWriteMiddleware, createRoom);
router.put('/rooms/:id', ...structureWriteMiddleware, updateRoom);
router.delete('/rooms/:id', ...structureWriteMiddleware, deleteRoom);

// Inventory
router.get('/rooms/:roomId/inventory', ...readMiddleware, getInventoryByRoom);

router.post('/inventory', ...itemWriteMiddleware, createInventory);
router.put('/inventory/:id', ...itemWriteMiddleware, updateInventory);
router.delete('/inventory/:id', ...itemWriteMiddleware, deleteInventory);

// Library Book Loans
router.get('/library-loans/classes', ...libraryLoanReadMiddleware, getLibraryLoanClassOptions);
router.get('/library-loans/settings', ...libraryLoanReadMiddleware, getLibraryLoanSettings);
router.get('/library-loans', ...libraryLoanReadMiddleware, getLibraryBookLoans);
router.put('/library-loans/settings', ...libraryLoanWriteMiddleware, updateLibraryLoanSettings);
router.post('/library-loans', ...libraryLoanWriteMiddleware, createLibraryBookLoan);
router.put('/library-loans/:id', ...libraryLoanWriteMiddleware, updateLibraryBookLoan);
router.delete('/library-loans/:id', ...libraryLoanWriteMiddleware, deleteLibraryBookLoan);

export default router;
