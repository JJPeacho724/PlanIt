import { z } from 'zod';
const envSchema = z.object({
    DATABASE_URL: z.string().url(),
    NEXTAUTH_URL: z.string().url().optional().or(z.string().min(1)),
    NEXTAUTH_SECRET: z.string().min(20),
    GOOGLE_CLIENT_ID: z.string().min(1),
    GOOGLE_CLIENT_SECRET: z.string().min(1),
    OPENAI_API_KEY: z.string().min(1),
    SLACK_CLIENT_ID: z.string().min(1).optional().default(''),
    SLACK_CLIENT_SECRET: z.string().min(1).optional().default(''),
    SLACK_SIGNING_SECRET: z.string().min(1).optional().default(''),
    ENCRYPTION_KEY: z.string().min(44), // 32 bytes base64 is 44 chars
});
export const env = (() => {
    const parsed = envSchema.safeParse({
        DATABASE_URL: process.env.DATABASE_URL,
        NEXTAUTH_URL: process.env.NEXTAUTH_URL,
        NEXTAUTH_SECRET: process.env.NEXTAUTH_SECRET,
        GOOGLE_CLIENT_ID: process.env.GOOGLE_CLIENT_ID,
        GOOGLE_CLIENT_SECRET: process.env.GOOGLE_CLIENT_SECRET,
        OPENAI_API_KEY: process.env.OPENAI_API_KEY,
        SLACK_CLIENT_ID: process.env.SLACK_CLIENT_ID,
        SLACK_CLIENT_SECRET: process.env.SLACK_CLIENT_SECRET,
        SLACK_SIGNING_SECRET: process.env.SLACK_SIGNING_SECRET,
        ENCRYPTION_KEY: process.env.ENCRYPTION_KEY,
    });
    if (!parsed.success) {
        const issues = parsed.error.issues.map(i => `${i.path.join('.')}: ${i.message}`).join('\n');
        throw new Error(`Invalid environment variables:\n${issues}`);
    }
    return parsed.data;
})();
//# sourceMappingURL=env.js.map