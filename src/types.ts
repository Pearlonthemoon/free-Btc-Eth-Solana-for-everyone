export type ChainId = 'BTC' | 'LN' | 'ETH' | 'SOL' | 'USDT' | 'LTC';

export type DownloadModel = 'supporter_pwyw' | 'free_run_share';

export type RevenueMode = 'hybrid' | 'download_only' | 'run_only';

export interface WalletConfig {
  id: string;
  chain: ChainId;
  network: string;
  label: string;
  address: string;
  splitPercent: number;
  enabled: boolean;
}

export interface AppConfig {
  appName: string;
  packageId: string;
  version: string;
  tagline: string;
  description: string;
  downloadModel: DownloadModel;
  downloadPriceUsd: number;
  runShareUsd: number;
  creatorSharePercent: number;
  revenueMode: RevenueMode;
  wallets: WalletConfig[];
  updatedAt: string;
}

export type ShareEventType = 'download' | 'run' | 'tip' | 'payout';

export type SharePoolRole = 'creator' | 'participant';

export interface Shareholder {
  id: string;
  name: string;
  chain: ChainId;
  network: string;
  address: string;
  shares: number;
  accruedUsd: number;
  settledUsd: number;
  accruedCrypto: number;
  joinedAt: string;
}

export interface ShareEvent {
  id: string;
  type: ShareEventType;
  poolRole?: SharePoolRole;
  participantId?: string;
  participantName?: string;
  sharesAtEvent?: number;
  chain: ChainId;
  recipientAddress: string;
  grossUsd: number;
  creatorShareUsd: number;
  cryptoAmount: string;
  txRef: string;
  status: 'confirmed' | 'pending';
  deviceInfo: string;
  utmSource: string;
  createdAt: string;
}

export interface ChainAccrual {
  shareUsd: number;
  cryptoTotal: number;
  count: number;
}

export interface PayoutStats {
  totalDownloads: number;
  totalRuns: number;
  totalGrossUsd: number;
  totalCreatorShareUsd: number;
  totalParticipantShareUsd: number;
  pendingShareUsd: number;
  settledShareUsd: number;
  pendingParticipantUsd: number;
  settledParticipantUsd: number;
  totalParticipantShares: number;
  byChain: Record<ChainId, ChainAccrual>;
}

export type SocialChannel = 'x' | 'telegram' | 'whatsapp' | 'reddit' | 'linkedin' | 'facebook';

export interface Campaign {
  id: string;
  title: string;
  channel: SocialChannel;
  headline: string;
  body: string;
  cadence: 'daily' | 'weekly';
  active: boolean;
  postsCount: number;
  lastPostedAt: string | null;
}

export interface ChannelMetric {
  channel: string;
  visits: number;
  downloads: number;
  runs: number;
  creatorShareUsd: number;
}

export type PlatformChecklist = Record<string, boolean>;

export interface ShareDroidState {
  config: AppConfig;
  shareholders: Shareholder[];
  events: ShareEvent[];
  stats: PayoutStats;
  campaigns: Campaign[];
  channelMetrics: ChannelMetric[];
  platformChecklist: PlatformChecklist;
}
