// Fake doctor, chats and prescriptions for the demo patients' past visits.
// Used only by npm run db:setup. DEMO CONTENT: not clinical advice.

export const DEMO_DOCTOR = { id: 'demo-dr-rivera', name: 'Dr. Sam Rivera (demo)', licenseNumber: 'DEMO-0001' };
/** The demo doctor's login. Read when called, after .env.local is loaded. */
export const DEMO_DOCTOR_LOGIN = () => ({
  email: (process.env.DEMO_DOCTOR_EMAIL?.trim() || 'doctor@example.com').toLowerCase(),
  password: process.env.DEMO_DOCTOR_PASSWORD?.trim() || 'DemoDoctor123!',
});

// Cases waiting in the doctor queue right now, so the dashboard has something to show.
// Each message is [minutes after check-in, sender, kind, text].
export const DEMO_OPEN_CASES = [
  {
    patientId: 'demo-priya',
    complaint: 'Ear pain',
    minutesAgo: 25,
    suggestedCtas: 4,
    priority: 'high',
    priorityReasons: ['AI rated medium: Moderate one-sided ear pain', 'Keyword: Getting worse'],
    soap: {
      subjective: 'Right ear pain since yesterday, pain 5/10, getting worse. Denies fever and ear discharge. Allergies: sulfa drugs, latex.',
      assessment: 'Worsening one-sided ear pain with no reported red flags. Presents as minor.',
      plan: 'For doctor review. Hearing changes were not reported.',
    },
    messages: [
      [0, 'patient', 'answer', 'My right ear has hurt since yesterday and it is getting worse.'],
      [1, 'ai', 'question', 'Do you have a fever?'],
      [1, 'patient', 'answer', 'No'],
      [2, 'ai', 'question', 'Is any fluid coming out of the ear?'],
      [2, 'patient', 'answer', 'No'],
      [3, 'ai', 'question', 'How bad is the pain from 1 to 10?'],
      [3, 'patient', 'answer', '5'],
    ],
  },
];

// Keyed by "patientId:visitDate". Each message is [minutes after check-in, sender, kind, text].
export const DEMO_VISIT_DETAILS = {
  'demo-maya:2026-03-14': {
    startTime: '10:05',
    diagnosis: 'Viral sore throat',
    confirmedCtas: 5,
    messages: [
      [0, 'patient', 'answer', 'My throat has been sore for 3 days.'],
      [1, 'ai', 'question', 'Is it hard to swallow your own spit?'],
      [1, 'patient', 'answer', 'No'],
      [2, 'ai', 'question', 'Do you have a fever?'],
      [2, 'patient', 'answer', 'No'],
      [40, 'doctor', 'plan', 'This looks viral, so antibiotics will not help. Drink plenty of fluids and rest. Come back if you get a fever or trouble swallowing.'],
    ],
    prescriptions: [],
  },
  'demo-daniel:2026-08-02': {
    startTime: '18:20',
    diagnosis: 'Mild left ankle sprain',
    confirmedCtas: 5,
    messages: [
      [0, 'patient', 'answer', 'I rolled my left ankle playing soccer.'],
      [1, 'ai', 'question', 'Right after it happened, could you walk at least 4 steps on it?'],
      [1, 'patient', 'answer', 'Yes'],
      [30, 'doctor', 'plan', 'Rest, ice for 20 minutes a few times a day, compression, and keep it raised. Take the ibuprofen with food.'],
    ],
    prescriptions: [
      { medication: 'Ibuprofen', dose: '400 mg', frequency: 'Every 8 hours as needed', duration: '5 days', instructions: 'Take with food.' },
    ],
    // [minutes after check-in, text]
    doctorNotes: [[28, 'Diabetic, so ask about foot numbness at any follow-up. Short ibuprofen course only.']],
    // [minutes after check-in, type, name, instructions]
    orders: [[30, 'referral', 'Physiotherapy assessment', 'Book an appointment if you are not walking normally in 2 weeks.']],
  },
  'demo-daniel:2025-11-20': {
    startTime: '14:10',
    diagnosis: 'Contact dermatitis',
    confirmedCtas: 5,
    messages: [
      [0, 'patient', 'answer', 'Itchy rash on my forearm after gardening.'],
      [1, 'ai', 'question', 'Is the rash spreading quickly?'],
      [1, 'patient', 'answer', 'No'],
      [35, 'doctor', 'plan', 'Avoid the plant you touched and use the cream twice a day.'],
    ],
    prescriptions: [
      { medication: 'Hydrocortisone 1% cream', dose: 'Thin layer', frequency: 'Twice daily', duration: '7 days', instructions: 'Apply to the rash only.' },
    ],
  },
};
