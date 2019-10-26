import { ExtraReplyMessage } from 'telegraf/typings/telegram-types';
import * as util from '../helpers/get-file-extension';
import { cancelOperationReplyMarkup } from '../helpers/reply-markup-builder';
import TaskContext from '../models/task-context';
import * as cloudconvert from './../models/cloud-convert';

export async function printPossibleConversions(ctx: TaskContext, fileId: string): Promise<void> {
    const fileUrl = await ctx.telegram.getFileLink(fileId);
    const ext = util.ext(fileUrl);
    const formats = await cloudconvert.listPossibleConversions(ext);

    // group formats by category
    const categories = formats.map(f => f.group).filter(uniques);
    const msg = 'Awesome! I can convert this ' + ext + ' to:\n'
        + categories.map(cat =>
            '<b>' + cat + '</b>\n'
            + formats.filter(f => f.group === cat)
                .map(f => '/' + f.outputformat.replace(/[\s\.]/g, '_')
                    + ' (<i>' + f.outputformat + '</i>)')
                .join('\n'),
        ).join('\n\n');

    const extra: ExtraReplyMessage = {
        reply_markup: cancelOperationReplyMarkup,
    };
    if (ctx.message !== undefined && ctx.message.chat.type !== 'private') {
        extra.reply_to_message_id = ctx.message.message_id;
    }
    await ctx.replyWithHTML(msg, extra);
}

export async function getFileIdFromReply(ctx: TaskContext, usageHelp?: string): Promise<string | undefined> {
    if (ctx.message !== undefined) {
        if (ctx.message.reply_to_message === undefined) {
            if (usageHelp) {
                await ctx.reply(usageHelp, { reply_to_message_id: ctx.message.message_id });
            }
        } else {
            const reply = ctx.message.reply_to_message;
            let file: { file_id: string } | undefined
                = reply.audio || reply.document || reply.sticker || reply.video || reply.voice || reply.video_note;
            if (file === undefined && reply.photo !== undefined) {
                file = reply.photo[reply.photo.length - 1];
            }
            if (file === undefined) {
                if (usageHelp) {
                    await ctx.reply(usageHelp, { reply_to_message_id: ctx.message.message_id });
                }
            } else {
                return file.file_id;
            }
        }
    }
    return undefined;
}

// Helper function to get unique values in array
function uniques<E>(element: E, index: number, array: E[]) {
    return array.indexOf(element) === index;
}