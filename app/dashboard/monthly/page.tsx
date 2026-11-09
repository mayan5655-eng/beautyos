// app/dashboard/monthly/page.tsx
// "הדוח החודשי שלך": one whole month on one page, where the note on the 1st opens. The work is in MonthlyScreen.
import MonthlyScreen from './MonthlyScreen';

export const dynamic = 'force-dynamic';

export const metadata = { title: 'הדוח החודשי שלך' };

export default function MonthlyPage() {
  return <MonthlyScreen />;
}
