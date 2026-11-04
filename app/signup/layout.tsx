import { hebrewPageMeta } from '@/lib/pageMeta'
import PublicAnalytics from '../PublicAnalytics'

export const metadata = hebrewPageMeta('הרשמה · קלמיה', 'החודש הראשון חינם, בלי כרטיס אשראי.')

export default function SignupLayout({ children }: { children: React.ReactNode }) {
  return <>{children}<PublicAnalytics /></>
}
