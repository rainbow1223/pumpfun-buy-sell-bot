const { TelegramClient } = require("telegram");
const { StringSession } = require("telegram/sessions");
const input = require("input");
const { NewMessage } = require("telegram/events");
const { bot } = require("./bot");
const { createNewWallet, checkWallet, getTokenPrice } = require("./core/utils.js");
const { buyToken } = require("./core/swap.js");
const { pendingActions } = require("./globals/global.js");
const axios = require('axios');
const dotenv = require("dotenv");
const Pool = require("./models/Pool.js");
const User = require("./models/user.js");
const Order = require("./models/order");
const { runOrder } = require("./core/limitOrder.js");
const { getUserData } = require("./globals/global.js");
const { buyPumpToken } = require("./core/pumpSwap.js");
const { PumpFunService } = require("./pumpfun/pumpfun.js")
const { AnchorProvider } = require("@coral-xyz/anchor");
const NodeWallet = require("@coral-xyz/anchor/dist/cjs/nodewallet");
const { connection } = require('./core/constants.js')
const { Keypair, PublicKey } = require("@solana/web3.js")
const base58 = require("bs58");

require('./config/db.js');

require("dotenv").config();


const apiId = parseInt(process.env.TG_API_ID);
const apiHash = process.env.TG_API_HASH;
const stringSession = new StringSession(process.env.TG_SESSION);
const tgChannelURL = process.env.TG_TEST_CHANNEL;


let client = null;
let isListening = false;

const getPoolAddress = async (contractAddress) => {
  const url = `https://api.tokencheck.io/token/mint/${contractAddress}`;
  const dexUrl = `https://api.dexscreener.com/latest/dex/tokens/${contractAddress}`;

  try {
    const response = await axios.get(url); // Use axios to fetch dat
    const data = response.data;

    // Extract the raydiumPool address from the response
    if (data && data.data && data.data.pair) {
      return data.data.pair; // Return the raydiumPool address
    } else {
      throw new Error('raydiumPool address not found in the response.');
    }
  } catch (error) {
    // Handle errors (network issues, invalid JSON, etc.)
    throw new Error(`Error fetching pool address: ${error.message}`);
  }
};

async function getRaydiumPoolAddressWithDexAPI(tokenAddress) {
  try {
    const url = `https://api.dexscreener.com/latest/dex/tokens/${tokenAddress}`;
    const response = await axios.get(url);
    const pairs = response.data.pairs;

    if (!pairs || pairs.length === 0) {
      console.log('No pools found for this token');
      return [];
    }

    // Filter only Raydium pools and return their addresses
    const raydiumPools = pairs
      .filter(pair => pair.dexId === 'raydium')
      .map(pair => ({
        poolAddress: pair.pairAddress,
        baseToken: pair.baseToken.symbol,
        quoteToken: pair.quoteToken.symbol,
        liquidity: pair.liquidity.usd
      }));

    return raydiumPools;

  } catch (error) {
    console.error('Error fetching Raydium pools:', error);
    throw error;
  }
}

// Update SOL Price
const updateSolPrice = async () => {
  try {
    const res = await fetch("https://api.coingecko.com/api/v3/simple/price?ids=solana&vs_currencies=usd");
    if (!res.ok) throw new Error(`HTTP error! Status: ${res.status}`);
    const resData = await res.json();
    global.currentSolPrice = resData.solana?.usd;
    console.log("Current SOL PRICE is : ", global.currentSolPrice)
  } catch (error) {
    console.error("Failed to fetch SOL price:", error);
  }
  setTimeout(updateSolPrice, 100000000);
};
updateSolPrice();
// Channel Listener Function
const startChannelListener = async (chatId) => {

  console.log("Starting channel listener...");
  if (isListening) return;

  try {
    client = new TelegramClient(stringSession, apiId, apiHash, {
      connectionRetries: 500,
    });

    await client.start({
      phoneNumber: async () => await input.text("Please enter your number: "),
      password: async () => await input.text("Please enter your password: "),
      phoneCode: async () => await input.text("Please enter the code you received: "),
      onError: (err) => {
        console.log(err);
        isListening = false;
      },
    });

    console.log("TG Connected...");
   
    console.log("url", tgChannelURL)
    const channelToListen = await client.getEntity(tgChannelURL);
    console.log("Channel to listen:", tgChannelURL);
   

    client.addEventHandler(
      
      async (event) => {
        const message = event.message;
        const text = message.message;
        console.log("Received message:", text);
        
        // 1120024
        console.log("url", tgChannelURL)
        // Replace the Topic ID when it changes
        // if (event.message?.replyTo?.replyToMsgId == tgTopicId) {
          console.log("Message is reply to topic", text);
          const solanaAddressMatch = text.match(/[1-9A-HJ-NP-Za-km-z]{32,44}/);
        if (solanaAddressMatch) {
          const tokenAddress = solanaAddressMatch[0];
          console.log("Found Solana address:", tokenAddress);
          bot.sendMessage(chatId, `DexPaid Solana Token Found: ${tokenAddress}`);
          try {
            processToken(tokenAddress, chatId);
          } catch (error) {
            console.error(`Error processing token for user ${chatId}:`, error);
          }
        }

        bot.sendMessage(chatId, `${text}`);
      },
      new NewMessage({ chats: [channelToListen.id] })
    );

    isListening = true;
    return true;
  } catch (error) {
    console.error("Error in startChannelListener:", error);
    isListening = false;
    return false;
  }
};

// Process Token Function
async function processToken(tokenAddress, chatId) {
  try {
    const tradingUser = await User.findOne({ chatId });
    if (!tradingUser) {
      bot.sendMessage(chatId, `Trading User not found`);
      return;
    }

    // Check if token already bought
    const existingOrders = await Order.find({
      chatId,
      tokenAddress,
      status: { $in: ["pending", "calculating"] }
    });

    if (existingOrders.length > 0) {
      bot.sendMessage(chatId, "Token already in portfolio");
      return;
    }
    bot.sendMessage(chatId, `tokenaddress is ${tokenAddress}`);
    
    console.log("trading User Privatekey", tradingUser.tradeWalletPrivateKey);
    if (!tradingUser.tradeWalletPrivateKey) {
      bot.sendMessage(chatId, "Trade wallet private key is not defined");
      return;
    }

    const keypair = Keypair.fromSecretKey(base58.decode(tradingUser.tradeWalletPrivateKey));

    // Set up provider
    const provider = new AnchorProvider(connection, { publicKey: keypair.publicKey, signAllTransactions: txs => txs }, {
        commitment: "finalized",
    });
    
    console.log("Provider is", provider);
    
    const pumpFunService = new PumpFunService(provider);

    // const buyer = await getKeyPairFromPrivateKey(tradeUser.walletPrivateKey);
    // const amount = tradingUser.tradingAmount;
    const amount = 0.001;
    const LAMPORTS_PER_SOL = 1000000000;
    const SLIPPAGE_BASIS_POINTS = BigInt(500);
    // const result = await buyPumpToken(0.001, tokenAddress, tradingUser.tradeWalletPrivateKey, chatId);
    const results = await pumpFunService.buy(
      keypair,
      new PublicKey(tokenAddress),
      BigInt(amount * LAMPORTS_PER_SOL),
      SLIPPAGE_BASIS_POINTS,
      {
        unitLimit: 250000,
        unitPrice: 250000,
      }
    );
    // console.log(results);
    let virtualTokenReserves = results.results.virtualTokenReserves;
    let virtualSolReserves = results.results.virtualSolReserves;
    let realTokenReserves = results.results.realTokenReserves;
    let realSolReserves = results.results.realSolReserves;
    let tokenTotalSupply = results.results.tokenTotalSupply;
    if (results.success) {

      const order = new Order({
        chatId,
        tokenAddress,
        poolAddress: tokenAddress, // Ensure this value is available
        privateKey: tradingUser.tradeWalletPrivateKey, // Ensure this value is available
        buyAmount: amount, // Ensure this value is available
        virtualTokenReserves: virtualTokenReserves, // Ensure this value is available
        virtualSolReserves: virtualSolReserves, // Ensure this value is available
        realTokenReserves: realTokenReserves, // Ensure this value is available
        realSolReserves: realSolReserves, // Ensure this value is available
        tokenTotalSupply: tokenTotalSupply, // Ensure this value is available
        status: "pending",
        isPumpToken: true,
        previousPrice: results.previousPrice // Ensure this value is available if needed
      });
      await order.save();
    }
    // const bondingCurveAccount = await pumpFunService.getBondingCurveAccount(new PublicKey(tokenAddress));
    // console.log("Bonding Curve Account", bondingCurveAccount);
    bot.sendMessage(chatId, `Token bought successfully: ${results}`);



  } catch (error) {
    console.error("Error processing token:", error);
    bot.sendMessage(chatId, `Error buying token: ${error.message}`);
  }
}

// Bot Command Handlers
bot.onText(/\/start/, async (msg) => {
  const chatId = msg.chat.id;
  const user = await User.findOne({ chatId });

  if (!user) {
    const newUser = new User({
      chatId,
      trailingStopLossPercentage: 100,
      profitPercentage: 20,
      stopLossPercentage: 20,
    });
    await newUser.save();
  }

  const startButtonOptions = {
    parse_mode: "Markdown",
    reply_markup: {
      inline_keyboard: [
        [{ text: "Start Trading 🚀", callback_data: "start_trading" }],
        [
          { text: "Trailing Stop Loss", callback_data: "set_trailing_stop_loss" },
          { text: "Stop Loss", callback_data: "set_stop_loss" },
          { text: "Take Profit", callback_data: "set_take_profit" }
        ],
        [{ text: "Set Trading Amount", callback_data: "set_trading_amount" }],
        [{ text: "Create New Wallet", callback_data: "create_wallet" }],
        [{ text: "Remove Current Wallet", callback_data: "remove_trade_wallet" }],
        [{ text: "Check Wallet", callback_data: "check_wallet" }]
      ]
    }
  };

  bot.sendMessage(chatId, `Welcome to our Pump Fun Token Trading Bot!

Before starting, please:
1. Set Trading Amount
2. Configure Take Profit (default 20%)
3. Set Stop Loss (default 20%)
4. Set Trailing Stop Loss (default 100%)

The bot will automatically:
- Monitor DEX PAID tokens
- Execute trades based on your settings
- Manage your positions with set parameters

Current defaults:
- Take Profit: 20%
- Stop Loss: 20%
- Trailing Stop Loss: 100%`, startButtonOptions);
});

// Callback Query Handler
bot.on("callback_query", async (query) => {
  const chatId = query.message.chat.id;
  const data = query.data;
  const currentUser = await User.findOne({ chatId });
  const { balance, wsolBalance } = await checkWallet(currentUser.tradeWalletPubicKey);

  switch (data) {
    case "stop_trading":
      currentUser.status = false;
      bot.sendMessage(chatId, "User trading status set as inactive")
      break;
    case "start_trading":
      console.log("Trading started");
      if (!currentUser.tradeWalletPrivateKey || !currentUser.tradeWalletPubicKey) {
        bot.sendMessage(chatId, "Please create your wallet first");
        return;
      }
      if (!currentUser.tradingAmount) {
        bot.sendMessage(chatId, "Please set trading amount first");
        return;
      }
      if (!currentUser.trailingStopLossPercentage) {
        currentUser.trailingStopLossPercentage = 2;
        await currentUser.save();
      }
      // const { balance, wsolBalance } = await checkWallet(currentUser.tradeWalletPubicKey);
      // if (balance < 0.001) {
      //   bot.sendMessage(chatId, "You don't have enough SOL to start trading, please deposit some SOL to start trading");
      //   return;
      // }
      // if (wsolBalance < 0.001) {
      //   bot.sendMessage(chatId, "You don't have enough WSOL to start trading, please deposit some WSOL to start trading");
      //   return;
      // }

      bot.sendMessage(chatId, `You have ${balance} SOL and ${wsolBalance} WSOL in your wallet, Trading started successfully`);
      // startMonitorDexPaidTokens(chatId);
      await startChannelListener(chatId);
      break;

    case "set_trading_amount":
      bot.sendMessage(chatId, "Please input trading amount between 0.05 and 1");
      pendingActions[chatId] = "adjust_trading_amount";
      break;
    case "set_stop_loss":
      bot.sendMessage(chatId, "Please input stop loss percentage, default is 20%");
      pendingActions[chatId] = "adjust_stop_loss";
      break;
    case "set_trailing_stop_loss":
      bot.sendMessage(chatId, "Please input trailing stop loss percentage, default is 2%");
      pendingActions[chatId] = "adjust_trailing_stop_loss";
      break;

    case "set_take_profit":
      bot.sendMessage(chatId, "Please input profit take percent, default is 20%");
      pendingActions[chatId] = "adjust_profit_take";
      break;

    case "create_wallet":
      if (currentUser.tradeWalletPrivateKey && currentUser.tradeWalletPubicKey) {
        bot.sendMessage(chatId, "You already have a wallet, please remove it first");
        return;
      }

      const { walletPrivateKey, walletAddress } = await createNewWallet();
      currentUser.tradeWalletPrivateKey = walletPrivateKey;
      currentUser.tradeWalletPubicKey = walletAddress;
      await currentUser.save();
      const options = {
        parse_mode: "Markdown",
        disable_web_page_preview: true,
      };
      bot.sendMessage(chatId, `
Wallet created successfully,
*your wallet address is ${walletAddress}*
*your wallet private key is ${walletPrivateKey}*
Please save it in a secure place. 
Please deposit some SOL and wrapped SOL to start trading      
      `);

      break;
    case "remove_trade_wallet":
      if (!currentUser.tradeWalletPrivateKey || !currentUser.tradeWalletPubicKey) {
        bot.sendMessage(chatId, "You don't have a wallet yet");
        return;
      }
      currentUser.tradeWalletPrivateKey = null;
      currentUser.tradeWalletPubicKey = null;
      await currentUser.save();
      bot.sendMessage(chatId, "Wallet removed successfully");

      break;
    case "check_wallet":
      if (!currentUser.tradeWalletPrivateKey || !currentUser.tradeWalletPubicKey) {
        bot.sendMessage(chatId, "You don't have a wallet yet");
        return;
      }

      bot.sendMessage(chatId, `
      Your Wallet Address: ${currentUser.tradeWalletPubicKey}
      You have ${balance} SOL and ${wsolBalance} WSOL in your wallet`);

      break;
  }
})

// Message Handler for Settings
bot.on("message", async (msg) => {
  const chatId = msg.chat.id;
  const text = msg.text;
  const textOnlyString = msg.text.trim();
  const value = parseFloat(textOnlyString);
  const userInfo = getUserData(chatId);
  const currentUser = await User.findOne({ chatId });

  if (!pendingActions[chatId]) return;
  switch (pendingActions[chatId]) {
    case "adjust_trading_amount":

      if (!isNaN(value) && value >= 0.01 && value <= 1) {
        userInfo.tradingAmount = value;
        currentUser.tradingAmount = value;
        await currentUser.save();
        bot.sendMessage(chatId, `Trading amount is set to ${value}`);
        pendingActions[chatId] = null; // Reset pending action
      } else {
        bot.sendMessage(chatId, "Invalid amount. Please enter a value between 0.01 and 1:");
      }
      break;
    case "adjust_profit_take":
      if (!isNaN(text) && text >= 0) {

        userInfo.profitTake = text;
        bot.sendMessage(chatId, "Profit take amount is set");
        currentUser.profitPercentage = text;
        await currentUser.save();
        pendingActions[chatId] = null;
      } else {
        bot.sendMessage(chatId, "Invalid amount. Please enter a value greater than 0");
      }
      break;

    case "adjust_stop_loss":
      if (!isNaN(text) && text >= 0 && text <= 100) {

        userInfo.stopLoss = text;
        currentUser.stopLossPercentage = text;
        await currentUser.save();
        bot.sendMessage(chatId, "Stop loss amount is set");
        pendingActions[chatId] = null;
      } else {
        bot.sendMessage(chatId, "Invalid amount. Please enter a value between 0 and 100:");
      }
      break;
    case "adjust_trailing_stop_loss":
      if (!isNaN(text) && text >= 0 && text <= 100) {
        userInfo.trailingStopLoss = text;
        currentUser.trailingStopLossPercentage = text;
        await currentUser.save();
        bot.sendMessage(chatId, "Trailing stop loss amount is set");
        pendingActions[chatId] = null;
      } else {
        bot.sendMessage(chatId, "Invalid amount. Please enter a value between 0 and 100:");
      }
      break;
  }

})

// Start the bot

setInterval(runOrder, 2000);

console.log("Bot initialized and ready to receive commands...");

module.exports = {
  updateSolPrice
}
