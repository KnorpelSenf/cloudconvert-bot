// environment vars
require('dotenv').config();

const https = require('https');
const axios = require('axios');
const Promise = require('bluebird');

const MongoClient = require('mongodb').MongoClient;
const fs = require('fs');
const path = require('path');

const prettyBytes = require('pretty-bytes');

// texts and strings
const _ = require('./strings');

// Prevent zeit.co from restarting the bot
https.createServer().listen(3000);

const CloudConvert = require('cloudconvert');
const cloudconvert = new CloudConvert(process.env.CLOUD_CONVERT_API_TOKEN);

const botApiToken = process.env.BOT_API_TOKEN;
const Slimbot = require('slimbot');
const slimbot = new Slimbot(botApiToken);

var botId; // id of self
var botName; // name of self
var isDevBot; // tells whether we're in dev mode or not

// Connection URL
const url = 'mongodb://bot:' + process.env.MONGO_DB_PASSWORD + '@ds255403.mlab.com:55403/cloudconvert-bot';

// Database Name
const dbName = 'cloudconvert-bot';
var db;

// Create a new MongoClient
const client = new MongoClient(url, { useNewUrlParser: true });

// Use connect method to connect to the Server
client.connect().then(() => {
    console.log('Connected successfully to database server');
    db = client.db(dbName);
    return db.collection('tasks').countDocuments();
}).then(c => {
    console.log('Number of used chats: ' + c);
    return slimbot.getMe();
}).then(response => {
    let result = response.result;
    botId = result.id;
    botName = result.username;
    isDevBot = false; // botName.indexOf('dev') >= 0;
    // wait for messages
    console.log('Start polling at ' + new Date());
    slimbot.startPolling();
}).catch(err => {
    console.err('Now that\'s bad! Bot failed to start: ' + err);
});

// Giant message parsing
slimbot.on('message', message => {
    let chat = message.chat;
    let chatId = chat.id;
    let chatType = chat.type;
    let messageId = message.message_id;

    if (message.hasOwnProperty('new_chat_members')) {
        // bot was added to group

        let botWasAdded = message.new_chat_members.some(user => user.id === botId);
        if (botWasAdded) {
            registerChat(chatId);
            slimbot.sendMessage(chatId, _.helpmsgAddedToGroup, { parse_mode: 'html' });
        }

    } else if (message.hasOwnProperty('left_chat_member')) {
        // bot was removed from group

        let botWasRemoved = message.left_chat_member.id === botId;
        if (botWasRemoved) {
            unregisterChat(chatId);
        }

    } else if (message.hasOwnProperty('text')) {
        // bot actually received a text message

        let text = message.text;
        let options = { original: text };
        let lowerText = text.toLowerCase();

        if (message.hasOwnProperty('reply_to_message')) {
            // text message was a reply
            let reply = message.reply_to_message;
            if (reply.text === _.sendApiKey) {
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

        // text message will be handled differently
        // depeding on whether it is a bot command or not
        if (message.hasOwnProperty('entities')
            && message.entities[0].type === 'bot_command'
            && message.entities[0].offset === 0
            && (lowerText.indexOf('@') < 0 || lowerText.endsWith(botName))) {
            // bot command
            handleCommand(chatId, chatType, messageId, lowerText, options);
        } else {
            // regular text message
            handleText(chatId, chatType, messageId, text, options);
        }

    } else {
        // bot received a file or sticker or something!
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
                // file extension parsing:
                let command;
                if (message.hasOwnProperty('reply_to_message')) {
                    let reply = message.reply_to_message;
                    if (reply.hasOwnProperty('text')
                        && reply.hasOwnProperty('entities')
                        && reply.entities[0].type === 'bot_command'
                        && message.entities[0].offset === 0
                        && (text.indexOf('@') < 0 || text.endsWith(botName))) {
                        command = reply.text;
                    }
                } else if (message.hasOwnProperty('caption')) {
                    let caption = message.caption;
                    if (message.hasOwnProperty('caption_entities')
                        && message.caption_entities[0].type === 'bot_command'
                        && message.caption_entities[0].offset === 0
                        && (caption.indexOf('@') < 0 || caption.endsWith(botName))) {
                        command = caption;
                    }
                }
                // perhaps the command allows us to convert the file right away
                if (command) {
                    command = command.toLowerCase();
                    let atIndex = command.indexOf('@');
                    if (atIndex >= 0)
                        command = command.substring(1, atIndex);
                    else
                        command = command.substring(1);
                    let to = command.replace('/_/g', '.');
                    // great, now we can convert our file
                    convertFile(chatId, chatType, messageId, fileId, to);
                } else {
                    // store the file for later conversion
                    handleFile(chatId, chatType, messageId, fileId);
                }
            }
        }
    }
});
// End of giant message parsing

// Callback query parsing
slimbot.on('callback_query', query => {
    let data = JSON.parse(query.data);
    if (data) {
        let message = query.message;
        let messageId = message.message_id;
        let chatId = message.chat.id;
        if (data.cancel) {
            // Conversion was cancelled
            clearTask(chatId);
            slimbot.answerCallbackQuery(query.id, { text: _.autoConversionSaved });
            slimbot.editMessageText(chatId, messageId, _.operationCancelled);
        } else {
            // Auto-conversion was toggled
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
            db.collection('tasks').updateOne(chatFilter, update, null).then(obj => {
                slimbot.answerCallbackQuery(query.id, { text: _.autoConversionSaved });
                if (obj && obj.modifiedCount > 0) {
                    conversion.auto = !data.auto;
                    slimbot.editMessageReplyMarkup(chatId, messageId, buildAutoConversionReplyMarkup(conversion));
                }
            }).catch(debugLog);
        }
    }
});
// End of callback query parsing

// Called if a bot command was received
function handleCommand(chatId, chatType, messageId, command, options) {
    if (command.startsWith('/start')) {
        registerChat(chatId);
        let response;
        if (chatType === 'private') {
            response = _.helpmsgPrivate;
        } else {
            response = _.helpmsgStartGroups;
        }
        slimbot.sendMessage(chatId, response, { parse_mode: 'html' });
    } else if (command.startsWith('/help')) {
        let response;
        if (chatType === 'private') {
            response = _.helpmsgPrivate;
        } else {
            response = _.helpmsgGroups;
        }
        slimbot.sendMessage(chatId, response, { parse_mode: 'html' });
    } else if (command.startsWith('/cancel')) {
        clearTask(chatId);
        slimbot.sendMessage(chatId, _.operationCancelled);
    } else if (command.startsWith('/balance')) {
        let chatFilter = { _id: chatId };
        db.collection('tasks').findOne(chatFilter).then(doc => {
            let apiKey = process.env.CLOUD_CONVERT_API_TOKEN;
            if (doc && doc.hasOwnProperty('api_key')) {
                apiKey = doc.api_key;
            }
            return axios.get('https://api.cloudconvert.com/user?apikey=' + apiKey);
        }).then(response => {
            let balance = response.data.minutes;
            slimbot.sendMessage(chatId, _.remainingConversions + ': <b>'
                + balance + '</b>\n\n' + _.customApiKeyInstruction, { parse_mode: 'html' });
        }).catch(debugLog);
    } else if (command.startsWith('/the_more_the_merrier')) {
        let chatFilter = { _id: chatId };
        db.collection('tasks').findOne(chatFilter).then(doc => {
            let response;
            if (doc && doc.hasOwnProperty('api_key')) {
                response = _.helpmsgBalanceWithApiKey + '\n<pre>' + doc.api_key + '</pre>\n\n' + _.helpmsgBuyMinutes;
            } else {
                response = _.helpmsgSetUpAccount;
            }
            slimbot.sendMessage(chatId, response, { parse_mode: 'html' });
        }).catch(debugLog);
    } else if (command.startsWith('/feedback')) {
        slimbot.sendMessage(chatId, _.helpmsgFeedback, { parse_mode: 'html' });
    } else if (command.startsWith('/limitations')) {
        slimbot.sendMessage(chatId, _.helpmsgLimitations, { parse_mode: 'html' });
    } else if (command.startsWith('/apikey')) {
        let apiKey = options.original.substring('/apikey'.length).trim();
        if (apiKey.startsWith('@')) {
            apiKey = apiKey.substring(botName.length + 1);
        }
        if (apiKey && apiKey.length > 0) {
            saveApiKey(chatId, apiKey);
        } else {
            slimbot.sendMessage(chatId, _.sendApiKey, {
                parse_mode: 'html',
                reply_to_message_id: messageId,
                reply_markup: JSON.stringify({ force_reply: true, selective: true })
            });
        }
    } else if (command.startsWith('/info')) {
        if (options.hasOwnProperty('file_id')) {
            let fileId = options.file_id;
            findFileInfoByFileId(chatId, fileId);
        } else {
            let chatFilter = { _id: chatId };
            db.collection('tasks').findOne(chatFilter).then(doc => {
                let fileId;
                if (doc && doc.hasOwnProperty('task')) {
                    let task = doc.task;
                    if (task.hasOwnProperty('file_id')) {
                        fileId = task.file_id;
                    }
                }
                if (fileId) {
                    findFileInfoByFileId(chatId, fileId);
                } else {
                    slimbot.sendMessage(chatId, _.helpmsgInfo);
                }
            }).catch(debugLog);
        }
    } else if (command.startsWith('/convert')) {
        if (options.hasOwnProperty('file_id')) {
            let fileId = options.file_id;
            let chatFilter = { _id: chatId };
            let update = { 'task': { 'file_id': fileId } };
            db.collection('tasks').updateOne(chatFilter, { $set: update }).catch(debugLog);
            findConversionOptionsByFileId(chatId, chatType, messageId, fileId);
        } else {
            slimbot.sendMessage(chatId, _.helpmsgConvert);
        }
    } else {
        // if the command doesn't match anything we know, we assume it to be a file extension
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
            db.collection('tasks').findOne(chatFilter).then(doc => {
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
                    db.collection('tasks').updateOne(chatFilter, { $set: update }).catch(debugLog);
                    slimbot.sendMessage(chatId, _.helpmsgFile + to + '!', { reply_markup: buildCancelOperationReplyMarkup() });
                }
            }).catch(debugLog);
        }
    }
}

// Called if a regular text message was received
function handleText(chatId, chatType, messageId, text) {
    if (chatType === 'private') {
        slimbot.sendMessage(chatId, _.helpmsgText);
    }
}

// Called if a file or sticker or something was received
function handleFile(chatId, chatType, messageId, fileId) {
    let chatFilter = { _id: chatId };
    let collection = db.collection('tasks');
    collection.findOne(chatFilter).then(doc => {
        let to;
        let converted = false; //////////// !!!!!!!!!!!!!
        if (doc && doc.hasOwnProperty('task')) {
            let task = doc.task;
            if (task.hasOwnProperty('to')) {
                to = task.to;
            }
        }
        if (to) {
            converted = true;
            convertFile(chatId, chatType, messageId, fileId, to);
        } else {
            let update = { 'task': { 'file_id': fileId } };
            collection.updateOne(chatFilter, { $set: update }).catch(debugLog);
        }
        return Promise.all([
            converted,
            slimbot.getFile(fileId),
            collection.findOne(chatFilter, { projection: { auto: 1 } })
        ]);
    }).spread((converted, response, doc) => {
        let result = response.result;
        let from = getExtension(result.file_path);
        let size = result.file_size;
        if (doc && doc.hasOwnProperty('auto')) {
            let autoConversions = doc.auto.filter(c => c.from === from);
            if (autoConversions.length > 0) {
                converted = true;
                autoConversions.forEach(c => convertFile(chatId, chatType, messageId, fileId, c.to));
            }
        }
        if (!converted && chatType === 'private') {
            findConversionOptions(chatId, chatType, messageId, from, size);
        }
    }).catch(debugLog);
}

// Performs the actual file conversion
function convertFile(chatId, chatType, messageId, fileId, to) {

    clearTask(chatId);

    if (isDevBot) {
        slimbot.sendMessage(chatId, '[conversion skipped for debug purpose]', { reply_to_message_id: messageId });
        slimbot.sendMessage(chatId, 'Would have converted in chat ' + chatId
            + ' of type ' + chatType
            + ' for message ' + messageId
            + ' file ' + fileId
            + ' to ' + to);
        return;
    }

    let chatFilter = { _id: chatId };
    let statusMessageContainer = { statusMessage: undefined };
    Promise.all([
        slimbot.sendMessage(chatId, String.fromCodePoint(0x1f914) /* <- thinking face emoji */, {
            reply_to_message_id: messageId
        }),
        slimbot.getFile(fileId),
        db.collection('tasks').findOne(chatFilter, { projection: { api_key: 1 } })
    ]).spread((statusMessage, response, doc) => {
        statusMessageContainer.statusMessage = statusMessage;
        let apiKey = undefined;
        let cc = cloudconvert;
        if (doc && doc.hasOwnProperty('api_key')) {
            apiKey = doc.api_key;
            cc = new CloudConvert(apiKey);
        }
        let filePath = response.result.file_path;
        let from = getExtension(filePath);
        let conversion = {
            from: from,
            to: to
        };
        return Promise.all([
            Promise.promisify(cc.createProcess, { context: cc })({
                "inputformat": from,
                "outputformat": to
            }),
            filePath,
            conversion
        ]);
    }).spread((process, filePath, conversion) => {
        let url = 'https://api.telegram.org/file/bot' + botApiToken + '/' + filePath;
        return Promise.all([
            filePath,
            conversion,
            Promise.promisify(process.start, { context: process })({
                "input": "download",
                "file": url,
                "outputformat": to
            }),
            db.collection('tasks').findOne({
                _id: chatId,
                auto: conversion
            })
        ]);
    }).spread((filePath, conversion, process, doc) => {
        conversion.auto = doc ? true : false; // used for stats and reply markup
        return Promise.all([
            conversion,
            Promise.promisify(process.wait, { context: process })(),
            filePath
        ]);
    }).spread((conversion, process, filePath) => {
        let tmpPath = '/tmp/' + path.basename(filePath, conversion.from) + '.' + to;
        return Promise.all([
            conversion,
            // process.download is not even conform to the convention that the last parameter is the callback -> use Promise constructor instead
            new Promise((resolve, reject) => {
                process.download(fs.createWriteStream(tmpPath), null, (err, process) => {
                    if (err)
                        reject(err)
                    else
                        resolve(process)
                })
            }),
            tmpPath
        ]);
    }).spread((conversion, process, tmpPath) => {
        let options = {
            reply_to_message_id: messageId,
            reply_markup: buildAutoConversionReplyMarkup(conversion)
        };
        let file = fs.createReadStream(tmpPath);
        slimbot.sendChatAction(chatId, 'upload_document');
        process.delete();
        slimbot.deleteMessage(chatId, statusMessageContainer.statusMessage.result.message_id);
        slimbot.sendDocument(chatId, file, options);
        return Promise.all([conversion, tmpPath]);
    }).spread(conversion, tmpPath => {
        db.collection('stats').insertOne({
            chat_id: chatId,
            conversion: conversion,
            completed: new Date()
        });
        fs.unlink(tmpPath);
    }).catch(err => {
        let statusMessage = statusMessageContainer.statusMessage;
        if (err.code === 400) {
            slimbot.editMessageText(chatId, statusMessage.result.message_id, _.unsupportedConversion
                + ' (' + from + ' to ' + to + ')');
        } else if (err.code === 402) {
            slimbot.editMessageText(chatId, statusMessage.result.message_id, _.noMoreConversionMinutes);
        } else if (err.code === 403) {
            slimbot.editMessageText(chatId, statusMessage.result.message_id, _.invalidApiKey
                + '<pre>' + apiKey + '</pre>', { parse_mode: 'html' });
        } else if (err.code === 422) {
            slimbot.editMessageText(chatId, statusMessage.result.message_id, _.conversionError
                + ' (' + from + ' to ' + to + ')\n\n' + err.message);
        } else {
            slimbot.editMessageText(chatId, statusMessage.result.message_id, _.unknownError);
            debugLog(err);
        }
    });
}

function findFileInfoByFileId(chatId, fileId) {
    slimbot.getFile(fileId).then(response => {
        let filePath = response.result.file_path;
        let from = getExtension(filePath);
        let url = 'https://api.telegram.org/file/bot' + botApiToken + '/' + filePath;
        cloudconvert.createProcess({
            'inputformat': from,
            'outputformat': from,
            'mode': 'info'
        }, (err, process) => {
            if (err) debugLog(err); else {
                process.start({
                    'mode': 'info',
                    'input': 'download',
                    'file': url
                }, (err, process) => {
                    if (err) debugLog(err); else {
                        process.wait((err, process) => {
                            if (err) debugLog(err); else {
                                let message = '';
                                let info = process.data.info;
                                for (key in info) {
                                    message += '<b>' + key + '</b>: ' + JSON.stringify(info[key], null, 4) + '\n';
                                }
                                slimbot.sendMessage(chatId, message, { parse_mode: 'html' });
                            }
                        });
                    }
                });
            }
        });
    });
}

function clearTask(chatId) {
    let chatFilter = { _id: chatId };
    let update = { 'task': {} };
    db.collection('tasks').updateOne(chatFilter, { $set: update }, null, err => { if (err) debugLog(err); });
}

function buildAutoConversionReplyMarkup(conversion) {
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

function buildCancelOperationReplyMarkup() {
    let buttonText = _.cancelOperation;
    return JSON.stringify({
        inline_keyboard: [[
            {
                text: buttonText,
                callback_data: JSON.stringify({ cancel: true })
            }
        ]]
    });
}

function findConversionOptionsByFileId(chatId, chatType, messageId, fileId, size) {
    slimbot.getFile(fileId).then(response => {
        let from = getExtension(response.result.file_path);
        findConversionOptions(chatId, chatType, messageId, from, size);
    });
}

function findConversionOptions(chatId, chatType, messageId, from, size) {
    https.get('https://api.cloudconvert.com/conversiontypes?inputformat=' + from, res => {
        let data = '';
        res.on('data', chunk => data += chunk);
        res.on('end', () => {
            let formats = JSON.parse(data);
            showConversionOptions(chatId, chatType, messageId, from, formats, size);
        });
    }).on("error", err => debugLog(err));
}

function showConversionOptions(chatId, chatType, messageId, from, formats, size) {
    let categories = formats.map(f => f.group).reduce((a, b) => {
        if (a.indexOf(b) < 0)
            a.push(b);
        return a;
    }, []);
    let message = 'Awesome! I can convert this ' + from + (size ? ' (' + prettyBytes(size) + ')' : '') + ' to:\n'
        + categories.map(c =>
            '<b>' + c + '</b>\n'
            + formats.filter(f => f.group === c)
                .map(f => '/' + f.outputformat
                    .replace(/ /g, "_")
                    .replace(/\./g, '_') + ' (<i>' + f.outputformat + '</i>)')
                .join('\n')
        ).join('\n\n');
    let options = {
        parse_mode: 'html',
        reply_markup: buildCancelOperationReplyMarkup()
    };
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
        collection.insertOne({ _id: chatId }));
}

function unregisterChat(chatId) {
    let collection = db.collection('tasks');
    collection.deleteOne({ _id: chatId });
}

function saveApiKey(chatId, apiKey) {
    slimbot.sendMessage(chatId, _.validatingApiKey).then(statusMessage => {
        let messageId = statusMessage.result.message_id;
        https.get('https://api.cloudconvert.com/user?apikey=' + apiKey, res => {
            let data = '';
            res.on('data', chunk => data += chunk);
            res.on('end', () => {
                let response = JSON.parse(data);
                let user = response.user;
                if (user) {
                    let chatFilter = { _id: chatId };
                    let update = { 'api_key': apiKey };
                    db.collection('tasks').updateOne(chatFilter, { $set: update }, null, err => {
                        if (err) {
                            debugLog(err);
                            slimbot.editMessageText(chatId, messageId, _.unknownError);
                        } else {
                            slimbot.editMessageText(chatId, messageId, '<b>' + user + '</b>\n' + _.apiKeyProvided, { parse_mode: 'html' });
                        }
                    });
                } else {
                    slimbot.editMessageText(chatId, messageId, _.cannotSetApiKey);
                }
            });
        }).on("error", () => slimbot.editMessageText(chatId, messageId, _.unknownError));
    });
}

function debugLog(err) {
    console.trace(err);
    let log = JSON.stringify({ err: err, trace: new Error().stack }, null, 2);
    slimbot.sendMessage(-1001218552688, '<pre>' + log + '</pre>', { parse_mode: 'html' });
}
