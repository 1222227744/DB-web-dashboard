<script setup lang="ts">
import { computed } from 'vue';
import { useRouter } from 'vue-router';
import { ElMessage } from 'element-plus';
import request from '../utils/request';
import { clearAuthState, getAuthUser } from '../utils/auth';

const router = useRouter();

const user = computed(() => getAuthUser());

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
</script>

<template>
  <main class="home-page">
    <header class="workbench-topbar">
      <div>
        <p class="home-label">DBMS 控制台</p>
        <h1>欢迎回来，{{ user?.displayName || '用户' }}</h1>
      </div>

      <div class="user-summary">
        <span>账号：{{ user?.accountNo || '-' }}</span>
        <el-button type="primary" plain @click="handleLogout">退出登录</el-button>
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

        <section class="glass-card action-panel">
          <div>
            <p class="home-label">快捷入口</p>
            <h2>下一阶段能力预留</h2>
          </div>

          <div class="quick-actions">
            <el-button
              v-for="action in quickActions"
              :key="action"
              type="primary"
              disabled
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
  min-height: 100vh;
  padding: 32px;
  color: var(--glass-text-strong);
  background:
    radial-gradient(circle at 20% 10%, hsla(var(--theme-hue), 80%, 60%, 0.25), transparent 32%),
    radial-gradient(circle at 80% 0%, rgba(147, 51, 234, 0.22), transparent 30%),
    linear-gradient(135deg, #07111f 0%, #101827 45%, #050816 100%);
}

.workbench-topbar {
  display: flex;
  justify-content: space-between;
  gap: 24px;
  align-items: center;
  margin-bottom: 28px;
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

.workbench-shell {
  display: grid;
  grid-template-columns: minmax(220px, 280px) 1fr;
  gap: 24px;
}

.glass-card {
  border: 1px solid var(--glass-border);
  border-radius: var(--glass-radius-lg);
  background: rgba(255, 255, 255, 0.06);
  box-shadow: var(--glass-shadow-soft);
  backdrop-filter: blur(16px);
}

.database-tree {
  min-height: 560px;
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

.dashboard-grid {
  display: grid;
  grid-template-columns: repeat(3, minmax(0, 1fr));
  gap: 18px;
}

.dashboard-card {
  min-height: 150px;
  padding: 24px;
}

.dashboard-card span,
.dashboard-card p {
  color: var(--glass-text-muted);
}

.dashboard-card strong {
  display: block;
  margin: 18px 0 12px;
  color: var(--theme-primary-light);
  font-size: 40px;
}

.action-panel {
  display: flex;
  justify-content: space-between;
  gap: 24px;
  align-items: center;
  padding: 28px;
}

.quick-actions {
  display: flex;
  flex-wrap: wrap;
  gap: 12px;
  justify-content: flex-end;
}

@media (max-width: 900px) {
  .workbench-topbar,
  .action-panel {
    align-items: flex-start;
    flex-direction: column;
  }

  .workbench-shell,
  .dashboard-grid {
    grid-template-columns: 1fr;
  }
}
</style>
