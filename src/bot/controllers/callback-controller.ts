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
        const session = await ctx.session;
        if ('cancel' in data) {
            // Conversion was cancelled
            delete session.task;
            await Promise.all([
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
            // toggle state
            data.auto = !data.auto;
            // this is the conversion to be toggled
            const conversion = { from: data.from, to: data.to };

            session.auto = session.auto || [];
            const index = session.auto.indexOf(conversion);
            const contained = index >= 0;
            const desired = data.auto;
            if (contained !== desired) {
                if (desired) {
                    // add if not exists
                    session.auto.push(conversion);
                } else {
                    // remove if exists
                    session.auto.splice(index, 1);
                }
            }
            if (session.auto.length === 0) {
                delete session.auto;
            }
            await Promise.all([
                ctx.answerCbQuery(ctx.i18n.t('autoConversionSaved')),
                ctx.editMessageReplyMarkup(autoConversionReplyMarkup(data)),
            ]);
        }
    }
}
