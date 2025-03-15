const {
    Connection,
    PublicKey,
    Transaction,
  } = require("@solana/web3.js");
  const { Program } = require("@coral-xyz/anchor");
  const { GlobalAccount } = require("./globalAccount");
  const {
    toCompleteEvent,
    toCreateEvent,
    toSetParamsEvent,
    toTradeEvent,
  } = require("./events");
  const {
    createAssociatedTokenAccountInstruction,
    getAccount,
    getAssociatedTokenAddress,
  } = require("@solana/spl-token");
  const { BondingCurveAccount } = require("./bondingCurveAccount");
  const { BN } = require("bn.js");
  const {
    DEFAULT_COMMITMENT,
    DEFAULT_FINALITY,
    calculateWithSlippageBuy,
    calculateWithSlippageSell,
    sendTx,
  } = require("./util");
  const { IDL } = require("./IDL");
  
  const PROGRAM_ID = "6EF8rrecthR5Dkzon8Nwu78hRvfCKubJ14M5uBEwF6P";
  const MPL_TOKEN_METADATA_PROGRAM_ID =
    "metaqbxxUerdq28cj1RbAWkYQm3ybzjb6a8bt518x1s";
  
  const GLOBAL_ACCOUNT_SEED = "global";
  const MINT_AUTHORITY_SEED = "mint-authority";
  const BONDING_CURVE_SEED = "bonding-curve";
  const METADATA_SEED = "metadata";
  
  const DEFAULT_DECIMALS = 6;
  
  class PumpFunService {
    constructor(provider) {
      this.program = new Program(IDL, provider);
      this.connection = this.program.provider.connection;
    }
  
    async createAndBuy(
      creator,
      mint,
      name,
      symbol,
      uri,
      buyAmountSol,
      slippageBasisPoints = BigInt(500),
      priorityFees,
      commitment = DEFAULT_COMMITMENT,
      finality = DEFAULT_FINALITY
    ) {
      let createTx = await this.getCreateInstructions(
        creator.publicKey,
        name,
        symbol,
        uri,
        mint
      );
  
      let newTx = new Transaction().add(createTx);
  
      if (buyAmountSol > 0) {
        const globalAccount = await this.getGlobalAccount(commitment);
        const buyAmount = globalAccount.getInitialBuyPrice(buyAmountSol);
        const buyAmountWithSlippage = calculateWithSlippageBuy(
          buyAmountSol,
          slippageBasisPoints
        );
  
        const buyTx = await this.getBuyInstructions(
          creator.publicKey,
          mint.publicKey,
          globalAccount.feeRecipient,
          buyAmount,
          buyAmountWithSlippage
        );
  
        newTx.add(buyTx);
      }
  
      let createResults = await sendTx(
        this.connection,
        newTx,
        creator.publicKey,
        [creator, mint],
        priorityFees,
        commitment,
        finality
      );
      return createResults;
    }
  
    async buy(
      buyer,
      mint,
      buyAmountSol,
      slippageBasisPoints = BigInt(500),
      priorityFees,
      commitment = DEFAULT_COMMITMENT,
      finality = DEFAULT_FINALITY
    ) {
      let buyTx = await this.getBuyInstructionsBySolAmount(
        buyer.publicKey,
        mint,
        buyAmountSol,
        slippageBasisPoints,
        commitment
      );
  
      
      let buyResults = await sendTx(
        this.connection,
        buyTx,
        buyer.publicKey,
        [buyer],
        priorityFees,
        commitment,
        finality
      );
      if (buyResults.success) {
        let bondingCurveAccount = await this.getBondingCurveAccount(
          mint,
          commitment
        );
        if (bondingCurveAccount) {
          // let globalAccount = await this.getGlobalAccount(commitment);
          let buyAmount = bondingCurveAccount.getBuyPrice(buyAmountSol);
          buyResults.results.buyAmount = buyAmount;
          buyResults.results.virtualTokenReserves = bondingCurveAccount.virtualTokenReserves;
          buyResults.results.virtualSolReserves = bondingCurveAccount.virtualSolReserves;
          buyResults.results.realTokenReserves = bondingCurveAccount.realTokenReserves;
          buyResults.results.realSolReserves = bondingCurveAccount.realSolReserves;
        }
      }
      return buyResults;
    }
  
    async sell(
      seller,
      mint,
      sellTokenAmount,
      slippageBasisPoints = BigInt(500),
      priorityFees,
      commitment = DEFAULT_COMMITMENT,
      finality = DEFAULT_FINALITY
    ) {
      let sellTx = await this.getSellInstructionsByTokenAmount(
        seller.publicKey,
        mint,
        sellTokenAmount,
        slippageBasisPoints,
        commitment
      );
  
      let sellResults = await sendTx(
        this.connection,
        sellTx,
        seller.publicKey,
        [seller],
        priorityFees,
        commitment,
        finality
      );
      return sellResults;
    }
  
    async getCreateInstructions(
      creator,
      name,
      symbol,
      uri,
      mint
    ) {
      const mplTokenMetadata = new PublicKey(MPL_TOKEN_METADATA_PROGRAM_ID);
  
      const [metadataPDA] = PublicKey.findProgramAddressSync(
        [
          Buffer.from(METADATA_SEED),
          mplTokenMetadata.toBuffer(),
          mint.publicKey.toBuffer(),
        ],
        mplTokenMetadata
      );
  
      const associatedBondingCurve = await getAssociatedTokenAddress(
        mint.publicKey,
        this.getBondingCurvePDA(mint.publicKey),
        true
      );
  
      return this.program.methods
        .create(name, symbol, uri)
        .accounts({
          mint: mint.publicKey,
          associatedBondingCurve: associatedBondingCurve,
          metadata: metadataPDA,
          user: creator,
        })
        .signers([mint])
        .transaction();
    }
  
    async getBuyInstructionsBySolAmount(
      buyer,
      mint,
      buyAmountSol,
      slippageBasisPoints = BigInt(500),
      commitment = DEFAULT_COMMITMENT
    ) {
      let bondingCurveAccount = await this.getBondingCurveAccount(
        mint,
        commitment
      );
      if (!bondingCurveAccount) {
        throw new Error(`Bonding curve account not found: ${mint.toBase58()}`);
      }
  
      let buyAmount = bondingCurveAccount.getBuyPrice(buyAmountSol);
      let buyAmountWithSlippage = calculateWithSlippageBuy(
        buyAmountSol,
        slippageBasisPoints
      );
  
      let globalAccount = await this.getGlobalAccount(commitment);
  
      return await this.getBuyInstructions(
        buyer,
        mint,
        globalAccount.feeRecipient,
        buyAmount,
        buyAmountWithSlippage
      );
    }
  
    async getBuyInstructions(
      buyer,
      mint,
      feeRecipient,
      amount,
      solAmount,
      commitment = DEFAULT_COMMITMENT
    ) {
      const associatedBondingCurve = await getAssociatedTokenAddress(
        mint,
        this.getBondingCurvePDA(mint),
        true
      );
  
      const associatedUser = await getAssociatedTokenAddress(mint, buyer, false);
  
      let transaction = new Transaction();
  
      try {
        await getAccount(this.connection, associatedUser, commitment);
      } catch (e) {
        transaction.add(
          createAssociatedTokenAccountInstruction(
            buyer,
            associatedUser,
            buyer,
            mint
          )
        );
      }
  
      transaction.add(
        await this.program.methods
          .buy(new BN(amount.toString()), new BN(solAmount.toString()))
          .accounts({
            feeRecipient: feeRecipient,
            mint: mint,
            associatedBondingCurve: associatedBondingCurve,
            associatedUser: associatedUser,
            user: buyer,
          })
          .transaction()
      );
  
      return transaction;
    }
  
    async getSellInstructionsByTokenAmount(
      seller,
      mint,
      sellTokenAmount,
      slippageBasisPoints = BigInt(500),
      commitment = DEFAULT_COMMITMENT
    ) {
      const bondingCurveAccount = await this.getBondingCurveAccount(
        mint,
        commitment
      );
      if (!bondingCurveAccount) {
        throw new Error(`Bonding curve account not found: ${mint.toBase58()}`);
      }
  
      const globalAccount = await this.getGlobalAccount(commitment);
  
      const minSolOutput = bondingCurveAccount.getSellPrice(
        sellTokenAmount,
        globalAccount.feeBasisPoints
      );
  
      const sellAmountWithSlippage = calculateWithSlippageSell(
        minSolOutput,
        slippageBasisPoints
      );
  
      return await this.getSellInstructions(
        seller,
        mint,
        globalAccount.feeRecipient,
        sellTokenAmount,
        sellAmountWithSlippage
      );
    }
  
    async getSellInstructions(
      seller,
      mint,
      feeRecipient,
      amount,
      minSolOutput
    ) {
      const associatedBondingCurve = await getAssociatedTokenAddress(
        mint,
        this.getBondingCurvePDA(mint),
        true
      );
  
      const associatedUser = await getAssociatedTokenAddress(mint, seller, false);
  
      const transaction = new Transaction();
  
      transaction.add(
        await this.program.methods
          .sell(new BN(amount.toString()), new BN(minSolOutput.toString()))
          .accounts({
            feeRecipient: feeRecipient,
            mint: mint,
            associatedBondingCurve: associatedBondingCurve,
            associatedUser: associatedUser,
            user: seller,
          })
          .transaction()
      );
  
      return transaction;
    }
  
    async getBondingCurveAccount(
      mint,
      commitment = DEFAULT_COMMITMENT
    ) {
      const tokenAccount = await this.connection.getAccountInfo(
        this.getBondingCurvePDA(mint),
        commitment
      );
      if (!tokenAccount) {
        return null;
      }
      return BondingCurveAccount.fromBuffer(tokenAccount.data);
    }
  
    async getGlobalAccount(commitment = DEFAULT_COMMITMENT) {
      const [globalAccountPDA] = PublicKey.findProgramAddressSync(
        [Buffer.from(GLOBAL_ACCOUNT_SEED)],
        new PublicKey(PROGRAM_ID)
      );
  
      const tokenAccount = await this.connection.getAccountInfo(
        globalAccountPDA,
        commitment
      );
  
      return GlobalAccount.fromBuffer(tokenAccount.data);
    }
  
    getBondingCurvePDA(mint) {
      return PublicKey.findProgramAddressSync(
        [Buffer.from(BONDING_CURVE_SEED), mint.toBuffer()],
        this.program.programId
      )[0];
    }
  
    async getSplOut(
      mint,
      buyAmountSol,
      commitment = DEFAULT_COMMITMENT
    ) {
      const bondingCurveAccount = await this.getBondingCurveAccount(
        mint,
        commitment
      );
      if (!bondingCurveAccount) {
        throw new Error(`Bonding curve account not found: ${mint.toBase58()}`);
      }
  
      const buyAmount = bondingCurveAccount.getBuyPrice(buyAmountSol);
  
      return buyAmount;
    }
  
    async getMinSolOutWithSlippage(
      mint,
      sellTokenAmount,
      slippageBasisPoints = BigInt(500),
      commitment = DEFAULT_COMMITMENT
    ) {
      const bondingCurveAccount = await this.getBondingCurveAccount(
        mint,
        commitment
      );
      if (!bondingCurveAccount) {
        throw new Error(`Bonding curve account not found: ${mint.toBase58()}`);
      }
  
      const globalAccount = await this.getGlobalAccount(commitment);
  
      const minSolOutput = bondingCurveAccount.getSellPrice(
        sellTokenAmount,
        globalAccount.feeBasisPoints
      );
      const sellAmountWithSlippage = calculateWithSlippageSell(
        minSolOutput,
        slippageBasisPoints
      );
  
      return sellAmountWithSlippage;
    }
  
    async createTokenMetadata(create) {
      if (!(create.file instanceof File)) {
        throw new Error("File must be a File object");
      }
  
      const formData = new FormData();
      formData.append("file", create.file);
      formData.append("name", create.name);
      formData.append("symbol", create.symbol);
      formData.append("description", create.description);
      formData.append("twitter", create.twitter || "");
      formData.append("telegram", create.telegram || "");
      formData.append("website", create.website || "");
      formData.append("showName", "true");
  
      try {
        const request = await fetch("https://pump.fun/api/ipfs", {
          method: "POST",
          headers: {
            Accept: "application/json",
          },
          body: formData,
          credentials: "same-origin",
        });
  
        if (request.status === 500) {
          const errorText = await request.text();
          throw new Error(
            `Server error (500): ${errorText || "No error details available"}`
          );
        }
  
        if (!request.ok) {
          throw new Error(`HTTP error! status: ${request.status}`);
        }
  
        const responseText = await request.text();
        if (!responseText) {
          throw new Error("Empty response received from server");
        }
  
        try {
          return JSON.parse(responseText);
        } catch (e) {
          throw new Error(`Invalid JSON response: ${responseText}`);
        }
      } catch (error) {
        console.error("Error in createTokenMetadata:", error);
        throw error;
      }
    }
  
    addEventListener(eventType, callback) {
      return this.program.addEventListener(
        eventType,
        (event, slot, signature) => {
          let processedEvent;
          switch (eventType) {
            case "SetParamsEvent":
              processedEvent = toCreateEvent(event);
              callback(processedEvent, slot, signature);
              break;
            case "TradeEvent":
              processedEvent = toTradeEvent(event);
              callback(processedEvent, slot, signature);
              break;
            case "CompleteEvent":
              processedEvent = toCompleteEvent(event);
              callback(processedEvent, slot, signature);
              break;
            case "SetParamsEvent":
              processedEvent = toSetParamsEvent(event);
              callback(processedEvent, slot, signature);
              break;
            default:
              console.error("Unhandled event type:", eventType);
          }
        }
      );
    }
  
    removeEventListener(eventId) {
      this.program.removeEventListener(eventId);
    }
  }
  
  module.exports = {
    PROGRAM_ID,
    MPL_TOKEN_METADATA_PROGRAM_ID,
    GLOBAL_ACCOUNT_SEED,
    MINT_AUTHORITY_SEED,
    BONDING_CURVE_SEED,
    METADATA_SEED,
    DEFAULT_DECIMALS,
    PumpFunService,
  };
  