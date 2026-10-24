import { z } from "zod";

/** Every error response: { error: { code, message, details? } } */
export const apiError = z.object({
  error: z.object({
    code: z.string(),
    message: z.string(),
    details: z.unknown().optional(),
  }),
});
export type ApiError = z.infer<typeof apiError>;

export const isoDateTime = z.iso.datetime();

export const idRef = z.object({ id: z.uuid(), name: z.string() });
export type IdRef = z.infer<typeof idRef>;

/** Page-number pagination for tables. (Cursor pagination is used by the public /v1 API.) */
export const pageQuery = z.object({
  page: z.coerce.number().int().min(1).default(1),
  pageSize: z.coerce.number().int().min(1).max(100).default(25),
});

export const pageMeta = z.object({
  page: z.number().int(),
  pageSize: z.number().int(),
  total: z.number().int(),
});
