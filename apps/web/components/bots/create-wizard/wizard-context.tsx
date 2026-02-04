'use client';

import {
  createContext,
  useContext,
  useReducer,
  useCallback,
  type ReactNode,
} from 'react';
import type { CreateBotInput, SessionScope } from '@repo/contracts';
import { SCRATCH_TEMPLATE } from '@/lib/config';
import { getDefaultModel } from '@/lib/config';

export interface WizardState {
  step: number;
  selectedTemplateId: string | null;
  botName: string;
  hostname: string;
  emoji: string;
  avatarFileId: string;
  avatarFile: File | null;
  avatarPreviewUrl: string;
  soulMarkdown: string;
  enabledProviders: string[];
  enabledChannels: string[];
  routingTags: string[];
  features: {
    commands: boolean;
    tts: boolean;
    ttsVoice: string;
    sandbox: boolean;
    sandboxTimeout: number;
    sessionScope: SessionScope;
  };
  providerConfigs: Record<string, { model: string; keyId?: string }>;
  channelConfigs: Record<string, { token: string }>;
}

export interface ValidationResult {
  valid: boolean;
  error?: string;
}

type WizardAction =
  | { type: 'SET_STEP'; step: number }
  | { type: 'SELECT_TEMPLATE'; templateId: string; template?: { emoji?: string; avatarUrl?: string; soulMarkdown: string } }
  | { type: 'SET_BOT_NAME'; name: string }
  | { type: 'SET_HOSTNAME'; hostname: string }
  | { type: 'SET_EMOJI'; emoji: string }
  | { type: 'SET_AVATAR'; fileId: string; previewUrl: string }
  | { type: 'CLEAR_AVATAR' }
  | { type: 'SET_SOUL_MARKDOWN'; markdown: string }
  | { type: 'TOGGLE_PROVIDER'; providerId: string }
  | { type: 'TOGGLE_CHANNEL'; channelId: string }
  | { type: 'SET_ROUTING_TAGS'; tags: string[] }
  | {
      type: 'SET_FEATURE';
      feature: keyof WizardState['features'];
      value: unknown;
    }
  | { type: 'SET_PROVIDER_CONFIG'; providerId: string; config: { model?: string; keyId?: string } }
  | { type: 'SET_CHANNEL_CONFIG'; channelId: string; config: { token: string } }
  | { type: 'RESET' };

const initialState: WizardState = {
  step: 1,
  selectedTemplateId: null,
  botName: '',
  hostname: '',
  emoji: '🤖',
  avatarFileId: '',
  avatarFile: null,
  avatarPreviewUrl: '',
  soulMarkdown: '',
  enabledProviders: [],
  enabledChannels: [],
  routingTags: [],
  features: {
    commands: true,
    tts: true,
    ttsVoice: 'alloy',
    sandbox: true,
    sandboxTimeout: 30,
    sessionScope: 'user',
  },
  providerConfigs: {},
  channelConfigs: {},
};

function wizardReducer(state: WizardState, action: WizardAction): WizardState {
  switch (action.type) {
    case 'SET_STEP':
      return { ...state, step: action.step };

    case 'SELECT_TEMPLATE': {
      // Use provided template data or fallback to SCRATCH_TEMPLATE for 'scratch'
      const template =
        action.templateId === 'scratch'
          ? SCRATCH_TEMPLATE
          : action.template;
      if (!template) return state;
      return {
        ...state,
        selectedTemplateId: action.templateId,
        emoji: template.emoji || '',
        avatarPreviewUrl: template.avatarUrl || '',
        avatarFileId: '',
        soulMarkdown: template.soulMarkdown,
      };
    }

    case 'SET_BOT_NAME':
      return { ...state, botName: action.name };

    case 'SET_HOSTNAME':
      return { ...state, hostname: action.hostname };

    case 'SET_EMOJI':
      return {
        ...state,
        emoji: action.emoji,
        avatarFileId: '',
        avatarPreviewUrl: '',
      };

    case 'SET_AVATAR':
      return {
        ...state,
        avatarFileId: action.fileId,
        avatarPreviewUrl: action.previewUrl,
        emoji: '',
      };

    case 'CLEAR_AVATAR':
      return {
        ...state,
        avatarFileId: '',
        avatarPreviewUrl: '',
        emoji: '🤖',
      };

    case 'SET_SOUL_MARKDOWN':
      return { ...state, soulMarkdown: action.markdown };

    case 'TOGGLE_PROVIDER': {
      const { providerId } = action;
      const enabled = state.enabledProviders.includes(providerId);
      if (enabled) {
        const { [providerId]: _, ...remainingConfigs } = state.providerConfigs;
        return {
          ...state,
          enabledProviders: state.enabledProviders.filter(
            (p) => p !== providerId
          ),
          providerConfigs: remainingConfigs,
        };
      } else {
        return {
          ...state,
          enabledProviders: [...state.enabledProviders, providerId],
          providerConfigs: {
            ...state.providerConfigs,
            [providerId]: { model: getDefaultModel(providerId) },
          },
        };
      }
    }

    case 'TOGGLE_CHANNEL': {
      const { channelId } = action;
      const enabled = state.enabledChannels.includes(channelId);
      if (enabled) {
        const { [channelId]: _, ...remainingConfigs } = state.channelConfigs;
        return {
          ...state,
          enabledChannels: state.enabledChannels.filter((c) => c !== channelId),
          channelConfigs: remainingConfigs,
        };
      } else {
        return {
          ...state,
          enabledChannels: [...state.enabledChannels, channelId],
          channelConfigs: {
            ...state.channelConfigs,
            [channelId]: { token: '' },
          },
        };
      }
    }

    case 'SET_ROUTING_TAGS':
      return { ...state, routingTags: action.tags };

    case 'SET_FEATURE':
      return {
        ...state,
        features: {
          ...state.features,
          [action.feature]: action.value,
        },
      };

    case 'SET_PROVIDER_CONFIG': {
      const existingConfig = state.providerConfigs[action.providerId] || { model: '' };
      return {
        ...state,
        providerConfigs: {
          ...state.providerConfigs,
          [action.providerId]: {
            ...existingConfig,
            ...action.config,
          },
        },
      };
    }

    case 'SET_CHANNEL_CONFIG':
      return {
        ...state,
        channelConfigs: {
          ...state.channelConfigs,
          [action.channelId]: action.config,
        },
      };

    case 'RESET':
      return initialState;

    default:
      return state;
  }
}

export function validateStep(
  step: number,
  state: WizardState
): ValidationResult {
  switch (step) {
    case 1:
      // Templates - no required selection
      return { valid: true };

    case 2:
      // Personality
      if (!state.botName.trim()) {
        return { valid: false, error: 'Bot name is required' };
      }
      if (!state.hostname.trim()) {
        return { valid: false, error: 'Hostname is required' };
      }
      if (!/^[a-z0-9-]+$/.test(state.hostname)) {
        return {
          valid: false,
          error: 'Hostname must be lowercase letters, numbers, and hyphens only',
        };
      }
      if (state.hostname.length < 2) {
        return { valid: false, error: 'Hostname must be at least 2 characters' };
      }
      if (state.hostname.length > 64) {
        return {
          valid: false,
          error: 'Hostname must be at most 64 characters',
        };
      }
      return { valid: true };

    case 3:
      // Features & Toggles
      if (state.enabledProviders.length === 0) {
        return { valid: false, error: 'Select at least one LLM provider' };
      }
      if (state.enabledChannels.length === 0) {
        return { valid: false, error: 'Select at least one channel' };
      }
      return { valid: true };

    case 4:
      // Config details
      for (const channelId of state.enabledChannels) {
        const config = state.channelConfigs[channelId];
        if (!config?.token?.trim()) {
          return { valid: false, error: `Token required for ${channelId}` };
        }
      }
      return { valid: true };

    case 5:
      // Summary - review only
      return { valid: true };

    default:
      return { valid: true };
  }
}

export function buildCreateBotInput(state: WizardState): CreateBotInput {
  const providers = state.enabledProviders.map((providerId) => ({
    providerId,
    model: state.providerConfigs[providerId]?.model || '',
    keyId: state.providerConfigs[providerId]?.keyId,
  }));

  const channels = state.enabledChannels.map((channelType) => ({
    channelType,
    token: state.channelConfigs[channelType]?.token || '',
  }));

  return {
    name: state.botName,
    hostname: state.hostname,
    providers,
    channels,
    personaTemplateId: state.selectedTemplateId && state.selectedTemplateId !== 'scratch'
      ? state.selectedTemplateId
      : undefined,
    persona: {
      name: state.botName,
      soulMarkdown: state.soulMarkdown,
      emoji: state.emoji || undefined,
      avatarFileId: state.avatarFileId || undefined,
      avatarUrl: state.avatarPreviewUrl || undefined,
    },
    features: {
      commands: state.features.commands,
      tts: state.features.tts,
      ttsVoice: state.features.tts ? state.features.ttsVoice : undefined,
      sandbox: state.features.sandbox,
      sandboxTimeout: state.features.sandbox
        ? state.features.sandboxTimeout
        : undefined,
      sessionScope: state.features.sessionScope,
    },
    tags: state.routingTags.length > 0 ? state.routingTags : undefined,
  };
}

interface WizardContextValue {
  state: WizardState;
  dispatch: React.Dispatch<WizardAction>;
  validate: (step: number) => ValidationResult;
  buildInput: () => CreateBotInput;
  canProceed: () => boolean;
}

const WizardContext = createContext<WizardContextValue | null>(null);

export function WizardProvider({ children }: { children: ReactNode }) {
  const [state, dispatch] = useReducer(wizardReducer, initialState);

  const validate = useCallback(
    (step: number) => validateStep(step, state),
    [state]
  );

  const buildInput = useCallback(() => buildCreateBotInput(state), [state]);

  const canProceed = useCallback(() => {
    const result = validateStep(state.step, state);
    return result.valid;
  }, [state]);

  return (
    <WizardContext.Provider
      value={{ state, dispatch, validate, buildInput, canProceed }}
    >
      {children}
    </WizardContext.Provider>
  );
}

export function useWizard() {
  const context = useContext(WizardContext);
  if (!context) {
    throw new Error('useWizard must be used within a WizardProvider');
  }
  return context;
}
