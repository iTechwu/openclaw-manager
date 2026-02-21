'use client';

import { useWizard } from '../wizard-context';
import type { BotType } from '@repo/contracts';
import { Bot, Code, Globe } from 'lucide-react';

const BOT_TYPES: Array<{
  type: BotType;
  icon: React.ElementType;
  titleKey: string;
  descriptionKey: string;
}> = [
  {
    type: 'GATEWAY',
    icon: Bot,
    titleKey: 'botType.gateway.title',
    descriptionKey: 'botType.gateway.description',
  },
  {
    type: 'TOOL_SANDBOX',
    icon: Code,
    titleKey: 'botType.toolSandbox.title',
    descriptionKey: 'botType.toolSandbox.description',
  },
  {
    type: 'BROWSER_SANDBOX',
    icon: Globe,
    titleKey: 'botType.browserSandbox.title',
    descriptionKey: 'botType.browserSandbox.description',
  },
];

interface BotTypeSelectorProps {
  className?: string;
}

export function BotTypeSelector({ className }: BotTypeSelectorProps) {
  const { state, dispatch } = useWizard();

  const handleSelect = (type: BotType) => {
    dispatch({ type: 'SET_BOT_TYPE', botType: type });
  };

  return (
    <div
      className={[
        'grid grid-cols-1 gap-4 md:grid-cols-3',
        className,
      ].filter(Boolean).join(' ')}
    >
      {BOT_TYPES.map(({ type, icon: Icon, titleKey, descriptionKey }) => (
        <button
          key={type}
          type="button"
          onClick={() => handleSelect(type)}
          className={[
            'flex flex-col items-start rounded-lg border-2 p-4 text-left transition-all hover:border-primary/50',
            state.botType === type
              ? 'border-primary bg-primary/5'
              : 'border-border hover:bg-muted/50',
          ].join(' ')}
        >
          <div className="mb-3 flex h-10 w-10 items-center justify-center rounded-lg bg-muted">
            <Icon className="h-5 w-5 text-muted-foreground" />
          </div>
          <div className="font-medium">
            {titleKey.split('.').pop()?.replace(/([A-Z])/g, ' $1').trim()}
          </div>
          <p className="mt-1 text-sm text-muted-foreground">
            {descriptionKey.split('.').pop()?.replace(/([A-Z])/g, ' $1').trim()}
          </p>
        </button>
      ))}
    </div>
  );
}
