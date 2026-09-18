import { z } from 'zod';

export const todayUTC = () => new Date().toISOString().slice(0, 10);
const text = (label, max) =>
  z
    .string({ error: `${label} is required.` })
    .trim()
    .min(1, `${label} is required.`)
    .max(max, `${label} must be ${max} characters or fewer.`);
const email = z.string().trim().email('Enter a valid email address.').max(254).toLowerCase();
const password = z
  .string()
  .min(8, 'Use at least 8 characters.')
  .max(128, 'Use at most 128 characters.');
export const registerSchema = z
  .object({
    name: text('Name', 100),
    email,
    password,
    role: z.enum(['BUYER', 'SUPPLIER'], { error: 'Choose Buyer or Supplier.' }),
  })
  .strict();
export const loginSchema = z
  .object({ email, password: z.string().min(1, 'Password is required.').max(128) })
  .strict();

const decimal = (label, places, max) =>
  z
    .union([z.string(), z.number()])
    .transform((value) => String(value))
    .refine(
      (value) => new RegExp(`^\\d+(\\.\\d{1,${places}})?$`).test(value),
      `${label} must be a number with at most ${places} decimal places.`,
    )
    .refine(
      (value) => Number(value) > 0 && Number(value) <= max,
      `${label} must be greater than zero and at most ${max}.`,
    );
const deadline = z
  .string()
  .regex(/^\d{4}-\d{2}-\d{2}$/, 'Choose a valid deadline.')
  .refine((value) => {
    const date = new Date(`${value}T00:00:00.000Z`);
    return !Number.isNaN(date.getTime()) && date.toISOString().slice(0, 10) === value;
  }, 'Choose a valid date.')
  .refine((value) => value > todayUTC(), 'Deadline must be a future date (UTC).');

export const rfqSchema = z
  .object({
    productName: text('Product or service name', 160),
    description: text('Description', 5000),
    quantity: decimal('Quantity', 3, 99999999999.999),
    deliveryLocation: text('Delivery location', 200),
    deadline,
  })
  .strict();

export const quotationSchema = z
  .object({
    price: decimal('Quoted price', 2, 999999999999.99),
    deliveryTime: text('Estimated delivery time', 200),
    message: z
      .string()
      .trim()
      .max(3000, 'Notes must be 3000 characters or fewer.')
      .optional()
      .default(''),
  })
  .strict();
export const searchSchema = z
  .object({
    q: z.string().trim().max(160).optional().default(''),
    location: z.string().trim().max(200).optional().default(''),
  })
  .strict();
export const idSchema = z.uuid();

export function fieldErrors(error) {
  const fields = {};
  for (const issue of error.issues) fields[issue.path[0] || 'form'] ??= issue.message;
  return fields;
}
