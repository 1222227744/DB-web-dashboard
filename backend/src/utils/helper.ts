// 纯函数：只负责生成 10 位数字字符串
export const generateAccountNo = (): string => {
    return Math.floor(1000000000 + Math.random() * 9000000000).toString();
};

// 纯函数：负责校验密码正则
export const isValidPassword = (password: string): boolean => {
    const passwordRegex = /^(?=.*[A-Za-z])(?=.*\d)[A-Za-z\d_@!#$%^&*()\-+=[\]{}|:;"',./<>?`~]{8,16}$/;
    return passwordRegex.test(password);
};