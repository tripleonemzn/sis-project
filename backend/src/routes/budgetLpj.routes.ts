import { Router } from 'express';
import { authMiddleware } from '../middleware/auth';
import {
  listLpjInvoices,
  listFinanceLpjInvoices,
  createLpjInvoice,
  createLpjItem,
  updateLpjItem,
  deleteLpjItem,
  submitLpjInvoiceToSarpras,
  auditLpjItem,
  auditLpjInvoiceReport,
  uploadLpjInvoiceFile,
  uploadLpjProofFile,
  sarprasDecisionOnLpjInvoice,
} from '../controllers/budgetLpj.controller';
import { budgetLpjUpload } from '../utils/upload';

const router = Router();

router.use(authMiddleware);

router.get('/', listLpjInvoices);
router.get('/finance', listFinanceLpjInvoices);
router.post('/invoices', createLpjInvoice);
router.post('/items', createLpjItem);
router.put('/items/:id', updateLpjItem);
router.delete('/items/:id', deleteLpjItem);
router.post('/invoices/:id/submit', submitLpjInvoiceToSarpras);
router.post('/items/:id/audit', auditLpjItem);
router.post('/invoices/:id/audit-report', auditLpjInvoiceReport);
router.post(
  '/invoices/:id/invoice-file',
  budgetLpjUpload.single('file'),
  uploadLpjInvoiceFile,
);
router.post(
  '/invoices/:id/proof-file',
  budgetLpjUpload.single('file'),
  uploadLpjProofFile,
);
router.post('/invoices/:id/sarpras-decision', sarprasDecisionOnLpjInvoice);

export default router;
