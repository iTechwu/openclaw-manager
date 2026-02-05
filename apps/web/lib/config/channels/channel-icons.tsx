import Image, { type StaticImageData } from 'next/image';

// Import SVG icons for supported channels
import FeishuSvg from './icons/feishu.svg';
import TelegramSvg from './icons/telegram.svg';
import DiscordSvg from './icons/discord.svg';
import SlackSvg from './icons/slack.svg';
import WhatsAppSvg from './icons/whatsapp.svg';
import WeChatSvg from './icons/wechat.svg';
import LineSvg from './icons/line.svg';
import TeamsSvg from './icons/teams.svg';
import TwitterSvg from './icons/twitter.svg';
import InstagramSvg from './icons/instagram.svg';
import GenericSvg from './icons/generic.svg';

interface ChannelIconProps {
  channelId: string;
  className?: string;
  size?: number;
}

// Map of channel IDs to their SVG icons
const iconMap: Record<string, StaticImageData> = {
  feishu: FeishuSvg,
  telegram: TelegramSvg,
  discord: DiscordSvg,
  slack: SlackSvg,
  whatsapp: WhatsAppSvg,
  wechat: WeChatSvg,
  line: LineSvg,
  teams: TeamsSvg,
  twitter: TwitterSvg,
  instagram: InstagramSvg,
};

// Brand colors for each channel
export const channelColors: Record<string, string> = {
  feishu: '#3370FF',
  telegram: '#26A5E4',
  discord: '#5865F2',
  slack: '#E01E5A',
  whatsapp: '#25D366',
  wechat: '#07C160',
  line: '#00B900',
  teams: '#6264A7',
  twitter: '#000000',
  instagram: '#E4405F',
};

export function ChannelIcon({ channelId, className, size = 24 }: ChannelIconProps) {
  const iconSrc = iconMap[channelId] || GenericSvg;

  return (
    <Image
      src={iconSrc}
      alt={channelId}
      className={className}
      width={size}
      height={size}
    />
  );
}

// Get channel icon source for direct use
export function getChannelIconSrc(channelId: string): StaticImageData {
  return iconMap[channelId] || GenericSvg;
}

// Check if a channel has a custom icon
export function hasChannelIcon(channelId: string): boolean {
  return channelId in iconMap;
}
