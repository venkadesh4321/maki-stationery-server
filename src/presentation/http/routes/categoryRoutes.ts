import { Router } from 'express';
import { categoryController } from '../controllers/categoryController';
import { asyncHandler } from '../middlewares/asyncHandler';
import { authenticate } from '../middlewares/authenticate';
import { authorize } from '../middlewares/authorize';

const router = Router();

router.get('/', authenticate, authorize(['ADMIN', 'STAFF']), asyncHandler(categoryController.list));
router.post('/', authenticate, authorize(['ADMIN']), asyncHandler(categoryController.create));

export default router;
