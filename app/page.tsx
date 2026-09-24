// Public product page. All figures come from the case material, the evaluation reports in docs/, or the real
// pipeline run exported to data/demo-example.json. Nothing here is invented or presented as Meera's own content.
import example from '@/data/demo-example.json';
import {
  ArrowRightIcon,
  CheckIcon,
  CloudIcon,
  CodeIcon,
  DatabaseIcon,
  MessageIcon,
  NewsIcon,
  ShieldIcon,
  SparkIcon,
} from './components/icons';
import { StatusPanel } from './components/StatusPanel';
import { Workflow } from './components/Workflow';

const botUsername = process.env.TELEGRAM_BOT_USERNAME?.trim().replace(/^@/, '') || null;
const botLink = botUsername && /^[A-Za-z0-9_]{5,32}$/.test(botUsername) ? `https://t.me/${botUsername}` : null;

const PROBLEM = [
  { value: '60', label: 'raw notes sitting unused', note: 'Captured in Telegram over eight months' },
  { value: '40', label: 'abandoned drafts', note: 'Started in Google Drive, stopped after two paragraphs' },
  { value: '11', label: 'weeks without a LinkedIn post', note: 'Despite 6,200 followers' },
  { value: '90–180', label: 'minutes of stall time', note: 'For each post that did get written' },
];

const DIMENSIONS = [
  { name: 'Strength of insight', q: 'Is there a clear, meaningful point?' },
  { name: 'Specificity', q: 'A concrete event, example or mechanism?' },
  { name: 'Relevance', q: 'Inside Meera’s credible domain?' },
  { name: 'Evidence / grounding', q: 'Data, experience or documentation in the note itself?' },
  { name: 'Completeness', q: 'Enough direction to become a useful post?' },
];

// Real results from the production scoring prompt (docs/seed-note-evaluation.md, run 2).
const SCORED = [
  { label: 'Case note 01 · batch pH drift', score: 10 },
  { label: 'Case note 02 · serum layering order', score: 10 },
  { label: 'Case note 03 · “cold-pressed” spec sheet', score: 10 },
  { label: 'Case note 04 · barrier damage types', score: 9 },
  { label: 'Case note 05 · clean beauty (angle not new)', score: 8 },
  { label: 'Synthetic test · “remind me to call the supplier”', score: 0 },
];

const TRAITS = [
  {
    title: 'Mechanism before advice',
    body: 'She goes one step past the standard tip to explain why it works, such as why waiting between layers matters.',
    evidence: '“The standard advice… is not wrong but it’s incomplete”',
  },
  {
    title: 'Technical, then explained',
    body: 'Real terms like INCI, CoA and occlusive are used without apology and glossed in the same sentence.',
    evidence: '“the vehicle, the base that carries the actives”',
  },
  {
    title: 'Qualified, not overconfident',
    body: 'She fences off the overreading before making her point, and grades how strong the evidence is.',
    evidence: '“I’m not saying X. I’m saying Y.” appears in 9 of 15 pieces',
  },
  {
    title: 'Restrained founder storytelling',
    body: 'Real scenes told in a few flat sentences. She admits mistakes plainly and never builds a hero arc.',
    evidence: '“it should have been right the first time”',
  },
  {
    title: 'No marketing noise',
    body: 'No hype words, no engagement bait, no selling. Brand mentions come late and with limits attached.',
    evidence: '0 exclamation marks, 0 hashtags, 0 emojis across all 15 pieces',
  },
];

const STACK = [
  { name: 'Telegram', role: 'Where Meera captures notes and reviews drafts, the habit she already has.', icon: MessageIcon },
  { name: 'Gemini', role: 'Transcribes voice notes, scores each note, checks news relevance and writes drafts.', icon: SparkIcon },
  { name: 'Google News RSS', role: 'Free headline search (India, English) for an optional, current angle.', icon: NewsIcon },
  { name: 'Supabase', role: 'Memory: every note, score, draft, decision and the Voice Skill.', icon: DatabaseIcon },
  { name: 'Vercel', role: 'Hosts this page and the webhook that Telegram calls for every message.', icon: CloudIcon },
  { name: 'GitHub', role: 'Version control for the code, prompts, Voice Skill and tests.', icon: CodeIcon },
];

const rawExcerpt =
  'Okay so batch fourteen came back from the manufacturer and the pH stability data looked off. I went back to the supplier and it turns out they quietly changed the preservative blend without notifying us… The finished product pH dropped by about 0.4 units… I need to write about this because I think it illustrates something important — the assumption that a ‘same formula’ reorder is actually the same formula. It often isn’t.';

const draftParagraphs = example.draft.text.split(/\n\s*\n/);

function ScoreBar({ score }: { score: number }) {
  return (
    <span className="scorebar" aria-hidden="true">
      <span className={`scorebar-fill ${score >= 6 ? 'is-develop' : 'is-hold'}`} style={{ width: `${score * 10}%` }} />
    </span>
  );
}

export default function Home() {
  return (
    <>
      <header className="topbar">
        <div className="wrap topbar-inner">
          <span className="brand">
            <span className="brand-mark" aria-hidden="true" />
            Skinstinct · Content Pipeline
          </span>
          <a className="topbar-link" href="#how-it-works">
            How it works
          </a>
        </div>
      </header>

      <main>
        {/* 1. Hero */}
        <section className="hero">
          <div className="wrap">
            <span className="badge">
              <ShieldIcon className="badge-icon" />
              Human review required before publishing
            </span>
            <h1>From Raw Thought to Reviewable Post</h1>
            <p className="hero-sub">An AI-assisted content pipeline for Meera Pillai, founder of Skinstinct</p>
            <p className="hero-desc">
              Meera already captures ideas in Telegram, but most never become posts. This system turns worthwhile text or voice notes into
              reviewable LinkedIn drafts while keeping Meera in control of what gets published.
            </p>
            <div className="cta-row">
              <a className="btn btn-primary" href="#how-it-works">
                See How It Works <ArrowRightIcon className="btn-icon" />
              </a>
              {botLink && (
                <a className="btn btn-secondary" href={botLink} target="_blank" rel="noopener noreferrer">
                  Open Telegram Bot
                </a>
              )}
            </div>
            <ol className="hero-strip" aria-label="Summary">
              <li>Note in Telegram</li>
              <li>AI screens &amp; drafts</li>
              <li className="is-human">Meera decides</li>
              <li>She publishes by hand</li>
            </ol>
          </div>
        </section>

        {/* 2. Problem */}
        <section className="section" id="problem">
          <div className="wrap">
            <p className="eyebrow">01 · The problem</p>
            <h2>The Problem</h2>
            <div className="grid-4">
              {PROBLEM.map((p) => (
                <div className="card stat-card" key={p.label}>
                  <span className="stat-value">{p.value}</span>
                  <span className="stat-label">{p.label}</span>
                  <span className="stat-note">{p.note}</span>
                </div>
              ))}
            </div>
            <p className="lead">
              Meera does not have an idea-generation problem. She has a <strong>conversion problem</strong> between capturing a thought and turning it into
              something she is willing to publish.
            </p>
            <blockquote className="quote">
              “I open the doc, I write two lines, I decide it’s not good enough, I close it. By the time I come back to it two weeks later, the moment has
              passed.”
              <cite>Meera Pillai, from the case brief</cite>
            </blockquote>
          </div>
        </section>

        {/* 3. Outcome */}
        <section className="section section-tint" id="outcome">
          <div className="wrap">
            <p className="eyebrow">02 · The goal</p>
            <h2>What Success Looks Like</h2>
            <div className="grid-2">
              <div className="card outcome-card">
                <span className="stat-value">3</span>
                <span className="stat-label">publishable posts per week</span>
              </div>
              <div className="card outcome-card">
                <span className="stat-value">&lt;15</span>
                <span className="stat-label">minutes of Meera’s active time</span>
              </div>
            </div>
            <p className="lead">
              The system removes the <strong>drafting friction</strong> (the blank page, the first two lines, the stall). It does not remove{' '}
              <strong>human judgment</strong>: Meera still decides what carries her name.
            </p>
          </div>
        </section>

        {/* 4. Workflow */}
        <section className="section" id="how-it-works">
          <div className="wrap">
            <p className="eyebrow">03 · How it works</p>
            <h2>Nine Steps, One Human Decision</h2>
            <p className="section-intro">Select a step to see what happens and which safeguard applies.</p>
            <Workflow />
          </div>
        </section>

        {/* 5. Scoring */}
        <section className="section section-tint" id="scoring">
          <div className="wrap">
            <p className="eyebrow">04 · Triage</p>
            <h2>Not Every Thought Should Become a Post</h2>
            <p className="section-intro">
              Before anything is drafted, each note is scored on five dimensions, each from 0 to 2. The AI doesn’t write a post from every note.
            </p>
            <div className="scoring-layout">
              <div className="card">
                <ul className="dimension-list">
                  {DIMENSIONS.map((d) => (
                    <li key={d.name}>
                      <div>
                        <span className="dimension-name">{d.name}</span>
                        <span className="dimension-q">{d.q}</span>
                      </div>
                      <span className="pips" aria-label="scored 0 to 2">
                        <span>0</span>
                        <span>1</span>
                        <span>2</span>
                      </span>
                    </li>
                  ))}
                </ul>
                <div className="dimension-total">
                  <span>Total score</span>
                  <strong>/ 10</strong>
                </div>
              </div>
              <div className="card">
                <div className="threshold">
                  <div className="threshold-band is-hold">
                    <strong>0–5</strong>
                    <span>Needs more substance</span>
                    <small>Meera gets a reason, and nothing is drafted</small>
                  </div>
                  <div className="threshold-band is-develop">
                    <strong>6–10</strong>
                    <span>Develop into a draft</span>
                    <small>Research and drafting continue</small>
                  </div>
                </div>
                <p className="mini-heading">Real scores from the live scoring prompt</p>
                <ul className="scored-list">
                  {SCORED.map((s) => (
                    <li key={s.label}>
                      <span className="scored-label">{s.label}</span>
                      <ScoreBar score={s.score} />
                      <span className={`scored-value ${s.score >= 6 ? 'is-develop' : 'is-hold'}`}>{s.score}/10</span>
                    </li>
                  ))}
                </ul>
                <p className="fine">
                  Case notes are the real notes supplied with the case. The synthetic note was written only for testing. Weak and prompt-injection test notes
                  both scored 0.
                </p>
              </div>
            </div>
          </div>
        </section>

        {/* 6. Example */}
        <section className="section" id="example">
          <div className="wrap">
            <p className="eyebrow">05 · Real output</p>
            <h2>See the Pipeline in Action</h2>
            <p className="provenance">
              <CheckIcon className="provenance-icon" />
              <span>
                <strong>Real pipeline output, not a mock-up.</strong> Case note 01 was sent through Telegram on{' '}
                {new Date(example.runAt).toLocaleDateString('en-IN', { day: 'numeric', month: 'long', year: 'numeric' })} during end-to-end testing. The
                draft was reviewed in testing, not by Meera, and has not been published.
              </span>
            </p>

            <div className="demo-flow">
              <article className="card demo-step">
                <p className="demo-label">1 · Raw note</p>
                <p className="demo-note">{rawExcerpt}</p>
                <p className="fine">Excerpt of case note 01, shortened (…) for space.</p>
              </article>

              <ArrowRightIcon className="demo-arrow" />

              <article className="card demo-step">
                <p className="demo-label">2 · AI score</p>
                <p className="demo-score">
                  {example.score.total}
                  <span>/10</span>
                </p>
                <ul className="demo-breakdown">
                  <li>Insight {example.score.insight}</li>
                  <li>Specificity {example.score.specificity}</li>
                  <li>Relevance {example.score.relevance}</li>
                  <li>Evidence {example.score.evidence}</li>
                  <li>Completeness {example.score.completeness}</li>
                </ul>
                <p className="demo-verdict is-develop">Develop → continue</p>
              </article>

              <ArrowRightIcon className="demo-arrow" />

              <article className="card demo-step">
                <p className="demo-label">3 · Relevant news</p>
                <p className="demo-query">
                  Searched: <code>{example.research.searchQuery}</code>
                </p>
                <p className="demo-verdict is-hold">No news used</p>
                <p className="demo-small">
                  One recent headline was found. Gemini judged it off-topic: in its words, the article concerned manufacturing changes driven by a
                  microplastics ban, while the note is about supplier transparency. So no news was used and no source block was attached.
                </p>
              </article>
            </div>

            <article className="card draft-card">
              <div className="draft-head">
                <p className="demo-label">4 · Draft returned to Telegram</p>
                <span className="draft-meta">
                  Written by {example.draft.model} · {example.draft.unsupportedFigures.length === 0 ? 'no unsupported figures' : 'figures flagged'} · no
                  warnings
                </span>
              </div>
              <div className="draft-body">
                {draftParagraphs.slice(0, 3).map((p) => (
                  <p key={p.slice(0, 30)}>{p}</p>
                ))}
                {draftParagraphs.length > 3 && (
                  <details>
                    <summary>Show the full draft</summary>
                    {draftParagraphs.slice(3).map((p) => (
                      <p key={p.slice(0, 30)}>{p}</p>
                    ))}
                  </details>
                )}
              </div>
              <div className="draft-foot">
                <span>─────────────────</span>
                <span>Reply to this message with APPROVE or REJECT.</span>
              </div>
            </article>
          </div>
        </section>

        {/* 7. Voice Skill */}
        <section className="section section-tint" id="voice">
          <div className="wrap">
            <p className="eyebrow">06 · The Voice Skill</p>
            <h2>Built Around Her Voice, Not Generic LinkedIn Writing</h2>
            <p className="section-intro">
              Before any drafting, Meera’s own published writing was analysed to produce a Voice Skill: a description of <em>how</em> she writes. It is not a
              source of facts: facts come only from the new note, and every draft is checked for wording copied from her old posts.
            </p>
            <div className="corpus-row">
              <div>
                <strong>4</strong>
                <span>LinkedIn posts</span>
              </div>
              <span className="corpus-plus">+</span>
              <div>
                <strong>11</strong>
                <span>newsletters</span>
              </div>
              <span className="corpus-plus">=</span>
              <div>
                <strong>15</strong>
                <span>pieces analysed</span>
              </div>
            </div>
            <div className="grid-traits">
              {TRAITS.map((t) => (
                <div className="card trait-card" key={t.title}>
                  <h3>{t.title}</h3>
                  <p>{t.body}</p>
                  <p className="trait-evidence">{t.evidence}</p>
                </div>
              ))}
            </div>
            <p className="fine">
              Traits and counts come from the Voice Skill file (data/voice-skill.txt), which was checked against the 15 pieces. Quotes are from Meera’s
              published writing in the case dataset.
            </p>
          </div>
        </section>

        {/* 8. Boundary */}
        <section className="section" id="boundary">
          <div className="wrap">
            <p className="eyebrow">07 · The boundary</p>
            <h2>Where the AI Stops</h2>
            <div className="boundary">
              <div className="card boundary-col">
                <h3>
                  <SparkIcon className="boundary-icon" /> AI can
                </h3>
                <ul>
                  {['Transcribe', 'Score', 'Research', 'Draft', 'Store'].map((x) => (
                    <li key={x}>
                      <CheckIcon className="li-icon" />
                      {x}
                    </li>
                  ))}
                </ul>
              </div>
              <div className="boundary-divider" aria-hidden="true">
                <span>handover</span>
              </div>
              <div className="card boundary-col is-human">
                <h3>
                  <ShieldIcon className="boundary-icon" /> Human must
                </h3>
                <ul>
                  {['Verify external claims', 'Edit if required', 'APPROVE or REJECT', 'Publish manually'].map((x) => (
                    <li key={x}>
                      <CheckIcon className="li-icon" />
                      {x}
                    </li>
                  ))}
                </ul>
              </div>
            </div>
            <p className="callout">AI reduces friction. It does not replace authorship.</p>
            <p className="section-intro center">
              There is no LinkedIn connection in the system at all: no API, no credentials, no scheduling. Approval only changes a status in the database.
            </p>
          </div>
        </section>

        {/* 9. Stack */}
        <section className="section section-tint" id="stack">
          <div className="wrap">
            <p className="eyebrow">08 · Architecture</p>
            <h2>Built With</h2>
            <div className="grid-3">
              {STACK.map((s) => {
                const Icon = s.icon;
                return (
                  <div className="card stack-card" key={s.name}>
                    <Icon className="stack-icon" />
                    <h3>{s.name}</h3>
                    <p>{s.role}</p>
                  </div>
                );
              })}
            </div>
          </div>
        </section>

        {/* 11. Try it (before status so the status panel closes the page) */}
        <section className="section" id="try">
          <div className="wrap">
            <p className="eyebrow">09 · Try it</p>
            <h2>Try the Real Workflow</h2>
            <ol className="try-list">
              <li>Open the Telegram bot</li>
              <li>Send a text or voice note</li>
              <li>The system evaluates the note</li>
              <li>Strong notes become drafts</li>
              <li>Reply APPROVE or REJECT</li>
              <li className="is-human">Nothing is automatically published</li>
            </ol>
            {botLink && (
              <div className="cta-row center">
                <a className="btn btn-primary" href={botLink} target="_blank" rel="noopener noreferrer">
                  Open Telegram Bot <ArrowRightIcon className="btn-icon" />
                </a>
              </div>
            )}
          </div>
        </section>

        {/* 10. Status */}
        <section className="section section-tint" id="status">
          <div className="wrap narrow">
            <p className="eyebrow">10 · Live</p>
            <h2>System Status</h2>
            <StatusPanel />
          </div>
        </section>
      </main>

      <footer className="footer">
        <div className="wrap">
          <p>MESA AI-Native Track · Founder’s Office · Cohort C4 · Case 1</p>
          <p>Skinstinct, Meera Pillai and all case data are fictional, created for learning purposes.</p>
        </div>
      </footer>
    </>
  );
}
