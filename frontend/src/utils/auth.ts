export type AuthUser = {
  userID: number;
  accountNo: string;
  displayName: string;
  status: 'active' | 'disabled';
};

const ACCESS_TOKEN_KEY = 'access_token';
const USER_KEY = 'auth_user';

export const getAccessToken = (): string | null => {
  return localStorage.getItem(ACCESS_TOKEN_KEY);
};

export const setAccessToken = (token: string): void => {
  localStorage.setItem(ACCESS_TOKEN_KEY, token);
};

export const getAuthUser = (): AuthUser | null => {
  const rawUser = localStorage.getItem(USER_KEY);

  if (!rawUser) {
    return null;
  }

  try {
    return JSON.parse(rawUser) as AuthUser;
  } catch {
    clearAuthState();
    return null;
  }
};

export const setAuthUser = (user: AuthUser): void => {
  localStorage.setItem(USER_KEY, JSON.stringify(user));
};

export const setAuthState = (accessToken: string, user: AuthUser): void => {
  setAccessToken(accessToken);
  setAuthUser(user);
};

export const clearAuthState = (): void => {
  localStorage.removeItem(ACCESS_TOKEN_KEY);
  localStorage.removeItem(USER_KEY);
  localStorage.removeItem('token');
  localStorage.removeItem('userName');
};

export const isLoggedIn = (): boolean => {
  return Boolean(getAccessToken());
};
