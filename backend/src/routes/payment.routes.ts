import { Router } from 'express';
import {
  createFinanceAdjustmentRule,
  createFinanceComponent,
  listFinanceClassLevels,
  createFinanceWriteOffRequest,
  decideFinanceCashSessionAsHeadTu,
  decideFinanceCashSessionAsPrincipal,
  dispatchFinanceDueRemindersHandler,
  decideFinanceWriteOffAsHeadTu,
  decideFinanceWriteOffAsPrincipal,
  exportFinanceReports,
  applyFinanceInvoiceLateFees,
  createFinancePayment,
  createFinanceRefund,
  createFinanceTariffRule,
  generateFinanceInvoices,
  getFinanceReminderPolicy,
  getFinanceCashSessionApprovalPolicy,
  listFinanceAdjustmentRules,
  listFinanceCashSessions,
  listFinanceComponents,
  listFinanceCredits,
  listFinanceInvoices,
  listFinanceReports,
  listFinanceWriteOffs,
  listStudentPayments,
  listFinanceTariffRules,
  listParentPayments,
  previewFinanceInvoices,
  applyFinanceWriteOff,
  applyFinancePaymentReversal,
  closeFinanceCashSession,
  openFinanceCashSession,
  updateFinanceInvoiceInstallments,
  updateFinanceCashSessionApprovalPolicy,
  updateFinanceAdjustmentRule,
  updateFinanceComponent,
  updateFinanceReminderPolicy,
  updateFinanceTariffRule,
  createFinancePaymentReversalRequest,
  decideFinancePaymentReversalAsHeadTu,
  decideFinancePaymentReversalAsPrincipal,
  listFinancePaymentReversals,
} from '../controllers/payment.controller';
import { authMiddleware } from '../middleware/auth';
import { roleMiddleware } from '../middleware/role';

const router = Router();

router.use(authMiddleware);

router.get('/parent-overview', roleMiddleware(['PARENT']), listParentPayments);
router.get('/student-overview', roleMiddleware(['STUDENT']), listStudentPayments);
router.get('/components', roleMiddleware(['STAFF', 'ADMIN', 'TEACHER', 'PRINCIPAL']), listFinanceComponents);
router.get('/class-levels', roleMiddleware(['STAFF', 'ADMIN', 'TEACHER', 'PRINCIPAL']), listFinanceClassLevels);
router.get('/reminder-policy', roleMiddleware(['STAFF', 'ADMIN', 'TEACHER', 'PRINCIPAL']), getFinanceReminderPolicy);
router.get('/cash-session-policy', roleMiddleware(['STAFF', 'ADMIN', 'TEACHER', 'PRINCIPAL']), getFinanceCashSessionApprovalPolicy);
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
router.get('/cash-sessions', roleMiddleware(['STAFF', 'ADMIN', 'TEACHER', 'PRINCIPAL']), listFinanceCashSessions);
router.post('/cash-sessions/open', roleMiddleware(['STAFF', 'ADMIN', 'TEACHER']), openFinanceCashSession);
router.post('/cash-sessions/:id/close', roleMiddleware(['STAFF', 'ADMIN', 'TEACHER']), closeFinanceCashSession);
router.post('/cash-sessions/:id/head-tu-decision', roleMiddleware(['STAFF']), decideFinanceCashSessionAsHeadTu);
router.post('/cash-sessions/:id/principal-decision', roleMiddleware(['PRINCIPAL']), decideFinanceCashSessionAsPrincipal);
router.post('/invoices/:id/late-fees/apply', roleMiddleware(['STAFF', 'ADMIN', 'TEACHER']), applyFinanceInvoiceLateFees);
router.patch('/invoices/:id/installments', roleMiddleware(['STAFF', 'ADMIN', 'TEACHER']), updateFinanceInvoiceInstallments);
router.post('/invoices/:id/payments', roleMiddleware(['STAFF', 'ADMIN', 'TEACHER']), createFinancePayment);
router.post('/payment-records/:id/reversals', roleMiddleware(['STAFF', 'ADMIN', 'TEACHER']), createFinancePaymentReversalRequest);
router.post('/invoices/:id/write-offs', roleMiddleware(['STAFF', 'ADMIN', 'TEACHER']), createFinanceWriteOffRequest);
router.get('/credits', roleMiddleware(['STAFF', 'ADMIN', 'TEACHER', 'PRINCIPAL']), listFinanceCredits);
router.post('/credits/:studentId/refunds', roleMiddleware(['STAFF', 'ADMIN', 'TEACHER']), createFinanceRefund);
router.get('/reversals', roleMiddleware(['STAFF', 'ADMIN', 'TEACHER', 'PRINCIPAL']), listFinancePaymentReversals);
router.post('/reversals/:id/head-tu-decision', roleMiddleware(['STAFF']), decideFinancePaymentReversalAsHeadTu);
router.post('/reversals/:id/principal-decision', roleMiddleware(['PRINCIPAL']), decideFinancePaymentReversalAsPrincipal);
router.post('/reversals/:id/apply', roleMiddleware(['STAFF', 'ADMIN', 'TEACHER']), applyFinancePaymentReversal);
router.get('/write-offs', roleMiddleware(['STAFF', 'ADMIN', 'TEACHER', 'PRINCIPAL']), listFinanceWriteOffs);
router.post('/write-offs/:id/head-tu-decision', roleMiddleware(['STAFF']), decideFinanceWriteOffAsHeadTu);
router.post('/write-offs/:id/principal-decision', roleMiddleware(['PRINCIPAL']), decideFinanceWriteOffAsPrincipal);
router.post('/write-offs/:id/apply', roleMiddleware(['STAFF', 'ADMIN', 'TEACHER']), applyFinanceWriteOff);
router.post('/reminders/dispatch', roleMiddleware(['STAFF', 'ADMIN', 'TEACHER']), dispatchFinanceDueRemindersHandler);
router.put('/reminder-policy', roleMiddleware(['STAFF', 'ADMIN', 'TEACHER']), updateFinanceReminderPolicy);
router.put('/cash-session-policy', roleMiddleware(['STAFF', 'ADMIN', 'TEACHER']), updateFinanceCashSessionApprovalPolicy);
router.get('/reports', roleMiddleware(['STAFF', 'ADMIN', 'TEACHER', 'PRINCIPAL']), listFinanceReports);
router.get(
  '/reports/export',
  roleMiddleware(['STAFF', 'ADMIN', 'TEACHER', 'PRINCIPAL']),
  exportFinanceReports,
);

export default router;
