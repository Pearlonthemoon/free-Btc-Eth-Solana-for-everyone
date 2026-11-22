import {
  ArrowLeft,
  Download,
  Megaphone,
  Receipt,
  Settings,
  Smartphone,
} from 'lucide-react';
import {useCallback, useEffect, useState} from 'react';
import {CreatorSetup} from './components/CreatorSetup';
import {DownloadPortal} from './components/DownloadPortal';
import {GrowthHub} from './components/GrowthHub';
import {OfflineIndicator, PWAInstallButton} from './components/PWAInstallButton';
import {PayoutLedger} from './components/PayoutLedger';
import {PhonePreview} from './components/PhonePreview';
import type {AppConfig, ChainId, ShareDroidState, SocialChannel} from './types';
import {
  safeLocalStorageGet,
  safeLocalStorageSet,
  safeSessionStorageGet,
  safeSessionStorageSet,
} from './utils/safeBrowser';

type TabId = 'setup' | 'preview' | 'download' | 'growth' | 'ledger';

export default function App() {
  const [state, setState] = useState<ShareDroidState | null>(null);
  const [loading, setLoading] = useState(true);
  const [saving, setSaving] = useState(false);
  const [errorMessage, setErrorMessage] = useState('');
  const [activeTab, setActiveTab] = useState<TabId>('setup');

  const [utmSource] = useState(() =>
    typeof window === 'undefined'
      ? 'direct'
      : new URLSearchParams(window.location.search).get('utm_source') || 'direct',
  );

  const [standaloneMode, setStandaloneMode] = useState(() =>
    typeof window === 'undefined'
      ? false
      : new URLSearchParams(window.location.search).get('mode') === 'app',
  );

  const STORAGE_KEY = 'sharedroid_saved_config_v1';

  const loadState = useCallback(async () => {
    try {
      setErrorMessage('');
      const res = await fetch('/api/state');
      if (!res.ok) throw new Error('Failed to load ShareDroid configuration.');
      const data = (await res.json()) as ShareDroidState;

      const serverHasSavedAddresses = data.config.wallets.some((w) => w.address.trim().length > 0);
      if (!serverHasSavedAddresses) {
        const cachedRaw = safeLocalStorageGet(STORAGE_KEY);
        if (cachedRaw) {
          try {
            const cachedConfig = JSON.parse(cachedRaw) as AppConfig;
            if (cachedConfig?.wallets?.some((w) => w.address.trim().length > 0)) {
              const normalizedConfig: AppConfig = {
                ...cachedConfig,
                creatorSharePercent: 50,
              };
              const syncRes = await fetch('/api/config', {
                method: 'PUT',
                headers: {'Content-Type': 'application/json'},
                body: JSON.stringify(normalizedConfig),
              });
              if (syncRes.ok) {
                const synced = (await syncRes.json()) as ShareDroidState;
                safeLocalStorageSet(STORAGE_KEY, JSON.stringify(synced.config));
                setState(synced);
                return;
              }
            }
          } catch {
            // Ignore malformed cached config
          }
        }
      } else {
        safeLocalStorageSet(STORAGE_KEY, JSON.stringify({...data.config, creatorSharePercent: 50}));
      }

      setState(data);
    } catch (err) {
      setErrorMessage(err instanceof Error ? err.message : 'Unable to reach backend API.');
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => {
    void loadState();
  }, [loadState]);

  useEffect(() => {
    if (typeof window === 'undefined') return;
    const visitKey = `sd_visit_${utmSource}`;
    if (!safeSessionStorageGet(visitKey)) {
      safeSessionStorageSet(visitKey, '1');
      fetch('/api/events/visit', {
        method: 'POST',
        headers: {'Content-Type': 'application/json'},
        body: JSON.stringify({utmSource}),
      })
        .then((res) => (res.ok ? (res.json() as Promise<ShareDroidState>) : null))
        .then((next) => {
          if (next) setState(next);
        })
        .catch(() => {
          // Non-blocking visit attribution
        });
    }
  }, [utmSource]);

  const handleSaveConfig = async (nextConfig: AppConfig) => {
    setSaving(true);
    setErrorMessage('');
    try {
      const res = await fetch('/api/config', {
        method: 'PUT',
        headers: {'Content-Type': 'application/json'},
        body: JSON.stringify(nextConfig),
      });
      const payload = (await res.json()) as ShareDroidState & {error?: string};
      if (!res.ok) {
        throw new Error(payload.error || 'Failed to save configuration.');
      }
      safeLocalStorageSet(STORAGE_KEY, JSON.stringify(payload.config));
      setState(payload);
    } catch (err) {
      setErrorMessage(err instanceof Error ? err.message : 'Failed to save configuration.');
    } finally {
      setSaving(false);
    }
  };

  const handleRecordDownload = async (payload: {
    chain: ChainId;
    customUsd: number;
    txRef?: string;
  }) => {
    setErrorMessage('');
    const res = await fetch('/api/events/download', {
      method: 'POST',
      headers: {'Content-Type': 'application/json'},
      body: JSON.stringify({...payload, utmSource}),
    });
    const body = (await res.json()) as {state?: ShareDroidState; error?: string};
    if (!res.ok || !body.state) {
      setErrorMessage(body.error || 'Unable to record download event.');
      return;
    }
    setState(body.state);
  };

  const handleRecordRun = async (payload: {
    chain: ChainId;
    amountUsd: number;
    isTip?: boolean;
  }) => {
    setErrorMessage('');
    const res = await fetch('/api/events/run', {
      method: 'POST',
      headers: {'Content-Type': 'application/json'},
      body: JSON.stringify({...payload, utmSource}),
    });
    const body = (await res.json()) as {state?: ShareDroidState; error?: string};
    if (!res.ok || !body.state) {
      setErrorMessage(body.error || 'Unable to record run event.');
      return;
    }
    setState(body.state);
  };

  const handleSaveCampaign = async (payload: {
    id?: string;
    title?: string;
    channel?: SocialChannel;
    headline: string;
    body: string;
  }) => {
    const res = await fetch('/api/campaigns', {
      method: 'POST',
      headers: {'Content-Type': 'application/json'},
      body: JSON.stringify(payload),
    });
    if (res.ok) {
      const next = (await res.json()) as ShareDroidState;
      setState(next);
    }
  };

  const handleLogCampaignPost = async (id: string) => {
    const res = await fetch(`/api/campaigns/${encodeURIComponent(id)}/log-post`, {
      method: 'POST',
    });
    if (res.ok) {
      const next = (await res.json()) as ShareDroidState;
      setState(next);
    }
  };

  const handleTogglePlatform = async (id: string, checked: boolean) => {
    const res = await fetch('/api/platforms/checklist', {
      method: 'PUT',
      headers: {'Content-Type': 'application/json'},
      body: JSON.stringify({[id]: checked}),
    });
    if (res.ok) {
      const next = (await res.json()) as ShareDroidState;
      setState(next);
    }
  };

  const handleSettlePending = async () => {
    const res = await fetch('/api/payouts/settle', {method: 'POST'});
    if (res.ok) {
      const next = (await res.json()) as ShareDroidState;
      setState(next);
    }
  };

  const handleClearLedger = async () => {
    const res = await fetch('/api/events', {method: 'DELETE'});
    if (res.ok) {
      const next = (await res.json()) as ShareDroidState;
      setState(next);
    }
  };

  const handleJoinShareholder = async (payload: {
    name: string;
    chain: ChainId;
    network?: string;
    address: string;
    shares: number;
  }): Promise<{ok: boolean; error?: string}> => {
    const res = await fetch('/api/participants/join', {
      method: 'POST',
      headers: {'Content-Type': 'application/json'},
      body: JSON.stringify(payload),
    });
    const body = (await res.json()) as {state?: ShareDroidState; error?: string};
    if (!res.ok || !body.state) {
      return {ok: false, error: body.error || 'Unable to join share pool.'};
    }
    setState(body.state);
    return {ok: true};
  };

  const handleUpdateShares = async (
    id: string,
    payload: {addShares?: number; setShares?: number},
  ) => {
    const res = await fetch(`/api/participants/${encodeURIComponent(id)}/shares`, {
      method: 'POST',
      headers: {'Content-Type': 'application/json'},
      body: JSON.stringify(payload),
    });
    if (res.ok) {
      const next = (await res.json()) as ShareDroidState;
      setState(next);
    }
  };

  const handleRemoveShareholder = async (id: string) => {
    const res = await fetch(`/api/participants/${encodeURIComponent(id)}`, {
      method: 'DELETE',
    });
    if (res.ok) {
      const next = (await res.json()) as ShareDroidState;
      setState(next);
    }
  };

  if (loading || !state) {
    return (
      <div className="flex min-h-screen items-center justify-center bg-slate-50 px-4">
        <div className="w-full max-w-md space-y-3 rounded-xl border border-slate-200 bg-white p-6">
          <div className="h-5 w-40 animate-pulse rounded bg-slate-200" />
          <div className="h-4 w-full animate-pulse rounded bg-slate-100" />
          <div className="h-4 w-3/4 animate-pulse rounded bg-slate-100" />
        </div>
      </div>
    );
  }

  if (standaloneMode) {
    return (
      <div className="min-h-screen bg-slate-100">
        <div className="mx-auto flex max-w-md items-center justify-between px-4 py-2.5">
          <button
            type="button"
            onClick={() => {
              setStandaloneMode(false);
              if (window.location.search.includes('mode=app')) {
                window.history.replaceState({}, '', '/');
              }
            }}
            className="inline-flex min-h-[38px] items-center gap-1.5 text-xs font-medium text-slate-700 hover:text-slate-900"
          >
            <ArrowLeft className="h-3.5 w-3.5" />
            <span>Creator Console</span>
          </button>
          <span className="text-xs text-slate-500">Android User View</span>
        </div>

        <PhonePreview
          config={state.config}
          shareholders={state.shareholders}
          standalone
          onRecordDownload={handleRecordDownload}
          onRecordRun={handleRecordRun}
          onJoinShareholder={handleJoinShareholder}
          onUpdateShares={handleUpdateShares}
          onNavigateSetup={() => {
            setStandaloneMode(false);
            setActiveTab('setup');
          }}
        />
        <OfflineIndicator />
      </div>
    );
  }

  const navItems: Array<{
    id: TabId;
    label: string;
    shortLabel: string;
    icon: typeof Settings;
  }> = [
    {id: 'setup', label: 'Creator Setup', shortLabel: 'Setup', icon: Settings},
    {id: 'preview', label: 'Android Preview', shortLabel: 'Preview', icon: Smartphone},
    {id: 'download', label: 'Download Portal', shortLabel: 'Download', icon: Download},
    {id: 'growth', label: 'Growth & Ads', shortLabel: 'Promote', icon: Megaphone},
    {id: 'ledger', label: 'Payout Ledger', shortLabel: 'Ledger', icon: Receipt},
  ];

  return (
    <div className="min-h-screen bg-slate-50 pb-20 text-slate-900 md:pb-12">
      <header className="sticky top-0 z-30 border-b border-slate-200 bg-white/95 backdrop-blur-sm">
        <div className="mx-auto flex h-16 max-w-7xl items-center justify-between gap-8 px-4 sm:px-6 lg:px-8">
          <button
            type="button"
            onClick={() => setActiveTab('setup')}
            className="font-display shrink-0 whitespace-nowrap text-lg font-bold tracking-tight text-slate-900"
          >
            ShareDroid
          </button>

          <nav aria-label="Primary" className="hidden items-center gap-6 md:flex">
            {navItems.map((item) => {
              const active = activeTab === item.id;
              return (
                <button
                  key={item.id}
                  type="button"
                  onClick={() => setActiveTab(item.id)}
                  className={`relative shrink-0 whitespace-nowrap py-1 text-sm font-medium transition-colors ${
                    active
                      ? 'text-slate-900 after:absolute after:inset-x-0 after:-bottom-1 after:h-0.5 after:bg-slate-900'
                      : 'text-slate-600 hover:text-slate-900'
                  }`}
                >
                  {item.label}
                </button>
              );
            })}
          </nav>

          <div className="flex shrink-0 items-center">
            <PWAInstallButton />
          </div>
        </div>
      </header>

      <main className="mx-auto max-w-7xl px-4 py-6 sm:px-6 sm:py-8 lg:px-8">
        {errorMessage && (
          <div
            className="mb-6 rounded-xl border border-red-200 bg-red-50 px-4 py-3 text-sm text-red-800"
            role="alert"
          >
            {errorMessage}
          </div>
        )}

        {activeTab === 'setup' && (
          <div className="grid items-start gap-8 lg:grid-cols-[minmax(0,1fr)_380px]">
            <CreatorSetup
              config={state.config}
              shareholders={state.shareholders}
              saving={saving}
              onSaveConfig={handleSaveConfig}
              onJoinShareholder={handleJoinShareholder}
              onUpdateShares={handleUpdateShares}
              onRemoveShareholder={handleRemoveShareholder}
            />
            <aside className="hidden lg:sticky lg:top-24 lg:block">
              <div className="mb-3 flex items-center justify-between px-1">
                <span className="text-xs font-semibold text-slate-700">
                  Live Android App Preview
                </span>
                <button
                  type="button"
                  onClick={() => setStandaloneMode(true)}
                  className="text-xs font-medium text-amber-700 hover:underline"
                >
                  Open Full Mobile View
                </button>
              </div>
              <PhonePreview
                config={state.config}
                shareholders={state.shareholders}
                onRecordDownload={handleRecordDownload}
                onRecordRun={handleRecordRun}
                onJoinShareholder={handleJoinShareholder}
                onUpdateShares={handleUpdateShares}
              />
            </aside>
          </div>
        )}

        {activeTab === 'preview' && (
          <div className="grid items-start gap-8 lg:grid-cols-[minmax(0,1fr)_400px]">
            <div className="space-y-6">
              <div className="border-b border-slate-200 pb-5">
                <h1 className="text-2xl font-semibold tracking-tight text-slate-900 sm:text-3xl">
                  Interactive Android App Runtime
                </h1>
                <p className="mt-1.5 max-w-xl text-sm text-slate-600">
                  Test the exact download, unlock, and session-run flow your Android users
                  experience. Actions inside the phone frame write real share entries to your Payout
                  Ledger.
                </p>
              </div>

              <div className="grid gap-4 sm:grid-cols-2">
                <div className="rounded-xl border border-slate-200 bg-white p-5">
                  <div className="text-xs font-medium text-slate-500">Download Share Trigger</div>
                  <div className="mt-1 font-mono text-xl font-semibold tabular-nums text-slate-900">
                    $
                    {(
                      ((state.config.downloadModel === 'free_run_share'
                        ? 0
                        : state.config.downloadPriceUsd) *
                        state.config.creatorSharePercent) /
                      100
                    ).toFixed(2)}
                  </div>
                  <p className="mt-1 text-xs text-slate-600">
                    Credited when a user downloads and unlocks {state.config.appName}.
                  </p>
                </div>

                <div className="rounded-xl border border-slate-200 bg-white p-5">
                  <div className="text-xs font-medium text-slate-500">Per-Run Session Share</div>
                  <div className="mt-1 font-mono text-xl font-semibold tabular-nums text-amber-700">
                    $
                    {((state.config.runShareUsd * state.config.creatorSharePercent) / 100).toFixed(
                      2,
                    )}
                  </div>
                  <p className="mt-1 text-xs text-slate-600">
                    Credited each time a user runs the built-in utility session or tips.
                  </p>
                </div>
              </div>

              <div className="flex flex-wrap gap-3">
                <button
                  type="button"
                  onClick={() => setStandaloneMode(true)}
                  className="inline-flex min-h-[44px] items-center gap-2 rounded-lg bg-slate-900 px-4 py-2.5 text-sm font-medium text-white hover:bg-slate-800"
                >
                  <Smartphone className="h-4 w-4" />
                  <span>Launch Fullscreen Android App</span>
                </button>
                <button
                  type="button"
                  onClick={() => setActiveTab('growth')}
                  className="inline-flex min-h-[44px] items-center gap-2 rounded-lg border border-slate-300 bg-white px-4 py-2.5 text-sm font-medium text-slate-900 hover:bg-slate-50"
                >
                  <Megaphone className="h-4 w-4" />
                  <span>Promote &amp; Daily Campaigns</span>
                </button>
              </div>
            </div>

            <PhonePreview
              config={state.config}
              shareholders={state.shareholders}
              onRecordDownload={handleRecordDownload}
              onRecordRun={handleRecordRun}
              onJoinShareholder={handleJoinShareholder}
              onUpdateShares={handleUpdateShares}
              onNavigateSetup={() => setActiveTab('setup')}
            />
          </div>
        )}

        {activeTab === 'download' && (
          <DownloadPortal
            config={state.config}
            onOpenStandaloneApp={() => setStandaloneMode(true)}
          />
        )}

        {activeTab === 'growth' && (
          <GrowthHub
            config={state.config}
            campaigns={state.campaigns}
            channelMetrics={state.channelMetrics}
            platformChecklist={state.platformChecklist}
            onSaveCampaign={handleSaveCampaign}
            onLogCampaignPost={handleLogCampaignPost}
            onTogglePlatform={handleTogglePlatform}
            onGoToDownload={() => setActiveTab('download')}
          />
        )}

        {activeTab === 'ledger' && (
          <PayoutLedger
            config={state.config}
            events={state.events}
            stats={state.stats}
            onSettlePending={handleSettlePending}
            onClearLedger={handleClearLedger}
            onGoToPreview={() => setActiveTab('preview')}
          />
        )}
      </main>

      <nav
        aria-label="Mobile Navigation"
        className="fixed right-0 bottom-0 left-0 z-40 grid h-16 grid-cols-5 border-t border-slate-200 bg-white/95 backdrop-blur-md md:hidden"
      >
        {navItems.map((item) => {
          const Icon = item.icon;
          const active = activeTab === item.id;
          return (
            <button
              key={item.id}
              type="button"
              onClick={() => setActiveTab(item.id)}
              className={`flex min-h-[44px] flex-col items-center justify-center gap-0.5 text-[11px] font-medium transition-colors ${
                active ? 'text-slate-900' : 'text-slate-500'
              }`}
            >
              <Icon className={`h-5 w-5 ${active ? 'text-amber-600' : 'text-slate-400'}`} />
              <span>{item.shortLabel}</span>
            </button>
          );
        })}
      </nav>

      <OfflineIndicator />
    </div>
  );
}
