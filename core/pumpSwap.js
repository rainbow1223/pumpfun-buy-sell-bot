// Import the necessary modules
const base58 = require("bs58");

const { Keypair } = require("@solana/web3.js");
const { DEFAULT_DECIMALS, PumpFunSDK } = require("pumpdotfun-sdk");
const { AnchorProvider, BN } = require("@coral-xyz/anchor");
const { getAssociatedTokenAddressSync } = require("@solana/spl-token");
const pumpSwapSdk = require("@pump-fun/pump-swap-sdk");
const BigNumber = require("bignumber.js");
const SolanaPoolModel = require("../models/solanaPoolModel");

// const { solana_connection } = require("../constants/global");
const { connection } = require("./constants.js");
const { bot } = require('../bot.js')

const { 
    PublicKey,
    Transaction,
    ComputeBudgetProgram,
    sendAndConfirmTransaction,
} = require("@solana/web3.js");

// Establish connection
// const connection = solana_connection;

const PUMPFUN_DECIMALS = 6;

const MIN_SOL_LEFT = 0.000105
const MIN_SOL_PER_CYCLE = 0.01
const RENT_FEE = 0.005


const UNIT_LIMIT = 1000000
const UNIT_PRICE = 100000

const SWAP_UNIT_LIMIT = 1000000
const SWAP_UNIT_PRICE = 1000000


const pumpAmmSDK = new pumpSwapSdk.PumpAmmSdk(connection);

const getPool = async (baseMint, quoteMint) => {
    const pool = await SolanaPoolModel.find({ pool_base_mint: baseMint, pool_quote_mint: quoteMint });
    return pool;
}

/**
 * Get Solana balance for a wallet address
 * @param {string} walletAddress - The wallet address to check
 * @returns {Promise<number>} - The balance in SOL
 */
const getSolanaBalance = async (walletAddress) => {
    try {
        const publicKey = new PublicKey(walletAddress);
        const balance = await connection.getBalance(publicKey);
        // Convert lamports to SOL (1 SOL = 1,000,000,000 lamports)
        return new BigNumber(balance).div(10 ** 9).toNumber();
    } catch (error) {
        console.error('Error fetching Solana balance:', error);
        return 0;
    }
};


// Function to buy Pump Tokens
const buyPumpToken = async (amountIn, tokenAddress, walletPrivateKey, chatId) => {

    console.log(amountIn, tokenAddress, walletPrivateKey);

    // Create a keypair from the private key
    const keypair = Keypair.fromSecretKey(base58.decode(walletPrivateKey));

    // Set up provider
    const provider = new AnchorProvider(connection, { publicKey: keypair.publicKey, signAllTransactions: txs => txs }, {
        commitment: "finalized",
    });

    // Initialize SDK with provider
    let sdk = new PumpFunSDK(provider);
    let mint = new PublicKey(tokenAddress);
    try {
        const buyInstruction = await sdk.getBuyInstructionsBySolAmount(
            keypair.publicKey,
            mint,
            BigInt(Math.round(amountIn * Math.pow(10, 9))),
            5000n
        );
        console.log("Buy instruction created successfully:", buyInstruction);
    } catch (error) {
        console.error("Error occurred while creating buy instruction:", error);
        bot.sendMessage(chatId, "Curve is Complete, can not buy on pump fun")
        return;
    }

    let transaction = new Transaction();
    // Speedup using ComputeBudgetProgram
    const modifyComputeUnits = ComputeBudgetProgram.setComputeUnitLimit({
        units: 200_000,
    });
    const updateCuIx = ComputeBudgetProgram.setComputeUnitPrice({
        microLamports: 5_999_999,
    });
    transaction.add(modifyComputeUnits);
    transaction.add(updateCuIx);
    transaction.add(buyInstruction);

    // Sign and send the transaction
    let signature = await sendAndConfirmTransaction(connection, transaction, [keypair]);
    console.log("Transaction Signature: ", signature);
    return signature;
};

// Function to sell Pump Tokens
const sellPumpToken = async (walletPrivateKey, tokenAddress) => {
    const keypair = Keypair.fromSecretKey(base58.decode(walletPrivateKey));
    const provider = new AnchorProvider(connection, { publicKey: keypair.publicKey, signAllTransactions: txs => txs }, {
        commitment: "finalized",
    });

    let sdk = new PumpFunSDK(provider);
    let mint = new PublicKey(tokenAddress);

    const currentSPLBalance = await getSPLBalance(
        sdk.connection,
        mint,
        keypair.publicKey
    );

    const sellInstruction = await sdk.getSellInstructions(
        keypair.publicKey,
        mint,
        new PublicKey("CebN5WGQ4jvEPvsVU4EoHEpgzq1VV7AbicfhtW4xC9iM"),
        BigInt(Math.round(currentSPLBalance * Math.pow(10, DEFAULT_DECIMALS))),
        0n
    );

    let transaction = new Transaction();
    const modifyComputeUnits = ComputeBudgetProgram.setComputeUnitLimit({
        units: 200_000,
    });
    const updateCuIx = ComputeBudgetProgram.setComputeUnitPrice({
        microLamports: 5_999_999,
    });
    transaction.add(modifyComputeUnits);
    transaction.add(updateCuIx);
    transaction.add(sellInstruction);

    let signature = await sendAndConfirmTransaction(connection, transaction, [keypair]);
    console.log("Transaction Signature: ", signature);
    return signature;
};

const pairAddress = "7dMj6FhnkmZzSA6aa1uRRDJmspxNh4W2pskDCyLikq7n";

// const buyTokenAtAmm = async (tokenMint, wallet, sol_amount, slippage, chatId) => {
//     // const pools = await getPool(tokenMint.toString(), "So11111111111111111111111111111111111111112");

//     // if (pools.length >= 0) {
//     if(true) {
//         // let bestPool = pools[0];
//         // let maxBalance = 0;
//         // if (pools.length >= 1) {
//         //     const balances = await Promise.all(pools.map(pool => getSolanaBalance(pool.pool_address)));
//         //     const maxBalanceIndex = balances.reduce((maxIndex, balance, currentIndex) =>
//         //         balance > balances[maxIndex] ? currentIndex : maxIndex, 0);

//         //     bestPool = pools[maxBalanceIndex];
//         //     maxBalance = balances[maxBalanceIndex];
//         // }

//         const amountInLamports = new BN(new BigNumber(sol_amount.toFixed(9)).multipliedBy(10 ** 9).toString());
        
//         // const baseAmount = await pumpAmmSDK.swapAutocompleteBaseFromQuote(new web3.PublicKey(bestPool.pool_address), amountInLamports, slippage, "quoteToBase")
//         // const baseAmount = await pumpAmmSDK.swapAutocompleteBaseFromQuote(new PublicKey("7dMj6FhnkmZzSA6aa1uRRDJmspxNh4W2pskDCyLikq7n"), amountInLamports, slippage, "quoteToBase")
        
//         // console.log(baseAmount)

//         const swapInstructions = await pumpAmmSDK.swapQuoteInstructions(
//             // new web3.PublicKey(bestPool.pool_address),
//             new PublicKey("7dMj6FhnkmZzSA6aa1uRRDJmspxNh4W2pskDCyLikq7n"),
            
//             amountInLamports,
//             slippage,
//             "quoteToBase",
//             wallet.publicKey
//         );

//         const instructions = [
//             ComputeBudgetProgram.setComputeUnitPrice({ microLamports: SWAP_UNIT_PRICE }),
//             ComputeBudgetProgram.setComputeUnitLimit({ units: SWAP_UNIT_LIMIT }),
//             ...swapInstructions
//         ];

//         await pumpSwapSdk.sendAndConfirmTransaction(connection, wallet.publicKey, instructions, [wallet]);
//     }
//     else {
//         throw new Error("No pools found");
//     }
// };

const buyTokenAtAmm = async (tokenMint, wallet, sol_amount, slippage, chatId) => {
    try {
        if(true) {
            const amountInLamports = new BN(new BigNumber(sol_amount.toFixed(9)).multipliedBy(10 ** 9).toString());
            
            const swapInstructions = await pumpAmmSDK.swapQuoteInstructions(
                new PublicKey("7dMj6FhnkmZzSA6aa1uRRDJmspxNh4W2pskDCyLikq7n"),
                amountInLamports,
                slippage,
                "quoteToBase",
                wallet.publicKey
            );

            const instructions = [
                ComputeBudgetProgram.setComputeUnitPrice({ microLamports: SWAP_UNIT_PRICE }),
                ComputeBudgetProgram.setComputeUnitLimit({ units: SWAP_UNIT_LIMIT }),
                ...swapInstructions
            ];

            const signature = await pumpSwapSdk.sendAndConfirmTransaction(connection, wallet.publicKey, instructions, [wallet]);

            console.log("pumpSwap", signature);
            return { success: true, signature };
        }
        else {
            return { success: false, error: "No pools found" };
        }
    } catch (error) {
        return { success: false, error: error.message };
    }
};


const sellTokenAtAmm = async (tokenMint, wallet, token_amount, slippage) => {
    // const pools = await getPool(tokenMint.toString(), "So11111111111111111111111111111111111111112");
    if(true) {
    // if (pools.length > 0) {
        // let bestPool = pools[0];
        // let maxBalance = 0;
        // if (pools.length >= 1) {
        //     const balances = await Promise.all(pools.map(pool => getSolanaBalance(pool.pool_address)));
        //     const maxBalanceIndex = balances.reduce((maxIndex, balance, currentIndex) =>
        //         balance > balances[maxIndex] ? currentIndex : maxIndex, 0);

        //     bestPool = pools[maxBalanceIndex];
        //     maxBalance = balances[maxBalanceIndex];
        // }

        const amountInLamports = new BN(new BigNumber(token_amount.toFixed(PUMPFUN_DECIMALS)).multipliedBy(10 ** PUMPFUN_DECIMALS).toString());

        // const quoteAmount = await pumpAmmSDK.swapAutocompleteQuoteFromBase(new web3.PublicKey(bestPool.pool_address), amountInLamports, slippage, "baseToQuote")

        const swapInstructions = await pumpAmmSDK.swapBaseInstructions(
            // new PublicKey(bestPool.pool_address),
            new PublicKey("7dMj6FhnkmZzSA6aa1uRRDJmspxNh4W2pskDCyLikq7n"),
            amountInLamports,
            slippage,
            "baseToQuote",
            wallet.publicKey
        );
        
        const instructions = [
            ComputeBudgetProgram.setComputeUnitPrice({ microLamports: SWAP_UNIT_PRICE }),
            ComputeBudgetProgram.setComputeUnitLimit({ units: SWAP_UNIT_LIMIT }),
            ...swapInstructions
        ];

        // const tx = new web3.Transaction()
        // tx.add(...swapInstructions)
        // const txHash = await provider.sendAndConfirm(tx)
        // return txHash
        
        await pumpSwapSdk.sendAndConfirmTransaction(connection, wallet.publicKey, instructions, [wallet]);
    }
    else {
        throw new Error("No pools found");
    }
};

// Helper function to get SPL balance
const getSPLBalance = async (
    connection,
    mintAddress,
    pubKey,
    allowOffCurve = false
) => {
    try {
        let ata = getAssociatedTokenAddressSync(mintAddress, pubKey, allowOffCurve);
        const balance = await connection.getTokenAccountBalance(ata, "processed");
        return balance.value.uiAmount;
    } catch (e) {}
    return null;
};

// Export functions
module.exports = {
    buyPumpToken,
    sellPumpToken,
    getSPLBalance,
    buyTokenAtAmm,
    sellTokenAtAmm,
    getPool,
};
