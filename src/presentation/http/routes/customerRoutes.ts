import { Router } from 'express';
import { customerController } from '../controllers/customerController';
import { asyncHandler } from '../middlewares/asyncHandler';
import { authenticate } from '../middlewares/authenticate';
import { authorize } from '../middlewares/authorize';

const router = Router();

router.get('/', authenticate, authorize(['ADMIN', 'STAFF']), asyncHandler(customerController.list));
router.post('/', authenticate, authorize(['ADMIN', 'STAFF']), asyncHandler(customerController.create));
router.get('/:id/ledger', authenticate, authorize(['ADMIN', 'STAFF']), asyncHandler(customerController.ledger));
router.post('/:id/payments', authenticate, authorize(['ADMIN', 'STAFF']), asyncHandler(customerController.recordPayment));

export default router;
