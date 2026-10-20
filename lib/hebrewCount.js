// lib/hebrewCount.js
//
// "1 תורים", "1 נמענים", "1 לקוחות" read like a machine wrote them. Hebrew has
// its own words for one and none, and a cosmetician reads these lines every
// day (2026-10-20 new-tenant walk). countHe(n, one, many, none?).
//
//   countHe(1, 'תור אחד', 'תורים')            -> "תור אחד"
//   countHe(3, 'תור אחד', 'תורים')            -> "3 תורים"
//   countHe(0, 'תור אחד', 'תורים', 'אין תורים') -> "אין תורים"

export function countHe(n, one, many, none) {
  const k = Number(n) || 0;
  if (k === 0 && none) return none;
  if (k === 1) return one;
  return `${k} ${many}`;
}
