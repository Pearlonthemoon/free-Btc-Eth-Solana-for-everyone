import type {ChainId, WalletConfig} from '../types';

export interface ChainSpec {
  name: string;
  defaultNetwork: string;
  placeholder: string;
  sampleAddress: string;
  refUsdPrice: number;
  uriScheme: string;
}

export const CHAIN_SPECS: Record<ChainId, ChainSpec> = {
  BTC: {
    name: 'Bitcoin (BTC)',
    defaultNetwork: 'Bitcoin Mainnet (SegWit)',
    placeholder: 'bc1q... or 1... or 3...',
    sampleAddress: 'bc1qxy2kgdygjrsqtzq2n0yrf2493p83kkfjhx0wlh',
    refUsdPrice: 92400,
    uriScheme: 'bitcoin',
  },
  LN: {
    name: 'Lightning (LN)',
    defaultNetwork: 'Bitcoin Lightning Network',
    placeholder: 'name@getalby.com or lnurl1...',
    sampleAddress: 'creator@getalby.com',
    refUsdPrice: 92400,
    uriScheme: 'lightning',
  },
  ETH: {
    name: 'Ethereum (ETH)',
    defaultNetwork: 'Ethereum / Base / Arbitrum',
    placeholder: '0x...',
    sampleAddress: '0x71C7656EC7ab88b098defB751B7401B5f6d8976F',
    refUsdPrice: 3180,
    uriScheme: 'ethereum',
  },
  SOL: {
    name: 'Solana (SOL)',
    defaultNetwork: 'Solana Mainnet',
    placeholder: 'Base58 public key...',
    sampleAddress: '7EcDhSYGxXyscszYEp35KHN8vvw3svAuLKTzXwCFLtV',
    refUsdPrice: 215,
    uriScheme: 'solana',
  },
  USDT: {
    name: 'Tether (USDT)',
    defaultNetwork: 'USDT (ERC-20 / TRC-20)',
    placeholder: '0x... or T...',
    sampleAddress: '0x8ba1f109551bD432803012645Ac136ddd64DBA72',
    refUsdPrice: 1,
    uriScheme: 'ethereum',
  },
  LTC: {
    name: 'Litecoin (LTC)',
    defaultNetwork: 'Litecoin Mainnet',
    placeholder: 'ltc1q... or L...',
    sampleAddress: 'ltc1q6p7a3r9m5l8v2j4n0x8z3k6f5d2c9y7t4e8w2',
    refUsdPrice: 98,
    uriScheme: 'litecoin',
  },
};

export const SUPPORTED_CHAINS: ChainId[] = ['BTC', 'LN', 'ETH', 'SOL', 'USDT', 'LTC'];

export function validateWalletAddress(
  chain: ChainId,
  address: string,
): {valid: boolean; reason?: string} {
  const trimmed = address.trim();
  if (!trimmed) {
    return {valid: false, reason: 'Address required'};
  }

  switch (chain) {
    case 'BTC': {
      const bech32 = /^(bc1|tb1)[a-zA-HJ-NP-Z0-9]{25,62}$/.test(trimmed);
      const legacy = /^[13mn2][a-km-zA-HJ-NP-Z1-9]{25,34}$/.test(trimmed);
      return bech32 || legacy
        ? {valid: true}
        : {valid: false, reason: 'Enter a valid bc1..., 1..., or 3... Bitcoin address'};
    }
    case 'LN': {
      const lnAddress = /^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(trimmed);
      const lnurl = /^(lnurl|lnbc)[a-zA-Z0-9]{12,}$/i.test(trimmed);
      return lnAddress || lnurl
        ? {valid: true}
        : {valid: false, reason: 'Enter a Lightning address (you@domain.com) or LNURL'};
    }
    case 'ETH': {
      return /^0x[a-fA-F0-9]{40}$/.test(trimmed)
        ? {valid: true}
        : {valid: false, reason: 'Enter a valid 42-character 0x Ethereum address'};
    }
    case 'USDT': {
      const erc20 = /^0x[a-fA-F0-9]{40}$/.test(trimmed);
      const trc20 = /^T[1-9A-HJ-NP-Za-km-z]{33}$/.test(trimmed);
      return erc20 || trc20
        ? {valid: true}
        : {valid: false, reason: 'Enter a valid ERC-20 (0x...) or TRC-20 (T...) USDT address'};
    }
    case 'SOL': {
      return /^[1-9A-HJ-NP-Za-km-z]{32,44}$/.test(trimmed)
        ? {valid: true}
        : {valid: false, reason: 'Enter a valid Base58 Solana address (32-44 chars)'};
    }
    case 'LTC': {
      const bech32 = /^ltc1[a-zA-HJ-NP-Z0-9]{25,62}$/.test(trimmed);
      const legacy = /^[LM3][a-km-zA-HJ-NP-Z1-9]{25,34}$/.test(trimmed);
      return bech32 || legacy
        ? {valid: true}
        : {valid: false, reason: 'Enter a valid ltc1... or L/M Litecoin address'};
    }
  }
}

export function usdToCryptoAmount(usd: number, chain: ChainId): string {
  const amount = usd / CHAIN_SPECS[chain].refUsdPrice;
  if (chain === 'BTC' || chain === 'LN') return amount.toFixed(8);
  if (chain === 'ETH') return amount.toFixed(6);
  if (chain === 'SOL' || chain === 'LTC') return amount.toFixed(4);
  return amount.toFixed(2);
}

export function buildCryptoPaymentUri(wallet: WalletConfig, usdAmount: number, label: string): string {
  const address = wallet.address.trim();
  const amount = usdToCryptoAmount(usdAmount, wallet.chain);
  const encodedLabel = encodeURIComponent(label);

  switch (wallet.chain) {
    case 'BTC':
      return `bitcoin:${address}?amount=${amount}&label=${encodedLabel}`;
    case 'LN':
      return `lightning:${address}`;
    case 'ETH':
      return `ethereum:${address}?value=${amount}`;
    case 'SOL':
      return `solana:${address}?amount=${amount}&label=${encodedLabel}`;
    case 'LTC':
      return `litecoin:${address}?amount=${amount}&label=${encodedLabel}`;
    case 'USDT':
      return address.startsWith('0x') ? `ethereum:${address}` : address;
  }
}

export function truncateAddress(address: string): string {
  const trimmed = address.trim();
  if (trimmed.length <= 16) return trimmed;
  return `${trimmed.slice(0, 8)}...${trimmed.slice(-6)}`;
}
