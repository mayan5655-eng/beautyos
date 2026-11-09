// app/dashboard/feedback/page.tsx
// "מה הלקוחות אמרו": the answers to her review requests and the private notes (app/VisitFeedbackPanel.jsx). Where the
// "a client wrote you something private" notification opens.
import FeedbackScreen from './FeedbackScreen';

export const dynamic = 'force-dynamic';

export const metadata = { title: 'מה הלקוחות אמרו' };

export default function FeedbackPage() {
  return <FeedbackScreen />;
}
