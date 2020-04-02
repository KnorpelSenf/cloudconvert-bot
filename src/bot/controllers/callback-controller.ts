import d from 'debug';
import { Boolean, Record, Static, String } from 'runtypes';
import { autoConversionReplyMarkup, selectLanguageReplyMarkup } from '../helpers/reply-markup-builder';
import { AutoFileConversion, AutoFileConversionType } from '../models/file-conversion';
import TaskContext from '../models/task-context';
const debug = d('bot:contr:cb');

const CallbackQueryDataType = AutoFileConversionType
    .Or(Record({
        cancel: Boolean,
    }))
    .Or(Record({
        lang: String,
    }));
type CallbackQueryData = Static<typeof CallbackQueryDataType>;

export async function handleCallbackQuery(ctx: TaskContext) {
    const query = ctx.callbackQuery;
    if (query?.data !== undefined && query.message !== undefined) {
        const data: CallbackQueryData = CallbackQueryDataType.check(JSON.parse(query.data));
        if ('cancel' in data) {
            // Conversion was cancelled
            await cancel(ctx);
        } else if ('lang' in data) {
            // New language was set
            await setLanguage(ctx, data.lang);
        } else {
            // Auto-conversion was toggled
            await toggleAutoConversion(ctx, data);
        }
    }
}

async function cancel(ctx: TaskContext) {
    const [session] = await Promise.all([
        ctx.session,
        ctx.answerCbQuery(),
        ctx.editMessageText(ctx.i18n.t('operationCancelled')),
    ]);
    delete session.task;
}

async function setLanguage(ctx: TaskContext, lang: string) {
    if (ctx.i18n.locale() !== lang) {
        ctx.i18n.locale(lang);
        await Promise.all([
            ctx.editMessageText(ctx.i18n.t('pickLanguage'), {
                reply_markup: selectLanguageReplyMarkup(ctx),
                parse_mode: 'HTML',
                disable_web_page_preview: true,
            }),
            ctx.answerCbQuery(),
        ]);
    }
}

async function toggleAutoConversion(ctx: TaskContext, data: AutoFileConversion) {
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
    const session = await ctx.session;
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
    try {
        await ctx.editMessageReplyMarkup(autoConversionReplyMarkup(ctx, data));
    } catch (e) {
        // “Bad Request: message is not modified” happens if users spam the button
        // and several conflicting updates are processed in parallel.
        // We just ignore the update in this case because the correct data are eventually displayed anyway
    }
    await ctx.answerCbQuery(ctx.i18n.t('autoConversionSaved'));
}
