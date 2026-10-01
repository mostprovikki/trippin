// Mirrors web/src/utils/format.js docTypeLabel — the server needs it only for
// change-feed summaries ("Divya uploaded their visa").
const LABELS = {
  passport: 'Passport', visa: 'Visa', national_id: 'National ID',
  driving_license: 'Driving licence', vaccination: 'Vaccination', other: 'Document'
}
export const docTypeLabel = (t) => LABELS[t] || t
