// .eslintrc.js
/**
 * ESLint 配置 - 包含架构依赖约束规则
 *
 * 架构约束说明:
 * - Controller → Service → Client → External API
 * - Plugin → Plugin Client → Internal Client (受控)
 * - Controller → API Service → DB Service → Prisma
 * - API Service 必须通过 DB Service (@app/db) 访问数据库
 * - 只有 libs/db 目录可以直接使用 PrismaService
 *
 * 禁止的依赖:
 * - API Service → Prisma (必须通过 DB Service)
 * - Client → DB/Prisma (Client 不能直接访问数据库)
 * - Service → Plugin (Service 不能依赖 Plugin)
 * - Plugin → Service (Plugin 不能依赖业务 Service)
 */
module.exports = {
  root: true,
  env: {
    node: true,
    jest: true,
    es2021: true,
  },
  parser: '@typescript-eslint/parser',
  parserOptions: {
    project: 'tsconfig.json',
    tsconfigRootDir: __dirname,
    sourceType: 'module',
  },
  plugins: ['@typescript-eslint/eslint-plugin', 'import'],
  extends: [
    'eslint:recommended',
    'plugin:@typescript-eslint/recommended',
    'plugin:import/recommended',
    'plugin:import/typescript',
    'plugin:prettier/recommended',
  ],
  settings: {
    'import/resolver': {
      typescript: {
        alwaysTryTypes: true,
        project: './tsconfig.json',
      },
    },
  },
  ignorePatterns: [
    '.eslintrc.js',
    'dist',
    'node_modules',
    'generated', // 自动生成的代码
    'scripts', // 独立脚本
    'prisma/seed.ts', // 种子数据脚本
    '**/*.spec.ts', // 测试文件
    '**/test-*.ts', // 测试连接脚本
    'libs/infra/common/config/**', // 配置加载阶段（Logger 未初始化）
    'src/app.module.ts', // 应用启动阶段
    'src/main.ts', // 应用入口
  ],
  rules: {
    // ============================================
    // 禁止使用 console.* (强制使用 Winston Logger)
    // ============================================
    'no-console': [
      'error',
      {
        allow: ['warn', 'error'], // 仅允许 console.warn/error 用于启动阶段
      },
    ],
    // ============================================
    // TypeScript 规则
    // ============================================
    '@typescript-eslint/interface-name-prefix': 'off',
    '@typescript-eslint/explicit-function-return-type': 'off',
    '@typescript-eslint/explicit-module-boundary-types': 'off',
    '@typescript-eslint/no-explicit-any': 'off',
    // 允许 any 的赋值/传参/返回/成员访问（如 redis.getData 等返回 any 的调用）
    '@typescript-eslint/no-unsafe-assignment': 'off',
    '@typescript-eslint/no-unsafe-argument': 'off',
    '@typescript-eslint/no-unsafe-return': 'off',
    '@typescript-eslint/no-unsafe-member-access': 'off',
    '@typescript-eslint/no-unsafe-call': 'off',
    '@typescript-eslint/no-unused-vars': 'warn',
    '@typescript-eslint/no-namespace': 'off',
        '@typescript-eslint/no-require-imports': 'off',
        '@typescript-eslint/require-await': 'off',
        // 以下规则依赖 strictNullChecks，项目未开启故关闭（允许不开启 strictNullChecks 的写法）
    '@typescript-eslint/no-unnecessary-condition': 'off',
    '@typescript-eslint/no-unnecessary-type-assertion': 'off',
    '@typescript-eslint/no-unnecessary-boolean-literal-compare': 'off',
    '@typescript-eslint/strict-boolean-expressions': 'off',
    '@typescript-eslint/prefer-nullish-coalescing': 'off',
    '@typescript-eslint/prefer-optional-chain': 'off',
    '@typescript-eslint/ban-ts-comment': 'warn',
    '@typescript-eslint/no-unused-expressions': 'warn',
    'no-prototype-builtins': 'warn',
    'no-case-declarations': 'warn',
    'prefer-const': 'warn',
    'no-useless-catch': 'warn',
    'no-unsafe-optional-chaining': 'warn',
    'no-empty': 'warn',

    // ============================================
    // 架构依赖约束规则
    // ============================================
    'import/no-restricted-paths': [
      // 初始阶段使用 'warn'，稳定后改为 'error'
      'warn',
      {
        zones: [
          // ===========================================
          // 规则 1: Client 层禁止直接访问 DB 层
          // ===========================================
          {
            target: './libs/*-client/**/*',
            from: './libs/db/**/*',
            message:
              '[架构违规] Client 层禁止直接访问 DB 层。\n' +
              '请将数据访问逻辑移至 Service 层，Client 只负责外部 API 调用。\n' +
              '参考: apps/api/docs/Client层重构与Plugin系统设计.md',
          },

          // ===========================================
          // 规则 2: Client 层禁止直接访问 Prisma
          // ===========================================
          {
            target: './libs/*-client/**/*',
            from: './libs/prisma/**/*',
            message:
              '[架构违规] Client 层禁止直接访问 PrismaService。\n' +
              '请将数据访问逻辑移至 Service 层，Client 只负责外部 API 调用。\n' +
              '参考: apps/api/docs/Client层重构与Plugin系统设计.md',
          },

          // ===========================================
          // 规则 3: 未来 Plugin 系统规则 (预留)
          // ===========================================
          // Plugin 禁止访问 API Service
          {
            target: './src/plugins/**/*',
            from: './src/modules/**/*',
            message:
              '[架构违规] Plugin 禁止直接访问 API Service。\n' +
              '请通过 Plugin Client Facade 访问平台能力。',
          },

          // Plugin 禁止直接访问 Internal Client
          {
            target: './src/plugins/**/*',
            from: './libs/*-client/**/*',
            except: ['./libs/clients/plugin/**/*'],
            message:
              '[架构违规] Plugin 只能通过 Plugin Client Facade 访问能力。\n' +
              '禁止直接使用 Internal Client。',
          },

          // Plugin 禁止访问 DB 层
          {
            target: './src/plugins/**/*',
            from: './libs/db/**/*',
            message: '[架构违规] Plugin 禁止直接访问 DB 层。',
          },

          // Plugin 禁止访问 Prisma
          {
            target: './src/plugins/**/*',
            from: './libs/prisma/**/*',
            message: '[架构违规] Plugin 禁止直接访问 PrismaService。',
          },

          // ===========================================
          // 规则 4: API Service 层禁止直接访问 Prisma
          // 必须通过 DB Service (@app/db) 访问数据库
          // ===========================================
          {
            target: './src/modules/**/*',
            from: './libs/prisma/**/*',
            message:
              '[架构违规] API Service 层禁止直接访问 PrismaService。\n' +
              '请通过 DB Service (@app/db) 访问数据库。\n' +
              '跨服务事务请使用 UnitOfWorkService。\n' +
              '参考: apps/api/docs/架构分层与事务管理方案-new.md',
          },

          // ===========================================
          // 规则 5: libs 下非 db/prisma 目录禁止访问 Prisma
          // 只有 libs/db 和 libs/prisma 可以使用 Prisma
          // ===========================================
          {
            target: './libs/auth/**/*',
            from: './libs/prisma/**/*',
            message:
              '[架构违规] 此目录禁止直接访问 PrismaService。\n' +
              '请通过 DB Service (@app/db) 访问数据库。',
          },
          {
            target: './libs/permission/**/*',
            from: './libs/prisma/**/*',
            message:
              '[架构违规] 此目录禁止直接访问 PrismaService。\n' +
              '请通过 DB Service (@app/db) 访问数据库。',
          },
          {
            target: './libs/services/**/*',
            from: './libs/prisma/**/*',
            message:
              '[架构违规] 此目录禁止直接访问 PrismaService。\n' +
              '请通过 DB Service (@app/db) 访问数据库。',
          },
        ],
      },
    ],

    // 禁用未使用的 import 检查 (typescript-eslint 已处理)
    'import/no-unresolved': 'off',
  },

  // ============================================
  // 目录特定规则 (overrides)
  // ============================================
  overrides: [
    // prisma.config.ts 不在 tsconfig include 内，禁用 type-aware 解析避免报错
    {
      files: ['prisma.config.ts'],
      parserOptions: { project: null },
    },
    // ===========================================
    // 规则: 非 libs/db 目录禁止直接使用 prisma.write/read
    // ===========================================
    {
      files: [
        'src/modules/**/*.ts',
        'libs/auth/**/*.ts',
        'libs/permission/**/*.ts',
        'libs/services/**/*.ts',
        'libs/*-client/**/*.ts',
      ],
      rules: {
        'no-restricted-syntax': [
          'warn',
          {
            selector:
              'MemberExpression[object.object.type="ThisExpression"][object.property.name="prisma"][property.name=/^(write|read)$/]',
            message:
              '[架构违规] 禁止直接使用 this.prisma.write 或 this.prisma.read。\n' +
              '请通过 DB Service (@app/db) 访问数据库，或使用 getWriteClient()/getReadClient()。\n' +
              '参考: apps/api/docs/架构分层与事务管理方案-new.md',
          },
          {
            selector:
              'MemberExpression[object.property.name="prisma"][property.name=/^(write|read)$/]:not([object.object.type="ThisExpression"])',
            message:
              '[架构违规] 禁止直接使用 prisma.write 或 prisma.read。\n' +
              '请通过 DB Service (@app/db) 访问数据库。\n' +
              '参考: apps/api/docs/架构分层与事务管理方案-new.md',
          },
        ],
      },
    },
  ],
};
