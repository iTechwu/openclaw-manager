'use client';

import Link from 'next/link';
import { usePathname } from 'next/navigation';
import { useTranslations } from 'next-intl';
import { Bot, Key, Activity, Sparkles, Puzzle, Wrench } from 'lucide-react';
import {
  Sidebar,
  SidebarContent,
  SidebarFooter,
  SidebarGroup,
  SidebarGroupContent,
  SidebarGroupLabel,
  SidebarMenu,
  SidebarMenuButton,
  SidebarMenuItem,
  SidebarMenuBadge,
  SidebarRail,
  SidebarTrigger,
} from '@repo/ui';
import { useBots } from '@/hooks/useBots';
import { usePersonaTemplates } from '@/hooks/usePersonaTemplates';

const navItems = [
  {
    titleKey: 'bots',
    href: '/bots',
    icon: Bot,
    badgeKey: 'runningBots',
  },
  {
    titleKey: 'plugins',
    href: '/plugins',
    icon: Puzzle,
  },
  {
    titleKey: 'skills',
    href: '/skills',
    icon: Wrench,
  },
  {
    titleKey: 'templates',
    href: '/templates',
    icon: Sparkles,
    badgeKey: 'userTemplates',
  },
  {
    titleKey: 'secrets',
    href: '/secrets',
    icon: Key,
  },
  {
    titleKey: 'diagnostics',
    href: '/diagnostics',
    icon: Activity,
  },
];

export function AppSidebar() {
  const t = useTranslations('common.nav');
  const pathname = usePathname();
  const { bots } = useBots();
  const { userCount } = usePersonaTemplates();

  // Remove locale prefix from pathname for comparison
  const currentPath = pathname.replace(/^\/[a-z]{2}(-[a-z]{2})?/i, '') || '/';

  // Calculate activity badges
  const runningBotsCount = bots.filter(
    (bot) => bot.status === 'running',
  ).length;

  const getBadgeValue = (badgeKey?: string): number | undefined => {
    if (!badgeKey) return undefined;
    switch (badgeKey) {
      case 'runningBots':
        return runningBotsCount > 0 ? runningBotsCount : undefined;
      case 'userTemplates':
        return userCount > 0 ? userCount : undefined;
      default:
        return undefined;
    }
  };

  return (
    <Sidebar collapsible="icon" variant="sidebar">
      <SidebarContent className="pt-2">
        <SidebarGroup>
          <SidebarGroupLabel className="text-sidebar-foreground/50 uppercase tracking-wider text-[10px] font-medium">
            {t('management')}
          </SidebarGroupLabel>
          <SidebarGroupContent>
            <SidebarMenu>
              {navItems.map((item) => {
                const isActive =
                  currentPath === item.href ||
                  currentPath.startsWith(`${item.href}/`);
                const title = t(item.titleKey);
                const badgeValue = getBadgeValue(item.badgeKey);
                return (
                  <SidebarMenuItem key={item.href}>
                    <SidebarMenuButton
                      asChild
                      isActive={isActive}
                      tooltip={title}
                      className="transition-colors"
                    >
                      <Link href={item.href}>
                        <item.icon className="size-4" />
                        <span className="font-medium">{title}</span>
                      </Link>
                    </SidebarMenuButton>
                    {badgeValue !== undefined && (
                      <SidebarMenuBadge>{badgeValue}</SidebarMenuBadge>
                    )}
                  </SidebarMenuItem>
                );
              })}
            </SidebarMenu>
          </SidebarGroupContent>
        </SidebarGroup>
      </SidebarContent>

      <SidebarFooter>
        {/* Sidebar Toggle Button - positioned at right when expanded */}
        <div className="flex justify-end group-data-[collapsible=icon]:justify-center">
          <SidebarTrigger className="size-8" />
        </div>
      </SidebarFooter>

      <SidebarRail />
    </Sidebar>
  );
}
