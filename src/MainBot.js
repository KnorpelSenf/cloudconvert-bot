require('dotenv').config();
const http = require('http');
const https = require('https');
const assert = require('assert');
const fs = require('fs');
const cloudconvert = new (require('cloudconvert'))(process.env.CLOUD_CONVERT_API_TOKEN);
const MongoClient = require('mongodb').MongoClient;

const Slimbot = require('slimbot');
const slimbot = new Slimbot(process.env.BOT_API_TOKEN);

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
    
    // wait for messages
    slimbot.startPolling();
    // client.close();
});

// prevent zeit.co from restarting the bot
http.createServer().listen(3000);

// Register listeners
slimbot.on('message', message => {
    let chat = message.chat;
    let chatId = chat.id;
    let chatType = chat.type;
    let messageId = message.message_id;

    if (message.hasOwnProperty('text')) {
        
        let text = message.text;
        
        if (message.hasOwnProperty('entities') && message.entities[0].type === 'bot_command') {
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
        registerUser(chatId);
        response = config.helpmsg;
    } else if (command.startsWith('/help'))
        response = config.helpmsg;
    else if (command.startsWith('/feedback'))
        response = 'Like this bot? Hit this link and rate it!\n\
https://telegram.me/storebot?start=cloud_convert_bot';
    else {
        let to = command.substring(1).replace('/_/g', '.');
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
                let update = { 'task': { 'file_id': fileId, 'file_name': fileName, 'from': undefined, 'to': to } };
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
    slimbot.sendMessage(chatId, 'Send me a file to convert it!');
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
            let update = { 'task': { 'file_id': fileId, 'file_name': fileName, 'from': from, 'to': to } };
            db.collection('tasks').updateOne(chatFilter, { $set: update }, null, err => { if (err) debugLog(err); });
            https.get('https://api.cloudconvert.com/conversiontypes?inputformat=' + from, res => {
                let data = '';
                res.on('data', chunk => data += chunk);
                res.on('end', () => {
                    let formats = JSON.parse(data);
                    showConversionOptions(chatId, chatType, messageId, from, formats);
                });
            }).on("error", err => {
                debugLog("Error: " + err.message);
            });
        }
    }
    });

}

function convertFile(chatId, chatType, messageId, fileId, fileName, from, to) {
    slimbot.sendMessage(chatId, 'I\'m on it! This may take a few seconds or even some minutes, depending on the file size. Plus, I am not in a hurry today ...', {
        reply_to_message_id: messageId
    }).then(statusMessage => {
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
    let path = '/tmp/' + fileName + '.' + to;
    slimbot.deleteMessage(chatId, statusMessage.result.message_id);
    slimbot.sendChatAction(chatId, 'upload_document');
    process.download(fs.createWriteStream(path), null, (err, process) => {
    if (err) debugLog(err); else {
    slimbot.sendChatAction(chatId, 'upload_document');
    slimbot.sendDocument(chatId, fs.createReadStream(path), {
        reply_to_message_id: messageId
    }).then(message => 
    fs.unlink(path, err => {
    if (err) debugLog(err);
    }) // unlink end
    ); // sendDocument end
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
                       .filter(f => f.outputformat !== from)
                       .map(f => '/' + f.outputformat
                                        .replace(/ /g, "_")
                                        .replace(/\./g, '_') + ' (<i>' + f.outputformat + '</i>)')
                       .join('\n')
          ).join('\n\n');
    slimbot.sendMessage(chatId, message, { parse_mode: 'html' });
}

function registerUser(chatId) {
    let chatFilter = { _id: chatId };
    db.collection('tasks').deleteOne(chatFilter, null, (err, res) =>
    db.collection('tasks').insertOne(
        {
            _id: chatId,
            task: {
                file_id: undefined,
                file_name: undefined,
                from: undefined,
                to: undefined
            }
        },
        {
            upsert: true
        })
    );
}

function debugLog(err) {
    slimbot.sendMessage(-1001218552688, '<pre>' + JSON.stringify(err) + '</pre>', { parse_mode: 'html' });
}

function getExtension(fileName) {
    let re = /(?:\.([^.]+))?$/; // extract file extension, see https://stackoverflow.com/a/680982
    return re.exec(fileName)[1];
}
