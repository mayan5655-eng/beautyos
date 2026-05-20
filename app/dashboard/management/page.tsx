'use client';

import Link from 'next/link';

export default function ManagementPage() {
  return (
    <div dir="rtl" className="min-h-screen bg-gradient-to-br from-blue-50 via-cyan-50 to-white p-8">
      <div className="max-w-7xl mx-auto mb-6">
        <Link href="/dashboard" className="text-blue-600 hover:text-blue-800 font-semibold">
          ← חזרה לדשבורד
        </Link>
      </div>
      <div className="max-w-7xl mx-auto mb-12">
        <div className="bg-gradient-to-l from-blue-600 via-cyan-500 to-cyan-400 rounded-3xl shadow-2xl p-10 text-white">
          <h1 className="text-5xl font-bold mb-3">📋 ניהול</h1>
          <p className="text-blue-100 text-xl">כל הכלים לניהול היומיומי של העסק</p>
        </div>
      </div>
      <div className="max-w-7xl mx-auto grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-6">
        <Link href="/dashboard/calendar" className="group bg-white rounded-2xl shadow-md hover:shadow-xl transition-all p-8 border-2 border-transparent hover:border-blue-300 hover:-translate-y-1">
          <div className="text-5xl mb-4 group-hover:scale-110 transition-transform inline-block">📅</div>
          <h3 className="text-2xl font-bold text-gray-800 mb-2">יומן</h3>
          <p className="text-gray-600">ניהול תורים וזימונים</p>
        </Link>
        <Link href="/dashboard/customers" className="group bg-white rounded-2xl shadow-md hover:shadow-xl transition-all p-8 border-2 border-transparent hover:border-blue-300 hover:-translate-y-1">
          <div className="text-5xl mb-4 group-hover:scale-110 transition-transform inline-block">👥</div>
          <h3 className="text-2xl font-bold text-gray-800 mb-2">לקוחות</h3>
          <p className="text-gray-600">רשימת לקוחות וכרטיסים</p>
        </Link>
        <Link href="/dashboard/packages" className="group bg-white rounded-2xl shadow-md hover:shadow-xl transition-all p-8 border-2 border-transparent hover:border-blue-300 hover:-translate-y-1">
          <div className="text-5xl mb-4 group-hover:scale-110 transition-transform inline-block">🎁</div>
          <h3 className="text-2xl font-bold text-gray-800 mb-2">חבילות</h3>
          <p className="text-gray-600">חבילות טיפולים ומוצרים</p>
        </Link>
        <Link href="/dashboard/settings" className="group bg-white rounded-2xl shadow-md hover:shadow-xl transition-all p-8 border-2 border-transparent hover:border-blue-300 hover:-translate-y-1">
          <div className="text-5xl mb-4 group-hover:scale-110 transition-transform inline-block">⚙️</div>
          <h3 className="text-2xl font-bold text-gray-800 mb-2">הגדרות</h3>
          <p className="text-gray-600">הגדרות עסק ופרופיל</p>
        </Link>
      </div>
    </div>
  );
}
