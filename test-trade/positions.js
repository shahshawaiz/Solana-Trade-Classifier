// Read-only Jupiter Perps position viewer.
// Fetches open leveraged positions + PnL for the wallet. Moves no funds.
const axios = require('axios');
const bs58 = require('bs58').default || require('bs58');
require('dotenv').config();

const PERPS_API = process.env.PERPS_API_URL || 'https://perps-api.jup.ag/v1';

// Jupiter Perps tradeable markets (collateral/market mints seen in the API).
const MINT_SYMBOLS = {
    'So11111111111111111111111111111111111111112': 'SOL',
    '7vfCXTUXx5WJV5JADk17DUJ4ksgau7utNKj4b963voxs': 'ETH',
    '3NZ9JMVBmGAqocybic2c7LQCJScmgsAZ6vQqTDzcqmJh': 'wBTC',
    'EPjFWdd5AufqSSqeM2qN1xzybapC8G4wEGGkZwyTDt1v': 'USDC',
    'Es9vMFrzaCERmJfrF4H2FYD4KCoNkY11McCe8BenwNYB': 'USDT',
};
const symbolOf = (mint) => MINT_SYMBOLS[mint] || `${mint.slice(0, 4)}…${mint.slice(-4)}`;

// Resolve the wallet address: prefer WALLET_ADDRESS, else derive from PRIVATE_KEY
// (a 64-byte Solana secret key = 32-byte seed + 32-byte public key).
function resolveWallet() {
    if (process.env.WALLET_ADDRESS) return process.env.WALLET_ADDRESS;
    if (!process.env.PRIVATE_KEY) throw new Error('Set WALLET_ADDRESS or PRIVATE_KEY in .env');
    const secretKey = bs58.decode(process.env.PRIVATE_KEY);
    if (secretKey.length !== 64) throw new Error('Invalid PRIVATE_KEY length. Must be 64 bytes.');
    return bs58.encode(secretKey.slice(32, 64));
}

const fmtUsd = (n) => `$${Number(n).toLocaleString('en-US', { minimumFractionDigits: 2, maximumFractionDigits: 2 })}`;
const fmtPct = (n) => `${Number(n) >= 0 ? '+' : ''}${Number(n).toFixed(2)}%`;
const fmtTime = (sec) => new Date(Number(sec) * 1000).toISOString().replace('T', ' ').slice(0, 16) + ' UTC';

async function showPositions() {
    try {
        const wallet = resolveWallet();
        console.log(`👛 Wallet: ${wallet}`);
        console.log('📡 Fetching open perps positions from Jupiter...\n');

        const res = await axios.get(`${PERPS_API}/positions`, {
            params: { walletAddress: wallet },
            timeout: 15000,
        });

        const positions = res.data.dataList || [];
        if (positions.length === 0) {
            console.log('📭 No open perps positions.');
            return;
        }

        // The API returns human-readable USD strings (entryPrice, markPrice, size,
        // collateral, value, *Usd) — we just coerce and format them.
        let totalPnl = 0;
        for (const p of positions) {
            const pnl = Number(p.pnlAfterFeesUsd);
            totalPnl += pnl;
            const arrow = pnl >= 0 ? '🟢' : '🔴';
            const asset = symbolOf(p.marketMint);
            console.log(`${arrow} ${asset} ${String(p.side).toUpperCase()}  ${Number(p.leverage).toFixed(2)}x`);
            console.log(`   Size (notional): ${fmtUsd(p.size)}`);
            console.log(`   Collateral:      ${fmtUsd(p.collateral)} in ${symbolOf(p.collateralMint)}`);
            console.log(`   Value now:       ${fmtUsd(p.value)}`);
            console.log(`   Entry / Mark:    ${fmtUsd(p.entryPrice)} / ${fmtUsd(p.markPrice)}`);
            console.log(`   Liquidation:     ${fmtUsd(p.liquidationPrice)}`);
            console.log(`   Fees (total):    ${fmtUsd(p.totalFeesUsd)}`);
            console.log(`   PnL (net):       ${fmtUsd(pnl)} (${fmtPct(p.pnlChangePctAfterFees)})`);
            console.log(`   Opened:          ${fmtTime(p.createdTime)}`);
            console.log(`   Position:        ${p.positionPubkey}\n`);
        }
        console.log(`Σ ${positions.length} position(s) — net PnL: ${fmtUsd(totalPnl)}`);
    } catch (error) {
        console.error('\n❌ Failed to fetch positions.');
        if (error.response) {
            console.error(`API Error (${error.response.status}):`, JSON.stringify(error.response.data));
        } else {
            console.error(error.message);
        }
    }
}

showPositions();
