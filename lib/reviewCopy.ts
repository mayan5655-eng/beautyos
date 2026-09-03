// lib/reviewCopy.ts
//
// The one sentence that sits above the Google button on the review thank-you
// screen, in one place so it cannot drift between here and anywhere it is
// reused later.
//
// It is worded as a favour rather than a request, and it is shown to EVERYONE
// who submitted, whatever they rated. Routing only the happy ones to Google is
// review gating: it is against Google's policy, it is obvious from the outside,
// and a rating that has been filtered is worth nothing to the person reading it.

export const GOOGLE_REVIEW_NOTE =
  'אם יש לך עוד רגע, ביקורת בגוגל עוזרת מאוד לעסק קטן להיות נמצא.';
