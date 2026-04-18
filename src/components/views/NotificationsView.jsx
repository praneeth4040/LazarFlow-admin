import { useState, useEffect } from 'react'
import { supabase } from '../../lib/supabase'
import {
  Bell, Send, Info, RefreshCcw,
  CheckCircle2, XCircle,
} from 'lucide-react'

const NotificationsView = () => {
  const [users, setUsers] = useState({ org: [], teams: [] })
  const [loadingUsers, setLoadingUsers] = useState(false)
  const [recipientType, setRecipientType] = useState('all')
  const [selectedUserIds, setSelectedUserIds] = useState([])
  const [title, setTitle] = useState('')
  const [message, setMessage] = useState('')
  const [sending, setSending] = useState(false)
  const [status, setStatus] = useState({ type: '', message: '' })
  const [isUsingFallback, setIsUsingFallback] = useState(false)
  const [activityLogs, setActivityLogs] = useState([])

  const addLog = (type, message, details = null) => {
    const newLog = {
      id: Date.now(),
      timestamp: new Date().toLocaleTimeString(),
      type, message, details,
    }
    setActivityLogs(prev => [newLog, ...prev].slice(0, 50))
    console.log(`[${newLog.timestamp}] ${type.toUpperCase()}: ${message}`, details || '')
  }

  useEffect(() => { fetchNotificationUsers() }, [])

  const fetchNotificationUsers = async () => {
    setLoadingUsers(true)
    setIsUsingFallback(false)
    addLog('info', 'Fetching recipients from Supabase...')
    try {
      const [{ data: profiles, error: pError }, { data: teams, error: tError }] = await Promise.all([
        supabase.from('profiles').select('*').order('username', { ascending: true }),
        supabase.from('team_profiles').select('*').order('name', { ascending: true }),
      ])
      if (pError) addLog('error', 'Failed to fetch profiles from Supabase', pError.message)
      if (tError) addLog('error', 'Failed to fetch team profiles from Supabase', tError.message)

      const formattedProfiles = (profiles || []).map(u => ({
        ...u, id: u.id,
        display_name: u.display_name || u.username || u.emails || 'Unknown User',
        is_team: false,
      }))
      const formattedTeams = (teams || []).map(t => ({
        id: t.id, display_name: t.name || 'Unnamed Team', is_team: true,
      }))

      addLog('success', `Fetched ${formattedProfiles.length} users and ${formattedTeams.length} teams from Supabase`)
      setUsers({ org: formattedProfiles, teams: formattedTeams })
    } catch (err) {
      addLog('error', `Failed to fetch recipients: ${err.message}`)
      setStatus({ type: 'error', message: `Recipient list error: ${err.message}` })
    } finally {
      setLoadingUsers(false)
    }
  }

  const handleSend = async (e) => {
    e.preventDefault()
    if (!message.trim()) { setStatus({ type: 'error', message: 'Message body is required' }); return }
    if (recipientType === 'specific' && selectedUserIds.length === 0) {
      setStatus({ type: 'error', message: 'Please select at least one recipient' }); return
    }
    if (recipientType === 'all_org' && users.org.length === 0) {
      setStatus({ type: 'error', message: 'No users found in Org section' }); return
    }
    if (recipientType === 'all_teams' && users.teams.length === 0) {
      setStatus({ type: 'error', message: 'No teams found in Teams section' }); return
    }

    setSending(true)
    setStatus({ type: '', message: '' })
    try {
      let finalUserIds = []
      if (recipientType === 'all') finalUserIds = 'all'
      else if (recipientType === 'all_org') finalUserIds = users.org.map(u => u.id)
      else if (recipientType === 'all_teams') finalUserIds = users.teams.map(t => t.id)
      else finalUserIds = selectedUserIds

      const payload = { user_ids: finalUserIds, title: title.trim() || undefined, message: message.trim() }
      addLog('request', 'POST /api/notifications/send-test', payload)

      const response = await fetch('/api/notifications/send-test', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(payload),
      }).catch(err => {
        if (err.name === 'TypeError' && err.message === 'Failed to fetch') {
          addLog('error', 'Connection failed: Backend server not reachable')
          throw new Error('Connection failed: Backend server not reachable. Please check if your API server is running.')
        }
        throw err
      })

      const responseText = await response.text()
      addLog('response', `POST /api/notifications/send-test returned status ${response.status}`, responseText)

      let data = {}
      try {
        if (responseText) data = JSON.parse(responseText)
      } catch (e) {
        addLog('error', 'Failed to parse JSON response', responseText)
        if (!response.ok) throw new Error(`Server Error (${response.status}): ${responseText.substring(0, 100) || response.statusText}`)
      }

      if (response.ok) {
        addLog('success', 'Notification sent successfully', data)
        setStatus({ type: 'success', message: data.message || 'Notification sent successfully!' })
        setTitle(''); setMessage(''); setSelectedUserIds([])
      } else {
        addLog('error', 'Server rejected notification request', data)
        throw new Error(data.error || data.message || `Failed to send (Status ${response.status})`)
      }
    } catch (err) {
      addLog('error', `Submission error: ${err.message}`)
      setStatus({ type: 'error', message: err.message })
    } finally {
      setSending(false)
    }
  }

  const toggleUserSelection = (userId) => {
    setSelectedUserIds(prev => prev.includes(userId) ? prev.filter(id => id !== userId) : [...prev, userId])
  }

  const getPreviewAppName = () => {
    if (recipientType === 'all_teams') return 'LazarFlow Teams'
    if (recipientType === 'all_org' || recipientType === 'all') return 'LazarFlow'
    if (recipientType === 'specific') {
      const hasTeams = selectedUserIds.some(id => users.teams.some(t => t.id === id))
      const hasOrg = selectedUserIds.some(id => users.org.some(u => u.id === id))
      if (hasTeams && !hasOrg) return 'LazarFlow Teams'
      if (hasOrg && !hasTeams) return 'LazarFlow'
      if (hasTeams && hasOrg) return 'LazarFlow / Teams'
    }
    return 'LazarFlow'
  }

  return (
    <div className="notification-management">
      <div className="notification-header">
        <h2><Bell size={20} /> Send Notifications</h2>
        <p className="subtitle">Compose and send push notifications to your users</p>
        {isUsingFallback && (
          <div className="fallback-badge">
            <Info size={12} /> Using direct database fallback (API issues)
          </div>
        )}
      </div>

      <div className="notification-container">
        <form onSubmit={handleSend} className="notification-form">
          <div className="form-section">
            <label className="form-label">Recipients</label>
            <div className="recipient-options">
              {[
                { key: 'all', label: 'All Users & Teams' },
                { key: 'all_org', label: 'All Org (Users)' },
                { key: 'all_teams', label: 'All Teams' },
                { key: 'specific', label: 'Specific Selection' },
              ].map(({ key, label }) => (
                <button
                  key={key} type="button"
                  className={`recipient-type-btn ${recipientType === key ? 'active' : ''}`}
                  onClick={() => setRecipientType(key)}
                >{label}</button>
              ))}
            </div>
          </div>

          {recipientType === 'specific' && (
            <div className="form-section">
              <label className="form-label">Select Users ({selectedUserIds.length} selected)</label>
              <div className="user-selector">
                {loadingUsers ? (
                  <div className="loading-small">Loading recipients...</div>
                ) : (
                  <div className="selection-sections">
                    {[
                      { title: 'Org (Users)', list: users.org },
                      { title: 'Teams', list: users.teams },
                    ].map(({ title, list }) => (
                      <div key={title} className="selection-section">
                        <h4 className="section-title">{title}</h4>
                        <div className="user-selection-list">
                          {list.length === 0 ? (
                            <div className="empty-section">No {title.toLowerCase()} available</div>
                          ) : (
                            list.map(u => (
                              <div
                                key={u.id}
                                className={`user-selection-item ${selectedUserIds.includes(u.id) ? 'selected' : ''}`}
                                onClick={() => toggleUserSelection(u.id)}
                              >
                                <span className="user-name">{u.display_name || u.username || u.email}</span>
                                <span className="user-id-small">{u.id.substring(0, 8)}...</span>
                              </div>
                            ))
                          )}
                        </div>
                      </div>
                    ))}
                  </div>
                )}
              </div>
            </div>
          )}

          <div className="form-section">
            <label className="form-label" htmlFor="notif-title">Title (Optional)</label>
            <input
              id="notif-title" type="text"
              placeholder="e.g. Tournament Update"
              value={title} onChange={(e) => setTitle(e.target.value)}
              className="notif-input"
            />
          </div>

          <div className="form-section">
            <label className="form-label" htmlFor="notif-message">Message Body</label>
            <textarea
              id="notif-message"
              placeholder="Enter your message here..."
              value={message} onChange={(e) => setMessage(e.target.value)}
              className="notif-textarea" rows="4" required
            ></textarea>
          </div>

          {status.message && (
            <div className={`notification-status ${status.type}`}>
              {status.type === 'success' ? <CheckCircle2 size={16} /> : <XCircle size={16} />}
              <div className="status-content">
                {status.message}
                {status.type === 'error' && status.message.includes('not reachable') && (
                  <div className="error-hint">
                    Make sure your API server is running and accessible at the same origin or configured via proxy.
                  </div>
                )}
              </div>
            </div>
          )}

          <button
            type="submit" className="send-button"
            disabled={sending || (recipientType === 'specific' && selectedUserIds.length === 0) || !message.trim()}
          >
            {sending
              ? <><RefreshCcw size={18} className="spin" /> Sending...</>
              : <><Send size={18} /> Send Notification</>
            }
          </button>
        </form>

        <div className="notification-preview">
          <h3>Live Preview</h3>
          <div className="phone-preview">
            <div className="phone-screen">
              <div className="notification-bubble">
                <div className="app-info">
                  <div className="app-icon">{getPreviewAppName() === 'LazarFlow Teams' ? 'LT' : 'LF'}</div>
                  <span className="app-name">{getPreviewAppName()}</span>
                  <span className="notif-time">now</span>
                </div>
                <div className="notif-content">
                  <div className="notif-title-preview">{title || 'Notification Title'}</div>
                  <div className="notif-message-preview">{message || 'Your message will appear here...'}</div>
                </div>
              </div>
            </div>
          </div>
          <div className="preview-hint"><Info size={14} /> This is how the notification will appear on user devices.</div>
        </div>
      </div>

      <div className="activity-logs-section">
        <div className="logs-header">
          <h3>Recent Activity Logs</h3>
          <button className="clear-logs-btn" onClick={() => setActivityLogs([])}>Clear Logs</button>
        </div>
        <div className="logs-container">
          {activityLogs.length === 0 ? (
            <div className="empty-logs">No recent activity logs</div>
          ) : (
            activityLogs.map(log => (
              <div key={log.id} className={`log-entry log-${log.type}`}>
                <span className="log-timestamp">[{log.timestamp}]</span>
                <span className="log-type">{log.type.toUpperCase()}:</span>
                <span className="log-message">{log.message}</span>
                {log.details && (
                  <pre className="log-details">
                    {typeof log.details === 'object' ? JSON.stringify(log.details, null, 2) : log.details}
                  </pre>
                )}
              </div>
            ))
          )}
        </div>
      </div>
    </div>
  )
}

export default NotificationsView
