export type AuthUser = {
  userID: number;
  accountNo: string;
  displayName: string;
  status: 'active' | 'disabled';
};

export type AccessTokenPayload = {
  sub: string;
  accountNo: string;
};
