import React, { useState, useEffect } from 'react'
import Screen1_Landing from './screens/Screen1_Landing'
import Screen2_Report from './screens/Screen2_Report'
import Screen3_Pack from './screens/Screen3_Pack'
import LoginScreen from './screens/LoginScreen'
import SignupScreen from './screens/SignupScreen'
import Screen_FreeTier from './screens/Screen_FreeTier'
import LoadingAnimation from './components/LoadingAnimation'
import { callClaude } from './api/claude'
import { buildPrompt1 } from './prompts/prompt1_analyzer'
import { buildPrompt2 } from './prompts/prompt2_queries'
import { buildPrompt3 } from './prompts/prompt3_gaps'
import { buildPrompt4 } from './prompts/prompt4_content'
import { parseJSON, parseContentPack } from './utils/parser'
import { searchWeb, scoreWebResult } from './api/search'
import { supabase } from './lib/supabase'

const ENTITY_PLATFORMS = [
  { name: 'G2', domain: 'g2.com' },
  { name: 'Capterra', domain: 'capterra.com' },
  { name: 'LinkedIn', domain: 'linkedin.com/company' },
  { name: 'Wikipedia', domain: 'en.wikipedia.org' },
  { name: 'Crunchbase', domain: 'crunchbase.com' },
  { name: 'Trustpilot', domain: 'trustpilot.com' },
]

export default function App() {
  const [screen, setScreen] = useState('landing') // login | signup | landing | loading | report | pack | freetier
  const [session, setSession] = useState(null)
  const [authLoading, setAuthLoading] = useState(false)
  const [authMessage, setAuthMessage] = useState(null)
  const [loadingStep, setLoadingStep] = useState(0)
  const [reportData, setReportData] = useState(null)
  const [contentPack, setContentPack] = useState(null)
  const [companyName, setCompanyName] = useState('')
  const [error, setError] = useState(null)
  const [selectedCountry, setSelectedCountry] = useState(null)
  const [targetUrl, setTargetUrl] = useState('')

  useEffect(() => {
    // Auth disabled for hackathon demo
    setAuthLoading(false)
  }, [])

  const handleLogout = async () => {
    await supabase.auth.signOut()
  }

  const runAnalysis = async (input, country = null) => {
    setScreen('loading')
    setLoadingStep(0)
    setError(null)
    setSelectedCountry(country || null)

    try {
      // Step 1 — Company Intelligence (with live web context from Serper)
      setLoadingStep(0)
      const webContext = await searchWeb(input)
      const raw1 = await callClaude(buildPrompt1(input, country, webContext))
      const profile = parseJSON(raw1)
      if (!profile) throw new Error('Could not parse company profile')
      setCompanyName(profile.company_name || input)

      // Step 2 — Buyer Queries
      setLoadingStep(1)
      const raw2 = await callClaude(buildPrompt2(profile, country))
      const queries = parseJSON(raw2)
      if (!queries) throw new Error('Could not parse buyer queries')

      const companyNameForScoring = profile.company_name || input

      // Step 3 — Live AI Queries + Web Search + Entity checks + Comparison articles (all parallel)
      setLoadingStep(2)
      const [liveAnswers, webResults, entityPresence, comparisonResults] = await Promise.all([
        // 10 live Claude answers
        Promise.all(
          queries.map(async (q) => {
            try {
              const answer = await callClaude(
                `Answer this question as a helpful AI assistant would, naming specific companies:\n\n"${q.query}"\n\nGive a direct recommendation in 3-4 sentences.`,
                400
              )
              return { query: q.query, answer }
            } catch {
              return { query: q.query, answer: '' }
            }
          })
        ),
        // 10 Serper web searches for query scoring
        Promise.all(
          queries.map(async (q) => {
            const results = await searchWeb(q.query, country)
            return { query: q.query, results }
          })
        ),
        // 6 entity platform checks via site: search
        Promise.all(
          ENTITY_PLATFORMS.map(async ({ name, domain }) => {
            const results = await searchWeb(`"${companyNameForScoring}" site:${domain}`)
            return { name, present: !!(results && results.length > 0) }
          })
        ),
        // 2 comparison article searches
        (async () => {
          const category = profile.primary_category || profile.industry || ''
          const [r1, r2] = await Promise.all([
            searchWeb(`best ${category}`, country),
            searchWeb(`top ${category} alternatives`, country),
          ])
          const combined = [...(r1 || []), ...(r2 || [])]
          const name = companyNameForScoring.toLowerCase()
          // Return articles where company is NOT mentioned (the gap)
          return combined
            .filter(r => !`${r.title || ''} ${r.snippet || ''} ${r.link || ''}`.toLowerCase().includes(name))
            .slice(0, 5)
            .map(r => ({ title: r.title || '', link: r.link || '' }))
        })(),
      ])

      // Step 4 — Gap Analysis
      setLoadingStep(3)
      const webScores = webResults.map(({ query, results }) => ({
        query,
        web_strength: scoreWebResult(companyNameForScoring, results),
      }))

      const raw3 = await callClaude(buildPrompt3(profile, liveAnswers, country, entityPresence))
      const gaps = parseJSON(raw3)
      if (!gaps) throw new Error('Could not parse gap analysis')

      // Merge web scores into query_results
      if (gaps.query_results) {
        gaps.query_results = gaps.query_results.map((r, i) => ({
          ...r,
          web_strength: webScores[i]?.web_strength ?? 'none',
        }))
      }

      // Combined score: LLM 65% + Web 35% (per Semrush 65/35 research)
      const webStrongCount = webScores.filter(s => s.web_strength === 'strong').length
      const webWeakCount = webScores.filter(s => s.web_strength === 'weak').length
      const webScore = webScores.length > 0
        ? Math.round((webStrongCount * 10 + webWeakCount * 5) / webScores.length)
        : null

      const llmScore = gaps.overall_recommendation_score ?? 0
      gaps.combined_score = webScore != null
        ? Math.round(llmScore * 0.65 + webScore * 0.35)
        : llmScore

      // Combined strength per query
      const strengthVal = { strong: 2, weak: 1, none: 0 }
      const strengthLabel = (v) => v >= 1.5 ? 'strong' : v >= 0.6 ? 'weak' : 'none'

      if (gaps.query_results) {
        gaps.query_results = gaps.query_results.map((r, i) => {
          const web = webScores[i]?.web_strength ?? 'none'
          const combined = (strengthVal[r.recommendation_strength] ?? 0) * 0.65 + (strengthVal[web] ?? 0) * 0.35
          return { ...r, combined_strength: strengthLabel(combined) }
        })
      }

      // Attach entity presence and comparison articles to gaps for report display
      gaps.entity_presence = entityPresence
      gaps.comparison_articles = comparisonResults

      setReportData({ profile, queries, gaps })

      // Step 5 — Content Pack
      setLoadingStep(4)
      const raw4 = await callClaude(buildPrompt4(profile, gaps, country, comparisonResults), 6000)
      const pack = parseContentPack(raw4)
      setContentPack(pack)

      setScreen('report')

    } catch (err) {
      console.error('Analysis error:', err)
      setError(err.message === 'NO_API_KEY' ? 'No API key set. Add VITE_CLAUDE_API_KEY to your .env file.' : err.message)
      setScreen('landing')
    }
  }

  const resetToLanding = () => {
    setScreen('landing')
    setReportData(null)
    setContentPack(null)
    setCompanyName('')
    setLoadingStep(0)
    setError(null)
  }

  const runFreeAnalysis = (url) => {
    setTargetUrl(url)
    setScreen('freetier')
  }

  // if (authLoading) return null

  if (screen === 'signup') {
    return (
      <SignupScreen
        onSuccess={(msg) => { setAuthMessage(msg); setScreen('login') }}
        onGoToLogin={() => setScreen('login')}
      />
    )
  }

  if (screen === 'login') {
    return (
      <LoginScreen
        message={authMessage}
        onSuccess={() => { setAuthMessage(null); setScreen('landing') }}
        onGoToSignup={() => setScreen('signup')}
      />
    )
  }

  if (screen === 'landing') {
    return (
      <>
        <Screen1_Landing onSubmit={runAnalysis} onRunFreeTier={runFreeAnalysis} error={error} />
        <LogoutOverlay session={session} onLogout={handleLogout} />
      </>
    )
  }

  if (screen === 'loading') {
    return (
      <>
        <LoadingAnimation currentStep={loadingStep} country={selectedCountry} />
        <LogoutOverlay session={session} onLogout={handleLogout} />
      </>
    )
  }

  if (screen === 'report') {
    return (
      <>
        <Screen2_Report
          reportData={reportData}
          onViewPack={() => setScreen('pack')}
          onNewScan={resetToLanding}
        />
        <LogoutOverlay session={session} onLogout={handleLogout} />
      </>
    )
  }

  if (screen === 'pack') {
    return (
      <>
        <Screen3_Pack
          pack={contentPack}
          companyName={companyName}
          onBack={() => setScreen('report')}
        />
        <LogoutOverlay session={session} onLogout={handleLogout} />
      </>
    )
  }

  if (screen === 'freetier') {
    return (
      <>
        <Screen_FreeTier url={targetUrl} onBack={() => setScreen('landing')} />
        <LogoutOverlay session={session} onLogout={handleLogout} />
      </>
    )
  }

  return null
}

function LogoutOverlay({ session, onLogout }) {
  if (!session) return null
  return (
    <div style={{
      position: 'fixed', top: 20, right: 24, zIndex: 100,
      display: 'flex', alignItems: 'center', gap: 10,
    }}>
      <span style={{
        fontFamily: "'Geist Mono', monospace",
        fontSize: 11,
        color: '#544e46',
      }}>
        {session.user.email}
      </span>
      <button
        onClick={onLogout}
        style={{
          padding: '6px 12px',
          borderRadius: 999,
          background: 'transparent',
          border: '1px solid rgba(244,239,230,0.15)',
          color: '#cdc6ba',
          fontFamily: "'Geist Mono', monospace",
          fontSize: 11,
          cursor: 'pointer',
        }}
      >
        Sign out
      </button>
    </div>
  )
}
