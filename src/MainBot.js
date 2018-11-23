require('dotenv').config();
const https = require('https');
const assert = require('assert');
const MongoClient = require('mongodb').MongoClient;
const fs = require('fs');
const path = require('path');
const cloudconvert = new (require('cloudconvert'))(process.env.CLOUD_CONVERT_API_TOKEN);

const helpmsg = "Hi there!\nI can help you convert anything to anything! \
I connect to www.cloudconvert.com to do this. Just send me a file and I will \
tell you everything I can do with it! Most likely you're gonna get done \
whatever you want to get done.\n\nTelegram restricts bots (like me) to send \
and receive files with more than 20 MB in size. This means that you will \
have to visit the website yourself if you need to convert larger files.";

// Prevent zeit.co from restarting the bot
https.createServer().listen(3000);

const Slimbot = require('slimbot');
const slimbot = new Slimbot(process.env.BOT_API_TOKEN);

var botId;
var botName;
var isDevBot;

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
    console.log("Connected successfully to database server");

    db = client.db(dbName);

    db.collection('tasks').countDocuments().then(c => console.log('Number of used chats: ' + c));

    slimbot.getMe().then(response => {
        let result = response.result;
        botId = result.id;
        botName = result.username;
        isDevBot = botName.indexOf('dev') >= 0;
        // wait for messages
        console.log('Start polling at ' + new Date());
        slimbot.startPolling();
    });

    // client.close();
});

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
            slimbot.sendMessage(chatId, 'Hi there!\nHit /help for an introduction or contact @KnorpelSenf if you have any questions.');
        }

    } else if (message.hasOwnProperty('left_chat_member')) {

        let botWasRemoved = message.left_chat_member.id === botId;
        if (botWasRemoved) {
            unregisterChat(chatId);
        }

    } else if (message.hasOwnProperty('text')) {

        let text = message.text;
        let options = {};

        if (message.hasOwnProperty('reply_to_message')) {
            let reply = message.reply_to_message;
            let file = ['audio',
                'document',
                'photo',
                'video',
                'voice',
                'video_note']
                .map(p => reply[p])
                .find(p => p !== undefined);
            if (file) {
                let fileId = file.file_id;
                if (fileId) {
                    options.file_id = fileId;
                }
            }
        }

        if (message.hasOwnProperty('entities') && message.entities[0].type === 'bot_command'
            && (text.indexOf('@') < 0 || text.endsWith(botName))) {
            handleCommand(chatId, chatType, messageId, text, options);
        } else {
            handleText(chatId, chatType, messageId, text, options);
        }

    } else {
        let file = ['audio',
            'document',
            'photo',
            'video',
            'voice',
            'video_note']
            .map(p => message[p])
            .find(p => p !== undefined);
        let fileId = file.file_id;
        if (fileId) {

            let command;
            if (message.hasOwnProperty('reply_to_message')) {
                let reply = message.reply_to_message;
                if (reply.hasOwnProperty('text')) {
                    let text = reply.text;
                    if (reply.hasOwnProperty('entities')
                        && reply.entities[0].type === 'bot_command'
                        && (text.indexOf('@') < 0 || text.endsWith(botName))) {
                        command = text;
                    }
                }
            } else if (message.hasOwnProperty('caption')) {
                let caption = message.caption;
                if (message.hasOwnProperty('caption_entities')
                    && message.caption_entities[0].type === 'bot_command'
                    && (caption.indexOf('@') < 0 || caption.endsWith(botName))) {
                    command = caption;
                }
            }
            if (command) {
                let atIndex = command.indexOf('@');
                if (atIndex >= 0)
                    command = command.substring(1, atIndex);
                else
                    command = command.substring(1);
                let to = command.replace('/_/g', '.');
                convertFile(chatId, chatType, messageId, fileId, to);
            } else {
                handleFile(chatId, chatType, messageId, fileId);
            }
        }
    }

});

slimbot.on('callback_query', query => {
    let data = JSON.parse(query.data);
    if (data) {
        let message = query.message;
        let chatId = message.chat.id;
        let messageId = message.message_id;
        let conversion = {
            from: data.from,
            to: data.to
        };
        let chatFilter = { _id: chatId };
        let element = { auto: conversion };
        let update;
        if (data.auto) {
            update = { $pull: element };
        } else {
            update = { $addToSet: element };
        }
        db.collection('tasks').updateOne(chatFilter, update, null, err => {
            if (err) debugLog(err); else {
                slimbot.answerCallbackQuery(query.id, { text: 'Saved.' });
                slimbot.editMessageReplyMarkup(chatId, messageId, buildReplyMarkup(conversion, !data.auto));
            }
        });
    }
});

function handleCommand(chatId, chatType, messageId, command, options) {
    let response;
    if (command.startsWith('/start')) {
        registerChat(chatId);
        response = helpmsg;
    } else if (command.startsWith('/help'))
        response = helpmsg;
    else if (command.startsWith('/feedback'))
        response = 'Like this bot? Hit this link and rate it!\nhttps://telegram.me/storebot?start=cloud_convert_bot';
    else if (command.startsWith('/balance')) {
        https.get('https://api.cloudconvert.com/user?apikey=' + process.env.CLOUD_CONVERT_API_TOKEN, res => {
            let data = '';
            res.on('data', chunk => data += chunk);
            res.on('end', () => {
                let response = JSON.parse(data);
                let balance = response.minutes;
                slimbot.sendMessage(chatId, 'Remaining conversion minutes: <b>' + balance + '</b>', { parse_mode: 'html' });
            });
        }).on("error", err => debugLog(err));
    } else if (command.startsWith('/convert')) {
        if (options.hasOwnProperty('file_id')) {
            let fileId = options.file_id;
            let chatFilter = { _id: chatId };
            let update = { 'task': { 'file_id': fileId } };
            db.collection('tasks').updateOne(chatFilter, { $set: update }, null, err => { if (err) debugLog(err); });
            findConversionOptionsByFileId(chatId, chatType, messageId, fileId);
        } else {
            slimbot.sendMessage(chatId, 'Use this command when responding to a file! \
I will then list all possible conversions for that.');
        }
    } else {
        let atIndex = command.indexOf('@');
        if (atIndex >= 0)
            command = command.substring(1, atIndex);
        else
            command = command.substring(1);
        let to = command.replace('/_/g', '.');
        let chatFilter = { _id: chatId };
        if (options.hasOwnProperty('file_id')) {
            let fileId = options.file_id;
            convertFile(chatId, chatType, messageId, fileId, to);
        } else {
            db.collection('tasks').findOne(chatFilter, (err, doc) => {
                if (err) debugLog(err); else {
                    let fileId;
                    if (doc && doc.hasOwnProperty('task')) {
                        let task = doc.task;
                        if (task.hasOwnProperty('file_id')) {
                            fileId = task.file_id;
                        }
                    }
                    if (fileId) {
                        convertFile(chatId, chatType, messageId, fileId, to);
                    } else {
                        let update = { 'task': { 'to': to } };
                        db.collection('tasks').updateOne(chatFilter, { $set: update }, null, err => { if (err) debugLog(err); });
                        slimbot.sendMessage(chatId, 'Alright, now send me a file to be converted to ' + to + '!');
                    }
                }
            });
        }
    }
    if (response) slimbot.sendMessage(chatId, response, { parseMode: 'html' });
}

function handleText(chatId, chatType, messageId, text) {
    if (chatType === 'private') {
        slimbot.sendMessage(chatId, 'Send me a file to convert it!');
    }
}

function handleFile(chatId, chatType, messageId, fileId) {

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
            if (to) {
                convertFile(chatId, chatType, messageId, fileId, to);
            } else {
                let update = { 'task': { 'file_id': fileId } };
                let collection = db.collection('tasks');
                collection.updateOne(chatFilter, { $set: update }, null, err => { if (err) debugLog(err); });
                slimbot.getFile(fileId).then(response => {
                    let from = getExtension(response.result.file_path);
                    chatFilter['auto.from'] = from;
                    let projection = {
                        auto: {
                            $elemMatch: { from: from }
                        }
                    };
                    collection.findOne(chatFilter, { projection: projection }, (err, doc) => {
                        if (err) debugLog(err); else {
                            if (doc && doc.hasOwnProperty('auto') && doc.auto[0].hasOwnProperty('to')) {
                                let to = doc.auto[0].to;
                                convertFile(chatId, chatType, messageId, fileId, to);
                            } else if (chatType === 'private') {
                                findConversionOptions(chatId, chatType, messageId, from);
                            }
                        }
                    });
                });
            }
        }
    });

}

function convertFile(chatId, chatType, messageId, fileId, to) {

    let chatFilter = { _id: chatId };
    let update = { 'task': {} };
    db.collection('tasks').updateOne(chatFilter, { $set: update }, null, err => { if (err) debugLog(err); });

    if (isDevBot) {
        slimbot.sendMessage(chatId, '[conversion skipped for debug purpose]', { reply_to_message_id: messageId });
        slimbot.sendMessage(chatId, 'Would have converted in chat ' + chatId
            + ' of type ' + chatType
            + ' for message ' + messageId
            + ' file ' + fileId
            + ' to ' + to);
        return;
    }

    slimbot.sendMessage(chatId, String.fromCodePoint(0x1f914), {
        reply_to_message_id: messageId
    }).then(statusMessage => {
        slimbot.getFile(fileId).then(response => {
            let filePath = response.result.file_path;
            let from = getExtension(filePath);
            let url = 'https://api.telegram.org/file/bot' + process.env.BOT_API_TOKEN + '/' + filePath;
            cloudconvert.createProcess({
                "inputformat": from,
                "outputformat": to
            }, (err, process) => {
                if (err) debugLog(err); else {
                    process.start({
                        "input": "download",
                        "file": url,
                        "outputformat": to,
                        "email": true
                    }, (err, process) => {
                        if (err) debugLog(err); else {
                            let conversion = {
                                from: from,
                                to: to
                            };
                            db.collection('tasks').findOne({
                                _id: chatId,
                                auto: conversion
                            }, null, (err, doc) => {
                                if (err) debugLog(err); else {
                                    let options = {
                                        reply_to_message_id: messageId,
                                        reply_markup: buildReplyMarkup(conversion, doc ? true : false)
                                    };
                                    process.wait((err, process) => {
                                        if (err) debugLog(err); else {
                                            let tmpPath = '/tmp/' + path.basename(filePath, from) + '.' + to;
                                            process.download(fs.createWriteStream(tmpPath), null, err => {
                                                if (err) debugLog(err); else {
                                                    slimbot.sendChatAction(chatId, 'upload_document');
                                                    let file = fs.createReadStream(tmpPath);
                                                    slimbot.deleteMessage(chatId, statusMessage.result.message_id);
                                                    slimbot.sendDocument(chatId, file, options).then(() => fs.unlink(tmpPath, err => {
                                                        if (err)
                                                            debugLog(err);
                                                    }));
                                                }
                                            });
                                        }
                                    });
                                }
                            });
                        }
                    });
                }
            });
        });
    });
}

function buildReplyMarkup(conversion, auto) {
    let buttonText = 'auto-convert ' + conversion.from
        + ' to ' + conversion.to + ': '
        + (auto ? String.fromCodePoint(0x2705) : String.fromCodePoint(0x274c));
    conversion.auto = auto;
    return JSON.stringify({
        inline_keyboard: [[
            {
                text: buttonText,
                callback_data: JSON.stringify(conversion)
            }
        ]]
    });
}

function findConversionOptionsByFileId(chatId, chatType, messageId, fileId) {
    slimbot.getFile(fileId).then(response => {
        let from = getExtension(response.result.file_path);
        findConversionOptions(chatId, chatType, messageId, from);
    });
}

function findConversionOptions(chatId, chatType, messageId, from) {
    https.get('https://api.cloudconvert.com/conversiontypes?inputformat=' + from, res => {
        let data = '';
        res.on('data', chunk => data += chunk);
        res.on('end', () => {
            let formats = JSON.parse(data);
            showConversionOptions(chatId, chatType, messageId, from, formats);
        });
    }).on("error", err => debugLog(err));
}

function showConversionOptions(chatId, chatType, messageId, from, formats) {
    let categories = formats.map(f => f.group).reduce((a, b) => {
        if (a.indexOf(b) < 0)
            a.push(b);
        return a;
    }, []);
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
    let options = { parse_mode: 'html' };
    if (chatType !== 'private') {
        options.reply_to_message_id = messageId;
    }
    slimbot.sendMessage(chatId, message, options);
}

function getExtension(fileName) {
    let re = /(?:\.([^.]+))?$/; // extract file extension, see https://stackoverflow.com/a/680982
    return re.exec(fileName)[1];
}

function registerChat(chatId) {
    let chatFilter = { _id: chatId };
    let collection = db.collection('tasks');
    collection.deleteOne(chatFilter, null, () =>
        collection.insertOne({ _id: chatId, task: {}, auto: [] }, null, () =>
            collection.countDocuments().then(c => debugLog('Add! Number of used chats: ' + c))));
}

function unregisterChat(chatId) {
    let collection = db.collection('tasks');
    collection.deleteOne({ _id: chatId }, null, () =>
        collection.countDocuments().then(c => debugLog('Remove! Number of used chats: ' + c)));
}

function debugLog(err) {
    console.log(err);
    slimbot.sendMessage(-1001218552688, '<pre>' + JSON.stringify(err) + '</pre>', { parse_mode: 'html' });
}