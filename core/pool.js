const {
    LIQUIDITY_STATE_LAYOUT_V4,
    Liquidity,
    MAINNET_PROGRAM_ID,
    MARKET_STATE_LAYOUT_V3,
    RAYDIUM_MAINNET,
  } = require("@raydium-io/raydium-sdk");
  const { connection } = require("./constants");
  const { MintLayout } = require("@solana/spl-token");
  const { PublicKey } = require("@solana/web3.js");
  
  const getPoolState = async (poolAddress) => {
    const poolAccountInfo = await connection.getAccountInfo(
      poolAddress,
      "confirmed"
    );
    if (!poolAccountInfo) {
      console.error("getPoolState: Can not fetch Info");
      return null;
    }
    const poolState = LIQUIDITY_STATE_LAYOUT_V4.decode(poolAccountInfo.data);
    return poolState;
  };
  
  const getMarketState = async (marketId) => {
    const marketAccountInfo = await connection.getAccountInfo(marketId);
    if (!marketAccountInfo) {
      console.error("Market Account Info not Found: ", marketId);
      return null;
    }
    const marketState = MARKET_STATE_LAYOUT_V3.decode(marketAccountInfo.data);
    return marketState;
  };
  
  const getMint = async (mint) => {
    const { data } = (await connection.getAccountInfo(mint)) ?? {};
    if (!data) {
      console.error("Mint Account Info not Found: ", mint);
      return null;
    }
    return MintLayout.decode(data);
  };
  
  const fetchLiquidityPoolKeysV4 = async (
    poolAddress,
    poolState,
    marketState
  ) => {
    const mintInfo = await getMint(poolState.lpMint);
    const liquidityPoolKeysV4 = {
      id: new PublicKey(poolAddress),
      baseMint: poolState.baseMint,
      quoteMint: poolState.quoteMint,
      lpMint: poolState.lpMint,
      baseDecimals: poolState.baseDecimal,
      quoteDecimals: poolState.quoteDecimal,
      lpDecimals: mintInfo?.decimals ?? 5,
      version: 4,
      programId: MAINNET_PROGRAM_ID.AmmV4,
      authority: Liquidity.getAssociatedAuthority({
        programId: MAINNET_PROGRAM_ID.AmmV4,
      }).publicKey,
      openOrders: poolState.openOrders,
      targetOrders: poolState.openOrders,
      baseVault: poolState.baseVault,
      quoteVault: poolState.quoteVault,
      withdrawQueue: poolState.withdrawQueue,
      lpVault: poolState.lpVault,
      marketVersion: 3,
      marketProgramId: poolState.marketProgramId,
      marketId: poolState.marketId,
      marketAuthority: Liquidity.getAssociatedAuthority({
        programId: MAINNET_PROGRAM_ID.AmmV4,
      }).publicKey,
      marketBaseVault: marketState.baseVault,
      marketQuoteVault: marketState.quoteVault,
      marketBids: marketState.bids,
      marketAsks: marketState.asks,
      marketEventQueue: marketState.eventQueue,
      lookupTableAccount: PublicKey.default,
    };
    return liquidityPoolKeysV4;
  };
  
  const fetchPoolKeys = async (poolAddress) => {
    const poolLPV4State = await getPoolState(new PublicKey(poolAddress));
    if (!poolLPV4State) {
      return null;
    }
    const marketState = await getMarketState(poolLPV4State.marketId);
    if (!marketState) {
      return null;
    }
    const liquidityPoolKeysV4 = await fetchLiquidityPoolKeysV4(
      poolAddress,
      poolLPV4State,
      marketState
    );
    return liquidityPoolKeysV4;
  };
  
  module.exports = {
    fetchPoolKeys,
    getPoolState,
    getMarketState,
    getMint,
    fetchLiquidityPoolKeysV4,
  };
  