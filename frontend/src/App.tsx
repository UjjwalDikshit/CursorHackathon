import { useEffect, useState } from 'react'
import reactLogo from './assets/react.svg'
import viteLogo from './assets/vite.svg'
import heroImg from './assets/hero.png'
import './App.css'

function App() {
  const [count, setCount] = useState(0)
  const [apiMessage, setApiMessage] = useState<string | null>(null)
  const [apiError, setApiError] = useState<string | null>(null)

  useEffect(() => {
    fetch('/api/hello')
      .then((r) => {
        if (!r.ok) throw new Error(`HTTP ${r.status}`)
        return r.json() as Promise<{ message: string }>
      })
      .then((data) => setApiMessage(data.message))
      .catch(() =>
        setApiError('Backend unreachable — run npm run dev in /backend'),
      )
  }, [])

  return (
    <>
      <aside
        style={{
          margin: '0 auto',
          maxWidth: 720,
          padding: '12px 16px',
          background: 'var(--code-bg, #f4f3ec)',
          border: '1px solid var(--border, #e5e4e7)',
          borderRadius: 8,
          fontSize: 14,
          color: 'var(--text-h, #111)',
        }}
      >
        <strong>Main app UI</strong> lives in the <code>web/</code> folder (Next.js). Run{' '}
        <code>cd web && npm run dev</code> and open{' '}
        <a href="http://localhost:3000" style={{ fontWeight: 600 }}>
          http://localhost:3000
        </a>
        . This Vite app is only a dev shell / API ping.
      </aside>
      <section id="center">
        <div className="hero">
          <img src={heroImg} className="base" width="170" height="179" alt="" />
          <img src={reactLogo} className="framework" alt="React logo" />
          <img src={viteLogo} className="vite" alt="Vite logo" />
        </div>
        <div>
          <h1>Get started</h1>
          <p>
            Edit <code>src/App.tsx</code> and save to test <code>HMR</code>
          </p>
          <p className="api-line" data-state={apiError ? 'error' : apiMessage ? 'ok' : 'pending'}>
            {apiError ?? apiMessage ?? 'Connecting to API…'}
          </p>
        </div>
        <button
          className="counter"
          onClick={() => setCount((count) => count + 1)}
        >
          Count is {count}
        </button>
      </section>

      <div className="ticks"></div>

      <section id="next-steps">
        <div id="docs">
          <svg className="icon" role="presentation" aria-hidden="true">
            <use href="/icons.svg#documentation-icon"></use>
          </svg>
          <h2>Documentation</h2>
          <p>Your questions, answered</p>
          <ul>
            <li>
              <a href="https://vite.dev/" target="_blank">
                <img className="logo" src={viteLogo} alt="" />
                Explore Vite
              </a>
            </li>
            <li>
              <a href="https://react.dev/" target="_blank">
                <img className="button-icon" src={reactLogo} alt="" />
                Learn more
              </a>
            </li>
          </ul>
        </div>
        <div id="social">
          <svg className="icon" role="presentation" aria-hidden="true">
            <use href="/icons.svg#social-icon"></use>
          </svg>
          <h2>Connect with us</h2>
          <p>Join the Vite community</p>
          <ul>
            <li>
              <a href="https://github.com/vitejs/vite" target="_blank">
                <svg
                  className="button-icon"
                  role="presentation"
                  aria-hidden="true"
                >
                  <use href="/icons.svg#github-icon"></use>
                </svg>
                GitHub
              </a>
            </li>
            <li>
              <a href="https://chat.vite.dev/" target="_blank">
                <svg
                  className="button-icon"
                  role="presentation"
                  aria-hidden="true"
                >
                  <use href="/icons.svg#discord-icon"></use>
                </svg>
                Discord
              </a>
            </li>
            <li>
              <a href="https://x.com/vite_js" target="_blank">
                <svg
                  className="button-icon"
                  role="presentation"
                  aria-hidden="true"
                >
                  <use href="/icons.svg#x-icon"></use>
                </svg>
                X.com
              </a>
            </li>
            <li>
              <a href="https://bsky.app/profile/vite.dev" target="_blank">
                <svg
                  className="button-icon"
                  role="presentation"
                  aria-hidden="true"
                >
                  <use href="/icons.svg#bluesky-icon"></use>
                </svg>
                Bluesky
              </a>
            </li>
          </ul>
        </div>
      </section>

      <div className="ticks"></div>
      <section id="spacer"></section>
    </>
  )
}

export default App
