export function naivePlanner({ message }) {
    return {
        title: `Plan: ${message}`,
        summary: `Generated a simple plan for: ${message}`,
        tasks: [{ title: message }],
        reply: `I created a task for: ${message}`,
    };
}
//# sourceMappingURL=planner.js.map