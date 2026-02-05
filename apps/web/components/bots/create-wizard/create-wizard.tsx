'use client';

import { useState } from 'react';
import {
  WizardProvider,
  useWizard,
  getAvailableSubSteps,
  getNextSubStep,
  getPrevSubStep,
  isLastSubStep,
  isFirstSubStep,
} from './wizard-context';
import {
  Step1Templates,
  Step2Personality,
  Step3Features,
  Step4Config,
  Step5Review,
} from './steps';
import { useBots } from '@/hooks/useBots';
import {
  Dialog,
  DialogContent,
  DialogHeader,
  DialogTitle,
  Button,
  Alert,
} from '@repo/ui';
import { AlertCircle, Check } from 'lucide-react';
import { useTranslations } from 'next-intl';

const STEP_KEYS = [
  { titleKey: 'template', descKey: 'templateDesc' },
  { titleKey: 'personality', descKey: 'personalityDesc' },
  { titleKey: 'features', descKey: 'featuresDesc' },
  { titleKey: 'configure', descKey: 'configureDesc' },
  { titleKey: 'review', descKey: 'reviewDesc' },
] as const;

interface CreateBotWizardProps {
  isOpen: boolean;
  onClose: () => void;
}

function WizardContent({ onClose }: { onClose: () => void }) {
  const t = useTranslations('bots');
  const { state, dispatch, validate, buildInput, canProceed } = useWizard();
  const { handleCreate, createLoading } = useBots();
  const [error, setError] = useState<string | null>(null);

  // Get sub-step info for step 4
  const availableSubSteps = getAvailableSubSteps(state);
  const hasSubSteps = state.step === 4 && availableSubSteps.length > 0;

  const handleNext = () => {
    const result = validate(state.step);
    if (!result.valid) {
      setError(result.error || t('wizard.completeStep'));
      return;
    }

    // Handle step 4 sub-steps
    if (state.step === 4 && hasSubSteps && !isLastSubStep(state)) {
      const nextSubStep = getNextSubStep(state);
      if (nextSubStep) {
        dispatch({ type: 'SET_STEP4_SUBSTEP', subStep: nextSubStep });
        return;
      }
    }

    // Normal step navigation
    if (state.step < 5) {
      dispatch({ type: 'SET_STEP', step: state.step + 1 });
    }
  };

  const handleBack = () => {
    setError(null);

    // Handle step 4 sub-steps
    if (state.step === 4 && hasSubSteps && !isFirstSubStep(state)) {
      const prevSubStep = getPrevSubStep(state);
      if (prevSubStep) {
        dispatch({ type: 'SET_STEP4_SUBSTEP', subStep: prevSubStep });
        return;
      }
    }

    // Normal step navigation
    if (state.step > 1) {
      dispatch({ type: 'SET_STEP', step: state.step - 1 });
    }
  };

  const handleSubmit = async () => {
    setError(null);
    try {
      const input = buildInput();
      await handleCreate(input);
      dispatch({ type: 'RESET' });
      onClose();
    } catch (err) {
      setError(err instanceof Error ? err.message : t('messages.error'));
    }
  };

  const renderStepContent = () => {
    switch (state.step) {
      case 1:
        return <Step1Templates />;
      case 2:
        return <Step2Personality />;
      case 3:
        return <Step3Features />;
      case 4:
        return <Step4Config />;
      case 5:
        return <Step5Review />;
      default:
        return null;
    }
  };

  // Determine if we should show "Back" or "Cancel"
  const showCancel = state.step === 1;

  return (
    <div className="flex min-h-0 flex-1 flex-col">
      {/* Progress Steps */}
      <div className="mb-6 flex-shrink-0">
        <div className="flex justify-between">
          {STEP_KEYS.map((stepKey, index) => {
            const stepNum = index + 1;
            const isActive = stepNum === state.step;
            const isCompleted = stepNum < state.step;
            return (
              <div key={stepNum} className="flex flex-col items-center">
                <div
                  className={`flex h-8 w-8 items-center justify-center rounded-full text-sm font-medium transition-colors ${
                    isActive
                      ? 'bg-primary text-primary-foreground'
                      : isCompleted
                        ? 'bg-green-500 text-white'
                        : 'bg-muted text-muted-foreground'
                  }`}
                >
                  {isCompleted ? <Check className="h-4 w-4" /> : stepNum}
                </div>
                <div className="mt-1 text-center">
                  <div
                    className={`text-xs font-medium ${isActive ? 'text-primary' : 'text-muted-foreground'}`}
                  >
                    {t(`wizard.steps.${stepKey.titleKey}`)}
                  </div>
                </div>
              </div>
            );
          })}
        </div>
        {/* Current step description */}
        <div className="mt-4 text-center">
          <p className="text-muted-foreground text-sm">
            {t(`wizard.steps.${STEP_KEYS[state.step - 1]?.descKey}`)}
          </p>
        </div>
      </div>

      {/* Step Content */}
      <div className="min-h-0 flex-1 overflow-y-auto">
        {renderStepContent()}
      </div>

      {/* Error */}
      {error && (
        <Alert variant="destructive" className="mt-4">
          <AlertCircle className="size-4" />
          <span className="ml-2">{error}</span>
        </Alert>
      )}

      {/* Actions */}
      <div className="border-border mt-6 flex flex-shrink-0 justify-between border-t pt-4">
        <Button
          type="button"
          variant="outline"
          onClick={showCancel ? onClose : handleBack}
        >
          {showCancel ? t('wizard.actions.cancel') : t('wizard.actions.back')}
        </Button>
        {state.step < 5 ? (
          <Button type="button" onClick={handleNext} disabled={!canProceed()}>
            {t('wizard.actions.next')}
          </Button>
        ) : (
          <Button type="button" onClick={handleSubmit} disabled={createLoading}>
            {createLoading
              ? t('wizard.actions.creating')
              : t('wizard.actions.create')}
          </Button>
        )}
      </div>
    </div>
  );
}

export function CreateBotWizard({ isOpen, onClose }: CreateBotWizardProps) {
  const t = useTranslations('bots');

  return (
    <Dialog open={isOpen} onOpenChange={(open) => !open && onClose()}>
      <DialogContent className="flex h-[700px] max-w-4xl flex-col overflow-hidden">
        <DialogHeader className="flex-shrink-0">
          <DialogTitle>{t('wizard.title')}</DialogTitle>
        </DialogHeader>
        <WizardProvider>
          <WizardContent onClose={onClose} />
        </WizardProvider>
      </DialogContent>
    </Dialog>
  );
}
