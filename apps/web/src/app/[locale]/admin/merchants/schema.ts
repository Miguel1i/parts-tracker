import { z } from "zod";
import { adapterFormFieldsSchema } from "@/lib/admin/adapter-schema";

/*
 * Shared by the form (field errors) and the Server Actions (authoritative check). Messages are
 * plain English fallbacks; the form shows translated text keyed by the issue's path.
 */

const httpUrl = (what: string) =>
  z
    .string()
    .trim()
    .refine((v) => {
      try {
        const u = new URL(v);
        return u.protocol === "http:" || u.protocol === "https:";
      } catch {
        return false;
      }
    }, `${what} must be an http(s) URL`);

const money = (what: string) =>
  z
    .string()
    .trim()
    .refine(
      (v) => v !== "" && Number.isFinite(Number(v)) && Number(v) >= 0,
      `${what} must be 0 or more`,
    )
    .transform(Number);

export const merchantValuesSchema = z.object({
  name: z.string().trim().min(1, "Name is required").max(100),
  slug: z
    .string()
    .trim()
    .regex(/^[a-z0-9]+(?:-[a-z0-9]+)*$/, "Slug may only use a-z, 0-9 and hyphens"),
  country: z
    .string()
    .trim()
    .refine((v) => v === "" || /^[A-Za-z]{2}$/.test(v), "Country must be 2 letters")
    .transform((v) => (v === "" ? null : v.toUpperCase())),
  baseUrl: httpUrl("Base URL"),
  searchTemplate: httpUrl("Search template").refine(
    (v) => v.includes("{q}"),
    "Search template must contain {q}",
  ),
  currency: z
    .string()
    .trim()
    .regex(/^[A-Z]{3}$/, "Currency must be 3 uppercase letters"),
  shipping: money("Shipping"),
  freeShippingOver: z
    .string()
    .trim()
    .refine(
      (v) => v === "" || (Number.isFinite(Number(v)) && Number(v) >= 0),
      "Free shipping threshold must be 0 or more",
    )
    .transform((v) => (v === "" ? null : Number(v))),
  enabled: z.boolean(),
  visibleToUsers: z.boolean(),
  ownOnly: z.boolean(),
  needsBrowser: z.boolean(),
  notes: z
    .string()
    .trim()
    .max(5000)
    .transform((v) => (v === "" ? null : v)),
  color: z
    .string()
    .trim()
    .refine((v) => v === "" || /^#[0-9a-fA-F]{6}$/.test(v), "Color must be #rrggbb")
    .transform((v) => (v === "" ? null : v.toLowerCase())),
  adapter: adapterFormFieldsSchema,
  overrides: z.string(),
});

export type MerchantFormValues = z.input<typeof merchantValuesSchema>;
