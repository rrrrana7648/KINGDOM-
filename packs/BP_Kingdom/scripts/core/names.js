/** names.js — Victorian/colonial-era citizen name pools. */

export const MALE_FIRST = [
  "Thomas", "James", "William", "Charles", "George", "Henry", "Robert", "Arthur",
  "Frederick", "Albert", "Samuel", "Joseph", "Edward", "Daniel", "Peter", "Ravi",
  "Hari", "Iqbal", "Arjun", "Mahesh",
];

export const FEMALE_FIRST = [
  "Mary", "Elizabeth", "Sarah", "Margaret", "Ellen", "Florence", "Ada", "Beatrice",
  "Clara", "Edith", "Grace", "Matilda", "Priya", "Kamala", "Meera", "Anita",
  "Fatima", "Lakshmi", "Rose", "Catherine",
];

export const SURNAMES = [
  "Carter", "Fletcher", "Mason", "Cooper", "Bennett", "Hughes", "Sutton", "Webb",
  "Bishop", "Doyle", "Sharma", "Verma", "Patel", "Khan", "Rao", "Mills", "Croft",
  "Dalton", "Frost", "Quill",
];

export const MINISTER_NAME = "Sir Edmund Hale";

function pick(arr, rng = Math.random) {
  return arr[Math.floor(rng() * arr.length)];
}

/** @param {"m"|"f"} sex */
export function makeName(sex, rng = Math.random) {
  const first = sex === "m" ? pick(MALE_FIRST, rng) : pick(FEMALE_FIRST, rng);
  return `${first} ${pick(SURNAMES, rng)}`;
}
