import { InlineKeyboardMarkup } from 'telegram-typings';
import { cancelOperation } from '../../strings';
import { AutoFileConversion } from '../models/file-conversion';

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

export const cancelOperationReplyMarkup: InlineKeyboardMarkup = {
    inline_keyboard: [[
        {
            text: cancelOperation, // button text
            callback_data: JSON.stringify({ cancel: true }),
        },
    ]],
};
