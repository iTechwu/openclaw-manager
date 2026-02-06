'use client';

import {
  createContext,
  useContext,
  useReducer,
  useCallback,
  type ReactNode,
} from 'react';
import type { SimpleCreateBotInput } from '@repo/contracts';
import { SCRATCH_TEMPLATE } from '@/lib/config';

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
  tags: string[];
}

export interface ValidationResult {
  valid: boolean;
  error?: string;
}

type WizardAction =
  | { type: 'SET_STEP'; step: number }
  | {
      type: 'SELECT_TEMPLATE';
      templateId: string;
      template?: { emoji?: string; avatarUrl?: string; soulMarkdown: string };
    }
  | { type: 'SET_BOT_NAME'; name: string }
  | { type: 'SET_HOSTNAME'; hostname: string }
  | { type: 'SET_EMOJI'; emoji: string }
  | { type: 'SET_AVATAR'; fileId: string; previewUrl: string }
  | { type: 'CLEAR_AVATAR' }
  | { type: 'SET_SOUL_MARKDOWN'; markdown: string }
  | { type: 'SET_TAGS'; tags: string[] }
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
  tags: [],
};

function wizardReducer(state: WizardState, action: WizardAction): WizardState {
  switch (action.type) {
    case 'SET_STEP':
      return { ...state, step: action.step };

    case 'SELECT_TEMPLATE': {
      const template =
        action.templateId === 'scratch' ? SCRATCH_TEMPLATE : action.template;
      if (!template) return state;
      return {
        ...state,
        selectedTemplateId: action.templateId,
        emoji: template.emoji || '',
        avatarPreviewUrl:
          'avatarUrl' in template ? (template.avatarUrl ?? '') : '',
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

    case 'SET_TAGS':
      return { ...state, tags: action.tags };

    case 'RESET':
      return initialState;

    default:
      return state;
  }
}

export function validateStep(
  step: number,
  state: WizardState,
): ValidationResult {
  switch (step) {
    case 1:
      // Template selection - optional but recommended
      return { valid: true };

    case 2:
      // Basic info validation
      if (!state.botName.trim()) {
        return { valid: false, error: 'Bot name is required' };
      }
      if (!state.hostname.trim()) {
        return { valid: false, error: 'Hostname is required' };
      }
      if (!/^[a-z0-9-]+$/.test(state.hostname)) {
        return {
          valid: false,
          error:
            'Hostname must be lowercase letters, numbers, and hyphens only',
        };
      }
      if (state.hostname.length < 2) {
        return {
          valid: false,
          error: 'Hostname must be at least 2 characters',
        };
      }
      if (state.hostname.length > 64) {
        return {
          valid: false,
          error: 'Hostname must be at most 64 characters',
        };
      }
      return { valid: true };

    case 3:
      // Persona - no required validation (system prompt is optional)
      return { valid: true };

    default:
      return { valid: true };
  }
}

export function buildSimpleCreateBotInput(
  state: WizardState,
): SimpleCreateBotInput {
  return {
    name: state.botName,
    hostname: state.hostname,
    personaTemplateId:
      state.selectedTemplateId && state.selectedTemplateId !== 'scratch'
        ? state.selectedTemplateId
        : undefined,
    persona: {
      name: state.botName,
      soulMarkdown: state.soulMarkdown,
      emoji: state.emoji || undefined,
      avatarFileId: state.avatarFileId || undefined,
      avatarUrl: state.avatarPreviewUrl || undefined,
    },
    tags: state.tags.length > 0 ? state.tags : undefined,
  };
}

interface WizardContextValue {
  state: WizardState;
  dispatch: React.Dispatch<WizardAction>;
  validate: (step: number) => ValidationResult;
  buildInput: () => SimpleCreateBotInput;
  canProceed: () => boolean;
}

const WizardContext = createContext<WizardContextValue | null>(null);

export function WizardProvider({ children }: { children: ReactNode }) {
  const [state, dispatch] = useReducer(wizardReducer, initialState);

  const validate = useCallback(
    (step: number) => validateStep(step, state),
    [state],
  );

  const buildInput = useCallback(
    () => buildSimpleCreateBotInput(state),
    [state],
  );

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
