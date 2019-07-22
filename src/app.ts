// enable environment vars
require('dotenv').config();

// Prevent zeit.co from restarting the bot
require('https').createServer().listen(3000);

import Bot from './bot/bot';

let bot: Bot = new Bot();
try {
    bot.start();
} catch (e) {
    console.error("Failed to start: " + e);
}

console.log('Bot started.');
