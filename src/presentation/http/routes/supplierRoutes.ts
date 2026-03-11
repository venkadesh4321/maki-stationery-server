import { Router } from 'express';
import { supplierController } from '../controllers/supplierController';
import { asyncHandler } from '../middlewares/asyncHandler';
import { authenticate } from '../middlewares/authenticate';
import { authorize } from '../middlewares/authorize';

const router = Router();

router.get('/', authenticate, authorize(['ADMIN', 'STAFF']), asyncHandler(supplierController.list));
router.post('/', authenticate, authorize(['ADMIN']), asyncHandler(supplierController.create));
router.patch('/:id', authenticate, authorize(['ADMIN']), asyncHandler(supplierController.update));

export default router;
