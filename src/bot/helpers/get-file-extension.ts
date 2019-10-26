import path from 'path';

export function ext(file: string) {
    return path.extname(file).substring(1); // drop ».« of file extension
}
