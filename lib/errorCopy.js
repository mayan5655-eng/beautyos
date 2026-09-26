// lib/errorCopy.js
//
// What she reads when something goes wrong. One voice, in one place.
//
// The rule: say whose fault it was (not hers), say what did and did not happen,
// and never leave her wondering whether her data is safe. A message that only
// says "failed" makes her imagine the worst; these say what is still fine.
//
// Truthfulness beats comfort: a save that did not happen says so. The reassurance
// is only ever about what is genuinely unaffected. No em-dashes (see planCopy).

/** Unknown trouble on our side. */
export const STUCK_HE = "משהו נתקע אצלנו, לא אצלך. הנתונים שלך שמורים. נסי שוב בעוד רגע, ואם זה חוזר, כתבי לנו ונטפל.";

/** A write that did not go through. What was saved before is untouched. */
export const SAVE_FAILED_HE = "לא הצלחנו לשמור את זה. מה ששמור כבר לא נפגע. נסי שוב בעוד רגע.";

/** A read that failed. Nothing is lost by not seeing it right now. */
export const LOAD_FAILED_HE = "לא הצלחנו לטעון את זה עכשיו, והנתונים שלך שמורים. נסי לרענן, ואם זה חוזר, כתבי לנו.";

/** Something we were going to send for her did not go. */
export const SEND_FAILED_HE = "ההודעה לא יצאה. לא נשלח כלום בשמך. אפשר לנסות שוב או לשלוח ידנית.";

/** For a client on the public page: same idea, no "write to us". */
export const CLIENT_STUCK_HE = "משהו נתקע אצלנו, לא אצלך. נסי שוב בעוד רגע.";

/** The action-specific ones: what did not happen, and that nothing else changed. */
export const couldNotHe = (what) => "לא הצלחנו " + what + ". נסי שוב בעוד רגע.";
