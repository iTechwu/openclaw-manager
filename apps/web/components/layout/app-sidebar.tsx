'use client';

import Link from 'next/link';
import { usePathname } from 'next/navigation';
import { useTranslations } from 'next-intl';
import { Bot, Activity, Sparkles, Puzzle, Wrench, Route } from 'lucide-react';
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
import { cn } from '@repo/ui/lib/utils';
import { useBots } from '@/hooks/useBots';
import { usePersonaTemplates } from '@/hooks/usePersonaTemplates';
import { useIsAdmin } from '@/lib/permissions';

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
    titleKey: 'routing',
    href: '/routing',
    icon: Route,
  },
  {
    titleKey: 'diagnostics',
    href: '/diagnostics',
    icon: Activity,
    adminOnly: true,
  },
];

export function AppSidebar() {
  const t = useTranslations('common.nav');
  const pathname = usePathname();
  const { bots } = useBots();
  const { userCount } = usePersonaTemplates();
  const isAdmin = useIsAdmin();

  // Remove locale prefix from pathname for comparison
  // Only match valid locales: 'en' or 'zh-CN' (case insensitive)
  const currentPath = pathname.replace(/^\/(en|zh-CN)(?=\/|$)/i, '') || '/';

  // Filter nav items based on admin status
  const filteredNavItems = navItems.filter(
    (item) => !item.adminOnly || isAdmin
  );

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
      <SidebarContent className="pt-4">
        <SidebarGroup>
          <SidebarGroupLabel className="text-sidebar-foreground/40 uppercase tracking-widest text-[10px] font-medium px-3 mb-1">
            {t('management')}
          </SidebarGroupLabel>
          <SidebarGroupContent>
            <SidebarMenu className="gap-1 px-2">
              {filteredNavItems.map((item) => {
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
                      className={cn(
                        'relative h-9 rounded-md transition-all duration-150',
                        isActive
                          ? [
                              'bg-sidebar-accent/80',
                              'text-sidebar-foreground',
                              'font-medium',
                              'shadow-sm',
                            ]
                          : [
                              'text-sidebar-foreground/70',
                              'hover:text-sidebar-foreground',
                              'hover:bg-sidebar-accent/50',
                            ],
                      )}
                    >
                      <Link href={item.href}>
                        <item.icon
                          className={cn(
                            'size-4 shrink-0',
                            isActive
                              ? 'text-sidebar-foreground'
                              : 'text-sidebar-foreground/60',
                          )}
                        />
                        <span className="truncate">{title}</span>
                        {isActive && (
                          <span className="absolute left-0 top-1/2 -translate-y-1/2 w-[3px] h-5 bg-sidebar-foreground rounded-r-full" />
                        )}
                      </Link>
                    </SidebarMenuButton>
                    {badgeValue !== undefined && (
                      <SidebarMenuBadge className="bg-sidebar-accent text-sidebar-foreground/80 text-[10px] min-w-5 h-5">
                        {badgeValue}
                      </SidebarMenuBadge>
                    )}
                  </SidebarMenuItem>
                );
              })}
            </SidebarMenu>
          </SidebarGroupContent>
        </SidebarGroup>
      </SidebarContent>

      <SidebarFooter className="border-t border-sidebar-border/50">
        <div className="flex justify-end p-2 group-data-[collapsible=icon]:justify-center">
          <SidebarTrigger className="size-8 text-sidebar-foreground/60 hover:text-sidebar-foreground hover:bg-sidebar-accent/50" />
        </div>
      </SidebarFooter>

      <SidebarRail />
    </Sidebar>
  );
}
