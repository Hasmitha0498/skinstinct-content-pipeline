'use client';
// Interactive nine-step pipeline. Every detail below describes what the deployed code actually does.
import { useState, type ComponentType, type SVGProps } from 'react';
import { BranchIcon, DatabaseIcon, GaugeIcon, InboxIcon, MessageIcon, MicIcon, NewsIcon, PenIcon, PersonCheckIcon, StopIcon } from './icons';

interface Step {
  title: string;
  short: string;
  who: 'Meera' | 'Gemini' | 'System' | 'Telegram' | 'Supabase';
  icon: ComponentType<SVGProps<SVGSVGElement>>;
  detail: string;
  safeguard: string;
  human?: boolean;
}

const STEPS: Step[] = [
  {
    title: 'Capture',
    short: 'Telegram text or voice note',
    who: 'Meera',
    icon: MessageIcon,
    detail: 'Meera keeps her existing habit: she drops a note into her Telegram channel, typed or spoken. Nothing new to learn.',
    safeguard: 'Each Telegram update is processed exactly once, even if Telegram re-sends it. Every chat’s drafts are kept separate.',
  },
  {
    title: 'Transcribe',
    short: 'Gemini transcribes voice notes',
    who: 'Gemini',
    icon: MicIcon,
    detail: 'Voice notes are downloaded into memory and transcribed word for word. Text notes skip this step.',
    safeguard: 'If the audio is unclear, the note is marked as failed and Meera is told. A transcript is never guessed.',
  },
  {
    title: 'Score',
    short: 'Gemini scores the note 0–10',
    who: 'Gemini',
    icon: GaugeIcon,
    detail: 'Five dimensions, each 0–2: insight, specificity, relevance, evidence and completeness.',
    safeguard: 'The total is recalculated in code from the five parts; the model’s own arithmetic is never trusted.',
  },
  {
    title: 'Decide',
    short: 'Below 6 → feedback · 6+ → continue',
    who: 'System',
    icon: BranchIcon,
    detail: 'Weak notes stop here with a short, specific reason and what would make them worth drafting.',
    safeguard: 'No news search and no drafting happen for notes below 6.',
  },
  {
    title: 'Research',
    short: 'Google News RSS for a current angle',
    who: 'System',
    icon: NewsIcon,
    detail: 'A short search is built from the note’s own subject. Recent headlines (last 30 days) are checked by Gemini for a genuine fit.',
    safeguard: 'News is used only above a 0.70 confidence threshold. Most notes are drafted without news, and that is expected.',
  },
  {
    title: 'Draft',
    short: 'Gemini writes in Meera’s Voice Skill',
    who: 'Gemini',
    icon: PenIcon,
    detail: 'The note, Meera’s Voice Skill and (only if relevant) the news headline are combined into a LinkedIn draft.',
    safeguard: 'Checks flag figures not in the note, wording copied from her past posts and stronger claims than she made.',
  },
  {
    title: 'Review',
    short: 'Draft returns to Telegram',
    who: 'Telegram',
    icon: InboxIcon,
    detail: 'The draft arrives as a reply to the original note, with any warnings listed beneath it.',
    safeguard: 'If news was used, a mandatory source block shows the headline, publication, date and link to verify.',
  },
  {
    title: 'Human decision',
    short: 'Meera replies APPROVE or REJECT',
    who: 'Meera',
    icon: PersonCheckIcon,
    human: true,
    detail: 'Meera reads the draft and decides. Approving only marks it ready for her to edit and publish herself.',
    safeguard: 'If several drafts are pending, the system refuses to guess which one she meant.',
  },
  {
    title: 'Memory',
    short: 'Notes, drafts and decisions stored',
    who: 'Supabase',
    icon: DatabaseIcon,
    detail: 'Every note, score, draft and decision is kept in Supabase, including rejected ones, so weak spots can be improved.',
    safeguard: 'Decisions are final and reviewed drafts can’t be edited or deleted by the system.',
  },
];

export function Workflow() {
  const [active, setActive] = useState(0);
  const step = STEPS[active]!;
  const StepIcon = step.icon;

  return (
    <div className="workflow">
      <ol className="workflow-track" role="tablist" aria-label="Pipeline steps">
        {STEPS.map((s, i) => {
          const Icon = s.icon;
          return (
            <li key={s.title} className="workflow-item">
              <button
                type="button"
                role="tab"
                id={`step-tab-${i}`}
                aria-selected={active === i}
                aria-controls="step-panel"
                className={`workflow-step${active === i ? ' is-active' : ''}${s.human ? ' is-human' : ''}`}
                onClick={() => setActive(i)}
                onMouseEnter={() => setActive(i)}
                onFocus={() => setActive(i)}
              >
                <span className="workflow-num">{i + 1}</span>
                <Icon className="workflow-icon" />
                <span className="workflow-title">{s.title}</span>
                <span className="workflow-short">{s.short}</span>
              </button>
            </li>
          );
        })}
      </ol>

      <div id="step-panel" role="tabpanel" aria-labelledby={`step-tab-${active}`} className={`workflow-panel${step.human ? ' is-human' : ''}`}>
        <div className="workflow-panel-head">
          <StepIcon className="workflow-panel-icon" />
          <div>
            <p className="eyebrow">
              Step {active + 1} of {STEPS.length} · {step.who}
            </p>
            <h3>{step.title}</h3>
          </div>
        </div>
        <p>{step.detail}</p>
        <p className="workflow-safeguard">
          <strong>Safeguard:</strong> {step.safeguard}
        </p>
      </div>

      <div className="workflow-stop">
        <StopIcon className="workflow-stop-icon" />
        <p>
          <strong>The system stops here.</strong> It never publishes to LinkedIn automatically.
        </p>
      </div>
    </div>
  );
}
