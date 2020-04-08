// functions for HTML tag escaping, based on https://stackoverflow.com/a/5499821/
const tagsToEscape = {
    '&': '&amp;',
    '<': '&lt;',
    '>': '&gt;',
}
function escapeTag(tag: string): string {
    return tagsToEscape[tag as '&' | '<' | '>'] || tag
}

export function escapeHtmlTags(str: string): string {
    return str.replace(/[&<>]/g, escapeTag)
}
