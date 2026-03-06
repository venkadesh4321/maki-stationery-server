import { Router } from 'express';
import analyticsRoutes from './analyticsRoutes';
import authRoutes from './authRoutes';
import categoryRoutes from './categoryRoutes';
import productRoutes from './productRoutes';
import purchaseRoutes from './purchaseRoutes';
import supplierRoutes from './supplierRoutes';
import userRoutes from './userRoutes';

const router = Router();

router.get('/health', (_req, res) => {
  res.json({ status: 'ok' });
});

router.use('/auth', authRoutes);
router.use('/analytics', analyticsRoutes);
router.use('/categories', categoryRoutes);
router.use('/products', productRoutes);
router.use('/purchases', purchaseRoutes);
router.use('/suppliers', supplierRoutes);
router.use('/users', userRoutes);

export default router;
