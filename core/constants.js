const dotenv = require("dotenv");
dotenv.config();
const { Connection } = require("@solana/web3.js");

// You should change RPC_HTTPS_URL and RPC_WS_URL to RPC_HTTPS_URL1 and RPC_WSS_URL1 of your Solana node
const connection = new Connection(process.env.RPC_HTTPS_URL1, {
    commitment: "confirmed",
    wsEndpoint: process.env.RPC_WSS_URL1
});

const DEX = {
    RaydiumLiquidityPoolV4: "675kPX9MHTjS2zt1qfr1NYHuzeLXfQM9H24wFSUt1Mp8"
}

module.exports = {
    connection,
    DEX
};