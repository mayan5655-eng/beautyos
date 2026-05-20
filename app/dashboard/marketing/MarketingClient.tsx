'use client'

import { useRouter } from 'next/navigation'
import { useState } from 'react'

type Campaign = {
  id: string
  name: string
  goal: string
  target_audience: string | null
  service_type: string | null
  status: string
  ai_strategy: string | null
  ai_tone: string | null
  ai_key_points: string[] | null
  created_at: string
}

export default function MarketingClient({ campaigns }: { campaigns: Campaign[] }) {
  const router = useRouter()
  const [search, setSearch] = useState('')

  const filtered = campaigns.filter(c =>
    c.name?.toLowerCase().includes(search.toLowerCase()) ||
    c.goal?.toLowerCase().includes(search.toLowerCase())
  )

  const formatDate = (date: string) => {
    return new Date(date).toLocaleDateString('he-IL', { day: '2-digit', month: '2-digit', year: 'numeric' })
  }

  return (
    <div className="max-w-6xl mx-auto p-6">
      {/* Header */}
      <div className="bg-gradient-to-r from-purple-600 to-pink-600 rounded-3xl shadow-2xl p-8 mb-8 text-white">
        <div className="flex items-center justify-between flex-wrap gap-4">
          <div>
            <h1 className="text-4xl font-bold mb-2">🎯 הקמפיינים שלי</h1>
            <p className="text-purple-100 text-lg">נהלי את כל הקמפיינים השיווקיים שלך במקום אחד</p>
          </div>
          <button
            onClick={() => router.push('/dashboard/marketing/new')}
            className="bg-white text-purple-700 px-8 py-4 rounded-2xl font-bold text-lg shadow-xl hover:scale-105 transition-all"
          >
            ✨ צרי קמפיין חדש
          </button>
        </div>
      </div>

      {/* Stats Cards */}
      <div className="grid grid-cols-1 md:grid-cols-3 gap-4 mb-8">
        <div className="bg-white rounded-2xl shadow-lg p-6 border-r-4 border-purple-500">
          <div className="text-4xl mb-2">📊</div>
          <div className="text-3xl font-bold text-gray-800">{campaigns.length}</div>
          <div className="text-gray-500 font-semibold">סך הקמפיינים</div>
        </div>
        <div className="bg-white rounded-2xl shadow-lg p-6 border-r-4 border-pink-500">
          <div className="text-4xl mb-2">✏️</div>
          <div className="text-3xl font-bold text-gray-800">
            {campaigns.filter(c => c.status === 'draft').length}
          </div>
          <div className="text-gray-500 font-semibold">טיוטות</div>
        </div>
        <div className="bg-white rounded-2xl shadow-lg p-6 border-r-4 border-green-500">
          <div className="text-4xl mb-2">🚀</div>
          <div className="text-3xl font-bold text-gray-800">
            {campaigns.filter(c => c.status === 'active').length}
          </div>
          <div className="text-gray-500 font-semibold">פעילים</div>
        </div>
      </div>

      {/* Search */}
      {campaigns.length > 0 && (
        <div className="mb-6">
          <input
            type="text"
            value={search}
            onChange={(e) => setSearch(e.target.value)}
            placeholder="🔍 חיפוש קמפיין לפי שם או מטרה..."
            className="w-full px-6 py-4 border-2 border-gray-200 rounded-2xl focus:border-purple-500 focus:outline-none transition shadow-md"
          />
        </div>
      )}

      {/* Empty state */}
      {campaigns.length === 0 && (
        <div className="bg-white rounded-3xl shadow-lg p-12 text-center">
          <div className="text-7xl mb-4">📭</div>
          <h2 className="text-2xl font-bold text-gray-800 mb-2">אין קמפיינים עדיין</h2>
          <p className="text-gray-500 mb-6 text-lg">צרי את הקמפיין הראשון שלך וה-AI יעזור לך לכתוב פוסטים מנצחים!</p>
          <button
            onClick={() => router.push('/dashboard/marketing/new')}
            className="bg-gradient-to-r from-purple-600 to-pink-600 text-white px-8 py-4 rounded-2xl font-bold text-lg shadow-xl hover:scale-105 transition"
          >
            ✨ ליצירת קמפיין ראשון
          </button>
        </div>
      )}

      {/* Campaigns list */}
      {filtered.length > 0 && (
        <div className="space-y-4">
          {filtered.map((c) => (
            <div
              key={c.id}
              onClick={() => router.push(`/dashboard/marketing/${c.id}`)}
              className="bg-white rounded-2xl shadow-lg p-6 hover:shadow-2xl hover:scale-[1.02] transition-all cursor-pointer border-2 border-transparent hover:border-purple-300"
            >
              <div className="flex items-start justify-between gap-4 flex-wrap">
                <div className="flex-1 min-w-0">
                  <div className="flex items-center gap-3 mb-3 flex-wrap">
                    <h3 className="text-2xl font-bold text-gray-800">{c.name || 'קמפיין ללא שם'}</h3>
                    <span className={`px-3 py-1 rounded-full text-xs font-bold ${
                      c.status === 'active' ? 'bg-green-100 text-green-700' :
                      c.status === 'draft' ? 'bg-amber-100 text-amber-700' :
                      'bg-gray-100 text-gray-700'
                    }`}>
                      {c.status === 'active' ? '🚀 פעיל' : c.status === 'draft' ? '✏️ טיוטה' : c.status}
                    </span>
                  </div>

                  <p className="text-gray-700 mb-3 text-lg">
                    <span className="font-semibold text-purple-700">🎯 מטרה:</span> {c.goal}
                  </p>

                  <div className="flex flex-wrap gap-3 text-sm">
                    {c.service_type && (
                      <span className="bg-pink-50 text-pink-700 px-3 py-1 rounded-full font-semibold">
                        💆 {c.service_type}
                      </span>
                    )}
                    {c.target_audience && (
                      <span className="bg-blue-50 text-blue-700 px-3 py-1 rounded-full font-semibold">
                        👥 {c.target_audience}
                      </span>
                    )}
                    {c.ai_tone && (
                      <span className="bg-amber-50 text-amber-700 px-3 py-1 rounded-full font-semibold">
                        🎨 {c.ai_tone}
                      </span>
                    )}
                  </div>

                  <p className="text-gray-400 text-sm mt-3">
                    📅 נוצר ב-{formatDate(c.created_at)}
                  </p>
                </div>

                <button
                  onClick={(e) => {
                    e.stopPropagation()
                    router.push(`/dashboard/marketing/${c.id}`)
                  }}
                  className="bg-gradient-to-r from-purple-600 to-pink-600 text-white px-6 py-3 rounded-xl font-bold hover:scale-105 transition shadow-md whitespace-nowrap"
                >
                  👁️ צפה
                </button>
              </div>
            </div>
          ))}
        </div>
      )}

      {/* No search results */}
      {campaigns.length > 0 && filtered.length === 0 && (
        <div className="bg-white rounded-2xl shadow-lg p-8 text-center">
          <div className="text-5xl mb-2">🔍</div>
          <p className="text-gray-600 text-lg">לא נמצאו קמפיינים תואמים לחיפוש</p>
        </div>
      )}
    </div>
  )
}