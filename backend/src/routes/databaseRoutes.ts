import { Router } from 'express';
import { createDatabase, deleteDatabase, listDatabases, renameDatabase } from '../controllers/databaseController.js';
import { createTable, deleteTable, getTableSchema, listDatabaseObjects, previewTableRows } from '../controllers/tableController.js';
import { authMiddleware } from '../middlewares/authMiddleware.js';

const router = Router();

router.use(authMiddleware);

router.get('/', listDatabases);
router.post('/', createDatabase);
router.get('/:databaseId/objects', listDatabaseObjects);
router.post('/:databaseId/tables', createTable);
router.get('/:databaseId/tables/:tableName/schema', getTableSchema);
router.get('/:databaseId/tables/:tableName/preview', previewTableRows);
router.delete('/:databaseId/tables/:tableName', deleteTable);
router.patch('/:databaseId', renameDatabase);
router.delete('/:databaseId', deleteDatabase);

export default router;
