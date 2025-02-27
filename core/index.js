const { PublicKey } = require("@solana/web3.js");
const { connection, DEX } = require("./constants");
const {
  LIQUIDITY_STATE_LAYOUT_V4,
  LIQUIDITY_STATE_LAYOUT_V5,
  Liquidity,
  WSOL,
} = require("@raydium-io/raydium-sdk");
const globals = require("../globals/global.js");
const Pool = require("../models/Pool");

// const updateSolPrice = async () => {
//   const res = await fetch("https://price.jup.ag/v4/price?ids=SOL", {
//     method: "GET",
//     headers: {
//       "Content-Type": "application/json",
//     },
//   });
//   const resData = await res.json();
//   globals.currentSolPrice = resData.data.SOL.price;
  
//   setTimeout(updateSolPrice, 5000);
// };

const fetchActivePools = async () => {
  const raydiumSubscriptionId = connection.onProgramAccountChange(
    // Get the new liquidity pool account info in Raydium program
    new PublicKey(DEX.RaydiumLiquidityPoolV4),

    async (updatedAccountInfo) => {
      const address = updatedAccountInfo.accountId;
      const owner = updatedAccountInfo.accountInfo.owner;
      const data = updatedAccountInfo.accountInfo.data;
      let poolState;
      try {
        poolState = LIQUIDITY_STATE_LAYOUT_V4.decode(data);
      } catch (error) {
        try {
          poolState = LIQUIDITY_STATE_LAYOUT_V5.decode(data);
          // return;
        } catch (error) {
          console.log(error.message);
          return null;
        }
      }
      if (
        poolState.baseMint.toBase58() == "11111111111111111111111111111111" ||
        poolState.quoteMint.toBase58() == "11111111111111111111111111111111"
      ) {
        return;
      }

      if (globals.poolsForDetect.indexOf(address.toBase58()) >= 0) return;
      globals.poolsForDetect.push(address.toBase58());
      console.log(
        `New Raydium Liquidity Pool V4 Program Account: ${address.toBase58()}`
      );

      const pool = new Pool({
        address: address.toBase58(),
        baseMint: poolState.baseMint.toBase58(),
        quoteMint: poolState.quoteMint.toBase58(),
        baseDecimal: parseInt(poolState.baseDecimal.toString()),
        quoteDecimal: parseInt(poolState.quoteDecimal.toString()),
        baseVault: poolState.baseVault.toBase58(),
        quoteVault: poolState.quoteVault.toBase58(),
        marketId: poolState.marketId.toBase58(),
        marketProgramId: poolState.marketProgramId.toBase58(),
        dex: owner.toBase58(),
        lpMint: poolState.lpMint.toBase58(),
        lpVault: poolState.lpVault?.toBase58(),
        openTime: parseInt(poolState.poolOpenTime.toString()),
        authority: Liquidity.getAssociatedAuthority({
          programId: owner,
        }).publicKey.toBase58(),
      });

      try {
        await pool.save();
        return pool;
      } catch (error) {
        if (error.code === 11000) {
          // MongoDB duplicate key error
          // console.log(`Pool ${pool.address} Already Exists.`);
        }
        return pool;
      }
    },
    "confirmed"
  );
  console.log(
    `Subscribe Raydium Liquidity Pool V4 Program Account: ${raydiumSubscriptionId}`
  );
};

const run = async () => {
//   updateSolPrice();
  fetchActivePools();
};

module.exports = {
  fetchActivePools,
  run,
};
