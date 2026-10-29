import { useContext } from 'react'
import { ArrowRight } from 'lucide-react'
import { SiteLogo } from '../components/Logo'
import { AppContext } from '../lib/appContext'
import { linkProps } from '../lib/router'

// The public pitch to coachings (/for-coaching): open a portal, build mocks,
// share a code. Opens logged out too.
//
// Prices mirror the coaching_plans table (migrations coaching_plans and
// coaching_pro_plan). The table is readable only when signed in, so this
// page can't load them; update both together.
const PLANS = [
  {
    key: 'monthly', label: 'Monthly', price: 399, per: 'month', note: '30 days of your portal',
    features: ['Your coaching portal and page', 'Class tests you upload: unlimited, free', 'By Fedge, for each exam: 1 full mock', '1 sectional each: English, Maths, Reasoning'],
  },
  {
    key: 'yearly', label: 'Yearly', price: 3999, per: 'year', note: '≈ ₹333 a month · 2 months free', badge: 'Best value',
    features: ['Class tests you upload: unlimited, free', 'By Fedge, for each exam: 2 full mocks', '1 sectional each: English, Maths, Reasoning', '365 days of your portal'],
  },
  {
    key: 'pro', label: 'Pro', price: 4999, per: 'year', note: 'Yearly + the Fedge mock pack', badge: 'Coming soon', soon: true,
    features: ['Class tests you upload: 1 a week', '8 Prelims full mocks by Fedge', '4 Mains full mocks by Fedge', '5 sectionals each: English, Quant, Reasoning, Computer', 'New Fedge mocks land in your portal'],
  },
]
const FEE_PCT = 35

const EXAMS = ['SBI PO', 'SBI Clerk', 'IBPS PO', 'IBPS Clerk', 'IBPS RRB', 'RBI Assistant']

export default function ForCoaching() {
  // Rendered outside the app context when logged out.
  const app = useContext(AppContext)
  const signedIn = !!app && !app.guest

  return (
    <div className="lp">
      <div className="lp-wrap">
        <nav className="lp-nav" aria-label="Site">
          <a {...linkProps('/')} aria-label="Fedge Sanqe home"><SiteLogo by="for coachings" /></a>
          <div className="lp-links">
            <a href="#how">How it works</a>
            <a href="#why">Why Sanqe</a>
            <a href="#students">For students</a>
            <a href="#pricing">Pricing</a>
          </div>
          <div className="lp-nav-actions">
            {!signedIn && <a className="btn ghost small lp-hide-sm" {...linkProps('/login')}>Student log in</a>}
            <a className="btn primary small" {...linkProps('/coach')}>Open your portal</a>
          </div>
        </nav>

        <header className="lp-hero">
          <div>
            <span className="lp-tag"><b>New</b> Coaching portal from ₹399 / month</span>
            <h1>Give your students <span className="hl">real exam practice</span>, under your coaching’s name.</h1>
            <p className="lp-lede">
              Sanqe gives your bank-exam coaching an exam-style mock platform: sectional timers, negative marking,
              instant results and ranks inside your own batch. Your students join with your code.
            </p>
            <div className="lp-ctas">
              <a className="btn accent big" {...linkProps('/coach')}>Open your portal <ArrowRight size={16} /></a>
              <a className="btn big" href="#how">See how it works</a>
            </div>
            <p className="lp-fine">Portal opens <b>straight away</b> · Pay by UPI, card or netbanking · Students practise free</p>
          </div>
          <ExamPreview />
        </header>

        <div className="lp-exams" aria-label="Exams">
          <span>Built for</span>
          {EXAMS.map((e) => <span key={e}>{e}</span>)}
        </div>

        <section className="lp-block" id="how">
          <div className="lp-block-head">
            <h2>From sign-up to first mock <span className="hl">in an evening.</span></h2>
            <p>No developer, no app of your own. You bring the questions you already teach from; Sanqe runs the exam.</p>
          </div>
          <ol className="lp-steps">
            <li>
              <span className="lp-step-n"><i>1</i>Apply</span>
              <h3>Name your coaching</h3>
              <p>Choose your state and district. The portal opens as soon as you pay.</p>
              <div className="chip-row"><span className="chip">no approval wait</span><span className="chip">₹399 / month</span></div>
            </li>
            <li>
              <span className="lp-step-n"><i>2</i>Build</span>
              <h3>Create a test series, upload questions</h3>
              <p>Add sections, set sectional timers and negative marking, and import questions straight from Excel or CSV.</p>
              <div className="chip-row"><span className="chip">sectional timers</span><span className="chip">negative marking</span><span className="chip">.xlsx / .csv</span></div>
            </li>
            <li>
              <span className="lp-step-n"><i>3</i>Share</span>
              <h3>Give students your code</h3>
              <p>Set a price or make it free. Students enter your code, take the mock, and you see every score and rank.</p>
              <div className="chip-row"><span className="chip">ranks in your batch</span><span className="chip">instant results</span></div>
            </li>
          </ol>
        </section>

        <section className="lp-block" id="why">
          <div className="lp-block-head">
            <h2>Why not just send them to <span className="hl">a big test platform?</span></h2>
            <p>Because then your students practise on someone else’s questions, rank against strangers, and get shown someone else’s course.</p>
          </div>
          <div className="lp-table-wrap">
            <table className="lp-compare">
              <thead><tr><td /><th>On Sanqe</th><th>Big mock platforms</th></tr></thead>
              <tbody>
                <tr><td>Whose name students see</td><td className="yes">Yours, on every mock and result</td><td className="no">The platform’s</td></tr>
                <tr><td>Whose questions</td><td className="yes">Yours, or add Fedge’s pack</td><td className="no">Theirs</td></tr>
                <tr><td>Who sets the price</td><td className="yes">You. Keep {100 - FEE_PCT}% of online sales</td><td className="no">They do</td></tr>
                <tr><td>Who students rank against</td><td className="yes">Your own batch</td><td className="no">Everyone on the platform</td></tr>
                <tr><td>What students see next</td><td className="yes">Your next mock</td><td className="no">The platform’s next course</td></tr>
              </tbody>
            </table>
          </div>
        </section>

        <section className="lp-block" id="students">
          <div className="lp-block-head">
            <h2>Students start free. <span className="hl">Your code</span> unlocks the rest.</h2>
            <p>Every aspirant gets the speed drills without paying anything. Joining their coaching opens the full prep kit.</p>
          </div>
          <div className="lp-students">
            <div className="lp-card">
              <span className="eyebrow">Free for everyone</span>
              <h3>Warm up every day</h3>
              <p>The drills toppers do daily, timed and scored.</p>
              <ul>
                <li><span>Circle Game: add ten numbers in 60 s</span><span>daily</span></li>
                <li><span>Simplification &amp; Approximation</span><span>speed score</span></li>
                <li><span>Number Series &amp; Wrong Number Series</span><span>speed score</span></li>
                <li><span>Quadratic Equations</span><span>speed score</span></li>
              </ul>
            </div>
            <div className="lp-card dark">
              <span className="eyebrow">With your coaching’s code</span>
              <h3>The full prep kit</h3>
              <p>Opens the moment a student joins one of your series.</p>
              <ul>
                <li><span>Your full and sectional mocks</span><span>exam window</span></li>
                <li><span>Topic practice · 15 / 30 / 60 min · Intense</span><span>all subjects</span></li>
                <li><span>Daily Challenge · Mistake notebook</span><span>spaced review</span></li>
                <li><span>Learn notes in English &amp; Hinglish</span><span>by topic</span></li>
              </ul>
            </div>
          </div>
        </section>

        <section className="lp-block" id="pricing">
          <div className="lp-block-head">
            <h2>One price for the portal. <span className="hl">No per-student fee.</span></h2>
            <p>Add as many students and mocks as you like. Students keep what they joined even if your plan lapses.</p>
          </div>
          <div className="lp-pricing">
            {PLANS.map((p) => (
              <div key={p.key} className={`lp-price${p.badge && !p.soon ? ' best' : ''}${p.soon ? ' soon' : ''}`}>
                {p.badge && <span className="lp-price-badge">{p.badge}</span>}
                <h3>{p.label}</h3>
                <div className="lp-amt num">₹{p.price.toLocaleString('en-IN')}<small> / {p.per}</small></div>
                <div className="lp-per">{p.note}</div>
                <ul>{p.features.map((f) => <li key={f}>{f}</li>)}</ul>
                {p.soon
                  ? <span className="btn lp-soon" aria-disabled="true">Coming soon</span>
                  : <a className={`btn ${p.badge ? 'primary' : ''}`} {...linkProps('/coach')}>Start {p.label.toLowerCase()}</a>}
              </div>
            ))}
          </div>
          <p className="lp-fee">
            <span>Selling a series online?</span>
            <span>You keep <b className="num">{100 - FEE_PCT}%</b>, Fedge’s fee is <b className="num">{FEE_PCT}%</b>.</span>
            <span>Collected fees at your centre? Hand out access codes instead, with no fee.</span>
          </p>
        </section>
      </div>

      <section className="lp-cta">
        <div className="lp-wrap">
          <h2>Your students already trust you.<br /><span className="hl">Give them a test series that looks like it.</span></h2>
          <a className="btn accent big" {...linkProps('/coach')}>Open your portal <ArrowRight size={16} /></a>
        </div>
      </section>
      <footer className="lp-wrap lp-foot">
        <span>© {new Date().getFullYear()} Fedge · for bank-exam aspirants and their coachings</span>
        <nav aria-label="Footer"><a href="/privacy.html" target="_blank" rel="noopener">Privacy</a><a {...linkProps('/contact')}>Contact</a><a {...linkProps('/')}>Student app</a></nav>
      </footer>
    </div>
  )
}

// A still of the exam window students see, drawn in the instrument style.
// A still of the exam window students get: the IBPS / TCS iON layout, with
// the coaching's own logo where the exam body's would be.
const TABLE = [['HR', 200, 40], ['IT', 450, 20], ['Sales', 300, 30], ['Finance', 250, 36], ['Admin', 150, 60]]

function ExamPreview() {
  return (
    <figure className="ibx" aria-label="Preview of the exam window students see">
      <div className="ibx-head">
        <span className="ibx-logo">SUCCESS POINT</span>
        <b className="ibx-title">IBPS RRB Officer Scale-I (Prelims) · Mock 07</b>
        <span className="ibx-links"><span>Question Paper</span><span>View Instructions</span></span>
      </div>
      <div className="ibx-sections">
        <span className="ibx-sec-label">Sections</span>
        <span className="ibx-sec">Reasoning Ability <i>i</i></span>
        <span className="ibx-sec on">Quantitative Aptitude <i>i</i></span>
        <span className="ibx-time">Time Left : <b className="num">18:54</b></span>
      </div>
      <div className="ibx-type">
        <span>Question Type : MCQ</span>
        <span>Marks for correct answer: <b className="ok">1</b> | Negative Marks: <b className="bad">0.25</b></span>
      </div>
      <div className="ibx-qno">
        <b>Question No. 7</b>
        <span>View in: <span className="ibx-select">English</span></span>
      </div>
      <div className="ibx-body">
        <div className="ibx-passage">
          <p><b>Directions (6–8): Study the following table carefully and answer the questions given below.</b></p>
          <p>The table shows the total number of employees in five departments of a company and the percentage of female employees in each department.</p>
          <table>
            <thead><tr><th>Department</th><th>Total employees</th><th>% of females</th></tr></thead>
            <tbody>{TABLE.map(([d, n, pct]) => <tr key={d}><td>{d}</td><td>{n}</td><td>{pct}%</td></tr>)}</tbody>
          </table>
        </div>
        <div className="ibx-question">
          <p>What is the total number of male employees in HR and Sales departments together?</p>
          {['320', '330', '340', '310', '350'].map((o) => (
            <span key={o} className="ibx-opt"><i />{o}</span>
          ))}
        </div>
      </div>
      <div className="ibx-foot">
        <span className="ibx-btn">Mark for Review &amp; Next</span>
        <span className="ibx-btn">Clear Response</span>
        <span className="ibx-btn go">Save &amp; Next</span>
      </div>
    </figure>
  )
}
