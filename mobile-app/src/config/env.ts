const rawApiBaseUrl = process.env.EXPO_PUBLIC_API_BASE_URL;

export const ENV = {
  API_BASE_URL: rawApiBaseUrl && rawApiBaseUrl.trim().length > 0
    ? rawApiBaseUrl
    : 'https://siskgb2.id/api',
};

