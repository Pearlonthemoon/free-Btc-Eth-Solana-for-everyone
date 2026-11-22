import 'dotenv/config';
import express from 'express';
import fs from 'fs';
import http from 'http';
import path from 'path';
import {fileURLToPath} from 'url';
import type {
  AppConfig,
  Campaign,
  ChainId,
  ChannelMetric,
  PayoutStats,
  ShareDroidState,
  ShareEvent,
  Shareholder,
  SocialChannel,
} from './src/types';
import {CHAIN_SPECS, usdToCryptoAmount, validateWalletAddress} from './src/utils/crypto';

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);
const DATA_FILE = path.resolve(__dirname, '.sharedroid-data.json');
const PORT = Number(process.env.PORT) || 3000;
const CREATOR_FIXED_SHARE_PERCENT = 50;

function createEmptyStats(): PayoutStats {
  return {
    totalDownloads: 0,
    totalRuns: 0,
    totalGrossUsd: 0,
    totalCreatorShareUsd: 0,
    totalParticipantShareUsd: 0,
    pendingShareUsd: 0,
    settledShareUsd: 0,
    pendingParticipantUsd: 0,
    settledParticipantUsd: 0,
    totalParticipantShares: 0,
    byChain: {
      BTC: {shareUsd: 0, cryptoTotal: 0, count: 0},
      LN: {shareUsd: 0, cryptoTotal: 0, count: 0},
      ETH: {shareUsd: 0, cryptoTotal: 0, count: 0},
      SOL: {shareUsd: 0, cryptoTotal: 0, count: 0},
      USDT: {shareUsd: 0, cryptoTotal: 0, count: 0},
      LTC: {shareUsd: 0, cryptoTotal: 0, count: 0},
    },
  };
}

function recomputeStats(events: ShareEvent[], shareholders: Shareholder[] = []): PayoutStats {
  const stats = createEmptyStats();
  const seenDownloads = new Set<string>();
  const seenRuns = new Set<string>();

  stats.totalParticipantShares = shareholders.reduce(
    (sum, sh) => sum + Math.max(0, Number(sh.shares) || 0),
    0,
  );

  for (const ev of events) {
    const groupKey = ev.id.replace(/-(w|p)\d+$/, '');
    if (ev.type === 'download' && !seenDownloads.has(groupKey)) {
      seenDownloads.add(groupKey);
      stats.totalDownloads += 1;
    } else if ((ev.type === 'run' || ev.type === 'tip') && !seenRuns.has(groupKey)) {
      seenRuns.add(groupKey);
      stats.totalRuns += 1;
    }

    if (ev.poolRole === 'participant') {
      stats.totalParticipantShareUsd = Number(
        (stats.totalParticipantShareUsd + ev.creatorShareUsd).toFixed(2),
      );
      if (ev.status === 'pending') {
        stats.pendingParticipantUsd = Number(
          (stats.pendingParticipantUsd + ev.creatorShareUsd).toFixed(2),
        );
      } else {
        stats.settledParticipantUsd = Number(
          (stats.settledParticipantUsd + ev.creatorShareUsd).toFixed(2),
        );
      }
      continue;
    }

    stats.totalGrossUsd = Number((stats.totalGrossUsd + ev.grossUsd).toFixed(2));
    stats.totalCreatorShareUsd = Number(
      (stats.totalCreatorShareUsd + ev.creatorShareUsd).toFixed(2),
    );
    if (ev.status === 'pending') {
      stats.pendingShareUsd = Number((stats.pendingShareUsd + ev.creatorShareUsd).toFixed(2));
    } else {
      stats.settledShareUsd = Number((stats.settledShareUsd + ev.creatorShareUsd).toFixed(2));
    }
    const bucket = stats.byChain[ev.chain];
    if (bucket) {
      bucket.shareUsd = Number((bucket.shareUsd + ev.creatorShareUsd).toFixed(2));
      bucket.cryptoTotal = Number(
        (bucket.cryptoTotal + (Number.parseFloat(ev.cryptoAmount) || 0)).toFixed(8),
      );
      bucket.count += 1;
    }
  }
  return stats;
}

function recomputeShareholders(events: ShareEvent[], shareholders: Shareholder[]): Shareholder[] {
  return shareholders.map((sh) => {
    let accruedUsd = 0;
    let settledUsd = 0;
    let accruedCrypto = 0;
    for (const ev of events) {
      if (ev.poolRole === 'participant' && ev.participantId === sh.id) {
        accruedUsd = Number((accruedUsd + ev.creatorShareUsd).toFixed(2));
        if (ev.status === 'confirmed') {
          settledUsd = Number((settledUsd + ev.creatorShareUsd).toFixed(2));
        }
        accruedCrypto = Number(
          (accruedCrypto + (Number.parseFloat(ev.cryptoAmount) || 0)).toFixed(8),
        );
      }
    }
    return {
      ...sh,
      accruedUsd,
      settledUsd,
      accruedCrypto,
    };
  });
}

function createDefaultState(): ShareDroidState {
  const now = new Date().toISOString();
  return {
    config: {
      appName: 'PulseUtility',
      packageId: 'com.sharedroid.pulseutility',
      version: '1.0.0',
      tagline: 'Offline-ready Android toolkit with direct creator payout split',
      description:
        'A lightweight Android utility app where users unlock or run sessions with transparent crypto revenue sharing directly to the creator.',
      downloadModel: 'supporter_pwyw',
      downloadPriceUsd: 4.99,
      runShareUsd: 0.25,
      creatorSharePercent: CREATOR_FIXED_SHARE_PERCENT,
      revenueMode: 'hybrid',
      wallets: [
        {
          id: 'w-btc-primary',
          chain: 'BTC',
          network: 'Bitcoin Mainnet',
          label: 'Primary BTC Vault',
          address: '1GAFFGgd4EeE8eznrtN1KXVbUeUu9BpzAf',
          splitPercent: 60,
          enabled: true,
        },
        {
          id: 'w-eth-primary',
          chain: 'ETH',
          network: 'BNB Smart Chain (BEP20)',
          label: 'ETH / BSC Creator Wallet',
          address: '0x4f300bfa5910c56c6df0425a644bde0feef7d3cb',
          splitPercent: 25,
          enabled: true,
        },
        {
          id: 'w-sol-primary',
          chain: 'SOL',
          network: 'Solana Mainnet',
          label: 'SOL Fast Payout',
          address: '9wDweULBurfyEUyQrzVqhDys7b1Eyj5qfniCWwb9YPEh',
          splitPercent: 15,
          enabled: true,
        },
      ],
      updatedAt: now,
    },
    shareholders: [],
    events: [],
    stats: createEmptyStats(),
    campaigns: [
      {
        id: 'cmp-x-daily',
        title: 'Daily X / Twitter Launch Post',
        channel: 'x',
        headline: 'Install PulseUtility on Android',
        body: 'Download PulseUtility on Android directly in one tap. Fast offline crypto & sats utility with transparent creator support.',
        cadence: 'daily',
        active: true,
        postsCount: 0,
        lastPostedAt: null,
      },
      {
        id: 'cmp-tg-daily',
        title: 'Telegram Community Broadcast',
        channel: 'telegram',
        headline: 'PulseUtility Android Release',
        body: 'Try our lightweight Android utility app — scan or tap to install directly on Android without waiting for store delays.',
        cadence: 'daily',
        active: true,
        postsCount: 0,
        lastPostedAt: null,
      },
      {
        id: 'cmp-wa-daily',
        title: 'WhatsApp Status & Group Share',
        channel: 'whatsapp',
        headline: 'Get PulseUtility for Android',
        body: 'Install PulseUtility on your Android phone in seconds. Includes live multi-chain converter and offline support.',
        cadence: 'daily',
        active: true,
        postsCount: 0,
        lastPostedAt: null,
      },
      {
        id: 'cmp-rd-weekly',
        title: 'Reddit Android & Crypto Showcase',
        channel: 'reddit',
        headline: 'Built an installable Android app with transparent BTC/ETH/SOL creator payouts',
        body: 'Check out our Android PWA & Kotlin app — open the download link on Android to install or inspect the open payout split.',
        cadence: 'daily',
        active: true,
        postsCount: 0,
        lastPostedAt: null,
      },
    ],
    channelMetrics: [{channel: 'direct', visits: 1, downloads: 0, runs: 0, creatorShareUsd: 0}],
    platformChecklist: {
      'google-play': false,
      'github-fdroid': false,
      'samsung-galaxy': false,
      'amazon-appstore': false,
      'google-search': true,
      'product-hunt': false,
    },
  };
}

function loadState(): ShareDroidState {
  try {
    if (fs.existsSync(DATA_FILE)) {
      const parsed = JSON.parse(fs.readFileSync(DATA_FILE, 'utf8')) as ShareDroidState;
      if (parsed && parsed.config && Array.isArray(parsed.events)) {
        parsed.config.creatorSharePercent = CREATOR_FIXED_SHARE_PERCENT;
        parsed.shareholders = Array.isArray(parsed.shareholders) ? parsed.shareholders : [];
        parsed.shareholders = recomputeShareholders(parsed.events, parsed.shareholders);
        parsed.stats = recomputeStats(parsed.events, parsed.shareholders);
        return parsed;
      }
    }
  } catch (err) {
    console.warn('Unable to read persisted state, initializing fresh state:', err);
  }
  return createDefaultState();
}

function saveState(state: ShareDroidState): void {
  try {
    fs.writeFileSync(DATA_FILE, JSON.stringify(state, null, 2), 'utf8');
  } catch (err) {
    console.warn('Unable to persist state to disk:', err);
  }
}

function upsertChannelMetric(
  metrics: ChannelMetric[],
  channel: string,
  delta: Partial<Omit<ChannelMetric, 'channel'>>,
): ChannelMetric[] {
  const cleanChannel = channel.trim().toLowerCase() || 'direct';
  const existing = metrics.find((m) => m.channel === cleanChannel);
  if (existing) {
    existing.visits += delta.visits ?? 0;
    existing.downloads += delta.downloads ?? 0;
    existing.runs += delta.runs ?? 0;
    existing.creatorShareUsd = Number(
      (existing.creatorShareUsd + (delta.creatorShareUsd ?? 0)).toFixed(2),
    );
    return metrics;
  }
  return [
    ...metrics,
    {
      channel: cleanChannel,
      visits: delta.visits ?? 0,
      downloads: delta.downloads ?? 0,
      runs: delta.runs ?? 0,
      creatorShareUsd: Number((delta.creatorShareUsd ?? 0).toFixed(2)),
    },
  ];
}

function escapeXml(value: string): string {
  return value
    .replace(/&/g, '&amp;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;')
    .replace(/"/g, '&quot;')
    .replace(/'/g, '&apos;');
}

function getBaseUrl(req: express.Request): string {
  if (process.env.APP_URL && process.env.APP_URL !== 'MY_APP_URL') {
    return process.env.APP_URL.replace(/\/+$/, '');
  }
  const proto = req.headers['x-forwarded-proto'] || req.protocol || 'http';
  const host = req.headers['x-forwarded-host'] || req.get('host') || `localhost:${PORT}`;
  return `${proto}://${host}`;
}

async function startServer() {
  const app = express();
  app.use(express.json({limit: '1mb'}));

  let state = loadState();

  app.get('/api/state', (_req, res) => {
    state.config.creatorSharePercent = CREATOR_FIXED_SHARE_PERCENT;
    state.shareholders = recomputeShareholders(state.events, state.shareholders);
    state.stats = recomputeStats(state.events, state.shareholders);
    res.json(state);
  });

  app.put('/api/config', (req, res) => {
    const incoming = req.body as Partial<AppConfig>;
    if (!incoming || !Array.isArray(incoming.wallets)) {
      res.status(400).json({error: 'Invalid configuration payload.'});
      return;
    }

    const enabledWallets = incoming.wallets.filter((w) => w.enabled);
    if (enabledWallets.length === 0) {
      res.status(400).json({error: 'Enable at least one crypto payout wallet.'});
      return;
    }

    let splitSum = 0;
    for (const wallet of enabledWallets) {
      const check = validateWalletAddress(wallet.chain, wallet.address);
      if (!check.valid) {
        res.status(400).json({error: `${wallet.label || wallet.chain}: ${check.reason}`});
        return;
      }
      splitSum += Number(wallet.splitPercent) || 0;
    }

    if (Math.abs(splitSum - 100) > 0.01) {
      res.status(400).json({
        error: `Enabled wallet split percentages must total 100% (currently ${splitSum}%).`,
      });
      return;
    }

    const nextConfig: AppConfig = {
      appName: (incoming.appName || 'PulseUtility').trim().slice(0, 60),
      packageId: (incoming.packageId || 'com.sharedroid.pulseutility').trim().slice(0, 80),
      version: (incoming.version || '1.0.0').trim().slice(0, 24),
      tagline: (incoming.tagline || '').trim().slice(0, 140),
      description: (incoming.description || '').trim().slice(0, 500),
      downloadModel:
        incoming.downloadModel === 'free_run_share' ? 'free_run_share' : 'supporter_pwyw',
      downloadPriceUsd: Math.max(0, Number(incoming.downloadPriceUsd) || 0),
      runShareUsd: Math.max(0, Number(incoming.runShareUsd) || 0),
      creatorSharePercent: CREATOR_FIXED_SHARE_PERCENT,
      revenueMode:
        incoming.revenueMode === 'download_only' || incoming.revenueMode === 'run_only'
          ? incoming.revenueMode
          : 'hybrid',
      wallets: incoming.wallets.map((w) => ({
        id: w.id,
        chain: w.chain,
        network: w.network,
        label: w.label.trim().slice(0, 48),
        address: w.address.trim(),
        splitPercent: Math.max(0, Math.min(100, Number(w.splitPercent) || 0)),
        enabled: Boolean(w.enabled),
      })),
      updatedAt: new Date().toISOString(),
    };

    state.config = nextConfig;
    saveState(state);
    res.json(state);
  });

  app.post('/api/events/visit', (req, res) => {
    const utmSource = typeof req.body?.utmSource === 'string' ? req.body.utmSource : 'direct';
    state.channelMetrics = upsertChannelMetric(state.channelMetrics, utmSource, {visits: 1});
    saveState(state);
    res.json(state);
  });

  app.post('/api/participants/join', (req, res) => {
    const rawName = typeof req.body?.name === 'string' ? req.body.name.trim() : '';
    const chain = (typeof req.body?.chain === 'string' ? req.body.chain : 'BTC') as ChainId;
    const rawAddress = typeof req.body?.address === 'string' ? req.body.address.trim() : '';
    const rawNetwork = typeof req.body?.network === 'string' ? req.body.network.trim() : '';
    const shares = Math.floor(Number(req.body?.shares) || 0);

    if (!rawName) {
      res.status(400).json({error: 'Enter a participant name or handle to join.'});
      return;
    }
    if (!CHAIN_SPECS[chain]) {
      res.status(400).json({error: 'Select a supported payout cryptocurrency.'});
      return;
    }
    const addrCheck = validateWalletAddress(chain, rawAddress);
    if (!addrCheck.valid) {
      res.status(400).json({error: addrCheck.reason || 'Enter a valid receiving wallet address.'});
      return;
    }
    if (!Number.isFinite(shares) || shares < 1) {
      res.status(400).json({error: 'Shares must be at least 1 (e.g. 100, 1,000, or 10,000).'});
      return;
    }

    const shareholder: Shareholder = {
      id: `sh-${Date.now().toString(36)}-${Math.random().toString(36).slice(2, 6)}`,
      name: rawName.slice(0, 48),
      chain,
      network: rawNetwork.slice(0, 48) || CHAIN_SPECS[chain].defaultNetwork,
      address: rawAddress,
      shares,
      accruedUsd: 0,
      settledUsd: 0,
      accruedCrypto: 0,
      joinedAt: new Date().toISOString(),
    };

    state.shareholders = [shareholder, ...state.shareholders];
    state.stats = recomputeStats(state.events, state.shareholders);
    saveState(state);
    res.json({shareholder, state});
  });

  app.post('/api/participants/:id/shares', (req, res) => {
    const {id} = req.params;
    const addShares = Number(req.body?.addShares);
    const setShares = Number(req.body?.setShares);

    const target = state.shareholders.find((s) => s.id === id);
    if (!target) {
      res.status(404).json({error: 'Participant not found.'});
      return;
    }

    let nextShares = target.shares;
    if (Number.isFinite(setShares) && setShares >= 1) {
      nextShares = Math.floor(setShares);
    } else if (Number.isFinite(addShares) && addShares !== 0) {
      nextShares = Math.max(1, Math.floor(target.shares + addShares));
    } else {
      res.status(400).json({error: 'Provide a valid share increment or target share count.'});
      return;
    }

    state.shareholders = state.shareholders.map((s) =>
      s.id === id ? {...s, shares: nextShares} : s,
    );
    state.stats = recomputeStats(state.events, state.shareholders);
    saveState(state);
    res.json(state);
  });

  app.delete('/api/participants/:id', (req, res) => {
    const {id} = req.params;
    state.shareholders = state.shareholders.filter((s) => s.id !== id);
    state.stats = recomputeStats(state.events, state.shareholders);
    saveState(state);
    res.json(state);
  });

  app.post('/api/events/download', (req, res) => {
    const customUsd = Number(req.body?.customUsd);
    const txRefInput = typeof req.body?.txRef === 'string' ? req.body.txRef.trim() : '';
    const utmSource = typeof req.body?.utmSource === 'string' ? req.body.utmSource : 'direct';

    const validWallets = state.config.wallets.filter(
      (w) => w.enabled && validateWalletAddress(w.chain, w.address).valid,
    );

    if (validWallets.length === 0) {
      res.status(400).json({error: 'No valid creator payout wallet is configured.'});
      return;
    }

    const totalGrossUsd =
      state.config.downloadModel === 'free_run_share'
        ? 0
        : Number.isFinite(customUsd)
          ? Math.max(0, customUsd)
          : state.config.downloadPriceUsd;
    const totalCreatorShareUsd = Number(
      ((totalGrossUsd * CREATOR_FIXED_SHARE_PERCENT) / 100).toFixed(2),
    );
    const totalParticipantPoolUsd = Number((totalGrossUsd - totalCreatorShareUsd).toFixed(2));
    const userAgent = req.get('user-agent') || '';
    const deviceInfo = /android/i.test(userAgent)
      ? 'Android Device'
      : /iphone|ipad/i.test(userAgent)
        ? 'iOS Device'
        : 'Android Preview';

    const totalSplit = validWallets.reduce((sum, w) => sum + (Number(w.splitPercent) || 0), 0) || 100;
    const groupId = `evt-${Date.now()}-${Math.random().toString(36).slice(2, 7)}`;
    const baseTxRef = txRefInput || `DL-${Math.random().toString(36).slice(2, 8).toUpperCase()}`;
    const createdAt = new Date().toISOString();

    let remainingGross = Number(totalGrossUsd.toFixed(2));
    let remainingShare = totalCreatorShareUsd;

    const creatorEvents: ShareEvent[] = validWallets.map((wallet, idx) => {
      const isLast = idx === validWallets.length - 1;
      const ratio = (Number(wallet.splitPercent) || 0) / totalSplit;
      const walletGross = isLast
        ? Number(remainingGross.toFixed(2))
        : Number((totalGrossUsd * ratio).toFixed(2));
      const walletShare = isLast
        ? Number(remainingShare.toFixed(2))
        : Number((totalCreatorShareUsd * ratio).toFixed(2));
      remainingGross = Number((remainingGross - walletGross).toFixed(2));
      remainingShare = Number((remainingShare - walletShare).toFixed(2));

      return {
        id: `${groupId}-w${idx}`,
        type: 'download',
        poolRole: 'creator',
        chain: wallet.chain,
        recipientAddress: wallet.address.trim(),
        grossUsd: walletGross,
        creatorShareUsd: walletShare,
        cryptoAmount: usdToCryptoAmount(walletShare, wallet.chain),
        txRef:
          validWallets.length > 1
            ? `${baseTxRef} (Creator 50% · ${wallet.splitPercent}%)`
            : `${baseTxRef} (Creator 50%)`,
        status: txRefInput ? 'confirmed' : totalCreatorShareUsd === 0 ? 'confirmed' : 'pending',
        deviceInfo,
        utmSource,
        createdAt,
      };
    });

    const participantEvents: ShareEvent[] = [];
    const totalParticipantShares = state.shareholders.reduce(
      (sum, sh) => sum + Math.max(0, Number(sh.shares) || 0),
      0,
    );
    if (state.shareholders.length > 0 && totalParticipantShares > 0 && totalParticipantPoolUsd > 0) {
      let remainingPool = totalParticipantPoolUsd;
      state.shareholders.forEach((sh, idx) => {
        const isLast = idx === state.shareholders.length - 1;
        const ratio = sh.shares / totalParticipantShares;
        const shUsd = isLast
          ? Number(remainingPool.toFixed(2))
          : Number((totalParticipantPoolUsd * ratio).toFixed(2));
        remainingPool = Number((remainingPool - shUsd).toFixed(2));

        participantEvents.push({
          id: `${groupId}-p${idx}`,
          type: 'download',
          poolRole: 'participant',
          participantId: sh.id,
          participantName: sh.name,
          sharesAtEvent: sh.shares,
          chain: sh.chain,
          recipientAddress: sh.address.trim(),
          grossUsd: 0,
          creatorShareUsd: shUsd,
          cryptoAmount: usdToCryptoAmount(shUsd, sh.chain),
          txRef: `${baseTxRef} (${sh.shares.toLocaleString()} sh)`,
          status: txRefInput ? 'confirmed' : 'pending',
          deviceInfo,
          utmSource,
          createdAt,
        });
      });
    }

    state.events = [...creatorEvents, ...participantEvents, ...state.events];
    state.shareholders = recomputeShareholders(state.events, state.shareholders);
    state.stats = recomputeStats(state.events, state.shareholders);
    state.channelMetrics = upsertChannelMetric(state.channelMetrics, utmSource, {
      downloads: 1,
      creatorShareUsd: totalCreatorShareUsd,
    });
    saveState(state);
    res.json({event: creatorEvents[0], events: [...creatorEvents, ...participantEvents], state});
  });

  app.post('/api/events/run', (req, res) => {
    const amountUsdRaw = Number(req.body?.amountUsd);
    const isTip = Boolean(req.body?.isTip);
    const utmSource = typeof req.body?.utmSource === 'string' ? req.body.utmSource : 'direct';

    const validWallets = state.config.wallets.filter(
      (w) => w.enabled && validateWalletAddress(w.chain, w.address).valid,
    );

    if (validWallets.length === 0) {
      res.status(400).json({error: 'No valid creator payout wallet is configured.'});
      return;
    }

    const totalGrossUsd = Number.isFinite(amountUsdRaw)
      ? Math.max(0, amountUsdRaw)
      : state.config.runShareUsd;
    const totalCreatorShareUsd = Number(
      ((totalGrossUsd * CREATOR_FIXED_SHARE_PERCENT) / 100).toFixed(2),
    );
    const totalParticipantPoolUsd = Number((totalGrossUsd - totalCreatorShareUsd).toFixed(2));

    const totalSplit = validWallets.reduce((sum, w) => sum + (Number(w.splitPercent) || 0), 0) || 100;
    const groupId = `evt-${Date.now()}-${Math.random().toString(36).slice(2, 7)}`;
    const baseTxRef = `${isTip ? 'TIP' : 'RUN'}-${Math.random().toString(36).slice(2, 8).toUpperCase()}`;
    const createdAt = new Date().toISOString();

    let remainingGross = Number(totalGrossUsd.toFixed(2));
    let remainingShare = totalCreatorShareUsd;

    const creatorEvents: ShareEvent[] = validWallets.map((wallet, idx) => {
      const isLast = idx === validWallets.length - 1;
      const ratio = (Number(wallet.splitPercent) || 0) / totalSplit;
      const walletGross = isLast
        ? Number(remainingGross.toFixed(2))
        : Number((totalGrossUsd * ratio).toFixed(2));
      const walletShare = isLast
        ? Number(remainingShare.toFixed(2))
        : Number((totalCreatorShareUsd * ratio).toFixed(2));
      remainingGross = Number((remainingGross - walletGross).toFixed(2));
      remainingShare = Number((remainingShare - walletShare).toFixed(2));

      return {
        id: `${groupId}-w${idx}`,
        type: isTip ? 'tip' : 'run',
        poolRole: 'creator',
        chain: wallet.chain,
        recipientAddress: wallet.address.trim(),
        grossUsd: walletGross,
        creatorShareUsd: walletShare,
        cryptoAmount: usdToCryptoAmount(walletShare, wallet.chain),
        txRef:
          validWallets.length > 1
            ? `${baseTxRef} (Creator 50% · ${wallet.splitPercent}%)`
            : `${baseTxRef} (Creator 50%)`,
        status: 'pending',
        deviceInfo: 'Android Runtime',
        utmSource,
        createdAt,
      };
    });

    const participantEvents: ShareEvent[] = [];
    const totalParticipantShares = state.shareholders.reduce(
      (sum, sh) => sum + Math.max(0, Number(sh.shares) || 0),
      0,
    );
    if (state.shareholders.length > 0 && totalParticipantShares > 0 && totalParticipantPoolUsd > 0) {
      let remainingPool = totalParticipantPoolUsd;
      state.shareholders.forEach((sh, idx) => {
        const isLast = idx === state.shareholders.length - 1;
        const ratio = sh.shares / totalParticipantShares;
        const shUsd = isLast
          ? Number(remainingPool.toFixed(2))
          : Number((totalParticipantPoolUsd * ratio).toFixed(2));
        remainingPool = Number((remainingPool - shUsd).toFixed(2));

        participantEvents.push({
          id: `${groupId}-p${idx}`,
          type: isTip ? 'tip' : 'run',
          poolRole: 'participant',
          participantId: sh.id,
          participantName: sh.name,
          sharesAtEvent: sh.shares,
          chain: sh.chain,
          recipientAddress: sh.address.trim(),
          grossUsd: 0,
          creatorShareUsd: shUsd,
          cryptoAmount: usdToCryptoAmount(shUsd, sh.chain),
          txRef: `${baseTxRef} (${sh.shares.toLocaleString()} sh)`,
          status: 'pending',
          deviceInfo: 'Android Runtime',
          utmSource,
          createdAt,
        });
      });
    }

    state.events = [...creatorEvents, ...participantEvents, ...state.events];
    state.shareholders = recomputeShareholders(state.events, state.shareholders);
    state.stats = recomputeStats(state.events, state.shareholders);
    state.channelMetrics = upsertChannelMetric(state.channelMetrics, utmSource, {
      runs: 1,
      creatorShareUsd: totalCreatorShareUsd,
    });
    saveState(state);
    res.json({event: creatorEvents[0], events: [...creatorEvents, ...participantEvents], state});
  });

  app.post('/api/payouts/settle', (_req, res) => {
    let settledCount = 0;
    const batchRef = `BATCH-${Math.random().toString(36).slice(2, 7).toUpperCase()}`;
    state.events = state.events.map((ev) => {
      if (ev.status === 'pending') {
        settledCount += 1;
        return {
          ...ev,
          status: 'confirmed',
          txRef: ev.txRef.startsWith('BATCH-') ? ev.txRef : `${batchRef}/${ev.txRef}`,
        };
      }
      return ev;
    });
    if (settledCount > 0) {
      const validWallet = state.config.wallets.find(
        (w) => w.enabled && validateWalletAddress(w.chain, w.address).valid,
      );
      if (validWallet) {
        const settledEvent: ShareEvent = {
          id: `evt-${Date.now()}-settle`,
          type: 'payout',
          poolRole: 'creator',
          chain: validWallet.chain,
          recipientAddress: validWallet.address.trim(),
          grossUsd: 0,
          creatorShareUsd: 0,
          cryptoAmount: '0.00',
          txRef: batchRef,
          status: 'confirmed',
          deviceInfo: `${settledCount} entries settled`,
          utmSource: 'direct',
          createdAt: new Date().toISOString(),
        };
        state.events = [settledEvent, ...state.events];
      }
    }
    state.shareholders = recomputeShareholders(state.events, state.shareholders);
    state.stats = recomputeStats(state.events, state.shareholders);
    saveState(state);
    res.json(state);
  });

  app.delete('/api/events', (_req, res) => {
    state.events = [];
    state.shareholders = recomputeShareholders([], state.shareholders);
    state.stats = recomputeStats([], state.shareholders);
    saveState(state);
    res.json(state);
  });

  app.post('/api/campaigns', (req, res) => {
    const {id, title, channel, headline, body} = req.body as Partial<Campaign>;
    if (!headline?.trim() || !body?.trim()) {
      res.status(400).json({error: 'Campaign headline and body are required.'});
      return;
    }

    if (id) {
      state.campaigns = state.campaigns.map((c) =>
        c.id === id
          ? {
              ...c,
              title: title?.trim() || c.title,
              headline: headline.trim(),
              body: body.trim(),
            }
          : c,
      );
    } else {
      const cleanChannel: SocialChannel =
        channel === 'x' ||
        channel === 'telegram' ||
        channel === 'whatsapp' ||
        channel === 'reddit' ||
        channel === 'linkedin' ||
        channel === 'facebook'
          ? channel
          : 'linkedin';
      const newCampaign: Campaign = {
        id: `cmp-${Date.now().toString(36)}`,
        title: title?.trim() || `${cleanChannel.toUpperCase()} Custom Broadcast`,
        channel: cleanChannel,
        headline: headline.trim(),
        body: body.trim(),
        cadence: 'daily',
        active: true,
        postsCount: 0,
        lastPostedAt: null,
      };
      state.campaigns = [newCampaign, ...state.campaigns];
    }
    saveState(state);
    res.json(state);
  });

  app.post('/api/campaigns/:id/log-post', (req, res) => {
    const {id} = req.params;
    const now = new Date().toISOString();
    state.campaigns = state.campaigns.map((c) =>
      c.id === id ? {...c, postsCount: c.postsCount + 1, lastPostedAt: now} : c,
    );
    saveState(state);
    res.json(state);
  });

  app.put('/api/platforms/checklist', (req, res) => {
    const updates = req.body as Record<string, boolean>;
    if (updates && typeof updates === 'object') {
      for (const [key, val] of Object.entries(updates)) {
        state.platformChecklist[key] = Boolean(val);
      }
      saveState(state);
    }
    res.json(state);
  });

  app.get('/api/campaigns/feed.json', (req, res) => {
    const baseUrl = getBaseUrl(req);
    res.json({
      version: 'https://jsonfeed.org/version/1.1',
      title: `${state.config.appName} — Android Distribution Feed`,
      home_page_url: baseUrl,
      feed_url: `${baseUrl}/api/campaigns/feed.json`,
      description: state.config.tagline,
      items: state.campaigns.map((cmp) => ({
        id: cmp.id,
        url: `${baseUrl}/?mode=app&utm_source=${encodeURIComponent(cmp.channel)}`,
        title: cmp.headline,
        content_text: cmp.body,
        date_modified: cmp.lastPostedAt || state.config.updatedAt,
        tags: ['android', 'pwa', cmp.channel],
      })),
    });
  });

  app.get('/feed.xml', (req, res) => {
    const baseUrl = getBaseUrl(req);
    const itemsXml = state.campaigns
      .map(
        (cmp) => `    <item>
      <title>${escapeXml(cmp.headline)}</title>
      <link>${escapeXml(`${baseUrl}/?mode=app&utm_source=${cmp.channel}`)}</link>
      <guid isPermaLink="false">${escapeXml(cmp.id)}</guid>
      <description>${escapeXml(cmp.body)}</description>
      <pubDate>${new Date(cmp.lastPostedAt || state.config.updatedAt).toUTCString()}</pubDate>
    </item>`,
      )
      .join('\n');

    res.set('Content-Type', 'application/rss+xml; charset=utf-8').send(`<?xml version="1.0" encoding="UTF-8" ?>
<rss version="2.0">
  <channel>
    <title>${escapeXml(state.config.appName)} — ShareDroid Distribution Feed</title>
    <link>${escapeXml(baseUrl)}</link>
    <description>${escapeXml(state.config.description)}</description>
${itemsXml}
  </channel>
</rss>`);
  });

  app.get('/sitemap.xml', (req, res) => {
    const baseUrl = getBaseUrl(req);
    res.set('Content-Type', 'application/xml; charset=utf-8').send(`<?xml version="1.0" encoding="UTF-8"?>
<urlset xmlns="http://www.sitemaps.org/schemas/sitemap/0.9">
  <url>
    <loc>${escapeXml(baseUrl)}/</loc>
    <changefreq>daily</changefreq>
    <priority>1.0</priority>
  </url>
  <url>
    <loc>${escapeXml(baseUrl)}/?mode=app</loc>
    <changefreq>daily</changefreq>
    <priority>0.9</priority>
  </url>
</urlset>`);
  });

  const httpServer = http.createServer(app);

  if (process.env.NODE_ENV !== 'production') {
    const hmrDisabled = process.env.DISABLE_HMR === 'true';
    if (hmrDisabled) {
      app.get('/@vite/client', (_req, res) => {
        res.type('application/javascript').send('export const createHotContext = () => ({ accept: () => {}, dispose: () => {}, prune: () => {}, invalidate: () => {}, on: () => {}, off: () => {}, send: () => {} }); export const updateStyle = () => {}; export const removeStyle = () => {};');
      });
    }
    const {createServer: createViteServer} = await import('vite');
    const vite = await createViteServer({
      server: {
        middlewareMode: true,
        hmr: hmrDisabled ? false : {server: httpServer},
        ws: hmrDisabled ? false : {server: httpServer},
      },
      appType: 'spa',
    });
    app.use(vite.middlewares);
  } else {
    const distDir = path.resolve(__dirname, 'dist');
    app.use(express.static(distDir));
    app.get('*', (_req, res) => {
      res.sendFile(path.join(distDir, 'index.html'));
    });
  }

  httpServer.listen(PORT, '0.0.0.0', () => {
    console.log(`ShareDroid server running on http://0.0.0.0:${PORT}`);
  });
}

startServer();
