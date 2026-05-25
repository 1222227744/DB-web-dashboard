<script setup lang="ts">
import { computed, onMounted, ref, watch } from 'vue';
import { useRoute, useRouter } from 'vue-router';
import GlassDialog from '../components/GlassDialog.vue';
import { fetchDatabases, type UserDatabase } from '../utils/databases';
import { applyPreferences, fetchPreferences } from '../utils/preferences';
import {
  createTable,
  createTableRow,
  deleteTable,
  deleteTableRow,
  fetchDatabaseObjects,
  fetchTablePreview,
  fetchTableSchema,
  updateTableRow,
  updateTableSchema,
  type CreateTablePayload,
  type DatabaseObject,
  type MutationConfirmation,
  type TableColumnInput,
  type TableColumnSchema,
  type TableIndexInput,
  type TablePreviewData,
  type TablePreviewFilter,
  type TablePrimaryKey,
  type TableSchemaOperation,
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

type RowDraft = {
  original: Record<string, unknown>;
  values: Record<string, string>;
  isEditing: boolean;
};

type SchemaEditorMode = 'ADD_COLUMN' | 'MODIFY_COLUMN' | 'ADD_INDEX' | 'ADD_CONSTRAINT';

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
const isRowSaving = ref(false);
const tableError = ref('');
const tableNotice = ref('');
const previewError = ref('');
const rowError = ref('');
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
const rowDrafts = ref<Record<string, RowDraft>>({});
const newRowValues = ref<Record<string, string>>({});
const isNewRowVisible = ref(false);
const isDeleteRowDialogVisible = ref(false);
const deletingRow = ref<Record<string, unknown> | null>(null);
const selectedRowKeys = ref<string[]>([]);
const isBatchDeleteDialogVisible = ref(false);
const batchDeleteError = ref('');
const isBatchInsertDialogVisible = ref(false);
const batchInsertText = ref('');
const batchInsertError = ref('');
const isBatchUpdateDialogVisible = ref(false);
const batchUpdateColumnName = ref('');
const batchUpdateValue = ref('');
const batchUpdateSetNull = ref(false);
const batchUpdateError = ref('');
const sortState = ref<{ orderBy: string; order: 'ASC' | 'DESC' } | null>(null);
const visibleColumnNames = ref<string[]>([]);
const schemaEditorMode = ref<SchemaEditorMode>('ADD_COLUMN');
const schemaDraftColumn = ref<DraftColumn | null>(null);
const schemaTargetColumnName = ref('');
const schemaIndexName = ref('');
const schemaIndexUnique = ref(false);
const schemaIndexColumns = ref<string[]>([]);
const schemaConstraintName = ref('');
const schemaConstraintColumn = ref('');
const schemaConstraintValues = ref('');
const schemaActionError = ref('');
const isSchemaSaving = ref(false);

const sqlIdentifierPattern = /^[A-Za-z][A-Za-z0-9_]{0,63}$/;
const supportedTableTypes = ['INT', 'BIGINT', 'VARCHAR', 'TEXT', 'DATETIME', 'DATE', 'BOOLEAN', 'DECIMAL', 'JSON'];
const schemaEditorModeOptions: Array<{ value: SchemaEditorMode; label: string }> = [
  { value: 'ADD_COLUMN', label: '新增字段' },
  { value: 'MODIFY_COLUMN', label: '修改字段' },
  { value: 'ADD_INDEX', label: '新增索引' },
  { value: 'ADD_CONSTRAINT', label: '有限取值约束' }
];
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
const displayedPreviewColumns = computed(() => {
  if (visibleColumnNames.value.length === 0) {
    return previewColumns.value;
  }

  const visibleNames = new Set(visibleColumnNames.value);
  return previewColumns.value.filter((column) => visibleNames.has(column.name));
});
const previewRows = computed(() => tablePreview.value?.rows ?? []);
const previewOffset = computed(() => tablePreview.value?.offset ?? 0);
const previewLoadedCount = computed(() => previewOffset.value + previewRows.value.length);
const primaryKeyColumns = computed(() => previewColumns.value.filter((column) => column.key === 'PRI'));
const hasPrimaryKey = computed(() => primaryKeyColumns.value.length > 0);
const insertableColumns = computed(() => previewColumns.value.filter((column) => !column.extra.includes('auto_increment')));
const updatableColumns = computed(() => {
  return previewColumns.value.filter((column) => !column.extra.includes('auto_increment') && column.key !== 'PRI');
});
const canInsertRows = computed(() => Boolean(selectedDatabase.value && selectedTableName.value && insertableColumns.value.length > 0));
const canEditRows = computed(() => Boolean(selectedDatabase.value && selectedTableName.value && hasPrimaryKey.value && updatableColumns.value.length > 0));
const selectedRows = computed(() => {
  const selectedKeys = new Set(selectedRowKeys.value);
  return previewRows.value.filter((row, index) => selectedKeys.has(getRowKey(row, index)));
});
const deletingRowPrimaryKeyText = computed(() => {
  if (!deletingRow.value || primaryKeyColumns.value.length === 0) {
    return '';
  }

  return primaryKeyColumns.value
    .map((column) => `${column.name}=${formatCellValue(deletingRow.value?.[column.name])}`)
    .join('，');
});

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
      filters: buildPreviewFilters(),
      sort: sortState.value
    });

    const nextPreview = options.append && tablePreview.value
      ? {
          ...preview,
          rows: [...tablePreview.value.rows, ...preview.rows],
          offset: tablePreview.value.offset
        }
      : preview;

    tablePreview.value = nextPreview;
    syncColumnFilters(nextPreview);
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
  syncVisibleColumns(preview.columns);
  syncRowDrafts(preview.rows);
  syncNewRowValues(preview.columns);
  syncSelectedRows(preview.rows);
};

const resetPreviewFilters = () => {
  columnFilters.value = {};
};

const syncVisibleColumns = (columns = previewColumns.value) => {
  const names = columns.map((column) => column.name);
  visibleColumnNames.value = visibleColumnNames.value.filter((name) => names.includes(name));

  if (visibleColumnNames.value.length === 0) {
    visibleColumnNames.value = names;
  }
};

const syncRowDrafts = (rows: Array<Record<string, unknown>>) => {
  const nextDrafts: Record<string, RowDraft> = {};

  rows.forEach((row, index) => {
    const rowKey = getRowKey(row, index);
    const existing = rowDrafts.value[rowKey];
    nextDrafts[rowKey] = existing?.isEditing
      ? existing
      : {
          original: row,
          values: rowToDraftValues(row),
          isEditing: false
        };
  });

  rowDrafts.value = nextDrafts;
};

const syncSelectedRows = (rows: Array<Record<string, unknown>>) => {
  const rowKeys = new Set(rows.map((row, index) => getRowKey(row, index)));
  selectedRowKeys.value = selectedRowKeys.value.filter((rowKey) => rowKeys.has(rowKey));
};

const syncNewRowValues = (columns = previewColumns.value) => {
  const nextValues: Record<string, string> = {};

  columns.forEach((column) => {
    nextValues[column.name] = newRowValues.value[column.name] ?? '';
  });

  newRowValues.value = nextValues;
};

const applyPreviewFilter = () => {
  void loadSelectedTablePreview();
};

const loadMorePreviewRows = () => {
  void loadSelectedTablePreview({ append: true });
};

const toggleSort = (columnName: string) => {
  if (sortState.value?.orderBy !== columnName) {
    sortState.value = {
      orderBy: columnName,
      order: 'ASC'
    };
  } else if (sortState.value.order === 'ASC') {
    sortState.value = {
      orderBy: columnName,
      order: 'DESC'
    };
  } else {
    sortState.value = null;
  }

  void loadSelectedTablePreview();
};

const getSortMark = (columnName: string) => {
  if (sortState.value?.orderBy !== columnName) {
    return '排序';
  }

  return sortState.value.order === 'ASC' ? '升序' : '降序';
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

  resetSchemaEditor();
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

const isColumnInsertable = (column: TableColumnSchema) => {
  return !column.extra.includes('auto_increment');
};

const isColumnUpdatable = (column: TableColumnSchema) => {
  return !column.extra.includes('auto_increment') && column.key !== 'PRI';
};

const getRowKey = (row: Record<string, unknown>, index: number) => {
  if (primaryKeyColumns.value.length === 0) {
    return `row-${index}`;
  }

  return primaryKeyColumns.value
    .map((column) => `${column.name}:${String(row[column.name])}`)
    .join('|');
};

const rowToDraftValues = (row: Record<string, unknown>) => {
  return Object.fromEntries(previewColumns.value.map((column) => [
    column.name,
    row[column.name] === null || row[column.name] === undefined ? '' : String(row[column.name])
  ]));
};

const buildPrimaryKeyFromRow = (row: Record<string, unknown>): TablePrimaryKey => {
  return Object.fromEntries(primaryKeyColumns.value.map((column) => [column.name, row[column.name]]));
};

const buildRowPayload = (
  values: Record<string, string>,
  columns: TableColumnSchema[],
  options: {
    onlyChanged?: Record<string, unknown>;
    skipEmpty?: boolean;
  } = {}
) => {
  const payload: Record<string, unknown> = {};

  columns.forEach((column) => {
    const value = values[column.name] ?? '';
    const originalValue = options.onlyChanged?.[column.name];

    if (options.skipEmpty && value === '') {
      return;
    }

    if (options.onlyChanged && value === (originalValue === null || originalValue === undefined ? '' : String(originalValue))) {
      return;
    }

    payload[column.name] = value === '' ? null : value;
  });

  return payload;
};

const isRowEditing = (row: Record<string, unknown>, rowIndex: number) => {
  return Boolean(rowDrafts.value[getRowKey(row, rowIndex)]?.isEditing);
};

const getDraftValue = (row: Record<string, unknown>, rowIndex: number, columnName: string) => {
  const rowKey = getRowKey(row, rowIndex);
  return rowDrafts.value[rowKey]?.values[columnName] ?? '';
};

const updateDraftValue = (row: Record<string, unknown>, rowIndex: number, columnName: string, value: string) => {
  const rowKey = getRowKey(row, rowIndex);
  const draft = rowDrafts.value[rowKey];

  if (!draft) {
    return;
  }

  draft.values[columnName] = value;
};

const updateDraftInputValue = (
  row: Record<string, unknown>,
  rowIndex: number,
  columnName: string,
  value: string | number
) => {
  updateDraftValue(row, rowIndex, columnName, String(value));
};

const handleNewRowInputEnter = () => {
  void submitNewRow();
};

const handleEditRowInputEnter = (row: Record<string, unknown>, rowIndex: number) => {
  void submitEditRow(row, rowIndex);
};

const showNewRowEditor = () => {
  if (!canInsertRows.value) {
    showTableNotice('当前表没有可手动填写的字段');
    return;
  }

  rowError.value = '';
  syncNewRowValues();
  isNewRowVisible.value = true;
};

const openBatchInsertDialog = () => {
  if (!canInsertRows.value) {
    showTableNotice('当前表没有可手动填写的字段');
    return;
  }

  batchInsertText.value = '';
  batchInsertError.value = '';
  isBatchInsertDialogVisible.value = true;
};

const submitBatchInsert = async () => {
  if (!selectedDatabase.value || !selectedTableName.value) {
    return;
  }

  batchInsertError.value = '';
  let rows: Array<Record<string, unknown>>;

  try {
    const parsed = JSON.parse(batchInsertText.value);
    rows = Array.isArray(parsed) ? parsed : [];
  } catch {
    batchInsertError.value = '请输入合法 JSON 数组';
    return;
  }

  if (rows.length < 1) {
    batchInsertError.value = '请至少填写一行数据';
    return;
  }

  if (!rows.every((row) => row && typeof row === 'object' && !Array.isArray(row))) {
    batchInsertError.value = 'JSON 数组中的每一项都必须是对象';
    return;
  }

  isRowSaving.value = true;

  try {
    await createTableRow(
      selectedDatabase.value.id,
      selectedTableName.value,
      rows,
      {
        confirmed: true,
        confirmText: selectedTableName.value
      }
    );
    showTableNotice(`已批量新增 ${rows.length} 行`);
    isBatchInsertDialogVisible.value = false;
    await loadSelectedTablePreview();
  } catch (error) {
    batchInsertError.value = getErrorMessage(error, '批量新增失败');
  } finally {
    isRowSaving.value = false;
  }
};

const cancelNewRow = () => {
  rowError.value = '';
  isNewRowVisible.value = false;
  syncNewRowValues();
};

const startEditRow = (row: Record<string, unknown>, rowIndex: number) => {
  if (!hasPrimaryKey.value) {
    showTableNotice('无主键表暂不支持行内编辑');
    return;
  }

  if (updatableColumns.value.length === 0) {
    showTableNotice('当前表没有可修改字段');
    return;
  }

  const rowKey = getRowKey(row, rowIndex);
  rowDrafts.value[rowKey] = {
    original: row,
    values: rowToDraftValues(row),
    isEditing: true
  };
};

const cancelEditRow = (row: Record<string, unknown>, rowIndex: number) => {
  const rowKey = getRowKey(row, rowIndex);
  rowDrafts.value[rowKey] = {
    original: row,
    values: rowToDraftValues(row),
    isEditing: false
  };
  rowError.value = '';
};

const submitEditRow = async (row: Record<string, unknown>, rowIndex: number) => {
  if (!selectedDatabase.value || !selectedTableName.value) {
    return;
  }

  const rowKey = getRowKey(row, rowIndex);
  const draft = rowDrafts.value[rowKey];

  if (!draft) {
    return;
  }

  const payload = buildRowPayload(draft.values, updatableColumns.value, {
    onlyChanged: draft.original
  });

  if (Object.keys(payload).length === 0) {
    cancelEditRow(row, rowIndex);
    return;
  }

  isRowSaving.value = true;
  rowError.value = '';

  try {
    await updateTableRow(selectedDatabase.value.id, selectedTableName.value, buildPrimaryKeyFromRow(draft.original), payload);
    showTableNotice('行已更新');
    await loadSelectedTablePreview();
  } catch (error) {
    rowError.value = getErrorMessage(error, '行更新失败');
  } finally {
    isRowSaving.value = false;
  }
};

const submitNewRow = async () => {
  if (!selectedDatabase.value || !selectedTableName.value) {
    return;
  }

  const payload = buildRowPayload(newRowValues.value, insertableColumns.value, {
    skipEmpty: true
  });

  if (Object.keys(payload).length === 0) {
    rowError.value = '请至少填写一个字段';
    return;
  }

  isRowSaving.value = true;
  rowError.value = '';

  try {
    await createTableRow(selectedDatabase.value.id, selectedTableName.value, payload);
    showTableNotice('行已新增');
    isNewRowVisible.value = false;
    syncNewRowValues();
    await loadSelectedTablePreview();
  } catch (error) {
    rowError.value = getErrorMessage(error, '新增行失败');
  } finally {
    isRowSaving.value = false;
  }
};

const removeRow = async (row: Record<string, unknown>) => {
  if (!selectedDatabase.value || !selectedTableName.value) {
    return;
  }

  if (!hasPrimaryKey.value) {
    showTableNotice('无主键表暂不支持删除行');
    return;
  }

  isRowSaving.value = true;
  rowError.value = '';

  try {
    await deleteTableRow(selectedDatabase.value.id, selectedTableName.value, buildPrimaryKeyFromRow(row));
    showTableNotice('行已删除');
    await loadSelectedTablePreview();
  } catch (error) {
    rowError.value = getErrorMessage(error, '删除行失败');
  } finally {
    isRowSaving.value = false;
  }
};

const openDeleteRowDialog = (row: Record<string, unknown>) => {
  if (!hasPrimaryKey.value) {
    showTableNotice('无主键表暂不支持删除行');
    return;
  }

  deletingRow.value = row;
  rowError.value = '';
  isDeleteRowDialogVisible.value = true;
};

const isRowSelected = (row: Record<string, unknown>, rowIndex: number) => {
  return selectedRowKeys.value.includes(getRowKey(row, rowIndex));
};

const toggleRowSelection = (row: Record<string, unknown>, rowIndex: number) => {
  if (!hasPrimaryKey.value) {
    return;
  }

  const rowKey = getRowKey(row, rowIndex);
  selectedRowKeys.value = selectedRowKeys.value.includes(rowKey)
    ? selectedRowKeys.value.filter((key) => key !== rowKey)
    : [...selectedRowKeys.value, rowKey];
};

const toggleAllRowsSelection = () => {
  if (!hasPrimaryKey.value || previewRows.value.length === 0) {
    return;
  }

  if (selectedRowKeys.value.length === previewRows.value.length) {
    selectedRowKeys.value = [];
    return;
  }

  selectedRowKeys.value = previewRows.value.map((row, index) => getRowKey(row, index));
};

const removeSelectedRows = async () => {
  if (!selectedDatabase.value || !selectedTableName.value || selectedRows.value.length === 0) {
    return;
  }

  isRowSaving.value = true;
  rowError.value = '';

  try {
    await deleteTableRow(
      selectedDatabase.value.id,
      selectedTableName.value,
      selectedRows.value.map((row) => buildPrimaryKeyFromRow(row)),
      {
        confirmed: true,
        confirmText: selectedTableName.value
      }
    );
    showTableNotice(`已删除 ${selectedRows.value.length} 行`);
    selectedRowKeys.value = [];
    await loadSelectedTablePreview();
  } catch (error) {
    const message = getErrorMessage(error, '批量删除失败');
    rowError.value = message;
    batchDeleteError.value = message;
  } finally {
    isRowSaving.value = false;
  }
};

const openBatchDeleteDialog = () => {
  if (!hasPrimaryKey.value || selectedRows.value.length === 0) {
    showTableNotice('请先选择可删除的行');
    return;
  }

  rowError.value = '';
  batchDeleteError.value = '';
  isBatchDeleteDialogVisible.value = true;
};

const confirmBatchDelete = async () => {
  await removeSelectedRows();

  if (!batchDeleteError.value && !rowError.value) {
    isBatchDeleteDialogVisible.value = false;
  }
};

const openBatchUpdateDialog = () => {
  if (!canEditRows.value || selectedRows.value.length === 0) {
    showTableNotice('请先选择可修改的行');
    return;
  }

  batchUpdateColumnName.value = updatableColumns.value[0]?.name ?? '';
  batchUpdateValue.value = '';
  batchUpdateSetNull.value = false;
  batchUpdateError.value = '';
  isBatchUpdateDialogVisible.value = true;
};

const submitBatchUpdate = async () => {
  if (!selectedDatabase.value || !selectedTableName.value || selectedRows.value.length === 0) {
    return;
  }

  batchUpdateError.value = '';

  if (!batchUpdateColumnName.value) {
    batchUpdateError.value = '请选择要修改的字段';
    return;
  }

  isRowSaving.value = true;

  try {
    await updateTableRow(
      selectedDatabase.value.id,
      selectedTableName.value,
      selectedRows.value.map((row) => buildPrimaryKeyFromRow(row)),
      {
        [batchUpdateColumnName.value]: batchUpdateSetNull.value ? null : batchUpdateValue.value
      },
      {
        confirmed: true,
        confirmText: selectedTableName.value
      }
    );
    showTableNotice(`已批量更新 ${selectedRows.value.length} 行`);
    selectedRowKeys.value = [];
    isBatchUpdateDialogVisible.value = false;
    await loadSelectedTablePreview();
  } catch (error) {
    batchUpdateError.value = getErrorMessage(error, '批量更新失败');
  } finally {
    isRowSaving.value = false;
  }
};

const confirmDeleteRow = async () => {
  if (!deletingRow.value) {
    return;
  }

  await removeRow(deletingRow.value);

  if (!rowError.value) {
    deletingRow.value = null;
    isDeleteRowDialogVisible.value = false;
  }
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

const resetSchemaEditor = () => {
  schemaEditorMode.value = 'ADD_COLUMN';
  schemaDraftColumn.value = createDraftColumn();
  schemaTargetColumnName.value = '';
  schemaIndexName.value = '';
  schemaIndexUnique.value = false;
  schemaIndexColumns.value = [];
  schemaConstraintName.value = '';
  schemaConstraintColumn.value = '';
  schemaConstraintValues.value = '';
  schemaActionError.value = '';
};

const loadColumnIntoSchemaDraft = () => {
  const column = selectedTableSchema.value?.columns.find((item) => item.name === schemaTargetColumnName.value);

  if (!column) {
    schemaDraftColumn.value = createDraftColumn();
    return;
  }

  schemaDraftColumn.value = createDraftColumn({
    name: column.name,
    type: column.dataType === 'TINYINT' && column.columnType.toLowerCase() === 'tinyint(1)' ? 'BOOLEAN' : column.dataType,
    length: column.length,
    nullable: column.nullable,
    primaryKey: column.key === 'PRI',
    autoIncrement: column.extra.includes('auto_increment'),
    defaultValue: column.defaultValue ?? '',
    comment: column.comment
  });
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

const buildSingleColumnInput = (
  draft: DraftColumn,
  setError: (message: string) => void,
  options: { allowPrimaryKey?: boolean } = {}
): TableColumnInput | null => {
  const name = draft.name.trim();

  if (!name) {
    setError('字段名不能为空');
    return null;
  }

  if (!sqlIdentifierPattern.test(name)) {
    setError(`${name} 不是合法字段名`);
    return null;
  }

  if (!draft.type) {
    setError(`${name} 请选择字段类型`);
    return null;
  }

  if (!supportedTableTypes.includes(draft.type)) {
    setError(`${name} 的字段类型暂不支持`);
    return null;
  }

  const column: TableColumnInput = {
    name,
    type: draft.type,
    nullable: options.allowPrimaryKey && draft.primaryKey ? false : draft.nullable,
    autoIncrement: draft.autoIncrement || undefined
  };

  if (draft.type === 'VARCHAR') {
    const length = Number(draft.length ?? 0);

    if (!Number.isInteger(length) || length < 1 || length > 16383) {
      setError(`${name} 的 VARCHAR 长度需为 1 到 16383`);
      return null;
    }

    column.length = length;
  }

  const defaultValue = draft.defaultValue.trim();

  if (defaultValue) {
    const previousError = tableDialogError.value;
    tableDialogError.value = '';
    const normalizedDefaultValue = normalizeDraftDefaultValue(defaultValue, draft.type);

    if (normalizedDefaultValue === undefined) {
      setError(tableDialogError.value || `${name} 的默认值不合法`);
      tableDialogError.value = previousError;
      return null;
    }

    tableDialogError.value = previousError;
    column.defaultValue = normalizedDefaultValue;
  }

  if (draft.comment.trim()) {
    column.comment = draft.comment.trim();
  }

  return column;
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
    const column = buildSingleColumnInput(draft, (message) => {
      tableDialogError.value = message;
    }, {
      allowPrimaryKey: true
    });

    if (!column) {
      return null;
    }

    const name = column.name;

    if (names.has(name)) {
      tableDialogError.value = `字段 ${name} 重复`;
      return null;
    }

    names.add(name);

    if (draft.primaryKey) {
      primaryColumns.push(name);
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

const submitSchemaOperation = async () => {
  if (!selectedDatabase.value || !selectedTableName.value) {
    return;
  }

  const operation = buildSchemaOperation();

  if (!operation) {
    return;
  }

  const needsConfirmation = ['MODIFY_COLUMN', 'DROP_COLUMN', 'DROP_INDEX', 'DROP_CONSTRAINT'].includes(operation.action);
  isSchemaSaving.value = true;
  schemaActionError.value = '';

  try {
    selectedTableSchema.value = await updateTableSchema(
      selectedDatabase.value.id,
      selectedTableName.value,
      [operation],
      needsConfirmation
        ? {
            confirmed: true,
            confirmText: selectedTableName.value
          }
        : undefined
    );
    showTableNotice('表结构已更新');
    resetSchemaEditor();
    await loadSelectedTablePreview();
  } catch (error) {
    schemaActionError.value = getErrorMessage(error, '表结构更新失败');
  } finally {
    isSchemaSaving.value = false;
  }
};

const buildSchemaOperation = (): TableSchemaOperation | null => {
  schemaActionError.value = '';

  if (schemaEditorMode.value === 'ADD_COLUMN' || schemaEditorMode.value === 'MODIFY_COLUMN') {
    const draft = schemaDraftColumn.value;

    if (!draft) {
      schemaActionError.value = '请填写字段信息';
      return null;
    }

    const column = buildSingleColumnInput(draft, (message) => {
      schemaActionError.value = message;
    });

    if (!column) {
      return null;
    }

    if (schemaEditorMode.value === 'ADD_COLUMN') {
      return {
        action: 'ADD_COLUMN',
        column
      };
    }

    if (!schemaTargetColumnName.value) {
      schemaActionError.value = '请选择要修改的字段';
      return null;
    }

    return {
      action: 'MODIFY_COLUMN',
      oldName: schemaTargetColumnName.value,
      column
    };
  }

  if (schemaEditorMode.value === 'ADD_INDEX') {
    const name = schemaIndexName.value.trim();

    if (!sqlIdentifierPattern.test(name)) {
      schemaActionError.value = '索引名需以英文字母开头，只能包含英文字母、数字和下划线';
      return null;
    }

    if (schemaIndexColumns.value.length === 0) {
      schemaActionError.value = '请至少选择一个索引字段';
      return null;
    }

    const index: TableIndexInput = {
      name,
      unique: schemaIndexUnique.value,
      columns: schemaIndexColumns.value.map((name) => ({
        name,
        order: 'ASC'
      }))
    };

    return {
      action: 'ADD_INDEX',
      index
    };
  }

  const name = schemaConstraintName.value.trim();

  if (!sqlIdentifierPattern.test(name)) {
    schemaActionError.value = '约束名需以英文字母开头，只能包含英文字母、数字和下划线';
    return null;
  }

  if (!schemaConstraintColumn.value) {
    schemaActionError.value = '请选择有限取值字段';
    return null;
  }

  const values = schemaConstraintValues.value
    .split(',')
    .map((value) => value.trim())
    .filter(Boolean);

  if (values.length === 0) {
    schemaActionError.value = '请用英文逗号分隔填写允许值';
    return null;
  }

  return {
    action: 'ADD_CONSTRAINT',
    constraint: {
      name,
      type: 'CHECK_IN',
      columns: [schemaConstraintColumn.value],
      column: schemaConstraintColumn.value,
      values
    }
  };
};

const dropColumnFromSchema = async (name: string) => {
  await submitDirectSchemaOperation({
    action: 'DROP_COLUMN',
    name
  });
};

const dropIndexFromSchema = async (name: string) => {
  await submitDirectSchemaOperation({
    action: 'DROP_INDEX',
    name
  });
};

const dropConstraintFromSchema = async (name: string) => {
  await submitDirectSchemaOperation({
    action: 'DROP_CONSTRAINT',
    name
  });
};

const submitDirectSchemaOperation = async (operation: TableSchemaOperation) => {
  if (!selectedDatabase.value || !selectedTableName.value) {
    return;
  }

  isSchemaSaving.value = true;
  schemaActionError.value = '';

  try {
    selectedTableSchema.value = await updateTableSchema(
      selectedDatabase.value.id,
      selectedTableName.value,
      [operation],
      {
        confirmed: true,
        confirmText: selectedTableName.value
      } as MutationConfirmation
    );
    showTableNotice('表结构已更新');
    await loadSelectedTablePreview();
  } catch (error) {
    schemaActionError.value = getErrorMessage(error, '表结构更新失败');
  } finally {
    isSchemaSaving.value = false;
  }
};

const selectTable = (table: DatabaseObject) => {
  resetPreviewFilters();
  rowError.value = '';
  isNewRowVisible.value = false;
  selectedRowKeys.value = [];
  sortState.value = null;
  visibleColumnNames.value = [];

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

const selectSchemaEditorMode = (mode: SchemaEditorMode) => {
  schemaEditorMode.value = mode;
  schemaActionError.value = '';

  if (mode === 'MODIFY_COLUMN') {
    loadColumnIntoSchemaDraft();
  }
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
                    class="dialog-button primary"
                    type="button"
                    :disabled="!canInsertRows || isRowSaving"
                    @click="showNewRowEditor"
                  >
                    新增行
                  </button>
                  <button
                    class="dialog-button"
                    type="button"
                    :disabled="!canInsertRows || isRowSaving"
                    @click="openBatchInsertDialog"
                  >
                    批量新增
                  </button>
                  <button
                    class="dialog-button"
                    type="button"
                    :disabled="isSchemaLoading"
                    @click="openSchemaDialog"
                  >
                    结构管理
                  </button>
                  <button
                    class="dialog-button danger"
                    type="button"
                    :disabled="selectedRows.length === 0 || isRowSaving"
                    @click="openBatchUpdateDialog"
                  >
                    批量修改 {{ selectedRows.length || '' }}
                  </button>
                  <button
                    class="dialog-button danger"
                    type="button"
                    :disabled="selectedRows.length === 0 || isRowSaving"
                    @click="openBatchDeleteDialog"
                  >
                    批量删除 {{ selectedRows.length || '' }}
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

              <template v-if="previewError">
                <p class="database-feedback error">
                  {{ previewError }}
                </p>
              </template>

              <template v-else>
                <div
                  v-if="!hasPrimaryKey && previewColumns.length > 0"
                  class="row-mode-notice"
                >
                  <span>无主键表</span>
                  <p>当前版本允许新增和筛选浏览；因为缺少稳定行定位，行级编辑和删除暂时锁定。</p>
                </div>

                <p
                  v-if="rowError"
                  class="database-feedback error"
                >
                  {{ rowError }}
                </p>

                <div
                  v-if="previewColumns.length > 0"
                  class="preview-toolbar"
                >
                  <span>显示列</span>
                  <el-select
                    v-model="visibleColumnNames"
                    multiple
                    collapse-tags
                    collapse-tags-tooltip
                    placeholder="选择显示列"
                    size="small"
                  >
                    <el-option
                      v-for="column in previewColumns"
                      :key="column.name"
                      :label="column.name"
                      :value="column.name"
                    />
                  </el-select>
                </div>

                <div
                  v-if="previewColumns.length === 0"
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
                        <th class="preview-action-column">
                          <div class="preview-action-head">
                            <span>操作</span>
                            <input
                              type="checkbox"
                              :checked="selectedRowKeys.length === previewRows.length && previewRows.length > 0"
                              :disabled="!hasPrimaryKey || previewRows.length === 0"
                              @change="toggleAllRowsSelection"
                            />
                          </div>
                        </th>
                        <th
                          v-for="column in displayedPreviewColumns"
                          :key="column.name"
                        >
                          <div class="preview-column-head">
                            <button
                              class="sort-button"
                              type="button"
                              @click="toggleSort(column.name)"
                            >
                              <strong>{{ column.name }}</strong>
                              <em>{{ getSortMark(column.name) }}</em>
                            </button>
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
                      <tr
                        v-if="isNewRowVisible"
                        class="new-row-line"
                      >
                        <td class="preview-action-column row-action-cell">
                          <div class="row-actions">
                            <button
                              class="row-action-button primary"
                              type="button"
                              :disabled="isRowSaving"
                              @click="submitNewRow"
                            >
                              保存新增
                            </button>
                            <button
                              class="row-action-button"
                              type="button"
                              :disabled="isRowSaving"
                              @click="cancelNewRow"
                            >
                              取消
                            </button>
                          </div>
                        </td>
                        <td
                          v-for="column in displayedPreviewColumns"
                          :key="column.name"
                        >
                          <el-input
                            v-if="isColumnInsertable(column)"
                            v-model="newRowValues[column.name]"
                            class="cell-editor"
                            size="small"
                            placeholder=""
                            @keyup.enter="handleNewRowInputEnter"
                          />
                          <span
                            v-else
                            class="readonly-cell"
                          >
                            自动生成
                          </span>
                        </td>
                      </tr>

                      <tr v-if="previewRows.length === 0 && !isNewRowVisible">
                        <td :colspan="displayedPreviewColumns.length + 1">
                          <div class="preview-empty-cell">暂无匹配数据</div>
                        </td>
                      </tr>
                      <tr
                        v-for="(row, rowIndex) in previewRows"
                        :key="getRowKey(row, rowIndex)"
                        :class="{ 'is-editing-row': isRowEditing(row, rowIndex) }"
                      >
                        <td class="preview-action-column row-action-cell">
                          <div
                            v-if="isRowEditing(row, rowIndex)"
                            class="row-actions"
                          >
                            <input
                              type="checkbox"
                              :checked="isRowSelected(row, rowIndex)"
                              :disabled="!hasPrimaryKey"
                              @change="toggleRowSelection(row, rowIndex)"
                            />
                            <button
                              class="row-action-button primary"
                              type="button"
                              :disabled="isRowSaving"
                              @click="submitEditRow(row, rowIndex)"
                            >
                              更新
                            </button>
                            <button
                              class="row-action-button"
                              type="button"
                              :disabled="isRowSaving"
                              @click="cancelEditRow(row, rowIndex)"
                            >
                              撤销
                            </button>
                          </div>
                          <div
                            v-else
                            class="row-actions"
                          >
                            <input
                              type="checkbox"
                              :checked="isRowSelected(row, rowIndex)"
                              :disabled="!hasPrimaryKey"
                              @change="toggleRowSelection(row, rowIndex)"
                            />
                            <button
                              class="row-action-button"
                              type="button"
                              :disabled="!canEditRows || isRowSaving"
                              @click="startEditRow(row, rowIndex)"
                            >
                              编辑
                            </button>
                            <button
                              class="row-action-button danger"
                              type="button"
                              :disabled="!hasPrimaryKey || isRowSaving"
                              @click="openDeleteRowDialog(row)"
                            >
                              删除
                            </button>
                          </div>
                        </td>
                        <td
                          v-for="column in displayedPreviewColumns"
                          :key="column.name"
                        >
                          <el-input
                            v-if="isRowEditing(row, rowIndex) && isColumnUpdatable(column)"
                            class="cell-editor"
                            size="small"
                            :model-value="getDraftValue(row, rowIndex, column.name)"
                            placeholder=""
                            @update:model-value="updateDraftInputValue(row, rowIndex, column.name, $event)"
                            @keyup.enter="handleEditRowInputEnter(row, rowIndex)"
                          />
                          <span
                            v-else
                            :class="{ 'null-cell': row[column.name] === null || row[column.name] === undefined }"
                          >
                            {{ formatCellValue(row[column.name]) }}
                          </span>
                          <em
                            v-if="isRowEditing(row, rowIndex) && !isColumnUpdatable(column)"
                            class="cell-lock-tip"
                          >
                            只读定位
                          </em>
                        </td>
                      </tr>
                    </tbody>
                  </table>
                </div>
              </template>

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
          <span>主键可选；无主键表支持浏览和新增</span>
          <span>VARCHAR 需要填写长度</span>
          <span>创建后可进入结构管理继续调整</span>
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

        <div class="schema-editor-panel">
          <div class="schema-editor-tabs">
            <button
              v-for="mode in schemaEditorModeOptions"
              :key="mode.value"
              class="schema-mode-button"
              :class="{ active: schemaEditorMode === mode.value }"
              type="button"
              @click="selectSchemaEditorMode(mode.value)"
            >
              {{ mode.label }}
            </button>
          </div>

          <div
            v-if="schemaEditorMode === 'ADD_COLUMN' || schemaEditorMode === 'MODIFY_COLUMN'"
            class="schema-editor-form"
          >
            <label
              v-if="schemaEditorMode === 'MODIFY_COLUMN'"
              class="dialog-field"
            >
              <span>目标字段</span>
              <el-select
                v-model="schemaTargetColumnName"
                placeholder="选择字段"
                @change="loadColumnIntoSchemaDraft"
              >
                <el-option
                  v-for="column in selectedTableSchema.columns"
                  :key="column.name"
                  :label="column.name"
                  :value="column.name"
                />
              </el-select>
            </label>
            <template v-if="schemaDraftColumn">
              <label class="dialog-field">
                <span>字段名</span>
                <el-input
                  v-model="schemaDraftColumn.name"
                  maxlength="64"
                />
              </label>
              <label class="dialog-field">
                <span>类型</span>
                <el-select
                  v-model="schemaDraftColumn.type"
                  placeholder="选择类型"
                  @change="applyColumnTypeDefaults(schemaDraftColumn)"
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
                  v-model="schemaDraftColumn.length"
                  :disabled="schemaDraftColumn.type !== 'VARCHAR'"
                  :min="1"
                  :max="16383"
                  controls-position="right"
                />
              </label>
              <label class="dialog-field">
                <span>默认值</span>
                <el-input
                  v-model="schemaDraftColumn.defaultValue"
                  placeholder="可留空"
                />
              </label>
              <label class="dialog-field">
                <span>备注</span>
                <el-input
                  v-model="schemaDraftColumn.comment"
                  maxlength="255"
                  placeholder="可留空"
                />
              </label>
              <div class="column-flags schema-flags">
                <el-checkbox v-model="schemaDraftColumn.nullable">可空</el-checkbox>
                <el-checkbox
                  v-model="schemaDraftColumn.autoIncrement"
                  :disabled="schemaDraftColumn.type !== 'INT' && schemaDraftColumn.type !== 'BIGINT'"
                  @change="applyColumnTypeDefaults(schemaDraftColumn)"
                >
                  自增
                </el-checkbox>
              </div>
            </template>
          </div>

          <div
            v-else-if="schemaEditorMode === 'ADD_INDEX'"
            class="schema-editor-form"
          >
            <label class="dialog-field">
              <span>索引名</span>
              <el-input v-model="schemaIndexName" maxlength="64" />
            </label>
            <label class="dialog-field">
              <span>索引字段</span>
              <el-select
                v-model="schemaIndexColumns"
                multiple
                placeholder="选择字段"
              >
                <el-option
                  v-for="column in selectedTableSchema.columns"
                  :key="column.name"
                  :label="column.name"
                  :value="column.name"
                />
              </el-select>
            </label>
            <div class="column-flags schema-flags">
              <el-checkbox v-model="schemaIndexUnique">唯一索引</el-checkbox>
            </div>
          </div>

          <div
            v-else
            class="schema-editor-form"
          >
            <label class="dialog-field">
              <span>约束名</span>
              <el-input v-model="schemaConstraintName" maxlength="64" />
            </label>
            <label class="dialog-field">
              <span>字段</span>
              <el-select
                v-model="schemaConstraintColumn"
                placeholder="选择字段"
              >
                <el-option
                  v-for="column in selectedTableSchema.columns"
                  :key="column.name"
                  :label="column.name"
                  :value="column.name"
                />
              </el-select>
            </label>
            <label class="dialog-field schema-wide-field">
              <span>允许值</span>
              <el-input
                v-model="schemaConstraintValues"
                placeholder="例如：男,女"
              />
            </label>
          </div>

          <p
            v-if="schemaActionError"
            class="dialog-error"
          >
            {{ schemaActionError }}
          </p>

          <div class="schema-editor-actions">
            <button
              class="dialog-button primary"
              type="button"
              :disabled="isSchemaSaving"
              @click="submitSchemaOperation"
            >
              {{ isSchemaSaving ? '保存中…' : '应用结构变更' }}
            </button>
          </div>
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
              <button
                class="database-text-button danger"
                type="button"
                :disabled="isSchemaSaving || selectedTableSchema.columns.length <= 1"
                @click="dropColumnFromSchema(column.name)"
              >
                删除字段
              </button>
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
              <button
                v-if="index.name !== 'PRIMARY'"
                class="database-text-button danger inline-action"
                type="button"
                :disabled="isSchemaSaving"
                @click="dropIndexFromSchema(index.name)"
              >
                删除
              </button>
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
              <span v-if="constraint.expression"> · {{ constraint.expression }}</span>
              <button
                class="database-text-button danger inline-action"
                type="button"
                :disabled="isSchemaSaving"
                @click="dropConstraintFromSchema(constraint.name)"
              >
                删除
              </button>
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
      v-model="isBatchInsertDialogVisible"
      label="ROWS"
      title="批量新增行"
      :description="selectedTableName ? `向 ${selectedTableName} 一次写入多行数据` : '批量写入多行数据'"
      width="min(94vw, 760px)"
      hide-header
    >
      <div class="batch-row-form">
        <div class="batch-row-hint">
          <span>JSON ARRAY</span>
          <p>请输入对象数组，字段名需要与表字段一致；不填写的字段会交给数据库默认值或空值规则处理。</p>
        </div>

        <label class="dialog-field">
          <span>数据内容</span>
          <el-input
            v-model="batchInsertText"
            type="textarea"
            :rows="10"
            resize="none"
            placeholder='例如：[{"name":"Alice","age":18},{"name":"Bob","age":20}]'
          />
        </label>

        <div class="batch-row-meta">
          <span>可写字段：{{ insertableColumns.map((column) => column.name).join('、') || '无' }}</span>
          <span>超过 1 行会携带显式确认信息，防止误批量写入。</span>
        </div>

        <p
          v-if="batchInsertError"
          class="dialog-error"
        >
          {{ batchInsertError }}
        </p>
      </div>

      <template #footer>
        <div class="dialog-actions">
          <button
            class="dialog-button ghost"
            type="button"
            :disabled="isRowSaving"
            @click="isBatchInsertDialogVisible = false"
          >
            取消
          </button>
          <button
            class="dialog-button primary"
            type="button"
            :disabled="isRowSaving"
            @click="submitBatchInsert"
          >
            {{ isRowSaving ? '写入中…' : '批量新增' }}
          </button>
        </div>
      </template>
    </GlassDialog>

    <GlassDialog
      v-model="isBatchUpdateDialogVisible"
      label="ROWS"
      title="批量修改行"
      :description="selectedTableName ? `修改 ${selectedTableName} 中已选的 ${selectedRows.length} 行` : '批量修改已选行'"
      width="min(94vw, 620px)"
      hide-header
    >
      <div class="batch-row-form">
        <div class="batch-row-hint">
          <span>{{ selectedRows.length }} ROWS</span>
          <p>当前批量修改只支持一次修改一个字段；需要先勾选行，再确认提交。</p>
        </div>

        <label class="dialog-field">
          <span>目标字段</span>
          <el-select
            v-model="batchUpdateColumnName"
            placeholder="选择要修改的字段"
          >
            <el-option
              v-for="column in updatableColumns"
              :key="column.name"
              :label="`${column.name} · ${column.columnType}`"
              :value="column.name"
            />
          </el-select>
        </label>

        <label class="dialog-field">
          <span>新值</span>
          <el-input
            v-model="batchUpdateValue"
            :disabled="batchUpdateSetNull"
            placeholder="留空表示写入空字符串；勾选下方选项才会设为 NULL"
            @keyup.enter="submitBatchUpdate"
          />
        </label>

        <div class="column-flags batch-null-toggle">
          <el-checkbox v-model="batchUpdateSetNull">
            将该字段设为 NULL
          </el-checkbox>
        </div>

        <p
          v-if="batchUpdateError"
          class="dialog-error"
        >
          {{ batchUpdateError }}
        </p>
      </div>

      <template #footer>
        <div class="dialog-actions">
          <button
            class="dialog-button ghost"
            type="button"
            :disabled="isRowSaving"
            @click="isBatchUpdateDialogVisible = false"
          >
            取消
          </button>
          <button
            class="dialog-button primary"
            type="button"
            :disabled="isRowSaving || selectedRows.length === 0"
            @click="submitBatchUpdate"
          >
            {{ isRowSaving ? '修改中…' : '确认批量修改' }}
          </button>
        </div>
      </template>
    </GlassDialog>

    <GlassDialog
      v-model="isBatchDeleteDialogVisible"
      label="ROWS"
      title="批量删除行"
      :description="selectedTableName ? `将从 ${selectedTableName} 删除 ${selectedRows.length} 行` : '批量删除已选行'"
      width="min(94vw, 520px)"
      hide-header
    >
      <div class="delete-table-form">
        <p>
          这次会删除已勾选的
          <strong>{{ selectedRows.length }}</strong>
          行数据。服务端会使用主键列表定位，并要求表名确认。
        </p>
        <div class="batch-row-meta">
          <span>确认文本：{{ selectedTableName }}</span>
          <span>删除后当前版本无法恢复</span>
        </div>
        <p
          v-if="batchDeleteError"
          class="dialog-error"
        >
          {{ batchDeleteError }}
        </p>
      </div>

      <template #footer>
        <div class="dialog-actions">
          <button
            class="dialog-button ghost"
            type="button"
            :disabled="isRowSaving"
            @click="isBatchDeleteDialogVisible = false"
          >
            取消
          </button>
          <button
            class="dialog-button danger"
            type="button"
            :disabled="isRowSaving || selectedRows.length === 0"
            @click="confirmBatchDelete"
          >
            {{ isRowSaving ? '删除中…' : '确认批量删除' }}
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

    <GlassDialog
      v-model="isDeleteRowDialogVisible"
      title="删除行数据"
      width="440px"
    >
      <div class="delete-table-form">
        <p>
          即将删除当前行。定位主键：
          <strong>{{ deletingRowPrimaryKeyText || '未识别' }}</strong>
        </p>
        <p
          v-if="rowError"
          class="dialog-error"
        >
          {{ rowError }}
        </p>
      </div>

      <template #footer>
        <div class="dialog-actions">
          <button
            class="dialog-button ghost"
            type="button"
            :disabled="isRowSaving"
            @click="isDeleteRowDialogVisible = false"
          >
            取消
          </button>
          <button
            class="dialog-button danger"
            type="button"
            :disabled="isRowSaving"
            @click="confirmDeleteRow"
          >
            {{ isRowSaving ? '删除中…' : '确认删除' }}
          </button>
        </div>
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

.schema-editor-panel {
  display: grid;
  gap: 14px;
  padding: 14px;
  border: 1px solid hsla(var(--theme-hue), 80%, 72%, 0.14);
  border-radius: 18px;
  background:
    linear-gradient(135deg, hsla(var(--theme-hue), 80%, 60%, 0.08), rgba(255, 255, 255, 0.035));
}

.schema-editor-tabs,
.schema-editor-actions {
  display: flex;
  flex-wrap: wrap;
  gap: 10px;
}

.schema-mode-button {
  min-height: 34px;
  padding: 0 12px;
  color: var(--glass-text-muted);
  border: 1px solid hsla(var(--theme-hue), 80%, 72%, 0.14);
  border-radius: 999px;
  background: rgba(255, 255, 255, 0.04);
  cursor: pointer;
  transition: var(--glass-transition);
}

.schema-mode-button.active,
.schema-mode-button:hover {
  color: var(--glass-text-strong);
  border-color: hsla(var(--theme-hue), 90%, 72%, 0.36);
  background: hsla(var(--theme-hue), 80%, 60%, 0.12);
}

.schema-editor-form {
  display: grid;
  grid-template-columns: repeat(3, minmax(0, 1fr));
  gap: 12px;
  align-items: end;
}

.schema-wide-field,
.schema-flags {
  grid-column: span 2;
}

.inline-action {
  margin-left: 8px;
}

.preview-toolbar {
  display: flex;
  flex-wrap: wrap;
  gap: 10px;
  align-items: center;
  padding: 12px 14px;
  border: 1px solid hsla(var(--theme-hue), 80%, 72%, 0.14);
  border-radius: 16px;
  background: rgba(255, 255, 255, 0.04);
}

.preview-toolbar span {
  color: var(--glass-text-muted);
  font-size: 13px;
  font-weight: 700;
}

.preview-toolbar :deep(.el-select) {
  min-width: min(100%, 320px);
}

.row-mode-notice {
  display: flex;
  gap: 12px;
  align-items: center;
  padding: 12px 14px;
  color: var(--glass-text-muted);
  border: 1px solid hsla(var(--theme-hue), 80%, 72%, 0.16);
  border-radius: 16px;
  background:
    radial-gradient(circle at 0% 50%, hsla(var(--theme-hue), 82%, 60%, 0.14), transparent 38%),
    rgba(255, 255, 255, 0.04);
}

.row-mode-notice span {
  flex: 0 0 auto;
  padding: 6px 10px;
  color: var(--theme-primary-light);
  font-size: 12px;
  font-weight: 800;
  border: 1px solid hsla(var(--theme-hue), 80%, 72%, 0.22);
  border-radius: 999px;
  background: hsla(var(--theme-hue), 80%, 60%, 0.08);
}

.row-mode-notice p {
  margin: 0;
  line-height: 1.6;
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

.preview-table .preview-action-column {
  position: sticky;
  left: 0;
  z-index: 3;
  width: 132px;
  min-width: 132px;
  max-width: 132px;
}

.preview-action-head {
  display: flex;
  justify-content: space-between;
  gap: 8px;
  align-items: center;
}

.sort-button {
  display: grid;
  gap: 3px;
  width: 100%;
  padding: 0;
  color: inherit;
  text-align: left;
  border: 0;
  background: transparent;
  cursor: pointer;
}

.sort-button em {
  color: rgba(255, 255, 255, 0.42);
  font-size: 10px;
  font-style: normal;
  font-weight: 600;
}

.preview-table td.preview-action-column {
  background: rgba(7, 12, 28, 0.72);
  backdrop-filter: blur(10px);
  -webkit-backdrop-filter: blur(10px);
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

.preview-table th.preview-action-column {
  z-index: 4;
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

.preview-table tbody tr.is-editing-row td,
.preview-table tbody tr.new-row-line td {
  background:
    linear-gradient(135deg, hsla(var(--theme-hue), 80%, 60%, 0.12), rgba(255, 255, 255, 0.045));
}

.row-action-cell {
  overflow: visible !important;
  white-space: normal !important;
}

.row-actions {
  display: grid;
  gap: 8px;
}

.row-action-button {
  min-height: 30px;
  padding: 0 10px;
  color: var(--glass-text);
  font-size: 12px;
  border: 1px solid hsla(var(--theme-hue), 80%, 72%, 0.16);
  border-radius: 999px;
  background: rgba(255, 255, 255, 0.045);
  cursor: pointer;
  transition: var(--glass-transition);
}

.row-action-button:hover:not(:disabled) {
  color: var(--glass-text-strong);
  border-color: hsla(var(--theme-hue), 90%, 72%, 0.38);
  background: hsla(var(--theme-hue), 80%, 60%, 0.12);
}

.row-action-button.primary {
  color: var(--glass-text-strong);
  border-color: hsla(var(--theme-hue), 90%, 72%, 0.36);
  background: hsla(var(--theme-hue), 80%, 60%, 0.18);
}

.row-action-button.danger:hover:not(:disabled) {
  color: #fecaca;
  border-color: rgba(248, 113, 113, 0.46);
  background: rgba(248, 113, 113, 0.1);
}

.row-action-button:disabled {
  color: rgba(255, 255, 255, 0.36);
  border-color: rgba(255, 255, 255, 0.08);
  background: rgba(255, 255, 255, 0.03);
  cursor: not-allowed;
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

.readonly-cell,
.cell-lock-tip {
  color: rgba(255, 255, 255, 0.42);
  font-size: 12px;
}

.cell-lock-tip {
  display: block;
  margin-top: 4px;
  font-style: normal;
}

.cell-editor {
  min-width: 150px;
}

.cell-editor :deep(.el-input__wrapper) {
  min-height: 30px;
  border: 1px solid hsla(var(--theme-hue), 80%, 72%, 0.18);
  border-radius: 12px;
  background: rgba(255, 255, 255, 0.07) !important;
  box-shadow: none !important;
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

.dialog-field :deep(.el-textarea__inner) {
  color: var(--glass-text-strong);
  border: 1px solid hsla(var(--theme-hue), 80%, 72%, 0.18);
  border-radius: 18px;
  background:
    linear-gradient(135deg, hsla(var(--theme-hue), 80%, 60%, 0.075), rgba(255, 255, 255, 0.055)) !important;
  box-shadow:
    inset 0 1px 0 rgba(255, 255, 255, 0.09),
    0 10px 22px rgba(0, 0, 0, 0.12) !important;
}

.dialog-field :deep(.el-textarea__inner::placeholder) {
  color: rgba(255, 255, 255, 0.34);
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

.batch-row-form {
  display: grid;
  gap: 18px;
}

.batch-row-hint {
  display: grid;
  gap: 8px;
  padding: 14px;
  border: 1px solid hsla(var(--theme-hue), 80%, 72%, 0.14);
  border-radius: 18px;
  background:
    radial-gradient(circle at 0% 50%, hsla(var(--theme-hue), 82%, 60%, 0.14), transparent 40%),
    rgba(255, 255, 255, 0.04);
}

.batch-row-hint span {
  color: var(--theme-primary-light);
  font-size: 12px;
  font-weight: 800;
  letter-spacing: 0.12em;
}

.batch-row-hint p,
.batch-row-meta {
  margin: 0;
  color: var(--glass-text-muted);
  font-size: 13px;
  line-height: 1.7;
}

.batch-row-meta {
  display: flex;
  flex-wrap: wrap;
  gap: 9px;
}

.batch-row-meta span {
  padding: 7px 10px;
  border: 1px solid hsla(var(--theme-hue), 80%, 72%, 0.14);
  border-radius: 999px;
  background: hsla(var(--theme-hue), 80%, 60%, 0.06);
}

.batch-null-toggle {
  grid-column: auto;
  min-height: auto;
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

.dialog-button.danger {
  color: #fecaca;
  border-color: rgba(248, 113, 113, 0.34);
  background:
    radial-gradient(circle at 24% 18%, rgba(255, 255, 255, 0.16), transparent 26%),
    linear-gradient(135deg, rgba(248, 113, 113, 0.18), rgba(127, 29, 29, 0.08));
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

  .schema-editor-form {
    grid-template-columns: 1fr;
  }

  .schema-wide-field,
  .schema-flags {
    grid-column: auto;
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
