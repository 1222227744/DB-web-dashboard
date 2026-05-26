import { Router } from 'express';
import { listAuditLogs } from '../controllers/auditController.js';
import { authMiddleware } from '../middlewares/authMiddleware.js';

const router = Router();

router.use(authMiddleware);
router.get('/', listAuditLogs);

export default router;
