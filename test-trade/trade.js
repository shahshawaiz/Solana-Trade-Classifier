const crypto = require('crypto');
const axios = require('axios');
const bs58 = require('bs58').default || require('bs58');
const dotenv = require('dotenv');

dotenv.config();

const RPC_ENDPOINT = process.env.SOLANA_RPC_URL || 'https://api.mainnet-beta.solana.com';
// Jupiter's legacy quote-api.jup.ag/v6 host is decommissioned (connections fail outright).
// Current free host: https://lite-api.jup.ag/swap/v1 — paid: https://api.jup.ag/swap/v1 (API key).
const JUPITER_API = process.env.JUPITER_API_URL || 'https://lite-api.jup.ag/swap/v1';
const USDC_MINT = 'EPjFWdd5AufqSSqeM2qN1xzybapC8G4wEGGkZwyTDt1v';
const SOL_MINT = 'So11111111111111111111111111111111111111112';

// Swap direction and size. Currently selling SOL for USDC.
// To go the other way, swap INPUT_MINT/OUTPUT_MINT and set INPUT_DECIMALS to 6.
const INPUT_MINT = SOL_MINT;
const OUTPUT_MINT = USDC_MINT;
const INPUT_DECIMALS = 9;       // SOL = 9 decimals, USDC = 6
const TRADE_AMOUNT = 0.05;      // amount of the INPUT token (SOL) to sell
const SOL_FEE_BUFFER = 0.01;    // keep this much SOL spare for network fees / rent
const SLIPPAGE_BPS = 50;
// Standard PKCS#8 DER header for a raw 32-byte Ed25519 seed. Node's crypto rejects
// format:'raw', so we wrap the seed in this prefix to build a valid private key.
const ED25519_PKCS8_PREFIX = Buffer.from('302e020100300506032b657004220420', 'hex');

// Fetch SOL and USDC balances for a wallet via plain JSON-RPC (no extra deps).
async function getBalances(ownerBase58) {
    const rpc = async (method, params) => {
        const res = await axios.post(RPC_ENDPOINT, { jsonrpc: '2.0', id: 1, method, params }, { timeout: 10000 });
        if (res.data.error) throw new Error(`RPC ${method}: ${res.data.error.message}`);
        return res.data.result;
    };

    // SOL balance comes back in lamports (1 SOL = 1e9 lamports).
    const solRes = await rpc('getBalance', [ownerBase58]);
    const sol = solRes.value / 1e9;

    // USDC sits in an SPL token account owned by the wallet; sum any matching accounts.
    const usdcRes = await rpc('getTokenAccountsByOwner', [
        ownerBase58,
        { mint: USDC_MINT },
        { encoding: 'jsonParsed' },
    ]);
    const usdc = usdcRes.value.reduce(
        (sum, acc) => sum + (acc.account.data.parsed.info.tokenAmount.uiAmount || 0),
        0
    );

    return { sol, usdc };
}

async function executeTrade() {
    try {
        // 1. Decode Private Key and Extract Public Key natively
        const secretKey = bs58.decode(process.env.PRIVATE_KEY);
        if (secretKey.length !== 64) throw new Error("Invalid private key length. Must be 64 bytes.");
        
        // First 32 bytes = Private Seed, Last 32 bytes = Public Key
        const privateKeySeed = secretKey.slice(0, 32);
        const publicKeyBuffer = secretKey.slice(32, 64);
        const userPublicKeyBase58 = bs58.encode(publicKeyBuffer);
        
        console.log(`✅ Wallet loaded natively. Address: ${userPublicKeyBase58}`);

        // Show balances up front and bail early if there isn't enough to trade.
        console.log('💰 Fetching wallet balances...');
        const balances = await getBalances(userPublicKeyBase58);
        console.log(`   SOL:  ${balances.sol}`);
        console.log(`   USDC: ${balances.usdc}`);

        // Selling SOL also needs gas, so require the trade amount plus a fee buffer.
        const sellingSol = INPUT_MINT === SOL_MINT;
        const inputBalance = sellingSol ? balances.sol : balances.usdc;
        const required = sellingSol ? TRADE_AMOUNT + SOL_FEE_BUFFER : TRADE_AMOUNT;
        if (inputBalance < required) {
            throw new Error(`Insufficient balance: have ${inputBalance}, need ${required} (incl. fee buffer).`);
        }

        const amountInSmallestUnit = Math.round(TRADE_AMOUNT * 10 ** INPUT_DECIMALS);

        // 2. Fetch Quote from Jupiter
        console.log('📡 Fetching route from Jupiter...');
        const quoteUrl = `${JUPITER_API}/quote?inputMint=${INPUT_MINT}&outputMint=${OUTPUT_MINT}&amount=${amountInSmallestUnit}&slippageBps=${SLIPPAGE_BPS}`;
        const quoteRes = await axios.get(quoteUrl, { headers: { 'User-Agent': 'Mozilla/5.0' }, timeout: 10000 });

        // 3. Request Swap Transaction
        console.log('⚙️ Requesting swap transaction layout...');
        const swapRes = await axios.post(`${JUPITER_API}/swap`, {
            quoteResponse: quoteRes.data,
            userPublicKey: userPublicKeyBase58,
            wrapAndUnwrapSol: true,
        }, {
            headers: { 'Content-Type': 'application/json', 'User-Agent': 'Mozilla/5.0' }
        });

        const { swapTransaction } = swapRes.data;
        const txBuffer = Buffer.from(swapTransaction, 'base64');

        // 4. Native Crypto Ed25519 Signing
        // Versioned tx layout: [1 byte signature count] + [64 bytes * count signatures] + [message].
        // Read the count rather than assuming 1 so the message offset stays correct.
        console.log('✍️ Signing transaction message natively using Node.js crypto...');

        const numSignatures = txBuffer[0];
        const messageBytes = txBuffer.slice(1 + 64 * numSignatures);

        // Wrap the 32-byte seed in a PKCS#8 DER envelope (Node rejects format:'raw').
        const privateKeyObject = crypto.createPrivateKey({
            key: Buffer.concat([ED25519_PKCS8_PREFIX, privateKeySeed]),
            format: 'der',
            type: 'pkcs8',
        });

        // Sign the raw transaction message
        const signature = crypto.sign(null, messageBytes, privateKeyObject);

        // The fee payer (our wallet) is the first required signer, so its signature
        // goes in the first 64-byte slot, right after the 1-byte count.
        signature.copy(txBuffer, 1);

        // 5. Broadcast to Solana RPC via Axios
        console.log('🚀 Broadcasting signed transaction directly to Solana...');
        const rpcRes = await axios.post(RPC_ENDPOINT, {
            jsonrpc: '2.0',
            id: 1,
            method: 'sendTransaction',
            params: [
                txBuffer.toString('base64'),
                { encoding: 'base64', skipPreflight: false }
            ]
        });

        if (rpcRes.data.error) {
            throw new Error(`Solana RPC Error: ${rpcRes.data.error.message}`);
        }

        const txid = rpcRes.data.result;
        console.log(`🎉 Trade successfully broadcasted! ID: ${txid}`);
        console.log(`🔍 Track your swap here: https://solscan.io/tx/${txid}`);

    } catch (error) {
        console.error('\n❌ Execution Failed:');
        if (error.response) {
            console.error(`API Error status ${error.response.status}:`, error.response.data);
        } else {
            console.error(error.message);
        }
    }
}

executeTrade();