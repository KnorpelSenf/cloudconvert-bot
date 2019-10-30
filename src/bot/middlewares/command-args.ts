import d from 'debug';
const debug = d('bot:mw:cargs');

import TaskContext from '../models/task-context';

// Loosely based on https://larsgraubner.com/telegraf-middleware-command-arguments/
export default function commandArgs(ctx: TaskContext, next: (() => any) | undefined): any {
    if (ctx.updateType === 'message'
        && ctx.message !== undefined
        && (ctx.message.text !== undefined && ctx.message.text.startsWith('/')
            || ctx.message.caption !== undefined && ctx.message.caption.startsWith('/'))) {
        const text = ctx.message.text
            || ctx.message.caption
            || 'this will never happen, but if it does, it will not match the regex';
        const match = text.match(/^\/([^\s]+)\s?([\s\S]+)?/);
        debug(text);
        if (match !== null) {
            const raw: string = text;
            const command: string = match[1] ? match[1] : '';
            const args: string[] = match[2] ? match[2].split(/\s/).filter(arg => !!arg) : [];
            ctx.state.command = { raw, command, args };
            debug(ctx.state.command);
        }
    }
    if (next !== undefined) {
        return next();
    }
}
