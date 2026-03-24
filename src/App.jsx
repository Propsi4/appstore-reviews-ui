import { useState } from 'react';
import { reviewsApi } from './services/api';
import './index.css';

function App() {
  const [appInput, setAppInput] = useState('');
  const [loading, setLoading] = useState(false);
  const [appId, setAppId] = useState(null);
  const [metrics, setMetrics] = useState(null);
  const [reviews, setReviews] = useState([]);
  const [error, setError] = useState(null);

  const handleAnalyze = async (e) => {
    e.preventDefault();
    if (!appInput) return;

    setLoading(true);
    setError(null);
    setMetrics(null);
    setReviews([]);

    try {
      // 1. Try to parse app URL to ID, or assume it's an ID
      let idToUse = appInput;
      if (appInput.includes('apple.com')) {
        const parseRes = await reviewsApi.parseAppUrl(appInput);
        idToUse = parseRes.app_id;
      }
      setAppId(idToUse);

      // 2. Trigger collection
      await reviewsApi.collectReviews(idToUse);

      // 3. Keep polling metrics
      let metricsRes = null;
      let retries = 0;
      let isProcessing = true;
      
      while (isProcessing && retries < 40) { // allow more retries for slow scrapers
        try {
          metricsRes = await reviewsApi.getMetrics(idToUse);
          // If the backend returns a dict with status processing (might fail validation if strict, see catch)
          if (metricsRes.status === 'processing') {
            await new Promise(r => setTimeout(r, 2000));
            retries++;
          } else {
            isProcessing = false; // Got valid metrics!
          }
        } catch (pollingErr) {
          // App not found (404) or Validation Error (500) because processing dict doesn't match AppMetricsResponse
          if (pollingErr.response && (pollingErr.response.status === 404 || pollingErr.response.status === 500)) {
            await new Promise(r => setTimeout(r, 2000));
            retries++;
          } else {
            throw pollingErr; // Unhandled error
          }
        }
      }

      if (metricsRes && metricsRes.status !== 'processing' && !isProcessing) {
        setMetrics(metricsRes);
      } else {
        setError("Analysis is taking longer than expected. The job is running in the background. Please try again later by re-analyzing.");
      }

      // 4. Fetch list of reviews
      const listRes = await reviewsApi.listReviews(idToUse, 1, 20);
      if (listRes.reviews) {
        setReviews(listRes.reviews);
      }

    } catch (err) {
      console.error(err);
      if (err.response && err.response.status >= 400 && err.response.status < 500) {
        // Display the specific error message returned by the backend (e.g., {"detail": "..."})
        const detailMessage = err.response.data?.detail || `Error ${err.response.status}: Request failed.`;
        setError(detailMessage);
      } else {
        setError("An error occurred. Make sure the backend is running and the App ID is valid.");
      }
    } finally {
      setLoading(false);
    }
  };

  const renderStars = (rating) => {
    return "★".repeat(rating) + "☆".repeat(5 - rating);
  };

  return (
    <div className="app-container">
      <header>
        <h1>App Store Analytics</h1>
        <p>AI-Powered Sentiment & Review Analysis</p>
      </header>

      <form className="search-form" onSubmit={handleAnalyze}>
        <input
          type="text"
          className="search-input"
          placeholder="Enter App Store URL or App ID (e.g., id1444628315)"
          value={appInput}
          onChange={(e) => setAppInput(e.target.value)}
        />
        <button type="submit" className="search-button" disabled={loading || !appInput}>
          {loading ? <div className="loader"></div> : 'Analyze'}
        </button>
      </form>

      {error && (
        <div className="glass-panel" style={{ padding: '1rem', color: 'var(--danger)', textAlign: 'center' }}>
          {error}
        </div>
      )}

      {loading && (
        <div className="empty-state">
          <div className="loader loader-large"></div>
          <p>Scraping reviews and running AI analysis... This might take a minute.</p>
        </div>
      )}

      {metrics && !loading && (
        <div className="dashboard-grid">
          {/* Left Column: Metrics & Rating */}
          <div style={{ display: 'flex', flexDirection: 'column', gap: '2rem' }}>
            <div className="glass-panel">
              <div className="card-header">App Metrics</div>
              <div className="card-body">
                <div style={{ textAlign: 'center', marginBottom: '2rem' }}>
                  <div className="metric-value">{metrics.avg_rating?.toFixed(1) || '0.0'}</div>
                  <div className="metric-label">Average Rating</div>
                  <div className="review-rating" style={{ fontSize: '1.5rem', marginTop: '0.5rem' }}>
                    {renderStars(Math.round(metrics.avg_rating || 0))}
                  </div>
                </div>

                <div>
                  <h4 style={{ marginBottom: '1rem', color: 'var(--text-secondary)' }}>Rating Distribution</h4>
                  {[5, 4, 3, 2, 1].map((star) => {
                    const count = metrics.rating_distribution?.[star] || 0;
                    const total = Object.values(metrics.rating_distribution || {}).reduce((a, b) => a + b, 0);
                    const percentage = total > 0 ? (count / total) * 100 : 0;
                    
                    return (
                      <div className="rating-bar-container" key={star}>
                        <div className="rating-bar-label">{star} ★</div>
                        <div className="rating-bar-track">
                          <div className="rating-bar-fill" style={{ width: `${percentage}%` }}></div>
                        </div>
                        <div className="rating-bar-label" style={{ textAlign: 'right' }}>{count}</div>
                      </div>
                    );
                  })}
                </div>
              </div>
            </div>

            <div className="glass-panel">
              <div className="card-header">Negative Keywords</div>
              <div className="card-body">
                {!metrics.top_negative_keywords || metrics.top_negative_keywords.length === 0 ? (
                  <p style={{ color: 'var(--text-secondary)' }}>No negative keywords detected.</p>
                ) : (
                  metrics.top_negative_keywords.map((kw, i) => (
                    <span key={i} className="insight-tag">{kw}</span>
                  ))
                )}
              </div>
            </div>
          </div>

          {/* Right Column: AI Insights & Reviews */}
          <div style={{ display: 'flex', flexDirection: 'column', gap: '2rem' }}>
            <div className="glass-panel">
              <div className="card-header">AI Recommendations</div>
              <div className="card-body">
                {metrics.developer_insights && (
                  <p style={{ marginBottom: '1.5rem', lineHeight: '1.6' }}>
                    <strong style={{ color: 'var(--accent-primary)' }}>Insight: </strong>
                    {metrics.developer_insights}
                  </p>
                )}
                
                <h4 style={{ marginBottom: '1rem', color: 'var(--text-secondary)' }}>Action Plan</h4>
                <ul className="recommendation-list">
                  {metrics.actionable_recommendations?.map((rec, i) => (
                    <li key={i}>{rec}</li>
                  ))}
                  {(!metrics.actionable_recommendations || metrics.actionable_recommendations.length === 0) && (
                    <li style={{ borderLeftColor: 'var(--glass-border)' }}>No actionable recommendations generated.</li>
                  )}
                </ul>
              </div>
            </div>

            <div className="glass-panel">
              <div className="card-header" style={{ display: 'flex', justifyContent: 'space-between' }}>
                <span>Recent Reviews</span>
                <a 
                  href={`http://localhost:8000/reviews/download/${appId}`} 
                  target="_blank" 
                  rel="noreferrer"
                  style={{ fontSize: '0.9rem', color: 'var(--accent-primary)', textDecoration: 'none' }}
                >
                  Download All JSON
                </a>
              </div>
              <div className="reviews-list">
                {reviews.length === 0 ? (
                  <div className="empty-state">No reviews found.</div>
                ) : (
                  reviews.map((r, i) => (
                    <div className="review-item" key={r.id || i}>
                      <div className="review-header">
                        <div className="review-rating">{renderStars(r.rating)}</div>
                        <div className="review-meta">{r.created_at ? new Date(r.created_at).toLocaleDateString() : 'N/A'}</div>
                      </div>
                      <div className="review-title">{r.title}</div>
                      <div className="review-body">{r.content}</div>
                      <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginTop: '0.75rem' }}>
                        <div className="review-meta">By {r.author} (v{r.version})</div>
                        {r.processed_review && r.processed_review.sentiment_label && (
                          <div className={`insight-tag sentiment-${r.processed_review.sentiment_label.toLowerCase()}`} style={{ margin: 0, fontSize: '0.75rem' }}>
                            {r.processed_review.sentiment_label}
                            {r.processed_review.sentiment_score !== null && ` (${r.processed_review.sentiment_score.toFixed(2)})`}
                          </div>
                        )}
                      </div>
                    </div>
                  ))
                )}
              </div>
            </div>
          </div>
        </div>
      )}

      {!metrics && !loading && !error && (
        <div className="empty-state">
          <h3>Ready to Analyze</h3>
          <p>Enter an App Store ID or URL to fetch reviews and generate AI insights.</p>
        </div>
      )}
    </div>
  );
}

export default App;
