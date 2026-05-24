import request from './request';

export type UserPreferences = {
  themeMode: 'dark' | 'light';
  themeHue: number;
  backgroundPreset: 'particle' | 'image' | 'gradient';
  tablePageSize: number;
  confirmBatchInsert: boolean;
  confirmBatchUpdate: boolean;
  confirmBatchDelete: boolean;
  confirmCascadeDelete: boolean;
};

export const applyPreferences = (preferences: UserPreferences): void => {
  document.documentElement.style.setProperty('--theme-hue', String(preferences.themeHue));
};

export const fetchPreferences = async (): Promise<UserPreferences> => {
  const res: any = await request.get('/v1/users/me/preferences', {
    silentError: true
  });
  return res.data as UserPreferences;
};

export const updatePreferences = async (
  patch: Partial<Pick<UserPreferences, 'themeHue' | 'tablePageSize' | 'confirmBatchInsert' | 'confirmBatchUpdate' | 'confirmBatchDelete' | 'confirmCascadeDelete'>>
): Promise<UserPreferences> => {
  const res: any = await request.patch('/v1/users/me/preferences', patch, {
    silentError: true
  });
  return res.data as UserPreferences;
};
