import { Router } from 'express';
import { analyticsController } from '../controllers/analyticsController';
import { asyncHandler } from '../middlewares/asyncHandler';
import { authenticate } from '../middlewares/authenticate';
import { authorize } from '../middlewares/authorize';

const router = Router();

router.use(authenticate, authorize(['ADMIN', 'STAFF']));

router.get('/daily-sales', asyncHandler(analyticsController.dailySales));
router.get('/monthly-sales', asyncHandler(analyticsController.monthlySales));
router.get('/product-profit', asyncHandler(analyticsController.productProfit));
router.get('/category-profit', asyncHandler(analyticsController.categoryProfit));
router.get('/dead-stock', asyncHandler(analyticsController.deadStock));
router.get('/fast-moving', asyncHandler(analyticsController.fastMoving));

export default router;
