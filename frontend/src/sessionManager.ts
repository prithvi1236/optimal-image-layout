// /**
//  * Session Manager for Anonymous User Sessions
//  * Handles session ID creation, storage, and API integration
//  */

// const SESSION_STORAGE_KEY = 'image_layout_session_id';
// const API_URL = 'http://localhost:5001';

// export class SessionManager {
//   private sessionId: string | null = null;

//   constructor() {
//     this.loadSessionFromStorage();
//   }

//   /**
//    * Load existing session ID from localStorage
//    */
//   private loadSessionFromStorage(): void {
//     try {
//       this.sessionId = localStorage.getItem(SESSION_STORAGE_KEY);
//     } catch (error) {
//       console.warn('Failed to load session from storage:', error);
//       this.sessionId = null;
//     }
//   }

//   /**
//    * Save session ID to localStorage
//    */
//   private saveSessionToStorage(sessionId: string): void {
//     try {
//       localStorage.setItem(SESSION_STORAGE_KEY, sessionId);
//       this.sessionId = sessionId;
//     } catch (error) {
//       console.warn('Failed to save session to storage:', error);
//     }
//   }

//   /**
//    * Create a new session ID from the backend
//    */
//   async createSession(): Promise<string> {
//     try {
//       const response = await fetch(`${API_URL}/session/create`, {
//         method: 'POST',
//         headers: {
//           'Content-Type': 'application/json',
//         },
//       });

//       if (!response.ok) {
//         throw new Error(`Failed to create session: ${response.statusText}`);
//       }

//       const data = await response.json();
//       const sessionId = data.session_id;

//       this.saveSessionToStorage(sessionId);
//       return sessionId;
//     } catch (error) {
//       console.error('Error creating session:', error);
//       throw error;
//     }
//   }

//   /**
//    * Get current session ID, creating one if needed
//    */
//   async getSessionId(): Promise<string> {
//     if (!this.sessionId || !this.isValidSessionId(this.sessionId)) {
//       this.sessionId = await this.createSession();
//     }
//     return this.sessionId;
//   }

//   /**
//    * Validate session ID format (UUID)
//    */
//   private isValidSessionId(sessionId: string): boolean {
//     const uuidRegex = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;
//     return uuidRegex.test(sessionId);
//   }

//   /**
//    * Get session headers for API requests
//    */
//   async getSessionHeaders(): Promise<Record<string, string>> {
//     const sessionId = await this.getSessionId();
//     return {
//       'X-Session-Id': sessionId,
//     };
//   }

//   /**
//    * Get session information from backend
//    */
//   async getSessionInfo(): Promise<{
//     session_id: string;
//     image_count: number;
//     max_images: number;
//     remaining_images: number;
//   }> {
//     const headers = await this.getSessionHeaders();
    
//     const response = await fetch(`${API_URL}/session/info`, {
//       method: 'GET',
//       headers: {
//         'Content-Type': 'application/json',
//         ...headers,
//       },
//     });

//     if (!response.ok) {
//       throw new Error(`Failed to get session info: ${response.statusText}`);
//     }

//     return response.json();
//   }

//   /**
//    * Clear current session (useful for testing or reset)
//    */
//   clearSession(): void {
//     try {
//       localStorage.removeItem(SESSION_STORAGE_KEY);
//       this.sessionId = null;
//     } catch (error) {
//       console.warn('Failed to clear session from storage:', error);
//     }
//   }

//   /**
//    * Make an API request with session headers
//    */
//   async apiRequest(url: string, options: RequestInit = {}): Promise<Response> {
//     const headers = await this.getSessionHeaders();
    
//     return fetch(url, {
//       ...options,
//       headers: {
//         'Content-Type': 'application/json',
//         ...headers,
//         ...options.headers,
//       },
//     });
//   }
// }

// // Export singleton instance
// export const sessionManager = new SessionManager();