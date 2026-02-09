'use client';

import { useEffect, useState } from 'react';
import { useRouter } from 'next/navigation';
import { useForm } from 'react-hook-form';
import { zodResolver } from '@hookform/resolvers/zod';
import { toast } from 'sonner';
import { useTranslations } from 'next-intl';
import {
  Card,
  CardContent,
  CardDescription,
  CardHeader,
  CardTitle,
  Button,
  Input,
  Form,
  FormControl,
  FormField,
  FormItem,
  FormLabel,
  FormMessage,
} from '@repo/ui';
import { EmailLoginSchema, type EmailLogin } from '@repo/contracts';
import { signClient } from '@/lib/api/contracts/client';
import { clearAll, setLoginData } from '@/lib/storage';

export default function LoginPage() {
  const router = useRouter();
  const [isLoading, setIsLoading] = useState(false);
  const t = useTranslations('auth.login');

  // Clear auth storage on mount
  useEffect(() => {
    clearAll();
  }, []);

  const form = useForm<EmailLogin>({
    resolver: zodResolver(EmailLoginSchema),
    defaultValues: {
      email: '',
      password: '',
    },
  });

  const onSubmit = async (data: EmailLogin) => {
    setIsLoading(true);
    try {
      const response = await signClient.loginByEmail({
        body: data,
      });

      if (response.status === 200 && response.body?.code === 200) {
        const loginData = response.body.data;
        setLoginData(loginData);
        toast.success(t('success'));
        router.push('/bots');
      } else {
        const errorMsg = (response.body as { msg?: string })?.msg || t('failed');
        toast.error(errorMsg);
      }
    } catch (error) {
      toast.error(t('networkError'));
    } finally {
      setIsLoading(false);
    }
  };

  return (
    <Card className="w-full max-w-md mx-4">
      <CardHeader className="space-y-1">
        <CardTitle className="text-2xl font-bold text-center">
          {t('title')}
        </CardTitle>
        <CardDescription className="text-center">
          {t('subtitle')}
        </CardDescription>
      </CardHeader>
      <CardContent>
        <Form {...form}>
          <form onSubmit={form.handleSubmit(onSubmit)} className="space-y-4">
            <FormField
              control={form.control}
              name="email"
              render={({ field }) => (
                <FormItem>
                  <FormLabel>{t('email')}</FormLabel>
                  <FormControl>
                    <Input
                      type="email"
                      placeholder={t('emailPlaceholder')}
                      autoComplete="email"
                      {...field}
                    />
                  </FormControl>
                  <FormMessage />
                </FormItem>
              )}
            />
            <FormField
              control={form.control}
              name="password"
              render={({ field }) => (
                <FormItem>
                  <FormLabel>{t('password')}</FormLabel>
                  <FormControl>
                    <Input
                      type="password"
                      placeholder={t('passwordPlaceholder')}
                      autoComplete="current-password"
                      {...field}
                    />
                  </FormControl>
                  <FormMessage />
                </FormItem>
              )}
            />
            <Button type="submit" className="w-full" disabled={isLoading}>
              {isLoading ? t('submitting') : t('submit')}
            </Button>
          </form>
        </Form>
      </CardContent>
    </Card>
  );
}
