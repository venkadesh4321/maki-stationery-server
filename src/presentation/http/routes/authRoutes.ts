import { Router } from 'express';
import { authController } from '../controllers/authController';
import { asyncHandler } from '../middlewares/asyncHandler';
import { authenticate } from '../middlewares/authenticate';
import { authorize } from '../middlewares/authorize';

const router = Router();

router.post('/register', authenticate, authorize(['ADMIN']), asyncHandler(authController.register));
router.post('/login', asyncHandler(authController.login));

export default router;
