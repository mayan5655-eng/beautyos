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

type Post = {
  id: string
  title: string
  body: string
  call_to_action: string
  hashtags: string[]
  image_suggestion: string
  variation_number: number
  variation_type: string
}

export default function CampaignClient({ campaign, posts }: { campaign: Campaign; posts: Post[] }) {
  const router = useRouter()
  const [deleting, setDeleting] = useState(false)

  const copyPost = (post: Post) => {
    const text = `${post.title}\n\n${post.body}\n\n${post.call_to_action}\n\n${post.hashtags?.join(' ') || ''}`
    navigator.clipboard.writeText(text)
    alert('✅ הפוסט הועתק! פתחי פייסבוק והדביקי')
  }

  const handleDelete = async () => {
    if (!confirm('האם את בטוחה שברצונך למחוק את הקמפיין?')) return
    setDeleting(true)
    try {
      const res = await fetch(`/api/marketing/delete?id=${campaign.id}`, { method: 'DELETE' })
      if (res.ok) {
        router.push('/dashboard/marketing')
      } else {
        alert('שגיאה במחיקת הקמפיין')
        setDeleting(false)
      }
    } catch {
      alert('שגיאה בחיבור')
      setDeleting(false)
    }
  }

  const formatDate = (date: string) => {
    return new Date(date).toLocaleDateString('he-IL', { day: '2-digit', month: '2-digit', year: 'numeric' })
  }

  return (
    <div className="max-w-5xl mx-auto p-6">
      <button
        onClick={() => router.push('/dashboard/marketing')}
        className="mb-4 text-gray-600 hover:text-purple-700 font-semibold transition"
      >
        ← חזרה לרשימת הקמפיינים
      </button>

      <div className="bg-gradient-to-r from-purple-600 to-pink-600 rounded-3xl shadow-2xl p-8 mb-8 text-white">
        <div className="flex items-start justify-between gap-4 flex-wrap">
          <div className="flex-1">
            <div className="flex items-center gap-3 mb-3 flex-wrap">
              <h1 className="text-4xl font-bold">{campaign.name || 'קמפיין ללא שם'}</h1>
              <span className={`px-3 py-1 rounded-full text-sm font-bold ${
                campaign.status === 'active' ? 'bg-green-400 text-green-900' :
                'bg-white/30 text-white'
              }`}>
                {campaign.status === 'active' ? '🚀 פעיל' : '✏️ טיוטה'}
              </span>
            </div>
            <p className="text-purple-100 text-lg mb-2">🎯 {campaign.goal}</p>
            <p className="text-purple-200 text-sm">📅 נוצר ב-{formatDate(campaign.created_at)}</p>
          </div>
          <button
            onClick={handleDelete}
            disabled={deleting}
            className="bg-red-500/20 hover:bg-red-500/40 text-white px-6 py-3 rounded-xl font-bold transition border-2 border-white/30"
          >
            {deleting ? '⏳' : '🗑️ מחק קמפיין'}
          </button>
        </div>
      </div>

      <div className="grid grid-cols-1 md:grid-cols-2 gap-4 mb-8">
        {campaign.service_type && (
          <div className="bg-white rounded-2xl shadow-lg p-5 border-r-4 border-pink-500">
            <div className="text-sm text-gray-500 font-semibold mb-1">💆 סוג טיפול</div>
            <div className="text-lg font-bold text-gray-800">{campaign.service_type}</div>
          </div>
        )}
        {campaign.target_audience && (
          <div className="bg-white rounded-2xl shadow-lg p-5 border-r-4 border-blue-500">
            <div className="text-sm text-gray-500 font-semibold mb-1">👥 קהל יעד</div>
            <div className="text-lg font-bold text-gray-800">{campaign.target_audience}</div>
          </div>
        )}
      </div>

      {campaign.ai_strategy && (
        <div className="bg-white rounded-3xl shadow-xl p-8 mb-8">
          <h2 className="text-2xl font-bold text-gray-800 mb-6 flex items-center gap-2">
            🤖 אסטרטגיית AI
          </h2>
          <div className="space-y-4">
            <div className="bg-purple-50 border-2 border-purple-200 rounded-2xl p-5">
              <h3 className="font-bold text-purple-800 text-lg mb-2">📋 הגישה</h3>
              <p className="text-gray-700 leading-relaxed">{campaign.ai_strategy}</p>
            </div>
            {campaign.ai_tone && (
              <div className="bg-pink-50 border-2 border-pink-200 rounded-2xl p-5">
                <h3 className="font-bold text-pink-800 text-lg mb-2">🎨 טון הקמפיין</h3>
                <p className="text-gray-700">{campaign.ai_tone}</p>
              </div>
            )}
            {campaign.ai_key_points && campaign.ai_key_points.length > 0 && (
              <div className="bg-amber-50 border-2 border-amber-200 rounded-2xl p-5">
                <h3 className="font-bold text-amber-800 text-lg mb-3">💡 מסרים מרכזיים</h3>
                <ul className="space-y-2">
                  {campaign.ai_key_points.map((p, i) => (
                    <li key={i} className="flex gap-2 text-gray-700">
                      <span className="text-amber-600 font-bold">•</span>
                      <span>{p}</span>
                    </li>
                  ))}
                </ul>
              </div>
            )}
          </div>
        </div>
      )}

      {posts.length > 0 && (
        <div className="bg-white rounded-3xl shadow-xl p-8">
          <h2 className="text-2xl font-bold text-gray-800 mb-6 flex items-center gap-2">
            ✍️ הפוסטים שלך ({posts.length})
          </h2>
          <div className="space-y-5">
            {posts.map((post) => (
              <div
                key={post.id}
                className="bg-gradient-to-br from-purple-50 to-pink-50 border-2 border-purple-200 rounded-2xl p-5 shadow-md"
              >
                <div className="flex items-center justify-between mb-3 flex-wrap gap-2">
                  <span className="bg-purple-600 text-white px-3 py-1 rounded-full text-sm font-bold">
                    וריאציה {post.variation_number}
                  </span>
                  <span className="bg-pink-100 text-pink-700 px-3 py-1 rounded-full text-xs font-semibold">
                    {post.variation_type}
                  </span>
                </div>
                <h3 className="font-bold text-gray-800 text-xl mb-2">{post.title}</h3>
                <p className="text-gray-700 whitespace-pre-wrap mb-3 leading-relaxed">{post.body}</p>
                <div className="bg-white rounded-xl p-3 mb-3">
                  <p className="text-purple-700 font-semibold mb-1">📢 {post.call_to_action}</p>
                  {post.hashtags && post.hashtags.length > 0 && (
                    <p className="text-blue-600 text-sm">{post.hashtags.join(' ')}</p>
                  )}
                </div>
                {post.image_suggestion && (
                  <div className="bg-amber-50 rounded-xl p-3 mb-3">
                    <p className="text-amber-800 text-sm">
                      💡 <strong>תמונה מומלצת:</strong> {post.image_suggestion}
                    </p>
                  </div>
                )}
                <button
                  onClick={() => copyPost(post)}
                  className="w-full py-3 bg-gradient-to-r from-purple-600 to-pink-600 text-white font-bold rounded-xl hover:scale-105 transition shadow-md"
                >
                  📋 העתק פוסט
                </button>
              </div>
            ))}
          </div>
        </div>
      )}

      {posts.length === 0 && (
        <div className="bg-white rounded-3xl shadow-lg p-12 text-center">
          <div className="text-6xl mb-4">📝</div>
          <p className="text-gray-600 text-lg">אין פוסטים בקמפיין הזה</p>
        </div>
      )}
    </div>
  )
}