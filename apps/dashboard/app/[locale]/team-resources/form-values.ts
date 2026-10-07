/** Select value meaning "no linked login account" (Radix selects cannot submit ""). */
export const NO_LINKED_ACCOUNT = "none";

/** Restores the empty value the command parser expects for "no linked account". */
export function membershipChoice(value: FormDataEntryValue | null) {
  return value === NO_LINKED_ACCOUNT ? "" : value;
}
