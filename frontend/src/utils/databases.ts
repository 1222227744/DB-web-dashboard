import request from './request';

export type UserDatabase = {
  id: number;
  displayName: string;
  charset: 'utf8mb4';
  collation: 'utf8mb4_unicode_ci';
  tableCount: number;
  viewCount: number;
  sizeBytes: number;
  createdAt: string;
  updatedAt: string;
};

export type DatabaseListData = {
  items: UserDatabase[];
  total: number;
  limit: number;
};

export const fetchDatabases = async (): Promise<DatabaseListData> => {
  const res: any = await request.get('/v1/databases', {
    silentError: true
  });
  return res.data as DatabaseListData;
};

export const createDatabase = async (name: string): Promise<UserDatabase> => {
  const res: any = await request.post('/v1/databases', {
    displayName: name,
    charset: 'utf8mb4',
    collation: 'utf8mb4_unicode_ci'
  }, {
    silentError: true
  });
  return res.data.database as UserDatabase;
};

export const renameDatabase = async (databaseID: number, name: string): Promise<UserDatabase> => {
  const res: any = await request.patch(`/v1/databases/${databaseID}`, {
    displayName: name
  }, {
    silentError: true
  });
  return res.data.database as UserDatabase;
};

export const deleteDatabase = async (databaseID: number, confirmName: string): Promise<void> => {
  await request.delete(`/v1/databases/${databaseID}`, {
    data: {
      confirmation: {
        confirmed: true,
        confirmText: confirmName
      }
    },
    silentError: true
  });
};
