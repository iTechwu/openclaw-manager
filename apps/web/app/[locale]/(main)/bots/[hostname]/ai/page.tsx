'use client';

import { useEffect } from 'react';
import { useParams, useRouter } from 'next/navigation';

export default function BotAIConfigPage() {
  const params = useParams<{ hostname: string }>();
  const router = useRouter();

  useEffect(() => {
    router.replace(`/bots/${params.hostname}/models`);
  }, [params.hostname, router]);

  return null;
}
