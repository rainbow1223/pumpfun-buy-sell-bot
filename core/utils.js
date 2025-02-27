const solanaWeb3 = require('@solana/web3.js');
const splToken = require('@solana/spl-token');
const { getAssociatedTokenAddressSync } = require('@solana/spl-token');
// const { solana_connection } = require('../constants/global');
const { connection } = require("./constants.js");
const {
    LIQUIDITY_STATE_LAYOUT_V4,
    Liquidity,
    TokenAmount,
} = require("@raydium-io/raydium-sdk");
const bs58 = require('bs58');

const calcAmountOut = async (poolKeys, rawAmountIn, swapInDirection, slippage) => {
    const poolInfo = await Liquidity.fetchInfo({ connection: connection, poolKeys })

    let currencyInMint = poolKeys.baseMint
    let currencyInDecimals = poolInfo.baseDecimals
    let currencyOutMint = poolKeys.quoteMint
    let currencyOutDecimals = poolInfo.quoteDecimals

    if (!swapInDirection) {
        currencyInMint = poolKeys.quoteMint
        currencyInDecimals = poolInfo.quoteDecimals
        currencyOutMint = poolKeys.baseMint
        currencyOutDecimals = poolInfo.baseDecimals
    }

    const currencyIn = new Token(TOKEN_PROGRAM_ID, currencyInMint, currencyInDecimals)
    const amountIn = new TokenAmount(currencyIn, rawAmountIn, true)
    const currencyOut = new Token(TOKEN_PROGRAM_ID, currencyOutMint, currencyOutDecimals)
    const _slippage = new Percent(slippage, 100) // x% slippage

    const { amountOut, minAmountOut, currentPrice, executionPrice, priceImpact, fee } = Liquidity.computeAmountOut({
        poolKeys,
        poolInfo,
        amountIn,
        currencyOut,
        _slippage,
    })

    return {
        amountIn,
        amountOut,
        minAmountOut,
        currentPrice,
        executionPrice,
        priceImpact,
        fee,
    }
}

const transferSol = async (fromWalletPrivateKey, toWalletPublicKey, amount) => {
    console.log("Transferring ", amount, " SOL from ", fromWalletPrivateKey, " to ", toWalletPublicKey);
    // const connection = solana_connection;
    const fromWallet = solanaWeb3.Keypair.fromSecretKey(new Uint8Array(bs58.decode(fromWalletPrivateKey)));
    const toWallet = new solanaWeb3.PublicKey(toWalletPublicKey);
    const transaction = new solanaWeb3.Transaction().add(solanaWeb3.SystemProgram.transfer({
        fromPubkey: fromWallet.publicKey,
        toPubkey: toWallet,
        lamports: amount * 1000000000,
    }));
    const signature = await solanaWeb3.sendAndConfirmTransaction(connection, transaction, [fromWallet]);
    console.log("Transfer successful with signature ", signature);
    return signature;
};

const getTokenPrice = async (tokenAddress, poolAddress, currentSolPrice) => {
   
    console.log("Getting token price for ", tokenAddress);
    // const connection = solana_connection;
    const poolAccountInfo = await connection.getAccountInfo(new solanaWeb3.PublicKey(poolAddress), "confirmed");
    if (!poolAccountInfo) {
        console.error("getPoolState: Can not fetch Info");
        return null;
    }
    const pool = LIQUIDITY_STATE_LAYOUT_V4.decode(poolAccountInfo.data);

    // const res = (
    //     await connection.getMultipleParsedAccounts([pool.baseVault, pool.quoteVault])
    //   ).value;
    // const base = res[0]?.data;
    // const quote = res[1]?.data;
    // const baseReserve = BigInt(base["parsed"]["info"]["tokenAmount"]["amount"]);
    // const quoteReserve = BigInt(quote["parsed"]["info"]["tokenAmount"]["amount"]);
    // console.log(BigInt(base["parsed"]["info"]["tokenAmount"]["amount"]));
    // console.log(BigInt(quote["parsed"]["info"]["tokenAmount"]["amount"]));


    let wsolReserve, tokenReserve;
    if (pool.baseMint.toBase58() === tokenAddress) {
        wsolReserve = await connection.getTokenAccountBalance(
            new solanaWeb3.PublicKey(pool.quoteVault)
        );
        tokenReserve = await connection.getTokenAccountBalance(
            new solanaWeb3.PublicKey(pool.baseVault)
        );
    } else {
        wsolReserve = await connection.getTokenAccountBalance(
            new solanaWeb3.PublicKey(pool.baseVault)
        );
        tokenReserve = await connection.getTokenAccountBalance(
            new solanaWeb3.PublicKey(pool.quoteVault)
        );
    }
    console.log("WSOL Reserve is ", wsolReserve.value.uiAmount);
    console.log("Token Reserve is ", tokenReserve.value.uiAmount);
    console.log("Current Sol Price is ", currentSolPrice);
    const price =
        (currentSolPrice * wsolReserve.value.uiAmount) /
        tokenReserve.value.uiAmount;
    console.log("Price is ", price);
    return price;
};


const getWSOLBalance = async (walletPublicKey) => {
    walletPublicKey = new solanaWeb3.PublicKey(walletPublicKey);
    console.log("Getting WSOL balance for ", walletPublicKey);
    // const connection = solana_connection;

    try {
        // Define the WSOL token mint address
        const wsolMintAddress = new solanaWeb3.PublicKey("So11111111111111111111111111111111111111112");

        const associatedWSOLPubkey = getAssociatedTokenAddressSync(
            wsolMintAddress, // Pass the WSOL mint address here
            walletPublicKey,
            false, // Allow owner off curve
            splToken.TOKEN_PROGRAM_ID,
            splToken.ASSOCIATED_TOKEN_PROGRAM_ID
        );
        if (!associatedWSOLPubkey) {
            console.error("Associated WSOL pubkey not found");
            return {
                message: "WSOL not found",
                signature: "none",
                cost: 0,
            };
        }
        const wsolBalanceInfo = await connection.getTokenAccountBalance(associatedWSOLPubkey, "confirmed");

        if (!wsolBalanceInfo || wsolBalanceInfo.value.uiAmount === 0) {
            console.error("You do not have enough WSOL to buy token");
            return 0;
        }

        return wsolBalanceInfo.value.uiAmount;
    } catch (error) {
        console.error("Error fetching WSOL balance:", error);
        return 0;
    }
};

const createNewWallet = async () => {
    // Generate a new wallet keypair
    const wallet = solanaWeb3.Keypair.generate();
    const walletAddress = wallet.publicKey.toBase58();
    const walletPrivateKey = bs58.encode(wallet.secretKey);;

    return { walletPrivateKey, walletAddress };
};

const checkWallet = async (walletPublicKey) => {
    if (!walletPublicKey) {
        console.error("Wallet public key not provided");
        return { balance: 0, wsolBalance: 0 };
    }
    console.log("Checking wallet for ", walletPublicKey);
    // const connection = solana_connection;
    const balance = await connection.getBalance(new solanaWeb3.PublicKey(walletPublicKey)) * 0.000000001;
    const wsolBalance = await getWSOLBalance(walletPublicKey);
    console.log("WSOL Balance is ", wsolBalance);
    console.log("Balance is ", balance);
    return { balance, wsolBalance };
}
const getWalletSolBalance = async (walletPublicKey) => {
    console.log("Getting balance for ", walletPublicKey);
    // const connection = solana_connection;
    const balance = await connection.getBalance(walletPublicKey);
    console.log("Balance is ", balance);
    return balance;
};

module.exports = {
    getTokenPrice,
    createNewWallet,
    checkWallet,
    getWalletSolBalance,
    transferSol,
    calcAmountOut,
};