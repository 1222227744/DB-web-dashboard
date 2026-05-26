import { type NextFunction, type Request, type Response } from 'express';
import pool from '../config/db.js';
import { limits } from '../config/limits.js';
import { AppError } from '../errors/AppError.js';
import { getDatabaseIDFromParams, resolveOwnedDatabase } from '../services/databaseResolver.js';
import { quoteIdentifier, validateSqlIdentifier } from '../utils/sqlIdentifier.js';
import { sendSuccess } from '../utils/response.js';

type DatabaseParams = {
  databaseId?: string;
};

type JsonRecord = Record<string, unknown>;

type QuerySourceKind = 'table' | 'view' | 'subquery';
type JoinType = 'INNER' | 'LEFT' | 'RIGHT';
type LogicOperator = 'AND' | 'OR';
type SortDirection = 'ASC' | 'DESC';
type AggregateFunction = 'COUNT' | 'SUM' | 'AVG' | 'MIN' | 'MAX';
type ConditionOperator =
  | 'eq'
  | 'ne'
  | 'gt'
  | 'gte'
  | 'lt'
  | 'lte'
  | 'like'
  | 'in'
  | 'notIn'
  | 'between'
  | 'isNull'
  | 'isNotNull'
  | 'exists'
  | 'notExists';

type ColumnMetadata = {
  name: string;
  dataType: string | null;
};

type SourceMetadata = {
  alias: string;
  kind: QuerySourceKind;
  name: string;
  columns: ColumnMetadata[];
  columnMap: Map<string, ColumnMetadata>;
};

type OutputColumn = {
  name: string;
  label: string;
  source: string | null;
  dataType: string | null;
};

type BuiltOutputField = OutputColumn & {
  sql: string;
};

type QueryScope = {
  parent: QueryScope | null;
  sources: Map<string, SourceMetadata>;
  outputFields: Map<string, BuiltOutputField>;
};

type QueryBuildContext = {
  schemaName: string;
  depth: number;
  parentScope: QueryScope | null;
  joinCounter: {
    count: number;
  };
  topLevel: boolean;
};

type SqlFragment = {
  sql: string;
  params: unknown[];
};

type BuiltSource = SqlFragment & {
  metadata: SourceMetadata;
};

type BuiltSelectQuery = SqlFragment & {
  columns: OutputColumn[];
  page: number | null;
  pageSize: number | null;
};

type FieldReferenceInput = {
  tableAlias?: string | undefined;
  name: string;
};

type TableMetadataRow = {
  table_name: string;
  table_type: 'BASE TABLE' | 'VIEW';
};

type ColumnMetadataRow = {
  column_name: string;
  data_type: string | null;
};

const aggregateFunctions = new Set<AggregateFunction>(['COUNT', 'SUM', 'AVG', 'MIN', 'MAX']);
const joinTypes = new Set<JoinType>(['INNER', 'LEFT', 'RIGHT']);
const logicOperators = new Set<LogicOperator>(['AND', 'OR']);
const sortDirections = new Set<SortDirection>(['ASC', 'DESC']);
const conditionOperators = new Set<ConditionOperator>([
  'eq',
  'ne',
  'gt',
  'gte',
  'lt',
  'lte',
  'like',
  'in',
  'notIn',
  'between',
  'isNull',
  'isNotNull',
  'exists',
  'notExists'
]);
const comparisonSql: Record<Extract<ConditionOperator, 'eq' | 'ne' | 'gt' | 'gte' | 'lt' | 'lte'>, string> = {
  eq: '=',
  ne: '<>',
  gt: '>',
  gte: '>=',
  lt: '<',
  lte: '<='
};
const maxSelectFields = 80;
const maxConditionCount = 64;
const maxConditionValues = 100;
const defaultPageSize = 20;

function throwValidationError(message: string): never {
  throw new AppError({
    httpStatus: 400,
    type: 'VALIDATION_ERROR',
    code: 'QUERY_VALIDATION_ERROR',
    message
  });
}

export const executeSelectQuery = async (
  req: Request<DatabaseParams, unknown, unknown>,
  res: Response,
  next: NextFunction
): Promise<void> => {
  try {
    const userID = getCurrentUserID(req);
    const databaseID = getDatabaseIDFromParams(req.params);
    const astSize = Buffer.byteLength(JSON.stringify(req.body ?? {}), 'utf8');

    if (astSize > limits.maxQueryAstBytes) {
      throwValidationError(`查询定义过大，最大允许 ${limits.maxQueryAstBytes} 字节`);
    }

    const database = await resolveOwnedDatabase(userID, databaseID);
    const builtQuery = await buildSelectQuery(req.body, {
      schemaName: database.schemaName,
      depth: 0,
      parentScope: null,
      joinCounter: {
        count: 0
      },
      topLevel: true
    });

    const [rows] = await pool.query(builtQuery.sql, builtQuery.params);
    const rawRows = rows as Array<Record<string, unknown>>;
    const pageSize = builtQuery.pageSize ?? rawRows.length;
    const hasMore = builtQuery.pageSize !== null && rawRows.length > pageSize;
    const resultRows = hasMore ? rawRows.slice(0, pageSize) : rawRows;

    sendSuccess(res, '查询执行成功', {
      columns: builtQuery.columns,
      rows: resultRows.map(normalizeQueryRow),
      page: builtQuery.page,
      pageSize: builtQuery.pageSize,
      hasMore,
      sqlPreview: builtQuery.sql
    });
  } catch (error) {
    next(convertQueryError(error));
  }
};

const buildSelectQuery = async (input: unknown, context: QueryBuildContext): Promise<BuiltSelectQuery> => {
  const ast = asRecord(input, '查询定义格式不正确');
  const scope: QueryScope = {
    parent: context.parentScope,
    sources: new Map(),
    outputFields: new Map()
  };

  const fromSource = await buildQuerySource(ast.from, '查询来源', {
    ...context,
    parentScope: null,
    topLevel: false
  });
  registerSource(scope, fromSource.metadata);

  const joinFragments = await buildJoinFragments(ast.joins, scope, context);
  const builtFields = buildSelectFields(ast.fields, scope);
  const whereFragment = await buildConditionList(ast.filters, '筛选条件', scope, context);
  const groupFragment = buildGroupFragment(ast.groups, scope);
  const havingFragment = await buildConditionList(ast.having, '聚合筛选条件', scope, context, true);
  const sortFragment = buildSortFragment(ast.sorts, scope);
  const pagination = buildPaginationFragment(ast, context.topLevel);
  const selectKeyword = context.topLevel
    ? `SELECT /*+ MAX_EXECUTION_TIME(${limits.maxQueryDurationMs}) */`
    : 'SELECT';
  const sql = [
    `${selectKeyword} ${builtFields.map((field) => field.sql).join(', ')}`,
    `FROM ${fromSource.sql}`,
    ...joinFragments.map((join) => join.sql),
    whereFragment.sql ? `WHERE ${whereFragment.sql}` : '',
    groupFragment.sql ? `GROUP BY ${groupFragment.sql}` : '',
    havingFragment.sql ? `HAVING ${havingFragment.sql}` : '',
    sortFragment.sql ? `ORDER BY ${sortFragment.sql}` : '',
    pagination.sql
  ].filter(Boolean).join(' ');

  return {
    sql,
    params: [
      ...fromSource.params,
      ...joinFragments.flatMap((join) => join.params),
      ...whereFragment.params,
      ...havingFragment.params,
      ...pagination.params
    ],
    columns: builtFields.map(({ sql: _sql, ...field }) => field),
    page: pagination.page,
    pageSize: pagination.pageSize
  };
};

const buildQuerySource = async (
  input: unknown,
  label: string,
  context: QueryBuildContext,
  aliasOverride?: string
): Promise<BuiltSource> => {
  const source = asRecord(input, `${label}格式不正确`);
  const sourceType = normalizeSourceKind(source.type, label);

  if (sourceType === 'subquery') {
    const alias = validateSqlIdentifier(aliasOverride ?? readRequiredString(source.alias, `${label}别名`), `${label}别名`);

    if (context.depth + 1 > limits.maxSubqueryDepth) {
      throwValidationError(`子查询嵌套深度不能超过 ${limits.maxSubqueryDepth}`);
    }

    const builtSubquery = await buildSelectQuery(source.query, {
      schemaName: context.schemaName,
      depth: context.depth + 1,
      parentScope: context.parentScope,
      joinCounter: context.joinCounter,
      topLevel: false
    });

    const columns = builtSubquery.columns.map((column) => ({
      name: column.name,
      dataType: column.dataType
    }));

    return {
      sql: `(${builtSubquery.sql}) AS ${quoteIdentifier(alias)}`,
      params: builtSubquery.params,
      metadata: createSourceMetadata(alias, 'subquery', alias, columns)
    };
  }

  const objectName = validateSqlIdentifier(
    readRequiredString(sourceType === 'table' ? source.table : source.view, sourceType === 'table' ? '表名' : '视图名'),
    sourceType === 'table' ? '表名' : '视图名'
  );
  const alias = validateSqlIdentifier(
    aliasOverride ?? readOptionalString(source.alias) ?? objectName,
    `${label}别名`
  );
  const metadata = await readObjectMetadata(context.schemaName, objectName, sourceType);

  return {
    sql: `${quoteIdentifier(context.schemaName)}.${quoteIdentifier(objectName)} AS ${quoteIdentifier(alias)}`,
    params: [],
    metadata: createSourceMetadata(alias, sourceType, objectName, metadata.columns)
  };
};

const buildJoinFragments = async (
  input: unknown,
  scope: QueryScope,
  context: QueryBuildContext
): Promise<SqlFragment[]> => {
  const joins = readOptionalArray(input, '连接定义');

  if (joins.length === 0) {
    return [];
  }

  const fragments: SqlFragment[] = [];

  for (let index = 0; index < joins.length; index += 1) {
    const item = joins[index];
    context.joinCounter.count += 1;

    if (context.joinCounter.count > limits.maxJoinCount) {
      throwValidationError(`JOIN 数量不能超过 ${limits.maxJoinCount}`);
    }

    const join = asRecord(item, `第 ${index + 1} 个连接定义格式不正确`);
    const joinType = normalizeJoinType(join.type, `第 ${index + 1} 个连接类型`);
    const aliasOverride = readOptionalString(join.alias);
    const builtSource = await buildQuerySource(join.source, `第 ${index + 1} 个连接来源`, context, aliasOverride);
    registerSource(scope, builtSource.metadata);

    const onFragment = await buildConditionList(join.on, `第 ${index + 1} 个连接条件`, scope, context);

    if (!onFragment.sql) {
      throwValidationError(`第 ${index + 1} 个连接至少需要一个 ON 条件`);
    }

    fragments.push({
      sql: `${joinType} JOIN ${builtSource.sql} ON ${onFragment.sql}`,
      params: [...builtSource.params, ...onFragment.params]
    });
  }

  return fragments;
};

const buildSelectFields = (input: unknown, scope: QueryScope): BuiltOutputField[] => {
  const fields = readRequiredArray(input, '查询字段');

  if (fields.length === 0) {
    throwValidationError('请至少选择一个查询字段');
  }

  if (fields.length > maxSelectFields) {
    throwValidationError(`查询字段不能超过 ${maxSelectFields} 个`);
  }

  const usedLabels = new Set<string>();

  return fields.map((item, index) => {
    const field = asRecord(item, `第 ${index + 1} 个查询字段格式不正确`);
    const aggregate = normalizeAggregate(field.aggregate);
    const fieldName = aggregate === 'COUNT' && field.name === '*' ? '*' : validateSqlIdentifier(
      readRequiredString(field.name, `第 ${index + 1} 个字段名`),
      `第 ${index + 1} 个字段名`
    );
    const tableAlias = readOptionalString(field.tableAlias);
    const distinct = field.distinct === true;
    const fieldSql = fieldName === '*'
      ? '*'
      : resolveFieldReference({ tableAlias, name: fieldName }, scope).sql;
    const expressionSql = aggregate
      ? `${aggregate}(${distinct && fieldName !== '*' ? 'DISTINCT ' : ''}${fieldSql})`
      : fieldSql;
    const alias = readOptionalString(field.alias);
    const baseLabel = alias
      ? validateSqlIdentifier(alias, `第 ${index + 1} 个字段别名`)
      : buildDefaultFieldLabel(fieldName, aggregate);
    const label = reserveUniqueLabel(baseLabel, usedLabels);
    const output: BuiltOutputField = {
      name: label,
      label,
      source: fieldName === '*' ? null : `${tableAlias ?? ''}${tableAlias ? '.' : ''}${fieldName}`,
      dataType: aggregate ? 'NUMBER' : resolveFieldReference({ tableAlias, name: fieldName }, scope).column.dataType,
      sql: `${expressionSql} AS ${quoteIdentifier(label)}`
    };

    scope.outputFields.set(label, output);
    return output;
  });
};

const buildConditionList = async (
  input: unknown,
  label: string,
  scope: QueryScope,
  context: QueryBuildContext,
  allowOutputField = false
): Promise<SqlFragment> => {
  const conditions = readOptionalArray(input, label);

  if (conditions.length === 0) {
    return {
      sql: '',
      params: []
    };
  }

  if (conditions.length > maxConditionCount) {
    throwValidationError(`${label}不能超过 ${maxConditionCount} 个`);
  }

  const fragments: SqlFragment[] = [];

  for (let index = 0; index < conditions.length; index += 1) {
    const condition = asRecord(conditions[index], `${label}第 ${index + 1} 项格式不正确`);
    const logic = index === 0 ? '' : normalizeLogic(condition.logic);
    const fragment = await buildCondition(condition, `${label}第 ${index + 1} 项`, scope, context, allowOutputField);

    if (fragment.sql) {
      fragments.push({
        sql: `${logic ? `${logic} ` : ''}${fragment.sql}`,
        params: fragment.params
      });
    }
  }

  return {
    sql: fragments.map((fragment) => fragment.sql).join(' '),
    params: fragments.flatMap((fragment) => fragment.params)
  };
};

const buildCondition = async (
  condition: JsonRecord,
  label: string,
  scope: QueryScope,
  context: QueryBuildContext,
  allowOutputField: boolean
): Promise<SqlFragment> => {
  if ('conditions' in condition) {
    const nested = await buildConditionList(condition.conditions, `${label}的子条件`, scope, context, allowOutputField);

    return {
      sql: nested.sql ? `(${nested.sql})` : '',
      params: nested.params
    };
  }

  const operator = normalizeConditionOperator(condition.operator, label);

  if (operator === 'exists' || operator === 'notExists') {
    const subquery = await buildConditionSubquery(condition.subquery, `${label}子查询`, scope, context);

    return {
      sql: `${operator === 'exists' ? 'EXISTS' : 'NOT EXISTS'} (${subquery.sql})`,
      params: subquery.params
    };
  }

  const fieldSql = resolveConditionField(condition.field, scope, allowOutputField, label);

  if (operator === 'isNull' || operator === 'isNotNull') {
    return {
      sql: `${fieldSql} IS ${operator === 'isNull' ? '' : 'NOT '}NULL`,
      params: []
    };
  }

  if (operator === 'in' || operator === 'notIn') {
    if ('subquery' in condition && condition.subquery !== undefined && condition.subquery !== null) {
      const subquery = await buildConditionSubquery(condition.subquery, `${label}子查询`, scope, context);

      return {
        sql: `${fieldSql} ${operator === 'in' ? 'IN' : 'NOT IN'} (${subquery.sql})`,
        params: subquery.params
      };
    }

    const values = normalizeScalarArray(condition.values ?? condition.value, `${label}取值列表`);

    if (values.length === 0) {
      throwValidationError(`${label}取值列表不能为空`);
    }

    if (values.length > maxConditionValues) {
      throwValidationError(`${label}取值列表不能超过 ${maxConditionValues} 个`);
    }

    return {
      sql: `${fieldSql} ${operator === 'in' ? 'IN' : 'NOT IN'} (${values.map(() => '?').join(', ')})`,
      params: values
    };
  }

  if (operator === 'between') {
    const values = normalizeScalarArray(condition.values ?? condition.value, `${label}区间值`);

    if (values.length !== 2) {
      throwValidationError(`${label}区间值必须正好包含 2 个值`);
    }

    return {
      sql: `${fieldSql} BETWEEN ? AND ?`,
      params: values
    };
  }

  if (operator === 'like') {
    return {
      sql: `${fieldSql} LIKE ?`,
      params: [`%${String(normalizeScalarValue(condition.value, `${label}匹配值`)).trim()}%`]
    };
  }

  if ('rightField' in condition || 'valueField' in condition) {
    const rightFieldSql = resolveFieldRefInput(condition.rightField ?? condition.valueField, scope, `${label}右侧字段`).sql;

    return {
      sql: `${fieldSql} ${comparisonSql[operator]} ${rightFieldSql}`,
      params: []
    };
  }

  if ('subquery' in condition && condition.subquery !== undefined && condition.subquery !== null) {
    const subquery = await buildConditionSubquery(condition.subquery, `${label}子查询`, scope, context);

    return {
      sql: `${fieldSql} ${comparisonSql[operator]} (${subquery.sql})`,
      params: subquery.params
    };
  }

  return {
    sql: `${fieldSql} ${comparisonSql[operator]} ?`,
    params: [normalizeScalarValue(condition.value, `${label}比较值`)]
  };
};

const buildConditionSubquery = async (
  input: unknown,
  label: string,
  scope: QueryScope,
  context: QueryBuildContext
): Promise<BuiltSelectQuery> => {
  if (context.depth + 1 > limits.maxSubqueryDepth) {
    throwValidationError(`子查询嵌套深度不能超过 ${limits.maxSubqueryDepth}`);
  }

  return buildSelectQuery(input, {
    schemaName: context.schemaName,
    depth: context.depth + 1,
    parentScope: scope,
    joinCounter: context.joinCounter,
    topLevel: false
  }).catch((error: unknown) => {
    if (error instanceof AppError) {
      throw error;
    }

    throwValidationError(`${label}格式不正确`);
  });
};

const buildGroupFragment = (input: unknown, scope: QueryScope): SqlFragment => {
  const groups = readOptionalArray(input, '分组字段');

  return {
    sql: groups.map((group, index) => resolveFieldRefInput(group, scope, `第 ${index + 1} 个分组字段`).sql).join(', '),
    params: []
  };
};

const buildSortFragment = (input: unknown, scope: QueryScope): SqlFragment => {
  const sorts = readOptionalArray(input, '排序字段');

  return {
    sql: sorts.map((item, index) => {
      const sort = asRecord(item, `第 ${index + 1} 个排序字段格式不正确`);
      const direction = normalizeSortDirection(sort.order ?? sort.direction);
      const fieldSql = resolveSortableField(sort, scope, `第 ${index + 1} 个排序字段`);

      return `${fieldSql} ${direction}`;
    }).join(', '),
    params: []
  };
};

const buildPaginationFragment = (
  ast: JsonRecord,
  applyDefault: boolean
): SqlFragment & { page: number | null; pageSize: number | null } => {
  const hasPage = ast.page !== undefined || ast.pageSize !== undefined;

  if (!applyDefault && !hasPage) {
    return {
      sql: '',
      params: [],
      page: null,
      pageSize: null
    };
  }

  const page = parseInteger(ast.page, '页码', 1, Number.MAX_SAFE_INTEGER, 1);
  const requestedPageSize = parseInteger(ast.pageSize, '每页行数', 1, limits.maxPageSize, defaultPageSize);
  const fetchSize = Math.min(requestedPageSize + 1, limits.maxQueryRows);
  const offset = (page - 1) * requestedPageSize;

  if (offset > limits.maxQueryRows) {
    throwValidationError(`查询偏移量不能超过 ${limits.maxQueryRows}`);
  }

  return {
    sql: 'LIMIT ? OFFSET ?',
    params: [fetchSize, offset],
    page,
    pageSize: requestedPageSize
  };
};

const resolveConditionField = (
  input: unknown,
  scope: QueryScope,
  allowOutputField: boolean,
  label: string
): string => {
  if (allowOutputField && typeof input === 'string' && scope.outputFields.has(input)) {
    return quoteIdentifier(input);
  }

  return resolveFieldRefInput(input, scope, `${label}字段`).sql;
};

const resolveSortableField = (input: JsonRecord, scope: QueryScope, label: string): string => {
  const field = input.field ?? input.name;

  if (typeof field === 'string' && scope.outputFields.has(field)) {
    return quoteIdentifier(field);
  }

  return resolveFieldRefInput(input.field !== undefined ? input.field : input, scope, label).sql;
};

const resolveFieldRefInput = (input: unknown, scope: QueryScope, label: string) => {
  if (typeof input === 'string') {
    const [tableAlias, name] = splitFieldName(input);
    return resolveFieldReference({ tableAlias, name }, scope, label);
  }

  const field = asRecord(input, `${label}格式不正确`);
  const tableAlias = readOptionalString(field.tableAlias);
  const name = validateSqlIdentifier(readRequiredString(field.name ?? field.field, label), label);
  return resolveFieldReference({ tableAlias, name }, scope, label);
};

const resolveFieldReference = (
  field: FieldReferenceInput,
  scope: QueryScope,
  label = '字段'
): { sql: string; column: ColumnMetadata; source: SourceMetadata } => {
  const name = validateSqlIdentifier(field.name, label);

  if (field.tableAlias) {
    const alias = validateSqlIdentifier(field.tableAlias, `${label}来源别名`);
    const source = findSource(alias, scope);

    if (!source) {
      throwValidationError(`${label}来源别名 ${alias} 不存在`);
    }

    const column = source.columnMap.get(name);

    if (!column) {
      throwValidationError(`${label} ${alias}.${name} 不存在`);
    }

    return {
      sql: `${quoteIdentifier(alias)}.${quoteIdentifier(name)}`,
      column,
      source
    };
  }

  const matches = findSourcesWithColumn(name, scope);

  if (matches.length === 0) {
    throwValidationError(`${label} ${name} 不存在`);
  }

  if (matches.length > 1) {
    throwValidationError(`${label} ${name} 在多个来源中存在，请指定表别名`);
  }

  const match = matches[0];

  if (!match) {
    throwValidationError(`${label} ${name} 不存在`);
  }

  return {
    sql: `${quoteIdentifier(match.source.alias)}.${quoteIdentifier(name)}`,
    column: match.column,
    source: match.source
  };
};

const findSource = (alias: string, scope: QueryScope | null): SourceMetadata | null => {
  if (!scope) {
    return null;
  }

  return scope.sources.get(alias) ?? findSource(alias, scope.parent);
};

const findSourcesWithColumn = (
  name: string,
  scope: QueryScope | null,
  allowParent = true
): Array<{ source: SourceMetadata; column: ColumnMetadata }> => {
  if (!scope) {
    return [];
  }

  const localMatches = [...scope.sources.values()]
    .map((source) => ({
      source,
      column: source.columnMap.get(name) ?? null
    }))
    .filter((item): item is { source: SourceMetadata; column: ColumnMetadata } => item.column !== null);

  if (localMatches.length > 0 || !allowParent) {
    return localMatches;
  }

  return findSourcesWithColumn(name, scope.parent, allowParent);
};

const registerSource = (scope: QueryScope, source: SourceMetadata): void => {
  if (scope.sources.has(source.alias)) {
    throwValidationError(`来源别名 ${source.alias} 重复`);
  }

  scope.sources.set(source.alias, source);
};

const createSourceMetadata = (
  alias: string,
  kind: QuerySourceKind,
  name: string,
  columns: ColumnMetadata[]
): SourceMetadata => ({
  alias,
  kind,
  name,
  columns,
  columnMap: new Map(columns.map((column) => [column.name, column]))
});

const readObjectMetadata = async (
  schemaName: string,
  objectName: string,
  sourceType: Exclude<QuerySourceKind, 'subquery'>
): Promise<{ columns: ColumnMetadata[] }> => {
  const [objectRows] = await pool.query(
    `SELECT TABLE_NAME AS \`table_name\`, TABLE_TYPE AS \`table_type\`
     FROM information_schema.tables
     WHERE table_schema = ? AND table_name = ?
     LIMIT 1`,
    [schemaName, objectName]
  );
  const object = (objectRows as TableMetadataRow[])[0];

  if (!object) {
    throw new AppError({
      httpStatus: 404,
      type: 'RESOURCE_NOT_FOUND',
      code: 'QUERY_SOURCE_NOT_FOUND',
      message: `${sourceType === 'table' ? '表' : '视图'} ${objectName} 不存在`
    });
  }

  if (sourceType === 'table' && object.table_type !== 'BASE TABLE') {
    throwValidationError(`${objectName} 不是基础表`);
  }

  if (sourceType === 'view' && object.table_type !== 'VIEW') {
    throwValidationError(`${objectName} 不是视图`);
  }

  const [columnRows] = await pool.query(
    `SELECT COLUMN_NAME AS \`column_name\`, DATA_TYPE AS \`data_type\`
     FROM information_schema.columns
     WHERE table_schema = ? AND table_name = ?
     ORDER BY ordinal_position`,
    [schemaName, objectName]
  );
  const columns = (columnRows as ColumnMetadataRow[]).map((column) => ({
    name: column.column_name,
    dataType: column.data_type?.toUpperCase() ?? null
  }));

  if (columns.length === 0) {
    throwValidationError(`${objectName} 没有可查询字段`);
  }

  return {
    columns
  };
};

const normalizeSourceKind = (value: unknown, label: string): QuerySourceKind => {
  if (value === 'table' || value === 'view' || value === 'subquery') {
    return value;
  }

  throwValidationError(`${label}类型必须是 table、view 或 subquery`);
};

const normalizeJoinType = (value: unknown, label: string): JoinType => {
  const joinType = String(value ?? 'INNER').trim().toUpperCase();

  if (joinTypes.has(joinType as JoinType)) {
    return joinType as JoinType;
  }

  throwValidationError(`${label}必须是 INNER、LEFT 或 RIGHT`);
};

const normalizeLogic = (value: unknown): LogicOperator => {
  const logic = String(value ?? 'AND').trim().toUpperCase();

  if (logicOperators.has(logic as LogicOperator)) {
    return logic as LogicOperator;
  }

  throwValidationError('条件逻辑只能是 AND 或 OR');
};

const normalizeSortDirection = (value: unknown): SortDirection => {
  const direction = String(value ?? 'ASC').trim().toUpperCase();

  if (sortDirections.has(direction as SortDirection)) {
    return direction as SortDirection;
  }

  throwValidationError('排序方向只能是 ASC 或 DESC');
};

const normalizeAggregate = (value: unknown): AggregateFunction | null => {
  if (value === undefined || value === null || value === '') {
    return null;
  }

  const aggregate = String(value).trim().toUpperCase();

  if (aggregateFunctions.has(aggregate as AggregateFunction)) {
    return aggregate as AggregateFunction;
  }

  throwValidationError('聚合函数只能是 COUNT、SUM、AVG、MIN 或 MAX');
};

const normalizeConditionOperator = (value: unknown, label: string): ConditionOperator => {
  if (typeof value === 'string' && conditionOperators.has(value as ConditionOperator)) {
    return value as ConditionOperator;
  }

  throwValidationError(`${label}操作符不支持`);
};

const normalizeScalarValue = (value: unknown, label: string): string | number | boolean | null => {
  if (value === null || typeof value === 'string' || typeof value === 'number' || typeof value === 'boolean') {
    return value;
  }

  throwValidationError(`${label}只能是字符串、数字、布尔值或 null`);
};

const normalizeScalarArray = (value: unknown, label: string): Array<string | number | boolean | null> => {
  if (!Array.isArray(value)) {
    throwValidationError(`${label}必须是数组`);
  }

  return value.map((item, index) => normalizeScalarValue(item, `${label}第 ${index + 1} 项`));
};

const splitFieldName = (value: string): [string | undefined, string] => {
  const parts = value.split('.').map((part) => part.trim()).filter(Boolean);

  if (parts.length === 1) {
    const name = parts[0];

    if (!name) {
      throwValidationError('字段名不能为空');
    }

    return [undefined, validateSqlIdentifier(name, '字段名')];
  }

  if (parts.length === 2) {
    const [tableAlias, name] = parts;

    if (!tableAlias || !name) {
      throwValidationError('字段引用格式不正确');
    }

    return [validateSqlIdentifier(tableAlias, '字段来源别名'), validateSqlIdentifier(name, '字段名')];
  }

  throwValidationError('字段引用格式应为 field 或 alias.field');
};

const buildDefaultFieldLabel = (fieldName: string, aggregate: AggregateFunction | null): string => {
  if (!aggregate) {
    return fieldName;
  }

  return `${aggregate.toLowerCase()}_${fieldName === '*' ? 'all' : fieldName}`;
};

const reserveUniqueLabel = (baseLabel: string, usedLabels: Set<string>): string => {
  let label = baseLabel;
  let index = 2;

  while (usedLabels.has(label)) {
    label = `${baseLabel}_${index}`;
    index += 1;
  }

  usedLabels.add(label);
  return label;
};

const asRecord = (value: unknown, message: string): JsonRecord => {
  if (typeof value === 'object' && value !== null && !Array.isArray(value)) {
    return value as JsonRecord;
  }

  throwValidationError(message);
};

const readRequiredArray = (value: unknown, label: string): unknown[] => {
  if (!Array.isArray(value)) {
    throwValidationError(`${label}必须是数组`);
  }

  return value;
};

const readOptionalArray = (value: unknown, label: string): unknown[] => {
  if (value === undefined || value === null) {
    return [];
  }

  if (!Array.isArray(value)) {
    throwValidationError(`${label}必须是数组`);
  }

  return value;
};

const readRequiredString = (value: unknown, label: string): string => {
  if (typeof value !== 'string' || value.trim() === '') {
    throwValidationError(`${label}不能为空`);
  }

  return value.trim();
};

const readOptionalString = (value: unknown): string | undefined => {
  if (value === undefined || value === null || value === '') {
    return undefined;
  }

  if (typeof value !== 'string') {
    throwValidationError('可选文本必须是字符串');
  }

  return value.trim() || undefined;
};

const parseInteger = (
  value: unknown,
  label: string,
  min: number,
  max: number,
  defaultValue: number
): number => {
  if (value === undefined || value === null || value === '') {
    return defaultValue;
  }

  const numberValue = Number(value);

  if (!Number.isInteger(numberValue) || numberValue < min || numberValue > max) {
    throwValidationError(`${label}必须是 ${min} 到 ${max} 之间的整数`);
  }

  return numberValue;
};

const normalizeQueryRow = (row: Record<string, unknown>): Record<string, unknown> => {
  return Object.fromEntries(
    Object.entries(row).map(([key, value]) => [
      key,
      value instanceof Date
        ? value.toISOString()
        : Buffer.isBuffer(value)
          ? value.toString('utf8')
          : value
    ])
  );
};

const getCurrentUserID = (req: Request): number => {
  if (!req.user) {
    throw new AppError({
      httpStatus: 401,
      type: 'AUTH_ERROR',
      code: 'AUTH_REQUIRED',
      message: '请先登录'
    });
  }

  return req.user.userID;
};

const convertQueryError = (error: unknown): unknown => {
  if (error instanceof AppError) {
    return error;
  }

  if (typeof error === 'object' && error !== null && 'sqlMessage' in error) {
    const sqlMessage = String((error as { sqlMessage?: unknown }).sqlMessage ?? '查询执行失败');
    return new AppError({
      httpStatus: 400,
      type: 'VALIDATION_ERROR',
      code: 'QUERY_EXECUTION_ERROR',
      message: `查询执行失败：${sqlMessage}`
    });
  }

  return error;
};
