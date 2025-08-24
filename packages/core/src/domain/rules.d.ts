import { z } from 'zod';
export type MessageLike = {
    subject?: string | null;
    text?: string | null;
    headers?: Record<string, string | undefined>;
};
export declare const ActionCandidateSchema: z.ZodObject<{
    isActionable: z.ZodBoolean;
    reasons: z.ZodDefault<z.ZodArray<z.ZodString, "many">>;
}, "strip", z.ZodTypeAny, {
    isActionable: boolean;
    reasons: string[];
}, {
    isActionable: boolean;
    reasons?: string[] | undefined;
}>;
export type ActionCandidate = z.infer<typeof ActionCandidateSchema>;
export declare function evaluateMessageForAction(message: MessageLike): ActionCandidate;
export type SourcePointer = {
    source: 'EMAIL' | 'SLACK';
    id: string;
    receivedAt?: Date;
    url?: string;
};
//# sourceMappingURL=rules.d.ts.map