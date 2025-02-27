const mongoose = require("mongoose");
const Schema = mongoose.Schema;

const userSchema = new Schema({
    chatId: {
        type: String,
        required: true
    },
    tradeWalletPrivateKey: {
        type: String
    },
    tradeWalletPubicKey: {
        type: String
    },  
    tradingAmount: {
        type: Number
    },
    profitPercentage: {
        type: Number
    },
    stopLossPercentage: {
        type: Number
    },
    trailingStopLossPercentage : {
        type: Number
    },
    isPumpToken: {
        type: Boolean
    },
    status: {
        type: Boolean
    }
    }

);

const User = mongoose.model("User", userSchema);

module.exports = User;
