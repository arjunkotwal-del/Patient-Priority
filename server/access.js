// Who is allowed to do what. Use these after requireUser (the Auth0 login check),
// which sets req.userId.
//
//   api.get('/visits/:id', requirePatient, requireOwnVisit, handler)   -> patient, own visits only
//   api.get('/doctor/queue', requireDoctor, handler)                   -> doctors only
import * as db from './db.js';
import { isDoctorUserId } from './doctorIds.js';

/** Builds the middleware. Tests pass fake lookups; the app uses the real database. */
export function createAccess(lookups = db) {
  const unavailable = (res) =>
    res.status(503).json({ code: 'records_unavailable', message: 'Patient records are unavailable right now. Please try again soon.' });
  const handle = (fn) => async (req, res, next) => {
    try {
      await fn(req, res, next);
    } catch (err) {
      if (err instanceof db.DatabaseUnavailableError) return unavailable(res);
      next(err);
    }
  };

  return {
    /** Sets req.patientId for the logged-in user, creating their patient record on first use. Doctors get 403. */
    requirePatient: handle(async (req, res, next) => {
      // Doctor logins never get a patient record (or a health card).
      if (isDoctorUserId(req.userId)) return res.status(403).json({ code: 'forbidden', message: 'Doctor accounts cannot use the patient side.' });
      req.patientId = await lookups.getOrCreatePatientId(req.userId);
      next();
    }),

    /** Only lets doctors through. Sets req.doctor = { id, name }. */
    requireDoctor: handle(async (req, res, next) => {
      const doctor = await lookups.getDoctorForUser(req.userId);
      if (!doctor) return res.status(403).json({ code: 'forbidden', message: 'Only doctors can do this.' });
      req.doctor = doctor;
      next();
    }),

    /**
     * Use after requirePatient on routes with :id. Sets req.visitId.
     * Someone else's visit gets the same 404 as a missing one, so ids can't be probed.
     */
    requireOwnVisit: handle(async (req, res, next) => {
      const visitId = parseVisitId(req.params.id);
      const owner = visitId && (await lookups.getVisitPatientId(visitId));
      if (!owner || owner !== req.patientId) return res.status(404).json({ code: 'not_found', message: 'Visit not found.' });
      req.visitId = visitId;
      next();
    }),

    /** Use after requireDoctor on routes with :id. Doctors can open any visit that exists. */
    requireVisit: handle(async (req, res, next) => {
      const visitId = parseVisitId(req.params.id);
      if (!visitId || !(await lookups.getVisitPatientId(visitId))) {
        return res.status(404).json({ code: 'not_found', message: 'Visit not found.' });
      }
      req.visitId = visitId;
      next();
    }),
  };
}

/** Visit ids are positive whole numbers. Anything else is treated as not found. */
export function parseVisitId(value) {
  return /^[1-9]\d{0,15}$/.test(String(value)) ? Number(value) : null;
}

export const { requirePatient, requireDoctor, requireOwnVisit, requireVisit } = createAccess();
