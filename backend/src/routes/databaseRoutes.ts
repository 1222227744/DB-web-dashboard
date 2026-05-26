import { Router } from 'express';
import { createDatabase, deleteDatabase, listDatabases, renameDatabase } from '../controllers/databaseController.js';
import { executeSelectQuery } from '../controllers/queryController.js';
import {
  createTable,
  createTableRow,
  deleteTable,
  deleteTableRow,
  getTableSchema,
  listDatabaseObjects,
  previewTableRows,
  updateTableSchema,
  updateTableRow
} from '../controllers/tableController.js';
import { authMiddleware } from '../middlewares/authMiddleware.js';

const router = Router();

router.use(authMiddleware);

router.get('/', listDatabases);
router.post('/', createDatabase);
router.get('/:databaseId/objects', listDatabaseObjects);
router.post('/:databaseId/query/select', executeSelectQuery);
router.post('/:databaseId/tables', createTable);
router.get('/:databaseId/tables/:tableName/schema', getTableSchema);
router.patch('/:databaseId/tables/:tableName/schema', updateTableSchema);
router.get('/:databaseId/tables/:tableName/preview', previewTableRows);
router.post('/:databaseId/tables/:tableName/rows', createTableRow);
router.patch('/:databaseId/tables/:tableName/rows', updateTableRow);
router.delete('/:databaseId/tables/:tableName/rows', deleteTableRow);
router.delete('/:databaseId/tables/:tableName', deleteTable);
router.patch('/:databaseId', renameDatabase);
router.delete('/:databaseId', deleteDatabase);

export default router;
