// Pool model
const mongoose = require('mongoose');
const Schema = mongoose.Schema;

// Create the schema
const SolanaPoolSchema = new Schema({
    pool_address: { type: String, required: true, unique: true },
    pool_creator: { type: String, required: true },
    pool_base_mint: { type: String, required: true },
    pool_quote_mint: { type: String, required: true },
    pool_lp_mint: { type: String, required: true },
    pool_bump: { type: Number, required: true },
    pool_index: { type: Number, required: true },
    pool_discriminator: { type: String, required: true },
});

// Create the model
const SolanaPoolModel = mongoose.model('SolanaPool', SolanaPoolSchema);

module.exports = SolanaPoolModel;
