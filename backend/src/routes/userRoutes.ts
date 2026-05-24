import { Router } from 'express';
import { getPreferences, updatePreferences } from '../controllers/userController.js';
import { authMiddleware } from '../middlewares/authMiddleware.js';

const router = Router();

router.get('/me/preferences', authMiddleware, getPreferences);
router.patch('/me/preferences', authMiddleware, updatePreferences);

export default router;
