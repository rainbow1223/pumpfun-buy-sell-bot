const mongoose = require('mongoose');
const { Schema } = mongoose;

const poolSchema = new Schema({
  address: {
    type: String,
    unique: true,
    required: true
  },
  baseMint: {
    type: String,
    required: true
  },
  quoteMint: {
    type: String,
    required: true
  },
  baseDecimal: {
    type: Number,
    required: true
  },
  quoteDecimal: {
    type: Number,
    required: true
  },
  baseVault: {
    type: String,
    required: true
  },
  quoteVault: {
    type: String,
    required: true
  },
  marketId: {
    type: String,
    required: true
  },
  marketProgramId: {
    type: String,
    required: true
  },
  dex: {
    type: String,
    required: true
  },
  lpMint: {
    type: String,
    required: false
  },
  lpVault: {
    type: String,
    required: false
  },
  openTime: {
    type: Number,
    required: false
  },
  authority: {
    type: String,
    required: true
  },
}, {
  timestamps: true // This will add createdAt and updatedAt timestamps
});

const Pool = mongoose.model('Pool', poolSchema);

module.exports = Pool;
