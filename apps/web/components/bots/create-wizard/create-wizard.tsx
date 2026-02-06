'use client';

import { useState } from 'react';
import { useRouter } from 'next/navigation';
import { WizardProvider, useWizard } from './wizard-context';
import { Step1Template, Step2BasicInfo, Step3Persona } from './steps';
import { useBots } from '@/hooks/useBots';
import { Dialog, DialogContent, DialogTitle, Button, cn } from '@repo/ui';
import {
  Bot,
  Sparkles,
  ArrowRight,
  ArrowLeft,
  Loader2,
  X,
  AlertCircle,
  LayoutTemplate,
} from 'lucide-react';
import { useTranslations } from 'next-intl';
import { toast } from 'sonner';

interface CreateBotWizardProps {
  isOpen: boolean;
  onClose: () => void;
}

function StepIndicator({
  step,
  currentStep,
  title,
  icon: Icon,
}: {
  step: number;
  currentStep: number;
  title: string;
  icon: React.ElementType;
}) {
  const isActive = step === currentStep;
  const isCompleted = step < currentStep;

  return (
    <div className="flex items-center gap-3">
      <div
        className={cn(
          'flex size-10 items-center justify-center rounded-xl transition-all duration-300',
          isActive &&
            'bg-primary text-primary-foreground shadow-lg shadow-primary/25',
          isCompleted && 'bg-green-500/10 text-green-600',
          !isActive && !isCompleted && 'bg-muted text-muted-foreground',
        )}
      >
        <Icon className="size-5" />
      </div>
      <div className="hidden sm:block">
        <div
          className={cn(
            'text-sm font-medium transition-colors',
            isActive ? 'text-foreground' : 'text-muted-foreground',
          )}
        >
          {title}
        </div>
      </div>
    </div>
  );
}

function WizardContent({ onClose }: { onClose: () => void }) {
  const t = useTranslations('bots');
  const router = useRouter();
  const { state, dispatch, validate, buildInput } = useWizard();
  const { handleCreateSimple, createSimpleLoading } = useBots();
  const [error, setError] = useState<string | null>(null);

  const currentStep = state.step;

  const steps = [
    { step: 1, title: t('wizard.steps.template'), icon: LayoutTemplate },
    { step: 2, title: t('wizard.steps.basicInfo'), icon: Bot },
    { step: 3, title: t('wizard.steps.persona'), icon: Sparkles },
  ];

  const handleNext = () => {
    if (currentStep < 3) {
      dispatch({ type: 'SET_STEP', step: currentStep + 1 });
    }
  };

  const handlePrev = () => {
    if (currentStep > 1) {
      dispatch({ type: 'SET_STEP', step: currentStep - 1 });
    }
  };

  const handleCreate = async () => {
    setError(null);
    try {
      const input = buildInput();
      const bot = await handleCreateSimple(input);
      if (bot) {
        toast.success(t('wizard.createSuccess'));
        onClose();
        router.push(`/bots/${bot.hostname}`);
      }
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Failed to create bot');
    }
  };

  const canProceed = validate(currentStep).valid;
  const isLastStep = currentStep === 3;

  return (
    <>
      {/* Header */}
      <div className="relative flex shrink-0 items-center justify-center border-b px-6 py-4">
        <div className="flex items-center gap-6">
          {steps.map((s, idx) => (
            <div key={s.step} className="flex items-center">
              <StepIndicator
                step={s.step}
                currentStep={currentStep}
                title={s.title}
                icon={s.icon}
              />
              {idx < steps.length - 1 && (
                <div className="ml-4 hidden h-px w-8 bg-border sm:block" />
              )}
            </div>
          ))}
        </div>
        <Button
          variant="ghost"
          size="icon"
          onClick={onClose}
          className="absolute right-4 size-8 rounded-full"
        >
          <X className="size-4" />
        </Button>
      </div>

      {/* Content */}
      <div className="flex min-h-0 flex-1 flex-col overflow-hidden px-6 py-6">
        {currentStep === 1 && <Step1Template />}
        {currentStep === 2 && <Step2BasicInfo />}
        {currentStep === 3 && <Step3Persona />}
      </div>

      {/* Error */}
      {error && (
        <div className="mx-6 mb-4 flex shrink-0 items-center gap-2 rounded-lg bg-destructive/10 px-4 py-3 text-sm text-destructive">
          <AlertCircle className="size-4 shrink-0" />
          <span>{error}</span>
        </div>
      )}

      {/* Footer - Fixed at bottom */}
      <div className="flex shrink-0 items-center justify-between border-t px-6 py-4">
        <Button
          variant="outline"
          onClick={handlePrev}
          disabled={currentStep === 1}
          className="gap-2"
        >
          <ArrowLeft className="size-4" />
          {t('wizard.prev')}
        </Button>

        {isLastStep ? (
          <Button
            onClick={handleCreate}
            disabled={!canProceed || createSimpleLoading}
            className="gap-2"
          >
            {createSimpleLoading ? (
              <Loader2 className="size-4 animate-spin" />
            ) : (
              <Sparkles className="size-4" />
            )}
            {t('wizard.create')}
          </Button>
        ) : (
          <Button onClick={handleNext} disabled={!canProceed} className="gap-2">
            {t('wizard.next')}
            <ArrowRight className="size-4" />
          </Button>
        )}
      </div>
    </>
  );
}

export function CreateBotWizard({ isOpen, onClose }: CreateBotWizardProps) {
  const t = useTranslations('bots');

  return (
    <Dialog open={isOpen} onOpenChange={(open) => !open && onClose()}>
      <DialogContent
        className="flex h-[85vh] max-h-[700px] w-full max-w-2xl flex-col overflow-hidden p-0"
        hideCloseButton
      >
        <DialogTitle className="sr-only">{t('wizard.title')}</DialogTitle>
        <WizardProvider>
          <WizardContent onClose={onClose} />
        </WizardProvider>
      </DialogContent>
    </Dialog>
  );
}
