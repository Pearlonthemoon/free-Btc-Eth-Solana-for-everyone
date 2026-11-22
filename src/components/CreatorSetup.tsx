import {AlertCircle, CheckCircle2, Plus, Scale, Trash2, UserPlus, Users, WandSparkles} from 'lucide-react';
import {useEffect, useMemo, useState, type FormEvent} from 'react';
import type {
  AppConfig,
  ChainId,
  DownloadModel,
  RevenueMode,
  Shareholder,
  WalletConfig,
} from '../types';
import {
  CHAIN_SPECS,
  SUPPORTED_CHAINS,
  truncateAddress,
  validateWalletAddress,
} from '../utils/crypto';

interface CreatorSetupProps {
  config: AppConfig;
  shareholders: Shareholder[];
  saving: boolean;
  onSaveConfig: (config: AppConfig) => Promise<void>;
  onJoinShareholder: (payload: {
    name: string;
    chain: ChainId;
    network?: string;
    address: string;
    shares: number;
  }) => Promise<{ok: boolean; error?: string}>;
  onUpdateShares: (id: string, payload: {addShares?: number; setShares?: number}) => Promise<void>;
  onRemoveShareholder: (id: string) => Promise<void>;
}

const QUICK_SHARE_TIERS = [100, 1000, 10000, 50000, 100000] as const;

export function CreatorSetup({
  config,
  shareholders,
  saving,
  onSaveConfig,
  onJoinShareholder,
  onUpdateShares,
  onRemoveShareholder,
}: CreatorSetupProps) {
  const [draft, setDraft] = useState<AppConfig>({...config, creatorSharePercent: 50});
  const [newChain, setNewChain] = useState<ChainId>('LN');
  const [saveSuccess, setSaveSuccess] = useState('');
  const [formError, setFormError] = useState('');

  const [joinName, setJoinName] = useState('');
  const [joinChain, setJoinChain] = useState<ChainId>('BTC');
  const [joinAddress, setJoinAddress] = useState('');
  const [joinShares, setJoinShares] = useState<number>(100);
  const [joining, setJoining] = useState(false);
  const [joinError, setJoinError] = useState('');
  const [joinSuccess, setJoinSuccess] = useState('');
  const [updatingId, setUpdatingId] = useState<string | null>(null);

  useEffect(() => {
    setDraft({...config, creatorSharePercent: 50});
  }, [config]);

  const hasUnsavedChanges = useMemo(
    () => JSON.stringify(draft) !== JSON.stringify(config),
    [draft, config],
  );

  const savedPrimaryCheck = useMemo(() => {
    return (['BTC', 'ETH', 'SOL'] as ChainId[]).map((chain) => {
      const savedWallet = config.wallets.find(
        (w) => w.chain === chain && w.enabled && validateWalletAddress(w.chain, w.address).valid,
      );
      return {
        chain,
        saved: Boolean(savedWallet),
        address: savedWallet?.address.trim() ?? '',
      };
    });
  }, [config.wallets]);

  const totalEnabledSplit = useMemo(
    () =>
      draft.wallets
        .filter((w) => w.enabled)
        .reduce((sum, w) => sum + (Number(w.splitPercent) || 0), 0),
    [draft.wallets],
  );

  const verifiedCount = useMemo(
    () =>
      draft.wallets.filter(
        (w) => w.enabled && validateWalletAddress(w.chain, w.address).valid,
      ).length,
    [draft.wallets],
  );

  const totalPoolShares = useMemo(
    () => shareholders.reduce((sum, sh) => sum + Math.max(0, Number(sh.shares) || 0), 0),
    [shareholders],
  );

  const updateField = <K extends keyof AppConfig>(key: K, value: AppConfig[K]) => {
    setDraft((prev) => ({...prev, [key]: value}));
    setSaveSuccess('');
    setFormError('');
  };

  const updateWallet = (id: string, patch: Partial<WalletConfig>) => {
    setDraft((prev) => ({
      ...prev,
      wallets: prev.wallets.map((w) => (w.id === id ? {...w, ...patch} : w)),
    }));
    setSaveSuccess('');
    setFormError('');
  };

  const removeWallet = (id: string) => {
    setDraft((prev) => ({
      ...prev,
      wallets: prev.wallets.filter((w) => w.id !== id),
    }));
    setSaveSuccess('');
    setFormError('');
  };

  const handleAddWallet = () => {
    const spec = CHAIN_SPECS[newChain];
    const nextWallet: WalletConfig = {
      id: `w-${newChain.toLowerCase()}-${Date.now().toString(36)}`,
      chain: newChain,
      network: spec.defaultNetwork,
      label: `${newChain} Payout Wallet`,
      address: '',
      splitPercent: draft.wallets.some((w) => w.enabled) ? 0 : 100,
      enabled: true,
    };
    setDraft((prev) => ({
      ...prev,
      wallets: [...prev.wallets, nextWallet],
    }));
    setSaveSuccess('');
    setFormError('');
  };

  const handleAutoBalance = () => {
    const enabled = draft.wallets.filter((w) => w.enabled);
    if (enabled.length === 0) return;
    const base = Math.floor(100 / enabled.length);
    const remainder = 100 - base * enabled.length;
    let index = 0;

    setDraft((prev) => ({
      ...prev,
      wallets: prev.wallets.map((w) => {
        if (!w.enabled) return {...w, splitPercent: 0};
        const share = base + (index === 0 ? remainder : 0);
        index += 1;
        return {...w, splitPercent: share};
      }),
    }));
    setSaveSuccess('');
    setFormError('');
  };

  const handleFillSampleAddresses = () => {
    setDraft((prev) => ({
      ...prev,
      wallets: prev.wallets.map((w) => ({
        ...w,
        address: w.address.trim() ? w.address : CHAIN_SPECS[w.chain].sampleAddress,
      })),
    }));
    setSaveSuccess('');
    setFormError('');
  };

  const handleSubmit = async (e: FormEvent) => {
    e.preventDefault();
    setFormError('');
    setSaveSuccess('');

    const enabled = draft.wallets.filter((w) => w.enabled);
    if (enabled.length === 0) {
      setFormError('Enable at least one crypto payout wallet to receive your creator share.');
      return;
    }

    for (const wallet of enabled) {
      const check = validateWalletAddress(wallet.chain, wallet.address);
      if (!check.valid) {
        setFormError(`${wallet.label || wallet.chain}: ${check.reason}`);
        return;
      }
    }

    if (Math.abs(totalEnabledSplit - 100) > 0.01) {
      setFormError(
        `Enabled wallet split percentages must total 100% (currently ${totalEnabledSplit}%). Click Auto-Balance to fix.`,
      );
      return;
    }

    await onSaveConfig({...draft, creatorSharePercent: 50});
    setSaveSuccess('Creator addresses (50% fixed split) and revenue share rules saved.');
  };

  const handleJoinSubmit = async () => {
    setJoinError('');
    setJoinSuccess('');

    const cleanName = joinName.trim();
    if (!cleanName) {
      setJoinError('Enter a participant name or handle.');
      return;
    }
    const addrValidation = validateWalletAddress(joinChain, joinAddress);
    if (!addrValidation.valid) {
      setJoinError(addrValidation.reason || 'Enter a valid payout address.');
      return;
    }
    const shareCount = Math.floor(Number(joinShares) || 0);
    if (shareCount < 1) {
      setJoinError('Enter at least 1 share (e.g. 100, 1,000, or 10,000).');
      return;
    }

    setJoining(true);
    try {
      const result = await onJoinShareholder({
        name: cleanName,
        chain: joinChain,
        network: CHAIN_SPECS[joinChain].defaultNetwork,
        address: joinAddress.trim(),
        shares: shareCount,
      });
      if (!result.ok) {
        setJoinError(result.error || 'Unable to join share pool.');
        return;
      }
      setJoinName('');
      setJoinAddress('');
      setJoinSuccess(
        `${cleanName} joined with ${shareCount.toLocaleString()} shares in the 50% participant pool.`,
      );
    } finally {
      setJoining(false);
    }
  };

  const handleBoostShares = async (id: string, delta: number) => {
    setUpdatingId(id);
    try {
      await onUpdateShares(id, {addShares: delta});
    } finally {
      setUpdatingId(null);
    }
  };

  const handleRemoveParticipant = async (id: string) => {
    setUpdatingId(id);
    try {
      await onRemoveShareholder(id);
    } finally {
      setUpdatingId(null);
    }
  };

  return (
    <form onSubmit={(e) => void handleSubmit(e)} className="space-y-8">
      <div className="border-b border-slate-200 pb-6 space-y-4">
        <div className="flex flex-wrap items-end justify-between gap-4">
          <div>
            <h1 className="text-2xl font-semibold tracking-tight text-slate-900 sm:text-3xl">
              Creator Addresses &amp; Revenue Split
            </h1>
            <p className="mt-1.5 max-w-2xl text-sm text-slate-600">
              Enter your Bitcoin and multi-chain addresses below. Every download, app launch, and
              supporter tip routes your configured share directly to these wallets.
            </p>
          </div>

          <button
            type="button"
            onClick={handleFillSampleAddresses}
            className="inline-flex min-h-[40px] items-center gap-2 whitespace-nowrap rounded-lg border border-slate-300 bg-white px-3.5 py-2 text-xs font-medium text-slate-700 hover:bg-slate-50"
          >
            <WandSparkles className="h-3.5 w-3.5" />
            <span>Fill Sample Addresses</span>
          </button>
        </div>

        <div className="flex flex-wrap items-center justify-between gap-3 rounded-xl border border-slate-200 bg-white px-4 py-3 text-xs">
          <div className="flex flex-wrap items-center gap-x-5 gap-y-1.5">
            {savedPrimaryCheck.map((item) => (
              <div key={item.chain} className="flex items-center gap-1.5">
                {item.saved ? (
                  <CheckCircle2 className="h-3.5 w-3.5 text-emerald-600" />
                ) : (
                  <AlertCircle className="h-3.5 w-3.5 text-amber-600" />
                )}
                <span className="font-semibold text-slate-900">{item.chain}:</span>
                <span className={item.saved ? 'font-mono text-emerald-700' : 'text-amber-700'}>
                  {item.saved ? `Saved (${truncateAddress(item.address)})` : 'Missing'}
                </span>
              </div>
            ))}
          </div>
          <div className="flex items-center gap-3">
            <span className="font-mono font-semibold text-slate-900">
              Creator 50% Always · Pool 50%
            </span>
            {hasUnsavedChanges && (
              <span className="font-medium text-amber-700">Unsaved changes</span>
            )}
          </div>
        </div>
      </div>

      <section aria-labelledby="wallets-heading" className="space-y-4">
        <div className="flex flex-wrap items-center justify-between gap-3">
          <div>
            <h2 id="wallets-heading" className="text-lg font-semibold text-slate-900">
              01. Payout Wallet Addresses
            </h2>
            <p className="text-xs text-slate-500">
              {verifiedCount} verified active {verifiedCount === 1 ? 'wallet' : 'wallets'} · Total
              split allocation:{' '}
              <span
                className={`font-mono font-semibold tabular-nums ${
                  totalEnabledSplit === 100 ? 'text-emerald-700' : 'text-amber-700'
                }`}
              >
                {totalEnabledSplit}%
              </span>
            </p>
          </div>

          <div className="flex flex-wrap items-center gap-2">
            <button
              type="button"
              onClick={handleAutoBalance}
              className="inline-flex min-h-[38px] items-center gap-1.5 whitespace-nowrap rounded-lg border border-slate-300 bg-white px-3 py-1.5 text-xs font-medium text-slate-700 hover:bg-slate-50"
            >
              <Scale className="h-3.5 w-3.5" />
              <span>Auto-Balance 100%</span>
            </button>

            <div className="flex items-center gap-1.5">
              <select
                aria-label="Select cryptocurrency chain to add"
                value={newChain}
                onChange={(e) => setNewChain(e.target.value as ChainId)}
                className="min-h-[38px] rounded-lg border border-slate-300 bg-white px-2.5 text-xs font-medium text-slate-800 focus:border-slate-900 focus:outline-none"
              >
                {SUPPORTED_CHAINS.map((chain) => (
                  <option key={chain} value={chain}>
                    {CHAIN_SPECS[chain].name}
                  </option>
                ))}
              </select>
              <button
                type="button"
                onClick={handleAddWallet}
                className="inline-flex min-h-[38px] items-center gap-1 whitespace-nowrap rounded-lg bg-slate-900 px-3 py-1.5 text-xs font-medium text-white hover:bg-slate-800"
              >
                <Plus className="h-3.5 w-3.5" />
                <span>Add Wallet</span>
              </button>
            </div>
          </div>
        </div>

        <div className="space-y-3">
          {draft.wallets.map((wallet) => {
            const spec = CHAIN_SPECS[wallet.chain];
            const validation = validateWalletAddress(wallet.chain, wallet.address);

            return (
              <div
                key={wallet.id}
                className="rounded-xl border border-slate-200 bg-white p-4 sm:p-5"
              >
                <div className="flex flex-wrap items-center justify-between gap-3 border-b border-slate-100 pb-3">
                  <div className="flex items-center gap-3">
                    <input
                      id={`enable-${wallet.id}`}
                      type="checkbox"
                      checked={wallet.enabled}
                      onChange={(e) => updateWallet(wallet.id, {enabled: e.target.checked})}
                      className="h-4 w-4 rounded border-slate-300 text-slate-900 focus:ring-slate-900"
                    />
                    <label
                      htmlFor={`enable-${wallet.id}`}
                      className="cursor-pointer text-sm font-semibold text-slate-900"
                    >
                      {spec.name}
                    </label>
                    <span className="text-xs text-slate-500">{wallet.network}</span>
                  </div>

                  <div className="flex items-center gap-3">
                    {wallet.enabled && wallet.address.trim() ? (
                      validation.valid ? (
                        <span className="inline-flex items-center gap-1 text-xs font-medium text-emerald-700">
                          <CheckCircle2 className="h-3.5 w-3.5" />
                          <span>Verified format</span>
                        </span>
                      ) : (
                        <span className="text-xs font-medium text-red-600">
                          {validation.reason}
                        </span>
                      )
                    ) : (
                      <span className="text-xs text-slate-400">
                        {wallet.enabled ? 'Address required' : 'Disabled'}
                      </span>
                    )}

                    {draft.wallets.length > 1 && (
                      <button
                        type="button"
                        onClick={() => removeWallet(wallet.id)}
                        aria-label={`Remove ${wallet.label}`}
                        className="flex h-8 w-8 items-center justify-center rounded-lg text-slate-400 hover:bg-slate-100 hover:text-red-600"
                      >
                        <Trash2 className="h-4 w-4" />
                      </button>
                    )}
                  </div>
                </div>

                <div className="mt-3 grid gap-3 sm:grid-cols-[150px_180px_minmax(0,1fr)_96px]">
                  <div>
                    <label
                      htmlFor={`label-${wallet.id}`}
                      className="block text-xs font-medium text-slate-600"
                    >
                      Wallet Label
                    </label>
                    <input
                      id={`label-${wallet.id}`}
                      type="text"
                      value={wallet.label}
                      onChange={(e) => updateWallet(wallet.id, {label: e.target.value})}
                      className="mt-1 w-full rounded-lg border border-slate-300 px-3 py-2 text-xs text-slate-900 focus:border-slate-900 focus:outline-none"
                    />
                  </div>

                  <div>
                    <label
                      htmlFor={`net-${wallet.id}`}
                      className="block text-xs font-medium text-slate-600"
                    >
                      Network
                    </label>
                    <input
                      id={`net-${wallet.id}`}
                      type="text"
                      value={wallet.network}
                      onChange={(e) => updateWallet(wallet.id, {network: e.target.value})}
                      className="mt-1 w-full rounded-lg border border-slate-300 px-3 py-2 text-xs text-slate-900 focus:border-slate-900 focus:outline-none"
                    />
                  </div>

                  <div>
                    <label
                      htmlFor={`addr-${wallet.id}`}
                      className="block text-xs font-medium text-slate-600"
                    >
                      Receiving {wallet.chain} Address
                    </label>
                    <input
                      id={`addr-${wallet.id}`}
                      type="text"
                      value={wallet.address}
                      onChange={(e) => updateWallet(wallet.id, {address: e.target.value})}
                      placeholder={spec.placeholder}
                      className="mt-1 w-full rounded-lg border border-slate-300 px-3 py-2 font-mono text-xs text-slate-900 focus:border-slate-900 focus:outline-none"
                    />
                  </div>

                  <div>
                    <label
                      htmlFor={`split-${wallet.id}`}
                      className="block text-xs font-medium text-slate-600"
                    >
                      Split %
                    </label>
                    <input
                      id={`split-${wallet.id}`}
                      type="number"
                      min={0}
                      max={100}
                      disabled={!wallet.enabled}
                      value={wallet.splitPercent}
                      onChange={(e) =>
                        updateWallet(wallet.id, {
                          splitPercent: Math.max(0, Math.min(100, Number(e.target.value) || 0)),
                        })
                      }
                      className="mt-1 w-full rounded-lg border border-slate-300 px-3 py-2 font-mono text-xs tabular-nums text-slate-900 focus:border-slate-900 focus:outline-none disabled:bg-slate-50 disabled:text-slate-400"
                    />
                  </div>
                </div>
              </div>
            );
          })}
        </div>
      </section>

      <section aria-labelledby="app-rules-heading" className="space-y-4">
        <div>
          <h2 id="app-rules-heading" className="text-lg font-semibold text-slate-900">
            02. App Identity &amp; Revenue Share Model
          </h2>
          <p className="text-xs text-slate-500">
            Configure the installable Android package metadata, download pricing, and per-run share
            rates.
          </p>
        </div>

        <div className="space-y-4 rounded-xl border border-slate-200 bg-white p-5">
          <div className="grid gap-4 sm:grid-cols-3">
            <div>
              <label htmlFor="app-name" className="block text-xs font-medium text-slate-700">
                App Name
              </label>
              <input
                id="app-name"
                type="text"
                value={draft.appName}
                onChange={(e) => updateField('appName', e.target.value)}
                className="mt-1 w-full rounded-lg border border-slate-300 px-3 py-2 text-sm text-slate-900 focus:border-slate-900 focus:outline-none"
              />
            </div>

            <div>
              <label htmlFor="package-id" className="block text-xs font-medium text-slate-700">
                Android Package ID
              </label>
              <input
                id="package-id"
                type="text"
                value={draft.packageId}
                onChange={(e) => updateField('packageId', e.target.value)}
                className="mt-1 w-full rounded-lg border border-slate-300 px-3 py-2 font-mono text-xs text-slate-900 focus:border-slate-900 focus:outline-none"
              />
            </div>

            <div>
              <label htmlFor="app-version" className="block text-xs font-medium text-slate-700">
                Release Version
              </label>
              <input
                id="app-version"
                type="text"
                value={draft.version}
                onChange={(e) => updateField('version', e.target.value)}
                className="mt-1 w-full rounded-lg border border-slate-300 px-3 py-2 font-mono text-sm text-slate-900 focus:border-slate-900 focus:outline-none"
              />
            </div>
          </div>

          <div className="grid gap-4 sm:grid-cols-2">
            <div>
              <label htmlFor="app-tagline" className="block text-xs font-medium text-slate-700">
                Short Tagline
              </label>
              <input
                id="app-tagline"
                type="text"
                value={draft.tagline}
                onChange={(e) => updateField('tagline', e.target.value)}
                className="mt-1 w-full rounded-lg border border-slate-300 px-3 py-2 text-sm text-slate-900 focus:border-slate-900 focus:outline-none"
              />
            </div>

            <div>
              <label htmlFor="download-model" className="block text-xs font-medium text-slate-700">
                Distribution Pricing Model
              </label>
              <select
                id="download-model"
                value={draft.downloadModel}
                onChange={(e) => updateField('downloadModel', e.target.value as DownloadModel)}
                className="mt-1 w-full rounded-lg border border-slate-300 bg-white px-3 py-2 text-sm text-slate-900 focus:border-slate-900 focus:outline-none"
              >
                <option value="supporter_pwyw">Paid Download / Supporter Unlock</option>
                <option value="free_run_share">Free Download + Per-Run Share</option>
              </select>
            </div>
          </div>

          <div>
            <label htmlFor="app-desc" className="block text-xs font-medium text-slate-700">
              Store Listing Description
            </label>
            <textarea
              id="app-desc"
              rows={2}
              value={draft.description}
              onChange={(e) => updateField('description', e.target.value)}
              className="mt-1 w-full rounded-lg border border-slate-300 px-3 py-2 text-sm text-slate-900 focus:border-slate-900 focus:outline-none"
            />
          </div>

          <div className="grid gap-4 border-t border-slate-100 pt-4 sm:grid-cols-4">
            <div>
              <label htmlFor="dl-price" className="block text-xs font-medium text-slate-700">
                Download Price (USD)
              </label>
              <input
                id="dl-price"
                type="number"
                step="0.01"
                min={0}
                disabled={draft.downloadModel === 'free_run_share'}
                value={draft.downloadModel === 'free_run_share' ? 0 : draft.downloadPriceUsd}
                onChange={(e) =>
                  updateField('downloadPriceUsd', Math.max(0, Number(e.target.value) || 0))
                }
                className="mt-1 w-full rounded-lg border border-slate-300 px-3 py-2 font-mono text-sm tabular-nums text-slate-900 focus:border-slate-900 focus:outline-none disabled:bg-slate-50 disabled:text-slate-400"
              />
            </div>

            <div>
              <label htmlFor="run-share" className="block text-xs font-medium text-slate-700">
                Per-Run Base (USD)
              </label>
              <input
                id="run-share"
                type="number"
                step="0.05"
                min={0}
                value={draft.runShareUsd}
                onChange={(e) =>
                  updateField('runShareUsd', Math.max(0, Number(e.target.value) || 0))
                }
                className="mt-1 w-full rounded-lg border border-slate-300 px-3 py-2 font-mono text-sm tabular-nums text-slate-900 focus:border-slate-900 focus:outline-none"
              />
            </div>

            <div>
              <label htmlFor="creator-pct" className="block text-xs font-medium text-slate-700">
                Creator Share (Fixed)
              </label>
              <input
                id="creator-pct"
                type="text"
                readOnly
                value="50% Always"
                className="mt-1 w-full rounded-lg border border-slate-200 bg-slate-50 px-3 py-2 font-mono text-sm font-semibold tabular-nums text-slate-900 focus:outline-none"
              />
            </div>

            <div>
              <label htmlFor="rev-mode" className="block text-xs font-medium text-slate-700">
                Trigger Mode
              </label>
              <select
                id="rev-mode"
                value={draft.revenueMode}
                onChange={(e) => updateField('revenueMode', e.target.value as RevenueMode)}
                className="mt-1 w-full rounded-lg border border-slate-300 bg-white px-3 py-2 text-sm text-slate-900 focus:border-slate-900 focus:outline-none"
              >
                <option value="hybrid">Download + Run</option>
                <option value="download_only">Download Only</option>
                <option value="run_only">Run Only</option>
              </select>
            </div>
          </div>
        </div>
      </section>

      {formError && (
        <div
          className="rounded-xl border border-red-200 bg-red-50 px-4 py-3 text-xs font-medium text-red-800"
          role="alert"
        >
          {formError}
        </div>
      )}

      {saveSuccess && (
        <div
          className="rounded-xl border border-emerald-200 bg-emerald-50 px-4 py-3 text-xs font-medium text-emerald-800"
          role="status"
        >
          {saveSuccess}
        </div>
      )}

      <div className="flex items-center justify-end">
        <button
          type="submit"
          disabled={saving}
          className="min-h-[44px] rounded-lg bg-slate-900 px-6 py-2.5 text-sm font-medium text-white transition-colors hover:bg-slate-800 disabled:opacity-60"
        >
          {saving ? 'Saving Configuration...' : 'Save Addresses & Revenue Rules'}
        </button>
      </div>

      <section aria-labelledby="share-pool-heading" className="space-y-4 border-t border-slate-200 pt-8">
        <div className="flex flex-wrap items-end justify-between gap-3">
          <div>
            <h2 id="share-pool-heading" className="text-lg font-semibold text-slate-900">
              03. Open 50% Participant Share Pool
            </h2>
            <p className="text-xs text-slate-500">
              The creator always keeps 50% across BTC, ETH (BEP20), and SOL. Anyone who joins splits
              the other 50% proportionally — holding 100, 1,000, 10,000, or more shares scales
              payouts accordingly.
            </p>
          </div>
          <div className="flex items-center gap-2 text-xs font-medium text-slate-700">
            <Users className="h-4 w-4 text-amber-600" />
            <span className="font-mono tabular-nums">
              {shareholders.length} joined · {totalPoolShares.toLocaleString()} total shares
            </span>
          </div>
        </div>

        <div className="rounded-xl border border-slate-200 bg-white p-5 space-y-5">
          <div className="space-y-2">
            <div className="flex items-center justify-between text-xs font-medium">
              <span className="text-slate-900">Creator Fixed Allocation: 50.00% Always</span>
              <span className="text-amber-700">Participant Share Pool: 50.00% Pro-Rata</span>
            </div>
            <div className="flex h-3 w-full overflow-hidden rounded-full bg-slate-100">
              <div className="h-full w-1/2 bg-slate-900" title="Creator 50% Fixed Always" />
              <div className="h-full w-1/2 bg-amber-500" title="Participant 50% Pro-Rata Pool" />
            </div>
            <div className="grid gap-3 pt-2 sm:grid-cols-4">
              {([100, 1000, 10000, 100000] as const).map((tierShares) => {
                const simulatedTotal = totalPoolShares + tierShares;
                const poolPct = (tierShares / simulatedTotal) * 50;
                return (
                  <div
                    key={tierShares}
                    className="rounded-lg border border-slate-200 bg-slate-50 px-3 py-2.5"
                  >
                    <div className="text-[11px] font-medium text-slate-500">
                      {tierShares.toLocaleString()} Shares
                    </div>
                    <div className="mt-0.5 font-mono text-sm font-semibold tabular-nums text-slate-900">
                      {poolPct.toFixed(2)}% of gross
                    </div>
                    <div className="mt-0.5 font-mono text-[11px] tabular-nums text-slate-500">
                      ${poolPct.toFixed(2)} per $100 · Creator $50.00
                    </div>
                  </div>
                );
              })}
            </div>
          </div>

          <div className="border-t border-slate-100 pt-5 space-y-3">
            <div className="flex items-center gap-2 text-xs font-semibold text-slate-900">
              <UserPlus className="h-4 w-4 text-amber-600" />
              <span>Join the 50% Revenue Pool</span>
            </div>

            <div className="grid gap-3 sm:grid-cols-[160px_140px_minmax(0,1fr)_130px]">
              <div>
                <label htmlFor="join-name" className="block text-xs font-medium text-slate-600">
                  Participant Name
                </label>
                <input
                  id="join-name"
                  type="text"
                  value={joinName}
                  onChange={(e) => setJoinName(e.target.value)}
                  placeholder="e.g. Ali / Community"
                  className="mt-1 w-full rounded-lg border border-slate-300 px-3 py-2 text-xs text-slate-900 focus:border-slate-900 focus:outline-none"
                />
              </div>

              <div>
                <label htmlFor="join-chain" className="block text-xs font-medium text-slate-600">
                  Payout Coin
                </label>
                <select
                  id="join-chain"
                  value={joinChain}
                  onChange={(e) => setJoinChain(e.target.value as ChainId)}
                  className="mt-1 w-full rounded-lg border border-slate-300 bg-white px-2.5 py-2 text-xs font-medium text-slate-900 focus:border-slate-900 focus:outline-none"
                >
                  {SUPPORTED_CHAINS.map((chain) => (
                    <option key={chain} value={chain}>
                      {chain}
                    </option>
                  ))}
                </select>
              </div>

              <div>
                <label htmlFor="join-addr" className="block text-xs font-medium text-slate-600">
                  Receiving {joinChain} Address
                </label>
                <input
                  id="join-addr"
                  type="text"
                  value={joinAddress}
                  onChange={(e) => setJoinAddress(e.target.value)}
                  placeholder={CHAIN_SPECS[joinChain].placeholder}
                  className="mt-1 w-full rounded-lg border border-slate-300 px-3 py-2 font-mono text-xs text-slate-900 focus:border-slate-900 focus:outline-none"
                />
              </div>

              <div>
                <label htmlFor="join-shares" className="block text-xs font-medium text-slate-600">
                  Shares
                </label>
                <input
                  id="join-shares"
                  type="number"
                  min={1}
                  step={100}
                  value={joinShares}
                  onChange={(e) => setJoinShares(Math.max(1, Math.floor(Number(e.target.value) || 1)))}
                  className="mt-1 w-full rounded-lg border border-slate-300 px-3 py-2 font-mono text-xs tabular-nums text-slate-900 focus:border-slate-900 focus:outline-none"
                />
              </div>
            </div>

            <div className="flex flex-wrap items-center justify-between gap-3">
              <div className="flex flex-wrap items-center gap-1.5">
                <span className="mr-1 text-xs text-slate-500">Quick tier:</span>
                {QUICK_SHARE_TIERS.map((tier) => (
                  <button
                    key={tier}
                    type="button"
                    onClick={() => setJoinShares(tier)}
                    className={`min-h-[34px] rounded-md px-2.5 font-mono text-xs font-medium tabular-nums whitespace-nowrap transition-colors ${
                      joinShares === tier
                        ? 'bg-slate-900 text-white'
                        : 'border border-slate-200 bg-slate-50 text-slate-700 hover:bg-slate-100'
                    }`}
                  >
                    {tier.toLocaleString()} sh
                  </button>
                ))}
              </div>

              <button
                type="button"
                disabled={joining}
                onClick={() => void handleJoinSubmit()}
                className="inline-flex min-h-[38px] items-center gap-1.5 whitespace-nowrap rounded-lg bg-slate-900 px-4 py-2 text-xs font-medium text-white hover:bg-slate-800 disabled:opacity-60"
              >
                <UserPlus className="h-3.5 w-3.5" />
                <span>{joining ? 'Joining...' : 'Join with Shares'}</span>
              </button>
            </div>

            {joinError && (
              <p className="text-xs font-medium text-red-600" role="alert">
                {joinError}
              </p>
            )}
            {joinSuccess && (
              <p className="text-xs font-medium text-emerald-700" role="status">
                {joinSuccess}
              </p>
            )}
          </div>

          <div className="border-t border-slate-100 pt-5">
            {shareholders.length === 0 ? (
              <p className="text-xs text-slate-500">
                No participants have joined yet. Creator still receives 50% fixed on every event; the
                remaining 50% member pool distributes pro-rata as soon as members join with 100,
                1,000, 10,000, or more shares.
              </p>
            ) : (
              <div className="overflow-x-auto">
                <table className="w-full border-collapse text-left text-xs">
                  <thead>
                    <tr className="border-b border-slate-200 text-slate-500">
                      <th className="py-2 pr-3 font-medium">Participant</th>
                      <th className="px-3 py-2 text-right font-medium">Shares</th>
                      <th className="px-3 py-2 text-right font-medium">Pool %</th>
                      <th className="px-3 py-2 text-right font-medium">Gross %</th>
                      <th className="px-3 py-2 text-right font-medium">Accrued</th>
                      <th className="py-2 pl-3 text-right font-medium">Increase Shares</th>
                    </tr>
                  </thead>
                  <tbody className="divide-y divide-slate-100">
                    {shareholders.map((sh) => {
                      const poolSharePct =
                        totalPoolShares > 0 ? (sh.shares / totalPoolShares) * 100 : 0;
                      const grossPct = poolSharePct * 0.5;
                      const busyRow = updatingId === sh.id;
                      return (
                        <tr key={sh.id} className="hover:bg-slate-50/70">
                          <td className="py-2.5 pr-3">
                            <div className="font-semibold text-slate-900">{sh.name}</div>
                            <div className="font-mono text-[11px] text-slate-500">
                              {sh.chain} · {truncateAddress(sh.address)}
                            </div>
                          </td>
                          <td className="px-3 py-2.5 text-right font-mono font-semibold tabular-nums text-slate-900">
                            {sh.shares.toLocaleString()}
                          </td>
                          <td className="px-3 py-2.5 text-right font-mono tabular-nums text-slate-700">
                            {poolSharePct.toFixed(2)}%
                          </td>
                          <td className="px-3 py-2.5 text-right font-mono tabular-nums text-amber-700">
                            {grossPct.toFixed(2)}%
                          </td>
                          <td className="px-3 py-2.5 text-right font-mono font-semibold tabular-nums text-slate-900">
                            ${sh.accruedUsd.toFixed(2)}
                          </td>
                          <td className="py-2.5 pl-3 text-right">
                            <div className="inline-flex items-center gap-1">
                              {[100, 1000, 10000].map((inc) => (
                                <button
                                  key={inc}
                                  type="button"
                                  disabled={busyRow}
                                  onClick={() => void handleBoostShares(sh.id, inc)}
                                  className="min-h-[30px] rounded border border-slate-200 bg-white px-2 font-mono text-[11px] font-medium tabular-nums text-slate-700 hover:bg-slate-100 disabled:opacity-50"
                                >
                                  +{inc.toLocaleString()}
                                </button>
                              ))}
                              <button
                                type="button"
                                disabled={busyRow}
                                onClick={() => void handleRemoveParticipant(sh.id)}
                                aria-label={`Remove ${sh.name}`}
                                className="ml-1 flex h-[30px] w-[30px] items-center justify-center rounded text-slate-400 hover:bg-slate-100 hover:text-red-600 disabled:opacity-50"
                              >
                                <Trash2 className="h-3.5 w-3.5" />
                              </button>
                            </div>
                          </td>
                        </tr>
                      );
                    })}
                  </tbody>
                </table>
              </div>
            )}
          </div>
        </div>
      </section>
    </form>
  );
}
