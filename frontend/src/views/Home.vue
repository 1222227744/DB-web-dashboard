<script setup lang="ts">
import { computed, onMounted, onUnmounted, reactive, ref } from 'vue';
import { useRouter } from 'vue-router';
import GlassDialog from '../components/GlassDialog.vue';
import request from '../utils/request';
import { clearAuthState, getAuthUser } from '../utils/auth';
import {
  createDatabase,
  deleteDatabase,
  fetchDatabases,
  renameDatabase,
  type UserDatabase
} from '../utils/databases';
import { applyPreferences, fetchPreferences, updatePreferences } from '../utils/preferences';

const router = useRouter();

const user = computed(() => getAuthUser());
const themeHue = ref(210);
const isPreferenceSaving = ref(false);
const databases = ref<UserDatabase[]>([]);
const databaseLimit = ref(10);
const isDatabaseLoading = ref(false);
const isCreateDialogVisible = ref(false);
const isCreatingDatabase = ref(false);
const newDatabaseName = ref('');
const databaseDialogError = ref('');
const editingDatabase = ref<UserDatabase | null>(null);
const activeDatabaseID = ref<number | null>(null);
const databaseError = ref('');
const databaseNotice = ref('');
const isDeleteDialogVisible = ref(false);
const deletingDatabase = ref<UserDatabase | null>(null);
const deleteConfirmName = ref('');
const isDeletingDatabase = ref(false);

const dashboardCards = computed(() => [
  {
    title: '我的数据库',
    value: String(databases.value.length),
    description: databases.value.length > 0
      ? `最多可创建 ${databaseLimit.value} 个`
      : '暂未创建数据库'
  },
  {
    title: '最近操作',
    value: '0',
    description: '暂无最近操作'
  },
  {
    title: '数据库容量',
    value: formatBytes(totalStorageBytes.value),
    description: '按当前数据库统计'
  }
]);

const selectedDatabase = computed(() => {
  return databases.value.find((database) => database.id === activeDatabaseID.value) ?? databases.value[0] ?? null;
});

const totalStorageBytes = computed(() => {
  return databases.value.reduce((total, database) => total + database.sizeBytes, 0);
});

const isDatabaseLimitReached = computed(() => {
  return databases.value.length >= databaseLimit.value;
});

const quickActions = [
  '创建数据库',
  '设计数据表',
  '浏览表数据',
  '打开查询构造器'
];

const capabilityTags = ['安全登录', '主题外观', '个人空间', '数据库管理'];
const databaseNamePattern = /^[A-Za-z][A-Za-z0-9_]{1,31}$/;

type AuroraBlob = {
  id: string;
  className: string;
  hueOffset: number;
  opacity: number;
  sizeRatio: number;
  speed: number;
  x: number;
  y: number;
  velocityX: number;
  velocityY: number;
  size: number;
  style: Record<string, string>;
};

const auroraBlobs = reactive<AuroraBlob[]>([
  {
    id: 'aurora-one',
    className: 'blob-one',
    hueOffset: -18,
    opacity: 0.5,
    sizeRatio: 0.48,
    speed: 2.4,
    x: 0,
    y: 0,
    velocityX: 0,
    velocityY: 0,
    size: 0,
    style: {}
  },
  {
    id: 'aurora-two',
    className: 'blob-two',
    hueOffset: 18,
    opacity: 0.48,
    sizeRatio: 0.46,
    speed: 2.42,
    x: 0,
    y: 0,
    velocityX: 0,
    velocityY: 0,
    size: 0,
    style: {}
  },
  {
    id: 'aurora-three',
    className: 'blob-three',
    hueOffset: 38,
    opacity: 0.38,
    sizeRatio: 0.44,
    speed: 2.04,
    x: 0,
    y: 0,
    velocityX: 0,
    velocityY: 0,
    size: 0,
    style: {}
  },
  {
    id: 'aurora-four',
    className: 'blob-four',
    hueOffset: -38,
    opacity: 0.34,
    sizeRatio: 0.34,
    speed: 2.2,
    x: 0,
    y: 0,
    velocityX: 0,
    velocityY: 0,
    size: 0,
    style: {}
  }
]);

let auroraAnimationId: number | null = null;
let lastAuroraTime = 0;
let auroraWidth = 0;
let auroraHeight = 0;

const getAuroraBounds = () => ({
  width: window.innerWidth,
  height: window.innerHeight,
  base: Math.min(window.innerWidth, window.innerHeight)
});

const randomInRange = (min: number, max: number) => {
  return min + Math.random() * (max - min);
};

const randomizeAuroraVelocity = (blob: AuroraBlob) => {
  const angle = Math.random() * Math.PI * 2;
  const speed = blob.speed * randomInRange(0.92, 1.08);

  blob.velocityX = Math.cos(angle) * speed;
  blob.velocityY = Math.sin(angle) * speed;
};

const updateAuroraBlobStyle = (blob: AuroraBlob) => {
  const hueExpression = blob.hueOffset >= 0
    ? `calc(var(--theme-hue) + ${blob.hueOffset})`
    : `calc(var(--theme-hue) - ${Math.abs(blob.hueOffset)})`;

  blob.style = {
    width: `${blob.size}px`,
    height: `${blob.size}px`,
    opacity: String(blob.opacity),
    background: `hsla(${hueExpression}, 88%, 60%, ${blob.opacity})`,
    transform: `translate3d(${blob.x}px, ${blob.y}px, 0)`
  };
};

const resetAuroraBlobs = () => {
  const bounds = getAuroraBounds();
  auroraWidth = bounds.width;
  auroraHeight = bounds.height;

  auroraBlobs.forEach((blob) => {
    blob.size = bounds.base * blob.sizeRatio;
    blob.x = randomInRange(-blob.size * 0.36, bounds.width - blob.size * 0.64);
    blob.y = randomInRange(-blob.size * 0.36, bounds.height - blob.size * 0.64);
    randomizeAuroraVelocity(blob);
    updateAuroraBlobStyle(blob);
  });
};

const resizeAuroraBlobs = () => {
  const bounds = getAuroraBounds();
  const scaleX = auroraWidth ? bounds.width / auroraWidth : 1;
  const scaleY = auroraHeight ? bounds.height / auroraHeight : 1;
  auroraWidth = bounds.width;
  auroraHeight = bounds.height;

  auroraBlobs.forEach((blob) => {
    blob.size = bounds.base * blob.sizeRatio;
    blob.x *= scaleX;
    blob.y *= scaleY;
    const minX = -blob.size * 0.36;
    const minY = -blob.size * 0.36;
    const maxX = bounds.width - blob.size * 0.64;
    const maxY = bounds.height - blob.size * 0.64;
    blob.x = Math.min(Math.max(blob.x, minX), maxX);
    blob.y = Math.min(Math.max(blob.y, minY), maxY);
    updateAuroraBlobStyle(blob);
  });
};

const moveAuroraBlobs = (timestamp: number) => {
  if (!lastAuroraTime) {
    lastAuroraTime = timestamp;
  }

  const delta = Math.min((timestamp - lastAuroraTime) / 16.67, 2);
  lastAuroraTime = timestamp;

  const bounds = getAuroraBounds();

  if (bounds.width !== auroraWidth || bounds.height !== auroraHeight) {
    resizeAuroraBlobs();
  }

  auroraBlobs.forEach((blob) => {
    blob.x += blob.velocityX * delta;
    blob.y += blob.velocityY * delta;

    const minX = -blob.size * 0.36;
    const minY = -blob.size * 0.36;
    const maxX = bounds.width - blob.size * 0.64;
    const maxY = bounds.height - blob.size * 0.64;

    if (blob.x <= minX || blob.x >= maxX) {
      blob.velocityX *= -1;
      blob.x = Math.min(Math.max(blob.x, minX), maxX);
    }

    if (blob.y <= minY || blob.y >= maxY) {
      blob.velocityY *= -1;
      blob.y = Math.min(Math.max(blob.y, minY), maxY);
    }

    updateAuroraBlobStyle(blob);
  });

  auroraAnimationId = requestAnimationFrame(moveAuroraBlobs);
};

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

const getErrorMessage = (error: unknown, fallback: string) => {
  if (typeof error === 'object' && error !== null && 'response' in error) {
    const response = (error as { response?: { data?: { message?: unknown } } }).response;
    if (typeof response?.data?.message === 'string') {
      return response.data.message;
    }
  }

  return fallback;
};

const formatBytes = (bytes: number) => {
  if (bytes <= 0) {
    return '0 MB';
  }

  const units = ['B', 'KB', 'MB', 'GB'];
  let value = bytes;
  let unitIndex = 0;

  while (value >= 1024 && unitIndex < units.length - 1) {
    value /= 1024;
    unitIndex += 1;
  }

  return `${value.toFixed(value >= 10 || unitIndex === 0 ? 0 : 1)} ${units[unitIndex]}`;
};

const loadDatabases = async () => {
  isDatabaseLoading.value = true;
  databaseError.value = '';

  try {
    const data = await fetchDatabases();
    databases.value = data.items;
    databaseLimit.value = data.limit;

    if (databases.value.length === 0) {
      activeDatabaseID.value = null;
    } else if (!databases.value.some((database) => database.id === activeDatabaseID.value)) {
      activeDatabaseID.value = databases.value[0].id;
    }
  } catch (error) {
    databaseError.value = getErrorMessage(error, '数据库列表加载失败，请稍后重试。');
  } finally {
    isDatabaseLoading.value = false;
  }
};

const openCreateDatabaseDialog = () => {
  if (isDatabaseLimitReached.value) {
    showDatabaseNotice(`最多只能创建 ${databaseLimit.value} 个数据库`);
    return;
  }

  editingDatabase.value = null;
  newDatabaseName.value = '';
  databaseDialogError.value = '';
  isCreateDialogVisible.value = true;
};

const openRenameDatabaseDialog = (database: UserDatabase) => {
  editingDatabase.value = database;
  newDatabaseName.value = database.displayName;
  databaseDialogError.value = '';
  isCreateDialogVisible.value = true;
};

const submitCreateDatabase = async () => {
  const name = newDatabaseName.value.trim();
  databaseDialogError.value = '';

  if (!name) {
    databaseDialogError.value = '请填写数据库名称';
    return;
  }

  if (!databaseNamePattern.test(name)) {
    databaseDialogError.value = '数据库名称需以英文字母开头，只能包含英文字母、数字和下划线，长度为 2 到 32 位';
    return;
  }

  isCreatingDatabase.value = true;

  try {
    if (editingDatabase.value) {
      const database = await renameDatabase(editingDatabase.value.id, name);
      databases.value = databases.value.map((item) => item.id === database.id ? database : item);
      showDatabaseNotice('数据库已重命名');
    } else {
      const database = await createDatabase(name);
      databases.value = [database, ...databases.value];
      activeDatabaseID.value = database.id;
      showDatabaseNotice('数据库已创建');
    }

    isCreateDialogVisible.value = false;
  } catch (error) {
    databaseDialogError.value = getErrorMessage(error, editingDatabase.value ? '数据库重命名失败' : '数据库创建失败');
  } finally {
    isCreatingDatabase.value = false;
  }
};

const openDeleteDatabaseDialog = (database: UserDatabase) => {
  deletingDatabase.value = database;
  deleteConfirmName.value = '';
  isDeleteDialogVisible.value = true;
};

const confirmDeleteDatabase = async () => {
  if (!deletingDatabase.value) {
    return;
  }

  if (deleteConfirmName.value.trim() !== deletingDatabase.value.displayName) {
    showDatabaseNotice('请输入完整数据库名称');
    return;
  }

  isDeletingDatabase.value = true;
  const database = deletingDatabase.value;

  try {
    await deleteDatabase(database.id, deleteConfirmName.value.trim());
    databases.value = databases.value.filter((item) => item.id !== database.id);

    if (activeDatabaseID.value === database.id) {
      activeDatabaseID.value = databases.value[0]?.id ?? null;
    }

    showDatabaseNotice('数据库已删除');
    isDeleteDialogVisible.value = false;
    deletingDatabase.value = null;
  } catch (error) {
    showDatabaseNotice(getErrorMessage(error, '数据库删除失败'));
  } finally {
    isDeletingDatabase.value = false;
  }
};

let noticeTimer: number | null = null;

const showDatabaseNotice = (message: string) => {
  databaseNotice.value = message;

  if (noticeTimer !== null) {
    window.clearTimeout(noticeTimer);
  }

  noticeTimer = window.setTimeout(() => {
    databaseNotice.value = '';
    noticeTimer = null;
  }, 2200);
};

onMounted(() => {
  void loadPreferences();
  void loadDatabases();
  resetAuroraBlobs();
  window.addEventListener('resize', resizeAuroraBlobs);
  auroraAnimationId = requestAnimationFrame(moveAuroraBlobs);
});

onUnmounted(() => {
  if (auroraAnimationId !== null) {
    cancelAnimationFrame(auroraAnimationId);
    auroraAnimationId = null;
  }

  window.removeEventListener('resize', resizeAuroraBlobs);

  if (noticeTimer !== null) {
    window.clearTimeout(noticeTimer);
  }
});
</script>

<template>
  <main class="home-page">
    <div class="aurora-layer" aria-hidden="true">
      <span
        v-for="blob in auroraBlobs"
        :key="blob.id"
        class="aurora-blob"
        :class="blob.className"
        :style="blob.style"
      ></span>
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
        <aside
          v-loading="isDatabaseLoading"
          class="database-tree glass-card"
        >
          <div class="database-tree-header">
            <div>
              <div class="section-title">数据库导航</div>
              <p>{{ databases.length }} / {{ databaseLimit }}</p>
            </div>
            <div class="database-tree-actions">
              <button
                class="icon-button"
                type="button"
                aria-label="刷新数据库列表"
                @click="loadDatabases"
              >
                ↻
              </button>
              <button
                class="icon-button"
                type="button"
                aria-label="创建数据库"
                :disabled="isDatabaseLimitReached"
                @click="openCreateDatabaseDialog"
              >
                +
              </button>
            </div>
          </div>

          <div
            v-if="databases.length === 0"
            class="tree-empty"
          >
            <p>暂无数据库</p>
            <span>你创建的数据库会显示在这里。</span>
          </div>

          <div
            v-else
            class="database-list"
          >
            <article
              v-for="database in databases"
              :key="database.id"
              class="database-item"
              :class="{ active: database.id === selectedDatabase?.id }"
              role="button"
              tabindex="0"
              @click="activeDatabaseID = database.id"
              @keydown.enter="activeDatabaseID = database.id"
            >
              <div class="database-item-main">
                <strong>{{ database.displayName }}</strong>
                <div class="database-item-meta">
                  <span>{{ database.tableCount }} 张表</span>
                  <span>{{ database.viewCount }} 个视图</span>
                  <span>{{ formatBytes(database.sizeBytes) }}</span>
                </div>
              </div>
              <div class="database-item-actions">
                <button
                  class="database-text-button"
                  type="button"
                  @click="openRenameDatabaseDialog(database)"
                >
                  重命名
                </button>
                <button
                  class="database-text-button danger"
                  type="button"
                  @click.stop="openDeleteDatabaseDialog(database)"
                >
                  删除
                </button>
              </div>
            </article>
          </div>

          <p
            v-if="databaseError"
            class="database-feedback error"
          >
            {{ databaseError }}
          </p>
          <p
            v-else-if="databaseNotice"
            class="database-feedback"
          >
            {{ databaseNotice }}
          </p>
        </aside>

        <section class="workbench-content">
          <section class="hero-panel glass-card">
            <div class="hero-copy">
              <p class="home-label">开始使用</p>
              <h2>你的本地 MySQL 控制台已经准备好</h2>
              <p>
                这里会集中展示你的数据库、容量统计和常用操作。
                当前选中：{{ selectedDatabase?.displayName || '还没有数据库' }}。
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
              <h2>常用操作</h2>
              <p>数据库功能完成后，可以从这里快速进入创建、设计、浏览和查询。</p>
            </div>

            <div class="quick-actions">
              <el-button
                :disabled="false"
                class="workbench-action-button"
                @click="openCreateDatabaseDialog"
              >
                创建数据库
              </el-button>
              <el-button
                v-for="action in quickActions.slice(1)"
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

    <GlassDialog
      v-model="isCreateDialogVisible"
      label="DATABASE"
      :title="editingDatabase ? '重命名数据库' : '创建数据库'"
      :description="editingDatabase
        ? '修改工作台中显示的数据库名称，真实 schema 仍由系统安全托管。'
        : '为当前账号创建一个隔离的本地 MySQL schema，后续表结构和数据都归你自己管理。'"
      hide-header
    >
      <div class="create-database-form">
        <label class="dialog-field">
          <span>数据库显示名</span>
          <el-input
            v-model="newDatabaseName"
            maxlength="32"
            :class="{ 'is-error': databaseDialogError }"
            @keyup.enter="submitCreateDatabase"
          />
        </label>

        <p
          v-if="databaseDialogError"
          class="dialog-error"
        >
          {{ databaseDialogError }}
        </p>

        <div class="dialog-tips">
          <span>以英文字母开头</span>
          <span>2-32 位</span>
          <span>可包含数字和下划线</span>
        </div>
      </div>

      <template #footer>
        <div class="dialog-actions">
          <button
            class="dialog-button ghost"
            type="button"
            @click="isCreateDialogVisible = false"
          >
            取消
          </button>
          <button
            class="dialog-button primary"
            type="button"
            :disabled="isCreatingDatabase || (!editingDatabase && isDatabaseLimitReached)"
            @click="submitCreateDatabase"
          >
            {{ isCreatingDatabase ? '处理中…' : editingDatabase ? '保存修改' : '创建数据库' }}
          </button>
        </div>
      </template>
    </GlassDialog>

    <GlassDialog
      v-model="isDeleteDialogVisible"
      title="删除数据库"
      width="440px"
    >
      <div class="delete-database-form">
        <p>
          删除后当前版本无法恢复。请输入
          <strong>{{ deletingDatabase?.displayName }}</strong>
          确认删除。
        </p>
        <el-input
          v-model="deleteConfirmName"
          placeholder="输入完整数据库名称"
          @keyup.enter="confirmDeleteDatabase"
        />
      </div>

      <template #footer>
        <el-button @click="isDeleteDialogVisible = false">取消</el-button>
        <el-button
          type="danger"
          :loading="isDeletingDatabase"
          :disabled="deleteConfirmName.trim() !== deletingDatabase?.displayName"
          @click="confirmDeleteDatabase"
        >
          删除
        </el-button>
      </template>
    </GlassDialog>
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
  border-radius: 999px;
  filter: blur(70px);
  mix-blend-mode: screen;
  will-change: transform;
}

.blob-one {
  filter: blur(70px);
}

.blob-two {
  filter: blur(74px);
}

.blob-three {
  filter: blur(78px);
}

.blob-four {
  filter: blur(64px);
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

.database-tree-header {
  display: flex;
  justify-content: space-between;
  gap: 16px;
  align-items: flex-start;
  margin-bottom: 24px;
}

.database-tree-header p {
  margin: 6px 0 0;
  color: var(--glass-text-muted);
  font-size: 13px;
}

.database-tree-actions {
  display: flex;
  gap: 8px;
}

.section-title {
  margin-bottom: 0;
  font-size: 18px;
  font-weight: 700;
}

.icon-button {
  display: grid;
  place-items: center;
  width: 34px;
  height: 34px;
  color: var(--glass-text-strong);
  font-size: 22px;
  line-height: 1;
  border: 1px solid var(--glass-border-soft);
  border-radius: 12px;
  background: rgba(255, 255, 255, 0.07);
  cursor: pointer;
  transition: var(--glass-transition);
}

.icon-button:hover {
  border-color: hsla(var(--theme-hue), 90%, 72%, 0.42);
  box-shadow: 0 0 18px hsla(var(--theme-hue), 80%, 62%, 0.2);
  transform: translateY(-1px);
}

.icon-button:disabled,
.icon-button:disabled:hover {
  color: rgba(255, 255, 255, 0.34);
  border-color: rgba(255, 255, 255, 0.06);
  background: rgba(255, 255, 255, 0.025);
  box-shadow: none;
  cursor: not-allowed;
  transform: none;
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

.database-list {
  display: grid;
  gap: 12px;
}

.database-item {
  display: flex;
  justify-content: space-between;
  gap: 14px;
  align-items: flex-start;
  padding: 14px;
  border: 1px solid rgba(255, 255, 255, 0.08);
  border-radius: 16px;
  background: rgba(255, 255, 255, 0.045);
  cursor: pointer;
  outline: none;
  transition: var(--glass-transition);
}

.database-item:hover,
.database-item:focus-visible {
  border-color: hsla(var(--theme-hue), 90%, 72%, 0.32);
  background: hsla(var(--theme-hue), 70%, 58%, 0.08);
  box-shadow: 0 0 22px hsla(var(--theme-hue), 80%, 62%, 0.12);
}

.database-item.active {
  border-color: hsla(var(--theme-hue), 90%, 72%, 0.48);
  background:
    linear-gradient(135deg, hsla(var(--theme-hue), 85%, 60%, 0.16), rgba(255, 255, 255, 0.055));
  box-shadow:
    inset 0 1px 0 rgba(255, 255, 255, 0.1),
    0 0 28px hsla(var(--theme-hue), 85%, 62%, 0.16);
}

.database-item-main {
  min-width: 0;
}

.database-item strong {
  display: block;
  overflow: hidden;
  color: var(--glass-text-strong);
  text-overflow: ellipsis;
  white-space: nowrap;
}

.database-item-meta {
  display: flex;
  flex-wrap: wrap;
  gap: 6px;
  margin-top: 8px;
}

.database-item-meta span {
  display: inline-flex;
  align-items: center;
  max-width: 100%;
  padding: 3px 7px;
  color: var(--glass-text-muted);
  font-size: 11px;
  line-height: 1.25;
  border: 1px solid rgba(255, 255, 255, 0.08);
  border-radius: 999px;
  background: rgba(255, 255, 255, 0.035);
  white-space: nowrap;
}

.database-item-actions {
  display: flex;
  flex: 0 0 auto;
  flex-direction: column;
  gap: 8px;
}

.database-text-button {
  flex: 0 0 auto;
  padding: 6px 10px;
  color: rgba(255, 255, 255, 0.68);
  border: 1px solid rgba(255, 255, 255, 0.12);
  border-radius: 999px;
  background: rgba(255, 255, 255, 0.04);
  cursor: pointer;
  transition: var(--glass-transition);
}

.database-text-button:hover {
  color: var(--glass-text-strong);
  border-color: hsla(var(--theme-hue), 90%, 72%, 0.36);
}

.database-text-button.danger:hover {
  color: #fecaca;
  border-color: rgba(248, 113, 113, 0.46);
  background: rgba(248, 113, 113, 0.1);
}

.database-feedback {
  margin: 16px 0 0;
  padding: 10px 12px;
  color: var(--theme-primary-light);
  font-size: 13px;
  line-height: 1.5;
  border: 1px solid hsla(var(--theme-hue), 90%, 72%, 0.2);
  border-radius: 14px;
  background: hsla(var(--theme-hue), 80%, 60%, 0.08);
}

.database-feedback.error {
  color: #fecaca;
  border-color: rgba(248, 113, 113, 0.32);
  background: rgba(248, 113, 113, 0.08);
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
  margin: 0 !important;
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

.delete-database-form p {
  margin: 0 0 16px;
  color: var(--glass-text-muted);
  line-height: 1.7;
}

.create-database-form {
  position: relative;
  padding: 2px 2px 0;
}

.dialog-field {
  display: grid;
  gap: 10px;
  margin: 0;
}

.dialog-field > span {
  color: var(--glass-text);
  font-size: 13px;
  font-weight: 700;
  letter-spacing: 0.08em;
}

.dialog-field :deep(.el-input.is-error .el-input__wrapper) {
  border-color: rgba(248, 113, 113, 0.58) !important;
  box-shadow:
    0 0 22px rgba(248, 113, 113, 0.18),
    inset 0 1px 0 rgba(255, 255, 255, 0.1) !important;
}

.dialog-error {
  margin: 12px 0 0;
  padding: 10px 12px;
  color: #fecaca;
  font-size: 13px;
  line-height: 1.5;
  border: 1px solid rgba(248, 113, 113, 0.32);
  border-radius: 14px;
  background: rgba(248, 113, 113, 0.08);
}

.dialog-tips {
  display: flex;
  flex-wrap: wrap;
  gap: 9px;
  margin-top: 16px;
}

.dialog-tips span {
  padding: 7px 10px;
  color: var(--glass-text-muted);
  font-size: 12px;
  border: 1px solid hsla(var(--theme-hue), 80%, 72%, 0.16);
  border-radius: 999px;
  background: hsla(var(--theme-hue), 80%, 60%, 0.07);
}

.dialog-actions {
  display: flex;
  justify-content: flex-end;
  gap: 12px;
  width: 100%;
}

.dialog-button {
  min-width: 104px;
  min-height: 40px;
  padding: 0 18px;
  color: var(--glass-text);
  border: 1px solid var(--glass-border-soft);
  border-radius: 999px;
  background:
    linear-gradient(135deg, hsla(var(--theme-hue), 80%, 60%, 0.1), rgba(255, 255, 255, 0.055));
  box-shadow:
    var(--glass-shadow-control),
    inset 0 1px 0 rgba(255, 255, 255, 0.1);
  cursor: pointer;
  transition: var(--glass-transition);
}

.dialog-button:hover:not(:disabled) {
  color: var(--glass-text-strong);
  border-color: hsla(var(--theme-hue), 90%, 72%, 0.42);
  box-shadow:
    0 12px 28px rgba(0, 0, 0, 0.22),
    0 0 24px hsla(var(--theme-hue), 80%, 62%, 0.16);
  transform: translateY(-1px);
}

.dialog-button.primary {
  color: var(--glass-text-strong);
  border-color: hsla(var(--theme-hue), 90%, 72%, 0.36);
  background:
    radial-gradient(circle at 24% 18%, rgba(255, 255, 255, 0.22), transparent 26%),
    linear-gradient(135deg, hsla(var(--theme-hue), 84%, 60%, 0.32), hsla(calc(var(--theme-hue) + 28), 80%, 58%, 0.16));
}

.dialog-button:disabled {
  color: rgba(255, 255, 255, 0.38);
  border-color: rgba(255, 255, 255, 0.08);
  background: rgba(255, 255, 255, 0.035);
  box-shadow: none;
  cursor: not-allowed;
}

.delete-database-form strong {
  color: #fecaca;
  font-weight: 700;
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

  .database-item {
    align-items: center;
  }

  .database-item-actions {
    flex-direction: row;
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

  .dialog-actions {
    flex-direction: column-reverse;
  }

  .dialog-button {
    width: 100%;
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

@keyframes orb-spin {
  from {
    transform: rotateX(66deg) rotateZ(0deg);
  }

  to {
    transform: rotateX(66deg) rotateZ(360deg);
  }
}
</style>
