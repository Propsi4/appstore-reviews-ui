import axios from 'axios';

const api = axios.create({
  baseURL: 'http://localhost:8000', // Assuming the FastAPI backend runs on 8000
  headers: {
    'Content-Type': 'application/json',
  },
});

export const reviewsApi = {
  // Trigger collection of reviews
  collectReviews: async (appId) => {
    const response = await api.post(`/reviews/collect/${appId}`);
    return response.data;
  },

  // Parse an App Store URL to get the App ID
  parseAppUrl: async (url) => {
    const response = await api.get(`/reviews/parse-url`, { params: { url } });
    return response.data;
  },

  // Get aggregated metrics and insights
  getMetrics: async (appId) => {
    const response = await api.get(`/reviews/metrics/${appId}`);
    return response.data;
  },

  // List paginated reviews
  listReviews: async (appId, page = 1, limit = 50) => {
    const response = await api.get(`/reviews/list/${appId}`, { params: { page, limit } });
    return response.data;
  },
};

export default api;
