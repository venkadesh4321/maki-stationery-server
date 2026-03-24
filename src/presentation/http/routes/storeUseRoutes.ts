import { Router } from 'express';
import { storeUseController } from '../controllers/storeUseController';
import { asyncHandler } from '../middlewares/asyncHandler';
import { authenticate } from '../middlewares/authenticate';
import { authorize } from '../middlewares/authorize';

const router = Router();

router.get('/', authenticate, authorize(['ADMIN', 'STAFF']), asyncHandler(storeUseController.list));
router.post('/', authenticate, authorize(['ADMIN', 'STAFF']), asyncHandler(storeUseController.create));
router.put('/:id', authenticate, authorize(['ADMIN', 'STAFF']), asyncHandler(storeUseController.update));

export default router;
