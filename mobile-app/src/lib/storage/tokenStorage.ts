import * as SecureStore from 'expo-secure-store';

const ACCESS_TOKEN_KEY = 'sis_access_token';
const REFRESH_TOKEN_KEY = 'sis_refresh_token';

export const tokenStorage = {
  async getAccessToken() {
    return SecureStore.getItemAsync(ACCESS_TOKEN_KEY);
  },
  async setAccessToken(token: string) {
    return SecureStore.setItemAsync(ACCESS_TOKEN_KEY, token);
  },
  async clearAccessToken() {
    return SecureStore.deleteItemAsync(ACCESS_TOKEN_KEY);
  },
  async getRefreshToken() {
    return SecureStore.getItemAsync(REFRESH_TOKEN_KEY);
  },
  async setRefreshToken(token: string) {
    return SecureStore.setItemAsync(REFRESH_TOKEN_KEY, token);
  },
  async clearRefreshToken() {
    return SecureStore.deleteItemAsync(REFRESH_TOKEN_KEY);
  },
  async clearAll() {
    await Promise.all([
      SecureStore.deleteItemAsync(ACCESS_TOKEN_KEY),
      SecureStore.deleteItemAsync(REFRESH_TOKEN_KEY),
    ]);
  },
};

