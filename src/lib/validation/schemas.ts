import { z } from "zod";
import { normalizeSiteUrl } from "@/lib/crawler/url";

/**
 * Zod schemas for every server input.
 *
 * Nothing reaches a database write or an outbound fetch without passing through
 * one of these. URL fields are normalised here so downstream code always
 * receives a canonical absolute URL.
 */

export const siteUrlSchema = z
  .string()
  .trim()
  .min(4, "Enter a website address.")
  .max(2048, "That address is too long.")
  .transform((value, ctx) => {
    const normalized = normalizeSiteUrl(value);
    if (!normalized) {
      ctx.addIssue({
        code: "custom",
        message: "Enter a valid website address, for example example.com",
      });
      return z.NEVER;
    }
    return normalized;
  });

export const brandNameSchema = z
  .string()
  .trim()
  .min(2, "Brand name must be at least 2 characters.")
  .max(120, "Brand name is too long.");

export const countryCodeSchema = z
  .string()
  .trim()
  .length(2, "Use a two-letter country code.")
  .toUpperCase();

export const languageCodeSchema = z
  .string()
  .trim()
  .min(2)
  .max(8)
  .toLowerCase()
  .default("en");

// ---------------------------------------------------------------------------
// Auth
// ---------------------------------------------------------------------------

export const signUpSchema = z.object({
  fullName: z.string().trim().min(2, "Enter your name.").max(120),
  email: z.email("Enter a valid email address.").trim().toLowerCase(),
  password: z
    .string()
    .min(10, "Use at least 10 characters.")
    .max(200, "That password is too long."),
  marketingOptIn: z.boolean().default(false),
});

export const signInSchema = z.object({
  email: z.email("Enter a valid email address.").trim().toLowerCase(),
  password: z.string().min(1, "Enter your password."),
});

// ---------------------------------------------------------------------------
// Onboarding
// ---------------------------------------------------------------------------

export const onboardingStepOneSchema = z.object({ siteUrl: siteUrlSchema });

export const onboardingStepTwoSchema = z.object({ brandName: brandNameSchema });

export const onboardingStepThreeSchema = z.object({
  businessCategory: z.string().trim().min(2, "Enter a category.").max(120),
  businessDescription: z
    .string()
    .trim()
    .min(20, "Describe your business in at least 20 characters.")
    .max(1000),
});

export const onboardingStepFourSchema = z.object({
  targetCountry: countryCodeSchema,
  targetAudience: z.string().trim().min(3, "Describe who you sell to.").max(300),
});

export const onboardingCompetitorSchema = z.object({
  brandName: brandNameSchema,
  siteUrl: z.string().trim().max(2048).optional(),
});

export const onboardingStepFiveSchema = z.object({
  competitors: z.array(onboardingCompetitorSchema).max(5, "You can track up to 5 competitors."),
});

export const completeOnboardingSchema = z.object({
  siteUrl: siteUrlSchema,
  brandName: brandNameSchema,
  businessCategory: z.string().trim().max(120).optional(),
  businessDescription: z.string().trim().max(1000).optional(),
  targetCountry: countryCodeSchema.default("IN"),
  targetAudience: z.string().trim().max(300).optional(),
  primaryLanguage: languageCodeSchema,
  competitors: z.array(onboardingCompetitorSchema).max(5).default([]),
});

// ---------------------------------------------------------------------------
// Prompts
// ---------------------------------------------------------------------------

export const promptGroupSchema = z.enum([
  "awareness",
  "problem",
  "solution",
  "comparison",
  "alternative",
  "recommendation",
  "commercial",
  "transactional",
  "local",
  "brand",
]);

export const promptInputSchema = z.object({
  promptText: z
    .string()
    .trim()
    .min(8, "A prompt needs to be a real question.")
    .max(500, "Keep prompts under 500 characters."),
  intent: z.string().trim().max(200).optional(),
  topic: z.string().trim().max(200).optional(),
  promptGroup: promptGroupSchema.default("awareness"),
  country: countryCodeSchema.default("IN"),
  language: languageCodeSchema,
  priority: z.number().int().min(1).max(5).default(3),
  isActive: z.boolean().default(true),
  tags: z.array(z.string().trim().min(1).max(40)).max(10).default([]),
});

export const promptUpdateSchema = promptInputSchema.partial().extend({
  id: z.uuid(),
});

export const promptBulkActivateSchema = z.object({
  promptIds: z.array(z.uuid()).min(1).max(100),
  isActive: z.boolean(),
});

// ---------------------------------------------------------------------------
// Competitors
// ---------------------------------------------------------------------------

export const competitorInputSchema = z.object({
  brandName: brandNameSchema,
  siteUrl: z.string().trim().max(2048).optional(),
  notes: z.string().trim().max(500).optional(),
});

// ---------------------------------------------------------------------------
// Scans and analysis
// ---------------------------------------------------------------------------

export const startCrawlSchema = z.object({
  projectId: z.uuid(),
});

export const startAiScanSchema = z.object({
  projectId: z.uuid(),
  engines: z
    .array(z.enum(["openai", "gemini", "anthropic", "perplexity", "grok", "copilot"]))
    .optional(),
});

export const pagespeedScanSchema = z.object({
  projectId: z.uuid(),
  urls: z.array(z.url()).max(10).optional(),
  strategies: z.array(z.enum(["mobile", "desktop"])).min(1).max(2).default(["mobile", "desktop"]),
});

export const contentAnalysisSchema = z
  .object({
    projectId: z.uuid(),
    url: z.string().trim().max(2048).optional(),
    content: z.string().trim().max(120_000).optional(),
    title: z.string().trim().max(300).optional(),
    targetQuestion: z.string().trim().max(300).optional(),
  })
  .refine((value) => Boolean(value.url) || Boolean(value.content), {
    message: "Provide a URL or paste your draft content.",
    path: ["url"],
  });

export const publicVisibilityCheckSchema = z.object({
  url: siteUrlSchema,
});

// ---------------------------------------------------------------------------
// Opportunities
// ---------------------------------------------------------------------------

export const opportunityStatusSchema = z.enum(["open", "in_progress", "completed", "ignored"]);

export const updateOpportunitySchema = z.object({
  opportunityId: z.uuid(),
  status: opportunityStatusSchema,
});

// ---------------------------------------------------------------------------
// Reports
// ---------------------------------------------------------------------------

export const createReportSchema = z.object({
  projectId: z.uuid(),
  title: z.string().trim().min(3).max(200).optional(),
  periodDays: z.number().int().min(7).max(180).default(30),
});

// ---------------------------------------------------------------------------
// Integrations
// ---------------------------------------------------------------------------

export const selectSearchConsoleSiteSchema = z.object({
  projectId: z.uuid(),
  siteUrl: z.string().trim().min(4).max(2048),
});

/**
 * The API key is required, not optional. It is the only thing that proves the
 * user controls the Bing property, so a connection cannot be established
 * without one.
 */
export const bingConnectSchema = z.object({
  projectId: z.uuid(),
  siteUrl: siteUrlSchema,
  apiKey: z
    .string()
    .trim()
    .min(10, "Enter the API key from Bing Webmaster Tools → Settings → API access.")
    .max(200),
});

/**
 * A GA4 property is chosen from the list Google returned for the authorised
 * account, so the id is never free text the user invented.
 */
export const selectAnalyticsPropertySchema = z.object({
  projectId: z.uuid(),
  propertyId: z
    .string()
    .trim()
    .regex(/^\d{6,20}$/, "That is not a GA4 property id."),
  propertyName: z.string().trim().max(200).optional(),
});

// ---------------------------------------------------------------------------
// Billing
// ---------------------------------------------------------------------------

export const startSubscriptionSchema = z.object({
  planCode: z.enum(["pro"]).default("pro"),
});

export const cancelSubscriptionSchema = z.object({
  atPeriodEnd: z.boolean().default(true),
});

export const verifyCheckoutSchema = z.object({
  razorpayPaymentId: z.string().trim().min(4).max(120),
  razorpaySubscriptionId: z.string().trim().min(4).max(120),
  razorpaySignature: z.string().trim().min(16).max(256),
});

// ---------------------------------------------------------------------------
// Settings & admin
// ---------------------------------------------------------------------------

export const projectSettingsSchema = z.object({
  projectId: z.uuid(),
  name: z.string().trim().min(2).max(120).optional(),
  brandName: brandNameSchema.optional(),
  brandAliases: z.array(z.string().trim().min(1).max(120)).max(10).optional(),
  businessCategory: z.string().trim().max(120).optional(),
  businessDescription: z.string().trim().max(1000).optional(),
  targetCountry: countryCodeSchema.optional(),
  targetAudience: z.string().trim().max(300).optional(),
  maxCrawlUrls: z.number().int().min(10).max(10_000).optional(),
  crawlDelayMs: z.number().int().min(0).max(10_000).optional(),
  respectRobots: z.boolean().optional(),
  notificationEmail: z.boolean().optional(),
  notificationInApp: z.boolean().optional(),
});

export const adminPlanConfigSchema = z.object({
  planCode: z.string().trim().min(1).max(40),
  displayName: z.string().trim().min(1).max(120).optional(),
  priceMinor: z.number().int().min(0).optional(),
  trialDays: z.number().int().min(0).max(90).optional(),
  razorpayPlanId: z.string().trim().max(120).nullish(),
  limits: z.record(z.string(), z.number().int().min(0)).optional(),
  features: z.record(z.string(), z.boolean()).optional(),
});

// ---------------------------------------------------------------------------
// Admin CRM: blog posts and scoped admin grants
// ---------------------------------------------------------------------------

export const blogSlugSchema = z
  .string()
  .trim()
  .toLowerCase()
  .min(3, "Slug must be at least 3 characters.")
  .max(120, "Slug is too long.")
  .regex(/^[a-z0-9]+(?:-[a-z0-9]+)*$/, "Use lowercase letters, numbers and hyphens only.");

export const blogPostSchema = z.object({
  title: z.string().trim().min(3, "Enter a title.").max(200),
  slug: blogSlugSchema,
  excerpt: z.string().trim().max(300).optional(),
  bodyMarkdown: z.string().trim().min(20, "Write at least a short body."),
  coverImageUrl: z.union([z.url(), z.literal("")]).optional(),
  authorName: z.string().trim().min(1).max(120).optional(),
  isPublished: z.boolean().optional(),
});

export const blogPostUpdateSchema = blogPostSchema.partial().extend({ id: z.uuid() });

export const adminResourceSchema = z.enum(["leads", "blog"]);

export const adminGrantSchema = z.object({
  email: z.email("Enter a valid email address.").trim().toLowerCase(),
  resource: adminResourceSchema,
});

/** One resource granted to many emails at once, pasted one per line or comma-separated. */
export const adminGrantBulkSchema = z.object({
  emails: z
    .string()
    .trim()
    .min(1, "Enter at least one email address.")
    .transform((value) =>
      value
        .split(/[\n,]/)
        .map((entry) => entry.trim().toLowerCase())
        .filter((entry) => entry.length > 0),
    )
    .pipe(z.array(z.email("One of those addresses is not valid.")).min(1).max(200)),
  resource: adminResourceSchema,
});

export type SignUpInput = z.infer<typeof signUpSchema>;
export type SignInInput = z.infer<typeof signInSchema>;
export type CompleteOnboardingInput = z.infer<typeof completeOnboardingSchema>;
export type PromptInput = z.infer<typeof promptInputSchema>;
export type ContentAnalysisInput = z.infer<typeof contentAnalysisSchema>;
