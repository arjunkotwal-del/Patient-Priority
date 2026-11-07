// Fake doctor, chats and prescriptions for the demo patients' past visits.
// Used only by npm run db:setup. DEMO CONTENT: not clinical advice.

export const DEMO_DOCTOR = { id: 'demo-dr-rivera', name: 'Dr. Sam Rivera (demo)', licenseNumber: 'DEMO-0001' };

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
      [25, 'doctor', 'question', 'Is the swelling on the outside of the ankle?'],
      [27, 'patient', 'answer', 'Yes, the outside.'],
      [30, 'doctor', 'plan', 'Rest, ice for 20 minutes a few times a day, compression, and keep it raised. Take the ibuprofen with food.'],
    ],
    prescriptions: [
      { medication: 'Ibuprofen', dose: '400 mg', frequency: 'Every 8 hours as needed', duration: '5 days', instructions: 'Take with food.' },
    ],
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
