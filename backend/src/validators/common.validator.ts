import { z } from 'zod';
export const text = z.string().trim().min(1);
export const uuid = z.uuid();
export const idParams = z.object({ id: uuid });
export const instant = z.iso.datetime({ offset: true }).transform(value => new Date(value));
export const pastInstant = instant.refine(value => value <= new Date(), 'Timestamp cannot be in the future');
export const pagination = {
  page: z.coerce.number().int().min(1).max(1000000).default(1),
  pageSize: z.coerce.number().int().min(1).max(100).default(20),
};
