import type { VercelRequest } from '@vercel/node';
import { IncomingMessage } from 'http';

export interface ParsedField {
    fields: Record<string, string>;
    files: Array<{ buffer: Buffer; originalname: string; mimetype: string; fieldname: string }>;
}

/**
 * Parses a multipart/form-data request using the `busboy` approach via raw body.
 * Works in Vercel serverless without writing to disk.
 */
export async function parseMultipart(req: VercelRequest): Promise<ParsedField> {
    // Dynamically import busboy (Node.js stream parser)
    const busboy = (await import('busboy')).default;

    return new Promise((resolve, reject) => {
        const contentType = req.headers['content-type'] || '';
        if (!contentType.includes('multipart/form-data')) {
            // Not multipart — just return body fields
            const body = req.body || {};
            resolve({ fields: body, files: [] });
            return;
        }

        const bb = busboy({ headers: req.headers as Record<string, string> });
        const fields: Record<string, string> = {};
        const files: ParsedField['files'] = [];

        bb.on('field', (name, value) => {
            fields[name] = value;
        });

        bb.on('file', (fieldname, fileStream, info) => {
            const chunks: Buffer[] = [];
            fileStream.on('data', (chunk: Buffer) => chunks.push(chunk));
            fileStream.on('end', () => {
                files.push({
                    buffer: Buffer.concat(chunks),
                    originalname: info.filename,
                    mimetype: info.mimeType,
                    fieldname,
                });
            });
        });

        bb.on('finish', () => resolve({ fields, files }));
        bb.on('error', reject);

        // Pipe the request into busboy
        (req as unknown as IncomingMessage).pipe(bb);
    });
}
