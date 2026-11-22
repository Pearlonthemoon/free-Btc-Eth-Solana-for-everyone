import {
  Check,
  Copy,
  ExternalLink,
  Globe,
  Megaphone,
  Plus,
  Rss,
  Send,
  Share2,
} from 'lucide-react';
import {useMemo, useState, type FormEvent} from 'react';
import type {
  AppConfig,
  Campaign,
  ChannelMetric,
  PlatformChecklist,
  SocialChannel,
} from '../types';
import {getSafeOrigin} from '../utils/safeBrowser';

interface PlatformStoreItem {
  id: string;
  name: string;
  category: string;
  requirements: string;
  submitUrl: string;
}

const PLATFORM_STORES: PlatformStoreItem[] = [
  {
    id: 'google-play',
    name: 'Google Play Store',
    category: 'Android Store',
    requirements: 'Export Android Studio ZIP, build signed AAB, upload with your store listing copy.',
    submitUrl: 'https://play.google.com/console',
  },
  {
    id: 'github-fdroid',
    name: 'GitHub Releases & F-Droid',
    category: 'Open Android Distribution',
    requirements:
      'Push Android Studio project and attach signed APK release tag for direct APK installs.',
    submitUrl: 'https://f-droid.org/docs/Submitting_to_F-Droid_Quick_Start_Guide/',
  },
  {
    id: 'samsung-galaxy',
    name: 'Samsung Galaxy Store',
    category: 'OEM Android Store',
    requirements: 'Submit signed Android APK targeting Samsung Galaxy & Android 7+ devices.',
    submitUrl: 'https://seller.samsungapps.com/',
  },
  {
    id: 'amazon-appstore',
    name: 'Amazon Appstore',
    category: 'Android & Fire OS',
    requirements: 'Upload APK build for Fire tablets, Android phones, and Windows Subsystem.',
    submitUrl: 'https://developer.amazon.com/apps-and-games',
  },
  {
    id: 'google-search',
    name: 'Google Search & Bing Indexing',
    category: 'Web & PWA Discovery',
    requirements: 'robots.txt, sitemap.xml, and Schema.org MobileApplication JSON-LD are already live.',
    submitUrl: 'https://search.google.com/search-console',
  },
  {
    id: 'product-hunt',
    name: 'Product Hunt Launch',
    category: 'Product Directory',
    requirements: 'Share public PWA & Android link with OpenGraph card and creator split breakdown.',
    submitUrl: 'https://www.producthunt.com/posts/new',
  },
];

function buildShareIntentUrl(channel: SocialChannel, text: string, url: string): string {
  const combined = `${text} ${url}`;
  switch (channel) {
    case 'x':
      return `https://twitter.com/intent/tweet?text=${encodeURIComponent(text)}&url=${encodeURIComponent(url)}`;
    case 'telegram':
      return `https://t.me/share/url?url=${encodeURIComponent(url)}&text=${encodeURIComponent(text)}`;
    case 'whatsapp':
      return `https://wa.me/?text=${encodeURIComponent(combined)}`;
    case 'reddit':
      return `https://www.reddit.com/submit?url=${encodeURIComponent(url)}&title=${encodeURIComponent(text)}`;
    case 'linkedin':
      return `https://www.linkedin.com/sharing/share-offsite/?url=${encodeURIComponent(url)}`;
    case 'facebook':
      return `https://www.facebook.com/sharer/sharer.php?u=${encodeURIComponent(url)}`;
  }
}

interface GrowthHubProps {
  config: AppConfig;
  campaigns: Campaign[];
  channelMetrics: ChannelMetric[];
  platformChecklist: PlatformChecklist;
  onSaveCampaign: (payload: {
    id?: string;
    title?: string;
    channel?: SocialChannel;
    headline: string;
    body: string;
  }) => Promise<void>;
  onLogCampaignPost: (id: string) => Promise<void>;
  onTogglePlatform: (id: string, checked: boolean) => Promise<void>;
  onGoToDownload: () => void;
}

export function GrowthHub({
  config,
  campaigns,
  channelMetrics,
  platformChecklist,
  onSaveCampaign,
  onLogCampaignPost,
  onTogglePlatform,
  onGoToDownload,
}: GrowthHubProps) {
  const [copiedId, setCopiedId] = useState('');
  const [editingId, setEditingId] = useState<string | null>(null);
  const [editHeadline, setEditHeadline] = useState('');
  const [editBody, setEditBody] = useState('');

  const [showNewForm, setShowNewForm] = useState(false);
  const [newChannel, setNewChannel] = useState<SocialChannel>('linkedin');
  const [newHeadline, setNewHeadline] = useState('');
  const [newBody, setNewBody] = useState('');
  const [savingCampaign, setSavingCampaign] = useState(false);

  const origin = getSafeOrigin();
  const appUrl = `${origin}/?mode=app`;
  const rssUrl = `${origin}/feed.xml`;
  const jsonFeedUrl = `${origin}/api/campaigns/feed.json`;
  const sitemapUrl = `${origin}/sitemap.xml`;

  const completedPlatforms = useMemo(
    () => PLATFORM_STORES.filter((p) => platformChecklist[p.id]).length,
    [platformChecklist],
  );

  const copyText = async (id: string, value: string) => {
    await navigator.clipboard.writeText(value);
    setCopiedId(id);
    setTimeout(() => setCopiedId(''), 1800);
  };

  const handleBroadcastCampaign = async (campaign: Campaign, utmUrl: string) => {
    const text = `${campaign.headline} — ${campaign.body}`;
    if (typeof navigator !== 'undefined' && navigator.share) {
      try {
        await navigator.share({title: campaign.headline, text, url: utmUrl});
        await onLogCampaignPost(campaign.id);
        return;
      } catch {
        // Fallback to platform share intent URL
      }
    }
    const intentUrl = buildShareIntentUrl(campaign.channel, text, utmUrl);
    const anchor = document.createElement('a');
    anchor.href = intentUrl;
    anchor.target = '_blank';
    anchor.rel = 'noopener noreferrer';
    document.body.appendChild(anchor);
    anchor.click();
    anchor.remove();
    await copyText(`copy-${campaign.id}`, `${text} ${utmUrl}`);
    await onLogCampaignPost(campaign.id);
  };

  const startEditing = (campaign: Campaign) => {
    setEditingId(campaign.id);
    setEditHeadline(campaign.headline);
    setEditBody(campaign.body);
  };

  const saveEdit = async (id: string) => {
    await onSaveCampaign({id, headline: editHeadline, body: editBody});
    setEditingId(null);
  };

  const handleCreateCampaign = async (e: FormEvent) => {
    e.preventDefault();
    if (!newHeadline.trim() || !newBody.trim()) return;
    setSavingCampaign(true);
    try {
      await onSaveCampaign({
        channel: newChannel,
        headline: newHeadline.trim(),
        body: newBody.trim(),
      });
      setNewHeadline('');
      setNewBody('');
      setShowNewForm(false);
    } finally {
      setSavingCampaign(false);
    }
  };

  return (
    <div className="space-y-8">
      <div className="border-b border-slate-200 pb-6">
        <h1 className="text-2xl font-semibold tracking-tight text-slate-900 sm:text-3xl">
          Multi-Platform Publishing &amp; Daily Growth Hub
        </h1>
        <p className="mt-1.5 max-w-3xl text-sm text-slate-600">
          Your web app, Android PWA, SEO Schema.org tags, sitemap, and daily RSS campaign feed are
          live. Connect your developer store accounts and social schedulers below to publish across
          app stores and broadcast daily UTM-tracked download links.
        </p>
      </div>

      <section
        aria-labelledby="discovery-heading"
        className="grid gap-6 lg:grid-cols-[minmax(0,1fr)_380px]"
      >
        <div className="rounded-xl border border-slate-200 bg-white p-6 space-y-4">
          <div className="flex items-center gap-2.5">
            <Rss className="h-4 w-4 text-amber-600" />
            <h2 id="discovery-heading" className="text-base font-semibold text-slate-900">
              Live Discovery &amp; Automated Feed Endpoints
            </h2>
          </div>
          <p className="text-xs leading-relaxed text-slate-600">
            Plug the RSS or JSON feed URL into Zapier, Make, Buffer, or IFTTT to automatically post
            daily Android download links across X, Telegram, LinkedIn, and Reddit without manual
            copy-pasting.
          </p>

          <div className="space-y-2.5">
            {[
              {id: 'ep-app', label: 'Direct Android Install URL', value: appUrl},
              {id: 'ep-rss', label: 'Daily Campaign RSS 2.0 Feed', value: rssUrl},
              {id: 'ep-json', label: 'JSON Feed 1.1 (Zapier / Make)', value: jsonFeedUrl},
              {id: 'ep-sitemap', label: 'Search Engine Sitemap', value: sitemapUrl},
            ].map((item) => (
              <div
                key={item.id}
                className="flex flex-wrap items-center justify-between gap-2 rounded-lg border border-slate-200 bg-slate-50 px-3 py-2"
              >
                <div className="min-w-0 flex-1">
                  <span className="block text-[11px] font-medium text-slate-500">
                    {item.label}
                  </span>
                  <span className="block truncate font-mono text-xs text-slate-800">
                    {item.value}
                  </span>
                </div>
                <button
                  type="button"
                  onClick={() => void copyText(item.id, item.value)}
                  className="inline-flex min-h-[34px] shrink-0 items-center gap-1.5 rounded-md border border-slate-200 bg-white px-2.5 text-xs font-medium text-slate-800 hover:bg-slate-100"
                >
                  {copiedId === item.id ? (
                    <Check className="h-3.5 w-3.5 text-emerald-600" />
                  ) : (
                    <Copy className="h-3.5 w-3.5" />
                  )}
                  <span>{copiedId === item.id ? 'Copied' : 'Copy'}</span>
                </button>
              </div>
            ))}
          </div>
        </div>

        <div className="rounded-xl border border-slate-200 bg-white p-5 space-y-3">
          <div className="flex items-center justify-between text-xs font-medium text-slate-600">
            <span>OpenGraph Social Share Preview</span>
            <Globe className="h-4 w-4 text-slate-400" />
          </div>
          <div className="overflow-hidden rounded-xl border border-slate-200 bg-slate-50">
            <img
              src="/src/assets/images/og_share_card_1795370197871.jpg"
              alt={`${config.appName} social preview card`}
              referrerPolicy="no-referrer"
              className="aspect-video w-full object-cover"
            />
            <div className="p-3.5">
              <p className="text-[11px] uppercase tracking-wide text-slate-500">
                {origin.replace(/^https?:\/\//, '')}
              </p>
              <p className="mt-0.5 text-sm font-semibold text-slate-900">
                {config.appName} — Android App Distribution &amp; Crypto Payouts
              </p>
              <p className="mt-1 line-clamp-2 text-xs text-slate-600">{config.tagline}</p>
            </div>
          </div>
        </div>
      </section>

      <section aria-labelledby="stores-heading" className="space-y-4">
        <div className="flex flex-wrap items-center justify-between gap-3">
          <div>
            <h2 id="stores-heading" className="text-lg font-semibold text-slate-900">
              01. Android App Stores &amp; Web Directories
            </h2>
            <p className="text-xs text-slate-500">
              {completedPlatforms} of {PLATFORM_STORES.length} distribution channels marked live
            </p>
          </div>
          <button
            type="button"
            onClick={onGoToDownload}
            className="inline-flex min-h-[38px] items-center gap-1.5 rounded-lg border border-slate-300 bg-white px-3 py-1.5 text-xs font-medium text-slate-800 hover:bg-slate-50"
          >
            <span>Export Android Studio ZIP</span>
          </button>
        </div>

        <div className="grid gap-4 sm:grid-cols-2 lg:grid-cols-3">
          {PLATFORM_STORES.map((store) => {
            const checked = Boolean(platformChecklist[store.id]);
            return (
              <div
                key={store.id}
                className="flex flex-col justify-between rounded-xl border border-slate-200 bg-white p-4"
              >
                <div>
                  <div className="flex items-start justify-between gap-2">
                    <div>
                      <h3 className="text-sm font-semibold text-slate-900">{store.name}</h3>
                      <p className="text-[11px] text-slate-500">{store.category}</p>
                    </div>
                    <input
                      type="checkbox"
                      aria-label={`Mark ${store.name} as published`}
                      checked={checked}
                      onChange={(e) => void onTogglePlatform(store.id, e.target.checked)}
                      className="mt-0.5 h-4 w-4 rounded border-slate-300 text-slate-900 focus:ring-slate-900"
                    />
                  </div>
                  <p className="mt-2.5 text-xs leading-relaxed text-slate-600">
                    {store.requirements}
                  </p>
                </div>

                <div className="mt-4 flex items-center justify-between border-t border-slate-100 pt-3">
                  <span
                    className={`text-xs font-medium ${
                      checked ? 'text-emerald-700' : 'text-slate-500'
                    }`}
                  >
                    {checked ? 'Published' : 'Ready to submit'}
                  </span>
                  <a
                    href={store.submitUrl}
                    target="_blank"
                    rel="noopener noreferrer"
                    className="inline-flex items-center gap-1 text-xs font-medium text-slate-900 hover:underline"
                  >
                    <span>Console</span>
                    <ExternalLink className="h-3 w-3" />
                  </a>
                </div>
              </div>
            );
          })}
        </div>
      </section>

      <section aria-labelledby="campaigns-heading" className="space-y-4">
        <div className="flex flex-wrap items-center justify-between gap-3">
          <div>
            <h2 id="campaigns-heading" className="text-lg font-semibold text-slate-900">
              02. Daily Social &amp; Community Campaigns
            </h2>
            <p className="text-xs text-slate-500">
              One-click daily broadcasts append UTM attribution tags so you can track which channel
              drives the most downloads.
            </p>
          </div>

          <button
            type="button"
            onClick={() => setShowNewForm((prev) => !prev)}
            className="inline-flex min-h-[38px] items-center gap-1.5 rounded-lg bg-slate-900 px-3 py-1.5 text-xs font-medium text-white hover:bg-slate-800"
          >
            <Plus className="h-3.5 w-3.5" />
            <span>New Campaign</span>
          </button>
        </div>

        {showNewForm && (
          <form
            onSubmit={(e) => void handleCreateCampaign(e)}
            className="space-y-3 rounded-xl border border-slate-200 bg-white p-5"
          >
            <div className="grid gap-3 sm:grid-cols-[180px_minmax(0,1fr)]">
              <div>
                <label
                  htmlFor="new-cmp-channel"
                  className="block text-xs font-medium text-slate-700"
                >
                  Channel
                </label>
                <select
                  id="new-cmp-channel"
                  value={newChannel}
                  onChange={(e) => setNewChannel(e.target.value as SocialChannel)}
                  className="mt-1 w-full rounded-lg border border-slate-300 bg-white px-3 py-2 text-xs text-slate-900"
                >
                  <option value="x">X / Twitter</option>
                  <option value="telegram">Telegram</option>
                  <option value="whatsapp">WhatsApp</option>
                  <option value="reddit">Reddit</option>
                  <option value="linkedin">LinkedIn</option>
                  <option value="facebook">Facebook</option>
                </select>
              </div>
              <div>
                <label
                  htmlFor="new-cmp-headline"
                  className="block text-xs font-medium text-slate-700"
                >
                  Campaign Headline
                </label>
                <input
                  id="new-cmp-headline"
                  type="text"
                  required
                  value={newHeadline}
                  onChange={(e) => setNewHeadline(e.target.value)}
                  placeholder={`Try ${config.appName} on Android`}
                  className="mt-1 w-full rounded-lg border border-slate-300 px-3 py-2 text-xs text-slate-900"
                />
              </div>
            </div>
            <div>
              <label htmlFor="new-cmp-body" className="block text-xs font-medium text-slate-700">
                Post Copy
              </label>
              <textarea
                id="new-cmp-body"
                rows={2}
                required
                value={newBody}
                onChange={(e) => setNewBody(e.target.value)}
                placeholder="Write concise download copy for this social channel..."
                className="mt-1 w-full rounded-lg border border-slate-300 px-3 py-2 text-xs text-slate-900"
              />
            </div>
            <div className="flex justify-end gap-2">
              <button
                type="button"
                onClick={() => setShowNewForm(false)}
                className="min-h-[36px] rounded-lg border border-slate-200 px-3 text-xs font-medium text-slate-700 hover:bg-slate-50"
              >
                Cancel
              </button>
              <button
                type="submit"
                disabled={savingCampaign}
                className="min-h-[36px] rounded-lg bg-slate-900 px-4 text-xs font-medium text-white hover:bg-slate-800 disabled:opacity-60"
              >
                {savingCampaign ? 'Saving...' : 'Save Campaign'}
              </button>
            </div>
          </form>
        )}

        <div className="grid gap-4 lg:grid-cols-2">
          {campaigns.map((campaign) => {
            const utmUrl = `${appUrl}&utm_source=${encodeURIComponent(campaign.channel)}`;
            const isEditing = editingId === campaign.id;

            return (
              <div
                key={campaign.id}
                className="flex flex-col justify-between rounded-xl border border-slate-200 bg-white p-5"
              >
                <div>
                  <div className="flex items-start justify-between gap-3">
                    <div>
                      <div className="flex items-center gap-2 text-xs text-slate-500">
                        <Megaphone className="h-3.5 w-3.5 text-amber-600" />
                        <span className="uppercase">{campaign.channel}</span>
                        <span aria-hidden="true">·</span>
                        <span className="font-mono tabular-nums">{campaign.postsCount} posts</span>
                      </div>
                      <h3 className="mt-1 text-sm font-semibold text-slate-900">
                        {campaign.title}
                      </h3>
                    </div>
                    <button
                      type="button"
                      onClick={() =>
                        isEditing ? setEditingId(null) : startEditing(campaign)
                      }
                      className="text-xs font-medium text-slate-600 hover:text-slate-900"
                    >
                      {isEditing ? 'Cancel' : 'Edit Copy'}
                    </button>
                  </div>

                  {isEditing ? (
                    <div className="mt-3 space-y-2.5">
                      <input
                        type="text"
                        value={editHeadline}
                        onChange={(e) => setEditHeadline(e.target.value)}
                        className="w-full rounded-lg border border-slate-300 px-3 py-1.5 text-xs text-slate-900"
                      />
                      <textarea
                        rows={3}
                        value={editBody}
                        onChange={(e) => setEditBody(e.target.value)}
                        className="w-full rounded-lg border border-slate-300 px-3 py-1.5 text-xs text-slate-900"
                      />
                      <button
                        type="button"
                        onClick={() => void saveEdit(campaign.id)}
                        className="min-h-[34px] rounded-lg bg-slate-900 px-3 text-xs font-medium text-white hover:bg-slate-800"
                      >
                        Save Changes
                      </button>
                    </div>
                  ) : (
                    <div className="mt-3 space-y-1.5 rounded-lg border border-slate-100 bg-slate-50 p-3">
                      <p className="text-xs font-semibold text-slate-900">{campaign.headline}</p>
                      <p className="text-xs leading-relaxed text-slate-600">{campaign.body}</p>
                      <p className="truncate pt-1 font-mono text-[11px] text-slate-500">
                        {utmUrl}
                      </p>
                    </div>
                  )}
                </div>

                <div className="mt-4 flex flex-wrap items-center justify-between gap-2 border-t border-slate-100 pt-3">
                  <span className="text-[11px] text-slate-500">
                    {campaign.lastPostedAt
                      ? `Last shared ${new Date(campaign.lastPostedAt).toLocaleDateString()}`
                      : 'Not shared yet today'}
                  </span>

                  <div className="flex items-center gap-2">
                    <button
                      type="button"
                      onClick={() =>
                        void copyText(
                          `copy-${campaign.id}`,
                          `${campaign.headline} — ${campaign.body} ${utmUrl}`,
                        )
                      }
                      className="inline-flex min-h-[36px] items-center gap-1.5 rounded-lg border border-slate-200 bg-white px-2.5 text-xs font-medium text-slate-700 hover:bg-slate-50"
                    >
                      {copiedId === `copy-${campaign.id}` ? (
                        <Check className="h-3.5 w-3.5 text-emerald-600" />
                      ) : (
                        <Share2 className="h-3.5 w-3.5" />
                      )}
                      <span>{copiedId === `copy-${campaign.id}` ? 'Copied' : 'Copy Post'}</span>
                    </button>

                    <button
                      type="button"
                      onClick={() => void handleBroadcastCampaign(campaign, utmUrl)}
                      className="inline-flex min-h-[36px] items-center gap-1.5 rounded-lg bg-slate-900 px-3 text-xs font-medium text-white hover:bg-slate-800"
                    >
                      <Send className="h-3.5 w-3.5" />
                      <span>Broadcast</span>
                    </button>
                  </div>
                </div>
              </div>
            );
          })}
        </div>
      </section>

      <section aria-labelledby="attribution-heading" className="space-y-3">
        <div>
          <h2 id="attribution-heading" className="text-lg font-semibold text-slate-900">
            03. Channel Attribution &amp; Download Conversion
          </h2>
          <p className="text-xs text-slate-500">
            Tracks visits, downloads, active runs, and accrued creator share per UTM source.
          </p>
        </div>

        <div className="overflow-x-auto rounded-xl border border-slate-200 bg-white">
          <table className="w-full border-collapse text-left text-xs">
            <thead>
              <tr className="border-b border-slate-200 bg-slate-50 text-slate-600">
                <th className="px-4 py-3 font-medium">Channel (utm_source)</th>
                <th className="px-4 py-3 text-right font-medium">Visits</th>
                <th className="px-4 py-3 text-right font-medium">Downloads</th>
                <th className="px-4 py-3 text-right font-medium">Active Runs</th>
                <th className="px-4 py-3 text-right font-medium">Creator Share</th>
              </tr>
            </thead>
            <tbody className="divide-y divide-slate-100">
              {channelMetrics.map((metric) => (
                <tr key={metric.channel} className="hover:bg-slate-50/70">
                  <td className="px-4 py-3 font-mono font-medium text-slate-900">
                    {metric.channel}
                  </td>
                  <td className="px-4 py-3 text-right font-mono tabular-nums text-slate-700">
                    {metric.visits}
                  </td>
                  <td className="px-4 py-3 text-right font-mono tabular-nums text-slate-700">
                    {metric.downloads}
                  </td>
                  <td className="px-4 py-3 text-right font-mono tabular-nums text-slate-700">
                    {metric.runs}
                  </td>
                  <td className="px-4 py-3 text-right font-mono font-semibold tabular-nums text-slate-900">
                    ${metric.creatorShareUsd.toFixed(2)}
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      </section>
    </div>
  );
}
