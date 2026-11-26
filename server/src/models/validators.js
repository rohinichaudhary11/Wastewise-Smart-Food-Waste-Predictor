const dateOnlyPattern = /^\d{4}-\d{2}-\d{2}$/;

export function isDateOnly(value) {
  if (typeof value !== 'string' || !dateOnlyPattern.test(value)) return false;
  const date = new Date(`${value}T00:00:00.000Z`);
  return !Number.isNaN(date.getTime()) && date.toISOString().slice(0, 10) === value;
}

export const dateOnlyValidator = {
  validator: isDateOnly,
  message: 'Date must be a real calendar date in YYYY-MM-DD format'
};
