'use client';

import Link from 'next/link';

export default function DashboardPage() {
  return (
    <div dir="rtl" className="min-h-screen bg-gradient-to-br from-purple-50 via-pink-50 to-white p-8">
      <div className="max-w-7xl mx-auto mb-12">
        <div className="bg-gradient-to-l from-purple-600 via-pink-500 to-pink-400 rounded-3xl shadow-2xl p-10 text-white">
          <h1 className="text-5xl font-bold mb-3">ברוכה הבאה ל-BeautyOS</h1>
          <p className="text-purple-100 text-xl">המערכת המלאה לניהול העסק שלך - הכל במקום אחד</p>
        </div>
      </div>
      <div className="max-w-7xl mx-auto grid grid-cols-1 md:grid-cols-3 gap-8">
        <Link
          href="/dashboard/management"
          className="group bg-white rounded-3xl shadow-xl hover:shadow-2xl transition-all duration-300 p-10 border-2 border-transparent hover:border-blue-400 hover:-translate-y-2"
        >
          <div className="bg-gradient-to-br from-blue-500 to-cyan-500 w-20 h-20 rounded-2xl flex items-center justify-center text-5xl mb-6 group-hover:scale-110 transition-transform">📋</div>
          <h2 className="text-3xl font-bold text-gray-800 mb-3">ניהול</h2>
          <p className="text-gray-600 text-lg mb-4">יומן, לקוחות, חבילות וכל הכלים לניהול היומיומי של העסק</p>
          <div className="text-blue-600 font-semibold group-hover:text-blue-700">כניסה לניהול ←</div>
        </Link>
        <Link
          href="/dashboard/marketing-hub"
          className="group bg-white rounded-3xl shadow-xl hover:shadow-2xl transition-all duration-300 p-10 border-2 border-transparent hover:border-purple-400 hover:-translate-y-2"
        >
          <div className="bg-gradient-to-br from-purple-600 to-pink-500 w-20 h-20 rounded-2xl flex items-center justify-center text-5xl mb-6 group-hover:scale-110 transition-transform">✨</div>
          <h2 className="text-3xl font-bold text-gray-800 mb-3">שיווק</h2>
          <p className="text-gray-600 text-lg mb-4">לידים, קמפיינים וכלים להבאת לקוחות חדשות עם AI</p>
          <div className="text-purple-600 font-semibold group-hover:text-purple-700">כניסה לשיווק ←</div>
        </Link>
        <Link
          href="/dashboard/sales"
          className="group bg-white rounded-3xl shadow-xl hover:shadow-2xl transition-all duration-300 p-10 border-2 border-transparent hover:border-green-400 hover:-translate-y-2"
        >
          <div className="bg-gradient-to-br from-green-500 to-emerald-500 w-20 h-20 rounded-2xl flex items-center justify-center text-5xl mb-6 group-hover:scale-110 transition-transform">💰</div>
          <h2 className="text-3xl font-bold text-gray-800 mb-3">מכירה</h2>
          <p className="text-gray-600 text-lg mb-4">קופה, תשלומים, חשבוניות ודוחות הכנסות</p>
          <div className="text-green-600 font-semibold group-hover:text-green-700">כניסה למכירה ←</div>
        </Link>
      </div>
      <div className="max-w-7xl mx-auto mt-12 text-center text-gray-500">
        <p>BeautyOS - מערכת ניהול לקוסמטיקאיות בישראל</p>
      </div>
    </div>
  );
}
