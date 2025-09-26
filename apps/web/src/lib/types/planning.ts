export type EvidenceLink = { title: string; url: string; why: string };

export type SpecificAction = {
  id: string; // stable hash of title+start
  title: string; // imperative + noun, e.g., "Draft PRD v0.1 for Campus Laundry"
  summary: string; // one-sentence outcome
  deliverable: {
    // concrete artifact
    kind: 'doc' | 'deck' | 'form' | 'code' | 'email' | 'application' | 'other'
    pathHint?: string; // e.g., "/PM/Week1/PRD-v0.1.md"
    acceptanceCriteria: string[]; // checkable bullet points
  };
  resources: EvidenceLink[]; // 1–3 items, deduped
  checklist: string[]; // prep steps
  startISO: string; // user TZ aware upstream, stored as ISO
  endISO: string;
  tags: string[]; // e.g., ["PM","portfolio","networking"]
  dependsOn?: string[]; // ids of other SpecificAction
  confidence: number; // 0–1
  specificityScore: number; // 0–1
};

export type EventPlanV2 = { actions: SpecificAction[]; planNotes?: string };



