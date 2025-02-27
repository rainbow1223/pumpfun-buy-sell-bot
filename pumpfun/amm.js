const { AMM } = require('./amm');
const { GlobalAccount } = require('./globalAccount');
const { BondingCurveAccount } = require('./bondingCurveAccount');

// Create from Global Account
const globalAccount = new GlobalAccount(/* ... */);
const amm1 = AMM.fromGlobalAccount(globalAccount);

// Create from Bonding Curve Account
const bondingCurve = new BondingCurveAccount(/* ... */);
const amm2 = AMM.fromBondingCurveAccount(bondingCurve, BigInt(1000));

// Get buy price
const buyPrice = amm1.getBuyPrice(BigInt(100));

// Apply buy
const buyResult = amm1.applyBuy(BigInt(50));
console.log(buyResult.token_amount, buyResult.sol_amount);

// Apply sell
const sellResult = amm1.applySell(BigInt(30));
console.log(sellResult.token_amount, sellResult.sol_amount);
