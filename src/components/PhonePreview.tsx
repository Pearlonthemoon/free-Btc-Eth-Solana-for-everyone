import {
  ArrowRight,
  Battery,
  Check,
  CheckCircle2,
  Coins,
  Copy,
  Download,
  ExternalLink,
  Play,
  Smartphone,
  Timer,
  UserPlus,
  Wifi,
} from 'lucide-react';
import {useEffect, useMemo, useState} from 'react';
import type {AppConfig, ChainId, Shareholder} from '../types';
import {
  CHAIN_SPECS,
  SUPPORTED_CHAINS,
  buildCryptoPaymentUri,
  truncateAddress,
  usdToCryptoAmount,
  validateWalletAddress,
} from '../utils/crypto';
import {PWAInstallButton} from './PWAInstallButton';
import {QrCodeBox} from './QrCodeBox';

interface PhonePreviewProps {
  config: AppConfig;
  shareholders?: Shareholder[];
  standalone?: boolean;
  onRecordDownload: (payload: {
    chain: ChainId;
    customUsd: number;
    txRef?: string;
  }) => Promise<void>;
  onRecordRun: (payload: {
    chain: ChainId;
    amountUsd: number;
    isTip?: boolean;
  }) => Promise<void>;
  onJoinShareholder?: (payload: {
    name: string;
    chain: ChainId;
    network?: string;
    address: string;
    shares: number;
  }) => Promise<{ok: boolean; error?: string}>;
  onUpdateShares?: (id: string, payload: {addShares?: number; setShares?: number}) => Promise<void>;
  onNavigateSetup?: () => void;
}

export function PhonePreview({
  config,
  shareholders = [],
  standalone = false,
  onRecordDownload,
  onRecordRun,
  onJoinShareholder,
  onNavigateSetup,
}: PhonePreviewProps) {
  const activeWallets = useMemo(
    () => config.wallets.filter((w) => w.enabled && validateWalletAddress(w.chain, w.address).valid),
    [config.wallets],
  );

  const [selectedChain, setSelectedChain] = useState<ChainId>(activeWallets[0]?.chain ?? 'BTC');
  const [stage, setStage] = useState<'download' | 'running'>('download');
  const [txRef, setTxRef] = useState('');
  const [copied, setCopied] = useState(false);
  const [busy, setBusy] = useState(false);
  const [statusMessage, setStatusMessage] = useState('');
  const [runCount, setRunCount] = useState(0);
  const [usdInput, setUsdInput] = useState('25');

  const [joinName, setJoinName] = useState('');
  const [joinChain, setJoinChain] = useState<ChainId>('BTC');
  const [joinAddress, setJoinAddress] = useState('');
  const [joinShares, setJoinShares] = useState<number>(100);
  const [joinNotice, setJoinNotice] = useState('');

  useEffect(() => {
    if (activeWallets.length > 0 && !activeWallets.some((w) => w.chain === selectedChain)) {
      setSelectedChain(activeWallets[0].chain);
    }
  }, [activeWallets, selectedChain]);

  const activeWallet =
    activeWallets.find((w) => w.chain === selectedChain) ?? activeWallets[0] ?? null;

  const unlockUsd = config.downloadModel === 'free_run_share' ? 0 : config.downloadPriceUsd;
  const downloadCreatorShareUsd = Number(
    ((unlockUsd * config.creatorSharePercent) / 100).toFixed(2),
  );
  const runCreatorShareUsd = Number(
    ((config.runShareUsd * config.creatorSharePercent) / 100).toFixed(2),
  );

  const paymentUri = activeWallet
    ? buildCryptoPaymentUri(activeWallet, Math.max(unlockUsd, 1), `${config.appName} Download`)
    : '';

  const handleCopyAddress = async () => {
    if (!activeWallet) return;
    await navigator.clipboard.writeText(activeWallet.address.trim());
    setCopied(true);
    setTimeout(() => setCopied(false), 1800);
  };

  const handleDownloadAndLaunch = async () => {
    if (!activeWallet) return;
    setBusy(true);
    setStatusMessage('');
    try {
      await onRecordDownload({
        chain: activeWallet.chain,
        customUsd: unlockUsd,
        txRef: txRef.trim() || undefined,
      });
      setStage('running');
      const chainSummary =
        activeWallets.length > 1
          ? activeWallets.map((w) => `${w.chain} ${w.splitPercent}%`).join(', ')
          : activeWallet.chain;
      setStatusMessage(
        unlockUsd > 0
          ? `Download unlocked. Creator share ($${downloadCreatorShareUsd.toFixed(2)}) distributed across ${chainSummary}.`
          : `App installed & launched. Creator receives $${runCreatorShareUsd.toFixed(2)} per active run across ${chainSummary}.`,
      );
    } finally {
      setBusy(false);
    }
  };

  const handleRunOrTip = async (tipUsd?: number) => {
    if (!activeWallet) return;
    setBusy(true);
    setStatusMessage('');
    try {
      const gross = tipUsd ?? config.runShareUsd;
      await onRecordRun({
        chain: activeWallet.chain,
        amountUsd: gross,
        isTip: typeof tipUsd === 'number',
      });
      setRunCount((c) => c + 1);
      const share = ((gross * config.creatorSharePercent) / 100).toFixed(2);
      const chainSummary =
        activeWallets.length > 1
          ? activeWallets.map((w) => `${w.chain} ${w.splitPercent}%`).join(', ')
          : activeWallet.chain;
      setStatusMessage(
        typeof tipUsd === 'number'
          ? `Sent $${tipUsd.toFixed(2)} supporter tip ($${share} creator share split to ${chainSummary}).`
          : `Run session #${runCount + 1} recorded ($${share} creator share split to ${chainSummary}).`,
      );
    } finally {
      setBusy(false);
    }
  };

  const totalPoolShares = useMemo(
    () => shareholders.reduce((sum, s) => sum + Math.max(0, Number(s.shares) || 0), 0),
    [shareholders],
  );

  const handleMobileJoin = async () => {
    if (!onJoinShareholder) return;
    setJoinNotice('');
    if (!joinName.trim()) {
      setJoinNotice('Enter your name or handle.');
      return;
    }
    const check = validateWalletAddress(joinChain, joinAddress);
    if (!check.valid) {
      setJoinNotice(check.reason || 'Enter a valid receiving wallet address.');
      return;
    }
    setBusy(true);
    try {
      const res = await onJoinShareholder({
        name: joinName.trim(),
        chain: joinChain,
        network: CHAIN_SPECS[joinChain].defaultNetwork,
        address: joinAddress.trim(),
        shares: Math.max(1, Math.floor(joinShares)),
      });
      if (!res.ok) {
        setJoinNotice(res.error || 'Could not join share pool.');
        return;
      }
      setJoinNotice(
        `Joined with ${Math.max(1, Math.floor(joinShares)).toLocaleString()} shares in the 50% participant pool.`,
      );
      setJoinName('');
      setJoinAddress('');
    } finally {
      setBusy(false);
    }
  };

  const numericUsd = Math.max(0, Number.parseFloat(usdInput) || 0);

  const phoneBody = (
    <div className="flex h-full flex-col bg-slate-50 text-slate-900">
      <div className="flex items-center justify-between bg-slate-900 px-5 py-2 text-[11px] font-medium text-slate-200">
        <span className="font-mono tabular-nums">9:41</span>
        <div className="flex items-center gap-2">
          <Wifi className="h-3.5 w-3.5" />
          <Battery className="h-3.5 w-3.5" />
        </div>
      </div>

      <div className="flex items-center justify-between border-b border-slate-200 bg-white px-4 py-3">
        <div className="min-w-0">
          <p className="truncate text-sm font-semibold text-slate-900">{config.appName}</p>
          <p className="truncate text-[11px] text-slate-500">
            v{config.version} · 50% creator · 50% member pool
          </p>
        </div>
        <div className="flex items-center gap-1.5">
          {stage === 'running' && (
            <button
              type="button"
              onClick={() => setStage('download')}
              className="min-h-[36px] rounded-lg border border-slate-200 px-2.5 text-xs font-medium text-slate-700 hover:bg-slate-50"
            >
              Unlock Info
            </button>
          )}
          {standalone && <PWAInstallButton compact />}
        </div>
      </div>

      <div className="flex-1 space-y-4 overflow-y-auto p-4">
        {activeWallet ? (
          stage === 'download' ? (
            <>
              <div className="rounded-2xl border border-slate-200 bg-white p-4">
                <div className="flex items-start gap-3">
                  <img
                    src="/icon.svg"
                    alt={config.appName}
                    referrerPolicy="no-referrer"
                    className="h-12 w-12 shrink-0 rounded-xl border border-slate-200 bg-slate-900"
                  />
                  <div className="min-w-0 flex-1">
                    <h2 className="truncate text-base font-semibold text-slate-900">
                      {config.appName}
                    </h2>
                    <p className="mt-0.5 text-xs leading-relaxed text-slate-600">
                      {config.tagline}
                    </p>
                  </div>
                </div>

                <div className="mt-4 grid grid-cols-3 gap-2 border-t border-slate-100 pt-3 text-xs">
                  <div>
                    <span className="text-[11px] text-slate-500">Unlock</span>
                    <p className="mt-0.5 font-mono font-semibold tabular-nums text-slate-900">
                      {unlockUsd === 0 ? 'Free' : `$${unlockUsd.toFixed(2)}`}
                    </p>
                  </div>
                  <div>
                    <span className="text-[11px] text-slate-500">Creator (50%)</span>
                    <p className="mt-0.5 font-mono font-semibold tabular-nums text-amber-700">
                      ${downloadCreatorShareUsd.toFixed(2)}
                    </p>
                  </div>
                  <div>
                    <span className="text-[11px] text-slate-500">Members (50%)</span>
                    <p className="mt-0.5 font-mono font-semibold tabular-nums text-slate-900">
                      ${(unlockUsd - downloadCreatorShareUsd).toFixed(2)}
                    </p>
                  </div>
                </div>
              </div>

              <div className="space-y-3 rounded-2xl border border-slate-200 bg-white p-4">
                <div className="flex items-center justify-between">
                  <span className="text-xs font-semibold text-slate-900">Select Payout Coin</span>
                  <span className="text-[11px] text-slate-500">Direct wallet routing</span>
                </div>

                <div className="flex flex-wrap gap-1.5">
                  {activeWallets.map((wallet) => {
                    const selected = selectedChain === wallet.chain;
                    return (
                      <button
                        key={wallet.id}
                        type="button"
                        onClick={() => setSelectedChain(wallet.chain)}
                        className={`min-h-[36px] rounded-lg px-3 py-1.5 text-xs font-medium whitespace-nowrap transition-colors ${
                          selected
                            ? 'bg-slate-900 text-white'
                            : 'border border-slate-200 bg-slate-50 text-slate-700 hover:bg-slate-100'
                        }`}
                      >
                        {wallet.chain} ({wallet.splitPercent}%)
                      </button>
                    );
                  })}
                </div>

                <div className="flex flex-col items-center rounded-xl border border-slate-100 bg-slate-50 p-3">
                  <QrCodeBox
                    value={paymentUri}
                    size={136}
                    alt={`${activeWallet.chain} payment QR code`}
                  />
                  <p className="mt-2 font-mono text-[11px] text-slate-700">
                    {truncateAddress(activeWallet.address)}
                  </p>
                  <div className="mt-2 flex flex-wrap items-center justify-center gap-2">
                    <button
                      type="button"
                      onClick={() => void handleCopyAddress()}
                      className="inline-flex min-h-[34px] items-center gap-1.5 rounded-lg border border-slate-200 bg-white px-2.5 text-xs font-medium text-slate-700 hover:bg-slate-100"
                    >
                      {copied ? (
                        <Check className="h-3.5 w-3.5 text-emerald-600" />
                      ) : (
                        <Copy className="h-3.5 w-3.5" />
                      )}
                      <span>{copied ? 'Copied' : 'Copy Address'}</span>
                    </button>
                    <a
                      href={paymentUri}
                      className="inline-flex min-h-[34px] items-center gap-1.5 rounded-lg border border-slate-200 bg-white px-2.5 text-xs font-medium text-slate-700 hover:bg-slate-100"
                    >
                      <ExternalLink className="h-3.5 w-3.5" />
                      <span>Open Wallet</span>
                    </a>
                  </div>
                </div>

                <div>
                  <label
                    htmlFor="android-tx-ref"
                    className="block text-[11px] font-medium text-slate-600"
                  >
                    Optional TXID / Payment Reference
                  </label>
                  <input
                    id="android-tx-ref"
                    type="text"
                    value={txRef}
                    onChange={(e) => setTxRef(e.target.value)}
                    placeholder="Paste TX hash or leave blank for demo unlock"
                    className="mt-1 w-full rounded-lg border border-slate-300 px-3 py-2 font-mono text-xs text-slate-900 focus:border-slate-900 focus:outline-none"
                  />
                </div>
              </div>

              <button
                type="button"
                disabled={busy}
                onClick={() => void handleDownloadAndLaunch()}
                className="flex min-h-[48px] w-full items-center justify-center gap-2 rounded-xl bg-slate-900 px-4 py-3 text-sm font-medium text-white transition-colors hover:bg-slate-800 disabled:opacity-60"
              >
                <Download className="h-4 w-4" />
                <span>{busy ? 'Recording Download...' : 'Download & Run Android App'}</span>
              </button>
            </>
          ) : (
            <>
              <div className="rounded-2xl border border-emerald-200 bg-emerald-50 p-3.5 text-xs text-emerald-900">
                <div className="flex items-center gap-2 font-semibold">
                  <CheckCircle2 className="h-4 w-4 text-emerald-700" />
                  <span>App Running · Verified Creator Split Active</span>
                </div>
                <p className="mt-1 text-emerald-800">
                  {config.creatorSharePercent}% of active run shares route to{' '}
                  {truncateAddress(activeWallet.address)} ({activeWallet.chain}).
                </p>
              </div>

              <div className="space-y-3 rounded-2xl border border-slate-200 bg-white p-4">
                <div className="flex items-center justify-between">
                  <div className="flex items-center gap-2">
                    <Coins className="h-4 w-4 text-amber-600" />
                    <h3 className="text-sm font-semibold text-slate-900">
                      Multi-Chain Sats &amp; Value Tool
                    </h3>
                  </div>
                  <span className="font-mono text-[11px] tabular-nums text-slate-500">
                    Runs: {runCount}
                  </span>
                </div>

                <div>
                  <label
                    htmlFor="sats-usd"
                    className="block text-[11px] font-medium text-slate-600"
                  >
                    Enter USD Amount to Convert
                  </label>
                  <input
                    id="sats-usd"
                    type="number"
                    min={0}
                    value={usdInput}
                    onChange={(e) => setUsdInput(e.target.value)}
                    className="mt-1 w-full rounded-xl border border-slate-300 px-3 py-2 font-mono text-base font-semibold tabular-nums text-slate-900 focus:border-slate-900 focus:outline-none"
                  />
                </div>

                <div className="grid grid-cols-2 gap-2">
                  {(['BTC', 'ETH', 'SOL', 'USDT'] as ChainId[]).map((chain) => (
                    <div
                      key={chain}
                      className="rounded-xl border border-slate-200 bg-slate-50 p-2.5"
                    >
                      <div className="text-[11px] font-medium text-slate-500">
                        {CHAIN_SPECS[chain].name}
                      </div>
                      <div className="mt-0.5 font-mono text-xs font-semibold tabular-nums text-slate-900">
                        {usdToCryptoAmount(numericUsd, chain)} {chain}
                      </div>
                    </div>
                  ))}
                </div>

                <button
                  type="button"
                  disabled={busy}
                  onClick={() => void handleRunOrTip()}
                  className="flex min-h-[46px] w-full items-center justify-center gap-2 rounded-xl bg-slate-900 px-4 py-2.5 text-xs font-medium text-white hover:bg-slate-800 disabled:opacity-60"
                >
                  <Play className="h-3.5 w-3.5" />
                  <span>Run Utility Session (+${runCreatorShareUsd.toFixed(2)} Share)</span>
                </button>
              </div>

              <div className="space-y-3 rounded-2xl border border-slate-200 bg-white p-4">
                <div className="flex items-center gap-2">
                  <Timer className="h-4 w-4 text-slate-700" />
                  <h3 className="text-sm font-semibold text-slate-900">
                    Send Creator Tip ({activeWallet.chain})
                  </h3>
                </div>
                <div className="grid grid-cols-3 gap-2">
                  {[1, 5, 10].map((tip) => (
                    <button
                      key={tip}
                      type="button"
                      disabled={busy}
                      onClick={() => void handleRunOrTip(tip)}
                      className="min-h-[44px] rounded-xl border border-slate-200 bg-slate-50 font-mono text-xs font-semibold tabular-nums text-slate-900 hover:bg-slate-100"
                    >
                      +${tip}
                    </button>
                  ))}
                </div>
              </div>

              {onJoinShareholder && (
                <div className="space-y-3 rounded-2xl border border-slate-200 bg-white p-4">
                  <div className="flex items-center justify-between">
                    <div className="flex items-center gap-2">
                      <UserPlus className="h-4 w-4 text-amber-600" />
                      <h3 className="text-sm font-semibold text-slate-900">
                        Join 50% Member Pool
                      </h3>
                    </div>
                    <span className="font-mono text-[11px] tabular-nums text-slate-500">
                      {totalPoolShares.toLocaleString()} sh
                    </span>
                  </div>
                  <p className="text-[11px] leading-relaxed text-slate-600">
                    Creator always keeps 50%. Join with 100, 1,000, or 10,000+ shares to earn a
                    proportional share of the other 50%.
                  </p>
                  <div className="grid grid-cols-3 gap-1.5">
                    {[100, 1000, 10000].map((tier) => (
                      <button
                        key={tier}
                        type="button"
                        onClick={() => setJoinShares(tier)}
                        className={`min-h-[34px] rounded-lg font-mono text-[11px] font-medium tabular-nums ${
                          joinShares === tier
                            ? 'bg-slate-900 text-white'
                            : 'border border-slate-200 bg-slate-50 text-slate-700'
                        }`}
                      >
                        {tier.toLocaleString()}
                      </button>
                    ))}
                  </div>
                  <div className="grid grid-cols-[1fr_78px] gap-2">
                    <input
                      type="text"
                      value={joinName}
                      onChange={(e) => setJoinName(e.target.value)}
                      placeholder="Your name or handle"
                      className="w-full rounded-lg border border-slate-300 px-2.5 py-1.5 text-xs text-slate-900 focus:border-slate-900 focus:outline-none"
                    />
                    <select
                      aria-label="Member payout coin"
                      value={joinChain}
                      onChange={(e) => setJoinChain(e.target.value as ChainId)}
                      className="rounded-lg border border-slate-300 bg-white px-2 py-1.5 text-xs font-medium text-slate-900"
                    >
                      {SUPPORTED_CHAINS.map((chain) => (
                        <option key={chain} value={chain}>
                          {chain}
                        </option>
                      ))}
                    </select>
                  </div>
                  <input
                    type="text"
                    value={joinAddress}
                    onChange={(e) => setJoinAddress(e.target.value)}
                    placeholder={`Receiving ${joinChain} address`}
                    className="w-full rounded-lg border border-slate-300 px-2.5 py-1.5 font-mono text-xs text-slate-900 focus:border-slate-900 focus:outline-none"
                  />
                  <button
                    type="button"
                    disabled={busy}
                    onClick={() => void handleMobileJoin()}
                    className="flex min-h-[40px] w-full items-center justify-center gap-1.5 rounded-xl bg-slate-900 px-3 py-2 text-xs font-medium text-white hover:bg-slate-800 disabled:opacity-60"
                  >
                    <UserPlus className="h-3.5 w-3.5" />
                    <span>Join with {joinShares.toLocaleString()} Shares</span>
                  </button>
                  {joinNotice && <p className="text-[11px] text-amber-800">{joinNotice}</p>}
                </div>
              )}
            </>
          )
        ) : (
          <div className="rounded-2xl border border-amber-200 bg-amber-50 p-5 text-center">
            <Smartphone className="mx-auto h-8 w-8 text-amber-700" />
            <h3 className="mt-3 text-base font-semibold text-slate-900">Creator Address Needed</h3>
            <p className="mt-1.5 text-xs leading-relaxed text-slate-600">
              Enter at least one valid BTC or crypto address in Creator Setup so users can download
              and send your revenue share.
            </p>
            {onNavigateSetup && (
              <button
                type="button"
                onClick={onNavigateSetup}
                className="mt-4 inline-flex min-h-[44px] items-center gap-2 rounded-xl bg-slate-900 px-4 py-2 text-xs font-medium text-white hover:bg-slate-800"
              >
                <span>Enter BTC Address</span>
                <ArrowRight className="h-3.5 w-3.5" />
              </button>
            )}
          </div>
        )}

        {statusMessage && (
          <div
            className="rounded-xl border border-slate-200 bg-slate-900 p-3 text-xs text-white"
            role="status"
          >
            {statusMessage}
          </div>
        )}
      </div>

      <div className="flex items-center justify-center border-t border-slate-100 bg-white py-2">
        <div className="h-1 w-24 rounded-full bg-slate-300" />
      </div>
    </div>
  );

  if (standalone) {
    return (
      <div className="mx-auto flex min-h-screen max-w-md flex-col bg-slate-50">{phoneBody}</div>
    );
  }

  return (
    <div className="mx-auto w-full max-w-[360px] overflow-hidden rounded-[40px] border-[8px] border-slate-900 bg-slate-900 shadow-xl">
      <div className="h-[640px] overflow-hidden rounded-[32px] bg-white">{phoneBody}</div>
    </div>
  );
}
