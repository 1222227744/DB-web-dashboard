<script setup lang="ts">
  import { ref } from 'vue';
  import { useRouter } from 'vue-router';
  import ParticleBackground from '../components/ParticleBackground.vue';
  const rememberme = ref(false)
  const router = useRouter()
  const userName = ref('')
  const pwd = ref('')
  const account = ref('')
  const ifByAccount = ref(true)
  const gotoRegister = () => router.push('/register')
  const toggleLoginMethod = ()=>{
    ifByAccount.value = !ifByAccount.value
  }
  const handleLogin = () => {
  // ... 之前的验证逻辑 ...

  if (rememberme.value) {
    // 如果勾选了，把账号存进浏览器的本地存储 (LocalStorage)
    localStorage.setItem('saved_account', account.value);
  } else {
    localStorage.removeItem('saved_account');
  }
  
  // 模拟登录成功
  console.log("登录成功！是否记住我：", rememberme.value);
};
</script>

<template>
  <div class="container">
    <particle-background />

    <el-container class="login-box">
      <div class="dynamic-icon-wrapper">
        <svg viewBox="0 0 1024 1024" class="dynamic-icon">
          <path d="M512 485.4c100 0 181.1-81.1 181.1-181.1S612 123.2 512 123.2s-181.1 81.1-181.1 181.1S412 485.4 512 485.4z m0 84.5c-123.4 0-350.2 61.8-350.2 184.3v100.6h700.4V754.2c0-122.5-226.8-184.3-350.2-184.3z" fill="none" stroke="currentColor" stroke-width="30" />
        </svg>
      </div>
      <el-main style="padding: 0%;">
        <el-form>
          <el-form-item>
            <el-input placeholder="请输入账号" v-if="ifByAccount" v-model="account"></el-input>
            <el-input placeholder="请输入用户名" v-else-if="!ifByAccount" v-model="userName"></el-input>
          </el-form-item>
          <el-form-item>
            <el-input placeholder="请输入密码" type="password" v-model="pwd" show-password></el-input>
          </el-form-item>
          <el-form-item>
            <el-checkbox v-model="rememberme" class="glass-checkbox">记住我</el-checkbox>
          </el-form-item>
          <el-form-item>
            <el-button type="primary" style="width: 100%;" @click="handleLogin">登录</el-button>
          </el-form-item>
          </el-form>
      </el-main>
      <el-footer style="
      display: flex;
      justify-content: space-between;
      align-items: center;">
        <!-- <el-button @click="gotoRegister">去注册</el-button> -->
        <el-link type="primary" :underline="false" @click="toggleLoginMethod">
          {{ ifByAccount ? '用户名登录' : '账号登录' }}
        </el-link>
        <el-link type="info" :underline="false" @click="gotoRegister">
          去注册
        </el-link>
      </el-footer>
    </el-container>

  </div>
</template>
<style scoped>
/* =========================================
   1. 外部容器与登录 Box (极简透明)
   ========================================= */
.container {
  position: relative;
  overflow: hidden;
  display: flex;
  justify-content: center;
  align-items: center;
  height: 100vh;
  width: 100vw;
}

.login-box {
  position: relative;
  z-index: 1;
  width: 90%;
  max-width: 400px;
  height: auto;
  
  /* 保持极高的透明度，让后面的节点和连线清晰透过来 */
  background-color: rgba(255, 255, 255, 0.015); /* 几乎全透 */
  
  /* 保持低模糊度，避免整体变糊 */
  backdrop-filter: blur(5px); 
  -webkit-backdrop-filter: blur(5px);
  
  /* 超细白边框 */
  border: 1px solid rgba(255, 255, 255, 0.1); 
  
  padding: 100px 40px 40px 40px;
  border-radius: 20px; 
  box-shadow: 0 15px 35px rgba(0, 0, 0, 0.2); /* 柔和阴影 */
  text-align: center;
  box-sizing: border-box;
  transition: all 0.3s ease;
}

/* =========================================
   2. 🌟 核心魔法：使用伪元素生成“无容器全透”Icon
   ========================================= */
  /* 🌟 1. 图标容器：负责位置和浮动动画 */
  .dynamic-icon-wrapper {
    position: absolute;
    top: 20px; /* 让它一半悬浮在框外，更有立体感 */
    left: 50%;
    transform: translateX(-50%);
    width: 80px;
    height: 80px;
    display: flex;
    justify-content: center;
    align-items: center;
    
    /* 加上上下浮动的动画 */
    animation: floating 4s ease-in-out infinite;
  }

  /* 🌟 2. SVG 核心样式：实时同步背景颜色 */
  .dynamic-icon {
    width: 60px;
    height: 60px;
    
    /* 魔法：直接使用背景传来的 --theme-hue 变量 */
    color: hsl(var(--theme-hue), 80%, 70%); 
    
    /* 辉光效果：同样实时同步颜色 */
    filter: drop-shadow(0 0 10px hsla(var(--theme-hue), 80%, 60%, 0.8));
    
    /* 呼吸脉冲动画 */
    animation: pulse 4s ease-in-out infinite;
  }

  /* 🌟 3. 浮动动画剧本 */
  @keyframes floating {
    0%, 100% { transform: translate(-50%, 0); }
    50% { transform: translate(-50%, -15px); }
  }

  /* 🌟 4. 呼吸脉冲剧本 */
  @keyframes pulse {
    0%, 100% { 
      opacity: 0.6;
      filter: drop-shadow(0 0 10px hsla(var(--theme-hue), 80%, 60%, 0.5));
    }
    50% { 
      opacity: 1;
      filter: drop-shadow(0 0 25px hsla(var(--theme-hue), 80%, 60%, 0.9));
    }
  }

/* =========================================
   2. 内部组件的“完全融入”魔法
   ========================================= */

   .el-main {
    padding: 0;
  }
  .el-form-item {
    margin-bottom: 25px;
  }

/* --- 🌟 输入框：保持无色高透质感 --- */
:deep(.el-input__wrapper) {
  background-color: rgba(255, 255, 255, 0.06) !important;
  backdrop-filter: blur(10px) !important; 
  -webkit-backdrop-filter: blur(10px) !important;
  
  border: 1px solid rgba(255, 255, 255, 0.12) !important;
  border-radius: 12px !important;
  outline: none !important;
  box-shadow: none !important;
  transition: all 0.3s ease;
}
:deep(.el-input__wrapper:hover) {
  box-shadow: 0 0 10px rgba(255, 255, 255, 0.2) !important;
  border-color: rgba(255, 255, 255, 0.3) !important;
}
:deep(.el-input__wrapper.is-focus) {
  /* 聚焦时才引入柔和的主题蓝线条 */
  border-color: rgba(64, 158, 255, 0.8) !important; 
  box-shadow: 0 0 12px rgba(64, 158, 255, 0.4) !important; 
}
:deep(.el-input__inner) {
  color: rgba(255, 255, 255, 0.8) !important;
  font-size: 15px;
}
:deep(.el-input__inner::placeholder) {
  color: rgba(255, 255, 255, 0.4) !important;
}

/* --- 🌟 按钮：从“蓝塑料板”变成“极光玻璃砖” --- */
.el-button--primary {
  /* 魔法 5：极大的牺牲！去掉大面积蓝底，换成高透玻璃质感 */
  background-color: rgba(255, 255, 255, 0.08) !important;
  border: 1px solid rgba(255, 255, 255, 0.1) !important; /* 像输入框一样加细边框 */
  
  backdrop-filter: blur(10px) !important; /* 叠加模糊 */
  -webkit-backdrop-filter: blur(10px) !important;
  
  /* 魔法 6：文字设为半透明白，靠质感而不是颜色来区分 */
  color: rgba(255, 255, 255, 0.8) !important; 
  
  font-weight: bold;
  letter-spacing: 2px;
  border-radius: 12px !important;
  outline: none !important;
  
  /* 魔法 7：只留淡淡的蓝色发光阴影 */
  box-shadow: 0 5px 15px rgba(0, 0, 0, 0.1) !important;
  transition: all 0.3s ease;
}

/* 魔法 8：只有在悬停时，才让“极光”爆发出来 */
.el-button--primary:hover {
  /* 轻轻引入一点点半透明蓝，模仿霓虹灯亮起的效果 */
  background-color: rgba(64, 158, 255, 0.15) !important; 
  border-color: rgba(64, 158, 255, 0.5) !important;
  
  /* 蓝光更亮，更柔和 */
  box-shadow: 0 8px 25px rgba(64, 158, 255, 0.4) !important; 
  color: #ffffff !important; /* 文字变全白 */
  transform: translateY(-2px); 
}

/* --- 🌟 记住我：毛玻璃勾选框定制 --- */
.glass-checkbox {
  color: rgba(255, 255, 255, 0.7) !important; /* 文字颜色：半透明白 */
  font-weight: normal;
}

/* 勾选框的小方块 */
:deep(.el-checkbox__inner) {
  background-color: rgba(255, 255, 255, 0.05) !important; /* 方块背景透明 */
  border: 1px solid rgba(255, 255, 255, 0.2) !important; /* 细边框 */
  backdrop-filter: blur(5px);
}

/* 鼠标悬停时的边框颜色（同步背景色相） */
:deep(.el-checkbox__input:hover .el-checkbox__inner) {
  border-color: hsl(var(--theme-hue), 80%, 60%) !important;
}

/* 选中状态的样式 */
:deep(.el-checkbox__input.is-checked .el-checkbox__inner) {
  background-color: hsla(var(--theme-hue), 80%, 60%, 0.5) !important; /* 选中时淡淡的主题色 */
  border-color: hsl(var(--theme-hue), 80%, 60%) !important;
}

/* 选中后的那个对勾颜色 */
:deep(.el-checkbox__input.is-checked .el-checkbox__inner::after) {
  border-color: #ffffff !important; /* 对勾保持纯白，清晰可见 */
}

/* 选中后的文字颜色 */
:deep(.el-checkbox__input.is-checked + .el-checkbox__label) {
  color: #ffffff !important;
}

/* --- 🌟 底部链接的样式优化 --- */
.el-footer .el-link {
  /* 柔和的半透明白色 */
  color: rgba(255, 255, 255, 0.7) !important;
  text-shadow: 0 2px 4px rgba(0, 0, 0, 0.2);
  transition: all 0.3s ease;
}
.el-footer .el-link:hover {
  color: #ffffff !important;
  text-shadow: 0 0 10px rgba(64, 158, 255, 0.6); /* 悬停时柔和蓝光 */
}

/* 按钮点击时：阴影收缩，模拟按压感 */
.el-button--primary:active {
  box-shadow: 0 2px 10px rgba(64, 158, 255, 0.3) !important;
  transform: translateY(0);
}

/* 🌟 解决浏览器自动填充导致的白底问题 */
:deep(input:-webkit-autofill),
:deep(input:-webkit-autofill:hover),
:deep(input:-webkit-autofill:focus),
:deep(input:-webkit-autofill:active) {
  /* 魔法 1：用一个巨大的内阴影来覆盖掉浏览器的默认背景色。
     rgba(255, 255, 255, 0.1) 这里的透明度可以根据你想要的玻璃感微调
  */
  -webkit-box-shadow: 0 0 0 1000px rgba(255, 255, 255, 0.08) inset !important;
  
  /* 魔法 2：强制文字颜色为白色（或者你指定的颜色） */
  -webkit-text-fill-color: rgba(255, 255, 255, 0.8) !important;
  
  /* 魔法 3：让背景色的变化变得极其缓慢，慢到用户感知不到它在变色 */
  transition: background-color 5000s ease-in-out 0s;
  
  /* 魔法 4：保持字体大小一致 */
  font-size: 15px !important;
}

/* 针对 Firefox 的修复（如果需要） */
:deep(input:autofill) {
  background-color: rgba(255, 255, 255, 0.08) !important;
}

/* --- 🌟 密码眼睛图标：毛玻璃定制 --- */

/* 1. 默认状态下的眼睛：半透明白 */
:deep(.el-input__password-browser-reveal),
:deep(.el-input__icon) {
  color: rgba(255, 255, 255, 0.4) !important;
  transition: all 0.3s ease;
  cursor: pointer;
}

/* 2. 悬停时的眼睛：变亮，并带一点点辉光 */
:deep(.el-input__icon:hover) {
  color: rgba(255, 255, 255, 0.8) !important;
  filter: drop-shadow(0 0 5px rgba(255, 255, 255, 0.5));
}

/* 3. 激活状态（即你点击显示密码后）的颜色 */
/* 我们让它同步背景的色相，这样看起来非常统一 */
/* :deep(.el-input__clear), 
:deep(.el-input__password) { */
  /* 当图标处于 active 状态或者被点击时，可以给它一点主题色 */
/* } */

/* 针对 Element Plus 眼睛图标变色的特殊选择器 */
:deep(.el-input__icon.el-icon-view),
:deep(.el-input__icon.el-icon-hide) {
  /* 这里的颜色会随背景呼吸 */
  color: hsla(var(--theme-hue), 80%, 70%, 0.6) !important;
}
</style>