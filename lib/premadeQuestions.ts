// Asked to every patient, in this order. The team can edit this list freely.
// `choices` shows tap-to-answer buttons instead of a text box. Every question can be skipped.
// Keep "1 to 10" in the pain question: lib/priority.ts reads the pain score from it.
export const PREMADE_QUESTIONS: { id: string; text: string; choices?: string[] }[] = [
  { id: 'onset', text: 'When did it start?', choices: ['Today', '1 to 3 days ago', '4 to 7 days ago', 'Over a week ago'] },
  { id: 'severity', text: 'How bad is it, on a scale of 1 to 10?', choices: ['1', '2', '3', '4', '5', '6', '7', '8', '9', '10'] },
  { id: 'trend', text: 'Is it getting better, worse, or staying the same?', choices: ['Getting better', 'Staying the same', 'Getting worse'] },
  { id: 'recent_activity', text: "What did you do in the past week that might've caused this?" },
  { id: 'tried', text: 'What have you taken for it?' },
  { id: 'allergies', text: 'Do you have any medication allergies?' },
  { id: 'current_meds', text: 'What medications are you taking right now?' },
  { id: 'had_before', text: 'Have you had this before?', choices: ['Yes', 'No', 'Not sure'] },
];
