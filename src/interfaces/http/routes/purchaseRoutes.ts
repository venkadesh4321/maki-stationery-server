import { Router } from 'express';
import { purchaseController } from '../controllers/purchaseController';
import { asyncHandler } from '../middlewares/asyncHandler';
import { authenticate } from '../middlewares/authenticate';
import { authorize } from '../middlewares/authorize';

const router = Router();

router.get('/', authenticate, authorize(['ADMIN', 'STAFF']), asyncHandler(purchaseController.list));
router.post('/', authenticate, authorize(['ADMIN', 'STAFF']), asyncHandler(purchaseController.create));

export default router;
