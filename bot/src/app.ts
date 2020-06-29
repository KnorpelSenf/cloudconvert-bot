// enable environment vars
import { config } from 'dotenv'
config()

import d from 'debug'
import Bot from './bot/bot'

const debug = d('app')

const bot = new Bot()
try {
    bot.start().then(() => debug('Bot started.'))
} catch (e) {
    debug('Failed to start: ' + e)
}
