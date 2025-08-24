export type TaskStatus = 'todo' | 'in_progress' | 'done';
export interface TaskInput {
    title: string;
    description?: string;
    start?: Date;
    end?: Date;
    priority?: number;
}
export interface Task extends TaskInput {
    id: string;
    userId: string;
    status: TaskStatus;
    createdAt: Date;
    updatedAt: Date;
}
//# sourceMappingURL=task.d.ts.map