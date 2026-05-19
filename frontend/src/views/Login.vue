<script setup lang="ts">
import { ref, onMounted } from 'vue';
import { useRouter } from 'vue-router';
import request from '../utils/request';
import { ElMessage } from 'element-plus';

const router = useRouter();

// 表单绑定的变量
const account = ref('');
const pwd = ref('');
const rememberMe = ref(false);

// 按钮状态控制
const isLoading = ref(false);

// 页面加载时，检查是否记住我
onMounted(() => {
  const savedAccount = localStorage.getItem('saved_account');
  if (savedAccount) {
    account.value = savedAccount;
    rememberMe.value = true;
  }
});

// 跳转注册页
const gotoRegister = () => router.push('/register');

// 登录业务逻辑
const handleLogin = async () => {
  // 1、获取并去除首尾空格
  const accountStr = account.value.trim();
  const pwdStr = pwd.value.trim();

  // 2、前端预校验 - 非空校验
  if (!accountStr || !pwdStr) {
    ElMessage.warning('登录失败：请填写账号和密码');
    return;
  }

  // 3、前端预校验 - 10位纯数字正则校验
  const accountRegex = /^\d{10}$/;
  if (!accountRegex.test(accountStr)) {
    ElMessage.warning('登录失败：账号格式不正确（必须为10位数字）');
    return;
  }

  // 4、校验通过，开始按钮转圈
  isLoading.value = true;

  // 5、发起后端请求
  try {
    const res: any = await request.post('/v1/auth/login', {
      accountNo: accountStr,
      password: pwdStr
    });

    ElMessage.success(res.message);
    const { token, userName } = res.data;

    localStorage.setItem('token', token);
    localStorage.setItem('userName', userName);

    if (rememberMe.value) {
      localStorage.setItem('saved_account', accountStr);
    } else {
      localStorage.removeItem('saved_account');
    }

    router.push('/home');
  } catch (error) {
    console.log('登录已中断');
  } finally {
    isLoading.value = false;
  }
};
</script>

<template>
  <div class="glass-page">
    <el-container class="glass-panel">
      <div class="glass-icon-wrapper">
        <svg viewBox="0 0 1024 1024" class="glass-icon">
          <path d="M512 485.4c100 0 181.1-81.1 181.1-181.1S612 123.2 512 123.2s-181.1 81.1-181.1 181.1S412 485.4 512 485.4z m0 84.5c-123.4 0-350.2 61.8-350.2 184.3v100.6h700.4V754.2c0-122.5-226.8-184.3-350.2-184.3z" fill="none" stroke="currentColor" stroke-width="30" />
        </svg>
      </div>

      <el-main>
        <el-form>
          <el-form-item>
            <el-input
              v-model="account"
              placeholder="请输入10位登录账号"
              @keyup.enter="handleLogin"
            />
          </el-form-item>

          <el-form-item>
            <el-input
              v-model="pwd"
              placeholder="请输入密码"
              type="password"
              show-password
              @keyup.enter="handleLogin"
            />
          </el-form-item>

          <el-form-item>
            <el-checkbox v-model="rememberMe" class="glass-checkbox">
              记住我
            </el-checkbox>
          </el-form-item>

          <el-form-item>
            <el-button
              type="primary"
              class="glass-submit-button"
              :loading="isLoading"
              @click="handleLogin"
            >
              登录
            </el-button>
          </el-form-item>
        </el-form>
      </el-main>

      <el-footer>
        <el-link type="info" :underline="false" @click="gotoRegister">
          去注册
        </el-link>
      </el-footer>
    </el-container>
  </div>
</template>
