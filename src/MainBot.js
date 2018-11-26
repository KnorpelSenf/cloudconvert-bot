require('dotenv').config();
const https = require('https');
const assert = require('assert');
const MongoClient = require('mongodb').MongoClient;
const fs = require('fs');
const path = require('path');

const helpmsgPrivate = '<b>Hi there!</b>\nI can help you convert anything to anything! \
I connect to www.cloudconvert.com to do this. Just send me a file and I will tell \
you everything I can do with it!\n\n\
\
Telegram restricts bots (like me) to send and receive files with more than 20 MB \
in size. This means that you will have to visit the website yourself if you need \
to convert larger files.\n\n\
\
You have up to 25 conversions per day for free. Type /balance to find out more.';

const helpmsgGroups = '<b>Hi there!</b>\nMy name is Cloud Convert Bot and I can help you \
with file conversions of any kind! Respond to any file in this group with /convert and \
I will list the possible conversions. (You can also send the format directly, e. g. /mp4. \
Just make sure to <i>respond</i> to the file. Or just send the command directly as a \
caption!)\n\n\
To activate auto-conversions for a file type, hit the button under a converted file.';

const helpmsgBalance = 'All users of this bot share a common pool of 25 conversions per day. \
You can check the balance with /balance.\n\n\
You can <b>claim your own extra 25 free conversions per day</b>! No one else will be able to \
impact this counter. You will not have to pay anything for this and it works entirely \
without witchcraft. All you need to do is to follow these three steps:\n\
<b>1)</b> Create your own Cloud Convert account <a href="https://cloudconvert.com/register">here</a>.\n\
<b>2)</b> Visit the <a href="https://cloudconvert.com/dashboard/api">dashboard</a> and copy the API key.\n\
<b>3)</b> Get back to this chat and send /apikey. Paste the API key into this chat.\n\
Now every single operation of this bot will work based on your new Cloud Convert account! \
Resetting the bot with /start clears the API key from the database. This will return you to \
the account shared among all bot users.';

const helpmsgBalanceWithApiKey = 'You have connected your personal Cloud Convert account with this bot! \
You can check its balance with /balance.\n\n\
You connected this bot by providing the following API key (thanks again!):';

const helpmsgBuyMinutes = 'If you need to perform even more conversions, you can buy conversion minutes \
at www.cloudconvert.com. This bot will automatically use them if available. However, please remember \
that this project was created by a single student at Kiel University. Even though I did my best \
to keep this piece of software free of errors and as reliable as possible, I cannot guarantee that \
this bot is <i>not accidentally consuming all of your conversion minutes</i>, killing your kitten or \
the like. It has never happened so far and I consider it highly unlikely, but it is still software, \
so you never know. If you know JavaScript, you can check out the \
<a href="https://github.com/KnorpelSenf/cloudconvert-bot">source code</a> \
to verify that something as bad as this won\'t ever happen.';

const helpmsgAddedToGroup = '<b>Hi there!</b>\nHit /help for an introduction or contact \
@KnorpelSenf if you have any questions.';

const autoConversionSaved = 'Saved.';

const remainingConversions = 'Remaining conversions';

const customApiKeyInstruction = 'Need to perform more conversions? /the_more_the_merrier';

const helpmsgFeedback = 'Like this bot? Hit this link and rate it!\n\
https://telegram.me/storebot?start=cloud_convert_bot';

const sendApiKey = 'Perfect! Now send me the API key!';

const helpmsgConvert = 'Use this command when responding to a file! \
I will then list all possible conversions for that.';

const helpmsgFile = 'Alright, now send me a file to be converted to ';

const helpmsgText = 'Send me a file to convert it!';

const apiKeyProvided = 'Thank you for providing the API key! Your own account is now ready \
and set up. By no longer relying on the default account, you help making the bot more useful \
for everyone out there!';

const unsupportedConversion = 'This conversion is not supported!';
const conversionError = 'The conversion could not be performed. See the details below.';
const unknownError = 'Something went wrong. Sorry for that. You may contact \
@KnorpelSenf because of this.';

// Prevent zeit.co from restarting the bot
https.createServer().listen(3000);

const CloudConvert = require('cloudconvert');
const cloudconvert = new CloudConvert(process.env.CLOUD_CONVERT_API_TOKEN);

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
    console.log('Connected successfully to database server');

    db = client.db(dbName);

    db.collection('tasks').countDocuments().then(c => console.log('Number of used chats: ' + c));

    slimbot.getMe().then(response => {
        let result = response.result;
        botId = result.id;
        botName = result.username;
        isDevBot = false; // botName.indexOf('dev') >= 0;
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
            slimbot.sendMessage(chatId, helpmsgAddedToGroup, { parse_mode: 'html' });
        }

    } else if (message.hasOwnProperty('left_chat_member')) {

        let botWasRemoved = message.left_chat_member.id === botId;
        if (botWasRemoved) {
            unregisterChat(chatId);
        }

    } else if (message.hasOwnProperty('text')) {

        let text = message.text;
        let lowerText = text.toLowerCase();
        let options = {};

        if (message.hasOwnProperty('reply_to_message')) {
            let reply = message.reply_to_message;
            if (reply.text === sendApiKey) {
                saveApiKey(chatId, text);
                return;
            } else {
                let file;
                if (reply.hasOwnProperty('photo')) {
                    file = reply.photo[reply.photo.length - 1];
                } else {
                    file = ['audio',
                        'document',
                        'sticker',
                        'video',
                        'voice',
                        'video_note']
                        .map(p => reply[p])
                        .find(p => p !== undefined);
                }

                if (file) {
                    let fileId = file.file_id;
                    if (fileId) {
                        options.file_id = fileId;
                    }
                }
            }
        }

        if (message.hasOwnProperty('entities') && message.entities[0].type === 'bot_command'
            && (lowerText.indexOf('@') < 0 || lowerText.endsWith(botName))) {
            handleCommand(chatId, chatType, messageId, lowerText, options);
        } else {
            handleText(chatId, chatType, messageId, text, options);
        }

    } else {
        let file;
        if (message.hasOwnProperty('photo')) {
            let photoSizes = message.photo;
            file = photoSizes[photoSizes.length - 1];
        } else {
            file = ['audio',
                'document',
                'sticker',
                'video',
                'voice',
                'video_note']
                .map(p => message[p])
                .find(p => p !== undefined);
        }
        if (file) {
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
        db.collection('tasks').updateOne(chatFilter, update, null, (err, obj) => {
            if (err) debugLog(err); else {
                slimbot.answerCallbackQuery(query.id, { text: autoConversionSaved });
                if (obj && obj.modifiedCount > 0) {
                    conversion.auto = !data.auto;
                    slimbot.editMessageReplyMarkup(chatId, messageId, buildReplyMarkup(conversion));
                }
            }
        });
    }
});

function handleCommand(chatId, chatType, messageId, command, options) {
    if (command.startsWith('/start')) {
        registerChat(chatId);
        slimbot.sendMessage(chatId, helpmsgPrivate, { parse_mode: 'html' });
    } else if (command.startsWith('/help')) {
        let response;
        if (chatType === 'private') {
            response = helpmsgPrivate;
        } else {
            response = helpmsgGroups;
        }
        slimbot.sendMessage(chatId, response, { parse_mode: 'html' });
    } else if (command.startsWith('/balance')) {
        let chatFilter = { _id: chatId };
        db.collection('tasks').findOne(chatFilter, null, (err, doc) => {
            if (err) debugLog(err); else {
                let apiKey = process.env.CLOUD_CONVERT_API_TOKEN;
                if (doc && doc.hasOwnProperty('api_key')) {
                    apiKey = doc.api_key;
                }
                https.get('https://api.cloudconvert.com/user?apikey=' + apiKey, res => {
                    let data = '';
                    res.on('data', chunk => data += chunk);
                    res.on('end', () => {
                        let response = JSON.parse(data);
                        let balance = response.minutes;
                        slimbot.sendMessage(chatId, remainingConversions + ': <b>'
                            + balance + '</b>\n\n' + customApiKeyInstruction, { parse_mode: 'html' });
                    });
                }).on("error", err => { if (err) debugLog(err); });
            }
        });
    } else if (command.startsWith('/the_more_the_merrier')) {
        let chatFilter = { _id: chatId };
        db.collection('tasks').findOne(chatFilter, null, (err, doc) => {
            if (err) debugLog(err); else {
                let response;
                if (doc && doc.hasOwnProperty('api_key')) {
                    response = helpmsgBalanceWithApiKey + '\n<pre>' + doc.api_key + '</pre>\n\n' + helpmsgBuyMinutes;
                } else {
                    response = helpmsgBalance;
                }
                slimbot.sendMessage(chatId, response, { parse_mode: 'html' });
            }
        });
    } else if (command.startsWith('/feedback')) {
        slimbot.sendMessage(chatId, helpmsgFeedback, { parse_mode: 'html' });
    } else if (command.startsWith('/apikey')) {
        let apiKey = command.substring('/apikey'.length).trim();
        if (apiKey.startsWith('@')) {
            apiKey = apiKey.substring(botName.length + 1);
        }
        if (apiKey && apiKey.length > 0) {
            saveApiKey(chatId, apiKey);
        } else {
            slimbot.sendMessage(chatId, sendApiKey, {
                parse_mode: 'html',
                reply_to_message_id: messageId,
                reply_markup: JSON.stringify({ force_reply: true, selective: true })
            });
        }
    } else if (command.startsWith('/convert')) {
        if (options.hasOwnProperty('file_id')) {
            let fileId = options.file_id;
            let chatFilter = { _id: chatId };
            let update = { 'task': { 'file_id': fileId } };
            db.collection('tasks').updateOne(chatFilter, { $set: update }, null, err => { if (err) debugLog(err); });
            findConversionOptionsByFileId(chatId, chatType, messageId, fileId);
        } else {
            slimbot.sendMessage(chatId, helpmsgConvert);
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
                        slimbot.sendMessage(chatId, helpmsgFile + to + '!');
                    }
                }
            });
        }
    }
}

function handleText(chatId, chatType, messageId, text) {
    if (chatType === 'private') {
        slimbot.sendMessage(chatId, helpmsgText);
    }
}

function handleFile(chatId, chatType, messageId, fileId) {
    let chatFilter = { _id: chatId };
    let collection = db.collection('tasks');
    collection.findOne(chatFilter, (err, doc) => {
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
                collection.updateOne(chatFilter, { $set: update }, null, err => { if (err) debugLog(err); });
            }
            slimbot.getFile(fileId).then(response => {
                let from = getExtension(response.result.file_path);
                collection.findOne(chatFilter, { projection: { auto: 1 } }, (err, doc) => {
                    if (err) debugLog(err); else {
                        let converted = false;
                        if (doc && doc.hasOwnProperty('auto')) {
                            let autoConversions = doc.auto.filter(c => c.from === from);
                            if (autoConversions.length > 0) {
                                converted = true;
                                autoConversions.forEach(c => convertFile(chatId, chatType, messageId, fileId, c.to));
                            }
                        }
                        if (!converted && chatType === 'private') {
                            findConversionOptions(chatId, chatType, messageId, from);
                        }
                    }
                });
            });
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
            db.collection('tasks').findOne(chatFilter, { projection: { api_key: 1 } }, (err, doc) => {
                if (err) {
                    slimbot.editMessageText(chatId, statusMessage.result.message_id, unknownError);
                    debugLog(err);
                } else {
                    let cc = cloudconvert;
                    if (doc && doc.hasOwnProperty('api_key')) {
                        cc = new CloudConvert(doc.api_key);
                    }
                    cc.createProcess({
                        "inputformat": from,
                        "outputformat": to
                    }, (err, process) => {
                        if (err) {
                            if (err.code === 400) {
                                slimbot.editMessageText(chatId, statusMessage.result.message_id, unsupportedConversion
                                    + ' (' + from + ' to ' + to + ')');
                            } else {
                                slimbot.editMessageText(chatId, statusMessage.result.message_id, unknownError);
                                debugLog(err);
                            }
                        } else {
                            process.start({
                                "input": "download",
                                "file": url,
                                "outputformat": to
                            }, (err, process) => {
                                if (err) {
                                    if (err.code === 422) {
                                        slimbot.editMessageText(chatId, statusMessage.result.message_id, conversionError
                                            + ' (' + from + ' to ' + to + ')\n\n' + err.message);
                                    } else {
                                        slimbot.editMessageText(chatId, statusMessage.result.message_id, unknownError);
                                        debugLog(err);
                                    }
                                } else {
                                    let conversion = {
                                        from: from,
                                        to: to
                                    };
                                    db.collection('tasks').findOne({
                                        _id: chatId,
                                        auto: conversion
                                    }, null, (err, doc) => {
                                        if (err) {
                                            slimbot.editMessageText(chatId, statusMessage.result.message_id, unknownError);
                                            debugLog(err);
                                        } else {
                                            conversion.auto = doc ? true : false; // used for stats and reply markup
                                            let options = {
                                                reply_to_message_id: messageId,
                                                reply_markup: buildReplyMarkup(conversion)
                                            };
                                            process.wait((err, process) => {
                                                if (err) {
                                                    if (err.code === 422) {
                                                        slimbot.editMessageText(chatId, statusMessage.result.message_id, conversionError
                                                            + ' (' + from + ' to ' + to + ')\n\n' + err.message);
                                                    } else {
                                                        slimbot.editMessageText(chatId, statusMessage.result.message_id, unknownError);
                                                        debugLog(err);
                                                    }
                                                } else {
                                                    let tmpPath = '/tmp/' + path.basename(filePath, from) + '.' + to;
                                                    process.download(fs.createWriteStream(tmpPath), null, err => {
                                                        if (err) {
                                                            slimbot.editMessageText(chatId, statusMessage.result.message_id, unknownError);
                                                            debugLog(err);
                                                        } else {
                                                            slimbot.sendChatAction(chatId, 'upload_document');
                                                            let file = fs.createReadStream(tmpPath);
                                                            slimbot.deleteMessage(chatId, statusMessage.result.message_id);
                                                            slimbot.sendDocument(chatId, file, options).then(() => fs.unlink(tmpPath, err => {
                                                                if (err) {
                                                                    slimbot.editMessageText(chatId, statusMessage.result.message_id, unknownError);
                                                                    debugLog(err);
                                                                } else {
                                                                    db.collection('stats').insertOne({
                                                                        chat_id: chatId,
                                                                        conversion: conversion,
                                                                        completed: new Date()
                                                                    });
                                                                }
                                                            }));
                                                            process.delete();
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
                }
            });
        });
    });
}

function buildReplyMarkup(conversion) {
    let buttonText = 'auto-convert ' + conversion.from
        + ' to ' + conversion.to + ': '
        + (conversion.auto ? String.fromCodePoint(0x2705) : String.fromCodePoint(0x274c));
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
    let message = 'Awesome! I can convert ' + from + ' to:\n'
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
    return re.exec(fileName)[1].toLowerCase();
}

function registerChat(chatId) {
    let chatFilter = { _id: chatId };
    let collection = db.collection('tasks');
    collection.deleteOne(chatFilter, null, () =>
        collection.insertOne({ _id: chatId }, null, () =>
            collection.countDocuments().then(c => debugLog('Add! Number of used chats: ' + c))));
}

function unregisterChat(chatId) {
    let collection = db.collection('tasks');
    collection.deleteOne({ _id: chatId }, null, () =>
        collection.countDocuments().then(c => debugLog('Remove! Number of used chats: ' + c)));
}

function saveApiKey(chatId, apiKey) {
    let chatFilter = { _id: chatId };
    let update = { 'api_key': apiKey };
    db.collection('tasks').updateOne(chatFilter, { $set: update }, null, err => {
        if (err) debugLog(err); else {
            slimbot.sendMessage(chatId, apiKeyProvided, { parse_mode: 'html' });
        }
    });
}

function debugLog(err) {
    console.log(err);
    slimbot.sendMessage(-1001218552688, '<pre>' + JSON.stringify(err) + '</pre>', { parse_mode: 'html' });
}
