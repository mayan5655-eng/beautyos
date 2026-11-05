// app/dashboard/digest/page.tsx
// "הסיכום השבועי שלך": where the Sunday notification and its push open. The work is in DigestScreen.
import DigestScreen from './DigestScreen';

export const dynamic = 'force-dynamic';

export const metadata = { title: 'הסיכום השבועי שלך' };

export default function DigestPage() {
  return <DigestScreen />;
}
