import { ProcessData } from 'cloudconvert';
import d from 'debug';
import treeify from 'treeify';
import * as strings from '../../strings';
import * as cloudconvert from '../models/cloud-convert';
import TaskContext from '../models/task-context';
import * as controllerUtils from './apikey-controller';
import * as utils from './controller-utils';
import * as files from './file-controller';
const debug = d('bot:contr:command');

export async function start(ctx: TaskContext): Promise<void> {
    debug('/start');
    if (ctx.chat !== undefined) {
        const response = ctx.chat.type === 'private'
            ? strings.helpmsgStartPrivate
            : strings.helpmsgStartGroups;
        await Promise.all([
            ctx.replyWithHTML(response),
            ctx.db.registerChat(ctx.chat),
        ]);
    }
}

export async function help(ctx: TaskContext): Promise<void> {
    debug('/help');
    if (ctx.chat !== undefined) {
        const response = ctx.chat.type === 'private'
            ? strings.helpmsgPrivate
            : strings.helpmsgGroups;
        await ctx.replyWithHTML(response);
    }
}

export async function cancel(ctx: TaskContext): Promise<void> {
    debug('/cancel');
    if (ctx.chat !== undefined) {
        await Promise.all([
            ctx.reply(strings.operationCancelled),
            ctx.db.clearTask(ctx.chat),
        ]);
    }
}

export async function balance(ctx: TaskContext): Promise<void> {
    debug('/balance');
    if (ctx.chat !== undefined) {
        const minutes = await cloudconvert.getBalance(await ctx.db.getKey(ctx.chat));
        await ctx.replyWithHTML(strings.remainingConversions + ': <b>' + minutes + '</b>\n\n'
            + strings.customApiKeyInstruction);
    }
}

export async function contribute(ctx: TaskContext): Promise<void> {
    debug('/contribute');
    if (ctx.chat !== undefined) {
        const userApiKey = await ctx.db.getKey(ctx.chat);
        const response = userApiKey === undefined
            ? strings.helpmsgSetUpAccount
            : strings.helpmsgBalanceWithApiKey + '\n<pre>' + userApiKey + '</pre>\n\n' + strings.helpmsgBuyMinutes;
        await ctx.replyWithHTML(response);
    }
}

export async function feedback(ctx: TaskContext): Promise<void> {
    debug('/feedback');
    await ctx.replyWithHTML(strings.helpmsgFeedback);
}

export async function limitations(ctx: TaskContext): Promise<void> {
    debug('/limitations');
    await ctx.replyWithHTML(strings.helpmsgLimitations);
}

export async function apiKey(ctx: TaskContext): Promise<void> {
    debug('/apikey');
    if (ctx.message !== undefined) {
        if (ctx.state.command !== undefined
            && ctx.state.command.args.length > 0
            && ctx.state.command.args[0] !== undefined) {
            const key = ctx.state.command.args[0];
            await controllerUtils.receivedApiKey(ctx, key);
        } else {
            await ctx.replyWithHTML(strings.sendApiKey, {
                reply_to_message_id: ctx.message.message_id,
                reply_markup: { force_reply: true, selective: true },
            });
        }
    }
}

export async function info(ctx: TaskContext): Promise<void> {
    debug('/info');
    const fileId = await utils.getFileIdFromReply(ctx, strings.helpmsgInfo);
    if (ctx.message !== undefined && fileId !== undefined) {
        let fileInfo: ProcessData | undefined;
        let url: string;
        try {
            url = await ctx.telegram.getFileLink(fileId);
        } catch (e) {
            if (e.code === 400) {
                await ctx.reply(strings.fileTooBig);
            } else {
                d('err')(e);
                await ctx.reply(strings.unknownError);
            }
            return;
        }
        try {
            fileInfo = await cloudconvert.getFileInfo(url, await ctx.db.getKey(ctx.message.chat.id));
        } catch (e) {
            if (e.code === undefined || typeof e.code !== 'number') {
                d('err')(e);
                await ctx.reply(strings.unknownError);
            } else {
                await ctx.reply(cloudconvert.describeErrorCode(e));
            }
            return;
        }

        let msg: string;
        if (fileInfo !== undefined && fileInfo.info !== undefined) {
            const tree = treeify.asTree(fileInfo.info, true, true);
            // WHY THE FUCK ARE THERE NULL CHARACTERS IN THIS STRING?!
            const clean = tree.replace(/\0/g, '');
            const escaped = escapeHtmlTags(clean);
            msg = strings.fileInfo + '\n<pre>' + escaped + '</pre>';
        } else {
            msg = strings.noFileInfo;
        }

        await ctx.replyWithHTML(msg, {
            reply_to_message_id: ctx.message.message_id,
        });
    }
}

export async function convert(ctx: TaskContext): Promise<void> {
    debug('/convert');
    const fileId = await utils.getFileIdFromReply(ctx, strings.helpmsgConvert);
    if (fileId !== undefined) {
        await files.setSourceFile(ctx, fileId);
    }
}

// functions for HTML tag escaping, based on https://stackoverflow.com/a/5499821/
const tagsToEscape = {
    '&': '&amp;',
    '<': '&lt;',
    '>': '&gt;',
};
function escapeHtmlTags(str: string): string {
    return str.replace(/[&<>]/g, escapeTag);
}
function escapeTag(tag: string): string {
    return tagsToEscape[tag as '&' | '<' | '>'] || tag;
}
