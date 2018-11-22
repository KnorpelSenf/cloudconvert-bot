require('dotenv').config();
const http = require('http');
const https = require('https');
const assert = require('assert');
const fs = require('fs');
const cloudconvert = new (require('cloudconvert'))(process.env.CLOUD_CONVERT_API_TOKEN);
const MongoClient = require('mongodb').MongoClient;

const Slimbot = require('slimbot');
const slimbot = new Slimbot(process.env.BOT_API_TOKEN);

// Bot information
var botId;
var botName;
var isDevBot;

const config = require('./botconfig');

// Connection URL
const url = 'mongodb://bot:' + process.env.MONGO_DB_PASSWORD + '@ds255403.mlab.com:55403/cloudconvert-bot';

// Database Name
const dbName = 'cloudconvert-bot';
var db;

// Create a new MongoClient
const client = new MongoClient(url, { useNewUrlParser: true });

// Use connect method to connect to the Server
client.connect(err => {
    assert.equal(null, err);
    console.log("Connected successfully to server");
    
    db = client.db(dbName);
    
    db.collection('tasks').countDocuments().then(c => console.log('Number of used chats: ' + c));
    
    slimbot.getMe().then(response => {
        botId = response.result.id;
        botName = response.result.username;
        isDevBot = false; // response.result.username.indexOf('dev') >= 0;
        // wait for messages
        console.log('Start polling at ' + new Date());
        slimbot.startPolling();
    });
    
    // client.close();
});

// Prevent zeit.co from restarting the bot
http.createServer().listen(3000);

// Register listeners
slimbot.on('message', message => {
    let chat = message.chat;
    let chatId = chat.id;
    let chatType = chat.type;
    let messageId = message.message_id;

    if (message.hasOwnProperty('new_chat_members')) {
        
        let botWasAdded = message.new_chat_members.some(user => user.id === botId);
        if (botWasAdded) {
            registerChat(chatId);
        }
        
    } else if (message.hasOwnProperty('left_chat_member')) {
    
        let botWasRemoved = message.left_chat_member.id === botId;
        if (botWasRemoved) {
            unregisterChat(chatId);
        }
    
    } else if (message.hasOwnProperty('text')) {
        
        let text = message.text;
        
        if (message.hasOwnProperty('entities') && message.entities[0].type === 'bot_command'
                && (text.indexOf('@') < 0 || text.endsWith(botName))) {
            handleCommand(chatId, chatType, messageId, text);
        } else {
            handleText(chatId, chatType, messageId, text);
        }

    } else if (message.hasOwnProperty('document')) {
        
        let doc = message.document;
        
        handleFile(chatId, chatType, messageId, doc.file_id, doc.file_name);
        
    }

});

function handleCommand(chatId, chatType, messageId, command) {
   let response;
   if (command.startsWith('/start')) {
        registerChat(chatId);
        response = config.helpmsg;
    } else if (command.startsWith('/help'))
        response = config.helpmsg;
    else if (command.startsWith('/feedback'))
        response = 'Like this bot? Hit this link and rate it!\n\
https://telegram.me/storebot?start=cloud_convert_bot';
    else if (command.startsWith('/balance')) {
        https.get('https://api.cloudconvert.com/user?apikey=' + process.env.CLOUD_CONVERT_API_TOKEN, res => {
            let data = '';
            res.on('data', chunk => data += chunk);
            res.on('end', () => {
                let response = JSON.parse(data);
                let balance = response.minutes;
                slimbot.sendMessage(chatId, balance + ' conversion minutes remaining.');
            });
        }).on("error", err => debugLog(err));
    } else {
        let atIndex = command.indexOf('@');
        if (atIndex >= 0)
            command = command.substring(1, atIndex);
        else
            command = command.substring(1);
        let to = command.replace('/_/g', '.');
        let chatFilter = { _id: chatId };
        db.collection('tasks').findOne(chatFilter, (err, doc) => {
        if (err) debugLog(err); else {
            let fileId, fileName;
            if (doc && doc.hasOwnProperty('task')) {
                let task = doc.task;
                if (task.hasOwnProperty('file_id')) {
                    fileId = task.file_id;
                }
                if (task.hasOwnProperty('file_name')) {
                    fileName = task.file_name;
                }
            }
            if (fileId && fileName) {
                let from = getExtension(fileName);
                convertFile(chatId, chatType, messageId, fileId, fileName, from, to);
            } else {
                let update = { 'task': { 'to': to } };
                db.collection('tasks').updateOne(chatFilter, { $set: update }, null, err => { if (err) debugLog(err); });
                slimbot.sendMessage(chatId, 'Alright, now send me a file to be converted to ' + to + '!');
            }
        }
        });
    }
    if (response)
        slimbot.sendMessage(chatId, response, { parseMode: 'html' });
}

function handleText(chatId, chatType, messageId, text) {
    if (chatType === 'private') {
        slimbot.sendMessage(chatId, 'Send me a file to convert it!');
    }
}

function handleFile(chatId, chatType, messageId, fileId, fileName) {

    let chatFilter = { _id: chatId };
    db.collection('tasks').findOne(chatFilter, (err, doc) => {
    if (err) debugLog(err); else {
        let to;
        if (doc && doc.hasOwnProperty('task')) {
            let task = doc.task;
            if (task.hasOwnProperty('to')) {
                to = task.to;
            }
        }
        let from = getExtension(fileName);
        if (to) {
            convertFile(chatId, chatType, messageId, fileId, fileName, from, to);
        } else {
            let update = { 'task': { 'file_id': fileId, 'file_name': fileName } };
            db.collection('tasks').updateOne(chatFilter, { $set: update }, null, err => { if (err) debugLog(err); });
            https.get('https://api.cloudconvert.com/conversiontypes?inputformat=' + from, res => {
                let data = '';
                res.on('data', chunk => data += chunk);
                res.on('end', () => {
                    let formats = JSON.parse(data);
                    showConversionOptions(chatId, chatType, messageId, from, formats);
                });
            }).on("error", err => debugLog(err));
        }
    }
    });

}

function convertFile(chatId, chatType, messageId, fileId, fileName, from, to) {
    
    let chatFilter = { _id: chatId };
    let update = { 'task': { } };
    db.collection('tasks').updateOne(chatFilter, { $set: update }, null, err => { if (err) debugLog(err); });
    
    if (isDevBot) {
        slimbot.sendMessage(chatId, '[conversion skipped for debug purpose]', { reply_to_message_id: messageId });
        return;
    }
    
    slimbot.sendMessage(chatId, String.fromCodePoint(0x1f914), {
        reply_to_message_id: messageId
    }).then(statusMessage => {
    slimbot.getFile(fileId).then(response => {
    let url = 'https://api.telegram.org/file/bot' + process.env.BOT_API_TOKEN + '/' + response.result.file_path;
    let cloudconvertOutput = (to === 'animation' ? 'gif' : to);
    cloudconvert.createProcess({
        "inputformat": from,
        "outputformat": cloudconvertOutput
    }, (err, process) => {
    if (err) debugLog(err); else
    process.start({
        "input": "download",
        "file": url,
        "outputformat": cloudconvertOutput,
        "email": true
    }, (err, process) => {
    if (err) debugLog(err); else
    process.wait((err, process) => {
    if (err) debugLog(err); else {
    let path = '/tmp/' + fileName + '.' + cloudconvertOutput;
    process.download(fs.createWriteStream(path), null, (err, process) => {
    if (err) debugLog(err); else {
    slimbot.sendChatAction(chatId, 'upload_document');
    let file = fs.createReadStream(path);
    let replyOption = { reply_to_message_id: messageId };
    slimbot.deleteMessage(chatId, statusMessage.result.message_id);
    slimbot.sendDocument(chatId, file, replyOption).then(message =>
    fs.unlink(path, err => {
    if (err) debugLog(err); else if (to === 'animation') {
        slimbot.sendAnimation(chatId, file, replyOption).then(callback);
    
    } // unlink end
    }));
    }}); // download end
    }}); // wait end
    }); // start end
    }); // create end
    }); // getFile end
    }); // sendMessage end
}

function showConversionOptions(chatId, chatType, messageId, from, formats) {
    let categories = formats.map(f => f.group).reduce((a, b) => {
        if (a.indexOf(b) < 0)
            a.push(b);
        return a;
    },[]);
    let message = 'Awesome! I can convert this to:\n'
        + categories.map(c =>
              '<b>' + c + '</b>\n'
              + formats.filter(f => f.group === c)
                       .filter(f => f.outputformat !== from) // we cannot set conversion parameters so this would be useless
                       .map(f => '/' + f.outputformat
                                        .replace(/ /g, "_")
                                        .replace(/\./g, '_') + ' (<i>' + f.outputformat + '</i>)')
                       .join('\n')
          ).join('\n\n');
    slimbot.sendMessage(chatId, message, { parse_mode: 'html' });
}

function registerChat(chatId) {
    let chatFilter = { _id: chatId };
    let collection = db.collection('tasks');
    collection.deleteOne(chatFilter, null, (err, res) =>
    collection.insertOne({ _id: chatId, task: { }, auto: [] }, null, (err, res) =>
    collection.countDocuments().then(c => debugLog('Add! Number of used chats: ' + c))));
}

function unregisterChat(chatId) {
    let collection = db.collection('tasks');
    collection.deleteOne({ _id: chatId }, null, (err, res) =>
    collection.countDocuments().then(c => debugLog('Remove! Number of used chats: ' + c)));
}

function debugLog(err) {
    slimbot.sendMessage(-1001218552688, '<pre>' + JSON.stringify(err) + '</pre>', { parse_mode: 'html' });
}

function getExtension(fileName) {
    let re = /(?:\.([^.]+))?$/; // extract file extension, see https://stackoverflow.com/a/680982
    return re.exec(fileName)[1];
}
