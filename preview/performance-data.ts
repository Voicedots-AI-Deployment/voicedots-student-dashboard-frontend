export const student = { id: "student-1", full_name: "Asha Kumar", email: "asha@college.edu", roll_number: "CS01",
  photo_url: "/api/student/profile/photo", current_resume_submission_id: "resume-main" };

const day = 24 * 3600 * 1000;
const iso = (daysAgo: number) => new Date(Date.now() - daysAgo * day).toISOString();
const point = (id: string, daysAgo: number, score: number, placement = false, label = "Backend Developer") =>
  ({ session_id: `s-${id}`, at: iso(daysAgo), score, placement, label });
const weeks = (counts: number[]) => ({
  weeks: counts.map((count, index) => ({ week_start: iso((counts.length - index) * 7), week_end: iso((counts.length - 1 - index) * 7), count })),
  active_weeks: counts.filter(Boolean).length,
});
const skill = (dimension: string, label: string, average: number | null, change: number | null = null) =>
  ({ dimension, label, average, latest: average, change });
const lockedReadiness = { overall_score: null, label: null, status: "incomplete", axes: [], drives: [], history: [] };
export const empty = { generated_at: iso(0), pending_release_count: 0, has_results: false, readiness: lockedReadiness, open_opportunities: [],
  summary: null, trend: [], skills: [], strengths: [], focus: [], actions: [], communication: null, activity: weeks([0, 0, 0, 0, 0, 0, 0, 0]), placement_results: [] };

export const full = {
  ...empty,
  pending_release_count: 1,
  has_results: true,
  readiness: { overall_score: 74.4, label: "Interview Ready", status: "ok",
    axes: [{ axis: "interview_readiness", score: 72, weight: 70 }, { axis: "resume_readiness", score: 80, weight: 30 }],
    drives: [{ drive_id: "d1", company_name: "Razorpay", role_title: "Backend Developer", best_score: 72 }], history: [] },
  open_opportunities: [{ drive_id: "d2", company_name: "Freshworks", role_title: "Product Engineer" }],
  summary: {
    released_count: 3, placement_count: 1, practice_count: 2,
    latest: { ...point("3", 3, 78.5, true, "Razorpay · Backend Developer"), change: 17.5, label_readiness: "Interview Ready" },
    recent_average: { score: 61.2, count: 3, label: "Approaching Ready" },
    best: point("3", 3, 78.5, true, "Razorpay · Backend Developer"),
    first_to_latest_change: 34.5,
  },
  trend: [point("1", 40, 44), point("2", 20, 61), point("3", 3, 78.5, true, "Razorpay · Backend Developer")],
  skills: [skill("communication", "Communication", 66.7, 25), skill("resume_ownership", "Resume ownership", 75, 50),
    skill("confidence_conduct", "Confidence", 58.3, 25), skill("structured_thinking", "Structured thinking", 50, 50),
    skill("domain_knowledge", "Domain knowledge", 66.7, 25), skill("applied_evidence", "Applied examples", 50, 50),
    skill("role_awareness", "Role awareness", 58.3, 25)],
  strengths: ["resume_ownership"],
  focus: ["structured_thinking", "applied_evidence", "role_awareness"],
  actions: [{ focus: "Applied Evidence", action: "Prepare one measurable result for each project." }],
  communication: { speaking_speed_wpm: 132, pace_label: "Good", filler_word_count: 3, filler_change: -2, top_filler_words: ["um"],
    scores: { clarity: 75, answer_structure: 50, confidence: 75 } },
  activity: weeks([0, 0, 1, 0, 0, 1, 0, 1]),
  placement_results: [point("3", 3, 78.5, true, "Razorpay · Backend Developer")],
};

