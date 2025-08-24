import { z } from 'zod';
declare const envSchema: z.ZodObject<{
    DATABASE_URL: z.ZodString;
    NEXTAUTH_URL: z.ZodUnion<[z.ZodOptional<z.ZodString>, z.ZodString]>;
    NEXTAUTH_SECRET: z.ZodString;
    GOOGLE_CLIENT_ID: z.ZodString;
    GOOGLE_CLIENT_SECRET: z.ZodString;
    OPENAI_API_KEY: z.ZodString;
    SLACK_CLIENT_ID: z.ZodDefault<z.ZodOptional<z.ZodString>>;
    SLACK_CLIENT_SECRET: z.ZodDefault<z.ZodOptional<z.ZodString>>;
    SLACK_SIGNING_SECRET: z.ZodDefault<z.ZodOptional<z.ZodString>>;
    ENCRYPTION_KEY: z.ZodString;
}, "strip", z.ZodTypeAny, {
    DATABASE_URL: string;
    NEXTAUTH_SECRET: string;
    GOOGLE_CLIENT_ID: string;
    GOOGLE_CLIENT_SECRET: string;
    OPENAI_API_KEY: string;
    SLACK_CLIENT_ID: string;
    SLACK_CLIENT_SECRET: string;
    SLACK_SIGNING_SECRET: string;
    ENCRYPTION_KEY: string;
    NEXTAUTH_URL?: string | undefined;
}, {
    DATABASE_URL: string;
    NEXTAUTH_SECRET: string;
    GOOGLE_CLIENT_ID: string;
    GOOGLE_CLIENT_SECRET: string;
    OPENAI_API_KEY: string;
    ENCRYPTION_KEY: string;
    NEXTAUTH_URL?: string | undefined;
    SLACK_CLIENT_ID?: string | undefined;
    SLACK_CLIENT_SECRET?: string | undefined;
    SLACK_SIGNING_SECRET?: string | undefined;
}>;
export type Env = z.infer<typeof envSchema>;
export declare const env: Env;
export {};
//# sourceMappingURL=env.d.ts.map