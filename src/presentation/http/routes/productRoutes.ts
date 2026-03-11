import { Router } from 'express';
import { productController } from '../controllers/productController';
import { asyncHandler } from '../middlewares/asyncHandler';
import { authenticate } from '../middlewares/authenticate';
import { authorize } from '../middlewares/authorize';

const router = Router();

router.get('/', authenticate, asyncHandler(productController.list));
router.post('/', authenticate, authorize(['ADMIN']), asyncHandler(productController.create));
router.patch('/:id', authenticate, authorize(['ADMIN']), asyncHandler(productController.update));
router.delete('/:id', authenticate, authorize(['ADMIN']), asyncHandler(productController.remove));

export default router;
