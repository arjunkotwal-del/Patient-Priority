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
   Use two different accounts. Only `db:setup` can make someone a doctor.
5. `npm run dev`, and `npm test` to run the tests.

## Visit status

```
interviewing -> waiting_for_doctor <-> doctor_asked -> resolved
      \                 \                   \
       `-----------------`-------------------`--> escalated (go to the triage desk)
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

### Send a message: `POST /api/visits/:id/messages`
```json
{ "text": "No" }
```
- While `interviewing`: the answer to the AI question. Returns the next step response.
- While `waiting_for_doctor` or `doctor_asked`: a reply to the doctor. Returns `{ visitId, status }`. A red flag in the reply returns the escalated response.
- Resolved or escalated visits return `409 visit_closed`.

**Disable the send button until the response arrives.** Two quick taps can create two AI questions.

### See a visit: `GET /api/visits/:id`
The patient view. It never contains the SOAP note, red flags, CTAS levels or doctor notes.
```json
{
  "id": 12, "status": "resolved", "complaint": "My throat really hurts",
  "startedAt": "2026-11-07T15:00:00.000Z", "resolvedAt": "2026-11-07T15:40:00.000Z",
  "doctorName": "Dr. Sam Rivera (demo)", "diagnosis": "Viral sore throat", "plan": "Rest and fluids.",
  "messages": [
    { "from": "patient", "kind": "answer", "text": "My throat really hurts", "sentAt": "...", "options": null },
    { "from": "ai", "kind": "question", "text": "Is it hard to swallow your own spit?", "options": ["Yes", "No"], "sentAt": "..." },
    { "from": "doctor", "kind": "plan", "text": "Rest, fluids and ibuprofen.", "sentAt": "..." }
  ],
  "prescriptions": [{ "medication": "Ibuprofen", "dose": "400 mg", "frequency": "Every 8 hours as needed",
                      "duration": "3 days", "instructions": "Take with food.", "prescribedAt": "...", "doctorName": "..." }],
  "orders": [{ "type": "lab", "name": "Throat swab", "instructions": "Only if not better in 3 days.", "orderedAt": "...", "doctorName": "..." }],
  "unreadCount": 1
}
```
`from` is `patient`, `ai` or `doctor`. `kind` is `question`, `answer` or `plan`. Order `type` is `lab`, `imaging`, `referral` or `other`.

### All my visits: `GET /api/me/visits`
```json
{ "visits": [{ "id": 12, "complaint": "...", "status": "doctor_asked", "startedAt": "...", "resolvedAt": null,
               "doctorName": "Dr. Sam Rivera (demo)", "unreadCount": 1 }],
  "unreadTotal": 1 }
```
Use `unreadTotal` for the notification badge.

### Mark as read: `POST /api/visits/:id/read`
Call it when the patient opens the visit. Returns `{ "ok": true }`.

---

## Doctor routes

Every doctor route returns `403 forbidden` for anyone who isn't a doctor. Every open and change is written to the access log.

| Route | Body | Returns |
|---|---|---|
| `GET /api/doctor/queue` | | `{ queue: QueueItem[] }`, most urgent CTAS first, then longest wait |
| `POST /api/doctor/visits/:id/claim` | | `{ ok: true }`, or `409 claimed_by_other` |
| `GET /api/doctor/visits/:id` | | `{ visit, notes, history }` (also marks it read for the doctor) |
| `POST /api/doctor/visits/:id/messages` | `{ kind: "question" \| "plan", text }` | `201`. A question sets status to `doctor_asked` |
| `POST /api/doctor/visits/:id/prescriptions` | `{ medication, dose, frequency, duration, instructions? }` | `201` |
| `POST /api/doctor/visits/:id/orders` | `{ type: "lab" \| "imaging" \| "referral" \| "other", name, instructions? }` | `201` |
| `POST /api/doctor/visits/:id/notes` | `{ text }` | `201`. Private: never shown to the patient or the AI |
| `POST /api/doctor/visits/:id/resolve` | `{ diagnosis, plan, confirmedCtas: 4 \| 5, ctasOverrideReason?, summary? }` | `{ ok: true }` |
| `POST /api/doctor/visits/:id/escalate` | `{ reason }` | `{ ok: true }` |

`QueueItem`:
```json
{ "visitId": 12, "patientId": "p_...", "complaint": "Ear pain", "status": "waiting_for_doctor",
  "suggestedCtas": 4, "startedAt": "...", "waitingMinutes": 25,
  "assignedDoctor": { "id": "demo-dr-rivera", "name": "Dr. Sam Rivera (demo)" }, "unreadForDoctor": 2 }
```

The case view's `visit` has everything: `soap`, `suggestedCtas`, `redFlags`, `premadeAnswers`, `messages`, `prescriptions`, `orders`.
`history` is the patient's allergies, medications, conditions and past visits. `notes` are the private notes.

Rules the server enforces:
- Messaging, prescribing, ordering, resolving or escalating claims the case. If another doctor has it, you get `409 claimed_by_other` with their name. Anyone can still view it and add notes.
- If `confirmedCtas` differs from the AI's `suggestedCtas`, `ctasOverrideReason` is required.
- CTAS 1 to 3 is not minor: use `escalate`, not `resolve`.
- Resolved and escalated cases can't be changed (`409 visit_closed`). Notes are always allowed.

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
    if (e.reason === 'doctor_message') notifyIfHidden('Your doctor replied', 'Tap to read it.', `/visits/${e.visitId}`);
  },
}), []);
```
Call `askNotificationPermission()` from a button click (browsers block it otherwise).

Events are `{ visitId, reason }` only. Refetch to see what changed.

| reason | Patient gets it | Doctors get it |
|---|---|---|
| `new_case` | | Yes |
| `patient_message` | | Yes |
| `doctor_message` | Yes | Yes |
| `doctor_update` (prescription or test) | Yes | |
| `status_changed` | When resolved or escalated | Yes |

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
| 409 | `visit_closed` | The visit is resolved or escalated |
| 409 | `claimed_by_other` | Another doctor has the case |
| 503 | `records_unavailable` | The database isn't reachable |
| 500 | `server_error` | Anything else |

---

## Old routes: don't use them

`POST /api/interview`, `POST /api/summary` and `POST /api/chat/scan` are the first version, where the
browser held the whole interview. `/api/summary` sends the SOAP note to the browser, which patients
must never see. The routes above replace all three. They'll be removed once nothing calls them.
