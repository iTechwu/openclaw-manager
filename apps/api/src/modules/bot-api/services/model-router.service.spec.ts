import { Test, TestingModule } from '@nestjs/testing';
import { WINSTON_MODULE_PROVIDER } from 'nest-winston';
import { ModelRouterService, RouteRequest } from './model-router.service';
import {
  BotModelRoutingService,
  BotModelService,
  ProviderKeyService,
  ModelAvailabilityService,
} from '@app/db';
import { BotModelRouting, ModelRoutingType } from '@prisma/client';

describe('ModelRouterService', () => {
  let service: ModelRouterService;
  let botModelRoutingService: any;
  let botModelService: any;
  let providerKeyService: any;
  let modelAvailabilityService: any;

  const mockLogger = {
    info: jest.fn(),
    warn: jest.fn(),
    error: jest.fn(),
    debug: jest.fn(),
  };

  const mockProviderKey = {
    id: 'provider-key-1',
    vendor: 'openai',
    apiType: 'openai',
    baseUrl: 'https://api.openai.com',
  };

  const mockBotModel = {
    id: 'bot-model-1',
    botId: 'bot-1',
    modelId: 'gpt-4o',
    isPrimary: true,
    isEnabled: true,
  };

  const mockModelAvailability = {
    id: 'availability-1',
    model: 'gpt-4o',
    providerKeyId: 'provider-key-1',
    isAvailable: true,
  };

  beforeEach(async () => {
    const module: TestingModule = await Test.createTestingModule({
      providers: [
        ModelRouterService,
        {
          provide: WINSTON_MODULE_PROVIDER,
          useValue: mockLogger,
        },
        {
          provide: BotModelRoutingService,
          useValue: {
            list: jest.fn(),
            getById: jest.fn(),
          },
        },
        {
          provide: BotModelService,
          useValue: {
            get: jest.fn(),
            list: jest.fn(),
          },
        },
        {
          provide: ProviderKeyService,
          useValue: {
            getById: jest.fn(),
          },
        },
        {
          provide: ModelAvailabilityService,
          useValue: {
            list: jest.fn(),
          },
        },
      ],
    }).compile();

    service = module.get<ModelRouterService>(ModelRouterService);
    botModelRoutingService = module.get(BotModelRoutingService);
    botModelService = module.get(BotModelService);
    providerKeyService = module.get(ProviderKeyService);
    modelAvailabilityService = module.get(ModelAvailabilityService);

    // Reset mocks
    jest.clearAllMocks();
  });

  afterEach(() => {
    service.clearLoadBalanceState();
  });

  it('should be defined', () => {
    expect(service).toBeDefined();
  });

  describe('routeRequest', () => {
    describe('with no routing configs', () => {
      it('should return default route when no routing configs exist', async () => {
        botModelRoutingService.list.mockResolvedValue({ list: [], total: 0 });
        botModelService.get.mockResolvedValue(mockBotModel as any);
        modelAvailabilityService.list.mockResolvedValue({
          list: [mockModelAvailability],
          total: 1,
        });
        providerKeyService.getById.mockResolvedValue(mockProviderKey as any);

        const request: RouteRequest = {
          botId: 'bot-1',
          message: 'Hello world',
        };

        const result = await service.routeRequest(request);

        expect(result.vendor).toBe('openai');
        expect(result.model).toBe('gpt-4o');
        expect(result.reason).toContain('Default route');
      });
    });

    describe('function routing', () => {
      const createFunctionRouteConfig = (
        rules: Array<{ pattern: string; matchType: string; model: string }>,
        defaultModel: string,
      ): BotModelRouting => ({
        id: 'routing-1',
        name: 'Function Route Config',
        botId: 'bot-1',
        routingType: 'FUNCTION_ROUTE' as ModelRoutingType,
        config: {
          type: 'function_route',
          rules: rules.map((r) => ({
            pattern: r.pattern,
            matchType: r.matchType,
            target: { providerKeyId: 'provider-key-1', model: r.model },
          })),
          defaultTarget: {
            providerKeyId: 'provider-key-1',
            model: defaultModel,
          },
        },
        priority: 100,
        isEnabled: true,
        isDeleted: false,
        createdAt: new Date(),
        updatedAt: new Date(),
        deletedAt: null as unknown as Date,
      });

      it('should match keyword pattern', async () => {
        const routing = createFunctionRouteConfig(
          [
            {
              pattern: '代码|编程|bug',
              matchType: 'keyword',
              model: 'deepseek-coder',
            },
          ],
          'gpt-4o',
        );

        botModelRoutingService.list.mockResolvedValue({
          list: [routing],
          total: 1,
        });
        providerKeyService.getById.mockResolvedValue(mockProviderKey as any);

        const result = await service.routeRequest({
          botId: 'bot-1',
          message: '帮我写一段代码',
        });

        expect(result.model).toBe('deepseek-coder');
        expect(result.matchedRule).toBe('代码|编程|bug');
      });

      it('should match regex pattern', async () => {
        const routing = createFunctionRouteConfig(
          [
            {
              pattern: '\\d{4}-\\d{2}-\\d{2}',
              matchType: 'regex',
              model: 'gpt-4o',
            },
          ],
          'gpt-4o-mini',
        );

        botModelRoutingService.list.mockResolvedValue({
          list: [routing],
          total: 1,
        });
        providerKeyService.getById.mockResolvedValue(mockProviderKey as any);

        const result = await service.routeRequest({
          botId: 'bot-1',
          message: '查询 2024-01-15 的数据',
        });

        expect(result.model).toBe('gpt-4o');
      });

      it('should use default target when no rules match', async () => {
        const routing = createFunctionRouteConfig(
          [
            {
              pattern: 'xyz123',
              matchType: 'keyword',
              model: 'deepseek-coder',
            },
          ],
          'gpt-4o-mini',
        );

        botModelRoutingService.list.mockResolvedValue({
          list: [routing],
          total: 1,
        });
        providerKeyService.getById.mockResolvedValue(mockProviderKey as any);

        const result = await service.routeRequest({
          botId: 'bot-1',
          message: 'Hello world',
        });

        expect(result.model).toBe('gpt-4o-mini');
        expect(result.reason).toContain('default target');
      });
    });

    describe('load balancing', () => {
      const createLoadBalanceConfig = (
        strategy: string,
        targets: Array<{ model: string; weight: number }>,
      ): BotModelRouting => ({
        id: 'routing-lb-1',
        name: 'Load Balance Config',
        botId: 'bot-1',
        routingType: 'LOAD_BALANCE' as ModelRoutingType,
        config: {
          type: 'load_balance',
          strategy,
          targets: targets.map((t) => ({
            providerKeyId: 'provider-key-1',
            model: t.model,
            weight: t.weight,
          })),
        },
        priority: 100,
        isEnabled: true,
        isDeleted: false,
        createdAt: new Date(),
        updatedAt: new Date(),
        deletedAt: null as unknown as Date,
      });

      it('should use round-robin strategy', async () => {
        const routing = createLoadBalanceConfig('round_robin', [
          { model: 'model-a', weight: 1 },
          { model: 'model-b', weight: 1 },
          { model: 'model-c', weight: 1 },
        ]);

        botModelRoutingService.list.mockResolvedValue({
          list: [routing],
          total: 1,
        });
        providerKeyService.getById.mockResolvedValue(mockProviderKey as any);

        const results: string[] = [];
        for (let i = 0; i < 6; i++) {
          const result = await service.routeRequest({
            botId: 'bot-1',
            message: 'test',
          });
          results.push(result.model);
        }

        // Round-robin should cycle through models
        expect(results).toEqual([
          'model-a',
          'model-b',
          'model-c',
          'model-a',
          'model-b',
          'model-c',
        ]);
      });

      it('should use weighted strategy', async () => {
        const routing = createLoadBalanceConfig('weighted', [
          { model: 'model-heavy', weight: 90 },
          { model: 'model-light', weight: 10 },
        ]);

        botModelRoutingService.list.mockResolvedValue({
          list: [routing],
          total: 1,
        });
        providerKeyService.getById.mockResolvedValue(mockProviderKey as any);

        // Run multiple times to verify weighted distribution
        const counts: Record<string, number> = {
          'model-heavy': 0,
          'model-light': 0,
        };
        for (let i = 0; i < 100; i++) {
          const result = await service.routeRequest({
            botId: 'bot-1',
            message: 'test',
          });
          counts[result.model]++;
        }

        // Heavy model should be selected more often
        expect(counts['model-heavy']).toBeGreaterThan(counts['model-light']);
      });
    });

    describe('failover', () => {
      const createFailoverConfig = (): BotModelRouting => ({
        id: 'routing-fo-1',
        name: 'Failover Config',
        botId: 'bot-1',
        routingType: 'FAILOVER' as ModelRoutingType,
        config: {
          type: 'failover',
          primary: { providerKeyId: 'provider-key-1', model: 'primary-model' },
          fallbackChain: [
            { providerKeyId: 'provider-key-1', model: 'fallback-1' },
            { providerKeyId: 'provider-key-1', model: 'fallback-2' },
          ],
          retry: { maxAttempts: 2, delayMs: 100 },
        },
        priority: 100,
        isEnabled: true,
        isDeleted: false,
        createdAt: new Date(),
        updatedAt: new Date(),
        deletedAt: null as unknown as Date,
      });

      it('should return primary target for failover routing', async () => {
        const routing = createFailoverConfig();

        botModelRoutingService.list.mockResolvedValue({
          list: [routing],
          total: 1,
        });
        providerKeyService.getById.mockResolvedValue(mockProviderKey as any);

        const result = await service.routeRequest({
          botId: 'bot-1',
          message: 'test',
        });

        expect(result.model).toBe('primary-model');
        expect(result.reason).toContain('Failover primary');
      });
    });
  });

  describe('testRoute', () => {
    it('should return the same result as routeRequest', async () => {
      botModelRoutingService.list.mockResolvedValue({ list: [], total: 0 });
      botModelService.get.mockResolvedValue(mockBotModel as any);
      modelAvailabilityService.list.mockResolvedValue({
        list: [mockModelAvailability],
        total: 1,
      });
      providerKeyService.getById.mockResolvedValue(mockProviderKey as any);

      const request: RouteRequest = {
        botId: 'bot-1',
        message: 'test message',
      };

      const routeResult = await service.routeRequest(request);
      const testResult = await service.testRoute(request);

      expect(testResult.vendor).toBe(routeResult.vendor);
      expect(testResult.model).toBe(routeResult.model);
    });
  });

  describe('clearLoadBalanceState', () => {
    it('should clear specific routing state', async () => {
      const routing: BotModelRouting = {
        id: 'routing-lb-1',
        name: 'Load Balance Config',
        botId: 'bot-1',
        routingType: 'LOAD_BALANCE' as ModelRoutingType,
        config: {
          type: 'load_balance',
          strategy: 'round_robin',
          targets: [
            { providerKeyId: 'provider-key-1', model: 'model-a', weight: 1 },
            { providerKeyId: 'provider-key-1', model: 'model-b', weight: 1 },
          ],
        },
        priority: 100,
        isEnabled: true,
        isDeleted: false,
        createdAt: new Date(),
        updatedAt: new Date(),
        deletedAt: null as unknown as Date,
      };

      botModelRoutingService.list.mockResolvedValue({
        list: [routing],
        total: 1,
      });
      providerKeyService.getById.mockResolvedValue(mockProviderKey as any);

      // Make some requests to advance the round-robin state
      await service.routeRequest({ botId: 'bot-1', message: 'test' });
      await service.routeRequest({ botId: 'bot-1', message: 'test' });

      // Clear state
      service.clearLoadBalanceState('routing-lb-1');

      // Next request should start from index 0 again
      const result = await service.routeRequest({
        botId: 'bot-1',
        message: 'test',
      });
      expect(result.model).toBe('model-a');
    });
  });
});
