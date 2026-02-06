import { initContract } from '@ts-rest/core';
import { z } from 'zod';
import {
  ApiResponseSchema,
  SuccessResponseSchema,
  withVersion,
  API_VERSION,
} from '../base';
import {
  PersonaTemplateSchema,
  PersonaTemplateListResponseSchema,
  PersonaTemplateListQuerySchema,
  CreatePersonaTemplateInputSchema,
  UpdatePersonaTemplateInputSchema,
  DuplicatePersonaTemplateInputSchema,
} from '../schemas/persona-template.schema';

const c = initContract();

/**
 * Persona Template API Contract
 * 人格模板管理相关的 API 契约定义
 */
export const personaTemplateContract = c.router(
  {
    /**
     * GET /persona-template - 列出所有模板（系统 + 用户自己的）
     */
    list: {
      method: 'GET',
      path: '',
      query: PersonaTemplateListQuerySchema,
      responses: {
        200: ApiResponseSchema(PersonaTemplateListResponseSchema),
      },
      summary: '列出所有人格模板',
    },

    /**
     * GET /persona-template/:id - 获取单个模板
     */
    getById: {
      method: 'GET',
      path: '/:id',
      pathParams: z.object({ id: z.string().uuid() }),
      responses: {
        200: ApiResponseSchema(PersonaTemplateSchema),
        404: ApiResponseSchema(z.object({ error: z.string() })),
      },
      summary: '获取单个人格模板',
    },

    /**
     * POST /persona-template - 创建用户模板
     */
    create: {
      method: 'POST',
      path: '',
      body: CreatePersonaTemplateInputSchema,
      responses: {
        201: ApiResponseSchema(PersonaTemplateSchema),
        400: ApiResponseSchema(z.object({ error: z.string() })),
      },
      summary: '创建用户人格模板',
    },

    /**
     * PUT /persona-template/:id - 更新用户模板
     */
    update: {
      method: 'PUT',
      path: '/:id',
      pathParams: z.object({ id: z.string().uuid() }),
      body: UpdatePersonaTemplateInputSchema,
      responses: {
        200: ApiResponseSchema(PersonaTemplateSchema),
        403: ApiResponseSchema(z.object({ error: z.string() })),
        404: ApiResponseSchema(z.object({ error: z.string() })),
      },
      summary: '更新用户人格模板',
    },

    /**
     * DELETE /persona-template/:id - 删除用户模板
     */
    delete: {
      method: 'DELETE',
      path: '/:id',
      pathParams: z.object({ id: z.string().uuid() }),
      body: z.object({}).optional(),
      responses: {
        200: ApiResponseSchema(SuccessResponseSchema),
        403: ApiResponseSchema(z.object({ error: z.string() })),
        404: ApiResponseSchema(z.object({ error: z.string() })),
      },
      summary: '删除用户人格模板',
    },

    /**
     * POST /persona-template/duplicate - 复制模板（系统或用户）
     */
    duplicate: {
      method: 'POST',
      path: '/duplicate',
      body: DuplicatePersonaTemplateInputSchema,
      responses: {
        201: ApiResponseSchema(PersonaTemplateSchema),
        404: ApiResponseSchema(z.object({ error: z.string() })),
      },
      summary: '复制人格模板',
    },
  },
  {
    pathPrefix: '/persona-template',
  },
);

/**
 * 带版本元数据的 Persona Template Contract
 */
export const personaTemplateContractVersioned = withVersion(
  personaTemplateContract,
  {
    version: API_VERSION.V1,
    pathPrefix: '/persona-template',
  },
);

export type PersonaTemplateContract = typeof personaTemplateContract;
