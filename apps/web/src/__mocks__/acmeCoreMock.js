module.exports = {
  env: {
    OPENAI_API_KEY: 'test-key',
    DATABASE_URL: 'postgres://user:pass@localhost:5432/db',
  },
  buildPlan: (...args) => ({
    events: [],
    dailyPlan: [],
    weeklyRollup: [],
    unscheduledTaskIds: []
  }),
}


