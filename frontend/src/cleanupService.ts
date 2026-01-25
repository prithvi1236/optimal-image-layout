/**
 * User Data Cleanup Service
 * Handles automatic cleanup, manual deletion, and activity tracking
 */

import { supabase } from './Components/supabaseClient';
import type { UserActivityStatus } from './types';

const API_URL = import.meta.env.VITE_API_URL;
const ACTIVITY_PING_INTERVAL = 5 * 60 * 1000; // 5 minutes
const INACTIVITY_WARNING_TIME = 50 * 60 * 1000; // 50 minutes (10 min before cleanup)

export class CleanupService {
  private activityTimer: number | null = null;
  private warningTimer: number | null = null;
  private onInactivityWarning?: () => void;
  private onDataCleanup?: () => void;

  constructor() {
    this.startActivityTracking();
    this.setupBeforeUnloadHandler();
  }

  /**
   * Set callback for inactivity warning (50 minutes)
   */
  setInactivityWarningCallback(callback: () => void) {
    this.onInactivityWarning = callback;
  }

  /**
   * Set callback for when data gets cleaned up
   */
  setDataCleanupCallback(callback: () => void) {
    this.onDataCleanup = callback;
  }

  /**
   * Start automatic activity tracking
   */
  private startActivityTracking() {
    // Send ping every 5 minutes to keep session active
    this.activityTimer = window.setInterval(() => {
      this.pingActivity();
    }, ACTIVITY_PING_INTERVAL);

    // Set warning timer for 50 minutes
    this.warningTimer = window.setTimeout(() => {
      this.showInactivityWarning();
    }, INACTIVITY_WARNING_TIME);

    // Initial ping
    this.pingActivity();
  }

  /**
   * Stop activity tracking
   */
  private stopActivityTracking() {
    if (this.activityTimer) {
      window.clearInterval(this.activityTimer);
      this.activityTimer = null;
    }
    if (this.warningTimer) {
      window.clearTimeout(this.warningTimer);
      this.warningTimer = null;
    }
  }

  /**
   * Reset activity timers (call when user interacts)
   */
  resetActivityTimer() {
    // Clear existing warning timer
    if (this.warningTimer) {
      window.clearTimeout(this.warningTimer);
    }

    // Set new warning timer
    this.warningTimer = window.setTimeout(() => {
      this.showInactivityWarning();
    }, INACTIVITY_WARNING_TIME);

    // Send activity ping
    this.pingActivity();
  }

  /**
   * Send activity ping to backend
   */
  private async pingActivity() {
    try {
      const { data: { session } } = await supabase.auth.getSession();
      if (!session) return;

      const response = await fetch(`${API_URL}/ping`, {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          'Authorization': `Bearer ${session.access_token}`
        }
      });

      if (!response.ok) {
        console.warn('Failed to ping activity:', response.statusText);
      }
    } catch (error) {
      console.warn('Error pinging activity:', error);
    }
  }

  /**
   * Show inactivity warning
   */
  private showInactivityWarning() {
    if (this.onInactivityWarning) {
      this.onInactivityWarning();
    } else {
      // Default warning
      const shouldStay = confirm(
        'You\'ve been inactive for 50 minutes. Your data will be automatically deleted in 10 minutes due to inactivity. Click OK to stay active or Cancel to logout now.'
      );
      
      if (shouldStay) {
        this.resetActivityTimer();
      } else {
        this.handleLogout();
      }
    }
  }

  /**
   * Clear all localStorage data
   */
  private clearLocalStorage() {
    try {
      localStorage.removeItem('layout-assets');
      localStorage.removeItem('layout-images');
      localStorage.removeItem('layout-page-count');
    } catch (error) {
      console.warn('Error clearing localStorage:', error);
    }
  }

  /**
   * Handle user logout with data cleanup
   */
  async handleLogout(): Promise<boolean> {
    try {
      const { data: { session } } = await supabase.auth.getSession();
      if (!session) return true;

      // Call backend logout endpoint to cleanup data
      const response = await fetch(`${API_URL}/logout`, {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          'Authorization': `Bearer ${session.access_token}`
        }
      });

      if (!response.ok) {
        console.warn('Backend cleanup failed:', response.statusText);
      }

      // Sign out from Supabase
      await supabase.auth.signOut();
      
      // Clear localStorage
      this.clearLocalStorage();
      
      // Stop activity tracking
      this.stopActivityTracking();

      // Notify callback
      if (this.onDataCleanup) {
        this.onDataCleanup();
      }

      return true;
    } catch (error) {
      console.error('Error during logout:', error);
      return false;
    }
  }

  /**
   * Delete all user data (dustbin button)
   */
  async deleteAllData(): Promise<boolean> {
    try {
      const { data: { session } } = await supabase.auth.getSession();
      if (!session) return false;

      const confirmed = confirm(
        'Are you sure you want to delete all your data? This action cannot be undone.'
      );

      if (!confirmed) return false;

      // Call backend delete endpoint
      const response = await fetch(`${API_URL}/delete_all_data`, {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          'Authorization': `Bearer ${session.access_token}`
        }
      });

      if (!response.ok) {
        throw new Error(`Failed to delete data: ${response.statusText}`);
      }

      // Notify callback
      if (this.onDataCleanup) {
        this.onDataCleanup();
      }

      return true;
    } catch (error) {
      console.error('Error deleting all data:', error);
      alert('Failed to delete data. Please try again.');
      return false;
    }
  }

  /**
   * Get user activity status
   */
  async getUserActivityStatus(): Promise<UserActivityStatus | null> {
    try {
      const { data: { session } } = await supabase.auth.getSession();
      if (!session) return null;

      const response = await fetch(`${API_URL}/user_activity`, {
        method: 'GET',
        headers: {
          'Content-Type': 'application/json',
          'Authorization': `Bearer ${session.access_token}`
        }
      });

      if (!response.ok) {
        throw new Error(`Failed to get activity status: ${response.statusText}`);
      }

      return await response.json();
    } catch (error) {
      console.error('Error getting activity status:', error);
      return null;
    }
  }

  /**
   * Setup handler for page unload (browser close/refresh)
   */
  private setupBeforeUnloadHandler() {
    window.addEventListener('beforeunload', () => {
      // Note: We don't cleanup on page refresh/close as user might come back
      // Only cleanup on explicit logout or inactivity
      this.stopActivityTracking();
    });

    // Handle visibility change (tab switching)
    document.addEventListener('visibilitychange', () => {
      if (document.visibilityState === 'visible') {
        // User came back to tab, reset timer
        this.resetActivityTimer();
      }
    });

    // Handle user activity (mouse, keyboard)
    const activityEvents = ['mousedown', 'mousemove', 'keypress', 'scroll', 'touchstart'];
    const throttledReset = this.throttle(() => this.resetActivityTimer(), 30000); // Max once per 30 seconds

    activityEvents.forEach(event => {
      document.addEventListener(event, throttledReset, true);
    });
  }

  /**
   * Throttle function to limit how often activity timer resets
   */
  private throttle(func: Function, limit: number) {
    let inThrottle: boolean;
    return function(this: any, ...args: any[]) {
      if (!inThrottle) {
        func.apply(this, args);
        inThrottle = true;
        window.setTimeout(() => inThrottle = false, limit);
      }
    }
  }

  /**
   * Cleanup service when done
   */
  destroy() {
    this.stopActivityTracking();
  }
}

// Export singleton instance
export const cleanupService = new CleanupService();