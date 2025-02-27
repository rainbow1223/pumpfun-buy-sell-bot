const mongoose = require('mongoose');
const { Schema } = mongoose;

const tokenSchema = new Schema({
  address: {
    type: String,
    unique: true,
    required: true
  },
  name: {
    type: String,
    required: true
  },
  symbol: {
    type: String,
    required: true
  },
  decimals: {
    type: Number,
    required: true
  },
  programId: {
    type: String,
    required: true
  },
  tax: {
    type: Number,
    required: false
  },
  cirSupply: {
    type: String,
    required: false
  },
  totSupply: {
    type: String,
    required: true
  },
  IDL: {
    type: String,
    required: false
  }
}, {
  timestamps: true // This will add createdAt and updatedAt timestamps
});

const Token = mongoose.model('Token', tokenSchema);

module.exports = Token;
