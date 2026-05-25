import pool from '../config/db.js';
import { AppError } from '../errors/AppError.js';

type DatabaseParams = {
  databaseId?: string;
  databaseID?: string;
};

export type OwnedDatabase = {
  id: number;
  displayName: string;
  schemaName: string;
};

export const parseDatabaseID = (value: string | undefined): number => {
  const databaseID = Number(value);

  if (!Number.isInteger(databaseID) || databaseID <= 0) {
    throw new AppError({
      httpStatus: 400,
      type: 'VALIDATION_ERROR',
      code: 'VALIDATION_FIELD_INVALID',
      message: '数据库 ID 不正确'
    });
  }

  return databaseID;
};

export const getDatabaseIDFromParams = (params: DatabaseParams): number => {
  return parseDatabaseID(params.databaseId ?? params.databaseID);
};

export const resolveOwnedDatabase = async (userID: number, databaseID: number): Promise<OwnedDatabase> => {
  const [rows] = await pool.query(
    `SELECT id, display_name, schema_name
     FROM user_databases
     WHERE id = ? AND user_id = ? AND status = 'active'
     LIMIT 1`,
    [databaseID, userID]
  );
  const database = (rows as Array<{ id: number; display_name: string; schema_name: string }>)[0];

  if (!database) {
    throw new AppError({
      httpStatus: 404,
      type: 'RESOURCE_NOT_FOUND',
      code: 'DATABASE_NOT_FOUND',
      message: '数据库不存在'
    });
  }

  return {
    id: Number(database.id),
    displayName: database.display_name,
    schemaName: database.schema_name
  };
};
