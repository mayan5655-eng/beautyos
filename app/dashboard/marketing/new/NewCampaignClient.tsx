'use client'

import { useState } from 'react'
import { useRouter } from 'next/navigation'

type Strategy = {
  strategy: string
  tone: string
  keyPoints: string[]
  audienceInsights: string
}

type UnsplashImage = {
  url: string
  thumbUrl: string
  photographerName: string
  photographerUrl: string
  description: string
}

type Variation = {
  variationNumber: number
  variationType: string
  title: string
  body: string
  callToAction: string
  hashtags: string[]
  imageSuggestion: string
  image?: UnsplashImage | null
}

type Group = {
  name: string
  category: string
  reasoning: string
}

export default function NewCampaignClient() {
  const router = useRouter()
  const [currentStep, setCurrentStep] = useState(1)
  const [campaignData, setCampaignData] = useState({
    name: '',
    goal: '',
    target_audience: '',
    service_type: '',
  })
  const [strategy, setStrategy] = useState<Strategy | null>(null)
  const [variations, setVariations] = useState<Variation[]>([])
  const [groups, setGroups] = useState<Group[]>([])
  const [loading, setLoading] = useState(false)
  const [error, setError] = useState('')
  const [saving, setSaving] = useState(false)
  const [savedCampaignId, setSavedCampaignId] = useState<string | null>(null)
  const [saveError, setSaveError] = useState('')

  const goNext = () => { if (currentStep < 4) setCurrentStep(currentStep + 1) }
  const goBack = () => { if (currentStep > 1) setCurrentStep(currentStep - 1) }

  const handleGenerateStrategy = async () => {
    setLoading(true); setError('')
    try {
      const res = await fetch('/api/marketing/strategy', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ goal: campaignData.goal, serviceType: campaignData.service_type, targetAudience: campaignData.target_audience }),
      })
      const data = await res.json()
      if (data.strategy) setStrategy(data.strategy)
      else setError('שגיאה ביצירת אסטרטגיה. נסי שוב.')
    } catch { setError('שגיאה בחיבור. בדקי את האינטרנט ונסי שוב.') }
    setLoading(false)
  }

  const handleGenerateVariations = async () => {
    setLoading(true); setError('')
    try {
      const res = await fetch('/api/marketing/variations', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ strategy, count: 5 }),
      })
      const data = await res.json()
      if (data.variations) setVariations(data.variations)
      else setError('שגיאה ביצירת פוסטים. נסי שוב.')
    } catch { setError('שגיאה בחיבור. בדקי את האינטרנט ונסי שוב.') }
    setLoading(false)
  }

  const handleSuggestGroups = async () => {
    setLoading(true); setError('')
    try {
      const res = await fetch('/api/marketing/groups', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ count: 10 }),
      })
      const data = await res.json()
      if (data.groups) setGroups(data.groups)
      else setError('שגיאה בהמלצת הקבוצות. נסי שוב.')
    } catch { setError('שגיאה בחיבור. בדקי את האינטרנט ונסי שוב.') }
    setLoading(false)
  }

  const handleSave = async () => {
    setSaving(true); setSaveError('')
    try {
      const res = await fetch('/api/marketing/save', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ campaignData, strategy, variations }),
      })
      const data = await res.json()
      if (data.success && data.campaignId) setSavedCampaignId(data.campaignId)
      else setSaveError(data.error || 'שגיאה בשמירה. נסי שוב.')
    } catch { setSaveError('שגיאה בחיבור. בדקי את האינטרנט ונסי שוב.') }
    setSaving(false)
  }

  const copyPost = (v: Variation) => {
    const text = `${v.title}\n\n${v.body}\n\n${v.callToAction}\n\n${v.hashtags.join(' ')}`
    navigator.clipboard.writeText(text)
    alert('הפוסט הועתק! פתחי פייסבוק והדביקי')
  }

  const downloadImage = async (image: UnsplashImage, postNumber: number) => {
    try {
      const response = await fetch(image.url)
      const blob = await response.blob()
      const url = window.URL.createObjectURL(blob)
      const a = document.createElement('a')
      a.href = url
      a.download = `beautyos-post-${postNumber}.jpg`
      document.body.appendChild(a); a.click(); document.body.removeChild(a)
      window.URL.revokeObjectURL(url)
      alert('התמונה ירדה למחשב')
    } catch { alert('שגיאה בהורדת התמונה') }
  }

  const openFacebookSearch = (name: string) => {
    window.open(`https://www.facebook.com/search/groups/?q=${encodeURIComponent(name)}`, '_blank')
  }

  const steps = [
    { num: 1, label: 'פרטי קמפיין', icon: '📝' },
    { num: 2, label: 'אסטרטגיה', icon: '🎯' },
    { num: 3, label: 'פוסטים', icon: '✍️' },
    { num: 4, label: 'קבוצות', icon: '👥' },
  ]

  return (
    <div className="max-w-4xl mx-auto p-6">
      <div className="text-center mb-8">
        <h1 className="text-4xl font-bold text-gray-800 mb-2">✨ יצירת קמפיין חדש</h1>
        <p className="text-gray-600 text-lg">ה-AI ייצור עבורך אסטרטגיה, פוסטים והמלצות לקבוצות</p>
      </div>

      <div className="mb-8 bg-white rounded-2xl shadow-lg p-6">
        <div className="flex items-center justify-between">
          {steps.map((step, idx) => (
            <div key={step.num} className="flex items-center flex-1">
              <div className="flex flex-col items-center flex-1">
                <div className={`w-14 h-14 rounded-full flex items-center justify-center text-2xl font-bold transition-all ${currentStep === step.num ? 'bg-gradient-to-br from-purple-600 to-pink-600 text-white scale-110 shadow-xl ring-4 ring-purple-200' : currentStep > step.num ? 'bg-green-500 text-white shadow-md' : 'bg-gray-200 text-gray-400'}`}>
                  {currentStep > step.num ? '✓' : step.icon}
                </div>
                <span className={`text-sm mt-2 font-bold ${currentStep === step.num ? 'text-purple-700' : currentStep > step.num ? 'text-green-600' : 'text-gray-400'}`}>{step.num}. {step.label}</span>
              </div>
              {idx < steps.length - 1 && (<div className={`h-1.5 flex-1 mx-2 rounded-full transition-all ${currentStep > step.num ? 'bg-green-500' : 'bg-gray-200'}`} />)}
            </div>
          ))}
        </div>
      </div>

      {error && (<div className="mb-4 bg-red-50 border-2 border-red-300 text-red-700 p-4 rounded-2xl text-center font-bold shadow-md">⚠️ {error}</div>)}

      {currentStep === 1 && (
        <div className="bg-white rounded-2xl shadow-lg p-8">
          <h2 className="text-2xl font-bold text-gray-800 mb-2">📝 פרטי הקמפיין</h2>
          <p className="text-gray-500 mb-6">ספרי לי על הקמפיין שאת רוצה ליצור</p>
          <div className="space-y-5">
            <div>
              <label className="block text-sm font-bold text-gray-700 mb-2">שם הקמפיין</label>
              <input type="text" value={campaignData.name} onChange={(e) => setCampaignData({ ...campaignData, name: e.target.value })} placeholder="לדוגמה: קמפיין קיץ 2026" className="w-full px-4 py-3 border-2 border-gray-200 rounded-xl focus:border-purple-500 focus:outline-none transition" />
            </div>
            <div>
              <label className="block text-sm font-bold text-gray-700 mb-2">🎯 מטרת הקמפיין <span className="text-red-500">*</span></label>
              <textarea value={campaignData.goal} onChange={(e) => setCampaignData({ ...campaignData, goal: e.target.value })} placeholder="לדוגמה: להביא 20 לקוחות חדשות" rows={3} className="w-full px-4 py-3 border-2 border-gray-200 rounded-xl focus:border-purple-500 focus:outline-none transition" />
            </div>
            <div>
              <label className="block text-sm font-bold text-gray-700 mb-2">👥 קהל יעד</label>
              <input type="text" value={campaignData.target_audience} onChange={(e) => setCampaignData({ ...campaignData, target_audience: e.target.value })} placeholder="לדוגמה: נשים 25-45" className="w-full px-4 py-3 border-2 border-gray-200 rounded-xl focus:border-purple-500 focus:outline-none transition" />
            </div>
            <div>
              <label className="block text-sm font-bold text-gray-700 mb-2">💆 סוג הטיפול</label>
              <input type="text" value={campaignData.service_type} onChange={(e) => setCampaignData({ ...campaignData, service_type: e.target.value })} placeholder="לדוגמה: הסרת שיער בלייזר" className="w-full px-4 py-3 border-2 border-gray-200 rounded-xl focus:border-purple-500 focus:outline-none transition" />
            </div>
          </div>
        </div>
      )}

      {currentStep === 2 && (
        <div className="bg-white rounded-2xl shadow-lg p-8">
          <h2 className="text-2xl font-bold text-gray-800 mb-2">🎯 אסטרטגיית קמפיין</h2>
          <p className="text-gray-500 mb-6">ה-AI ייצור עבורך אסטרטגיה שיווקית</p>
          {!strategy && (<><button onClick={handleGenerateStrategy} disabled={!campaignData.goal || loading} className="w-full py-6 px-8 bg-gradient-to-r from-purple-600 to-pink-600 text-white text-xl font-bold rounded-2xl shadow-xl hover:scale-105 transition disabled:opacity-40 disabled:cursor-not-allowed">{loading ? '⏳ ה-AI חושב...' : '✨ צור אסטרטגיה עם AI'}</button>{!campaignData.goal && <p className="text-center text-amber-600 mt-4 font-semibold">⚠️ חזרי לשלב 1 ומלאי את מטרת הקמפיין</p>}</>)}
          {strategy && (
            <div className="space-y-4 mt-6">
              <div className="bg-purple-50 border-2 border-purple-200 rounded-xl p-5"><h3 className="font-bold text-purple-800 text-lg mb-2">📋 הגישה</h3><p className="text-gray-700">{strategy.strategy}</p></div>
              <div className="bg-pink-50 border-2 border-pink-200 rounded-xl p-5"><h3 className="font-bold text-pink-800 text-lg mb-2">🎨 טון</h3><p className="text-gray-700">{strategy.tone}</p></div>
              <div className="bg-amber-50 border-2 border-amber-200 rounded-xl p-5"><h3 className="font-bold text-amber-800 text-lg mb-3">💡 מסרים מרכזיים</h3><ul className="space-y-2">{strategy.keyPoints.map((p, i) => (<li key={i} className="flex gap-2 text-gray-700"><span className="text-amber-600 font-bold">•</span><span>{p}</span></li>))}</ul></div>
              <div className="bg-blue-50 border-2 border-blue-200 rounded-xl p-5"><h3 className="font-bold text-blue-800 text-lg mb-2">👥 תובנות קהל</h3><p className="text-gray-700">{strategy.audienceInsights}</p></div>
              <button onClick={() => { setStrategy(null); handleGenerateStrategy() }} className="w-full py-3 bg-gray-100 text-gray-700 font-semibold rounded-xl hover:bg-gray-200">🔄 צור אסטרטגיה אחרת</button>
            </div>
          )}
        </div>
      )}

      {currentStep === 3 && (
        <div className="bg-white rounded-2xl shadow-lg p-8">
          <h2 className="text-2xl font-bold text-gray-800 mb-2">✍️ יצירת פוסטים</h2>
          <p className="text-gray-500 mb-6">ה-AI ייצור 5 וריאציות עם תמונות</p>
          {variations.length === 0 && (<><button onClick={handleGenerateVariations} disabled={!strategy || loading} className="w-full py-6 px-8 bg-gradient-to-r from-purple-600 to-pink-600 text-white text-xl font-bold rounded-2xl shadow-xl hover:scale-105 transition disabled:opacity-40">{loading ? '⏳ ה-AI כותב פוסטים...' : '✨ צור פוסטים עם AI'}</button>{!strategy && <p className="text-center text-amber-600 mt-4 font-semibold">⚠️ חזרי לשלב 2 וצרי אסטרטגיה קודם</p>}</>)}
          {variations.length > 0 && (
            <div className="space-y-6 mt-6">
              {variations.map((v) => (
                <div key={v.variationNumber} className="bg-gradient-to-br from-purple-50 to-pink-50 border-2 border-purple-200 rounded-2xl p-5 shadow-md">
                  <div className="flex items-center justify-between mb-3"><span className="bg-purple-600 text-white px-3 py-1 rounded-full text-sm font-bold">וריאציה {v.variationNumber}</span><span className="bg-pink-100 text-pink-700 px-3 py-1 rounded-full text-xs font-semibold">{v.variationType}</span></div>
                  {v.image && (<div className="mb-4 rounded-xl overflow-hidden shadow-lg"><img src={v.image.url} alt={v.image.description} className="w-full h-64 object-cover" /><div className="bg-white p-2 text-xs text-gray-500 text-center">📸 {v.image.photographerName} / Unsplash</div></div>)}
                  <h3 className="font-bold text-gray-800 text-lg mb-2">{v.title}</h3>
                  <p className="text-gray-700 whitespace-pre-wrap mb-3">{v.body}</p>
                  <div className="bg-white rounded-xl p-3 mb-3"><p className="text-purple-700 font-semibold mb-1">📢 {v.callToAction}</p><p className="text-blue-600 text-sm">{v.hashtags.join(' ')}</p></div>
                  <div className="grid grid-cols-2 gap-3">
                    <button onClick={() => copyPost(v)} className="py-3 bg-purple-600 text-white font-bold rounded-xl hover:bg-purple-700 shadow-md">📋 העתק טקסט</button>
                    {v.image ? (<button onClick={() => downloadImage(v.image!, v.variationNumber)} className="py-3 bg-pink-600 text-white font-bold rounded-xl hover:bg-pink-700 shadow-md">📸 הורד תמונה</button>) : (<div className="py-3 bg-gray-200 text-gray-500 font-bold rounded-xl text-center">אין תמונה</div>)}
                  </div>
                </div>
              ))}
            </div>
          )}
        </div>
      )}

      {currentStep === 4 && (
        <div className="bg-white rounded-2xl shadow-lg p-8">
          <h2 className="text-2xl font-bold text-gray-800 mb-2">👥 קבוצות פייסבוק</h2>
          <p className="text-gray-500 mb-6">ה-AI ימליץ על 10 קבוצות רלוונטיות</p>
          {groups.length === 0 && (<button onClick={handleSuggestGroups} disabled={loading} className="w-full py-6 px-8 bg-gradient-to-r from-purple-600 to-pink-600 text-white text-xl font-bold rounded-2xl shadow-xl hover:scale-105 transition disabled:opacity-40">{loading ? '⏳ ה-AI מחפש קבוצות...' : '✨ הצע קבוצות עם AI'}</button>)}
          {groups.length > 0 && (
            <div className="space-y-3 mt-6">
              {groups.map((g, i) => (
                <div key={i} className="bg-gradient-to-r from-blue-50 to-purple-50 border-2 border-blue-200 rounded-xl p-4">
                  <div className="flex items-start justify-between gap-3">
                    <div className="flex-1"><div className="flex items-center gap-2 mb-2"><h3 className="font-bold text-gray-800 text-lg">{g.name}</h3><span className="bg-blue-100 text-blue-700 px-2 py-1 rounded-full text-xs font-semibold">{g.category}</span></div><p className="text-gray-600 text-sm">{g.reasoning}</p></div>
                    <button onClick={() => openFacebookSearch(g.name)} className="bg-blue-600 text-white px-4 py-2 rounded-xl font-semibold text-sm hover:bg-blue-700 whitespace-nowrap shadow-md">🔍 חפש</button>
                  </div>
                </div>
              ))}
            </div>
          )}

          {variations.length > 0 && !savedCampaignId && (
            <div className="mt-8 pt-6 border-t-2 border-gray-200">
              <h3 className="text-xl font-bold text-gray-800 mb-3 text-center">🎉 סיימת!</h3>
              <p className="text-gray-600 mb-4 text-center">שמרי את הקמפיין כדי לחזור אליו בכל זמן</p>
              {saveError && (<div className="mb-4 bg-red-50 border-2 border-red-300 text-red-700 p-3 rounded-xl text-center font-bold">⚠️ {saveError}</div>)}
              <button onClick={handleSave} disabled={saving} className="w-full py-6 px-8 bg-gradient-to-r from-green-600 to-emerald-600 text-white text-xl font-bold rounded-2xl shadow-xl hover:scale-105 transition disabled:opacity-40">
                {saving ? '⏳ שומר...' : '💾 שמור קמפיין'}
              </button>
            </div>
          )}

          {savedCampaignId && (
            <div className="mt-8 pt-6 border-t-2 border-gray-200">
              <div className="bg-green-50 border-2 border-green-300 rounded-2xl p-6 text-center">
                <div className="text-4xl mb-2">✅</div>
                <h3 className="text-xl font-bold text-green-800 mb-2">הקמפיין נשמר בהצלחה!</h3>
                <p className="text-gray-600 mb-4">הקמפיין שלך שמור ומוכן לשימוש</p>
                <button onClick={() => router.push('/dashboard/marketing')} className="px-6 py-3 bg-green-600 text-white font-bold rounded-xl hover:bg-green-700 transition shadow-md">
                  📋 לרשימת הקמפיינים
                </button>
              </div>
            </div>
          )}
        </div>
      )}

      <div className="mt-8 flex items-center justify-between gap-4">
        <button onClick={goBack} disabled={currentStep === 1} className="px-8 py-4 bg-white border-2 border-gray-300 text-gray-700 font-bold rounded-2xl shadow-md hover:bg-gray-50 transition disabled:opacity-30 disabled:cursor-not-allowed">← חזור</button>
        <div className="text-center"><p className="text-sm text-gray-500 font-semibold">שלב {currentStep} מתוך 4</p></div>
        <button onClick={goNext} disabled={currentStep === 4} className="px-8 py-4 bg-gradient-to-r from-purple-600 to-pink-600 text-white font-bold rounded-2xl shadow-lg hover:scale-105 transition disabled:opacity-30 disabled:cursor-not-allowed">הבא →</button>
      </div>
    </div>
  )
}