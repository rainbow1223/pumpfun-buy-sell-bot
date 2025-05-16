const { bot } = require("../bot.js");

const Order = require("../models/order.js");
const User = require("../models/user.js");
const { sellToken } = require("./swap.js");
const { getTokenPrice, transferSol } = require("./utils.js")
const { getBondingCurveData } = require("./pumpUtils");
const { PublicKey, Keypair } = require("@solana/web3.js");

const global = require("../globals/global.js");
const dotenv = require("dotenv");
const { getSPLBalance } = require("./pumpSwap.js");
const { token } = require("@coral-xyz/anchor/dist/cjs/utils/index.js");

const { PumpFunService } = require("../pumpfun/pumpfun.js")
const { AnchorProvider } = require("@coral-xyz/anchor");
const { connection } = require("./constants.js")
const base58 = require("bs58");

dotenv.config();

// const masterWalletAddress = process.env.MASTER_WALLET;
// const masterWalletAddress = "0xd3f73c59f189f02a6cb91988d9ab7710050d0727"
// const address = "TN3viCQyEWBjEF35XMdhYCV6HKdSpHtZWW"
const handleOrder = async (order) => {
    // console.log("master wallet address", masterWalletAddress);  
    if (order.isPumpToken == false) {

        order.status = "calculating";
        await order.save();
      

        console.log("Handling order currentSolPrice", global.currentSolPrice);
        if (global.currentSolPrice == 0) {
            const res = await fetch("https://api.coingecko.com/api/v3/simple/price?ids=solana&vs_currencies=usd");
            if (!res.ok) throw new Error(`HTTP error! Status: ${res.status}`);
            const resData = await res.json();
            global.currentSolPrice = resData.solana?.usd;
            console.log("Current Sol price is ", global.currentSolPrice);
        }
        let tokenPrice = await getTokenPrice(order.tokenAddress, order.poolAddress, global.currentSolPrice);
        let priceChange = 0;
        
  
        priceChange = (order.previousPrice - order.tokenPrice) / order.tokenPrice * 100 ;

        let sellTriggerAmountForTSL = 0;
        
        const currentUser = await User.findOne({ chatId: order.chatId });
        if (currentUser == null) {
            console.log("User not found");
            return;
        }
        if(priceChange == 0) {
            if (tokenPrice > order.tokenPrice * 1.03 && tokenPrice > order.previousPrice) {
                order.previousPrice = tokenPrice;
                // order.status = "pending"
                await order.save();
            }
            console.log("First time check")

            sellTriggerAmountForTSL = -1;
        }
        if (priceChange >= 3 && priceChange <= 30) { 
            sellTriggerAmountForTSL = order.tokenPrice * (100 - priceChange) / 100;
            currentUser.trailingStopLossPercentage = priceChange;
        }
        if (priceChange > 30 && priceChange < 50) { 
            currentUser.trailingStopLossPercentage = 65;
            sellTriggerAmountForTSL = order.previousPrice - (priceChange / 100 * order.tokenPrice) *  0.65
        }
        if (priceChange >= 50 && priceChange < 100) {
            sellTriggerAmountForTSL = order.previousPrice - (priceChange / 100 * order.tokenPrice) *  0.55
            currentUser.trailingStopLossPercentage = 55;
        }
        if (priceChange >= 100 && priceChange < 250) {
            sellTriggerAmountForTSL = order.previousPrice - (priceChange / 100 * order.tokenPrice) *  0.45
            currentUser.trailingStopLossPercentage = 45;
        }
        if (priceChange >= 250 && priceChange < 350) {
            sellTriggerAmountForTSL = order.previousPrice - (priceChange / 100 * order.tokenPrice) *  0.35
            currentUser.trailingStopLossPercentage = 35;
        }
        if (priceChange >= 350 && priceChange < 500) {
            sellTriggerAmountForTSL = order.previousPrice - (priceChange / 100 * order.tokenPrice) *  0.3
            currentUser.trailingStopLossPercentage = 30;
        }
        if (priceChange >= 500 && priceChange < 1000) {
            sellTriggerAmountForTSL = order.previousPrice - (priceChange / 100 * order.tokenPrice) *  0.2
            currentUser.trailingStopLossPercentage = 20;
        }
        if (priceChange >= 1000 && priceChange <= 2000) { 
            sellTriggerAmountForTSL = order.previousPrice - (priceChange / 100 * order.tokenPrice) *  0.1
            currentUser.trailingStopLossPercentage = 10;
        }
        // if (priceChange >= 500 && priceChange < 1000) currentUser.trailingStopLossPercentage = 5;
        if (priceChange > 2000 && priceChange <= 200000) {
            sellTriggerAmountForTSL = order.previousPrice - (priceChange / 100 * order.tokenPrice) *  0.05
            currentUser.trailingStopLossPercentage = 5;
        }

        await currentUser.save();  

        let stopLoss = (100 - currentUser.stopLossPercentage) / 100;
        let takeProfit = (currentUser.profitPercentage + 100) / 100;
        let trailingStopLoss = priceChange * currentUser.trailingStopLossPercentage / 100;
        console.log("Current User is ", currentUser.chatId, "Trailidng stop loss is ", trailingStopLoss, "Stop loss is ", stopLoss, "Take profit is ", takeProfit);

        let tradingAmount = currentUser.tradingAmount;
        if (tokenPrice > order.tokenPrice * takeProfit ||  tokenPrice <= sellTriggerAmountForTSL || tokenPrice < order.tokenPrice * stopLoss) {
            // send message to user

            console.log("detected price change");
            let res = await sellToken(100, order.poolAddress, order.privateKey);

            // execute sell
            bot.sendMessage(order.chatId, `
                sell Token message: ${res.message} `
            )
            if (res.message == "Token not found") {
                console.log("Token not found");
                order.status = "stopped";
                await order.save();
    
                // bot.sendMessage(order.chatId, `
            }
            else if (res.message == "Sell token is Successful") {
                console.log(res.signature, res.message, order.privateKey);
                // transferSol(order.privateKey, masterWalletAddress, tradingAmount * 0.015);
                order.status = "completed";
                if (tokenPrice <= sellTriggerAmountForTSL) {
                    bot.sendMessage(order.chatId, `
Your order has been completed successfully. Your order has been completed due to trailing stop loss.

tokenAddress: ${order.tokenAddress}
priceChange: ${priceChange}
BuyPrice: ${order.tokenPrice}
Current Price: ${tokenPrice}
Trailing Stop Loss: ${currentUser.trailingStopLossPercentage}
TriggerAmount: ${sellTriggerAmountForTSL}
PreviousPrice: ${order.previousPrice}
Tx: ${res.signature}
                `);
                } else if (tokenPrice < order.tokenPrice * stopLoss) {
                    bot.sendMessage(order.chatId, `
Your order has been completed successfully. Your order has been completed due to STOP LOSS.

priceChange: ${priceChange}
BuyPrice: ${order.tokenPrice}
Cyurrent Price: ${tokenPrice}
Stop Loss: ${currentUser.stopLossPercentage}
Trailidng stop loss: ${currentUser.trailingStopLossPercentage}
Tx: ${res.signature}
                `);
                } else if(tokenPrice > order.tokenPrice * takeProfit){
                    bot.sendMessage(order.chatId, `
Your order has been completed successfully. Your order has been completed due to TAKE PROFIT.

priceChange: ${priceChange}
BuyPrice: ${order.tokenPrice}
Current Price: ${tokenPrice}
Take Profit: ${currentUser.profitPercentage}
Stop Loss: ${currentUser.stopLossPercentage}
Trailidng stop loss: ${currentUser.trailingStopLossPercentage}
Tx: ${res.signature}
                `);

                }
                await order.save();
                let tradingResult = (tokenPrice - order.tokenPrice) * tradingAmount;
                if (tradingResult > 0) {
                    // currentUser.profit += tradingResult;
                    bot.sendMessage(order.chatId, `
Your order has been completed successfully. You have made a profit of ${tradingResult} SOL.
Tx: ${res.signature}
                `);
                } else {
                    // currentUser.loss += tradingResult;
                    bot.sendMessage(order.chatId, `
Your order has been completed successfully. You have made a loss of ${tradingResult} SOL.
Tx: ${res.signature}
                `);
                }
                // await order.save();

            }
            else {
                order.status = "pending";
                if (tokenPrice >= order.tokenPrice * 1.03 && tokenPrice > order.previousPrice) order.previousPrice = tokenPrice;
                await order.save();

            }

        } else {
            if (tokenPrice >= order.tokenPrice * 1.03 && tokenPrice > order.previousPrice) order.previousPrice = tokenPrice;
            order.status = "pending";
            await order.save();
        }

    }

    else if (order.isPumpToken) {

        order.status = "calculating";
        await order.save();
   
        let tokenBondingCurveData = await getBondingCurveData(new PublicKey(order.tokenAddress));
        
        console.log("BondingCurveData", tokenBondingCurveData);
        let tokenPrice = tokenBondingCurveData.BondingCurve.virtualSOLReserves / tokenBondingCurveData.BondingCurve.virtualTokenReserves;

        console.log("Token Price is ", tokenPrice);

        const currentUser = await User.findOne({ chatId: order.chatId });
        if (currentUser == null) {
            console.log("User not found");
            return;
        }
        console.log(order.virtualSolReserves, order.virtualTokenReserves);
        let buyPrice = Number(BigInt(order.virtualSolReserves)) / Number(BigInt(order.virtualTokenReserves));

        console.log("buy Price", buyPrice);
        let stopLoss = (100 - currentUser.stopLossPercentage) / 100;
        let takeProfit = (currentUser.profitPercentage + 100) / 100;
        console.log("Current User is ", currentUser.chatId, "Stop loss is ", stopLoss, "Take profit is ", takeProfit);

        let tradingAmount = currentUser.tradingAmount;
        if (tokenPrice > buyPrice * takeProfit || tokenPrice <= buyPrice * stopLoss) {
            // send message to user

            console.log("detected price change");
            // let res = await sellPumpToken(order.privateKey, order.tokenAddress);
            const keypair = Keypair.fromSecretKey(base58.decode(currentUser.tradeWalletPrivateKey));

            // Set up provider
            const provider = new AnchorProvider(connection, { publicKey: keypair.publicKey, signAllTransactions: txs => txs }, {
                commitment: "finalized",
            });
            
            console.log("Provider is", provider);
            
            const pumpFunService = new PumpFunService(provider);
        
            // const buyer = await getKeyPairFromPrivateKey(tradeUser.walletPrivateKey);
            // const amount = tradingUser.tradingAmount;
            const amount = 0;
            const LAMPORTS_PER_SOL = 1000000000;
            const DEFAULT_DECIMALS = 6;
            const SLIPPAGE_BASIS_POINTS = BigInt(500);
            // const result = await buyPumpToken(0.001, tokenAddress, tradingUser.tradeWalletPrivateKey, chatId);
            const splBalance = await getSPLBalance(
                connection,
                new PublicKey(order.tokenAddress),
                new PublicKey(currentUser.tradeWalletPubicKey)
              );

            console.log("splBalance", splBalance);
            const amountOut = await pumpFunService.getMinSolOutWithSlippage(
                new PublicKey(order.tokenAddress),
                amount > 0
                  ? BigInt(amount * 10 ** DEFAULT_DECIMALS)
                  : BigInt(splBalance * 10 ** DEFAULT_DECIMALS),
                SLIPPAGE_BASIS_POINTS
              );
            
              const results = await pumpFunService.sell(
                keypair,
                new PublicKey(order.tokenAddress),
                amount > 0
                  ? BigInt(amount * 10 ** DEFAULT_DECIMALS)
                  : BigInt(splBalance * 10 ** DEFAULT_DECIMALS),
                SLIPPAGE_BASIS_POINTS,
                {
                  unitLimit: 250000, //0.0025
                  unitPrice: 250000,
                }
              );
            // execute sell
            if (results.success) {
                console.log(results);
                // transferSol(order.privateKey, masterWalletAddress, tradingAmount * 0.015);
                order.status = "completed";
                await order.save();
                let tradingResult = (tokenPrice - buyPrice) * tradingAmount;
                if (tradingResult > 0) {
                    // currentUser.profit += tradingResult;
                    bot.sendMessage(order.chatId, `
Your order has been completed successfully. You have made a profit of ${tradingResult} SOL.
Tx: ${results}
                `);
                } else {
                    // currentUser.loss += tradingResult;
                    bot.sendMessage(order.chatId, `
Your order has been completed successfully. You have made a loss of ${tradingResult} SOL.
Tx: ${results}
                `);
                }
            } else {
                // if the sell failed
                order.status = "pending";
                await order.save();
            }
        }
        else {
            order.status = "pending";
            await order.save();
        }
    }
}
const runOrder = async () => {
    // let tokenPrice = await getTokenPrice("5ToDNkiBAK6k697RRyngTburU7yZNFZFx7jzsD1Uc7pK", "4BKRQ2iL3Rv8mSpDsFM5FNkZ9SGq4iaqrYtgNWjGE3s4", global.currentSolPrice);
    // console.log("Stram token price is ", tokenPrice)
    console.log("Running order");
    let orders = await Order.find({ status: "pending" });
    let calcOrders = await Order.find({ status: "calculating" });
    orders = orders.concat(calcOrders);

    console.log(orders);
    for (let order of orders) {
        handleOrder(order);
    }
}

module.exports = {
    runOrder
};