// index.js (or your main file)
const pumpfun = require('./pumpfun');
const util = require('./util');
const types = require('./types');
const events = require('./events');
const globalAccount = require('./globalAccount');
const bondingCurveAccount = require('./bondingCurveAccount');
const amm = require('./amm');

// Spread all exports from each module
module.exports = {
  ...pumpfun,
  ...util,
  ...types,
  ...events,
  ...globalAccount,
  ...bondingCurveAccount,
  ...amm
};
