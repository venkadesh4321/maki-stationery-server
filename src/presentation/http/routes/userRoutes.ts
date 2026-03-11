import { Router } from 'express';
import { userController } from '../controllers/userController';
import { authenticate } from '../middlewares/authenticate';
import { authorize } from '../middlewares/authorize';

const router = Router();

router.get('/me', authenticate, userController.me);
router.get('/admin', authenticate, authorize(['ADMIN']), userController.adminOnly);

export default router;
