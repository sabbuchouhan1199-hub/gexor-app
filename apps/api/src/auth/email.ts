import { AuthDomainError } from "./auth-errors.js";

export const MAX_EMAIL_LENGTH = 254;

const LOCAL_PART_PATTERN = /^[a-z0-9!#$%&'*+/=?^_`{|}~.-]+$/i;
const DOMAIN_LABEL_PATTERN = /^[a-z0-9](?:[a-z0-9-]{0,61}[a-z0-9])?$/i;

export function normalizeEmail(input: string): string {
  const email = input.trim().toLowerCase();

  if (
    email.length === 0
    || email.length > MAX_EMAIL_LENGTH
    || /\s/.test(email)
  ) {
    throw new AuthDomainError("INVALID_EMAIL");
  }

  const separator = email.indexOf("@");
  if (separator <= 0 || separator !== email.lastIndexOf("@")) {
    throw new AuthDomainError("INVALID_EMAIL");
  }

  const localPart = email.slice(0, separator);
  const domain = email.slice(separator + 1);

  if (
    localPart.length > 64
    || !LOCAL_PART_PATTERN.test(localPart)
    || localPart.startsWith(".")
    || localPart.endsWith(".")
    || localPart.includes("..")
  ) {
    throw new AuthDomainError("INVALID_EMAIL");
  }

  const labels = domain.split(".");
  if (
    labels.length < 2
    || domain.length > 253
    || labels.some((label) => !DOMAIN_LABEL_PATTERN.test(label))
  ) {
    throw new AuthDomainError("INVALID_EMAIL");
  }

  return email;
}
