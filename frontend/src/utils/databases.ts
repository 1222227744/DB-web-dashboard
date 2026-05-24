import request from './request';

export type UserDatabase = {
  id: number;
  name: string;
  tableCount: number;
  sizeBytes: number;
  createdAt: string;
  updatedAt: string;
};

export type DatabaseListData = {
  databases: UserDatabase[];
  total: number;
  limit: number;
};

export const fetchDatabases = async (): Promise<DatabaseListData> => {
  const res: any = await request.get('/v1/databases');
  return res.data as DatabaseListData;
};

export const createDatabase = async (name: string): Promise<UserDatabase> => {
  const res: any = await request.post('/v1/databases', { name });
  return res.data.database as UserDatabase;
};

export const renameDatabase = async (databaseID: number, name: string): Promise<UserDatabase> => {
  const res: any = await request.patch(`/v1/databases/${databaseID}`, { name });
  return res.data.database as UserDatabase;
};

export const deleteDatabase = async (databaseID: number): Promise<void> => {
  await request.delete(`/v1/databases/${databaseID}`);
};
