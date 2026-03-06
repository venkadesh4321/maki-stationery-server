import { Router } from 'express';
import { saleController } from '../controllers/saleController';
import { asyncHandler } from '../middlewares/asyncHandler';
import { authenticate } from '../middlewares/authenticate';
import { authorize } from '../middlewares/authorize';

const router = Router();

router.post('/checkout', authenticate, authorize(['ADMIN', 'STAFF']), asyncHandler(saleController.checkout));

export default router;
