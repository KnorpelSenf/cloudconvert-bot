require('dotenv').load();
const assert = require('assert');
const fs = require('fs');
const cloudconvert = new (require('cloudconvert'))(process.env.CLOUD_CONVERT_API_TOKEN);
const MongoClient = require('mongodb').MongoClient;

const Slimbot = require('slimbot');
const slimbot = new Slimbot(process.env.BOT_API_TOKEN);

const config = require('./botconfig');
const devconfig = require('./devbotconfig');

// Connection URL
const url = 'mongodb://bot:' + process.env.MONGO_DB_PASSWORD + '@ds255403.mlab.com:55403/cloudconvert-bot';

// Database Name
const dbName = 'cloudconvert-bot';

// Create a new MongoClient
const client = new MongoClient(url, { useNewUrlParser: true });

// Use connect method to connect to the Server
client.connect(err => {
  assert.equal(null, err);
  console.log("Connected successfully to server");

  const db = client.db(dbName);

  db.collection('test').find().toArray().then(docs => debugLog(docs));

  client.close();
});

// prevent zeit.co from restarting the bot
require('http').createServer().listen(3000);

// Register listeners
slimbot.on('message', message => {
    let chat = message.chat;
    let chatId = chat.id;
    let chatType = chat.type;

    if (chatType === 'channel')
        return;

    if (message.hasOwnProperty('text')) {
        
        let text = message.text;
        
        if (message.hasOwnProperty('entities') && message.entities[0].type === 'bot_command') {
            handleCommand(chatId, chatType, text);
        } else {
            handleText(chatId, chatType, text);
        }

    } else if (message.hasOwnProperty('document')) {
        
        let doc = message.document;
        
        handleFile(chatId, chatType, doc.file_id, doc.file_name);
        
    } else if (chatType === 'group' || chatType === 'supergroup') {
        // skip service messages
        return;
    } else {
        response = 'Im still under development. Stay tuned!';
    }

    if (chatType !== 'channel')
        slimbot.sendMessage(message.chat.id, response, params);
});

// wait for messages
slimbot.startPolling();

function handleCommand(chatId, chatType, command) {
    let response;
    if (txt.startsWith('/start') || txt.startsWith('/help'))
        response = config.helpmsg;
    else if (txt.startsWith('/feedback'))
        response = 'Like this bot? Hit this link and rate it!\n\
https://telegram.me/storebot?start=cloud_convert_bot';
    else
        response = 'Unknown command. Try /help';
    slimbot.sendMessage(chatId, response, { parseMode: 'html' });
}

function handleText(chatId, chatType, text) {
    slimbot.sendMessage(chatId, 'Send me a file to convert it!');
}

function handleFile(chatId, chatType, fileId, fileName) {

    client.connect(err => {
        if (err) debugLog(err); else {
            const db = client.db(dbName);
            db.collection('tasks').findOne(doc => slimbot.sendMessage(chatId, JSON.stringify(doc)));
        }
        client.close();
    });
    
// Use connect method to connect to the Server
  assert.equal(null, err);
  console.log("Connected successfully to server");


  db.collection('test').find().toArray().then(docs => console.log(docs));

  client.close();
}

function convertFile(chatId, chatType, fileId, from, to) {
    slimbot.getFile(fileId).then(response => {
    let url = 'https://api.telegram.org/file/bot' + process.env.BOT_API_TOKEN + '/' + response.result.file_path;
    cloudconvert.createProcess({
        "inputformat": from,
        "outputformat": to
    }, (err, process) => {
    if (err) debugLog(err); else
    process.start({
        "input": "download",
        "file": url,
        "outputformat": to,
        "email": true
    }, (err, process) => {
    if (err) debugLog(err); else
    process.wait((err, process) => {
    if (err) debugLog(err); else {
    let path = '/tmp/' + fileId + '.' + to;
    process.download(fs.createWriteStream(path), null, (err, process) => {
    if (err) debugLog(err); else
    slimbot.sendDocument(chatId, fs.createReadStream(path), {
        reply_to_message_id: message.message_id
    }).then(message => fs.unlink(path)); // sendDocument end
    }); // download end
    }}); // wait end
    }); // start end
    }); // create end
    }); // getFile end
}

function debugLog(err) {
    slimbot.sendMessage(1001218552688, '<code>' + JSON.stringify(err) + '</code>', { parseMode: 'html' });
}

