const { PublicKey, VersionedTransactionResponse } = require("@solana/web3.js");

/**
 * @typedef {Object} CreateTokenMetadata
 * @property {string} name
 * @property {string} symbol
 * @property {string} description
 * @property {File} file
 * @property {string} [twitter]
 * @property {string} [telegram]
 * @property {string} [website]
 */

/**
 * @typedef {Object} TokenMetadata
 * @property {string} name
 * @property {string} symbol
 * @property {string} description
 * @property {string} image
 * @property {boolean} showName
 * @property {string} createdOn
 * @property {string} [twitter]
 * @property {string} [telegram]
 * @property {string} [website]
 */

/**
 * @typedef {Object} CreateEvent
 * @property {string} name
 * @property {string} symbol
 * @property {string} uri
 * @property {PublicKey} mint
 * @property {PublicKey} bondingCurve
 * @property {PublicKey} user
 */

/**
 * @typedef {Object} TradeEvent
 * @property {PublicKey} mint
 * @property {bigint} solAmount
 * @property {bigint} tokenAmount
 * @property {boolean} isBuy
 * @property {PublicKey} user
 * @property {number} timestamp
 * @property {bigint} virtualSolReserves
 * @property {bigint} virtualTokenReserves
 * @property {bigint} realSolReserves
 * @property {bigint} realTokenReserves
 */

/**
 * @typedef {Object} CompleteEvent
 * @property {PublicKey} user
 * @property {PublicKey} mint
 * @property {PublicKey} bondingCurve
 * @property {number} timestamp
 */

/**
 * @typedef {Object} SetParamsEvent
 * @property {PublicKey} feeRecipient
 * @property {bigint} initialVirtualTokenReserves
 * @property {bigint} initialVirtualSolReserves
 * @property {bigint} initialRealTokenReserves
 * @property {bigint} tokenTotalSupply
 * @property {bigint} feeBasisPoints
 */

/**
 * @typedef {Object} PumpFunEventHandlers
 * @property {CreateEvent} CreateEvent
 * @property {TradeEvent} TradeEvent
 * @property {CompleteEvent} CompleteEvent
 * @property {SetParamsEvent} SetParamsEvent
 */

/**
 * @typedef {keyof PumpFunEventHandlers} PumpFunEventType
 */

/**
 * @typedef {Object} PriorityFee
 * @property {number} unitLimit
 * @property {number} unitPrice
 */

/**
 * @typedef {Object} TransactionResult
 * @property {string} [signature]
 * @property {*} [error]
 * @property {VersionedTransactionResponse} [results]
 * @property {boolean} success
 */

module.exports = {
    // We don't need to export the types as they are documented using JSDoc
    // They will be available for TypeScript/JSDoc type checking
};
