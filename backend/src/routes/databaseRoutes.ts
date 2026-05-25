import { Router } from 'express';
import { createDatabase, deleteDatabase, listDatabases, renameDatabase } from '../controllers/databaseController.js';
import { authMiddleware } from '../middlewares/authMiddleware.js';

const router = Router();

router.use(authMiddleware);

router.get('/', listDatabases);
router.post('/', createDatabase);
router.patch('/:databaseId', renameDatabase);
router.delete('/:databaseId', deleteDatabase);

export default router;
