const dotenv = require("dotenv");
dotenv.config();
const { Connection } = require("@solana/web3.js");

// You should change RPC_HTTPS_URL and RPC_WS_URL to RPC_HTTPS_URL1 and RPC_WSS_URL1 of your Solana node

console.log("RPC_HTTPS_URL1", process.env.RPC_HTTPS_URL1);
const connection = new Connection("https://hidden-morning-spree.solana-mainnet.quiknode.pro/9eb377785f684760c6b966fe558cc750c8bf0767", {
    commitment: "confirmed",
    wsEndpoint: "wss://hidden-morning-spree.solana-mainnet.quiknode.pro/9eb377785f684760c6b966fe558cc750c8bf0767"
});

const DEX = {
    RaydiumLiquidityPoolV4: "675kPX9MHTjS2zt1qfr1NYHuzeLXfQM9H24wFSUt1Mp8"
}

module.exports = {
    connection,
    DEX
};