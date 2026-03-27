import { Router } from 'express';
import {
  createFinanceAdjustmentRule,
  createFinanceComponent,
  listFinanceClassLevels,
  dispatchFinanceDueRemindersHandler,
  exportFinanceReports,
  applyFinanceInvoiceLateFees,
  createFinancePayment,
  createFinanceRefund,
  createFinanceTariffRule,
  generateFinanceInvoices,
  listFinanceAdjustmentRules,
  listFinanceComponents,
  listFinanceCredits,
  listFinanceInvoices,
  listFinanceReports,
  listStudentPayments,
  listFinanceTariffRules,
  listParentPayments,
  previewFinanceInvoices,
  updateFinanceInvoiceInstallments,
  updateFinanceAdjustmentRule,
  updateFinanceComponent,
  updateFinanceTariffRule,
} from '../controllers/payment.controller';
import { authMiddleware } from '../middleware/auth';
import { roleMiddleware } from '../middleware/role';

const router = Router();

router.use(authMiddleware);

router.get('/parent-overview', roleMiddleware(['PARENT']), listParentPayments);
router.get('/student-overview', roleMiddleware(['STUDENT']), listStudentPayments);
router.get('/components', roleMiddleware(['STAFF', 'ADMIN', 'TEACHER', 'PRINCIPAL']), listFinanceComponents);
router.get('/class-levels', roleMiddleware(['STAFF', 'ADMIN', 'TEACHER', 'PRINCIPAL']), listFinanceClassLevels);
router.post('/components', roleMiddleware(['STAFF', 'ADMIN', 'TEACHER']), createFinanceComponent);
router.patch('/components/:id', roleMiddleware(['STAFF', 'ADMIN', 'TEACHER']), updateFinanceComponent);
router.get('/tariffs', roleMiddleware(['STAFF', 'ADMIN', 'TEACHER', 'PRINCIPAL']), listFinanceTariffRules);
router.post('/tariffs', roleMiddleware(['STAFF', 'ADMIN', 'TEACHER']), createFinanceTariffRule);
router.patch('/tariffs/:id', roleMiddleware(['STAFF', 'ADMIN', 'TEACHER']), updateFinanceTariffRule);
router.get('/adjustments', roleMiddleware(['STAFF', 'ADMIN', 'TEACHER', 'PRINCIPAL']), listFinanceAdjustmentRules);
router.post('/adjustments', roleMiddleware(['STAFF', 'ADMIN', 'TEACHER']), createFinanceAdjustmentRule);
router.patch('/adjustments/:id', roleMiddleware(['STAFF', 'ADMIN', 'TEACHER']), updateFinanceAdjustmentRule);
router.post('/invoices/preview', roleMiddleware(['STAFF', 'ADMIN', 'TEACHER']), previewFinanceInvoices);
router.post('/invoices/generate', roleMiddleware(['STAFF', 'ADMIN', 'TEACHER']), generateFinanceInvoices);
router.get('/invoices', roleMiddleware(['STAFF', 'ADMIN', 'TEACHER', 'PRINCIPAL']), listFinanceInvoices);
router.post('/invoices/:id/late-fees/apply', roleMiddleware(['STAFF', 'ADMIN', 'TEACHER']), applyFinanceInvoiceLateFees);
router.patch('/invoices/:id/installments', roleMiddleware(['STAFF', 'ADMIN', 'TEACHER']), updateFinanceInvoiceInstallments);
router.post('/invoices/:id/payments', roleMiddleware(['STAFF', 'ADMIN', 'TEACHER']), createFinancePayment);
router.get('/credits', roleMiddleware(['STAFF', 'ADMIN', 'TEACHER', 'PRINCIPAL']), listFinanceCredits);
router.post('/credits/:studentId/refunds', roleMiddleware(['STAFF', 'ADMIN', 'TEACHER']), createFinanceRefund);
router.post('/reminders/dispatch', roleMiddleware(['STAFF', 'ADMIN', 'TEACHER']), dispatchFinanceDueRemindersHandler);
router.get('/reports', roleMiddleware(['STAFF', 'ADMIN', 'TEACHER', 'PRINCIPAL']), listFinanceReports);
router.get(
  '/reports/export',
  roleMiddleware(['STAFF', 'ADMIN', 'TEACHER', 'PRINCIPAL']),
  exportFinanceReports,
);

export default router;
