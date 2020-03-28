import { InlineKeyboardMarkup } from 'telegram-typings';
import { AutoFileConversion } from '../models/file-conversion';
import TaskContext from '../models/task-context';

export function autoConversionReplyMarkup(conversion: AutoFileConversion): InlineKeyboardMarkup {
    const buttonText = 'auto-convert ' + conversion.from
        + ' to ' + conversion.to + ': '
        + (conversion.auto ? String.fromCodePoint(0x2705) : String.fromCodePoint(0x274c));
    //                       ^ green tick emoji             ^ red cross emoji
    return {
        inline_keyboard: [[
            {
                text: buttonText,
                callback_data: JSON.stringify(conversion),
            },
        ]],
    };
}

export function cancelOperationReplyMarkup(ctx: TaskContext): InlineKeyboardMarkup {
    return {
        inline_keyboard: [[
            {
                text: ctx.i18n.t('cancelOperation'), // button text
                callback_data: JSON.stringify({ cancel: true }),
            },
        ]],
    };
}
