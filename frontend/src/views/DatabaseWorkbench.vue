<script setup lang="ts">
import { computed, onMounted, ref, watch } from 'vue';
import { useRoute, useRouter } from 'vue-router';
import GlassDialog from '../components/GlassDialog.vue';
import { fetchDatabases, type UserDatabase } from '../utils/databases';
import { applyPreferences, fetchPreferences } from '../utils/preferences';
import {
  createTable,
  deleteTable,
  fetchDatabaseObjects,
  fetchTablePreview,
  fetchTableSchema,
  type CreateTablePayload,
  type DatabaseObject,
  type TableColumnInput,
  type TablePreviewData,
  type TablePreviewFilter,
  type TableSchema
} from '../utils/tables';

type DraftColumn = {
  id: number;
  name: string;
  type: string;
  length: number | null;
  nullable: boolean;
  primaryKey: boolean;
  autoIncrement: boolean;
  defaultValue: string;
  comment: string;
};

type ColumnFilterDraft = {
  mode: 'equals' | 'contains';
  value: string;
};

const route = useRoute();
const router = useRouter();

const databases = ref<UserDatabase[]>([]);
const selectedDatabase = ref<UserDatabase | null>(null);
const tableObjects = ref<DatabaseObject[]>([]);
const selectedTableName = ref('');
const selectedTableSchema = ref<TableSchema | null>(null);
const isDatabaseLoading = ref(false);
const isObjectLoading = ref(false);
const isSchemaLoading = ref(false);
const isPreviewLoading = ref(false);
const tableError = ref('');
const tableNotice = ref('');
const previewError = ref('');
const isCreateTableDialogVisible = ref(false);
const isCreatingTable = ref(false);
const tableDialogError = ref('');
const newTableName = ref('');
const tableColumns = ref<DraftColumn[]>([]);
const isDeleteTableDialogVisible = ref(false);
const deletingTable = ref<DatabaseObject | null>(null);
const deleteTableConfirmName = ref('');
const deleteTableDialogError = ref('');
const isDeletingTable = ref(false);
const isSchemaDialogVisible = ref(false);
const tablePreview = ref<TablePreviewData | null>(null);
const columnFilters = ref<Record<string, ColumnFilterDraft>>({});

const sqlIdentifierPattern = /^[A-Za-z][A-Za-z0-9_]{0,63}$/;
const supportedTableTypes = ['INT', 'BIGINT', 'VARCHAR', 'TEXT', 'DATETIME', 'DATE', 'BOOLEAN', 'DECIMAL', 'JSON'];
const previewPageSize = 20;
let draftColumnSeed = 0;
let tableNoticeTimer: number | null = null;

const databaseID = computed(() => Number(route.params.databaseId));
const baseTables = computed(() => tableObjects.value.filter((object) => object.objectType === 'table'));
const selectedTable = computed(() => {
  return baseTables.value.find((object) => object.name === selectedTableName.value) ?? null;
});
const schemaSummary = computed(() => {
  if (!selectedTableSchema.value) {
    return {
      columns: 0,
      indexes: 0,
      constraints: 0
    };
  }

  return {
    columns: selectedTableSchema.value.columns.length,
    indexes: selectedTableSchema.value.indexes.length,
    constraints: selectedTableSchema.value.constraints.length
  };
});
const previewColumns = computed(() => tablePreview.value?.columns ?? []);
const previewRows = computed(() => tablePreview.value?.rows ?? []);
const previewOffset = computed(() => tablePreview.value?.offset ?? 0);
const previewLoadedCount = computed(() => previewOffset.value + previewRows.value.length);

const loadPreferences = async () => {
  try {
    const preferences = await fetchPreferences();
    applyPreferences(preferences);
  } catch {
    console.warn('偏好加载失败，已使用默认主题');
  }
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

const formatDate = (value: string | null) => {
  if (!value) {
    return '-';
  }

  return new Date(value).toLocaleString('zh-CN', {
    month: '2-digit',
    day: '2-digit',
    hour: '2-digit',
    minute: '2-digit'
  });
};

const loadDatabase = async (preferredTableName = selectedTableName.value) => {
  if (!Number.isInteger(databaseID.value) || databaseID.value <= 0) {
    tableError.value = '数据库 ID 不正确';
    return;
  }

  isDatabaseLoading.value = true;
  tableError.value = '';

  try {
    const data = await fetchDatabases();
    databases.value = data.items;
    selectedDatabase.value = data.items.find((database) => database.id === databaseID.value) ?? null;

    if (!selectedDatabase.value) {
      tableError.value = '数据库不存在或你没有权限访问';
      return;
    }

    await loadDatabaseObjects(preferredTableName);
  } catch (error) {
    tableError.value = getErrorMessage(error, '数据库信息加载失败，请稍后重试。');
  } finally {
    isDatabaseLoading.value = false;
  }
};

const loadDatabaseObjects = async (preferredTableName = selectedTableName.value) => {
  if (!selectedDatabase.value) {
    tableObjects.value = [];
    selectedTableName.value = '';
    selectedTableSchema.value = null;
    return;
  }

  isObjectLoading.value = true;
  tableError.value = '';

  try {
    const data = await fetchDatabaseObjects(selectedDatabase.value.id);
    tableObjects.value = data.items;

    if (baseTables.value.length === 0) {
      selectedTableName.value = '';
      selectedTableSchema.value = null;
    } else if (preferredTableName && baseTables.value.some((table) => table.name === preferredTableName)) {
      selectedTableName.value = preferredTableName;
    } else if (!baseTables.value.some((table) => table.name === selectedTableName.value)) {
      selectedTableName.value = baseTables.value[0]?.name ?? '';
    }
  } catch (error) {
    tableError.value = getErrorMessage(error, '表列表加载失败，请稍后重试。');
  } finally {
    isObjectLoading.value = false;
  }
};

const loadSelectedTableSchema = async (tableName = selectedTableName.value) => {
  if (!selectedDatabase.value || !tableName) {
    selectedTableSchema.value = null;
    return;
  }

  isSchemaLoading.value = true;
  tableError.value = '';

  try {
    selectedTableSchema.value = await fetchTableSchema(selectedDatabase.value.id, tableName);
  } catch (error) {
    selectedTableSchema.value = null;
    tableError.value = getErrorMessage(error, '表结构加载失败，请稍后重试。');
  } finally {
    isSchemaLoading.value = false;
  }
};

const loadSelectedTablePreview = async (options: { append?: boolean } = {}) => {
  if (!selectedDatabase.value || !selectedTableName.value) {
    tablePreview.value = null;
    return;
  }

  isPreviewLoading.value = true;
  previewError.value = '';

  try {
    const preview = await fetchTablePreview(selectedDatabase.value.id, selectedTableName.value, {
      limit: previewPageSize,
      offset: options.append ? previewLoadedCount.value : 0,
      filters: buildPreviewFilters()
    });

    tablePreview.value = options.append && tablePreview.value
      ? {
          ...preview,
          rows: [...tablePreview.value.rows, ...preview.rows],
          offset: tablePreview.value.offset
        }
      : preview;

    syncColumnFilters(preview);
  } catch (error) {
    if (!options.append) {
      tablePreview.value = null;
    }

    previewError.value = getErrorMessage(error, '表数据预览加载失败，请稍后重试。');
  } finally {
    isPreviewLoading.value = false;
  }
};

const buildPreviewFilters = (): TablePreviewFilter[] => {
  return Object.entries(columnFilters.value)
    .map(([column, filter]) => ({
      column,
      value: filter.value.trim(),
      mode: filter.mode
    }))
    .filter((filter) => filter.value !== '');
};

const syncColumnFilters = (preview: TablePreviewData) => {
  const nextFilters: Record<string, ColumnFilterDraft> = {};

  preview.columns.forEach((column) => {
    nextFilters[column.name] = columnFilters.value[column.name] ?? {
      mode: preview.facets[column.name] ? 'equals' : 'contains',
      value: ''
    };
  });

  columnFilters.value = nextFilters;
};

const resetPreviewFilters = () => {
  columnFilters.value = {};
};

const applyPreviewFilter = () => {
  void loadSelectedTablePreview();
};

const loadMorePreviewRows = () => {
  void loadSelectedTablePreview({ append: true });
};

const openSchemaDialog = () => {
  if (!selectedTableName.value) {
    showTableNotice('请先选择一张表');
    return;
  }

  isSchemaDialogVisible.value = true;

  if (!selectedTableSchema.value) {
    void loadSelectedTableSchema();
  }
};

const formatCellValue = (value: unknown) => {
  if (value === null || value === undefined) {
    return 'NULL';
  }

  if (typeof value === 'object') {
    return JSON.stringify(value);
  }

  return String(value);
};

const formatFacetValue = (value: string | number | boolean | null) => {
  return value === null ? 'NULL' : String(value);
};

const createDraftColumn = (overrides: Partial<DraftColumn> = {}): DraftColumn => ({
  id: ++draftColumnSeed,
  name: '',
  type: '',
  length: null,
  nullable: false,
  primaryKey: false,
  autoIncrement: false,
  defaultValue: '',
  comment: '',
  ...overrides
});

const resetCreateTableForm = () => {
  newTableName.value = '';
  tableDialogError.value = '';
  tableColumns.value = [];
};

const openCreateTableDialog = () => {
  if (!selectedDatabase.value) {
    showTableNotice('请先选择一个数据库');
    return;
  }

  resetCreateTableForm();
  isCreateTableDialogVisible.value = true;
};

const addTableColumn = () => {
  tableColumns.value.push(createDraftColumn());
};

const removeTableColumn = (columnID: number) => {
  tableColumns.value = tableColumns.value.filter((column) => column.id !== columnID);
};

const applyColumnTypeDefaults = (column: DraftColumn) => {
  if (column.type !== 'VARCHAR') {
    column.length = null;
  }

  if (column.type !== 'INT' && column.type !== 'BIGINT') {
    column.autoIncrement = false;
  }

  if (column.autoIncrement) {
    column.nullable = false;
    column.primaryKey = true;
  }
};

const submitCreateTable = async () => {
  if (!selectedDatabase.value) {
    showTableNotice('请先选择数据库');
    return;
  }

  const payload = buildCreateTablePayload();

  if (!payload) {
    return;
  }

  isCreatingTable.value = true;

  try {
    const schema = await createTable(selectedDatabase.value.id, payload);
    const createdTableName = schema.tableName;
    selectedTableSchema.value = schema;
    isCreateTableDialogVisible.value = false;
    showTableNotice('表已创建');
    await loadDatabase(createdTableName);
  } catch (error) {
    tableDialogError.value = getErrorMessage(error, '表创建失败');
  } finally {
    isCreatingTable.value = false;
  }
};

const buildCreateTablePayload = (): CreateTablePayload | null => {
  const tableName = newTableName.value.trim();
  tableDialogError.value = '';

  if (!tableName) {
    tableDialogError.value = '请填写表名';
    return null;
  }

  if (!sqlIdentifierPattern.test(tableName)) {
    tableDialogError.value = '表名需以英文字母开头，只能包含英文字母、数字和下划线，长度为 1 到 64 位';
    return null;
  }

  const names = new Set<string>();
  const columns: TableColumnInput[] = [];
  const primaryColumns: string[] = [];

  if (tableColumns.value.length === 0) {
    tableDialogError.value = '请至少添加一个字段';
    return null;
  }

  for (const draft of tableColumns.value) {
    const name = draft.name.trim();

    if (!name) {
      tableDialogError.value = '字段名不能为空';
      return null;
    }

    if (!sqlIdentifierPattern.test(name)) {
      tableDialogError.value = `${name} 不是合法字段名`;
      return null;
    }

    if (names.has(name)) {
      tableDialogError.value = `字段 ${name} 重复`;
      return null;
    }

    if (!draft.type) {
      tableDialogError.value = `${name} 请选择字段类型`;
      return null;
    }

    if (!supportedTableTypes.includes(draft.type)) {
      tableDialogError.value = `${name} 的字段类型暂不支持`;
      return null;
    }

    names.add(name);

    if (draft.primaryKey) {
      primaryColumns.push(name);
    }

    const column: TableColumnInput = {
      name,
      type: draft.type,
      nullable: draft.primaryKey ? false : draft.nullable,
      autoIncrement: draft.autoIncrement || undefined
    };

    if (draft.type === 'VARCHAR') {
      const length = Number(draft.length ?? 0);

      if (!Number.isInteger(length) || length < 1 || length > 16383) {
        tableDialogError.value = `${name} 的 VARCHAR 长度需为 1 到 16383`;
        return null;
      }

      column.length = length;
    }

    const defaultValue = draft.defaultValue.trim();

    if (defaultValue) {
      const normalizedDefaultValue = normalizeDraftDefaultValue(defaultValue, draft.type);

      if (normalizedDefaultValue === undefined) {
        return null;
      }

      column.defaultValue = normalizedDefaultValue;
    }

    if (draft.comment.trim()) {
      column.comment = draft.comment.trim();
    }

    columns.push(column);
  }

  return {
    tableName,
    columns,
    constraints: primaryColumns.length > 0
      ? [
          {
            type: 'PRIMARY_KEY',
            columns: primaryColumns
          }
        ]
      : []
  };
};

const normalizeDraftDefaultValue = (value: string, type: string): string | number | boolean | null | undefined => {
  if (value.toUpperCase() === 'NULL') {
    return null;
  }

  if (['INT', 'BIGINT', 'DECIMAL'].includes(type)) {
    const numberValue = Number(value);
    if (!Number.isFinite(numberValue)) {
      tableDialogError.value = `${value} 不是有效数字默认值`;
      return undefined;
    }
    return numberValue;
  }

  if (type === 'BOOLEAN') {
    return value === '1' || value.toLowerCase() === 'true';
  }

  return value;
};

const selectTable = (table: DatabaseObject) => {
  resetPreviewFilters();

  if (selectedTableName.value === table.name) {
    void loadSelectedTablePreview();
    return;
  }

  selectedTableName.value = table.name;
};

const openDeleteTableDialog = (table: DatabaseObject) => {
  deletingTable.value = table;
  deleteTableConfirmName.value = '';
  deleteTableDialogError.value = '';
  isDeleteTableDialogVisible.value = true;
};

const confirmDeleteTable = async () => {
  if (!selectedDatabase.value || !deletingTable.value) {
    return;
  }

  const confirmName = deleteTableConfirmName.value.trim();

  if (confirmName !== deletingTable.value.name) {
    deleteTableDialogError.value = '请输入完整表名';
    return;
  }

  isDeletingTable.value = true;

  try {
    await deleteTable(selectedDatabase.value.id, deletingTable.value.name, confirmName);
    showTableNotice('表已删除');
    isDeleteTableDialogVisible.value = false;
    deletingTable.value = null;
    deleteTableConfirmName.value = '';
    await loadDatabase();
  } catch (error) {
    deleteTableDialogError.value = getErrorMessage(error, '表删除失败');
  } finally {
    isDeletingTable.value = false;
  }
};

const showTableNotice = (message: string) => {
  tableNotice.value = message;

  if (tableNoticeTimer !== null) {
    window.clearTimeout(tableNoticeTimer);
  }

  tableNoticeTimer = window.setTimeout(() => {
    tableNotice.value = '';
    tableNoticeTimer = null;
  }, 2200);
};

watch(selectedTableName, (tableName) => {
  void loadSelectedTableSchema(tableName);
  void loadSelectedTablePreview();
});

onMounted(() => {
  void loadPreferences();
  void loadDatabase();
});
</script>

<template>
  <main class="database-workbench-page">
    <div class="workbench-aurora" aria-hidden="true"></div>

    <div class="workbench-frame">
      <header class="workbench-topbar glass-card">
        <div>
          <p class="home-label">DATABASE WORKBENCH</p>
          <h1>{{ selectedDatabase?.displayName || '数据库工作台' }}</h1>
          <p>表、字段和后续数据操作都放在这里，首页只做总览和入口。</p>
        </div>
        <div class="topbar-actions">
          <button
            class="dialog-button"
            type="button"
            @click="router.push('/home')"
          >
            返回首页
          </button>
        </div>
      </header>

      <section
        v-loading="isDatabaseLoading"
        class="database-summary-grid"
      >
        <article class="summary-card glass-card">
          <span>数据表</span>
          <strong>{{ selectedDatabase?.tableCount ?? 0 }}</strong>
          <p>当前数据库中的基础表数量</p>
        </article>
        <article class="summary-card glass-card">
          <span>视图</span>
          <strong>{{ selectedDatabase?.viewCount ?? 0 }}</strong>
          <p>视图管理会在后续阶段开放</p>
        </article>
        <article class="summary-card glass-card">
          <span>占用空间</span>
          <strong>{{ formatBytes(selectedDatabase?.sizeBytes ?? 0) }}</strong>
          <p>按 information_schema 估算</p>
        </article>
      </section>

      <section class="table-workbench glass-card">
        <header class="table-workbench-header">
          <div>
            <p class="home-label">表结构管理</p>
            <h2>{{ selectedDatabase?.displayName || '请选择数据库' }}</h2>
            <p>当前阶段支持表列表、创建表、查看结构和删除表；复杂约束和视图会继续扩展。</p>
          </div>
          <div class="table-workbench-actions">
            <button
              class="dialog-button"
              type="button"
              :disabled="!selectedDatabase || isObjectLoading"
              @click="loadDatabaseObjects()"
            >
              {{ isObjectLoading ? '刷新中…' : '刷新' }}
            </button>
            <button
              class="dialog-button primary"
              type="button"
              :disabled="!selectedDatabase"
              @click="openCreateTableDialog"
            >
              创建表
            </button>
          </div>
        </header>

        <div
          v-if="!selectedDatabase"
          class="table-empty"
        >
          <strong>数据库不可用</strong>
          <span>{{ tableError || '请从首页选择一个数据库进入。' }}</span>
        </div>

        <div
          v-else
          class="table-manager"
        >
          <aside
            v-loading="isObjectLoading"
            class="table-object-panel"
          >
            <div class="table-panel-title">
              <span>数据表</span>
              <small>{{ baseTables.length }} 张表</small>
            </div>

            <div
              v-if="baseTables.length === 0"
              class="table-empty compact"
            >
              <strong>暂无数据表</strong>
              <span>点击“创建表”生成第一张表。</span>
            </div>

            <div
              v-else
              class="table-object-list"
            >
              <article
                v-for="table in baseTables"
                :key="table.name"
                class="table-object-item"
                :class="{ active: table.name === selectedTableName }"
                role="button"
                tabindex="0"
                @click="selectTable(table)"
                @keydown.enter="selectTable(table)"
              >
                <div>
                  <strong>{{ table.name }}</strong>
                  <span>{{ table.rowCountEstimated }} 行估算 · {{ formatBytes(table.dataLength + table.indexLength) }}</span>
                </div>
                <button
                  class="database-text-button danger"
                  type="button"
                  @click.stop="openDeleteTableDialog(table)"
                >
                  删除
                </button>
              </article>
            </div>
          </aside>

          <section
            v-loading="isPreviewLoading"
            class="preview-panel"
          >
            <div
              v-if="!selectedTableName"
              class="table-empty"
            >
              <strong>{{ baseTables.length ? '选择一张表预览数据' : '数据预览区' }}</strong>
              <span>表格数据会在这里按当前筛选条件分页展示。</span>
            </div>

            <template v-else>
              <div class="preview-head">
                <div>
                  <span class="schema-kicker">DATA PREVIEW</span>
                  <h3>{{ selectedTableName }}</h3>
                  <p>
                    已显示 {{ previewRows.length }} / {{ tablePreview?.total ?? 0 }} 行
                    · 创建时间：{{ formatDate(selectedTable?.createdAt ?? null) }}
                  </p>
                </div>
                <div class="table-workbench-actions">
                  <button
                    class="dialog-button"
                    type="button"
                    :disabled="isSchemaLoading"
                    @click="openSchemaDialog"
                  >
                    结构管理
                  </button>
                  <button
                    class="dialog-button"
                    type="button"
                    :disabled="isPreviewLoading"
                    @click="loadSelectedTablePreview()"
                  >
                    {{ isPreviewLoading ? '刷新中…' : '刷新预览' }}
                  </button>
                </div>
              </div>

              <p
                v-if="previewError"
                class="database-feedback error"
              >
                {{ previewError }}
              </p>

              <div
                v-else-if="previewColumns.length === 0"
                class="table-empty compact"
              >
                <strong>暂无字段</strong>
                <span>这张表还没有可预览的列。</span>
              </div>

              <div
                v-else
                class="preview-table-shell"
              >
                <table class="preview-table">
                  <thead>
                    <tr>
                      <th
                        v-for="column in previewColumns"
                        :key="column.name"
                      >
                        <div class="preview-column-head">
                          <strong>{{ column.name }}</strong>
                          <span>{{ column.columnType }}</span>
                          <el-select
                            v-if="tablePreview?.facets[column.name]"
                            v-model="columnFilters[column.name].value"
                            clearable
                            filterable
                            placeholder=""
                            size="small"
                            @keyup.enter="applyPreviewFilter"
                          >
                            <el-option
                              v-for="value in tablePreview.facets[column.name]"
                              :key="`${column.name}-${formatFacetValue(value)}`"
                              :label="formatFacetValue(value)"
                              :value="formatFacetValue(value)"
                            />
                          </el-select>
                          <el-input
                            v-else
                            v-model="columnFilters[column.name].value"
                            clearable
                            size="small"
                            placeholder=""
                            @keyup.enter="applyPreviewFilter"
                          />
                        </div>
                      </th>
                    </tr>
                  </thead>
                  <tbody>
                    <tr v-if="previewRows.length === 0">
                      <td :colspan="previewColumns.length">
                        <div class="preview-empty-cell">暂无匹配数据</div>
                      </td>
                    </tr>
                    <tr
                      v-for="(row, rowIndex) in previewRows"
                      :key="rowIndex"
                    >
                      <td
                        v-for="column in previewColumns"
                        :key="column.name"
                      >
                        <span :class="{ 'null-cell': row[column.name] === null || row[column.name] === undefined }">
                          {{ formatCellValue(row[column.name]) }}
                        </span>
                      </td>
                    </tr>
                  </tbody>
                </table>
              </div>

              <div
                v-if="tablePreview?.hasMore"
                class="preview-more-row"
              >
                <button
                  class="dialog-button"
                  type="button"
                  :disabled="isPreviewLoading"
                  @click="loadMorePreviewRows"
                >
                  加载更多（{{ previewLoadedCount }} / {{ tablePreview.total }}）
                </button>
              </div>
            </template>
          </section>
        </div>

        <p
          v-if="tableError && selectedDatabase"
          class="database-feedback error"
        >
          {{ tableError }}
        </p>
        <p
          v-else-if="tableNotice"
          class="database-feedback"
        >
          {{ tableNotice }}
        </p>
      </section>
    </div>

    <GlassDialog
      v-model="isCreateTableDialogVisible"
      label="TABLE"
      title="创建数据表"
      description="先从一张规范的基础表开始：字段、主键和默认值会被服务端再次校验。"
      width="min(94vw, 860px)"
      hide-header
    >
      <div class="create-table-form">
        <label class="dialog-field">
          <span>表名</span>
          <el-input
            v-model="newTableName"
            maxlength="64"
            :class="{ 'is-error': tableDialogError }"
            @keyup.enter="submitCreateTable"
          />
        </label>

        <div class="column-editor-head">
          <div>
            <span>字段设计</span>
            <small>按你的业务手动添加字段，不预填模板字段</small>
          </div>
          <button
            class="dialog-button"
            type="button"
            @click="addTableColumn"
          >
            添加字段
          </button>
        </div>

        <div
          v-if="tableColumns.length === 0"
          class="column-editor-empty"
        >
          <strong>还没有字段</strong>
          <span>点击“添加字段”，从空白结构开始设计这张表。</span>
        </div>

        <div
          v-else
          class="column-editor-list"
        >
          <article
            v-for="column in tableColumns"
            :key="column.id"
            class="column-editor-row"
          >
            <label class="dialog-field">
              <span>字段名</span>
              <el-input
                v-model="column.name"
                maxlength="64"
              />
            </label>
            <label class="dialog-field">
              <span>类型</span>
              <el-select
                v-model="column.type"
                placeholder="选择类型"
                @change="applyColumnTypeDefaults(column)"
              >
                <el-option
                  v-for="type in supportedTableTypes"
                  :key="type"
                  :label="type"
                  :value="type"
                />
              </el-select>
            </label>
            <label class="dialog-field compact-field">
              <span>长度</span>
              <el-input-number
                v-model="column.length"
                :disabled="column.type !== 'VARCHAR'"
                :min="1"
                :max="16383"
                controls-position="right"
              />
            </label>
            <label class="dialog-field">
              <span>默认值</span>
              <el-input
                v-model="column.defaultValue"
                placeholder="可留空"
              />
            </label>
            <label class="dialog-field">
              <span>备注</span>
              <el-input
                v-model="column.comment"
                maxlength="255"
                placeholder="可留空"
              />
            </label>
            <div class="column-flags">
              <el-checkbox
                v-model="column.primaryKey"
                @change="column.primaryKey && (column.nullable = false)"
              >
                主键
              </el-checkbox>
              <el-checkbox
                v-model="column.nullable"
                :disabled="column.primaryKey || column.autoIncrement"
              >
                可空
              </el-checkbox>
              <el-checkbox
                v-model="column.autoIncrement"
                :disabled="column.type !== 'INT' && column.type !== 'BIGINT'"
                @change="applyColumnTypeDefaults(column)"
              >
                自增
              </el-checkbox>
            </div>
            <button
              class="column-remove-button"
              type="button"
              @click="removeTableColumn(column.id)"
            >
              移除
            </button>
          </article>
        </div>

        <p
          v-if="tableDialogError"
          class="dialog-error"
        >
          {{ tableDialogError }}
        </p>

        <div class="dialog-tips">
          <span>表名和字段名使用英文标识符</span>
          <span>主键可选；无主键表暂只支持浏览</span>
          <span>VARCHAR 需要填写长度</span>
          <span>当前版本创建后暂不支持改表</span>
        </div>
      </div>

      <template #footer>
        <div class="dialog-actions">
          <button
            class="dialog-button ghost"
            type="button"
            @click="isCreateTableDialogVisible = false"
          >
            取消
          </button>
          <button
            class="dialog-button primary"
            type="button"
            :disabled="isCreatingTable"
            @click="submitCreateTable"
          >
            {{ isCreatingTable ? '创建中…' : '创建表' }}
          </button>
        </div>
      </template>
    </GlassDialog>

    <GlassDialog
      v-model="isSchemaDialogVisible"
      label="TABLE"
      title="表结构管理"
      :description="selectedTableSchema
        ? `${selectedTableSchema.tableName} 的字段、索引和约束管理入口`
        : '正在读取表结构信息'"
      width="min(94vw, 920px)"
      hide-header
    >
      <div
        v-if="selectedTableSchema"
        v-loading="isSchemaLoading"
        class="schema-dialog-content"
      >
        <div class="schema-head">
          <div>
            <span class="schema-kicker">TABLE</span>
            <h3>{{ selectedTableSchema.tableName }}</h3>
            <p>创建时间：{{ formatDate(selectedTable?.createdAt ?? null) }}</p>
          </div>
          <div class="schema-stats">
            <span>{{ schemaSummary.columns }} 字段</span>
            <span>{{ schemaSummary.indexes }} 索引</span>
            <span>{{ schemaSummary.constraints }} 约束</span>
          </div>
        </div>

        <div class="schema-management-actions">
          <button
            class="dialog-button"
            type="button"
            disabled
          >
            新增字段（后续开放）
          </button>
          <button
            class="dialog-button"
            type="button"
            disabled
          >
            修改字段（后续开放）
          </button>
          <button
            class="dialog-button"
            type="button"
            disabled
          >
            删除字段（后续开放）
          </button>
          <button
            class="dialog-button"
            type="button"
            disabled
          >
            约束管理（后续开放）
          </button>
        </div>

        <div class="schema-section">
          <div class="table-panel-title">
            <span>字段清单</span>
            <small>Column Schema</small>
          </div>
          <div class="schema-column-list">
            <article
              v-for="column in selectedTableSchema.columns"
              :key="column.name"
              class="schema-column-card"
            >
              <div>
                <strong>{{ column.name }}</strong>
                <span>{{ column.columnType }}</span>
              </div>
              <div class="schema-column-tags">
                <em v-if="column.key">{{ column.key }}</em>
                <em>{{ column.nullable ? '可为空' : '非空' }}</em>
                <em v-if="column.extra">{{ column.extra }}</em>
                <em v-if="column.defaultValue !== null">默认 {{ column.defaultValue }}</em>
              </div>
            </article>
          </div>
        </div>

        <div class="schema-mini-grid">
          <section class="schema-mini-card">
            <div class="table-panel-title">
              <span>索引</span>
              <small>{{ selectedTableSchema.indexes.length }}</small>
            </div>
            <p
              v-if="selectedTableSchema.indexes.length === 0"
              class="schema-muted"
            >
              暂无索引
            </p>
            <p
              v-for="index in selectedTableSchema.indexes"
              :key="index.name"
            >
              {{ index.unique ? '唯一' : '普通' }} · {{ index.name }}：{{ index.columns.map((column) => column.name).join(', ') }}
            </p>
          </section>
          <section class="schema-mini-card">
            <div class="table-panel-title">
              <span>约束</span>
              <small>{{ selectedTableSchema.constraints.length }}</small>
            </div>
            <p
              v-if="selectedTableSchema.constraints.length === 0"
              class="schema-muted"
            >
              暂无约束
            </p>
            <p
              v-for="constraint in selectedTableSchema.constraints"
              :key="constraint.name"
            >
              {{ constraint.type }} · {{ constraint.columns.join(', ') || constraint.name }}
            </p>
          </section>
        </div>
      </div>

      <div
        v-else
        v-loading="isSchemaLoading"
        class="table-empty compact"
      >
        <strong>正在读取属性</strong>
        <span>稍等一下，表结构信息马上回来。</span>
      </div>

      <template #footer>
        <div class="dialog-actions">
          <button
            class="dialog-button primary"
            type="button"
            @click="isSchemaDialogVisible = false"
          >
            关闭结构管理
          </button>
        </div>
      </template>
    </GlassDialog>

    <GlassDialog
      v-model="isDeleteTableDialogVisible"
      title="删除数据表"
      width="440px"
    >
      <div class="delete-table-form">
        <p>
          删除后当前版本无法恢复。请输入
          <strong>{{ deletingTable?.name }}</strong>
          确认删除。
        </p>
        <el-input
          v-model="deleteTableConfirmName"
          placeholder="输入完整表名"
          @keyup.enter="confirmDeleteTable"
        />
        <p
          v-if="deleteTableDialogError"
          class="dialog-error"
        >
          {{ deleteTableDialogError }}
        </p>
      </div>

      <template #footer>
        <el-button @click="isDeleteTableDialogVisible = false">取消</el-button>
        <el-button
          type="danger"
          :loading="isDeletingTable"
          :disabled="deleteTableConfirmName.trim() !== deletingTable?.name"
          @click="confirmDeleteTable"
        >
          删除
        </el-button>
      </template>
    </GlassDialog>
  </main>
</template>

<style scoped>
.database-workbench-page {
  position: relative;
  isolation: isolate;
  min-height: 100vh;
  padding: clamp(18px, 3vw, 42px);
  overflow-x: clip;
  color: var(--glass-text-strong);
  background:
    radial-gradient(circle at 50% 34%, hsla(var(--theme-hue), 82%, 56%, 0.1), transparent 42%),
    linear-gradient(135deg, rgba(5, 8, 22, 0.3), rgba(7, 14, 30, 0.36));
}

.workbench-aurora {
  position: fixed;
  inset: 0;
  z-index: 0;
  overflow: hidden;
  pointer-events: none;
  background:
    radial-gradient(circle at 18% 22%, hsla(var(--theme-hue), 86%, 58%, 0.24), transparent 36%),
    radial-gradient(circle at 82% 16%, hsla(calc(var(--theme-hue) + 34), 86%, 60%, 0.18), transparent 34%),
    radial-gradient(circle at 58% 86%, hsla(calc(var(--theme-hue) - 30), 78%, 52%, 0.16), transparent 46%),
    rgba(2, 6, 18, 0.64);
}

.workbench-frame {
  position: relative;
  z-index: 1;
  display: grid;
  gap: clamp(22px, 2.8vw, 38px);
  width: min(100%, 1520px);
  margin: 0 auto;
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
}

.workbench-topbar,
.table-workbench-header,
.schema-head,
.preview-head,
.table-panel-title,
.column-editor-head {
  display: flex;
  justify-content: space-between;
  gap: 16px;
  align-items: flex-start;
}

.workbench-topbar {
  align-items: center;
  padding: clamp(22px, 2.6vw, 34px);
}

.workbench-topbar h1,
.table-workbench-header h2,
.schema-head h3 {
  margin: 0;
  letter-spacing: -0.04em;
}

.workbench-topbar h1 {
  font-size: clamp(28px, 3.6vw, 54px);
}

.workbench-topbar p:not(.home-label),
.table-workbench-header p:not(.home-label) {
  max-width: 720px;
  margin: 12px 0 0;
  color: var(--glass-text-muted);
  line-height: 1.8;
}

.home-label {
  margin: 0 0 8px;
  color: var(--theme-primary-light);
  font-size: 13px;
  font-weight: 700;
  letter-spacing: 0.08em;
}

.topbar-actions,
.table-workbench-actions {
  display: flex;
  flex: 0 0 auto;
  gap: 12px;
}

.database-summary-grid {
  display: grid;
  grid-template-columns: repeat(3, minmax(0, 1fr));
  gap: clamp(18px, 2.4vw, 30px);
}

.summary-card {
  min-height: 150px;
  padding: clamp(22px, 2.4vw, 30px);
}

.summary-card span,
.summary-card p {
  color: var(--glass-text-muted);
}

.summary-card strong {
  display: block;
  margin: 14px 0 10px;
  color: var(--theme-primary-light);
  font-size: clamp(32px, 3.8vw, 48px);
  text-shadow: 0 0 18px var(--theme-primary-glow);
}

.summary-card p {
  margin-bottom: 0;
}

.table-workbench {
  padding: clamp(28px, 3vw, 42px);
}

.table-workbench-header {
  margin-bottom: clamp(22px, 2.8vw, 34px);
}

.table-manager {
  display: grid;
  grid-template-columns: minmax(230px, 320px) minmax(0, 1fr);
  gap: clamp(18px, 2.4vw, 30px);
  min-width: 0;
}

.table-object-panel,
.preview-panel {
  min-width: 0;
  min-height: 380px;
  padding: clamp(18px, 2vw, 24px);
  border: 1px solid rgba(255, 255, 255, 0.08);
  border-radius: 22px;
  background:
    linear-gradient(145deg, hsla(var(--theme-hue), 80%, 60%, 0.06), rgba(255, 255, 255, 0.035));
}

.preview-panel {
  display: grid;
  align-content: start;
  gap: 18px;
}

.table-panel-title {
  align-items: center;
}

.table-panel-title span,
.column-editor-head span {
  color: var(--glass-text-strong);
  font-weight: 800;
}

.table-panel-title small,
.column-editor-head small {
  color: var(--glass-text-muted);
}

.table-object-list {
  display: grid;
  gap: 12px;
  margin-top: 18px;
}

.table-object-item {
  display: flex;
  justify-content: space-between;
  gap: 14px;
  align-items: center;
  padding: 14px;
  border: 1px solid rgba(255, 255, 255, 0.08);
  border-radius: 16px;
  background: rgba(255, 255, 255, 0.04);
  cursor: pointer;
  outline: none;
  transition: var(--glass-transition);
}

.table-object-item:hover,
.table-object-item:focus-visible,
.table-object-item.active {
  border-color: hsla(var(--theme-hue), 90%, 72%, 0.38);
  background: hsla(var(--theme-hue), 82%, 60%, 0.1);
  box-shadow: 0 0 24px hsla(var(--theme-hue), 80%, 62%, 0.14);
}

.table-object-item strong,
.table-object-item span {
  display: block;
  min-width: 0;
}

.table-object-item strong {
  overflow: hidden;
  color: var(--glass-text-strong);
  text-overflow: ellipsis;
  white-space: nowrap;
}

.table-object-item span {
  margin-top: 6px;
  color: var(--glass-text-muted);
  font-size: 12px;
}

.table-empty {
  display: grid;
  place-items: center;
  min-height: 320px;
  color: var(--glass-text-muted);
  text-align: center;
}

.table-empty.compact {
  min-height: 260px;
}

.table-empty strong {
  display: block;
  margin-bottom: 8px;
  color: var(--glass-text-strong);
  font-size: 20px;
}

.schema-head,
.preview-head {
  margin-bottom: 24px;
}

.schema-kicker {
  color: var(--theme-primary-light);
  font-size: 12px;
  font-weight: 800;
  letter-spacing: 0.12em;
}

.schema-head h3,
.preview-head h3 {
  margin: 8px 0;
  font-size: clamp(28px, 3.2vw, 46px);
  line-height: 1;
}

.schema-head p,
.preview-head p {
  margin: 0;
  color: var(--glass-text-muted);
}

.schema-stats,
.schema-column-tags {
  display: flex;
  flex-wrap: wrap;
  gap: 8px;
}

.schema-stats span,
.schema-column-tags em {
  padding: 6px 9px;
  color: var(--glass-text);
  font-size: 12px;
  font-style: normal;
  border: 1px solid hsla(var(--theme-hue), 80%, 72%, 0.16);
  border-radius: 999px;
  background: hsla(var(--theme-hue), 80%, 60%, 0.075);
}

.schema-section {
  display: grid;
  gap: 14px;
}

.schema-column-list {
  display: grid;
  grid-template-columns: repeat(2, minmax(0, 1fr));
  gap: 12px;
}

.schema-column-card,
.schema-mini-card {
  min-width: 0;
  padding: 14px;
  border: 1px solid rgba(255, 255, 255, 0.08);
  border-radius: 16px;
  background: rgba(255, 255, 255, 0.04);
}

.schema-column-card {
  display: grid;
  gap: 12px;
}

.schema-column-card strong,
.schema-column-card span {
  display: block;
  overflow: hidden;
  text-overflow: ellipsis;
  white-space: nowrap;
}

.schema-column-card span {
  margin-top: 6px;
  color: var(--theme-primary-light);
  font-size: 13px;
}

.schema-mini-grid {
  display: grid;
  grid-template-columns: repeat(2, minmax(0, 1fr));
  gap: 14px;
  margin-top: 14px;
}

.schema-mini-card p {
  overflow: hidden;
  margin: 12px 0 0;
  color: var(--glass-text-muted);
  font-size: 13px;
  line-height: 1.7;
  text-overflow: ellipsis;
  white-space: nowrap;
}

.schema-dialog-content {
  display: grid;
  gap: 18px;
}

.schema-management-actions {
  display: flex;
  flex-wrap: wrap;
  gap: 10px;
  padding: 14px;
  border: 1px solid hsla(var(--theme-hue), 80%, 72%, 0.14);
  border-radius: 18px;
  background:
    linear-gradient(135deg, hsla(var(--theme-hue), 80%, 60%, 0.08), rgba(255, 255, 255, 0.035));
}

.schema-management-actions .dialog-button {
  min-width: 136px;
}

.preview-table-shell {
  overflow: auto;
  max-height: min(58vh, 660px);
  border: 1px solid rgba(255, 255, 255, 0.08);
  border-radius: 18px;
  background:
    linear-gradient(135deg, rgba(255, 255, 255, 0.035), hsla(var(--theme-hue), 80%, 60%, 0.04));
}

.preview-table {
  width: 100%;
  min-width: 720px;
  color: var(--glass-text);
  font-size: 13px;
  border-spacing: 0;
}

.preview-table th,
.preview-table td {
  max-width: 260px;
  padding: 12px 14px;
  border-bottom: 1px solid rgba(255, 255, 255, 0.07);
  border-right: 1px solid rgba(255, 255, 255, 0.05);
  text-align: left;
  vertical-align: top;
}

.preview-table th {
  position: sticky;
  top: 0;
  z-index: 2;
  background:
    linear-gradient(135deg, hsla(var(--theme-hue), 80%, 24%, 0.86), rgba(7, 12, 28, 0.9));
  backdrop-filter: blur(10px);
  -webkit-backdrop-filter: blur(10px);
}

.preview-table td {
  overflow: hidden;
  line-height: 1.6;
  text-overflow: ellipsis;
  white-space: nowrap;
}

.preview-table tbody tr:hover td {
  background: hsla(var(--theme-hue), 80%, 60%, 0.065);
}

.preview-column-head {
  display: grid;
  gap: 8px;
  min-width: 150px;
}

.preview-column-head strong,
.preview-column-head span {
  overflow: hidden;
  text-overflow: ellipsis;
  white-space: nowrap;
}

.preview-column-head strong {
  color: var(--glass-text-strong);
  font-size: 13px;
}

.preview-column-head span {
  color: var(--theme-primary-light);
  font-size: 11px;
  font-weight: 600;
}

.preview-column-head :deep(.el-input__wrapper),
.preview-column-head :deep(.el-select__wrapper) {
  min-height: 30px;
  border: 1px solid hsla(var(--theme-hue), 80%, 72%, 0.16);
  border-radius: 999px;
  background: rgba(255, 255, 255, 0.06) !important;
  box-shadow: none !important;
}

.null-cell {
  color: rgba(255, 255, 255, 0.36);
  font-style: italic;
}

.preview-empty-cell {
  display: grid;
  place-items: center;
  min-height: 110px;
  color: var(--glass-text-muted);
}

.preview-more-row {
  display: flex;
  justify-content: center;
  padding-top: 4px;
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

.dialog-field :deep(.el-select__wrapper),
.dialog-field :deep(.el-input-number .el-input__wrapper) {
  min-height: 46px;
  border: 1px solid hsla(var(--theme-hue), 80%, 72%, 0.18);
  border-radius: 16px;
  background:
    linear-gradient(135deg, hsla(var(--theme-hue), 80%, 60%, 0.075), rgba(255, 255, 255, 0.055)) !important;
  box-shadow:
    inset 0 1px 0 rgba(255, 255, 255, 0.09),
    0 10px 22px rgba(0, 0, 0, 0.12) !important;
}

.compact-field :deep(.el-input-number) {
  width: 100%;
}

.create-table-form {
  display: grid;
  gap: 18px;
}

.column-editor-head {
  align-items: center;
}

.column-editor-list {
  display: grid;
  gap: 12px;
  max-height: min(48vh, 520px);
  overflow-y: auto;
  padding-right: 4px;
}

.column-editor-empty {
  display: grid;
  place-items: center;
  min-height: 180px;
  padding: 28px;
  color: var(--glass-text-muted);
  text-align: center;
  border: 1px dashed hsla(var(--theme-hue), 80%, 72%, 0.22);
  border-radius: 18px;
  background:
    radial-gradient(circle at 50% 0%, hsla(var(--theme-hue), 80%, 60%, 0.12), transparent 48%),
    rgba(255, 255, 255, 0.03);
}

.column-editor-empty strong {
  display: block;
  margin-bottom: 8px;
  color: var(--glass-text-strong);
  font-size: 18px;
}

.column-editor-empty span {
  line-height: 1.7;
}

.column-editor-row {
  display: grid;
  grid-template-columns: minmax(120px, 1.2fr) minmax(120px, 0.9fr) minmax(98px, 0.7fr) minmax(120px, 1fr) minmax(120px, 1fr);
  gap: 12px;
  align-items: end;
  padding: 14px;
  border: 1px solid rgba(255, 255, 255, 0.08);
  border-radius: 18px;
  background:
    linear-gradient(135deg, hsla(var(--theme-hue), 80%, 60%, 0.065), rgba(255, 255, 255, 0.035));
}

.column-flags {
  display: flex;
  grid-column: 1 / -2;
  flex-wrap: wrap;
  gap: 12px;
  align-items: center;
  min-height: 34px;
}

.column-remove-button {
  min-height: 34px;
  color: #fecaca;
  border: 1px solid rgba(248, 113, 113, 0.28);
  border-radius: 999px;
  background: rgba(248, 113, 113, 0.08);
  cursor: pointer;
  transition: var(--glass-transition);
}

.column-remove-button:hover {
  border-color: rgba(248, 113, 113, 0.52);
  background: rgba(248, 113, 113, 0.14);
}

.column-flags :deep(.el-checkbox) {
  --el-checkbox-text-color: var(--glass-text-muted);
  --el-checkbox-checked-text-color: var(--glass-text-strong);
  --el-checkbox-checked-bg-color: hsl(var(--theme-hue), 82%, 58%);
  --el-checkbox-checked-input-border-color: hsl(var(--theme-hue), 82%, 58%);
  --el-checkbox-input-border-color-hover: hsla(var(--theme-hue), 90%, 72%, 0.52);
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

.delete-table-form p {
  margin: 0 0 16px;
  color: var(--glass-text-muted);
  line-height: 1.7;
}

.delete-table-form strong {
  color: #fecaca;
  font-weight: 700;
}

@media (max-width: 1080px) {
  .table-manager {
    grid-template-columns: 1fr;
  }

  .schema-column-list {
    grid-template-columns: 1fr;
  }
}

@media (max-width: 820px) {
  .workbench-topbar,
  .table-workbench-header {
    align-items: flex-start;
    flex-direction: column;
  }

  .database-summary-grid,
  .schema-mini-grid {
    grid-template-columns: 1fr;
  }

  .column-editor-row {
    grid-template-columns: 1fr;
  }

  .column-flags {
    grid-column: auto;
  }
}

@media (max-width: 620px) {
  .database-workbench-page {
    padding: 14px;
  }

  .topbar-actions,
  .table-workbench-actions,
  .dialog-actions {
    flex-direction: column;
    width: 100%;
  }

  .dialog-button {
    width: 100%;
  }
}
</style>
