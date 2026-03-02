import { Router } from 'express';
import { supplierController } from '../controllers/supplierController';
import { asyncHandler } from '../middlewares/asyncHandler';
import { authenticate } from '../middlewares/authenticate';
import { authorize } from '../middlewares/authorize';

const router = Router();

router.get('/', authenticate, authorize(['ADMIN', 'STAFF']), asyncHandler(supplierController.list));

export default router;
