import { z } from 'zod';
import { CommercialPartyRole } from '../generated/enums.js';
import { text, uuid, pagination } from './common.validator.js';
const contact = z.strictObject({ name: text, email: z.email().optional(), phone: text.optional(), designation: text.optional() })
  .refine(value => value.email || value.phone, 'Provide an email or phone number');
const relationship = z.strictObject({ partyId: uuid, role: z.enum(CommercialPartyRole) });
const fields = {
  name: text, country: text, customerType: text.nullable().optional(),
  contacts: z.array(contact).min(1), relationships: z.array(relationship).optional(),
};
export const createCustomerInput = z.strictObject({
  // Codes are case-normalized once and immutable thereafter.
  code: z.string().trim().toUpperCase().regex(/^[A-Z0-9]+(?:-[A-Z0-9]+)*$/, 'Use letters, digits and single hyphens'),
  ...fields,
});
export const updateCustomerInput = z.strictObject({ ...fields, active: z.boolean() }).partial()
  .refine(value => Object.keys(value).length > 0, 'Supply at least one editable field');
export const customerQuery = z.strictObject({ ...pagination, search: text.optional(), country: text.optional(), active: z.enum(['true', 'false']).optional() });
export type CreateCustomer = z.infer<typeof createCustomerInput>;
export type UpdateCustomer = z.infer<typeof updateCustomerInput>;
