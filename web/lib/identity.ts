/** The same lists and name rules the server uses (server/src/lib/identity.ts) */

export const SUFFIX_OPTIONS = [{ value: "", label: "None" }, ...["Jr.", "Sr.", "II", "III", "IV", "V"].map((s) => ({ value: s, label: s }))];

export const ID_TYPE_OPTIONS = [
  { value: "PHILSYS", label: "PhilSys National ID" },
  { value: "DRIVERS_LICENSE", label: "Driver's license" },
  { value: "PASSPORT", label: "Passport" },
  { value: "UMID", label: "UMID" },
  { value: "SSS", label: "SSS ID" },
  { value: "PRC", label: "PRC ID" },
  { value: "POSTAL", label: "Postal ID" },
  { value: "VOTERS", label: "Voter's ID" },
  { value: "PHILHEALTH", label: "PhilHealth ID" },
  { value: "TIN", label: "TIN ID" },
  { value: "SENIOR", label: "Senior citizen ID" },
  { value: "PWD", label: "PWD ID" },
  { value: "STUDENT", label: "School ID (students)" },
];

export const idTypeLabel = (value: string | null | undefined) => ID_TYPE_OPTIONS.find((o) => o.value === value)?.label ?? "Valid ID";

const NAME = /^\p{L}[\p{L}\p{M} .'-]*$/u;
const NOT_A_NAME = new Set(["test", "testing", "tester", "asdf", "asd", "qwerty", "admin", "user", "sample", "fake", "anonymous", "anon", "unknown", "none", "null", "xxx", "abc", "abcd", "name", "firstname", "lastname", "surname", "noname", "nobody"]);

/** What's wrong with one part of a name, or null. `required` for the first and last name. */
export function nameProblem(value: string, what: string, required: boolean) {
  const v = value.trim();
  if (!v) return required ? `Enter your ${what}, as on your ID.` : null;
  if (/\d/.test(v)) return `A ${what} has no numbers.`;
  if (!NAME.test(v)) return `Use letters only in the ${what}.`;
  if (/(\p{L})\1\1/iu.test(v) || NOT_A_NAME.has(v.toLowerCase().replace(/[^a-z]/g, ""))) return `Enter your real ${what}, as on your ID.`;
  if (required && v.replace(/[^\p{L}]/gu, "").length < 2) return `Enter your ${what}, as on your ID.`;
  return null;
}

/** For an account made before names were split: everything but the last word, and the last word */
export function splitName(name: string) {
  const words = name.trim().split(/\s+/);
  if (words.length < 2) return { firstName: name.trim(), lastName: "" };
  return { firstName: words.slice(0, -1).join(" "), lastName: words.at(-1)! };
}
