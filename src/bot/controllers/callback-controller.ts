import d from 'debug';
import { Boolean, Record, Static } from 'runtypes';
import { autoConversionReplyMarkup } from '../helpers/reply-markup-builder';
import { AutoFileConversionType } from '../models/file-conversion';
import TaskContext from '../models/task-context';
const debug = d('bot:contr:cb');

const CallbackQueryDataType = AutoFileConversionType
    .Or(Record({
        cancel: Boolean,
    }));
type CallbackQueryData = Static<typeof CallbackQueryDataType>;

export async function handleCallbackQuery(ctx: TaskContext) {
    const query = ctx.callbackQuery;
    if (query?.data !== undefined && query.message !== undefined) {
        const data: CallbackQueryData = CallbackQueryDataType.check(JSON.parse(query.data));
        const chat = query.message.chat;
        if ('cancel' in data) {
            // Conversion was cancelled
            await Promise.all([
                ctx.db.clearTask(chat),
                ctx.answerCbQuery(),
                ctx.editMessageText(ctx.i18n.t('operationCancelled')),
            ]);
        } else {
            // Auto-conversion was toggled
            /*
            Callback query data has the shape of type AutoFileConversion
            (assuming the payload is about auto-conversions).

            Database entries have a property "auto" of this structure:
            [
                {
                    from: "mp4",
                    to: "avi"
                },
                {
                    from: "epub",
                    to: "pdf"
                },
                ...
            ]
            Every entry in the above list represents a conversion (aka. a pair of
            file extensions) to be performed automatically.
            */
            data.auto = !data.auto;
            const entry = { auto: { from: data.from, to: data.to } };
            const update = data.auto
                ? { $addToSet: entry } // add if not exists
                : { $pull: entry }; // remove if exists
            debug(update);
            await Promise.all([
                ctx.db.updateTaskInformation(chat, update),
                ctx.answerCbQuery(ctx.i18n.t('autoConversionSaved')),
                ctx.editMessageReplyMarkup(autoConversionReplyMarkup(data)),
            ]);
        }
    }
}
