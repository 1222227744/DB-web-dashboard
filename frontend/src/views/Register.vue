<script setup lang="ts">
import { ref } from 'vue';
import { useRouter } from 'vue-router';
import { ElMessage, ElMessageBox } from 'element-plus';
import request from '../utils/request';

const router = useRouter();

// 1、定义页面需要的响应式变量
const userName = ref('');
const pwd = ref('');
const isLoading = ref(false);

// 2、页面跳转逻辑
const gotoLogin = () => {
  router.push('/login');
};

// 3、注册逻辑
const handleRegister = async () => {
  // 1、净化数据：去除首尾空格
  const nameStr = userName.value.trim();
  const pwdStr = pwd.value.trim();

  // 2、非空校验
  if (!nameStr || !pwdStr) {
    ElMessage.warning('注册失败：请完整填写昵称和密码');
    return;
  }

  // 3、昵称长度检验
  if (nameStr.length < 2 || nameStr.length > 20) {
    ElMessage.warning('注册失败：昵称长度必须为2到20个字符');
    return;
  }

  // 4、密码正则表达式
  // (?=.*[a-zA-Z]) ：预查，必须包含至少一个字母（大小写均可）
  // (?=.*\d)       ：预查，必须包含至少一个数字
  // [^\s\u4e00-\u9fa5]{8,16} ：实际匹配的内容不能是空格(\s)，不能是中文(\u4e00-\u9fa5)，长度限制在 {8,16} 之间
  const pwdRegex = /^(?=.*[a-zA-Z])(?=.*\d)[^\s\u4e00-\u9fa5]{8,16}$/;

  if (!pwdRegex.test(pwdStr)) {
    ElMessage.warning('注册失败：密码必须为8-16位，且同时包含数字和字母，不能含有中文或空格');
    return;
  }

  // 5、开始按钮的转圈动画
  isLoading.value = true;

  // 6、发送请求
  try {
    const res: any = await request.post('/v1/auth/register', {
      userName: nameStr,
      password: pwdStr
    });

    ElMessageBox.alert(
      `<strong>您的专属登录账号是：<span style="color: #409EFF; font-size: 24px; margin: 0 5px;">${res.data.accountNo}</span></strong><br/><br/>请务必截图或牢记，后续只能凭此账号登录！`,
      '注册成功',
      {
        dangerouslyUseHTMLString: true,
        confirmButtonText: '去登录',
        type: 'success',
        center: true,
        callback: () => {
          gotoLogin();
        },
      }
    );
  } catch (error) {
    console.error('注册请求异常:', error);
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
              v-model="userName"
              placeholder="请输入您的昵称(2-20字符)"
              @keyup.enter="handleRegister"
            />
          </el-form-item>

          <el-form-item>
            <el-input
              v-model="pwd"
              placeholder="请输入密码(8-16位，字母+数字)"
              type="password"
              show-password
              @keyup.enter="handleRegister"
            />
          </el-form-item>

          <el-form-item>
            <el-button
              type="primary"
              class="glass-submit-button"
              :loading="isLoading"
              @click="handleRegister"
            >
              注册
            </el-button>
          </el-form-item>
        </el-form>
      </el-main>

      <el-footer>
        <el-link type="info" :underline="false" @click="gotoLogin">
          已有账号？返回登录
        </el-link>
      </el-footer>
    </el-container>
  </div>
</template>
