import {
  AlertTriangle, ArrowUpRight, CheckCircle2, Clock, Hourglass,
  ShieldAlert, UserMinus, Users,
} from 'lucide-react'

const BUCKET_ICONS = {
  stale: Clock,
  stuck: Hourglass,
  noTeams: Users,
  rosterGap: UserMinus,
  mismatch: AlertTriangle,
  anomaly: ShieldAlert,
}

const HealthPanel = ({ buckets = [], totalLobbies = 0, loading = false, onReview }) => {
  const attention = buckets.reduce((sum, bucket) => sum + bucket.count, 0)

  if (loading) {
    return (
      <div className="lob-tab-body">
        <div className="lob-health-grid" aria-hidden="true">
          {[0, 1, 2, 3, 4, 5].map((index) => (
            <div key={index} className="lob-health-card lob-skeleton">
              <span className="lob-sk lob-sk-pill" />
              <span className="lob-sk lob-sk-value" />
              <span className="lob-sk lob-sk-line" />
              <span className="lob-sk lob-sk-sub" />
            </div>
          ))}
        </div>
      </div>
    )
  }

  if (attention === 0) {
    return (
      <div className="lob-tab-body">
        <div className="lob-health-clear">
          <span className="lob-health-clear-icon"><CheckCircle2 size={26} /></span>
          <strong>No issues detected</strong>
          <p>All {totalLobbies} lobbies look healthy across status, teams and roster coverage.</p>
        </div>
      </div>
    )
  }

  return (
    <div className="lob-tab-body">
      <div className="lob-health-intro">
        <div>
          <strong>{attention} signals</strong> across {totalLobbies} lobbies
        </div>
        <p>
          These checks are computed from the live schema. A lobby can appear in more than one bucket.
          Reviewing a bucket filters the directory so you can act on it.
        </p>
      </div>

      <div className="lob-health-grid">
        {buckets.map((bucket) => {
          const Icon = BUCKET_ICONS[bucket.key] || AlertTriangle
          return (
            <article key={bucket.key} className={`lob-health-card ${bucket.tone}`}>
              <header className="lob-health-head">
                <span className="lob-health-icon"><Icon size={16} /></span>
                <h3>{bucket.label}</h3>
              </header>

              <strong className="lob-health-count">
                {bucket.count}
                <span>{bucket.count === 1 ? 'lobby' : 'lobbies'}</span>
              </strong>

              <p className="lob-health-desc">{bucket.description}</p>
              <p className="lob-health-advice">{bucket.advice}</p>

              {bucket.examples.length > 0 && (
                <ul className="lob-health-examples">
                  {bucket.examples.map((row) => (
                    <li key={row.id}>
                      <span className="lob-health-example-name" title={row.name}>{row.name || 'Untitled lobby'}</span>
                      <span className="lob-health-example-meta">{row.teamCount} teams</span>
                    </li>
                  ))}
                  {bucket.count > bucket.examples.length && (
                    <li className="lob-health-more">
                      +{bucket.count - bucket.examples.length} more
                    </li>
                  )}
                </ul>
              )}

              <button
                type="button"
                className="lob-health-review"
                onClick={() => onReview(bucket.key)}
                disabled={bucket.count === 0}
              >
                Review lobbies <ArrowUpRight size={13} />
              </button>
            </article>
          )
        })}
      </div>
    </div>
  )
}

export default HealthPanel
