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
        <div class="topbar-theme-control">
          <span>主题</span>
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
  padding: 32px;
  overflow-x: hidden;
  color: var(--glass-text-strong);
  background:
    radial-gradient(circle at 50% 35%, hsla(var(--theme-hue), 90%, 62%, 0.12), transparent 34%),
    linear-gradient(135deg, rgba(5, 8, 22, 0.56), rgba(11, 18, 35, 0.54));
}

.home-page::before {
  position: fixed;
  inset: 0;
  z-index: -1;
  content: '';
  pointer-events: none;
  background:
    linear-gradient(120deg, rgba(255, 255, 255, 0.045) 0 1px, transparent 1px 96px),
    linear-gradient(210deg, rgba(255, 255, 255, 0.028) 0 1px, transparent 1px 120px);
  mask-image: radial-gradient(circle at 50% 42%, black 0%, transparent 74%);
  opacity: 0.55;
}

.aurora-layer {
  position: fixed;
  inset: 0;
  z-index: -2;
  overflow: hidden;
  pointer-events: none;
  background:
    radial-gradient(circle at 50% 55%, rgba(24, 31, 55, 0.34), transparent 50%),
    linear-gradient(135deg, #07111f 0%, #111827 48%, #050816 100%);
}

.aurora-blob {
  position: absolute;
  width: 42vw;
  height: 42vw;
  min-width: 420px;
  min-height: 420px;
  border-radius: 999px;
  opacity: 0.44;
  filter: blur(72px);
  mix-blend-mode: screen;
  animation: aurora-drift 16s ease-in-out infinite alternate;
}

.blob-one {
  top: -10%;
  left: -8%;
  background: hsla(var(--theme-hue), 95%, 62%, 0.56);
}

.blob-two {
  top: 8%;
  right: -10%;
  background: hsla(calc(var(--theme-hue) + 72), 90%, 62%, 0.48);
  animation-delay: -5s;
}

.blob-three {
  right: 18%;
  bottom: -20%;
  background: hsla(calc(var(--theme-hue) + 145), 80%, 58%, 0.4);
  animation-delay: -9s;
}

.blob-four {
  bottom: 8%;
  left: 16%;
  width: 30vw;
  height: 30vw;
  background: hsla(calc(var(--theme-hue) - 55), 90%, 58%, 0.34);
  animation-delay: -12s;
}

.workbench-topbar {
  position: sticky;
  top: 20px;
  z-index: 5;
  display: flex;
  justify-content: space-between;
  gap: 24px;
  align-items: center;
  margin-bottom: 28px;
  padding: 20px 24px;
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
  gap: 16px;
  align-items: center;
  color: var(--glass-text-muted);
}

.topbar-theme-control {
  display: grid;
  grid-template-columns: auto 96px;
  gap: 10px;
  align-items: center;
  min-width: 148px;
  padding: 7px 12px;
  border: 1px solid hsla(var(--theme-hue), 80%, 70%, 0.18);
  border-radius: 999px;
  background: rgba(255, 255, 255, 0.055);
  box-shadow: inset 0 1px 0 rgba(255, 255, 255, 0.06);
}

.topbar-theme-control span {
  font-size: 12px;
  color: var(--glass-text-muted);
}

.workbench-shell {
  display: grid;
  grid-template-columns: minmax(240px, 300px) minmax(0, 1fr);
  gap: 28px;
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
  top: 124px;
  min-height: calc(100vh - 156px);
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
  gap: 28px;
}

.hero-panel {
  display: grid;
  grid-template-columns: minmax(0, 1fr) 260px;
  gap: 28px;
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
  grid-template-columns: 1.1fr 0.95fr 0.95fr;
  gap: 20px;
}

.dashboard-card {
  min-height: 172px;
  padding: 26px;
}

.dashboard-card:first-child {
  min-height: 204px;
  grid-row: span 2;
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

.dashboard-card:first-child strong {
  font-size: 64px;
}

.action-panel {
  display: flex;
  justify-content: space-between;
  gap: 24px;
  align-items: center;
  padding: 32px;
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
  display: flex;
  flex-wrap: wrap;
  gap: 12px;
  justify-content: flex-end;
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
}

@keyframes aurora-drift {
  0% {
    transform: translate3d(-4%, -2%, 0) scale(1);
  }

  50% {
    transform: translate3d(4%, 5%, 0) scale(1.12);
  }

  100% {
    transform: translate3d(8%, -4%, 0) scale(0.96);
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
