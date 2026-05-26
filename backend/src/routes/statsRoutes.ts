import { Router } from 'express';
import { getDatabaseStats, getTableStats, getUserStats } from '../controllers/statsController.js';
import { authMiddleware } from '../middlewares/authMiddleware.js';

const router = Router();

router.use(authMiddleware);

router.get('/user', getUserStats);
router.get('/databases/:databaseId', getDatabaseStats);
router.get('/databases/:databaseId/tables/:tableName', getTableStats);

export default router;
