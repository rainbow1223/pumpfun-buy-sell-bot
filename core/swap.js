const { Liquidity, Token, TokenAmount } = require("@raydium-io/raydium-sdk");
const { connection } = require("./constants");

const base58 = require("bs58");
const {
  createAssociatedTokenAccountIdempotentInstruction,
  createCloseAccountInstruction,
  getAssociatedTokenAddressSync,
  TOKEN_PROGRAM_ID,
  ASSOCIATED_TOKEN_PROGRAM_ID,
  createSyncNativeInstruction,
  
} = require("@solana/spl-token");

const { fetchPoolKeys, getMint } = require("./pool");
const {
  Keypair,
  PublicKey,
  TransactionMessage,
  ComputeBudgetProgram,
  VersionedTransaction,
  Transaction,
  SystemProgram,
  sendAndConfirmTransaction,
} = require("@solana/web3.js");


// Keypair.fromSecretKey(base58.decode(""))
const LAMPORTS_PER_SOL = 1_000_000_000;

const defaultSwapConfig = {
  executeSwap: true, // Send tx when true, simulate tx when false
  useVersionedTransaction: true,
  maxLamports: 1500000, // Micro lamports for priority fee
  maxRetries: 20,
  checkTransaction: true,
};

// Keypair.fromSecretKey(base58.decode(""))

const validatePoolAddress = (address) => {
    try {
        const poolAddress = new PublicKey(address)
        return true
    } catch (err) {
        return false
    }
}

const validateTokenPoolAddress = async (address) => {
    try {
        const publicKey = new PublicKey(address);
        const accountInfo = await connection.getAccountInfo(publicKey);
        
        if (!accountInfo) {
            console.log('Address not found on the blockchain');
            return false;
        }

        // Example logic to differentiate token and pool addresses
        // Note: You need to adjust this logic based on your specific use case
        const isTokenAddress = accountInfo.owner.toBase58() === 'TokenkegQfeZyiNwAJbNbGKPFXCWuBvf9Ss623VQ5DA';
        
        if (isTokenAddress) {
            console.log('This is a token address');
            return false;
        } else {
            console.log('This is a pool address');
            return true;
        }
    } catch (error) {
        console.error('Error validating address:', error);
        return false;
    }
};


const buyToken = async (amountIn, poolAddress, privateKey) => {

  console.log("buyToken", amountIn, poolAddress, privateKey);
  const wallet = Keypair.fromSecretKey(base58.decode(privateKey));

  if (!validatePoolAddress(poolAddress)) {
    console.error("Invalid Pool Address");
    return {
      message: "Invalid Pool Address",
      signature: "none",
      cost: 0,
    };
  }

  const liquidityPoolKeys = await fetchPoolKeys(poolAddress);
  if (!liquidityPoolKeys) {
    console.error("LiquidityPoolKeys Not Found");
    return {
      message: "LiquidityPoolKeys Not Found",
      signature: "none",
      cost: 0,
    };
  }

  const tokenAddress =
    liquidityPoolKeys.baseMint.toBase58() == Token.WSOL.mint.toBase58()
      ? liquidityPoolKeys.quoteMint.toBase58()
      : liquidityPoolKeys.baseMint.toBase58();
  const tokenPubkey = new PublicKey(tokenAddress);

  const associatedTokenPubkey = getAssociatedTokenAddressSync(
    tokenPubkey,
    wallet.publicKey
  );

  const associatedWSOLPubkey = getAssociatedTokenAddressSync(
    Token.WSOL.mint,
    wallet.publicKey
  );

  // Create the WSOL account if it does not exist
  const instructions = [];
  const associatedWSOLAccountInfo = await connection.getAccountInfo(associatedWSOLPubkey);
  if (associatedWSOLAccountInfo) {
    // associatedWSOL Account Already exists
    const wsolBalance = await connection.getTokenAccountBalance(associatedWSOLPubkey, "confirmed");
    if (wsolBalance.value.uiAmount < amountIn) {
      // Wrap SOL by diff
      instructions.push(
        ...[
          SystemProgram.transfer({
            fromPubkey: wallet.publicKey,
            toPubkey: associatedWSOLPubkey,
            lamports: (amountIn - wsolBalance.value.uiAmount) * LAMPORTS_PER_SOL,
          }),
          createSyncNativeInstruction(associatedWSOLPubkey),
        ]
      )
    }
  } else {
    // const wsolBalance = await connection.getTokenAccountBalance(associatedWSOLPubkey, "confirmed");
    // const wsolBalance = 0;
    instructions.push(
      ...[
        createAssociatedTokenAccountIdempotentInstruction(wallet.publicKey, associatedWSOLPubkey, wallet.publicKey, Token.WSOL.mint),
        SystemProgram.transfer({
          fromPubkey: wallet.publicKey,
          toPubkey: associatedWSOLPubkey,
          lamports: (amountIn) * LAMPORTS_PER_SOL,
        }),
        createSyncNativeInstruction(associatedWSOLPubkey),
      ]
    )
  }

  const tokenInAmount = new TokenAmount(Token.WSOL, amountIn, false);

  try {
    const { innerTransaction } = Liquidity.makeSwapFixedInInstruction(
      {
        poolKeys: liquidityPoolKeys,
        userKeys: {
          tokenAccountIn: associatedWSOLPubkey,
          tokenAccountOut: associatedTokenPubkey,
          owner: wallet.publicKey,
        },
        amountIn: tokenInAmount.raw,
        minAmountOut: 0,
      },
      liquidityPoolKeys.version
    );

    const latestBlockhash = await connection.getLatestBlockhash({
      commitment: "confirmed",
    });

    const messageV0 = new TransactionMessage({
      payerKey: wallet.publicKey,
      recentBlockhash: latestBlockhash.blockhash,
      instructions: [
        ComputeBudgetProgram.setComputeUnitPrice({ microLamports: 9000000 }),
        ComputeBudgetProgram.setComputeUnitLimit({ units: 101337 }),
        ...instructions,
        createAssociatedTokenAccountIdempotentInstruction(
          wallet.publicKey,
          associatedTokenPubkey,
          wallet.publicKey,
          tokenPubkey
        ),
        ...innerTransaction.instructions,
        createCloseAccountInstruction(associatedWSOLPubkey, wallet.publicKey, wallet.publicKey),
      ],
    }).compileToV0Message();

    let buyTransaction;
    if (defaultSwapConfig.useVersionedTransaction) {
      buyTransaction = new VersionedTransaction(messageV0);
    } else {
      buyTransaction = new Transaction({
        blockhash: latestBlockhash.blockhash,
        lastValidBlockHeight: latestBlockhash.lastValidBlockHeight,
        feePayer: wallet.publicKey,
      }).add(...innerTransaction.instructions.filter(Boolean));
    }

    buyTransaction.sign([wallet]);
    const sendOptions = {
      skipPreflight: true,
      maxRetries: defaultSwapConfig.maxRetries,
    };

    if (defaultSwapConfig.executeSwap) {
      const txId = await connection.sendTransaction(buyTransaction, sendOptions);
      console.info("Transaction ID:", txId);

      return {
        message: "Buy token is Successful",
        signature: txId,
        cost: "0.000917033 SOL",
      };
    } else {
      await connection.simulateTransaction(buyTransaction);
    }
  } catch (e) {
    console.error("Buy Transaction Error: ", e);
    return { message: "Error Occurred", signature: "none", cost: 0 };
  }
};

const sellToken = async (tokenAmountPer, poolAddress, privateKey) => {
  // Fetch Pool Info
  const wallet = Keypair.fromSecretKey(base58.decode(privateKey));

  //   console.log("validateTokenPoolAddress",await validateTokenPoolAddress(poolAddress));
  const isPoolAddress = await validateTokenPoolAddress(poolAddress);
  if (!isPoolAddress) {
    console.error("Invalid Pool Address")
    return {
      message: "Invalid Pool Address, you sen t a Token Address, please input Pool Address",
      signature: "none",
      cost: 0,
    };
  }
  const liquidityPoolKeys = await fetchPoolKeys(poolAddress);
  if (!liquidityPoolKeys) {
    console.error("LiquidityPoolKeys Not Found");
    return {
      message: "LiquidityPoolKeys Not Found",
      signature: "none",
      cost: 0,
    };
  }

  const tokenAddress =
    liquidityPoolKeys.baseMint.toBase58() == Token.WSOL.mint.toBase58()
      ? liquidityPoolKeys.quoteMint.toBase58()
      : liquidityPoolKeys.baseMint.toBase58();
  console.log("tokenAddress", tokenAddress);
  // Prepare Token, ATA
  const tokenPubkey = new PublicKey(tokenAddress);
  const tokenInfo = await getMint(tokenPubkey);
  if (!tokenInfo) {
    console.error("TokenInfo Not Found");
    return;
  }

  const associatedTokenPubkey = getAssociatedTokenAddressSync(
    tokenPubkey,
    wallet.publicKey
  );
  console.log("associatedTokenPubkey", associatedTokenPubkey);
  if (!associatedTokenPubkey) {
    console.error("AssociatedTokenPubkey Not Found");
    return {
      message: "Token not found, to sell, you should have token in your wallet",
      signature: "none",
      cost: 0,
    };
  }

  const associatedWSOLPubkey = getAssociatedTokenAddressSync(
    Token.WSOL.mint,
    wallet.publicKey
  );
  const tokenAmount = await connection.getTokenAccountBalance(
    associatedTokenPubkey,
    "confirmed"
  ).catch((e) => {
    console.error("Error: Token not found");
  });

  //   console.log("tokenAmount", tokenAmount)

  if (!tokenAmount) {
    console.error("You do not have enough token to sell");
    return {
      message: "Token not found",
      signature: "none",
      cost: 0,
    };
  }
  //   console.log("wallet token amount", tokenAmount.value.uiAmount);

  if (tokenAmountPer > 100) {
    console.error("Invalid Token Amount");
    return {
      message: "Invalid Token Amount, please input smaller than 100",
      signature: "none",
      cost: 0,
    };
  }

  if (tokenAmountPer <= 0) {
    console.error("Invalid Token Amount");
    return {
      message: "Invalid Token Amount, please input bigger than 0",
      signature: "none",
      cost: 0,
    };
  }

  const exactAmountIn = tokenAmount.value.uiAmount * (tokenAmountPer / 100);
  console.log("exactTokenAmountIn: ", exactAmountIn);
  const tokenInAmount = new TokenAmount(
    new Token(TOKEN_PROGRAM_ID, tokenPubkey, tokenInfo.decimals),
    exactAmountIn,
    false
  );

  try {
    const { innerTransaction } = Liquidity.makeSwapFixedInInstruction(
      {
        poolKeys: liquidityPoolKeys,
        userKeys: {
          tokenAccountIn: associatedTokenPubkey,
          tokenAccountOut: associatedWSOLPubkey,
          owner: wallet.publicKey,
        },
        amountIn: tokenInAmount.raw,
        minAmountOut: 0,
      },
      liquidityPoolKeys.version
    );

    const latestBlockhash = await connection.getLatestBlockhash({
      commitment: "confirmed",
    });
    let messageV0;
    if (tokenAmountPer == 100) {
      messageV0 = new TransactionMessage({
        payerKey: wallet.publicKey,
        recentBlockhash: latestBlockhash.blockhash,
        instructions: [
          ComputeBudgetProgram.setComputeUnitPrice({ microLamports: 9000000 }),
          ComputeBudgetProgram.setComputeUnitLimit({ units: 101337 }),
          createAssociatedTokenAccountIdempotentInstruction(wallet.publicKey, associatedWSOLPubkey, wallet.publicKey, Token.WSOL.mint),
          ...innerTransaction.instructions,
          createCloseAccountInstruction(
            associatedTokenPubkey,
            wallet.publicKey,
            wallet.publicKey
          ),
          createCloseAccountInstruction(
            associatedWSOLPubkey,
            wallet.publicKey,
            wallet.publicKey
          ),
        ],
      }).compileToV0Message();
    } else {
      messageV0 = new TransactionMessage({
        payerKey: wallet.publicKey,
        recentBlockhash: latestBlockhash.blockhash,
        instructions: [
          ComputeBudgetProgram.setComputeUnitPrice({ microLamports: 421197 }),
          ComputeBudgetProgram.setComputeUnitLimit({ units: 101337 }),
          ...innerTransaction.instructions,
        ],
      }).compileToV0Message();
    }

    let sellTransaction;
    let txId;
    let simulateRes;
    let sendTime;
    const sendOptions = {
      skipPreflight: true,
      maxRetries: defaultSwapConfig.maxRetries,
    };
    if (defaultSwapConfig.useVersionedTransaction) {
      sellTransaction = new VersionedTransaction(messageV0);
      sellTransaction.sign([wallet]);
      if (defaultSwapConfig.executeSwap) {
        sendTime = Date.now();
        txId = await connection.sendTransaction(sellTransaction, sendOptions);
        console.info("Transaction ID:", txId);

        const result = {
          message: "Sell token is Successful",
          signature: txId,
          cost: "0.000047683 SOL",
        };
        return result;
      } else {
        simulateRes = await connection.simulateTransaction(sellTransaction);
        console.log("SimulateRes: ", simulateRes);
      }
    } else {
      sellTransaction = new Transaction({
        blockhash: latestBlockhash.blockhash,
        lastValidBlockHeight: latestBlockhash.lastValidBlockHeight,
        feePayer: wallet.publicKey,
      });
      sellTransaction.add(...innerTransaction.instructions.filter(Boolean));
      if (defaultSwapConfig.executeSwap) {
        sendTime = Date.now();
        txId = await connection.sendTransaction(
          sellTransaction,
          [wallet],
          sendOptions
        );
        console.info("Transaction ID:", txId);
      } else {
        simulateRes = await connection.simulateTransaction(sellTransaction);
      }
    }

    return { txId, simulateRes };
  } catch (e) {
    console.error("Sell Transaction Error: ", e);
    return {
      message: "Error Occured",
      signature: "none",
      cost: 0,
    };
  }
};


module.exports = { buyToken, sellToken };
