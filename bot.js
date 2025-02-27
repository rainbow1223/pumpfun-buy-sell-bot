const TelegramBot = require('node-telegram-bot-api')
require('dotenv').config()

console.log(process.env.TG_BOT_API_KEY)
const bot = new TelegramBot(process.env.TG_BOT_API_KEY, { polling: true })
// TG_BOT.on('polling_error', (msg) => console.error(msg))

module.exports = {
  bot
}