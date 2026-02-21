import {
  LayoutDashboard,
  MessageSquare,
  Stethoscope,
  ScrollText,
  Settings,
  Puzzle,
  Sparkles,
  BarChart3,
  Cpu,
  UserCheck,
} from 'lucide-react';
import type { LucideIcon } from 'lucide-react';

export interface BotNavItem {
  id: string;
  labelKey: string;
  icon: LucideIcon;
  href: string;
  /** 条件性显示：需要满足的条件 */
  requires?: 'feishuChannel';
}

/**
 * Bot 单页管理导航配置
 * 参考 OpenClaw Manager 的导航结构
 */
export const botNavItems: BotNavItem[] = [
  { id: 'overview', labelKey: 'overview', icon: LayoutDashboard, href: '' },
  {
    id: 'channels',
    labelKey: 'channels',
    icon: MessageSquare,
    href: '/channels',
  },
  {
    id: 'pairing',
    labelKey: 'pairing',
    icon: UserCheck,
    href: '/pairing',
    requires: 'feishuChannel',
  },
  { id: 'models', labelKey: 'models', icon: Cpu, href: '/models' },
  { id: 'plugins', labelKey: 'plugins', icon: Puzzle, href: '/plugins' },
  { id: 'skills', labelKey: 'skills', icon: Sparkles, href: '/skills' },
  { id: 'usage', labelKey: 'usage', icon: BarChart3, href: '/usage' },
  {
    id: 'diagnostics',
    labelKey: 'diagnostics',
    icon: Stethoscope,
    href: '/diagnostics',
  },
  { id: 'logs', labelKey: 'logs', icon: ScrollText, href: '/logs' },
  { id: 'settings', labelKey: 'settings', icon: Settings, href: '/settings' },
];

/**
 * 扩展导航项（暂无）
 */
export const botNavExtendedItems: BotNavItem[] = [];
