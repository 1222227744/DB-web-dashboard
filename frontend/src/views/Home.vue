<script setup lang="ts">
import { computed, onMounted, ref } from 'vue';
import { useRouter } from 'vue-router';
import { ElMessage } from 'element-plus';
import request from '../utils/request';
import { clearAuthState, getAuthUser } from '../utils/auth';
import { applyPreferences, fetchPreferences, updatePreferences } from '../utils/preferences';

const router = useRouter();

const user = computed(() => getAuthUser());
const themeHue = ref(210);
const isPreferenceSaving = ref(false);

const dashboardCards = [
  {
    title: '我的数据库',
    value: '0',
    description: 'V2 开始接入数据库创建与管理'
  },
  {
    title: '最近操作',
    value: '0',
    description: '后续接入审计日志和 traceId'
  },
  {
    title: '资源空间',
    value: '0 MB',
    description: '头像、背景和个人资源统计'
  }
];

const quickActions = [
  '创建数据库',
  '设计数据表',
  '浏览表数据',
  '打开查询构造器'
];

const capabilityTags = ['双 Token 会话', '个人偏好同步', '动态主题', '数据库工作台'];

const handleLogout = async () => {
  try {
    await request.post('/v1/auth/logout');
    ElMessage.success('已退出登录');
  } catch {
    ElMessage.warning('本地登录状态已清理');
  } finally {
    clearAuthState();
    router.push('/login');
  }
};

const loadPreferences = async () => {
  try {
    const preferences = await fetchPreferences();
    themeHue.value = preferences.themeHue;
    applyPreferences(preferences);
  } catch {
    ElMessage.warning('偏好加载失败，已使用默认主题');
  }
};

const saveThemeHue = async () => {
  isPreferenceSaving.value = true;

  try {
    const preferences = await updatePreferences({
      themeHue: themeHue.value
    });
    applyPreferences(preferences);
    ElMessage.success('主题偏好已保存');
  } finally {
    isPreferenceSaving.value = false;
  }
};

const previewThemeHue = () => {
  document.documentElement.style.setProperty('--theme-hue', String(themeHue.value));
};

const saveThemeHueOnChange = () => {
  void saveThemeHue();
};

onMounted(() => {
  void loadPreferences();
});
</script>

<template>
  <main class="home-page">
    <div class="aurora-layer" aria-hidden="true">
      <span class="aurora-blob blob-one"></span>
      <span class="aurora-blob blob-two"></span>
      <span class="aurora-blob blob-three"></span>
      <span class="aurora-blob blob-four"></span>
    </div>

    <header class="workbench-topbar">
      <div>
        <p class="home-label">DBMS 控制台</p>
        <h1>欢迎回来，{{ user?.displayName || '用户' }}</h1>
      </div>

      <div class="user-summary">
        <div class="topbar-theme-control" aria-label="主题色设置">
          <span class="theme-dot" aria-hidden="true"></span>
          <span class="theme-label">主题</span>
          <el-slider
            v-model="themeHue"
            :min="0"
            :max="359"
            :show-tooltip="false"
            size="small"
            @input="previewThemeHue"
            @change="saveThemeHueOnChange"
          />
        </div>
        <span>账号：{{ user?.accountNo || '-' }}</span>
        <button class="ghost-button logout-button" @click="handleLogout">退出登录</button>
      </div>
    </header>

    <section class="workbench-shell">
      <aside class="database-tree glass-card">
        <div class="section-title">数据库导航</div>
        <div class="tree-empty">
          <p>暂无数据库</p>
          <span>V2 将支持创建和管理你的 MySQL 数据库。</span>
        </div>
      </aside>

      <section class="workbench-content">
        <section class="hero-panel glass-card">
          <div class="hero-copy">
            <p class="home-label">V1 工作台地基</p>
            <h2>你的本地 MySQL 控制台已经准备好</h2>
            <p>
              当前版本已完成安全登录、会话刷新、个人偏好与工作台骨架。
              下一阶段将从这里接入数据库、表结构和数据浏览。
            </p>
            <div class="capability-tags">
              <span
                v-for="tag in capabilityTags"
                :key="tag"
              >
                {{ tag }}
              </span>
            </div>
          </div>

          <div class="hero-orb">
            <span class="orb-ring ring-one"></span>
            <span class="orb-ring ring-two"></span>
            <span class="orb-core">DB</span>
          </div>
        </section>

        <div class="dashboard-grid">
          <article
            v-for="card in dashboardCards"
            :key="card.title"
            class="dashboard-card glass-card"
          >
            <span>{{ card.title }}</span>
            <strong>{{ card.value }}</strong>
            <p>{{ card.description }}</p>
          </article>
        </div>

        <section class="glass-card action-panel feature-panel">
          <div>
            <p class="home-label">快捷入口</p>
            <h2>下一阶段能力预留</h2>
            <p>这些入口先保持禁用，等 V2/V3 的数据库和表管理能力接入后逐步点亮。</p>
          </div>

          <div class="quick-actions">
            <el-button
              v-for="action in quickActions"
              :key="action"
              disabled
              class="workbench-action-button"
            >
              {{ action }}
            </el-button>
          </div>
        </section>
      </section>
    </section>
  </main>
</template>

<style scoped>
.home-page {
  position: relative;
  min-height: 100vh;
  padding: 28px;
  overflow-x: hidden;
  color: var(--glass-text-strong);
  background:
    radial-gradient(circle at 52% 42%, hsla(var(--theme-hue), 88%, 62%, 0.14), transparent 42%),
    radial-gradient(circle at 18% 72%, hsla(calc(var(--theme-hue) - 24), 82%, 58%, 0.1), transparent 34%),
    linear-gradient(135deg, rgba(4, 9, 24, 0.36), rgba(8, 14, 32, 0.4));
}

.home-page::before {
  position: fixed;
  inset: 0;
  z-index: -1;
  content: '';
  pointer-events: none;
  background:
    linear-gradient(120deg, rgba(255, 255, 255, 0.035) 0 1px, transparent 1px 104px),
    linear-gradient(210deg, rgba(255, 255, 255, 0.024) 0 1px, transparent 1px 132px);
  mask-image: radial-gradient(circle at 50% 42%, black 0%, transparent 74%);
  opacity: 0.46;
}

.aurora-layer {
  position: fixed;
  inset: 0;
  z-index: -2;
  overflow: hidden;
  pointer-events: none;
  background:
    radial-gradient(circle at 50% 52%, hsla(var(--theme-hue), 42%, 18%, 0.58), transparent 58%),
    radial-gradient(circle at 18% 88%, hsla(calc(var(--theme-hue) - 36), 46%, 12%, 0.44), transparent 44%),
    linear-gradient(135deg, #07111f 0%, #0c172b 46%, #050816 100%);
}

.aurora-blob {
  position: absolute;
  width: 44vw;
  height: 44vw;
  min-width: 430px;
  min-height: 430px;
  border-radius: 999px;
  opacity: 0.42;
  filter: blur(76px);
  mix-blend-mode: screen;
  will-change: transform, opacity;
}

.blob-one {
  top: -8%;
  left: -9%;
  background: hsla(calc(var(--theme-hue) - 18), 92%, 62%, 0.46);
  animation: aurora-float-one 27s ease-in-out infinite;
}

.blob-two {
  top: 12%;
  right: -11%;
  background: hsla(calc(var(--theme-hue) + 18), 88%, 60%, 0.43);
  animation: aurora-float-two 34s ease-in-out infinite;
  animation-delay: -8s;
}

.blob-three {
  right: 18%;
  bottom: -18%;
  background: hsla(calc(var(--theme-hue) + 42), 84%, 58%, 0.36);
  animation: aurora-float-three 41s ease-in-out infinite;
  animation-delay: -15s;
}

.blob-four {
  bottom: 10%;
  left: 12%;
  width: 34vw;
  height: 34vw;
  background: hsla(calc(var(--theme-hue) - 42), 84%, 56%, 0.32);
  animation: aurora-float-four 46s ease-in-out infinite;
  animation-delay: -22s;
}

.workbench-topbar {
  position: sticky;
  top: 20px;
  z-index: 5;
  display: flex;
  justify-content: space-between;
  gap: 24px;
  align-items: center;
  margin-bottom: 24px;
  padding: 18px 22px;
  border: 1px solid hsla(var(--theme-hue), 80%, 70%, 0.16);
  border-radius: 24px;
  background:
    linear-gradient(135deg, hsla(var(--theme-hue), 80%, 65%, 0.11), rgba(255, 255, 255, 0.045)),
    rgba(255, 255, 255, 0.035);
  box-shadow: 0 20px 70px rgba(0, 0, 0, 0.22), inset 0 1px 0 rgba(255, 255, 255, 0.08);
  backdrop-filter: blur(18px);
}

.home-label {
  margin: 0 0 8px;
  color: var(--theme-primary-light);
  letter-spacing: 0.08em;
}

.workbench-topbar h1,
.action-panel h2 {
  margin: 0;
}

.user-summary {
  display: flex;
  gap: 14px;
  align-items: center;
  color: var(--glass-text-muted);
}

.topbar-theme-control {
  display: flex;
  align-items: center;
  justify-content: center;
  gap: 8px;
  width: 40px;
  height: 40px;
  padding: 0 11px;
  border: 1px solid hsla(var(--theme-hue), 80%, 70%, 0.18);
  border-radius: 999px;
  background:
    radial-gradient(circle at 28% 24%, rgba(255, 255, 255, 0.18), transparent 32%),
    linear-gradient(135deg, hsla(var(--theme-hue), 84%, 60%, 0.22), rgba(255, 255, 255, 0.055));
  box-shadow:
    0 10px 28px rgba(0, 0, 0, 0.16),
    inset 0 1px 0 rgba(255, 255, 255, 0.1);
  overflow: hidden;
  backdrop-filter: blur(16px);
  transition:
    width 0.34s ease,
    border-color 0.3s ease,
    background 0.3s ease,
    box-shadow 0.3s ease;
}

.topbar-theme-control:hover,
.topbar-theme-control:focus-within {
  width: 178px;
  justify-content: flex-start;
  border-color: hsla(var(--theme-hue), 90%, 72%, 0.34);
  box-shadow:
    0 14px 34px rgba(0, 0, 0, 0.2),
    0 0 28px hsla(var(--theme-hue), 82%, 62%, 0.16),
    inset 0 1px 0 rgba(255, 255, 255, 0.12);
}

.theme-dot {
  flex: 0 0 auto;
  width: 16px;
  height: 16px;
  border: 2px solid rgba(255, 255, 255, 0.74);
  border-radius: 50%;
  background: hsl(var(--theme-hue), 82%, 60%);
  box-shadow: 0 0 18px var(--theme-primary-glow);
}

.theme-label {
  flex: 0 0 auto;
  width: 0;
  overflow: hidden;
  font-size: 12px;
  color: var(--glass-text-muted);
  opacity: 0;
  white-space: nowrap;
  transition: width 0.3s ease, opacity 0.22s ease;
}

.topbar-theme-control:hover .theme-label,
.topbar-theme-control:focus-within .theme-label {
  width: 26px;
  opacity: 1;
}

.topbar-theme-control :deep(.el-slider) {
  flex: 1 1 auto;
  width: 0;
  min-width: 0;
  opacity: 0;
  transform: translateX(-4px);
  transition: width 0.34s ease, opacity 0.24s ease, transform 0.3s ease;
}

.topbar-theme-control:hover :deep(.el-slider),
.topbar-theme-control:focus-within :deep(.el-slider) {
  width: 92px;
  opacity: 1;
  transform: translateX(0);
}

.workbench-shell {
  display: grid;
  grid-template-columns: minmax(240px, 300px) minmax(0, 1fr);
  gap: 24px;
  align-items: start;
}

.glass-card {
  position: relative;
  overflow: hidden;
  border: 1px solid hsla(var(--theme-hue), 80%, 70%, 0.16);
  border-radius: var(--glass-radius-lg);
  background:
    linear-gradient(145deg, hsla(var(--theme-hue), 80%, 60%, 0.08), rgba(255, 255, 255, 0.045)),
    rgba(255, 255, 255, 0.035);
  box-shadow:
    0 18px 60px rgba(0, 0, 0, 0.24),
    0 0 42px hsla(var(--theme-hue), 80%, 60%, 0.08),
    inset 0 1px 0 rgba(255, 255, 255, 0.08);
  backdrop-filter: blur(16px);
  transition: border-color 0.3s ease, box-shadow 0.3s ease, transform 0.3s ease;
}

.glass-card::before {
  position: absolute;
  inset: -40%;
  content: '';
  pointer-events: none;
  background: radial-gradient(circle, hsla(var(--theme-hue), 100%, 72%, 0.12), transparent 42%);
  opacity: 0;
  transform: translate3d(-20%, -20%, 0);
  transition: opacity 0.4s ease, transform 0.4s ease;
}

.glass-card:hover {
  border-color: hsla(var(--theme-hue), 90%, 72%, 0.34);
  box-shadow:
    0 22px 70px rgba(0, 0, 0, 0.28),
    0 0 52px hsla(var(--theme-hue), 85%, 62%, 0.16),
    inset 0 1px 0 rgba(255, 255, 255, 0.1);
  transform: translateY(-2px);
}

.glass-card:hover::before {
  opacity: 1;
  transform: translate3d(0, 0, 0);
}

.database-tree {
  position: sticky;
  top: 116px;
  min-height: calc(100vh - 144px);
  padding: 24px;
}

.section-title {
  margin-bottom: 20px;
  font-size: 18px;
  font-weight: 700;
}

.tree-empty {
  display: grid;
  place-items: center;
  min-height: 420px;
  color: var(--glass-text-muted);
  text-align: center;
}

.tree-empty p {
  margin: 0;
  color: var(--glass-text-strong);
  font-size: 20px;
}

.workbench-content {
  display: flex;
  flex-direction: column;
  gap: 24px;
}

.hero-panel {
  display: grid;
  grid-template-columns: minmax(0, 1fr) 260px;
  gap: 32px;
  align-items: center;
  min-height: 280px;
  padding: 36px;
}

.hero-copy h2 {
  max-width: 680px;
  margin: 0;
  font-size: clamp(32px, 4vw, 56px);
  line-height: 1.08;
  letter-spacing: -0.04em;
}

.hero-copy > p {
  max-width: 620px;
  margin: 18px 0 0;
  color: var(--glass-text-muted);
  font-size: 16px;
  line-height: 1.8;
}

.capability-tags {
  display: flex;
  flex-wrap: wrap;
  gap: 10px;
  margin-top: 26px;
}

.capability-tags span {
  padding: 8px 12px;
  color: var(--glass-text);
  border: 1px solid hsla(var(--theme-hue), 90%, 72%, 0.2);
  border-radius: 999px;
  background: hsla(var(--theme-hue), 80%, 60%, 0.1);
}

.hero-orb {
  position: relative;
  display: grid;
  place-items: center;
  width: 220px;
  height: 220px;
  justify-self: center;
}

.orb-core {
  display: grid;
  place-items: center;
  width: 120px;
  height: 120px;
  color: var(--glass-text-strong);
  font-size: 34px;
  font-weight: 800;
  border: 1px solid hsla(var(--theme-hue), 95%, 75%, 0.42);
  border-radius: 50%;
  background:
    radial-gradient(circle at 35% 30%, rgba(255, 255, 255, 0.38), transparent 28%),
    linear-gradient(135deg, hsla(var(--theme-hue), 95%, 60%, 0.36), rgba(255, 255, 255, 0.08));
  box-shadow:
    0 0 50px hsla(var(--theme-hue), 90%, 62%, 0.32),
    inset 0 1px 12px rgba(255, 255, 255, 0.22);
}

.orb-ring {
  position: absolute;
  border: 1px solid hsla(var(--theme-hue), 90%, 72%, 0.28);
  border-radius: 50%;
  animation: orb-spin 12s linear infinite;
}

.ring-one {
  width: 190px;
  height: 190px;
  transform: rotateX(66deg) rotateZ(18deg);
}

.ring-two {
  width: 220px;
  height: 220px;
  animation-direction: reverse;
  transform: rotateX(72deg) rotateZ(96deg);
}

.dashboard-grid {
  display: grid;
  grid-template-columns: repeat(3, minmax(0, 1fr));
  gap: 22px;
}

.dashboard-card {
  display: flex;
  flex-direction: column;
  min-height: 178px;
  padding: 26px;
}

.dashboard-card span,
.dashboard-card p {
  color: var(--glass-text-muted);
}

.dashboard-card strong {
  display: block;
  margin: 18px 0 12px;
  color: var(--theme-primary-light);
  font-size: 44px;
  text-shadow: 0 0 18px var(--theme-primary-glow);
}

.dashboard-card p {
  margin: auto 0 0;
  line-height: 1.7;
}

.action-panel {
  display: flex;
  justify-content: space-between;
  gap: 28px;
  align-items: center;
  padding: 30px 32px;
  background:
    linear-gradient(120deg, hsla(var(--theme-hue), 85%, 60%, 0.13), rgba(255, 255, 255, 0.045)),
    rgba(255, 255, 255, 0.035);
}

.feature-panel h2 {
  margin-bottom: 10px;
}

.feature-panel p:not(.home-label) {
  max-width: 520px;
  margin: 0;
  color: var(--glass-text-muted);
  line-height: 1.7;
}

.quick-actions {
  display: grid;
  grid-template-columns: repeat(2, minmax(132px, 1fr));
  gap: 12px;
  min-width: 300px;
}

.ghost-button,
.workbench-action-button {
  min-height: 36px;
  padding: 0 18px;
  color: var(--glass-text) !important;
  border: 1px solid hsla(var(--theme-hue), 80%, 70%, 0.24) !important;
  border-radius: 999px !important;
  background:
    linear-gradient(135deg, hsla(var(--theme-hue), 80%, 60%, 0.18), rgba(255, 255, 255, 0.07)) !important;
  box-shadow:
    0 10px 26px rgba(0, 0, 0, 0.18),
    inset 0 1px 0 rgba(255, 255, 255, 0.1) !important;
  backdrop-filter: blur(12px);
  transition: all 0.25s ease !important;
}

.workbench-action-button {
  width: 100%;
}

.ghost-button {
  cursor: pointer;
}

.ghost-button:hover {
  color: var(--glass-text-strong) !important;
  border-color: hsla(var(--theme-hue), 90%, 72%, 0.52) !important;
  box-shadow:
    0 12px 30px rgba(0, 0, 0, 0.24),
    0 0 24px hsla(var(--theme-hue), 80%, 62%, 0.22) !important;
  transform: translateY(-1px);
}

.workbench-action-button.is-disabled,
.workbench-action-button.is-disabled:hover {
  color: rgba(255, 255, 255, 0.46) !important;
  border-color: hsla(var(--theme-hue), 80%, 70%, 0.12) !important;
  background:
    linear-gradient(135deg, hsla(var(--theme-hue), 60%, 55%, 0.08), rgba(255, 255, 255, 0.045)) !important;
}

@media (max-width: 900px) {
  .workbench-topbar,
  .action-panel {
    align-items: flex-start;
    flex-direction: column;
  }

  .user-summary {
    align-items: flex-start;
    flex-direction: column;
  }

  .workbench-shell,
  .dashboard-grid,
  .hero-panel {
    grid-template-columns: 1fr;
  }

  .database-tree,
  .workbench-topbar {
    position: relative;
    top: auto;
  }

  .hero-orb {
    display: none;
  }

  .quick-actions {
    width: 100%;
    min-width: 0;
    grid-template-columns: 1fr;
  }
}

@keyframes aurora-float-one {
  0% {
    opacity: 0.36;
    transform: translate3d(-6%, -3%, 0) scale(0.96) rotate(0deg);
  }

  27% {
    opacity: 0.46;
    transform: translate3d(8%, 7%, 0) scale(1.1) rotate(18deg);
  }

  61% {
    opacity: 0.4;
    transform: translate3d(2%, 14%, 0) scale(1.03) rotate(-11deg);
  }

  100% {
    opacity: 0.44;
    transform: translate3d(14%, 2%, 0) scale(1.16) rotate(9deg);
  }
}

@keyframes aurora-float-two {
  0% {
    opacity: 0.34;
    transform: translate3d(7%, 0, 0) scale(1.04) rotate(0deg);
  }

  22% {
    opacity: 0.44;
    transform: translate3d(-5%, 10%, 0) scale(0.98) rotate(-14deg);
  }

  58% {
    opacity: 0.38;
    transform: translate3d(-13%, 3%, 0) scale(1.12) rotate(17deg);
  }

  100% {
    opacity: 0.42;
    transform: translate3d(-4%, -7%, 0) scale(1.02) rotate(-5deg);
  }
}

@keyframes aurora-float-three {
  0% {
    opacity: 0.3;
    transform: translate3d(0, 8%, 0) scale(1.06) rotate(0deg);
  }

  31% {
    opacity: 0.4;
    transform: translate3d(-10%, -3%, 0) scale(0.98) rotate(12deg);
  }

  67% {
    opacity: 0.35;
    transform: translate3d(6%, -10%, 0) scale(1.14) rotate(-16deg);
  }

  100% {
    opacity: 0.39;
    transform: translate3d(12%, 2%, 0) scale(1.04) rotate(8deg);
  }
}

@keyframes aurora-float-four {
  0% {
    opacity: 0.25;
    transform: translate3d(-4%, 6%, 0) scale(0.98) rotate(0deg);
  }

  24% {
    opacity: 0.34;
    transform: translate3d(9%, -6%, 0) scale(1.12) rotate(-10deg);
  }

  53% {
    opacity: 0.29;
    transform: translate3d(16%, 7%, 0) scale(1.02) rotate(15deg);
  }

  100% {
    opacity: 0.33;
    transform: translate3d(3%, -3%, 0) scale(1.08) rotate(-6deg);
  }
}

@keyframes orb-spin {
  from {
    transform: rotateX(66deg) rotateZ(0deg);
  }

  to {
    transform: rotateX(66deg) rotateZ(360deg);
  }
}
</style>
