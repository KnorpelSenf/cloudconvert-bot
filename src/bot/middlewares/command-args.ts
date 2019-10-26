import d from 'debug';
const debug = d('bot:mw:cargs');

import TaskContext from '../models/task-context';

// Loosely based on https://larsgraubner.com/telegraf-middleware-command-arguments/
export default function commandArgs(ctx: TaskContext, next: (() => any) | undefined): any {
    if (ctx.updateType === 'message'
        && ctx.message !== undefined
        && ctx.message.text !== undefined
        && ctx.message.text.startsWith('/')) {
        const text = ctx.message.text;
        const match = text.match(/^\/([^\s]+)\s?(.+)?/);
        if (match !== null) {
            const raw: string = text;
            const command: string = match[1] ? match[1] : '';
            const args: string[] = match[2] ? match[2].split(' ') : [];
            debug(args);
            ctx.state.command = { raw, command, args };
        }
    }
    if (next !== undefined) {
        return next();
    }
}
