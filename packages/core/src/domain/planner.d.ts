import { TaskInput } from './task';
export interface PlanResult {
    title?: string;
    summary?: string;
    tasks?: TaskInput[];
    reply: string;
}
export interface BuildPlanArgs {
    message: string;
    now: Date;
}
export declare function naivePlanner({ message }: BuildPlanArgs): PlanResult;
//# sourceMappingURL=planner.d.ts.map