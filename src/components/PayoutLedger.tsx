import {
  CheckCircle2,
  Clock,
  Download,
  Play,
  RotateCcw,
  Search,
  Wallet,
} from 'lucide-react';
import {useMemo, useState} from 'react';
import type {AppConfig, ChainId, PayoutStats, ShareEvent, ShareEventType} from '../types';
import {truncateAddress} from '../utils/crypto';

interface PayoutLedgerProps {
  config: AppConfig;
  events: ShareEvent[];
  stats: PayoutStats;
  onSettlePending: () => Promise<void>;
  onClearLedger: () => Promise<void>;
  onGoToPreview: () => void;
}

export function PayoutLedger({
  config,
  events,
  stats,
  onSettlePending,
  onClearLedger,
  onGoToPreview,
}: PayoutLedgerProps) {
  const [filterType, setFilterType] = useState<'all' | ShareEventType>('all');
  const [searchQuery, setSearchQuery] = useState('');
  const [busyAction, setBusyAction] = useState(false);

  const activeChains = useMemo(() => {
    const configured = config.wallets.filter((w) => w.enabled).map((w) => w.chain);
    const fromEvents = events.map((e) => e.chain);
    return Array.from(new Set<ChainId>([...configured, ...fromEvents]));
  }, [config.wallets, events]);

  const filteredEvents = useMemo(() => {
    const q = searchQuery.trim().toLowerCase();
    return events.filter((ev) => {
      if (filterType !== 'all' && ev.type !== filterType) return false;
      if (!q) return true;
      return (
        ev.chain.toLowerCase().includes(q) ||
        ev.recipientAddress.toLowerCase().includes(q) ||
        ev.txRef.toLowerCase().includes(q) ||
        ev.utmSource.toLowerCase().includes(q)
      );
    });
  }, [events, filterType, searchQuery]);

  const handleSettle = async () => {
    setBusyAction(true);
    try {
      await onSettlePending();
    } finally {
      setBusyAction(false);
    }
  };

  const handleReset = async () => {
    setBusyAction(true);
    try {
      await onClearLedger();
    } finally {
      setBusyAction(false);
    }
  };

  return (
    <div className="space-y-8">
      <div className="border-b border-slate-200 pb-6">
        <div className="flex flex-wrap items-end justify-between gap-4">
          <div>
            <h1 className="text-2xl font-semibold tracking-tight text-slate-900 sm:text-3xl">
              Creator Payout Ledger
            </h1>
            <p className="mt-1.5 max-w-2xl text-sm text-slate-600">
              Every download unlock, active utility run, and tip splits automatically to your
              configured BTC and multi-chain wallet addresses.
            </p>
          </div>

          <div className="flex flex-wrap items-center gap-2">
            <button
              type="button"
              disabled={busyAction || stats.pendingShareUsd + stats.pendingParticipantUsd <= 0}
              onClick={() => void handleSettle()}
              className="inline-flex min-h-[40px] items-center gap-2 rounded-lg bg-slate-900 px-4 py-2 text-xs font-medium text-white hover:bg-slate-800 disabled:opacity-50"
            >
              <Wallet className="h-3.5 w-3.5" />
              <span>
                Settle Pending (${(stats.pendingShareUsd + stats.pendingParticipantUsd).toFixed(2)})
              </span>
            </button>
            <button
              type="button"
              disabled={busyAction || events.length === 0}
              onClick={() => void handleReset()}
              className="inline-flex min-h-[40px] items-center gap-2 rounded-lg border border-slate-300 bg-white px-3.5 py-2 text-xs font-medium text-slate-700 hover:bg-slate-50 disabled:opacity-50"
            >
              <RotateCcw className="h-3.5 w-3.5" />
              <span>Reset Ledger</span>
            </button>
          </div>
        </div>
      </div>

      <div className="grid gap-4 sm:grid-cols-2 lg:grid-cols-4">
        <div className="rounded-xl border border-slate-200 bg-white p-4">
          <div className="text-xs font-medium text-slate-500">Creator Share (50% Always)</div>
          <div className="mt-1 font-mono text-2xl font-semibold tabular-nums text-slate-900">
            ${stats.totalCreatorShareUsd.toFixed(2)}
          </div>
          <div className="mt-1 text-xs text-slate-500">
            50% fixed of ${stats.totalGrossUsd.toFixed(2)} gross
          </div>
        </div>

        <div className="rounded-xl border border-slate-200 bg-white p-4">
          <div className="text-xs font-medium text-slate-500">Member Share Pool (50%)</div>
          <div className="mt-1 font-mono text-2xl font-semibold tabular-nums text-amber-700">
            ${stats.totalParticipantShareUsd.toFixed(2)}
          </div>
          <div className="mt-1 font-mono text-xs tabular-nums text-slate-500">
            {stats.totalParticipantShares.toLocaleString()} active shares
          </div>
        </div>

        <div className="rounded-xl border border-slate-200 bg-white p-4">
          <div className="text-xs font-medium text-slate-500">Downloads &amp; Active Runs</div>
          <div className="mt-1 font-mono text-2xl font-semibold tabular-nums text-slate-900">
            {stats.totalDownloads} / {stats.totalRuns}
          </div>
          <div className="mt-1 text-xs text-slate-500">
            {config.downloadModel === 'free_run_share'
              ? `Free install · $${config.runShareUsd.toFixed(2)} run`
              : `$${config.downloadPriceUsd.toFixed(2)} unlock · $${config.runShareUsd.toFixed(2)} run`}
          </div>
        </div>

        <div className="rounded-xl border border-slate-200 bg-white p-4">
          <div className="text-xs font-medium text-slate-500">Pending Settlement</div>
          <div className="mt-1 font-mono text-2xl font-semibold tabular-nums text-amber-700">
            ${(stats.pendingShareUsd + stats.pendingParticipantUsd).toFixed(2)}
          </div>
          <div className="mt-1 text-xs text-emerald-700">
            ${(stats.settledShareUsd + stats.settledParticipantUsd).toFixed(2)} settled
          </div>
        </div>
      </div>

      {activeChains.length > 0 && (
        <section aria-labelledby="chain-breakdown-heading" className="space-y-3">
          <h2 id="chain-breakdown-heading" className="text-sm font-semibold text-slate-900">
            Accrued Share by Configured Network
          </h2>
          <div className="grid gap-3 sm:grid-cols-3">
            {activeChains.map((chain) => {
              const bucket = stats.byChain[chain] ?? {shareUsd: 0, cryptoTotal: 0, count: 0};
              const wallet = config.wallets.find((w) => w.chain === chain && w.address.trim());
              return (
                <div key={chain} className="rounded-xl border border-slate-200 bg-white p-4">
                  <div className="flex items-center justify-between text-xs">
                    <span className="font-semibold text-slate-900">{chain}</span>
                    <span className="font-mono tabular-nums text-slate-500">
                      {bucket.count} events
                    </span>
                  </div>
                  <div className="mt-2 font-mono text-lg font-semibold tabular-nums text-slate-900">
                    {bucket.cryptoTotal.toFixed(
                      chain === 'USDT' ? 2 : chain === 'BTC' || chain === 'LN' ? 8 : 5,
                    )}{' '}
                    {chain}
                  </div>
                  <div className="mt-1 flex items-center justify-between text-xs text-slate-500">
                    <span className="font-mono tabular-nums">
                      ${bucket.shareUsd.toFixed(2)} USD eq.
                    </span>
                    {wallet && <span className="font-mono">{truncateAddress(wallet.address)}</span>}
                  </div>
                </div>
              );
            })}
          </div>
        </section>
      )}

      <section aria-labelledby="ledger-table-heading" className="space-y-4">
        <div className="flex flex-wrap items-center justify-between gap-3">
          <div className="flex items-center gap-1 rounded-lg bg-slate-100 p-1">
            {(['all', 'download', 'run', 'tip', 'payout'] as const).map((tab) => (
              <button
                key={tab}
                type="button"
                onClick={() => setFilterType(tab)}
                className={`min-h-[34px] rounded-md px-3 text-xs font-medium capitalize transition-colors ${
                  filterType === tab
                    ? 'bg-white text-slate-900 shadow-xs'
                    : 'text-slate-600 hover:text-slate-900'
                }`}
              >
                {tab === 'all' ? 'All Events' : `${tab}s`}
              </button>
            ))}
          </div>

          <div className="relative w-full sm:w-64">
            <Search className="pointer-events-none absolute top-1/2 left-3 h-4 w-4 -translate-y-1/2 text-slate-400" />
            <input
              type="search"
              value={searchQuery}
              onChange={(e) => setSearchQuery(e.target.value)}
              placeholder="Search address, chain, or TX..."
              className="w-full rounded-lg border border-slate-200 bg-white py-2 pr-3 pl-9 text-xs text-slate-900 focus:border-slate-900 focus:outline-none"
            />
          </div>
        </div>

        {filteredEvents.length === 0 ? (
          <div className="rounded-xl border border-slate-200 bg-white px-6 py-12 text-center">
            <Play className="mx-auto h-8 w-8 text-slate-400" />
            <h3 className="mt-3 text-base font-semibold text-slate-900">
              No download or run events yet
            </h3>
            <p className="mx-auto mt-1 max-w-md text-xs leading-relaxed text-slate-600">
              Once users download your Android app or run an active session, every creator share
              event and wallet payout appears here.
            </p>
            <button
              type="button"
              onClick={onGoToPreview}
              className="mt-5 inline-flex min-h-[42px] items-center gap-2 rounded-lg bg-slate-900 px-4 py-2 text-xs font-medium text-white hover:bg-slate-800"
            >
              <Download className="h-3.5 w-3.5" />
              <span>Test Download &amp; Run in Android Preview</span>
            </button>
          </div>
        ) : (
          <div className="overflow-x-auto rounded-xl border border-slate-200 bg-white">
            <table className="w-full border-collapse text-left text-xs">
              <thead>
                <tr className="border-b border-slate-200 bg-slate-50 text-slate-600">
                  <th className="px-4 py-3 font-medium">Event</th>
                  <th className="px-4 py-3 font-medium">Allocation &amp; Recipient</th>
                  <th className="px-4 py-3 text-right font-medium">Payout Share</th>
                  <th className="px-4 py-3 text-right font-medium">Crypto Amount</th>
                  <th className="px-4 py-3 font-medium">Reference</th>
                  <th className="px-4 py-3 font-medium">Status</th>
                </tr>
              </thead>
              <tbody className="divide-y divide-slate-100">
                {filteredEvents.map((ev) => (
                  <tr key={ev.id} className="hover:bg-slate-50/70">
                    <td className="whitespace-nowrap px-4 py-3">
                      <span className="font-medium capitalize text-slate-900">{ev.type}</span>
                      <div className="text-[11px] text-slate-500">
                        {new Date(ev.createdAt).toLocaleTimeString([], {
                          hour: '2-digit',
                          minute: '2-digit',
                        })}{' '}
                        · {ev.deviceInfo}
                      </div>
                    </td>
                    <td className="whitespace-nowrap px-4 py-3">
                      <div className="flex items-center gap-1.5">
                        <span className="font-semibold text-slate-900">{ev.chain}</span>
                        <span className="text-slate-400">·</span>
                        <span className="text-[11px] font-medium text-slate-600">
                          {ev.poolRole === 'participant'
                            ? `${ev.participantName || 'Member'} (${(ev.sharesAtEvent || 0).toLocaleString()} sh)`
                            : 'Creator 50%'}
                        </span>
                      </div>
                      <div
                        className="font-mono text-[11px] text-slate-500"
                        title={ev.recipientAddress}
                      >
                        {truncateAddress(ev.recipientAddress)}
                      </div>
                    </td>
                    <td className="whitespace-nowrap px-4 py-3 text-right font-mono font-semibold tabular-nums text-slate-900">
                      ${ev.creatorShareUsd.toFixed(2)}
                    </td>
                    <td className="whitespace-nowrap px-4 py-3 text-right font-mono tabular-nums text-slate-700">
                      {ev.cryptoAmount} {ev.chain}
                    </td>
                    <td className="whitespace-nowrap px-4 py-3 font-mono text-[11px] text-slate-600">
                      {ev.txRef}
                    </td>
                    <td className="whitespace-nowrap px-4 py-3">
                      <span className="inline-flex items-center gap-1.5 text-xs font-medium">
                        {ev.status === 'confirmed' ? (
                          <>
                            <CheckCircle2 className="h-3.5 w-3.5 text-emerald-600" />
                            <span className="text-emerald-700">Confirmed</span>
                          </>
                        ) : (
                          <>
                            <Clock className="h-3.5 w-3.5 text-amber-600" />
                            <span className="text-amber-700">Pending</span>
                          </>
                        )}
                      </span>
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        )}
      </section>
    </div>
  );
}
