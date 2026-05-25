import request from './request';

export type UserProfile = {
  userID: number;
  nickname: string;
  avatarAssetID: number | null;
  avatarUrl: string | null;
  backgroundAssetID: number | null;
  backgroundUrl: string | null;
};

export type UserAsset = {
  id: number;
  assetType: 'avatar' | 'background';
  originalName: string;
  mimeType: string;
  sizeBytes: number;
  storageKey: string;
};

export const fetchProfile = async (): Promise<UserProfile> => {
  const res: any = await request.get('/v1/users/me/profile', {
    silentError: true
  });
  return res.data as UserProfile;
};

export const updateProfile = async (nickname: string): Promise<UserProfile> => {
  const res: any = await request.patch('/v1/users/me/profile', {
    nickname
  }, {
    silentError: true
  });
  return res.data as UserProfile;
};

export const uploadUserAsset = async (
  assetType: 'avatar' | 'background',
  file: File
): Promise<UserAsset> => {
  const res: any = await request.post('/v1/users/me/assets', {
    assetType,
    originalName: file.name,
    mimeType: file.type,
    dataBase64: await readFileAsDataUrl(file)
  }, {
    silentError: true
  });
  return res.data as UserAsset;
};

export const fetchUserAssetBlob = async (assetUrl: string): Promise<Blob> => {
  const apiPath = assetUrl.replace(/^\/api/, '');
  const data: any = await request.get(apiPath, {
    responseType: 'blob',
    silentError: true
  });
  return data as Blob;
};

const readFileAsDataUrl = (file: File): Promise<string> => {
  return new Promise((resolve, reject) => {
    const reader = new FileReader();
    reader.onload = () => {
      if (typeof reader.result === 'string') {
        resolve(reader.result);
      } else {
        reject(new Error('资源读取失败'));
      }
    };
    reader.onerror = () => reject(new Error('资源读取失败'));
    reader.readAsDataURL(file);
  });
};
