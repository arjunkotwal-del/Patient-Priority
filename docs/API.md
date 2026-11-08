# PatientPriority API guide

Everything the patient and doctor screens need from the server. Every route below lives
under `/api` and needs the Auth0 access token in a header, except the live stream:

```
Authorization: Bearer <token from getAccessTokenSilently()>
```

## Setup (once per teammate)

1. `npm install`
2. In `.env.local` (never commit it), add `GEMINI_API_KEY`, `GEMINI_MODEL=gemini-3.5-flash-lite` and `DATABASE_URL`.
3. `npm run db:setup` creates the tables and the demo data. **We all share one database, so this resets the demo patients for everyone.** Only run it when that's okay.
4. To use your own logins in the demo, put your Auth0 user ids (Auth0 dashboard > User Management > Users) in `.env.local`, then run `npm run db:setup` again:
   ```
   DEMO_DOCTOR_AUTH0_ID=...   # this login becomes Dr. Sam Rivera (demo)
   DEMO_PATIENT_AUTH0_ID=...  # this login becomes a demo patient with history
   DEMO_PATIENT_ID=demo-maya  # or demo-daniel, demo-priya
   ```
   Use two different accounts. To make any other signed-up account a doctor:
   `npm run doctor:add -- <email> "<Full name>" [license]` (and `npm run doctor:remove -- <email>`).
   Only these scripts can make someone a doctor; the app itself can't.
5. `npm run dev`, and `npm test` to run the tests.

## Visit status

There is **no chat between the patient and the doctor**. The patient talks to the AI, then the doctor
answers once: either a reply (like an email, with any prescriptions and tests), or in-person appointment
times for the patient to pick from.

```
interviewing -> waiting_for_doctor -> resolved                       (doctor replied)
                        |
                        `-> appointment_offered -> appointment_booked -> resolved   (doctor replies after the in-person visit)

Any open step can become: escalated (go to the triage desk)
```

Whenever a response has `status: "escalated"`, show the big triage screen with `patientMessage`
(`"Please go to the triage desk now."`) and nothing else. Never show a reason or diagnosis.

---

## Patient routes

### Start a visit: `POST /api/visits`
Send the patient's own words and the premade answers (from `lib/premadeQuestions.ts`).
```json
{
  "complaint": "My throat really hurts",
  "premadeAnswers": [{ "question": "When did it start?", "answer": "3 days ago" }]
}
```
Returns `201` with one of the three **step responses**:
```json
{ "visitId": 12, "status": "interviewing",
  "question": { "text": "Is it hard to swallow your own spit?", "options": ["Yes, really hard", "A little", "No"], "allowOther": true } }
```
```json
{ "visitId": 12, "status": "waiting_for_doctor", "patientMessage": "Thanks. A doctor will review your answers and reply here." }
```
```json
{ "visitId": 12, "status": "escalated", "patientMessage": "Please go to the triage desk now." }
```
Show `options` as buttons. If `allowOther` is true, also show a text box. `options` can be empty: then it's a typed answer.

### Answer the AI: `POST /api/visits/:id/messages`
```json
{ "text": "No" }
```
Returns the next step response. Only works while `interviewing`. After that, it returns
`409 not_interviewing` with a `message` that's safe to show, like "Your answers are with the doctor. They will reply here."

**Disable the send button until the response arrives.** Two quick taps can create two AI questions.

### See a visit: `GET /api/visits/:id`
The patient view. It never contains the SOAP note, red flags, CTAS levels or doctor notes.
```json
{
  "id": 12, "status": "resolved", "complaint": "My throat really hurts",
  "startedAt": "2026-11-07T15:00:00.000Z", "resolvedAt": "2026-11-07T15:40:00.000Z",
  "doctorName": "Dr. Sam Rivera (demo)", "diagnosis": "Viral sore throat", "plan": "Rest and fluids.",
  "premadeAnswers": [{ "question": "When did it start?", "answer": "1 to 3 days ago" }],
  "messages": [
    { "from": "patient", "kind": "answer", "text": "My throat really hurts", "sentAt": "...", "options": null },
    { "from": "ai", "kind": "question", "text": "Is it hard to swallow your own spit?", "options": ["Yes", "No"], "sentAt": "..." },
    { "from": "doctor", "kind": "plan", "text": "Rest, fluids and ibuprofen.", "sentAt": "..." }
  ],
  "prescriptions": [{ "medication": "Ibuprofen", "dose": "400 mg", "frequency": "Every 8 hours as needed",
                      "duration": "3 days", "instructions": "Take with food.", "prescribedAt": "...", "doctorName": "..." }],
  "orders": [{ "type": "lab", "name": "Throat swab", "instructions": "Only if not better in 3 days.", "orderedAt": "...", "doctorName": "..." }],
  "appointment": null,
  "unreadCount": 1
}
```
`from` is `patient`, `ai` or `doctor`. `kind` is `question`, `answer`, `plan` (the doctor's reply) or `appointment`
(the doctor's message offering times). Order `type` is `lab`, `imaging`, `referral` or `other`.

When the doctor offers an appointment, `status` is `appointment_offered` and `appointment` is filled in:
```json
"appointment": {
  "location": "ER fast track, room 2", "status": "offered", "bookedAt": null, "doctorName": "Dr. Sam Rivera (demo)",
  "slots": [{ "id": 41, "startsAt": "2026-11-08T15:00:00.000Z", "chosen": false },
            { "id": 42, "startsAt": "2026-11-09T14:00:00.000Z", "chosen": false }]
}
```
Show each slot as a button (times are UTC, so format them in the patient's time zone).

### Pick an appointment time: `POST /api/visits/:id/appointment`
```json
{ "slotId": 41 }
```
Returns the updated patient view with `status: "appointment_booked"` and that slot's `chosen: true`.
Returns `409 cannot_book` if the time has passed, it isn't one of the offered slots, or a time was already picked.

### All my visits: `GET /api/me/visits`
```json
{ "visits": [{ "id": 12, "complaint": "...", "status": "appointment_offered", "startedAt": "...", "resolvedAt": null,
               "doctorName": "Dr. Sam Rivera (demo)", "unreadCount": 1 }],
  "unreadTotal": 1 }
```
Use `unreadTotal` for the notification badge.

### Mark as read: `POST /api/visits/:id/read`
Call it when the patient opens the visit. Returns `{ "ok": true }`.

---

## Doctor routes

Every doctor route except `GET /api/doctor/me` returns `403 forbidden` for anyone who isn't a doctor. Every open and change is written to the access log.

| Route | Body | Returns |
|---|---|---|
| `GET /api/doctor/me` | | `{ doctor: { id, name } }` or `{ doctor: null }`. Open to every login: the app uses it to pick the doctor or patient side |
| `GET /api/doctor/queue` | | `{ queue: QueueItem[] }`: cases waiting for an answer, high priority first, then medium, then low, longest wait first within each |
| `GET /api/doctor/appointments` | | `{ appointments: [...] }`: in-person appointments offered or booked, soonest first |
| `POST /api/doctor/visits/:id/claim` | | `{ ok: true }`, or `409 claimed_by_other` |
| `GET /api/doctor/visits/:id` | | `{ visit, notes, history }` (also marks it read for the doctor) |
| `POST /api/doctor/visits/:id/reply` | see below | `{ ok: true }`. Closes the case |
| `POST /api/doctor/visits/:id/appointment` | see below | `201`. Status becomes `appointment_offered` |
| `POST /api/doctor/visits/:id/notes` | `{ text }` | `201`. Private: never shown to the patient or the AI |
| `POST /api/doctor/visits/:id/escalate` | `{ reason }` | `{ ok: true }` |

**The reply** (one message, like an email, with everything in it):
```json
{
  "message": "This looks like a viral sore throat. Rest, fluids, and the ibuprofen below.",
  "diagnosis": "Viral sore throat",
  "confirmedCtas": 5,
  "ctasOverrideReason": "Only needed if confirmedCtas differs from the AI's suggestion",
  "prescriptions": [{ "medication": "Ibuprofen", "dose": "400 mg", "frequency": "Every 8 hours as needed", "duration": "3 days", "instructions": "Take with food." }],
  "orders": [{ "type": "lab", "name": "Throat swab", "instructions": "Only if not better in 3 days." }]
}
```
`prescriptions` and `orders` are optional (up to 10 each). Works on a `waiting_for_doctor` case, or an
`appointment_booked` case after the in-person visit.

**The appointment offer** (in person only, 1 to 4 times, at least 15 minutes ahead and within 60 days):
```json
{
  "message": "I would like to look in your ear in person. Pick a time that works.",
  "location": "ER fast track, room 2",
  "slots": ["2026-11-08T10:00:00-05:00", "2026-11-09T09:00:00-05:00"]
}
```
Only works on a `waiting_for_doctor` case.

`QueueItem`:
```json
{ "visitId": 12, "patientId": "p_...", "complaint": "Ear pain", "status": "waiting_for_doctor",
  "suggestedCtas": 4, "priority": "high", "priorityReasons": ["AI rated medium: Moderate one-sided ear pain", "Keyword: Getting worse"],
  "startedAt": "...", "waitingMinutes": 25,
  "assignedDoctor": { "id": "demo-dr-rivera", "name": "Dr. Sam Rivera (demo)" }, "unreadForDoctor": 2 }
```

**How priority is decided** (`lib/priority.ts`), two layers like the safety check:
1. The AI rates the finished interview `high`, `medium` or `low`, with a short reason.
2. Keyword rules can only raise it: "getting worse", "fever", "severe pain", "can't eat or sleep", "pregnant" or a
   pain score of 7+ make it `high`. Pain 4 to 6 makes it at least `medium`. Whether a condition in the history
   (like diabetes) matters is left to the AI, because it depends on the complaint.
   Negation is understood, so "no fever" doesn't count.

Show `priorityReasons` on the doctor's queue so they can see why. Patients never see priority.

The case view's `visit` has everything: `soap` (the AI summary: `subjective`, `assessment`, `plan`), `suggestedCtas`,
`redFlags`, `premadeAnswers`, `messages`, `prescriptions`, `orders`, `appointment`.
`history` is the patient's allergies, medications, conditions and past visits. `notes` are the private notes.

Rules the server enforces:
- Replying, offering an appointment or escalating claims the case. If another doctor has it, you get `409 claimed_by_other` with their name. Anyone can still view it and add notes.
- One reply per case. Doing something the case's status doesn't allow returns `409 wrong_status`.
- If `confirmedCtas` differs from the AI's `suggestedCtas`, `ctasOverrideReason` is required.
- CTAS 1 to 3 is not minor: use `escalate`, not `reply`.
- Notes are always allowed.

---

## Live updates

Use the helper in `src/lib/live.ts`. It handles tickets and reconnecting.
```ts
import { subscribeToUpdates, notifyIfHidden, askNotificationPermission } from '../lib/live';

useEffect(() => subscribeToUpdates({
  as: 'patient',                         // or 'doctor'
  getToken: getAccessTokenSilently,
  onConnect: refetch,                    // catch up on anything missed while offline
  onEvent: (e) => {
    refetch();
    if (e.reason === 'doctor_reply' || e.reason === 'appointment_offered') notifyIfHidden('Your doctor replied', 'Tap to read it.', `/visits/${e.visitId}`);
  },
}), []);
```
Call `askNotificationPermission()` from a button click (browsers block it otherwise).

Events are `{ visitId, reason }` only. Refetch to see what changed.

| reason | Patient gets it | Doctors get it |
|---|---|---|
| `new_case` | | Yes |
| `doctor_reply` (with any prescriptions and tests) | Yes | Yes |
| `appointment_offered` | Yes | Yes |
| `appointment_booked` | | Yes |
| `status_changed` | When escalated | Yes |

Notifications only appear while the site is open in some tab. Offline patients see the unread badge when they come back.

---

## Errors

Every error is `{ "code": "...", "message": "..." }`. The message is safe to show to the user.

| Status | code | When |
|---|---|---|
| 400 | `bad_request` | Missing or invalid fields |
| 401 | `unauthorized` | Not logged in, or the session expired |
| 401 | `bad_ticket` | Live stream ticket is wrong, used or expired. The helper retries for you |
| 403 | `forbidden` | Not a doctor |
| 404 | `not_found` | The visit doesn't exist or isn't yours |
| 409 | `not_interviewing` | The patient tried to message after the AI interview ended |
| 409 | `cannot_book` | That appointment time can't be booked |
| 409 | `wrong_status` | The doctor tried something the case's status doesn't allow |
| 409 | `claimed_by_other` | Another doctor has the case |
| 503 | `records_unavailable` | The database isn't reachable |
| 500 | `server_error` | Anything else |

---

## Removed routes

`POST /api/interview`, `POST /api/summary` and `POST /api/chat/scan` were the first version, where the
browser held the whole interview and `/api/summary` sent the SOAP note to the browser. They have been
removed. Use the visit routes above instead.
