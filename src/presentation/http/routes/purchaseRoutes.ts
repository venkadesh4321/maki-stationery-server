import { Router } from 'express';
import { purchaseController } from '../controllers/purchaseController';
import { asyncHandler } from '../middlewares/asyncHandler';
import { authenticate } from '../middlewares/authenticate';
import { authorize } from '../middlewares/authorize';

const router = Router();

router.get('/', authenticate, authorize(['ADMIN', 'STAFF']), asyncHandler(purchaseController.list));
router.get('/:id', authenticate, authorize(['ADMIN', 'STAFF']), asyncHandler(purchaseController.getById));
router.post('/', authenticate, authorize(['ADMIN', 'STAFF']), asyncHandler(purchaseController.create));
router.patch('/:id', authenticate, authorize(['ADMIN', 'STAFF']), asyncHandler(purchaseController.update));
router.post('/:id/cancel', authenticate, authorize(['ADMIN', 'STAFF']), asyncHandler(purchaseController.cancel));

export default router;
