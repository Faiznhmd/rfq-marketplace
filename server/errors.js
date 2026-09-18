import { fieldErrors } from '../shared/validation.js';

export class HttpError extends Error {
  constructor(status, message, fields) {
    super(message);
    this.status = status;
    this.fields = fields;
  }
}
export function parse(schema, data) {
  const result = schema.safeParse(data);
  if (!result.success)
    throw new HttpError(400, 'Please check the highlighted fields.', fieldErrors(result.error));
  return result.data;
}
export function errorHandler(error, req, res, next) {
  if (res.headersSent) return next(error);
  if (error instanceof HttpError)
    return res.status(error.status).json({ error: error.message, fields: error.fields });
  if (error.type === 'entity.parse.failed')
    return res.status(400).json({ error: 'Request body must be valid JSON.' });
  if (error.type === 'entity.too.large')
    return res.status(413).json({ error: 'Request is too large.' });
  if (error.code === '23505') return res.status(409).json({ error: 'This record already exists.' });
  if (error.code === '23503')
    return res.status(404).json({ error: 'The referenced record no longer exists.' });
  console.error('Request failed:', error.code || error.name);
  return res.status(500).json({ error: 'Something went wrong. Please try again.' });
}
