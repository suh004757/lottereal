// Simple auth abstraction to decouple UI from concrete auth providers.
export function useAuth() {
  return {
    user: { id: 'mock-user', name: 'Tester' },
    isAuthenticated: true,
    login: async () => {},
    logout: async () => {}
  };
}
