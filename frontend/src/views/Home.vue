<script setup lang="ts">
import { computed, onMounted, ref } from 'vue';
import { useRouter } from 'vue-router';
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
  } catch {
    console.warn('服务端退出登录失败，已清理本地状态');
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
    console.warn('偏好加载失败，已使用默认主题');
  }
};

const saveThemeHue = async () => {
  isPreferenceSaving.value = true;

  try {
    const preferences = await updatePreferences({
      themeHue: themeHue.value
    });
    applyPreferences(preferences);
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

    <div class="home-frame">
      <header class="workbench-topbar">
        <div class="topbar-title">
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
          <span class="account-chip">账号：{{ user?.accountNo || '-' }}</span>
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
    </div>
  </main>
</template>

<style scoped>
.home-page {
  position: relative;
  isolation: isolate;
  min-height: 100vh;
  padding: clamp(18px, 3.2vw, 46px);
  overflow-x: clip;
  color: var(--glass-text-strong);
  background:
    radial-gradient(circle at 50% 34%, hsla(var(--theme-hue), 82%, 56%, 0.1), transparent 42%),
    linear-gradient(135deg, rgba(5, 8, 22, 0.3), rgba(7, 14, 30, 0.36));
}

.home-page::before {
  position: fixed;
  inset: 0;
  z-index: 1;
  content: '';
  pointer-events: none;
  background:
    linear-gradient(120deg, rgba(255, 255, 255, 0.03) 0 1px, transparent 1px 108px),
    linear-gradient(210deg, rgba(255, 255, 255, 0.02) 0 1px, transparent 1px 136px);
  mask-image: radial-gradient(circle at 50% 46%, black 0%, transparent 78%);
  opacity: 0.42;
}

.home-frame {
  position: relative;
  z-index: 2;
  width: min(100%, 1520px);
  min-width: 0;
  margin: 0 auto;
}

.aurora-layer {
  position: fixed;
  inset: 0;
  z-index: 0;
  overflow: hidden;
  pointer-events: none;
  background:
    radial-gradient(circle at 48% 42%, hsla(var(--theme-hue), 82%, 44%, 0.2), transparent 56%),
    radial-gradient(circle at 18% 88%, hsla(calc(var(--theme-hue) - 32), 78%, 36%, 0.14), transparent 44%),
    linear-gradient(135deg, rgba(5, 8, 22, 0.2) 0%, rgba(7, 17, 31, 0.12) 46%, rgba(11, 16, 35, 0.18) 100%);
}

.aurora-blob {
  position: absolute;
  width: 46vmax;
  height: 46vmax;
  min-width: 420px;
  min-height: 420px;
  border-radius: 999px;
  opacity: 0.46;
  filter: blur(70px);
  mix-blend-mode: screen;
  will-change: transform, opacity;
}

.blob-one {
  top: -16%;
  left: -14%;
  background: hsla(calc(var(--theme-hue) - 18), 92%, 62%, 0.5);
  animation: aurora-float-one 16s ease-in-out infinite alternate;
}

.blob-two {
  top: -8%;
  right: -16%;
  background: hsla(calc(var(--theme-hue) + 18), 88%, 60%, 0.48);
  animation: aurora-float-two 19s ease-in-out infinite alternate;
  animation-delay: -6s;
}

.blob-three {
  right: 10%;
  bottom: -24%;
  background: hsla(calc(var(--theme-hue) + 38), 84%, 58%, 0.38);
  animation: aurora-float-three 22s ease-in-out infinite alternate;
  animation-delay: -10s;
}

.blob-four {
  bottom: 0;
  left: 10%;
  width: 34vmax;
  height: 34vmax;
  background: hsla(calc(var(--theme-hue) - 38), 84%, 56%, 0.34);
  animation: aurora-float-four 24s ease-in-out infinite alternate;
  animation-delay: -13s;
}

.workbench-topbar {
  position: sticky;
  top: 18px;
  z-index: 5;
  display: flex;
  justify-content: space-between;
  gap: clamp(16px, 2.4vw, 34px);
  align-items: center;
  min-width: 0;
  margin-bottom: clamp(26px, 3.8vw, 52px);
  padding: clamp(16px, 2vw, 24px) clamp(18px, 2.4vw, 30px);
  border: 1px solid var(--glass-border);
  border-radius: var(--glass-radius-lg);
  background:
    linear-gradient(135deg, hsla(var(--theme-hue), 80%, 60%, 0.08), rgba(255, 255, 255, 0.04)),
    var(--glass-panel-bg);
  box-shadow: var(--glass-shadow-soft), inset 0 1px 0 rgba(255, 255, 255, 0.08);
  backdrop-filter: blur(12px);
  -webkit-backdrop-filter: blur(12px);
}

.home-label {
  margin: 0 0 8px;
  color: var(--theme-primary-light);
  font-size: 13px;
  font-weight: 700;
  letter-spacing: 0.08em;
}

.topbar-title {
  min-width: 0;
}

.workbench-topbar h1,
.action-panel h2 {
  margin: 0;
}

.workbench-topbar h1 {
  overflow: hidden;
  font-size: clamp(22px, 2.1vw, 34px);
  line-height: 1.15;
  text-overflow: ellipsis;
  white-space: nowrap;
}

.user-summary {
  display: flex;
  flex: 0 0 auto;
  flex-wrap: wrap;
  gap: 12px;
  align-items: center;
  justify-content: flex-end;
  min-width: 0;
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
  border: 1px solid var(--glass-border-soft);
  border-radius: 999px;
  background:
    radial-gradient(circle at 28% 24%, rgba(255, 255, 255, 0.18), transparent 32%),
    linear-gradient(135deg, hsla(var(--theme-hue), 84%, 60%, 0.18), rgba(255, 255, 255, 0.06));
  box-shadow:
    var(--glass-shadow-control),
    inset 0 1px 0 rgba(255, 255, 255, 0.1);
  overflow: hidden;
  backdrop-filter: blur(10px);
  -webkit-backdrop-filter: blur(10px);
  transition:
    width 0.34s ease,
    border-color 0.3s ease,
    background 0.3s ease,
    box-shadow 0.3s ease;
}

.topbar-theme-control:hover,
.topbar-theme-control:focus-within {
  width: 176px;
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

.account-chip {
  max-width: 190px;
  overflow: hidden;
  font-size: 13px;
  text-overflow: ellipsis;
  white-space: nowrap;
}

.workbench-shell {
  display: grid;
  grid-template-columns: minmax(220px, 282px) minmax(0, 1fr);
  gap: clamp(28px, 3vw, 46px);
  align-items: start;
  min-width: 0;
}

.glass-card {
  position: relative;
  overflow: hidden;
  min-width: 0;
  border: 1px solid var(--glass-border);
  border-radius: var(--glass-radius-lg);
  background:
    linear-gradient(145deg, hsla(var(--theme-hue), 80%, 60%, 0.075), rgba(255, 255, 255, 0.04)),
    var(--glass-panel-bg);
  box-shadow:
    var(--glass-shadow-soft),
    0 0 34px hsla(var(--theme-hue), 80%, 60%, 0.08),
    inset 0 1px 0 rgba(255, 255, 255, 0.08);
  backdrop-filter: blur(10px);
  -webkit-backdrop-filter: blur(10px);
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
    0 18px 42px rgba(0, 0, 0, 0.24),
    0 0 36px hsla(var(--theme-hue), 85%, 62%, 0.16),
    inset 0 1px 0 rgba(255, 255, 255, 0.1);
  transform: translateY(-2px);
}

.glass-card:hover::before {
  opacity: 1;
  transform: translate3d(0, 0, 0);
}

.database-tree {
  position: sticky;
  top: 122px;
  min-height: min(560px, calc(100vh - 168px));
  padding: clamp(22px, 2vw, 28px);
}

.section-title {
  margin-bottom: 24px;
  font-size: 18px;
  font-weight: 700;
}

.tree-empty {
  display: grid;
  place-items: center;
  min-height: 360px;
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
  gap: clamp(24px, 3vw, 42px);
  min-width: 0;
}

.hero-panel {
  display: grid;
  grid-template-columns: minmax(0, 1fr) clamp(180px, 18vw, 260px);
  gap: clamp(30px, 4vw, 64px);
  align-items: center;
  min-height: clamp(300px, 34vh, 430px);
  padding: clamp(34px, 5vw, 72px);
}

.hero-copy h2 {
  max-width: 760px;
  margin: 0;
  font-size: clamp(34px, 4.6vw, 68px);
  line-height: 1.04;
  letter-spacing: -0.04em;
}

.hero-copy > p {
  max-width: 680px;
  margin: clamp(18px, 2vw, 26px) 0 0;
  color: var(--glass-text-muted);
  font-size: clamp(15px, 1.15vw, 17px);
  line-height: 1.9;
}

.capability-tags {
  display: flex;
  flex-wrap: wrap;
  gap: 10px;
  margin-top: clamp(24px, 2.8vw, 36px);
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
  width: clamp(170px, 16vw, 230px);
  height: clamp(170px, 16vw, 230px);
  justify-self: center;
}

.orb-core {
  display: grid;
  place-items: center;
  width: clamp(98px, 9vw, 126px);
  height: clamp(98px, 9vw, 126px);
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
  width: 86%;
  height: 86%;
  transform: rotateX(66deg) rotateZ(18deg);
}

.ring-two {
  width: 100%;
  height: 100%;
  animation-direction: reverse;
  transform: rotateX(72deg) rotateZ(96deg);
}

.dashboard-grid {
  display: grid;
  grid-template-columns: repeat(3, minmax(0, 1fr));
  gap: clamp(18px, 2.4vw, 30px);
}

.dashboard-card {
  display: flex;
  flex-direction: column;
  min-height: clamp(168px, 20vh, 220px);
  padding: clamp(24px, 2.6vw, 34px);
}

.dashboard-card span,
.dashboard-card p {
  color: var(--glass-text-muted);
}

.dashboard-card strong {
  display: block;
  margin: clamp(16px, 2vw, 28px) 0 14px;
  color: var(--theme-primary-light);
  font-size: clamp(36px, 4vw, 54px);
  text-shadow: 0 0 18px var(--theme-primary-glow);
}

.dashboard-card p {
  margin: auto 0 0;
  line-height: 1.7;
}

.action-panel {
  display: flex;
  justify-content: space-between;
  gap: clamp(24px, 3.2vw, 44px);
  align-items: center;
  padding: clamp(28px, 3.2vw, 42px);
  background:
    linear-gradient(120deg, hsla(var(--theme-hue), 85%, 60%, 0.13), rgba(255, 255, 255, 0.045)),
    var(--glass-panel-bg);
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
  grid-template-columns: repeat(2, minmax(128px, 1fr));
  gap: 12px;
  width: min(100%, 340px);
  min-width: 280px;
}

.ghost-button,
.workbench-action-button {
  min-height: 38px;
  padding: 0 18px;
  color: var(--glass-text) !important;
  border: 1px solid var(--glass-border-soft) !important;
  border-radius: var(--glass-radius-md) !important;
  background:
    linear-gradient(135deg, hsla(var(--theme-hue), 80%, 60%, 0.13), var(--glass-button-bg)) !important;
  box-shadow:
    var(--glass-shadow-control),
    inset 0 1px 0 rgba(255, 255, 255, 0.1) !important;
  backdrop-filter: blur(10px);
  -webkit-backdrop-filter: blur(10px);
  transition: var(--glass-transition) !important;
}

.workbench-action-button {
  width: 100%;
}

.ghost-button {
  border-radius: 999px !important;
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

@media (max-width: 1280px) {
  .home-page {
    padding: clamp(18px, 2.4vw, 30px);
  }

  .workbench-shell {
    grid-template-columns: minmax(210px, 260px) minmax(0, 1fr);
  }

  .hero-panel {
    grid-template-columns: minmax(0, 1fr) 190px;
  }
}

@media (max-width: 1080px) {
  .workbench-topbar {
    position: relative;
    top: auto;
  }

  .workbench-shell {
    grid-template-columns: 1fr;
  }

  .database-tree {
    position: relative;
    top: auto;
    min-height: auto;
  }

  .tree-empty {
    min-height: 150px;
  }

  .hero-panel {
    min-height: auto;
  }
}

@media (max-width: 820px) {
  .workbench-topbar,
  .action-panel {
    align-items: flex-start;
    flex-direction: column;
  }

  .workbench-topbar h1 {
    white-space: normal;
  }

  .user-summary {
    justify-content: flex-start;
    width: 100%;
  }

  .hero-panel {
    grid-template-columns: 1fr;
  }

  .dashboard-grid {
    grid-template-columns: repeat(3, minmax(150px, 1fr));
  }

  .hero-orb {
    display: none;
  }

  .quick-actions {
    width: 100%;
    min-width: 0;
  }
}

@media (max-width: 620px) {
  .home-page {
    padding: 14px;
  }

  .dashboard-grid {
    grid-template-columns: 1fr;
    overflow-x: visible;
  }

  .dashboard-card {
    min-height: 148px;
  }

  .quick-actions {
    grid-template-columns: 1fr;
  }

  .account-chip {
    max-width: 100%;
  }

  .topbar-theme-control:hover,
  .topbar-theme-control:focus-within {
    width: 164px;
  }
}

@media (max-height: 760px) and (min-width: 900px) {
  .home-page {
    padding-top: 18px;
    padding-bottom: 18px;
  }

  .workbench-topbar {
    margin-bottom: 22px;
    padding-top: 14px;
    padding-bottom: 14px;
  }

  .hero-panel {
    min-height: 250px;
    padding-top: 30px;
    padding-bottom: 30px;
  }

  .dashboard-card {
    min-height: 150px;
  }

  .tree-empty {
    min-height: 280px;
  }
}

@keyframes aurora-float-one {
  0% {
    opacity: 0.38;
    transform: translate3d(-8%, -4%, 0) scale(0.92) rotate(0deg);
  }

  32% {
    opacity: 0.54;
    transform: translate3d(18%, 14%, 0) scale(1.12) rotate(16deg);
  }

  68% {
    opacity: 0.44;
    transform: translate3d(5%, 28%, 0) scale(1.02) rotate(-12deg);
  }

  100% {
    opacity: 0.5;
    transform: translate3d(26%, 8%, 0) scale(1.18) rotate(8deg);
  }
}

@keyframes aurora-float-two {
  0% {
    opacity: 0.4;
    transform: translate3d(8%, -2%, 0) scale(1.04) rotate(0deg);
  }

  26% {
    opacity: 0.52;
    transform: translate3d(-16%, 16%, 0) scale(0.96) rotate(-14deg);
  }

  62% {
    opacity: 0.42;
    transform: translate3d(-26%, 5%, 0) scale(1.14) rotate(18deg);
  }

  100% {
    opacity: 0.48;
    transform: translate3d(-8%, -12%, 0) scale(1.03) rotate(-5deg);
  }
}

@keyframes aurora-float-three {
  0% {
    opacity: 0.3;
    transform: translate3d(0, 10%, 0) scale(1.04) rotate(0deg);
  }

  31% {
    opacity: 0.42;
    transform: translate3d(-18%, -8%, 0) scale(0.96) rotate(12deg);
  }

  67% {
    opacity: 0.36;
    transform: translate3d(10%, -20%, 0) scale(1.16) rotate(-16deg);
  }

  100% {
    opacity: 0.4;
    transform: translate3d(20%, 4%, 0) scale(1.04) rotate(8deg);
  }
}

@keyframes aurora-float-four {
  0% {
    opacity: 0.26;
    transform: translate3d(-6%, 8%, 0) scale(0.98) rotate(0deg);
  }

  24% {
    opacity: 0.38;
    transform: translate3d(18%, -10%, 0) scale(1.14) rotate(-10deg);
  }

  53% {
    opacity: 0.31;
    transform: translate3d(30%, 10%, 0) scale(1.02) rotate(15deg);
  }

  100% {
    opacity: 0.36;
    transform: translate3d(6%, -8%, 0) scale(1.1) rotate(-6deg);
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
