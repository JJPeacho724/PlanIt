import { keepEventByTypeAndDuration, filterDrafts } from '../../events/generate/route'

function mk(title: string, minutes: number) {
  const start = new Date('2024-01-01T10:00:00.000Z')
  const end = new Date(start.getTime() + minutes * 60000)
  return { title, start, end }
}

describe('events generate filtering', () => {
  it('keeps focused work blocks, not only meetings', () => {
    const drafts = filterDrafts([
      mk('Write essay draft', 50),
      mk('Team meeting', 30),
      mk('Clean room', 25),
      mk('Quick stretch', 10), // should drop (too short)
    ], { planning: { eventCapPerDay: 6 } })
    const titles = drafts.map(d => d.title)
    expect(titles).toEqual(expect.arrayContaining(['Write essay draft','Clean room','Team meeting']))
    expect(titles).not.toEqual(expect.arrayContaining(['Quick stretch']))
  })
})


