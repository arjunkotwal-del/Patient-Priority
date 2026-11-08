// Doctor logins have user ids like "doctor|<doctor id>". Auth0 logins never do, so they are
// always patients. Kept separate so db.js and doctorAuth.js can both use it.
const PREFIX = 'doctor|';

export const doctorUserId = (doctorId) => `${PREFIX}${doctorId}`;
export const isDoctorUserId = (userId) => typeof userId === 'string' && userId.startsWith(PREFIX);
export const doctorIdFromUserId = (userId) => (isDoctorUserId(userId) ? userId.slice(PREFIX.length) : null);
