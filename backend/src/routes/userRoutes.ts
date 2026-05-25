import { Router } from 'express';
import {
  getAsset,
  getPreferences,
  getProfile,
  updatePreferences,
  updateProfile,
  uploadAsset
} from '../controllers/userController.js';
import { authMiddleware } from '../middlewares/authMiddleware.js';

const router = Router();

router.get('/me/preferences', authMiddleware, getPreferences);
router.patch('/me/preferences', authMiddleware, updatePreferences);
router.get('/me/profile', authMiddleware, getProfile);
router.patch('/me/profile', authMiddleware, updateProfile);
router.post('/me/assets', authMiddleware, uploadAsset);
router.get('/me/assets/:assetId', authMiddleware, getAsset);

export default router;
