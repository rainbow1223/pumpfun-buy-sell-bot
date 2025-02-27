// Import the necessary modules
const base58 = require("bs58");

const { Keypair } = require("@solana/web3.js");
const { DEFAULT_DECIMALS, PumpFunSDK } = require("pumpdotfun-sdk");
const { AnchorProvider } = require("@coral-xyz/anchor");
const { getAssociatedTokenAddressSync } = require("@solana/spl-token");
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
};
