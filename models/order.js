const mongoose = require("mongoose");
const Schema = mongoose.Schema;

const orderSchema = new Schema({
    chatId: {
        type: String,
        required: true
    },
    tokenAddress: {
        type: String,
        required: true
    },
    poolAddress: {
        type: String,
        required: true
    },
    privateKey: {
        type: String,
        required: true
    },
    tokenPrice: {
        type: Number,
        required: true
    },
    status: {
        type: String,
        required: true
    },
    isPumpToken: {
        type: Boolean,
    },
    previousPrice: {
        type: Number,
    }
});

const Order = mongoose.model("Order", orderSchema);

module.exports = Order;
